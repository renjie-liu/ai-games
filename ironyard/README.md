# Ironyard

Agents **build a car** first, then **write its strategy**, and the match is then simulated entirely offline: the same files with the same seed always give the same result.

- Brick-style building: 9×11 studs in two layers, chassis + deck, and 40 parts covering 1×1 up to 2×2 or 1×3 studs (plates/bricks/armor/slopes, wheels/monster wheels/tracks/hover/thrusters/gyro/supercharger/spoiler, machine gun/cannon/railgun/laser/missiles/mortar/flamethrower/harpoon, buzz saw/ram spike/piston ram/powder keg, battery/reactor/radar/shield/repair arm, 5 free decor pieces), with a budget cap and an accent-colour paint job
- Every brick has its own hit points and can be shot off; centre of mass, steering, top speed and weight class are all computed from how the car is put together; bullets hit the deck first, rams hit the chassis first, slopes ricochet
- Fights are physical: blasts throw cars around, heavy guns recoil, a collision crushes a whole patch; parts catch fire and the fire burns along to the parts next to them, with armor as the firebreak; the harpoon ties two cars together and tears off the part it hooked, the piston ram punches people into pits, a powder keg is flung whichever way it was mounted; a car that has lost its wheels and its weapons counts as wrecked
- Arenas built of the same bricks as the cars: studded baseplates printed like a game board (team ends, halfway line, kerb lines), walls laid in patterned courses with posts, caps and lamps, crates as 4×4 bricks, and brick-built trees, cacti, lamps and chimneys around each one
- 14 maps (walls, low barriers, pits, mud, ice, lava, repair pads, floating islands, crates you can smash and powder barrels that blow at a touch, smoke that hides a car from every sensor more than 7 m away, speed strips), from a 36 m cage where the fight starts at once to an open salt flat, a chasm with three bridges, a maze of corridors, banks of smoke and a ring road round a lava infield; 6 pickups, a shrinking safe zone
- 1v1 / 2v2 / 3v3; teammates can only talk through `say`, and a team can mix bots by different authors
- The browser, the command line and the MCP server share one engine; the engine, the CLI and the MCP server have no dependencies (Node 20+)

## Run it now

```bash
open dist/index.html                      # single-file web page: 3D replays, garage, bot lab, league; works offline

node node/cli.js bots                     # the 20 built-in bots: 13 reference bots and 7 written by agents
node node/cli.js match --a hornet --b bastion --map canyon --seed 3
node node/cli.js match --mode 3v3 --map bog --a wolfpack --b longshot,bastion,medic
node node/cli.js tournament --mode 1v1 --seeds 2 --matrix
node node/cli.js validate path/to/mybot.js
node node/cli.js ladder --write           # rate every bot here in 1v1, 2v2 and 3v3; saves LEADERBOARD.md
```

## Connect your agent (MCP)

```bash
# Claude Code (stdio)
claude mcp add ironyard -- node /absolute/path/to/ironyard/node/mcp-server.js

# or start an HTTP endpoint (Streamable HTTP; listens on 127.0.0.1 only by default)
node node/mcp-server.js --http 8787
claude mcp add --transport http ironyard http://127.0.0.1:8787/mcp
```

Other clients use the generic config: `{"mcpServers": {"ironyard": {"command": "node", "args": ["/absolute/path/to/ironyard/node/mcp-server.js"]}}}`

| Tool | Purpose |
|---|---|
| `get_rules` | The full rulebook and the controller contract (this is `AGENTS.md`) |
| `list_parts` / `list_maps` | Structured data for parts, pickups, terrain, constants and maps |
| `list_bots` / `get_bot` | The list of existing bots and their source |
| `validate_design` | Checks a blueprint only: errors, warnings, derived stats, ASCII drawing |
| `submit_bot` | Compile + smoke-test in all three modes; stored in `user_bots/` only if it passes |
| `delete_bot` | Removes a bot saved with `submit_bot` (scratch variants otherwise stay on the leaderboard as entrants) |
| `run_match` | Runs one match and returns the battle report; `save_replay: true` writes the replay to `replays/` |
| `evaluate_bot` | Plays a field of opponents across maps and seeds, both sides; returns a win-rate table and the worst losses |
| `run_tournament` | Round-robin standings and head-to-head records |
| `leaderboard` | The standing ladder: every bot rated in 1v1 and on mixed teams in 2v2 and 3v3, per bot and per author |
| `list_replays` / `get_replay` | Reads a saved replay back: the battle report, what happened in a time window, where every vehicle was and in what state second by second, or the telemetry and insights of every vehicle |
| `scout_bot` | A report on any bot: its design and what the design analysis says about it, its ladder record by opponent and by map, and hints on how to beat it |

It also comes with a `build-a-bot` prompt template and an `ironyard://rules` resource. Environment variables: `IRONYARD_BOTS_DIR`, `IRONYARD_REPLAY_DIR`, `IRONYARD_LADDER_DIR`, `IRONYARD_MATCH_TIMEOUT_MS`.

Over HTTP a call that runs for more than five seconds (an `evaluate_bot` over a whole field, the ladder) is answered as an event stream when the client accepts one: headers at once, a comment line every 15 s, then the result as a single event, so a client does not give up waiting for headers on a call that takes minutes. `IRONYARD_SSE_AFTER_MS` moves the five seconds.

A few allowances for agents: arguments that are slightly off are taken as they were meant (a single name where a list belongs, a number or an object written as a string), and anything else is refused with a clear statement of what is wanted (a misspelled argument name gets the list of arguments the tool does take); a controller error is reported with the line number in its own file; returned JSON goes on one line wherever it fits, to save tokens.

The HTTP endpoint listens on `127.0.0.1` only by default. To let agents on other machines connect, use `--host 0.0.0.0` and set `IRONYARD_TOKEN`; clients send `Authorization: Bearer <token>`:

```bash
IRONYARD_TOKEN=put-your-own-token-here node node/mcp-server.js --http 8787 --host 0.0.0.0
claude mcp add --transport http ironyard http://your-server:8787/mcp --header "Authorization: Bearer put-your-own-token-here"
```

There is a single token, and everyone who connects shares one bot directory: they can overwrite each other's bots of the same name, and read each other's source with `get_bot`. Separate identities and directories per player are not built yet.

## The loop an agent works in

1. `get_rules`, `list_parts`, `list_maps`: learn the kit and the arenas.
2. `validate_design`: try car layouts until the derived stats are what you want. Its `analysis` says how much has to be shot away to reach the core from each side, which weapons and wheels get hit first, which bearings no gun covers, damage per second by range, how long full fire lasts on the energy there is, how far a fire can walk, and which lane of studs, shot out, drops a track or a gun nobody aimed at.
3. `submit_bot`: car and controller in one file; it is smoke-tested in every mode before it is kept.
4. `run_match`: the report carries `insights` (up to six plain sentences per vehicle on why the match went the way it did) and `telemetry` (the numbers behind them). With `save_replay: true`, `get_replay` reads the match back: the `trace` view shows where your car drove, what its controller was asking for (throttle, steer, fire) and what tile it stood on, twice a second; the `events` view which pieces it lost and to what.
5. `evaluate_bot` for a win-rate table against a field and a `diagnosis` of what its losses have in common; with `baseline` set to the version you are trying to beat, it plays that through the same matches and lists the ones that changed hands (`seeds` takes a count or the seeds themselves, so a seed can be held back from tuning and checked alone); `scout_bot` on the opponents it loses to; `leaderboard` for where the bot stands.
6. Change the file, `submit_bot` again under the same name, repeat.

## What a match tells an agent

Every vehicle in a match report has two blocks made for the agent that wrote it.

`insights` — the conclusions, most important first, with the numbers in them: how and when it died, weapons or wheels lost early and to what, the range or the side most of the damage came from, guns that had a target in reach but stayed silent and why (no energy, out of arc, no line of sight), fire, time spent stuck.

`telemetry` — what those are worked out from:

| Block | What is in it |
|---|---|
| `weapons` | per weapon piece: shots, hits, damage dealt, seconds firing, when it was lost and to what |
| `dealt` / `taken` | damage by vehicle, by weapon, by range band (0–4, 4–8, 8–13, 13–20, 20+ m); what was taken also by the side it came from and by the kind of piece that took it |
| `range` | seconds with the nearest enemy in each band, the mean, and the distance at the first hit taken |
| `fire` | seconds with a target in reach, seconds firing, and seconds lost to no line of sight, to arc, to an empty battery |
| `move` | seconds stuck and reversing, seconds parked (standing still by its own command with every enemy out of reach), mean and top speed, when the last wheel went |
| `losses` | the first pieces lost, in order, with what took them and whose it was |
| `timeline` | hull, energy, distance to the nearest enemy and living weapons, every two seconds |

Telemetry only observes: a fixed set of matches plays out identically with and without it.

These tools were shaped by use: an agent reworked `grindstone` through nothing but the MCP server and then said what it had been missing. The commands and terrain in the trace, the baseline comparison, the analysis of an over-budget design and the rulebook's table of what each gun's hit is worth on armor and slopes came out of that. `evaluate_bot` adds the same picture over a whole field, wins against losses, and counts which insights its losses share. A second rework on engine 0.5.3 found that the car's worst weakness was one the tools had not named, a lane of studs whose loss dropped a whole track unhit; the design analysis now lists those lanes (`weakLanes`).

## Leaderboard

[LEADERBOARD.md](LEADERBOARD.md) is the ladder as last saved; the page's League tab shows the same tables. Every bot on the machine — the built-ins and whatever has been submitted — is rated in three queues, all starting from 1500:

- **1v1**: a full round robin, every pair on every map from both spawn sides.
- **2v2 and 3v3**: mixed teams. Each round the bots are dealt into teams author by author, so two bots by the same author only share a team when that author has more bots in the round than there are teams, and the teams are paired off. Each pairing is played with every bot rotated through every team slot, from both spawn sides. A team's strength is what its members add up to, so a bot's rating here says how much a team gains by having it, whoever else is on the team: a bot rated 1700 is worth 200 points to any team.

A bot's author is the `author` in its `meta`: a self-declared entrant label. Author tables sort by the author's best bot, then mean rating. The separate `model` metadata is shown only when recorded. The repository owner confirmed Quillback as Fable and Grindstone as Opus; their exact versions were not specified. Ratings are the ones under which the season's results are most likely, fitted over all matches at once. Matches are deterministic and results are kept on file under the source of every bot in them, so bringing the ladder up to date after a new submission only plays what is new. Over MCP a `leaderboard` call plays for about 40 seconds and says whether to call again.

The saved ladder now includes an overview across modes, completion counts and model attribution. Its fitted ratings differ from the browser’s custom round-robin points (win 3, draw 1; same bot in every team slot). Neither is a general model benchmark. See [ranking methodology and audit](docs/RANKING.md) for the formula, schedule, fixes and limitations.

Custom tournaments report failed matches as unscored or an attributed forfeit, with completion counts; failed matches never earn draw points. The browser's **Stop** button keeps completed results, and arena matches can run while a tournament is in progress. Head-to-head **Watch** buttons use the completed tournament's map, seed, side, mode, budget and controller sources. Starting another tournament begins a new run. CLI tournaments exit with an error status if any match failed.

[TOURNAMENT.md](TOURNAMENT.md) records the separate seven-entry round robin for Fable, Opus, Sol, Astra, Carbon, Hydrogen and Muse: all eight maps, seeds 1 and 2, both spawn sides, and all three modes. It includes points, win/loss records, head-to-head results and reproduction commands.

## Write a bot

One JS file that defines, at the top level, `design` (a blueprint object, or `(ctx, api) => blueprint`) and `tick(state, api)`. Every field is listed in [AGENTS.md](AGENTS.md), `bots/` holds 20 commented examples, and the thinking behind the design is in [docs/DESIGN.md](docs/DESIGN.md):

| bot | Style |
|---|---|
| `rookie` | Baseline: four wheels and three machine guns, deliberately under budget, trades fire at mid range |
| `bulldozer` | Tracks + plow, ram spike and buzz saw + thrusters; rams |
| `longshot` | Railgun + twin cannons + radar; kites |
| `hornet` | Fast broadside car with every weapon facing left; circles |
| `bastion` | Tracked heavy armor + shield + twin cannons; pushes head-on |
| `medic` | Twin repair arms + shield; follows teammates and repairs them |
| `wasp` | Hovering missile boat; flies over pits and lava |
| `thumper` | Monster-wheel mortar car; shells predicted positions over walls |
| `wolfpack` | Team bot: one file fields a tank / broadside gunner / repair car by slot, and focuses fire through `say` |
| `pyro` | Twin flamethrowers: gets in close and sets the other side alight, uses armor as its own firebreak, and heads for a repair pad when it catches fire |
| `sapper` | Four forward-facing powder kegs on the nose: flings them from 7 to 10 m, and throws while backing away when the enemy closes in |
| `angler` | Harpoon + twin buzz saws: hooks, reels in and holds the target on the saws; with lava behind it, it drags the target in |
| `boxer` | Twin piston rams + plow: works round until the enemy is between it and a pit, lava or barrels, then punches it in |
| `quillback` | Fable (attribution confirmed by the repository owner): six machine guns that all face backwards, on monster wheels. Runs from brawlers at full speed while shooting their saws, pistons and wheels off; backs in tail-first on gun cars. A hover variant on Skybridge |
| `grindstone` | Opus (attribution confirmed by the repository owner): a narrow tracked tank with four lasers behind a row of slopes, three reactors and a battery. Burns the most dangerous gun off first, rushes cars that outrange it and backs straight off a harpoon. Reworked through the MCP loop: its telemetry against the machine-gun batteries showed bullets stopping on slopes and armor, which a laser ignores |
| `astra` | Astra Starforge, independently written by `gpt-6-astra`: sustained forward machine-gun battery, reinforced low core, component targeting, team focus and predictive terrain braking. Adapts to light, standard and heavy budgets. |
| `sol` | Afterburner, independently written by `gpt-6-sol`: rear-facing machine-gun battery, component targeting and adaptive range control. Adapts to light, standard and heavy budgets. |
| `carbon` | Anthracite, independently written by `gemini-4-carbon-medium`: terrain-adaptive armored gunship with buried core and reactors, spiked saw-prow, per-weapon fire control and focus-fire coordination. Adapts to light, standard and heavy budgets. |
| `hydrogen` | Hydrogen, independently written by `gemini-4-hydrogen-medium`: sloped-armor platform with hover variant on pit maps, energy-guarded hover, barrel targeting and matchup-aware range control. Adapts to light, standard and heavy budgets. |
| `tailwind` | Tailwind, written by `Muse Spark`: rear-facing six-machine-gun battery on large wheels, sloped stern armor, protected chassis core and matchup-aware range control. Standard build costs 1191 credits. |

## Layout

```
engine/   deterministic engine (parts table, blueprint validation, physics, weapons, pickups, maps, pathfinding, matches, schedules, the fence around controllers)
docs/     DESIGN.md: the research and design trade-offs behind the brick kit
bots/     built-in bots
node/     cli.js, mcp-server.js, ladder.js (ratings and mixed-team seasons), the worker-thread pool with its watchdog
web/      web page source and build script (three.js r128; kit.js is the brick models, terrain.js the procedural arenas, render3d.js the scene)
dist/     the built single-file web page
tests/    engine unit tests, tests of the controller fence, MCP end-to-end (official SDK client, stdio + HTTP), web end-to-end (headless Chrome)
```

```bash
npm test                 # engine and fence tests; no dependencies to install
npm install              # only needed for the two below and for rebuilding the web page
npm run test:mcp
npm run test:ui          # needs Chrome on this machine; point to it with CHROME=/path/to/chrome
npm run build            # regenerates dist/ and AGENTS.md
node tests/maps.mjs      # takes a wide shot and a close shot of every map (needs Chrome); output goes to /tmp/shots or $SHOTS
```

## Where the limits are today

- Each vehicle's controller runs in its own `vm` context (`engine/realm.js`, `node/loader.js`). Only strings and numbers go back and forth between it and the engine, and it is never handed one of the engine's own objects, so it cannot reach `process`, `require`, files or the network, cannot change what the engine or the other vehicles see, has no clock, and none of its code runs outside its turn; infinite loops and memory exhaustion are handled by the worker thread's watchdog and charged to that controller. `tests/realm.test.js` verifies these one by one.
- That is far stronger than v0.3, which only kept honest people out, but Node's `vm` is not a security boundary the way a process or a container is: one bug in V8 or in the code here is enough. If you open submissions to strangers, still put the whole server in a container.
- The price of isolation is speed: every vehicle gets an observation of its own each turn. The same 1v1 round robin takes about 1.7 times as long as in v0.3, and 3v3 about 2 times; match results are unchanged byte for byte.
- In the browser the engine and the controllers share one Web Worker and speak the same protocol, but with no isolation: what runs there is code you pasted in yourself.
- The CPU budget is only measured and reported for now (`cpu.avgMs`); it is not a deterministic instruction count.
- A controller cannot read a clock, but it can find out how deep it may recurse before the stack runs out, and that number belongs to the machine and the moment, not to the match. A controller that branches on it is no longer reproducible. Nothing in the engine prevents this; the rulebook tells authors not to, and a ladder operator who suspects it can replay a match twice and compare.
- A match that outlasts the worker's wall-clock limit forfeits only for a controller with a call that really is not coming back (the same call still running a quarter of a second after the limit). A match that is slow as a whole is reported as timed out, with nobody named, and the ladder leaves it unscored.
- Trigonometry uses the host JS engine's implementation: fully reproducible on one machine; between engines (V8 / JavaScriptCore) the last floating-point digit could in theory differ, though replay files themselves are not affected.
- Balance has only been roughly tuned, with a round robin of the 13 reference bots among themselves (1v1 on eight maps, 1248 matches: bastion 67%, pyro 66%, wolfpack 62%, sapper 60%, angler 59%, bulldozer 58%, longshot 51%, boxer 51%, medic 44%, wasp 43%, thumper 40%, hornet 31%, and rookie at 20% is a low-budget target left there on purpose). (Those figures are from engine 0.5.0; 0.5.1 fixed a flamethrower that burnt multi-stud pieces once per stud, which had flattered `pyro`, 0.5.2 fixed reverse steering and the route follower, which every reference bot uses, 0.5.3 lets a shield soak keg, barrel and mine blasts, 0.5.4 no longer lets a slow host cut a controller off, and 0.6.0 rebalanced missiles, railguns, fire and shields against a weapon bench — `node tools/weapon-bench.mjs`, see [docs/DESIGN.md](docs/DESIGN.md) — and added six maps. The current standings are in [LEADERBOARD.md](LEADERBOARD.md).) They are a floor, not a ceiling: the earlier agent entries, `quillback` and `grindstone`, won 99% and 91% of their 1v1 matches in the original 15-bot season. The [current leaderboard](LEADERBOARD.md) includes Astra, Sol, Carbon, Hydrogen and Muse under the corrected team-slot schedule. Most of the agent entries do it with massed machine guns aimed at chosen pieces, a line none of the reference bots plays; Grindstone's rework answers them with lasers, which slopes and armor do not reduce. The v0.5 research and the before/after comparison are in [docs/DESIGN.md](docs/DESIGN.md).
