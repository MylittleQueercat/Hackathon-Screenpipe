import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Experiment, Run, StageId } from '../data/schema';
import { ArrowRight, Badge, CountUp, Eyebrow, GhostButton, Missing, MissingBlock, PlayIcon, PrimaryButton } from '../components/ui';
import { fmtSeconds, pad2 } from '../lib/format';
import { usePlayKey } from '../lib/events';

/* ---------- geometry (canvas coordinates, 1380 × 800) ---------- */
const CW = 1380;
const CH = 770;
const STAGE_W = 280;
const STAGE_H = 170;
const STAGE_TOP = 214;
const stageCx = (i: number) => 20 + 167.5 + 335 * i;
const ACT = { cx: 690, top: 10, w: 560, h: 88 };
const WF = { cx: 690, top: 480, w: 480, h: 88 };
const EV = { cx: 690, top: 636, w: 660, h: 124 };
const midY = STAGE_TOP + STAGE_H / 2;

const EDGES = [
  `M ${ACT.cx} ${ACT.top + ACT.h} C ${ACT.cx} 170, ${stageCx(0)} 150, ${stageCx(0)} ${STAGE_TOP}`,
  ...[0, 1, 2].map((i) => `M ${stageCx(i) + STAGE_W / 2} ${midY} L ${stageCx(i + 1) - STAGE_W / 2} ${midY}`),
  `M ${stageCx(3)} ${STAGE_TOP + STAGE_H} C ${stageCx(3)} 460, ${WF.cx} 430, ${WF.cx} ${WF.top}`,
  `M ${WF.cx} ${WF.top + WF.h} L ${EV.cx} ${EV.top}`,
];

/** phases: 0 idle · 1 activity · 2-5 stages · 6 workflows · 7 evaluation */
const LAST_PHASE = 7;
const PHASE_MS = 720;

type Sel = { kind: 'run' } | { kind: 'activity' } | { kind: 'stage'; id: StageId } | { kind: 'workflows' } | { kind: 'eval' };

export function CanvasView({
  experiment,
  run,
  onOpenEvidence,
  onReplayStage,
}: {
  experiment: Experiment;
  run: Run;
  onOpenEvidence: () => void;
  onReplayStage: (s: StageId) => void;
}) {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>({ kind: 'run' });
  const timer = useRef<number | null>(null);

  const play = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    setPhase(0);
    setPlaying(true);
    let p = 0;
    timer.current = window.setInterval(() => {
      p += 1;
      setPhase(p);
      if (p >= LAST_PHASE) {
        window.clearInterval(timer.current!);
        timer.current = null;
        setPlaying(false);
      }
    }, PHASE_MS);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(play, 350);
    return () => {
      window.clearTimeout(t);
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [play, run.id]);

  usePlayKey(play);

  const stages = experiment.stages;
  const done = phase >= LAST_PHASE;

  return (
    <div className="flex h-full">
      {/* ---------------- canvas ---------------- */}
      <div className="relative flex flex-1 flex-col px-10 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Experiment canvas · run/{run.id}</Eyebrow>
            <div className="mt-1.5 text-[22px] font-medium tracking-tight text-ink-100">
              How recorded activity becomes evaluated workflows
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge kind="recorded" label="Recorded run" />
          </div>
        </div>

        <div className="relative mx-auto mt-4" style={{ width: CW, height: CH }}>
          {/* edges */}
          <svg width={CW} height={CH} className="pointer-events-none absolute inset-0 overflow-visible">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 1 L9 5 L0 9" fill="none" stroke="#6B707C" strokeWidth="1.4" />
              </marker>
              <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 1 L9 5 L0 9" fill="none" stroke="#C8FF4D" strokeWidth="1.4" />
              </marker>
              <filter id="edge-glow" filterUnits="userSpaceOnUse" x="-50" y="-50" width={CW + 100} height={CH + 100}>
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {EDGES.map((d, i) => {
              const lit = phase >= i + 2;
              return (
                <g key={i}>
                  <path d={d} stroke="#33363E" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
                  <motion.path
                    d={d}
                    stroke="#C8FF4D"
                    strokeWidth="2"
                    fill="none"
                    filter="url(#edge-glow)"
                    markerEnd={lit ? 'url(#arrow-on)' : undefined}
                    initial={false}
                    animate={{ pathLength: lit ? 1 : 0, opacity: lit ? 0.9 : 0 }}
                    transition={{ duration: PHASE_MS / 1000 - 0.1, ease: 'easeInOut' }}
                  />
                </g>
              );
            })}
          </svg>

          {/* travelling signal along the edge being traversed */}
          <AnimatePresence>
            {phase >= 2 && phase <= LAST_PHASE && playing && (
              <motion.div
                key={`p-${phase}`}
                className="pointer-events-none absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_18px_6px_rgba(200,255,77,0.55)]"
                style={{ offsetPath: `path('${EDGES[phase - 2]}')`, offsetRotate: '0deg' } as React.CSSProperties}
                initial={{ offsetDistance: '0%', opacity: 1 } as never}
                animate={{ offsetDistance: '100%', opacity: 1 } as never}
                exit={{ opacity: 0 }}
                transition={{ duration: PHASE_MS / 1000 - 0.1, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>

          {/* pipeline enclosure */}
          <div
            className="absolute rounded-[28px] border border-ink-700/80 bg-ink-900/30"
            style={{ left: 20, top: 168, width: 1340, height: 252 }}
          >
            <div className="absolute -top-3 left-8 bg-ink-950 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
              Agent pipeline · {stages.length} stages
            </div>
          </div>

          {/* recorded activity */}
          <Node
            style={{ left: ACT.cx - ACT.w / 2, top: ACT.top, width: ACT.w, height: ACT.h }}
            state={phase === 1 ? 'active' : phase > 1 ? 'done' : 'idle'}
            selected={sel.kind === 'activity'}
            onClick={() => setSel({ kind: 'activity' })}
          >
            <div className="flex h-full items-center justify-between px-6">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">input</div>
                <div className="mt-1 text-[20px] font-medium text-ink-50">Recorded activity</div>
              </div>
              {run.recordedActivity ? (
                <span className="text-[13px] text-ink-300">{run.recordedActivity.description}</span>
              ) : (
                <Missing size="sm" path="recordedActivity" />
              )}
            </div>
          </Node>

          {/* stages */}
          {stages.map((s, i) => {
            const p = i + 2;
            const rec = run.stages[s.id];
            return (
              <Node
                key={s.id}
                style={{ left: stageCx(i) - STAGE_W / 2, top: STAGE_TOP, width: STAGE_W, height: STAGE_H }}
                state={phase === p ? 'active' : phase > p ? 'done' : 'idle'}
                selected={sel.kind === 'stage' && sel.id === s.id}
                onClick={() => setSel({ kind: 'stage', id: s.id })}
              >
                <div className="flex h-full flex-col p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] text-ink-400">{pad2(i + 1)}</span>
                    <StageStatus phase={phase} p={p} />
                  </div>
                  <div className="mt-2 text-[30px] font-semibold tracking-tight text-ink-50">{s.name}</div>
                  <div className="mt-1 text-[13px] leading-snug text-ink-400">{s.summary}</div>
                  <div className="mt-auto flex items-center gap-4 font-mono text-[11px] text-ink-500">
                    <span>req {rec?.modelRequests ?? <DashVal />}</span>
                    <span>time {rec?.runtimeSeconds != null ? `${rec.runtimeSeconds}s` : <DashVal />}</span>
                  </div>
                </div>
              </Node>
            );
          })}

          {/* generated workflows */}
          <Node
            style={{ left: WF.cx - WF.w / 2, top: WF.top, width: WF.w, height: WF.h }}
            state={phase === 6 ? 'active' : phase > 6 ? 'done' : 'idle'}
            selected={sel.kind === 'workflows'}
            onClick={() => setSel({ kind: 'workflows' })}
          >
            <div className="flex h-full items-center justify-between px-6">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">output</div>
                <div className="mt-1 text-[20px] font-medium text-ink-50">Generated workflows</div>
              </div>
              {run.generatedWorkflows ? (
                <span className="tnum text-[32px] font-semibold text-ink-50">{run.generatedWorkflows.length}</span>
              ) : (
                <Missing size="sm" path="generatedWorkflows" />
              )}
            </div>
          </Node>

          {/* evaluation — score stays sealed until Step 03; requests/runtime are execution facts, not the score */}
          <Node
            style={{ left: EV.cx - EV.w / 2, top: EV.top, width: EV.w, height: EV.h }}
            state={phase === 7 ? 'active' : 'idle'}
            selected={sel.kind === 'eval'}
            onClick={() => setSel({ kind: 'eval' })}
          >
            <div className="flex h-full items-center gap-6 px-6">
              <div className="relative flex h-[96px] w-[96px] items-center justify-center rounded-full border border-dashed border-ink-600">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-500">sealed</span>
              </div>
              <div className="flex-1">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">evaluation vs ground truth</div>
                <div className="mt-1 text-[20px] text-ink-300">
                  {done ? 'Ready — see Inspect Evaluation' : 'awaiting run…'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 font-mono text-[13px]">
                <span className="text-ink-400">
                  requests{' '}
                  <span className="text-ink-100">{done ? <CountUp value={run.metrics.modelRequests} /> : '··'}</span>
                </span>
                <span className="text-ink-400">
                  runtime{' '}
                  <span className="text-ink-100">
                    {done ? <CountUp value={run.metrics.runtimeSeconds} format={(n) => `${Math.round(n)}s`} /> : '··'}
                  </span>
                </span>
              </div>
            </div>
          </Node>
        </div>

        {/* playback controls */}
        <div className="absolute bottom-5 left-10 flex items-center gap-5">
          <PrimaryButton onClick={play}>
            <PlayIcon /> {playing ? 'Replaying…' : 'Replay recording'}
          </PrimaryButton>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: LAST_PHASE }, (_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (timer.current) window.clearInterval(timer.current);
                  setPlaying(false);
                  setPhase(i + 1);
                }}
                className={`h-1.5 rounded-full transition-all ${phase >= i + 1 ? 'w-8 bg-signal' : 'w-5 bg-ink-700 hover:bg-ink-500'}`}
                aria-label={`Jump to phase ${i + 1}`}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] text-ink-500">
            playback shows stage order only · per-stage timing not in artifact
          </span>
        </div>
      </div>

      {/* ---------------- inspector ---------------- */}
      <aside className="w-[460px] shrink-0 border-l border-ink-800 bg-ink-950/70 backdrop-blur">
        <AnimatePresence mode="wait">
          <motion.div
            key={JSON.stringify(sel) + run.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25 }}
            className="h-full overflow-hidden px-9 py-8"
          >
            <Inspector
              sel={sel}
              run={run}
              experiment={experiment}
              onBack={() => setSel({ kind: 'run' })}
              onOpenEvidence={onOpenEvidence}
              onReplayStage={onReplayStage}
            />
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  );
}

function DashVal() {
  return <span className="text-ink-600">—</span>;
}

function StageStatus({ phase, p }: { phase: number; p: number }) {
  if (phase === p)
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-signal">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-signal" /> playing
      </span>
    );
  if (phase > p) return <span className="font-mono text-[11px] uppercase tracking-widest text-ink-300">✓ recorded</span>;
  return <span className="font-mono text-[11px] uppercase tracking-widest text-ink-600">queued</span>;
}

function Node({
  children,
  style,
  state,
  selected,
  onClick,
}: {
  children: ReactNode;
  style: React.CSSProperties;
  state: 'idle' | 'active' | 'done';
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`absolute rounded-2xl border text-left transition-colors ${
        state === 'active'
          ? 'glow-signal border-signal bg-ink-850'
          : state === 'done'
            ? 'border-ink-500 bg-ink-900'
            : 'border-ink-700 bg-ink-900/70'
      } ${selected ? 'ring-1 ring-ink-100 ring-offset-4 ring-offset-ink-950' : ''} hover:border-ink-300`}
      style={style}
      animate={{ scale: state === 'active' ? 1.03 : 1, opacity: state === 'idle' ? 0.6 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      {children}
    </motion.button>
  );
}

/* ---------------- inspector content ---------------- */

function Inspector({
  sel,
  run,
  experiment,
  onBack,
  onOpenEvidence,
  onReplayStage,
}: {
  sel: Sel;
  run: Run;
  experiment: Experiment;
  onBack: () => void;
  onOpenEvidence: () => void;
  onReplayStage: (s: StageId) => void;
}) {
  const back = (
    <button onClick={onBack} className="mb-6 font-mono text-[11px] uppercase tracking-widest text-ink-500 hover:text-ink-200">
      ← run overview
    </button>
  );

  if (sel.kind === 'run') {
    return (
      <div className="flex h-full flex-col">
        <Eyebrow>Inspector · run</Eyebrow>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[40px] font-semibold tracking-tight text-ink-50">{run.label}</span>
          <Badge kind="recorded" />
        </div>
        <div className="mt-8 divide-y divide-ink-800 border-y border-ink-800">
          <BigStat label="model requests" value={<CountUp value={run.metrics.modelRequests} />} />
          <BigStat
            label="runtime"
            value={<CountUp value={run.metrics.runtimeSeconds} format={(n) => `${Math.round(n)}s`} />}
            sub={fmtSeconds(run.metrics.runtimeSeconds)}
          />
        </div>
        <div className="mt-8">
          <Eyebrow>Per-stage breakdown</Eyebrow>
          <div className="mt-3 space-y-2">
            {experiment.stages.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[14px]">
                <span className="text-ink-200">{s.name}</span>
                {run.stages[s.id]?.modelRequests != null ? (
                  <span className="tnum font-mono text-ink-100">{run.stages[s.id].modelRequests} req</span>
                ) : (
                  <Missing size="sm" path={`stages.${s.id}.modelRequests`} />
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-auto text-[13px] leading-relaxed text-ink-500">
          Click any node on the canvas to inspect it. Stage descriptions are draft copy until confirmed against the
          engine.
        </p>
      </div>
    );
  }

  if (sel.kind === 'stage') {
    const i = experiment.stages.findIndex((s) => s.id === sel.id);
    const s = experiment.stages[i];
    const rec = run.stages[s.id];
    const base = `runs[${run.id}].stages.${s.id}`;
    return (
      <div className="flex h-full flex-col">
        {back}
        <Eyebrow>
          Stage {pad2(i + 1)} / {pad2(experiment.stages.length)}
        </Eyebrow>
        <div className="mt-2 text-[56px] font-semibold leading-none tracking-tightest text-ink-50">{s.name}</div>
        <div className="mt-4 flex items-start gap-3">
          <p className="text-[16px] leading-relaxed text-ink-300">{s.summary}</p>
          {s.summaryStatus === 'draft' && <Badge kind="placeholder" label="draft copy" />}
        </div>
        <div className="mt-8 space-y-4">
          <Field label="Model requests" value={rec?.modelRequests} path={`${base}.modelRequests`} />
          <Field label="Runtime" value={rec?.runtimeSeconds != null ? `${rec.runtimeSeconds}s` : null} path={`${base}.runtimeSeconds`} />
          <Field label="Saved snapshot" value={rec?.snapshotId} path={`${base}.snapshotId`} />
          <Field label="Stage output" value={rec?.output} path={`${base}.output`} />
        </div>
        <div className="mt-auto rounded-2xl border border-signal/30 bg-signal/[0.04] p-5">
          <div className="text-[15px] font-medium text-ink-50">Debug this stage in isolation</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
            Branch a replay from the snapshot saved before {s.name}. Upstream stages are reused, not re-run.
          </p>
          <PrimaryButton className="mt-4" onClick={() => onReplayStage(s.id)}>
            Replay from {s.name} <ArrowRight />
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (sel.kind === 'activity') {
    return (
      <div className="flex h-full flex-col">
        {back}
        <Eyebrow>Input</Eyebrow>
        <div className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-ink-50">Recorded activity</div>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
          The captured user session the agent reads to discover workflows.
        </p>
        <div className="mt-8">
          {run.recordedActivity ? (
            <p className="text-ink-200">{run.recordedActivity.description}</p>
          ) : (
            <MissingBlock title="Session description, sources and duration" path={`runs[${run.id}].recordedActivity`} />
          )}
        </div>
      </div>
    );
  }

  if (sel.kind === 'workflows') {
    return (
      <div className="flex h-full flex-col">
        {back}
        <Eyebrow>Output</Eyebrow>
        <div className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-ink-50">Generated workflows</div>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-300">Reusable workflows the agent produced for this run.</p>
        <div className="mt-8 space-y-3 overflow-y-auto">
          {run.generatedWorkflows ? (
            run.generatedWorkflows.map((w) => (
              <div key={w.id} className="rounded-xl border border-ink-700 p-4">
                <div className="text-[15px] font-medium text-ink-100">{w.title}</div>
                {w.confidence != null && (
                  <div className="mt-1 font-mono text-[11px] text-ink-500">confidence {w.confidence}/4</div>
                )}
                {w.trigger && (
                  <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-300">
                    <span className="text-ink-500">trigger · </span>
                    {w.trigger}
                  </p>
                )}
                {w.outcome && (
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-300">
                    <span className="text-ink-500">outcome · </span>
                    {w.outcome}
                  </p>
                )}
                {w.variations && (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-400">
                    <span className="text-ink-500">variations · </span>
                    {w.variations.join(' · ')}
                  </p>
                )}
                {w.limitations && (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-400">
                    <span className="text-ink-500">limitations · </span>
                    {w.limitations.join(' · ')}
                  </p>
                )}
              </div>
            ))
          ) : (
            <MissingBlock title="Workflow list, titles and steps" path={`runs[${run.id}].generatedWorkflows`}>
              <div className="mt-4 space-y-2 opacity-60">
                {[0.9, 0.7, 0.8].map((w, k) => (
                  <div key={k} className="h-9 rounded-lg border border-dashed border-ink-700" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            </MissingBlock>
          )}
        </div>
        <GhostButton className="mt-auto self-start" onClick={onOpenEvidence}>
          Match against ground truth <ArrowRight />
        </GhostButton>
      </div>
    );
  }

  // eval — Step 02 is "what did the agents do", not "did they pass": the score stays
  // sealed here and reveals in Inspect Evaluation (Step 03), on purpose.
  return (
    <div className="flex h-full flex-col">
      {back}
      <Eyebrow>Evaluation</Eyebrow>
      <div className="mt-6 flex h-[150px] w-[150px] items-center justify-center rounded-full border border-dashed border-ink-600">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-500">sealed</span>
      </div>
      <p className="mt-8 text-[15px] leading-relaxed text-ink-300">
        Each check compares the generated workflows with known ground truth — the result is revealed in Step 03, not
        here.
      </p>
      <PrimaryButton className="mt-6 self-start" onClick={onOpenEvidence}>
        Open evidence explorer <ArrowRight />
      </PrimaryButton>
    </div>
  );
}

function BigStat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex items-end justify-between py-5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-400">{label}</span>
      <span className="text-right">
        <span className="tnum block text-[52px] font-semibold leading-none tracking-tightest text-ink-50">{value}</span>
        {sub && <span className="mt-1 block font-mono text-[12px] text-ink-500">{sub}</span>}
      </span>
    </div>
  );
}

function Field({ label, value, path }: { label: string; value: string | number | null | undefined; path: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-ink-800 pb-4">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-500">{label}</span>
      {value != null ? <span className="text-[18px] text-ink-50">{value}</span> : <Missing path={path} />}
    </div>
  );
}
