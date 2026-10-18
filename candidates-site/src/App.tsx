import { useEffect, useRef, useState } from 'react'
import { Comparator } from './components/Comparator'
import { Replay } from './components/Replay'
import { candidates, fmtK, mid, review, sonnetStages, tone, type CandidateId } from './data'
import { toggleTheme, useTheme } from './lib/theme'

const IDS: CandidateId[] = ['baseline', 'clearer', 'preflight']
const SLIDES = ['Claim', 'Three engines', 'Replay', 'Compare', 'Takeaways']

const val = (id: CandidateId, k: 'requests' | 'seconds' | 'rejected') => mid(review[id].m[k])
const pctChange = (a: number, b: number) => Math.round(((b - a) / a) * 100)

function Slide({ id, title, lead, children }: { id: string; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section id={id} data-slide className="flex min-h-screen items-center py-24">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="display max-w-4xl text-4xl font-semibold leading-[1.05] md:text-6xl">{title}</h2>
        {lead && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">{lead}</p>}
        {children && <div className="mt-10">{children}</div>}
      </div>
    </section>
  )
}

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

/** Tracks the visible slide and moves between slides with the arrow keys, space and page keys. */
function useSlides() {
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-slide]')]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            const i = els.indexOf(e.target as HTMLElement)
            activeRef.current = i
            setActive(i)
          }
      },
      { threshold: 0.5 },
    )
    els.forEach((el) => io.observe(el))
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, button, [role=radio]') && (e.key === ' ' || e.key === 'Enter')) return
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? -1 : 0
      if (!next) return
      e.preventDefault()
      els[Math.min(Math.max(activeRef.current + next, 0), els.length - 1)]?.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      io.disconnect()
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return active
}

function Chrome({ active }: { active: number }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5 font-semibold">
            <span className="display flex h-7 w-7 items-center justify-center rounded-lg bg-ours text-base text-on-ours">P</span>
            PipeOps
          </a>
          <div className="flex items-center gap-4">
            <span className="num text-sm text-muted">{SLIDES[active]} · {active + 1} / {SLIDES.length}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <nav aria-label="Slides" className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        {SLIDES.map((s, i) => (
          <a
            key={s}
            href={`#slide-${i}`}
            aria-label={`Go to ${s}`}
            aria-current={i === active}
            className={`h-2.5 w-2.5 rounded-full border border-faint transition ${i === active ? 'scale-125 border-ours bg-ours' : 'hover:bg-faint'}`}
          />
        ))}
      </nav>
    </>
  )
}

function Big({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <div className="display num whitespace-nowrap text-5xl font-semibold text-ours md:text-6xl">{value}</div>
      <div className="mt-2 text-base md:text-lg">{label}</div>
      {sub && <div className="mt-0.5 text-sm text-faint">{sub}</div>}
    </div>
  )
}

const summaries: Record<CandidateId, { line: string; steps: { text: string; kind?: 'fail' | 'ok' }[] }> = {
  baseline: {
    line: 'Review publishes, and learns what was wrong only when the engine refuses.',
    steps: [
      { text: 'Read drafts' },
      { text: 'Publish' },
      { text: 'Refused, with no hint which item or why', kind: 'fail' },
      { text: 'Retry or drop items blindly' },
    ],
  },
  clearer: {
    line: 'The refusal now names each failing item and why. Still after the write attempt.',
    steps: [
      { text: 'Read drafts' },
      { text: 'Publish' },
      { text: '422 names each failing item and why', kind: 'fail' },
      { text: 'Fix and publish again' },
    ],
  },
  preflight: {
    line: 'The verdict comes with the draft, from a dry run of the real validation.',
    steps: [
      { text: 'Read drafts, with the publish verdict' },
      { text: 'Fix before publishing' },
      { text: 'Publish, first try', kind: 'ok' },
      { text: 'Finish ends Review' },
    ],
  },
}

function Engines() {
  return (
    <div className="grid gap-10 md:grid-cols-3 md:gap-8">
      {IDS.map((id, i) => {
        const s = summaries[id]
        const r = val(id, 'requests')
        const sec = val(id, 'seconds')
        const rej = val(id, 'rejected')
        return (
          <div key={id} className={`border-t-2 pt-5 ${id === 'preflight' ? 'border-ours' : 'border-line'}`}>
            <div className="text-sm text-muted">{['Today', 'Already validated', 'Our candidate'][i]}</div>
            <div className="mt-1 font-mono text-xl font-semibold" style={{ color: tone(id) }}>{candidates[id].name}</div>
            <p className="mt-3 min-h-[3.5rem] text-base leading-snug text-muted">{s.line}</p>
            <ol className="mt-5 space-y-2.5">
              {s.steps.map((st, j) => (
                <li key={j} className="flex items-start gap-3 text-[15px]">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${st.kind === 'fail' ? 'bg-bad' : st.kind === 'ok' ? 'bg-ours' : 'bg-faint'}`} />
                  <span className={st.kind === 'fail' ? 'text-bad' : ''}>{st.text}</span>
                </li>
              ))}
            </ol>
            <dl className="num mt-6 grid grid-cols-3 gap-3 border-t border-line pt-4">
              {[
                ['requests', r === undefined ? '—' : `${r}`],
                ['refused', rej === undefined ? '—' : `${rej}`],
                ['runtime', sec === undefined ? '—' : `${Math.round(sec)} s`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dd className={`display text-2xl font-semibold ${k === 'refused' && v === '0' ? 'text-ours' : ''}`}>{v}</dd>
                  <dt className="text-xs text-muted">{v === '—' ? `${k}, not measured` : k}</dt>
                </div>
              ))}
            </dl>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const active = useSlides()
  const base = val('baseline', 'seconds')!
  const clear = val('clearer', 'seconds')!
  const pre = val('preflight', 'seconds')!
  const baseReq = val('baseline', 'requests')!
  const preReq = val('preflight', 'requests')!
  const review4 = sonnetStages.find((s) => s.stage.includes('Review'))!
  const others = sonnetStages.filter((s) => !s.stage.includes('Review'))

  return (
    <div id="top" className="min-h-screen bg-bg">
      <Chrome active={active} />

      <div id="slide-0" />
      <Slide
        id="claim"
        title="Review should see the verdict before it publishes."
        lead={
          <>
            We compared three engines for the Screenpipe Workflows Review agent. <b className="font-semibold text-fg">preflight-conflict</b> runs
            the real publish validation as a dry run on every draft read.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-10 md:grid-cols-4">
          <Big value={`${pctChange(base, pre)}%`.replace('-', '−')} label="runtime" sub={`${Math.round(base)} → ${Math.round(pre)} s, vs baseline`} />
          <Big value={`${baseReq} → ${preReq}`} label="model requests" sub="vs baseline" />
          <Big value="0" label="refused calls" sub={`clearer-rejection: ${val('clearer', 'rejected')}`} />
          <Big value="11/11" label="checks kept" sub="preflight-conflict" />
        </div>
        <p className="mt-8 text-sm text-faint">Claude Sonnet 5 · Review stage · same saved snapshot · 1 run per engine</p>
      </Slide>

      <div id="slide-1" />
      <Slide id="engines" title="Three engines, one Review step." lead="Same agent, same prompt, same drafts. Only the engine’s answers change.">
        <Engines />
      </Slide>

      <div id="slide-2" />
      <Slide id="replay" title="Watch the runs, request by request." lead="Each tick is a model request, each dot a workspace call. Red is the engine saying no. All three on the same time axis.">
        <Replay />
        <p className="mt-3 text-xs text-faint">Baseline: requests and calls come from the saved snapshot’s request log, which does not record each call’s reply, so its dots are grey.</p>
      </Slide>

      <div id="slide-3" />
      <Slide id="compare" title="Pick two engines, see the difference.">
        <Comparator flows={false} />
      </Slide>

      <div id="slide-4" />
      <Slide id="takeaways" title="Fewer retries, same quality.">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <h3 className="display text-2xl font-semibold text-ours">What we can say</h3>
            <ul className="mt-4 space-y-3 text-base leading-snug">
              <li>Zero refused calls in Review, against {val('clearer', 'rejected')} for clearer-rejection.</li>
              <li>{Math.abs(pctChange(clear, pre))}% faster than clearer-rejection, {Math.abs(pctChange(base, pre))}% faster than baseline.</li>
              <li>Output tokens drop from {fmtK(review.baseline.m.output![0])} to {fmtK(review.preflight.m.output![0])}.</li>
              <li>All {review4.p.checks} checks kept on the Review stage.</li>
            </ul>
          </div>
          <div>
            <h3 className="display text-2xl font-semibold">What stays the same</h3>
            <ul className="mt-4 space-y-3 text-base leading-snug">
              {others.map((s) => (
                <li key={s.stage}>
                  {s.stage.replace(/^\d+ /, '')}: {s.b.requests} → {s.p.requests} requests
                  {s.b.checks !== s.p.checks ? `, ${s.p.checks} checks instead of ${s.b.checks}, likely variance (1 run)` : ''}.
                </li>
              ))}
              <li className="text-muted">Compared with clearer-rejection. The patch targets Review.</li>
            </ul>
          </div>
          <div>
            <h3 className="display text-2xl font-semibold">Not shown yet</h3>
            <ul className="mt-4 space-y-3 text-base leading-snug text-muted">
              <li>One run per engine. Repeated runs would show the spread.</li>
              <li>The baseline’s refused calls and checks are not measured yet.</li>
              <li>Sonnet only. A full run exists for preflight-conflict alone, so no end-to-end comparison.</li>
            </ul>
          </div>
        </div>
        <p className="mt-14 display text-3xl font-semibold md:text-4xl">Prove it before you ship it.</p>
      </Slide>
    </div>
  )
}
