// Shared, environment-independent strength scoring for the ladder and tournaments.
export const RATING_METHOD = 'bradley-terry-elo-v1';
export const RATING_LABEL = 'Strength (Elo scale)';
const START = 1500, PRIOR = 2;
const rankedResult = r => r && !r.void && [-1, 0, 1].includes(r.w);

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

