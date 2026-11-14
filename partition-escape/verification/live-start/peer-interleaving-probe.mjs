// Independent, fully mocked browser lifecycle probes; no real network or capture.
import assert from 'node:assert/strict';
import {setupLive} from '../../live-client.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
const response=data=>({ok:true,json:async()=>data});
function env({fixture=false,delayStart=false,delayStatus=false}={}){
 const elements=new Map(),listeners={},calls=[],mics=[],contexts=[],streams=[],statuses=[],starts=[],timers=new Set();let timerId=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{id,disabled:false,textContent:'',dataset:{},append(x){elements.set(x.id,x)}});return elements.get(id)};
 const view={role:'west',controllers:{east:'live'},paused:false};
 globalThis.document={hidden:false,querySelector:()=>el('live-panel'),getElementById:el,createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f};
 globalThis.window={addEventListener:(n,f)=>listeners[n]=f};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{const p=deferred();mics.push(p);return p.promise}}}});
 const status={remaining:1,totalUsd:.5,runtimeReady:true,fixture};
 globalThis.fetch=async(url,opt={})=>{
  const c={url,body:opt.body?JSON.parse(opt.body):null};calls.push(c);
  if(url.endsWith('status')){if(delayStatus){const p=deferred();statuses.push(p);return p.promise}return response(status)}
  if(url.endsWith('stream')){const reads=[];const reader={read(){const p=deferred();reads.push(p);return p.promise},cancel:async()=>{reader.cancelled=true},cancelled:false};streams.push({reader,reads});return {ok:true,body:{getReader:()=>reader,cancel:async()=>{reader.cancelled=true}}}}
  if(url.endsWith('start')&&delayStart){const p=deferred();starts.push(p);return p.promise}
  return response({ok:true});
 };
 globalThis.AudioContext=class{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{}};this.startedAudio=0;contexts.push(this)}
  async resume(){this.state='running'}async close(){this.state='closed'}
  createMediaStreamSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{value:1},connect(){return this}}}
  createBuffer(_c,len,sr){return {duration:len/sr,getChannelData:()=>new Float32Array(len)}}
  createBufferSource(){const c=this;return {connect(){},start(){c.startedAudio++},stop(){}}}
 };
 globalThis.AudioWorkletNode=class{constructor(){this.port={}}connect(){return {connect(){}}}disconnect(){}};
 globalThis.setInterval=globalThis.setTimeout=()=>{const id=++timerId;timers.add(id);return id};globalThis.clearInterval=globalThis.clearTimeout=id=>timers.delete(id);
 const api=setupLive({room:'offline-review',key:'fixture-only',getView:()=>view});
 const track=()=>{const t={readyState:'live',stopCount:0,stop(){this.readyState='ended';this.stopCount++}};return {t,getTracks:()=>[t]}};
 const event=(events,idx=0)=>{streams[idx].reads.shift().resolve({done:false,value:new TextEncoder().encode(events.map(x=>JSON.stringify(x)).join('\n')+'\n')})};
 return {el,view,api,track,mics,contexts,streams,calls,statuses,starts,status,listeners,timers,event,start:()=>el(fixture?'live-fixture':'live-start').onclick(),summary:()=>({state:el('live-state').textContent,startPosts:calls.filter(c=>c.url.endsWith('start')).length,stopPosts:calls.filter(c=>c.body?.type==='stop').length,mics:mics.length,contexts:contexts.map(c=>c.state),audio:contexts.reduce((n,c)=>n+c.startedAudio,0),timers:timers.size})};
}
const results=[];
{
 const h=env();await tick();const old=h.start();await tick();h.api.stop('cancel old permission');const second=h.start();await tick();const fresh=h.track();h.mics[1].resolve(fresh);await second;const before=h.summary();const stale=h.track();h.mics[0].resolve(stale);await old;await tick();assert.equal(stale.t.readyState,'ended');assert.equal(fresh.t.readyState,'live');assert.deepEqual(h.summary(),before);results.push({case:'old permission resolves after new attempt is running',...h.summary(),oldTrackStopped:stale.t.stopCount,freshTrackStopped:fresh.t.stopCount});h.api.stop();
}
{
 const h=env();await tick();const old=h.start();await tick();h.api.stop('cancel old permission');const second=h.start();await tick();const fresh=h.track();h.mics[1].resolve(fresh);await second;const before=h.summary();h.mics[0].reject(Object.assign(Error('old rejected'),{name:'NotAllowedError'}));await old;await tick();assert.deepEqual(h.summary(),before);results.push({case:'old permission rejects after new attempt is running',...h.summary()});h.api.stop();
}
{
 const h=env({fixture:true,delayStart:true});await tick();const p=h.start();await tick();h.event([{type:'closed',reason:'fixture_stop'},{type:'ready'},{type:'audio',epoch:0,data:'AAAAAA=='},{type:'transcript',speaker:'partner',epoch:0,text:'stale text'}]);await tick();h.starts[0].resolve(response({ok:true}));await p;assert.match(h.el('live-state').textContent,/fixture_stop/);assert.equal(h.el('live-stop').disabled,true);assert.equal(h.el('live-interrupt').disabled,true);assert.equal(h.summary().audio,0);assert.equal(h.summary().timers,0);assert.equal(h.el('live-partner').textContent,'');results.push({case:'closed then ready/audio/transcript in same chunk before start resolves',...h.summary()});
}
{
 const h=env({fixture:true});await tick();await h.start();h.api.stop('manual stop');h.event([{type:'closed',reason:'late_closed'},{type:'ready'},{type:'audio',epoch:0,data:'AAAAAA=='}]);await tick();assert.equal(h.el('live-state').textContent,'manual stop');assert.equal(h.summary().audio,0);assert.equal(h.summary().timers,0);results.push({case:'late stream events after explicit stop',...h.summary()});
}
{
 const h=env();await tick();const p=h.start();await tick();h.view.paused=true;h.api.update();const t=h.track();h.mics[0].resolve(t);await p;assert.equal(t.t.readyState,'ended');assert.equal(h.summary().startPosts,0);results.push({case:'pause while permission pending',...h.summary()});
}
{
 const h=env();await tick();const p=h.start();await tick();h.listeners.pagehide();const t=h.track();h.mics[0].resolve(t);await p;assert.equal(t.t.readyState,'ended');assert.equal(h.summary().startPosts,0);results.push({case:'pagehide while permission pending',...h.summary()});
}
console.log(JSON.stringify({offline:true,actualNetworkRequests:0,actualMicrophoneRequests:0,passed:results.length,results},null,2));
