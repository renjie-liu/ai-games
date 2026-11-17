// v3 was iterated through Ironyard MCP; model records original authorship, editor records this revision.
const meta = {
  name: 'Astra — Siege Battery', author: 'gpt-6-astra', model: 'gpt-6-astra', revision: 'v3', editor: 'Codex',
  notes: 'Two cannons and two mortars on a compact chassis; aims splash at valuable components, shares focus and commits to clear escape lanes.',
};

// Compact, independent floor strips keep one lost support from dropping the whole battery.
// The guns face astern; forward drive opens distance without waiting for the hull to turn.
const STANDARD_PARTS = [
  {type: "bigwheel",x: -3,y: -2,z: 0,dir: "S"},
  {type: "bigwheel",x: -3,y: 0,z: 0,dir: "S"},
  {type: "bigwheel",x: 3,y: -2,z: 0,dir: "S"},
  {type: "bigwheel",x: 3,y: 0,z: 0,dir: "S"},
  {type: "plate2",x: -2,y: -2,z: 0,dir: "E"},
  {type: "plate2",x: 1,y: -2,z: 0,dir: "E"},
  {type: "plate2",x: -2,y: -1,z: 0,dir: "E"},
  {type: "plate2",x: 1,y: -1,z: 0,dir: "E"},
  {type: "plate2",x: -2,y: 0,z: 0,dir: "E"},
  {type: "plate2",x: 1,y: 0,z: 0,dir: "E"},
  {type: "plate",x: 0,y: -2,z: 0,dir: "S"},
  {type: "armor",x: 0,y: -1,z: 0,dir: "S"},
  {type: "core",x: 0,y: 0,z: 0,dir: "S"},
  {type: "reactor",x: -1,y: 1,z: 0,dir: "S"},
  {type: "reactor",x: 1,y: 1,z: 0,dir: "S"},
  {type: "mortar",x: -2,y: 0,z: 1,dir: "S"},
  {type: "mortar",x: 1,y: 0,z: 1,dir: "S"},
  {type: "cannon",x: -2,y: -2,z: 1,dir: "S"},
  {type: "plate",x: -2,y: -3,z: 0},
  {type: "slope",x: -2,y: -3,z: 1,dir: "S"},
  {type: "cannon",x: 2,y: -2,z: 1,dir: "S"},
  {type: "plate",x: 2,y: -3,z: 0},
  {type: "slope",x: 2,y: -3,z: 1,dir: "S"},
  {type: "slope",x: -1,y: -2,z: 1,dir: "S"},
  {type: "slope",x: 1,y: -2,z: 1,dir: "S"},
  {type: "gyro",x: 0,y: -2,z: 1},
  {type: "armor",x: 0,y: 0,z: 1}
];
function design(ctx) {
  let parts = STANDARD_PARTS.map(p => ({...p}));
  if (ctx.budget < 1200) {
    parts = parts.filter(p => p.type !== 'mortar' && p.type !== 'gyro' && !(p.type === 'reactor' && p.x === 1));
  } else if (ctx.budget >= 1800) {
    parts.push({type:'plate',x:0,y:1,z:0}, {type:'shieldgen',x:0,y:1,z:1},
      {type:'repairer',x:0,y:-1,z:1}, {type:'reactor',x:0,y:2,z:0}, {type:'armor',x:0,y:2,z:1});
  }
  return {name:'Astra — Siege Battery', paint:{accent:'purple'}, parts};
}

let route=null,escapePoint=null,escapeUntil=-1;
let targetId = -1;
let jamStart = 0, jamX = 0, jamY = 0, unstuckUntil = 0;
const PI = Math.PI;
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function diff(a, b) { let d = (a - b + 3 * PI) % (2 * PI) - PI; return d; }
function rangeOf(e) {
  let gun = 0, close = 0, bomb = 0, mortar = 0;
  for (const p of e.parts) {
    if (!p.alive) continue;
    if (p.type === 'mg' || p.type === 'laser' || p.type === 'cannon' || p.type === 'railgun' || p.type === 'missile') gun++;
    if (p.type === 'saw' || p.type === 'piston' || p.type === 'spike' || p.type === 'plow' || p.type === 'flamer' || p.type === 'harpoon') close++;
    if (p.type === 'keg') bomb++;
    if (p.type === 'mortar') mortar++;
  }
  return { gun, close, bomb, mortar };
}
function safe(state, api, cmd) {
  const s = state.self, nav = api.nav;
  const blast = api.util.threat(state);
  if (blast && blast.in < 1.5) Object.assign(cmd, api.util.driveTo(s, blast.away, { reverse: true }));
  if (s.hovering) return cmd;
  const f = Math.cos(s.heading), g = Math.sin(s.heading);
  const harmful = (x, y) => { const t = nav.tileAt(x, y); return t === 'pit' || t === 'lava'; };
  if (!harmful(s.x, s.y)) {
    for (const k of [0.25, 0.55, 0.85]) {
      if (harmful(s.x + s.vx * k, s.y + s.vy * k)) {
        cmd.throttle = s.vx * f + s.vy * g > 0 ? -1 : 1;
        cmd.brake = 1;
        return cmd;
      }
    }
    const sign = Math.sign(cmd.throttle || 0);
    if (sign) for (const d of [0.7, 1.4, 2.3]) for (const w of [-0.45, 0, 0.45]) {
      if (harmful(s.x + sign * f * d - g * w, s.y + sign * g * d + f * w)) {
        cmd.throttle = 0;
        cmd.brake = 0.5;
        return cmd;
      }
    }
  }
  return cmd;
}
function tick(state, api) {
  const s = state.self, U = api.util, nav = api.nav;
  route ??= nav.follower({ mudCost: 1.5, iceCost: 1.8, lavaCost: 120 });
  const cmd = { throttle: 0, steer: 0, brake: 0, fire: false, repair: s.energy > 45 };
  let foe = null, score = Infinity;
  for (const e of state.enemies) {
    const d = U.dist(s, e);
    const q = d + (e.id === targetId ? -3 : 0) + e.coreFrac * 3 + (nav.los(s.x, s.y, e.x, e.y) ? 0 : 6);
    if (q < score) { score = q; foe = e; }
  }
  targetId = foe ? foe.id : -1;
  if (foe && state.allies.length) {
    const leader = state.allies.every(a => !a.alive || a.slot > s.slot);
    if (leader) cmd.say = { focus: foe.id };
    else {
      const m = state.messages.find(m => m.data && m.data.focus !== undefined);
      const pick = m && state.enemies.find(e => e.id === m.data.focus);
      if (pick && U.dist(s, pick) < 22) foe = pick;
    }
  }
  let goal = foe;
  if (!goal) {
    let best = Infinity;
    for (const l of state.lastSeen) if (l.alive && U.dist(s, l) < best) { best = U.dist(s, l); goal = l; }
    goal ??= api.map.center;
  }
  const z = state.zone, zd = U.dist(s, z);
  const out = zd > z.r - (z.shrinking ? 6 : 3.5);
  if (out) {
    const k = Math.max(0, z.r * 0.45) / (zd || 1);
    goal = { x: z.x + (s.x - z.x) * k, y: z.y + (s.y - z.y) * k };
  }
  let d = Infinity, los = false;
  if (foe) {
    d = U.dist(s, foe);
    los = nav.los(s.x, s.y, foe.x, foe.y);
    const mark = foe.parts.find(p => p.type === "core" && p.alive) || foe;
    const tx = mark.wx ?? mark.x, ty = mark.wy ?? mark.y;
    const vx = foe.vx || 0, vy = foe.vy || 0;
    let tt = Math.hypot(tx - s.x, ty - s.y) / 28;
    const ox = tx - foe.x, oy = ty - foe.y, w = foe.angVel || 0;
    let aim = { x: tx, y: ty };
    for (let i = 0; i < 2; i++) {
      const a = w * tt, c = Math.cos(a), n = Math.sin(a);
      aim = { x: foe.x + vx * tt + ox * c - oy * n, y: foe.y + vy * tt + ox * n + oy * c };
      tt = Math.hypot(aim.x - s.x, aim.y - s.y) / 28;
    }
    cmd.aim = aim;
    cmd.fire=[];cmd.aims={};
    const shell = shellAim(foe,api);
    for(const w of s.weapons)if(w.alive){
      if(w.type==='mortar'){
        const target={x:shell.x,y:shell.y,vx:foe.vx,vy:foe.vy};
        cmd.aims[w.i]=U.lead(s,target,15);
        if(d>6&&d<24.5)cmd.fire.push(w.i);
      }else {cmd.aims[w.i]=U.lead(s,{x:tx,y:ty,vx,vy},w.projSpeed||28);if(los&&d<w.range+foe.radius)cmd.fire.push(w.i);}
    }
    cmd.target = foe.id;
    if (s.item && (s.item.type === 'emp' && d < 7 || s.item.type === 'mine' && d < 5)) cmd.useItem = true;
    if (goal === foe && d < 26) {
      const pr = rangeOf(foe);
      let hold = foe.parts.some(p=>p.alive && p.type==='laser') ? 14 : 10;
      if (pr.close) hold = 11;
      if (pr.bomb) hold = 11.5;
      if (pr.mortar && !pr.close) hold = 12;
      // The light loadout has no mortar; stay inside the reach of its surviving guns.
      const reach = Math.max(0, ...s.weapons.filter(w => w.alive).map(w => w.range));
      if (reach) hold = Math.min(hold, reach - 1);
      const bearing = U.angleTo(s, foe), away = bearing + PI;
      const err = diff(away, s.heading);
      cmd.steer = clamp(err * 2.5 - s.angVel * 0.35, -1, 1);
      const ux = (foe.x - s.x) / (d || 1), uy = (foe.y - s.y) / (d || 1);
      const closing = (foe.vx - s.vx) * -ux + (foe.vy - s.vy) * -uy;
      cmd.throttle = clamp((hold + Math.max(0, closing) * 0.35 - d) * 0.5, -1, 1);
      if (Math.abs(err) > 1.1) cmd.throttle = clamp(cmd.throttle, -0.25, 0.4);
      if (Math.abs(cmd.throttle) < 0.12) cmd.brake = 0.7;
      // If retreat is blocked, present the tail and hold position rather than rush a blade.
      if (cmd.throttle > 0) {
        const x = s.x + Math.cos(s.heading) * 3, y = s.y + Math.sin(s.heading) * 3;
        if (!nav.isOpen(x, y) || nav.tileAt(x, y) === 'lava') { cmd.throttle = 0; cmd.brake = 0.8; }
      }
      const blocked=!nav.clear(s.x,s.y,s.x+Math.cos(s.heading)*4,s.y+Math.sin(s.heading)*4,{margin:.7,avoid:['lava']});
      if(escapeUntil<state.t&&blocked&&d<hold+1){
        const a=U.angleTo(foe,s);let score=-Infinity;escapePoint=null;
        for(const offset of [0,.5,-.5,1,-1,1.5,-1.5,2,-2,2.6,-2.6]){
          const x=s.x+Math.cos(a+offset)*5,y=s.y+Math.sin(a+offset)*5;
          if(!nav.clear(s.x,s.y,x,y,{margin:.7,avoid:['lava']}))continue;
          const q=Math.hypot(x-foe.x,y-foe.y)-Math.max(0,Math.hypot(x-z.x,y-z.y)-z.r+4)*4-.1*Math.abs(offset);
          if(q>score){score=q;escapePoint={x,y};}
        }
        if(escapePoint)escapeUntil=state.t+1.3;
      }
      if(state.t<escapeUntil&&escapePoint)Object.assign(cmd,U.driveTo(s,escapePoint,{stopDist:.5}));
      return safe(state, api, cmd);
    }
  }
  // Collect useful supplies on the route, especially repairs when wounded.
  let ib = Infinity, item = null;
  for (const i of state.items) {
    const q = U.dist(s, i);
    const cap = i.type === 'repair' && s.hpFrac < 0.65 ? 22 : 6;
    if (q < cap && q < ib) { ib = q; item = i; }
  }
  if (item && !out && (!foe || d > 13 || item.type === 'repair')) goal = item;
  const wp = route.next(s, goal.x, goal.y, state.tick);
  Object.assign(cmd, U.driveTo(s, wp));
  if (state.t - jamStart > 1.2) {
    if (Math.hypot(s.x - jamX, s.y - jamY) < 0.5 && Math.abs(cmd.throttle) > 0.5) unstuckUntil = state.t + 0.8;
    jamStart = state.t; jamX = s.x; jamY = s.y;
  }
  if (state.t < unstuckUntil) { cmd.throttle = -1; cmd.steer = 1; }
  return safe(state, api, cmd);
}


function shellAim(e,api){
 const cells=new Map(),all=e.parts.filter(p=>p.alive);
 for(const p of all){const def=api.parts[p.type];if(def.decor)continue;const a=def.size;const[w,h]=(p.dir==='E'||p.dir==='W')?[a[1],a[0]]:a;
 for(let i=0;i<w;i++)for(let j=0;j<h;j++){const k=(p.x+i)+','+(p.y+j),dx=(i-(w-1)/2)*.4,dy=(j-(h-1)/2)*.4;const prev=cells.get(k);if(!prev||p.z>prev.p.z)cells.set(k,{p,x:p.wx+Math.sin(e.heading)*dx+Math.cos(e.heading)*dy,y:p.wy-Math.cos(e.heading)*dx+Math.sin(e.heading)*dy});}}
 let best={x:e.x,y:e.y},bs=-1;
 const values={core:6,mortar:2,laser:2,cannon:2,mg:1.3,railgun:2,reactor:1.6,shieldgen:1.5,repairer:1.4,hover:1.5,bigwheel:1,wheel:1,track:1,keg:2};
 const points=[...cells.values()];
 for(const q of points){let score=0;const hit=new Set();
 for(const c of points.map(c=>({c,d:Math.hypot(c.x-q.x,c.y-q.y)})).filter(x=>x.d<2).sort((a,b)=>a.d-b.d)){
 if(hit.has(c.c.p.i))continue;hit.add(c.c.p.i);if(hit.size>7)break;
 const p=c.c.p;score+=(values[p.type]||.12)*Math.min(1,46*(1-.65*c.d/2)/Math.max(1,p.hpFrac*api.parts[p.type].hp));
 }
 if(score>bs){bs=score;best=q;}}
 return best;
}
