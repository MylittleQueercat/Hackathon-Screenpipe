// Portable PipeOps experiment format ("pipeops.run" v1): export, validate, and load.
//
// A portable file is one completed *full* wfeval run (all phases of a cycle), reduced to an
// allowlisted, shareable JSON document. Export builds the output field by field from the
// run artifacts — nothing is copied wholesale — and a field the artifacts don't carry is
// null, never invented. Validation re-checks the shape and scans every string for secrets
// and host paths, so a hand-edited or third-party file gets the same scrutiny as ours.
//
// Deliberately NOT exported: engine.log, requests.jsonl, seeded.jsonl, prompts/, home/,
// tmp/, phase*/logs, executions.json, workspace.json, run.json's engine binary path,
// preset ids and env. Only the pieces named below.

import { readFile } from 'node:fs/promises';
import { loadRunArtifacts, toRawRun } from './convert.mjs';

export const FORMAT = 'pipeops.run';
export const FORMAT_VERSION = 1;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_STRING = 4000;

/* ---------------------------- export ---------------------------- */

const str = (v) => (typeof v === 'string' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sumTokens(results) {
  const keys = ['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning', 'requests', 'tool_calls'];
  const total = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of results) for (const k of keys) total[k] += r.usage?.[k] ?? 0;
  return {
    inputTokens: total.input,
    cacheReadTokens: total.cacheRead,
    cacheWriteTokens: total.cacheWrite,
    outputTokens: total.output,
    reasoningTokens: total.reasoning,
    requests: total.requests,
    toolCalls: total.tool_calls,
  };
}

function usageByTask(results) {
  const by = {};
  for (const r of results) {
    for (const [task, u] of Object.entries(r.usage?.by_task ?? {})) {
      const t = (by[task] ??= { requests: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 });
      t.requests += u.requests ?? 0;
      t.inputTokens += u.input ?? 0;
      t.cacheReadTokens += u.cacheRead ?? 0;
      t.outputTokens += u.output ?? 0;
    }
  }
  return by;
}

/** Why a run can't be exported as a full evaluation, or null if it can. */
export function fullRunProblem(run, results) {
  if (run.kind === 'stage' || run.kind === 'snapshot') {
    return `this is a ${run.kind} run, not a full evaluation — stage results are not comparable to full-eval scores and are not supported by the portable format (v${FORMAT_VERSION})`;
  }
  if (results.some((r) => r.stage !== undefined)) {
    return 'results.jsonl has stage-run rows, not full-evaluation rows';
  }
  if (!results.length) return 'results.jsonl is empty — the run has not been graded (run `wfeval grade` first)';
  if (results.some((r) => r.status !== 'graded')) return 'not every phase is graded yet';
  if (!run.finished_at) return 'run.json has no finished_at — the run is not complete';
  return null;
}

const HOME_PATH = /(\/Users|\/home)\/(?!<redacted>)[^/\s"'<>]+/g;

/** Replaces home-directory usernames in every string with "<redacted>". Returns the count so
 *  the redaction is disclosed in the file rather than silent. */
function redactHomePaths(v, counter) {
  if (typeof v === 'string') return v.replace(HOME_PATH, (_m, root) => { counter.n++; return `${root}/<redacted>`; });
  if (Array.isArray(v)) return v.map((x) => redactHomePaths(x, counter));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactHomePaths(x, counter)]));
  return v;
}

/** Builds the portable document from a run directory. Throws with a readable reason if the
 *  run isn't an exportable full evaluation. */
export async function exportRun(runsDir, runId, { now = new Date() } = {}) {
  const artifacts = await loadRunArtifacts(runsDir, runId).catch((e) => {
    throw new Error(`cannot read run "${runId}" under ${runsDir}: ${e.message}`);
  });
  const { run, results, truth } = artifacts;
  const problem = fullRunProblem(run, results);
  if (problem) throw new Error(`run "${runId}": ${problem}`);

  const raw = toRawRun(runId, run.variant?.name ?? runId, 'baseline', artifacts);
  const checks = (raw.checks ?? []).map((c) => ({
    id: c.id, name: c.name, lens: c.lens, passed: c.passed,
    expected: c.expected, actual: c.actual, reason: c.reason, evidence: c.evidence,
  }));
  const workflows = (raw.generatedWorkflows ?? []).map((w) => ({
    id: w.id, title: w.title, steps: w.steps ?? null, matchedTo: w.matchedTo ?? null,
    trigger: w.trigger ?? null, outcome: w.outcome ?? null, variations: w.variations ?? null,
    limitations: w.limitations ?? null, confidence: w.confidence ?? null,
  }));
  const groundTruth = Object.entries(truth?.jobs ?? {}).map(([id, j]) => ({
    id, title: str(j.summary) ?? id, expect: str(j.expect),
  }));

  const doc = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind: 'full',
    exportedAt: now.toISOString(),
    run: {
      id: runId,
      label: str(run.variant?.name) ?? runId,
      startedAt: str(run.started_at),
      finishedAt: str(run.finished_at),
    },
    conditions: {
      suite: str(run.data?.suite),
      seed: num(run.data?.seed),
      repeat: num(results[0]?.repeat),
      phases: results.map((r) => r.phase),
      framesByPhase: run.data?.frames ?? null,
      dataSha256: run.data?.sha256 ?? null,
    },
    provenance: {
      variant: {
        name: str(run.variant?.name),
        description: str(run.variant?.description),
        file: str(run.variant_file),
        sha256: str(run.variant_sha256),
        pipeOverridesSha256: run.pipe_overrides_sha256 ?? null,
      },
      model: { provider: str(run.variant?.preset?.provider), name: str(run.variant?.preset?.model) },
      engine: { commit: str(run.engine?.commit), patchSha256: str(run.engine?.patch_sha256) },
      harness: { piVersion: str(run.pi_version), bunVersion: str(run.bun_version) },
      promptSha256: results[0]?.prompts ?? null,
      contaminationClean: typeof run.contamination?.clean === 'boolean' ? run.contamination.clean : null,
    },
    groundTruth,
    metrics: { ...raw.metrics, costUsd: results.some((r) => r.usage?.cost_usd != null)
      ? results.reduce((s, r) => s + (r.usage?.cost_usd ?? 0), 0) : null },
    modelUsage: { total: sumTokens(results), byTask: usageByTask(results) },
    stages: raw.stages,
    checks,
    workflows,
  };
  const counter = { n: 0 };
  const clean = redactHomePaths(doc, counter);
  clean.provenance.sanitization = { redactedHomePaths: counter.n };
  return clean;
}

/* --------------------------- validation --------------------------- */

const TOP_KEYS = ['format', 'formatVersion', 'kind', 'exportedAt', 'run', 'conditions', 'provenance',
  'groundTruth', 'metrics', 'modelUsage', 'stages', 'checks', 'workflows'];

// Anything matching these must never ship. Patterns are for credentials and host-specific paths;
// sha256 hashes (hex) are legitimate provenance and are not flagged.
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/, 'API-key-like token (sk-…)'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i, 'bearer token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, 'JWT'],
  [/\b(?:ghp|gho|ghs|github_pat|xox[abp]|AKIA)[A-Za-z0-9_-]{12,}/, 'service token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:api[_-]?key|secret|password|passwd|auth[_-]?token|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*\S{6,}/i, 'credential assignment'],
  [/(?:\/Users|\/home)\/(?!<redacted>)[^/\s"'<>]+/, 'host home-directory path (not redacted)'],
  [/[A-Za-z]:\\Users\\/, 'host home-directory path'],
  [/\.engines\//, 'engine build path'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, 'email address'],
];

function walk(v, p, fn) {
  if (typeof v === 'string') fn(v, p);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`, fn));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { fn(k, `${p}.<key ${k}>`); walk(x, `${p}.${k}`, fn); }
}

/** Returns a list of security findings (empty = clean). Scans keys and values. */
export function scanForSecrets(doc) {
  const out = [];
  walk(doc, '$', (s, p) => {
    for (const [re, what] of SECRET_PATTERNS) if (re.test(s)) out.push(`${p}: ${what}`);
    if (s.length > MAX_STRING) out.push(`${p}: string longer than ${MAX_STRING} chars (raw log/dump?)`);
  });
  return out;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isNullOr = (v, t) => v === null || typeof v === t;

/** Returns a list of problems (empty = valid). Never throws. */
export function validatePortable(doc, { fileName } = {}) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  if (!isObj(doc)) return ['top level must be a JSON object'];
  need(doc.format === FORMAT, `format must be "${FORMAT}"`);
  need(doc.formatVersion === FORMAT_VERSION, `formatVersion must be ${FORMAT_VERSION} (this tool only reads v${FORMAT_VERSION})`);
  need(doc.kind === 'full', 'kind must be "full" — stage runs are not supported and must not be scored as full evaluations');
  for (const k of Object.keys(doc)) need(TOP_KEYS.includes(k), `unexpected top-level key "${k}" (allowlist)`);
  for (const k of TOP_KEYS) need(k in doc, `missing top-level key "${k}"`);
  if (errs.length && !isObj(doc.run)) return errs;

  need(isObj(doc.run) && typeof doc.run.id === 'string' && /^[\w.-]+$/.test(doc.run.id), 'run.id must be a safe id string');
  need(isObj(doc.run) && typeof doc.run.label === 'string', 'run.label must be a string');
  if (fileName && isObj(doc.run)) need(fileName === `${doc.run.id}.json`, `file name must be "${doc.run.id}.json"`);
  const c = doc.conditions;
  need(isObj(c) && typeof c.suite === 'string' && typeof c.seed === 'number', 'conditions.suite (string) and conditions.seed (number) are required — they define comparability');
  need(isObj(c) && Array.isArray(c.phases) && c.phases.length > 0 && c.phases.every(Number.isInteger), 'conditions.phases must be a non-empty integer array');
  need(isObj(c) && isObj(c.dataSha256), 'conditions.dataSha256 is required — it proves two runs saw the same data');
  need(isObj(doc.provenance) && isObj(doc.provenance.variant) && typeof doc.provenance.variant.name === 'string', 'provenance.variant.name is required');
  need(Array.isArray(doc.groundTruth) && doc.groundTruth.every((g) => isObj(g) && typeof g.id === 'string' && typeof g.title === 'string'), 'groundTruth must be [{id,title,…}]');

  const m = doc.metrics;
  const ints = ['qualityPassed', 'qualityTotal', 'modelRequests', 'runtimeSeconds'];
  need(isObj(m) && ints.every((k) => typeof m[k] === 'number' && m[k] >= 0), `metrics must have non-negative numbers: ${ints.join(', ')}`);
  need(isObj(m) && isNullOr(m.costUsd, 'number'), 'metrics.costUsd must be a number or null');
  need(isObj(doc.modelUsage) && isObj(doc.modelUsage.total) && isObj(doc.modelUsage.byTask), 'modelUsage needs total and byTask objects');
  need(isObj(doc.stages), 'stages must be an object');

  if (Array.isArray(doc.checks)) {
    const okShape = doc.checks.every((k) => isObj(k) && typeof k.id === 'string' && typeof k.passed === 'boolean'
      && isNullOr(k.name, 'string') && isNullOr(k.lens, 'string') && isNullOr(k.expected, 'string')
      && isNullOr(k.actual, 'string') && isNullOr(k.reason, 'string')
      && (k.evidence === null || (Array.isArray(k.evidence) && k.evidence.every((e) => typeof e === 'string'))));
    need(okShape, 'every check needs {id, passed:boolean} and string-or-null name/lens/expected/actual/reason, string[]-or-null evidence');
    if (okShape && isObj(m)) {
      need(doc.checks.length === m.qualityTotal, `metrics.qualityTotal (${m.qualityTotal}) != number of checks (${doc.checks.length})`);
      need(doc.checks.filter((k) => k.passed).length === m.qualityPassed, 'metrics.qualityPassed != number of passed checks');
    }
  } else errs.push('checks must be an array');
  need(Array.isArray(doc.workflows) && doc.workflows.every((w) => isObj(w) && typeof w.id === 'string' && typeof w.title === 'string'), 'workflows must be [{id,title,…}]');

  for (const f of scanForSecrets(doc)) errs.push(`security: ${f}`);
  return errs;
}

export async function readPortableFile(file) {
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error(`file larger than ${MAX_FILE_BYTES} bytes`);
  return JSON.parse(text);
}

/* ------------------- load into the UI's RawRun shape ------------------- */

export function portableToRawRun(doc, role) {
  return {
    id: doc.run.id,
    label: doc.run.label,
    role,
    status: 'recorded',
    recordedAt: doc.run.finishedAt,
    metrics: {
      qualityPassed: doc.metrics.qualityPassed,
      qualityTotal: doc.metrics.qualityTotal,
      modelRequests: doc.metrics.modelRequests,
      runtimeSeconds: doc.metrics.runtimeSeconds,
    },
    stages: doc.stages,
    recordedActivity: null,
    generatedWorkflows: doc.workflows.length ? doc.workflows : null,
    groundTruth: doc.groundTruth.length ? doc.groundTruth.map(({ id, title }) => ({ id, title })) : null,
    checks: doc.checks,
  };
}

/* --------------------------- comparability --------------------------- */

/** Two runs are comparable only when they saw the same data under the same conditions. */
export function conditionsKey(c) {
  return JSON.stringify([c?.suite ?? null, c?.seed ?? null, c?.repeat ?? null, c?.phases ?? null, c?.dataSha256 ?? null]);
}

export const sameConditions = (a, b) => conditionsKey(a) === conditionsKey(b);
