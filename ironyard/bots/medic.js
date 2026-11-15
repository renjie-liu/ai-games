// MEDIC — support on monster wheels. Two repair arms, a shield generator and two
// machine-gun turrets.
// In team modes it shadows the most damaged ally and keeps them alive; alone
// it fights like a sturdy skirmisher that heals itself between exchanges.
const meta = { name: 'Medic', author: 'ironyard', notes: 'Support: 2 repair arms + shield; follows the weakest ally, shoots what it can.' };

const design = (ctx, api) => api.util.blueprint('Medic', {
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
}, { paint: { accent: 'white' } });

let route = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false };

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  if (foe) {
    const core = foe.parts.find((p) => p.type === 'core');
    const mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy }; // aim for the cockpit, not the middle of the hull
    cmd.aim = U.lead(self, mark, 28);
    cmd.fire = best < 13 + foe.radius && nav.los(self.x, self.y, foe.x, foe.y);
  }

  // who needs us most?
  const mates = state.allies.filter((a) => a.alive);
  let ward = null, worst = 2;
  for (const a of mates) { const s = a.hpFrac + U.dist(self, a) / 60; if (s < worst) { worst = s; ward = a; } }

  let goal, stop = 0.6;
  if (ward) {
    cmd.target = ward.hpFrac < 0.98 ? ward.id : null; // tell the repair arms who to work on
    // sit just behind the ward, on the far side from the nearest enemy
    const from = foe ? U.angleTo(foe, ward) : ward.heading + Math.PI;
    goal = { x: ward.x + Math.cos(from) * 3.2, y: ward.y + Math.sin(from) * 3.2 };
    if (!nav.isOpen(goal.x, goal.y)) goal = ward;
    stop = 1.0;
  } else if (foe) {
    goal = foe;
  } else {
    goal = api.map.center; let b = Infinity;
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < b) { b = d; goal = l; } }
  }
  const kit = state.items.find((i) => i.type === 'repair');
  if (kit && self.hpFrac < 0.5) goal = kit;
  if (U.dist(self, state.zone) > state.zone.r - 3) goal = state.zone;
  if (self.item && self.item.type === 'emp' && foe && best < 6.5) cmd.useItem = true;

  const armed = self.weapons.some((w) => w.alive);
  if (armed && !ward && foe && goal === foe && best < 8.5 && cmd.fire) {
    const t = U.turnTo(self, U.angleTo(self, foe));
    cmd.steer = t.steer;
    const bx = self.x - Math.cos(self.heading) * 3, by = self.y - Math.sin(self.heading) * 3;
    cmd.throttle = best < 5.5 && nav.isOpen(bx, by) ? -0.8 : 0;
    return guard(state, api, cmd);
  }
  if (U.dist(self, goal) < stop + 0.4 && foe) { // parked: turn the guns on the enemy
    cmd.steer = U.turnTo(self, U.angleTo(self, foe)).steer;
    cmd.brake = 1;
    return guard(state, api, cmd);
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp, { stopDist: stop }));
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
