import type { CheckSlot, Experiment, RawExperimentBundle, RawRun, Run } from './schema';

/**
 * Data layer entry point.
 *
 * Step 01 (LoadView) is the only place an experiment gets chosen or produced — either a
 * recorded run read from the pipeops server (eval/runs/, zero cost, no model calls), a
 * run just finished through a live wfeval invocation, or — only on explicit user choice,
 * never silently — the bundled placeholder mock. `normalize` turns whichever
 * RawExperimentBundle that produces into the shape the rest of the app renders.
 */

/** Where the currently-loaded bundle came from — shown in the Header so a recorded run
 *  and a just-finished live run are never visually confused with each other. */
export type DataOrigin = 'recorded' | 'live' | 'mock';

function normalizeRun(run: RawRun): Run {
  // Per-check records either exist in the artifact or they don't. When they don't,
  // the UI shows the real aggregate total and says so plainly — it never invents
  // individual check slots to fill a ring that the artifact didn't provide.
  const checksLoaded = Boolean(run.checks && run.checks.length > 0);
  const checks: CheckSlot[] = checksLoaded
    ? run.checks!.map((c, index) => ({ ...c, index, derived: false }))
    : [];
  return { ...run, checks, checksLoaded };
}

export function normalize(raw: RawExperimentBundle): Experiment {
  return { ...raw, runs: raw.runs.map(normalizeRun) };
}
