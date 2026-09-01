import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.hidden = false;
    this.className = "";
    this.type = "";
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.innerHtmlWrites = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focused = false;
    this.open = false;
    this.parentElement = null;
    this.scrollHeight = 36;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      await listener({ type, target: this, preventDefault() {}, ...event });
    }
  }

  append(...children) {
    for (const child of children) if (child && typeof child === "object") child.parentElement = this;
    this.children.push(...children);
  }

  appendChild(child) {
    if (child && typeof child === "object") child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of children) if (child && typeof child === "object") child.parentElement = this;
    this.children = [...children];
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  querySelectorAll() { return []; }
  set innerHTML(_value) { this.innerHtmlWrites += 1; }
  get innerHTML() { return ""; }
  allText() { return [this.textContent, ...this.children.map((child) => child.allText?.() || child.textContent || "")].join(" "); }
}

class FakeDocument {
  constructor() {
    this.title = "Codex 上下文画布";
    this.elements = new Map();
    const ids = [
      "page-title", "status", "editor-label", "editor", "canvas", "canvas-view", "source-view",
      "canvas-tab", "source-tab", "reset", "finish-editing",
      "review-dialog", "review-content", "review-status", "review-cancel", "review-submit",
      "meta", "history-panel", "history",
    ];
    const tags = { editor: "textarea", "review-dialog": "dialog", "review-content": "pre", "review-cancel": "button", "review-submit": "button" };
    for (const id of ids) this.elements.set(id, new FakeElement(tags[id] || "div", id));
  }
  getElementById(id) { return this.elements.get(id) || null; }
  createElement(tagName) { return new FakeElement(tagName); }
}

class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }
}

async function createHarness({ toolOutput = {}, bridgeState = "ready", callServerTool, sendFollowUpMessage } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const calls = [];
  window.openai = { toolOutput, codexTextControlBridgeStatus: { state: bridgeState } };
  window.__CTC_REQUEST_TIMEOUT_MS__ = 15;
  window.codexTextControlMcp = {
    callServerTool: async (request) => {
      calls.push(request);
      return callServerTool ? callServerTool(request) : { structuredContent: {} };
    },
    sendFollowUpMessage: async (message) => sendFollowUpMessage?.(message),
  };
  const sandbox = {
    window, document, console, setTimeout, clearTimeout, Promise,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(await readFile(join(process.cwd(), "ui", "canvas-model.js"), "utf8"), sandbox);
  window.CodexCanvasModel = sandbox.CodexCanvasModel;
  vm.runInNewContext(await readFile(join(process.cwd(), "ui", "editor.js"), "utf8"), sandbox);
  return { document, window, calls, element: (id) => document.getElementById(id) };
}

function descendants(element) {
  return [element, ...element.children.flatMap((child) => descendants(child))];
}

async function finishThroughReview(harness) {
  await harness.element("finish-editing").emit("click");
  await harness.element("review-submit").emit("click");
}

test("全文编辑器只保留正文编辑与闭环操作，不提供额外结构增项", async () => {
  const html = await readFile(join(process.cwd(), "ui", "editor.html"), "utf8");
  assert.match(html, /id="canvas"/);
  assert.match(html, /id="canvas-tab"/);
  assert.match(html, /id="source-tab"/);
  assert.match(html, /id="finish-editing"/);
  assert.match(html, /id="review-dialog"/);
  assert.match(html, /id="review-content"/);
  assert.match(html, /id="review-cancel"/);
  assert.match(html, /id="review-submit"/);
  assert.match(html, /main\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(html, /#canvas-view,\s*#source-view\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.doesNotMatch(
    html,
    /id="save"|id="commit"|id="sync-now"|id="add-text"|id="add-table"|id="delete-block"|保存修订版本|提交权威上下文|立即保存|\+ 段落|\+ 表格|删除当前块/,
  );
});

test("完成编辑先逐字显示待提交原文，确认前不调用写工具", async () => {
  const content = "# 提交前检查\n\n| 项目 | 状态 |\n| --- | --- |\n| 原文 | 待确认 |";
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "旧正文", revisions: [], current: null },
    callServerTool: async (request) => ({ structuredContent: { revision: { id: "rev-reviewed", content: request.arguments.content } } }),
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = content;
  await harness.element("editor").emit("input");

  await harness.element("finish-editing").emit("click");

  assert.equal(harness.element("review-dialog").open, true);
  assert.equal(harness.element("review-content").textContent, content);
  assert.deepEqual(harness.calls, [], "用户确认前不得保存修订或更新权威指针。");

  await harness.element("review-submit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].arguments.content, content);
});

test("提交前检查返回修改时保留草稿且不调用写工具", async () => {
  const content = "用户还要继续修改的完整原文";
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "旧正文", revisions: [], current: null },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = content;
  await harness.element("editor").emit("input");

  await harness.element("finish-editing").emit("click");
  await harness.element("review-cancel").emit("click");

  assert.equal(harness.element("review-dialog").open, false);
  assert.equal(harness.element("editor").value, content);
  assert.deepEqual(harness.calls, []);
});

test("宿主初始高度很小时，画布仍申请稳定的可读高度", async () => {
  const html = await readFile(join(process.cwd(), "ui", "editor.html"), "utf8");
  const mainRule = html.match(/main\s*\{[^}]*\}/s)?.[0] || "";

  assert.match(mainRule, /height:\s*720px;/);
  assert.doesNotMatch(mainRule, /\b(?:dvh|vh)\b/);
});

test("正文原位编辑不显示横向输入框，只保留非矩形焦点提示", async () => {
  const html = await readFile(join(process.cwd(), "ui", "editor.html"), "utf8");
  assert.match(html, /\.block-input\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;/s);
  assert.match(html, /\.block-input:focus\s*\{[^}]*outline:\s*none;/s);
  assert.doesNotMatch(html, /\.block-input:hover\s*\{[^}]*border-color:/s);
  assert.doesNotMatch(html, /\.canvas-block:focus-within\s*\{[^}]*box-shadow:/s);
  assert.match(html, /\.canvas-block:focus-within::before\s*\{[^}]*width:\s*2px;[^}]*background:\s*var\(--focus\);/s);
  assert.doesNotMatch(html, /button:focus-visible,\s*textarea:focus,\s*input:focus/);
});

test("Markdown 表格在画布中显示为可直接编辑的真实表格", async () => {
  const revision = { id: "rev-table", content: "| 项目 | 状态 |\n| --- | --- |\n| 闭环 | 已通过 |" };
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "| 项目 | 状态 |\n| --- | --- |\n| 闭环 | 待验收 |",
      revisions: [],
      current: null,
    },
    callServerTool: async () => ({ structuredContent: { revision, followUpMessage: "版本：rev-table" } }),
  });
  const nodes = descendants(harness.element("canvas"));
  assert.ok(nodes.some((node) => node.tagName === "TABLE"));
  assert.equal(nodes.some((node) => node.tagName === "BUTTON"), false, "正文表格不应附带增删行列工具。");
  const cell = nodes.find((node) => node.value === "待验收");
  assert.ok(cell, "表格单元格应是可编辑控件。");
  await cell.emit("focus");
  cell.value = "已通过";
  await cell.emit("input");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.length, 0, "表格输入停顿不应产生中间修订。");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls[0].name, "update_authoritative_context");
  assert.match(harness.calls[0].arguments.content, /\| 闭环 \| 已通过 \|/);
});

test("输入停顿和中文组合态不保存，确认提交只保存最终正文一次", async () => {
  const revision = { id: "rev-canvas", number: 1, content: "修改后的正文", source: "widget-canvas" };
  const messages = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原正文", revisions: [], current: null },
    callServerTool: async (request) => {
      if (request.name !== "update_authoritative_context") throw new Error(`不应调用 ${request.name}`);
      return { structuredContent: { revision, committedAt: "2026-08-31T00:00:00.000Z", followUpMessage: "【上下文画布已更新】\n版本：rev-canvas" } };
    },
    sendFollowUpMessage: async (message) => { messages.push(message); },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "yi'j";
  await harness.element("editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 20));
  harness.element("editor").value = revision.content;
  await harness.element("editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(harness.calls, [], "编辑期间不应把输入法中间态写成历史版本。");
  assert.equal(messages.length, 0);
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(harness.calls.map((call) => call.name), ["update_authoritative_context"]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].arguments)), {
    projectDir: "/workspace/demo",
    content: revision.content,
    expectedCurrentRevisionId: null,
  });
  assert.equal(messages.length, 1, "完成编辑只回传一次最新版本。");
  assert.doesNotMatch(JSON.stringify(messages[0]), new RegExp(revision.content));
  assert.match(harness.element("meta").textContent, /rev-canvas/);
});

test("确认提交会先保存正文再回传最新版本", async () => {
  const messages = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原正文", revisions: [], current: null },
    callServerTool: async (request) => ({
      structuredContent: {
        revision: { id: "rev-finish", content: request.arguments.content },
        followUpMessage: "【上下文画布已更新】\n版本：rev-finish",
      },
    }),
    sendFollowUpMessage: async (message) => { messages.push(message); },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "立即完成的正文";
  await harness.element("editor").emit("input");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].arguments.content, "立即完成的正文");
  assert.equal(messages.length, 1);
  assert.match(JSON.stringify(messages[0]), /rev-finish/);
});

test("桥接未连接或项目数据未到达时写操作保持禁用", async () => {
  const connecting = await createHarness({ bridgeState: "connecting" });
  assert.equal(connecting.element("finish-editing").disabled, true);
  assert.match(connecting.element("status").textContent, /连接/);

  const loading = await createHarness({ bridgeState: "ready", toolOutput: {} });
  assert.equal(loading.element("finish-editing").disabled, true);
  assert.match(loading.element("status").textContent, /加载上下文/);
});

test("完成保存永久不返回时按钮恢复，且本地画布内容保留", async () => {
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原文", revisions: [], current: null },
    callServerTool: () => new Promise(() => {}),
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "修改后正文";
  await harness.element("editor").emit("input");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(harness.element("finish-editing").disabled, false);
  assert.equal(harness.element("editor").value, "修改后正文");
  assert.match(harness.element("status").textContent, /超时/);
  assert.match(harness.element("status").textContent, /结果未知/);
});

test("完成保存进行中锁定编辑控件，避免同一会话产生第二个修订", async () => {
  let finishSave;
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原文", revisions: [], current: null },
    callServerTool: async (request) => {
      return new Promise((resolve) => {
        finishSave = () => resolve({ structuredContent: { revision: { id: "rev-only", content: request.arguments.content } } });
      });
    },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "最终修改";
  await harness.element("editor").emit("input");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.element("editor").readOnly, true);

  finishSave();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.element("editor").readOnly, false);
  assert.match(harness.element("meta").textContent, /rev-only/);
});

test("版本通知超时或失败时，不把已保存版本误报成保存失败", async () => {
  for (const failure of [() => new Promise(() => {}), async () => { throw new Error("消息通道不可用"); }]) {
    const revision = { id: "rev-notice", content: "新内容" };
    const harness = await createHarness({
      toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "旧内容", revisions: [], current: null },
      callServerTool: async () => ({ structuredContent: { revision, followUpMessage: "版本：rev-notice" } }),
      sendFollowUpMessage: failure,
    });
    await harness.element("source-tab").emit("click");
    harness.element("editor").value = revision.content;
    await harness.element("editor").emit("input");
    await finishThroughReview(harness);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(harness.element("meta").textContent, /rev-notice/);
    assert.match(harness.element("status").textContent, /已保存/);
  }
});

test("历史和画布内容只按纯文本渲染，不写入 innerHTML", async () => {
  const attack = '<img src=x onerror="globalThis.attacked=true">';
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: attack, revisions: [{ id: attack, number: 1, content: attack }], current: null },
  });
  assert.equal(harness.element("history").innerHtmlWrites, 0);
  assert.equal(harness.element("canvas").innerHtmlWrites, 0);
  assert.match(harness.element("history").allText(), /<img src=x/);
  assert.ok(descendants(harness.element("canvas")).some((node) => node.value === attack));
});

test("标题生效，空正文在完成时拒绝保存", async () => {
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", title: "项目硬性准则", sourceText: "原文", revisions: [], current: null },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "   ";
  await harness.element("editor").emit("input");
  await harness.element("finish-editing").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.element("page-title").textContent, "项目硬性准则");
  assert.equal(harness.document.title, "项目硬性准则");
  assert.equal(harness.calls.length, 0);
  assert.match(harness.element("status").textContent, /不能为空/);
});

test("同一 Widget 的新渲染刷新正文，重复宿主事件不覆盖用户输入", async () => {
  const harness = await createHarness({
    toolOutput: { mode: "full", renderId: "render-1", projectDir: "/workspace/demo", sourceText: "旧请求正文", revisions: [], current: null },
  });
  assert.equal(harness.element("editor").value, "旧请求正文");
  harness.element("editor").value = "旧界面临时输入";
  harness.window.dispatchEvent({
    type: "openai:set_globals",
    detail: { globals: { toolOutput: { mode: "full", renderId: "render-2", projectDir: "/workspace/demo", sourceText: "新请求正文", revisions: [], current: null } } },
  });
  assert.equal(harness.element("editor").value, "新请求正文");
  harness.element("editor").value = "新请求后的用户编辑";
  harness.window.dispatchEvent({
    type: "openai:set_globals",
    detail: { globals: { toolOutput: { mode: "full", renderId: "render-2", projectDir: "/workspace/demo", sourceText: "新请求正文", revisions: [], current: null } } },
  });
  assert.equal(harness.element("editor").value, "新请求后的用户编辑");
});

test("完成更新不发送修改说明字段，未改内容不会调用工具", async () => {
  const current = { id: "rev-current", revisionId: "rev-current", content: "当前正文" };
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: current.content, revisions: [current], current },
    callServerTool: async (request) => { throw new Error(`不应调用 ${request.name}`); },
  });
  await harness.element("finish-editing").emit("click");
  assert.deepEqual(harness.calls, []);

  const changed = { id: "rev-changed", content: "修改正文" };
  const changedHarness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: current.content, revisions: [current], current },
    callServerTool: async () => ({ structuredContent: { revision: changed } }),
  });
  await changedHarness.element("source-tab").emit("click");
  changedHarness.element("editor").value = changed.content;
  await changedHarness.element("editor").emit("input");
  await finishThroughReview(changedHarness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(JSON.stringify(changedHarness.calls[0].arguments)), {
    projectDir: "/workspace/demo",
    content: changed.content,
    expectedCurrentRevisionId: "rev-current",
  });
});

test("扩展点模式只显示块内源码，并在完成时通过受限工具更新", async () => {
  const base = { id: "rev-base", revisionId: "rev-base", content: "固定\n【AI扩展点：发布门槛】\n旧内容\n【/AI扩展点】" };
  const revision = { id: "rev-extension", content: "固定\n【AI扩展点：发布门槛】\nAI 建议更新\n【/AI扩展点】" };
  const harness = await createHarness({
    toolOutput: {
      mode: "extension", projectDir: "/workspace/demo", sourceText: "AI 建议",
      extension: { name: "发布门槛", baseRevisionId: base.id, currentContent: "旧内容" },
      revisions: [base], current: base,
    },
    callServerTool: async (request) => {
      if (request.name === "save_context_extension_revision") return { structuredContent: { revision } };
      if (request.name === "commit_authoritative_context") return { structuredContent: { revision } };
      throw new Error(`不应调用 ${request.name}`);
    },
  });
  assert.equal(harness.element("canvas-view").hidden, true);
  assert.equal(harness.element("source-view").hidden, false);
  assert.equal(harness.element("history-panel").hidden, true);
  harness.element("editor").value = "AI 建议更新";
  await harness.element("editor").emit("input");
  assert.deepEqual(harness.calls, []);
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(harness.calls.map((call) => call.name), ["save_context_extension_revision", "commit_authoritative_context"]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].arguments)), {
    projectDir: "/workspace/demo", baseRevisionId: "rev-base", extensionPoint: "发布门槛", extensionContent: "AI 建议更新",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[1].arguments)), {
    projectDir: "/workspace/demo", revisionId: "rev-extension", expectedCurrentRevisionId: "rev-base",
  });
});

test("扩展点恢复只恢复块内权威内容", async () => {
  const base = { id: "rev-base", content: "完整正文" };
  const harness = await createHarness({
    toolOutput: {
      mode: "extension", projectDir: "/workspace/demo", sourceText: "AI 草稿",
      extension: { name: "补充", baseRevisionId: base.id, currentContent: "权威块内容" }, revisions: [base], current: base,
    },
  });
  harness.element("editor").value = "临时修改";
  await harness.element("reset").emit("click");
  assert.equal(harness.element("editor").value, "权威块内容");
});

test("每次打开画布都会返回新的渲染编号", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "codex-text-control-render-id-"));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["./scripts/start-mcp.mjs"] });
  const client = new Client({ name: "render-id-contract-test", version: "0.5.7" });
  await client.connect(transport);
  try {
    const first = await client.callTool({ name: "render_text_control_widget", arguments: { projectDir, sourceText: "第一轮" } });
    const second = await client.callTool({ name: "render_text_control_widget", arguments: { projectDir, sourceText: "第二轮" } });
    assert.equal(typeof first.structuredContent?.renderId, "string");
    assert.notEqual(second.structuredContent?.renderId, first.structuredContent?.renderId);
  } finally {
    await client.close();
  }
});
