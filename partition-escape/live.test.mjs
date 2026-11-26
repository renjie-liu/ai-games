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
test('world revision, expiration, pause and wrong seat cannot bypass gate',()=>{for(const mode of ['rev','expired','wrong-seat','pause']){const {h,r,j}=setup(),o=h.observe(r,'east',j.scope);if(mode==='rev')r.command('west',{type:'inspect',id:'plaque'});if(mode==='expired')j.tickets.get(o.ticket).expires=0;if(mode==='pause')r.command('west',{type:'pause'});const rev=r.rev;assert.equal(h.command(r,mode==='wrong-seat'?'west':'east',{ticket:o.ticket,command:{type:'inspect',id:'hatch'}}).code,'live_superseded');assert.equal(r.rev,rev);}});
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
