// OFFLINE TEST FIXTURE ONLY. The real Room and the real LiveHub, without a spawned worker:
// every line the hub would write to the worker's stdin is printed on stdout instead, so a
// test can run the production worker in-process and feed it those lines. No model, no key.
import http from 'node:http';
import {Room} from './world.mjs';
import {LiveHub} from './live.mjs';
// PARTITION_FIXTURE_SEED makes the same puzzle every time; without it the room draws its own.
const room=new Room({west:'human',east:'live'},process.env.PARTITION_FIXTURE_SEED?{seed:Number(process.env.PARTITION_FIXTURE_SEED)}:{});
const hub=new LiveHub('.','http://127.0.0.1',true);
const job=hub.get(room);
const pipe={writable:true,writableLength:0,write(line){process.stdout.write(line);return true;},end(line){if(line)process.stdout.write(line);}};
Object.assign(job,{seat:'east',started:true,worker:{stdin:pipe,once(){},kill(){}}});
job.sync.start(false);
const server=http.createServer(async(req,res)=>{
  const role=room.role(req.headers.authorization?.replace(/^Bearer /,''));
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(!role)return send(403,{error:'unauthorized'});
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method==='GET')return send(200,path==='/sync'?job.sync.snapshot():hub.playerView(room,role));
  let text='';for await(const chunk of req)text+=chunk;
  const b=JSON.parse(text||'{}');
  try{
    // The same routing as server3d.mjs for the seats this fixture has.
    if(path==='/live-observe'&&role==='east')return send(200,hub.observe(room,role,b.scope));
    if(path==='/live-command'&&role==='east')return send(200,hub.command(room,role,b));
    if(path==='/live-input'&&role==='west'){hub.input(room,b);return send(200,{ok:true});}
    if(path==='/command'&&role==='west'){
      const result=room.command(role,b);
      if(b.type==='pause')hub.stop(room,'game_paused');
      else if(b.type==='say'&&result.ok)hub.input(room,{type:'text',text:b.text});
      else hub.notify(room,role,b,result);
      return send(200,{...result,view:hub.playerView(room,role)});
    }
    send(404,{error:'not found'});
  }catch(e){send(400,{error:e.message});}
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port,tokens:room.tokens,scope:job.scope})+'\n'));
process.stdin.on('end',()=>process.exit(0));process.stdin.resume();
