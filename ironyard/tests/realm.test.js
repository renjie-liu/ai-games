// The fence between the engine and a controller (engine/realm.js, node/loader.js):
// what a controller can reach, what it is told, and that being fenced changes no match.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPS, PARTS, ITEMS, TILES, RULES, World, runMatch, describeMap, compileBotSource,
  controllerRealm, makeUtil, makeFollower,
} from '../engine/index.js';
import { listBots, loadBot, makeBot, readBotSource } from '../node/loader.js';
import { MatchPool } from '../node/runner.js';

const strip = (res) => JSON.stringify(res, (k, v) => (k === 'cpu' ? undefined : v));
const ROOKIE = readBotSource('rookie');
const TICK = 'function tick(state, api) {';
/** Rookie with `body` run at the top of tick. */
const rookieWith = (body, top = '') => {
  assert.ok(ROOKIE.includes(TICK));
  return ROOKIE.replace(TICK, `${top}\n${TICK} ${body}`);
};
/** What `expr` evaluates to inside a controller's tick (or how it threw). */
function probe(expr, { mode = '1v1', t = 0.3 } = {}) {
  const src = rookieWith(`if (!probed) { probed = true; let r; try { r = ${expr}; } catch (e) { r = 'threw: ' + e.message; } api.log('PROBE', String(r)); }`, 'let probed = false;');
  const res = runMatch({ map: 'proving', mode, teams: [[makeBot('probe', src)], [loadBot('rookie')]], seed: 1, record: false, maxTime: t });
  return res.vehicles.filter((v) => v.team === 0).map((v) => (v.logs.find((l) => l.includes('PROBE')) || `no log; ${v.errors.join(' | ')}`).replace(/^\[[^\]]*\] PROBE /, ''));
}

test('a controller has the language and nothing else', () => {
  const names = ['process', 'require', 'globalThis', 'Date', 'performance', 'setTimeout', 'fetch', 'Intl', 'WebAssembly', 'SharedArrayBuffer', 'Atomics', 'WeakRef', 'eval'];
  // (Date and friends are shadowed by name in every environment; in a sealed realm they are not there at all)
  assert.deepEqual(probe(`[${names.map((n) => `typeof ${n}`).join(', ')}].join()`), [names.map(() => 'undefined').join()]);
  assert.deepEqual(probe('[typeof Math.sin, typeof JSON.parse, typeof Map, typeof Float64Array, typeof Promise].join()'), ['function,function,function,function,function']);
});

test('nothing a controller is handed leads back to the engine', () => {
  // Every function has a constructor, and that constructor makes functions from text. For anything that
  // came from the engine it would be the engine's own — a way to `process` in one line.
  const handed = ['api', 'api.log', 'api.rng', 'api.rng.pick', 'api.util.dist', 'api.util.lead', 'api.util.blueprint', 'api.nav', 'api.nav.los', 'api.nav.path',
    'api.nav.follower', 'api.nav.follower().next', 'api.map', 'api.map.rows', 'api.parts.mg', 'api.rules', 'Math', 'Math.max', 'Math.random', 'console', 'console.log',
    'state', 'state.self', 'state.self.parts', 'state.self.weapons[0]', 'state.enemies', 'state.lastSeen[0]', 'state.zone', 'state.items', 'state.messages', 'tick'];
  for (const what of handed) {
    assert.match(probe(`(${what}).constructor.constructor('return typeof process')()`)[0], /^threw: Code generation from strings disallowed/, what);
  }
  // …including what the engine's side throws, and what comes back from it
  const viaError = (call) => `(() => { try { ${call}; return 'did not throw'; } catch (e) { return e.constructor.constructor('return typeof process')(); } })()`;
  for (const call of ["api.util.blueprint('x', null)", "api.util.blueprint('x', { chassis: ['?'] })", 'api.nav.los(Symbol(), 0, 0, 0)', 'api.nav.path(0, 0, 9, 9, { toJSON() { throw new Error("mine"); } })',
    '(function deep() { api.nav.tileAt(1, 1); deep(); })()']) {
    assert.match(probe(viaError(call))[0], /^threw: Code generation from strings disallowed/, call);
  }
  assert.match(probe("api.nav.path(1, 1, 9, 9).constructor.constructor('return 1')()")[0], /^threw: Code generation/);
  assert.match(probe("api.util.blueprint('x', { chassis: Array(11).fill('. . . . . . . . .') }).parts.constructor.constructor('return 1')()")[0], /^threw: Code generation/);
  // the api cannot be rewritten for later ticks either
  assert.match(probe('(() => { api.util.dist = () => 0; })()')[0], /^threw: Cannot assign to read only property/);
  assert.match(probe('(() => { api.parts.mg.dmg = 999; })()')[0], /^threw: Cannot assign to read only property/);
});

test('what a controller rewrites, it rewrites for itself alone', () => {
  // one file, three vehicles: each poisons the built-ins and its own variables, then reports what it finds
  const src = rookieWith(`if (!done && state.t > 0.2) { done = true; api.log('SEES', String([].poison), String(shared), String(Math.max.poison)); }
    if (!done) { Array.prototype.poison = 'from slot ' + state.self.slot; shared = state.self.slot; try { Math.max.poison = 1; } catch (e) {} }`, 'let done = false, shared = "nobody";');
  const res = runMatch({ map: 'proving', mode: '3v3', teams: [[makeBot('poisoner', src)], [loadBot('rookie')]], seed: 1, record: false, maxTime: 0.5 });
  const sees = res.vehicles.filter((v) => v.team === 0).map((v) => v.logs.find((l) => l.includes('SEES')).replace(/^.*SEES /, ''));
  assert.deepEqual(sees, [0, 1, 2].map((slot) => `from slot ${slot} ${slot} 1`));
  assert.equal([].poison, undefined, 'the engine’s own Array is untouched');
  assert.deepEqual(res.vehicles.filter((v) => v.team === 1).flatMap((v) => v.errors), [], 'and so is the other team');

  // an observation is a private copy: one vehicle scribbling on its own changes nothing for its teammate or its enemies
  const first = 'state.self.id < state.allies[0].id';
  const scribble = `for (const e of state.enemies.concat(state.allies)) { e.x = -999; e.alive = false; e.parts.length = 0; e.note = 'mine'; } state.zone.r = 0; state.items.length = 0; state.lastSeen.length = 0;`;
  const run = (body) => runMatch({ map: 'canyon', mode: '2v2', teams: [[makeBot('rookie', rookieWith(`if (${first}) { ${body} return {}; }`))], [loadBot('hornet')]], seed: 5 });
  const a = run(scribble), b = run('');
  assert.equal(strip(a), strip(b));
  assert.deepEqual(a.vehicles.flatMap((v) => v.errors), []);
  assert.ok(a.vehicles[1].stats.shots > 0, 'the teammate fought on');
});

test('a controller runs during its turn and at no other time', () => {
  const src = rookieWith(`if (!armed) { armed = true; Promise.resolve().then(() => api.log('LATE')); (async () => { await null; api.log('LATE'); })(); }`, 'let armed = false;');
  const res = runMatch({ map: 'proving', mode: '1v1', teams: [[makeBot('sleeper', src)], [loadBot('rookie')]], seed: 1, record: false, maxTime: 2 });
  assert.deepEqual(res.vehicles[0].logs, []);
  assert.deepEqual(res.vehicles[0].errors, []);
});

test('controller errors are caught, counted and located', () => {
  const run = (src) => runMatch({ map: 'proving', mode: '1v1', teams: [[makeBot('faulty', src)], [loadBot('rookie')]], seed: 1, record: false, maxTime: 1.5 }).vehicles[0];
  const faulty = rookieWith(`\nif (state.t > 1) null.x;`);
  const line = faulty.slice(0, faulty.indexOf('null.x')).split('\n').length;   // the line of the controller's own file
  assert.match(run(faulty).errors[0], new RegExp(`^tick threw at t=1\\.05: Cannot read properties of null \\(reading 'x'\\) \\(line ${line}\\)$`));
  assert.match(run(rookieWith(`(function again() { again(); })();`)).errors[0], /Maximum call stack size exceeded/);
  assert.match(run(rookieWith(`throw 'a bare string';`)).errors[0], /a bare string/);
  assert.match(run(rookieWith(`throw { get message() { throw new Error('no'); } };`)).errors[0], /tick threw at t=0\.00: /);
  assert.match(run(ROOKIE.replace('function tick', 'function init() { undefinedName; }\nfunction tick')).errors[0], /^init threw: undefinedName is not defined \(line \d+\)$/);
  assert.throws(() => run('throw new Error("at load");'), /bot "faulty" \(team 0, slot 0\): threw while loading: at load \(line 1\)/);
  assert.throws(() => run('const design = {};'), /must define a top-level function `tick\(state, api\)`/);
  assert.throws(() => run('const design = () => { throw new Error("no car"); };\nfunction tick() {}'), /design\(ctx, api\) threw: no car \(line 1\)/);
  assert.throws(() => run('const design = () => { const d = {}; d.self = d; return d; };\nfunction tick() {}'), /design must be plain data/);
  assert.throws(() => run('function tick() {}'), /invalid design: design must be an object/);
  // a command is read field by field: `true` means full, nonsense means nothing, a getter that throws is a tick that threw
  const odd = run(rookieWith(`return { throttle: true, steer: 'left', brake: NaN, aim: { x: 'far', y: 2 }, fire: [0.5, 'x', 3], boost: { N: true, E: 7 }, target: 2.5, aims: { 3: 1, nope: 2 }, say: 1n };`));
  assert.deepEqual(odd.errors, []);
  assert.ok(odd.stats.distance > 1, 'throttle: true drives');
  assert.match(run(rookieWith(`return { get throttle() { throw new Error('trap'); } };`)).errors[0], /tick threw at t=0\.00: trap/);
});

test('the observation a controller decodes is the one the rulebook describes', () => {
  // World.observeAll builds the documented `state` objects directly; a realm rebuilds them from numbers.
  // Shadow a whole match with a second realm per vehicle and compare the two at every decision.
  const boot = (map, k) => JSON.stringify({ ctx: { mode: '3v3', teamSize: 3, team: 0, slot: k, budget: 1200 }, file: '', lineOffset: 0,
    parts: PARTS, items: ITEMS, tiles: TILES, rules: RULES, map: describeMap(map) });
  const host = Object.fromEntries(['rng', 'log', 'blueprint', 'tileAt', 'tileAtCell', 'isOpen', 'clearWall', 'clearPit', 'los', 'clear', 'path'].map((n) => [n, () => 0]));
  const real = World.prototype.observeWire;
  let checked = 0, withMessages = 0, enemiesSeen = 0;
  World.prototype.observeWire = function (sinks) {
    this.mirrors ||= this.vehicles.map((v) => controllerRealm(() => ({ tick() {} }), host, boot(this.map, v.slot), makeUtil, makeFollower));
    const want = this.observeAll();
    const out = real.call(this, sinks);
    out.forEach((o, id) => {
      if (!o) { assert.equal(want[id], null); return; }
      this.mirrors[id].buf.set(o.buf.subarray(0, o.n));
      const got = this.mirrors[id].decode(o.messages, o.layouts);
      assert.deepStrictEqual(got, want[id]);
      checked++; withMessages += got.messages.length ? 1 : 0; enemiesSeen += got.enemies.length;
    });
    return out;
  };
  try {
    for (const [map, a, b, seed] of [['bog', ['wolfpack'], ['thumper', 'wasp', 'medic'], 2], ['foundry', ['longshot', 'bulldozer', 'hornet'], ['bastion'], 7], ['sumo', ['wasp'], ['bulldozer'], 4]]) {
      const res = runMatch({ map, mode: '3v3', teams: [a.map(loadBot), b.map(loadBot)], seed, record: false });
      assert.deepEqual(res.vehicles.flatMap((v) => v.errors), []);
    }
  } finally { World.prototype.observeWire = real; }
  assert.ok(checked > 5000 && withMessages > 500 && enemiesSeen > 5000, `compared ${checked} observations`);
});

test('a fenced controller plays the same match as an unfenced one', () => {
  // { id, factory } runs in the engine's own realm — how the browser page runs controllers
  const ids = listBots().filter((b) => b.kind === 'builtin').map((b) => b.id);
  const open = (id) => ({ id, factory: compileBotSource(readBotSource(id)) });
  for (const [mode, map, a, b, seed] of [['1v1', 'canyon', ['hornet'], ['longshot'], 3], ['2v2', 'skybridge', ['wasp', 'thumper'], ['bulldozer'], 8], ['3v3', 'frostbite', ['wolfpack'], ['medic', 'bastion', 'rookie'], 11]]) {
    assert.ok(a.concat(b).every((id) => ids.includes(id)));
    const fenced = runMatch({ map, mode, seed, teams: [a.map(loadBot), b.map(loadBot)] });
    const bare = runMatch({ map, mode, seed, teams: [a.map(open), b.map(open)] });
    assert.equal(strip(fenced), strip(bare), `${mode} on ${map}`);
    assert.ok(fenced.winner !== null && fenced.frames.length > 100);
  }
});

test('a controller that eats memory takes its match down, not the process', async () => {
  const pool = new MatchPool({ size: 1, timeoutMs: 20000, memoryMb: 64 });
  const hog = rookieWith(`if (state.t > 0.3) for (;;) hoard.push(new Array(1e6).fill(state.t));`, 'const hoard = [];');
  try {
    await assert.rejects(
      pool.run({ map: 'proving', mode: '1v1', seed: 1, want: 'score', teams: [[{ id: 'rookie', source: ROOKIE }], [{ id: 'hog', source: hog }]] }),
      /out of memory \(64 MB\): controller "hog" was running/);
    const ok = await pool.run({ map: 'proving', mode: '1v1', seed: 1, want: 'score', teams: [[{ id: 'rookie', source: ROOKIE }], [{ id: 'bulldozer', source: readBotSource('bulldozer') }]] });
    assert.ok(ok.winner !== undefined, 'the pool carries on with a fresh worker');
  } finally { await pool.close(); }
});
