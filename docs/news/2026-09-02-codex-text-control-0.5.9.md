# Codex Text Control 0.5.9 Replaces Block Editing with One Continuous Context Canvas

**September 2, 2026**

Codex Text Control 0.5.9 is now available as a GitHub pre-release. The update replaces row-by-row and table-cell editing with one continuous Markdown text area, making the authoritative context behave like a normal document.

## The Problem

Long AI conversations often repeat the same requirements. Small corrections get appended as new messages, the latest wording becomes hard to identify, and changing one line can lead to a full-document rewrite. The earlier canvas reduced chat repetition, but its separate rows and table cells still made whole-document selection, copying, and editing awkward.

## What Changed

Version 0.5.9 puts the complete Markdown body in one editor. Users can select everything with `Ctrl+A`, copy or replace the full document, and edit Markdown tables in the same text stream as surrounding paragraphs. The source view and final review use that same string, so switching views does not parse and reformat untouched content.

The established confirmation boundary remains unchanged: typing only changes a local draft. A revision is created only after the user chooses **Finish editing**, reviews the complete original text, and confirms the submission. Immutable history, authoritative pointers, version notifications, extension-point restrictions, concurrency protection, and failure recovery remain in place.

## Evidence and Limits

The focused interaction suite passed `25/25` tests. The complete quality suite passed `95/95` automated tests together with JavaScript syntax checks and the MCP probe. These checks cover the continuous editor, Markdown table text, draft preservation, bidirectional view synchronization, final review, AI candidate confirmation, timeout retry, extension-point recovery, storage, and concurrency contracts.

The new build has not yet completed a reinstall-and-click test inside the real Codex desktop host. It also has no cross-platform host matrix or external authoritative benchmark for context-canvas usability. For those reasons, 0.5.9 is a pre-release and does not claim production readiness, universal installation compatibility, or superiority over competing projects.

## Release Facts

| Item | Detail |
| --- | --- |
| Purpose | Let users edit the current authoritative Codex context as one continuous Markdown document. |
| Input | A project directory, the current authoritative Markdown, and direct user edits. |
| Output | One immutable revision, an updated authoritative pointer, and a version-only conversation notification after confirmation. |
| Requirements | Node.js 22 or newer, npm, local project write access, and a Codex host with MCP Apps support. |
| Storage | Project-local `.codex-text-control/` files; the plugin contains no network upload path. |
| Primary limitation | The 0.5.9 UI has automated evidence but not a completed real-host reinstall verification. |
| Rollback | Reinstall `0.5.8+codex.20260901204256`; keep the project `.codex-text-control/` directory. |

## Availability

- [Newsroom index](README.md)
- [GitHub repository](https://github.com/wendelxia/codex-text-control)
- [GitHub pre-release v0.5.9](https://github.com/wendelxia/codex-text-control/releases/tag/v0.5.9)
- [0.5.9 verification record](../evidence/verification-0.5.9-2026-09-02.md)
- [Changelog](../../CHANGELOG.md)
- [Security policy](../../SECURITY.md)

The GitHub pre-release provides the source snapshot and release notes. A public one-command plugin installation path is not yet available.
