# PipeOps — Agent Evaluation Lab (frontend prototype)

Interactive workbench for evaluating Screenpipe Workflows agent runs.
React 18 + TypeScript + Tailwind 3 + Framer Motion, built with Vite.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
```

The UI renders on a fixed 1920×1080 surface that scales to fit any window, so screen recordings look the same on every display.

## Demo flow (keyboard)

| Key | Action |
|---|---|
| `→` / `←` | next / previous step |
| `1`–`5` | jump to a step |
| `space` | primary action of the current step (load · replay recording · scan checks · run reveal · simulate replay) |

1. **Load experiment**: two recorded runs. Bar length shows runtime; one tick is one model request.
2. **Agent execution**: Recorded activity → Discover → Maintain → Deepen → Review → Generated workflows → Evaluation. Click any node to inspect it. A stage's inspector links to Stage Replay.
3. **Inspect evaluation**: an 11-segment check ring, evidence lenses, an expected ↔ actual matching panel and a per-check dossier.
4. **Compare variants**: Baseline / Episode Routing / Overlay Δ, then the reveal: *No improvement demonstrated.*
5. **Stage replay**: pick a stage and the view branches from the snapshot saved before it. The replay is simulated and makes no model calls.

## Visual language

- **Solid**: recorded data
- **Dashed**: not in artifact (a placeholder that shows the JSON path it will be read from)
- **Hatched**: simulated (replay visualization)

## Data layer

All evaluation data lives in `src/data/mock-experiment.json`. The contract is in `src/data/schema.ts`.

- **Real values**: the run totals only. Baseline: 11/11, 89 requests, 650 s. Episode Routing: 11/11, 111 requests, 1175 s.
- **`null`**: not available yet. The UI never invents a value for a null field; it renders a labeled placeholder.
- **Per-check verdicts**: when `checks` is null, `load.ts` creates one slot per check from the run total. These slots are tagged **Derived**. A verdict is only assigned to a slot when the total makes it certain (11/11 → all passed).
- **Stage descriptions**: these are UI copy marked `summaryStatus: "draft"`. Replace them with the engine's own descriptions.

### Connecting real run JSON

Option A: replace `src/data/mock-experiment.json` with a file that follows `RawExperimentBundle`.

Option B: serve the JSON and point the app at it:

```sh
# e.g. put the file in public/runs/experiment.json
VITE_PIPEOPS_DATA_URL=/runs/experiment.json npm run dev
```

Fields that light up automatically when present:

| Field | Where it appears |
|---|---|
| `runs[].stages.<id>.modelRequests` / `runtimeSeconds` | stage cards, inspector, per-stage breakdown, "requests reused" in Stage Replay |
| `runs[].stages.<id>.snapshotId` / `output` | stage inspector, replay plan step 1 |
| `runs[].recordedActivity` | input node |
| `runs[].generatedWorkflows`, `runs[].groundTruth` (`matchedTo`) | output node, expected ↔ actual matching links |
| `runs[].checks[]` (`name`, `lens`, `passed`, `reason`, `expected`, `actual`, `evidence`) | check ring, lens filters, dossier |

The app only reads data. It does not run evaluations or call any model.
