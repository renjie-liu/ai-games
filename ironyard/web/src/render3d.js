// WebGL views (three.js r128, loaded as the global THREE): the arena, and the
// garage turntable. World (x east, y north) maps to three.js (x, up, -y); a
// vehicle's local forward is +X of its group, so group.rotation.y = heading.
/* global THREE */
import { Kit, S, TEAM_HEX, makeEnvironment, studTextures, glowTexture } from './kit.js';
import { buildArena, scorchTexture } from './terrain.js';

const FLAG = { alive: 1, boost: 2, stun: 4, hover: 8, overdrive: 16, nitro: 32, overshield: 64, saw: 128, repair: 256 };
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const L = (hex) => new THREE.Color(hex).convertSRGBToLinear();
function hash01(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function makeRenderer(antialias = true) {
  const r = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance', alpha: false });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

export class Render3D {
  constructor(host, IY, kit) {
    this.IY = IY; this.host = host; this.kit = kit || new Kit(IY);
    const r = (this.renderer = makeRenderer());
    this.canvas = r.domElement;
    this.canvas.className = 'arena-canvas';
    host.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a121c);
    this.scene.fog = new THREE.Fog(0x0a121c, 160, 700); // fog is mixed in after output encoding, so its colour is a display colour
    this.env = makeEnvironment(r);
    this.scene.environment = this.env;
    this.mats = Kit.materials(this.env);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x1c222b, 0.5); this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 1.35));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x6aa8ff, 0.35);
    rim.position.set(-40, 30, -60); this.scene.add(rim);

    this.tex = { glow: glowTexture(), scorch: scorchTexture() };
    this.cam = { tx: 0, tz: 0, dist: 60, az: 0.55, pol: 0.86 };
    this.follow = -1;
    this.mode = 'auto';        // auto | iso | top | free
    this.onMode = null;
    this.geo = {};
    this.world = null;
    this.dummy = new THREE.Object3D();
    this.v3 = new THREE.Vector3();
    this.col = new THREE.Color();
    this.bindControls();
    this.resize();
  }

  // ── camera ────────────────────────────────────────────────────────────
  bindControls() {
    const el = this.canvas, pts = new Map();
    let pinch = 0, midY = 0;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType }); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); midY = (a.y + b.y) / 2; } });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const c = this.cam;
      if (pts.size === 1) {
        if (e.shiftKey || e.buttons === 2) { this.pan(dx, dy); this.manual(); }
        else { c.az -= dx * 0.006; if (p.type === 'mouse') c.pol = clamp(c.pol - dy * 0.005, 0.05, 1.4); }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), my = (a.y + b.y) / 2;
        if (pinch > 0) { c.dist = clamp(c.dist * (pinch / d), 6, 240); if (Math.abs(pinch - d) > 2) this.manual(true); }
        c.pol = clamp(c.pol - (my - midY) * 0.006, 0.05, 1.4);
        pinch = d; midY = my;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.dist = clamp(this.cam.dist * Math.exp(e.deltaY * 0.0012), 6, 240); this.manual(true); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pan(dx, dy) {
    const c = this.cam, k = c.dist * 0.0016;
    c.tx += (-dx * Math.cos(c.az) - dy * Math.sin(c.az)) * k;
    c.tz += (dx * Math.sin(c.az) - dy * Math.cos(c.az)) * k;
  }

  /** The user took the camera: stop auto-framing (zoom keeps following a vehicle, panning lets go of it). */
  manual(zoomOnly) {
    if (!zoomOnly) this.follow = -1;
    if (this.mode !== 'free' && this.follow < 0) { this.mode = 'free'; this.onMode && this.onMode('free'); }
  }

  setPreset(name) {
    const c = this.cam;
    this.mode = name;
    if (name === 'top') { c.pol = 0.06; c.az = 0; } else if (name === 'iso' || name === 'auto') { c.pol = 0.86; c.az = 0.55; }
    if (name !== 'free') this.fit();
  }

  fit() {
    if (!this.world) return;
    const m = this.world.map, c = this.cam;
    c.tx = m.width / 2; c.tz = -m.height / 2;
    const aspect = this.camera.aspect || 1.4;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const span = Math.hypot(m.width, m.height) * 0.56;
    c.dist = clamp(Math.max(span / Math.tan(hfov / 2), (span * 0.8) / Math.tan(vfov / 2)), 12, 230);
    this.fitDist = c.dist;
  }

  resize() {
    const w = Math.max(50, this.host.clientWidth), h = Math.max(50, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  project(x, y, h = 0) {
    const v = this.v3.set(x, h, -y).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, ok: v.z > -1 && v.z < 1 };
  }

  g(key, make) { return (this.geo[key] ||= make()); }

  // ── world construction ────────────────────────────────────────────────
  load(rp) {
    const t0 = performance.now();
    if (this.world) { this.scene.remove(this.world.root); disposeTree(this.world.root); this.world.arena.dispose(); }
    const root = new THREE.Group();
    const w = (this.world = { root, map: rp.map, vehicles: [], rp });
    w.arena = buildArena(this.IY, rp.map, this.env);
    root.add(w.arena.group);
    rp.vehicles.forEach((v) => {
      const o = this.kit.vehicle(v.design, v.team, this.mats);
      const bubble = new THREE.Group();
      const b1 = new THREE.Mesh(this.g('bubble', () => new THREE.SphereGeometry(1, 28, 18)), new THREE.MeshBasicMaterial({ color: L(0x6fc3ff), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      const b2 = new THREE.Mesh(this.g('bubblew', () => new THREE.IcosahedronGeometry(1.005, 1)), new THREE.MeshBasicMaterial({ color: L(0x9fd8ff), wireframe: true, transparent: true, opacity: 0.13, depthWrite: false }));
      bubble.add(b1, b2); bubble.visible = false; o.root.add(bubble);
      root.add(o.root);
      w.vehicles.push({ ...o, bubble, b1, b2, team: v.team });
    });
    this.buildPools(rp, root);
    // burn marks left by every blast and wreck: placed once, revealed as the replay reaches them
    const C = this.IY.TILE_CODE, burns = [];
    for (const e of rp.fx) {
      if (e.k !== 'death' && !(e.k === 'boom' && e.r >= 0.7)) continue;
      const c = this.IY.tileCodeAt(rp.map, e.x, e.y);
      if (c === C.pit || c === C.lava || c === C.wall) continue;
      burns.push({ t: e.t, x: e.x, y: e.y, r: e.k === 'death' ? 3.1 : e.r * 1.3 });
    }
    burns.sort((a, b) => a.t - b.t); burns.length = Math.min(burns.length, 500);
    w.burnT = burns.map((b) => b.t);
    w.burns = new THREE.InstancedMesh(this.g('burn', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ map: this.tex.scorch, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), Math.max(1, burns.length));
    burns.forEach((b, i) => { this.dummy.position.set(b.x, 0.02, -b.y); this.dummy.rotation.set(0, hash01(i + 3) * 6.283, 0); this.dummy.scale.set(b.r, 1, b.r); this.dummy.updateMatrix(); w.burns.setMatrixAt(i, this.dummy.matrix); });
    w.burns.count = 0; w.burns.frustumCulled = false; root.add(w.burns);
    this.scene.add(root);
    this.applyTheme(w.arena.theme, w.arena.sunDir, rp.map);
    this.fit();
    this.lastLoadMs = Math.round(performance.now() - t0); // scenery is generated here; handy when a device feels slow
  }

  /** Light, sky colour and haze for the map's setting. */
  applyTheme(th, dir, m) {
    this.scene.background.setHex(th.sky[1]);
    this.scene.fog.color.setHex(th.sky[1]); this.scene.fog.near = th.fog[0]; this.scene.fog.far = th.fog[1];
    this.hemi.color.setHex(th.hemi[0]).convertSRGBToLinear(); this.hemi.groundColor.setHex(th.hemi[1]).convertSRGBToLinear(); this.hemi.intensity = th.hemi[2];
    this.sun.color.setHex(th.sun[0]).convertSRGBToLinear(); this.sun.intensity = th.sun[1];
    this.renderer.toneMappingExposure = th.exposure || 1;
    const cx = m.width / 2, cz = -m.height / 2, s = Math.max(m.width, m.height) * 0.78;
    this.sun.position.set(cx + dir.x * 120, dir.y * 120, cz + dir.z * 120);
    this.sun.target.position.set(cx, 0, cz);
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 300 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  buildPools(rp, root) {
    const w = this.world, tex = this.tex;
    const im = (geo, mat, n, colors) => { const m = new THREE.InstancedMesh(geo, mat, n); if (colors) m.setColorAt(0, this.col.setHex(0xffffff)); /* allocates the colour buffer at full size, so before count drops */ m.count = 0; m.frustumCulled = false; root.add(m); return m; };
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
    w.tracers = im(new THREE.BoxGeometry(1.1, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: L(0xffffff), ...add }), 400, true);
    w.shells = im(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: L(0xffb060), toneMapped: false }), 80);
    const cone = new THREE.ConeGeometry(0.12, 0.75, 8); cone.rotateZ(-Math.PI / 2);
    w.missiles = im(cone, new THREE.MeshStandardMaterial({ color: L(0xf2f5f8), emissive: L(0xff5a1f), emissiveIntensity: 0.35, roughness: 0.4 }), 60);
    w.lobs = im(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: L(0x2a2d31), roughness: 0.5, envMap: this.env }), 24);
    w.lobShadows = im(new THREE.CircleGeometry(0.45, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: L(0x000000), transparent: true, opacity: 0.35, depthWrite: false }), 24);
    w.smoke = im(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: L(0xc9d2dc), transparent: true, opacity: 0.32, depthWrite: false }), 300);
    w.debris = im(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: L(0xffffff), roughness: 0.4, envMap: this.env, envMapIntensity: 0.6 }), 240, true);
    w.debris.castShadow = true;
    const pool = (n, make) => Array.from({ length: n }, () => { const m = make(); m.visible = false; root.add(m); return m; });
    const beamGeo = new THREE.BoxGeometry(1, 1, 1);
    w.beams = pool(28, () => new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: L(0xffffff), ...add })));
    w.booms = pool(30, () => new THREE.Mesh(this.g('boom', () => new THREE.SphereGeometry(1, 16, 12)), new THREE.MeshBasicMaterial({ color: L(0xffb347), ...add })));
    w.flashes = pool(40, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: L(0xffd9a0), ...add })));
    w.rings = pool(14, () => { const m = new THREE.Mesh(this.g('ring', () => new THREE.RingGeometry(0.86, 1, 48)), new THREE.MeshBasicMaterial({ color: L(0xc084fc), side: THREE.DoubleSide, ...add })); m.rotation.x = -Math.PI / 2; return m; });
    w.mines = pool(16, () => { const g = new THREE.Group(); const d = new THREE.Mesh(this.g('mine', () => new THREE.CylinderGeometry(0.3, 0.36, 0.12, 14)), new THREE.MeshStandardMaterial({ color: L(0x30363d), roughness: 0.5 })); d.position.y = 0.06;
      const l = new THREE.Mesh(this.g('mled', () => new THREE.SphereGeometry(0.08, 8, 6)), new THREE.MeshBasicMaterial({ color: L(0xff4d4d), toneMapped: false })); l.position.y = 0.15; g.add(d, l); g.userData.led = l; return g; });
    w.itemMats = {};
    for (const [id, it] of Object.entries(this.IY.ITEMS)) w.itemMats[id] = new THREE.SpriteMaterial({ map: iconTexture(it.icon, it.color), transparent: true, depthWrite: false, toneMapped: false });
    w.items = pool(rp.map.itemSpawns.length, () => {
      const g = new THREE.Group();
      const s = new THREE.Sprite(w.itemMats.repair); s.scale.set(1.5, 1.5, 1); s.position.y = 1.3;
      const beam = new THREE.Mesh(this.g('ibeam', () => new THREE.CylinderGeometry(0.5, 0.62, 3.4, 20, 1, true)), new THREE.MeshBasicMaterial({ color: L(0xffffff), side: THREE.DoubleSide, opacity: 0.1, ...add }));
      beam.position.y = 1.7; g.add(s, beam); g.userData = { s, beam }; return g;
    });
    const zone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: L(0xff4d4d), side: THREE.DoubleSide, opacity: 0.16, ...add }));
    zone.position.set(rp.map.center.x, 3.5, -rp.map.center.y); zone.visible = false; root.add(zone); w.zone = zone;
    const zring = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 128), new THREE.MeshBasicMaterial({ color: L(0xff6b6b), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    zring.rotation.x = -Math.PI / 2; zring.position.set(rp.map.center.x, 0.04, -rp.map.center.y); zring.visible = false; root.add(zring); w.zring = zring;
  }

  // ── per-frame ─────────────────────────────────────────────────────────
  draw(view) {
    const w = this.world; if (!w) return;
    const t = view.t, d = this.dummy, col = this.col;
    view.vehicles.forEach((v, id) => {
      const o = w.vehicles[id];
      o.root.visible = v.alive;
      if (!v.alive) return;
      const hov = v.flags & FLAG.hover;
      o.root.position.set(v.x, hov ? 0.3 + Math.sin(t * 3 + id) * 0.05 : 0, -v.y);
      o.root.rotation.y = v.th;
      o.body.position.set(-v.com.u, 0, v.com.v);
      const boosting = v.flags & FLAG.boost, sawing = v.flags & FLAG.saw;
      let k = 0;
      for (let i = 0; i < o.pieces.length; i++) {
        const pc = o.pieces[i];
        const alive = t < v.deathT[i];
        pc.node.visible = alive;
        if (pc.weapon) { if (pc.turret) pc.turret.rotation.y = v.angles[k] || 0; k++; }
        if (!alive) continue;
        if (pc.spin) {
          if (pc.spin.wheel) pc.spin.node.rotation.z = -v.odo / pc.spin.node.position.y;
          else if (pc.type === 'saw') pc.spin.node.rotation.y = sawing ? t * 42 : t * 6;
          else pc.spin.node.rotation.y = t * 2.4;
        }
        if (pc.flame) { pc.flame.visible = !!boosting; if (boosting) pc.flame.scale.set(0.75 + 0.35 * Math.sin(t * 70 + i), 1, 1); }
      }
      const sh = v.shield > 0;
      o.bubble.visible = sh;
      if (sh) { const r = v.com.r + 0.4; o.bubble.scale.set(r, r * 0.62, r); o.bubble.position.y = 0.35; o.bubble.rotation.y = t * 0.3; o.b1.material.opacity = 0.05 + Math.min(0.09, v.shield / 1400); }
    });

    // projectiles
    let nb = 0, ns = 0, nm = 0, nl = 0;
    d.scale.set(1, 1, 1);
    for (const p of view.projectiles) {
      d.rotation.set(0, p.ang, 0);
      if (p.kind === 0 && nb < 400) { d.position.set(p.x, 0.72, -p.y); d.updateMatrix(); w.tracers.setMatrixAt(nb, d.matrix); w.tracers.setColorAt(nb++, col.setHex(p.team === 0 ? 0xffb055 : 0x7fd4ff).convertSRGBToLinear()); }
      else if (p.kind === 1 && ns < 80) { d.position.set(p.x, 0.75, -p.y); d.updateMatrix(); w.shells.setMatrixAt(ns++, d.matrix); }
      else if (p.kind === 2 && nm < 60) { d.position.set(p.x, 1.0, -p.y); d.updateMatrix(); w.missiles.setMatrixAt(nm++, d.matrix); }
      else if (p.kind === 3 && nl < 24) {
        d.position.set(p.x, 0.8 + p.h, -p.y); d.updateMatrix(); w.lobs.setMatrixAt(nl, d.matrix);
        d.position.set(p.x, 0.03, -p.y); d.rotation.set(0, 0, 0); d.updateMatrix(); w.lobShadows.setMatrixAt(nl++, d.matrix);
      }
    }
    w.tracers.count = nb; w.shells.count = ns; w.missiles.count = nm; w.lobs.count = nl; w.lobShadows.count = nl;
    for (const m of [w.tracers, w.shells, w.missiles, w.lobs, w.lobShadows]) m.instanceMatrix.needsUpdate = true;
    if (w.tracers.instanceColor) w.tracers.instanceColor.needsUpdate = true;

    // smoke trails
    let sn = 0;
    d.rotation.set(0, 0, 0);
    for (const s of view.trails) {
      if (sn >= 300) break;
      const k = clamp(s.age / 0.3, 0, 1), sc = 0.5 + k * 1.3;
      d.position.set(s.x + (hash01(sn) - 0.5) * 0.1, (s.kind === 3 ? 0.8 + s.h : 1.0) + k * 0.25, -s.y); d.scale.setScalar(sc * (1 - k * 0.55)); d.updateMatrix();
      w.smoke.setMatrixAt(sn++, d.matrix);
    }
    w.smoke.count = sn; w.smoke.instanceMatrix.needsUpdate = true;

    // beams (lasers, repair) + rail flashes
    let bi = 0, fi = 0;
    const beam = (x1, y1, x2, y2, color, width, opacity, h) => {
      if (bi >= w.beams.length) return;
      const m = w.beams[bi++], len = Math.hypot(x2 - x1, y2 - y1);
      m.visible = true; m.position.set((x1 + x2) / 2, h, -(y1 + y2) / 2); m.rotation.y = Math.atan2(y2 - y1, x2 - x1);
      m.scale.set(len, width, width); m.material.color.setHex(color).convertSRGBToLinear(); m.material.opacity = opacity;
    };
    const flash = (x, y, h, size, color, opacity) => {
      if (fi >= w.flashes.length) return;
      const s = w.flashes[fi++]; s.visible = true; s.position.set(x, h, -y); s.scale.set(size, size, 1); s.material.color.setHex(color).convertSRGBToLinear(); s.material.opacity = opacity;
    };
    for (const b of view.beams) {
      const c = b[4] === 2 ? 0x6dffb0 : b[5] === 0 ? 0xff8a50 : 0x66d4ff;
      beam(b[0], b[1], b[2], b[3], c, 0.07, 0.95, 0.72); beam(b[0], b[1], b[2], b[3], c, 0.2, 0.25, 0.72);
      if (b[4] !== 2) flash(b[2], b[3], 0.72, 0.9 + 0.3 * Math.sin(t * 50), c, 0.8);
    }
    for (const f of view.flashes) {
      const sz = f.kind === 0 ? 0.8 : f.kind === 1 ? 1.9 : f.kind === 3 ? 2.2 : 1.4;
      flash(f.x, f.y, f.kind === 3 ? 1.1 : 0.75, sz, f.kind === 0 ? 0xffe2a8 : 0xffc070, 0.95);
    }
    let oi = 0, ri = 0, di = 0;
    const boom = (x, y, r, age, life, color, h = 0.6) => {
      if (oi >= w.booms.length) return;
      const m = w.booms[oi++], k = age / life, s = r * (0.3 + 0.7 * (1 - (1 - k) * (1 - k)));
      m.visible = true; m.position.set(x, h, -y); m.scale.set(s, s * 0.8, s); m.material.color.setHex(color).convertSRGBToLinear(); m.material.opacity = 0.7 * (1 - k) * (1 - k);
    };
    const ring = (x, y, r, age, life, color, op = 0.9) => {
      if (ri >= w.rings.length) return;
      const m = w.rings[ri++], k = age / life, s = r * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      m.visible = true; m.position.set(x, 0.08, -y); m.scale.set(s, s, s); m.material.color.setHex(color).convertSRGBToLinear(); m.material.opacity = op * (1 - k);
    };
    for (const e of view.fx) {
      const age = t - e.t;
      if (e.k === 'rail' && age < 0.45) { const k = 1 - age / 0.45; beam(e.x1, e.y1, e.x2, e.y2, 0xd6f1ff, 0.05 + 0.14 * k, k, 0.72); beam(e.x1, e.y1, e.x2, e.y2, e.team === 0 ? 0xff9a50 : 0x66c8ff, 0.4 * k, 0.3 * k, 0.72); if (age < 0.12) flash(e.x1, e.y1, 0.75, 2.4, 0xbfe9ff, 1); }
      else if (e.k === 'boom' && age < 0.55) { boom(e.x, e.y, e.r * 1.15, age, 0.55, 0xffb347); if (age < 0.4) ring(e.x, e.y, e.r * 1.5, age, 0.4, 0xffd9a0, 0.6); if (age < 0.1) flash(e.x, e.y, 0.8, e.r * 3.2, 0xfff0c8, 1); }
      else if (e.k === 'death' && age < 1.3) { boom(e.x, e.y, 3.4, age, 1.3, 0xff8b2b, 0.9); if (age < 0.6) boom(e.x, e.y, 1.9, age, 0.6, 0xfff3c4, 0.9); ring(e.x, e.y, 6, age, 1.0, TEAM_HEX[e.team], 0.8); if (age < 0.16) flash(e.x, e.y, 1, 9, 0xfff0c8, 1); }
      else if (e.k === 'spark' && age < 0.2) flash(e.x, e.y, 0.8, 1.1 * (1 - age / 0.2), 0x9ad7ff, 0.9);
      else if (e.k === 'ram' && age < 0.25) flash(e.x, e.y, 0.5, (0.9 + Math.min(1.6, e.d / 50)) * (1 - age / 0.25), 0xfff3c4, 0.9);
      else if (e.k === 'pickup' && age < 0.5) ring(e.x, e.y, 1.6, age, 0.5, 0x6dffb0);
      else if (e.k === 'emp' && age < 0.8) { ring(e.x, e.y, e.r, age, 0.8, 0xc084fc); ring(e.x, e.y, e.r * 0.7, age, 0.8, 0xe9d5ff, 0.5); }
      else if (e.k === 'debris' && age < 1.5) {
        // popped bricks: tumble out, bounce once, come to rest and fade by shrinking
        for (let j = 0; j < e.n && di < 240; j++) {
          const a = hash01(e.seed * 7 + j) * 6.283, sp = 1.2 + hash01(e.seed * 13 + j) * 2.6, up = 2.6 + hash01(e.seed * 17 + j) * 2.4;
          const tf = (up + Math.sqrt(up * up + 2 * 9.8 * e.h)) / 9.8; // time to first landing
          let y, travel = sp * Math.min(age, tf + 0.25);
          if (age < tf) y = e.h + up * age - 4.9 * age * age;
          else { const b = age - tf, ub = up * 0.3; y = Math.max(0, ub * b - 4.9 * b * b); }
          const spin = Math.min(age, tf + 0.2);
          d.position.set(e.x + Math.cos(a) * travel, y + 0.08, -(e.y + Math.sin(a) * travel));
          d.rotation.set(spin * (5 + j), spin * 7, spin * (3 + j * 2)); d.scale.setScalar(age > 1.1 ? Math.max(0, (1.5 - age) / 0.4) : 1); d.updateMatrix();
          w.debris.setMatrixAt(di, d.matrix); w.debris.setColorAt(di++, col.setHex(e.color[j % e.color.length]).convertSRGBToLinear());
        }
      }
    }
    for (; bi < w.beams.length; bi++) w.beams[bi].visible = false;
    for (; fi < w.flashes.length; fi++) w.flashes[fi].visible = false;
    for (; oi < w.booms.length; oi++) w.booms[oi].visible = false;
    for (; ri < w.rings.length; ri++) w.rings[ri].visible = false;
    w.debris.count = di; w.debris.instanceMatrix.needsUpdate = true; if (w.debris.instanceColor) w.debris.instanceColor.needsUpdate = true;

    // items, mines, zone
    w.items.forEach((g, i) => {
      const it = view.items[i];
      g.visible = !!it; if (!it) return;
      g.position.set(it.x, 0, -it.y);
      g.userData.s.material = w.itemMats[it.type]; g.userData.s.position.y = 1.35 + Math.sin(t * 2.4 + it.s) * 0.15;
      g.userData.beam.material.color.set(this.IY.ITEMS[it.type].color).convertSRGBToLinear();
    });
    w.mines.forEach((m, i) => {
      const mn = view.mines[i];
      m.visible = !!mn; if (!mn) return;
      m.position.set(mn.x, 0, -mn.y); m.userData.led.visible = Math.sin(t * 10 + i) > 0;
      m.userData.led.material.color.setHex(TEAM_HEX[mn.team]).convertSRGBToLinear();
    });
    const zr = view.zoneR, zon = zr < w.rp.zone.radius0 - 0.5;
    w.zone.visible = w.zring.visible = zon;
    if (zon) { w.zone.scale.set(zr, 1, zr); w.zring.scale.set(zr, zr, 1); w.zone.material.opacity = 0.12 + 0.05 * Math.sin(t * 3); }

    // camera (eased by wall-clock time so it behaves the same at any frame rate)
    const c = this.cam;
    const now = performance.now(), fdt = Math.min(0.25, (now - (this.lastDraw || now)) / 1000);
    this.lastDraw = now;
    const jumped = Math.abs(view.t - (this.lastT ?? view.t)) > 1.5; this.lastT = view.t;
    if (this.follow >= 0) {
      const v = view.vehicles[this.follow];
      if (v && v.alive) { const k = jumped ? 1 : 1 - Math.exp(-fdt * 7); c.tx += (v.x - c.tx) * k; c.tz += (-v.y - c.tz) * k; }
    } else if (this.mode === 'auto') {
      // director: keep every living vehicle in frame, as close as that allows
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
      for (const v of view.vehicles) if (v.alive) { n++; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      if (n) {
        const span = Math.max(x1 - x0, (y1 - y0) * 1.25);
        const want = clamp(span * 1.2 + 15, 17, this.fitDist || 80);
        const k = view.t < 0.3 || jumped ? 1 : 1 - Math.exp(-fdt * 2.2);
        c.tx += ((x0 + x1) / 2 - c.tx) * k; c.tz += (-(y0 + y1) / 2 - c.tz) * k; c.dist += (want - c.dist) * k;
      }
    }
    const sp = Math.sin(c.pol), cp = Math.cos(c.pol);
    this.camera.position.set(c.tx + c.dist * sp * Math.sin(c.az), c.dist * cp, c.tz + c.dist * sp * Math.cos(c.az));
    this.camera.lookAt(c.tx, 0.4, c.tz);
    { let lo = 0, hi = w.burnT.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (w.burnT[mid] <= t) lo = mid + 1; else hi = mid; } w.burns.count = lo; }
    w.arena.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.world) { disposeTree(this.world.root); this.world.arena.dispose(); }
    this.renderer.dispose();
    this.canvas.remove();
  }
}

function disposeTree(root) {
  root.traverse((o) => { if (o.isInstancedMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
}

function iconTexture(icon, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,16,26,0.86)'; x.beginPath(); x.arc(64, 64, 56, 0, 6.3); x.fill();
  x.lineWidth = 7; x.strokeStyle = color; x.stroke();
  x.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(icon, 64, 70);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

/** Garage turntable: one vehicle on a round baseplate, plus thumbnails for the palette. */
export class Preview3D {
  constructor(host, IY, kit) {
    this.IY = IY; this.host = host; this.kit = kit;
    const r = (this.renderer = makeRenderer());
    this.canvas = r.domElement; this.canvas.className = 'preview-canvas';
    host.appendChild(this.canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1a29);
    this.env = makeEnvironment(r);
    this.scene.environment = this.env;
    this.mats = Kit.materials(this.env);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xdcebff, 0x2a2f38, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.2);
    sun.position.set(5, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    const tex = studTextures();
    tex.albedo.wrapS = tex.albedo.wrapT = tex.normal.wrapS = tex.normal.wrapT = THREE.RepeatWrapping;
    tex.albedo.repeat.set(4, 4); tex.normal.repeat.set(4, 4);
    const plate = (this.plate = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 48), [
      new THREE.MeshStandardMaterial({ color: L(0x3d4a59), roughness: 0.5, envMap: this.env, envMapIntensity: 0.3 }),
      new THREE.MeshStandardMaterial({ color: L(0x4a5a6c), roughness: 0.5, map: tex.albedo, normalMap: tex.normal, envMap: this.env, envMapIntensity: 0.3 }),
      new THREE.MeshStandardMaterial({ color: L(0x3d4a59) })]));
    plate.position.y = -0.15; plate.receiveShadow = true; this.scene.add(plate);
    this.spin = new THREE.Group(); this.scene.add(this.spin);
    this.az = 0.7; this.pol = 1.0; this.dist = 11; this.auto = true; this.vehicle = null;
    const el = this.canvas; let last = null;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; this.auto = false; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    el.addEventListener('pointermove', (e) => { if (!last) return; this.az -= (e.clientX - last.x) * 0.008; if (e.pointerType === 'mouse') this.pol = clamp(this.pol - (e.clientY - last.y) * 0.006, 0.15, 1.45); last = { x: e.clientX, y: e.clientY }; });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), 5, 22); }, { passive: false });
    this.resize();
  }

  resize() {
    const w = Math.max(40, this.host.clientWidth), h = Math.max(40, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setDesign(design, team = 0) {
    if (this.vehicle) this.spin.remove(this.vehicle.root);
    this.vehicle = null;
    const parts = design.parts.filter((p) => this.IY.PARTS[p.type]);
    if (!parts.length) return;
    const solid = parts.filter((p) => !this.IY.PARTS[p.type].decor);
    const a = this.IY.aggregate(solid.length ? solid : parts);
    const v = (this.vehicle = this.kit.vehicle({ ...design, parts }, team, this.mats));
    v.body.position.set(-a.comU, 0, a.comV);
    v.root.rotation.y = Math.PI / 2; // nose toward the camera's left-front
    this.spin.add(v.root);
    this.radius = Math.max(1.4, a.radius);
  }

  render(t) {
    if (this.auto) this.az += 0.006;
    const want = clamp(this.radius * 3.4 + 2.5, 6, 20);
    this.dist += (want - this.dist) * 0.08;
    if (this.vehicle) for (const pc of this.vehicle.pieces) { if (pc.spin && !pc.spin.wheel) pc.spin.node.rotation.y = t * (pc.type === 'saw' ? 6 : 2.4); }
    const sp = Math.sin(this.pol), cp = Math.cos(this.pol);
    this.camera.position.set(this.dist * sp * Math.sin(this.az), this.dist * cp + 0.5, this.dist * sp * Math.cos(this.az));
    this.camera.lookAt(0, 0.45, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Render one PNG data URL per piece type for the palette. */
  thumbnails(types, size = 132) {
    const out = {}, IY = this.IY;
    const keep = { w: this.host.clientWidth, h: this.host.clientHeight, bg: this.scene.background };
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1); this.renderer.setSize(size, size, false);
    this.camera.aspect = 1; this.camera.updateProjectionMatrix();
    this.plate.visible = false; this.spin.visible = false;
    this.scene.background = new THREE.Color(0x2b4259);
    const holder = new THREE.Group(); this.scene.add(holder);
    for (const type of types) {
      const def = IY.PARTS[type], z = def.layer === 'chassis' ? 0 : 1;
      const [w, l] = def.size;
      const pc = this.kit.piece({ type, x: -(w - 1) / 2, y: -(l - 1) / 2, z, dir: 'N' }, 0, 'yellow', this.mats, false);
      pc.node.position.set(0, -(z ? 0.48 : 0.16) - 0.12, 0);
      if (pc.flame) pc.flame.visible = true;
      holder.add(pc.node);
      const span = Math.max(w, l) * S + 0.35, dist = span * 2.9 + 0.6;
      this.camera.position.set(dist * 0.62, dist * 0.6, dist * 0.52); this.camera.lookAt(0, 0.12, 0);
      this.renderer.render(this.scene, this.camera);
      out[type] = this.canvas.toDataURL('image/png');
      holder.remove(pc.node);
    }
    this.scene.remove(holder);
    this.plate.visible = true; this.spin.visible = true; this.scene.background = keep.bg;
    this.renderer.setPixelRatio(pr);
    this.resize();
    return out;
  }

  dispose() { this.renderer.dispose(); this.canvas.remove(); }
}
