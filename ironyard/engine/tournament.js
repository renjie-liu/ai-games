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

/** results: [{ a, b, winner (0 = a, 1 = b, -1 draw), hull: [a, b], error? }] */
export function standings(entrants, results) {
  const row = Object.fromEntries(entrants.map((e) => [e.id, { id: e.id, played: 0, w: 0, d: 0, l: 0, points: 0, hullDiff: 0, errors: 0, vs: {} }]));
  for (const r of results) {
    const A = row[r.a], B = row[r.b];
    if (!A || !B) continue;
    A.played++; B.played++;
    const va = (A.vs[r.b] ||= { w: 0, d: 0, l: 0 }), vb = (B.vs[r.a] ||= { w: 0, d: 0, l: 0 });
    if (r.winner === 0) { A.w++; B.l++; A.points += 3; va.w++; vb.l++; }
    else if (r.winner === 1) { B.w++; A.l++; B.points += 3; vb.w++; va.l++; }
    else { A.d++; B.d++; A.points++; B.points++; va.d++; vb.d++; }
    if (r.hull) { A.hullDiff += r.hull[0] - r.hull[1]; B.hullDiff += r.hull[1] - r.hull[0]; }
    if (r.error) { if (r.errorBy === r.a) A.errors++; else if (r.errorBy === r.b) B.errors++; }
  }
  return Object.values(row)
    .map((x) => ({ ...x, hullDiff: Math.round(x.hullDiff * 100) / 100, winRate: x.played ? Math.round((x.w / x.played) * 1000) / 1000 : 0 }))
    .sort((p, q) => q.points - p.points || q.hullDiff - p.hullDiff || (p.id < q.id ? -1 : 1));
}
