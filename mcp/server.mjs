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
  discardContextDraft,
  getContextDraft,
  getAuthoritativeContext,
  getRecentAuthoritativeContext,
  listContextRevisions,
  saveContextDraft,
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
  { name: "codex-text-control", version: "0.5.11" },
  {
    instructions:
      "Codex Text Control provides a continuous Markdown canvas for direct text editing. Every tool call must pass the current workspace root projectDir explicitly. The editor keeps local drafts only during editing; after the user finishes, the widget saves an immutable revision, updates the authoritative pointer, and sends a versioned confirmation back to the conversation. Models should read full content from get_authoritative_context. This surface is for one single continuous Markdown body, not split blocks or line-by-line rewriting.",
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
    title: "Open context canvas",
    description:
      "Open the Codex context canvas. Pass the current workspace root projectDir. Full-canvas mode uses one continuous Markdown editor, so text and tables stay in a single editable body; extension mode edits only the named block, and the fixed body is kept out of model rewriting. This is the single continuous Markdown body surface, with no split blocks or line-number style editing.",
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
      "openai/toolInvocation/invoking": "Opening the context canvas...",
      "openai/toolInvocation/invoked": "Context canvas opened",
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
    const explicitCandidate = point
      ? typeof input.extensionText === "string"
      : typeof input.sourceText === "string";
    const draft = explicitCandidate
      ? null
      : await getContextDraft({
        projectDir: input.projectDir,
        mode: point ? "extension" : "full",
        extensionPoint: point?.name || "",
      });
    const currentRevisionId = current?.revisionId || current?.id || null;
    const visibleDraft = draft
      ? { ...draft, conflict: draft.baseRevisionId !== currentRevisionId }
      : null;
    const sourceText = point
      ? String(input.extensionText ?? (draft && !visibleDraft.conflict ? draft.content : point.content))
      : String(input.sourceText ?? (draft && !visibleDraft.conflict ? draft.content : current?.content ?? ""));
    const sourceKind = explicitCandidate
      ? "candidate"
      : draft && !visibleDraft.conflict
        ? "draft"
        : "authority";
    if (!point && !current && sourceText.trim().length === 0) {
      throw new Error("当前项目没有权威上下文；请通过 sourceText 提供非空候选正文，不能打开空画布。");
    }
    const widgetData = {
      renderId: randomUUID(),
      mode: point ? "extension" : "full",
      title: String(input.title || "Codex 上下文画布"),
      projectDir: resolve(input.projectDir),
      sourceText,
      sourceKind,
      draft: visibleDraft,
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
  "save_context_draft",
  {
    title: "Save context draft",
    description: "Save the text being edited as a project-local draft without changing the authoritative version or revision history.",
    inputSchema: {
      ...projectArgs,
      content: z.string().min(1).max(CONTEXT_LIMITS.content),
      baseRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId).nullable().optional(),
      mode: z.enum(["full", "extension"]).optional(),
      extensionPoint: z.string().trim().max(CONTEXT_LIMITS.extensionName).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Saving draft...", "Draft saved"),
  },
  async (input = {}) => {
    const draft = await saveContextDraft(input);
    return { content: [{ type: "text", text: "上下文草稿已保存。" }], structuredContent: { draft } };
  },
);

registerAppTool(
  server,
  "discard_context_draft",
  {
    title: "Discard context draft",
    description: "Delete the unsubmitted draft for the current project and editing mode without changing the authoritative version.",
    inputSchema: {
      ...projectArgs,
      mode: z.enum(["full", "extension"]).optional(),
      extensionPoint: z.string().trim().max(CONTEXT_LIMITS.extensionName).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Discarding draft...", "Draft discarded"),
  },
  async (input = {}) => {
    const result = await discardContextDraft(input);
    return { content: [{ type: "text", text: "上下文草稿已丢弃。" }], structuredContent: result };
  },
);

registerAppTool(
  server,
  "save_text_revision",
  {
    title: "Save context revision",
    description: "Save the editor text as a new immutable revision without changing the current authoritative version.",
    inputSchema: {
      ...projectArgs,
      content: z.string().min(1).max(CONTEXT_LIMITS.content),
      source: z.string().max(CONTEXT_LIMITS.source).optional(),
      note: z.string().max(CONTEXT_LIMITS.note).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Saving revision...", "Revision saved"),
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
    title: "Save extension-point revision",
    description: "Replace only one named AI extension point in the specified authoritative version and save a complete immutable snapshot; the body outside the extension point is preserved by the backend.",
    inputSchema: {
      ...projectArgs,
      baseRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId),
      extensionPoint: z.string().trim().min(1).max(CONTEXT_LIMITS.extensionName),
      extensionContent: z.string().max(CONTEXT_LIMITS.content),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Saving extension-point revision...", "Extension-point revision saved"),
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
    title: "Update context canvas",
    description: "Save the full Markdown body from the continuous canvas as an immutable revision and update the authoritative pointer. Use this for direct text and table edits without a separate save-then-submit step.",
    inputSchema: {
      ...projectArgs,
      content: z.string().min(1).max(CONTEXT_LIMITS.content),
      expectedCurrentRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId).nullable().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Updating context canvas...", "Context canvas updated"),
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
    title: "List context revisions",
    description: "Read the saved context revisions for the current project and return them in creation order.",
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
    title: "Commit authoritative context",
    description:
      "Set the specified revision as the current project's authoritative context. The tool returns a followUpMessage that the widget should send back to the current Codex conversation.",
    inputSchema: {
      ...projectArgs,
      revisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId),
      expectedCurrentRevisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: widgetToolMeta("Committing authoritative context...", "Authoritative context committed"),
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
    title: "Read authoritative context",
    description: "Read the authoritative context currently confirmed by the user for this project.",
    inputSchema: projectArgs,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (input = {}) => {
    const current = await getRecentAuthoritativeContext(input);
    return {
      content: [{ type: "text", text: current ? current.content : "当前还没有权威上下文。" }],
      structuredContent: { current },
    };
  },
);

await server.connect(new StdioServerTransport());
