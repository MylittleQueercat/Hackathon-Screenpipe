# Experiments

Each entry is one change to Workflows, measured with the harness on the same saved
history: the receipts suite, seed 1, snapshot `20261017T145651Z-baseline-receipts-s1`,
rerunning Review from step `04-p1-workflow-review` (two open drafts, nothing published).
Stage runs, Claude Sonnet 5 through the screenpipe gateway. Checks: the suite's 11
catalog checks after Review. Failed calls: Workflows calls the engine refused
(`usage.workspace` in `results.jsonl`, logged since 2026-10-17 20:00Z). Run ids are
`runs/<id>`; ask for a run with `wfeval pack`.

Reproduce an engine variant: `./setup-engine.sh <variant>`, then
`uv run wfeval stage snapshots/20261017T145651Z-baseline-receipts-s1/steps/04-p1-workflow-review --variant variants/<variant>.json --repeat <n>`.

## Baseline

Upstream a8aaee2d plus `patches/harness.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| snapshot cycle | 60 | | | |
| 20261017T150823Z r1 | 56 | 472 | 10/11 | not logged |
| 20261017T202122Z r2 | 38 | 387 | 10/11 | 12 |

Both runs miss `exception_missed:missing_date`. The 12 failed calls of r2: 5 "Stage N
retained X of Y proposed procedure items", 3 x 409 "Workspace changed" right after a
rejected publish, 2 "no stage evidence matching" (whole-second citations), 1 tool call
truncated at the output limit, 1 note missing. `wfeval why-rejected` on r2: every
procedure rejection had items citing a capture absent from that stage's evidence, which
Review never added; it published by dropping those items (draft 592b stage 1: 3 items
to 1).

## second-precision

Agents cite whole seconds; captures carry milliseconds; publication compared them
exactly in three places (evidence resolution, procedure sources, timing boundaries). A
whole-second citation now names the one capture of that app in that second
(`cites_capture`; ambiguous or neighbouring seconds still fail).
`patches/variants/second-precision.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| 20261017T195449Z r1 | 61 | 562 | 11/11 | not logged |

No saving on its own. Free probe (`wfeval probe-publish`): drafts get past evidence
matching and fail on their real errors instead; a hand-corrected draft publishes here
and is still rejected by baseline. Review's cost was the procedure rejections it could
not diagnose, not this.
