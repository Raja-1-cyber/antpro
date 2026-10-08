/* AntPro staff — agent/supermaster/master: live + history client bets */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;
  state.staffBets = state.staffBets || [];
  state.staffLiveBets = state.staffLiveBets || [];
  var staffBusy = false;

  function mapBet(b) {
    return {
      id: b.id || ('S' + (b.ts || Date.now())),
      team: b.side || b.team || '',
      type: b.type || b.gameKey || '',
      rate: Number(b.rate) || 0,
      amt: Number(b.amt) || 0,
      profit: Number(b.profit) || 0,
      ts: b.ts || Date.now(),
      player: b.player || '',
      playerId: b.player || '',
      status: b.status || (b.result ? String(b.result).toLowerCase() : 'open'),
      result: b.result || (b.status === 'open' ? 'LIVE' : ''),
      gameKey: b.gameKey || '',
      match: b.gameKey || b.type || 'Casino',
      roundId: b.roundId || '',
      matchName: b.matchName || b.match || '',
      sessionKey: b.sessionKey || '',
      sessionLine: b.sessionLine || '',
      settledAt: b.settledAt || 0
    };
  }

  window.syncStaffBets = async function () {
    var role = state.user && state.user.role;
    if (!state.loggedIn || !role || role === 'player') return;
    if (staffBusy) return;
    staffBusy = true;
    try {
      var tok = sessionStorage.getItem('antpro_session_token') || '';
      var headers = tok ? { Authorization: 'Bearer ' + tok } : {};
      var results = await Promise.all([
        fetch('/api/bets-history?limit=400', { cache: 'no-store', headers: headers }).catch(function () { return null; }),
        fetch('/api/live-bets', { cache: 'no-store' }).catch(function () { return null; })
      ]);
      if (results[0] && results[0].ok) {
        var data = await results[0].json();
        state.staffBets = (Array.isArray(data.bets) ? data.bets : []).map(mapBet);
      }
      if (results[1] && results[1].ok) {
        var live = await results[1].json();
        state.staffLiveBets = (Array.isArray(live.bets) ? live.bets : []).filter(function (b) {
          return ['open', 'pending'].indexOf(String(b.status || 'open').toLowerCase()) >= 0;
        }).map(function (b) {
          var m = mapBet(b);
          m.status = 'open';
          m.result = 'LIVE';
          return m;
        });
      }
    } catch (e) {}
    finally {
      staffBusy = false;
      if (state.exposureUser && state.view === 'pnl' && typeof render === 'function') render();
    }
  };
  setInterval(function () { if (window.syncStaffBets) window.syncStaffBets(); }, 1000);
  setTimeout(function () { if (window.syncStaffBets) window.syncStaffBets(); }, 500);

  function allowSet() {
    var role = state.user && state.user.role;
    var allow = new Set(typeof allDownlinePlayerIds === 'function' ? allDownlinePlayerIds() : []);
    if (role === 'master' && typeof loadUsers === 'function') {
      Object.keys((loadUsers().players) || {}).forEach(function (id) { allow.add(id); });
    }
    return allow;
  }

  var _visible = typeof visibleBetsForRole === 'function' ? visibleBetsForRole : null;
  window.visibleBetsForRole = function () {
    var local = _visible ? _visible() : (state.activeBets || []).slice(0, 120);
    var role = state.user && state.user.role;
    if (!role || role === 'player') return local;
    var allow = allowSet();
    var staff = (state.staffBets || []).concat(state.staffLiveBets || []).filter(function (b) {
      return allow.has(b.player || b.playerId);
    });
    var seen = {}, out = [];
    // live first, then history/local
    (state.staffLiveBets || []).concat(local).concat(state.staffBets || []).forEach(function (b) {
      if (!allow.has(b.player || b.playerId) && role !== 'player') {
        // still include if from original local for edge cases with empty downline
        if (!(local.indexOf(b) >= 0)) return;
      }
      var key = (b.player || b.playerId || '') + '|' + (b.ts || 0) + '|' + (b.amt || 0) + '|' + (b.team || '') + '|' + (b.status || '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(b);
    });
    out.sort(function (a, b) {
      var ao = a.status === 'open' ? 0 : 1;
      var bo = b.status === 'open' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (b.ts || 0) - (a.ts || 0);
    });
    return out.slice(0, 250);
  };

  window.exposureModal = function (id) {
    var u = (typeof findUserById === 'function' ? findUserById(id) : null) || { id: id, name: id };
    var bets = (typeof visibleBetsForRole === 'function' ? visibleBetsForRole() : (state.activeBets || []))
      .filter(function (b) { return (b.player || b.playerId) === id && ['open', 'pending'].indexOf(String(b.status || 'open').toLowerCase()) >= 0; })
      .slice(0, 50);
    Object.values(state.pendingBets || {}).forEach(function (arr) {
      (arr || []).forEach(function (b) {
        if ((b.player || b.playerId) === id) {
          bets.unshift({ match: b.type || 'Casino', team: b.team || b.side, amt: b.amt, rate: b.rate, type: b.type, ts: b.ts || Date.now(), status: 'open', result: 'LIVE', profit: 0 });
        }
      });
    });
    var liveCount = bets.filter(function (b) { return b.status === 'open'; }).length;
    var rows = bets.length ? bets.map(function (b) {
      var st = b.status === 'open' ? 'LIVE' : (b.status || '');
      return '<tr><td>' + (b.match || b.type || 'Casino') + '</td><td>' + (b.team || b.side || '—') +
        '</td><td>' + (Number(b.amt) || 0) + ' coins</td><td>' + (b.type || 'KHAI') + '</td><td>' + new Date(b.ts || Date.now()).toLocaleTimeString('en-IN') +
        '</td><td class="ok">LIVE</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty-cell">No live bets for ' + id + '</td></tr>';
    return '<div class="modal-overlay" onclick="if(event.target===this)closeExposure()"><div class="staff-modal exposure-modal">' +
      '<button class="modal-x" onclick="closeExposure()">×</button><h3>USER EXPOSURE</h3>' +
      '<div class="modal-subtitle">' + u.id + ' · ' + (u.name || '') + ' · Live bets: ' + liveCount + '</div>' +
      '<div class="table-scroll"><table class="bo-table"><thead><tr><th>MATCH</th><th>SELECTION</th><th>STAKE (COINS)</th><th>TYPE</th><th>TIME</th><th>STATUS</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><button class="back-btn" onclick="closeExposure()">CLOSE</button></div></div>';
  };

  window.openExposure = function (id) {
    var done = function () { state.exposureUser = id; if (typeof render === 'function') render(); };
    if (window.syncStaffBets) window.syncStaffBets().then(done).catch(done);
    else done();
  };

  var _push = typeof pushSettledBet === 'function' ? pushSettledBet : null;
  if (_push) {
    window.pushSettledBet = function (partial) {
      var bet = _push(partial);
      try {
        var tok = sessionStorage.getItem('antpro_session_token') || '';
        fetch('/api/bets-settle', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
          body: JSON.stringify({
            id: bet.id,
            gameKey: partial.gameKey || '',
            roundId: partial.roundId || bet.roundId || '',
            player: bet.player,
            side: bet.team,
            team: bet.team,
            type: bet.type,
            rate: bet.rate,
            amt: bet.amt,
            status: bet.status,
            profit: bet.profit,
            result: bet.result,
            ts: bet.ts
          })
        }).catch(function () {});
      } catch (e) {}
      return bet;
    };
  }

  console.log('[AntPro] staff live + history bets ready');
})();
