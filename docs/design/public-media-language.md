# Public GitHub Media Language Rule

## Rule

All GitHub-facing promotional media for this project must be English-only. This includes visible UI text, narration, subtitles, titles, filenames, metadata, preview images, transcripts, and accompanying media copy.

Historical evidence, product source, and existing maintainer documentation are not silently translated by this rule. A separate translation requires its own review because changing source or evidence text can alter behavior or invalidate hashes.

## Why This Exists

Mixed-language promotional assets create an avoidable comprehension break for public GitHub visitors. A single language also makes narration, subtitles, screenshots, filenames, accessibility text, and review checks agree with one another.

The product UI is currently Chinese. An English promotional render may replace visible demo labels after loading the real source, but it must state that this is an English-only demonstration harness and not product localization.

## Enforcement

The rule has three mechanical gates:

1. `tests/public-media.test.mjs` checks the public storyboard, filenames, evidence language, and required problem and usage stages.
2. `scripts/render-github-promo.mjs` scans the visible text, accessibility labels, and hardcoded scene copy in every rendered state. Public copy may contain printable ASCII plus the middle dot used by the product label; any other script or symbol stops the render.
3. `render-report.json` records the language result for every UI state, exact GitHub Actions evidence, render environment versions, source hashes, and hashes for every public artifact.
4. Publication replaces the complete media directory as one unit and restores the previous directory if the replacement fails.

## Inputs, Outputs, Dependencies, and Limits

Input is the public storyboard, current UI source, project evidence, and this language rule. Output is an English-only media package under `docs/media/codex-text-control-overview/`.

The checks depend on Node.js. Full rendering also depends on Chrome, FFmpeg, FFprobe, Windows speech synthesis, and an installed English voice. The code-point gate rejects non-Latin scripts and unsupported symbols, but it is not a grammar or translation-quality evaluator. Human review is still required for wording, pacing, and whether the demonstration is understandable.

Objective assessment: the rule prevents the specific failure of mixed-language public media and makes that requirement testable. It does not prove that the English copy is persuasive, that the product is localized, or that the video represents a real Codex host session.
