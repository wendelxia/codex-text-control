import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { registerTextControlWidget } from "../mcp/widget-resource.mjs";

const WIDGET_URI = "ui://widget/codex-text-control/editor.html";

// 这项测试检查 MCP Apps（MCP 应用）协议边界，而不是只检查后端函数能不能单独运行。
// 原因很直接：编辑器里的按钮通过应用桥接调用工具；工具没有声明“应用可调用”时，
// 后端即使全绿，真实按钮仍可能被 Codex 宿主拒绝。
test("保存和提交工具明确允许上下文编辑器调用", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-contract-test", version: "0.2.1" });
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

// 这项测试必须读取 MCP 真正返回给宿主的完整 HTML，再解析其中的 SDK 脚本。
// 只测试 createWidgetBridge 函数会漏掉“把第三方脚本拼进 HTML 时被字符串替换规则改坏”的故障。
test("MCP 返回的 Widget SDK 脚本保持完整且可执行解析", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-resource-test", version: "0.2.1" });
  await client.connect(transport);

  try {
    const resource = await client.readResource({ uri: WIDGET_URI });
    const html = resource.contents?.[0]?.text || "";
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.ok(scripts.length >= 3, "Widget 应包含 SDK、桥接和编辑器三段脚本。\n");
    assert.doesNotThrow(
      () => new vm.Script(scripts[0], { filename: "codex-text-control-sdk.js" }),
      "注入后的 MCP Apps SDK 脚本必须保持合法 JavaScript。\n",
    );
    assert.match(scripts[0], /globalThis\.__CTC_APPS__=\{App:/, "SDK 脚本必须暴露 App 构造器。\n");

    // 插件升级会回收旧缓存目录，但已经启动的 MCP 进程可能暂时继续运行。
    // 资源必须在注册时进入内存；否则旧进程会在用户打开编辑器时才读文件并报 ENOENT（文件不存在）。
    let resourceReader;
    let sourceAvailable = true;
    let sourceReadCount = 0;
    const fakeServer = {
      registerResource(_name, _uri, _config, reader) {
        resourceReader = reader;
        return {};
      },
    };
    await registerTextControlWidget(fakeServer, {
      uri: WIDGET_URI,
      html: async () => {
        sourceReadCount += 1;
        if (!sourceAvailable) {
          const error = new Error("ENOENT: 模拟插件缓存已被回收");
          error.code = "ENOENT";
          throw error;
        }
        return "<!doctype html><html><head></head><body>启动快照</body></html>";
      },
    });
    assert.equal(sourceReadCount, 1, "Widget HTML 必须在资源注册时读取一次。\n");
    sourceAvailable = false;
    const snapshotted = await resourceReader();
    assert.match(snapshotted.contents?.[0]?.text || "", /启动快照/);
    assert.equal(sourceReadCount, 1, "resources/read 不得再次访问可能已被回收的插件安装目录。\n");
  } finally {
    await client.close();
  }
});
