export const PUBLIC_MEDIA_LOCALE = "en-US";

export const PUBLIC_ASSET_NAMES = Object.freeze({
  video: "codex-text-control-overview.mp4",
  cover: "codex-text-control-overview-cover.png",
  subtitles: "codex-text-control-overview.en.ass",
  transcript: "transcript.en.md",
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
  "intro",
  "problem-fragmentation",
  "problem-precision",
  "problem-authority",
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
    id: "intro",
    stage: "intro",
    uiState: "initial",
    minDuration: 5.8,
    eyebrow: "A local Codex context canvas",
    title: "Codex Text Control",
    body: "Edit the context that future answers should follow, then commit one reviewed revision.",
    narration: "Codex Text Control gives a project one editable, authoritative context instead of another copy buried in chat.",
  },
  {
    id: "fragmentation",
    stage: "problem-fragmentation",
    uiState: "initial",
    minDuration: 6.2,
    eyebrow: "Why it is needed · 1",
    title: "A long chat records amendments, not a final state",
    body: "Requirements are added, corrected, and repeated across messages. Finding the accepted version means reading the conversation again.",
    narration: "In a long conversation, requirements become a trail of amendments. The latest accepted version is scattered across earlier messages.",
  },
  {
    id: "precision",
    stage: "problem-precision",
    uiState: "initial",
    minDuration: 6.4,
    eyebrow: "Why it is needed · 2",
    title: "A one-cell correction should not require a full rewrite",
    body: "Chat is awkward for precise table edits. Reposting the whole document also makes unrelated text easier to change by accident.",
    narration: "A small table correction is worse. You either describe a cell indirectly, or ask for the whole document again and risk unrelated changes.",
  },
  {
    id: "authority",
    stage: "problem-authority",
    uiState: "initial",
    minDuration: 6.0,
    eyebrow: "The missing boundary",
    title: "Discussion is not the same as accepted context",
    body: "Chat stays useful for exploration. The canvas holds the version the user has actually reviewed and accepted.",
    narration: "The useful boundary is simple. Chat remains the place for discussion, while the canvas holds only the context the user has accepted.",
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
  },
  {
    id: "outro",
    stage: "outro",
    uiState: "history",
    minDuration: 7.0,
    eyebrow: "Open source · MIT",
    title: "Keep discussion fluid. Keep accepted context explicit.",
    body: "74/74 product tests · 5/5 GitHub Actions jobs · 0.5.8 source candidate",
    narration: "The source is public under MIT. Seventy four of seventy four product tests and five of five GitHub Actions jobs passed. Version zero point five point eight remains a source candidate.",
  },
]);

function appendText(target, value) {
  if (typeof value === "string") target.push(value);
  else if (Array.isArray(value)) value.forEach((item) => appendText(target, item));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => appendText(target, item));
}

export function collectPublicText() {
  const values = [];
  appendText(values, PUBLIC_ASSET_NAMES);
  appendText(values, sharedCopy);
  appendText(values, originalMarkdown);
  appendText(values, editedMarkdown);
  appendText(values, scenes);
  appendText(values, githubActionsEvidence);
  return values;
}
