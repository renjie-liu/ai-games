import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runMatch } from '../engine/index.js';
import * as IY from '../engine/index.js';
import { loadBot, makeBot } from '../node/loader.js';
import { prepReplay, viewAt } from '../web/src/replay.js';
import { drivingCommand } from '../web/src/driver.js';

const spec = () => ({ map: 'cage', seed: 7, mode: '2v2', teams: [[loadBot('rookie')], [loadBot('wasp')]], maxTime: 12 });
test('incremental simulation preserves full-match results across uneven batches', () => {
  const expected = runMatch(spec()), m = createMatch(spec());
  for (let i = 0; !m.finished; i++) m.step([1, 7, 53][i % 3]);
  assert.deepEqual(m.result(), expected);
  const done = m.result(); m.step(10); assert.deepEqual(m.result(), done);
  assert.throws(() => m.step(0), /physics ticks/);
});
test('human control overrides the selected AI only; released controls idle and do not fire', () => {
  const bad = makeBot('human-car', 'const design = '+JSON.stringify(runMatch({...spec(), maxTime:0}).vehicles[0].design)+'; function tick(){throw new Error("AI must not run for player");}');
  const options = { map:'proving', teams:[[bad],[loadBot('rookie')]], human:[0], autoAim:true, maxTime:4 };
  const m=createMatch(options), start=m.result().frames[0].v[0];
  m.step(120,{0:{throttle:1,fire:true}});
  const mid=m.result(), moved=mid.frames.at(-1).v[0];
  assert.ok(Math.hypot(moved[0]-start[0],moved[1]-start[1])>1);
  m.step(120); const end=m.result();
  assert.deepEqual(end.vehicles[0].errors,[]); assert.deepEqual(end.human,[0]);
  assert.equal(end.vehicles[0].stats.shots,mid.vehicles[0].stats.shots);
  assert.ok(end.vehicles[1].stats.distance>0);
  assert.throws(()=>createMatch({...options,human:[9]}),/human vehicle/);
});
test('streamed replay includes damage and events once and renders exactly like the finished replay', () => {
  const m=createMatch({...spec(),maxTime:40});
  const initial=m.result(); m.updates();
  // The worker normally clones these arrays when posting the initial result.
  const res=structuredClone(initial); let live=prepReplay(res,IY);
  while(!m.finished){m.step(7);const u=m.updates();res.frames.push(...u.frames);res.events.push(...u.events);live=prepReplay(res,IY,live);}
  const full=m.result();
  assert.ok(full.events.some(e=>e.k==='part'),'exercise destroyed parts');
  assert.deepEqual(res.frames,full.frames);assert.deepEqual(res.events,full.events);
  const replay=prepReplay(full,IY);
  assert.deepEqual(viewAt(live,live.duration),viewAt(replay,replay.duration));
});
test('driving controls can combine turning and firing and cancel opposite directions', () => {
  assert.deepEqual(drivingCommand(new Set(['forward','left','fire'])),{throttle:1,steer:1,brake:0,fire:true,boost:0,useItem:false});
  assert.equal(drivingCommand(new Set(['forward','reverse'])).throttle,0);
  assert.equal(drivingCommand(new Set()).fire,false);
});
test('ending a drive captures the final physics tick and prevents later movement', () => {
  const m = createMatch({...spec(), human:[0]});
  m.step(7,{0:{throttle:1}});
  const res = m.stop();
  assert.equal(res.frames.at(-1).t,0.12); assert.equal(res.reason,'stopped early'); assert.equal(res.winner,null);
  m.step(30,{0:{throttle:1}}); assert.deepEqual(m.result(),res);
});
