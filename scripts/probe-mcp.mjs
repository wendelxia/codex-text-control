import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-probe-"));
const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
const client = new Client({ name: "codex-text-control-probe", version: "0.2.1" });
await client.connect(transport);
try {
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const required of ["render_text_control_widget", "save_text_revision", "list_text_revisions", "commit_authoritative_context", "get_authoritative_context"]) {
    if (!names.includes(required)) throw new Error(`缺少工具：${required}`);
  }
  const render = await client.callTool({ name: "render_text_control_widget", arguments: { projectDir, sourceText: "探测文本" } });
  if (render._meta?.["openai/outputTemplate"] !== "ui://widget/codex-text-control/editor.html") throw new Error("render 工具没有返回正确的 widget 模板。");
  const saved = await client.callTool({ name: "save_text_revision", arguments: { projectDir, content: "探测文本", note: "MCP 探测" } });
  const revisionId = saved.structuredContent?.revision?.id;
  if (!revisionId) throw new Error("save 工具没有返回修订版本编号。");
  const committed = await client.callTool({ name: "commit_authoritative_context", arguments: { projectDir, revisionId } });
  if (!committed.structuredContent?.followUpMessage?.includes(revisionId)) throw new Error("commit 工具没有返回可追踪的 followUpMessage。");
  const current = await client.callTool({ name: "get_authoritative_context", arguments: { projectDir } });
  if (current.structuredContent?.current?.content !== "探测文本") throw new Error("读取权威上下文失败。");
  const resource = await client.readResource({ uri: "ui://widget/codex-text-control/editor.html" });
  const html = resource.contents?.[0]?.text || "";
  if (!html.includes("Codex 上下文编辑器") || !html.includes("codexTextControlMcp")) throw new Error("widget 资源缺少界面或桥接代码。");
  const pointer = JSON.parse(await readFile(join(projectDir, ".codex-text-control", "current.json"), "utf8"));
  if (pointer.revisionId !== revisionId) throw new Error("current.json 指针不正确。");
  console.log("OK: Codex Text Control MCP 工具、widget 和权威上下文闭环可用。");
} finally {
  await client.close();
}
