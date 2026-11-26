// Where the session caps come from on the Node side, and that the hub uses them. Offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadLimits,mergeLimits} from './live-limits.mjs';
import {updateLimits,UPDATE_LIMITS} from './live-updates.mjs';
import {LiveHub} from './live.mjs';
import {Room} from './world.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./live-limits.json',import.meta.url),'utf8'));
function override(changes){
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'partition-limits-')),'limits.json');
  fs.writeFileSync(file,JSON.stringify(changes));return file;
}
test('defaults are the file; an override changes only what it names',()=>{
  assert.deepEqual(loadLimits(''),defaults);
  const loaded=loadLimits(override({session:{seconds:90,usage_stop_usd:.2}}));
  assert.deepEqual(loaded.session,{...defaults.session,seconds:90,usage_stop_usd:.2});
  assert.deepEqual(loaded.updates,defaults.updates);
  assert.deepEqual(UPDATE_LIMITS,updateLimits(defaults.updates));
});
test('a typo or a cap that is not a positive number is refused',()=>{
  for(const bad of [{sesion:{}},{session:{second:90}},{session:{seconds:0}},{session:{seconds:-5}},{session:{tools:2.5}},
    {session:{seconds:'90'}},{session:{seconds:true}},{updates:{batches:null}},{session:[]},[]]){
    assert.throws(()=>mergeLimits(defaults,bad),/live_limits_invalid/,JSON.stringify(bad));
  }
  assert.throws(()=>loadLimits('/nonexistent/limits.json'),/live_limits_invalid/);
});
test('the hub reports and enforces the configured session, not a constant',t=>{
  const limits=mergeLimits(defaults,{session:{seconds:7,input_seconds:5,output_seconds:4,usage_stop_usd:.5},updates:{batches:9}});
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'partition-hub-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const hub=new LiveHub(root,'http://127.0.0.1',false,limits),status=hub.status();
  assert.deepEqual([status.seconds,status.inputSeconds,status.outputSeconds,status.usageStopUsd],[7,5,4,.5]);
  const room=new Room({west:'human',east:'live'}),job=hub.get(room);
  assert.equal(job.updates.limits.batches,9);assert.equal(job.sync.batches,9);
  // The server's own deadline follows the cap: a session that does not end itself is ended just after it.
  const delays=[];t.mock.method(globalThis,'setTimeout',(fn,ms)=>{delays.push(ms);return 0;});
  t.mock.method(globalThis,'setInterval',()=>0);
  hub.enabled=true;job.stream={destroyed:false,writableLength:0,write(){}};
  hub.spawn=()=>({stdout:{on(){}},stderr:{on(){}},stdin:{on(){},writable:false},on(){},once(){},kill(){}});
  hub.start(room,true);
  assert.deepEqual(delays,[7*1000+5000]);
});
