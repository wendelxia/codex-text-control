# Codex Text Control 0.5.10 Adds Recoverable Drafts and Conflict Checks

**September 2, 2026**

Codex Text Control 0.5.10 is a public candidate build for review. It keeps the one-document Markdown canvas from 0.5.9 and addresses the next failure users noticed: leaving a conversation midway could lose the in-progress edit, while silently restoring an old edit could overwrite newer authoritative text.

## The Problem

An authoritative context is useful only when it can be edited without losing work or creating a hidden overwrite. A browser page can be closed, a conversation can be switched, or the authoritative version can change while a draft is open. Treating every edit as a formal revision creates noisy history; treating an old draft as current risks replacing someone else's newer context.

## What Changed

- Save an in-progress edit as a project-local draft after a short pause and when the page is hidden. The draft is stored under `.codex-text-control/drafts/` and remains separate from immutable revision history.
- Restore an uncommitted draft when the authoritative base is unchanged, including after switching conversations or reopening the canvas.
- Detect a changed authoritative base. The canvas keeps the current authoritative text visible and requires the user to explicitly load and review the older draft before submitting it against the new base.
- Serialize overlapping draft saves so an older network response cannot replace a newer edit.
- Keep Chinese input-method composition text out of persistence, including a page hide during composition.
- Make the default `get_authoritative_context` response return the most recent 12,000 characters with a truncation marker. The canvas and project store still retain the complete authoritative Markdown.
- Remove a persisted draft when the user restores the current authoritative version, while preserving any new edit made during asynchronous cleanup.

The confirmation boundary is unchanged: typing and draft persistence do not advance the authoritative pointer. Only the user’s final review and confirmation creates an immutable revision and sends a version-only conversation notification.

## Evidence and Limits

The candidate passes `112/112` automated tests. The suite includes storage and MCP contracts, continuous Markdown editing, draft recovery, stale-base conflict handling, serialized writes, input-method composition, page-hide persistence, reset cleanup, formal-submission ordering, timeout recovery, extension-point restrictions, and concurrency behavior. JavaScript syntax checks and the MCP probe also pass.

The user has completed the reinstall-and-click verification inside the real Codex desktop host. This announcement records that as a user-reported current-host result; it does not invent screenshots, console logs, or an independent second-host run. There is still no cross-platform host matrix or external authoritative benchmark for context-canvas usability, so 0.5.10 remains a candidate/pre-release build and does not claim production readiness, universal installation compatibility, or superiority over competing projects.

## Release Facts

| Item | Detail |
| --- | --- |
| Purpose | Preserve unfinished context edits without confusing them with confirmed revisions. |
| Draft storage | Project-local `.codex-text-control/drafts/` JSON files written atomically. |
| Formal save | Only after complete-text review and explicit user confirmation. |
| Recent read default | 12,000 characters from the end of the authoritative document, with a truncation flag when needed. |
| Requirements | Node.js 22 or newer, npm, local project write access, and a Codex host with MCP Apps support. |
| Primary limitation | The current-host check is user-reported; no cross-platform host matrix or independent host artifact is included. |
| Rollback | Reinstall the public `v0.5.9` pre-release; keep the project `.codex-text-control/` directory. |

## Availability

- [GitHub repository](https://github.com/wendelxia/codex-text-control)
- [GitHub pre-release v0.5.10](https://github.com/wendelxia/codex-text-control/releases/tag/v0.5.10)
- [0.5.10 verification record](../evidence/verification-0.5.10-2026-09-02.md)
- [Changelog](../../CHANGELOG.md)
- [Security policy](../../SECURITY.md)

The GitHub pre-release provides the source snapshot and release notes. A stable release and a public one-command plugin installation path are not claimed by this announcement.
