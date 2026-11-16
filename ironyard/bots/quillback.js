// QUILLBACK — a fast wheeled car that fights facing AWAY from its target, with two mortars on its back.
// The three machine guns point over the tail behind a glacis of slopes that runs the full width of the
// car, wheels included; the mortars sit ahead of them and lob over the lot. Driving forward is therefore
// running away at full power with everything bearing on whoever follows.
// The mortar is the main weapon: its burst takes no notice of the slopes and armour every other gun
// car hides behind, and a shell costs 14 energy where the same damage in bullets on a slope face costs
// hundreds. So the car keeps the fight in the band where shells land (beyond 6 m) and bullets still
// reach: it backs in to 9.5 m on gun cars (7.6 m on maps with holes, where ground given is a rim
// reached), stays outside the beams of laser cars (they reach 10 m, the shells 24 m), and runs from
// anything that has to touch it, shelling it as it follows.
// (Until engine 0.6.0 this was a six-machine-gun car with a hover skiff for the Skybridge. Slopes turn
// four fifths of a bullet; the six guns emptied the batteries on other cars' glacis and lost to lasers.)
const meta = {
  name: 'Quillback',
  author: 'Fable',
  model: 'Fable',
  notes: 'Rear-facing: 3 MGs behind a full-width glacis and 2 mortars that lob over it, laid on the stud where a burst is worth most. Holds 9.5 m on gun cars, kites laser cars from outside their beams, flees brawlers while shelling them; says and follows { focus }.',
};

const E = '.  .  .  .  .  .  .  .  .';
// Deck, front to rear: the two mortars over the reactors, three turrets, then seven slopes across the full width.
// Chassis: reactors, the cockpit between two long plates, an armour keystone under the middle turret, and the rear
// wheels and floor that carry the glacis. Every lane a shot from astern can take starts with a slope: the wheels and
// the mortars are behind it too, not only the guns.
const HULL = {
  deck: [ E, E, E,
    '.  .  :  :  .  :  :  .  .',
    '.  .  N  :  .  N  :  .  .',
    '.  .  .  mv mv mv .  .  .',
    '.  /v /v /v /v /v /v /v .',
    E, E, E, E ],
  chassis: [ E, E, E,
    '.  :  .  r  .  r  .  :  .',
    '.  O  q> :  @  q> :  O  .',
    '.  :  q> :  a  q> :  :  .',
    '.  O  q> :  p  q> :  O  .',
    E, E, E, E ],
};

// The same car on every map and in every team slot. (The hover skiff the old Quillback took to the Skybridge is gone:
// shells cross the void, and on wheels this car won there where the skiff lost.)
const design = (ctx, api) => api.util.blueprint('Quillback', HULL, { paint: { accent: 'azure' } });

// ── controller state ────────────────────────────────────────────────────
const PI = Math.PI;
const DIRA = { N: 0, W: PI / 2, S: PI, E: -PI / 2 };
const VAL = {
  saw: 220, piston: 200, flamer: 130, keg: 320, spike: 90, harpoon: 90, hover: 70, wheel: 45, bigwheel: 60,
  mg: 50, cannon: 75, railgun: 80, laser: 60, missile: 120, mortar: 110, repairer: 70, thruster: 25, track: 60,
};
// against a car of beams: how much more its legs are worth, and the range to hold; the range to hold on a gun car
// (room for the shells, and for the ones that rush in under them), and the shorter one on maps with holes, where
// every metre given is a metre nearer a rim
const BM = 4, BH = 13.5, GH = 9.5, GP = 7.6;
// what a shell is worth on each kind of piece (times the share of the piece it takes away)
const SV = {
  core: 6, mg: 1, laser: 1.6, cannon: 1.3, railgun: 1.4, missile: 1.5, mortar: 1.6, flamer: 1.3, harpoon: 1, saw: 1.2, piston: 1, spike: 0.3, plow: 0.3, keg: 2.2,
  wheel: 0.5, bigwheel: 0.6, track: 0.6, hover: 0.9, thruster: 0.2, gyro: 0.1, blower: 0.2,
  reactor: 0.7, battery: 0.2, shieldgen: 0.8, repairer: 0.8, radar: 0.1,
  plate: 0.12, plate2: 0.15, plate4: 0.2, brick: 0.1, brick2: 0.12, armor: 0.08, armor2: 0.1, slope: 0.25,
};
const SPREAD = [-0.052, -0.026, 0, 0.026, 0.052];
let route = null, M = null, foeId = -1, markI = -1, markT = -99;
let runH = null, runFree = 0, runT = -99, anchor = null, fleeUntil = -1;
let unstickUntil = -1, unstickThr = 0, chkT = 0, chkX = 0, chkY = 0, wantMove = 0, jams = 0, planUntil = -1;
let waitT = -1, blindT = 0, flankA = null, flankT = -9, flankGo = 0, flankOff = -9;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function angDiff(a, b) { let d = (a - b) % (2 * PI); if (d > PI) d -= 2 * PI; else if (d < -PI) d += 2 * PI; return d; }

function tick(state, api) {
  let cmd;
  try { cmd = think(state, api); } catch (err) {
    cmd = { throttle: 0, steer: 0, fire: false };
    try { const e = state.enemies[0]; if (e) { cmd.aim = { x: e.x, y: e.y }; cmd.fire = true; } } catch (e2) { /* idle */ }
  }
  // the common team convention: everybody names the enemy it is on
  if (cmd && foeId >= 0 && state.allies && state.allies.length) cmd.say = { focus: foeId };
  return cmd;
}

// what the map is made of, and a handful of places to run to
function mapFacts(api) {
  const all = api.map.rows.join('');
  const pts = [];
  for (const s of api.map.itemSpawns) pts.push({ x: s.x, y: s.y });
  for (const t of api.map.spawns) for (const s of t) pts.push({ x: s.x, y: s.y });
  return { lava: all.includes('L'), pit: all.includes('_'), ice: all.includes('i'), mud: all.includes('m'), crates: all.includes('x'), maze: api.map.id === 'skybridge', pts };
}

// ── reading the other car ───────────────────────────────────────────────
// Its stud grid, rebuilt from the piece list: which piece a shot arriving at a world point meets.
function gridOf(foe, api) {
  const top = [], bot = [];
  let core = null;
  for (const p of foe.parts) {
    if (!p.alive) continue;
    if (p.type === 'core') core = p;
    const sz = api.parts[p.type].size;
    const w = p.dir === 'E' || p.dir === 'W' ? sz[1] : sz[0], l = p.dir === 'E' || p.dir === 'W' ? sz[0] : sz[1];
    for (let j = 0; j < l; j++) for (let i = 0; i < w; i++) {
      const k = (p.y + j + 5) * 9 + (p.x + i + 4);
      if (p.z === 1) top[k] = p; else bot[k] = p;
    }
  }
  if (!core) return null;
  const cols = [];
  for (let k = 0; k < 99; k++) { const p = top[k] || bot[k]; if (p) cols.push({ bx: (k % 9) - 4, by: ((k / 9) | 0) - 5, p }); }
  const fx = Math.cos(foe.heading), fy = Math.sin(foe.heading);
  const cu = core.y * 0.4, cv = -core.x * 0.4;
  return { top, bot, cols, core, fx, fy, ox: core.wx - (fx * cu - fy * cv), oy: core.wy - (fy * cu + fx * cv), h: foe.heading, hitT: 0 };
}
function cellAt(g, px, py) {
  const dx = px - g.ox, dy = py - g.oy;
  const bx = Math.round(-(-dx * g.fy + dy * g.fx) / 0.4), by = Math.round((dx * g.fx + dy * g.fy) / 0.4);
  if (bx < -4 || bx > 4 || by < -5 || by > 5) return -1;
  return (by + 5) * 9 + (bx + 4);
}
// bullets (4 damage each) it takes to remove a piece, shot along world angle a
function bulletsFor(g, p, a, api) {
  const hp = p.hpFrac * api.parts[p.type].hp;
  let per = 4;
  if (p.type === 'slope') per = Math.cos(a - (g.h + DIRA[p.dir])) < -0.5 ? 0.8 : 3;
  else if (p.type === 'armor' || p.type === 'armor2') per = 2;
  else if (p.type === 'plow') per = 3;
  return hp / per + 0.5;
}
// the first piece a shot from (sx, sy) along (ux, uy) runs into, looking between L-5 and L+far
function rayPiece(g, sx, sy, ux, uy, L, far) {
  for (let t = Math.max(0.2, L - 5); t <= L + far; t += 0.15) {
    const k = cellAt(g, sx + ux * t, sy + uy * t);
    if (k < 0) continue;
    const p = g.top[k] || g.bot[k];
    if (p) { g.hitT = t; return p; }
  }
  return null;
}
// bullets needed to chew along the line to the core
function drill(g, sx, sy, api) {
  const tx = g.core.wx, ty = g.core.wy;
  const L = Math.hypot(tx - sx, ty - sy) || 1, ux = (tx - sx) / L, uy = (ty - sy) / L, a = Math.atan2(uy, ux);
  let total = 0, last = -1;
  for (let t = Math.max(0.2, L - 5); t <= L + 0.15; t += 0.1) {
    const k = cellAt(g, sx + ux * t, sy + uy * t);
    if (k < 0 || k === last) continue;
    last = k;
    const a1 = g.top[k], b1 = g.bot[k];
    if (a1 === g.core) break;
    if (a1) total += bulletsFor(g, a1, a, api);
    if (b1 === g.core) break;
    if (b1) total += bulletsFor(g, b1, a, api);
  }
  return total + bulletsFor(g, g.core, a, api);
}

// What a burst at (lx, ly) — in the target's own stud coordinates — is worth. A burst takes the top piece of the
// seven nearest stud columns: 46 at its centre, falling to a third of that at 2 m.
const near7 = [];
function burstWorth(g, lx, ly, api) {
  near7.length = 0;
  for (const c of g.cols) {
    const dd = Math.hypot((c.bx - lx) * 0.4, (c.by - ly) * 0.4);
    if (dd > 2) continue;
    let seen = false;
    for (const q of near7) if (q.p === c.p) { if (dd < q.d) q.d = dd; seen = true; break; }
    if (!seen) near7.push({ p: c.p, d: dd });
  }
  near7.sort((a, b) => a.d - b.d);
  let v = 0;
  for (let i = 0; i < near7.length && i < 7; i++) {
    const p = near7[i].p, def = api.parts[p.type];
    let dmg = 46 * (1 - 0.325 * near7[i].d) - (def.armor || 0);
    const hp = p.hpFrac * def.hp;
    v += (SV[p.type] || 0.1) * (dmg >= hp ? 1.25 : dmg / hp);
  }
  return v;
}

// Lay the mortars: for each, the stud of the target whose burst is worth most where the target will be when the
// shell comes down. Inside the 6 m minimum the shell lands 6 m out along the bearing, so that is where it is judged.
function shell(state, api, cmd, foe, g, mortars, byI) {
  const self = state.self;
  let fired = false;
  for (const w of mortars) {
    const mp = byI[w.i];
    if (!mp) continue;
    // flight time to where its centre will be
    let t = 0.5, px = foe.x, py = foe.y;
    for (let k = 0; k < 3; k++) {
      px = foe.x + foe.vx * t; py = foe.y + foe.vy * t;
      t = Math.max(6, Math.hypot(px - mp.wx, py - mp.wy)) / 15;
    }
    const rot = (foe.angVel || 0) * t, cr = Math.cos(rot), sr = Math.sin(rot);
    const hp = g.h + rot, fxp = Math.cos(hp), fyp = Math.sin(hp);
    let best = -1, bx = px, by = py;
    for (const c of g.cols) {
      // this stud now, then when the shell lands
      const wx0 = g.ox + g.fx * c.by * 0.4 + g.fy * c.bx * 0.4, wy0 = g.oy + g.fy * c.by * 0.4 - g.fx * c.bx * 0.4;
      const rx = wx0 - foe.x, ry = wy0 - foe.y;
      const qx = foe.x + foe.vx * t + rx * cr - ry * sr, qy = foe.y + foe.vy * t + rx * sr + ry * cr;
      const dq = Math.hypot(qx - mp.wx, qy - mp.wy);
      if (dq > 23.8) continue;
      let lx = c.bx, ly = c.by, ex = qx, ey = qy;
      if (dq < 6.05) {
        const k = 6.05 / (dq || 1);
        ex = mp.wx + (qx - mp.wx) * k; ey = mp.wy + (qy - mp.wy) * k;
        const ddx = ex - qx, ddy = ey - qy;
        ly += (ddx * fxp + ddy * fyp) / 0.4; lx -= (-ddx * fyp + ddy * fxp) / 0.4;
      }
      const v = burstWorth(g, lx, ly, api);
      if (v > best) { best = v; bx = ex; by = ey; }
    }
    cmd.aims = cmd.aims || {};
    cmd.aims[w.i] = { x: bx, y: by };
    if (best > 0.2 && w.ready && self.energy >= 14) {
      if (!Array.isArray(cmd.fire)) cmd.fire = [];
      cmd.fire.push(w.i);
      fired = true;
    }
  }
  return fired;
}

// how far a car can run from (x, y) along angle a before something is in the way
function freeRun(nav, x, y, a, maxD, step) {
  const c = Math.cos(a), s = Math.sin(a);
  const c0 = nav.clearance(x, y);
  let pw = c0.wall, pp = c0.pit, d = step;
  for (; d <= maxD; d += step) {
    const px = x + c * d, py = y + s * d;
    const cl = nav.clearance(px, py);
    if (cl.wall < 0.6 || cl.pit < 1.0) break;
    if (cl.wall < 1.5 && cl.wall < pw - 0.05) break;      // near a wall and closing on it
    if (cl.pit < 1.8 && cl.pit < pp - 0.05) break;
    if (M.lava && nav.tileAt(px, py) === 'lava') break;
    pw = cl.wall; pp = cl.pit;
  }
  return d - step;
}

function think(state, api) {
  const self = state.self, U = api.util, nav = api.nav;
  if (!route) { route = nav.follower({ lavaCost: 60, mudCost: 2.2, iceCost: 3 }); M = mapFacts(api); }
  const cmd = { throttle: 0, steer: 0, brake: 0, fire: false };

  // ── who ──
  let foe = null, bs = Infinity;
  for (const e of state.enemies) {
    let s = U.dist(self, e) + e.hpFrac * 3 + (e.id === foeId ? -2.5 : 0) + (nav.los(self.x, self.y, e.x, e.y) ? 0 : 9);
    // one a teammate has named is worth a few metres of driving
    for (const m of state.messages) if (m.data && m.data.focus === e.id) { s -= 3.5; break; }
    if (s < bs) { bs = s; foe = e; }
  }
  if (!foe || foe.id !== foeId) { markI = -1; }
  foeId = foe ? foe.id : -1;

  // battery position (centre of the living turrets)
  let gx = 0, gy = 0, gn = 0;
  const guns = [], byI = {}, mortars = [];
  for (const p of self.parts) { byI[p.i] = p; if (p.alive && p.type === 'mg') { gx += p.wx; gy += p.wy; gn++; guns.push(p); } }
  for (const w of self.weapons) if (w.alive && w.type === 'mortar') mortars.push(w);
  if (gn) { gx /= gn; gy /= gn; } else { gx = self.x; gy = self.y; }

  const z = state.zone, zd = U.dist(self, z);
  const zoneOut = zd > z.r - (z.shrinking ? 7 : 4);

  if (!foe) {
    // nobody in sight: go where one was last seen, tail first once it is near
    let goal = null, best = Infinity;
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    if (!goal) goal = api.map.center;
    if (zoneOut) goal = z;
    travel(state, api, cmd, goal, best < 40 && !zoneOut);
    // close to where it should appear: come in slowly, so that whatever it is we can still get away from it
    if (best < 36 && !zoneOut && self.speed > 3.2) cmd.throttle = 0;
    return guard(state, api, cmd);
  }

  // ── what it is ──
  const n = { saw: 0, piston: 0, flamer: 0, spike: 0, plow: 0, harpoon: 0, keg: 0, thruster: 0, mortar: 0, laser: 0, mg: 0, movers: 0, guns: 0, side: 0, hover: 0 };
  let reach = 0;
  for (const p of foe.parts) {
    if (!p.alive) continue;
    if (n[p.type] !== undefined) n[p.type]++;
    const def = api.parts[p.type];
    if (def.mover) n.movers++;
    if (def.weapon && def.weapon !== 'melee') { n.guns++; if (p.dir === 'E' || p.dir === 'W') n.side++; if (def.range > reach) reach = def.range; }
  }
  const brawler = n.saw + n.piston + n.flamer + n.spike + n.plow + n.harpoon > 0;
  const bomber = n.keg > 0;
  const runner = !brawler && reach >= 19;
  const pusher = !brawler && !bomber && n.guns === 0;          // nothing left but its weight
  // nothing on it reaches past ten metres, and what it has goes through slopes and armour: stay outside its beams
  const beamer = !brawler && n.laser >= 2 && reach <= 10.5;

  const d = U.dist(self, foe), bearing = U.angleTo(self, foe);
  const los = nav.los(self.x, self.y, foe.x, foe.y);
  const ux = Math.cos(bearing), uy = Math.sin(bearing);
  const closing = -((foe.vx - self.vx) * ux + (foe.vy - self.vy) * uy);

  // ── where to shoot ──
  // Every candidate aim point is scored by what a spread of bullets sent at it would actually hit first.
  const g = gridOf(foe, api);
  let mark = null;
  if (g) {
    if (state.t - markT >= 0.14 || markI < 0) {
      markT = state.t;
      const coreV = 1000 / drill(g, gx, gy, api);
      let bestS = -1, bestP = g.core;
      for (const p of foe.parts) {
        if (!p.alive) continue;
        const isCore = p === g.core;
        if (!isCore && !VAL[p.type]) continue;
        if (p.type === 'keg' && Math.hypot(p.wx - self.x, p.wy - self.y) < 5.5) continue;
        const dx = p.wx - gx, dy = p.wy - gy, L = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
        let s = 0;
        for (let j = 0; j < 5; j++) {
          const aa = a + SPREAD[j];
          const q = rayPiece(g, gx, gy, Math.cos(aa), Math.sin(aa), L, 1.5);
          if (!q) continue;
          let v = q === g.core ? 1000 : (VAL[q.type] || 3);
          if (q !== g.core) {
            const def = api.parts[q.type];
            if (def.mover) { if (runner || pusher) v *= 1.8; if (beamer) v *= BM; if (n.movers <= 1) v *= 1.5; }
            else if (def.weapon && def.weapon !== 'melee' && (bomber || runner)) v *= 1.6;
          }
          v /= bulletsFor(g, q, aa, api);
          if (isCore) v = Math.max(v, coreV * (j === 2 ? 1 : 0.6));
          s += v;
        }
        if (p.i === markI) s *= 1.15;
        if (s > bestS) { bestS = s; bestP = p; }
      }
      markI = bestP.i;
    }
    for (const p of foe.parts) if (p.i === markI && p.alive) { mark = p; break; }
    if (!mark) { mark = g.core; markT = -99; }
  }
  const tgt = mark ? { x: mark.wx, y: mark.wy, vx: foe.vx, vy: foe.vy } : foe;
  let aim = U.lead({ x: gx, y: gy }, tgt, 28);
  let hitD = Math.hypot(aim.x - gx, aim.y - gy);
  if (g && mark) {
    const L = Math.hypot(mark.wx - gx, mark.wy - gy) || 1;
    if (rayPiece(g, gx, gy, (mark.wx - gx) / L, (mark.wy - gy) / L, L, 0.3)) hitD = Math.min(hitD, g.hitT);
  }
  let shoot = hitD < 13.2, short = 0;
  // a powder barrel beside it is worth more than anything bolted to it
  for (const b of state.barrels) {
    const db = U.dist(b, foe), dm = Math.hypot(b.x - gx, b.y - gy);
    if (db > 2.4 + foe.radius * 0.5 || dm > 13.5 || U.dist(b, self) < 4.6 + self.radius) continue;
    let near = false;
    for (const al of state.allies) if (al.alive && U.dist(b, al) < 4.2 + al.radius) near = true;
    if (near) continue;
    aim = { x: b.x, y: b.y }; shoot = true; short = 1.5;
    break;
  }
  cmd.aim = { x: aim.x, y: aim.y };
  // shells first: a mortar about to fire keeps its 14 energy, the bullets take what is left
  let soon = 0;
  for (const w of mortars) if (w.cooldown < 1.2) soon++;
  if (mortars.length && self.energy < 14 * soon + 3 && d > 5) shoot = false;
  if (shoot) {
    // only the turrets with a clear line fire
    // (a crate in the way is not cover, it is 150 hit points: those turrets shoot it down)
    const list = [];
    for (const p of guns) {
      const L = Math.hypot(aim.x - p.wx, aim.y - p.wy) || 1, k = Math.max(0, L - short) / L;
      const ex = p.wx + (aim.x - p.wx) * k, ey = p.wy + (aim.y - p.wy) * k;
      if (nav.los(p.wx, p.wy, ex, ey)) { list.push(p.i); continue; }
      if (!M.crates) continue;
      const nS = Math.ceil(L * k / 0.5);
      for (let j = 1; j < nS; j++) {
        const t = nav.tileAt(p.wx + (ex - p.wx) * j / nS, p.wy + (ey - p.wy) * j / nS);
        if (t === 'crate') { list.push(p.i); break; }
        if (t === 'wall' || t === 'barrel') break;
      }
    }
    cmd.fire = list;
    if (list.length) blindT = state.t;
  } else blindT = state.t;

  if (mortars.length && g) shell(state, api, cmd, foe, g, mortars, byI);

  // ── items in hand ──
  if (self.item) {
    if (self.item.type === 'emp' && d < 6.5 + foe.radius) cmd.useItem = true;
    if (self.item.type === 'mine' && d < 9 && closing > 1 && Math.abs(angDiff(bearing, self.heading + PI)) < 0.7) cmd.useItem = true;
  }

  // ── where to drive ──
  if (zd > z.r - 2.5) { travel(state, api, cmd, z, false); return guard(state, api, cmd); }
  const away = bearing + PI;                                   // the heading that puts the tail on the target
  let hold = mortars.length ? (M.pit ? GP : GH) : 6;
  if (brawler) hold = n.thruster > 0 ? 10.5 : 9;
  else if (bomber) hold = 11.5;
  else if (n.mortar > 0) hold = 4.5;
  else if (pusher) hold = M.pit ? 10 : 4;
  else if (beamer) hold = BH;
  const danger = brawler || bomber || beamer || (pusher && M.pit);
  const lookahead = danger ? 0.9 : 0.4;
  let push = clamp((hold + lookahead * Math.max(0, closing) - d) * 0.6, -1, 1);   // + = get away, - = back in
  if (zoneOut && push < 0.3) push = Math.min(push, 0);

  if (los) waitT = -1; else if (waitT < 0) waitT = state.t;      // since when it has been out of sight
  if (!los && d > 6) {
    // something that wants to touch us is coming round a corner: let it come to us, tail on, rather than meet it at arm's length
    if (danger && d < hold + 9 && state.t - waitT < 5) {
      if (push > 0.05) run(state, api, cmd, foe, d, bearing, push);
      else { runH = null; cmd.steer = clamp(angDiff(away, self.heading) * 2.6 - self.angVel * 0.4, -1, 1); cmd.brake = 0.5; }
      return guard(state, api, cmd);
    }
    travel(state, api, cmd, foe, d < 40);
    return guard(state, api, cmd);
  }

  // A car that can no longer turn to face us: go round to the side it is cheapest to shoot through
  // and that its guns cannot reach, instead of trading with it nose to tail.
  if (g && los && !danger && n.movers <= 1 && !foe.hovering && d < 13 && !zoneOut && Math.abs(foe.angVel) < 0.3 && foe.speed < 1.5 && state.t > flankOff) {
    if (state.t - flankT > 0.5) {
      flankT = state.t;
      const R = clamp(d, 5, 6.5), cur = away;                // where we stand, seen from it
      let bestA = null, bc = Infinity, here = Infinity;
      for (let k = 0; k < 12; k++) {
        const th = cur + k * (PI / 6), vx = foe.x + Math.cos(th) * R, vy = foe.y + Math.sin(th) * R;
        if (k > 0) {
          const cl = nav.clearance(vx, vy);
          if (cl.wall < 1.4 || cl.pit < 1.7 || !nav.los(vx, vy, foe.x, foe.y) || (M.lava && nav.tileAt(vx, vy) === 'lava')) continue;
        }
        let cost = drill(g, vx, vy, api), threat = 0;
        for (const p of foe.parts) {
          if (!p.alive) continue;
          const def = api.parts[p.type];
          if (!def.weapon || def.weapon === 'melee') continue;
          if (Math.abs(angDiff(th, foe.heading + DIRA[p.dir])) < def.arc + 0.3) threat += def.dps || (def.dmg * (def.salvo || 1)) / def.cooldown;
        }
        cost *= 1 + threat / 45;
        const turn = Math.abs(angDiff(th, cur));
        cost += turn * R * 7.5;                               // bullets not fired on the way round
        if (flankA !== null && Math.abs(angDiff(th, flankA)) < 0.3) cost *= 0.85;
        if (k === 0) here = cost;
        if (cost < bc) { bc = cost; bestA = th; }
      }
      const was = flankA;
      flankA = bestA !== null && bc < here * 0.7 ? bestA : null;
      if (flankA !== null && was === null) flankGo = state.t;
    }
    // it should take two or three seconds; if it is taking longer the target is turning with us: give it up for a while
    if (flankA !== null && state.t - flankGo > 3.5) { flankA = null; flankOff = state.t + 6; }
    if (flankA !== null) {
      const cur = away, dth = angDiff(flankA, cur);
      if (Math.abs(dth) > 0.3) {
        const R = clamp(d, 5.5, 7), stepA = cur + clamp(dth, -0.8, 0.8);
        const wx = foe.x + Math.cos(stepA) * R, wy = foe.y + Math.sin(stepA) * R;
        if (nav.clear(self.x, self.y, wx, wy, { margin: 1.2, avoid: ['lava'] })) {
          runH = null;
          const err = angDiff(Math.atan2(wy - self.y, wx - self.x), self.heading);
          cmd.steer = clamp(err * 2.6 - self.angVel * 0.4, -1, 1);
          cmd.throttle = Math.abs(err) < 1.2 ? 1 : 0.2;
          return guard(state, api, cmd);
        }
        flankA = null; flankOff = state.t + 2;                // no way round here: leave it for a moment
      }
    }
  }

  // Where there are holes, a car with nothing but machine guns is only stepped back from straight, tail still on it,
  // and only while there is room: the glacis turns its bullets, but turning to run shows it the wheels, and with
  // a side of wheels gone its fire pushes us over the rim. (Beams and shells go through the glacis: from those we run.)
  let stand = false;
  if (M.pit && push > 0.05 && !danger && n.guns > 0 && n.mg === n.guns) {
    let bs = -Infinity, bh = away, bf = 0;
    for (const off of [0, 0.3, -0.3, 0.6, -0.6]) {
      const free = freeRun(nav, self.x, self.y, away + off, 6, 1);
      const sc = free - 2.5 * Math.abs(off) + (runH !== null ? 0.6 * Math.cos(away + off - runH) : 0);
      if (sc > bs) { bs = sc; bh = away + off; bf = free; }
    }
    if (bf >= 3) {
      runH = bh;
      const err = angDiff(bh, self.heading);
      cmd.steer = clamp(err * 2.6 - self.angVel * 0.4, -1, 1);
      cmd.throttle = Math.abs(err) < 0.9 ? push * (bf < 4.5 ? 0.6 : 1) : 0;
      return guard(state, api, cmd);
    }
    stand = true;
  }
  if (push > 0.05 && !stand) {
    run(state, api, cmd, foe, d, bearing, push);
  } else {
    if (n.movers > 1) flankA = null;
    // backing in, tail first — straight if the way is open, round the obstacle if not
    runH = null;
    const step = Math.min(Math.max(d - 3, 1), 5);
    const open = nav.clear(self.x, self.y, self.x + ux * step, self.y + uy * step, { margin: 1.3, avoid: ['lava'] });
    if (!open && d > hold + 1) { travel(state, api, cmd, foe, true); return guard(state, api, cmd); }
    const err = angDiff(away, self.heading);
    cmd.steer = clamp(err * 2.6 - self.angVel * 0.4, -1, 1);
    cmd.throttle = Math.abs(err) < 0.9 && open ? push : 0;
    if (stand) { cmd.throttle = 0; cmd.brake = 1; return guard(state, api, cmd); }
    // in range and nothing bears for two seconds: edge closer until something does
    if (state.t - blindT > 2 && d > Math.max(5, hold - 4) && Math.abs(err) < 0.9) {
      if (open) cmd.throttle = -0.6; else { travel(state, api, cmd, foe, true); return guard(state, api, cmd); }
    }
    if (zoneOut && U.dist({ x: self.x + ux * 3, y: self.y + uy * 3 }, z) > zd) { travel(state, api, cmd, z, false); }
  }
  return guard(state, api, cmd);
}

// somewhere to run to when there is no room to run: the end of a real route whose first stretch leads away
// from the pursuer and which never passes close to it
function pickAnchor(state, api, foe, d, bearing) {
  const self = state.self, U = api.util, nav = api.nav, z = state.zone;
  const away = bearing + PI;
  const cand = [];
  for (const p of M.pts) {
    const dp = U.dist(self, p), de = U.dist(foe, p);
    if (dp < 6 || Math.hypot(p.x - z.x, p.y - z.y) > z.r - 4) continue;
    cand.push({ p, s: Math.min(de, 30) - 0.2 * dp - 6 * (1 - Math.cos(U.angleTo(self, p) - away)) });
  }
  cand.sort((a, b) => b.s - a.s);
  let best = null, bs = -Infinity;
  for (let i = 0; i < cand.length && i < 4; i++) {
    const p = cand[i].p;
    const path = nav.path(self.x, self.y, p.x, p.y, { margin: 1.45, lavaCost: 60, mudCost: 2.2, iceCost: 3 });
    if (!path.length) continue;
    // walk the first 20 m of it: where it points after 4 m, and how close it comes to the pursuer
    let len = 0, px = self.x, py = self.y, near = 99, dir4 = null;
    for (const w of path) {
      const seg = Math.hypot(w.x - px, w.y - py), nS = Math.max(1, Math.ceil(seg / 1.5));
      for (let j = 1; j <= nS && len + seg * (j - 1) / nS < 20; j++) {
        const qx = px + (w.x - px) * j / nS, qy = py + (w.y - py) * j / nS;
        const dq = Math.hypot(qx - foe.x, qy - foe.y);
        if (dq < near) near = dq;
        if (dir4 === null && len + seg * j / nS >= 4) dir4 = Math.atan2(qy - self.y, qx - self.x);
      }
      len += seg; px = w.x; py = w.y;
    }
    if (dir4 === null) dir4 = Math.atan2(py - self.y, px - self.x);
    let sc = Math.min(U.dist(foe, p), 30) - 0.15 * len - 10 * (1 - Math.cos(dir4 - away));
    if (near < 6) sc -= (6 - near) * 5;
    if (sc > bs) { bs = sc; best = p; }
  }
  return best || (cand.length ? cand[0].p : null);
}

// running away: look all round for the heading with the most room that still takes us off the pursuer's nose
function run(state, api, cmd, foe, d, bearing, push) {
  const self = state.self, U = api.util, nav = api.nav, z = state.zone;
  const away = bearing + PI;
  if (state.t < fleeUntil && anchor) {
    if (U.dist(self, anchor) > 3.5) { travel(state, api, cmd, anchor, false); return; }
    fleeUntil = -1;
  }
  if (runH === null || state.t - runT >= 0.14) {
    let bestS = -Infinity, bestH = away, bestFree = 0;
    for (let i = -7; i <= 8; i++) {
      const off = i * (PI / 8), ao = Math.abs(off);
      if (ao > 2.3 && d < 15) continue;                     // not back down its throat
      const h = away + off;
      const free = freeRun(nav, self.x, self.y, h, 10, 1.25);
      const m = Math.min(free, 6), ex = self.x + Math.cos(h) * m, ey = self.y + Math.sin(h) * m;
      const ce = nav.clearance(ex, ey);
      let s = free + 0.3 * Math.min(ce.wall, 5) + 0.3 * Math.min(ce.pit, 5) - 2.5 * (1 - Math.cos(off)) + (ao < 0.7 ? 1 : 0);
      if (free >= 2.5) s += 0.35 * Math.max(freeRun(nav, ex, ey, h - 1.0, 6, 1.5), freeRun(nav, ex, ey, h + 1.0, 6, 1.5));
      if (M.pit && ce.pit < 4) s -= (4 - ce.pit) * 1.2;
      if (runH !== null) s += 1.2 * Math.cos(h - runH);
      if (M.ice || M.mud) { const te = nav.tileAt(ex, ey); if (te === 'ice' || te === 'mud') s -= 2; }
      if (Math.hypot(ex - z.x, ey - z.y) > z.r - 3.5) s -= 6;
      for (const it of state.items) {
        const di = U.dist(self, it);
        if (di < 14 && (it.type !== 'repair' || self.hpFrac < 0.9)) s += 1.6 * Math.cos(angDiff(U.angleTo(self, it), h)) * (1 - di / 16);
      }
      for (const b of state.barrels) if (Math.hypot(b.x - ex, b.y - ey) < 4.5) { s -= 2.5; break; }
      for (const al of state.allies) if (al.alive && U.dist(self, al) < 5 && Math.abs(angDiff(U.angleTo(self, al), h)) < 0.6) s -= 3;
      if (s > bestS) { bestS = s; bestH = h; bestFree = free; }
    }
    runH = bestH; runFree = bestFree; runT = state.t;
    // boxed in, or on a map of islands and bridges: take a planned route instead
    if (bestFree < 3 || M.maze || state.t < planUntil) {
      anchor = pickAnchor(state, api, foe, d, bearing);
      if (anchor) { fleeUntil = state.t + (M.maze ? 1.5 : 1.2); travel(state, api, cmd, anchor, false); return; }
    }
  }
  const err = angDiff(runH, self.heading);
  cmd.steer = clamp(err * 2.6 - self.angVel * 0.4, -1, 1);
  cmd.throttle = Math.abs(err) < 1.3 ? push * (runFree < 1.25 ? 0.5 : 1) : 0.2 * push;
}

// follow the planned route to a goal; `tailFirst` drives it backwards so the guns lead
function travel(state, api, cmd, goal, tailFirst) {
  const self = state.self, U = api.util;
  const wp = route.next(self, goal.x, goal.y, state.tick);
  const a = U.angleTo(self, wp), dist = U.dist(self, wp);
  runH = null;
  if (dist < 0.6) { cmd.throttle = 0; cmd.brake = 1; return; }
  let back = !!tailFirst;
  if (wp.reverse) back = !back;
  if (back) {
    const err = angDiff(a + PI, self.heading);
    cmd.steer = clamp(err * 2.4 - self.angVel * 0.35, -1, 1);
    cmd.throttle = -(Math.abs(err) > 1.2 ? 0.15 : 0.3 + 0.7 * Math.max(0, Math.cos(err)));
  } else {
    const err = angDiff(a, self.heading);
    cmd.steer = clamp(err * 2.4 - self.angVel * 0.35, -1, 1);
    cmd.throttle = Math.abs(err) > 1.2 ? 0.15 : 0.3 + 0.7 * Math.max(0, Math.cos(err));
  }
}

// point the car along world angle a and go, forwards or backwards, whichever is quicker
function bolt(self, cmd, a) {
  const fwd = Math.cos(a - self.heading) >= -0.2;
  const err = angDiff(fwd ? a : a + PI, self.heading);
  cmd.steer = clamp(err * 2.8 - self.angVel * 0.4, -1, 1);
  cmd.throttle = fwd ? 1 : -1;
  cmd.brake = 0;
}

// blasts first, then being wedged, then holes and lava
function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);

  // a keg rolling our way: get off its line; a keg or shell about to burst beside us: get out of its circle
  let dodge = null, soon = 9;
  for (const b of state.bombs) {
    const sp = Math.hypot(b.vx, b.vy), rx = s.x - b.x, ry = s.y - b.y, dist = Math.hypot(rx, ry);
    if (sp < 1.5) {
      if (dist < b.r + s.radius + 1.2 && b.fuse < soon) { soon = b.fuse; dodge = Math.atan2(ry, rx); }
      continue;
    }
    const vx = b.vx / sp, vy = b.vy / sp, along = rx * vx + ry * vy, side = -rx * vy + ry * vx;   // side > 0: we are left of its path
    if (along < -1.5 || Math.abs(side) > s.radius + 3.4) continue;
    const tStop = Math.min(b.fuse, sp / 3), roll = sp * tStop - 1.5 * tStop * tStop;
    if (along - roll > b.r + s.radius + 1.5) continue;                                         // it will stop and burst well short
    if (b.fuse < soon) {
      soon = b.fuse;
      // off its line, to whichever side has the room; crossing in front of it only if we are almost on the line
      const base = Math.atan2(vy, vx), near = Math.abs(side) < 0.6;
      let bs = -Infinity;
      for (const off of [1.15, -1.15, 1.6, -1.6, 2.1, -2.1]) {
        const free = freeRun(nav, s.x, s.y, base + off, 7, 1.4);
        let sc = Math.min(free, 7) + 2 * Math.abs(Math.sin(off)) - 0.5 * Math.abs(angDiff(base + off, s.heading));
        if (!near && (off > 0) !== (side > 0)) sc -= 4;
        if (sc > bs) { bs = sc; dodge = base + off; }
      }
    }
  }
  for (const p of state.projectiles) {
    if (!p.landsAt || p.landsIn > 1.6) continue;
    const rx = s.x - p.landsAt.x, ry = s.y - p.landsAt.y, dist = Math.hypot(rx, ry);
    if (dist < 2 + s.radius + 0.6 && p.landsIn < soon) {
      soon = p.landsIn;
      // straight out of the circle, or straight on if we are in the middle of it
      dodge = dist > 0.4 ? Math.atan2(ry, rx) : s.heading;
      if (Math.abs(angDiff(dodge, s.heading)) > PI / 2 && dist < 1.2) dodge = s.heading;
    }
  }
  if (dodge !== null) bolt(s, cmd, dodge);

  // wedged against something (asked to move for a second and a half and got nowhere): back straight out,
  // then leave by a planned route rather than by eye
  if (Math.abs(cmd.throttle) > 0.4 && !(cmd.brake > 0)) wantMove += cmd.throttle > 0 ? 1 : -1;
  if (state.t - chkT >= 1.5) {
    if (Math.abs(wantMove) >= 20 && Math.hypot(s.x - chkX, s.y - chkY) < 0.7 && state.t >= unstickUntil) {
      jams++;
      unstickUntil = state.t + 0.7; unstickThr = (wantMove > 0 ? -1 : 1) * (jams % 3 === 0 ? -1 : 1);
      planUntil = state.t + 3.5;
    }
    chkT = state.t; chkX = s.x; chkY = s.y; wantMove = 0;
  }
  if (state.t < unstickUntil) { cmd.throttle = unstickThr; cmd.steer = 0; cmd.brake = 0; }

  const vf = s.vx * c + s.vy * n;
  if (M.lava) {
    if (s.tile === 'lava') {
      // standing in it: out by the shortest way
      let bd = 99, ba = s.heading;
      for (let i = 0; i < 12; i++) {
        const a = i * (PI / 6);
        for (const r of [1, 2, 3, 4.5]) {
          const px = s.x + Math.cos(a) * r, py = s.y + Math.sin(a) * r;
          if (!nav.isOpen(px, py)) break;
          if (nav.tileAt(px, py) !== 'lava') { if (r < bd) { bd = r; ba = a; } break; }
        }
      }
      bolt(s, cmd, ba);
      return cmd;
    }
    for (const k of [0.12, 0.25, 0.4]) {
      if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'lava') continue;
      cmd.throttle = vf > 0 ? -1 : 1; cmd.brake = 1;
      return cmd;
    }
  }
  if (M.pit) for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = vf > 0 ? -1 : 1; cmd.brake = 1;
    return cmd;
  }
  // Close to the rim of a hole and drifting towards it (bullets, blasts, recoil and rams all push): get off it before
  // the speed check above notices at the last half metre. Nose or tail towards the hole: drive straight off along
  // our own axis. Hole alongside: turn away from it, rolling on if we were rolling.
  if (M.pit) {
    const cl = nav.clearance(s.x, s.y);
    if (cl.pit < 1.7) {
      let pa = null;
      for (let i = 0; i < 16 && pa === null; i++) {
        const a = i * (PI / 8);
        if (nav.tileAt(s.x + Math.cos(a) * (cl.pit + 0.3), s.y + Math.sin(a) * (cl.pit + 0.3)) === 'pit') pa = a;
      }
      if (pa !== null) {
        const px = Math.cos(pa), py = Math.sin(pa);
        const vn = s.vx * px + s.vy * py, ax = c * px + n * py, lat = c * py - n * px;   // drift towards it; nose towards it; it is on our left
        if (cl.pit < 0.8 || (vn > 0.05 && (cl.pit - 0.35) / vn < 0.9)) {
          if (Math.abs(ax) > 0.35) { cmd.throttle = ax > 0 ? -1 : 1; cmd.brake = 0; }
          else {
            const roll = Math.abs(vf) > 1 ? Math.sign(vf) : (Math.sign(cmd.throttle || 0) || 1);
            cmd.steer = (lat > 0 ? -1 : 1) * roll;
            cmd.throttle = roll * (Math.abs(vf) > 1 ? 1 : 0.4); cmd.brake = 0;
          }
          return cmd;
        }
      }
    }
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir && M.pit) for (const dd of [0.4, 0.9, 1.4, 2.0]) for (const w of [-0.5, 0, 0.5]) {
    if (nav.tileAt(s.x + c * dd * dir - n * w, s.y + n * dd * dir + c * w) === 'pit') { cmd.throttle = 0; cmd.brake = 0.6; return cmd; }
  }
  if (dir && M.lava) for (const dd of [0.5, 1.0, 1.4]) {
    if (nav.tileAt(s.x + c * dd * dir, s.y + n * dd * dir) === 'lava') { cmd.throttle = 0; cmd.brake = 0.6; return cmd; }
  }
  return cmd;
}
