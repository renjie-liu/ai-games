// Worker pool with a watchdog. Every match runs in a worker thread; if a
// controller hangs (while(true) …) the worker is terminated and the culprit named.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { readBotSource } from './loader.js';

const WORKER_URL = new URL('./worker.js', import.meta.url);

export class MatchPool {
  constructor({ size = Math.max(1, Math.min(4, os.cpus().length)), timeoutMs = 60_000, memoryMb = 512 } = {}) {
    this.size = size; this.timeoutMs = timeoutMs; this.memoryMb = memoryMb;
    this.idle = []; this.queue = []; this.all = new Set(); this.nextId = 1; this.closed = false;
  }

  spawn() {
    // a controller that allocates without end takes its worker down, not the process
    const w = new Worker(WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: this.memoryMb } });
    w.unref();
    this.all.add(w);
    return w;
  }

  /** spec.teams = [[{id, source}], ...]; spec.want = 'full' | 'summary' | 'digest' (telemetry and insights, no timeline or logs) | 'score' */
  run(spec, { timeoutMs = this.timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ spec, timeoutMs, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.queue.length && (this.idle.length || this.all.size < this.size)) {
      const job = this.queue.shift();
      const w = this.idle.pop() || this.spawn();
      const id = this.nextId++;
      const sab = new SharedArrayBuffer(4);
      const trace = new Int32Array(sab); trace[0] = -1;
      let done = false;
      const finish = (fn, reuse) => {
        if (done) return; done = true;
        clearTimeout(timer); w.off('message', onMsg); w.off('error', onErr);
        if (reuse && !this.closed) this.idle.push(w); else { this.all.delete(w); w.terminate(); }
        fn(); this.pump();
      };
      const onMsg = (m) => {
        if (m.id !== id) return;
        finish(() => (m.ok ? job.resolve(m.result) : job.reject(Object.assign(new Error(m.error), { detail: m.detail }))), true);
      };
      // whose controller was running when the worker stopped answering (the worker keeps the vehicle's id in `trace`)
      const running = () => {
        const vid = trace[0];
        if (vid < 0) return null;
        const size = job.spec.teams[0].length === 1 && job.spec.mode && job.spec.mode !== '1v1' ? Number(job.spec.mode[0]) : job.spec.teams[0].length;
        const team = vid < size ? 0 : 1, members = job.spec.teams[team];
        return members[members.length === 1 ? 0 : vid - team * size]?.id ?? job.spec.teams[0][0].id;
      };
      const onErr = (e) => {
        const culprit = running();
        if (e && e.code === 'ERR_WORKER_OUT_OF_MEMORY') {
          finish(() => job.reject(Object.assign(new Error(`match ran out of memory (${this.memoryMb} MB)${culprit ? `: controller "${culprit}" was running` : ''}`), { detail: { memory: true, bot: culprit } })), false);
        } else finish(() => job.reject(e), false);
      };
      const timer = setTimeout(() => {
        const culprit = running();
        finish(() => job.reject(Object.assign(new Error(culprit
          ? `match timed out after ${job.timeoutMs} ms: controller "${culprit}" did not return (infinite loop?)`
          : `match timed out after ${job.timeoutMs} ms`), { detail: { timeout: true, bot: culprit } })), false);
      }, job.timeoutMs);
      w.on('message', onMsg); w.on('error', onErr);
      w.postMessage({ id, spec: job.spec, trace: sab });
    }
  }

  async close() {
    this.closed = true;
    await Promise.all([...this.all].map((w) => w.terminate()));
    this.all.clear(); this.idle.length = 0;
  }
}

/** Turn bot ids into {id, source} pairs for a worker. */
export function withSources(teams, overrides = {}) {
  return teams.map((team) => team.map((id) => ({ id, source: overrides[id] ?? readBotSource(id) })));
}
