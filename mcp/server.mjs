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
  saveContextRevision,
} from "./context-storage.mjs";
import { registerTextControlWidget } from "./widget-resource.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIDGET_URI = "ui://widget/codex-text-control/editor.html";
const projectArgs = { projectDir: z.string().trim().max(32_767).optional() };
const widgetToolMeta = (invoking, invoked) => ({
  ui: { resourceUri: WIDGET_URI, visibility: ["app"] },
  "openai/widgetAccessible": true,
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
});

const server = new McpServer(
  { name: "codex-text-control", version: "0.2.1" },
  {
    instructions:
      "Codex Text Control 用于把模型回复变成可编辑、可追踪、可提交的权威上下文。模型只负责调用 render_text_control_widget 打开编辑器；用户在 Widget 中保存或提交，Widget 再把 followUpMessage 发回当前对话。",
  },
);

await registerTextControlWidget(server, {
  uri: WIDGET_URI,
  html: async () => readFile(join(ROOT, "ui", "editor.html"), "utf8"),
});

registerAppTool(
  server,
  "render_text_control_widget",
  {
    title: "打开上下文编辑器",
    description:
      "打开 Codex 上下文编辑器。sourceText 可以是刚刚生成的回复；省略时也可以在界面中粘贴文本。",
    inputSchema: {
      ...projectArgs,
      sourceText: z.string().max(CONTEXT_LIMITS.content).optional(),
      title: z.string().trim().max(200).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI, visibility: ["model"] },
      "ui/resourceUri": WIDGET_URI,
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "正在打开上下文编辑器...",
      "openai/toolInvocation/invoked": "上下文编辑器已打开",
    },
  },
  async (input = {}) => {
    const current = await getAuthoritativeContext(input);
    const revisions = await listContextRevisions(input);
    const sourceText = String(input.sourceText ?? current?.content ?? "");
    const widgetData = {
      renderId: randomUUID(),
      title: String(input.title || "Codex 上下文编辑器"),
      projectDir: resolve(input.projectDir || process.cwd()),
      sourceText,
      current,
      revisions,
      limits: CONTEXT_LIMITS,
      store: contextStoreDescription(input.projectDir),
    };
    return {
      content: [{ type: "text", text: "已打开上下文编辑器。" }],
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
    inputSchema: { ...projectArgs, revisionId: z.string().trim().min(1).max(CONTEXT_LIMITS.revisionId) },
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
