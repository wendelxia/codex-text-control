import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.className = "";
    this.type = "";
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.listeners = new Map();
    this.innerHtmlWrites = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) await listener({ type, target: this, ...event });
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  querySelectorAll() {
    return [];
  }

  set innerHTML(_value) {
    this.innerHtmlWrites += 1;
  }

  get innerHTML() {
    return "";
  }

  allText() {
    return [this.textContent, ...this.children.map((child) => child.allText?.() || child.textContent || "")].join(" ");
  }
}

class FakeDocument {
  constructor() {
    this.title = "Codex 上下文编辑器";
    this.elements = new Map();
    for (const id of ["page-title", "status", "note", "editor", "save", "commit", "reset", "meta", "history"]) {
      this.elements.set(id, new FakeElement(id === "editor" ? "textarea" : "div", id));
    }
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
  }

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

async function editorScript() {
  const html = await readFile(join(process.cwd(), "ui", "editor.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length, "编辑器页面缺少脚本。\n");
  return scripts.at(-1)[1];
}

async function createHarness({ toolOutput = {}, bridgeState = "ready", callServerTool, sendFollowUpMessage } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const calls = [];
  window.openai = {
    toolOutput,
    codexTextControlBridgeStatus: { state: bridgeState },
  };
  window.__CTC_REQUEST_TIMEOUT_MS__ = 15;
  window.codexTextControlMcp = {
    callServerTool: async (request) => {
      calls.push(request);
      return callServerTool ? callServerTool(request) : { structuredContent: {} };
    },
    sendFollowUpMessage: async (message) => sendFollowUpMessage?.(message),
  };

  vm.runInNewContext(await editorScript(), {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  });

  return { document, window, calls, element: (id) => document.getElementById(id) };
}

test("桥接连接中时保存和提交按钮不可点击", async () => {
  const harness = await createHarness({ bridgeState: "connecting" });
  assert.equal(harness.element("save").disabled, true);
  assert.equal(harness.element("commit").disabled, true);
  assert.match(harness.element("status").textContent, /连接/);
});

test("桥接已连接但项目数据尚未到达时写按钮仍保持禁用", async () => {
  const harness = await createHarness({ bridgeState: "ready", toolOutput: {} });
  assert.equal(harness.element("save").disabled, true);
  assert.equal(harness.element("commit").disabled, true);
  assert.match(harness.element("status").textContent, /加载项目数据/);
});

test("工具永久不返回时提交按钮会恢复并提示超时", async () => {
  const harness = await createHarness({
    toolOutput: { projectDir: "D:\\demo", sourceText: "需要提交的正文", revisions: [], current: null },
    callServerTool: () => new Promise(() => {}),
  });

  void harness.element("commit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(harness.element("commit").disabled, false);
  assert.match(harness.element("status").textContent, /超时/);
  assert.match(harness.element("status").textContent, /结果未知/);
});

test("消息回传超时时明确说明宿主是否收到仍然未知", async () => {
  const revision = { id: "rev-timeout", number: 1, content: "已经提交", note: "" };
  const harness = await createHarness({
    toolOutput: { projectDir: "D:\\demo", sourceText: revision.content, revisions: [revision], current: null },
    callServerTool: async () => ({ structuredContent: { revision, followUpMessage: "权威上下文已提交" } }),
    sendFollowUpMessage: () => new Promise(() => {}),
  });

  void harness.element("commit").emit("click");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.match(harness.element("status").textContent, /已提交/);
  assert.match(harness.element("status").textContent, /是否收到.*未知/);
});

test("历史版本说明只按纯文本渲染，不写入 innerHTML", async () => {
  const attack = '<img src=x onerror="globalThis.attacked=true">';
  const harness = await createHarness({
    toolOutput: {
      sourceText: "安全正文",
      revisions: [{ id: "rev-safe", number: 1, content: "安全正文", note: attack }],
      current: null,
    },
  });

  assert.equal(harness.element("history").innerHtmlWrites, 0);
  assert.match(harness.element("history").allText(), /<img src=x/);
});

test("保存草稿后元信息显示最新修订，而不是误报没有保存版本", async () => {
  const revision = { id: "rev-draft", number: 1, content: "新草稿", note: "已保存" };
  const harness = await createHarness({
    toolOutput: { projectDir: "D:\\demo", sourceText: revision.content, revisions: [], current: null },
    callServerTool: async () => ({ structuredContent: { revision } }),
  });

  await harness.element("save").emit("click");
  assert.match(harness.element("meta").textContent, /最新修订：rev-draft/);
  assert.match(harness.element("meta").textContent, /尚未提交/);
  assert.doesNotMatch(harness.element("meta").textContent, /没有保存过/);
});

test("提交未改动的已保存正文会复用修订，不重复保存", async () => {
  const revision = { id: "rev-existing", number: 1, content: "同一份正文", note: "已保存" };
  const harness = await createHarness({
    toolOutput: { projectDir: "D:\\demo", sourceText: revision.content, revisions: [revision], current: null },
    callServerTool: async (request) => {
      if (request.name === "commit_authoritative_context") {
        return { structuredContent: { revision, followUpMessage: "权威上下文已提交" } };
      }
      throw new Error(`不应调用 ${request.name}`);
    },
  });

  await harness.element("commit").emit("click");
  assert.deepEqual(harness.calls.map((call) => call.name), ["commit_authoritative_context"]);
  assert.equal(harness.calls[0].arguments.revisionId, revision.id);
});

test("权威版本提交成功但对话回传失败时，界面准确区分两个结果", async () => {
  const revision = { id: "rev-committed", number: 1, content: "已经提交", note: "" };
  const harness = await createHarness({
    toolOutput: { projectDir: "D:\\demo", sourceText: revision.content, revisions: [revision], current: null },
    callServerTool: async () => ({ structuredContent: { revision, followUpMessage: "权威上下文已提交" } }),
    sendFollowUpMessage: async () => { throw new Error("消息通道不可用"); },
  });

  await harness.element("commit").emit("click");
  assert.match(harness.element("meta").textContent, /已提交为权威/);
  assert.match(harness.element("status").textContent, /已提交/);
  assert.match(harness.element("status").textContent, /回传失败|未能发回/);
});

test("编辑器使用调用方传入的标题，并阻止空正文提交", async () => {
  const harness = await createHarness({
    toolOutput: { title: "项目硬性准则", sourceText: "   ", revisions: [], current: null },
  });

  await harness.element("commit").emit("click");
  assert.equal(harness.element("page-title").textContent, "项目硬性准则");
  assert.equal(harness.document.title, "项目硬性准则");
  assert.equal(harness.calls.length, 0);
  assert.match(harness.element("status").textContent, /不能为空/);
});
