# Synthetic data for the Workflows eval

What the harness writes into an isolated engine, and the rules that make a run's result
mean something. Facts about screenpipe are from upstream `a8aaee2d` (2026-10-16).

## What the workflow agents can see

`workflow-discover`, `-deepen`, `-review` and `-maintain` may call only
`/workflows/context`, `/workflows/workspace`, `/activity-summary`, `/search`,
`/meetings`, `/meetings/*` and `/frames/*` (pipe frontmatter, `permissions.allow`). In
the 285 recorded runs on this Mac they used `/activity-summary` for the overview and
`/search?content_type=accessibility` for detail, with `ocr`, `parsed`, `audio` and `all`
now and then. Everything a job leaves on screen must therefore be in frames, as
accessibility text, with app, window and timestamp.

Three code facts constrain the data:

- **Repetition is counted in calendar days.** `repetitions = observed_runs =
  repeated_day_count(evidence)`, the number of distinct dates among cited evidence. A
  candidate on one day is graded `limited` with "Only one captured day supports this
  candidate; repetition is not established" (`workflows/mod.rs`).
- **Evidence is a `(timestamp, app)` pair** resolved through the recorder
  (`workflows/evidence.rs`). A citation that matches no frame is not evidence.
- **The window is relative to now.** A first cycle covers 7 days back from its start;
  later cycles cover `checkedThrough − 2 h` to now. The scheduler starts a new cycle only
  an hour after the last one ended (`workflows/workspace.rs`, `ready`); the desktop's
  "Update now" starts one at once (`lib/workflows/scheduled-discovery.ts`), and the
  harness does the same.

## Records written

Through `POST /eval/seed`, a route the harness patch adds and enables only when
`SCREENPIPE_EVAL_SEED=1`. `/add` can't be used: it encodes an image per frame into video
and writes the text as OCR, so seeded work would be missing from
`content_type=accessibility`, the view agents use most.

| Record | Fields | Written with |
|---|---|---|
| frame | `timestamp`, `app_name`, `window_name`, `browser_url`, `focused`, `capture_trigger` (`window_focus`, `key_press`, `click`, `scroll_stop`, `idle`), `text_source = accessibility`, `accessibility_text` | `insert_snapshot_frame`, as capture does |
| UI event | `timestamp`, `event_type` (`click`, `key`, `app_switch`, `window_focus`, `scroll`), `app_name`, `window_title`, `element_role`, `element_name`, `element_value`, `text_content`, `frame_id` | `insert_ui_events_batch` |

Not written: audio, meetings, memories, screenshots (frames point at one blank JPEG, so
`/frames/*` returns an image with no content), elements and semantic context
(`content_type=parsed` returns nothing). Each one is a gap between seeded and real
history; adding it is a data change, versioned like any other.

## A suite is one history

A suite is a multi-day history in which several jobs, one-offs and noise interleave, as
in a real week. Jobs are written as hidden stories; the renderer turns each step into
the frames and events a capture would produce. The truth file (expected workflows and
the checks below) is written next to the data and never seeded or mounted.

Generation is deterministic: the same suite and seed give the same bytes. Timestamps
are stored as offsets and anchored when the seed is written.

## Rules for a meaningful result

Each rule closes a way a run could pass or fail for a reason other than the behaviour
it is meant to test.

1. **Recurrence across days.** A job meant to be found runs on at least 3 distinct days
   (the code needs 2; the third leaves room for one missed day), at least once a day. A
   one-off appears on exactly one day. A job may declare `min_days: 2` to test the
   code's threshold itself (`busy`'s hours report).
2. **Inside the window.** Phase 1 history sits within the last 6 days of the anchor.
   Phase 2 history is dated after the phase-1 cycle's `checkedThrough`, otherwise
   discover sees nothing new: it ends a minute before seeding, and the runner waits
   until its whole span fits after `checkedThrough`.
3. **Everything decisive is on screen.** The document fields, the new filename typed in
   Finder, the tracker row typed in TextEdit, the missing date, the matching amount of
   a duplicate, the client list entry, the naming-rule notice: if no observer could see
   it, no system can learn it. The generator checks that each expected check has at
   least one frame containing its key text, and refuses to write the suite otherwise.
4. **No answer on screen.** No case ids, no "duplicate", "noise", "test", "eval" or
   "screenpipe" in paths, filenames, window titles or document text. The user's own
   working notes ("missing date", "duplicate of 0412") are allowed: a real operator
   would write them, and they are part of what the agent should learn from.
5. **Capture density like the real thing.** About 7 frames per active minute (this
   Mac: 2,355 frames over 5.5 active hours), a frame on each window focus, keystroke
   burst, click and scroll stop, near-identical repeated frames while a screen sits
   still. A job run lasts 2 to 6 minutes.
6. **Runs vary.** Times of day, step durations, amounts, names and wording vary from
   run to run, from the seed. Copy-pasted runs could be read as repeated snapshots of
   one run, which the prompts tell the agent to collapse.
7. **Noise is unstructured.** Browsing, chat and terminal activity between runs, with
   no trigger, steps and outcome that repeat across days. Noise that repeats as a job
   would be an unlabelled workflow; a workflow the truth doesn't list is reported as
   `unexpected_workflow`, not scored as wrong.
8. **Jobs that should stay apart share apps.** The email-attachment job uses Preview and
   Finder like the receipt job; only trigger, steps and outcome differ.
9. **Idle stretches exist.** A phase with no new history measures what a cycle costs
   when there is nothing to find.
10. **Variants of a suite for consistency.** The same stories rendered with renamed
    vendors, another browser, shifted times: the expected workflows don't change. A
    decisive change (the naming rule) must change them.

## Suites

| Suite | Jobs | Use | Built |
|---|---|---|---|
| `receipts` | Receipt filing (4 days) with its exceptions; email attachment (3 days); a one-off; noise; idle | Develop against it | yes |
| `busy` | Receipts (4 days), email (3), invoice sending (3, a look-alike of receipts), hours report (2 days only), two one-offs (one a batch rename), noise in the jobs' apps; 5 days | Move scores off the ceiling | yes |
| `receipts-renamed` | The same stories, other vendors, apps and times | Consistency | planned |
| `holdout` | Other jobs: support ticket triage, weekly sales report, a one-off | Final comparison only | planned |

Your own suites: a JSON file in `suites/<name>.json` (or add one from the PipeOps page,
Step 01, "Custom test suites"). The format is at the top of `src/wfeval/custom.py`;
`suites/standup.json` is a working example. It goes through the same generator and rules as
the built-in suites, so a suite that breaks a rule is refused with the reason.

### `receipts`: what each check expects

Receipt filing: open a scanned receipt in Preview, read name, date, amount and type,
rename it in Finder to `DATE_NAME_TYPE.pdf`, add a row to `tracker.csv` in TextEdit.

| Check | Seeded as | Expected after the cycle |
|---|---|---|
| `found` | 4 days, 2 to 3 runs a day | one workflow for receipt filing |
| `no_duplicate` | day 2 runs with tracker first, then rename | still one workflow |
| `steps` | every run | steps include the rename and the tracker row |
| `missing_date` | day 2, a receipt without a date filed as `UNKNOWN-DATE_…` | handled in steps or variations |
| `duplicate` | day 3, the same receipt as day 1, compared, not renamed, tracker `duplicate` | handled |
| `high_value` | day 3, 780 EUR, tracker `review needed` | handled |
| `type_lookup` | day 4, type `UNKNOWN`, `client-types.txt` opened, then renamed | handled |
| `noise_excluded` | day 3, Discord for 30 s in the middle of a run | Discord not a step or app of the workflow |
| `drift` (phase 2) | today, `naming-rule-update.txt`, then `TYPE_DATE_NAME.pdf` | the same workflow now names the new rule |
| `email_separate` | 3 days: open message, save attachment to a project folder, reply | a separate workflow |
| `one_off_unpublished` | 1 day: printer driver setup | not published |
| `evidence_resolves` | — | every cited `(timestamp, app)` is a seeded frame |
| `idle_cost` (phase 3) | nothing new | tokens and agent runs, no check |

"Handled" is a keyword match over the workflow's steps, variations and open questions,
with the synonyms listed in the truth file. Keyword matching can miss a paraphrase; the
raw workflow text is kept with every grade so a miss can be read and, if needed, added
as a synonym or settled by a judge validated against hand labels.

### `busy`: what is harder

The receipt and email jobs are `receipts`' (fewer exceptions: missing date, high value,
the chat in a run, the naming-rule drift in phase 2). Added:

| Check | Seeded as | Expected after the cycle |
|---|---|---|
| `invoices_found`, `invoices_single` | 3 days: fill the Pages template, export a PDF, check it in Preview, mail it, add a row to `invoices-sent.csv` in TextEdit | one workflow |
| `invoices_steps` | every run | steps include the export, the mail, the log |
| `invoices_not_receipts`, `invoices_not_email` | the same apps as receipt filing (Finder, Preview, a TextEdit CSV) and email (Mail, an attachment) | separate workflows |
| `hours_found`, `hours_steps` | 2 days: read hours off Calendar, type them in the agency's form, submit | a workflow naming the calendar and the hours form |
| `photos_unpublished` | 1 day: five holiday photos renamed in Finder | not published |
| (noise) | PDFs opened in Preview, Downloads browsed in Finder, newsletters read in Mail; nothing renamed, saved, logged or sent | no workflow |

## Limits

The stories encode our assumptions about how someone files receipts; real captures are
messier (OCR fallback, half-loaded pages, apps with poor accessibility). Results show
how Workflows behaves on clean, controlled evidence, and how a change moves that, not
how often it finds real work. Every slide that cites a number says "synthetic".
