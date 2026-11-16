// Astra: sustained-fire assault car with a protected low cockpit.
const meta = {name:'Astra — Starforge',author:'gpt-6-astra',model:'gpt-6-astra',revision:'v2', editor:'Codex', notes:'Compact-arena aft cockpit and pursuit-aware spacing; balanced touring chassis for larger maps, component targeting and team focus.'};
function design(ctx,api){
 const p=[], put=(type,x,y,z,dir='N')=>p.push({type,x,y,z,dir});
 const light=ctx.budget<1100,heavy=ctx.budget>=1700;
 for(const x of [-3,3])for(const y of [-1,1])put('bigwheel',x,y,0);
 put('core',0,0,0);
 for(const x of [-1,0,1])put('reactor',x,-1,0);
 for(let x=-2;x<=2;x++)for(let y=-1;y<=2;y++){
  if(y===-1||y<2)continue;
  if(x===-2||x===1)put('plate2',x,y,0,'E');else if(x===0)put('plate',x,y,0);
 }
 put('plate4',-2,0,0);put('plate4',1,0,0);
 for(const x of [-3,-2,-1,1,2,3]){put('mg',x,1,1);put('slope',x,2,1);}
 put('armor',0,2,1);put('armor',0,1,0);put('armor',0,0,1);
 if(light){
  // The light chassis preserves four-wheel mobility and a four-gun battery.
  for(let i=p.length-1;i>=0;i--)if((p[i].type==='mg'&&Math.abs(p[i].x)===1)||(p[i].type==='slope'&&Math.abs(p[i].x)<=1)||(p[i].type==='reactor'&&p[i].x!==0)||p[i].type==='armor')p.splice(i,1);
 }
 if(heavy){
  put('shieldgen',-1,0,1);put('repairer',1,0,1);put('reactor',0,1,1);
  put('plate',0,-2,0);put('repairer',0,-2,1);
  for(const x of [-2,2]){put('plate',x,-1,0);put('armor',x,0,1);}
  put('reactor',0,-3,0);put('radar',0,-3,1);
 }
 // Compact arenas reward a tucked-back cockpit; keep the balanced touring chassis on large maps.
 if(!light&&!heavy&&Math.min(api.map.width,api.map.height)<=40){
  for(const q of p){
   if(q.type==='core')q.y=-1;
   else if(q.type==='reactor'&&q.x===0)q.y=0;
   else if(q.type==='armor'&&q.x===0&&q.y===0&&q.z===1)q.y=-1;
  }
 }
 return {name:'Astra Starforge',paint:{accent:'purple'},parts:p};
}
let route,lock=-1,mark=-1,until=0,lastX=0,lastY=0,lastT=0,stuck=0;
const MOV={wheel:1,bigwheel:1,track:1,hover:1,thruster:1};
const WEAP={mg:1,cannon:1,laser:1,railgun:1,missile:1,mortar:1,saw:1,piston:1,flamer:1,harpoon:1};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function aimPart(s,e,api){
 const ps=e.parts.filter(p=>p.alive), core=ps.find(p=>p.type==='core');
 if(!core)return e;
 // Trace occupied stud columns to estimate the effective work to expose a component.
 const cells=[]; const fx=Math.cos(e.heading),fy=Math.sin(e.heading);
 for(const p of ps){const z=api.parts[p.type].size,w=(p.dir==='E'||p.dir==='W')?z[1]:z[0],h=(p.dir==='E'||p.dir==='W')?z[0]:z[1];
  for(let a=0;a<w;a++)for(let b=0;b<h;b++){
   const dx=(a-(w-1)/2)*.4,dy=(b-(h-1)/2)*.4;
   cells.push({x:p.wx+fy*dx+fx*dy,y:p.wy-fx*dx+fy*dy,p});
  }
 }
 let best=core,bs=Infinity;
 for(const q of ps){
  if(q.type!=='core'&&!WEAP[q.type]&&!MOV[q.type]&&q.type!=='reactor'&&q.type!=='shieldgen')continue;
  const dx=q.wx-s.x,dy=q.wy-s.y,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
  const hits=new Map();
  for(const c of cells){const ax=c.x-s.x,ay=c.y-s.y,t=ax*ux+ay*uy,d=Math.abs(ax*uy-ay*ux);if(t>0&&t<L+.22&&d<.235)hits.set(c.p.i,c.p);}
  let cost=0;
  for(const p of hits.values()){
   const def=api.parts[p.type];let mul=1;
   if(p.type==='slope'){
    const da={N:0,S:Math.PI,E:-Math.PI/2,W:Math.PI/2}[p.dir];
    if(Math.cos(Math.atan2(dy,dx)-e.heading-da)<-.5)mul=.45;
   }
   cost+=(p.hp??(p.hpFrac??1)*def.hp)/Math.max(.25,mul-(def.armor||0)/4);
  }
  let value=q.type==='core'?2.0:q.type==='reactor'?1.4:q.type==='shieldgen'?1.1:WEAP[q.type]?1.4:MOV[q.type]?0.65:1;
  if(e.hovering&&q.type==='hover')value=4;
  if(WEAP[q.type]&&['saw','piston','flamer','keg'].includes(q.type))value=2.5;
  const sc=cost/value+(q.i===mark&&e.id===lock?-30:0);
  if(sc<bs){bs=sc;best=q;}
 }
 mark=best.i;lock=e.id;return {x:best.wx,y:best.wy};
}
function tick(state,api){
 const s=state.self,U=api.util,N=api.nav;route??=N.follower({lavaCost:200,mudCost:1.4,iceCost:1.5});
 let e=null,bs=Infinity;
 for(const q of state.enemies){let z=U.dist(s,q)+q.coreFrac*4+(N.los(s.x,s.y,q.x,q.y)?0:8);for(const m of state.messages)if(m.data&&m.data.focus===q.id)z-=4;if(z<bs){e=q;bs=z;}}
 let cmd={fire:false,aims:{},repair:s.energy>25,shield:true};
 let goal=e||state.lastSeen.filter(q=>q.alive).sort((a,b)=>U.dist(s,a)-U.dist(s,b))[0]||api.map.center;
 let d=e?U.dist(s,e):999, combat=false;
 if(e){
  cmd.say={focus:e.id};cmd.target=e.id;
  const tp=aimPart(s,e,api),lead=U.lead(s,{x:tp.x,y:tp.y,vx:e.vx,vy:e.vy},28);
  cmd.aim=lead;
  const los=N.los(s.x,s.y,e.x,e.y);
  cmd.fire=los&&d<14;
  const close=e.parts.some(p=>p.alive&&['saw','piston','flamer','spike','plow','keg'].includes(p.type));
  const laser=e.parts.some(p=>p.alive&&p.type==='laser');
  const compact=Math.min(api.map.width,api.map.height)<=40&&api.rules.budget>=1100&&api.rules.budget<1700;
  const keep=compact?(close?11:laser?12:4.5):(close?10:4.5);
  if(los&&d<15){
   const a=U.angleTo(s,lead),err=U.angDiff(a,s.heading);
   cmd.steer=clamp(err*2.0-s.angVel*.55,-1,1);
   // Match an approaching threat's velocity as well as its distance.
   const pursuit=(close||laser)?e.vx*Math.cos(s.heading)+e.vy*Math.sin(s.heading):0;
   const desired=compact?clamp((d-keep)*1.5+pursuit,-8,6):clamp((d-keep)*1.5,-5,5);
   const vf=s.vx*Math.cos(s.heading)+s.vy*Math.sin(s.heading);
   cmd.throttle=Math.abs(err)<1.1?clamp((desired-vf)*.35,-1,1):0;
   cmd.brake=Math.abs(d-keep)<1?0.6:0;
   combat=true;
  }
  if(s.item)cmd.useItem=s.item.type==='emp'?d<7:s.item.type==='mine'&&d<7;
 }
 for(const i of state.items){const r=U.dist(s,i);if((i.type==='repair'&&s.hpFrac<.7&&r<13)||(!e&&r<8)){goal=i;combat=false;break;}}
 const zd=U.dist(s,state.zone);
 if(zd>state.zone.r-4){const k=Math.max(0,state.zone.r-7)/zd;goal={x:state.zone.x+(s.x-state.zone.x)*k,y:state.zone.y+(s.y-state.zone.y)*k};combat=false;}
 if(!combat){const wp=route.next(s,goal.x,goal.y,state.tick);Object.assign(cmd,U.driveTo(s,wp,{stopDist:.6}));}
 // Emergency braking considers both current drift and commanded acceleration.
 const hazard=(x,y)=>{const t=N.tileAt(x,y);return t==='pit'||t==='lava';};
 const hx=Math.cos(s.heading),hy=Math.sin(s.heading);
 if(!s.hovering&&!hazard(s.x,s.y)){
  for(const t of [.2,.4,.65])if(hazard(s.x+s.vx*t,s.y+s.vy*t)){cmd.brake=1;cmd.throttle=s.vx*hx+s.vy*hy>0?-1:1;return cmd;}
  const dir=Math.sign(cmd.throttle||0);
  if(dir&&!N.clear(s.x,s.y,s.x+hx*dir*2,s.y+hy*dir*2,{margin:.6,avoid:['lava']})){
   if(combat){cmd.throttle=0;cmd.brake=1;}
  }
 }
 const threat=U.threat(state,.8);
 if(threat&&threat.in<1.1&&N.clear(s.x,s.y,threat.away.x,threat.away.y,{margin:.8,avoid:['lava']}))Object.assign(cmd,U.driveTo(s,threat.away,{reverse:true}));
 return cmd;
}
