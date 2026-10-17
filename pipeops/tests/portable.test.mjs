// Non-LLM tests: exporter, validator, security scan, comparability, and the server's
// Demo Runs / Local Runs endpoints. Run with `npm test`. Never calls a model.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readdir, readFile, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportRun, validatePortable, readPortableFile, portableToRawRun, scanForSecrets, conditionsKey } from '../server/portable.mjs';
import { listRuns, buildExperimentBundle, loadRunArtifacts } from '../server/convert.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(root, 'demo-data');

/** A minimal but realistic fake run dir (full or stage) built in a temp dir. */
async function fakeRun(runsDir, id, { variant = 'v', kind, seed = 1, sha = 'aa', passed = 1 } = {}) {
  const d = path.join(runsDir, id);
  await mkdir(path.join(d, 'phase1'), { recursive: true });
  const run = { run_id: id, variant: { name: variant, preset: { provider: 'p', model: 'm' } }, variant_file: `variants/${variant}.json`,
    data: { suite: 's', seed, frames: { 1: 5 }, sha256: { 'truth.json': sha } }, started_at: 'a', finished_at: 'b',
    engine: { binary: '/Users/someone/eval/.engines/target/debug/screenpipe', commit: 'abc' }, ...(kind ? { kind } : {}) };
  await writeFile(path.join(d, 'run.json'), JSON.stringify(run));
  const row = kind === 'stage'
    ? { stage: 'review', status: 'graded', phase: 1, passed, scored: 1, seconds: 3, checks: { c1: { pass: true } } }
    : { variant, suite: 's', seed, repeat: 1, phase: 1, status: 'graded', passed, scored: 1, seconds: 3, checks: { c1: { pass: passed === 1 } },
        usage: { requests: 2, input: 1, output: 1, cacheRead: 0, cacheWrite: 0, by_task: { 'workflow-discover': { requests: 2 } } }, workflows_by_job: {} };
  await writeFile(path.join(d, 'results.jsonl'), JSON.stringify(row) + '\n');
  await writeFile(path.join(d, 'truth.json'), JSON.stringify({ checks: [{ id: 'c1', kind: 'published', job: 'j' }], jobs: { j: { expect: 'published', summary: 'Job J' } } }));
  await writeFile(path.join(d, 'engine.log'), 'SECRET sk-abcdefghijklmnop0123');
  return d;
}

const demoFiles = (await readdir(demoDir)).filter((f) => f.endsWith('.json'));

test('bundled demo files are valid and include our two real runs', async () => {
  assert.ok(demoFiles.length >= 2);
  for (const f of demoFiles) assert.deepEqual(validatePortable(await readPortableFile(path.join(demoDir, f)), { fileName: f }), [], f);
  const variants = await Promise.all(demoFiles.map(async (f) => (await readPortableFile(path.join(demoDir, f))).provenance.variant.name));
  assert.ok(variants.includes('baseline') && variants.includes('episode-routing'));
});

test('demo files render identically to the Local Runs conversion (modulo disclosed redaction)', async (t) => {
  const runsDir = path.join(root, '..', 'eval', 'runs');
  for (const f of demoFiles) {
    const doc = await readPortableFile(path.join(demoDir, f));
    const art = await loadRunArtifacts(runsDir, doc.run.id).catch(() => null);
    if (!art) { t.diagnostic(`skip ${f}: no local eval/runs copy`); continue; }
    const again = await exportRun(runsDir, doc.run.id);
    assert.deepEqual({ ...again, exportedAt: 0 }, { ...doc, exportedAt: 0 });
  }
});

test('export keeps only allowlisted content: no engine log, host paths or secrets', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pipeops-'));
  await fakeRun(tmp, 'r1');
  const doc = await exportRun(tmp, 'r1');
  const text = JSON.stringify(doc);
  assert.ok(!text.includes('sk-abc') && !text.includes('/Users/someone') && !text.includes('.engines'));
  assert.deepEqual(validatePortable(doc, { fileName: 'r1.json' }), []);
  assert.equal(doc.metrics.costUsd, null); // missing data stays null, never invented
  await rm(tmp, { recursive: true });
});

test('stage and ungraded runs are refused, never exported as full scores', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pipeops-'));
  await fakeRun(tmp, 'stage1', { kind: 'stage' });
  await assert.rejects(exportRun(tmp, 'stage1'), /stage run, not a full evaluation/);
  await mkdir(path.join(tmp, 'half'), { recursive: true });
  await assert.rejects(exportRun(tmp, 'half'), /cannot read run/);
  assert.deepEqual(await listRuns(tmp, ['stage1']), []); // Local Runs never lists it as a full score
  await rm(tmp, { recursive: true });
});

test('validator rejects bad shape, stage kind, unknown keys, mismatched totals and wrong file name', async () => {
  const good = await readPortableFile(path.join(demoDir, demoFiles[0]));
  const clone = () => structuredClone(good);
  const has = (doc, re, o) => assert.ok(validatePortable(doc, o).some((e) => re.test(e)), re);
  has({ ...clone(), kind: 'stage' }, /kind must be "full"/);
  has({ ...clone(), formatVersion: 2 }, /formatVersion/);
  has({ ...clone(), extra: 1 }, /unexpected top-level key/);
  const m = clone(); m.metrics.qualityPassed += 1; has(m, /qualityPassed/);
  has(clone(), /file name must be/, { fileName: 'other.json' });
  const c = clone(); delete c.conditions.dataSha256; has(c, /dataSha256/);
  assert.ok(validatePortable(null).length);
});

test('security scan flags credentials, tokens, host paths and emails', () => {
  for (const bad of ['sk-ant-api03-abcdefghijklmnopqrstu', 'Authorization: Bearer abcdefghijklmnop1234', 'api_key=hunter2hunter2',
    '/Users/alice/Documents/x', '/home/bob/.ssh', 'me@example.com', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig', 'ghp_abcdefghijklmnopqrstuvwx']) {
    assert.ok(scanForSecrets({ a: { b: [bad] } }).length, bad);
  }
  assert.deepEqual(scanForSecrets({ p: '/Users/<redacted>/Documents', h: 'f2343f495408afdae3a4f4fa14fbd796697a9dcaff748002a3631972f4c95b1d' }), []);
});

test('comparability: different seed or data never compares; same conditions do', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pipeops-'));
  await fakeRun(tmp, 'a', { variant: 'baseline' });
  await fakeRun(tmp, 'b', { variant: 'x' });
  await fakeRun(tmp, 'c', { variant: 'x', seed: 2 });
  await fakeRun(tmp, 'd', { variant: 'x', sha: 'bb' });
  const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((i) => loadRunArtifacts(tmp, i)));
  const mk = (x, y, ids) => buildExperimentBundle({ baselineId: ids[0], baselineLabel: 'a', baselineArtifacts: x, variantId: ids[1], variantLabel: 'b', variantArtifacts: y });
  assert.ok(mk(a, b, ['a', 'b']).comparison.verdict);
  assert.throws(() => mk(a, c, ['a', 'c']), /cannot be compared/);
  assert.throws(() => mk(a, d, ['a', 'd']), /cannot be compared/);
  const list = await listRuns(tmp, ['a', 'b', 'c', 'd']);
  const keys = Object.fromEntries(list.map((r) => [r.id, r.conditions]));
  assert.equal(keys.a, keys.b);
  assert.notEqual(keys.a, keys.c);
  assert.notEqual(keys.a, keys.d);
  await rm(tmp, { recursive: true });
});

/* ---- server: Demo Runs work with no eval/runs/, a new valid file appears, invalid is skipped ---- */

async function withServer(env, fn) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn('node', ['server/index.mjs'], { cwd: root, env: { ...process.env, PIPEOPS_SERVER_PORT: String(port), ...env } });
  try {
    for (let i = 0; i < 50; i++) {
      if (await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await fn((p) => fetch(`http://localhost:${port}${p}`).then(async (r) => ({ status: r.status, body: await r.json() })));
  } finally { proc.kill(); }
}

test('server: Demo Runs work without eval/runs/; new valid files appear; invalid ones are skipped', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pipeops-'));
  const demo = path.join(tmp, 'demo');
  await cp(demoDir, demo, { recursive: true });
  await withServer({ PIPEOPS_RUNS_DIR: path.join(tmp, 'does-not-exist'), PIPEOPS_DEMO_DIR: demo }, async (get) => {
    assert.deepEqual((await get('/api/runs')).body, []); // Local Runs: empty, not an error
    const demos = (await get('/api/demo-runs')).body;
    assert.equal(demos.length, demoFiles.length);
    const base = demos.find((r) => r.variant === 'baseline'), variant = demos.find((r) => r.variant === 'episode-routing');
    assert.equal(base.conditions, variant.conditions);
    const exp = await get(`/api/demo-experiment?baseline=${base.id}&variant=${variant.id}`);
    assert.equal(exp.status, 200);
    assert.equal(exp.body.runs.length, 2);
    assert.equal(exp.body.runs[0].checks.length, exp.body.runs[0].metrics.qualityTotal);

    // a teammate drops in a new valid file -> appears with no restart
    const doc = await readPortableFile(path.join(demoDir, demoFiles[0]));
    doc.run.id = 'extra-run'; doc.conditions.seed = 99;
    await writeFile(path.join(demo, 'extra-run.json'), JSON.stringify(doc));
    assert.equal((await get('/api/demo-runs')).body.length, demoFiles.length + 1);
    // ...but not comparable with the seed-1 runs
    assert.equal((await get(`/api/demo-experiment?baseline=extra-run&variant=${variant.id}`)).status, 400);

    // an invalid file is skipped and reported, never half-loaded
    await writeFile(path.join(demo, 'bad.json'), JSON.stringify({ ...doc, kind: 'stage' }));
    assert.equal((await get('/api/demo-runs')).body.length, demoFiles.length + 1);
    assert.equal((await get('/api/demo-runs/problems')).body[0].file, 'bad.json');
  });
  await rm(tmp, { recursive: true });
});

test('server: Local Runs still list and load from a runs dir', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pipeops-'));
  await fakeRun(tmp, 'a', { variant: 'baseline' });
  await fakeRun(tmp, 'b', { variant: 'x' });
  await fakeRun(tmp, 'st', { variant: 'x', kind: 'stage' });
  await withServer({ PIPEOPS_RUNS_DIR: tmp }, async (get) => {
    const runs = (await get('/api/runs')).body;
    assert.deepEqual(runs.map((r) => r.id).sort(), ['a', 'b']); // stage run excluded
    assert.equal((await get('/api/experiment?baseline=a&variant=b')).status, 200);
  });
  await rm(tmp, { recursive: true });
});

test('portableToRawRun maps cleanly to the UI shape', async () => {
  const raw = portableToRawRun(await readPortableFile(path.join(demoDir, demoFiles[0])), 'baseline');
  assert.equal(raw.status, 'recorded');
  assert.ok(raw.checks.length && raw.groundTruth.length && raw.generatedWorkflows.length);
  assert.ok(conditionsKey({}) .length);
});
