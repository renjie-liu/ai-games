// Independent, fully mocked browser lifecycle probes; no real network or capture.
import assert from 'node:assert/strict';
import {setupLive} from '../../live-client.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
const response=data=>({ok:true,json:async()=>data});
function env({fixture=false,delayStart=false,delayStatus=false,delayStream=false}={}){
 const elements=new Map(),listeners={},calls=[],mics=[],contexts=[],streams=[],statuses=[],starts=[],streamResponses=[],timers=new Set();let timerId=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{id,disabled:false,textContent:'',dataset:{},append(x){elements.set(x.id,x)}});return elements.get(id)};
 const view={role:'west',controllers:{east:'live'},paused:false};
 globalThis.document={hidden:false,querySelector:()=>el('live-panel'),getElementById:el,createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f};
 globalThis.window={addEventListener:(n,f)=>listeners[n]=f};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{const p=deferred();mics.push(p);return p.promise}}}});
 const status={remaining:1,totalUsd:.5,runtimeReady:true,fixture};
 globalThis.fetch=async(url,opt={})=>{
  const c={url,body:opt.body?JSON.parse(opt.body):null};calls.push(c);
  if(url.endsWith('status')){if(delayStatus){const p=deferred();statuses.push(p);return p.promise}return response(status)}
  if(url.endsWith('stream')){const reads=[];const reader={read(){const p=deferred();reads.push(p);return p.promise},cancel:async()=>{reader.cancelled=true},cancelled:false};streams.push({reader,reads});const response={ok:true,body:{getReader:()=>reader,cancel:async()=>{reader.cancelled=true}}};if(delayStream){const pending=deferred();streamResponses.push({pending,response});return pending.promise}return response}
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
 return {el,view,api,track,mics,contexts,streams,calls,statuses,starts,streamResponses,status,listeners,timers,event,start:()=>el(fixture?'live-fixture':'live-start').onclick(),summary:()=>({state:el('live-state').textContent,startPosts:calls.filter(c=>c.url.endsWith('start')).length,stopPosts:calls.filter(c=>c.body?.type==='stop').length,mics:mics.length,contexts:contexts.map(c=>c.state),audio:contexts.reduce((n,c)=>n+c.startedAudio,0),timers:timers.size})};
}

const h=env({delayStream:true});await tick();const p=h.start();await tick();const t=h.track();h.mics[0].resolve(t);await tick();const context=h.contexts[0];context.state='suspended';context.onstatechange();h.streamResponses[0].pending.resolve(h.streamResponses[0].response);await p;console.log(JSON.stringify({case:'AudioContext suspends while stream connection awaits',...h.summary(),trackState:t.t.readyState,stopDisabled:h.el('live-stop').disabled,interruptDisabled:h.el('live-interrupt').disabled},null,2));h.api.stop();
