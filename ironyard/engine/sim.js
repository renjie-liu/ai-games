// Deterministic battle simulation. No DOM, no Node APIs, no Math.random.
//
// A vehicle is one rigid body made of pieces on a two-layer stud grid. Each
// occupied stud column is one collision circle; shots hit the deck piece of a
// column first, ground-level damage (rams, saws, mines) hits the chassis piece
// first.
import { PARTS, CELL, GRID_HX, GRID_HY, GRID_W, GRID_L, DIR_ANGLE, ITEMS, RULES, TILE, cellsOf, dimsOf } from './parts.js';
import { aggregate, PHYS, cellIndex, centerOf } from './design.js';
import { TILE_CODE, TILE_NAME, tileCodeAt } from './maps.js';
import { makeRng, hashSeed } from './rng.js';

const PI = Math.PI, TAU = PI * 2;
const T = TILE_CODE;
const RC = CELL * 0.56;               // collision radius of one stud column
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; else if (d < -PI) d += TAU; return d; };
const wrap = (a) => angDiff(a, 0);
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const inGrid = (x, y) => x >= -GRID_HX && x <= GRID_HX && y >= -GRID_HY && y <= GRID_HY;

const LOCAL_DIR = { N: [1, 0], W: [0, 1], S: [-1, 0], E: [0, -1] }; // (forward, left) components
const NEIGH = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const PROJ_KIND = { bullet: 0, shell: 1, missile: 2, lob: 3 };

export const FLAG = { alive: 1, boost: 2, stun: 4, hover: 8, overdrive: 16, nitro: 32, overshield: 64, saw: 128, repair: 256 };

const IDLE = Object.freeze({
  throttle: 0, steer: 0, brake: 0, aim: null, aims: null, fire: false, boost: null,
  useItem: false, shield: true, repair: true, melee: true, target: null, say: undefined,
});

function newStats() {
  return {
    damageDealt: 0, damageTaken: 0, byType: { kinetic: 0, energy: 0, explosive: 0, melee: 0, ram: 0 },
    kills: 0, partsLost: 0, partsDestroyed: 0, shots: 0, hits: 0, healing: 0, deflected: 0,
    itemsPicked: 0, itemsUsed: 0, distance: 0, rams: 0,
    timeStunned: 0, timeEnergyStarved: 0, timeFireOutOfArc: 0, timeOutsideZone: 0,
    timeOn: { mud: 0, ice: 0, lava: 0 }, timeStill: 0, timeNoEnemyVisible: 0,
  };
}

export class World {
  /**
   * @param {object} o
   * @param {object} o.map      built map (see maps.js)
   * @param {number} o.seed
   * @param {boolean} [o.swap]  swap spawn sides
   * @param {Array}  o.entries  [{ team, slot, design, name, botId }] — slot = spawn slot 0..2
   */
  constructor({ map, seed = 0, swap = false, entries, rules = {} }) {
    this.map = map;
    this.seed = seed >>> 0;
    this.rules = { ...RULES, ...rules };
    this.dt = 1 / this.rules.tickRate;
    this.tick = 0;
    this.t = 0;
    this.rng = makeRng(hashSeed('world', this.seed));
    this.events = [];
    this.projectiles = [];
    this.mines = [];
    this.beams = [];
    this.pendingBlasts = [];
    this.nextId = 1;
    this.winner = null;      // 0 | 1 | -1 (draw) once finished
    this.finished = false;
    this.endReason = null;

    const z = map.zone;
    this.zone = {
      x: map.center.x, y: map.center.y, r0: z.radius0,
      start: z.start ?? this.rules.zoneStart, end: z.end ?? this.rules.zoneEnd,
      minR: z.minRadius ?? this.rules.zoneMinRadius, r: z.radius0,
    };
    this.itemSpawns = map.itemSpawns.map((s) => ({ ...s, nextT: this.rules.itemFirstSpawn, cycle: 0, present: false }));
    this.pads = map.pads.map((p) => ({ ...p, charge: 150 }));

    // mirrored spawn jitter so seeds vary the opening without favouring a side
    const jr = makeRng(hashSeed('spawn', this.seed));
    const jitter = [0, 1, 2].map(() => ({ dx: jr.range(-0.6, 0.6), dy: jr.range(-0.6, 0.6), dth: jr.range(-0.15, 0.15) }));

    this.vehicles = entries.map((e, id) => {
      const side = swap ? 1 - e.team : e.team;
      const sp = map.spawns[side][e.slot];
      const j = jitter[e.slot], sgn = side === 0 ? 1 : -1;
      return this.makeVehicle(e, id, sp.x + j.dx * sgn, sp.y + j.dy * sgn, sp.heading + j.dth);
    });
    this.teams = [0, 1].map((t) => this.vehicles.filter((v) => v.team === t));
    this.lastSeen = [0, 1].map((t) => this.teams[1 - t].map((v) => ({ id: v.id, x: r2(v.x), y: r2(v.y), t: 0, alive: true })));
    for (const v of this.vehicles) this.updateCells(v);
    for (const v of this.vehicles) {
      const c = tileCodeAt(this.map, v.x, v.y);
      if (c === T.wall || c === T.barrier || c === T.pit) throw new Error(`spawn for vehicle ${v.id} is on a ${TILE_NAME[c]} tile`);
    }
  }

  // ── vehicles ──────────────────────────────────────────────────────────
  makeVehicle(e, id, x, y, th) {
    const v = {
      id, team: e.team, slot: e.slot, name: e.name || `bot${id}`, botId: e.botId, design: e.design,
      x, y, th, vx: 0, vy: 0, w: 0, fx: Math.cos(th), fy: Math.sin(th),
      alive: true, deathT: null, deathCause: null, killedBy: null,
      energy: 0, shield: 0, overshield: 0, overshieldT: 0, shieldHitT: -99,
      stun: 0, nitro: 0, overdrive: 0, hovering: false, boosting: false, sawing: false, repairing: false,
      item: null, cmd: IDLE, said: undefined, lastHitBy: -1, lastHitT: -99, revealT: -1, mineCd: 0,
      grid: [new Int16Array(GRID_W * GRID_L).fill(-1), new Int16Array(GRID_W * GRID_L).fill(-1)],
      cols: [], stats: newStats(), violations: 0, cutOff: false, comU: 0, comV: 0,
      parts: e.design.parts.map((p, i) => {
        const def = PARTS[p.type];
        const [cx, cy] = centerOf(p), [w, l] = dimsOf(p.type, p.dir);
        return { i, type: p.type, def, x: p.x, y: p.y, z: p.z, dir: p.dir || 'N', hp: def.hp, maxHp: def.hp, alive: true, decor: !!def.decor,
          cells: cellsOf(p), cu: cy * CELL, cv: -cx * CELL, len: (p.dir === 'E' || p.dir === 'W' ? w : l) * CELL,
          u: 0, v: 0, wx: 0, wy: 0, cd: 0, ang: 0, under: -1 };
      }),
    };
    v.core = v.parts.find((p) => p.type === 'core');
    v.decor = v.parts.filter((p) => p.decor);
    v.hpMax = v.parts.reduce((s, p) => s + (p.decor ? 0 : p.maxHp), 0);
    v.hpNow = v.hpMax;
    this.refresh(v, true);
    for (const d of v.decor) for (const [cx, cy] of d.cells) { const b = v.grid[0][cellIndex(cx, cy)]; if (b >= 0) { d.under = b; break; } }
    v.energy = v.energyMax;
    v.shield = v.shieldMax;
    return v;
  }

  refresh(v, first = false) {
    const alive = v.parts.filter((p) => p.alive && !p.decor);
    const a = aggregate(alive);
    if (!first) { // keep the geometry where it is when the centre of mass moves
      const du = a.comU - v.comU, dv = a.comV - v.comV;
      v.x += v.fx * du - v.fy * dv;
      v.y += v.fy * du + v.fx * dv;
    }
    v.mass = a.mass; v.invMass = 1 / a.mass;
    v.inertia = a.inertia; v.invInertia = 1 / a.inertia;
    v.comU = a.comU; v.comV = a.comV; v.radius = a.radius;
    v.energyMax = a.energyCap; v.energyRegen = a.energyRegen;
    if (v.energy > v.energyMax) v.energy = v.energyMax;
    v.sensor = a.sensor; v.seesMines = a.seesMines;
    v.shieldMax = a.shield; v.shieldRegen = a.shieldRegen; v.shieldDelay = a.shieldDelay; v.shieldUse = a.shieldUse;
    if (v.shield > v.shieldMax) v.shield = v.shieldMax;
    v.lift = a.lift; v.gyro = a.gyro; v.driveBoost = a.driveBoost; v.gripBoost = a.gripBoost;
    v.grid[0].fill(-1); v.grid[1].fill(-1);
    v.movers = []; v.weapons = []; v.saws = []; v.thrusters = []; v.repairers = [];
    v.hoverCount = 0; v.hoverUse = 0;
    for (const p of alive) {
      p.u = p.cu - a.comU; p.v = p.cv - a.comV;
      for (const [cx, cy] of p.cells) v.grid[p.z][cellIndex(cx, cy)] = p.i;
      const d = p.def;
      if (d.mover) { v.movers.push(p); if (d.mover === 'hover') { v.hoverCount++; v.hoverUse += d.energyUse; } }
      if (d.weapon === 'melee') v.saws.push(p); else if (d.weapon) v.weapons.push(p);
      if (d.thrust) v.thrusters.push(p);
      if (d.heal) v.repairers.push(p);
    }
    for (const d of v.decor) if (d.alive) { d.u = d.cu - a.comU; d.v = d.cv - a.comV; }
    // one collision circle per occupied stud column
    v.cols = [];
    for (let y = -GRID_HY; y <= GRID_HY; y++) for (let x = -GRID_HX; x <= GRID_HX; x++) {
      const k = cellIndex(x, y), top = v.grid[1][k], bot = v.grid[0][k];
      if (top < 0 && bot < 0) continue;
      v.cols.push({ u: y * CELL - a.comU, v: -x * CELL - a.comV, wx: 0, wy: 0, top, bot });
    }
    v.dirty = false;
  }

  updateCells(v) {
    const fx = (v.fx = Math.cos(v.th)), fy = (v.fy = Math.sin(v.th));
    for (const c of v.cols) { c.wx = v.x + fx * c.u - fy * c.v; c.wy = v.y + fy * c.u + fx * c.v; }
    for (const p of v.parts) {
      if (!p.alive) continue;
      p.wx = v.x + fx * p.u - fy * p.v;
      p.wy = v.y + fy * p.u + fx * p.v;
    }
  }

  /** Piece of `v` at world point (px, py): deck first for shots, chassis first for ground-level hits. */
  partAt(v, px, py, ground = false) {
    const dx = px - v.x, dy = py - v.y;
    const u = dx * v.fx + dy * v.fy + v.comU;
    const l = -dx * v.fy + dy * v.fx + v.comV;
    const bx = Math.round(-l / CELL), by = Math.round(u / CELL);
    if (!inGrid(bx, by)) return null;
    const k = cellIndex(bx, by), top = v.grid[1][k], bot = v.grid[0][k];
    const i = ground ? (bot >= 0 ? bot : top) : (top >= 0 ? top : bot);
    return i < 0 ? null : v.parts[i];
  }

  event(e) { e.t = r2(this.t); this.events.push(e); }

  // ── damage ────────────────────────────────────────────────────────────
  /** shotAng: travel direction of the shot (radians), used for slope ricochets. */
  damage(v, p, amount, dtype, src, shotAng) {
    if (!p.alive || !v.alive || !(amount > 0)) return 0;
    const def = p.def;
    if (def.deflect && shotAng !== undefined && (dtype === 'kinetic' || dtype === 'explosive')
      && Math.cos(shotAng - (v.th + DIR_ANGLE[p.dir])) < -0.5) {
      v.stats.deflected += amount * (1 - def.deflect);
      amount *= def.deflect;
    }
    if (def.armor && (dtype === 'kinetic' || dtype === 'explosive')) amount = Math.max(amount * 0.25, amount - def.armor);
    const dealt = Math.min(p.hp, amount);
    p.hp -= amount;
    if (!p.decor) {
      v.hpNow -= dealt;
      v.stats.damageTaken += dealt;
      if (src && src !== v) {
        src.stats.damageDealt += dealt;
        if (src.stats.byType[dtype] !== undefined) src.stats.byType[dtype] += dealt;
        v.lastHitBy = src.id; v.lastHitT = this.t;
      }
      // decor riding on this piece gets shaken off
      for (const d of v.decor) if (d.alive && d.under === p.i) { d.hp -= amount; if (d.hp <= 0) this.destroy(v, d, src, dtype); }
    }
    if (p.hp <= 0) this.destroy(v, p, src, dtype);
    return dealt;
  }

  destroy(v, p, src, cause) {
    if (!p.alive) return;
    p.alive = false;
    this.event({ k: 'part', v: v.id, i: p.i, c: cause });
    if (p.decor) { p.hp = 0; return; }
    if (p.hp > 0) v.hpNow -= p.hp;
    p.hp = 0;
    for (const [cx, cy] of p.cells) v.grid[p.z][cellIndex(cx, cy)] = -1;
    v.stats.partsLost++;
    if (src && src !== v) src.stats.partsDestroyed++;
    if (p === v.core) { this.kill(v, src, cause); return; }
    if (p.def.volatile) this.pendingBlasts.push({ v, p, src });
    v.dirty = true;
  }

  kill(v, src, cause) {
    if (!v.alive) return;
    v.alive = false; v.deathT = this.t; v.deathCause = cause;
    v.killedBy = src && src !== v ? src.id : -1;
    if (src && src !== v) src.stats.kills++;
    v.vx = v.vy = v.w = 0; v.shield = 0; v.overshield = 0;
    this.event({ k: 'death', v: v.id, by: v.killedBy, c: cause, x: r2(v.x), y: r2(v.y) });
  }

  /** Indexes of living pieces touching piece p: beside it on its layer, or stacked on/under it. */
  touching(v, p) {
    const out = new Set();
    for (const [cx, cy] of p.cells) {
      const k = cellIndex(cx, cy);
      if (v.grid[1 - p.z][k] >= 0) out.add(v.grid[1 - p.z][k]);
      for (const [dx, dy] of NEIGH) {
        const nx = cx + dx, ny = cy + dy;
        if (!inGrid(nx, ny)) continue;
        const i = v.grid[p.z][cellIndex(nx, ny)];
        if (i >= 0 && i !== p.i) out.add(i);
      }
    }
    return out;
  }

  /** Resolve chain reactions, detach orphaned pieces, recompute physics. */
  settle() {
    for (let guard = 0; guard < 20; guard++) {
      let busy = false;
      while (this.pendingBlasts.length) {
        busy = true;
        const { v, p, src } = this.pendingBlasts.shift();
        if (!v.alive) continue;
        this.event({ k: 'boom', x: r2(p.wx), y: r2(p.wy), r: 0.9 });
        for (const i of this.touching(v, p)) this.damage(v, v.parts[i], p.def.volatile, 'explosive', src);
      }
      for (const v of this.vehicles) {
        if (!v.dirty || !v.alive) { v.dirty = false; continue; }
        busy = true;
        const seen = new Uint8Array(v.parts.length);
        const stack = [v.core];
        seen[v.core.i] = 1;
        while (stack.length) {
          const q = stack.pop();
          for (const i of this.touching(v, q)) if (!seen[i]) { seen[i] = 1; stack.push(v.parts[i]); }
        }
        for (const q of v.parts) {
          if (!q.alive) continue;
          if (q.decor) { if (q.under < 0 || !v.parts[q.under].alive) { q.alive = false; q.hp = 0; this.event({ k: 'part', v: v.id, i: q.i, c: 'detached' }); } continue; }
          if (seen[q.i]) continue;
          q.alive = false; v.hpNow -= q.hp; q.hp = 0;
          for (const [cx, cy] of q.cells) v.grid[q.z][cellIndex(cx, cy)] = -1;
          v.stats.partsLost++;
          this.event({ k: 'part', v: v.id, i: q.i, c: 'detached' });
        }
        this.refresh(v);
        this.updateCells(v);
      }
      if (!busy) break;
    }
  }

  heal(v, amount) {
    let best = null, bf = 1;
    for (const p of v.parts) {
      if (!p.alive || p.decor) continue;
      const f = p.hp / p.maxHp;
      if (f < bf) { bf = f; best = p; }
    }
    if (!best) return 0;
    const used = Math.min(amount, best.maxHp - best.hp);
    best.hp += used; v.hpNow += used;
    return used;
  }

  /** opts: { skip: piece, ground: chassis-first, shieldable: shields soak it first } */
  explode(x, y, r, dmg, fmin, team, src, maxParts, opts = {}) {
    this.event({ k: 'boom', x: r2(x), y: r2(y), r });
    for (const v of this.vehicles) {
      if (!v.alive || v.team === team) continue;
      if (Math.hypot(v.x - x, v.y - y) > r + v.radius) continue;
      let scale = 1;
      if (opts.shieldable) {
        const pool = v.shield + v.overshield;
        if (pool > 0) { const used = Math.min(pool, dmg); this.drainShield(v, used); scale = (dmg - used) / dmg; if (scale <= 0.01) continue; }
      }
      const near = new Map(); // piece -> nearest distance
      for (const c of v.cols) {
        const d = Math.hypot(c.wx - x, c.wy - y);
        if (d > r) continue;
        const i = opts.ground ? (c.bot >= 0 ? c.bot : c.top) : (c.top >= 0 ? c.top : c.bot);
        const p = v.parts[i];
        if (!p.alive || p === opts.skip) continue;
        if (!near.has(p) || d < near.get(p)) near.set(p, d);
      }
      const hit = [...near].sort((a, b) => a[1] - b[1] || a[0].i - b[0].i);
      for (let k = 0; k < hit.length && k < maxParts; k++) {
        const [p, d] = hit[k];
        this.damage(v, p, dmg * scale * (1 - (1 - fmin) * (d / r)), 'explosive', src);
      }
    }
  }

  // ── commands ──────────────────────────────────────────────────────────
  setCommand(v, raw) {
    if (!raw || typeof raw !== 'object') { v.cmd = IDLE; v.said = undefined; return; }
    const num = (x, lo, hi) => (typeof x === 'number' && x === x ? clamp(x, lo, hi) : x === true ? hi : 0);
    // an aim is either a world angle (number) or a world point {x, y}; points make every gun converge
    const ang = (a) => {
      if (typeof a === 'number' && Number.isFinite(a)) return a;
      if (a && typeof a === 'object' && Number.isFinite(a.x) && Number.isFinite(a.y)) return { x: a.x, y: a.y };
      return null;
    };
    const c = {
      throttle: num(raw.throttle, -1, 1), steer: num(raw.steer, -1, 1), brake: num(raw.brake, 0, 1),
      aim: ang(raw.aim), aims: null, fire: false, boost: null,
      useItem: !!raw.useItem, shield: raw.shield !== false, repair: raw.repair !== false, melee: raw.melee !== false,
      target: Number.isInteger(raw.target) ? raw.target : null,
    };
    if (raw.fire === true) c.fire = true;
    else if (Array.isArray(raw.fire)) c.fire = raw.fire.filter(Number.isInteger).slice(0, 64);
    if (raw.aims && typeof raw.aims === 'object') {
      c.aims = {};
      for (const k of Object.keys(raw.aims).slice(0, 64)) { const a = ang(raw.aims[k]); if (a !== null) c.aims[k] = a; }
    }
    if (typeof raw.boost === 'number' || raw.boost === true) c.boost = { N: num(raw.boost, 0, 1), E: 0, S: 0, W: 0 };
    else if (raw.boost && typeof raw.boost === 'object') c.boost = { N: num(raw.boost.N, 0, 1), E: num(raw.boost.E, 0, 1), S: num(raw.boost.S, 0, 1), W: num(raw.boost.W, 0, 1) };
    v.cmd = c;
    v.said = undefined;
    if (raw.say !== undefined && raw.say !== null) {
      try { const s = JSON.stringify(raw.say); if (s && s.length <= this.rules.sayLimit) v.said = JSON.parse(s); } catch { /* dropped */ }
    }
  }

  // ── main step ─────────────────────────────────────────────────────────
  step() {
    if (this.finished) return;
    const dt = this.dt;
    this.tick++;
    this.t = this.tick * dt;
    this.beams.length = 0;

    // zone
    const z = this.zone;
    z.r = this.t <= z.start ? z.r0 : this.t >= z.end ? z.minR : z.r0 + (z.minR - z.r0) * ((this.t - z.start) / (z.end - z.start));

    // items appear
    for (const s of this.itemSpawns) {
      if (!s.present && this.t >= s.nextT) {
        const pool = this.map.items;
        s.type = pool[hashSeed('item', this.seed, s.group, s.cycle) % pool.length];
        s.present = true;
        this.event({ k: 'item', s: s.id, type: s.type, x: s.x, y: s.y });
      }
    }
    for (const p of this.pads) p.charge = Math.min(150, p.charge + 6 * dt);

    // drive, energy, hazards
    for (const v of this.vehicles) if (v.alive) this.stepVehicle(v, dt);
    this.settle();
    for (const v of this.vehicles) if (v.alive) this.updateCells(v);

    // collisions
    const vs = this.vehicles;
    for (let i = 0; i < vs.length; i++) {
      if (!vs[i].alive) continue;
      for (let j = i + 1; j < vs.length; j++) if (vs[j].alive) this.collidePair(vs[i], vs[j]);
    }
    for (const v of vs) if (v.alive) this.collideWalls(v);
    this.settle();

    // weapons
    for (const v of vs) if (v.alive) this.stepWeapons(v, dt);
    this.settle();
    this.stepProjectiles(dt);
    this.settle();
    this.stepMines(dt);
    this.settle();

    // items: pick-up and use
    for (const v of vs) {
      if (!v.alive) continue;
      for (const s of this.itemSpawns) {
        if (!s.present) continue;
        if (Math.hypot(v.x - s.x, v.y - s.y) < v.radius + 0.5) this.pickup(v, s);
      }
      if (v.cmd.useItem && v.item && v.stun <= 0) this.useItem(v);
    }
    this.settle();

    // team vision bookkeeping
    for (const team of [0, 1]) {
      for (const ls of this.lastSeen[team]) {
        const e = vs[ls.id];
        if (!e.alive) { ls.alive = false; continue; }
        if (this.visibleTo(team, e)) { ls.x = r2(e.x); ls.y = r2(e.y); ls.t = r2(this.t); }
      }
    }

    this.checkEnd();
  }

  stepVehicle(v, dt) {
    const R = this.rules, st = v.stats;
    v.energy = Math.min(v.energyMax, v.energy + v.energyRegen * dt);
    if (v.stun > 0) { v.stun -= dt; st.timeStunned += dt; }
    if (v.nitro > 0) v.nitro -= dt;
    if (v.overdrive > 0) v.overdrive -= dt;
    if (v.overshieldT > 0) { v.overshieldT -= dt; if (v.overshieldT <= 0) v.overshield = 0; }
    const cmd = v.stun > 0 ? IDLE : v.cmd;
    const tile = tileCodeAt(this.map, v.x, v.y);

    // hover
    let hovering = false;
    if (v.hoverCount > 0 && v.lift >= v.mass) {
      const need = v.hoverUse * dt;
      if (v.energy >= need) { v.energy -= need; hovering = true; }
    }
    v.hovering = hovering;
    if (tile === T.pit && !hovering) {
      const by = this.t - v.lastHitT < 4 && v.lastHitBy >= 0 ? this.vehicles[v.lastHitBy] : null;
      this.kill(v, by, 'fell');
      return;
    }

    // terrain
    let trW = 1, trT = 1, grW = 1, grT = 1, lin = hovering ? PHYS.hoverDragLin : PHYS.dragLin;
    const mud = !hovering && tile === T.mud;
    if (!hovering) {
      if (mud) { trW = 0.4; trT = 0.85; st.timeOn.mud += dt; }
      else if (tile === T.ice) { trW = 0.35; trT = 0.6; grW = 0.08; grT = 0.25; st.timeOn.ice += dt; }
    }
    const boost = (v.nitro > 0 ? ITEMS.nitro.mult : 1) * v.driveBoost;
    const nitro = v.nitro > 0 ? ITEMS.nitro.mult : 1;
    const fx = v.fx, fy = v.fy;

    // movers
    let F = 0, torque = 0, gripSum = 0, gripN = 0, wheelN = 0, trackN = 0;
    for (const m of v.movers) {
      if (!m.alive) continue;
      const kind = m.def.mover;
      let eff;
      if (hovering) { if (kind !== 'hover') continue; eff = 1; gripN++; gripSum += m.def.grip; }
      else if (kind === 'hover') { eff = 0.5; }
      else if (kind === 'track') { eff = trT; gripSum += m.def.grip * grT; gripN++; trackN++; }
      else { eff = mud && m.def.mudTraction ? m.def.mudTraction : trW; gripSum += m.def.grip * grW; gripN++; wheelN++; }
      const side = m.v > 0.05 ? -1 : m.v < -0.05 ? 1 : 0; // left movers get throttle - steer
      const c = clamp(cmd.throttle + side * cmd.steer, -1, 1);
      let f = c * m.def.force * eff * boost;
      if (c < 0) f *= PHYS.reverseFactor;
      F += f;
      torque -= m.v * f;
    }
    torque += cmd.steer * v.gyro;

    // thrusters
    let tu = 0, tl = 0;
    v.boosting = false;
    if (cmd.boost) {
      for (const th of v.thrusters) {
        if (!th.alive) continue;
        const level = cmd.boost[th.dir] || 0;
        if (level <= 0) continue;
        const need = th.def.energyUse * level * dt;
        if (v.energy < need) { st.timeEnergyStarved += dt; continue; }
        v.energy -= need;
        const f = th.def.thrust * level * nitro;
        const [du, dl] = LOCAL_DIR[th.dir];
        tu += f * du; tl += f * dl;
        torque += th.u * (f * dl) - th.v * (f * du);
        v.boosting = true;
      }
    }

    // integrate in the vehicle frame so grip can act sideways
    let vf = v.vx * fx + v.vy * fy;
    let vl = -v.vx * fy + v.vy * fx;
    vf += ((F + tu) * v.invMass) * dt;
    vl += (tl * v.invMass) * dt;
    if (!hovering) {
      if (gripN === 0) lin = 2.5;                                   // belly on the ground
      else if (mud) lin += (wheelN * 1.2 + trackN * 0.3) / (wheelN + trackN);
    }
    if (cmd.brake > 0 && gripN > 0) lin += cmd.brake * 5;
    const kLat = gripN ? PHYS.gripBase * (gripSum / gripN) * v.gripBoost : 1.5;
    vf /= 1 + (lin + PHYS.dragQuad * Math.abs(vf)) * dt;
    vl /= 1 + (kLat + lin * 0.5) * dt;
    v.vx = fx * vf - fy * vl;
    v.vy = fy * vf + fx * vl;
    v.w += torque * v.invInertia * dt;
    v.w /= 1 + (PHYS.angDragLin + PHYS.angDragQuad * Math.abs(v.w)) * dt;

    const sp = Math.hypot(v.vx, v.vy);
    v.x += v.vx * dt; v.y += v.vy * dt;
    v.th = wrap(v.th + v.w * dt);
    st.distance += sp * dt;
    if (sp < 0.3) st.timeStill += dt;

    // shields
    if (v.shieldMax > 0) {
      const need = v.shieldUse * dt;
      if (cmd.shield && v.stun <= 0 && v.energy >= need) {
        v.energy -= need;
        if (this.t - v.shieldHitT > v.shieldDelay) v.shield = Math.min(v.shieldMax, v.shield + v.shieldRegen * dt);
      } else v.shield = Math.max(0, v.shield - 60 * dt);
    }

    // repair arms
    v.repairing = false;
    if (cmd.repair && v.repairers.length && v.stun <= 0) {
      for (const rp of v.repairers) {
        if (!rp.alive) continue;
        const need = rp.def.energyUse * dt;
        if (v.energy < need) break;
        let target = null, worst = 0.995;
        for (const a of this.teams[v.team]) {
          if (!a.alive) continue;
          if (a !== v && Math.hypot(a.x - v.x, a.y - v.y) > rp.def.healRange + a.radius) continue;
          if (cmd.target !== null && a.id === cmd.target && a.hpNow < a.hpMax - 0.5) { target = a; break; }
          let f = 1;
          for (const q of a.parts) if (q.alive && !q.decor) f = Math.min(f, q.hp / q.maxHp);
          if (f < worst) { worst = f; target = a; }
        }
        if (!target) break;
        const used = this.heal(target, rp.def.heal * dt);
        if (used > 0) {
          v.energy -= need; st.healing += used; v.repairing = true;
          if (target !== v) this.beams.push([r2(rp.wx), r2(rp.wy), r2(target.x), r2(target.y), 2, v.team]);
        }
      }
    }

    // hazards
    if (tile === T.lava) {
      st.timeOn.lava += dt;
      const d = R.lavaDps * dt * (hovering ? 0.25 : 1);
      for (const p of v.parts) if (p.alive && !p.decor) this.damage(v, p, d, 'burn', null);
    } else if (tile === T.pad && sp < 2 && v.hpNow < v.hpMax) {
      const tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
      const pad = this.pads.find((p) => p.tx === tx && p.ty === ty);
      if (pad && pad.charge > 0) {
        const used = this.heal(v, Math.min(25 * dt, pad.charge));
        pad.charge -= used; st.healing += used;
      }
    }
    const z = this.zone;
    if (Math.hypot(v.x - z.x, v.y - z.y) > z.r) {
      st.timeOutsideZone += dt;
      const d = R.zoneDps * dt;
      for (const p of v.parts) if (p.alive && !p.decor) this.damage(v, p, d, 'burn', null);
    }
  }

  // ── collisions ────────────────────────────────────────────────────────
  collidePair(a, b) {
    const R0 = a.radius + b.radius;
    if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 > R0 * R0) return;
    const enemy = a.team !== b.team;
    const lim = (2 * RC) ** 2;
    for (let iter = 0; iter < 3; iter++) {
      if (!a.alive || !b.alive) return;
      let best = 0, ca = null, cb = null, bd = 0;
      const ra = (a.radius + RC) ** 2, rb = (b.radius + RC) ** 2;
      const near = [];
      for (const q of b.cols) if ((q.wx - a.x) ** 2 + (q.wy - a.y) ** 2 <= ra) near.push(q);
      if (!near.length) return;
      for (const p of a.cols) {
        if ((p.wx - b.x) ** 2 + (p.wy - b.y) ** 2 > rb) continue;
        for (const q of near) {
          const dx = q.wx - p.wx, dy = q.wy - p.wy, d2 = dx * dx + dy * dy;
          if (d2 >= lim) continue;
          const d = Math.sqrt(d2), pen = 2 * RC - d;
          if (pen > best) { best = pen; ca = p; cb = q; bd = d; }
        }
      }
      if (!ca) return;
      let nx, ny;
      if (bd > 1e-6) { nx = (cb.wx - ca.wx) / bd; ny = (cb.wy - ca.wy) / bd; }
      else { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; nx = (b.x - a.x) / d; ny = (b.y - a.y) / d; }
      const cx = ca.wx + nx * RC, cy = ca.wy + ny * RC;
      const rax = cx - a.x, ray = cy - a.y, rbx = cx - b.x, rby = cy - b.y;
      const vn = ((b.vx - b.w * rby) - (a.vx - a.w * ray)) * nx + ((b.vy + b.w * rbx) - (a.vy + a.w * rax)) * ny;
      const ran = rax * ny - ray * nx, rbn = rbx * ny - rby * nx;
      const k = a.invMass + b.invMass + ran * ran * a.invInertia + rbn * rbn * b.invInertia;
      if (vn < 0) {
        const j = (-(1 + 0.2) * vn) / k;
        let ja = j, jb = j;
        if (enemy) {
          // collisions happen at bumper height: the chassis piece of each column takes it
          const pa = a.parts[ca.bot >= 0 ? ca.bot : ca.top], pb = b.parts[cb.bot >= 0 ? cb.bot : cb.top];
          if (pa.def.shove) jb *= pa.def.shove;
          if (pb.def.shove) ja *= pb.def.shove;
          a.lastHitBy = b.id; b.lastHitBy = a.id; a.lastHitT = b.lastHitT = this.t;
          if (-vn > this.rules.ramMinSpeed) {
            const base = (0.5 / k) * vn * vn * this.rules.ramK;
            const toB = base * (pa.def.ramOut || 1) * (pb.def.ramIn || 1) * (a.overdrive > 0 ? ITEMS.overdrive.mult : 1);
            const toA = base * (pb.def.ramOut || 1) * (pa.def.ramIn || 1) * (b.overdrive > 0 ? ITEMS.overdrive.mult : 1);
            a.stats.rams++; b.stats.rams++;
            if (toA + toB > 6) this.event({ k: 'ram', x: r2(cx), y: r2(cy), d: Math.round(toA + toB) });
            this.damage(b, pb, toB, 'ram', a);
            this.damage(a, pa, toA, 'ram', b);
          }
        }
        a.vx -= ja * nx * a.invMass; a.vy -= ja * ny * a.invMass; a.w -= ran * ja * a.invInertia;
        b.vx += jb * nx * b.invMass; b.vy += jb * ny * b.invMass; b.w += rbn * jb * b.invInertia;
      }
      const tot = a.invMass + b.invMass, push = best * 0.9;
      a.x -= nx * push * (a.invMass / tot); a.y -= ny * push * (a.invMass / tot);
      b.x += nx * push * (b.invMass / tot); b.y += ny * push * (b.invMass / tot);
      this.updateCells(a); this.updateCells(b);
    }
  }

  collideWalls(v) {
    const map = this.map;
    const tx0 = Math.floor((v.x - v.radius) / TILE), tx1 = Math.floor((v.x + v.radius) / TILE);
    const ty0 = Math.floor((v.y - v.radius) / TILE), ty1 = Math.floor((v.y + v.radius) / TILE);
    let any = false;
    for (let ty = ty0; ty <= ty1 && !any; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const c = map.tiles[ty * map.w + tx];
      if (c === T.wall || c === T.barrier) { any = true; break; }
    }
    if (!any) return;
    for (let iter = 0; iter < 3; iter++) {
      let best = 0, bp = null, bnx = 0, bny = 0, bcx = 0, bcy = 0;
      for (const p of v.cols) {
        const ax0 = Math.floor((p.wx - RC) / TILE), ax1 = Math.floor((p.wx + RC) / TILE);
        const ay0 = Math.floor((p.wy - RC) / TILE), ay1 = Math.floor((p.wy + RC) / TILE);
        for (let ty = ay0; ty <= ay1; ty++) for (let tx = ax0; tx <= ax1; tx++) {
          if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
          const c = map.tiles[ty * map.w + tx];
          if (c !== T.wall && c !== T.barrier) continue;
          const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
          const qx = clamp(p.wx, x0, x1), qy = clamp(p.wy, y0, y1);
          const dx = p.wx - qx, dy = p.wy - qy, d2 = dx * dx + dy * dy;
          let pen, nx, ny;
          if (d2 > 1e-9) {
            if (d2 >= RC * RC) continue;
            const d = Math.sqrt(d2); pen = RC - d; nx = dx / d; ny = dy / d;
          } else { // centre inside the tile: leave through the nearest face
            const l = p.wx - x0, r = x1 - p.wx, b = p.wy - y0, t = y1 - p.wy, m = Math.min(l, r, b, t);
            if (m === l) { nx = -1; ny = 0; } else if (m === r) { nx = 1; ny = 0; } else if (m === b) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
            pen = m + RC;
          }
          if (pen > best) { best = pen; bp = p; bnx = nx; bny = ny; bcx = qx; bcy = qy; }
        }
      }
      if (!bp) return;
      const rx = bcx - v.x, ry = bcy - v.y;
      const vn = (v.vx - v.w * ry) * bnx + (v.vy + v.w * rx) * bny;
      if (vn < 0) {
        const rn = rx * bny - ry * bnx;
        const k = v.invMass + rn * rn * v.invInertia;
        const j = (-(1 + 0.15) * vn) / k;
        v.vx += j * bnx * v.invMass; v.vy += j * bny * v.invMass; v.w += rn * j * v.invInertia;
        if (-vn > 3) {
          const part = v.parts[bp.bot >= 0 ? bp.bot : bp.top];
          this.damage(v, part, (0.5 / k) * vn * vn * this.rules.ramK * 0.5 * (part.def.ramIn || 1), 'ram', null);
        }
      }
      v.x += bnx * best; v.y += bny * best;
      this.updateCells(v);
    }
  }

  // ── weapons ───────────────────────────────────────────────────────────
  stepWeapons(v, dt) {
    const cmd = v.stun > 0 ? IDLE : v.cmd, st = v.stats;
    const od = v.overdrive > 0 ? ITEMS.overdrive.mult : 1;
    let wanted = false, blocked = true;
    for (const w of v.weapons) {
      if (!w.alive) continue;
      const d = w.def;
      if (w.cd > 0) w.cd -= dt;
      const mount = v.th + DIR_ANGLE[w.dir];
      const raw = cmd.aims && cmd.aims[w.i] !== undefined ? cmd.aims[w.i] : cmd.aim;
      let desired = raw;
      if (desired === null || desired === undefined) desired = mount;
      else if (typeof desired === 'object') desired = Math.atan2(desired.y - w.wy, desired.x - w.wx);
      const off = angDiff(desired, mount);
      const inArc = Math.abs(off) <= d.arc + 0.02;
      const rel = clamp(off, -d.arc, d.arc);
      const step = d.traverse * dt;
      w.ang += clamp(angDiff(rel, w.ang), -step, step);
      const fire = cmd.fire === true || (Array.isArray(cmd.fire) && cmd.fire.includes(w.i));
      if (!fire) continue;
      wanted = true;
      if (!inArc || Math.abs(angDiff(rel, w.ang)) > 0.05) continue;
      blocked = false;
      const a = mount + w.ang;
      const ca = Math.cos(a), sa = Math.sin(a);
      const reach = w.len * 0.5 + CELL * 0.15;
      const mx = w.wx + ca * reach, my = w.wy + sa * reach;
      if (d.weapon === 'beam') {
        const need = d.energyUse * dt;
        if (v.energy < need) { st.timeEnergyStarved += dt; continue; }
        v.energy -= need;
        v.revealT = this.t + this.rules.revealTime;
        let hitAny = false;
        const end = this.ray(mx, my, a, d.range, v.team,
          (e) => { const pool = e.shield + e.overshield; if (pool <= 0) return false; this.drainShield(e, d.dps * dt * od); return true; },
          (e, p) => { this.damage(e, p, d.dps * dt * od, d.dtype, v); hitAny = true; return true; });
        if (hitAny) st.hits += dt;
        st.shots += dt;
        this.beams.push([r2(mx), r2(my), r2(end.x), r2(end.y), 0, v.team]);
        continue;
      }
      if (w.cd > 0) continue;
      if (v.energy < d.energyShot) { st.timeEnergyStarved += dt; continue; }
      v.energy -= d.energyShot;
      v.revealT = this.t + this.rules.revealTime;
      w.cd = d.cooldown;
      st.shots++;
      if (d.weapon === 'rail') {
        let dmg = d.dmg * od, n = 0, counted = false;
        const end = this.ray(mx, my, a, d.range, v.team,
          (e) => { const pool = e.shield + e.overshield; if (pool <= 0) return false; const used = Math.min(pool, dmg); this.drainShield(e, used); dmg -= used; return dmg <= 0.5; },
          (e, p) => { this.damage(e, p, dmg, d.dtype, v, a); if (!counted) { st.hits++; counted = true; } dmg *= d.pierceFalloff; return ++n >= d.pierce; });
        this.event({ k: 'rail', x1: r2(mx), y1: r2(my), x2: r2(end.x), y2: r2(end.y), team: v.team });
        continue;
      }
      if (d.weapon === 'lob') {
        // lands on the aimed point (or straight out along the barrel), clamped to the range band
        let tx, ty;
        if (raw && typeof raw === 'object') { tx = raw.x; ty = raw.y; } else { tx = w.wx + ca * 12; ty = w.wy + sa * 12; }
        let dist = Math.hypot(tx - w.wx, ty - w.wy) || 1;
        const want = clamp(dist, d.minRange, d.range);
        tx = w.wx + ((tx - w.wx) / dist) * want; ty = w.wy + ((ty - w.wy) / dist) * want; dist = want;
        this.projectiles.push({ id: this.nextId++, k: 'lob', x: mx, y: my, x0: mx, y0: my, tx, ty, t: 0, T: dist / d.projSpeed, h: 0, peak: 1.6 + dist * 0.2,
          vx: ca, vy: sa, team: v.team, owner: v.id, dmg: d.dmg * od, splash: d.splash });
        continue;
      }
      const n = d.salvo || 1;
      for (let s = 0; s < n; s++) {
        const spread = d.spread ? (this.rng() - 0.5) * 2 * d.spread : n > 1 ? (s - (n - 1) / 2) * 0.28 : 0;
        const pa = a + spread;
        const proj = {
          id: this.nextId++, k: d.weapon, x: mx, y: my, vx: Math.cos(pa) * d.projSpeed, vy: Math.sin(pa) * d.projSpeed,
          speed: d.projSpeed, team: v.team, owner: v.id, dmg: d.dmg * od, dtype: d.dtype, splash: d.splash || null,
          range: d.range, dist: 0, ttl: d.ttl || 99, turn: d.turn || 0, target: -1,
        };
        if (d.weapon === 'missile') {
          let best = 0.7, tgt = -1;
          for (const e of this.teams[1 - v.team]) {
            if (!e.alive || !this.visibleTo(v.team, e)) continue;
            if (cmd.target === e.id) { tgt = e.id; break; }
            const da = Math.abs(angDiff(Math.atan2(e.y - my, e.x - mx), a));
            if (da < best) { best = da; tgt = e.id; }
          }
          proj.target = tgt;
        }
        this.projectiles.push(proj);
      }
    }
    if (wanted && blocked) st.timeFireOutOfArc += dt;

    // saws
    v.sawing = false;
    if (cmd.melee && v.saws.length) {
      for (const s of v.saws) {
        if (!s.alive) continue;
        const need = s.def.energyUse * dt;
        if (v.energy < need) continue;
        const a = v.th + DIR_ANGLE[s.dir];
        const tx = s.wx + Math.cos(a) * CELL * 0.5, ty = s.wy + Math.sin(a) * CELL * 0.5;
        let best = s.def.reach, tv = null, tc = null;
        for (const e of this.teams[1 - v.team]) {
          if (!e.alive || Math.hypot(e.x - tx, e.y - ty) > e.radius + s.def.reach) continue;
          for (const q of e.cols) {
            const dd = Math.hypot(q.wx - tx, q.wy - ty);
            if (dd < best) { best = dd; tv = e; tc = q; }
          }
        }
        if (tc) {
          v.energy -= need; v.sawing = true;
          this.damage(tv, tv.parts[tc.bot >= 0 ? tc.bot : tc.top], s.def.dps * dt * od, 'melee', v);
        }
      }
    }
  }

  drainShield(e, amount) {
    e.shieldHitT = this.t;
    const o = Math.min(e.overshield, amount);
    e.overshield -= o;
    e.shield = Math.max(0, e.shield - (amount - o));
  }

  /**
   * March a ray. onShield(v) / onHit(v, piece) return true to stop the ray.
   * Returns the end point.
   */
  ray(ox, oy, ang, range, team, onShield, onHit) {
    const dx = Math.cos(ang), dy = Math.sin(ang), step = 0.1;
    const cands = [];
    for (const e of this.teams[1 - team]) {
      if (!e.alive) continue;
      const t = clamp((e.x - ox) * dx + (e.y - oy) * dy, 0, range);
      const px = ox + dx * t, py = oy + dy * t;
      if (Math.hypot(e.x - px, e.y - py) < e.radius + 0.5) cands.push({ e, inside: false, last: null });
    }
    let x = ox, y = oy;
    for (let d = 0; d <= range; d += step) {
      x = ox + dx * d; y = oy + dy * d;
      const c = tileCodeAt(this.map, x, y);
      if (c === T.wall) return { x, y };
      for (const cd of cands) {
        const e = cd.e;
        if (!e.alive) continue;
        const dd = Math.hypot(e.x - x, e.y - y);
        if (!cd.inside && dd < e.radius + 0.3) {
          cd.inside = true;
          if (e.shield + e.overshield > 0 && onShield(e)) return { x, y };
        }
        if (dd > e.radius) continue;
        const p = this.partAt(e, x, y);
        if (p && p !== cd.last) { cd.last = p; if (onHit(e, p)) return { x, y }; }
      }
    }
    return { x, y };
  }

  stepProjectiles(dt) {
    const map = this.map, enemiesOf = this.teams;
    const keep = [];
    for (const p of this.projectiles) {
      if (p.k === 'lob') { // mortar shell: flies over everything, bursts on its aim point
        p.t += dt;
        const s = Math.min(1, p.t / p.T);
        p.x = p.x0 + (p.tx - p.x0) * s; p.y = p.y0 + (p.ty - p.y0) * s; p.h = 4 * p.peak * s * (1 - s);
        if (s >= 1) this.explode(p.tx, p.ty, p.splash.r, p.dmg, 0.35, p.team, this.vehicles[p.owner], p.splash.max || 6, { shieldable: true });
        else keep.push(p);
        continue;
      }
      p.ttl -= dt;
      if (p.turn && p.target >= 0) {
        const e = this.vehicles[p.target];
        if (e.alive) {
          const cur = Math.atan2(p.vy, p.vx);
          const na = cur + clamp(angDiff(Math.atan2(e.y - p.y, e.x - p.x), cur), -p.turn * dt, p.turn * dt);
          p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
        }
      }
      const n = Math.max(1, Math.ceil((p.speed * dt) / 0.18));
      const sx = (p.vx * dt) / n, sy = (p.vy * dt) / n, sl = (p.speed * dt) / n;
      let dead = p.ttl <= 0;
      for (let i = 0; i < n && !dead; i++) {
        p.x += sx; p.y += sy; p.dist += sl;
        if (p.dist > p.range || p.x < -2 || p.y < -2 || p.x > map.width + 2 || p.y > map.height + 2) { dead = true; break; }
        if (tileCodeAt(map, p.x, p.y) === T.wall) {
          if (p.splash) this.explode(p.x - sx, p.y - sy, p.splash.r, p.dmg * p.splash.f, 0.4, p.team, this.vehicles[p.owner], 4);
          dead = true; break;
        }
        for (const e of enemiesOf[1 - p.team]) {
          if (!e.alive) continue;
          const dd = Math.hypot(e.x - p.x, e.y - p.y);
          if (dd > e.radius + 0.3) continue;
          const pool = e.shield + e.overshield;
          if (pool > 0) {
            const used = Math.min(pool, p.dmg);
            this.drainShield(e, used);
            p.dmg -= used;
            if (p.dmg <= 0.5) { this.event({ k: 'spark', x: r2(p.x), y: r2(p.y), s: 1 }); dead = true; break; }
          }
          const part = this.partAt(e, p.x, p.y);
          if (!part) continue;
          const src = this.vehicles[p.owner];
          src.stats.hits++;
          this.damage(e, part, p.dmg, p.dtype, src, Math.atan2(p.vy, p.vx));
          if (p.splash) this.explode(p.x, p.y, p.splash.r, p.dmg * p.splash.f, 0.4, p.team, src, p.splash.max || 5, { skip: part });
          dead = true; break;
        }
      }
      if (dead && p.k === 'missile' && p.ttl <= 0 && p.splash) this.event({ k: 'boom', x: r2(p.x), y: r2(p.y), r: 0.5 });
      if (!dead) keep.push(p);
    }
    this.projectiles = keep;
  }

  stepMines(dt) {
    if (!this.mines.length) return;
    const M = ITEMS.mine, keep = [];
    for (const m of this.mines) {
      if (m.arm > 0) { m.arm -= dt; keep.push(m); continue; }
      let trig = false;
      for (const e of this.teams[1 - m.team]) {
        if (!e.alive || e.hovering) continue;
        if (Math.hypot(e.x - m.x, e.y - m.y) > e.radius + M.trigger) continue;
        for (const q of e.cols) if (Math.hypot(q.wx - m.x, q.wy - m.y) < M.trigger) { trig = true; break; }
        if (trig) break;
      }
      if (trig) {
        this.event({ k: 'mineboom', id: m.id });
        this.explode(m.x, m.y, M.radius, m.dmg, 0.4, m.team, this.vehicles[m.owner], 6, { ground: true });
      } else keep.push(m);
    }
    this.mines = keep;
  }

  pickup(v, s) {
    const def = ITEMS[s.type];
    s.present = false; s.cycle++; s.nextT = this.t + this.rules.itemRespawn;
    v.stats.itemsPicked++;
    this.event({ k: 'pickup', v: v.id, s: s.id, type: s.type });
    if (def.held) { v.item = { type: s.type, charges: def.charges }; return; }
    if (s.type === 'repair') {
      for (const p of v.parts) if (p.alive && !p.decor && p.hp < p.maxHp) {
        const add = Math.min(p.maxHp - p.hp, p.maxHp * 0.35);
        p.hp += add; v.hpNow += add; v.stats.healing += add;
      }
    } else if (s.type === 'shield') { v.overshield = def.amount; v.overshieldT = def.time; }
    else if (s.type === 'overdrive') v.overdrive = def.time;
    else if (s.type === 'nitro') v.nitro = def.time;
  }

  useItem(v) {
    const it = v.item, def = ITEMS[it.type];
    if (it.type === 'mine') {
      if (v.mineCd > this.t) return;
      v.mineCd = this.t + 0.6;
      const m = { id: this.nextId++, x: v.x - v.fx * (v.radius + 0.4), y: v.y - v.fy * (v.radius + 0.4), team: v.team, owner: v.id,
        arm: def.arm, dmg: def.dmg * (v.overdrive > 0 ? ITEMS.overdrive.mult : 1) };
      const c = tileCodeAt(this.map, m.x, m.y);
      if (c === T.wall || c === T.barrier || c === T.pit) return; // nowhere to put it; keep the charge
      this.mines.push(m);
      this.event({ k: 'mine', id: m.id, x: r2(m.x), y: r2(m.y), team: m.team });
    } else if (it.type === 'emp') {
      this.event({ k: 'emp', x: r2(v.x), y: r2(v.y), r: def.radius, team: v.team });
      for (const e of this.teams[1 - v.team]) {
        if (!e.alive || Math.hypot(e.x - v.x, e.y - v.y) > def.radius + e.radius) continue;
        e.stun = Math.max(e.stun, def.stun);
        e.shield = 0; e.overshield = 0; e.shieldHitT = this.t;
        e.energy = Math.max(0, e.energy - def.drain);
      }
    }
    v.stats.itemsUsed++;
    this.event({ k: 'use', v: v.id, type: it.type });
    if (--it.charges <= 0) v.item = null;
  }

  // ── vision & observations ─────────────────────────────────────────────
  visibleTo(team, e) {
    if (e.revealT > this.t) return true; // muzzle flash
    for (const a of this.teams[team]) {
      if (!a.alive) continue;
      const r = a.sensor + e.radius;
      if ((a.x - e.x) ** 2 + (a.y - e.y) ** 2 <= r * r) return true;
    }
    return false;
  }

  publicSnapshot(v) {
    const weapons = {};
    let maxRange = 0;
    const parts = [];
    for (const p of v.parts) {
      if (p.decor) continue;
      if (p.alive && p.def.weapon) {
        weapons[p.type] = (weapons[p.type] || 0) + 1;
        maxRange = Math.max(maxRange, p.def.range || p.def.reach || 0);
      }
      parts.push(Object.freeze({ i: p.i, type: p.type, x: p.x, y: p.y, z: p.z, dir: p.dir, alive: p.alive,
        hpFrac: r3(p.hp / p.maxHp), wx: r2(p.wx), wy: r2(p.wy) }));
    }
    return Object.freeze({
      id: v.id, team: v.team, slot: v.slot, name: v.name, alive: v.alive,
      x: r2(v.x), y: r2(v.y), heading: r3(v.th), vx: r2(v.vx), vy: r2(v.vy), speed: r2(Math.hypot(v.vx, v.vy)), angVel: r3(v.w),
      hpFrac: r3(Math.max(0, v.hpNow / v.hpMax)), coreFrac: r3(Math.max(0, v.core.hp / v.core.maxHp)),
      energyFrac: v.energyMax ? r3(v.energy / v.energyMax) : 0,
      mass: Math.round(v.mass), radius: r2(v.radius), shield: Math.round(v.shield + v.overshield),
      hovering: v.hovering, stunned: v.stun > 0 ? r2(v.stun) : 0,
      item: v.item ? v.item.type : null, weapons: Object.freeze(weapons), maxRange,
      parts: Object.freeze(parts),
    });
  }

  /** Build the observation every controller receives. Call once per decision tick. */
  observeAll() {
    const snaps = this.vehicles.map((v) => this.publicSnapshot(v));
    const items = Object.freeze(this.itemSpawns.filter((s) => s.present).map((s) => Object.freeze({ id: s.id, type: s.type, x: s.x, y: s.y })));
    const pads = Object.freeze(this.pads.map((p) => Object.freeze({ x: p.x, y: p.y, charge: Math.round(p.charge) })));
    const z = this.zone;
    const zone = Object.freeze({ x: z.x, y: z.y, r: r2(z.r), minR: z.minR, startT: z.start, endT: z.end, shrinking: this.t > z.start && this.t < z.end });
    const out = [];
    for (const v of this.vehicles) {
      if (!v.alive) { out.push(null); continue; }
      const mates = this.teams[v.team], foes = this.teams[1 - v.team];
      const enemies = [];
      for (const e of foes) if (e.alive && this.visibleTo(v.team, e)) enemies.push(snaps[e.id]);
      if (!enemies.length) v.stats.timeNoEnemyVisible += this.dt * this.rules.decisionEvery;
      const radar = mates.some((a) => a.alive && a.seesMines);
      const projectiles = [];
      for (const p of this.projectiles) {
        if (p.team === v.team) continue;
        const d2 = (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        if (d2 >= v.sensor * v.sensor) continue;
        if (p.k === 'lob') projectiles.push({ kind: 'mortar', x: r2(p.x), y: r2(p.y), vx: 0, vy: 0, landsAt: { x: r2(p.tx), y: r2(p.ty) }, landsIn: r2(p.T - p.t), d2 });
        else projectiles.push({ kind: p.k, x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), d2 });
      }
      projectiles.sort((a, b) => a.d2 - b.d2);
      projectiles.length = Math.min(projectiles.length, 24);
      const mines = [];
      for (const m of this.mines) {
        if (m.team === v.team) continue;
        const d = Math.hypot(m.x - v.x, m.y - v.y);
        if (d < 5 || (radar && this.visibleTo(v.team, { x: m.x, y: m.y, radius: 0, revealT: -1 }))) mines.push({ x: r2(m.x), y: r2(m.y) });
      }
      const messages = [];
      for (const a of mates) if (a !== v && a.said !== undefined) messages.push({ from: a.slot, id: a.id, data: a.said });
      const od = v.overdrive > 0 ? ITEMS.overdrive.mult : 1;
      out.push({
        t: r2(this.t), tick: this.tick, timeLeft: r2(this.rules.duration - this.t), dt: this.dt * this.rules.decisionEvery,
        self: {
          ...snaps[v.id],
          hp: Math.round(v.hpNow), maxHp: v.hpMax, coreHp: Math.round(v.core.hp), coreMaxHp: v.core.maxHp,
          energy: r2(v.energy), energyMax: v.energyMax, energyRegen: v.energyRegen,
          shieldMax: v.shieldMax, overshield: Math.round(v.overshield), sensor: v.sensor,
          item: v.item ? { type: v.item.type, charges: v.item.charges } : null,
          effects: { overdrive: v.overdrive > 0 ? r2(v.overdrive) : 0, nitro: v.nitro > 0 ? r2(v.nitro) : 0 },
          tile: TILE_NAME[tileCodeAt(this.map, v.x, v.y)],
          parts: v.parts.filter((p) => !p.decor).map((p) => ({ i: p.i, type: p.type, x: p.x, y: p.y, z: p.z, dir: p.dir, alive: p.alive,
            hp: Math.round(p.hp), maxHp: p.maxHp, wx: r2(p.wx), wy: r2(p.wy) })),
          weapons: v.parts.filter((p) => p.def.weapon && p.def.weapon !== 'melee').map((p) => ({
            i: p.i, type: p.type, dir: p.dir, alive: p.alive,
            ready: p.alive && p.cd <= 0 && v.energy >= (p.def.energyShot ?? p.def.energyUse * this.dt),
            cooldown: p.cd > 0 ? r2(p.cd) : 0,
            mountAngle: r3(wrap(v.th + DIR_ANGLE[p.dir])), angle: r3(wrap(v.th + DIR_ANGLE[p.dir] + p.ang)),
            arc: p.def.arc, range: p.def.range, minRange: p.def.minRange || 0, projSpeed: p.def.projSpeed || Infinity,
            dmg: (p.def.dmg ?? p.def.dps) * od,
          })),
        },
        allies: mates.filter((a) => a !== v).map((a) => snaps[a.id]),
        enemies,
        enemiesAlive: foes.reduce((n, e) => n + (e.alive ? 1 : 0), 0),
        lastSeen: this.lastSeen[v.team].map((l) => ({ ...l })),
        projectiles, mines, items, pads, zone, messages,
      });
    }
    return out;
  }

  // ── end of match ──────────────────────────────────────────────────────
  teamScore(t) {
    let alive = 0, hp = 0, dmg = 0;
    for (const v of this.teams[t]) {
      if (v.alive) { alive++; hp += Math.max(0, v.hpNow / v.hpMax); }
      dmg += v.stats.damageDealt;
    }
    return { alive, hp, dmg };
  }

  checkEnd() {
    const a = this.teamScore(0), b = this.teamScore(1);
    if (a.alive === 0 || b.alive === 0) {
      this.finished = true;
      this.winner = a.alive === b.alive ? -1 : a.alive > 0 ? 0 : 1;
      this.endReason = this.winner < 0 ? 'mutual destruction' : 'elimination';
    } else if (this.t >= this.rules.duration - 1e-9) {
      this.finished = true;
      if (a.alive !== b.alive) { this.winner = a.alive > b.alive ? 0 : 1; this.endReason = 'time: more vehicles alive'; }
      else if (Math.abs(a.hp - b.hp) > 0.005) { this.winner = a.hp > b.hp ? 0 : 1; this.endReason = 'time: more hull remaining'; }
      else if (Math.abs(a.dmg - b.dmg) > 1) { this.winner = a.dmg > b.dmg ? 0 : 1; this.endReason = 'time: more damage dealt'; }
      else { this.winner = -1; this.endReason = 'time: exact tie'; }
    }
    if (this.finished) this.event({ k: 'end', winner: this.winner, reason: this.endReason });
  }

  // ── replay frames ─────────────────────────────────────────────────────
  frame() {
    const v = this.vehicles.map((x) => {
      let f = 0;
      if (x.alive) f |= FLAG.alive;
      if (x.boosting) f |= FLAG.boost;
      if (x.stun > 0) f |= FLAG.stun;
      if (x.hovering) f |= FLAG.hover;
      if (x.overdrive > 0) f |= FLAG.overdrive;
      if (x.nitro > 0) f |= FLAG.nitro;
      if (x.overshield > 0) f |= FLAG.overshield;
      if (x.sawing) f |= FLAG.saw;
      if (x.repairing) f |= FLAG.repair;
      const row = [r2(x.x), r2(x.y), r3(x.th), x.energyMax ? r2(x.energy / x.energyMax) : 0,
        Math.round(x.shield + x.overshield), r3(Math.max(0, x.hpNow / x.hpMax)), f, x.item ? x.item.type : 0];
      for (const p of x.parts) if (p.def.weapon && p.def.weapon !== 'melee') row.push(r2(p.ang));
      return row;
    });
    const p = this.projectiles.map((q) => (q.k === 'lob'
      ? [q.id, 3, r2(q.x), r2(q.y), r2(Math.atan2(q.ty - q.y0, q.tx - q.x0)), q.team, r2(q.h)]
      : [q.id, PROJ_KIND[q.k], r2(q.x), r2(q.y), r2(Math.atan2(q.vy, q.vx)), q.team]));
    return { t: r2(this.t), v, p, b: this.beams.map((b) => b.slice()), z: r2(this.zone.r) };
  }
}
