// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { ReactNode } from 'react';
import { Card, Mono, Screen } from '../ui';
import { story } from '../story';

const frames = story.history.frames;
const runs = (phase: number, job: string) => new Set(frames.filter((f) => f.phase === phase && f.job === job && f.run).map((f) => f.run)).size;
const captures = (phase: number) => frames.filter((f) => f.phase === phase).length;
const checks = (phase: number) => Object.keys(story.base.find((p) => p.phase === phase)!.checks).length;

export default function Exam() {
  return (
    <Screen title="We built an exam for Workflows, with an answer key">
      <div className="flex h-full flex-col gap-5">
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-5">
          <Round
            n={1}
            what="Morgan's first 4 days"
            tech={`${captures(1)} captures · ${checks(1)} checks`}
            answer={<>2 workflows: receipts and email.</>}
          >
            <ul className="space-y-4">
              <Job mark="h-7 w-[3px] bg-ink" label="Files scanned receipts" n={`×${runs(1, 'receipts')}`} good />
              <Job mark="h-5 w-[3px] bg-signal" label="Saves email attachments" n={`×${runs(1, 'email')}`} good />
              <Job mark="h-5 w-[7px] border-2 border-ink bg-surface" label="Sets up a printer" n={`×${runs(1, 'printer')}`} />
              <Job mark="h-2.5 w-px bg-faint" label="Everything else" n="noise" />
            </ul>
          </Round>
          <Round
            n={2}
            what="A new rule for receipt names"
            tech={`${captures(2)} captures · ${checks(2)} checks`}
            answer={<>Update the receipt workflow.</>}
          >
            <div className="rounded-md border border-line px-4 py-3">
              <Mono className="block text-sm text-muted">naming-rule-update.txt</Mono>
              <div className="mt-3 flex flex-col gap-2 font-mono text-2xl">
                <span className="text-muted line-through">DATE_NAME_TYPE.pdf</span>
                <span className="text-faint">↓</span>
                <span>TYPE_DATE_NAME.pdf</span>
              </div>
            </div>
          </Round>
          <Round n={3} what="Morgan is away" tech={`${captures(3)} captures · ${checks(3)} checks`} answer={<>Change nothing. Spend nothing.</>}>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line font-serif text-2xl italic text-muted">no new screens</div>
          </Round>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_32px_1fr_32px_1fr_32px_1fr] items-stretch">
          <Stage title="We write Morgan's week" tech="wfeval → /eval/seed" />
          <Arrow />
          <Stage title="screenpipe's agents take it" tech="4 Workflows agents · Sonnet 5" />
          <Arrow />
          <Stage title="We grade them" tech="14 checks · citations verified" />
          <Arrow />
          <Stage title="We count the cost" tech="request logs" />
        </div>
      </div>
    </Screen>
  );
}

function Round({ n, what, tech, answer, children }: { n: number; what: string; tech: string; answer: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-6">
      <Mono className="text-sm text-muted">Round {n}</Mono>
      <h2 className="mt-1 font-sans text-[28px] font-medium leading-tight">{what}</h2>
      <div className="mt-6 flex flex-1 flex-col justify-center">{children}</div>
      <div className="mt-4 border-t border-line pt-3">
        <div className="font-sans text-sm font-medium text-muted">Right answer</div>
        <p className="mt-1 font-sans text-2xl font-medium leading-snug">{answer}</p>
        <Mono className="mt-2 block text-sm text-faint">{tech}</Mono>
      </div>
    </Card>
  );
}

function Job({ mark, label, n, good = false }: { mark: string; label: string; n: string; good?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-3 justify-center"><span className={`inline-block ${mark}`} /></span>
      <span className="flex-1 font-serif text-2xl">{label}</span>
      <Mono className="text-base text-muted">{n}</Mono>
      <span className="w-8 text-center font-sans text-2xl" aria-label={good ? 'should be a workflow' : 'should not'}>{good ? '✓' : '✕'}</span>
    </li>
  );
}

function Stage({ title, tech }: { title: string; tech: string }) {
  return (
    <div className="rounded-lg border border-ink bg-surface px-5 py-4">
      <div className="font-sans text-xl font-medium leading-snug">{title}</div>
      <Mono className="mt-1 block text-sm text-muted">{tech}</Mono>
    </div>
  );
}

function Arrow() {
  return <div className="flex items-center justify-center font-mono text-2xl text-faint">→</div>;
}
