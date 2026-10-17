# Experiments

Each entry is one change to Workflows, measured with the harness on the same saved
history: the receipts suite, seed 1, snapshot `20261017T145651Z-baseline-receipts-s1`,
rerunning Review from step `04-p1-workflow-review` (two open drafts, nothing published).
Stage runs, Claude Sonnet 5 through the screenpipe gateway. Checks: the suite's 11
catalog checks after Review, graded with the current truth
(`wfeval grade --truth data/receipts-s1/truth.json <run>`; see Grading correction). Failed calls: Workflows calls the engine refused
(`usage.workspace` in `results.jsonl`, logged since 2026-10-17 20:00Z). Run ids are
`runs/<id>`; ask for a run with `wfeval pack`.

Reproduce an engine variant: `./setup-engine.sh <variant>`, then
`uv run wfeval stage snapshots/20261017T145651Z-baseline-receipts-s1/steps/04-p1-workflow-review --variant variants/<variant>.json --repeat <n>`.

## Baseline

Upstream a8aaee2d plus `patches/harness.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| snapshot cycle | 60 | | | |
| 20261017T150823Z r1 | 56 | 472 | 11/11 | not logged |
| 20261017T202122Z r2 | 38 | 387 | 11/11 | 12 |

The 12 failed calls of r2: 5 "Stage N
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
| 20261017T212357Z r2 | 18 | 132 | 11/11 | 5 |
| 20261017T212402Z r3 | 19 | 131 | 11/11 | 3 |

Each draft: one rejection, one edit, one publish. Review kept every procedure item and
added the missing captures to the stage evidence. Cache-read tokens 0.5-0.7M (baseline
2.3-3.5M), output 13-14k (baseline 43-49k). Remaining failures: 2 procedure rejections
(one per draft) and a 409 after each rejected publish.

## rejection-keeps-revision (on clearer-rejection)

A publish marks its draft in flight and clears the mark when it is rejected: two
revision bumps the 422 never mentioned, so Review's next edit got 409. Restoring the old
revision would reuse a revision number (an edit could then apply to state its author
never read), and not bumping on the mark lets a parallel edit inherit it, so the
rejection now says where the revision is: "Workspace revision is now N: use it as
expected_revision for your next change." `patches/variants/rejection-keeps-revision.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| 20261017T212825Z r1 | 14 | 101 | 11/11 | 3 |
| 20261017T213817Z r2 | 20 | 147 | 11/11 | 2 |
| 20261017T213822Z r3 | 36 | 216 | 11/11 | 3 |

The failure it targets is gone: no 409 after a rejected publish in 3 runs
(clearer-rejection: 3 in 3). Requests are not lower than clearer-rejection's. r3: Review
sent both publishes in the same second, one got 409 instead of its detailed 422, and
Review diagnosed that draft by hand (15 bash calls). Parallel publishes are the
remaining variance.

## no-second-precision (ablation)

clearer-rejection and the revision note on the harness engine without second-precision
(exact matching, as upstream). Is second-precision still needed once rejections are
clear? `patches/variants/no-second-precision.patch`.

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| 20261017T214449Z r1 | 23 | 172 | 11/11 | 4 |
| 20261017T214454Z r2 | 26 | 206 | 11/11 | 4 |
| 20261017T214459Z r3 | 29 | 186 | 11/11 | 3 |

Every run hits the whole-second rejection 2-3 times. Median 26 requests against 20
for the same change with second-precision (14, 20, 36) and 19 for clearer-rejection
(18, 19, 19); cache read 0.8-1.2M against 0.4-0.7M outside rejection-keeps-revision r3. Keep
second-precision.

## parallel-publish (on rejection-keeps-revision)

Review often publishes both drafts in one turn (4 of the 6 runs above). Each publish
required the whole workspace unchanged, so the second got 409 and was never checked;
if it had succeeded, the catalog check would have refused it next. Now a draft
publication needs only that draft unchanged since the revision Review read (still open,
Review's, in a running cycle, and not read before a Stop), and one that creates a
workflow does not need the catalog unchanged. Finish, and updates to an existing
workflow, keep the exact checks. `patches/variants/parallel-publish.patch`.

Free check, `wfeval probe-publish <step 04> --parallel` (both drafts at once, same
revisions), and the same with r3's corrected payloads:

| Drafts | rejection-keeps-revision | parallel-publish |
|---|---|---|
| as given (invalid) | one 422, one 409 | two detailed 422s |
| corrected | one saved, one 409 | both saved |

| Run | Requests | Seconds | Checks | Failed calls |
|---|---|---|---|---|
| 20261017T221643Z r1 | 15 | 107 | 11/11 | 2 |
| 20261017T221643Z r2 | 13 | 92 | 11/11 | 2 |
| 20261017T221643Z r3 | 18 | 117 | 11/11 | 2 |

These runs do not measure the change: Review published one draft at a time in all
three, and sequential publishes get the same replies as rejection-keeps-revision.
Prompts, tools and model were byte-identical to the runs above. Sequential runs before
took 19 and 20 requests, so 13-18 is run-to-run variation. The evidence for the change
is the probe; a stage run measures it only when Review happens to publish in parallel.

## Grading correction: missing_date was never missed

Earlier versions of this file reported `exception_missed:missing_date` in 10 of 15
Review runs, baseline included. The workflows were right and the grader was wrong: every
saved receipts workflow names the flag "missing-date" (in its open questions and
limitations), and the snapshot's `truth.json` predates `45b61b910`, which added that
spelling to the check. A stage run grades with the truth it ran with (the snapshot's),
so nothing used the new spelling. The hyphen is the only difference between the two
truths. Regraded with the current one, all 15 runs pass all 11 checks, and the tables
above now show those grades.

No conclusion changes: requests, seconds and failed calls are not graded, and every
engine was regraded with the same truth.

So that a stale truth is seen, not silently used:

- `wfeval grade --truth data/<suite>-s<seed>/truth.json <run>` now regrades stage runs
  too, from the files the run kept (it reproduces each run's own grade without
  `--truth`).
- A stage run whose snapshot truth differs from the current one says so, and every
  result records `truth`, an id of the truth that graded it.
- `wfeval compare` warns when its runs were graded with different truths.

The correction also showed something the checks cannot see. The engine cuts every
workflow description at 400 characters and every open question and limitation at 180,
without a word to the agent (the output contract says only `string`). Every run, on
every engine, lost 6 to 12 fields and 613 to 1,207 characters this way (9 and about 950
in 11 of 15): the receipts
description lost its list of exceptions mid-word ("a scan matching an existing amo").
The checks still passed because the same words survive in other fields. Results now
report `clipped`: each string Review published that the catalog saved shorter.
