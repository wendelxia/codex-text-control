(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const reply = $("reply"), rich = window.CodexRichText.create(reply);
  const timeoutMs = Number(window.__CTC_REQUEST_TIMEOUT_MS__) || 30_000;
  const draftDelay = Number(window.__CTC_DRAFT_DELAY_MS__) || 400;
  const newDraftSession = () => Array.from(window.crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, "0")).join("");
  const state = {
    projectDir: "", renderId: "", ready: false, bridge: "connecting", mode: "full", extension: null,
    current: null, content: "", original: "", committed: "", editing: false, composing: false,
    busy: "", draft: null, draftPersisted: false, draftQueue: Promise.resolve(), draftWriting: false,
    draftSessionId: newDraftSession(), draftSessions: new Set(),
    timer: null, version: 0, epoch: 0, limit: 1_000_000, pendingNotice: null, queuedRender: null,
  };
  const status = (text = "", kind = "info") => { $("status").textContent = text; $("status").dataset.kind = kind; };
  const revisionId = () => state.current?.revisionId || state.current?.id || null;
  const changed = () => state.content !== state.original;
  function controls() {
    const busy = Boolean(state.busy);
    reply.setAttribute("contenteditable", String(state.ready && !busy));
    reply.setAttribute("aria-busy", String(busy));
    $("edit-actions").hidden = !state.editing;
    $("save").disabled = !state.ready || state.bridge !== "ready" || busy || state.composing || state.content === state.committed;
    $("cancel").disabled = busy || state.composing;
    $("save").textContent = state.busy === "save" ? "保存中…" : "保存";
    $("load-draft").hidden = !state.draft?.conflict;
    $("load-draft").disabled = busy || state.composing;
    $("retry-notice").hidden = !state.pendingNotice || busy;
  }
  const withTimeout = (promise, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时，结果未知；修改仍保留。`)), timeoutMs);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
  async function tool(name, args, label) {
    if (state.bridge !== "ready" || !window.codexTextControlMcp?.callServerTool) throw new Error("尚未连接 Codex，修改仍保留。");
    const result = await withTimeout(window.codexTextControlMcp.callServerTool({ name, arguments: args }), label);
    if (result?.isError) throw new Error(result.content?.[0]?.text || `${label}失败。`);
    return result?.structuredContent || result?.result || {};
  }
  function validate(content) {
    if (!content.trim()) throw new Error("正文不能为空，修改仍保留。");
    if (content.length > state.limit) throw new Error(`正文不能超过 ${state.limit} 个字符。`);
  }
  function applyContent(content) { state.content = String(content); rich.setMarkdown(state.content); }
  function clearTimer() { clearTimeout(state.timer); state.timer = null; }
  function draftArgs() {
    return { projectDir: state.projectDir, mode: state.mode, ...(state.extension ? { extensionPoint: state.extension.name } : {}) };
  }
  async function persistDraft() {
    if (!state.editing || state.composing || state.busy || state.draft?.conflict || state.bridge !== "ready" || !state.ready) return;
    if (state.draftWriting) return;
    if (!changed() && !state.draftSessions.size) return;
    state.draftWriting = true;
    const epoch = state.epoch;
    const args = { ...draftArgs(), content: state.content, baseRevisionId: revisionId(), draftSessionId: state.draftSessionId, draftVersion: state.version };
    const version = state.version;
    const undo = !changed();
    if (!undo) {
      try { validate(args.content); } catch { state.draftWriting = false; return; }
      // Track the session before sending: a timeout does not mean the backend did not write it.
      state.draftSessions.add(args.draftSessionId);
    }
    const operation = state.draftQueue.catch(() => {}).then(async () => {
      if (undo) {
        await clearDraft();
        if (state.version === version && !state.busy) status();
        return;
      }
      const result = await tool("save_context_draft", args, "保存草稿");
      if (state.epoch === epoch) {
        state.draftPersisted = true;
        state.draft = result.draft || args;
        if (state.version === version && !state.busy) status("草稿已保留，尚未保存到对话");
      }
    });
    state.draftQueue = operation;
    try { await operation; }
    catch (error) { if (state.epoch === epoch && !state.busy) status(`草稿暂未写入，修改仍在这里：${error.message}`, "error"); }
    finally {
      state.draftWriting = false;
      if (state.epoch === epoch && state.version !== version && !state.busy) void persistDraft();
      applyQueuedRender();
    }
  }
  function scheduleDraft() { clearTimer(); if (!state.composing) state.timer = setTimeout(() => { state.timer = null; void persistDraft(); }, draftDelay); }
  function begin() {
    if (!state.ready || state.busy) return;
    state.editing = true;
    if (!state.draft?.conflict) status(changed() ? "尚未保存" : "");
    controls();
  }
  function input() {
    if (state.busy || !state.ready) return;
    state.editing = true; state.version += 1;
    if (!state.composing) state.content = rich.getMarkdown();
    status("尚未保存"); controls(); scheduleDraft();
  }
  async function clearDraft() {
    for (const draftSessionId of state.draftSessions) {
      await tool("discard_context_draft", { ...draftArgs(), ...(draftSessionId ? { draftSessionId } : {}) }, "清理草稿");
      state.draftSessions.delete(draftSessionId);
    }
    state.draftSessionId = newDraftSession();
    state.draftPersisted = false; state.draft = null;
  }
  function applyQueuedRender() {
    if (!state.queuedRender || state.busy || state.draftWriting || state.pendingNotice || (state.editing && (changed() || state.draftSessions.size))) return;
    const next = state.queuedRender; state.queuedRender = null; load(next);
  }
  async function cancel() {
    if (state.busy || state.composing || !state.editing) return;
    clearTimer(); state.busy = "cancel"; controls();
    try {
      await state.draftQueue.catch(() => {});
      await clearDraft();
      applyContent(state.original); state.version += 1; state.editing = false;
      reply.blur(); status();
    } catch (error) { status(`取消未完成，修改仍保留：${error.message}`, "error"); }
    finally { state.busy = ""; controls(); applyQueuedRender(); }
  }
  const noticeFor = (id) => `【上下文画布已更新】\n版本：${id}\n正文不在聊天中重复。后续回答前请调用 get_authoritative_context 读取当前确认内容；若 truncated 为 true，按任务需要读取完整正文。`;
  async function notify() {
    const notice = state.pendingNotice;
    if (!notice) return true;
    try {
      if (!window.codexTextControlMcp?.sendFollowUpMessage) throw new Error("宿主没有消息回传能力");
      const result = await withTimeout(window.codexTextControlMcp.sendFollowUpMessage({ role: "user", content: [{ type: "text", text: notice.text }] }), "发送版本通知");
      if (result?.isError) throw new Error("宿主未接受版本通知");
      if (state.pendingNotice === notice) state.pendingNotice = null;
      status("已保存"); return true;
    } catch (error) { status(`正文已保存，通知对话未完成：${error.message}`, "error"); return false; }
  }
  async function save() {
    if (state.busy || state.composing || !state.ready || state.bridge !== "ready") return;
    state.content = rich.getMarkdown();
    if (state.content === state.committed) return;
    try {
      validate(state.content);
      if (state.draft?.conflict) throw new Error("旧草稿基线已过期；请先取消草稿或显式载入核对。");
    } catch (error) { status(error.message, "error"); return; }
    const content = state.content;
    state.busy = "save"; clearTimer(); controls(); status("正在保存…");
    try {
      await state.draftQueue.catch(() => {});
      let result;
      if (state.mode === "extension") {
        const extension = state.extension;
        const saved = await tool("save_context_extension_revision", { projectDir: state.projectDir, baseRevisionId: extension.baseRevisionId, extensionPoint: extension.name, extensionContent: content }, "保存扩展点");
        result = await tool("commit_authoritative_context", { projectDir: state.projectDir, revisionId: saved.revision.id, expectedCurrentRevisionId: extension.baseRevisionId }, "确认扩展点");
        extension.baseRevisionId = saved.revision.id; extension.currentContent = content;
        result.followUpMessage = noticeFor(saved.revision.id);
      } else {
        result = await tool("update_authoritative_context", { projectDir: state.projectDir, content, expectedCurrentRevisionId: revisionId() }, "保存正文");
      }
      if (!result.revision?.id) throw new Error("未收到版本编号，请重新打开核对；修改仍保留。");
      state.current = result.revision;
      state.original = content; state.committed = content;
      applyContent(content); state.editing = false; reply.blur();
      state.pendingNotice = { id: result.revision.id, text: result.followUpMessage || noticeFor(result.revision.id) };
      let cleanupError = null;
      try { await clearDraft(); } catch (error) { cleanupError = error; }
      const sent = await notify();
      if (cleanupError && sent) status("正文已保存；旧草稿清理未完成，重新打开时请核对。", "error");
    } catch (error) { state.editing = true; status(error.message || "保存失败，修改仍保留。", "error"); }
    finally { state.busy = ""; controls(); applyQueuedRender(); }
  }
  function theme(context) {
    if (!context) return;
    if (["light", "dark"].includes(context.theme)) document.documentElement.dataset.theme = context.theme;
    for (const [name, value] of Object.entries(context.styles?.variables || {})) {
      if (/^--(?:color-|font-)/.test(name) && typeof value === "string") document.documentElement.style.setProperty(name, value);
    }
  }
  function load(data) {
    if (!data || typeof data.sourceText !== "string" || !data.projectDir) return;
    if (state.ready && (!data.renderId || data.renderId === state.renderId)) return;
    if (state.busy || state.draftWriting || state.pendingNotice || (state.editing && (changed() || state.draftSessions.size))) {
      state.queuedRender = data;
      if (!state.pendingNotice) status("还有一份新正文，完成当前保存或取消后显示。");
      return;
    }
    clearTimer(); state.epoch += 1; state.version += 1;
    state.renderId = data.renderId || "initial"; state.projectDir = data.projectDir; state.ready = true;
    state.current = data.current || null; state.mode = data.mode === "extension" ? "extension" : "full";
    state.extension = state.mode === "extension" ? { ...data.extension } : null;
    state.committed = state.extension ? state.extension.currentContent : (state.current?.content ?? "");
    state.draft = data.sourceKind === "candidate" ? null : (data.draft || null);
    state.draftPersisted = Boolean(state.draft);
    state.draftSessionId = newDraftSession();
    state.draftSessions = new Set(state.draft ? [state.draft.draftSessionId || null] : []);
    const recovered = Boolean(state.draft && !state.draft.conflict && data.sourceKind === "draft");
    state.original = recovered ? state.committed : data.sourceText;
    applyContent(recovered ? state.draft.content : data.sourceText);
    state.editing = recovered; state.pendingNotice = null;
    state.limit = Number(data.limits?.content) || 1_000_000;
    document.title = data.title || "可编辑回复";
    status(state.draft?.conflict ? "发现旧基线草稿，当前显示最新正文；载入后请核对。" : recovered ? "已恢复草稿，尚未保存" : "");
    controls();
  }
  function globals(data) {
    if (!data) return;
    if (data.codexTextControlBridgeStatus) {
      state.bridge = data.codexTextControlBridgeStatus.state;
      if (state.bridge === "failed") status(data.codexTextControlBridgeStatus.message || "连接失败，修改仍保留。", "error");
    }
    theme(data.hostContext); load(data.toolOutput); controls();
  }
  reply.addEventListener("focus", begin);
  reply.addEventListener("click", (event) => { if (event.target.closest("a")) event.preventDefault(); begin(); });
  reply.addEventListener("input", input);
  reply.addEventListener("compositionstart", () => { state.composing = true; clearTimer(); controls(); });
  reply.addEventListener("compositionend", () => { state.composing = false; input(); });
  reply.addEventListener("paste", (event) => {
    event.preventDefault(); if (state.busy) return;
    const text = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  });
  reply.addEventListener("drop", (event) => event.preventDefault());
  reply.addEventListener("keydown", (event) => {
    if (state.composing || event.isComposing || state.busy) return;
    if (event.key === "Escape") { event.preventDefault(); void cancel(); }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void save(); }
  });
  $("save").addEventListener("click", () => { void save(); });
  $("cancel").addEventListener("click", () => { void cancel(); });
  $("load-draft").addEventListener("click", () => {
    if (state.busy || state.composing || !state.draft?.conflict) return;
    applyContent(state.draft.content); state.draft = { ...state.draft, baseRevisionId: revisionId(), conflict: false };
    state.version += 1; state.editing = true; controls(); status("已载入旧草稿，请核对后保存。");
  });
  $("retry-notice").addEventListener("click", async () => {
    if (state.busy) return;
    state.busy = "notify"; controls(); await notify(); state.busy = ""; controls(); applyQueuedRender();
  });
  window.addEventListener("pagehide", () => { clearTimer(); void persistDraft(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { clearTimer(); void persistDraft(); } });
  window.addEventListener("openai:set_globals", (event) => globals(event.detail?.globals));
  // Only the SDK bridge handles postMessage. Never consume arbitrary tool-result messages directly.
  globals(window.openai);
})();
