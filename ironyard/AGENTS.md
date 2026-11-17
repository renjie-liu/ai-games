# Ironyard — rules and controller contract (engine 0.6.0)

Ironyard is a deterministic vehicle-combat arena. **You build the car and you write its brain.**
Before a match you hand in ONE JavaScript file containing a blueprint (which bricks go where, within a
budget) and a `tick` function (what the car does each decision step). The kit has wheels, tracks and hover pads,
guns, flamethrowers, harpoons, piston rams and powder kegs; things burn, blasts throw vehicles about, and some maps
are built of crates and barrels that do not stay where they are. Matches then run with no model
in the loop: same files + same seed = same result, every time.

Modes: `1v1`, `2v2`, `3v3`. A team wins by destroying every enemy core. Budget per vehicle:
light 800 / standard 1200 / heavy 1800 credits (default standard).

## 1. Your file

```js
// mybot.js — top-level names the engine looks for (the `export` keyword is optional and ignored)
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

function tick(state, api) {           // called at 20 Hz
  const foe = state.enemies[0];
  if (!foe) return { throttle: 1 };
  return { ...api.util.driveTo(state.self, foe), aim: foe, fire: true };
}
```

Rules for the file: plain JavaScript, one file, and only the language to work with. There is no
`require`, no network, no clock (`Date`, timers and the usual globals are undefined), and the word
`import` may not appear anywhere in the file, not even in a comment. `Math.random` is replaced by a
seeded generator. Your code runs when `init` and `tick` are called and at no other time: a promise
never resolves, so do not `await`. Keep state in top-level variables — every vehicle gets its own
private copy of your file, so teammates do **not** share variables; use `say` (section 6) to coordinate.

## 2. Building the vehicle

The kit works like a box of bricks: a stud grid, two layers that stack, and pieces of different sizes.

* **Stud grid:** 9 studs wide by 11 long, one stud = 0.4 m. Coordinates are integers,
  `x ∈ [-4, 4]`, `y ∈ [-5, 5]`. **`y+` is the FRONT, `x+` is the RIGHT side.**
* **Two layers:** `z: 0` is the **chassis** (running gear, floor, rams), `z: 1` is the **deck** (cockpit, turrets,
  superstructure). Each piece says which layer it may go on. A piece listed as "either layer" needs an explicit `z`.
* **Multi-stud pieces:** a piece covers `studs` = across x along (when facing N). `x, y` is the **lowest-x, lowest-y
  stud** of its footprint. `dir` (`'N'` front, `'E'` right, `'S'` rear, `'W'` left) turns it; E/W swap the footprint.
  Wheels and tracks always run lengthwise.
* **Stacking:** every deck piece needs at least one stud on top of a chassis piece (overhang is fine).
* **Connection:** exactly one `core`; every piece must reach it through pieces that touch edge-to-edge on a layer or sit on top of each other.
* **Clear lane:** on its own layer, every stud in front of a gun, saw, spike or plow (along `dir`, out to the grid edge)
  must be empty. Thrusters need the studs *behind* them empty. On the deck, **low** pieces (plates, slopes, tiles, radar,
  spoiler) do not block — so a slope in front of a turret is legal, and it takes the hit first.
* **Budget:** total cost ≤ budget. Up to 8 decor pieces are free and weightless.
* **Paint:** `paint: { accent }` picks the trim colour (white, black, grey, yellow, lime, red, azure, purple, pink, sand). The hull is always your team colour.

What happens under fire:

* Each piece has its own hp. At 0 it breaks off and its function is gone. Anything no longer connected to
  the core falls off with it. The vehicle dies when the core dies — or 3 s after it has nothing left that
  moves it (wheels, tracks, hover pads, thrusters) and nothing left that can hurt (guns, flamers, harpoons, saws,
  pistons, spikes, plows, kegs): a hull like that is a wreck.
* **Shots, beams and blasts hit the deck piece of a stud column first**, then the chassis piece under it.
  **Rams, saws and mines hit the chassis piece first.** A shot travelling across the vehicle hits whatever column it enters first —
  whether what stands there is on the deck or only on the chassis. (`low` in the tables is about your own firing lanes only: a deck
  gun shoots over a low deck piece in front of it. To an incoming shot a low piece is a piece like any other.)
* Slopes: a kinetic or explosive hit arriving against the slope's facing (within 60°) only does 45%.
* **What a hit is worth** after the piece it lands on has had its say (armor takes 2 off every kinetic or explosive hit, never
  more than three quarters of it; a slope struck on its face lets 45% through and then takes 1 off). Lasers, flame and saws are not reduced by either.
  A mortar round comes down from above and the splash of any burst has no direction: a slope's face deflects neither. Nor does it turn
  a rail slug, which only loses the slope's armor point:

| weapon | one hit | on a plain piece | on armor | on a slope, face on | on a slope, from elsewhere |
|---|---|---:|---:|---:|---:|
| mg | 4 kinetic | 4 | 2 | 0.8 | 3 |
| cannon | 30 kinetic | 30 | 28 | 12.5 | 29 |
| railgun | 90 kinetic | 90 | 88 | 89 | 89 |
| missile | 28 x2 explosive | 28 | 26 | 11.6 | 27 |
| mortar | 46 explosive | 46 | 44 | 45 | 45 |

* **A blast** — a mortar shell, a keg, a barrel, a mine, the splash of a shell or a missile — reaches the stud columns within its radius and
  hurts the top piece of each (a mine, from below: the bottom piece), nearest first, as many pieces as the tables give. The piece at the
  centre takes the full damage, one at the edge about a third of it. So where a shell lands on a car matters: lay it on the stud whose
  neighbours are worth most.
* **Range** is the distance a shot flies from the muzzle. Shots do not inherit their shooter's speed: running away does not lengthen your reach, nor chasing shorten it.
* Decor is not solid: shots pass through it, and it is shaken off when the piece under it takes 20 damage.
* **Fire.** Every piece has heat. Flamethrowers and lava raise it steadily. Every blast raises it too: the burst of a cannon shell, a missile or a
  mortar round gives each piece it damages up to 0.35 heat (times that piece's `burn`, less towards the edge of the burst), so three
  or four bursts on the same plates light them, and the blast of a keg or a barrel lights everything in reach that burns at once. At heat 1 a piece
  that burns catches fire. It then loses 5 hp/s for 5 s (armor does not help) and heats every piece touching
  it by 0.4/s, so the fire walks across the vehicle. A piece burns once. The tables say what burns: plates, bricks,
  wheels and most equipment do; armor, slopes, tracks, spikes, plows, pistons and the core do not, so a row of them is a
  firebreak. A fire is put out by parking on a repair pad, by a repair kit, by a repair arm (it goes for burning pieces
  first), or by letting go of the piece (`jettison`). A keg that catches fire goes off.

**Structure & defence**

| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |
|---|---|---|---|---|---|---|---|---|
| `core` | @ | 1x1 | 0 | 20 | 550 | either layer | +100 energy cap, +5 energy/s, sensor 22 m, max 1, fireproof | The cockpit. Exactly one per vehicle; when it dies the vehicle dies. Pieces no longer connected to it fall off. |
| `plate` | p | 1x1 | 6 | 3 | 45 | either layer, low | burns | Thin cheap plate. On the chassis it carries things; on the deck it is flat enough to shoot over. |
| `plate2` | q | 1x2 | 10 | 5 | 85 | either layer, low | burns | Two studs of plate in one piece: cheaper per stud, but it is lost as a unit. |
| `plate4` | Q | 2x2 | 18 | 9 | 160 | either layer, low | burns | Four studs of plate in one piece. Fast, cheap floor — and one big thing to lose. |
| `brick` | b | 1x1 | 9 | 4 | 70 | either layer | burns slowly | Full-height brick. Tougher than plate; on the deck it blocks firing lanes. |
| `brick2` | B | 1x2 | 16 | 7 | 130 | either layer | burns slowly | Two-stud brick. |
| `armor` | a | 1x1 | 26 | 13 | 200 | either layer | armor 2, fireproof | Heavy brick. Subtracts 2 from every kinetic/explosive hit (min 25% gets through), so it halves machine-gun fire. Lasers, saws and burn ignore it. |
| `armor2` | A | 1x2 | 48 | 24 | 380 | either layer | armor 2, fireproof | Two-stud armor brick. Stagger them like a brick wall. |
| `slope` | / | 1x1 | 30 | 9 | 150 | either layer, low, dir | armor 1, frontal shots x0.45, fireproof | Wedge that faces `dir`. Shots arriving against its face only do 45% (ricochet). Low: guns behind it fire over it. |
| `plow` | P | 3x1 | 95 | 34 | 520 | chassis, dir, clear lane | armor 1, ram dealt x1.3, taken x0.3, fireproof | Three-stud-wide ram blade. Takes 30% collision damage and shoves whatever it hits 60% harder. Must face an open edge. |

**Mobility & steering**

| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |
|---|---|---|---|---|---|---|---|---|
| `wheel` | o | 1x1 | 30 | 6 | 70 | chassis | 380 N drive, grip 1, burns | Drive wheel. Left/right placement gives differential steering: the wider apart, the faster you turn. Bogs in mud, slides on ice. |
| `bigwheel` | O | 1x2 | 58 | 13 | 160 | chassis, always lengthwise | 660 N drive, grip 1.25, burns | Two studs long. Nearly twice a wheel, tougher, and it keeps 75% traction in mud. |
| `track` | T | 1x3 | 125 | 34 | 380 | chassis, always lengthwise | 1080 N drive, grip 1.6, fireproof | Three studs of all-terrain drive. Almost ignores mud, keeps some grip on ice, hard to shove sideways. |
| `hover` | h | 1x1 | 50 | 5 | 50 | chassis | 210 N drive, grip 0.22, lift 75 kg, 1.2 energy/s, burns slowly | Lifts 75 kg each. If total lift >= vehicle mass (and energy > 0) you float: immune to mud/ice/pits/mines, lava hurts 75% less — but you drift and are easy to shove. |
| `thruster` | J | 1x1 | 55 | 5 | 45 | either layer, dir, clear exhaust | 1000 N thrust, 16 energy/s, burns slowly | Burst rocket, pushes the vehicle toward `dir`. Works on any terrain. Needs clear exhaust: nothing tall behind it on its own layer. |
| `gyro` | g | 1x1 | 45 | 5 | 50 | either layer | 300 N·m steering torque, burns slowly | Adds 300 N·m of steering torque regardless of wheels or terrain. |
| `blower` | w | 1x1 | 60 | 6 | 50 | deck | +14% drive force, max 2, burns slowly | Blower through the hood: +14% force from every wheel, track and hover pad. Up to two. |
| `spoiler` | W | 3x1 | 40 | 5 | 60 | deck, low | +60% side grip, max 1, burns | Downforce: +60% side grip, so fast light cars stop sliding wide. Low piece. |

**Weapons**

| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |
|---|---|---|---|---|---|---|---|---|
| `mg` | m | 1x1 | 70 | 6 | 90 | deck, dir, clear lane | 4 dmg / 0.125s (32 dps), range 13 m, arc ±50°, traverse 5 rad/s, shot speed 28 m/s, 0.7 energy/shot, kinetic, burns slowly | Wide-arc turret, 32 dps. Shreds plates and wheels; armor halves it. |
| `cannon` | C | 1x2 | 110 | 13 | 170 | deck, dir, clear lane | 30 dmg / 1.6s (19 dps), range 19 m, arc ±20°, traverse 2.2 rad/s, shot speed 24 m/s, 9 energy/shot, splash 0.75 m x0.3, recoil 100 N·s, kinetic, burns slowly | Slow heavy shell with small splash. Narrow arc: point the car. |
| `railgun` | R | 1x3 | 170 | 16 | 160 | deck, dir, clear lane | 90 dmg / 4s (23 dps), range 24 m, arc ±8°, traverse 1.2 rad/s, instant hit, 30 energy/shot, goes through 3 pieces, slopes do not turn it, recoil 220 N·s, kinetic, burns slowly | Instant-hit sniper, three studs long. Punches through 3 pieces (each takes half of the one before) and a slope does not turn its slug. Nearly fixed mount, hungry for energy. |
| `laser` | L | 1x1 | 120 | 8 | 90 | deck, dir, clear lane | 22 dps beam, range 10 m, arc ±35°, traverse 4 rad/s, instant hit, 11 energy/s, energy, burns slowly | Continuous beam that ignores armor and slopes. Short range and drains energy fast. |
| `missile` | M | 2x2 | 170 | 15 | 200 | deck, dir, clear lane | 28 dmg x2 / 3.8s (15 dps), range 32 m, arc ±60°, traverse 6 rad/s, shot speed 13 m/s, 16 energy/shot, splash 1 m x0.5, recoil 40 N·s, explosive, burns slowly | Fires two homing missiles with splash. A missile steers for its target only while your team can see it (in sensor range, or in the 1.5 s after it fires): out of sight it flies on straight, so a radar is what makes the full range usable. Slow enough to dodge behind walls. |
| `mortar` | N | 2x2 | 150 | 18 | 160 | deck, dir | 46 dmg / 4s (12 dps), range 6-24 m, arc 360°, traverse 2.5 rad/s, shot speed 15 m/s, 14 energy/shot, blast 2 m, up to 7 pieces, recoil 150 N·s, explosive, burns slowly | Lobs a shell OVER walls to the point you aim at (give `aim` as {x, y}). 2 m blast. Cannot hit closer than 6 m; needs no clear lane. |
| `saw` | S | 1x1 | 60 | 10 | 120 | chassis, dir, clear lane | 60 dps on contact, 4 energy/s while cutting, burns slowly | Grinds any enemy piece it touches for 60 dps. Ignores armor and shields, eats the chassis first. |
| `spike` | V | 1x1 | 28 | 7 | 160 | chassis, dir, clear lane | ram dealt x3, taken x0.25, fireproof | Collisions through this stud deal x3 damage and you take only 25% back. |
| `flamer` | Y | 1x1 | 100 | 9 | 90 | deck, dir, clear lane | 3.5 dps to each piece in a ±15° stream, heats them 1/s (a piece catches fire at heat 1), range 5.5 m, arc ±40°, traverse 4 rad/s, instant hit, 9 energy/s, fire, burns slowly | Short stream of fire. The stream itself does little: it heats every piece it washes over until they catch fire, and fire spreads from piece to piece. Armor, tracks and cores do not burn. Shields keep it off. |
| `harpoon` | H | 1x2 | 90 | 10 | 120 | deck, dir, clear lane | 10 dmg / 6s (2 dps), range 11 m, arc ±30°, traverse 3 rad/s, shot speed 32 m/s, 10 energy/shot, cable holds 7 s, reels in 3 m/s down to 1.5 m, pulled tight it tears the hooked piece at 45 hp/s, kinetic, burns slowly | Fires a hook on a cable. If it bites, the two vehicles are tied together for up to 7 s: neither gets further from the other than the cable is long, and `reel` winds it in at 3 m/s. The heavier one, or the one with more grip, decides where both go. While the cable is pulled tight it works the piece it bit into loose at 45 hp/s (armour a quarter of that): held, the piece comes off, with whatever only it was holding on. `release` lets go. A shield turns the hook away. |
| `piston` | U | 1x1 | 70 | 12 | 150 | chassis, dir, clear lane | 24 dmg and 1300 N·s per punch, reach 0.75 m, 2.4 s to reset, 14 energy/punch, fireproof | Punches whatever is right in front of it: 24 damage and a 1300 N·s shove — a 250 kg car leaves at 5 m/s — with the same shove back on you. Fires by itself when an enemy, a crate or a rolling bomb is in reach (`melee: false` holds it). |
| `keg` | K | 1x1 | 40 | 8 | 110 | either layer, dir | blast 70 dmg, 3.2 m, up to 8 pieces per vehicle, let go, it is flung 8 m/s the way it faces and goes off on the first other vehicle it reaches, or after 2 s, max 4, burns | A bomb you carry. `detonate` sets it off where it sits; `jettison` flings it the way it faces, 8 m/s faster than you were going: it rolls about 10 m, and goes off against the first other vehicle it reaches or after 2 s. Facing forward it is a torpedo, facing back a mine for whoever is chasing. Either way the blast hits everything within 3.2 m, you and your team included, throws it back and sets it alight — and anything that destroys the keg, or sets it on fire, sets it off. |

**Utility**

| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |
|---|---|---|---|---|---|---|---|---|
| `battery` | e | 1x1 | 35 | 9 | 60 | either layer | +140 energy cap, burns | +140 energy capacity. |
| `reactor` | r | 1x1 | 75 | 12 | 70 | either layer | +20 energy cap, +8 energy/s, burns slowly | +8 energy/s. Volatile: when destroyed it blasts every piece touching it (sides, above, below) for 35. |
| `radar` | d | 1x1 | 40 | 3 | 35 | deck, low | sensor +16 m, max 1, burns slowly | +16 m sensor range (shared with the team) and reveals enemy mines. |
| `shieldgen` | G | 1x1 | 130 | 12 | 70 | deck | 240 shield, +16/s after 2.5s, 2.5 energy/s, max 1, burns slowly | Bubble that absorbs 240 damage from shots, beams, flame and every blast from outside it — shells, missiles, mortar rounds, powder kegs, barrels, mines — recharging after 2.5 s without a hit. A blast it soaks still shoves you. Rams, saws, pistons, fire already burning, and a keg that goes off while still bolted to you go straight through. |
| `repairer` | + | 1x1 | 90 | 8 | 50 | deck | 9 hp/s heal within 5 m, 6 energy/s, max 2, burns slowly | Heals the most damaged piece on you or an ally within 5 m for 9 hp/s. Cannot rebuild destroyed pieces. |

**Decor (free)**

| type | glyph | studs | cost | mass kg | hp | placement | numbers | notes |
|---|---|---|---|---|---|---|---|---|
| `tile` | t | 1x1 | 0 | 0 | 20 | deck, low |  | Smooth tile in your accent colour. |
| `fin` | f | 1x1 | 0 | 0 | 20 | deck, low, dir |  | A fin. It does nothing and looks fast. |
| `pipe` | i | 1x1 | 0 | 0 | 20 | deck, low |  | Twin chrome stacks. |
| `lamp` | l | 1x1 | 0 | 0 | 20 | deck, low, dir |  | Glowing lamps facing `dir`. |
| `flag` | F | 1x1 | 0 | 0 | 20 | deck, low |  | Antenna with a pennant in your accent colour. |

ASCII shortcut — the same two pictures the tools print back to you:

```js
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
```

Tokens: `.` empty, `:` rest of a multi-stud piece, otherwise the glyph plus an optional arrow `^ > v <` for its direction.

### How the numbers turn into motion

* **Drive:** each wheel/track pushes along the hull's forward axis with `force x command`, where the
  command is `throttle - steer` for movers left of the centre of mass and `throttle + steer` for
  movers right of it (clamped to ±1; reverse is 70% as strong). Movers on the centreline only push.
  Steering torque = force x sideways distance from the centre of mass, plus gyros (the core has a 60 N·m one).
  Wider wheelbase or gyros = faster turning; heavy, long hulls turn slowly.
* **Speed:** acceleration = force / mass against drag `0.6·v + 0.08·v²`. `validate_design` reports the
  resulting top speed, turn rate and weight class, so you do not need to do the algebra.
* **Grip:** wheels kill sideways sliding (rate 5/s x grip). Hover pads barely do. No working movers = belly on the ground.
* **Centre of mass** is computed from the pieces that are still attached; lose a wheel and the car pulls to one side.
* **Hover:** if total lift ≥ current mass and you have energy, the vehicle floats (see terrain). Only hover pads push while floating.
* **Energy:** capacity and regen come from core, batteries and reactors. Guns, lasers, saws, thrusters, hover pads,
  shields and repair arms draw from it; whatever cannot be paid for simply does not work that tick. Wheels and tracks are free.
* **Collisions:** rigid-body impulses, one circle per occupied stud. Damage = collision energy x 0.014 to the two pieces that touch
  (only above 1.5 m/s closing speed, never between teammates), scaled by each piece's ram multipliers, and 30% of it again
  to every piece touching the one that was hit. Mass and speed push people around.
* **Everything shoves.** A blast throws each vehicle in it away from its centre with 14 N·s per point of damage (a 46-damage
  mortar shell: 644 N·s, which is 2.6 m/s for a 250 kg car — and more for a hover craft). A shell, bullet or
  slug pushes what it hits with 2.5 N·s per point. Cannons, railguns, mortars and missile pods kick their own vehicle
  straight back when they fire (the tables give the recoil). Near a hole, that is how you leave.

## 3. The arena

Physics runs at 60 Hz, your `tick` every 3 ticks. A match lasts at most 150 s.
World units are metres; `x` grows east, `y` grows north; angles are radians, counter-clockwise, 0 = east.
One map tile is 2 m.

| tile | char | effect |
|---|---|---|
| `floor` | `.` | Normal ground. |
| `wall` | `#` | Blocks vehicles, shots and beams. Mortar shells fly over. |
| `barrier` | `-` | Blocks vehicles only; shots fly over. |
| `pit` | `_` | Centre of mass over a pit = instant elimination, unless hovering. |
| `mud` | `m` | Wheels lose 60% traction (monster wheels 25%), tracks 15%. Hover ignores it. |
| `ice` | `i` | Almost no side grip and 65% less traction for wheels (tracks cope better). |
| `lava` | `L` | Every piece takes 12 hp/s (3 hp/s while hovering). |
| `pad` | `+` | Park on it (speed < 2 m/s) to heal 25 hp/s from a 150 hp pool that refills at 6 hp/s. Puts out fires. |
| `crate` | `x` | A wall you can break: 150 hp. Shots, blasts, fire, pistons and driving into it at speed all count. Gone, it is floor. |
| `barrel` | `!` | Blocks the way until something touches it off: 40 hp, then a blast that hits everything within 3 m, shoves it and sets it alight. Barrels set each other off. |
| `smoke` | `s` | A vehicle whose centre is in smoke is seen only from within 7 m, whatever the sensors — until it fires, which gives it away for 1.5 s as anywhere. A missile stops steering for a target it cannot see. Smoke stops no shot, slows nobody, and hides nothing that lies on the ground (mines, kegs, barrels). |
| `turbo` | `=` | Wheels, tracks and hover pads push 50% harder while the vehicle is on it. A fast lane for a flank or a getaway. |

Off the edge of the map counts as a pit.

* **Safe zone:** from t=85s to t=138s a circle centred on the map shrinks to 7 m radius (some maps differ: read `state.zone`).
  Outside it every piece takes 10 hp/s.
* **Vision:** you see an enemy if it is within the sensor range of any living teammate (core 22 m, radar +16 m),
  or for 1.5s after it fires a gun. Walls do not block vision. Smoke does: a vehicle whose centre is on a smoke tile is seen only from within 7 m, until it fires. `state.lastSeen` remembers where each enemy was — until one of your team is within 7 m of that spot and the enemy is not to be seen: it has gone, and the entry is dropped until it is seen again. An enemy that dies is always listed, with `alive: false`.
* **Friendly fire is off** for guns, flamethrowers, saws, pistons and hooks: shots and their splash pass through
  teammates. You can still bump into them. **Powder kegs and barrels are the exception**: their blasts hit everyone in
  reach, a teammate sets off a rolling keg by touching it, and nothing done to your own side counts as damage dealt.
* **Timeout:** more vehicles alive wins; then more total hull fraction remaining (a lead of less than half a percent of a hull
  counts as level); then more damage dealt (by more than 1 hp); else a draw.
* **Crates and barrels** are tiles with hit points. A crate is a wall until it is broken; a barrel explodes when it is,
  a tenth of a second later, so a row of them goes off one after another. Shots, beams, blasts, fire, pistons and
  collisions (x3, and more through a spike or plow) all damage them. `api.nav` always answers for the map as it is
  now, and `state.barrels` lists the barrels still standing near you.

### Items
Pick-ups appear on the map's `*` spots at t=8s and again 14s after being taken. Drive over one to take it.
Mirrored spots start with the same item type; after that each spot moves on to its next item when its own is taken.

| item | kind | effect |
|---|---|---|
| `repair` | instant | Instantly restores 35% of max HP to every damaged (not destroyed) piece. |
| `shield` | instant | +100 temporary shield for 12 s, even without a generator. |
| `overdrive` | instant | Everything your guns, flamethrowers, saws and pistons deal x1.5 for 8 s. Not powder kegs, rams or fire once it has caught. |
| `nitro` | instant | Drive and thruster force x1.6 for 6 s. |
| `mine` | held | Held, 2 charges. `useItem` drops one behind you; it arms in 0.8 s and blasts the first enemy that drives over it (chassis first). |
| `emp` | held | Held, 1 charge. `useItem` stuns every enemy within 7 m for 2.2 s, drops their shields and drains 40 energy. |

A vehicle holds one item at a time (a new held item replaces the old one). Mines do not trigger on hovering vehicles.
A repair kit also puts out every fire on the vehicle.

### Maps
Each map is point-symmetric. `A B C` / `a b c` are the three spawn points of team 0 / team 1: 3v3 fills them in
slot order, 1v1 uses the centre one (`A`), 2v2 puts slot 0 on `B` and slot 1 on `C`. With `swap` the teams trade
sides. Row 0 is the north edge.

### `proving` — Proving Ground (28x28 tiles = 56x56 m)
Walled open arena with pillars, two low barriers and a mud patch in the middle. The fair default. Items: repair, overdrive, shield, nitro, mine, emp.

```
############################
#..........................#
#............A.............#
#.....B..............C.....#
#..........................#
#..........................#
#............*.............#
#......##..........##......#
#......##..........##......#
#.*......................*.#
#............##............#
#..---................---..#
#...........mmmm...........#
#...........mmmm...........#
#...........mmmm...........#
#...........mmmm...........#
#..---................---..#
#............##............#
#.*......................*.#
#......##..........##......#
#......##..........##......#
#.............*............#
#..........................#
#..........................#
#.....c..............b.....#
#.............a............#
#..........................#
############################
```

### `sumo` — Sumo Deck (20x20 tiles = 40x40 m)
Floating platform, no walls. An ice ring and a hole in the centre. Push them off — or hover. Items: nitro, shield, emp, repair.

```
____________________
___..............___
__.......A........__
_....B........C...._
_.................._
_.................._
_.....iiiiiiii....._
_.....i..*...i....._
_.*...i......i...*._
_.....i..__..i....._
_.....i..__..i....._
_.*...i......i...*._
_.....i...*..i....._
_.....iiiiiiii....._
_.................._
_.................._
_....c........b...._
__........a.......__
___..............___
____________________
```

### `canyon` — Canyon (36x28 tiles = 72x56 m)
Three lanes split by rock walls. Long sightlines down the middle, mud in the centre choke, pillars to hide behind. Items: repair, overdrive, shield, mine, emp, nitro.

```
####################################
#..................................#
#.......B........A.........C.......#
#..................................#
#..................................#
#..########...########...########..#
#..........#............#..........#
#..........#.....*......#..........#
#.*........#............#........*.#
#..........#...mmmmmm...#..........#
#....##....#...mmmmmm...#....##....#
#....##........mmmmmm........##....#
#............--..*...--............#
#..................................#
#..................................#
#............--...*..--............#
#....##........mmmmmm........##....#
#....##....#...mmmmmm...#....##....#
#..........#...mmmmmm...#..........#
#.*........#............#........*.#
#..........#......*.....#..........#
#..........#............#..........#
#..########...########...########..#
#..................................#
#..................................#
#.......c.........a........b.......#
#..................................#
####################################
```

### `frostbite` — Frostbite (30x30 tiles = 60x60 m)
A frozen lake fills the middle with a dry island at its heart; holes in the corners. Wheels slide, tracks and hover shine. Items: nitro, repair, overdrive, shield, emp, mine.

```
##############################
#___......................___#
#_............A............._#
#_.....B..............C....._#
#............................#
#............................#
#.....###............###.....#
#............................#
#.......iiiiiiiiiiiiii.......#
#.......iiiiii*iiiiiii.......#
#.*.....iiiiiiiiiiiiii.....*.#
#.......iiiiiiiiiiiiii.......#
#.......iiiiiiiiiiiiii.......#
#.......iiiii....iiiii.......#
#.......ii*ii.#..iiiii.......#
#.......iiiii..#.ii*ii.......#
#.......iiiii....iiiii.......#
#.......iiiiiiiiiiiiii.......#
#.......iiiiiiiiiiiiii.......#
#.*.....iiiiiiiiiiiiii.....*.#
#.......iiiiiii*iiiiii.......#
#.......iiiiiiiiiiiiii.......#
#............................#
#.....###............###.....#
#............................#
#............................#
#_.....c..............b....._#
#_.............a............_#
#___......................___#
##############################
```

### `foundry` — Foundry (34x30 tiles = 68x60 m)
Lava pools with crossings between them and repair pads in the back corners. Items: repair, shield, overdrive, mine, emp, nitro.

```
##################################
#+..............................+#
#.......B.......A........C.......#
#................................#
#................................#
#.............######.............#
#...LLLL..................LLLL...#
#...LLLL..................LLLL...#
#...LLLL........*.........LLLL...#
#...........LLL....LLL...........#
#*..........LLL....LLL..........*#
#.......##..LLL....LLL..##.......#
#.......##..............##.......#
#.....*......LLLLLLLL............#
#............LLLLLLLL............#
#............LLLLLLLL............#
#............LLLLLLLL......*.....#
#.......##..............##.......#
#.......##..LLL....LLL..##.......#
#*..........LLL....LLL..........*#
#...........LLL....LLL...........#
#...LLLL.........*........LLLL...#
#...LLLL..................LLLL...#
#...LLLL..................LLLL...#
#.............######.............#
#................................#
#................................#
#.......c........a.......b.......#
#+..............................+#
##################################
```

### `skybridge` — Skybridge (32x24 tiles = 64x48 m)
Islands over the void joined by bridges. One slip and you are gone; hover craft take the shortcut. Items: nitro, shield, emp, repair, overdrive.

```
________________________________
________................________
________..B....A.....C..________
____........................____
____........................____
____..__................__..____
____..________....________..____
____..________....________..____
__......______....______......__
__.*....__............__....*.__
__..........-..*...-..........__
__............................__
__............................__
__..........-...*..-..........__
__.*....__............__....*.__
__......______....______......__
____..________....________..____
____..________....________..____
____..__................__..____
____........................____
____........................____
________..c.....a....b..________
________................________
________________________________
```

### `bog` — Bog Fort (42x32 tiles = 84x64 m)
Big team map: mud fields, low barrier forts to shoot over, pits on the flanks, repair pads in the centre. Items: repair, shield, overdrive, nitro, mine, emp.

```
##########################################
#........................................#
#........B..........A..........C.........#
#........................................#
#........................................#
#........................................#
#.....----..mmmmmm......mmmmmm..----.....#
#.....-.....mmmmmm..*...mmmmmm.....-.....#
#.....-.....mmmmmm......mmmmmm.....-.....#
#.*.........mmmmmm##..##mmmmmm.........*.#
#.................##..##.................#
#........................................#
#..###..............................###..#
#__...........mmmmmmmmmmmmmm...........__#
#__.......*...mmmmmmmmmmmmmm...........__#
#__...........mmmmmm++mmmmmm...........__#
#__...........mmmmmm++mmmmmm...........__#
#__...........mmmmmmmmmmmmmm...*.......__#
#__...........mmmmmmmmmmmmmm...........__#
#..###..............................###..#
#........................................#
#.................##..##.................#
#.*.........mmmmmm##..##mmmmmm.........*.#
#.....-.....mmmmmm......mmmmmm.....-.....#
#.....-.....mmmmmm...*..mmmmmm.....-.....#
#.....----..mmmmmm......mmmmmm..----.....#
#........................................#
#........................................#
#........................................#
#.........c..........a..........b........#
#........................................#
##########################################
```

### `depot` — Powder Depot (32x28 tiles = 64x56 m)
A yard stacked with crates and powder barrels. Crates are walls until somebody breaks them; a barrel takes everything near it along. Shoot the barrel, not the car beside it. Items: repair, shield, overdrive, nitro, mine, emp.

```
################################
#..............................#
#......B.......A........C......#
#..............................#
#..............................#
#...xxxxx....xxxxxx....xxxxx...#
#.....!........!!........!.....#
#..............................#
#.*......##....*.....##......*.#
#........##...xxxx...##........#
#..............................#
#..!...........*............!..#
#.....xxx..xx......xx..xxx.....#
#..........xx!.!...xx..........#
#..........xx...!.!xx..........#
#.....xxx..xx......xx..xxx.....#
#..!............*...........!..#
#..............................#
#........##...xxxx...##........#
#.*......##.....*....##......*.#
#..............................#
#.....!........!!........!.....#
#...xxxxx....xxxxxx....xxxxx...#
#..............................#
#..............................#
#......c........a.......b......#
#..............................#
################################
```

### `cage` — Scrap Cage (18x18 tiles = 36x36 m)
A small walled cage: the teams start 26 m apart with nowhere to run. Crates for cover, powder barrels between the two sides, one repair pad in the middle to fight over. Items: repair, overdrive, shield, emp.

```
##################
#................#
#...B...A....C...#
#................#
#................#
#..xx........xx..#
#.......!!.......#
#.*............*.#
#.......++.......#
#.......++.......#
#.*............*.#
#.......!!.......#
#..xx........xx..#
#................#
#................#
#...c....a...b...#
#................#
##################
```

### `saltflat` — Salt Flat (44x32 tiles = 88x64 m)
Wide open and almost bare: two low barriers, one pillar, a mud wallow in the middle and a speed strip down each flank. Whoever sees further and shoots further has the first word; speed has the last. Items: repair, shield, overdrive, nitro, mine, emp.

```
############################################
#..........................................#
#....................A.....................#
#..........B....................C..........#
#.==....................................==.#
#.==....................................==.#
#.==....................................==.#
#.==.................*..................==.#
#.==....................................==.#
#.==......---..................---......==.#
#.==....................................==.#
#.==.................##.................==.#
#.==.*................................*.==.#
#.==....................................==.#
#.==.........*.....mmmmmm...............==.#
#.==...............mmmmmm...............==.#
#.==...............mmmmmm...............==.#
#.==...............mmmmmm.....*.........==.#
#.==....................................==.#
#.==.*................................*.==.#
#.==.................##.................==.#
#.==....................................==.#
#.==......---..................---......==.#
#.==....................................==.#
#.==..................*.................==.#
#.==....................................==.#
#.==....................................==.#
#.==....................................==.#
#..........c....................b..........#
#.....................a....................#
#..........................................#
############################################
```

### `causeway` — Causeway (36x28 tiles = 72x56 m)
A chasm cuts the map in two. One broad bridge in the middle with powder barrels at its mouth, a narrow one on each flank behind a crate. Shots cross the gap freely; wheels have to pick a bridge, hover craft do not. Items: repair, shield, overdrive, mine, emp, nitro.

```
####################################
#..................................#
#.......B........A.........C.......#
#..................................#
#..................................#
#..................................#
#.*..............*...............*.#
#........###............###........#
#..................................#
#..................................#
#...xxx.......!......!.......xxx...#
#..................................#
#___...________-..*.-________...___#
#___...________-....-________...___#
#___...________-....-________...___#
#___...________-.*..-________...___#
#..................................#
#...xxx.......!......!.......xxx...#
#..................................#
#..................................#
#........###............###........#
#.*...............*..............*.#
#..................................#
#..................................#
#..................................#
#.......c.........a........b.......#
#..................................#
####################################
```

### `labyrinth` — Rat Run (30x30 tiles = 60x60 m)
Corridors six metres wide, walls everywhere, crates plugging the short cuts and smoke over the crossroads in the middle. Nothing here is a long shot: mortars lob over the walls, everything else meets round a corner. Items: repair, shield, overdrive, mine, emp, nitro.

```
##############################
#............................#
#......B......A.......C......#
#............................#
#............................#
#...########......########...#
#...#....................#...#
#.*.#.........*..........#.*.#
#...#....................#...#
#xxx#....#####xx#####....#xxx#
#........#..........#........#
#........#..........#........#
#.....*..#..ssssss..#........#
#...........ssssss...........#
#...........ssssss...........#
#...........ssssss...........#
#...........ssssss...........#
#........#..ssssss..#..*.....#
#........#..........#........#
#........#..........#........#
#xxx#....#####xx#####....#xxx#
#...#....................#...#
#.*.#..........*.........#.*.#
#...#....................#...#
#...########......########...#
#............................#
#............................#
#......c.......a......b......#
#............................#
##############################
```

### `fogbank` — Fogbank (32x28 tiles = 64x56 m)
Three banks of smoke with a few pillars between them. A car in the smoke is seen only from seven metres, so the long guns are blind until something fires: ambush country. Items: repair, shield, overdrive, nitro, mine, emp.

```
################################
#..............................#
#......B.......A........C......#
#..............................#
#...........--....--...........#
#..............*...............#
#...ssssssss........ssssssss...#
#...ssssssss...##...ssssssss...#
#...ssssssss...##...ssssssss...#
#.*.ssssssss........ssssssss.*.#
#...ssssssss........ssssssss...#
#............ssssss............#
#......##....ss*sss....##......#
#............ssssss............#
#............ssssss............#
#......##....sss*ss....##......#
#............ssssss............#
#...ssssssss........ssssssss...#
#.*.ssssssss........ssssssss.*.#
#...ssssssss...##...ssssssss...#
#...ssssssss...##...ssssssss...#
#...ssssssss........ssssssss...#
#...............*..............#
#...........--....--...........#
#..............................#
#......c........a.......b......#
#..............................#
################################
```

### `ringroad` — Ring Road (36x30 tiles = 72x60 m)
A circuit round a lava infield: speed strips on the straights, ice in the corners, and one crossing through the middle with a repair pad on it. Fights go round and round, or meet head-on in the crossing. Items: nitro, repair, shield, overdrive, emp, mine.

```
####################################
#iiii..........................iiii#
#iiii....B.......A........C....iiii#
#iiii..........................iiii#
#iiii..........................iiii#
#...============================...#
#...============================...#
#...==...........*............==...#
#...==........................==...#
#.*.==.#..LLLLLL....LLLLLL..#.==.*.#
#...==.#..LLLLLL....LLLLLL..#.==...#
#...==.#..LLLLLL.*..LLLLLL..#.==...#
#...==....LLLLLL....LLLLLL....==...#
#...==....LLLLLL....LLLLLL....==...#
#...==....LLLLLL.++.LLLLLL....==...#
#...==....LLLLLL.++.LLLLLL....==...#
#...==....LLLLLL....LLLLLL....==...#
#...==....LLLLLL....LLLLLL....==...#
#...==.#..LLLLLL..*.LLLLLL..#.==...#
#...==.#..LLLLLL....LLLLLL..#.==...#
#.*.==.#..LLLLLL....LLLLLL..#.==.*.#
#...==........................==...#
#...==............*...........==...#
#...============================...#
#...============================...#
#iiii..........................iiii#
#iiii..........................iiii#
#iiii....c........a.......b....iiii#
#iiii..........................iiii#
####################################
```

## 4. What `tick` receives

```
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
  enemies: [ same shape as allies — ONLY enemies your team can currently see ],
             // another vehicle's parts[] is { i, type, x, y, z, dir, alive, burning, hpFrac, wx, wy }: hpFrac (0..1), not hp and maxHp —
             // api.parts[type].hp is what a whole one has. Every piece it started with stays in the list, the ones shot off with alive: false
  enemiesAlive,                      // how many are left, seen or not
  lastSeen: [{ id, x, y, t, alive }],   // where each enemy was last seen; left out once your team has been to the spot and found it empty
  projectiles: [{ kind: 'bullet' | 'shell' | 'missile' | 'mortar' | 'hook', x, y, vx, vy, landsAt?, landsIn? }],  // enemy shots in sensor range, nearest first (max 24)
  mines: [{ x, y }],                 // enemy mines within 5 m (anywhere in sensor range with a radar)
  items: [{ id, type, x, y }],       // every pick-up currently on the map
  pads:  [{ x, y, charge }],
  zone:  { x, y, r, minR, startT, endT, shrinking },
  messages: [{ from: slot, id, data }],   // what teammates passed to `say` on their previous tick
  bombs:   [{ x, y, vx, vy, fuse, r }],   // kegs on the ground in sensor range, anybody's: where, how fast, seconds left, blast radius
  barrels: [{ x, y }],                    // powder barrels still standing in sensor range, nearest first (max 24)
  tethers: [{ from, to, length, taut, timeLeft }],   // harpoon cables: `from` is the vehicle that fired the hook
}
```

`weapons[].i` and `parts[].i` are indexes into your blueprint's `parts` array. Decor is not listed.
`state` is built fresh for every tick and is yours alone: write on it if you like — nothing you change
reaches the engine, a teammate or the next tick.
A mortar shell in `projectiles` tells you where and when it lands — drive out of the circle.

## 5. What `tick` returns

```
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
  say: anyJSON,               // ≤ 256 chars; teammates read it next tick in state.messages
}
```

The mortar lands its shell on the **point** you aim at, so give it `{ x, y }` (a bare angle drops the shell 12 m out). A point nearer than its
minimum range, or beyond its range, is moved along the same line to the nearest it can reach: the mortar still fires.
Missing or invalid fields count as 0 / off (for a number, `true` counts as full). The command is read once,
when `tick` returns. If `tick` throws, the vehicle idles for that step and the match report quotes the
message with the line of your file; after 40 exceptions the controller is cut off for the rest of
the match. A tick should take well under 3 ms: that is advice, measured and reported (`cpu` in the match report) and never
enforced — a slow tick costs nothing in the match. Only a tick that never returns forfeits it.
Do not build on running out of stack or memory: how deep a call can nest is a property of the machine, not of the
match, and a controller that measures it has given up the promise that the same files and seed play the same match.

### Helpers: `api`
* `api.util.driveTo(self, point, { reverse, stopDist, speed })` → `{ throttle, steer, brake }` pursuit controller. Also `driveTo(self, x, y, opts)`.
* `api.util.turnTo(self, angle)` → `{ throttle: 0, steer }`.
* `api.util.lead(from, target, projectileSpeed)` → `{ x, y, angle, t }` intercept point (pass it as `aim`).
  `target` only needs `x, y, vx, vy`, so you can lead a single piece: `{ x: part.wx, y: part.wy, vx: foe.vx, vy: foe.vy }`.
* `api.util.angDiff(a, b)`, `angleTo(from, to)`, `dist(a, b)`, `clamp(x, lo, hi)`, `blueprint(name, { deck, chassis }, { paint })`.
* `api.util.threat(state, margin = 1.2)` → `null`, or `{ x, y, r, in, away }` for the keg or mortar shell whose blast you are in or
  nearly in: where, how big, in how many seconds, and a point just outside it to drive to (`driveTo(self, t.away, { reverse: true })`).
* `api.nav.follower(opts)` → object with `next(self, goalX, goalY, state.tick)` returning the next waypoint of an A* route
  (cached, re-planned twice a second, sized to your hull, keeps to the way round an obstacle it has chosen, backs out when wedged), and
  `reset()`. Keep one per controller. `opts`: the `path` options below, `replanTicks` (30: ticks between plans) and `replanDist` (3: metres the goal may move before a new plan).
* `api.nav.path(x0, y0, x1, y1, { hover, margin, mudCost, iceCost, lavaCost })` → waypoints.
* `api.nav.los(x0, y0, x1, y1)` (can a shot get through?), `api.nav.clear(x0, y0, x1, y1, { margin, hover, avoid })` (can I drive it? `avoid`: tile names that count as blocked, e.g. `['lava']`),
  `api.nav.tileAt(x, y)`, `api.nav.tileAtCell(tx, ty)` (by tile index), `api.nav.isOpen(x, y, hover)`, `api.nav.clearance(x, y)` → `{ wall, pit }` metres.
* `api.map` — `{ id, w, h, tile, width, height, center, rows, spawns, itemSpawns, pads, items }`.
* `api.parts`, `api.items`, `api.tiles`, `api.rules` — these tables, as data. `api.rng()` — seeded random in [0, 1). `api.log(...)` — shows up in match reports.

## 6. Teams

* A team entry is either one bot (it fills every slot) or one bot per slot — so squads can mix controllers from different authors.
* `design` may be a function: `(ctx, api) => blueprint` with `ctx = { mode, teamSize, team, slot, budget, map, rules }`.
  Use it to field a tank in slot 0 and a medic in slot 2, or a hover build on the map with pits.
* `slot` is your place in the team, counted from 0 in every mode. It is the same number in `ctx`, in `init`'s `info`,
  in `state.self.slot`, in `allies[].slot` and in `messages[].from`.
* `say` is the only channel between teammates. A common pattern: the lowest living slot is leader and says `{ focus: enemyId }`.
  A destroyed teammate says nothing: its last message is gone from `state.messages` the tick after it dies.
* Repair arms heal allies within range; `target: allyId` picks who, for as long as that ally has a damaged piece left
  to mend (destroyed pieces cannot be rebuilt). After that the arm goes back to whoever in range is worst off.

## 7. Workflow

With the MCP server (`ironyard-mcp`):

1. `get_rules`, `list_parts`, `list_maps` — the kit and the arenas.
2. `validate_design` until the blueprint is legal. Read its `analysis`: how much has to be shot away to reach your core
   from each side, which of your weapons and wheels are the first thing hit, which bearings no gun covers, damage per
   second by range, how many seconds of full fire your energy lasts, how far a fire can walk across the car, and which
   lane of studs, once shot out, drops a track or a gun nobody was aiming at (`weakLanes`).
3. `submit_bot`, then `run_match`. Every vehicle in the report has `insights` — up to six sentences on why the match
   went as it did, with the numbers in them — and `telemetry`: each weapon's shots, hits and damage and when it was
   lost; damage dealt and taken by vehicle, by weapon, by range band and (taken) by the side it came from; seconds at
   each range; seconds with a target in reach against seconds firing, and what kept the guns silent; seconds stuck;
   the first pieces lost and to what; hull, energy, distance and living weapons every two seconds. Your own
   `api.log` lines are there too. `save_replay: true` keeps the match: `get_replay` reads back the events of a time
   window or a trace of where everybody was.
4. `evaluate_bot` for a win-rate table over maps, seeds and both sides, and a `diagnosis` of what the losses have in
   common. `scout_bot` on whoever beats you: its design, its record by opponent and map, where it is thin.
5. `leaderboard` for where you stand; change the file, submit again under the same name, repeat.

Without MCP: `node node/cli.js validate mybot.js`, `node node/cli.js match --a mybot.js --b rookie`, `node node/cli.js tournament`.

Things that decide matches: whether your guns can actually bear (watch `timeFireOutOfArc`), what a shot meets before it
reaches your core (slopes and armor in front, on the deck), what a ram meets (the chassis), energy balance, not driving
into pits, and picking the fight your build wins — out-range brawlers, out-turn snipers, shove hover craft, shield
against missiles and mortars, saw through shields.

And the physical side: what on your vehicle burns and where the firebreaks are (`validate_design` reports the share of
fireproof pieces); where your kegs sit when somebody shoots them, and which way they face — forward is a torpedo,
backward a mine for whoever is chasing you; which way a blast or a punch will send you and what is behind you when it
does; whether you are the heavier end of a cable, and what the hook has bitten into: a cable pulled tight tears that
piece off, and everything only it was holding. A vehicle that has lost its wheels and
its guns is out, so there are more ways to win than drilling for the core — and more ways to lose.
