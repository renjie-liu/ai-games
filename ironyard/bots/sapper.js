// SAPPER — bomb runner. Four powder kegs in the tail, two machine guns up front, and a
// booster. A keg that is let go keeps the speed the car had, so Sapper charges, lets one
// roll at just the distance it will cover before its fuse runs out, stamps on the brakes
// and backs off: wheels stop a car in about a metre, the keg carries on without it.
// With the kegs gone it is a light gun car that keeps its distance.
const meta = { name: 'Sapper', author: 'ironyard', notes: 'Bombs: charges, rolls a powder keg into the enemy, brakes and backs off; 2 MGs for afterwards.' };

const design = (ctx, api) => api.util.blueprint('Sapper', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  /^ /^ /^ .  .  .',
    '.  .  m^ a  @  a  m^ .  .',
    '.  .  .  a  w  a  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  l> F  l< .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  :  p  p  p  p  p  :  .',
    '.  O  p  p  r  p  p  O  .',
    '.  .  .  p  e  p  .  .  .',
    '.  :  p  p  r  p  p  :  .',
    '.  O  p  p  g  p  p  O  .',
    '.  .  K  K  J^ K  K  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'yellow' } });

const FUSE = 1.5, DRAG = 5;            // api.parts.keg.blast.fuse, api.rules.bombDrag
let route = null, backUntil = -1, backFrom = null, running = false;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };
  const kegs = self.parts.filter((p) => p.type === 'keg' && p.alive);

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  if (foe) { cmd.aim = U.lead(self, foe, 28); cmd.fire = best < 13 + foe.radius && nav.los(self.x, self.y, foe.x, foe.y); }

  // a keg of ours (or anybody's) about to go off nearby: get clear, backwards if that is quicker
  const blast = U.threat(state, 1.6);
  if (state.t < backUntil || blast) {
    const from = blast || backFrom;
    const away = blast ? blast.away : { x: self.x + (self.x - from.x), y: self.y + (self.y - from.y) };
    Object.assign(cmd, U.driveTo(self, away, { reverse: true }));
    return guard(state, api, cmd);
  }

  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  if (U.dist(self, state.zone) > state.zone.r - 4) goal = state.zone;

  if (foe && goal === foe) {
    const los = nav.los(self.x, self.y, foe.x, foe.y), clear = los && nav.clear(self.x, self.y, foe.x, foe.y, { margin: 0.6 });
    // run at where it will be when the keg gets there, not at where it is
    const mark = { x: foe.x + foe.vx * 1.1, y: foe.y + foe.vy * 1.1 };
    const d = U.dist(self, mark), bearing = U.angleTo(self, mark);
    if (kegs.length && los && d < 26) {
      // A run needs room to get up speed. Too close: open the distance first, guns still on the target.
      if (!running && d < 10) {
        const out = { x: self.x - Math.cos(bearing) * 8, y: self.y - Math.sin(bearing) * 8 };
        if (nav.clear(self.x, self.y, out.x, out.y, { margin: 0.8 })) { Object.assign(cmd, U.driveTo(self, out)); return guard(state, api, cmd); }
      }
      if (clear) {
        // the bombing run: straight at it, flat out
        running = true;
        const err = U.angDiff(bearing, self.heading);
        cmd.steer = U.clamp(err * 2.6 - self.angVel * 0.35, -1, 1);
        cmd.throttle = Math.abs(err) < 0.9 ? 1 : 0.2;
        cmd.boost = Math.abs(err) < 0.3 && d > 8 ? 1 : 0;
        // how far a keg let go now would get before it blows
        const v = self.speed, t = Math.min(FUSE, v / DRAG), roll = v * t - 0.5 * DRAG * t * t;
        const moving = Math.abs(U.angDiff(Math.atan2(self.vy, self.vx), bearing)) < 0.2;
        if (v > 4.5 && moving && d - foe.radius < roll + 1.2) {
          cmd.jettison = [kegs[0].i];
          cmd.throttle = -1; cmd.brake = 1; cmd.boost = 0;
          running = false;
          backUntil = state.t + FUSE + 0.3; backFrom = { x: foe.x, y: foe.y };
          api.log('keg away at', d.toFixed(1), 'm,', v.toFixed(1), 'm/s');
        }
        return guard(state, api, cmd);
      }
    }
    running = false;
    if (los && d < 14) {
      // no kegs left (or no clear run): circle at gun range
      const want = bearing + 1.2 + U.clamp((d - 10) * 0.25, -0.7, 0.4);
      const err = U.angDiff(want, self.heading);
      cmd.steer = U.clamp(err * 2.4 - self.angVel * 0.3, -1, 1);
      cmd.throttle = 0.8;
      return guard(state, api, cmd);
    }
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
