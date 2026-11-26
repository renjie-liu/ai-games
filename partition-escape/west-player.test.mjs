// The two things the page-and-voice script's player works out for itself. Offline; no browser, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './world.mjs';
import {chartOf,tagHeard,strongEnough} from './west-player.mjs';

test('the table and the weight are read from the west view, and the sum picks the support that holds',()=>{
  for(const seed of [1,2,20261129]){
    const r=new Room({west:'human',east:'live'},{seed}),p=r.puzzle;r.look('west');
    const chart=chartOf(r.view('west'));
    assert.equal(chart.weight,p.weight);assert.deepEqual(chart.tags,p.tags);
    assert.deepEqual(chart.ratings,Object.fromEntries(p.supports.map(s=>[s.mark,s.ratings])));
    // Strong enough under the tag that hangs, and of those the one that fits: the support that holds.
    const fits=new Set(p.supports.filter(s=>s.fits).map(s=>s.mark));
    assert.deepEqual(strongEnough(chart,p.tag).filter(mark=>fits.has(mark)),[p.supports.find(s=>s.holds).mark],`seed ${seed}`);
    // Under the other tag the sum points at another support: the table alone does not decide.
    const other=p.tags.find(t=>t!==p.tag);
    assert.notDeepEqual(strongEnough(chart,other).filter(mark=>fits.has(mark)),strongEnough(chart,p.tag).filter(mark=>fits.has(mark)));
  }
});
test('a tag is heard only when one colour is named as a colour',()=>{
  const tags=['红','黄'];
  assert.equal(tagHeard('闸轨上挂着一块黄色检修牌。',tags),'黄');
  assert.equal(tagHeard('是红牌。',tags),'红');
  assert.equal(tagHeard('牌子是黄的。',tags),'黄');
  assert.equal(tagHeard('黄铜钥匙已经递给你了。',tags),null,'the brass key is not a tag');
  assert.equal(tagHeard('不是红色，是黄色。',tags),null,'two colours named: ask again');
  assert.equal(tagHeard('',tags),null);
});
