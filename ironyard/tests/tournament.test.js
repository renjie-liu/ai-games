import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tournamentResult, tournamentStatus, standings, makeSchedule, runMatch } from '../engine/index.js';
import { loadBot } from '../node/loader.js';
const entrants=[{id:'a',bots:['alpha']},{id:'b',bots:['beta']}];
const match={a:'a',b:'b',teams:[['alpha'],['beta']]};
const score={winner:0,teams:[{hull:1},{hull:0}],errors:[],duration:20,reason:'elimination'};

test('failed, unfinished and legacy-error results earn no draw points',()=>{
 const results=[tournamentResult(match,null,new Error('worker unavailable')),tournamentResult(match,{...score,errors:['alpha: tick failed']}),tournamentResult(match,{...score,winner:null}),{...match,winner:-1,error:'old failed match'}];
 for(const row of standings(entrants,results)){assert.equal(row.points,0);assert.equal(row.played,0);assert.equal(row.d,0);assert.equal(row.unscored,4);}
 assert.equal(tournamentStatus(results).complete,false);
 assert.equal(tournamentStatus(results).unscoredMatches,4);
});
test('attributed exceptions forfeit only an unambiguously identified side',()=>{
 const error=Object.assign(new Error('bad design'),{detail:{bot:'beta'}});
 const result=tournamentResult(match,null,error);
 assert.equal(result.winner,0);assert.equal(result.errorBy,'b');assert.equal(result.forfeit,true);
 assert.deepEqual(standings(entrants,[result]).map(r=>[r.id,r.points,r.errors]),[['a',3,0],['b',0,1]]);
 assert.equal(tournamentResult({...match,teams:[['beta'],['beta']]},null,error).winner,null);
 assert.equal(tournamentResult(match,null,Object.assign(new Error('unknown'),{detail:{bot:'other'}})).winner,null);
});
test('summary vehicle errors are checked, and partial seasons remain provisional',()=>{
 const {errors,...summary}=score;
 assert.equal(tournamentResult(match,{...summary,vehicles:[{bot:'alpha',errors:['init failed']}]}).winner,null);
 assert.equal(tournamentResult(match,{...score,vehicles:[{bot:'alpha',errors:['init failed']}]}).winner,null);
 assert.equal(tournamentResult(match,null).winner,null);
 assert.equal(tournamentStatus([tournamentResult(match,score)],2).complete,false);
 assert.equal(tournamentStatus([tournamentResult(match,score)],2).remainingMatches,1);
 assert.throws(()=>makeSchedule({entrants:[entrants[0],entrants[0]],maps:['proving'],seeds:[1]}),/unique/);
});
test('all 2016 clean historical tournament outcomes keep the same standings',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../docs/tournaments/seven-models-2026-11-15.json',import.meta.url)));
 for(const q of Object.values(data.modes))assert.deepEqual(standings(data.entrants,q.results).map(({unscored,...r})=>r),q.standings);
});
test('host timing changes CPU telemetry without changing gameplay',()=>{
 const play=delta=>{let time=0;return runMatch({mode:'1v1',map:'proving',seed:1,teams:[[loadBot('rookie')],[loadBot('rookie')]],maxTime:2,now:()=>time+=delta});};
 const fast=play(1),slow=play(300);
 assert.deepEqual(slow.vehicles.flatMap(v=>v.errors),[]);
 assert.notDeepEqual(fast.vehicles.map(v=>v.cpu),slow.vehicles.map(v=>v.cpu));
 const strip=r=>JSON.parse(JSON.stringify(r,(k,v)=>k==='cpu'?undefined:v));
 assert.deepEqual(strip(fast),strip(slow));
});
