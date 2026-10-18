// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Card, Label, Mono, Screen } from '../ui';
import { fmtTime, story } from '../story';

// Roles as the four shipped pipes describe them (crates/screenpipe-core/assets/pipes/workflow-*/pipe.md).
const ROLES = [
  { name: 'Discover', does: 'spots a job you repeat' },
  { name: 'Maintain', does: 'updates it when things change' },
  { name: 'Deepen', does: 'writes the steps' },
  { name: 'Review', does: 'double-checks, then publishes' },
];

export default function Intro() {
  const example = story.base[0].workflows.find((w) => w.job === 'email')!;
  const captures = story.history.frames.filter((f) => f.job === 'email' && f.run === story.history.frames.find((x) => x.job === 'email')?.run).slice(0, 5);

  return (
    <Screen
      title="screenpipe Workflows writes down the work you repeat"
      lede="So you can see it, check it, and choose what to automate."
    >
      <div className="flex h-full flex-col gap-5">
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_48px_1.15fr_48px_1.3fr] items-stretch">
          <Card className="flex min-h-0 flex-col overflow-hidden p-6">
            <Label className="mb-1 text-base">1 · screenpipe records</Label>
            <p className="mb-4 font-serif text-xl leading-snug">Every screen you see, kept on your computer.</p>
            <ul className="space-y-2">
              {captures.map((f, i) => (
                <li key={i} className="rounded-md border border-line px-3 py-2">
                  <div className="flex justify-between font-mono text-sm"><span>{f.app}</span><span className="text-faint">{fmtTime(f.at).split(' ').pop()}</span></div>
                  <div className="truncate font-mono text-sm text-muted">{f.window ?? '—'}</div>
                </li>
              ))}
            </ul>
          </Card>
          <Arrow />
          <Card className="flex min-h-0 flex-col overflow-hidden p-6">
            <Label className="mb-1 text-base">2 · four AI agents read it</Label>
            <p className="mb-4 font-serif text-xl leading-snug">Again and again, as new screens come in.</p>
            <ol className="flex flex-1 flex-col justify-between gap-3">
              {ROLES.map((r) => (
                <li key={r.name} className="flex items-baseline gap-4 rounded-md border border-line px-4 py-3">
                  <span className="w-24 shrink-0 font-sans text-lg font-medium">{r.name}</span>
                  <span className="font-serif text-xl leading-snug text-muted">{r.does}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Arrow />
          <Card className="flex min-h-0 flex-col overflow-hidden p-6">
            <Label className="mb-1 text-base">3 · a written workflow</Label>
            <p className="mb-4 font-serif text-xl leading-snug">Each step points to the screen it came from.</p>
            <div className="flex-1 rounded-md border border-ink px-5 py-4">
              <div className="font-sans text-xl font-medium leading-snug">{example.title}</div>
              <p className="mt-1 line-clamp-2 font-serif text-lg leading-snug text-muted"><span className="font-sans text-sm text-ink">When </span>{example.trigger}</p>
              <ol className="mt-3 space-y-2">
                {example.stages.map((s, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-lg font-medium"><Mono className="mr-2 text-faint">{i + 1}</Mono>{s.name}</span>
                    {s.steps[0]?.at && (
                      <Mono className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-muted">{s.steps[0].app} · {fmtTime(s.steps[0].at)}</Mono>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 rounded-lg border border-ink bg-surface px-8 py-5">
          <div>
            <Label className="mb-1 text-base">The problem</Label>
            <p className="font-sans text-2xl font-medium leading-snug">Are the agents finding the right work? And what does it cost?</p>
          </div>
          <span className="font-mono text-3xl text-faint">→</span>
          <div>
            <Label className="mb-1 text-base">PipeOps, our project</Label>
            <p className="font-serif text-2xl leading-snug">We built a way to measure it.</p>
          </div>
        </div>
      </div>
    </Screen>
  );
}

function Arrow() {
  return <div className="flex items-center justify-center font-mono text-2xl text-faint">→</div>;
}
