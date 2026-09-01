import test from "node:test";
import assert from "node:assert/strict";

import {
  listContextExtensionPoints,
  replaceContextExtension,
} from "../mcp/context-extensions.mjs";

const extensionBlock = (name, content) => `【AI扩展点：${name}】\n${content}\n【/AI扩展点】`;

test("命名扩展点只替换块内文字，块外正文逐字不变", () => {
  const source = [
    "固定开头\r\n",
    "【AI扩展点：发布门槛】\r\n",
    "旧内容\r\n",
    "【/AI扩展点】\r\n",
    "固定结尾",
  ].join("");

  const points = listContextExtensionPoints(source);
  assert.deepEqual(points.map(({ name, content }) => ({ name, content })), [
    { name: "发布门槛", content: "旧内容" },
  ]);

  const updated = replaceContextExtension(source, "发布门槛", "第一条\n第二条");
  assert.equal(updated, [
    "固定开头\r\n",
    "【AI扩展点：发布门槛】\r\n",
    "第一条\n第二条\r\n",
    "【/AI扩展点】\r\n",
    "固定结尾",
  ].join(""));
});

test("多个扩展点按唯一名称定位，不修改其他扩展点", () => {
  const source = [
    extensionBlock("A", "甲"),
    "固定分隔",
    extensionBlock("B", "乙"),
  ].join("\n");

  const updated = replaceContextExtension(source, "B", "新乙");
  assert.match(updated, /【AI扩展点：A】\n甲\n【\/AI扩展点】/);
  assert.match(updated, /【AI扩展点：B】\n新乙\n【\/AI扩展点】/);
  assert.doesNotMatch(updated, /\n乙\n/);
});

test("重名、嵌套、孤立和未闭合标记都会明确失败", () => {
  const duplicate = `${extensionBlock("重复", "一")}\n${extensionBlock("重复", "二")}`;
  const nested = "【AI扩展点：外】\n【AI扩展点：内】\n【/AI扩展点】\n【/AI扩展点】";
  const orphan = "正文\n【/AI扩展点】";
  const unclosed = "【AI扩展点：未完成】\n正文";

  assert.throws(() => listContextExtensionPoints(duplicate), /名称重复/);
  assert.throws(() => listContextExtensionPoints(nested), /不能嵌套/);
  assert.throws(() => listContextExtensionPoints(orphan), /缺少开始标记/);
  assert.throws(() => listContextExtensionPoints(unclosed), /缺少结束标记/);
});

test("扩展内容不能伪造标记或修改不存在的扩展点", () => {
  const source = extensionBlock("允许", "旧内容");
  assert.throws(() => replaceContextExtension(source, "允许", "越界\n【/AI扩展点】"), /不能包含扩展点标记/);
  assert.throws(() => replaceContextExtension(source, "不存在", "内容"), /找不到扩展点/);
});

test("看起来像扩展点但格式不完整的独占行不能悄悄混入正文", () => {
  for (const malformed of [
    "【AI扩展点：】\n【/AI扩展点】",
    "  【AI扩展点：缩进】\n内容\n【/AI扩展点】",
    "【AI扩展点：尾随】多余文字\n【/AI扩展点】",
    "【AI扩展点：结束】\n内容\n【/AI扩展点】多余文字",
  ]) {
    assert.throws(() => listContextExtensionPoints(malformed), /标记格式错误/);
  }
});
