import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WIDGET_URI = "ui://widget/codex-text-control/editor.html";

// 这项测试检查 MCP Apps（MCP 应用）协议边界，而不是只检查后端函数能不能单独运行。
// 原因很直接：编辑器里的按钮通过应用桥接调用工具；工具没有声明“应用可调用”时，
// 后端即使全绿，真实按钮仍可能被 Codex 宿主拒绝。
test("保存和提交工具明确允许上下文编辑器调用", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-contract-test", version: "0.2.0" });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const render = tools.find((candidate) => candidate.name === "render_text_control_widget");
    assert.ok(render, "缺少打开编辑器工具。\n");
    assert.deepEqual(render._meta?.ui?.visibility, ["model"], "打开编辑器工具应只由模型调用。\n");
    for (const name of ["save_text_revision", "commit_authoritative_context"]) {
      const tool = tools.find((candidate) => candidate.name === name);
      assert.ok(tool, `缺少工具：${name}`);
      assert.equal(tool._meta?.ui?.resourceUri, WIDGET_URI);
      assert.deepEqual(tool._meta?.ui?.visibility, ["app"], `${name} 应只允许应用调用。`);
      assert.equal(tool._meta?.["openai/widgetAccessible"], true);
    }
  } finally {
    await client.close();
  }
});
