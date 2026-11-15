// ROOKIE — the baseline. Cheap four-wheeler: two machine-gun turrets on the deck,
// a slope in front of the cockpit and armor bricks either side of it.
// Walks up to the nearest enemy, holds ~8 m and shoots. Beat this first.
const meta = { name: 'Rookie', author: 'ironyard', notes: 'Baseline: balanced wheels + 2 MG, hold mid range.' };

const design = (ctx, api) => api.util.blueprint('Rookie', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  m^ /^ m^ .  .  .',
    '.  .  .  a  m^ a  .  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  a  a  a  .  .  .',
    '.  .  .  .  t  .  .  .  .',
    '.  .  .  f^ .  f^ .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  p  p  p  .  .  .',
    '.  .  o  p  p  p  o  .  .',
    '.  .  .  p  r  p  .  .  .',
    '.  .  .  p  p  p  .  .  .',
    '.  .  .  p  e  p  .  .  .',
    '.  .  o  p  p  p  o  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'white' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };

  // nearest visible enemy, or the place one was last seen
  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  // patch up when hurt, and never sit outside the safe zone
  const kit = state.items.find((i) => i.type === 'repair');
  if (kit && self.hpFrac < 0.6) goal = kit;
  if (U.dist(self, state.zone) > state.zone.r - 3) goal = state.zone;

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    cmd.aim = U.lead(self, foe, 28);
    cmd.fire = los && d < 13 + foe.radius;
    const armed = self.weapons.some((w) => w.alive);
    if (goal === foe && los && d < 9 && armed) {
      // close enough: face them, back off if they crowd us
      const t = U.turnTo(self, U.angleTo(self, foe));
      cmd.steer = t.steer;
      const bx = self.x - Math.cos(self.heading) * 3, by = self.y - Math.sin(self.heading) * 3;
      cmd.throttle = d < 5.5 && nav.isOpen(bx, by) && nav.tileAt(bx, by) !== 'lava' ? -0.8 : d > 7.5 ? 0.4 : 0;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}

// don't let momentum carry us into a pit
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
