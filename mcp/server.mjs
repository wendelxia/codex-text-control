import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  commitAuthoritativeContext,
  CONTEXT_LIMITS,
  contextStoreDescription,
  getAuthoritativeContext,
  listContextRevisions,
  saveContextExtensionRevision,
  saveContextRevision,
  updateAuthoritativeContext,
} from "./context-storage.mjs";
import { getContextExtensionPoint } from "./context-extensions.mjs";
import { registerTextControlWidget } from "./widget-resource.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIDGET_URI = "ui://widget/codex-text-control/editor.html";
const projectArgs = {
  projectDir: z.string().trim().min(1, "必须提供当前工作区根目录。").max(32_767),
};
const widgetToolMeta = (invoking, invoked) => ({
  ui: { resourceUri: WIDGET_URI, visibility: ["app"] },
  "openai/widgetAccessible": true,
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
});

const server = new McpServer(
  { name: "codex-text-control", version: "0.5.8" },
  {
    instructions:
      "Codex Text Control 提供可直接编辑文字和 Markdown 表格的上下文画布。每次工具调用必须显式传入当前工作区根目录 projectDir。编辑过程只保留本地草稿；用户点击完成编辑后，Widget 保存一个不可变修订、更新权威指针并回传版本通知，模型应调用 get_authoritative_context 读取全文。",
  },
);

await registerTextControlWidget(server, {
  uri: WIDGET_URI,
  html: async () => {
    const [html, canvasModel, editorScript] = await Promise.all([
      readFile(join(ROOT, "ui", "editor.html"), "utf8"),
      readFile(join(ROOT, "ui", "canvas-model.js"), "utf8"),
      readFile(join(ROOT, "ui", "editor.js"), "utf8"),
    ]);
    const inline = (source) => `<script>${source.replaceAll("</script", "<\\/script")}</script>`;
    return html
      .replace('<script src="canvas-model.js"></script>', () => inline(canvasModel))
      .replace('<script src="editor.js"></script>', () => inline(editorScript));
  },
});

registerAppTool(
  server,
  "render_text_control_widget",
  {
    title: "打开上下文画布",
    description:
      "打开 Codex 上下文画布。必须传入当前工作区根目录 projectDir。全文模式可直接编辑文字和 Markdown 表格；扩展点模式只编辑指定块，固定正文不会交给模型重写。",
    inputSchema: {
      ...projectArgs,
      sourceText: z
        .string()
        .max(CONTEXT_LIMITS.content)
        .refine((value) => value.trim().length > 0, "sourceText 必须包含非空候选正文，不能打开空画布。")
        .optional(),
      extensionPoint: z.string().trim().min(1).max(CONTEXT_LIMITS.extensionName).optional(),
      extensionText: z.string().max(CONTEXT_LIMITS.content).optional(),
      title: z.string().trim().max(200).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI, visibility: ["model"] },
      "ui/resourceUri": WIDGET_URI,
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "正在打开上下文画布...",
      "openai/toolInvocation/invoked": "上下文画布已打开",
    },
  },
  async (input = {}) => {
    const current = await getAuthoritativeContext(input);
    const revisions = await listContextRevisions(input);
    const extensionName = String(input.extensionPoint ?? "").trim();
    if (extensionName && !current) throw new Error("当前还没有权威上下文，不能打开扩展点模式。");
    const point = extensionName
      ? getContextExtensionPoint(current.content, extensionName)
      : null;
    const sourceText = point
      ? String(input.extensionText ?? point.content)
      : String(input.sourceText ?? current?.content ?? "");
    if (!point && !current && sourceText.trim().length === 0) {
      throw new Error("当前项目没有权威上下文；请通过 sourceText 提供非空候选正文，不能打开空画布。");
    }
    const widgetData = {
      renderId: randomUUID(),
      mode: point ? "extension" : "full",
      title: String(input.title || "Codex 上下文画布"),
      projectDir: resolve(input.projectDir),
      sourceText,
      current,
      revisions,
      limits: CONTEXT_LIMITS,
      store: contextStoreDescription(input.projectDir),
    };
    if (point) {
      widgetData.extension = {
        name: point.name,
        baseRevisionId: current.revisionId,
        currentContent: point.content,
      };
    }
    return {
      content: [{ type: "text", text: "已打开上下文画布。" }],
      structuredContent: widgetData,
      _meta: { "openai/outputTemplate": WIDGET_URI, widgetData },
    };
  },
);

registerAppTool(
  server,
  "save_text_revision",
  {
    title: "保存上下文修订",
    description: "把编辑器中的文本保存为新的不可变修订版本，但不改变当前权威版本。",
    inputSchema: {
      ...projectArgs,
      content: z.string().min(1).max(CONTEXT_LIMITS.content),
      source: z.string().max(CONTEXT_LIMITS.source).optional(),
      note: z.string().max(CONTEXT_LIMITS.note).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("正在保存修订版本...", "修订版本已保存"),
  },
  async (input = {}) => {
    const revision = await saveContextRevision(input);
    return {
      content: [{ type: "text", text: `已保存修订版本 ${revision.id}。` }],
      structuredContent: { revision },
    };
  },
);

registerAppTool(
  server,
  "save_context_extension_revision",
  {
    title: "保存扩展点修订",
    description: "只替换指定权威版本中的一个命名 AI 扩展点，并保存完整不可变快照；扩展点外正文由后端原样保留。",
    inputSchema: {
      ...projectArgs,
      baseRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId),
      extensionPoint: z.string().trim().min(1).max(CONTEXT_LIMITS.extensionName),
      extensionContent: z.string().max(CONTEXT_LIMITS.content),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("正在保存扩展点修订...", "扩展点修订已保存"),
  },
  async (input = {}) => {
    const revision = await saveContextExtensionRevision(input);
    return {
      content: [{ type: "text", text: `已保存扩展点修订版本 ${revision.id}。` }],
      structuredContent: { revision },
    };
  },
);

registerAppTool(
  server,
  "update_authoritative_context",
  {
    title: "更新上下文画布",
    description: "把画布中的完整 Markdown 原子保存为不可变修订并更新权威指针。用于直接编辑文字和表格，不需要先保存再提交。",
    inputSchema: {
      ...projectArgs,
      content: z.string().min(1).max(CONTEXT_LIMITS.content),
      expectedCurrentRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId).nullable().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("正在更新上下文画布...", "上下文画布已更新"),
  },
  async (input = {}) => {
    const result = await updateAuthoritativeContext({ ...input, source: "widget-canvas" });
    const followUpMessage = [
      "【上下文画布已更新】",
      `版本：${result.revision.id}`,
      "正文不在聊天中重复。后续回答前请调用 get_authoritative_context 读取当前权威内容。",
    ].join("\n");
    return {
      content: [{ type: "text", text: `上下文画布已更新为 ${result.revision.id}。` }],
      structuredContent: { ...result, followUpMessage },
    };
  },
);

server.registerTool(
  "list_text_revisions",
  {
    title: "列出上下文版本",
    description: "读取当前项目保存过的上下文版本，按创建顺序返回。",
    inputSchema: projectArgs,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (input = {}) => {
    const revisions = await listContextRevisions(input);
    return { content: [{ type: "text", text: `共有 ${revisions.length} 个上下文版本。` }], structuredContent: { revisions } };
  },
);

registerAppTool(
  server,
  "commit_authoritative_context",
  {
    title: "提交权威上下文",
    description:
      "将指定修订版本设为当前项目的权威上下文。工具会返回一条 followUpMessage，widget 应把它发回当前 Codex 对话。",
    inputSchema: {
      ...projectArgs,
      revisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId),
      expectedCurrentRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("正在提交权威上下文...", "权威上下文已提交"),
  },
  async (input = {}) => {
    const result = await commitAuthoritativeContext(input);
    const followUpMessage = [
      "【权威上下文已提交】",
      `版本：${result.revision.id}`,
      "从现在开始，请把下面的内容作为本对话后续工作的最高优先级上下文。它是用户编辑并确认过的版本；如与更早回复冲突，以此版本为准。",
      "",
      result.revision.content,
    ].join("\n");
    return {
      content: [{ type: "text", text: `已提交 ${result.revision.id} 为权威上下文。` }],
      structuredContent: { ...result, followUpMessage },
    };
  },
);

server.registerTool(
  "get_authoritative_context",
  {
    title: "读取权威上下文",
    description: "读取项目当前被用户确认的权威上下文。",
    inputSchema: projectArgs,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (input = {}) => {
    const current = await getAuthoritativeContext(input);
    return {
      content: [{ type: "text", text: current ? current.content : "当前还没有权威上下文。" }],
      structuredContent: { current },
    };
  },
);

await server.connect(new StdioServerTransport());
