// Insights: what a match's telemetry says in words, most important first. Pure functions of the
// match data — the same result gives the same sentences — so an agent can read why a vehicle won
// or lost before it reads any table, and a benchmark can count which findings keep coming back.
import { PARTS } from './parts.js';
import { compactTelemetry, BANDS, SIDES } from './telemetry.js';

const MAX_INSIGHTS = 6;
const pct = (x) => Math.round(x * 100);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const total = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
// sources of damage nobody fired
const NOBODYS = { lava: 'lava', zone: 'the shrinking zone', wall: 'driving into walls', fire: 'fire', barrel: 'a powder barrel', keg: 'a keg nobody is credited with' };
/** In words: the source `weapon` of vehicle `by` (null: nobody's), as seen from vehicle `self`. `who` names a vehicle. */
function blame(who, self, by, weapon) {
  if (by === null || by === undefined) return NOBODYS[weapon] || weapon;
  if (by === self) return weapon === 'fire' ? 'a fire of its own making' : `its own ${weapon}`;
  if (weapon === 'reactor') return `its reactor blowing up under ${who(by)}'s fire`;
  if (weapon === 'fire') return `a fire ${who(by)} lit`;
  if (weapon === 'ram') return `collisions with ${who(by)}`;
  return `${who(by)}'s ${weapon}`;
}

/** One vehicle of a match result or of its summary, in one shape: the rounded telemetry, when it died and of what. */
function look(res, id) {
  const v = res && Array.isArray(res.vehicles) ? res.vehicles.find((x) => x.id === id) : null;
  if (!v || !v.telemetry) return null;
  const who = (i) => { const o = res.vehicles.find((x) => x.id === i); return o ? `${o.name}#${o.id}` : 'nobody'; };
  let death = null;
  if (!v.alive) {
    if (v.death) {   // a summary names the killer ("name#id" or "environment"); a digest gives its id
      const m = typeof v.death.by === 'string' ? /#(\d+)$/.exec(v.death.by) : null;
      death = { t: v.death.t, cause: v.death.cause, by: typeof v.death.by === 'number' ? v.death.by : m ? Number(m[1]) : -1 };
    } else death = { t: v.deathT, cause: v.deathCause, by: v.killedBy ?? -1 };
  }
  return { v, who, death, t: compactTelemetry(v.telemetry), st: v.stats || {}, hull: v.hullLeft ?? v.hpFrac ?? 0,
    life: death ? death.t : res.duration ?? 0 };
}

/**
 * The findings for one vehicle as [{ kind, text }], at most six, most important first. `kind` is a
 * stable key (outcome, terrain, immobile, weapons_lost, silent_guns, energy_starved, too_close, wrong_range,
 * flanked, stuck, parked, fire, turned, low_accuracy, damage_source) for counting across matches.
 * Takes a match result (runMatch) or its summary (summarize): both give the same findings.
 */
export function insightList(res, id) {
  const c = look(res, id);
  if (!c) return [];
  const { v, who, death, t, st, hull, life } = c;
  const out = [];
  const say = (kind, text) => out.push({ kind, text });
  const dealt = Math.round(st.damageDealt || 0), taken = Math.round(st.damageTaken || 0);
  const last = t.taken.lastHit, bw = t.taken.byWeapon;
  const killer = death && death.by >= 0 && death.by !== v.id ? who(death.by) : null;
  const terrain = (bw.lava || 0) >= (bw.zone || 0) ? 'lava' : 'zone';

  // how it ended
  if (!death) {
    const how = res.winner === null || res.winner === undefined ? 'the match was stopped early' : res.winner < 0 ? 'the match was a draw' : res.winner === v.team ? 'its team won' : 'its team lost';
    say('outcome', `survived with ${pct(hull)}% hull; ${how}${res.reason && res.winner !== null && res.winner !== undefined ? ` (${res.reason})` : ''}; dealt ${dealt} damage, took ${taken}`);
  } else {
    const blow = killer && last && last.by === death.by && death.t - last.t <= 0.25 ? `'s ${last.weapon}` : '';
    let how;
    if (death.cause === 'fell') how = 'fell into a pit';
    else if (death.cause === 'wrecked') how = `written off as a wreck (nothing left that moves it, nothing left that can hurt)${killer ? ` after hits from ${killer}` : ''}`;
    else if (death.cause === 'burn') how = terrain === 'lava' ? 'core burnt out in lava' : 'core destroyed outside the safe zone';
    else if (death.cause === 'fire') how = `core lost to fire${killer ? ` lit by ${killer}` : ''}`;
    else how = killer ? `core destroyed by ${killer}${blow}` : `core destroyed (${death.cause}, no enemy credited)`;
    say('outcome', `destroyed at ${f1(death.t)} s: ${how}; dealt ${dealt} damage, took ${taken}`);
  }

  // killed by the map
  if (death && death.cause === 'fell') {
    if (killer) say('terrain', `fell into a pit at ${f1(death.t)} s within 4 s of contact with ${killer}${last && last.by === death.by && death.t - last.t <= 4 ? (last.weapon === 'fire' ? ' (whose fire was still burning on it)' : ` (its ${last.weapon} hit ${f1(death.t - last.t)} s before)`) : ''}: pushed, knocked or dragged in`);
    else say('terrain', `drove into a pit at ${f1(death.t)} s with no enemy contact in the 4 s before: a driving mistake, not a kill`);
  } else if (death && death.cause === 'burn') {
    const before = last && death.t - last.t <= 4 ? `; ${who(last.by)}'s ${last.weapon} had hit it ${f1(death.t - last.t)} s before` : '; no enemy hit in the 4 s before';
    if (terrain === 'lava') say('terrain', `died in lava at ${f1(death.t)} s after ${f1((st.timeOn && st.timeOn.lava) || 0)} s on lava tiles (${bw.lava || 0} damage)${before}`);
    else say('terrain', `died outside the safe zone at ${f1(death.t)} s after ${f1(st.timeOutsideZone || 0)} s outside it (${bw.zone || 0} damage)${before}`);
  } else if (taken >= 40 && (bw[terrain] || 0) >= 0.4 * taken) {
    say('terrain', `${pct(bw[terrain] / taken)}% of the damage it took (${bw[terrain]} of ${taken}) came from ${NOBODYS[terrain]}: ${terrain === 'lava'
      ? `${f1((st.timeOn && st.timeOn.lava) || 0)} s on lava tiles` : `${f1(st.timeOutsideZone || 0)} s outside the safe zone`}`);
  }

  // nothing left to drive with
  const im = t.move.immobileAt;
  if (im !== null && life - im >= 5) say('immobile', `lost all ${t.move.movers} movers by ${f1(im)} s and could not drive for the remaining ${f1(life - im)} s`);

  // weapons gone early
  // (half of them gone with a fifth of its life, and five seconds, still to go; the last two seconds are the end itself)
  const guns = t.weapons, gone = guns.filter((g) => g.lostAt !== null && g.lostAt <= life - 2).sort((a, b) => a.lostAt - b.lostAt || a.i - b.i);
  const half = Math.ceil(guns.length / 2);
  if (guns.length && gone.length >= half && gone[half - 1].lostAt <= life - Math.max(5, 0.2 * life)) {
    const g = gone[0];
    const by = g.lostBy ?? null;
    const to = g.lostTo === 'detached' ? (by === null || by === v.id ? 'when what held it came off' : `when ${who(by)} shot away what held it`)
      : g.lostTo === 'jettisoned' || g.lostTo === 'detonated' ? `(${g.lostTo} by its own controller)` : `to ${blame(who, v.id, by, g.lostTo)}`;
    if (guns.length === 1) say('weapons_lost', `lost its only weapon (${g.type}) at ${f1(g.lostAt)} s ${to}, ${f1(life - g.lostAt)} s before the end`);
    else say('weapons_lost', `lost ${gone.length} of ${guns.length} weapons by ${f1(gone[gone.length - 1].lostAt)} s (first: ${g.type} at ${f1(g.lostAt)} s ${to})`);
  }

  // an enemy in range and the guns quiet
  const F = t.fire, R = F.timeTargetInReach, on = F.timeFiring;
  if (R >= 6 && on <= 0.5 * R) {
    const explained = F.timeNoLineOfSight + F.timeOutOfArc + (F.timeTargetUnseen || 0) + (F.timeHoldingFire || 0) + (F.timeStunned || 0);
    const why = [
      [Math.min(F.timeEnergyStarved, Math.max(0, R - on - explained)), 'energy-starved'],
      [F.timeOutOfArc, 'aim outside the arc or still traversing'],
      [F.timeNoLineOfSight, 'no line of sight'],
      [F.timeTargetUnseen || 0, 'target not visible to the team'],
      [F.timeHoldingFire || 0, 'not commanded to fire'],
      [F.timeStunned || 0, 'stunned'],
    ].filter((x) => x[0] >= 1).sort((a, b) => b[0] - a[0]).slice(0, 3);
    say('silent_guns', `an enemy was inside gun range for ${f1(R)} s but the guns fired for only ${f1(on)} s (${pct(on / R)}%)${why.length ? `: ${why.map(([s, w]) => `${f1(s)} s ${w}`).join(', ')}` : ''}`);
  } else if (R >= 6 && F.timeEnergyStarved >= 0.3 * R) {
    say('energy_starved', `a gun that was lined up lacked the energy to fire for ${f1(F.timeEnergyStarved)} s of the ${f1(R)} s an enemy was in range: the energy budget does not carry the weapons`);
  }

  // an enemy sitting where the only guns left cannot reach down to
  const under = F.timeTargetTooClose || 0;
  if (under >= 6 && under >= 0.2 * life) say('too_close', `an enemy was inside the minimum range of the only guns it had left for ${f1(under)} s (a mortar cannot hit closer than ${PARTS.mortar.minRange} m)`);

  // hurt at a distance it does not fight at
  const tr = t.taken.byRange, dr = t.dealt.byRange, trSum = total(tr);
  if (trSum >= 40 && trSum >= 0.25 * taken) {
    const [band, got] = Object.entries(tr).sort((a, b) => b[1] - a[1])[0];
    const gave = dr[band] || 0;
    if (got >= 0.5 * trSum && gave <= 0.35 * got) {
      const best = Object.entries(dr).sort((a, b) => b[1] - a[1])[0];
      say('wrong_range', `${pct(got / trSum)}% of the damage attackers did to it (${got} of ${trSum}) arrived with the attacker ${band} m away, a range at which it dealt only ${gave}${
        best && best[0] !== band && best[1] > gave ? `; its own damage was mostly dealt at ${best[0]} m (${best[1]})` : best ? '' : '; it dealt no damage at any range'}`);
    }
  }

  // hit from behind or from one side
  // (not news when that is the side most of its guns point out of: a car built to fight backwards is hit in the back)
  const sides = t.taken.bySide, sided = total(sides);
  if (sided >= 40) {
    const facing = { N: 'front', E: 'right', S: 'rear', W: 'left' };
    for (const [side, word] of [['rear', 'the rear'], ['left', 'the left flank'], ['right', 'the right flank']]) {
      if (guns.length && guns.filter((g) => facing[g.dir] === side).length * 2 > guns.length) continue;
      if ((sides[side] || 0) >= 0.55 * sided) { say('flanked', `${pct(sides[side] / sided)}% of the damage that came from a direction (${sides[side]} of ${sided}) came from ${word}`); break; }
    }
  }

  // going nowhere
  // (not the seconds spent shoving an enemy: for a rammer that is the job — and not the seconds after its last mover went)
  const jammed = t.move.timeStuck - (t.move.timeStuckOnEnemy || 0) - (im !== null ? Math.max(0, life - im) : 0);
  if (jammed >= 5) say('stuck', `spent ${f1(jammed)} s of its ${f1(life)} s stuck with no enemy touching it: throttle above half, speed under 0.3 m/s`);
  // standing still by its own command with nobody in reach
  const parked = t.move.timeParked || 0;
  if (parked >= 6) say('parked', `stood still for ${f1(parked)} s of its ${f1(life)} s with the nearest enemy about ${Math.round(t.move.parkedAt)} m away, beyond every gun it had: its own command asked for no movement. Look for what zeroes the throttle there (a hazard guard, a route with no next step)`);

  // on fire
  const burning = st.timeBurning || 0, burnt = t.lossesByCause.fire || 0;
  if (burning >= 5 || burnt >= 2) {
    const lit = t.taken.top.find((x) => x.weapon === 'fire' && x.by !== null);
    say('fire', `burned for ${f1(burning)} s: ${bw.fire || 0} fire damage, ${burnt} piece${burnt === 1 ? '' : 's'} lost to fire${lit ? (lit.by === v.id ? ' (set alight by a blast of its own)' : ` (lit by ${who(lit.by)})`) : ''}`);
  }

  // hits that land and are turned: the other side's slopes and armor took most of what its guns carried
  const turned = st.turnedAway || 0;
  if (turned >= 150 && turned >= 0.5 * (dealt + turned)) {
    say('turned', `slopes and armor took ${pct(turned / (dealt + turned))}% of what its hits carried (${Math.round(turned)} of ${Math.round(dealt + turned)} damage turned away): `
      + 'aim at pieces that are neither, come at a slope from behind its face, or carry what they do not stop (a mortar, a laser, a rail slug, fire)');
  }

  // shots that do not land
  const byType = new Map();
  for (const g of guns) {
    const def = PARTS[g.type];
    if (!def || !def.weapon || def.weapon === 'melee' || def.weapon === 'hook') continue;
    const row = byType.get(g.type) || { type: g.type, shots: 0, hits: 0, beam: def.dps !== undefined, salvo: def.salvo || 1 };
    row.shots += g.shots; row.hits += g.hits;
    byType.set(g.type, row);
  }
  const wild = [...byType.values()].filter((x) => x.shots >= 10 && x.hits < 0.4 * x.shots * x.salvo).map((x) => (x.beam
    ? `${x.type} on target ${f1(x.hits)} of ${f1(x.shots)} s (${pct(x.hits / x.shots)}%)`
    : `${x.type} ${Math.round(x.hits)} of ${Math.round(x.shots * x.salvo)} ${x.salvo > 1 ? 'missiles' : 'shots'} hit (${pct(x.hits / (x.shots * x.salvo))}%)`));
  if (wild.length) say('low_accuracy', `low accuracy: ${wild.slice(0, 3).join('; ')}`);

  // one thing did most of it
  const top = t.taken.top[0];
  if (top && taken >= 40 && top.damage >= 0.5 * taken && !(top.by === null && top.weapon === terrain && out.some((x) => x.kind === 'terrain'))) {
    say('damage_source', `${pct(top.damage / taken)}% of the damage it took (${top.damage} of ${taken}) came from ${blame(who, v.id, top.by, top.weapon)}`);
  }
  return out.slice(0, MAX_INSIGHTS);
}

/** Up to six short findings about one vehicle of a match (a result of runMatch, or its summary), most important first. */
export function insightsFor(res, id) {
  return insightList(res, id).map((x) => x.text);
}

/**
 * What a benchmark needs of one match and no more: the score, and per vehicle its end, the rounded
 * telemetry without timeline (first three pieces lost only) and its insights with their kinds.
 */
export function matchDigest(res) {
  return {
    winner: res.winner, reason: res.reason, duration: res.duration, teams: res.teams,
    vehicles: res.vehicles.map((v) => {
      const telemetry = compactTelemetry(v.telemetry, { brief: true });
      if (telemetry) telemetry.losses = v.telemetry.losses.slice(0, 3).map((l) => ({ t: r1(l.t), type: l.type, cause: l.cause, by: l.by ?? null }));
      return { id: v.id, team: v.team, slot: v.slot, name: v.name, bot: v.bot, alive: v.alive,
        death: v.alive ? null : { t: v.deathT, cause: v.deathCause, by: v.killedBy },
        hullLeft: v.hpFrac, errors: v.errors, telemetry, insights: insightList(res, v.id) };
    }),
  };
}

const LEGEND = 'damage in hp, times in seconds, distances in metres between vehicle centres; zero entries are left out. '
  + 'Numbers as keys, `by` and `lostBy` are vehicle ids; "env"/null = nobody (lava, zone, walls, fire nobody lit). '
  + 'weapons[]: shots and hits are seconds for lasers and flamers, punches for pistons; firingTime counts the wait between shots while the trigger is held. '
  + 'dealt counts enemies only; taken counts everything. bySide: where the hit came from relative to your heading at that moment (fire, lava and zone have no side and no range). '
  + 'range.timeIn: seconds with the nearest living enemy in each band. fire.*: only the seconds a living enemy was inside the range of your longest living gun (harpoons aside; a mortar from its minimum range out). '
  + 'move.timeParked: speed under 0.3 m/s with the throttle command at 0.15 or less while every living enemy was beyond the range of every gun (parkedAt: how far the nearest was, on average); '
  + 'move.timeStuck: throttle above half, speed under 0.3 m/s (timeStuckOnEnemy: the part of it spent against an enemy). losses: your first 12 pieces lost. timeline: one sample every `step` s while alive (hull %, energy %, metres to the nearest enemy, weapons left).';

/** A saved match as telemetry: per vehicle (or for the one with id `vehicle`) its end, the rounded telemetry and its insights. */
export function telemetryView(res, vehicle) {
  if (!res.vehicles.some((v) => v.telemetry)) throw new Error('this replay was saved before the engine kept telemetry: run the match again with save_replay: true');
  const pick = vehicle === undefined || vehicle === null ? res.vehicles : res.vehicles.filter((v) => v.id === vehicle);
  if (!pick.length) throw new Error(`no vehicle ${vehicle} in this match: the ids are ${res.vehicles.map((v) => `${v.id} (${v.name})`).join(', ')}`);
  const who = (id) => (id >= 0 && res.vehicles[id] ? `${res.vehicles[id].name}#${id}` : 'environment');
  return {
    map: res.map, mode: res.mode, seed: res.seed, result: res.winner === null ? 'unfinished' : res.winner < 0 ? 'draw' : `team ${res.winner} wins`, reason: res.reason, duration: res.duration,
    legend: LEGEND,
    vehicles: pick.map((v) => ({
      id: v.id, team: v.team, name: v.name, bot: v.bot, alive: v.alive,
      death: v.alive ? null : { t: v.deathT, cause: v.deathCause, by: who(v.killedBy) }, hullLeft: v.hpFrac,
      insights: insightsFor(res, v.id), telemetry: compactTelemetry(v.telemetry),
    })),
  };
}

// ── across many matches ─────────────────────────────────────────────────
const add = (acc, o) => { for (const [k, x] of Object.entries(o || {})) if (typeof x === 'number') acc[k] = (acc[k] || 0) + x; return acc; };
/** Each entry as its share of the whole (2 decimals), entries that round to nothing left out; `top` keeps the biggest. */
function shares(o, top) {
  const sum = total(o);
  if (!(sum > 0)) return {};
  let es = Object.entries(o).map(([k, x]) => [k, r2(x / sum)]).filter(([, x]) => x > 0);
  if (top) es = es.sort((a, b) => b[1] - a[1]).slice(0, top);
  return Object.fromEntries(es);
}

const inOrder = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
// the five every vehicle has, then the ones that are only there when they are not zero
const FIRE_KEYS = ['timeTargetInReach', 'timeFiring', 'timeNoLineOfSight', 'timeOutOfArc', 'timeEnergyStarved', 'timeTargetUnseen', 'timeHoldingFire', 'timeStunned', 'timeTargetTooClose', 'timeFiringNoTarget'];

function diagnoseGroup(rows) {
  if (!rows.length) return { matches: 0 };
  const deaths = {}, byWeapon = {}, bySide = {}, timeIn = {}, fire = {}, first = {}, kinds = new Map();
  let hull = 0, vehicles = 0, dist = 0, distT = 0, duration = 0;
  for (const r of rows) {
    duration += r.duration;
    const types = new Set(), found = new Map();
    for (const v of r.vehicles) {
      vehicles++; hull += v.hullLeft || 0;
      if (v.death) deaths[v.death.cause] = (deaths[v.death.cause] || 0) + 1;
      const t = v.telemetry;
      if (t) {
        add(byWeapon, t.taken.byWeapon); add(bySide, t.taken.bySide); add(timeIn, t.range.timeIn); add(fire, t.fire);
        const seconds = total(t.range.timeIn);
        if (t.range.mean !== null && seconds > 0) { dist += t.range.mean * seconds; distT += seconds; }
        for (const l of (t.losses || []).slice(0, 3)) types.add(l.type);
      }
      for (const i of v.insights || []) if (i.kind !== 'outcome' && !found.has(i.kind)) found.set(i.kind, i.text);
    }
    for (const type of types) first[type] = (first[type] || 0) + 1;
    for (const [kind, text] of found) {
      const e = kinds.get(kind) || { kind, matches: 0, example: text };
      e.matches++;
      kinds.set(kind, e);
    }
  }
  const reach = fire.timeTargetInReach || 0;
  return {
    matches: rows.length, meanHullLeft: r2(hull / vehicles), meanDuration: r1(duration / rows.length),
    deathCauses: deaths,
    takenByWeapon: shares(byWeapon, 5), takenBySide: inOrder(shares(bySide), SIDES),
    meanRange: distT > 0 ? r1(dist / distT) : null, timeInBand: inOrder(shares(timeIn), BANDS),
    fire: { ...Object.fromEntries(FIRE_KEYS.map((k, i) => [k, Math.round(fire[k] || 0)]).filter(([, x], i) => i < 5 || x > 0)), firingShare: reach > 0 ? r2((fire.timeFiring || 0) / reach) : null },
    firstPiecesLost: Object.fromEntries(Object.entries(first).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6)),
    commonInsights: [...kinds.values()].sort((a, b) => b.matches - a.matches || (a.kind < b.kind ? -1 : 1)).slice(0, 6),
  };
}

/**
 * What a bot's matches have in common, apart for the ones it won and the ones it lost.
 * rows: [{ outcome: 'win' | 'loss' | 'draw', duration, vehicles: [the bot's own vehicles, as matchDigest gives them] }].
 * Per group: mean hull left and duration, death causes, where the damage taken came from (shares by
 * weapon and by side), mean range and share of time per range band, fire-discipline totals in seconds,
 * the pieces lost first (type → matches in which it was among the first three), and the insight kinds
 * that came up, with the number of matches each appeared in and one example.
 */
export function diagnose(rows) {
  const of = (outcome) => rows.filter((r) => r.outcome === outcome);
  const draws = of('draw');
  return {
    wins: diagnoseGroup(of('win')), losses: diagnoseGroup(of('loss')), ...(draws.length ? { draws: diagnoseGroup(draws) } : {}),
    legend: 'shares are fractions of the whole; fire totals are seconds summed over the matches (firingShare = firing / enemy in gun range); firstPiecesLost counts matches in which that piece type was among the first 3 lost; commonInsights counts matches in which a finding of that kind came up — compare losses with wins to see what is different when it goes wrong',
  };
}
