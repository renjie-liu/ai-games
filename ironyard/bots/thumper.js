// THUMPER — artillery on monster wheels. A mortar lobs shells over walls onto
// wherever the enemy is about to be; two machine-gun turrets cover the front.
// It never needs line of sight for the mortar, so it likes cover.
const meta = { name: 'Thumper', author: 'ironyard', notes: 'Artillery: mortar fires over walls at the lead point, MGs for self-defence, holds 13-19 m.' };

const design = (ctx, api) => api.util.blueprint('Thumper', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  m^ /^ m^ .  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  :  :  d  .  .  .',
    '.  .  .  N^ :  G  .  .  .',
    '.  .  .  a  b  a  .  .  .',
    '.  .  .  i  .  i  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  p  p  p  .  .  .',
    '.  .  :  p  p  p  :  .  .',
    '.  .  O  p  r  p  O  .  .',
    '.  .  .  p  e  p  .  .  .',
    '.  .  :  p  r  p  :  .  .',
    '.  .  O  p  p  p  O  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'sand' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  const kit = state.items.find((i) => i.type === 'repair');
  if (kit && self.hpFrac < 0.5) goal = kit;
  const zoneEdge = U.dist(self, state.zone) > state.zone.r - 4;
  if (zoneEdge) goal = state.zone;

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    const lob = U.lead(self, foe, 15);   // where they will be when the shell comes down
    const core = foe.parts.find((p) => p.type === 'core');
    const mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }; // aim for the cockpit, not the middle of the hull
    cmd.aim = U.lead(self, mark, 28);
    cmd.aims = {};
    const fire = [];
    for (const w of self.weapons) {
      if (!w.alive) continue;
      if (w.type === 'mortar') { cmd.aims[w.i] = { x: lob.x, y: lob.y }; if (d > w.minRange + 0.5 && d < w.range) fire.push(w.i); }
      else if (los && d < w.range + foe.radius) fire.push(w.i);
    }
    cmd.fire = fire;
    if (self.item && self.item.type === 'emp' && d < 6.5) cmd.useItem = true;
    if (self.item && self.item.type === 'mine' && d < 9) cmd.useItem = true;
    if (fire.length + self.weapons.filter((w) => w.alive).length > 0 && goal === foe && d < 21 && !zoneEdge) {
      // in range: keep the turrets toward them and hold the 13-19 m band
      cmd.steer = U.turnTo(self, U.angleTo(self, foe)).steer;
      const bx = self.x - Math.cos(self.heading) * 3.5, by = self.y - Math.sin(self.heading) * 3.5;
      const backOk = nav.isOpen(bx, by) && nav.tileAt(bx, by) !== 'lava';
      if (d < 13) cmd.throttle = backOk ? -1 : 0;
      else if (d > 19) cmd.throttle = 0.5;
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
