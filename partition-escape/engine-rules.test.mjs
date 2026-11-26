// The rules a rule set adds to the engine: a battery, a choice of supports, the load test, a rating.
// engine.test.mjs keeps pinning the room without them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,won,validState,gateOpen,actionsFor,rating,playerActions,partnerActions} from './engine.mjs';

// brace-1 fits but is too weak, brace-2 is the right one, brace-3 fits but is too weak, brace-4 is too long.
const support=(mark,length,fits,holds)=>({mark,length,fits,holds,ratings:{}});
const SUPPORTS=[support('三角',110,true,false),support('圆圈',120,true,true),support('方块',100,true,false),support('菱形',150,false,false)];
const STARS={three:{power_ons:1,spare_packs:0},two:{spare_packs:0}};
const puzzleWith=(cells=2,supports=SUPPORTS,stars=STARS)=>({cells,weight:240,tag:'黄',tags:['红','黄'],slot:[100,120],supports,stars});
const PUZZLE=puzzleWith();
const actorOf=(action,puzzle)=>actionsFor(puzzle).player.has(action)?'player':'partner';
const step=(s,action,puzzle=PUZZLE)=>transition(s,action,actorOf(action,puzzle),puzzle);
function run(sequence,s=initialState(PUZZLE),puzzle=PUZZLE){
  for(const action of sequence){const r=step(s,action,puzzle);assert.equal(r.ok,true,`${action}: ${r.message}`);s=r.state;}
  return s;
}
const refused=(s,action,pattern,puzzle=PUZZLE)=>{const r=step(s,action,puzzle);assert.equal(r.ok,false,action);assert.match(r.message,pattern);assert.strictEqual(r.state,s);};
const READY=['send-key','unlock','power-on','hold-brake','power-off'];   // gate up on the brake, fan stopped

test('a room without a rule set is the room as it was',()=>{
  assert.deepEqual(Object.keys(initialState()),Object.keys(initialState(null)));
  assert.equal(Object.keys(initialState()).length,10);
  assert.deepEqual(actionsFor(),{player:playerActions,partner:partnerActions});
  assert.equal(rating(initialState(),null),null);
  for(const action of ['swap-pack','brace-1'])assert.equal(transition(initialState(),action,'player').ok,false);
});
test('the state of a room with a rule set carries the battery and the support, and is not valid without it',()=>{
  const s=initialState(PUZZLE);
  assert.deepEqual({charge:s.charge,packs:s.packs,powerOns:s.powerOns,support:s.support,sound:s.sound},{charge:2,packs:0,powerOns:0,support:null,sound:null});
  assert.equal(validState(s,PUZZLE),true);assert.equal(validState(s),false);assert.equal(validState(initialState(),PUZZLE),false);
  assert.equal(actionsFor(PUZZLE).player.has('swap-pack'),true);
  assert.deepEqual([...actionsFor(PUZZLE).partner].filter(a=>a.startsWith('brace')),['brace-1','brace-2','brace-3','brace-4']);
  for(const bad of [{charge:3},{charge:-1},{charge:1.5},{packs:-1},{support:4},{support:1,sound:true},{support:null,braced:true,braceSeen:true},{sound:true}])
    assert.equal(validState({...s,...bad},PUZZLE),false,JSON.stringify(bad));
});
test('a pair that picks the right support leaves on one cell, with three stars',()=>{
  let s=run([...READY,'brace-2']);
  assert.equal(s.braced,true);assert.equal(s.support,1);assert.equal(won(s),false);
  // Walking out needs both hands: the support has to be tried first.
  s=run(['open-door'],s);refused(s,'leave',/松手/);
  s=run(['release-brake'],s);assert.equal(gateOpen(s),true);assert.equal(s.loadTested,true);
  s=run(['leave'],s);assert.equal(won(s),true);
  assert.deepEqual(rating(s,PUZZLE),{stars:3,powerOns:1,packs:0});
  assert.equal(s.charge,1);
});
test('a support that is too weak looks the same going in, and gives way when the hand comes off',()=>{
  const before=run(READY);
  const weak=step(before,'brace-1'),right=step(before,'brace-2');
  assert.equal(weak.ok,true);assert.equal(weak.message.replace('三角','圆圈'),right.message);
  assert.equal(gateOpen(weak.state),true);assert.equal(weak.state.braced,true);
  // Nothing east can see differs but the mark.
  const seen=s=>({braced:s.braced,gate:gateOpen(s),brake:s.brake,power:s.power});
  assert.deepEqual(seen(weak.state),seen(right.state));
  const let_go=step(weak.state,'release-brake');
  assert.equal(let_go.ok,true);assert.match(let_go.message,/承不住/);
  assert.deepEqual({braced:let_go.state.braced,support:let_go.state.support,sound:let_go.state.sound,gate:gateOpen(let_go.state),tested:let_go.state.loadTested},
    {braced:false,support:null,sound:null,gate:false,tested:false});
  // Raising the gate again takes the second cell; the right support then holds. Two stars.
  const s=run(['power-on','hold-brake','power-off','brace-2','release-brake','open-door','leave'],let_go.state);
  assert.equal(won(s),true);assert.deepEqual(rating(s,PUZZLE),{stars:2,powerOns:2,packs:0});
});
test('a weak support also gives way when the power that was holding the gate is cut, by the switch or by the door',()=>{
  for(const cut of ['power-off','open-door']){
    // In the slot, then power back on, then the hand off the brake: the gate hangs on the power alone.
    const s=run([...READY,'brace-3','power-on','release-brake']);
    assert.equal(gateOpen(s),true);assert.equal(s.braced,true);assert.equal(s.loadTested,false);
    const r=step(s,cut);
    assert.equal(r.ok,true,cut);assert.match(r.message,/承不住/,cut);
    assert.equal(gateOpen(r.state),false,cut);assert.equal(r.state.braced,false,cut);assert.equal(validState(r.state,PUZZLE),true,cut);
  }
});
test('a support that does not fit never goes in, and one in the slot stays until it gives way',()=>{
  const s=run(READY);
  refused(s,'brace-4',/菱形.*放不进/);
  const held=run(['brace-1'],s);
  refused(held,'brace-2',/已经有一根/);
  // The same reasons as before for not reaching in at all.
  refused(initialState(PUZZLE),'brace-2',/闸门挡住/);
  refused(run(['power-on','hold-brake']),'brace-2',/风扇正在转/);
  refused(run(['power-on','hold-brake','power-off','release-brake','power-on']),'brace-2',/风扇正在转/);
});
test('each power-on takes a cell; an empty pack is swapped for a spare, which is counted',()=>{
  let s=run(['power-on']);assert.equal(s.charge,1);assert.equal(s.powerOns,1);
  refused(s,'swap-pack',/还有电/);
  s=run(['power-off','power-on'],s);assert.equal(s.charge,0);
  refused(s,'swap-pack',/动力开着/);
  s=run(['power-off'],s);
  refused(s,'power-on',/电池.*用完/);
  s=run(['swap-pack'],s);assert.deepEqual({charge:s.charge,packs:s.packs},{charge:2,packs:1});
  s=run(['power-on','send-key','unlock','hold-brake','power-off','brace-2','release-brake','open-door','leave'],s);
  assert.deepEqual(rating(s,PUZZLE),{stars:1,powerOns:3,packs:1});
});
test('the stars follow the caps of the rule set',()=>{
  const done=run([...READY,'brace-2','release-brake','open-door','leave']);
  assert.equal(rating(done,puzzleWith(2,SUPPORTS,{three:{power_ons:0},two:{power_ons:1}})).stars,2);
  assert.equal(rating(done,puzzleWith(2,SUPPORTS,{two:{power_ons:0}})).stars,1);
  assert.equal(rating(done,puzzleWith(2,SUPPORTS,null)),null);
  assert.equal(rating(run(READY),PUZZLE),null,'no rating before the end');
});
test('a battery without a choice of supports, and a choice without a battery',()=>{
  const cells={cells:1,supports:null,stars:null};
  let s=run(['send-key','unlock','power-on','hold-brake','power-off','brace','open-door','leave'],initialState(cells),cells);
  assert.equal(won(s),true);assert.equal(s.charge,0);assert.equal('support' in s,false);assert.equal(rating(s,cells),null);
  const pick=puzzleWith(null,SUPPORTS,null);
  s=initialState(pick);assert.equal('charge' in s,false);assert.equal(actionsFor(pick).player.has('swap-pack'),false);
  s=run(['power-on','power-off','power-on','power-off','power-on','hold-brake','power-off','brace-1','release-brake'],s,pick);
  assert.equal(gateOpen(s),false);assert.equal(validState(s,pick),true);
});
// The whole space, on the real engine: every position the rules can reach is a valid state and can
// still be won, whatever the pack size and however many supports mislead.
for(const [cells,supports] of [[1,SUPPORTS],[2,SUPPORTS],[3,SUPPORTS],[2,SUPPORTS.slice(1)],[2,[...SUPPORTS,support('十字',110,true,false)]],[null,SUPPORTS]]){
  test(`no dead end with ${cells??'no'} cells and ${supports.length} supports`,()=>{
    const puzzle=puzzleWith(cells,supports),{player,partner}=actionsFor(puzzle),all=[...player,...partner];
    // Counters do not make a position different.
    const keyOf=s=>JSON.stringify(Object.entries(s).filter(([k])=>!['moves','packs','powerOns'].includes(k)));
    const states=new Map(),edges=new Map(),queue=[initialState(puzzle)];states.set(keyOf(queue[0]),queue[0]);
    while(queue.length){
      const s=queue.shift(),k=keyOf(s);edges.set(k,[]);
      for(const a of all){const r=transition(s,a,player.has(a)?'player':'partner',puzzle);if(!r.ok)continue;
        assert.equal(validState(r.state,puzzle),true,`${a} from ${k}`);
        const nk=keyOf(r.state);edges.get(k).push(nk);if(!states.has(nk)){states.set(nk,r.state);queue.push(r.state);}}
    }
    const canWin=new Set([...states].filter(([,s])=>won(s)).map(([k])=>k));
    for(let grew=true;grew;){grew=false;for(const [k,out] of edges)if(!canWin.has(k)&&out.some(n=>canWin.has(n))){canWin.add(k);grew=true;}}
    assert.deepEqual([...states.keys()].filter(k=>!canWin.has(k)),[]);
    assert.ok(states.size>43,`${states.size} positions`);
  });
}
