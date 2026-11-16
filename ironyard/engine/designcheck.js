// Design analysis: what a blueprint is like under fire, worked out from the hit rules alone.
// Pure functions over a validated design: nothing here runs a match, and nothing in a match calls this.
//
// The model, and what it leaves out (see World.partAt / damage / touching / stepWeapons in sim.js):
//   * A straight shot crosses the stud grid along one lane and hits the first column it enters that
//     has a piece: the deck piece of that column, else the chassis piece. Decor is not solid.
//   * To reach the core the shooter must destroy, one after another, whatever that lane shows it.
//     When a piece goes, everything no longer connected to the core falls off with it.
//   * Kinetic damage: a slope facing the shot lets 45% through, then armor takes its points off
//     (never more than 75%). "Effective hp" is the damage that has to be fired to remove a piece.
//   * Left out: spread, splash, railgun pierce, shields, repair, and the blasts of reactors and
//     kegs that die on the way (those only help the attacker, so the numbers err on the safe side).
//   * Fire: pieces with a `burn` value can burn; a cluster is burnable pieces that touch. Pieces that
//     burn slowly may need two burning neighbours to catch, so a cluster is the most a fire can take.
import { PARTS, CELL, GRID_HX, GRID_HY, GRID_W, GRID_L, DIRS, DIR_ANGLE, cellsOf, hitOn } from './parts.js';
import { aggregate, centerOf, cellIndex, inGrid, computeStats } from './design.js';

/** Distances (m, from the centre of mass) at which `dpsByRange` is sampled. */
export const ANALYSIS_RANGES = [2, 6, 10, 14, 18, 22];
const BULLET = PARTS.mg.dmg, SHELL = PARTS.cannon.dmg;
const SIDES = { front: 'N', rear: 'S', left: 'W', right: 'E' };   // the blueprint direction a shot from that side comes from
const SIDE_OF = { N: 'front', S: 'rear', W: 'left', E: 'right' };
const NEIGH = Object.values(DIRS);
const MAX_WEAPONS = 8, MAX_INSIGHTS = 6, MAX_WEAK_LANES = 2, MAX_BYTES = 2900;   // the whole analysis stays under 3 kB of JSON

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const mod360 = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return d; };
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const counted = (types) => {   // ['wheel', 'wheel', 'mg'] -> ['wheel x2', 'mg']
  const n = new Map();
  for (const t of types) n.set(t, (n.get(t) || 0) + 1);
  return [...n].map(([t, k]) => (k > 1 ? `${t} x${k}` : t));
};
const isMover = (d) => !!(d.mover || d.thrust);
/** Pieces whose loss is felt at once: guns, saws, whatever moves the car, reactors, batteries and kegs. */
const isVital = (d) => !!(d.weapon || isMover(d) || d.blast || d.id === 'reactor' || d.id === 'battery');
/** Worst to lose first: kegs, reactors, batteries, weapons, movers, the rest. */
const gravity = (type) => { const d = PARTS[type]; return d.blast ? 0 : type === 'reactor' ? 1 : type === 'battery' ? 2 : d.weapon ? 3 : isMover(d) ? 4 : 5; };

function gridOf(parts, alive) {
  const g = [new Int16Array(GRID_W * GRID_L).fill(-1), new Int16Array(GRID_W * GRID_L).fill(-1)];
  parts.forEach((p, i) => { if (alive[i]) for (const [x, y] of cellsOf(p)) g[p.z][cellIndex(x, y)] = i; });
  return g;
}

/** Indexes of pieces touching piece i: beside it on its layer, or stacked on / under it (as World.touching). */
function touching(parts, grid, i) {
  const p = parts[i], out = new Set();
  for (const [cx, cy] of cellsOf(p)) {
    const over = grid[1 - p.z][cellIndex(cx, cy)];
    if (over >= 0) out.add(over);
    for (const [dx, dy] of NEIGH) {
      if (!inGrid(cx + dx, cy + dy)) continue;
      const j = grid[p.z][cellIndex(cx + dx, cy + dy)];
      if (j >= 0 && j !== i) out.add(j);
    }
  }
  return out;
}

/** Whatever has no way left to the core falls off (World.settle): marks those pieces gone in `alive` and returns their indexes. */
function shed(parts, alive, coreI) {
  const grid = gridOf(parts, alive), held = new Set([coreI]), stack = [coreI], gone = [];
  while (stack.length) for (const j of touching(parts, grid, stack.pop())) if (!held.has(j)) { held.add(j); stack.push(j); }
  alive.forEach((a, j) => { if (a && !held.has(j)) { alive[j] = false; gone.push(j); } });
  return gone;
}

/** The studs of one lane, in the order a shot from `side` enters them. `at` is the lane's x (front / rear) or y (left / right). */
function lane(side, at) {
  const [dx, dy] = DIRS[SIDES[side]], out = [];
  if (dx === 0) for (let y = dy * GRID_HY; inGrid(at, y); y -= dy) out.push([at, y]);
  else for (let x = dx * GRID_HX; inGrid(x, at); x -= dx) out.push([x, at]);
  return out;
}

/** First piece a shot meets on a lane: the deck piece of the first occupied column, else its chassis piece. */
function firstHit(grid, cells) {
  for (const [x, y] of cells) {
    const k = cellIndex(x, y);
    if (grid[1][k] >= 0) return grid[1][k];
    if (grid[0][k] >= 0) return grid[0][k];
  }
  return -1;
}

/** Damage that gets through to a piece from one kinetic hit of `dmg` arriving from `side`. */
function getsThrough(p, dmg, side) {
  return hitOn(PARTS[p.type], dmg, 'kinetic', p.dir === SIDES[side]);
}

/** What stands between a shot from `side` along the core's own lane and the core. */
function coreCover(parts, coreI, side) {
  const core = parts[coreI];
  const alive = parts.map((p) => !PARTS[p.type].decor);
  const cells = lane(side, side === 'front' || side === 'rear' ? core.x : core.y);
  let hp = 0, bullet = 0, shell = 0, pieces = 0, first = 'core';
  for (let guard = 0; guard < parts.length; guard++) {
    const grid = gridOf(parts, alive);
    const i = firstHit(grid, cells);
    if (i < 0 || i === coreI) break;
    const p = parts[i], d = PARTS[p.type];
    if (!pieces) first = p.type;
    pieces++; hp += d.hp;
    bullet += (d.hp * BULLET) / getsThrough(p, BULLET, side);
    shell += (d.hp * SHELL) / getsThrough(p, SHELL, side);
    alive[i] = false;
    shed(parts, alive, coreI);
  }
  return { hp, hpVsBullet: Math.round(bullet), hpVsShell: Math.round(shell), pieces, first };
}

/**
 * What a shot drilling one lane from `side` takes off the car WITHOUT hitting it: the first moment at which what
 * has fallen off for want of a way to the core includes a mover, or two of the pieces `isVital` names.
 * @returns {null | { pieces, hp, dropped: number[] }} how many pieces had to be shot away, their hp, and what fell.
 */
function laneLoss(parts, coreI, side, at) {
  const alive = parts.map((p) => !PARTS[p.type].decor), cells = lane(side, at), dropped = [];
  let hp = 0;
  for (let pieces = 1; pieces <= parts.length; pieces++) {
    const i = firstHit(gridOf(parts, alive), cells);
    if (i < 0 || i === coreI) return null;
    hp += PARTS[parts[i].type].hp;
    alive[i] = false;
    dropped.push(...shed(parts, alive, coreI));
    const vital = dropped.filter((j) => isVital(PARTS[parts[j].type]));
    if (vital.length > 1 || vital.some((j) => isMover(PARTS[parts[j].type]))) return { pieces, hp, dropped };
  }
  return null;
}

/** Bearings (degrees clockwise from dead ahead) no interval of `covers` reaches. covers: [{ from, width }]. */
function blindArcs(covers) {
  if (!covers.length) return [[0, 360]];
  if (covers.some((c) => c.width >= 360)) return [];
  const merged = [];
  for (const [s, e] of covers.map((c) => [mod360(c.from), mod360(c.from) + c.width]).sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  // only the last interval can run past 360: what it covers there is taken off the front of the list
  let wrap = merged[merged.length - 1][1] - 360;
  while (merged.length > 1 && merged[0][0] <= wrap) wrap = Math.max(wrap, merged.shift()[1]);
  if (merged.length === 1 && merged[0][1] - merged[0][0] >= 360) return [];
  if (wrap > 0) merged[merged.length - 1][1] = wrap + 360;
  const out = [];
  merged.forEach(([, e], k) => {
    const next = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + 360;
    if (next - e >= 1) out.push([Math.round(mod360(e)), Math.round(mod360(next)) || 360]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}
const arcWidth = ([from, to]) => (to - from + 360) % 360 || 360;
const arcHolds = ([from, to], deg) => arcWidth([from, to]) === 360 || mod360(deg - from) <= arcWidth([from, to]);

/**
 * Analyse a validated design.
 * @param {object} validated  what validateDesign returns ({ design, stats }), or a normalised design ({ parts })
 * @param {object} [stats]    its stats, when `validated` is a bare design (computed if left out)
 * @returns {object} { coreProtection, exposed, weapons, otherWeapons?, dpsByRange, dpsByRangeRear, blindArcsDeg, energy, fire,
 *   mass, weakLanes?, insights }. `weakLanes`: the (at most two) lanes on which the least hp has to be shot away before a
 *   mover, or two guns / reactors / batteries / kegs, fall off without being hit — `{ from, x | y, shotAway, hp, thenFallOff }`,
 *   the lane named by its stud x (shots from the front or rear) or y (from the left or right).
 *   Sides are front / rear / left / right; bearings are degrees clockwise from dead ahead
 *   (90 = right, 180 = astern); `weapons[].i` is the piece index a controller fires it by. Empty entries are left out.
 */
export function analyzeDesign(validated, stats) {
  const design = validated && validated.design ? validated.design : validated;
  if (!design || !Array.isArray(design.parts)) throw new TypeError('analyzeDesign needs a validated design: validateDesign(...) or its .design');
  const parts = design.parts.map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, dir: p.dir || 'N' }));
  const coreI = parts.findIndex((p) => p.type === 'core');
  if (coreI < 0) throw new TypeError('analyzeDesign: the design has no core');
  const st = (validated && validated.stats) || stats || computeStats(parts);
  const solid = parts.map((p) => !PARTS[p.type].decor);
  const solidIdx = parts.map((_, i) => i).filter((i) => solid[i]);
  const grid = gridOf(parts, solid);
  const agg = aggregate(solidIdx.map((i) => parts[i]));

  // ── what a shot meets ───────────────────────────────────────────────────
  const coreProtection = {}, exposed = {}, firstFrom = {};
  for (const side of Object.keys(SIDES)) {
    coreProtection[side] = coreCover(parts, coreI, side);
    const seen = new Set(), half = side === 'front' || side === 'rear' ? GRID_HX : GRID_HY;
    for (let at = -half; at <= half; at++) { const i = firstHit(grid, lane(side, at)); if (i >= 0) seen.add(i); }
    firstFrom[side] = seen;
    const vital = [...seen].filter((i) => isVital(PARTS[parts[i].type])).map((i) => parts[i].type).sort((a, b) => gravity(a) - gravity(b));
    if (vital.length) exposed[side] = counted(vital);
  }

  // ── guns: where they point and how far they reach ───────────────────────
  const guns = [], others = [];   // guns reach out; saws, spikes, plows, pistons and kegs do not
  parts.forEach((p, i) => {
    const d = PARTS[p.type];
    if (d.weapon && d.range && d.weapon !== 'hook') guns.push({ i, p, d, dps: d.dps ?? (d.dmg * (d.salvo || 1)) / d.cooldown, facingDeg: mod360(Math.round((-DIR_ANGLE[p.dir] * 180) / Math.PI)), arcDeg: Math.round((d.arc * 180) / Math.PI) });
    else if (d.weapon || d.ramOut > 1 || d.punch || d.blast) others.push(`${p.type} ${p.dir}`);
  });
  const weapons = guns.slice(0, MAX_WEAPONS).map((g) => ({
    i: g.i, type: g.p.type, facing: g.p.dir, arcDeg: g.arcDeg, range: g.d.range, ...(g.d.minRange ? { minRange: g.d.minRange } : {}), dps: r1(g.dps),
    coversBearingsDeg: g.arcDeg >= 180 ? [0, 360] : [mod360(g.facingDeg - g.arcDeg), mod360(g.facingDeg + g.arcDeg)],
  }));
  const blindArcsDeg = blindArcs(guns.map((g) => ({ from: g.facingDeg - g.arcDeg, width: 2 * g.arcDeg })));
  // can this gun be brought to bear on the point (u ahead, v to the left) of the blueprint origin?  (World.stepWeapons)
  const reaches = (g, u, v) => {
    const [cx, cy] = centerOf(g.p), du = u - cy * CELL, dv = v + cx * CELL, dist = Math.hypot(du, dv);
    if (Math.abs(angDiff(Math.atan2(dv, du), DIR_ANGLE[g.p.dir])) > g.d.arc + 0.02) return false;
    // a mortar shell lands minRange..range from its mount: it counts when it can burst within half its blast radius of the point
    if (g.d.minRange) return dist >= g.d.minRange - g.d.splash.r / 2 && dist <= g.d.range + g.d.splash.r / 2;
    return dist <= g.d.range + g.d.size[1] * CELL * 0.5 + CELL * 0.15;           // everything else flies its range from the muzzle
  };
  const dpsAt = (sign) => Object.fromEntries(ANALYSIS_RANGES.map((m) => [m, Math.round(guns.reduce((s, g) => s + (reaches(g, agg.comU + sign * m, agg.comV) ? g.dps : 0), 0))]));
  const dpsByRange = dpsAt(1), dpsByRangeRear = dpsAt(-1);

  // ── energy ──────────────────────────────────────────────────────────────
  const net = st.energyDrain - st.energyRegen;
  const energy = { regen: st.energyRegen, drainAllFiring: st.energyDrain, capacity: st.energyCap, secondsOfFullFire: net > 0 ? Math.round(st.energyCap / net) : null };
  if (net <= 0) energy.note = st.energyDrain > 0 ? 'regen covers everything running at once: it never runs dry' : 'nothing on board draws energy';
  else if (st.thrusters) energy.note = `drain counts ${st.thrusters} thruster${st.thrusters > 1 ? 's' : ''} burning (${PARTS.thruster.energyUse}/s each)`;

  // ── fire ────────────────────────────────────────────────────────────────
  const burns = (i) => solid[i] && PARTS[parts[i].type].burn > 0;
  const burnable = solidIdx.filter(burns), clusterOf = new Map(), clusters = [];
  for (const start of burnable) {
    if (clusterOf.has(start)) continue;
    const members = [start], stack = [start];
    clusterOf.set(start, clusters.length);
    while (stack.length) for (const j of touching(parts, grid, stack.pop())) if (burns(j) && !clusterOf.has(j)) { clusterOf.set(j, clusters.length); members.push(j); stack.push(j); }
    clusters.push(members);
  }
  const biggest = clusters.reduce((best, c) => (c.length > best.length ? c : best), []);
  const reachesTypes = [...new Set(biggest.map((i) => parts[i].type).filter((t) => PARTS[t].cat !== 'structure'))].sort((a, b) => gravity(a) - gravity(b)).slice(0, 8);
  // a fire lit on the nose (the pieces a flame from ahead meets first) cannot walk to a piece that touches the core
  const noseClusters = new Set([...firstFrom.front].filter(burns).map((i) => clusterOf.get(i)));
  const firebreak = ![...touching(parts, grid, coreI)].some((i) => burns(i) && noseClusters.has(clusterOf.get(i)));
  const fire = { burnableShare: solidIdx.length ? r2(burnable.length / solidIdx.length) : 0, largestBurnableCluster: biggest.length, clusterReaches: reachesTypes, firebreakBetweenFrontAndCore: firebreak };

  // ── mass ────────────────────────────────────────────────────────────────
  let y0 = Infinity, y1 = -Infinity, ahead = 0;
  for (const i of solidIdx) for (const [, y] of cellsOf(parts[i])) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const mid = (y0 + y1) / 2;
  for (const i of solidIdx) {
    const cells = cellsOf(parts[i]), m = PARTS[parts[i].type].mass / cells.length;
    for (const [, y] of cells) ahead += y > mid ? m : y === mid ? m / 2 : 0;
  }
  const mass = { total: st.mass, frontShare: agg.mass ? r2(ahead / agg.mass) : 0 };

  // ── what a shot down one lane takes with it ─────────────────────────────
  // pieces tied to the core only by what lies on one lane fall off when that lane has been shot out, untouched themselves
  const moversAll = solidIdx.filter((j) => isMover(PARTS[parts[j].type])).length;
  const losses = [];
  for (const side of Object.keys(SIDES)) {
    const half = side === 'front' || side === 'rear' ? GRID_HX : GRID_HY;
    for (let at = -half; at <= half; at++) {
      const l = laneLoss(parts, coreI, side, at);
      if (!l) continue;
      const movers = l.dropped.filter((j) => isMover(PARTS[parts[j].type])).length, vital = l.dropped.filter((j) => isVital(PARTS[parts[j].type])).length;
      losses.push({ side, at, ...l, movers, vital, worth: (vital + (moversAll ? (2 * movers) / moversAll : 0)) / l.hp });
    }
  }
  losses.sort((a, b) => b.worth - a.worth || a.hp - b.hp || a.side.localeCompare(b.side) || a.at - b.at);
  const weakLanes = losses.slice(0, MAX_WEAK_LANES).map((l) => ({ from: l.side, [l.side === 'front' || l.side === 'rear' ? 'x' : 'y']: l.at, shotAway: l.pieces, hp: l.hp,
    thenFallOff: counted(l.dropped.map((j) => parts[j].type).sort((a, b) => gravity(a) - gravity(b))) }));

  // ── what to do about it ─────────────────────────────────────────────────
  const notes = [];
  const say = (weight, text) => notes.push({ weight, text });
  const sideNames = Object.keys(SIDES);

  const THIN = PARTS.armor.hp;   // less cover than one armor brick, counted against shells
  const open = sideNames.filter((s) => coreProtection[s].pieces === 0);
  const thin = sideNames.filter((s) => coreProtection[s].pieces > 0 && coreProtection[s].hpVsShell <= THIN).sort((a, b) => coreProtection[a].hpVsShell - coreProtection[b].hpVsShell);
  if (open.length) say(open.includes('front') ? 100 : 90, `Core is the first piece hit from the ${listOf(open)}: nothing covers its ${PARTS.core.hp} hp there. One armor brick on that lane adds ${PARTS.armor.hp} hp and halves mg hits.`);
  if (thin.length) {
    const c = coreProtection[thin[0]], n = (k) => `${k} piece${k > 1 ? 's' : ''}`;
    say(thin[0] === 'front' ? 78 : 70, `Core can be reached from the ${thin[0]} through ${n(c.pieces)} worth ${c.hp} hp (${r1(c.hpVsBullet / (PARTS.mg.dmg / PARTS.mg.cooldown))} s of one mg)`
      + `${thin.slice(1).map((s) => `; ${s}: ${n(coreProtection[s].pieces)}, ${coreProtection[s].hp} hp`).join('')}. Put armor or a slope on ${thin.length > 1 ? 'those lanes' : 'that lane'}.`);
  }

  const widest = blindArcsDeg.reduce((best, a) => (!best || arcWidth(a) > arcWidth(best) ? a : best), null);
  const turn = st.turnRate > 0 ? `; turning 180° takes ${r1(Math.PI / st.turnRate)} s` : '';
  if (!guns.length) {
    if (others.length) say(48, `No gun on board (${listOf(counted(others.map((c) => c.split(' ')[0])))}): ${st.kegs ? 'a thrown keg rolls about 10 m, the rest' : 'it'} only hurts what it touches, so top speed ${st.topSpeed} m/s and the approach decide every fight.`);
  } else if (widest && arcWidth(widest) >= 120) {
    const facings = [...new Set(guns.map((g) => g.p.dir))];
    const who = facings.length === 1 ? `All ${guns.length > 1 ? `${guns.length} guns face` : 'fire comes from one gun facing'} ${SIDE_OF[facings[0]]}` : 'Guns leave a gap';
    say(arcHolds(widest, 0) ? 58 : 52, `${who}: nothing covers bearings ${widest[0]}°–${widest[1]}° (${arcWidth(widest)}° blind; 0° ahead, 90° right)${turn}. A turret facing that way or a mortar (360°) closes it.`);
  }

  if (energy.secondsOfFullFire !== null && energy.secondsOfFullFire < 30) {
    const t = energy.secondsOfFullFire;
    const jets = st.thrusters ? ` (${st.thrusters * PARTS.thruster.energyUse} of it thrusters)` : '';
    say(t < 10 ? 75 : t < 20 ? 55 : 40, `Everything running at once draws ${st.energyDrain} energy/s${jets} against ${st.energyRegen}/s regen: the ${st.energyCap} store is empty in ${t} s, then only ${Math.round((st.energyRegen / st.energyDrain) * 100)}% of it can run. `
      + `A reactor adds ${PARTS.reactor.energyRegen}/s, a battery ${PARTS.battery.energyCap}; or fire in bursts.`);
  }

  const sidesWith = (type) => sideNames.filter((s) => [...firstFrom[s]].some((i) => parts[i].type === type));
  const kegSides = sidesWith('keg'), reactorSides = sidesWith('reactor');
  if (kegSides.length) say(72, `A keg is the first piece hit from the ${listOf(kegSides)}: shot off (${PARTS.keg.hp} hp) it goes off on you for ${PARTS.keg.blast.dmg}. Cover it with a slope or plate, or throw it early.`);
  if (reactorSides.length) say(62, `A reactor is the first piece hit from the ${listOf(reactorSides)} (${PARTS.reactor.hp} hp): when it dies it blasts every piece touching it for ${PARTS.reactor.volatile} and ${PARTS.reactor.energyRegen} energy/s is gone. Bury it.`);

  // a lane that, shot out, drops guns or running gear nobody aimed at. Every lane beside the core cuts the car in two in the
  // end: it is worth a sentence when that costs less than the core itself (550 hp) and takes half the running gear or
  // two vital pieces along, or when it costs next to nothing
  if (losses.length) {
    const l = losses[0], w = weakLanes[0], axis = l.side === 'front' || l.side === 'rear' ? 'x' : 'y', many = l.dropped.length > 1;
    const half = l.movers > 0 && l.movers * 2 >= moversAll;
    if (l.hp <= 150 || (l.hp <= 500 && (half || l.vital > 1))) {
      say((half ? 66 : l.vital > 1 ? 56 : 46) - (l.hp > 300 ? 8 : 0), `Shooting out lane ${axis} ${l.at} from the ${l.side} (${l.pieces} piece${l.pieces > 1 ? 's' : ''}, ${l.hp} hp) drops ${listOf(w.thenFallOff.length > 4 ? [...w.thenFallOff.slice(0, 3), 'more'] : w.thenFallOff)} `
        + `untouched: all that ties ${many ? 'them' : 'it'} to the core lies on that lane. Put more or tougher pieces along it.`);
    }
  }

  // a flank whose every mover takes the first hit from that side
  const flank = (side) => {
    const sign = side === 'left' ? 1 : -1;
    const mine = solidIdx.filter((i) => PARTS[parts[i].type].mover && sign * (-centerOf(parts[i])[0] * CELL - agg.comV) > 0.05);
    const hit = mine.filter((i) => firstFrom[side].has(i));
    return mine.length && hit.length === mine.length ? { n: mine.length, hp: mine.reduce((s, i) => s + PARTS[parts[i].type].hp, 0), types: counted(mine.map((i) => parts[i].type)) } : null;
  };
  const flanks = ['left', 'right'].map((s) => [s, flank(s)]).filter(([, f]) => f && f.hp <= 320);
  if (flanks.length) {
    const [s0, f] = flanks[0];
    say(44, `${f.n > 1 ? `All ${f.n} movers` : 'The only mover'} on the ${listOf(flanks.map(([s]) => s))} (${listOf(f.types)}, ${f.hp} hp a side) take${f.n > 1 ? '' : 's'} the first hit from ${flanks.length > 1 ? 'their' : `the ${s0}`} side: `
      + `with one side gone it turns in circles. Cover them outboard or fit tougher ones (track ${PARTS.track.hp} hp).`);
  }

  // guns that take the first hit from the side they shoot at
  const bare = guns.filter((g) => firstFrom[SIDE_OF[g.p.dir]].has(g.i));
  if (bare.length && bare.length * 2 >= guns.length) {
    const dirs = [...new Set(bare.map((g) => SIDE_OF[g.p.dir]))];
    say(42, `${bare.length} of ${guns.length} guns (${listOf(counted(bare.map((g) => g.p.type)))}) are the first piece hit from the ${listOf(dirs)}, the side they fire at. A low slope or plate one stud ahead takes the hit and does not block the lane.`);
  }

  const inBig = (t) => biggest.some((i) => parts[i].type === t);
  if (fire.burnableShare >= 0.6 && biggest.length * 2 >= solidIdx.length) {
    const vitals = reachesTypes.filter((t) => t === 'keg' || t === 'reactor' || t === 'battery');
    say(36 + (inBig('keg') ? 20 : 0) + (inBig('reactor') ? 6 : 0), `${Math.round(fire.burnableShare * 100)}% of pieces burn and ${biggest.length} of them touch in one cluster${vitals.length ? ` that includes the ${listOf(vitals)}` : ''}: `
      + `one fire can walk across it${inBig('keg') ? ' and a keg that catches goes off' : ''}. A row of armor, slopes or tracks is a firebreak.`);
  }

  if (guns.length) {
    const ahead = ANALYSIS_RANGES.filter((m) => dpsByRange[m] > 0), reach = Math.max(...guns.map((g) => g.d.range));
    const longer = Object.values(PARTS).filter((d) => d.weapon && d.range > reach).sort((a, b) => a.range - b.range);
    if (reach <= PARTS.mg.range && longer.length) say(35, `Longest gun reaches ${reach} m; ${listOf(longer.slice(-3).map((d) => `${d.id} ${d.range} m`))} outrange it. Expect to take fire while closing on open maps: use cover or speed.`);
    if (ahead.length && ahead[0] > ANALYSIS_RANGES[0]) {
      const lobs = guns.filter((g) => g.d.minRange), why = lobs.length === guns.length ? `mortars cannot land closer than ${Math.min(...lobs.map((g) => g.d.minRange))} m` : 'narrow arcs off the centreline do not converge that close';
      say(50, `No gun bears on a target ${ANALYSIS_RANGES[0]} m dead ahead (first dps at ${ahead[0]} m: ${why}): a rammer that gets inside is safe from the guns.`);
    }
  }

  const insights = notes.sort((a, b) => b.weight - a.weight).slice(0, MAX_INSIGHTS).map((n) => n.text);
  const out = {
    coreProtection, exposed, weapons, ...(guns.length > MAX_WEAPONS ? { weaponsNotListed: guns.length - MAX_WEAPONS } : {}),
    ...(others.length ? { otherWeapons: counted(others) } : {}),
    dpsByRange, dpsByRangeRear, blindArcsDeg, energy, fire, mass, ...(weakLanes.length ? { weakLanes } : {}), insights,
  };
  while (insights.length > 3 && JSON.stringify(out).length > MAX_BYTES) insights.pop();   // the least important go first
  return out;
}
