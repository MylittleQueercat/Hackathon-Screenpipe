import { useState } from 'react'
import { SequenceDiagram } from './Architecture'
import { candidates, fmtK, fmtRange, mid, review, sonnetRejections, tone, type CandidateId, type MetricKey } from '../data'

const IDS: CandidateId[] = ['baseline', 'clearer', 'preflight']
const TAG: Record<CandidateId, string> = { baseline: 'Upstream', clearer: 'Already validated', preflight: 'Our candidate' }

const METRICS: { key: MetricKey; label: string; unit?: string; format: (v: number) => string }[] = [
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
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone(id) }} />
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11px] font-semibold">{candidates[id].name}</span>
              <span className="block text-[11px] text-faint">{TAG[id]}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** One sentence on what B changes against A, from the numbers both sides have. */
function summary(a: CandidateId, b: CandidateId) {
  const d = (k: MetricKey) => {
    const va = mid(review[a].m[k])
    const vb = mid(review[b].m[k])
    return va === undefined || vb === undefined ? undefined : vb - va
  }
  const parts: string[] = []
  const rej = d('rejected')
  if (rej) parts.push(rej < 0 ? `${plural(-rej, 'refused call')} fewer` : `${plural(rej, 'refused call')} more`)
  const sec = d('seconds')
  if (sec) parts.push(sec < 0 ? `${Math.round(-sec)} s faster` : `${Math.round(sec)} s slower`)
  const req = d('requests')
  if (req) parts.push(req < 0 ? `${plural(Math.round(-req), 'request')} fewer` : `${plural(Math.round(req), 'request')} more`)
  return parts.length ? parts.join(', ') : 'no difference on the numbers measured so far'
}

export function Comparator({ flows = true }: { flows?: boolean }) {
  const [a, setA] = useState<CandidateId>('baseline')
  const [b, setB] = useState<CandidateId>('preflight')
  // Picking the engine already on the other side swaps the two instead of comparing an engine to itself.
  const pickA = (id: CandidateId) => (id === b ? (setB(a), setA(id)) : setA(id))
  const pickB = (id: CandidateId) => (id === a ? (setA(b), setB(id)) : setB(id))
  const ca = review[a].checks
  const cb = review[b].checks

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
      <p className="mt-2 text-sm text-muted">
        {ca && cb ? (ca === cb ? `Both pass ${ca} checks. ` : `Checks: ${ca} and ${cb}. `) : 'Checks are not graded for every engine yet. '}
        Lower is better on every row.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="num w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-normal text-faint">
              <th className="px-5 py-3 font-normal">Review stage, Sonnet, 1 run</th>
              <th className="px-5 py-3 font-mono font-semibold" style={{ color: tone(a) }}>{candidates[a].name}</th>
              <th className="px-5 py-3 font-mono font-semibold" style={{ color: tone(b) }}>{candidates[b].name}</th>
              <th className="px-5 py-3 font-normal">Difference</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const ra = review[a].m[m.key]
              const rb = review[b].m[m.key]
              const va = mid(ra)
              const vb = mid(rb)
              const both = va !== undefined && vb !== undefined
              const max = Math.max(va ?? 0, vb ?? 0, 1)
              const pct = both && va !== 0 ? Math.round(((vb - va) / va) * 100) : null
              const better = both && vb < va
              return (
                <tr key={m.key} className="border-t border-line align-middle">
                  <th scope="row" className="px-5 py-4 text-left font-medium">
                    {m.label}
                    {m.unit && <div className="text-xs font-normal text-faint">{m.unit}</div>}
                  </th>
                  {([[a, ra, va], [b, rb, vb]] as const).map(([id, r, v], i) => (
                    <td key={i} className="px-5 py-4">
                      {v === undefined ? (
                        <div className="text-sm text-faint">not measured yet</div>
                      ) : (
                        <>
                          <div className="display text-2xl font-semibold">{fmtRange(m.format, r)}</div>
                          <div className="mt-2 h-1.5 rounded-full bg-raised">
                            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(v / max) * 100}%`, background: tone(id) }} />
                          </div>
                        </>
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-4">
                    {!both ? (
                      <span className="text-faint">n/a</span>
                    ) : va === vb ? (
                      <span className="text-faint">same</span>
                    ) : (
                      <span className={`font-semibold ${better ? 'text-ours' : 'text-bad'}`}>
                        {better ? '−' : '+'}{m.format(Math.abs(vb - va))}
                        {pct !== null && <span className="ml-1.5 text-xs">({pct > 0 ? '+' : '−'}{Math.abs(pct)}%)</span>}
                        <span className="sr-only">{better ? ', better' : ', worse'}</span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {flows && (
      <div className="mt-10">
        <h3 className="display text-2xl font-semibold">What the flow looks like</h3>
        <p className="mt-1 text-sm text-muted">Same Review step, one diagram per engine. “Changed” marks what the engine does differently.</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {([a, b] as const).map((id) => (
            <div key={id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>{candidates[id].name}</span>
                <span className="text-right text-xs text-muted">
                  {id === 'baseline'
                    ? 'Refused calls not measured yet'
                    : sonnetRejections[id].length === 0
                      ? 'No refused call'
                      : sonnetRejections[id].map((r) => `${r.kind} ×${r.n}`).join(', ')}
                </span>
              </div>
              <SequenceDiagram id={id} />
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
