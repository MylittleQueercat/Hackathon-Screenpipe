import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import mockJson from '../data/mock-experiment.json';
import type { DataOrigin } from '../data/load';
import type { RawExperimentBundle } from '../data/schema';
import { fetchDemoRuns, fetchLiveExperiment, fetchRuns, fetchVariants, streamWfevalRun, type RunSummary, type VariantSummary } from '../data/live';
import { Eyebrow, GhostButton, PrimaryButton, Select } from '../components/ui';

const mock = mockJson as RawExperimentBundle;

/**
 * Step 01 — the only place an experiment gets chosen or produced. Deliberately shows
 * no quality score, request count or runtime: those belong to later steps. Two real
 * paths, both backed by the pipeops server (server/index.mjs):
 *   A. load a run already sitting in eval/runs/ — a file read, no cost.
 *   B. trigger a real wfeval run — a real model-calling cycle, gated by confirmation.
 * If the server itself isn't reachable, that's shown plainly; falling back to the mock
 * placeholder is an explicit choice here, never a silent default.
 */
export function LoadView({
  onLoad,
  standalone,
  currentRunId,
}: {
  onLoad: (bundle: RawExperimentBundle, runId: string, origin: DataOrigin) => void;
  standalone?: boolean;
  currentRunId?: string;
}) {
  const [source, setSource] = useState<'demo' | 'local'>('demo');
  const [localRuns, setLocalRuns] = useState<RunSummary[] | null>(null);
  const [demoRuns, setDemoRuns] = useState<RunSummary[] | null>(null);
  const runs = source === 'demo' ? demoRuns : localRuns;
  const [variants, setVariants] = useState<VariantSummary[] | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [form, setForm] = useState({ variant: '', suite: 'receipts', seed: 1, phases: 1 });
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    setBackendError(null);
    fetchRuns()
      .then(setLocalRuns)
      .catch((e: Error) => setBackendError(e.message));
    fetchDemoRuns()
      .then(setDemoRuns)
      .catch((e: Error) => setBackendError(e.message));
    fetchVariants()
      .then((v) => {
        setVariants(v);
        setForm((f) => (f.variant ? f : { ...f, variant: v[0]?.file ?? '' }));
      })
      .catch(() => {
        /* variants list is a convenience for the run form; runs list carries the real error */
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const loadRecorded = async (id: string) => {
    setLoadingId(id);
    try {
      // Pair with the most recent run of a different variant, so Compare Variants (Step
      // 04) has something real to compare against instead of the run against itself.
      // Only runs with identical test conditions (suite, seed, phases, data) qualify.
      const picked = runs?.find((r) => r.id === id);
      const partner = runs
        ?.filter((r) => r.id !== id && r.variant !== picked?.variant && r.conditions === picked?.conditions)
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0];
      // Whichever of the two is actually named "baseline" takes the baseline slot,
      // regardless of which one was clicked.
      const [baselineId, variantId] =
        partner?.variant === 'baseline' && picked?.variant !== 'baseline' ? [partner.id, id] : [id, partner?.id];
      const bundle = await fetchLiveExperiment(baselineId, variantId, source);
      onLoad(bundle, id, source === 'demo' ? 'demo' : 'recorded');
    } catch (e) {
      setBackendError((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  const loadMock = () => onLoad(mock, mock.comparison.baseline, 'mock');

  const startRun = async () => {
    setConfirming(false);
    setRunning(true);
    setLog('');
    let newId: string | null = null;
    try {
      await streamWfevalRun(form, (chunk) => {
        setLog((l) => l + chunk);
        const m = chunk.match(/run complete: (\S+)/);
        if (m) newId = m[1];
      });
      if (newId) {
        const bundle = await fetchLiveExperiment(newId);
        onLoad(bundle, newId, 'live');
      } else {
        refresh();
      }
    } catch (e) {
      setLog((l) => l + `\n[pipeops] ${(e as Error).message}\n`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-[120px] py-[72px]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Eyebrow>{standalone ? 'Welcome to the lab' : 'Step 01'} · Load experiment</Eyebrow>
        <h1 className="mt-5 text-[60px] font-semibold leading-[1.02] tracking-tightest text-ink-50">
          Select or run an experiment.
        </h1>
        <p className="mt-5 max-w-[860px] text-[17px] leading-relaxed text-ink-300">
          See how Screenpipe's agents turn recorded activity into reusable workflows.{' '}
          <span className="text-ink-100">Browsing is free. A model only runs when you start one.</span>
        </p>
      </motion.div>

      {backendError && (
        <div className="mt-8 rounded-2xl border border-cost/40 bg-cost/[0.06] p-5">
          <div className="text-[15px] font-medium text-cost">pipeops server not reachable</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
            {backendError} — start it with <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono">npm run server</code> inside{' '}
            <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono">pipeops/</code>, then retry. The app will not quietly show
            placeholder data instead — you choose.
          </p>
          <div className="mt-3 flex gap-2">
            <GhostButton onClick={refresh}>Retry</GhostButton>
            <GhostButton onClick={loadMock}>Continue with mock placeholder</GhostButton>
          </div>
        </div>
      )}

      <div className="mt-12 grid min-h-0 flex-1 grid-cols-2 gap-14">
        {/* A — explore recorded runs */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between">
            <Eyebrow>A · Explore recorded runs</Eyebrow>
            <GhostButton onClick={refresh}>refresh</GhostButton>
          </div>
          <div className="mt-4 flex gap-2">
            {(['demo', 'local'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`rounded-full border px-4 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.12em] transition-colors ${
                  source === s ? 'border-signal/70 text-signal' : 'border-ink-700 text-ink-400 hover:border-ink-500'
                }`}
              >
                {s === 'demo' ? 'Demo runs' : 'Local runs'}
              </button>
            ))}
          </div>
          <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-2">
            {runs === null && !backendError && <p className="font-mono text-[13px] text-ink-500">loading runs…</p>}
            {runs?.length === 0 && source === 'local' && <p className="text-[14px] text-ink-500">No completed runs in eval/runs/ yet. Run one on the right.</p>}
            {runs?.length === 0 && source === 'demo' && <p className="text-[14px] text-ink-500">No demo runs in pipeops/demo-data/ yet. See demo-data/CONTRIBUTING.md.</p>}
            {runs?.map((r) => (
              <RunCard key={r.id} r={r} active={r.id === currentRunId} loading={loadingId === r.id} onClick={() => loadRecorded(r.id)} />
            ))}
          </div>
        </section>

        {/* B — run a new experiment */}
        <section className="flex min-h-0 flex-col border-l border-ink-800 pl-14">
          <Eyebrow>B · Run new experiment</Eyebrow>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-400">
            Executes the real harness on this machine — a genuine model-calling cycle. Takes roughly 8–15 minutes per
            phase and spends the account's AI allowance. Quit the screenpipe desktop app first; both use port 3030.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Labeled label="variant">
              <Select
                value={form.variant}
                onChange={(v) => setForm((f) => ({ ...f, variant: v }))}
                options={(variants ?? []).map((v) => ({ value: v.file, label: v.name }))}
                disabled={running}
                placeholder="choose a variant"
              />
            </Labeled>
            <div className="flex gap-3">
              <Labeled label="suite">
                <input
                  className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[13px] text-ink-100"
                  value={form.suite}
                  onChange={(e) => setForm((f) => ({ ...f, suite: e.target.value }))}
                  disabled={running}
                />
              </Labeled>
              <Labeled label="seed">
                <input
                  type="number"
                  className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[13px] text-ink-100"
                  value={form.seed}
                  onChange={(e) => setForm((f) => ({ ...f, seed: Number(e.target.value) }))}
                  disabled={running}
                />
              </Labeled>
              <Labeled label="phases">
                <input
                  type="number"
                  className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[13px] text-ink-100"
                  value={form.phases}
                  onChange={(e) => setForm((f) => ({ ...f, phases: Number(e.target.value) }))}
                  disabled={running}
                />
              </Labeled>
            </div>

            {!confirming ? (
              <PrimaryButton className="self-start" onClick={() => setConfirming(true)} disabled={running || !form.variant}>
                {running ? 'Running…' : 'Run new experiment'}
              </PrimaryButton>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-cost/40 bg-cost/[0.06] p-3">
                <span className="text-[12px] leading-snug text-cost">
                  This spends real AI allowance and takes several minutes. Continue?
                </span>
                <PrimaryButton className="shrink-0" onClick={startRun}>
                  Confirm
                </PrimaryButton>
                <GhostButton className="shrink-0" onClick={() => setConfirming(false)}>
                  Cancel
                </GhostButton>
              </div>
            )}
          </div>

          {log && (
            <div ref={logRef} className="mt-5 h-44 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[11px] text-ink-300">
              <pre className="whitespace-pre-wrap">{log}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-500">{label}</span>
      {children}
    </label>
  );
}

/** Metadata only — no score, requests or runtime. Those are revealed inside the lab. */
function RunCard({ r, active, loading, onClick }: { r: RunSummary; active: boolean; loading: boolean; onClick: () => void }) {
  const when = r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group flex w-full items-center justify-between rounded-2xl border px-6 py-5 text-left transition-colors ${
        active ? 'border-signal/70 bg-ink-900' : 'border-ink-700 bg-ink-900/60 hover:border-ink-500'
      }`}
    >
      <div>
        <div className="flex items-center gap-3">
          <span className="text-[22px] font-semibold tracking-tight text-ink-50">{r.variant ?? r.id}</span>
          <span className="rounded-full border border-ink-600 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-300">
            complete
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[12px] text-ink-500">
          suite {r.suite ?? '—'} · seed {r.seed ?? '—'} · phase{r.phases.length > 1 ? 's' : ''} {r.phases.join(', ')}
        </div>
        <div className="mt-1 font-mono text-[11px] text-ink-600">finished {when}</div>
      </div>
      <span className={`text-[13px] font-medium ${loading ? 'text-signal' : 'text-ink-300 group-hover:text-signal'}`}>
        {loading ? 'Loading…' : 'Load →'}
      </span>
    </button>
  );
}
