import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  commitAuthoritativeContext,
  getAuthoritativeContext,
  getCurrentContext,
  listContextRevisions,
  saveContextRevision,
} from "../mcp/context-storage.mjs";

async function projectFixture() {
  return mkdtemp(join(tmpdir(), "codex-text-control-test-"));
}

test("保存修订会生成不可变版本，并可读取为当前内容", async () => {
  const projectDir = await projectFixture();

  const first = await saveContextRevision({
    projectDir,
    content: "第一版上下文",
    source: "assistant",
    note: "保留目标",
  });
  const second = await saveContextRevision({
    projectDir,
    content: "第二版上下文",
    source: "user-edit",
    note: "删掉重复约束",
  });

  assert.notEqual(first.id, second.id);
  assert.equal((await getCurrentContext({ projectDir })).content, "第二版上下文");
  assert.equal((await listContextRevisions({ projectDir })).length, 2);
});

test("提交权威上下文会更新指针，重复提交同一版本不会制造新版本", async () => {
  const projectDir = await projectFixture();
  const revision = await saveContextRevision({ projectDir, content: "权威版本" });

  const committed = await commitAuthoritativeContext({ projectDir, revisionId: revision.id });
  const repeated = await commitAuthoritativeContext({ projectDir, revisionId: revision.id });

  assert.equal(committed.revisionId, revision.id);
  assert.equal(repeated.revisionId, revision.id);
  assert.equal((await getCurrentContext({ projectDir })).revisionId, revision.id);

  const rawPointer = JSON.parse(await readFile(join(projectDir, ".codex-text-control", "current.json"), "utf8"));
  assert.equal(rawPointer.revisionId, revision.id);
});

test("重复保存完全相同的正文会复用原修订，避免超时重试制造重复文件", async () => {
  const projectDir = await projectFixture();
  const first = await saveContextRevision({ projectDir, content: "相同正文", note: "第一次保存" });
  const retried = await saveContextRevision({ projectDir, content: "相同正文", note: "超时后重试" });

  assert.equal(retried.id, first.id);
  assert.equal((await listContextRevisions({ projectDir })).length, 1);
});

test("提交不存在的版本会明确失败", async () => {
  const projectDir = await projectFixture();
  await assert.rejects(
    () => commitAuthoritativeContext({ projectDir, revisionId: "missing-revision" }),
    /找不到修订版本/,
  );
});

test("未提交的最新草稿不能被读取成权威上下文", async () => {
  const projectDir = await projectFixture();
  const revision = await saveContextRevision({ projectDir, content: "只是草稿" });

  assert.equal(await getAuthoritativeContext({ projectDir }), null);
  await commitAuthoritativeContext({ projectDir, revisionId: revision.id });
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "只是草稿");
});

test("超出上限的正文和修改说明会在存储边界被拒绝", async () => {
  const projectDir = await projectFixture();
  await assert.rejects(
    () => saveContextRevision({ projectDir, content: "字".repeat(1_000_001) }),
    /不能超过 1000000 个字符/,
  );
  await assert.rejects(
    () => saveContextRevision({ projectDir, content: "正常正文", note: "字".repeat(2_001) }),
    /修改说明不能超过 2000 个字符/,
  );
});
