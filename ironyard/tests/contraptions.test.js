// The physical side of the kit: knockback and recoil, fire, kegs, harpoons, pistons,
// and the crates and barrels a map can be built from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, PARTS, RULES, TILES, DIR_ANGLE, World, validateDesign, runMatch, makeNav, liveMap, hitOn } from '../engine/index.js';
import { loadBot, makeBot, readBotSource } from '../node/loader.js';

const legal = (parts) => { const v = validateDesign({ parts }); assert.equal(v.ok, true, v.errors.join('; ')); return v.design; };
// a plain four-wheeled car: 3x4 plate floor, core in the middle of the deck; `extra` pieces go on top of that
const car = (extra = []) => legal([
  ...[-1, 0, 1].flatMap((x) => [-1, 0, 1, 2].map((y) => ({ type: 'plate', x, y, z: 0 }))),
  { type: 'wheel', x: -2, y: 2, z: 0 }, { type: 'wheel', x: 2, y: 2, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 },
  { type: 'core', x: 0, y: 0, z: 1 }, { type: 'reactor', x: 0, y: -1, z: 1 }, { type: 'battery', x: -1, y: -1, z: 1 }, ...extra]);
/** Two vehicles on a map: the first at `at` looking along `heading`, the second `gap` metres dead ahead of it, facing it. */
function duel(a, b, { gap = 4, map = MAPS.proving, at = null, heading = 0 } = {}) {
  const w = new World({ map, seed: 1, entries: [{ team: 0, slot: 0, design: a }, { team: 1, slot: 0, design: b }] });
  const [p, q] = w.vehicles;
  const o = at || { x: 20, y: 9 };
  p.x = o.x; p.y = o.y; p.th = heading; q.x = o.x + gap * Math.cos(heading); q.y = o.y + gap * Math.sin(heading); q.th = heading + Math.PI;
  w.updateCells(p); w.updateCells(q);
  return { w, p, q, run: (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) w.step(); } };
}
const piece = (v, type, n = 0) => v.parts.filter((p) => p.type === type)[n];
const count = (w, kind) => w.events.filter((e) => e.k === kind).length;

test('a blast throws what it hits, a heavy gun kicks back, a collision buckles more than one piece', () => {
  const { w, p, q, run } = duel(car(), car(), { gap: 6 });
  w.explode(q.x - 1.4, q.y, 2, 46, 0.35, 0, p, 7);                 // a mortar shell landing just short of q
  assert.ok(q.vx > 1.5, `thrown away from the blast (${q.vx.toFixed(2)} m/s)`);
  assert.equal(p.vx, 0, 'the side that fired it is spared');

  const gun = duel(car([{ type: 'cannon', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 30 });
  gun.w.setCommand(gun.p, { fire: true });
  gun.run(0.1);
  assert.ok(gun.p.vx < -0.2 && Math.abs(gun.p.w) < 1e-9, `recoil pushes straight back (${gun.p.vx.toFixed(2)} m/s), without spin`);

  const ram = duel(car(), car(), { gap: 2.6 });
  ram.p.vx = 9;
  ram.run(0.3);
  const hurt = ram.q.parts.filter((x) => !x.decor && x.hp < x.maxHp).length;
  assert.ok(hurt >= 3, `the piece that was hit and those around it (${hurt})`);
  assert.ok(ram.q.stats.damageTaken > 20 && ram.p.stats.byType.ram > 20);
});

test('fire: catches at heat 1, spreads to what touches it, skips what cannot burn, burns once, and can be put out', () => {
  const armored = car([{ type: 'armor', x: 0, y: 1, z: 1 }, { type: 'brick', x: 1, y: 1, z: 1 }]);
  const { w, p, q, run } = duel(armored, car(), { gap: 12 });
  const plate = p.parts.find((x) => x.type === 'plate' && x.x === -1 && x.y === 2);
  w.warm(p, plate, 0.6, q.id);
  assert.equal(p.burning, 0, 'not yet');
  w.warm(p, plate, 0.6, q.id);
  assert.equal(p.burning, 1);
  assert.equal(w.observeAll()[q.id].enemies[0].parts.find((x) => x.i === plate.i).burning, true, 'anyone who sees it sees the fire');
  run(40);
  assert.equal(p.burning, 0, 'it burns itself out');
  const burnt = p.parts.filter((x) => x.burnt).map((x) => x.type);
  assert.ok(burnt.includes('wheel') && burnt.includes('brick') && burnt.filter((t) => t === 'plate').length === 12, 'through the whole floor and up onto the deck');
  assert.ok(!burnt.includes('armor') && !burnt.includes('core'), 'armor and the core do not burn');
  assert.ok(Math.abs(plate.maxHp - plate.hp - RULES.fireDps * RULES.fireTime) < 0.5, 'each piece loses fireDps x fireTime');
  assert.ok(q.stats.byType.fire > 300, 'and whoever lit it gets the credit');
  w.warm(p, plate, 5, q.id);
  assert.equal(p.burning, 0, 'a burnt piece does not light again');

  // a repair arm goes for the fire first; a repair pad puts everything out
  const medic = duel(car([{ type: 'repairer', x: 1, y: 0, z: 1 }]), car(), { gap: 12 });
  medic.w.warm(medic.p, piece(medic.p, 'plate'), 5, -1);
  medic.run(0.2);
  assert.equal(medic.p.burning, 0);
  const pad = MAPS.foundry.pads[0];
  const parked = duel(car(), car(), { gap: 12, map: MAPS.foundry, at: { x: pad.x, y: pad.y } });
  for (const x of parked.p.parts.filter((y) => y.type === 'plate').slice(0, 4)) parked.w.warm(parked.p, x, 5, -1);
  assert.equal(parked.p.burning, 4);
  parked.run(0.05);
  assert.equal(parked.p.burning, 0);
  // lava sets the underside alight
  const lava = duel(car(), car(), { gap: 30, map: MAPS.foundry, at: { x: 10, y: 46 } });
  assert.equal(lava.w.observeAll()[0].self.tile, 'lava');
  lava.run(1.5);
  assert.ok(lava.p.burning > 3 && lava.p.parts.filter((x) => x.fire > 0).every((x) => x.z === 0 || x.heat >= 1));
});

test('flamethrower: lights what its stream washes over, not through a wall, not through a shield', () => {
  const flamer = car([{ type: 'flamer', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'plate', x: 0, y: 2, z: 1 }]);
  const { w, p, q, run } = duel(flamer, car(), { gap: 4.2 });
  w.setCommand(p, { fire: true, aim: { x: q.x, y: q.y } });
  run(1.6);
  assert.ok(q.burning >= 3, `alight after a second and a half (${q.burning} pieces)`);
  assert.equal(p.burning, 0);
  assert.ok(p.stats.byType.fire > 5 && p.stats.hits > 1);
  assert.ok(w.frame().b.some((b) => b[4] === 3), 'the stream is in the replay');
  run(25);
  assert.ok(q.stats.piecesBurnt > 12);

  const far = duel(flamer, car(), { gap: 8.5 });
  far.w.setCommand(far.p, { fire: true, aim: { x: far.q.x, y: far.q.y } });
  far.run(2);
  assert.equal(far.q.burning, 0, 'out of reach');

  const shielded = duel(flamer, car([{ type: 'shieldgen', x: 1, y: 0, z: 1 }]), { gap: 4.2 });
  shielded.w.setCommand(shielded.p, { fire: true, aim: { x: shielded.q.x, y: shielded.q.y } });
  shielded.run(1.5);
  assert.equal(shielded.q.burning, 0);
  assert.ok(shielded.q.shield < 120, 'the shield pays for it');

  // on the proving ground a short wall runs from (26, 34) to (30, 36): one car south of it, one north
  const wall = duel(flamer, car(), { gap: 5.2, at: { x: 28, y: 32.4 }, heading: Math.PI / 2 });
  assert.equal(wall.w.blocked(wall.p.x, wall.p.y, wall.q.x, wall.q.y), true);
  wall.w.setCommand(wall.p, { fire: true, aim: { x: wall.q.x, y: wall.q.y } });
  wall.run(2);
  assert.equal(wall.q.burning, 0);
});

test('powder keg: goes off where it sits or where it was dropped, spares nobody, sets off its neighbours', () => {
  const bomber = car([{ type: 'keg', x: 0, y: 2, z: 1 }, { type: 'keg', x: 0, y: 1, z: 1 }]);
  assert.match(validateDesign({ parts: bomber.parts.concat([0, 1, 2].map((i) => ({ type: 'keg', x: -1 + i, y: -1 + (i === 1 ? 4 : 0) * 0, z: 1 }))) }).errors.join(' '), /at most 4 keg|overlaps/);

  // detonate: a blast at the keg, for the carrier as much as for the enemy beside it
  const { w, p, q, run } = duel(bomber, car(), { gap: 2.4 });
  w.setCommand(p, { detonate: [piece(p, 'keg').i] });
  run(0.05);
  assert.equal(piece(p, 'keg').alive, false);
  assert.ok(count(w, 'boom') >= 2, 'the second keg goes with the first');
  assert.ok(q.stats.damageTaken > 150 && p.stats.damageTaken > 150, `both pay (${q.stats.damageTaken.toFixed(0)}, ${p.stats.damageTaken.toFixed(0)})`);
  assert.ok(q.vx > 2 && p.vx < -2, 'and both are thrown');
  assert.ok(q.burning > 0, 'and set alight');
  assert.ok(p.stats.byType.explosive > 150, 'the damage to the enemy is the carrier’s');

  // jettison: the keg is flung the way it faces, on top of the speed the car had, rolls, then goes off; a hole swallows it
  const drop = duel(bomber, car(), { gap: 16 });
  drop.q.y += 12; drop.w.updateCells(drop.q);      // out of its way
  drop.p.vx = 6;
  drop.w.setCommand(drop.p, { jettison: [piece(drop.p, 'keg').i], throttle: -1 });
  drop.run(0.05);
  assert.equal(drop.w.bombs.length, 1);
  assert.equal(piece(drop.p, 'keg').alive, false);
  assert.equal(drop.p.stats.damageTaken, 0, 'letting go of it hurts nobody');
  const seen = drop.w.observeAll()[1].bombs;
  assert.equal(seen.length, 1, 'the other side can see it coming');
  assert.ok(seen[0].fuse > PARTS.keg.blast.fuse - 0.2 && seen[0].vx > 6 + PARTS.keg.fling - 1 && seen[0].r === PARTS.keg.blast.r, `leaves at ${seen[0].vx} m/s`);
  assert.equal(drop.w.frame().k.length, 1);
  const x0 = drop.w.bombs[0].x;
  drop.run(PARTS.keg.blast.fuse - 0.2);
  assert.equal(drop.w.bombs.length, 1, 'with nothing in its way it rolls until the fuse runs out');
  drop.run(0.3);
  assert.equal(drop.w.bombs.length, 0);
  const boom = drop.w.events.filter((e) => e.k === 'boom').pop();
  assert.ok(boom.x > x0 + 2 && boom.r === PARTS.keg.blast.r, `it went off ${(boom.x - x0).toFixed(1)} m further on`);
  assert.equal(drop.q.stats.damageTaken, 0, 'and out of reach of the car it was meant for');

  // one that faces backwards is left behind instead: a mine for whoever is following
  const mine = duel(car([{ type: 'keg', x: 0, y: 2, z: 1, dir: 'S' }]), car(), { gap: 16 });
  mine.p.vx = PARTS.keg.fling;
  mine.w.setCommand(mine.p, { jettison: [piece(mine.p, 'keg').i] });
  mine.run(0.05);
  assert.ok(Math.abs(mine.w.bombs[0].vx) < 1.5, `lies about where it was let go (${mine.w.bombs[0].vx.toFixed(1)} m/s)`);

  // let go at a car close enough to roll into, it goes off against that car — not against the one that let it go
  const roll = duel(bomber, car(), { gap: 9 });
  roll.p.vx = 9;
  roll.w.setCommand(roll.p, { jettison: [piece(roll.p, 'keg').i], throttle: -1, brake: 1 });
  roll.run(0.3);
  assert.equal(roll.w.bombs.length, 1, 'its own car does not set it off');
  roll.run(0.7);
  assert.equal(roll.w.bombs.length, 0, 'the other car does, well inside the fuse');
  assert.ok(roll.q.stats.damageTaken > 150 && roll.p.stats.byType.explosive > 150, `on contact (${roll.q.stats.damageTaken.toFixed(0)})`);
  assert.equal(roll.p.stats.kegsThrown, 1);
  assert.equal(roll.p.stats.itemsUsed, 0, 'a keg is not a held item');

  const pit = duel(bomber, car(), { gap: 30, map: MAPS.sumo, at: { x: 14, y: 19 } });
  pit.p.vx = 9;
  pit.w.setCommand(pit.p, { jettison: [piece(pit.p, 'keg').i], brake: 1 });
  pit.run(2.5);
  assert.equal(count(pit.w, 'boom'), 0, 'rolled into the hole in the middle of the deck');

  // anything that destroys a keg sets it off; so does fire
  const shot = duel(bomber, car(), { gap: 12 });
  shot.w.damage(shot.p, piece(shot.p, 'keg'), PARTS.keg.hp, 'kinetic', shot.q);
  shot.w.settle();
  assert.ok(count(shot.w, 'boom') >= 1 && shot.q.stats.damageDealt > 150);
  const lit = duel(bomber, car(), { gap: 12 });
  lit.w.warm(lit.p, piece(lit.p, 'keg'), 1, lit.q.id);
  lit.w.settle();
  assert.ok(count(lit.w, 'boom') >= 1);

  // a teammate in the way is not spared — and what the keg does to it is not to the thrower's credit
  const w2 = new World({ map: MAPS.proving, seed: 1, entries: [{ team: 0, slot: 0, design: bomber }, { team: 0, slot: 1, design: car() }, { team: 1, slot: 0, design: car() }, { team: 1, slot: 1, design: car() }] });
  const [thrower, mate, f1, f2] = w2.vehicles;
  thrower.x = 20; thrower.y = 9; thrower.th = 0; mate.x = 26; mate.y = 9; mate.th = Math.PI; f1.x = 44; f1.y = 30; f2.x = 50; f2.y = 30;
  for (const v of w2.vehicles) w2.updateCells(v);
  w2.setCommand(thrower, { jettison: [piece(thrower, 'keg').i] });
  for (let i = 0; i < 90; i++) w2.step();
  assert.ok(mate.stats.damageTaken > 150, `the teammate took ${mate.stats.damageTaken.toFixed(0)}`);
  assert.equal(thrower.stats.damageDealt, 0);
  assert.equal(thrower.stats.partsDestroyed, 0);
  assert.equal(w2.teamScore(0).dmg, 0, 'so it cannot win a timeout on damage');
});

test('harpoon: ties two vehicles together; the cable only pulls, winds in, lets go, and the heavier end wins', () => {
  const tug = legal([
    ...[-1, 0, 1].flatMap((x) => [-2, -1, 0, 1, 2].map((y) => ({ type: 'armor', x, y, z: 0 }))),
    { type: 'track', x: -2, y: -1, z: 0 }, { type: 'track', x: 2, y: -1, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'harpoon', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'reactor', x: 0, y: -1, z: 1 }, { type: 'battery', x: 1, y: -1, z: 1 }]);
  const nosed = car([{ type: 'armor', x: 0, y: 3, z: 0 }]);   // something for the hook to hold on to: a cable tears plates off
  const { w, p, q, run } = duel(tug, nosed, { gap: 8 });
  assert.ok(p.mass > q.mass * 2);
  w.setCommand(p, { fire: true, aim: { x: q.x, y: q.y } });
  run(0.5);
  assert.equal(w.tethers.length, 1, 'the hook bit');
  const t = w.tethers[0], len0 = t.len;
  assert.ok(len0 > 5 && len0 < 8);
  assert.deepEqual(w.observeAll()[q.id].tethers.map((c) => [c.from, c.to]), [[p.id, q.id]], 'the one on the hook knows');
  assert.equal(w.frame().r.length, 1);
  // the light one drives away flat out: it gets to the end of the cable and no further, and the tug is barely moved
  const px = p.x;
  w.setCommand(p, { brake: 1 });
  w.setCommand(q, { throttle: -1 });
  run(3);
  const stretch = () => Math.hypot(q.parts[t.bi].wx - p.parts[t.ai].wx, q.parts[t.bi].wy - p.parts[t.ai].wy);
  assert.ok(stretch() < len0 + 0.4, `held at ${stretch().toFixed(2)} m on a ${len0.toFixed(2)} m cable`);
  assert.ok(Math.abs(p.x - px) < 2.5, 'the heavy end stays about where it was');
  assert.equal(w.frame().r[0][5], 1, 'taut');
  // reel
  w.setCommand(p, { brake: 1, reel: 1 });
  run(1.5);
  assert.ok(t.len < len0 - 3.5 && stretch() < t.len + 0.4, `wound in to ${t.len.toFixed(2)} m, and the car came with it`);
  // one cable per harpoon while it is out, and it does not push
  w.setCommand(q, { throttle: 1 });
  w.setCommand(p, { brake: 1, fire: true, aim: { x: q.x, y: q.y } });
  run(1);
  assert.equal(w.tethers.length, 1);
  assert.equal(p.stats.hooks, 1);
  assert.ok(q.parts[t.bi].type === 'armor' && q.parts[t.bi].alive && q.parts[t.bi].hp < q.parts[t.bi].maxHp, 'the pull has worked on the piece it holds');
  // release
  w.setCommand(p, { release: true });
  run(0.1);
  assert.equal(w.tethers.length, 0);
  assert.ok(count(w, 'snap') === 1 && piece(p, 'harpoon').cd > 4, 'and the harpoon has to reload');

  // it lets go by itself when its time is up, when either end piece is lost, and when a wall comes between
  const timed = duel(tug, car(), { gap: 6 });
  timed.w.setCommand(timed.p, { fire: true, aim: { x: timed.q.x, y: timed.q.y } });
  timed.run(0.4);
  assert.equal(timed.w.tethers.length, 1);
  timed.run(PARTS.harpoon.rope.hold);
  assert.equal(timed.w.tethers.length, 0);
  const cut = duel(tug, car(), { gap: 6 });
  cut.w.setCommand(cut.p, { fire: true, aim: { x: cut.q.x, y: cut.q.y } });
  cut.run(0.4);
  cut.w.destroy(cut.q, cut.q.parts[cut.w.tethers[0].bi], cut.p, 'test');
  cut.run(0.05);
  assert.equal(cut.w.tethers.length, 0);
  // pulled tight, the cable tears the piece it bit into off the car
  const rip = duel(tug, car(), { gap: 6 });
  rip.w.setCommand(rip.p, { fire: true, aim: { x: rip.q.x, y: rip.q.y } });
  rip.run(0.4);
  const held = rip.q.parts[rip.w.tethers[0].bi];
  assert.equal(held.type, 'plate');
  rip.w.setCommand(rip.p, { brake: 1 });
  rip.w.setCommand(rip.q, { throttle: -1 });
  rip.run(0.8 + held.maxHp / PARTS.harpoon.rope.tear);
  assert.equal(held.alive, false, 'the plate came away');
  assert.ok(rip.w.events.some((e) => e.k === 'part' && e.v === rip.q.id && e.i === held.i && e.c === 'torn'));
  assert.equal(rip.p.stats.piecesTorn, 1);
  assert.equal(rip.w.tethers.length, 0, 'and the cable with it');
  // a shield turns the hook away
  const bubble = duel(tug, car([{ type: 'shieldgen', x: 1, y: 0, z: 1 }]), { gap: 6 });
  bubble.w.setCommand(bubble.p, { fire: true, aim: { x: bubble.q.x, y: bubble.q.y } });
  bubble.run(0.6);
  assert.equal(bubble.w.tethers.length, 0);
});

test('piston: punches what is in front of it, takes the same shove back, breaks crates, bats kegs away', () => {
  const boxer = car([]);
  const design = legal(boxer.parts.concat([{ type: 'plate', x: 0, y: 3, z: 0 }, { type: 'piston', x: 0, y: 4, z: 0, dir: 'N' }]));
  const { w, p, q, run } = duel(design, car(), { gap: 3.05 });
  const m1 = p.mass, m2 = q.mass;
  run(0.05);
  assert.equal(p.stats.punches, 1, 'by itself, as soon as something is in reach');
  assert.equal(count(w, 'punch'), 1);
  const J = PARTS.piston.punch.impulse;
  assert.ok(q.vx > (J / m2) * 0.8, `the target leaves at ${q.vx.toFixed(1)} m/s`);
  assert.ok(p.vx < -(J / m1) * 0.8, `and the piston's own car at ${p.vx.toFixed(1)} m/s`);
  assert.ok(q.stats.damageTaken >= PARTS.piston.punch.dmg && p.stats.byType.ram >= PARTS.piston.punch.dmg);
  run(1);
  assert.equal(p.stats.punches, 1, 'it has to reset');
  // held back on command
  const held = duel(design, car(), { gap: 3.05 });
  held.w.setCommand(held.p, { melee: false });
  held.run(0.3);
  assert.equal(held.p.stats.punches, 0);
  // a crate in front of it (the depot's southern crate wall runs along y = 44..46): two punches
  const depot = duel(design, car(), { gap: 12, map: MAPS.depot, at: { x: 17, y: 41.9 }, heading: Math.PI / 2 });
  depot.q.x = 40; depot.q.y = 36; depot.w.updateCells(depot.q);
  assert.equal(depot.w.map.tiles[22 * 32 + 8], Object.keys(TILES).indexOf('crate'));
  depot.run(0.1);
  assert.equal(depot.p.stats.punches, 1);
  assert.equal(depot.p.vy, 0, 'a crate does not push back');
  depot.run(PARTS.piston.punch.cooldown + 0.1);
  assert.equal(depot.p.stats.punches, 2);
  assert.equal(depot.w.map.tiles[22 * 32 + 8], 0, 'through');
  assert.equal(depot.p.stats.tilesBroken, 1);
  // a keg lying in front of it is sent on its way
  const bat = duel(design, car(), { gap: 30 });
  bat.w.bombs.push({ id: 99, x: bat.p.x + 2.3, y: bat.p.y, vx: 0, vy: 0, fuse: 1.5, blast: PARTS.keg.blast, owner: 1, team: 1 });
  bat.run(0.05);
  assert.ok(bat.w.bombs[0].vx > 8, 'batted away');
  assert.equal(bat.w.bombs[0].owner, bat.p.id, 'and it is the batter’s keg now: it will go off on the car it came from');
});

test('crates and barrels: a map that comes apart, and a pathfinder that notices', () => {
  const depot = MAPS.depot, CRATE = Object.keys(TILES).indexOf('crate'), BARREL = Object.keys(TILES).indexOf('barrel'), FLOOR = 0;
  assert.equal(depot.breakable, true);
  assert.equal(MAPS.proving.breakable, false);
  const { w, p, q, run } = duel(car([{ type: 'cannon', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 30, map: depot, at: { x: 5, y: 51 } });
  assert.notEqual(w.map, depot, 'a match plays on its own copy');
  const at = (tx, ty) => w.map.tiles[ty * depot.w + tx];
  assert.equal(at(4, 22), CRATE);
  // shots stop at a crate and wear it down; five shells and it is floor
  p.x = 9; p.y = 40; p.th = Math.PI / 2; w.updateCells(p);
  w.setCommand(p, { fire: true });
  run(1.4 * 4 + 0.3);
  assert.equal(p.stats.shots, 5);
  assert.equal(p.stats.hits, 0);
  assert.equal(at(4, 22), FLOOR);
  assert.equal(depot.tiles[22 * depot.w + 4], CRATE, 'the map itself is untouched');
  assert.deepEqual(w.events.filter((e) => e.k === 'tile').map((e) => [e.tx, e.ty, e.was])[0], [4, 22, 'crate']);
  assert.ok(p.stats.tilesBroken >= 1);

  // a barrel: one knock and everything near it goes, the next barrel a moment later.
  // Two of them stand corner to corner in the middle of the yard, at (31, 29) and (33, 27).
  const b = duel(car(), car(), { gap: 12, map: depot, at: { x: 31, y: 32.2 } });
  assert.equal(b.w.map.tiles[14 * depot.w + 15], BARREL);
  assert.equal(b.w.map.tiles[13 * depot.w + 16], BARREL);
  assert.deepEqual(b.w.observeAll()[0].barrels.slice(0, 3), [{ x: 31, y: 29 }, { x: 27, y: 29 }, { x: 33, y: 27 }], 'a controller is told where the barrels in range are, nearest first');
  b.w.damageTile(15, 14, 50, b.q);
  b.run(0.05);
  assert.equal(b.w.map.tiles[14 * depot.w + 15], FLOOR);
  assert.equal(count(b.w, 'boom'), 0, 'not yet: it goes off a tenth of a second after it breaks');
  b.run(0.5);
  assert.ok(count(b.w, 'boom') >= 2, `a chain (${count(b.w, 'boom')} blasts)`);
  assert.equal(b.w.map.tiles[13 * depot.w + 16], FLOOR);
  assert.ok(b.p.stats.damageTaken > 60 && b.p.stats.piecesBurnt > 0, 'the car beside it was caught in it and set alight');
  assert.ok(Math.hypot(b.p.vx, b.p.vy) > 0.5 || b.p.y > 32.4, 'and thrown');
  assert.ok(b.q.stats.byType.explosive > 60, 'whoever touched it off gets the credit');
  assert.equal(b.w.observeAll()[b.p.alive ? 0 : 1].barrels.some((x) => x.x === 31 && x.y === 29), false);

  // driving into a barrel at speed sets it off
  const bump = duel(car(), car(), { gap: 12, map: depot, at: { x: 13, y: 39 }, heading: Math.PI / 2 });
  bump.q.x = 40; bump.q.y = 36; bump.w.updateCells(bump.q);
  bump.p.vy = 7;
  bump.run(0.6);
  assert.ok(count(bump.w, 'boom') >= 1 && bump.p.stats.damageTaken > 50);

  // the pathfinder: no way through a crate wall, until the wall has a hole in it
  const live = liveMap(depot), nav = makeNav(live);
  assert.equal(nav.clear(29, 48, 29, 44.5, { margin: 0.8 }), false);
  assert.equal(nav.los(29, 48, 29, 44.5), false);
  assert.equal(nav.tileAt(29, 45), 'crate');
  const before = nav.clearance(29, 48).wall;
  for (const tx of [13, 14, 15]) { live.tiles[22 * live.w + tx] = 0; nav.refresh(tx, 22); }
  assert.equal(nav.clear(29, 48, 29, 44.5, { margin: 0.8 }), true);
  assert.equal(nav.los(29, 48, 29, 44.5), true);
  assert.equal(nav.tileAt(29, 45), 'floor');
  assert.ok(nav.clearance(29, 48).wall > before + 1, 'the clearance around the hole is redone');

  // and a whole match on it runs, with things breaking
  const res = runMatch({ map: 'depot', mode: '2v2', teams: [[loadBot('thumper')], [loadBot('bulldozer')]], seed: 3 });
  assert.deepEqual(res.vehicles.flatMap((v) => v.errors), []);
  assert.ok(res.events.some((e) => e.k === 'tile'), 'something got broken');
  assert.equal(JSON.stringify(res.events), JSON.stringify(runMatch({ map: 'depot', mode: '2v2', teams: [[loadBot('thumper')], [loadBot('bulldozer')]], seed: 3 }).events), 'and it is the same match every time');
});

test('the new commands reach the engine from a controller', () => {
  const src = readBotSource('rookie').replace('function tick(state, api) {',
    `function tick(state, api) { if (state.t > 0.5) return { detonate: true, jettison: [0, 1.5, 'x', 2], reel: 0.5, release: true, throttle: 1 };`);
  const res = runMatch({ map: 'proving', mode: '1v1', teams: [[makeBot('cmds', src)], [loadBot('rookie')]], seed: 1, maxTime: 1 });
  const v = res.vehicles[0];
  assert.deepEqual(v.errors, []);
  const gone = res.events.filter((e) => e.k === 'part' && e.v === 0 && e.c === 'jettisoned').map((e) => e.i).sort();
  assert.deepEqual(gone, [0, 2], 'pieces 0 and 2 were let go of; the nonsense entries were ignored');
});

test('armor and slopes: the engine and the published arithmetic give the same answer', () => {
  // hitOn (parts.js) is what the design analysis and the rulebook's table use; World.damage is what a match does
  const armored = car([{ type: 'armor', x: 0, y: 3, z: 0 }, { type: 'slope', x: 1, y: 3, z: 0, dir: 'N' }]);
  for (const dmg of [4, 30, 64]) for (const dtype of ['kinetic', 'explosive', 'energy']) {
    const { w, p, q } = duel(car(), armored, { gap: 6 });
    const plate = piece(q, 'plate'), armor = piece(q, 'armor'), slope = piece(q, 'slope');
    const face = q.th + DIR_ANGLE[slope.dir];          // the way the slope looks; a shot going the other way strikes its face
    // each hit takes what the arithmetic says, or whatever the piece still had
    const hit = (part, ang, faced, what) => {
      const before = part.hp, want = Math.min(before, hitOn(part.def, dmg, dtype, faced));
      w.damage(q, part, dmg, dtype, p, ang);
      assert.ok(Math.abs((before - Math.max(0, part.hp)) - want) < 1e-9, `${dmg} ${dtype} ${what}: took ${before - part.hp}, the arithmetic says ${want}`);
    };
    hit(plate, face + Math.PI, true, 'on a plate');
    hit(armor, face + Math.PI, true, 'on armor');
    hit(slope, face + Math.PI, true, 'on a slope, face on');
    hit(slope, face, false, 'on a slope, from behind');
    hit(slope, undefined, false, 'on a slope with no direction (a blast)');
  }
  assert.equal(hitOn(PARTS.armor, 4), 2); assert.equal(hitOn(PARTS.armor, 1), 0.25); assert.equal(hitOn(PARTS.armor, 22, 'energy'), 22);
});

test('a design is made of our parts and our four facings, whatever else its JSON may hold', () => {
  const base = car().parts;
  // an array that reads like a name, and names every object has, are not parts or facings
  for (const type of [['core'], ['plate'], 'constructor', 'toString', '__proto__', 7, null, { toString: () => 'plate' }]) {
    const v = validateDesign({ parts: base.concat([{ type, x: 0, y: 3, z: 0 }]) });
    assert.equal(v.ok, false, `type ${JSON.stringify(type)}`);
    assert.match(v.errors.join(' '), /unknown part type/);
  }
  for (const dir of [['E'], 'toString', 'valueOf', 'constructor', 3, {}]) {
    const v = validateDesign({ parts: base.concat([{ type: 'thruster', x: 0, y: -2, z: 0, dir }]) });
    assert.equal(v.ok, false, `dir ${JSON.stringify(dir)}`);
    assert.match(v.errors.join(' '), /dir must be one of N, E, S, W/);
  }
  // and a bot that hands such a design over is refused before the match, by name, not allowed to break it for both sides
  const evil = makeBot('evil', `const meta = { name: 'Evil' }; const design = { parts: ${JSON.stringify(base)}.map((p) => (p.type === 'core' ? { ...p, type: ['core'] } : p)) }; function tick() { return {}; }`);
  assert.throws(() => runMatch({ map: 'proving', teams: [[evil], [loadBot('rookie')]], record: false }), /bot "evil".*invalid design/);
});

test('a repair kit puts every fire on the vehicle out', () => {
  const { w, p, q, run } = duel(car(), car(), { gap: 20 });
  for (const part of p.parts.filter((x) => x.type === 'plate').slice(0, 3)) w.warm(p, part, 2, q.id);
  run(0.2);
  assert.ok(p.burning >= 3);
  w.pickup(p, { ...w.itemSpawns[0], type: 'repair', present: true });
  assert.equal(p.burning, 0);
  run(1);
  assert.equal(p.burning, 0, 'and nothing smoulders on');
});

test('flamethrower: a piece of several studs is washed once a tick, not once per stud', () => {
  const flamer = car([{ type: 'flamer', x: 0, y: 1, z: 1, dir: 'N' }]);
  // the same nose, once as four 1x1 plates and once as one 2x2 plate
  const nose = (parts) => legal([
    ...[-1, 0, 1].flatMap((x) => [-1, 0, 1, 2].map((y) => ({ type: 'armor', x, y, z: 0 }))), ...parts,
    { type: 'wheel', x: -2, y: 2, z: 0 }, { type: 'wheel', x: 2, y: 2, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }]);
  const lost = (design, type) => {
    const { w, p, q, run } = duel(flamer, design, { gap: 5 });
    w.setCommand(p, { fire: true, aim: { x: q.x, y: q.y } });
    run(0.5);
    const hit = q.parts.filter((x) => x.type === type);
    return Math.max(...hit.map((x) => x.maxHp - x.hp));
  };
  const small = lost(nose([{ type: 'plate', x: 0, y: 3, z: 0 }, { type: 'plate', x: -1, y: 3, z: 0 }, { type: 'plate', x: 0, y: 4, z: 0 }, { type: 'plate', x: -1, y: 4, z: 0 }]), 'plate');
  const big = lost(nose([{ type: 'plate4', x: -1, y: 3, z: 0 }]), 'plate4');
  assert.ok(small > 0.5 && big > 0.5, `both are burnt (${small.toFixed(2)}, ${big.toFixed(2)})`);
  assert.ok(big < small * 1.3, `the 2x2 plate loses about what one 1x1 plate does (${big.toFixed(2)} against ${small.toFixed(2)}), not four times it`);
});

test('nobody ends a tick inside a wall, however hard they are thrown at it', () => {
  // proving has a pillar two tiles thick at x 14..18, y 38..42: straight at its seam, fast enough to be past the face in one tick
  let inside = 0;
  for (let k = 0; k < 40; k++) {
    const { w, p, q } = duel(car(), car(), { gap: 30, at: { x: 13.0 + (k % 8) * 0.03, y: 39.7 + Math.floor(k / 8) * 0.12 } });
    q.x = 50; q.y = 10; w.updateCells(q);
    p.vx = 40;
    for (let i = 0; i < 120; i++) {
      w.step();
      const tx = Math.floor(p.x / 2), ty = Math.floor(p.y / 2);
      if (w.map.tiles[ty * w.map.w + tx] === Object.keys(TILES).indexOf('wall')) inside++;
    }
  }
  assert.equal(inside, 0);
});
