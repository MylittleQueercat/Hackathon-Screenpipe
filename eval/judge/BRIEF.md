# Judging brief: two workflow documents for the same job

A screen-recording assistant watched a person (Morgan) use a Mac and wrote down the
repetitive work it saw as "workflow" documents. Two different versions of the assistant
watched the **same** recorded history and each wrote a document for the same job. You
judge which document is better, and score both.

Everything you need is in `/tmp/wfjudge/`. Read only files there. Do not open other
directories, do not use the network, do not run anything that changes files except
writing your one result file.

## Files

- `jNN/X.json`, `jNN/Y.json`: the two documents for your case (`jNN` is given in your
  task). The order of X and Y means nothing.
- `jNN/../truth.json`, i.e. `/tmp/wfjudge/truth.json`: what the history generator planted.
  `jobs` are the real jobs; `checks` list the specifics a good document should capture
  (`on_screen`: text that appears in the history for that specific).
- History, one capture per line (JSON): `time`, `app`, `window`, `url`, `trigger`, `text`
  (the screen text the assistant could read), and the generator's labels `planted_job`,
  `planted_run`, `planted_step`. The assistant never saw these labels; they are for you.
  - Phase 1 cases: `history-phase1.jsonl` (four days of activity).
  - Phase 2 and 3 cases: `history-phase1-2.jsonl` (the same four days plus one more day
    on which a file `naming-rule-update.txt` changes the filename rule for receipts).
    In phase 3 a further period passed with nothing recorded; the document is the one
    the assistant held after that period.
- Documents cite captures by `timestamp` and `app`; those match `time` and `app` in the
  history (times may be given to the second or the millisecond).

Phase of your case and the job are in `case.json` next to X and Y.

## Metrics: score each document 1 to 5 on each

1. `faithful`: every step, app, file name, path, rule and claim is supported by the
   history. Invented or wrong details cost points; cite them.
2. `procedure`: the steps are correct, in the right order and complete, compared with
   what Morgan actually did in the history.
3. `exceptions`: the special cases the history shows for this job (for receipts:
   duplicate, missing date, unknown type looked up in a client list, high amount flagged
   for review; for email: whatever variations the history shows) are each described as
   what Morgan does about them, not just named.
4. `rule_change`: phases 2 and 3 only (null in phase 1). For receipts: the new filename
   rule is stated correctly, the old one is marked as replaced, and no contradiction is
   left between old and new rule anywhere in the document. For email, which has no rule
   change: whether the document stays consistent with the full history (score it, or
   null if nothing applies, and say so).
5. `usable`: someone, or another agent, could do the task from the document alone:
   concrete folders, filename format, `tracker.csv` columns, what to check.
6. `calibration`: open questions and limitations are real uncertainties given the
   history, not padding or questions the history already answers; stated confidence
   matches the evidence.
7. `numbers`: frequency, repetitions, durations and minutes are consistent with the
   history (count days and occurrences yourself where you can).
8. `clarity`: readable, no needless repetition, no internal contradiction.

5 = nothing to fault, 4 = minor issues, 3 = a real gap or error, 2 = several, 1 = wrong
or useless on this metric. Every score below 5 needs at least one deduction that quotes
the document (a short exact excerpt) and says why, with history `time`s where relevant.

Then give one overall `preference`: `X`, `Y` or `tie`, its `strength` (`slight`,
`clear`, `strong`) and a short `reason` naming the differences that decided it. Weigh
correctness (faithful, procedure, exceptions, rule_change) above the rest. Do not prefer
a document for being longer.

## Output

Write exactly one file, `/tmp/wfjudge/results/jNN.json` (your case id), valid JSON:

```json
{
 "case": "jNN",
 "scores": {
  "X": {"faithful": {"score": 4, "deductions": [{"quote": "...", "why": "...", "times": ["..."]}]},
        "procedure": {...}, "exceptions": {...}, "rule_change": {...} or null,
        "usable": {...}, "calibration": {...}, "numbers": {...}, "clarity": {...}},
  "Y": {...}
 },
 "preference": "X",
 "strength": "clear",
 "reason": "..."
}
```

Then reply with one line: the case id, the preference and strength.
