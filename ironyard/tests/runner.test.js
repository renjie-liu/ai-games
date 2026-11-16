import test from 'node:test';
import assert from 'node:assert/strict';
import {MatchPool,withSources} from '../node/runner.js';
const spec=()=>({mode:'1v1',map:'proving',seed:1,maxTime:1,teams:withSources([['rookie'],['rookie']]),want:'score'});
test('closing a pool settles active and queued jobs and rejects further work',{timeout:3000},async()=>{
 const pool=new MatchPool({size:1});const jobs=Promise.allSettled([pool.run(spec()),pool.run(spec())]);await pool.close();
 assert.ok((await jobs).every(r=>r.status==='rejected'&&/closed/.test(r.reason.message)));assert.equal(pool.queue.length,0);assert.equal(pool.running.size,0);
 await assert.rejects(pool.run(spec()),/closed/);
});
test('a worker exit or uncloneable job rejects promptly and the pool recovers',{timeout:5000},async()=>{
 const pool=new MatchPool({size:1});try{
 const stopped=assert.rejects(pool.run(spec()),/exited/);await [...pool.all][0].terminate();await stopped;
 await assert.rejects(pool.run({...spec(),bad:()=>{}}),/cloned/);
 const ok=await pool.run(spec());assert.deepEqual(ok.errors,[]);
 }finally{await pool.close()}
});
