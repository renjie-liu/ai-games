// Server-only, finite TTS. No SDK, streaming session, retry, or browser-supplied text.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';

export const TTS_ENDPOINT='https://api.elevenlabs.io/v1/text-to-speech/';
export const TTS_MODEL='eleven_flash_v2_5';
export const HARD_LIMITS={requests:10,characters:1000,perRequest:200,microUsd:100000};
const fail=code=>Object.assign(new Error(code),{code});
const hash=s=>createHash('sha256').update(s).digest('hex');
function save(file,value){
  const fd=fs.openSync(file+'.tmp','w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(file+'.tmp',file);
}

// Read only a literal assignment; never source .bashrc or execute shell expansion.
export function readElevenKey(file=path.join(os.homedir(),'.bashrc'),env=process.env){
  const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,256}$/.test(v);
  if(valid(env.ELEVENLABS_API_KEY))return env.ELEVENLABS_API_KEY;
  let text;try{text=fs.readFileSync(file,'utf8');}catch{throw fail('voice_key_unavailable');}
  const matches=[...text.matchAll(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*(?:"([A-Za-z0-9_-]{16,256})"|'([A-Za-z0-9_-]{16,256})'|([A-Za-z0-9_-]{16,256}))\s*(?:#.*)?$/gm)];
  const m=matches.at(-1),key=m&&(m[1]||m[2]||m[3]);
  if(!valid(key))throw fail('voice_key_unavailable');return key;
}

export function authorizedSpeech(room,role,eventId){
  if(!['west','east'].includes(role)||room.controllers[role]!=='human')throw fail('voice_permission_denied');
  if(room.paused)throw fail('voice_paused');
  const peer=role==='west'?'east':'west';
  const e=room.view(role).events.find(e=>e.id===eventId);
  if(!Number.isSafeInteger(eventId)||!e||e.seat!==peer||e.source!=='script'||room.controllers[peer]!=='script'||!['message','clue'].includes(e.type))throw fail('voice_event_not_allowed');
  const chars=[...e.text].length;
  if(!chars||chars>HARD_LIMITS.perRequest)throw fail('voice_text_too_long');
  // No local/scene/notes, user prose, Trace, model prompts, or other-seat observation.
  return {text:e.text,chars,cacheId:hash(JSON.stringify([room.id,role,e.id,e.text]))};
}

function authorization(config){
  if(!config||config.approved!==true||config.endpoint!==TTS_ENDPOINT||config.model!==TTS_MODEL||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.id||'')||!config.billingVerified||
    !/^[A-Za-z0-9]{20}$/.test(config.voiceId||'')||
    !Number.isFinite(Date.parse(config.expiresAt))||Date.parse(config.expiresAt)<=Date.now())throw fail('voice_authorization_required');
  for(const k of ['requests','characters','perRequest','microUsd'])if(!Number.isSafeInteger(config[k])||config[k]<=0||config[k]>HARD_LIMITS[k])throw fail('voice_invalid_limits');
  if(!Number.isSafeInteger(config.microUsdPerCharacter)||config.microUsdPerCharacter<1||config.microUsdPerCharacter>100000)throw fail('voice_billing_rate_required');
  return config;
}

export async function elevenSpeech({text,config,key,signal}){
  // Fixed destination. Redirects/errors never trigger a second request or expose bodies.
  const r=await fetch(TTS_ENDPOINT+config.voiceId+'?output_format=mp3_44100_128',{
    method:'POST',redirect:'error',signal,headers:{'xi-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({text,model_id:TTS_MODEL,language_code:'zh'})
  });
  if(!r.ok){await r.body?.cancel();throw fail('voice_provider_failed');}
  if(!/^audio\/mpeg(?:;|$)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw fail('voice_invalid_audio');}
  let size=0;const chunks=[];
  for await(const chunk of r.body){size+=chunk.length;if(size>2*1024*1024)throw fail('voice_audio_too_large');chunks.push(chunk);}
  if(!size)throw fail('voice_empty_audio');return {audio:Buffer.concat(chunks),mime:'audio/mpeg'};
}

export function mockTone(){
  const count=4000,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)b.writeInt16LE(Math.round(2200*Math.sin(i*2*Math.PI*440/16000)),44+i*2);
  return {audio:b,mime:'audio/wav'};
}

export function createVoiceService({directory,mode='off',provider=elevenSpeech,keyLoader=readElevenKey}={}){
  if(!['off','mock','elevenlabs'].includes(mode))throw fail('voice_invalid_mode');
  if(mode==='off')return {status:()=>({mode,enabled:false,reason:'未确认额度，ElevenLabs 未启用',limits:{requests:0,characters:0,perRequest:0,microUsd:0},used:{requests:0,characters:0,microUsd:0}}),speak:async()=>{throw fail('voice_disabled');},disable:()=>{},close:()=>{}};
  // Fixed directory is supplied by server3d, never by a request or output flag.
  const dir=mode==='mock'?path.join(directory,'mock'):directory;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const config=mode==='mock'?{...HARD_LIMITS,id:'offline-mock',microUsdPerCharacter:0,expiresAt:'2099-01-01T00:00:00Z'}:
    authorization(JSON.parse(fs.readFileSync(path.join(dir,'authorization.json'),'utf8')));
  const lock=path.join(dir,'service.lock');let lockFd;
  try{lockFd=fs.openSync(lock,'wx',0o600);}catch{throw fail('voice_service_locked');}
  const ledgerPath=path.join(dir,'ledger.json');
  let ledger,key;
  try{
    fs.writeFileSync(lockFd,String(process.pid));
    if(fs.existsSync(ledgerPath))ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
    else {
      if(mode!=='mock')throw fail('voice_authorized_ledger_required');
      ledger={version:1,id:config.id,configHash:hash(JSON.stringify(config)),disabled:false,entries:{}};save(ledgerPath,ledger);
    }
    if(ledger.version!==1||ledger.id!==config.id||ledger.configHash!==hash(JSON.stringify(config))||typeof ledger.disabled!=='boolean'||!ledger.entries||typeof ledger.entries!=='object'||Array.isArray(ledger.entries))throw fail('voice_ledger_mismatch');
    for(const [id,e] of Object.entries(ledger.entries))if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(e.chars)||e.chars<1||!Number.isSafeInteger(e.microUsd)||e.microUsd<0||!['reserved','ready','failed'].includes(e.state))throw fail('voice_invalid_ledger');
    key=mode==='elevenlabs'?keyLoader():undefined;
  }catch(e){fs.closeSync(lockFd);fs.unlinkSync(lock);throw fail(e.code?.startsWith('voice_')?e.code:'voice_configuration_unavailable');}
  const inflight=new Map(),aborters=new Set();let closed=false;
  const used=()=>Object.values(ledger.entries).reduce((v,e)=>({requests:v.requests+1,characters:v.characters+e.chars,microUsd:v.microUsd+e.microUsd}),{requests:0,characters:0,microUsd:0});
  function status(){return {mode,enabled:!closed&&!ledger.disabled&&Date.now()<Date.parse(config.expiresAt),reason:ledger.disabled?'语音已全局停用；重启不会重置':'',limits:Object.fromEntries(Object.keys(HARD_LIMITS).map(k=>[k,config[k]])),used:used(),billing:mode==='mock'?'offline-fixture; zero external requests':'按已确认费率预留上限；失败也不退回，非供应商账单'};}
  async function speak(room,role,eventId){
    const speech=authorizedSpeech(room,role,eventId),id=speech.cacheId;
    if(!status().enabled)throw fail('voice_disabled');
    if(inflight.has(id))return inflight.get(id);
    const entry=ledger.entries[id],cache=path.join(dir,id+'.audio');
    if(entry){
      if(entry.state==='ready'&&fs.existsSync(cache))return {audio:fs.readFileSync(cache),mime:mode==='mock'?'audio/wav':'audio/mpeg',cached:true,source:mode,eventId};
      throw fail('voice_already_attempted'); // No retry after failure/crash/missing cache.
    }
    const u=used(),cost=speech.chars*config.microUsdPerCharacter;
    if(speech.chars>config.perRequest||u.requests+1>config.requests||u.characters+speech.chars>config.characters||u.microUsd+cost>config.microUsd)throw fail('voice_budget_exhausted');
    ledger.entries[id]={chars:speech.chars,microUsd:cost,state:'reserved'};save(ledgerPath,ledger);
    const ctrl=new AbortController();aborters.add(ctrl);const timer=setTimeout(()=>ctrl.abort(),12000);
    const job=(async()=>{
      try{
        const result=mode==='mock'?mockTone():await provider({text:speech.text,config,key,signal:ctrl.signal});
        if(ctrl.signal.aborted||!status().enabled)throw fail('voice_disabled');
        fs.writeFileSync(cache,result.audio,{mode:0o600});ledger.entries[id].state='ready';save(ledgerPath,ledger);
        return {...result,cached:false,source:mode,eventId};
      }catch{
        ledger.entries[id].state='failed';save(ledgerPath,ledger);throw fail('voice_generation_failed_no_retry');
      }finally{clearTimeout(timer);aborters.delete(ctrl);}
    })();inflight.set(id,job);try{return await job;}finally{inflight.delete(id);}
  }
  function disable(){ledger.disabled=true;save(ledgerPath,ledger);for(const a of aborters)a.abort();}
  function close(){closed=true;for(const a of aborters)a.abort();fs.closeSync(lockFd);fs.unlinkSync(lock);}
  return {status,speak,disable,close};
}
