import { motion } from 'framer-motion'
import { candidates, tone, type CandidateId } from '../data'

const IDS: CandidateId[] = ['baseline', 'conflict', 'preflight']

/** Metric rows x candidate columns. Each cell is a value plus a bar scaled to the row maximum. */
export function ResultsMatrix({
  rows,
}: {
  rows: { label: string; unit?: string; values: Record<CandidateId, number>; format?: (v: number) => string }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            <th className="w-[22%] pb-3 pr-4 text-xs font-normal text-faint">Lower is better</th>
            {IDS.map((id) => (
              <th key={id} className="pb-3 pr-6 font-mono text-[13px] font-semibold" style={{ color: tone(id) }}>
                {candidates[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const max = Math.max(...IDS.map((id) => r.values[id]), 1)
            const f = r.format ?? ((v: number) => `${v}`)
            const base = r.values.baseline
            return (
              <tr key={r.label} className="border-t border-line align-middle">
                <th scope="row" className="py-4 pr-4 text-left font-medium">
                  {r.label}
                  {r.unit && <div className="text-xs font-normal text-faint">{r.unit}</div>}
                </th>
                {IDS.map((id, i) => {
                  const v = r.values[id]
                  const delta = id === 'baseline' || base === 0 ? null : Math.round(((v - base) / base) * 100)
                  return (
                    <td key={id} className="py-4 pr-6">
                      <div className="flex items-baseline gap-2">
                        <span className="display text-2xl font-semibold">{f(v)}</span>
                        {delta !== null && (
                          <span className={`text-xs font-semibold ${delta < 0 ? 'text-ours' : delta > 0 ? 'text-bad' : 'text-faint'}`}>
                            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                            {Math.abs(delta)}%
                          </span>
                        )}
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
