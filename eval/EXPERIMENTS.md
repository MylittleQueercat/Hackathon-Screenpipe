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

The last section, End to end, compares full three-phase runs of baseline and the final
stack instead.

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
gateway's own model list), yet 37 of the 1,162 replies in all runs before `max-tokens`
stopped at exactly 4,096 ("length"). A cut reply is a tool call that never runs: the model is told to
re-issue it and often writes the same call again (up to 4 cut replies in a row). Replies
cut this way hold 15.7% of all output tokens across those runs, and 55% in full baseline run r4.

The harness does not change the request: its logger returns pi's payload unchanged, and
pi's model settings are written by screenpipe's engine from the gateway's model list.
Upstream `main` (engine and desktop app) sends the same field to the gateway.

Probe, two requests to the screenpipe gateway with Claude Sonnet 5 and a 6,000-token budget:

| Budget sent as | Finish | Output tokens |
|---|---|---|
| `max_completion_tokens` (pi's default) | length | 4,096 |
| `max_tokens` | length | 6,000 |

The gateway applies `max_tokens` and ignores `max_completion_tokens`. A third, streamed
request with `max_tokens` 128,000 and a prompt asking for a very long answer finished
normally ("stop") after 51,293 output tokens in 619 seconds, so there is no second,
lower ceiling near the sizes agents write; sending the advertised budget is enough. `max-tokens` (on explain-evidence) has pi send the budget as
`max_tokens` for Claude models on screenpipe cloud (`compat.maxTokensField`).
`patches/variants/max-tokens.patch`.

Deepen + Review chain runs from step 03 (same step and history as sections 7, 8 and 10;
every request now carries `max_tokens: 128000` instead of `max_completion_tokens`):

| Variant | Replies | Cut at 4,096 | Longest reply | Mean output tokens | Requests per run | Checks |
|---|---|---|---|---|---|---|
| full-text | 105 | 1 | 4,096 | 26.9k | 43, 30, 32 | 11, 10, 11 |
| handoff-check | 101 | 0 | 4,003 | 25.4k | 42, 29, 30 | 11, 11, 10 |
| explain-evidence | 85 | 1 | 4,096 | 27.8k | 31, 27, 27 | 11, 10, 10 |
| max-tokens | 91 | 0 | 7,679 | 25.1k | 36, 35, 20 | 11, 11, 11 |

No reply was cut; two replies went past 4,096 (7,679 and 4,177) and would have been cut
before. The chain runs cannot show more than that: they rarely hit the cap (2 cut replies
in 291). Of the 37 cut replies in all runs, 34 were in full runs, and by agent 19 were in
Review, 13 in Maintain and 5 in Deepen. Requests (mean 30 against 28) and checks are
within the run-to-run spread at n=3. What the fix saves shows only in full runs.


## quote-hint (on max-tokens)

Most refused handoffs in the runs above are quotes the engine cannot find in the cited
capture. Of the 28 failing quotes in the max-tokens runs (`.engines/scratch/quote-fails.py`,
each quote compared with the seeded capture it cites):

| Why the quote is not in the capture's text | Quotes |
|---|---|
| It is the window title or URL, which the agent sees but the text does not hold | 9 (+1 title and text together) |
| Near-exact: added separators (" / ", " > "), changed punctuation or case | 6 |
| Lines skipped, or paraphrased | 10 |
| Taken from another capture | 2 |

Now:

- A capture's window title is put before its text where the agent reads captures (the
  recorder search and the bundle snippets), unless the text already holds it, so a title
  the agent quotes is in the text it is checked against.
- A quote that does not match says where the text is closest: "quote is not in the text
  of the Finder capture at …; its closest passage is "…". Quote consecutive words exactly
  as captured: skipped lines, added separators or edited words do not match". If no
  passage shares a third of the quote's words, it gives the start of the capture's text.
- A timing quote that is too short or missing says so with the limits ("a timing quote
  needs 12 to 1,200 characters of the capture's text; this one has 7").

Prompts and tool descriptions are unchanged. `patches/variants/quote-hint.patch`.

Free check (`probe-refusals.py`, the 34 refused handoffs of all chain runs replayed as
they were): max-tokens accepts 0, quote-hint 3 (window titles now in the text).

| Run | Requests (Deepen + Review) | Seconds | Checks | Failed calls | Refused handoffs | Output tokens |
|---|---|---|---|---|---|---|
| quote-hint r1 | 28 (16 + 12) | 188 | 10/11 | 3 | 2, both fixed | 18,649 |
| quote-hint r2 | 33 (24 + 9) | 314 | 11/11 | 6 | 5, 2 fixed | 33,528 |
| quote-hint r3 | 25 (15 + 10) | 223 | 10/11 | 4 | 3, 1 fixed | 23,441 |

Runs `20261018T014556Z-quote-hint-…-r1/r2/r3`. Mean 29 requests (max-tokens 30), 242 s,
25.2k output tokens, no reply cut. Within the spread at n=3. The misses are `type_lookup`
again (see Keyword audit). Refusals per run did not fall (10 in 3 runs): 6 are timing
quotes or citations of the wrong app, now with the closest passage or the right times,
1 is a quote too short (now named as such), and 3, one per run, are procedure items
citing a capture that is quoted correctly but missing from the stage's `evidence` list,
which the next variant addresses.

## cited-evidence (on quote-hint)

In the quote-hint runs, a common refusal is "add that capture to this stage's evidence":
Deepen cites a capture in a procedure item, quotes it correctly, and the handoff is
refused because the stage's `evidence` list does not name it. The citation already
says which capture it is, so the engine now counts each procedure item's `{timestamp,
app}` as stage evidence: when it normalizes the stage, when it checks the procedure, and
when it reads the recorder for sources (at most 240 reads; payloads seen hold at most 13
citations). A citation still has to be in the recorder and its quote in that capture.

Prompts and tool descriptions are unchanged. `patches/variants/cited-evidence.patch`.

Free check (same 34 refused handoffs): cited-evidence accepts 10 as they were sent
(quote-hint 3, max-tokens 0).

| Run | Requests (Deepen + Review) | Seconds | Checks | Failed calls | Refused handoffs | Output tokens |
|---|---|---|---|---|---|---|
| cited-evidence r1 | 24 (17 + 7) | 212 | 11/11 | 3 | 2, 1 fixed | 21,215 |
| cited-evidence r2 | 28 (15 + 13) | 282 | 11/11 | 4 | 4, 2 fixed | 31,254 |
| cited-evidence r3 | 25 (16 + 9) | 208 | 11/11 | 2 | 1, fixed | 20,230 |

Runs `20261018T015628Z-cited-evidence-…-r1/r2/r3`. Mean 26 requests, the lowest of all
chain variants (max-tokens 30, quote-hint 29, explain-evidence 28, full-text 35), 234 s,
24.2k output tokens, 11/11 checks in all three runs, no reply cut. Still n=3. None of the
7 refusals is a missing stage evidence entry (3 in the quote-hint runs): 5 are timing
quotes or run order, 1 a procedure item citing the wrong app, 1 a procedure quote not in
its capture; one more handoff was a "workspace changed" conflict (see Not fixed).

## idle-skip (on cited-evidence)

Phase 3 records nothing, yet in full baseline run r4 it cost 93 requests (Discover 9,
Review 39, Maintain 45; 82,175 output tokens), more than phase 1 (47) or phase 2 (55),
and changed one workflow while nothing new had happened ("idle churn"). Upstream reports
Discover ready one hour after the last cycle ended, whether or not anything was recorded
since, so every hour of an idle machine opens a cycle over an empty period, and that
cycle wakes Review and Maintain. The harness's phase 3 is one such cycle.

Now, when the last cycle is complete and the recorder holds no frame or audio after the
catalog's `checkedThrough`:

- the workspace context reports Discover not ready, with `idle`: "Nothing was recorded
  after …, the end of the last checked period.", so the scheduler starts no model session;
- `start` returns that message plus "No cycle was started; stop here." and the current
  cycle unchanged, instead of opening a new cycle (for callers that start a cycle
  themselves, as the desktop app and the harness do).

As soon as anything is recorded after that point, Discover is ready again and `start`
opens a cycle as before (`crates/screenpipe-engine/tests/workflow_idle_test.rs`).
Prompts and tool descriptions are unchanged. `patches/variants/idle-skip.patch`.

Harness: a phase whose start returns `idle` runs no agent and is graded as it stands
(`cycle_status: idle`); before, the harness waited for the cycle.

Free check (`.engines/scratch/probe-idle.py`, the end of phase 2 of a baseline run
restored on each engine): baseline reports Discover ready; idle-skip reports it not
ready with the message above, and `start` leaves the completed cycle as it was.

Full runs (see End to end): phase 3 cost 0 requests on the stack against 56 on baseline
r5 (93 on r4), and the stack's catalog was left as it was.

## Not fixed

Seen in the runs above and left as they are, because fixing them would change what the
model is told (prompts or tool descriptions) or they are too rare to measure here:

- Deepen calls `finish` without a note and gets "Include the evidence decision or
  remaining question in note." (409), then retries with one: about 1 request per run
  (4 of the 6 quote-hint and cited-evidence runs). The rule is in the engine, but the
  tool description does not say a note is required.
- A handoff refused as "workspace changed" (409) in 3 of the 9 max-tokens, quote-hint
  and cited-evidence runs: one used a stale revision number, one raced a parallel write,
  one is unclear. The agent reads the context and hands off again, at the cost of one or
  two requests.
- A partial `payload` in an edit replaces the whole draft instead of merging (1 of 113
  edits), losing the fields it left out.
- `type_lookup` (the workflow names the client-types lookup) fails on every engine from
  time to time; see Keyword audit.

## The allowance

All runs use the screenpipe gateway on a screenpipe cloud account. The gateway pauses
workflow requests (`x-screenpipe-workload: pipe`) with `workflow_allowance_paused` once
the account's weekly combined allowance is 75% used; a run that hits it is marked
`rerun` and is not a result. The meter is `/v1/usage` → `hosted_ai.allowances`
(`used_today` does not move). On this account one point of the weekly allowance was
about 22 to 25 requests of these agents, so a full baseline run (about 195 requests)
costs about 8 points. The harness never removes the header to get around the pause.

## End to end: baseline against the final stack

Full runs, all three phases (phase 1: four days of history; phase 2: the naming-rule
change; phase 3: nothing new), the same history (receipts, seed 1), Claude Sonnet 5
through the screenpipe gateway. `idle-skip` is the final stack: every engine change
above in order, from second-precision to idle-skip, in one patch
(`patches/variants/idle-skip.patch`). Instructions, task prompts and tool definitions of
all four agents hash the same in every run on both sides (`run.json` → `prompts`); only
the engine's replies differ.

| Run | Phase | Requests (Discover / Deepen / Review / Maintain) | Seconds | Checks | Output tokens | Replies cut at 4,096 |
|---|---|---|---|---|---|---|
| baseline r5 | 1 | 86 (21 / 13 / 47 / 5) | 588 | 11/11 | 63,498 | 0 |
| | 2 | 71 (14 / 13 / 26 / 18) | 512 | 2/2 | 70,932 | 10 |
| | 3 | 56 (6 / 0 / 32 / 18) | 438 | 1/1, idle churn | 47,944 | 2 |
| | all | **213** | **1,538** | | **182,374** | 12 |
| idle-skip r1 | 1 | 57 (17 / 24 / 12 / 4) | 347 | 11/11 | 42,306 | 0 |
| | 2 | 54 (13 / 14 / 8 / 19) | 272 | 2/2 | 50,196 | 0 |
| | 3 | 0, no cycle | 0 | 1/1 | 0 | 0 |
| | all | **111** | **619** | | **92,502** | 0 |
| baseline r6 | 1 | 48 (16 / 15 / 12 / 5) | 346 | 10/11 | 47,855 | 6 |
| idle-skip r2 | 1 | 60 (23 / 20 / 13 / 4) | 362 | 11/11 | 44,924 | 0 |

Runs `20261018T020827Z-baseline-…-r5`, `20261018T020907Z-idle-skip-…-r1`,
`20261018T020847Z-baseline-…-r6` and `20261018T020927Z-idle-skip-…-r2`, all started
within 60 s of each other. r6 and r2 were stopped in phase 2 to stay under the
allowance pause (see The allowance); their phase 1 is complete and graded, the partial
phase 2 is kept in `stopped-phase2/` and not scored. Seconds are the agents' time in
each phase, not the hour of waiting between cycles.

On the complete pair, the stack took 111 requests against 213 (−48%), 4.0M input
tokens against 7.8M (cached included, −48%), 92k output tokens against 182k (−49%) and
619 s of agent time against 1,538 s (−60%), and lost no check; the documents
themselves were judged worse (see LLM judge). The earlier full baseline
run r4 (17 October, the same engine binary, before the latest harness changes) took 195 requests,
6.8M input and 200k output tokens and 1,569 s, with the same checks as r5 except the
email job in phase 1.

- Phase 3 is the one change that holds by construction: with nothing recorded after the
  last checked period, the stack opens no cycle, so it costs nothing and changes nothing.
  Baseline spent 56 requests there (93 in r4) and rewrote the receipt workflow both
  times (`idle_churn`) with no new evidence.
- Phases 1 and 2 spent less on the stack (phase 1: 57 and 60 requests against 86, 48 and
  r4's 47; phase 2: 54 against 71 and r4's 55), but baseline's own spread is wider than
  the gap: these phases show the direction, not a proven saving.
- No reply was cut on the stack (`max-tokens`); baseline cut 12 in r5 and 27 in r4,
  most of them in Review and Maintain in phases 2 and 3.
- Checks: the stack passed all 11 in both phase-1 runs; baseline missed the email job
  once (r6 merged it into the receipt workflow; r4 missed it). `wfeval compare` on the
  four runs: fixed 1, broken 0, p = 1.0, too few runs to call it. Reported, not scored:
  the stack put `type_lookup` in the stages in 2 of 2 runs (baseline 0 of 2), and
  `missing_date` and `steps` in 1 of 2 (baseline 2 of 2).

One complete pair and two phase-1 pairs: the idle saving is certain, the rest is a
consistent direction that more runs would have to confirm. The LLM judge below found the
stack's documents worse on the complete pair, for reasons traced to the model's choices
in that run, and better on the second pair's phase-1 receipts. The weekly allowance went from 38% to 69% over these four runs and is now at the
75% pause, so this project runs no more.

## LLM judge: are the documents as good?

The suite's checks ask whether the right jobs and exceptions are named. To see how good the
documents themselves are, each published workflow of the complete pair (baseline r5 and
the stack's r1) was judged against the recorded history: 2 workflows (receipts, email) ×
3 phases = 6 pairs, each judged twice with the two documents swapped, by 12 fresh Claude
Sonnet agents (`sonnet-high`; the agents that wrote the documents are Sonnet 5 on both
sides). Each judge had only `/tmp/wfjudge/`: the brief, its two documents as X and Y, the
generator's truth and the full history with its labels. Blinding: ids, revisions,
timestamps of the catalog's own bookkeeping, the engine's `quality` grade and screenshot
fields removed; the stack's timestamps moved onto baseline's clock (phase 2 was anchored
40.5 s apart) so that every cited time is one in the history; no variant name or run path
in any document. Scores are 1 to 5 on 8 metrics (faithful, procedure, exceptions,
rule_change, usable, calibration, numbers, clarity), every deduction quoting the document.
A preference counts only when both orders agree. `.engines/scratch/judge/` (local):
`BRIEF.md`, `build.py`, `key.json`, `results/`, `tally.py`.

| Pair | Order a | Order b | Verdict | Correctness, base → stack |
|---|---|---|---|---|
| phase 1, receipts | base, clear | base, clear | base | 4.00 → 2.50 |
| phase 1, email | base, strong | base, strong | base | 3.00 → 2.50 |
| phase 2, receipts | base, clear | base, clear | base | 3.75 → 3.00 |
| phase 2, email | base, strong | base, strong | base | 3.38 → 2.12 |
| phase 3, receipts | base, slight | base, slight | base | 3.62 → 3.50 |
| phase 3, email | base, strong | base, strong | base | 4.12 → 2.25 |

Correctness is the mean of faithful, procedure, exceptions and rule_change. Mean scores
over all 12 judgments, base → stack: faithful 3.67 → 2.50, procedure 3.33 → 2.33,
exceptions 3.67 → 2.75, rule_change 4.12 → 3.25, usable 3.58 → 2.33, calibration 3.33 →
2.50, numbers 3.50 → 2.17, clarity 3.75 → 3.67.

Baseline's documents won all six pairs, in both orders. What the judges named:

- Email (strong in every phase): the stack's document finds 2 of the 3 occurrences, says
  the Save As dialog and the Finder check were not captured (they were, on all three
  days), times only the typing of the reply (about 15 s against 1.4 to 2 min), and gives
  no folders or file names. Baseline's finds all three with the Save As dialogs, folders
  and senders; its main error is placing the Preview step after the save.
- Receipts (clear, then slight): the stack's document ties the job to the one-off HP
  printer setup, which belongs to another planted job, keeps the missing date and the
  high amount only in the description, and in phase 1 leaves out the Finder rename, then
  asks whether it happens. It is better on the client-types lookup and has timings.
- Phase 3: the stack's documents are its phase-2 ones unchanged. Baseline's receipts
  document is also unchanged, so phase 3 receipts is the same pair as phase 2 judged again
  by new judges: base both times, clear then slight (correctness gap 0.75 then 0.12). The
  receipts margins are within that judge-to-judge spread; the email margins are not.
  Baseline's email document was rewritten in phase 3 (the `idle_churn` the checks count
  as a mistake), and the judges scored the rewrite higher than its phase-2 version
  (correctness 3.38 → 4.12): that idle cycle, which idle-skip removes, improved a
  weak document here.

Where the gaps come from, traced through each agent's handoffs in phase 1
(`.engines/scratch/publish-rewrites.py` and the request logs):

- Email: Deepen's draft held all three occurrences and the Save As steps on both
  sides. Baseline's Review handed it back 5 times, but only to fix timestamps and quotes,
  then published it as Deepen wrote it. The stack's Review published its own rewrite
  instead (4,808 characters for Deepen's 5,846), which dropped the 10-14 occurrence and
  the Save As steps and added "not captured". Review rewriting at publish is the model's
  choice and is not specific to the stack: baseline r5 did it twice in later phases and
  r6 once; no stage run did.
- Receipts: Review published Deepen's draft as handed off on both sides. The stack's
  Discover folded the one-off printer setup into the receipts proposal (3 printer
  mentions, no rename), and Deepen built on it; baseline's Discover proposed in 327
  characters and its Deepen wrote the rename step (9 mentions, 10 of Finder).

So on this pair the gaps start in one Discover framing and one Review rewrite, not in
the rejections the stack changes or moves to Deepen: baseline's extra Review work
corrected citations, not content. One stack change does reach Discover and Deepen
(quote-hint puts window titles into the capture text they read); one pair can neither
rule it in nor out.

Second pair (baseline r6 and the stack's r2, both stopped in phase 2 at the allowance):
only phase 1 receipts can be judged, since r6 published no separate email workflow. Same
brief and blinding (phase 1 needed no clock shift), 2 new judges, `build.py pair2`,
`key2.json`, `/tmp/wfjudge2`. The stack won in both orders, strong; correctness 2.67 →
4.33 (base → stack), all metrics 2.71 → 3.93. Baseline r6's document has no rename stage
and no mention of Finder, and adds a stage "Acknowledge emailed project files": the
email job merged into receipts, the check r6 lost. The stack's document has review,
rename and log stages and all four exceptions as actions; its faults are a passing
mention of the printer setup as a trigger, and repetitions 2 for a job done on 4 days
(both sides miscount). So on phase 1 receipts the two pairs split, one each, and each
loss starts in that run's own Discover framing (printer setup folded in, email merged
in).

Caveats: one run per side; the judges are one model family, also the one that wrote both
sides; a judge sees a document, not how it was made. The first round had two stack
timestamps that the clock shift had moved off by a second or left unshifted (a range end);
those four receipts judgments were rerun on fixed packets with the same outcome
(`results-v1/` keeps the first round).

What it means for the end-to-end numbers: on the complete pair the stack's documents are
worse, and the suite's checks did not see it, but the causes traced so far are run-to-run
choices of the model rather than the changes, and the second pair's phase 1 went the
other way. The checks need a document-quality measure like
this one beside them, and the cost savings need more pairs judged before quality can be
called kept or lost.
