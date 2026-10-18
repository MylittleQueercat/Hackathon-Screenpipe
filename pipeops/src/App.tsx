// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useState } from 'react';
import History from './screens/History';
import Agents from './screens/Agents';
import Findings from './screens/Findings';
import Verdict from './screens/Verdict';
import { story } from './story';

const STEPS = [
  { name: 'History', view: History },
  { name: 'Agents', view: Agents },
  { name: 'Findings', view: Findings },
  { name: 'Verdict', view: Verdict },
];

export default function App() {
  const [step, setStep] = useState(() => Math.max(0, Math.min(STEPS.length - 1, Number(new URLSearchParams(location.search).get('step') ?? 1) - 1)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      const n = Number(e.key);
      if (n >= 1 && n <= STEPS.length) setStep(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const View = STEPS[step].view;
  return (
    <div className="flex h-full flex-col">
      <nav className="flex h-14 shrink-0 items-center justify-between border-b border-line px-10">
        <div className="flex items-baseline gap-3">
          <span className="font-sans text-lg font-semibold">PipeOps</span>
          <span className="font-serif text-lg text-muted">evaluating screenpipe Workflows</span>
        </div>
        <ol className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={`flex h-9 items-center gap-2 rounded-md px-3 font-sans text-sm ${i === step ? 'bg-signal text-white' : 'text-muted hover:text-ink'}`}
              >
                <span className="font-mono text-xs">{i + 1}</span>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
        <span className="font-mono text-xs text-faint">
          {story.suite} · seed {story.seed} · engine {story.engine}
        </span>
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <View />
      </main>
    </div>
  );
}
