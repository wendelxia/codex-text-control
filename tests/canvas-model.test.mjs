import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

async function loadCanvasModel() {
  const source = await readFile(join(process.cwd(), "ui", "canvas-model.js"), "utf8");
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "canvas-model.js" });
  return sandbox.CodexCanvasModel;
}

test("Markdown 常用结构可以进入画布并稳定还原", async () => {
  const model = await loadCanvasModel();
  const source = [
    "# 发布要求",
    "",
    "普通说明",
    "- 保留失败样例",
    "1. 完成真实闭环",
    "> 这是限制",
    "",
    "```text",
    "| 代码里的 | 竖线 |",
    "```",
  ].join("\n");

  const blocks = model.parseMarkdown(source);
  assert.deepEqual(Array.from(blocks, (block) => block.type), [
    "heading", "blank", "text", "bullet", "ordered", "quote", "blank", "code",
  ]);
  assert.equal(model.serializeMarkdown(blocks), source);
});

test("Markdown 表格显示为结构化单元格，修改后仍保存为 Markdown", async () => {
  const model = await loadCanvasModel();
  const source = [
    "| 项目 | 状态 |",
    "| :--- | ---: |",
    "| 真实闭环 | 待验收 |",
    "| 失败\\|样例 | 保留 |",
  ].join("\n");

  const blocks = model.parseMarkdown(source);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "table");
  assert.deepEqual(Array.from(blocks[0].rows, (row) => Array.from(row)), [
    ["项目", "状态"],
    ["真实闭环", "待验收"],
    ["失败|样例", "保留"],
  ]);
  assert.deepEqual(Array.from(blocks[0].align), ["left", "right"]);

  const changed = model.updateTableCell(blocks[0], 1, 1, "已通过");
  assert.match(model.serializeMarkdown([changed]), /\| 真实闭环 \| 已通过 \|/);
  assert.match(model.serializeMarkdown([changed]), /失败\\\|样例/);
});

test("畸形表格不会被猜测修复，原文按普通文本保留", async () => {
  const model = await loadCanvasModel();
  const source = "| A | B |\n| --- |\n| 1 | 2 |";
  const blocks = model.parseMarkdown(source);
  assert.equal(blocks.some((block) => block.type === "table"), false);
  assert.equal(model.serializeMarkdown(blocks), source);
});

test("未编辑的 CRLF 正文逐字还原，不把整篇行尾改成 LF", async () => {
  const model = await loadCanvasModel();
  const source = "# 标题\r\n\r\n正文\r\n";

  assert.equal(model.serializeMarkdown(model.parseMarkdown(source)), source);
});

test("只改一个表格单元格时，未编辑行和原始行尾逐字不变", async () => {
  const model = await loadCanvasModel();
  const source = "项目 | 状态\r\n---|---:\r\n真实闭环|待验收";
  const [table] = model.parseMarkdown(source);

  const changed = model.updateTableCell(table, 1, 1, "已通过");
  assert.equal(
    model.serializeMarkdown([changed]),
    "项目 | 状态\r\n---|---:\r\n| 真实闭环 | 已通过 |",
  );
});
