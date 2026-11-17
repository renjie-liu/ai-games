import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rescoreTournament } from '../tools/rescore-tournament.mjs';
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
test('re-scoring all 2016 historical outcomes preserves every record and diagnostic',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../docs/tournaments/seven-models-2026-11-15.json',import.meta.url)));
 for(const q of Object.values(data.modes)){
  const rows=standings(data.entrants,q.results);
  for(const {unscored,rating,rank,...r} of rows)assert.deepEqual(r,q.standings.find(old=>old.id===r.id));
  const ranking=rs=>rs.map(({hullDiff,...r})=>r);
  assert.deepEqual(ranking(rows),ranking(standings(data.entrants,q.results.slice().reverse())));
 }
});
test('host timing changes CPU telemetry without changing gameplay',()=>{
 const play=delta=>{let time=0;return runMatch({mode:'1v1',map:'proving',seed:1,teams:[[loadBot('rookie')],[loadBot('rookie')]],maxTime:2,now:()=>time+=delta});};
 const fast=play(1),slow=play(300);
 assert.deepEqual(slow.vehicles.flatMap(v=>v.errors),[]);
 assert.notDeepEqual(fast.vehicles.map(v=>v.cpu),slow.vehicles.map(v=>v.cpu));
 const strip=r=>JSON.parse(JSON.stringify(r,(k,v)=>k==='cpu'?undefined:v));
 assert.deepEqual(strip(fast),strip(slow));
});

// Uneven/partial schedules expose why raw points cannot determine strength.
test('strength rewards stronger opposition, counts a whole squad once, and ignores hull margins', () => {
 const es = ['a','b','strong','weak','unplayed'].map(id => ({id,bots:[id,id,id]}));
 const results = [];
 const games = (a,b,w,l) => { for(let i=0;i<w+l;i++) results.push({a,b,winner:i<w?0:1,teams:[[a,a,a],[b,b,b]],hull:[1,0]}); };
 games('a','weak',8,2); games('b','strong',6,4); games('strong','weak',18,2);
 const table=standings(es,results), a=table.find(r=>r.id==='a'), b=table.find(r=>r.id==='b');
 assert.ok(b.rating>a.rating && b.rank<a.rank, JSON.stringify(table));
 assert.ok(b.points<a.points && b.winRate<a.winRate);
 assert.equal(a.played,10); assert.equal(b.played,10);
 assert.equal(table.find(r=>r.id==='unplayed').rank,null);
 const ratings=rows=>rows.map(({id,rank,rating,played})=>({id,rank,rating,played}));
 assert.deepEqual(ratings(table),ratings(standings(es,results.map(r=>({...r,hull:[0,1000]})).reverse())));
 assert.deepEqual(ratings(table),ratings(standings(es,results.map(({teams,...r})=>r))));
});
test('draws count as half a win and hull cannot break a strength tie', () => {
 const results=[{...match,winner:-1,hull:[0,1000]}];
 const table=standings(entrants,results);
 assert.deepEqual(table.map(r=>[r.id,r.rating,r.rank,r.played,r.d]),[['a',1500,1,1,1],['b',1500,2,1,1]]);
 const failed=standings(entrants,[{...match,winner:-1,void:true}]);
 assert.ok(failed.every(r=>r.rank===null && r.rating===1500 && r.played===0));
});

test('MCP head-to-head summaries reproduce ratings and reject inconsistent evidence', () => {
 const data=JSON.parse(fs.readFileSync(new URL('../docs/tournaments/seven-models-v3-2026-11-17.json',import.meta.url)));
 const rated=rescoreTournament(data);
 for(const [mode,q] of Object.entries(rated.modes)) {
  assert.equal(q.scoredMatches,1176);
  assert.deepEqual(q.standings.map(r=>r.bot),data.modes[mode].standings.map(r=>r.bot));
  assert.ok(q.standings.every(r=>Number.isInteger(r.rating) && r.played===336));
 }
 const broken=structuredClone(data); broken.modes['1v1'].headToHead.sol.astra='0-0-56';
 assert.throws(()=>rescoreTournament(broken),/non-reciprocal/);
 const incomplete=structuredClone(data); incomplete.modes['2v2'].unscoredMatches=1;
 assert.throws(()=>rescoreTournament(incomplete),/incomplete or failed/);
});
