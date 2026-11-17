#!/usr/bin/env node
// Re-score a complete MCP summary without replaying battles or inventing match metadata.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { standings, RATING_METHOD } from '../engine/index.js';

export function rescoreTournament(data) {
  assert.equal(data.complete, true, 'Only complete, clean summaries can be re-scored');
  const ids = data.entrants.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'Entrants must be unique');
  const modes = {};
  for (const [mode, q] of Object.entries(data.modes)) {
    assert.ok(q.complete && q.errorCount === 0 && q.unscoredMatches === 0 && !q.errors?.length, `${mode}: incomplete or failed matches`);
    assert.deepEqual(Object.keys(q.headToHead).sort(), [...ids].sort());
    assert.deepEqual(q.standings.map(r => r.bot).sort(), [...ids].sort());
    const outcomes = [];
    for (const [i, a] of ids.entries()) {
      assert.deepEqual(Object.keys(q.headToHead[a]).sort(), ids.filter(id => id !== a).sort());
      for (const b of ids.slice(i + 1)) {
        const parse = value => {
          assert.match(value, /^\d+-\d+-\d+$/, `${mode}: invalid head-to-head count`);
          const counts = value.split('-').map(Number);
          assert.ok(counts.every(Number.isSafeInteger));
          assert.ok(counts.reduce((n, v) => n + v, 0) <= q.scoredMatches);
          return counts;
        };
        const [w, d, l] = parse(q.headToHead[a][b]);
        assert.deepEqual(parse(q.headToHead[b][a]), [l, d, w], `${mode}: non-reciprocal ${a}/${b}`);
        // These are outcome observations only: no map, seed, timing, hull or replay is inferred.
        for (const [winner, count] of [[0, w], [-1, d], [1, l]]) {
          for (let n = 0; n < count; n++) outcomes.push({ a, b, winner });
        }
      }
    }
    assert.equal(outcomes.length, q.scoredMatches, `${mode}: match total mismatch`);
    const table = standings(data.entrants, outcomes);
    modes[mode] = { ...q, ratingMethod: RATING_METHOD, standings: table.map(r => {
      const original = q.standings.find(old => old.bot === r.id);
      for (const key of ['played', 'w', 'd', 'l']) assert.equal(r[key], original[key], `${mode}/${r.id}: ${key} mismatch`);
      return { ...original, rank: r.rank, rating: r.rating };
    }) };
  }
  return { ...data, ratingMethod: RATING_METHOD,
    format: 'Strength ratings re-fitted from recorded MCP head-to-head counts; original diagnostics retained',
    scoring: 'Bradley-Terry batch fit on the Elo scale; 1500 anchor with two prior draws; each whole entrant counts once per match. Sort by unrounded rating, win rate, then id. Legacy points and hullDiff do not rank entrants.',
    modes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) throw new Error('Usage: node tools/rescore-tournament.mjs INPUT.json OUTPUT.json (distinct paths)');
  const source = fs.readFileSync(input);
  const rated = rescoreTournament(JSON.parse(source));
  rated.sourceArtifact = { file: path.basename(input), sha256: crypto.createHash('sha256').update(source).digest('hex') };
  fs.writeFileSync(output, JSON.stringify(rated, null, 2) + '\n');
  console.log(`Re-scored ${Object.values(rated.modes).reduce((n, q) => n + q.scoredMatches, 0)} recorded outcomes; no battles replayed.`);
}
