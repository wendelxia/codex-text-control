import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// 这里的“修订版本 revision”是一次完整的文本快照，不是对原文的局部补丁。
// 这样做的好处是：每个版本都能独立恢复，用户不需要猜测某个修改到底改了什么。
const STORE_DIR = ".codex-text-control";
const REVISIONS_DIR = "revisions";
export const CONTEXT_LIMITS = Object.freeze({ content: 1_000_000, note: 2_000, source: 100, revisionId: 200 });

function projectPath(projectDir) {
  return resolve(String(projectDir || process.cwd()));
}

function storePath(projectDir) {
  return join(projectPath(projectDir), STORE_DIR);
}

async function ensureStore(projectDir) {
  const root = storePath(projectDir);
  await mkdir(join(root, REVISIONS_DIR), { recursive: true });
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
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
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

export async function saveContextRevision({ projectDir, content, source = "user-edit", note = "" } = {}) {
  const text = requiredText(content, "正文", CONTEXT_LIMITS.content);
  const safeSource = optionalText(source || "user-edit", "来源", CONTEXT_LIMITS.source);
  const safeNote = optionalText(note, "修改说明", CONTEXT_LIMITS.note);
  const root = await ensureStore(projectDir);
  const revisions = await listContextRevisions({ projectDir });
  // 相同正文代表相同快照。超时后再次保存时直接返回旧版本，避免一次操作留下两个文件。
  // 代价是只修改“说明”不会产生新版本；说明是辅助信息，正文才是权威内容。
  const existing = revisions.findLast((revision) => revision.content === text);
  if (existing) return existing;
  const revision = {
    id: `rev-${Date.now()}-${randomUUID().slice(0, 8)}`,
    number: revisions.length + 1,
    content: text,
    source: safeSource,
    note: safeNote,
    createdAt: new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, REVISIONS_DIR, `${revision.id}.json`), revision);
  return revision;
}

export async function listContextRevisions({ projectDir } = {}) {
  const files = await revisionFiles(projectDir);
  const revisions = (await Promise.all(files.map(readRevision))).filter(Boolean);
  return revisions.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
}

export async function getContextRevision({ projectDir, revisionId } = {}) {
  const id = requiredText(revisionId, "修订版本编号", CONTEXT_LIMITS.revisionId);
  const revisions = await listContextRevisions({ projectDir });
  const revision = revisions.find((item) => item.id === id);
  if (!revision) throw new Error(`找不到修订版本：${id}。`);
  return revision;
}

export async function commitAuthoritativeContext({ projectDir, revisionId } = {}) {
  const revision = await getContextRevision({ projectDir, revisionId });
  const root = await ensureStore(projectDir);
  const pointer = {
    revisionId: revision.id,
    committedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, "current.json"), pointer);
  return { ...pointer, revision };
}

export async function getCurrentContext({ projectDir } = {}) {
  const root = await ensureStore(projectDir);
  const pointer = await readJson(join(root, "current.json"));
  if (pointer?.revisionId) {
    const revision = await getContextRevision({ projectDir, revisionId: pointer.revisionId });
    return { ...revision, revisionId: pointer.revisionId, authoritative: true, committedAt: pointer.committedAt };
  }
  const revisions = await listContextRevisions({ projectDir });
  const latest = revisions.at(-1);
  return latest ? { ...latest, authoritative: false } : null;
}

export async function getAuthoritativeContext({ projectDir } = {}) {
  const root = await ensureStore(projectDir);
  const pointer = await readJson(join(root, "current.json"));
  if (!pointer?.revisionId) return null;
  const revision = await getContextRevision({ projectDir, revisionId: pointer.revisionId });
  return { ...revision, revisionId: pointer.revisionId, authoritative: true, committedAt: pointer.committedAt };
}

export function contextStoreDescription(projectDir) {
  return `${storePath(projectDir)}（项目内的上下文版本目录）`;
}
