// BASTION — tracked heavy. Track units under an armor-brick citadel, slopes on
// the glacis, shield generator, two cannons.
// Grinds forward, keeps its front to the enemy from 19 m in and trades at ~10 m.
// Retreats to a repair pad when the hull gets low.
const meta = { name: 'Bastion', author: 'ironyard', notes: 'Tank: tracks + armor + shield, 2 cannons, slow push, uses repair pads.' };

const design = (ctx, api) => api.util.blueprint('Bastion', {
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
}, { paint: { accent: 'grey' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower({ mudCost: 1.3, iceCost: 1.2 }); // tracks don't mind mud
  const cmd = { throttle: 0, steer: 0, fire: false };

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  let healing = false;
  if (self.hpFrac < 0.45) {
    const kit = state.items.find((i) => i.type === 'repair');
    const pad = state.pads.filter((p) => p.charge > 40).sort((a, b) => U.dist(self, a) - U.dist(self, b))[0];
    if (kit) { goal = kit; healing = true; } else if (pad) { goal = pad; healing = true; }
  }
  if (U.dist(self, state.zone) > state.zone.r - 4) { goal = state.zone; healing = false; }

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    const core = foe.parts.find((p) => p.type === 'core');
    const mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }; // aim for the cockpit, not the middle of the hull
    cmd.aim = U.lead(self, mark, 24);
    cmd.fire = los && d < 20 + foe.radius;
    const armed = self.weapons.some((w) => w.alive);   // no guns left? fall through and ram
    if (armed && !healing && goal === foe && los && d < 19) {
      // inside cannon range: keep the guns (and the armor) pointed at them and creep in
      const t = U.turnTo(self, cmd.aim.angle);
      cmd.steer = t.steer;
      const lined = Math.abs(U.angDiff(cmd.aim.angle, self.heading)) < 0.5;
      cmd.throttle = d > 10 ? (lined ? 0.7 : 0.2) : d < 6 ? -0.5 : 0;
      if (self.item && self.item.type === 'emp' && d < 6.5) cmd.useItem = true;
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp, { stopDist: healing ? 0.8 : 0.6 }));
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
