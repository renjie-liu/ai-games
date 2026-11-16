# Design of the brick kit (v0.2)

A v0.1 car was a single-layer 7×7 grid with one part per cell. It could fight, but every car looked like a square slab, and the only decision between parts was "which cell does it go in". v0.2 set out to do three things: make the cars look good, give the parts real differences in shape, and make the maps bigger, all without turning building into free-form physics in the style of Besiege.

## First, how others do it

| Reference | What it does | What is used here |
|---|---|---|
| LEGO itself | Every part sits on an 8 mm stud grid; a brick is 9.6 mm tall and a plate 3.2 mm, so three stacked plates equal one brick [1] | The stud grid + two heights, "plates are low, bricks are tall". The rule that low parts do not block a muzzle comes straight from the height difference between plate and brick |
| Crossout | The cabin is the heart of the car, and without it the whole car is gone; wheels and the cabin can only mount on the frame; the power score is the sum of every part's score; energy limits firepower [2][3] | One core; movement parts only on the chassis layer; costs add up against a budget; energy limits how many weapons fire at once |
| Cosmoteer | Modules are deliberately different sizes so that layout becomes a puzzle; a destroyed reactor blows up what is next to it; the player community habitually staggers 1×2 armor like brickwork; too much armor is slow and expensive [4][5][6] | Multi-stud parts (1×2, 2×2, 1×3, 3×1); a dying reactor's blast reaches its sides, above and below; the 1×2 armor brick; cost and mass constrain together |
| LEGO 2K Drive | You start from a chassis with wheels and add bricks on top; more bricks means more weight, which decides the car's class; taking hits knocks bricks off [7][8][9] | The two-layer structure of chassis + deck; five weight classes by mass; a part that is shot off bursts into coloured loose bricks |
| Robocraft | One overall CPU cap constrains the build; a destroyed part stops working, so you can aim for weak points; cosmetic blocks have no armor and no mass and come out of a separate allowance [10][11] | A single budget; hit points per part; decor is free, weightless, does not stop shots, and has its own limit of 8 |

What they share is clear: none of these systems has continuous free placement; every one of them is "a grid + a small number of differently shaped parts + one or two global constraints". They differ only in how many dimensions the grid has and how many constraints there are. For a game where an LLM has to read the rules and write the blueprint, the fewer the constraints and the easier it is to spell everything out in a block of ASCII, the better, so this picks the smallest option: **a two-layer 2D grid**.

## The kit

**Grid**: 9 studs wide × 11 long, 0.4 m per stud, `y+` is the front. Two layers: chassis (z=0) and deck (z=1).

**Parts cover studs**: `size: [across, along]`, and the coordinate is the stud with the smallest x and the smallest y; facing east or west swaps across and along.

| Family | Parts | What the shape is about |
|---|---|---|
| Plates / bricks | Plate 1×1, 1×2, 2×2; brick 1×1, 1×2 | Big plates are cheap per stud, but when one breaks a big piece goes at once |
| Armor | Armor brick 1×1, 1×2; slope armor; plow blade 3×1 | The slope is a low part: in front of a muzzle it does not block the arc of fire, and it takes only 45% from shots that hit its face |
| Movement | Wheel, monster wheel 1×2, track unit 1×3, hover pad, thruster, gyro | Chassis only (thrusters and gyros fit either layer); tracks are long and take up a whole side |
| Tuning | Supercharger, spoiler 3×1 | Deck only; one adds drive force and the other side grip, and their numbers are limited |
| Weapons | Machine-gun turret, cannon 1×2, railgun 1×3, laser, missile pod 2×2, mortar 2×2, buzz saw, ram spike | The stronger the gun, the more room it takes; guns go on the deck only, saws and spikes on the chassis only |
| Utility | Battery, reactor, radar, shield generator, repair arm | Reactors blow up when they die: keep them away from the core |
| Decor | Livery tile, tail fin, exhaust stacks, light bar, flag | Free, purely for looks |

**There are only four building rules**: one core; every deck part has at least one stud resting on a chassis part; every part connects to the core (edge to edge on the same layer, or stacked); no tall part on the same layer in front of a gun, and nothing blocking the back of a thruster. Plus a budget (light 800 / standard 1200 / heavy 1800).

**What two layers change in a fight**:

- A bullet, beam or blast that lands on a stud hits the deck part there first and only reaches the chassis once that is gone; rams, buzz saws and mines go the other way and hit the chassis first. So "armor on top" against guns and "a thick floor underneath" against ramming are two separate investments.
- The mortar lobs its shells: it needs no firing lane and clears walls, but cannot hit anything closer than 6 m. It means "hiding behind a wall" is no longer completely safe.
- A decor piece falls off together with the part underneath it.

## Looks

- Every part type has its own model (`web/src/kit.js`), all with studs; the body takes the team colour, plus one accent colour of your choice (10 to pick from).
- The cars are bricks and the arenas are realistic (see the next section): the two are deliberately not in the same style, like toy cars photographed on real ground.
- Wheels turn with the distance travelled, buzz saws and radars spin by themselves, thrusters spit flame, hover cars bob up and down; a part that is shot off bursts into loose bricks in three colours: its own, the team colour and light grey.
- The garage has a live 3D preview you can drag, every part in the brick box is a rendered thumbnail, and "Mirror L→R" makes a design symmetrical in one click.

## Arenas (v0.3)

The v0.2 arena was a baseplate with one colour per tile, and it looked like colour swatches. v0.3 replaced it with realistic scenery themed per map, all generated procedurally in the browser without a single image file (`web/src/terrain.js`):

| Map | Setting | Ground | Walls / cover |
|---|---|---|---|
| Proving Ground | A concrete yard in daylight, with floodlight masts in the four corners | Concrete | Poured concrete walls with yellow-and-black hazard bands at the foot; hazard-striped blocks |
| Sumo Deck | A steel deck at sea at dusk | Anti-slip tread plate, rusty | None; the sea is under the deck |
| Canyon | Desert in the evening | Sand | Sandstone of uneven heights; sandbags |
| Frostbite | A snowfield under an overcast sky | Snow | Rocks capped with snow; sandbags |
| Foundry | A foundry at night | Asphalt | Rusty corrugated steel sheet; hazard-striped blocks |
| Skybridge | Platforms above the clouds at sunset | Concrete | Hazard-striped blocks; clouds under the platforms |
| Bog Fort | A swamp in the fog | Grass and mud | Concrete walls grown over with moss; sandbags |

It is built in four layers:

1. **Detail textures**: one set each for concrete, asphalt, steel plate, sand, snow, grass, mud and ice (colour + roughness + normal), computed from tileable value noise and cellular noise; each set is generated once, the first time it is needed.
2. **One control map per map**: four channels blurred out of the terrain tiles: mud, ice, the glow of lava, and contact shadow along the foot of walls and the rims of pits. The shader perturbs the coordinates with noise before it samples, so the edges of mud and ice are irregular and no longer squares.
3. **One decal layer per map**: expansion joints, cracks, oil stains, tyre marks, ruts, hazard paint along pit rims and lava edges, team-coloured boxes and numbers at the spawn points, rings at the pickup spots, repair pads. The paint turns patchy where the ground is pitted.
4. **Things with depth**: pits have shaft walls 12 m deep that get darker the further down they go; the floating maps have slab edges and pillars, with sea or clouds below; lava is a flowing molten surface whose light spills onto the ground around it; walls only generate the faces that are exposed and are textured in world coordinates, so a row of wall reads as one continuous stretch; the vertices of rocks are randomly displaced. Explosions and wrecks leave scorch marks on the ground, shown up to wherever the replay has been dragged.

The terrain rules have not changed: in the engine it is still a grid of 2 m tiles, and on screen the edges of mud and ice stray by about half a metre at most. The 2D view is as it was, still a tactical map drawn tile by tile.

## Maps

Every map got bigger (the smallest is 40×40 m, the largest 84×64 m), and there is a new one, Skybridge: a few islands hanging over the void and joined by narrow bridges, which hover cars can simply fly across. Match length went up to 150 seconds to match, and the safe zone starts closing at 85 seconds.

## The fence around controllers (v0.4)

Playing this game means running code written by other people's agents, so what a controller can reach is part of the rules. v0.3 handed the engine's own objects (`api`, `state`) straight to the controller, and any engine function leads to the engine's `Function` constructor: the one line `api.log.constructor('return process')()` gets you the host process; shared objects could also be rewritten, which affected the engine and the matches that ran later in the same worker thread.

The v0.4 rule is one sentence: **only strings, numbers and booleans pass between the engine and a controller** (`engine/realm.js`).

| Direction | What | Form |
|---|---|---|
| Engine → controller | Parts table, map, rules | Once at the start, as JSON; the controller side parses it and freezes it itself |
| Engine → controller | The observation for each turn | An array of numbers (the memory belongs to the controller side, and the engine writes through a view of its own), plus teammates' `say` and, the first time a vehicle is seen, its static layout (JSON) |
| Controller → engine | The blueprint | JSON |
| Controller → engine | The commands for each turn | Written back into the same array of numbers; `say` is JSON |
| Controller → engine | `api.nav`, `api.rng`, `api.log`, `api.util.blueprint` | Function calls that take and return primitive values only; an error thrown on the engine side is not passed across as it is, because an error object is an engine object too |

The pure functions of `api.util` and the path follower each have a copy on the controller side (the same source, evaluated again over there), and `state` is also rebuilt there from the numbers, so every vehicle gets objects that are its own alone. In Node each vehicle gets a fresh `vm` context: only the language itself is left (no `Date`, `Intl`, `WebAssembly`, `WeakRef`), generating code from strings is forbidden, the microtask queue is not drained, and the word `import` may not appear in the source (`import()` is the only syntax that asks the host for something). In the browser the same code is called directly, with no isolation.

How we know nothing broke: before the change, the complete results of 64 matches (events, replay frames, stats, logs) were fingerprinted, and the results of 2016 round-robin matches across the three modes were saved; after the change they were compared match by match, and not one differed. Two tests also stand guard for good: one has a second fence listen in on a whole match and, every turn, compares the `state` it decodes field by field with the object `World.observeAll()` builds directly; the other runs the same match once inside the fence and once outside it, and the results must be the same.

The price is speed (1v1 takes about 1.7 times as long, 3v3 about 2 times). Most of it is that every observer has to rebuild the objects for every vehicle it can see, and that each match gets new contexts, so V8 does not have the time to optimise this code all the way.

## Fights should feel real (v0.5)

Measure first, then change. The 9 built-in bots of v0.4 played a 1v1 round robin, and the question was not who won but what the matches looked like:

| What was seen | v0.4 | The problem |
|---|---|---|
| Hull left when a car dies (median) | 62% | Everyone drills for the core; cars vanish whole instead of being taken apart |
| Parts lost before death (median) | 9 | The same thing: forty or fifty parts go into a build, and the audience sees nine come off |
| Ramming's share of damage / of kills | 2% / 0% | Ram spikes, plows and thrusters are ornaments |
| Time each car spends standing still | 36% | The best play is to stop and trade fire |
| Accuracy | 90% | Machine guns have no spread, so movement means nothing |

The conclusion was that the engine had too little "stuff" in it: no forces, no fire, no terrain you could put to use, and "where does this piece go" only affected hit points and arcs of fire. What makes games like Besiege fun is the exact opposite: the things you build fall apart, catch fire and get carried off by their own explosives. So everything added in this version is a physical consequence, not a new number:

- **Force.** Blasts throw cars (the impulse scales with the damage; a shield stops the damage but not the push), heavy guns recoil (220 N·s for the railgun: a light car is knocked off line by its own shot), a collision crushes more than the one part it touches, and machine guns have spread. Hits push, so pits and lava have become weapons.
- **Fire.** Every part has heat; at 1 it catches fire, and a burning part loses hit points every second and heats the parts next to it, so fire travels across the car. Plates, bricks, wheels and most equipment burn; armor, slopes, tracks, ram spikes, plows, pistons and the core do not, so a row of armor is a firebreak, and for the first time a builder has to ask "can the fire be cut off here". Repair pads, repair kits and repair arms put fires out, and `jettison` can throw a burning part away.
- **Four parts that cause trouble.** The flamethrower (very low damage; it works by setting things alight); the harpoon (once it bites, the two cars are tied together by the cable and the heavier one decides where they go; while the cable is taut it tears off the part it hooked, along with whatever was held on only by that part); the piston ram (1300 N·s per punch, with the same kick back on yourself); the powder keg (a bomb you carry: it is flung whichever way it was mounted, goes off when it touches someone else's car, goes off as well if it is destroyed or set alight, and does not tell friend from foe).
- **Arenas you can smash.** A crate is a wall with hit points; a barrel explodes as soon as it breaks, and barrels set each other off; pathfinding always answers for the map as it is right now. The new map, Powder Depot, is made of nothing else.
- **Wrecks.** A car with nothing left that can move it and nothing left that can hurt anyone counts as destroyed after 3 seconds. Without this rule, a car stripped bare would be left as a core that cannot burn, dragging on until time runs out.

Measured the same way, with 13 bots, 8 maps and 1248 1v1 matches (the v0.4 column was run again from the v0.4 commit: 9 bots, 7 maps, 504 matches):

| | v0.4 | v0.5 |
|---|---|---|
| Hull left at death (median) | 62% | 34% |
| Parts lost before death (median) | 9 | 20 |
| Time standing still | 36% | 22% |
| Where damage comes from | kinetic 47%, explosive 38%, melee 11%, ramming 2%, energy 2% | kinetic 42%, explosive 28%, fire 12%, melee 10%, ramming 7%, energy 1% |
| How cars die | core shot through by a weapon 82%, fell into a pit 11%, lava 6% | core shot through by a weapon 47%, wrecked 35%, fell into a pit 17% |
| Average length | 47 s | 53 s |

Three things from the tuning are worth writing down, and each was only found by measuring:

1. The first harpoon added exactly nothing to win rate: with its range set to 0, the bot that carried it won just as often. All it did was tie cars together, and being tied together is not worth 90 credits by itself. Only once a taut cable tore parts off did it become a weapon.
2. The first powder keg, once let go, rolled forward at the car's own speed and went off after 1.5 seconds. The bomber bot written for it won around 20% of its matches, and half of its kegs blew up the bot itself: rolling distance, blast radius and braking distance never added up to a safe window. After the change to "flung the way it faces + goes off on touching a car", the same bot reached around 60%, and facing became a design decision: forward is a torpedo, backward is a mine for whoever is chasing. A piston can punch an incoming keg back, and the bot with pistons beats the bomber bot almost every time; nobody designed that counter, it grew by itself.
3. The two strongest new bots owed their strength to their two machine guns, not to the new parts: without the guns their win rate fell from about 70% to about 30%, while weakening the machine gun hurt the old bots more instead. In the end each of them kept one. The built-in bots are targets, and there is no point in over-optimising a target.

Nothing was copied from Besiege: no levels, art, names or specific contraptions were taken, and there are no hinges or moving joints either (see below). All that was taken is the principle: parts should be linked by physical cause and effect.

## Balance by bench, more ground, and arenas built of bricks (v0.6)

**A bench for parts.** The ladder says which *bots* are strong, and a bot is a car and a driver at once. To ask about a part alone, `tools/weapon-bench.mjs` puts different loadouts on one hull with one plain controller (hold about 70% of the longest gun's range, face the enemy, lead the shot, stay out of holes) at the same price, and plays them against each other on every map and against the real entries. A weapon that wins everything in those hands is too strong; one that wins nothing is dead weight. What it found on 0.5.4:

| Loadout (same hull, ~1180 credits) | Wins among bench cars, before → after | Wins against the seven agent entries, before → after |
|---|---|---|
| 3 missile pods | 87% → 62% | 82% → 47% |
| 4 flamethrowers | 76% → 69% | 69% → 50% |
| 4 cannons | 71% → 59% | 74% → 70% |
| 3 mortars + 2 machine guns | 52% → 58% | 32% → 29% |
| 5 machine guns | 42% → 38% | 31% → 27% |
| 4 lasers | 24% → 31% | 8% → 38% |
| 3 railguns | 2% → 59% | 7% → 53% |

("Before" is 0.5.4 on its eight maps; "after" is 0.6.0 on all fourteen, one seed, both sides. The laser car also got a second reactor between the two runs; the laser itself is unchanged.)

Three things it showed that the ladder could not:

1. A car with three missile pods and no idea beat every entry on the board. Nobody had built one, so the ladder never saw it. A missile's burst hit up to five pieces at 60% and always arrived; now it is 28 damage, four pieces at 50%, 32 m instead of 40, and a pod reloads a little slower.
2. The railgun was not a weapon: 64 damage every 4.4 s, less than half of it through a slope. It now does 90 every 4 s, goes through three pieces, and a slope does not turn its slug — the long gun that answers a wall of slopes.
3. Fire did too much for a part that needs no aim. The stream now does 3.5 a second to each piece it washes (5), and a burning piece loses 5 hp/s for 5 s (6 for 6) and warms its neighbours at 0.4/s (0.45). At 0.3 a fire no longer walked from plate to plate at all, which is the whole point of fire; 0.4 keeps it walking.

Defence was measured the same way: on a three-cannon car, a shield generator, a repair arm or five armor bricks at the same price all lost to simply fitting the fourth cannon, and the shield was the worst of the three. It now holds 240 (120) and recharges 16/s after 2.5 s. That makes it what the rulebook always said it was — the answer to missiles and mortars (24–4 against either on the bench) — while still losing to anything that shoots bullets.

Lasers were left alone: weak in plain hands on the bench, and the entry at the top of the 1v1 ladder is a laser car, so the gap is the driver's.

**More ground.** Eight arenas became fourteen, each asking for a different car: Scrap Cage (36 m across, the sides start 26 m apart, nowhere to run), Salt Flat (open, long sightlines, a speed strip down each flank), Causeway (a chasm with one broad bridge and two narrow ones behind crates), Rat Run (corridors and corners, crates in the short cuts), Fogbank (three banks of smoke) and Ring Road (a circuit round a lava infield). Two tiles are new. **Smoke** hides a car from every sensor further than 7 m away until it fires, and a missile loses its lock on it: it is the counterweight to the long guns the bench had just made worth carrying. A **speed strip** makes wheels, tracks and hover pads push half as hard again. Over the whole field the new maps play like the old ones — 97% of matches end in a kill, about 49 s on average, one unprovoked fall in 2280.

The new maps found a bug the old ones had hidden. On Rat Run two cars could pass each other in parallel corridors without either sensor reaching, drive on to where the other had started, and stand there until the zone closed 90 s later: each still had a note saying the enemy was "last seen" on the very spot it was parked on. A note the team can see is wrong is now dropped until the enemy is seen again. It was found by a number added in the same release — seconds a car stood still by its own command with the enemy beyond every gun — which is the thing an agent tuning a controller most needs to be told and could not see before.

**Built of bricks.** The cars were always bricks; the ground they fought on was concrete, sand and grass. Now every arena is a model built from the same kit, on a studded baseplate with a stud every 0.4 m — the cars' own stud.

- *Walls* are laid in courses, half a brick over the one below, in two colours: a dark plinth and a coping course in the second colour, or hazard checks, or stripes, or an odd brick here and there, by map. Studs run along the top. Corners, ends and free-standing pillars carry a 2×2 post under a pyramid cap with a lamp on it; every fourth tile of a straight run carries a low one.
- *The floor* is printed like the board of a game: two tones of plate in a 4 m chequer, each team's end in its colour with a row of chevrons pointing at the other side, a dashed halfway line, a centre circle, and a kerb line along the foot of everything that stands on it. Ice is smooth tile with no studs — smooth is why it is slippery — and mud is a patch of brown plates.
- *Things on the floor*: barriers are two courses of hazard-checked brick, crates are 4×4 bricks with sixteen studs.
- *Around the arena*, beyond the walls where no car can go, stand things built of the same bricks so that the board sits in a place: trees and bushes, snow-topped pines, cacti and rock piles, lamp posts, chimneys, stacks of tyres.

Each map has its own handful of colours and its own way of laying them, and keeps its own sky and light. The style is a generic toy-brick one: no marks, sets or pieces of any real brand are reproduced. Stud patterns on the ground are drawn in the ground shader and fade with distance so they do not shimmer; studs on walls and crates are real geometry.

## Left out on purpose

- No third layer, no overhangs, no hinges or moving joints. Add any more and an ASCII blueprint can no longer describe the car clearly.
- No part unlocks and no rarity: every part is available from the start, and the only limit is the budget.
- Decor and paint do not enter the combat numbers.
- Balance has only been roughly tuned with round robins of the 13 built-in bots: in 1v1 the strongest, bastion, is at 67% and the weakest, rookie, at 20%, with a continuous spread in between. 2v2 and 3v3 were only checked for errors and obvious imbalance, not tuned in detail.
- There is no test-drive mode for people yet (driving a car you built against bots, with the keyboard), and no single-player levels. Both are wanted; neither made it into this version.

## Sources

1. LEGO dimensions: <https://brickfact.com/blog/guidebooks/lego-brick-dimensions>
2. Official Crossout guide (power score, energy, cabin): <https://old.crossout.net/en/game/guide>
3. Crossout Wiki, Frame and Cabin: <https://crossout-archive.fandom.com/wiki/Frame?oldid=6206>
4. Cosmoteer 0.12.0 devlog (modules of different sizes are intentional): <https://walternaterealities.itch.io/cosmoteer/devlog/3564/cosmoteer-0120-missiles-fires-and-more>
5. Cosmoteer forum shipbuilding guide (do not cluster reactors, do not cover everything in armor): <https://forum.cosmoteer.net/d/362/3>
6. Cosmoteer forum, staggered armor: <https://forum.cosmoteer.net/d/7783/39>
7. Official LEGO 2K Drive Garage page: <https://lego.2k.com/drive/garage/>
8. Gamer Matters review of the 2K Drive vehicle builder (starting from the chassis): <https://gamermatters.com/lego-2k-drives-vehicle-builder-is-good-enough-to-recreate-actual-lego-sets-but-there-are-limits/>
9. Engadget review of 2K Drive (bricks knocked off by hits): <https://www.engadget.com/lego-2k-drive-lets-you-build-your-dream-race-car-brick-by-brick-113038327.html>
10. Robocraft (Wikipedia): <https://en.wikipedia.org/wiki/Robocraft>
11. Robocraft Wiki, cosmetic blocks: <https://robocraft.gamepedia.com/File:Pilot_Seat_Cray.png>
