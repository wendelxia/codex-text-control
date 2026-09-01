import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  commitAuthoritativeContext,
  getAuthoritativeContext,
  getCurrentContext,
  listContextRevisions,
  saveContextExtensionRevision,
  saveContextRevision,
  updateAuthoritativeContext,
} from "../mcp/context-storage.mjs";

async function projectFixture() {
  return mkdtemp(join(tmpdir(), "codex-text-control-test-"));
}

const concurrentUpdateWorker = fileURLToPath(new URL("./fixtures/context-update-worker.mjs", import.meta.url));

function createConcurrentUpdateWorker(projectDir, content, expectedCurrentRevisionId) {
  const child = fork(concurrentUpdateWorker, [projectDir, content, expectedCurrentRevisionId], {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  let settled = false;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const result = new Promise((resolve, reject) => {
    child.on("message", (message) => {
      if (message?.type === "ready") readyResolve();
      if (message?.type === "result") {
        settled = true;
        resolve(message);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!settled) reject(new Error(`并发更新子进程提前退出，退出码 ${code}。`));
    });
  });
  return { child, ready, result };
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

test("旧格式修订建立内容索引后，相同正文仍复用旧版本", async () => {
  const projectDir = await projectFixture();
  const storeDir = join(projectDir, ".codex-text-control");
  const revision = {
    id: "rev-legacy-content-index",
    number: 1,
    content: "旧格式重复正文",
    source: "user-edit",
    note: "",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  await mkdir(join(storeDir, "revisions"), { recursive: true });
  await writeFile(join(storeDir, "revisions", `${revision.id}.json`), `${JSON.stringify(revision)}\n`, "utf8");

  const repeated = await saveContextRevision({ projectDir, content: revision.content });

  assert.equal(repeated.id, revision.id);
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

test("存储边界拒绝缺少项目目录，不能退回进程工作目录", async () => {
  await assert.rejects(
    () => saveContextRevision({ content: "不能写入未知项目" }),
    /必须提供当前工作区根目录/,
  );
});

test("扩展点保存从权威基准重建全文，并保持块外正文逐字不变", async () => {
  const projectDir = await projectFixture();
  const baseContent = "固定开头\n【AI扩展点：补充】\n旧内容\n【/AI扩展点】\n固定结尾";
  const base = await saveContextRevision({ projectDir, content: baseContent });
  await commitAuthoritativeContext({ projectDir, revisionId: base.id });

  const revision = await saveContextExtensionRevision({
    projectDir,
    baseRevisionId: base.id,
    extensionPoint: "补充",
    extensionContent: "只改这里",
  });

  assert.equal(revision.content, "固定开头\n【AI扩展点：补充】\n只改这里\n【/AI扩展点】\n固定结尾");
  assert.equal(revision.source, "widget-extension");
  assert.equal(revision.note, "");
  assert.equal((await getAuthoritativeContext({ projectDir })).id, base.id, "保存草稿不能提前改变权威指针。");
});

test("扩展点保存拒绝过期的权威基准，避免覆盖并发修改", async () => {
  const projectDir = await projectFixture();
  const first = await saveContextRevision({ projectDir, content: "【AI扩展点：补充】\n第一版\n【/AI扩展点】" });
  await commitAuthoritativeContext({ projectDir, revisionId: first.id });
  const second = await saveContextRevision({ projectDir, content: "【AI扩展点：补充】\n第二版\n【/AI扩展点】" });
  await commitAuthoritativeContext({ projectDir, revisionId: second.id });

  await assert.rejects(
    () => saveContextExtensionRevision({
      projectDir,
      baseRevisionId: first.id,
      extensionPoint: "补充",
      extensionContent: "过期修改",
    }),
    /权威版本已经变化/,
  );
});

test("扩展点提交再次检查预期权威版本，拒绝保存后发生的并发覆盖", async () => {
  const projectDir = await projectFixture();
  const base = await saveContextRevision({ projectDir, content: "【AI扩展点：补充】\n原内容\n【/AI扩展点】" });
  await commitAuthoritativeContext({ projectDir, revisionId: base.id });
  const extension = await saveContextExtensionRevision({
    projectDir,
    baseRevisionId: base.id,
    extensionPoint: "补充",
    extensionContent: "扩展草稿",
  });

  const concurrent = await saveContextRevision({ projectDir, content: "【AI扩展点：补充】\n并发版本\n【/AI扩展点】" });
  await commitAuthoritativeContext({ projectDir, revisionId: concurrent.id });

  await assert.rejects(
    () => commitAuthoritativeContext({
      projectDir,
      revisionId: extension.id,
      expectedCurrentRevisionId: base.id,
    }),
    /权威版本已经变化/,
  );
  assert.equal((await getAuthoritativeContext({ projectDir })).id, concurrent.id);
});

test("画布一次更新同时保存不可变修订并移动权威指针", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "第一版画布",
    expectedCurrentRevisionId: null,
  });
  const second = await updateAuthoritativeContext({
    projectDir,
    content: "第二版画布",
    expectedCurrentRevisionId: first.revision.id,
  });

  assert.notEqual(second.revision.id, first.revision.id);
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "第二版画布");
  assert.equal((await listContextRevisions({ projectDir })).length, 2);
});

test("画布更新拒绝过期基准，相同正文不会制造重复版本", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({ projectDir, content: "当前内容", expectedCurrentRevisionId: null });
  const repeated = await updateAuthoritativeContext({
    projectDir,
    content: "当前内容",
    expectedCurrentRevisionId: first.revision.id,
  });
  assert.equal(repeated.revision.id, first.revision.id);
  assert.equal((await listContextRevisions({ projectDir })).length, 1);

  const staleButAlreadyApplied = await updateAuthoritativeContext({
    projectDir,
    content: "当前内容",
    expectedCurrentRevisionId: "rev-stale",
  });
  assert.equal(staleButAlreadyApplied.revision.id, first.revision.id);
  assert.equal((await listContextRevisions({ projectDir })).length, 1);

  await assert.rejects(
    () => updateAuthoritativeContext({
      projectDir,
      content: "过期覆盖",
      expectedCurrentRevisionId: "rev-stale",
    }),
    /权威版本已经变化/,
  );
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "当前内容");
});

test("延迟写回的旧指针不能让权威上下文倒退", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "第一版",
    expectedCurrentRevisionId: null,
  });
  const pointerPath = join(projectDir, ".codex-text-control", "current.json");
  const delayedPointer = await readFile(pointerPath, "utf8");
  const second = await updateAuthoritativeContext({
    projectDir,
    content: "第二版",
    expectedCurrentRevisionId: first.revision.id,
  });
  await updateAuthoritativeContext({
    projectDir,
    content: "第三版",
    expectedCurrentRevisionId: second.revision.id,
  });

  await writeFile(pointerPath, delayedPointer, "utf8");

  assert.equal((await getAuthoritativeContext({ projectDir })).content, "第三版");
});

test("不属于权威链的格式合法检查点会被忽略", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "合法链第一版",
    expectedCurrentRevisionId: null,
  });
  await updateAuthoritativeContext({
    projectDir,
    content: "合法链第二版",
    expectedCurrentRevisionId: first.revision.id,
  });
  await writeFile(join(projectDir, ".codex-text-control", "current.json"), `${JSON.stringify({
    stateId: "state-not-in-authority-chain",
    revisionId: first.revision.id,
    committedAt: first.committedAt,
  })}\n`, "utf8");

  assert.equal((await getAuthoritativeContext({ projectDir })).content, "合法链第二版");
});

test("历史版本可以重新提交，并继续从恢复后的版本更新", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "第一版",
    expectedCurrentRevisionId: null,
  });
  const second = await updateAuthoritativeContext({
    projectDir,
    content: "第二版",
    expectedCurrentRevisionId: first.revision.id,
  });

  const restored = await commitAuthoritativeContext({
    projectDir,
    revisionId: first.revision.id,
    expectedCurrentRevisionId: second.revision.id,
  });
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "第一版");

  await updateAuthoritativeContext({
    projectDir,
    content: "恢复后继续编辑",
    expectedCurrentRevisionId: restored.revisionId,
  });
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "恢复后继续编辑");
});

test("历史恢复原样重试和恢复后保存相同正文都保持幂等", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "第一版",
    expectedCurrentRevisionId: null,
  });
  const second = await updateAuthoritativeContext({
    projectDir,
    content: "第二版",
    expectedCurrentRevisionId: first.revision.id,
  });
  const restored = await commitAuthoritativeContext({
    projectDir,
    revisionId: first.revision.id,
    expectedCurrentRevisionId: second.revision.id,
  });

  const retried = await commitAuthoritativeContext({
    projectDir,
    revisionId: first.revision.id,
    expectedCurrentRevisionId: second.revision.id,
  });
  assert.equal(retried.revisionId, restored.revisionId);
  assert.equal((await listContextRevisions({ projectDir })).length, 3);

  const unchanged = await updateAuthoritativeContext({
    projectDir,
    content: "第一版",
    expectedCurrentRevisionId: restored.revisionId,
  });
  assert.equal(unchanged.revision.id, restored.revisionId);
  assert.equal((await listContextRevisions({ projectDir })).length, 3);
});

test("检查点时间被篡改时从权威链恢复真实提交时间", async () => {
  const projectDir = await projectFixture();
  const committed = await updateAuthoritativeContext({
    projectDir,
    content: "时间证明正文",
    expectedCurrentRevisionId: null,
  });
  const pointerPath = join(projectDir, ".codex-text-control", "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  await writeFile(pointerPath, `${JSON.stringify({
    ...pointer,
    committedAt: "2000-01-01T00:00:00.000Z",
  })}\n`, "utf8");

  const recovered = await getAuthoritativeContext({ projectDir });
  assert.equal(recovered.committedAt, committed.committedAt);
  assert.equal(JSON.parse(await readFile(pointerPath, "utf8")).committedAt, committed.committedAt);
});

test("状态证明的时间或父状态被篡改时明确拒绝读取", async () => {
  for (const [field, forgedValue] of [
    ["committedAt", "2000-01-01T00:00:00.000Z"],
    ["parentStateId", "state-forged-parent"],
  ]) {
    const projectDir = await projectFixture();
    await updateAuthoritativeContext({
      projectDir,
      content: `证明完整性-${field}`,
      expectedCurrentRevisionId: null,
    });
    const storeDir = join(projectDir, ".codex-text-control");
    const pointer = JSON.parse(await readFile(join(storeDir, "current.json"), "utf8"));
    const proofHash = createHash("sha256").update(pointer.stateId).digest("hex");
    const proofPath = join(storeDir, "state-proofs", `${proofHash}.json`);
    const proof = JSON.parse(await readFile(proofPath, "utf8"));
    await writeFile(proofPath, `${JSON.stringify({ ...proof, [field]: forgedValue })}\n`, "utf8");

    await assert.rejects(
      () => getAuthoritativeContext({ projectDir }),
      /权威状态证明损坏/,
    );
  }
});

test("0.5.7 的旧指针可以建立锚点并继续更新", async () => {
  const projectDir = await projectFixture();
  const storeDir = join(projectDir, ".codex-text-control");
  const revision = {
    id: "rev-legacy-057",
    number: 1,
    content: "旧版权威正文",
    source: "user-edit",
    note: "",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  await mkdir(join(storeDir, "revisions"), { recursive: true });
  await writeFile(join(storeDir, "revisions", `${revision.id}.json`), `${JSON.stringify(revision)}\n`, "utf8");
  await writeFile(join(storeDir, "current.json"), `${JSON.stringify({
    revisionId: revision.id,
    committedAt: "2026-09-01T00:01:00.000Z",
  })}\n`, "utf8");

  assert.equal((await getAuthoritativeContext({ projectDir })).content, "旧版权威正文");
  await updateAuthoritativeContext({
    projectDir,
    content: "升级后正文",
    expectedCurrentRevisionId: revision.id,
  });
  assert.equal((await getAuthoritativeContext({ projectDir })).content, "升级后正文");
});

test("current.json 缺失时可以从不可变锚点和转换链恢复", async () => {
  const projectDir = await projectFixture();
  const first = await updateAuthoritativeContext({
    projectDir,
    content: "检查点第一版",
    expectedCurrentRevisionId: null,
  });
  await updateAuthoritativeContext({
    projectDir,
    content: "检查点第二版",
    expectedCurrentRevisionId: first.revision.id,
  });
  await unlink(join(projectDir, ".codex-text-control", "current.json"));

  assert.equal((await getAuthoritativeContext({ projectDir })).content, "检查点第二版");
});

test("跨进程同基准并发更新最多一个成功，修订序号保持唯一", async () => {
  for (let round = 0; round < 6; round += 1) {
    const projectDir = await projectFixture();
    const base = await updateAuthoritativeContext({
      projectDir,
      content: `基准-${round}`,
      expectedCurrentRevisionId: null,
    });
    const first = createConcurrentUpdateWorker(projectDir, `候选-A-${round}`, base.revision.id);
    const second = createConcurrentUpdateWorker(projectDir, `候选-B-${round}`, base.revision.id);
    await Promise.all([first.ready, second.ready]);
    first.child.send({ type: "start" });
    second.child.send({ type: "start" });
    const results = await Promise.all([first.result, second.result]);

    assert.equal(results.filter((result) => result.ok).length, 1, `第 ${round + 1} 轮只能有一个更新成功。`);
    assert.equal(results.filter((result) => !result.ok).length, 1, `第 ${round + 1} 轮必须明确拒绝另一个更新。`);
    assert.match(results.find((result) => !result.ok).message, /权威版本已经变化/);

    const revisions = await listContextRevisions({ projectDir });
    assert.equal(revisions.length, 2, "失败候选不能出现在用户版本历史中。");
    assert.equal(new Set(revisions.map((revision) => revision.number)).size, revisions.length);
    assert.match((await getAuthoritativeContext({ projectDir })).content, /^候选-[AB]-/);
  }
});

test("相同正文的并发更新复用一个修订，两个调用都可幂等成功", async () => {
  for (let round = 0; round < 6; round += 1) {
    const projectDir = await projectFixture();
    const base = await updateAuthoritativeContext({
      projectDir,
      content: `相同正文基准-${round}`,
      expectedCurrentRevisionId: null,
    });
    const workers = Array.from({ length: 8 }, () => createConcurrentUpdateWorker(
      projectDir,
      `相同正文候选-${round}`,
      base.revision.id,
    ));
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send({ type: "start" });
    const results = await Promise.all(workers.map((worker) => worker.result));

    assert.equal(
      results.filter((result) => result.ok).length,
      workers.length,
      JSON.stringify(results.filter((result) => !result.ok)),
    );
    const revisions = await listContextRevisions({ projectDir });
    assert.equal(revisions.length, 2);
    assert.equal(new Set(results.map((result) => result.revisionId)).size, 1);
  }
});

test("并发失败的正文稍后重试时不冒充历史恢复", async () => {
  const projectDir = await projectFixture();
  const base = await updateAuthoritativeContext({
    projectDir,
    content: "重试基准",
    expectedCurrentRevisionId: null,
  });
  const first = createConcurrentUpdateWorker(projectDir, "重试候选-A", base.revision.id);
  const second = createConcurrentUpdateWorker(projectDir, "重试候选-B", base.revision.id);
  await Promise.all([first.ready, second.ready]);
  first.child.send({ type: "start" });
  second.child.send({ type: "start" });
  await Promise.all([first.result, second.result]);

  const current = await getAuthoritativeContext({ projectDir });
  const losingContent = current.content === "重试候选-A" ? "重试候选-B" : "重试候选-A";
  const retried = await updateAuthoritativeContext({
    projectDir,
    content: losingContent,
    expectedCurrentRevisionId: current.revisionId,
  });

  assert.equal(retried.revision.source, "widget-canvas");
  assert.match(retried.revision.id, /^rev-sha256-/);
  assert.equal((await listContextRevisions({ projectDir })).length, 3);
});

test("旧版进程遗留的 write.lock 不会阻塞新的状态转换", async () => {
  const projectDir = await projectFixture();
  const storeDir = join(projectDir, ".codex-text-control");
  const lockPath = join(storeDir, "write.lock");
  await mkdir(lockPath, { recursive: true });
  const staleTime = new Date(Date.now() - 121_000);
  await utimes(lockPath, staleTime, staleTime);

  const result = await updateAuthoritativeContext({
    projectDir,
    content: "崩溃恢复后的正文",
    expectedCurrentRevisionId: null,
  });

  assert.equal(result.revision.content, "崩溃恢复后的正文");
  assert.equal((await getAuthoritativeContext({ projectDir })).revisionId, result.revision.id);
});

test("存在旧版 write.lock 时，多进程同基准更新仍最多一个成功", async () => {
  for (let round = 0; round < 12; round += 1) {
    const projectDir = await projectFixture();
    const base = await updateAuthoritativeContext({
      projectDir,
      content: `过期锁基准-${round}`,
      expectedCurrentRevisionId: null,
    });
    const lockPath = join(projectDir, ".codex-text-control", "write.lock");
    await mkdir(lockPath, { recursive: true });
    const staleTime = new Date(Date.now() - 121_000);
    await utimes(lockPath, staleTime, staleTime);

    const workers = Array.from({ length: 8 }, (_, index) => createConcurrentUpdateWorker(
      projectDir,
      `过期锁候选-${round}-${index}`,
      base.revision.id,
    ));
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send({ type: "start" });
    const results = await Promise.all(workers.map((worker) => worker.result));

    assert.equal(results.filter((result) => result.ok).length, 1, `第 ${round + 1} 轮只能有一个恢复者更新成功。`);
    assert.equal(results.filter((result) => !result.ok).length, workers.length - 1);
    for (const result of results.filter((candidate) => !candidate.ok)) {
      assert.match(result.message, /权威版本已经变化/);
    }
    assert.equal((await listContextRevisions({ projectDir })).length, 2);
  }
});
