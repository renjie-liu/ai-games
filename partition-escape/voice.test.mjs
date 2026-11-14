import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Room} from './world.mjs';
import {authorizedSpeech,createVoiceService,readElevenKey,elevenSpeech,TTS_ENDPOINT,TTS_MODEL,mockTone} from './voice.mjs';

const config={approved:true,id:'offline-unit',endpoint:TTS_ENDPOINT,model:TTS_MODEL,billingVerified:true,voiceId:'JBFqnCBsd6RMkjVDRZzb',expiresAt:'2099-01-01T00:00:00Z',requests:2,characters:20,perRequest:10,microUsd:1000,microUsdPerCharacter:100};
function fixture(t,changes={}){
  const directory=fs.mkdtempSync(path.join(import.meta.dirname,'voice-unit-'));
  const approved={...config,...changes};
  fs.writeFileSync(path.join(directory,'authorization.json'),JSON.stringify(approved));
  fs.writeFileSync(path.join(directory,'ledger.json'),JSON.stringify({version:1,id:approved.id,configHash:createHash('sha256').update(JSON.stringify(approved)).digest('hex'),disabled:false,entries:{}}));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const r=new Room();r.say('east','测试');const event=r.rev;
  let calls=0;const services=[];
  const start=(extra={})=>{const s=createVoiceService({directory,mode:'elevenlabs',keyLoader:()=> 'KEY_PRIVATE_SENTINEL',provider:async()=>{calls++;return mockTone();},...extra});services.push(s);return s;};
  t.after(()=>services.forEach(s=>{try{s.close();}catch{}}));
  return {directory,r,event,start,calls:()=>calls};
}
test('off is zero budget and never loads a key or sends',async()=>{
  const s=createVoiceService({keyLoader:()=>{throw Error('must not read');}});
  assert.equal(s.status().limits.requests,0);await assert.rejects(s.speak(),/voice_disabled/);
});
test('key parser reads literal only without sourcing or echoing shell contents',t=>{
  const f=fixture(t),p=path.join(f.directory,'bashrc');
  fs.writeFileSync(p,"echo DO_NOT_RUN\nexport ELEVENLABS_API_KEY='literal_test_key_123456'\n");
  assert.equal(readElevenKey(p,{}),'literal_test_key_123456');
  fs.writeFileSync(p,'export ELEVENLABS_API_KEY="$(echo DO_NOT_RUN)"');
  assert.throws(()=>readElevenKey(p,{}),/^Error: voice_key_unavailable$/);
});
test('speech selects peer public script events only; no private observations or free text',t=>{
  const {r,event}=fixture(t);r.notes.east.push({id:'private',text:'PRIVATE_SENTINEL'});
  assert.equal(authorizedSpeech(r,'west',event).text,'测试');
  assert.throws(()=>authorizedSpeech(r,'watch',event),/permission/);
  assert.throws(()=>authorizedSpeech(r,'east',event),/permission/);
  assert.throws(()=>authorizedSpeech(r,'west',999),/not_allowed/);
  r.command('east',{type:'inspect',id:'fan'});assert.throws(()=>authorizedSpeech(r,'west',r.rev),/not_allowed/);
  r.say('west','PRIVATE_SENTINEL');assert.throws(()=>authorizedSpeech(r,'west',r.rev),/not_allowed/);
  r.paused=true;assert.throws(()=>authorizedSpeech(r,'west',event),/paused/);
});
test('cache and duplicate concurrent clicks spend one reservation; restart retains it',async t=>{
  const f=fixture(t);let release;const s=f.start({provider:()=>new Promise(resolve=>release=()=>resolve(mockTone()))});
  const a=s.speak(f.r,'west',f.event),b=s.speak(f.r,'west',f.event);release();
  await Promise.all([a,b]);assert.equal(s.status().used.requests,1);s.close();
  const next=f.start();assert.equal((await next.speak(f.r,'west',f.event)).cached,true);assert.equal(f.calls(),0);
  const ledger=fs.readFileSync(path.join(f.directory,'ledger.json'),'utf8');
  assert(!ledger.includes('KEY_PRIVATE_SENTINEL'));assert(!ledger.includes('测试'));
});
test('failed request consumes reservation forever, no retry after restart',async t=>{
  const f=fixture(t);let attempts=0;const s=f.start({provider:async()=>{attempts++;throw Error('KEY_PRIVATE_SENTINEL');}});
  await assert.rejects(s.speak(f.r,'west',f.event),/^Error: voice_generation_failed_no_retry$/);s.close();
  await assert.rejects(f.start().speak(f.r,'west',f.event),/already_attempted/);assert.equal(attempts,1);
});
for(const [name,limits] of [['requests',{requests:1}],['characters',{characters:3}],['money',{microUsd:300}]])test(`${name} cap checked cumulatively before send`,async t=>{
  const f=fixture(t,limits),s=f.start();await s.speak(f.r,'west',f.event);f.r.say('east','再试');
  await assert.rejects(s.speak(f.r,'west',f.r.rev),/budget_exhausted/);assert.equal(f.calls(),1);
});
test('per-request cap rejects without charging or truncating',async t=>{
  const f=fixture(t,{perRequest:1}),s=f.start();await assert.rejects(s.speak(f.r,'west',f.event),/budget_exhausted/);assert.equal(f.calls(),0);
});
test('exclusive lock prevents simultaneous services; config change cannot replenish quota',t=>{
  const f=fixture(t),s=f.start();assert.throws(()=>f.start(),/service_locked/);s.close();
  fs.writeFileSync(path.join(f.directory,'authorization.json'),JSON.stringify({...config,id:'new-output'}));
  assert.throws(()=>f.start(),/ledger_mismatch/);
});
test('global disable aborts current audio, persists across restart, blocks cached playback',async t=>{
  const f=fixture(t);let started;const s=f.start({provider:({signal})=>new Promise((resolve,reject)=>{started=true;signal.addEventListener('abort',()=>reject(Error()));})});
  const p=s.speak(f.r,'west',f.event);assert(started);s.disable();await assert.rejects(p,/generation_failed/);s.close();
  const next=f.start();assert.equal(next.status().enabled,false);await assert.rejects(next.speak(f.r,'west',f.event),/disabled/);
});
test('missing/expired authorization, unverified rate, excessive limits and corrupt ledger fail closed',t=>{
  const f=fixture(t);
  for(const c of [{approved:false},{expiresAt:'2000-01-01'},{billingVerified:false},{microUsdPerCharacter:0},{requests:11},{endpoint:'https://example.com/'}]){
    fs.writeFileSync(path.join(f.directory,'authorization.json'),JSON.stringify({...config,...c}));assert.throws(()=>f.start());
  }
  fs.writeFileSync(path.join(f.directory,'authorization.json'),JSON.stringify(config));fs.writeFileSync(path.join(f.directory,'ledger.json'),'{}');assert.throws(()=>f.start(),/ledger_mismatch/);
});
test('deleting a real-mode ledger cannot recreate an approved allowance',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.directory,'ledger.json'));assert.throws(()=>f.start(),/authorized_ledger_required/);
});
test('mock uses separate zero-dollar ledger and never reads key or invokes provider',async t=>{
  const f=fixture(t),s=f.start({mode:'mock',keyLoader:()=>{throw Error();},provider:()=>{throw Error();}});
  const a=await s.speak(f.r,'west',f.event);assert.equal(a.audio.subarray(0,4).toString(),'RIFF');assert.equal(a.source,'mock');assert.equal(s.status().used.microUsd,0);assert.equal(f.calls(),0);
});
test('HTTP adapter pins endpoint, language and model; redirects/errors get no retry or raw response',async t=>{
  const original=globalThis.fetch;let seen,count=0;
  globalThis.fetch=async(url,options)=>{count++;seen={url,options};return new Response('PRIVATE_SENTINEL',{status:500});};t.after(()=>globalThis.fetch=original);
  await assert.rejects(elevenSpeech({text:'公开消息',config,key:'FAKE_KEY'}),/^Error: voice_provider_failed$/);
  assert.equal(count,1);assert.equal(seen.url,TTS_ENDPOINT+config.voiceId+'?output_format=mp3_44100_128');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.headers['xi-api-key'],'FAKE_KEY');
  assert.deepEqual(JSON.parse(seen.options.body),{text:'公开消息',model_id:TTS_MODEL,language_code:'zh'});
});
