# Codex Text Control 0.6.0 Adds In-Place Markdown Editing

Codex Text Control 0.6.0 lets you correct a formatted reply where it appears. Click the text, edit the paragraph or table, then choose Save or Cancel. The separate textareas, source tab, fixed-height canvas, and confirmation dialog have been removed.

Save is the confirmation step. It creates an immutable project revision and sends a short version notice so the next turn can read the confirmed text. Cancel restores the text from before the edit. Unfinished drafts remain separate from confirmed revisions, and a draft based on an older version cannot silently replace newer text.

Untouched blocks keep their original Markdown. Edited blocks convert back to Markdown, with tables, lists, emphasis, code, task markers, and image references covered by regression tests. Images remain inert text references. Ctrl/Cmd+Enter saves; Escape cancels. A failed notification can be retried without creating another revision.

The component follows host theme changes, grows with its content, and requests borderless framing. Codex still controls the surrounding labels, borders, and notification confirmation. The plugin does not rewrite native chat history.

## Verification

The local release checks passed 129 automated tests, JavaScript syntax checks, and a real stdio MCP probe. Fifteen Chromium checks covered editing, undo, keyboard actions, save/reload, safe paste, themes, and narrow layouts. A fresh source archive installed its locked production dependencies and completed an editor save; the Codex CLI recognized the public marketplace entry.

The production dependency audit reported no known vulnerabilities, with 142 registry signatures and 16 attestations verified. Details and test limits are in the [verification record](../evidence/inline-reply-0.6.0.md).

This is a pre-release. The redesigned editor has not completed a real Codex host click-through or notification test. Cross-platform host behavior and large-document performance remain unmeasured. Table insertion, merged cells, math rendering, and a Markdown source view are not provided.

## Install

Follow the [0.6.0 installation instructions](../../README.md#install), then restart Codex. Existing personal-marketplace users should update their current plugin entry to avoid enabling a second copy. Keep the project's `.codex-text-control/` directory when changing plugin versions; it holds drafts and confirmed revisions.

The [changelog](../../CHANGELOG.md#060---2026-11-01) records the full release scope.
