# Public GitHub Media Language And Story Rule

## Rule

GitHub-facing video uses English visible UI text and English narration, with human-reviewed Simplified Chinese subtitles. The accessible transcript contains both the English narration and the Chinese subtitles. Titles, filenames, metadata, preview images, and accompanying media copy remain English.

Historical evidence, product source, and existing maintainer documentation are not silently translated by this rule. A separate translation requires its own review because changing source or evidence text can alter behavior or invalidate hashes.

## Why This Exists

The current English speech voice sounds more natural than the available Chinese speech voice. Simplified Chinese subtitles preserve direct comprehension without accepting stiff Chinese narration. This is the default for future project videos unless the user explicitly requests another language format.

The story must begin with concrete problems people meet in ordinary work. Only after those problems are clear may the video introduce the tool, demonstrate how it changes the workflow, and state what the user gains. Product-first copy or abstract terminology must not replace this problem-to-solution sequence.

The product UI is currently Chinese. An English promotional render may replace visible demo labels after loading the real source, but it must state that this is a demonstration harness and not product localization.

## Enforcement

The rule has three mechanical gates:

1. `tests/public-media.test.mjs` checks that three everyday problem scenes come before the tool introduction and that the complete usage loop follows.
2. English-channel checks cover UI text, narration, titles, filenames, metadata, preview copy, and package documentation.
3. A separate subtitle check requires Chinese text in every scene, rejects unrelated scripts, and keeps explicit subtitle lines within the readability limit.
4. `render-report.json` records both locales, language-channel results, exact GitHub Actions evidence, render environment versions, source hashes, and hashes for every public artifact.
5. Publication replaces the complete media directory as one unit and restores the previous directory if the replacement fails.

## Inputs, Outputs, Dependencies, and Limits

Input is the public storyboard, current UI source, project evidence, English narration, reviewed Simplified Chinese subtitles, and this rule. Output is a bilingual-access media package under `docs/media/codex-text-control-overview/`.

The checks depend on Node.js. Full rendering also depends on Chrome, FFmpeg, FFprobe, Windows speech synthesis, an installed English voice, and Microsoft YaHei for Chinese subtitles. Code-point checks can enforce language-channel separation, but cannot prove natural wording, Simplified Chinese orthography, or translation quality. Human review is still required.

Objective assessment: the rule prevents stiff Chinese narration, keeps Chinese comprehension available, and forces the story to earn the product introduction by first showing recognizable problems. It does not prove that the copy is persuasive, that the product is localized, or that the video represents a real Codex host session.
