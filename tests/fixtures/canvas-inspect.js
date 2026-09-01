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
      const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapWidth > 1 && overlapHeight > 1) overlaps.push([buttons[left].id || buttons[left].textContent, buttons[right].id || buttons[right].textContent]);
    }
  }
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    clippedButtons: buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).map((button) => button.id || button.textContent),
    overlappingButtons: overlaps,
    tableCount: document.querySelectorAll("table").length,
    editableCellCount: document.querySelectorAll(".cell-input").length,
    consoleReady: document.getElementById("status")?.textContent || "",
  });
})();
