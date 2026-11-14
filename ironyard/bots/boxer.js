// BOXER — piston bruiser. Two piston rams either side of a plow, monster wheels, a booster, two machine guns.
// A piston hits for little damage but throws what it hits: a 250 kg car leaves at 6 m/s.
// So Boxer does not try to break anybody. It works out which way the nearest hole, lava
// pool or powder barrel lies from its opponent, goes round to the other side, and punches.
const meta = { name: 'Boxer', author: 'ironyard', notes: 'Pistons: gets on the far side of the enemy from a pit, lava or barrel and punches it in.' };

const design = (ctx, api) => api.util.blueprint('Boxer', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  m^ /^ /^ /^ m^ .  .',
    '.  .  b  a  @  a  b  .  .',
    '.  .  .  b  b  b  .  .  .',
    '.  .  .  .  t  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  U^ P^ :  :  U^ .  .',
    '.  :  p  p  p  p  p  :  .',
    '.  O  p  r  g  r  p  O  .',
    '.  .  p  p  e  p  p  .  .',
    '.  :  p  p  p  p  p  :  .',
    '.  O  p  p  J^ p  p  O  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'pink' } });

let route = null;

// the nearest place worth knocking somebody into, looking outwards from (x, y)
function hazardNear(x, y, state, api) {
  let best = null, bd = 11;
  for (const b of state.barrels) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
    for (let r = 1.5; r < bd; r += 1) {
      const t = api.nav.tileAt(x + cx * r, y + cy * r);
      if (t === 'wall' || t === 'crate') break;
      if (t === 'pit' || t === 'lava') { bd = r; best = { x: x + cx * r, y: y + cy * r }; break; }
    }
  }
  return best;
}

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };

  const blast = U.threat(state);
  if (blast) { Object.assign(cmd, U.driveTo(self, blast.away, { reverse: true })); cmd.boost = 1; return guard(state, api, cmd); }

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  if (U.dist(self, state.zone) > state.zone.r - 4) goal = state.zone;

  if (foe && goal === foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    cmd.aim = U.lead(self, foe, 28);
    cmd.fire = los && d < 13 + foe.radius;
    if (los && d < 16) {
      // a punch sends it straight away from us. If something worth knocking it into is close to it and
      // we are roughly on the right side already, shift over to line the punch up; otherwise just go in.
      const hz = hazardNear(foe.x, foe.y, state, api);
      const from = hz ? U.angleTo(foe, hz) : U.angleTo(self, foe);
      const off = Math.abs(U.angDiff(U.angleTo(self, foe), from));
      const stand = { x: foe.x - Math.cos(from) * (foe.radius + self.radius + 1.2), y: foe.y - Math.sin(from) * (foe.radius + self.radius + 1.2) };
      if (!hz || off < 0.45 || off > 1.3 || d > 9 || !nav.isOpen(stand.x, stand.y) || nav.tileAt(stand.x, stand.y) === 'lava') {
        // go in
        const err = U.angDiff(U.angleTo(self, foe), self.heading);
        cmd.steer = U.clamp(err * 2.6 - self.angVel * 0.35, -1, 1);
        cmd.throttle = Math.abs(err) < 0.8 ? 1 : 0.25;
        cmd.boost = Math.abs(err) < 0.25 && d > 3 && self.energyFrac > 0.3 ? 1 : 0;
      } else Object.assign(cmd, U.driveTo(self, stand));       // get round to the far side first
      return guard(state, api, cmd);
    }
  }
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  return guard(state, api, cmd);
}

// never drive (or slide) into a hole, and do not stand in lava to throw a punch
function guard(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const c = Math.cos(s.heading), n = Math.sin(s.heading);
  for (const k of [0.25, 0.5, 0.8]) {
    if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) !== 'pit') continue;
    cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1; cmd.brake = 1; cmd.boost = 0;
    return cmd;
  }
  const dir = Math.sign(cmd.throttle || 0);
  if (dir) for (const d of [0.4, 0.9, 1.4, 2.0]) for (const w of [-0.5, 0, 0.5]) {
    if (nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w) === 'pit') { cmd.throttle = 0; cmd.boost = 0; return cmd; }
  }
  return cmd;
}
