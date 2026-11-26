// Lifecycle tests run the production client with isolated DOM/audio/fetch fixtures.
// No browser permission, microphone, SDK, real transport or authorization files.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('./live-client.mjs',import.meta.url),'utf8').replace('export function setupLive','function setupLive');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({gate,fixtureMode=false,segments=false,caps={seconds:60,inputSeconds:30,outputSeconds:20,usageStopUsd:.15}}={}){
  const elements=new Map(),listeners={},calls=[],contexts=[],tracks=[],timers=new Map(),delays=[],delayOf=new Map(),wait=deferred(),micWaits=[];
  const view={role:'west',controllers:{east:'live'},paused:false};let nextTimer=0,micCalls=0,cancelCount=0,sourceCount=0,connectedSources=0,played=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{id,disabled:['live-stop','live-interrupt'].includes(id),textContent:'',dataset:{},append(x){elements.set(x.id,x);}});return elements.get(id);};
  let pendingRead,rows=[];
  const reader={read:()=>rows.length?Promise.resolve(rows.shift()):(pendingRead=deferred()).promise,cancel:async()=>{cancelCount++;pendingRead?.resolve({done:true});}};
  const body={getReader:()=>reader,cancel:async()=>{cancelCount++;}};
  function push(row){const value=row===null?{done:true}:{done:false,value:new TextEncoder().encode(JSON.stringify(row)+'\n')};if(pendingRead){const p=pendingRead;pendingRead=null;p.resolve(value);}else rows.push(value);}
  function capture(){const t={readyState:'live',stopped:0,stop(){this.readyState='ended';this.stopped++;}};tracks.push(t);return {getTracks:()=>[t]};}
  let generation=0, phase='off';
  const response=data=>({ok:true,json:async()=>data});
  const document={hidden:false,querySelector:()=>el('live-panel'),getElementById:el,createElement:()=>({}),addEventListener:(k,f)=>listeners[k]=f};
  const fetch=async(url,opts={})=>{
    const kind=url.split('/').at(-1).replace('live-','');calls.push({kind,body:opts.body?JSON.parse(opts.body):null,signal:opts.signal});
    if(kind==='status'){
      if((gate==='status'&&calls.filter(c=>c.kind==='status').length>1)||(gate==='initial-status'&&calls.filter(c=>c.kind==='status').length===1))await wait.promise;
      return response({remaining:1,totalUsd:.5,runtimeReady:true,fixture:fixtureMode,...caps,...(segments?{generation,sync:sync(0,{phase})}:{})});
    }
    if(kind==='renew'){generation++;phase='off';return response({generation});}
    if(kind==='input'&&JSON.parse(opts.body).type==='stop')phase='closed';
    if(kind==='stream'){if(gate==='stream')await wait.promise;return {ok:true,body};}
    if(kind==='start'){phase='active';if(gate==='start')await wait.promise;return response({ok:true});}
    return response({ok:true});
  };
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.sources=[];this.audioWorklet={addModule:async()=>{if(gate==='module')await wait.promise;}};contexts.push(this);}
    async resume(){if(gate==='resume')await wait.promise;if(this.state!=='closed')this.state='running';}
    async close(){this.state='closed';}
    createMediaStreamSource(){sourceCount++;return {connect(t){connectedSources++;return t;},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(t){return t;}};}
    createBuffer(channels,length){return {duration:length/24000,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){const n={connect(){},start(){played++;},stop(){this.onended?.();}};this.sources.push(n);return n;}
  }
  class AudioWorkletNode {constructor(){this.port={};}connect(t){return t;}disconnect(){}}
  const sandbox={document,window:{addEventListener:(k,f)=>listeners[k]=f},fetch,AudioContext,AudioWorkletNode,AbortController,TextDecoder,Uint8Array,DataView,
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
    navigator:{mediaDevices:{getUserMedia:async()=>{micCalls++;if(gate!=='mic')return capture();const d=micWaits.length?deferred():wait;micWaits.push(d);return d.promise;}}},
    setInterval:f=>{timers.set(++nextTimer,f);return nextTimer;},clearInterval:id=>timers.delete(id),
    setTimeout:(f,ms)=>{timers.set(++nextTimer,f);delays.push(ms);delayOf.set(nextTimer,ms);return nextTimer;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(sandbox);vm.runInContext(code,sandbox);
  const client=sandbox.setupLive({room:'offline-lifecycle',key:'fixture-token',getView:()=>view});
  return {el,calls,contexts,tracks,timers,delays,delayOf,wait,micWaits,reader,document,view,client,push,capture,
    start:()=>el(fixtureMode?'live-fixture':'live-start').onclick(),
    cancel:()=>el('live-stop').onclick(),
    background(){document.hidden=true;listeners.visibilitychange();},
    foreground(){document.hidden=false;listeners.visibilitychange();},
    pagehide(){listeners.pagehide();},pause(){view.paused=true;client.update();},
    stats:()=>({micCalls,cancelCount,sourceCount,connectedSources,played}),starts:()=>calls.filter(c=>c.kind==='start').length};
}
for(const action of ['cancel','background','pagehide','pause'])test(`permission pending then ${action}: late track stops, no connection`,async()=>{
  const f=fixture({gate:'mic'});await tick();const p=f.start();await tick();
  assert.equal(f.stats().micCalls,1);assert.equal(f.el('live-stop').disabled,false);
  f[action]();const stopped=f.el('live-state').textContent;f.wait.resolve(f.capture());await p;await tick();
  assert.equal(f.starts(),0);assert.equal(f.contexts.length,0);assert.equal(f.tracks[0].stopped,1);
  assert.equal(f.el('live-state').textContent,stopped);assert.equal(f.el('live-stop').disabled,true);assert.equal(f.timers.size,0);
});
for(const gate of ['status','resume','module','stream'])test(`cancel while ${gate} is pending cannot resume startup`,async()=>{
  const f=fixture({gate});await tick();const p=f.start();await tick();f.cancel();const stopped=f.el('live-state').textContent;
  f.wait.resolve();await p;await tick();assert.equal(f.starts(),0);assert.equal(f.timers.size,0);
  assert.equal(f.el('live-state').textContent,stopped);assert.ok(f.contexts.every(c=>c.state==='closed'));assert.ok(f.tracks.every(t=>t.stopped>0));
  if(gate==='status')assert.equal(f.stats().micCalls,0);
  if(gate==='stream')assert.equal(f.stats().cancelCount,1);
});
for(const terminal of ['eof','closed','cancel'])test(`${terminal} before start response stays stopped`,async()=>{
  const f=fixture({gate:'start',fixtureMode:true});await tick();const p=f.start();await tick();assert.equal(f.starts(),1);
  if(terminal==='eof')f.push(null);else if(terminal==='closed')f.push({type:'closed',reason:'fixture_stopped'});else f.cancel();await tick();
  const stopped=f.el('live-state').textContent;f.wait.resolve();await p;await tick();
  assert.equal(f.el('live-state').textContent,stopped);assert.equal(f.el('live-stop').disabled,true);assert.equal(f.el('live-interrupt').disabled,true);
  assert.equal(f.contexts[0].state,'closed');assert.equal(f.timers.size,0);assert.equal(f.starts(),1);assert.equal(f.stats().micCalls,0);
  f.push({type:'ready'});await tick();assert.equal(f.el('live-state').textContent,stopped);
});
test('canceled permission completion cannot take over a newer attempt',async()=>{
  const f=fixture({gate:'mic'});await tick();const first=f.start();await tick();f.cancel();const second=f.start();await tick();
  assert.equal(f.stats().micCalls,2);f.micWaits[1].resolve(f.capture());await second;await tick();
  const active=f.el('live-state').textContent;assert.equal(f.starts(),1);assert.equal(f.tracks[0].stopped,0);
  f.wait.resolve(f.capture());await first;await tick();
  assert.equal(f.starts(),1);assert.equal(f.tracks[0].stopped,0);assert.equal(f.tracks[1].stopped,1);
  assert.equal(f.el('live-state').textContent,active);assert.equal(f.timers.size,2);f.cancel();
});
for(const readyFirst of [true,false])test(`capture starts once, only after UI start and provider readiness (ready first: ${readyFirst})`,async()=>{
  const f=fixture({gate:'start'});
  await tick();const start=f.start();await tick();
  if(readyFirst){f.push({type:'ready'});await tick();}
  else {f.wait.resolve();await start;}
  assert.equal(f.stats().connectedSources,0);
  if(readyFirst){f.wait.resolve();await start;}
  else {f.push({type:'ready'});await tick();}
  assert.equal(f.stats().connectedSources,1);
  assert.match(f.el('live-state').textContent,/在听/);
  f.push({type:'ready'});await tick();
  assert.equal(f.stats().connectedSources,1);
  f.cancel();
});
test('microphone denial and worklet failure do not reach model start',async()=>{
  for(const gate of ['mic','module']){
    const f=fixture({gate});await tick();const p=f.start();await tick();f.wait.reject(Object.assign(Error('fixture failure'),{name:gate==='mic'?'NotAllowedError':'Error'}));await p;
    assert.equal(f.starts(),0);assert.equal(f.timers.size,0);assert.ok(f.tracks.every(t=>t.stopped>0));assert.ok(f.contexts.every(c=>c.state==='closed'));
  }
});
test('successful mock capture starts once and stop releases capture, playback and timers',async()=>{
  const f=fixture();await tick();await f.start();assert.equal(f.starts(),1);assert.equal(f.stats().sourceCount,1);assert.equal(f.timers.size,2);
  f.push({type:'ready'});await tick();assert.match(f.el('live-state').textContent,/在听/);
  f.push({type:'audio',epoch:0,data:Buffer.alloc(48).toString('base64')});await tick();assert.equal(f.stats().played,1);
  f.cancel();const stopped=f.el('live-state').textContent;f.push({type:'audio',epoch:0,data:Buffer.alloc(48).toString('base64')});await tick();
  assert.equal(f.stats().played,1);assert.equal(f.el('live-state').textContent,stopped);assert.equal(f.contexts[0].state,'closed');assert.equal(f.tracks[0].stopped,1);assert.equal(f.timers.size,0);
});
test('closed capture during local setup prevents a model start',async()=>{
  const f=fixture({gate:'module'});await tick();const p=f.start();await tick();f.tracks[0].readyState='ended';f.tracks[0].onended();f.wait.resolve();await p;
  assert.equal(f.starts(),0);assert.equal(f.contexts[0].state,'closed');assert.equal(f.el('live-state').textContent,'麦克风已关闭');
});

for(const dispatch of [true,false])test(`suspended audio while stream is pending blocks start (event=${dispatch})`,async()=>{
  const f=fixture({gate:'stream'});await tick();const p=f.start();await tick();
  f.contexts[0].state='suspended';if(dispatch)f.contexts[0].onstatechange();f.wait.resolve();await p;await tick();
  assert.equal(f.starts(),0);assert.equal(f.contexts[0].state,'closed');assert.equal(f.tracks[0].stopped,1);assert.equal(f.timers.size,0);
  assert.equal(f.el('live-stop').disabled,true);assert.doesNotMatch(f.el('live-state').textContent,/麦克风已开启/);
});

test('initial availability response cannot overwrite a canceled startup',async()=>{
  const f=fixture({gate:'initial-status'});const p=f.start();f.cancel();const stopped=f.el('live-state').textContent;
  await p;f.wait.resolve();await tick();assert.equal(f.starts(),0);assert.equal(f.stats().micCalls,0);assert.equal(f.el('live-state').textContent,stopped);
});

const sync=(version,extra={})=>({version,phase:'active',source:'live-local',queued:0,forwarded:0,sending:0,sent:0,not_delivered:0,uncertain:0,limited:false,untracked:false,...extra});
test('player sees unsent gap from existing view updates without starting microphone or session',async()=>{
  const f=fixture();await tick();const count=f.calls.length;
  f.view.liveSync=sync(1,{not_delivered:1,limited:true});f.client.update();
  assert.match(f.el('live-sync-state').textContent,/未送达/);assert.match(f.el('live-sync-state').textContent,/已达同步上限/);
  assert.equal(f.el('live-sync-state').dataset.state,'warning');assert.equal(f.stats().micCalls,0);assert.equal(f.starts(),0);assert.equal(f.calls.length,count);
});
test('stream labels pending, sent and fixture honestly with no action claim',async()=>{
  const f=fixture({fixtureMode:true});await tick();await f.start();
  f.push({type:'sync_status',sync:sync(1,{forwarded:1})});await tick();assert.match(f.el('live-sync-state').textContent,/等待发送确认/);assert.doesNotMatch(f.el('live-sync-state').textContent,/已发送/);
  f.push({type:'sync_status',sync:sync(2,{sent:1})});await tick();assert.match(f.el('live-sync-state').textContent,/不代表搭档理解/);
  f.push({type:'sync_status',sync:sync(3,{source:'offline-fixture',sent:1})});await tick();assert.match(f.el('live-sync-state').textContent,/仅模拟发送，未调用模型/);f.cancel();
});
test('late poll or stream cannot clear a newer gap or reactivate stopped voice',async()=>{
  const f=fixture({fixtureMode:true});await tick();await f.start();
  f.push({type:'sync_status',sync:sync(4,{not_delivered:1,limited:true,sent:2})});await tick();const warning=f.el('live-sync-state').textContent;
  f.view.liveSync=sync(3,{sent:2});f.client.update();assert.equal(f.el('live-sync-state').textContent,warning);
  f.cancel();const stopped=f.el('live-state').textContent;
  f.push({type:'sync_status',sync:sync(10,{sent:3})});await tick();assert.equal(f.el('live-state').textContent,stopped);
  assert.match(f.el('live-sync-state').textContent,/语音已结束/);assert.match(f.el('live-sync-state').textContent,/未送达/);
});
test('unknown delivery and malformed/private status cannot masquerade as success',async()=>{
  const f=fixture();await tick();f.view.liveSync=sync(2,{uncertain:1,untracked:true});f.client.update();const before=f.el('live-sync-state').textContent;
  assert.match(before,/送达情况不确定/);assert.match(before,/无法完整确认/);
  for(const bad of [sync(3,{source:'PRIVATE_SENTINEL'}),sync(3,{sent:NaN}),sync(3,{queued:129}),sync(3,{limited:'PRIVATE_SENTINEL'}),sync(3,{phase:'PRIVATE_SENTINEL'})]){
    f.view.liveSync=bad;f.client.update();assert.equal(f.el('live-sync-state').textContent,before);
  }
  f.view.liveSync=sync(3,{sent:1,not_delivered:1,private:'PRIVATE_SENTINEL'});f.client.update();assert.doesNotMatch(f.el('live-sync-state').textContent,/PRIVATE_SENTINEL/);
});

test('switching tabs ends capture; explicit resume starts exactly one new segment in place',async()=>{
  const f=fixture({segments:true});await tick();await f.start();
  f.push({type:'ready'});await tick();
  assert.equal(f.stats().connectedSources,1);
  f.background();await tick();
  assert.equal(f.tracks[0].readyState,'ended');
  assert.equal(f.contexts[0].state,'closed');
  assert.equal(f.timers.size,0);
  assert.equal(f.calls.filter(c=>c.kind==='input'&&c.body.type==='stop').length,1);
  assert.equal(f.calls.find(c=>c.kind==='input'&&c.body.type==='stop').body.reason,'tab_hidden');
  f.foreground();await tick();
  assert.match(f.el('live-state').textContent,/关闭麦克风/);
  assert.equal(f.el('live-continue').hidden,false);
  assert.equal(f.starts(),1);assert.equal(f.stats().micCalls,1);
  await Promise.all([f.el('live-continue').onclick(),f.el('live-continue').onclick()]);
  assert.equal(f.calls.filter(c=>c.kind==='renew').length,1);
  assert.equal(f.starts(),2);assert.equal(f.stats().micCalls,2);
  f.cancel();
});

test('session length, playback bound and notice come from the server, not from the page',async()=>{
  const f=fixture({caps:{seconds:600,inputSeconds:300,outputSeconds:300,usageStopUsd:1}});await tick();
  assert.match(f.el('live-caps').textContent,/每段语音最多 10 分钟/);assert.match(f.el('live-caps').textContent,/可发言 5 分钟、听回复 5 分钟/);
  assert.match(f.el('live-caps').textContent,/费用估算到 \$1 会自动结束/);
  await f.start();assert.ok(f.delays.includes(600000));assert.equal(f.delays.includes(60000),false);
  f.push({type:'ready'});await tick();
  // 25 seconds of reply is inside a 300-second allowance: it plays, and the session goes on.
  f.push({type:'audio',epoch:0,data:Buffer.alloc(25*48000).toString('base64')});await tick();
  assert.equal(f.stats().played,1);assert.match(f.el('live-state').textContent,/搭档在说/);assert.equal(f.timers.size,2);
});
test('a reply longer than the allowance still ends the session',async()=>{
  const f=fixture({caps:{seconds:60,inputSeconds:30,outputSeconds:20,usageStopUsd:.15}});await tick();await f.start();f.push({type:'ready'});await tick();
  f.push({type:'audio',epoch:0,data:Buffer.alloc(25*48000).toString('base64')});await tick();
  assert.equal(f.stats().played,0);assert.match(f.el('live-state').textContent,/超过本段播放上限/);assert.equal(f.timers.size,0);
});
test('why a session stopped is said in words; a code the page does not know is shown as it is',async()=>{
  for(const [reason,shown] of [['live_tools_limit',/机关操作次数已用到上限/],['live_usage_stop',/费用估算已到上限/],['session_deadline',/时长已用到上限/],['some_new_code',/some_new_code/]]){
    const f=fixture();await tick();await f.start();f.push({type:'ready'});await tick();f.push({type:'closed',reason});await tick();
    assert.match(f.el('live-state').textContent,shown);assert.match(f.el('live-state').textContent,/机关进度已保留/);
  }
});

test('the long notes fold away once voice starts and come back when the partner missed an update',async()=>{
  const f=fixture({segments:true});await tick();
  const html=f.el('live-panel').innerHTML,at=x=>html.indexOf(x);
  // What the player acts on is first; the terms and caps follow inside the block that folds.
  assert.ok(at('id="live-state"')<at('id="live-start"')&&at('id="live-start"')<at('id="live-details"'));
  assert.ok(at('id="live-details"')<at('id="live-notice"')&&at('id="live-notice"')<at('id="live-sync-state"'));
  assert.match(html,/<details id="live-details" open>/);
  await f.start();assert.equal(f.el('live-details').open,false);
  f.push({type:'sync_status',sync:sync(5,{phase:'active',not_delivered:1})});await tick();
  assert.equal(f.el('live-details').open,true);assert.match(f.el('live-sync-state').textContent,/未送达/);
});
test('winning the game closes the microphone after the reply in progress, or after the grace period',async()=>{
  // The partner's last line is still playing when the game is won: it is not cut off.
  let f=fixture();await tick();await f.start();f.push({type:'ready'});await tick();
  f.push({type:'audio',epoch:0,data:Buffer.alloc(4800).toString('base64')});await tick();
  f.view.complete=true;f.client.update();await tick();
  assert.equal(f.tracks[0].stopped,0);assert.ok(f.delays.includes(20000));
  f.push({type:'turn_complete'});await tick();assert.equal(f.tracks[0].stopped,0,'audio is still playing');
  f.contexts[0].sources.forEach(n=>n.onended());await tick();
  assert.equal(f.tracks[0].stopped,1);assert.equal(f.el('live-state').textContent,'已通关 · 麦克风已关闭');assert.equal(f.timers.size,0);
  assert.deepEqual(f.calls.filter(c=>c.kind==='input'&&c.body.type==='stop').length,1);
  // No reply ever ends: the grace period closes it.
  f=fixture();await tick();await f.start();f.push({type:'ready'});await tick();
  f.view.complete=true;f.client.update();f.client.update();await tick();
  assert.equal([...f.timers.values()].length,3,'heartbeat, session cap and one grace timer');
  [...f.timers.entries()].filter(([id])=>f.delayOf.get(id)===20000).forEach(([,fn])=>fn());await tick();
  assert.equal(f.tracks[0].stopped,1);assert.equal(f.el('live-state').textContent,'已通关 · 麦克风已关闭');
});
