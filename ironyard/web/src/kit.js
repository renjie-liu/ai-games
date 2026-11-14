// The brick kit as 3D models (three.js r128, global THREE).
//
// Every piece is merged into at most a handful of geometries with vertex
// colours (body / glow / glass, plus a turret or a spinning sub-part), so a
// whole vehicle is a few dozen draw calls that share three materials.
// Piece frame: +X is the piece's facing, +Y is up, y = 0 is the ground.
/* global THREE */

export const S = 0.4;                 // stud pitch (m)
const Y0 = 0.16, HC = 0.32;           // chassis layer: bottom, height
const YD = Y0 + HC, HB = 0.44, HP = 0.13; // deck: bottom, brick height, plate height
const STUD_R = 0.115, STUD_H = 0.07;

export const TEAM_HEX = [0xf47b20, 0x2086e6];
const TEAM_DARK = [0xa5480f, 0x10508f];
const C = { dark: 0x4b5158, mid: 0x7d858d, light: 0xaab1b8, black: 0x1a1c20, tire: 0x17181b, chrome: 0xd3d8de, gold: 0xe0a72e,
  yellow: 0xf5cd2f, red: 0xd0241b, green: 0x3fcf78, cyan: 0x2fd3ff, white: 0xf2f3f2, olive: 0x66704a };

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
  get empty() { return this.n === 0; }
  add(geo, m, hex) {
    const p = geo.attributes.position, nrm = geo.attributes.normal, c = lin(hex);
    const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      this.col.push(c.r, c.g, c.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(geo.index.getX(i) + this.n);
    else for (let i = 0; i < p.count; i++) this.idx.push(i + this.n);
    this.n += p.count;
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// primitive cache
const prim = {};
const P = (k, make) => (prim[k] ||= make());
// scratch objects are created on first use: this module must load even when three.js did not (the page then falls back to 2D)
let M, Q, E, V1, V2;
const mat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  if (!M) { M = new THREE.Matrix4(); Q = new THREE.Quaternion(); E = new THREE.Euler(); V1 = new THREE.Vector3(); V2 = new THREE.Vector3(1, 1, 1); }
  return M.compose(V1.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), V2.set(sx, sy, sz)).clone();
};

const box = (b, w, h, d, x, y, z, hex, rz = 0, ry = 0) => b.add(P('box', () => new THREE.BoxGeometry(1, 1, 1)), mat(x, y, z, 0, ry, rz, w, h, d), hex);
/** cylinder with its axis along 'y' | 'x' | 'z' */
const cyl = (b, r, h, x, y, z, hex, axis = 'y', seg = 14, r2 = r) => {
  const g = P(`cyl${seg}|${(r2 / r).toFixed(3)}`, () => new THREE.CylinderGeometry(r2 / r, 1, 1, seg));
  return b.add(g, mat(x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? -Math.PI / 2 : 0, r, h, r), hex);
};
const ball = (b, r, x, y, z, hex, sy = 1) => b.add(P('ball', () => new THREE.SphereGeometry(1, 16, 12)), mat(x, y, z, 0, 0, 0, r, r * sy, r), hex);
const cone = (b, r, h, x, y, z, hex, axis = 'x') => b.add(P('cone', () => new THREE.ConeGeometry(1, 1, 12)), mat(x, y, z, 0, 0, axis === 'x' ? -Math.PI / 2 : 0, r, h, r), hex);
/** wedge: full height at the back (-X), down to `lip` at the front (+X) */
const wedge = (b, len, h, wid, x, y, z, hex, lip = 0.06, ry = 0) => {
  const g = P('wedge' + (lip / h).toFixed(3), () => {
    const l = lip / h; // lip as a fraction of height
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, l, -0.5], [-0.5, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, l, 0.5], [-0.5, 1, 0.5]];
    const f = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4]];
    const pos = [];
    for (const t of f) for (const i of t) pos.push(...v[i]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  });
  return b.add(g, mat(x, y, z, 0, ry, 0, len, h, wid), hex);
};
/** studs on top of an l x w footprint (l along X, w along Z) */
const studs = (b, l, w, top, hex) => {
  for (let i = 0; i < l; i++) for (let j = 0; j < w; j++) cyl(b, STUD_R, STUD_H, (i - (l - 1) / 2) * S, top + STUD_H / 2, (j - (w - 1) / 2) * S, hex, 'y', 10);
};

/**
 * Build the model of one piece. Returns builders:
 *   body, glow, glass            static parts
 *   turret { pivot:[x,y,z], body, glow }   rotates about Y (weapon traverse)
 *   spin   { pivot, axis:'y'|'z', body }   wheels (z, by distance), saws / radar (y, by time)
 *   flame  builder               thruster plume, shown while boosting
 */
function model(type, z, team, accentHex, def) {
  const [w, l] = def.size;
  const o = { body: new Builder(), glow: new Builder(), glass: new Builder() };
  const b = o.body, T = TEAM_HEX[team], TD = TEAM_DARK[team], A = accentHex;
  const base = z ? YD : Y0, H = z ? HB : HC, L = l * S, W = w * S;
  const tur = (y) => (o.turret = { pivot: [0, y, 0], body: new Builder(), glow: new Builder() });
  const spin = (x, y, zz, axis) => (o.spin = { pivot: [x, y, zz], axis, body: new Builder() });
  switch (type) {
    case 'core':
      box(b, 0.37, 0.2, 0.37, 0, base + 0.1, 0, C.black);
      box(b, 0.39, 0.05, 0.39, 0, base + 0.22, 0, T);
      box(o.glow, 0.41, 0.03, 0.41, 0, base + 0.04, 0, T);
      if (z) { ball(o.glass, 0.17, 0.02, base + 0.25, 0, 0xffffff, 1.05); box(b, 0.12, 0.14, 0.16, -0.1, base + 0.3, 0, C.dark); ball(b, 0.06, 0.0, base + 0.31, 0, C.yellow); }
      else ball(o.glow, 0.1, 0, base + 0.3, 0, T);
      break;
    case 'plate': case 'plate2': case 'plate4':
      if (z) { box(b, L - 0.02, HP, W - 0.02, 0, base + HP / 2, 0, T); studs(b, l, w, base + HP, T); }
      else { box(b, L - 0.02, 0.2, W - 0.02, 0, base + H - 0.1, 0, C.dark); box(b, L - 0.1, 0.1, W - 0.1, 0, base + H - 0.25, 0, C.black); studs(b, l, w, base + H, C.dark); }
      break;
    case 'brick': case 'brick2':
      box(b, L - 0.02, H, W - 0.02, 0, base + H / 2, 0, z ? T : TD); studs(b, l, w, base + H, z ? T : TD);
      break;
    case 'armor': case 'armor2':
      box(b, L - 0.01, H, W - 0.01, 0, base + H / 2, 0, C.light);
      box(b, L + 0.015, 0.09, W + 0.015, 0, base + H * 0.55, 0, A);
      box(b, L + 0.02, 0.05, W + 0.02, 0, base + 0.03, 0, C.mid);
      studs(b, l, w, base + H, C.light);
      break;
    case 'slope':
      wedge(b, S - 0.01, H * 0.92, S - 0.02, 0, base, 0, T, 0.05);
      box(b, 0.06, 0.03, S - 0.06, -0.14, base + H * 0.92 - 0.01, 0, A);
      break;
    case 'plow': { // l = 1 along X, w = 3 along Z
      box(b, 0.1, 0.5, W + 0.1, 0.17, Y0 + 0.2, 0, C.light, -0.3);
      box(b, 0.11, 0.1, W + 0.12, 0.25, Y0 + 0.02, 0, C.yellow, -0.3);
      for (const s of [-1, 1]) box(b, 0.3, 0.12, 0.1, -0.02, Y0 + 0.22, s * S, C.dark);
      box(b, 0.14, 0.2, W - 0.1, -0.12, Y0 + 0.22, 0, C.black);
      break;
    }
    case 'wheel': case 'bigwheel': {
      const big = type === 'bigwheel', r = big ? 0.36 : 0.27, wd = big ? 0.34 : 0.3;
      box(b, big ? 0.5 : 0.2, 0.1, 0.34, 0, r, 0, C.dark);
      const sp = spin(0, r, 0, 'z').body;
      cyl(sp, r, wd, 0, 0, 0, C.tire, 'z', 20);
      cyl(sp, r * 0.56, wd + 0.02, 0, 0, 0, C.light, 'z', 12);
      cyl(sp, r * 0.2, wd + 0.05, 0, 0, 0, A, 'z', 8);
      const n = big ? 12 : 9;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; box(sp, 0.09, 0.05, wd + 0.03, Math.cos(a) * r, Math.sin(a) * r, 0, C.black, a + Math.PI / 2); }
      break;
    }
    case 'track': { // 3 studs along X
      const r = 0.2, half = L / 2 - r;
      box(b, half * 2, r * 2, 0.36, 0, r, 0, C.tire);
      for (const s of [-1, 1]) cyl(b, r, 0.36, s * half, r, 0, C.tire, 'z', 14);
      for (const x of [-half, 0, half]) { cyl(b, r * 0.62, 0.38, x, r, 0, C.mid, 'z', 10); cyl(b, r * 0.2, 0.4, x, r, 0, A, 'z', 6); }
      for (let i = -3; i <= 3; i++) box(b, 0.05, 0.035, 0.38, i * 0.15, r * 2 + 0.01, 0, C.black);
      box(b, L - 0.1, 0.07, 0.3, 0, r * 2 + 0.06, 0, C.dark);
      break;
    }
    case 'hover':
      cyl(b, 0.19, 0.1, 0, 0.27, 0, C.dark, 'y', 16); box(b, 0.3, 0.1, 0.3, 0, 0.36, 0, C.mid);
      cyl(o.glow, 0.16, 0.04, 0, 0.2, 0, C.cyan, 'y', 16); cyl(b, 0.2, 0.03, 0, 0.215, 0, C.light, 'y', 16);
      break;
    case 'thruster':
      box(b, 0.22, 0.24, 0.28, 0.06, base + 0.16, 0, C.dark);
      cyl(b, 0.16, 0.26, -0.14, base + 0.17, 0, C.light, 'x', 14, 0.09);
      cyl(o.glow, 0.1, 0.02, -0.275, base + 0.17, 0, 0xff9a3d, 'x', 12);
      o.flame = new Builder();
      cone(o.flame, 0.13, 0.8, -0.68, base + 0.17, 0, 0xffc45a, 'x');
      break;
    case 'gyro':
      box(b, 0.3, 0.12, 0.3, 0, base + 0.06, 0, C.dark);
      ball(b, 0.13, 0, base + 0.26, 0, C.gold);
      cyl(b, 0.17, 0.03, 0, base + 0.26, 0, C.light, 'y', 16); cyl(b, 0.17, 0.03, 0, base + 0.26, 0, C.light, 'x', 16);
      break;
    case 'blower':
      box(b, 0.3, 0.16, 0.26, 0, base + 0.08, 0, C.dark);
      box(b, 0.26, 0.14, 0.3, 0, base + 0.23, 0, C.chrome);
      wedge(b, 0.2, 0.16, 0.24, 0.02, base + 0.3, 0, C.chrome, 0.1, Math.PI);
      cyl(b, 0.05, 0.32, -0.06, base + 0.23, 0, C.black, 'z', 8);
      box(o.glow, 0.02, 0.08, 0.2, 0.125, base + 0.37, 0, 0xff6a2a);
      break;
    case 'spoiler': // w = 3 along Z
      for (const s of [-1, 1]) box(b, 0.06, 0.3, 0.05, 0, base + 0.15, s * S, C.dark);
      box(b, 0.3, 0.04, W - 0.04, -0.03, base + 0.32, 0, A, 0.12);
      for (const s of [-1, 1]) box(b, 0.34, 0.14, 0.03, -0.03, base + 0.33, s * (W / 2 - 0.02), T);
      break;
    case 'mg': {
      cyl(b, 0.17, 0.08, 0, base + 0.04, 0, C.dark, 'y', 14);
      const t = tur(base + 0.08);
      box(t.body, 0.24, 0.17, 0.22, -0.02, 0.085, 0, T); box(t.body, 0.12, 0.1, 0.1, -0.06, 0.2, 0.0, C.dark);
      for (const s of [-1, 1]) { cyl(t.body, 0.028, 0.34, 0.25, 0.1, s * 0.05, C.black, 'x', 8); }
      box(t.body, 0.1, 0.14, 0.08, -0.02, 0.07, 0.15, C.olive);
      break;
    }
    case 'cannon': {
      box(b, L - 0.06, 0.1, 0.34, 0, base + 0.05, 0, C.dark);
      const t = tur(base + 0.1);
      box(t.body, 0.42, 0.24, 0.34, -0.12, 0.12, 0, T); box(t.body, 0.2, 0.08, 0.3, -0.2, 0.28, 0, TD);
      cyl(t.body, 0.07, 0.6, 0.36, 0.13, 0, C.dark, 'x', 12); cyl(t.body, 0.095, 0.12, 0.66, 0.13, 0, C.black, 'x', 12);
      box(t.body, 0.1, 0.16, 0.2, 0.1, 0.13, 0, C.mid);
      break;
    }
    case 'railgun': {
      box(b, L - 0.08, 0.09, 0.32, 0, base + 0.045, 0, C.dark);
      const t = tur(base + 0.09);
      box(t.body, 0.36, 0.22, 0.34, -0.36, 0.11, 0, T);
      for (const s of [-1, 1]) { box(t.body, 1.0, 0.07, 0.06, 0.1, 0.13, s * 0.09, C.black); box(t.body, 0.14, 0.2, 0.08, -0.34, 0.2, s * 0.17, C.yellow); }
      box(t.glow, 0.96, 0.03, 0.08, 0.1, 0.13, 0, 0x8fe0ff);
      for (const x of [-0.1, 0.2, 0.5]) box(t.body, 0.05, 0.13, 0.26, x, 0.13, 0, C.mid);
      break;
    }
    case 'laser': {
      cyl(b, 0.17, 0.08, 0, base + 0.04, 0, C.dark, 'y', 14);
      const t = tur(base + 0.08);
      box(t.body, 0.26, 0.18, 0.2, -0.03, 0.09, 0, C.white);
      for (const x of [-0.1, -0.03, 0.04]) box(t.body, 0.03, 0.24, 0.24, x, 0.1, 0, C.mid);
      cyl(t.body, 0.055, 0.2, 0.19, 0.1, 0, C.black, 'x', 10);
      cyl(t.glow, 0.045, 0.03, 0.3, 0.1, 0, 0xff3d6a, 'x', 10);
      break;
    }
    case 'missile': {
      box(b, L - 0.06, 0.08, W - 0.06, 0, base + 0.04, 0, C.dark);
      const t = tur(base + 0.08);
      box(t.body, 0.56, 0.36, 0.62, 0, 0.24, 0, T, 0.22);
      box(t.body, 0.5, 0.06, 0.66, -0.02, 0.44, 0, TD, 0.22);
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) { cyl(t.body, 0.085, 0.04, 0.27 - sy * 0.02, 0.3 + sy * 0.09, sz * 0.15, C.black, 'x', 10); cone(t.glow, 0.05, 0.08, 0.3 - sy * 0.02, 0.3 + sy * 0.09, sz * 0.15, C.red, 'x'); }
      break;
    }
    case 'mortar': {
      cyl(b, 0.34, 0.07, 0, base + 0.035, 0, C.dark, 'y', 18);
      const t = tur(base + 0.07);
      cyl(t.body, 0.3, 0.06, 0, 0.03, 0, C.mid, 'y', 18);
      t.body.add(P('cyl14|1.000', () => new THREE.CylinderGeometry(1, 1, 1, 14)), mat(0.06, 0.28, 0, 0, 0, -0.62, 0.15, 0.5, 0.15), C.olive);
      t.body.add(P('cyl14|1.000', () => new THREE.CylinderGeometry(1, 1, 1, 14)), mat(0.2, 0.47, 0, 0, 0, -0.62, 0.17, 0.08, 0.17), C.black);
      for (const s of [-1, 1]) box(t.body, 0.3, 0.05, 0.05, 0.02, 0.14, s * 0.2, C.dark, 0.5);
      box(t.body, 0.16, 0.14, 0.3, -0.18, 0.1, 0, C.olive);
      break;
    }
    case 'saw': {
      box(b, 0.3, 0.12, 0.18, -0.06, Y0 + 0.18, 0, C.dark);
      const sp = spin(0.22, Y0 + 0.16, 0, 'y').body;
      cyl(sp, 0.3, 0.035, 0, 0, 0, C.chrome, 'y', 20);
      cyl(sp, 0.08, 0.06, 0, 0, 0, C.red, 'y', 8);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; box(sp, 0.09, 0.03, 0.06, Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31, C.light, 0, -a + 0.5); }
      break;
    }
    case 'spike':
      box(b, 0.14, 0.26, 0.34, -0.12, Y0 + 0.18, 0, C.dark);
      cone(b, 0.15, 0.5, 0.18, Y0 + 0.18, 0, C.chrome, 'x');
      break;
    case 'battery':
      box(b, 0.34, H - 0.06, 0.34, 0, base + (H - 0.06) / 2, 0, C.black);
      box(b, 0.35, 0.07, 0.35, 0, base + H * 0.5, 0, C.yellow);
      for (const s of [-1, 1]) cyl(b, 0.045, 0.07, s * 0.09, base + H - 0.02, 0, s < 0 ? C.red : C.light, 'y', 8);
      break;
    case 'reactor':
      cyl(b, 0.16, H, 0, base + H / 2, 0, C.dark, 'y', 14);
      cyl(o.glow, 0.165, H * 0.34, 0, base + H / 2, 0, C.green, 'y', 14);
      for (const y of [0.08, H - 0.08]) cyl(b, 0.18, 0.07, 0, base + y, 0, C.light, 'y', 14);
      break;
    case 'radar': {
      cyl(b, 0.05, 0.3, 0, base + 0.15, 0, C.dark, 'y', 8); box(b, 0.24, 0.06, 0.24, 0, base + 0.03, 0, C.mid);
      const sp = spin(0, base + 0.34, 0, 'y').body;
      sp.add(P('dish', () => new THREE.CylinderGeometry(1, 0.25, 1, 14)), mat(0.04, 0.06, 0, 0, 0, -1.0, 0.2, 0.07, 0.2), C.light);
      cyl(sp, 0.02, 0.14, 0.13, 0.14, 0, C.red, 'y', 6);
      break;
    }
    case 'shieldgen':
      box(b, 0.34, 0.14, 0.34, 0, base + 0.07, 0, C.dark); cyl(b, 0.14, 0.1, 0, base + 0.19, 0, C.light, 'y', 12);
      ball(o.glow, 0.13, 0, base + 0.33, 0, 0x6fc3ff);
      for (const a of [0, 1, 2]) box(b, 0.03, 0.26, 0.03, Math.cos(a * 2.094) * 0.15, base + 0.27, Math.sin(a * 2.094) * 0.15, C.mid);
      break;
    case 'repairer':
      box(b, 0.32, 0.16, 0.32, 0, base + 0.08, 0, C.white);
      box(b, 0.06, 0.3, 0.06, -0.06, base + 0.3, 0, C.yellow, -0.5); box(b, 0.26, 0.05, 0.05, 0.1, base + 0.44, 0, C.yellow, -0.3);
      box(o.glow, 0.2, 0.02, 0.06, 0, base + 0.171, 0, C.green); box(o.glow, 0.06, 0.02, 0.2, 0, base + 0.171, 0, C.green);
      ball(o.glow, 0.04, 0.22, base + 0.4, 0, C.green);
      break;
    // decor
    case 'tile': box(b, S - 0.03, 0.06, S - 0.03, 0, base + 0.03, 0, A); break;
    case 'fin': wedge(b, 0.34, 0.34, 0.04, -0.02, base, 0, A, 0.02); break;
    case 'pipe': for (const s of [-1, 1]) { cyl(b, 0.04, 0.42, -0.04, base + 0.21, s * 0.09, C.chrome, 'y', 8); cyl(b, 0.05, 0.05, -0.04, base + 0.41, s * 0.09, C.black, 'y', 8); } break;
    case 'lamp':
      box(b, 0.12, 0.12, 0.3, 0, base + 0.06, 0, C.black);
      for (const s of [-1, 1]) cyl(o.glow, 0.045, 0.02, 0.065, base + 0.07, s * 0.08, 0xfff3c0, 'x', 10);
      break;
    case 'flag':
      cyl(b, 0.015, 0.7, 0, base + 0.35, 0, C.light, 'y', 6); box(b, 0.22, 0.13, 0.012, -0.12, base + 0.62, 0, A);
      break;
    default: box(b, L - 0.04, 0.2, W - 0.04, 0, base + 0.1, 0, C.mid);
  }
  return o;
}

export class Kit {
  constructor(IY) { this.IY = IY; this.cache = new Map(); }

  /** Shared materials for one renderer (pass its environment map). */
  static materials(envMap) {
    return {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.0, envMap, envMapIntensity: 0.75 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1, envMap, envMapIntensity: 1.4, depthWrite: false }),
      flame: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    };
  }

  geo(type, z, team, accent) {
    const key = `${type}|${z}|${team}|${accent}`;
    let g = this.cache.get(key);
    if (g) return g;
    const o = model(type, z, team, parseInt(this.IY.PAINTS[accent].slice(1), 16), this.IY.PARTS[type]);
    const fin = (b) => (b && !b.empty ? b.build() : null);
    g = { body: fin(o.body), glow: fin(o.glow), glass: fin(o.glass), flame: fin(o.flame),
      turret: o.turret ? { pivot: o.turret.pivot, body: fin(o.turret.body), glow: fin(o.turret.glow) } : null,
      spin: o.spin ? { pivot: o.spin.pivot, axis: o.spin.axis, body: fin(o.spin.body) } : null };
    this.cache.set(key, g);
    return g;
  }

  /** One piece as an Object3D positioned in the vehicle body frame (origin = blueprint stud (0,0)). */
  piece(p, team, accent, mats, shadows = true) {
    const IY = this.IY, def = IY.PARTS[p.type], g = this.geo(p.type, p.z, team, accent);
    const [cx, cy] = IY.centerOf(p);
    const node = new THREE.Group();
    node.position.set(cy * S, 0, cx * S);
    node.rotation.y = IY.DIR_ANGLE[p.dir] || 0;
    const mesh = (geo, m, parent = node) => { if (!geo) return null; const x = new THREE.Mesh(geo, m); x.castShadow = shadows && m === mats.body; x.receiveShadow = false; parent.add(x); return x; };
    mesh(g.body, mats.body); mesh(g.glow, mats.glow); mesh(g.glass, mats.glass);
    const out = { node, turret: null, spin: null, flame: null, weapon: !!(def.weapon && def.weapon !== 'melee'), type: p.type, dir: p.dir };
    if (g.turret) { const t = new THREE.Group(); t.position.set(...g.turret.pivot); node.add(t); mesh(g.turret.body, mats.body, t); mesh(g.turret.glow, mats.glow, t); out.turret = t; }
    if (g.spin) { const s = new THREE.Group(); s.position.set(...g.spin.pivot); node.add(s); mesh(g.spin.body, mats.body, s); out.spin = { node: s, axis: g.spin.axis, wheel: !!def.mover }; }
    if (g.flame) { out.flame = mesh(g.flame, mats.flame); out.flame.visible = false; }
    return out;
  }

  /** Whole vehicle: { root (at centre of mass), body (offset by -COM), pieces[] in blueprint order }. */
  vehicle(design, team, mats, shadows = true) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const accent = (design.paint && design.paint.accent) || 'white';
    const pieces = design.parts.map((p) => { const pc = this.piece(p, team, accent, mats, shadows); body.add(pc.node); return pc; });
    return { root, body, pieces };
  }
}

/** A small studio environment so the plastic picks up soft highlights. */
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = sky.geometry.attributes.position, col = [];
  const top = new THREE.Color(0x9fc4ee), mid = new THREE.Color(0x35506e), bot = new THREE.Color(0x0c1420), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) / 50; if (t > 0) c.copy(mid).lerp(top, t); else c.copy(mid).lerp(bot, -t); col.push(c.r, c.g, c.b); }
  sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(sky);
  const panel = (x, y, z, w, h, hex) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  panel(20, 28, 14, 26, 18, 0xffffff); panel(-26, 14, -8, 18, 14, 0xbfd9ff); panel(4, 10, -30, 22, 8, 0xffd9a8);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  sky.geometry.dispose();
  return rt.texture;
}

/** Stud-pattern normal map + seam albedo for a 2 m baseplate tile (5 x 5 studs). */
export function studTextures() {
  const N = 160, per = 5, cell = N / per, R = cell * 0.3;
  const hgt = (x, y) => {
    const cx = (Math.floor(x / cell) + 0.5) * cell, cy = (Math.floor(y / cell) + 0.5) * cell;
    const d = Math.hypot(x - cx, y - cy);
    return d < R - 2 ? 1 : d > R + 1 ? 0 : (R + 1 - d) / 3;
  };
  const nc = document.createElement('canvas'); nc.width = nc.height = N;
  const nx = nc.getContext('2d'), img = nx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 2.2, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 2.2;
    const len = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / len * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  nx.putImageData(img, 0, 0);
  const ac = document.createElement('canvas'); ac.width = ac.height = N;
  const ax = ac.getContext('2d');
  ax.fillStyle = '#fff'; ax.fillRect(0, 0, N, N);
  for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
    const g = ax.createRadialGradient((i + 0.42) * cell, (j + 0.42) * cell, 1, (i + 0.5) * cell, (j + 0.5) * cell, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e4e4e4');
    ax.fillStyle = g; ax.beginPath(); ax.arc((i + 0.5) * cell, (j + 0.5) * cell, R, 0, 6.3); ax.fill();
  }
  ax.strokeStyle = 'rgba(0,0,0,0.28)'; ax.lineWidth = 2; ax.strokeRect(0, 0, N, N);
  const normal = new THREE.CanvasTexture(nc), albedo = new THREE.CanvasTexture(ac);
  albedo.encoding = THREE.sRGBEncoding;
  for (const t of [normal, albedo]) { t.anisotropy = 4; }
  return { normal, albedo };
}

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
