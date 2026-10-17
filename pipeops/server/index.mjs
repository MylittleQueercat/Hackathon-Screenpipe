// PipeOps local bridge: serves real wfeval run artifacts to the frontend and can
// trigger a live `wfeval run` + `wfeval grade`, streaming its output to the browser.
//
// Runs only on localhost. Everything here shells out to the user's own eval harness
// on the same machine — nothing is sent anywhere else.

import express from 'express';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExperimentBundle, listRuns, loadRunArtifacts } from './convert.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // .../Hackathon-Screenpipe
const EVAL_DIR = path.join(REPO_ROOT, 'eval');
const RUNS_DIR = path.join(EVAL_DIR, 'runs');
const VARIANTS_DIR = path.join(EVAL_DIR, 'variants');
const SNAPSHOTS_DIR = path.join(EVAL_DIR, 'snapshots');
const PORT = process.env.PIPEOPS_SERVER_PORT ? Number(process.env.PIPEOPS_SERVER_PORT) : 8787;

const app = express();
app.use(express.json());

// Only one live run at a time — the harness itself enforces this (one engine per Mac).
let live = null; // { proc, logs: string[], done: boolean, runId: string|null, error: string|null }

app.get('/api/health', (_req, res) => res.json({ ok: true, evalDir: EVAL_DIR }));

app.get('/api/runs', async (_req, res) => {
  try {
    const entries = (await readdir(RUNS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    res.json(await listRuns(RUNS_DIR, entries));
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) });
  }
});

app.get('/api/variants', async (_req, res) => {
  try {
    const files = (await readdir(VARIANTS_DIR)).filter((f) => f.endsWith('.json'));
    const variants = await Promise.all(
      files.map(async (f) => {
        const v = JSON.parse(await readFile(path.join(VARIANTS_DIR, f), 'utf8'));
        return { file: `variants/${f}`, name: v.name, description: v.description ?? null };
      }),
    );
    res.json(variants);
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) });
  }
});

app.get('/api/experiment', async (req, res) => {
  const baselineId = req.query.baseline;
  const variantId = req.query.variant && req.query.variant !== baselineId ? req.query.variant : null;
  if (!baselineId) return res.status(400).json({ error: 'missing ?baseline=<runId>' });
  try {
    const baselineArtifacts = await loadRunArtifacts(RUNS_DIR, baselineId);
    const variantArtifacts = variantId ? await loadRunArtifacts(RUNS_DIR, variantId) : null;
    const bundle = buildExperimentBundle({
      baselineId,
      baselineLabel: baselineArtifacts.run.variant?.name ?? baselineId,
      baselineArtifacts,
      variantId: variantId ?? baselineId,
      variantLabel: variantArtifacts ? variantArtifacts.run.variant?.name ?? variantId : baselineArtifacts.run.variant?.name ?? baselineId,
      variantArtifacts,
    });
    res.json(bundle);
  } catch (e) {
    res.status(404).json({ error: String(e.message ?? e) });
  }
});

// A snapshot (from `wfeval snapshot`) holds restorable engine state before each agent
// step — `wfeval stage <step>` replays one agent from it. Listing is a pure file read.
app.get('/api/snapshots', async (_req, res) => {
  try {
    const entries = (await readdir(SNAPSHOTS_DIR, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory());
    const out = [];
    for (const e of entries) {
      const dir = path.join(SNAPSHOTS_DIR, e.name);
      try {
        const meta = JSON.parse(await readFile(path.join(dir, 'snapshot.json'), 'utf8'));
        const stepEntries = (await readdir(path.join(dir, 'steps'), { withFileTypes: true })).filter((s) => s.isDirectory());
        const steps = stepEntries
          .map((s) => s.name.match(/^(\d+)-p(\d+)-(.+)$/))
          .filter((m) => m && m[3] !== 'complete')
          .map((m) => ({ step: m[0], phase: Number(m[2]), task: m[3] }));
        out.push({ id: e.name, variant: meta.variant?.name ?? null, suite: meta.data?.suite ?? null, seed: meta.data?.seed ?? null, steps });
      } catch {
        // an incomplete or malformed snapshot dir — skip it, same as listRuns does for runs
      }
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) });
  }
});

app.get('/api/wfeval/status', (_req, res) => {
  if (!live) return res.json({ running: false });
  res.json({ running: !live.done, runId: live.runId, error: live.error });
});

// Streams plain-text lines as they're produced (not quite SSE — just chunked text —
// good enough for a terminal-style live log and easy to read with a fetch stream reader).
app.post('/api/wfeval/run', async (req, res) => {
  if (live && !live.done) {
    return res.status(409).json({ error: 'a run is already in progress' });
  }
  const { variant, suite, seed, phases, repeat } = req.body ?? {};
  if (!variant || !suite || !seed) {
    return res.status(400).json({ error: 'variant, suite and seed are required' });
  }
  const args = ['run', 'wfeval', 'run', '--variant', String(variant), '--suite', String(suite), '--seed', String(seed)];
  if (phases) args.push('--phases', String(phases));
  if (repeat) args.push('--repeat', String(repeat));

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
  const proc = spawn('uv', args, { cwd: EVAL_DIR });
  live = { proc, done: false, runId: null, error: null };

  const beforeDirs = new Set(await readdir(RUNS_DIR).catch(() => []));

  const onData = (buf) => {
    const text = buf.toString('utf8');
    res.write(text);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('close', async (code) => {
    live.done = true;
    if (code !== 0) {
      live.error = `wfeval run exited with code ${code}`;
      res.write(`\n[pipeops] ${live.error}\n`);
      res.end();
      return;
    }
    const afterDirs = new Set(await readdir(RUNS_DIR).catch(() => []));
    const newDir = [...afterDirs].find((d) => !beforeDirs.has(d));
    live.runId = newDir ?? null;
    if (newDir) {
      res.write(`\n[pipeops] run complete: ${newDir}\n`);
      await new Promise((resolve) => {
        const grade = spawn('uv', ['run', 'wfeval', 'grade', `runs/${newDir}`], { cwd: EVAL_DIR });
        grade.stdout.on('data', onData);
        grade.stderr.on('data', onData);
        grade.on('close', resolve);
      });
    } else {
      res.write('\n[pipeops] run finished but no new run directory was found\n');
    }
    res.end();
  });

  proc.on('error', (err) => {
    live.done = true;
    live.error = String(err.message ?? err);
    res.write(`\n[pipeops] failed to start: ${live.error}\n`);
    res.end();
  });

  req.on('close', () => {
    // Client disconnected — let the harness keep running (it's a real model run with
    // real cost); status/log replay isn't implemented, so just leave `live` in place.
  });
});

// Replays one agent from a saved snapshot step — a real model-calling run, just a much
// shorter one than a full cycle. Same single-slot lock and streaming as /api/wfeval/run.
app.post('/api/wfeval/stage', async (req, res) => {
  if (live && !live.done) {
    return res.status(409).json({ error: 'a run is already in progress' });
  }
  const { step, task, variant, repeat } = req.body ?? {};
  if (!step || !variant) {
    return res.status(400).json({ error: 'step and variant are required' });
  }
  const args = ['run', 'wfeval', 'stage', String(step), '--variant', String(variant)];
  if (task) args.push('--task', String(task));
  if (repeat) args.push('--repeat', String(repeat));

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
  const proc = spawn('uv', args, { cwd: EVAL_DIR });
  live = { proc, done: false, runId: null, error: null };

  const onData = (buf) => res.write(buf.toString('utf8'));
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('close', (code) => {
    live.done = true;
    if (code !== 0) {
      live.error = `wfeval stage exited with code ${code}`;
      res.write(`\n[pipeops] ${live.error}\n`);
    }
    res.end();
  });

  proc.on('error', (err) => {
    live.done = true;
    live.error = String(err.message ?? err);
    res.write(`\n[pipeops] failed to start: ${live.error}\n`);
    res.end();
  });
});

app.listen(PORT, () => {
  console.log(`pipeops server on http://localhost:${PORT} (eval dir: ${EVAL_DIR})`);
});
