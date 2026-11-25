import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncStatus} from './live-sync.mjs';
import {LiveHub} from './live.mjs';
import {Room} from './world.mjs';
const node=(status,ids=[3,4],extra={})=>({stage:'node',status,room_event_ids:ids,sequence:null,...extra});
const worker=(status,ids=[3,4],extra={})=>({stage:'worker',status,room_event_ids:ids,sequences:[1],...extra});
function start(){const s=new SyncStatus();s.start(true);return s;}
test('pipe and send attempt are never counted as provider delivery',()=>{
  const s=start();s.accept(node('queued'));assert.equal(s.snapshot().queued,2);
  s.accept(node('dispatched',[3,4],{sequence:1}));assert.equal(s.snapshot().sent,0);assert.equal(s.snapshot().forwarded,2);
  s.accept(worker('send_attempt'));assert.equal(s.snapshot().sending,2);assert.equal(s.snapshot().sent,0);
  s.accept(worker('fixture_sent'));assert.equal(s.snapshot().sent,2);assert.equal(s.snapshot().source,'offline-fixture');
});
test('later sent batch cannot erase an earlier limit gap or unknown delivery',()=>{
  const s=start();s.accept(node('not_delivered',[8],{reason:'batch_limit'}));s.accept(node('delivery_unknown',[9]));
  s.accept(node('queued',[3]));s.accept(node('dispatched',[3],{sequence:1}));s.accept(worker('transport_sent',[3]));
  const d=s.snapshot();assert.equal(d.not_delivered,1);assert.equal(d.uncertain,1);assert.equal(d.sent,1);assert.equal(d.limited,true);
  s.accept(node('rebound',[8]));assert.equal(s.snapshot().not_delivered,1);
});
test('dedup and repeated notices do not inflate counts or emit redundant versions',()=>{
  const s=start();s.accept(node('queued'));const before=s.snapshot();assert.equal(s.accept(node('queued')),false);
  assert.equal(s.accept(node('deduplicated',[7])),false);assert.deepEqual(s.snapshot(),before);
});
test('worker must reference an actually dispatched event and matching batch',()=>{
  const s=start();s.accept(node('queued'));
  for(const row of [worker('transport_sent'),worker('transport_sent',[99]),worker('transport_sent',[3],{sequences:[4]})])assert.equal(s.accept(row),false);
  s.accept(node('dispatched',[3,4],{sequence:2}));assert.equal(s.accept(worker('transport_sent')),false);
  s.accept(worker('transport_sent',[3,4],{sequences:[2]}));assert.equal(s.snapshot().sent,2);
});
test('stop marks local unsent versus forwarded uncertain; late events cannot reopen',()=>{
  const s=start();s.accept(node('queued',[3,4]));s.accept(node('dispatched',[4],{sequence:1}));s.close();
  assert.equal(s.snapshot().not_delivered,1);assert.equal(s.snapshot().uncertain,1);const before=s.snapshot();
  assert.equal(s.accept(worker('fixture_sent',[4])),false);s.close();s.start(false);assert.deepEqual(s.snapshot(),before);
});
test('bounded summary only exports counts; injected private fields and unknown status stay out',()=>{
  const s=start();for(let id=1;id<=200;id++)s.accept(node('not_delivered',[id],{reason:'batch_limit',private:'PRIVATE_SENTINEL'}));
  assert.equal(s.facts.size,128);assert.equal(s.snapshot().not_delivered,128);assert.equal(s.snapshot().untracked,true);
  for(const status of ['__proto__','constructor','PRIVATE_SENTINEL'])assert.equal(s.accept(node(status)),false);
  assert.equal(s.accept(worker('transport_sent',[true])),false);
  assert.equal(JSON.stringify(s.snapshot()).includes('PRIVATE_SENTINEL'),false);
  assert.deepEqual(Object.keys(s.snapshot()).sort(),['version','phase','source','queued','forwarded','sending','sent','not_delivered','uncertain','limited','untracked'].sort());
});
test('summary is human-seat only and uses public receipts for either player side',()=>{
  for(const human of ['west','east']){
    const ai=human==='west'?'east':'west',r=new Room({[human]:'human',[ai]:'live'}),h=new LiveHub('.','http://localhost',false),j=h.get(r);
    j.started=true;j.seat=ai;j.fixture=true;j.sync.start(true);
    const c={type:'action',id:'send-key'};const proposal=r.command('east',c);
    if(human==='east')h.notify(r,human,c,proposal);
    else {const accept={type:'accept',id:r.pending.id};h.notify(r,human,accept,r.command(human,accept));}
    const view=h.playerView(r,human);assert.ok(view.liveSync.queued>0);
    assert.equal('liveSync' in h.playerView(r,'watch'),false);assert.equal('liveSync' in h.playerView(r,ai),false);
    assert.equal(JSON.stringify(view.liveSync).includes(r.tokens[ai]),false);j.updates.clear();
  }
});
