import test from "node:test";
import assert from "node:assert/strict";

import * as widgetResource from "../mcp/widget-resource.mjs";

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

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

// Bridge（桥接）必须先完成 ui/initialize（界面初始化）握手，再允许按钮调用后端。
// 旧代码检查了一个并不存在的 app.ready，因此这里用“连接未完成时工具绝不能执行”来验收。
test("Widget 工具调用会等待应用桥接连接完成", async () => {
  assert.equal(typeof widgetResource.createWidgetBridge, "function", "需要导出可测试的桥接创建函数。\n");

  let finishConnect;
  const events = [];
  class FakeApp {
    addEventListener() {}
    connect() {
      events.push("connect-start");
      return new Promise((resolve) => { finishConnect = resolve; });
    }
    async callServerTool() {
      events.push("tool-call");
      return { structuredContent: { ok: true } };
    }
    getHostCapabilities() { return {}; }
    getHostContext() { return {}; }
  }

  const target = new FakeWindow();
  widgetResource.createWidgetBridge({
    App: FakeApp,
    target,
    CustomEventClass: FakeCustomEvent,
    connectTimeoutMs: 100,
    requestTimeoutMs: 100,
  });

  const pending = target.codexTextControlMcp.callServerTool({ name: "save_text_revision", arguments: {} });
  await Promise.resolve();
  assert.deepEqual(events, ["connect-start"]);

  finishConnect();
  const result = await pending;
  assert.deepEqual(events, ["connect-start", "tool-call"]);
  assert.equal(result.structuredContent.ok, true);
});

// Timeout（超时）是避免按钮永久转圈的最后保险。10 毫秒只是测试用的小数值；
// 正式界面会使用更宽松的时间，数学上就是“等待时间 > 上限”时主动失败并允许重试。
test("Widget 工具永久不返回时会在超时后明确失败", async () => {
  assert.equal(typeof widgetResource.createWidgetBridge, "function", "需要导出可测试的桥接创建函数。\n");

  class FakeApp {
    addEventListener() {}
    async connect() {}
    callServerTool() { return new Promise(() => {}); }
    getHostCapabilities() { return {}; }
    getHostContext() { return {}; }
  }

  const target = new FakeWindow();
  widgetResource.createWidgetBridge({
    App: FakeApp,
    target,
    CustomEventClass: FakeCustomEvent,
    connectTimeoutMs: 20,
    requestTimeoutMs: 10,
  });

  await assert.rejects(
    () => target.codexTextControlMcp.callServerTool({ name: "save_text_revision", arguments: {} }),
    /超时/,
  );
});
