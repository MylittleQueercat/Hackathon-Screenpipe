// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Card, Label, Mono, Screen } from '../ui';
import { JOB_NAME, SIDE_NAME, fmtInt, fmtK, story, totals, type Side } from '../story';

const REPO = 'github.com/MylittleQueercat/Hackathon-Screenpipe';
const PRS = ['Eval harness', 'Workflows bug fixes', 'Agent feedback', 'Idle skip', 'Cut replies fix + cloud report'];

export default function Verdict() {
  const b = totals('base');
  const s = totals('stack');
  const p2 = (side: Side) => story.pair2Runs[side][0];
  const share = Math.round((s.requests / b.requests) * 100);

  const rows: { label: string; base: number; stack: number; fmt: (n: number) => string }[] = [
    { label: 'Model requests', base: b.requests, stack: s.requests, fmt: fmtInt },
    { label: 'Agent time', base: b.seconds, stack: s.seconds, fmt: (n) => `${fmtInt(Math.round(n))} s` },
    { label: 'Output tokens', base: b.output, stack: s.output, fmt: fmtK },
    { label: 'Requests when nothing was new', base: b.idle, stack: s.idle, fmt: fmtInt },
    { label: 'Replies cut off', base: b.cut, stack: s.cut, fmt: fmtInt },
  ];

  return (
    <Screen
      title={`${share}% of the requests. Same checks. Quality not settled.`}
      lede="One complete run per side, all three phases. Cost is what we can claim."
    >
      <div className="grid grid-cols-[1fr_420px] gap-5">
        <Card className="p-6">
          <div className="mb-4 grid grid-cols-[240px_1fr_120px] items-end gap-4">
            <Label>Complete pair</Label>
            <Label>Baseline above, our stack below</Label>
            <Label className="text-right">Change</Label>
          </div>
          <div className="mb-5 grid grid-cols-[240px_1fr_120px] items-center gap-4 border-b border-line pb-4">
            <span className="font-serif text-xl">Checks passed</span>
            <Mono className="text-xl">{b.passed}/{b.scored} <span className="text-faint">→</span> {s.passed}/{s.scored}</Mono>
            <Mono className="text-right text-muted">{s.passed === b.passed ? 'same' : `${s.passed - b.passed}`}</Mono>
          </div>
          <div className="space-y-5">
            {rows.map((r) => {
              const max = Math.max(r.base, r.stack, 1);
              const delta = r.base ? Math.round(((r.stack - r.base) / r.base) * 100) : 0;
              return (
                <div key={r.label} className="grid grid-cols-[240px_1fr_120px] items-center gap-4">
                  <span className="font-serif text-xl leading-tight">{r.label}</span>
                  <div className="space-y-1.5">
                    <Bar value={r.base} max={max} text={r.fmt(r.base)} tone="trace" />
                    <Bar value={r.stack} max={max} text={r.fmt(r.stack)} tone="ink" />
                  </div>
                  <Mono className="text-right text-xl">{r.base === 0 && r.stack === 0 ? 'same' : `${delta > 0 ? '+' : ''}${delta}%`}</Mono>
                </div>
              );
            })}
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <Label className="mb-1">A second pair, stopped after the first week</Label>
            <p className="font-serif text-xl">
              Requests <Mono className="text-lg">{p2('base').requests} → {p2('stack').requests}</Mono>, checks{' '}
              <Mono className="text-lg">{p2('base').passed}/{p2('base').scored} → {p2('stack').passed}/{p2('stack').scored}</Mono>
              <span className="text-muted">: the first-week gap is within the runs’ own spread. The idle saving is the certain part.</span>
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <Label className="mb-3">A blind LLM judge read the documents, both orders</Label>
            {story.judge.map((j) => {
              const won = (side: Side) => j.rows.filter((r) => r.verdict === side).length;
              return (
                <div key={j.name} className="mb-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-sans text-base font-medium">{j.name}</span>
                    <Mono className="text-muted">{j.rows.length} document{j.rows.length > 1 ? 's' : ''}</Mono>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {j.rows.map((r) => (
                      <span
                        key={`${r.phase}${r.job}`}
                        title={`Phase ${r.phase}, ${JOB_NAME[r.job]}: ${r.orders.map((o) => o.strength).join(' / ')}`}
                        className={`rounded-sm border px-2 py-1 font-mono text-[12px] ${r.verdict === 'stack' ? 'border-ink bg-ink text-bone' : 'border-line bg-surface text-ink'}`}
                      >
                        {r.verdict === 'base' ? 'Baseline' : r.verdict === 'stack' ? 'Our stack' : 'Split'} · p{r.phase} {r.job}
                      </span>
                    ))}
                  </div>
                  <Mono className="mt-1 block text-faint">preferred: {SIDE_NAME.base} {won('base')}, {SIDE_NAME.stack} {won('stack')}</Mono>
                </div>
              );
            })}
            <p className="font-serif text-xl leading-snug">
              Two pairs, each judged both ways round. The noise goes in both directions, so this proves quality neither better nor worse.
            </p>
          </Card>
          <Card className="p-6">
            <Label className="mb-3">Planned as separate pull requests to screenpipe</Label>
            <ul className="space-y-1">
              {PRS.map((x) => <li key={x} className="font-serif text-xl"><Mono className="mr-2 text-faint">→</Mono>{x}</li>)}
            </ul>
            <Mono className="mt-4 block text-muted">{REPO}</Mono>
          </Card>
        </div>
      </div>
    </Screen>
  );
}

function Bar({ value, max, text, tone }: { value: number; max: number; text: string; tone: 'trace' | 'ink' }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 bg-subtle">
        <div className={`h-3 ${tone === 'ink' ? 'bg-ink' : 'bg-trace'} transition-[width]`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <Mono className="w-20 text-right">{text}</Mono>
    </div>
  );
}
