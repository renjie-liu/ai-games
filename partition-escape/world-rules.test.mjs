// A room made with the rule set that adds a battery, a choice of supports and a rating.
// world.test.mjs keeps pinning the room without them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './world.mjs';
import {won,braceAction} from './engine.mjs';
import {RETOLD_WORDS} from './room-rules.mjs';

const HUMANS={west:'human',east:'human'};
const make=(seed=3,controllers=HUMANS)=>new Room(controllers,{rules:'standard',seed});
const other=s=>s==='west'?'east':'west';
const ok=(r,seat,command)=>{const x=r.command(seat,command);assert.equal(x.ok,true,`${seat} ${JSON.stringify(command)}: ${x.message}`);return x;};
// A seat's own move, or a joint one proposed and then confirmed by the other seat.
const act=(r,seat,id)=>{const x=ok(r,seat,{type:'action',id});if(r.pending)ok(r,other(seat),{type:'accept',id:r.pending.id});return x;};
const play=(r,moves)=>{for(const [seat,id] of moves)act(r,seat,id);return r;};
const READY=[['east','send-key'],['west','unlock'],['west','power-on'],['east','hold-brake'],['west','power-off']];
const right=r=>braceAction(r.puzzle.supports.findIndex(s=>s.holds));
const weak=r=>braceAction(r.puzzle.supports.findIndex(s=>s.fits&&!s.holds));
const tooLong=r=>braceAction(r.puzzle.supports.findIndex(s=>!s.fits));
const text=(r,role)=>{r.look(role);return JSON.stringify(r.view(role));};

test('a room made without naming rules is the room as it was',()=>{
  const r=new Room(HUMANS);
  assert.equal(r.puzzle,null);assert.equal(r.rules,'classic');
  const w=r.view('west'),e=r.view('east');
  for(const view of [w,e,r.view('watch')])assert.equal('rating' in view,false);
  assert.deepEqual(Object.keys(w.local),['power','keyHere','unlocked','doorOpen']);
  assert.deepEqual(w.scene.map(o=>o.id),['plaque','power','door','hatch']);
  play(r,[['west','power-on']]);
  assert.deepEqual(r.view('east').scene.find(o=>o.id==='fan').actions.map(a=>a.id),['brace']);
});
test('a seed makes the same room again; a rule set has to exist; a scripted seat cannot take a choice of supports',()=>{
  assert.deepEqual(make(11).puzzle,make(11).puzzle);
  assert.notDeepEqual(make(11).puzzle,make(12).puzzle);
  assert.ok(Number.isInteger(new Room(HUMANS,{rules:'standard'}).seed));
  assert.throws(()=>new Room(HUMANS,{rules:'hard'}),/规则/);
  for(const controllers of [{west:'human',east:'script'},{west:'script',east:'human'},{west:'human',east:'model'}])
    assert.throws(()=>new Room(controllers,{rules:'standard'}),/支撑/);
  assert.equal(new Room({west:'human',east:'live'},{rules:'standard'}).rules,'standard');
});
test('what decides the support is split across the wall, and stays there',()=>{
  const r=make(),p=r.puzzle;
  play(r,[['west','power-on']]);          // the supports show once the gate has been up
  const west=text(r,'west'),east=text(r,'east'),watch=JSON.stringify(r.view('watch'));
  // West: the weight and the table. Nothing of lengths, the slot, or which tag hangs.
  assert.ok(west.includes(`${p.weight} 公斤`));
  for(const s of p.supports)for(const tag of p.tags)assert.ok(west.includes(String(s.ratings[tag])),`${s.mark} ${tag}`);
  assert.ok(!west.includes('厘米'));assert.ok(!west.includes(`${p.tag}色检修牌`));
  // East: the supports by mark and length, the slot, the tag. No weight and no rating.
  for(const s of p.supports)assert.ok(east.includes(`刻着${s.mark}的长 ${s.length} 厘米`),s.mark);
  assert.ok(east.includes(`${p.slot[0]} 到 ${p.slot[1]} 厘米`));assert.ok(east.includes(`${p.tag}色检修牌`));
  assert.ok(!east.includes('公斤'));
  // The audience gets neither.
  assert.ok(!watch.includes('公斤')&&!watch.includes('厘米')&&!watch.includes('检修牌'));
  // The table is a thing in the west room, laid out as a table, and not in the east room.
  const chart=r.view('west').notes.find(n=>n.object==='chart');
  assert.deepEqual(chart.table.columns,['记号',...p.tags.map(t=>t+'牌')]);
  assert.deepEqual(chart.table.rows,p.supports.map(s=>[s.mark,...p.tags.map(t=>s.ratings[t])]));
  assert.ok(r.view('west').scene.some(o=>o.id==='chart'));assert.ok(!r.view('east').scene.some(o=>o.id==='chart'));
  assert.equal(r.command('east',{type:'inspect',id:'chart'}).ok,false);
});
test('the supports are not seen before the gate has been raised once',()=>{
  const r=make();
  assert.ok(!text(r,'east').includes('刻着'));
  assert.deepEqual(r.view('east').scene.find(o=>o.id==='fan').actions,[]);
});
test('putting a support in is proposed by east and decided by west',()=>{
  const r=play(make(),READY),p=r.puzzle;
  const offered=r.view('east').scene.find(o=>o.id==='fan').actions;
  assert.deepEqual(offered.map(a=>a.id),p.supports.map((_,i)=>braceAction(i)));
  assert.ok(offered.every(a=>a.shared));
  assert.deepEqual(offered.map(a=>a.label),p.supports.map(s=>`装上刻着${s.mark}的支撑`));
  // The one that does not fit is refused on the spot, with the reason; nothing waits.
  const refused=r.command('east',{type:'action',id:tooLong(r)});
  assert.equal(refused.ok,false);assert.match(refused.message,/放不进/);assert.equal(r.pending,null);
  // A proposal names the mark and nothing else; west sees it, and nothing is in the slot yet.
  const proposed=ok(r,'east',{type:'action',id:weak(r)});
  assert.equal(proposed.receipt.outcome,'proposed');assert.equal(r.state.braced,false);
  const card=r.view('west').pending;
  assert.equal(card.from,'east');assert.match(card.label,/^装上刻着.+的支撑$/);assert.ok(!/\d/.test(card.label));
  // West says no: nothing moved, and east may offer another.
  ok(r,'west',{type:'decline',id:card.id});assert.equal(r.state.braced,false);
  ok(r,'east',{type:'action',id:right(r)});ok(r,'west',{type:'accept',id:r.pending.id});
  assert.equal(r.state.braced,true);assert.equal(r.view('east').local.support,p.supports.find(s=>s.holds).mark);
});
test('until the hand comes off the brake, east is shown the same for a weak support as for the right one',()=>{
  const sees=(r,pick)=>{
    play(r,READY);ok(r,'east',{type:'action',id:pick(r)});
    const accepted=ok(r,'west',{type:'accept',id:r.pending.id});
    const marks=new RegExp(r.puzzle.supports.map(s=>s.mark).join('|'),'g');
    const v=r.view('east');r.look('east');
    return JSON.stringify({local:v.local,notes:r.view('east').notes.map(n=>n.text),actions:v.scene.map(o=>o.actions.map(a=>a.id)),
      said:accepted.message,outcome:accepted.receipt.outcome,changes:accepted.receipt.changes,
      events:v.events.slice(-2).map(e=>e.text)}).replace(marks,'某');
  };
  assert.equal(sees(make(5),weak),sees(make(5),right));
  // And then it shows.
  const a=play(make(5),[...READY,['east',weak(make(5))]]),b=play(make(5),[...READY,['east',right(make(5))]]);
  const fell=ok(a,'east',{type:'action',id:'release-brake'}),held=ok(b,'east',{type:'action',id:'release-brake'});
  assert.match(fell.message,/承不住/);assert.deepEqual(fell.receipt.changes,{gateOpen:false});
  assert.match(held.message,/承住了/);assert.deepEqual(held.receipt.changes,{});
  assert.equal(a.view('east').local.support,null);
});
test('west sees the battery; east does not; an empty pack can be swapped at the console',()=>{
  const r=make();
  assert.deepEqual({charge:r.view('west').local.charge,cells:r.view('west').local.cells,packs:r.view('west').local.packs},{charge:2,cells:2,packs:0});
  const console_=()=>r.view('west').scene.find(o=>o.id==='power').actions.map(a=>a.id);
  assert.deepEqual(console_(),['power-on']);
  play(r,[['west','power-on']]);assert.equal(r.view('west').local.charge,1);assert.deepEqual(console_(),['power-off']);
  play(r,[['west','power-off'],['west','power-on'],['west','power-off']]);
  assert.equal(r.view('west').local.charge,0);assert.deepEqual(console_(),['power-on','swap-pack']);
  const empty=r.command('west',{type:'action',id:'power-on'});assert.equal(empty.ok,false);assert.match(empty.message,/用完/);
  assert.equal(r.command('east',{type:'action',id:'swap-pack'}).ok,false);
  const swapped=ok(r,'west',{type:'action',id:'swap-pack'});assert.equal(swapped.receipt.outcome,'applied');
  assert.deepEqual({charge:r.view('west').local.charge,packs:r.view('west').local.packs},{charge:2,packs:1});
  assert.ok(!JSON.stringify(r.view('east')).includes('charge'));
});
test('a whole game: the stars are shown to everyone once both are out, and not before',()=>{
  const clean=play(make(),[...READY]);
  assert.equal('rating' in clean.view('west'),false);
  play(clean,[['east',right(clean)],['east','release-brake'],['west','open-door'],['east','leave']]);
  assert.ok(won(clean.state));
  for(const role of ['west','east','watch'])assert.deepEqual(clean.view(role).rating,{stars:3,powerOns:1,packs:0});
  // One wrong support costs a cell and a star.
  const r=play(make(),[...READY]);
  play(r,[['east',weak(r)],['east','release-brake'],['west','power-on'],['east','hold-brake'],['west','power-off'],
    ['east',right(r)],['east','release-brake'],['west','open-door'],['east','leave']]);
  assert.deepEqual(r.view('west').rating,{stars:2,powerOns:2,packs:0});
});
test('the last hint of each seat points across the wall',()=>{
  const r=make();
  const last=role=>{let m;for(let i=0;i<3;i++)m=r.command(role,{type:'hint'}).message;return m;};
  assert.match(last('west'),/承重表.*检修牌/);assert.match(last('east'),/记号.*检修牌/);
});
test('walking out with a hand still on the brake is refused with the reason, told to east as its own',()=>{
  const r=play(make(),[...READY]);play(r,[['east',right(r)],['west','open-door']]);
  const x=r.command('east',{type:'action',id:'leave'});
  assert.equal(x.ok,false);assert.match(x.message,/^你还拉着手闸。先松手/);
});
test('the table cannot be handed across whole; the other clues still can',()=>{
  const r=make();r.look('west');r.look('east');
  const refused=r.command('west',{type:'share',id:'load-chart'});
  assert.equal(refused.ok,false);assert.match(refused.message,/只能自己看/);assert.deepEqual(r.shared,[]);
  ok(r,'west',{type:'share',id:'interlock'});ok(r,'east',{type:'share',id:'gate-rule'});
  assert.deepEqual(r.shared.map(n=>n.id),['interlock','gate-rule']);
});
// West cannot see the gate. What it hears through the wall has to say whether the support held.
test('what the other seat hears says when the gate came down or went up',()=>{
  const r=play(make(),[['west','power-on']]);
  const heard=()=>r.view('west').events.filter(e=>e.type==='action').at(-1).text;
  assert.match(heard(),/闸门升起/);
  play(r,[['east','hold-brake']]);assert.match(heard(),/机关动作/);
  play(r,[['east','send-key'],['west','unlock'],['west','power-off'],['east',weak(r)],['east','release-brake']]);
  assert.match(heard(),/^东席 · 松开手闸。.*闸门落下/);
  play(r,[['west','power-on'],['east','hold-brake'],['west','power-off'],['east',right(r)],['east','release-brake']]);
  assert.match(heard(),/^东席 · 松开手闸。墙内传来机关动作的声音。$/);
  // The same in a room without a rule set.
  const plain=play(new Room(HUMANS),[['west','power-on'],['west','power-off']]);
  assert.match(plain.view('east').events.filter(e=>e.type==='action').at(-1).text,/闸门落下/);
});

// --- neither room shows the other's half: the same moves in rooms that differ only there -----------
// A room whose puzzle is replaced before the first move. Marks and the number of supports stay, so
// the room's actions and labels still fit.
const withPuzzle=change=>{const r=make(5);r.puzzle=change(JSON.parse(JSON.stringify(r.puzzle)));return r;};
const holdsBy=p=>{for(const x of p.supports){x.fits=x.length>=p.slot[0]&&x.length<=p.slot[1];x.holds=x.fits&&x.ratings[p.tag]>=p.weight;}return p;};
// West's half differs: another weight, and the ratings of the right support and a weak one swapped,
// so the support that holds is another one.
const otherWestHalf=p=>{
  const a=p.supports.find(x=>x.holds),b=p.supports.find(x=>x.fits&&!x.holds);[a.ratings,b.ratings]=[b.ratings,a.ratings];
  p.weight+=20;for(const x of p.supports)for(const t of p.tags)x.ratings[t]+=20;
  return holdsBy(p);
};
// East's half differs: the other tag hangs, and every length and the slot are a hand longer.
const otherEastHalf=p=>{
  p.tag=p.tags.find(t=>t!==p.tag);p.slot=p.slot.map(v=>v+10);for(const x of p.supports)x.length+=10;
  return holdsBy(p);
};
// What is random in a room and says nothing: its ids and the time of day.
const plain=value=>JSON.stringify(value).replace(/"[a-f0-9]{12,24}"/g,'"#"').replace(/"\d{4}-\d\d-\d\dT[^"]+"/g,'"t"').replace(/"at":\d+/g,'"at":0');
// One game by the same moves, whatever the puzzle: the support east offers is chosen by its place.
// It stops with the gate hanging on the power alone and the power cut proposed, the support untried.
function trace(r,seat){
  const seen=[],pick=braceAction(make(5).puzzle.supports.findIndex(x=>x.holds));
  const note=result=>{r.look(seat);seen.push(plain({view:r.view(seat),foreseen:r.preview(seat),
    ...(result.receipt.seat===seat?{said:result.message,ok:result.ok,receipt:result.receipt}:{})}));};
  const moves=[['east','send-key'],['west','unlock'],['west','power-on'],['east','hold-brake'],['west','power-off'],
    ['east',pick],['west','power-on'],['east','release-brake']];
  for(const [who,id] of moves){
    note(r.command(who,{type:'action',id}));
    if(r.pending)note(r.command(other(who),{type:'accept',id:r.pending.id}));
  }
  note(r.command('west',{type:'action',id:'power-off'}));
  return seen;
}
test('east is shown the same whatever the weight and the table say, and west whatever the lengths, slot and tag are',()=>{
  const base=()=>withPuzzle(p=>p);
  // The rooms really differ where they should: another support holds.
  const held=r=>r.puzzle.supports.findIndex(x=>x.holds);
  assert.notEqual(held(withPuzzle(otherWestHalf)),held(base()));assert.notEqual(held(withPuzzle(otherEastHalf)),held(base()));
  assert.deepEqual(trace(withPuzzle(otherWestHalf),'east'),trace(base(),'east'));
  assert.deepEqual(trace(withPuzzle(otherEastHalf),'west'),trace(base(),'west'));
  // The audience is shown the same in all three.
  assert.deepEqual(trace(withPuzzle(otherWestHalf),'watch'),trace(base(),'watch'));
  assert.deepEqual(trace(withPuzzle(otherEastHalf),'watch'),trace(base(),'watch'));
  // And the comparison can fail: once the support is left alone under the gate the rooms part.
  const after=change=>{const r=withPuzzle(change);trace(r,'east');r.command('east',{type:'accept',id:r.pending.id});return plain(r.view('east').local);};
  assert.notEqual(after(otherWestHalf),after(p=>p));
});
test('what confirming would do never says whether an untried support will hold',()=>{
  const foreseen=(pick,proposal)=>{
    const r=play(make(5),READY);play(r,[['east',pick(r)],['west','power-on'],['east','release-brake']]);
    ok(r,'west',{type:'action',id:proposal});return r.preview('east');
  };
  for(const proposal of ['power-off','open-door']){
    const told=foreseen(right,proposal);
    assert.deepEqual(foreseen(weak,proposal),told,proposal);
    assert.deepEqual(Object.keys(told),['fanSpinning','untried_support'],proposal);
    assert.match(told.untried_support,/承不承得住/);
  }
  // A support that has borne the gate is known: what is foreseen is plain again.
  const tried=play(make(5),READY);play(tried,[['east',right(tried)],['east','release-brake'],['west','power-on']]);
  ok(tried,'west',{type:'action',id:'power-off'});
  assert.deepEqual(tried.preview('east'),{fanSpinning:false});
  // With a hand on the brake nothing rests on the support, and nothing is said about it.
  const held=play(make(5),READY);play(held,[['east',weak(held)]]);ok(held,'west',{type:'action',id:'open-door'});
  assert.deepEqual(held.preview('east'),{});
});
test('a refusal is told in the terms of the seat that hears it, and says the real reason',()=>{
  for(const rules of ['classic','standard']){
    const r=new Room(HUMANS,{rules,seed:5});
    play(r,[['east','send-key']]);
    const again=r.command('east',{type:'action',id:'send-key'});
    assert.equal(again.ok,false);assert.equal(again.message,'钥匙已经递给西席了。',rules);
  }
  // Reaching behind a spinning fan, proposed by east: "you", not a name.
  const r=play(make(5),[['west','power-on'],['east','hold-brake']]);
  const spinning=r.command('east',{type:'action',id:right(r)});
  assert.equal(spinning.ok,false);assert.match(spinning.message,/你没有伸手/);assert.ok(!spinning.message.includes('阿澄'));
  // A proposal that can no longer be carried out when west confirms it: west is told, as west.
  const late=play(make(5),READY);ok(late,'east',{type:'action',id:right(late)});
  ok(late,'west',{type:'action',id:'power-on'});
  const refused=late.command('west',{type:'accept',id:late.pending.id});
  assert.equal(refused.ok,false);assert.match(refused.message,/东席搭档没有伸手/);assert.ok(!refused.message.includes('你没有伸手'));
  // After the game is over the reason is that it is over.
  const done=play(new Room(HUMANS),[['east','send-key'],['west','unlock'],['west','power-on'],['east','hold-brake'],['west','power-off'],
    ['east','brace'],['west','open-door'],['east','leave']]);
  assert.match(done.command('east',{type:'action',id:'send-key'}).message,/已经走出去了/);
});
test('a seed has to be a whole number that can be kept',()=>{
  for(const seed of [NaN,-1,1.5,'7',2**60,null])assert.throws(()=>new Room(HUMANS,{rules:'standard',seed}),/种子/,String(seed));
  assert.equal(new Room(HUMANS,{rules:'standard',seed:0}).seed,0);
});
test('the words kept out of marks and tags are the ones the retelling rewrites',()=>{
  const r=make();
  for(const word of RETOLD_WORDS)assert.notEqual(r.told('east','hold-brake',true,`刻着${word}的`),`刻着${word}的`,word);
  for(const mark of r.puzzle.supports.map(s=>s.mark))assert.equal(r.told('east','hold-brake',true,`刻着${mark}的`),`刻着${mark}的`,mark);
});

