import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, won, validState, actions, playerActions } from './engine.mjs';

const step = (s, action) => transition(s, action, playerActions.has(action) ? 'player' : 'partner');
function run(sequence, s = initialState()) {
  for (const action of sequence) { const r = step(s, action); assert.equal(r.ok, true, `${action}: ${r.message}`); s = r.state; }
  return s;
}
test('both independent roles are needed for the full escape; no dialogue declares success', () => {
  let s = run(['send-key', 'unlock', 'power-on', 'hold-brake', 'power-off', 'brace', 'release-brake']);
  assert.equal(s.loadTested, true); assert.equal(won(s), false);
  s = run(['open-door'], s); assert.equal(won(s), false);
  assert.equal(step(s, 'leave').ok, true);
  s = run(['leave'], s); assert.equal(won(s), true);
  assert.equal(step(s, 'power-on').ok, false);
});
test('early exit opening is recoverable; cannot restart power while door is open', () => {
  let s = run(['send-key', 'unlock', 'power-on', 'open-door']);
  assert.equal(s.power, false); assert.equal(won(s), false);
  assert.equal(step(s, 'power-on').ok, false);
  s = run(['close-door', 'power-on', 'hold-brake', 'power-off', 'brace', 'open-door', 'leave'], s);
  assert.equal(won(s), true);
});
test('a hand on the brake is not an escape solution; unsafe reaching changes nothing', () => {
  let s = run(['power-on', 'hold-brake']);
  const attempt = step(s, 'brace'); assert.equal(attempt.ok, false); assert.strictEqual(attempt.state, s);
  s = run(['send-key', 'unlock', 'open-door'], s);
  assert.equal(step(s, 'leave').ok, false);
  s = run(['brace', 'release-brake', 'leave'], s); assert.equal(won(s), true);
});
test('early release drops gate safely and permits another attempt', () => {
  const s = run(['power-on', 'hold-brake', 'power-off', 'release-brake']);
  assert.equal(step(s, 'brace').ok, false);
  assert.equal(step(s, 'power-on').ok, true);
});
test('actor permissions, missing items and impossible states are rejected', () => {
  const s = initialState();
  for (const a of ['unlock', 'open-door', 'brace', 'leave', 'hold-brake']) assert.equal(step(s, a).ok, false);
  assert.equal(transition(s, 'send-key', 'player').ok, false);
  assert.equal(transition(s, 'power-on', 'partner').ok, false);
  assert.equal(transition(s, 'send-key', 'unknown').ok, false);
  assert.equal(transition(s, 'invent-success', 'player').ok, false);
  assert.equal(validState({ ...s, doorOpen: true }), false);
  assert.equal(validState({ ...s, braced: true }), false);
  assert.equal(validState({ ...s, partnerOut: true }), false);
  assert.equal(validState({ ...s, moves: -1 }), false);
  assert.equal(validState({ ...s, surprise: 'secret' }), false);
});
test('exhaustive reachable-state graph: all states can still reach a legitimate shared exit', () => {
  const key = s => JSON.stringify({ ...s, moves: 0 });
  const start = initialState(), queue = [start], states = new Map([[key(start), start]]), reverse = new Map();
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i], source = key(s);
    for (const a of actions) {
      const result = step(s, a);
      if (!result.ok) continue;
      assert.ok(validState(result.state));
      const dest = key(result.state);
      if (!reverse.has(dest)) reverse.set(dest, new Set());
      reverse.get(dest).add(source);
      if (!states.has(dest)) { states.set(dest, { ...result.state, moves: 0 }); queue.push(states.get(dest)); }
    }
  }
  const canFinish = new Set([...states].filter(([, s]) => won(s)).map(([k]) => k));
  const reachable = [...canFinish];
  for (let i = 0; i < reachable.length; i++) for (const k of reverse.get(reachable[i]) || []) {
    if (!canFinish.has(k)) { canFinish.add(k); reachable.push(k); }
  }
  assert.ok(states.size > 30);
  assert.equal(canFinish.size, states.size, 'a reachable state has no recovery path');
  console.log(`Checked ${states.size} reachable world states; every state can reach the exit.`);
});
