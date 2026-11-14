// WOLFPACK — a team controller. One file, three different vehicles.
//   slot 0  ANVIL   tracked tank that holds the front
//   slot 1  FANG    fast flanker with laser + machine guns
//   slot 2  MENDER  repair truck that shadows whoever is hurt
// The lowest-numbered living member is the leader: it picks one enemy and
// broadcasts { focus: id } with `say`; everyone shoots the same target.
const meta = { name: 'Wolfpack', author: 'ironyard', notes: 'Team bot: role per slot via design(ctx), focus fire via say.' };

const BLUEPRINTS = {
  anvil: {
    deck: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  /^ .  /^ .  .  .',
      '.  .  b  :  b  :  b  .  .',
      '.  .  a  C^ a  C^ a  .  .',
      '.  .  b  a  @  a  b  .  .',
      '.  .  .  G  b  .  .  .  .',
      '.  .  .  i  .  i  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
    chassis: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  p  p  p  p  p  .  .',
      '.  .  p  p  p  p  p  .  .',
      '.  :  p  r  p  r  p  :  .',
      '.  :  p  p  e  p  p  :  .',
      '.  T  p  p  p  p  p  T  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
  },
  fang: {
    deck: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  m< .  .  .  .  .',
      '.  .  /< m< b  .  .  .  .',
      '.  .  /< L< @  a  .  .  .',
      '.  .  /< m< b  a  .  .  .',
      '.  .  .  m< w  .  .  .  .',
      '.  .  .  W  :  :  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
    chassis: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  o  p  p  p  o  .  .',
      '.  .  p  p  p  p  .  .  .',
      '.  .  p  p  g  p  .  .  .',
      '.  .  p  e  p  r  .  .  .',
      '.  .  .  p  r  p  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  o  p  J^ p  o  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
  },
  mender: {
    deck: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  m^ /^ m^ .  .  .',
      '.  .  .  a  +  a  .  .  .',
      '.  .  .  a  @  a  .  .  .',
      '.  .  .  .  G  .  .  .  .',
      '.  .  .  l> +  l< .  .  .',
      '.  .  .  .  F  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
    chassis: [
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  :  p  p  p  :  .  .',
      '.  .  O  r  p  r  O  .  .',
      '.  .  .  e  p  e  .  .  .',
      '.  .  :  p  p  p  :  .  .',
      '.  .  O  p  p  p  O  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
      '.  .  .  .  .  .  .  .  .',
    ],
  },
};
const ROLES = ['anvil', 'fang', 'mender'];

// design can be a function: pick a vehicle for this slot (and, if you like, this map or mode)
const design = (ctx, api) => {
  const role = ROLES[ctx.slot % 3];
  return api.util.blueprint('Wolf-' + role, BLUEPRINTS[role], { paint: { accent: 'purple' } });
};

let role = 'anvil', route = null;

function init(info) { role = ROLES[info.slot % 3]; }

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };
  const mates = state.allies.filter((a) => a.alive);

  // ── focus target ──
  const leader = mates.every((a) => a.slot > self.slot);
  let focus = null;
  if (leader) {
    let best = Infinity;
    for (const e of state.enemies) { const s = e.coreFrac * 20 + e.hpFrac * 10 + U.dist(self, e) * 0.6; if (s < best) { best = s; focus = e; } }
    if (focus) cmd.say = { focus: focus.id };
  } else {
    const msg = state.messages.find((m) => m.data && Number.isInteger(m.data.focus));
    if (msg) focus = state.enemies.find((e) => e.id === msg.data.focus) || null;
  }
  // always shoot something: fall back to the nearest visible enemy
  let near = null, nd = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < nd) { nd = d; near = e; } }
  const foe = focus && U.dist(self, focus) < 22 ? focus : near;

  let goal = foe;
  if (!foe) {
    let b = Infinity;
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < b) { b = d; goal = l; } }
    goal ??= api.map.center;
  }
  const d = foe ? U.dist(self, foe) : Infinity;
  const los = foe ? nav.los(self.x, self.y, foe.x, foe.y) : false;
  if (foe) {
    const core = foe.parts.find((p) => p.type === 'core');
    const mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }; // aim for the cockpit, not the middle of the hull
    cmd.aim = U.lead(self, mark, role === 'anvil' ? 24 : 28);
    cmd.aims = {};
    for (const w of self.weapons) if (w.type === 'laser') cmd.aims[w.i] = { x: core.wx, y: core.wy };
    cmd.fire = los ? self.weapons.filter((w) => w.alive && d < w.range + foe.radius).map((w) => w.i) : false;
    if (self.item && self.item.type === 'emp' && d < 6.5) cmd.useItem = true;
  }
  const zoneEdge = U.dist(self, state.zone) > state.zone.r - 3.5;
  const kit = state.items.find((i) => i.type === 'repair');
  let detour = false;
  if (kit && self.hpFrac < 0.5 && U.dist(self, kit) < 14) { goal = kit; detour = true; }
  if (zoneEdge) { goal = state.zone; detour = true; }

  // ── role behaviour ──
  if (role === 'mender' && mates.length && !detour) {
    let ward = null, worst = 2;
    for (const a of mates) { const s = a.hpFrac + U.dist(self, a) / 60; if (s < worst) { worst = s; ward = a; } }
    cmd.target = ward.hpFrac < 0.98 ? ward.id : null;
    const from = foe ? U.angleTo(foe, ward) : ward.heading + Math.PI;
    goal = { x: ward.x + Math.cos(from) * 3.2, y: ward.y + Math.sin(from) * 3.2 };
    if (!nav.isOpen(goal.x, goal.y)) goal = ward;
    if (U.dist(self, goal) < 1.4) {
      if (foe) cmd.steer = U.turnTo(self, U.angleTo(self, foe)).steer;
      cmd.brake = 1;
      return guard(state, api, cmd);
    }
  } else if (foe && goal === foe && los && self.weapons.some((w) => w.alive)) {
    if (role === 'fang' && d < 13) {
      // all of Fang's guns point left: circle the target counter-clockwise at ~7 m
      const bearing = U.angleTo(self, foe);
      let want = bearing - Math.PI / 2 + U.clamp((d - 7) * 0.3, -0.7, 1.1);
      const ax = self.x + Math.cos(want) * 3.2, ay = self.y + Math.sin(want) * 3.2;
      if (!nav.isOpen(ax, ay) || nav.tileAt(ax, ay) === 'lava') want = bearing - 0.3;
      const err = U.angDiff(want, self.heading);
      cmd.steer = U.clamp(err * 2.4 - self.angVel * 0.3, -1, 1);
      cmd.throttle = Math.abs(err) < 1.4 ? 1 : 0.25;
      return guard(state, api, cmd);
    }
    if (role !== 'fang' && d < (role === 'anvil' ? 19 : 12)) {
      cmd.steer = U.turnTo(self, cmd.aim.angle).steer;
      const keep = role === 'anvil' ? 8 : 9;
      const lined = Math.abs(U.angDiff(cmd.aim.angle, self.heading)) < 0.5;
      cmd.throttle = d > keep + 2 ? (lined ? 0.7 : 0.2) : d < keep - 3 ? -0.5 : 0;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp, { stopDist: role === 'mender' ? 1.0 : 0.6 }));
  return guard(state, api, cmd);
}

function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  if (s.hovering) return cmd;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  // sliding toward a hole: stand on the brakes
  for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1; cmd.boost = 0;
    return cmd;
  }
  // about to drive into one: do not
  const dir = Math.sign(cmd.throttle || 0);
  if (dir) for (const d of [0.3, 0.7, 1.1, 1.7]) for (const w of [-0.35, 0, 0.35]) {
    if (nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w) === 'pit') { cmd.throttle = 0; cmd.boost = 0; return cmd; }
  }
  return cmd;
}
