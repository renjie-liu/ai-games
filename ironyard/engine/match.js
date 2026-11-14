// Runs one full match: wires controllers to the World, records frames + events.
import { PARTS, ITEMS, TILES, RULES, CELL, GRID_HX, GRID_HY, PAINTS, DEFAULT_BUDGET } from './parts.js';
import { validateDesign, parseBlueprint, STOCK_DESIGN } from './design.js';
import { MAPS, MODES, SPAWN_SLOTS, describeMap } from './maps.js';
import { makeNav } from './nav.js';
import { makeRng, hashSeed } from './rng.js';
import { World, angDiff } from './sim.js';

export const ENGINE_VERSION = '0.2.0';

export class MatchError extends Error {
  constructor(message, detail) { super(message); this.name = 'MatchError'; this.detail = detail; }
}

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
const FROZEN_PARTS = deepFreeze(JSON.parse(JSON.stringify(PARTS)));
const FROZEN_ITEMS = deepFreeze(JSON.parse(JSON.stringify(ITEMS)));
const FROZEN_TILES = deepFreeze(JSON.parse(JSON.stringify(TILES)));

/** Helpers every controller receives as `api.util`. Pure functions, no hidden state. */
export const util = Object.freeze({
  clamp,
  blueprint: parseBlueprint,                 // ASCII art -> { name, paint, parts } (see AGENTS.md)
  angDiff,                                   // signed smallest difference a - b, in (-PI, PI]
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  angleTo: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
  /**
   * Intercept solution for a moving target and a projectile of the given speed.
   * Returns { x, y, angle, t }: pass it straight to `aim` (a point, so all guns converge).
   */
  lead(from, target, projSpeed) {
    const dx = target.x - from.x, dy = target.y - from.y;
    if (!Number.isFinite(projSpeed) || projSpeed <= 0) return { x: target.x, y: target.y, angle: Math.atan2(dy, dx), t: 0 };
    const vx = target.vx || 0, vy = target.vy || 0;
    const a = vx * vx + vy * vy - projSpeed * projSpeed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
    let t = 0;
    const disc = b * b - 4 * a * c;
    if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : 0;
    else if (disc >= 0) { const s = Math.sqrt(disc); const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a); t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity); }
    if (!Number.isFinite(t) || t < 0) t = 0;
    t = Math.min(t, 3);
    return { x: target.x + vx * t, y: target.y + vy * t, angle: Math.atan2(dy + vy * t, dx + vx * t), t };
  },
  /**
   * Simple pursuit controller: returns { throttle, steer, brake } that drives
   * `self` toward a point. Call as driveTo(self, x, y, opts) or driveTo(self, {x, y}, opts).
   * opts: { reverse: allow backing up, stopDist: metres, speed: 0..1 }
   */
  driveTo(self, x, y, opts) {
    if (x && typeof x === 'object') { opts = x.reverse ? { ...(y || {}), reverse: true } : y; y = x.y; x = x.x; }
    opts = opts || {};
    const dx = x - self.x, dy = y - self.y, d = Math.hypot(dx, dy);
    if (d < (opts.stopDist ?? 0.6)) return { throttle: 0, steer: 0, brake: 1 };
    let err = angDiff(Math.atan2(dy, dx), self.heading), dir = 1;
    if (opts.reverse && Math.abs(err) > Math.PI * 0.6) { err = angDiff(err + Math.PI, 0); dir = -1; }
    const steer = clamp(err * 2.2 - (self.angVel || 0) * 0.35, -1, 1) * dir;
    const align = Math.max(0, Math.cos(err));
    let throttle = (opts.speed ?? 1) * dir * (Math.abs(err) > 1.2 ? 0.15 : 0.3 + 0.7 * align);
    return { throttle, steer, brake: 0 };
  },
  /** { throttle: 0, steer } that turns the hull toward a world angle. */
  turnTo(self, angle) {
    const err = angDiff(angle, self.heading);
    return { throttle: 0, steer: clamp(err * 2.5 - (self.angVel || 0) * 0.4, -1, 1) };
  },
});

function seededMath(rng) {
  const m = {};
  for (const k of Object.getOwnPropertyNames(Math)) m[k] = Math[k];
  m.random = rng;
  return Object.freeze(m);
}

/**
 * @param {object} o
 * @param {string|object} o.map     map id or built map
 * @param {string} [o.mode]         '1v1' | '2v2' | '3v3'
 * @param {Array}  o.teams          [[bot, ...], [bot, ...]], bot = { id, name?, factory }
 * @param {number} [o.seed]
 * @param {boolean} [o.swap]        swap spawn sides
 * @param {number} [o.budget]
 * @param {boolean} [o.record]      keep replay frames (default true)
 * @param {boolean} [o.strict]      throw on invalid designs (default true); false = stock chassis
 * @param {function} [o.now]        high-resolution clock for CPU accounting (optional, never affects the sim)
 * @param {number} [o.maxTime]      stop early (seconds) — used for smoke tests
 */
export function runMatch(o) {
  const map = typeof o.map === 'string' ? MAPS[o.map] : o.map;
  if (!map) throw new MatchError(`unknown map "${o.map}". Valid: ${Object.keys(MAPS).join(', ')}`);
  const mode = o.mode || '1v1';
  const teamSize = MODES[mode];
  if (!teamSize) throw new MatchError(`unknown mode "${mode}". Valid: ${Object.keys(MODES).join(', ')}`);
  if (!Array.isArray(o.teams) || o.teams.length !== 2) throw new MatchError('teams must be [[...], [...]]');
  const seed = (o.seed ?? 0) >>> 0;
  const budget = o.budget ?? DEFAULT_BUDGET;
  const record = o.record !== false;
  const strict = o.strict !== false;
  const now = o.now || null;
  const trace = o.trace || null;   // optional Int32Array(1): id of the vehicle whose controller is running (watchdogs)
  const rules = { ...RULES, ...(o.rules || {}) };
  const slots = SPAWN_SLOTS[teamSize];
  const mapInfo = deepFreeze(describeMap(map));
  const nav = Object.freeze(makeNav(map));
  const rulesInfo = deepFreeze({ ...rules, stud: CELL, gridHalfX: GRID_HX, gridHalfY: GRID_HY, paints: Object.keys(PAINTS), budget });

  const ctl = [];     // controller runtime per vehicle
  const entries = [];
  o.teams.forEach((team, t) => {
    if (!Array.isArray(team) || team.length === 0) throw new MatchError(`team ${t} is empty`);
    const members = team.length === teamSize ? team : team.length === 1 ? Array(teamSize).fill(team[0]) : null;
    if (!members) throw new MatchError(`team ${t} has ${team.length} bots but mode ${mode} needs ${teamSize} (or exactly 1 to fill every slot)`);
    members.forEach((bot, k) => {
      const id = entries.length;
      const rng = makeRng(hashSeed('bot', seed, t, k));
      const logs = [], errors = [];
      const log = (...args) => {
        if (logs.length >= 200) return;
        let s; try { s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); } catch { s = String(args[0]); }
        logs.push(`[${world ? world.t.toFixed(2) : 'init'}] ${String(s).slice(0, 300)}`);
      };
      const api = Object.freeze({ parts: FROZEN_PARTS, items: FROZEN_ITEMS, tiles: FROZEN_TILES, rules: rulesInfo, map: mapInfo, nav, util, rng, log });
      const env = { Math: seededMath(rng), console: Object.freeze({ log, warn: log, error: log, info: log, debug: log }) };
      const c = { id, bot, api, logs, errors, inst: null, cpuTotal: 0, cpuMax: 0, calls: 0, team: t, k };
      const fail = (msg, detail) => { throw new MatchError(`bot "${bot.id}" (team ${t}, slot ${k}): ${msg}`, { bot: bot.id, team: t, slot: k, ...detail }); };
      try { c.inst = bot.factory(env); } catch (e) { fail(`threw while loading: ${e && e.message}`, { phase: 'load' }); }
      if (!c.inst || typeof c.inst.tick !== 'function') fail('must define a top-level function `tick(state, api)`', { phase: 'load' });
      const ctx = deepFreeze({ mode, teamSize, team: t, slot: k, budget, map: mapInfo, rules: rulesInfo });
      let raw = c.inst.design;
      if (typeof raw === 'function') {
        try { raw = raw(ctx, api); } catch (e) { fail(`design(ctx, api) threw: ${e && e.message}`, { phase: 'design' }); }
      }
      let val = validateDesign(raw, { budget });
      if (!val.ok) {
        if (strict) fail(`invalid design: ${val.errors.join('; ')}`, { phase: 'design', errors: val.errors });
        errors.push(`invalid design, using stock chassis: ${val.errors.join('; ')}`);
        val = validateDesign(STOCK_DESIGN, { budget: Infinity });
      }
      c.design = val.design; c.designStats = val.stats; c.ctx = ctx;
      const meta = c.inst.meta && typeof c.inst.meta === 'object' ? c.inst.meta : {};
      c.name = String(bot.name || meta.name || bot.id).slice(0, 32);
      ctl.push(c);
      entries.push({ team: t, slot: slots[k], design: val.design, name: c.name, botId: bot.id });
    });
  });

  var world = new World({ map, seed, swap: !!o.swap, entries, rules });

  for (const c of ctl) {
    if (!c.inst.init) continue;
    const v = world.vehicles[c.id];
    try { c.inst.init({ ...c.ctx, id: v.id, design: c.design, stats: c.designStats, x: v.x, y: v.y, heading: v.th }, c.api); }
    catch (e) { c.errors.push(`init threw: ${e && e.message}`); world.vehicles[c.id].violations++; }
  }

  const frames = [];
  if (record) frames.push(world.frame());
  const maxTime = o.maxTime ?? Infinity;
  while (!world.finished && world.t < maxTime) {
    if (world.tick % rules.decisionEvery === 0) {
      const obs = world.observeAll();
      for (const c of ctl) {
        const v = world.vehicles[c.id];
        if (!v.alive) continue;
        if (v.cutOff) { world.setCommand(v, null); continue; }
        let cmd = null;
        const t0 = now ? now() : 0;
        if (trace) trace[0] = c.id;
        try { cmd = c.inst.tick(obs[c.id], c.api); }
        catch (e) {
          v.violations++;
          if (c.errors.length < 8) c.errors.push(`tick threw at t=${world.t.toFixed(2)}: ${e && e.message}`);
        }
        if (now) {
          const el = now() - t0;
          c.cpuTotal += el; c.calls++;
          if (el > c.cpuMax) c.cpuMax = el;
          if (el > 250) v.violations += 10;
        }
        if (v.violations >= rules.maxViolations && !v.cutOff) {
          v.cutOff = true;
          c.errors.push(`controller cut off at t=${world.t.toFixed(2)} after ${v.violations} violations; vehicle idles`);
          world.event({ k: 'cutoff', v: v.id });
        }
        world.setCommand(v, cmd);
      }
    }
    if (trace) trace[0] = -1;
    world.step();
    if (record && world.tick % rules.frameEvery === 0) frames.push(world.frame());
  }
  if (record && world.tick % rules.frameEvery !== 0) frames.push(world.frame());

  const rnd = (x) => Math.round(x * 10) / 10;
  const vehicles = world.vehicles.map((v) => {
    const c = ctl[v.id], s = v.stats;
    return {
      id: v.id, team: v.team, slot: c.k, name: v.name, bot: v.botId,
      alive: v.alive, deathT: v.deathT === null ? null : rnd(v.deathT), deathCause: v.deathCause, killedBy: v.killedBy,
      hpFrac: Math.round(Math.max(0, v.hpNow / v.hpMax) * 1000) / 1000,
      coreFrac: Math.round(Math.max(0, v.core.hp / v.core.maxHp) * 1000) / 1000,
      design: c.design, designStats: c.designStats,
      stats: {
        damageDealt: rnd(s.damageDealt), damageTaken: rnd(s.damageTaken),
        damageByType: Object.fromEntries(Object.entries(s.byType).map(([k, x]) => [k, rnd(x)])),
        kills: s.kills, partsLost: s.partsLost, partsDestroyed: s.partsDestroyed,
        shots: rnd(s.shots), hits: rnd(s.hits), accuracy: s.shots > 0 ? Math.round((s.hits / s.shots) * 100) / 100 : null,
        healing: rnd(s.healing), deflected: rnd(s.deflected), itemsPicked: s.itemsPicked, itemsUsed: s.itemsUsed, rams: s.rams,
        distance: rnd(s.distance), timeStill: rnd(s.timeStill), timeStunned: rnd(s.timeStunned),
        timeEnergyStarved: rnd(s.timeEnergyStarved), timeFireOutOfArc: rnd(s.timeFireOutOfArc),
        timeOutsideZone: rnd(s.timeOutsideZone), timeNoEnemyVisible: rnd(s.timeNoEnemyVisible),
        timeOn: { mud: rnd(s.timeOn.mud), ice: rnd(s.timeOn.ice), lava: rnd(s.timeOn.lava) },
      },
      cpu: now && c.calls ? { avgMs: Math.round((c.cpuTotal / c.calls) * 1000) / 1000, maxMs: Math.round(c.cpuMax * 100) / 100 } : null,
      violations: v.violations, cutOff: v.cutOff, errors: c.errors, logs: c.logs,
    };
  });

  const teamSummary = [0, 1].map((t) => {
    const sc = world.teamScore(t);
    return { bots: ctl.filter((c) => c.team === t).map((c) => c.bot.id), alive: sc.alive, hull: Math.round(sc.hp * 1000) / 1000, damage: rnd(sc.dmg) };
  });

  return {
    version: ENGINE_VERSION,
    map: map.id, mode, seed, swap: !!o.swap, budget,
    winner: world.finished ? world.winner : null,           // 0, 1, or -1 for a draw
    reason: world.finished ? world.endReason : 'stopped early',
    duration: rnd(world.t),
    teams: teamSummary,
    vehicles,
    events: world.events,
    frames: record ? frames : undefined,
    frameDt: world.dt * rules.frameEvery,
  };
}

/** Compact, agent-readable report of a match result (no frames). */
export function summarize(res, { events = 40 } = {}) {
  const who = (id) => (id >= 0 && res.vehicles[id] ? `${res.vehicles[id].name}#${id}` : 'environment');
  const lines = [];
  const interesting = res.events.filter((e) => ['death', 'pickup', 'use', 'cutoff', 'end'].includes(e.k));
  const partLoss = {};
  for (const e of res.events) if (e.k === 'part') {
    const v = res.vehicles[e.v], type = v.design.parts[e.i].type;
    if (PARTS[type].decor) continue;
    (partLoss[e.v] ||= []).push({ t: e.t, type, cause: e.c });
  }
  for (const e of interesting.slice(0, events)) {
    if (e.k === 'death') lines.push(`t=${e.t}s  ${who(e.v)} destroyed (${e.c}) by ${who(e.by)}`);
    else if (e.k === 'pickup') lines.push(`t=${e.t}s  ${who(e.v)} picked up ${e.type}`);
    else if (e.k === 'use') lines.push(`t=${e.t}s  ${who(e.v)} used ${e.type}`);
    else if (e.k === 'cutoff') lines.push(`t=${e.t}s  ${who(e.v)} controller cut off (too many errors)`);
    else if (e.k === 'end') lines.push(`t=${e.t}s  match over: ${e.winner < 0 ? 'draw' : 'team ' + e.winner + ' wins'} (${e.reason})`);
  }
  return {
    map: res.map, mode: res.mode, seed: res.seed, swap: res.swap, budget: res.budget,
    winner: res.winner, result: res.winner === null ? 'unfinished' : res.winner < 0 ? 'draw' : `team ${res.winner} wins`,
    reason: res.reason, duration: res.duration, teams: res.teams,
    vehicles: res.vehicles.map((v) => ({
      id: v.id, team: v.team, slot: v.slot, name: v.name, bot: v.bot,
      alive: v.alive, death: v.alive ? null : { t: v.deathT, cause: v.deathCause, by: who(v.killedBy) },
      hullLeft: v.hpFrac, coreLeft: v.coreFrac,
      design: { cost: v.designStats.cost, mass: v.designStats.mass, weightClass: v.designStats.weightClass, topSpeed: v.designStats.topSpeed, turnRate: v.designStats.turnRate, dps: v.designStats.dps, weapons: v.designStats.weapons },
      stats: v.stats,
      firstPartsLost: (partLoss[v.id] || []).slice(0, 8).map((p) => `${p.t}s ${p.type} (${p.cause})`),
      cpu: v.cpu, violations: v.violations, errors: v.errors, logs: v.logs.slice(0, 30),
    })),
    timeline: lines,
  };
}
