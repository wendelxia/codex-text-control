export const PUBLIC_MEDIA_LOCALE = "en-US";
export const PUBLIC_SUBTITLE_LOCALE = "zh-CN";

export const PUBLIC_ASSET_NAMES = Object.freeze({
  video: "codex-text-control-overview.mp4",
  cover: "codex-text-control-overview-cover.png",
  subtitles: "codex-text-control-overview.zh-CN.ass",
  transcript: "transcript.en-zh-CN.md",
  report: "render-report.json",
});

export const UI_DEMO_LABEL = "UI demonstration · current source";

export const originalMarkdown = `# Release gate

Edit the accepted requirements here instead of repeating them in chat.

| Requirement | Status | Owner |
| --- | --- | --- |
| Real user loop | Needs review | Product owner |
| Failure evidence | Must be retained | Codex |

1. Protect existing behavior from regressions
2. Keep every claim within the available evidence`;

export const editedMarkdown = `# Release gate

Edit text and tables directly while keeping accepted requirements intact.

| Requirement | Status | Owner |
| --- | --- | --- |
| Real user loop | Confirmed | Product owner |
| Failure evidence | Must be retained | Codex |

1. Protect existing behavior from regressions
2. Keep every claim within the available evidence`;

export const REQUIRED_STORY_STAGES = Object.freeze([
  "problem-fragmentation",
  "problem-precision",
  "problem-authority",
  "solution-intro",
  "use-open",
  "use-edit-text",
  "use-edit-table",
  "use-source",
  "use-review",
  "use-return",
  "use-commit",
  "use-notification",
  "use-history",
  "use-reread",
  "outro",
]);

export const githubActionsEvidence = Object.freeze({
  workflow: "Quality",
  runId: 33545397952,
  url: "https://github.com/wendelxia/codex-text-control/actions/runs/33545397952",
  headSha: "863c380cdc3f64707cab56e856f24785a76f5ec0",
  conclusion: "success",
  jobsPassed: 5,
  jobsTotal: 5,
  observedAt: "2026-09-02",
});

export const sharedCopy = Object.freeze({
  product: "Codex Text Control",
  candidate: "0.5.8 · source candidate",
  demoLabel: UI_DEMO_LABEL,
  footer: "Edit authoritative context, Markdown tables, and revision history",
  repository: "github.com/wendelxia/codex-text-control",
});

export const scenes = Object.freeze([
  {
    id: "repetition",
    stage: "problem-fragmentation",
    uiState: "initial",
    minDuration: 7.0,
    eyebrow: "An everyday problem · 1",
    title: "You keep explaining the same requirement",
    body: "A normal project chat grows into corrections, reminders, and repeated instructions spread across many messages.",
    narration: "A normal project chat starts simply. Then the same requirement gets corrected, clarified, and repeated across ten different messages.",
    subtitleZh: "项目聊天一长，同一条要求就会被反复说明。\n修改、补充和提醒散落在很多条消息里。",
  },
  {
    id: "small-edit",
    stage: "problem-precision",
    uiState: "initial",
    minDuration: 7.2,
    eyebrow: "An everyday problem · 2",
    title: "One table cell changes, but the whole document comes back",
    body: "A tiny correction often triggers a full rewrite. Text you never touched can change along with it.",
    narration: "Now imagine changing one table cell. The model often rewrites the whole document, so text you never touched can change too.",
    subtitleZh: "明明只想改一个表格单元格，\n模型却常常把整篇文档重新写一遍。",
  },
  {
    id: "which-version",
    stage: "problem-authority",
    uiState: "initial",
    minDuration: 7.0,
    eyebrow: "An everyday problem · 3",
    title: "Which version will the next answer follow?",
    body: "After several revisions, the chat contains every version but does not clearly identify the one that is current.",
    narration: "After a few rounds, the real question is no longer what was discussed. It is which version the next answer should actually follow.",
    subtitleZh: "讨论几轮以后，真正的问题变成了：\n下一次回答到底应该听哪一版？",
  },
  {
    id: "solution",
    stage: "solution-intro",
    uiState: "initial",
    minDuration: 7.2,
    eyebrow: "The tool changes the workflow",
    title: "Move the accepted version out of chat",
    body: "Codex Text Control keeps discussion in chat and puts the reviewed version in one editable canvas.",
    narration: "Codex Text Control separates those jobs. Chat stays open for discussion. A separate canvas holds the version you have reviewed and accepted.",
    subtitleZh: "这个工具把讨论和最终版本分开：\n聊天负责讨论，画布保存确认版本。",
  },
  {
    id: "open",
    stage: "use-open",
    uiState: "initial",
    minDuration: 5.8,
    eyebrow: "Use · 1",
    title: "Open the current context",
    body: "Ask Codex: Open the current authoritative context canvas.",
    narration: "Start in the project and ask Codex to open the current authoritative context canvas.",
    subtitleZh: "在项目里，让 Codex 打开\n当前权威上下文画布。",
  },
  {
    id: "edit-text",
    stage: "use-edit-text",
    uiState: "edited-text",
    minDuration: 5.8,
    eyebrow: "Use · 2",
    title: "Edit the sentence itself",
    body: "Click into the canvas and change only the wording that needs attention. Typing does not create intermediate revisions.",
    narration: "Edit the sentence directly. The draft stays in the canvas while you type, so partial input never becomes a saved revision.",
    subtitleZh: "直接修改需要调整的那句话。\n输入过程只留在草稿里，不会保存半成品。",
  },
  {
    id: "edit-table",
    stage: "use-edit-table",
    uiState: "edited-table",
    minDuration: 5.8,
    eyebrow: "Use · 3",
    title: "Edit a Markdown table cell in place",
    body: "Change Needs review to Confirmed without asking the model to regenerate the surrounding document.",
    narration: "For a Markdown table, edit the exact cell. Here, only the review status changes from Needs review to Confirmed.",
    subtitleZh: "表格也能直接改单元格。\n这里只改状态，周围内容保持不变。",
  },
  {
    id: "source",
    stage: "use-source",
    uiState: "source",
    minDuration: 5.8,
    eyebrow: "Use · 4",
    title: "Switch to Markdown source when needed",
    body: "The visual canvas covers common text and tables. Source mode keeps complex Markdown available without hiding it.",
    narration: "When the visual canvas is not enough, switch to Markdown source and edit the same draft without leaving the workflow.",
    subtitleZh: "复杂格式可切换到源码视图。\n仍然编辑同一份源码草稿。",
  },
  {
    id: "review",
    stage: "use-review",
    uiState: "review",
    minDuration: 6.0,
    eyebrow: "Use · 5",
    title: "Review the complete text before anything is saved",
    body: "Finish editing opens a read-only final check. No authoritative pointer changes at this step.",
    narration: "Finish editing opens a final check with the complete original text. Nothing is committed merely because this review opened.",
    subtitleZh: "点击“完成编辑”后先检查完整原文。\n此时还没有保存，也没有更新当前版本。",
  },
  {
    id: "return",
    stage: "use-return",
    uiState: "returned",
    minDuration: 5.6,
    eyebrow: "Use · 6",
    title: "Return to the draft without losing it",
    body: "If the review exposes a problem, return to editing. The draft remains in place and the current revision remains unchanged.",
    narration: "If something is wrong, return to editing. The draft is retained, and the previously accepted revision still remains authoritative.",
    subtitleZh: "发现问题就返回修改。\n草稿不会丢，之前确认的版本仍然有效。",
  },
  {
    id: "commit",
    stage: "use-commit",
    uiState: "success",
    minDuration: 6.4,
    eyebrow: "Use · 7",
    title: "Confirm once, then publish one revision",
    body: "Confirmation stores an immutable snapshot, advances the authoritative pointer, and returns only the revision ID to the conversation.",
    narration: "Only Confirm commit writes the snapshot, advances the authoritative pointer, and sends the new revision ID back to the conversation.",
    subtitleZh: "只有点击“确认提交”，系统才保存快照，\n并更新当前权威版本。",
  },
  {
    id: "notification",
    stage: "use-notification",
    uiState: "success",
    minDuration: 6.0,
    eyebrow: "Use · 8",
    title: "Return only the revision ID to the conversation",
    body: "The full body stays in project storage. The conversation receives a short versioned notification instead of another duplicate document.",
    narration: "The simulated host message shows what returns to the conversation: the new revision ID, not another copy of the full context.",
    subtitleZh: "聊天里只返回新的版本号，\n不再重复粘贴整篇正文。",
  },
  {
    id: "history",
    stage: "use-history",
    uiState: "history",
    minDuration: 6.0,
    eyebrow: "Use · 9",
    title: "Load an earlier revision without rewriting history",
    body: "Revision history stays inspectable. Loading an older snapshot creates a draft; a new revision appears only after another confirmation.",
    narration: "Revision history remains available. Loading an older snapshot creates a draft, and restoring it still requires a new confirmation.",
    subtitleZh: "历史版本可以查看和载入。\n要恢复旧版，仍然需要再次确认提交。",
  },
  {
    id: "reread",
    stage: "use-reread",
    uiState: "history",
    minDuration: 6.2,
    eyebrow: "Use · 10",
    title: "Read the accepted revision before the next answer",
    body: "The next Codex response resolves the authoritative pointer and reads rev-demo-043 from project storage.",
    narration: "Before the next answer, Codex reads the authoritative context again. Revision rev demo zero forty three is now the accepted source.",
    subtitleZh: "回答前，Codex 会重新读取确认版本。\n之后继续遵循你刚刚确认的内容。",
  },
  {
    id: "outro",
    stage: "outro",
    uiState: "history",
    minDuration: 7.0,
    eyebrow: "What the tool solves",
    title: "Fewer repeats. Smaller edits. One accepted version.",
    body: "Chat stays useful for discussion. The canvas gives the next answer one reviewed source to follow.",
    narration: "That is the change: less repeated instruction, safer small edits, and one reviewed version for the next answer to follow.",
    subtitleZh: "结果是：少重复，小改动更准确，\n下一次回答也有明确依据。",
  },
]);

function appendText(target, value) {
  if (typeof value === "string") target.push(value);
  else if (Array.isArray(value)) value.forEach((item) => appendText(target, item));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => appendText(target, item));
}

export function collectEnglishPublicText() {
  const values = [];
  appendText(values, PUBLIC_ASSET_NAMES);
  appendText(values, sharedCopy);
  appendText(values, originalMarkdown);
  appendText(values, editedMarkdown);
  appendText(values, scenes.map(({ subtitleZh: _subtitleZh, ...scene }) => scene));
  appendText(values, githubActionsEvidence);
  return values;
}

export function collectSubtitleText() {
  return scenes.map((scene) => scene.subtitleZh);
}
