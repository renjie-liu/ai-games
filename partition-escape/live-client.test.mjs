// Lifecycle tests run the production client with isolated DOM/audio/fetch fixtures.
// No browser permission, microphone, SDK, real transport or authorization files.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('./live-client.mjs',import.meta.url),'utf8').replace('export function setupLive','function setupLive');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({gate,fixtureMode=false}={}){
  const elements=new Map(),listeners={},calls=[],contexts=[],tracks=[],timers=new Map(),wait=deferred(),micWaits=[];
  const view={role:'west',controllers:{east:'live'},paused:false};let nextTimer=0,micCalls=0,cancelCount=0,sourceCount=0,played=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{id,disabled:['live-stop','live-interrupt'].includes(id),textContent:'',dataset:{},append(x){elements.set(x.id,x);}});return elements.get(id);};
  let pendingRead,rows=[];
  const reader={read:()=>rows.length?Promise.resolve(rows.shift()):(pendingRead=deferred()).promise,cancel:async()=>{cancelCount++;pendingRead?.resolve({done:true});}};
  const body={getReader:()=>reader,cancel:async()=>{cancelCount++;}};
  function push(row){const value=row===null?{done:true}:{done:false,value:new TextEncoder().encode(JSON.stringify(row)+'\n')};if(pendingRead){const p=pendingRead;pendingRead=null;p.resolve(value);}else rows.push(value);}
  function capture(){const t={readyState:'live',stopped:0,stop(){this.readyState='ended';this.stopped++;}};tracks.push(t);return {getTracks:()=>[t]};}
  const response=data=>({ok:true,json:async()=>data});
  const document={hidden:false,querySelector:()=>el('live-panel'),getElementById:el,createElement:()=>({}),addEventListener:(k,f)=>listeners[k]=f};
  const fetch=async(url,opts={})=>{
    const kind=url.split('/').at(-1).replace('live-','');calls.push({kind,body:opts.body?JSON.parse(opts.body):null,signal:opts.signal});
    if(kind==='status'){
      if((gate==='status'&&calls.filter(c=>c.kind==='status').length>1)||(gate==='initial-status'&&calls.filter(c=>c.kind==='status').length===1))await wait.promise;
      return response({remaining:1,totalUsd:.5,runtimeReady:true,fixture:fixtureMode});
    }
    if(kind==='stream'){if(gate==='stream')await wait.promise;return {ok:true,body};}
    if(kind==='start'){if(gate==='start')await wait.promise;return response({ok:true});}
    return response({ok:true});
  };
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{if(gate==='module')await wait.promise;}};contexts.push(this);}
    async resume(){if(gate==='resume')await wait.promise;if(this.state!=='closed')this.state='running';}
    async close(){this.state='closed';}
    createMediaStreamSource(){sourceCount++;return {connect(t){return t;},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(t){return t;}};}
    createBuffer(channels,length){return {duration:length/24000,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){return {connect(){},start(){played++;},stop(){this.onended?.();}};}
  }
  class AudioWorkletNode {constructor(){this.port={};}connect(t){return t;}disconnect(){}}
  const sandbox={document,window:{addEventListener:(k,f)=>listeners[k]=f},fetch,AudioContext,AudioWorkletNode,AbortController,TextDecoder,Uint8Array,DataView,
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
    navigator:{mediaDevices:{getUserMedia:async()=>{micCalls++;if(gate!=='mic')return capture();const d=micWaits.length?deferred():wait;micWaits.push(d);return d.promise;}}},
    setInterval:f=>{timers.set(++nextTimer,f);return nextTimer;},clearInterval:id=>timers.delete(id),
    setTimeout:f=>{timers.set(++nextTimer,f);return nextTimer;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(sandbox);vm.runInContext(code,sandbox);
  const client=sandbox.setupLive({room:'offline-lifecycle',key:'fixture-token',getView:()=>view});
  return {el,calls,contexts,tracks,timers,wait,micWaits,reader,document,view,client,push,capture,
    start:()=>el(fixtureMode?'live-fixture':'live-start').onclick(),
    cancel:()=>el('live-stop').onclick(),
    background(){document.hidden=true;listeners.visibilitychange();},
    pagehide(){listeners.pagehide();},pause(){view.paused=true;client.update();},
    stats:()=>({micCalls,cancelCount,sourceCount,played}),starts:()=>calls.filter(c=>c.kind==='start').length};
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
