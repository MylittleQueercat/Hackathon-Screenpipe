// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Card, Label, Mono, Screen } from '../ui';
import { SIDE_NAME, fmtInt, fmtK, story, totals, type JudgeRow, type Side } from '../story';

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

  const [pair1, pair2] = story.judge;
  const row = (j: typeof pair1 | undefined, phase: number, job: string) => j?.rows.find((r) => r.phase === phase && r.job === job);
  const later = pair1.rows.filter((r) => r.phase > 1);
  const p2EmailMissing = p2('base').checks.email_separate === false;

  return (
    <Screen
      title={`${share}% of the requests. Same checks. Quality not settled.`}
      lede="Annex · one complete run per side on the same history, all three rounds (agent cycles)."
    >
      <div className="grid h-full grid-cols-[1fr_640px] gap-5">
        <Card className="flex flex-col px-7 py-5">
          <div className="mb-3 grid grid-cols-[250px_1fr_100px] items-end gap-4">
            <Label className="text-base">Complete pair</Label>
            <div className="flex gap-5 font-sans text-sm text-muted">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 bg-trace" /> {SIDE_NAME.base}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 bg-ink" /> {SIDE_NAME.stack}</span>
            </div>
            <Label className="text-right text-base">Change</Label>
          </div>
          <div className="mb-4 grid grid-cols-[250px_1fr_100px] items-center gap-4 border-b border-line pb-3">
            <span className="font-serif text-xl">Checks passed</span>
            <Mono className="text-2xl">{b.passed}/{b.scored} <span className="text-faint">→</span> {s.passed}/{s.scored}</Mono>
            <Mono className="text-right text-xl text-muted">{s.passed === b.passed ? 'same' : `${s.passed - b.passed}`}</Mono>
          </div>
          <div className="flex flex-1 flex-col justify-between">
            {rows.map((r) => {
              const max = Math.max(r.base, r.stack, 1);
              const delta = r.base ? Math.round(((r.stack - r.base) / r.base) * 100) : 0;
              return (
                <div key={r.label} className="grid grid-cols-[250px_1fr_100px] items-center gap-4">
                  <span className="font-serif text-xl leading-tight">{r.label}</span>
                  <div className="space-y-1.5">
                    <Bar value={r.base} max={max} text={r.fmt(r.base)} tone="trace" />
                    <Bar value={r.stack} max={max} text={r.fmt(r.stack)} tone="ink" />
                  </div>
                  <Mono className="text-right text-2xl">{r.base === 0 && r.stack === 0 ? 'same' : `${delta > 0 ? '+' : ''}${delta}%`}</Mono>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <Label className="mb-1 text-base">A second pair, stopped after round 1</Label>
            <p className="font-serif text-xl leading-snug">
              Requests <Mono className="text-lg">{p2('base').requests} → {p2('stack').requests}</Mono>, checks{' '}
              <Mono className="text-lg">{p2('base').passed}/{p2('base').scored} → {p2('stack').passed}/{p2('stack').scored}</Mono>
              <span className="text-muted">: round 1 varies from run to run as much as the gap. The idle saving is the certain part.</span>
            </p>
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-5">
          <Card className="px-6 py-5">
            <Label className="mb-3 text-base">A blind LLM judge compared the documents, both ways round</Label>
            <div className="grid grid-cols-[210px_1fr_1fr] gap-x-3 gap-y-3">
              <span />
              <Label>Pair 1 (complete)</Label>
              <Label>Pair 2 (round 1 only)</Label>
              <Cellname>Receipt filing, round 1</Cellname>
              <Verdict1 r={row(pair1, 1, 'receipts')} />
              <Verdict1 r={row(pair2, 1, 'receipts')} />
              <Cellname>Email attachments, round 1</Cellname>
              <Verdict1 r={row(pair1, 1, 'email')} />
              {row(pair2, 1, 'email') ? <Verdict1 r={row(pair2, 1, 'email')} /> : <Note>{p2EmailMissing ? 'baseline merged it into receipts: nothing to compare' : 'not judged'}</Note>}
              <Cellname>Rounds 2 and 3</Cellname>
              <Note>
                <b className="font-sans font-medium text-ink">{SIDE_NAME.base} {later.filter((r) => r.verdict === 'base').length} of {later.length}</b>, revising the round-1 documents
              </Note>
              <Note>not run</Note>
            </div>
            <p className="mt-4 border-t border-line pt-3 font-serif text-xl leading-snug">
              Where both pairs compare, one each. Two pairs judged both ways are not enough: the noise goes both directions, so quality is proven neither better nor worse.
            </p>
          </Card>
          <Card className="flex-1 px-6 py-5">
            <Label className="mb-2 text-base">Planned as separate pull requests to screenpipe</Label>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {PRS.map((x) => <li key={x} className="font-serif text-xl"><Mono className="mr-2 text-faint">→</Mono>{x}</li>)}
            </ul>
            <Mono className="mt-3 block text-base text-muted">{REPO}</Mono>
          </Card>
        </div>
      </div>
    </Screen>
  );
}

function Cellname({ children }: { children: React.ReactNode }) {
  return <span className="font-serif text-lg leading-tight">{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="font-serif text-lg leading-tight text-muted">{children}</span>;
}

function Verdict1({ r }: { r: JudgeRow | undefined }) {
  if (!r) return <Note>not judged</Note>;
  const strength = r.orders.every((o) => o.strength === r.orders[0].strength) ? r.orders[0].strength : r.orders.map((o) => o.strength).join(' / ');
  const who = r.verdict === 'base' ? SIDE_NAME.base : r.verdict === 'stack' ? SIDE_NAME.stack : 'Split';
  return (
    <span className={`self-start rounded-sm border px-2 py-1 font-sans text-base ${r.verdict === 'stack' ? 'border-ink bg-ink text-bone' : 'border-ink bg-surface text-ink'}`}>
      {who} <span className="opacity-70">· {strength}</span>
    </span>
  );
}

function Bar({ value, max, text, tone }: { value: number; max: number; text: string; tone: 'trace' | 'ink' }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 bg-subtle">
        <div className={`h-3 ${tone === 'ink' ? 'bg-ink' : 'bg-trace'} transition-[width]`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <Mono className="w-24 text-right text-base">{text}</Mono>
    </div>
  );
}
