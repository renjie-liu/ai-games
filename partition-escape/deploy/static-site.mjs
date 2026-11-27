#!/usr/bin/env node
// Makes a copy of the page as plain files, for a static site (HOSTING.md):
//
//   node deploy/static-site.mjs <new folder> <the server's public address>
//
// The folder gets index.html and the files it loads, nothing else. The page in it talks to the
// server at the address given, which has to name the site's address in page_origins (hosting.json)
// or a browser will not let the page read its answers.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE,PAGE_FILES,PAGE_NOTICES,SERVER_META} from '../page-files.mjs';

const game=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fail(message){console.error(message);process.exit(1);}
const [out,server]=process.argv.slice(2);
if(process.argv.length!==4)fail('usage: node deploy/static-site.mjs <new folder> <the server\'s public address>');
let url;try{url=new URL(server);}catch{fail('refused: the server\'s address is not an address');}
const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
if(url.origin!==server||!(url.protocol==='https:'||(url.protocol==='http:'&&local)))
  fail('refused: the server\'s address is like https://game.example.org, with nothing after the host (plain http only for this machine)');
if(fs.existsSync(out)&&fs.readdirSync(out).length)fail(`refused: ${out} is not empty`);
const html=fs.readFileSync(path.join(game,PAGE),'utf8');
if(html.split(SERVER_META).length!==2)fail(`refused: ${PAGE} does not say where its server is exactly once`);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),html.replace(SERVER_META,SERVER_META.replace('content=""',`content="${server}"`)));
for(const file of [...PAGE_FILES,...PAGE_NOTICES]){
  fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
  fs.copyFileSync(path.join(game,file),path.join(out,file));
}
console.log(['index.html',...PAGE_FILES,...PAGE_NOTICES].join('\n'));
