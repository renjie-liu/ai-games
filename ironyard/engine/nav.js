// Navigation helpers handed to controllers (api.nav): tile queries, line of
// sight, drivable-line checks and A* path-finding.
//
// Paths are planned on a 1 m lattice (twice the tile resolution) with a
// clearance field, so a 3.5 m wide tank is routed down the middle of a 4 m gap
// instead of being sent to scrape along the wall.
import { TILE } from './parts.js';
import { TILE_CODE, TILE_NAME, TILE_SOLID, TILE_SHOTS } from './maps.js';
import { makeFollower } from './realm.js';

const C = TILE_CODE;
const STEP = TILE / 2;
const FAR = 6;

export function makeNav(map) {
  const { w, h, tiles } = map;
  const code = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? C.pit : tiles[ty * w + tx]);
  const codeAt = (x, y) => code(Math.floor(x / TILE), Math.floor(y / TILE));
  const solid = (c) => TILE_SOLID[c];

  // ── lattice + clearance fields ──
  const gw = w * 2 + 1, gh = h * 2 + 1, N = gw * gh;
  const wallDist = new Float32Array(N).fill(FAR);
  const pitDist = new Float32Array(N).fill(FAR);
  const terrain = new Uint8Array(N); // worst tile touching the node: 0 floor, mud, ice, lava
  const RANK = { [C.lava]: 3, [C.mud]: 2, [C.ice]: 1 };
  const R = Math.ceil(FAR / TILE);
  const survey = (i, j) => {
    const x = i * STEP, y = j * STEP, n = j * gw + i;
    const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
    let wd = FAR, pd = FAR, worst = 0;
    for (let ty = ty0 - R; ty <= ty0 + R; ty++) for (let tx = tx0 - R; tx <= tx0 + R; tx++) {
      const c = code(tx, ty);
      const isS = solid(c), isP = c === C.pit;
      const x0 = tx * TILE, y0 = ty * TILE;
      const dx = Math.max(x0 - x, 0, x - (x0 + TILE)), dy = Math.max(y0 - y, 0, y - (y0 + TILE));
      const d = Math.hypot(dx, dy);
      if (isS && d < wd) wd = d;
      if (isP && d < pd) pd = d;
      if (d < 1e-6 && RANK[c] > worst) worst = RANK[c];
    }
    wallDist[n] = wd; pitDist[n] = pd; terrain[n] = worst;
  };
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) survey(i, j);
  /** A tile changed (a crate or barrel went): redo the clearance of every lattice node it could have mattered to. */
  const refresh = (tx, ty) => {
    const reach = Math.ceil(FAR / STEP) + 2;
    const i0 = Math.max(0, tx * 2 - reach), i1 = Math.min(gw - 1, tx * 2 + 2 + reach);
    const j0 = Math.max(0, ty * 2 - reach), j1 = Math.min(gh - 1, ty * 2 + 2 + reach);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) survey(i, j);
  };
  const nodeOf = (x, y) => {
    const i = Math.max(0, Math.min(gw - 1, Math.round(x / STEP))), j = Math.max(0, Math.min(gh - 1, Math.round(y / STEP)));
    return j * gw + i;
  };
  const okNode = (n, o) => wallDist[n] >= o.margin && (o.hover || pitDist[n] >= o.pitMargin);

  function nearestNode(x, y, o) {
    const n0 = nodeOf(x, y);
    if (okNode(n0, o)) return n0;
    const i0 = n0 % gw, j0 = (n0 - i0) / gw;
    for (let r = 1; r < 14; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
        const n = j * gw + i;
        if (!okNode(n, o)) continue;
        const d = (i * STEP - x) ** 2 + (j * STEP - y) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Is the straight segment free of walls, crates and barrels (for shooting)? Barriers do not block shots. */
  function los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / (TILE * 0.25)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (TILE_SHOTS[codeAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)]) return false;
    }
    return true;
  }

  /** Can a vehicle of half-width `margin` drive the straight segment without hitting a wall or passing within `pitMargin` (0.8 m) of a pit? */
  function clear(x0, y0, x1, y1, opts = {}) {
    const hover = !!opts.hover, margin = opts.margin ?? 0.9;
    const pitMargin = Math.min(margin, opts.pitMargin ?? 0.8); // a pit only takes the centre of mass, so it needs less room than a wall
    const avoid = opts.avoid || null; // e.g. ['lava']
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1e-6) return true;
    const nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
    const n = Math.max(1, Math.ceil(d / 0.6));
    const lat = Math.max(1, Math.ceil(margin / 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      for (let s = -lat; s <= lat; s++) {
        const off = (s / lat) * margin;
        const c = codeAt(px + nx * off, py + ny * off);
        if (solid(c)) return false;
        if (!hover && c === C.pit && Math.abs(off) <= pitMargin + 1e-9) return false;
        if (s === 0 && avoid && !hover && avoid.includes(TILE_NAME[c])) return false;
      }
    }
    return true;
  }

  // A* scratch (generation-stamped so nothing needs clearing between calls)
  const g = new Float32Array(N), f = new Float32Array(N);
  const came = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
  let gen = 0;
  const heap = [];
  const push = (i) => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; }
    }
    return top;
  };

  /**
   * A* route. Returns waypoints [{x, y}, ...] ending at the goal (start
   * excluded), or [] if there is no route.
   * opts: { hover, margin (vehicle half-width, m), mudCost, iceCost, lavaCost, edgeCost, smooth }
   */
  function path(x0, y0, x1, y1, opts = {}) {
    const o = { hover: false, margin: 1.2, pitMargin: 0.7, mudCost: 3, iceCost: 1.6, lavaCost: 25, edgeCost: 0.6, smooth: true, ...opts };
    o.margin = Math.max(0.3, Math.min(2.4, o.margin));
    let s = nearestNode(x0, y0, o), e = nearestNode(x1, y1, o);
    if (s < 0) s = nearestNode(x0, y0, { ...o, margin: 0.3, pitMargin: 0 });
    if (s < 0 || e < 0) return [];
    const ei = e % gw, ej = (e - ei) / gw;
    const tc = o.hover ? [1, 1, 1, 1 + o.lavaCost * 0.25] : [1, o.iceCost, o.mudCost, o.lavaCost];
    gen++; heap.length = 0;
    g[s] = 0; f[s] = 0; came[s] = -1; stamp[s] = gen; push(s);
    let found = false;
    while (heap.length) {
      const n = pop();
      if (closed[n] === gen) continue;
      closed[n] = gen;
      if (n === e) { found = true; break; }
      const i = n % gw, j = (n - i) / gw;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= gw || b >= gh) continue;
        const m = b * gw + a;
        if (closed[m] === gen) continue;
        if (!okNode(m, o) && m !== e) continue;
        let k = tc[terrain[m]];
        if (wallDist[m] < o.margin + 0.7) k += o.edgeCost;
        if (!o.hover && pitDist[m] < 1.8) k += o.edgeCost * 2;
        const ng = g[n] + (di && dj ? 1.4142 : 1) * k;
        if (stamp[m] === gen && ng >= g[m]) continue;
        g[m] = ng; came[m] = n; stamp[m] = gen;
        const hx = Math.abs(ei - a), hy = Math.abs(ej - b);
        f[m] = ng + (hx + hy - 0.5858 * Math.min(hx, hy));
        push(m);
      }
    }
    if (!found) return [];
    const pts = [];
    for (let n = e; n !== -1 && n !== s; n = came[n]) {
      const i = n % gw, j = (n - i) / gw;
      pts.push({ x: i * STEP, y: j * STEP });
    }
    pts.reverse();
    // finish exactly on the requested point when it is itself drivable
    const goalOk = !solid(codeAt(x1, y1)) && (o.hover || codeAt(x1, y1) !== C.pit);
    if (goalOk) { if (pts.length) pts[pts.length - 1] = { x: x1, y: y1 }; else pts.push({ x: x1, y: y1 }); }
    if (!o.smooth || pts.length < 2) return pts;
    // string-pulling: skip waypoints we can drive straight past
    const avoid = o.hover ? null : ['lava', 'mud'];
    const strict = { hover: o.hover, margin: o.margin, avoid };
    const out = [];
    let ax = x0, ay = y0, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = Math.min(pts.length - 1, k + 24); j > k; j--) {
        if (clear(ax, ay, pts[j].x, pts[j].y, strict)) { far = j; break; }
      }
      out.push(pts[far]); ax = pts[far].x; ay = pts[far].y; k = far + 1;
    }
    return out;
  }

  const follower = makeFollower(path, clear);

  return {
    follower,
    tileAt: (x, y) => TILE_NAME[codeAt(x, y)],
    tileAtCell: (tx, ty) => TILE_NAME[code(tx, ty)],
    isOpen: (x, y, hover = false) => { const c = codeAt(x, y); return !solid(c) && (hover || c !== C.pit); },
    /** metres from (x, y) to the nearest wall/barrier and the nearest pit (capped at 6) */
    clearance: (x, y) => { const n = nodeOf(x, y); return { wall: wallDist[n], pit: pitDist[n] }; },
    los, clear, path, refresh,
  };
}
