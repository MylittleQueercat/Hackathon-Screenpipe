// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Choice, Screen } from '../ui';
import { AGENTS, PHASE_NAME, SIDE_NAME, story, type Phase, type Side, type StreamEvent } from '../story';

const PLAY_SECONDS = 16; // the longest lane of a phase replays in this many seconds
const ACTIVE_WINDOW = 4; // recorded seconds an agent counts as executing after its last event

export default function Agents() {
  const [phase, setPhase] = useState(1);
  const [now, setNow] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number>();
  const lanes = (['base', 'stack'] as Side[]).map((s) => ({ side: s, p: story[s].find((x) => x.phase === phase)! }));
  const span = Math.max(...lanes.map((l) => l.p.seconds), 1);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const tick = (t: number) => {
      const recorded = ((t - start) / 1000) * (span / PLAY_SECONDS);
      if (recorded >= span) { setNow(Infinity); setPlaying(false); return; }
      setNow(recorded);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current!);
  }, [playing, span]);

  const changePhase = (p: number) => { setPlaying(false); setNow(Infinity); setPhase(p); };

  return (
    <Screen
      title="Four agents read it and write workflows"
      lede="screenpipe's own Workflows agents, run on the same history twice: unchanged, and with our changes. Replayed from their request logs."
      actions={
        <>
          <Choice value={phase} onChange={changePhase} options={[1, 2, 3].map((p) => ({ value: p, label: PHASE_NAME[p] }))} />
          <Button active={playing} onClick={() => { setNow(0); setPlaying(true); }}>{playing ? 'Replaying…' : 'Replay'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {lanes.map(({ side, p }) => <Lane key={side} side={side} p={p} span={span} now={now} />)}
      </div>
      <div className="mt-3 flex justify-between font-mono text-[11px] text-faint">
        <span>0 s</span>
        <span>one mark per model request · ✕ the Workflows API refused a write · ▲ a reply cut off at its length limit</span>
        <span>{Math.round(span)} s of agent time</span>
      </div>
    </Screen>
  );
}

function Lane({ side, p, span, now }: { side: Side; p: Phase; span: number; now: number }) {
  const seen = p.stream.filter((e) => e.t <= now);
  const count = (k: StreamEvent['kind']) => seen.filter((e) => e.kind === k).length;
  const refused = seen.filter((e) => e.kind === 'workflows' && !e.ok);
  const last = refused[refused.length - 1];
  const live = Number.isFinite(now);
  const active = (a: string) => live && seen.some((e) => e.agent === a && now - e.t < ACTIVE_WINDOW);
  const idle = p.requests === 0;

  return (
    <Card className="grid grid-cols-[1fr_220px]">
      <div className="min-w-0 border-r border-line px-6 py-4">
        <div className="mb-2 font-sans text-base font-medium">{SIDE_NAME[side]}</div>
        {idle ? (
          <div className="flex h-[136px] items-center font-serif text-2xl italic text-muted">No cycle ran: nothing new was recorded.</div>
        ) : (
          <div className="space-y-1">
            {AGENTS.map((a) => (
              <div key={a} className="grid grid-cols-[96px_1fr] items-center gap-3">
                <span className={`rounded-sm px-2 py-0.5 font-sans text-sm transition-colors ${active(a) ? 'bg-phosphor text-ink' : 'text-muted'}`}>
                  {a[0].toUpperCase() + a.slice(1)}
                </span>
                <div className="relative h-7 border-b border-line">
                  {p.stream.filter((e) => e.agent === a && e.t <= now).map((e, i) => <Tick key={i} e={e} span={span} />)}
                  {live && <span className="absolute -top-1 bottom-0 w-px bg-ink" style={{ left: `${(now / span) * 100}%` }} />}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 h-5 truncate font-mono text-xs text-muted">{last ? `${last.agent} · ${last.action} refused: ${last.reply}` : ''}</div>
      </div>
      <dl className="grid grid-cols-2 content-center gap-x-4 gap-y-3 px-5 py-4">
        <Stat label="Requests" value={count('request')} />
        <Stat label="Seconds" value={Math.round(live ? Math.min(now, p.seconds) : p.seconds)} />
        <Stat label="Refused writes" value={refused.length} />
        <Stat label="Cut replies" value={count('cut')} />
      </dl>
    </Card>
  );
}

function Tick({ e, span }: { e: StreamEvent; span: number }) {
  const left = `${(e.t / span) * 100}%`;
  if (e.kind === 'request') return <span className="absolute bottom-0 h-4 w-px bg-ink" style={{ left }} />;
  if (e.kind === 'workflows' && !e.ok) return <span className="absolute -top-0.5 -translate-x-1/2 font-mono text-[10px] leading-none text-ink" style={{ left }}>✕</span>;
  if (e.kind === 'cut') return <span className="absolute -top-0.5 -translate-x-1/2 font-mono text-[9px] leading-none text-ink" style={{ left }}>▲</span>;
  return null;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-sans text-xs text-muted">{label}</dt>
      <dd className="font-mono text-2xl">{value}</dd>
    </div>
  );
}
