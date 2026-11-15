// The ladder: who is dealt onto which team, what a season consists of, and how results become ratings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_IDS } from '../engine/index.js';
import { authorOf, modelOf, draft, schedule, rate, byAuthor, entrantsNow, ladderMarkdown, ladderSnapshot, TEAM_ROUNDS } from '../node/ladder.js';

const field = (n, authors) => Array.from({ length: n }, (_, i) => ({ id: `bot${String(i).padStart(2, '0')}`, kind: 'user', author: authors[i % authors.length], hash: 'h' + i }));

test('the author of a bot is the one its meta names', () => {
  assert.equal(authorOf("const meta = { name: 'X', author: 'north-garage', notes: 'n' };"), 'north-garage');
  assert.equal(authorOf('const meta = { name: "X", author: "a b" };'), 'a b');
  assert.equal(authorOf('const meta = { name: "X" };'), 'unknown');
  const here = entrantsNow();
  assert.ok(here.length >= 13 && here.every((e) => e.author && e.hash.length === 12));
  assert.equal(here.find((e) => e.id === 'rookie').author, 'ironyard');
});

test('a draft deals full, even teams, the same way every time, and keeps an author apart from itself', () => {
  const four = field(12, ['a', 'b', 'c', 'd']);
  for (const size of [2, 3]) for (let r = 0; r < 12; r++) {
    const teams = draft(four, size, r);
    assert.equal(teams.length % 2, 0);
    assert.ok(teams.every((t) => t.length === size));
    assert.equal(new Set(teams.flat().map((e) => e.id)).size, teams.length * size, 'nobody plays twice in a round');
    assert.ok(teams.every((t) => new Set(t.map((e) => e.author)).size === size), `round ${r}: every team is ${size} different authors`);
    assert.deepEqual(draft(four, size, r), teams);
  }
  assert.notDeepEqual(draft(four, 2, 0).map((t) => t.map((e) => e.id)), draft(four, 2, 1).map((t) => t.map((e) => e.id)), 'a new round is a new deal');
  // one author with most of the bots: teams still fill, and the others are spread over them
  const lopsided = field(13, ['house']).concat([{ id: 'x1', kind: 'user', author: 'p', hash: 'x' }, { id: 'x2', kind: 'user', author: 'q', hash: 'y' }]);
  const t3 = draft(lopsided, 3, 0);
  assert.equal(t3.length, 4);
  assert.ok(t3.every((t) => t.length === 3));
  // too few to make two teams: nobody plays
  assert.equal(draft(field(3, ['a']), 2, 0).length, 0);
  assert.deepEqual(schedule('3v3', field(5, ['a'])), []);
});

test('a season: every pair on every map from both sides in 1v1; mixed teams over the rounds otherwise', () => {
  const es = field(6, ['a', 'b', 'c']);
  const solo = schedule('1v1', es);
  assert.equal(solo.length, 15 * MAP_IDS.length * 2);
  assert.ok(solo.every((m) => m.mode === '1v1' && m.teams[0].length === 1 && m.teams[1].length === 1));
  const duo = schedule('2v2', es);
  assert.equal(duo.length, TEAM_ROUNDS * 1 * 2 * 2, 'six bots make two teams of two; each pairing plays both slots from both sides');
  assert.ok(duo.every((m) => m.teams[0].length === 2 && m.teams[1].length === 2 && MAP_IDS.includes(m.map)));
  assert.ok(new Set(duo.map((m) => m.map)).size === MAP_IDS.length, 'the rounds go round the maps');
  const mates = new Set(duo.map((m) => m.teams[0].join('+')));
  assert.ok(mates.size > 3, 'the teams change from round to round');
  assert.deepEqual(schedule('2v2', es), duo);
});

test('ratings: winners rise, team-mates move together, the order results arrive in does not matter', () => {
  const es = field(4, ['a', 'b']);
  const ms = schedule('1v1', es).map((m, i) => ({ ...m, key: 'k' + i }));
  // bot00 beats everyone, bot03 loses to everyone, the middle two draw with each other
  const rank = { bot00: 3, bot01: 2, bot02: 2, bot03: 1 };
  const results = Object.fromEntries(ms.map((m) => { const [a] = m.teams[0], [b] = m.teams[1]; return [m.key, { w: rank[a] > rank[b] ? 0 : rank[a] < rank[b] ? 1 : -1 }]; }));
  const table = rate(es, ms, results);
  assert.deepEqual(table.map((r) => r.rank), [1, 2, 3, 4]);
  assert.equal(table[0].id, 'bot00'); assert.equal(table[3].id, 'bot03');
  assert.ok(table[0].rating > 1500 && table[3].rating < 1500);
  assert.equal(table[1].rating, table[2].rating, 'two bots with the same record have the same rating');
  assert.equal(table[0].winRate, 1); assert.equal(table[0].played, 3 * MAP_IDS.length * 2);
  assert.ok(Math.abs(table.reduce((s, r) => s + r.rating, 0) / 4 - 1500) < 3, 'the field stays centred on 1500');
  assert.ok(table[0].rating < 2600 && table[3].rating > 400, 'a perfect record does not run off the scale');
  assert.deepEqual(rate(es, ms.slice().reverse(), results), table);
  // a result that is not on file is not counted
  assert.equal(rate(es, ms, {})[0].played, 0);

  // a team queue: one bot that always wins lifts whoever it is dealt with, and ends on top
  const six = field(6, ['a', 'b', 'c']);
  const tms = schedule('2v2', six).map((m, i) => ({ ...m, key: 't' + i }));
  const tres = Object.fromEntries(tms.map((m) => [m.key, { w: m.teams[0].includes('bot00') ? 0 : m.teams[1].includes('bot00') ? 1 : -1 }]));
  const tt = rate(six, tms, tres);
  assert.equal(tt[0].id, 'bot00');
  assert.ok(tt[0].rating > tt[1].rating + 50);
  const authors = byAuthor(tt);
  assert.equal(authors[0].author, 'a'); assert.equal(authors[0].best, 'bot00'); assert.equal(authors[0].bots, 2);

  const md = ladderMarkdown({ engine: 'x', entrants: 6, queues: { '2v2': { matches: tms.length, onFile: tms.length, standings: tt, authors } } });
  assert.match(md, /## 2v2/); assert.match(md, /\| 1 \| `bot00` \| a \|/);
});


test('every selected bot plays every team slot equally, including minority authors', () => {
  const es = field(13, ['house']).concat(['astra', 'sol', 'quillback', 'grindstone'].map(id => ({ id, author: id, kind: 'user', hash: id })));
  for (const size of [2, 3]) {
    const ms = schedule(`${size}v${size}`, es), slots = Object.fromEntries(es.map(e => [e.id, Array(size).fill(0)]));
    for (const m of ms) for (const team of m.teams) team.forEach((id, slot) => slots[id][slot]++);
    for (const [id, counts] of Object.entries(slots)) {
      assert.ok(counts.every(n => n > 0), `${id} visits each slot`);
      assert.equal(new Set(counts).size, 1, `${id} has exact slot balance`);
    }
    for (let i = 0; i < ms.length; i += 2) {
      assert.deepEqual(ms[i].teams, ms[i + 1].teams);
      assert.equal(ms[i].map, ms[i + 1].map);
      assert.notEqual(ms[i].swap, ms[i + 1].swap);
    }
  }
});

test('the joint fit matches an independently solved symmetric likelihood for solo and correlated teams', () => {
  for (const size of [1, 2, 3]) {
    const es = field(size * 2, ['house']);
    const teams = [es.slice(0, size).map(e => e.id), es.slice(size).map(e => e.id)];
    const ms = Array.from({ length: 12 }, (_, i) => ({ teams, key: String(i) }));
    const results = Object.fromEntries(ms.map((m, i) => [m.key, { w: i < 10 ? 0 : 1 }]));
    // Symmetry gives winners +z and losers -z. Solve the scalar stationarity
    // equation by bisection, independent of the production matrix optimiser.
    const sigmoid = z => 1 / (1 + Math.exp(-z));
    let lo = 0, hi = 10;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2;
      if (12 * sigmoid(2 * size * mid) - 10 + 2 * (sigmoid(mid) - 0.5) > 0) hi = mid; else lo = mid;
    }
    const delta = (lo + hi) / 2 * 400 / Math.LN10;
    const table = rate(es, ms, results);
    for (const r of table) assert.equal(r.rating, Math.round(1500 + (teams[0].includes(r.id) ? delta : -delta)));
    assert.deepEqual(rate(es, ms.slice().reverse(), results), table);
  }
});

test('unscored failures and zero-game bots do not acquire fictitious draws or ranks', () => {
  const es = field(3, ['house']);
  const ms = [{ key: 'bad', teams: [['bot00'], ['bot01']] }, { key: 'good', teams: [['bot00'], ['bot01']] }];
  const rows = rate(es, ms, { bad: { w: null, void: true, err: 'worker failed' }, good: { w: 0 } });
  assert.equal(rows.find(r => r.id === 'bot00').played, 1);
  assert.equal(rows.find(r => r.id === 'bot01').d, 0);
  assert.equal(rows.find(r => r.id === 'bot02').rank, null);
  assert.equal(byAuthor(rate(es, ms, {})).length, 0);
});

test('model attribution and snapshot completion are explicit', () => {
  assert.equal(modelOf("const meta = {author:'Garage',model:'gpt-6-astra'}"), 'gpt-6-astra');
  assert.equal(modelOf("const meta = {author:'Claude Fable'}"), null);
  const standings = rate(field(2, ['garage']), [], {});
  const board = {engine:'test',method:'test',budget:1200,entrants:2,complete:false,
    queues:{'1v1':{matches:16,onFile:0,errorCount:1,standings,authors:[]}}};
  const snap = ladderSnapshot(board);
  assert.equal(snap.complete, false); assert.equal(snap.queues['1v1'].onFile, 0);
  assert.equal(snap.queues['1v1'].standings[0][7], null);
  assert.equal(snap.queues['1v1'].standings[0][8], null);
  const md = ladderMarkdown(board);
  assert.match(md, /Provisional/); assert.match(md, /Not recorded/); assert.match(md, /1 contain errors/);
});


test('the ladder reports and retries unattributed and runtime failures instead of counting draws', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironyard-score-check-'));
  const previous = process.env.IRONYARD_LADDER_DIR;
  process.env.IRONYARD_LADDER_DIR = dir;
  try {
    const { ladder } = await import('../node/ladder.js?result-check-test');
    let calls = 0;
    const good = () => ({ winner: 0, teams: [{ hull: 1 }, { hull: 0 }], errors: [] });
    const first = await ladder({ run: async () => {
      const n = calls++;
      if (n === 0) throw new Error('worker unavailable');
      return { ...good(), errors: n === 1 ? ['bot tick threw'] : [] };
    } }, { queues: ['1v1'] });
    const q = first.queues['1v1'];
    assert.equal(first.complete, false); assert.equal(q.errorCount, 2);
    assert.equal(q.onFile, q.matches - 2);
    assert.ok(q.standings.every(r => r.d === 0), 'failures were not draws');
    let retried = 0;
    const second = await ladder({ run: async () => { retried++; return good(); } }, { queues: ['1v1'] });
    assert.equal(retried, 2); assert.equal(second.complete, true);
    assert.equal(second.errors, undefined);
  } finally {
    if (previous === undefined) delete process.env.IRONYARD_LADDER_DIR; else process.env.IRONYARD_LADDER_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
