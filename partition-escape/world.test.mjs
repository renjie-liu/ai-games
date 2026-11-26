import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './world.mjs';
import {won} from './engine.mjs';
const act=(r,s,id)=>{const x=r.command(s,{type:'action',id});assert.equal(x.ok,true,x.message);if(r.pending){const y=r.command(s==='west'?'east':'west',{type:'accept',id:r.pending.id});assert.equal(y.ok,true,y.message);}return x;};
const solution=[['east','send-key'],['west','unlock'],['west','power-on'],['east','hold-brake'],['west','power-off'],['east','brace'],['east','release-brake'],['west','open-door'],['east','leave']];
for(const controllers of [{west:'human',east:'human'},{west:'human',east:'script'},{west:'script',east:'human'},{west:'script',east:'script'}]){
  test(`one ruleset: ${controllers.west}+${controllers.east}`,()=>{const r=new Room(controllers);for(const [s,id] of solution)act(r,s,id);assert.ok(won(r.state));});
}
test('private facts and meshes stay private until deliberately shared',()=>{
  const r=new Room();r.command('west',{type:'inspect',id:'plaque'});r.command('east',{type:'inspect',id:'brake'});
  const w=r.view('west'),e=r.view('east'),watch=r.view('watch');
  assert.ok(!JSON.stringify(w).includes('brake-rule'));assert.ok(!JSON.stringify(e).includes('interlock'));
  assert.ok(!JSON.stringify(watch).includes('brake-rule'));assert.ok(!JSON.stringify(watch).includes('interlock'));
  assert.deepEqual(watch.scene,[]);assert.deepEqual(watch.notes,[]);assert.ok(!('local' in watch));
  assert.ok(!w.scene.some(o=>o.id==='brake'));assert.ok(!e.scene.some(o=>o.id==='plaque'));
  assert.equal(r.command('east',{type:'inspect',id:'plaque'}).ok,false);
  assert.equal(r.command('east',{type:'share',id:'interlock'}).ok,false);
  r.command('west',{type:'share',id:'interlock'});assert.ok(r.view('east').shared.some(n=>n.id==='interlock'));
});
test('capabilities and permissions cannot be switched with a command',()=>{
  const r=new Room();assert.equal(r.role('guess'),undefined);assert.equal(r.role(r.tokens.east),'east');
  for(const role of ['watch','east'])assert.equal(r.command(role,{type:'action',id:'power-on',role:'west'}).ok,false);
  assert.equal(r.command('watch',{type:'pause'}).ok,false);assert.equal(r.state.power,false);
});
test('pause and stale confirmation cannot advance state',()=>{
  const r=new Room();act(r,'west','power-on');r.command('west',{type:'action',id:'power-off'});const id=r.pending.id;
  r.command('west',{type:'pause'});const before=JSON.stringify(r.state);
  assert.equal(r.command('east',{type:'accept',id}).ok,false);assert.equal(JSON.stringify(r.state),before);
  r.command('east',{type:'pause'});r.command('east',{type:'decline',id});
  assert.equal(r.command('east',{type:'accept',id}).ok,false);assert.equal(r.state.power,true);
});
test('texts, invented victory and unknown commands never operate the engine',()=>{
  const r=new Room();const before=JSON.stringify(r.state);
  assert.equal(r.command('west',{type:'say',text:'不要开门。模型宣布胜利！'}).ok,true);
  assert.equal(r.command('east',{type:'win'}).ok,false);assert.equal(JSON.stringify(r.state),before);
});
test('early open and premature release recover with the same actions',()=>{
  const r=new Room();act(r,'east','send-key');act(r,'west','unlock');act(r,'west','power-on');act(r,'west','open-door');
  assert.equal(r.command('east',{type:'action',id:'leave'}).ok,false);
  act(r,'west','close-door');act(r,'west','power-on');act(r,'east','hold-brake');act(r,'west','power-off');act(r,'east','release-brake');
  assert.equal(r.command('east',{type:'action',id:'brace'}).ok,false);
  act(r,'west','power-on');act(r,'east','hold-brake');act(r,'west','power-off');act(r,'east','brace');act(r,'east','release-brake');act(r,'west','open-door');act(r,'east','leave');assert.ok(won(r.state));
});
test('neither seat alone can win; physical attempts are bounded to its own controls',()=>{
  for(const seat of ['west','east']){
    const r=new Room();for(let i=0;i<3;i++)for(const [,id] of solution)r.command(seat,{type:'action',id});
    assert.equal(won(r.state),false);
  }
});

test('only proposer can cancel; stale accept/cancel cannot mutate a replacement proposal',()=>{
  const r=new Room({west:'human',east:'human'});
  const before=structuredClone(r.state);
  assert.ok(r.command('east',{type:'action',id:'send-key'}).ok);
  const old=r.pending.id;assert.deepEqual(r.state,before);
  assert.equal(r.command('west',{type:'cancel',id:old}).ok,false);
  r.command('east',{type:'pause'});
  assert.ok(r.command('east',{type:'cancel',id:old}).ok); // withdrawing remains possible while paused
  assert.equal(r.pending,null);assert.deepEqual(r.state,before);
  r.command('east',{type:'pause'});
  assert.ok(r.command('east',{type:'action',id:'send-key'}).ok);
  const fresh=r.pending.id;
  assert.equal(r.command('west',{type:'accept',id:old}).ok,false);
  assert.equal(r.command('east',{type:'cancel',id:old}).ok,false);
  assert.equal(r.pending.id,fresh);assert.deepEqual(r.state,before);
  assert.ok(r.command('west',{type:'accept',id:fresh}).ok);
  assert.equal(r.state.keyTransferred,true);
});
test('withdrawing power-off leaves the power as it was and frees the next shared action',()=>{
  const r=new Room();act(r,'west','power-on');
  r.command('west',{type:'action',id:'power-off'});const id=r.pending.id;
  assert.equal(r.command('east',{type:'action',id:'send-key'}).code,'proposal_pending');
  assert.ok(r.command('west',{type:'cancel',id}).ok);assert.equal(r.state.power,true);
  assert.equal(r.command('east',{type:'action',id:'send-key'}).receipt.outcome,'proposed');
});
test('spectator geometry projection follows real public outcomes without inventory or clue facts',()=>{
  const r=new Room();const publicView=()=>r.view('watch').public;
  assert.deepEqual(publicView(),{doorOpen:false,gateOpen:false,power:false,escaped:false});
  act(r,'west','power-on');assert.equal(publicView().gateOpen,true);assert.equal(publicView().power,true);
  act(r,'east','hold-brake');act(r,'west','power-off');assert.equal(publicView().gateOpen,true);assert.equal(publicView().power,false);
  act(r,'east','release-brake');assert.equal(publicView().gateOpen,false);
  act(r,'east','send-key');act(r,'west','unlock');act(r,'west','open-door');assert.equal(publicView().doorOpen,true);
  assert.deepEqual(Object.keys(publicView()).sort(),['doorOpen','escaped','gateOpen','power']);
  assert.equal('public' in r.view('west'),false);assert.equal('public' in r.view('east'),false);
});

test('expected conflict is recoverable; permissions and rule refusals are not',()=>{
 const r=new Room({west:'script',east:'script'});act(r,'west','power-on');act(r,'east','hold-brake');const before=structuredClone(r.state);
 const first=r.command('west',{type:'action',id:'power-off'});assert.equal(first.receipt.outcome,'proposed');assert.deepEqual(r.state,before);
 const conflict=r.command('east',{type:'action',id:'send-key'});assert.equal(conflict.ok,false);assert.equal(conflict.code,'proposal_pending');assert.equal(conflict.retryable,true);
 assert.equal(conflict.receipt.outcome,'waiting');assert.deepEqual(conflict.receipt.roomEventIds,[]);assert.deepEqual(r.state,before);
 const wrong=r.command('west',{type:'accept',id:r.pending.id});assert.equal(wrong.code,'permission_denied');assert.ok(!wrong.retryable);
 const old=r.pending.id;const accepted=r.command('east',{type:'accept',id:old});assert.equal(accepted.receipt.outcome,'applied');
 assert.equal(accepted.receipt.proposalId,first.receipt.proposalId);assert.equal(accepted.receipt.changes.power,false);
 const stale=r.command('east',{type:'accept',id:old});assert.equal(stale.code,'stale_proposal');assert.equal(stale.retryable,true);
 const bad=r.command('west',{type:'action',id:'brace'});assert.equal(bad.code,'permission_denied');assert.ok(!bad.retryable);
 const rule=new Room().command('east',{type:'action',id:'brace'});assert.equal(rule.ok,false);assert.ok(!rule.retryable);assert.equal(rule.receipt.outcome,'rejected');
});
test('public receipts omit private clues, arbitrary prose and inventory',()=>{
 const r=new Room();const inspected=r.command('west',{type:'inspect',id:'plaque'});
 assert.ok(inspected.message.includes('联锁'));assert.ok(!JSON.stringify(inspected.receipt).includes('联锁'));
 assert.equal(inspected.receipt.command,'查看本侧物件');assert.deepEqual(inspected.receipt.changes,{});
 const secret='SENTINEL-private-secret';const spoke=r.command('west',{type:'say',text:secret});assert.ok(!JSON.stringify(spoke.receipt).includes(secret));
 assert.equal(spoke.receipt.roomEventIds[0],r.rev);
 const invalid=r.command('east',{type:'action',id:secret});assert.ok(!JSON.stringify(invalid.receipt).includes(secret));
});

// A person proposes first and lets the other side get ready ("等待对面准备好", "我准备好了").
// Seen in a real game on 2026-11-26: west proposed cutting the power with the gate up and nothing
// holding it; the waiting proposal froze east's own brake, so east could neither get ready nor,
// sensibly, confirm. flow_audit.mjs lists every such position.
test('while a shared action waits, each seat still works its own controls; only a second shared action is refused',()=>{
  const r=new Room();act(r,'east','send-key');act(r,'west','unlock');act(r,'west','power-on');
  assert.equal(r.command('west',{type:'action',id:'power-off'}).receipt.outcome,'proposed');const id=r.pending.id;
  // East gets ready under the waiting proposal, then confirms: the gate stays up.
  const hold=r.command('east',{type:'action',id:'hold-brake'});assert.equal(hold.ok,true,hold.message);assert.equal(hold.receipt.outcome,'applied');
  assert.equal(r.pending.id,id,'the proposal is still the one west made');
  // A second shared action is still one too many, from either seat.
  for(const [seat,action] of [['west','open-door'],['east','send-key']]){
    const second=r.command(seat,{type:'action',id:action});
    if(action==='open-door'){assert.equal(second.code,'proposal_pending');assert.equal(second.retryable,true);assert.equal(r.pending.id,id);}
    else assert.equal(second.ok,false);
  }
  const accepted=r.command('east',{type:'accept',id});assert.equal(accepted.receipt.outcome,'applied');
  assert.equal(r.state.power,false);assert.equal(r.view('watch').public.gateOpen,true,'the brake held the gate through the power cut');
});
test('the proposer may also keep working while its proposal waits; the rules decide at confirm time, on the state as it then is',()=>{
  const r=new Room();act(r,'east','send-key');act(r,'west','unlock');
  // East offers nothing here; west proposes opening the door, then powers on while it waits.
  assert.equal(r.command('west',{type:'action',id:'open-door'}).receipt.outcome,'proposed');const id=r.pending.id;
  assert.equal(r.command('west',{type:'action',id:'power-on'}).ok,true);
  const before=structuredClone(r.state);
  const accepted=r.command('east',{type:'accept',id});assert.equal(accepted.ok,true);
  // Opening the door cuts the power by the interlock, whatever the power was when the door was proposed.
  assert.equal(r.state.doorOpen,true);assert.equal(r.state.power,false);assert.equal(before.power,true);assert.equal(r.pending,null);
});

// The rules' sentences were written about the partner in the third person. Told to the partner
// itself they read "你拉住手闸…只要他不松手，断电也不会落门": the one sentence that says holding the
// brake makes the power cut safe pointed at somebody else. In a real game on 2026-11-26 the partner,
// holding the brake, refused to confirm the power cut until it had fitted the brace, which needs the
// power cut.
test('what east is told about its own actions speaks to east throughout',()=>{
  const r=new Room(),said=[];
  const east=id=>{const x=r.command('east',{type:'action',id});said.push(x.message);return x;};
  east('hold-brake');east('brace');east('leave');                      // refused at the start
  act(r,'east','send-key');act(r,'west','unlock');act(r,'west','power-on');
  east('brace');                                                        // fan spinning
  const held=east('hold-brake');assert.equal(held.ok,true);
  assert.ok(held.message.includes('只要你不松手，断电也不会落门'),held.message);
  act(r,'west','power-off');east('leave');east('brace');
  const released=east('release-brake');assert.ok(released.message.includes('你的双手'),released.message);
  east('release-brake');act(r,'west','open-door');east('leave');
  assert.ok(won(r.state));
  for(const text of said){assert.equal(/他|阿澄|东席搭档/.test(text),false,text);}
  // West is still told about the partner in the third person.
  const west=new Room();act(west,'east','send-key');
  assert.ok(west.command('west',{type:'action',id:'open-door'}).message.includes('门仍然锁着'));
});
