// Paired revision benchmark. Every candidate faces exactly the same frozen old field.
// node tools/compare-bot-revisions.mjs --baseline 09f0b90 --seed 29 --out /tmp/bots.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ENGINE_VERSION, MAP_IDS } from '../engine/index.js';
import { ROOT, readBotSource } from '../node/loader.js';
import { MatchPool } from '../node/runner.js';

const args = process.argv.slice(2), option = (key, fallback) => {
  const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1];
};
const baseline = option('--baseline', '09f0b90'), seed = Number(option('--seed', '29'));
if (!/^[a-f0-9]{7,40}$/i.test(baseline) || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Expected a commit hash and a nonnegative integer seed');
const out = path.resolve(option('--out', 'bot-comparison.json'));
const ids = ['astra', 'sol', 'grindstone', 'quillback', 'carbon', 'tailwind', 'hydrogen'];
const field = Object.fromEntries(ids.map(id => [id, execFileSync('git', ['show', `${baseline}:ironyard/bots/${id}.js`], { cwd: ROOT, encoding: 'utf8' })]));
const candidates = ['astra', 'sol'].flatMap(id => [{ id, version: 'old', source: field[id] }, { id, version: 'new', source: readBotSource(id) }]);
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const report = { engine: ENGINE_VERSION, baseline, seed, maps: MAP_IDS, bothSides: true, budget: 1200, fieldHashes: Object.fromEntries(ids.map(id => [id, hash(field[id])])), rows: [] };
const pool = new MatchPool({ size: 3, timeoutMs: 120000 });
try {
  for (const { id, version, source } of candidates) {
    const jobs = [], results = [];
    for (const mode of ['1v1', '2v2', '3v3']) for (const map of MAP_IDS) for (const other of ids.filter(x => x !== id)) for (const swap of [false, true]) jobs.push({ mode, map, other, swap });
    for (let at = 0; at < jobs.length; at += 24) {
      results.push(...await Promise.all(jobs.slice(at, at + 24).map(async j => {
        const r = await pool.run({ mode: j.mode, map: j.map, seed, swap: j.swap, budget: 1200, teams: [[{ id, source }], [{ id: j.other, source: field[j.other] }]], want: 'score' });
        if (r.errors?.length) throw new Error(r.errors.join('\n'));
        return { ...j, winner: r.winner, reason: r.reason };
      })));
      console.log(`${id} ${version}: ${results.length}/${jobs.length}`);
    }
    const byMode = Object.fromEntries(['1v1', '2v2', '3v3'].map(mode => {
      const rows = results.filter(r => r.mode === mode);
      return [mode, { played: rows.length, w: rows.filter(r => r.winner === 0).length, d: rows.filter(r => r.winner === -1).length }];
    }));
    report.rows.push({ id, version, sha256: hash(source), played: results.length, w: results.filter(r => r.winner === 0).length, byMode, results });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ id, version, byMode }));
  }
} finally { await pool.close(); }
