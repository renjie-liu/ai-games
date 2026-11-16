// Match telemetry and the insights made from it: what each weapon did, who hurt whom with what,
// from which side and how far away, what was lost and when — and the sentences an agent reads first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, World, validateDesign, runMatch, summarize, compactTelemetry, insightList, insightsFor, matchDigest, diagnose, telemetryView, BANDS, tileCodeAt, TILE_NAME } from '../engine/index.js';
import { loadBot } from '../node/loader.js';

const legal = (parts) => { const v = validateDesign({ parts }); assert.equal(v.ok, true, v.errors.join('; ')); return v.design; };
// a plain four-wheeled car: 3x4 plate floor, core in the middle of the deck; `extra` pieces go on top of that
const car = (extra = []) => legal([
  ...[-1, 0, 1].flatMap((x) => [-1, 0, 1, 2].map((y) => ({ type: 'plate', x, y, z: 0 }))),
  { type: 'wheel', x: -2, y: 2, z: 0 }, { type: 'wheel', x: 2, y: 2, z: 0 }, { type: 'wheel', x: -2, y: -1, z: 0 }, { type: 'wheel', x: 2, y: -1, z: 0 },
  { type: 'core', x: 0, y: 0, z: 1 }, { type: 'reactor', x: 0, y: -1, z: 1 }, { type: 'battery', x: -1, y: -1, z: 1 }, ...extra]);
const mgCar = () => car([-1, 0, 1].map((x) => ({ type: 'mg', x, y: 1, z: 1, dir: 'N' })));
const gunCar = () => car([{ type: 'mg', x: -1, y: 1, z: 1, dir: 'N' }, { type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'cannon', x: 1, y: 0, z: 1, dir: 'N' }]);
/** Two vehicles on a map: the first at `at` looking along `heading`, the second `gap` metres dead ahead of it, facing it. */
function duel(a, b, { gap = 4, map = MAPS.proving, at = null, heading = 0 } = {}) {
  const w = new World({ map, seed: 1, entries: [{ team: 0, slot: 0, design: a }, { team: 1, slot: 0, design: b }] });
  const [p, q] = w.vehicles;
  const o = at || { x: 20, y: 9 };
  p.x = o.x; p.y = o.y; p.th = heading; q.x = o.x + gap * Math.cos(heading); q.y = o.y + gap * Math.sin(heading); q.th = heading + Math.PI;
  w.updateCells(p); w.updateCells(q);
  return { w, p, q, run: (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) w.step(); } };
}
const sum = (xs) => (Array.isArray(xs) ? xs : Object.values(xs)).reduce((a, b) => a + b, 0);
const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const kinds = (res, id) => insightList(res, id).map((x) => x.kind);
/** A World as the match result the insights read. */
const report = (w) => ({ winner: w.finished ? w.winner : null, reason: w.endReason, duration: w.t,
  vehicles: w.vehicles.map((v) => ({ id: v.id, team: v.team, name: v.name, alive: v.alive, deathT: v.deathT, deathCause: v.deathCause, killedBy: v.killedBy,
    hpFrac: Math.max(0, v.hpNow / v.hpMax), stats: v.stats, telemetry: w.telemetry(v) })) });

test('per-weapon shots, hits and damage add up to the vehicle totals, on both sides of the damage', () => {
  const { w, p, q, run } = duel(gunCar(), car(), { gap: 5.5 });
  w.setCommand(p, { fire: true }); w.setCommand(q, { brake: 1 });
  run(2);   // (much longer and the hits have turned it side-on)
  const t = w.telemetry(p), u = w.telemetry(q);
  assert.deepEqual(t.weapons.map((g) => g.type), ['mg', 'mg', 'cannon']);
  assert.ok(t.weapons.every((g) => g.shots > 0 && g.hits > 0 && g.damage > 0 && g.lostAt === null && g.dir === 'N'));
  close(sum(t.weapons.map((g) => g.shots)), p.stats.shots);
  close(sum(t.weapons.map((g) => g.hits)), p.stats.hits);
  for (const type of ['mg', 'cannon']) close(sum(t.weapons.filter((g) => g.type === type).map((g) => g.damage)), t.dealt.byWeapon[type], 1e-6, type);
  close(sum(t.dealt.byWeapon), p.stats.damageDealt);
  close(sum(t.dealt.byTarget), p.stats.damageDealt);
  close(t.dealt.byTarget[q.id], p.stats.damageDealt);
  close(sum(t.dealt.byRange), p.stats.damageDealt);
  // the other end of the same shots
  close(sum(u.taken.byWeapon), q.stats.damageTaken);
  close(sum(u.taken.byAttacker), q.stats.damageTaken);
  close(sum(u.taken.byType), q.stats.damageTaken);
  close(sum(u.taken.byPartType), q.stats.damageTaken);
  close(u.taken.byWeapon.mg, t.dealt.byWeapon.mg);
  assert.ok(u.taken.byType.explosive > 0, 'the splash of a cannon shell is explosive, and still the cannon\'s');
  assert.equal(u.taken.top[0].by, p.id);
  assert.deepEqual(u.taken.lastHit.by, p.id);
  // a gun that fires all the time has fired for as long as the match has run
  assert.ok(t.weapons.every((g) => g.firingTime > 1.8 && g.firingTime <= 2 + 1e-9), JSON.stringify(t.weapons.map((g) => g.firingTime)));
  // the form an agent reads: whole hp, one decimal, nothing that is zero
  const c = compactTelemetry(t), cu = compactTelemetry(u);
  assert.ok(c.weapons.every((g) => Number.isInteger(g.damage) && g.shots === Math.round(g.shots * 10) / 10));
  assert.deepEqual(Object.keys(cu.taken.bySide), ['front']);
  assert.deepEqual(Object.keys(c.dealt.byRange), ['4-8']);
  assert.deepEqual(c.taken.byAttacker, {});
  assert.deepEqual(compactTelemetry(c), c, 'rounding what is rounded changes nothing');
});

test('a hit is counted on the side it came from: front, rear, left or right of the vehicle that takes it', () => {
  const shoot = (turn) => {
    const { w, p, q, run } = duel(gunCar(), car(), { gap: 5.5 });
    q.th = turn; w.updateCells(q);
    w.setCommand(p, { fire: true }); w.setCommand(q, { brake: 1 });
    run(2);
    const wheel = (x) => q.parts.find((k) => k.type === 'wheel' && k.x === x && k.y === 2);
    return { side: w.telemetry(q).taken.bySide, nearer: Math.hypot(wheel(2).wx - p.x, wheel(2).wy - p.y) < Math.hypot(wheel(-2).wx - p.x, wheel(-2).wy - p.y) ? 'right' : 'left' };
  };
  const only = (s, side) => { assert.ok(s[side] > 30, `${side}: ${JSON.stringify(s)}`); close(s[side], sum(s), 1e-9, side); };
  only(shoot(Math.PI).side, 'front');          // facing the guns
  only(shoot(0).side, 'rear');                 // driving away from them
  const a = shoot(-Math.PI / 2), b = shoot(Math.PI / 2);
  assert.notEqual(a.nearer, b.nearer);
  only(a.side, a.nearer);                      // the side whose wheels are nearer the guns
  only(b.side, b.nearer);
  assert.equal(a.nearer, 'right', 'x+ of the stud grid is the right side');
  // a beam has no shot to take the direction from: it comes from where the attacker is (here: looking north at it)
  const beam = (turn) => {
    const { w, p, q, run } = duel(car([{ type: 'laser', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 5.5, heading: Math.PI / 2 });
    q.th += turn; w.updateCells(q);
    w.setCommand(p, { fire: true, aim: { x: q.x, y: q.y } }); w.setCommand(q, { brake: 1 });
    run(2);
    assert.ok(w.telemetry(p).weapons[0].damage > 30 && w.telemetry(q).taken.byWeapon.laser > 30);
    return w.telemetry(q).taken.bySide;
  };
  only(beam(0), 'front');
  only(beam(Math.PI), 'rear');
});

test('range: damage and time are counted in the band the two vehicles were in', () => {
  for (const [gap, band] of [[5.5, '4-8'], [9.5, '8-13']]) {
    const { w, p, q, run } = duel(mgCar(), car(), { gap });
    w.setCommand(p, { fire: true }); w.setCommand(q, { brake: 1 });
    run(3);
    const t = w.telemetry(p), u = w.telemetry(q);
    assert.ok(t.dealt.byRange[band] > 20, `${band}: ${JSON.stringify(t.dealt.byRange)}`);
    close(t.dealt.byRange[band], p.stats.damageDealt);
    close(u.taken.byRange[band], q.stats.damageTaken);
    close(u.range.timeIn[band], 3, 1e-6, 'every tenth of a second of the three');
    close(sum(t.range.timeIn), 3);
    assert.ok(Math.abs(u.range.atFirstHitTaken - gap) < 0.5 && Math.abs(t.range.mean - gap) < 0.7, `${u.range.atFirstHitTaken} ${t.range.mean}`);
    assert.equal(t.range.atFirstHitTaken, null, 'nobody hit the one that did the shooting');
  }
  assert.deepEqual(BANDS, ['0-4', '4-8', '8-13', '13-20', '20+']);
});

test('losses: every piece lost, in the order it went, with what took it and whose doing it was', () => {
  const { w, p, q, run } = duel(mgCar(), car([{ type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }]), { gap: 5 });
  w.setCommand(p, { fire: true }); w.setCommand(q, { brake: 1 });
  const gun = q.parts.find((k) => k.type === 'mg');
  while (q.alive && gun.alive && w.t < 40) run(0.5);
  assert.equal(gun.alive, false, 'its gun is shot off sooner or later');
  const t = w.telemetry(q);
  assert.ok(t.losses.length >= 3 && t.losses.length === q.stats.partsLost);
  assert.deepEqual(t.losses.map((l) => l.i), w.events.filter((e) => e.k === 'part' && e.v === q.id).map((e) => e.i), 'the order of the events');
  assert.ok(t.losses.every((l, i) => i === 0 || l.t >= t.losses[i - 1].t));
  assert.ok(t.losses.every((l) => l.by === p.id && (l.cause === 'mg' || l.cause === 'detached' || l.cause === 'reactor')), JSON.stringify(t.losses));
  assert.equal(t.losses[0].cause, 'mg');
  assert.equal(sum(t.lossesByCause), t.losses.length);
  const lost = t.losses.find((l) => l.i === gun.i), rec = t.weapons[0];
  assert.deepEqual([rec.i, rec.lostAt, rec.lostTo, rec.lostBy], [gun.i, lost.t, lost.cause, p.id]);
  assert.equal(w.telemetry(p).losses.length, 0);
  // an agent is shown the first twelve, to one decimal
  const c = compactTelemetry(t);
  assert.ok(c.losses.length <= 12 && c.losses.every((l) => l.t === Math.round(l.t * 10) / 10 && typeof l.type === 'string'));
  assert.deepEqual(compactTelemetry(t, { brief: true }).losses, undefined);
});

test('the timeline has one row every two seconds for as long as the vehicle lives', () => {
  const { w, p, q, run } = duel(mgCar(), car(), { gap: 6 });
  w.setCommand(p, { fire: true }); w.setCommand(q, { brake: 1 });
  run(7);
  const t = w.telemetry(p).timeline, u = w.telemetry(q).timeline;
  assert.equal(t.step, 2);
  for (const row of [t.hull, t.energy, t.dist, t.weapons, u.hull]) assert.equal(row.length, 4, 't = 0, 2, 4, 6');
  assert.deepEqual(t.weapons, [3, 3, 3, 3]);
  assert.equal(u.hull[0], 100);
  assert.ok(u.hull[3] < u.hull[1] && u.hull.every((x) => Number.isInteger(x) && x >= 0 && x <= 100), JSON.stringify(u.hull));
  assert.ok(t.energy.every((x) => Number.isInteger(x) && x >= 0 && x <= 100));
  assert.ok(Math.abs(t.dist[1] - 6) < 1 && t.dist[1] === u.dist[1], JSON.stringify(t.dist));
  // a real match: as many rows as its life has even seconds
  const res = runMatch({ map: 'proving', seed: 1, teams: [[loadBot('quillback')], [loadBot('grindstone')]], record: false });
  for (const v of res.vehicles) assert.equal(v.telemetry.timeline.hull.length, Math.floor((v.alive ? res.duration : v.deathT) / 2 + 1e-9) + 1, v.name);
});

test('a keg that hurts its own side is in what they took, and in nobody\'s damage dealt', () => {
  const w = new World({ map: MAPS.proving, seed: 1, entries: [
    { team: 0, slot: 0, design: car([{ type: 'keg', x: 0, y: 2, z: 1, dir: 'N' }]) }, { team: 0, slot: 1, design: car() }, { team: 1, slot: 0, design: car() }] });
  const [a, mate, foe] = w.vehicles;
  a.x = 20; a.y = 9; a.th = 0; mate.x = 23.2; mate.y = 9; mate.th = Math.PI; foe.x = 20.6; foe.y = 11.8; foe.th = -Math.PI / 2;
  for (const v of w.vehicles) w.updateCells(v);
  w.setCommand(a, { detonate: true });
  w.step();
  const ta = w.telemetry(a), tm = w.telemetry(mate), tf = w.telemetry(foe);
  assert.ok(tm.taken.byWeapon.keg > 20 && tm.taken.byAttacker[a.id] > 20, JSON.stringify(tm.taken));
  close(sum(tm.taken.byWeapon), mate.stats.damageTaken);
  assert.equal(ta.dealt.byTarget[mate.id], undefined, 'not to its credit');
  assert.ok(ta.dealt.byTarget[foe.id] > 20 && ta.dealt.byWeapon.keg > 20);
  close(sum(ta.dealt.byTarget), a.stats.damageDealt);
  close(ta.dealt.byTarget[foe.id], foe.stats.damageTaken);
  assert.ok(ta.taken.byAttacker[a.id] > 0, 'and what it did to itself is its own');
  // the blast is where the hit came from, not the vehicle that owned the keg
  assert.ok(tm.taken.bySide.front > 0 && tm.taken.bySide.rear === 0, JSON.stringify(tm.taken.bySide));
  assert.ok(tf.taken.bySide.front > 0 && tf.taken.bySide.rear === 0, JSON.stringify(tf.taken.bySide));
  assert.deepEqual(ta.taken.bySide, { front: 0, left: 0, right: 0, rear: 0 }, 'its own blast has no side');
  assert.deepEqual(ta.losses[0], { t: w.t, type: 'keg', i: a.parts.find((k) => k.type === 'keg').i, cause: 'detonated', by: a.id });
});

test('fire discipline: how long an enemy was in reach, and what the guns were doing meanwhile', () => {
  const fire = (set, cmd = { fire: true }, opts = { gap: 6 }) => {
    const { w, p, q, run } = duel(car([{ type: 'laser', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'mg', x: 1, y: 1, z: 1, dir: 'N' }]), car(), opts);
    if (set) set(p);
    w.setCommand(p, cmd); w.setCommand(q, { brake: 1 });
    run(4);
    return { f: w.telemetry(p).fire, res: report(w), p };
  };
  const busy = fire(null);
  close(busy.f.timeTargetInReach, 4); close(busy.f.timeFiring, 4);
  assert.ok(!kinds(busy.res, 0).includes('silent_guns'));
  // no energy: the guns are lined up, the trigger is down, nothing comes out
  const dry = fire((p) => { p.energy = 0; p.energyRegen = 0; });
  close(dry.f.timeTargetInReach, 4); assert.equal(dry.f.timeFiring, 0); close(dry.f.timeEnergyStarved, 4);
  assert.equal(dry.p.stats.shots, 0);
  // the trigger is not down
  const held = fire(null, {});
  close(held.f.timeHoldingFire, 4); assert.equal(held.f.timeFiring, 0);
  // aiming where the turrets cannot turn to
  const wide = fire(null, { fire: true, aim: Math.PI });
  close(wide.f.timeOutOfArc, 4); close(wide.f.timeOutOfArc, wide.p.stats.timeFireOutOfArc);
  // a pillar between the two (proving has one at 14..18 m both ways)
  const hidden = fire(null, {}, { gap: 10, at: { x: 11, y: 16 } });
  close(hidden.f.timeNoLineOfSight, 4); close(hidden.f.timeTargetInReach, 4);
  // out of reach: nothing to explain
  const far = fire(null, {}, { gap: 20 });
  assert.equal(far.f.timeTargetInReach, 0);
  // a mortar cannot shoot at what is under its nose: that is not "in reach" either, and it is counted apart
  const mortar = duel(car([{ type: 'mortar', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 3.5 });
  mortar.run(3);
  const mf = mortar.w.telemetry(mortar.p).fire;
  close(mf.timeTargetTooClose, 3); assert.equal(mf.timeTargetInReach, 0);
  const lobbed = duel(car([{ type: 'mortar', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 10, at: { x: 11, y: 16 } });   // over the pillar
  lobbed.w.setCommand(lobbed.p, { fire: true, aim: { x: lobbed.q.x, y: lobbed.q.y } }); lobbed.w.setCommand(lobbed.q, { brake: 1 });
  lobbed.run(6);
  const lt = lobbed.w.telemetry(lobbed.p);
  assert.equal(lt.fire.timeNoLineOfSight, 0); close(lt.fire.timeTargetInReach, 6);
  assert.deepEqual([lt.weapons[0].shots, lt.weapons[0].hits], [2, 2], 'a shell whose blast hurt somebody is a hit');
  assert.equal(lobbed.p.stats.hits, 2, 'and the vehicle\'s own count agrees with its weapons\' (it used to leave mortars out)');
  close(lt.weapons[0].damage, lobbed.p.stats.damageDealt); assert.ok(lt.weapons[0].damage > 40);
});

test('insights: the findings a situation should give, by kind and in words', () => {
  // shot from behind until it dies, never having fired a shot
  const chase = duel(mgCar(), car(), { gap: 5 });
  chase.q.th = 0; chase.w.updateCells(chase.q);
  chase.w.setCommand(chase.p, { fire: true }); chase.w.setCommand(chase.q, { brake: 1 });
  while (!chase.w.finished && chase.w.t < 60) chase.run(0.5);
  assert.equal(chase.q.alive, false);
  const res = report(chase.w), list = insightList(res, 1);
  assert.equal(list[0].kind, 'outcome');
  for (const k of ['flanked', 'damage_source', 'wrong_range']) assert.ok(list.some((x) => x.kind === k), `${k}: ${JSON.stringify(list)}`);
  assert.match(list[0].text, /^destroyed at \d+\.\d s: written off as a wreck \(nothing left that moves it, nothing left that can hurt\) after hits from bot0#0; dealt 0 damage, took \d+$/);
  assert.match(list.find((x) => x.kind === 'flanked').text, /^\d+% of the damage that came from a direction \(\d+ of \d+\) came from the rear$/);
  assert.match(list.find((x) => x.kind === 'damage_source').text, /came from bot0#0's mg$/);
  assert.ok(list.length <= 6 && list.every((x) => typeof x.text === 'string' && x.text.length < 260));
  assert.deepEqual(insightsFor(res, 1), list.map((x) => x.text));
  assert.match(insightsFor(res, 0)[0], /^survived with 100% hull; its team won \(elimination\); dealt \d+ damage, took 0$/);
  assert.deepEqual(insightsFor(res, 7), [], 'no such vehicle');

  // guns that cannot be paid for
  const dry = duel(car([{ type: 'laser', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'laser', x: 1, y: 1, z: 1, dir: 'N' }]), car(), { gap: 6 });
  dry.p.energy = 0; dry.p.energyRegen = 0;
  dry.w.setCommand(dry.p, { fire: true });
  dry.run(8);
  const silent = insightList(report(dry.w), 0).find((x) => x.kind === 'silent_guns');
  assert.match(silent.text, /^an enemy was inside gun range for 8\.0 s but the guns fired for only 0\.0 s \(0%\): 8\.0 s energy-starved$/);
  // three guns on the energy of one: something is always firing, and something always cannot
  const thin = duel(mgCar(), car(), { gap: 6 });
  thin.p.energy = 0; thin.p.energyRegen = 5;
  thin.w.setCommand(thin.p, { fire: true }); thin.w.setCommand(thin.q, { brake: 1 });
  thin.run(8);
  const short = insightList(report(thin.w), 0);
  assert.ok(!short.some((x) => x.kind === 'silent_guns'), JSON.stringify(short));
  assert.match(short.find((x) => x.kind === 'energy_starved').text, /^a gun that was lined up lacked the energy to fire for \d\.\d s of the 8\.0 s an enemy was in range/);

  // straight into the hole in the middle of the sumo deck, with nobody near
  const hole = duel(car(), car(), { map: MAPS.sumo, at: { x: 15, y: 20 }, gap: 15 });
  hole.w.setCommand(hole.p, { throttle: 1 });
  while (hole.p.alive && hole.w.t < 10) hole.run(0.5);
  assert.equal(hole.p.deathCause, 'fell');
  const fell = insightList(report(hole.w), 0);
  assert.deepEqual(fell.slice(0, 2).map((x) => x.kind), ['outcome', 'terrain']);
  assert.match(fell[1].text, /^drove into a pit at \d+\.\d s with no enemy contact/);

  // nose against the wall with the throttle open
  const wall = duel(car(), car(), { at: { x: 3.6, y: 9 }, heading: Math.PI, gap: -30 });
  wall.w.setCommand(wall.p, { throttle: 1 });
  wall.run(8);
  assert.ok(wall.w.telemetry(wall.p).move.timeStuck >= 6, String(wall.w.telemetry(wall.p).move.timeStuck));
  assert.ok(kinds(report(wall.w), 0).includes('stuck'));
  assert.ok(!kinds(report(wall.w), 1).includes('stuck'), 'standing still without trying to move is not being stuck');

  // bullets on the face of a slope: four fifths of each is turned away, and the shooter's report says so
  const glacis = car([{ type: 'slope', x: -1, y: 3, z: 0, dir: 'N' }, { type: 'slope', x: 0, y: 3, z: 0, dir: 'N' }, { type: 'slope', x: 1, y: 3, z: 0, dir: 'N' }]);
  const gunner = car([{ type: 'mg', x: -1, y: 1, z: 1, dir: 'N' }, { type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }, { type: 'mg', x: 1, y: 1, z: 1, dir: 'N' }]);
  const face = duel(gunner, glacis, { gap: 6 });
  const mid = face.q.parts.filter((x) => x.type === 'slope')[1];
  face.w.setCommand(face.p, { fire: true, aim: { x: mid.wx, y: mid.wy } });
  face.run(5);
  const shooter = face.p.stats;
  assert.ok(shooter.turnedAway > 150 && shooter.turnedAway > shooter.damageDealt, `${shooter.turnedAway} turned, ${shooter.damageDealt} dealt`);
  assert.ok(shooter.turnedAway > face.q.stats.deflected && face.q.stats.deflected > 0.5 * shooter.turnedAway, 'what the slopes turned, and the point of armor each takes on top');
  const told = insightList(report(face.w), 0).find((x) => x.kind === 'turned');
  assert.match(told.text, /^slopes and armor took \d+% of what its hits carried \(\d+ of \d+ damage turned away\)/);
  assert.ok(!kinds(report(face.w), 1).includes('turned'), 'the car being shot at has nothing to say about that');

  // standing still by its own command, with a gun and an enemy too far away to use it on: that is said too
  const armed = car([{ type: 'mg', x: 0, y: 1, z: 1, dir: 'N' }]);
  const idle = duel(armed, armed, { gap: 20 });
  idle.run(8);
  const mv = idle.w.telemetry(idle.p).move;
  assert.ok(mv.timeParked >= 7.5 && Math.abs(mv.parkedAt - 20) < 0.5, JSON.stringify(mv));
  assert.equal(mv.timeStuck, 0);
  const said = insightList(report(idle.w), 0).find((x) => x.kind === 'parked');
  assert.match(said.text, /^stood still for \d+\.\d s of its \d+\.\d s with the nearest enemy about 20 m away, beyond every gun it had/);
  // within reach of the gun it is holding fire, not parked; and a car with no gun at all is not waiting for a shot
  const close = duel(armed, armed, { gap: 8 });
  close.run(8);
  assert.equal(close.w.telemetry(close.p).move.timeParked, 0);
  assert.equal(wall.w.telemetry(wall.q).move.timeParked, 0, 'no guns: nothing it is failing to bring to bear');
  // an enemy inside a mortar's minimum range is too near, not out of reach: that has its own counter
  const lobber = car([{ type: 'mortar', x: -1, y: 1, z: 1, dir: 'N' }]);
  const under = duel(lobber, car(), { gap: 4 });
  under.run(8);
  assert.equal(under.w.telemetry(under.p).move.timeParked, 0);
  assert.ok(under.w.telemetry(under.p).fire.timeTargetTooClose >= 7);
  // and a car that is asking to move, however gently, is not standing by choice
  const creeping = duel(armed, armed, { at: { x: 3.6, y: 9 }, heading: Math.PI, gap: -30 });
  creeping.w.setCommand(creeping.p, { throttle: 0.4 });
  creeping.run(8);
  assert.equal(creeping.w.telemetry(creeping.p).move.timeParked, 0);
});

test('a real match: the summary carries telemetry and at most six insights per vehicle, small enough to read', () => {
  const res = runMatch({ map: 'proving', seed: 1, teams: [[loadBot('quillback')], [loadBot('grindstone')]], record: false });
  // the full result also keeps what each controller asked for and the tile it stood on, twice a second while it lived
  for (const v of res.vehicles) {
    const k = v.telemetry.track, life = v.alive ? res.duration : v.deathT;
    assert.equal(k.step, 0.5);
    assert.ok(Math.abs(k.throttle.length - life / 0.5) <= 2, `${k.throttle.length} samples over ${life} s`);
    assert.ok(k.steer.length === k.throttle.length && k.fire.length === k.throttle.length && k.tile.length === k.throttle.length);
    assert.ok(k.throttle.every((x) => x >= -1 && x <= 1) && k.fire.every((x) => x === 0 || x === 1) && k.tile.every((t) => typeof t === 'string'));
    assert.ok(k.fire.some((x) => x === 1), 'it asked to fire at some point');
  }
  const s = summarize(res);
  assert.equal(s.vehicles.length, 2);
  for (const v of s.vehicles) {
    const raw = res.vehicles[v.id];
    assert.ok(v.insights.length >= 1 && v.insights.length <= 6 && v.insights.every((x) => typeof x === 'string'), JSON.stringify(v.insights));
    assert.deepEqual(v.insights, insightsFor(res, v.id));
    assert.deepEqual(v.insights, insightsFor(s, v.id), 'the summary gives the same findings as the result it was made from');
    const t = v.telemetry;
    assert.deepEqual(Object.keys(t).sort(), ['dealt', 'fire', 'losses', 'lossesByCause', 'move', 'range', 'taken', 'timeline', 'weapons']);
    assert.ok(JSON.stringify(v).length < 12000, `${v.name}: ${JSON.stringify(v).length} bytes`);
    // the same totals as the stats that were always there (those are rounded to a tenth)
    close(sum(raw.telemetry.weapons.map((g) => g.shots)), raw.stats.shots, 0.051, 'shots');
    close(sum(raw.telemetry.weapons.map((g) => g.hits)), raw.stats.hits, 0.051, 'hits');
    close(sum(raw.telemetry.dealt.byTarget), raw.stats.damageDealt, 0.051, 'dealt');
    close(sum(raw.telemetry.taken.byAttacker), raw.stats.damageTaken, 0.051, 'taken');
    assert.ok(t.weapons.length > 0 && t.weapons.every((g) => g.shots > 0 && g.damage > 0));
    assert.ok(Object.values(t.taken.bySide).every((x) => Number.isInteger(x) && x > 0), 'whole numbers, no zero entries');
    assert.ok(t.fire.timeTargetInReach > 10 && t.fire.timeFiring <= t.fire.timeTargetInReach);
    assert.ok(t.move.topSpeed >= t.move.meanSpeed && t.move.meanSpeed > 0);
    assert.ok(t.losses.length <= 12 && t.taken.top.length <= 3);
  }
  // what one side dealt is what the other took
  assert.deepEqual(s.vehicles[0].telemetry.dealt.byRange, s.vehicles[1].telemetry.taken.byRange);
  assert.equal(s.vehicles[0].telemetry.dealt.byTarget[1], s.vehicles[1].telemetry.taken.byAttacker[0]);
  // whichever of the two lost, its first insight says how it ended and at whose hands; the winner's says it survived
  const loser = s.vehicles.find((v) => !v.alive), winner = s.vehicles.find((v) => v.alive);
  assert.ok(loser && winner, 'one of the two is destroyed');
  assert.match(loser.insights[0], new RegExp(`^destroyed at \\d+\\.\\d s: .*${winner.name}#${winner.id}`));
  assert.match(winner.insights[0], /^survived with \d+% hull; its team won/);

  // brief: no design, no timeline, no list of losses
  const b = summarize(res, { brief: true });
  for (const v of b.vehicles) {
    assert.ok(v.design === undefined && v.telemetry.timeline === undefined && v.telemetry.losses === undefined && v.insights.length > 0);
    assert.ok(JSON.stringify(v).length < JSON.stringify(s.vehicles[v.id]).length, 'the brief form is the smaller one');
  }

  // a saved match read back as telemetry
  const view = telemetryView(JSON.parse(JSON.stringify(res)));
  assert.deepEqual(view.vehicles.map((v) => v.telemetry), s.vehicles.map((v) => v.telemetry));
  assert.deepEqual(view.vehicles.map((v) => v.insights), s.vehicles.map((v) => v.insights));
  assert.equal(telemetryView(res, 1).vehicles.length, 1);
  assert.throws(() => telemetryView(res, 5), /no vehicle 5/);
  assert.throws(() => telemetryView({ vehicles: [{ id: 0 }] }), /before the engine kept telemetry/);

  // many matches added up: what the losses have in common
  const d = matchDigest(res);
  assert.ok(JSON.stringify(d).length < JSON.stringify(s).length && d.vehicles.every((v) => v.telemetry.timeline === undefined && v.telemetry.losses.length <= 3));
  assert.deepEqual(d.vehicles.map((v) => v.insights.map((x) => x.text)), s.vehicles.map((v) => v.insights));
  const rows = d.vehicles.map((v) => ({ outcome: d.winner === v.team ? 'win' : 'loss', duration: d.duration, vehicles: [v] }));
  const dx = diagnose([...rows, ...rows]);
  assert.equal(dx.wins.matches, 2); assert.equal(dx.losses.matches, 2); assert.equal(dx.draws, undefined);
  // (the figures below are whatever this match gave the side that lost it: the test does not care which bot that was)
  assert.deepEqual(dx.losses.deathCauses, { [loser.death.cause]: 2 });
  assert.equal(dx.losses.meanDuration, res.duration);
  close(sum(dx.losses.takenBySide), 1, 0.02); close(sum(dx.losses.timeInBand), 1, 0.03);
  assert.ok(Math.max(...Object.values(dx.losses.takenByWeapon)) > 0.5 && dx.losses.meanRange > 0 && dx.losses.fire.timeTargetInReach > 5 && dx.losses.fire.firingShare > 0.2);
  assert.ok(Object.values(dx.losses.firstPiecesLost).every((n) => n === 2));
  assert.ok(dx.losses.commonInsights.length > 0 && dx.losses.commonInsights.every((x) => x.matches === 2 && x.kind !== 'outcome' && typeof x.example === 'string'));
  assert.deepEqual(diagnose([]).losses, { matches: 0 });
});

test('firing time is time with the trigger held: a gun that only cools down, or a harpoon winding back, is not firing', () => {
  // one shell, then the trigger is let go: the cannon's 1.4 s reload is not counted as firing
  const one = duel(car([{ type: 'cannon', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 8 });
  one.w.setCommand(one.p, { fire: true, aim: { x: one.q.x, y: one.q.y } });
  one.run(0.05);
  one.w.setCommand(one.p, { fire: false });
  one.run(2);
  const cannon = one.p.tel.weapons.find((g) => g.type === 'cannon');
  assert.equal(cannon.shots, 1);
  assert.ok(cannon.firingTime < 0.1, `one shot and nothing more is ${cannon.firingTime.toFixed(2)} s of firing`);
  // held down, the same gun is firing the whole time, reload included
  const held = duel(car([{ type: 'cannon', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 8 });
  held.w.setCommand(held.p, { fire: true, aim: { x: held.q.x, y: held.q.y } });
  held.run(2);
  assert.ok(held.p.tel.weapons.find((g) => g.type === 'cannon').firingTime > 1.5);
  // a harpoon that missed winds back for six seconds: none of that is firing, trigger held or not
  const hook = duel(car([{ type: 'harpoon', x: 0, y: 1, z: 1, dir: 'N' }]), car(), { gap: 30 });
  hook.w.setCommand(hook.p, { fire: true, aim: { x: hook.q.x, y: hook.q.y } });
  hook.run(3);
  const h = hook.p.tel.weapons.find((g) => g.type === 'harpoon');
  assert.ok(h.shots >= 1 && h.firingTime < 0.1, `${h.shots} shot, ${h.firingTime.toFixed(2)} s`);
});

test('the track lines up with the frames: sample n is what the controller asked for, and stood on, at (n + 1) half seconds', () => {
  // frostbite has ice and floor side by side, so being half a second out shows
  const res = runMatch({ map: 'frostbite', seed: 1, teams: [[loadBot('bulldozer')], [loadBot('boxer')]], record: true });
  // (frames keep positions to the centimetre, so a car exactly on the line between two tiles may read as either:
  //  the samples must agree almost always, and clearly better than they would half a second out)
  const agree = (shift) => {
    let same = 0, all = 0;
    for (const v of res.vehicles) {
      const k = v.telemetry.track;
      for (let n = 0; n < k.tile.length; n++) {
        const f = res.frames[Math.round(((n + 1 + shift) * k.step) / res.frameDt)];
        if (!f) break;
        const [x, y] = f.v[v.id];
        all++;
        if (k.tile[n] === TILE_NAME[tileCodeAt(MAPS.frostbite, x, y)]) same++;
      }
    }
    return { same, all };
  };
  const right = agree(0), early = agree(-1);
  assert.ok(right.all > 40 && right.same / right.all > 0.97, `${right.same} of ${right.all} samples agree with the frame at (n + 1) half seconds`);
  assert.ok(right.same > early.same, `and fewer (${early.same}) with the frame half a second earlier`);
});

test('a car that still has a thruster is not immobile when its wheels are gone', () => {
  const jet = car([{ type: 'thruster', x: 0, y: -2, z: 0, dir: 'N' }]);
  const { w, p, q } = duel(jet, car(), { gap: 12 });
  assert.equal(p.tel.movers, 5, 'four wheels and a thruster');
  for (const wheel of p.parts.filter((x) => x.type === 'wheel')) w.destroy(p, wheel, q, 'test');
  assert.equal(p.tel.immobileAt, null, 'the thruster is still there');
  w.destroy(p, p.parts.find((x) => x.type === 'thruster'), q, 'test');
  assert.equal(p.tel.immobileAt, w.t);
});
