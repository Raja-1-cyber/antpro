/* force-bridge v2 — force + shared rounds + inject forcedWinner into API responses */
(function () {
  'use strict';
  var forceCache = {}; // gameKey -> { side, until }

  function patchSmart() {
    var _smart = window.smartDecision;
    if (typeof _smart !== 'function' || _smart.__forceBridge) return;
    window.smartDecision = function (key, options, natural) {
      try {
        var fw = null;
        if (forceCache[key] && forceCache[key].until > Date.now()) fw = forceCache[key].side;
        if (!fw && typeof state !== 'undefined' && state.sharedRounds && state.sharedRounds[key]) {
          fw = state.sharedRounds[key].forcedWinner || state.sharedRounds[key].result;
        }
        if (!fw && typeof getLiveRounds === 'function') {
          var r = getLiveRounds()[key];
          fw = r && (r.forcedWinner || (r.phase === 'result' && r.result));
        }
        if (fw && options && options.indexOf(fw) >= 0) {
          if (!((key === 'andar-bahar' || key === 'teen-patti') && fw === 'Tie')) return fw;
        }
      } catch (e) {}
      return _smart.apply(this, arguments);
    };
    window.smartDecision.__forceBridge = true;
  }
  patchSmart();
  setTimeout(patchSmart, 500);
  setTimeout(patchSmart, 1500);

  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || 'GET').toUpperCase();
    var p = _fetch.apply(this, arguments);
    if (method === 'POST' && /\/api\/live-rounds\/[^/]+\/force/.test(url)) {
      return p.then(function (res) {
        var clone = res.clone();
        clone.json().then(function (data) {
          try {
            if (res.ok && data) {
              var m = url.match(/\/api\/live-rounds\/([^/]+)\/force/);
              var key = m ? decodeURIComponent(m[1]) : null;
              var side = (data.forced || (data.round && data.round.forcedWinner) || null);
              if (!side && init && init.body) {
                try { side = JSON.parse(init.body).side; } catch (e) {}
              }
              if (key && side) {
                forceCache[key] = { side: side, until: Date.now() + 20000 };
                if (typeof state !== 'undefined') {
                  state.sharedRounds = state.sharedRounds || {};
                  state.sharedRounds[key] = Object.assign({}, state.sharedRounds[key] || {}, { forcedWinner: side, result: side });
                }
                try {
                  if (typeof getLiveRounds === 'function' && typeof setLiveRounds === 'function') {
                    var all = getLiveRounds();
                    all[key] = Object.assign({}, all[key] || {}, { forcedWinner: side });
                    setLiveRounds(all);
                  }
                } catch (e2) {}
              }
            }
          } catch (e3) {}
        }).catch(function () {});
        return res;
      });
    }
    if (method === 'GET' && url.indexOf('/api/live-rounds') >= 0 && url.indexOf('/force') < 0) {
      return p.then(function (res) {
        if (!res.ok) return res;
        return res.clone().json().then(function (data) {
          if (!data || typeof data !== 'object') return res;
          Object.keys(forceCache).forEach(function (k) {
            if (forceCache[k].until > Date.now() && data[k]) {
              data[k].forcedWinner = forceCache[k].side;
              if (data[k].phase === 'result' || data[k].phase === 'revealing') data[k].result = forceCache[k].side;
            }
          });
          try {
            if (typeof state !== 'undefined') state.sharedRounds = data;
          } catch (e) {}
          return new Response(JSON.stringify(data), {
            status: res.status,
            statusText: res.statusText,
            headers: { 'Content-Type': 'application/json' }
          });
        }).catch(function () { return res; });
      });
    }
    return p;
  };

  setInterval(function () {
    try {
      if (typeof state === 'undefined') return;
      var v = state.view || '';
      if (['andar', 'lucky7', 'teenpatti', 'dragontiger', 'admin'].indexOf(v) < 0 && !state.adminAuthed) return;
      _fetch('/api/live-rounds', { cache: 'no-store' }).then(function (res) {
        return res.ok ? res.json() : null;
      }).then(function (data) {
        if (!data) return;
        Object.keys(forceCache).forEach(function (k) {
          if (forceCache[k].until > Date.now() && data[k]) data[k].forcedWinner = forceCache[k].side;
        });
        state.sharedRounds = data;
        try {
          if (typeof getLiveRounds === 'function' && typeof setLiveRounds === 'function') {
            var local = getLiveRounds();
            Object.keys(data).forEach(function (k) {
              if (!local[k]) local[k] = {};
              if (data[k].roundId) local[k].roundId = data[k].roundId;
              if (data[k].phase) local[k].phase = data[k].phase;
              if (data[k].timer != null) local[k].timer = data[k].timer;
              if (data[k].startedAt) local[k].startedAt = data[k].startedAt;
              if (data[k].forcedWinner) local[k].forcedWinner = data[k].forcedWinner;
              if (data[k].duration) local[k].duration = data[k].duration;
              if (data[k].lockSeconds != null) local[k].lockSeconds = data[k].lockSeconds;
            });
            setLiveRounds(local);
          }
          localStorage.setItem('antpro_live_rounds', JSON.stringify(data));
        } catch (e2) {}
      }).catch(function () {});
    } catch (e) {}
  }, 1000);

  window.__antproForceCache = forceCache;
  console.log('[AntPro] force-bridge v2 ready');
})();
