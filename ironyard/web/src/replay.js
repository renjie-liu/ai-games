// Turns a match result into something that can be scrubbed: per-piece death
// times, centre-of-mass timeline, odometers (for wheel spin), item/mine
// lifetimes, effects, and an interpolated view of the world at any time.
const TAU = Math.PI * 2;
const lerpAng = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return a + d * k; };
const TEAM_HEX = [0xf47b20, 0x2086e6];

export function prepReplay(res, IY) {
  const map = IY.MAPS[res.map];
  const fdt = res.frameDt;
  const frames = res.frames;
  const frameAt = (t) => frames[Math.max(0, Math.min(frames.length - 1, Math.floor(t / fdt + 1e-6)))];
  const solid = (p) => !IY.PARTS[p.type].decor;
  const vehicles = res.vehicles.map((v, id) => {
    const parts = v.design.parts;
    const a = IY.aggregate(parts.filter(solid));
    const weaponIdx = [];
    parts.forEach((p, i) => { const d = IY.PARTS[p.type]; if (d.weapon && d.weapon !== 'melee') weaponIdx.push(i); });
    // odometer: signed distance driven along the hull axis, per frame
    const odo = new Float32Array(frames.length);
    for (let i = 1; i < frames.length; i++) {
      const p = frames[i - 1].v[id], q = frames[i].v[id];
      odo[i] = odo[i - 1] + (q[0] - p[0]) * Math.cos(q[2]) + (q[1] - p[1]) * Math.sin(q[2]);
    }
    return { ...v, parts, deathT: parts.map(() => Infinity), com: [{ t: -1, u: a.comU, v: a.comV, r: a.radius }], weaponIdx, odo,
      alive: parts.map(() => true), diedAt: v.deathT === null ? Infinity : v.deathT };
  });
  const fx = [];      // {k, t, x, y, ...}
  const items = [];   // {s, type, x, y, t0, t1}
  const mines = [];   // {id, x, y, team, t0, t1}
  const feed = [];    // {t, text, team}
  const openItem = {}, openMine = {};
  const name = (id) => (id >= 0 && vehicles[id] ? vehicles[id].name : null);
  const CAUSE = { fell: '坠落', burn: '烧毁', ram: '撞毁', melee: '锯毁', kinetic: '击毁', explosive: '炸毁', energy: '熔毁' };
  for (const e of res.events) {
    if (e.k === 'part') {
      const v = vehicles[e.v], p = v.parts[e.i], d = IY.PARTS[p.type];
      const c = v.com[v.com.length - 1];
      const f = frameAt(e.t).v[e.v];
      const [cx, cy] = IY.centerOf(p);
      const u = cy * IY.CELL - c.u, l = -cx * IY.CELL - c.v;
      const cs = Math.cos(f[2]), sn = Math.sin(f[2]);
      v.deathT[e.i] = e.t; v.alive[e.i] = false;
      if (!d.decor) {
        const left = v.parts.filter((q, i) => v.alive[i] && solid(q));
        if (left.length) { const a = IY.aggregate(left); v.com.push({ t: e.t, u: a.comU, v: a.comV, r: a.radius }); }
      }
      const own = d.cat === 'structure' ? (p.type.startsWith('armor') ? 0xaab1b8 : TEAM_HEX[v.team]) : d.cat === 'mobility' ? 0x59616b : d.cat === 'weapon' ? 0x6b737c : d.cat === 'decor' ? 0xf2f3f2 : 0xf5cd2f;
      const color = [own, TEAM_HEX[v.team], 0xd9dee3]; // a popped piece scatters bricks in its own colour, the team colour and light grey
      fx.push({ k: 'debris', t: e.t, x: f[0] + cs * u - sn * l, y: f[1] + sn * u + cs * l, h: p.z ? 0.7 : 0.35, color, n: Math.min(5, 2 + d.size[0] * d.size[1]), seed: e.v * 131 + e.i });
    } else if (e.k === 'death') {
      const v = vehicles[e.v];
      v.diedAt = e.t;
      fx.push({ k: 'death', t: e.t, x: e.x, y: e.y, team: v.team });
      feed.push({ t: e.t, team: v.team, kind: 'death', text: name(e.by) ? `${name(e.by)} ${CAUSE[e.c] || e.c} ${v.name}` : `${v.name} ${CAUSE[e.c] || e.c}` });
    } else if (e.k === 'boom') fx.push({ k: 'boom', t: e.t, x: e.x, y: e.y, r: e.r });
    else if (e.k === 'rail') fx.push({ k: 'rail', t: e.t, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, team: e.team });
    else if (e.k === 'spark') fx.push({ k: 'spark', t: e.t, x: e.x, y: e.y });
    else if (e.k === 'ram') fx.push({ k: 'ram', t: e.t, x: e.x, y: e.y, d: e.d });
    else if (e.k === 'emp') fx.push({ k: 'emp', t: e.t, x: e.x, y: e.y, r: e.r, team: e.team });
    else if (e.k === 'item') { const it = { s: e.s, type: e.type, x: e.x, y: e.y, t0: e.t, t1: Infinity }; items.push(it); openItem[e.s] = it; }
    else if (e.k === 'pickup') {
      if (openItem[e.s]) { openItem[e.s].t1 = e.t; fx.push({ k: 'pickup', t: e.t, x: openItem[e.s].x, y: openItem[e.s].y, type: e.type }); }
      feed.push({ t: e.t, team: vehicles[e.v].team, kind: 'item', text: `${vehicles[e.v].name} 拾取 ${IY.ITEMS[e.type].icon}${IY.ITEMS[e.type].zh}` });
    } else if (e.k === 'use') feed.push({ t: e.t, team: vehicles[e.v].team, kind: 'item', text: `${vehicles[e.v].name} 使用 ${IY.ITEMS[e.type].icon}${IY.ITEMS[e.type].zh}` });
    else if (e.k === 'mine') { const m = { id: e.id, x: e.x, y: e.y, team: e.team, t0: e.t, t1: Infinity }; mines.push(m); openMine[e.id] = m; }
    else if (e.k === 'mineboom') { if (openMine[e.id]) openMine[e.id].t1 = e.t; }
    else if (e.k === 'cutoff') feed.push({ t: e.t, team: vehicles[e.v].team, kind: 'death', text: `${vehicles[e.v].name} 控制器出错被切断` });
  }
  const duration = frames[frames.length - 1].t;
  return { res, map, frames, fdt, duration, vehicles, fx, items, mines, feed, zone: map.zone };
}

/** Interpolated world state at time t (seconds). */
export function viewAt(rp, t) {
  const { frames, fdt } = rp;
  t = Math.max(0, Math.min(rp.duration, t));
  const fi = t / fdt, i0 = Math.min(frames.length - 1, Math.floor(fi)), i1 = Math.min(frames.length - 1, i0 + 1);
  const k = i1 === i0 ? 0 : fi - i0;
  const f0 = frames[i0], f1 = frames[i1];
  const vehicles = rp.vehicles.map((v, id) => {
    const a = f0.v[id], b = f1.v[id];
    let com = v.com[0];
    for (let j = v.com.length - 1; j >= 0; j--) if (v.com[j].t <= t) { com = v.com[j]; break; }
    const angles = [];
    for (let w = 8; w < a.length; w++) angles.push(lerpAng(a[w], b[w], k));
    return {
      id, team: v.team, name: v.name, alive: t < v.diedAt,
      x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, th: lerpAng(a[2], b[2], k),
      energy: a[3], shield: a[4], hp: a[5], flags: a[6], item: a[7] || null, angles, com,
      deathT: v.deathT, odo: v.odo[i0] + (v.odo[i1] - v.odo[i0]) * k,
    };
  });
  const next = new Map();
  for (const p of f1.p) next.set(p[0], p);
  const born = new Set(frames[Math.max(0, i0 - 2)].p.map((p) => p[0]));
  const flashes = [], trails = [];
  const projectiles = f0.p.map((p) => {
    const q = next.get(p[0]);
    const o = q ? { id: p[0], kind: p[1], x: p[2] + (q[2] - p[2]) * k, y: p[3] + (q[3] - p[3]) * k, ang: lerpAng(p[4], q[4], k), team: p[5], h: p[6] !== undefined ? p[6] + ((q[6] ?? p[6]) - p[6]) * k : 0 }
      : { id: p[0], kind: p[1], x: p[2], y: p[3], ang: p[4], team: p[5], h: p[6] || 0 };
    if (i0 >= 2 && !born.has(p[0])) { // just fired: flash where it first appeared
      let first = p;
      const prev = frames[i0 - 1].p.find((r) => r[0] === p[0]);
      if (prev) first = prev;
      flashes.push({ x: first[2], y: first[3], ang: first[4], kind: p[1], team: p[5] });
    }
    if (p[1] >= 2) { // missiles and mortar shells leave smoke
      for (let j = 1; j <= 9 && i0 - j >= 0; j++) {
        const r = frames[i0 - j].p.find((s) => s[0] === p[0]);
        if (!r) break;
        trails.push({ x: r[2], y: r[3], h: r[6] || 0, kind: p[1], age: (j + k) * fdt });
      }
    }
    return o;
  });
  return {
    t, vehicles, projectiles, flashes, trails, beams: f0.b, zoneR: f0.z + (f1.z - f0.z) * k,
    items: rp.items.filter((it) => it.t0 <= t && t < it.t1),
    mines: rp.mines.filter((m) => m.t0 <= t && t < m.t1),
    fx: rp.fx.filter((e) => e.t <= t && t - e.t < 1.6),
    feed: rp.feed.filter((e) => e.t <= t && t - e.t < 5).slice(-4),
  };
}
