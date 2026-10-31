(function (root) {
  "use strict";

  function create(element) {
    const document = element.ownerDocument;
    const markdown = root.markdownit({ html: false, linkify: false, typographer: false });
    const converter = new root.TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
    converter.use(root.turndownPluginGfm.gfm);
    // Keep genuine task markers distinct from an escaped literal "[x]" in a list.
    markdown.core.ruler.after("inline", "taskMarkers", (state) => {
      state.tokens.forEach((token, index) => {
        if (token.type !== "inline" || state.tokens[index - 2]?.type !== "list_item_open" || !/^\[[ xX]\] /.test(token.content) || token.children?.[0]?.type !== "text") return;
        const marker = new state.Token("task_marker", "span", 0);
        marker.content = token.children[0].content.slice(0, 3);
        token.children[0].content = token.children[0].content.slice(3);
        token.children.unshift(marker);
      });
    });
    markdown.renderer.rules.task_marker = (tokens, index) => `<span data-task-marker="true">${tokens[index].content}</span>`;
    converter.addRule("taskMarker", {
      filter: (node) => node.hasAttribute?.("data-task-marker"),
      replacement: (text, node) => /^\[[ xX]\]$/.test(node.textContent) ? node.textContent : text,
    });
    converter.addRule("strike", { filter: ["del", "s", "strike"], replacement: (text) => `~~${text}~~` });
    converter.addRule("safeCodeFence", {
      filter: (node) => node.nodeName === "PRE" && node.firstElementChild?.nodeName === "CODE",
      replacement: (_text, node) => {
        const code = node.firstElementChild;
        const codeText = (element) => {
          let value = "";
          for (const child of element.childNodes) {
            if (child.nodeType === 3) value += child.textContent;
            else if (child.nodeName === "BR") value += "\n";
            else {
              const block = ["DIV", "P"].includes(child.nodeName);
              if (block && value && !value.endsWith("\n")) value += "\n";
              value += codeText(child);
              if (block && !value.endsWith("\n")) value += "\n";
            }
          }
          return value;
        };
        const value = codeText(code);
        const runs = value.match(/`+/g) || [];
        const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
        const language = (code.className.match(/language-([^\s]+)/) || [])[1] || "";
        return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`;
      },
    });
    converter.addRule("tableCells", {
      filter: ["th", "td"],
      replacement: (text, node) => `${node.previousElementSibling ? " " : "| "}${text.trim().replace(/\n/g, " ").replace(/(?<!\\)\|/g, "\\|")} |`,
    });
    converter.addRule("tableRows", {
      filter: "tr",
      replacement: (text, node) => {
        const cells = Array.from(node.children);
        const header = cells.every((cell) => cell.nodeName === "TH");
        const alignments = { left: ":---", center: ":---:", right: "---:" };
        return `\n${text}${header ? `\n| ${cells.map((cell) => alignments[cell.style.textAlign] || "---").join(" | ")} |` : ""}`;
      },
    });
    // Images remain inert in the text editor. Keep their source when nearby text changes.
    markdown.renderer.rules.image = (tokens, index) => {
      const token = tokens[index];
      const title = token.attrGet("title")?.replace(/[\\"]/g, "\\$&");
      const source = `![${token.content}](${token.attrGet("src")}${title ? ` "${title}"` : ""})`;
      return `<span class="image-reference" contenteditable="false" data-image-source="${markdown.utils.escapeHtml(source)}">${markdown.utils.escapeHtml(token.content || "图片")}</span>`;
    };
    converter.addRule("imageReference", {
      filter: (node) => node.hasAttribute?.("data-image-source"),
      replacement: (_text, node) => node.getAttribute("data-image-source"),
    });
    let source = "", initialHTML = "", records = new Map(), prefix = "", newline = "\n";

    function setMarkdown(value) {
      source = String(value ?? "");
      newline = source.includes("\r\n") ? "\r\n" : "\n";
      records = new Map();
      const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
      const env = {};
      const tokens = markdown.parse(source, env);
      const groups = [];
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.level === 0 && token.map && token.nesting >= 0) groups.push({ index, start: token.map[0], end: token.map[1] });
      }
      const fragment = document.createDocumentFragment();
      prefix = lines.slice(0, groups[0]?.start || 0).join("");
      groups.forEach((group, index) => {
        const next = groups[index + 1];
        const template = document.createElement("template");
        // html:false disables raw HTML; markdown-it also validates link protocols.
        template.innerHTML = markdown.renderer.render(tokens.slice(group.index, next?.index), markdown.options, env);
        const node = template.content.firstElementChild;
        if (!node) return;
        for (const link of node.querySelectorAll("a")) link.setAttribute("rel", "noopener noreferrer");
        records.set(node, {
          html: node.outerHTML,
          raw: lines.slice(group.start, group.end).join(""),
          tail: lines.slice(group.end, next?.start ?? lines.length).join(""),
        });
        fragment.append(node);
      });
      if (!groups.length && source) fragment.append(document.createTextNode(source));
      element.replaceChildren(fragment);
      initialHTML = element.innerHTML;
    }

    function getMarkdown() {
      if (element.innerHTML === initialHTML) return source;
      const nodes = Array.from(element.childNodes).filter((node) => node.nodeType === 1 || node.textContent.trim());
      const remaining = new Set(records.values());
      const parts = nodes.map((node) => {
        const record = records.get(node);
        if (record) remaining.delete(record);
        if (record && node.outerHTML === record.html) return { text: record.raw, tail: record.tail };
        const container = document.createElement("div");
        container.append(node.cloneNode(true));
        const text = converter.turndown(container).replace(/\r\n|\r|\n/g, newline);
        return { text, tail: record ? (record.raw.match(/(?:\r\n|\r|\n)+$/)?.[0] || "") + record.tail : "" };
      });
      let result = prefix;
      parts.forEach((part, index) => {
        result += part.text + part.tail;
        if (index < parts.length - 1) {
          const trailing = result.match(/(?:\r\n|\r|\n)+$/)?.[0] || "";
          if (trailing.length < newline.length * 2) result += newline.repeat(2 - trailing.length / newline.length);
        }
      });
      // Reference definitions live in gaps and must survive deletion of the preceding block.
      for (const record of remaining) if (record.tail.trim()) result += newline + record.tail;
      return result;
    }
    return Object.freeze({ setMarkdown, getMarkdown });
  }

  root.CodexRichText = Object.freeze({ create });
})(globalThis);
