/* force-bridge — apply controller force even when client/server roundId differs
   Does NOT change timers, rates, or settlement math. */
(function () {
  'use strict';

  var _smart = window.smartDecision;
  if (typeof _smart === 'function' && !_smart.__forceBridge) {
    window.smartDecision = function (key, options, natural) {
      try {
        var fw = null;
        if (typeof state !== 'undefined' && state.sharedRounds && state.sharedRounds[key]) {
          fw = state.sharedRounds[key].forcedWinner || state.sharedRounds[key].result;
        }
        if (!fw && typeof getLiveRounds === 'function') {
          var r = getLiveRounds()[key];
          fw = r && (r.forcedWinner || (r.phase === 'result' && r.result));
        }
        if (fw && options && options.indexOf(fw) >= 0) {
          if (!((key === 'andar-bahar' || key === 'teen-patti') && fw === 'Tie')) {
            return fw;
          }
        }
      } catch (e) {}
      return _smart.apply(this, arguments);
    };
    window.smartDecision.__forceBridge = true;
  }

  setInterval(function () {
    try {
      if (typeof state === 'undefined' || !state.loggedIn) return;
      var v = state.view || '';
      if (['andar', 'lucky7', 'teenpatti', 'dragontiger', 'admin'].indexOf(v) < 0) return;
      fetch('/api/live-rounds', { cache: 'no-store' }).then(function (res) {
        return res.ok ? res.json() : null;
      }).then(function (data) {
        if (!data) return;
        state.sharedRounds = data;
        try {
          if (typeof getLiveRounds === 'function' && typeof setLiveRounds === 'function') {
            var local = getLiveRounds();
            Object.keys(data).forEach(function (k) {
              if (!local[k]) local[k] = {};
              if (data[k].forcedWinner) local[k].forcedWinner = data[k].forcedWinner;
              if (data[k].roundId) local[k].serverRoundId = data[k].roundId;
              if (data[k].phase) local[k].serverPhase = data[k].phase;
              if (data[k].timer != null) local[k].serverTimer = data[k].timer;
            });
            setLiveRounds(local);
          }
          localStorage.setItem('antpro_live_rounds', JSON.stringify(data));
        } catch (e2) {}
      }).catch(function () {});
    } catch (e) {}
  }, 1000);

  console.log('[AntPro] force-bridge ready');
})();
