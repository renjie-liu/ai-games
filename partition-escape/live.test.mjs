import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {Room} from './world.mjs';
import {LiveHub} from './live.mjs';
function setup(){const r=new Room({west:'human',east:'live'}),h=new LiveHub('.','http://127.0.0.1',true),j=h.get(r);Object.assign(j,{seat:'east',started:true,worker:{stdin:{writable:true,writableLength:0,write(){}}}});return {r,h,j};}
function call(h,r,c){const o=h.observe(r,'east',h.get(r).scope);assert.ok(o.ok);return h.command(r,'east',{ticket:o.ticket,command:c});}
test('Live tool uses normal engine; shared action waits for human button',()=>{const {h,r}=setup();assert.equal(call(h,r,{type:'action',id:'send-key'}).receipt.outcome,'proposed');assert.equal(r.state.keyTransferred,false);assert.equal(r.command('west',{type:'accept',id:r.pending.id}).receipt.outcome,'applied');assert.equal(r.state.keyTransferred,true);});
test('speech onset invalidates prior ticket, including late complete tool',()=>{const {h,r}=setup(),o=h.observe(r,'east',h.get(r).scope),rev=r.rev;h.input(r,{type:'start'});assert.equal(h.command(r,'east',{ticket:o.ticket,command:{type:'inspect',id:'hatch'}}).code,'live_superseded');assert.equal(r.rev,rev);});
test('re-observe after end gets fresh authority; duplicates do not execute',()=>{const {h,r}=setup();h.input(r,{type:'start'});assert.equal(h.observe(r,'east',h.get(r).scope).ok,false);h.input(r,{type:'end'});const o=h.observe(r,'east',h.get(r).scope);const b={ticket:o.ticket,command:{type:'inspect',id:'hatch'}};assert.ok(h.command(r,'east',b).ok);const rev=r.rev;assert.equal(h.command(r,'east',b).code,'live_superseded');assert.equal(r.rev,rev);});
test('world revision, expiration, pause and wrong seat cannot bypass gate',()=>{for(const mode of ['rev','expired','wrong-seat','pause']){const {h,r,j}=setup(),o=h.observe(r,'east',j.scope);if(mode==='rev')r.command('west',{type:'action',id:'power-on'});if(mode==='expired')j.tickets.get(o.ticket).expires=0;if(mode==='pause')r.command('west',{type:'pause'});const rev=r.rev;assert.equal(h.command(r,mode==='wrong-seat'?'west':'east',{ticket:o.ticket,command:{type:'inspect',id:'hatch'}}).code,'live_superseded');assert.equal(r.rev,rev);}});
test('actual permissions and rules remain rejected, no forged seat or batch',()=>{const {h,r}=setup();assert.equal(call(h,r,{type:'action',id:'power-on'}).code,'permission_denied');assert.equal(call(h,r,{type:'action',id:'brace'}).receipt.code,'rule_rejected');assert.equal(call(h,r,{type:'inspect',id:'hatch',seat:'west'}).code,'invalid_tool');assert.equal(call(h,r,[{type:'inspect',id:'hatch'}]).code,'invalid_tool');});
test('own observe never includes other unshared notes',()=>{const {h,r,j}=setup();r.command('west',{type:'inspect',id:'plaque'});const o=h.observe(r,'east',j.scope);assert.equal(JSON.stringify(o).includes('interlock'),false);assert.equal(JSON.stringify(o).includes(r.tokens.west),false);});
test('worklet fixture detects onset, retains preroll, limits silence, ends turn',()=>{let C;const events=[];vm.runInNewContext(fs.readFileSync(new URL('./mic-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:class{constructor(){this.port={postMessage:e=>events.push(e)};}},sampleRate:16000,registerProcessor:(n,c)=>C=c});const c=new C();const frame=v=>c.process([[new Float32Array(800).fill(v)]]);for(let i=0;i<20;i++)frame(0);assert.equal(events.length,0);frame(.1);frame(.1);assert.equal(events[0].type,'start');assert.equal(events.filter(e=>e.type==='audio').length,3);for(let i=0;i<14;i++)frame(0);assert.equal(events.at(-1).type,'end');const count=events.length;for(let i=0;i<20;i++)frame(0);assert.equal(events.length,count);});

test('runtime check admits only safe dependency codes, never subprocess text',async()=>{
  const {runtimeStatus}=await import('./live.mjs');
  assert.deepEqual(runtimeStatus('.',()=>({status:0,stdout:'{"ok":true,"code":"ready"}'})),{ready:true,code:'ready'});
  for(const code of ['live_harness_mismatch','live_limits_invalid','live_dependency_sdk'])assert.deepEqual(runtimeStatus('.',()=>({status:1,stdout:JSON.stringify({ok:false,code})})),{ready:false,code});
  for(const result of [{status:1,stdout:'{"ok":false,"code":"live_dependency_socks"}'},{status:1,stdout:'PRIVATE_SENTINEL'},{status:0,stdout:'{"ok":false,"code":"PRIVATE_SENTINEL"}'}]){
    const status=runtimeStatus('.',()=>result);assert.equal(status.ready,false);assert.equal(JSON.stringify(status).includes('PRIVATE_SENTINEL'),false);
  }
});
test('missing runtime blocks start before worker or session mutation',()=>{
  const r=new Room({west:'human',east:'live'}),h=new LiveHub('.','http://127.0.0.1',false),j=h.get(r);
  h.enabled=true;h.runtime={ready:false,code:'live_dependency_socks'};j.stream={};
  assert.throws(()=>h.start(r),/live_dependency_socks/);assert.equal(j.started,false);assert.equal(j.worker,null);
});

test('new game folder or corrupt ledger advertises zero real credit',async()=>{
  const {mkdtempSync,rmSync,mkdirSync,writeFileSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=mkdtempSync(join(tmpdir(),'partition-no-grant-'));
  try{
    const hub=new LiveHub(root,'http://127.0.0.1',false);assert.equal(hub.status().remaining,0);
    assert.equal(fs.existsSync(join(root,'.live')),false);
    mkdirSync(join(root,'.live'));writeFileSync(join(root,'.live','ledger.json'),'{"attempts":[],"limits":{"connections":2}}');
    assert.equal(hub.status().remaining,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('heartbeat loss preserves cause in queue, pipe and final UI after worker exit',()=>{
  const {h,r,j}=setup(),events=[],writes=[];
  j.stream={writableLength:0,write:x=>events.push(JSON.parse(x))};
  j.worker={stdin:{writable:true,writableLength:0,write(){},end:x=>writes.push(JSON.parse(x))},once:(event,fn)=>fn()};
  call(h,r,{type:'action',id:'send-key'});
  const c={type:'accept',id:r.pending.id};h.notify(r,'west',c,r.command('west',c));
  const ticket=h.observe(r,'east',j.scope).ticket;
  h.stop(r,'client_heartbeat_lost');
  assert.equal(j.updates.rows.at(-1).reason,'client_heartbeat_lost');
  assert.deepEqual(writes,[{type:'stop',reason:'client_heartbeat_lost'}]);
  assert.equal(h.finish(r,'worker_stopped'),false);
  assert.equal(h.finish(r,'user_stop'),false);
  assert.deepEqual(events.filter(e=>e.type==='closed'),[{type:'closed',reason:'client_heartbeat_lost'}]);
  assert.equal(r.worker.east.message,'client_heartbeat_lost');assert.equal(j.stopReason,'client_heartbeat_lost');
  assert.equal(h.command(r,'east',{ticket,command:{type:'inspect',id:'hatch'}}).code,'live_superseded');
});

test('worker-first terminal reason is not replaced by disconnect cleanup',()=>{
  const {h,r,j}=setup(),events=[];j.stream={writableLength:0,write:x=>events.push(JSON.parse(x))};
  assert.equal(h.finish(r,'live_text_bytes_limit'),true);h.stop(r,'browser_disconnected');
  assert.equal(events.filter(e=>e.type==='closed').length,1);assert.equal(j.stopReason,'live_text_bytes_limit');assert.equal(r.worker.east.message,'live_text_bytes_limit');
});

test('an observation is a look around the partner\'s own room: its facts come with it, change with the room, and stay its own',()=>{
  const {h,r,j}=setup(),rev=r.rev,events=r.events.length;
  const first=h.observe(r,'east',j.scope).view;
  // Nothing was inspected, yet the partner knows what each of its four objects does.
  assert.deepEqual(first.notes.map(n=>n.id).sort(),['brake-rule','fan-rule','gate-rule','key-found']);
  assert.ok(first.notes.find(n=>n.id==='gate-rule').text.includes('断电会落下'));
  assert.ok(first.scene.every(o=>o.inspected));
  // Looking is not an event: the room's revision and its public record are untouched.
  assert.equal(r.rev,rev);assert.equal(r.events.length,events);
  // West's facts are never in it, and west's own view has none of east's.
  assert.equal(JSON.stringify(first).includes('西门一旦推开'),false);
  assert.equal(JSON.stringify(r.view('west')).includes('手闸只能固定'),false);
  // Once the gate has risen, the fan shows what is behind it: the next look carries that fact.
  r.command('west',{type:'action',id:'power-on'});
  const second=h.observe(r,'east',j.scope).view;
  assert.ok(second.notes.find(n=>n.id==='brace-found').text.includes('手闸保持'));
  assert.equal(second.notes.filter(n=>n.id==='gate-rule').length,1,'a fact is noted once');
  // A waiting proposal says which seat's actions are shared, so the partner can tell its own controls apart.
  assert.deepEqual(second.scene.find(o=>o.id==='brake').actions,[{id:'hold-brake',label:'拉住手闸',shared:false}]);
  assert.deepEqual(second.scene.find(o=>o.id==='hatch').actions,[{id:'send-key',label:'递出钥匙',shared:true}]);
});

// In every real session of 2026-11-26 the partner tried its used ticket for the next action, was
// refused, looked again and retried: three of eleven tool calls in one turn bought nothing.
test('every answer to the partner carries the next ticket; one ticket is still one command',()=>{
  const {h,r,j}=setup();
  const looked=h.observe(r,'east',j.scope);
  const first=h.command(r,'east',{ticket:looked.ticket,command:{type:'inspect',id:'hatch'}});
  assert.equal(first.ok,true);assert.ok(first.ticket&&first.ticket!==looked.ticket);assert.ok(first.view.scene.length);
  // The ticket in the result is good for the next action, without another look.
  const second=h.command(r,'east',{ticket:first.ticket,command:{type:'action',id:'send-key'}});
  assert.equal(second.receipt.outcome,'proposed');
  // A used ticket does nothing, and the refusal itself hands over a good one with the room as it is.
  const rev=r.rev,reused=h.command(r,'east',{ticket:first.ticket,command:{type:'inspect',id:'gate'}});
  assert.equal(reused.code,'live_superseded');assert.equal(r.rev,rev);assert.equal(reused.receipt.command,'已作废的操作');
  assert.equal(h.command(r,'east',{ticket:reused.ticket,command:{type:'inspect',id:'gate'}}).ok,true);
  // A rule refusal also leaves the partner able to act on what it now sees.
  const refused=h.command(r,'east',{ticket:h.observe(r,'east',j.scope).ticket,command:{type:'action',id:'brace'}});
  assert.equal(refused.receipt.code,'rule_rejected');assert.ok(refused.ticket);
});
test('no ticket is handed out while the player speaks, and speech voids the one in hand',()=>{
  const {h,r,j}=setup();
  const first=h.command(r,'east',{ticket:h.observe(r,'east',j.scope).ticket,command:{type:'inspect',id:'hatch'}});
  h.input(r,{type:'start'});
  const during=h.command(r,'east',{ticket:first.ticket,command:{type:'action',id:'send-key'}});
  assert.equal(during.code,'live_superseded');assert.equal(during.ticket,undefined);assert.equal(r.pending,null);
  h.input(r,{type:'end'});
  // What was in hand before the player spoke stays void afterwards.
  const after=h.command(r,'east',{ticket:first.ticket,command:{type:'action',id:'send-key'}});
  assert.equal(after.code,'live_superseded');assert.equal(r.pending,null);
  assert.equal(h.command(r,'east',{ticket:after.ticket,command:{type:'action',id:'send-key'}}).receipt.outcome,'proposed');
});
// A person clicks around their own room while talking: 30 inspections in one real game of 2026-11-26.
test('a look or a word from the other seat leaves the partner\'s ticket good; a change of the room voids it',()=>{
  const {h,r,j}=setup();
  let ticket=h.observe(r,'east',j.scope).ticket;
  r.command('west',{type:'inspect',id:'plaque'});r.command('west',{type:'hint'});
  r.command('west',{type:'share',id:'interlock'});r.command('west',{type:'say',text:'你那边有什么？'});
  const acted=h.command(r,'east',{ticket,command:{type:'inspect',id:'hatch'}});
  assert.equal(acted.ok,true,'the room did not change, so what the partner saw still holds');
  // West moves a mechanism: what the partner saw is no longer the room.
  r.command('west',{type:'action',id:'power-on'});
  const stale=h.command(r,'east',{ticket:acted.ticket,command:{type:'action',id:'send-key'}});
  assert.equal(stale.code,'live_superseded');assert.equal(r.pending,null);
  // So does a proposal coming or going.
  ticket=stale.ticket;r.command('west',{type:'action',id:'power-off'});
  assert.equal(h.command(r,'east',{ticket,command:{type:'inspect',id:'gate'}}).code,'live_superseded');
});
// In real games of 2026-11-26 the partner confirmed a power cut with nothing holding the gate three
// times, and the gate fell each time. It had the facts; it drew the wrong conclusion.
test('a proposal waiting for the partner says what confirming it now would do to the partner\'s side',()=>{
  const {h,r,j}=setup();
  const look=()=>h.observe(r,'east',j.scope).view;
  assert.equal(look().pending,null);
  r.command('west',{type:'action',id:'power-on'});r.command('west',{type:'action',id:'power-off'});
  // Nothing holds the gate: confirming now drops it.
  assert.deepEqual(look().pending.if_confirmed_now,{gateOpen:false,fanSpinning:false});
  // The partner gets ready under the waiting proposal; the answer to that action already shows the new outcome.
  const held=h.command(r,'east',{ticket:h.observe(r,'east',j.scope).ticket,command:{type:'action',id:'hold-brake'}});
  assert.deepEqual(held.view.pending.if_confirmed_now,{fanSpinning:false});
  const accepted=h.command(r,'east',{ticket:held.ticket,command:{type:'accept',id:held.view.pending.id}});
  assert.equal(accepted.receipt.outcome,'applied');assert.equal(accepted.view.local.gateOpen,true);assert.equal(accepted.view.pending,null);
  // The seat that proposed, the audience and the other players' views never carry it.
  r.command('west',{type:'action',id:'power-on'});r.command('west',{type:'action',id:'power-off'});
  for(const role of ['west','watch'])assert.equal(JSON.stringify(r.view(role)).includes('if_confirmed_now'),false);
  assert.equal(r.preview('west'),null);
});
