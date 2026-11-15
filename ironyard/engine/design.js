// Blueprint validation and derived vehicle stats for the two-layer brick kit.
import { PARTS, CELL, GRID_HX, GRID_HY, GRID_W, GRID_L, DIRS, DEFAULT_BUDGET, DECOR_LIMIT, PAINTS, LAYER_NAME, cellsOf, dimsOf } from './parts.js';

export const PHYS = {
  dragLin: 0.6,        // forward linear drag (1/s)
  dragQuad: 0.08,      // forward quadratic drag (1/m)
  hoverDragLin: 0.35,
  angDragLin: 4.5,
  angDragQuad: 1.0,
  gripBase: 5,         // lateral velocity decay (1/s) at grip 1
  minInertia: 4,
  reverseFactor: 0.7,
};

export const cellIndex = (x, y) => (y + GRID_HY) * GRID_W + (x + GRID_HX);
export const inGrid = (x, y) => x >= -GRID_HX && x <= GRID_HX && y >= -GRID_HY && y <= GRID_HY;
const where = (p) => `(${p.x}, ${p.y}) on ${LAYER_NAME[p.z]}`;

/** Centre of a placed part, in studs. */
export function centerOf(p) {
  const [w, l] = dimsOf(p.type, p.dir);
  return [p.x + (w - 1) / 2, p.y + (l - 1) / 2];
}

/**
 * Aggregate physical properties from a list of (alive) parts {type, x, y, dir}.
 * Returned coordinates are metres in the vehicle frame (u = forward, v = left)
 * measured from the blueprint origin stud (0, 0).
 */
export function aggregate(parts) {
  let mass = 0, mu = 0, mv = 0;
  for (const p of parts) {
    const d = PARTS[p.type], [cx, cy] = centerOf(p);
    mass += d.mass; mu += d.mass * cy * CELL; mv += d.mass * -cx * CELL;
  }
  const comU = mass ? mu / mass : 0, comV = mass ? mv / mass : 0;
  let inertia = 0, radius = 0;
  const a = {
    mass, comU, comV, inertia: 0, radius: 0,
    energyCap: 0, energyRegen: 0, sensor: 0, seesMines: false,
    shield: 0, shieldRegen: 0, shieldDelay: 3, shieldUse: 0,
    lift: 0, gyro: 0, driveForce: 0, hoverForce: 0, groundMovers: 0, hoverMovers: 0,
    driveBoost: 1, gripBoost: 1, maxHp: 0,
  };
  for (const p of parts) {
    const d = PARTS[p.type], [cx, cy] = centerOf(p), [w, l] = dimsOf(p.type, p.dir);
    const du = cy * CELL - comU, dv = -cx * CELL - comV;
    inertia += d.mass * (du * du + dv * dv + ((w * w + l * l) * CELL * CELL) / 12);
    if (!d.decor) {
      for (const [x, y] of cellsOf(p)) radius = Math.max(radius, Math.hypot(y * CELL - comU, -x * CELL - comV) + CELL * 0.71);
      a.maxHp += d.hp;
    }
    a.energyCap += d.energyCap || 0;
    a.energyRegen += d.energyRegen || 0;
    a.sensor += d.sensor || 0;
    if (d.seesMines) a.seesMines = true;
    if (d.shield) { a.shield += d.shield; a.shieldRegen += d.shieldRegen; a.shieldDelay = d.shieldDelay; a.shieldUse += d.energyUse; }
    a.lift += d.lift || 0;
    a.gyro += d.gyro || 0;
    a.driveBoost += d.driveBoost || 0;
    a.gripBoost += d.gripBoost || 0;
    if (d.mover === 'hover') { a.hoverForce += d.force; a.hoverMovers++; }
    else if (d.mover) { a.driveForce += d.force; a.groundMovers++; }
  }
  a.inertia = Math.max(PHYS.minInertia, inertia);
  a.radius = radius;
  return a;
}

function topSpeed(force, mass, lin) {
  if (force <= 0 || mass <= 0) return 0;
  const acc = force / mass, q = PHYS.dragQuad;
  return (-lin + Math.sqrt(lin * lin + 4 * q * acc)) / (2 * q);
}

export function weightClass(mass) {
  return mass < 130 ? 'featherweight' : mass < 190 ? 'light' : mass < 260 ? 'medium' : mass < 340 ? 'heavy' : 'super-heavy';
}

/**
 * Validate a blueprint. Returns { ok, errors, warnings, design, stats }.
 * `design` is the normalised blueprint ({ name, paint, parts: [{ type, x, y, z, dir }] }).
 */
export function validateDesign(input, opts = {}) {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const errors = [], warnings = [];
  const out = { ok: false, errors, warnings, design: null, stats: null, budget };
  if (!input || typeof input !== 'object' || !Array.isArray(input.parts)) {
    errors.push('design must be an object like { name, parts: [{ type, x, y, z, dir? }, ...] }');
    return out;
  }
  if (input.parts.length === 0) { errors.push('design.parts is empty'); return out; }
  if (input.parts.length > 160) { errors.push(`too many parts (${input.parts.length} > 160)`); return out; }

  const parts = [];
  const occ = [new Map(), new Map()]; // per layer: cell index -> part
  const counts = {};
  input.parts.forEach((raw, i) => {
    const at = `parts[${i}]`;
    if (!raw || typeof raw !== 'object') { errors.push(`${at} is not an object`); return; }
    const def = PARTS[raw.type];
    if (!def) { errors.push(`${at}: unknown part type "${raw.type}". Valid: ${Object.keys(PARTS).join(', ')}`); return; }
    let z = raw.z;
    if (z === 'chassis') z = 0; else if (z === 'deck') z = 1;
    if (z === undefined || z === null) z = def.layer === 'deck' ? 1 : 0;
    if (z !== 0 && z !== 1) { errors.push(`${at} (${raw.type}): z must be 0 / "chassis" or 1 / "deck", got ${JSON.stringify(raw.z)}`); return; }
    if (def.layer !== 'any' && def.layer !== LAYER_NAME[z]) { errors.push(`${at}: ${raw.type} can only go on the ${def.layer} layer (z = ${def.layer === 'deck' ? 1 : 0})`); return; }
    let dir = raw.dir ?? 'N';
    if (def.fixedDir) dir = 'N';
    if (!DIRS[dir]) { errors.push(`${at} (${raw.type}): dir must be one of N, E, S, W (N = front), got "${raw.dir}"`); return; }
    const p = { type: raw.type, x: raw.x, y: raw.y, z, dir };
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) { errors.push(`${at} (${raw.type}): x and y must be integers, got (${raw.x}, ${raw.y})`); return; }
    const cells = cellsOf(p);
    if (!cells.every(([x, y]) => inGrid(x, y))) {
      const [w, l] = dimsOf(p.type, p.dir);
      errors.push(`${at}: ${raw.type} at ${where(p)} is ${w}x${l} studs and sticks out of the grid (x -${GRID_HX}..${GRID_HX}, y -${GRID_HY}..${GRID_HY}; x, y is its lowest corner)`); return;
    }
    for (const [x, y] of cells) {
      const hit = occ[z].get(cellIndex(x, y));
      if (hit) { errors.push(`${at}: ${raw.type} at ${where(p)} overlaps ${hit.type} at ${where(hit)} on stud (${x}, ${y})`); return; }
    }
    for (const [x, y] of cells) occ[z].set(cellIndex(x, y), p);
    parts.push(p);
    counts[raw.type] = (counts[raw.type] || 0) + 1;
  });
  if (errors.length) return out;

  // counts
  for (const [id, def] of Object.entries(PARTS)) {
    const n = counts[id] || 0;
    if (def.min && n < def.min) errors.push(`needs at least ${def.min} ${id} (found ${n})`);
    if (def.max && n > def.max) errors.push(`at most ${def.max} ${id} allowed (found ${n})`);
  }
  const decorN = parts.filter((p) => PARTS[p.type].decor).length;
  if (decorN > DECOR_LIMIT) errors.push(`at most ${DECOR_LIMIT} decor pieces allowed (found ${decorN})`);

  const solid = (p) => p && !PARTS[p.type].decor;
  // support: every deck piece needs at least one stud on a chassis piece
  for (const p of parts) {
    if (p.z !== 1) continue;
    if (!cellsOf(p).some(([x, y]) => solid(occ[0].get(cellIndex(x, y))))) {
      errors.push(`${p.type} at ${where(p)} has nothing under it: a deck piece needs at least one stud on top of a chassis piece`);
    }
  }
  // connectivity: flood fill from the core through side-by-side and stacked pieces
  const core = parts.find((p) => p.type === 'core');
  if (core) {
    const seen = new Set([core]);
    const stack = [core];
    while (stack.length) {
      const p = stack.pop();
      for (const [x, y] of cellsOf(p)) {
        const near = [occ[1 - p.z].get(cellIndex(x, y))];
        for (const [dx, dy] of Object.values(DIRS)) if (inGrid(x + dx, y + dy)) near.push(occ[p.z].get(cellIndex(x + dx, y + dy)));
        for (const q of near) if (solid(q) && !seen.has(q)) { seen.add(q); stack.push(q); }
      }
    }
    for (const p of parts) {
      if (solid(p) && !seen.has(p)) errors.push(`${p.type} at ${where(p)} is not connected to the core (pieces connect edge-to-edge on a layer, or by stacking)`);
    }
  }

  // firing / exhaust lanes
  for (const p of parts) {
    const def = PARTS[p.type];
    if (!def.lane) continue;
    let [dx, dy] = DIRS[p.dir];
    if (def.lane === 'back') { dx = -dx; dy = -dy; }
    const cells = cellsOf(p);
    const lead = Math.max(...cells.map(([x, y]) => x * dx + y * dy));
    let blocked = null;
    for (const [cx, cy] of cells) {
      if (cx * dx + cy * dy !== lead) continue;
      for (let x = cx + dx, y = cy + dy; inGrid(x, y) && !blocked; x += dx, y += dy) {
        const b = occ[p.z].get(cellIndex(x, y));
        if (b && b !== p && solid(b) && !(p.z === 1 && PARTS[b.type].low)) blocked = b;
      }
    }
    if (blocked) {
      errors.push(def.lane === 'back'
        ? `${p.type} at ${where(p)} pushing ${p.dir} has its exhaust blocked by ${blocked.type} at ${where(blocked)}; the studs behind a thruster must be empty (low deck pieces are fine)`
        : `${p.type} at ${where(p)} facing ${p.dir} is blocked by ${blocked.type} at ${where(blocked)}; every stud in front of it on the ${LAYER_NAME[p.z]} layer must be empty${p.z === 1 ? ' or a low piece (plate, slope, tile…)' : ''}`);
    }
  }

  // budget
  const cost = parts.reduce((s, p) => s + PARTS[p.type].cost, 0);
  if (cost > budget) errors.push(`cost ${cost} exceeds budget ${budget} by ${cost - budget}`);

  const stats = computeStats(parts);
  stats.cost = cost;
  stats.budget = budget;
  stats.budgetLeft = budget - cost;
  out.stats = stats;

  // warnings — legal but probably not what you want
  if (stats.groundMovers + stats.hoverMovers === 0 && stats.thrusters === 0) warnings.push('no wheels, tracks, hover pads or thrusters: this vehicle cannot move');
  if (stats.hoverMovers > 0 && !stats.hovers && stats.groundMovers === 0) warnings.push(`hover lift ${stats.lift} kg < mass ${stats.mass} kg: it will not float and hover pads alone barely push it`);
  if (stats.dps === 0 && stats.ramParts === 0 && stats.kegs === 0) warnings.push('no weapons, saws, spikes, pistons or kegs: this vehicle can only win by pushing or by timeout');
  if (stats.energyDrain > stats.energyRegen * 3 && stats.energyDrain > 0) warnings.push(`peak energy drain ${stats.energyDrain.toFixed(1)}/s is far above regen ${stats.energyRegen}/s; sustained fire will stall`);
  if (stats.groundMovers > 0 && Math.abs(stats.wheelBias) > 0.25) warnings.push('drive force is lopsided left/right: the vehicle will pull to one side');
  if (stats.turnRate < 0.8 && stats.groundMovers + stats.hoverMovers > 0) warnings.push(`slow turn rate (~${stats.turnRate.toFixed(2)} rad/s): widen the wheelbase or add a gyro`);

  const accent = input.paint && PAINTS[input.paint.accent] ? input.paint.accent : 'white';
  out.design = { name: String(input.name || 'Unnamed').slice(0, 40), paint: { accent }, parts };
  out.ok = errors.length === 0;
  return out;
}

export function computeStats(parts) {
  const a = aggregate(parts);
  let dps = 0, maxRange = 0, energyDrain = 0, thrusters = 0, ramParts = 0, thrust = 0, studs = [0, 0], decor = 0, kegs = 0, fireproof = 0, solidN = 0;
  let leftF = 0, rightF = 0, steerTorque = 0, x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  const weapons = {};
  const hovers = a.lift >= a.mass && a.hoverMovers > 0;
  for (const p of parts) {
    const d = PARTS[p.type];
    if (d.decor) { decor++; continue; }
    const cells = cellsOf(p);
    studs[p.z] += cells.length;
    for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (d.weapon) {
      const w = d.dps ?? (d.dmg * (d.salvo || 1)) / d.cooldown;
      dps += w;
      maxRange = Math.max(maxRange, d.range ?? d.reach ?? 0);
      energyDrain += d.energyUse ?? (d.energyShot / d.cooldown);
      weapons[p.type] = (weapons[p.type] || 0) + 1;
    }
    if (d.ramOut > 1 || d.punch) ramParts++;
    if (d.blast) kegs++;
    solidN++; if (!d.burn) fireproof++;
    if (d.thrust) { thrusters++; thrust += d.thrust; energyDrain += d.energyUse; }
    if (d.mover === 'hover') energyDrain += d.energyUse;
    if (d.shield) energyDrain += d.energyUse;
    if (d.heal) energyDrain += d.energyUse;
    if (d.mover && (hovers ? d.mover === 'hover' : d.mover !== 'hover')) {
      const lat = -centerOf(p)[0] * CELL - a.comV; // + = left of centre of mass
      if (lat > 0.05) leftF += d.force; else if (lat < -0.05) rightF += d.force;
      steerTorque += Math.abs(lat) * d.force * a.driveBoost;
    }
  }
  const force = (hovers ? a.hoverForce : a.driveForce + a.hoverForce * 0.5) * a.driveBoost;
  const lin = hovers ? PHYS.hoverDragLin : PHYS.dragLin;
  const alpha = (steerTorque + a.gyro) / a.inertia;
  const turnRate = (-PHYS.angDragLin + Math.sqrt(PHYS.angDragLin ** 2 + 4 * PHYS.angDragQuad * alpha)) / (2 * PHYS.angDragQuad);
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    parts: parts.length, decor,
    studs: { chassis: studs[0], deck: studs[1] },
    footprint: x1 >= x0 ? `${x1 - x0 + 1}x${y1 - y0 + 1} studs (${r2((x1 - x0 + 1) * CELL)} x ${r2((y1 - y0 + 1) * CELL)} m)` : 'empty',
    mass: Math.round(a.mass),
    weightClass: weightClass(a.mass),
    hp: a.maxHp,
    coreHp: PARTS.core.hp,
    energyCap: a.energyCap,
    energyRegen: a.energyRegen,
    energyDrain: Math.round(energyDrain * 10) / 10,
    sensor: a.sensor,
    shield: a.shield,
    lift: a.lift,
    hovers,
    groundMovers: a.groundMovers,
    hoverMovers: a.hoverMovers,
    thrusters,
    ramParts,
    kegs,
    fireproof: solidN ? Math.round((fireproof / solidN) * 100) / 100 : 0,   // share of pieces that cannot burn
    driveForce: Math.round(force),
    accel: r2(force / a.mass),
    topSpeed: r2(topSpeed(force, a.mass, lin)),
    boostSpeed: thrust ? r2(topSpeed(force + thrust, a.mass, lin)) : undefined,
    turnRate: r2(turnRate),
    sideGrip: r2(a.gripBoost),
    wheelBias: leftF + rightF ? (leftF - rightF) / (leftF + rightF) : 0,
    dps: Math.round(dps * 10) / 10,
    maxRange,
    weapons,
    radius: r2(a.radius),
  };
}

const GLYPH = Object.fromEntries(Object.values(PARTS).map((d) => [d.glyph, d]));
const ARROW = { '^': 'N', '>': 'E', v: 'S', '<': 'W' };
const ARROW_OF = { N: '^', E: '>', S: 'v', W: '<' };

/** ASCII pictures of a blueprint, deck above chassis (front of the vehicle is up). */
export function renderDesign(design) {
  const out = [];
  for (const z of [1, 0]) {
    const occ = new Map();
    for (const p of design.parts) if (p.z === z) for (const [x, y] of cellsOf(p)) occ.set(cellIndex(x, y), p);
    out.push(`${LAYER_NAME[z].toUpperCase()} (z=${z})        front (y+) is up`);
    for (let y = GRID_HY; y >= -GRID_HY; y--) {
      let line = `${String(y).padStart(2)} |`;
      for (let x = -GRID_HX; x <= GRID_HX; x++) {
        const p = occ.get(cellIndex(x, y));
        if (!p) { line += ' . '; continue; }
        if (p.x !== x || p.y !== y) { line += ' : '; continue; }
        const d = PARTS[p.type];
        const [w, l] = d.size;
        line += ' ' + d.glyph + (d.directional || (w !== l && p.dir !== 'N') ? ARROW_OF[p.dir] : ' ');
      }
      out.push(line);
    }
    out.push('    ' + '-'.repeat(GRID_W * 3));
    out.push('    ' + Array.from({ length: GRID_W }, (_, i) => String(i - GRID_HX).padStart(2) + ' ').join('') + ' x (+ = right)');
  }
  const used = [...new Set(design.parts.map((p) => p.type))];
  out.push('legend: ' + used.map((t) => `${PARTS[t].glyph}=${t}`).join(' ') + '   ":" = rest of a multi-stud piece (its glyph marks the low-x, low-y stud)');
  return out.join('\n');
}

/**
 * Build a blueprint from ASCII art — the same pictures renderDesign() prints.
 *   parseBlueprint('Name', { deck: [...11 rows], chassis: [...11 rows] }, { paint: { accent: 'yellow' } })
 * Each row has 9 whitespace-separated tokens, first row = FRONT. '.' empty,
 * ':' = stud covered by a multi-stud piece, otherwise a part glyph plus an
 * optional arrow (^ > v <) giving its direction. A multi-stud piece is written
 * at its lowest-x, lowest-y stud (bottom-left of its rectangle in the picture).
 */
export function parseBlueprint(name, layers, opts = {}) {
  if (!layers || typeof layers !== 'object' || !Array.isArray(layers.chassis)) throw new Error('blueprint needs { chassis: [rows], deck: [rows] }');
  const parts = [];
  for (const z of [0, 1]) {
    const rows = layers[LAYER_NAME[z]];
    if (!rows) continue;
    if (rows.length !== GRID_L) throw new Error(`${LAYER_NAME[z]} picture needs exactly ${GRID_L} rows (got ${rows.length})`);
    const cont = new Set(), covered = new Set();
    rows.forEach((row, r) => {
      const toks = String(row).trim().split(/\s+/);
      if (toks.length !== GRID_W) throw new Error(`${LAYER_NAME[z]} row ${r} needs ${GRID_W} tokens, got ${toks.length}: "${row}"`);
      toks.forEach((tok, c) => {
        const x = c - GRID_HX, y = GRID_HY - r;
        if (tok === '.' || tok === '..') return;
        if (tok === ':' || tok === '::') { cont.add(cellIndex(x, y)); return; }
        const def = GLYPH[tok[0]];
        if (!def) throw new Error(`${LAYER_NAME[z]} row ${r}: unknown glyph "${tok}". Glyphs: ${Object.values(PARTS).map((d) => `${d.glyph}=${d.id}`).join(' ')}`);
        if (tok[1] && !ARROW[tok[1]]) throw new Error(`${LAYER_NAME[z]} row ${r}: bad direction in "${tok}" (use ^ > v <)`);
        const p = { type: def.id, x, y, z, dir: ARROW[tok[1]] || 'N' };
        parts.push(p);
        for (const [cx, cy] of cellsOf(p)) if (cx !== x || cy !== y) covered.add(cellIndex(cx, cy) + ':' + def.id + '@' + x + ',' + y);
      });
    });
    const need = new Set([...covered].map((k) => Number(k.split(':')[0])));
    for (const k of covered) {
      const idx = Number(k.split(':')[0]);
      if (!cont.has(idx)) {
        const x = (idx % GRID_W) - GRID_HX, y = Math.floor(idx / GRID_W) - GRID_HY;
        throw new Error(`${LAYER_NAME[z]}: stud (${x}, ${y}) is covered by ${k.split(':')[1]} and must be written ":" in the picture (rows are drawn front first, so a multi-stud piece's own glyph goes on its left stud in the LOWEST of its rows in the picture, and ":" on every other stud it covers)`);
      }
    }
    for (const idx of cont) {
      if (!need.has(idx)) {
        const x = (idx % GRID_W) - GRID_HX, y = Math.floor(idx / GRID_W) - GRID_HY;
        throw new Error(`${LAYER_NAME[z]}: ":" at stud (${x}, ${y}) is not covered by any multi-stud piece (the glyph goes on the piece's lowest-x, lowest-y stud; use > to lay it across)`);
      }
    }
  }
  return { name, paint: opts.paint, parts };
}

/** A cheap legal fallback chassis used when a bot's design is invalid in non-strict mode. */
export const STOCK_DESIGN = {
  name: 'Stock',
  parts: [
    { type: 'plate', x: 0, y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 }, { type: 'plate', x: 0, y: -1, z: 0 },
    { type: 'plate', x: -1, y: 1, z: 0 }, { type: 'plate', x: 1, y: 1, z: 0 }, { type: 'plate', x: -1, y: -1, z: 0 }, { type: 'plate', x: 1, y: -1, z: 0 },
    { type: 'wheel', x: -2, y: 1, z: 0 }, { type: 'wheel', x: 2, y: 1, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 },
    { type: 'core', x: 0, y: 0, z: 1 }, { type: 'mg', x: 0, y: 1, z: 1, dir: 'N' },
  ],
};
