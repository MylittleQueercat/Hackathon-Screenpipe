// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useState } from 'react';
import Intro from './screens/Intro';
import Exam from './screens/Exam';
import Race from './screens/Race';
import Live from './screens/Live';
import Result from './screens/Result';
import History from './screens/History';
import Agents from './screens/Agents';
import Findings from './screens/Findings';
import Verdict from './screens/Verdict';

// The five slides tell the story; the annex holds the detail for questions.
const STEPS = [
  { key: '1', name: 'Workflows', view: Intro },
  { key: '2', name: 'The exam', view: Exam },
  { key: '3', name: 'The run', view: Race },
  { key: '4', name: 'Live', view: Live },
  { key: '5', name: 'Result', view: Result },
  { key: 'A1', name: 'History', view: History, annex: true },
  { key: 'A2', name: 'Agents', view: Agents, annex: true },
  { key: 'A3', name: 'Grader', view: Findings, annex: true },
  { key: 'A4', name: 'Full results', view: Verdict, annex: true },
];

// One fixed 16:9 canvas, scaled to the window: the same layout on a laptop and a projector.
const W = 1600;
const H = 900;

export default function App() {
  const [step, setStep] = useState(() => Math.max(0, Math.min(STEPS.length - 1, (() => { const q = new URLSearchParams(location.search).get('step') ?? '1'; const i = STEPS.findIndex((x) => x.key.toLowerCase() === q.toLowerCase()); return i >= 0 ? i : Number(q) - 1; })())));
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setStep(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const View = STEPS[step].view;
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-bone">
      <div className="flex shrink-0 flex-col" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <nav className="flex h-16 shrink-0 items-center justify-between border-b border-line px-10">
          <div className="flex items-baseline gap-3">
            <span className="font-sans text-xl font-semibold">PipeOps</span>
            <span className="font-serif text-xl text-muted">evaluating screenpipe Workflows</span>
          </div>
          <ol className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <li key={s.name} className="flex items-center">
                {s.key === 'A1' && <span className="ml-4 mr-2 border-l border-line pl-4 font-sans text-sm text-faint">Annex</span>}
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`flex h-10 items-center gap-2 rounded-md px-3 font-sans text-base ${i === step ? 'bg-signal text-white' : 'text-muted hover:text-ink'}`}
                >
                  <span className="font-mono text-sm">{s.key}</span>
                  {s.name}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <main className="min-h-0 flex-1">
          <View />
        </main>
      </div>
    </div>
  );
}
