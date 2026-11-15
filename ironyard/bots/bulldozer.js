// BULLDOZER — tracked rammer. A three-stud plow between two saws and two spikes,
// track units either side, two thrusters behind, slopes guarding the cockpit.
// Lines up on the nearest enemy and lights the boosters; on maps with pits it
// tries to shove people over the edge.
const meta = { name: 'Bulldozer', author: 'ironyard', notes: 'Melee: ram with spikes/plow under thruster boost, saw on contact.' };

const design = (ctx, api) => api.util.blueprint('Bulldozer', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  /^ /^ /^ .  .  .',
    '.  .  a  a  @  a  a  .  .',
    '.  .  .  .  b  .  .  .  .',
    '.  .  .  i  t  i  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  V^ S^ P^ :  :  S^ V^ .',
    '.  p  p  p  p  p  p  p  .',
    '.  .  p  p  g  p  p  .  .',
    '.  .  p  e  r  p  p  .  .',
    '.  :  p  p  p  p  p  :  .',
    '.  :  p  p  p  p  p  :  .',
    '.  T  p  p  p  p  p  T  .',
    '.  .  p  J^ p  J^ p  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'yellow' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, boost: 0 };

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  if (U.dist(self, state.zone) > state.zone.r - 3) goal = state.zone;
  const kit = state.items.find((i) => i.type === 'repair' || i.type === 'shield');
  if (kit && self.hpFrac < 0.5 && U.dist(self, kit) < 12) goal = kit;

  if (foe && goal === foe) {
    // aim a little ahead of where they are going
    const lead = Math.min(0.5, best / 12);
    const tx = foe.x + foe.vx * lead, ty = foe.y + foe.vy * lead;
    const err = U.angDiff(Math.atan2(ty - self.y, tx - self.x), self.heading);
    if (best < 11 && nav.clear(self.x, self.y, tx, ty, { margin: 0.6 })) {
      Object.assign(cmd, U.driveTo(self, tx, ty, { stopDist: 0 }));
      cmd.throttle = Math.abs(err) < 1 ? 1 : 0.3;
      // only burn fuel when lined up, and never when the run-out ends in a hole
      const ox = tx + Math.cos(self.heading) * 4, oy = ty + Math.sin(self.heading) * 4;
      if (Math.abs(err) < 0.3 && best > 2.5 && nav.tileAt(ox, oy) !== 'pit' && self.energy > 30) cmd.boost = 1;
      if (state.self.item && state.self.item.type === 'emp' && best < 6) cmd.useItem = true;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
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
