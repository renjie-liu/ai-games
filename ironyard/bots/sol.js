const meta = {
  name: 'Afterburner',
  author: 'Sol',
  model: 'gpt-6-sol',
  notes: 'Rear facing six gun battery on wide monster wheels; adjusts range to opposing weapons and keeps the cockpit below armor.',
};

const design = (ctx, api) => {
  const budget = ctx.budget;
  const p = [];
  const add = (type, x, y, z, dir) => p.push({ type, x, y, z, ...(dir ? { dir } : {}) });
  // The back of the vehicle is the gun side. Deck wedges take the first hits.
  for (const y of [-3, -1]) for (const x of [-3, -1, 1]) {
    if (x === -1 && y === -1) continue;
    add('plate4', x, y, 0);
  }
  for (const [x, y] of [[-1, -1], [0, -1], [-1, 0]]) add('plate', x, y, 0);
  add('core', 0, 0, 0);
  for (const x of [-4, 3]) for (const y of [-2, 0]) add('bigwheel', x, y, 0);
  if (budget >= 1200) {
    for (let x = -2; x <= 3; x++) add('slope', x, -2, 1, 'S');
    for (let x = -2; x <= 3; x++) add('mg', x, -1, 1, 'S');
    for (const x of [-2, -1, 1]) add('reactor', x, 0, 1);
    add('armor', 0, 0, 1);
  } else {
    for (const x of [-2, 0, 2]) add('slope', x, -2, 1, 'S');
    for (const x of [-2, -1, 0, 1]) add('mg', x, -1, 1, 'S');
    add('reactor', -2, 0, 1);
    add('plate', 0, 0, 1);
  }
  if (budget >= 1500) {
    add('mg', -3, -1, 1, 'S');
    add('slope', -3, -2, 1, 'S');
    add('reactor', -3, 0, 1);
    add('reactor', 3, 0, 1);
    add('shieldgen', 2, 0, 1);
    for (const x of [-1, 1]) add('plate4', x, 1, 0);
    add('armor', 0, 1, 1);
    add('armor', -1, 1, 1);
    add('armor', 1, 1, 1);
    add('repairer', 0, 2, 1);
  }
  return { name: 'Afterburner', paint: { accent: 'pink' }, parts: p };
};

let route = null;
let targetId = -1;
let jamStart = 0, jamX = 0, jamY = 0, unstuckUntil = 0;
const PI = Math.PI;
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function diff(a, b) { let d = (a - b + 3 * PI) % (2 * PI) - PI; return d; }
function rangeOf(e) {
  let gun = 0, close = 0, bomb = 0, mortar = 0;
  for (const p of e.parts) {
    if (!p.alive) continue;
    if (p.type === 'mg' || p.type === 'laser' || p.type === 'cannon' || p.type === 'railgun' || p.type === 'missile') gun++;
    if (p.type === 'saw' || p.type === 'piston' || p.type === 'spike' || p.type === 'plow' || p.type === 'flamer' || p.type === 'harpoon') close++;
    if (p.type === 'keg') bomb++;
    if (p.type === 'mortar') mortar++;
  }
  return { gun, close, bomb, mortar };
}
function safe(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const blast = api.util.threat(state);
  if (blast && blast.in < 1.5) Object.assign(cmd, api.util.driveTo(s, blast.away, { reverse: true }));
  if (s.hovering) return cmd;
  const f = Math.cos(s.heading), g = Math.sin(s.heading);
  const harmful = (x, y) => { const t = nav.tileAt(x, y); return t === 'pit' || t === 'lava'; };
  if (!harmful(s.x, s.y)) {
    for (const k of [0.25, 0.55, 0.85]) {
      if (harmful(s.x + s.vx * k, s.y + s.vy * k)) {
        cmd.throttle = s.vx * f + s.vy * g > 0 ? -1 : 1;
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
  route ??= nav.follower({ mudCost: 1.5, iceCost: 1.8, lavaCost: 120 });
  const cmd = { throttle: 0, steer: 0, brake: 0, fire: false };
  let foe = null, score = Infinity;
  for (const e of state.enemies) {
    const d = U.dist(s, e);
    const q = d + (e.id === targetId ? -3 : 0) + e.coreFrac * 3 + (nav.los(s.x, s.y, e.x, e.y) ? 0 : 6);
    if (q < score) { score = q; foe = e; }
  }
  targetId = foe ? foe.id : -1;
  if (foe && state.allies.length) {
    const leader = state.allies.every(a => !a.alive || a.slot > s.slot);
    if (leader) cmd.say = { focus: foe.id };
    else {
      const m = state.messages.find(m => m.data && m.data.focus !== undefined);
      const pick = m && state.enemies.find(e => e.id === m.data.focus);
      if (pick && U.dist(s, pick) < 22) foe = pick;
    }
  }
  let goal = foe;
  if (!goal) {
    let best = Infinity;
    for (const l of state.lastSeen) if (l.alive && U.dist(s, l) < best) { best = U.dist(s, l); goal = l; }
    goal ??= api.map.center;
  }
  const z = state.zone, zd = U.dist(s, z);
  const out = zd > z.r - (z.shrinking ? 6 : 3.5);
  if (out) {
    const k = Math.max(0, z.r * 0.45) / (zd || 1);
    goal = { x: z.x + (s.x - z.x) * k, y: z.y + (s.y - z.y) * k };
  }
  let d = Infinity, los = false;
  if (foe) {
    d = U.dist(s, foe);
    los = nav.los(s.x, s.y, foe.x, foe.y);
    const mark = foe.parts.find(p => p.type === "core" && p.alive) || foe;
    const tx = mark.wx ?? mark.x, ty = mark.wy ?? mark.y;
    const vx = foe.vx || 0, vy = foe.vy || 0;
    let tt = Math.hypot(tx - s.x, ty - s.y) / 28;
    const ox = tx - foe.x, oy = ty - foe.y, w = foe.angVel || 0;
    let aim = { x: tx, y: ty };
    for (let i = 0; i < 2; i++) {
      const a = w * tt, c = Math.cos(a), n = Math.sin(a);
      aim = { x: foe.x + vx * tt + ox * c - oy * n, y: foe.y + vy * tt + ox * n + oy * c };
      tt = Math.hypot(aim.x - s.x, aim.y - s.y) / 28;
    }
    cmd.aim = aim;
    cmd.fire = los && d < 13.5 + foe.radius;
    cmd.target = foe.id;
    if (s.item && (s.item.type === 'emp' && d < 7 || s.item.type === 'mine' && d < 5)) cmd.useItem = true;
    if (goal === foe && los && d < 17) {
      const pr = rangeOf(foe);
      let hold = 8;
      if (pr.close) hold = 11;
      if (pr.bomb) hold = 11.5;
      if (pr.mortar && !pr.close) hold = 5.5;
      const bearing = U.angleTo(s, foe), away = bearing + PI;
      const err = diff(away, s.heading);
      cmd.steer = clamp(err * 2.5 - s.angVel * 0.35, -1, 1);
      const ux = (foe.x - s.x) / (d || 1), uy = (foe.y - s.y) / (d || 1);
      const closing = (foe.vx - s.vx) * -ux + (foe.vy - s.vy) * -uy;
      cmd.throttle = clamp((hold + Math.max(0, closing) * 0.35 - d) * 0.5, -1, 1);
      if (Math.abs(err) > 1.1) cmd.throttle = clamp(cmd.throttle, -0.25, 0.4);
      if (Math.abs(cmd.throttle) < 0.12) cmd.brake = 0.7;
      // If retreat is blocked, present the tail and hold position rather than rush a blade.
      if (cmd.throttle > 0) {
        const x = s.x + Math.cos(s.heading) * 3, y = s.y + Math.sin(s.heading) * 3;
        if (!nav.isOpen(x, y) || nav.tileAt(x, y) === 'lava') { cmd.throttle = 0; cmd.brake = 0.8; }
      }
      return safe(state, api, cmd);
    }
  }
  // Collect useful supplies on the route, especially repairs when wounded.
  let ib = Infinity, item = null;
  for (const i of state.items) {
    const q = U.dist(s, i);
    const cap = i.type === 'repair' && s.hpFrac < 0.65 ? 22 : 6;
    if (q < cap && q < ib) { ib = q; item = i; }
  }
  if (item && !out && (!foe || d > 13 || item.type === 'repair')) goal = item;
  const wp = route.next(s, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(s, wp));
  if (state.t - jamStart > 1.2) {
    if (Math.hypot(s.x - jamX, s.y - jamY) < 0.5 && Math.abs(cmd.throttle) > 0.5) unstuckUntil = state.t + 0.8;
    jamStart = state.t; jamX = s.x; jamY = s.y;
  }
  if (state.t < unstuckUntil) { cmd.throttle = -1; cmd.steer = 1; }
  return safe(state, api, cmd);
}
