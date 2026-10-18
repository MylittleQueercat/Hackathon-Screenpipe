// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Choice, Mono, Screen } from '../ui';
import { PHASE_NAME, SIDE_NAME, story, totals, type Phase, type Side } from '../story';

const PLAY_SECONDS = 14; // the longer run of a round replays in this many seconds

export default function Race() {
  const [phase, setPhase] = useState(1);
  const [now, setNow] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number>();
  const lanes = (['base', 'stack'] as Side[]).map((s) => ({ side: s, p: story[s].find((x) => x.phase === phase)! }));
  const span = Math.max(...lanes.map((l) => l.p.seconds), 1);
  const all = { base: totals('base'), stack: totals('stack') };

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
      lede="Each tick is one AI call. Press Replay to watch them work."
      actions={
        <>
          <Choice value={phase} onChange={(p) => { setPlaying(false); setNow(Infinity); setPhase(p); }} options={[1, 2, 3].map((p) => ({ value: p, label: PHASE_NAME[p] }))} />
          <Button active={playing} onClick={() => { setNow(0); setPlaying(true); }}>{playing ? 'Replaying…' : 'Replay'}</Button>
        </>
      }
    >
      <div className="flex h-full flex-col gap-5">
        {lanes.map(({ side, p }) => <Lane key={side} side={side} p={p} span={span} now={now} />)}
        <div className="flex shrink-0 items-baseline justify-between">
          <span className="font-serif text-2xl">
            All three rounds: <b className="font-sans font-medium">{all.base.requests}</b> AI calls today, <b className="font-sans font-medium">{all.stack.requests}</b> with our fixes.
          </span>
          <Mono className="text-sm text-faint">ticks = model requests from each run's log · per-agent detail in annex A2</Mono>
        </div>
      </div>
    </Screen>
  );
}

function Lane({ side, p, span, now }: { side: Side; p: Phase; span: number; now: number }) {
  const live = Number.isFinite(now);
  const shown = p.stream.filter((e) => e.kind === 'request' && e.t <= now);
  const secs = live ? Math.min(now, p.seconds) : p.seconds;
  const idle = p.requests === 0;

  return (
    <Card className="grid min-h-0 flex-1 grid-cols-[1fr_460px]">
      <div className="flex min-w-0 flex-col border-r border-line px-7 py-5">
        <div className="font-sans text-2xl font-medium">{SIDE_NAME[side]}</div>
        {idle ? (
          <div className="flex flex-1 items-center font-serif text-3xl italic text-muted">Nothing new was recorded, so it doesn't start.</div>
        ) : (
          <div className="relative mt-4 flex-1 border-b border-ink">
            {shown.map((e, i) => (
              <span key={i} className="absolute bottom-0 h-3/4 w-[2px] bg-ink" style={{ left: `${(e.t / span) * 100}%` }} />
            ))}
            {live && <span className="absolute -top-2 bottom-0 w-[2px] bg-phosphor" style={{ left: `${(now / span) * 100}%` }} />}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 items-center gap-4 px-7">
        <Big label="AI calls" value={String(shown.length)} />
        <Big label="minutes" value={(secs / 60).toFixed(1)} />
        <Big label="exam score" value={`${p.passed}/${p.scored}`} />
      </div>
    </Card>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-5xl">{value}</div>
      <div className="mt-1 font-sans text-base text-muted">{label}</div>
    </div>
  );
}
