// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useMemo, useState } from 'react';
import { Button, Card, Mono, Screen } from '../ui';
import { JOB_NAME, story, type Frame } from '../story';

const JOBS = ['receipts', 'email', 'printer', 'noise'] as const;
type Job = (typeof JOBS)[number];
// Monochrome by design: jobs differ by height and fill, and every one is labelled.
const TICK: Record<Job, string> = {
  receipts: 'h-9 w-[2px] bg-ink',
  email: 'h-6 w-[2px] bg-signal',
  printer: 'h-6 w-[5px] border border-ink bg-surface',
  noise: 'h-3 w-px bg-faint',
};
const EXPECT: Record<Job, string> = {
  receipts: 'should become a workflow, with its 4 exceptions',
  email: 'should become a separate workflow',
  printer: 'happened once: should not',
  noise: 'should be ignored',
};

const secOfDay = (iso: string) => { const d = new Date(iso); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function History() {
  const [reveal, setReveal] = useState(false);
  const [focus, setFocus] = useState<Job | null>(null);
  const frames = story.history.frames;

  const rows = useMemo(() => {
    const byDay = new Map<string, Frame[]>();
    for (const f of frames) {
      const k = `${f.phase}|${f.at.slice(0, 10)}`;
      byDay.set(k, [...(byDay.get(k) ?? []), f]);
    }
    return [...byDay.entries()].map(([k, fs]) => {
      const phase = Number(k.split('|')[0]);
      const secs = fs.map((f) => secOfDay(f.at));
      // Workdays share one 8:30-18:30 axis; the later short session gets its own.
      const [lo, hi] = phase === 1 ? [8.5 * 3600, 18.5 * 3600] : [Math.min(...secs) - 60, Math.max(...secs) + 60];
      const mins = Math.round((Math.max(...secs) - Math.min(...secs)) / 60);
      return { phase, label: dayLabel(fs[0].at), fs, lo, hi, note: phase === 1 ? null : `${mins} min` };
    });
  }, [frames]);

  const counts = useMemo(() => Object.fromEntries(JOBS.map((j) => [j, frames.filter((f) => (f.job ?? 'noise') === j).length])), [frames]);
  const runs = useMemo(() => Object.fromEntries(JOBS.map((j) => [j, new Set(frames.filter((f) => f.job === j && f.run).map((f) => f.run)).size])), [frames]);
  const ruleAt = frames.find((f) => f.phase === 2 && /naming-rule/i.test(f.window ?? ''))?.at;

  return (
    <Screen
      title="A week of work, with known answers"
      lede="Synthetic screen history, written into a real screenpipe engine. We planted the jobs, so we know what Workflows should find."
      actions={<Button active={reveal} onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide the planted jobs' : 'Show the planted jobs'}</Button>}
    >
      <Card className="px-6 py-5">
        <div className="mb-3 flex items-baseline justify-between">
          <Mono className="text-muted">{frames.length} captures · {new Set(frames.map((f) => f.app)).size} apps</Mono>
          <Mono className="text-faint">each mark is one capture</Mono>
        </div>
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={r.label + r.phase}>
            {r.phase === 2 && rows[i - 1]?.phase === 1 && (
              <div className="mb-3 grid grid-cols-[150px_1fr] gap-4">
                <span />
                <div className="flex justify-between font-mono text-[11px] text-faint">
                  {['08:30', '11:00', '13:30', '16:00', '18:30'].map((t) => <span key={t}>{t}</span>)}
                </div>
              </div>
            )}
            <div className="grid grid-cols-[150px_1fr] items-center gap-4">
              <div className="font-sans text-sm">
                {r.label}
                {r.note && <span className="ml-2 font-mono text-xs text-muted">{r.note}</span>}
              </div>
              <div className="relative h-11 border-b border-line">
                {r.fs.map((f, i) => {
                  const job = (f.job ?? 'noise') as Job;
                  const dim = reveal && focus !== null && focus !== job;
                  return (
                    <span
                      key={i}
                      title={`${f.app}${f.window ? ' · ' + f.window : ''}`}
                      className={`absolute bottom-0 transition-opacity ${reveal ? TICK[job] : 'h-5 w-px bg-trace'} ${dim ? 'opacity-10' : ''}`}
                      style={{ left: `${((secOfDay(f.at) - r.lo) / (r.hi - r.lo)) * 100}%` }}
                    />
                  );
                })}
                {r.phase === 2 && ruleAt && (
                  <span className="absolute -top-1 font-mono text-[11px] text-ink" style={{ left: `${((secOfDay(ruleAt) - r.lo) / (r.hi - r.lo)) * 100}%` }}>
                    ↓ naming rule changes
                  </span>
                )}
              </div>
            </div>
            </div>
          ))}
          <div className="grid grid-cols-[150px_1fr] items-center gap-4">
            <div className="font-sans text-sm text-muted">Then</div>
            <div className="flex h-11 items-center border-b border-dashed border-line font-serif text-lg italic text-muted">nothing new is recorded</div>
          </div>
        </div>
      </Card>

      <div className={`mt-5 grid grid-cols-4 gap-4 transition-opacity ${reveal ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {JOBS.map((j) => (
          <button
            key={j}
            type="button"
            onMouseEnter={() => setFocus(j)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(j)}
            onBlur={() => setFocus(null)}
            className="rounded-lg border border-line bg-surface p-4 text-left hover:border-ink"
          >
            <div className="flex items-center gap-3">
              <span className={`inline-block ${TICK[j]}`} />
              <span className="font-sans text-base font-medium">{JOB_NAME[j]}</span>
            </div>
            <div className="mt-2 font-serif text-lg leading-snug text-muted">{EXPECT[j]}</div>
            <Mono className="mt-3 block text-faint">
              {counts[j]} captures{j !== 'noise' && runs[j] ? ` · ${runs[j]} time${runs[j] > 1 ? 's' : ''}` : ''}
            </Mono>
          </button>
        ))}
      </div>
    </Screen>
  );
}
