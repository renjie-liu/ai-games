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
    name: 'Core', cat: 'structure', glyph: '@', layer: 'any',
    cost: 0, mass: 20, hp: 550, max: 1, min: 1,
    energyCap: 100, energyRegen: 5, sensor: 22, gyro: 60,
    desc: 'The cockpit. Exactly one per vehicle; when it dies the vehicle dies. Pieces no longer connected to it fall off.',
  },
  plate: {
    name: 'Plate 1x1', cat: 'structure', glyph: 'p', layer: 'any', low: true,
    cost: 6, mass: 3, hp: 45, burn: 1,
    desc: 'Thin cheap plate. On the chassis it carries things; on the deck it is flat enough to shoot over.',
  },
  plate2: {
    name: 'Plate 1x2', cat: 'structure', glyph: 'q', layer: 'any', low: true, size: [1, 2],
    cost: 10, mass: 5, hp: 85, burn: 1,
    desc: 'Two studs of plate in one piece: cheaper per stud, but it is lost as a unit.',
  },
  plate4: {
    name: 'Plate 2x2', cat: 'structure', glyph: 'Q', layer: 'any', low: true, size: [2, 2],
    cost: 18, mass: 9, hp: 160, burn: 1,
    desc: 'Four studs of plate in one piece. Fast, cheap floor — and one big thing to lose.',
  },
  brick: {
    name: 'Brick 1x1', cat: 'structure', glyph: 'b', layer: 'any',
    cost: 9, mass: 4, hp: 70, burn: 0.8,
    desc: 'Full-height brick. Tougher than plate; on the deck it blocks firing lanes.',
  },
  brick2: {
    name: 'Brick 1x2', cat: 'structure', glyph: 'B', layer: 'any', size: [1, 2],
    cost: 16, mass: 7, hp: 130, burn: 0.8,
    desc: 'Two-stud brick.',
  },
  armor: {
    name: 'Armor brick 1x1', cat: 'structure', glyph: 'a', layer: 'any',
    cost: 26, mass: 13, hp: 200, armor: 2,
    desc: 'Heavy brick. Subtracts 2 from every kinetic/explosive hit (min 25% gets through), so it halves machine-gun fire. Lasers, saws and burn ignore it.',
  },
  armor2: {
    name: 'Armor brick 1x2', cat: 'structure', glyph: 'A', layer: 'any', size: [1, 2],
    cost: 48, mass: 24, hp: 380, armor: 2,
    desc: 'Two-stud armor brick. Stagger them like a brick wall.',
  },
  slope: {
    name: 'Slope armor', cat: 'structure', glyph: '/', layer: 'any', low: true, directional: true,
    cost: 30, mass: 9, hp: 150, armor: 1, deflect: 0.45,
    desc: 'Wedge that faces `dir`. Shots arriving against its face only do 45% (ricochet). Low: guns behind it fire over it.',
  },
  plow: {
    name: 'Plow blade 3x1', cat: 'structure', glyph: 'P', layer: 'chassis', size: [3, 1], directional: true, lane: 'front',
    cost: 95, mass: 34, hp: 520, armor: 1, ramIn: 0.3, ramOut: 1.3, shove: 1.6,
    desc: 'Three-stud-wide ram blade. Takes 30% collision damage and shoves whatever it hits 60% harder. Must face an open edge.',
  },

  // ── mobility ───────────────────────────────────────────────────────────
  wheel: {
    name: 'Wheel', cat: 'mobility', glyph: 'o', layer: 'chassis', mover: 'wheel',
    cost: 30, mass: 6, hp: 70, burn: 1, force: 380, grip: 1.0,
    desc: 'Drive wheel. Left/right placement gives differential steering: the wider apart, the faster you turn. Bogs in mud, slides on ice.',
  },
  bigwheel: {
    name: 'Monster wheel 1x2', cat: 'mobility', glyph: 'O', layer: 'chassis', mover: 'wheel', size: [1, 2], fixedDir: true,
    cost: 58, mass: 13, hp: 160, burn: 1, force: 660, grip: 1.25, mudTraction: 0.75,
    desc: 'Two studs long. Nearly twice a wheel, tougher, and it keeps 75% traction in mud.',
  },
  track: {
    name: 'Track unit 1x3', cat: 'mobility', glyph: 'T', layer: 'chassis', mover: 'track', size: [1, 3], fixedDir: true,
    cost: 125, mass: 34, hp: 380, force: 1080, grip: 1.6,
    desc: 'Three studs of all-terrain drive. Almost ignores mud, keeps some grip on ice, hard to shove sideways.',
  },
  hover: {
    name: 'Hover pad', cat: 'mobility', glyph: 'h', layer: 'chassis', mover: 'hover',
    cost: 50, mass: 5, hp: 50, burn: 0.7, force: 210, grip: 0.22, lift: 75, energyUse: 1.2,
    desc: 'Lifts 75 kg each. If total lift >= vehicle mass (and energy > 0) you float: immune to mud/ice/pits/mines, lava hurts 75% less — but you drift and are easy to shove.',
  },
  thruster: {
    name: 'Thruster', cat: 'mobility', glyph: 'J', layer: 'any', directional: true, lane: 'back',
    cost: 55, mass: 5, hp: 45, burn: 0.6, thrust: 1000, energyUse: 16,
    desc: 'Burst rocket, pushes the vehicle toward `dir`. Works on any terrain. Needs clear exhaust: nothing tall behind it on its own layer.',
  },
  gyro: {
    name: 'Steering gyro', cat: 'mobility', glyph: 'g', layer: 'any',
    cost: 45, mass: 5, hp: 50, burn: 0.5, gyro: 300,
    desc: 'Adds 300 N·m of steering torque regardless of wheels or terrain.',
  },
  blower: {
    name: 'Supercharger', cat: 'mobility', glyph: 'w', layer: 'deck', max: 2,
    cost: 60, mass: 6, hp: 50, burn: 0.7, driveBoost: 0.14,
    desc: 'Blower through the hood: +14% force from every wheel, track and hover pad. Up to two.',
  },
  spoiler: {
    name: 'Spoiler 3x1', cat: 'mobility', glyph: 'W', layer: 'deck', low: true, size: [3, 1], max: 1,
    cost: 40, mass: 5, hp: 60, burn: 1, gripBoost: 0.6,
    desc: 'Downforce: +60% side grip, so fast light cars stop sliding wide. Low piece.',
  },

  // ── weapons ────────────────────────────────────────────────────────────
  mg: {
    name: 'Machine-gun turret', cat: 'weapon', glyph: 'm', layer: 'deck', directional: true, lane: 'front', weapon: 'bullet',
    cost: 70, mass: 6, hp: 90, burn: 0.5,
    dmg: 4, cooldown: 0.125, projSpeed: 28, range: 13, spread: 0.07,
    arc: deg(50), traverse: 5, energyShot: 0.7, dtype: 'kinetic',
    desc: 'Wide-arc turret, 32 dps. Shreds plates and wheels; armor halves it.',
  },
  cannon: {
    name: 'Cannon 1x2', cat: 'weapon', glyph: 'C', layer: 'deck', size: [1, 2], directional: true, lane: 'front', weapon: 'shell',
    cost: 110, mass: 13, hp: 170, burn: 0.4,
    dmg: 30, cooldown: 1.6, projSpeed: 24, range: 19, spread: 0.02, recoil: 100, splash: { r: 0.75, f: 0.3, max: 4 },
    arc: deg(20), traverse: 2.2, energyShot: 9, dtype: 'kinetic',
    desc: 'Slow heavy shell with small splash. Narrow arc: point the car.',
  },
  railgun: {
    name: 'Railgun 1x3', cat: 'weapon', glyph: 'R', layer: 'deck', size: [1, 3], directional: true, lane: 'front', weapon: 'rail',
    cost: 170, mass: 16, hp: 160, burn: 0.4,
    dmg: 90, cooldown: 4, range: 24, pierce: 3, pierceFalloff: 0.5, noDeflect: true, recoil: 220,
    arc: deg(8), traverse: 1.2, energyShot: 30, dtype: 'kinetic',
    desc: 'Instant-hit sniper, three studs long. Punches through 3 pieces (each takes half of the one before) and a slope does not turn its slug. Nearly fixed mount, hungry for energy.',
  },
  laser: {
    name: 'Laser', cat: 'weapon', glyph: 'L', layer: 'deck', directional: true, lane: 'front', weapon: 'beam',
    cost: 120, mass: 8, hp: 90, burn: 0.5,
    dps: 22, range: 10, arc: deg(35), traverse: 4, energyUse: 11, dtype: 'energy',
    desc: 'Continuous beam that ignores armor and slopes. Short range and drains energy fast.',
  },
  missile: {
    name: 'Missile pod 2x2', cat: 'weapon', glyph: 'M', layer: 'deck', size: [2, 2], directional: true, lane: 'front', weapon: 'missile',
    cost: 170, mass: 15, hp: 200, burn: 0.8,
    dmg: 28, salvo: 2, cooldown: 3.8, projSpeed: 13, turn: 2.6, ttl: 4.5, range: 32, recoil: 40, splash: { r: 1, f: 0.5, max: 4 },
    arc: deg(60), traverse: 6, energyShot: 16, dtype: 'explosive',
    desc: 'Fires two homing missiles with splash. Slow enough to dodge behind walls.',
  },
  mortar: {
    name: 'Mortar 2x2', cat: 'weapon', glyph: 'N', layer: 'deck', size: [2, 2], directional: true, weapon: 'lob',
    cost: 150, mass: 18, hp: 160, burn: 0.6,
    dmg: 46, cooldown: 4, projSpeed: 15, range: 24, minRange: 6, recoil: 150, splash: { r: 2.0, f: 1, max: 7 },
    arc: Math.PI, traverse: 2.5, energyShot: 14, dtype: 'explosive',
    desc: 'Lobs a shell OVER walls to the point you aim at (give `aim` as {x, y}). 2 m blast. Cannot hit closer than 6 m; needs no clear lane.',
  },
  saw: {
    name: 'Buzz saw', cat: 'weapon', glyph: 'S', layer: 'chassis', directional: true, lane: 'front', weapon: 'melee',
    cost: 60, mass: 10, hp: 120, burn: 0.3,
    dps: 60, reach: 0.62, energyUse: 4, dtype: 'melee',
    desc: 'Grinds any enemy piece it touches for 60 dps. Ignores armor and shields, eats the chassis first.',
  },
  spike: {
    name: 'Ram spike', cat: 'weapon', glyph: 'V', layer: 'chassis', directional: true, lane: 'front',
    cost: 28, mass: 7, hp: 160, ramIn: 0.25, ramOut: 3,
    desc: 'Collisions through this stud deal x3 damage and you take only 25% back.',
  },
  flamer: {
    name: 'Flamethrower', cat: 'weapon', glyph: 'Y', layer: 'deck', directional: true, lane: 'front', weapon: 'flame',
    cost: 100, mass: 9, hp: 90, burn: 0.3,
    dps: 3.5, heat: 1, range: 5.5, cone: deg(15), arc: deg(40), traverse: 4, energyUse: 9, dtype: 'fire',
    desc: 'Short stream of fire. The stream itself does little: it heats every piece it washes over until they catch fire, and fire spreads from piece to piece. Armor, tracks and cores do not burn. Shields keep it off.',
  },
  harpoon: {
    name: 'Harpoon 1x2', cat: 'weapon', glyph: 'H', layer: 'deck', size: [1, 2], directional: true, lane: 'front', weapon: 'hook',
    cost: 90, mass: 10, hp: 120, burn: 0.4,
    dmg: 10, cooldown: 6, projSpeed: 32, range: 11, arc: deg(30), traverse: 3, energyShot: 10, dtype: 'kinetic',
    rope: { min: 1.5, reel: 3, hold: 7, reelEnergy: 6, tear: 45 },
    desc: 'Fires a hook on a cable. If it bites, the two vehicles are tied together for up to 7 s: neither gets further from the other than the cable is long, and `reel` winds it in at 3 m/s. The heavier one, or the one with more grip, decides where both go. While the cable is pulled tight it works the piece it bit into loose at 45 hp/s (armour a quarter of that): held, the piece comes off, with whatever only it was holding on. `release` lets go. A shield turns the hook away.',
  },
  piston: {
    name: 'Piston ram', cat: 'weapon', glyph: 'U', layer: 'chassis', directional: true, lane: 'front',
    cost: 70, mass: 12, hp: 150,
    punch: { impulse: 1300, dmg: 24, reach: 0.75, cooldown: 2.4, energy: 14 },
    desc: 'Punches whatever is right in front of it: 24 damage and a 1300 N·s shove — a 250 kg car leaves at 5 m/s — with the same shove back on you. Fires by itself when an enemy, a crate or a rolling bomb is in reach (`melee: false` holds it).',
  },
  keg: {
    name: 'Powder keg', cat: 'weapon', glyph: 'K', layer: 'any', directional: true, max: 4,
    cost: 40, mass: 8, hp: 110, burn: 1.5, fling: 8,
    blast: { dmg: 70, r: 3.2, max: 8, fuse: 2 },
    desc: 'A bomb you carry. `detonate` sets it off where it sits; `jettison` flings it the way it faces, 8 m/s faster than you were going: it rolls about 10 m, and goes off against the first other vehicle it reaches or after 2 s. Facing forward it is a torpedo, facing back a mine for whoever is chasing. Either way the blast hits everything within 3.2 m, you and your team included, throws it back and sets it alight — and anything that destroys the keg, or sets it on fire, sets it off.',
  },

  // ── utility ────────────────────────────────────────────────────────────
  battery: {
    name: 'Battery', cat: 'utility', glyph: 'e', layer: 'any',
    cost: 35, mass: 9, hp: 60, burn: 1, energyCap: 140,
    desc: '+140 energy capacity.',
  },
  reactor: {
    name: 'Reactor', cat: 'utility', glyph: 'r', layer: 'any',
    cost: 75, mass: 12, hp: 70, burn: 0.6, energyRegen: 8, energyCap: 20, volatile: 35,
    desc: '+8 energy/s. Volatile: when destroyed it blasts every piece touching it (sides, above, below) for 35.',
  },
  radar: {
    name: 'Radar', cat: 'utility', glyph: 'd', layer: 'deck', max: 1, low: true,
    cost: 40, mass: 3, hp: 35, burn: 0.8, sensor: 16, seesMines: true,
    desc: '+16 m sensor range (shared with the team) and reveals enemy mines.',
  },
  shieldgen: {
    name: 'Shield generator', cat: 'utility', glyph: 'G', layer: 'deck', max: 1,
    cost: 130, mass: 12, hp: 70, burn: 0.6, shield: 240, shieldRegen: 16, shieldDelay: 2.5, energyUse: 2.5,
    desc: 'Bubble that absorbs 240 damage from shots, beams, flame and every blast from outside it — shells, missiles, mortar rounds, powder kegs, barrels, mines — recharging after 2.5 s without a hit. A blast it soaks still shoves you. Rams, saws, pistons, fire already burning, and a keg that goes off while still bolted to you go straight through.',
  },
  repairer: {
    name: 'Repair arm', cat: 'utility', glyph: '+', layer: 'deck', max: 2,
    cost: 90, mass: 8, hp: 50, burn: 0.6, heal: 9, healRange: 5, energyUse: 6,
    desc: 'Heals the most damaged piece on you or an ally within 5 m for 9 hp/s. Cannot rebuild destroyed pieces.',
  },

  // ── decor: free, weightless, purely for looks ──────────────────────────
  tile: {
    name: 'Livery tile', cat: 'decor', glyph: 't', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, burn: 1.5, desc: 'Smooth tile in your accent colour.',
  },
  fin: {
    name: 'Tail fin', cat: 'decor', glyph: 'f', layer: 'deck', decor: true, low: true, directional: true,
    cost: 0, mass: 0, hp: 20, burn: 1.5, desc: 'A fin. It does nothing and looks fast.',
  },
  pipe: {
    name: 'Exhaust stacks', cat: 'decor', glyph: 'i', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, burn: 1.5, desc: 'Twin chrome stacks.',
  },
  lamp: {
    name: 'Light bar', cat: 'decor', glyph: 'l', layer: 'deck', decor: true, low: true, directional: true,
    cost: 0, mass: 0, hp: 20, burn: 1.5, desc: 'Glowing lamps facing `dir`.',
  },
  flag: {
    name: 'Flag', cat: 'decor', glyph: 'F', layer: 'deck', decor: true, low: true,
    cost: 0, mass: 0, hp: 20, burn: 1.5, desc: 'Antenna with a pennant in your accent colour.',
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
  repair: { name: 'Repair kit', icon: '🔧', held: false, color: '#4ade80',
    desc: 'Instantly restores 35% of max HP to every damaged (not destroyed) piece.' },
  shield: { name: 'Overshield', icon: '🛡️', held: false, color: '#60a5fa', amount: 100, time: 12,
    desc: '+100 temporary shield for 12 s, even without a generator.' },
  overdrive: { name: 'Overdrive', icon: '💥', held: false, color: '#f87171', mult: 1.5, time: 8,
    desc: 'Everything your guns, flamethrowers, saws and pistons deal x1.5 for 8 s. Not powder kegs, rams or fire once it has caught.' },
  nitro: { name: 'Nitro', icon: '⚡', held: false, color: '#facc15', mult: 1.6, time: 6,
    desc: 'Drive and thruster force x1.6 for 6 s.' },
  mine: { name: 'Mines', icon: '💣', held: true, color: '#fb923c', charges: 2,
    dmg: 55, radius: 2.2, trigger: 0.9, arm: 0.8,
    desc: 'Held, 2 charges. `useItem` drops one behind you; it arms in 0.8 s and blasts the first enemy that drives over it (chassis first).' },
  emp: { name: 'EMP', icon: '🌀', held: true, color: '#c084fc', charges: 1,
    radius: 7, stun: 2.2, drain: 40,
    desc: 'Held, 1 charge. `useItem` stuns every enemy within 7 m for 2.2 s, drops their shields and drains 40 energy.' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// Tile types. `ch` is the character used in ASCII maps.
/**
 * What one hit is worth once the piece it lands on has had its say: a slope struck on its face lets
 * `deflect` of it through, armor takes `armor` off but never more than three quarters. Only kinetic
 * and explosive hits are reduced. This is the arithmetic of World.damage (sim.js), stated once for
 * the design analysis and the rulebook; tests/contraptions.test.js holds the two to the same answer.
 */
export function hitOn(def, amount, dtype = 'kinetic', faced = false) {
  if (dtype !== 'kinetic' && dtype !== 'explosive') return amount;
  if (faced && def.deflect) amount *= def.deflect;
  if (def.armor) amount = Math.max(amount * 0.25, amount - def.armor);
  return amount;
}

export const TILE = 2; // metres per map tile
export const TILES = {
  floor:   { ch: '.', name: 'Floor' },
  wall:    { ch: '#', name: 'Wall', solid: true, blocksShots: true,
    desc: 'Blocks vehicles, shots and beams. Mortar shells fly over.' },
  barrier: { ch: '-', name: 'Barrier', solid: true,
    desc: 'Blocks vehicles only; shots fly over.' },
  pit:     { ch: '_', name: 'Pit',
    desc: 'Centre of mass over a pit = instant elimination, unless hovering.' },
  mud:     { ch: 'm', name: 'Mud',
    desc: 'Wheels lose 60% traction (monster wheels 25%), tracks 15%. Hover ignores it.' },
  ice:     { ch: 'i', name: 'Ice',
    desc: 'Almost no side grip and 65% less traction for wheels (tracks cope better).' },
  lava:    { ch: 'L', name: 'Lava',
    desc: 'Every piece takes 12 hp/s (3 hp/s while hovering).' },
  pad:     { ch: '+', name: 'Repair pad',
    desc: 'Park on it (speed < 2 m/s) to heal 25 hp/s from a 150 hp pool that refills at 6 hp/s. Puts out fires.' },
  crate:   { ch: 'x', name: 'Crate', solid: true, blocksShots: true, hp: 150,
    desc: 'A wall you can break: 150 hp. Shots, blasts, fire, pistons and driving into it at speed all count. Gone, it is floor.' },
  barrel:  { ch: '!', name: 'Powder barrel', solid: true, blocksShots: true, hp: 40, blast: { dmg: 70, r: 3, max: 8 },
    desc: 'Blocks the way until something touches it off: 40 hp, then a blast that hits everything within 3 m, shoves it and sets it alight. Barrels set each other off.' },
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
  ramK: 0.014,             // collision energy -> damage
  ramMinSpeed: 1.5,
  ramSpread: 0.3,          // share of a collision's damage that also lands on each piece touching the one hit
  ramTile: 3,              // a crate or barrel takes this many times the damage a piece would
  blastPush: 14,           // N·s of shove per point of blast damage
  hitPush: 2.5,            // N·s of shove per point of damage from a shell, bullet, missile or rail slug
  recoil: 1,               // multiplier on each gun's own recoil (N·s)
  fireDps: 5,              // a burning piece loses this much hp per second
  fireTime: 5,             // ...for this long; a piece burns once
  fireSpread: 0.4,         // heat per second a burning piece gives each piece touching it (x that piece's `burn`)
  heatDecay: 0.1,          // heat a piece loses per second; it ignites at heat 1
  lavaHeat: 1.2,           // heat per second lava gives the chassis pieces of a vehicle standing in it
  blastHeat: 0.35,         // heat an ordinary blast gives each piece it damages (kegs and barrels ignite outright)
  bombDrag: 3,             // m/s² a dropped keg loses while it rolls
  bombTouch: 0.7,          // m: a rolling keg this close to a piece of another car goes off on it
  wreckTime: 3,            // seconds a vehicle may go on with nothing that moves it and nothing that can hurt, before it counts as destroyed
  tickBudgetMs: 3,         // advisory per-decision CPU budget
  maxViolations: 40,       // exceptions / gross overruns before the controller is cut off
  sayLimit: 256,           // max JSON chars for team messages
  revealTime: 1.5,         // firing a gun reveals you to every enemy for this long
};
