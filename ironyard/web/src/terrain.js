// Arena scenery. Everything here is generated in the browser: tiling detail
// textures (concrete, asphalt, steel deck, sand, snow, grass, mud, ice), a
// per-map control map and decal sheet, the blended ground material, flowing
// lava, cliffs, walls, barriers, sky and props. No image files.
// World (x east, y north) maps to three.js (x, up, -y).
/* global THREE */
import { glowTexture } from './kit.js';

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const pot = (v) => Math.min(2048, 2 ** Math.ceil(Math.log2(v)));
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const hash2 = (x, y, s = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── tileable noise fields ───────────────────────────────────────────────
function valueNoise(N, cells, seed) {
  const r = rng32(seed), g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(N * N), k = cells / N;
  for (let y = 0; y < N; y++) {
    const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < N; x++) {
      const fx = x * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cells, xb = (x0 + 1) % cells;
      const a = g[ya + xa], b = g[ya + xb], c = g[yb + xa], d = g[yb + xb];
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
function fbm(N, cells, oct, seed, gain = 0.5) {
  const out = new Float32Array(N * N); let amp = 1, sum = 0;
  for (let o = 0; o < oct && cells <= N / 2; o++, cells *= 2, amp *= gain) { const n = valueNoise(N, cells, seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; sum += amp; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}
/** Tileable cellular noise: f1 = distance to the nearest point (in cell units), edge = f2 - f1 (0 on cell borders). */
function worley(N, cells, seed) {
  const r = rng32(seed), px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = r(); py[i] = r(); }
  const f1 = new Float32Array(N * N), edge = new Float32Array(N * N), k = cells / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x * k, fy = y * k, cx = Math.floor(fx), cy = Math.floor(fy);
    let d1 = 9, d2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, id = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells);
      const dx = gx + px[id] - fx, dy = gy + py[id] - fy, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    d1 = Math.sqrt(d1); f1[y * N + x] = d1; edge[y * N + x] = Math.sqrt(d2) - d1;
  }
  return { f1, edge };
}

function dataTex(w, h, data, { srgb = false, repeat = true, mip = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = mip;
  t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true;
  return t;
}
/** Pack colour + roughness into one texture and normal + mask into another. C: rgb bytes, R/H/K: 0..1 fields. */
function finish(N, M, C, R, H, K, strength) {
  const A = new Uint8Array(N * M * 4), Nn = new Uint8Array(N * M * 4), b = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0);
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    A[o] = C[i * 3]; A[o + 1] = C[i * 3 + 1]; A[o + 2] = C[i * 3 + 2]; A[o + 3] = b(R[i]);
    const dx = (H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)]) * strength, dy = (H[((y + 1) % M) * N + x] - H[((y + M - 1) % M) * N + x]) * strength;
    const l = 1 / Math.hypot(dx, dy, 1);
    Nn[o] = b(-dx * l * 0.5 + 0.5); Nn[o + 1] = b(-dy * l * 0.5 + 0.5); Nn[o + 2] = b(l * 0.5 + 0.5); Nn[o + 3] = b(K ? K[i] : H[i]);
  }
  return { a: dataTex(N, M, A, { srgb: true }), n: dataTex(N, M, Nn) };
}
const put = (C, i, r, g, b) => { C[i * 3] = r < 0 ? 0 : r > 255 ? 255 : r; C[i * 3 + 1] = g < 0 ? 0 : g > 255 ? 255 : g; C[i * 3 + 2] = b < 0 ? 0 : b > 255 ? 255 : b; };
const fields = (N, M = N) => ({ C: new Uint8Array(N * M * 3), R: new Float32Array(N * M), H: new Float32Array(N * M), K: new Float32Array(N * M) });

// ── detail textures (each tiles; ground ones cover 4 m, mud 3 m, ice 5 m) ──
const BUILD = {
  concrete() {
    const N = 512, { C, R, H } = fields(N), blot = fbm(N, 3, 4, 11), mid = fbm(N, 12, 3, 13), grain = fbm(N, 64, 2, 12), w = worley(N, 60, 14);
    for (let i = 0; i < N * N; i++) {
      const pore = sm(0.14, 0.03, w.f1[i]) * sm(0.4, 0.6, mid[i]);
      const l = 0.78 + 0.26 * blot[i] + 0.16 * (grain[i] - 0.5) + 0.12 * (mid[i] - 0.5) - 0.4 * pore;
      put(C, i, 156 * l + 8 * (blot[i] - 0.5), 155 * l, 150 * l - 6 * (blot[i] - 0.5));
      H[i] = 0.5 + 0.3 * (grain[i] - 0.5) + 0.35 * (mid[i] - 0.5) - 0.5 * pore; R[i] = 0.88 - 0.1 * grain[i] + 0.04 * pore;
    }
    return finish(N, N, C, R, H, null, 5);
  },
  asphalt() {
    const N = 512, { C, R, H } = fields(N), w = worley(N, 120, 21), grain = fbm(N, 64, 2, 23), blot = fbm(N, 3, 4, 24), tone = valueNoise(N, 120, 25);
    for (let i = 0; i < N * N; i++) {
      const stone = sm(0.42, 0.18, w.f1[i]), l = 0.72 + 0.4 * blot[i], s = stone * (26 + 70 * tone[i]);
      put(C, i, 44 * l + s, 46 * l + s, 50 * l + s * 0.96);
      H[i] = stone * 0.7 + grain[i] * 0.3; R[i] = 0.93 - 0.18 * stone;
    }
    return finish(N, N, C, R, H, null, 4);
  },
  steel() { // tread plate: raised diamond lugs, worn bright on top, rust in patches
    const N = 512, { C, R, H } = fields(N), grain = fbm(N, 64, 2, 31), blot = fbm(N, 3, 4, 32), rustN = fbm(N, 6, 4, 33), s = N / 25;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, ci = Math.floor(x / s), cj = Math.floor(y / s), lx = x / s - ci - 0.5, ly = y / s - cj - 0.5, dg = (ci + cj) & 1 ? 1 : -1;
      const a = (lx + dg * ly) * 0.7071, b = (lx - dg * ly) * 0.7071, lug = sm(1, 0.55, (a / 0.36) ** 2 + (b / 0.1) ** 2);
      const rust = sm(0.66, 0.84, rustN[i]) * (1 - 0.5 * lug) * 0.34, l = 0.82 + 0.28 * blot[i] + 0.1 * (grain[i] - 0.5), q = 0.8 + 0.3 * grain[i];
      put(C, i, mix(104 * l + lug * 26, 116 * q, rust), mix(110 * l + lug * 26, 70 * q, rust), mix(118 * l + lug * 26, 42 * q, rust));
      H[i] = lug * 0.75 + grain[i] * 0.12; R[i] = 0.38 + 0.4 * rust - 0.1 * lug + 0.1 * grain[i];
    }
    return finish(N, N, C, R, H, null, 4);
  },
  sand(tr = 196, tg = 160, tb = 114) {
    const N = 512, { C, R, H } = fields(N), blot = fbm(N, 3, 5, 41), grain = fbm(N, 96, 2, 42), warp = fbm(N, 4, 3, 43), w = worley(N, 34, 44), tone = valueNoise(N, 34, 45), TAU = Math.PI * 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, rip = (0.5 + 0.5 * Math.sin((y / N) * TAU * 16 + (warp[i] - 0.5) * 16 + (x / N) * TAU * 3)) * sm(0.4, 0.62, blot[i]);
      const stone = sm(0.11, 0.06, w.f1[i]), l = 0.82 + 0.28 * blot[i] + 0.14 * (grain[i] - 0.5), st = 0.7 + 0.5 * tone[i];
      put(C, i, mix(tr * l, 112 * st, stone), mix(tg * l, 96 * st, stone), mix(tb * l, 84 * st, stone));
      H[i] = 0.1 * rip + 0.22 * grain[i] + 0.7 * stone + 0.25 * blot[i]; R[i] = 0.94;
    }
    return finish(N, N, C, R, H, null, 5);
  },
  snow() {
    const N = 512, { C, R, H } = fields(N), soft = fbm(N, 5, 5, 51), fine = fbm(N, 90, 2, 52), drift = fbm(N, 2, 3, 53);
    for (let i = 0; i < N * N; i++) {
      const t = sm(0.3, 0.7, soft[i]), sp = fine[i] > 0.7 ? 6 : 0;
      put(C, i, mix(196, 246, t) + sp, mix(212, 248, t) + sp, mix(236, 252, t) + sp);
      H[i] = soft[i] * 0.8 + drift[i] * 0.5 + fine[i] * 0.05; R[i] = 0.62 + 0.25 * fine[i];
    }
    return finish(N, N, C, R, H, null, 14);
  },
  grass() {
    const N = 512, { C, R, H } = fields(N), blot = fbm(N, 4, 5, 61), fine = fbm(N, 110, 2, 62), mid = fbm(N, 24, 3, 63), dirtN = fbm(N, 6, 4, 64);
    for (let i = 0; i < N * N; i++) {
      const dirt = sm(0.52, 0.4, dirtN[i]), t = fine[i] * 0.6 + mid[i] * 0.4, l = 0.7 + 0.5 * blot[i], q = 0.78 + 0.34 * fine[i];
      put(C, i, mix(mix(50, 92, t) * l, 84 * q, dirt), mix(mix(58, 96, t) * l, 68 * q, dirt), mix(mix(30, 46, t) * l, 46 * q, dirt)); // tired olive, not lawn green
      H[i] = fine[i] * 0.5 + mid[i] * 0.4 - dirt * 0.2; R[i] = 0.93;
    }
    return finish(N, N, C, R, H, null, 5);
  },
  mud() { // churned wet earth: broad ridges and ruts, darker and glossier in the hollows
    const N = 512, { C, R, H } = fields(N), h = fbm(N, 4, 6, 71), w = worley(N, 9, 72), fine = fbm(N, 56, 2, 73), blot = fbm(N, 2, 3, 74);
    for (let i = 0; i < N * N; i++) {
      const hh = 0.62 * h[i] + 0.16 * (1 - sm(0, 0.7, w.f1[i])) + 0.12 * fine[i] + 0.1 * blot[i], wet = sm(0.52, 0.36, hh), l = 0.86 + 0.28 * fine[i];
      put(C, i, mix(124, 74, wet) * l, mix(95, 55, wet) * l, mix(66, 38, wet) * l);
      H[i] = hh; R[i] = mix(0.8, 0.42, wet);
    }
    return finish(N, N, C, R, H, null, 7);
  },
  ice() { // only the normal/mask texture is used: cracks in the alpha channel
    const N = 512, { C, R, H, K } = fields(N), w = worley(N, 6, 81), w2 = worley(N, 13, 82), wav = fbm(N, 4, 4, 83);
    for (let i = 0; i < N * N; i++) { K[i] = Math.max(sm(0.04, 0, w.edge[i]), sm(0.03, 0, w2.edge[i]) * 0.45); H[i] = wav[i] * 0.6 - K[i] * 0.5; R[i] = 0.1; }
    return finish(N, N, C, R, H, K, 5);
  },
  water() { // normal map only
    const N = 256, { C, R, H } = fields(N), a = fbm(N, 5, 5, 161), b = fbm(N, 13, 3, 162);
    for (let i = 0; i < N * N; i++) { H[i] = a[i] * 0.7 + b[i] * 0.3; R[i] = 0.2; }
    return finish(N, N, C, R, H, null, 7);
  },
  cloud() { // a broken deck of cloud, lit from above: colour + coverage in alpha
    const N = 512, cov = fbm(N, 4, 6, 171), lit = fbm(N, 7, 4, 172), d = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { const a = sm(0.44, 0.66, cov[i]), l = 0.72 + 0.28 * sm(0.3, 0.7, lit[i]) * a; d[i * 4] = 255 * l; d[i * 4 + 1] = 255 * l; d[i * 4 + 2] = 255 * l; d[i * 4 + 3] = a * 240; }
    return dataTex(N, N, d, { srgb: true });
  },
  noise() {
    const N = 256, ch = [fbm(N, 4, 5, 91), fbm(N, 4, 5, 92), fbm(N, 6, 4, 93), fbm(N, 8, 4, 94)], d = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) { const v = (ch[c][i] - 0.5) * 2.4 + 0.5; d[i * 4 + c] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255; }
    return dataTex(N, N, d);
  },
  // walls: 4 m x 4 m, v runs up from the ground
  wallConcrete(band = '', moss = 0) {
    const N = 512, { C, R, H } = fields(N), blot = fbm(N, 3, 4, 111), mid = fbm(N, 12, 3, 113), grain = fbm(N, 64, 2, 112), streak = valueNoise(N, 40, 114), mossN = fbm(N, 10, 4, 115);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, xm = x % 256, joint = Math.max(sm(3, 0, Math.min(xm, 256 - xm)), sm(3, 0, Math.abs(y - 154)), sm(3, 0, Math.abs(y - 307)));
      const hx = ((x + 64) % 128) - 64, hole = Math.max(sm(6, 3, Math.hypot(hx, y - 77)), sm(6, 3, Math.hypot(hx, y - 230)));
      const t = Math.min(1, Math.max(0, (307 - y) / 307)), stain = y <= 307 ? sm(0.5, 0.8, streak[x] * 0.7 + blot[i] * 0.5) * (1 - t) ** 1.5 * 0.5 : 0, grime = y < 45 ? (1 - y / 45) * 0.35 : 0;
      let l = 0.76 + 0.24 * blot[i] + 0.16 * (grain[i] - 0.5) + 0.1 * (mid[i] - 0.5) - 0.35 * joint - 0.5 * hole - stain - grime;
      let r = 150 * l, g = 149 * l, b = 144 * l, rough = 0.86;
      if (moss) { const m = sm(0.45, 0.62, mossN[i]) * Math.max(0, 1 - y / 150) * moss; r = mix(r, 62 * (0.7 + 0.6 * grain[i]), m); g = mix(g, 84 * (0.7 + 0.6 * grain[i]), m); b = mix(b, 44 * (0.7 + 0.6 * grain[i]), m); }
      if (band && y >= 6 && y <= 44 && grain[i] > 0.36) { // worn painted band along the foot of the wall
        const on = band === 'hazard' ? Math.floor((x + y) / 32) % 2 === 0 : true, pc = band === 'hazard' ? (on ? [226, 180, 36] : [30, 30, 32]) : band === 'red' ? [168, 44, 34] : [226, 180, 36], k = 0.9 * (1 - grime);
        r = mix(r, pc[0] * (0.8 + 0.3 * grain[i]), k); g = mix(g, pc[1] * (0.8 + 0.3 * grain[i]), k); b = mix(b, pc[2] * (0.8 + 0.3 * grain[i]), k); rough = 0.7;
      }
      put(C, i, r, g, b); H[i] = 0.5 + 0.25 * (grain[i] - 0.5) + 0.3 * (mid[i] - 0.5) - 0.6 * joint - 0.8 * hole; R[i] = rough;
    }
    return finish(N, N, C, R, H, null, 5);
  },
  wallRock(tr = 178, tg = 124, tb = 84) {
    const N = 512, { C, R, H } = fields(N), warp = fbm(N, 3, 4, 121), grain = fbm(N, 64, 2, 122), w = worley(N, 8, 123);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, s = (y / N) * 12 + (warp[i] - 0.5) * 4.5, li = Math.floor(s), ht = hash2(((li % 12) + 12) % 12, 3, 7), groove = sm(0.1, 0, s - li), crack = sm(0.045, 0, w.edge[i]);
      const l = 0.72 + 0.36 * ht + 0.2 * (grain[i] - 0.5) - 0.35 * groove - 0.4 * crack;
      put(C, i, tr * l + 14 * (ht - 0.5), tg * l, tb * l - 8 * (ht - 0.5));
      H[i] = 0.5 + 0.25 * (ht - 0.5) + 0.3 * (grain[i] - 0.5) - 0.5 * groove - 0.6 * crack; R[i] = 0.9;
    }
    return finish(N, N, C, R, H, null, 6);
  },
  wallCorrugated(pr = 44, pg = 78, pb = 86) {
    const N = 512, { C, R, H } = fields(N), grain = fbm(N, 64, 2, 131), rustN = fbm(N, 7, 4, 132), streak = valueNoise(N, 64, 133), TAU = Math.PI * 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, corr = 0.5 + 0.5 * Math.sin((x / N) * TAU * 20), seam = sm(3, 0, Math.min(x % 256, 256 - (x % 256))), rail = sm(6, 3, Math.abs(y - 160));
      const rust = sm(0.5, 0.72, rustN[i] * 0.7 + streak[x] * 0.3 + (y < 50 ? (50 - y) / 120 : 0) + (y > 270 ? (y - 270) / 250 : 0)) * 0.8;
      const sh = (0.72 + 0.34 * corr) * (0.9 + 0.2 * grain[i]) * (1 - 0.5 * seam) * (y < 26 ? 0.6 + 0.4 * (y / 26) : 1), q = 0.7 + 0.5 * grain[i];
      put(C, i, mix(pr * sh + rail * 30, 112 * q, rust), mix(pg * sh + rail * 30, 64 * q, rust), mix(pb * sh + rail * 30, 38 * q, rust));
      H[i] = corr * 0.8 + rail; R[i] = mix(0.5, 0.85, rust);
    }
    return finish(N, N, C, R, H, null, 3);
  },
  // barrier sides: 2 m x 1 m
  barrierHazard() {
    const N = 256, { C, R, H } = fields(N), blot = fbm(N, 3, 4, 141), grain = fbm(N, 48, 2, 142), chip = fbm(N, 14, 3, 143);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, l = 0.78 + 0.24 * blot[i] + 0.16 * (grain[i] - 0.5), on = Math.floor((x + y * 0.5) / 32) % 2 === 0, paint = sm(0.34, 0.42, chip[i]) * 0.94, q = 0.82 + 0.3 * grain[i];
      const pc = on ? [228, 182, 38] : [30, 30, 32];
      put(C, i, mix(152 * l, pc[0] * q, paint), mix(151 * l, pc[1] * q, paint), mix(146 * l, pc[2] * q, paint));
      H[i] = 0.5 + 0.3 * (grain[i] - 0.5) + paint * 0.06; R[i] = mix(0.88, 0.62, paint);
    }
    return finish(N, N, C, R, H, null, 4);
  },
  sandbag(tr = 156, tg = 136, tb = 98) {
    const N = 256, { C, R, H } = fields(N), grain = fbm(N, 64, 2, 151), rh = N / 5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, row = Math.floor(y / rh), bx = (x + (row & 1) * 32) % 64, lu = bx / 64, lv = (y - row * rh) / rh;
      const bulge = (1 - Math.abs(2 * lu - 1) ** 4) * (1 - Math.abs(2 * lv - 1) ** 3), tone = hash2(row, Math.floor((x + (row & 1) * 32) / 64) % 4, 5), weave = ((x >> 1) + (y >> 1)) & 1 ? 1 : 0.88;
      const l = (0.7 + 0.3 * tone) * (0.5 + 0.55 * bulge) * weave * (0.9 + 0.2 * grain[i]);
      put(C, i, tr * l, tg * l, tb * l); H[i] = bulge; R[i] = 0.95;
    }
    return finish(N, N, C, R, H, null, 5);
  },
  // a wall of toy bricks, 4 m x 4 m: courses 0.4 m high, laid half a brick over the one below, in two colours.
  // mode: 'band' a dark plinth course and the top course of a six-course wall in the second colour; 'checker' every other
  // brick; 'stripe' every other course; 'speckle' an odd brick here and there. The texture's first row is the foot of the wall.
  brick(pr = 160, pg = 165, pb = 169, ar = pr, ag = pg, ab = pb, mode = 'plain') {
    const N = 512, { C, R, H } = fields(N), course = N / 10, per = mode === 'checker' ? 4 : 5, len = N / per, gap = 2.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, row = Math.floor(y / course), bx = (x + (row & 1) * len / 2) % N, col = Math.floor(bx / len);
      const dy = Math.min(y - row * course, (row + 1) * course - y), dx = Math.min(bx - col * len, (col + 1) * len - bx);
      const edge = Math.min(dx, dy), seam = sm(gap, 0, edge), bevel = sm(gap * 3, gap, edge);
      let second = false, dark = 1;
      if (mode === 'band') { second = row === 5; if (row === 0) dark = 0.7; }
      else if (mode === 'checker') second = ((col + (row >> 1)) & 1) === 1;
      else if (mode === 'stripe') second = (row & 1) === 1;
      else if (mode === 'speckle') second = hash2(row, col, 11) < 0.28;
      const tone = 0.96 + 0.08 * hash2(row, col, 7), l = dark * tone * (1 - 0.5 * seam) * (1 - 0.08 * bevel);
      put(C, i, (second ? ar : pr) * l, (second ? ag : pg) * l, (second ? ab : pb) * l); H[i] = 1 - seam; R[i] = 0.4;
    }
    return finish(N, N, C, R, H, null, 2.5);
  },
  // one flat colour: the top of a brick, under its studs
  plain(pr = 160, pg = 165, pb = 169) {
    const N = 8, { C, R, H } = fields(N);
    for (let i = 0; i < N * N; i++) { put(C, i, pr, pg, pb); H[i] = 0.5; R[i] = 0.4; }
    return finish(N, N, C, R, H, null, 1);
  },
};
const CACHE = {};
const detail = (kind, ...args) => (CACHE[kind + ':' + args.join(',')] ||= BUILD[kind](...args));

// ── themes ──────────────────────────────────────────────────────────────
// sun: [colour, intensity, azimuth, elevation]; hemi: [sky, ground, intensity]; fog: [near, far]
export const THEMES = {
  proving: { base: ['concrete'], wall: ['wallConcrete', 'hazard'], wallTop: ['concrete'], wallH: 2.4, barrier: ['barrierHazard'], marks: 'yard', props: true,
    sky: [0x4a78b8, 0xc4d6e6, 0x8a8f90], sun: [0xfff0d8, 1.6, 0.75, 0.8], hemi: [0xcfe0ff, 0x4a463e, 0.34], fog: [170, 560], tint: [0.8, 0.8, 0.8], apron: [0.62, 0.61, 0.6], exposure: 0.92 },
  sumo: { base: ['steel'], metal: 0.7, wall: ['wallCorrugated'], wallTop: ['concrete'], wallH: 2.4, barrier: ['barrierHazard'], marks: 'deck', void: true, below: 'sea', slab: ['wallCorrugated', 62, 68, 76],
    sky: [0x1d2d52, 0xe39a62, 0x24344c], sun: [0xffc48a, 1.7, -0.9, 0.42], hemi: [0x9fb4e0, 0x3a3440, 0.38], fog: [170, 560], tint: [1, 1, 1], exposure: 0.95 },
  canyon: { base: ['sand', 188, 138, 92], wall: ['wallRock', 182, 122, 80], wallTop: ['wallRock', 182, 122, 80], rock: true, barrier: ['sandbag'], marks: 'dirt',
    rut: 'rgba(104,70,42,0.34)', patch: ['rgba(120,82,48,0.13)', 'rgba(232,200,150,0.10)'],
    sky: [0x3d7fc4, 0xf0d2a4, 0xb48a5c], sun: [0xffe2b8, 1.7, 1.1, 0.66], hemi: [0xcfe0ff, 0x8a6844, 0.32], fog: [170, 560], tint: [0.86, 0.86, 0.86], apron: [0.8, 0.78, 0.76], exposure: 0.92 },
  frostbite: { base: ['snow'], wall: ['wallRock', 128, 138, 152], wallTop: ['snow'], rock: true, barrier: ['sandbag', 150, 156, 164], marks: 'dirt',
    rut: 'rgba(120,140,178,0.5)', patch: ['rgba(140,162,200,0.2)', 'rgba(255,255,255,0.2)'],
    sky: [0x8fa6bf, 0xd6e0ea, 0xcfd8e2], sun: [0xfff1e0, 1.45, 0.5, 0.46], hemi: [0xc4d6f4, 0x7388a8, 0.36], fog: [150, 560], tint: [0.74, 0.76, 0.8], apron: [0.86, 0.87, 0.9], exposure: 0.9 },
  foundry: { base: ['asphalt'], wall: ['wallCorrugated', 70, 118, 128], wallTop: ['concrete'], wallH: 2.6, wallMetal: 0.35, barrier: ['barrierHazard'], marks: 'yard', props: true,
    sky: [0x10141c, 0x4a2c20, 0x1a1614], sun: [0xe6ecff, 1.25, 0.6, 0.95], hemi: [0x9aa8c0, 0x4a3024, 0.42], fog: [110, 480], tint: [1.25, 1.22, 1.18], apron: [0.6, 0.6, 0.6], lava: 2.6, exposure: 1.0 },
  skybridge: { base: ['concrete'], wall: ['wallConcrete', 'hazard'], wallTop: ['concrete'], wallH: 2.4, barrier: ['barrierHazard'], marks: 'yard', void: true, below: 'clouds', slab: ['wallConcrete'],
    sky: [0x27407a, 0xf6b48a, 0x8a6f86], sun: [0xffc79a, 1.7, -0.6, 0.4], hemi: [0xb4c6f0, 0x5a4a5c, 0.36], fog: [170, 560], tint: [0.86, 0.84, 0.82], exposure: 0.95 },
  depot: { base: ['asphalt'], wall: ['wallCorrugated', 96, 84, 70], wallTop: ['concrete'], wallH: 2.6, wallMetal: 0.3, barrier: ['barrierHazard'], marks: 'yard', props: true,
    sky: [0x6a7f96, 0xe8c9a0, 0x7a6a58], sun: [0xffe6c0, 1.55, -0.8, 0.6], hemi: [0xd6e0f0, 0x5a4c3e, 0.38], fog: [150, 540], tint: [1.05, 1.02, 0.98], apron: [0.66, 0.64, 0.6], exposure: 0.95 },
  bog: { base: ['grass'], wall: ['wallConcrete', '', 1], wallTop: ['concrete'], wallH: 2.4, barrier: ['sandbag', 118, 116, 84], marks: 'dirt',
    rut: 'rgba(52,40,26,0.45)', patch: ['rgba(40,34,22,0.2)', 'rgba(130,140,70,0.10)'],
    sky: [0x76909a, 0xc6d2c8, 0x55603f], sun: [0xfff2d2, 1.3, 0.9, 0.7], hemi: [0xcfe0d6, 0x3f4a30, 0.4], fog: [90, 460], tint: [0.9, 0.9, 0.9], apron: [0.82, 0.84, 0.8], exposure: 0.95 },
};
// the newer arenas borrow the sky and light of an older one
const THEME_OF = { cage: 'depot', saltflat: 'canyon', causeway: 'proving', labyrinth: 'proving', fogbank: 'bog', ringroad: 'foundry' };
// Every arena is built of toy bricks on a studded baseplate. Per map: the baseplate, the walls, the low barriers,
// and the plates that stand for mud. Plain plastic colours; the theme keeps its sky, sun and haze.
const BRICKS = {
  proving:   { plate: 0xa0a5a9, wall: 0x6c6e68, accent: 0xf2cd37, lay: 'band',    low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0xf2f3f2, lamp: 0xffe9a8, around: ['lamp', 'tree'] },
  sumo:      { plate: 0x6074a1, wall: 0x0a3463, accent: 0xf2f3f2, lay: 'band',    low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0xf2f3f2, lamp: 0xffe9a8, around: [] },
  canyon:    { plate: 0xe4cd9e, wall: 0xaa7d55, accent: 0xd09168, lay: 'speckle', low: 0x958a73, low2: 0xe4cd9e, mud: 0x7a4a2a, print: 0x7a4a2a, lamp: 0xffc48a, around: ['cactus', 'rock'] },
  frostbite: { plate: 0xf2f3f2, wall: 0x6074a1, accent: 0xffffff, lay: 'band',    low: 0x36aebf, low2: 0xf2f3f2, mud: 0x6b4226, print: 0x0a3463, lamp: 0xbfe8ff, around: ['pine'] },
  foundry:   { plate: 0x55595e, wall: 0x1b2a34, accent: 0xfe8a18, lay: 'band',    low: 0xfe8a18, low2: 0x1b2a34, mud: 0x3a2a20, print: 0xf2cd37, lamp: 0xff8a3c, around: ['stack', 'lamp'] },
  skybridge: { plate: 0xa0a5a9, wall: 0x36aebf, accent: 0xf2f3f2, lay: 'band',    low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0xf2f3f2, lamp: 0xffe9a8, around: [] },
  bog:       { plate: 0x4b9f4a, wall: 0x958a73, accent: 0x237841, lay: 'speckle', low: 0x6b4226, low2: 0x958a73, mud: 0x6b4226, print: 0xe4cd9e, lamp: 0xffe9a8, around: ['bush', 'tree'] },
  depot:     { plate: 0x958a73, wall: 0xc91a09, accent: 0xf2f3f2, lay: 'band',    low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0xf2f3f2, lamp: 0xffe9a8, around: ['lamp', 'pile'] },
  cage:      { plate: 0x6c6e68, wall: 0xf2cd37, accent: 0x1b2a34, lay: 'checker', low: 0x1b2a34, low2: 0xf2cd37, mud: 0x6b4226, print: 0xf2cd37, lamp: 0xffe9a8, around: ['lamp', 'pile'] },
  saltflat:  { plate: 0xece6d4, wall: 0xaa7d55, accent: 0xe4cd9e, lay: 'stripe',  low: 0xc91a09, low2: 0xf2f3f2, mud: 0x8a6a48, print: 0xc91a09, lamp: 0xffc48a, around: ['cactus', 'rock'] },
  causeway:  { plate: 0xa0a5a9, wall: 0x0055bf, accent: 0xf2f3f2, lay: 'band',    low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0xf2f3f2, lamp: 0xffe9a8, around: ['lamp', 'tree'] },
  labyrinth: { plate: 0xe4cd9e, wall: 0x237841, accent: 0x4b9f4a, lay: 'speckle', low: 0xf2cd37, low2: 0x1b2a34, mud: 0x6b4226, print: 0x958a73, lamp: 0xffe9a8, around: ['bush', 'tree'] },
  fogbank:   { plate: 0x3f8f45, wall: 0x6c6e68, accent: 0xa0a5a9, lay: 'speckle', low: 0x958a73, low2: 0x6c6e68, mud: 0x6b4226, print: 0xe4cd9e, lamp: 0xd8f0ff, around: ['pine', 'bush'] },
  ringroad:  { plate: 0x55595e, wall: 0xc91a09, accent: 0xf2f3f2, lay: 'checker', low: 0xf2f3f2, low2: 0xc91a09, mud: 0x3a2a20, print: 0xf2f3f2, lamp: 0xffe9a8, around: ['tyres', 'lamp'] },
};
const rgb = (h, k = 1) => [((h >> 16) & 255) * k, ((h >> 8) & 255) * k, (h & 255) * k];
/** Size of the kit the arenas are built from: a stud every 0.4 m (the cars' own), a course of bricks 0.4 m high. */
export const STUD = 0.4, COURSE = 0.4;
export const themeOf = (map) => {
  const base = THEMES[map.id] || THEMES[THEME_OF[map.id]] || THEMES.proving, b = BRICKS[map.id] || BRICKS.proving;
  return { ...base, bricks: b, rock: false, wallH: 6 * COURSE, wallMetal: 0, marks: 'yard', props: false,
    wall: ['brick', ...rgb(b.wall), ...rgb(b.accent), b.lay], wallTop: ['plain', ...rgb(b.wall)],
    barrier: ['brick', ...rgb(b.low), ...rgb(b.low2), 'checker'], slab: ['brick', ...rgb(b.plate, 0.72), ...rgb(b.plate, 0.6), 'stripe'] };
};

// ── per-map control map: R mud, G ice, B lava light, A contact shadow ────
function blur(a, w, h, r, passes) {
  const t = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[o + x] = s / (2 * r + 1); s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  }
  return a;
}
function controlMap(IY, map) {
  const C = IY.TILE_CODE, S = 8, w = map.w * S, h = map.h * S, n = w * h;
  const mud = new Float32Array(n), ice = new Float32Array(n), lava = new Float32Array(n), solid = new Float32Array(n), pit = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = map.tiles[((y / S) | 0) * map.w + ((x / S) | 0)], i = y * w + x;
    if (c === C.mud) mud[i] = 1; else if (c === C.ice) ice[i] = 1; else if (c === C.lava) lava[i] = 1; else if (c === C.wall) solid[i] = 1; else if (c === C.barrier) solid[i] = 0.7; else if (c === C.pit) pit[i] = 1;
  }
  blur(mud, w, h, 2, 2); blur(ice, w, h, 2, 1); blur(lava, w, h, 5, 3); blur(solid, w, h, 3, 2); blur(pit, w, h, 2, 2);
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    d[i * 4] = mud[i] * 255; d[i * 4 + 1] = ice[i] * 255; d[i * 4 + 2] = Math.min(1, lava[i] * 1.7) * 255;
    d[i * 4 + 3] = (1 - 0.62 * Math.min(1, solid[i] * 1.7)) * (1 - 0.3 * Math.min(1, pit[i] * 1.6)) * 255;
  }
  return dataTex(w, h, d, { repeat: false, mip: false });
}

// ── per-map decal sheet: paint, joints, stains, tyre marks, tracks ───────
function paintDecals(IY, map, th) {
  const C = IY.TILE_CODE, T = IY.TILE, W = map.width, H = map.height, cw = pot(W * 14), ch = pot(H * 14);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.setTransform(cw / W, 0, 0, -ch / H, 0, ch); // draw in metres, y north
  const R = rng32(hashStr(map.id || 'map') + 7), rr = (a, b) => a + (b - a) * R(), TAU = Math.PI * 2;
  const code = (tx, ty) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? -1 : map.tiles[ty * map.w + tx]);
  const at = (x, y) => code(Math.floor(x / T), Math.floor(y / T));
  const open = (c) => c === C.floor || c === C.pad || c === C.mud || c === C.ice || c === C.smoke || c === C.turbo;
  const built = th.marks !== 'dirt', area = W * H;
  const label = (text, color, size = 90) => { g.save(); g.scale(0.01, -0.01); g.font = `900 ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 0, 0); g.restore(); };
  g.lineCap = 'round'; g.lineJoin = 'round';

  if (th.bricks) {
    // a baseplate is clean plastic, printed like the board of a game: each team's end in its colour, a halfway line,
    // and a kerb line along the foot of everything that stands on it. The studs are drawn by the ground shader.
    const pr = th.bricks.print, line = `rgba(${(pr >> 16) & 255},${(pr >> 8) & 255},${pr & 255},0.82)`;
    (map.spawns || []).forEach((slots, team) => {
      const ys = slots.map((q) => q.y), xs = slots.map((q) => q.x);
      const ty0 = Math.floor((Math.min(...ys) - 3.5) / T), ty1 = Math.floor((Math.max(...ys) + 3.5) / T), tx0 = Math.floor((Math.min(...xs) - 6) / T), tx1 = Math.floor((Math.max(...xs) + 6) / T);
      g.fillStyle = team ? 'rgba(40,140,236,0.24)' : 'rgba(244,123,32,0.24)';
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (code(tx, ty) === C.floor) g.fillRect(tx * T, ty * T, T, T);
      // the edge of the end, towards the middle: a row of chevrons pointing at the other side
      const edge = team ? (ty1 + 1) * T : ty0 * T, dir = team ? 1 : -1;
      g.strokeStyle = team ? 'rgba(40,140,236,0.8)' : 'rgba(244,123,32,0.8)'; g.lineWidth = 0.14; g.lineCap = 'butt'; g.lineJoin = 'miter';
      for (let tx = tx0; tx <= tx1; tx++) {
        if (code(tx, team ? ty1 : ty0) !== C.floor) continue;
        const cx = (tx + 0.5) * T; g.beginPath(); g.moveTo(cx - 0.55, edge - dir * 0.5); g.lineTo(cx, edge - dir * 0.05); g.lineTo(cx + 0.55, edge - dir * 0.5); g.stroke();
      }
    });
    g.fillStyle = line;
    for (let tx = 0; tx < map.w; tx++) if (code(tx, map.h / 2 - 1) === C.floor && code(tx, map.h / 2) === C.floor) g.fillRect(tx * T + 0.35, H / 2 - 0.07, T - 0.7, 0.14);
    g.strokeStyle = line; g.lineWidth = 0.12; g.lineCap = 'butt';
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!open(code(tx, ty))) continue;
      for (const [dx, dy, ax, ay, bx, by] of SIDES) {
        const c2 = code(tx + dx, ty + dy);
        if (c2 !== C.wall && c2 !== C.barrier) continue;
        g.beginPath(); g.moveTo((tx + ax) * T - dx * 0.34, (ty + ay) * T - dy * 0.34); g.lineTo((tx + bx) * T - dx * 0.34, (ty + by) * T - dy * 0.34); g.stroke();
      }
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
  } else if (built) {
    // slabs: a patchwork of pours with expansion joints (deck plates on steel)
    const step = th.marks === 'deck' ? 2 : 4;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const r = R(); if (r < 0.3) { g.fillStyle = `rgba(0,0,0,${rr(0.03, 0.09)})`; g.fillRect(x, y, step, step); } else if (r > 0.88) { g.fillStyle = `rgba(255,255,255,${rr(0.015, 0.035)})`; g.fillRect(x, y, step, step); } }
    g.strokeStyle = 'rgba(14,14,16,0.5)'; g.lineWidth = 0.05; g.beginPath();
    for (let x = step; x < W; x += step) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = step; y < H; y += step) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    if (th.marks === 'deck') { // weld highlight and bolts along every seam
      g.strokeStyle = 'rgba(210,220,230,0.14)'; g.lineWidth = 0.03; g.beginPath();
      for (let x = step; x < W; x += step) { g.moveTo(x + 0.05, 0); g.lineTo(x + 0.05, H); }
      for (let y = step; y < H; y += step) { g.moveTo(0, y + 0.05); g.lineTo(W, y + 0.05); }
      g.stroke();
      g.fillStyle = 'rgba(20,22,26,0.7)';
      for (let y = step; y < H; y += step) for (let x = 0.5; x < W; x += 1) { g.fillRect(x - 0.04, y - 0.16, 0.08, 0.08); g.fillRect(y - 0.16, x - 0.04, 0.08, 0.08); }
      g.strokeStyle = 'rgba(214,220,228,0.16)'; g.lineWidth = 0.025; // scuffs
      for (let i = 0; i < area / 9; i++) { const x = rr(0, W), y = rr(0, H), a = rr(0, TAU), l = rr(0.3, 1.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    } else {
      g.strokeStyle = 'rgba(12,12,12,0.5)'; g.lineWidth = 0.03; // cracks
      for (let i = 0; i < area / 70; i++) {
        let x = rr(0, W), y = rr(0, H), a = rr(0, TAU); g.beginPath(); g.moveTo(x, y);
        for (let k = 0, n = 5 + R() * 10; k < n; k++) { a += rr(-0.7, 0.7); const l = rr(0.25, 0.9); x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); if (R() < 0.12) { g.lineTo(x + Math.cos(a + 1.2) * 0.6, y + Math.sin(a + 1.2) * 0.6); g.moveTo(x, y); } }
        g.stroke();
      }
    }
    for (let i = 0; i < area / 45; i++) { // oil and coolant stains
      const x = rr(0, W), y = rr(0, H), r = rr(0.4, 1.9), gr = g.createRadialGradient(x, y, 0, x, y, r), a = rr(0.18, 0.42);
      gr.addColorStop(0, `rgba(10,10,12,${a})`); gr.addColorStop(0.6, `rgba(10,10,12,${a * 0.55})`); gr.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * rr(0.6, 1), rr(0, 3), 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(8,8,8,0.24)'; g.lineWidth = 0.2; // tyre marks: twin arcs
    for (let i = 0; i < area / 150; i++) { const x = rr(0, W), y = rr(0, H), r = rr(3, 10), a0 = rr(0, TAU), a1 = a0 + rr(0.4, 1.5); g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); g.beginPath(); g.arc(x, y, r + 1.25, a0, a1); g.stroke(); }
  } else {
    for (let i = 0; i < area / 30; i++) { // soft large patches: damp, bleached, drifted
      const x = rr(0, W), y = rr(0, H), r = rr(1.5, 6), gr = g.createRadialGradient(x, y, 0, x, y, r), col = th.patch[R() < 0.6 ? 0 : 1];
      gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/,[\d.]+\)$/, ',0)'));
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * rr(0.5, 1), rr(0, 3), 0, TAU); g.fill();
    }
    g.strokeStyle = th.rut; g.lineWidth = 0.3; // vehicle tracks: wandering twin ruts
    for (let i = 0; i < Math.max(4, area / 500); i++) {
      let x = rr(0, W), y = rr(0, H), a = rr(0, TAU); const L = [], Rr = [];
      for (let k = 0, n = 50 + R() * 70; k < n; k++) { a += rr(-0.16, 0.16); x += Math.cos(a) * 1.1; y += Math.sin(a) * 1.1; L.push([x - Math.sin(a) * 0.7, y + Math.cos(a) * 0.7]); Rr.push([x + Math.sin(a) * 0.7, y - Math.cos(a) * 0.7]); }
      for (const pts of [L, Rr]) { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
    }
    g.fillStyle = 'rgba(70,66,62,0.75)'; // loose stones
    for (let i = 0; i < area / 5; i++) { const x = rr(0, W), y = rr(0, H), r = rr(0.04, 0.13); g.beginPath(); g.ellipse(x, y, r, r * rr(0.6, 1), rr(0, 3), 0, TAU); g.fill(); }
  }

  // edges of holes and lava: hazard paint on built ground, crumbling dark soil elsewhere
  const strip = (x0, y0, x1, y1) => {
    if (built) {
      g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
      g.fillStyle = 'rgba(232,186,40,0.92)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(24,24,26,0.95)'; g.lineWidth = 0.17; g.lineCap = 'butt'; g.beginPath();
      for (let c = Math.floor((x0 - y1) / 0.5) * 0.5; c <= x1 - y0 + 0.5; c += 0.5) { g.moveTo(x0 - 0.3, x0 - 0.3 - c); g.lineTo(x1 + 0.3, x1 + 0.3 - c); }
      g.stroke(); g.restore(); g.lineCap = 'round';
    } else { g.fillStyle = 'rgba(30,24,18,0.42)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  };
  const SW = built ? 0.34 : 0.5;
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (!open(code(tx, ty))) continue;
    const x0 = tx * T, y0 = ty * T, x1 = x0 + T, y1 = y0 + T, edge = (c) => c === C.pit || c === C.lava;
    if (edge(code(tx - 1, ty))) strip(x0, y0, x0 + SW, y1);
    if (edge(code(tx + 1, ty))) strip(x1 - SW, y0, x1, y1);
    if (edge(code(tx, ty - 1))) strip(x0, y0, x1, y0 + SW);
    if (edge(code(tx, ty + 1))) strip(x0, y1 - SW, x1, y1);
  }

  // speed strips: a dark lane with bright chevrons pointing along it
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (code(tx, ty) !== C.turbo) continue;
    const along = code(tx - 1, ty) === C.turbo || code(tx + 1, ty) === C.turbo;   // lies east-west, else north-south
    g.save(); g.translate((tx + 0.5) * T, (ty + 0.5) * T); if (!along) g.rotate(Math.PI / 2);
    g.fillStyle = 'rgba(18,20,24,0.78)'; g.fillRect(-T / 2, -T * 0.42, T, T * 0.84);
    g.strokeStyle = 'rgba(255,214,64,0.95)'; g.lineWidth = 0.16; g.lineCap = 'butt'; g.lineJoin = 'miter';
    for (const o of [-0.5, 0.5]) { g.beginPath(); g.moveTo(o - 0.28, -0.55); g.lineTo(o + 0.28, 0); g.lineTo(o - 0.28, 0.55); g.stroke(); }
    g.fillStyle = 'rgba(255,214,64,0.6)'; g.fillRect(-T / 2, -T * 0.42, T, 0.07); g.fillRect(-T / 2, T * 0.42 - 0.07, T, 0.07);
    g.restore(); g.lineCap = 'round'; g.lineJoin = 'round';
  }
  // repair pads: a steel plate with a green border and a white cross
  for (const p of map.pads) {
    const x0 = p.tx * T, y0 = p.ty * T;
    g.fillStyle = 'rgba(46,52,58,0.94)'; g.fillRect(x0 + 0.08, y0 + 0.08, T - 0.16, T - 0.16);
    g.strokeStyle = 'rgba(64,214,128,0.95)'; g.lineWidth = 0.1; g.strokeRect(x0 + 0.2, y0 + 0.2, T - 0.4, T - 0.4);
    g.fillStyle = 'rgba(236,240,238,0.92)'; g.fillRect(p.x - 0.16, p.y - 0.55, 0.32, 1.1); g.fillRect(p.x - 0.55, p.y - 0.16, 1.1, 0.32);
  }
  // item points: a stencilled ring with four ticks
  const ink = th.bricks ? `rgba(${(th.bricks.print >> 16) & 255},${(th.bricks.print >> 8) & 255},${th.bricks.print & 255},0.8)` : th.base[0] === 'snow' ? 'rgba(40,70,120,0.6)' : 'rgba(240,240,236,0.62)';
  for (const s of map.itemSpawns) {
    g.strokeStyle = ink; g.lineWidth = 0.09; g.beginPath(); g.arc(s.x, s.y, 0.95, 0, TAU); g.stroke();
    g.beginPath(); for (let k = 0; k < 4; k++) { const a = k * (TAU / 4) + TAU / 8; g.moveTo(s.x + Math.cos(a) * 1.1, s.y + Math.sin(a) * 1.1); g.lineTo(s.x + Math.cos(a) * 1.5, s.y + Math.sin(a) * 1.5); } g.stroke();
  }
  // centre circle where there is room for one
  if (at(map.center.x, map.center.y) === C.floor && at(map.center.x + 3.6, map.center.y) === C.floor && at(map.center.x, map.center.y + 3.6) === C.floor) {
    g.strokeStyle = ink; g.lineWidth = 0.12; g.beginPath(); g.arc(map.center.x, map.center.y, 3.4, 0, TAU); g.stroke();
    g.fillStyle = ink; g.beginPath(); g.arc(map.center.x, map.center.y, 0.18, 0, TAU); g.fill();
  }
  // start bays in team colours, with a stencilled slot name behind each
  const TEAM = ['rgba(244,123,32,0.85)', 'rgba(40,140,236,0.85)'];
  (map.spawns || []).forEach((slots, team) => slots.forEach((s, k) => {
    g.save(); g.translate(s.x, s.y); g.rotate(s.heading);
    g.strokeStyle = TEAM[team]; g.lineWidth = 0.12; g.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.moveTo(sx * 2.4, sy * 0.9); g.lineTo(sx * 2.4, sy * 1.8); g.lineTo(sx * 1.5, sy * 1.8); }
    g.moveTo(2.9, 0.5); g.lineTo(3.4, 0); g.lineTo(2.9, -0.5);
    g.stroke();
    g.translate(-3.3, 0); g.rotate(-Math.PI / 2); label('AB'[team] + (k + 1), TEAM[team]);
    g.restore();
  }));

  const tex = new THREE.CanvasTexture(cv);
  tex.premultiplyAlpha = true; tex.anisotropy = 8;
  return tex;
}

// ── materials ───────────────────────────────────────────────────────────
const G_HEAD = `
uniform sampler2D tCtl; uniform sampler2D tDecal; uniform sampler2D tBaseA; uniform sampler2D tBaseN;
uniform sampler2D tMudA; uniform sampler2D tMudN; uniform sampler2D tIceN; uniform sampler2D tNoise;
uniform vec2 uMapSize; uniform vec3 uScale; uniform float uTime; uniform float uBaseMetal;
uniform vec3 uLavaCol; uniform vec3 uIceDeep; uniform vec3 uIceFrost; uniform vec3 uTint; uniform vec3 uApron; uniform vec3 uPlate; uniform vec3 uPlateMud;
varying vec3 vGWorld;
vec3 gLin(vec3 c) { return pow(c, vec3(2.2)); }
`;
const G_MAP = `
vec2 gp = vec2(vGWorld.x, -vGWorld.z);
vec2 guv = gp / uMapSize;
float gin = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
vec4 nzA = texture2D(tNoise, gp * 0.021);
vec4 nzB = texture2D(tNoise, gp * 0.13 + vec2(0.37, 0.11));
vec4 ctl = texture2D(tCtl, (gp + (nzB.rg - 0.5) * 0.9) / uMapSize);
vec4 ctl0 = texture2D(tCtl, guv);
float mud = smoothstep(0.36, 0.64, ctl.r + (nzB.b - 0.5) * 0.3) * gin;
float ice = smoothstep(0.42, 0.58, ctl.g + (nzB.a - 0.5) * 0.16) * gin;
// base ground: two differently placed copies of the texture, swapped by a slow mask, so the tiling never lines up
vec2 buv = gp * uScale.x;
vec2 buv2 = buv * 0.77 + vec2(0.37, 0.61);
float bmix = smoothstep(0.3, 0.7, nzB.a);
vec4 bA = mix(texture2D(tBaseA, buv), texture2D(tBaseA, buv2), bmix);
vec4 bN = mix(texture2D(tBaseN, buv), texture2D(tBaseN, buv2), bmix);
vec4 nzC = texture2D(tNoise, gp * 0.0057 + vec2(0.11, 0.53));
vec3 alb = gLin(bA.rgb) * (0.78 + 0.3 * nzA.r + 0.26 * nzC.g) * mix(uApron, uTint, gin);
float rgh = bA.a;
vec2 nxy = bN.xy * 2.0 - 1.0;
float metal = uBaseMetal;
// mud: dark and lumpy, with standing water in the hollows
vec2 muv = gp * uScale.y;
vec4 mA = texture2D(tMudA, muv);
vec4 mN = texture2D(tMudN, muv);
float puddle = smoothstep(0.50, 0.60, nzB.r * 0.55 + nzA.g * 0.55) * mud;
alb = mix(alb, gLin(mA.rgb), mud); rgh = mix(rgh, mA.a, mud); nxy = mix(nxy, mN.xy * 2.0 - 1.0, mud);
alb = mix(alb, alb * 0.5, puddle); rgh = mix(rgh, 0.2, puddle); nxy *= (1.0 - puddle);
// ice: clear dark patches, frosted patches, white cracks
vec4 iN = texture2D(tIceN, gp * uScale.z);
vec3 iceC = mix(uIceDeep, uIceFrost, smoothstep(0.35, 0.75, nzA.b * 0.5 + nzB.g * 0.5));
iceC = mix(iceC, vec3(0.86, 0.93, 0.97), iN.a * 0.75);
alb = mix(alb, iceC, ice); rgh = mix(rgh, mix(0.1, 0.38, iN.a), ice); nxy = mix(nxy, (iN.xy * 2.0 - 1.0) * 0.6, ice);
metal *= (1.0 - mud) * (1.0 - ice);
// built of bricks: a baseplate of flat plastic with a stud every 0.4 m, laid as plates one map tile across with a hairline
// between them. Mud is a patch of brown plates; ice is smooth clear tile with no studs on it, which is why it is slippery
vec2 sc = fract(gp / 0.4) - 0.5;
float sr = length(sc);
vec2 sdir = sc / max(sr, 0.0001);
vec2 tl = fract(gp / 2.0);
float seam = 1.0 - smoothstep(0.0, 0.016, min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
vec2 blk = floor(gp / 4.0);
float tone = mix(0.9, 1.0, mod(blk.x + blk.y, 2.0));
vec3 plastic = mix(uPlate * 0.8, uPlate, gin) * tone;
plastic = mix(plastic, uPlateMud * tone, mud);
plastic = mix(plastic, iceC, ice);
// far away a stud is smaller than a pixel: let the pattern fade into the plate's own colour instead of shimmering
float studded = (1.0 - ice) * (1.0 - smoothstep(0.22, 0.55, max(fwidth(gp.x), fwidth(gp.y)) / 0.4));
float sTop = (1.0 - smoothstep(0.26, 0.31, sr)) * studded;
float sRing = smoothstep(0.19, 0.29, sr) * (1.0 - smoothstep(0.29, 0.37, sr)) * studded;
alb = plastic * (1.0 + 0.06 * sTop + 0.34 * sRing * dot(sdir, vec2(-0.6, 0.8))) * (1.0 - 0.3 * seam * studded);
rgh = mix(mix(0.42, 0.55, mud), 0.12, ice);
nxy = mix(sdir * sRing * 0.7, nxy * 0.5, ice);
metal = 0.0;
// printed markings
vec4 dc = texture2D(tDecal, guv) * gin;
float wear = 1.0;
float da = dc.a * wear * (1.0 - 0.75 * ice) * (1.0 - 0.85 * mud);
alb = mix(alb, gLin(dc.rgb / max(dc.a, 0.004)), da);
metal *= (1.0 - da);
// contact shadow at the foot of walls and lips of holes; light spilling from lava
alb *= mix(1.0, ctl0.a, gin);
float glow = ctl0.b * gin;
vec3 gEmis = uLavaCol * glow * glow * (0.8 + 0.2 * sin(uTime * 1.9 + gp.x * 0.35 + gp.y * 0.27));
diffuseColor.rgb = alb;
float gRough = clamp(rgh, 0.04, 1.0);
vec3 gNrm = normalize(vec3(nxy.x, sqrt(max(0.0, 1.0 - dot(nxy, nxy))), -nxy.y));
`;
function groundMaterial(IY, map, th, env, U) {
  const base = detail(...th.base), mud = detail('mud'), ice = detail('ice');
  Object.assign(U, {
    tCtl: { value: controlMap(IY, map) }, tDecal: { value: paintDecals(IY, map, th) }, tBaseA: { value: base.a }, tBaseN: { value: base.n },
    tMudA: { value: mud.a }, tMudN: { value: mud.n }, tIceN: { value: ice.n }, tNoise: { value: detail('noise') },
    uMapSize: { value: new THREE.Vector2(map.width, map.height) }, uScale: { value: new THREE.Vector3(1 / 4, 1 / 3, 1 / 5) }, uTime: { value: 0 }, uBaseMetal: { value: th.metal || 0 },
    uPlate: { value: lin(th.bricks.plate) }, uPlateMud: { value: lin(th.bricks.mud) }, uLavaCol: { value: new THREE.Color(1, 0.3, 0.05).multiplyScalar(th.lava || 2) }, uIceDeep: { value: lin(0x4f86ac) }, uIceFrost: { value: lin(0xb4d2e4) }, uTint: { value: new THREE.Vector3(...th.tint) }, uApron: { value: new THREE.Vector3(...(th.apron || th.tint)) },
  });
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMap: env, envMapIntensity: 0.34 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vGWorld;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = G_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', G_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metal;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gNrm, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += gEmis;');
  };
  return m;
}
function lavaMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: detail('noise') }, uTime: U.uTime },
    vertexShader: 'attribute float edge; varying vec2 vW; varying float vEdge;\nvoid main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = vec2(wp.x, -wp.z); vEdge = edge; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform sampler2D tNoise; uniform float uTime; varying vec2 vW; varying float vEdge;
void main() {
  vec2 p = vW * 0.06, flow = vec2(uTime * 0.010, uTime * 0.006);
  vec4 a = texture2D(tNoise, p + flow);
  vec4 b = texture2D(tNoise, p * 2.7 - flow * 1.7 + a.rg * 0.12);
  vec4 c = texture2D(tNoise, p * 7.0 + flow * 2.3 + b.gb * 0.08);
  float heat = (a.r * 0.5 + b.g * 0.35 + c.b * 0.25) * (0.5 + 0.5 * vEdge);
  float crust = smoothstep(0.46, 0.60, b.a * 0.6 + c.r * 0.5);            // cooled plates drifting on top
  float veins = 1.0 - smoothstep(0.0, 0.07, abs(b.r - 0.5));              // bright seams between them
  float h = clamp(heat * 1.12 - crust * 0.62 + veins * 0.34, 0.0, 1.0);
  vec3 col = mix(vec3(0.035, 0.012, 0.008), vec3(0.50, 0.035, 0.0), smoothstep(0.15, 0.42, h));
  col = mix(col, vec3(1.0, 0.30, 0.02), smoothstep(0.40, 0.66, h));
  col = mix(col, vec3(1.0, 0.80, 0.30), smoothstep(0.70, 0.95, h));
  gl_FragColor = vec4(col * 1.25, 1.0);
  #include <encodings_fragment>
}`,
    toneMapped: false, fog: false,
  });
}

// ── geometry ────────────────────────────────────────────────────────────
class Mesher {
  constructor() { this.p = []; this.u = []; this.c = []; }
  get empty() { return !this.p.length; }
  v(p, uv, c) { this.p.push(p[0], p[1], p[2]); this.u.push(uv[0], uv[1]); this.c.push(c, c, c); }
  quad(a, b, c, d, ua, ub, uc, ud, ca, cb = ca, cc = ca, cd = ca) { this.v(a, ua, ca); this.v(b, ub, cb); this.v(c, uc, cc); this.v(a, ua, ca); this.v(c, uc, cc); this.v(d, ud, cd); }
  /** Vertical face over the ground segment A→B (world metres), from height h0 up to h1; shade s0 at the foot, s1 at the top. */
  face(A, B, h0, h1, ua, ub, s0, s1, vo = 0, P = 4) { this.quad([A[0], h0, -A[1]], [B[0], h0, -B[1]], [B[0], h1, -B[1]], [A[0], h1, -A[1]], [ua / P, (h0 + vo) / P], [ub / P, (h0 + vo) / P], [ub / P, (h1 + vo) / P], [ua / P, (h1 + vo) / P], s0, s0, s1, s1); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}
const SIDES = [[-1, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0], [0, -1, 1, 0, 0, 0], [0, 1, 0, 1, 1, 1]]; // dx, dy, then the edge's two corners (ax, ay, bx, by) in tile units

/**
 * Build the scenery for one map. Returns { group, theme, update(t, camera), dispose() }.
 * `env` is the PMREM environment used for reflections.
 */
export function buildArena(IY, map, env) {
  const th = themeOf(map), C = IY.TILE_CODE, T = IY.TILE, W = map.width, H = map.height;
  const group = new THREE.Group(), U = {}, owned = [];
  const code = (tx, ty) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? -1 : map.tiles[ty * map.w + tx]);
  const add = (geo, mat, { cast = false, receive = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); owned.push(geo, mat); return m; };
  const std = (d, o = {}) => new THREE.MeshStandardMaterial({ map: d.a, normalMap: d.n, roughness: 0.9, metalness: 0, envMap: env, envMapIntensity: 0.3, vertexColors: true, side: THREE.DoubleSide, ...o });

  // ground: every tile that is not a hole or lava, merged into strips, plus an apron beyond the walls
  {
    const pos = [], idx = [];
    const quad = (x0, y0, x1, y1) => { const b = pos.length / 3; pos.push(x0, 0, -y0, x1, 0, -y0, x1, 0, -y1, x0, 0, -y1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      const c = code(tx, ty); if (c === C.pit || c === C.lava) continue;
      let e = tx; while (e + 1 < map.w && code(e + 1, ty) !== C.pit && code(e + 1, ty) !== C.lava) e++;
      quad(tx * T, ty * T, (e + 1) * T, (ty + 1) * T); tx = e;
    }
    if (!th.void) { const A = 700; quad(-A, -A, W + A, 0); quad(-A, H, W + A, H + A); quad(-A, 0, 0, H); quad(W, 0, W + A, H); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    add(g, groundMaterial(IY, map, th, env, U));
    owned.push(U.tCtl.value, U.tDecal.value);
  }

  // lava: a molten surface just below floor level, hottest away from its banks
  {
    const pos = [], edge = [], idx = [], rim = new Mesher(), Y = -0.05;
    const inner = (cx, cy) => (code(cx, cy) === C.lava && code(cx - 1, cy) === C.lava && code(cx, cy - 1) === C.lava && code(cx - 1, cy - 1) === C.lava ? 1 : 0);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (code(tx, ty) !== C.lava) continue;
      const b = pos.length / 3, x0 = tx * T, y0 = ty * T;
      pos.push(x0, Y, -y0, x0 + T, Y, -y0, x0 + T, Y, -y0 - T, x0, Y, -y0 - T); edge.push(inner(tx, ty), inner(tx + 1, ty), inner(tx + 1, ty + 1), inner(tx, ty + 1)); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      for (const [dx, dy, ax, ay, bx, by] of SIDES) if (code(tx + dx, ty + dy) !== C.lava) rim.face([(tx + ax) * T, (ty + ay) * T], [(tx + bx) * T, (ty + by) * T], Y, 0, 0, 1, 1, 0.25);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1)); g.setIndex(idx);
      add(g, lavaMaterial(U), { receive: false });
      add(rim.build(), new THREE.MeshBasicMaterial({ color: lin(0xff6a1a), vertexColors: true, side: THREE.DoubleSide, toneMapped: false }), { receive: false });
    }
  }

  // drops: the sides of holes, and the slab edge of a floating platform
  {
    const cliff = new Mesher(), floor = new Mesher(), D = th.void ? 1.6 : 12;
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      const c = code(tx, ty);
      if (c === C.pit) { if (!th.void) floor.quad([tx * T, -D, -ty * T], [(tx + 1) * T, -D, -ty * T], [(tx + 1) * T, -D, -(ty + 1) * T], [tx * T, -D, -(ty + 1) * T], [0, 0], [1, 0], [1, 1], [0, 1], 1); continue; }
      for (const [dx, dy, ax, ay, bx, by] of SIDES) {
        if (code(tx + dx, ty + dy) !== C.pit) continue;
        const A = [(tx + ax) * T, (ty + ay) * T], B = [(tx + bx) * T, (ty + by) * T], ua = dx ? A[1] : A[0], ub = dx ? B[1] : B[0];
        if (th.void) cliff.face(A, B, -D, 0, ua, ub, 0.42, 0.95, 2.0); // the clean middle of the wall texture
        else { cliff.face(A, B, -3, 0, ua, ub, 0.3, 0.85); cliff.face(A, B, -D, -3, ua, ub, 0.0, 0.3); } // fades to black with depth
      }
    }
    if (!cliff.empty) add(cliff.build(), std(detail(...th.slab), { roughness: 0.5 }), { receive: true });
    if (!floor.empty) add(floor.build(), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }), { receive: false });
    if (th.void) { // legs under the deck, fading into the haze below
      const spots = [];
      for (let ty = 1; ty < map.h - 1; ty += 3) for (let tx = 1; tx < map.w - 1; tx += 3) if (code(tx, ty) !== C.pit && code(tx + 1, ty) !== C.pit && code(tx, ty + 1) !== C.pit && code(tx - 1, ty) !== C.pit && code(tx, ty - 1) !== C.pit) spots.push([tx, ty]);
      if (spots.length) {
        const g = new THREE.BoxGeometry(1.2, 90, 1.2), col = [], top = lin(0x39424d), bot = lin(th.sky[2]), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const k = Math.min(1, (45 - p.getY(i)) / 60), c2 = top.clone().lerp(bot, k); col.push(c2.r, c2.g, c2.b); }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }), spots.length), d = new THREE.Object3D();
        spots.forEach(([tx, ty], i) => { d.position.set((tx + 0.5) * T, -D - 45, -(ty + 0.5) * T); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
        group.add(im); owned.push(g, im.material);
      }
    }
  }

  // under a floating deck: open sea, or a deck of cloud catching the low sun
  let drift = null;
  if (th.below === 'sea') {
    const n = detail('water').n; n.repeat.set(36, 36);
    const m = add(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: lin(0x163a56), roughness: 0.26, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(1.4, 1.4), envMap: env, envMapIntensity: 0.8 }), { receive: false });
    m.position.set(W / 2, -70, -H / 2); drift = (t) => n.offset.set(t * 0.004, t * 0.0026);
  } else if (th.below === 'clouds') {
    const c = detail('cloud'); c.repeat.set(5, 5);
    const m = add(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: c, color: lin(0xffd2bc), transparent: true, depthWrite: false, toneMapped: false }), { receive: false });
    m.position.set(W / 2, -60, -H / 2); drift = (t) => c.offset.set(t * 0.0007, t * 0.0003);
  }

  // walls: only exposed faces, textured in world space so runs of tiles read as one structure
  {
    const side = new Mesher(), top = new Mesher(), rock = !!th.rock;
    const hgt = (cx, cy) => (rock ? 1.9 + 1.1 * hash2(Math.floor(cx / 3), Math.floor(cy / 3), 1) + 0.7 * hash2(cx, cy, 2) : th.wallH);
    const AMP = [0.1, 0.3, 0.22];
    const pt = (cx, cy, lvl) => (rock ? [cx * T + (hash2(cx, cy, 10 + lvl) - 0.5) * 2 * AMP[lvl], cy * T + (hash2(cx, cy, 20 + lvl) - 0.5) * 2 * AMP[lvl]] : [cx * T, cy * T]);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (code(tx, ty) !== C.wall) continue;
      const q = [[tx, ty], [tx + 1, ty], [tx + 1, ty + 1], [tx, ty + 1]].map(([cx, cy]) => { const p = pt(cx, cy, 2), h = hgt(cx, cy); return { p: [p[0], h, -p[1]], uv: [(cx * T) / 4, (cy * T) / 4] }; });
      top.quad(q[0].p, q[1].p, q[2].p, q[3].p, q[0].uv, q[1].uv, q[2].uv, q[3].uv, 1);
      for (const [dx, dy, ax, ay, bx, by] of SIDES) {
        if (code(tx + dx, ty + dy) === C.wall) continue;
        const ca = [tx + ax, ty + ay], cb = [tx + bx, ty + by], ha = hgt(...ca), hb = hgt(...cb), ua = (dx ? ca[1] : ca[0]) * T, ub = (dx ? cb[1] : cb[0]) * T;
        const ring = (lvl, f) => { const a = pt(...ca, lvl), b = pt(...cb, lvl); return [[a[0], ha * f, -a[1]], [b[0], hb * f, -b[1]], [ua / 4, (ha * f) / 4], [ub / 4, (hb * f) / 4]]; };
        const lv = rock ? [ring(0, 0), ring(1, 0.5), ring(2, 1)] : [ring(0, 0), ring(2, 1)], sh = rock ? [0.5, 0.86, 1] : [0.55, 1];
        for (let k = 0; k + 1 < lv.length; k++) side.quad(lv[k][0], lv[k][1], lv[k + 1][1], lv[k + 1][0], lv[k][2], lv[k][3], lv[k + 1][3], lv[k + 1][2], sh[k], sh[k], sh[k + 1], sh[k + 1]);
      }
    }
    if (!side.empty) {
      add(side.build(), std(detail(...th.wall), { roughness: 0.45 }), { cast: true });
      add(top.build(), std(detail(...th.wallTop), { roughness: 0.45 }), { cast: true });
    }
  }

  // barriers: low blocks with battered sides (shots pass over them)
  {
    const side = new Mesher(), top = new Mesher(), HB = 2 * COURSE, IB = 0.04, IT = 0.04;   // two courses of brick
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (code(tx, ty) !== C.barrier) continue;
      const ex = SIDES.map(([dx, dy]) => code(tx + dx, ty + dy) !== C.barrier), x0 = tx * T, x1 = x0 + T, y0 = ty * T, y1 = y0 + T;
      const ring = (i) => [[x0 + (ex[0] ? i : 0), y0 + (ex[2] ? i : 0)], [x1 - (ex[1] ? i : 0), y0 + (ex[2] ? i : 0)], [x1 - (ex[1] ? i : 0), y1 - (ex[3] ? i : 0)], [x0 + (ex[0] ? i : 0), y1 - (ex[3] ? i : 0)]];
      const b = ring(IB), t = ring(IT), P3 = (p, h) => [p[0], h, -p[1]];
      top.quad(P3(t[0], HB), P3(t[1], HB), P3(t[2], HB), P3(t[3], HB), [t[0][0] / 4, t[0][1] / 4], [t[1][0] / 4, t[1][1] / 4], [t[2][0] / 4, t[2][1] / 4], [t[3][0] / 4, t[3][1] / 4], 1);
      [[3, 0, 0], [1, 2, 1], [0, 1, 2], [2, 3, 3]].forEach(([i, j, s]) => { // west, east, south, north
        if (!ex[s]) return;
        const ua = (s < 2 ? b[i][1] : b[i][0]) / 2, ub = (s < 2 ? b[j][1] : b[j][0]) / 2;
        side.quad(P3(b[i], 0), P3(b[j], 0), P3(t[j], HB), P3(t[i], HB), [ua / 2, 0], [ub / 2, 0], [ub / 2, HB / 4], [ua / 2, HB / 4], 0.6, 0.6, 1, 1);
      });
    }
    if (!side.empty) {
      const bag = th.barrier[0] === 'sandbag';
      add(side.build(), std(detail(...th.barrier), { roughness: 0.45 }), { cast: true });
      add(top.build(), std(bag ? detail(...th.barrier) : detail('plain', ...rgb(th.bricks.low)), { roughness: 0.45 }), { cast: true });
    }
  }

  // studs: every brick has them — one every 0.4 m on top of the walls and of the barriers
  {
    const studs = (kind, h, hex) => {
      const at = [];
      for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) if (code(tx, ty) === kind) at.push([tx, ty]);
      if (!at.length) return;
      const per = Math.round(T / STUD), g = new THREE.CylinderGeometry(STUD * 0.3, STUD * 0.3, STUD * 0.21, 10);
      const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.4, envMap: env, envMapIntensity: 0.3 });
      const im = new THREE.InstancedMesh(g, m, at.length * per * per), d = new THREE.Object3D();
      let k = 0;
      for (const [tx, ty] of at) for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
        d.position.set(tx * T + (i + 0.5) * STUD, h + STUD * 0.105, -(ty * T + (j + 0.5) * STUD)); d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
      }
      im.receiveShadow = true; im.frustumCulled = false; group.add(im); owned.push(g, m);
    };
    studs(C.wall, th.wallH, th.bricks.lay === 'band' ? th.bricks.accent : th.bricks.wall);
    studs(C.barrier, 2 * COURSE, th.bricks.low);
  }

  // Posts: the corners, ends and free-standing pillars of a wall carry a 2x2 post two courses high under a pyramid cap
  // with a lamp on it, and every fourth tile of a straight run a low one. They are what turns a row of bricks into a wall
  // somebody built. Around the arena, on the baseplate beyond the walls where no car can go, stand a few things made of
  // the same bricks — trees, cacti, lamps, chimneys — so that the board sits in a place.
  {
    const b = th.bricks, d = new THREE.Object3D(), isW = (x, y) => code(x, y) === C.wall, tall = [], low = [];
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!isW(tx, ty)) continue;
      const n = isW(tx, ty + 1), s2 = isW(tx, ty - 1), e = isW(tx + 1, ty), w2 = isW(tx - 1, ty), cnt = n + s2 + e + w2;
      const runH = e && w2 && !n && !s2, runV = n && s2 && !e && !w2;
      if (runH || runV) { if ((runH ? tx : ty) % 4 === 2) low.push([tx, ty]); }
      else if (cnt <= 1) tall.push([tx, ty]);
      else if (cnt === 2 && !isW(tx + (e ? 1 : -1), ty + (n ? 1 : -1))) tall.push([tx, ty]);   // the corner of a line of bricks, not of a block
    }
    const plasticM = (hex) => new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.42, envMap: env, envMapIntensity: 0.3 });
    const glowM = (hex) => new THREE.MeshBasicMaterial({ color: lin(hex), toneMapped: false });
    const many = (geo, mat, list, place, cast = true) => {
      if (!list.length) { geo.dispose(); mat.dispose(); return; }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((q, i) => { d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); place(q, d); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; group.add(im); owned.push(geo, mat);
    };
    const cx = (q) => (q[0] + 0.5) * T, cz = (q) => -(q[1] + 0.5) * T, H0 = th.wallH;
    many(new THREE.BoxGeometry(0.8, 0.8, 0.8), plasticM(b.wall), tall, (q, o) => o.position.set(cx(q), H0 + 0.4, cz(q)));
    many(new THREE.ConeGeometry(0.62, 0.42, 4).rotateY(Math.PI / 4), plasticM(b.accent), tall, (q, o) => o.position.set(cx(q), H0 + 1.01, cz(q)));
    many(new THREE.SphereGeometry(0.17, 10, 8), glowM(b.lamp), tall, (q, o) => o.position.set(cx(q), H0 + 1.3, cz(q)), false);
    many(new THREE.BoxGeometry(0.8, 0.4, 0.8), plasticM(b.accent), low, (q, o) => o.position.set(cx(q), H0 + 0.2, cz(q)));

    if (!th.void && b.around.length) {
      const R2 = rng32(hashStr(map.id || 'map') + 99), bins = new Map(), snow = map.id === 'frostbite';
      // one piece of a prop: a unit box / cylinder / cone / four-sided cone, scaled and set down at (x, y up, z)
      const pc = (geo, hex, x, y, z, sx, sy, sz, glow = false) => { const k = `${geo}:${hex}:${glow}`; if (!bins.has(k)) bins.set(k, { geo, hex, glow, at: [] }); bins.get(k).at.push([x, y, z, sx, sy, sz]); };
      const GREEN = [0x237841, 0x4b9f4a, 0x184632];
      const PROP = {
        tree(x, z, k) { const c = GREEN[Math.floor(R2() * 2)]; pc('cyl', 0x582a12, x, 0.7 * k, z, 0.5 * k, 1.4 * k, 0.5 * k); pc('cyl', c, x, 1.75 * k, z, 2.6 * k, 0.7 * k, 2.6 * k); pc('cyl', c, x, 2.45 * k, z, 2.0 * k, 0.7 * k, 2.0 * k); pc('cyl', c, x, 3.1 * k, z, 1.2 * k, 0.6 * k, 1.2 * k); },
        pine(x, z, k) { pc('cyl', 0x582a12, x, 0.5 * k, z, 0.45 * k, 1.0 * k, 0.45 * k); pc('cone', GREEN[2], x, 1.7 * k, z, 2.6 * k, 1.6 * k, 2.6 * k); pc('cone', GREEN[2], x, 2.7 * k, z, 2.0 * k, 1.5 * k, 2.0 * k); pc('cone', snow ? 0xf2f3f2 : GREEN[0], x, 3.6 * k, z, 1.3 * k, 1.3 * k, 1.3 * k); },
        bush(x, z, k) { const c = GREEN[Math.floor(R2() * 2)]; pc('cyl', c, x, 0.3 * k, z, 1.9 * k, 0.6 * k, 1.9 * k); pc('cyl', c, x, 0.85 * k, z, 1.2 * k, 0.5 * k, 1.2 * k); pc('cyl', R2() < 0.5 ? 0xc91a09 : 0xf2cd37, x, 1.16 * k, z, 0.3 * k, 0.12 * k, 0.3 * k); },
        cactus(x, z, k) { pc('cyl', 0x4b9f4a, x, 1.2 * k, z, 0.7 * k, 2.4 * k, 0.7 * k); for (const sd of [-1, 1]) { pc('box', 0x4b9f4a, x + sd * 0.55 * k, (1.0 + (sd > 0 ? 0.3 : 0)) * k, z, 0.6 * k, 0.4 * k, 0.4 * k); pc('cyl', 0x4b9f4a, x + sd * 0.8 * k, (1.55 + (sd > 0 ? 0.3 : 0)) * k, z, 0.45 * k, 0.9 * k, 0.45 * k); } },
        rock(x, z, k) { pc('box', 0xaa7d55, x, 0.4 * k, z, 2.4 * k, 0.8 * k, 2.0 * k); pc('box', 0xe4cd9e, x + 0.2 * k, 1.2 * k, z - 0.2 * k, 1.6 * k, 0.8 * k, 1.2 * k); pc('box', 0x958a73, x + 0.4 * k, 1.8 * k, z - 0.2 * k, 0.8 * k, 0.4 * k, 0.8 * k); },
        lamp(x, z) { pc('cyl', 0x6c6e68, x, 0.2, z, 0.8, 0.4, 0.8); pc('cyl', 0x1b2a34, x, 2.5, z, 0.22, 4.2, 0.22); pc('box', 0x1b2a34, x, 4.7, z, 1.2, 0.2, 0.4); pc('box', b.lamp, x, 4.55, z, 0.9, 0.12, 0.3, true); },
        stack(x, z, k) { pc('cyl', 0x1b2a34, x, 3.2 * k, z, 1.6 * k, 6.4 * k, 1.6 * k); pc('cyl', 0xc91a09, x, 5.4 * k, z, 1.68 * k, 0.8 * k, 1.68 * k); pc('cyl', 0xf2f3f2, x, 4.6 * k, z, 1.68 * k, 0.4 * k, 1.68 * k); pc('cyl', 0xfe8a18, x, 6.45 * k, z, 1.2 * k, 0.1 * k, 1.2 * k, true); },
        pile(x, z) { pc('box', 0xaa7d55, x, 0.6, z, 1.6, 1.2, 1.6); pc('box', 0xa95500, x + 1.7, 0.6, z + 0.2, 1.6, 1.2, 1.6); pc('box', 0x958a73, x + 0.85, 1.8, z + 0.1, 1.6, 1.2, 1.6); },
        tyres(x, z) { for (let i = 0; i < 3; i++) pc('cyl', 0x1b2a34, x, 0.225 + i * 0.45, z, 1.3, 0.45, 1.3); pc('cyl', 0xf2f3f2, x, 1.575, z, 1.3, 0.45, 1.3); },
      };
      const count = Math.round((W + H) / 2.4);
      for (let i = 0; i < count; i++) {
        const side = Math.floor(R2() * 4), along = R2(), out = 3.5 + R2() * 14, k = 0.8 + R2() * 0.55;
        const x = side < 2 ? along * (W + 22) - 11 : side === 2 ? -out : W + out, y = side === 0 ? -out : side === 1 ? H + out : along * (H + 22) - 11;
        PROP[b.around[Math.floor(R2() * b.around.length)]](x, -y, k);
      }
      const GEO = { box: () => new THREE.BoxGeometry(1, 1, 1), cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12), cone: () => new THREE.ConeGeometry(0.5, 1, 10) };
      for (const bin of bins.values()) many(GEO[bin.geo](), bin.glow ? glowM(bin.hex) : plasticM(bin.hex), bin.at, (q, o) => { o.position.set(q[0], q[1], q[2]); o.scale.set(q[3], q[4], q[5]); }, !bin.glow);
    }
  }

  // repair pads: four bollards with a green lamp each
  if (map.pads.length) {
    const post = new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8), lamp = new THREE.SphereGeometry(0.075, 8, 6);
    const pm = new THREE.MeshStandardMaterial({ color: lin(0x2c3238), roughness: 0.6 }), lm = new THREE.MeshBasicMaterial({ color: lin(0x66ffb0), toneMapped: false });
    owned.push(post, lamp, pm, lm);
    for (const p of map.pads) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = new THREE.Mesh(post, pm), b = new THREE.Mesh(lamp, lm);
      a.position.set(p.x + sx * 0.86, 0.225, -(p.y + sy * 0.86)); b.position.set(p.x + sx * 0.86, 0.48, -(p.y + sy * 0.86)); a.castShadow = true;
      group.add(a, b);
    }
  }

  // floodlight masts outside the corners of a walled yard
  const glows = [];
  if (th.props && !th.void) {
    const pole = new THREE.BoxGeometry(0.4, 15, 0.4), head = new THREE.BoxGeometry(3.2, 1.2, 0.5), face = new THREE.PlaneGeometry(2.9, 0.95), gt = glowTexture();
    const dark = new THREE.MeshStandardMaterial({ color: lin(0x30363d), roughness: 0.7 }), lit = new THREE.MeshBasicMaterial({ color: lin(0xfff3d6), toneMapped: false });
    const gm = new THREE.SpriteMaterial({ map: gt, color: lin(0xffe6b0), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    owned.push(pole, head, face, dark, lit, gm, gt);
    for (const [x, y] of [[-5, -5], [W + 5, -5], [-5, H + 5], [W + 5, H + 5]]) {
      const g2 = new THREE.Group(), a = new THREE.Mesh(pole, dark), b = new THREE.Mesh(head, dark), c = new THREE.Mesh(face, lit), s = new THREE.Sprite(gm);
      a.position.y = 7.5; b.position.y = 15.4; c.position.set(0, 15.4, 0.26); s.position.set(0, 15.4, 0.6); s.scale.set(9, 9, 1);
      g2.add(a, b, c, s); g2.position.set(x, 0, -y); g2.lookAt(W / 2, 0, -H / 2);
      group.add(g2);
    }
  }

  // sky: a gradient dome and a sun, both carried along with the camera
  const dome = (() => {
    const g = new THREE.SphereGeometry(500, 32, 20), col = [], top = lin(th.sky[0]), hor = lin(th.sky[1]), low = lin(th.sky[2]), c = new THREE.Color(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const h = p.getY(i) / 500; if (h >= 0) c.copy(hor).lerp(top, Math.pow(h, 0.55)); else c.copy(hor).lerp(low, Math.min(1, -h * 5)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = -10; m.frustumCulled = false; group.add(m); owned.push(g, m.material);
    return m;
  })();
  const [sunCol, , az, el] = th.sun, sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const sunTex = glowTexture(), sunMat = new THREE.SpriteMaterial({ map: sunTex, color: lin(sunCol), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const sun = new THREE.Sprite(sunMat); sun.scale.set(150, 150, 1); sun.renderOrder = -9; group.add(sun); owned.push(sunTex, sunMat);

  return {
    group, theme: th, sunDir,
    update(t, camera) { U.uTime.value = t; if (drift) drift(t); dome.position.copy(camera.position); sun.position.copy(camera.position).addScaledVector(sunDir, 470); },
    dispose() { for (const o of owned) o.dispose && o.dispose(); },
  };
}

/** A soft burn mark for explosions (drawn as ground decals during a replay). */
export function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62), R = rng32(5);
  g.addColorStop(0, 'rgba(8,7,6,0.9)'); g.addColorStop(0.45, 'rgba(10,9,8,0.6)'); g.addColorStop(1, 'rgba(10,9,8,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(8,7,6,0.35)'; x.lineCap = 'round';
  for (let i = 0; i < 26; i++) { const a = R() * 6.283, l = 30 + R() * 30; x.lineWidth = 1 + R() * 4; x.beginPath(); x.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); x.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); x.stroke(); }
  return new THREE.CanvasTexture(c);
}
