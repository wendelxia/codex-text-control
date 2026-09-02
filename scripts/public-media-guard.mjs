const cjkPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu;
const allowedPublicCharacterPattern = /^[\u0009\u000a\u000d\u0020-\u007e\u00b7]$/u;
const chinesePunctuation = new Set(Array.from("，。！？：；、“”‘’（）《》【】—…"));

function flattenText(value, target) {
  if (typeof value === "string") target.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenText(item, target));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => flattenText(item, target));
}

export function findCjkCodePoints(value) {
  const values = [];
  flattenText(value, values);
  const matches = values.join("\n").match(cjkPattern) || [];
  return [...new Set(matches)].map((character) => ({
    character,
    codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  }));
}

export function findUnsupportedCodePoints(value) {
  const values = [];
  flattenText(value, values);
  const matches = [...values.join("\n")].filter((character) => !allowedPublicCharacterPattern.test(character));
  return [...new Set(matches)].map((character) => ({
    character,
    codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  }));
}

export function assertEnglishOnly(value, label = "public media") {
  const matches = findUnsupportedCodePoints(value);
  if (matches.length === 0) return;
  const codePoints = matches.map((match) => match.codePoint).join(", ");
  throw new Error(`English-only check failed for ${label}: ${codePoints}`);
}

export function assertChineseSubtitles(value, label = "Chinese subtitles") {
  const values = [];
  flattenText(value, values);
  if (values.length === 0) throw new Error(`Chinese subtitle check failed for ${label}: no subtitle text.`);

  for (const text of values) {
    if (!/[\u3400-\u4dbf\u4e00-\u9fff]/u.test(text)) {
      throw new Error(`Chinese subtitle check failed for ${label}: a subtitle has no Chinese text.`);
    }
    const unsupported = [...text].filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== 0x0a
        && codePoint !== 0x0d
        && !(codePoint >= 0x20 && codePoint <= 0x7e)
        && !(codePoint >= 0x3400 && codePoint <= 0x4dbf)
        && !(codePoint >= 0x4e00 && codePoint <= 0x9fff)
        && !chinesePunctuation.has(character);
    });
    if (unsupported.length > 0) {
      const codePoints = [...new Set(unsupported)]
        .map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
        .join(", ");
      throw new Error(`Chinese subtitle check failed for ${label}: unsupported ${codePoints}.`);
    }
  }
}
