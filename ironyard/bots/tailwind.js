// Tailwind — a rear-battery kiter. It drives away from the fight and lets six
// stern machine guns do the work, drilling straight at the enemy core: one
// column of shielding stripped at a time, then the core itself. Slopes shield
// the guns, the core sleeps on the chassis under an armour lid, three
// reactors keep the battery fed. Author: Renjie Liu. Written by Muse
// (Muse Spark).
const meta = {
  name: 'Tailwind',
  author: 'Renjie Liu',
  model: 'Muse Spark',
  notes: 'Rear-facing six-gun battery on monster wheels; core-only aim, matchup range control, barrel sniping.',
};

const design = (ctx, api) => {
  const p = [];
  const add = (type, x, y, z, dir) => p.push({ type, x, y, z, ...(dir ? { dir } : {}) });
  const budget = ctx && ctx.budget ? ctx.budget : 1200;

  if (budget < 1100) {
    // Light trim: smaller floor, plain wheels, four guns.
    for (const [x, y] of [[-3, -3], [-1, -3], [1, -3]]) add('plate4', x, y, 0);
    for (const [x, y] of [[-1, -1], [0, -1], [-1, 0]]) add('plate', x, y, 0);
    add('core', 0, 0, 0);
    for (const x of [-4, 3]) for (const y of [-2, 0]) add('wheel', x, y, 0);
    for (let x = -1; x <= 2; x++) add('slope', x, -2, 1, 'S');
    for (let x = -1; x <= 2; x++) add('mg', x, -1, 1, 'S');
    for (const x of [-1, 1]) add('reactor', x, 0, 1);
    add('armor', 0, 0, 1);
    return { name: 'Tailwind Light', paint: { accent: 'lime' }, parts: p };
  }

  // Standard hull: 6 wide x 4 deep floor, core amidships on the chassis.
  for (const y of [-3, -1]) for (const x of [-3, -1, 1]) {
    if (x === -1 && y === -1) continue;
    add('plate4', x, y, 0);
  }
  for (const [x, y] of [[-1, -1], [0, -1], [-1, 0]]) add('plate', x, y, 0);
  add('core', 0, 0, 0);
  for (const x of [-4, 3]) for (const y of [-2, 0]) add('bigwheel', x, y, 0);
  // Stern battery: a glacis of slopes behind six machine guns, all facing S.
  for (let x = -2; x <= 3; x++) add('slope', x, -2, 1, 'S');
  for (let x = -2; x <= 3; x++) add('mg', x, -1, 1, 'S');
  for (const x of [-2, -1, 1]) add('reactor', x, 0, 1);
  add('armor', 0, 0, 1);

  if (budget >= 1500) {
    add('mg', -3, -1, 1, 'S');
    add('slope', -3, -2, 1, 'S');
    add('reactor', 3, 0, 1);
    add('shieldgen', 2, 0, 1);
    add('plate4', -1, 1, 0);
    add('repairer', 0, 1, 1);
    add('armor', 0, 2, 1);
    add('radar', 0, -3, 1);
  }
  return { name: 'Tailwind', paint: { accent: 'azure' }, parts: p };
};

// ── controller ─────────────────────────────────────────────────────────────
let route = null;
let lockId = -1, markI = -1;
let jamStart = 0, jamX = 0, jamY = 0, unstuckUntil = 0;
const PI = Math.PI;
const DIRA = { N: 0, S: PI, E: -PI / 2, W: PI / 2 };
const WEAP = { mg: 1, cannon: 1, laser: 1, railgun: 1, missile: 1, mortar: 1, saw: 1, piston: 1, flamer: 1, harpoon: 1 };
const MOV = { wheel: 1, bigwheel: 1, track: 1, hover: 1, thruster: 1 };
const MELEE = { saw: 1, piston: 1, spike: 1, plow: 1, flamer: 1, harpoon: 1 };

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function diff(a, b) { return (a - b + 3 * PI) % (2 * PI) - PI; }

function classify(e) {
  let melee = 0, keg = 0, mortar = 0, rail = 0, guns = 0;
  for (const p of e.parts) {
    if (!p.alive) continue;
    if (MELEE[p.type]) melee++;
    if (p.type === 'keg') keg++;
    if (p.type === 'mortar') mortar++;
    if (p.type === 'railgun') rail++;
    if (WEAP[p.type] && !MELEE[p.type]) guns++;
  }
  return { melee, keg, mortar, rail, guns };
}

// Effective hit points of one enemy piece against kinetic fire, as seen by a
// shooter at (sx, sy): armour soaks, a slope facing the shot ricochets.
function effHp(p, foe, sx, sy, api) {
  const def = api.parts[p.type];
  let face = 1;
  if (p.type === 'slope') {
    const fa = foe.heading + (DIRA[p.dir] || 0);
    const back = Math.atan2(sy - p.wy, sx - p.wx);
    if (Math.cos(diff(fa, back)) > 0.5) face = 0.45;
  }
  const denom = Math.max(0.2, face - (def.armor || 0) / 4);
  return (p.hp != null ? p.hp : def.hp) / denom;
}

// Variant A: aim straight at the enemy core and nowhere else. Drilling one
// column strips whatever shields it, then the core itself; the battery never
// wastes shots spraying the whole car.
function pickAim(s, foe, api) {
  for (const q of foe.parts) {
    if (q.alive && q.type === 'core') { markI = q.i; return q; }
  }
  return null;
}

// Lead a moving, turning target part at machine-gun shot speed.
function leadPart(s, foe, part) {
  const ox = part.wx - foe.x, oy = part.wy - foe.y;
  const vx = foe.vx || 0, vy = foe.vy || 0, w = foe.angVel || 0;
  let tt = Math.hypot(part.wx - s.x, part.wy - s.y) / 28;
  let aim = { x: part.wx, y: part.wy };
  for (let i = 0; i < 2; i++) {
    const a = w * tt, c = Math.cos(a), n = Math.sin(a);
    aim = { x: foe.x + vx * tt + ox * c - oy * n, y: foe.y + vy * tt + ox * n + oy * c };
    tt = Math.hypot(aim.x - s.x, aim.y - s.y) / 28;
  }
  return aim;
}

function safe(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const blast = api.util.threat(state);
  if (blast && blast.in < 1.5) Object.assign(cmd, api.util.driveTo(s, blast.away, { reverse: true }));
  const harmful = (x, y) => { const t = nav.tileAt(x, y); return t === 'pit' || t === 'lava'; };
  if (!harmful(s.x, s.y)) {
    const f = Math.cos(s.heading), g = Math.sin(s.heading);
    for (const k of [0.25, 0.55, 0.85]) {
      if (harmful(s.x + s.vx * k, s.y + s.vy * k)) {
        cmd.throttle = (s.vx * f + s.vy * g) > 0 ? -1 : 1;
        cmd.brake = 1;
        return cmd;
      }
    }
    const sign = Math.sign(cmd.throttle || 0);
    if (sign) for (const d of [0.7, 1.4, 2.3]) for (const w of [-0.45, 0, 0.45]) {
      if (harmful(s.x + sign * f * d - g * w, s.y + sign * g * d + f * w)) {
        cmd.throttle = 0;
        cmd.brake = 0.5;
        return cmd;
      }
    }
  }
  return cmd;
}

function tick(state, api) {
  const s = state.self, U = api.util, nav = api.nav;
  route = route || nav.follower({ mudCost: 1.6, iceCost: 2.0, lavaCost: 150 });
  const cmd = { throttle: 0, steer: 0, brake: 0, fire: false };

  // Target: nearest visible enemy, bent by focus calls and a weak core.
  let foe = null, fs = Infinity;
  for (const e of state.enemies) {
    let q = U.dist(s, e) + e.coreFrac * 3 + (nav.los(s.x, s.y, e.x, e.y) ? 0 : 6);
    if (e.id === lockId) q -= 3;
    for (const m of state.messages) if (m.data && m.data.focus === e.id) q -= 4;
    if (q < fs) { fs = q; foe = e; }
  }
  if (foe) {
    lockId = foe.id;
    const leader = state.allies.every(a => !a.alive || a.slot > s.slot);
    if (leader && state.allies.length) cmd.say = { focus: foe.id };
  }

  const z = state.zone, zd = U.dist(s, z);
  const out = zd > z.r - (z.shrinking ? 6 : 3.5);
  let d = foe ? U.dist(s, foe) : Infinity;
  let los = foe ? nav.los(s.x, s.y, foe.x, foe.y) : false;

  // On fire with a pad in reach: breaking off to douse beats burning down.
  const pad = state.pads && state.pads.length
    ? state.pads.filter(pp => pp.charge > 20).sort((a, b) => U.dist(s, a) - U.dist(s, b))[0] : null;
  if (pad && s.burning >= 2 && (!foe || d > 10)) {
    const wp = route.next(s, pad.x, pad.y, state.tick);
    Object.assign(cmd, U.driveTo(s, wp, { stopDist: 0.4 }));
    if (U.dist(s, pad) < 1.2) { cmd.throttle = 0; cmd.brake = 1; }
    return safe(state, api, cmd);
  }

  if (foe) {
    const cls = classify(foe);
    cmd.target = foe.id;
    // Repair-arm priority: a hurt ally alongside beats the lock.
    for (const a of state.allies) if (a.alive && a.hpFrac < 0.85 && U.dist(s, a) < 5.5) cmd.target = a.id;

    // Barrel sniping: a powder barrel beside the enemy is a free shell.
    let aimPoint = null;
    if (state.barrels) for (const b of state.barrels) {
      if (U.dist(b, foe) < 2.6 && U.dist(s, b) < 13.5 && d > 5 && nav.los(s.x, s.y, b.x, b.y)) { aimPoint = { x: b.x, y: b.y }; break; }
    }
    if (!aimPoint) {
      const part = pickAim(s, foe, api);
      aimPoint = part ? leadPart(s, foe, part) : U.lead(s, foe, 28);
    }
    cmd.aim = aimPoint;
    cmd.fire = los && d < 14;

    if (s.item) {
      if (s.item.type === 'emp' && d < 6.5) cmd.useItem = true;
      if (s.item.type === 'mine') {
        const behind = Math.abs(diff(U.angleTo(s, foe), s.heading)) > 2.2;
        if (behind && d < 5.5) cmd.useItem = true;
      }
    }

    if (los && d < 17) {
      // Fight tail-first: hold the range this matchup wants.
      let hold = 8.5;
      if (cls.melee) hold = 11;
      if (cls.keg) hold = 11.5;
      if (cls.mortar && !cls.melee && !cls.guns) hold = 5.5;
      if (cls.rail && !cls.melee) hold = 7.5;
      const away = U.angleTo(s, foe) + PI;
      const err = diff(away, s.heading);
      cmd.steer = clamp(err * 2.5 - s.angVel * 0.35, -1, 1);
      const ux = (foe.x - s.x) / (d || 1), uy = (foe.y - s.y) / (d || 1);
      const closing = (foe.vx - s.vx) * -ux + (foe.vy - s.vy) * -uy;
      cmd.throttle = clamp((hold + Math.max(0, closing) * 0.35 - d) * 0.5, -1, 1);
      if (Math.abs(err) > 1.1) cmd.throttle = clamp(cmd.throttle, -0.25, 0.4);
      if (Math.abs(cmd.throttle) < 0.12) cmd.brake = 0.7;
      if (cmd.throttle > 0) {
        const x = s.x + Math.cos(s.heading) * 3, y = s.y + Math.sin(s.heading) * 3;
        if (!nav.isOpen(x, y) || nav.tileAt(x, y) === 'lava') { cmd.throttle = 0; cmd.brake = 0.8; }
      }
      return safe(state, api, cmd);
    }
  }

  // Travel: last seen enemy, a useful pickup, or the middle of the zone.
  let goal = null;
  if (foe) goal = foe;
  else {
    let best = Infinity;
    for (const l of state.lastSeen) if (l.alive && U.dist(s, l) < best) { best = U.dist(s, l); goal = l; }
  }
  if (!goal || foe) {
    let ib = Infinity, item = null;
    for (const i of state.items) {
      const q = U.dist(s, i);
      const cap = i.type === 'repair' && s.hpFrac < 0.65 ? 22 : 6;
      if (q < cap && q < ib) { ib = q; item = i; }
    }
    if (item && !out && (!foe || d > 13 || item.type === 'repair')) goal = item;
  }
  if (!goal) goal = api.map.center;
  if (out) {
    const k = Math.max(0, z.r * 0.45) / (zd || 1);
    goal = { x: z.x + (s.x - z.x) * k, y: z.y + (s.y - z.y) * k };
  }
  const wp = route.next(s, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(s, wp));
  if (foe && los) cmd.fire = d < 14;

  // Unstuck: full throttle and no motion means a wall; back out and swing.
  if (state.t - jamStart > 1.2) {
    if (Math.hypot(s.x - jamX, s.y - jamY) < 0.5 && Math.abs(cmd.throttle) > 0.5) unstuckUntil = state.t + 0.8;
    jamStart = state.t; jamX = s.x; jamY = s.y;
  }
  if (state.t < unstuckUntil) { cmd.throttle = -1; cmd.steer = 1; }
  return safe(state, api, cmd);
}
