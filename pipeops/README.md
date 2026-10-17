# PipeOps — Agent Evaluation Lab

Interactive workbench for exploring `wfeval` runs of Screenpipe Workflows: load a
recorded run, watch what the agents did, inspect the evaluation, and compare variants.
React 18 + TypeScript + Tailwind + Framer Motion (Vite), with a small Express server
that reads the real run artifacts from `../eval/runs/`.

## Run it

Two processes, both from this directory:

```sh
npm install

# terminal 1 — the data bridge (reads eval/runs/, can trigger a real wfeval run)
npm run server      # http://localhost:8787

# terminal 2 — the UI
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the server, so both must be
running for real data to load.

If the server isn't running, Step 01 (Load Experiment) says so explicitly and lets you
continue with a placeholder mock experiment instead — it never falls back silently.

## Using it

1. **Landing page** → "Enter the Lab".
2. **Step 01 · Load experiment** — either pick an already-recorded run from
   `eval/runs/` (free, no model calls), or run a new one for real through the harness
   (costs AI allowance and takes several minutes; gated behind a confirmation).
3. **Steps 02–05** — Agent Execution, Inspect Evaluation, Compare Variants, Stage
   Replay. Use `←`/`→` or `1`–`5` to move between steps once something is loaded,
   `space` for the current step's primary action.

The UI renders on a fixed 1920×1080 surface that scales to fit the window, for stable
screen recordings.

## Demo runs vs local runs

Step 01 has two sources. **Demo runs** are sanitized, portable experiments bundled in
`demo-data/` (they work on a fresh clone, no `eval/runs/` needed). **Local runs** are the
runs in `eval/runs/`. To share your own run: `npm run export-run -- <runId>`, then
`npm run validate-demo` and `npm test` — full steps in `demo-data/CONTRIBUTING.md`.

## Notes

- The app only reads artifacts and, on explicit request, runs the harness. It never
  invents a value that isn't in the artifact — missing fields show a labeled
  placeholder instead.
- `server/convert.mjs` is the mapping from raw `eval/runs/<id>/` files to the shape the
  UI expects (`src/data/schema.ts`). Start there if a field looks wrong or missing.
