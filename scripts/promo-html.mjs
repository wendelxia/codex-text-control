const htmlEscapes = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => htmlEscapes[character]);
}

export function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
