// What the hub does for a server with more than one player at a time: how many sessions run side
// by side, what a session is started under, how the grant's count is read, and how a quiet stream
// and a silent page are told apart. Offline: the worker is a stand-in and no process is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mergeLimits} from './live-limits.mjs';
import {LiveHub} from './live.mjs';
import {Room} from './world.mjs';
const defaults=JSON.parse(fs.readFileSync(new URL('./live-limits.json',import.meta.url),'utf8'));
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

// A hub that could start sessions, with workers that are recorded instead of run. Timers are
// collected so a test can fire them.
function server(t,{server:changes={},quota}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'partition-server-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const hub=new LiveHub(root,'http://127.0.0.1',false,mergeLimits(defaults,{server:changes}));
  const spawned=[],intervals=[],asked=[];
  t.mock.method(globalThis,'setInterval',(fn,ms)=>{intervals.push({fn,ms});return intervals.length;});
  t.mock.method(globalThis,'setTimeout',()=>0);
  hub.enabled=true;hub.runtime={ready:true,code:'ready'};
  hub.spawn=(command,args,options)=>{
    const child={env:options.env,stdout:{on(){}},stderr:{on(){}},stdin:{on(){},writable:false},on(){},once(){},kill(){}};
    spawned.push(child);return child;
  };
  // The grant's count as the worker's own code would report it.
  let answer=quota||{remaining:5,connectionLimit:5,projectVerified:true,totalUsd:null,invites:{}};
  hub.askQuota=async()=>{asked.push(Date.now());return answer;};
  const room=(invite)=>{
    const r=new Room({west:'human',east:'live'}),sent=[];
    if(invite)r.invite=invite;
    hub.get(r).stream={destroyed:false,writableLength:0,write(line){sent.push(JSON.parse(line));},end(){}};
    return Object.assign(r,{sent});
  };
  return {hub,room,spawned,intervals,asked,setQuota(q){answer=q;}};
}

test('as many sessions run side by side as the limits say; one more is refused until a place is free',async t=>{
  const {hub,room,spawned}=server(t,{server:{concurrent_sessions:2}});await hub.refreshQuota();
  const [a,b,c]=[room(),room(),room()];
  hub.start(a);hub.start(b);
  assert.throws(()=>hub.start(c),/live_sessions_full/);
  assert.equal(spawned.length,2,'no worker is made for the one that was refused');
  assert.equal(hub.get(c).started,false,'and its room can still start a session later');
  hub.finish(a,'user_stop');
  hub.start(c);assert.equal(spawned.length,3);
});
test('by default one session runs at a time',async t=>{
  const {hub,room}=server(t);await hub.refreshQuota();
  hub.start(room());
  assert.throws(()=>hub.start(room()),/live_sessions_full/);
});
test('a session is started under the invitation its room was made with, and under none on this machine',async t=>{
  const {hub,room,spawned}=server(t,{server:{concurrent_sessions:2}});await hub.refreshQuota();
  // Whatever the server's own environment holds, a session without an invitation is given none.
  Object.assign(process.env,{PARTITION_INVITE_NAME:'stale',PARTITION_INVITE_CONNECTIONS:'9'});
  t.after(()=>{delete process.env.PARTITION_INVITE_NAME;delete process.env.PARTITION_INVITE_CONNECTIONS;});
  hub.start(room({name:'朋友',connections:20}));hub.start(room());
  assert.deepEqual([spawned[0].env.PARTITION_INVITE_NAME,spawned[0].env.PARTITION_INVITE_CONNECTIONS],['朋友','20']);
  assert.equal('PARTITION_INVITE_NAME' in spawned[1].env,false);assert.equal('PARTITION_INVITE_CONNECTIONS' in spawned[1].env,false);
});
test('an invitation that is used up is refused before a worker is made; the grant running out likewise',async t=>{
  const {hub,room,spawned,setQuota}=server(t,{quota:{remaining:3,connectionLimit:5,projectVerified:true,totalUsd:null,invites:{朋友:2}}});
  await hub.refreshQuota();
  assert.throws(()=>hub.start(room({name:'朋友',connections:2})),/live_invite_exhausted/);
  const welcome=room({name:'朋友',connections:3});hub.start(welcome);hub.finish(welcome,'user_stop');
  setQuota({remaining:0,connectionLimit:5,projectVerified:true,totalUsd:null,invites:{}});await hub.refreshQuota();
  assert.throws(()=>hub.start(room()),/live_authorization_exhausted/);
  assert.equal(spawned.length,1);
});
test('asking for the status never waits for the count: it is read in the background and kept',async t=>{
  const {hub,asked,setQuota}=server(t,{server:{quota_refresh_ms:1000}});
  let now=1_000_000;t.mock.method(Date,'now',()=>now);
  assert.equal(hub.status().remaining,0,'nothing is known before the first answer');
  await tick();
  assert.equal(hub.status().remaining,5);assert.equal(asked.length,1);
  // Asked again a moment later: the kept answer, and nobody is asked.
  now+=400;setQuota({remaining:4,connectionLimit:5,projectVerified:true,totalUsd:null,invites:{朋友:1}});
  assert.equal(hub.status().remaining,5);await tick();assert.equal(asked.length,1);
  // Once the answer is older than the limits allow it is asked for again; the caller still gets the kept one.
  now+=700;
  assert.equal(hub.status().remaining,5);await tick();
  assert.equal(asked.length,2);assert.deepEqual([hub.status().remaining,hub.status().invites],[4,{朋友:1}]);
  // Many callers at once make one question.
  now+=5000;for(let i=0;i<50;i++)hub.status();await tick();assert.equal(asked.length,3);
});
test('the count is read again when a session starts and when it ends',async t=>{
  const {hub,room,asked}=server(t);await hub.refreshQuota();
  const before=asked.length,r=room();
  hub.start(r);await tick();assert.equal(asked.length,before+1);
  hub.finish(r,'user_stop');await tick();assert.equal(asked.length,before+2);
});
test('a hub that cannot start sessions asks nobody',t=>{
  const {hub,asked}=server(t);hub.enabled=false;
  assert.equal(hub.status().remaining,0);assert.equal(asked.length,0);
});
test('a quiet stream is sent a line now and then; a page that has gone silent is ended after the wait the limits give',async t=>{
  const {hub,room,intervals}=server(t,{server:{heartbeat_lost_ms:9000,stream_keepalive_ms:4000}});await hub.refreshQuota();
  let now=2_000_000;t.mock.method(Date,'now',()=>now);
  const r=room();hub.start(r);
  const every=intervals.at(-1).fn,kept=()=>r.sent.filter(e=>e.type==='keepalive').length;
  r.sent.length=0;
  now+=3000;hub.input(r,{type:'heartbeat'});every();assert.equal(kept(),0,'the stream spoke less than the wait ago');
  now+=1500;hub.input(r,{type:'heartbeat'});every();assert.equal(kept(),1);
  now+=1000;every();assert.equal(kept(),1,'one line is enough until the wait has passed again');
  // The page stops sending anything: the session ends once the wait is over, and not before.
  now+=7500;every();assert.equal(hub.get(r).ended,false);
  now+=1000;every();assert.equal(hub.get(r).ended,true);assert.equal(hub.get(r).stopReason,'client_heartbeat_lost');
});
