// The folder a hosted server's image is built from (deploy/make-context.sh): it has to hold the
// game as committed and the harness, and nothing that is only on this machine. The grant and the
// run records live beside the game here; an image with them in it would publish them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const game=path.dirname(fileURLToPath(import.meta.url));
const git=(...args)=>spawnSync('git',args,{cwd:game,encoding:'utf8'});
const inCheckout=git('rev-parse','--is-inside-work-tree').stdout.trim()==='true';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'partition-image-'));
function harness(without){
  const root=temp();
  for(const [name,text] of [['pyproject.toml','[project]\n'],['uv.lock','version = 1\n'],['README.md','harness\n']])if(name!==without)fs.writeFileSync(path.join(root,name),text);
  fs.mkdirSync(path.join(root,'src','harness','__pycache__'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','harness','trace.py'),'# the harness\n');
  fs.writeFileSync(path.join(root,'src','harness','__pycache__','trace.pyc'),'');
  // Things a harness checkout has on a developer's machine and an image must not get.
  fs.mkdirSync(path.join(root,'.venv'));fs.writeFileSync(path.join(root,'.venv','python'),'');
  fs.mkdirSync(path.join(root,'artifacts'));fs.writeFileSync(path.join(root,'artifacts','run.jsonl'),'');
  return root;
}
const make=(out,root=harness())=>spawnSync('sh',['deploy/make-context.sh',out],{cwd:game,encoding:'utf8',
  env:{...process.env,...(root?{PARTITION_HARNESS_ROOT:root}:{PARTITION_HARNESS_ROOT:''})}});
const listed=root=>{
  const all=[];
  (function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const at=path.join(folder,entry.name);if(entry.isDirectory())walk(at);else all.push(path.relative(root,at));}})(root);
  return all.sort();
};

test('the image folder holds the game as committed and the harness, and nothing that is only on this machine',{skip:!inCheckout&&'not a git checkout'},()=>{
  const out=path.join(temp(),'image');
  const made=make(out);
  assert.equal(made.status,0,made.stderr);
  // The game: exactly what git has at HEAD under this folder. No grant, no run records, nothing untracked.
  const committed=git('ls-tree','-r','--name-only','HEAD','.').stdout.trim().split('\n').sort();
  assert.deepEqual(listed(path.join(out,'game')),committed);
  for(const local of ['.live','.runs','.voice','.access','node_modules'])assert.equal(fs.existsSync(path.join(out,'game',local)),false,local);
  // The harness: its source and the files it is installed from.
  const got=listed(path.join(out,'harness'));
  assert.deepEqual(got,['README.md','pyproject.toml','src/harness/trace.py','uv.lock']);
  for(const name of ['Dockerfile','fly.toml'])assert.ok(fs.existsSync(path.join(out,name)),name);
});
test('it refuses a folder with something in it, a folder inside a repository, and a harness that is not one',{skip:!inCheckout&&'not a git checkout'},()=>{
  const full=temp();fs.writeFileSync(path.join(full,'kept.txt'),'mine');
  const first=make(full);
  assert.notEqual(first.status,0);assert.match(first.stderr,/not empty/);assert.deepEqual(fs.readdirSync(full),['kept.txt']);
  // Inside the game's own repository the private harness could be committed by accident.
  const inside=path.join(game,'.image-test-'+process.pid);
  try{
    const second=make(inside);
    assert.notEqual(second.status,0);assert.match(second.stderr,/inside a git repository/);
    assert.equal(fs.existsSync(path.join(inside,'harness')),false);
  }finally{fs.rmSync(inside,{recursive:true,force:true});}
  const third=make(path.join(temp(),'image'),harness('uv.lock'));
  assert.notEqual(third.status,0);assert.match(third.stderr,/no uv\.lock/);
  const fourth=make(path.join(temp(),'image'),null);
  assert.notEqual(fourth.status,0);assert.match(fourth.stderr,/PARTITION_HARNESS_ROOT/);
});
