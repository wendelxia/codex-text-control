import test from "node:test";
import assert from "node:assert/strict";
import { richDOM } from "./helpers/dom.mjs";

async function editor(t, markdown) {
  const { window } = await richDOM(t);
  const root = window.document.getElementById("reply");
  const model = window.CodexRichText.create(root);
  model.setMarkdown(markdown);
  return { window, root, model };
}

test("rendered prose preserves exact untouched Markdown, including CRLF and references", async (t) => {
  const source = "# 标题\r\n\r\n这是 **粗体** 与 [链接][ref]。\r\n\r\n* 列表\r\n\r\n[ref]: https://example.com\r\n";
  const { root, model } = await editor(t, source);
  assert.equal(root.querySelector("strong").textContent, "粗体");
  assert.equal(root.querySelector("a").getAttribute("href"), "https://example.com");
  assert.equal(root.querySelectorAll("textarea").length, 0);
  assert.equal(model.getMarkdown(), source);
});

test("editing one paragraph leaves unrelated Markdown byte-for-byte intact", async (t) => {
  const source = "# 标题\r\n\r\n原来的正文\r\n\r\n* 保留这个列表标记\r\n\r\n```js\r\nconst x = '<script>';\r\n```\r\n";
  const { root, model } = await editor(t, source);
  root.querySelector("p").textContent = "修改后的正文";
  assert.equal(model.getMarkdown(), source.replace("原来的正文", "修改后的正文"));
});

test("table cell edits retain table structure, alignment and literal pipes", async (t) => {
  const { root, model } = await editor(t, "| 项目 | 状态 |\n| :--- | ---: |\n| 编辑 | 待完成 |\n");
  root.querySelectorAll("td")[1].textContent = "完成 | 可用";
  const updated = model.getMarkdown();
  model.setMarkdown(updated);
  assert.equal(root.querySelectorAll("td").length, 2);
  assert.equal(root.querySelectorAll("td")[1].textContent, "完成 | 可用");
  assert.equal(root.querySelectorAll("th")[1].style.textAlign, "right");
});

test("raw HTML and dangerous links never become active DOM", async (t) => {
  const { root, model } = await editor(t, '<img src=x onerror="alert(1)">\n\n[危险](javascript:alert(1))\n\n<script>alert(2)</script>');
  assert.equal(root.querySelector("img,script,iframe,[onerror]"), null);
  assert.equal(root.querySelector('a[href^="javascript:"]'), null);
  assert.match(model.getMarkdown(), /<script>/);
});

test("browser-created paragraphs, emphasis and deletion serialize as Markdown", async (t) => {
  const { root, model, window } = await editor(t, "第一段\n\n第二段");
  root.firstElementChild.remove();
  const paragraph = window.document.createElement("div");
  const strong = window.document.createElement("strong");
  strong.textContent = "新段落";
  paragraph.append(strong);
  root.append(paragraph);
  assert.equal(model.getMarkdown(), "第二段\n\n**新段落**");
});

test("editing a code block preserves its language and embedded backticks", async (t) => {
  const { root, model } = await editor(t, "```js\nconst value = 1;\n```\n");
  root.querySelector("code").textContent = "const value = `hello`;\n// ```\n";
  const result = model.getMarkdown();
  model.setMarkdown(result);
  assert.match(root.querySelector("code").className, /language-js/);
  assert.equal(root.querySelector("code").textContent, "const value = `hello`;\n// ```\n");
});

test("images stay inert and keep their Markdown when neighboring text changes", async (t) => {
  const { root, model } = await editor(t, "之前 ![图](https://example.com/a.png) 之后");
  assert.equal(root.querySelector("img"), null);
  root.querySelector("p").firstChild.textContent = "修改 ";
  assert.match(model.getMarkdown(), /!\[图\]\(https:\/\/example.com\/a.png\)/);
});

test("browser BR nodes inside editable code preserve line breaks", async (t) => {
  const { root, model, window } = await editor(t, "```js\nfirst();\n```\n");
  const code = root.querySelector("code");
  code.replaceChildren(window.document.createTextNode("first();"), window.document.createElement("br"), window.document.createTextNode("second();"));
  assert.equal(model.getMarkdown(), "```js\nfirst();\nsecond();\n```\n");
});

test("editing a task list preserves checked markers without converting escaped literal markers", async (t) => {
  const { root, model } = await editor(t, "- [x] done\n- [ ] pending\n- \\[x] literal\n");
  root.querySelectorAll("li")[1].append(" updated");
  const result = model.getMarkdown();
  assert.match(result, /- +\[x\] done/);
  assert.match(result, /- +\[ \] pending updated/);
  assert.match(result, /\\\[x\\?\] literal/);
});

test("editing beside an image keeps quoted titles valid and the image inert after reload", async (t) => {
  const { root, model } = await editor(t, `Before ![diagram](image.png 'A "quoted" title') after`);
  root.querySelector("p").firstChild.textContent = "Changed ";
  const result = model.getMarkdown();
  model.setMarkdown(result);
  assert.equal(root.querySelectorAll(".image-reference").length, 1);
  assert.equal(root.querySelector("img"), null);
  assert.match(root.querySelector(".image-reference").dataset.imageSource, /quoted/);
});
