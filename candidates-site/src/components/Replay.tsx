import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { candidates, review, timelines, tone, type CandidateId, type TimelineEvent } from '../data'

const ORDER: CandidateId[] = ['baseline', 'clearer', 'preflight']
const PLAY_MS = 14000

type WsEvent = Extract<TimelineEvent, { k: 'ws' }>

const lastT = (id: CandidateId) => Math.max(review[id].m.seconds![0], ...timelines[id].map((e) => e.t))

/** Workspace calls that land within 2.5 s of each other are nudged apart so every dot stays clickable. */
function clusterOffsets(evs: TimelineEvent[]) {
  const offsets = new Map<TimelineEvent, number>()
  let prevT = -Infinity
  let k = 0
  for (const e of evs) {
    if (e.k !== 'ws') continue
    k = e.t - prevT < 2.5 ? k + 1 : 0
    offsets.set(e, k * 14)
    prevT = e.t
  }
  return offsets
}

const LETTER: Record<string, string> = { context: 'C', publish: 'P', handoff: 'H', finish: 'F' }
const shortMsg = (msg?: string) => (msg ? msg.replace('Workflow operation failed: ', '') : '')

export function Replay() {
  const horizon = useMemo(() => Math.ceil(Math.max(...ORDER.map(lastT)) / 10) * 10 + 5, [])
  const step = horizon > 200 ? 50 : 20
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<{ id: CandidateId; e: WsEvent } | null>(null)
  const raf = useRef<number>()
  const started = useRef<number>()
  const root = useRef<HTMLDivElement>(null)
  const autoplayed = useRef(false)

  useEffect(() => {
    if (!playing) return
    const startT = t >= horizon ? 0 : t
    started.current = performance.now() - (startT / horizon) * PLAY_MS
    const tick = (now: number) => {
      const p = Math.min((now - (started.current ?? now)) / PLAY_MS, 1)
      setT(p * horizon)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, horizon])

  useEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !autoplayed.current) {
          autoplayed.current = true
          setTimeout(() => setPlaying(true), 400)
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const x = (sec: number) => `${(sec / horizon) * 100}%`

  return (
    <div ref={root} className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-4">
        <button
          onClick={() => {
            if (t >= horizon) setT(0)
            setPlaying((p) => !p)
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ours text-on-ours transition hover:scale-105"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1l10 6-10 6z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="num w-24">
          <div className="display text-3xl font-semibold">{t.toFixed(0)} s</div>
          <div className="text-xs text-faint">wall-clock</div>
        </div>
        <input
          type="range"
          min={0}
          max={horizon}
          step={0.5}
          value={t}
          aria-label="Replay position in seconds"
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          className="min-w-[160px] flex-1 accent-[rgb(var(--ours))]"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 bg-faint" />model request</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-ours" />call accepted</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-bad" />call refused</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-faint" />outcome not recorded</span>
        </div>
      </div>

      <div className="px-5 py-5">
        {ORDER.map((id) => {
          const c = candidates[id]
          const evs = timelines[id]
          const end = lastT(id)
          const reqs = evs.filter((e) => e.k === 'req' && e.t <= t).length
          const fails = evs.filter((e) => e.k === 'ws' && e.ok === false && e.t <= t).length
          const unknown = evs.some((e) => e.k === 'ws' && e.ok === null)
          const done = t >= end
          const offsets = clusterOffsets(evs)
          return (
            <div key={id} className="grid items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[190px_1fr_150px]">
              <div className="font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>{c.name}</div>
              <div className="relative h-14 rounded-lg bg-raised">
                <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: x(Math.min(t, end)), background: tone(id, 0.14) }} />
                {evs.map((e, i) => {
                  if (e.t > t) return null
                  if (e.k === 'req')
                    return <span key={i} className="absolute top-1.5 h-3 w-0.5 bg-faint" style={{ left: x(e.t) }} />
                  if (e.k === 'ws') {
                    const isSel = selected?.id === id && selected.e === e
                    return (
                      <motion.button
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                        onClick={() => setSelected(isSel ? null : { id, e })}
                        className={`absolute top-[26px] flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold text-on-ours ${
                          e.ok === null ? 'bg-faint' : e.ok ? 'bg-ours' : 'bg-bad ring-4 ring-bad/25'
                        } ${isSel ? 'outline outline-2 outline-offset-2 outline-fg' : ''}`}
                        style={{ left: `calc(${x(e.t)} + ${offsets.get(e) ?? 0}px)` }}
                        aria-label={`${e.action}, ${e.ok === null ? 'outcome not recorded' : e.ok ? 'accepted' : 'refused'}, at ${e.t} seconds`}
                      >
                        {e.ok === null ? '·' : e.ok ? LETTER[e.action] ?? '·' : '✕'}
                      </motion.button>
                    )
                  }
                  return null
                })}
                {done && <div className="absolute top-0 h-full border-r-2 border-dashed" style={{ left: x(end), borderColor: tone(id) }} />}
                <div className="absolute top-0 h-full w-px bg-fg/70" style={{ left: x(Math.min(t, horizon)) }} />
              </div>
              <div className="num flex gap-5 text-sm md:justify-end">
                <span><b className="text-lg font-semibold">{reqs}</b> <span className="text-xs text-muted">requests</span></span>
                <span><b className={`text-lg font-semibold ${fails ? 'text-bad' : ''}`}>{unknown ? '—' : fails}</b> <span className="text-xs text-muted">{unknown ? 'refused, not recorded' : 'refused'}</span></span>
              </div>
            </div>
          )
        })}
        <div className="relative mt-1 h-5 md:ml-[206px] md:mr-[166px]">
          {Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step).map((s) => (
            <span key={s} className="num absolute -translate-x-1/2 text-[11px] text-faint" style={{ left: x(s) }}>{s}s</span>
          ))}
        </div>
      </div>

      <div className="min-h-[76px] border-t border-line bg-raised/50 px-5 py-4 text-sm">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={`${selected.id}-${selected.e.t}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-xs text-muted">
                {candidates[selected.id].name} · {selected.e.t} s · {selected.e.action} · {selected.e.ok === null ? 'outcome not recorded' : selected.e.ok ? 'accepted' : 'refused'}
              </div>
              <div className={`mt-1 font-mono text-[12px] leading-relaxed ${selected.e.ok === null ? 'text-muted' : selected.e.ok ? 'text-ours' : 'text-bad'}`}>
                {selected.e.ok ? `workflow_workspace.${selected.e.action} → ok` : shortMsg(selected.e.msg)}
              </div>
            </motion.div>
          ) : (
            <p className="text-muted">Select a dot to read the engine’s reply. C read context · H handoff · P publish · F finish.</p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
