// The rulebook, generated from the same tables the simulator runs on, so it
// can never drift from the engine. Served as AGENTS.md, by the MCP `get_rules`
// tool and on the web Rules tab.
import { PARTS, ITEMS, TILES, RULES, CELL, GRID_HX, GRID_HY, GRID_W, GRID_L, BUDGETS, TILE, DECOR_LIMIT, PAINT_IDS } from './parts.js';
import { PHYS } from './design.js';
import { MAPS, MAP_IDS } from './maps.js';
import { ENGINE_VERSION } from './match.js';

const deg = (r) => Math.round((r * 180) / Math.PI);

function partRow(p) {
  const bits = [];
  if (p.weapon && p.weapon !== 'melee') {
    if (p.weapon === 'flame') bits.push(`${p.dps} dps to each piece in a ±${deg(p.cone)}° stream`, `heats them ${p.heat}/s (a piece catches fire at heat 1)`);
    else if (p.dps) bits.push(`${p.dps} dps beam`);
    else bits.push(`${p.dmg} dmg${p.salvo ? ` x${p.salvo}` : ''} / ${p.cooldown}s (${Math.round((p.dmg * (p.salvo || 1)) / p.cooldown)} dps)`);
    bits.push(p.minRange ? `range ${p.minRange}-${p.range} m` : `range ${p.range} m`, p.arc >= 3 ? 'arc 360°' : `arc ±${deg(p.arc)}°`, `traverse ${p.traverse} rad/s`);
    if (p.projSpeed) bits.push(`shot speed ${p.projSpeed} m/s`); else bits.push('instant hit');
    bits.push(p.energyShot ? `${p.energyShot} energy/shot` : `${p.energyUse} energy/s`);
    if (p.splash) bits.push(p.weapon === 'lob' ? `blast ${p.splash.r} m, up to ${p.splash.max} pieces` : `splash ${p.splash.r} m x${p.splash.f}`);
    if (p.rope) bits.push(`cable holds ${p.rope.hold} s, reels in ${p.rope.reel} m/s down to ${p.rope.min} m`, `pulled tight it tears the hooked piece at ${p.rope.tear} hp/s`);
    if (p.recoil) bits.push(`recoil ${p.recoil} N·s`);
    bits.push(p.dtype);
  }
  if (p.punch) bits.push(`${p.punch.dmg} dmg and ${p.punch.impulse} N·s per punch`, `reach ${p.punch.reach} m`, `${p.punch.cooldown} s to reset`, `${p.punch.energy} energy/punch`);
  if (p.blast) bits.push(`blast ${p.blast.dmg} dmg, ${p.blast.r} m, up to ${p.blast.max} pieces per vehicle`, `let go, it is flung ${p.fling} m/s the way it faces and goes off on the first other vehicle it reaches, or after ${p.blast.fuse} s`);
  if (p.weapon === 'melee') bits.push(`${p.dps} dps on contact`, `${p.energyUse} energy/s while cutting`);
  if (p.force) bits.push(`${p.force} N drive`, `grip ${p.grip}`);
  if (p.lift) bits.push(`lift ${p.lift} kg`, `${p.energyUse} energy/s`);
  if (p.thrust) bits.push(`${p.thrust} N thrust`, `${p.energyUse} energy/s`);
  if (p.gyro && p.id !== 'core') bits.push(`${p.gyro} N·m steering torque`);
  if (p.driveBoost) bits.push(`+${Math.round(p.driveBoost * 100)}% drive force`);
  if (p.gripBoost) bits.push(`+${Math.round(p.gripBoost * 100)}% side grip`);
  if (p.armor) bits.push(`armor ${p.armor}`);
  if (p.deflect) bits.push(`frontal shots x${p.deflect}`);
  if (p.ramOut) bits.push(`ram dealt x${p.ramOut}, taken x${p.ramIn}`);
  if (p.energyCap) bits.push(`+${p.energyCap} energy cap`);
  if (p.energyRegen) bits.push(`+${p.energyRegen} energy/s`);
  if (p.sensor) bits.push(`sensor ${p.id === 'core' ? '' : '+'}${p.sensor} m`);
  if (p.shield) bits.push(`${p.shield} shield, +${p.shieldRegen}/s after ${p.shieldDelay}s`, `${p.energyUse} energy/s`);
  if (p.heal) bits.push(`${p.heal} hp/s heal within ${p.healRange} m`, `${p.energyUse} energy/s`);
  if (p.max) bits.push(`max ${p.max}`);
  const place = [p.layer === 'any' ? 'either layer' : p.layer];
  if (p.low) place.push('low');
  if (p.directional) place.push(p.lane === 'back' ? 'dir, clear exhaust' : p.lane ? 'dir, clear lane' : 'dir');
  if (p.fixedDir) place.push('always lengthwise');
  if (!p.decor) bits.push(p.burn ? (p.burn >= 1 ? 'burns' : 'burns slowly') : 'fireproof');
  return `| \`${p.id}\` | ${p.glyph} | ${p.size[0]}x${p.size[1]} | ${p.cost} | ${p.mass} | ${p.hp} | ${place.join(', ')} | ${bits.join(', ')} | ${p.desc} |`;
}

export function rulesMarkdown() {
  const cats = { structure: 'Structure & defence', mobility: 'Mobility & steering', weapon: 'Weapons', utility: 'Utility', decor: 'Decor (free)' };
  // what one hit of each gun is worth on the three kinds of surface, by the same arithmetic the engine uses
  const after = (d, def, faced) => { let x = faced && def.deflect ? d * def.deflect : d; if (def.armor) x = Math.max(x * 0.25, x - def.armor); return Math.round(x * 10) / 10; };
  const hitTable = ['| weapon | one hit | on a plain piece | on armor | on a slope, face on | on a slope, from elsewhere |', '|---|---|---:|---:|---:|---:|',
    ...Object.values(PARTS).filter((p) => p.weapon && p.weapon !== 'hook' && p.dmg && (p.dtype === 'kinetic' || p.dtype === 'explosive')).map((p) =>
      `| ${p.id} | ${p.dmg}${p.salvo ? ' x' + p.salvo : ''} ${p.dtype} | ${p.dmg} | ${after(p.dmg, PARTS.armor, false)} | ${after(p.dmg, PARTS.slope, true)} | ${after(p.dmg, PARTS.slope, false)} |`)].join('\n');
  const partTables = Object.entries(cats).map(([cat, title]) =>
    `**${title}**\n\n| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |\n|---|---|---|---|---|---|---|---|---|\n` +
    Object.values(PARTS).filter((p) => p.cat === cat).map(partRow).join('\n')).join('\n\n');
  const maps = MAP_IDS.map((id) => {
    const m = MAPS[id];
    return `### \`${id}\` — ${m.name} (${m.w}x${m.h} tiles = ${m.width}x${m.height} m)\n${m.desc} Items: ${m.items.join(', ')}.\n\n\`\`\`\n${m.rows.join('\n')}\n\`\`\``;
  }).join('\n\n');
  const R = RULES;

  return `# Ironyard — rules and controller contract (engine ${ENGINE_VERSION})

Ironyard is a deterministic vehicle-combat arena. **You build the car and you write its brain.**
Before a match you hand in ONE JavaScript file containing a blueprint (which bricks go where, within a
budget) and a \`tick\` function (what the car does each decision step). The kit has wheels, tracks and hover pads,
guns, flamethrowers, harpoons, piston rams and powder kegs; things burn, blasts throw vehicles about, and some maps
are built of crates and barrels that do not stay where they are. Matches then run with no model
in the loop: same files + same seed = same result, every time.

Modes: \`1v1\`, \`2v2\`, \`3v3\`. A team wins by destroying every enemy core. Budget per vehicle:
${Object.entries(BUDGETS).map(([k, v]) => `${k} ${v}`).join(' / ')} credits (default standard).

## 1. Your file

\`\`\`js
// mybot.js — top-level names the engine looks for (the \`export\` keyword is optional and ignored)
const meta = { name: 'My Bot', author: 'me', model: 'which LLM wrote this', notes: 'one-line idea' };

// A blueprint object, or a function (ctx, api) => blueprint so you can adapt to mode / slot / map.
const design = {
  name: 'Starter',
  paint: { accent: 'yellow' },
  parts: [
    // chassis layer (z: 0): what touches the ground
    { type: 'plate', x: 0,  y: 0, z: 0 }, { type: 'plate', x: 0, y: 1, z: 0 },
    { type: 'wheel', x: -1, y: 0, z: 0 }, { type: 'wheel', x: 1, y: 0, z: 0 },
    // deck layer (z: 1): what rides on top
    { type: 'core',  x: 0,  y: 0, z: 1 },
    { type: 'mg',    x: 0,  y: 1, z: 1, dir: 'N' },
  ],
};

function init(info, api) { /* optional, once before the match */ }

function tick(state, api) {           // called at ${R.tickRate / R.decisionEvery} Hz
  const foe = state.enemies[0];
  if (!foe) return { throttle: 1 };
  return { ...api.util.driveTo(state.self, foe), aim: foe, fire: true };
}
\`\`\`

Rules for the file: plain JavaScript, one file, and only the language to work with. There is no
\`require\`, no network, no clock (\`Date\`, timers and the usual globals are undefined), and the word
\`import\` may not appear anywhere in the file, not even in a comment. \`Math.random\` is replaced by a
seeded generator. Your code runs when \`init\` and \`tick\` are called and at no other time: a promise
never resolves, so do not \`await\`. Keep state in top-level variables — every vehicle gets its own
private copy of your file, so teammates do **not** share variables; use \`say\` (section 6) to coordinate.

## 2. Building the vehicle

The kit works like a box of bricks: a stud grid, two layers that stack, and pieces of different sizes.

* **Stud grid:** ${GRID_W} studs wide by ${GRID_L} long, one stud = ${CELL} m. Coordinates are integers,
  \`x ∈ [-${GRID_HX}, ${GRID_HX}]\`, \`y ∈ [-${GRID_HY}, ${GRID_HY}]\`. **\`y+\` is the FRONT, \`x+\` is the RIGHT side.**
* **Two layers:** \`z: 0\` is the **chassis** (running gear, floor, rams), \`z: 1\` is the **deck** (cockpit, turrets,
  superstructure). Each piece says which layer it may go on. A piece listed as "either layer" needs an explicit \`z\`.
* **Multi-stud pieces:** a piece covers \`studs\` = across x along (when facing N). \`x, y\` is the **lowest-x, lowest-y
  stud** of its footprint. \`dir\` (\`'N'\` front, \`'E'\` right, \`'S'\` rear, \`'W'\` left) turns it; E/W swap the footprint.
  Wheels and tracks always run lengthwise.
* **Stacking:** every deck piece needs at least one stud on top of a chassis piece (overhang is fine).
* **Connection:** exactly one \`core\`; every piece must reach it through pieces that touch edge-to-edge on a layer or sit on top of each other.
* **Clear lane:** on its own layer, every stud in front of a gun, saw, spike or plow (along \`dir\`, out to the grid edge)
  must be empty. Thrusters need the studs *behind* them empty. On the deck, **low** pieces (plates, slopes, tiles, radar,
  spoiler) do not block — so a slope in front of a turret is legal, and it takes the hit first.
* **Budget:** total cost ≤ budget. Up to ${DECOR_LIMIT} decor pieces are free and weightless.
* **Paint:** \`paint: { accent }\` picks the trim colour (${PAINT_IDS.join(', ')}). The hull is always your team colour.

What happens under fire:

* Each piece has its own hp. At 0 it breaks off and its function is gone. Anything no longer connected to
  the core falls off with it. The vehicle dies when the core dies — or ${R.wreckTime} s after it has nothing left that
  moves it (wheels, tracks, hover pads, thrusters) and nothing left that can hurt (guns, flamers, harpoons, saws,
  pistons, spikes, plows, kegs): a hull like that is a wreck.
* **Shots, beams and blasts hit the deck piece of a stud column first**, then the chassis piece under it.
  **Rams, saws and mines hit the chassis piece first.** A shot travelling across the vehicle hits whatever column it enters first —
  whether what stands there is on the deck or only on the chassis. (\`low\` in the tables is about your own firing lanes only: a deck
  gun shoots over a low deck piece in front of it. To an incoming shot a low piece is a piece like any other.)
* Slopes: a kinetic or explosive hit arriving against the slope's facing (within 60°) only does ${Math.round(PARTS.slope.deflect * 100)}%.
* **What a hit is worth** after the piece it lands on has had its say (armor takes ${PARTS.armor.armor} off every kinetic or explosive hit, never
  more than three quarters of it; a slope struck on its face lets ${Math.round(PARTS.slope.deflect * 100)}% through and then takes ${PARTS.slope.armor} off). Lasers, flame and saws are not reduced by either:

${hitTable}

* Decor is not solid: shots pass through it, and it is shaken off when the piece under it takes ${PARTS.tile.hp} damage.
* **Fire.** Every piece has heat. Flamethrowers and lava raise it steadily. Every blast raises it too: the burst of a cannon shell, a missile or a
  mortar round gives each piece it damages up to ${R.blastHeat} heat (times that piece's \`burn\`, less towards the edge of the burst), so three
  or four bursts on the same plates light them, and the blast of a keg or a barrel lights everything in reach that burns at once. At heat 1 a piece
  that burns catches fire. It then loses ${R.fireDps} hp/s for ${R.fireTime} s (armor does not help) and heats every piece touching
  it by ${R.fireSpread}/s, so the fire walks across the vehicle. A piece burns once. The tables say what burns: plates, bricks,
  wheels and most equipment do; armor, slopes, tracks, spikes, plows, pistons and the core do not, so a row of them is a
  firebreak. A fire is put out by parking on a repair pad, by a repair kit, by a repair arm (it goes for burning pieces
  first), or by letting go of the piece (\`jettison\`). A keg that catches fire goes off.

${partTables}

ASCII shortcut — the same two pictures the tools print back to you:

\`\`\`js
const E = '.  .  .  .  .  .  .  .  .';
const design = (ctx, api) => api.util.blueprint('Tankette', {   // 11 rows each, first row = FRONT, 9 tokens per row
  deck: [ E, E,
    '.  .  .  .  /^ .  .  .  .',     // a slope facing forward, in front of…
    '.  .  .  .  :  .  .  .  .',     // …a 1x2 cannon: ":" marks the rest of a multi-stud piece
    '.  .  .  a  C^ a  .  .  .',     //    and its glyph sits on its lowest-x, lowest-y stud
    '.  .  .  a  @  a  .  .  .',
    E, E, E, E, E ],
  chassis: [ E, E,
    '.  .  .  .  p  .  .  .  .',
    '.  .  :  p  p  p  :  .  .',     // two 1x3 track units, one per side
    '.  .  :  p  r  p  :  .  .',
    '.  .  T  p  p  p  T  .  .',
    E, E, E, E, E ],
}, { paint: { accent: 'yellow' } });
\`\`\`

Tokens: \`.\` empty, \`:\` rest of a multi-stud piece, otherwise the glyph plus an optional arrow \`^ > v <\` for its direction.

### How the numbers turn into motion

* **Drive:** each wheel/track pushes along the hull's forward axis with \`force x command\`, where the
  command is \`throttle - steer\` for movers left of the centre of mass and \`throttle + steer\` for
  movers right of it (clamped to ±1; reverse is ${PHYS.reverseFactor * 100}% as strong). Movers on the centreline only push.
  Steering torque = force x sideways distance from the centre of mass, plus gyros (the core has a ${PARTS.core.gyro} N·m one).
  Wider wheelbase or gyros = faster turning; heavy, long hulls turn slowly.
* **Speed:** acceleration = force / mass against drag \`${PHYS.dragLin}·v + ${PHYS.dragQuad}·v²\`. \`validate_design\` reports the
  resulting top speed, turn rate and weight class, so you do not need to do the algebra.
* **Grip:** wheels kill sideways sliding (rate ${PHYS.gripBase}/s x grip). Hover pads barely do. No working movers = belly on the ground.
* **Centre of mass** is computed from the pieces that are still attached; lose a wheel and the car pulls to one side.
* **Hover:** if total lift ≥ current mass and you have energy, the vehicle floats (see terrain). Only hover pads push while floating.
* **Energy:** capacity and regen come from core, batteries and reactors. Guns, lasers, saws, thrusters, hover pads,
  shields and repair arms draw from it; whatever cannot be paid for simply does not work that tick. Wheels and tracks are free.
* **Collisions:** rigid-body impulses, one circle per occupied stud. Damage = collision energy x ${R.ramK} to the two pieces that touch
  (only above ${R.ramMinSpeed} m/s closing speed, never between teammates), scaled by each piece's ram multipliers, and ${Math.round(R.ramSpread * 100)}% of it again
  to every piece touching the one that was hit. Mass and speed push people around.
* **Everything shoves.** A blast throws each vehicle in it away from its centre with ${R.blastPush} N·s per point of damage (a 46-damage
  mortar shell: ${Math.round(46 * R.blastPush)} N·s, which is ${(46 * R.blastPush / 250).toFixed(1)} m/s for a 250 kg car — and more for a hover craft). A shell, bullet or
  slug pushes what it hits with ${R.hitPush} N·s per point. Cannons, railguns, mortars and missile pods kick their own vehicle
  straight back when they fire (the tables give the recoil). Near a hole, that is how you leave.

## 3. The arena

Physics runs at ${R.tickRate} Hz, your \`tick\` every ${R.decisionEvery} ticks. A match lasts at most ${R.duration} s.
World units are metres; \`x\` grows east, \`y\` grows north; angles are radians, counter-clockwise, 0 = east.
One map tile is ${TILE} m.

| tile | char | effect |
|---|---|---|
${Object.entries(TILES).map(([id, t]) => `| \`${id}\` | \`${t.ch}\` | ${t.desc || 'Normal ground.'} |`).join('\n')}

Off the edge of the map counts as a pit.

* **Safe zone:** from t=${R.zoneStart}s to t=${R.zoneEnd}s a circle centred on the map shrinks to ${R.zoneMinRadius} m radius (some maps differ: read \`state.zone\`).
  Outside it every piece takes ${R.zoneDps} hp/s.
* **Vision:** you see an enemy if it is within the sensor range of any living teammate (core ${PARTS.core.sensor} m, radar +${PARTS.radar.sensor} m),
  or for ${R.revealTime}s after it fires a gun. Walls do not block vision. \`state.lastSeen\` remembers where each enemy was.
* **Friendly fire is off** for guns, flamethrowers, saws, pistons and hooks: shots and their splash pass through
  teammates. You can still bump into them. **Powder kegs and barrels are the exception**: their blasts hit everyone in
  reach, a teammate sets off a rolling keg by touching it, and nothing done to your own side counts as damage dealt.
* **Timeout:** more vehicles alive wins; then more total hull fraction remaining; then more damage dealt; else a draw.
* **Crates and barrels** are tiles with hit points. A crate is a wall until it is broken; a barrel explodes when it is,
  a tenth of a second later, so a row of them goes off one after another. Shots, beams, blasts, fire, pistons and
  collisions (x${R.ramTile}, and more through a spike or plow) all damage them. \`api.nav\` always answers for the map as it is
  now, and \`state.barrels\` lists the barrels still standing near you.

### Items
Pick-ups appear on the map's \`*\` spots at t=${R.itemFirstSpawn}s and again ${R.itemRespawn}s after being taken. Drive over one to take it.
Mirrored spots always hold the same item type.

| item | kind | effect |
|---|---|---|
${Object.entries(ITEMS).map(([id, it]) => `| \`${id}\` | ${it.held ? 'held' : 'instant'} | ${it.desc} |`).join('\n')}

A vehicle holds one item at a time (a new held item replaces the old one). Mines do not trigger on hovering vehicles.
A repair kit also puts out every fire on the vehicle.

### Maps
Each map is point-symmetric. \`A B C\` / \`a b c\` are the three spawn points of team 0 / team 1: 3v3 fills them in
slot order, 1v1 uses the centre one (\`A\`), 2v2 puts slot 0 on \`B\` and slot 1 on \`C\`. With \`swap\` the teams trade
sides. Row 0 is the north edge.

${maps}

## 4. What \`tick\` receives

\`\`\`
state = {
  t, tick, timeLeft, dt,
  self: {
    id, team, slot, name, x, y, heading, vx, vy, speed, angVel,
    hp, maxHp, hpFrac, coreHp, coreMaxHp, coreFrac, mass, radius,
    energy, energyMax, energyRegen, energyFrac,
    shield, shieldMax, overshield, hovering, stunned (seconds left), burning (pieces on fire), sensor, tile ('floor' | 'mud' | ...),
    item: null | { type, charges }, effects: { overdrive, nitro } (seconds left),
    parts:   [{ i, type, x, y, z, dir, alive, burning, hp, maxHp, wx, wy }],     // wx, wy = world position of the piece's centre
    weapons: [{ i, type, dir, alive, ready, cooldown, angle, mountAngle, arc, range, minRange, projSpeed, dmg }],
  },
  allies:  [{ id, slot, name, alive, x, y, heading, vx, vy, speed, hpFrac, coreFrac, energyFrac, mass, radius, shield, burning, item, parts, ... }],
  enemies: [ same shape — ONLY enemies your team can currently see; parts[] shows their layout (with z) and damage ],
  enemiesAlive,                      // how many are left, seen or not
  lastSeen: [{ id, x, y, t, alive }],
  projectiles: [{ kind: 'bullet' | 'shell' | 'missile' | 'mortar' | 'hook', x, y, vx, vy, landsAt?, landsIn? }],  // enemy shots in sensor range, nearest first (max 24)
  mines: [{ x, y }],                 // enemy mines within 5 m (anywhere in sensor range with a radar)
  items: [{ id, type, x, y }],       // every pick-up currently on the map
  pads:  [{ x, y, charge }],
  zone:  { x, y, r, minR, startT, endT, shrinking },
  messages: [{ from: slot, id, data }],   // what teammates passed to \`say\` on their previous tick
  bombs:   [{ x, y, vx, vy, fuse, r }],   // kegs on the ground in sensor range, anybody's: where, how fast, seconds left, blast radius
  barrels: [{ x, y }],                    // powder barrels still standing in sensor range, nearest first (max 24)
  tethers: [{ from, to, length, taut, timeLeft }],   // harpoon cables: \`from\` is the vehicle that fired the hook
}
\`\`\`

\`weapons[].i\` and \`parts[].i\` are indexes into your blueprint's \`parts\` array. Decor is not listed.
\`state\` is built fresh for every tick and is yours alone: write on it if you like — nothing you change
reaches the engine, a teammate or the next tick.
A mortar shell in \`projectiles\` tells you where and when it lands — drive out of the circle.

## 5. What \`tick\` returns

\`\`\`
{
  throttle: -1..1,            // drive forward / backward
  steer:    -1..1,            // + = turn left (counter-clockwise)
  brake:     0..1,
  aim:   angle | { x, y },    // world angle, or a world point (every gun converges on it). Default: straight out of the mount.
  aims:  { [partIndex]: angle | { x, y } },   // per-weapon override
  fire:  true | [partIndex, ...],             // a gun only fires when its aim is inside its arc and it has finished traversing
  boost: 0..1 | { N, E, S, W },               // thrusters, by the direction they push. A number means the forward (N) ones.
  useItem: true,              // use the held item
  target: id,                 // missile lock (enemy id) and/or repair-arm priority (ally id)
  shield: false, repair: false, melee: false, // switch those systems off to save energy (default on); melee covers saws and pistons
  detonate: true | [partIndex, ...],          // set off your kegs (all, or those) where they sit
  jettison: [partIndex, ...],                 // let go of pieces (not the core): a keg is flung the way it faces and blows on the first other vehicle it reaches or when its fuse is up; anything else is just gone
  reel:  0..1,                                // wind in your harpoon cable
  release: true,                              // let go of whatever your harpoon holds
  say: anyJSON,               // ≤ ${R.sayLimit} chars; teammates read it next tick in state.messages
}
\`\`\`

The mortar lands its shell on the **point** you aim at, so give it \`{ x, y }\` (a bare angle drops the shell 12 m out).
Missing or invalid fields count as 0 / off (for a number, \`true\` counts as full). The command is read once,
when \`tick\` returns. If \`tick\` throws, the vehicle idles for that step and the match report quotes the
message with the line of your file; after ${R.maxViolations} exceptions the controller is cut off for the rest of
the match. A tick should take well under ${R.tickBudgetMs} ms; one that never returns forfeits the match.

### Helpers: \`api\`
* \`api.util.driveTo(self, point, { reverse, stopDist, speed })\` → \`{ throttle, steer, brake }\` pursuit controller.
* \`api.util.turnTo(self, angle)\` → \`{ throttle: 0, steer }\`.
* \`api.util.lead(from, target, projectileSpeed)\` → \`{ x, y, angle, t }\` intercept point (pass it as \`aim\`).
  \`target\` only needs \`x, y, vx, vy\`, so you can lead a single piece: \`{ x: part.wx, y: part.wy, vx: foe.vx, vy: foe.vy }\`.
* \`api.util.angDiff(a, b)\`, \`angleTo(from, to)\`, \`dist(a, b)\`, \`clamp(x, lo, hi)\`, \`blueprint(name, { deck, chassis }, { paint })\`.
* \`api.util.threat(state, margin = 1.2)\` → \`null\`, or \`{ x, y, r, in, away }\` for the keg or mortar shell whose blast you are in or
  nearly in: where, how big, in how many seconds, and a point just outside it to drive to (\`driveTo(self, t.away, { reverse: true })\`).
* \`api.nav.follower()\` → object with \`next(self, goalX, goalY, state.tick)\` returning the next waypoint of an A* route
  (cached, re-planned twice a second, sized to your hull, backs out when wedged). Keep one per controller.
* \`api.nav.path(x0, y0, x1, y1, { hover, margin, mudCost, iceCost, lavaCost })\` → waypoints.
* \`api.nav.los(x0, y0, x1, y1)\` (can a shot get through?), \`api.nav.clear(x0, y0, x1, y1, { margin, hover })\` (can I drive it?),
  \`api.nav.tileAt(x, y)\`, \`api.nav.isOpen(x, y, hover)\`, \`api.nav.clearance(x, y)\` → \`{ wall, pit }\` metres.
* \`api.map\` — \`{ id, w, h, tile, width, height, center, rows, spawns, itemSpawns, pads, items }\`.
* \`api.parts\`, \`api.items\`, \`api.tiles\`, \`api.rules\` — these tables, as data. \`api.rng()\` — seeded random in [0, 1). \`api.log(...)\` — shows up in match reports.

## 6. Teams

* A team entry is either one bot (it fills every slot) or one bot per slot — so squads can mix controllers from different authors.
* \`design\` may be a function: \`(ctx, api) => blueprint\` with \`ctx = { mode, teamSize, team, slot, budget, map, rules }\`.
  Use it to field a tank in slot 0 and a medic in slot 2, or a hover build on the map with pits.
* \`slot\` is your place in the team, counted from 0 in every mode. It is the same number in \`ctx\`, in \`init\`'s \`info\`,
  in \`state.self.slot\`, in \`allies[].slot\` and in \`messages[].from\`.
* \`say\` is the only channel between teammates. A common pattern: the lowest living slot is leader and says \`{ focus: enemyId }\`.
  A destroyed teammate says nothing: its last message is gone from \`state.messages\` the tick after it dies.
* Repair arms heal allies within range; \`target: allyId\` picks who, for as long as that ally has a damaged piece left
  to mend (destroyed pieces cannot be rebuilt). After that the arm goes back to whoever in range is worst off.

## 7. Workflow

With the MCP server (\`ironyard-mcp\`):

1. \`get_rules\`, \`list_parts\`, \`list_maps\` — the kit and the arenas.
2. \`validate_design\` until the blueprint is legal. Read its \`analysis\`: how much has to be shot away to reach your core
   from each side, which of your weapons and wheels are the first thing hit, which bearings no gun covers, damage per
   second by range, how many seconds of full fire your energy lasts, how far a fire can walk across the car.
3. \`submit_bot\`, then \`run_match\`. Every vehicle in the report has \`insights\` — up to six sentences on why the match
   went as it did, with the numbers in them — and \`telemetry\`: each weapon's shots, hits and damage and when it was
   lost; damage dealt and taken by vehicle, by weapon, by range band and (taken) by the side it came from; seconds at
   each range; seconds with a target in reach against seconds firing, and what kept the guns silent; seconds stuck;
   the first pieces lost and to what; hull, energy, distance and living weapons every two seconds. Your own
   \`api.log\` lines are there too. \`save_replay: true\` keeps the match: \`get_replay\` reads back the events of a time
   window or a trace of where everybody was.
4. \`evaluate_bot\` for a win-rate table over maps, seeds and both sides, and a \`diagnosis\` of what the losses have in
   common. \`scout_bot\` on whoever beats you: its design, its record by opponent and map, where it is thin.
5. \`leaderboard\` for where you stand; change the file, submit again under the same name, repeat.

Without MCP: \`node node/cli.js validate mybot.js\`, \`node node/cli.js match --a mybot.js --b rookie\`, \`node node/cli.js tournament\`.

Things that decide matches: whether your guns can actually bear (watch \`timeFireOutOfArc\`), what a shot meets before it
reaches your core (slopes and armor in front, on the deck), what a ram meets (the chassis), energy balance, not driving
into pits, and picking the fight your build wins — out-range brawlers, out-turn snipers, shove hover craft, shield
against missiles and mortars, saw through shields.

And the physical side: what on your vehicle burns and where the firebreaks are (\`validate_design\` reports the share of
fireproof pieces); where your kegs sit when somebody shoots them, and which way they face — forward is a torpedo,
backward a mine for whoever is chasing you; which way a blast or a punch will send you and what is behind you when it
does; whether you are the heavier end of a cable, and what the hook has bitten into: a cable pulled tight tears that
piece off, and everything only it was holding. A vehicle that has lost its wheels and
its guns is out, so there are more ways to win than drilling for the core — and more ways to lose.
`;
}
