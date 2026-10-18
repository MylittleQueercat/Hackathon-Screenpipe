// Saves one finished live run as the slide's recorded fallback:
//   node scripts/export-live.mjs <eval>/runs/<stage-discover run>
// Only what the slide shows: timings, tool names, Workflows actions with their titles and
// refusal reasons, and the graded checks. No prompts, no logs, nothing from home/.

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResult, toEvents } from '../server/live.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: export-live.mjs <run dir>');
const rows = (await readFile(path.join(dir, 'requests.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
// A run regraded after a grader fix keeps its original result beside the new one.
const regraded = await access(path.join(dir, 'results.regraded.jsonl')).then(() => true, () => false);
const result = await readResult(dir, regraded ? 'results.regraded.jsonl' : 'results.jsonl');
const out = { run: path.basename(dir), events: toEvents(rows), result };
const text = JSON.stringify(out, null, 1);
if (/eyJ[\w-]{20,}\.|\/Users\/(?!Shared|morgan)/.test(text)) throw new Error('refusing: a token or a home path is in the export');
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'live-recorded.json');
await writeFile(dest, `${text}\n`);
console.log(`${dest}: ${out.events.length} events, ${result.requests} requests`);
