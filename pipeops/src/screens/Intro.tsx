// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Card, Label, Screen } from '../ui';
import { story } from '../story';

// Roles as the four shipped pipes describe them (crates/screenpipe-core/assets/pipes/workflow-*/pipe.md).
const ROLES = [
  { name: 'Discover', does: 'spots a job you repeat' },
  { name: 'Maintain', does: 'updates it when things change' },
  { name: 'Deepen', does: 'writes the steps' },
  { name: 'Review', does: 'double-checks, then publishes' },
];

export default function Intro() {
  const example = story.base[0].workflows.find((w) => w.job === 'email')!;

  return (
    <Screen title="Are screenpipe's AI agents finding the right work, and at what cost?" lede="PipeOps measures it.">
      <div className="grid h-full grid-cols-[1fr_56px_1.15fr_56px_1.15fr] items-stretch pb-2">
        <Card className="flex flex-col p-7">
          <Label className="text-base">1 · screenpipe records everything</Label>
          <div className="relative mt-8 flex-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute rounded-md border border-ink bg-surface"
                style={{ left: `${i * 12}%`, top: `${i * 14}%`, width: '72%', height: '58%' }}
              >
                <div className="flex gap-1.5 border-b border-line px-3 py-2">
                  {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 rounded-full border border-trace" />)}
                </div>
                <div className="space-y-2 p-3">
                  {[80, 60, 70, 45].map((w, k) => <div key={k} className="h-2 rounded-sm bg-subtle" style={{ width: `${w}%` }} />)}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Arrow />
        <Card className="flex flex-col p-7">
          <Label className="text-base">2 · four AI agents read it</Label>
          <ol className="mt-6 flex flex-1 flex-col justify-around">
            {ROLES.map((r) => (
              <li key={r.name} className="flex items-baseline gap-4 border-b border-line pb-3 last:border-0">
                <span className="w-28 shrink-0 font-sans text-2xl font-medium">{r.name}</span>
                <span className="font-serif text-xl text-muted">{r.does}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Arrow />
        <Card className="flex flex-col p-7">
          <Label className="text-base">3 · a workflow you can automate</Label>
          <div className="mt-6 flex flex-1 flex-col rounded-md border border-ink px-6 py-5">
            <div className="font-sans text-2xl font-medium leading-snug">{example.title}</div>
            <ol className="mt-auto space-y-4">
              {example.stages.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <span className="font-serif text-xl"><span className="mr-2 font-mono text-base text-faint">{i + 1}</span>{s.name}</span>
                  <span className="shrink-0 font-mono text-sm text-muted">↗ source</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>
    </Screen>
  );
}

function Arrow() {
  return <div className="flex items-center justify-center font-mono text-3xl text-faint">→</div>;
}
