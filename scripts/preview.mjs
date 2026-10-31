import http from "node:http";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readEditorHtml } from "../mcp/widget-resource.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = resolve(process.env.CTC_PREVIEW_PROJECT || resolve(root, "artifacts/inline-preview"));
const token = randomBytes(24).toString("hex");
const client = new Client({ name: "inline-reply-preview", version: "0.6.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(root, "scripts/start-mcp.mjs")], cwd: root }));
const allowed = new Set(["save_context_draft", "discard_context_draft", "update_authoritative_context", "get_authoritative_context"]);
const sample = "这段回复可以直接修改。\n\n点击任意一句话，就能在原处改字。段落、**重点**和列表会保留排版；完成后点保存，或按 `Ctrl + Enter`。\n\n- 正常阅读时，只看到正文。\n- 编辑时，只出现保存和取消。\n- 保存后，下次打开仍是你修改后的版本。\n\n| 内容 | 现在的操作 |\n| :--- | :--- |\n| 一句话 | 直接点进去修改 |\n| 表格 | 在单元格里改字 |\n| 这次修改 | 保存，或取消恢复 |\n\n你可以先把“直接修改”改成自己更喜欢的说法。";
const asScript = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
let origin;

const server = http.createServer(async (request, response) => {
  const json = (status, value) => { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
  try {
    if (request.headers.host !== new URL(origin).host) return json(403, { error: "Invalid host" });
    if (request.method === "GET" && request.url === "/") {
      const current = await client.callTool({ name: "get_authoritative_context", arguments: { projectDir } });
      const rendered = await client.callTool({ name: "render_text_control_widget", arguments: { projectDir, ...(!current.structuredContent?.current ? { sourceText: sample } : {}) } });
      if (rendered.isError) throw new Error(rendered.content?.[0]?.text || "Preview initialization failed");
      const widgetData = rendered._meta?.widgetData || rendered.structuredContent;
      const adapter = `<script>
        window.openai={toolOutput:${asScript(widgetData)},codexTextControlBridgeStatus:{state:"ready"}};
        window.codexTextControlMcp={
          async callServerTool(request){const response=await fetch('/tool',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Token':${asScript(token)}},body:JSON.stringify(request)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;},
          async sendFollowUpMessage(){document.getElementById('preview-status').textContent='已保存到独立试用目录；此预览不会向当前聊天发消息。';return {};}
        };
      </script>`;
      const context = '<aside id="preview-status">本地试用 · 点击正文直接修改 · 保存使用真实 MCP 后端</aside>';
      const css = '<style>body{max-width:760px;margin:0 auto;padding:40px 24px;background:#fff}#preview-status{font:12px/1.6 system-ui;color:#737373;margin-bottom:32px} @media(prefers-color-scheme:dark){body{background:#171717}} @media(max-width:480px){body{padding:24px 16px}}</style>';
      const html = readEditorHtml().replace("</head>", `${css}${adapter}</head>`).replace("<body>", `<body>${context}`);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(html); return;
    }
    if (request.method === "POST" && request.url === "/tool") {
      if (request.headers.origin !== origin || request.headers["x-preview-token"] !== token) return json(403, { error: "Preview request rejected" });
      request.setEncoding("utf8");
      let body = "";
      for await (const chunk of request) { body += chunk.toString(); if (body.length > 2_000_000) return json(413, { error: "Content too large" }); }
      const call = JSON.parse(body);
      if (!allowed.has(call.name)) return json(403, { error: "Tool not available in preview" });
      const result = await client.callTool({ name: call.name, arguments: { ...call.arguments, projectDir } });
      return json(200, result);
    }
    json(404, { error: "Not found" });
  } catch (error) { json(500, { error: error.message }); }
});
server.listen(Number(process.env.CTC_PREVIEW_PORT) || 0, "127.0.0.1", () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  process.stdout.write(JSON.stringify({ url: origin, projectDir }) + "\n");
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { server.close(); await client.close(); process.exit(0); });
