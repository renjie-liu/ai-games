// Worker thread: compiles controllers and runs matches off the main thread so a
// runaway controller can be killed by the watchdog in runner.js.
import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { runMatch, summarize } from '../engine/index.js';
import { makeBot } from './loader.js';

const cache = new Map();
function bot(b) {
  const hit = cache.get(b.id);
  if (hit && hit.source === b.source) return hit.bot;
  const made = makeBot(b.id, b.source);
  cache.set(b.id, { source: b.source, bot: made });
  return made;
}

parentPort.on('message', (job) => {
  const trace = job.trace ? new Int32Array(job.trace) : null;
  try {
    const { want = 'full', ...spec } = job.spec;
    const teams = spec.teams.map((team) => team.map(bot));
    const res = runMatch({ ...spec, teams, now: () => performance.now(), trace, record: want === 'full' });
    let result;
    if (want === 'full') result = res;
    else if (want === 'summary') result = summarize(res);
    else result = { winner: res.winner, reason: res.reason, duration: res.duration, teams: res.teams,
      errors: res.vehicles.flatMap((v) => v.errors.map((e) => `${v.bot}: ${e}`)).slice(0, 6) };
    parentPort.postMessage({ id: job.id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: e && e.message ? e.message : String(e), detail: e && e.detail });
  }
});
