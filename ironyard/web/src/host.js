// Main-thread side of the simulation worker. Controller sources are embedded
// literally in a blob worker (no eval needed), so a runaway controller can be
// terminated without freezing the page.
export class SimHost {
  constructor(IY, engineSrc, runnerSrc) {
    this.IY = IY; this.engineSrc = engineSrc; this.runnerSrc = runnerSrc;
    this.worker = null; this.key = ''; this.jobs = new Map(); this.activeId = null; this.nextId = 1; this.sources = {};
  }

  setBots(sources) { this.sources = { ...sources }; }

  build() {
    const key = Object.keys(this.sources).sort().map((id) => id + ':' + this.sources[id].length + ':' + hash(this.sources[id])).join('|');
    if (this.worker && key === this.key) return;
    this.dispose(new Error('Controllers changed; the previous simulation was stopped'));
    const parts = [this.engineSrc, '\nvar __BOTS = {};\n'];
    for (const [id, src] of Object.entries(this.sources)) {
      let wrapped;
      try { wrapped = this.IY.wrapBotSource(src); } catch (e) { continue; }
      parts.push(`__BOTS[${JSON.stringify(id)}] = ${wrapped};\n`);
    }
    parts.push(this.runnerSrc);
    this.url = URL.createObjectURL(new Blob(parts, { type: 'text/javascript' }));
    const worker = this.worker = new Worker(this.url);
    this.key = key;
    worker.onmessage = (ev) => {
      if (this.worker !== worker) return;
      const m = ev.data;
      if (m.ready) return;
      const job = this.jobs.get(m.id);
      if (!job || m.id !== this.activeId) return;
      if (m.progress) {
        job.touch();
        try { job.onProgress?.(m.progress); } catch (e) { this.dispose(e); }
        return;
      }
      this.jobs.delete(m.id); clearTimeout(job.timer); this.activeId = null;
      if (m.ok) job.resolve(m.result); else job.reject(Object.assign(new Error(m.error), { detail: m.detail }));
      this.pump();
    };
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      if (this.worker === worker) this.dispose(new Error('The simulation worker failed: ' + (ev.message || 'unknown error')));
    };
  }

  failAll(err) {
    for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(err); }
    this.jobs.clear(); this.activeId = null;
  }

  dispose(err = new Error('The simulation was stopped')) {
    this.failAll(err);
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.key = '';
  }

  cancel() { this.dispose(Object.assign(new Error('Tournament stopped'), { name: 'AbortError' })); }

  pump() {
    if (this.activeId !== null || !this.worker || !this.jobs.size) return;
    const [id, job] = this.jobs.entries().next().value;
    this.activeId = id; job.touch();
    try { this.worker.postMessage({ ...job.msg, id }); }
    catch (e) { this.dispose(e); }
  }

  call(msg, { timeout = 20000, onProgress } = {}) {
    try { this.build(); } catch (e) { this.dispose(e); return Promise.reject(e); }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const job = { msg, resolve, reject, onProgress, timer: null };
      job.touch = () => {
        clearTimeout(job.timer);
        job.timer = setTimeout(() => this.dispose(new Error(`The simulation timed out (no answer for ${timeout / 1000}s): most likely a controller's tick() is stuck in an infinite loop`)), timeout);
      };
      this.jobs.set(id, job);
      // A queued job's watchdog starts only when the worker begins that job.
      this.pump();
    });
  }

  match(spec) { return this.call({ type: 'match', spec }, { timeout: 15000 }); }
  startLive(spec) { return this.call({ type: 'live-start', spec }, { timeout: 15000 }); }
  stepLive(ticks, input) { return this.call({ type: 'live-step', ticks, input }, { timeout: 8000 }); }
  endLive() { return this.call({ type: 'live-stop' }); }
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
