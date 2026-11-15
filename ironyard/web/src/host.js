// Main-thread side of the simulation worker. Controller sources are embedded
// literally in a blob worker (no eval needed), so a runaway controller can be
// terminated without freezing the page.
export class SimHost {
  constructor(IY, engineSrc, runnerSrc) {
    this.IY = IY; this.engineSrc = engineSrc; this.runnerSrc = runnerSrc;
    this.worker = null; this.key = ''; this.jobs = new Map(); this.nextId = 1; this.sources = {};
  }

  setBots(sources) { this.sources = sources; }

  build() {
    const key = Object.keys(this.sources).sort().map((id) => id + ':' + this.sources[id].length + ':' + hash(this.sources[id])).join('|');
    if (this.worker && key === this.key) return;
    this.dispose();
    const parts = [this.engineSrc, '\nvar __BOTS = {};\n'];
    for (const [id, src] of Object.entries(this.sources)) {
      let wrapped;
      try { wrapped = this.IY.wrapBotSource(src); } catch (e) { continue; }
      parts.push(`__BOTS[${JSON.stringify(id)}] = ${wrapped};\n`);
    }
    parts.push(this.runnerSrc);
    this.url = URL.createObjectURL(new Blob(parts, { type: 'text/javascript' }));
    this.worker = new Worker(this.url);
    this.key = key;
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.ready) return;
      const job = this.jobs.get(m.id);
      if (!job) return;
      if (m.progress) { job.touch(); job.onProgress && job.onProgress(m.progress); return; }
      this.jobs.delete(m.id); clearTimeout(job.timer);
      if (m.ok) job.resolve(m.result); else job.reject(Object.assign(new Error(m.error), { detail: m.detail }));
    };
    this.worker.onerror = (ev) => {
      ev.preventDefault && ev.preventDefault();
      this.failAll(new Error('The simulation worker failed: ' + (ev.message || 'unknown error')));
      this.dispose();
    };
  }

  failAll(err) { for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(err); } this.jobs.clear(); }

  dispose() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.key = '';
  }

  call(msg, { timeout = 20000, onProgress } = {}) {
    this.build();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const job = { resolve, reject, onProgress, timer: null };
      job.touch = () => {
        clearTimeout(job.timer);
        job.timer = setTimeout(() => {
          this.jobs.delete(id);
          this.dispose(); // kills the runaway controller along with the worker
          reject(new Error(`The simulation timed out (no answer for ${timeout / 1000}s): most likely a controller's tick() is stuck in an infinite loop`));
        }, timeout);
      };
      job.touch();
      this.jobs.set(id, job);
      this.worker.postMessage({ ...msg, id });
    });
  }

  match(spec) { return this.call({ type: 'match', spec }, { timeout: 15000 }); }
  describe(bot, budget) { return this.call({ type: 'describe', bot, budget }, { timeout: 8000 }); }
  tournament(schedule, mode, budget, onProgress) { return this.call({ type: 'tournament', schedule, mode, budget }, { onProgress, timeout: 25000 }); }

  /** Compile one controller alone in a throwaway worker to surface syntax errors with a line number. */
  checkSyntax(source) {
    return new Promise((resolve) => {
      let wrapped;
      try { wrapped = this.IY.wrapBotSource(source); } catch (e) { resolve({ ok: false, error: e.message }); return; }
      const url = URL.createObjectURL(new Blob([`self.__b = ${wrapped};\nself.postMessage('ok');`], { type: 'text/javascript' }));
      const w = new Worker(url);
      const done = (r) => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); resolve(r); };
      const timer = setTimeout(() => done({ ok: false, error: 'The syntax check timed out' }), 4000);
      w.onmessage = () => done({ ok: true });
      w.onerror = (ev) => {
        ev.preventDefault && ev.preventDefault();
        const line = ev.lineno ? Math.max(1, ev.lineno - 5) : null;
        done({ ok: false, error: (ev.message || 'Syntax error').replace(/^Uncaught /, '') + (line ? ` (near line ${line})` : '') });
      };
    });
  }
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
