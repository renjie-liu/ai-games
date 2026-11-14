// The brick kit — the single source of truth for building rules.
// Everything a designer can buy is in PARTS; these numbers drive the sim, the
// garage UI, the rules page and the MCP `list_parts` tool.
//
// v0.2 "brick kit": a stud grid, two stacking layers (chassis + deck) and
// multi-stud pieces, modelled on how a LEGO vehicle goes together.

export const CELL = 0.4;        // metres per stud
export const GRID_HX = 4;       // x runs -4..4  (9 studs wide)
export const GRID_HY = 5;       // y runs -5..5  (11 studs long)
export const GRID_W = GRID_HX * 2 + 1;
export const GRID_L = GRID_HY * 2 + 1;
export const LAYER = { chassis: 0, deck: 1 };
export const LAYER_NAME = ['chassis', 'deck'];
export const BUDGETS = { light: 800, standard: 1200, heavy: 1800 };
export const DEFAULT_BUDGET = BUDGETS.standard;
export const DECOR_LIMIT = 8;

// Blueprint directions. y+ is the FRONT of the vehicle, x+ is its RIGHT side.
export const DIRS = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
// Mount angle relative to vehicle heading (radians, counter-clockwise positive).
export const DIR_ANGLE = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 };

const deg = (d) => (d * Math.PI) / 180;

// size: [studs across, studs along] when facing N.  layer: where it may be placed.
// low: on the deck it does not block firing lanes.  decor: free cosmetic piece.
export const PARTS = {
  // ── structure / defence ────────────────────────────────────────────────
  core: {
    name: 'Core', zh: '核心', cat: 'structure', glyph: '@', layer: 'any',
    cost: 0, mass: 20, hp: 400, max: 1, min: 1,
    energyCap: 100, energyRegen: 5, sensor: 22, gyro: 60,
    desc: 'The cockpit. Exactly one per vehicle; when it dies the vehicle dies. Pieces no longer connected to it fall off.',
  },
  plate: {
    name: 'Plate 1x1', zh: '底板 1×1', cat: 'structure', glyph: 'p', layer: 'any', low: true,
    cost: 6, mass: 3, hp: 45,
    desc: 'Thin cheap plate. On the chassis it carries things; on the deck it is flat enough to shoot over.',
  },
  plate2: {
    name: 'Plate 1x2', zh: '底板 1×2', cat: 'structure', glyph: 'q', layer: 'any', low: true, size: [1, 2],
    cost: 10, mass: 5, hp: 85,
    desc: 'Two studs of plate in one piece: cheaper per stud, but it is lost as a unit.',
  },
  plate4: {
    name: 'Plate 2x2', zh: '底板 2×2', cat: 'structure', glyph: 'Q', layer: 'any', low: true, size: [2, 2],
    cost: 18, mass: 9, hp: 160,
    desc: 'Four studs of plate in one piece. Fast, cheap floor — and one big thing to lose.',
  },
  brick: {
    name: 'Brick 1x1', zh: '砖 1×1', cat: 'structure', glyph: 'b', layer: 'any',
    cost: 9, mass: 4, hp: 70,
    desc: 'Full-height brick. Tougher than plate; on the deck it blocks firing lanes.',
  },
  brick2: {
    name: 'Brick 1x2', zh: '砖 1×2', cat: 'structure', glyph: 'B', layer: 'any', size: [1, 2],
    cost: 16, mass: 7, hp: 130,
    desc: 'Two-stud brick.',
  },
  armor: {
    name: 'Armor brick 1x1', zh: '装甲砖 1×1', cat: 'structure', glyph: 'a', layer: 'any',
    cost: 26, mass: 13, hp: 200, armor: 2,
    desc: 'Heavy brick. Subtracts 2 from every kinetic/explosive hit (min 25% gets through), so it halves machine-gun fire. Lasers, saws and burn ignore it.',
  },
  armor2: {
    name: 'Armor brick 1x2', zh: '装甲砖 1×2', cat: 'structure', glyph: 'A', layer: 'any', size: [1, 2],
    cost: 48, mass: 24, hp: 380, armor: 2,
    desc: 'Two-stud armor brick. Stagger them like a brick wall.',
  },
  slope: {
    name: 'Slope armor', zh: '斜面装甲', cat: 'structure', glyph: '/', layer: 'any', low: true, directional: true,
    cost: 30, mass: 9, hp: 150, armor: 1, deflect: 0.45,
    desc: 'Wedge that faces `dir`. Shots arriving against its face only do 45% (ricochet). Low: guns behind it fire over it.',
  },
  plow: {
    name: 'Plow blade 3x1', zh: '推铲 3×1', cat: 'structure', glyph: 'P', layer: 'chassis', size: [3, 1], directional: true, lane: 'front',
    cost: 95, mass: 34, hp: 520, armor: 1, ramIn: 0.3, ramOut: 1.3, shove: 1.6,
    desc: 'Three-stud-wide ram blade. Takes 30% collision damage and shoves whatever it hits 60% harder. Must face an open edge.',
  },

  // ── mobility ───────────────────────────────────────────────────────────
  wheel: {
    name: 'Wheel', zh: '轮子', cat: 'mobility', glyph: 'o', layer: 'chassis', mover: 'wheel',
    cost: 30, mass: 6, hp: 70, force: 380, grip: 1.0,
    desc: 'Drive wheel. Left/right placement gives differential steering: the wider apart, the faster you turn. Bogs in mud, slides on ice.',
  },
  bigwheel: {
    name: 'Monster wheel 1x2', zh: '大脚轮 1×2', cat: 'mobility', glyph: 'O', layer: 'chassis', mover: 'wheel', size: [1, 2], fixedDir: true,
    cost: 58, mass: 13, hp: 160, force: 660, grip: 1.25, mudTraction: 0.75,
    desc: 'Two studs long. Nearly twice a wheel, tougher, and it keeps 75% traction in mud.',
  },
  track: {
    name: 'Track unit 1x3', zh: '履带 1×3', cat: 'mobility', glyph: 'T', layer: 'chassis', mover: 'track', size: [1, 3], fixedDir: true,
    cost: 125, mass: 34, hp: 380, force: 1080, grip: 1.6,
    desc: 'Three studs of all-terrain drive. Almost ignores mud, keeps some grip on ice, hard to shove sideways.',
  },
  hover: {
    name: 'Hover pad', zh: '悬浮垫', cat: 'mobility', glyph: 'h', layer: 'chassis', mover: 'hover',
    cost: 50, mass: 5, hp: 50, force: 210, grip: 0.22, lift: 75, energyUse: 1.2,
    desc: 'Lifts 75 kg each. If total lift >= vehicle mass (and energy > 0) you float: immune to mud/ice/pits/mines, lava hurts 75% less — but you drift and are easy to shove.',
  },
  thruster: {
    name: 'Thruster', zh: '推进器', cat: 'mobility', glyph: 'J', layer: 'any', directional: true, lane: 'back',
    cost: 55, mass: 5, hp: 45, thrust: 1000, energyUse: 16,
    desc: 'Burst rocket, pushes the vehicle toward `dir`. Works on any terrain. Needs clear exhaust: nothing tall behind it on its own layer.',
  },
  gyro: {
    name: 'Steering gyro', zh: '转向陀螺', cat: 'mobility', glyph: 'g', layer: 'any',
    cost: 45, mass: 5, hp: 50, gyro: 300,
    desc: 'Adds 300 N·m of steering torque regardless of wheels or terrain.',
  },
  blower: {
    name: 'Supercharger', zh: '增压器', cat: 'mobility', glyph: 'w', layer: 'deck', max: 2,
    cost: 60, mass: 6, hp: 50, driveBoost: 0.14,
    desc: 'Blower through the hood: +14% force from every wheel, track and hover pad. Up to two.',
  },
  spoiler: {
    name: 'Spoiler 3x1', zh: '尾翼 3×1', cat: 'mobility', glyph: 'W', layer: 'deck', low: true, size: [3, 1], max: 1,
    cost: 40, mass: 5, hp: 60, gripBoost: 0.6,
    desc: 'Downforce: +60% side grip, so fast light cars stop sliding wide. Low piece.',
  },

  // ── weapons ────────────────────────────────────────────────────────────
  mg: {
    name: 'Machine-gun turret', zh: '机枪塔', cat: 'weapon', glyph: 'm', layer: 'deck', directional: true, lane: 'front', weapon: 'bullet',
    cost: 70, mass: 6, hp: 90,
    dmg: 4, cooldown: 0.125, projSpeed: 28, range: 13, spread: 0.035,
    arc: deg(50), traverse: 5, energyShot: 0.7, dtype: 'kinetic',
    desc: 'Wide-arc turret, 32 dps. Shreds plates and wheels; armor halves it.',
  },
  cannon: {
    name: 'Cannon 1x2', zh: '加农炮 1×2', cat: 'weapon', glyph: 'C', layer: 'deck', size: [1, 2], directional: true, lane: 'front', weapon: 'shell',
    cost: 110, mass: 13, hp: 170,
    dmg: 30, cooldown: 1.4, projSpeed: 24, range: 19, splash: { r: 0.75, f: 0.3, max: 4 },
    arc: deg(20), traverse: 2.2, energyShot: 9, dtype: 'kinetic',
    desc: 'Slow heavy shell with small splash. Narrow arc: point the car.',
  },
  railgun: {
    name: 'Railgun 1x3', zh: '磁轨炮 1×3', cat: 'weapon', glyph: 'R', layer: 'deck', size: [1, 3], directional: true, lane: 'front', weapon: 'rail',
    cost: 170, mass: 16, hp: 160,
    dmg: 64, cooldown: 4.4, range: 24, pierce: 2, pierceFalloff: 0.5,
    arc: deg(8), traverse: 1.2, energyShot: 30, dtype: 'kinetic',
    desc: 'Instant-hit sniper, three studs long. Punches through 2 pieces (the second takes half). Nearly fixed mount, hungry for energy.',
  },
  laser: {
    name: 'Laser', zh: '激光', cat: 'weapon', glyph: 'L', layer: 'deck', directional: true, lane: 'front', weapon: 'beam',
    cost: 120, mass: 8, hp: 90,
    dps: 22, range: 10, arc: deg(35), traverse: 4, energyUse: 11, dtype: 'energy',
    desc: 'Continuous beam that ignores armor and slopes. Short range and drains energy fast.',
  },
  missile: {
    name: 'Missile pod 2x2', zh: '导弹巢 2×2', cat: 'weapon', glyph: 'M', layer: 'deck', size: [2, 2], directional: true, lane: 'front', weapon: 'missile',
    cost: 170, mass: 15, hp: 200,
    dmg: 30, salvo: 2, cooldown: 3.6, projSpeed: 13, turn: 2.6, ttl: 4.5, range: 40, splash: { r: 1.1, f: 0.6, max: 5 },
    arc: deg(60), traverse: 6, energyShot: 16, dtype: 'explosive',
    desc: 'Fires two homing missiles with splash. Slow enough to dodge behind walls.',
  },
  mortar: {
    name: 'Mortar 2x2', zh: '迫击炮 2×2', cat: 'weapon', glyph: 'N', layer: 'deck', size: [2, 2], directional: true, weapon: 'lob',
    cost: 150, mass: 18, hp: 160,
    dmg: 46, cooldown: 4.4, projSpeed: 15, range: 24, minRange: 6, splash: { r: 2.0, f: 1, max: 7 },
    arc: Math.PI, traverse: 2.5, energyShot: 14, dtype: 'explosive',
    desc: 'Lobs a shell OVER walls to the point you aim at (give `aim` as {x, y}). 2 m blast. Cannot hit closer than 6 m; needs no clear lane.',
  },
  saw: {
    name: 'Buzz saw', zh: '圆锯', cat: 'weapon', glyph: 'S', layer: 'chassis', directional: true, lane: 'front', weapon: 'melee',
    cost: 60, mass: 10, hp: 120,
    dps: 60, reach: 0.62, energyUse: 4, dtype: 'melee',
    desc: 'Grinds any enemy piece it touches for 60 dps. Ignores armor and shields, eats the chassis first.',
  },
  spike: {
    name: 'Ram spike', zh: '撞角', cat: 'weapon', glyph: 'V', layer: 'chassis', directional: true, lane: 'front',
    cost: 28, mass: 7, hp: 160, ramIn: 0.25, ramOut: 3,
    desc: 'Collisions through this stud deal x3 damage and you take only 25% back.',
  },

  // ── utility ────────────────────────────────────────────────────────────
  battery: {
    name: 'Battery', zh: '电池', cat: 'utility', glyph: 'e', layer: 'any',
    cost: 35, mass: 9, hp: 60, energyCap: 140,
    desc: '+140 energy capacity.',
  },
  reactor: {
    name: 'Reactor', zh: '反应堆', cat: 'utility', glyph: 'r', layer: 'any',
    cost: 75, mass: 12, hp: 70, energyRegen: 8, energyCap: 20, volatile: 35,
    desc: '+8 energy/s. Volatile: when destroyed it blasts every piece touching it (sides, above, below) for 35.',
  },
  radar: {
    name: 'Radar', zh: '雷达', cat: 'utility', glyph: 'd', layer: 'deck', max: 1, low: true,
    cost: 40, mass: 3, hp: 35, sensor: 16, seesMines: true,
    desc: '+16 m sensor range (shared with the team) and reveals enemy mines.',
  },
  shieldgen: {
    name: 'Shield generator', zh: '护盾发生器', cat: 'utility', glyph: 'G', layer: 'deck', max: 1,
    cost: 130, mass: 12, hp: 70, shield: 120, shieldRegen: 10, shieldDelay: 3, energyUse: 2.5,
    desc: 'Bubble that absorbs 120 projectile/beam/blast damage, recharging after 3 s without a hit. Rams and saws go straight through.',
  },
  repairer: {
    name: 'Repair arm', zh: '维修臂', cat: 'utility', glyph: '+', layer: 'deck', max: 2,
    cost: 90, mass: 8, hp: 50, heal: 9, healRange: 5, energyUse: 6,
    desc: 'Heals the most damaged piece on you or an ally within 5 m for 9 hp/s. Cannot rebuild destroyed pieces.',
  },

  // ── decor: free, weightless, purely for looks ──────────────────────────
  tile: {
    name: 'Livery tile', zh: '涂装光面砖', cat: 'decor', glyph: 't', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, desc: 'Smooth tile in your accent colour.',
  },
  fin: {
    name: 'Tail fin', zh: '尾鳍', cat: 'decor', glyph: 'f', layer: 'deck', decor: true, low: true, directional: true,
    cost: 0, mass: 0, hp: 20, desc: 'A fin. It does nothing and looks fast.',
  },
  pipe: {
    name: 'Exhaust stacks', zh: '排气管', cat: 'decor', glyph: 'i', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, desc: 'Twin chrome stacks.',
  },
  lamp: {
    name: 'Light bar', zh: '车灯', cat: 'decor', glyph: 'l', layer: 'deck', decor: true, low: true, directional: true,
    cost: 0, mass: 0, hp: 20, desc: 'Glowing lamps facing `dir`.',
  },
  flag: {
    name: 'Flag', zh: '旗杆', cat: 'decor', glyph: 'F', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, desc: 'Antenna with a pennant in your accent colour.',
  },
};

for (const [id, p] of Object.entries(PARTS)) { p.id = id; p.size ||= [1, 1]; }

export const PART_IDS = Object.keys(PARTS);

// Accent colours a design may pick with `paint: { accent: 'yellow' }`. Hull colour is always the team colour.
export const PAINTS = {
  white: '#f2f3f2', black: '#1b2a34', grey: '#a0a5a9', yellow: '#fac80a', lime: '#a5ca18', red: '#c91a09',
  azure: '#36aebf', purple: '#81007b', pink: '#fc97ac', sand: '#d9bb7b',
};
export const PAINT_IDS = Object.keys(PAINTS);

/** Footprint in studs after rotation: [across x, along y]. */
export function dimsOf(type, dir) {
  const [w, l] = PARTS[type].size;
  return dir === 'E' || dir === 'W' ? [l, w] : [w, l];
}

/** Stud cells a placed part covers. (x, y) is the minimum corner of its footprint. */
export function cellsOf(p) {
  const [w, l] = dimsOf(p.type, p.dir);
  const out = [];
  for (let j = 0; j < l; j++) for (let i = 0; i < w; i++) out.push([p.x + i, p.y + j]);
  return out;
}

// Pickups ("items"). `held` items go into the single item slot and fire on `useItem`.
export const ITEMS = {
  repair: { name: 'Repair kit', zh: '维修包', icon: '🔧', held: false, color: '#4ade80',
    desc: 'Instantly restores 35% of max HP to every damaged (not destroyed) piece.' },
  shield: { name: 'Overshield', zh: '护盾', icon: '🛡️', held: false, color: '#60a5fa', amount: 100, time: 12,
    desc: '+100 temporary shield for 12 s, even without a generator.' },
  overdrive: { name: 'Overdrive', zh: '超载', icon: '💥', held: false, color: '#f87171', mult: 1.5, time: 8,
    desc: 'All your damage x1.5 for 8 s.' },
  nitro: { name: 'Nitro', zh: '氮气', icon: '⚡', held: false, color: '#facc15', mult: 1.6, time: 6,
    desc: 'Drive and thruster force x1.6 for 6 s.' },
  mine: { name: 'Mines', zh: '地雷', icon: '💣', held: true, color: '#fb923c', charges: 2,
    dmg: 55, radius: 2.2, trigger: 0.9, arm: 0.8,
    desc: 'Held, 2 charges. `useItem` drops one behind you; it arms in 0.8 s and blasts the first enemy that drives over it (chassis first).' },
  emp: { name: 'EMP', zh: '电磁脉冲', icon: '🌀', held: true, color: '#c084fc', charges: 1,
    radius: 7, stun: 2.2, drain: 40,
    desc: 'Held, 1 charge. `useItem` stuns every enemy within 7 m for 2.2 s, drops their shields and drains 40 energy.' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// Tile types. `ch` is the character used in ASCII maps.
export const TILE = 2; // metres per map tile
export const TILES = {
  floor:   { ch: '.', name: 'Floor', zh: '地面' },
  wall:    { ch: '#', name: 'Wall', zh: '墙', solid: true, blocksShots: true,
    desc: 'Blocks vehicles, shots and beams. Mortar shells fly over.' },
  barrier: { ch: '-', name: 'Barrier', zh: '矮栏', solid: true,
    desc: 'Blocks vehicles only; shots fly over.' },
  pit:     { ch: '_', name: 'Pit', zh: '深坑',
    desc: 'Centre of mass over a pit = instant elimination, unless hovering.' },
  mud:     { ch: 'm', name: 'Mud', zh: '泥地',
    desc: 'Wheels lose 60% traction (monster wheels 25%), tracks 15%. Hover ignores it.' },
  ice:     { ch: 'i', name: 'Ice', zh: '冰面',
    desc: 'Almost no side grip and 65% less traction for wheels (tracks cope better).' },
  lava:    { ch: 'L', name: 'Lava', zh: '熔岩',
    desc: 'Every piece takes 12 hp/s (3 hp/s while hovering).' },
  pad:     { ch: '+', name: 'Repair pad', zh: '维修台',
    desc: 'Park on it (speed < 2 m/s) to heal 25 hp/s from a 150 hp pool that refills at 6 hp/s.' },
};
export const TILE_IDS = Object.keys(TILES);

export const RULES = {
  tickRate: 60,            // physics Hz
  decisionEvery: 3,        // controller runs every 3rd tick (20 Hz)
  frameEvery: 2,           // replay frames at 30 fps
  duration: 150,           // seconds
  zoneStart: 85,           // safe zone starts shrinking
  zoneEnd: 138,            // ...and reaches its minimum radius
  zoneMinRadius: 7,
  zoneDps: 10,             // per piece, outside the zone
  lavaDps: 12,
  itemFirstSpawn: 8,
  itemRespawn: 14,
  ramK: 0.012,             // collision energy -> damage
  ramMinSpeed: 1.5,
  tickBudgetMs: 3,         // advisory per-decision CPU budget
  maxViolations: 40,       // exceptions / gross overruns before the controller is cut off
  sayLimit: 256,           // max JSON chars for team messages
  revealTime: 1.5,         // firing a gun reveals you to every enemy for this long
};
