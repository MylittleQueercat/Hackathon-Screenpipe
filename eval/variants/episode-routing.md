# Episode routing experiment

`episode-routing.json` changes only the `workflow-discover` pipe prompt. It asks
Discover to identify distinct work episodes by trigger and intended outcome
before grouping them into jobs, and to make a focused cross-day search when a
possible second occurrence would change a one-off decision. The engine, model,
other pipe prompts, and seeded data are the baseline configuration.

## First paired run

Both runs used `receipts`, seed 1, phase 1, and Claude Sonnet 5.

| Measure | Baseline | Episode routing |
| --- | ---: | ---: |
| Checks passed | 11/11 | 11/11 |
| Published workflows | 2 | 2 |
| Agent runs | 11 | 16 |
| Model requests | 89 | 111 |
| Tool calls | 91 | 115 |
| Time | 649.7 s | 1175.2 s |

Run IDs: `20261017T161442Z-baseline-receipts-s1-r1` and
`20261017T163733Z-episode-routing-receipts-s1-r1`. The data hashes, engine
binary, Pi lockfile, and sandbox image match. The only prompt hash difference
is `workflow-discover.instructions`. Both runs have clean contamination checks
and no host path leaks.

This pair catches no regression, but does not demonstrate an improvement: the
baseline already passed every check. It also does not establish a cost change;
agent trajectories vary between runs, and Review accounted for most of the
extra requests in this one. Repeat paired runs before drawing either conclusion.

The first variant attempt also exposed a macOS 26 `cp -cRp` failure on Bun cache
symlinks during template cloning, before any model request. The accompanying
`clone_template` fix uses `cp -cR`; the regression test covers cache symlinks
and private login-file permissions.
