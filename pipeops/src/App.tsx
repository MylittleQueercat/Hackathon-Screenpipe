// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { useEffect, useState } from 'react';
import Intro from './screens/Intro';
import History from './screens/History';
import Agents from './screens/Agents';
import Findings from './screens/Findings';
import Verdict from './screens/Verdict';
import { story } from './story';

const STEPS = [
  { name: 'Workflows', view: Intro },
  { name: 'History', view: History },
  { name: 'Agents', view: Agents },
  { name: 'Findings', view: Findings },
  { name: 'Verdict', view: Verdict },
];

// One fixed 16:9 canvas, scaled to the window: the same layout on a laptop and a projector.
const W = 1600;
const H = 900;

export default function App() {
  const [step, setStep] = useState(() => Math.max(0, Math.min(STEPS.length - 1, Number(new URLSearchParams(location.search).get('step') ?? 1) - 1)));
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
      if (n >= 1 && n <= STEPS.length) setStep(n - 1);
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
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`flex h-10 items-center gap-2 rounded-md px-3 font-sans text-base ${i === step ? 'bg-signal text-white' : 'text-muted hover:text-ink'}`}
                >
                  <span className="font-mono text-sm">{i + 1}</span>
                  {s.name}
                </button>
              </li>
            ))}
          </ol>
          <span className="font-mono text-sm text-faint">
            {story.suite} · seed {story.seed} · engine {story.engine}
          </span>
        </nav>
        <main className="min-h-0 flex-1">
          <View />
        </main>
      </div>
    </div>
  );
}
