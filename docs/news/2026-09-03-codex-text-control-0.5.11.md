# Codex Text Control 0.5.11 Fixes Mixed Widget Payloads

Codex Text Control 0.5.11 fixes a canvas failure where a reused Codex widget could show a current title above text from an older conversation.

The fix keeps the title, Markdown body, and render identity together. If the host briefly delivers a title-only payload, the canvas keeps the previous complete state. If a tool call provides a custom title for a new response, it must also provide the matching candidate body; otherwise the server rejects the render instead of opening older authoritative text under the new title.

The regression tests cover two failure shapes: an old complete render followed by a partial new render, and a custom-title render that omits the matching body while older authoritative text exists. Focused widget and MCP contract tests pass (`50/50`).

This is a public pre-release patch. It does not claim production readiness, cross-platform host compatibility, or an external authoritative usability benchmark.

## Upgrade

Install the `v0.5.11` pre-release from GitHub and restart Codex before testing the canvas again.

## Rollback

Reinstall `v0.5.10` if you need to return to the previous build. Keep the project `.codex-text-control/` directory because it contains user revisions and drafts.
