import {python,pythonEnv} from './harness-paths.mjs';
import http from 'node:http';
import {readFile,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Room} from './world.mjs';
import {createVoiceService} from './voice.mjs';
import {LiveHub} from './live.mjs';
import {loadHosting,loadInvites,findInvite,idleRooms,INVITE_HEADER} from './hosting.mjs';
import {PAGE,PAGE_FILES} from './page-files.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
// Whether the server can be reached from outside this machine, and who may then play (hosting.json).
const hosting=loadHosting();
const port=Number(process.env.PORT||4174), host='127.0.0.1';
// The server's own address on this machine: what the workers it starts call back on.
const origin=`http://${host}:${port}`;
// Who is answered. The loopback names are answered to callers on this machine only. A hosted
// server is also asked under its public address, by anyone; who may play there is the invitations'.
const localHosts=[`${host}:${port}`,`localhost:${port}`];
const publicHost=hosting.public_origin?new URL(hosting.public_origin).host:null;
// Pages published somewhere else that may call this server from a browser (hosting.json).
const pages=new Set(hosting.page_origins);
const origins=new Set([origin,`http://localhost:${port}`,...(hosting.public_origin?[hosting.public_origin]:[]),...pages]);
// What such a page's requests may carry: the room's key, JSON, the invitation's code, the voice session's number.
const PAGE_HEADERS='Authorization, Content-Type, X-Partition-Invite, X-Live-Generation';
const fromHere=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const answered=req=>(localHosts.includes(req.headers.host)&&fromHere(req))||(publicHost!==null&&req.headers.host===publicHost);
// The invitation whose code the caller sent, or null. The file is read each time, so an invitation
// added while the server runs counts at once. One that cannot be read invites nobody: the reason
// goes to the operator's log and never to the caller.
function invitationOf(req){
  try{return findInvite(loadInvites(hosting.invites_file),req.headers[INVITE_HEADER]);}
  catch(e){
    // Anyone can make the server look at the file: the same complaint is logged once a minute, not once a request.
    if(e.message!==complained.message||Date.now()-complained.at>60_000){console.error(e.message);complained={message:e.message,at:Date.now()};}
    return null;
  }
}
let complained={message:'',at:0};
// When each invitation made its rooms, for the hourly cap.
const roomsMade=new Map();
const rooms=new Map(), children=new Set();
const live=new LiveHub(root,origin,process.env.PARTITION_ALLOW_LIVE==='1');
const liveOnly=process.env.PARTITION_LIVE_ONLY==='1';
if(live.enabled&&!live.runtime.ready)console.error(`Gemini Live 语音不可用（${live.runtime.code}）。Python：${python}；harness：${pythonEnv.PARTITION_HARNESS_ROOT}。准备方法见 README 的「本机启动」。`);
let tts;
try{tts=createVoiceService({directory:path.join(root,'.voice'),mode:process.env.PARTITION_TTS_MODE||'off'});}
catch{tts=createVoiceService();console.error('TTS unavailable: authorization, ledger, key or lock requires local review. Game remains available.');}
// The page's files (page-files.mjs): the page under its three ways in, and what it loads.
const files=new Map([['/',PAGE],['/play',PAGE],['/watch',PAGE],...PAGE_FILES.map(file=>['/'+file,file])]);
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'};
function send(res,status,data,type='application/json; charset=utf-8'){
  // A response marked for a page elsewhere (see the request handler) is that page's to read.
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':res.hasHeader('Access-Control-Allow-Origin')?'cross-origin':'same-origin',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; font-src 'self'; frame-ancestors 'self'; object-src 'none'"});
  res.end(typeof data==='object'&&!Buffer.isBuffer(data)?JSON.stringify(data):data);
}
async function body(req){let b='';for await(const x of req){b+=x;if(b.length>20000)throw Error('请求过大');}return JSON.parse(b||'{}');}
async function startSeat(room,seat){
  const runRoot=path.join(root,'.runs',room.id,seat);await mkdir(runRoot,{recursive:true});
  const log=await open(path.join(runRoot,'worker.log'),'a');
  room.worker[seat]={status:'starting',source:room.controllers[seat]};
  const workerEnv={...process.env};delete workerEnv.ELEVENLABS_API_KEY;
  const child=spawn(python,[path.join(root,'seat_worker.py')],{cwd:root,
    env:{...workerEnv,...pythonEnv,PARTITION_ENDPOINT:`${origin}/api/rooms/${room.id}`,
      PARTITION_SEAT_TOKEN:room.tokens[seat],PARTITION_SEAT:seat,PARTITION_RUN_ROOT:runRoot,
      PARTITION_CONTROLLER:room.controllers[seat]},stdio:['ignore',log.fd,log.fd]});
  children.add(child);
  child.on('error',()=>{room.worker[seat]={status:'error',source:room.controllers[seat],message:'Harness 未启动。检查 PARTITION_PYTHON 与本地 worker.log。'};room.event('system','error','席位 harness 启动失败。','runner');});
  child.on('exit',code=>{children.delete(child);log.close();if(code!==0){room.worker[seat]={status:'error',source:room.controllers[seat],message:'Harness 已停止。检查本地 worker.log；没有切换为假 AI。'};room.event('system','error',`${seat} harness 停止。`,'runner');}});
}
function studioRoot(room,seat){
  if(room.controllers[seat]==='live'){
    const job=live.get(room);
    if(job.runRoot||job.previousRunRoot)return job.runRoot||job.previousRunRoot;
  }
  return path.join(root,'.runs',room.id,seat);
}
const server=http.createServer(async(req,res)=>{
  try{
    if(!answered(req))return send(res,403,{error:publicHost?'请从公开地址访问。':'只允许本机访问'});
    if(req.headers.origin && !origins.has(req.headers.origin))return send(res,403,{error:'跨站请求被拒绝'});
    // A page published elsewhere, at an address this server names: its browser is told that the
    // page may read the answer, and what it may send. Nothing else about the request changes: a
    // room still takes an invitation and a seat still takes its key.
    if(pages.has(req.headers.origin)){
      res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
      if(req.method==='OPTIONS'){
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':PAGE_HEADERS,'Access-Control-Max-Age':'7200','Cache-Control':'no-store'});
        return res.end();
      }
    }
    const u=new URL(req.url,origin);
    if(u.pathname==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,localOnly:publicHost===null,tts:tts.status().mode,live:live.status()});
    if(u.pathname==='/api/capabilities'&&req.method==='GET'){
      // On a hosted server: whether the caller's invitation is good, and how many voice connections
      // it has left. Nothing is said about any other invitation.
      const invite=publicHost?invitationOf(req):null;
      return send(res,200,{liveOnly,modelEnabled:process.env.PARTITION_ALLOW_MODEL==='1'&&!!process.env.PARTITION_MODEL_CONFIG&&!!process.env.PARTITION_PRICE_TABLE,tts:tts.status(),live:live.status(),
        hosted:publicHost!==null,...(publicHost?{invite:invite?{required:true,valid:true,name:invite.name,remaining:Math.max(0,invite.connections-live.usedBy(invite.name))}:{required:true,valid:false}}:{})});
    }
    if(u.pathname==='/api/rooms'&&req.method==='POST'){
      if(rooms.size>=hosting.rooms.most)return send(res,429,{error:publicHost?'现在房间已满，请过一会儿再来。':'本地房间已满，请重启服务释放。'});
      const b=await body(req);
      // A hosted server makes a room for an invitation only, and so many an hour for each.
      const invite=publicHost?invitationOf(req):null;
      if(publicHost){
        if(!invite)return send(res,403,{error:'需要有效的邀请链接。'});
        const recent=(roomsMade.get(invite.name)||[]).filter(at=>at>Date.now()-3_600_000);
        roomsMade.set(invite.name,recent);
        if(recent.length>=hosting.rooms.per_invite_per_hour)return send(res,429,{error:'这条邀请在一小时内开的房间太多了，请过一会儿再来。'});
      }
      if(liveOnly && (b?.controllers?.west!=='human' || b.controllers.east!=='live' || Object.keys(b.controllers).length!==2)){
        return send(res,403,{error:'此入口仅接受西席真人与东席 Gemini Live。'});
      }
      if(Object.values(b.controllers||{}).includes('live')&&(!live.enabled||Object.values(b.controllers).filter(x=>x==='live').length!==1||!Object.values(b.controllers).includes('human')))return send(res,403,{error:'Live只允许一个AI席位和一个真人席位。'});
      if(Object.values(b.controllers||{}).includes('model')&&process.env.PARTITION_ALLOW_MODEL!=='1')return send(res,403,{error:'真实模型尚未获准启用。本地默认只运行脚本 stub。'});
      if(Object.values(b.controllers||{}).includes('model')&&(!process.env.PARTITION_MODEL_CONFIG||!process.env.PARTITION_PRICE_TABLE))return send(res,400,{error:'真实模型需要明确的现有 harness 配置和价格表。'});
      if(Object.values(b.controllers||{}).includes('model')&&(!process.env.PARTITION_MODEL_LEDGER||Object.values(b.controllers).filter(x=>x==='model').length!==1))return send(res,400,{error:'本轮 smoke 仅允许一个模型席位，且必须提供共享请求限额账本。'});
      // There is one room (room-rules.json); only a scripted or a model seat gets the mechanisms alone.
      const r=new Room(b.controllers);rooms.set(r.id,r);r.touched=Date.now();
      // The room remembers its invitation: a voice session in it is counted against that invitation.
      if(invite){r.invite={name:invite.name,connections:invite.connections};roomsMade.get(invite.name).push(Date.now());}
      // The seed makes a room's puzzle again (new Room(controllers,{seed})). It is the whole
      // answer, so it stays on this side: in the operator's terminal, never in a response.
      if(r.puzzle)console.log(`room ${r.id} · seed ${r.seed}`);
      for(const s of ['west','east'])if(!['human','live'].includes(r.controllers[s]))await startSeat(r,s);
      const link=(role)=>`${role==='watch'?'/watch':'/play'}#room=${r.id}&key=${r.tokens[role]}`;
      return send(res,201,{id:r.id,links:{west:r.controllers.west==='human'?link('west'):null,east:r.controllers.east==='human'?link('east'):null,watch:link('watch')}});
    }
    const m=u.pathname.match(/^\/api\/rooms\/([a-f0-9]{16})(?:\/(command|worker|studio|voice|voice-status|voice-disable|live-stream|live-start|live-input|live-observe|live-command|live-status|live-renew|live-trace))?$/);
    if(m){
      const r=rooms.get(m[1]);if(!r)return send(res,404,{error:'房间不存在。服务重启后需要重新开局。'});
      const role=r.role((req.headers.authorization||'').replace(/^Bearer /,''));
      if(!role)return send(res,403,{error:'没有有效的席位凭证。'});
      r.touched=Date.now();   // someone with a key of the room is here: it is not idle
      if(m[2]==='live-trace'&&req.method==='GET'){
        if(role!=='watch')return send(res,403,{error:'仅观众可读公开Trace'});
        const seat=u.searchParams.get('seat');if(!['west','east'].includes(seat))return send(res,400,{error:'无效席位'});
        try{return send(res,200,await live.tracePage(r,seat,studioRoot(r,seat)),'text/html; charset=utf-8');}
        catch{return send(res,404,{error:'尚无Live记录'});}
      }
      if(m[2]?.startsWith('live-')){
        if(!Object.values(r.controllers).includes('live'))return send(res,403,{error:'非Live房间'});
        if(['live-observe','live-command'].includes(m[2])){
          if(r.controllers[role]!=='live'||req.method!=='POST')return send(res,403,{error:'仅Live worker可用'});
          const b=await body(req);return send(res,200,m[2]==='live-observe'?live.observe(r,role,b.scope):live.command(r,role,b));
        }
        if(r.controllers[role]!=='human')return send(res,403,{error:'仅本房间真人席位可用'});
        if(m[2]==='live-status'&&req.method==='GET')return send(res,200,{...live.status(),generation:live.get(r).generation,sync:live.get(r).sync.snapshot()});
        const matchesSession=()=>String(live.get(r).generation)===(req.headers['x-live-generation']??'0');
        if(m[2]==='live-stream'&&req.method==='GET'){
          if(!matchesSession())return send(res,409,{error:'语音会话已更换，请刷新本房间。'});
          live.attach(r,res);return;
        }
        if(req.method!=='POST'||!origins.has(req.headers.origin))return send(res,403,{error:'Live需要同源页面'});
        const b=await body(req);
        if(!matchesSession())return send(res,409,{error:'语音会话已更换，请刷新本房间。'});
        if(m[2]==='live-renew'){
          if(!('x-live-generation' in req.headers))return send(res,400,{error:'缺少语音会话编号。'});
          return send(res,200,{generation:live.renew(r)});
        }
        if(m[2]==='live-start'){if(b.fixture===true&&process.env.PARTITION_LIVE_FIXTURE!=='1')return send(res,403,{error:'fixture未启用'});live.start(r,b.fixture===true);}
        else if(m[2]==='live-input')live.input(r,b);else return send(res,405,{error:'unsupported'});
        return send(res,200,{ok:true});
      }
      if(m[2]?.startsWith('voice')){
        if(role==='watch'||r.controllers[role]!=='human')return send(res,403,{error:'语音只允许真人席位使用。'});
        if(m[2]==='voice-status'&&req.method==='GET')return send(res,200,tts.status());
        // Strong same-origin requirement on all voice mutations, in addition to Host checks.
        if(req.method!=='POST'||!origins.has(req.headers.origin))return send(res,403,{error:'语音请求需要同源页面。'});
        if(m[2]==='voice-disable'){tts.disable();return send(res,200,tts.status());}
        if(m[2]==='voice'){
          const b=await body(req);
          if(!b||Object.keys(b).length!==1||!Number.isSafeInteger(b.eventId))return send(res,400,{error:'只接受公开事件编号；不接受朗读文本。'});
          try{const a=await tts.speak(r,role,b.eventId);res.setHeader('X-Voice-Source',a.source);res.setHeader('X-Voice-Cache',a.cached?'hit':'miss');res.setHeader('X-Room-Event',String(a.eventId));return send(res,200,a.audio,a.mime);}
          catch(e){return send(res,409,{error:e.code||'voice_unavailable'});}
        }
        return send(res,405,{error:'不支持的请求'});
      }
      if(!m[2]&&req.method==='GET')return send(res,200,live.playerView(r,role));
      if(m[2]==='command'&&req.method==='POST'){
        if(role==='watch')return send(res,403,{error:'观众只有只读权限。'});
        if(r.controllers[role]==='live')return send(res,403,{error:'Live工具必须经过观察票据检查'});
        const c=await body(req),result=r.command(role,c);
        if(Object.values(r.controllers).includes('live')){
          if(c.type==='pause')live.stop(r,'game_paused');
          else if(c.type==='say'&&result.ok&&live.get(r).started&&!live.get(r).ended)live.input(r,{type:'text',text:c.text});
          else live.notify(r,role,c,result);
        }
        return send(res,200,{...result,view:live.playerView(r,role)});
      }
      if(m[2]==='worker'&&req.method==='POST'){
        if(role==='watch'||r.controllers[role]==='human')return send(res,403,{error:'不是 harness 席位。'});
        const b=await body(req);r.worker[role]={status:['running','waiting','complete','stopped','error'].includes(b.status)?b.status:'running',
          source:r.controllers[role],runId:typeof b.runId==='string'?b.runId.slice(0,100):'',steps:Number.isSafeInteger(b.steps)?b.steps:0};
        return send(res,200,{ok:true});
      }
      if(m[2]==='studio'&&req.method==='GET'){
        if(role!=='watch')return send(res,403,{error:'玩家不能打开观众 Trace。'});
        const seat=u.searchParams.get('seat');if(!['west','east'].includes(seat))return send(res,400,{error:'无效席位'});
        const call=u.searchParams.get('call');if(call&&!/^[a-f0-9]{24}$/.test(call))return send(res,400,{error:'无效调用别名'});
        try{return send(res,200,await readFile(path.join(studioRoot(r,seat),...(call?['tool-'+call]:[]),'public-studio.html')),'text/html; charset=utf-8');}
        catch{return send(res,404,{error:'该席位尚无 Trace；真人席位不运行 harness。'});}
      }
      return send(res,405,{error:'不支持的请求'});
    }
    if(req.method==='GET'&&files.has(u.pathname))return send(res,200,await readFile(path.join(root,files.get(u.pathname))),mime[path.extname(files.get(u.pathname))]);
    send(res,404,{error:'Not found'});
  }catch(e){send(res,400,{error:e.message});}
});
// A hosted server lets go of the rooms nobody is in (hosting.json, rooms.idle_minutes): looked at
// twice within the wait, and never while a voice session runs in the room.
const sweeper=hosting.rooms.idle_minutes?setInterval(()=>{
  for(const room of idleRooms(rooms.values(),Date.now(),hosting.rooms.idle_minutes,r=>live.running(r))){live.forget(room);rooms.delete(room.id);}
},Math.max(250,Math.min(30_000,hosting.rooms.idle_minutes*30_000))):null;
server.listen(port,hosting.bind,()=>console.log(publicHost?`隔墙 3D · ${hosting.public_origin} · hosted, by invitation · listening on ${hosting.bind}:${port}`:
  `隔墙 3D · ${origin} · local only / no model calls by default`));
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;clearInterval(sweeper);tts.close();live.close();
  const workers=[...children].map(c=>new Promise(resolve=>{
    const timer=setTimeout(()=>c.kill('SIGKILL'),5000);
    c.once('exit',()=>{clearTimeout(timer);resolve();});c.kill('SIGTERM');
  }));
  await Promise.all([new Promise(resolve=>server.close(resolve)),...workers]);process.exit(0);
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
