/* AntPro live-fix.js — games always LIVE + hierarchy cascade */
(function () {
  'use strict';

  /* ========== GAMES ALWAYS PLAYABLE ========== */

  // Never show games as offline
  window.getGamesLive = function () {
    return {
      virtual: true,
      'andar-bahar': true,
      lucky7: true,
      'teen-patti': true,
      'dragon-tiger': true
    };
  };

  // If round is locked/result/closed → immediately open a fresh betting round
  function ensureBettingRound(key) {
    var timings = (typeof GAME_TIMINGS !== 'undefined' && GAME_TIMINGS[key]) || { duration: 30, lock: 4 };
    var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
    var r = all[key];
    var needNew = !r || r.phase !== 'betting';
    if (!needNew && r) {
      var elapsed = Math.floor((Date.now() - (r.startedAt || Date.now())) / 1000);
      var lockAt = Math.max(0, (r.duration || timings.duration) - (r.lockSeconds != null ? r.lockSeconds : timings.lock));
      if (elapsed >= lockAt) needNew = true;
    }
    if (needNew) {
      var secs = timings.duration || 30;
      all[key] = {
        roundId: 'R-' + Date.now().toString(36).toUpperCase(),
        phase: 'betting',
        timer: secs,
        duration: secs,
        lockSeconds: timings.lock != null ? timings.lock : 4,
        forcedWinner: null,
        startedAt: Date.now()
      };
      if (typeof setLiveRounds === 'function') setLiveRounds(all);
      try {
        fetch('/api/live-rounds/' + encodeURIComponent(key) + '/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: secs })
        }).catch(function () {});
      } catch (e) {}
    }
    return all[key];
  }

  // Always treat betting as open for the 4 live games (unless resolving animation)
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
      if (typeof toast === 'function') toast('Current round result aa raha hai — wait');
      return false;
    }
    ensureBettingRound(key);
    if (typeof state === 'undefined') return true;
    state.resolving = state.resolving || {};
    state.resolving[key] = true;
    return true;
  };

  // Don't let server sync kill a mid-game bet
  var _origSync = typeof syncSharedRounds === 'function' ? syncSharedRounds : null;
  window.syncSharedRounds = async function () {
    if (typeof state !== 'undefined' && state.resolving) {
      var busy = Object.keys(state.resolving).some(function (k) { return state.resolving[k]; });
      if (busy) return;
    }
    if (_origSync) {
      try { await _origSync(); } catch (e) {}
    } else {
      try {
        var r = await fetch('/api/live-rounds', { cache: 'no-store' });
        if (!r.ok) return;
        var data = await r.json();
        if (typeof state !== 'undefined') state.sharedRounds = data;
        try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {}
      } catch (e) {}
    }
  };

  // After result, unlock + open next round quickly
  var _finish = typeof finishRound === 'function' ? finishRound : null;
  window.finishRound = function (key) {
    if (_finish) _finish(key);
    else {
      var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
      var r = all[key] || {};
      r.phase = 'result';
      r.timer = 0;
      r.resultAt = Date.now();
      all[key] = r;
      if (typeof setLiveRounds === 'function') setLiveRounds(all);
    }
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.resolving) state.resolving[key] = false;
      ensureBettingRound(key);
      if (typeof render === 'function') render();
    }, 3500);
  };

  /* ========== HIERARCHY CASCADE (chips) ========== */

  function safeFind(id) {
    try { return typeof findUserById === 'function' ? findUserById(id) : null; } catch (e) { return null; }
  }

  window.applyCascade = function applyCascade(bet) {
    if (!bet || bet.rolled_back) return;
    if (typeof creditChips !== 'function') return;

    var playerId = bet.player || bet.playerId;
    if (!playerId) return;
    var pl = safeFind(playerId);
    if (!pl || pl.role !== 'player') return;

    var agent = pl.agentId ? safeFind(pl.agentId) : null;
    var master = agent && agent.masterId ? safeFind(agent.masterId) : null;
    var superId = (master && (master.superId || master.superMasterId))
      || (agent && (agent.superId || agent.superMasterId))
      || 'SUPER';
    var superM = safeFind(superId);

    var amt = Number(bet.amt) || 0;
    var profit = Number(bet.profit) || 0;
    var won = bet.status === 'won';
    var lost = bet.status === 'lost';
    if (!won && !lost) return;

    var bookPnL = won ? -Math.abs(profit) : Math.abs(amt);
    var agentSharePct = Math.min(100, Math.max(0, Number(agent && agent.share) || 0));
    var masterSharePct = Math.min(100, Math.max(0, Number(master && master.share) || 0));
    if (masterSharePct < agentSharePct) masterSharePct = agentSharePct;

    var agentCut = Math.floor(bookPnL * (agentSharePct / 100));
    var masterCut = Math.floor(bookPnL * ((masterSharePct - agentSharePct) / 100));
    var superCut = bookPnL - agentCut - masterCut;
    var lines = [];
    var tag = (bet.type || 'GAME') + ' ' + (bet.team || '') + ' ' + playerId;

    if (agent && agentCut) {
      creditChips(agent.id, agentCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
      lines.push({ who: agent.id, role: 'agent', amount: agentCut, kind: won ? 'share_win' : 'share_loss' });
    }
    if (master && masterCut) {
      creditChips(master.id, masterCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
      lines.push({ who: master.id, role: 'master', amount: masterCut, kind: won ? 'share_win' : 'share_loss' });
    }
    if (superM && superCut) {
      creditChips(superM.id, superCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
      lines.push({ who: superM.id, role: 'supermaster', amount: superCut, kind: won ? 'share_win' : 'share_loss' });
    }

    var agentCommPct = Number(agent && agent.commission) || 0;
    if (agent && agentCommPct > 0 && amt > 0) {
      var comm = Math.floor(amt * (agentCommPct / 100));
      if (comm) {
        creditChips(agent.id, comm, 'Commission ' + tag);
        lines.push({ who: agent.id, role: 'agent', amount: comm, kind: 'commission' });
      }
    }

    if (lines.length && typeof loadCommissions === 'function' && typeof saveCommissions === 'function') {
      var comms = loadCommissions();
      comms.unshift({ betId: bet.id, player: playerId, market: bet.type, status: bet.status, amt: amt, profit: profit, bookPnL: bookPnL, lines: lines, ts: Date.now() });
      saveCommissions(comms);
    }

    if (typeof addStatement === 'function') {
      addStatement({
        type: 'BET',
        userId: playerId,
        amount: won ? Math.abs(profit) : -Math.abs(amt),
        note: (bet.type || '') + ' ' + (bet.team || '') + ' ' + (bet.status || ''),
        betId: bet.id,
        market: bet.type,
        side: bet.team,
        status: bet.status
      });
    }
  };

  window.pushSettledBet = function (partial) {
    var bet = {
      id: typeof uid === 'function' ? uid() : ('B' + Date.now()),
      team: partial.team || partial.side || '',
      type: partial.type || '',
      rate: partial.rate || 0,
      amt: Number(partial.amt) || 0,
      profit: Number(partial.profit) || 0,
      ts: Date.now(),
      player: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      playerId: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      status: partial.status || 'pending',
      result: partial.result || '',
      rolled_back: false
    };
    if (typeof state !== 'undefined') {
      state.activeBets = state.activeBets || [];
      state.activeBets.unshift(bet);
      if (typeof saveBets === 'function') saveBets();
    }
    if (bet.status === 'won' || bet.status === 'lost') window.applyCascade(bet);
    return bet;
  };

  // Kick all 4 games into betting phase on load
  setTimeout(function () {
    var keys = ['andar-bahar', 'lucky7', 'teen-patti', 'dragon-tiger'];
    keys.forEach(function (k) { try { ensureBettingRound(k); } catch (e) {} });
    console.log('[AntPro] games LIVE — bet anytime');
  }, 300);

  setInterval(function () {
    if (typeof state === 'undefined' || !state.user) return;
    var role = state.user.role;
    if (role !== 'agent' && role !== 'master' && role !== 'supermaster') return;
    fetch('/api/users', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok && d.users) {
        try { localStorage.setItem('antpro_users_v2', JSON.stringify(d.users)); } catch (e) {}
      }
    }).catch(function () {});
  }, 3000);

  console.log('[AntPro] live-fix loaded · games always open');
})();
