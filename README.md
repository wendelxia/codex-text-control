# Codex Text Control

> Edit continuous Markdown context directly inside Codex. Keep drafts local, review the full text before confirming, and turn the final confirmation into one immutable revision.

<div align="center">
  <p>
    <a href="https://github.com/wendelxia/codex-text-control/releases/tag/v0.5.10"><img alt="status: pre-release" src="https://img.shields.io/badge/status-pre--release-f59e0b"></a>
    <img alt="version: 0.5.10" src="https://img.shields.io/badge/version-0.5.10-2563eb">
    <img alt="Node.js >= 22" src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white">
    <a href="https://github.com/wendelxia/codex-text-control/actions/workflows/quality.yml"><img alt="CI" src="https://github.com/wendelxia/codex-text-control/actions/workflows/quality.yml/badge.svg"></a>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-0f766e"></a>
  </p>
</div>

<!-- PUBLIC_MEDIA:START -->
<p align="center">
  <a href="docs/media/codex-text-control-overview/codex-text-control-overview.mp4">
    <img src="docs/media/codex-text-control-overview/codex-text-control-overview-cover.png" alt="Codex Text Control product overview" width="900">
  </a>
</p>

<p align="center"><strong><a href="docs/media/codex-text-control-overview/codex-text-control-overview.mp4">Watch the English-narrated overview with Simplified Chinese subtitles</a></strong></p>
<!-- PUBLIC_MEDIA:END -->

## What it is

Codex Text Control is a local Codex plugin for project-level context editing. It does not rewrite the chat transcript. It keeps a project-local authoritative Markdown document, a recoverable draft layer, and an immutable revision history.

## Why it exists

- Long context gets repeated, rewritten, and lost across chat turns.
- Tables and long Markdown are easier to change as one continuous text flow.
- The final answer should stay short; the full context should stay in the project.

## Core behavior

- One continuous editor for paragraphs, tables, and plain Markdown.
- Drafts save after pauses and when the page hides, but stay separate from revision history.
- A stale draft never silently replaces newer authoritative text.
- Named AI extension points let the model update only a bounded block.
- Confirmation writes one immutable revision and sends back a version-only follow-up.

## Quick start

```powershell
git clone https://github.com/wendelxia/codex-text-control.git
Set-Location codex-text-control
npm ci --ignore-scripts
npm run quality
npm run verify:candidate
```

## Evidence

- 0.5.10 public pre-release
- `112/112` automated tests
- `npm run check`
- `npm run probe:mcp`
- user-reported real-host reinstall-and-click verification

## Limits

- No production-ready claim.
- No cross-platform host matrix.
- No external benchmark.
- No one-command public install path is claimed here.

## Docs

- [News](docs/news/README.md)
- [Verification](docs/evidence/README.md)
- [Changelog](CHANGELOG.md)
- [Security](SECURITY.md)
- [Repository](https://github.com/wendelxia/codex-text-control)

## License

MIT. See [LICENSE](LICENSE).
