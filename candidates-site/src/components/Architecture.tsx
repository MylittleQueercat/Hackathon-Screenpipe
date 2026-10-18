import { candidates, fmtK, sonnetReview, tone, type CandidateId } from '../data'

/** One message between the Review agent (left lane) and the Workflow engine (right lane). */
type Msg = {
  dir: 'to-engine' | 'to-agent'
  label: string
  sub?: string
  kind?: 'fail' | 'ok' | 'waste'
  changed?: boolean
}

const flows: Record<CandidateId, { heading: string; intro: string; delta: string; msgs: Msg[] }> = {
  baseline: {
    heading: 'How Screenpipe works today',
    intro:
      'Review reads the drafts, publishes, and only learns what is wrong when the engine refuses the write. Every refusal costs a retry.',
    delta: 'Reference engine, with clearer rejection messages.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts and evidence' },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: '422 · Stage 1 retained 0 of 3 items', sub: 'The verdict arrives after the write attempt.', kind: 'fail' },
      { dir: 'to-engine', label: 'Fix the draft, publish again' },
      { dir: 'to-agent', label: '409 · Workspace changed', sub: '“Read context before publishing.”', kind: 'fail' },
      { dir: 'to-engine', label: 'Read context again', sub: 'Extra round-trip, then retry' },
      { dir: 'to-agent', label: 'Published', kind: 'ok' },
      { dir: 'to-engine', label: 'Finish' },
      { dir: 'to-agent', label: 'Asks for one more summary turn', sub: 'An extra request, nothing changes.', kind: 'waste' },
    ],
  },
  conflict: {
    heading: 'conflict-revision',
    intro:
      'Same flow, but a 409 now carries the current revision and the open drafts, so Review retries straight away.',
    delta: 'Changes the 409 reply and what finish does.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts and evidence' },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: '422 · Stage 1 retained 0 of 3 items', sub: 'Same as today.', kind: 'fail' },
      { dir: 'to-engine', label: 'Fix the draft, publish again' },
      { dir: 'to-agent', label: '409 · Workspace changed, now with revision 9 and your open drafts', sub: 'No need to read context again.', kind: 'fail', changed: true },
      { dir: 'to-engine', label: 'Retry at revision 9', sub: 'Saves one round-trip', changed: true },
      { dir: 'to-agent', label: 'Published', kind: 'ok' },
      { dir: 'to-engine', label: 'Finish' },
      { dir: 'to-agent', label: 'Review ends', sub: 'No summary turn.', changed: true },
    ],
  },
  preflight: {
    heading: 'preflight-conflict',
    intro:
      'Every draft read already includes the publish verdict, computed by a dry run of the real validation. Review fixes the draft before it publishes.',
    delta: 'Adds the dry run to the read, on top of conflict-revision.',
    msgs: [
      { dir: 'to-engine', label: 'Read drafts', sub: 'workspace.context' },
      { dir: 'to-agent', label: 'Drafts, evidence and publicationCheck: ok false', sub: 'The 422 Review would have hit. No write, no lock.', kind: 'fail', changed: true },
      { dir: 'to-engine', label: 'Fix the draft, hand it off', sub: 'workspace.handoff' },
      { dir: 'to-agent', label: 'publicationCheck: ok true', kind: 'ok', changed: true },
      { dir: 'to-engine', label: 'Publish', sub: 'workspace.publish' },
      { dir: 'to-agent', label: 'Published on the first try', sub: 'If a 409 does happen, it carries the revision.', kind: 'ok' },
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

export function ArchitectureFlow({ id, index }: { id: CandidateId; index: number }) {
  const f = flows[id]
  const c = candidates[id]
  const s = sonnetReview[id]
  const ours = id === 'preflight'
  return (
    <article
      className="grid gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
      aria-labelledby={`arch-${id}`}
    >
      <div>
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <span className="h-3 w-3 rounded-full" style={{ background: tone(id) }} />
          {index === 0 ? 'Where we start' : index === 1 ? 'Candidate' : 'Our candidate'}
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
          {[
            ['Requests', `${s.requests}`],
            ['Refused', `${s.rejected}`],
            ['Runtime', `${Math.round(s.seconds)} s`],
          ].map(([k, v]) => (
            <div key={k}>
              <dd className={`num display text-3xl font-semibold ${k === 'Refused' && s.rejected === 0 ? 'text-ours' : ''}`}>{v}</dd>
              <dt className="mt-0.5 text-xs text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        <table className="num mt-5 w-full max-w-md text-sm">
          <caption className="pb-2 text-left text-xs text-faint">Sonnet, Review stage, 1 run</caption>
          <tbody className="divide-y divide-line border-y border-line">
            {[
              ['Checks passed', s.checks],
              ['Output tokens', fmtK(s.output)],
              ['Cache read tokens', fmtK(s.cacheRead)],
              ['Input tokens', fmtK(s.input)],
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">{k}</th>
                <td className="py-1.5 text-right font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </article>
  )
}
