import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadRules,mergeRules,makePuzzle,seeded,rulesFor,RETOLD_WORDS,RULES} from './room-rules.mjs';

const DEFAULTS=JSON.parse(fs.readFileSync(new URL('./room-rules.json',import.meta.url),'utf8'));
const override=changes=>{const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'rules-')),'rules.json');fs.writeFileSync(file,JSON.stringify(changes));return file;};
const standard=RULES.rule_sets.standard;

test('the defaults are the file and nothing else; an override changes only what it names',()=>{
  assert.deepEqual(loadRules(''),DEFAULTS);
  const loaded=loadRules(override({rooms:{live:'classic'},rule_sets:{standard:{battery_cells:3}}}));
  assert.equal(loaded.rooms.live,'classic');assert.equal(loaded.rooms.other,'classic');
  assert.deepEqual(loaded.rule_sets.standard,{...DEFAULTS.rule_sets.standard,battery_cells:3});
  assert.deepEqual(loaded.rule_sets.classic,DEFAULTS.rule_sets.classic);
});
test('a typo, a room kind that names no rule set, or a puzzle that cannot be built is refused, each with its reason',()=>{
  const standard=changes=>({rule_sets:{standard:changes}});
  const bad=[
    [{room:{}},/rooms and rule_sets/],[{rooms:{live:'hard'}},/names a rule set/],[{rooms:{voice:'classic'}},/names a rule set/],
    // scripted and model seats get `other`, and they cannot take a choice of supports
    [{rooms:{other:'standard'}},/scripted/],
    [standard({battery_cell:2}),/unknown name battery_cell/],[standard({title:''}),/title/],
    [standard({battery_cells:0}),/battery_cells/],[standard({battery_cells:1.5}),/battery_cells/],[standard({battery_cells:1e20}),/battery_cells/],[standard({battery_cells:500}),/battery_cells/],
    // a choice of supports needs every part of it
    [{rule_sets:{half:{title:'半套',marks:['三角']}}},/needs all of/],
    [standard({supports:{weak:2}}),/supports counts/],[standard({supports:{weak:-1,too_long:1}}),/supports counts/],[standard({supports:{weak:2,too_long:1,strong:1}}),/supports counts/],
    [standard({marks:['三角','圆圈']}),/fewer marks/],[standard({marks:['三角','三角','方块','菱形']}),/different words/],
    // a mark is said aloud and put into messages: no stray spaces, nothing the retelling rewrites, not long
    [standard({marks:['三角',' 三角','方块','菱形']}),/different words/],[standard({marks:['他','圆圈','方块','菱形']}),/different words/],
    [standard({marks:['三角形状的大记号啊','圆圈','方块','菱形']}),/different words/],[standard({tags:['红','阿澄']}),/different words/],
    // every other tag needs a support that would look right under it
    [standard({tags:['红','黄','蓝','绿']}),/more tags/],
    [standard({gate_weights_kg:[200,200]}),/weights and margins/],[standard({gate_weights_kg:[]}),/weights and margins/],[standard({margins_kg:[40,'60',80]}),/weights and margins/],
    [standard({gate_weights_kg:[1e20]}),/weights and margins/],
    [standard({margins_kg:[200,60,80]}),/as large as a gate weight/],[standard({margins_kg:[40]}),/too few margins/],
    // a length that is said to fit but does not, and one said to be too long that fits
    [standard({slot_cm:[120,100]}),/slot_cm/],[standard({fit_lengths_cm:[90]}),/said to fit/],[standard({long_lengths_cm:[110]}),/said to be too long/],
    [standard({stars:{three:{power_on:1}}}),/star tier/],[standard({stars:{three:{power_ons:-1}}}),/star tier/],[standard({stars:{four:{power_ons:1}}}),/stars has/],
    // stars count cells, so they need a battery
    [{rule_sets:{bare:{title:'x',stars:{two:{spare_packs:0}}}}},/need battery_cells/],[[],/rooms and rule_sets/]];
  for(const [changes,reason] of bad){
    assert.throws(()=>loadRules(override(changes)),e=>/room_rules_invalid/.test(e.message)&&reason.test(e.message),JSON.stringify(changes));
  }
  assert.throws(()=>loadRules('/nonexistent/rules.json'),/room_rules_invalid/);
  assert.throws(()=>mergeRules(DEFAULTS,{rule_sets:{standard:null}}),/room_rules_invalid/);
});
test('the kind of room decides the rule set when none is named',()=>{
  assert.equal(rulesFor({west:'human',east:'live'}),'standard');assert.equal(rulesFor({west:'live',east:'human'}),'standard');
  for(const controllers of [{west:'human',east:'human'},{west:'human',east:'script'},{west:'script',east:'script'},undefined])assert.equal(rulesFor(controllers),'classic');
  const swapped=loadRules(override({rooms:{live:'classic'}}));
  assert.equal(rulesFor({west:'human',east:'live'},swapped),'classic');
});
test('no default mark or tag is a word the retelling rewrites',()=>{
  assert.ok(RETOLD_WORDS.length>0);
  for(const word of [...standard.marks,...standard.tags])assert.ok(!RETOLD_WORDS.some(w=>word.includes(w)),word);
});
test('the first rule set has no puzzle to generate',()=>{
  assert.equal(makePuzzle(RULES.rule_sets.classic,seeded(1)),null);
});
test('a seed gives the same puzzle again, and another seed another',()=>{
  assert.deepEqual(makePuzzle(standard,seeded(7)),makePuzzle(standard,seeded(7)));
  const seen=new Set(Array.from({length:40},(_,i)=>JSON.stringify(makePuzzle(standard,seeded(i)))));
  assert.ok(seen.size>30,`only ${seen.size} different puzzles in 40 seeds`);
});
test('every generated puzzle needs both rooms: one support is right, and neither room can tell which alone',()=>{
  for(let seed=0;seed<500;seed++){
    const p=makePuzzle(standard,seeded(seed)),at=`seed ${seed}`;
    assert.equal(p.cells,2);assert.equal(p.supports.length,4,at);
    assert.ok(standard.gate_weights_kg.includes(p.weight)&&standard.tags.includes(p.tag),at);
    assert.equal(new Set(p.supports.map(s=>s.mark)).size,4,at);
    const fits=p.supports.filter(s=>s.fits),long=p.supports.filter(s=>!s.fits);
    assert.equal(fits.length,3,at);assert.equal(long.length,1,at);
    for(const s of p.supports){
      assert.equal(s.fits,s.length>=p.slot[0]&&s.length<=p.slot[1],at);
      // What holds is what the table says under the tag that hangs in the east room, if it fits at all.
      assert.equal(s.holds,s.fits&&s.ratings[p.tag]>=p.weight,at);
      assert.deepEqual(Object.keys(s.ratings),standard.tags,at);
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
  for(let seed=0;seed<200;seed++){const p=makePuzzle(standard,seeded(seed));where.add(p.supports.findIndex(s=>s.holds));tags.add(p.tag);}
  assert.deepEqual([...where].sort(),[0,1,2,3]);assert.deepEqual([...tags].sort(),[...standard.tags].sort());
  // Which mark the right support carries varies too: no mark gives the answer away.
  const marked=new Set(Array.from({length:300},(_,seed)=>makePuzzle(standard,seeded(seed)).supports.find(s=>s.holds).mark));
  assert.deepEqual([...marked].sort(),[...standard.marks].sort());
});
test('a rule set may have a battery without a choice of supports, and the other way round',()=>{
  const rules=loadRules(override({rule_sets:{cells:{title:'只限电',battery_cells:3},pick:{...DEFAULTS.rule_sets.standard,title:'只挑撑',battery_cells:undefined,stars:undefined}}}));
  const cells=makePuzzle(rules.rule_sets.cells,seeded(1));
  assert.equal(cells.cells,3);assert.equal(cells.supports,null);
  const pick=makePuzzle(rules.rule_sets.pick,seeded(1));
  assert.equal(pick.cells,null);assert.equal(pick.supports.length,4);assert.equal(pick.stars,null);
});
