// The scouting report: the vehicle is the one the engine validates, the record is the ladder's own file read
// the way the ladder reads it, and a file that does not cover the bot is called that, not filled in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironyard-scout-'));
process.env.IRONYARD_LADDER_DIR = dir;            // before the ladder is loaded: it is where this file's season goes
process.env.IRONYARD_BOTS_DIR = path.join(dir, 'no-user-bots');
const { ladder } = await import('../node/ladder.js');
const { scoutBot, ladderRecord, styleOf } = await import('../node/scout.js');
const { listBots } = await import('../node/loader.js');
const { MAP_IDS, DEFAULT_BUDGET } = await import('../engine/index.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// A stand-in for the match pool: rookie loses every match on sumo and every match against bastion and wins
// the rest; any other pairing goes to whoever starts as team 0. No match is played.
const decided = { run: async (spec) => {
  const ids = spec.teams.map((t) => t[0].id), k = ids.indexOf('rookie');
  const winner = k < 0 ? 0 : spec.map === 'sumo' || ids[1 - k] === 'bastion' ? 1 - k : k;
  return { winner, teams: [{ hull: winner === 0 ? 1 : 0 }, { hull: winner === 1 ? 1 : 0 }], errors: [] };
} };

test('the vehicle a bot fields, as the engine validates it', async () => {
  const r = await scoutBot('rookie', { ladderDir: path.join(dir, 'nothing-here') });
  assert.deepEqual(r.bot, { id: 'rookie', name: 'Rookie', author: 'ironyard', kind: 'builtin', notes: 'Baseline: balanced wheels + 2 MG, hold mid range.' });
  const d = r.design;
  assert.equal(d.budget, DEFAULT_BUDGET); assert.equal(d.fieldedAs, 'every mode, team slot and map');
  assert.ok(d.cost <= DEFAULT_BUDGET && d.mass > 100 && d.topSpeed > 3 && d.turnRate > 0.5 && typeof d.weightClass === 'string');
  assert.ok(d.weapons.mg >= 2);
  for (const side of ['front', 'rear', 'left', 'right']) assert.ok(d.coreProtection[side].pieces >= 0 && d.coreProtection[side].hpVsBullet >= d.coreProtection[side].hp);
  assert.ok(d.dpsByRange[6] > 0 && d.dpsByRangeRear === undefined, 'nothing fires astern, so that table is left out');
  assert.deepEqual(d.blindArcsDeg, [[50, 310]]);
  assert.ok(d.energy.secondsOfFullFire > 0 && d.insights.length > 0 && d.insights.length <= 6);
  assert.equal(r.otherDesigns, undefined);
  // no ladder file: said in so many words, and the hints fall back on the design
  assert.equal(r.record.scheduled, (listBots().length - 1) * MAP_IDS.length * 2);
  assert.equal(r.record.onFile, 0); assert.equal(r.record.byOpponent, undefined);
  assert.match(r.record.note, /^No ladder results on file \(.*results\.json is missing\)/);
  assert.ok(r.hints.length >= 2 && r.hints.length <= 4);
  assert.match(r.hints[0], /^No ladder record on file/);
  assert.ok(r.hints.some((h) => /Nothing covers its rear \(bearings 50°–310°/.test(h)), r.hints.join(' | '));
  assert.ok(JSON.stringify(r).length < 4500, `${JSON.stringify(r).length} bytes`);

  // one file, several vehicles: the others are listed with where they are fielded
  const pack = await scoutBot('wolfpack', { ladderDir: path.join(dir, 'nothing-here') });
  assert.match(pack.design.fieldedAs, /^1v1 on proving/);
  assert.deepEqual(pack.otherDesigns.map((o) => o.fieldedAs), [['2v2 slot 1', '3v3 slot 1'], ['3v3 slot 2']]);
  assert.ok(pack.otherDesigns.every((o) => o.name !== pack.design.name && o.cost <= DEFAULT_BUDGET && o.weapons));

  await assert.rejects(scoutBot('nope'), /unknown bot "nope"\. Known bots: .*rookie/);
  await assert.rejects(scoutBot('../etc/passwd'), /bad bot name/);
});

test('the record is the ladder file read the way the ladder reads it', async () => {
  const board = await ladder(decided, { queues: ['1v1'] });
  const q = board.queues['1v1'], n = listBots().length - 1;
  assert.ok(board.complete && q.onFile === q.matches);
  const r = await scoutBot('rookie');
  const rec = r.record, row = q.standings.find((x) => x.id === 'rookie');
  assert.equal(rec.scheduled, n * 16); assert.equal(rec.onFile, rec.scheduled); assert.equal(rec.note, undefined); assert.equal(rec.savedTable, undefined);
  // the same totals as the ladder's own table: the keys are the ladder's keys
  assert.deepEqual([rec.w, rec.l, rec.standing.rank, rec.standing.rating, rec.standing.of], [row.w, row.l, row.rank, row.rating, n + 1]);
  assert.equal(rec.l, 2 * n + 14, 'two a head on sumo, and bastion on the seven other maps');
  assert.equal(rec.winRate, Math.round((rec.w / rec.onFile) * 100) / 100);
  assert.deepEqual(rec.byOpponent[0], { vs: 'bastion', w: 0, l: 16 }, 'worst first');
  assert.ok(rec.byOpponent.slice(1).every((o) => o.w === 14 && o.l === 2));
  assert.equal(rec.byOpponent.length, Math.min(n, 12));
  assert.deepEqual(rec.byMap[0], { map: 'sumo', w: 0, l: 2 * n });
  assert.ok(rec.byMap.slice(1).every((m) => m.w === 2 * n - 2 && m.l === 2) && rec.byMap.length === MAP_IDS.length);
  assert.match(r.hints[0], /^Loses 16 of 16 to bastion: bastion is a long-range gun car \(.*cannon.*\)\.$/);
  assert.match(r.hints[1], new RegExp(`^Weakest on sumo \\(wins 0 of ${2 * n}\\); \\d+% overall\\.$`));
  assert.ok(r.hints.length === 4 && r.hints.slice(2).every((h) => /^(Its|It|Nothing|All|\d+%)/.test(h)), r.hints.join(' | '));
  assert.deepEqual(ladderRecord('rookie'), rec, 'the record alone, without loading a controller');
  // two that beat it: both are named, with what they are
  const other = await scoutBot('bastion');
  assert.match(other.hints[0], /^Loses 16 of 16 to angler and 16 of 16 to astra: (both are [a-z -]+s \(.+ \/ .+\)|angler is a [a-z -]+ \(.+\) and astra is a [a-z -]+ \(.+\))\.$/);
  assert.equal(styleOf({ weapons: {}, kegs: 0, ramParts: 2 }, { weapons: [] }), 'rammer');
  assert.equal(styleOf({ weapons: { mortar: 1, mg: 1 }, kegs: 0 }, { weapons: [{ range: 24 }, { range: 13 }] }), 'artillery car');
});

test('a file that does not cover the bot is called that', async () => {
  const file = path.join(dir, 'results.json'), full = JSON.parse(fs.readFileSync(file, 'utf8'));
  const write = (map) => fs.writeFileSync(file, JSON.stringify({ results: Object.fromEntries(Object.entries(full.results).flatMap(map)) }));
  const tail = (k) => `${k.slice(0, k.lastIndexOf('|'))}|0000000000`;
  try {
    // every result that has rookie in it was keyed with other source code
    write(([k, v]) => [[k.split('|').slice(4, 6).includes('rookie') ? tail(k) : k, v]]);
    let rec = ladderRecord('rookie');
    assert.equal(rec.onFile, 0); assert.equal(rec.w, undefined); assert.equal(rec.byOpponent, undefined);
    assert.match(rec.note, /^None of rookie's \d+ scheduled 1v1 matches are on file for its current source\. .* keyed with other source code .* not counted\. Calling leaderboard plays what is missing\.$/);
    assert.equal((await scoutBot('rookie')).hints[0], 'No ladder record on file for its current source: what follows comes from its design alone.');
    // ...while a bot whose results are all there is none the worse for it, except against rookie
    rec = ladderRecord('bastion');
    assert.equal(rec.onFile, rec.scheduled - 16);
    assert.match(rec.note, /^Results against rookie are on file for an older version of that opponent and are not counted\./);
    assert.match(rec.standing.provisional, /^only \d+ of the season's \d+ matches are on file$/);

    // results the ladder itself would replay (filed before it checked for controller errors) are not counted either
    write(([k, v]) => [[k, k.split('|').slice(4, 6).includes('rookie') ? { w: v.w, h: v.h } : v]]);
    rec = ladderRecord('rookie');
    assert.equal(rec.onFile, 0);
    assert.match(rec.note, /^\d+ results on file for the current source were filed by an older ladder/);

    // never played: half of rookie's matches are simply not there
    let seen = 0;
    write(([k, v]) => (k.split('|').slice(4, 6).includes('rookie') && seen++ % 2 ? [] : [[k, v]]));
    rec = ladderRecord('rookie');
    assert.equal(rec.onFile, rec.scheduled / 2);
    assert.match(rec.note, new RegExp(`^${rec.scheduled / 2} matches not played yet\\.`));
    assert.equal(rec.w + rec.l, rec.onFile);
  } finally { fs.writeFileSync(file, JSON.stringify(full)); }
});
