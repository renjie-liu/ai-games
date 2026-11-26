// Where the server is told that it can be reached from outside this machine, and who may then
// play. The defaults in hosting.json are a server for this machine only; a JSON file named by
// PARTITION_HOSTING may change any of them (HOSTING.md).
//
//   public_origin   the address players open, e.g. "https://play.example.org". null: this machine only.
//   bind            the address the server listens on.
//   invites_file    the file of invitations. A server with a public address is never open to
//                   everyone: it has to name one.
//   rooms.most                 how many rooms the server keeps at once
//   rooms.idle_minutes         a room nobody has touched for this long, with no voice session
//                              running in it, is let go. 0 keeps every room until the server stops.
//   rooms.per_invite_per_hour  how many rooms one invitation may make in an hour
//
// An invitation is a name, a code and a number of voice connections. The code is the secret: it
// travels in the link after the #, which a browser sends to no server, and the page hands it over
// in a header when it makes a room. How many connections an invitation has used is counted in the
// ledger, with the grant's own count (live_budget.py).
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const HOSTING_FILE='hosting.json';
// The header the page puts the invitation's code in.
export const INVITE_HEADER='x-partition-invite';
const invalid=why=>new Error(`hosting_invalid: ${why} (check hosting.json and the file named by PARTITION_HOSTING)`);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&v===v.trim();
const LOOPBACK=['localhost','127.0.0.1','[::1]'];

function check(h){
  const no=why=>{throw invalid(why);};
  if(h.public_origin!==null){
    let url;try{url=new URL(h.public_origin);}catch{no('public_origin is an address like https://play.example.org');}
    if(!['https:','http:'].includes(url.protocol)||url.origin!==h.public_origin)no('public_origin is an address like https://play.example.org, with nothing after the host');
    // A microphone works only on a page the browser trusts: https, or this machine itself.
    if(url.protocol==='http:'&&!LOOPBACK.includes(url.hostname))no('public_origin has to be https; plain http is for rehearsing on this machine');
    if(h.invites_file===null)no('a server with a public_origin needs invites_file: it is never open to everyone');
  }
  if(!text(h.bind))no('bind is the address to listen on');
  if(h.invites_file!==null&&!text(h.invites_file))no('invites_file is the path of the file of invitations, or null');
  const r=h.rooms;
  if(!Number.isSafeInteger(r.most)||r.most<1||!Number.isSafeInteger(r.per_invite_per_hour)||r.per_invite_per_hour<1||
     typeof r.idle_minutes!=='number'||!Number.isFinite(r.idle_minutes)||r.idle_minutes<0)
    no('rooms.most and rooms.per_invite_per_hour are whole numbers from 1, rooms.idle_minutes is 0 or more');
}
export function mergeHosting(defaults,changes={}){
  if(!plain(changes))throw invalid('the file is an object of the names it changes');
  const unknown=Object.keys(changes).find(k=>!Object.hasOwn(defaults,k));
  if(unknown)throw invalid(`unknown name ${unknown}`);
  const rooms=changes.rooms??{};
  if(!plain(rooms))throw invalid('rooms is an object');
  const strange=Object.keys(rooms).find(k=>!Object.hasOwn(defaults.rooms,k));
  if(strange)throw invalid(`unknown name rooms.${strange}`);
  const merged={...defaults,...changes,rooms:{...defaults.rooms,...rooms}};
  check(merged);
  return Object.freeze({...merged,rooms:Object.freeze(merged.rooms)});
}
export function loadHosting(override=process.env.PARTITION_HOSTING,root=here){
  let defaults,changes;
  try{
    defaults=JSON.parse(fs.readFileSync(path.join(root,HOSTING_FILE),'utf8'));
    changes=override?JSON.parse(fs.readFileSync(override,'utf8')):{};
  }catch{throw invalid('a file could not be read as JSON');}
  return mergeHosting(defaults,changes);
}

// --- invitations ---------------------------------------------------------------------------------
// A message here never repeats a code: it may end up in a log.
const refused=why=>new Error(`invites_invalid: ${why}`);
const CODE=/^[A-Za-z0-9_-]{24,128}$/,MOST_NAME=40;
function checkInvites(value){
  if(!plain(value)||!Array.isArray(value.invites)||Object.keys(value).length!==1)throw refused('the file is {"invites": [...]}');
  const names=new Set(),codes=new Set();
  for(const invite of value.invites){
    if(!plain(invite))throw refused('an invitation is an object');
    const unknown=Object.keys(invite).find(k=>!['name','code','connections'].includes(k));
    if(unknown)throw refused(`unknown name ${unknown}`);
    if(!text(invite.name)||[...invite.name].length>MOST_NAME)throw refused(`a name is 1 to ${MOST_NAME} letters`);
    if(typeof invite.code!=='string'||!CODE.test(invite.code))throw refused(`the code of ${invite.name} is 24 to 128 letters, digits, - or _`);
    if(!Number.isSafeInteger(invite.connections)||invite.connections<1)throw refused(`connections of ${invite.name} is a whole number from 1`);
    if(names.has(invite.name))throw refused(`two invitations named ${invite.name}`);
    if(codes.has(invite.code))throw refused(`${invite.name} has the same code as another invitation`);
    names.add(invite.name);codes.add(invite.code);
  }
  return value.invites;
}
// Read every time it is needed: an invitation added while the server runs counts at once, and
// restarting the server to pick one up would end every room.
export function loadInvites(file){
  let value;
  try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw refused('the file could not be read as JSON');}
  return checkInvites(value);
}
const digest=value=>createHash('sha256').update(value).digest();
// The invitation with this code, or null. Every invitation is compared, each in the same time
// whatever the code: how long the answer takes says nothing about the codes.
export function findInvite(invites,code){
  if(typeof code!=='string')return null;
  const given=digest(code);let found=null;
  for(const invite of invites)if(timingSafeEqual(digest(invite.code),given))found=invite;
  return found;
}
// Adds an invitation with a fresh code to the file (making the file if it is not there) and
// returns it. The file is written whole, readable by its owner only.
export function newInvite(file,name,connections){
  const invites=fs.existsSync(file)?loadInvites(file):[];
  const invite={name,code:randomBytes(24).toString('base64url'),connections};
  const all=checkInvites({invites:[...invites,invite]});
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify({invites:all},null,1)+'\n',{mode:0o600});
  fs.renameSync(temporary,file);fs.chmodSync(file,0o600);
  return invite;
}
export const inviteLink=(origin,invite)=>`${origin}/#invite=${invite.code}`;

// --- rooms ---------------------------------------------------------------------------------------
// The rooms to let go: untouched for longer than the wait, and no voice session running in them.
export function idleRooms(rooms,now,idleMinutes,running){
  if(!idleMinutes)return [];
  return [...rooms].filter(room=>now-room.touched>idleMinutes*60_000&&!running(room));
}
