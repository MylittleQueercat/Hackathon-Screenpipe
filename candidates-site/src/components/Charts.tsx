import { motion } from 'framer-motion'
import { candidates, tone, type CandidateId } from '../data'

const IDS: CandidateId[] = ['baseline', 'conflict', 'preflight']

const TAG: Record<CandidateId, string> = { baseline: 'Today', conflict: 'Candidate', preflight: 'Our candidate' }

/** Metric rows x candidate columns. Lower is better; the best cell in each row is marked and
 *  every other cell shows its change against today's engine. */
export function ResultsMatrix({
  rows,
}: {
  rows: { label: string; unit?: string; values: Record<CandidateId, number>; format?: (v: number) => string }[]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="num w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            <th className="w-[24%] px-5 py-4 text-xs font-normal text-faint">Review stage, Sonnet<br />Lower is better</th>
            {IDS.map((id) => (
              <th key={id} className={`px-5 py-4 ${id === 'preflight' ? 'bg-ours/[0.08]' : ''}`}>
                <div className="text-xs font-normal text-faint">{TAG[id]}</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>{candidates[id].name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const max = Math.max(...IDS.map((id) => r.values[id]), 1)
            const best = Math.min(...IDS.map((id) => r.values[id]))
            const f = r.format ?? ((v: number) => `${v}`)
            const base = r.values.baseline
            return (
              <tr key={r.label} className="border-t border-line align-middle">
                <th scope="row" className="px-5 py-4 text-left font-medium">
                  {r.label}
                  {r.unit && <div className="text-xs font-normal text-faint">{r.unit}</div>}
                </th>
                {IDS.map((id, i) => {
                  const v = r.values[id]
                  const isBest = v === best && IDS.some((o) => r.values[o] !== v)
                  const delta = id === 'baseline' || base === 0 ? null : Math.round(((v - base) / base) * 100)
                  return (
                    <td key={id} className={`px-5 py-4 ${id === 'preflight' ? 'bg-ours/[0.08]' : ''}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`display text-2xl font-semibold ${isBest ? 'text-ours' : ''}`}>{f(v)}</span>
                        {delta !== null && delta !== 0 && (
                          <span className={`text-xs font-semibold ${delta < 0 ? 'text-ours' : 'text-bad'}`}>
                            {delta > 0 ? '+' : '−'}{Math.abs(delta)}% vs today
                          </span>
                        )}
                        {isBest && <span className="text-xs font-semibold text-ours">best</span>}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-raised">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: tone(id) }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(v / max) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Every run as a dot on a shared axis, so spread and overlap are visible. */
export function RunDots({
  title,
  series,
  format = (v) => `${v}`,
}: {
  title: string
  series: { id: CandidateId; label: string; values: number[] }[]
  format?: (v: number) => string
}) {
  const hi = Math.max(...series.flatMap((s) => s.values)) * 1.08
  const x = (v: number) => `${(v / hi) * 100}%`
  return (
    <figure className="border-t border-line pt-5">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="mt-4 space-y-4">
        {series.map((s) => {
          const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length
          return (
            <div key={s.id}>
              <div className="mb-1.5 flex justify-between gap-3 text-xs text-muted">
                <span>{s.label}</span>
                <span className="num">
                  {format(Math.min(...s.values))} to {format(Math.max(...s.values))}, mean{' '}
                  <b className="font-semibold text-fg">{format(Math.round(mean * 10) / 10)}</b>
                </span>
              </div>
              <div className="relative h-6 rounded-md bg-raised" role="img" aria-label={`${s.label}: ${s.values.map(format).join(', ')}`}>
                {s.values.map((v, i) => (
                  <span
                    key={i}
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                    style={{ left: x(v), background: tone(s.id) }}
                  />
                ))}
                <span className="absolute inset-y-1 w-0.5 rounded bg-fg/70" style={{ left: x(mean) }} />
              </div>
            </div>
          )
        })}
      </div>
    </figure>
  )
}
