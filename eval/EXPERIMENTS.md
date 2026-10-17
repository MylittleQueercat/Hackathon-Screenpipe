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

## clearer-rejection (on second-precision)

"Stage N retained X of Y proposed procedure items" now lists every failing stage and up
to five items each, with the reason from the same check that dropped it ("procedure[1]:
cites TextEdit at ..., which is not one of this stage's verified evidence entries; add
that capture to this stage's evidence or cite one that is there"; "quote is not in the
text of the Finder capture at ..."). `patches/variants/clearer-rejection.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| 20261017T205455Z r1 | 19 | 152 | 11/11 | 4 |
| 20261017T212357Z r2 | 18 | 132 | 10/11 | 5 |
| 20261017T212402Z r3 | 19 | 131 | 11/11 | 3 |

Each draft: one rejection, one edit, one publish. Review kept every procedure item and
added the missing captures to the stage evidence. Cache-read tokens 0.5-0.7M (baseline
2.3-3.5M), output 13-14k (baseline 43-49k). Remaining failures: 2 procedure rejections
(one per draft) and a 409 after each rejected publish.
