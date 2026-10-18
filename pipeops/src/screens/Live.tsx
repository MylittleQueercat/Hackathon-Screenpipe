// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Mark, Mono, Screen } from '../ui';
import { fmtInt, story } from '../story';
import recorded from '../data/live-recorded.json';

type Ev =
  | { t: number; kind: 'call'; n: number }
  | { t: number; kind: 'look'; tool: string }
  | { t: number; kind: 'workspace'; action: string; ok: boolean; title: string | null; reason: string | null };
type Result = { status: string; seconds: number; requests: number | null; checks: Record<string, boolean | null>; drafts: { title: string; job: string | null }[] };
type Phase = 'idle' | 'starting' | 'running' | 'grading' | 'done' | 'failed';
type Mode = 'live' | 'recorded';

const REPLAY_SPEED = 2;
const RECENT = 1.6; // seconds a node stays lit after its event
// The answer key for round 1 (Exam slide): two jobs to find, one to leave out.
const KEY: { job: string; label: string; want: 'found' | 'skipped' }[] = [
  { job: 'receipts', label: 'Filing scanned receipts', want: 'found' },
  { job: 'email', label: 'Saving email attachments', want: 'found' },
  { job: 'printer', label: 'One-off printer setup', want: 'skipped' },
];
const JOB: Record<string, string> = { receipts: 'receipts', email: 'email attachments', printer: 'printer one-off' };
const captures = story.history.frames.filter((f) => f.phase === 1).length;

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

export default function Live() {
  const [mode, setMode] = useState<Mode>('recorded');
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<Ev[]>([]);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runner, setRunner] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    fetch('/api/health').then((r) => setRunner(r.ok), () => setRunner(false));
    // Started earlier in the talk: pick the live run back up when the slide is shown again.
    fetch('/api/live/state').then((r) => r.json()).then((s) => { if (s.phase && s.phase !== 'idle') follow(); }, () => {});
    return () => clearInterval(timer.current);
  }, []);

  const reset = (m: Mode) => {
    clearInterval(timer.current);
    setMode(m); setEvents([]); setResult(null); setError(null); setNow(0);
  };

  const playRecorded = () => {
    reset('recorded');
    const all = recorded.events as Ev[];
    const end = all[all.length - 1].t + 1;
    const start = performance.now();
    setPhase('starting');
    timer.current = window.setInterval(() => {
      const t = ((performance.now() - start) / 1000) * REPLAY_SPEED;
      setNow(t);
      setEvents(all.filter((e) => e.t <= t));
      if (t < end) setPhase(t < all[0].t ? 'starting' : 'running');
      else if (t < end + 3) setPhase('grading');
      else { setPhase('done'); setResult(recorded.result as Result); clearInterval(timer.current); }
    }, 100);
  };

  const runLive = async () => {
    reset('live');
    setPhase('starting');
    const r = await fetch('/api/live/start', { method: 'POST' }).catch(() => null);
    if (!r?.ok) { setPhase('failed'); setError('The live runner did not start.'); return; }
    follow();
  };

  function follow() {
    clearInterval(timer.current);
    setMode('live');
    timer.current = window.setInterval(async () => {
      const s = await fetch('/api/live/state').then((x) => x.json()).catch(() => null);
      if (!s) return;
      setNow(s.elapsed); setEvents(s.events); setPhase(s.phase);
      if (s.phase === 'done') { setResult(s.result); clearInterval(timer.current); }
      if (s.phase === 'failed') { setError(s.error); clearInterval(timer.current); }
    }, 500);
  }

  const last = (k: Ev['kind']) => [...events].reverse().find((e) => e.kind === k);
  const lit = (k: Ev['kind']) => phase === 'running' && !!last(k) && now - last(k)!.t < RECENT;
  const calls = events.filter((e) => e.kind === 'call').length;
  const looks = events.filter((e) => e.kind === 'look').length;
  const saves = events.filter((e): e is Extract<Ev, { kind: 'workspace' }> => e.kind === 'workspace' && e.action === 'propose');
  const current = events.length ? say(events[events.length - 1]) : null;
  const busy = phase === 'starting' || phase === 'running' || phase === 'grading';
  const jobOf = (title: string | null) => result?.drafts.find((d) => d.title === title)?.job ?? null;
  // Credited only through cited screens, as the exam's grader does it.
  const credited = new Set(result?.drafts.map((d) => d.job).filter(Boolean));
  const uncited = result ? result.drafts.filter((d) => !d.job).length : 0;
  const verdict = (k: (typeof KEY)[number]) => (!result ? undefined : k.want === 'found' ? (credited.has(k.job) ? true : null) : credited.size ? !credited.has(k.job) : null);

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
        <div className="-mb-2 grid shrink-0 grid-cols-[0.9fr_48px_1.15fr_48px_1.2fr_48px_1fr]">
          <Bracket label="our eval harness" />
          <span />
          <div className="flex items-end justify-center pb-1 font-sans text-base font-medium text-muted">screenpipe's own agent, unchanged</div>
          <span />
          <div className="col-span-3"><Bracket label="our eval harness" /></div>
        </div>
        <div className="grid h-[400px] shrink-0 grid-cols-[0.9fr_48px_1.15fr_48px_1.2fr_48px_1fr]">
          <Card className={`flex flex-col p-6 transition-colors ${lit('look') ? 'border-ink' : ''}`}>
            <div className="font-sans text-xl font-medium leading-snug">1 · We load Morgan's week into a private screenpipe</div>
            <div className="relative mt-5 flex-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="absolute rounded-md border border-ink bg-surface" style={{ left: `${i * 10}%`, top: `${i * 12}%`, width: '70%', height: '50%' }}>
                  <div className="flex gap-1.5 border-b border-line px-3 py-1.5">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 rounded-full border border-trace" />)}</div>
                  <div className="space-y-1.5 p-2.5">{[80, 55, 70].map((w, k) => <div key={k} className="h-1.5 rounded-sm bg-subtle" style={{ width: `${w}%` }} />)}</div>
                </div>
              ))}
              {lit('look') && <span className="absolute right-3 top-3 h-3 w-3 rounded-full bg-phosphor" />}
            </div>
            <div className="font-sans text-xl">searched <span className="font-mono">{looks}</span> times</div>
            <Mono className="mt-1 block text-sm text-faint">{fmtInt(captures)} captures · same snapshot every run · API on 127.0.0.1</Mono>
          </Card>
          <Arrow on={lit('look')} />
          <Card className={`flex flex-col p-6 ${phase === 'running' ? 'border-ink' : ''}`}>
            <div className="font-sans text-xl font-medium leading-snug">2 · The real Discover agent answers, sandboxed</div>
            <div className="mt-4 min-h-[96px] font-serif text-[26px] leading-snug">
              {phase === 'idle' && <span className="text-muted">Press Run live.</span>}
              {phase === 'starting' && <span className="text-muted">Loading Morgan's week, same data every run…</span>}
              {phase === 'running' && current && <span className="line-clamp-3">{current.text}</span>}
              {phase === 'grading' && <span>Done. Grading…</span>}
              {phase === 'done' && <span>Done in {Math.round(result?.seconds ?? now)} s.</span>}
              {phase === 'failed' && <span>The run stopped. Switch to the recorded run.</span>}
            </div>
            <div className={`mt-auto rounded-md border px-5 py-4 transition-colors ${lit('call') ? 'border-ink bg-phosphor' : 'border-line'}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-lg">AI model</span>
                <span className="font-mono text-4xl">{calls}</span>
              </div>
              <Mono className="block text-sm text-muted">calls · Claude Sonnet 5 via screenpipe cloud</Mono>
            </div>
            <Mono className="mt-3 block text-sm text-faint">Pi agent · tools in a sandbox with no network</Mono>
          </Card>
          <Arrow on={lit('workspace')} />
          <Card className={`flex flex-col p-6 transition-colors ${lit('workspace') ? 'border-ink' : ''}`}>
            <div className="font-sans text-xl font-medium leading-snug">3 · We log every call and save</div>
            <ul className="mt-3 flex-1 space-y-2">
              {saves.length === 0 && <li className="font-serif text-xl italic text-muted">nothing saved yet</li>}
              {saves.slice(-3).map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 shrink-0 text-center font-sans text-xl font-semibold">{s.ok ? '✓' : '✕'}</span>
                  <div className="min-w-0">
                    <div className={`line-clamp-2 font-serif text-xl leading-snug ${s.ok ? '' : 'text-muted'}`}>{s.ok ? s.title : `refused: ${s.reason}`}</div>
                    {s.ok && result && <Mono className="text-sm text-muted">{jobOf(s.title) ? `cited screens → ${JOB[jobOf(s.title)!] ?? jobOf(s.title)}` : 'no cited screen yet'}</Mono>}
                  </div>
                </li>
              ))}
            </ul>
            <Mono className="block text-sm text-faint">logged: {calls} AI calls · {looks} searches · {saves.length} saves</Mono>
          </Card>
          <Arrow on={phase === 'grading'} />
          <Card className={`flex flex-col p-6 ${phase === 'done' ? 'border-ink' : ''}`}>
            <div className="font-sans text-xl font-medium leading-snug">4 · We grade against the answer key</div>
            <ul className="mt-4 flex-1 space-y-4">
              {KEY.map((k) => (
                <li key={k.job} className="flex items-start gap-3">
                  <span className="mt-1">{result ? <Mark pass={verdict(k)} /> : <span className="inline-block h-5 w-5 rounded-full border border-line" />}</span>
                  <div>
                    <div className="font-serif text-xl leading-snug">{k.label}</div>
                    <Mono className="text-sm text-muted">should be {k.want}</Mono>
                  </div>
                </li>
              ))}
            </ul>
            {result && uncited > 0 ? (
              <p className="font-serif text-lg leading-snug text-muted">{uncited === result.drafts.length ? 'No draft cites a screen yet' : `${uncited} draft${uncited > 1 ? 's' : ''} cite no screen yet`}, so the exam can't credit {uncited > 1 ? 'them' : 'it'}. Deepen and Review add the evidence.</p>
            ) : (
              <Mono className="block text-sm text-faint">credited only through cited screens</Mono>
            )}
          </Card>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <div className="flex items-baseline gap-8">
            <span className={`rounded-sm px-2 py-0.5 font-sans text-base font-medium ${mode === 'live' ? 'bg-ink text-bone' : 'border border-ink'}`}>
              {mode === 'live' ? '● LIVE · this Mac' : `recorded run · ${REPLAY_SPEED}× speed`}
            </span>
            <span className="font-mono text-2xl">{fmtClock(now)}</span>
            <span className="font-sans text-lg text-muted">{saves.filter((s) => s.ok).length} saved · {saves.filter((s) => !s.ok).length} refused</span>
            {error && <span className="truncate font-mono text-sm text-ink">{error}</span>}
            <span className="ml-auto shrink-0 font-sans text-lg">Full benchmark: 4 agents × 3 rounds × 2 versions <span className="text-muted">→ Result</span></span>
          </div>
          <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-hidden">
            {events.filter((e) => e.kind !== 'call').slice(-4).map((e, i) => {
              const s = say(e);
              return (
                <li key={`${e.t}-${i}`} className="grid grid-cols-[64px_1fr_280px] items-baseline gap-4">
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

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Bracket({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-sans text-base font-medium">{label}</span>
      <span className="mt-1 h-2.5 w-full rounded-t-sm border-x-2 border-t-2 border-ink" />
    </div>
  );
}

function Arrow({ on }: { on: boolean }) {
  return (
    <div className="relative flex items-center justify-center font-mono text-3xl">
      <span className={`transition-colors duration-300 ${on ? 'text-ink' : 'text-faint'}`}>→</span>
      {on && <span className="absolute h-3 w-3 rounded-full bg-phosphor animate-flow" />}
    </div>
  );
}
