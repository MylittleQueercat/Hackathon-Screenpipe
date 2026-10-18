import { useState } from 'react'
import { SequenceDiagram } from './Architecture'
import { candidates, fmtK, sonnetRejections, sonnetReview, tone, type CandidateId } from '../data'

const IDS: CandidateId[] = ['baseline', 'conflict', 'preflight']
const TAG: Record<CandidateId, string> = { baseline: 'Today', conflict: 'Candidate', preflight: 'Our candidate' }

type Metric = { key: 'rejected' | 'seconds' | 'requests' | 'output' | 'cacheRead' | 'input'; label: string; unit?: string; format: (v: number) => string }

const METRICS: Metric[] = [
  { key: 'rejected', label: 'Refused workspace calls', unit: '409, 422 or clipped', format: (v) => `${v}` },
  { key: 'seconds', label: 'Runtime', format: (v) => `${Math.round(v)} s` },
  { key: 'requests', label: 'Model requests', format: (v) => `${v}` },
  { key: 'output', label: 'Output tokens', format: fmtK },
  { key: 'cacheRead', label: 'Cache read tokens', format: fmtK },
  { key: 'input', label: 'Input tokens', format: fmtK },
]

function Picker({ label, value, onChange, other }: { label: string; value: CandidateId; onChange: (id: CandidateId) => void; other: CandidateId }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-1 rounded-xl border border-line bg-surface p-1 sm:grid-cols-3">
      {IDS.map((id) => {
        const on = value === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${on ? 'bg-raised shadow-sm' : 'hover:bg-raised/60'} ${id === other ? 'opacity-50' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone(id) }} />
            <span>
              <span className="block font-mono text-[11px] font-semibold">{candidates[id].name}</span>
              <span className="block text-[11px] text-faint">{TAG[id]}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Short sentence on what B changes against A, written from the numbers. */
function summary(a: CandidateId, b: CandidateId) {
  const A = sonnetReview[a]
  const B = sonnetReview[b]
  const part = (d: number, fewer: string, more: string) => (d === 0 ? null : d < 0 ? `${fewer}` : `${more}`)
  const parts = [
    part(B.rejected - A.rejected, `${plural(A.rejected - B.rejected, 'refused call')} fewer`, `${plural(B.rejected - A.rejected, 'refused call')} more`),
    part(B.seconds - A.seconds, `${Math.round(A.seconds - B.seconds)} s faster`, `${Math.round(B.seconds - A.seconds)} s slower`),
    part(B.requests - A.requests, `${plural(A.requests - B.requests, 'request')} fewer`, `${plural(B.requests - A.requests, 'request')} more`),
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'No difference on these three numbers'
}

export function Comparator() {
  const [a, setA] = useState<CandidateId>('baseline')
  const [b, setB] = useState<CandidateId>('preflight')
  // Picking the engine already on the other side swaps the two instead of comparing an engine to itself.
  const pickA = (id: CandidateId) => (id === b ? (setB(a), setA(id)) : setA(id))
  const pickB = (id: CandidateId) => (id === a ? (setA(b), setB(id)) : setB(id))
  const A = sonnetReview[a]
  const B = sonnetReview[b]

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <Picker label="First engine" value={a} onChange={pickA} other={b} />
        <span className="text-center text-sm text-muted">against</span>
        <Picker label="Second engine" value={b} onChange={pickB} other={a} />
      </div>

      <p className="display mt-8 max-w-3xl text-2xl font-semibold leading-snug md:text-3xl" aria-live="polite">
        <span className="font-mono text-[0.8em]" style={{ color: tone(b) }}>{candidates[b].name}</span> vs{' '}
        <span className="font-mono text-[0.8em]" style={{ color: tone(a) }}>{candidates[a].name}</span>: {summary(a, b)}.
      </p>
      <p className="mt-2 text-sm text-muted">Both pass {A.checks === B.checks ? `${A.checks} checks` : `${A.checks} and ${B.checks} checks`}. Lower is better on every row.</p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="num w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-normal text-faint">
              <th className="px-5 py-3 font-normal">Review stage, Sonnet</th>
              <th className="px-5 py-3 font-mono font-semibold" style={{ color: tone(a) }}>{candidates[a].name}</th>
              <th className="px-5 py-3 font-mono font-semibold" style={{ color: tone(b) }}>{candidates[b].name}</th>
              <th className="px-5 py-3 font-normal">Difference</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const va = A[m.key]
              const vb = B[m.key]
              const max = Math.max(va, vb, 1)
              const pct = va === 0 ? null : Math.round(((vb - va) / va) * 100)
              const better = vb < va
              const worse = vb > va
              return (
                <tr key={m.key} className="border-t border-line align-middle">
                  <th scope="row" className="px-5 py-4 text-left font-medium">
                    {m.label}
                    {m.unit && <div className="text-xs font-normal text-faint">{m.unit}</div>}
                  </th>
                  {([[a, va], [b, vb]] as const).map(([id, v], i) => (
                    <td key={i} className="px-5 py-4">
                      <div className="display text-2xl font-semibold">{m.format(v)}</div>
                      <div className="mt-2 h-1.5 rounded-full bg-raised">
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(v / max) * 100}%`, background: tone(id) }} />
                      </div>
                    </td>
                  ))}
                  <td className="px-5 py-4">
                    {va === vb ? (
                      <span className="text-faint">same</span>
                    ) : (
                      <span className={`font-semibold ${better ? 'text-ours' : 'text-bad'}`}>
                        {better ? '−' : '+'}{m.format(Math.abs(vb - va))}
                        {pct !== null && <span className="ml-1.5 text-xs">({pct > 0 ? '+' : '−'}{Math.abs(pct)}%)</span>}
                        <span className="sr-only">{better ? ', better' : worse ? ', worse' : ''}</span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <h3 className="display text-2xl font-semibold">What the flow looks like</h3>
        <p className="mt-1 text-sm text-muted">Same Review run, one diagram per engine. “Changed” marks what the engine does differently.</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {([a, b] as const).map((id) => (
            <div key={id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>{candidates[id].name}</span>
                <span className="text-xs text-muted">
                  {sonnetRejections[id].length === 0 ? 'No refused call' : sonnetRejections[id].map((r) => `${r.kind} ×${r.n}`).join(', ')}
                </span>
              </div>
              <SequenceDiagram id={id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
