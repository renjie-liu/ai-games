// The controller realm: everything that runs on the controller's side of the fence.
//
// A controller never holds an engine object. The engine and a controller trade
// only strings, numbers and booleans:
//
//   engine → realm   boot data (JSON) and one observation per decision: numbers,
//                    copied into an array the realm owns, plus two short JSON texts
//   realm → engine   the blueprint (JSON), each command (numbers in that same array,
//                    plus the team message as JSON), and calls to a few engine
//                    functions that take and return primitives: the seeded random
//                    source, the log, map queries, the ASCII blueprint parser
//
// Why it matters: an engine object is a way out. Any function the engine hands
// over leads to the engine's own `Function` constructor, and any shared object
// can be rewritten for the engine and for every other controller. Text cannot.
//
// The three functions below are SELF-CONTAINED: apart from language built-ins
// they use nothing outside their own body. node/loader.js rebuilds them from
// their source text inside a fresh vm context (see realmSource); in the browser,
// and for a bot given as { id, factory }, they are simply called.

/** Pure helpers handed to controllers as `api.util` (`blueprint` is added by the realm). */
export function makeUtil() {
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  /** signed smallest difference a - b, in (-PI, PI] */
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; else if (d < -PI) d += TAU; return d; };
  return {
    clamp,
    angDiff,
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
      // `steer` turns the car the same way whichever way it is rolling: `err` is already how far the heading has to turn
      // for the tail to point at the goal, so backing up does not flip it
      const steer = clamp(err * 2.2 - (self.angVel || 0) * 0.35, -1, 1);
      const align = Math.max(0, Math.cos(err));
      const throttle = (opts.speed ?? 1) * dir * (Math.abs(err) > 1.2 ? 0.15 : 0.3 + 0.7 * align);
      return { throttle, steer, brake: 0 };
    },
    /** { throttle: 0, steer } that turns the hull toward a world angle. */
    turnTo(self, angle) {
      const err = angDiff(angle, self.heading);
      return { throttle: 0, steer: clamp(err * 2.5 - (self.angVel || 0) * 0.4, -1, 1) };
    },
    /**
     * The blast you most need to get out of: a keg on the ground, or a mortar shell on its way,
     * whose circle you are in or within `margin` metres of. Returns null if there is none, else
     * { x, y, r, in, away }: where it goes off, how big, in how many seconds, and a point just
     * outside it, straight out from its centre through you (pass `away` to driveTo).
     */
    threat(state, margin = 1.2) {
      const s = state.self;
      let best = null;
      const look = (x, y, r, t) => {
        const d = Math.hypot(s.x - x, s.y - y), reach = r + (s.radius || 1) + margin;
        if (d > reach || (best && best.in <= t)) return;
        const ux = d > 1e-3 ? (s.x - x) / d : Math.cos(s.heading), uy = d > 1e-3 ? (s.y - y) / d : Math.sin(s.heading);
        best = { x, y, r, in: t, away: { x: x + ux * (reach + 1), y: y + uy * (reach + 1) } };
      };
      const bombs = state.bombs || [], shots = state.projectiles || [];
      for (let i = 0; i < bombs.length; i++) { const b = bombs[i], t = Math.min(b.fuse, 0.5); look(b.x + b.vx * t, b.y + b.vy * t, b.r, b.fuse); }
      for (let i = 0; i < shots.length; i++) { const p = shots[i]; if (p.landsAt) look(p.landsAt.x, p.landsAt.y, 2, p.landsIn); }
      return best;
    },
  };
}

/**
 * Stateful path follower built on a `path(x0, y0, x1, y1, opts)` function: caches
 * the route, re-plans every `replanTicks` ticks (default 30 = 0.5 s) or when the
 * goal moves, keeps to the way round an obstacle it has chosen when a fresh plan would
 * swap sides, and backs out when the vehicle is wedged against something.
 *   const f = api.nav.follower();                       // keep it in your controller's closure
 *   const wp = f.next(self, goalX, goalY, state.tick);  // -> { x, y, reverse? } waypoint to steer at
 *   Object.assign(cmd, api.util.driveTo(self, wp));
 */
export function makeFollower(path, clear) {
  return function follower(defaults = {}) {
    let route = [], gx = NaN, gy = NaN, nextPlan = -1, rx = NaN, ry = NaN, ox = NaN, oy = NaN;   // rx, ry: the goal `route` was planned for; ox, oy: where the leg to route[0] starts
    let cx = NaN, cy = NaN, ct = -1, lastCall = -99, escape = null, escapeUntil = -1, flip = 1;
    // is the car within 0.75 m of the straight line from where the current leg began to the corner it leads to?
    const onLeg = (self, to) => {
      const lx = to.x - ox, ly = to.y - oy, l2 = lx * lx + ly * ly;
      const k = l2 > 0 ? Math.max(0, Math.min(1, ((self.x - ox) * lx + (self.y - oy) * ly) / l2)) : 0;
      return Math.hypot(self.x - (ox + lx * k), self.y - (oy + ly * k)) < 0.75;
    };
    return {
      get route() { return route; },
      reset() { nextPlan = -1; route = []; },
      next(self, x, y, tick, opts) {
        const o = opts ? { ...defaults, ...opts } : defaults;
        // stuck detection: called continuously yet barely moved in 1.5 s
        if (tick - lastCall > 12) { cx = self.x; cy = self.y; ct = tick; }
        lastCall = tick;
        if (tick < escapeUntil && escape) return escape;
        if (tick - ct >= 90) {
          const far = Math.hypot(x - self.x, y - self.y) > 2.5;
          if (far && Math.hypot(self.x - cx, self.y - cy) < 0.5) {
            flip = -flip;
            const a = self.heading + Math.PI + flip * 0.7;
            escape = { x: self.x + Math.cos(a) * 4, y: self.y + Math.sin(a) * 4, reverse: true };
            escapeUntil = tick + 45; nextPlan = -1; route = [];   // wedged on that route: plan afresh once clear
          }
          cx = self.x; cy = self.y; ct = tick;
          if (tick < escapeUntil) return escape;
        }
        const moved = Math.hypot(x - gx, y - gy);
        if (!(tick < nextPlan) || !(moved <= (o.replanDist ?? 3))) {
          const margin = o.margin ?? Math.max(0.8, Math.min(2.0, (self.radius || 1.5) * 0.8));
          const hover = !!self.hovering;
          const fresh = path(self.x, self.y, x, y, { hover, ...o, margin });
          // Two ways round a hole are often the same length, and a plan made afresh every half second may pick the
          // other one each time — leaving the car to steer at the hole between them. So when the fresh plan sets off
          // somewhere else altogether (its first corner more than 3 m from the one being driven to), the old corner is
          // kept — if there is still a corner to go round, the goal is about where the route was planned for, that way
          // is not clearly the longer one, and the car is either still on the leg it was given (within 0.75 m of it)
          // or can drive straight to the corner from wherever it now is.
          const along = (r) => { let d = 0, px = self.x, py = self.y; for (const w of r) { d += Math.hypot(w.x - px, w.y - py); px = w.x; py = w.y; } return d; };
          const keep = !!clear && route.length > 1 && fresh.length > 0
            && Math.hypot(x - rx, y - ry) <= (o.replanDist ?? 3)
            && Math.hypot(fresh[0].x - route[0].x, fresh[0].y - route[0].y) > 3
            && along(route) <= along(fresh) * 1.15
            && (onLeg(self, route[0]) || clear(self.x, self.y, route[0].x, route[0].y, hover ? { hover, margin } : { margin, avoid: ['lava'] }));
          if (!keep) { route = fresh; rx = x; ry = y; ox = self.x; oy = self.y; }
          gx = x; gy = y; nextPlan = tick + (o.replanTicks ?? 30);
        }
        const reach = o.reach ?? 1.3;
        while (route.length > 1 && Math.hypot(route[0].x - self.x, route[0].y - self.y) < reach) { ox = route[0].x; oy = route[0].y; route.shift(); }
        return route[0] || { x, y };
      },
    };
  };
}

/**
 * Loads one controller and returns the port the engine drives it through.
 *
 * @param {function} factory  the wrapped controller source (see botwrap.js): env => { meta, design, init, tick }
 * @param {object} host       engine functions; each takes and returns primitives only
 * @param {string} boot       JSON: { ctx, file, lineOffset, parts, items, tiles, rules, map }
 * @returns port — every member is a string or a function from strings to a string:
 *   error     null, or why the controller could not be loaded
 *   meta      the controller's `meta` as JSON ('' if it has none)
 *   design()  the blueprint as JSON, or '!' + message
 *   init(s)   '' or '!' + message          (s = JSON { id, design, stats, x, y, heading })
 *   buf       a Float64Array: the engine writes an observation into it (World.observeWire), tick answers
 *             with the command in the same array (World.readCommand)
 *   tick(m, l)  what the controller says to its team as JSON, '' for nothing, or '!' + message
 *             (m, l = the observation's two texts)
 */
export function controllerRealm(factory, host, boot, makeUtil, makeFollower) {
  'use strict';
  // Take what the realm needs from the language before any controller code runs.
  // A controller may replace `JSON`, `Object` and the rest for itself afterwards.
  const parse = JSON.parse, stringify = JSON.stringify;
  const freeze = Object.freeze, isFrozen = Object.isFrozen, keysOf = Object.keys, namesOf = Object.getOwnPropertyNames, isArray = Array.isArray;
  const Err = Error, Str = String, Rx = RegExp, F64 = Float64Array, M = Math, floor = Math.floor;

  // ── engine calls ──────────────────────────────────────────────────────
  // An engine function sees primitives only, and nothing it returns or throws reaches a
  // controller as an object: an engine error would be an engine object.
  const prim = (x) => { const t = typeof x; return x === null || (t !== 'object' && t !== 'function'); };
  const guard = (fn) => (a, b, c, d, e, f) => {
    if (!(prim(a) && prim(b) && prim(c) && prim(d) && prim(e) && prim(f))) throw new Err('engine functions take numbers, strings and booleans only');
    let out, failed = false;
    try { out = fn(a, b, c, d, e, f); } catch (_) { failed = true; }
    if (failed || !prim(out)) throw new Err('engine call failed');
    return out;
  };
  const hRng = guard(host.rng), hLog = guard(host.log), hBlueprint = guard(host.blueprint);
  const hTileAt = guard(host.tileAt), hTileAtCell = guard(host.tileAtCell), hIsOpen = guard(host.isOpen);
  const hClearWall = guard(host.clearWall), hClearPit = guard(host.clearPit), hLos = guard(host.los);
  const hClear = guard(host.clear), hPath = guard(host.path);
  // options objects cross as JSON
  const pack = (opts) => {
    if (opts === undefined || opts === null) return undefined;
    const s = stringify(opts);
    if (typeof s !== 'string') return undefined;
    if (s.length > 4000) throw new Err('options object is too large');
    return s;
  };

  const deepFreeze = (o) => {
    if (o && typeof o === 'object' && !isFrozen(o)) { freeze(o); const ks = keysOf(o); for (let i = 0; i < ks.length; i++) deepFreeze(o[ks[i]]); }
    return o;
  };

  // ── api ───────────────────────────────────────────────────────────────
  const data = parse(boot);
  const parts = deepFreeze(data.parts), items = deepFreeze(data.items), tiles = deepFreeze(data.tiles);
  const rules = deepFreeze(data.rules), map = deepFreeze(data.map);
  const c0 = data.ctx;
  const ctx = freeze({ mode: c0.mode, teamSize: c0.teamSize, team: c0.team, slot: c0.slot, budget: c0.budget, map, rules });

  const rng = () => hRng();
  rng.int = (n) => floor(rng() * n);
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.pick = (arr) => arr[floor(rng() * arr.length)];
  freeze(rng);

  const log = (...args) => {
    let s;
    try { s = args.map((a) => (typeof a === 'string' ? a : stringify(a))).join(' '); } catch (_) { s = Str(args[0]); }
    hLog(Str(s).slice(0, 300));
  };

  const util = makeUtil();
  /** ASCII art -> { name, paint, parts } (see the rulebook) */
  util.blueprint = (name, layers, opts) => {
    let args;
    try { args = stringify([name, layers, opts]); } catch (_) { args = undefined; }
    if (typeof args !== 'string') throw new Err('blueprint(name, { chassis, deck }, { paint }) takes plain data');
    const r = parse(hBlueprint(args));
    if (typeof r.error === 'string') throw new Err(r.error);
    return r.ok;
  };
  freeze(util);

  const points = (json) => {
    const flat = parse(json), out = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out[out.length] = { x: flat[i], y: flat[i + 1] };
    return out;
  };
  const path = (x0, y0, x1, y1, opts) => { const o = pack(opts); return points(hPath(+x0, +y0, +x1, +y1, o)); };
  const clear = (x0, y0, x1, y1, opts) => { const o = pack(opts); return hClear(+x0, +y0, +x1, +y1, o); };
  const nav = freeze({
    follower: makeFollower(path, clear),
    tileAt: (x, y) => hTileAt(+x, +y),
    tileAtCell: (tx, ty) => hTileAtCell(+tx, +ty),
    isOpen: (x, y, hover) => hIsOpen(+x, +y, !!hover),
    /** metres from (x, y) to the nearest wall/barrier and the nearest pit (capped at 6) */
    clearance: (x, y) => ({ wall: hClearWall(+x, +y), pit: hClearPit(+x, +y) }),
    los: (x0, y0, x1, y1) => hLos(+x0, +y0, +x1, +y1),
    clear,
    path,
  });

  const api = freeze({ parts, items, tiles, rules, map, nav, util, rng, log });

  // `Math` as the controller sees it: the real one with a seeded `random`
  const SM = {};
  const mathNames = namesOf(M);
  for (let i = 0; i < mathNames.length; i++) SM[mathNames[i]] = M[mathNames[i]];
  SM.random = rng;
  freeze(SM);
  const cons = freeze({ log, warn: log, error: log, info: log, debug: log });

  // ── errors ────────────────────────────────────────────────────────────
  // "message (line N)" when the stack names the controller's own file
  const offset = +data.lineOffset || 0;
  const where = typeof data.file === 'string' && data.file ? new Rx(data.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):\\d+') : null;
  const msgOf = (e) => {
    let m = 'error';
    try { m = e && typeof e.message === 'string' ? e.message : Str(e); } catch (_) { /* keeps 'error' */ }
    m = Str(m).slice(0, 240);
    try {
      const st = where && e && e.stack;
      const hit = typeof st === 'string' ? where.exec(st) : null;
      if (hit && +hit[1] > offset) m += ' (line ' + (+hit[1] - offset) + ')';
    } catch (_) { /* no line then */ }
    return m;
  };

  // ── load ──────────────────────────────────────────────────────────────
  let inst = null, error = null, tickFn = null, meta = '';
  try { inst = factory({ Math: SM, console: cons }); } catch (e) { error = 'threw while loading: ' + msgOf(e); }
  if (!error) {
    if (inst && typeof inst.tick === 'function') tickFn = inst.tick;
    else error = 'must define a top-level function `tick(state, api)`';
  }
  if (!error) {
    try {
      const mm = inst.meta;
      if (mm && typeof mm === 'object') { const s = stringify(mm); if (typeof s === 'string' && s.length <= 4000) meta = s; }
    } catch (_) { /* no meta then */ }
  }

  // ── observations ──────────────────────────────────────────────────────
  // An observation arrives as numbers in `buf` plus two short texts; World.observeWire
  // documents the layout. Everything about a vehicle that never changes came once, in a
  // layout, the first time this controller was shown that vehicle.
  const buf = new F64(8192);
  const tileNames = keysOf(tiles), itemNames = keysOf(items);
  const SHOTS = ['bullet', 'shell', 'missile', 'mortar', 'hook'];
  const known = [];           // vehicle id → { team, slot, name, rows, arms, guns }
  let at = 0;                 // read position in buf

  const learn = (json) => {
    const list = parse(json);
    for (let n = 0; n < list.length; n++) {
      const l = list[n], rows = l[4], arms = [], guns = [];
      for (let j = 0; j < rows.length; j++) {
        const def = parts[rows[j][1]];
        if (!def.weapon) continue;
        arms[arms.length] = j;                                  // counts toward `weapons` and `maxRange`
        if (def.weapon !== 'melee') guns[guns.length] = j;      // listed in self.weapons
      }
      known[l[0]] = { team: l[1], slot: l[2], name: l[3], rows, arms, guns };
    }
  };

  // The pieces of one vehicle, read at `at`: 4 numbers each, the first says whether the piece is gone (0), attached (1) or attached and on fire (2).
  const pieces = (rows, own) => {
    const b = buf, list = [];
    let j = at;
    for (let k = 0; k < rows.length; k++, j += 4) {
      const r = rows[k];
      list[k] = own
        ? { i: r[0], type: r[1], x: r[2], y: r[3], z: r[4], dir: r[5], alive: b[j] >= 1, burning: b[j] === 2, hp: b[j + 1], maxHp: r[6], wx: b[j + 2], wy: b[j + 3] }
        : { i: r[0], type: r[1], x: r[2], y: r[3], z: r[4], dir: r[5], alive: b[j] >= 1, burning: b[j] === 2, hpFrac: b[j + 1], wx: b[j + 2], wy: b[j + 3] };
    }
    at = j;
    return list;
  };
  // How many of each weapon are still attached, and the longest reach among them.
  let maxRange = 0;
  const armed = (info) => {
    const b = buf, rows = info.rows, arms = info.arms, weapons = {};
    maxRange = 0;
    for (let a = 0; a < arms.length; a++) {
      const j = arms[a];
      if (!(b[at + j * 4] >= 1)) continue;
      const type = rows[j][1], def = parts[type];
      weapons[type] = (weapons[type] || 0) + 1;
      const reach = def.range || def.reach || 0;
      if (reach > maxRange) maxRange = reach;
    }
    return weapons;
  };

  // An ally or a visible enemy: one public block at `at`.
  const vehicle = () => {
    const b = buf, k = at, id = b[k], info = known[id];
    at = k + 19;
    const weapons = armed(info);
    return {
      id, team: info.team, slot: info.slot, name: info.name, alive: b[k + 1] === 1,
      x: b[k + 2], y: b[k + 3], heading: b[k + 4], vx: b[k + 5], vy: b[k + 6], speed: b[k + 7], angVel: b[k + 8],
      hpFrac: b[k + 9], coreFrac: b[k + 10], energyFrac: b[k + 11],
      mass: b[k + 12], radius: b[k + 13], shield: b[k + 14],
      hovering: b[k + 15] === 1, stunned: b[k + 16], burning: b[k + 17],
      item: b[k + 18] ? itemNames[b[k + 18] - 1] : null, weapons, maxRange,
      parts: pieces(info.rows, false),
    };
  };

  // The vehicle itself: its public block, then what only it knows, its guns, its pieces.
  const own = () => {
    const b = buf, k = at, id = b[k], info = known[id], rows = info.rows, e = k + 19, od = b[e + 14];
    const p0 = e + 15 + info.guns.length * 4, guns = [];
    for (let g = 0, w = e + 15; g < info.guns.length; g++, w += 4) {
      const j = info.guns[g], r = rows[j], def = parts[r[1]];
      guns[g] = { i: r[0], type: r[1], dir: r[5], alive: b[p0 + j * 4] >= 1, ready: b[w] === 1, cooldown: b[w + 1], mountAngle: b[w + 2], angle: b[w + 3],
        arc: def.arc, range: def.range, minRange: def.minRange || 0, projSpeed: def.projSpeed || Infinity, dmg: (def.dmg ?? def.dps) * od };
    }
    at = p0;
    armed(info);
    return {
      id, team: info.team, slot: info.slot, name: info.name, alive: b[k + 1] === 1,
      x: b[k + 2], y: b[k + 3], heading: b[k + 4], vx: b[k + 5], vy: b[k + 6], speed: b[k + 7], angVel: b[k + 8],
      hpFrac: b[k + 9], coreFrac: b[k + 10], energyFrac: b[k + 11],
      mass: b[k + 12], radius: b[k + 13], shield: b[k + 14],
      hovering: b[k + 15] === 1, stunned: b[k + 16], burning: b[k + 17],
      item: b[k + 18] ? { type: itemNames[b[k + 18] - 1], charges: b[e + 10] } : null, weapons: guns, maxRange,
      parts: pieces(rows, true),
      hp: b[e], maxHp: b[e + 1], coreHp: b[e + 2], coreMaxHp: b[e + 3],
      energy: b[e + 4], energyMax: b[e + 5], energyRegen: b[e + 6],
      shieldMax: b[e + 7], overshield: b[e + 8], sensor: b[e + 9],
      effects: { overdrive: b[e + 11], nitro: b[e + 12] },
      tile: tileNames[b[e + 13]],
    };
  };

  const decode = (messages, layouts) => {
    if (layouts) learn(layouts);
    const b = buf;
    const nAllies = b[5], nEnemies = b[6], nLast = b[7], nShots = b[8], nMines = b[9], nItems = b[10], nPads = b[11];
    const nBombs = b[12], nBarrels = b[13], nCables = b[14];
    const zone = { x: b[15], y: b[16], r: b[17], minR: b[18], startT: b[19], endT: b[20], shrinking: b[21] === 1 };
    at = 22;
    const self = own(), allies = [], enemies = [], lastSeen = [], projectiles = [], mines = [], here = [], pads = [];
    const bombs = [], barrels = [], tethers = [];
    for (let i = 0; i < nAllies; i++) allies[i] = vehicle();
    for (let i = 0; i < nEnemies; i++) enemies[i] = vehicle();
    let k = at;
    for (let i = 0; i < nLast; i++, k += 5) lastSeen[i] = { id: b[k], x: b[k + 1], y: b[k + 2], t: b[k + 3], alive: b[k + 4] === 1 };
    for (let i = 0; i < nShots; i++, k += 9) {
      projectiles[i] = b[k] === 3
        ? { kind: 'mortar', x: b[k + 1], y: b[k + 2], vx: b[k + 3], vy: b[k + 4], landsAt: { x: b[k + 6], y: b[k + 7] }, landsIn: b[k + 8], d2: b[k + 5] }
        : { kind: SHOTS[b[k]], x: b[k + 1], y: b[k + 2], vx: b[k + 3], vy: b[k + 4], d2: b[k + 5] };
    }
    for (let i = 0; i < nMines; i++, k += 2) mines[i] = { x: b[k], y: b[k + 1] };
    for (let i = 0; i < nItems; i++, k += 4) here[i] = { id: b[k], type: itemNames[b[k + 1] - 1], x: b[k + 2], y: b[k + 3] };
    for (let i = 0; i < nPads; i++, k += 3) pads[i] = { x: b[k], y: b[k + 1], charge: b[k + 2] };
    for (let i = 0; i < nBombs; i++, k += 6) bombs[i] = { x: b[k], y: b[k + 1], vx: b[k + 2], vy: b[k + 3], fuse: b[k + 4], r: b[k + 5] };
    for (let i = 0; i < nBarrels; i++, k += 2) barrels[i] = { x: b[k], y: b[k + 1] };
    for (let i = 0; i < nCables; i++, k += 5) tethers[i] = { from: b[k], to: b[k + 1], length: b[k + 2], taut: b[k + 3] === 1, timeLeft: b[k + 4] };
    return {
      t: b[0], tick: b[1], timeLeft: b[2], dt: b[3],
      self, allies, enemies, enemiesAlive: b[4],
      lastSeen, projectiles, mines, items: here, pads, zone, messages: messages ? parse(messages) : [],
      bombs, barrels, tethers,
    };
  };

  // ── commands ──────────────────────────────────────────────────────────
  // The command goes back the way the observation came: as numbers in `buf` (World.readCommand
  // documents the layout). `true` travels as Infinity and anything that is not a number as NaN,
  // which the engine's clamping turns into "full" and "nothing". Returns what the controller
  // wants to `say`, as JSON ('' for nothing): the one part of a command that is free-form.
  const sayLimit = rules.sayLimit;
  const num = (x) => (typeof x === 'number' ? x : x === true ? Infinity : NaN);
  const aimAt = (a, k) => {
    const b = buf;
    if (typeof a === 'number') { b[k] = 1; b[k + 1] = a; b[k + 2] = 0; }
    else if (a && typeof a === 'object') { b[k] = 2; b[k + 1] = num(a.x); b[k + 2] = num(a.y); }
    else { b[k] = 0; b[k + 1] = 0; b[k + 2] = 0; }
  };
  const encode = (cmd) => {
    const b = buf;
    if (!cmd || typeof cmd !== 'object') { b[0] = 0; return ''; }
    b[1] = num(cmd.throttle); b[2] = num(cmd.steer); b[3] = num(cmd.brake);
    aimAt(cmd.aim, 4);
    const fire = cmd.fire, boost = cmd.boost;
    let k = 25, nFire = 0, nAims = 0;
    if (fire === true) b[7] = 1;
    else if (isArray(fire)) {
      b[7] = 2;
      for (let i = 0, n = fire.length < 4096 ? fire.length : 4096; i < n && nFire < 64; i++) {
        const x = fire[i];
        if (typeof x === 'number' && floor(x) === x && x - x === 0) { b[k++] = x; nFire++; }
      }
    } else b[7] = 0;
    if (typeof boost === 'number' || boost === true) { b[8] = 1; b[9] = num(boost); }
    else if (boost && typeof boost === 'object') { b[8] = 2; b[9] = num(boost.N); b[10] = num(boost.E); b[11] = num(boost.S); b[12] = num(boost.W); }
    else b[8] = 0;
    b[13] = cmd.useItem ? 1 : 0; b[14] = cmd.shield === false ? 0 : 1; b[15] = cmd.repair === false ? 0 : 1; b[16] = cmd.melee === false ? 0 : 1;
    b[17] = num(cmd.target);
    const aims = cmd.aims;
    if (aims && typeof aims === 'object') {
      const ks = keysOf(aims);
      for (let i = 0; i < ks.length && i < 64; i++) {
        const key = ks[i], j = +key;
        if (!(j >= 0 && j < 4096 && floor(j) === j && '' + j === key)) continue;   // only a piece index can match a gun
        b[k] = j; aimAt(aims[key], k + 1); k += 4; nAims++;
      }
    }
    b[18] = nFire; b[19] = nAims;
    b[20] = num(cmd.reel); b[21] = cmd.release ? 1 : 0;
    const det = cmd.detonate, jet = cmd.jettison;
    let nDet = 0, nJet = 0;
    if (det === true) b[22] = 1;
    else if (isArray(det)) {
      b[22] = 2;
      for (let i = 0; i < det.length && i < 64 && nDet < 8; i++) { const x = det[i]; if (typeof x === 'number' && floor(x) === x && x - x === 0) { b[k++] = x; nDet++; } }
    } else b[22] = 0;
    if (isArray(jet)) for (let i = 0; i < jet.length && i < 64 && nJet < 16; i++) { const x = jet[i]; if (typeof x === 'number' && floor(x) === x && x - x === 0) { b[k++] = x; nJet++; } }
    b[23] = nDet; b[24] = nJet;
    let say = '';
    const said = cmd.say;
    if (said !== undefined && said !== null) {
      try { const s = stringify(said); if (typeof s === 'string' && s.length <= sayLimit) say = s; } catch (_) { /* not sayable */ }
    }
    b[0] = 1;
    return say;
  };

  // ── port ──────────────────────────────────────────────────────────────
  return freeze({
    error,
    meta,
    design() {
      if (error) return '!' + error;
      let raw;
      try { raw = inst.design; if (typeof raw === 'function') raw = raw(ctx, api); } catch (e) { return '!design(ctx, api) threw: ' + msgOf(e); }
      let s;
      try { s = stringify(raw); } catch (_) { return '!design must be plain data: { name, parts: [...] }'; }
      if (typeof s !== 'string') return 'null';
      return s.length > 200000 ? '!design is too large' : s;
    },
    init(infoJson) {
      if (error || typeof inst.init !== 'function') return '';
      try {
        const x = parse(infoJson);
        inst.init({ mode: ctx.mode, teamSize: ctx.teamSize, team: ctx.team, slot: ctx.slot, budget: ctx.budget, map, rules,
          id: x.id, design: x.design, stats: x.stats, x: x.x, y: x.y, heading: x.heading }, api);
      } catch (e) { return '!' + msgOf(e); }
      return '';
    },
    tick(messages, layouts) {
      if (error) { buf[0] = 0; return ''; }
      try { return encode(tickFn(decode(messages, layouts), api)); } catch (e) { buf[0] = 0; return '!' + msgOf(e); }
    },
    /** Where the engine writes the numbers of an observation before each tick. */
    buf,
    /** The observation as the controller's `tick` would receive it (for tests and tools). */
    decode,
  });
}

/**
 * Source text of a function (factory, host, boot) => port, for building the realm
 * somewhere the functions above cannot be called directly — a vm context, a worker.
 */
export function realmSource() {
  return `(function () {
"use strict";
const makeUtil = ${makeUtil.toString()};
const makeFollower = ${makeFollower.toString()};
const controllerRealm = ${controllerRealm.toString()};
return function (factory, host, boot) { return controllerRealm(factory, host, boot, makeUtil, makeFollower); };
})()`;
}
