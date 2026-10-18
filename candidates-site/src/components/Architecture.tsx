import { candidates, fmtK, fmtRange, review, tone, type CandidateId } from '../data'

/** One message between the Review agent (left lane) and the Workflow engine (right lane). */
type Msg = {
  dir: 'to-engine' | 'to-agent'
  label: string
  sub?: string
  kind?: 'fail' | 'ok' | 'waste'
  changed?: boolean
}

const flows: Record<CandidateId, { heading: string; intro: string; delta: string; note?: string; msgs: Msg[] }> = {
  baseline: {
    heading: 'How Screenpipe works today',
    intro:
      'Review reads the drafts and publishes. When the engine refuses, its error does not say which items failed or why, so Review retries or drops items without knowing what to fix.',
    delta: 'Upstream Workflows as shipped.',
    note: 'Simplified. This run’s request log records the calls but not each reply.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts and evidence' },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: 'Publish refused, items dropped', sub: 'Does not say which items failed or why.', kind: 'fail' },
      { dir: 'to-engine', label: 'Retry, or drop items', sub: 'Review has to guess what to fix.' },
      { dir: 'to-agent', label: 'Published', sub: 'After many more requests.', kind: 'ok' },
      { dir: 'to-engine', label: 'Finish' },
    ],
  },
  clearer: {
    heading: 'clearer-rejection',
    intro:
      'Rejections now name each failing item and the reason, and citation matching works to the second. Review retries far less, but still only learns what is wrong after a publish is refused.',
    delta: 'Changes the 422 message and citation matching.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts and evidence' },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: '422 · Stage 1 retained 0 of 3 items, each one named with its reason', sub: 'The verdict still arrives after the write attempt.', kind: 'fail', changed: true },
      { dir: 'to-engine', label: 'Fix the draft, publish again' },
      { dir: 'to-agent', label: '409 · Workspace changed', sub: '“Read context before publishing.”', kind: 'fail' },
      { dir: 'to-engine', label: 'Read context again', sub: 'Extra round-trip, then retry' },
      { dir: 'to-agent', label: 'Published', kind: 'ok' },
      { dir: 'to-engine', label: 'Finish' },
      { dir: 'to-agent', label: 'Asks for one more summary turn', sub: 'An extra request, nothing changes.', kind: 'waste' },
    ],
  },
  preflight: {
    heading: 'preflight-conflict',
    intro:
      'Every draft read already includes the publish verdict, computed by a dry run of the real validation. Review fixes the draft before it publishes.',
    delta: 'On top of clearer-rejection: adds the dry run, puts the revision in 409s, and ends Review on finish.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts, evidence and publicationCheck: ok false', sub: 'The 422 Review would have hit. No write, no lock.', kind: 'fail', changed: true },
      { dir: 'to-engine', label: 'Fix the draft, hand it off', sub: 'workspace.handoff' },
      { dir: 'to-agent', label: 'publicationCheck: ok true', kind: 'ok', changed: true },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: 'Published on the first try', sub: 'If a 409 does happen, it carries the revision.', kind: 'ok', changed: true },
      { dir: 'to-engine', label: 'Finish' },
      { dir: 'to-agent', label: 'Review ends', sub: 'No summary turn.', changed: true },
    ],
  },
}

function Arrow({ m, id }: { m: Msg; id: CandidateId }) {
  const right = m.dir === 'to-engine'
  const color =
    m.kind === 'fail' ? 'text-bad' : m.kind === 'ok' ? 'text-ours' : m.kind === 'waste' ? 'text-faint' : 'text-muted'
  return (
    <li className="py-2.5">
      <div className={`mx-[14%] ${right ? '' : 'text-right'}`}>
        <div
          className={`inline-flex flex-wrap items-center gap-2 text-[13px] font-medium ${
            m.kind === 'fail' ? 'text-bad' : m.kind === 'waste' ? 'text-muted' : 'text-fg'
          } ${right ? '' : 'flex-row-reverse'}`}
        >
          <span>{m.label}</span>
          {m.changed && (
            <span className="rounded-full px-2 py-px text-[11px] font-semibold text-on-ours" style={{ background: tone(id) }}>
              changed
            </span>
          )}
        </div>
        {m.sub && <div className="mt-0.5 text-xs text-muted">{m.sub}</div>}
      </div>
      <div className={`mx-[14%] mt-1.5 flex items-center ${right ? '' : 'flex-row-reverse'} ${color}`} aria-hidden>
        <div
          className={`h-0 flex-1 border-t-2 border-current ${right ? '' : 'border-dashed'} ${m.kind === 'waste' ? 'opacity-60' : ''}`}
        />
        <svg width="10" height="12" viewBox="0 0 10 12" className={right ? '' : 'rotate-180'}>
          <path d="M0 0l10 6-10 6z" fill="currentColor" />
        </svg>
      </div>
    </li>
  )
}

export function SequenceDiagram({ id }: { id: CandidateId }) {
  const f = flows[id]
  const ours = id === 'preflight'
  return (
    <div className={`rounded-xl border bg-surface px-4 pb-4 pt-5 sm:px-6 ${ours ? 'border-ours/60' : 'border-line'}`}>
        <div className="relative mx-[14%] h-8 text-xs font-semibold">
          <span className="absolute left-0 -translate-x-1/2 rounded-md bg-raised px-2.5 py-1.5">Review agent</span>
          <span className="absolute right-0 translate-x-1/2 rounded-md bg-raised px-2.5 py-1.5">Workflow engine</span>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-[14%] w-px bg-line" />
          <div className="pointer-events-none absolute inset-y-0 right-[14%] w-px bg-line" />
          <ol className="relative">
            {f.msgs.map((m, i) => (
              <Arrow key={i} m={m} id={id} />
            ))}
          </ol>
        </div>
      </div>
  )
}

export function ArchitectureFlow({ id, index }: { id: CandidateId; index: number }) {
  const f = flows[id]
  const c = candidates[id]
  const m = review[id].m
  return (
    <article
      className="grid gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
      aria-labelledby={`arch-${id}`}
    >
      <div>
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <span className="h-3 w-3 rounded-full" style={{ background: tone(id) }} />
          {['Where we start', 'Already validated', 'Our candidate'][index]}
        </div>
        <h3
          id={`arch-${id}`}
          className={`mt-3 font-semibold ${index === 0 ? 'display text-3xl md:text-4xl' : 'font-mono text-2xl tracking-tight md:text-3xl'}`}
        >
          {f.heading}
        </h3>
        {index > 0 && <div className="mt-1 text-sm text-faint">{c.label}</div>}
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">{f.intro}</p>
        <p className="mt-3 max-w-md text-sm font-medium">{f.delta}</p>
        <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
          {([
            ['Requests', 'requests', (v: number) => `${v}`],
            ['Refused', 'rejected', (v: number) => `${v}`],
            ['Runtime', 'seconds', (v: number) => `${Math.round(v)} s`],
          ] as const).map(([k, key, f]) => {
            const r = m[key]
            return (
              <div key={k}>
                <dd className={`num display text-3xl font-semibold ${key === 'rejected' && r && r[1] === 0 ? 'text-ours' : ''}`}>
                  {r ? fmtRange(f, r) : <span className="text-faint" title="Not measured yet">—</span>}
                </dd>
                <dt className="mt-0.5 text-xs text-muted">{r ? k : `${k}, not measured yet`}</dt>
              </div>
            )
          })}
        </dl>
        <table className="num mt-5 w-full max-w-md text-sm">
          <caption className="pb-2 text-left text-xs text-faint">Sonnet, Review stage, 1 run</caption>
          <tbody className="divide-y divide-line border-y border-line">
            {[
              ['Checks passed', review[id].checks ?? 'not measured yet'],
              ['Output tokens', fmtRange(fmtK, m.output)],
              ['Cache read tokens', fmtRange(fmtK, m.cacheRead)],
              ['Input tokens', fmtRange(fmtK, m.input)],
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">{k}</th>
                <td className={`py-1.5 text-right font-medium ${v === 'not measured yet' ? 'text-faint' : ''}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <SequenceDiagram id={id} />
        {f.note && <p className="mt-2 text-xs text-faint">{f.note}</p>}
      </div>
    </article>
  )
}
