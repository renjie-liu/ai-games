// ANGLER — hook and saw. A heavy tracked hull with a harpoon over two saws and two spikes.
// It closes to hook range, puts the hook in, winds the cable all the way in and holds the
// other car against the saws: something that lives by keeping its distance no longer can.
// With a hole or lava close behind it, it backs up instead and takes the catch along.
const meta = { name: 'Angler', author: 'ironyard', notes: 'Harpoon: hooks, reels the enemy onto its saws and spikes; drags it into pits and lava when they are near.' };

const design = (ctx, api) => api.util.blueprint('Angler', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  /^ :  /^ .  .  .',
    '.  .  m^ a  H^ a  .  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  b  t  b  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  V^ S^ a  S^ V^ .  .',
    '.  :  p  p  p  p  p  :  .',
    '.  :  p  r  g  r  p  :  .',
    '.  T  p  p  e  p  p  T  .',
    '.  .  .  p  p  p  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'lime' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };

  const blast = U.threat(state);
  if (blast) { Object.assign(cmd, U.driveTo(self, blast.away, { reverse: true })); return guard(state, api, cmd); }

  const cable = state.tethers.find((t) => t.from === self.id);
  let foe = cable ? state.enemies.find((e) => e.id === cable.to) : null, best = foe ? U.dist(self, foe) : Infinity;
  if (!foe) for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  if (!cable && U.dist(self, state.zone) > state.zone.r - 4) goal = state.zone;

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y), bearing = U.angleTo(self, foe);
    const hook = self.weapons.find((w) => w.type === 'harpoon');
    cmd.aim = U.lead(self, foe, 28);
    cmd.aims = hook ? { [hook.i]: U.lead(self, foe, hook.projSpeed) } : {};
    // machine guns whenever they bear; the hook once it will reach
    cmd.fire = los ? self.weapons.filter((w) => w.alive && d < w.range + foe.radius - (w.type === 'harpoon' ? 1 : 0)).map((w) => w.i) : false;

    if (cable) {
      cmd.reel = 1;
      // somewhere to drop it? a hole or lava within a few metres behind us: back up and take it along
      const back = self.heading + Math.PI;
      let hazard = false;
      for (const r of [2.5, 4, 5.5]) { const t = nav.tileAt(self.x + Math.cos(back) * r, self.y + Math.sin(back) * r); if (t === 'lava') hazard = true; }
      const err = U.angDiff(bearing, self.heading);
      cmd.steer = U.clamp(err * 2.5 - self.angVel * 0.4, -1, 1);
      cmd.throttle = hazard ? -1 : d > 2.6 ? 0.8 : 0.3;      // otherwise lean on it: saws and spikes are at the front
      if (foe.hpFrac < 0.05) cmd.release = true;
      return guard(state, api, cmd);
    }
    if (goal === foe && los && d < 13) {
      const err = U.angDiff(bearing, self.heading);
      cmd.steer = U.clamp(err * 2.5 - self.angVel * 0.4, -1, 1);
      cmd.throttle = Math.abs(err) < 0.6 ? 1 : 0.3;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}

// never drive (or slide) into a hole — backwards least of all
function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1;
    return cmd;
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir) for (const d of [0.4, 0.9, 1.4, 2.0]) for (const w of [-0.5, 0, 0.5]) {
    if (nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w) === 'pit') { cmd.throttle = 0; return cmd; }
  }
  return cmd;
}
