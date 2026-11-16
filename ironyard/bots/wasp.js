// WASP — hover missile boat. Six hover pads carry two twin-missile pods and a
// radar. It floats over pits, mud, ice and mines,
// keeps 15-22 m away and lets the homing missiles do the work.
const meta = { name: 'Wasp', author: 'ironyard', notes: 'Hover kiter: 2 missile pods + radar, stays far, crosses pits.' };

const design = (ctx, api) => api.util.blueprint('Wasp', {
  deck: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  /^ /^ /^ .  .  .',
    '.  .  :  :  a  :  :  .  .',
    '.  .  M^ :  d  M^ :  .  .',
    '.  .  .  a  @  a  .  .  .',
    '.  .  .  f^ t  f^ .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
  chassis: [
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  p  p  p  .  .  .',
    '.  h  p  p  p  p  p  h  .',
    '.  .  p  p  r  p  p  .  .',
    '.  h  p  p  p  p  p  h  .',
    '.  .  .  r  e  p  .  .  .',
    '.  h  p  p  p  p  p  h  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
    '.  .  .  .  .  .  .  .  .',
  ],
}, { paint: { accent: 'azure' } });

let route = null, fleeUntil = 0, fleeTo = null;

function tick(state, api) {
  const { self } = state, U = api.util, nav = api.nav;
  route ??= nav.follower({ lavaCost: 2 });
  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };
  const hov = self.hovering;

  let foe = null, best = Infinity;
  for (const e of state.enemies) { const d = U.dist(self, e); if (d < best) { best = d; foe = e; } }
  let goal = foe;
  if (!foe) {
    for (const l of state.lastSeen) if (l.alive) { const d = U.dist(self, l); if (d < best) { best = d; goal = l; } }
    goal ??= api.map.center;
  }
  const zoneEdge = U.dist(self, state.zone) > state.zone.r - 4;

  if (foe) {
    const d = best, los = nav.los(self.x, self.y, foe.x, foe.y);
    const face = U.angleTo(self, foe);
    cmd.aim = { x: foe.x, y: foe.y };
    cmd.aims = {};
    for (const w of self.weapons) if (w.type === 'mg') cmd.aims[w.i] = U.lead(self, foe, 28);
    cmd.target = foe.id;
    cmd.fire = los ? self.weapons.filter((w) => w.alive && d < w.range).map((w) => w.i) : false;

    if (state.t < fleeUntil && fleeTo && !zoneEdge) {
      const wp = route.next(self, fleeTo.x, fleeTo.y, state.tick);
      Object.assign(cmd, U.driveTo(self, wp));
      if (self.energy > 40) cmd.boost = 1;
      return cmd;
    }
    if (self.weapons.some((w) => w.alive) && los && d < 24 && !zoneEdge) {
      cmd.steer = U.turnTo(self, face).steer;
      if (d < 15) {
        // back away while facing them; if a wall is behind us, relocate
        const bx = self.x - Math.cos(self.heading) * 3.5, by = self.y - Math.sin(self.heading) * 3.5;
        if (nav.isOpen(bx, by, hov)) cmd.throttle = -1;
        else {
          let far = null, fd = -1;
          for (const p of api.map.itemSpawns.concat(api.map.spawns[0], api.map.spawns[1])) {
            const s = U.dist(p, foe) - U.dist(p, self) * 0.4;
            if (s > fd && U.dist(p, state.zone) < state.zone.r - 2) { fd = s; far = p; }
          }
          if (far) { fleeTo = far; fleeUntil = state.t + 2.5; route.reset(); }
        }
      } else if (d > 21) cmd.throttle = 0.6;
      return cmd;
    }
  }
  if (zoneEdge) goal = state.zone;
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp));
  // a keg or a mortar shell about to go off here: get clear of it first
  const blast = U.threat(state);
  if (blast) Object.assign(cmd, U.driveTo(self, blast.away, { reverse: true }));
  // if the lift ever fails (energy), respect the holes like everyone else
  if (!hov) {
    const px = self.x + self.vx * 0.8, py = self.y + self.vy * 0.8;
    if (nav.tileAt(px, py) === 'pit') { cmd.throttle = -1; cmd.brake = 1; }
  }
  return cmd;
}
