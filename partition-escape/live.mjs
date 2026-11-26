import {SyncStatus} from './live-sync.mjs';
import {PublicUpdates,updateTrace,updateLimits} from './live-updates.mjs';
import {loadLimits} from './live-limits.mjs';
import {python,pythonEnv} from './harness-paths.mjs';
// Local HTTP duplex bridge: authenticated NDJSON downlink + ordered PCM POST uplink.
// Google WebSocket and credentials exist only in the Python worker.
import {execFile,spawn,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const runFile=promisify(execFile);
const id=()=>randomBytes(16).toString('hex');
// How long after the worker's own session cap the server ends a session that did not end itself.
const DEADLINE_GRACE_MS=5000;
// The only reasons live_runtime.py may give; nothing else it prints reaches the page.
const RUNTIME_CODES=['live_dependency_sdk','live_dependency_socks','live_dependency_http_proxy','live_dependency_websocket',
  'live_harness_mismatch','live_limits_invalid','live_runtime_check_failed'];
export function runtimeStatus(root,run=spawnSync){
  try{
    const result=run(python,[path.join(root,'live_runtime.py')],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:4096,env:{...process.env,...pythonEnv}});
    const data=JSON.parse(result.stdout);
    if(result.status===0&&data.ok===true&&data.code==='ready')return {ready:true,code:'ready'};
    if(RUNTIME_CODES.includes(data.code))return {ready:false,code:data.code};
  }catch{}
  return {ready:false,code:'live_runtime_check_failed'};
}
export class LiveHub {
  constructor(root,origin,enabled=false,limits=loadLimits()){
    this.root=root;this.origin=origin;this.enabled=enabled;this.jobs=new Map();this.runtime=enabled?runtimeStatus(root):{ready:false,code:'disabled'};
    // One source for every cap (live-limits.json): the worker enforces them, the page shows them.
    this.session=limits.session;this.updates=updateLimits(limits.updates);
    this.spawn=spawn; // the one place a worker process is made
  }
  status(){
    let quota={remaining:0,connectionLimit:0,projectVerified:false,totalUsd:null};
    if(this.enabled){
      // Read the same grant and validation rules that the worker uses to reserve a connection.
      const result=spawnSync(python,[path.join(this.root,'live_budget.py')],{cwd:this.root,encoding:'utf8',timeout:2000,maxBuffer:2048});
      if(result.status===0){try{quota=JSON.parse(result.stdout);}catch{}}
    }
    const s=this.session;
    return {enabled:this.enabled,runtimeReady:this.runtime.ready,runtimeCode:this.runtime.code,fixture:process.env.PARTITION_LIVE_FIXTURE==='1',model:'gemini-3.8-live',
      seconds:s.seconds,inputSeconds:s.input_seconds,outputSeconds:s.output_seconds,usageStopUsd:s.usage_stop_usd,creditsVerified:false,...quota};
  }
  get(room){
    if(!this.jobs.has(room.id))this.jobs.set(room.id,{generation:0,scope:id(),epoch:0,tickets:new Map(),started:false,ended:false,speaking:false,stream:null,worker:null,lastSeen:Date.now(),events:[]});
    const j=this.jobs.get(room.id);
    if(!j.sync)j.sync=new SyncStatus(this.updates);
    if(!j.updates)j.updates=new PublicUpdates(room,j,b=>this.write(room,b),{limits:this.updates,audit:(rows,omitted,row)=>{
      if(j.sync.accept(row)&&!j.ended)this.emit(room,{type:'sync_status',sync:j.sync.snapshot()});
      if(j.runRoot){try{fs.writeFileSync(path.join(j.runRoot,'live-context-node.json'),JSON.stringify({events:rows,omitted}));}catch{j.auditPersistenceFailed=true;}}
    }});
    return j;
  }
  playerView(room,role){
    const view=room.view(role);
    if(room.controllers[role]==='human'&&Object.values(room.controllers).includes('live'))view.liveSync=this.get(room).sync.snapshot();
    return view;
  }
  renew(room){
    const old=this.get(room);
    if(!old.ended)throw Error('本次语音尚未结束，请返回当前语音页。');
    if(old.worker&&!old.workerClosed)throw Error('上一段语音正在关闭，请稍后再点继续。');
    if(room.paused||room.view('watch').complete)throw Error('请先恢复未结束的游戏。');
    old.stream?.end();
    this.jobs.delete(room.id);
    const next=this.get(room);
    next.generation=old.generation+1;
    next.previousRunRoot=old.runRoot||old.previousRunRoot;
    return next.generation;
  }
  emit(room,e){const j=this.get(room);if(j.stream&&!j.stream.destroyed){if(j.stream.writableLength>1024*1024){this.stop(room,'client_backpressure');return;}j.stream.write(JSON.stringify(e)+'\n');}}
  attach(room,res){
    const j=this.get(room);if(j.stream&&!j.stream.destroyed)throw Error('Live page already connected');
    j.stream=res;j.lastSeen=Date.now();res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    this.emit(room,{type:'state',state:j.started?(j.ended?'stopped':'connecting'):'off',...this.status()});
    res.on('close',()=>{if(this.jobs.get(room.id)===j&&j.stream===res){j.stream=null;this.stop(room,'browser_disconnected');}});
  }
  start(room,fixture=false){
    const j=this.get(room);if(!this.enabled||j.started||j.ended||!j.stream)throw Error('Live unavailable, already used, or missing stream');
    if(!fixture&&!this.runtime.ready)throw Error(this.runtime.code);
    if(!fixture){
      const quota=this.status();
      if(quota.remaining===0)throw Error('live_authorization_exhausted');
      if(!quota.projectVerified)throw Error('live_project_unverified');
    }
    if([...this.jobs.values()].some(x=>x.started&&!x.ended))throw Error('Another Live session is active');
    const seat=['west','east'].find(s=>room.controllers[s]==='live');if(!seat)throw Error('Not a Live room');
    j.started=true;j.seat=seat;j.fixture=fixture;j.sync.start(fixture);this.emit(room,{type:'sync_status',sync:j.sync.snapshot()});room.liveFixture=fixture;
    const base=path.join(this.root,'.runs',room.id,seat);
    j.runRoot=j.generation?path.join(base,'sessions',String(j.generation)):base;
    fs.mkdirSync(j.runRoot,{recursive:true});
    const env={...process.env,...pythonEnv,PARTITION_CONTROLLER:'live',
      PARTITION_ENDPOINT:`${this.origin}/api/rooms/${room.id}`,PARTITION_SEAT_TOKEN:room.tokens[seat],PARTITION_SEAT:seat,
      PARTITION_RUN_ROOT:j.runRoot,PARTITION_LIVE_SCOPE:j.scope,PARTITION_LIVE_FIXTURE:fixture?'1':'0'};
    delete env.ELEVENLABS_API_KEY;
    const child=this.spawn(python,[path.join(this.root,'live_worker.py')],{cwd:this.root,env,stdio:['pipe','pipe','pipe']});j.worker=child;
    let pending='';child.stdout.on('data',chunk=>{pending+=chunk;if(pending.length>2000000){this.stop(room,'worker_overflow');return;}
      let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{const e=JSON.parse(line);
        if(e.type==='context_update'){if(j.sync.accept(e))this.emit(room,{type:'sync_status',sync:j.sync.snapshot()});continue;}
        if(e.type==='tool'){j.events.push(e);if(j.events.length>40)j.events.shift();}
        if(e.type==='closed'){this.finish(room,e.reason,e);continue;}
        this.emit(room,e);
      }catch{ /* Do not reflect arbitrary process output into the browser. */ }} });
    child.stdin.on('error',()=>this.stop(room,'worker_pipe_closed'));
    child.stderr.on('data',()=>{}); // SDK errors can include request metadata: never forward/log raw stderr.
    child.on('error',()=>this.finish(room,'worker_start_failed'));
    child.on('exit',()=>this.finish(room,'worker_stopped')); // Do not replace an earlier terminal reason.
    child.once('close',()=>{j.workerClosed=true;});
    j.timer=setInterval(()=>{if(Date.now()-j.lastSeen>6000)this.stop(room,'client_heartbeat_lost');},1000);
    j.deadline=setTimeout(()=>this.stop(room,'session_deadline'),this.session.seconds*1000+DEADLINE_GRACE_MS);
    room.worker[seat]={status:'running',source:fixture?'offline-fixture':'live'};
  }
  input(room,b){
    const j=this.get(room);
    if(b.type==='stop'){this.stop(room,b.reason==='tab_hidden'?'tab_hidden':'user_stop');return;}
    if(!j.started||j.ended)throw Error('Live session not running');j.lastSeen=Date.now();
    if(b.type==='heartbeat')return;
    if(!['audio','start','end','text'].includes(b.type))throw Error('Invalid Live input');
    if(b.type==='audio'&&(typeof b.data!=='string'||b.data.length>10000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)))throw Error('Invalid PCM frame');
    if(b.type==='text'&&(typeof b.text!=='string'||b.text.length>500))throw Error('Invalid text');
    if(b.type==='start'||b.type==='text'){j.scope=id();j.epoch++;j.tickets.clear();j.updates.rebind();j.speaking=b.type==='start';this.emit(room,{type:'interrupted',epoch:j.epoch});}
    if(b.type==='end')j.speaking=false;
    // `playing` is the page saying the partner's voice was audible when the player began: a count for the record, nothing else.
    this.write(room,{...b,...(b.type==='start'?{playing:b.playing===true}:{}),scope:j.scope,epoch:j.epoch});
  }
  write(room,b){
    const j=this.get(room);if(j.ended)return false;
    if(j.worker?.stdin.writable){if(j.worker.stdin.writableLength>150000){this.stop(room,'uplink_backpressure');return false;}
      j.worker.stdin.write(JSON.stringify(b)+'\n');return true;}
    return false;
  }
  async tracePage(room,seat,directory){
    let html=await fs.promises.readFile(path.join(directory,'live-studio.html'),'utf8');
    // Old snapshots used only the Chinese placeholder. Re-read on viewer refresh
    // even if the worker has finished and there will be no more writes.
    if(html.includes(' · 无可读记录</p>')){
      try{
        const {stdout}=await runFile(python,['-I',path.join(this.root,'live_trace.py'),directory,room.id,seat],
          {encoding:'utf8',env:{PATH:process.env.PATH},timeout:5000,maxBuffer:8*1024*1024});
        html=stdout;
      }catch{ /* The existing snapshot still explicitly identifies the unreadable segment. */ }
    }
    return this.trace(room,html);
  }
  trace(room,html){const j=this.get(room);return html.replace('</body>',updateTrace(j.updates.rows,j.updates.omitted,this.updates)+(j.auditPersistenceFailed?'<p>本地同步审计文件写入失败；以下记录仅在当前进程内保留。</p>':'')+'</body>');}
  notify(room,role,command,result){this.get(room).updates.enqueue(role,command,result);}

  observe(room,role,scope){
    const j=this.get(room);if(role!==j.seat||j.ended||j.speaking||scope!==j.scope)return {ok:false,code:'live_superseded'};
    const ticket=id();j.tickets.clear();j.tickets.set(ticket,{scope:j.scope,rev:room.rev,expires:Date.now()+15000});
    // An observation is a look around the partner's own room: the facts of its own objects come
    // with it (and change with the room, as the fan's does once the gate has risen).
    room.look(role);
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
  finish(room,reason,event={type:'closed',reason}){
    const j=this.get(room);if(j.ended)return false;
    j.ended=true;j.stopReason=reason;j.updates.clear(reason);j.sync.close();this.emit(room,{type:'sync_status',sync:j.sync.snapshot()});j.tickets.clear();clearInterval(j.timer);clearTimeout(j.deadline);
    if(j.seat)room.worker[j.seat]={source:j.fixture?'offline-fixture':'live',status:'stopped',message:reason};
    this.emit(room,event);return true;
  }
  stop(room,reason){const j=this.get(room);if(!this.finish(room,reason))return;
    if(j.worker?.stdin.writable)j.worker.stdin.end(JSON.stringify({type:'stop',reason})+'\n');
    if(j.worker){const timer=setTimeout(()=>j.worker.kill('SIGTERM'),2000);j.worker.once('exit',()=>clearTimeout(timer));}
  }
  close(){for(const j of this.jobs.values()){j.updates.clear();clearInterval(j.timer);clearTimeout(j.deadline);j.worker?.kill('SIGTERM');j.stream?.end();}}
}
