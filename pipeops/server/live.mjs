// The live slide's runner: one fixed, short, real agent run (Discover with our fixes, from
// the saved round-1 snapshot), followed in the harness's request log as it is written, then
// graded. Loopback only, like the rest of this server; no parameters come from the browser.

import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const LIVE_STEP = 'snapshots/20261017T145651Z-baseline-receipts-s1/steps/01-p1-workflow-discover';
export const LIVE_VARIANT = 'variants/idle-skip.json';
const SLOT_LOG = '/Users/Shared/wfeval/live/requests.jsonl'; // slot 0 (engine.py LIVE)

// The checks a Discover run answers, in the order the slide shows them.
export const DISCOVER_CHECKS = ['found', 'email_separate', 'one_off_unpublished', 'noise_excluded', 'evidence_resolves'];

const short = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Request-log lines as the slide's events; `t` in seconds from `zero` (default: the first line). */
export function toEvents(rows, zero = rows.length ? Date.parse(rows[0].at) : 0) {
  const at = (r) => Date.parse(r.at);
  let calls = 0;
  const out = [];
  for (const r of rows) {
    const t = Math.max(0, (at(r) - zero) / 1000);
    if (r.type === 'request') out.push({ t, kind: 'call', n: ++calls });
    else if (r.type === 'tool' && r.tool !== 'workflow_workspace') out.push({ t, kind: 'look', tool: r.tool });
    else if (r.type === 'workspace') {
      const args = r.args ?? {};
      const title = args.payload?.title ?? args.payload?.candidateTitle ?? null;
      const reply = String(r.reply ?? '');
      const reason = r.ok ? null : short(reply.replace(/^Workflow operation failed:\s*(\d{3}:\s*)?/, ''));
      out.push({ t, kind: 'workspace', action: r.action, ok: !!r.ok, title, reason });
    }
  }
  return out;
}

async function readRows(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; } // a line still being written
  });
}

/** The graded result of a finished stage run: its drafts and the Discover checks. */
export async function readResult(runDir, file = 'results.jsonl') {
  const lines = (await readFile(path.join(runDir, file), 'utf8')).split('\n').filter(Boolean);
  const r = JSON.parse(lines[lines.length - 1]);
  const checks = Object.fromEntries(DISCOVER_CHECKS.map((k) => [k, r.checks?.[k]?.pass ?? null]));
  const drafts = Object.entries(r.workflows_by_job ?? {}).map(([title, job]) => ({ title, job }));
  return { status: r.status, seconds: r.seconds, requests: r.usage?.requests ?? null, checks, drafts };
}

export function mountLive(app, { EVAL_DIR, RUNS_DIR, PY_ENV }) {
  let run = null; // { proc, startedAt, rows, phase, result, error }

  const poll = async () => {
    if (!run || run.phase === 'done' || run.phase === 'failed') return;
    const rows = (await readRows(SLOT_LOG)).filter((r) => Date.parse(r.at) >= run.startedAt);
    if (rows.length >= run.rows.length) run.rows = rows; // the slot moves to runs/ at the end
  };
  setInterval(() => { poll().catch(() => {}); }, 400).unref();

  app.post('/api/live/start', async (_req, res) => {
    if (run && !['done', 'failed'].includes(run.phase)) return res.status(409).json({ error: 'already running' });
    const before = new Set(await readdir(RUNS_DIR).catch(() => []));
    const proc = spawn('uv', ['run', 'wfeval', 'stage', LIVE_STEP, '--variant', LIVE_VARIANT, '--slot', '0'], { cwd: EVAL_DIR, env: PY_ENV });
    run = { proc, startedAt: Date.now(), rows: [], phase: 'starting', result: null, error: null, tail: [] };
    const keep = (b) => { run.tail = [...run.tail, ...b.toString('utf8').split('\n').filter(Boolean)].slice(-20); };
    proc.stdout.on('data', keep);
    proc.stderr.on('data', keep);
    proc.on('error', (e) => { run.phase = 'failed'; run.error = String(e.message ?? e); });
    proc.on('close', async (code) => {
      run.endedAt = Date.now();
      await poll().catch(() => {});
      if (code !== 0) { run.phase = 'failed'; run.error = `wfeval stage exited with ${code}`; return; }
      run.phase = 'grading';
      try {
        const dir = (await readdir(RUNS_DIR)).filter((d) => !before.has(d) && d.includes('stage-discover')).sort().pop();
        run.result = await readResult(path.join(RUNS_DIR, dir));
        run.phase = 'done';
      } catch (e) {
        run.phase = 'failed'; run.error = `no graded result: ${e.message ?? e}`;
      }
    });
    res.json({ ok: true });
  });

  app.get('/api/live/state', (_req, res) => {
    if (!run) return res.json({ phase: 'idle', events: [] });
    const events = toEvents(run.rows, run.startedAt);
    if (run.phase === 'starting' && events.length) run.phase = 'running';
    res.json({
      phase: run.phase,
      elapsed: ((run.endedAt ?? Date.now()) - run.startedAt) / 1000,
      events,
      result: run.result,
      error: run.error ? `${run.error}${run.tail.length ? ` · ${short(run.tail[run.tail.length - 1], 200)}` : ''}` : null,
    });
  });
}
