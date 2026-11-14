// Runs one full match: wires controllers to the World, records frames + events.
import { PARTS, ITEMS, TILES, RULES, CELL, GRID_HX, GRID_HY, PAINTS, DEFAULT_BUDGET } from './parts.js';
import { validateDesign, parseBlueprint, STOCK_DESIGN } from './design.js';
import { MAPS, MODES, SPAWN_SLOTS, describeMap } from './maps.js';
import { makeNav } from './nav.js';
import { makeRng, hashSeed } from './rng.js';
import { World, WIRE_CAP } from './sim.js';
import { controllerRealm, makeUtil, makeFollower } from './realm.js';
import { WRAP_LINES } from './botwrap.js';

export const ENGINE_VERSION = '0.4.0';

export class MatchError extends Error {
  constructor(message, detail) { super(message); this.name = 'MatchError'; this.detail = detail; }
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
// The tables a controller reads as api.parts / api.items / api.tiles, as text: each realm parses its own copy.
const PARTS_JSON = JSON.stringify(PARTS), ITEMS_JSON = JSON.stringify(ITEMS), TILES_JSON = JSON.stringify(TILES);

/** The helpers a controller receives as `api.util`, for use outside a match. Pure functions, no hidden state. */
export const util = Object.freeze({ ...makeUtil(), blueprint: parseBlueprint });

// What comes back from a realm is text written by a controller: read it as that and nothing more.
const textOf = (x) => (typeof x === 'string' ? x : '');
const failed = (s) => s.charCodeAt(0) === 33; // '!' + message
function readJson(s) { try { return JSON.parse(s); } catch { return undefined; } }
/** Message of something a realm threw, without trusting the thing. */
function thrown(e) {
  try { const m = e && e.message; return typeof m === 'string' ? m.slice(0, 240) : 'error'; } catch { return 'error'; }
}
const plain = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
// The clearance fields of a map take a while to build and never change: one per map, kept.
const NAVS = new WeakMap();
function navOf(map) { let nav = NAVS.get(map); if (!nav) NAVS.set(map, nav = makeNav(map)); return nav; }
// A realm's number array belongs to the realm, so the engine never uses it as an object: it takes
// the memory behind it — with its own built-ins, which run no code of the realm's and refuse
// anything that is not a real typed array — and looks at that memory through an array of its own.
const typed = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(Float64Array.prototype));
function viewOf(buf) {
  try { return new Float64Array(typed.buffer.get.call(buf), typed.byteOffset.get.call(buf), typed.length.get.call(buf)); } catch { return null; }
}

/**
 * @param {object} o
 * @param {string|object} o.map     map id or built map
 * @param {string} [o.mode]         '1v1' | '2v2' | '3v3'
 * @param {Array}  o.teams          [[bot, ...], [bot, ...]], bot = { id, name?, factory } — or { id, name?, open } for a
 *                                  bot that brings its own realm (node/loader.js: one sealed vm context per vehicle)
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
  const nav = navOf(map);
  const rulesInfo = deepFreeze({ ...rules, stud: CELL, gridHalfX: GRID_HX, gridHalfY: GRID_HY, paints: Object.keys(PAINTS), budget });
  const tables = `"parts":${PARTS_JSON},"items":${ITEMS_JSON},"tiles":${TILES_JSON},"rules":${JSON.stringify(rulesInfo)},"map":${JSON.stringify(mapInfo)}`;

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
      // The engine side of the fence (see realm.js): every function takes and returns primitives.
      const host = {
        rng: () => rng(),
        log: (line) => { if (logs.length < 200) logs.push(`[${world ? world.t.toFixed(2) : 'init'}] ${String(line).slice(0, 300)}`); },
        blueprint: (args) => {
          try { const [name, layers, opts] = JSON.parse(args); return JSON.stringify({ ok: parseBlueprint(name, layers, plain(opts)) }); }
          catch (e) { return JSON.stringify({ error: String(e && e.message) }); }
        },
        tileAt: (x, y) => nav.tileAt(x, y),
        tileAtCell: (tx, ty) => nav.tileAtCell(tx, ty),
        isOpen: (x, y, hover) => nav.isOpen(x, y, hover),
        clearWall: (x, y) => nav.clearance(x, y).wall,
        clearPit: (x, y) => nav.clearance(x, y).pit,
        los: (x0, y0, x1, y1) => nav.los(x0, y0, x1, y1),
        clear: (x0, y0, x1, y1, opts) => nav.clear(x0, y0, x1, y1, plain(opts === undefined ? null : JSON.parse(opts))),
        path: (x0, y0, x1, y1, opts) => {
          const flat = [];
          for (const wp of nav.path(x0, y0, x1, y1, plain(opts === undefined ? null : JSON.parse(opts)))) flat.push(wp.x, wp.y);
          return JSON.stringify(flat);
        },
      };
      const c = { id, bot, logs, errors, port: null, cpuTotal: 0, cpuMax: 0, calls: 0, team: t, k };
      const fail = (msg, detail) => { throw new MatchError(`bot "${bot.id}" (team ${t}, slot ${k}): ${msg}`, { bot: bot.id, team: t, slot: k, ...detail }); };
      const boot = `{"ctx":${JSON.stringify({ mode, teamSize, team: t, slot: k, budget })},"file":${JSON.stringify(bot.file || '')},"lineOffset":${WRAP_LINES},${tables}}`;
      if (trace) trace[0] = id;
      try { c.port = bot.open ? bot.open(host, boot) : controllerRealm(bot.factory, host, boot, makeUtil, makeFollower); }
      catch (e) { fail(`threw while loading: ${thrown(e)}`, { phase: 'load' }); }
      if (typeof c.port.error === 'string') fail(c.port.error, { phase: 'load' });
      c.buf = viewOf(c.port.buf);
      if (!c.buf || c.buf.length < WIRE_CAP) fail('its realm has no room for observations', { phase: 'load' });
      let drawn;
      try { drawn = textOf(c.port.design()); } catch (e) { drawn = '!design(ctx, api) threw: ' + thrown(e); }
      if (trace) trace[0] = -1;
      if (failed(drawn)) fail(drawn.slice(1), { phase: 'design' });
      let val = validateDesign(readJson(drawn), { budget });
      if (!val.ok) {
        if (strict) fail(`invalid design: ${val.errors.join('; ')}`, { phase: 'design', errors: val.errors });
        errors.push(`invalid design, using stock chassis: ${val.errors.join('; ')}`);
        val = validateDesign(STOCK_DESIGN, { budget: Infinity });
      }
      c.design = val.design; c.designStats = val.stats;
      const meta = plain(readJson(textOf(c.port.meta)));
      c.name = String(bot.name || meta.name || bot.id).slice(0, 32);
      ctl.push(c);
      entries.push({ team: t, slot: k, spawn: slots[k], design: val.design, name: c.name, botId: bot.id });
    });
  });

  var world = new World({ map, seed, swap: !!o.swap, entries, rules });

  for (const c of ctl) {
    const v = world.vehicles[c.id];
    if (trace) trace[0] = c.id;
    let said;
    try { said = textOf(c.port.init(JSON.stringify({ id: v.id, design: c.design, stats: c.designStats, x: v.x, y: v.y, heading: v.th }))); }
    catch (e) { said = '!' + thrown(e); }
    if (failed(said)) { c.errors.push(`init threw: ${said.slice(1)}`); v.violations++; }
  }
  if (trace) trace[0] = -1;

  const frames = [];
  if (record) frames.push(world.frame());
  const maxTime = o.maxTime ?? Infinity;
  const sinks = ctl.map((c) => c.buf);
  while (!world.finished && world.t < maxTime) {
    if (world.tick % rules.decisionEvery === 0) {
      const obs = world.observeWire(sinks);
      for (const c of ctl) {
        const v = world.vehicles[c.id];
        if (!v.alive) continue;
        if (v.cutOff) { world.setCommand(v, null); continue; }
        let said;
        const t0 = now ? now() : 0;
        if (trace) trace[0] = c.id;
        try { said = textOf(c.port.tick(obs[c.id].messages, obs[c.id].layouts)); } catch (e) { said = '!' + thrown(e); }
        let cmd = null;
        if (failed(said)) {
          v.violations++;
          if (c.errors.length < 8) c.errors.push(`tick threw at t=${world.t.toFixed(2)}: ${said.slice(1)}`);
        } else cmd = world.readCommand(c.buf, said && said.length <= rules.sayLimit ? readJson(said) : undefined);
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
