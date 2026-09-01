export const EXTENSION_NAME_LIMIT = 100;

const markerTokenPattern = /^(?:【AI扩展点：(?<name>[^】\r\n]+)】|(?<close>【\/AI扩展点】))[ \t]*(?<newline>\r?\n|$)/gm;
const validMarkerLinePattern = /^(?:【AI扩展点：[^】\r\n]+】|【\/AI扩展点】)[ \t]*$/;

function markerCandidate(line) {
  const candidate = line.trimStart();
  return candidate.startsWith("【AI扩展点") || candidate.startsWith("【/AI扩展点");
}

function assertNoExtensionMarkers(content) {
  for (const rawLine of String(content ?? "").split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (markerCandidate(line)) throw new Error("扩展内容不能包含扩展点标记。");
  }
}

function extensionName(value) {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("扩展点名称不能为空。");
  if (name.length > EXTENSION_NAME_LIMIT) throw new Error(`扩展点名称不能超过 ${EXTENSION_NAME_LIMIT} 个字符。`);
  if (/[】\r\n]/.test(name)) throw new Error("扩展点名称不能包含换行或右方括号。");
  return name;
}

function editableContent(rawContent) {
  if (rawContent.endsWith("\r\n")) return rawContent.slice(0, -2);
  if (rawContent.endsWith("\n")) return rawContent.slice(0, -1);
  return rawContent;
}

// 标记必须独占一行。解析器同时返回字符边界，让替换可以复用原文的前后片段，
// 而不是让模型重新生成全文后再猜哪些地方应该保持不变。
export function listContextExtensionPoints(content) {
  const text = String(content ?? "");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (markerCandidate(line) && (line.trimStart() !== line || !validMarkerLinePattern.test(line))) {
      throw new Error(`AI 扩展点标记格式错误：${line || "空行"}。`);
    }
  }
  const pattern = new RegExp(markerTokenPattern.source, markerTokenPattern.flags);
  const points = [];
  const names = new Set();
  let active = null;

  for (const match of text.matchAll(pattern)) {
    if (match.groups?.name !== undefined) {
      const name = extensionName(match.groups.name);
      if (active) throw new Error(`AI 扩展点不能嵌套：${active.name} 内出现了 ${name}。`);
      if (names.has(name)) throw new Error(`AI 扩展点名称重复：${name}。`);
      active = {
        name,
        contentStart: match.index + match[0].length,
        lineEnding: match.groups.newline || "\n",
      };
      names.add(name);
      continue;
    }

    if (!active) throw new Error("发现 AI 扩展点结束标记，但缺少开始标记。");
    const rawContent = text.slice(active.contentStart, match.index);
    points.push({
      name: active.name,
      content: editableContent(rawContent),
      contentStart: active.contentStart,
      closingStart: match.index,
      lineEnding: active.lineEnding,
    });
    active = null;
  }

  if (active) throw new Error(`AI 扩展点 ${active.name} 缺少结束标记。`);
  return points;
}

export function getContextExtensionPoint(content, name) {
  const safeName = extensionName(name);
  const point = listContextExtensionPoints(content).find((candidate) => candidate.name === safeName);
  if (!point) throw new Error(`找不到扩展点：${safeName}。`);
  return point;
}

export function replaceContextExtension(content, name, extensionContent) {
  const text = String(content ?? "");
  const point = getContextExtensionPoint(text, name);
  const replacement = String(extensionContent ?? "");
  assertNoExtensionMarkers(replacement);
  const structuralEnding = replacement && !replacement.endsWith("\n") ? point.lineEnding : "";
  return `${text.slice(0, point.contentStart)}${replacement}${structuralEnding}${text.slice(point.closingStart)}`;
}
