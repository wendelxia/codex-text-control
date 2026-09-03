import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  EXTENSION_NAME_LIMIT,
  listContextExtensionPoints,
  replaceContextExtension,
} from "./context-extensions.mjs";

// 这里的“修订版本 revision”是一次完整的文本快照，不是对原文的局部补丁。
// 这样做的好处是：每个版本都能独立恢复，用户不需要猜测某个修改到底改了什么。
const STORE_DIR = ".codex-text-control";
const REVISIONS_DIR = "revisions";
const TRANSITIONS_DIR = "transitions";
const STATE_PROOFS_DIR = "state-proofs";
const COMMITTED_REVISIONS_DIR = "committed-revisions";
const VISIBLE_REVISIONS_DIR = "visible-revisions";
const CONTENT_INDEX_DIR = "content-index";
const CONTENT_INDEX_READY_FILE = "content-index-ready.json";
const AUTHORITY_ANCHOR_FILE = "authority-anchor.json";
const DRAFTS_DIR = "drafts";
const MAX_AUTHORITY_TRANSITIONS = 100_000;
export const CONTEXT_LIMITS = Object.freeze({
  content: 1_000_000,
  note: 2_000,
  source: 100,
  revisionId: 200,
  extensionName: EXTENSION_NAME_LIMIT,
});
export const RECENT_CONTEXT_CHARS = 12_000;

function projectPath(projectDir) {
  const directory = String(projectDir ?? "").trim();
  if (!directory) throw new Error("必须提供当前工作区根目录。");
  if (directory.length > 32_767) throw new Error("当前工作区根目录过长。");
  return resolve(directory);
}

function storePath(projectDir) {
  return join(projectPath(projectDir), STORE_DIR);
}

async function ensureStore(projectDir) {
  const root = storePath(projectDir);
  await Promise.all([
    mkdir(join(root, REVISIONS_DIR), { recursive: true }),
    mkdir(join(root, TRANSITIONS_DIR), { recursive: true }),
    mkdir(join(root, STATE_PROOFS_DIR), { recursive: true }),
    mkdir(join(root, COMMITTED_REVISIONS_DIR), { recursive: true }),
    mkdir(join(root, VISIBLE_REVISIONS_DIR), { recursive: true }),
    mkdir(join(root, CONTENT_INDEX_DIR), { recursive: true }),
    mkdir(join(root, DRAFTS_DIR), { recursive: true }),
  ]);
  return root;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

async function writeJsonExclusiveAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await link(temporaryPath, filePath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    // 目标文件一旦发布成功就已经完整；临时硬链接清理失败不能把成功操作报告成失败。
    await unlink(temporaryPath).catch(() => {});
  }
}

function transitionPath(root, stateId) {
  const stateHash = createHash("sha256").update(stateId).digest("hex");
  return join(root, TRANSITIONS_DIR, `${stateHash}.json`);
}

function stateProofPath(root, stateId) {
  const stateHash = createHash("sha256").update(stateId).digest("hex");
  return join(root, STATE_PROOFS_DIR, `${stateHash}.json`);
}

function committedRevisionPath(root, revisionId) {
  const revisionHash = createHash("sha256").update(revisionId).digest("hex");
  return join(root, COMMITTED_REVISIONS_DIR, `${revisionHash}.json`);
}

function visibleRevisionPath(root, revisionId) {
  const revisionHash = createHash("sha256").update(revisionId).digest("hex");
  return join(root, VISIBLE_REVISIONS_DIR, `${revisionHash}.json`);
}

function contentIndexPath(root, contentHash) {
  return join(root, CONTENT_INDEX_DIR, `${contentHash}.json`);
}

function draftPath(root, mode, extensionPoint = "") {
  const safeMode = mode === "extension" ? "extension" : "full";
  const key = createHash("sha256").update(`${safeMode}\0${extensionPoint}`).digest("hex");
  return join(root, DRAFTS_DIR, `${key}.json`);
}

function draftMode(value) {
  if (value === undefined || value === null || value === "full") return "full";
  if (value === "extension") return "extension";
  throw new Error("草稿模式无效。");
}

function normalizeDraft(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("草稿记录损坏，已拒绝读取。");
  const content = requiredText(value.content, "草稿正文", CONTEXT_LIMITS.content);
  const mode = value.mode === "extension" ? "extension" : value.mode === "full" ? "full" : null;
  if (!mode) throw new Error("草稿模式无效，已拒绝读取。");
  const extensionPoint = optionalText(value.extensionPoint, "扩展点名称", CONTEXT_LIMITS.extensionName);
  if (mode === "extension" && !extensionPoint.trim()) throw new Error("扩展点草稿缺少名称，已拒绝读取。");
  const baseRevisionId = value.baseRevisionId === null || value.baseRevisionId === undefined
    ? null
    : requiredText(value.baseRevisionId, "草稿基准版本编号", CONTEXT_LIMITS.revisionId);
  return {
    id: requiredText(value.id, "草稿编号", CONTEXT_LIMITS.revisionId),
    mode,
    extensionPoint,
    baseRevisionId,
    content,
    updatedAt: optionalText(value.updatedAt, "草稿更新时间", 100),
  };
}

function revisionFilePath(root, revisionId) {
  const id = requiredText(revisionId, "修订版本编号", CONTEXT_LIMITS.revisionId);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("修订版本编号包含不允许的字符。");
  return join(root, REVISIONS_DIR, `${id}.json`);
}

async function ensureContentIndex(root) {
  const readyPath = join(root, CONTENT_INDEX_READY_FILE);
  if (await readJson(readyPath)) return;

  const names = await readdir(join(root, REVISIONS_DIR));
  const revisions = (await Promise.all(names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readRevision(join(root, REVISIONS_DIR, name))))).filter(Boolean);
  revisions.sort((a, b) => {
    const createdDifference = String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    return createdDifference || String(b.id || "").localeCompare(String(a.id || ""));
  });
  for (const revision of revisions) {
    const contentHash = createHash("sha256").update(String(revision.content ?? "")).digest("hex");
    await writeJsonExclusiveAtomic(contentIndexPath(root, contentHash), {
      contentHash,
      revisionId: revision.id,
    });
  }
  await writeJsonExclusiveAtomic(readyPath, { readyAt: new Date().toISOString() });
}

async function markRevisionVisible(root, revisionId) {
  const markerPath = visibleRevisionPath(root, revisionId);
  const existing = await readJson(markerPath);
  if (existing) {
    if (existing.revisionId !== revisionId) throw new Error("修订版本可见性记录损坏。");
    return;
  }
  await writeJsonExclusiveAtomic(markerPath, {
    revisionId,
    visibleAt: new Date().toISOString(),
  });
}

async function markRevisionCommitted(root, revisionId, stateId) {
  const markerPath = committedRevisionPath(root, revisionId);
  const existing = await readJson(markerPath);
  if (existing) {
    if (existing.revisionId !== revisionId) throw new Error("已提交修订记录损坏。");
    return;
  }
  await writeJsonExclusiveAtomic(markerPath, {
    revisionId,
    stateId,
    committedAt: new Date().toISOString(),
  });
}

async function publishStateProof(root, state, parentStateId) {
  const proofPath = stateProofPath(root, state.stateId);
  const existing = await readJson(proofPath);
  if (existing) {
    if (
      existing.stateId !== state.stateId
      || existing.revisionId !== state.revisionId
      || existing.committedAt !== state.committedAt
      || existing.parentStateId !== parentStateId
    ) {
      throw new Error("权威状态证明损坏。");
    }
    return;
  }
  await writeJsonExclusiveAtomic(proofPath, {
    stateId: state.stateId,
    revisionId: state.revisionId,
    committedAt: state.committedAt,
    parentStateId,
  });
}

async function isProvenCheckpoint(root, pointer) {
  if (typeof pointer?.stateId !== "string" || !pointer.stateId || pointer.stateId.length > CONTEXT_LIMITS.revisionId) {
    return false;
  }
  if (
    pointer.revisionId !== null
    && (typeof pointer.revisionId !== "string" || !pointer.revisionId || pointer.revisionId.length > CONTEXT_LIMITS.revisionId)
  ) {
    return false;
  }
  if (
    pointer.committedAt !== null
    && (typeof pointer.committedAt !== "string" || !pointer.committedAt || pointer.committedAt.length > 100)
  ) {
    return false;
  }
  if (
    pointer.parentStateId !== null
    && (
      typeof pointer.parentStateId !== "string"
      || !pointer.parentStateId
      || pointer.parentStateId.length > CONTEXT_LIMITS.revisionId
    )
  ) {
    return false;
  }
  const proof = await readJson(stateProofPath(root, pointer.stateId));
  return proof?.stateId === pointer.stateId
    && proof?.revisionId === pointer.revisionId
    && proof?.committedAt === pointer.committedAt
    && proof?.parentStateId === pointer.parentStateId;
}

async function isRevisionVisible(root, revision) {
  if (!revision.id.startsWith("rev-sha256-") && !revision.id.startsWith("rev-restore-")) return true;
  return Boolean(await readJson(visibleRevisionPath(root, revision.id)));
}

async function ensureAuthorityAnchor(root) {
  const anchorPath = join(root, AUTHORITY_ANCHOR_FILE);
  let anchor = await readJson(anchorPath);
  if (!anchor) {
    const legacyPointer = await readJson(join(root, "current.json"));
    await writeJsonExclusiveAtomic(anchorPath, {
      stateId: `state-${randomUUID()}`,
      revisionId: legacyPointer?.revisionId || null,
      committedAt: legacyPointer?.committedAt || null,
    });
    anchor = await readJson(anchorPath);
  }
  requiredText(anchor.stateId, "权威状态起点编号", CONTEXT_LIMITS.revisionId);
  if (anchor.revisionId !== null) {
    requiredText(anchor.revisionId, "权威状态起点版本编号", CONTEXT_LIMITS.revisionId);
  }
  await publishStateProof(root, anchor, null);
  if (anchor.revisionId) await markRevisionCommitted(root, anchor.revisionId, anchor.stateId);
  return anchor;
}

function validateTransition(transition, expectedStateId) {
  if (!transition || transition.fromStateId !== expectedStateId) {
    throw new Error("上下文状态转换记录损坏，无法确定当前权威版本。");
  }
  requiredText(transition.stateId, "状态转换编号", CONTEXT_LIMITS.revisionId);
  requiredText(transition.revisionId, "状态转换目标版本编号", CONTEXT_LIMITS.revisionId);
  requiredText(transition.committedAt, "状态转换时间", 100);
}

async function resolveAuthorityState(projectDir) {
  const root = await ensureStore(projectDir);
  const anchor = await ensureAuthorityAnchor(root);
  const cachedPointer = await readJson(join(root, "current.json"));
  const useCachedPointer = await isProvenCheckpoint(root, cachedPointer);
  let state = {
    stateId: useCachedPointer ? cachedPointer.stateId : anchor.stateId,
    revisionId: useCachedPointer ? cachedPointer.revisionId : (anchor.revisionId || null),
    committedAt: useCachedPointer ? cachedPointer.committedAt : (anchor.committedAt || null),
    parentStateId: useCachedPointer ? cachedPointer.parentStateId : null,
  };
  const visited = new Set();

  for (let index = 0; index < MAX_AUTHORITY_TRANSITIONS; index += 1) {
    if (visited.has(state.stateId)) throw new Error("上下文状态转换形成循环，无法确定当前权威版本。");
    visited.add(state.stateId);

    const transition = await readJson(transitionPath(root, state.stateId));
    if (!transition) {
      if (
        !useCachedPointer
        || cachedPointer.stateId !== state.stateId
        || cachedPointer.revisionId !== state.revisionId
        || cachedPointer.committedAt !== state.committedAt
        || cachedPointer.parentStateId !== state.parentStateId
      ) {
        await syncCurrentPointer(root, state);
      }
      return { root, ...state };
    }
    validateTransition(transition, state.stateId);
    const parentStateId = state.stateId;
    state = {
      stateId: transition.stateId,
      revisionId: transition.revisionId,
      committedAt: transition.committedAt,
      parentStateId,
    };
    await publishStateProof(root, state, parentStateId);
    await markRevisionCommitted(root, state.revisionId, state.stateId);
  }

  throw new Error(`上下文状态转换超过 ${MAX_AUTHORITY_TRANSITIONS} 次，拒绝继续读取。`);
}

async function syncCurrentPointer(root, state) {
  try {
    await writeJsonAtomic(join(root, "current.json"), {
      stateId: state.stateId,
      revisionId: state.revisionId,
      committedAt: state.committedAt,
      parentStateId: state.parentStateId ?? state.fromStateId ?? null,
    });
  } catch (error) {
    // current.json 是可重建检查点；不可变状态转换链才是事实来源。
    if (!["EACCES", "EBUSY", "EEXIST", "EPERM"].includes(error?.code)) throw error;
  }
}

function requiredText(value, label = "文本", maximum = Number.POSITIVE_INFINITY) {
  const content = String(value ?? "");
  if (!content.trim()) throw new Error(`${label}不能为空。`);
  if (content.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符。`);
  return content;
}

function optionalText(value, label, maximum) {
  const content = String(value ?? "");
  if (content.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符。`);
  return content;
}

async function revisionFiles(projectDir) {
  const root = await ensureStore(projectDir);
  const names = await readdir(join(root, REVISIONS_DIR));
  return names.filter((name) => name.endsWith(".json")).map((name) => join(root, REVISIONS_DIR, name));
}

async function readRevision(filePath) {
  return readJson(filePath);
}

async function saveContextRevisionInternal({
  projectDir,
  content,
  source = "user-edit",
  note = "",
  visible = true,
} = {}) {
  const text = requiredText(content, "正文", CONTEXT_LIMITS.content);
  listContextExtensionPoints(text);
  const safeSource = optionalText(source || "user-edit", "来源", CONTEXT_LIMITS.source);
  const safeNote = optionalText(note, "修改说明", CONTEXT_LIMITS.note);
  const root = await ensureStore(projectDir);
  await ensureContentIndex(root);
  // 相同正文代表相同快照。超时后再次保存时直接返回旧版本，避免一次操作留下两个文件。
  // 代价是只修改“说明”不会产生新版本；说明是辅助信息，正文才是权威内容。
  const contentHash = createHash("sha256").update(text).digest("hex");
  const indexed = await readJson(contentIndexPath(root, contentHash));
  if (indexed?.revisionId) {
    if (indexed.contentHash !== contentHash) throw new Error("修订版本内容索引损坏，已拒绝保存。");
    const indexedRevision = await readJson(revisionFilePath(root, indexed.revisionId));
    if (indexedRevision?.content !== text) throw new Error("修订版本内容索引冲突，已拒绝保存。");
    if (visible) {
      await markRevisionVisible(root, indexedRevision.id);
      return getContextRevision({ projectDir, revisionId: indexedRevision.id });
    }
    return { ...indexedRevision, number: 0 };
  }
  const revision = {
    id: `rev-sha256-${contentHash}`,
    number: 0,
    content: text,
    source: safeSource,
    note: safeNote,
    createdAt: new Date().toISOString(),
  };
  const revisionPath = join(root, REVISIONS_DIR, `${revision.id}.json`);
  await writeJsonExclusiveAtomic(revisionPath, revision);
  const stored = await readRevision(revisionPath);
  if (stored?.content !== text) throw new Error("修订版本内容哈希冲突，已拒绝保存。");
  await writeJsonExclusiveAtomic(contentIndexPath(root, contentHash), {
    contentHash,
    revisionId: stored.id,
  });
  if (visible) {
    await markRevisionVisible(root, revision.id);
    return getContextRevision({ projectDir, revisionId: revision.id });
  }
  return { ...stored, number: 0 };
}

async function copyRevisionForRestoration(projectDir, revision) {
  const root = await ensureStore(projectDir);
  const restored = {
    ...revision,
    id: `rev-restore-${Date.now()}-${randomUUID()}`,
    number: 0,
    source: "history-restore",
    note: "",
    restoredFromRevisionId: revision.id,
    createdAt: new Date().toISOString(),
  };
  await writeJsonExclusiveAtomic(join(root, REVISIONS_DIR, `${restored.id}.json`), restored);
  return restored;
}

export async function saveContextRevision(options = {}) {
  return saveContextRevisionInternal(options);
}

export async function saveContextDraft({
  projectDir,
  content,
  baseRevisionId = null,
  mode = "full",
  extensionPoint = "",
} = {}) {
  const text = requiredText(content, "草稿正文", CONTEXT_LIMITS.content);
  const safeMode = draftMode(mode);
  const safePoint = optionalText(extensionPoint, "扩展点名称", CONTEXT_LIMITS.extensionName);
  if (safeMode === "extension" && !safePoint.trim()) throw new Error("扩展点草稿必须提供名称。");
  const safeBase = baseRevisionId === null || baseRevisionId === undefined
    ? null
    : requiredText(baseRevisionId, "草稿基准版本编号", CONTEXT_LIMITS.revisionId);
  const root = await ensureStore(projectDir);
  const draft = {
    id: `draft-sha256-${createHash("sha256").update(text).digest("hex")}`,
    mode: safeMode,
    extensionPoint: safePoint,
    baseRevisionId: safeBase,
    content: text,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(draftPath(root, safeMode, safePoint), draft);
  return draft;
}

export async function getContextDraft({ projectDir, mode = "full", extensionPoint = "" } = {}) {
  const safeMode = draftMode(mode);
  const safePoint = optionalText(extensionPoint, "扩展点名称", CONTEXT_LIMITS.extensionName);
  if (safeMode === "extension" && !safePoint.trim()) throw new Error("扩展点草稿必须提供名称。");
  const root = await ensureStore(projectDir);
  return normalizeDraft(await readJson(draftPath(root, safeMode, safePoint)));
}

export async function discardContextDraft({ projectDir, mode = "full", extensionPoint = "" } = {}) {
  const safeMode = draftMode(mode);
  const safePoint = optionalText(extensionPoint, "扩展点名称", CONTEXT_LIMITS.extensionName);
  if (safeMode === "extension" && !safePoint.trim()) throw new Error("扩展点草稿必须提供名称。");
  const root = await ensureStore(projectDir);
  await unlink(draftPath(root, safeMode, safePoint)).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  return { discarded: true, mode: safeMode, extensionPoint: safePoint };
}

export async function saveContextExtensionRevision({
  projectDir,
  baseRevisionId,
  extensionPoint,
  extensionContent = "",
} = {}) {
  const baseId = requiredText(baseRevisionId, "基准权威版本编号", CONTEXT_LIMITS.revisionId);
  const pointName = requiredText(extensionPoint, "扩展点名称", CONTEXT_LIMITS.extensionName);
  const pointContent = optionalText(extensionContent, "扩展内容", CONTEXT_LIMITS.content);
  const current = await getAuthoritativeContext({ projectDir });
  if (!current) throw new Error("当前还没有权威上下文，不能使用扩展点模式。");
  if (current.revisionId !== baseId) {
    throw new Error(`权威版本已经变化：当前是 ${current.revisionId}，请重新打开扩展点。`);
  }

  const content = replaceContextExtension(current.content, pointName, pointContent);
  return saveContextRevisionInternal({ projectDir, content, source: "widget-extension", note: "" });
}

export async function listContextRevisions({ projectDir } = {}) {
  const root = await ensureStore(projectDir);
  const files = await revisionFiles(projectDir);
  const revisions = (await Promise.all(files.map(readRevision))).filter(Boolean);
  const visibleRevisions = (await Promise.all(revisions.map(async (revision) => (
    await isRevisionVisible(root, revision) ? revision : null
  )))).filter(Boolean);
  return visibleRevisions
    .sort((a, b) => {
      const createdDifference = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      return createdDifference || String(a.id || "").localeCompare(String(b.id || ""));
    })
    .map((revision, index) => ({ ...revision, number: index + 1 }));
}

export async function getContextRevision({ projectDir, revisionId } = {}) {
  const id = requiredText(revisionId, "修订版本编号", CONTEXT_LIMITS.revisionId);
  const root = await ensureStore(projectDir);
  const revision = await readRevision(revisionFilePath(root, id));
  if (!revision || !await isRevisionVisible(root, revision)) throw new Error(`找不到修订版本：${id}。`);
  return revision;
}

function expectedRevision(options) {
  if (!Object.prototype.hasOwnProperty.call(options, "expectedCurrentRevisionId")) {
    return { provided: false, value: undefined };
  }
  const value = options.expectedCurrentRevisionId;
  return {
    provided: true,
    value: value === null ? null : requiredText(value, "预期权威版本编号", CONTEXT_LIMITS.revisionId),
  };
}

async function authorityResult(projectDir, state) {
  if (!state.revisionId) throw new Error("当前还没有权威上下文。");
  await markRevisionCommitted(state.root, state.revisionId, state.stateId);
  await markRevisionVisible(state.root, state.revisionId);
  const revision = await getContextRevision({ projectDir, revisionId: state.revisionId });
  return { revisionId: state.revisionId, committedAt: state.committedAt, revision };
}

async function publishAuthoritativeRevision({ projectDir, revision, expected, reopenLabel }) {
  const requestedRevision = revision;
  let targetRevision = revision;
  let targetPrepared = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await resolveAuthorityState(projectDir);
    if (current.revisionId) await markRevisionCommitted(current.root, current.revisionId, current.stateId);
    const currentRevision = current.revisionId
      ? await readRevision(revisionFilePath(current.root, current.revisionId))
      : null;
    if (current.revisionId === targetRevision.id || currentRevision?.content === requestedRevision.content) {
      return authorityResult(projectDir, current);
    }
    if (expected.provided && current.revisionId !== expected.value) {
      throw new Error(`权威版本已经变化：当前是 ${current.revisionId || "无"}，请重新打开${reopenLabel}。`);
    }
    // 恢复旧快照时生成新的修订编号，避免 A -> B -> A 后旧画布误把第一个 A 当成当前 A。
    if (!targetPrepared) {
      const revisionWasUsed = !targetRevision.id.startsWith("rev-sha256-")
        || Boolean(await readJson(committedRevisionPath(current.root, targetRevision.id)));
      if (revisionWasUsed) {
        // 已提交标记也可能刚由同正文的并发赢家创建。先重读链尖端，
        // 只有状态仍未变化时，才能把目标判定为真正的历史恢复。
        const refreshed = await resolveAuthorityState(projectDir);
        if (refreshed.stateId !== current.stateId) continue;
        targetRevision = await copyRevisionForRestoration(projectDir, targetRevision);
      }
      targetPrepared = true;
    }

    const transition = {
      fromStateId: current.stateId,
      stateId: `state-${randomUUID()}`,
      revisionId: targetRevision.id,
      committedAt: new Date().toISOString(),
    };
    const published = await writeJsonExclusiveAtomic(
      transitionPath(current.root, current.stateId),
      transition,
    );
    if (published) {
      await publishStateProof(current.root, transition, current.stateId);
      await markRevisionCommitted(current.root, targetRevision.id, transition.stateId);
      await markRevisionVisible(current.root, targetRevision.id);
      await syncCurrentPointer(current.root, transition);
      const visibleRevision = await getContextRevision({ projectDir, revisionId: targetRevision.id });
      return { revisionId: targetRevision.id, committedAt: transition.committedAt, revision: visibleRevision };
    }

    const latest = await resolveAuthorityState(projectDir);
    const latestRevision = latest.revisionId
      ? await readRevision(revisionFilePath(latest.root, latest.revisionId))
      : null;
    if (latest.revisionId === targetRevision.id || latestRevision?.content === requestedRevision.content) {
      return authorityResult(projectDir, latest);
    }
    if (expected.provided) {
      throw new Error(`权威版本已经变化：当前是 ${latest.revisionId || "无"}，请重新打开${reopenLabel}。`);
    }
  }

  throw new Error("权威上下文连续发生过多并发更新，请重新打开后再试。");
}

export async function commitAuthoritativeContext(options = {}) {
  const revision = await getContextRevision({ projectDir: options.projectDir, revisionId: options.revisionId });
  return publishAuthoritativeRevision({
    projectDir: options.projectDir,
    revision,
    expected: expectedRevision(options),
    reopenLabel: "编辑器",
  });
}

export async function updateAuthoritativeContext(options = {}) {
  const { projectDir, content, source = "widget-canvas" } = options;
  const expected = expectedRevision(options);
  const current = await resolveAuthorityState(projectDir);
  if (expected.provided && current.revisionId !== expected.value) {
    const currentRevision = current.revisionId
      ? await readRevision(revisionFilePath(current.root, current.revisionId))
      : null;
    if (currentRevision?.content === String(content ?? "")) {
      return authorityResult(projectDir, current);
    }
    throw new Error(`权威版本已经变化：当前是 ${current.revisionId || "无"}，请重新打开画布。`);
  }
  const revision = await saveContextRevisionInternal({ projectDir, content, source, note: "", visible: false });
  return publishAuthoritativeRevision({
    projectDir,
    revision,
    expected,
    reopenLabel: "画布",
  });
}

export async function getCurrentContext({ projectDir } = {}) {
  const authoritative = await getAuthoritativeContext({ projectDir });
  if (authoritative) return authoritative;
  const revisions = await listContextRevisions({ projectDir });
  const latest = revisions.at(-1);
  return latest ? { ...latest, authoritative: false } : null;
}

export async function getAuthoritativeContext({ projectDir } = {}) {
  const state = await resolveAuthorityState(projectDir);
  if (!state.revisionId) return null;
  await markRevisionCommitted(state.root, state.revisionId, state.stateId);
  await markRevisionVisible(state.root, state.revisionId);
  const revision = await getContextRevision({ projectDir, revisionId: state.revisionId });
  return { ...revision, revisionId: state.revisionId, authoritative: true, committedAt: state.committedAt };
}

export async function getRecentAuthoritativeContext({ projectDir } = {}) {
  const current = await getAuthoritativeContext({ projectDir });
  if (!current) return null;
  const fullContent = String(current.content ?? "");
  if (fullContent.length <= RECENT_CONTEXT_CHARS) {
    return { ...current, truncated: false, fullContentLength: fullContent.length, recentOnly: true };
  }
  const start = fullContent.length - RECENT_CONTEXT_CHARS;
  const lineStart = fullContent.indexOf("\n", start);
  const recent = fullContent.slice(lineStart >= 0 ? lineStart + 1 : start);
  return {
    ...current,
    content: recent,
    truncated: true,
    fullContentLength: fullContent.length,
    recentOnly: true,
  };
}

export function contextStoreDescription(projectDir) {
  return `${storePath(projectDir)}（项目内的上下文版本目录）`;
}
