import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './world.mjs';
import {PublicUpdates,updateTrace,UPDATE_LIMITS as L} from './live-updates.mjs';
import {LiveHub} from './live.mjs';
function setup(){
  const room=new Room({west:'human',east:'live'}),job={started:true,ended:false,epoch:0,scope:'scope',speaking:false},sent=[];
  let time=0,next=0;const timers=new Map();
  const u=new PublicUpdates(room,job,x=>sent.push(x),{now:()=>time,schedule:(fn,delay)=>{timers.set(++next,{fn,at:time+delay});return next;},cancel:id=>timers.delete(id)});
  const tick=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
  const command=c=>{const r=room.command('west',c);u.enqueue('west',c,r);return r;};
  return {room,job,sent,u,tick,timers,command};
}
test('confirmed action and shared clue coalesce with real receipt IDs, no private observation',()=>{
  const x=setup();x.room.command('east',{type:'action',id:'send-key'});
  const accepted=x.command({type:'accept',id:x.room.pending.id});
  x.command({type:'inspect',id:'plaque'});x.room.notes.west.push({id:'secret',text:'PRIVATE_SENTINEL'});
  const shared=x.command({type:'share',id:'interlock'});x.tick(249);assert.equal(x.sent.length,0);x.tick(1);
  assert.equal(x.sent.length,1);const b=x.sent[0];assert.equal(b.type,'game_update');assert.equal(b.update.pending,null);
  assert.deepEqual(b.update.events.map(e=>e.id),[...accepted.receipt.roomEventIds,...shared.receipt.roomEventIds]);
  assert.deepEqual(b.update.receipts.map(r=>r.requestId),[accepted.receipt.requestId,shared.receipt.requestId]);
  assert.equal(JSON.stringify(b).includes('PRIVATE_SENTINEL'),false);assert.equal(JSON.stringify(b).includes(x.room.tokens.west),false);
  assert.equal('local' in b.update,false);assert.equal('notes' in b.update,false);assert.ok(b.update.events.some(e=>e.type==='clue'&&e.text===x.room.shared[0].text));
});
test('same receipt replay and repeated shared fact create no extra sends',()=>{
  const x=setup();x.command({type:'inspect',id:'plaque'});const c={type:'share',id:'interlock'},r=x.command(c);
  for(let i=0;i<10;i++)x.u.enqueue('west',c,r);x.tick(250);
  for(let i=0;i<10;i++)x.command(c);x.tick(10000);
  assert.equal(x.sent.length,1);assert.equal(x.timers.size,0);assert.ok(x.u.stats.duplicate>=20);
});
test('inspect, hint, say, failed and nonhuman commands do not enqueue',()=>{
  const x=setup();for(const c of [{type:'inspect',id:'plaque'},{type:'hint'},{type:'say',text:'PRIVATE_SENTINEL'},{type:'share',id:'missing'},{type:'accept',id:'bad'},{type:'action',id:'brace'}])x.command(c);
  const c={type:'action',id:'send-key'};x.u.enqueue('east',c,x.room.command('east',c));x.tick(9999);
  assert.deepEqual(x.sent,[]);assert.equal(x.u.sent,0);
});
test('debounce is not extended by a burst, interval and three-batch cap are hard',()=>{
  const x=setup();x.command({type:'action',id:'power-on'});x.tick(250);assert.equal(x.sent.length,1);
  x.room.command('east',{type:'action',id:'send-key'});x.command({type:'decline',id:x.room.pending.id});x.tick(1999);assert.equal(x.sent.length,1);x.tick(1);assert.equal(x.sent.length,2);
  x.room.command('east',{type:'action',id:'send-key'});x.command({type:'accept',id:x.room.pending.id});x.tick(2000);assert.equal(x.sent.length,3);
  x.command({type:'action',id:'unlock'});x.tick(100000);assert.equal(x.sent.length,3);assert.equal(x.timers.size,0);assert.ok(x.u.stats.limited>0);
});
test('stop and pause discard pending timer with explicit cancellation',()=>{
  for(const mode of ['ended','paused','clear']){
    const x=setup();x.command({type:'action',id:'power-on'});
    if(mode==='paused')x.room.paused=true;else if(mode==='epoch')x.job.epoch++;else if(mode==='clear')x.u.clear();else x.job[mode]=true;
    x.tick(100000);assert.equal(x.sent.length,0,mode);assert.equal(x.timers.size,0,mode);assert.equal(x.u.stats.canceled,1);
  }
});
test('oversized published clue batch fails closed, never splits into unbounded sends',()=>{
  const x=setup();for(let i=0;i<3;i++){x.room.notes.west.push({id:'large'+i,text:'文'.repeat(500)});x.command({type:'share',id:'large'+i});}
  x.tick(250);assert.equal(x.sent.length,0);assert.equal(x.u.stats.limited,1);assert.equal(x.timers.size,0);
});
test('pending events and dedupe memory remain bounded under repeated operations',()=>{
  const x=setup();for(let i=0;i<200;i++){x.room.command('east',{type:'action',id:'send-key'});x.command({type:'decline',id:x.room.pending.id});}
  assert.ok(x.u.events.size<=L.events);assert.ok(x.u.seen.size<=128);assert.ok(x.u.receipts.size<=L.events);x.tick(10000);assert.ok(x.sent.length<=1);assert.equal(x.timers.size,0);
});
test('LiveHub preserves public facts across speech/text but never revives old tickets',()=>{
  for(const mode of ['start','text','stop']){
    const r=new Room({west:'human',east:'live'}),h=new LiveHub('.','http://127.0.0.1',false),j=h.get(r),writes=[];
    Object.assign(j,{seat:'east',started:true,worker:{stdin:{writable:true,writableLength:0,write:s=>writes.push(JSON.parse(s)),end:s=>writes.push(JSON.parse(s))},kill(){},once(){}}});
    const old=h.observe(r,'east',j.scope);const c={type:'action',id:'power-on'};h.notify(r,'west',c,r.command('west',c));
    assert.ok(j.updates.timer);h.input(r,{type:mode,...(mode==='text'?{text:'先等等'}:{})});
    assert.equal(j.updates.events.size,mode==='stop'?0:1);assert.equal(h.command(r,'east',{ticket:old.ticket,command:{type:'inspect',id:'hatch'}}).code,'live_superseded');
    assert.equal(writes.some(x=>x.type==='game_update'),false);
    if(mode!=='stop'){clearTimeout(j.updates.timer);j.updates.flush();const update=writes.find(x=>x.type==='game_update');assert.equal(update.epoch,j.epoch);assert.equal(update.scope,j.scope);assert.equal(update.update.events[0].type,'action');}
    h.close();
  }
});

test('new button update during same-epoch speech reaches worker queue',()=>{
  const x=setup();x.job.speaking=true;x.job.epoch=1;x.command({type:'action',id:'power-on'});x.tick(250);
  assert.equal(x.sent.length,1);assert.equal(x.sent[0].epoch,1);
});

test('rebind preserves confirm/share facts once, including multiple epoch changes',()=>{
  const x=setup();x.room.command('east',{type:'action',id:'send-key'});
  const r=x.command({type:'accept',id:x.room.pending.id});x.command({type:'inspect',id:'plaque'});
  const s=x.command({type:'share',id:'interlock'});
  for(let i=1;i<=3;i++){x.job.epoch=i;x.job.scope='scope-'+i;x.u.rebind();}
  x.tick(250);assert.equal(x.sent.length,1);assert.equal(x.sent[0].epoch,3);
  assert.deepEqual(x.sent[0].update.events.map(e=>e.id),[...r.receipt.roomEventIds,...s.receipt.roomEventIds]);
  assert.equal(x.u.rows.filter(e=>e.status==='rebound').length,3);assert.equal(x.u.rows.filter(e=>e.status==='merged').length,1);
});
test('cap emits undelivered event/request references; cannot look like pending or sent',()=>{
  const x=setup();x.u.sent=3;const r=x.command({type:'action',id:'power-on'});x.tick(10000);
  assert.equal(x.sent.length,0);assert.equal(x.u.events.size,0);assert.equal(x.timers.size,0);
  const e=x.u.rows.at(-1);assert.equal(e.status,'not_delivered');assert.equal(e.reason,'batch_limit');
  assert.deepEqual(e.room_event_ids,r.receipt.roomEventIds);assert.deepEqual(e.request_ids,[r.receipt.requestId]);
  const html=updateTrace(x.u.rows);assert.ok(html.includes('batch_limit'));assert.ok(html.includes('#'+r.receipt.roomEventIds[0]));
});
test('both-seat audits exclude private text, and stop records the unsent references',()=>{
  for(const human of ['west','east']){
    const x=setup();x.room.controllers={west:human==='west'?'human':'live',east:human==='east'?'human':'live'};
    const c={type:'action',id:human==='west'?'power-on':'send-key'};const r=x.room.command(human,c);assert.ok(r.ok);
    r.message='PRIVATE_SENTINEL';r.receipt.changes={secret:'PRIVATE_SENTINEL'};r.receipt.secret='PRIVATE_SENTINEL';
    x.room.notes[human].push({id:'secret',text:'PRIVATE_SENTINEL'});x.u.enqueue(human,c,r);x.u.clear('session_stopped');
    const e=x.u.rows.at(-1);assert.equal(e.status,'canceled');assert.deepEqual(e.room_event_ids,r.receipt.roomEventIds);
    assert.ok(!JSON.stringify(x.u.rows).includes('PRIVATE_SENTINEL'));assert.ok(!updateTrace(x.u.rows).includes('PRIVATE_SENTINEL'));
  }
});
test('pipe rejection or exception is explicit, never retried or refunded',()=>{
  for(const fail of [()=>false,()=>{throw Error('PRIVATE_SENTINEL');}]){
    const x=setup();x.u.send=fail;x.command({type:'action',id:'power-on'});x.tick(250);x.tick(10000);
    assert.equal(x.u.sent,1);assert.equal(x.timers.size,0);assert.ok(['not_delivered','delivery_unknown'].includes(x.u.rows.at(-1).status));assert.ok(!JSON.stringify(x.u.rows).includes('PRIVATE_SENTINEL'));
  }
});
test('pending overflow and audit overflow are bounded and visible',()=>{
  const x=setup();for(let i=0;i<600;i++){x.room.command('east',{type:'action',id:'send-key'});x.command({type:'decline',id:x.room.pending.id});}
  assert.ok(x.u.rows.some(e=>e.reason==='pending_limit'));assert.equal(x.u.rows.length,512);assert.ok(x.u.omitted>0);
  assert.ok(updateTrace(x.u.rows,x.u.omitted).includes('Trace 明细上限'));x.u.clear();
});
