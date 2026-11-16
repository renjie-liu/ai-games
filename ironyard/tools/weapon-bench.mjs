#!/usr/bin/env node
// Weapon bench: how strong is a part, with the driver taken out of the question?
//
// One hull and one plain controller (hold about 70% of the longest gun's range, face the enemy, lead the shot,
// stay out of holes) carry different loadouts at about the same price. They play a round robin on every map
// from both sides, and optionally each plays a list of real bots. What comes out is each loadout's win rate
// among the bench cars and against the real ones: a weapon that wins everything with this controller is too
// strong, one that wins nothing is dead weight. It says nothing about what a clever controller can do with a
// part — the ladder is for that.
//
//   node tools/weapon-bench.mjs [--seeds 1,2] [--maps proving,sumo] [--only mg,laser] [--refs quillback,carbon] [--brief]
//
// To try other numbers, change them in a copy of the tree and run the copy's bench: nothing here alters the engine.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { MAP_IDS, validateDesign } = await import(ROOT + '/engine/index.js');
const { MatchPool, withSources } = await import(ROOT + '/node/runner.js');

const P = (type, x, y, z = 0, dir) => ({ type, x, y, z, ...(dir ? { dir } : {}) });
// the hull every loadout shares: plate floor x -2..2, y -2..3; four monster wheels; core on the deck under three armor bricks
function hull() {
  const out = [];
  for (const [x, y] of [[-2, -2], [0, -2], [-2, 0], [0, 0], [-2, 2], [0, 2]]) out.push(P('plate4', x, y, 0));
  for (const y of [-2, 0, 2]) out.push(P('plate2', 2, y, 0));
  for (const x of [-3, 3]) for (const y of [-2, 2]) out.push(P('bigwheel', x, y, 0));
  out.push(P('core', 0, -1, 1), P('armor', -1, -1, 1), P('armor', 1, -1, 1), P('armor', 0, -2, 1));
  return out;
}
const slopeAt = (xs) => xs.flatMap((x) => [P('plate', x, 4, 0), P('slope', x, 4, 1, 'N')]);
const util = (list) => list.map(([t, x, y]) => P(t, x, y, 1));
const LOADOUTS = {
  mg:      [...[-2, -1, 0, 1, 2].map((x) => P('mg', x, 3, 1, 'N')), ...slopeAt([-2, -1, 0, 1, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['battery', -1, -2], ['armor', 0, 0]])],
  laser:   [...[-2, -1, 1, 2].map((x) => P('laser', x, 3, 1, 'N')), ...slopeAt([-1, 1]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['battery', -1, -2]])],
  cannon:  [...[-2, -1, 1, 2].map((x) => P('cannon', x, 2, 1, 'N')), ...slopeAt([-2, -1, 1, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1]])],
  rail:    [...[-2, 0, 2].map((x) => P('railgun', x, 1, 1, 'N')), ...slopeAt([-2, 0, 2]), ...util([['reactor', -2, -1], ['battery', 2, -1]])],
  missile: [...[-3, -1, 1].map((x) => P('missile', x, 2, 1, 'N')), ...slopeAt([-1, 0, 1]), ...util([['reactor', -2, -1], ['battery', 2, -1]])],
  mortar:  [...[-2, 1].map((x) => P('mortar', x, 2, 1, 'N')), P('mortar', -1, 0, 1, 'N'), ...[-2, 2].map((x) => P('mg', x, 1, 1, x < 0 ? 'W' : 'E')), ...util([['reactor', -2, -1], ['armor', 2, -1], ['armor', 0, 3]])],
  flamer:  [...[-2, -1, 1, 2].map((x) => P('flamer', x, 3, 1, 'N')), ...slopeAt([-2, -1, 1, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['armor', 0, 0], ['armor', 0, 3]])],
  c3shld:  [...[-2, 0, 2].map((x) => P('cannon', x, 2, 1, 'N')), ...slopeAt([-2, 0, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['shieldgen', -1, 0]])],
  c3rep:   [...[-2, 0, 2].map((x) => P('cannon', x, 2, 1, 'N')), ...slopeAt([-2, 0, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['repairer', -1, 0], ['armor', 1, 0]])],
  c3armor: [...[-2, 0, 2].map((x) => P('cannon', x, 2, 1, 'N')), ...slopeAt([-2, 0, 2]), ...util([['reactor', -2, -1], ['reactor', 2, -1], ['armor', -1, 0], ['armor', 1, 0], ['armor', -1, 1], ['armor', 1, 1], ['armor', 0, 0]])],
  mgcan:   [...[-2, 2].map((x) => P('cannon', x, 2, 1, 'N')), ...[-1, 0, 1].map((x) => P('mg', x, 3, 1, 'N')), ...slopeAt([-2, -1, 0, 1, 2]), ...util([['reactor', -2, -1], ['battery', 2, -1]])],
};

const CONTROLLER = `
let route = null;
function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };
  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) { for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } } goal ??= api.map.center; }
  const kit = state.items.find((i) => i.type === 'repair');
  if (kit && self.hpFrac < 0.55 && U.dist(self, kit) < 16) goal = kit;
  if (U.dist(self, state.zone) > state.zone.r - 3) goal = state.zone;
  const guns = self.weapons.filter((w) => w.alive && w.range);
  const reach = guns.length ? Math.max(...guns.map((w) => w.range)) : 0;
  const lob = guns.length > 0 && guns.every((w) => w.minRange || w.range <= 13);
  if (foe && guns.length) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    cmd.aims = {}; cmd.target = foe.id;
    for (const w of guns) cmd.aims[w.i] = w.projSpeed ? U.lead(self, foe, w.projSpeed) : { x: foe.x, y: foe.y };
    cmd.aim = { x: foe.x, y: foe.y };
    cmd.fire = guns.filter((w) => d < w.range + foe.radius && (los || w.minRange) && !(w.minRange && d < w.minRange)).map((w) => w.i);
    const hold = Math.min(reach * 0.72, 17), minR = Math.max(0, ...guns.map((w) => w.minRange || 0));
    const want = Math.max(hold, minR + 3);
    if (goal === foe && (los || lob) && d < want + 2) {
      const t = U.turnTo(self, U.angleTo(self, foe));
      cmd.steer = t.steer;
      const bx = self.x - Math.cos(self.heading) * 3, by = self.y - Math.sin(self.heading) * 3;
      const backOk = nav.isOpen(bx, by) && nav.tileAt(bx, by) !== 'lava';
      cmd.throttle = d < want - 2 && backOk ? -1 : d > want ? 0.5 : 0;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}
function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1; return cmd;
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir) for (const d of [0.3, 0.7, 1.1, 1.7]) for (const w of [-0.35, 0, 0.35]) {
    const t = nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w);
    if (t === 'pit' || t === 'lava') { cmd.throttle = 0; return cmd; }
  }
  return cmd;
}`;

const only = flag('only', '').split(',').filter(Boolean);
const over = {}, ids = [];
for (const [name, extra] of Object.entries(LOADOUTS)) {
  if (only.length && !only.includes(name)) continue;
  const parts = [...hull(), ...extra];
  const v = validateDesign({ name: 'B-' + name, parts });
  if (!v.ok) { console.log(name, 'INVALID', v.errors.join('; ')); continue; }
  const id = 'b-' + name;
  over[id] = `const meta = { name: 'B-${name}', author: 'bench' };\nconst design = ${JSON.stringify({ name: 'B-' + name, parts })};\n${CONTROLLER}\n`;
  ids.push(id);
  console.log(`${id.padEnd(10)} cost ${String(v.stats.cost).padStart(4)}  mass ${v.stats.mass}  speed ${v.stats.topSpeed}  dps ${v.stats.dps}  regen ${v.stats.energyRegen}/drain ${v.stats.energyDrain}  cap ${v.stats.energyCap}  hp ${v.stats.hp}`);
}
const refs = flag('refs', '').split(',').filter(Boolean);
const all = [...ids, ...refs];
if (flag('dump')) { fs.mkdirSync(flag('dump'), { recursive: true }); for (const id of ids) fs.writeFileSync(path.join(flag('dump'), `${id}.js`), over[id]); }
const maps = flag('maps', MAP_IDS.join(',')).split(','), seeds = flag('seeds', '1').split(',').map(Number);
const unknown = maps.filter((m) => !MAP_IDS.includes(m));
if (unknown.length || seeds.some((x) => !Number.isInteger(x) || x < 1)) { console.error(unknown.length ? `unknown map ${unknown.join(', ')}: the maps are ${MAP_IDS.join(', ')}` : '--seeds takes whole numbers from 1, e.g. 1,2'); process.exit(2); }
const pool = new MatchPool({});
const jobs = [];
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  if (refs.includes(all[i]) && refs.includes(all[j])) continue;
  for (const map of maps) for (const seed of seeds) for (const swap of [false, true]) jobs.push({ a: all[i], b: all[j], map, seed, swap });
}
const t0 = Date.now();
const out = await Promise.all(jobs.map((j) => pool.run({ map: j.map, mode: '1v1', seed: j.seed, swap: j.swap, teams: withSources([[j.a], [j.b]], over), want: 'score' }).then((s) => ({ j, w: s.winner, err: s.errors && s.errors.length ? s.errors[0] : null })).catch((e) => ({ j, w: -2, err: e.message }))));
await pool.close();
const W = Object.fromEntries(all.map((a) => [a, { w: 0, l: 0, d: 0, vs: {} }]));
// a match that could not be played, or in which a controller threw, tells nothing about the parts: it is left out of
// every count and reported, and the run ends with an error — a table built on half the matches is not the table asked for
const failed = out.filter((x) => x.err);
for (const { j, w, err } of out) {
  if (err) continue;
  const A = W[j.a], B = W[j.b];
  (A.vs[j.b] ||= [0, 0]); (B.vs[j.a] ||= [0, 0]);
  if (w === 0) { A.w++; B.l++; A.vs[j.b][0]++; B.vs[j.a][1]++; } else if (w === 1) { B.w++; A.l++; B.vs[j.a][0]++; A.vs[j.b][1]++; } else { A.d++; B.d++; }
}
console.log(`\n${jobs.length} matches in ${Math.round((Date.now() - t0) / 1000)} s${failed.length ? `; ${failed.length} FAILED and are not counted — first: ${failed[0].j.a} v ${failed[0].j.b} on ${failed[0].j.map}: ${String(failed[0].err).slice(0, 160)}` : ''}`);
if (failed.length) process.exitCode = 1;
const short = (id) => id.replace('b-', '').slice(0, 7);
console.log('\n' + 'vs'.padEnd(11) + all.map((a) => short(a).padStart(8)).join('') + '   | win%');
for (const a of [...all].sort((x, y) => W[y].w / (W[y].w + W[y].l + W[y].d || 1) - W[x].w / (W[x].w + W[x].l + W[x].d || 1))) {
  const r = W[a], n = r.w + r.l + r.d;
  console.log(short(a).padEnd(11) + all.map((b) => (a === b ? '   -' : r.vs[b] ? `${r.vs[b][0]}-${r.vs[b][1]}` : '').padStart(8)).join('') + `   | ${n ? Math.round((r.w / n) * 100) : 0}%  (${r.w}-${r.d}-${r.l})`);
}

if (args.includes('--brief')) {
  const pct = (a, set) => { let w = 0, n = 0; for (const b of set) if (b !== a && W[a].vs[b]) { w += W[a].vs[b][0]; n += W[a].vs[b][0] + W[a].vs[b][1]; } return n ? Math.round((w / n) * 100) : null; };
  console.log('BRIEF ' + (flag('label', '')) + ' | bench%/refs% : ' + ids.map((a) => `${short(a)} ${pct(a, ids)}/${pct(a, refs) ?? '-'}`).join('  ') + (refs.length ? '  || refs vs bench: ' + refs.map((r) => `${short(r)} ${pct(r, ids)}`).join(' ') : ''));
}
