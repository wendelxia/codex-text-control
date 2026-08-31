import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("技能规则明确要求普通对话直通，避免默认介入", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  assert.match(skill, /用户没有明确要求修改文字时，按普通 Codex 对话处理/);
  assert.match(skill, /不打开编辑器/);
  assert.match(skill, /像“继续”“好的”“解释一下”“正常聊聊”这类普通对话/);
});
