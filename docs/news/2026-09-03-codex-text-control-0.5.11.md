# Codex Text Control 0.5.11 Fixes Mixed Widget Payloads

Codex Text Control 0.5.11 fixes a canvas failure where a reused Codex widget could show a current title above text from an older conversation.

The fix keeps the title, Markdown body, and render identity together. If the host briefly delivers a title-only payload, the canvas keeps the previous complete state. The new title is applied only when the matching body arrives, so users do not review or submit a mixed document by mistake.

The regression test covers the exact sequence: an old complete render, a partial new render, then the complete new body under the same render ID. Focused widget and MCP contract tests pass (`49/49`).

This is a public pre-release patch. It does not claim production readiness, cross-platform host compatibility, or an external authoritative usability benchmark.

## Upgrade

Install the `v0.5.11` pre-release from GitHub and restart Codex before testing the canvas again.

## Rollback

Reinstall `v0.5.10` if you need to return to the previous build. Keep the project `.codex-text-control/` directory because it contains user revisions and drafts.
