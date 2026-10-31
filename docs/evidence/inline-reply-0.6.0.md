# Inline reply 0.6.0 local verification

Verified on Windows with Node 24.16.0 and Chromium on 2026-11-01 (Asia/Shanghai).

Release status: pre-release. See the [0.6.0 announcement](../news/2026-11-01-codex-text-control-0.6.0.md) for the user-facing changes and the [README](../../README.md#install) for installation.

## Behavior

- Formatted Markdown is the edit surface. There is no second textarea, source tab, fixed-height canvas, or confirmation dialog.
- Click/focus reveals Save and Cancel. Saving creates a confirmed immutable revision; cancellation restores the pre-edit body and clears unsubmitted drafts.
- Untouched top-level blocks retain their Markdown. Edited blocks serialize back to Markdown. HTML remains inert; pasted content is plain text, and image references do not load remotely.
- Draft recovery, IME composition, stale-base rejection, save timeout, failed notification retry, iframe reuse, and extension-point isolation are covered by real DOM tests.

## Evidence

- `npm run quality`: 129 tests passed, syntax checks passed, real stdio MCP probe passed.
- `npm audit --omit=dev --registry=https://registry.npmjs.org/`: 0 reported vulnerabilities.
- `npm run audit:signatures`: 142 verified registry signatures and 16 verified attestations.
- Chromium: 15 checks passed, including actual typing, native undo, Escape cancellation, table edits, escaped pipes, code-block Enter, save/reload, safe paste, Ctrl+Enter, dark theme, clean console, and no horizontal overflow at 320/768/1024/1440 px.
- Browser testing found a lost newline when Chromium inserted a `br` inside a code block. A failing DOM regression test was added, the serializer was fixed, and the browser flow passed afterward.
- Release review added failing regressions for task markers, quoted image titles, undo cleanup, independent draft sessions, delayed writes, bounded draft storage, and notification retry across queued renders. These pass after the fixes, including a cross-process delayed-write check.
- Windows CI exposed concurrent draft cleanup sharing violations. Cleanup now retries `EPERM`/`EBUSY` and permits a leftover snapshot only when a durable cancellation marker or a readable newer snapshot makes it invisible. Four fault-injection regressions cover this behavior and ensure actual write failures still surface.
- A source archive unpacked without `node_modules` installed locked production dependencies, completed the MCP handshake, returned the inline editor resource, and saved confirmed context. Installation logs stayed on stderr.
- The native Codex CLI recognized the repository marketplace and its `0.6.0` plugin entry.

The prior textarea-specific tests were replaced with real DOM tests for this interaction, so test counts are not directly comparable with 0.5.x. Storage and extension regression suites remain in place.

## Verification limits

The preview uses the real MCP storage backend in a separate trial project. Its conversation notification is simulated. The redesigned component has not completed a real-host click-through: host borders, labels, sizing caps, and message-confirmation behavior remain unverified. Tests simulate composition events; they are not a hardware IME certification. Native chat history replacement is not implemented.

The editor does not offer table insertion/merging, a Markdown source view, or math rendering. Images are inert text references. Large-document performance and a cross-platform host matrix have not been measured.
