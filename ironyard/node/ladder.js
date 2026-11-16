// The ladder: every bot on this machine — built-in and submitted — rated in three queues.
//
//   1v1   a full round robin: every pair, every map, both spawn sides.
//   2v2   mixed teams. Each round the entrants are dealt into teams, keeping bots by the same
//   3v3   author apart wherever the numbers allow, and the teams are paired off. A bot's rating
//         in a team queue says how much a team gains by having it, whoever else is on it.
//
// Matches are deterministic, so a result is kept under a key made of the match and of the
// source of every bot in it: bringing the ladder up to date only plays what is not on file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAP_IDS, makeSchedule, ENGINE_VERSION, DEFAULT_BUDGET } from '../engine/index.js';
import { ROOT, listBots, readBotSource } from './loader.js';
import { withSources } from './runner.js';

export const LADDER_DIR = process.env.IRONYARD_LADDER_DIR ? path.resolve(process.env.IRONYARD_LADDER_DIR) : path.join(ROOT, 'ladder');
export const QUEUES = ['1v1', '2v2', '3v3'];
// rounds per team queue: at least 40, and a whole number of times round the maps, so that every map is played equally often
export const TEAM_ROUNDS = Math.ceil(40 / MAP_IDS.length) * MAP_IDS.length;
export const LADDER_METHOD = 'mixed-slot-rotation-v2';
const SEED = 1, START = 1500, PRIOR = 2;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const storeFile = () => path.join(LADDER_DIR, 'results.json');
export const RESULT_CHECK = 3; // v2 did not freeze source files to the hashes used for cache keys.
const rankedResult = (r) => r && !r.void && [-1, 0, 1].includes(r.w);

/** Who wrote a bot: the `author` its `meta` gives, read from the source (a plain string literal). */
export function authorOf(source) {
  const m = /\bauthor\s*:\s*(['"`])([^'"`\n]{1,40})\1/.exec(source);
  return m ? m[2] : 'unknown';
}

/** Model attribution is reported only when the source explicitly records it. */
export function modelOf(source) {
  const m = /\bmodel\s*:\s*(['"`])([^'"`\n]{1,80})\1/.exec(source);
  return m ? m[2] : null;
}

function fieldNow() {
  const sources = {};
  const entrants = listBots().map((b) => {
    const source = sources[b.id] = readBotSource(b.id);
    return { id: b.id, kind: b.kind, author: authorOf(source), model: modelOf(source), hash: sha(source).slice(0, 12) };
  });
  return { entrants, sources };
}

export function entrantsNow() { return fieldNow().entrants; }

/**
 * One round's teams for a team queue. A fixed scramble of (queue, round, bot id) decides who
 * plays — whoever does not fit into an even number of full teams sits the round out — and the
 * players are then dealt out one to a team, author by author, the author with the most bots
 * first. Two bots by one author therefore only share a team when that author has more bots in
 * the round than there are teams. The teams are then put in a scrambled order and paired off.
 */
export function draft(entrants, size, round) {
  const mix = (x) => sha(`${SEED}|${size}|${round}|${x}`);
  const order = entrants.map((e) => ({ e, h: mix(e.id) })).sort((a, b) => (a.h < b.h ? -1 : 1)).map((x) => x.e);
  let n = Math.floor(order.length / size);
  n -= n % 2;
  if (!n) return [];
  const groups = new Map();
  for (const e of order.slice(0, n * size)) { if (!groups.has(e.author)) groups.set(e.author, []); groups.get(e.author).push(e); }
  const dealt = [...groups].sort((a, b) => b[1].length - a[1].length || (mix('author:' + a[0]) < mix('author:' + b[0]) ? -1 : 1)).flatMap((g) => g[1]);
  const teams = Array.from({ length: n }, () => []);
  dealt.forEach((e, k) => teams[k % n].push(e));
  // who meets whom is scrambled again: dealt in author order, the smallest authors would always be on neighbouring teams
  return teams.map((t) => ({ t, h: mix('team:' + t.map((e) => e.id).sort().join('+')) })).sort((a, b) => (a.h < b.h ? -1 : 1)).map((x) => x.t);
}

/** Every match of a queue's season, in a fixed order: [{ mode, map, seed, swap, teams: [[id, ...], [id, ...]] }]. */
export function schedule(queue, entrants) {
  if (queue === '1v1') {
    return makeSchedule({ entrants: entrants.map((e) => ({ id: e.id, bots: [e.id] })), maps: MAP_IDS, seeds: [SEED] })
      .map((m) => ({ mode: '1v1', map: m.map, seed: m.seed, swap: m.swap, teams: m.teams }));
  }
  const size = Number(queue[0]), out = [];
  for (let r = 0; r < TEAM_ROUNDS; r++) {
    const teams = draft(entrants, size, r);
    for (let i = 0; i + 1 < teams.length; i += 2) {
      // Author grouping determines teammates, not permanent roles. Every selected bot
      // plays every slot on the SAME map/seed, from both spawn sides.
      for (let rotation = 0; rotation < size; rotation++) for (const swap of [false, true]) {
        const rotate = (team) => team.map((_, slot) => team[(slot + rotation) % size].id);
        out.push({ mode: queue, map: MAP_IDS[(r + i / 2) % MAP_IDS.length], seed: r + 1, swap,
          teams: [rotate(teams[i]), rotate(teams[i + 1])] });
      }
    }
  }
  return out;
}

export const keyOf = (m, hashOf) => `${m.mode}|${m.map}|${m.seed}|${m.swap ? 1 : 0}|${m.teams[0].join('+')}|${m.teams[1].join('+')}|`
  + sha(ENGINE_VERSION + [...m.teams[0], ...m.teams[1]].map((id) => hashOf[id]).join('')).slice(0, 10);

/**
 * Ratings from a season's results: the ratings under which the results are most likely, where
 * a side's chance of winning is 1 / (1 + 10^(-d/400)) for a lead of d, a team's strength is
 * what its members add up to (each counts for its rating less 1500, so a bot rated 1700 is worth
 * 200 points to any team it is on, as it is in 1v1), and a draw is half a win. Every bot also counts as having drawn
 * twice against a 1500 — enough to keep a bot that has only ever won, or only ever lost, on
 * the scale. All matches are weighed together, so the order they were played in does not matter
 * and two bots with the same record against the same field get the same rating.
 */
export function rate(entrants, matches, results) {
  const ids = entrants.map((e) => e.id), index = new Map(ids.map((id, i) => [id, i]));
  const row = Object.fromEntries(entrants.map((e) => [e.id, { id: e.id, author: e.author, model: e.model ?? null, kind: e.kind, played: 0, w: 0, d: 0, l: 0 }]));
  const played = matches.filter((m) => rankedResult(results[m.key])).map((m) => ({ teams: m.teams, s: results[m.key].w === 0 ? 1 : results[m.key].w === 1 ? 0 : 0.5 }));
  const samples = played.map(({ teams, s }) => {
    const weights = new Map();
    for (const [side, team] of teams.entries()) for (const id of team) {
      const r = row[id]; r.played++;
      if (s === 0.5) r.d++; else if ((s === 1) === (side === 0)) r.w++; else r.l++;
      const i = index.get(id); weights.set(i, (weights.get(i) || 0) + (side === 0 ? 1 : -1));
    }
    return { x: [...weights].filter(([, w]) => w), y: s };
  });
  const z = ids.map(() => 0), SCALE = 400 / Math.LN10;
  const logistic = (x) => 1 / (1 + Math.exp(-x));
  const softplus = (x) => Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x)));
  const dot = (x, values) => x.reduce((sum, [i, w]) => sum + w * values[i], 0);
  const loss = (values) => samples.reduce((sum, { x, y }) => { const a = dot(x, values); return sum + softplus(a) - y * a; },
    values.reduce((sum, a) => sum + PRIOR * (softplus(a) - 0.5 * a), 0));
  // Full Newton steps fit the joint team likelihood. Diagonal-only simultaneous
  // updates ignore teammate correlations and can stop before the fit converges.
  for (let it = 0; it < 80 && samples.length; it++) {
    const g = z.map((a) => PRIOR * (logistic(a) - 0.5));
    const h = z.map((a, i) => z.map((_, j) => i === j ? PRIOR * logistic(a) * (1 - logistic(a)) : 0));
    for (const { x, y } of samples) {
      const p = logistic(dot(x, z)), v = p * (1 - p);
      for (const [i, wi] of x) {
        g[i] += wi * (p - y);
        for (const [j, wj] of x) h[i][j] += wi * wj * v;
      }
    }
    if (Math.max(...g.map(Math.abs)) < 1e-9) break;
    // Cholesky factorisation: the 1500-rating prior makes the Hessian positive definite.
    const l = z.map(() => z.map(() => 0));
    for (let i = 0; i < z.length; i++) for (let j = 0; j <= i; j++) {
      let v = h[i][j]; for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
      l[i][j] = i === j ? Math.sqrt(Math.max(v, 1e-12)) : v / l[j][j];
    }
    const tmp = [], step = [];
    for (let i = 0; i < z.length; i++) { let v = g[i]; for (let j = 0; j < i; j++) v -= l[i][j] * tmp[j]; tmp[i] = v / l[i][i]; }
    for (let i = z.length - 1; i >= 0; i--) { let v = tmp[i]; for (let j = i + 1; j < z.length; j++) v -= l[j][i] * step[j]; step[i] = v / l[i][i]; }
    const before = loss(z), descent = g.reduce((sum, v, i) => sum + v * step[i], 0);
    let scale = 1;
    while (scale > 1e-8 && loss(z.map((a, i) => a - scale * step[i])) > before - 1e-4 * scale * descent) scale *= 0.5;
    if (scale <= 1e-8) break;
    for (let i = 0; i < z.length; i++) z[i] -= scale * step[i];
    if (Math.max(...step.map((v) => Math.abs(v * scale * SCALE))) < 0.0001) break;
  }
  const ratings = Object.fromEntries(ids.map((id, i) => [id, START + z[i] * SCALE]));
  return Object.values(row)
    .map((x) => ({ ...x, rating: Math.round(ratings[x.id]), winRate: x.played ? Math.round((x.w / x.played) * 1000) / 1000 : 0 }))
    // Rounding is for display only; zero-game entries have no rank.
    .sort((a, b) => Number(b.played > 0) - Number(a.played > 0) || (Math.abs(ratings[b.id] - ratings[a.id]) > 1e-7 ? ratings[b.id] - ratings[a.id] : 0) || (b.played ? b.w / b.played : 0) - (a.played ? a.w / a.played : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((x, k) => ({ rank: x.played ? k + 1 : null, ...x }));
}

/** The same table by author: how many bots, the best of them, and the mean of their ratings. */
export function byAuthor(rows) {
  const g = {};
  for (const r of rows.filter((r) => r.played)) { const a = (g[r.author] ||= { author: r.author, bots: 0, best: r.id, bestRating: r.rating, sum: 0 }); a.bots++; a.sum += r.rating; }
  return Object.values(g).map((a) => ({ author: a.author, bots: a.bots, best: a.best, bestRating: a.bestRating, meanRating: Math.round(a.sum / a.bots) }))
    .sort((a, b) => b.bestRating - a.bestRating || (a.author < b.author ? -1 : 1));
}

function load() {
  try { const s = JSON.parse(fs.readFileSync(storeFile(), 'utf8')); if (s && typeof s.results === 'object' && s.results) return s; } catch { /* no ladder yet */ }
  return { results: {} };
}

/**
 * Bring the ladder up to date and return it. Only matches that are not on file are played —
 * after a new bot is submitted that is its own matches in 1v1 and most of the team seasons.
 * @param {MatchPool} pool
 * @param {{ queues?: string[], play?: boolean, budgetMs?: number }} [o]
 *   `play: false` reads what is on file and plays nothing. `budgetMs` stops playing once that much
 *   time has gone by: what was played is kept, the tables are made from what is on file, and
 *   `complete` says whether anything is left — call again to carry on.
 */
export async function ladder(pool, { queues = QUEUES, play = true, budgetMs = Infinity } = {}) {
  const t0 = Date.now();
  const { entrants, sources } = fieldNow();
  const hashOf = Object.fromEntries(entrants.map((e) => [e.id, e.hash]));
  const store = load();
  const seasons = Object.fromEntries(QUEUES.map((q) => [q, schedule(q, entrants).map((m) => ({ ...m, key: keyOf(m, hashOf) }))]));
  let ran = 0;
  const errors = [];
  if (play) {
    for (const q of queues) {
      const missing = seasons[q].filter((m) => !store.results[m.key] || store.results[m.key].checked !== RESULT_CHECK || store.results[m.key].void);
      for (let at = 0; at < missing.length && Date.now() - t0 < budgetMs; at += 24) {
        const batch = missing.slice(at, at + 24);
        ran += batch.length;
        await Promise.all(batch.map(async (m) => {
          try {
            const s = await pool.run({ map: m.map, mode: m.mode, seed: m.seed, swap: m.swap, teams: withSources(m.teams, sources), want: 'score' });
            if (![0, 1, -1].includes(s.winner)) throw new Error('match did not finish');
            // A match the engine played to a result counts as played. A controller that throws is the engine's to deal
            // with (it idles that tick, and is cut off if it keeps on): were its errors to void the match, a bot could
            // throw once whenever it was losing and never have a loss on file. The errors are kept beside the result.
            store.results[m.key] = { checked: RESULT_CHECK, w: s.winner, h: [s.teams[0].hull, s.teams[1].hull], ...(s.errors?.length ? { err: ('controller errors: ' + s.errors.join(' | ')).slice(0, 200) } : {}) };
          } catch (e) {
            // A reliably attributed controller failure is a forfeit. Unattributed
            // failures are unscored, visible, and retried on the next call.
            const bad = e && e.detail && e.detail.bot, side = bad ? (m.teams[0].includes(bad) ? 0 : m.teams[1].includes(bad) ? 1 : -1) : -1;
            store.results[m.key] = { checked: RESULT_CHECK, w: side < 0 ? null : 1 - side, void: side < 0, err: String(e && e.message).slice(0, 200) };
          }
        }));
      }
    }
    // what is no longer in any season (a bot changed or was removed) is dropped
    const live = new Set(QUEUES.flatMap((q) => seasons[q].map((m) => m.key)));
    for (const k of Object.keys(store.results)) if (!live.has(k)) delete store.results[k];
    fs.mkdirSync(LADDER_DIR, { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(store));
  }
  const out = { engine: ENGINE_VERSION, method: LADDER_METHOD, budget: DEFAULT_BUDGET, maps: MAP_IDS, soloSeed: SEED, teamRounds: TEAM_ROUNDS, entrants: entrants.length, matchesPlayedNow: ran, complete: true, queues: {} };
  for (const q of queues) {
    const ms = seasons[q], attempted = ms.filter((m) => store.results[m.key]?.checked === RESULT_CHECK), done = attempted.filter((m) => rankedResult(store.results[m.key]));
    for (const m of attempted) if (store.results[m.key].err) errors.push(`${q} ${m.map} ${m.teams[0].join('+')} vs ${m.teams[1].join('+')}: ${store.results[m.key].err}`);
    const rows = rate(entrants, done, store.results);
    out.queues[q] = { matches: ms.length, onFile: done.length, slotsPerMatch: Number(q[0]), errorCount: attempted.filter((m) => store.results[m.key].err).length, standings: rows, authors: byAuthor(rows) };
    if (done.length < ms.length) out.complete = false;
  }
  if (errors.length) out.errors = errors.slice(0, 10);
  return out;
}

/** Compact, versioned browser snapshot; the original seven row fields stay compatible. */
export function ladderSnapshot(board) {
  return { engine: board.engine, method: board.method, budget: board.budget, maps: board.maps, soloSeed: board.soloSeed,
    teamRounds: board.teamRounds, entrants: board.entrants, complete: board.complete,
    queues: Object.fromEntries(Object.entries(board.queues).map(([q, t]) => [q, {
      matches: t.matches, onFile: t.onFile, errorCount: t.errorCount,
      standings: t.standings.map((r) => [r.id, r.author, r.rating, r.played, r.w, r.d, r.l, r.model, r.rank]),
      authors: t.authors.map((a) => [a.author, a.bots, a.best, a.bestRating, a.meanRating]),
    }])) };
}

/** The ladder as a Markdown page. */
export function ladderMarkdown(board) {
  const cell = (s) => String(s ?? 'Not recorded').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const lines = ['# Ironyard leaderboard', '',
    `Engine ${board.engine} · ${board.entrants} bots · ${board.budget ?? DEFAULT_BUDGET} credits per vehicle · ${board.method ?? LADDER_METHOD}.`, '',
    `Status: **${board.complete === false ? 'Provisional — matches remain' : board.errors?.length ? 'Contains match errors — inspect before comparing' : 'Complete'}**. Reproduce with \`node node/cli.js ladder --write\`, then \`npm run build\`.`, '',
    '## At a glance', '',
    'Each mode is a separate ranking; there is no combined overall or model ranking. Model names below are self-reported source metadata. Missing attribution is not inferred from a commit author.', '',
    '| bot | author | recorded model | 1v1 rank | 2v2 rank | 3v3 rank |', '|---|---|---|---:|---:|---:|'];
  const all = new Map();
  for (const t of Object.values(board.queues)) for (const r of t.standings) if (!all.has(r.id)) all.set(r.id, r);
  for (const r of all.values()) lines.push(`| \`${r.id}\` | ${cell(r.author)} | ${cell(r.model)} | ${QUEUES.map((q) => board.queues[q]?.standings.find((v) => v.id === r.id)?.rank ?? '—').join(' | ')} |`);
  lines.push('', '## How to read the rankings', '',
    `- **1v1:** every pair plays all ${(board.maps || MAP_IDS).length} maps from both spawn sides, with seed ${board.soloSeed ?? SEED}.`,
    `- **2v2 / 3v3:** ${board.teamRounds ?? TEAM_ROUNDS} deterministic mixed-team rounds, going round the maps in turn, balanced across authors where possible. Each pairing rotates through every team slot, from both spawn sides. Some entrants sit out each round, so game counts differ.`,
    '- **Rating:** a joint logistic fit to all results, with a 1500 anchor equivalent to two draws. Team strength is the sum of individual ratings above 1500. Wins count 1, draws 0.5, losses 0. Opponent and teammate strength matter; raw win rate does not determine rank.',
    '- **Ordering:** unrounded rating, then win rate, then bot id. Displayed ratings are rounded. Bots with zero games are unranked. Author tables sort by the author’s best bot, then mean rating.',
    '- **Scope:** these are fixed-season results, not confidence intervals or a general model benchmark. Team synergy is approximated as additive. Close scores and small samples warrant more seeds/rounds.',
    '- **Custom tournaments:** the browser’s round robin uses 3 points per win, 1 per draw and hull difference as a tie-break. One bot fills its entire team; those results do not update this mixed-team ladder.',
    '', 'See [ranking methodology and audit](docs/RANKING.md) for details, error handling and limitations.', '');
  for (const [q, t] of Object.entries(board.queues)) {
    lines.push(`## ${q}`, '', `${t.onFile} of ${t.matches} matches on file${t.errorCount ? `; **${t.errorCount} contain errors**` : ''}.`, '', '| # | bot | author | rating | played | W | D | L | win % |', '|---:|---|---|---:|---:|---:|---:|---:|---:|');
    for (const r of t.standings) lines.push(`| ${r.rank ?? '—'} | \`${r.id}\` | ${cell(r.author)} | ${r.rating} | ${r.played} | ${r.w} | ${r.d} | ${r.l} | ${Math.round(r.winRate * 100)} |`);
    lines.push('', '### Authors — ordered by best bot', '', '| author | bots | best bot | best rating | mean rating |', '|---|---:|---|---:|---:|');
    for (const a of t.authors) lines.push(`| ${cell(a.author)} | ${a.bots} | \`${a.best}\` | ${a.bestRating} | ${a.meanRating} |`);
    lines.push('');
  }
  return lines.join('\n');
}
