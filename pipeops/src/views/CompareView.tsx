import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Experiment, Run } from '../data/schema';
import { CountUp, Eyebrow, Kbd, PlayIcon, PrimaryButton } from '../components/ui';
import { fmtSeconds, signed } from '../lib/format';
import { usePlayKey } from '../lib/events';
import { ANIMATED, useTheme } from '../lib/theme';

type Mode = 'A' | 'B' | 'AB';
type Dir = 'win' | 'cost' | 'flat';
const VIZ_W = 1000;
const EASE = [0.22, 1, 0.36, 1] as const;

/** A change from A to B, with its direction. For cost metrics (requests, runtime) less is a
 *  win; pass lowerIsBetter=false for metrics where more is better. */
function delta(from: number, to: number, lowerIsBetter = true) {
  const d = to - from;
  const p = from === 0 ? null : (d / from) * 100;
  const dir: Dir = d === 0 ? 'flat' : (d < 0) === lowerIsBetter ? 'win' : 'cost';
  return { d, dir, abs: signed(d), pctLabel: p === null ? null : `${signed(p, 1)}%` };
}

export function CompareView({ experiment }: { experiment: Experiment }) {
  const a = experiment.runs.find((r) => r.id === experiment.comparison.baseline)!;
  const b = experiment.runs.find((r) => r.id === experiment.comparison.variant)!;
  const [mode, setMode] = useState<Mode>('A');
  const [revealed, setRevealed] = useState(false);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const reveal = () => {
    clear();
    setRevealed(false);
    setRunning(true);
    setMode('A');
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(900, () => setMode('B'));
    at(3100, () => setMode('AB'));
    at(4300, () => {
      setRevealed(true);
      setRunning(false);
    });
  };
  usePlayKey(reveal);

  const shown = mode === 'A' ? a : b;
  const showDelta = mode === 'AB';
  const quality = delta(a.metrics.qualityPassed, b.metrics.qualityPassed, false);
  const req = delta(a.metrics.modelRequests, b.metrics.modelRequests);
  const sec = delta(a.metrics.runtimeSeconds, b.metrics.runtimeSeconds);
  // Phase breakdown only when the variant ran more than one phase (the three-phase story).
  const phases = b.metrics.phases && b.metrics.phases.length > 1 ? b.metrics.phases : null;

  return (
    <div className="flex h-full flex-col px-[120px] pt-9">
      {/* ---------- header ---------- */}
      <div className="flex items-end justify-between">
        <div>
          <Eyebrow>Experiment comparison · {experiment.experiment.question}</Eyebrow>
          <div className="mt-3 flex items-baseline gap-5 text-[52px] font-semibold leading-none tracking-tightest">
            <span className={mode === 'B' ? 'text-ink-500 transition-colors' : 'text-ink-50 transition-colors'}>{a.label}</span>
            <span className="text-[32px] font-normal text-ink-600">vs</span>
            <span className={mode === 'A' ? 'text-ink-500 transition-colors' : 'text-ink-50 transition-colors'}>{b.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ModeSwitch mode={mode} a={a} b={b} onMode={(m) => { clear(); setRunning(false); setMode(m); }} />
          <PrimaryButton onClick={reveal}>
            <PlayIcon /> {running ? 'Running reveal…' : revealed ? 'Replay reveal' : 'Run reveal'}
          </PrimaryButton>
        </div>
      </div>

      {/* ---------- lanes ---------- */}
      <div className="mt-10 flex flex-col border-t border-ink-800">
        <Lane
          label="Quality"
          sub="checks passed vs ground truth"
          viz={<QualityViz a={a} b={b} mode={mode} />}
          value={
            <span className="tnum">
              {shown.metrics.qualityPassed}
              <span className="text-ink-500">/{shown.metrics.qualityTotal}</span>
            </span>
          }
          delta={
            showDelta ? (
              <DeltaChip tone={quality.dir}>{quality.d === 0 ? '±0 · unchanged' : `${signed(quality.d)} checks`}</DeltaChip>
            ) : null
          }
        />
        <Lane
          label="Model requests"
          sub="1 tick = 1 request"
          viz={<RequestsViz a={a} b={b} mode={mode} />}
          value={<CountUp value={shown.metrics.modelRequests} duration={1.4} />}
          delta={
            showDelta ? (
              <DeltaChip tone={req.dir}>
                {req.abs}{req.pctLabel ? ` · ${req.pctLabel}` : ''}
              </DeltaChip>
            ) : null
          }
          tone={mode !== 'A' ? req.dir : undefined}
        />
        <Lane
          label="Runtime"
          sub="wall-clock seconds"
          viz={<RuntimeViz a={a} b={b} mode={mode} />}
          value={<CountUp value={shown.metrics.runtimeSeconds} duration={1.8} format={(n) => `${Math.round(n)}s`} />}
          valueSub={fmtSeconds(shown.metrics.runtimeSeconds)}
          delta={
            showDelta ? (
              <DeltaChip tone={sec.dir}>
                {sec.abs}s{sec.pctLabel ? ` · ${sec.pctLabel}` : ''}
              </DeltaChip>
            ) : null
          }
          tone={mode !== 'A' ? sec.dir : undefined}
        />
      </div>

      {/* ---------- verdict ---------- */}
      <div className="relative mt-8 flex-1">
        <AnimatePresence mode="wait">
          {revealed ? (
            <motion.div
              key="verdict"
              initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: EASE }}
              className="flex items-end justify-between"
            >
              <div className="min-w-0 flex-1 pr-8">
                <Eyebrow className="text-signal">Conclusion</Eyebrow>
                <div className="mt-3 text-[64px] font-semibold leading-[0.95] tracking-tightest text-ink-50">
                  {experiment.comparison.verdict}
                </div>
                <p className="mt-4 text-[18px] text-ink-300">
                  {quality.d === 0
                    ? `Same quality (${a.metrics.qualityPassed}/${a.metrics.qualityTotal})`
                    : `Quality ${a.metrics.qualityPassed}/${a.metrics.qualityTotal} → ${b.metrics.qualityPassed}/${b.metrics.qualityTotal}`}
                  , at <DeltaWord dir={req.dir}>{req.pctLabel ?? req.abs} requests</DeltaWord> and{' '}
                  <DeltaWord dir={sec.dir}>{sec.pctLabel ?? `${sec.abs}s`} runtime</DeltaWord>.
                </p>
                <RejectedCalls a={a} b={b} />
                {phases && <PhaseStrip a={a} b={b} />}
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="mb-2 flex flex-col items-end gap-2"
              >
                <span className="rounded-full border border-ink-700 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-ink-400">
                  n = {experiment.comparison.pairing === 'single' ? 1 : '>1'} pair
                </span>
                <span className="font-mono text-[13px] text-ink-500">{experiment.comparison.note}</span>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="sealed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: 'blur(6px)' }}
              className="flex h-[150px] items-center justify-between rounded-2xl border border-dashed border-ink-700 px-10"
            >
              <span className="text-[22px] text-ink-400">
                Verdict sealed. <span className="text-ink-200">Run the reveal to compare both recorded runs.</span>
              </span>
              <span className="flex items-center gap-2 font-mono text-[12px] text-ink-500">
                <Kbd>space</Kbd> run reveal
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function ModeSwitch({ mode, a, b, onMode }: { mode: Mode; a: Run; b: Run; onMode: (m: Mode) => void }) {
  const opts: { m: Mode; label: string }[] = [
    { m: 'A', label: a.label },
    { m: 'B', label: b.label },
    { m: 'AB', label: 'Overlay Δ' },
  ];
  return (
    <div className="relative flex rounded-full border border-ink-700 bg-ink-900/80 p-1">
      {opts.map((o) => (
        <button
          key={o.m}
          onClick={() => onMode(o.m)}
          className={`relative z-10 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
            mode === o.m ? 'text-ink-950' : 'text-ink-300 hover:text-ink-100'
          }`}
        >
          {mode === o.m && (
            <motion.span
              layoutId="cmp-pill"
              className="absolute inset-0 -z-10 rounded-full bg-ink-50"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Lane({
  label,
  sub,
  viz,
  value,
  valueSub,
  delta,
  tone,
}: {
  label: string;
  sub: string;
  viz: ReactNode;
  value: ReactNode;
  valueSub?: string;
  delta: ReactNode;
  tone?: Dir;
}) {
  return (
    <div className="flex h-[150px] items-center border-b border-ink-800">
      <div className="w-[230px] shrink-0">
        <div className="text-[22px] font-medium text-ink-50">{label}</div>
        <div className="mt-1 font-mono text-[11px] text-ink-500">{sub}</div>
      </div>
      <div className="flex-1">{viz}</div>
      <div className="flex w-[360px] shrink-0 flex-col items-end">
        <div
          className={`text-[80px] font-semibold leading-none tracking-tightest transition-colors duration-700 ${
            tone === 'cost' ? 'text-cost' : tone === 'win' ? 'text-signal' : 'text-ink-50'
          }`}
        >
          {value}
        </div>
        <div className="mt-2 flex h-6 items-center gap-3">
          {valueSub && <span className="font-mono text-[12px] text-ink-500">{valueSub}</span>}
          <AnimatePresence>{delta}</AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<Dir | 'neutral', string> = {
  win: 'bg-signal/15 text-signal',
  cost: 'bg-cost/15 text-cost',
  flat: 'bg-ink-700/40 text-ink-300',
  neutral: 'bg-ink-700/40 text-ink-300',
};

function DeltaChip({ children, tone }: { children: ReactNode; tone: Dir | 'neutral' }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`tnum rounded-full px-2.5 py-0.5 font-mono text-[12px] ${TONE[tone]}`}
    >
      {children}
    </motion.span>
  );
}

function DeltaWord({ dir, children }: { dir: Dir; children: ReactNode }) {
  return <span className={dir === 'win' ? 'text-signal' : dir === 'cost' ? 'text-cost' : 'text-ink-200'}>{children}</span>;
}

/** Workflows calls the engine refused (usage.workspace.failed). Each one is a retry the agent
 *  has to pay for. Hidden when neither run logged it; "not logged" when only one did. */
function RejectedCalls({ a, b }: { a: Run; b: Run }) {
  const av = a.metrics.failedCalls ?? null;
  const bv = b.metrics.failedCalls ?? null;
  if (av === null && bv === null) return null;
  const d = av !== null && bv !== null ? delta(av, bv) : null;
  const side = (label: string, v: number | null) => (
    <span>
      <span className="text-ink-500">{label} </span>
      {v === null ? <span className="text-ink-500">not logged</span> : <span className="tnum text-ink-100">{v}</span>}
    </span>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]"
      title="Workflows calls the engine refused (usage.workspace.failed); each one costs the agent a retry"
    >
      <span className="uppercase tracking-widest text-[11px] text-ink-500">Rejected calls</span>
      {side(a.label, av)}
      <span className="text-ink-600">→</span>
      {side(b.label, bv)}
      {d && <DeltaChip tone={d.dir}>{d.d === 0 ? '±0' : `${d.abs}${d.pctLabel ? ` · ${d.pctLabel}` : ''}`}</DeltaChip>}
    </motion.div>
  );
}

/** Per-phase request bars for the full three-phase story (phase 1: history, 2: a rule change,
 *  3: nothing new — where idle-skip drops to zero). Shown only when the variant ran >1 phase. */
function PhaseStrip({ a, b }: { a: Run; b: Run }) {
  const ap = a.metrics.phases ?? [];
  const bp = b.metrics.phases ?? [];
  const phaseNums = [...new Set([...ap, ...bp].map((p) => p.phase))].sort((x, y) => x - y);
  const max = Math.max(1, ...ap.map((p) => p.modelRequests), ...bp.map((p) => p.modelRequests));
  const find = (ps: typeof ap, n: number) => ps.find((p) => p.phase === n) ?? null;
  const bar = (p: ReturnType<typeof find>, cls: string) => (
    <div className="flex items-center gap-2">
      <div className="h-[8px] rounded-sm bg-ink-800" style={{ width: 120 }}>
        <div className={`h-full rounded-sm ${cls}`} style={{ width: `${((p?.modelRequests ?? 0) / max) * 100}%` }} />
      </div>
      <span className="tnum w-9 font-mono text-[11px] text-ink-400">{p ? p.modelRequests : '—'}</span>
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="mt-6 max-w-[560px] rounded-xl border border-ink-800 bg-ink-900/40 px-5 py-4"
    >
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-ink-500">
        <span>Requests per phase</span>
        <span className="flex gap-4 normal-case tracking-normal">
          <span className="text-ink-300">■ {a.label}</span>
          <span className="text-signal">■ {b.label}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {phaseNums.map((n) => {
          const bPhase = find(bp, n);
          return (
            <div key={n} className="flex items-center gap-4">
              <span className="w-[62px] shrink-0 font-mono text-[12px] text-ink-300">
                Phase {n}
                {bPhase?.idleChurn ? <span className="ml-1 text-cost" title="idle churn: changed the catalog with no new history">●</span> : null}
              </span>
              {bar(find(ap, n), 'bg-ink-300')}
              {bar(bPhase, 'bg-signal')}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Quality never moves between runs: the blocks stay put, only the stamp changes. */
function QualityViz({ a, b, mode }: { a: Run; b: Run; mode: Mode }) {
  const total = Math.max(a.metrics.qualityTotal, b.metrics.qualityTotal);
  const same = a.metrics.qualityPassed === b.metrics.qualityPassed && a.metrics.qualityTotal === b.metrics.qualityTotal;
  const row = (run: Run, small = false) => (
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`${small ? 'h-[10px]' : 'h-[34px]'} w-[72px] rounded-[6px] ${
            i < run.metrics.qualityPassed ? 'bg-signal' : 'border border-dashed border-ink-600'
          }`}
        />
      ))}
    </div>
  );
  return (
    <div className="flex items-center gap-8">
      <div className="flex flex-col gap-2">
        {mode === 'AB' ? (
          <>
            <div className="flex items-center gap-3">
              <span className="w-4 font-mono text-[11px] text-ink-500">A</span>
              {row(a, true)}
            </div>
            <div className="flex items-center gap-3">
              <span className="w-4 font-mono text-[11px] text-ink-500">B</span>
              {row(b, true)}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-4 font-mono text-[11px] text-ink-500">{mode}</span>
            {row(mode === 'A' ? a : b)}
          </div>
        )}
      </div>
      <AnimatePresence>
        {mode !== 'A' && same && (
          <motion.span
            initial={{ opacity: 0, scale: 1.4, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="rounded-md border-2 border-signal px-3 py-1 font-mono text-[14px] font-semibold uppercase tracking-[0.2em] text-signal"
          >
            unchanged
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function RequestsViz({ a, b, mode }: { a: Run; b: Run; mode: Mode }) {
  const pal = ANIMATED[useTheme()];
  const av = a.metrics.modelRequests;
  const bv = b.metrics.modelRequests;
  const hi = Math.max(av, bv, 1);
  const lo = Math.min(av, bv);
  const saved = bv < av; // the variant used fewer requests — a win
  const width = VIZ_W;
  const pitch = width / hi;
  const bandColor = saved ? pal.signal : pal.cost;
  const aX = av * pitch; // where A ends, the baseline marker
  // Which slots are lit, and their colour, for the current mode.
  const slot = (i: number): { lit: boolean; fill: string; band: boolean } => {
    if (mode === 'A') return { lit: i < av, fill: pal.on, band: false };
    if (mode === 'B') return { lit: i < bv, fill: pal.on, band: false };
    // AB: common base lit neutral, the delta band lit in its direction colour.
    if (i < lo) return { lit: true, fill: pal.on, band: false };
    if (i < hi) return { lit: true, fill: bandColor, band: true };
    return { lit: false, fill: pal.off, band: false };
  };
  return (
    <div className="relative" style={{ width, height: 72 }}>
      <svg width={width} height={72} className="overflow-visible">
        {Array.from({ length: hi }, (_, i) => {
          const s = slot(i);
          return (
            <motion.rect
              key={i}
              x={i * pitch}
              width={Math.max(2, pitch - 3.5)}
              rx={1}
              initial={false}
              animate={{ y: s.lit ? 12 : 44, height: s.lit ? 48 : 16, fill: s.lit ? s.fill : pal.off }}
              transition={{ delay: s.band ? (i - lo) * 0.035 : 0, duration: 0.35, ease: 'easeOut' }}
            />
          );
        })}
        <line x1={aX - 1.5} x2={aX - 1.5} y1={0} y2={72} stroke="rgb(var(--ink-400))" strokeDasharray="3 3" />
      </svg>
      <span className="absolute -bottom-5 font-mono text-[10px] text-ink-500" style={{ left: Math.max(0, aX - 60) }}>
        A ends · {av}
      </span>
      <AnimatePresence>
        {mode === 'AB' && bv !== av && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-6 flex items-center"
            style={{ left: lo * pitch, width: (hi - lo) * pitch }}
          >
            <div className={`h-2 flex-1 border-x border-t ${saved ? 'border-signal/70' : 'border-cost/70'}`} />
            <span className={`px-2 font-mono text-[11px] ${saved ? 'text-signal' : 'text-cost'}`}>{signed(bv - av)}</span>
            <div className={`h-2 flex-1 border-x border-t ${saved ? 'border-signal/70' : 'border-cost/70'}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RuntimeViz({ a, b, mode }: { a: Run; b: Run; mode: Mode }) {
  const width = VIZ_W;
  const av = a.metrics.runtimeSeconds;
  const bv = b.metrics.runtimeSeconds;
  const saved = bv < av; // the variant was faster — a win
  const maxSec = Math.max(300, Math.ceil(Math.max(av, bv) / 300) * 300); // round to 5 min
  const x = (s: number) => (s / maxSec) * width;
  const aX = x(av);
  const bX = x(bv);
  const shownX = mode === 'A' ? aX : bX;
  const loX = Math.min(aX, bX);
  const hiX = Math.max(aX, bX);
  const ticks = Array.from({ length: maxSec / 300 + 1 }, (_, i) => i * 300);
  return (
    <div className="relative" style={{ width, height: 72 }}>
      {/* grid */}
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-[52px] border-l border-ink-800" style={{ left: x(t) }}>
          <span className="absolute -left-2 top-[56px] font-mono text-[10px] text-ink-600">{t / 60}m</span>
        </div>
      ))}
      {/* track */}
      <div className="absolute top-[18px] h-[20px] w-full rounded-full bg-ink-850" />
      {/* the shown run's bar */}
      <motion.div
        className="absolute top-[18px] h-[20px] rounded-full bg-ink-200"
        initial={false}
        animate={{ width: Math.max(0, shownX) }}
        transition={{ duration: 1.2, ease: EASE }}
      />
      {/* the delta region between A and B, coloured by direction */}
      <motion.div
        className={`absolute top-[18px] h-[20px] ${saved ? 'bg-signal shadow-[0_0_24px_-2px_rgb(var(--signal)/0.55)]' : 'bg-cost shadow-[0_0_24px_-2px_rgb(var(--cost)/0.55)]'}`}
        style={{ left: loX, borderTopRightRadius: 999, borderBottomRightRadius: 999 }}
        initial={false}
        animate={{ width: mode === 'AB' ? hiX - loX : 0, opacity: mode === 'AB' ? (saved ? 0.5 : 1) : 0 }}
        transition={{ duration: 1.8, ease: EASE }}
      />
      <div className="absolute top-[8px] h-[40px] border-l border-dashed border-ink-400" style={{ left: aX }} />
      <AnimatePresence>
        {mode === 'AB' && bv !== av && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-5 flex items-center"
            style={{ left: loX, width: hiX - loX }}
          >
            <div className={`h-2 flex-1 border-x border-t ${saved ? 'border-signal/70' : 'border-cost/70'}`} />
            <span className={`px-2 font-mono text-[11px] ${saved ? 'text-signal' : 'text-cost'}`}>{signed(bv - av)}s</span>
            <div className={`h-2 flex-1 border-x border-t ${saved ? 'border-signal/70' : 'border-cost/70'}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

