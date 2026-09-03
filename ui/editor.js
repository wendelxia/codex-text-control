(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const editor = $("editor");
  const canvas = $("canvas");
  const canvasEditor = $("canvas-editor");
  const status = $("status");
  const reviewDialog = $("review-dialog");
  const reviewContent = $("review-content");
  const requestTimeoutMs = Number(window.__CTC_REQUEST_TIMEOUT_MS__) > 0 ? Number(window.__CTC_REQUEST_TIMEOUT_MS__) : 30_000;
  const state = {
    projectDir: "",
    revisions: [],
    current: null,
    bridgeState: "connecting",
    dataReady: false,
    busyAction: "",
    renderId: "",
    mode: "full",
    extension: null,
    draft: null,
    draftPersisted: false,
    draftSaveTimer: null,
    draftSaveInFlight: null,
    draftOperation: null,
    composing: false,
    view: "canvas",
    dirty: false,
    editVersion: 0,
    pendingNotice: null,
    reviewContent: "",
    reviewEditVersion: 0,
    limits: { content: 1_000_000 },
  };

  const setStatus = (message, kind = "success") => {
    status.textContent = String(message || "");
    status.dataset.kind = kind;
  };
  const withTimeout = (work, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(message);
      error.code = "TIMEOUT";
      reject(error);
    }, requestTimeoutMs);
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
  const tool = async (name, args, label) => {
    if (state.bridgeState !== "ready" || !window.codexTextControlMcp?.callServerTool) {
      throw new Error("Codex 工具桥接尚未就绪，请稍后重试。");
    }
    const result = await withTimeout(
      window.codexTextControlMcp.callServerTool({ name, arguments: args }),
      `${label || name}超时，结果未知。请重新打开画布核对版本历史。`,
    );
    if (result?.isError) throw new Error(result.content?.[0]?.text || "工具调用失败。");
    return result?.structuredContent || result?.result || {};
  };
  const syncControls = () => {
    const unavailable = state.bridgeState !== "ready" || !state.dataReady;
    const busy = Boolean(state.busyAction);
    $("finish-editing").disabled = unavailable || busy;
    $("reset").disabled = busy || !(state.mode === "extension" ? typeof state.extension?.currentContent === "string" : state.current?.content);
    $("load-draft").disabled = unavailable || busy || !state.draft?.content || !state.draft?.conflict;
    $("canvas-tab").disabled = state.mode === "extension";
    $("review-cancel").disabled = busy;
    $("review-submit").disabled = unavailable || busy;
    editor.readOnly = busy;
    canvasEditor.readOnly = busy;
    canvasEditor.disabled = busy;
  };
  const setBridgeStatus = (bridgeStatus) => {
    if (!bridgeStatus || typeof bridgeStatus !== "object") return;
    state.bridgeState = bridgeStatus.state || "failed";
    if (state.bridgeState === "ready" && state.dataReady) setStatus("已连接 Codex，完成编辑时保存。", "warning");
    else if (state.bridgeState === "ready") setStatus("已连接 Codex，正在加载上下文...", "busy");
    else if (state.bridgeState === "connecting") setStatus(bridgeStatus.message || "正在连接 Codex...", "busy");
    else setStatus(bridgeStatus.message || "Codex 桥接不可用，请关闭画布后重试。", "error");
    syncControls();
  };
  const currentMarkdown = () => state.mode === "extension" || state.view === "source"
    ? editor.value
    : canvasEditor.value;
  const draftArguments = (content) => ({
    projectDir: state.projectDir,
    content,
    baseRevisionId: state.current?.revisionId || state.current?.id || null,
    mode: state.mode,
    ...(state.mode === "extension" ? { extensionPoint: state.extension?.name || "" } : {}),
  });
  const validateContent = (content) => {
    if (!content.trim()) throw new Error("上下文正文不能为空。");
    if (content.length > state.limits.content) throw new Error(`上下文正文不能超过 ${state.limits.content} 个字符。`);
  };
  const rememberRevision = (revision) => {
    if (!revision?.id) throw new Error("工具没有返回修订版本编号。");
    state.revisions = [...state.revisions.filter((item) => item.id !== revision.id), revision];
    return revision;
  };
  const sendVersionNotice = async (followUpMessage, revisionId) => {
    if (!followUpMessage || !window.codexTextControlMcp?.sendFollowUpMessage) {
      setStatus(`已保存 ${revisionId}，但宿主没有消息回传能力。`, "warning");
      return false;
    }
    try {
      await withTimeout(
        window.codexTextControlMcp.sendFollowUpMessage({ role: "user", content: [{ type: "text", text: followUpMessage }] }),
        "画布已保存，但向当前对话回传版本通知超时。",
      );
      setStatus(`已同步 ${revisionId}，可以返回对话。`);
      return true;
    } catch (error) {
      const timedOut = error?.code === "TIMEOUT" || String(error?.message || "").includes("超时");
      setStatus(
        timedOut
          ? `已保存 ${revisionId}；版本通知是否到达仍然未知。`
          : `已保存 ${revisionId}，但版本通知失败：${error?.message || "消息通道不可用"}`,
        "warning",
      );
      return false;
    }
  };
  const versionNotice = (revisionId) => `【上下文画布已更新】\n版本：${revisionId}\n正文不在聊天中重复。后续回答前请调用 get_authoritative_context 读取当前权威内容。`;
  const renderMeta = () => {
    if (state.dirty) $("meta").textContent = `当前版本：${state.current?.id || "无"} · 有尚未保存的修改`;
    else if (state.current) $("meta").textContent = `当前权威版本：${state.current.id}`;
    else $("meta").textContent = "当前项目还没有权威上下文。";
  };
  const renderHistory = () => {
    const history = $("history");
    history.replaceChildren();
    if (!state.revisions.length) {
      const empty = document.createElement("p");
      empty.className = "meta";
      empty.textContent = "暂无历史版本。";
      history.append(empty);
      return;
    }
    for (const revision of state.revisions) {
      const row = document.createElement("div");
      row.className = "revision";
      const copy = document.createElement("span");
      copy.className = "revision-copy";
      copy.textContent = `版本 ${revision.number || "?"} · ${String(revision.id || "未知编号")}\n${String(revision.source || "未知来源")}`;
      const load = document.createElement("button");
      load.type = "button";
      load.textContent = "载入";
      load.addEventListener("click", () => {
        applyMarkdown(String(revision.content || ""));
        state.dirty = true;
        state.editVersion += 1;
        setStatus(`已载入 ${revision.id}，完成编辑时会保存为新版本。`, "warning");
        renderMeta();
      });
      row.append(copy, load);
      history.append(row);
    }
  };
  const enqueueDraftOperation = (operation) => {
    const previous = state.draftOperation;
    const next = (previous ? previous.catch(() => {}) : Promise.resolve()).then(operation);
    state.draftOperation = next;
    next.then(
      () => { if (state.draftOperation === next) state.draftOperation = null; },
      () => { if (state.draftOperation === next) state.draftOperation = null; },
    );
    return next;
  };
  const waitForDraftOperations = async () => {
    for (;;) {
      const operation = state.draftOperation;
      if (!operation) return;
      await operation.catch(() => {});
    }
  };
  const persistDraft = async () => {
    for (;;) {
      if (state.composing || !state.dirty || state.busyAction || state.bridgeState !== "ready" || !state.dataReady) return null;
      const content = currentMarkdown();
      try {
        validateContent(content);
      } catch {
        return null;
      }
      const editVersion = state.editVersion;
      if (state.draftOperation) {
        await state.draftOperation.catch(() => {});
        if (state.editVersion === editVersion && state.draft?.content === content) return state.draft;
        continue;
      }
      const promise = enqueueDraftOperation(async () => {
        const result = await tool("save_context_draft", draftArguments(content), "保存上下文草稿");
        const draft = result.draft || { ...draftArguments(content), updatedAt: new Date().toISOString() };
        if (state.editVersion === editVersion) {
          state.draft = draft;
          state.draftPersisted = true;
          setStatus("未提交草稿已保存；完成编辑后才会更新权威版本。", "warning");
        }
        return draft;
      }).catch((error) => {
        if (state.editVersion === editVersion) setStatus(`草稿保存失败，但当前画布仍保留：${error?.message || "未知错误"}`, "warning");
        return null;
      });
      state.draftSaveInFlight = promise;
      try {
        const draft = await promise;
        if (state.editVersion !== editVersion) continue;
        return draft;
      } finally {
        if (state.draftSaveInFlight === promise) state.draftSaveInFlight = null;
      }
    }
  };
  const scheduleDraftSave = () => {
    if (state.draftSaveTimer) clearTimeout(state.draftSaveTimer);
    state.draftSaveTimer = setTimeout(() => {
      state.draftSaveTimer = null;
      void persistDraft();
    }, 350);
  };
  const flushDraft = async () => {
    if (state.draftSaveTimer) {
      clearTimeout(state.draftSaveTimer);
      state.draftSaveTimer = null;
    }
    return persistDraft();
  };
  const discardDraft = async ({ force = false } = {}) => {
    if (!force && !state.draftPersisted) {
      state.draft = null;
      return true;
    }
    const discardVersion = state.editVersion;
    const promise = enqueueDraftOperation(async () => {
      await tool("discard_context_draft", {
          projectDir: state.projectDir,
          mode: state.mode,
          ...(state.mode === "extension" ? { extensionPoint: state.extension?.name || "" } : {}),
        }, "丢弃上下文草稿");
      if (state.editVersion === discardVersion) {
        state.draft = null;
        state.draftPersisted = false;
      }
      return true;
    });
    try {
      return await promise;
    } catch (error) {
      setStatus(`正式版本已保存，但草稿清理失败：${error?.message || "未知错误"}`, "warning");
      return false;
    }
  };
  const loadConflictDraft = () => {
    if (!state.draft?.content || !state.draft.conflict) return;
    try {
      validateContent(state.draft.content);
      applyMarkdown(state.draft.content);
    } catch (error) {
      setStatus(error?.message || "冲突草稿无法载入。", "error");
      return;
    }
    const currentRevisionId = state.current?.revisionId || state.current?.id || null;
    state.draft = { ...state.draft, baseRevisionId: currentRevisionId, conflict: false };
    state.draftPersisted = true;
    state.dirty = true;
    state.editVersion += 1;
    $("load-draft").hidden = true;
    renderMeta();
    syncControls();
    setStatus("已载入过期草稿；请核对完整正文，确认无误后再提交。", "warning");
  };
  const markDirty = (event = {}) => {
    state.editVersion += 1;
    state.dirty = true;
    renderMeta();
    if (!state.composing && !event.isComposing) scheduleDraftSave();
    setStatus("修改仅保存在当前画布，点击完成编辑后保存。", "warning");
  };
  const ensureCanvasEditor = () => {
    if (canvasEditor.parentElement !== canvas) canvas.append(canvasEditor);
  };
  function applyMarkdown(markdown) {
    const text = String(markdown ?? "");
    ensureCanvasEditor();
    editor.value = text;
    canvasEditor.value = text;
  }
  const setView = (view) => {
    if (view === state.view) return;
    if (view === "canvas" && state.mode === "extension") return;
    if (view === "canvas") {
      ensureCanvasEditor();
      canvasEditor.value = editor.value;
    } else {
      editor.value = canvasEditor.value;
    }
    state.view = view;
    $("canvas-view").hidden = view !== "canvas";
    $("source-view").hidden = view !== "source";
    $("canvas-tab").setAttribute("aria-selected", view === "canvas" ? "true" : "false");
    $("source-tab").setAttribute("aria-selected", view === "source" ? "true" : "false");
  };
  async function flushSave(reviewedContent, reviewedEditVersion) {
    if (state.draftSaveTimer) {
      clearTimeout(state.draftSaveTimer);
      state.draftSaveTimer = null;
    }
    await waitForDraftOperations();
    if (!state.dirty) {
      setStatus("当前内容已经是最新版本。");
      return state.current;
    }
    if (state.busyAction) return null;
    try {
      const content = typeof reviewedContent === "string" ? reviewedContent : currentMarkdown();
      const saveVersion = Number.isInteger(reviewedEditVersion) ? reviewedEditVersion : state.editVersion;
      validateContent(content);
      const currentRevisionId = state.current?.revisionId || state.current?.id || null;
      if (state.draft?.conflict || (state.draft?.baseRevisionId && state.draft.baseRevisionId !== currentRevisionId)) {
        throw new Error("草稿基线对应的权威版本已变化，请重新打开画布核对后再提交。");
      }
      if (content === state.current?.content) {
        state.dirty = false;
        renderMeta();
        setStatus("当前内容已经是最新版本。");
        return state.current;
      }
      state.busyAction = "save";
      syncControls();
      setStatus("正在保存上下文...", "busy");
      let result;
      if (state.mode === "extension") {
        const extension = state.extension;
        const saved = await tool("save_context_extension_revision", {
          projectDir: state.projectDir,
          baseRevisionId: extension.baseRevisionId,
          extensionPoint: extension.name,
          extensionContent: content,
        }, "保存扩展点");
        const committed = await tool("commit_authoritative_context", {
          projectDir: state.projectDir,
          revisionId: saved.revision.id,
          expectedCurrentRevisionId: extension.baseRevisionId,
        }, "更新扩展点");
        result = {
          ...committed,
          followUpMessage: `【上下文画布已更新】\n版本：${saved.revision.id}\n正文不在聊天中重复。后续回答前请调用 get_authoritative_context 读取当前权威内容。`,
        };
        state.extension.baseRevisionId = saved.revision.id;
        state.extension.currentContent = content;
      } else {
        result = await tool("update_authoritative_context", {
          projectDir: state.projectDir,
          content,
          expectedCurrentRevisionId: state.current?.revisionId || state.current?.id || null,
        }, "更新上下文画布");
      }
      const revision = rememberRevision(result.revision);
      state.current = { ...revision, revisionId: revision.id, authoritative: true, committedAt: result.committedAt };
      if (state.draftPersisted) await discardDraft();
      else state.draft = null;
      state.dirty = state.editVersion !== saveVersion;
      renderHistory();
      renderMeta();
      state.pendingNotice = {
        followUpMessage: result.followUpMessage || versionNotice(revision.id),
        revisionId: revision.id,
      };
      setStatus(`已保存 ${revision.id}，正在同步到对话。`);
      return state.current;
    } catch (error) {
      state.dirty = true;
      setStatus(error?.message || "保存失败，画布内容仍保留。", "error");
      renderMeta();
      return null;
    } finally {
      state.busyAction = "";
      syncControls();
    }
  }
  async function finishEditing(reviewedContent, reviewedEditVersion) {
    if (state.bridgeState !== "ready" || !state.dataReady) {
      setStatus("Codex 尚未连接，暂时不能完成编辑。", "error");
      return;
    }
    if (state.busyAction) {
      setStatus("正在保存，请等待当前操作完成。", "busy");
      return;
    }
    if (state.dirty) {
      if (typeof reviewedContent === "string"
        && (reviewedEditVersion !== state.editVersion || reviewedContent !== currentMarkdown())) {
        setStatus("原文在检查后发生了变化，请重新检查再提交。", "warning");
        return;
      }
      const saved = await flushSave(reviewedContent, reviewedEditVersion);
      if (!saved) return;
      if (state.dirty) {
        setStatus("保存期间内容发生变化，请再次点击完成编辑。", "warning");
        return;
      }
    }
    const notice = state.pendingNotice;
    if (!notice) {
      setStatus("当前没有需要同步的新修改。");
      return;
    }
    state.busyAction = "notify";
    syncControls();
    const sent = await sendVersionNotice(notice.followUpMessage, notice.revisionId);
    if (sent && state.pendingNotice?.revisionId === notice.revisionId) state.pendingNotice = null;
    state.busyAction = "";
    syncControls();
  }
  const clearReview = () => {
    state.reviewContent = "";
    state.reviewEditVersion = 0;
    reviewContent.textContent = "";
  };
  const closeReview = () => {
    if (reviewDialog.open) reviewDialog.close();
    clearReview();
    $("finish-editing").focus();
  };
  const requestFinishReview = () => {
    if (state.bridgeState !== "ready" || !state.dataReady) {
      setStatus("Codex 尚未连接，暂时不能完成编辑。", "error");
      return;
    }
    if (state.busyAction) {
      setStatus("正在保存，请等待当前操作完成。", "busy");
      return;
    }
    if (!state.dirty) {
      void finishEditing();
      return;
    }
    const content = currentMarkdown();
    try {
      validateContent(content);
    } catch (error) {
      setStatus(error?.message || "无法检查待提交原文。", "error");
      return;
    }
    state.reviewContent = content;
    state.reviewEditVersion = state.editVersion;
    reviewContent.textContent = content;
    reviewContent.scrollTop = 0;
    if (!reviewDialog.open) reviewDialog.showModal();
    reviewContent.focus();
  };
  const submitReview = async () => {
    if (!reviewDialog.open || !state.reviewContent) return;
    const content = state.reviewContent;
    const editVersion = state.reviewEditVersion;
    if (editVersion !== state.editVersion || content !== currentMarkdown()) {
      closeReview();
      setStatus("原文在检查后发生了变化，请重新检查再提交。", "warning");
      return;
    }
    reviewDialog.close();
    clearReview();
    await finishEditing(content, editVersion);
  };
  const loadData = (data) => {
    if (!data || typeof data !== "object") return;
    const projectArrived = typeof data.projectDir === "string" && Boolean(data.projectDir.trim());
    if (projectArrived) {
      state.projectDir = data.projectDir;
      state.dataReady = true;
    }
    state.revisions = Array.isArray(data.revisions) ? data.revisions : state.revisions;
    if (Number(data.limits?.content) > 0) state.limits.content = Number(data.limits.content);
    editor.maxLength = state.limits.content;
    if (Object.prototype.hasOwnProperty.call(data, "current")) state.current = data.current;
    if (Object.prototype.hasOwnProperty.call(data, "draft")) {
      state.draft = data.draft;
      state.draftPersisted = Boolean(data.draft?.content);
    }
    if (typeof data.title === "string" && data.title.trim()) {
      $("page-title").textContent = data.title.trim();
      document.title = data.title.trim();
    }
    const incomingRenderId = typeof data.renderId === "string" ? data.renderId : "";
    const isNewRender = Boolean(incomingRenderId && incomingRenderId !== state.renderId);
    const isFirstPayload = !state.renderId && (typeof data.mode === "string" || typeof data.sourceText === "string");
    if (isNewRender || isFirstPayload) {
      if (reviewDialog.open) reviewDialog.close();
      clearReview();
      state.mode = data.mode === "extension" ? "extension" : "full";
      state.extension = state.mode === "extension" && data.extension && typeof data.extension === "object" ? { ...data.extension } : null;
      $("history-panel").hidden = state.mode === "extension";
      $("editor-label").textContent = state.mode === "extension" ? `扩展内容：${String(state.extension?.name || "未命名")}` : "Markdown 源码";
      const sourceText = data.sourceKind === "draft" && data.draft?.content && !data.draft.conflict
        ? String(data.draft.content)
        : typeof data.sourceText === "string" ? data.sourceText : null;
      if (sourceText !== null) applyMarkdown(sourceText);
      setView(state.mode === "extension" ? "source" : "canvas");
      const baseline = state.mode === "extension" ? state.extension?.currentContent : state.current?.content;
      state.dirty = sourceText !== null && sourceText !== String(baseline ?? "");
      state.pendingNotice = null;
    }
    if (incomingRenderId) state.renderId = incomingRenderId;
    renderHistory();
    renderMeta();
    syncControls();
    if (state.draft?.conflict) {
      setStatus("检测到基线已过期的未提交草稿，当前画布显示最新权威正文；请核对后再手动载入草稿。", "warning");
    } else if (state.draft?.content && state.dirty) {
      setStatus(state.draft.conflict
        ? "已恢复未提交草稿，但权威版本已变化；提交前请核对并确认。"
        : "已恢复未提交草稿；完成编辑后才会更新权威版本。", "warning");
    }
    else if (projectArrived && state.bridgeState === "ready" && !state.busyAction) setStatus("已连接 Codex，完成编辑时保存。", "warning");
    $("load-draft").hidden = !(state.draft?.content && state.draft?.conflict);
    syncControls();
  };

  $("canvas-tab").addEventListener("click", () => setView("canvas"));
  $("source-tab").addEventListener("click", () => setView("source"));
  $("reset").addEventListener("click", () => {
    const content = state.mode === "extension" ? state.extension?.currentContent : state.current?.content;
    if (typeof content !== "string") {
      setStatus("当前还没有可恢复的权威版本。", "warning");
      return;
    }
    applyMarkdown(content);
    state.editVersion += 1;
    state.dirty = false;
    const hadDraft = state.draftPersisted;
    if (hadDraft) void discardDraft({ force: true });
    state.draft = null;
    state.draftPersisted = false;
    if (state.draftSaveTimer) {
      clearTimeout(state.draftSaveTimer);
      state.draftSaveTimer = null;
    }
    renderMeta();
    setStatus("已恢复当前权威版本。");
  });
  $("load-draft").addEventListener("click", loadConflictDraft);
  $("finish-editing").addEventListener("click", requestFinishReview);
  $("review-cancel").addEventListener("click", closeReview);
  $("review-submit").addEventListener("click", () => { void submitReview(); });
  reviewDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReview();
  });
  const compositionStart = () => { state.composing = true; };
  const compositionEnd = () => {
    state.composing = false;
    if (state.dirty) scheduleDraftSave();
  };
  editor.addEventListener("input", markDirty);
  canvasEditor.addEventListener("input", markDirty);
  editor.addEventListener("compositionstart", compositionStart);
  canvasEditor.addEventListener("compositionstart", compositionStart);
  editor.addEventListener("compositionend", compositionEnd);
  canvasEditor.addEventListener("compositionend", compositionEnd);
  window.addEventListener("pagehide", () => { void flushDraft(); });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushDraft();
  });
  window.addEventListener("openai:set_globals", (event) => {
    const globals = event.detail?.globals;
    setBridgeStatus(globals?.codexTextControlBridgeStatus);
    loadData(globals?.toolOutput);
  });
  window.addEventListener("message", (event) => {
    const result = event.data?.params?.result;
    if (event.data?.method === "ui/notifications/tool-result") loadData(result?._meta?.widgetData || result?.structuredContent);
  });

  setBridgeStatus(window.openai?.codexTextControlBridgeStatus || { state: window.codexTextControlMcp ? "ready" : "connecting" });
  loadData(window.openai?.toolOutput);
})();
