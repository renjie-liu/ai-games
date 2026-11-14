// Top-down canvas view: the tactical map, and the fallback when WebGL is unavailable.
const TEAM = ['#ff8b2b', '#4cc3ff'];
const TILE_COL = { floor: ['#22354a', '#263b52'], wall: ['#7b8fa3', '#8598ab'], barrier: ['#c9a13a', '#c9a13a'], mud: ['#5a4630', '#65503a'],
  ice: ['#9fd2e8', '#b4e0f2'], lava: ['#ff5a1f', '#ff7a3a'], pad: ['#2f7a55', '#2f7a55'] };
const PART_COL = { structure: null, mobility: '#1b2027', weapon: '#c9d1d9', utility: '#ffd166', decor: '#f2f3f2' };

export class Render2D {
  constructor(host, IY) {
    this.IY = IY; this.host = host; this.follow = -1; this.mode = 'auto'; this.onMode = null;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arena-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(50, this.host.clientWidth); this.h = Math.max(50, this.host.clientHeight);
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.dpr = dpr;
    this.fit();
  }
  fit() {
    if (!this.rp) return;
    const m = this.rp.map, pad = 10;
    this.s = Math.min((this.w - pad * 2) / m.width, (this.h - pad * 2) / m.height);
    this.ox = (this.w - m.width * this.s) / 2; this.oy = (this.h + m.height * this.s) / 2;
  }
  setPreset(name) { this.mode = name; this.fit(); }
  project(x, y) { return { x: this.ox + x * this.s, y: this.oy - y * this.s, ok: true }; }
  load(rp) {
    this.rp = rp; this.fit();
    const m = rp.map, IY = this.IY, T = IY.TILE, px = 16;
    const off = (this.mapImg = document.createElement('canvas'));
    off.width = m.w * px; off.height = m.h * px;
    const c = off.getContext('2d');
    c.fillStyle = '#05090f'; c.fillRect(0, 0, off.width, off.height);
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const id = IY.TILE_NAME[m.tiles[ty * m.w + tx]];
      if (id === 'pit') continue;
      c.fillStyle = TILE_COL[id][(tx + ty) % 2];
      c.fillRect(tx * px, (m.h - 1 - ty) * px, px, px);
      if (id === 'pad') { c.fillStyle = '#6dffb0'; c.fillRect(tx * px + 6, (m.h - 1 - ty) * px + 2, 4, 12); c.fillRect(tx * px + 2, (m.h - 1 - ty) * px + 6, 12, 4); }
    }
  }
  draw(view) {
    const rp = this.rp; if (!rp) return;
    const x = this.ctx, IY = this.IY, s = this.s, m = rp.map, t = view.t;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = '#0a1420'; x.fillRect(0, 0, this.w, this.h);
    x.imageSmoothingEnabled = false;
    x.drawImage(this.mapImg, this.ox, this.oy - m.height * s, m.width * s, m.height * s);
    const P = (wx, wy) => [this.ox + wx * s, this.oy - wy * s];
    // zone
    if (view.zoneR < rp.zone.radius0 - 0.5) {
      const [cx, cy] = P(m.center.x, m.center.y);
      x.save(); x.beginPath(); x.rect(0, 0, this.w, this.h); x.arc(cx, cy, view.zoneR * s, 0, 6.3, true);
      x.fillStyle = 'rgba(255,77,77,0.16)'; x.fill('evenodd'); x.restore();
      x.strokeStyle = 'rgba(255,77,77,0.8)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, view.zoneR * s, 0, 6.3); x.stroke();
    }
    for (const sp of m.itemSpawns) { const [a, b] = P(sp.x, sp.y); x.strokeStyle = 'rgba(143,166,189,0.4)'; x.lineWidth = 1; x.beginPath(); x.arc(a, b, 0.6 * s, 0, 6.3); x.stroke(); }
    for (const mn of view.mines) { const [a, b] = P(mn.x, mn.y); x.fillStyle = '#30363d'; x.beginPath(); x.arc(a, b, 0.35 * s, 0, 6.3); x.fill(); x.fillStyle = TEAM[mn.team]; x.beginPath(); x.arc(a, b, 0.12 * s, 0, 6.3); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${Math.max(11, 1.3 * s)}px sans-serif`;
    for (const it of view.items) { const [a, b] = P(it.x, it.y); x.fillStyle = 'rgba(8,16,26,0.85)'; x.beginPath(); x.arc(a, b, 0.8 * s, 0, 6.3); x.fill(); x.fillStyle = '#fff'; x.fillText(IY.ITEMS[it.type].icon, a, b + 1); }
    // vehicles
    const cell = IY.CELL * s;
    view.vehicles.forEach((v, id) => {
      const [cx, cy] = P(v.x, v.y);
      if (!v.alive) { x.fillStyle = 'rgba(5,8,12,0.7)'; x.beginPath(); x.arc(cx, cy, 1.4 * s, 0, 6.3); x.fill(); return; }
      x.save(); x.translate(cx, cy); x.rotate(-v.th);
      const parts = rp.vehicles[id].parts;
      // chassis first, then the deck on top; every piece is its stud footprint
      for (let z = 0; z < 2; z++) for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.z !== z || t >= v.deathT[i]) continue;
        const d = IY.PARTS[p.type], [w, l] = IY.dimsOf(p.type, p.dir), [pcx, pcy] = IY.centerOf(p);
        const u = (pcy * IY.CELL - v.com.u) * s, lft = (-pcx * IY.CELL - v.com.v) * s;
        const hw = (w * cell) / 2, hl = (l * cell) / 2, inset = d.decor ? cell * 0.22 : 0.5;
        x.fillStyle = p.type === 'core' ? '#fff' : d.armor ? '#8d99a6' : PART_COL[d.cat] || TEAM[v.team];
        x.globalAlpha = z === 0 && d.cat === 'structure' ? 0.62 : 1;
        x.fillRect(u - hl + inset, -lft - hw + inset, l * cell - inset * 2, w * cell - inset * 2);
        x.globalAlpha = 1;
        if (p.type === 'core') { x.fillStyle = TEAM[v.team]; x.fillRect(u - cell / 4, -lft - cell / 4, cell / 2, cell / 2); }
      }
      // turrets
      const widx = rp.vehicles[id].weaponIdx;
      x.strokeStyle = '#0a1420'; x.lineWidth = Math.max(1, cell * 0.22);
      widx.forEach((pi, k) => {
        if (t >= v.deathT[pi]) return;
        const p = parts[pi], [pcx, pcy] = IY.centerOf(p);
        const u = (pcy * IY.CELL - v.com.u) * s, l = (-pcx * IY.CELL - v.com.v) * s;
        const a = IY.DIR_ANGLE[p.dir] + (v.angles[k] || 0), len = cell * (p.type === 'railgun' ? 1.9 : 1.3);
        x.beginPath(); x.moveTo(u, -l); x.lineTo(u + Math.cos(a) * len, -l - Math.sin(a) * len); x.stroke();
      });
      x.restore();
      if (v.shield > 0) { x.strokeStyle = 'rgba(124,200,255,0.75)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, (v.com.r + 0.35) * s, 0, 6.3); x.stroke(); }
      if (v.flags & 4) { x.strokeStyle = '#c084fc'; x.lineWidth = 2; x.setLineDash([3, 3]); x.beginPath(); x.arc(cx, cy, (v.com.r + 0.1) * s, 0, 6.3); x.stroke(); x.setLineDash([]); }
    });
    // shots
    for (const p of view.projectiles) {
      const [a, b] = P(p.x, p.y);
      x.fillStyle = p.kind === 0 ? '#ffe08a' : p.kind === 1 ? '#ffa24d' : p.kind === 3 ? '#11161c' : '#ffffff';
      x.beginPath(); x.arc(a, b, (p.kind === 0 ? 0.1 : p.kind === 1 ? 0.2 : p.kind === 3 ? 0.22 + p.h * 0.05 : 0.24) * s + 0.6, 0, 6.3); x.fill();
      if (p.kind === 3) { x.strokeStyle = '#ffb347'; x.lineWidth = 1; x.stroke(); }
    }
    const line = (x1, y1, x2, y2, col, w, al) => { const [a, b] = P(x1, y1), [c, d] = P(x2, y2); x.globalAlpha = al; x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); x.globalAlpha = 1; };
    for (const b of view.beams) line(b[0], b[1], b[2], b[3], b[4] === 2 ? '#6dffb0' : TEAM[b[5]], 2, 0.9);
    for (const e of view.fx) {
      const age = t - e.t;
      const ring = (r, life, col) => { if (age > life) return; const [a, b] = P(e.x, e.y); x.globalAlpha = 1 - age / life; x.fillStyle = col; x.beginPath(); x.arc(a, b, Math.max(1, r * (0.3 + 0.7 * age / life) * s), 0, 6.3); x.fill(); x.globalAlpha = 1; };
      if (e.k === 'rail' && age < 0.4) line(e.x1, e.y1, e.x2, e.y2, '#d6f1ff', 3, 1 - age / 0.4);
      else if (e.k === 'boom') ring(e.r, 0.5, '#ffb347');
      else if (e.k === 'death') ring(3, 1, '#ff8b2b');
      else if (e.k === 'ram') ring(0.5, 0.3, '#fff3c4');
      else if (e.k === 'emp' && age < 0.7) { const [a, b] = P(e.x, e.y); x.globalAlpha = 1 - age / 0.7; x.strokeStyle = '#c084fc'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, e.r * (age / 0.7) * s, 0, 6.3); x.stroke(); x.globalAlpha = 1; }
    }
  }
  dispose() { this.canvas.remove(); }
}
