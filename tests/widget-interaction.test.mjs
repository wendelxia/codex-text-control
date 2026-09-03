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
      "page-title", "status", "editor-label", "editor", "canvas-editor", "canvas", "canvas-view", "source-view",
      "canvas-tab", "source-tab", "reset", "finish-editing", "load-draft",
      "review-dialog", "review-content", "review-status", "review-cancel", "review-submit",
      "meta", "history-panel", "history",
    ];
  const tags = { editor: "textarea", "canvas-editor": "textarea", "review-dialog": "dialog", "review-content": "pre", "review-cancel": "button", "review-submit": "button", "load-draft": "button" };
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

async function createHarness({ toolOutput = {}, bridgeState = "ready", callServerTool, sendFollowUpMessage, requestTimeoutMs = 15 } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const calls = [];
  window.openai = { toolOutput, codexTextControlBridgeStatus: { state: bridgeState } };
  window.__CTC_REQUEST_TIMEOUT_MS__ = requestTimeoutMs;
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
  assert.match(html, /id="load-draft"/);
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

test("正文画布使用单一连续文本流，不显示逐行前缀或代码行号", async () => {
  const html = await readFile(join(process.cwd(), "ui", "editor.html"), "utf8");
  assert.match(html, /id="canvas-editor"/);
  assert.match(html, /id="canvas-editor"[^>]*aria-label="完整 Markdown 正文"/);
  assert.match(html, /#canvas-editor\s*\{[^}]*user-select:\s*text;/s);
  assert.match(html, /#canvas-editor:focus\s*\{[^}]*box-shadow:\s*inset 3px 0 0 var\(--focus\);/s);
  assert.doesNotMatch(html, /#canvas-editor:focus\s*\{[^}]*outline:\s*none;/s);
  assert.doesNotMatch(html, /\.block-prefix|\.canvas-block|\.table-block|\.cell-input/);
  assert.doesNotMatch(html, /line-number|line-numbering|gutter/iu);
});

test("画布全文编辑器可以一次选中并修改包含表格的连续正文", async () => {
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
  const canvasEditor = nodes.find((node) => node.id === "canvas-editor");
  assert.ok(canvasEditor, "画布应只有一个连续正文编辑器。");
  assert.equal(canvasEditor.tagName, "TEXTAREA");
  assert.equal(canvasEditor.value, "| 项目 | 状态 |\n| --- | --- |\n| 闭环 | 待验收 |");
  canvasEditor.value = "| 项目 | 状态 |\n| --- | --- |\n| 闭环 | 已通过 |";
  await canvasEditor.emit("input");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.length, 0, "表格输入停顿不应产生中间修订。");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls[0].name, "update_authoritative_context");
  assert.match(harness.calls[0].arguments.content, /\| 闭环 \| 已通过 \|/);
});

test("重复点击当前画布标签不会用旧源码覆盖连续正文草稿", async () => {
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "初始正文", revisions: [], current: null },
  });
  const canvasEditor = descendants(harness.element("canvas")).find((node) => node.id === "canvas-editor");
  canvasEditor.value = "画布中的最新草稿";
  await canvasEditor.emit("input");
  await harness.element("canvas-tab").emit("click");
  assert.equal(canvasEditor.value, "画布中的最新草稿");
});

test("画布和源码视图往返时逐字保留连续正文草稿", async () => {
  const canvasContent = "第一段\r\n\r\n| 项目 | 状态 |\r\n| --- | --- |\r\n| 画布 | 待验收 |";
  const finalContent = canvasContent.replace("待验收", "已通过");
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "初始正文", revisions: [], current: null },
    callServerTool: async (request) => ({ structuredContent: { revision: { id: "rev-roundtrip", content: request.arguments.content } } }),
  });
  const canvasEditor = descendants(harness.element("canvas")).find((node) => node.id === "canvas-editor");
  canvasEditor.value = canvasContent;
  await canvasEditor.emit("input");
  await harness.element("source-tab").emit("click");
  assert.equal(harness.element("editor").value, canvasContent);
  harness.element("editor").value = finalContent;
  await harness.element("editor").emit("input");
  await harness.element("canvas-tab").emit("click");
  assert.equal(canvasEditor.value, finalContent);
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].arguments.content, finalContent);
});

test("AI 候选全文与当前权威内容不同时可以不改字直接检查并提交", async () => {
  const current = { id: "rev-base", revisionId: "rev-base", content: "旧权威正文" };
  const candidate = "AI 整理后的完整候选正文";
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: candidate, revisions: [current], current },
    callServerTool: async (request) => ({ structuredContent: { revision: { id: "rev-candidate", content: request.arguments.content } } }),
  });
  await harness.element("finish-editing").emit("click");
  assert.equal(harness.element("review-dialog").open, true);
  assert.equal(harness.element("review-content").textContent, candidate);
  await harness.element("review-submit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].arguments.content, candidate);
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

test("连续正文画布保存超时后恢复可编辑状态并保留草稿", async () => {
  let attempts = 0;
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原文", revisions: [], current: null },
    callServerTool: (request) => {
      attempts += 1;
      if (attempts === 1) return new Promise(() => {});
      return { structuredContent: { revision: { id: "rev-retry", content: request.arguments.content } } };
    },
  });
  const canvasEditor = descendants(harness.element("canvas")).find((node) => node.id === "canvas-editor");
  canvasEditor.value = "画布中的修改后正文";
  await canvasEditor.emit("input");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(canvasEditor.disabled, false);
  assert.equal(canvasEditor.readOnly, false);
  assert.equal(canvasEditor.value, "画布中的修改后正文");
  assert.match(harness.element("status").textContent, /超时/);
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(attempts, 2);
  assert.match(harness.element("meta").textContent, /rev-retry/);
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

test("新渲染缺少正文时不允许只更新标题造成标题正文串线", async () => {
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      renderId: "render-old",
      projectDir: "/workspace/demo",
      title: "旧标题",
      sourceText: "旧正文",
      revisions: [],
      current: null,
    },
  });
  assert.equal(harness.element("page-title").textContent, "旧标题");
  assert.equal(harness.element("editor").value, "旧正文");

  harness.window.dispatchEvent({
    type: "openai:set_globals",
    detail: {
      globals: {
        toolOutput: {
          mode: "full",
          renderId: "render-new",
          projectDir: "/workspace/demo",
          title: "新标题",
          revisions: [],
          current: null,
        },
      },
    },
  });

  assert.equal(harness.element("page-title").textContent, "旧标题");
  assert.equal(harness.element("editor").value, "旧正文");

  harness.window.dispatchEvent({
    type: "openai:set_globals",
    detail: {
      globals: {
        toolOutput: {
          mode: "full",
          renderId: "render-new",
          projectDir: "/workspace/demo",
          title: "新标题",
          sourceText: "新正文",
          revisions: [],
          current: null,
        },
      },
    },
  });

  assert.equal(harness.element("page-title").textContent, "新标题");
  assert.equal(harness.element("editor").value, "新正文");
});

test("输入停顿会保存草稿，下一次打开可恢复且不提交正式版本", async () => {
  const calls = [];
  const current = { id: "rev-current", revisionId: "rev-current", content: "原始权威正文" };
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: current.content,
      revisions: [current],
      current,
    },
    callServerTool: async (request) => {
      calls.push(request);
      return { structuredContent: { draft: { content: request.arguments.content } } };
    },
  });

  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "切换对话前的未提交修改";
  await harness.element("editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 450));

  assert.deepEqual(calls.map((request) => request.name), ["save_context_draft"]);
  assert.equal(calls[0].arguments.baseRevisionId, "rev-current");
  assert.equal(calls[0].arguments.content, "切换对话前的未提交修改");

  const restored = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "切换对话前的未提交修改",
      draft: { content: "切换对话前的未提交修改", baseRevisionId: "rev-current", conflict: false },
      revisions: [current],
      current,
    },
  });
  assert.equal(restored.element("editor").value, "切换对话前的未提交修改");
  assert.match(restored.element("status").textContent, /草稿|未提交/);
});

test("恢复的草稿基线过期时阻止静默覆盖新的权威版本", async () => {
  const current = { id: "rev-new", revisionId: "rev-new", content: "已经更新的权威正文" };
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "旧版本上的未提交修改",
      draft: { content: "旧版本上的未提交修改", baseRevisionId: "rev-old", conflict: true },
      revisions: [current],
      current,
    },
    callServerTool: async () => { throw new Error("冲突草稿不应调用正式保存"); },
  });

  await harness.element("finish-editing").emit("click");
  await harness.element("review-submit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.calls.length, 0);
  assert.match(harness.element("status").textContent, /权威版本|冲突|重新打开/);
});

test("过期草稿可以显式载入当前基线，检查后再提交", async () => {
  const current = { id: "rev-new", revisionId: "rev-new", content: "已经更新的权威正文" };
  const draftContent = "旧基线上的未提交修改";
  const calls = [];
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: current.content,
      draft: { content: draftContent, baseRevisionId: "rev-old", conflict: true },
      revisions: [current],
      current,
    },
    callServerTool: async (request) => {
      calls.push(request);
      if (request.name === "update_authoritative_context") {
        return { structuredContent: { revision: { id: "rev-merged", content: request.arguments.content }, committedAt: "2026-09-02T00:00:00.000Z" } };
      }
      return { structuredContent: {} };
    },
  });

  assert.equal(harness.element("load-draft").hidden, false);
  await harness.element("load-draft").emit("click");
  assert.equal(harness.element("load-draft").hidden, true);
  assert.equal(harness.element("editor").value, draftContent);
  assert.match(harness.element("status").textContent, /核对|载入/);

  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls[0].name, "update_authoritative_context");
  assert.equal(calls[0].arguments.expectedCurrentRevisionId, "rev-new");
  assert.equal(calls[0].arguments.content, draftContent);
  assert.match(harness.element("meta").textContent, /rev-merged/);
});

test("输入法组合态不会自动保存，组合结束后才保存最终草稿", async () => {
  const calls = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原始正文", revisions: [], current: null },
    callServerTool: async (request) => {
      calls.push(request);
      return { structuredContent: { draft: { content: request.arguments.content } } };
    },
  });
  await harness.element("source-tab").emit("click");
  await harness.element("editor").emit("compositionstart");
  harness.element("editor").value = "拼音中间态";
  await harness.element("editor").emit("input", { isComposing: true });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(calls.length, 0);
  await harness.element("editor").emit("compositionend");
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "save_context_draft");
});

test("切换对话触发 pagehide 时会立即尽力保存当前草稿", async () => {
  const calls = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "原始正文", revisions: [], current: null },
    callServerTool: async (request) => {
      calls.push(request);
      return { structuredContent: { draft: { content: request.arguments.content } } };
    },
  });
  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "切换对话前的草稿";
  await harness.element("editor").emit("input");
  harness.window.dispatchEvent({ type: "pagehide" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "save_context_draft");
  assert.equal(calls[0].arguments.content, "切换对话前的草稿");
});

test("本轮候选正文优先于宿主复用时带回的旧草稿", async () => {
  const current = { id: "rev-current", revisionId: "rev-current", content: "项目权威正文" };
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      renderId: "render-candidate",
      projectDir: "/workspace/demo",
      sourceText: "本轮整理出的候选正文",
      sourceKind: "candidate",
      draft: { content: "上一轮对话的旧草稿", baseRevisionId: "rev-current", conflict: false },
      revisions: [current],
      current,
    },
  });

  assert.equal(harness.element("canvas-editor").value, "本轮整理出的候选正文");
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

test("AI 扩展点候选可以不改字直接检查并提交", async () => {
  const base = { id: "rev-base", revisionId: "rev-base", content: "固定\n【AI扩展点：补充】\n旧内容\n【/AI扩展点】" };
  const candidate = "AI 已生成的块内候选";
  const revision = { id: "rev-extension-candidate", content: `固定\n【AI扩展点：补充】\n${candidate}\n【/AI扩展点】` };
  const harness = await createHarness({
    toolOutput: {
      mode: "extension", projectDir: "/workspace/demo", sourceText: candidate,
      extension: { name: "补充", baseRevisionId: base.id, currentContent: "旧内容" }, revisions: [base], current: base,
    },
    callServerTool: async (request) => request.name === "save_context_extension_revision"
      ? { structuredContent: { revision } }
      : { structuredContent: { revision } },
  });
  await harness.element("finish-editing").emit("click");
  assert.equal(harness.element("review-dialog").open, true);
  assert.equal(harness.element("review-content").textContent, candidate);
  await harness.element("review-submit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(harness.calls.map((call) => call.name), ["save_context_extension_revision", "commit_authoritative_context"]);
  assert.equal(harness.calls[0].arguments.extensionContent, candidate);
});

test("扩展点修订保存后提交失败时保留候选并可安全重试", async () => {
  const base = { id: "rev-base", revisionId: "rev-base", content: "固定\n【AI扩展点：补充】\n旧内容\n【/AI扩展点】" };
  const candidate = "重试后仍应提交的候选";
  const revision = { id: "rev-extension-retry", content: `固定\n【AI扩展点：补充】\n${candidate}\n【/AI扩展点】` };
  let commitAttempts = 0;
  const harness = await createHarness({
    toolOutput: {
      mode: "extension", projectDir: "/workspace/demo", sourceText: candidate,
      extension: { name: "补充", baseRevisionId: base.id, currentContent: "旧内容" }, revisions: [base], current: base,
    },
    callServerTool: async (request) => {
      if (request.name === "save_context_extension_revision") return { structuredContent: { revision } };
      commitAttempts += 1;
      if (commitAttempts === 1) throw new Error("模拟权威指针提交失败");
      return { structuredContent: { revision } };
    },
  });
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.element("editor").value, candidate);
  assert.match(harness.element("status").textContent, /模拟权威指针提交失败/);
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(harness.calls.map((call) => call.name), [
    "save_context_extension_revision", "commit_authoritative_context",
    "save_context_extension_revision", "commit_authoritative_context",
  ]);
  assert.equal(commitAttempts, 2);
  assert.match(harness.element("meta").textContent, /rev-extension-retry/);
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

test("draft persistence serializes saves and preserves the latest edit", async () => {
  const calls = [];
  const resolvers = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "original", revisions: [], current: null },
    requestTimeoutMs: 1_000,
    callServerTool: async (request) => {
      calls.push(request);
      return new Promise((resolve) => resolvers.push(resolve));
    },
  });

  await harness.element("source-tab").emit("click");
  harness.element("editor").value = "first edit";
  await harness.element("editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 370));
  assert.equal(calls.length, 1);

  harness.element("editor").value = "second edit";
  await harness.element("editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 370));
  assert.equal(calls.length, 1);

  resolvers.shift()({ structuredContent: { draft: { content: "first edit" } } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].arguments.content, "second edit");

  resolvers.shift()({ structuredContent: { draft: { content: "second edit" } } });
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test("pagehide during IME composition does not persist an intermediate draft", async () => {
  const calls = [];
  const harness = await createHarness({
    toolOutput: { mode: "full", projectDir: "/workspace/demo", sourceText: "original", revisions: [], current: null },
    callServerTool: async (request) => {
      calls.push(request);
      return { structuredContent: { draft: { content: request.arguments.content } } };
    },
  });

  await harness.element("source-tab").emit("click");
  await harness.element("editor").emit("compositionstart");
  harness.element("editor").value = "composing";
  await harness.element("editor").emit("input", { isComposing: true });
  harness.window.dispatchEvent({ type: "pagehide" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 0);

  await harness.element("editor").emit("compositionend");
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.content, "composing");
});

test("resetting to the authoritative version discards the persisted draft", async () => {
  const calls = [];
  const current = { id: "rev-current", revisionId: "rev-current", content: "authoritative" };
  const harness = await createHarness({
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "draft content",
      draft: { content: "draft content", baseRevisionId: "rev-current", conflict: false },
      revisions: [current],
      current,
    },
    callServerTool: async (request) => {
      calls.push(request);
      return { structuredContent: {} };
    },
  });

  await harness.element("reset").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls.map((request) => request.name), ["discard_context_draft"]);
  assert.equal(calls[0].arguments.projectDir, "/workspace/demo");
  assert.equal(harness.element("canvas-editor").value, "authoritative");
});

test("a new edit waits for reset cleanup before saving a replacement draft", async () => {
  const calls = [];
  let resolveDiscard;
  const current = { id: "rev-current", revisionId: "rev-current", content: "authoritative" };
  const harness = await createHarness({
    requestTimeoutMs: 1_000,
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "draft content",
      draft: { content: "draft content", baseRevisionId: "rev-current", conflict: false },
      revisions: [current],
      current,
    },
    callServerTool: async (request) => {
      calls.push(request);
      if (request.name === "discard_context_draft") {
        return new Promise((resolve) => { resolveDiscard = resolve; });
      }
      return { structuredContent: { draft: { content: request.arguments.content } } };
    },
  });

  await harness.element("reset").emit("click");
  harness.element("canvas-editor").value = "new edit after reset";
  await harness.element("canvas-editor").emit("input");
  await new Promise((resolve) => setTimeout(resolve, 370));
  assert.deepEqual(calls.map((request) => request.name), ["discard_context_draft"]);

  resolveDiscard({ structuredContent: {} });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.deepEqual(calls.map((request) => request.name), ["discard_context_draft", "save_context_draft"]);
  assert.equal(calls[1].arguments.content, "new edit after reset");
});

test("formal submission waits for reset cleanup before updating authority", async () => {
  const calls = [];
  let resolveDiscard;
  const current = { id: "rev-current", revisionId: "rev-current", content: "authoritative" };
  const harness = await createHarness({
    requestTimeoutMs: 1_000,
    toolOutput: {
      mode: "full",
      projectDir: "/workspace/demo",
      sourceText: "draft content",
      draft: { content: "draft content", baseRevisionId: "rev-current", conflict: false },
      revisions: [current],
      current,
    },
    callServerTool: async (request) => {
      calls.push(request);
      if (request.name === "discard_context_draft") {
        return new Promise((resolve) => { resolveDiscard = resolve; });
      }
      return { structuredContent: { revision: { id: "rev-submitted", content: request.arguments.content } } };
    },
  });

  await harness.element("reset").emit("click");
  harness.element("canvas-editor").value = "new edit after reset";
  await harness.element("canvas-editor").emit("input");
  await finishThroughReview(harness);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls.map((request) => request.name), ["discard_context_draft"]);

  resolveDiscard({ structuredContent: {} });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(calls.map((request) => request.name), ["discard_context_draft", "update_authoritative_context"]);
  assert.equal(calls[1].arguments.content, "new edit after reset");
});
