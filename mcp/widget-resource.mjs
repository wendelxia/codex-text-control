import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

const require = createRequire(import.meta.url);
let cachedAppsScript = "";

// 这里单独导出桥接创建函数，是为了让测试能真的控制“连接何时完成”和“工具是否超时”。
// Bridge（桥接）可以理解为编辑器与 Codex 宿主之间的电话线：电话线没接通前，按钮不能先讲话。
export function createWidgetBridge({
  App,
  target,
  CustomEventClass,
  connectTimeoutMs = 15_000,
  requestTimeoutMs = 30_000,
  appVersion = "0.2.1",
} = {}) {
  const eventClass = CustomEventClass || target?.CustomEvent;
  const publish = (globals) => {
    if (!target) return;
    target.openai = Object.assign(target.openai || {}, globals);
    if (eventClass && typeof target.dispatchEvent === "function") {
      target.dispatchEvent(new eventClass("openai:set_globals", { detail: { globals: target.openai } }));
    }
  };
  const setBridgeStatus = (state, message) => {
    publish({ codexTextControlBridgeStatus: { state, message: String(message || "") } });
  };
  const asError = (error, fallback) => error instanceof Error ? error : new Error(String(error || fallback));
  const withTimeout = (work, milliseconds, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(message);
      error.code = "TIMEOUT";
      reject(error);
    }, milliseconds);
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });

  let app = null;
  let connectionError = null;
  const unavailable = (message) => {
    connectionError = new Error(message);
    setBridgeStatus("failed", message);
  };

  if (!target) throw new Error("缺少 Widget 运行窗口，无法建立 Codex 桥接。");
  if (typeof App !== "function") {
    unavailable("Codex 应用桥接未加载，请关闭编辑器后重试。");
  } else {
    try {
      app = new App(
        { name: "codex-text-control", version: appVersion },
        { availableDisplayModes: ["inline", "fullscreen"] },
        { autoResize: true, strict: true },
      );
      target.__CTC_APP__ = app;
      const publishToolOutput = (result) => publish({
        rawToolResult: result,
        toolOutput: result?._meta?.widgetData || result?.structuredContent || result,
      });
      app.addEventListener("toolresult", publishToolOutput);
      target.addEventListener("message", (event) => {
        const result = event.data?.params?.result;
        if (event.data?.method === "ui/notifications/tool-result" && result) publishToolOutput(result);
      });
    } catch (error) {
      unavailable(`Codex 应用桥接初始化失败：${asError(error).message}`);
    }
  }

  setBridgeStatus(connectionError ? "failed" : "connecting", connectionError?.message || "正在连接 Codex...");
  const connectionPromise = app
    ? withTimeout(
      Promise.resolve().then(() => app.connect()),
      connectTimeoutMs,
      "连接 Codex 超时，请关闭编辑器后重试。",
    ).then(() => {
      setBridgeStatus("ready", "已连接 Codex，可以保存或提交。");
      publish({
        hostCapabilities: app.getHostCapabilities?.(),
        hostContext: app.getHostContext?.(),
      });
    }).catch((error) => {
      connectionError = asError(error, "Codex 应用桥接连接失败。");
      setBridgeStatus("failed", connectionError.message);
    })
    : Promise.resolve();

  const ensureConnected = async () => {
    await connectionPromise;
    if (connectionError) throw connectionError;
    if (!app) throw new Error("Codex 应用桥接不可用。");
  };
  const bridge = {
    async callServerTool(request) {
      await ensureConnected();
      return withTimeout(
        app.callServerTool(request),
        requestTimeoutMs,
        `工具 ${request?.name || "调用"} 超时，结果未知。`,
      );
    },
    async sendFollowUpMessage(message) {
      await ensureConnected();
      return withTimeout(app.sendMessage(message), requestTimeoutMs, "向当前对话回传消息超时，宿主是否收到仍未知。");
    },
  };
  target.codexTextControlMcp = bridge;
  return bridge;
}

export function registerTextControlWidget(server, { uri, html }) {
  const metadata = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } },
    "openai/widgetDescription": "编辑 Codex 回复并提交为新的权威上下文。",
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": { connect_domains: [], resource_domains: [], frame_domains: [] },
  };
  registerAppResource(server, "codex-text-control-widget", uri, {
    title: "Codex 上下文编辑器",
    description: "在 Codex 内编辑、保存并提交新的权威上下文。",
    _meta: metadata,
  }, async () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: injectBridge(await html()), _meta: metadata }],
  }));
}

function injectBridge(html) {
  const runtime = `(${createWidgetBridge.toString()})({App:window.__CTC_APPS__?.App,target:window,CustomEventClass:window.CustomEvent});`;
  const bridge = `<script>${appsScript()}</script><script>${runtime.replaceAll("</script", "<\\/script")}</script>`;
  // 使用替换回调而不是替换字符串，确保第三方 SDK 里的 `$&` 等文本不会被 String.replace（字符串替换）当成控制标记展开。
  return html.includes("</head>") ? html.replace("</head>", () => `${bridge}</head>`) : `${bridge}${html}`;
}

function appsScript() {
  if (cachedAppsScript) return cachedAppsScript;
  const sourcePath = require.resolve("@modelcontextprotocol/ext-apps/app-with-deps");
  const source = readFileSync(sourcePath, "utf8");
  const start = source.lastIndexOf("export{");
  const entries = source.slice(start).match(/^export\{([^}]+)\};?\s*$/s)?.[1] || "";
  const map = new Map(entries.split(",").map((entry) => {
    const parts = entry.trim().split(/\s+as\s+/);
    return [parts.at(-1), parts[0]];
  }));
  if (!map.get("App")) throw new Error("无法加载 Codex widget 桥接的 App 导出。");
  cachedAppsScript = `${source.slice(0, start)};globalThis.__CTC_APPS__={App:${map.get("App")}};`;
  return cachedAppsScript.replaceAll("</script", "<\\/script");
}
