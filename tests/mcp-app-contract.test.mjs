import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { registerTextControlWidget } from "../mcp/widget-resource.mjs";

const WIDGET_URI = "ui://widget/codex-text-control/editor.html";

test("发布版本在包、锁文件、插件、MCP、README 和变更记录中保持一致", async () => {
  const [packageText, lockText, manifestText, serverSource, widgetSource, readme, changelog] = await Promise.all([
    readFile(join(process.cwd(), "package.json"), "utf8"),
    readFile(join(process.cwd(), "package-lock.json"), "utf8"),
    readFile(join(process.cwd(), ".codex-plugin", "plugin.json"), "utf8"),
    readFile(join(process.cwd(), "mcp", "server.mjs"), "utf8"),
    readFile(join(process.cwd(), "mcp", "widget-resource.mjs"), "utf8"),
    readFile(join(process.cwd(), "README.md"), "utf8"),
    readFile(join(process.cwd(), "CHANGELOG.md"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const manifest = JSON.parse(manifestText);
  const version = packageJson.version;
  assert.equal(lock.version, version);
  assert.equal(lock.packages[""].version, version);
  assert.equal(manifest.version.split("+")[0], version);
  assert.match(serverSource, new RegExp(`version: ["']${version.replaceAll(".", "\\.")}["']`));
  assert.match(widgetSource, new RegExp(`appVersion = ["']${version.replaceAll(".", "\\.")}["']`));
  assert.match(readme, new RegExp(`version-${version.replaceAll(".", "\\.")}`));
  assert.match(readme, new RegExp("当前状态：`" + version.replaceAll(".", "\\.") + "`"));
  assert.match(readme, /连续正文编辑/);
  assert.match(changelog, new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"));
  assert.match(manifest.description, /连续 Markdown/);
  assert.match(serverSource, /连续 Markdown 正文/);
  assert.match(widgetSource, /连续正文编辑器/);
});

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
    for (const name of ["save_text_revision", "save_context_extension_revision", "commit_authoritative_context", "update_authoritative_context"]) {
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

test("MCP 工具拒绝缺少项目目录，不能退回插件安装缓存", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-project-boundary-test", version: "0.5.7" });
  await client.connect(transport);

  try {
    const rendered = await client.callTool({ name: "render_text_control_widget", arguments: { sourceText: "短建议" } });
    assert.equal(rendered.isError, true);
    assert.match(rendered.content?.[0]?.text || "", /projectDir/);
  } finally {
    await client.close();
  }
});

test("新项目没有候选正文时拒绝打开空画布", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-empty-render-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-empty-render-test", version: "0.5.8" });
  await client.connect(transport);

  try {
    const omitted = await client.callTool({
      name: "render_text_control_widget",
      arguments: { projectDir, title: "AI Worker 规格" },
    });
    assert.equal(omitted.isError, true);
    assert.match(omitted.content?.[0]?.text || "", /sourceText|候选正文/);

    const whitespace = await client.callTool({
      name: "render_text_control_widget",
      arguments: { projectDir, sourceText: " \n\t " },
    });
    assert.equal(whitespace.isError, true);
    assert.match(whitespace.content?.[0]?.text || "", /sourceText|候选正文/);
  } finally {
    await client.close();
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("已有权威正文时可以省略候选正文直接打开画布", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-current-render-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-current-render-test", version: "0.5.8" });
  await client.connect(transport);

  try {
    const content = "已有权威正文";
    await client.callTool({
      name: "update_authoritative_context",
      arguments: { projectDir, content, expectedCurrentRevisionId: null },
    });
    const rendered = await client.callTool({
      name: "render_text_control_widget",
      arguments: { projectDir },
    });
    assert.notEqual(rendered.isError, true);
    assert.equal(rendered.structuredContent?.sourceText, content);
  } finally {
    await client.close();
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("新项目提供非空候选正文时正常打开画布", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-draft-render-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-draft-render-test", version: "0.5.8" });
  await client.connect(transport);

  try {
    const sourceText = "完整的 AI Worker 候选规格";
    const rendered = await client.callTool({
      name: "render_text_control_widget",
      arguments: { projectDir, sourceText, title: "AI Worker 规格" },
    });
    assert.notEqual(rendered.isError, true);
    assert.equal(rendered.structuredContent?.sourceText, sourceText);
  } finally {
    await client.close();
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("画布原子更新返回简短版本通知，不再把全文复制进对话", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-canvas-contract-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-canvas-test", version: "0.5.7" });
  await client.connect(transport);

  try {
    const secretBody = "只存在于权威上下文中的完整正文";
    const updated = await client.callTool({
      name: "update_authoritative_context",
      arguments: { projectDir, content: secretBody, expectedCurrentRevisionId: null },
    });
    const revision = updated.structuredContent?.revision;
    const followUpMessage = updated.structuredContent?.followUpMessage || "";
    assert.equal(revision.content, secretBody);
    assert.match(followUpMessage, /上下文画布已更新/);
    assert.match(followUpMessage, /正文不在聊天中重复/);
    assert.match(followUpMessage, new RegExp(revision.id));
    assert.doesNotMatch(followUpMessage, new RegExp(secretBody));

    const current = await client.callTool({ name: "get_authoritative_context", arguments: { projectDir } });
    assert.equal(current.structuredContent?.current?.id, revision.id);
  } finally {
    await client.close();
  }
});

test("扩展点模式只向 Widget 提供块内草稿和受限保存基准", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-extension-contract-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "codex-text-control-extension-test", version: "0.3.0" });
  await client.connect(transport);

  try {
    const content = "固定\n【AI扩展点：补充】\n旧内容\n【/AI扩展点】\n结尾";
    const saved = await client.callTool({ name: "save_text_revision", arguments: { projectDir, content } });
    const revisionId = saved.structuredContent?.revision?.id;
    await client.callTool({ name: "commit_authoritative_context", arguments: { projectDir, revisionId } });

    const rendered = await client.callTool({
      name: "render_text_control_widget",
      arguments: { projectDir, extensionPoint: "补充", extensionText: "AI 建议" },
    });
    assert.equal(rendered.structuredContent?.mode, "extension");
    assert.equal(rendered.structuredContent?.sourceText, "AI 建议");
    assert.deepEqual(rendered.structuredContent?.extension, {
      name: "补充",
      baseRevisionId: revisionId,
      currentContent: "旧内容",
    });
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
