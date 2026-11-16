#!/usr/bin/env node
// Ironyard command line: run matches and tournaments offline.
import fs from 'node:fs';
import path from 'node:path';
import {
  MAPS, MAP_IDS, MODES, PARTS, ITEMS, TILES, BUDGETS, DEFAULT_BUDGET,
  validateDesign, renderDesign, makeSchedule, standings, describeMap, tournamentResult, tournamentStatus, scoredResult,
} from '../engine/index.js';
import { listBots, readBotSource, ROOT } from './loader.js';
import { ladder, ladderMarkdown, ladderSnapshot, QUEUES } from './ladder.js';
import { MatchPool, withSources } from './runner.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true; else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}
const list = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
const budgetOf = (b) => (b === undefined ? DEFAULT_BUDGET : BUDGETS[b] ?? Number(b));

const HELP = `ironyard — agents build the car and write the strategy

  ironyard match --a rookie --b bulldozer [--map proving] [--mode 1v1] [--seed 1] [--swap]
                 [--budget 1200|light|standard|heavy] [--replay out.json] [--json]
      team modes: --mode 2v2 --a bastion,medic --b hornet,hornet   (one id = fill every slot)
      a bot can also be a path to a .js file
  ironyard tournament [--bots all|a,b,c] [--mode 1v1] [--maps all|proving,sumo] [--seeds 2] [--json]
  ironyard validate <bot|file.js> [--budget N]
  ironyard ladder [--mode 1v1|2v2|3v3|all] [--write] [--json]
      rates every bot here: 1v1 round robin, and 2v2 / 3v3 on mixed teams. Plays only what is not on file.
      --write also saves the tables to LEADERBOARD.md and to web/ladder.json for the page's League tab
  ironyard bots | maps | parts
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!cmd || cmd === 'help' || args.help) return console.log(HELP);

  if (cmd === 'bots') {
    for (const b of listBots()) console.log(`${b.id.padEnd(14)} ${b.kind}`);
    return;
  }
  if (cmd === 'maps') {
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      console.log(`\n${id} — ${m.name}  (${m.w}x${m.h} tiles, ${m.width}x${m.height} m)\n${m.desc}`);
      console.log(m.rows.join('\n'));
    }
    console.log('\nlegend: ' + Object.values(TILES).map((t) => `${t.ch}=${t.name}`).join('  ') + '  A/B/C,a/b/c=spawns  *=item');
    return;
  }
  if (cmd === 'parts') {
    console.log('id'.padEnd(10) + 'cost'.padStart(5) + 'mass'.padStart(6) + 'hp'.padStart(5) + '  description');
    for (const p of Object.values(PARTS)) console.log(p.id.padEnd(10) + String(p.cost).padStart(5) + String(p.mass).padStart(6) + String(p.hp).padStart(5) + '  ' + p.desc);
    console.log('\nitems:');
    for (const [id, it] of Object.entries(ITEMS)) console.log(`${id.padEnd(10)} ${it.desc}`);
    return;
  }

  const pool = new MatchPool({ timeoutMs: Number(args.timeout || 60000) });
  const fileBots = {};
  const botId = (spec) => {
    if (spec.endsWith('.js') || spec.includes('/')) {
      const id = path.basename(spec, '.js');
      fileBots[id] = fs.readFileSync(path.resolve(spec), 'utf8');
      return id;
    }
    return spec;
  };
  try {
    if (cmd === 'validate') {
      const id = botId(args._[0] || '');
      const source = fileBots[id] ?? readBotSource(id);
      const budget = budgetOf(args.budget);
      let ok = true;
      for (const mode of Object.keys(MODES)) {
        try {
          const s = await pool.run({ map: 'proving', mode, seed: 1, budget, maxTime: 6, want: 'summary',
            teams: [[{ id, source }], [{ id: 'rookie', source: readBotSource('rookie') }]] });
          for (const v of s.vehicles.filter((x) => x.team === 0)) {
            console.log(`${mode} slot ${v.slot}: ${v.name} — cost ${v.design.cost}, mass ${v.design.mass} kg, top speed ${v.design.topSpeed} m/s, dps ${v.design.dps}` + (v.errors.length ? `\n   errors: ${v.errors.join(' | ')}` : ''));
            if (v.errors.length) ok = false;
          }
        } catch (e) { ok = false; console.log(`${mode}: FAILED — ${e.message}`); }
      }
      console.log(ok ? 'OK' : 'NOT OK');
      process.exitCode = ok ? 0 : 1;
      return;
    }

    if (cmd === 'match') {
      if (!args.a || !args.b) return console.log(HELP);
      const teams = [list(args.a).map(botId), list(args.b).map(botId)];
      const spec = { map: args.map || 'proving', mode: args.mode || '1v1', seed: Number(args.seed || 0), swap: !!args.swap,
        budget: budgetOf(args.budget), teams: withSources(teams, fileBots), want: args.replay ? 'full' : 'summary' };
      let res = await pool.run(spec);
      if (args.replay) {
        fs.writeFileSync(args.replay, JSON.stringify(res));
        console.error(`replay written to ${args.replay} (${(fs.statSync(args.replay).size / 1024).toFixed(0)} kB)`);
        const { summarize } = await import('../engine/index.js');
        res = summarize(res);
      }
      if (args.json) return console.log(JSON.stringify(res, null, 2));
      console.log(`${res.mode} on ${res.map}, seed ${res.seed}${res.swap ? ' (sides swapped)' : ''}: ${res.result.toUpperCase()} — ${res.reason}, ${res.duration}s`);
      for (const v of res.vehicles) {
        const s = v.stats;
        console.log(`  team ${v.team} ${v.name.padEnd(14)} ${v.alive ? 'alive' : `dead @${v.death.t}s (${v.death.cause})`.padEnd(5)}  hull ${(v.hullLeft * 100).toFixed(0)}%  dealt ${s.damageDealt}  taken ${s.damageTaken}  kills ${s.kills}  acc ${s.accuracy ?? '-'}  dist ${s.distance}m` + (v.errors.length ? `  ERRORS: ${v.errors[0]}` : ''));
      }
      console.log(res.timeline.map((l) => '  ' + l).join('\n'));
      return;
    }

    if (cmd === 'tournament') {
      const mode = args.mode || '1v1';
      const ids = !args.bots || args.bots === 'all' ? listBots().map((b) => b.id) : list(args.bots).map(botId);
      const maps = !args.maps || args.maps === 'all' ? MAP_IDS : list(args.maps);
      const seeds = Array.from({ length: Number(args.seeds || 2) }, (_, i) => i + 1);
      const entrants = ids.map((id) => ({ id, bots: [id] }));
      const schedule = makeSchedule({ entrants, maps, seeds, focus: args.focus ? botId(args.focus) : null });
      const budget = budgetOf(args.budget);
      console.error(`${schedule.length} matches: ${ids.length} bots x ${maps.length} maps x ${seeds.length} seeds x 2 sides, mode ${mode}`);
      // Freeze one source per entrant for the entire tournament, including file bots.
      const sources = Object.fromEntries(ids.map(id => [id, fileBots[id] ?? readBotSource(id)]));
      let done = 0, totalDur = 0;
      const reasons = {};
      const results = await Promise.all(schedule.map(async (m) => {
        let r;
        try {
          const res = await pool.run({ map: m.map, mode, seed: m.seed, swap: m.swap, budget, teams: withSources(m.teams, sources), want: 'score' });
          r = tournamentResult(m, res);
          if (scoredResult(r)) { totalDur += res.duration; reasons[res.reason] = (reasons[res.reason] || 0) + 1; }
        } catch (e) {
          r = tournamentResult(m, null, e);
        }
        if (++done % 20 === 0) process.stderr.write(`\r${done}/${schedule.length}`);
        return r;
      }));
      process.stderr.write(`\r${done}/${schedule.length}\n`);
      const table = standings(entrants, results);
      const status = tournamentStatus(results, schedule.length);
      if (status.errorCount || !status.complete) process.exitCode = 1;
      if (args.json) return console.log(JSON.stringify({ mode, maps, seeds, ...status, standings: table, results }, null, 2));
      console.log(`${status.complete ? 'Complete' : 'Provisional'}: ${status.scoredMatches}/${schedule.length} scored, ${status.unscoredMatches} unscored`);
      console.log('#  bot            pts    W   D   L   win%  hullΔ');
      table.forEach((r, i) => console.log(`${String(r.played ? i + 1 : "—").padEnd(2)} ${r.id.padEnd(14)} ${String(r.points).padStart(3)}  ${String(r.w).padStart(3)} ${String(r.d).padStart(3)} ${String(r.l).padStart(3)}  ${(r.winRate * 100).toFixed(0).padStart(4)}  ${r.hullDiff.toFixed(1).padStart(6)}`));
      console.log(`avg completed match ${(totalDur / Math.max(1, results.filter(r => scoredResult(r) && !r.forfeit).length)).toFixed(1)}s; endings: ${Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join(', ')}`);
      if (args.matrix) {
        console.log('\nwins (row beat column):\n' + ''.padEnd(11) + table.map((r) => r.id.slice(0, 6).padStart(7)).join(''));
        for (const r of table) console.log(r.id.padEnd(11) + table.map((c) => (c.id === r.id ? '   -' : `${r.vs[c.id]?.w ?? 0}/${(r.vs[c.id]?.w ?? 0) + (r.vs[c.id]?.d ?? 0) + (r.vs[c.id]?.l ?? 0)}`).padStart(7)).join(''));
      }
      const errs = results.filter((r) => r.error);
      if (errs.length) console.log(`\n${errs.length} matches errored, e.g.: ${errs[0].error}`);
      return;
    }
    if (cmd === 'ladder') {
      const mode = args.mode && args.mode !== 'all' ? String(args.mode) : null;
      if (mode && !QUEUES.includes(mode)) throw new Error(`unknown mode "${mode}". Valid: ${QUEUES.join(', ')}, all`);
      const board = await ladder(pool, { queues: mode ? [mode] : QUEUES });
      if (args.json) return console.log(JSON.stringify(board));
      console.log(`${board.entrants} bots, ${board.matchesPlayedNow} matches played just now (the rest were on file)`);
      for (const [q, t] of Object.entries(board.queues)) {
        console.log(`\n${q} — ${t.onFile} matches\n` + '#'.padStart(3) + '  ' + 'bot'.padEnd(16) + 'author'.padEnd(16) + 'rating'.padStart(7) + 'played'.padStart(8) + '  W-D-L'.padEnd(14) + 'win%'.padStart(5));
        for (const r of t.standings) console.log(String(r.rank ?? '—').padStart(3) + '  ' + r.id.padEnd(16) + r.author.slice(0, 15).padEnd(16) + String(r.rating).padStart(7) + String(r.played).padStart(8) + ('  ' + r.w + '-' + r.d + '-' + r.l).padEnd(14) + String(Math.round(r.winRate * 100)).padStart(5));
      }
      if (board.errors) console.log(`\nmatches that could not be played, e.g.: ${board.errors[0]}`);
      if (args.write) {
        if (mode) throw new Error('--write saves all three queues: run it without --mode');
        if (!board.complete || board.errors?.length) throw new Error('refusing to publish an incomplete or error-containing ladder; fix the reported matches and rerun');
        const file = path.join(ROOT, 'LEADERBOARD.md'), snap = path.join(ROOT, 'web', 'ladder.json');
        fs.writeFileSync(file, ladderMarkdown(board));
        // the same tables for the page's League tab: `npm run build` puts them into dist/index.html
        fs.writeFileSync(snap, JSON.stringify(ladderSnapshot(board)));
        console.log(`\nwrote ${file}\nwrote ${snap} (run \`npm run build\` to put it on the page)`);
      }
      return;
    }
    console.log(HELP);
  } catch (e) {
    console.error('error: ' + e.message);
    process.exitCode = 1;
  } finally {
    await pool.close();
  }
}
main();
