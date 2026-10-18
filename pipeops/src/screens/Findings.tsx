// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useState } from 'react';
import { Button, Card, Choice, Label, Mark, Mono, Screen } from '../ui';
import { JOB_NAME, PHASE_NAME, SIDE_NAME, fmtTime, sameCapture, story, type Side, type Step, type Workflow } from '../story';

export default function Findings() {
  const [phase, setPhase] = useState(1);
  const [side, setSide] = useState<Side>('stack');
  const [wi, setWi] = useState(0);
  const [breaking, setBreaking] = useState(false);
  const [damage, setDamage] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);

  const p = (s: Side) => story[s].find((x) => x.phase === phase)!;
  const checks = Object.keys(p('base').checks);
  const control = story.controls.find((c) => c.id === damage);
  const workflows = p(side).workflows;
  const w: Workflow | undefined = workflows[Math.min(wi, workflows.length - 1)];

  const pick = (fn: () => void) => { fn(); setStep(null); };

  return (
    <Screen
      title="What they wrote, checked against the truth"
      lede="Each check asks one thing of the published workflows. Every claim cites a capture you can open."
      actions={<Choice value={phase} onChange={(v) => pick(() => { setPhase(v); setWi(0); setBreaking(false); setDamage(null); })} options={[1, 2, 3].map((x) => ({ value: x, label: PHASE_NAME[x] }))} />}
    >
      <div className="grid h-full grid-cols-[460px_1fr] gap-5">
        <Card className="flex flex-col p-5">
          <div className="mb-3 grid grid-cols-[1fr_72px_72px] items-end gap-2">
            <Label>Check</Label>
            <Label className="text-center">{breaking ? 'Damaged' : 'Baseline'}</Label>
            <Label className="text-center">{breaking ? 'Grader' : 'Our stack'}</Label>
          </div>
          <ul className="divide-y divide-line">
            {checks.map((c) => {
              const failedHere = !!control?.failed.includes(c);
              return (
                <li key={c} className={`grid grid-cols-[1fr_72px_72px] items-center gap-2 py-2 ${failedHere ? 'bg-subtle' : ''}`}>
                  <span className="font-serif text-lg leading-tight">{story.checks[c] ?? c}</span>
                  <span className="text-center">
                    <Mark pass={breaking ? (control ? !failedHere && p('base').checks[c] : p('base').checks[c]) : p('base').checks[c]} />
                  </span>
                  <span className="text-center">
                    {breaking ? (failedHere ? <Mono className="text-ink">caught</Mono> : <Mono className="text-faint">·</Mono>) : <Mark pass={p('stack').checks[c]} />}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto pt-4">
            {phase === 1 && !breaking && (
              <Button onClick={() => setBreaking(true)}>Break it: would the checks notice?</Button>
            )}
            {breaking && (
              <div>
                <Label className="mb-2">Damage the baseline's workflows, then grade them again</Label>
                <div className="flex flex-wrap gap-2">
                  {story.controls.map((c) => <Button key={c.id} active={damage === c.id} onClick={() => setDamage(c.id)}>{c.label}</Button>)}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Mono className="text-muted">{control ? `costs exactly: ${control.failed.map((f) => story.checks[f] ?? f).join(', ')}` : 'graded by the real wfeval grader'}</Mono>
                  <Button onClick={() => { setBreaking(false); setDamage(null); }}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <Choice value={side} onChange={(v) => pick(() => setSide(v))} options={(['base', 'stack'] as Side[]).map((s) => ({ value: s, label: SIDE_NAME[s] }))} />
            <div className="flex gap-1">
              {workflows.map((x, i) => (
                <Button key={x.title} active={i === wi} onClick={() => pick(() => setWi(i))}>{JOB_NAME[x.job ?? ''] ?? 'Unmatched'}</Button>
              ))}
            </div>
          </div>
          {w && (
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px]">
              <div className="overflow-y-auto px-6 py-5">
                <h2 className="font-sans text-2xl font-medium leading-snug">{w.title}</h2>
                <p className="mt-2 font-serif text-lg text-muted"><span className="font-sans text-sm text-ink">When </span>{w.trigger}</p>
                <ol className="mt-5 space-y-4">
                  {w.stages.map((s, i) => (
                    <li key={i}>
                      <div className="font-sans text-base font-medium"><Mono className="mr-2 text-faint">{i + 1}</Mono>{s.name}</div>
                      <ul className="mt-1 space-y-1 pl-6">
                        {s.steps.map((st, j) => (
                          <li key={j}>
                            <button
                              type="button"
                              onClick={() => setStep(st)}
                              className={`w-full rounded-md border px-3 py-1.5 text-left font-serif text-lg leading-snug ${step === st ? 'border-ink' : 'border-transparent hover:border-line'}`}
                            >
                              {st.text}
                              {st.app && <Mono className="ml-2 text-faint">{st.app}</Mono>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                {w.variations.length > 0 && (
                  <div className="mt-5">
                    <Label className="mb-1">Exceptions it describes</Label>
                    <ul className="list-disc space-y-1 pl-5 font-serif text-lg leading-snug">
                      {w.variations.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <aside className="overflow-y-auto border-l border-line bg-bone px-5 py-5">
                <Label className="mb-2">Source capture</Label>
                {step ? <Capture step={step} w={w} /> : <p className="font-serif text-lg italic text-muted">Pick a step to open the capture it cites.</p>}
              </aside>
            </div>
          )}
        </Card>
      </div>
    </Screen>
  );
}

function Capture({ step, w }: { step: Step; w: Workflow }) {
  const full = step.at ? w.evidence.find((e) => sameCapture(e.at, step.at!) && e.app === step.app) : undefined;
  return (
    <div>
      <Mono className="block text-ink">{step.app ?? 'no app cited'}</Mono>
      <Mono className="block text-muted">{step.at ? fmtTime(step.at) : 'no time cited'}</Mono>
      {step.quote && (
        <blockquote className="mt-3 border-l-2 border-ink pl-3 font-mono text-[13px] leading-relaxed">{step.quote}</blockquote>
      )}
      {full && <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-muted">{full.text}</pre>}
      <p className="mt-3 font-mono text-[11px] text-faint">The grader resolved this citation against the recorded captures.</p>
    </div>
  );
}
