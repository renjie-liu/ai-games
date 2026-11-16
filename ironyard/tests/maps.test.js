// The arenas: every one is playable ground joined up, and the two tiles that are neither floor nor
// hazard — smoke and speed strips — do what the rulebook says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAP_IDS, PARTS, TILES, TILE, TILE_NAME, World, validateDesign, makeNav, runMatch } from '../engine/index.js';
import { loadBot } from '../node/loader.js';

const legal = (parts) => { const v = validateDesign({ parts }); assert.equal(v.ok, true, v.errors.join('; ')); return v.design; };
const car = (extra = []) => legal([
  ...[-1, 0, 1].flatMap((x) => [-1, 0, 1, 2].map((y) => ({ type: 'plate', x, y, z: 0 }))),
  { type: 'wheel', x: -2, y: 2, z: 0 }, { type: 'wheel', x: 2, y: 2, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 },
  { type: 'core', x: 0, y: 0, z: 1 }, { type: 'reactor', x: 0, y: -1, z: 1 }, { type: 'battery', x: -1, y: -1, z: 1 }, ...extra]);
const world = (map, a = car(), b = car()) => { const w = new World({ map, seed: 1, entries: [{ team: 0, slot: 0, design: a }, { team: 1, slot: 0, design: b }] }); return { w, p: w.vehicles[0], q: w.vehicles[1], run: (s) => { for (let i = 0; i < Math.round(s * 60); i++) w.step(); } }; };
const put = (w, v, x, y, th = 0) => { v.x = x; v.y = y; v.th = th; v.vx = 0; v.vy = 0; w.updateCells(v); };
/** Centre of the first tile of a kind on a map, scanning from the south-west. */
const tileOf = (map, kind, n = 0) => { for (let i = 0, k = 0; i < map.tiles.length; i++) if (TILE_NAME[map.tiles[i]] === kind && k++ === n) return { x: ((i % map.w) + 0.5) * TILE, y: (Math.floor(i / map.w) + 0.5) * TILE }; return null; };

test('every map: spawns, item spots and repair pads are joined by ground a wheeled car can drive without breaking anything', () => {
  assert.ok(MAP_IDS.length >= 14);
  for (const id of MAP_IDS) {
    const m = MAPS[id];
    const open = (tx, ty) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !['wall', 'barrier', 'pit', 'lava', 'crate', 'barrel'].includes(TILE_NAME[m.tiles[ty * m.w + tx]]);
    const tOf = (p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
    const seen = new Set([tOf(m.spawns[0][0]).join()]), todo = [tOf(m.spawns[0][0])];
    while (todo.length) { const [x, y] = todo.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = [x + dx, y + dy]; if (open(...k) && !seen.has(k.join())) { seen.add(k.join()); todo.push(k); } } }
    for (const p of [...m.spawns.flat(), ...m.itemSpawns, ...m.pads]) assert.ok(seen.has(tOf(p).join()), `${id}: (${p.x}, ${p.y}) is cut off from the first spawn`);
    // the pathfinder agrees, for an ordinary hull, and nobody starts against a wall or beside a hole
    const nav = makeNav(m), a = m.spawns[0][0], b = m.spawns[1][0];
    assert.ok(nav.path(a.x, a.y, b.x, b.y, { margin: 1.8 }).length > 0, `${id}: no route between the centre spawns`);
    for (const s of m.spawns.flat()) { const c = nav.clearance(s.x, s.y); assert.ok(c.wall > 1.9 && c.pit > 2.5, `${id}: a spawn with ${c.wall} m to a wall and ${c.pit} m to a hole`); }
    // point symmetry: what one side has, the other has
    for (let i = 0; i < m.tiles.length; i++) assert.equal(m.tiles[i], m.tiles[m.tiles.length - 1 - i], `${id}: tile ${i} has no twin`);
  }
});

test('smoke: a car in it is seen only from close by, until it fires; a missile cannot lock on it', () => {
  const map = MAPS.fogbank, sight = TILES.smoke.sight;
  const armed = car([{ type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }]);
  const { w, p, q, run } = world(map, car(), armed);
  // a smoke tile in the middle of the eastern bank, with open ground 16 m to the west of it
  let s = null;
  for (let n = 0; n < 400 && !s; n++) { const t = tileOf(map, 'smoke', n); if (!t) break; if (t.x > 46 && t.x < 52) s = t; }
  assert.ok(s, 'the map has a smoke bank in the east');
  put(w, q, s.x, s.y, Math.PI);                            // facing west, where the other car will be
  assert.equal(w.observeAll()[q.id].self.tile, 'smoke');
  put(w, p, s.x - 15, s.y);                                // well inside sensor range (22 m), outside the smoke
  assert.notEqual(TILE_NAME[map.tiles[Math.floor(p.y / TILE) * map.w + Math.floor(p.x / TILE)]], 'smoke');
  assert.equal(w.visibleTo(0, q), false, '15 m away: hidden');
  assert.equal(w.observeAll()[p.id].enemies.length, 0);
  assert.equal(w.visibleTo(1, p), true, 'the car outside the smoke is seen as ever');
  put(w, p, s.x - (sight + q.radius - 0.5), s.y);
  assert.equal(w.visibleTo(0, q), true, `inside ${sight} m: seen`);
  // firing gives it away for a moment, wherever the watcher is
  put(w, p, s.x - 15, s.y);
  w.setCommand(q, { fire: true, aim: { x: p.x, y: p.y } });
  run(0.2);
  assert.equal(w.visibleTo(0, q), true, 'a muzzle flash shows through smoke');
  w.setCommand(q, {});
  run(w.rules.revealTime + 0.3);
  assert.equal(w.visibleTo(0, q), false, 'and then it is gone again');

  // a missile fired at a car it cannot see has no lock, and one in flight stops turning when its target goes into smoke
  const pod = car([{ type: 'missile', x: 0, y: 1, z: 1, dir: 'N' }]);
  const m2 = world(MAPS.proving, pod, car());
  put(m2.w, m2.p, 12, 8, 0); put(m2.w, m2.q, 30, 8, Math.PI);
  m2.w.setCommand(m2.p, { fire: true, aim: 0, target: m2.q.id });
  m2.run(0.1);
  m2.w.setCommand(m2.p, {});
  const missiles = () => m2.w.projectiles.filter((x) => x.k === 'missile');
  assert.equal(missiles().length, PARTS.missile.salvo); assert.ok(missiles().every((x) => x.target === m2.q.id), 'locked on what it can see');
  const hidden = world(map, pod, car());
  put(hidden.w, hidden.q, s.x, s.y, Math.PI); put(hidden.w, hidden.p, s.x - 16, s.y, 0);
  hidden.w.setCommand(hidden.p, { fire: true, aim: 0, target: hidden.q.id });
  hidden.run(0.1);
  const blind = hidden.w.projectiles.filter((x) => x.k === 'missile');
  assert.equal(blind.length, PARTS.missile.salvo); assert.ok(blind.every((x) => x.target === -1), 'no lock on a car in smoke');
});

test('speed strip: the same car, the same throttle, half as much push again', () => {
  const map = MAPS.saltflat, strip = tileOf(map, 'turbo', 4);
  // a car with nothing off its centreline, so that it runs straight up the strip
  const straight = legal([...[-1, 0, 1].flatMap((x) => [-1, 0, 1, 2].map((y) => ({ type: 'plate', x, y, z: 0 }))),
    { type: 'wheel', x: -2, y: 2, z: 0 }, { type: 'wheel', x: 2, y: 2, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 }, { type: 'core', x: 0, y: 0, z: 1 }]);
  const drive = (x, y) => { const { w, p, run } = world(map, straight, straight); put(w, p, x, y, Math.PI / 2); w.setCommand(p, { throttle: 1 }); run(1.2); return { v: Math.hypot(p.vx, p.vy), tile: w.observeAll()[p.id].self.tile }; };
  const on = drive(strip.x, strip.y), off = drive(strip.x + 10, strip.y);
  assert.equal(on.tile, 'turbo'); assert.equal(off.tile, 'floor');
  assert.ok(on.v > off.v * 1.2, `${on.v.toFixed(2)} m/s on the strip against ${off.v.toFixed(2)} off it`);
  assert.equal(TILES.turbo.drive, 1.5);
});

test('the new arenas play: a match on each ends with a winner or a draw and no controller errors', () => {
  for (const id of ['cage', 'saltflat', 'causeway', 'labyrinth', 'fogbank', 'ringroad']) {
    const r = runMatch({ map: id, mode: '2v2', seed: 3, teams: [[loadBot('rookie'), loadBot('bastion')], [loadBot('pyro'), loadBot('longshot')]], record: false });
    assert.ok([-1, 0, 1].includes(r.winner), `${id}: ${r.reason}`);
    assert.deepEqual(r.vehicles.flatMap((v) => v.errors), [], `${id}: controller errors`);
  }
});

test('last seen: a note the team can see is wrong is dropped, and comes back when the enemy is seen again', () => {
  const { w, p, q, run } = world(MAPS.saltflat);
  put(w, p, 10, 10); put(w, q, 70, 54);                    // far beyond each other's sensors
  run(0.1);
  const seenBy = (v) => w.observeAll()[v.id].lastSeen;
  const note = seenBy(p)[0];
  assert.deepEqual([note.id, note.alive], [q.id, true], 'at the start the note is where the enemy began');
  assert.ok(Math.hypot(note.x - p.x, note.y - p.y) > p.sensor, 'and that spot is out of sight');
  // drive to the spot: the enemy is not there (it is where it was put), so the note is worth nothing
  put(w, p, note.x - 5, note.y);
  run(0.1);
  assert.deepEqual(seenBy(p), [], 'the spot is in view and empty: no note');
  assert.equal(w.observeAll()[p.id].enemies.length, 0);
  assert.equal(w.observeAll()[p.id].enemiesAlive, 1, 'it still knows somebody is out there');
  put(w, p, 10, 10);
  run(0.1);
  assert.deepEqual(seenBy(p), [], 'and it stays dropped, not resurrected by looking away');
  // seen again: the note is back, at the new place
  put(w, p, q.x - 10, q.y);
  run(0.1);
  assert.equal(seenBy(p).length, 1);
  assert.ok(Math.abs(seenBy(p)[0].x - q.x) < 0.1 && seenBy(p)[0].stale === undefined);
});
