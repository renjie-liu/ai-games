// Scouting report on one bot: what it drives, what the ladder has on file about it, and what follows from the two.
//
// Nothing here plays a match. The vehicles come from the engine's own set-up path — runMatch with
// maxTime 0 loads the controller, asks it for its design and validates it, and stops before the first
// tick — and the record is read from the ladder's results file, which is never written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runMatch, analyzeDesign, MODES, MAP_IDS, DEFAULT_BUDGET, ENGINE_VERSION } from '../engine/index.js';
import { ROOT, listBots, readBotSource, loadBot } from './loader.js';
import { LADDER_DIR, entrantsNow, schedule, rate, authorOf, modelOf } from './ladder.js';
import { withSources } from './runner.js';

const HOME_MAP = 'proving';
const RESULT_CHECK = 2;       // as in ladder.js: results filed without this mark are replayed by the ladder, so they do not count
const MAX_OPPONENTS = 12;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// The key the ladder files a result under (keyOf in ladder.js): the match, then a hash of the engine version
// and of the source of every bot in it. tests/scout.test.js holds the two to the same answer.
const keyOf = (m, hashOf) => `${m.mode}|${m.map}|${m.seed}|${m.swap ? 1 : 0}|${m.teams[0].join('+')}|${m.teams[1].join('+')}|`
  + sha(ENGINE_VERSION + [...m.teams[0], ...m.teams[1]].map((id) => hashOf[id]).join('')).slice(0, 10);
const matchOf = (key) => key.slice(0, key.lastIndexOf('|'));
const scored = (r) => r && r.checked === RESULT_CHECK && !r.void && [-1, 0, 1].includes(r.w);
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : (word.endsWith('ch') ? 'es' : 's')}`;
const arcWidth = ([from, to]) => (to - from + 360) % 360 || 360;
const arcHolds = (arc, deg) => arcWidth(arc) === 360 || (((deg - arc[0]) % 360) + 360) % 360 <= arcWidth(arc);

/** The vehicles `id` puts on the field as team 0 of one line-up, as the engine validated them. */
async function fielded(id, spec, pool) {
  const base = { seed: 1, maxTime: 0, budget: DEFAULT_BUDGET, ...spec };
  const res = pool
    ? await pool.run({ ...base, want: 'full', teams: withSources([[id], [id]]) })
    : runMatch({ ...base, record: false, teams: [[loadBot(id)], [loadBot(id)]] });
  return res.vehicles.filter((v) => v.team === 0).map((v) => ({ slot: v.slot, name: v.name, design: v.design, stats: v.designStats }));
}

/** What kind of car this is, in a few words, from what it carries. */
export function styleOf(stats, analysis) {
  const w = stats.weapons || {}, guns = analysis.weapons, n = (t) => w[t] || 0;
  const contact = n('saw') + (stats.ramParts || 0);
  if (!guns.length) return stats.kegs ? 'keg car' : contact ? 'rammer' : 'unarmed car';
  if (contact >= 2 && guns.length <= 2) return 'close-in brawler';
  if (n('flamer') * 2 >= guns.length) return 'flamethrower car';
  if ((n('mortar') + n('missile')) * 2 >= guns.length) return 'artillery car';
  if (stats.kegs >= 2) return 'keg thrower';
  return Math.max(...guns.map((g) => g.range)) >= 19 ? 'long-range gun car' : 'short-range gun car';
}
const carries = (stats) => Object.entries(stats.weapons || {}).map(([t, k]) => (k > 1 ? `${k} ${t}` : t)).join(', ') || 'no guns';

function designBlock(v, where) {
  const s = v.stats, a = analyzeDesign({ design: v.design, stats: s });
  return {
    block: {
      name: v.design.name, fieldedAs: where, cost: s.cost, mass: s.mass, weightClass: s.weightClass, topSpeed: s.topSpeed, turnRate: s.turnRate,
      hp: s.hp, ...(s.shield ? { shield: s.shield } : {}), ...(s.hovers ? { hovers: true } : {}),
      weapons: s.weapons, ...(a.otherWeapons ? { otherWeapons: a.otherWeapons } : {}),
      coreProtection: a.coreProtection, dpsByRange: a.dpsByRange, ...(Object.values(a.dpsByRangeRear).some((x) => x > 0) ? { dpsByRangeRear: a.dpsByRangeRear } : {}),
      blindArcsDeg: a.blindArcsDeg, energy: { secondsOfFullFire: a.energy.secondsOfFullFire, ...(a.energy.secondsOfFullFire === null ? { note: a.energy.note } : {}) },
      insights: a.insights,
    },
    analysis: a,
  };
}

/** Every different vehicle a bot fields: per mode and team slot on the home map, and in 1v1 on every other map. */
async function designsOf(id, pool) {
  const modes = Object.keys(MODES), otherMaps = MAP_IDS.filter((m) => m !== HOME_MAP);
  const [byMode, byMap] = await Promise.all([
    Promise.all(modes.map((mode) => fielded(id, { mode, map: HOME_MAP }, pool))),
    Promise.all(otherMaps.map((map) => fielded(id, { mode: '1v1', map }, pool))),
  ]);
  const rows = [];
  modes.forEach((mode, k) => byMode[k].forEach((v) => rows.push({ ...v, mode, where: `${mode} slot ${v.slot}` })));
  otherMaps.forEach((map, k) => rows.push({ ...byMap[k][0], map, where: `1v1 on ${map}` }));
  const groups = new Map();
  for (const r of rows) { const key = JSON.stringify(r.design.parts); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
  // say "2v2" when it is every slot of a mode
  const label = (group) => {
    const out = [];
    for (const mode of modes) {
      const mine = group.filter((r) => r.mode === mode);
      if (mine.length === MODES[mode]) out.push(mode); else out.push(...mine.map((r) => r.where));
    }
    return out.concat(group.filter((r) => r.map).map((r) => r.where));
  };
  const [first, ...rest] = [...groups.values()];
  return { name: rows[0].name, first: first[0], firstWhere: rest.length ? `1v1 on ${HOME_MAP}, and everywhere otherDesigns does not name` : 'every mode, team slot and map',
    others: rest.map((g) => ({ v: g[0], where: label(g) })) };
}

/**
 * A bot's 1v1 record, from the ladder's results file as it is: nothing is played and nothing is written.
 * A result counts only if it is filed under the key of the match as the bots are now (so for this
 * source, this opponent's source and this engine) and carries the ladder's check mark.
 */
export function ladderRecord(id, { ladderDir = LADDER_DIR } = {}) {
  const entrants = entrantsNow();
  const hashOf = Object.fromEntries(entrants.map((e) => [e.id, e.hash]));
  const season = schedule('1v1', entrants).map((m) => ({ ...m, key: keyOf(m, hashOf) }));
  const mine = season.filter((m) => m.teams[0][0] === id || m.teams[1][0] === id);
  const out = { queue: '1v1', scheduled: mine.length, onFile: 0 };
  const file = path.join(ladderDir, 'results.json');
  let results = null;
  try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); if (s && s.results && typeof s.results === 'object') results = s.results; } catch { /* no ladder yet */ }
  const published = () => {   // the saved table: all there is to go on when the results file does not cover this bot
    try {
      const row = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'ladder.json'), 'utf8')).queues['1v1'].standings.find((r) => r[0] === id);
      if (row) out.savedTable = { from: 'web/ladder.json', rank: row[8], rating: row[2], played: row[3], w: row[4], d: row[5], l: row[6], note: 'the published table, as saved: not checked against this bot\'s current source' };
    } catch { /* no saved table */ }
  };
  if (!results) {
    out.note = `No ladder results on file (${path.relative(ROOT, file) || file} is missing): nothing is known about ${id}'s matches. The leaderboard tool plays the season and files it.`;
    published();
    return out;
  }
  const others = new Set(Object.keys(results).filter((k) => k.startsWith('1v1|')).map(matchOf));
  const vs = new Map(), maps = new Map();
  const tally = (book, k) => { if (!book.has(k)) book.set(k, { w: 0, d: 0, l: 0 }); return book.get(k); };
  let w = 0, d = 0, l = 0, unmarked = 0, unscored = 0, unplayed = 0;
  const outdated = new Set();
  for (const m of mine) {
    const side = m.teams[0][0] === id ? 0 : 1, opp = m.teams[1 - side][0], r = results[m.key];
    if (scored(r)) {
      const got = r.w < 0 ? 'd' : r.w === side ? 'w' : 'l';
      tally(vs, opp)[got]++; tally(maps, m.map)[got]++;
      if (got === 'w') w++; else if (got === 'd') d++; else l++;
    } else if (r && r.checked === RESULT_CHECK) unscored++;
    else if (r) unmarked++;
    else if (others.has(matchOf(m.key))) outdated.add(opp);
    else unplayed++;
  }
  const n = w + d + l;
  out.onFile = n;
  if (n) {
    Object.assign(out, { w, ...(d ? { d } : {}), l, winRate: Math.round((w / n) * 100) / 100 });
    const done = season.filter((m) => scored(results[m.key]));
    const row = rate(entrants, done, results).find((r) => r.id === id);
    out.standing = { rank: row.rank, of: entrants.length, rating: row.rating, ...(done.length < season.length ? { provisional: `only ${done.length} of the season's ${season.length} matches are on file` } : {}) };
    const worstFirst = (a, b) => (b[1].l - b[1].w) - (a[1].l - a[1].w) || b[1].l - a[1].l || (a[0] < b[0] ? -1 : 1);
    const line = (key) => ([k, t]) => ({ [key]: k, w: t.w, ...(t.d ? { d: t.d } : {}), l: t.l });
    const foes = [...vs].sort(worstFirst);
    out.byOpponent = foes.slice(0, MAX_OPPONENTS).map(line('vs'));
    if (foes.length > MAX_OPPONENTS) out.opponentsNotListed = `${foes.length - MAX_OPPONENTS} more: ${id} does no worse against any of them than against those listed`;
    out.byMap = [...maps].sort(worstFirst).map(line('map'));
  }
  // what is missing, and why — said, not guessed at
  const notes = [];
  if (!n && !unmarked && !unscored && outdated.size) {
    notes.push(`None of ${id}'s ${mine.length} scheduled 1v1 matches are on file for its current source. The file has results for ${id} against ${plural(outdated.size, 'opponent')}, `
      + `but they were keyed with other source code than is in the bots folder now (${id} changed since, or the engine did): they say nothing reliable about this version and are not counted`);
  } else if (outdated.size) {
    notes.push(`results against ${listOf([...outdated].sort().slice(0, 5))}${outdated.size > 5 ? ` and ${outdated.size - 5} more` : ''} are on file for an older version of that opponent and are not counted`);
  }
  if (unmarked) notes.push(`${plural(unmarked, 'result')} on file for the current source were filed by an older ladder that did not check for controller errors; the ladder replays those, so they are not counted here`);
  if (unscored) notes.push(`${plural(unscored, 'match')} on file ended in an error and ${unscored === 1 ? 'is' : 'are'} unscored`);
  if (unplayed) notes.push(n || outdated.size || unmarked || unscored ? `${plural(unplayed, 'match')} not played yet` : `None of ${id}'s ${mine.length} scheduled 1v1 matches are on file: the ladder has not played it yet`);
  if (notes.length) {
    const text = notes.join('; ');
    out.note = `${text[0].toUpperCase()}${text.slice(1)}. Calling leaderboard plays what is missing.`;
  }
  if (n < mine.length) published();
  return out;
}

/** Two to four plain sentences: who beats it, where, and what its vehicle gives away. */
function hintsOf(id, record, main, styleOfBot) {
  const hints = [];
  if (record.onFile >= 8) {
    const games = (o) => o.w + (o.d || 0) + o.l;
    const bad = record.byOpponent.filter((o) => o.l > o.w && o.l / games(o) >= 0.6).slice(0, 2);
    if (bad.length) {
      const styles = bad.map((o) => styleOfBot(o.vs));
      const who = listOf(bad.map((o) => `${o.l} of ${games(o)} to ${o.vs}`));
      const known = styles.filter(Boolean);
      const what = known.length < bad.length ? '' : bad.length > 1 && styles[0].style === styles[1].style ? `: both are ${styles[0].style}s (${styles.map((s) => s.carries).join(' / ')})`
        : `: ${listOf(bad.map((o, k) => `${o.vs} is a ${styles[k].style} (${styles[k].carries})`))}`;
      hints.push(`Loses ${who}${what}.`);
    } else if (record.l === 0) hints.push(`Has not lost any of the ${record.onFile} 1v1 matches on file.`);
    else { const o = record.byOpponent[0]; hints.push(`No opponent on file beats it more than 60% of the time; its hardest match-up is ${o.vs} (${o.l} of ${games(o)} lost).`); }
    const share = (m) => m.w / (m.w + (m.d || 0) + m.l), played = record.byMap.filter((m) => m.w + (m.d || 0) + m.l >= 4);
    if (played.length > 1) {
      const worst = played.reduce((a, b) => (share(b) < share(a) ? b : a)), best = played.reduce((a, b) => (share(b) > share(a) ? b : a));
      const say = (m) => `${m.map} (wins ${m.w} of ${m.w + (m.d || 0) + m.l})`;
      const parts = [];
      if (record.winRate - share(worst) >= 0.15) parts.push(`weakest on ${say(worst)}`);
      if (share(best) - record.winRate >= 0.15) parts.push(`strongest on ${say(best)}`);
      if (parts.length) { const t = parts.join(', '); hints.push(`${t[0].toUpperCase()}${t.slice(1)}; ${Math.round(record.winRate * 100)}% overall.`); }
    }
  } else hints.push(record.onFile ? `Only ${record.onFile} of its ${record.scheduled} 1v1 matches are on file: too few to say who beats it.` : 'No ladder record on file for its current source: what follows comes from its design alone.');
  if (main) {
    const { stats: s, analysis: a } = main, cp = a.coreProtection, design = [];
    const side = Object.keys(cp).reduce((x, y) => (cp[y].hp < cp[x].hp ? y : x));
    const strong = Object.keys(cp).reduce((x, y) => (cp[y].hp > cp[x].hp ? y : x));
    if (cp[side].pieces === 0) design.push(`Its core is the first piece hit from the ${side}.`);
    else if (cp[side].hp * 2 <= cp[strong].hp) design.push(`Its core is thinnest from the ${side}: ${plural(cp[side].pieces, 'piece')} worth ${cp[side].hp} hp, against ${cp[strong].hp} hp from the ${strong}.`);
    const widest = a.blindArcsDeg.reduce((best, arc) => (!best || arcWidth(arc) > arcWidth(best) ? arc : best), null);
    if (!a.weapons.length) design.push(`It has no gun (${(a.otherWeapons || []).join(', ') || 'no weapons at all'}): it has to touch you to hurt you, at ${s.topSpeed} m/s top speed.`);
    else if (widest && arcWidth(widest) >= 120) {
      const turn = s.turnRate > 0 ? `, and it needs ${Math.round((Math.PI / s.turnRate) * 10) / 10} s to turn around` : '';
      const facings = [...new Set(a.weapons.map((g) => g.facing))], sideOf = { N: 'forward', S: 'backward', W: 'left', E: 'right' };
      design.push(facings.length === 1 && facings[0] === 'N' && arcHolds(widest, 180) ? `Nothing covers its rear (bearings ${widest[0]}°–${widest[1]}°, 180° is dead astern)${turn}.`
        : `${facings.length === 1 ? `All its guns face ${sideOf[facings[0]]}` : 'Its guns leave a gap'}: nothing covers bearings ${widest[0]}°–${widest[1]}° (0° is dead ahead, 90° its right)${turn}.`);
    }
    if (a.weapons.length && Math.max(...a.weapons.map((g) => g.range)) <= 13) design.push(`Its longest gun reaches ${Math.max(...a.weapons.map((g) => g.range))} m: anything with more range hits it first.`);
    if (a.energy.secondsOfFullFire !== null && a.energy.secondsOfFullFire < 20) design.push(`It runs out of energy after about ${a.energy.secondsOfFullFire} s with everything on.`);
    if (a.fire.burnableShare >= 0.75) design.push(`${Math.round(a.fire.burnableShare * 100)}% of its pieces burn, ${a.fire.largestBurnableCluster} of them in one touching cluster: fire spreads through it.`);
    hints.push(...design.slice(0, Math.max(2, 4 - hints.length)));
  }
  return hints.slice(0, 4);
}

/**
 * The report. Unknown names are refused with the list of known ones.
 * @param {string} id
 * @param {{ pool?: MatchPool, ladderDir?: string }} [o]  with a pool the controller is loaded in a worker
 *   (under its watchdog); without one, in this process.
 */
export async function scoutBot(id, { pool = null, ladderDir = LADDER_DIR } = {}) {
  const source = readBotSource(id);   // throws for a name that is not a bot, naming the ones that are
  const entry = listBots().find((b) => b.id === id);
  const notes = /notes:\s*(['"`])((?:(?!\1).)*)\1/.exec(source);
  const model = modelOf(source);
  const bot = { id, name: id, author: authorOf(source), ...(model ? { model } : {}), kind: entry ? entry.kind : 'user', ...(notes ? { notes: notes[2].slice(0, 200) } : {}) };
  const out = { bot };
  let main = null;
  try {
    const d = await designsOf(id, pool);
    bot.name = d.name;
    const made = designBlock(d.first, d.firstWhere);
    main = { stats: d.first.stats, analysis: made.analysis };
    out.design = { budget: DEFAULT_BUDGET, ...made.block };
    if (d.others.length) {
      out.otherDesigns = d.others.slice(0, 6).map(({ v, where }) => {
        const a = analyzeDesign({ design: v.design, stats: v.stats });
        return { name: v.design.name, fieldedAs: where, cost: v.stats.cost, mass: v.stats.mass, weightClass: v.stats.weightClass, topSpeed: v.stats.topSpeed, weapons: v.stats.weapons,
          ...(a.otherWeapons ? { otherWeapons: a.otherWeapons } : {}), blindArcsDeg: a.blindArcsDeg, insight: a.insights[0] };
      });
    }
  } catch (e) {
    out.design = { error: `could not draw ${id}'s vehicle at budget ${DEFAULT_BUDGET}: ${e && e.message ? e.message : e}` };
  }
  out.record = ladderRecord(id, { ladderDir });
  const seen = new Map();
  for (const o of (out.record.byOpponent || []).filter((o) => o.l > o.w).slice(0, 2)) {
    try { const [v] = await fielded(o.vs, { mode: '1v1', map: HOME_MAP }, pool); seen.set(o.vs, { style: styleOf(v.stats, analyzeDesign({ design: v.design, stats: v.stats })), carries: carries(v.stats) }); } catch { /* its style stays unsaid */ }
  }
  out.hints = hintsOf(id, out.record, main, (name) => seen.get(name));
  return out;
}
