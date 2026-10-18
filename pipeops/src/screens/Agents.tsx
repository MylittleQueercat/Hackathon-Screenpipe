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
      <div className="flex h-full flex-col gap-4">
        <div className="flex shrink-0 items-center gap-8 font-sans text-base text-muted">
          <span className="flex items-center gap-2"><span className="inline-block h-5 w-[2px] bg-ink" /> one model request</span>
          <span className="flex items-center gap-2"><span className="font-sans text-[15px] font-semibold text-ink">✕</span> the Workflows API refused a write</span>
          <span className="flex items-center gap-2"><span className="font-mono text-[13px] text-ink">▲</span> a reply cut off at its length limit</span>
          <span className="flex items-center gap-2"><span className="rounded-sm bg-phosphor px-2 font-sans text-sm text-ink">Agent</span> working now, during a replay</span>
        </div>
        {lanes.map(({ side, p }) => <Lane key={side} side={side} p={p} span={span} now={now} />)}
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
    <Card className="grid min-h-0 flex-1 grid-cols-[1fr_260px]">
      <div className="flex min-w-0 flex-col border-r border-line px-6 py-3">
        <div className="font-sans text-xl font-medium">{SIDE_NAME[side]}</div>
        {idle ? (
          <div className="flex flex-1 items-center font-serif text-3xl italic text-muted">No cycle ran: nothing new was recorded.</div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-0.5">
            {AGENTS.map((a) => (
              <div key={a} className="grid grid-cols-[110px_1fr] items-center gap-3">
                <span className={`rounded-sm px-2 py-0.5 font-sans text-lg transition-colors ${active(a) ? 'bg-phosphor text-ink' : 'text-muted'}`}>
                  {a[0].toUpperCase() + a.slice(1)}
                </span>
                <div className="relative h-[44px] border-b border-line">
                  {p.stream.filter((e) => e.agent === a && e.t <= now).map((e, i) => <Tick key={i} e={e} span={span} />)}
                  {live && <span className="absolute -top-1 bottom-0 w-px bg-ink" style={{ left: `${(now / span) * 100}%` }} />}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <span />
              <div className="relative h-5 font-mono text-sm text-faint">
                {axisTicks(span).map((t) => (
                  <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / span) * 100}%` }}>{t} s</span>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="mt-1 h-5 truncate font-mono text-sm text-muted">{last ? `Last refusal · ${last.agent}: ${last.reply}` : ''}</div>
      </div>
      <dl className="grid grid-cols-2 content-center gap-x-4 gap-y-5 px-6 py-4">
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
  // Three sub-lanes so marks never sit on each other: refusals on top, cut replies in the middle, requests at the bottom.
  if (e.kind === 'request') return <span className="absolute bottom-0 h-[14px] w-[2px] bg-ink" style={{ left }} />;
  if (e.kind === 'workflows' && !e.ok) return <span className="absolute top-0 -translate-x-1/2 font-sans text-[15px] font-semibold leading-none text-ink" style={{ left }}>✕</span>;
  if (e.kind === 'cut') return <span className="absolute top-[15px] -translate-x-1/2 font-mono text-[12px] leading-none text-ink" style={{ left }}>▲</span>;
  return null;
}

function axisTicks(span: number) {
  const step = span > 400 ? 100 : span > 200 ? 50 : 25;
  return Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step).filter((t) => t < span - step / 3);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-sans text-sm text-muted">{label}</dt>
      <dd className="font-mono text-4xl">{value}</dd>
    </div>
  );
}
