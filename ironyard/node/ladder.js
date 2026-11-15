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
import { MAP_IDS, makeSchedule, ENGINE_VERSION } from '../engine/index.js';
import { ROOT, listBots, readBotSource } from './loader.js';
import { withSources } from './runner.js';

export const LADDER_DIR = process.env.IRONYARD_LADDER_DIR ? path.resolve(process.env.IRONYARD_LADDER_DIR) : path.join(ROOT, 'ladder');
export const QUEUES = ['1v1', '2v2', '3v3'];
export const TEAM_ROUNDS = 24;
const SEED = 1, START = 1500, PRIOR = 2;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const storeFile = () => path.join(LADDER_DIR, 'results.json');

/** Who wrote a bot: the `author` its `meta` gives, read from the source (a plain string literal). */
export function authorOf(source) {
  const m = /\bauthor\s*:\s*(['"`])([^'"`\n]{1,40})\1/.exec(source);
  return m ? m[2] : 'unknown';
}

export function entrantsNow() {
  return listBots().map((b) => { const source = readBotSource(b.id); return { id: b.id, kind: b.kind, author: authorOf(source), hash: sha(source).slice(0, 12) }; });
}

/**
 * One round's teams for a team queue. A fixed scramble of (queue, round, bot id) decides who
 * plays — whoever does not fit into an even number of full teams sits the round out — and the
 * players are then dealt out one to a team, author by author, the author with the most bots
 * first. Two bots by one author therefore only share a team when that author has more bots in
 * the round than there are teams.
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
  return teams;
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
    for (let i = 0; i + 1 < teams.length; i += 2) for (const swap of [false, true]) {
      out.push({ mode: queue, map: MAP_IDS[(r + i / 2) % MAP_IDS.length], seed: r + 1, swap, teams: [teams[i].map((e) => e.id), teams[i + 1].map((e) => e.id)] });
    }
  }
  return out;
}

const keyOf = (m, hashOf) => `${m.mode}|${m.map}|${m.seed}|${m.swap ? 1 : 0}|${m.teams[0].join('+')}|${m.teams[1].join('+')}|`
  + sha(ENGINE_VERSION + [...m.teams[0], ...m.teams[1]].map((id) => hashOf[id]).join('')).slice(0, 10);

/**
 * Ratings from a season's results: the ratings under which the results are most likely, where
 * a side's chance of winning is 1 / (1 + 10^(-d/400)) for a rating lead of d, a team's strength
 * is the mean of its members', and a draw is half a win. Every bot also counts as having drawn
 * twice against a 1500 — enough to keep a bot that has only ever won, or only ever lost, on
 * the scale. All matches are weighed together, so the order they were played in does not matter
 * and two bots with the same record against the same field get the same rating.
 */
export function rate(entrants, matches, results) {
  const R = Object.fromEntries(entrants.map((e) => [e.id, START]));
  const row = Object.fromEntries(entrants.map((e) => [e.id, { id: e.id, author: e.author, kind: e.kind, played: 0, w: 0, d: 0, l: 0 }]));
  const played = matches.filter((m) => results[m.key]).map((m) => ({ teams: m.teams, s: results[m.key].w === 0 ? 1 : results[m.key].w === 1 ? 0 : 0.5 }));
  for (const { teams, s } of played) for (const [side, ids] of teams.entries()) for (const id of ids) {
    const x = row[id]; x.played++;
    if (s === 0.5) x.d++; else if ((s === 1) === (side === 0)) x.w++; else x.l++;
  }
  const mean = (ids) => ids.reduce((t, id) => t + R[id], 0) / ids.length;
  const chance = (d) => 1 / (1 + 10 ** (-d / 400));
  const ids = entrants.map((e) => e.id), SCALE = 400 / Math.LN10;
  for (let it = 0; it < 200 && played.length; it++) {
    const pull = Object.fromEntries(ids.map((id) => [id, 0])), firm = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const { teams, s } of played) {
      const e = chance(mean(teams[0]) - mean(teams[1])), give = e * (1 - e);
      for (const id of teams[0]) { pull[id] += s - e; firm[id] += give; }
      for (const id of teams[1]) { pull[id] -= s - e; firm[id] += give; }
    }
    let moved = 0;
    for (const id of ids) {
      const e = chance(R[id] - START);
      const step = 0.5 * SCALE * (pull[id] + PRIOR * (0.5 - e)) / (firm[id] + PRIOR * e * (1 - e));
      R[id] += step; moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 0.01) break;
  }
  return Object.values(row)
    .map((x) => ({ ...x, rating: Math.round(R[x.id]), winRate: x.played ? Math.round((x.w / x.played) * 1000) / 1000 : 0 }))
    .sort((a, b) => b.rating - a.rating || b.winRate - a.winRate || (a.id < b.id ? -1 : 1))
    .map((x, k) => ({ rank: k + 1, ...x }));
}

/** The same table by author: how many bots, the best of them, and the mean of their ratings. */
export function byAuthor(rows) {
  const g = {};
  for (const r of rows) { const a = (g[r.author] ||= { author: r.author, bots: 0, best: r.id, bestRating: r.rating, sum: 0 }); a.bots++; a.sum += r.rating; }
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
  const entrants = entrantsNow();
  const hashOf = Object.fromEntries(entrants.map((e) => [e.id, e.hash]));
  const store = load();
  const seasons = Object.fromEntries(QUEUES.map((q) => [q, schedule(q, entrants).map((m) => ({ ...m, key: keyOf(m, hashOf) }))]));
  let ran = 0;
  const errors = [];
  if (play) {
    for (const q of queues) {
      const missing = seasons[q].filter((m) => !store.results[m.key]);
      for (let at = 0; at < missing.length && Date.now() - t0 < budgetMs; at += 24) {
        const batch = missing.slice(at, at + 24);
        ran += batch.length;
        await Promise.all(batch.map(async (m) => {
          try {
            const s = await pool.run({ map: m.map, mode: m.mode, seed: m.seed, swap: m.swap, teams: withSources(m.teams), want: 'score' });
            store.results[m.key] = { w: s.winner === 0 || s.winner === 1 ? s.winner : -1, h: [s.teams[0].hull, s.teams[1].hull] };
          } catch (e) {
            // a bot that cannot be fielded loses the match for its side; nobody's fault counts as a draw
            const bad = e && e.detail && e.detail.bot, side = bad ? (m.teams[0].includes(bad) ? 0 : m.teams[1].includes(bad) ? 1 : -1) : -1;
            store.results[m.key] = { w: side < 0 ? -1 : 1 - side, err: String(e && e.message).slice(0, 200) };
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
  const out = { engine: ENGINE_VERSION, entrants: entrants.length, matchesPlayedNow: ran, complete: true, queues: {} };
  for (const q of queues) {
    const ms = seasons[q], done = ms.filter((m) => store.results[m.key]);
    for (const m of done) if (store.results[m.key].err) errors.push(`${q} ${m.map} ${m.teams[0].join('+')} vs ${m.teams[1].join('+')}: ${store.results[m.key].err}`);
    const rows = rate(entrants, ms, store.results);
    out.queues[q] = { matches: ms.length, onFile: done.length, standings: rows, authors: byAuthor(rows) };
    if (done.length < ms.length) out.complete = false;
  }
  if (errors.length) out.errors = errors.slice(0, 10);
  return out;
}

/** The ladder as a Markdown page. */
export function ladderMarkdown(board) {
  const lines = ['# Ironyard leaderboard', '',
    `Engine ${board.engine}, ${board.entrants} bots. Every match is deterministic, so this page can be reproduced with \`node node/cli.js ladder --write\`.`, '',
    'Ratings start at 1500. 1v1 is a full round robin on every map from both sides. In 2v2 and 3v3 the bots are dealt into mixed teams each round — bots by the same author are kept apart where the numbers allow — and a bot\'s rating says how much a team gains by having it.', ''];
  for (const [q, t] of Object.entries(board.queues)) {
    lines.push(`## ${q}`, '', `${t.onFile} of ${t.matches} matches on file.`, '', '| # | bot | author | rating | played | W | D | L | win % |', '|---:|---|---|---:|---:|---:|---:|---:|---:|');
    for (const r of t.standings) lines.push(`| ${r.rank} | \`${r.id}\` | ${r.author} | ${r.rating} | ${r.played} | ${r.w} | ${r.d} | ${r.l} | ${Math.round(r.winRate * 100)} |`);
    lines.push('', '| author | bots | best bot | best rating | mean rating |', '|---|---:|---|---:|---:|');
    for (const a of t.authors) lines.push(`| ${a.author} | ${a.bots} | \`${a.best}\` | ${a.bestRating} | ${a.meanRating} |`);
    lines.push('');
  }
  return lines.join('\n');
}
