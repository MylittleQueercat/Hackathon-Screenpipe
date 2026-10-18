// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Choice, Screen } from '../ui';
import { AGENTS, PHASE_NAME, SIDE_NAME, story, type Phase, type Side } from '../story';

const PLAY_SECONDS = 14; // the longer run of a round replays in this many seconds
const ACTIVE_WINDOW = 4; // recorded seconds an agent counts as working after its last request

export default function Race() {
  const [phase, setPhase] = useState(1);
  const [now, setNow] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number>();
  const base = story.base.find((x) => x.phase === phase)!;
  const stack = story.stack.find((x) => x.phase === phase)!;
  const span = Math.max(base.seconds, stack.seconds, 1);

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

  return (
    <Screen
      title="Same exam, two versions of screenpipe"
      lede={<>Each tick is one AI call. <span className="font-sans font-semibold text-ink">✕</span> is a workflow screenpipe refused to save.</>}
      actions={
        <>
          <Choice value={phase} onChange={(p) => { setPlaying(false); setNow(Infinity); setPhase(p); }} options={[1, 2, 3].map((p) => ({ value: p, label: PHASE_NAME[p] }))} />
          <Button active={playing} onClick={() => { setNow(0); setPlaying(true); }}>{playing ? 'Replaying…' : 'Replay'}</Button>
        </>
      }
    >
      <div className="flex h-full flex-col gap-5">
        <Lane side="base" p={base} span={span} now={now} />
        <Lane side="stack" p={stack} span={span} now={now} vs={base} />
      </div>
    </Screen>
  );
}

function Lane({ side, p, span, now, vs }: { side: Side; p: Phase; span: number; now: number; vs?: Phase }) {
  const live = Number.isFinite(now);
  const done = !live;
  const calls = p.stream.filter((e) => e.kind === 'request' && e.t <= now).length;
  const refused = p.stream.filter((e) => e.kind === 'workflows' && !e.ok && e.t <= now).length;
  const secs = live ? Math.min(now, p.seconds) : p.seconds;
  const working = (a: string) => live && p.stream.some((e) => e.agent === a && e.kind === 'request' && e.t <= now && now - e.t < ACTIVE_WINDOW);
  const idle = p.requests === 0;
  const less = (a: number, z: number) => (a > 0 ? `−${Math.round(((a - z) / a) * 100)}%` : '');

  return (
    <Card className={`grid min-h-0 flex-1 grid-cols-[1fr_600px] ${vs ? 'border-ink' : ''}`}>
      <div className="flex min-w-0 flex-col border-r border-line px-7 py-4">
        <div className="font-sans text-2xl font-medium">{SIDE_NAME[side]}</div>
        {idle ? (
          <div className="flex flex-1 items-center font-serif text-3xl italic text-muted">Nothing new was recorded, so it doesn't start.</div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-1">
            {AGENTS.map((a) => (
              <div key={a} className="grid grid-cols-[120px_1fr] items-center gap-3">
                <span className={`rounded-sm px-2 py-0.5 font-sans text-lg transition-colors ${working(a) ? 'bg-phosphor text-ink' : 'text-muted'}`}>
                  {a[0].toUpperCase() + a.slice(1)}
                </span>
                <div className="relative h-11 border-b border-line">
                  {p.stream.filter((e) => e.agent === a && e.kind === 'request' && e.t <= now).map((e, i) => (
                    <span key={i} className="absolute bottom-0 h-5 w-[2px] bg-ink" style={{ left: `${(e.t / span) * 100}%` }} />
                  ))}
                  {p.stream.filter((e) => e.agent === a && e.kind === 'workflows' && !e.ok && e.t <= now).map((e, i) => (
                    <span key={`x${i}`} className="absolute top-0 -translate-x-1/2 font-sans text-[16px] font-semibold leading-none text-ink" style={{ left: `${(e.t / span) * 100}%` }}>✕</span>
                  ))}
                  {live && <span className="absolute -top-1 bottom-0 w-px bg-ink" style={{ left: `${(now / span) * 100}%` }} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 items-center gap-4 px-7">
        <Big label="AI calls" value={String(calls)} badge={vs && done && p.requests < vs.requests ? (p.requests === 0 ? `${vs.requests} → 0` : less(vs.requests, p.requests)) : undefined} strong={!!vs && done && p.requests < vs.requests} />
        <Big label="minutes" value={(secs / 60).toFixed(1)} badge={vs && done && p.seconds < vs.seconds ? less(vs.seconds, p.seconds) : undefined} strong={!!vs && done && p.seconds < vs.seconds} />
        <Big label="refused" value={String(refused)} badge={vs && done && p.rejected < vs.rejected ? (p.rejected === 0 ? `${vs.rejected} → 0` : less(vs.rejected, p.rejected)) : undefined} strong={!!vs && done && p.rejected < vs.rejected} />
        <Big label="score" value={`${p.passed}/${p.scored}`} badge={vs && done ? (p.passed === vs.passed ? 'same' : p.passed > vs.passed ? 'better' : 'lower') : undefined} />
      </div>
    </Card>
  );
}

function Big({ label, value, badge, strong = false }: { label: string; value: string; badge?: string; strong?: boolean }) {
  return (
    <div>
      <div className="font-mono text-5xl">{value}</div>
      <div className="mt-1 font-sans text-base text-muted">{label}</div>
      <div className="mt-2 h-8">
        {badge && (
          <span className={`inline-block rounded-sm px-2 py-1 font-sans text-base font-medium ${strong ? 'bg-ink text-bone' : 'border border-ink text-ink'}`}>{badge}</span>
        )}
      </div>
    </div>
  );
}
