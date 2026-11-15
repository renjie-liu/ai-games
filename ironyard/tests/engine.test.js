import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPS, MAP_IDS, MODES, PARTS, validateDesign, parseBlueprint, renderDesign, runMatch, summarize,
  makeNav, wrapBotSource, preprocessBotSource, makeSchedule, standings, DEFAULT_BUDGET,
} from '../engine/index.js';
import { listBots, loadBot, makeBot, readBotSource } from '../node/loader.js';
import { MatchPool, withSources } from '../node/runner.js';

const strip = (res) => JSON.stringify(res, (k, v) => (k === 'cpu' ? undefined : v));

test('every map is well formed and connected', () => {
  for (const id of MAP_IDS) {
    const m = MAPS[id];
    assert.equal(m.rows.length, m.h);
    assert.ok(m.itemSpawns.length >= 2, `${id} has item spawns`);
    for (const s of m.itemSpawns) assert.ok(s.pair >= 0, `${id}: item spawns come in mirrored pairs`);
    const nav = makeNav(m);
    for (const slot of [0, 1, 2]) {
      const a = m.spawns[0][slot], b = m.spawns[1][slot];
      assert.ok(nav.path(a.x, a.y, b.x, b.y, { margin: 2.0 }).length > 0, `${id}: widest vehicle can cross from spawn ${slot}`);
      assert.ok(nav.clearance(a.x, a.y).wall >= 2 && nav.clearance(a.x, a.y).pit >= 2, `${id}: spawn ${slot} has room for a full-size hull`);
      // 180° rotational symmetry of spawns
      assert.ok(Math.abs(a.x + b.x - m.width) < 1e-9 && Math.abs(a.y + b.y - m.height) < 1e-9);
    }
  }
});

test('built-in bots have legal designs in every mode', () => {
  for (const { id } of listBots().filter((b) => b.kind === 'builtin')) {
    for (const mode of Object.keys(MODES)) {
      const r = runMatch({ map: 'proving', mode, teams: [[loadBot(id)], [loadBot('rookie')]], seed: 3, maxTime: 2, record: false });
      for (const v of r.vehicles) {
        assert.ok(v.designStats.cost <= DEFAULT_BUDGET, `${id} within budget`);
        assert.deepEqual(v.errors, [], `${id} runs without errors`);
      }
    }
  }
});

const E = '.  .  .  .  .  .  .  .  .';
const TANKETTE = { deck: [E, E, '.  .  .  .  /^ .  .  .  .', '.  .  .  .  :  .  .  .  .', '.  .  .  a  C^ a  .  .  .', '.  .  .  a  @  a  .  .  .', E, E, E, E, E],
  chassis: [E, E, '.  .  .  .  p  .  .  .  .', '.  .  :  p  p  p  :  .  .', '.  .  :  p  r  p  :  .  .', '.  .  T  p  p  p  T  .  .', E, E, E, E, E] };

test('design validation: the brick-kit rules', () => {
  const ok = validateDesign(parseBlueprint('ok', TANKETTE, { paint: { accent: 'yellow' } }));
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.equal(ok.design.paint.accent, 'yellow');
  assert.equal(ok.stats.cost, 623);
  assert.match(renderDesign(ok.design), /DECK[\s\S]*CHASSIS/);
  // the rulebook's JSON starter is legal too
  assert.equal(validateDesign({ parts: [{ type: 'plate', x: 0, y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 }, { type: 'wheel', x: -1, y: 0, z: 0 }, { type: 'wheel', x: 1, y: 0, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }] }).ok, true);
  const base = [{ type: 'plate', x: 0, y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 }, { type: 'plate', x: 0, y: 2, z: 0 }, { type: 'core', x: 0, y: 0, z: 1 }];
  const bad = (extra) => validateDesign({ name: 'x', parts: base.concat(extra) }).errors.join(' | ');
  assert.equal(bad([]), '');
  assert.match(bad([{ type: 'wheel', x: 3, y: 0 }]), /not connected/);
  assert.match(bad([{ type: 'core', x: 0, y: 1, z: 1 }]), /at most 1 core/);
  assert.match(validateDesign({ parts: [{ type: 'plate', x: 0, y: 0, z: 0 }] }).errors.join(), /at least 1 core/);
  assert.match(bad([{ type: 'mg', x: 0, y: 1, dir: 'N' }, { type: 'brick', x: 0, y: 2, z: 1 }]), /blocked by brick/);
  assert.equal(bad([{ type: 'mg', x: 0, y: 1, dir: 'N' }, { type: 'slope', x: 0, y: 2, z: 1, dir: 'N' }]), '', 'low pieces do not block a deck gun');
  assert.match(bad([{ type: 'mg', x: 1, y: 1, dir: 'N' }]), /nothing under it/);
  assert.match(bad([{ type: 'wheel', x: 1, y: 0, z: 1 }]), /only go on the chassis/);
  assert.match(bad([{ type: 'mg', x: 0, y: 1, z: 0 }]), /only go on the deck/);
  assert.match(bad([{ type: 'track', x: 1, y: 4 }]), /sticks out of the grid/);
  assert.match(bad([{ type: 'plate2', x: 0, y: 1, z: 0 }]), /overlaps plate/);
  assert.match(bad([{ type: 'thruster', x: 0, y: 3, z: 0, dir: 'N' }, { type: 'plate', x: 1, y: 2, z: 0 }]), /exhaust blocked/);
  assert.match(bad([{ type: 'warp', x: 1, y: 0 }]), /unknown part type/);
  assert.match(bad(Array.from({ length: 9 }, (_, i) => ({ type: 'plate', x: 1, y: i - 4, z: 0 })).concat(Array.from({ length: 9 }, (_, i) => ({ type: 'tile', x: 1, y: i - 4 })))), /at most 8 decor/);
  const rich = [];
  for (let x = -4; x <= 4; x++) for (const y of [3, 4, 5]) rich.push({ type: 'armor', x, y, z: 0 });
  assert.match(bad(rich.concat(rich.map((p) => ({ ...p, z: 1 })))), /exceeds budget/);
  // a 2x2 pod laid on its lowest corner covers four studs; ASCII must mark them
  assert.throws(() => parseBlueprint('x', { chassis: [E, E, E, E, E, '.  .  .  .  Q  .  .  .  .', E, E, E, E, E] }), /must be written ":"/);
});

test('nav: smoothed routes do not graze pits', async () => {
  const { makeNav } = await import('../engine/index.js');
  const nav = makeNav(MAPS.sumo); // 4 m hole dead centre, spawns on either side of it
  const route = nav.path(19.3, 34.5, 20.7, 5.5, { margin: 1.35 });
  assert.ok(route.length >= 2, 'has to go round the hole');
  let px = 19.3, py = 34.5;
  for (const wp of route) {
    for (let k = 0; k <= 40; k++) {
      const x = px + ((wp.x - px) * k) / 40, y = py + ((wp.y - py) * k) / 40;
      for (const [dx, dy] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) assert.notEqual(nav.tileAt(x + dx, y + dy), 'pit', `route passes within 0.7 m of the pit at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    }
    px = wp.x; py = wp.y;
  }
});

test('two layers: shots hit the deck first, rams hit the chassis first, slopes deflect', async () => {
  const { World } = await import('../engine/index.js');
  const target = validateDesign({ parts: [
    { type: 'plate', x: 0, y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 }, { type: 'wheel', x: -1, y: 0, z: 0 }, { type: 'wheel', x: 1, y: 0, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'slope', x: 0, y: 1, z: 1, dir: 'N' }] }).design;
  const w = new World({ map: MAPS.proving, seed: 1, entries: [{ team: 0, slot: 0, design: target }, { team: 1, slot: 0, design: target }] });
  const v = w.vehicles[0], foe = w.vehicles[1];
  const slope = v.parts.find((p) => p.type === 'slope'), plate = v.parts.find((p) => p.type === 'plate' && p.y === 1);
  assert.equal(w.partAt(v, slope.wx, slope.wy), slope, 'a shot meets the deck piece');
  assert.equal(w.partAt(v, slope.wx, slope.wy, true), plate, 'a ram meets the chassis piece');
  const head = v.th; // slope faces forward: a shot travelling backwards along the hull hits its face
  const before = slope.hp;
  w.damage(v, slope, 40, 'kinetic', foe, head + Math.PI);
  assert.ok(Math.abs(before - slope.hp - (40 * 0.45 - 1)) < 1e-9, 'frontal hit is deflected, then armor 1');
  w.damage(v, slope, 40, 'kinetic', foe, head);
  assert.ok(slope.hp < before - 40, 'a hit from behind is not deflected');
});

test('matches are deterministic', () => {
  const run = () => runMatch({ map: 'canyon', mode: '2v2', teams: [[loadBot('wolfpack')], [loadBot('hornet'), loadBot('longshot')]], seed: 42 });
  const a = run(), b = run();
  assert.equal(strip(a), strip(b));
  const c = runMatch({ map: 'canyon', mode: '2v2', teams: [[loadBot('wolfpack')], [loadBot('hornet'), loadBot('longshot')]], seed: 43 });
  assert.notEqual(strip(a), strip(c), 'a different seed changes the match');
  assert.ok(a.frames.length > 100 && a.winner !== null);
  assert.ok(summarize(a).timeline.length > 0);
});

test('controllers that throw are cut off, not fatal', () => {
  const src = `const design = ${JSON.stringify(validateDesign(parseBlueprint('t', TANKETTE)).design)};
    function tick(state) { if (state.t > 1) throw new Error('boom'); return { throttle: 1 }; }`;
  const r = runMatch({ map: 'proving', mode: '1v1', teams: [[makeBot('thrower', src)], [loadBot('rookie')]], seed: 1, record: false });
  assert.equal(r.vehicles[0].cutOff, true);
  assert.match(r.vehicles[0].errors.join(' '), /boom/);
  assert.ok(r.winner !== null);
});

test('controller source rules', () => {
  assert.throws(() => preprocessBotSource('import fs from "fs";\nfunction tick(){}'), /imports are not allowed/);
  assert.throws(() => preprocessBotSource('function tick() {\n  return import("node:fs");\n}'), /word "import" cannot appear .*\(line 2\)/);
  assert.match(preprocessBotSource('export const design = {};\nexport function tick() {}'), /^const design/);
  assert.ok(wrapBotSource('function tick(){}').includes('"use strict"'));
  assert.throws(() => makeBot('broken', 'const design = {};\nconst x = ;\nfunction tick() {}'), /bot "broken" failed to compile: Unexpected token ';' \(line 2\)/);
});

test('watchdog kills a controller that never returns', async () => {
  const pool = new MatchPool({ size: 1, timeoutMs: 1500 });
  const hang = readBotSource('rookie').replace('function tick(state, api) {', 'function tick(state, api) { if (state.t > 0.5) for (;;) {}');
  try {
    await assert.rejects(
      pool.run({ map: 'proving', mode: '1v1', seed: 1, want: 'score', teams: [[{ id: 'hang', source: hang }], [{ id: 'rookie', source: readBotSource('rookie') }]] }),
      /controller "hang" did not return/);
    // the pool recovers
    const ok = await pool.run({ map: 'sumo', mode: '1v1', seed: 1, want: 'score', teams: withSources([['rookie'], ['bulldozer']]) });
    assert.ok(ok.winner !== undefined);
  } finally { await pool.close(); }
});

test('team play: slots count from 0, the dead say nothing, a repair arm does not wait on what cannot be mended', async () => {
  const { World } = await import('../engine/index.js');
  // slot is one number everywhere — in 2v2 too, where the team stands on the map's outer spawn points
  const reporter = readBotSource('rookie').replace('function tick(state, api) {',
    `let told = false;\nfunction init(info, api) { api.log('INIT', info.slot); }\nfunction tick(state, api) { if (!told) { told = true; api.log('TICK', state.self.slot, state.allies.map((a) => a.slot)); }`)
    .replace(/const design = /, 'const design0 = ').concat('\nconst design = (ctx, api) => { api.log("DESIGN", ctx.slot); return typeof design0 === "function" ? design0(ctx, api) : design0; };');
  for (const mode of ['2v2', '3v3']) {
    const res = runMatch({ map: 'proving', mode, teams: [[makeBot('reporter', reporter)], [loadBot('rookie')]], seed: 2, record: false, maxTime: 0.2 });
    const mine = res.vehicles.filter((v) => v.team === 0);
    mine.forEach((v, k) => {
      const others = mine.map((m) => m.slot).filter((sl) => sl !== k);
      assert.deepEqual(v.logs.map((l) => l.replace(/^\[[^\]]*\] /, '')), [`DESIGN ${k}`, `INIT ${k}`, `TICK ${k} ${JSON.stringify(others)}`], `${mode} slot ${k}`);
      assert.equal(v.slot, k);
    });
  }
  const sp = MAPS.proving.spawns[0];
  const two = runMatch({ map: 'proving', mode: '2v2', teams: [[loadBot('rookie')], [loadBot('rookie')]], seed: 2, maxTime: 0.05 });
  assert.ok(Math.abs(two.frames[0].v[0][0] - sp[1].x) < 1 && Math.abs(two.frames[0].v[1][0] - sp[2].x) < 1, '2v2 still starts on the outer spawns');

  const truck = validateDesign({ parts: [
    { type: 'plate4', x: -1, y: 0, z: 0 }, { type: 'plate4', x: -1, y: -2, z: 0 }, { type: 'wheel', x: -2, y: 1, z: 0 }, { type: 'wheel', x: 1, y: 1, z: 0 },
    { type: 'wheel', x: -2, y: -2, z: 0 }, { type: 'wheel', x: 1, y: -2, z: 0 }, { type: 'reactor', x: 1, y: 0, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'repairer', x: -1, y: 0, z: 1 }, { type: 'brick', x: -1, y: -1, z: 1 }, { type: 'brick', x: 0, y: -1, z: 1 }] });
  assert.equal(truck.ok, true, truck.errors.join('; '));
  const entries = [0, 1].flatMap((team) => [0, 1].map((slot) => ({ team, slot, spawn: slot + 1, design: truck.design })));
  const w = new World({ map: MAPS.proving, seed: 1, entries });
  const [a, b] = w.teams[0];

  // a message is heard the tick after it is said, and not again once its author is gone
  w.setCommand(a, { say: { focus: 3 } });
  assert.deepEqual(w.observeAll()[b.id].messages, [{ from: 0, id: a.id, data: { focus: 3 } }]);
  const foe = w.teams[1][0];
  w.setCommand(foe, { say: 'last words' });
  w.kill(foe, null, 'test');
  assert.deepEqual(w.observeAll()[w.teams[1][1].id].messages, []);

  // b parks beside a, missing a brick it will never get back; a is the one with a dent
  b.x = a.x + 3; b.y = a.y; b.th = a.th;
  w.updateCells(b);
  w.destroy(b, b.parts.find((p) => p.type === 'brick'), null, 'test');
  w.settle();
  const dent = a.parts.find((p) => p.type === 'plate4');
  w.damage(a, dent, 100, 'kinetic', null);
  assert.ok(b.hpNow < b.hpMax && b.parts.every((p) => !p.alive || p.hp === p.maxHp), 'b has nothing that can be mended');
  w.setCommand(a, { target: b.id });
  const before = dent.hp;
  for (let i = 0; i < 120; i++) w.step();
  assert.ok(dent.hp > before + 10, `the arm mends its own vehicle meanwhile (${before} → ${dent.hp})`);
  // …and the chosen ally does come first when it has something to mend
  const scratch = b.parts.find((p) => p.type === 'plate4');
  w.damage(b, scratch, 20, 'kinetic', null);
  w.damage(a, dent, 100, 'kinetic', null);
  const mine = dent.hp, theirs = scratch.hp;
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(scratch.hp > theirs + 5 && dent.hp === mine, 'target first');
});

test('tournament bookkeeping', () => {
  const entrants = [{ id: 'a', bots: ['a'] }, { id: 'b', bots: ['b'] }, { id: 'c', bots: ['c'] }];
  const sched = makeSchedule({ entrants, maps: ['proving', 'sumo'], seeds: [1, 2] });
  assert.equal(sched.length, 3 * 2 * 2 * 2);
  const table = standings(entrants, [{ a: 'a', b: 'b', winner: 0, hull: [1, 0] }, { a: 'a', b: 'c', winner: -1, hull: [0.5, 0.5] }, { a: 'b', b: 'c', winner: 1, hull: [0, 1] }]);
  assert.deepEqual(table.map((r) => [r.id, r.points]), [['a', 4], ['c', 4], ['b', 0]]);
});


test('Wolfpack mender selects a distant ally instead of dereferencing a null repair target', () => {
  const r = runMatch({ mode: '3v3', map: 'bog', seed: 38, swap: true,
    teams: [['angler', 'astra', 'boxer'], ['thumper', 'quillback', 'wolfpack']].map(t => t.map(loadBot)),
    maxTime: 40, record: false });
  for (const v of r.vehicles) assert.deepEqual(v.errors, [], `${v.bot}: no controller errors`);
});
