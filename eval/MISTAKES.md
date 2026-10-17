# Mistake tags

Tags `grade.py` puts on a graded phase. Scored tags make a check fail; tracked tags are
reported and compared, never scored. Add a tag here before the grader emits it.

| Tag | Check | Meaning |
|---|---|---|
| `job_missed` | `found`, `email_separate`, `*_found`, `invoices_not_*` | No published workflow cites the job's frames as its majority evidence. |
| `duplicate_workflow` | `no_duplicate`, `invoices_single` | Two or more workflows are attributed to one job (e.g. day 2 runs logged before renaming became their own workflow). |
| `steps_incomplete` | `steps`, `*_steps` | The job's workflow text never mentions one of the required steps (rename, tracker row; export, mail, log; calendar, hours form). |
| `exception_missed:<check>` | `missing_date`, `duplicate`, `high_value`, `type_lookup` | The exception is seeded and on screen, but nothing the agents wrote handles it. |
| `noise_as_step` | `noise_excluded` | The chat in the middle of a run became an app or stage of the workflow. |
| `drift_ignored` | `drift` (phase 2) | After the naming rule changed, no workflow names the new rule. |
| `drift_forked` | `drift` (phase 2) | The new rule went into a new workflow instead of updating the existing one. |
| `jobs_merged` | `email_separate`, `invoices_not_*` | One workflow draws at least a quarter of its evidence from each of two jobs. |
| `one_off_published` | `one_off_unpublished`, `photos_unpublished` | A workflow was published for something done once. |
| `invented_evidence` | `evidence_resolves` | Cited `(timestamp, app)` pairs that match no seeded frame (count). |
| `unexpected_workflow` | tracked | A workflow whose evidence is mostly noise, or resolves to nothing. Read it: noise that looks like a job is a data bug (DATA.md, rule 7). |
| `idle_churn` | tracked (phase 3) | Workflows created or revised by a cycle with no new history. |

Stage runs (`wfeval stage`) carry the same tags on what their agent produced: the drafts
for Discover, Deepen and Maintain (a draft is graded as the workflow it proposes), the
catalog for Review.

Attribution is by evidence, not by title: a workflow is the job most of its resolved
evidence belongs to (noise excluded). Keyword checks read authored fields only; the
raw catalog is kept in every run (`phase<N>/catalog.json`) so a keyword miss can be
read and, if it is a paraphrase, the synonym added to the suite's truth.
