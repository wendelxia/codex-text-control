# Codex Text Control

> Read a reply. Click the text to edit it. Save or cancel in place.

<div align="center">
  <p>
    <a href="https://github.com/wendelxia/codex-text-control/releases/tag/v0.6.0"><img alt="status: pre-release" src="https://img.shields.io/badge/status-pre--release-737373"></a>
    <img alt="version: 0.6.0" src="https://img.shields.io/badge/version-0.6.0-262626">
    <img alt="Node.js >= 22" src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white">
    <a href="https://github.com/wendelxia/codex-text-control/actions/workflows/quality.yml"><img alt="CI" src="https://github.com/wendelxia/codex-text-control/actions/workflows/quality.yml/badge.svg"></a>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-0f766e"></a>
  </p>
</div>

## What it is

Codex Text Control is a local Codex plugin that presents an editable response as formatted Markdown. The content itself is the editor: no textarea, source tab, fixed-height canvas, or confirmation modal. Saved text becomes project-level confirmed context for subsequent turns. Native chat history is not rewritten.

## Why it exists

- Long context gets repeated, rewritten, and lost across chat turns.
- Tables and long Markdown are easier to change as one continuous text flow.
- The final answer should stay short; the full context should stay in the project.

## Core behavior

- One continuous editor for rendered paragraphs, lists, tables, emphasis, links, and code. Untouched blocks retain their original Markdown.
- Save and Cancel appear only during editing. Ctrl/Cmd+Enter saves; Escape cancels. The initial reply can be accepted without changing a word.
- Drafts save after pauses and when the page hides, but stay separate from revision history.
- A stale draft never silently replaces newer authoritative text.
- Named AI extension points let the model update only a bounded block.
- Save writes one immutable revision and sends a version-only follow-up. A notification retry does not create another revision.
- Transparent background, host theme tokens, automatic height, and a request for borderless framing help it fit the surrounding conversation.

## Install

Requires Node.js 22 or newer and a Codex desktop/CLI build with plugin marketplace support.

```sh
codex plugin marketplace add wendelxia/codex-text-control --ref v0.6.0
codex plugin add codex-text-control@codex-text-control
```

Restart Codex after installation, then ask: **"Let me edit this response."** The first start installs the locked production dependencies from the npm registry. Your drafts and confirmed versions stay in the project's `.codex-text-control/` directory.

Already installed from a personal marketplace? Update that marketplace's plugin source to `v0.6.0` and reinstall its existing entry to avoid two enabled copies.

## Try from source

```powershell
git clone https://github.com/wendelxia/codex-text-control.git
Set-Location codex-text-control
git checkout v0.6.0
npm ci --ignore-scripts
npm run quality
npm run verify:candidate
npm run preview
```

## Evidence

- 0.6.0 is a pre-release. See the [release notes](https://github.com/wendelxia/codex-text-control/releases/tag/v0.6.0) and [verification record](docs/evidence/inline-reply-0.6.0.md).
- `npm run quality` runs storage, extension, DOM interaction, Markdown, bridge, and real MCP protocol checks.
- `npm run preview` runs the real MCP backend against an isolated `artifacts/inline-preview` directory. Its notification is simulated; it does not send a message to your Codex conversation.
- Earlier real-host evidence applies to 0.5.x. The new host chrome and notification flow need fresh real-host verification.

## Limits

- No production-ready claim.
- No cross-platform host matrix.
- No external benchmark.
- Host loading indicators, labels, borders, and confirmation behavior are controlled by Codex. Border preference is a hint.
- This is a text-focused Markdown editor: no table insertion controls, merged cells, math rendering, or active raw HTML. Images appear as inert text references. Edited blocks may normalize Markdown syntax.
- Version history remains available through `list_text_revisions`; it is no longer a panel inside the reply.

## Docs

<!-- PUBLIC_MEDIA:START -->
The [historical 0.5.x demo](docs/media/codex-text-control-overview/codex-text-control-overview.mp4) shows the previous interface. It does not demonstrate the 0.6.0 editor.
<!-- PUBLIC_MEDIA:END -->

- [News](docs/news/README.md)
- [0.6.0 announcement](docs/news/2026-11-01-codex-text-control-0.6.0.md)
- [Verification](docs/evidence/README.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Plugin usage and extension points](skills/codex-text-control/SKILL.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Security](SECURITY.md)
- [Report a bug or share your experience](https://github.com/wendelxia/codex-text-control/issues/new)
- [Repository](https://github.com/wendelxia/codex-text-control)

## License

MIT. See [LICENSE](LICENSE).
