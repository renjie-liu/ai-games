import test from 'node:test';
import assert from 'node:assert/strict';
import {SimHost} from '../web/src/host.js';
function setup(t){
 const previous=globalThis.Worker,workers=[];
 globalThis.Worker=class{constructor(){this.sent=[];workers.push(this)}postMessage(m){this.sent.push(m)}terminate(){this.terminated=true}reply(m){this.onmessage?.({data:m})}};
 t.after(()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous});
 t.mock.timers.enable({apis:['setTimeout']});
 const host=new SimHost({wrapBotSource:()=>'(function(){})'},'', '');host.setBots({a:'source'});t.after(()=>host.dispose());return{host,workers};
}
test('queued simulations get their own timeout only after dispatch',async t=>{
 const{host,workers}=setup(t);const first=host.call({type:'first'},{timeout:100});const second=host.call({type:'second'},{timeout:10});
 t.mock.timers.tick(11);assert.equal(workers[0].sent.length,1);assert.equal(host.jobs.size,2);
 workers[0].reply({id:1,ok:true,result:'first'});assert.equal(await first,'first');assert.equal(workers[0].sent.length,2);
 t.mock.timers.tick(9);workers[0].reply({id:2,ok:true,result:'second'});assert.equal(await second,'second');assert.equal(host.jobs.size,0);
});
test('cancel rejects active and queued work and old messages cannot affect a new worker',async t=>{
 const{host,workers}=setup(t);const pending=Promise.allSettled([host.call({type:'a'}),host.call({type:'b'})]);host.cancel();
 assert.ok((await pending).every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));
 const fresh=host.call({type:'c'});workers[0].reply({id:3,ok:true,result:'stale'});workers[1].reply({id:3,ok:true,result:'fresh'});assert.equal(await fresh,'fresh');
 t.mock.timers.tick(30000);assert.equal(workers[1].terminated,undefined);
});
test('changing sources and worker errors immediately settle all affected work',async t=>{
 const{host,workers}=setup(t);const old=host.call({type:'old'}).catch(e=>e.message);host.setBots({a:'updated'});const fresh=host.call({type:'new'}).catch(e=>e.message);
 assert.match(await old,/Controllers changed/);workers[1].onerror({message:'crashed'});assert.match(await fresh,/crashed/);assert.equal(host.jobs.size,0);
});
