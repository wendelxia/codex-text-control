(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const buttons = [...document.querySelectorAll("button")].filter(visible);
  const overlaps = [];
  for (let left = 0; left < buttons.length; left += 1) {
    const a = buttons[left].getBoundingClientRect();
    for (let right = left + 1; right < buttons.length; right += 1) {
      const b = buttons[right].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
        overlaps.push([buttons[left].textContent.trim(), buttons[right].textContent.trim()]);
      }
    }
  }
  const modeRect = document.querySelector(".mode-row")?.getBoundingClientRect();
  const mainRect = document.querySelector("main")?.getBoundingClientRect();
  const activePanel = document.querySelector("#canvas-view:not([hidden]), #source-view:not([hidden])");
  const activePanelRect = activePanel?.getBoundingClientRect();
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    textValue: document.querySelector('[aria-label="上下文3"]')?.value,
    cellValue: document.querySelector("table tr:nth-child(2) td:nth-child(2) input")?.value,
    status: document.querySelector("#status")?.textContent,
    meta: document.querySelector("#meta")?.textContent,
    messageCount: (window.__messages || []).length,
    toolCallCount: (window.__calls || []).length,
    buttonTexts: buttons.map((button) => button.textContent.trim()),
    forbiddenControls: document.querySelectorAll("#add-text, #add-table, #delete-block, .table-toolbar button").length,
    clippedButtons: buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent.trim()),
    overlappingButtons: overlaps,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollY,
    documentScrollHeight: document.documentElement.scrollHeight,
    documentClientHeight: document.documentElement.clientHeight,
    mainTop: mainRect?.top,
    mainBottom: mainRect?.bottom,
    modeTop: modeRect?.top,
    modeBottom: modeRect?.bottom,
    activePanelTop: activePanelRect?.top,
    activePanelBottom: activePanelRect?.bottom,
    activePanelScrollTop: activePanel?.scrollTop,
    activePanelScrollHeight: activePanel?.scrollHeight,
    activePanelClientHeight: activePanel?.clientHeight,
  });
})();
