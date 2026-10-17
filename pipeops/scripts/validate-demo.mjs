#!/usr/bin/env node
// Usage: npm run validate-demo [-- <file.json> ...]
// With no arguments, validates every demo-data/*.json. Exit code 1 if anything is invalid.

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPortableFile, validatePortable } from '../server/portable.mjs';

const demoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-data');
const files = process.argv.length > 2
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : (await readdir(demoDir)).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(demoDir, f));

let bad = 0;
for (const f of files) {
  let errs;
  try {
    errs = validatePortable(await readPortableFile(f), { fileName: path.basename(f) });
  } catch (e) {
    errs = [String(e.message ?? e)];
  }
  if (errs.length) { bad++; console.log(`FAIL ${path.basename(f)}\n  - ${errs.join('\n  - ')}`); }
  else console.log(`ok   ${path.basename(f)}`);
}
console.log(`\n${files.length - bad}/${files.length} valid`);
process.exit(bad ? 1 : 0);
