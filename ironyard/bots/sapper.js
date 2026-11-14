// SAPPER — bomb thrower. Four powder kegs in the nose under an armoured lid, facing
// forward, and two machine guns. A keg that is let go is flung the way it faces and goes off
// against the first other car it reaches, so Sapper holds off at seven to ten metres, turns
// its nose onto where the other car is going to be, and lets one go — never from so close
// that the blast would reach back to it. Whoever comes for it gets one in the face while
// Sapper backs away. With the kegs gone it is a light gun car that keeps its distance.
const meta = { name: 'Sapper', author: 'ironyard', notes: 'Bombs: flings powder kegs from the nose at 7-10 m, backs off from anything that closes; 2 MGs for afterwards.' };

const design = (ctx, api) => api.util.blueprint('Sapper', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  a  .  a  .  .  .',
    '.  .  .  a  .  a  .  .  .',
    '.  .  m^ a  @  a  m^ .  .',
    '.  .  .  a  w  a  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  F  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  K^ p  K^ .  .  .',
    '.  :  p  K^ p  K^ p  :  .',
    '.  O  p  p  r  p  p  O  .',
    '.  .  .  p  e  p  .  .  .',
    '.  :  p  p  r  p  p  :  .',
    '.  O  p  p  g  p  p  O  .',
    '.  .  .  .  J^ .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'yellow' } });

let route = null, holdUntil = -1;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower();
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };
  const kegs = self.parts.filter((p) => p.type === 'keg' && p.alive);
  const KEG = api.parts.keg, FUSE = KEG.blast.fuse, DRAG = api.rules.bombDrag;

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  if (foe) { cmd.aim = U.lead(self, foe, 28); cmd.fire = best < 13 + foe.radius && nav.los(self.x, self.y, foe.x, foe.y); }

  // a keg (ours or anybody's) or a mortar shell about to go off here: get clear, backwards if that is quicker
  const blast = U.threat(state, 1.4);
  if (blast) { Object.assign(cmd, U.driveTo(self, blast.away, { reverse: true })); return guard(state, api, cmd); }

  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  if (U.dist(self, state.zone) > state.zone.r - 4) goal = state.zone;

  if (foe && goal === foe) {
    const d = best, gap = d - foe.radius, los = nav.los(self.x, self.y, foe.x, foe.y);
    const ux = (foe.x - self.x) / d, uy = (foe.y - self.y) / d;
    const closing = -((foe.vx - self.vx) * ux + (foe.vy - self.vy) * uy);          // m/s the two of us are getting nearer
    if (kegs.length && los && d < 24) {
      // when a keg let go now would get there, where the other car will be by then, and how far from us that is
      const tHit = gap / Math.max(3, KEG.fling + closing);
      const mark = { x: foe.x + foe.vx * tHit, y: foe.y + foe.vy * tHit };
      const err = U.angDiff(U.angleTo(self, mark), self.heading);
      const apart = gap * KEG.fling / Math.max(3, KEG.fling + closing) - self.radius;   // from our nose to the blast
      const reach = KEG.fling * Math.min(FUSE, 1.2) - 0.5 * DRAG * 1.44;               // what a keg covers in 1.2 s from a standstill
      cmd.steer = U.clamp(err * 3 - self.angVel * 0.4, -1, 1);
      cmd.throttle = d > 10 ? 1 : d < 7.5 || closing > 3 ? -1 : 0.15;                   // hold the range; give ground to a charge
      if (d > 14) cmd.boost = Math.abs(err) < 0.3 ? 1 : 0;
      const lined = Math.abs(err) < 0.07 && Math.abs(self.angVel) < 0.8;
      if (state.t > holdUntil && lined && apart > KEG.blast.r + 0.4 && gap < reach + closing * 0.6
        && nav.clear(self.x, self.y, mark.x, mark.y, { margin: 0.4 })) {
        cmd.jettison = [kegs[0].i];
        holdUntil = state.t + Math.max(0.8, tHit + 0.3);                               // see what that one does first
        api.log('keg away at', d.toFixed(1), 'm, closing', closing.toFixed(1), 'm/s');
      }
      return guard(state, api, cmd);
    }
    if (los && d < 14) {
      // no kegs left: circle at gun range
      const bearing = U.angleTo(self, foe);
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
