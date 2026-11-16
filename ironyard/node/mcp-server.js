#!/usr/bin/env node
// Ironyard MCP server — lets any MCP-capable agent design vehicles, write
// controllers, and test them offline.
//
//   node node/mcp-server.js                 stdio transport (Claude Code, Codex, Cursor, …)
//   node node/mcp-server.js --http 8787     Streamable HTTP on http://127.0.0.1:8787/mcp
//
// Zero dependencies: JSON-RPC 2.0 is implemented directly.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import crypto from 'node:crypto';
import {
  MAPS, MAP_IDS, MODES, PARTS, ITEMS, TILES, TILE, RULES, BUDGETS, DEFAULT_BUDGET, CELL, GRID_HX, GRID_HY, GRID_W, GRID_L, PAINTS, DECOR_LIMIT,
  validateDesign, parseBlueprint, renderDesign, makeSchedule, standings, summarize, FLAG, ENGINE_VERSION, tournamentResult, tournamentStatus, scoredResult,
} from '../engine/index.js';
import { ladder, QUEUES } from './ladder.js';
import { rulesMarkdown } from '../engine/rulesdoc.js';
import { listBots, readBotSource, makeBot, BOT_NAME_RE, USER_DIR, BUILTIN_DIR, ROOT } from './loader.js';
import { MatchPool, withSources } from './runner.js';
import { diagnose, telemetryView } from '../engine/insights.js';
import { analyzeDesign } from '../engine/designcheck.js';
import { scoutBot } from './scout.js';

const SERVER = { name: 'ironyard', title: 'Ironyard Arena', version: ENGINE_VERSION };
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const REPLAY_DIR = process.env.IRONYARD_REPLAY_DIR ? path.resolve(process.env.IRONYARD_REPLAY_DIR) : path.join(ROOT, 'replays');
// One request may carry several calls, and every call can queue matches: a batch is kept small.
const MAX_BATCH = 16, BATCH_MSG = `a batch may carry at most ${MAX_BATCH} calls`;
const overfull = (msg) => Array.isArray(msg) && msg.length > MAX_BATCH;
// How long one leaderboard call may spend playing matches before it answers with what it has.
const LADDER_BUDGET_MS = Number(process.env.IRONYARD_LADDER_BUDGET_MS || 40_000);
const pool = new MatchPool({ timeoutMs: Number(process.env.IRONYARD_MATCH_TIMEOUT_MS || 30_000) });
const log = (...a) => process.stderr.write(`[ironyard-mcp] ${a.join(' ')}\n`);

const modeEnum = Object.keys(MODES);
/** `seeds` as a tool takes it: a count n means seeds 1..n, a list is the seeds themselves. */
const seedList = (s) => (Array.isArray(s) ? [...new Set(s)] : Array.from({ length: s || 1 }, (_, i) => i + 1));
const budgetSchema = { type: 'integer', minimum: 100, maximum: 5000, description: `Credits per vehicle. Default ${DEFAULT_BUDGET} (light ${BUDGETS.light}, standard ${BUDGETS.standard}, heavy ${BUDGETS.heavy}).` };
const teamSchema = (who) => ({
  type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' },
  description: `Bot names for ${who}. One name fills every slot of the team; otherwise give exactly one name per slot (2 for 2v2, 3 for 3v3).`,
});

// ── tools ───────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_rules',
    title: 'Read the rulebook',
    description: 'The full Ironyard rulebook and controller contract (markdown): how to write the single JS file, building rules, every part/item/tile with numbers, the state your tick() receives, the command it returns, helper API, team play and tips. Read this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async () => rulesMarkdown(),
  },
  {
    name: 'list_parts',
    title: 'Parts catalog',
    description: 'Machine-readable catalog: every part (cost, mass, hp, weapon numbers…), items, tile types, budgets and engine constants. Same numbers as get_rules, as JSON.',
    inputSchema: { type: 'object', properties: { category: { type: 'string', enum: ['structure', 'mobility', 'weapon', 'utility', 'decor'], description: 'Only parts of this category.' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async ({ category }) => ({
      grid: { studsWide: GRID_W, studsLong: GRID_L, studMetres: CELL, xRange: [-GRID_HX, GRID_HX], yRange: [-GRID_HY, GRID_HY], front: 'y+', right: 'x+',
        layers: { 0: 'chassis', 1: 'deck' }, anchor: 'x, y = lowest-x, lowest-y stud of the piece; size = [across, along] facing N, swapped for E/W',
        decorLimit: DECOR_LIMIT, paints: Object.keys(PAINTS) },
      budgets: BUDGETS,
      parts: Object.fromEntries(Object.entries(PARTS).filter(([, p]) => !category || p.cat === category)),
      ...(category ? {} : { items: ITEMS, tiles: TILES, rules: RULES }),
    }),
  },
  {
    name: 'list_maps',
    title: 'Maps',
    description: 'All maps with ASCII layouts (row 0 = north), sizes, item pools, spawn and item coordinates.',
    inputSchema: { type: 'object', properties: { map: { type: 'string', enum: MAP_IDS, description: 'Only this map, with full coordinates.' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async ({ map }) => {
      const legend = Object.fromEntries(Object.values(TILES).map((t) => [t.ch, t.name]).concat([['A B C', 'team 0 spawns, slot 0-2'], ['a b c', 'team 1 spawns'], ['*', 'item spawn']]));
      const one = (id, full) => {
        const m = MAPS[id];
        return { id, name: m.name, desc: m.desc, tiles: `${m.w}x${m.h}`, metres: `${m.width}x${m.height}`, items: m.items, layout: m.rows,
          ...(full ? { tileMetres: m.tile, center: m.center, spawns: m.spawns.map((t) => t.map((s) => ({ x: s.x, y: s.y }))), itemSpawns: m.itemSpawns.map((s) => ({ x: s.x, y: s.y })), repairPads: m.pads.map((s) => ({ x: s.x, y: s.y })), zone: m.zone } : {}) };
      };
      return { legend, maps: (map ? [map] : MAP_IDS).map((id) => one(id, !!map)) };
    },
  },
  {
    name: 'list_bots',
    title: 'Available bots',
    description: 'Built-in reference bots and bots submitted in this workspace, with their one-line strategy notes.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async () => ({
      bots: listBots().map((b) => {
        const src = fs.readFileSync(b.file, 'utf8');
        const notes = /notes:\s*(['"`])((?:(?!\1).)*)\1/.exec(src);
        return { name: b.id, kind: b.kind, notes: notes ? notes[2] : undefined, bytes: src.length };
      }),
      hint: 'rookie is the baseline to beat first. get_bot returns any bot\'s source.',
    }),
  },
  {
    name: 'get_bot',
    title: 'Read a bot\'s source',
    description: 'Returns the JavaScript source of a bot (built-in or submitted). The built-ins are short, commented examples of different archetypes.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Bot name from list_bots.' } }, required: ['name'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async ({ name }) => readBotSource(String(name)),
  },
  {
    name: 'scout_bot',
    title: 'Scouting report on a bot',
    description: 'What to expect from one bot before you play it, without running a match. `design`: the vehicle it fields in 1v1 at the default budget (cost, mass, speed, weapons) with the same analysis validate_design gives: what stands between each side and its core, dps by range, blind arcs, energy endurance, design insights. `otherDesigns`: different vehicles it fields in team slots or on other maps. `record`: its 1v1 ladder record from the results on file, overall, per opponent (worst first) and per map; it says how many of its matches are on file and says so plainly when the file is missing or was made with other source code. `hints`: 2-4 sentences on who beats it, where, and what its vehicle gives away. Sides are front / rear / left / right of the vehicle; bearings are degrees clockwise from dead ahead (90 = right, 180 = astern).',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Bot name from list_bots.' } }, required: ['name'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: async ({ name }) => scoutBot(String(name), { pool }),
  },
  {
    name: 'validate_design',
    title: 'Check a blueprint',
    description: 'Validates a vehicle blueprint against the building rules and budget WITHOUT saving anything. Returns errors, warnings, derived stats (cost, mass and weight class, top speed, turn rate, dps, energy balance, hp…) and ASCII pictures of both layers. A valid design also gets `analysis`, worked out from the hit rules before any match: `coreProtection` (what a straight shot from the front / rear / left / right must destroy before it reaches the core: pieces, hp, and hp counting armor and slopes against a 4-damage bullet and a 30-damage shell), `exposed` (guns, movers, reactors, batteries and kegs that are the first piece hit from a side), `weapons` (facing, arc, range, dps and the bearings each can reach; `i` is the index to fire it by), `dpsByRange` / `dpsByRangeRear` (dps on a target dead ahead / astern at 2-22 m), `blindArcsDeg`, `energy` (seconds of everything firing before the store is empty), `fire` (how much burns and what the largest touching cluster reaches), `mass`, `weakLanes` (the lanes of studs on which the least has to be shot away before running gear or guns fall off untouched, because everything tying them to the core lies on that lane: `from` a side, its stud `x` or `y`, `shotAway` pieces worth `hp`, `thenFallOff`), and up to 6 `insights`, most important first. Bearings are degrees clockwise from dead ahead (90 = right, 180 = astern). Give either `design` (JSON) or `blueprint` (ASCII).',
    inputSchema: {
      type: 'object',
      properties: {
        design: {
          type: 'object', description: 'Blueprint as JSON.',
          properties: {
            name: { type: 'string' },
            paint: { type: 'object', properties: { accent: { type: 'string', enum: Object.keys(PAINTS) } } },
            parts: { type: 'array', items: { type: 'object', properties: {
              type: { type: 'string', enum: Object.keys(PARTS) },
              x: { type: 'integer', minimum: -GRID_HX, maximum: GRID_HX, description: 'lowest-x stud of the piece' },
              y: { type: 'integer', minimum: -GRID_HY, maximum: GRID_HY, description: 'lowest-y stud of the piece (y+ is the front)' },
              z: { type: 'integer', enum: [0, 1], description: '0 = chassis, 1 = deck. Optional for pieces that only fit one layer.' },
              dir: { type: 'string', enum: ['N', 'E', 'S', 'W'] } }, required: ['type', 'x', 'y'] } },
          },
          required: ['parts'],
        },
        blueprint: {
          type: 'object', description: `ASCII alternative: two pictures of ${GRID_L} rows (first row = front) with ${GRID_W} whitespace-separated tokens each. "." empty, ":" rest of a multi-stud piece, else the part glyph plus an optional arrow ^ > v <. A multi-stud piece is written on its lowest-x, lowest-y stud.`,
          properties: { deck: { type: 'array', items: { type: 'string' } }, chassis: { type: 'array', items: { type: 'string' } }, accent: { type: 'string', enum: Object.keys(PAINTS) } },
          required: ['chassis'],
        },
        budget: budgetSchema,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: async ({ design, blueprint, budget }) => {
      if (!design && !blueprint) throw new Error('give `design` (JSON) or `blueprint` ({ chassis: [rows], deck: [rows] })');
      const d = design || parseBlueprint('blueprint', blueprint, { paint: { accent: blueprint.accent } });
      const v = validateDesign(d, { budget: budget ?? DEFAULT_BUDGET });
      return { ok: v.ok, errors: v.errors, warnings: v.warnings, stats: v.stats, analysis: v.design && v.stats && (v.ok || v.errors.every((e) => /exceeds budget/.test(e))) ? analyzeDesign(v) : undefined, picture: v.design ? renderDesign(v.design) : undefined,
        design: design ? undefined : v.design };
    },
  },
  {
    name: 'submit_bot',
    title: 'Save a bot',
    description: 'Compiles and smoke-tests a controller file (design + tick) in every mode, then saves it under `name` so it can be used in run_match / evaluate_bot / run_tournament. Re-submitting the same name overwrites it. Fails with a precise message if the source does not compile, the design is illegal, or tick() throws.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,39}$', description: 'Lowercase id, e.g. "claude-striker-v2".' },
        source: { type: 'string', description: 'Complete JavaScript source of the controller file.' },
        budget: budgetSchema,
      },
      required: ['name', 'source'], additionalProperties: false,
    },
    run: async ({ name, source, budget }) => {
      name = String(name);
      if (!BOT_NAME_RE.test(name)) throw new Error('name must match ^[a-z0-9][a-z0-9_-]{0,39}$');
      if (fs.existsSync(path.join(BUILTIN_DIR, name + '.js'))) throw new Error(`"${name}" is a built-in bot; pick another name`);
      makeBot(name, String(source)); // syntax check
      // one row per different vehicle the file fields, with every mode and slot it was fielded in
      const rows = new Map(), runtime = [];
      let fatal = null;
      for (const mode of modeEnum) {
        try {
          const s = await pool.run({ map: 'proving', mode, seed: 7, budget: budget ?? DEFAULT_BUDGET, maxTime: 8, want: 'summary',
            teams: [[{ id: name, source }], [{ id: 'rookie', source: readBotSource('rookie') }]] });
          for (const v of s.vehicles.filter((x) => x.team === 0)) {
            const d = v.design;
            const what = { vehicle: v.name, cost: d.cost, massKg: d.mass, weightClass: d.weightClass, topSpeed: d.topSpeed, turnRate: d.turnRate, dps: d.dps, weapons: d.weapons };
            const key = JSON.stringify(what);
            const row = rows.get(key) || { fieldedAs: [], ...what, cpuMs: { avgMs: 0, maxMs: 0 }, log: [] };
            rows.set(key, row);
            row.fieldedAs.push(`${mode} slot ${v.slot}`);
            if (v.cpu) { row.cpuMs.avgMs = Math.max(row.cpuMs.avgMs, v.cpu.avgMs); row.cpuMs.maxMs = Math.max(row.cpuMs.maxMs, v.cpu.maxMs); }
            for (const line of v.logs) if (row.log.length < 5) row.log.push(line);
            for (const e of v.errors) runtime.push(`${mode} slot ${v.slot}: ${e}`);
          }
        } catch (e) { fatal = `${mode}: ${e.message}`; break; }
      }
      if (fatal) throw new Error(`not saved — ${fatal}`);
      if (runtime.length) throw new Error(`not saved — the controller failed in the smoke test: ${runtime.slice(0, 3).join(' | ')}`);
      fs.mkdirSync(USER_DIR, { recursive: true });
      fs.writeFileSync(path.join(USER_DIR, name + '.js'), source);
      return { saved: name, smokeTest: [...rows.values()], next: `run_match { team_a: ["${name}"], team_b: ["rookie"] } then evaluate_bot { name: "${name}" }` };
    },
  },
  {
    name: 'delete_bot',
    title: 'Delete a saved bot',
    description: 'Removes a bot saved with submit_bot. Built-in bots cannot be deleted. Use it to clear scratch variants when you are done with them: every saved bot is an entrant in `leaderboard`, and each one adds a full round of matches there for everybody.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,39}$', description: 'The saved bot to remove.' } },
      required: ['name'], additionalProperties: false,
    },
    run: async (a) => {
      const name = String(a.name), saved = () => listBots().filter((b) => b.kind === 'user').map((b) => b.id);
      if (!BOT_NAME_RE.test(name)) throw new Error(`bad bot name "${name}" (lowercase letters, digits, - and _ only)`);
      if (fs.existsSync(path.join(BUILTIN_DIR, name + '.js'))) throw new Error(`"${name}" is a built-in bot and cannot be deleted`);
      const file = path.join(USER_DIR, name + '.js');
      if (!fs.existsSync(file)) throw new Error(`no saved bot "${name}". Saved bots: ${saved().join(', ') || 'none'}`);
      fs.unlinkSync(file);
      return { deleted: name, savedBots: saved() };
    },
  },
  {
    name: 'run_match',
    title: 'Run one match',
    description: 'Runs a full deterministic match and returns the battle report: winner and reason, the event timeline, runtime errors, api.log output, and per vehicle three things that say WHY it won or lost. `insights`: up to six plain-language findings with their numbers, most important first (how it ended, movers or weapons lost early and to what, an enemy inside gun range while the guns were silent and the reason, damage taken at a range or from a side it does not fight at, damage from lava / the zone / walls, fire, time stuck, low accuracy). `telemetry`: the numbers behind them — weapons[] (per weapon piece: shots, hits, damage, firingTime, lostAt), dealt and taken broken down by vehicle id, by weapon, by range band (metres between the two vehicles) and, for taken, by the side the hit came from (front / left / right / rear) and by piece type; range (seconds per distance band to the nearest enemy); fire (of the seconds an enemy was inside gun range: firing, no line of sight, out of arc, energy-starved); move (stuck, reversing, speeds, movers lost); losses (the first pieces lost: when, to what, by whom); timeline (hull %, energy %, distance to the nearest enemy and weapons left, every 2 s). `stats`: the plain totals. Read the insights first, then the telemetry they point at, then change the bot or the blueprint and run the same match again (same seed = same match). `brief: true` leaves out the design, the timeline and the losses list. To see where everybody was and when, set save_replay and read it with get_replay (views "trace", "events", "telemetry"). Team 0 = team_a.',
    inputSchema: {
      type: 'object',
      properties: {
        team_a: teamSchema('team 0'), team_b: teamSchema('team 1'),
        mode: { type: 'string', enum: modeEnum, description: 'Default 1v1.' },
        map: { type: 'string', enum: MAP_IDS, description: 'Default proving.' },
        seed: { type: 'integer', minimum: 0, description: 'Default 1. Same inputs + same seed = same match.' },
        swap: { type: 'boolean', description: 'Swap spawn sides (team_a starts where team_b normally does).' },
        budget: budgetSchema,
        save_replay: { type: 'boolean', description: 'Also write a replay JSON file that the web viewer can load. Default false.' },
        brief: { type: 'boolean', description: 'Leave out each vehicle\'s design, telemetry.timeline and telemetry.losses to save tokens. Default false.' },
      },
      required: ['team_a', 'team_b'], additionalProperties: false,
    },
    run: async (a) => {
      const spec = { map: a.map || 'proving', mode: a.mode || '1v1', seed: a.seed ?? 1, swap: !!a.swap, budget: a.budget ?? DEFAULT_BUDGET,
        teams: withSources([a.team_a.map(String), a.team_b.map(String)]), want: a.save_replay ? 'full' : 'summary' };
      let res = await pool.run(spec);
      let replay;
      if (a.save_replay) {
        fs.mkdirSync(REPLAY_DIR, { recursive: true });
        // six 40-letter names do not fit in a file name: past 120 characters the line-up is cut and told apart by a hash
        let who = `${a.team_a.join('+')}-vs-${a.team_b.join('+')}`;
        if (who.length > 120) who = `${who.slice(0, 100)}-${crypto.createHash('sha256').update(who).digest('hex').slice(0, 12)}`;
        replay = path.join(REPLAY_DIR, `${spec.mode}-${spec.map}-${who}-s${spec.seed}${spec.swap ? '-swap' : ''}.json`);
        fs.writeFileSync(replay, JSON.stringify(res));
        const { summarize } = await import('../engine/index.js');
        res = summarize(res);
      }
      if (a.brief) for (const v of res.vehicles) { delete v.design; if (v.telemetry) { delete v.telemetry.timeline; delete v.telemetry.losses; } }
      return { ...res, replayFile: replay };
    },
  },
  {
    name: 'evaluate_bot',
    title: 'Benchmark a bot',
    description: 'Plays one bot against a field of opponents on several maps and seeds, both spawn sides, and returns its win rate overall, per opponent and per map, `lossesByOpponentAndMap` (how many matches it lost to each opponent on each map, so one call shows where the trouble is), how its vehicles died, the worst losses to replay with run_match (each with `damageDealt` and `opponentDealt`: a loss with next to no damage dealt is a car that never got to fight — look there first), and a `diagnosis`: the telemetry of all its matches added up, apart for wins and for losses — mean hull left and duration, death causes, the share of damage taken by weapon and by side hit, mean range and share of time per range band, fire-discipline totals (seconds with an enemy in gun range: firing, no line of sight, out of arc, energy-starved), the pieces it loses first, and `commonInsights`: each kind of finding with the number of matches it came up in and one example. What differs between the losses and the wins is what to fix. Use this to decide whether a change actually helped, then run_match one of the worst losses to see that match\'s own insights and telemetry.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Bot to evaluate (fills every slot of its team).' },
        mode: { type: 'string', enum: modeEnum, description: 'Default 1v1.' },
        opponents: { type: 'array', items: { type: 'string' }, description: 'Default: every built-in bot.' },
        maps: { type: 'array', items: { type: 'string', enum: MAP_IDS }, description: 'Default: all maps.' },
        seeds: { oneOf: [{ type: 'integer', minimum: 1, maximum: 5 }, { type: 'array', items: { type: 'integer', minimum: 1, maximum: 9999 }, minItems: 1, maxItems: 5, uniqueItems: true }],
          description: 'Seeds per pairing and map: a count n (seeds 1..n), or the seeds themselves, e.g. [3] to play only seed 3 after 1 and 2 were used to tune. Default 1.' },
        baseline: { type: 'string', description: 'Another bot to play through exactly the same matches — for instance the version you are trying to improve on. Adds `comparedWith`: its record next to yours per opponent (`vsOpponent` as text, `byOpponent` as numbers), and the matches whose result changed (`gained`, `lost`).' },
        budget: budgetSchema,
      },
      required: ['name'], additionalProperties: false,
    },
    run: async (a) => {
      const name = String(a.name);
      const mode = a.mode || '1v1';
      // a baseline that cannot be played is refused now, not after the whole field has been played
      const base = a.baseline !== undefined ? String(a.baseline) : null;
      if (base === name) throw new Error('baseline must be a different bot from the one being evaluated');
      const baseSource = base === null ? null : readBotSource(base);
      const opp = (a.opponents && a.opponents.length ? a.opponents.map(String) : listBots().filter((b) => b.kind === 'builtin').map((b) => b.id)).filter((id) => id !== name);
      const maps = a.maps && a.maps.length ? a.maps : MAP_IDS;
      const seeds = seedList(a.seeds);
      const entrants = [name, ...opp].map((id) => ({ id, bots: [id] }));
      const schedule = makeSchedule({ entrants, maps, seeds, focus: name });
      const sources = Object.fromEntries([name, ...opp].map((id) => [id, readBotSource(id)]));
      const byMap = {}, deaths = {}, losses = [], lostOn = {};
      let errors = 0;
      const results = await Promise.all(schedule.map(async (m) => {
        const mine = m.a === name ? 0 : 1;
        let r;
        try {
          const s = await pool.run({ map: m.map, mode, seed: m.seed, swap: m.swap, budget: a.budget ?? DEFAULT_BUDGET, want: 'digest',
            teams: m.teams.map((t) => t.map((id) => ({ id, source: sources[id] }))) });
          if (s.vehicles.some((v) => v.team === mine && v.errors.length)) errors++;
          r = tournamentResult(m, s);
          if (scoredResult(r)) {
            const won = r.winner === mine, draw = r.winner < 0;
            for (const v of s.vehicles) if (v.team === mine && v.death) deaths[v.death.cause] = (deaths[v.death.cause] || 0) + 1;
            if (!won && !draw) { const o = m.a === name ? m.b : m.a; (lostOn[o] ||= {})[m.map] = (lostOn[o][m.map] || 0) + 1; }
            if (!won && !draw) losses.push({ opponent: m.a === name ? m.b : m.a, map: m.map, seed: m.seed, swap: m.swap, reason: s.reason, duration: s.duration,
              hullLeft: [s.teams[mine].hull, s.teams[1 - mine].hull], damageDealt: s.teams[mine].damage, opponentDealt: s.teams[1 - mine].damage });
            r.digest = { outcome: won ? 'win' : draw ? 'draw' : 'loss', duration: s.duration, vehicles: s.vehicles.filter((v) => v.team === mine) };
          }
        } catch (e) {
          if (e.detail?.bot === name) errors++;
          r = tournamentResult(m, null, e);
        }
        if (scoredResult(r)) {
          const row = (byMap[m.map] ||= { w: 0, d: 0, l: 0 });
          row[r.winner === mine ? 'w' : r.winner === -1 ? 'd' : 'l']++;
        }
        return r;
      }));
      const table = standings(entrants, results);
      const me = table.find((r) => r.id === name);
      // the same matches with another bot in this one's place: what changed, opponent by opponent and match by match
      let comparedWith;
      if (base !== null) {
        const key = (m) => `${m.b}|${m.map}|${m.seed}|${m.swap ? 1 : 0}`;
        const mark = (w, mine) => (w === mine ? 'win' : w < 0 ? 'draw' : 'loss');
        const now = new Map(results.filter(scoredResult).map((m) => [key(m), mark(m.winner, 0)]));   // a match nobody could score is compared with nothing
        const then = new Map();
        await Promise.all(schedule.filter((m) => m.b !== base).map(async (m) => {
          try {
            const s = await pool.run({ map: m.map, mode, seed: m.seed, swap: m.swap, budget: a.budget ?? DEFAULT_BUDGET, want: 'score',
              teams: m.teams.map((t, side) => t.map((id) => (side === 0 ? { id: base, source: baseSource } : { id, source: sources[id] }))) });
            const r = tournamentResult(m, s);
            if (scoredResult(r)) then.set(key(m), mark(r.winner, 0));
          } catch (e) { if (e.detail && e.detail.bot === base) then.set(key(m), 'loss'); }
        }));
        const per = {}, gained = [], lost = [];
        let bw = 0, bl = 0, bd = 0;
        for (const m of schedule) {
          const k = key(m), was = then.get(k), is = now.get(k);
          if (was === undefined || is === undefined) continue;
          const row = (per[m.b] ||= { now: [0, 0], baseline: [0, 0] });
          if (is === 'win') row.now[0]++; else if (is === 'loss') row.now[1]++;
          if (was === 'win') { row.baseline[0]++; bw++; } else if (was === 'loss') { row.baseline[1]++; bl++; } else bd++;
          const at = { opponent: m.b, map: m.map, seed: m.seed, ...(m.swap ? { swap: true } : {}) };
          if (is === 'win' && was !== 'win') gained.push(at); else if (is !== 'win' && was === 'win') lost.push(at);
        }
        comparedWith = {
          baseline: base, baselineRecord: `${bw}W ${bd}D ${bl}L`,
          vsOpponent: Object.fromEntries(Object.entries(per).map(([o, r]) => [o, `now ${r.now[0]}-${r.now[1]}, baseline ${r.baseline[0]}-${r.baseline[1]} (${r.now[0] - r.baseline[0] >= 0 ? '+' : ''}${r.now[0] - r.baseline[0]})`])),
          byOpponent: Object.fromEntries(Object.entries(per).map(([o, r]) => [o, { wins: r.now[0], losses: r.now[1], baselineWins: r.baseline[0], baselineLosses: r.baseline[1], winsGained: r.now[0] - r.baseline[0] }])),
          matchesGained: gained.length, matchesLost: lost.length,
          lost: lost.slice(0, 12), gained: gained.slice(0, 12),
          note: lost.length > 12 || gained.length > 12 ? 'lists are cut at 12; replay any of them with run_match (team_a: you or the baseline, team_b: the opponent, same map, seed and swap)' : 'replay any of these with run_match (team_a: you or the baseline, team_b: the opponent, same map, seed and swap)',
        };
      }
      // the most one-sided first; among those, the ones in which this bot hurt nobody: something in it is broken, not outgunned
      losses.sort((x, y) => (y.hullLeft[1] - y.hullLeft[0]) - (x.hullLeft[1] - x.hullLeft[0]) || x.damageDealt - y.damageDealt);
      const failed = results.filter((r) => r.error);
      return {
        bot: name, mode, seeds, ...tournamentStatus(results, schedule.length), matches: me.played, wins: me.w, draws: me.d, losses: me.l, winRate: me.winRate,
        vsOpponent: Object.fromEntries(Object.entries(me.vs).map(([k, v]) => [k, `${v.w}W ${v.d}D ${v.l}L`])),
        byMap: Object.fromEntries(Object.entries(byMap).map(([k, v]) => [k, `${v.w}W ${v.d}D ${v.l}L`])),
        lossesByOpponentAndMap: lostOn,
        howMyVehiclesDied: deaths,
        ...(comparedWith ? { comparedWith } : {}),
        diagnosis: diagnose(results.filter((r) => r.digest).map((r) => r.digest)),
        matchesWithMyRuntimeErrors: errors,
        worstLosses: losses.slice(0, 6).map((l) => ({ ...l,
          replayWith: `run_match ${JSON.stringify({ team_a: [name], team_b: [l.opponent], mode, map: l.map, seed: l.seed, ...(l.swap ? { swap: true } : {}) })}` })),
        failedMatches: failed.slice(0, 3).map((r) => r.error),
      };
    },
  },
  {
    name: 'run_tournament',
    title: 'Round robin',
    description: 'Round-robin between several bots (each fills its whole team) over maps x seeds x both sides. Returns standings, head-to-head results and completion counts. Attributed controller failures forfeit; runtime errors or unattributed failures are unscored, not draws.',
    inputSchema: {
      type: 'object',
      properties: {
        bots: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'Default: every bot.' },
        mode: { type: 'string', enum: modeEnum },
        maps: { type: 'array', items: { type: 'string', enum: MAP_IDS } },
        seeds: { type: 'integer', minimum: 1, maximum: 5, description: 'Default 1.' },
        budget: budgetSchema,
      },
      additionalProperties: false,
    },
    run: async (a) => {
      const ids = a.bots && a.bots.length ? a.bots.map(String) : listBots().map((b) => b.id);
      const mode = a.mode || '1v1';
      const maps = a.maps && a.maps.length ? a.maps : MAP_IDS;
      const seeds = Array.from({ length: a.seeds || 1 }, (_, i) => i + 1);
      const entrants = ids.map((id) => ({ id, bots: [id] }));
      const schedule = makeSchedule({ entrants, maps, seeds });
      if (schedule.length > 1500) throw new Error(`${schedule.length} matches is too many for one call; use fewer bots, maps or seeds`);
      const sources = Object.fromEntries(ids.map((id) => [id, readBotSource(id)]));
      const results = await Promise.all(schedule.map(async (m) => {
        try {
          const s = await pool.run({ map: m.map, mode, seed: m.seed, swap: m.swap, budget: a.budget ?? DEFAULT_BUDGET, want: 'score',
            teams: m.teams.map((t) => t.map((id) => ({ id, source: sources[id] }))) });
          return tournamentResult(m, s);
        } catch (e) {
          return tournamentResult(m, null, e);
        }
      }));
      const table = standings(entrants, results);
      return {
        mode, maps, seeds: seeds.length, matches: results.length, ...tournamentStatus(results, schedule.length),
        standings: table.map((r, i) => ({ rank: r.played ? i + 1 : null, bot: r.id, played: r.played, unscored: r.unscored, points: r.points, w: r.w, d: r.d, l: r.l, winRate: r.winRate, hullDiff: r.hullDiff })),
        headToHead: Object.fromEntries(table.map((r) => [r.id, Object.fromEntries(Object.entries(r.vs).map(([k, v]) => [k, `${v.w}-${v.d}-${v.l}`]))])),
        errors: results.filter((r) => r.error).slice(0, 3).map((r) => r.error),
      };
    },
  },
  {
    name: 'leaderboard',
    title: 'Leaderboard',
    description: 'The standing ladder of every bot on this server, built-in and submitted, rated in three queues. 1v1 is a full round robin on every map from both sides. 2v2 and 3v3 are played on mixed teams: each round the bots are dealt into teams, keeping bots by the same author (the `author` in a bot\'s `meta`) apart where the numbers allow, and each pairing rotates every bot through every slot from both spawn sides. A team-queue rating estimates individual contribution. Returns rank, recorded model, rating, W-D-L and win rate per bot, and the same grouped by author (ordered by best bot). Zero-game entrants are unranked; unknown model attribution stays empty. Only matches that are not on file are played, and a call plays for about 40 seconds at most: when `complete` is false the tables are from the season so far, and calling again carries on. Pass `mode` to bring one queue up to date.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: QUEUES, description: 'One queue only. Default: all three.' },
        top: { type: 'integer', minimum: 1, maximum: 500, description: 'Rows to return per queue. Default: all.' },
      },
      additionalProperties: false,
    },
    run: async (a) => {
      const board = await ladder(pool, { queues: a.mode ? [a.mode] : QUEUES, budgetMs: LADDER_BUDGET_MS });
      if (a.top) for (const t of Object.values(board.queues)) t.standings = t.standings.slice(0, a.top);
      if (!board.complete) {
        const left = Object.values(board.queues).reduce((n, t) => n + t.matches - t.onFile, 0);
        board.note = `${left} matches of this season are still to be played: the tables below are from what is on file so far. Call leaderboard again to carry on.`;
      }
      return board;
    },
  },
  {
    name: 'list_replays',
    title: 'Saved replays',
    description: 'Lists the replays saved on this server by run_match with save_replay: true, newest first. Read one back with get_replay.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!fs.existsSync(REPLAY_DIR)) return { replays: [] };
      const replays = fs.readdirSync(REPLAY_DIR).filter((f) => f.endsWith('.json')).map((f) => { const st = fs.statSync(path.join(REPLAY_DIR, f)); return { file: f, kB: Math.round(st.size / 1024), saved: st.mtime.toISOString() }; });
      return { replays: replays.sort((x, y) => (x.saved < y.saved ? 1 : -1)).slice(0, 100) };
    },
  },
  {
    name: 'get_replay',
    title: 'Read a replay',
    description: 'Reads back a replay that run_match saved, in a form small enough to reason about. view "summary": the battle report (result, per-vehicle stats, first pieces lost, your api.log lines). view "events": everything that happened in a time window, in order — pieces lost and to what, fires, hooks, punches, blasts, pickups, deaths. view "trace": where every vehicle was and in what state, sampled every `step` seconds — use it to see what your controller actually did: where it drove, when it stood still, when it started losing hull. view "telemetry": per vehicle (or for the one `vehicle` id) its insights and its full telemetry, with a legend — who hurt it with what, from which side and at what range, what each of its weapons did, what kept its guns silent, the pieces it lost and a 2-second timeline. A good order: "telemetry" for what went wrong, "events" and "trace" around the moment it went wrong, then change the bot and run the match again. The frame-by-frame file itself stays on the server for the web viewer.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'A file name from list_replays, or the replayFile that run_match returned.' },
        view: { type: 'string', enum: ['summary', 'events', 'trace', 'telemetry'], description: 'Default "summary".' },
        vehicle: { type: 'integer', minimum: 0, description: 'telemetry only: the id of the one vehicle to return. Default: all.' },
        from: { type: 'number', minimum: 0, description: 'Start of the window in seconds. Default 0.' },
        to: { type: 'number', minimum: 0, description: 'End of the window in seconds. Default: the end of the match.' },
        step: { type: 'number', minimum: 0.1, maximum: 10, description: 'trace only: seconds between samples. Default 0.5; widened if the window would give more than 400 rows.' },
        kinds: { type: 'array', items: { type: 'string' }, description: 'events only: keep these kinds, e.g. ["part", "death", "fire", "hook"]. Default: all.' },
      },
      required: ['file'], additionalProperties: false,
    },
    run: async (a) => {
      const name = path.basename(String(a.file));
      if (!/^[\w.+-]+\.json$/.test(name)) throw new Error('file must be a replay file name ending in .json, as list_replays gives it');
      const full = path.join(REPLAY_DIR, name);
      if (!fs.existsSync(full)) throw new Error(`no replay "${name}" here; list_replays shows what is saved (run_match with save_replay: true saves one)`);
      const res = JSON.parse(fs.readFileSync(full, 'utf8'));
      const view = a.view || 'summary';
      if (view === 'summary') return summarize(res);
      if (view === 'telemetry') return { file: name, ...telemetryView(res, a.vehicle) };
      const from = a.from ?? 0, to = Math.min(a.to ?? res.duration, res.duration);
      if (!(to >= from)) throw new Error(`the window is empty: from ${from} to ${to} (the match lasted ${res.duration} s)`);
      const vehicles = res.vehicles.map((v) => ({ id: v.id, team: v.team, name: v.name, bot: v.bot }));
      if (view === 'events') {
        const kinds = a.kinds && a.kinds.length ? new Set(a.kinds.map(String)) : null;
        const all = res.events.filter((e) => e.t >= from && e.t <= to && (!kinds || kinds.has(e.k)));
        const piece = (e) => (e.k === 'part' && res.vehicles[e.v] ? { ...e, type: res.vehicles[e.v].design.parts[e.i].type } : e);
        return { file: name, window: [from, to], vehicles, kindsSeen: [...new Set(all.map((e) => e.k))], shown: Math.min(all.length, 400), total: all.length,
          note: all.length > 400 ? 'more than 400 events in this window: narrow it with from/to or kinds' : undefined,
          legend: 'k = kind, t = seconds, v = vehicle id, i = piece index, c = cause; a "part" event is a piece lost', events: all.slice(0, 400).map(piece) };
      }
      if (!res.frames || !res.frames.length) throw new Error('this replay has no frames');
      let step = a.step ?? 0.5;
      if ((to - from) / step > 400) step = Math.ceil(((to - from) / 400) * 10) / 10;
      const rows = [];
      const tracks = res.vehicles.map((v) => (v.telemetry && v.telemetry.track) || null);
      let next = from;
      for (const f of res.frames) {
        if (f.t + 1e-9 < next || f.t > to + 1e-9) continue;
        next = f.t + step;
        rows.push([f.t, ...f.v.map((r, vi) => {
          const state = !(r[6] & FLAG.alive) ? 'dead' : [r[6] & FLAG.fire && 'burning', r[6] & FLAG.stun && 'stunned', r[6] & FLAG.boost && 'boosting', r[6] & FLAG.hover && 'hovering'].filter(Boolean).join('+');
          const row = [r[0], r[1], Math.round((r[2] * 180) / Math.PI), Math.round(r[5] * 100), Math.round(r[3] * 100), state];
          // what its controller was asking for, and what it stood on, at the nearest half second
          // (sample n of the track was taken at (n + 1) steps: there is none for the instant the match starts)
          const k = tracks[vi], n = k ? Math.round(f.t / k.step) - 1 : -1;
          if (k && n >= 0 && n < k.throttle.length) row.push(k.throttle[n], k.steer[n], k.fire[n], k.tile[n]);
          return row;
        })]);
      }
      return { file: name, window: [from, to], step, vehicles, tilesAreMetres: TILE,
        legend: 'each row: [t, then one entry per vehicle in the order of `vehicles`: [x m, y m, heading deg, hull %, energy %, state'
          + (tracks.some(Boolean) ? ', throttle asked -1..1, steer asked -1..1, fire asked 0/1, tile underneath]]. The last four are absent before the first half second and once the vehicle is dead. In the pictures list_maps gives, a tile is in column floor(x / ' + TILE + ') counted from the left and in row floor(y / ' + TILE + ') counted from the BOTTOM: y grows northwards and the first row listed is the far north.' : ']]'), rows };
    },
  },
];
const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const PROMPTS = [{
  name: 'build-a-bot',
  title: 'Design a vehicle and its strategy',
  description: 'Kick-off prompt: read the rules, design a vehicle within budget, write the controller, test and iterate.',
  arguments: [
    { name: 'mode', description: '1v1, 2v2 or 3v3 (default 1v1)', required: false },
    { name: 'idea', description: 'Optional style to aim for, e.g. "hover sniper" or "ramming tank"', required: false },
  ],
}];

function promptText({ mode = '1v1', idea } = {}) {
  return `You are entering the Ironyard arena (mode ${mode}). Using the ironyard tools:
1. Call get_rules and read it fully. Skim list_maps and one or two built-in bots with get_bot (rookie is the baseline).
2. Design a vehicle${idea ? ` in this style: ${idea}` : ''} on the two-layer stud grid. Iterate with validate_design until it is legal and the stats match your plan (top speed, turn rate, dps, energy balance). Give it a paint accent and a few free decor pieces so it has a look of its own.
3. Write the controller file (design + tick) and submit_bot it under a new name.
4. run_match against rookie and two different archetypes. Read each vehicle's \`insights\` first (why it won or lost, with numbers), then the \`telemetry\` they point at (who hurt you with what, from which side and at what range; what kept your guns silent; what you lost first) and your api.log lines. For where and when, run it with save_replay and read get_replay (views "trace", "events", "telemetry").
5. evaluate_bot for the win-rate table and its \`diagnosis\` (what your losses have in common that your wins do not), fix that in the bot or the blueprint, replay the worst losses, and repeat until it beats rookie everywhere and holds its own against the rest.
Finish by reporting the final bot name, its design picture, the strategy in three sentences, and its evaluate_bot table.`;
}

// ── results ─────────────────────────────────────────────────────────────
// JSON an agent pays for by the token: anything that fits on a line stays on one.
function pretty(v, indent = '', width = 120) {
  const flat = JSON.stringify(v);
  if (flat === undefined) return 'null';
  if (v === null || typeof v !== 'object' || flat.length <= width - indent.length) return flat;
  const inner = indent + ' ';
  if (Array.isArray(v) && v.every((x) => typeof x === 'number' || x === null)) {   // a long row of numbers (a telemetry timeline) is wrapped, not stood on end
    const rows = [''];
    for (const x of v) {
      const s = JSON.stringify(x), k = rows.length - 1;
      if (rows[k] && rows[k].length + s.length + 2 > width - inner.length) rows.push(s); else rows[k] += (rows[k] ? ', ' : '') + s;
    }
    return `[\n${rows.map((r) => inner + r).join(',\n')}\n${indent}]`;
  }
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + pretty(x, inner, width)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, inner, width)}`).join(',\n')}\n${indent}}`;
}

// ── arguments ───────────────────────────────────────────────────────────
// Agents get argument shapes slightly wrong in a handful of predictable ways: one name where a list
// is wanted, a number or an object sent as text, a misspelt optional argument that then silently
// does nothing. The first three are taken as meant; everything else is refused with a message that
// says what was expected, so the next call can be right.
function fit(name, schema, v) {
  const say = (what) => { throw new Error(`argument "${name}" ${what}, got ${JSON.stringify(v) === undefined ? typeof v : JSON.stringify(v).slice(0, 80)}`); };
  if (schema.oneOf) {   // the first form it fits
    for (const form of schema.oneOf) { try { return fit(name, form, v); } catch { /* try the next */ } }
    say(`must be ${schema.oneOf.map((f) => (f.type === 'integer' ? `a whole number ${f.minimum ?? ''}..${f.maximum ?? ''}` : f.type === 'array' ? `a list of ${f.minItems ?? 0}..${f.maxItems ?? 'any number of'} of them` : `a ${f.type}`)).join(' or ')}`);
  }
  if (typeof v === 'string' && (schema.type === 'object' || schema.type === 'array' || schema.type === 'integer' || schema.type === 'boolean')) {
    const t = v.trim();
    if (schema.type === 'array' && !t.startsWith('[')) v = [v];
    else { try { v = JSON.parse(t); } catch { say(`must be ${schema.type === 'integer' ? 'a whole number' : `a JSON ${schema.type}`}`); } }
  }
  if (schema.type === 'string') {
    if (typeof v !== 'string') say('must be a string');
    if (schema.enum && !schema.enum.includes(v)) say(`must be one of ${schema.enum.join(', ')}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) say(`must match ${schema.pattern}`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(v)) say('must be a whole number');
    if ((schema.minimum !== undefined && v < schema.minimum) || (schema.maximum !== undefined && v > schema.maximum)) say(`must be between ${schema.minimum ?? '-∞'} and ${schema.maximum ?? '∞'}`);
  } else if (schema.type === 'boolean') {
    if (typeof v !== 'boolean') say('must be true or false');
  } else if (schema.type === 'array') {
    if (!Array.isArray(v)) say('must be a list');
    if ((schema.minItems !== undefined && v.length < schema.minItems) || (schema.maxItems !== undefined && v.length > schema.maxItems)) say(`must have ${schema.minItems ?? 0} to ${schema.maxItems ?? 'any number of'} entries`);
    if (schema.items) v = v.map((x, i) => fit(`${name}[${i}]`, schema.items, x));
  } else if (schema.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) say('must be an object');
  }
  return v;
}
function checkArgs(tool, given) {
  const props = tool.inputSchema.properties || {};
  if (typeof given === 'string') { try { given = JSON.parse(given); } catch { given = null; } }
  const args = given && typeof given === 'object' && !Array.isArray(given) ? given : {};
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    if (!props[k]) throw new Error(`${tool.name} has no argument "${k}". It takes: ${Object.keys(props).map((p) => p + ((tool.inputSchema.required || []).includes(p) ? ' (required)' : '')).join(', ') || 'nothing'}`);
    out[k] = fit(k, props[k], v);
  }
  for (const req of tool.inputSchema.required || []) if (out[req] === undefined) throw new Error(`missing required argument "${req}": ${props[req].description || ''}`);
  return out;
}

// ── JSON-RPC plumbing ───────────────────────────────────────────────────
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

async function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return rpcError(msg && msg.id, -32600, 'Invalid Request');
  const { id, method, params = {} } = msg;
  const isNote = id === undefined || id === null;
  if (typeof method !== 'string') return isNote ? null : rpcError(id, -32600, 'Invalid Request'); // a response from the client: ignore
  const ok = (result) => (isNote ? null : { jsonrpc: '2.0', id, result });
  try {
    switch (method) {
      case 'initialize': {
        const want = params.protocolVersion;
        return ok({
          protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
          capabilities: { tools: {}, prompts: {}, resources: {} },
          serverInfo: SERVER,
          instructions: 'Ironyard: design a vehicle within a budget and write its controller, then test offline. Start with get_rules. Typical loop: validate_design → submit_bot → run_match (read each vehicle\'s insights, then its telemetry; get_replay for the trace) → change the bot → evaluate_bot (win rates and a diagnosis of the losses) → repeat.',
        });
      }
      case 'notifications/initialized': case 'notifications/cancelled': case 'notifications/roots/list_changed': return null;
      case 'ping': return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
      case 'tools/call': {
        const tool = TOOL_BY_NAME[params.name];
        if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
        try {
          const args = checkArgs(tool, params.arguments);
          const out = await tool.run(args);
          return ok({ content: [{ type: 'text', text: typeof out === 'string' ? out : pretty(out) }] });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Error: ${e && e.message ? e.message : e}` }], isError: true });
        }
      }
      case 'prompts/list': return ok({ prompts: PROMPTS });
      case 'prompts/get': {
        if (params.name !== 'build-a-bot') return rpcError(id, -32602, `Unknown prompt: ${params.name}`);
        return ok({ description: PROMPTS[0].description, messages: [{ role: 'user', content: { type: 'text', text: promptText(params.arguments || {}) } }] });
      }
      case 'resources/list':
        return ok({ resources: [{ uri: 'ironyard://rules', name: 'rules', title: 'Ironyard rulebook', description: 'Rules and controller contract', mimeType: 'text/markdown' }] });
      case 'resources/templates/list': return ok({ resourceTemplates: [] });
      case 'resources/read': {
        if (params.uri !== 'ironyard://rules') return rpcError(id, -32002, `Resource not found: ${params.uri}`);
        return ok({ contents: [{ uri: params.uri, mimeType: 'text/markdown', text: rulesMarkdown() }] });
      }
      default:
        return isNote ? null : rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return isNote ? null : rpcError(id, -32603, `Internal error: ${e && e.message}`);
  }
}

// ── transports ──────────────────────────────────────────────────────────
function serveStdio() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = 0, closed = false;
  const maybeExit = async () => { if (closed && pending === 0) { await pool.close(); process.exit(0); } };
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify(rpcError(null, -32700, 'Parse error')) + '\n'); return; }
    if (overfull(msg)) { process.stdout.write(JSON.stringify(rpcError(null, -32600, BATCH_MSG)) + '\n'); return; }
    pending++;
    try {
      const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
      if (out && (!Array.isArray(out) || out.length)) process.stdout.write(JSON.stringify(out) + '\n');
    } finally { pending--; maybeExit(); }
  });
  rl.on('close', () => { closed = true; maybeExit(); });
  log(`stdio ready — ${TOOLS.length} tools, bots in ${USER_DIR}`);
}

/** How long a call may run before an HTTP client that accepts an event stream is answered with one (see serveHttp). */
const SSE_AFTER_MS = Number(process.env.IRONYARD_SSE_AFTER_MS) > 0 ? Number(process.env.IRONYARD_SSE_AFTER_MS) : 5000;

function serveHttp(port, host) {
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  // IRONYARD_TOKEN: when set, every call to /mcp must carry `Authorization: Bearer <token>`
  const token = process.env.IRONYARD_TOKEN || '';
  const want = token ? crypto.createHash('sha256').update('Bearer ' + token).digest() : null;
  const allowed = (req) => !want || crypto.timingSafeEqual(want, crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest());
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    if (origin && !localOrigin.test(origin) && process.env.IRONYARD_ALLOW_ORIGIN !== '*' && process.env.IRONYARD_ALLOW_ORIGIN !== origin) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('origin not allowed'); return;
    }
    const cors = origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, GET, OPTIONS' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json', ...cors }).end(JSON.stringify({ ok: true, ...SERVER })); return; }
    if (url.pathname !== '/mcp') { res.writeHead(404, cors).end('not found'); return; }
    if (!allowed(req)) { res.writeHead(401, { 'content-type': 'text/plain', 'www-authenticate': 'Bearer', ...cors }).end('this server wants `Authorization: Bearer <token>`'); return; }
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST', ...cors }).end('this server answers POST only (no server-initiated stream)'); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(body); } catch {
        res.writeHead(400, { 'content-type': 'application/json', ...cors }).end(JSON.stringify(rpcError(null, -32700, 'Parse error'))); return;
      }
      if (overfull(msg)) { res.writeHead(400, { 'content-type': 'application/json', ...cors }).end(JSON.stringify(rpcError(null, -32600, BATCH_MSG))); return; }
      const work = Array.isArray(msg) ? Promise.all(msg.map(handle)).then((a) => a.filter(Boolean)) : handle(msg);
      // A call that takes minutes (evaluate_bot over a field, the ladder) must not leave the client waiting for headers:
      // most HTTP clients give up on those after five minutes. A client that accepts an event stream gets one once the
      // call has run for SSE_AFTER_MS — headers at once, a comment line every 15 s, then the answer as the one event.
      let out;
      if (/text\/event-stream/.test(String(req.headers.accept || ''))) {
        let patience;
        const quick = await Promise.race([work.then((v) => ({ v })), new Promise((r) => { patience = setTimeout(r, SSE_AFTER_MS, null); })]);
        clearTimeout(patience);   // a call that answered first must not leave its timer running behind it
        if (quick) out = quick.v;
        else {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...cors });
          res.write(': working\n\n');
          const beat = setInterval(() => res.write(': working\n\n'), 15_000);
          try { out = await work; } finally { clearInterval(beat); }
          for (const m of Array.isArray(out) ? out : out ? [out] : []) res.write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
          res.end(); return;
        }
      } else out = await work;
      if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202, cors).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json', ...cors }).end(JSON.stringify(out));
    });
  });
  server.listen(port, host, () => {
    log(`Streamable HTTP ready on http://${host}:${port}/mcp — ${TOOLS.length} tools, bots in ${USER_DIR}${token ? ', token required' : ''}`);
    if (!token && !/^(127\.|localhost$|::1$|\[::1\]$)/.test(host)) {
      log(`WARNING: listening on ${host} with no IRONYARD_TOKEN — anyone who can reach this port can submit controllers and have them run here.`);
    }
  });
}

const argv = process.argv.slice(2);
const hi = argv.indexOf('--http');
if (argv.includes('--help')) {
  console.log('ironyard-mcp            stdio transport\nironyard-mcp --http 8787 [--host 127.0.0.1]   Streamable HTTP at /mcp\n\nenvironment: IRONYARD_BOTS_DIR, IRONYARD_REPLAY_DIR, IRONYARD_SSE_AFTER_MS, IRONYARD_MATCH_TIMEOUT_MS,\n  IRONYARD_TOKEN (HTTP: require `Authorization: Bearer <token>`), IRONYARD_ALLOW_ORIGIN (HTTP: a browser origin to accept, or *)');
} else if (hi >= 0) {
  const hostI = argv.indexOf('--host');
  serveHttp(Number(argv[hi + 1] || 8787), hostI >= 0 ? argv[hostI + 1] : '127.0.0.1');
} else serveStdio();
