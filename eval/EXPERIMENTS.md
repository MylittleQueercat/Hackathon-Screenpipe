# Experiments

Each entry is one change to Workflows, measured with the harness on the same saved
history: the receipts suite, seed 1, snapshot `20261017T145651Z-baseline-receipts-s1`,
rerunning Review from step `04-p1-workflow-review` (two open drafts, nothing published;
handoff-check reruns Deepen and Review from `03-p1-workflow-deepen`).
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

## full-text (on parallel-publish)

Keeps what Review writes: a workflow description up to 2,000 characters (agents write
up to ~830; upstream cut at 400), each open question and limitation up to 600 (agents
write up to ~370; upstream cut at 180). Titles, triggers, outcomes, stage text and
bottlenecks keep upstream's bounds; none was ever over them. Prompts, tools and replies
to Review are unchanged: a publish receipt does not echo the text.
`patches/variants/full-text.patch`.

Free check: the probe that publishes r3's corrected payloads saves 9 fields shorter
(956 characters lost) on parallel-publish, none on full-text.

| Run | Requests | Seconds | Checks | Failed calls | Clipped |
|---|---|---|---|---|---|
| 20261017T224506Z r1 | 17 | 102 | 11/11 | 2 | 0 |
| 20261017T224506Z r2 | 19 | 127 | 11/11 | 2 | 0 |
| 20261017T224506Z r3 | 18 | 122 | 11/11 | 2 | 0 |

Every earlier run lost 6 to 12 fields; these lose none, and the receipts description
keeps its exceptions. Requests (17, 19, 18) are within the 13-20 of sequential-publish
Review runs on the engines it builds on: no cost to Review measured. The cost is later:
each catalog read by the next cycle's agents is about 950 characters longer. Checks cannot show the gain (11/11 either way);
`clipped` does.

What it likely improves, not measured here: people read whole descriptions, with the
exceptions the agents put last, and whole open questions (73 of 89 were cut, and the
question tends to come at the end). The next cycle's agents read the saved catalog, not
the drafts, so they would no longer maintain workflows from cut text; that needs full
runs (drift and churn in phase 2) to measure. Not checked: how longer descriptions
render in the app.

## handoff-check (on full-text): Deepen and Review together

Every draft reaches Review in a state Review cannot publish: a procedure item cites a
capture that is not in its stage's evidence, or quotes text the capture does not hold.
Review then repairs it, one rejected publish at a time. Now a handoff to Review runs
the checks Review's publication would run. A draft that would fail is not handed off:
its author gets each failing item ("Review could not publish this draft as it is. ...
fix these items and hand it off again"). Repeated unchanged, the handoff goes through,
so a draft its author cannot fix still reaches Review. Unreachable checks (503, 504)
never block. Prompts and tools are unchanged; only the engine's reply differs.
`patches/variants/handoff-check.patch`.

Free check (`.engines/scratch/probe-handoff.py`: step 03's state, step 04's drafts handed
off twice each): full-text accepts both broken drafts; handoff-check refuses both with
the problems Review's publication reports, then lets the repeat through.

The change moves work from Review to Deepen, so a Review-only run cannot measure it.
These runs start one step earlier, at `03-p1-workflow-deepen`, and run Deepen then
Review in one slot (`wfeval stage <step 03> --through workflow-review`). full-text, the
engine it builds on, is the comparison side, run the same way at the same time.
Requests are Deepen + Review. Failed calls exclude refused handoffs, counted on their own.

| Run | Requests | Seconds | Checks | In stages | Failed calls | Refused handoffs | Output tokens |
|---|---|---|---|---|---|---|---|
| full-text r1 | 43 (11 + 32) | 333 | 11/11 | 4/5 | 5 (4 publish) | | 32,445 |
| full-text r2 | 30 (14 + 16) | 244 | 10/11 | 3/5 | 4 (2 publish) | | 23,946 |
| full-text r3 | 32 (10 + 22) | 243 | 11/11 | 4/5 | 3 (2 publish) | | 24,224 |
| handoff-check r1 | 42 (33 + 9) | 343 | 11/11 | 5/5 | 1 | 5 | 36,192 |
| handoff-check r2 | 29 (20 + 9) | 198 | 11/11 | 4/5 | 0 | 1 | 18,770 |
| handoff-check r3 | 30 (21 + 9) | 223 | 10/11 | 4/5 | 1 | 2 | 21,329 |

Runs `20261017T232347Z-<variant>-stage-deepen-review-…-03-p1-workflow-deepen-r1/r2` and
`20261017T232957Z-…-r3`. "In stages": see Keyword audit below.

- Review took 9 requests in all three runs and never failed a publish; on full-text it
  took 16 to 32 and failed 2 to 4. Every draft Deepen handed off was publishable as given.
- The total did not change: 35 requests, 273 s and 26,900 output tokens on average on
  full-text, against 34, 255 s and 25,400 on handoff-check, within run-to-run spread.
  Deepen did the repairs Review did before, on drafts it had just written.
- Deepen fixed every refused draft and never used the escape hatch (repeating a handoff
  unchanged). In r1 one draft was refused 3 times and the other twice.
- Checks: each side has one 10/11, both `type_lookup` (see Keyword audit). Nothing to
  tell the two apart on 3 runs each.

Claim this supports: Review becomes cheap and predictable (9 requests each time, no
rejected publish), and the cycle costs the same. It does not support a cost saving.

Seen along the way:

- In 2 of the 8 handoff refusals the problem was "Timing boundary does not match captured
  source text": no item, no field, no timestamp. Deepen still fixed it, but the message
  does not say what to fix.
- Deepen's `finish` failed for a missing `expected_revision` in 4 of 6 runs, both
  engines: one wasted request each.
- Deepen's handoff hit the model's output-token limit twice in full-text r2: the call
  never ran.
- `variations` are still cut at 180 characters (0 to 3 per run); full-text did not widen them.

## Keyword audit: what an 11/11 means

The keyword checks (`steps`, `missing_date`, `duplicate`, `high_value`, `type_lookup`)
pass when one of their words appears anywhere the agents wrote. An audit of every saved
receipts workflow (`.engines/scratch/keyword-audit.py`, offline):

- No word passes a check for the wrong reason. The bare "flag" in `high_value` never
  carries a pass alone ("review needed" or "over 500" is always there too); "log" in
  `steps` also matches the email workflow, but every receipts workflow names tracker.csv.
- Where the words appear matters more. A workflow can pass `missing_date` with only an
  open question ("how do flagged rows (duplicate, missing-date, review-needed) get
  resolved?") and `type_lookup` with only a variation quoting the tracker's notes
  ("e.g. 'type from client list'"). Both name the exception without saying what to do.

So grades now report `in_stages` for each passing keyword check: whether its words are in
the stages (names, descriptions, procedure steps), which say what to do. It is not
scored, so every score above stays as it was. Regraded (`.engines/scratch/handled-md.py`):

| Runs | Checks | Keyword checks in stages |
|---|---|---|
| full baseline runs, phase 1 (5) | 10-11/11 | 4-5 of 5 |
| Review from step 04, every engine (18) | 11/11 | 2-4 of 5; `type_lookup` in none |
| Deepen + Review from step 03, full-text (3) | 10-11/11 | 3-4 of 5 |
| Deepen + Review from step 03, handoff-check (3) | 10-11/11 | 4-5 of 5; `type_lookup` in 2 |

`duplicate` and `high_value` are in the stages in every run. The step 04 drafts put the
type lookup only in a variation, and Review never moves it, whatever the engine. That is a
property of this snapshot, not of the agents: full runs put it in the stages in 3 of 5.
Six chain runs are too few to credit handoff-check with it.

So "11/11" means every exception is named in the published workflow, not that
each one says what to do. `in_stages` is the closer measure, and it is still a keyword
match.

## explain-evidence (on handoff-check)

Two handoff refusals in the runs above did not say what to fix ("Timing boundary does
not match captured source text"), and one told Deepen to add a capture that was already
in the stage's evidence: it cited Preview at 12:23:34.093, but the capture at that time is
Finder. The engine knew this but said "add that capture to this stage's evidence", so
Deepen tried again and again. Now:

- A procedure item citing a capture the recorder does not have says what the recorder
  holds there: another app at that time, several captures in that whole second, or the
  app's captures within a minute. The engine reads the recorder around a citation only
  when the citation found nothing.
- A timing rejection names the boundary and why: "Workflow timingRuns: [0].start: the
  quote is not in the text of the Finder capture at 2026-10-16T11:27:26.453+00:00".
- Variations are kept up to 600 characters, like open questions and limitations.
- A `workflow_workspace` write without `expected_revision` uses the latest revision the
  agent was shown, which is what it is told to copy; a stale one still gets the conflict.

Prompts and tool descriptions are unchanged; only the engine's replies and the tool's
handling of an omitted revision differ. `patches/variants/explain-evidence.patch`.

Free check (`.engines/scratch/probe-refusals.py`: the 8 refused handoffs of the
handoff-check runs, replayed through this engine): the two "Timing boundary" ones now name
the boundary, and the Preview one says the capture at that time is Finder.

| Run | Requests | Seconds | Checks | In stages | Failed calls | Refused handoffs | Output tokens |
|---|---|---|---|---|---|---|---|
| explain-evidence r1 | 31 (19 + 12) | 283 | 11/11 | 4/5 | 1 | 3 | 29,040 |
| explain-evidence r2 | 27 (18 + 9) | 258 | 10/11 | 4/5 | 1 | 3 | 27,288 |
| explain-evidence r3 | 27 (18 + 9) | 248 | 10/11 | 4/5 | 0 | 4 | 26,955 |

Runs `20261018T004056Z-…-r1` and `20261018T000646Z-…-r2/r3`. The first r1
(`20261018T000646Z-…-r1`) is not a result: Deepen failed after 4 s with no model
request, because the engine was reinstalling Pi when it started (see Harness fix below).

- Deepen took 18 to 19 requests, against 20 to 33 on handoff-check; Review 9 to 12. Totals:
  28 requests on average against 34 (handoff-check) and 35 (full-text). Output tokens did
  not fall (27,800 on average against 25,400 and 26,900). Three runs each: the request
  drop is in the direction expected, not proven.
- No run got advice to add a capture that was already there. One timing rejection (r1)
  still names no boundary: "Cite the source text supporting each timing boundary" (a
  quote missing or outside 12 to 1,200 characters), a check this variant left as it was.
  The other refusals are quotes that are not in the cited capture, which the agent has to
  fix by reading the source.
- The omitted revision was filled once (r1) and the write went through; the other
  engines failed that write each time (4 of 6 runs).
- `type_lookup` failed in 2 of 3 runs; it fails on every engine from time to time (see
  Keyword audit), so 10/11 here is not a regression signal.

Harness fix: the engine reinstalls Pi in the background each time it starts, and an agent
started meanwhile loads half-replaced packages ("Cannot find package 'isexe'"). The harness
now waits for the install to finish before it runs an agent (`Engine.wait_for_pi`). Of all
runs so far, only that one was hit.

## Output cap: replies cut at 4,096 tokens

Every request asks for up to 128,000 output tokens (`max_completion_tokens`, from the
gateway's own model list), yet 36 of the 1,077 replies in all runs so far stopped at
exactly 4,096 ("length"). A cut reply is a tool call that never runs: the model is told to
re-issue it and often writes the same call again (up to 4 cut replies in a row). Replies
cut this way hold 16.7% of all output tokens across runs, and 55% in full baseline run r4.

The harness does not change the request: its logger returns pi's payload unchanged, and
pi's model settings are written by screenpipe's engine from the gateway's model list.
Upstream `main` (engine and desktop app) sends the same field to the gateway.

Probe, two requests to the screenpipe gateway with Claude Sonnet 5 and a 6,000-token budget:

| Budget sent as | Finish | Output tokens |
|---|---|---|
| `max_completion_tokens` (pi's default) | length | 4,096 |
| `max_tokens` | length | 6,000 |

The gateway applies `max_tokens` and ignores `max_completion_tokens`; it also accepts
`max_tokens` 128,000. `max-tokens` (on explain-evidence) has pi send the budget as
`max_tokens` for Claude models on screenpipe cloud (`compat.maxTokensField`).
`patches/variants/max-tokens.patch`. Built and tested, not yet run.
