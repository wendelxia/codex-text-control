# Trigger routing 0.6.1

Verified on Windows with Node 24 on 2026-11-01. This is a pre-release.

## Observed failures and correction

An independent model followed the 0.6.0 skill against 24 synthetic requests without seeing expected answers. Its planned tool calls were replayed through a real isolated MCP server. Twenty cases passed; four failed:

| Request | Before | After |
| --- | --- | --- |
| Choose A or B; answer in one sentence | Opened an editor for a one-line recommendation | Ordinary chat |
| Give one short tip | Opened an editor | Ordinary chat |
| 我来改下, with a recent reply and unrelated saved text | Opened the unrelated saved text | Opens the last reply verbatim |
| 让我改, with a recent reply and unrelated saved text | Opened the unrelated saved text | Opens the last reply verbatim |

The old automatic rule included any reusable recommendation, conflicting with its ordinary-question exclusion. Its opening procedure also preferred an existing saved version unless the user explicitly said the reply was newly generated. The revised skill prioritizes ordinary questions and explicit opt-outs, ties automatic editing to the requested deliverable, and chooses the last reply for short editing requests. Model-visible tool guidance states the same rule.

A fresh independent model read only the revised skill and the same requests, without seeing the baseline decisions, expected answers, or proposed fix. All **24/24** decisions and MCP replays passed. Replays checked exact displayed text, render count, saved/draft selection, extension isolation, and that merely opening an editor does not change confirmed context.

The **120 runtime tests**, syntax checks and real stdio MCP probe also passed. Nine wording-matching skill tests were removed: their passing result did not prove correct triggering. The 24 model scenarios are a separate behavioral evaluation, not additional deterministic unit tests.

## Reproduce

Give a fresh evaluator only the current `skills/codex-text-control/SKILL.md` and [request fixtures](../../tests/fixtures/trigger-cases.json). Treat each request independently. `lastReply` is the immediately preceding assistant body; `savedContext` and `savedDraft` are disk state; `plannedFinal` is the complete not-yet-shown answer; `phase` defaults to final. No real UI or production project should be accessed.

Ask for a JSON array with one item per case: `id`, `route`, `sourceText`, `toolCalls`, and a short `reason`. Routes are `none`, `reply`, `candidate`, `saved`, `read`, `extension`, or `clarify`. Each tool call contains `name` and `arguments`; use `/isolated-project` as its placeholder project directory. The evaluator must not read the expected-answer fixture or this result report.

Replay those decisions against isolated temporary projects:

```sh
npm run test:trigger-routes -- decisions.json report.json
```

The checker replaces every project directory with a fresh fixture directory and allows only read/render tools from the model's plan. It seeds synthetic saved content itself; it never calls tools against a user's project. To compare an older policy, generate a fresh set of decisions from that version's skill before replaying.

## Limits

This exercises model decisions after the skill is supplied, and the MCP calls those decisions produce. It is not a live desktop auto-discovery test or a cross-model benchmark. A model can still route differently. The installed plugin needs a host reload/restart; existing tool metadata may remain cached in an already-open chat. Real-host framing and notification limits from the [0.6.0 UI record](inline-reply-0.6.0.md) remain unchanged.
