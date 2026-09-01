import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("技能规则明确要求普通对话直通，避免默认介入", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  assert.match(skill, /用户没有要求修改文字时按普通 Codex 对话处理/);
  assert.match(skill, /不打开画布/);
  assert.match(skill, /像“继续”“好的”“解释一下”“正常聊聊”这类普通对话/);
});

test("前文有可编辑内容时，我来改下会触发画布，并排除改代码等其他动作", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  const description = skill.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m)?.[1] || "";

  // 技能是否被加载首先取决于 YAML 描述，所以关键触发语不能只写在加载后的正文里。
  assert.match(description, /我来改下/);
  assert.match(skill, /前文存在正在讨论的回复、文字、规则或上下文/);
  assert.match(skill, /“我来改代码”“我改天再说”/);
});

test("技能要求 AI 只生成指定扩展点内容，不能重写固定正文", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  const description = skill.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m)?.[1] || "";
  assert.match(description, /扩展点/);
  assert.match(skill, /扩展点外.*逐字不变/);
  assert.match(skill, /extensionPoint/);
  assert.match(skill, /extensionText/);
});

test("整理讨论结论、形成建议或决策稿时自动打开画布", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  const description = skill.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m)?.[1] || "";

  // 自动触发条件必须写入 YAML 描述，否则技能在生成结论稿前可能不会被加载。
  assert.match(description, /整理讨论结论/);
  assert.match(description, /提出可继续采用或修改的建议/);
  assert.match(description, /完整最终回复/);
  assert.match(skill, /后续会继续采用或修改的结论稿/);
  assert.match(skill, /完整最终答复.*sourceText/);
  assert.match(skill, /不要求建议很长或已经成体系/);
});

test("自动建议稿必须完整生成后只打开一次且不在聊天中复述", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");

  assert.match(skill, /先完成整份最终稿，再调用/);
  assert.match(skill, /同一份最终稿最多调用一次/);
  assert.match(skill, /工具成功返回后立即停止/);
  assert.match(skill, /不得用空画布探测/);
  assert.match(skill, /探测.*`get_authoritative_context`/);
});

test("文件交付、简短对话和过程消息不自动打开画布", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  const description = skill.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m)?.[1] || "";

  assert.match(description, /生成、修改或交付代码、文件或文档/);
  assert.match(description, /简短对话/);
  assert.doesNotMatch(description, /表格或连续编号分项时也自动使用画布/);
  assert.match(skill, /单点问答、确认、解释、进度汇报/);
  assert.match(skill, /命令输出、日志、报错/);
  assert.match(skill, /表格或连续编号不能单独触发/);
  assert.match(skill, /工作过程中的进度消息不得触发/);
});

test("结论稿打开、编辑和提交前检查都不保存，只有确认提交才更新权威版本", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  assert.match(skill, /初次打开、编辑过程和提交前检查都不保存/);
  assert.match(skill, /弹出完整待提交原文供最后检查/);
  assert.match(skill, /点击“确认提交”后.*更新权威版本/);
  assert.match(skill, /点击“返回修改”会保留当前草稿/);
  assert.match(skill, /输入法中间态/);
});

test("画布更新通知要求读取磁盘最新版且不重复全文", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  const description = skill.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m)?.[1] || "";
  assert.match(description, /上下文画布已更新/);
  assert.match(skill, /必须先调用 `get_authoritative_context`/);
  assert.match(skill, /不得要求用户粘贴全文/);
  assert.match(skill, /不重复全文/);
});

test("每次 MCP 调用都显式绑定当前工作区，不能省略项目目录", async () => {
  const skill = await readFile(join(process.cwd(), "skills", "codex-text-control", "SKILL.md"), "utf8");
  assert.match(skill, /每次调用.*`projectDir`.*当前工作区根目录/);
  assert.match(skill, /不得省略.*插件安装目录/);
});
