import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Efficiency, Experiment, Run } from '../data/schema';
import { CountUp, Eyebrow, Kbd, PlayIcon, PrimaryButton } from '../components/ui';
import { cacheHitRate, fmtCount, totalTokens } from '../lib/efficiency';
import { fmtSeconds, pct } from '../lib/format';
import { usePlayKey } from '../lib/events';
import { ANIMATED, useTheme } from '../lib/theme';

type Mode = 'A' | 'B' | 'AB';
const VIZ_W = 1000;
const EASE = [0.22, 1, 0.36, 1] as const;

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
  const qualityDelta = b.metrics.qualityPassed - a.metrics.qualityPassed;
  const reqDelta = b.metrics.modelRequests - a.metrics.modelRequests;
  const secDelta = b.metrics.runtimeSeconds - a.metrics.runtimeSeconds;
  const tokA = totalTokens(a.efficiency);
  const tokB = totalTokens(b.efficiency);
  const tokShown = totalTokens(shown.efficiency);

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
              <DeltaChip tone="neutral">{qualityDelta === 0 ? '±0 · unchanged' : `${qualityDelta > 0 ? '+' : ''}${qualityDelta}`}</DeltaChip>
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
              <DeltaChip tone="cost">
                +{reqDelta} · +{pct(a.metrics.modelRequests, b.metrics.modelRequests).toFixed(1)}%
              </DeltaChip>
            ) : null
          }
          tone={mode !== 'A' ? 'cost' : undefined}
        />
        <Lane
          label="Token usage"
          sub="input · cache · output"
          viz={<TokensViz a={a} b={b} mode={mode} />}
          value={tokShown === null ? <span className="text-ink-600">—</span> : <CountUp value={tokShown} duration={1.6} format={(n) => fmtCount(Math.round(n)) ?? '—'} />}
          valueSub={tokShown === null ? 'not recorded' : 'total tokens'}
          delta={
            showDelta && tokA !== null && tokB !== null && tokA > 0 ? (
              <DeltaChip tone={tokB > tokA ? 'cost' : 'neutral'}>
                {tokB >= tokA ? '+' : '−'}
                {fmtCount(Math.abs(tokB - tokA))} · {tokB >= tokA ? '+' : '−'}
                {Math.abs(pct(tokA, tokB)).toFixed(1)}%
              </DeltaChip>
            ) : null
          }
          tone={mode !== 'A' && tokShown !== null && tokA !== null && tokB !== null && tokB > tokA ? 'cost' : undefined}
        />
        <Lane
          label="Runtime"
          sub="wall-clock seconds"
          viz={<RuntimeViz a={a} b={b} mode={mode} />}
          value={<CountUp value={shown.metrics.runtimeSeconds} duration={1.8} format={(n) => `${Math.round(n)}s`} />}
          valueSub={fmtSeconds(shown.metrics.runtimeSeconds)}
          delta={
            showDelta ? (
              <DeltaChip tone="cost">
                +{secDelta}s · +{pct(a.metrics.runtimeSeconds, b.metrics.runtimeSeconds).toFixed(1)}%
              </DeltaChip>
            ) : null
          }
          tone={mode !== 'A' ? 'cost' : undefined}
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
              <div>
                <Eyebrow className="text-signal">Conclusion</Eyebrow>
                <div className="mt-3 text-[84px] font-semibold leading-[0.95] tracking-tightest text-ink-50">
                  {experiment.comparison.verdict}
                </div>
                <p className="mt-4 text-[18px] text-ink-300">
                  Same quality ({a.metrics.qualityPassed}/{a.metrics.qualityTotal} → {b.metrics.qualityPassed}/{b.metrics.qualityTotal}),
                  at <span className="text-cost">+{pct(a.metrics.modelRequests, b.metrics.modelRequests).toFixed(1)}% requests</span> and{' '}
                  <span className="text-cost">+{pct(a.metrics.runtimeSeconds, b.metrics.runtimeSeconds).toFixed(1)}% runtime</span>
                  {tokA !== null && tokB !== null && tokA > 0 && (
                    <>
                      {' '}and <span className="text-cost">{tokB >= tokA ? '+' : '−'}{Math.abs(pct(tokA, tokB)).toFixed(1)}% tokens</span>
                    </>
                  )}
                  .
                </p>
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
  tone?: 'cost';
}) {
  return (
    <div className="flex h-[128px] items-center border-b border-ink-800">
      <div className="w-[230px] shrink-0">
        <div className="text-[22px] font-medium text-ink-50">{label}</div>
        <div className="mt-1 font-mono text-[11px] text-ink-500">{sub}</div>
      </div>
      <div className="flex-1">{viz}</div>
      <div className="flex w-[360px] shrink-0 flex-col items-end">
        <div
          className={`text-[80px] font-semibold leading-none tracking-tightest transition-colors duration-700 ${
            tone === 'cost' ? 'text-cost' : 'text-ink-50'
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

const TOKEN_COLS: { label: string; get: (e: Efficiency) => number | null }[] = [
  { label: 'Input (uncached)', get: (e) => e.input },
  { label: 'Cache read', get: (e) => e.cacheRead },
  { label: 'Cache write', get: (e) => e.cacheWrite },
  { label: 'Output', get: (e) => e.output },
];

/**
 * One row per run. A null cell is "not recorded" (an em dash), a recorded zero is "0" —
 * the two are never mixed. Cache reads and writes are separate columns, not folded into
 * Input, so nothing is counted twice; the total above is the sum of the four columns.
 */
function TokensViz({ a, b, mode }: { a: Run; b: Run; mode: Mode }) {
  const rows: { tag: string; run: Run }[] = mode === 'AB' ? [{ tag: 'A', run: a }, { tag: 'B', run: b }] : [{ tag: mode, run: mode === 'A' ? a : b }];
  const cell = (n: number | null, base?: number | null) => (
    <div className="flex flex-col">
      <span className={`tnum font-mono text-[20px] ${n === null ? 'text-ink-600' : 'text-ink-100'}`} title={n === null ? 'not recorded' : n.toLocaleString('en-US')}>
        {fmtCount(n) ?? '—'}
      </span>
      {base != null && n !== null && base > 0 && (
        <span className={`tnum font-mono text-[11px] ${n > base ? 'text-cost' : 'text-ink-500'}`}>
          {n >= base ? '+' : '−'}
          {Math.abs(pct(base, n)).toFixed(0)}%
        </span>
      )}
    </div>
  );
  const note = (e: Efficiency | null | undefined) =>
    !e ? 'no usage recorded' : e.source === 'pipe_logs' ? 'partial: pipe logs undercount' : e.source === null ? 'source not recorded' : null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-end gap-4 pl-7 font-mono text-[10.5px] uppercase tracking-widest text-ink-500">
        {TOKEN_COLS.map((c) => (
          <span key={c.label} className="w-[150px]">{c.label}</span>
        ))}
        <span className="w-[110px]">Cache hit</span>
      </div>
      {rows.map(({ tag, run }) => {
        const e = run.efficiency;
        const base = mode === 'AB' && tag === 'B' ? a.efficiency : null;
        const hit = cacheHitRate(e);
        const baseHit = base ? cacheHitRate(base) : null;
        return (
          <div key={tag} className="flex items-center gap-4">
            <span className="w-3 font-mono text-[11px] text-ink-500">{tag}</span>
            {TOKEN_COLS.map((c) => (
              <div key={c.label} className="w-[150px]">{cell(e ? c.get(e) : null, base ? c.get(base) : null)}</div>
            ))}
            <div className="w-[110px]">
              <span className={`tnum font-mono text-[20px] ${hit === null ? 'text-ink-600' : 'text-ink-100'}`}>
                {hit === null ? '—' : `${(hit * 100).toFixed(1)}%`}
              </span>
              {baseHit !== null && hit !== null && (
                <div className="tnum font-mono text-[11px] text-ink-500">{((hit - baseHit) * 100).toFixed(1)} pts</div>
              )}
            </div>
            {note(e) && <span className="font-mono text-[11px] text-cost">{note(e)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function DeltaChip({ children, tone }: { children: ReactNode; tone: 'cost' | 'neutral' }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`tnum rounded-full px-2.5 py-0.5 font-mono text-[12px] ${
        tone === 'cost' ? 'bg-cost/15 text-cost' : 'bg-signal/15 text-signal'
      }`}
    >
      {children}
    </motion.span>
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
  const max = Math.max(a.metrics.modelRequests, b.metrics.modelRequests);
  const width = VIZ_W;
  const pitch = width / max;
  const shownCount = mode === 'A' ? a.metrics.modelRequests : b.metrics.modelRequests;
  const extraFrom = a.metrics.modelRequests;
  const extraX = extraFrom * pitch;
  return (
    <div className="relative" style={{ width, height: 72 }}>
      <svg width={width} height={72} className="overflow-visible">
        {Array.from({ length: max }, (_, i) => {
          const visible = i < shownCount;
          const extra = i >= extraFrom;
          return (
            <motion.rect
              key={i}
              x={i * pitch}
              width={Math.max(2, pitch - 3.5)}
              rx={1}
              initial={false}
              animate={{
                y: visible ? 12 : 44,
                height: visible ? 48 : 16,
                fill: !visible ? pal.off : extra && mode !== 'A' ? pal.cost : pal.on,
              }}
              transition={{ delay: extra ? (i - extraFrom) * 0.035 : 0, duration: 0.35, ease: 'easeOut' }}
            />
          );
        })}
        {/* baseline boundary */}
        <line x1={extraX - 1.5} x2={extraX - 1.5} y1={0} y2={72} stroke="rgb(var(--ink-400))" strokeDasharray="3 3" />
      </svg>
      <span className="absolute -bottom-5 font-mono text-[10px] text-ink-500" style={{ left: extraX - 60 }}>
        A ends · {a.metrics.modelRequests}
      </span>
      <AnimatePresence>
        {mode === 'AB' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-6 flex items-center"
            style={{ left: extraX, width: width - extraX }}
          >
            <div className="h-2 flex-1 border-x border-t border-cost/70" />
            <span className="px-2 font-mono text-[11px] text-cost">+{b.metrics.modelRequests - a.metrics.modelRequests}</span>
            <div className="h-2 flex-1 border-x border-t border-cost/70" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RuntimeViz({ a, b, mode }: { a: Run; b: Run; mode: Mode }) {
  const width = VIZ_W;
  const maxSec = Math.ceil(Math.max(a.metrics.runtimeSeconds, b.metrics.runtimeSeconds) / 300) * 300; // round to 5 min
  const x = (s: number) => (s / maxSec) * width;
  const aX = x(a.metrics.runtimeSeconds);
  const bX = x(b.metrics.runtimeSeconds);
  const shownX = mode === 'A' ? aX : bX;
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
      {/* baseline portion */}
      <motion.div
        className="absolute top-[18px] h-[20px] rounded-l-full bg-ink-200"
        initial={false}
        animate={{ width: Math.min(shownX, aX), borderTopRightRadius: mode === 'A' ? 999 : 0, borderBottomRightRadius: mode === 'A' ? 999 : 0 }}
        transition={{ duration: 1.2, ease: EASE }}
      />
      {/* extra runtime */}
      <motion.div
        className="absolute top-[18px] h-[20px] rounded-r-full bg-cost shadow-[0_0_24px_-2px_rgb(var(--cost)/0.55)]"
        style={{ left: aX }}
        initial={false}
        animate={{ width: mode === 'A' ? 0 : bX - aX, opacity: mode === 'A' ? 0 : 1 }}
        transition={{ duration: 1.8, ease: EASE }}
      />
      <div className="absolute top-[8px] h-[40px] border-l border-dashed border-ink-400" style={{ left: aX }} />
      <AnimatePresence>
        {mode === 'AB' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-5 flex items-center"
            style={{ left: aX, width: bX - aX }}
          >
            <div className="h-2 flex-1 border-x border-t border-cost/70" />
            <span className="px-2 font-mono text-[11px] text-cost">+{b.metrics.runtimeSeconds - a.metrics.runtimeSeconds}s</span>
            <div className="h-2 flex-1 border-x border-t border-cost/70" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

