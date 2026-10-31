import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const libraries = [
  "node_modules/markdown-it/dist/browser/markdown-it.umd.min.js",
  "node_modules/turndown/dist/turndown.js",
  "node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js",
  "ui/rich-text.js",
];
export async function richDOM(t, html = '<article id="reply"></article>') {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/" });
  t.after(() => dom.window.close());
  for (const path of libraries) dom.window.eval(await readFile(path, "utf8"));
  return dom;
}
export async function waitFor(predicate, timeout = 1500) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Timed out waiting for UI state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
export const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

export async function widget(t, options = {}) {
  const dom = await richDOM(t, await readFile("ui/editor.html", "utf8"));
  const { window } = dom;
  const calls = [], notices = [];
  const current = { id: "rev-1", content: "原来的正文" };
  const output = options.output || { renderId: "render-1", projectDir: "/workspace/demo", mode: "full", current, sourceKind: "authority", sourceText: current.content };
  window.__CTC_REQUEST_TIMEOUT_MS__ = options.timeout || 250;
  window.__CTC_DRAFT_DELAY_MS__ = 15;
  window.openai = { toolOutput: output, codexTextControlBridgeStatus: { state: options.bridgeState || "ready" } };
  window.codexTextControlMcp = {
    async callServerTool(request) {
      calls.push(request);
      if (options.call) return options.call(request);
      if (request.name === "update_authoritative_context") return { structuredContent: { revision: { id: "rev-2", content: request.arguments.content }, followUpMessage: "版本 rev-2，请读取最新正文。" } };
      return { structuredContent: { draft: { ...request.arguments } } };
    },
    async sendFollowUpMessage(message) { notices.push(message); return options.notify?.(message); },
  };
  window.eval(await readFile("ui/editor.js", "utf8"));
  const el = (id) => window.document.getElementById(id);
  const dispatch = (node, type, init = {}) => node.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const edit = (text, selector = "p") => {
    el("reply").focus();
    const target = el("reply").querySelector(selector) || el("reply");
    target.textContent = text;
    dispatch(el("reply"), "input");
  };
  const globals = (value) => window.dispatchEvent(new window.CustomEvent("openai:set_globals", { detail: { globals: value } }));
  return { ...dom, window, calls, notices, el, edit, dispatch, globals };
}
