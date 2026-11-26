// The voice partner in the room: what the hub shows it of the choice of supports and lets it do.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './world.mjs';
import {LiveHub} from './live.mjs';
import {braceAction} from './engine.mjs';

function setup(seed=5){
  const r=new Room({west:'human',east:'live'},{seed}),h=new LiveHub('.','http://127.0.0.1',true),j=h.get(r);
  Object.assign(j,{seat:'east',started:true,worker:{stdin:{writable:true,writableLength:0,write(){}}}});
  return {r,h,j};
}
const west=(r,command)=>{const x=r.command('west',command);assert.equal(x.ok,true,x.message);return x;};
// The partner acts on the ticket of its last look or result, as the worker has it do.
function partner(h,r,j){
  let have=h.observe(r,'east',j.scope);
  const look=()=>(have=h.observe(r,'east',j.scope)).view;
  const act=command=>{const x=h.command(r,'east',{ticket:have.ticket,command});have={ticket:x.ticket,view:x.view};return x;};
  return {look,act};
}
const idOf=(r,pick)=>braceAction(r.puzzle.supports.findIndex(pick));
// Up to the point where a support can go in: gate up on the brake, fan stopped.
function ready({r,h,j}){
  const east=partner(h,r,j);
  east.act({type:'action',id:'send-key'});west(r,{type:'accept',id:r.pending.id});
  west(r,{type:'action',id:'unlock'});west(r,{type:'action',id:'power-on'});
  east.look();east.act({type:'action',id:'hold-brake'});
  west(r,{type:'action',id:'power-off'});east.act({type:'accept',id:east.look().pending.id});
  return east;
}

test('the partner is shown its half of the choice and none of the other half',()=>{
  const {r,h,j}=setup(),p=r.puzzle,east=partner(h,r,j);
  const first=JSON.stringify(east.look());
  assert.ok(first.includes(`${p.tag}色检修牌`)&&first.includes(`${p.slot[0]} 到 ${p.slot[1]} 厘米`));
  assert.ok(!first.includes('公斤')&&!first.includes('承重表')&&!first.includes('charge'));
  west(r,{type:'action',id:'power-on'});
  const after=east.look();
  for(const s of p.supports)assert.ok(JSON.stringify(after.notes).includes(`刻着${s.mark}的长 ${s.length} 厘米`));
  assert.equal(after.local.support,null);
  assert.ok(!after.scene.some(o=>o.id==='chart'));
});
test('the partner proposes a support; it goes in when the player confirms',()=>{
  const state=setup(),{r}=state,east=ready(state);
  const offered=east.look().scene.find(o=>o.id==='fan').actions;
  assert.deepEqual(offered.map(a=>[a.id,a.shared]),r.puzzle.supports.map((_,i)=>[braceAction(i),true]));
  // The one that does not fit: refused with the reason, in the partner's own terms, and a new ticket.
  const long=east.act({type:'action',id:idOf(r,s=>!s.fits)});
  assert.equal(long.ok,false);assert.match(long.message,/太长，放不进/);assert.ok(long.ticket);assert.equal(r.pending,null);
  const proposed=east.act({type:'action',id:idOf(r,s=>s.holds)});
  assert.equal(proposed.receipt.outcome,'proposed');assert.equal(proposed.view.pending.from,'east');assert.equal(r.state.braced,false);
  west(r,{type:'accept',id:r.pending.id});
  assert.equal(east.look().local.support,r.puzzle.supports.find(s=>s.holds).mark);
  // Walking out with a hand on the brake is refused, with what to do instead.
  west(r,{type:'action',id:'open-door'});east.act({type:'accept',id:east.look().pending.id});
  const early=east.act({type:'action',id:'leave'});
  assert.equal(early.ok,false);assert.match(early.message,/^你还拉着手闸。先松手/);
  assert.equal(east.act({type:'action',id:'release-brake'}).ok,true);
  assert.equal(east.act({type:'action',id:'leave'}).ok,true);
  assert.deepEqual(east.look().rating,{stars:3,powerOns:1,packs:0});
});
test('what confirming a proposal would do is the same for a weak support as for the right one while a hand holds the gate',()=>{
  const shown=pick=>{
    const state=setup(),{r}=state,east=ready(state);
    east.act({type:'action',id:idOf(r,pick)});west(r,{type:'accept',id:r.pending.id});
    west(r,{type:'action',id:'open-door'});
    const view=east.look(),marks=new RegExp(r.puzzle.supports.map(s=>s.mark).join('|'),'g');
    return JSON.stringify({local:view.local,foreseen:view.pending.if_confirmed_now,actions:view.scene.map(o=>o.actions.map(a=>a.id))}).replace(marks,'某');
  };
  assert.equal(shown(s=>s.fits&&!s.holds),shown(s=>s.holds));
});
test('with the gate left on the power alone, the partner is not told which support will hold before it is tried',()=>{
  const shown=pick=>{
    const state=setup(),{r}=state,east=ready(state);
    east.act({type:'action',id:idOf(r,pick)});west(r,{type:'accept',id:r.pending.id});
    west(r,{type:'action',id:'power-on'});east.look();east.act({type:'action',id:'release-brake'});
    west(r,{type:'action',id:'power-off'});
    const view=east.look(),marks=new RegExp(r.puzzle.supports.map(s=>s.mark).join('|'),'g');
    return {foreseen:view.pending.if_confirmed_now,all:JSON.stringify({local:view.local,pending:view.pending.if_confirmed_now,notes:view.notes}).replace(marks,'某')};
  };
  const weak=shown(s=>s.fits&&!s.holds),right=shown(s=>s.holds);
  assert.equal(weak.all,right.all);
  assert.deepEqual(Object.keys(right.foreseen),['fanSpinning','untried_support']);
});

