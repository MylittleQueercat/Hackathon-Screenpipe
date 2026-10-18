import { motion } from 'framer-motion'
import { ArchitectureFlow } from './components/Architecture'
import { Replay } from './components/Replay'
import { Comparator } from './components/Comparator'
import {
  candidates, fmtK, messages, sonnetRejections, sonnetReview, sonnetStages, tone,
  type CandidateId,
} from './data'
import { toggleTheme, useTheme } from './lib/theme'

const IDS: CandidateId[] = ['baseline', 'conflict', 'preflight']
const s = sonnetReview

function Section({ id, title, lead, children }: { id: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <h2 className="display max-w-3xl text-3xl font-semibold md:text-5xl">{title}</h2>
      {lead && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{lead}</p>}
      <div className="mt-10">{children}</div>
    </section>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-4 max-w-3xl text-xs leading-relaxed text-faint">{children}</p>

function ThemeToggle() {
  const dark = useTheme() === 'dark'
  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:text-fg"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
      )}
    </button>
  )
}

function Nav() {
  const links = [
    ['architecture', 'Architecture'],
    ['replay', 'Replay'],
    ['compare', 'Compare'],
    ['review', 'Refusals'],
    ['stages', 'All stages'],
  ]
  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5 font-semibold">
          <span className="display flex h-7 w-7 items-center justify-center rounded-lg bg-ours text-base text-on-ours">P</span>
          PipeOps <span className="hidden font-normal text-faint sm:inline">Review candidates</span>
        </a>
        <div className="flex items-center gap-6">
          <div className="hidden gap-5 text-sm text-muted lg:flex">
            {links.map(([h, l]) => (
              <a key={h} href={`#${h}`} className="transition hover:text-fg">{l}</a>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <header id="top" className="mx-auto max-w-6xl px-5 pb-6 pt-16 sm:px-8 md:pt-24">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="display max-w-4xl text-[2.75rem] font-semibold leading-[1.02] sm:text-6xl md:text-7xl"
      >
        Review should see the verdict before it publishes.
      </motion.h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
        We compared three engines for the Screenpipe Workflows Review agent. <b className="font-semibold text-fg">preflight-conflict</b> runs
        the real publish validation as a dry run on every draft read. Review keeps all 11 checks, no call is refused, and it finishes sooner.
      </p>

      <div className="mt-12" id="replay">
        <p className="mb-3 text-sm text-muted">The three Review runs, request by request. Press play or drag the slider.</p>
        <Replay />
        <Note>claude-sonnet-5 · snapshot 20261017T145651Z-baseline-receipts-s1 · stage 04-p1-workflow-review · 1 run per candidate</Note>
      </div>

      <div className="mt-14" id="compare">
        <h2 className="display text-3xl font-semibold md:text-4xl">Pick two engines and see the difference</h2>
        <p className="mb-5 mt-2 max-w-2xl text-sm text-muted">Same drafts, same prompt, one Review run each. Choose a version on each side.</p>
        <Comparator />
      </div>
    </header>
  )
}

function Messages() {
  const rows = [
    { id: 'baseline' as const, when: 'After a refused publish', lines: [messages.reject422, messages.baseline409] },
    { id: 'conflict' as const, when: 'After a refused publish', lines: [messages.reject422, messages.conflict409] },
    { id: 'preflight' as const, when: 'On the draft read, before any publish', lines: [messages.preflightFail, messages.preflightOk] },
  ]
  return (
    <div className="mt-6">
      <h3 className="display text-2xl font-semibold">What the agent reads back</h3>
      <p className="mt-1 text-sm text-muted">Real engine replies from the Sonnet Review runs.</p>
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="font-mono text-[13px] font-semibold" style={{ color: tone(r.id) }}>{candidates[r.id].name}</div>
            <div className="mb-3 text-xs text-faint">{r.when}</div>
            <div className="space-y-2">
              {r.lines.map((l, j) => (
                <pre key={j} className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-muted">{l}</pre>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <Hero />

      <Section
        id="architecture"
        title="Three engines, one Review loop"
        lead="Same agent, same prompt, same snapshot. Only the engine’s answers change. Each diagram follows one Review run; a dashed arrow is the engine replying, a “changed” tag marks what the candidate alters."
      >
        <div className="-mt-4">
          {IDS.map((id, i) => <ArchitectureFlow key={id} id={id} index={i} />)}
        </div>
        <Messages />
      </Section>

      <Section
        id="review"
        title="What each engine was refused on"
        lead="Every refused workspace call in the Review runs above, by kind. The Review stage was replayed from the same saved snapshot, so every candidate starts from identical drafts."
      >
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {IDS.map((id) => (
            <div key={id} className="border-t border-line pt-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>{candidates[id].name}</span>
                <span className="num text-sm font-semibold">{s[id].checks} checks</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {sonnetRejections[id].length === 0 ? (
                  <li className="text-ours">No refused call.</li>
                ) : (
                  sonnetRejections[id].map((r) => (
                    <li key={r.kind} className="flex justify-between gap-3 text-muted">
                      <span>{r.kind}</span>
                      <span className="num font-semibold text-bad">×{r.n}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
        <Note>
          claude-sonnet-5 · 1 run per candidate · checks graded with the current truth.json (the snapshot’s older truth.json gives 10/11 to all three, on missing_date).
        </Note>
      </Section>

      <Section
        id="stages"
        title="The gain is where the patch is"
        lead="Each stage replayed from the same snapshot. Discover and Maintain don’t move, as expected: the patch targets Review."
      >
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-normal text-faint">
                {['Stage', 'Engine', 'Checks', 'Requests', 'Runtime', 'Refused', 'Cache read'].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            {sonnetStages.map((st) => (
              <tbody key={st.stage} className="border-t border-line">
                {(['b', 'p'] as const).map((k) => {
                  const r = st[k]
                  const o = st[k === 'b' ? 'p' : 'b']
                  const cmp = (a: number, c: number) => (k === 'p' && a < c ? 'font-semibold text-ours' : k === 'p' && a > c ? 'font-semibold text-bad' : '')
                  return (
                    <tr key={k} className={st.stage.includes('Review') ? 'bg-ours/[0.06]' : ''}>
                      <th scope="row" className="py-1.5 pl-1 pr-4 text-left font-medium">{k === 'b' ? st.stage : ''}</th>
                      <td className="py-1.5 pr-4 font-mono text-[12px]" style={{ color: tone(k === 'b' ? 'baseline' : 'preflight') }}>{k === 'b' ? 'baseline' : 'preflight-conflict'}</td>
                      <td className={`py-1.5 pr-4 ${k === 'p' && r.checks !== o.checks ? 'font-semibold text-bad' : ''}`}>{r.checks}</td>
                      <td className={`py-1.5 pr-4 ${cmp(r.requests, o.requests)}`}>{r.requests}</td>
                      <td className={`py-1.5 pr-4 ${cmp(r.seconds, o.seconds)}`}>{r.seconds} s</td>
                      <td className={`py-1.5 pr-4 ${cmp(r.rejected, o.rejected)}`}>{r.rejected}</td>
                      <td className={`py-1.5 pr-4 ${cmp(r.cacheRead, o.cacheRead)}`}>{fmtK(r.cacheRead)}</td>
                    </tr>
                  )
                })}
                {st.note && (
                  <tr><td colSpan={7} className="pb-3 pl-1 pt-1 text-xs text-muted">{st.note}</td></tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
        <Note>claude-sonnet-5 · 1 run per stage and engine · checks per stage only cover what that stage can affect</Note>
      </Section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-5 py-12 sm:px-8">
          <div className="display text-3xl font-semibold">Prove it before you ship it.</div>
          <p className="max-w-md text-xs leading-relaxed text-faint">
            Every number here is Claude Sonnet, one run per candidate and stage. Small samples are labeled as such.
          </p>
        </div>
      </footer>
    </div>
  )
}
