// Scheduling and standings. Running the matches is up to the caller.

/**
 * @param {object} o
 * @param {Array}  o.entrants   [{ id, bots: [botId, ...] }]  (bots has 1 id = fill every slot, or teamSize ids)
 * @param {Array}  o.maps       map ids
 * @param {Array}  o.seeds      numbers
 * @param {boolean} [o.bothSides] play each pairing with spawn sides swapped too (default true)
 * @param {string} [o.focus]    only keep matches involving this entrant id
 */
export function makeSchedule({ entrants, maps, seeds, bothSides = true, focus = null }) {
  if (new Set(entrants.map(e => e.id)).size !== entrants.length) throw new Error('Tournament entrant ids must be unique');
  const out = [];
  for (let i = 0; i < entrants.length; i++) for (let j = i + 1; j < entrants.length; j++) {
    const a = entrants[i], b = entrants[j];
    if (focus && a.id !== focus && b.id !== focus) continue;
    for (const map of maps) for (const seed of seeds) for (const swap of bothSides ? [false, true] : [false]) {
      out.push({ a: a.id, b: b.id, teams: [a.bots, b.bots], map, seed, swap });
    }
  }
  return out;
}

/** Normalize Node and browser results without turning failed matches into draws. */
export function tournamentResult(match, result, error = null) {
  if (error) {
    const bot = error.detail?.bot;
    const sides = (match.teams || [[match.a], [match.b]]).map(team => team.includes(bot));
    const side = bot && sides[0] !== sides[1] ? (sides[0] ? 0 : 1) : -1;
    return { ...match, winner: side < 0 ? null : 1 - side, void: side < 0, forfeit: side >= 0,
      error: String(error.message || error), ...(side < 0 ? {} : { errorBy: side === 0 ? match.a : match.b }) };
  }
  const errors = result?.errors?.length ? result.errors : result?.vehicles?.flatMap(v => (v.errors || []).map(e => `${v.bot}: ${e}`)) || [];
  if (errors.length || ![-1, 0, 1].includes(result?.winner)) {
    return { ...match, winner: null, void: true, error: errors.length ? 'Controller errors: ' + errors.join(' | ') : 'Match did not finish' };
  }
  return { ...match, winner: result.winner, hull: result.teams.map(t => t.hull), reason: result.reason, duration: result.duration };
}

export const scoredResult = r => !r.void && [-1, 0, 1].includes(r.winner) && (!r.error || r.forfeit === true);

export function tournamentStatus(results, scheduled = results.length) {
  const scored = results.filter(scoredResult).length;
  return { complete: scored === scheduled, scheduledMatches: scheduled, attemptedMatches: results.length,
    scoredMatches: scored, unscoredMatches: results.length - scored, remainingMatches: scheduled - results.length,
    errorCount: results.filter(r => r.error).length };
}

/** results: [{ a, b, winner (0 = a, 1 = b, -1 draw), hull: [a, b], error?, forfeit?, void? }] */
export function standings(entrants, results) {
  const row = Object.fromEntries(entrants.map((e) => [e.id, { id: e.id, played: 0, w: 0, d: 0, l: 0, points: 0, hullDiff: 0, errors: 0, unscored: 0, vs: {} }]));
  for (const r of results) {
    const A = row[r.a], B = row[r.b];
    if (!A || !B || A === B) continue;
    if (r.error) { if (r.errorBy === r.a) A.errors++; else if (r.errorBy === r.b) B.errors++; }
    if (!scoredResult(r)) { A.unscored++; B.unscored++; continue; }
    A.played++; B.played++;
    const va = (A.vs[r.b] ||= { w: 0, d: 0, l: 0 }), vb = (B.vs[r.a] ||= { w: 0, d: 0, l: 0 });
    if (r.winner === 0) { A.w++; B.l++; A.points += 3; va.w++; vb.l++; }
    else if (r.winner === 1) { B.w++; A.l++; B.points += 3; vb.w++; va.l++; }
    else { A.d++; B.d++; A.points++; B.points++; va.d++; vb.d++; }
    if (r.hull) { A.hullDiff += r.hull[0] - r.hull[1]; B.hullDiff += r.hull[1] - r.hull[0]; }
  }
  return Object.values(row)
    .map((x) => ({ ...x, hullDiff: Math.round(x.hullDiff * 100) / 100, winRate: x.played ? Math.round((x.w / x.played) * 1000) / 1000 : 0 }))
    .sort((p, q) => Number(q.played > 0) - Number(p.played > 0) || q.points - p.points || q.hullDiff - p.hullDiff || (p.id < q.id ? -1 : 1));
}
