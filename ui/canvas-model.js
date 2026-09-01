(function (root) {
  "use strict";

  const cloneTable = (table) => ({
    ...table,
    rows: table.rows.map((row) => [...row]),
    align: [...table.align],
    originalRows: table.originalRows?.map((row) => [...row]),
    rawLines: table.rawLines ? [...table.rawLines] : undefined,
    lineEndings: table.lineEndings ? [...table.lineEndings] : undefined,
  });

  function splitMarkdownLines(markdown) {
    const text = String(markdown ?? "");
    const records = [];
    const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
    for (const match of text.matchAll(pattern)) {
      if (!match[0]) break;
      records.push({ text: match[1], lineEnding: match[2] });
    }
    return records.length ? records : [{ text: "", lineEnding: "" }];
  }

  function splitTableRow(line) {
    const raw = String(line ?? "").trim();
    if (!raw.includes("|")) return null;
    let content = raw;
    if (content.startsWith("|")) content = content.slice(1);
    if (content.endsWith("|") && !content.endsWith("\\|")) content = content.slice(0, -1);

    const cells = [];
    let cell = "";
    for (let index = 0; index < content.length; index += 1) {
      const character = content[index];
      if (character === "\\" && content[index + 1] === "|") {
        cell += "|";
        index += 1;
      } else if (character === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += character;
      }
    }
    cells.push(cell.trim());
    return cells.length >= 2 ? cells : null;
  }

  function separatorAlignment(cell) {
    const value = String(cell || "").trim();
    if (!/^:?-{3,}:?$/.test(value)) return undefined;
    if (value.startsWith(":") && value.endsWith(":")) return "center";
    if (value.endsWith(":")) return "right";
    if (value.startsWith(":")) return "left";
    return null;
  }

  function tableAt(lines, index) {
    if (index + 1 >= lines.length) return null;
    const header = splitTableRow(lines[index].text);
    const separator = splitTableRow(lines[index + 1].text);
    if (!header || !separator || header.length !== separator.length) return null;
    const align = separator.map(separatorAlignment);
    if (align.some((value) => value === undefined)) return null;

    const rows = [header];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const row = splitTableRow(lines[cursor].text);
      if (!row || row.length !== header.length) break;
      rows.push(row);
      cursor += 1;
    }
    const sourceLines = lines.slice(index, cursor);
    return {
      block: {
        type: "table",
        rows,
        originalRows: rows.map((row) => [...row]),
        align,
        rawLines: sourceLines.map((line) => line.text),
        lineEndings: sourceLines.map((line) => line.lineEnding),
      },
      nextIndex: cursor,
    };
  }

  function parseMarkdown(markdown) {
    const lines = splitMarkdownLines(markdown);
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index].text;
      const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (fence) {
        const marker = fence[2][0];
        const minimum = fence[2].length;
        const codeLines = [`${line}${lines[index].lineEnding}`];
        index += 1;
        while (index < lines.length) {
          codeLines.push(`${lines[index].text}${lines[index].lineEnding}`);
          const closing = lines[index].text.match(/^\s*(`{3,}|~{3,})\s*$/);
          index += 1;
          if (closing && closing[1][0] === marker && closing[1].length >= minimum) break;
        }
        blocks.push({ type: "code", raw: codeLines.join("") });
        continue;
      }

      const table = tableAt(lines, index);
      if (table) {
        blocks.push(table.block);
        index = table.nextIndex;
        continue;
      }

      let match;
      const lineEnding = lines[index].lineEnding;
      if (line === "") blocks.push({ type: "blank", text: "", lineEnding });
      else if ((match = line.match(/^(#{1,6}\s+)(.*)$/))) blocks.push({ type: "heading", prefix: match[1], text: match[2], lineEnding });
      else if ((match = line.match(/^(\s*[-+*]\s+)(.*)$/))) blocks.push({ type: "bullet", prefix: match[1], text: match[2], lineEnding });
      else if ((match = line.match(/^(\s*\d+[.)]\s+)(.*)$/))) blocks.push({ type: "ordered", prefix: match[1], text: match[2], lineEnding });
      else if ((match = line.match(/^(\s*>\s?)(.*)$/))) blocks.push({ type: "quote", prefix: match[1], text: match[2], lineEnding });
      else blocks.push({ type: "text", text: line, lineEnding });
      index += 1;
    }
    return blocks;
  }

  function escapeCell(value) {
    return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  }

  function serializeTable(table) {
    if (table.rawLines && table.lineEndings && table.originalRows) {
      const rowLine = (row, rowIndex, rawIndex) => {
        const original = table.originalRows[rowIndex];
        return original?.length === row.length && original.every((cell, columnIndex) => cell === row[columnIndex])
          ? table.rawLines[rawIndex]
          : `| ${row.map(escapeCell).join(" | ")} |`;
      };
      const output = [];
      output.push(`${rowLine(table.rows[0], 0, 0)}${table.lineEndings[0] || ""}`);
      output.push(`${table.rawLines[1]}${table.lineEndings[1] || ""}`);
      for (let rowIndex = 1; rowIndex < table.rows.length; rowIndex += 1) {
        const rawIndex = rowIndex + 1;
        output.push(`${rowLine(table.rows[rowIndex], rowIndex, rawIndex)}${table.lineEndings[rawIndex] || ""}`);
      }
      return output.join("");
    }
    const rows = table.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
    const separator = table.align.map((alignment) => {
      if (alignment === "center") return ":---:";
      if (alignment === "right") return "---:";
      if (alignment === "left") return ":---";
      return "---";
    });
    rows.splice(1, 0, `| ${separator.join(" | ")} |`);
    return rows.join("\n");
  }

  function serializeMarkdown(blocks) {
    const source = Array.isArray(blocks) ? blocks : [];
    return source.map((block, index) => {
      if (block.type === "table") return serializeTable(block);
      if (block.type === "code") return String(block.raw ?? "");
      const line = block.type === "blank" ? "" : `${String(block.prefix ?? "")}${String(block.text ?? "")}`;
      const lineEnding = Object.prototype.hasOwnProperty.call(block, "lineEnding")
        ? String(block.lineEnding || "")
        : (index < source.length - 1 ? "\n" : "");
      return `${line}${lineEnding}`;
    }).join("");
  }

  function assertTableCell(table, rowIndex, columnIndex) {
    if (table?.type !== "table") throw new Error("目标不是表格。");
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) throw new Error("表格行不存在。");
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= table.align.length) throw new Error("表格列不存在。");
  }

  function updateTableCell(table, rowIndex, columnIndex, value) {
    assertTableCell(table, rowIndex, columnIndex);
    const next = cloneTable(table);
    next.rows[rowIndex][columnIndex] = String(value ?? "").replace(/\r?\n/g, " ");
    return next;
  }

  root.CodexCanvasModel = Object.freeze({
    parseMarkdown,
    serializeMarkdown,
    updateTableCell,
  });
})(globalThis);
