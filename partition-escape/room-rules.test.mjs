import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadRules,mergeRules,makePuzzle,seeded,RETOLD_WORDS,RULES} from './room-rules.mjs';

const DEFAULTS=JSON.parse(fs.readFileSync(new URL('./room-rules.json',import.meta.url),'utf8'));
const override=changes=>{const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'rules-')),'rules.json');fs.writeFileSync(file,JSON.stringify(changes));return file;};
const rules=RULES;
// Every name of the choice of supports, to take it out of the room whole.
const NO_CHOICE={supports:null,marks:null,tags:null,gate_weights_kg:null,margins_kg:null,slot_cm:null,fit_lengths_cm:null,long_lengths_cm:null};

test('the defaults are the file and nothing else; an override changes only what it names',()=>{
  assert.deepEqual(loadRules(''),DEFAULTS);assert.deepEqual(RULES,DEFAULTS);
  assert.deepEqual(loadRules(override({battery_cells:3})),{...DEFAULTS,battery_cells:3});
});
test('there is one room: the file holds its numbers, with no sets to choose from and no names for them',()=>{
  for(const name of ['rooms','rule_sets','title'])assert.equal(name in DEFAULTS,false,name);
  for(const changes of [{rule_sets:{easy:{}}},{rooms:{live:'easy'}},{title:'入门'}])
    assert.throws(()=>loadRules(override(changes)),/room_rules_invalid: unknown name/,JSON.stringify(changes));
});
test('a typo or a puzzle that cannot be built is refused, each with its reason',()=>{
  const bad=[
    [{battery_cell:2},/unknown name battery_cell/],
    [{battery_cells:0},/battery_cells/],[{battery_cells:1.5},/battery_cells/],[{battery_cells:1e20},/battery_cells/],[{battery_cells:500},/battery_cells/],
    // a choice of supports needs every part of it
    [{marks:null},/needs all of/],
    [{supports:{weak:2}},/supports counts/],[{supports:{weak:-1,too_long:1}},/supports counts/],[{supports:{weak:2,too_long:1,strong:1}},/supports counts/],
    [{marks:['三角','圆圈']},/fewer marks/],[{marks:['三角','三角','方块','菱形']},/different words/],
    // a mark is said aloud and put into messages: no stray spaces, nothing the retelling rewrites, not long
    [{marks:['三角',' 三角','方块','菱形']},/different words/],[{marks:['他','圆圈','方块','菱形']},/different words/],
    [{marks:['三角形状的大记号啊','圆圈','方块','菱形']},/different words/],[{tags:['红','阿澄']},/different words/],
    // every other tag needs a support that would look right under it
    [{tags:['红','黄','蓝','绿']},/more tags/],
    [{gate_weights_kg:[200,200]},/weights and margins/],[{gate_weights_kg:[]},/weights and margins/],[{margins_kg:[40,'60',80]},/weights and margins/],
    [{gate_weights_kg:[1e20]},/weights and margins/],
    [{margins_kg:[200,60,80]},/as large as a gate weight/],[{margins_kg:[40]},/too few margins/],
    // a length that is said to fit but does not, and one said to be too long that fits
    [{slot_cm:[120,100]},/slot_cm/],[{fit_lengths_cm:[90]},/said to fit/],[{long_lengths_cm:[110]},/said to be too long/],
    [{stars:{three:{power_on:1}}},/star tier/],[{stars:{three:{power_ons:-1}}},/star tier/],[{stars:{four:{power_ons:1}}},/stars has/],
    // stars count cells, so they need a battery
    [{battery_cells:null},/need battery_cells/],[[],/an object/],['rules',/an object/]];
  for(const [changes,reason] of bad){
    assert.throws(()=>loadRules(override(changes)),e=>/room_rules_invalid/.test(e.message)&&reason.test(e.message),JSON.stringify(changes));
  }
  assert.throws(()=>loadRules('/nonexistent/rules.json'),/room_rules_invalid/);
  assert.throws(()=>mergeRules(DEFAULTS,null),/room_rules_invalid/);
});
test('no default mark or tag is a word the retelling rewrites',()=>{
  assert.ok(RETOLD_WORDS.length>0);
  for(const word of [...rules.marks,...rules.tags])assert.ok(!RETOLD_WORDS.some(w=>word.includes(w)),word);
});
test('with the battery and the choice both taken out there is no puzzle to generate',()=>{
  assert.equal(makePuzzle(loadRules(override({...NO_CHOICE,battery_cells:null,stars:null})),seeded(1)),null);
});
test('a seed gives the same puzzle again, and another seed another',()=>{
  assert.deepEqual(makePuzzle(rules,seeded(7)),makePuzzle(rules,seeded(7)));
  const seen=new Set(Array.from({length:40},(_,i)=>JSON.stringify(makePuzzle(rules,seeded(i)))));
  assert.ok(seen.size>30,`only ${seen.size} different puzzles in 40 seeds`);
});
test('every generated puzzle needs both rooms: one support is right, and neither room can tell which alone',()=>{
  for(let seed=0;seed<500;seed++){
    const p=makePuzzle(rules,seeded(seed)),at=`seed ${seed}`;
    assert.equal(p.cells,2);assert.equal(p.supports.length,4,at);
    assert.ok(rules.gate_weights_kg.includes(p.weight)&&rules.tags.includes(p.tag),at);
    assert.equal(new Set(p.supports.map(s=>s.mark)).size,4,at);
    const fits=p.supports.filter(s=>s.fits),long=p.supports.filter(s=>!s.fits);
    assert.equal(fits.length,3,at);assert.equal(long.length,1,at);
    for(const s of p.supports){
      assert.equal(s.fits,s.length>=p.slot[0]&&s.length<=p.slot[1],at);
      // What holds is what the table says under the tag that hangs in the east room, if it fits at all.
      assert.equal(s.holds,s.fits&&s.ratings[p.tag]>=p.weight,at);
      assert.deepEqual(Object.keys(s.ratings),rules.tags,at);
      // No rating is close enough to the weight to turn on a misheard digit.
      for(const tag of p.tags)assert.ok(Math.abs(s.ratings[tag]-p.weight)>=40,at);
    }
    assert.equal(p.supports.filter(s=>s.holds).length,1,at);
    // West, who has the table but not the tag: under every tag exactly one support that fits looks
    // right, and it is a different one each time, so the table alone does not give the answer away.
    const looksRight=p.tags.map(tag=>fits.filter(s=>s.ratings[tag]>=p.weight).map(s=>s.mark));
    for(const marks of looksRight)assert.equal(marks.length,1,at);
    assert.equal(new Set(looksRight.flat()).size,p.tags.length,at);
    // The one that is strong enough whatever the tag is the one that does not fit, which only east can see.
    for(const s of long)assert.ok(p.tags.every(tag=>s.ratings[tag]>=p.weight),at);
    // Within a column no two supports carry the same number.
    for(const tag of p.tags)assert.equal(new Set(p.supports.map(s=>s.ratings[tag])).size,4,at);
  }
});
test('where the right support sits and which tag hangs both vary',()=>{
  const where=new Set(),tags=new Set();
  for(let seed=0;seed<200;seed++){const p=makePuzzle(rules,seeded(seed));where.add(p.supports.findIndex(s=>s.holds));tags.add(p.tag);}
  assert.deepEqual([...where].sort(),[0,1,2,3]);assert.deepEqual([...tags].sort(),[...rules.tags].sort());
  // Which mark the right support carries varies too: no mark gives the answer away.
  const marked=new Set(Array.from({length:300},(_,seed)=>makePuzzle(rules,seeded(seed)).supports.find(s=>s.holds).mark));
  assert.deepEqual([...marked].sort(),[...rules.marks].sort());
});
test('an override may leave the room a battery without a choice of supports, or the other way round',()=>{
  const cells=makePuzzle(loadRules(override({...NO_CHOICE,battery_cells:3})),seeded(1));
  assert.equal(cells.cells,3);assert.equal(cells.supports,null);
  const pick=makePuzzle(loadRules(override({battery_cells:null,stars:null})),seeded(1));
  assert.equal(pick.cells,null);assert.equal(pick.supports.length,4);assert.equal(pick.stars,null);
});
