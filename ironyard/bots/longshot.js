// LONGSHOT — sniper. A three-stud railgun down the centreline, a cannon on each
// shoulder, radar behind.
// Holds 13-19 m with line of sight, aims the rail at the enemy core and backs
// away from anything that gets close.
const meta = { name: 'Longshot', author: 'ironyard', notes: 'Sniper: railgun + 2 cannons + radar, keeps range, reverses from brawlers.' };

const design = (ctx, api) => api.util.blueprint('Longshot', {
  deck: [
    '.  .  .  .  /^ .  .  .  .',
    '.  .  /^ .  :  .  /^ .  .',
    '.  .  :  .  :  .  :  .  .',
    '.  .  C^ .  R^ .  C^ .  .',
    '.  .  .  d  a  .  .  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  .  b  .  .  .  .',
    '.  .  .  F  .  i  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  p  .  .  .  .',
    '.  .  p  .  p  .  p  .  .',
    '.  .  p  .  p  .  p  .  .',
    '.  o  p  p  p  p  p  o  .',
    '.  .  p  r  p  r  p  .  .',
    '.  .  p  p  e  p  p  .  .',
    '.  .  p  p  p  p  p  .  .',
    '.  o  p  p  p  p  p  o  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'black' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };

  // prefer the weakest visible enemy we can actually see down the barrel
  let foe = null, score = Infinity;
  for (const e of state.enemies) {
    const d = U.dist(self, e), los = nav.los(self.x, self.y, e.x, e.y);
    const s = d + e.coreFrac * 12 + (los ? 0 : 25);
    if (s < score) { score = s; foe = e; }
  }
  let goal = foe;
  if (!foe) {
    let best = Infinity;
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  const zoneEdge = U.dist(self, state.zone) > state.zone.r - 4;
  if (zoneEdge) goal = state.zone;

  if (foe) {
    const d = U.dist(self, foe), los = nav.los(self.x, self.y, foe.x, foe.y);
    const core = foe.parts.find((p) => p.type === 'core');
    const railAim = Math.atan2(core.wy - self.y, core.wx - self.x);
    cmd.aim = U.lead(self, { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }, 24);
    cmd.aims = {};
    for (const w of self.weapons) if (w.type === 'railgun') cmd.aims[w.i] = { x: core.wx, y: core.wy };
    cmd.fire = los ? self.weapons.filter((w) => w.alive && d < w.range + foe.radius).map((w) => w.i) : false;
    const armed = self.weapons.some((w) => w.alive);   // no guns left? fall through and ram
    if (armed && los && d < 20 && !zoneEdge) {
      const t = U.turnTo(self, railAim);
      cmd.steer = t.steer;
      const bx = self.x - Math.cos(self.heading) * 3.5, by = self.y - Math.sin(self.heading) * 3.5;
      const backOk = nav.isOpen(bx, by) && nav.tileAt(bx, by) !== 'lava';
      if (d < 12) cmd.throttle = backOk ? -1 : 0;
      else if (d > 18) cmd.throttle = 0.5;
      if (d < 7 && self.item && self.item.type === 'emp') cmd.useItem = true;
      if (d < 10 && self.item && self.item.type === 'mine') cmd.useItem = true; // drops behind us as we reverse over it
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
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
