import {python,pythonEnv} from './harness-paths.mjs';
// Local HTTP duplex bridge: authenticated NDJSON downlink + ordered PCM POST uplink.
// Google WebSocket and credentials exist only in the Python worker.
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const id=()=>randomBytes(16).toString('hex');
export function runtimeStatus(root,run=spawnSync){
  try{
    const result=run(python,[path.join(root,'live_runtime.py')],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:4096});
    const data=JSON.parse(result.stdout);
    if(result.status===0&&data.ok===true&&data.code==='ready')return {ready:true,code:'ready'};
    if(['live_dependency_sdk','live_dependency_socks','live_dependency_http_proxy','live_dependency_websocket','live_runtime_check_failed'].includes(data.code))return {ready:false,code:data.code};
  }catch{}
  return {ready:false,code:'live_runtime_check_failed'};
}
export class LiveHub {
  constructor(root,origin,enabled=false){this.root=root;this.origin=origin;this.enabled=enabled;this.jobs=new Map();this.runtime=enabled?runtimeStatus(root):{ready:false,code:'disabled'};}
  status(){
    let remaining=0;
    try{
      const d=JSON.parse(fs.readFileSync(path.join(this.root,'.live/ledger.json')));
      const marker=JSON.parse(fs.readFileSync(path.join(this.root,'.live/authorization.json')));
      if(d.authorization==='partition-live-20261114-v1'&&marker.authorization===d.authorization&&Array.isArray(d.attempts)&&d.limits?.connections===2)remaining=Math.max(0,2-d.attempts.length);
    }catch{} // A new checkout or missing ledger never creates credit.
    return {enabled:this.enabled,runtimeReady:this.runtime.ready,runtimeCode:this.runtime.code,fixture:process.env.PARTITION_LIVE_FIXTURE==='1',model:'gemini-3.8-live',remaining,seconds:60,totalUsd:.50,creditsVerified:false};
  }
  get(room){
    if(!this.jobs.has(room.id))this.jobs.set(room.id,{scope:id(),epoch:0,tickets:new Map(),started:false,ended:false,speaking:false,stream:null,worker:null,lastSeen:Date.now(),events:[]});
    return this.jobs.get(room.id);
  }
  emit(room,e){const j=this.get(room);if(j.stream&&!j.stream.destroyed){if(j.stream.writableLength>1024*1024){this.stop(room,'client_backpressure');return;}j.stream.write(JSON.stringify(e)+'\n');}}
  attach(room,res){
    const j=this.get(room);if(j.stream&&!j.stream.destroyed)throw Error('Live page already connected');
    j.stream=res;j.lastSeen=Date.now();res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    this.emit(room,{type:'state',state:j.started?(j.ended?'stopped':'connecting'):'off',...this.status()});
    res.on('close',()=>{if(j.stream===res){j.stream=null;this.stop(room,'browser_disconnected');}});
  }
  start(room,fixture=false){
    const j=this.get(room);if(!this.enabled||j.started||j.ended||!j.stream)throw Error('Live unavailable, already used, or missing stream');
    if(!fixture&&!this.runtime.ready)throw Error(this.runtime.code);
    if(!fixture&&this.status().remaining===0)throw Error('Live authorization exhausted');
    if([...this.jobs.values()].some(x=>x.started&&!x.ended))throw Error('Another Live session is active');
    const seat=['west','east'].find(s=>room.controllers[s]==='live');if(!seat)throw Error('Not a Live room');
    j.started=true;j.seat=seat;j.fixture=fixture;room.liveFixture=fixture;j.runRoot=path.join(this.root,'.runs',room.id,seat);fs.mkdirSync(j.runRoot,{recursive:true});
    const env={...process.env,...pythonEnv,PARTITION_CONTROLLER:'live',
      PARTITION_ENDPOINT:`${this.origin}/api/rooms/${room.id}`,PARTITION_SEAT_TOKEN:room.tokens[seat],PARTITION_SEAT:seat,
      PARTITION_RUN_ROOT:j.runRoot,PARTITION_LIVE_SCOPE:j.scope,PARTITION_LIVE_FIXTURE:fixture?'1':'0'};
    delete env.ELEVENLABS_API_KEY;
    const child=spawn(python,[path.join(this.root,'live_worker.py')],{cwd:this.root,env,stdio:['pipe','pipe','pipe']});j.worker=child;
    let pending='';child.stdout.on('data',chunk=>{pending+=chunk;if(pending.length>2000000){this.stop(room,'worker_overflow');return;}
      let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{const e=JSON.parse(line);
        if(e.type==='tool'){j.events.push(e);if(j.events.length>40)j.events.shift();}
        if(e.type==='closed'){j.ended=true;room.worker[seat]={source:j.fixture?'offline-fixture':'live',status:'stopped',message:e.reason};}
        this.emit(room,e);
      }catch{ /* Do not reflect arbitrary process output into the browser. */ }} });
    child.stdin.on('error',()=>this.stop(room,'worker_pipe_closed'));
    child.stderr.on('data',()=>{}); // SDK errors can include request metadata: never forward/log raw stderr.
    child.on('error',()=>{j.ended=true;this.emit(room,{type:'closed',reason:'worker_start_failed'});});
    child.on('exit',()=>{j.ended=true;clearInterval(j.timer);clearTimeout(j.deadline);this.emit(room,{type:'closed',reason:'worker_stopped'});});
    j.timer=setInterval(()=>{if(Date.now()-j.lastSeen>6000)this.stop(room,'client_heartbeat_lost');},1000);
    j.deadline=setTimeout(()=>this.stop(room,'session_deadline'),65000);
    room.worker[seat]={status:'running',source:fixture?'offline-fixture':'live'};
  }
  input(room,b){
    const j=this.get(room);if(b.type==='stop'){this.stop(room,'user_stop');return;}if(!j.started||j.ended)throw Error('Live session not running');j.lastSeen=Date.now();
    if(b.type==='heartbeat')return;
    if(b.type==='stop'){this.stop(room,'user_stop');return;}
    if(!['audio','start','end','text'].includes(b.type))throw Error('Invalid Live input');
    if(b.type==='audio'&&(typeof b.data!=='string'||b.data.length>10000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)))throw Error('Invalid PCM frame');
    if(b.type==='text'&&(typeof b.text!=='string'||b.text.length>500))throw Error('Invalid text');
    if(b.type==='start'||b.type==='text'){j.scope=id();j.epoch++;j.tickets.clear();j.speaking=b.type==='start';this.emit(room,{type:'interrupted',epoch:j.epoch});}
    if(b.type==='end')j.speaking=false;
    if(j.worker?.stdin.writable){if(j.worker.stdin.writableLength>150000){this.stop(room,'uplink_backpressure');return;}
      j.worker.stdin.write(JSON.stringify({...b,scope:j.scope,epoch:j.epoch})+'\n');}
  }
  observe(room,role,scope){
    const j=this.get(room);if(role!==j.seat||j.ended||j.speaking||scope!==j.scope)return {ok:false,code:'live_superseded'};
    const ticket=id();j.tickets.clear();j.tickets.set(ticket,{scope:j.scope,rev:room.rev,expires:Date.now()+15000});
    return {ok:true,ticket,scope:j.scope,view:room.view(role)};
  }
  command(room,role,b){
    const j=this.get(room),t=j.tickets.get(b.ticket);j.tickets.delete(b.ticket);
    if(role!==j.seat||j.ended||j.speaking||!t||t.scope!==j.scope||t.rev!==room.rev||t.expires<Date.now()){
      return {ok:false,code:'live_superseded',message:'旧观察已失效，请重新观察。',receipt:{requestId:id(),source:'live-gate',seat:role,
        command:'未支持的操作',outcome:'waiting',code:'live_superseded',roomEventIds:[],changes:{},proposalId:null},view:room.view(role)};
    }
    const c=b.command,arg=c?.type==='say'?'text':'id';
    if(!c||!['inspect','share','action','say','accept','decline','cancel'].includes(c.type)||Object.keys(c).sort().join(',')!==[arg,'type'].sort().join(',')||typeof c[arg]!=='string'||(arg==='text'?(!c.text.trim()||c.text.length>500):! /^[a-zA-Z0-9_-]{1,100}$/.test(c.id)))return {ok:false,code:'invalid_tool',view:room.view(role)};
    // No await between gate and engine: interruption and dispatch serialize on Node's event loop.
    const result=room.command(role,b.command);return {...result,view:room.view(role)};
  }
  stop(room,reason){const j=this.get(room);if(j.ended)return;j.ended=true;j.tickets.clear();clearInterval(j.timer);clearTimeout(j.deadline);
    if(j.worker?.stdin.writable)j.worker.stdin.end(JSON.stringify({type:'stop',reason})+'\n');
    if(j.worker){const timer=setTimeout(()=>j.worker.kill('SIGTERM'),2000);j.worker.once('exit',()=>clearTimeout(timer));}
    this.emit(room,{type:'closed',reason});
  }
  close(){for(const j of this.jobs.values()){clearInterval(j.timer);clearTimeout(j.deadline);j.worker?.kill('SIGTERM');j.stream?.end();}}
}
