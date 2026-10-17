// Converts real wfeval run artifacts (eval/runs/<id>/{run.json,results.jsonl,truth.json,
// phase*/catalog.json}) into the RawExperimentBundle shape the frontend understands
// (src/data/schema.ts). Honest-null convention preserved: a field stays null unless the
// artifacts actually say it — nothing here is invented.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const STAGES = [
  { id: 'discover', name: 'Discover', summary: 'Finds candidate workflows in recorded activity.' },
  { id: 'maintain', name: 'Maintain', summary: 'Updates and merges the workflow set.' },
  { id: 'deepen', name: 'Deepen', summary: 'Adds steps, exceptions and evidence.' },
  { id: 'review', name: 'Review', summary: 'Checks the workflows before output.' },
];

const EVIDENCE_LENSES = [
  { id: 'workflow-discovery', label: 'Workflow discovery' },
  { id: 'exception-handling', label: 'Exception handling' },
  { id: 'noise-filtering', label: 'Noise filtering' },
  { id: 'evidence-validity', label: 'Evidence validity' },
];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readJsonl(file) {
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function readPhaseCatalogs(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const catalogs = {};
  for (const e of entries) {
    const m = e.isDirectory() && e.name.match(/^phase(\d+)$/);
    if (!m) continue;
    catalogs[Number(m[1])] = await readJson(path.join(dir, e.name, 'catalog.json')).catch(() => null);
  }
  return catalogs;
}

/** Reads every artifact for one run directory and returns the raw pieces, or throws. */
export async function loadRunArtifacts(runsDir, runId) {
  const dir = path.join(runsDir, runId);
  const [run, results, truth, catalogs] = await Promise.all([
    readJson(path.join(dir, 'run.json')),
    readJsonl(path.join(dir, 'results.jsonl')),
    readJson(path.join(dir, 'truth.json')).catch(() => null),
    readPhaseCatalogs(dir),
  ]);
  return { dir, run, results, truth, catalogs };
}

export async function listRuns(runsDir, entries) {
  const out = [];
  for (const id of entries) {
    try {
      const { run, results } = await loadRunArtifacts(runsDir, id);
      const totalRequests = results.reduce((s, r) => s + (r.usage?.requests ?? 0), 0);
      const totalSeconds = results.reduce((s, r) => s + (r.seconds ?? 0), 0);
      const passed = results.reduce((s, r) => s + (r.passed ?? 0), 0);
      const scored = results.reduce((s, r) => s + (r.scored ?? 0), 0);
      out.push({
        id,
        variant: run.variant?.name ?? null,
        suite: run.data?.suite ?? null,
        seed: run.data?.seed ?? null,
        phases: results.map((r) => r.phase),
        startedAt: run.started_at ?? null,
        finishedAt: run.finished_at ?? null,
        qualityPassed: passed,
        qualityTotal: scored,
        modelRequests: totalRequests,
        runtimeSeconds: Math.round(totalSeconds),
      });
    } catch {
      // Not a complete run directory (still running, or missing artifacts) — skip it.
    }
  }
  out.sort((a, b) => (a.id < b.id ? 1 : -1));
  return out;
}

/* ---------- per-check enrichment from truth.json + catalog.json ---------- */

/** Which evidence lens a check kind belongs to — a direct reading of truth.json's own
 *  taxonomy (grade.py tags non-"steps" keyword checks as "exception_missed", absent_app
 *  checks are literally noise filtering, "evidence" checks are evidence validity). Not a
 *  guess: every other kind is about whether/which workflow got discovered. */
function lensForCheck(t) {
  if (!t) return null;
  if (t.kind === 'keywords') return t.id === 'steps' ? 'workflow-discovery' : 'exception-handling';
  if (t.kind === 'absent_app') return 'noise-filtering';
  if (t.kind === 'evidence') return 'evidence-validity';
  if (t.kind === 'cost') return null;
  return 'workflow-discovery';
}

function titleCaseKind(kind) {
  return { published: 'Published', single: 'No duplicate', keywords: 'Keyword', absent_app: 'Noise excluded',
    drift: 'Drift', separate: 'Kept separate', unpublished: 'Stays unpublished', evidence: 'Evidence',
    cost: 'Cost' }[kind] ?? kind;
}

function nameForCheck(id, t) {
  const job = t?.job ? ` — ${t.job}` : '';
  return `${titleCaseKind(t?.kind)}: ${id}${job}`;
}

function describeExpected(t) {
  if (!t) return null;
  switch (t.kind) {
    case 'published':
      return `A workflow for "${t.job}" gets published.`;
    case 'single':
      return `Exactly one workflow is published for "${t.job}" — no duplicate.`;
    case 'keywords':
      if (t.all) return `Workflow text mentions all of: ${t.all.map((g) => `[${g.join(', ')}]`).join(' and ')}.`;
      if (t.any) return `Workflow text mentions any of: ${t.any.join(', ')}.`;
      return null;
    case 'absent_app':
      return `"${t.app}" is not treated as a step.`;
    case 'drift':
      return `The existing "${t.job}" workflow adapts in place (not forked) to mention: ${(t.any ?? []).join(', ')}.`;
    case 'separate':
      return `"${t.job}" stays a separate workflow from "${t.from}" (not merged).`;
    case 'unpublished':
      return `"${t.job}" is a one-off — it should NOT be published.`;
    case 'evidence':
      return 'Every citation in every published workflow resolves to a real seeded frame.';
    case 'cost':
      return null; // informational, never scored (grade_phase leaves this check's pass null)
    default:
      return null;
  }
}

/** Reverse-looks-up the generated workflow title attributed to a job, for this phase. */
function titleForJob(phaseResult, job) {
  for (const [title, j] of Object.entries(phaseResult.workflows_by_job ?? {})) if (j === job) return title;
  return null;
}

function findWorkflow(catalog, title) {
  return (catalog?.analysis?.workflows ?? []).find((w) => w.title === title) ?? null;
}

function describeActual(phaseResult, catalog, t) {
  if (!t) return null;
  if (t.kind === 'cost') return null;
  if (t.kind === 'evidence') {
    const n = catalog?.analysis?.workflows?.length ?? null;
    return n === null ? null : `${n} workflow(s) in the published catalog this phase.`;
  }
  if (!t.job) return null;
  const title = titleForJob(phaseResult, t.job);
  if (!title) return t.kind === 'unpublished' ? `No workflow published for "${t.job}" (correct).` : `No workflow published for "${t.job}".`;
  const w = findWorkflow(catalog, title);
  if (!w?.description) return title;
  return w.description.length > 300 ? `${w.description.slice(0, 300)}…` : w.description;
}

// Screen-chrome lines (window furniture, not content) that aren't worth quoting as evidence.
const CHROME_LINES = new Set(['sidebar', 'edited', 'share', 'zoom in', 'zoom out', 'markup', 'highlight', 'rotate', 'search']);

function summarizeDetail(detail) {
  const lines = (detail ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !CHROME_LINES.has(l.toLowerCase()));
  const text = lines.slice(0, 2).join(' · ');
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function evidenceForCheck(phaseResult, catalog, t) {
  const out = [];
  if (t?.on_screen?.length) out.push(...t.on_screen.map((s) => `seeded on screen: "${s}"`));
  if (t?.job) {
    const title = titleForJob(phaseResult, t.job);
    const w = findWorkflow(catalog, title);
    for (const e of (w?.evidence ?? []).slice(0, 3)) {
      const summary = summarizeDetail(e.detail);
      if (summary) out.push(`${e.app} @ ${e.timestamp}: "${summary}"`);
    }
  }
  return out.length ? out : null;
}

function buildChecks(results, truth, catalogs) {
  const byId = new Map();
  for (const t of truth?.checks ?? []) byId.set(t.id, t);
  const out = [];
  let index = 0;
  for (const phaseResult of results) {
    const catalog = catalogs[phaseResult.phase] ?? null;
    for (const [id, c] of Object.entries(phaseResult.checks ?? {})) {
      if (c.pass === null) continue; // not scored this phase (e.g. the cost check, a no-op kind)
      const t = byId.get(id);
      out.push({
        id: `${id}-p${phaseResult.phase}`,
        index: index++,
        name: nameForCheck(id, t),
        lens: lensForCheck(t),
        passed: c.pass,
        expected: describeExpected(t),
        actual: describeActual(phaseResult, catalog, t),
        reason: c.reason ?? null,
        evidence: evidenceForCheck(phaseResult, catalog, t),
      });
    }
  }
  return out;
}

function buildStages(results) {
  const byTask = {};
  for (const r of results) {
    for (const [task, u] of Object.entries(r.usage?.by_task ?? {})) {
      const id = task.replace(/^workflow-/, '');
      byTask[id] = (byTask[id] ?? 0) + (u.requests ?? 0);
    }
  }
  const stages = {};
  for (const s of STAGES) {
    stages[s.id] = {
      modelRequests: byTask[s.id] ?? null,
      runtimeSeconds: null, // not separable from requests.jsonl timestamps reliably — stays honest
      snapshotId: null,
      output: null,
    };
  }
  return stages;
}

/** Picks the latest phase's catalog — the most recently reviewed version of each workflow. */
function latestCatalog(catalogs) {
  const phases = Object.keys(catalogs).map(Number).sort((a, b) => b - a);
  for (const p of phases) if (catalogs[p]) return catalogs[p];
  return null;
}

function buildWorkflows(results, catalogs) {
  const byJob = new Map();
  for (const r of results) {
    for (const [title, job] of Object.entries(r.workflows_by_job ?? {})) {
      byJob.set(title, job);
    }
  }
  if (byJob.size === 0) return null;
  const catalog = latestCatalog(catalogs);
  let i = 0;
  return [...byJob.entries()].map(([title, job]) => {
    const w = findWorkflow(catalog, title);
    return {
      id: `wf-${i++}`,
      title,
      steps: w?.stages?.length ? w.stages.map((s) => s.name) : null,
      matchedTo: job,
      trigger: w?.trigger ?? null,
      outcome: w?.outcome ?? null,
      variations: w?.variations?.length ? w.variations : null,
      limitations: w?.limitations?.length ? w.limitations : null,
      confidence: typeof w?.confidence === 'number' ? w.confidence : null,
    };
  });
}

function buildGroundTruth(truth) {
  if (!truth?.jobs) return null;
  return Object.entries(truth.jobs).map(([id, j]) => ({ id, title: j.summary ?? id }));
}

export function toRawRun(id, label, role, { run, results, truth, catalogs }) {
  const passed = results.reduce((s, r) => s + (r.passed ?? 0), 0);
  const scored = results.reduce((s, r) => s + (r.scored ?? 0), 0);
  const requests = results.reduce((s, r) => s + (r.usage?.requests ?? 0), 0);
  const seconds = results.reduce((s, r) => s + (r.seconds ?? 0), 0);
  return {
    id,
    label,
    role,
    status: 'recorded',
    recordedAt: run.finished_at ?? null,
    metrics: {
      qualityPassed: passed,
      qualityTotal: scored,
      modelRequests: requests,
      runtimeSeconds: Math.round(seconds),
    },
    stages: buildStages(results),
    recordedActivity: null,
    generatedWorkflows: buildWorkflows(results, catalogs),
    groundTruth: buildGroundTruth(truth),
    checks: buildChecks(results, truth, catalogs),
  };
}

function verdict(a, b) {
  if (a.id === b.id) return { verdict: 'Single run loaded.', note: 'Pick a variant run to pair it against.' };
  const dq = b.metrics.qualityPassed - a.metrics.qualityPassed;
  const dr = b.metrics.modelRequests - a.metrics.modelRequests;
  if (dq < 0) return { verdict: 'Regression: quality dropped.', note: `${a.label} ${a.metrics.qualityPassed}/${a.metrics.qualityTotal} -> ${b.label} ${b.metrics.qualityPassed}/${b.metrics.qualityTotal}.` };
  if (dq > 0) return { verdict: 'Quality improved.', note: `+${dq} checks, ${dr >= 0 ? '+' : ''}${dr} requests.` };
  if (dr > 0) return { verdict: 'No improvement demonstrated.', note: 'Same quality, more requests.' };
  if (dr < 0) return { verdict: 'Same quality, cheaper.', note: `${-dr} fewer requests.` };
  return { verdict: 'No change detected.', note: 'Identical totals.' };
}

export function buildExperimentBundle({ baselineId, baselineLabel, baselineArtifacts, variantId, variantLabel, variantArtifacts }) {
  const baseRun = toRawRun(baselineId, baselineLabel, 'baseline', baselineArtifacts);
  const varRun = variantArtifacts
    ? toRawRun(variantId, variantLabel, 'variant', variantArtifacts)
    : toRawRun(baselineId, baselineLabel, 'variant', baselineArtifacts);
  const { verdict: v, note } = verdict(baseRun, varRun);
  const suite = baselineArtifacts.run.data?.suite ?? 'unknown';
  return {
    schemaVersion: 1,
    source: {
      kind: 'artifact',
      file: `eval/runs/${baselineId}/results.jsonl`,
      note: 'Live from wfeval run artifacts via the pipeops server. Per-stage runtime is not derivable from these files yet and renders as a placeholder.',
    },
    experiment: {
      id: suite,
      title: `Workflow discovery — ${suite}`,
      subject: 'Screenpipe Workflows',
      question: variantArtifacts ? `Does ${varRun.label} improve on ${baseRun.label}?` : `How did ${baseRun.label} do?`,
    },
    stages: STAGES.map((s) => ({ id: s.id, name: s.name, summary: s.summary, summaryStatus: 'draft' })),
    evidenceLenses: EVIDENCE_LENSES,
    runs: [baseRun, varRun],
    comparison: {
      baseline: baseRun.id,
      variant: varRun.id,
      pairing: 'single',
      verdict: v,
      note,
    },
  };
}
