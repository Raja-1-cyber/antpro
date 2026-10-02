/* AntPro live-fix — big countdown, card flip, auto decision, hierarchy math */
(function () {
  'use strict';

  if (!document.getElementById('antpro-live-ui')) {
    var st = document.createElement('style');
    st.id = 'antpro-live-ui';
    st.textContent = [
      '.game-top{display:flex!important;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px!important;background:#111!important}',
      '.game-top .g-title{font-size:15px!important;font-weight:800;color:#ffe566!important;letter-spacing:.3px}',
      '.game-top .g-round{font-size:10px;color:#aaa}',
      '.game-countdown{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:6px}',
      '.game-countdown .cd-label{font-size:11px;font-weight:700;color:#8b949e;text-transform:uppercase}',
      '.game-countdown .cd-num{min-width:72px;height:56px;padding:0 14px;border-radius:12px;display:grid;place-items:center;font-size:36px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#2a2a2a,#111);color:#ffe566;border:2px solid #f0c040;box-shadow:0 0 18px #f0c04055, inset 0 1px 0 #fff2}',
      '.game-countdown .cd-num.warn{color:#ff6b6b;border-color:#ff6b6b;box-shadow:0 0 18px #ff6b6b55}',
      '.game-countdown .cd-num.lock{color:#58a6ff;border-color:#58a6ff;box-shadow:0 0 18px #58a6ff55}',
      '.game-countdown .cd-phase{font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;background:#21262d;color:#c9d1d9}',
      '.game-countdown .cd-phase.bet{background:#0d3b1e;color:#3fb950}',
      '.game-countdown .cd-phase.locked{background:#3d1f00;color:#f0c040}',
      '.game-countdown .cd-phase.result{background:#3d0000;color:#f85149}',
      '.p-card{perspective:600px;transform-style:preserve-3d;position:relative;width:52px!important;height:72px!important;font-size:18px!important;border-radius:6px!important;transition:transform .55s ease}',
      '.p-card.flip-in{animation:cardFlipIn .65s ease both}',
      '.p-card.ghost{background:linear-gradient(145deg,#2a2a2a,#1a1a1a)!important;color:#555!important;border:1px dashed #444}',
      '@keyframes cardFlipIn{0%{transform:rotateY(90deg) scale(.85);opacity:0}55%{transform:rotateY(-12deg) scale(1.04);opacity:1}100%{transform:rotateY(0) scale(1);opacity:1}}',
      '.card-pair{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}',
      '.live-side-label{font-size:12px;font-weight:800;color:#f0c040;margin:4px 0}',
      '.game-live-cards{display:flex;flex-direction:column;align-items:center;gap:6px;z-index:2;position:relative}'
    ].join('\n');
    document.head.appendChild(st);
  }

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
      if (elapsed >= (r.duration || timings.duration) + 2) needNew = true;
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
      if (typeof toast === 'function') toast('Account blocked/suspended'); return false;
    }
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) {
      if (typeof toast === 'function') toast('Result aa raha hai — wait'); return false;
    }
    ensureBettingRound(key);
    if (typeof state === 'undefined') return true;
    state.resolving = state.resolving || {};
    state.resolving[key] = true;
    return true;
  };

  window.gameTop = function (title, round) {
    var keyMap = { 'ANDAR BAHAR': 'andar-bahar', 'LUCKY 7': 'lucky7', 'TEEN PATTI': 'teen-patti', 'DRAGON TIGER': 'dragon-tiger' };
    var key = keyMap[title];
    var r = key && typeof ensureRound === 'function' ? ensureRound(key) : null;
    var secs = key && typeof roundSeconds === 'function' ? roundSeconds(key) : (r && r.timer) || 0;
    var phase = (r && r.phase) || 'betting';
    var phaseLabel = phase === 'betting' ? 'BETTING' : phase === 'locked' ? 'LOCKED' : phase === 'result' ? 'RESULT' : String(phase).toUpperCase();
    var phaseClass = phase === 'betting' ? 'bet' : phase === 'locked' ? 'locked' : phase === 'result' ? 'result' : '';
    var numClass = secs <= 5 ? 'warn' : (phase === 'locked' ? 'lock' : '');
    return '<div class="game-top">' +
      '<span class="g-title">' + title + '</span>' +
      '<span class="g-round">Round : ' + (round || (r && r.roundId) || '—') + '</span>' +
      '<div class="game-countdown">' +
        '<span class="cd-label">Time</span>' +
        '<span class="cd-num ' + numClass + '">' + secs + '</span>' +
        '<span class="cd-phase ' + phaseClass + '">' + phaseLabel + '</span>' +
      '</div></div>';
  };

  window.cardHTML = function (c) {
    if (!c) return '<div class="p-card ghost">?</div>';
    return '<div class="p-card ' + (c.s || '') + ' flip-in">' + c.v + '<br><small>' + (c.suit || '') + '</small></div>';
  };

  /* Auto decision: controller force if set, else natural/random */
  window.smartDecision = function (key, options, natural) {
    var forced = null;
    try {
      if (typeof getForced === 'function') forced = getForced(key);
      if (!forced) {
        var r = typeof getLiveRounds === 'function' ? getLiveRounds()[key] : null;
        forced = r && (r.forcedWinner || r.resultSide || r.result);
      }
    } catch (e) {}
    if (forced && options && options.indexOf(forced) >= 0) {
      try {
        var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
        if (all[key]) { all[key].forcedWinner = null; if (typeof setLiveRounds === 'function') setLiveRounds(all); }
      } catch (e2) {}
      return forced;
    }
    if (natural && options && options.indexOf(natural) >= 0) return natural;
    return options[Math.floor(Math.random() * options.length)];
  };

  var _origSync = typeof syncSharedRounds === 'function' ? syncSharedRounds : null;
  window.syncSharedRounds = async function () {
    if (typeof state !== 'undefined' && state.resolving) {
      var busy = Object.keys(state.resolving).some(function (k) { return state.resolving[k]; });
      if (busy) return;
    }
    if (_origSync) { try { await _origSync(); } catch (e) {} }
    else {
      try {
        var r = await fetch('/api/live-rounds', { cache: 'no-store' });
        if (!r.ok) return;
        var data = await r.json();
        if (typeof state !== 'undefined') state.sharedRounds = data;
        try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {}
      } catch (e) {}
    }
  };

  var _finish = typeof finishRound === 'function' ? finishRound : null;
  window.finishRound = function (key) {
    if (_finish) _finish(key);
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.resolving) state.resolving[key] = false;
      ensureBettingRound(key);
      if (typeof render === 'function') render();
    }, 3500);
  };

  function safeFind(id) {
    try { return typeof findUserById === 'function' ? findUserById(id) : null; } catch (e) { return null; }
  }

  window.applyCascade = function (bet) {
    if (!bet || bet.rolled_back) return;
    if (typeof creditChips !== 'function') return;
    var playerId = bet.player || bet.playerId; if (!playerId) return;
    var pl = safeFind(playerId); if (!pl || pl.role !== 'player') return;
    var agent = pl.agentId ? safeFind(pl.agentId) : null;
    var master = agent && agent.masterId ? safeFind(agent.masterId) : null;
    var superId = (master && (master.superId || master.superMasterId)) || (agent && (agent.superId || agent.superMasterId)) || 'SUPER';
    var superM = safeFind(superId);
    var amt = Math.abs(Number(bet.amt) || 0);
    var profit = Math.abs(Number(bet.profit) || 0);
    var won = bet.status === 'won'; var lost = bet.status === 'lost';
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
    if (typeof addStatement === 'function') {
      addStatement({ type: 'BET', userId: playerId, amount: won ? profit : -amt,
        note: (bet.type || '') + ' ' + (bet.team || '') + ' ' + (bet.status || ''),
        betId: bet.id, market: bet.type, side: bet.team, status: bet.status });
    }
  };

  window.pushSettledBet = function (partial) {
    var bet = {
      id: typeof uid === 'function' ? uid() : ('B' + Date.now()),
      team: partial.team || partial.side || '', type: partial.type || '',
      rate: Number(partial.rate) || 0, amt: Math.abs(Number(partial.amt) || 0),
      profit: Math.abs(Number(partial.profit) || 0), ts: Date.now(),
      player: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      playerId: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      status: partial.status || 'pending', result: partial.result || '', rolled_back: false
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
    if (typeof render === 'function') render();
    console.log('[AntPro] big countdown + card flip + auto decision ON');
  }, 400);

  setInterval(function () {
    if (typeof window.syncSharedRounds === 'function') window.syncSharedRounds();
  }, 1000);

  console.log('[AntPro] live-fix UI · countdown + flip + auto result');
})();
