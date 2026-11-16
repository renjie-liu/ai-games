// Design analysis: small hand-built vehicles with known answers, then every built-in bot's real vehicle,
// whose core cover is checked against what the engine itself does to a vehicle shot along that lane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, PARTS, CELL, GRID_HX, GRID_HY, World, validateDesign, analyzeDesign, runMatch, ANALYSIS_RANGES } from '../engine/index.js';
import { listBots, loadBot } from '../node/loader.js';

const P = (type, x, y, z = 0, dir) => ({ type, x, y, z, ...(dir ? { dir } : {}) });
/** Validate, insist it is legal, analyse. */
function check(parts) {
  const v = validateDesign({ name: 'test', parts });
  assert.ok(v.ok, v.errors.join('; '));
  return analyzeDesign(v);
}

test('core cover: what a straight shot must destroy first, deck piece of a column before its chassis piece', () => {
  // everything on the chassis: two armor bricks ahead of the core, a wheel either side, nothing behind
  const a = check([P('core', 0, 0), P('armor', 0, 1), P('armor', 0, 2), P('wheel', -1, 0), P('wheel', 1, 0)]);
  assert.deepEqual(a.coreProtection.front, { hp: 400, hpVsBullet: 800, hpVsShell: 429, pieces: 2, first: 'armor' }, 'armor 2: a 4-damage bullet does 2, a 30-damage shell 28');
  assert.deepEqual(a.coreProtection.rear, { hp: 0, hpVsBullet: 0, hpVsShell: 0, pieces: 0, first: 'core' });
  assert.deepEqual(a.coreProtection.left, { hp: 70, hpVsBullet: 70, hpVsShell: 70, pieces: 1, first: 'wheel' });
  assert.deepEqual(a.coreProtection.right, a.coreProtection.left);
  assert.match(a.insights[0], /Core is the first piece hit from the rear/, 'the open side is the first thing said');
  assert.deepEqual(a.exposed, { front: ['wheel x2'], rear: ['wheel x2'], left: ['wheel'], right: ['wheel'] }, 'each wheel is the first piece on its own lane');
  assert.deepEqual(check([P('core', 0, 0), P('armor', -1, 0), P('armor', 1, 0), P('armor', 0, 1), P('armor', 0, -1)]).exposed, {}, 'sides with nothing vital in front are left out');

  // two layers: the lane ahead of a deck core holds a plate, then a slope on a plate
  const b = check([P('plate', 0, 0), P('plate', 0, 1), P('plate', 0, 2), P('wheel', -1, 0), P('wheel', 1, 0), P('core', 0, 0, 1), P('slope', 0, 1, 1, 'N')]);
  // plate 45 + slope 150 (its face lets 45% through, then armor 1: 0.8 of a bullet, 12.5 of a shell) + the plate under it 45
  assert.deepEqual(b.coreProtection.front, { hp: 240, hpVsBullet: 45 + 750 + 45, hpVsShell: 45 + 360 + 45, pieces: 3, first: 'plate' });
  assert.equal(b.coreProtection.rear.pieces, 0, 'a deck core is hit before the plate it stands on');
  // the same slope turned sideways deflects nothing from the front
  const c = check([P('plate', 0, 0), P('plate', 0, 1), P('plate', 0, 2), P('wheel', -1, 0), P('wheel', 1, 0), P('core', 0, 0, 1), P('slope', 0, 1, 1, 'E')]);
  assert.equal(c.coreProtection.front.hpVsShell, 45 + Math.round((150 * 30) / 29) + 45);

  // a piece that hangs on the piece in front of it falls off with it: one piece to destroy, not two
  const d = check([P('core', 0, 0), P('plate', 1, 0), P('plate', 2, 0), P('plate', 2, 1), P('plate', 2, 2), P('plate', 2, 3), P('plate', 1, 3), P('plate', 0, 3), P('plate', 0, 2), P('wheel', -1, 0), P('wheel', 3, 0)]);
  assert.deepEqual(d.coreProtection.front, { hp: 45, hpVsBullet: 45, hpVsShell: 45, pieces: 1, first: 'plate' });
});

test('guns: bearings covered, blind arcs, dps by range ahead and astern', () => {
  const hull = [P('plate', 0, -1), P('plate', 0, 0), P('plate', 0, 1), P('wheel', -1, 0), P('wheel', 1, 0), P('core', 0, 0, 1)];
  const fwd = check([...hull, P('mg', 0, 1, 1, 'N')]);
  assert.deepEqual(fwd.weapons, [{ i: 6, type: 'mg', facing: 'N', arcDeg: 50, range: 13, dps: 32, coversBearingsDeg: [310, 50] }]);
  assert.deepEqual(fwd.blindArcsDeg, [[50, 310]], 'a forward gun leaves everything behind 50° either side uncovered');
  assert.deepEqual(fwd.dpsByRange, { 2: 32, 6: 32, 10: 32, 14: 0, 18: 0, 22: 0 });
  assert.deepEqual(Object.keys(fwd.dpsByRange).map(Number), ANALYSIS_RANGES);
  assert.ok(Object.values(fwd.dpsByRangeRear).every((x) => x === 0));
  assert.ok(fwd.insights.some((s) => /nothing covers bearings 50°–310°/.test(s)), fwd.insights.join(' | '));

  const both = check([...hull, P('mg', 0, 1, 1, 'N'), P('mg', 0, -1, 1, 'S')]);
  assert.deepEqual(both.blindArcsDeg, [[50, 130], [230, 310]]);
  assert.deepEqual(both.dpsByRangeRear, { 2: 32, 6: 32, 10: 32, 14: 0, 18: 0, 22: 0 });

  const side = check([...hull, P('cannon', 0, 1, 1, 'E')]);   // 1x2 laid across: studs (0,1) and (1,1); only (0,1) has a plate under it
  assert.deepEqual(side.weapons[0].coversBearingsDeg, [70, 110]);
  assert.deepEqual(side.blindArcsDeg, [[110, 70]]);
  assert.ok(Object.values(side.dpsByRange).every((x) => x === 0), 'a broadside gun cannot bear on a target dead ahead');

  // a mortar reaches every bearing, but nothing closer than 6 m
  const lob = check([P('plate4', 0, 0), P('plate', 0, -1), P('wheel', -1, 0), P('wheel', 2, 0), P('core', 0, -1, 1), P('mortar', 0, 0, 1, 'N')]);
  assert.deepEqual(lob.blindArcsDeg, []);
  assert.equal(lob.weapons[0].minRange, 6);
  assert.deepEqual(lob.dpsByRange, { 2: 0, 6: 10, 10: 10, 14: 10, 18: 10, 22: 10 });
  assert.ok(lob.insights.some((s) => /No gun bears on a target 2 m dead ahead/.test(s)), lob.insights.join(' | '));

  // no gun at all: every bearing is blind, and the contact weapons are named
  const ram = check([P('core', 0, 0), P('spike', 0, 1, 0, 'N'), P('wheel', -1, 0), P('wheel', 1, 0)]);
  assert.deepEqual(ram.weapons, []); assert.deepEqual(ram.blindArcsDeg, [[0, 360]]); assert.deepEqual(ram.otherWeapons, ['spike N']);
});

test('energy: how long everything can fire before the store is empty', () => {
  const hull = [P('plate', 0, 0), P('plate', 0, 1), P('plate', 0, -1), P('wheel', -1, 0), P('wheel', 1, 0), P('core', 0, 0, 1), P('laser', 0, 1, 1, 'N')];
  const lean = check(hull);   // core: 100 stored, +5/s; one laser: 11/s
  assert.deepEqual(lean.energy, { regen: 5, drainAllFiring: 11, capacity: 100, secondsOfFullFire: 17 }, '100 / (11 - 5) = 16.7 s');
  assert.ok(lean.insights.some((s) => /draws 11 energy\/s against 5\/s regen: the 100 store is empty in 17 s, then only 45% of it can run/.test(s)), lean.insights.join(' | '));
  const stored = check([...hull, P('battery', 0, -1, 1)]);   // +140 stored
  assert.equal(stored.energy.secondsOfFullFire, 40, '240 / 6');
  const fed = check([...hull, P('reactor', 0, -1, 1)]);      // +8/s: regen 13 covers the 11
  assert.equal(fed.energy.secondsOfFullFire, null);
  assert.match(fed.energy.note, /never runs dry/);
  assert.ok(!fed.insights.some((s) => /store is empty/.test(s)));
});

test('fire: the largest cluster of touching pieces that burn, what it reaches, and what cuts it off', () => {
  // a spine of three plates from the core to a reactor on the nose, on fireproof tracks
  const spine = (third) => [P('core', 0, 0), P('plate', 0, 1), P('plate', 0, 2), P(third, 0, 3), P('reactor', 0, 4), P('track', -1, 0), P('track', 1, 0)];
  const open = check(spine('plate'));
  assert.deepEqual(open.fire, { burnableShare: 0.57, largestBurnableCluster: 4, clusterReaches: ['reactor'], firebreakBetweenFrontAndCore: false });
  const cut = check(spine('armor'));   // armor does not burn: the reactor is alone on its side of it
  assert.deepEqual(cut.fire, { burnableShare: 0.43, largestBurnableCluster: 2, clusterReaches: [], firebreakBetweenFrontAndCore: true });
  // stacking counts as touching: a deck plate joins the chassis plates under it into one cluster with the keg beside it
  const stacked = check([P('core', 0, 0), P('plate', 0, 1), P('armor', 0, 2), P('plate', 0, 3), P('plate2', 0, 1, 1), P('keg', 0, 3, 1, 'N'), P('wheel', -1, 0), P('wheel', 1, 0)]);
  assert.equal(stacked.fire.largestBurnableCluster, 2 + 2, 'two chassis plates, the deck plate bridging the armor, and the keg on the nose');
  assert.deepEqual(stacked.fire.clusterReaches, ['keg']);
  assert.deepEqual(stacked.exposed.front, ['keg', 'wheel x2']);
  assert.ok(stacked.insights.some((s) => /A keg is the first piece hit from the front/.test(s)), stacked.insights.join(' | '));
});

test('mass, and the smallest legal vehicle', () => {
  const tiny = check([P('plate', 0, 0), P('core', 0, 0, 1)]);
  assert.deepEqual(tiny.mass, { total: 23, frontShare: 0.5 });
  assert.deepEqual(tiny.weapons, []);
  assert.ok(Array.isArray(tiny.insights));
  const nose = check([P('core', 0, 0), P('armor', 0, 1), P('armor', 0, 2), P('wheel', -1, 0), P('wheel', 1, 0)]);   // 32 kg on row 0, 13 on the middle row, 13 ahead of it
  assert.deepEqual(nose.mass, { total: 58, frontShare: Math.round(((13 + 13 / 2) / 58) * 100) / 100 });
  assert.throws(() => analyzeDesign(validateDesign({ parts: [] })), /needs a validated design/);
});

// What the engine does to a vehicle shot along one lane of studs: World.partAt picks the piece, and a piece
// that is gone takes whatever it alone was holding with it (World.settle). Nothing here is the analysis' own code.
function engineCover(design, side) {
  const w = new World({ map: MAPS.proving, seed: 1, entries: [{ team: 0, slot: 0, design }, { team: 1, slot: 0, design }] });
  const v = w.vehicles[0], core = v.core;
  const cells = [];
  if (side === 'front') for (let y = GRID_HY; y >= -GRID_HY; y--) cells.push([core.x, y]);
  if (side === 'rear') for (let y = -GRID_HY; y <= GRID_HY; y++) cells.push([core.x, y]);
  if (side === 'right') for (let x = GRID_HX; x >= -GRID_HX; x--) cells.push([x, core.y]);
  if (side === 'left') for (let x = -GRID_HX; x <= GRID_HX; x++) cells.push([x, core.y]);
  const world = ([bx, by]) => { const u = by * CELL - v.comU, l = -bx * CELL - v.comV; return [v.x + v.fx * u - v.fy * l, v.y + v.fy * u + v.fx * l]; };
  let pieces = 0, hp = 0, first = 'core';
  for (let guard = 0; guard < 200; guard++) {
    let hit = null;
    for (const c of cells) { hit = w.partAt(v, ...world(c)); if (hit) break; }
    if (!hit || hit === core) break;
    if (!pieces) first = hit.type;
    pieces++; hp += hit.maxHp;
    w.destroy(v, hit, null, 'jettisoned');   // gone without its own blast, as the analysis counts it
    w.settle();
  }
  return { pieces, hp, first };
}

test('every built-in bot: the analysis is small, and its core cover is what the engine does along that lane', () => {
  const bots = listBots().filter((b) => b.kind === 'builtin');
  assert.ok(bots.length >= 13);
  for (const { id } of bots) {
    const v = runMatch({ map: 'proving', mode: '1v1', teams: [[loadBot(id)], [loadBot(id)]], seed: 1, maxTime: 0, record: false }).vehicles[0];
    const a = analyzeDesign({ design: v.design, stats: v.designStats });
    const bytes = JSON.stringify(a).length;
    assert.ok(bytes < 3000, `${id}: ${bytes} bytes of analysis`);
    assert.ok(a.insights.length <= 6 && a.insights.every((s) => typeof s === 'string' && s.length < 240), `${id}: insights`);
    assert.equal(a.energy.capacity, v.designStats.energyCap);
    assert.equal(a.mass.total, v.designStats.mass);
    assert.ok(a.mass.frontShare > 0 && a.mass.frontShare < 1 && Math.abs(a.fire.burnableShare + v.designStats.fireproof - 1) < 0.011, `${id}: shares`);
    assert.deepEqual(a.weapons.map((g) => v.design.parts[g.i].type), a.weapons.map((g) => g.type), `${id}: weapon indexes are piece indexes`);
    if (v.design.parts.some((p) => PARTS[p.type].blast)) continue;   // a keg that falls off goes off: the engine check below would not be a clean one
    for (const side of ['front', 'rear', 'left', 'right']) {
      const { pieces, hp, first } = a.coreProtection[side];
      assert.deepEqual({ pieces, hp, first }, engineCover(v.design, side), `${id} from the ${side}`);
    }
  }
});

test('damage that gets through a piece is what the engine deals', () => {
  const design = validateDesign({ parts: [P('plate', 0, 0), P('plate', 0, 1), P('plate', 0, 2), P('wheel', -1, 0), P('wheel', 1, 0), P('core', 0, 0, 1), P('slope', 0, 1, 1, 'N'), P('armor', 0, 2, 1)] }).design;
  const a = analyzeDesign(design);   // a bare design will do: its stats are worked out
  const w = new World({ map: MAPS.proving, seed: 1, entries: [{ team: 0, slot: 0, design }, { team: 1, slot: 0, design }] });
  const v = w.vehicles[0], foe = w.vehicles[1];
  let bullet = 0, shell = 0;
  for (const p of v.parts.filter((q) => q.x === 0 && q.y > 0)) {   // armor, plate, slope, plate: everything ahead of the core
    const b = w.damage(v, p, 4, 'kinetic', foe, v.th + Math.PI); bullet += (p.maxHp * 4) / b;   // travelling rearward: arriving from the front
    p.hp = p.maxHp;
    const s = w.damage(v, p, 30, 'kinetic', foe, v.th + Math.PI); shell += (p.maxHp * 30) / s;
  }
  assert.equal(a.coreProtection.front.pieces, 4);
  assert.equal(a.coreProtection.front.hpVsBullet, Math.round(bullet));
  assert.equal(a.coreProtection.front.hpVsShell, Math.round(shell));
});

test('a harpoon is not a gun: it adds no bearings, no dps and no reach', () => {
  const base = [P('plate', 0, 0), P('plate', 0, 1), P('plate', 0, 2), P('plate', 0, -1), P('wheel', -1, 0), P('wheel', 1, 0), P('wheel', -1, 2), P('wheel', 1, 2), P('core', 0, 0, 1), P('reactor', 0, -1, 1)];
  const hookOnly = analyzeDesign(validateDesign({ parts: base.concat([P('harpoon', 0, 1, 1, 'N')]) }));
  assert.equal(hookOnly.weapons.length, 0);
  assert.ok(Object.values(hookOnly.dpsByRange).every((x) => x === 0));
  assert.ok(hookOnly.otherWeapons.some((x) => /^harpoon/.test(x)), JSON.stringify(hookOnly.otherWeapons));
  assert.ok(hookOnly.insights.some((x) => /no gun/i.test(x)), hookOnly.insights.join(' | '));
});
