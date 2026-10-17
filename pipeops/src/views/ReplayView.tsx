import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Experiment, Run, StageId } from '../data/schema';
import { Badge, Eyebrow, GhostButton, Missing, PlayIcon, PrimaryButton } from '../components/ui';
import { pad2 } from '../lib/format';
import { usePlayKey } from '../lib/events';
import { fetchSnapshots, streamWfevalStage, type SnapshotSummary } from '../data/live';

/* graph geometry */
const GW = 1680;
const GH = 330;
const MAIN_Y = 92;
const BRANCH_Y = 252;
const ORIGIN_X = 40;
const END_X = 1630;
const stageX = (i: number) => 310 + i * 375;
const snapX = (i: number) => stageX(i) - 180;
const EASE = [0.22, 1, 0.36, 1] as const;

export function ReplayView({
  experiment,
  run,
  stage,
  onStage,
}: {
  experiment: Experiment;
  run: Run;
  stage: StageId | null;
  onStage: (s: StageId) => void;
}) {
  const stages = experiment.stages;
  const selIdx = Math.max(0, stages.findIndex((s) => s.id === (stage ?? stages[2]?.id)));
  const sel = stages[selIdx];
  const [configId, setConfigId] = useState(run.id);
  const [sim, setSim] = useState(0); // 0 idle · 1 branch drawn · 2.. stage k lit · last = eval
  const timers = useRef<number[]>([]);
  const downstream = stages.slice(selIdx);
  const upstream = stages.slice(0, selIdx);
  const lastSim = downstream.length + 2;

  // Real execution, separate from the preview above: a saved snapshot step for this
  // stage, if one exists, lets `wfeval stage` replay the actual agent.
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [stageConfirming, setStageConfirming] = useState(false);
  const [stageRunning, setStageRunning] = useState(false);
  const [stageLog, setStageLog] = useState('');
  const stageLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSnapshots().then(setSnapshots).catch(() => setSnapshots([]));
  }, []);
  useEffect(() => {
    stageLogRef.current?.scrollTo({ top: stageLogRef.current.scrollHeight });
  }, [stageLog]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);
  useEffect(() => {
    clear();
    setSim(0);
  }, [selIdx, configId, run.id]);

  const preview = () => {
    clear();
    setSim(0);
    for (let k = 1; k <= lastSim; k++) timers.current.push(window.setTimeout(() => setSim(k), 250 + k * 520));
  };
  usePlayKey(preview);

  const config = experiment.runs.find((r) => r.id === configId)!;
  const snapshotId = run.stages[sel.id]?.snapshotId ?? null;
  const upstreamReq = upstream.map((s) => run.stages[s.id]?.modelRequests ?? null);
  const reusedRequests = upstreamReq.every((v) => v !== null) ? upstreamReq.reduce<number>((t, v) => t + (v ?? 0), 0) : null;

  const task = `workflow-${sel.id}`;
  const match = (snapshots ?? []).flatMap((snap) => snap.steps.filter((s) => s.task === task).map((s) => ({ snap, s })))[0];

  const runStageReplay = async () => {
    if (!match) return;
    setStageConfirming(false);
    setStageRunning(true);
    setStageLog('');
    try {
      await streamWfevalStage(
        { step: `snapshots/${match.snap.id}/steps/${match.s.step}`, task, variant: `variants/${match.snap.variant}.json`, repeat: 1 },
        (chunk) => setStageLog((l) => l + chunk),
      );
    } catch (e) {
      setStageLog((l) => l + `\n[pipeops] ${(e as Error).message}\n`);
    } finally {
      setStageRunning(false);
    }
  };

  const forkX = snapX(selIdx);
  const branchPath = `M ${forkX} ${MAIN_Y} C ${forkX} ${BRANCH_Y - 40}, ${forkX + 40} ${BRANCH_Y}, ${forkX + 110} ${BRANCH_Y} L ${END_X} ${BRANCH_Y}`;

  return (
    <div className="flex h-full flex-col px-[120px] pt-8">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <Eyebrow>Replay preview · {sel.name}</Eyebrow>
          <h2 className="mt-3 text-[48px] font-semibold leading-none tracking-tightest text-ink-50">
            Replay a stage. Resume from a snapshot.
          </h2>
          <p className="mt-2 text-[16px] text-ink-300">
            Test individual workflow stages without restarting the entire evaluation pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge kind="simulated" label="Replay Preview" />
        </div>
      </div>

      {/* branch graph */}
      <div className="relative mt-8" style={{ width: GW, height: GH }}>
        <svg width={GW} height={GH} className="absolute inset-0 overflow-visible">
          <defs>
            <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="#141519" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="#C8FF4D" strokeOpacity=".35" strokeWidth="2" />
            </pattern>
            <filter id="glow-b" filterUnits="userSpaceOnUse" x="-50" y="-50" width={GW + 100} height={GH + 100}>
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* recorded main line: solid */}
          <line x1={ORIGIN_X} x2={END_X} y1={MAIN_Y} y2={MAIN_Y} stroke="#9095A0" strokeWidth="2" />
          {/* portion that gets replaced on the branch */}
          <motion.line
            x1={forkX}
            x2={END_X}
            y1={MAIN_Y}
            y2={MAIN_Y}
            stroke="#0A0B0D"
            strokeWidth="2"
            strokeDasharray="4 6"
            initial={false}
            animate={{ opacity: sim > 0 ? 1 : 0 }}
          />

          {/* simulated branch */}
          <path d={branchPath} stroke="#24262C" strokeWidth="2" fill="none" strokeDasharray="5 7" />
          <motion.path
            key={`b-${selIdx}-${configId}`}
            d={branchPath}
            stroke="#C8FF4D"
            strokeWidth="2.5"
            fill="none"
            filter="url(#glow-b)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: sim >= 1 ? 1 : 0 }}
            transition={{ duration: 0.5 + downstream.length * 0.45, ease: 'easeInOut' }}
          />
          {sim >= 1 && <path d={branchPath} stroke="#C8FF4D" strokeOpacity=".5" strokeWidth="1" fill="none" className="dash-flow" />}

          {/* snapshots: diamonds between stages */}
          {stages.map((s, i) => {
            const x = snapX(i);
            const isFork = i === selIdx;
            return (
              <g key={s.id} transform={`translate(${x} ${MAIN_Y})`} className="cursor-pointer" onClick={() => onStage(s.id)}>
                <g transform="rotate(45)">
                  <motion.rect
                    initial={false}
                    animate={{
                      x: isFork ? -10 : -7,
                      y: isFork ? -10 : -7,
                      width: isFork ? 20 : 14,
                      height: isFork ? 20 : 14,
                      fill: isFork ? '#C8FF4D' : '#0A0B0D',
                      stroke: isFork ? '#C8FF4D' : '#6B707C',
                    }}
                    strokeWidth={1.5}
                    strokeDasharray={run.stages[s.id]?.snapshotId || isFork ? undefined : '3 2'}
                  />
                </g>
                {isFork && <circle r="18" fill="none" stroke="#C8FF4D" strokeOpacity=".35" className="pulse-dot" />}
              </g>
            );
          })}
        </svg>

        {/* origin */}
        <Dot x={ORIGIN_X} y={MAIN_Y} label="recorded activity" />
        <div className="absolute font-mono text-[11px] uppercase tracking-widest text-ink-400" style={{ left: ORIGIN_X - 4, top: MAIN_Y - 58 }}>
          recorded · run/{run.id}
        </div>

        {/* main-line stage nodes */}
        {stages.map((s, i) => {
          const reused = i < selIdx;
          const replaced = i >= selIdx && sim > 0;
          return (
            <GraphNode
              key={s.id}
              x={stageX(i)}
              y={MAIN_Y}
              onClick={() => onStage(s.id)}
              tone={replaced ? 'faded' : reused ? 'reused' : 'recorded'}
              title={s.name}
              index={i}
              tag={reused ? 'reused from snapshot' : i === selIdx ? 'replay starts here' : 'recorded'}
            />
          );
        })}
        <Dot x={END_X} y={MAIN_Y} label={`eval · ${run.metrics.qualityPassed}/${run.metrics.qualityTotal}`} />

        {/* snapshot label for fork */}
        <motion.div
          className="absolute w-[220px] text-center font-mono text-[11px] text-signal"
          style={{ top: MAIN_Y - 36 }}
          initial={false}
          animate={{ left: forkX - 110 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        >
          snapshot before {sel.name}
        </motion.div>

        {/* branch nodes */}
        <div className="absolute font-mono text-[11px] uppercase tracking-widest text-signal/80" style={{ left: forkX + 120, top: BRANCH_Y + 46 }}>
          replay/{run.id}@{sel.id} · config {config.label}
        </div>
        <AnimatePresence>
          {downstream.map((s, k) => {
            const i = selIdx + k;
            const lit = sim >= k + 2;
            return (
              <GraphNode
                key={`br-${s.id}-${selIdx}`}
                x={stageX(i)}
                y={BRANCH_Y}
                tone={lit ? 'sim-lit' : 'sim'}
                title={s.name}
                index={i}
                tag={lit ? 'previewed' : 'pending'}
                appear
              />
            );
          })}
        </AnimatePresence>
        <motion.div
          className="absolute flex items-center gap-3"
          style={{ left: END_X - 9, top: BRANCH_Y - 9 }}
          initial={false}
          animate={{ opacity: sim >= lastSim ? 1 : 0.35 }}
        >
          <span className={`h-[18px] w-[18px] rounded-full border-2 ${sim >= lastSim ? 'border-signal bg-signal/30' : 'border-dashed border-ink-500'}`} />
        </motion.div>
        <motion.div
          className="absolute w-[200px] text-right font-mono text-[11px] text-ink-400"
          style={{ left: END_X - 190, top: BRANCH_Y + 40 }}
          animate={{ opacity: sim >= lastSim ? 1 : 0.4 }}
        >
          eval′ · replay not yet executed
        </motion.div>
      </div>

      {/* lower panels */}
      <div className="mt-4 grid flex-1 grid-cols-[1fr_1.25fr_1fr] gap-10 border-t border-ink-800 pt-7">
        {/* 1. choose */}
        <div>
          <Eyebrow>1 · Choose a stage</Eyebrow>
          <div className="mt-3 flex flex-col gap-1">
            {stages.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onStage(s.id)}
                className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-left transition ${
                  i === selIdx ? 'bg-ink-850 ring-1 ring-signal/50' : 'hover:bg-ink-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-500">{pad2(i + 1)}</span>
                  <span className={`text-[16px] ${i === selIdx ? 'text-ink-50' : 'text-ink-300'}`}>{s.name}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-500">
                  {i < selIdx ? 'reuse' : i === selIdx ? 'fork ◆' : 're-run'}
                </span>
              </button>
            ))}
          </div>
          <Eyebrow className="mt-5">Replay with config</Eyebrow>
          <div className="mt-2 flex gap-2">
            {experiment.runs.map((r) => (
              <button
                key={r.id}
                onClick={() => setConfigId(r.id)}
                className={`rounded-full border px-3 py-1 text-[13px] transition ${
                  configId === r.id ? 'border-signal/60 bg-signal/10 text-signal' : 'border-ink-700 text-ink-300 hover:text-ink-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. plan */}
        <div>
          <Eyebrow>2 · Replay plan</Eyebrow>
          <ol className="mt-3 flex flex-col gap-3">
            <PlanStep n={1} active={sim >= 1} title={`Restore snapshot before ${sel.name}`}>
              {snapshotId ? <span className="font-mono text-ink-200">{snapshotId}</span> : <Missing size="sm" path={`stages.${sel.id}.snapshotId`} />}
            </PlanStep>
            <PlanStep n={2} active={sim >= 1} title={upstream.length ? `Reuse ${upstream.map((s) => s.name).join(', ')}` : 'Nothing upstream to reuse'}>
              <span className="text-ink-400">{upstream.length ? 'Outputs come from the snapshot — these stages are not re-run.' : 'Replay starts at the first stage.'}</span>
            </PlanStep>
            <PlanStep n={3} active={sim >= 2} title={`Re-execute ${downstream.map((s) => s.name).join(' → ')}`}>
              <span className="text-ink-400">with the {config.label} configuration</span>
            </PlanStep>
            <PlanStep n={4} active={sim >= lastSim} title={`Re-evaluate against ${run.metrics.qualityTotal} ground-truth checks`}>
              <span className="text-ink-400">then diff against the parent run</span>
            </PlanStep>
          </ol>
        </div>

        {/* 3. outcome */}
        <div className="flex flex-col">
          <Eyebrow>3 · Outcome</Eyebrow>
          <div className="mt-3 space-y-4">
            <OutcomeRow label="Model requests reused">
              {reusedRequests !== null ? (
                <span className="tnum text-[28px] font-semibold text-ink-50">{reusedRequests}</span>
              ) : (
                <Missing size="sm" path="stages.*.modelRequests" />
              )}
            </OutcomeRow>
            <OutcomeRow label="Replay result">
              <span className="text-[14px] text-ink-300">Replay not yet executed. This is a preview of the plan.</span>
            </OutcomeRow>
          </div>
          <PrimaryButton className="mt-auto self-start" onClick={preview}>
            <PlayIcon /> {sim > 0 && sim < lastSim ? 'Previewing…' : 'Preview Replay Plan'}
          </PrimaryButton>

          {/* Real execution — separate action, separate confirmation, only when a saved
              snapshot actually has a step for this stage. Never fabricated. */}
          <div className="mt-6 border-t border-ink-800 pt-5">
            <Eyebrow>Run it for real</Eyebrow>
            {snapshots === null ? (
              <p className="mt-2 text-[13px] text-ink-500">checking for a saved snapshot…</p>
            ) : match ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                  Snapshot <span className="text-ink-200">{match.snap.id}</span> has a saved state before{' '}
                  {sel.name}. Running replays that one agent for real — a genuine model call, not a preview.
                </p>
                {!stageConfirming ? (
                  <PrimaryButton className="mt-3" onClick={() => setStageConfirming(true)} disabled={stageRunning}>
                    {stageRunning ? 'Running…' : 'Run Stage Replay'}
                  </PrimaryButton>
                ) : (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-cost/40 bg-cost/[0.06] p-3">
                    <span className="text-[12px] leading-snug text-cost">This spends real AI allowance. Continue?</span>
                    <PrimaryButton className="shrink-0" onClick={runStageReplay}>
                      Confirm
                    </PrimaryButton>
                    <GhostButton className="shrink-0" onClick={() => setStageConfirming(false)}>
                      Cancel
                    </GhostButton>
                  </div>
                )}
                {stageLog && (
                  <div
                    ref={stageLogRef}
                    className="mt-3 h-32 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] text-ink-300"
                  >
                    <pre className="whitespace-pre-wrap">{stageLog}</pre>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-[13px] text-ink-500">No saved snapshot covers {sel.name} yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <>
      <span className="absolute h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-200 bg-ink-950" style={{ left: x, top: y }} />
      <span className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[11px] text-ink-400" style={{ left: x, top: y + 16 }}>
        {label}
      </span>
    </>
  );
}

function GraphNode({
  x,
  y,
  title,
  index,
  tag,
  tone,
  onClick,
  appear,
}: {
  x: number;
  y: number;
  title: string;
  index: number;
  tag: string;
  tone: 'recorded' | 'reused' | 'faded' | 'sim' | 'sim-lit';
  onClick?: () => void;
  appear?: boolean;
}) {
  const cls = {
    recorded: 'border-ink-400 bg-ink-900 text-ink-50',
    reused: 'border-ink-500 bg-ink-900 text-ink-100',
    faded: 'border-ink-700 bg-ink-950 text-ink-500',
    sim: 'hatch-muted border-dashed border-ink-600 bg-ink-950 text-ink-400',
    'sim-lit': 'hatch border-signal bg-ink-900 text-ink-50 glow-signal',
  }[tone];
  return (
    <motion.button
      onClick={onClick}
      initial={appear ? { opacity: 0, y: -16 } : false}
      animate={{ opacity: 1, y: 0, scale: tone === 'sim-lit' ? 1.04 : 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={`absolute flex h-[60px] w-[200px] flex-col justify-center rounded-xl border px-4 text-left transition-colors duration-300 ${cls}`}
      style={{ left: x - 100, top: y - 30 }}
    >
      <span className="flex items-center justify-between">
        <span className="text-[17px] font-semibold tracking-tight">{title}</span>
        <span className="font-mono text-[10px] opacity-60">{pad2(index + 1)}</span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">{tag}</span>
    </motion.button>
  );
}

function PlanStep({ n, title, active, children }: { n: number; title: string; active: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors duration-300 ${
          active ? 'border-signal bg-signal text-ink-950' : 'border-ink-600 text-ink-400'
        }`}
      >
        {n}
      </span>
      <div className="min-w-0">
        <div className={`text-[16px] transition-colors ${active ? 'text-ink-50' : 'text-ink-200'}`}>{title}</div>
        <div className="mt-0.5 text-[13px]">{children}</div>
      </div>
    </li>
  );
}

function OutcomeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-ink-800 pb-3">
      <div className="font-mono text-[11px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
