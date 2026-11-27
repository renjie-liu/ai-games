// OFFLINE TEST FIXTURE ONLY. No model workers. Same Room.command -> engine.transition.
// Stage the historical public proposal ID BEFORE observation so the saved reply can
// be replayed byte-for-byte. This setup is not a new model decision or a live run.
import http from 'node:http';
import {Room} from './world.mjs';
const mode=process.argv[2], pendingId=process.argv[3];
const room=new Room({west:'human',east:'human'});
if(!['none','invalid-rule'].includes(mode)){
 room.command('east',{type:'inspect',id:'hatch'});
 room.command('east',{type:'share',id:'key-found'});
 room.command('east',{type:'action',id:'send-key'});
 room.pending.id=pendingId;
 if(mode==='stale')room.command('east',{type:'cancel',id:pendingId});
}
const server=http.createServer(async(req,res)=>{
 const role=room.role(req.headers.authorization?.replace(/^Bearer /,''));
 res.setHeader('Content-Type','application/json');
 if(!role){res.writeHead(403);return res.end(JSON.stringify({error:'unauthorized'}));}
 if(req.method==='GET')return res.end(JSON.stringify(room.view(role)));
 let body='';for await(const b of req)body+=b;
 const result=room.command(role,JSON.parse(body));
 res.end(JSON.stringify({...result,view:room.view(role)}));
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,tokens:room.tokens})));
