// Runs inside the blob Web Worker. `IY` (engine) and `__BOTS` (compiled
// controller factories) are defined by the code concatenated above this file.
(function () {
  var now = function () { return performance.now(); };
  var mk = function (id) { var f = __BOTS[id]; if (!f) throw new Error('unknown bot "' + id + '"'); return { id: id, factory: f }; };
  self.onmessage = function (ev) {
    var m = ev.data;
    try {
      if (m.type === 'match') {
        var res = IY.runMatch(Object.assign({}, m.spec, { teams: m.spec.teams.map(function (t) { return t.map(mk); }), now: now }));
        self.postMessage({ id: m.id, ok: true, result: res });
      } else if (m.type === 'describe') {
        var out = {};
        ['1v1', '2v2', '3v3'].forEach(function (mode) {
          var r = IY.runMatch({ map: 'proving', mode: mode, seed: 1, budget: m.budget, teams: [[mk(m.bot)], [mk('rookie')]], maxTime: 4, record: false, now: now });
          out[mode] = r.vehicles.filter(function (v) { return v.team === 0; }).map(function (v) {
            return { slot: v.slot, name: v.name, design: v.design, stats: v.designStats, errors: v.errors, cpu: v.cpu };
          });
        });
        self.postMessage({ id: m.id, ok: true, result: out });
      } else if (m.type === 'tournament') {
        m.schedule.forEach(function (s, i) {
          var r;
          try {
            var res = IY.runMatch({ map: s.map, mode: m.mode, seed: s.seed, swap: s.swap, budget: m.budget, teams: s.teams.map(function (t) { return t.map(mk); }), record: false, now: now });
            r = Object.assign({ i: i }, IY.tournamentResult(s, res));
          } catch (e) { r = Object.assign({ i: i }, IY.tournamentResult(s, null, e)); }
          self.postMessage({ id: m.id, progress: r });
        });
        self.postMessage({ id: m.id, ok: true, result: true });
      }
    } catch (e) {
      self.postMessage({ id: m.id, ok: false, error: e && e.message ? e.message : String(e), detail: e && e.detail });
    }
  };
  self.postMessage({ ready: true });
})();
