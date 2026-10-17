#!/usr/bin/env node
// Usage: npm run export-run -- <runId> [--runs-dir <dir>] [--out <file>] [--force]
// Exports one completed FULL wfeval run (eval/runs/<runId>/) to a portable, sanitized JSON
// file in pipeops/demo-data/. See demo-data/CONTRIBUTING.md.

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportRun, validatePortable } from '../server/portable.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const force = args.includes('--force') && args.splice(args.indexOf('--force'), 1);
const runsDir = path.resolve(flag('--runs-dir') ?? path.join(here, '..', '..', 'eval', 'runs'));
const outFlag = flag('--out');
const runId = args[0];

if (!runId || runId.startsWith('-')) {
  console.error('usage: npm run export-run -- <runId> [--runs-dir <dir>] [--out <file>] [--force]\n' +
    'runId is a directory name under eval/runs/ (ls eval/runs).');
  process.exit(2);
}

try {
  const doc = await exportRun(runsDir, path.basename(runId));
  const out = path.resolve(outFlag ?? path.join(here, '..', 'demo-data', `${doc.run.id}.json`));
  const errs = validatePortable(doc, outFlag ? {} : { fileName: path.basename(out) });
  if (errs.length) {
    console.error(`REFUSING to write — the export failed validation:\n  - ${errs.join('\n  - ')}`);
    process.exit(1);
  }
  if (!force && await access(out).then(() => true, () => false)) {
    console.error(`${out} already exists (use --force to overwrite).`);
    process.exit(1);
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`exported ${doc.run.id}\n  -> ${out}`);
  console.log(`  ${doc.provenance.variant.name} · suite ${doc.conditions.suite} seed ${doc.conditions.seed} · ` +
    `${doc.metrics.qualityPassed}/${doc.metrics.qualityTotal} checks · ${doc.metrics.modelRequests} requests · ${doc.metrics.runtimeSeconds}s`);
  console.log('\nValidated + secret-scanned. Before committing, READ the file once (git diff / open it):\n' +
    'it should contain only workflow titles, check results and metrics — nothing you would not post publicly.');
} catch (e) {
  console.error(`export failed: ${e.message}`);
  process.exit(1);
}
