// Where a server is told that it is reachable from outside this machine, and who may then play.
// Offline; no server is started here (server-hosted.test.mjs does that).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadHosting,mergeHosting,loadInvites,findInvite,newInvite,inviteLink,idleRooms} from './hosting.mjs';

const DEFAULTS=JSON.parse(fs.readFileSync(new URL('./hosting.json',import.meta.url),'utf8'));
const folder=()=>fs.mkdtempSync(path.join(os.tmpdir(),'partition-hosting-'));
const file=(value,name='file.json')=>{const at=path.join(folder(),name);fs.writeFileSync(at,typeof value==='string'?value:JSON.stringify(value));return at;};
const CODE='a'.repeat(32),OTHER='b'.repeat(32);
const hosted=(changes={})=>({public_origin:'https://play.example.test',bind:'0.0.0.0',invites_file:'/data/access/invites.json',...changes});

test('by default the server is for this machine only: loopback, no public address, no invitations',()=>{
  assert.deepEqual(loadHosting(''),DEFAULTS);
  assert.equal(DEFAULTS.public_origin,null);assert.equal(DEFAULTS.bind,'127.0.0.1');assert.equal(DEFAULTS.invites_file,null);
  assert.equal(DEFAULTS.rooms.idle_minutes,0,'a room on this machine is kept until the server stops');
  assert.deepEqual(DEFAULTS.page_origins,[],'and no page published elsewhere may call it');
  assert.equal(DEFAULTS.invite_page,null,'invited players open the server\'s own page');
});
test('an override changes only what it names',()=>{
  const loaded=loadHosting(file(hosted({rooms:{idle_minutes:30}})));
  assert.deepEqual(loaded,{...DEFAULTS,...hosted(),rooms:{...DEFAULTS.rooms,idle_minutes:30}});
});
test('a server with a public address is never open: it needs invitations, and an address that is one',()=>{
  const bad=[
    [{public_origin:'https://play.example.test',bind:'0.0.0.0'},/needs invites_file/],
    [hosted({public_origin:'https://play.example.test/'}),/public_origin/],[hosted({public_origin:'https://play.example.test/game'}),/public_origin/],
    [hosted({public_origin:'play.example.test'}),/public_origin/],[hosted({public_origin:'ftp://play.example.test'}),/public_origin/],
    // Plain http is for rehearsing on this machine only.
    [hosted({public_origin:'http://play.example.test'}),/https/],
    [hosted({bind:''}),/bind/],[hosted({bind:7}),/bind/],[hosted({invites_file:''}),/invites_file/],
    [hosted({rooms:{most:0}}),/rooms/],[hosted({rooms:{most:2.5}}),/rooms/],[hosted({rooms:{idle_minutes:-1}}),/rooms/],
    [hosted({rooms:{per_invite_per_hour:0}}),/rooms/],[hosted({rooms:{idle_hours:1}}),/unknown name/],
    [hosted({publicOrigin:'x'}),/unknown name publicOrigin/],[[],/an object/],
    // Pages published elsewhere that may call the server: addresses, each once, and only for a server with a public address.
    [hosted({page_origins:'https://pages.example.test'}),/page_origins/],[hosted({page_origins:['https://pages.example.test/games']}),/page_origins/],
    [hosted({page_origins:['http://pages.example.test']}),/page_origins/],[hosted({page_origins:['https://a.example','https://a.example']}),/page_origins/],
    [{page_origins:['https://pages.example.test']},/page_origins.*public_origin/],
    // The page invited players are sent to: a page of the server itself or of an address it names, with nothing after the path.
    [hosted({invite_page:'https://elsewhere.example/game/'}),/invite_page/],[hosted({invite_page:'pages.example.test/game/'}),/invite_page/],
    [hosted({page_origins:['https://pages.example.test'],invite_page:'https://pages.example.test/game/#x'}),/invite_page/],
    [hosted({page_origins:['https://pages.example.test'],invite_page:'https://pages.example.test/game/?a=1'}),/invite_page/]];
  for(const [changes,reason] of bad)
    assert.throws(()=>loadHosting(file(changes)),e=>/hosting_invalid/.test(e.message)&&reason.test(e.message),JSON.stringify(changes));
  assert.throws(()=>loadHosting('/nonexistent/hosting.json'),/hosting_invalid/);
  assert.equal(loadHosting(file(hosted({public_origin:'http://localhost:4191'}))).public_origin,'http://localhost:4191');
  assert.equal(loadHosting(file(hosted({public_origin:'https://play.example.test:8443'}))).public_origin,'https://play.example.test:8443');
  assert.deepEqual(loadHosting(file(hosted({page_origins:['https://someone.github.io','http://localhost:4192']}))).page_origins,['https://someone.github.io','http://localhost:4192']);
});
test('invitations are names, codes too long to guess and a number of connections each',()=>{
  const good={invites:[{name:'朋友',code:CODE,connections:20},{name:'同事',code:OTHER,connections:5}]};
  assert.deepEqual(loadInvites(file(good)),good.invites);
  const bad=[
    [{invites:[{name:'朋友',code:'short',connections:20}]},/code/],[{invites:[{name:'朋友',code:CODE+'!',connections:20}]},/code/],
    [{invites:[{name:'',code:CODE,connections:20}]},/name/],[{invites:[{name:'x'.repeat(41),code:CODE,connections:20}]},/name/],
    [{invites:[{name:'朋友',code:CODE,connections:0}]},/connections/],[{invites:[{name:'朋友',code:CODE,connections:1.5}]},/connections/],
    [{invites:[{name:'朋友',code:CODE,connections:2},{name:'朋友',code:OTHER,connections:2}]},/two invitations named/],
    [{invites:[{name:'朋友',code:CODE,connections:2},{name:'同事',code:CODE,connections:2}]},/same code/],
    [{invites:[{name:'朋友',code:CODE,connections:2,admin:true}]},/unknown name/],[{invite:[]},/invites/],[[],/invites/]];
  for(const [value,reason] of bad){
    assert.throws(()=>loadInvites(file(value)),e=>/invites_invalid/.test(e.message)&&reason.test(e.message)&&!e.message.includes(CODE),JSON.stringify(value));
  }
  assert.throws(()=>loadInvites('/nonexistent/invites.json'),/invites_invalid/);
  assert.deepEqual(loadInvites(file({invites:[]})),[],'a server may be up before anyone is invited');
});
test('a code finds its invitation and nothing else does',()=>{
  const invites=[{name:'朋友',code:CODE,connections:20},{name:'同事',code:OTHER,connections:5}];
  assert.equal(findInvite(invites,OTHER).name,'同事');
  for(const wrong of [CODE.slice(1),CODE+'a',CODE.toUpperCase(),'',undefined,null,42,['a'],{code:CODE}])assert.equal(findInvite(invites,wrong),null,String(wrong));
});
test('a new invitation gets a code of its own and is added to the file without touching the others',()=>{
  const at=file({invites:[{name:'朋友',code:CODE,connections:20}]});
  const made=newInvite(at,'同事',5);
  assert.match(made.code,/^[A-Za-z0-9_-]{32,}$/);assert.notEqual(made.code,CODE);
  assert.deepEqual(loadInvites(at),[{name:'朋友',code:CODE,connections:20},made]);
  assert.throws(()=>newInvite(at,'同事',5),/two invitations named/);
  assert.equal(loadInvites(at).length,2,'a refused invitation is not written');
  assert.equal(fs.statSync(at).mode&0o077,0,'the file of codes is the owner\'s to read');
  // The first invitation makes the file.
  const fresh=path.join(folder(),'access','invites.json');
  assert.equal(newInvite(fresh,'朋友',2).connections,2);assert.equal(loadInvites(fresh).length,1);
  // The link carries the code after the #, which a browser does not send to any server.
  assert.equal(inviteLink(loadHosting(file(hosted())),made),`https://play.example.test/#invite=${made.code}`);
  // With the page published elsewhere, that is where an invited player goes.
  const elsewhere=loadHosting(file(hosted({page_origins:['https://someone.github.io'],invite_page:'https://someone.github.io/games/partition-escape/'})));
  assert.equal(inviteLink(elsewhere,made),`https://someone.github.io/games/partition-escape/#invite=${made.code}`);
});
test('a room nobody has touched for the wait is let go, unless a session runs in it; no wait keeps every room',()=>{
  const now=10_000_000,minute=60_000;
  const rooms=[{id:'fresh',touched:now-5*minute},{id:'stale',touched:now-31*minute},{id:'in-use',touched:now-90*minute},{id:'edge',touched:now-30*minute}];
  const running=room=>room.id==='in-use';
  assert.deepEqual(idleRooms(rooms,now,30,running).map(r=>r.id),['stale']);
  assert.deepEqual(idleRooms(rooms,now,0,running),[]);
  assert.deepEqual(idleRooms(rooms,now,.5,()=>false).map(r=>r.id),['fresh','stale','in-use','edge']);
});
function commandLine(extra={}){
  const invites=path.join(folder(),'access','invites.json');
  const hosting=file(hosted({invites_file:invites,...extra}));
  const run=(...args)=>spawnSync(process.execPath,['invites.mjs',...args],{cwd:path.dirname(fileURLToPath(import.meta.url)),encoding:'utf8',
    env:{...process.env,PARTITION_HOSTING:hosting,PARTITION_PYTHON:'/nonexistent/python'}});
  return {invites,run};
}
test('the operator adds an invitation from the command line and is given its link once; listing never shows a code',()=>{
  const {invites,run}=commandLine();
  const added=run('add','朋友','20');
  assert.equal(added.status,0,added.stderr);
  const [made]=loadInvites(invites);
  assert.deepEqual([made.name,made.connections],['朋友',20]);
  assert.ok(added.stdout.includes(`https://play.example.test/#invite=${made.code}`));
  const listed=run('list');
  assert.equal(listed.status,0,listed.stderr);
  assert.match(listed.stdout,/朋友: \? of 20 voice connections started/);assert.equal(listed.stdout.includes(made.code),false);
  for(const bad of [['add','朋友','20'],['add','同事'],['add','同事','0'],['add','同事','many'],['remove','朋友'],[]]){
    const refused=run(...bad);
    assert.notEqual(refused.status,0,bad.join(' '));assert.equal((refused.stdout+refused.stderr).includes(made.code),false);
  }
  assert.equal(loadInvites(invites).length,1);
  // On a server for this machine only there is nothing to add to.
  const local=spawnSync(process.execPath,['invites.mjs','list'],{cwd:path.dirname(fileURLToPath(import.meta.url)),encoding:'utf8',env:{...process.env,PARTITION_HOSTING:''}});
  assert.notEqual(local.status,0);assert.match(local.stderr,/takes no invitations/);
});
test('with the page published elsewhere the link the operator is given leads there',()=>{
  const {invites,run}=commandLine({page_origins:['https://someone.github.io'],invite_page:'https://someone.github.io/games/partition-escape/'});
  const added=run('add','朋友','3');
  assert.equal(added.status,0,added.stderr);
  assert.ok(added.stdout.includes(`https://someone.github.io/games/partition-escape/#invite=${loadInvites(invites)[0].code}`));
  assert.equal(added.stdout.includes('play.example.test'),false);
});
