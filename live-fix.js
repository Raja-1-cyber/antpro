/* AntPro live-fix.js — hierarchy chips + controller + instant settle */
(function () {
  'use strict';

  function safeFind(id) {
    try { return typeof findUserById === 'function' ? findUserById(id) : null; } catch (e) { return null; }
  }

  // Correct multi-level cascade: Client → Agent → Master → Super Master
  // bookPnL: player LOST → book gains stake; player WON → book pays profit (negative)
  window.applyCascade = function applyCascade(bet) {
    if (!bet || bet.rolled_back) return;
    if (typeof creditChips !== 'function') return;

    const playerId = bet.player || bet.playerId;
    if (!playerId) return;
    const pl = safeFind(playerId);
    if (!pl || pl.role !== 'player') return;

    const agent = pl.agentId ? safeFind(pl.agentId) : null;
    const master = agent && agent.masterId ? safeFind(agent.masterId) : null;
    const superId = (master && (master.superId || master.superMasterId))
      || (agent && (agent.superId || agent.superMasterId))
      || 'SUPER';
    const superM = safeFind(superId);

    const amt = Number(bet.amt) || 0;
    const profit = Number(bet.profit) || 0;
    const won = bet.status === 'won';
    const lost = bet.status === 'lost';
    if (!won && !lost) return;

    // Book P/L from this bet (coins)
    const bookPnL = won ? -Math.abs(profit) : Math.abs(amt);

    let agentSharePct = Math.min(100, Math.max(0, Number(agent && agent.share) || 0));
    let masterSharePct = Math.min(100, Math.max(0, Number(master && master.share) || 0));
    if (masterSharePct < agentSharePct) masterSharePct = agentSharePct;

    const agentCut = Math.floor(bookPnL * (agentSharePct / 100));
    const masterCut = Math.floor(bookPnL * ((masterSharePct - agentSharePct) / 100));
    const superCut = bookPnL - agentCut - masterCut;

    const lines = [];
    const tag = (bet.type || 'GAME') + ' ' + (bet.team || '') + ' ' + playerId;

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

    // Match commission on turnover (stake) to agent
    const agentCommPct = Number(agent && agent.commission) || 0;
    if (agent && agentCommPct > 0 && amt > 0) {
      const comm = Math.floor(amt * (agentCommPct / 100));
      if (comm) {
        creditChips(agent.id, comm, 'Commission ' + tag);
        lines.push({ who: agent.id, role: 'agent', amount: comm, kind: 'commission' });
      }
    }

    if (lines.length && typeof loadCommissions === 'function' && typeof saveCommissions === 'function') {
      const comms = loadCommissions();
      comms.unshift({
        betId: bet.id,
        player: playerId,
        market: bet.type,
        status: bet.status,
        amt: amt,
        profit: profit,
        bookPnL: bookPnL,
        lines: lines,
        ts: Date.now()
      });
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

    // Instant hierarchy refresh for open staff screens
    try {
      if (typeof state !== 'undefined' && state.user && state.user.role && state.user.role !== 'player') {
        if (typeof render === 'function') render();
      }
    } catch (e) {}
  };

  // Ensure settled bets always cascade + keep player chips in users tree
  window.pushSettledBet = function pushSettledBetFixed(partial) {
    const bet = {
      id: typeof uid === 'function' ? uid() : ('B' + Date.now()),
      team: partial.team || partial.side || '',
      type: partial.type || '',
      rate: partial.rate || 0,
      amt: Number(partial.amt) || 0,
      profit: Number(partial.profit) || 0,
      ts: Date.now(),
      player: partial.player || (state.user && state.user.id) || 'Player',
      playerId: partial.player || (state.user && state.user.id) || 'Player',
      status: partial.status || 'pending',
      result: partial.result || '',
      rolled_back: false
    };
    if (typeof state !== 'undefined') {
      state.activeBets = state.activeBets || [];
      state.activeBets.unshift(bet);
      if (typeof saveBets === 'function') saveBets();
    }
    if (bet.status === 'won' || bet.status === 'lost') {
      window.applyCascade(bet);
    }
    return bet;
  };

  // Controller force winner → server + all clients via shared rounds
  window.forceWinner = function forceWinnerFixed(gameKey, side) {
    const all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
    const r = all[gameKey] || (typeof ensureRound === 'function' ? ensureRound(gameKey) : null);
    if (!r) return;
    r.forcedWinner = side;
    if (r.phase !== 'betting') r.phase = 'forced';
    all[gameKey] = r;
    if (typeof setLiveRounds === 'function') setLiveRounds(all);
    fetch('/api/live-rounds/' + encodeURIComponent(gameKey) + '/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side: side })
    }).catch(function () {});
    if (typeof toast === 'function') toast(gameKey + ' → FORCE ' + side);
    if (typeof render === 'function') render();
  };

  // Staff hierarchy: poll users so agent/master/super see chip changes live
  var hierarchyPollBusy = false;
  async function pollHierarchyUsers() {
    if (hierarchyPollBusy) return;
    if (typeof state === 'undefined' || !state.user) return;
    var role = state.user.role;
    if (role !== 'agent' && role !== 'master' && role !== 'supermaster') return;
    hierarchyPollBusy = true;
    try {
      var r = await fetch('/api/users', { cache: 'no-store' });
      var d = await r.json();
      if (d && d.ok && d.users && d.users.superMaster) {
        try { localStorage.setItem('antpro_users_v2', JSON.stringify(d.users)); } catch (e) {}
        var me = null;
        if (role === 'agent' && d.users.agents) me = d.users.agents[state.user.id];
        if (role === 'master' && d.users.masters) me = d.users.masters[state.user.id];
        if (role === 'supermaster') me = d.users.superMaster;
        if (me && typeof me.chips === 'number') {
          state.user.chips = me.chips;
          try { sessionStorage.setItem('antpro_user', JSON.stringify(state.user)); } catch (e) {}
        }
        var staffViews = ['home', 'agent', 'hierarchy', 'hierarchy-details', 'clientdetails', 'ledger', 'pnl', 'commission', 'livebets', 'statement', 'usermgmt'];
        if (staffViews.indexOf(state.view) >= 0 && typeof render === 'function') render();
      }
    } catch (e) {}
    hierarchyPollBusy = false;
  }
  setInterval(pollHierarchyUsers, 2500);
  setTimeout(pollHierarchyUsers, 400);

  // Controller / admin: poll shared rounds so FORCE stays in sync
  var ctrlPollBusy = false;
  async function pollControllerRounds() {
    if (ctrlPollBusy) return;
    if (typeof state === 'undefined' || state.view !== 'admin') return;
    ctrlPollBusy = true;
    try {
      var r = await fetch('/api/live-rounds', { cache: 'no-store' });
      if (r.ok) {
        var data = await r.json();
        state.sharedRounds = data;
        try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {}
        if (typeof render === 'function') render();
      }
    } catch (e) {}
    ctrlPollBusy = false;
  }
  setInterval(pollControllerRounds, 1000);

  console.log('[AntPro] live-fix loaded · cascade + controller + hierarchy poll OK');
})();
