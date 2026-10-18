// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Card, Mono, Screen } from '../ui';
import { SIDE_NAME, fmtK, story, totals } from '../story';

const REPO = 'github.com/MylittleQueercat/Hackathon-Screenpipe';
const PRS: [string, string][] = [
  ['Eval harness', 'wfeval + /eval/seed: the exam itself'],
  ['Workflows bug fixes', 'whole-second citations refused; text cut at 400 characters'],
  ['Agent feedback', 'refusals say what failed and how to fix it'],
  ['Idle skip', 'no cycle when nothing new was recorded'],
  ['Cut replies', 'the cloud ignores max_completion_tokens: send max_tokens'],
];

export default function Result() {
  const b = totals('base');
  const s = totals('stack');
  // Like for like: the round-1 receipts document is the one both pairs can compare.
  const wins = story.judge.map((j) => j.rows.find((r) => r.phase === 1 && r.job === 'receipts')?.verdict);
  const today = wins.filter((w) => w === 'base').length;
  const ours = wins.filter((w) => w === 'stack').length;
  const pct = (a: number, z: number) => `${Math.round(((z - a) / a) * 100)}%`;

  return (
    <Screen title="Same score. Half the AI calls. Quality: too early to tell.">
      <div className="flex h-full flex-col gap-5">
        <div className="grid shrink-0 grid-cols-4 gap-5">
          <Tile label="Exam score" from={`${b.passed}/${b.scored}`} to={`${s.passed}/${s.scored}`} change="same" />
          <Tile label="AI calls" from={String(b.requests)} to={String(s.requests)} change={pct(b.requests, s.requests)} />
          <Tile label="Agent time, minutes" from={String(Math.round(b.seconds / 60))} to={String(Math.round(s.seconds / 60))} change={pct(b.seconds, s.seconds)} />
          <Tile label="AI calls when nothing happened" from={String(b.idle)} to={String(s.idle)} change="none wasted" />
        </div>
        <Mono className="-mt-2 text-sm text-faint">
          {SIDE_NAME.base} → {SIDE_NAME.stack.toLowerCase()} · one complete run each, same history · Claude Sonnet 5 · output tokens {fmtK(b.output)} → {fmtK(s.output)} · replies cut short {b.cut} → {s.cut}
        </Mono>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.25fr] gap-5">
          <Card className="flex flex-col p-6">
            <div className="font-sans text-xl font-medium">Did they write better workflows?</div>
            <p className="mt-1 font-serif text-xl leading-snug text-muted">A blind AI judge compared the two versions' workflows, run after run.</p>
            <div className="flex flex-1 items-center justify-center gap-8">
              <Score n={today} who={SIDE_NAME.base} />
              <span className="font-mono text-4xl text-faint">–</span>
              <Score n={ours} who={SIDE_NAME.stack} />
            </div>
            <p className="font-sans text-xl font-medium">Too early to tell: two runs each are not enough.</p>
            <Mono className="mt-1 block text-sm text-faint">2 run pairs, each judged both ways round · same document compared · details in annex A4</Mono>
          </Card>
          <Card className="flex flex-col p-6">
            <div className="font-sans text-xl font-medium">What we give back to screenpipe: 5 separate pull requests</div>
            <ul className="mt-3 flex-1 space-y-2.5">
              {PRS.map(([name, what]) => (
                <li key={name} className="grid grid-cols-[220px_1fr] items-baseline gap-3">
                  <span className="font-sans text-lg font-medium">{name}</span>
                  <Mono className="text-sm text-muted">{what}</Mono>
                </li>
              ))}
            </ul>
            <Mono className="text-base">{REPO}</Mono>
          </Card>
        </div>
      </div>
    </Screen>
  );
}

function Tile({ label, from, to, change }: { label: string; from: string; to: string; change: string }) {
  const same = from === to;
  return (
    <Card className="px-6 py-5">
      <div className="font-sans text-lg text-muted">{label}</div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`font-mono text-3xl text-trace ${same ? '' : 'line-through decoration-1'}`}>{from}</span>
        <span className="font-mono text-2xl text-faint">→</span>
        <span className="font-mono text-5xl">{to}</span>
      </div>
      <div className="mt-2 font-sans text-lg font-medium">{change}</div>
    </Card>
  );
}

function Score({ n, who }: { n: number; who: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-7xl">{n}</div>
      <div className="mt-1 font-sans text-base text-muted">preferred {who.toLowerCase()}</div>
    </div>
  );
}
