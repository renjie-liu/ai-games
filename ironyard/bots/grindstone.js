// GRINDSTONE — tracked laser wall. Four lasers behind a row of slopes (beams ignore the slopes
// and armour the other gun cars hide behind), the cockpit sunk into the chassis under an armour
// lid with a second armour block behind it, two reactors and a battery to keep the beams lit, on a
// pair of track units that hang off the core from the front AND from a rear chassis row, so drilling
// one column no longer drops a whole side of the car.
// It reads the other car stud by stud and works out what a beam from where it stands will
// actually hit: through the cockpit, by stripping the guns (preferred against gun batteries), or by
// taking the legs off a brawler (or the pads off a hover craft), whichever is cheapest. It picks its
// range from what the enemy carries, rushes cars that outrange it, routes round lava, holes and walls
// instead of freezing in front of them, backs off a harpoon, steps round mines, dodges shells and kegs.
// In teams every car names the enemy it is on and prefers one a teammate already shoots.
const meta = { name: 'Grindstone', author: 'Opus', model: 'Opus', notes: 'Tracked four-laser wall behind slopes: sunk cockpit, tracks tied in front and rear, beams through armour at whatever stud ends the fight soonest.' };

const design = (ctx, api) => api.util.blueprint('Grindstone', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  /^ /^ /^ /^ /^ .  .',
    '.  .  L^ L^ .  L^ L^ .  .',
    '.  .  .  a  a  e  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  :  :  :  :  :  .  .',
    '.  .  :  q  q  q  :  .  .',
    '.  .  T  r  @  r  T  .  .',
    '.  .  q> :  a  q> :  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'sand' } });

let lastFocus = -1;
let route = null, stuckT = 0, lastThr = 0, routeUntil = -1, lastSteer = 0, wedgeT = 0, escapeUntil = -1, escDir = -1;
const MELEE = { saw: 1, spike: 1, plow: 1, piston: 1, harpoon: 1 };

function profile(foe) {
  const p = { kegs: 0, flame: 0, melee: 0, guns: 0, hover: 0, far: 0 };
  for (const q of foe.parts || []) {
    if (!q.alive) continue;
    if (q.type === 'keg') p.kegs++;
    else if (q.type === 'flamer') p.flame++;
    else if (MELEE[q.type]) p.melee++;
    else if (q.type === 'hover') p.hover++;
    else if (q.type === 'cannon' || q.type === 'railgun' || q.type === 'missile' || q.type === 'mortar') { p.guns++; p.far++; }
    else if (q.type === 'mg' || q.type === 'cannon' || q.type === 'railgun' || q.type === 'laser' || q.type === 'missile' || q.type === 'mortar') p.guns++;
  }
  return p;
}

// ── targeting: which stud of the enemy does a burst from here actually meet? ──
const DIRA = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 };
const WEAP = { mg: 1, cannon: 1, railgun: 1, laser: 1, missile: 1, mortar: 1, flamer: 1, harpoon: 1, saw: 1, piston: 1, spike: 0.4, plow: 0.4 };
const THREAT = { cannon: 3, railgun: 3, laser: 3, missile: 2.5, mortar: 2, flamer: 2, mg: 1, saw: 1.5, piston: 1.5, harpoon: 2.5, spike: 0.4, plow: 0.4 };
const MOVE = { wheel: 1, bigwheel: 1, track: 1, hover: 1, thruster: 0.5 };
let gridCache = { id: -1, tick: -1, deck: null, chas: null };

function buildGrid(foe, api) {
  const deck = new Array(99).fill(null), chas = new Array(99).fill(null);
  for (const p of foe.parts) {
    if (!p.alive) continue;
    const def = api.parts[p.type] || {};
    const sz = def.size || [1, 1];
    const w = p.dir === 'E' || p.dir === 'W' ? sz[1] : sz[0], l = p.dir === 'E' || p.dir === 'W' ? sz[0] : sz[1];
    const g = p.z === 1 ? deck : chas;
    for (let j = 0; j < l; j++) for (let i = 0; i < w; i++) {
      const cx = p.x + i, cy = p.y + j;
      if (cx < -4 || cx > 4 || cy < -5 || cy > 5) continue;
      g[(cy + 5) * 9 + cx + 4] = p;
    }
  }
  return { deck, chas };
}

function partWorth(p, foe, counts, api) {
  const t = p.type;
  if (t === 'core') return 6;
  if (t === 'keg') return 3;
  if (WEAP[t]) return 2 * WEAP[t] * (counts.w <= 2 ? 1.5 : 1);
  if (MOVE[t]) return 1.2 * MOVE[t] * (counts.m <= 3 ? 1.6 : 1) * (t === 'hover' ? 1.5 : 1);
  if (t === 'reactor') return 1.1;
  if (t === 'shieldgen' || t === 'repairer') return 1.2;
  if (t === 'battery') return 0.5;
  return 0.15;
}

function effMul(p, shotAng, foe, api) {
  const def = api.parts[p.type] || {};
  let m = 1;
  if (def.deflect && Math.cos(shotAng - (foe.heading + (DIRA[p.dir] || 0))) < -0.5) m *= def.deflect;
  const raw = 4 * m;
  const a = def.armor || 0;
  return a ? Math.max(raw * 0.25, raw - a) / 4 : m;
}

// Where to put the next burst. Three ways to finish a car: through the cockpit, by stripping
// every weapon, or (hover craft) by knocking out enough pads to drop it. Cost each one in
// effective hit points along the line a bullet from here would really take, pick the cheapest.
function pickTarget(self, foe, api, tick, beam) {
  const core = foe.parts.find((p) => p.type === 'core' && p.alive);
  if (!core) return null;
  if (gridCache.id !== foe.id || gridCache.tick !== tick) gridCache = { id: foe.id, tick, ...buildGrid(foe, api) };
  const { deck, chas } = gridCache;
  const fx = Math.cos(foe.heading), fy = Math.sin(foe.heading), rx = fy, ry = -fx;   // forward, right
  const toLocal = (px, py) => { const dx = px - core.wx, dy = py - core.wy; return [(dx * rx + dy * ry) / 0.4 + core.x, (dx * fx + dy * fy) / 0.4 + core.y]; };
  const gx = self.x + Math.cos(self.heading) * 0.8, gy = self.y + Math.sin(self.heading) * 0.8;
  const [ax, ay] = toLocal(gx, gy);
  const rayCost = (T) => {
    const [tx, ty] = toLocal(T.wx, T.wy);
    const L = Math.hypot(tx - ax, ty - ay);
    if (L < 1e-3) return 1e9;
    const ux = (tx - ax) / L, uy = (ty - ay) / L, shotAng = Math.atan2(T.wy - gy, T.wx - gx);
    let cost = 0, last = -1;
    const add = (p) => {
      const hp = (p.hpFrac ?? 1) * ((api.parts[p.type] || {}).hp || 100);
      cost += hp / (beam ? 1 : Math.max(0.05, effMul(p, shotAng, foe, api)));
    };
    for (let s = Math.max(0, L - 16); s <= L + 0.4; s += 0.3) {
      const cx = Math.round(ax + ux * s), cy = Math.round(ay + uy * s);
      if (cx < -4 || cx > 4 || cy < -5 || cy > 5) continue;
      const k = (cy + 5) * 9 + cx + 4;
      if (k === last) continue;
      last = k;
      const d = deck[k], c = chas[k];
      if (d === T || c === T) { if (d && d !== T) add(d); add(T); return cost; }
      if (d) add(d);
      if (c) add(c);
    }
    add(T);
    return cost;
  };
  let pick = core, bestCost = rayCost(core);
  // strip the weapons
  let dsum = 0, dmin = 1e9, dT = null, nW = 0;
  for (const p of foe.parts) {
    if (!p.alive || !WEAP[p.type]) continue;
    const c = rayCost(p);
    nW++; dsum += c;
    // the gun that hurts us most per hit point in the way: shells and beams get through our slopes, bullets mostly do not
    const cw = c / (THREAT[p.type] || 1);
    if (cw < dmin) { dmin = cw; dT = p; }
  }
  // gun batteries (4+ guns, nothing that only hurts by touch): stripping the guns is usually the quicker kill
  const sk = foe.parts.filter((p) => WEAP[p.type] >= 1).length >= 4 && !foe.parts.some((p) => p.alive && MELEE[p.type]) ? 0.45 : 0.6;
  if (dT && dsum * sk < bestCost) { bestCost = dsum * sk; pick = dT; }
  // take its legs away: worth it against cars that can only hurt what they touch
  const pr = profile(foe), shortReach = pr.flame + pr.melee > pr.guns;
  let msum = 0, mmin = 1e9, mT = null;
  for (const p of foe.parts) {
    if (!p.alive || !MOVE[p.type]) continue;
    const c = rayCost(p);
    msum += c;
    if (c < mmin) { mmin = c; mT = p; }
  }
  if (mT && msum * (shortReach ? 0.6 : 1.6) < bestCost) { bestCost = msum * (shortReach ? 0.6 : 1.6); pick = mT; }
  // drop a hover craft
  if (foe.hovering) {
    const pads = foe.parts.filter((p) => p.alive && p.type === 'hover').map((p) => ({ p, c: rayCost(p) })).sort((a, b) => a.c - b.c);
    const keep = Math.ceil(foe.mass / 75) - 1, need = pads.length - keep;
    if (need > 0) {
      let h = 0;
      for (let i = 0; i < need; i++) h += pads[i].c;
      if (h * 0.5 < bestCost) { bestCost = h * 0.5; pick = pads[0].p; }
    }
  }
  return { x: pick.wx, y: pick.wy, type: pick.type };
}

let hasLava = null, hasPit = null;

// how far (m, capped at 6) from (x, y) to the nearest hole or lava pool
function hazardDist(api, x, y) {
  const nav = api.nav;
  let d = 6;
  if (hasPit) d = Math.min(d, nav.clearance(x, y).pit);
  if (hasLava) {
    const t0 = nav.tileAt(x, y);
    if (t0 === 'lava') return 0;
    for (let r = 1; r <= 4 && r < d; r += 1) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (nav.tileAt(x + Math.cos(a) * r, y + Math.sin(a) * r) === 'lava') { d = Math.min(d, r - 0.5); break; }
    }
  }
  return d;
}

// best nearby place to stand: away from holes and lava, not into walls
function saferSpot(self, api, from) {
  const nav = api.nav;
  let best = null, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = self.x + Math.cos(a) * 2.5, y = self.y + Math.sin(a) * 2.5;
    if (!nav.isOpen(x, y)) continue;
    let sc = hazardDist(api, x, y) * 2 + Math.min(nav.clearance(x, y).wall, 2);
    if (from) { const d = Math.hypot(x - from.x, y - from.y); sc += Math.min(d, 10) * 0.15; }
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  return best;
}

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower({ mudCost: 1.3, iceCost: 1.2, lavaCost: 400 });
  if (hasLava === null) {
    const rows = api.map.rows || [];
    hasLava = rows.some((r) => r.includes('L'));
    hasPit = rows.some((r) => r.includes('_')) || true;
  }
  const cmd = { throttle: 0, steer: 0, fire: false };
  stuckT = Math.abs(lastThr) > 0.5 && self.speed < 0.3 ? stuckT + state.dt : 0;
  // wedged: asking to turn or creep but neither moving nor turning (nose against a wall or crate)
  wedgeT = self.speed < 0.3 && Math.abs(self.angVel || 0) < 0.25 && (Math.abs(lastSteer) > 0.5 || Math.abs(lastThr) > 0.15) ? wedgeT + state.dt : 0;
  if (wedgeT > 1.0) {
    escapeUntil = state.t + 0.7; wedgeT = 0;
    const hc = Math.cos(self.heading), hs = Math.sin(self.heading), r = self.radius + 0.8;
    const fOk = nav.isOpen(self.x + hc * r, self.y + hs * r), bOk = nav.isOpen(self.x - hc * r, self.y - hs * r);
    escDir = fOk && !bOk ? 1 : -1;
  }

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  // team play: follow a teammate's call, and make the call when we are the lowest living slot
  const allies = (state.allies || []).filter((a) => a.alive !== false && a.id !== self.id);
  if (allies.length && state.enemies.length) {
    // everybody names the car it is shooting; a car others already shoot is worth 5 m of driving
    let pick = null, ps = Infinity;
    for (const e of state.enemies) {
      let sc = U.dist(self, e) + (e.coreFrac ?? 1) * 6;
      for (const m of state.messages || []) if (m.data && m.data.focus === e.id && U.dist(self, e) < 20) sc -= 5;
      if (e.id === lastFocus) sc -= 3;
      if (sc < ps) { ps = sc; pick = e; }
    }
    if (pick && !(best < 4.5 && pick !== foe)) { foe = pick; best = U.dist(self, pick); }
    lastFocus = foe ? foe.id : -1;
    if (foe) cmd.say = { focus: foe.id };
  }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  // a repair kit when hurt, any item when it is close and the fight is not
  let item = null, ib = Infinity;
  for (const i of state.items) {
    const d = U.dist(self, i);
    const far = !foe || best > 14;
    const want = i.type === 'repair' ? (self.hpFrac < 0.6 ? 30 : far ? 12 : 6) : i.type === 'overdrive' || i.type === 'emp' ? (far ? 14 : 6) : i.type === 'shield' ? (far ? 10 : 6) : 3;
    if (d < want && d < ib) { ib = d; item = i; }
  }
  if (item && (!foe || best > 10 || item.type === 'repair')) goal = item;
  const zd = U.dist(self, state.zone);
  if (zd > state.zone.r - 3) {
    // into the safe circle, but not to its very centre (sumo has a hole there)
    const k = Math.max(0, state.zone.r * 0.5) / (zd || 1);
    goal = { x: state.zone.x + (self.x - state.zone.x) * k, y: state.zone.y + (self.y - state.zone.y) * k };
  }

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    const tp = pickTarget(self, foe, api, state.tick) || foe;
    const mark = { x: tp.x, y: tp.y, vx: foe.vx, vy: foe.vy };
    {
      // lead the piece itself: the hull moves and turns while the bullets fly
      const ox = tp.x - foe.x, oy = tp.y - foe.y, w = foe.angVel || 0;
      let tt = Math.hypot(tp.x - self.x, tp.y - self.y) / 28;
      let px = tp.x, py = tp.y;
      for (let k = 0; k < 2; k++) {
        const c = Math.cos(w * tt), sn = Math.sin(w * tt);
        px = foe.x + foe.vx * tt + ox * c - oy * sn; py = foe.y + foe.vy * tt + ox * sn + oy * c;
        tt = Math.hypot(px - self.x, py - self.y) / 28;
      }
      cmd.aim = { x: px, y: py };
      cmd.aim.angle = Math.atan2(cmd.aim.y - self.y, cmd.aim.x - self.x);
    }
    cmd.fire = false;
    if (los) {
      const lasers = self.weapons.filter((w) => w.alive && w.type === 'laser');
      if (lasers.length) {
        const bp = pickTarget(self, foe, api, state.tick, true) || foe;
        cmd.aims = {};
        for (const w of lasers) cmd.aims[w.i] = { x: bp.x + foe.vx * 0.05, y: bp.y + foe.vy * 0.05 };
      }
      cmd.fire = self.weapons.filter((w) => w.alive && d < w.range + foe.radius * 0.8).map((w) => w.i);
    }
    // a powder barrel next to them and well away from us and ours: set it off
    for (const b of state.barrels || []) {
      const db = U.dist(self, b);
      if (db < 5 || db > 12 || U.dist(foe, b) > 2.6) continue;
      if (allies.some((a) => U.dist(a, b) < 5)) continue;
      const ex = b.x - (b.x - self.x) / db * 0.9, ey = b.y - (b.y - self.y) / db * 0.9;
      if (!nav.los(self.x, self.y, ex, ey)) continue;
      cmd.aim = { x: b.x, y: b.y, angle: Math.atan2(b.y - self.y, b.x - self.x) }; cmd.aims = undefined;
      cmd.fire = self.weapons.filter((w) => w.alive && db < w.range).map((w) => w.i);
      break;
    }
    if (self.item && self.item.type === 'emp' && d < 6.5) cmd.useItem = true;
    if (self.item && self.item.type === 'mine' && d < 6) cmd.useItem = true;
    if (goal === foe && los && d < 15) {
      const pr = profile(foe);
      let lo = allies.length ? 4.5 : 3.5, hi = allies.length ? 9 : 8.5;
      const legs = foe.parts.some((q) => q.alive && MOVE[q.type]);
      if (!legs && pr.flame + pr.melee > pr.guns) { lo = 8; hi = 11; }
      else if (pr.kegs) { lo = 0; hi = 3; }
      else if (pr.far && pr.far * 2 >= pr.guns && !pr.flame) { lo = 0; hi = 4; }   // it outranges our lasers: get inside its guns
      else if (pr.flame) { lo = 8; hi = 12; }
      else if (pr.melee && pr.melee >= pr.guns) { lo = 6; hi = 10; }
      const t = U.turnTo(self, cmd.aim.angle);
      cmd.steer = t.steer;
      const err = Math.abs(U.angDiff(cmd.aim.angle, self.heading));
      cmd.throttle = d > hi ? (err < 0.6 ? 1 : 0.2) : d < lo ? -0.8 : 0;
      // hooked by a harpoon: back straight off, guns still on it; tracks out-pull most cars
      const hooked = (state.tethers || []).some((t) => t.to === self.id && t.from === foe.id);
      if (hooked && (pr.melee || pr.flame)) cmd.throttle = -1;
      // do not fight with a hole or lava at our back or under our feet
      const here = hazardDist(api, self.x, self.y);
      const need = self.radius + 1.6;
      const ux = (self.x - foe.x) / (d || 1), uy = (self.y - foe.y) / (d || 1);
      const back = hazardDist(api, self.x + ux * 2.5, self.y + uy * 2.5);
      if (d < 5.5 && back < need + 1) {
        cmd.throttle = err < 1.2 ? 1 : 0; cmd.brake = 1;   // shoved toward a hole: dig in and shove back
      } else if (here < need && !(d > hi && here > 1.2)) {
        const spot = saferSpot(self, api, foe);
        if (spot && hazardDist(api, spot.x, spot.y) > here) {
          const dr = U.driveTo(self, spot, { reverse: true });
          cmd.throttle = dr.throttle; cmd.steer = dr.steer; cmd.brake = 0;
        }
      } else if (cmd.throttle) {
        const dir = Math.sign(cmd.throttle), look = 1.2 + self.speed * 0.6;
        const nx = self.x + Math.cos(self.heading) * dir * look, ny = self.y + Math.sin(self.heading) * dir * look;
        if (hazardDist(api, nx, ny) < need) {
          cmd.throttle = 0;
          // closing in but a hole or lava is in the way: take the route round it instead of freezing
          if (dir > 0 && d > hi) {
            const wp = route.next(self, foe.x, foe.y, state.tick);
            Object.assign(cmd, U.driveTo(self, wp));
          }
        }
      }
      // the straight way in crosses lava or a hole, or a wall / barrier stands in it: go round instead
      if (cmd.throttle > 0 && d > hi) {
        const nx = self.x + Math.cos(self.heading) * 3, ny = self.y + Math.sin(self.heading) * 3;
        if (stuckT > 0.8) routeUntil = state.t + 2.5;
        if (state.t < routeUntil || hazardDist(api, nx, ny) < 1 || here < need) {
          const wp = route.next(self, foe.x, foe.y, state.tick);
          Object.assign(cmd, U.driveTo(self, wp));
        }
      }
      if (state.t < escapeUntil) { cmd.throttle = escDir; cmd.steer = 0; cmd.brake = 0; }
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}

function bad(nav, x, y) { const t = nav.tileAt(x, y); return t === 'pit' || t === 'lava'; }

function guard(state, api, cmd) {
  const out = guard0(state, api, cmd);
  lastThr = out.throttle || 0; lastSteer = out.steer || 0;
  return out;
}

function guard0(state, api, cmd) {
  const U = api.util, s = state.self, nav = api.nav;
  // shells about to land and kegs on the ground: try full ahead, stop, full astern (and a hard
  // turn each way) over the next second or two, and keep the one that leaves the most room.
  const threats = [];
  for (const p of state.projectiles || []) if (p.landsAt && p.landsIn < 2.5) threats.push({ k: 0, x: p.landsAt.x, y: p.landsAt.y, t: p.landsIn, r: 2 });
  for (const b of state.bombs || []) if (Math.hypot(b.x - s.x, b.y - s.y) < 14) threats.push({ k: 1, b });
  if (threats.length) {
    const hx = Math.cos(s.heading), hy = Math.sin(s.heading);
    const v0 = s.vx * hx + s.vy * hy, top = 6.5, R = s.radius;
    const sim = (thr, st) => {
      // returns the worst clearance over the threats for this command
      let worst = 1e9;
      let x = s.x, y = s.y, v = v0, th = s.heading;
      const dt = 0.1;
      const pos = [];
      for (let i = 0; i <= 25; i++) {
        pos.push([x, y]);
        const acc = thr > 0 ? 7 * thr : thr < 0 ? 5 * thr : -Math.sign(v) * Math.min(Math.abs(v) / dt, 4);
        v = Math.max(-top * 0.7, Math.min(top, v + acc * dt));
        th += st * 1.8 * dt;
        x += Math.cos(th) * v * dt; y += Math.sin(th) * v * dt;
      }
      for (const q of threats) {
        if (q.k === 0) {
          const i = Math.min(25, Math.round(q.t / dt));
          const m = Math.hypot(pos[i][0] - q.x, pos[i][1] - q.y) - q.r - R;
          worst = Math.min(worst, m);
        } else {
          const b = q.b;
          let bx = b.x, by = b.y, bvx = b.vx, bvy = b.vy, m = 1e9;
          for (let i = 0; i <= 25; i++) {
            const t = i * dt;
            if (t > b.fuse) break;
            const dd = Math.hypot(pos[i][0] - bx, pos[i][1] - by);
            if (dd < R + 0.7) { m = Math.min(m, dd - b.r - R); break; }          // touches us: goes off on us
            if (t + dt > b.fuse) m = Math.min(m, dd - b.r - R * 0.6);              // fuse runs out here
            const sp = Math.hypot(bvx, bvy);
            if (sp > 0.01) { const k = Math.max(0, sp - 3 * dt) / sp; bvx *= k; bvy *= k; }
            bx += bvx * dt; by += bvy * dt;
          }
          if (m < 1e8) worst = Math.min(worst, m);
        }
        if (bad(nav, pos[10][0], pos[10][1])) worst -= 50;
      }
      return worst;
    };
    const want = Math.sign(cmd.throttle || 0);
    const base = sim(cmd.throttle || 0, cmd.steer || 0);
    if (base < 0.6) {
      let bestC = null, bs = base;
      for (const thr of [1, 0, -1]) for (const st of [0, 1, -1]) {
        const sc = sim(thr, st) + (thr === want ? 1.0 : 0) + (st === 0 ? 0.2 : 0);
        if (sc > bs + 0.25) { bs = sc; bestC = [thr, st]; }
      }
      if (bestC) { cmd.throttle = bestC[0]; cmd.steer = bestC[1]; cmd.brake = 0; }
    }
  }
  if (s.hovering) return cmd;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  // an enemy mine on the line we are about to drive: swerve round it
  const mv = Math.sign(cmd.throttle || 0);
  if (mv) for (const m of state.mines || []) {
    const dx = m.x - s.x, dy = m.y - s.y, ahead = (dx * c + dy * n) * mv, side = -dx * n + dy * c;
    if (ahead > 0 && ahead < 4.5 && Math.abs(side) < s.radius + 0.9) {
      // driving on: swerve round it. Creeping while turning: just do not creep onto it (keep our steering)
      if (Math.abs(cmd.throttle) >= 0.5) cmd.steer = (side > 0 ? -1 : 1) * mv;
      else if (ahead < s.radius + 1.2) cmd.throttle = 0;
      break;
    }
  }
  for (const k of [0.15, 0.3, 0.5, 0.8]) {
    if (!bad(nav, s.x + s.vx * k, s.y + s.vy * k) || bad(nav, s.x, s.y)) continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1;
    return cmd;
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir && !bad(nav, s.x, s.y)) {
    const at = (d, w) => bad(nav, s.x + c * d * dir - n * w, s.y + n * d * dir + c * w);
    for (const d of [0.3, 0.7, 1.1, 1.7, 2.3]) if (at(d, 0)) { cmd.throttle = 0; return cmd; }
    // a hole or lava only off one side: keep going, edge away from it instead of freezing on the rim
    let L = false, R = false;
    for (const d of [0.3, 0.7, 1.1, 1.7, 2.3]) { if (at(d, 0.5)) L = true; if (at(d, -0.5)) R = true; }
    if (L && R) { cmd.throttle = 0; return cmd; }
    if (L || R) {
      if (dir > 0) { cmd.steer = L ? -0.8 : 0.8; cmd.throttle = Math.min(cmd.throttle, 0.6); }
      else cmd.throttle = 0;
    }
  }
  return cmd;
}

