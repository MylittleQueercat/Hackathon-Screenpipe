import type { RawExperimentBundle } from './schema';

export interface RunSummary {
  id: string;
  variant: string | null;
  suite: string | null;
  seed: number | null;
  phases: number[];
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

export async function fetchVariants(): Promise<VariantSummary[]> {
  return json(await fetch('/api/variants'));
}

export async function fetchLiveExperiment(baseline: string, variant?: string): Promise<RawExperimentBundle> {
  const params = new URLSearchParams({ baseline });
  if (variant) params.set('variant', variant);
  return json(await fetch(`/api/experiment?${params}`));
}

export async function fetchStatus(): Promise<{ running: boolean; runId: string | null; error: string | null }> {
  return json(await fetch('/api/wfeval/status'));
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
