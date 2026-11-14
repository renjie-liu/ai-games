// HORNET — broadside skirmisher. Every gun points LEFT: four machine-gun turrets
// and a laser along the port rail, supercharger and spoiler for speed. It never faces the enemy; it circles them
// counter-clockwise at ~7 m so the whole battery bears while narrow-arc
// cannons and railguns have to keep turning to follow.
const meta = { name: 'Hornet', author: 'ironyard', notes: 'Glass cannon: port-side broadside (4 MG + laser), orbits the target, grabs items.' };

const design = (ctx, api) => api.util.blueprint('Hornet', {
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
}, { paint: { accent: 'lime' } });

const ORBIT = 7;
let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  // items are worth a detour when they are close
  let item = null, ib = 8;
  for (const i of state.items) { const d = U.dist(self, i); if (d < ib) { ib = d; item = i; } }
  if (item && (!foe || best > 9 || self.hpFrac < 0.5)) goal = item;
  if (U.dist(self, state.zone) > state.zone.r - 3) goal = state.zone;

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    const core = foe.parts.find((p) => p.type === 'core');
    const mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }; // aim for the cockpit, not the middle of the hull
    cmd.aim = U.lead(self, mark, 28);
    cmd.aims = {};
    for (const w of self.weapons) if (w.type === 'laser') cmd.aims[w.i] = { x: core.wx, y: core.wy };
    cmd.fire = los ? self.weapons.filter((w) => w.alive && d < w.range + foe.radius).map((w) => w.i) : false;
    if (self.item) {
      if (self.item.type === 'emp' && d < 6.5) cmd.useItem = true;
      if (self.item.type === 'mine' && d < 8) cmd.useItem = true; // orbiting leaves them in the enemy's path
    }
    if (self.weapons.some((w) => w.alive) && goal === foe && los && d < 13) {
      // keep the enemy on our left: fly tangent to a circle of radius ORBIT around them
      const bearing = U.angleTo(self, foe);
      let want = bearing - Math.PI / 2 + U.clamp((d - ORBIT) * 0.3, -0.7, 1.1);
      const ax = self.x + Math.cos(want) * 3.2, ay = self.y + Math.sin(want) * 3.2;
      if (!nav.isOpen(ax, ay) || nav.tileAt(ax, ay) === 'lava') want = bearing - 0.3; // blocked: cut inside
      const err = U.angDiff(want, self.heading);
      cmd.steer = U.clamp(err * 2.4 - self.angVel * 0.3, -1, 1);
      cmd.throttle = Math.abs(err) < 1.4 ? 1 : 0.25;
      if (d < 3.5 && self.energy > 60 && Math.abs(err) < 0.6) cmd.boost = 1; // a brawler got hold of us: punch out
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  if (foe && best > 16 && self.energy > 150 && Math.abs(U.angDiff(U.angleTo(self, wp), self.heading)) < 0.3) cmd.boost = 1;
  return guard(state, api, cmd);
}

function guard(state, api, cmd) {
  // a keg or a mortar shell about to go off here: nothing else matters until we are clear of it
  const blast = api.util.threat(state);
  if (blast) Object.assign(cmd, api.util.driveTo(state.self, blast.away, { reverse: true }));
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
