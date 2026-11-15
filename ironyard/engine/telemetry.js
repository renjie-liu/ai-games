// Match telemetry: what each vehicle did and what was done to it, noted while the World runs.
//
// Observation only. Nothing in this file is read back by the simulation: it never touches the
// world's RNG, the physics, the order of anything or the events. The World calls the note*
// hooks from the places where it already does the work (damage, destroy, firing) and
// `sampleTelemetry` once a tick, which looks at the vehicles ten times a second.
import { PARTS } from './parts.js';

const TYPES = Object.keys(PARTS);
/** Every label a point of damage can carry: the part type of the weapon that dealt it, or one of the rest. */
export const SOURCES = [...TYPES, 'barrel', 'mine', 'fire', 'ram', 'wall', 'lava', 'zone', 'blast', 'other'];
/** label → its number: what the World hands to damage() as `via` (a weapon piece carries its own in `ti`). */
export const SRC = Object.freeze(Object.fromEntries(SOURCES.map((s, i) => [s, i])));
const NSRC = SOURCES.length, NTYPE = TYPES.length, FIRE = SRC.fire;
const UNLABELLED = { explosive: SRC.blast, ram: SRC.ram, fire: SRC.fire };

/** Distance bands, in metres between the centres of two vehicles. */
export const BANDS = ['0-4', '4-8', '8-13', '13-20', '20+'];
export const SIDES = ['front', 'left', 'right', 'rear'];
export const bandOf = (d) => (d < 4 ? 0 : d < 8 ? 1 : d < 13 ? 2 : d < 20 ? 3 : 4);
export const TIMELINE_STEP = 2;      // seconds between timeline samples
const EVERY = 6;                     // ticks between looks at the vehicles (10 Hz at 60 Hz physics)
// what stepWeapons leaves in tel.fire each tick
const WANTED = 1, UNAIMED = 2, FIRED = 4, STARVED = 8;

const r1 = (x) => Math.round(x * 10) / 10 + 0;

/** Which side of `v` the direction (dx, dy) points out of: within 45° of the heading is the front. */
function sideOf(v, dx, dy) {
  const u = dx * v.fx + dy * v.fy, l = dy * v.fx - dx * v.fy;
  return Math.abs(l) <= Math.abs(u) ? (u >= 0 ? 0 : 3) : l > 0 ? 1 : 2;
}

/** The counters of one vehicle. `nv` = vehicles in the match. Weapon pieces get their own record in `tw`. */
export function newTelemetry(v, nv) {
  const weapons = [];
  let movers = 0;
  for (const p of v.parts) {
    if (p.def.weapon || p.def.punch) weapons.push(p.tw = { i: p.i, type: p.type, dir: p.dir, shots: 0, hits: 0, damage: 0, firingTime: 0, lostAt: null, lostTo: null, lostBy: null });
    if (p.def.mover) movers++;
  }
  return {
    nv, weapons, movers, moversLost: 0, immobileAt: null,
    taken: new Float64Array((nv + 1) * NSRC),      // [attacker, or nv for nobody] x [source]
    dealt: new Float64Array(nv * NSRC),            // [target] x [source] — enemies only
    takenType: { kinetic: 0, energy: 0, explosive: 0, melee: 0, ram: 0, fire: 0, burn: 0 },
    takenPart: new Float64Array(NTYPE), takenSide: new Float64Array(4), takenBand: new Float64Array(5), dealtBand: new Float64Array(5),
    firstHit: null, lastT: 0, lastBy: -1, lastLab: 0,
    cTick: -1, cSrc: -1, cDist: 0, cBand: 0, cSide: 0,   // attacker of the moment: how far, which side
    timeIn: new Float64Array(5), distSum: 0, distT: 0,
    fire: 0, tReach: 0, tFiring: 0, tUnseen: 0, tNoLos: 0, tArc: 0, tStarved: 0, tHeld: 0, tStun: 0, tUnder: 0, tWasted: 0,
    stuck: 0, stuckOn: 0, reversing: 0, top: 0,
    losses: [], lossTick: -1, lossBy: null,
    hull: [], energy: [], dist: [], guns: [],
  };
}

/**
 * `dealt` hp just came off piece `p` of `v`. `via` says what did it: a number from SRC, a weapon
 * piece of `src` (its `ti` is the label, its `tw` the record to credit), a blast { ti, tw, ox, oy, shotAng }
 * that also says where it went off and, for the splash of a direct shot, which way the shell was
 * going — or nothing, for a caller that does not say.
 * The side a hit is counted on: against the travel of the shot when there is one, else towards the
 * blast, else towards the attacker.
 */
export function noteDamage(w, v, p, dealt, dtype, src, shotAng, via) {
  const T = v.tel;
  let lab, tw = null, ox;
  if (via === undefined) lab = UNLABELLED[dtype] ?? SRC.other;
  else if (typeof via === 'number') lab = via;
  else { lab = via.ti; tw = via.tw; ox = via.ox; if (shotAng === undefined) shotAng = via.shotAng; }   // (a weapon piece has neither ox nor shotAng)
  T.takenType[dtype] = (T.takenType[dtype] || 0) + dealt;
  T.takenPart[p.ti] += dealt;
  if (!src) { T.taken[T.nv * NSRC + lab] += dealt; return; }
  T.taken[src.id * NSRC + lab] += dealt;
  if (src === v) return;
  const enemy = src.team !== v.team;
  let band = -1;
  if (lab !== FIRE) {   // a fire burns long after whoever lit it has gone: it has no range and no side
    if (T.cTick !== w.tick || T.cSrc !== src.id) {
      const dx = src.x - v.x, dy = src.y - v.y;
      T.cTick = w.tick; T.cSrc = src.id; T.cDist = Math.hypot(dx, dy); T.cBand = bandOf(T.cDist); T.cSide = sideOf(v, dx, dy);
    }
    band = T.cBand;
    T.takenBand[band] += dealt;
    T.takenSide[shotAng !== undefined ? sideOf(v, -Math.cos(shotAng), -Math.sin(shotAng)) : ox !== undefined ? sideOf(v, ox - v.x, via.oy - v.y) : T.cSide] += dealt;
    if (enemy && T.firstHit === null) T.firstHit = T.cDist;
  }
  if (enemy) {   // what is done to one's own side is nobody's credit (the same rule as stats.damageDealt)
    T.lastT = w.t; T.lastBy = src.id; T.lastLab = lab;
    const S = src.tel;
    S.dealt[v.id * NSRC + lab] += dealt;
    if (band >= 0) S.dealtBand[band] += dealt;
    if (tw) tw.damage += dealt;
  }
}

function lost(T, p, t, cause, by) {
  T.losses.push({ t, type: p.type, i: p.i, cause, by });
  if (p.tw) { p.tw.lostAt = t; p.tw.lostTo = cause; p.tw.lostBy = by; }
  if (p.def.mover && ++T.moversLost === T.movers) T.immobileAt = t;
}

/** Piece `p` of `v` is gone (not decor). `via` as in noteDamage, when damage did it; else `cause` is the engine's word. */
export function noteLoss(w, v, p, src, cause, via) {
  const T = v.tel, by = src ? src.id : null;
  T.lossTick = w.tick; T.lossBy = by;
  lost(T, p, w.t, via === undefined ? cause : SOURCES[typeof via === 'number' ? via : via.ti], by);
}

/** Piece `p` fell off because what held it went: it is put down to whoever broke a piece of `v` this tick. */
export function noteDetached(w, v, p) {
  const T = v.tel;
  lost(T, p, w.t, 'detached', T.lossTick === w.tick ? T.lossBy : null);
}

/** One row of the timeline. `near` = metres to the nearest living enemy (Infinity: none), worked out here when not given. */
export function timelinePoint(w, v, near) {
  const T = v.tel;
  if (near === undefined) {
    near = Infinity;
    for (const e of w.teams[1 - v.team]) if (e.alive) near = Math.min(near, Math.hypot(e.x - v.x, e.y - v.y));
  }
  let guns = 0;
  for (const g of T.weapons) if (g.lostAt === null) guns++;
  T.hull.push(Math.max(0, Math.round((v.hpNow / v.hpMax) * 100)));
  T.energy.push(v.energyMax ? Math.round((v.energy / v.energyMax) * 100) : 0);
  T.dist.push(near < Infinity ? r1(near) : null);
  T.guns.push(guns);
}

/** Called at the end of every tick; ten times a second it measures what is not an event: range, fire discipline, movement. */
export function sampleTelemetry(w) {
  if (w.tick % EVERY) return;
  const h = w.dt * EVERY;
  const line = w.tick % Math.max(EVERY, Math.round(TIMELINE_STEP / w.dt / EVERY) * EVERY) === 0;
  for (const v of w.vehicles) {
    if (!v.alive) continue;
    const T = v.tel, foes = w.teams[1 - v.team], f = T.fire;
    // the reach of its guns: harpoons are not for shooting people with; a mortar needs no line of sight, and cannot hit close by
    let reach = 0, lob = 0, lobMin = 0;
    for (const g of v.weapons) {
      if (!g.alive || g.def.weapon === 'hook') continue;
      if (g.def.weapon !== 'lob') { if (g.def.range > reach) reach = g.def.range; }
      else if (g.def.range > lob) { lob = g.def.range; lobMin = g.def.minRange || 0; }
    }
    let near = Infinity, inReach = false, seen = false, clear = false, under = false, touching = false;
    for (const e of foes) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - v.x, e.y - v.y);
      if (d < near) near = d;
      if (d < v.radius + e.radius + 0.6) touching = true;
      const over = d <= lob && d >= lobMin;
      if (d > reach && !over) { if (d < lobMin) under = true; continue; }
      inReach = true;
      if (clear || f & FIRED || !w.visibleTo(v.team, e)) continue;   // only a silent gun needs a reason
      seen = true;
      if (over || !w.blocked(v.x, v.y, e.x, e.y)) clear = true;
    }
    if (near < Infinity) { T.timeIn[bandOf(near)] += h; T.distSum += near * h; T.distT += h; }
    if (inReach) {
      T.tReach += h;
      if (f & STARVED) T.tStarved += h;
      if (f & FIRED) T.tFiring += h;
      else if (!seen) T.tUnseen += h;
      else if (!clear) T.tNoLos += h;
      else if (v.stun > 0) T.tStun += h;
      else if ((f & (WANTED | UNAIMED)) === (WANTED | UNAIMED)) T.tArc += h;
      else if (!(f & WANTED)) T.tHeld += h;
    } else {
      if (under) T.tUnder += h;                                    // somebody is there, inside the mortar's minimum range
      if ((reach > 0 || lob > 0) && f & FIRED) T.tWasted += h;     // (a saw at work on a car with no guns is not firing at nothing)
    }
    // movement
    const sp = Math.hypot(v.vx, v.vy);
    if (sp > T.top) T.top = sp;
    if (sp < 0.3) { if (v.stun <= 0 && Math.abs(v.cmd.throttle) > 0.5) { T.stuck += h; if (touching) T.stuckOn += h; } }   // (pushing on an enemy is its own kind of stuck)
    else if (v.vx * v.fx + v.vy * v.fy < -0.3) T.reversing += h;
    if (line) timelinePoint(w, v, near);
  }
}

const named = (keys, arr) => Object.fromEntries(keys.map((k, i) => [k, arr[i]]));

/** Everything noted about vehicle `v` so far, as plain data with raw numbers (compactTelemetry rounds it for reading). */
export function telemetryOf(w, v) {
  const T = v.tel, nv = T.nv, life = v.alive ? w.t : v.deathT;
  const byAttacker = {}, takenBy = {}, top = [];
  for (let a = 0; a <= nv; a++) for (let s = 0; s < NSRC; s++) {
    const x = T.taken[a * NSRC + s];
    if (!(x > 0)) continue;
    const who = a === nv ? 'env' : a;
    byAttacker[who] = (byAttacker[who] || 0) + x;
    takenBy[SOURCES[s]] = (takenBy[SOURCES[s]] || 0) + x;
    top.push({ by: a === nv ? null : a, weapon: SOURCES[s], damage: x });
  }
  top.sort((p, q) => q.damage - p.damage);
  const byTarget = {}, dealtBy = {};
  for (let a = 0; a < nv; a++) for (let s = 0; s < NSRC; s++) {
    const x = T.dealt[a * NSRC + s];
    if (!(x > 0)) continue;
    byTarget[a] = (byTarget[a] || 0) + x;
    dealtBy[SOURCES[s]] = (dealtBy[SOURCES[s]] || 0) + x;
  }
  const byPartType = {};
  for (let i = 0; i < NTYPE; i++) if (T.takenPart[i] > 0) byPartType[TYPES[i]] = T.takenPart[i];
  const lossesByCause = {};
  for (const l of T.losses) lossesByCause[l.cause] = (lossesByCause[l.cause] || 0) + 1;
  return {
    weapons: T.weapons.map((g) => ({ ...g })),
    dealt: { byTarget, byWeapon: dealtBy, byRange: named(BANDS, T.dealtBand) },
    taken: {
      byAttacker, byWeapon: takenBy, byType: { ...T.takenType }, bySide: named(SIDES, T.takenSide), byRange: named(BANDS, T.takenBand), byPartType,
      top: top.slice(0, 5), lastHit: T.lastBy < 0 ? null : { t: T.lastT, by: T.lastBy, weapon: SOURCES[T.lastLab] },
    },
    range: { timeIn: named(BANDS, T.timeIn), mean: T.distT > 0 ? T.distSum / T.distT : null, atFirstHitTaken: T.firstHit },
    fire: {
      timeTargetInReach: T.tReach, timeFiring: T.tFiring, timeNoLineOfSight: T.tNoLos, timeOutOfArc: T.tArc, timeEnergyStarved: T.tStarved,
      timeTargetUnseen: T.tUnseen, timeHoldingFire: T.tHeld, timeStunned: T.tStun, timeTargetTooClose: T.tUnder, timeFiringNoTarget: T.tWasted,
    },
    move: { timeStuck: T.stuck, timeStuckOnEnemy: T.stuckOn, timeReversing: T.reversing, meanSpeed: life > 0 ? v.stats.distance / life : 0, topSpeed: T.top,
      movers: T.movers, moversLost: T.moversLost, immobileAt: T.immobileAt },
    losses: T.losses.map((l) => ({ ...l })), lossesByCause,
    timeline: { step: TIMELINE_STEP, hull: T.hull.slice(), energy: T.energy.slice(), dist: T.dist.slice(), weapons: T.guns.slice() },
  };
}

// what is left of a table once its numbers are rounded: zero entries go, and `top` keeps the biggest
function keep(o, round) {
  const out = {};
  for (const [k, x] of Object.entries(o || {})) { const y = round(x); if (y > 0) out[k] = y; }
  return out;
}
function rank(o, top = Infinity) {
  return Object.fromEntries(Object.entries(o || {}).map(([k, x]) => [k, Math.round(x)]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, top));
}
const sec = (x) => r1(x || 0);
const orNull = (x) => (x === null || x === undefined ? null : r1(x));

/**
 * The telemetry of one vehicle in the form an agent reads: seconds and metres to one decimal,
 * damage in whole hp, zero entries left out, lists capped. `brief` drops the timeline and the
 * list of pieces lost. Takes the raw form (telemetryOf) or its own output.
 */
export function compactTelemetry(t, { brief = false } = {}) {
  if (!t) return undefined;
  const f = t.fire, m = t.move;
  const fire = { timeTargetInReach: sec(f.timeTargetInReach), timeFiring: sec(f.timeFiring), timeNoLineOfSight: sec(f.timeNoLineOfSight),
    timeOutOfArc: sec(f.timeOutOfArc), timeEnergyStarved: sec(f.timeEnergyStarved) };
  for (const k of ['timeTargetUnseen', 'timeHoldingFire', 'timeStunned', 'timeTargetTooClose', 'timeFiringNoTarget']) if (sec(f[k]) > 0) fire[k] = sec(f[k]);
  const out = {
    weapons: t.weapons.map((g) => ({ i: g.i, type: g.type, dir: g.dir, shots: r1(g.shots), hits: r1(g.hits), damage: Math.round(g.damage), firingTime: r1(g.firingTime),
      lostAt: orNull(g.lostAt), ...(g.lostAt === null || g.lostAt === undefined ? {} : { lostTo: g.lostTo, lostBy: g.lostBy ?? null }) })),
    dealt: { byTarget: keep(t.dealt.byTarget, Math.round), byWeapon: rank(t.dealt.byWeapon), byRange: keep(t.dealt.byRange, Math.round) },
    taken: {
      byAttacker: keep(t.taken.byAttacker, Math.round), byWeapon: rank(t.taken.byWeapon), byType: rank(t.taken.byType),
      bySide: keep(t.taken.bySide, Math.round), byRange: keep(t.taken.byRange, Math.round), byPartType: rank(t.taken.byPartType, 6),
      top: (t.taken.top || []).slice(0, 3).map((x) => ({ by: x.by, weapon: x.weapon, damage: Math.round(x.damage) })).filter((x) => x.damage > 0),
      lastHit: t.taken.lastHit ? { t: r1(t.taken.lastHit.t), by: t.taken.lastHit.by, weapon: t.taken.lastHit.weapon } : null,
    },
    range: { timeIn: keep(t.range.timeIn, r1), mean: orNull(t.range.mean), atFirstHitTaken: orNull(t.range.atFirstHitTaken) },
    fire,
    move: { timeStuck: sec(m.timeStuck), ...(sec(m.timeStuckOnEnemy) > 0 ? { timeStuckOnEnemy: sec(m.timeStuckOnEnemy) } : {}), timeReversing: sec(m.timeReversing), meanSpeed: sec(m.meanSpeed), topSpeed: sec(m.topSpeed),
      movers: m.movers, moversLost: m.moversLost, immobileAt: orNull(m.immobileAt) },
    lossesByCause: rank(t.lossesByCause),
  };
  if (!brief) {
    out.losses = (t.losses || []).slice(0, 12).map((l) => ({ t: r1(l.t), type: l.type, i: l.i, cause: l.cause, by: l.by ?? null }));
    if (t.timeline) out.timeline = { step: t.timeline.step, hull: t.timeline.hull, energy: t.timeline.energy, dist: t.timeline.dist, weapons: t.timeline.weapons };
  }
  return out;
}
