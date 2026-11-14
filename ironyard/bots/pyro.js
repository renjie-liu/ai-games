// PYRO — fast flamethrower car. Two flamers and a machine gun behind a pair of slopes,
// a supercharger and a booster to get in close. A flamer does little damage of its own:
// it sets things alight, and the fire does the rest, so Pyro hoses whatever is in front of
// it, keeps moving, and lets go the moment its target is well alight to look for the next.
const meta = { name: 'Pyro', author: 'ironyard', notes: 'Fire: 2 flamethrowers + MG on a fast wheeled car; closes in, sets it alight, keeps circling.' };

const design = (ctx, api) => api.util.blueprint('Pyro', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  /^ /^ /^ .  .  .',
    '.  .  a  Y^ m^ Y^ a  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  G  w  b  .  .  .',
    '.  .  .  f^ .  f^ .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  o  a  a  a  o  .  .',
    '.  .  p  p  r  p  p  .  .',
    '.  .  .  p  e  p  .  .  .',
    '.  .  .  p  r  p  .  .  .',
    '.  .  o  p  J^ p  o  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'red' } });

let route = null, side = 1;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };

  // somebody's keg or mortar shell: get out of the circle first
  const blast = U.threat(state);
  if (blast) { Object.assign(cmd, U.driveTo(self, blast.away, { reverse: true })); cmd.boost = 1; return guard(state, api, cmd); }

  // nearest enemy, but one that is not burning yet is worth a little more than one that is
  let foe = null, best = Infinity;
  for (const e of state.enemies) { const s = U.dist(self, e) + (e.burning > 3 ? 6 : 0); if (s < best) { best = s; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  // burning or badly hurt, and a repair pad or kit close by: go and put it out
  if (self.burning > 2 || self.hpFrac < 0.4) {
    let fix = null, fd = 18;
    for (const p of state.pads) if (p.charge > 20) { const d = U.dist(self, p); if (d < fd) { fd = d; fix = p; } }
    for (const i of state.items) if (i.type === 'repair') { const d = U.dist(self, i); if (d < fd) { fd = d; fix = i; } }
    if (fix) {
      const wp = route.next(self, fix.x, fix.y, state.tick);
      Object.assign(cmd, U.driveTo(self, wp, { stopDist: 0.5 }));
      if (foe) { cmd.aim = foe; cmd.fire = U.dist(self, foe) < 7; }
      return guard(state, api, cmd);
    }
  }
  if (U.dist(self, state.zone) > state.zone.r - 4) goal = state.zone;

  if (foe && goal === foe) {
    const d = U.dist(self, foe), los = nav.los(self.x, self.y, foe.x, foe.y);
    cmd.aim = { x: foe.x, y: foe.y };
    cmd.fire = los && d < 6.2 + foe.radius;
    if (los && d < 9) {
      // close enough to work: swing round it at about 3.5 m, nose (and nozzles) on the target
      if (state.tick % 240 === 0) side = -side;
      const bearing = U.angleTo(self, foe);
      const want = bearing + side * U.clamp((4.2 - d) * 0.45, -0.2, 1.0);
      const err = U.angDiff(want, self.heading);
      cmd.steer = U.clamp(err * 2.4 - self.angVel * 0.3, -1, 1);
      cmd.throttle = d > 3.2 ? 0.9 : 0.35;
      return guard(state, api, cmd);
    }
    if (los && d < 22 && self.energyFrac > 0.5) cmd.boost = 1;   // cross the open ground quickly
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}

// never drive (or slide) into a hole
function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1; cmd.boost = 0;
    return cmd;
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir) for (const d of [0.3, 0.7, 1.1, 1.7]) for (const w of [-0.35, 0, 0.35]) {
    if (nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w) === 'pit') { cmd.throttle = 0; cmd.boost = 0; return cmd; }
  }
  return cmd;
}
