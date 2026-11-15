# Ironyard

Agents **build a car** first, then **write its strategy**, and the match is then simulated entirely offline: the same files with the same seed always give the same result.

- Brick-style building: 9×11 studs in two layers, chassis + deck, and 40 parts covering 1×1 up to 2×2 or 1×3 studs (plates/bricks/armor/slopes, wheels/monster wheels/tracks/hover/thrusters/gyro/supercharger/spoiler, machine gun/cannon/railgun/laser/missiles/mortar/flamethrower/harpoon, buzz saw/ram spike/piston ram/powder keg, battery/reactor/radar/shield/repair arm, 5 free decor pieces), with a budget cap and an accent-colour paint job
- Every brick has its own hit points and can be shot off; centre of mass, steering, top speed and weight class are all computed from how the car is put together; bullets hit the deck first, rams hit the chassis first, slopes ricochet
- Fights are physical: blasts throw cars around, heavy guns recoil, a collision crushes a whole patch; parts catch fire and the fire burns along to the parts next to them, with armor as the firebreak; the harpoon ties two cars together and tears off the part it hooked, the piston ram punches people into pits, a powder keg is flung whichever way it was mounted; a car that has lost its wheels and its weapons counts as wrecked
- 8 maps (walls, low barriers, pits, mud, ice, lava, repair pads, floating islands, plus crates you can smash and powder barrels that blow at a touch), each with its own real-world setting (concrete proving ground, steel deck at sea, desert canyon, snowfield, foundry, platforms above the clouds, swamp, powder depot), 6 pickups, a shrinking safe zone
- 1v1 / 2v2 / 3v3; teammates can only talk through `say`, and a team can mix bots by different authors
- The browser, the command line and the MCP server share one engine; the engine, the CLI and the MCP server have no dependencies (Node 20+)

## Run it now

```bash
open dist/index.html                      # single-file web page: 3D replays, garage, bot lab, league; works offline

node node/cli.js bots                     # the 13 built-in reference bots
node node/cli.js match --a hornet --b bastion --map canyon --seed 3
node node/cli.js match --mode 3v3 --map bog --a wolfpack --b longshot,bastion,medic
node node/cli.js tournament --mode 1v1 --seeds 2 --matrix
node node/cli.js validate path/to/mybot.js
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
| `run_match` | Runs one match and returns the battle report; `save_replay: true` writes the replay to `replays/` |
| `evaluate_bot` | Plays a field of opponents across maps and seeds, both sides; returns a win-rate table and the worst losses |
| `run_tournament` | Round-robin standings and head-to-head records |

It also comes with a `build-a-bot` prompt template and an `ironyard://rules` resource. Environment variables: `IRONYARD_BOTS_DIR`, `IRONYARD_REPLAY_DIR`, `IRONYARD_MATCH_TIMEOUT_MS`.

A few allowances for agents: arguments that are slightly off are taken as they were meant (a single name where a list belongs, a number or an object written as a string), and anything else is refused with a clear statement of what is wanted (a misspelled argument name gets the list of arguments the tool does take); a controller error is reported with the line number in its own file; returned JSON goes on one line wherever it fits, to save tokens.

The HTTP endpoint listens on `127.0.0.1` only by default. To let agents on other machines connect, use `--host 0.0.0.0` and set `IRONYARD_TOKEN`; clients send `Authorization: Bearer <token>`:

```bash
IRONYARD_TOKEN=put-your-own-token-here node node/mcp-server.js --http 8787 --host 0.0.0.0
claude mcp add --transport http ironyard http://your-server:8787/mcp --header "Authorization: Bearer put-your-own-token-here"
```

There is a single token, and everyone who connects shares one bot directory: they can overwrite each other's bots of the same name, and read each other's source with `get_bot`. Separate identities and directories per player are not built yet.

## Write a bot

One JS file that defines, at the top level, `design` (a blueprint object, or `(ctx, api) => blueprint`) and `tick(state, api)`. Every field is listed in [AGENTS.md](AGENTS.md), `bots/` holds 13 commented examples, and the thinking behind the design is in [docs/DESIGN.md](docs/DESIGN.md):

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

## Layout

```
engine/   deterministic engine (parts table, blueprint validation, physics, weapons, pickups, maps, pathfinding, matches, schedules, the fence around controllers)
docs/     DESIGN.md: the research and design trade-offs behind the brick kit
bots/     built-in bots
node/     cli.js, mcp-server.js, the worker-thread pool with its watchdog
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
- Trigonometry uses the host JS engine's implementation: fully reproducible on one machine; between engines (V8 / JavaScriptCore) the last floating-point digit could in theory differ, though replay files themselves are not affected.
- Balance has only been roughly tuned with a round robin of the 13 built-in bots (1v1 on eight maps, 1248 matches: bastion 67%, pyro 66%, wolfpack 62%, sapper 60%, angler 59%, bulldozer 58%, longshot 51%, boxer 51%, medic 44%, wasp 43%, thumper 40%, hornet 31%, and rookie at 20% is a low-budget target left there on purpose). They are all targets, not a ceiling: the v0.5 research and the before/after comparison are in [docs/DESIGN.md](docs/DESIGN.md).
