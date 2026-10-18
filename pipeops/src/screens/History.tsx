// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Mono, Screen } from '../ui';
import { JOB_NAME, PHASE_NAME, story, type Frame } from '../story';

const JOBS = ['receipts', 'email', 'printer', 'noise'] as const;
type Job = (typeof JOBS)[number];
// Monochrome by design: jobs differ by height and fill, and every one is labelled.
const TICK: Record<Job, string> = {
  receipts: 'h-9 w-[3px] bg-ink',
  email: 'h-6 w-[3px] bg-signal',
  printer: 'h-6 w-[7px] border-2 border-ink bg-surface',
  noise: 'h-3 w-px bg-faint',
};
const EXPECT: Record<Job, string> = {
  receipts: 'a workflow, with its 4 exceptions',
  email: 'a separate workflow',
  printer: 'happened once: no workflow',
  noise: 'ignored',
};

const secOfDay = (iso: string) => { const d = new Date(iso); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hhmm = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;

interface Row { label: string; fs: Frame[] }

export default function History() {
  const [reveal, setReveal] = useState(false);
  const [focus, setFocus] = useState<Job | null>(null);
  const frames = story.history.frames;

  const days = (phase: number): Row[] => {
    const byDay = new Map<string, Frame[]>();
    for (const f of frames.filter((x) => x.phase === phase)) byDay.set(f.at.slice(0, 10), [...(byDay.get(f.at.slice(0, 10)) ?? []), f]);
    return [...byDay.values()].map((fs) => ({ label: dayLabel(fs[0].at), fs }));
  };
  const c1 = useMemo(() => days(1), [frames]);
  const c2 = useMemo(() => days(2), [frames]);
  const c2secs = c2.flatMap((r) => r.fs.map((f) => secOfDay(f.at)));
  const c2lo = Math.floor((Math.min(...c2secs) - 60) / 300) * 300;
  const c2hi = Math.ceil((Math.max(...c2secs) + 60) / 300) * 300;
  const ruleAt = frames.find((f) => f.phase === 2 && /naming-rule/i.test(f.window ?? ''))?.at;

  const counts = useMemo(() => Object.fromEntries(JOBS.map((j) => [j, frames.filter((f) => (f.job ?? 'noise') === j).length])), [frames]);
  const runs = useMemo(() => Object.fromEntries(JOBS.map((j) => [j, new Set(frames.filter((f) => f.job === j && f.run).map((f) => f.run)).size])), [frames]);

  const track = (r: Row, lo: number, hi: number) => (
    <div key={r.label} className="grid grid-cols-[130px_1fr] items-end gap-4">
      <div className="pb-1 font-sans text-base">{r.label}</div>
      <div className="relative h-10 border-b border-line">
        {r.fs.map((f, i) => {
          const job = (f.job ?? 'noise') as Job;
          const dim = reveal && focus !== null && focus !== job;
          return (
            <span
              key={i}
              title={`${f.app}${f.window ? ' · ' + f.window : ''}`}
              className={`absolute bottom-0 -translate-x-1/2 transition-opacity ${reveal ? TICK[job] : 'h-5 w-[2px] bg-trace'} ${dim ? 'opacity-10' : ''}`}
              style={{ left: `${((secOfDay(f.at) - lo) / (hi - lo)) * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );

  const axis = (lo: number, hi: number, n: number) => (
    <div className="grid grid-cols-[130px_1fr] gap-4">
      <span />
      <div className="flex justify-between pt-1 font-mono text-sm text-faint">
        {Array.from({ length: n }, (_, i) => <span key={i}>{hhmm(lo + ((hi - lo) * i) / (n - 1))}</span>)}
      </div>
    </div>
  );

  return (
    <Screen
      title="A week of work, with known answers"
      lede="Synthetic screen history, written into a real screenpipe engine. We planted the jobs, so we know the answers."
      actions={<Button active={reveal} onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide the planted jobs' : 'Show the planted jobs'}</Button>}
    >
      <div className="flex h-full flex-col gap-4">
        <Card className="flex flex-col gap-3 px-7 py-4">
          <Block title={PHASE_NAME[1]} note={`${c1.reduce((a, r) => a + r.fs.length, 0)} captures · each mark is one`}>
            <div className="space-y-1">{c1.map((r) => track(r, 8.5 * 3600, 18.5 * 3600))}</div>
            {axis(8.5 * 3600, 18.5 * 3600, 5)}
          </Block>
          <Block title={PHASE_NAME[2]} note={`${c2.reduce((a, r) => a + r.fs.length, 0)} captures in ${Math.round((Math.max(...c2secs) - Math.min(...c2secs)) / 60)} min`}>
            {ruleAt && (
              <div className="grid grid-cols-[130px_1fr] gap-4">
                <span />
                <div className="relative h-6">
                  <span className="absolute bottom-0 whitespace-nowrap border-l-2 border-ink pl-2 font-mono text-sm text-ink" style={{ left: `${((secOfDay(ruleAt) - c2lo) / (c2hi - c2lo)) * 100}%` }}>
                    naming-rule-update.txt opened: receipts get a new file name
                  </span>
                </div>
              </div>
            )}
            {c2.map((r) => track(r, c2lo, c2hi))}
            {axis(c2lo, c2hi, 6)}
          </Block>
          <Block title={PHASE_NAME[3]} note="0 captures">
            <div className="grid grid-cols-[130px_1fr] gap-4">
              <span />
              <div className="flex h-9 items-center border-b border-dashed border-line font-serif text-xl italic text-muted">nothing is recorded before the next round</div>
            </div>
          </Block>
        </Card>

        <div className="grid flex-1 grid-cols-4 gap-4">
          {JOBS.map((j) =>
            reveal ? (
              <button
                key={j}
                type="button"
                onMouseEnter={() => setFocus(j)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(j)}
                onBlur={() => setFocus(null)}
                className="rounded-lg border border-line bg-surface px-5 py-4 text-left hover:border-ink"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-block ${TICK[j]}`} />
                  <span className="font-sans text-xl font-medium">{JOB_NAME[j]}</span>
                </div>
                <div className="mt-1 font-serif text-xl leading-snug text-muted"><span className="font-sans text-base text-ink">Expected: </span>{EXPECT[j]}</div>
                <Mono className="mt-2 block text-sm text-faint">
                  {counts[j]} captures{j !== 'noise' && runs[j] ? ` · done ${runs[j]} time${runs[j] > 1 ? 's' : ''}` : ''}
                </Mono>
              </button>
            ) : (
              <div key={j} className="flex items-center justify-center rounded-lg border border-dashed border-line font-mono text-3xl text-faint">?</div>
            ),
          )}
        </div>
      </div>
    </Screen>
  );
}

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-4">
        <span className="font-sans text-lg font-medium">{title}</span>
        <Mono className="text-sm text-muted">{note}</Mono>
      </div>
      {children}
    </div>
  );
}
