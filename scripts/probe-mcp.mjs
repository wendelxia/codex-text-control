import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-probe-"));
const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
const client = new Client({ name: "codex-text-control-probe", version: "0.5.7" });
await client.connect(transport);
try {
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const required of ["render_text_control_widget", "save_text_revision", "save_context_extension_revision", "update_authoritative_context", "list_text_revisions", "commit_authoritative_context", "get_authoritative_context"]) {
    if (!names.includes(required)) throw new Error(`缺少工具：${required}`);
  }
  const render = await client.callTool({ name: "render_text_control_widget", arguments: { projectDir, sourceText: "探测文本" } });
  if (render._meta?.["openai/outputTemplate"] !== "ui://widget/codex-text-control/editor.html") throw new Error("render 工具没有返回正确的 widget 模板。");
  const baseContent = "固定开头\n【AI扩展点：探测】\n旧内容\n【/AI扩展点】\n固定结尾";
  const saved = await client.callTool({ name: "save_text_revision", arguments: { projectDir, content: baseContent } });
  const revisionId = saved.structuredContent?.revision?.id;
  if (!revisionId) throw new Error("save 工具没有返回修订版本编号。");
  const committed = await client.callTool({ name: "commit_authoritative_context", arguments: { projectDir, revisionId } });
  if (!committed.structuredContent?.followUpMessage?.includes(revisionId)) throw new Error("commit 工具没有返回可追踪的 followUpMessage。");
  const extensionRender = await client.callTool({
    name: "render_text_control_widget",
    arguments: { projectDir, extensionPoint: "探测", extensionText: "扩展后的内容" },
  });
  if (extensionRender.structuredContent?.mode !== "extension") throw new Error("render 工具没有进入扩展点模式。");
  if (extensionRender.structuredContent?.sourceText !== "扩展后的内容") throw new Error("render 工具没有只返回扩展点草稿。");
  const extended = await client.callTool({
    name: "save_context_extension_revision",
    arguments: { projectDir, baseRevisionId: revisionId, extensionPoint: "探测", extensionContent: "扩展后的内容" },
  });
  const extendedRevisionId = extended.structuredContent?.revision?.id;
  if (!extendedRevisionId) throw new Error("扩展点保存工具没有返回修订版本编号。");
  await client.callTool({
    name: "commit_authoritative_context",
    arguments: { projectDir, revisionId: extendedRevisionId, expectedCurrentRevisionId: revisionId },
  });
  const canvasContent = "画布正文\n\n| 项目 | 状态 |\n| --- | --- |\n| 真实闭环 | 待验收 |";
  const canvasUpdated = await client.callTool({
    name: "update_authoritative_context",
    arguments: { projectDir, content: canvasContent, expectedCurrentRevisionId: extendedRevisionId },
  });
  const canvasRevisionId = canvasUpdated.structuredContent?.revision?.id;
  if (!canvasRevisionId) throw new Error("画布更新工具没有返回修订版本编号。");
  if (canvasUpdated.structuredContent?.followUpMessage?.includes(canvasContent)) throw new Error("画布版本通知不应重复完整正文。");
  const current = await client.callTool({ name: "get_authoritative_context", arguments: { projectDir } });
  const expected = "固定开头\n【AI扩展点：探测】\n扩展后的内容\n【/AI扩展点】\n固定结尾";
  if (extended.structuredContent?.revision?.content !== expected) throw new Error("扩展点保存后的完整正文不正确。");
  if (current.structuredContent?.current?.content !== canvasContent) throw new Error("画布更新后读取权威上下文失败。");
  const resource = await client.readResource({ uri: "ui://widget/codex-text-control/editor.html" });
  const html = resource.contents?.[0]?.text || "";
  if (!html.includes("Codex 上下文画布") || !html.includes("CodexCanvasModel") || !html.includes("codexTextControlMcp")) throw new Error("widget 资源缺少画布、模型或桥接代码。");
  const pointer = JSON.parse(await readFile(join(projectDir, ".codex-text-control", "current.json"), "utf8"));
  if (pointer.revisionId !== canvasRevisionId) throw new Error("current.json 指针不正确。");
  console.log("OK: Codex Text Control MCP 工具、上下文画布、表格、扩展点和权威上下文闭环可用。");
} finally {
  await client.close();
}
