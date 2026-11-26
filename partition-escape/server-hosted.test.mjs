// The real server, started with a public address and invitations, asked over HTTP as a player
// outside this machine would ask it (the Host and Origin of the public address). No Python, no
// model, no voice session: what is under test is who gets in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC='https://play.example.test',HOST='play.example.test';
const CODE='c'.repeat(32),OTHER='d'.repeat(32);
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Starts server3d.mjs and returns a way to ask it. `hosting` null starts it as on this machine.
async function server(t,hosting,invites=[{name:'朋友',code:CODE,connections:2},{name:'同事',code:OTHER,connections:1}]){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'partition-hosted-')),port=await freePort();
  const env={...process.env,PORT:String(port),PARTITION_ALLOW_LIVE:'1',PARTITION_LIVE_ONLY:'1',PARTITION_PYTHON:'/nonexistent/python'};
  delete env.PARTITION_HOSTING;
  if(hosting){
    const invitesFile=path.join(folder,'invites.json');fs.writeFileSync(invitesFile,JSON.stringify({invites}));
    const file=path.join(folder,'hosting.json');
    fs.writeFileSync(file,JSON.stringify({public_origin:PUBLIC,bind:'127.0.0.1',invites_file:invitesFile,...hosting}));
    env.PARTITION_HOSTING=file;
  }
  const child=spawn(process.execPath,['server3d.mjs'],{cwd:here,env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill('SIGKILL');fs.rmSync(folder,{recursive:true,force:true});});
  let printed='';child.stderr.on('data',chunk=>{printed+=chunk;});
  await new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{printed+=chunk;if(printed.includes('隔墙 3D'))resolve();});
    child.on('exit',code=>reject(Error(`the server stopped (${code}): ${printed}`)));
  });
  const ask=(route,{method='GET',host=HOST,origin,invite,token,body}={})=>new Promise((resolve,reject)=>{
    const headers={Host:host,...(origin?{Origin:origin}:{}),...(invite?{'X-Partition-Invite':invite}:{}),
      ...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})};
    const request=http.request({host:'127.0.0.1',port,path:route,method,headers},response=>{
      let text='';response.on('data',chunk=>{text+=chunk;});
      response.on('end',()=>{let data=null;try{data=JSON.parse(text);}catch{}resolve({status:response.statusCode,data,text});});
    });
    request.on('error',reject);request.end(body?JSON.stringify(body):undefined);
  });
  const room=(invite,origin=PUBLIC)=>ask('/api/rooms',{method:'POST',origin,invite,body:{controllers:{west:'human',east:'live'}}});
  return {ask,room,port,printed:()=>printed,folder};
}
const keyOf=link=>new URLSearchParams(link.split('#')[1]).get('key');

test('a hosted server answers to its public address, and to this machine only from this machine',async t=>{
  const {ask,port}=await server(t,{});
  assert.equal((await ask('/api/capabilities')).status,200);
  assert.equal((await ask('/')).status,200,'the page itself');
  assert.equal((await ask('/api/capabilities',{host:'evil.example'})).status,403);
  assert.equal((await ask('/api/capabilities',{host:HOST+':'+port})).status,403,'the public address has no port here');
  // The voice worker calls back over loopback under the loopback name.
  assert.equal((await ask('/api/capabilities',{host:'127.0.0.1:'+port})).status,200);
});
test('without an invitation a visitor sees that one is needed and nothing about who was invited',async t=>{
  const {ask,room}=await server(t,{});
  const open=await ask('/api/capabilities');
  assert.equal(open.data.hosted,true);assert.deepEqual(open.data.invite,{required:true,valid:false});
  for(const route of ['/api/capabilities','/api/health']){
    const text=(await ask(route)).text;
    for(const secret of ['朋友','同事',CODE,OTHER,'invites'])assert.equal(text.includes(secret),false,`${route} says ${secret}`);
  }
  assert.deepEqual((await ask('/api/capabilities',{invite:'e'.repeat(32)})).data.invite,{required:true,valid:false});
  for(const invite of [undefined,'e'.repeat(32),CODE.slice(1)]){
    const refused=await room(invite);
    assert.equal(refused.status,403);assert.match(refused.data.error,/邀请/);
  }
});
test('an invitation opens a room, from the public page only, and says how many voice connections it has left',async t=>{
  const {ask,room}=await server(t,{});
  assert.deepEqual((await ask('/api/capabilities',{invite:CODE})).data.invite,{required:true,valid:true,name:'朋友',remaining:2});
  const made=await room(CODE);
  assert.equal(made.status,201);assert.ok(made.data.links.west&&made.data.links.watch);
  assert.equal(JSON.stringify(made.data).includes(CODE),false,'the room\'s links carry the room\'s own keys, not the invitation');
  // The room's own key is enough from then on.
  const view=await ask('/api/rooms/'+made.data.id,{token:keyOf(made.data.links.west)});
  assert.equal(view.status,200);assert.ok(view.data.scene.some(o=>o.id==='chart'),'the one room, with its load chart');
  // A page somewhere else may not use a visitor's invitation.
  assert.equal((await room(CODE,'https://evil.example')).status,403);
  assert.equal((await ask('/api/rooms/'+made.data.id+'/command',{method:'POST',origin:'https://evil.example',token:keyOf(made.data.links.west),body:{type:'hint'}})).status,403);
});
test('an invitation makes so many rooms an hour and no more; the others are not held up by it',async t=>{
  const {room}=await server(t,{rooms:{per_invite_per_hour:2}});
  assert.equal((await room(CODE)).status,201);assert.equal((await room(CODE)).status,201);
  const third=await room(CODE);
  assert.equal(third.status,429);assert.match(third.data.error,/一小时/);
  assert.equal((await room(OTHER)).status,201);
});
test('the server keeps so many rooms and lets go of one nobody has touched for the wait',async t=>{
  const {ask,room}=await server(t,{rooms:{most:1,idle_minutes:.01}});
  const first=await room(CODE);
  assert.equal(first.status,201);
  const full=await room(OTHER);
  assert.equal(full.status,429);assert.doesNotMatch(full.data.error,/重启/,'a visitor cannot restart the server');
  const key=keyOf(first.data.links.west);
  assert.equal((await ask('/api/rooms/'+first.data.id,{token:key})).status,200);
  await pause(1500);
  assert.equal((await ask('/api/rooms/'+first.data.id,{token:key})).status,404);
  assert.equal((await room(OTHER)).status,201,'its place is free again');
});
test('an invitation added while the server runs counts at once; a broken file refuses everyone and says so to the operator only',async t=>{
  const {room,folder,printed}=await server(t,{},[]);
  assert.equal((await room(CODE)).status,403);
  fs.writeFileSync(path.join(folder,'invites.json'),JSON.stringify({invites:[{name:'朋友',code:CODE,connections:2}]}));
  assert.equal((await room(CODE)).status,201);
  fs.writeFileSync(path.join(folder,'invites.json'),'{"invites":[{"name":"朋友","code":"short","connections":2}]}');
  const broken=await room(CODE);
  assert.equal(broken.status,403);assert.doesNotMatch(JSON.stringify(broken.data),/invites_invalid|short/);
  assert.match(printed(),/invites_invalid/);
});
test('on this machine nothing changed: no invitation, no public address',async t=>{
  const {ask,room,port}=await server(t,null);
  const local='127.0.0.1:'+port;
  assert.equal((await ask('/api/capabilities',{host:HOST})).status,403);
  const capabilities=(await ask('/api/capabilities',{host:local})).data;
  assert.equal(capabilities.hosted,false);assert.equal('invite' in capabilities,false);
  assert.equal((await ask('/api/health',{host:local})).data.localOnly,true);
  const made=await ask('/api/rooms',{method:'POST',host:local,origin:'http://'+local,body:{controllers:{west:'human',east:'live'}}});
  assert.equal(made.status,201);
});
