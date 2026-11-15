// HYDROGEN — adaptive multi-role combat vehicle for Light/Standard/Heavy budgets.
const meta = {
  name: 'Hydrogen',
  author: 'Hydrogen',
  model: 'gemini-4-hydrogen-medium',
  notes: 'Adaptive sloped-armor platform with hover variant for pit maps, energy-guarded hover, barrel targeting, and matchup-aware range control.',
};

const E = '.  .  .  .  .  .  .  .  .';

const DESIGNS = {
  light_ground: {
    deck: [
      E, E,
      '.  .  .  /^ /^ /^ .  .  .',
      '.  .  .  m^ L^ m^ .  .  .',
      '.  .  .  a  @  a  .  .  .',
      '.  .  .  d  g  .  .  .  .',
      E, E, E, E, E,
    ],
    chassis: [
      E, E,
      '.  .  .  p  p  p  .  .  .',
      '.  .  :  p  p  p  :  .  .',
      '.  .  O  p  r  p  O  .  .',
      '.  .  .  p  e  p  .  .  .',
      E, E, E, E, E,
    ],
  },
  light_hover: {
    deck: [
      E, E,
      '.  .  .  /^ /^ .  .  .  .',
      '.  .  .  :  m^ m^ .  .  .',
      '.  .  .  C^ @  a  .  .  .',
      '.  .  .  d  g  a  .  .  .',
      E, E, E, E, E,
    ],
    chassis: [
      E, E,
      '.  .  .  h  p  h  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  .  p  r  p  .  .  .',
      '.  .  .  h  e  h  .  .  .',
      E, E, E, E, E,
    ],
  },
  std_ground: {
    deck: [
      E, E,
      '.  .  .  /^ /^ /^ .  .  .',
      '.  .  .  :  L^ m^ .  .  .',
      '.  .  .  C^ a  b  .  .  .',
      '.  .  .  a  @  a  .  .  .',
      '.  .  .  d  G  g  .  .  .',
      E, E, E, E,
    ],
    chassis: [
      E, E,
      '.  .  .  p  p  p  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  :  p  r  p  :  .  .',
      '.  .  :  p  e  p  :  .  .',
      '.  .  T  p  r  p  T  .  .',
      E, E, E, E,
    ],
  },
  std_hover: {
    deck: [
      E, E,
      '.  .  .  /^ /^ /^ .  .  .',
      '.  .  .  :  L^ m^ .  .  .',
      '.  .  .  C^ b  a  .  .  .',
      '.  .  .  a  @  a  .  .  .',
      '.  .  .  d  G  g  .  .  .',
      E, E, E, E,
    ],
    chassis: [
      E, E,
      '.  .  .  h  p  h  .  .  .',
      '.  .  .  p  h  p  .  .  .',
      '.  .  .  p  r  p  .  .  .',
      '.  .  .  p  e  p  .  .  .',
      '.  .  .  h  r  h  .  .  .',
      E, E, E, E,
    ],
  },
  heavy_ground: {
    deck: [
      E,
      '.  .  .  /^ /^ /^ .  .  .',
      '.  .  .  :  L^ :  .  .  .',
      '.  .  m^ C^ a  C^ m^ .  .',
      '.  .  :  a  @  a  :  .  .',
      '.  .  A  G  +  w  A  .  .',
      '.  .  .  d  p  g  .  .  .',
      E, E, E, E,
    ],
    chassis: [
      E,
      '.  .  .  P^ :  :  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  p  p  r  p  p  .  .',
      '.  :  p  e  p  e  p  :  .',
      '.  :  p  p  r  p  p  :  .',
      '.  T  p  p  p  p  p  T  .',
      E, E, E, E,
    ],
  },
  heavy_hover: {
    deck: [
      E,
      '.  .  .  /^ /^ /^ .  .  .',
      '.  .  .  m^ L^ m^ .  .  .',
      '.  .  .  M^ :  a  .  .  .',
      '.  .  .  :  :  a  .  .  .',
      '.  .  .  a  @  a  .  .  .',
      '.  .  .  d  G  +  .  .  .',
      '.  .  .  .  w  g  .  .  .',
      E, E, E,
    ],
    chassis: [
      E,
      '.  .  .  h  p  h  .  .  .',
      '.  .  .  p  p  p  .  .  .',
      '.  .  .  p  r  p  .  .  .',
      '.  .  .  p  e  p  .  .  .',
      '.  .  .  h  e  h  .  .  .',
      '.  .  .  p  r  p  .  .  .',
      '.  .  .  .  h  .  .  .  .',
      E, E, E,
    ],
  },
};

function design(ctx, api) {
  const isPitMap = ctx.map === 'sumo' || ctx.map === 'skybridge';
  const tier = ctx.budget >= 1800 ? 'heavy' : ctx.budget >= 1200 ? 'std' : 'light';
  const key = tier + (isPitMap ? '_hover' : '_ground');
  return api.util.blueprint('Hydrogen-' + tier, DESIGNS[key], { paint: { accent: 'azure' } });
}

let route = null;

function init() {
  route = null;
}

function tick(state, api) {
  const { self } = state;
  const U = api.util;
  const nav = api.nav;
  route ??= nav.follower({ mudCost: 1.5, iceCost: 1.4, lavaCost: 30, replanTicks: 45, replanDist: 4 });

  const cmd = { throttle: 0, steer: 0, fire: false, boost: 0 };
  const mates = state.allies.filter((a) => a.alive);

  // Team focus coordination
  const isLeader = mates.every((a) => a.slot > self.slot);
  let focusId = null;
  if (!isLeader) {
    for (const m of state.messages) {
      if (m.data && Number.isInteger(m.data.focus)) {
        focusId = m.data.focus;
        break;
      }
    }
  }

  // Pick best enemy
  let foe = null;
  let bestScore = Infinity;
  let nearest = null;
  let nearDist = Infinity;
  for (const e of state.enemies) {
    const d = U.dist(self, e);
    if (d < nearDist) {
      nearDist = d;
      nearest = e;
    }
    const losBonus = nav.los(self.x, self.y, e.x, e.y) ? 0 : 8;
    const focusBonus = e.id === focusId ? -10 : 0;
    const score = e.coreFrac * 18 + e.hpFrac * 10 + d * 0.7 + losBonus + focusBonus;
    if (score < bestScore) {
      bestScore = score;
      foe = e;
    }
  }
  if (!foe) foe = nearest;
  if (isLeader && foe) {
    cmd.say = { focus: foe.id };
  }

  // Repair arm priority for hurt allies
  if (mates.length > 0) {
    let hurt = null;
    let worstHp = 0.92;
    for (const a of mates) {
      if (U.dist(self, a) < 7 && a.hpFrac < worstHp) {
        worstHp = a.hpFrac;
        hurt = a;
      }
    }
    if (hurt) cmd.target = hurt.id;
  }

  // Choose navigation goal
  let goal = foe;
  if (!foe) {
    let ld = Infinity;
    for (const l of state.lastSeen) {
      if (l.alive) {
        const d = U.dist(self, l);
        if (d < ld) {
          ld = d;
          goal = l;
        }
      }
    }
    goal ??= api.map.center;
  }

  // Check repair needs
  let healing = false;
  if (self.hpFrac < 0.45) {
    let bestKit = null;
    let kd = 24;
    for (const it of state.items) {
      if (it.type === 'repair' || it.type === 'shield') {
        const d = U.dist(self, it);
        if (d < kd) { kd = d; bestKit = it; }
      }
    }
    if (bestKit) {
      goal = bestKit;
      healing = true;
    } else if (state.pads.length > 0) {
      let bestPad = null;
      let pd = 26;
      for (const pad of state.pads) {
        if (pad.charge > 35) {
          const d = U.dist(self, pad);
          if (d < pd) { pd = d; bestPad = pad; }
        }
      }
      if (bestPad) {
        goal = bestPad;
        healing = true;
      }
    }
  } else {
    // Opportunistic item grab if close and safe
    let bestItem = null;
    let idist = foe ? 8.5 : 22;
    for (const it of state.items) {
      if (self.item && (it.type === 'mine' || it.type === 'emp')) continue;
      const d = U.dist(self, it);
      if (d < idist) {
        idist = d;
        bestItem = it;
      }
    }
    if (bestItem && (!foe || nearDist > 8.5)) {
      goal = bestItem;
    }
  }

  // Zone shrink override
  const zoneDist = U.dist(self, state.zone);
  const zoneEdge = zoneDist > state.zone.r - 4.2;
  if (zoneEdge) {
    goal = state.zone;
    healing = false;
  }

  // Aiming & Firing
  if (foe) {
    const d = U.dist(self, foe);
    const los = nav.los(self.x, self.y, foe.x, foe.y);
    const core = foe.parts.find((p) => p.type === 'core') || { wx: foe.x, wy: foe.y };
    let mark = { x: core.wx, y: core.wy, vx: foe.vx, vy: foe.vy };

    // Opportunistic barrel shot if barrel is next to enemy and far from us
    if (state.barrels && state.barrels.length > 0) {
      for (const b of state.barrels) {
        if (U.dist(b, foe) < 3.4 && U.dist(b, self) > 4.2 && nav.los(self.x, self.y, b.x, b.y)) {
          mark = { x: b.x, y: b.y, vx: 0, vy: 0 };
          break;
        }
      }
    }

    cmd.aim = U.lead(self, mark, 26);
    cmd.aims = {};
    const lowHoverEnergy = self.hovering && self.energy < 28;
    const critHoverEnergy = self.hovering && self.energy < 14;
    const fireList = [];
    for (const w of self.weapons) {
      if (!w.alive || critHoverEnergy) continue;
      if (lowHoverEnergy && (w.type === 'laser' || w.type === 'railgun')) continue;
      if (w.type === 'laser' || w.type === 'railgun') {
        cmd.aims[w.i] = { x: mark.x, y: mark.y };
        if (los && d < w.range + foe.radius) fireList.push(w.i);
      } else if (w.type === 'missile') {
        cmd.aims[w.i] = mark;
        cmd.target = foe.id;
        if (d < w.range) fireList.push(w.i);
      } else {
        cmd.aims[w.i] = U.lead(self, mark, w.projSpeed || 26);
        if (los && d < w.range + foe.radius) fireList.push(w.i);
      }
    }
    cmd.fire = fireList.length > 0 ? fireList : false;

    // Use held items
    if (self.item) {
      if (self.item.type === 'emp' && nearDist < 6.8) cmd.useItem = true;
      if (self.item.type === 'mine' && nearDist < 8.5) cmd.useItem = true;
    }

    // Classify enemy threat profile
    let foeMeleeOrFlame = false;
    let foeKegOrMortar = false;
    for (const p of foe.parts) {
      if (!p.alive) continue;
      if (p.type === 'flamer' || p.type === 'saw' || p.type === 'piston' || p.type === 'plow' || p.type === 'spike') {
        foeMeleeOrFlame = true;
      } else if (p.type === 'keg' || p.type === 'mortar') {
        foeKegOrMortar = true;
      }
    }

    const hasLaser = self.weapons.some((w) => w.alive && w.type === 'laser');
    const armed = self.weapons.some((w) => w.alive);

    if (armed && !healing && goal === foe && los && d < 18 && !zoneEdge) {
      let optDist = hasLaser ? 8.0 : 10.5;
      if (foeKegOrMortar && self.hpFrac > 0.35) {
        // Rush inside mortar minRange (6m) and sapper keg safety distance (~5.5m)
        optDist = 4.2;
      } else if (foeMeleeOrFlame) {
        // Kite outside flamer (5.5m) and melee, but stay in laser/mg/cannon range
        optDist = hasLaser ? 9.2 : 11.2;
      }

      const aimAngle = U.angleTo(self, cmd.aim);
      const t = U.turnTo(self, aimAngle);
      cmd.steer = t.steer;
      const lined = Math.abs(U.angDiff(aimAngle, self.heading)) < 0.48;

      if (d > optDist + 1.5) {
        cmd.throttle = lined ? 0.9 : 0.3;
      } else if (d < optDist - 1.5) {
        const bx = self.x - Math.cos(self.heading) * 3.0;
        const by = self.y - Math.sin(self.heading) * 3.0;
        const backOk = (self.hovering || nav.tileAt(bx, by) !== 'pit') && nav.isOpen(bx, by, self.hovering) && nav.tileAt(bx, by) !== 'lava';
        cmd.throttle = backOk ? -0.9 : 0;
      } else {
        cmd.throttle = lined ? 0.15 : 0;
      }
      return guard(state, api, cmd);
    }
  }

  // Navigate to goal
  const wp = route.next(self, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(self, wp, { stopDist: healing ? 0.8 : 0.6 }));
  return guard(state, api, cmd);
}

function guard(state, api, cmd) {
  const s = state.self;
  const nav = api.nav;
  const U = api.util;

  // Dodge incoming blasts / kegs
  const blast = U.threat(state, 1.4);
  if (blast) {
    Object.assign(cmd, U.driveTo(s, blast.away, { reverse: true }));
  }

  // Avoid driving into pits when not hovering
  if (!s.hovering) {
    const c = Math.cos(s.heading);
    const n = Math.sin(s.heading);
    for (const k of [0.25, 0.5, 0.8]) {
      if (nav.tileAt(s.x + s.vx * k, s.y + s.vy * k) === 'pit') {
        cmd.throttle = s.vx * c + s.vy * n > 0 ? -1 : 1;
        cmd.brake = 1;
        cmd.boost = 0;
        return cmd;
      }
    }
    const dir = Math.sign(cmd.throttle || 0);
    if (dir) {
      for (const d of [0.3, 0.7, 1.1, 1.7]) {
        for (const w of [-0.35, 0, 0.35]) {
          if (nav.tileAt(s.x + c * d * dir - n * w, s.y + n * d * dir + c * w) === 'pit') {
            cmd.throttle = 0;
            cmd.boost = 0;
            return cmd;
          }
        }
      }
    }
  }
  return cmd;
}
