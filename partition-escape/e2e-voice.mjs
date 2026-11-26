#!/usr/bin/env node
// A REAL end-to-end game: the real page in Chrome, a synthesized voice as the microphone, and
// real Gemini Live as the partner.
//
//     This spends ONE connection of the local grant (.live) and real provider usage.
//     Run it only when the project owner has said so.
//
// What is real: the server started with `npm start`, the page and its buttons, the page's own
// audio path (16 kHz context, mic-worklet voice detection, uplink, reply playback), the provider
// session, the tool calls and the rules. What is not: the capture device. `getUserMedia` is
// answered with a stream this script feeds, and each player line is spoken by a system voice
// (macOS `say`) into that stream. So this does not check a physical microphone, room echo or
// the browser's permission prompt; only a person at the page can.
//
// The first exchange is two sentences joined with a measured gap: long enough for the page's voice
// detection to end the first, short enough that the second starts before the partner has answered.
// That is the timing in which a reply used to be dropped (test_live_audio.py, playtest of
// 2026-11-25). The script fails that step if no reply audio is scheduled, and records from the
// worker's own log whether the provider reported an interruption in between. --opening-only stops
// after that exchange.
//
// Writes result.json, the spoken lines and screenshots under E2E_OUT.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

// --dry-run does everything before the session (page, room, buttons, voice detection) and spends nothing.
const dryRun=process.argv.includes('--dry-run'),openingOnly=process.argv.includes('--opening-only');
if(!dryRun&&!process.argv.includes('--spend-one-connection')){
  console.error('refused: this makes a real Gemini Live connection. Pass --spend-one-connection once the project owner has approved it, or --dry-run.');
  process.exit(2);
}
const env=(name,fallback)=>process.env[name]||fallback;
const origin=env('E2E_ORIGIN','http://127.0.0.1:4174');
const out=path.resolve(env('E2E_OUT','.runs/e2e-voice'));
const chromePath=env('E2E_CHROME','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const voice=env('E2E_VOICE','Tingting');                 // any installed voice that speaks the lines' language
const TURN_MS=Number(env('E2E_TURN_MS','60000'));        // how long to wait for one request to take effect
const GAP_MS=Number(env('E2E_GAP_MS','800'));            // silence between the two opening sentences: the voice detection ends an utterance after 700 ms
const runs=path.resolve(env('E2E_RUNS','.runs'));        // where the server keeps its run records, to read the worker's own log
const {chromium}=createRequire(import.meta.url)(env('E2E_PLAYWRIGHT','playwright'));
fs.mkdirSync(out,{recursive:true});
const OPENING=['你好，我在西间。','请把你那边的黄铜钥匙从传物槽递给我。'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const started=Date.now(),at=()=>Math.round((Date.now()-started)/100)/10;
const log=(...x)=>console.log(String(at()).padStart(6)+'s ',...x);

// --- the player's voice ------------------------------------------------------
const RATE=24000;
let spoken=0;
function synthesize(text){
  const file=path.join(out,`line-${String(++spoken).padStart(2,'0')}.wav`);
  execFileSync('say',['-v',voice,'--file-format=WAVE',`--data-format=LEI16@${RATE}`,'-o',file,text]);
  return file;
}
function samples(file){
  const b=fs.readFileSync(file);
  for(let o=12;o<b.length;){
    const id=b.toString('ascii',o,o+4),size=b.readUInt32LE(o+4);
    if(id==='data')return new Int16Array(b.buffer.slice(b.byteOffset+o+8,b.byteOffset+o+8+size));
    o+=8+size+(size&1);
  }
  throw Error('no audio data in '+file);
}
// A system voice pads each line with silence of its own; cut it, so the gap between two lines is exactly the one asked for.
function trimmed(pcm){
  const n=Math.round(RATE*.02),loud=i=>{let sum=0;for(let k=i;k<i+n&&k<pcm.length;k++)sum+=(pcm[k]/32768)**2;return Math.sqrt(sum/n)>.03;};
  let a=0;while(a<pcm.length&&!loud(a))a+=n;
  let z=pcm.length-n;while(z>a&&!loud(z))z-=n;
  return pcm.slice(a,Math.min(pcm.length,z+n));
}
function wav(pcm){
  const h=Buffer.alloc(44);
  h.write('RIFF',0);h.writeUInt32LE(36+pcm.byteLength,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
  h.writeUInt32LE(RATE,24);h.writeUInt32LE(RATE*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.byteLength,40);
  return Buffer.concat([h,Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)]);
}
// One line, or several joined with `gapMs` of silence, as base64 WAV for the page.
function speech(parts,gapMs){
  const files=parts.map(synthesize);
  if(files.length===1)return fs.readFileSync(files[0]).toString('base64');
  const pieces=files.map(f=>trimmed(samples(f))),gap=Math.round(RATE*gapMs/1000);
  const joined=new Int16Array(pieces.reduce((n,p)=>n+p.length,0)+gap*(pieces.length-1));
  let at=0;for(const [i,piece] of pieces.entries()){if(i)at+=gap;joined.set(piece,at);at+=piece.length;}
  const file=path.join(out,`line-${String(spoken).padStart(2,'0')}-joined.wav`);fs.writeFileSync(file,wav(joined));
  return fs.readFileSync(file).toString('base64');
}

// --- runs in the page before its own scripts ------------------------------------
function installFakeMicrophone(){
  const e2e=window.__e2e={micRequests:0,played:0,scheduled:0,playingUntil:0,playback:null,errors:[]};
  let ctx,dest;
  const mic=()=>{if(!ctx){ctx=new AudioContext();dest=ctx.createMediaStreamDestination();}return ctx;};
  navigator.mediaDevices.getUserMedia=async()=>{e2e.micRequests++;await mic().resume();return dest.stream;};
  e2e.speak=async b64=>{
    await mic().resume();
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),buffer=await ctx.decodeAudioData(bytes.buffer);
    const node=ctx.createBufferSource();node.buffer=buffer;node.connect(dest);
    await new Promise(done=>{node.onended=done;node.start();});
    return buffer.duration;
  };
  // What the page itself schedules for playback is the partner's voice. The player's lines are
  // not counted: they play on the fake microphone's own context.
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when=0,...rest){
    if(this.context!==ctx){
      const from=Math.max(when,this.context.currentTime);
      e2e.played+=this.buffer.duration;e2e.scheduled++;e2e.playback=this.context;
      e2e.playingUntil=Math.max(e2e.playingUntil,from+this.buffer.duration);
    }
    return start.call(this,when,...rest);
  };
  e2e.quiet=()=>!e2e.playback||e2e.playback.state!=='running'||e2e.playback.currentTime>=e2e.playingUntil;
  window.addEventListener('error',e=>e2e.errors.push(String(e.message)));
}
// The page's own voice detection, fed one line, before any session exists: nothing is spent.
async function voiceDetectionSeesSpeech(b64){
  const c=new AudioContext({sampleRate:16000});await c.resume();await c.audioWorklet.addModule('/mic-worklet.js');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const node=new AudioWorkletNode(c,'partition-capture'),seen=[],at=[];let frames=0;const t0=performance.now();
  node.port.onmessage=e=>{if(e.data.type==='audio')frames++;else{seen.push(e.data.type);at.push(Math.round(performance.now()-t0));}};
  const silent=c.createGain();silent.gain.value=0;node.connect(silent).connect(c.destination);
  c.createMediaStreamSource(stream).connect(node);
  const seconds=await window.__e2e.speak(b64);await new Promise(r=>setTimeout(r,1200));await c.close();
  window.__e2e.micRequests=0;
  return {seen,at_ms:at,frames,seconds};
}

// --- browser ------------------------------------------------------------------
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'partition-e2e-chrome-'));
const chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1440,900',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const result={source:'real page in Chrome + synthesized voice as microphone + real Gemini Live',origin,voice,steps:[],problem:null};
let browser;
async function cleanup(){
  try{await browser?.close();}catch{}
  chrome.kill();await delay(300);
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
try{
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<200&&!fs.existsSync(portFile);i++)await delay(50);
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split('\n')[0],{noDefaults:true});
  const context=browser.contexts()[0],page=context.pages()[0];
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(installFakeMicrophone);
  const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,200));});
  page.on('pageerror',e=>consoleErrors.push('pageerror: '+String(e.message).slice(0,200)));

  // Lobby -> room, through the page's own controls. One tab only: a hidden tab ends voice.
  await page.goto(origin+'/');
  await page.locator('#create:enabled').click();
  const westLink=await page.locator('#invite a.primary').first().getAttribute('href');
  await page.goto(origin+westLink);
  const hash=new URLSearchParams(westLink.split('#')[1]),room=hash.get('room'),key=hash.get('key');
  result.room=room;
  const api=suffix=>fetch(`${origin}/api/rooms/${room}${suffix}`,{headers:{Authorization:'Bearer '+key}}).then(r=>r.json());
  const view=()=>api('');
  const ui=()=>page.evaluate(()=>{
    const text=s=>document.querySelector(s)?.textContent||'';
    return {state:text('#live-state'),heard:text('#live-you'),partner:text('#live-partner'),receipt:text('#live-result'),
      scene:text('#scene-state'),pending:document.querySelector('#pending')?.innerText.replace(/\n+/g,' | ')||'',
      overlay:document.querySelector('#overlay')?.innerText.replace(/\n+/g,' | ').slice(0,120)||'',
      played:window.__e2e.played,scheduled:window.__e2e.scheduled,quiet:window.__e2e.quiet(),mic:window.__e2e.micRequests};
  });
  async function until(check,ms,every=250){
    const deadline=Date.now()+ms;
    for(;;){const value=await check();if(value)return value;if(Date.now()>deadline)return null;await delay(every);}
  }
  const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
  await page.locator('#live-start').waitFor();
  for(const thing of ['plaque','power','door','hatch']){await page.locator(`[data-object="${thing}"]`).click();await delay(400);}

  const before=await api('/live-status');
  result.limits={seconds:before.seconds,usageStopUsd:before.usageStopUsd};result.connections_before=before.remaining;
  if(!before.runtimeReady||!before.remaining||before.projectVerified===false)throw Error(`not started, no connection spent: runtime=${before.runtimeCode} remaining=${before.remaining}`);

  const probe=await page.evaluate(voiceDetectionSeesSpeech,speech(['喂喂，能听到我说话吗？']));
  result.voice_detection=probe;log('voice detection on one synthesized line:',JSON.stringify(probe));
  if(probe.seen[0]!=='start'||!probe.seen.includes('end'))throw Error('not started, no connection spent: the page\'s voice detection did not see the synthesized line');

  if(dryRun){
    // The joined opening through the same voice detection: it must come out as two utterances.
    result.opening_probe=await page.evaluate(voiceDetectionSeesSpeech,speech(OPENING,GAP_MS));log('opening through voice detection:',JSON.stringify(result.opening_probe));
    await shot('00-dry-run');result.dry_run=await ui();throw Error('dry run: stopped before starting a session');
  }

  // --- the session ------------------------------------------------------------
  await page.locator('#live-start:enabled').click();
  const listening=await until(async()=>{const u=await ui();return /在听/.test(u.state)?u:/语音未启动|语音已停止|没有麦克风/.test(u.state)?{failed:u.state}:null;},40000);
  if(!listening||listening.failed)throw Error('the session did not start: '+(listening?.failed||(await ui()).state));
  const sessionStart=Date.now();log('listening:',listening.state,'| microphone requests:',listening.mic);
  await shot('01-listening');

  async function turn(name,lines,reached,{gapMs}={}){
    const record={step:name,tries:[]};result.steps.push(record);
    for(const line of lines.slice(0,3)){
      if(/语音已停止|已结束|麦克风关/.test((await ui()).state)){record.ended=(await ui()).state;break;}
      await until(async()=>(await ui()).quiet,30000);   // never talk over the partner by accident
      const start=await ui(),parts=Array.isArray(line)?line:[line];
      const spokenFor=await page.evaluate(b64=>window.__e2e.speak(b64),speech(parts,gapMs));
      const spokenAt=Date.now();let firstReply=null;
      const done=await until(async()=>{
        const u=await ui();if(firstReply===null&&u.played>start.played)firstReply=(Date.now()-spokenAt)/1000;
        return reached(await view());
      },TURN_MS);
      const reachedAt=(Date.now()-spokenAt)/1000;
      await until(async()=>{const u=await ui();return u.played>start.played&&u.quiet;},25000);   // let the reply play out
      const end=await ui();
      const attempt={said:parts.join(' … '),speech_s:+spokenFor.toFixed(2),heard:end.heard,partner:end.partner,receipt:end.receipt,
        first_reply_s:firstReply&&+firstReply.toFixed(2),reached_s:done?+reachedAt.toFixed(2):null,reply_audio_s:+(end.played-start.played).toFixed(2)};
      record.tries.push(attempt);
      log(`${name}: ${done?'done':'not yet'} | heard「${attempt.heard.replace(/^我听到：/,'')}」| reply ${attempt.reply_audio_s}s`);
      if(done){record.reached=true;return true;}
    }
    record.reached=false;return false;
  }
  // From the worker's log: how the two opening sentences arrived, and whether the provider reported
  // an interruption between them. Without one, nothing told the old worker to stop dropping audio.
  function openingRecord(room,last){
    const record={gap_ms:GAP_MS,reply_audio_s:last.reply_audio_s};
    try{
      const events=JSON.parse(fs.readFileSync(path.join(runs,room,'east','live-public.json'),'utf8')).events;
      const starts=events.filter(e=>e.kind==='interrupted'&&e.trigger==='local_voice').slice(0,2);
      const reply=events.find(e=>e.kind==='tool_response'&&e.at_ms>(starts[1]?.at_ms??Infinity));
      const between=events.filter(e=>e.at_ms>=(starts[0]?.at_ms??0)&&e.at_ms<=(reply?.at_ms??Infinity));
      Object.assign(record,{utterances:starts.length,second_started_ms_after_first:starts[1]&&starts[1].at_ms-starts[0].at_ms,
        provider_interrupted:between.some(e=>e.kind==='provider_interrupted'),
        turns_completed_before_reply:between.filter(e=>e.kind==='turn_complete').length});
    }catch{record.worker_log='not readable from here (set E2E_RUNS to the server\'s .runs folder)';}
    return record;
  }
  const signal=name=>v=>name in (v.signals||{});
  const press=async selector=>{await page.locator(selector).click();await delay(500);};
  const plan=[
    ['key offered',[OPENING,'请现在把黄铜钥匙递给我。','请递出钥匙。'],
      v=>v.pending?.action==='send-key',async()=>{
        await shot('02-key-offered');await press('#accept');await press('#use-key');
        await press('[data-object="power"]');await press('#inspect [data-action="power-on"]');
      },{gapMs:GAP_MS,replyRequired:true}],
    ['brake held',['钥匙我接到了，门锁开了，动力也接通了。请拉住手闸。','请现在拉住手闸。','请拉住手闸，把闸门固定住。'],
      signal('hold-brake'),()=>press('#inspect [data-action="power-off"]')],
    ['power-off confirmed',['我提了一个共同动作，切断动力。你拉着手闸，闸门不会落下。请确认这个提议。','请接受切断动力的提议。','请确认切断动力。'],
      v=>v.local.power===false&&!v.pending,null],
    ['brace fitted',['动力断了，风扇应该停了。请查看检修风扇，把后面的木撑取出来装好。','请现在取出并安装木撑。','请安装木撑。'],
      signal('brace'),null],
    ['brake released',['很好。请松开手闸，看看木撑能不能撑住闸门。','请现在松开手闸。','请松开手闸。'],
      signal('release-brake'),async()=>{await press('[data-object="door"]');await press('#inspect [data-action="open-door"]');}],
    ['door confirmed',['我提了一个共同动作，推开西门。请确认这个提议。','请接受推开西门的提议。','请确认推开西门。'],
      v=>v.local.doorOpen===true,null],
    ['both outside',['西门开了。请走向共同出口，我们一起出去。','请现在走向共同出口。','请走向共同出口。'],
      v=>v.complete===true,null],
  ];
  for(const [name,lines,reached,then,options={}] of plan){
    if(!await turn(name,lines,reached,options)){result.problem=name+' not reached';break;}
    const last=result.steps.at(-1).tries.at(-1);
    if(options.replyRequired){
      result.opening=openingRecord(room,last);log('opening:',JSON.stringify(result.opening));
      if(!(last.reply_audio_s>0)){result.problem='no reply audio was played after two sentences with a pause';break;}
      if(openingOnly)break;
    }
    if(then)await then();
  }
  await shot('03-end');
  const final=await view();result.complete=final.complete===true;
  if(result.complete){
    // Winning must close the microphone by itself: the winning screen covers the stop button.
    const closed=await until(async()=>{const u=await ui();return /已通关/.test(u.state)?u:null;},30000);
    result.closed_after_win=closed?closed.state:'still open: '+(await ui()).state;result.overlay=(await ui()).overlay;
    log('after winning:',result.closed_after_win);
  }
  if(!/已通关|语音已停止|麦克风关/.test((await ui()).state)){
    await page.evaluate(()=>{const b=document.querySelector('#live-stop');if(b&&!b.disabled)b.click();});await delay(1500);
  }
  await shot('04-after');
  const after=await api('/live-status'),end=await ui();
  Object.assign(result,{session_s:+((Date.now()-sessionStart)/1000).toFixed(1),final_state:end.state,reply_audio_s:+end.played.toFixed(2),
    reply_buffers:end.scheduled,microphone_requests:end.mic,connections_after:after.remaining,sync:after.sync,
    console_errors:consoleErrors,page_errors:await page.evaluate(()=>window.__e2e.errors)});
}catch(error){
  result.problem=result.problem||String(error.message||error);
}finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  await cleanup();
}
console.log(JSON.stringify({room:result.room,complete:result.complete,problem:result.problem,session_s:result.session_s,
  reply_audio_s:result.reply_audio_s,closed_after_win:result.closed_after_win,connections:[result.connections_before,result.connections_after],
  console_errors:result.console_errors?.length}));
process.exit(result.problem?1:0);
