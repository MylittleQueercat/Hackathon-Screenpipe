# Workflows eval harness

Measures what a change to screenpipe's Workflows does, on the same synthetic history,
against the shipped version: which workflows get published, which checks pass, and what
each cycle costs in agent runs and tokens. Reuses the architecture of an earlier
harness, eval-sketch (sandboxed tools, provenance, reruns, paired comparison).

- `DATA.md`: what is seeded and the rules that make a result mean something.
- `MISTAKES.md`: the tags a grade can carry.

## How a run works

1. `generate.py` renders a suite's hidden stories (`stories.py`) into frames,
   deterministically from (suite, seed), and refuses to write a suite whose checks have
   no on-screen evidence or whose screens leak the answer.
2. `run.py` clones a warm template data dir to `/Users/Shared/wfeval/live`, starts the
   **patched engine** there (fresh HOME, port 3036 on 127.0.0.1, environment built from
   scratch, all capture off; see "Same inputs on every Mac"), installs and
   enables the four workflow pipes, seeds phase 1 through `POST /eval/seed`, and runs a
   cycle the way the desktop's "Update now" does. Phase 2 (a naming rule changes) and
   phase 3 (nothing new) follow on the same engine. The run then moves to `runs/`.
3. Agent tools run in a container (`sandbox/`, `agent/sandbox-tools.ts`): Pi's own
   bash/read/write/edit definitions, executed via `docker exec`, `--network none`. Inside,
   `localhost:3030` and `localhost:3036` are the eval engine, relayed over the exec pipe
   (`sandbox/portal.py`);
   the real screenpipe on the host's 3030 is unreachable. This matters: the curl auth shim
   and the agents assume port 3030, so on the host they would either miss auth or hit your
   real history.
4. `grade.py` attributes each published workflow to a job through its cited evidence,
   then scores the suite's checks. `compare.py` pairs two variants phase by phase.

Each run keeps `run.json` (variant, data hashes, engine commit, patch and binary hashes, Pi
version and lockfile, bun version, image id, contamination check, host-path leak scan,
prompt hashes), the catalog, workspace, executions and pipe logs of every phase,
`requests.jsonl` (every model request, its usage, every tool call), `prompts/`,
`seeded.jsonl` and `results.jsonl`.

## Needs

- An Apple Silicon Mac with the screenpipe desktop app installed (the harness uses the
  `bun` it ships). **Quit the app while the harness runs**: both use port 3030 and the
  app records your screen.
- A screenpipe account with Workflows (Business) whose tier offers `claude-sonnet-5`.
  The harness logs in its own copy of the data dir; your real one is never touched.
- Rust (`rustup`), `uv`, Docker (OrbStack or Docker Desktop).
- Nix only to rebuild the sandbox image (`sandbox/load.sh --build`, needs an
  `aarch64-linux` builder); otherwise the published image is pulled.

## Setup (once)

```sh
cd eval
./setup-engine.sh          # clones screenpipe at a8aaee2d, applies patches/harness.patch, builds
sandbox/load.sh            # pulls the sandbox image (pinned by digest) into Docker
uv run wfeval template     # warm data dir with Pi and the four workflow pipes
SCREENPIPE_DATA_DIR=$PWD/.engines/template/home/.screenpipe .engines/target/debug/screenpipe login
```

`login` opens a browser; the session lands in the template, and every run copies it.
On a Nix-managed Mac, `cargo` must use Apple's toolchain: run `setup-engine.sh` inside
`nix shell nixpkgs#rustup nixpkgs#pkg-config` with `PATH=/usr/bin:$PATH CC=/usr/bin/cc
CXX=/usr/bin/c++ AR=/usr/bin/ar CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc`.

## Use

One phase (8 to 15 minutes; with Sonnet 5, 45 to 120 model requests and over a million
input tokens, nearly all cached, out of the account's AI allowance):

```sh
uv run wfeval run --variant variants/baseline.json --suite receipts --seed 1 --phases 1
uv run wfeval grade runs/<the run's directory>
```

`run` prints each phase's status; `grade` prints one JSON line per phase: the checks,
the score, the mistake tags (`MISTAKES.md`) and usage. A full run is three phases
(drop `--phases`), about an hour, most of it waiting for the next cycle to be allowed.

Comparing:

```sh
uv run wfeval run --variant variants/baseline.json --suite receipts --seed 1 --repeat 2
uv run wfeval compare --a runs/*-baseline-*-r1 --b runs/*-baseline-*-r2      # A/A: the noise
uv run wfeval compare --a runs/*-baseline-* --b runs/*-myvariant-*
uv run --group dev pytest -q   # offline: generator, grader, negative controls, sandbox
```

A variant is a JSON file: `binary` (an engine built from another branch), `model`
(`intelligent`, `private`, `preset:<id>`), `pipes` (replacement `pipe.md` per workflow
agent), `env`. Anything that changes what the agents see or run is a variant.

Every live cycle spends the account's AI allowance. Failures of the provider or account
(allowance, rate limit, sign-in, 5xx) mark a phase `rerun`; it is never scored. A model
the account's tier does not offer is silently swapped by the engine (to `auto`); the
harness catches that in the engine log and marks the phase `invalid`, also never scored.

## Same inputs on every Mac

What the agents are given depends on the eval version and nothing else:

- **History**: generated from (suite, seed) alone, hashed in `run.json` (`data`). Seeded
  frames sit at fixed offsets from the run day in UTC, so two runs differ by one date
  shift (the engine reads the real clock; faking it is out of scope).
- **Prompts**: a run happens at `/Users/Shared/wfeval/live` on port 3036 with user
  `eval`, TZ UTC, and a container with a fixed hostname, then moves to `runs/`. So paths,
  port and timezone in the prompts are the same everywhere. One run at a time per Mac.
- **No host files**: Pi adds every `AGENTS.md`/`CLAUDE.md` from the agent's directory up
  to `/` to its system prompt; the run refuses to start if one is there.
- **Checked per run**: `prompts/` keeps each agent's system prompt and task prompt with
  the clock and engine ids masked; `run.json` hashes them and lists any host path found in
  prompts or tool output (`host_path_leaks`). `compare` warns when an A/A pair's prompts
  differ or a run leaked. `run.json` also records the engine, Pi (and its lockfile), bun
  (from the installed screenpipe app) and the image, which must match to compare.

## First results (2026-10-17, receipts seed 1, phase 1, Sonnet 5)

| repeat | score | missed | agent runs | requests | time |
|---|---|---|---|---|---|
| 1 | 11/11 | - | 13 | (undercounted) | 904 s |
| 2 | 10/11 | the email job: discover saw two of its three instances and called them one-offs | 8 | 45 | 468 s |
| 3 | 11/11 | - | 11 | 82 | 544 s |

Runs 1 and 2 predate the isolation above: an `AGENTS.md` from the directory above the
harness was in their agents' system prompts. Run 3 is the first with nothing from the machine.

The same history gave different catalogs: decide nothing from one run per side. The
grader catches damage to a real catalog (`tests/test_controls.py`): a dropped job, a lost
exception, invented evidence and merged jobs each cost exactly their check.

## Limits

Synthetic, clean history: no OCR fallback, no screenshots (`/frames/*` returns a blank
image), no audio or meetings. Results show how a change moves Workflows on controlled
evidence, not how often it finds real work. Tokens are measured; dollars need the model's
prices in `prices.json`, which has none for Sonnet 5 yet (`cost_usd` stays null). The
receipts suite is near the ceiling for Sonnet 5 in phase 1; phases 2 and 3 (a rule
change, an idle cycle) have not run live yet.
