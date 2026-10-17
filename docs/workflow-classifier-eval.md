# Workflow classifier replay evaluation

Run the deterministic synthetic replay and HTTP behavior checks with:

```sh
cargo test -p screenpipe-engine workflow_classifier::tests -- --nocapture
```

The replay contains four observations: two meaningful changes in Project A,
an OCR whitespace repeat, and a switch to Project B. Labels mark two distinct
debugging tasks. The baseline key is `(app, window)` and its event cooldown is
event-type-only. The improved activity key includes normalized visible content;
event deduplication keys include the latest stable app/window context.

Expected deterministic counters from the fixture (not a live model or latency
measurement):

| Metric | Baseline | Improved |
| --- | ---: | ---: |
| Classifier calls | 2 | 3 |
| Correct task events emitted | 1 | 2 |
| Recall against the two task labels | 50% | 100% |
| False negatives | 1 | 0 |
| Duplicate event emissions | 0 | 0 |

This fixture demonstrates a reliability tradeoff, not a reduction in calls:
the content-aware implementation makes one additional call to detect changed
work in the same window. Whitespace-only changes do not add a call. Token usage
and model latency are not measured by the synthetic replay. The unit test
prints counters and validates these deterministic results. HTTP tests use
mocked 503 and malformed-confidence responses; they do not measure network
latency or prove the polling loop's elapsed-time behavior.

Production structured logs report cumulative polls, empty and unchanged
windows, request attempts/successes/failures, retries, emitted/duplicate/
confidence-filtered events, plus per-request latency. Logs do not include OCR,
transcripts, classifier descriptions, response bodies, or credentials.

The 5-minute overlap and bounded 1,000-record query reduce repeated work while
retaining late-arriving rows. This is not a durable cursor: a sustained period
with more than 1,000 search results can still truncate the oldest part of the
window. A future search API should expose an ID-stable cursor/watermark and
late-arrival semantics before the classifier adopts persistent incremental
state.

For integration with a workflow evaluation framework, freeze each reviewed
replay as a case with expected event labels, evidence record IDs, and privacy
review status. Run pure input-key/dedup checks first, then use the same recorded
model outputs for before/after comparisons. Add an LLM judge only after the
hand-labeled cases and deterministic checks agree; confidence values remain
uncalibrated scores and should not be treated as probabilities.
