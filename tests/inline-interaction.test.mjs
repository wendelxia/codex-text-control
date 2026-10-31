import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { widget, waitFor, pause } from "./helpers/dom.mjs";
import { discardContextDraft, getContextDraft, saveContextDraft } from "../mcp/context-storage.mjs";

async function draftFixture() {
  const projectDir = await mkdtemp(join(tmpdir(), "ctc-inline-draft-"));
  const output = { renderId: "draft-review", projectDir, sourceKind: "authority", sourceText: "原来的正文", current: { id: "rev-1", content: "原来的正文" } };
  const call = async ({ name, arguments: args }) => {
    if (name === "save_context_draft") return { structuredContent: { draft: await saveContextDraft(args) } };
    if (name === "discard_context_draft") return { structuredContent: await discardContextDraft(args) };
    throw new Error(`Unexpected tool: ${name}`);
  };
  return { projectDir, output, call };
}

test("reply starts as rendered prose without an editor shell or writes", async (t) => {
  const h = await widget(t);
  assert.equal(h.el("reply").textContent, "原来的正文");
  assert.equal(h.el("edit-actions").hidden, true);
  assert.equal(h.window.document.querySelector("textarea, dialog, h1"), null);
  await pause(); assert.deepEqual(h.calls, []);
});

test("focus exposes save and cancel; save commits once and returns to reading", async (t) => {
  const h = await widget(t);
  h.edit("直接修改后的正文");
  assert.equal(h.el("edit-actions").hidden, false);
  h.el("save").click(); h.el("save").click();
  await waitFor(() => h.notices.length === 1 && h.el("edit-actions").hidden);
  const updates = h.calls.filter((call) => call.name === "update_authoritative_context");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].arguments.content, "直接修改后的正文");
  assert.equal(h.el("reply").textContent, "直接修改后的正文");
});

test("unchanged authority cannot be saved, while a new candidate can be accepted unchanged", async (t) => {
  const h = await widget(t); h.el("reply").focus();
  assert.equal(h.el("save").disabled, true);
  const h2 = await widget(t, { output: { renderId: "new", projectDir: "/workspace/demo", sourceText: "新候选正文", sourceKind: "candidate", current: null } });
  h2.el("reply").focus(); h2.el("save").click();
  await waitFor(() => h2.notices.length === 1);
  assert.equal(h2.calls[0].arguments.content, "新候选正文");
});

test("cancel restores the displayed candidate, not unrelated older authority", async (t) => {
  const h = await widget(t, { output: { renderId: "new", projectDir: "/workspace/demo", sourceText: "本轮候选", sourceKind: "candidate", current: { id: "old", content: "别的旧内容" } } });
  h.edit("修改一半"); h.el("cancel").click();
  await waitFor(() => h.el("edit-actions").hidden);
  assert.equal(h.el("reply").textContent, "本轮候选");
  assert.equal(h.calls.some((call) => call.name === "update_authoritative_context"), false);
});

test("table cells edit in the same reply and save as a table", async (t) => {
  const h = await widget(t, { output: { renderId: "table", projectDir: "/workspace/demo", sourceText: "正文\n\n| 项目 | 状态 |\n| --- | --- |\n| 编辑 | 之前 |", current: null } });
  h.edit("之后", "td:last-child"); h.el("save").click();
  await waitFor(() => h.notices.length === 1);
  assert.match(h.calls[0].arguments.content, /\| 编辑 \| 之后 \|/);
  assert.equal(h.el("reply").querySelectorAll("table").length, 1);
});

test("IME composition disables submission and never persists intermediate characters", async (t) => {
  const h = await widget(t);
  h.el("reply").focus(); h.dispatch(h.el("reply"), "compositionstart");
  h.edit("拼音中间态"); h.window.dispatchEvent(new h.window.Event("pagehide")); await pause();
  assert.equal(h.el("save").disabled, true); assert.deepEqual(h.calls, []);
  h.el("reply").querySelector("p").textContent = "完整中文";
  h.dispatch(h.el("reply"), "compositionend");
  await waitFor(() => h.calls.length === 1);
  assert.equal(h.calls[0].arguments.content, "完整中文");
});

test("drafts persist without committing and recovered drafts cancel to the confirmed body", async (t) => {
  const h = await widget(t); h.edit("可恢复草稿"); await waitFor(() => h.calls.length === 1);
  assert.equal(h.calls[0].name, "save_context_draft");
  const h2 = await widget(t, { output: { renderId: "recover", projectDir: "/workspace/demo", sourceKind: "draft", sourceText: "可恢复草稿", current: { id: "rev-1", content: "原来的正文" }, draft: { content: "可恢复草稿", baseRevisionId: "rev-1" } } });
  assert.match(h2.el("status").textContent, /恢复/);
  h2.el("cancel").click(); await waitFor(() => h2.el("edit-actions").hidden);
  assert.equal(h2.el("reply").textContent, "原来的正文");
  assert.equal(h2.calls[0].name, "discard_context_draft");
});

test("cancel waits for an in-flight draft before clearing it", async (t) => {
  let release;
  const h = await widget(t, { call: async (request) => request.name === "save_context_draft" ? new Promise((resolve) => { release = resolve; }) : { structuredContent: {} } });
  h.edit("晚到的草稿"); await waitFor(() => release); h.el("cancel").click();
  assert.equal(h.el("reply").getAttribute("contenteditable"), "false");
  assert.equal(h.calls.length, 1);
  release({ structuredContent: { draft: { content: "晚到的草稿" } } });
  await waitFor(() => h.el("edit-actions").hidden);
  assert.deepEqual(h.calls.map((call) => call.name), ["save_context_draft", "discard_context_draft"]);
  assert.equal(h.el("reply").textContent, "原来的正文");
});

test("draft writes are serialized and the latest edit is the final saved draft", async (t) => {
  const releases = [];
  const h = await widget(t, { call: async () => new Promise((resolve) => releases.push(resolve)) });
  h.edit("第一版"); await waitFor(() => releases.length === 1);
  h.edit("第二版"); await pause(); assert.equal(h.calls.length, 1);
  releases.shift()({ structuredContent: {} }); await waitFor(() => h.calls.length === 2);
  assert.equal(h.calls[1].arguments.content, "第二版"); releases.shift()({ structuredContent: {} });
  await waitFor(() => h.el("status").textContent.includes("草稿已保留"));
});

test("saving locks the reply before waiting for drafts and commits the final text", async (t) => {
  let release;
  const h = await widget(t, { call: async (request) => {
    if (request.name === "save_context_draft") return new Promise((resolve) => { release = resolve; });
    return { structuredContent: { revision: { id: "rev-2", content: request.arguments.content } } };
  } });
  h.edit("第一版"); await waitFor(() => release);
  h.edit("正式版本"); h.el("save").click();
  assert.equal(h.el("reply").getAttribute("contenteditable"), "false");
  release({ structuredContent: {} }); await waitFor(() => h.notices.length === 1);
  const committed = h.calls.filter((call) => call.name === "update_authoritative_context");
  assert.equal(committed.length, 1); assert.equal(committed[0].arguments.content, "正式版本");
});

test("a conflict keeps edits and re-enables the editor", async (t) => {
  const h = await widget(t, { call: async () => { throw new Error("权威版本已经变化"); } });
  h.edit("我的修改"); h.el("save").click();
  await waitFor(() => h.el("status").textContent.includes("权威版本已经变化"));
  assert.equal(h.el("reply").textContent, "我的修改");
  assert.equal(h.el("reply").getAttribute("contenteditable"), "true");
  assert.equal(h.el("edit-actions").hidden, false); assert.equal(h.notices.length, 0);
});

test("save timeout reports uncertainty, preserves text and unlocks the editor", async (t) => {
  const h = await widget(t, { timeout: 20, call: () => new Promise(() => {}) });
  h.edit("保留的修改"); h.el("save").click();
  await waitFor(() => h.el("status").textContent.includes("超时"));
  assert.equal(h.el("reply").textContent, "保留的修改");
  assert.equal(h.el("reply").getAttribute("contenteditable"), "true");
});

test("notification failure is distinct from save failure; retry creates no revision", async (t) => {
  let fail = true;
  const h = await widget(t, { notify: async () => { if (fail) throw new Error("消息失败"); } });
  h.edit("已确认正文"); h.el("save").click();
  await waitFor(() => !h.el("retry-notice").hidden);
  assert.match(h.el("status").textContent, /已保存/); assert.equal(h.el("edit-actions").hidden, true);
  fail = false; h.el("retry-notice").click(); await waitFor(() => h.el("retry-notice").hidden);
  assert.equal(h.calls.filter((call) => call.name === "update_authoritative_context").length, 1);
  assert.equal(h.notices.length, 2);
});

test("cancel cleanup failure keeps the unsubmitted edits available", async (t) => {
  const h = await widget(t, { call: async (request) => {
    if (request.name === "discard_context_draft") throw new Error("磁盘错误");
    return { structuredContent: { draft: request.arguments } };
  } });
  h.edit("不要丢失"); await waitFor(() => h.calls.length === 1); h.el("cancel").click();
  await waitFor(() => h.el("status").textContent.includes("取消未完成"));
  assert.equal(h.el("reply").textContent, "不要丢失");
});

test("stale drafts require explicit loading before overwriting a newer version", async (t) => {
  const h = await widget(t, { output: { renderId: "conflict", projectDir: "/workspace/demo", sourceKind: "authority", sourceText: "新版本", current: { id: "rev-2", content: "新版本" }, draft: { content: "旧基线草稿", baseRevisionId: "rev-1", conflict: true } } });
  assert.equal(h.el("reply").textContent, "新版本"); assert.equal(h.el("load-draft").hidden, false);
  h.edit("另一处修改"); h.el("save").click(); await pause();
  assert.equal(h.calls.some((call) => call.name === "update_authoritative_context"), false);
  h.el("load-draft").click(); h.el("save").click(); await waitFor(() => h.notices.length === 1);
  const saved = h.calls.find((call) => call.name === "update_authoritative_context");
  assert.equal(saved.arguments.expectedCurrentRevisionId, "rev-2"); assert.equal(saved.arguments.content, "旧基线草稿");
});

test("bridge absence, empty content and over-limit input do not write authority", async (t) => {
  const h = await widget(t, { bridgeState: "connecting" });
  h.edit("离线修改"); h.el("save").click(); await pause(); assert.deepEqual(h.calls, []);
  const h2 = await widget(t); h2.edit(""); h2.el("save").click(); await pause();
  assert.match(h2.el("status").textContent, /不能为空/); assert.deepEqual(h2.calls, []);
  const h3 = await widget(t, { output: { renderId: "limit", projectDir: "/workspace/demo", sourceText: "正文", current: null, limits: { content: 3 } } });
  h3.edit("超出长度限制"); h3.el("save").click(); await pause();
  assert.match(h3.el("status").textContent, /超过/); assert.deepEqual(h3.calls, []);
});

test("repeated host payloads and title-only renders cannot overwrite local edits", async (t) => {
  const h = await widget(t); const original = h.window.openai.toolOutput;
  h.edit("用户正在改"); h.globals({ toolOutput: original });
  h.globals({ toolOutput: { ...original, renderId: "new", sourceText: undefined, title: "不匹配的标题" } });
  assert.equal(h.el("reply").textContent, "用户正在改"); assert.notEqual(h.window.document.title, "不匹配的标题");
});

test("a reused iframe waits for current edits before switching bodies", async (t) => {
  const h = await widget(t); h.edit("未保存修改");
  h.globals({ toolOutput: { renderId: "new", projectDir: "/workspace/other", sourceText: "另一条正文", current: null } });
  assert.equal(h.el("reply").textContent, "未保存修改"); h.el("cancel").click();
  await waitFor(() => h.el("reply").textContent === "另一条正文");
});

test("pagehide flushes a draft but never commits authority", async (t) => {
  const h = await widget(t); h.edit("切换前的草稿"); h.window.dispatchEvent(new h.window.Event("pagehide"));
  await waitFor(() => h.calls.length === 1); assert.equal(h.calls[0].name, "save_context_draft");
});

test("Escape cancels and Ctrl+Enter saves without a modal", async (t) => {
  const h = await widget(t); h.edit("取消这次");
  h.el("reply").dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => h.el("edit-actions").hidden); assert.equal(h.el("reply").textContent, "原来的正文");
  h.edit("键盘保存"); h.el("reply").dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  await waitFor(() => h.notices.length === 1);
});

test("extension mode displays only its bounded body and uses restricted tools", async (t) => {
  const h = await widget(t, { output: { renderId: "ext", projectDir: "/workspace/demo", mode: "extension", sourceText: "块内候选", current: { id: "rev-1", content: "固定外文" }, extension: { name: "补充", baseRevisionId: "rev-1", currentContent: "块内旧文" } }, call: async () => ({ structuredContent: { revision: { id: "rev-ext", content: "固定外文和新块" } } }) });
  h.el("reply").focus(); h.el("save").click(); await waitFor(() => h.notices.length === 1);
  assert.deepEqual(h.calls.map((call) => call.name), ["save_context_extension_revision", "commit_authoritative_context"]);
  assert.equal(h.calls[0].arguments.extensionContent, "块内候选"); assert.equal(h.el("reply").textContent, "块内候选");
});

test("host theme changes do not touch the active document", async (t) => {
  const h = await widget(t); h.edit("保持光标位置");
  h.globals({ hostContext: { theme: "dark", styles: { variables: { "--color-text-primary": "#eeeeee" } } } });
  assert.equal(h.window.document.documentElement.dataset.theme, "dark"); assert.equal(h.el("reply").textContent, "保持光标位置");
});

test("extension commit failure preserves the candidate and can safely retry", async (t) => {
  let fail = true;
  const h = await widget(t, { output: { renderId: "ext-retry", projectDir: "/workspace/demo", mode: "extension", sourceText: "新块", current: { id: "rev-1", content: "固定正文" }, extension: { name: "补充", baseRevisionId: "rev-1", currentContent: "旧块" } }, call: async (request) => {
    if (request.name === "commit_authoritative_context" && fail) throw new Error("提交失败");
    return { structuredContent: { revision: { id: "rev-ext", content: "固定正文和新块" } } };
  } });
  h.el("reply").focus(); h.el("save").click();
  await waitFor(() => h.el("status").textContent.includes("提交失败"));
  assert.equal(h.el("reply").textContent, "新块"); assert.equal(h.notices.length, 0);
  fail = false; h.el("save").click(); await waitFor(() => h.notices.length === 1);
  assert.equal(h.calls.filter((call) => call.name === "commit_authoritative_context").at(-1).arguments.expectedCurrentRevisionId, "rev-1");
});

test("notification timeout keeps the saved result and offers a retry", async (t) => {
  const h = await widget(t, { timeout: 20, notify: () => new Promise(() => {}) });
  h.edit("保存成功但通知超时"); h.el("save").click();
  await waitFor(() => !h.el("retry-notice").hidden);
  assert.match(h.el("status").textContent, /正文已保存.*超时/);
  assert.equal(h.el("edit-actions").hidden, true);
});

test("undoing to the original removes the persisted draft before reopening", async (t) => {
  const fixture = await draftFixture();
  const h = await widget(t, fixture);
  h.edit("撤销掉的修改");
  await waitFor(() => h.el("status").textContent.includes("草稿已保留"));
  h.edit("原来的正文");
  h.window.dispatchEvent(new h.window.Event("pagehide"));
  await waitFor(() => h.el("status").textContent === "");
  assert.equal(h.el("save").disabled, true);
  assert.equal(await getContextDraft(fixture), null);
});

test("a host render arriving just after undo waits for draft cleanup", async (t) => {
  const fixture = await draftFixture();
  const h = await widget(t, fixture);
  h.edit("已经撤销的修改");
  await waitFor(() => h.el("status").textContent.includes("草稿已保留"));
  h.edit("原来的正文");
  h.globals({ toolOutput: { renderId: "after-undo", projectDir: "/workspace/other", sourceText: "下一条正文", current: null } });
  await waitFor(() => h.el("reply").textContent === "下一条正文");
  assert.equal(await getContextDraft(fixture), null);
});

test("cancel in one widget preserves another widget's newer draft", async (t) => {
  const fixture = await draftFixture();
  const a = await widget(t, fixture), b = await widget(t, fixture);
  a.edit("窗口 A 的修改");
  await waitFor(() => a.el("status").textContent.includes("草稿已保留"));
  b.edit("窗口 B 的修改");
  await waitFor(() => b.el("status").textContent.includes("草稿已保留"));
  a.el("cancel").click();
  await waitFor(() => a.el("edit-actions").hidden);
  assert.equal((await getContextDraft(fixture))?.content, "窗口 B 的修改");
  a.edit("取消后重新编辑");
  await waitFor(() => a.el("status").textContent.includes("草稿已保留"));
  assert.equal((await getContextDraft(fixture))?.content, "取消后重新编辑");
});

test("cancelling a recovered draft preserves a different session's later edits", async (t) => {
  const fixture = await draftFixture();
  const recovered = await saveContextDraft({ projectDir: fixture.projectDir, content: "恢复的草稿", baseRevisionId: "rev-1", draftSessionId: "recovered", draftVersion: 1 });
  const a = await widget(t, { ...fixture, output: { ...fixture.output, sourceKind: "draft", sourceText: recovered.content, draft: recovered } });
  const b = await widget(t, fixture);
  b.edit("另一个窗口的后续修改");
  await waitFor(() => b.el("status").textContent.includes("草稿已保留"));
  a.el("cancel").click();
  await waitFor(() => a.el("edit-actions").hidden);
  assert.equal((await getContextDraft(fixture))?.content, "另一个窗口的后续修改");
});

test("a timed-out draft cannot reappear after cancel when its write completes late", async (t) => {
  const fixture = await draftFixture();
  let completeWrite;
  const h = await widget(t, { ...fixture, timeout: 30, call: async (request) => {
    if (request.name !== "save_context_draft") return fixture.call(request);
    return new Promise((resolve, reject) => { completeWrite = () => fixture.call(request).then(resolve, reject); });
  } });
  h.edit("延迟完成的草稿");
  await waitFor(() => h.el("status").textContent.includes("超时"));
  h.el("cancel").click();
  await waitFor(() => h.el("edit-actions").hidden);
  await completeWrite();
  assert.equal(h.el("reply").textContent, "原来的正文");
  assert.equal(await getContextDraft(fixture), null);
});

test("queued renders preserve a failed notice until retry succeeds", async (t) => {
  let fail = true;
  const h = await widget(t, { notify: async () => { if (fail) throw new Error("通知失败"); } });
  h.edit("已经保存的正文");
  h.globals({ toolOutput: { renderId: "queued", projectDir: "/workspace/other", sourceText: "下一条正文", current: null } });
  h.el("save").click();
  await waitFor(() => h.notices.length === 1);
  await pause();
  assert.equal(h.el("reply").textContent, "已经保存的正文");
  assert.equal(h.el("retry-notice").hidden, false);
  assert.match(h.el("status").textContent, /通知对话未完成/);
  fail = false;
  h.el("retry-notice").click();
  await waitFor(() => h.el("reply").textContent === "下一条正文");
  assert.equal(h.notices.length, 2);
});
