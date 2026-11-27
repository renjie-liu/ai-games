#!/usr/bin/env node
// The operator's hand on the invitations of a hosted server (HOSTING.md). Run where the server
// runs, with the same PARTITION_HOSTING, so both read the same file.
//
//   node invites.mjs add <name> <connections>   a new invitation; prints its link, once
//   node invites.mjs list                       every invitation: what it may start, what it has started
//
// The link is the secret. It is printed when the invitation is made and not again; the file of
// codes stays on the server.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {python} from './harness-paths.mjs';
import {loadHosting,loadInvites,newInvite,inviteLink} from './hosting.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const [command,...rest]=process.argv.slice(2);
function fail(message){console.error(message);process.exit(1);}
try{
  const hosting=loadHosting();
  if(!hosting.invites_file)fail('this server takes no invitations: hosting names no invites_file (PARTITION_HOSTING)');
  if(command==='add'){
    const [name,count]=rest;
    if(rest.length!==2||!/^[1-9]\d*$/.test(count))fail('usage: node invites.mjs add <name> <connections>');
    const invite=newInvite(hosting.invites_file,name,Number(count));
    console.log(`${invite.name}: ${invite.connections} voice connections`);
    console.log(hosting.public_origin?inviteLink(hosting,invite):`code ${invite.code} (no public_origin is set, so there is no link to give)`);
  }else if(command==='list'&&!rest.length){
    // What each has started is in the ledger, read by the code that keeps it.
    const asked=spawnSync(python,[path.join(root,'live_budget.py')],{cwd:root,encoding:'utf8',timeout:10000});
    let used=null;try{if(asked.status===0)used=JSON.parse(asked.stdout).invites;}catch{}
    for(const invite of loadInvites(hosting.invites_file))
      console.log(`${invite.name}: ${used?(used[invite.name]??0):'?'} of ${invite.connections} voice connections started`);
    if(!used)console.log('(what each has started could not be read from the ledger)');
  }else fail('usage: node invites.mjs add <name> <connections> | node invites.mjs list');
}catch(error){fail(error.message);}
