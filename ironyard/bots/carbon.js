// Anthracite — adaptive Ironyard combat vehicle and tactical controller.
const meta = { name: 'Anthracite', author: 'Carbon', model: 'gemini-4-carbon-medium', notes: 'Terrain-adaptive armored gunship with buried core and reactors, spiked saw-prow, per-weapon fire control, and focus-fire coordination.' };

function P(type, x, y, z, dir) {
  return dir ? { type, x, y, z, dir } : { type, x, y, z };
}

function analyzeMap(map) {
  const rows = (map && map.rows) || [];
  let pits = 0, ice = 0, mud = 0, lava = 0, barrels = 0, crates = 0, total = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      total++;
      if (ch === '_') pits++;
      else if (ch === 'i') ice++;
      else if (ch === 'm') mud++;
      else if (ch === 'L') lava++;
      else if (ch === '!') barrels++;
      else if (ch === 'x') crates++;
    }
  }
  const openBorder = rows.length > 0 && rows[0][0] === '_';
  const pitFrac = total ? pits / total : 0;
  return {
    openBorder,
    pitFrac,
    iceFrac: total ? ice / total : 0,
    mudFrac: total ? mud / total : 0,
    lavaFrac: total ? lava / total : 0,
    hasBreakables: (barrels + crates) > 0,
    useHover: openBorder || pitFrac > 0.14,
  };
}

// ── Adaptive Vehicle Blueprints (800 / 1200 / 1800 x Ground / Hover) ───────

function build800Hover() {
  return {
    name: 'Anthracite-L-Air',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): buried core + enclosed reactor + 5 hover pads (375 kg lift vs ~147 kg mass)
      P('core', 0, 0, 0),
      P('hover', -2, 1, 0), P('hover', 2, 1, 0),
      P('hover', -2, -1, 0), P('hover', 2, -1, 0),
      P('hover', 0, -2, 0),
      P('reactor', 0, -1, 0),
      P('gyro', 0, 1, 0),
      P('plate2', -1, -1, 0, 'N'), P('plate2', 1, -1, 0, 'N'),
      P('plate', -1, 1, 0), P('plate', 1, 1, 0),
      // Deck (z=1): spoiler (+60% side grip) + core armor + 2 cannons + MG + full roofs (cost 796)
      P('spoiler', -1, -2, 1, 'N'),
      P('plate', 0, -1, 1),
      P('armor', 0, 0, 1),
      P('cannon', -1, -1, 1, 'N'), P('cannon', 1, -1, 1, 'N'),
      P('mg', 0, 1, 1, 'N'),
      P('plate2', -2, 1, 1, 'E'), P('plate2', 1, 1, 1, 'E'),
      P('plate', -2, -1, 1), P('plate', 2, -1, 1),
    ],
  };
}

function build800Ground() {
  return {
    name: 'Anthracite-L-Tank',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): buried core + enclosed gyro & reactor + 2 fireproof tracks
      P('core', 0, 0, 0),
      P('track', -2, -1, 0), P('track', 2, -1, 0),
      P('gyro', -1, 0, 0), P('reactor', 1, 0, 0),
      P('plate', -1, -1, 0), P('brick', 0, -1, 0), P('plate', 1, -1, 0),
      P('plate', -1, 1, 0), P('plate', 0, 1, 0), P('plate', 1, 1, 0),
      P('plate', -1, 2, 0), P('plate', 0, 2, 0), P('plate', 1, 2, 0),
      // Deck (z=1): core armor + center slope + 2 cannons + MG (cost 797)
      P('armor', 0, 0, 1),
      P('cannon', -1, 0, 1, 'N'), P('cannon', 1, 0, 1, 'N'),
      P('mg', 0, 1, 1, 'N'),
      P('plate', -1, 2, 1), P('slope', 0, 2, 1, 'N'), P('plate', 1, 2, 1),
      P('plate', -2, 1, 1), P('plate', 2, 1, 1),
    ],
  };
}

function build1200Hover() {
  return {
    name: 'Anthracite-S-Air',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): buried core + enclosed reactors/battery/gyro + 6 hover pads (450 kg lift vs ~206 kg mass)
      P('core', 0, 0, 0),
      P('hover', -2, 1, 0), P('hover', 2, 1, 0),
      P('hover', -2, 0, 0), P('hover', 2, 0, 0),
      P('hover', -2, -1, 0), P('hover', 2, -1, 0),
      P('reactor', -1, 0, 0), P('reactor', 1, 0, 0),
      P('battery', 0, -1, 0),
      P('gyro', 0, 1, 0),
      P('plate2', -1, -2, 0, 'N'), P('plate2', 1, -2, 0, 'N'),
      P('plate', 0, -2, 0),
      P('plate', -1, 1, 0), P('plate', 1, 1, 0),
      P('brick', 0, 2, 0),
      // Deck (z=1): spoiler + shieldgen + core armor + front slope + 2 cannons + 2 MGs + pad roofs (cost 1199)
      P('spoiler', -1, -2, 1, 'N'),
      P('shieldgen', 0, -1, 1),
      P('armor', 0, 0, 1),
      P('cannon', -1, -1, 1, 'N'), P('cannon', 1, -1, 1, 'N'),
      P('mg', -2, 0, 1, 'N'), P('mg', 2, 0, 1, 'N'),
      P('slope', 0, 1, 1, 'N'),
      P('plate', -1, 1, 1), P('plate', 1, 1, 1),
      P('plate', -2, 1, 1), P('plate', 2, 1, 1),
      P('plate', -2, -1, 1), P('plate', 2, -1, 1),
    ],
  };
}

function build1200Ground(supportSlot) {
  if (supportSlot) {
    // 3v3 slot-2 combat medic cruiser: enclosed reactors + repairer + shieldgen + cannon + 3 MGs (cost 1190)
    return {
      name: 'Anthracite-S-Ward',
      paint: { accent: 'azure' },
      parts: [
        P('core', 0, 0, 0),
        P('track', -2, -1, 0), P('track', 2, -1, 0),
        P('reactor', -1, 0, 0), P('reactor', 1, 0, 0),
        P('gyro', 0, -1, 0),
        P('battery', 0, 1, 0),
        P('plate', -1, -1, 0), P('plate', 1, -1, 0),
        P('plate', -1, 1, 0), P('plate', 1, 1, 0),
        P('plate', -1, 2, 0), P('plate', 0, 2, 0), P('plate', 1, 2, 0),
        P('shieldgen', 0, -1, 1),
        P('repairer', -1, -1, 1),
        P('armor', 0, 0, 1),
        P('cannon', 1, -1, 1, 'N'),
        P('mg', -1, 0, 1, 'N'),
        P('mg', -2, 0, 1, 'N'), P('mg', 2, 0, 1, 'N'),
        P('slope', -1, 1, 1, 'N'), P('slope', 0, 1, 1, 'N'), P('slope', 1, 1, 1, 'N'),
        P('plate', -2, 1, 1), P('plate', 2, 1, 1),
      ],
    };
  }
  return {
    name: 'Anthracite-S-Tank',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): buried core + 2 fireproof tracks + 2 enclosed reactors + enclosed gyro + saw + 2 spikes
      P('core', 0, 0, 0),
      P('track', -2, -1, 0), P('track', 2, -1, 0),
      P('reactor', -1, 0, 0), P('reactor', 1, 0, 0),
      P('gyro', 0, -1, 0),
      P('plate', -1, -1, 0), P('plate', 1, -1, 0),
      P('plate', -1, 1, 0), P('plate', 0, 1, 0), P('plate', 1, 1, 0),
      P('spike', -1, 2, 0, 'N'), P('saw', 0, 2, 0, 'N'), P('spike', 1, 2, 0, 'N'),
      // Deck (z=1): shieldgen + core armor + 2 cannons (roofing reactors) + 2 MGs + 3 slopes (cost 1197)
      P('shieldgen', 0, -1, 1),
      P('armor', 0, 0, 1),
      P('cannon', -1, -1, 1, 'N'), P('cannon', 1, -1, 1, 'N'),
      P('mg', -2, 0, 1, 'N'), P('mg', 2, 0, 1, 'N'),
      P('slope', -1, 1, 1, 'N'), P('slope', 0, 1, 1, 'N'), P('slope', 1, 1, 1, 'N'),
    ],
  };
}

function build1800Hover() {
  return {
    name: 'Anthracite-H-Air',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): compact 5-wide hull + 8 hover pads (600 kg lift vs ~266 kg mass) + 3 buried reactors
      P('core', 0, 0, 0),
      P('hover', -2, -1, 0), P('hover', 2, -1, 0),
      P('hover', -2, 0, 0), P('hover', 2, 0, 0),
      P('hover', -2, 1, 0), P('hover', 2, 1, 0),
      P('hover', -2, 2, 0), P('hover', 2, 2, 0),
      P('reactor', -1, 0, 0), P('reactor', 1, 0, 0), P('reactor', 0, -1, 0),
      P('battery', 0, -2, 0),
      P('gyro', 0, 1, 0),
      P('plate2', -1, -2, 0, 'N'), P('plate2', 1, -2, 0, 'N'),
      P('brick', 0, -3, 0),
      P('plate2', -1, 1, 0, 'N'), P('plate2', 1, 1, 0, 'N'),
      P('brick', 0, 2, 0),
      // Deck (z=1): 3 cannons + 2 lasers + shieldgen + 2 repairers + spoiler + radar + full pad roofs (cost 1797)
      P('radar', 0, -3, 1),
      P('spoiler', -1, -2, 1, 'N'),
      P('shieldgen', 0, -1, 1),
      P('repairer', -1, -1, 1), P('repairer', 1, -1, 1),
      P('armor', 0, 0, 1),
      P('cannon', -1, 0, 1, 'N'), P('cannon', 0, 1, 1, 'N'), P('cannon', 1, 0, 1, 'N'),
      P('laser', -2, 0, 1, 'N'), P('laser', 2, 0, 1, 'N'),
      P('plate', -1, 2, 1), P('plate', 1, 2, 1),
      P('plate', -2, 1, 1), P('plate', 2, 1, 1),
      P('plate', -2, 2, 1), P('plate', 2, 2, 1),
      P('plate', -2, -1, 1), P('plate', 2, -1, 1),
    ],
  };
}

function build1800Ground() {
  return {
    name: 'Anthracite-H-Tank',
    paint: { accent: 'azure' },
    parts: [
      // Chassis (z=0): 5-wide supercharged tank + 2 tracks + 3 buried reactors + 2 batteries + saw + 2 spikes
      P('core', 0, 0, 0),
      P('track', -2, -1, 0), P('track', 2, -1, 0),
      P('reactor', -1, 0, 0), P('reactor', 1, 0, 0), P('reactor', 0, -1, 0),
      P('battery', -1, -1, 0), P('battery', 1, -1, 0),
      P('gyro', 0, -2, 0),
      P('brick', -1, -2, 0), P('plate', 0, -3, 0), P('brick', 1, -2, 0),
      P('plate', -1, -3, 0), P('plate', 1, -3, 0),
      P('brick', -1, 1, 0), P('brick', 0, 1, 0), P('brick', 1, 1, 0),
      P('spike', -1, 2, 0, 'N'), P('saw', 0, 2, 0, 'N'), P('spike', 1, 2, 0, 'N'),
      // Deck (z=1): blower (+14% drive) + radar + shieldgen + 2 repairers + 2 cannons + laser + 2 MGs + 3 slopes (cost 1799)
      P('blower', 0, -3, 1),
      P('radar', 0, -2, 1),
      P('shieldgen', 0, -1, 1),
      P('repairer', -1, -1, 1), P('repairer', 1, -1, 1),
      P('armor', 0, 0, 1),
      P('cannon', -1, 0, 1, 'N'), P('cannon', 1, 0, 1, 'N'),
      P('laser', 0, 1, 1, 'N'),
      P('mg', -2, 0, 1, 'N'), P('mg', 2, 0, 1, 'N'),
      P('slope', -2, 1, 1, 'N'), P('slope', 0, 2, 1, 'N'), P('slope', 2, 1, 1, 'N'),
      P('plate', -1, 2, 1), P('plate', 1, 2, 1),
      P('plate', -2, -1, 1), P('plate', 2, -1, 1),
    ],
  };
}

function design(ctx, api) {
  const m = analyzeMap(ctx.map || (api && api.map));
  const b = ctx.budget || 1200;
  if (b < 1100) return m.useHover ? build800Hover() : build800Ground();
  if (b >= 1600) return m.useHover ? build1800Hover() : build1800Ground();
  if (m.useHover) return build1200Hover();
  const isSupport = ctx.teamSize >= 3 && ctx.slot === 2;
  return build1200Ground(isSupport);
}

// ── In-Realm Zero-Overhead Tile Grid (keeps CPU ~0.3 ms/tick) ──────────────
const T_FLOOR = 0, T_WALL = 1, T_BARR = 2, T_PIT = 3, T_MUD = 4, T_ICE = 5, T_LAVA = 6, T_CRATE = 7, T_BARREL = 8;
const RING8_X = [1, -1, 0, 0, 0.707, -0.707, 0.707, -0.707];
const RING8_Y = [0, 0, 1, -1, 0.707, 0.707, -0.707, -0.707];

function createFastGrid(map, nav) {
  const w = map.w, h = map.h, TILE = map.tile || 2;
  const grid = new Uint8Array(w * h);
  const checkTick = new Int32Array(w * h).fill(-99);
  let hasBreakables = false;
  for (let r = 0; r < h; r++) {
    const ty = h - 1 - r;
    const row = map.rows[r];
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx];
      let c = T_FLOOR;
      if (ch === '#') c = T_WALL;
      else if (ch === '-') c = T_BARR;
      else if (ch === '_') c = T_PIT;
      else if (ch === 'm') c = T_MUD;
      else if (ch === 'i') c = T_ICE;
      else if (ch === 'L') c = T_LAVA;
      else if (ch === 'x') { c = T_CRATE; hasBreakables = true; }
      else if (ch === '!') { c = T_BARREL; hasBreakables = true; }
      grid[ty * w + tx] = c;
    }
  }

  function isSolid(c) {
    return c === T_WALL || c === T_BARR || c === T_CRATE || c === T_BARREL;
  }

  let curTick = 0;
  function codeCell(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return T_PIT;
    const idx = ty * w + tx;
    let c = grid[idx];
    if (hasBreakables && (c === T_CRATE || c === T_BARREL) && curTick - checkTick[idx] >= 15) {
      checkTick[idx] = curTick;
      if (nav.tileAtCell(tx, ty) === 'floor') {
        grid[idx] = T_FLOOR;
        c = T_FLOOR;
      }
    }
    return c;
  }

  function codeAt(x, y) {
    return codeCell(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  function isOpen(x, y, hov) {
    const c = codeAt(x, y);
    return !isSolid(c) && (hov || c !== T_PIT);
  }

  function clearOfSolid(x, y, rad) {
    if (isSolid(codeAt(x, y))) return false;
    for (let k = 0; k < 8; k++) {
      if (isSolid(codeAt(x + RING8_X[k] * rad, y + RING8_Y[k] * rad))) return false;
    }
    return true;
  }

  function clearOfPit(x, y, rad) {
    if (codeAt(x, y) === T_PIT) return false;
    for (let k = 0; k < 8; k++) {
      if (codeAt(x + RING8_X[k] * rad, y + RING8_Y[k] * rad) === T_PIT) return false;
    }
    return true;
  }

  function los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(d * 1.8));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const c = codeAt(x0 + dx * t, y0 + dy * t);
      if (c === T_WALL || c === T_CRATE || c === T_BARREL) return false;
    }
    return true;
  }

  return {
    setTick(t) { curTick = t; },
    codeCell,
    codeAt,
    isOpen,
    clearOfSolid,
    clearOfPit,
    los,
    width: map.width,
    height: map.height,
  };
}

// ── Controller State ───────────────────────────────────────────────────────
let follower = null;
let fg = null;
let mapInfo = null;
let orbitSign = 1;
let lastFlipTick = -999;
let prevVel = new Map();

function init(info, api) {
  mapInfo = analyzeMap(api.map);
  fg = createFastGrid(api.map, api.nav);
  follower = null;
  orbitSign = (info.slot % 2 === 0) ? 1 : -1;
  lastFlipTick = -999;
  prevVel = new Map();
}

function classifyEnemy(e) {
  let meleeThreat = false, hasPiston = false, hasHarpoon = false, hasKeg = false, longRange = false, hasMortar = false, hasRepair = false;
  let kegPart = null, harpoonPart = null, corePart = null;
  const parts = e.parts || [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.alive) continue;
    const t = p.type;
    if (t === 'core') corePart = p;
    else if (t === 'piston') { meleeThreat = true; hasPiston = true; }
    else if (t === 'saw' || t === 'flamer') meleeThreat = true;
    else if (t === 'harpoon') { hasHarpoon = true; harpoonPart = p; }
    else if (t === 'keg') { hasKeg = true; if (!kegPart) kegPart = p; }
    else if (t === 'mortar') { longRange = true; hasMortar = true; }
    else if (t === 'railgun' || t === 'missile') longRange = true;
    else if (t === 'repairer') hasRepair = true;
  }
  return { meleeThreat, hasPiston, hasHarpoon, hasKeg, longRange, hasMortar, hasRepair, kegPart, harpoonPart, corePart };
}

function leadFrom(gx, gy, tx, ty, vx, vy, ax, ay, speed, targetHov) {
  const dx = tx - gx, dy = ty - gy;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(speed) || speed > 500 || dist < 0.05) {
    return { x: tx, y: ty, angle: Math.atan2(dy, dx), t: 0, dist };
  }
  let t = dist / speed;
  for (let iter = 0; iter < 3; iter++) {
    const px = tx + vx * t + 0.32 * ax * t * t;
    const py = ty + vy * t + 0.32 * ay * t * t;
    t = Math.min(2.0, Math.hypot(px - gx, py - gy) / speed);
  }
  let fx = tx + vx * t + 0.32 * ax * t * t;
  let fy = ty + vy * t + 0.32 * ay * t * t;
  if (fg && !fg.isOpen(fx, fy, !!targetHov)) {
    fx = tx + vx * t * 0.45;
    fy = ty + vy * t * 0.45;
    if (!fg.isOpen(fx, fy, !!targetHov)) { fx = tx; fy = ty; }
  }
  return { x: fx, y: fy, angle: Math.atan2(fy - gy, fx - gx), t, dist: Math.hypot(fx - gx, fy - gy) };
}

function barrelLos(x0, y0, bx, by) {
  const dx = bx - x0, dy = by - y0, d = Math.hypot(dx, dy);
  if (d < 1.6) return true;
  return fg.los(x0, y0, bx - (dx / d) * 1.45, by - (dy / d) * 1.45);
}

// Multi-step segment check so we never back across intermediate lava pools, pits, walls, or mines
function isSegmentSafe(state, x0, y0, x1, y1, hov, strictHazard) {
  const zone = state.zone;
  if (x1 < 2.2 || y1 < 2.2 || x1 > fg.width - 2.2 || y1 > fg.height - 2.2) return false;
  if (Math.hypot(x1 - zone.x, y1 - zone.y) > zone.r - (hov ? 1.6 : 2.0)) return false;
  if (!fg.clearOfSolid(x1, y1, 1.05)) return false;
  if (!hov && !fg.clearOfPit(x1, y1, strictHazard ? 1.85 : 1.25)) return false;

  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.9));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const px = x0 + dx * k, py = y0 + dy * k;
    const c = fg.codeAt(px, py);
    if (c === T_WALL || c === T_BARR || c === T_CRATE || c === T_BARREL) return false;
    if (!hov && c === T_PIT) return false;
    if (!hov && strictHazard && c === T_LAVA) return false;
  }
  return true;
}

// Full-thrust instant dodge for rolling kegs and incoming mortar shells
function computeInstantBlastDodge(state, U) {
  const s = state.self, hov = s.hovering;
  let threatX = 0, threatY = 0, threatVx = 0, threatVy = 0, safeR = 0, bestUrgency = Infinity, isRolling = false;

  const bombs = state.bombs || [];
  for (let i = 0; i < bombs.length; i++) {
    const b = bombs[i];
    const rx = s.x - b.x, ry = s.y - b.y;
    const rvx = -b.vx, rvy = -b.vy;
    const vv = rvx * rvx + rvy * rvy;
    const tMax = Math.min(b.fuse, 1.5);
    const tClosest = vv > 0.2 ? Math.max(0, Math.min(tMax, -(rx * rvx + ry * rvy) / vv)) : 0;
    const dragScale = Math.max(0.45, 1 - 0.12 * tClosest);
    const bxAt = b.x + b.vx * tClosest * dragScale;
    const byAt = b.y + b.vy * tClosest * dragScale;
    const dAt = Math.hypot(s.x - bxAt, s.y - byAt);
    const reqR = b.r + s.radius + 1.4;
    if (dAt < reqR && tClosest < bestUrgency) {
      bestUrgency = tClosest;
      threatX = bxAt; threatY = byAt;
      threatVx = b.vx; threatVy = b.vy;
      safeR = reqR;
      isRolling = Math.hypot(b.vx, b.vy) > 2.2;
    }
  }

  const shots = state.projectiles || [];
  for (let i = 0; i < shots.length; i++) {
    const p = shots[i];
    if (!p.landsAt) continue;
    const d = Math.hypot(s.x - p.landsAt.x, s.y - p.landsAt.y);
    const reqR = 2.0 + s.radius + 1.15;
    if (d < reqR && p.landsIn < bestUrgency) {
      bestUrgency = p.landsIn;
      threatX = p.landsAt.x; threatY = p.landsAt.y;
      threatVx = 0; threatVy = 0;
      safeR = reqR;
      isRolling = false;
    }
  }

  if (bestUrgency === Infinity) return null;

  const c = Math.cos(s.heading), sn = Math.sin(s.heading);
  let bestAct = null, bestVal = -Infinity;
  const candidates = [
    { throttle: 1, steer: -0.85 },
    { throttle: 1, steer: 0 },
    { throttle: 1, steer: 0.85 },
    { throttle: -1, steer: -0.85 },
    { throttle: -1, steer: 0 },
    { throttle: -1, steer: 0.85 },
  ];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const th = s.heading + cand.steer * 0.5 * (cand.throttle < 0 ? -1 : 1);
    const step = cand.throttle > 0 ? 3.3 : -2.7;
    const px = s.x + Math.cos(th) * step, py = s.y + Math.sin(th) * step;
    if (!isSegmentSafe(state, s.x, s.y, px, py, hov, false)) continue;
    let val = Math.hypot(px - threatX, py - threatY);
    if (isRolling) {
      const bSpd = Math.hypot(threatVx, threatVy) || 1;
      const nx = -threatVy / bSpd, ny = threatVx / bSpd;
      val += Math.abs((px - threatX) * nx + (py - threatY) * ny) * 1.35;
    }
    const curFwd = s.vx * c + s.vy * sn;
    if (curFwd * cand.throttle > 0.5) val += 0.5;
    if (val > bestVal) { bestVal = val; bestAct = cand; }
  }
  if (bestAct) return { throttle: bestAct.throttle, steer: bestAct.steer, brake: 0 };

  const awayAng = Math.atan2(s.y - threatY, s.x - threatX);
  return U.driveTo(s, s.x + Math.cos(awayAng) * (safeR + 2), s.y + Math.sin(awayAng) * (safeR + 2), { reverse: true });
}

function tick(state, api) {
  const self = state.self, U = api.util, nav = api.nav, map = api.map;
  mapInfo ||= analyzeMap(map);
  fg ||= createFastGrid(map, nav);
  fg.setTick(state.tick);

  const hov = self.hovering;
  if (!follower) {
    follower = nav.follower({
      mudCost: hov ? 1.0 : 1.35,
      iceCost: hov ? 1.0 : 1.6,
      lavaCost: hov ? 4.0 : 30.0,
      replanTicks: 42,
      replanDist: 4.5,
    });
  }

  function nextWp(gx, gy) {
    if (Math.hypot(gx - self.x, gy - self.y) < 16 && isSegmentSafe(state, self.x, self.y, gx, gy, hov, true)) {
      return { x: gx, y: gy };
    }
    return follower.next(self, gx, gy, state.tick);
  }

  const cmd = { throttle: 0, steer: 0, brake: 0, fire: [], aims: {} };
  const mates = state.allies.filter((a) => a.alive);
  const dt = state.dt || 0.05;

  // Track enemy accelerations for lead prediction
  const enemyAcc = new Map();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    const pv = prevVel.get(e.id);
    if (pv && state.tick - pv.tick <= 6) {
      const el = Math.max(dt, (state.tick - pv.tick) / 60);
      enemyAcc.set(e.id, { ax: U.clamp((e.vx - pv.vx) / el, -12, 12), ay: U.clamp((e.vy - pv.vy) / el, -12, 12) });
    } else {
      enemyAcc.set(e.id, { ax: 0, ay: 0 });
    }
    prevVel.set(e.id, { vx: e.vx, vy: e.vy, tick: state.tick });
  }

  // ── 1. Team Focus Coordination ──
  const isLeader = mates.every((a) => a.slot > self.slot);
  let sharedFocusId = null;
  let sharedHint = null;
  for (let i = 0; i < state.messages.length; i++) {
    const d = state.messages[i].data;
    if (d && typeof d === 'object') {
      if (Number.isInteger(d.focus) && sharedFocusId === null) sharedFocusId = d.focus;
      if (Number.isFinite(d.tx) && Number.isFinite(d.ty) && !sharedHint) sharedHint = { x: d.tx, y: d.ty };
    }
  }

  let foe = null, bestScore = Infinity;
  let nearestFoe = null, nearestDist = Infinity;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    const d = U.dist(self, e);
    if (d < nearestDist) { nearestDist = d; nearestFoe = e; }
    const hasLos = fg.los(self.x, self.y, e.x, e.y);
    let score = d * 0.75 + e.coreFrac * 18 + e.hpFrac * 10 + (e.shield > 30 ? 4 : 0) + (hasLos ? 0 : 14);
    if (sharedFocusId === e.id && d < 26) score -= 9;
    for (let j = 0; j < mates.length; j++) score += U.dist(mates[j], e) * 0.22;
    if (score < bestScore) { bestScore = score; foe = e; }
  }

  if (isLeader && foe) {
    cmd.say = { focus: foe.id, tx: Math.round(foe.x), ty: Math.round(foe.y) };
  } else if (foe) {
    cmd.say = { tx: Math.round(foe.x), ty: Math.round(foe.y) };
  }

  let tetherBy = null;
  for (let i = 0; i < state.tethers.length; i++) {
    const t = state.tethers[i];
    if (t.to === self.id) {
      tetherBy = state.enemies.find((e) => e.id === t.from) || null;
      if (tetherBy) foe = tetherBy;
      break;
    }
  }

  // ── 2. Energy & Subsystem Management ──
  const empThreat = state.enemies.some((e) => e.item === 'emp' && U.dist(self, e) < 10.5);
  const hasHoverPads = self.parts.some((p) => p.type === 'hover' && p.alive);
  const energyFloor = hasHoverPads ? (empThreat || self.tile === 'pit' ? 52 : 24) : 8;

  if (self.energy < energyFloor + 8 && self.burning === 0) {
    cmd.repair = false;
  }
  const hasRepairer = self.parts.some((p) => p.type === 'repairer' && p.alive);
  if (hasRepairer && mates.length > 0) {
    let hurtAlly = null, worstHp = 0.96;
    for (let i = 0; i < mates.length; i++) {
      const a = mates[i];
      if (U.dist(self, a) <= 4.9 + a.radius && (a.burning > 0 || a.hpFrac < worstHp)) {
        worstHp = a.burning > 0 ? -1 : a.hpFrac;
        hurtAlly = a;
      }
    }
    if (hurtAlly && self.burning === 0 && self.hpFrac > hurtAlly.hpFrac - 0.1) {
      cmd.target = hurtAlly.id;
    }
  }

  // ── 3. Powder Barrel Detonation & Per-Weapon Fire Control ──
  let barrelShot = null;
  if (state.barrels.length > 0 && state.enemies.length > 0) {
    for (let bIdx = 0; bIdx < state.barrels.length; bIdx++) {
      const br = state.barrels[bIdx];
      const selfD = U.dist(self, br);
      if (selfD < 3.9 || selfD > 18.5) continue;
      if (mates.some((a) => U.dist(a, br) < 3.5)) continue;
      const hitEnemy = state.enemies.some((e) => U.dist(e, br) < 2.85 + e.radius * 0.4);
      if (hitEnemy && barrelLos(self.x, self.y, br.x, br.y)) {
        barrelShot = br;
        break;
      }
    }
  }

  let primaryAimAngle = null;
  const foeProfile = foe ? classifyEnemy(foe) : null;

  if (foe || barrelShot) {
    for (let wIdx = 0; wIdx < self.weapons.length; wIdx++) {
      const w = self.weapons[wIdx];
      if (!w.alive) continue;
      const wPart = self.parts[w.i];
      const wx = wPart ? wPart.wx : self.x;
      const wy = wPart ? wPart.wy : self.y;

      let tgtFoe = foe;
      let tgtProf = foeProfile;
      if (tgtFoe) {
        const d0 = Math.hypot(tgtFoe.x - wx, tgtFoe.y - wy);
        if (d0 > w.range + tgtFoe.radius || !fg.los(wx, wy, tgtFoe.x, tgtFoe.y)) {
          if (nearestFoe && nearestFoe !== tgtFoe) {
            const d1 = Math.hypot(nearestFoe.x - wx, nearestFoe.y - wy);
            if (d1 <= w.range + nearestFoe.radius && fg.los(wx, wy, nearestFoe.x, nearestFoe.y)) {
              tgtFoe = nearestFoe;
              tgtProf = classifyEnemy(nearestFoe);
            }
          }
        }
      }

      if (barrelShot && Math.hypot(barrelShot.x - wx, barrelShot.y - wy) <= w.range - 0.3 && barrelLos(wx, wy, barrelShot.x, barrelShot.y)) {
        const bAng = Math.atan2(barrelShot.y - wy, barrelShot.x - wx);
        if (Math.abs(U.angDiff(bAng, w.mountAngle)) <= w.arc + 0.02) {
          cmd.aims[w.i] = { x: barrelShot.x, y: barrelShot.y };
          if (self.energy >= energyFloor && Math.abs(U.angDiff(bAng, w.angle)) <= 0.14) cmd.fire.push(w.i);
          if (primaryAimAngle === null) primaryAimAngle = bAng;
          continue;
        }
      }

      if (!tgtFoe) continue;
      const acc = enemyAcc.get(tgtFoe.id) || { ax: 0, ay: 0 };

      let markX = tgtFoe.x, markY = tgtFoe.y;
      if (tetherBy && tetherBy.id === tgtFoe.id && tgtProf.harpoonPart) {
        markX = tgtProf.harpoonPart.wx; markY = tgtProf.harpoonPart.wy;
      } else if (w.type !== 'laser' && tgtProf.kegPart && tgtFoe.shield <= 8) {
        markX = tgtProf.kegPart.wx; markY = tgtProf.kegPart.wy;
      } else if (tgtProf.corePart) {
        markX = tgtProf.corePart.wx; markY = tgtProf.corePart.wy;
      }

      const sol = leadFrom(wx, wy, markX, markY, tgtFoe.vx, tgtFoe.vy, acc.ax, acc.ay, w.projSpeed, tgtFoe.hovering);
      cmd.aims[w.i] = { x: sol.x, y: sol.y };
      if (primaryAimAngle === null && (w.type === 'cannon' || w.type === 'laser')) primaryAimAngle = sol.angle;

      const effRange = w.range + tgtFoe.radius * 0.55;
      const inRange = sol.dist <= effRange && sol.dist >= (w.minRange || 0);
      const inMountArc = Math.abs(U.angDiff(sol.angle, w.mountAngle)) <= w.arc + 0.015;
      const aligned = Math.abs(U.angDiff(sol.angle, w.angle)) <= (w.type === 'mg' ? 0.16 : 0.08);
      const clearShot = w.type === 'mortar' ? true : (fg.los(wx, wy, sol.x, sol.y) || fg.los(wx, wy, tgtFoe.x, tgtFoe.y));

      let recoilSafe = true;
      if (!hov && w.type === 'cannon') {
        const rx = self.x - Math.cos(w.angle) * 1.7, ry = self.y - Math.sin(w.angle) * 1.7;
        if (fg.codeAt(rx, ry) === T_PIT) recoilSafe = false;
      }

      if (inRange && inMountArc && aligned && clearShot && recoilSafe && self.energy >= energyFloor) {
        cmd.fire.push(w.i);
      }
    }
    if (primaryAimAngle === null && foe) {
      const cp = foeProfile.corePart;
      const sol0 = U.lead(self, cp ? { x: cp.wx, y: cp.wy, vx: foe.vx, vy: foe.vy } : foe, 24);
      cmd.aim = { x: sol0.x, y: sol0.y };
      primaryAimAngle = sol0.angle;
    } else if (foe) {
      cmd.aim = { x: self.x + Math.cos(primaryAimAngle) * 12, y: self.y + Math.sin(primaryAimAngle) * 12 };
    }
  }

  // ── 4. Held Item Usage (EMP & Mines) ──
  if (self.item) {
    if (self.item.type === 'emp' && nearestFoe && nearestDist < 6.6 + nearestFoe.radius) {
      cmd.useItem = true;
    } else if (self.item.type === 'mine' && nearestFoe && nearestDist < 9.5) {
      const behindAng = self.heading + Math.PI;
      const toFoe = U.angleTo(self, nearestFoe);
      if (Math.abs(U.angDiff(toFoe, behindAng)) < 1.35 || nearestDist < 5.5) {
        cmd.useItem = true;
      }
    }
  }

  // ── 5. Emergency Lava Escape ──
  if (!hov && self.tile === 'lava') {
    let bestFloor = null, bestD = Infinity;
    const tx0 = Math.floor(self.x / 2), ty0 = Math.floor(self.y / 2);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const c = fg.codeCell(tx0 + dx, ty0 + dy);
        if (c === T_FLOOR || c === T_MUD) {
          const cx = (tx0 + dx + 0.5) * 2, cy = (ty0 + dy + 0.5) * 2;
          if (fg.clearOfSolid(cx, cy, 0.95) && fg.clearOfPit(cx, cy, 1.4)) {
            const d = Math.hypot(cx - self.x, cy - self.y);
            if (d < bestD) { bestD = d; bestFloor = { x: cx, y: cy }; }
          }
        }
      }
    }
    if (bestFloor) {
      Object.assign(cmd, U.driveTo(self, bestFloor.x, bestFloor.y, { reverse: true, stopDist: 0.2 }));
      return safetyGuard(state, api, cmd);
    }
  }

  // ── 6. Instant Full-Thrust Keg & Mortar Dodge ──
  const dodge = computeInstantBlastDodge(state, U);
  if (dodge) {
    cmd.throttle = dodge.throttle;
    cmd.steer = dodge.steer;
    cmd.brake = dodge.brake || 0;
    return safetyGuard(state, api, cmd);
  }

  // ── 7. Safe Zone Enforcement ──
  const zoneDist = U.dist(self, state.zone);
  const zoneMargin = hov ? 2.6 : 4.2;
  let safeZoneGoal = { x: state.zone.x, y: state.zone.y };
  if (!hov && fg.codeAt(safeZoneGoal.x, safeZoneGoal.y) === T_PIT) {
    const a = U.angleTo(state.zone, self);
    safeZoneGoal = { x: state.zone.x + Math.cos(a) * 4.2, y: state.zone.y + Math.sin(a) * 4.2 };
  }

  if (zoneDist > state.zone.r - zoneMargin) {
    const wp = follower.next(self, safeZoneGoal.x, safeZoneGoal.y, state.tick);
    Object.assign(cmd, U.driveTo(self, wp, { reverse: zoneDist > state.zone.r }));
    return safetyGuard(state, api, cmd);
  }

  // ── 8. Pickups & Emergency Repair Pad ──
  let bestPickup = null, bestPickupScore = Infinity;
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (!hov && (fg.codeAt(it.x, it.y) === T_PIT || fg.codeAt(it.x, it.y) === T_LAVA || !fg.clearOfPit(it.x, it.y, 1.6))) continue;
    if (U.dist(it, state.zone) > state.zone.r - 2.2) continue;
    const d = U.dist(self, it);
    let val = 0;
    if (it.type === 'repair' && (self.hpFrac < 0.72 || self.burning > 0)) val = (1 - self.hpFrac) * 22 + self.burning * 5;
    else if (it.type === 'overdrive') val = 11;
    else if (it.type === 'shield' && self.overshield < 30) val = 10;
    else if (it.type === 'emp' && !self.item) val = 8;
    else if (it.type === 'nitro') val = 5;
    else if (it.type === 'mine' && !self.item && !hov) val = 4;
    if (val <= 0) continue;
    if (foe && (foeProfile.meleeThreat || foeProfile.hasKeg) && U.dist(foe, it) < d - 1.5) continue;
    const maxDetour = self.hpFrac < 0.5 && it.type === 'repair' ? 18 : (!foe ? 22 : 9.5);
    if (d < maxDetour && d - val * 0.6 < bestPickupScore) {
      bestPickupScore = d - val * 0.6;
      bestPickup = it;
    }
  }

  if (!bestPickup && (self.hpFrac < 0.42 || (self.burning >= 2 && !hasRepairer)) && (!nearestFoe || nearestDist > 9.5)) {
    let bestPad = null, bpd = 20;
    for (let i = 0; i < state.pads.length; i++) {
      const p = state.pads[i];
      if (p.charge < 35 || U.dist(p, state.zone) > state.zone.r - 2.5) continue;
      const d = U.dist(self, p);
      if (d < bpd) { bpd = d; bestPad = p; }
    }
    if (bestPad) {
      if (U.dist(self, bestPad) < 1.1) {
        cmd.throttle = 0; cmd.brake = 1;
        if (foe && primaryAimAngle !== null) cmd.steer = U.turnTo(self, primaryAimAngle).steer;
        return safetyGuard(state, api, cmd);
      }
      const wp = follower.next(self, bestPad.x, bestPad.y, state.tick);
      Object.assign(cmd, U.driveTo(self, wp, { stopDist: 0.5 }));
      return safetyGuard(state, api, cmd);
    }
  }

  if (bestPickup) {
    const wp = follower.next(self, bestPickup.x, bestPickup.y, state.tick);
    Object.assign(cmd, U.driveTo(self, wp, { stopDist: 0.1 }));
    return safetyGuard(state, api, cmd);
  }

  // Dedicated 3v3 support shadowing when teammates are damaged and no foe is point-blank
  const isDedicatedSupport = hasRepairer && mates.length > 0 && self.weapons.length <= 4 && (!foe || U.dist(self, foe) > 15);
  if (isDedicatedSupport) {
    let ward = null, ws = Infinity;
    for (let i = 0; i < mates.length; i++) {
      const a = mates[i];
      const s = a.hpFrac * 15 + U.dist(self, a) * 0.35;
      if (s < ws) { ws = s; ward = a; }
    }
    if (ward && ward.hpFrac < 0.88) {
      const backAng = foe ? U.angleTo(foe, ward) : ward.heading + Math.PI;
      const wp = follower.next(self, ward.x + Math.cos(backAng) * 3.4, ward.y + Math.sin(backAng) * 3.4, state.tick);
      Object.assign(cmd, U.driveTo(self, wp, { stopDist: 1.0 }));
      return safetyGuard(state, api, cmd);
    }
  }

  // ── 9. Active Combat Positioning (Nose-Locked Spiked Kiting + Corner Escape) ──
  const hasAliveGuns = self.weapons.some((w) => w.alive);
  const hasLaser = self.weapons.some((w) => w.alive && w.type === 'laser');

  if (foe && hasAliveGuns) {
    const d = U.dist(self, foe);
    const hasLos = fg.los(self.x, self.y, foe.x, foe.y);

    if (tetherBy) {
      const aimAng = primaryAimAngle !== null ? primaryAimAngle : U.angleTo(self, tetherBy);
      cmd.steer = U.turnTo(self, aimAng).steer;
      const c = Math.cos(self.heading), s = Math.sin(self.heading);
      cmd.throttle = isSegmentSafe(state, self.x, self.y, self.x - c * 3.5, self.y - s * 3.5, hov, true) ? -1.0 : -0.5;
      return safetyGuard(state, api, cmd);
    }

    let wantDist = 9.6;
    if (foeProfile.hasKeg) {
      // Outrange Sapper's flung kegs and 13m MGs while our 19m cannons pound it & pop its kegs!
      wantDist = 15.4;
    } else if (foeProfile.meleeThreat || foeProfile.hasHarpoon) {
      wantDist = foeProfile.hasHarpoon && self.shield < 20 ? 13.0 : 11.8;
    } else if (foeProfile.hasMortar) {
      wantDist = 6.4;
    } else if (foeProfile.longRange || foeProfile.hasRepair) {
      wantDist = 7.4;
    } else {
      wantDist = hasLaser ? 8.3 : 9.6;
    }

    if (hasLos && d < 20.8) {
      const aimAng = primaryAimAngle !== null ? primaryAimAngle : U.angleTo(self, foe);
      const headingErr = U.angDiff(aimAng, self.heading);

      const c = Math.cos(self.heading), s = Math.sin(self.heading);
      const backStep = foeProfile.hasPiston && !hov ? 4.8 : 3.5;
      const backSafe = isSegmentSafe(state, self.x, self.y, self.x - c * backStep, self.y - s * backStep, hov, true)
        && (hov || !foeProfile.hasPiston || fg.clearOfPit(self.x - c * 3.0, self.y - s * 3.0, 3.4));
      const fwdSafe = isSegmentSafe(state, self.x, self.y, self.x + c * 3.2, self.y + s * 3.2, hov, true);

      const ux = (self.x - foe.x) / (d || 1), uy = (self.y - foe.y) / (d || 1);
      const foeClosingSpeed = foe.vx * ux + foe.vy * uy;

      // Lateral tangent breakout ONLY when actually backed near a wall/hazard while kiting!
      if ((d < wantDist - 1.5 || (foeProfile.meleeThreat && d < 8.5)) && !backSafe) {
        if (state.tick - lastFlipTick > 50) {
          const b2f = U.angleTo(foe, self);
          const p1x = foe.x + Math.cos(b2f + 0.95) * wantDist, p1y = foe.y + Math.sin(b2f + 0.95) * wantDist;
          const p2x = foe.x + Math.cos(b2f - 0.95) * wantDist, p2y = foe.y + Math.sin(b2f - 0.95) * wantDist;
          const ok1 = isSegmentSafe(state, self.x, self.y, p1x, p1y, hov, true);
          const ok2 = isSegmentSafe(state, self.x, self.y, p2x, p2y, hov, true);
          if (ok1 && !ok2) orbitSign = 1;
          else if (ok2 && !ok1) orbitSign = -1;
          else orbitSign = -orbitSign;
          lastFlipTick = state.tick;
        }
        const escAng = U.angleTo(foe, self) + orbitSign * 1.05;
        const escX = U.clamp(foe.x + Math.cos(escAng) * wantDist, 3, map.width - 3);
        const escY = U.clamp(foe.y + Math.sin(escAng) * wantDist, 3, map.height - 3);
        const wp = nextWp(escX, escY);
        Object.assign(cmd, U.driveTo(self, wp));
        return safetyGuard(state, api, cmd);
      }

      // Keep nose dead-on against melee/harpoon threats so 100% of cannons AND front saw/spikes stay locked on!
      const weave = (!foeProfile.meleeThreat && !foeProfile.hasHarpoon && d > 6.8) ? Math.sin(state.t * 1.9 + self.slot * 2.1) * 0.14 : 0;
      const desiredHeading = aimAng + weave;
      cmd.steer = U.clamp(U.angDiff(desiredHeading, self.heading) * 2.8 - self.angVel * 0.38, -1, 1);

      const distErr = d - wantDist;
      if (distErr > 1.4) {
        cmd.throttle = fwdSafe ? (Math.abs(headingErr) < 0.45 ? U.clamp(distErr * 0.28, 0.35, 1.0) : 0.22) : 0;
      } else if (distErr < -1.1 || (foeClosingSpeed > 3.2 && d < wantDist + 1.5 && (foeProfile.meleeThreat || foeProfile.hasKeg))) {
        cmd.throttle = backSafe ? -1.0 : (fwdSafe && !foeProfile.meleeThreat ? 0.3 : 0);
      } else {
        const jink = Math.sin(state.t * 2.7 + self.id) * 0.45;
        cmd.throttle = (jink > 0 && fwdSafe) || (jink < 0 && backSafe) ? jink : 0;
      }

      if (hov) {
        const fwdVel = self.vx * c + self.vy * s;
        if (distErr < -0.5 && fwdVel > 1.5) cmd.throttle = -1.0;
      }

      return safetyGuard(state, api, cmd);
    }
  }

  // ── 10. Pursuit / Search Navigation ──
  let goal = foe;
  if (!goal && sharedHint) goal = sharedHint;
  if (!goal) {
    let bestD = Infinity;
    for (let i = 0; i < state.lastSeen.length; i++) {
      const l = state.lastSeen[i];
      if (!l.alive) continue;
      const d = U.dist(self, l);
      if (d < bestD) { bestD = d; goal = l; }
    }
  }
  if (!goal) goal = safeZoneGoal;

  let gx = goal.x, gy = goal.y;
  if (!hov && fg.codeAt(gx, gy) === T_PIT) {
    const a = U.angleTo(goal, self);
    gx = goal.x + Math.cos(a) * 3.2;
    gy = goal.y + Math.sin(a) * 3.2;
  }

  const wp = nextWp(gx, gy);
  Object.assign(cmd, U.driveTo(self, wp, { stopDist: foe && !hasAliveGuns ? 0 : 0.6 }));
  return safetyGuard(state, api, cmd);
}

// ── Final Safety Layer: Bounds, Pits, Lava, Mines, Barrels, and Team Spacing ──
function safetyGuard(state, api, cmd) {
  const s = state.self, map = api.map, U = api.util;
  const hov = s.hovering;
  const c = Math.cos(s.heading), sn = Math.sin(s.heading);

  if (hov) {
    const px = s.x + s.vx * 0.75, py = s.y + s.vy * 0.75;
    const outBounds = px < 2.1 || py < 2.1 || px > map.width - 2.1 || py > map.height - 2.1;
    const outZone = Math.hypot(px - state.zone.x, py - state.zone.y) > state.zone.r - 1.3;
    if (outBounds || outZone) {
      Object.assign(cmd, U.driveTo(s, state.zone.x, state.zone.y, { reverse: true, stopDist: 0.5 }));
    }
    return cmd;
  }

  for (let i = 0; i < 3; i++) {
    const k = i === 0 ? 0.25 : i === 1 ? 0.55 : 0.9;
    if (fg.codeAt(s.x + s.vx * k, s.y + s.vy * k) === T_PIT) {
      const fwdSpd = s.vx * c + s.vy * sn;
      cmd.throttle = fwdSpd >= 0 ? -1 : 1;
      cmd.brake = 1;
      cmd.boost = 0;
      return cmd;
    }
  }

  const dir = Math.sign(cmd.throttle || 0);
  if (dir !== 0) {
    for (let di = 0; di < 4; di++) {
      const dist = 0.45 + di * 0.55;
      for (let wi = -1; wi <= 1; wi++) {
        const w = wi * 0.55;
        const px = s.x + c * dist * dir - sn * w;
        const py = s.y + sn * dist * dir + c * w;
        const tc = fg.codeAt(px, py);
        if (tc === T_PIT) {
          cmd.throttle = -dir * 0.6;
          cmd.brake = 1;
          cmd.boost = 0;
          return cmd;
        }
        if (tc === T_LAVA && s.tile !== 'lava') {
          cmd.throttle = -dir * 0.35;
          cmd.brake = 1;
          return cmd;
        }
      }
    }
    for (let i = 0; i < state.mines.length; i++) {
      const m = state.mines[i];
      const px = s.x + c * 1.6 * dir, py = s.y + sn * 1.6 * dir;
      if (Math.hypot(px - m.x, py - m.y) < 1.95) {
        cmd.throttle = -dir * 0.6;
        cmd.steer = cmd.steer >= 0 ? 1 : -1;
        return cmd;
      }
    }
  }

  if (state.barrels.length > 0 && state.enemies.length > 0) {
    const nb = state.barrels[0];
    if (U.dist(s, nb) < 3.2) {
      const away = U.angleTo(nb, s);
      const px = s.x + Math.cos(away) * 3.0, py = s.y + Math.sin(away) * 3.0;
      if (fg.isOpen(px, py, false) && fg.codeAt(px, py) !== T_LAVA) {
        Object.assign(cmd, U.driveTo(s, px, py, { reverse: true }));
      }
    }
  }

  for (let i = 0; i < state.allies.length; i++) {
    const a = state.allies[i];
    if (!a.alive) continue;
    const d = U.dist(s, a);
    if (d < s.radius + a.radius + 0.55 && s.slot > a.slot) {
      const ang = U.angleTo(s, a);
      const fwdDot = Math.cos(ang - s.heading) * (cmd.throttle || 0);
      if (fwdDot > 0.2) {
        cmd.throttle *= 0.2;
        cmd.steer = U.clamp(cmd.steer + (Math.sin(ang - s.heading) > 0 ? -0.6 : 0.6), -1, 1);
      }
    }
  }

  return cmd;
}
