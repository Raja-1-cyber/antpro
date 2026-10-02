/* AntPro live-fix — NO UI redesign. Game logic only: no blink, auto decision, hierarchy */
(function () {
  'use strict';

  window.getGamesLive = function () {
    return { virtual: true, 'andar-bahar': true, lucky7: true, 'teen-patti': true, 'dragon-tiger': true };
  };

  function ensureBettingRound(key) {
    var timings = (typeof GAME_TIMINGS !== 'undefined' && GAME_TIMINGS[key]) || { duration: 30, lock: 4 };
    var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
    var r = all[key];
    var needNew = !r || (r.phase !== 'betting' && r.phase !== 'locked');
    if (!needNew && r && r.phase === 'betting') {
      var elapsed = Math.floor((Date.now() - (r.startedAt || Date.now())) / 1000);
      if (elapsed >= (r.duration || timings.duration) + 3) needNew = true;
    }
    if (needNew) {
      var secs = timings.duration || 30;
      all[key] = {
        roundId: 'R-' + Date.now().toString(36).toUpperCase(),
        phase: 'betting', timer: secs, duration: secs,
        lockSeconds: timings.lock != null ? timings.lock : 4,
        forcedWinner: null, startedAt: Date.now()
      };
      if (typeof setLiveRounds === 'function') setLiveRounds(all);
      try {
        fetch('/api/live-rounds/' + encodeURIComponent(key) + '/new', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: secs })
        }).catch(function () {});
      } catch (e) {}
    }
    return all[key];
  }

  window.bettingOpen = function (key) {
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) return false;
    ensureBettingRound(key);
    var r = typeof getLiveRounds === 'function' ? getLiveRounds()[key] : null;
    return !!(r && r.phase === 'betting');
  };

  window.canPlaceBet = function (key) {
    if (typeof state !== 'undefined' && state.user && typeof isBlocked === 'function' && isBlocked(state.user.id)) {
      if (typeof toast === 'function') toast('Account blocked/suspended');
      return false;
    }
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) {
      if (typeof toast === 'function') toast('Result aa raha hai — wait');
      return false;
    }
    ensureBettingRound(key);
    if (typeof state === 'undefined') return true;
    state.resolving = state.resolving || {};
    state.resolving[key] = true;
    return true;
  };

  /* Controller force if set, else natural card result, else random */
  window.smartDecision = function (key, options, natural) {
    var forced = null;
    try {
      if (typeof getForced === 'function') forced = getForced(key);
      if (!forced) {
        var r = typeof getLiveRounds === 'function' ? getLiveRounds()[key] : null;
        forced = r && r.forcedWinner;
      }
    } catch (e) {}
    if (forced && options && options.indexOf(forced) >= 0) {
      try {
        var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
        if (all[key]) {
          all[key].forcedWinner = null;
          if (typeof setLiveRounds === 'function') setLiveRounds(all);
        }
      } catch (e2) {}
      return forced;
    }
    if (natural != null && options && options.indexOf(natural) >= 0) return natural;
    return options[Math.floor(Math.random() * options.length)];
  };

  function isDealing() {
    if (typeof state === 'undefined') return false;
    return !!(state.andarSpinning || state.l7Spin || state.tpSpin || state.dtSpin);
  }
  function isResolvingAny() {
    if (typeof state === 'undefined' || !state.resolving) return false;
    return Object.keys(state.resolving).some(function (k) { return state.resolving[k]; });
  }

  function installRenderGuard() {
    if (typeof window.render !== 'function' || window.render.__antproGuard) return;
    var orig = window.render;
    window.render = function () {
      if (isResolvingAny() && !isDealing() && !window.render._allow) return;
      return orig.apply(this, arguments);
    };
    window.render.__antproGuard = true;
  }
  setTimeout(installRenderGuard, 0);
  setTimeout(installRenderGuard, 500);

  window.syncSharedRounds = async function () {
    if (isResolvingAny() || isDealing()) return;
    try {
      var r = await fetch('/api/live-rounds', { cache: 'no-store' });
      if (!r.ok) return;
      var data = await r.json();
      if (typeof state !== 'undefined') state.sharedRounds = data;
      try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {}
    } catch (e) {}
  };
  setInterval(function () {
    if (typeof window.syncSharedRounds === 'function') window.syncSharedRounds();
  }, 1000);

  var _finish = typeof finishRound === 'function' ? finishRound : null;
  window.finishRound = function (key) {
    if (_finish) _finish(key);
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.resolving) state.resolving[key] = false;
      ensureBettingRound(key);
      if (typeof window.render === 'function') {
        window.render._allow = true;
        try { window.render(); } finally { window.render._allow = false; }
      }
    }, 3500);
  };

  function safeFind(id) {
    try { return typeof findUserById === 'function' ? findUserById(id) : null; } catch (e) { return null; }
  }
  window.applyCascade = function (bet) {
    if (!bet || bet.rolled_back) return;
    if (typeof creditChips !== 'function') return;
    var playerId = bet.player || bet.playerId;
    if (!playerId) return;
    var pl = safeFind(playerId);
    if (!pl || pl.role !== 'player') return;
    var agent = pl.agentId ? safeFind(pl.agentId) : null;
    var master = agent && agent.masterId ? safeFind(agent.masterId) : null;
    var superId = (master && (master.superId || master.superMasterId)) || (agent && (agent.superId || agent.superMasterId)) || 'SUPER';
    var superM = safeFind(superId);
    var amt = Math.abs(Number(bet.amt) || 0);
    var profit = Math.abs(Number(bet.profit) || 0);
    var won = bet.status === 'won';
    var lost = bet.status === 'lost';
    if (!won && !lost) return;
    var bookPnL = won ? -profit : amt;
    var aPct = Math.min(100, Math.max(0, Number(agent && agent.share) || 0));
    var mPct = Math.min(100, Math.max(0, Number(master && master.share) || 0));
    if (mPct < aPct) mPct = aPct;
    var agentCut = Math.floor(bookPnL * aPct / 100);
    var masterCut = Math.floor(bookPnL * (mPct - aPct) / 100);
    var superCut = bookPnL - agentCut - masterCut;
    var tag = (bet.type || 'GAME') + ' ' + (bet.team || '') + ' ' + playerId;
    if (agent && agentCut) creditChips(agent.id, agentCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    if (master && masterCut) creditChips(master.id, masterCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    if (superM && superCut) creditChips(superM.id, superCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    var cPct = Number(agent && agent.commission) || 0;
    if (agent && cPct > 0 && amt > 0) {
      var comm = Math.floor(amt * cPct / 100);
      if (comm) creditChips(agent.id, comm, 'Commission ' + tag);
    }
  };

  window.pushSettledBet = function (partial) {
    var bet = {
      id: typeof uid === 'function' ? uid() : ('B' + Date.now()),
      team: partial.team || partial.side || '',
      type: partial.type || '',
      rate: Number(partial.rate) || 0,
      amt: Math.abs(Number(partial.amt) || 0),
      profit: Math.abs(Number(partial.profit) || 0),
      ts: Date.now(),
      player: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      playerId: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      status: partial.status || 'pending',
      result: partial.result || '',
      rolled_back: false
    };
    if (bet.status === 'won' && bet.rate > 1 && !(partial.profit > 0)) {
      bet.profit = Math.round(bet.amt * (bet.rate - 1));
    }
    if (typeof state !== 'undefined') {
      state.activeBets = state.activeBets || [];
      state.activeBets.unshift(bet);
      if (typeof saveBets === 'function') saveBets();
    }
    if (bet.status === 'won' || bet.status === 'lost') window.applyCascade(bet);
    return bet;
  };

  setTimeout(function () {
    ['andar-bahar', 'lucky7', 'teen-patti', 'dragon-tiger'].forEach(function (k) {
      try { ensureBettingRound(k); } catch (e) {}
    });
    console.log('[AntPro] logic fix only — no UI change, no blink, auto decision');
  }, 300);

  console.log('[AntPro] live-fix minimal');
})();
