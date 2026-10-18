// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card, Mono, Screen } from '../ui';
import { fmtInt, story } from '../story';
import recorded from '../data/live-recorded.json';

type Ev =
  | { t: number; kind: 'call'; n: number }
  | { t: number; kind: 'look'; tool: string }
  | { t: number; kind: 'workspace'; action: string; ok: boolean; title: string | null; reason: string | null };
type Save = Extract<Ev, { kind: 'workspace' }>;
type Draft = { title: string; job: string | null; cited: number | null; unresolved: number | null };
type Result = { status: string; seconds: number; requests: number | null; checks: Record<string, boolean | null>; drafts: Draft[] };
type Phase = 'idle' | 'starting' | 'running' | 'grading' | 'done' | 'failed';
type Mode = 'live' | 'recorded';

const REPLAY_SPEED = 2;
const LIVE_LAG = 0.6; // seconds the live view runs behind the log, so packets start at the start
const TRAVEL = 0.75; // seconds (on screen) a packet takes between two boxes
const GLOW = 1.1; // seconds (on screen) a box keeps glowing after its event
const STAGGER = 380; // ms between grades landing
const LAND = 700; // ms for a graded draft to reach the answer key

// The answer key for round 1 (Exam slide): two jobs to find, one to leave out.
const KEY: { job: string; label: string; want: 'found' | 'skipped' }[] = [
  { job: 'receipts', label: 'Filing scanned receipts', want: 'found' },
  { job: 'email', label: 'Saving email attachments', want: 'found' },
  { job: 'printer', label: 'One-off printer setup', want: 'skipped' },
];
const captures = story.history.frames.filter((f) => f.phase === 1).length;
const recEvents = recorded.events as Ev[];
const recEnd = recEvents[recEvents.length - 1].t + TRAVEL * REPLAY_SPEED + 0.5; // the last packet lands first

/** What an event means, in words, and what it is underneath. */
function say(e: Ev): { text: string; tech: string } {
  if (e.kind === 'call') return { text: 'thinks: asks the AI model', tech: `model call ${e.n}` };
  if (e.kind === 'look') return e.tool === 'bash' ? { text: "searches Morgan's screens", tech: 'bash → screenpipe API' } : { text: 'rereads its notes', tech: e.tool };
  if (e.action === 'start') return { text: 'opens a Workflows round', tech: 'workflow_workspace start' };
  if (e.action === 'context') return { text: 'reads what Workflows already knows', tech: 'workflow_workspace context' };
  if (e.action === 'finish') return { text: 'hands its jobs to the next agent', tech: 'workflow_workspace finish' };
  if (e.action === 'propose') return e.ok ? { text: `saves a job: ${e.title ?? ''}`, tech: 'propose → saved' } : { text: `screenpipe refuses the save: ${e.reason ?? ''}`, tech: 'propose → refused' };
  return { text: e.action, tech: `workflow_workspace ${e.action}` };
}

/** Animation clock (ms); one source for every moving part, so nothing steps. */
function useFrame() {
  const [frame, setFrame] = useState(() => performance.now());
  useEffect(() => {
    let id = 0;
    const loop = (t: number) => { setFrame(t); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return frame;
}

const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Live() {
  const frame = useFrame();
  const [mode, setMode] = useState<Mode>('recorded');
  const [recStart, setRecStart] = useState<number | null>(null);
  const [live, setLive] = useState<{ phase: Phase; events: Ev[]; elapsed: number; at: number }>({ phase: 'idle', events: [], elapsed: 0, at: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [revealAt, setRevealAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runner, setRunner] = useState(false);
  const poll = useRef<number>();

  // Where the run is, in run seconds, and what has happened by then.
  const speed = mode === 'recorded' ? REPLAY_SPEED : 1;
  const liveMoving = live.phase === 'starting' || live.phase === 'running';
  const now =
    mode === 'recorded'
      ? recStart === null ? 0 : Math.min(((frame - recStart) / 1000) * REPLAY_SPEED, recEnd)
      : Math.max(0, (liveMoving ? live.elapsed + (frame - live.at) / 1000 : live.elapsed) - LIVE_LAG);
  const all = mode === 'recorded' ? (recStart === null ? [] : recEvents) : live.events;
  const events = mode === 'recorded' || liveMoving ? all.filter((e) => e.t <= now) : all;
  const revealMs = revealAt === null ? -1 : frame - revealAt;
  const revealed = (i: number) => revealMs >= LAND + i * STAGGER;
  const revealDone = revealAt !== null && revealed(KEY.length);

  const raw: Phase =
    mode === 'recorded'
      ? recStart === null ? 'idle' : now < (recEvents[0]?.t ?? 0) ? 'starting' : now < recEnd ? 'running' : 'grading'
      : live.phase === 'running' && events.length === 0 ? 'starting' : live.phase;
  const phase: Phase = result ? (revealDone ? 'done' : 'grading') : raw;

  useEffect(() => {
    fetch('/api/health').then((r) => setRunner(r.ok), () => setRunner(false));
    // Started earlier in the talk: pick the live run back up when the slide is shown again.
    fetch('/api/live/state').then((r) => r.json()).then((s) => { if (s.phase && s.phase !== 'idle') follow(); }, () => {});
    return () => clearInterval(poll.current);
  }, []);

  // The recorded run reaches its end: grade it.
  const recEnded = mode === 'recorded' && recStart !== null && now >= recEnd;
  useEffect(() => {
    if (recEnded && !result) { setResult(recorded.result as Result); setRevealAt(performance.now()); }
  }, [recEnded, result]);

  const reset = (m: Mode) => {
    clearInterval(poll.current);
    setMode(m); setResult(null); setRevealAt(null); setError(null); setRecStart(null);
    setLive({ phase: 'idle', events: [], elapsed: 0, at: performance.now() });
  };

  const playRecorded = () => { reset('recorded'); setRecStart(performance.now()); };

  const runLive = async () => {
    reset('live');
    setLive({ phase: 'starting', events: [], elapsed: 0, at: performance.now() });
    const r = await fetch('/api/live/start', { method: 'POST' }).catch(() => null);
    if (!r?.ok) { setLive((l) => ({ ...l, phase: 'failed' })); setError('The live runner did not start.'); return; }
    follow();
  };

  function follow() {
    clearInterval(poll.current);
    setMode('live');
    const tick = async () => {
      const s = await fetch('/api/live/state').then((x) => x.json()).catch(() => null);
      if (!s) return;
      setLive({ phase: s.phase, events: s.events, elapsed: s.elapsed, at: performance.now() });
      if (s.phase === 'done') { setResult(s.result); setRevealAt((v) => v ?? performance.now()); clearInterval(poll.current); }
      if (s.phase === 'failed') { setError(s.error); clearInterval(poll.current); }
    };
    tick();
    poll.current = window.setInterval(tick, 500);
  }

  // Motion, all derived from the clock: packets in flight, glows that fade.
  const travel = TRAVEL * speed;
  const flying = (kind: Ev['kind']) => (still || raw !== 'running' ? [] : events.filter((e) => e.kind === kind && now - e.t >= 0 && now - e.t < travel));
  const glow = (kind: Ev['kind']) => Math.max(0, ...events.filter((e) => e.kind === kind).map((e) => 1 - (now - e.t) / (GLOW * speed)));
  const lookGlow = phase === 'running' ? glow('look') : 0;
  const callGlow = phase === 'running' ? glow('call') : 0;
  const saveGlow = phase === 'running' ? glow('workspace') : 0;

  const calls = events.filter((e) => e.kind === 'call').length;
  const looks = events.filter((e) => e.kind === 'look').length;
  const saves = events.map((e, i) => ({ e, i })).filter((x): x is { e: Save; i: number } => x.e.kind === 'workspace' && x.e.action === 'propose');
  const current = events.length ? say(events[events.length - 1]) : null;
  const busy = phase === 'starting' || phase === 'running' || phase === 'grading';
  const graded = (result?.drafts ?? []).filter((d) => d.title);
  const gradePackets = still || revealAt === null ? [] : graded.map((d, i) => ({ key: `g${i}`, p: (revealMs - i * STAGGER) / LAND, bad: !d.job })).filter((x) => x.p >= 0 && x.p < 1);

  return (
    <Screen
      title="Live: how the exam runs, one question at a time"
      lede="One agent, one question, on this laptop. The full benchmark repeats this for every agent, round and version."
      actions={
        <>
          <Button onClick={playRecorded} disabled={busy && mode === 'live'} active={busy && mode === 'recorded'}>Recorded run</Button>
          <Button onClick={runLive} disabled={!runner || busy} active={busy && mode === 'live'} title={runner ? undefined : 'start the local runner: npm run server'}>Run live</Button>
        </>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className={`-mb-2 grid shrink-0 ${COLS}`}>
          <Bracket label="our eval harness" />
          <span />
          <div className="flex items-end justify-center pb-1 font-sans text-base font-medium text-muted">screenpipe's own agent, unchanged</div>
          <span />
          <div className="col-span-3"><Bracket label="our eval harness" /></div>
        </div>

        <div className={`grid h-[400px] shrink-0 ${COLS}`}>
          <Box title="1 · We load Morgan's week into a private screenpipe" on={lookGlow > 0.25}>
            <div className="relative mt-4 flex-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="absolute overflow-hidden rounded-md border border-ink bg-surface" style={{ left: `${i * 10}%`, top: `${i * 12}%`, width: '70%', height: '50%' }}>
                  <div className="flex gap-1.5 border-b border-line px-3 py-1.5">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 rounded-full border border-trace" />)}</div>
                  <div className="space-y-1.5 p-2.5">{[80, 55, 70].map((w, k) => <div key={k} className="h-1.5 rounded-sm bg-subtle" style={{ width: `${w}%` }} />)}</div>
                  {i === 2 && lookGlow > 0 && (
                    <div className="absolute inset-x-0 h-5 bg-phosphor" style={{ top: `${18 + ((now * 1.2) % 1) * 70}%`, opacity: 0.55 * lookGlow, mixBlendMode: 'multiply' }} />
                  )}
                </div>
              ))}
            </div>
            <div className="font-sans text-xl">searched <span className="font-mono">{looks}</span> times</div>
            <Mono className="mt-1 block text-sm text-faint">{fmtInt(captures)} captures · same snapshot every run · API on 127.0.0.1</Mono>
          </Box>

          <Connector packets={flying('look').map((e) => ({ key: `l${e.t}`, p: (now - e.t) / travel }))} />

          <Box title="2 · The real Discover agent answers, sandboxed" on={phase === 'running'}>
            <div className="mt-3 min-h-[96px] font-serif text-[26px] leading-snug">
              {phase === 'idle' && <span className="text-muted">Press Run live.</span>}
              {phase === 'starting' && <span className="text-muted">Loading Morgan's week, same data every run…</span>}
              {phase === 'running' && current && <span key={events.length} className="line-clamp-3 animate-rise">{current.text}</span>}
              {phase === 'grading' && <span>Done. Grading…</span>}
              {phase === 'done' && <span>Done in {Math.round(result?.seconds ?? now)} s.</span>}
              {phase === 'failed' && <span>The run stopped. Switch to the recorded run.</span>}
            </div>
            <div className="relative mt-auto overflow-hidden rounded-md border border-ink px-5 py-4">
              <div className="absolute inset-0 bg-phosphor" style={{ opacity: callGlow }} />
              <div className="relative flex items-baseline justify-between">
                <span className="font-sans text-lg">AI model</span>
                <span className="font-mono text-4xl">{calls}</span>
              </div>
              <Mono className="relative block text-sm text-muted">calls · Claude Sonnet 5 via screenpipe cloud</Mono>
            </div>
            <Mono className="mt-3 block text-sm text-faint">Pi agent · tools in a sandbox with no network</Mono>
          </Box>

          <Connector packets={flying('workspace').map((e) => ({ key: `w${e.t}`, p: (now - e.t) / travel, bad: !(e as Save).ok }))} />

          <Box title="3 · We log every call and save" on={saveGlow > 0.25}>
            <ul className="mt-3 flex-1 space-y-2 overflow-hidden">
              {saves.length === 0 && <li className="font-serif text-xl italic text-muted">nothing saved yet</li>}
              {saves.slice(-3).map(({ e, i }) => (
                <li key={i} className="flex gap-3 animate-rise">
                  <span className="w-6 shrink-0 text-center font-sans text-xl font-semibold">{e.ok ? '✓' : '✕'}</span>
                  <div className={`line-clamp-2 font-serif text-xl leading-snug ${e.ok ? '' : 'text-muted'}`}>{e.ok ? e.title : `refused: ${e.reason}`}</div>
                </li>
              ))}
            </ul>
            <Mono className="block text-sm text-faint">logged: {calls} AI calls · {looks} searches · {saves.length} saves</Mono>
          </Box>

          <Connector packets={gradePackets} />

          <ReportCard result={result} revealed={revealed} done={revealDone} calls={calls} seconds={result?.seconds ?? null} />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <div className="flex items-baseline gap-8">
            <span className={`rounded-sm px-2 py-0.5 font-sans text-base font-medium ${mode === 'live' ? 'bg-ink text-bone' : 'border border-ink'}`}>
              {mode === 'live' ? '● LIVE · this Mac' : `recorded run · ${REPLAY_SPEED}× speed`}
            </span>
            <span className="font-mono text-2xl tabular-nums">{fmtClock(now)}</span>
            <span className="font-sans text-lg text-muted">{saves.filter((s) => s.e.ok).length} saved · {saves.filter((s) => !s.e.ok).length} refused</span>
            {error && <span className="truncate font-mono text-sm text-ink">{error}</span>}          </div>
          <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-hidden">
            {events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind !== 'call').slice(-4).map(({ e, i }) => {
              const s = say(e);
              return (
                <li key={i} className="grid grid-cols-[64px_1fr_280px] items-baseline gap-4 animate-rise">
                  <Mono className="text-base text-faint">{fmtClock(e.t)}</Mono>
                  <span className="truncate font-serif text-xl">{s.text}</span>
                  <Mono className="truncate text-right text-sm text-muted">{s.tech}</Mono>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </Screen>
  );
}

const COLS = 'grid-cols-[0.85fr_72px_1.1fr_72px_1.15fr_72px_1.05fr]';
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Box({ title, on, children }: { title: string; on: boolean; children: ReactNode }) {
  return (
    <Card className={`flex flex-col p-6 transition-colors duration-500 ${on ? 'border-ink' : ''}`}>
      <div className="font-sans text-xl font-medium leading-snug">{title}</div>
      {children}
    </Card>
  );
}

/** The grade and the cost: the two numbers the benchmark compares between versions. */
function ReportCard({ result, revealed, done, calls, seconds }: { result: Result | null; revealed: (i: number) => boolean; done: boolean; calls: number; seconds: number | null }) {
  const credited = new Set((result?.drafts ?? []).map((d) => d.job).filter(Boolean));
  const anyCited = credited.size > 0;
  const draftFor = (job: string) => result?.drafts.find((d) => d.job === job);
  const wanted = KEY.filter((k) => k.want === 'found');
  const found = wanted.filter((k) => credited.has(k.job)).length;
  const cited = (result?.drafts ?? []).reduce((n, d) => n + (d.cited ?? 0), 0);
  const missing = (result?.drafts ?? []).reduce((n, d) => n + (d.unresolved ?? 0), 0);

  return (
    <Box title="4 · We grade it and count the cost" on={done}>
      <ul className="mt-3 space-y-3">
        {KEY.map((k, i) => {
          const shown = !!result && revealed(i);
          const ok = k.want === 'found' ? credited.has(k.job) : anyCited && !credited.has(k.job);
          const d = draftFor(k.job);
          return (
            <li key={k.job} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                {!shown ? (
                  <span className="h-6 w-6 rounded-full border border-line" />
                ) : ok ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink font-sans text-base text-bone animate-stamp" aria-label="pass">✓</span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-ink font-sans text-base animate-stamp" aria-label="not credited">?</span>
                )}
              </span>
              <div className="min-w-0">
                <div className="font-serif text-xl leading-snug">{k.label}</div>
                <Mono className="block truncate text-sm text-muted">
                  {!shown ? `should be ${k.want}` : k.want === 'skipped' ? (ok ? 'skipped, as it should be' : 'no cited screen to tell') : d ? `found · ${d.cited} screens cited` : 'not credited: no cited screen'}
                </Mono>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <div className="font-mono text-4xl tabular-nums">{done ? `${found}/${wanted.length}` : '–'}</div>
          <div className="font-sans text-base text-muted">jobs found</div>
        </div>
        <div>
          <div className="font-mono text-4xl tabular-nums">{calls}</div>
          <div className="font-sans text-base text-muted">AI calls{seconds ? ` · ${Math.round(seconds)} s` : ''}</div>
        </div>
      </div>
      <Mono className="mt-2 block text-sm text-faint">{done && cited ? `${cited} screens cited · ${cited - missing} exist` : 'right answers and cost: what we compare'}</Mono>
    </Box>
  );
}

function Bracket({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-sans text-base font-medium">{label}</span>
      <span className="mt-1 h-2.5 w-full rounded-t-sm border-x-2 border-t-2 border-ink" />
    </div>
  );
}

/** A line between two boxes with packets travelling along it; a refused save travels as ✕. */
function Connector({ packets }: { packets: { key: string; p: number; bad?: boolean }[] }) {
  const active = packets.length > 0;
  const fade = (p: number) => Math.min(1, p / 0.12, (1 - p) / 0.12);
  return (
    <div className="relative mx-1.5">
      <div className={`absolute inset-x-0 top-1/2 h-px transition-colors duration-300 ${active ? 'bg-ink' : 'bg-trace'}`} />
      <svg className={`absolute right-[-3px] top-1/2 -translate-y-1/2 transition-colors duration-300 ${active ? 'text-ink' : 'text-trace'}`} width="8" height="12" viewBox="0 0 8 12" aria-hidden>
        <path d="M1 1l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {packets.map((x) => (
        <span
          key={x.key}
          className={`absolute top-1/2 flex items-center justify-center rounded-full border border-ink ${x.bad ? 'h-5 w-5 bg-surface font-sans text-[11px] font-semibold' : 'h-3.5 w-3.5 bg-phosphor'}`}
          style={{ left: `${x.p * 100}%`, transform: 'translate(-50%, -50%)', opacity: fade(x.p) }}
        >
          {x.bad ? '✕' : null}
        </span>
      ))}
    </div>
  );
}
