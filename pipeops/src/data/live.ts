import type { RawExperimentBundle } from './schema';

export interface RunSummary {
  id: string;
  variant: string | null;
  suite: string | null;
  seed: number | null;
  phases: number[];
  /** Opaque key: two runs may only be compared when their keys are equal. */
  conditions: string;
  startedAt: string | null;
  finishedAt: string | null;
  qualityPassed: number;
  qualityTotal: number;
  modelRequests: number;
  runtimeSeconds: number;
}

export interface VariantSummary {
  file: string;
  name: string;
  description: string | null;
}

export interface SnapshotStep {
  step: string;
  phase: number;
  task: string;
}

export interface SnapshotSummary {
  id: string;
  variant: string | null;
  suite: string | null;
  seed: number | null;
  steps: SnapshotStep[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRuns(): Promise<RunSummary[]> {
  return json(await fetch('/api/runs'));
}

/** Bundled, sanitized runs from pipeops/demo-data/ — work without eval/runs/. */
export async function fetchDemoRuns(): Promise<RunSummary[]> {
  return json(await fetch('/api/demo-runs'));
}

export async function fetchVariants(): Promise<VariantSummary[]> {
  return json(await fetch('/api/variants'));
}

export async function fetchLiveExperiment(baseline: string, variant?: string, source: 'local' | 'demo' = 'local'): Promise<RawExperimentBundle> {
  const params = new URLSearchParams({ baseline });
  if (variant) params.set('variant', variant);
  return json(await fetch(`${source === 'demo' ? '/api/demo-experiment' : '/api/experiment'}?${params}`));
}

export async function fetchStatus(): Promise<{ running: boolean; runId: string | null; error: string | null }> {
  return json(await fetch('/api/wfeval/status'));
}

export async function fetchSnapshots(): Promise<SnapshotSummary[]> {
  return json(await fetch('/api/snapshots'));
}

/** Starts a live wfeval run and streams its stdout/stderr text as it arrives. Resolves when the stream ends. */
export async function streamWfevalRun(
  params: { variant: string; suite: string; seed: number; phases?: number; repeat?: number },
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch('/api/wfeval/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

/** Replays one agent from a saved snapshot step. Same streaming contract as streamWfevalRun. */
export async function streamWfevalStage(
  params: { step: string; task?: string; variant: string; repeat?: number },
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch('/api/wfeval/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
