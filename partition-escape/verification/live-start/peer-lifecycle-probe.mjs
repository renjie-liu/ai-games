// Pure JS offline probe. No DOM permission, network, microphone, model, or ledger access.
import {setupLive} from '../../live-client.mjs';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
async function scenario(name,{pendingMic=false,fixture=false,eofBeforeStart=false}={}){
  const els=new Map(),listeners={},calls=[],read=defer(),mic=defer(),started=defer();
  const el=id=>{if(!els.has(id))els.set(id,{id,disabled:false,textContent:'',dataset:{},append(x){els.set(x.id,x)}});return els.get(id)};
  const track={stopped:false,readyState:'live',stop(){this.stopped=true;this.readyState='ended'}},stream={getTracks:()=>[track]};
  globalThis.document={hidden:false,querySelector:()=>el('live-panel'),getElementById:el,createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f};
  globalThis.window={addEventListener:(n,f)=>listeners[n]=f};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{calls.push({kind:'mic_requested'});return pendingMic?mic.promise:stream}}}});
  globalThis.fetch=async(url,opts={})=>{
    calls.push({kind:'fetch',path:url,body:opts.body?JSON.parse(opts.body):undefined});
    if(url.endsWith('status'))return {ok:true,json:async()=>({remaining:1,totalUsd:.5,runtimeReady:true,fixture})};
    if(url.endsWith('stream'))return {ok:true,body:{getReader:()=>({read:()=>read.promise,cancel:async()=>{}})}};
    if(url.endsWith('start')&&eofBeforeStart)return started.promise;
    return {ok:true,json:async()=>({ok:true})};
  };
  let contexts=[];globalThis.AudioContext=class {
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{}};contexts.push(this)}
    async resume(){this.state='running'} async close(){this.state='closed'}
    createMediaStreamSource(){return {connect(){},disconnect(){}}} createGain(){return {gain:{value:1},connect(){return this}}}
  };
  globalThis.AudioWorkletNode=class {constructor(){this.port={}}connect(){return {connect(){}}}disconnect(){}};
  globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
  const api=setupLive({room:'offline',key:'fixture-token',getView:()=>({role:'west',controllers:{east:'live'},paused:false})});await tick();
  const promise=(fixture?el('live-fixture'):el('live-start')).onclick();await tick();
  if(pendingMic){document.hidden=true;listeners.visibilitychange();mic.resolve(stream)}
  if(eofBeforeStart){read.resolve({done:true});await tick();started.resolve({ok:true,json:async()=>({ok:true})})}
  await promise;await tick();
  const result={name,hidden:document.hidden,modelStartPosts:calls.filter(x=>x.path?.endsWith('start')).length,stopPosts:calls.filter(x=>x.body?.type==='stop').length,micRequested:calls.some(x=>x.kind==='mic_requested'),micStopped:track.stopped,contextStates:contexts.map(x=>x.state),state:el('live-state').textContent,stopDisabled:el('live-stop').disabled,interruptDisabled:el('live-interrupt').disabled};
  await api.stop('probe cleanup');return result;
}
const results=[await scenario('background while microphone permission is unresolved',{pendingMic:true}),await scenario('fixture stream EOF before start response',{fixture:true,eofBeforeStart:true})];
console.log(JSON.stringify({offline:true,actualNetworkRequests:0,actualMicrophoneRequests:0,results},null,2));
