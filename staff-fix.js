/* AntPro staff — agent/supermaster/master see all client bets + exposure */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;
  state.staffBets = state.staffBets || [];
  var staffBusy = false;

  window.syncStaffBets = async function () {
    var role = state.user && state.user.role;
    if (!state.loggedIn || !role || role === 'player') return;
    if (staffBusy) return;
    staffBusy = true;
    try {
      var tok = sessionStorage.getItem('antpro_session_token') || '';
      var res = await fetch('/api/bets-history?limit=400', {
        cache: 'no-store',
        headers: tok ? { Authorization: 'Bearer ' + tok } : {}
      });
      if (!res.ok) return;
      var data = await res.json();
      var remote = Array.isArray(data.bets) ? data.bets : [];
      state.staffBets = remote.map(function (b) {
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
          result: b.result || '',
          gameKey: b.gameKey || '',
          match: b.gameKey || b.type || 'Casino'
        };
      });
    } catch (e) {}
    finally { staffBusy = false; }
  };
  setInterval(function () { if (window.syncStaffBets) window.syncStaffBets(); }, 4000);
  setTimeout(function () { if (window.syncStaffBets) window.syncStaffBets(); }, 800);

  var _visible = typeof visibleBetsForRole === 'function' ? visibleBetsForRole : null;
  window.visibleBetsForRole = function () {
    var local = _visible ? _visible() : (state.activeBets || []).slice(0, 120);
    var role = state.user && state.user.role;
    if (!role || role === 'player') return local;
    var allow = new Set(typeof allDownlinePlayerIds === 'function' ? allDownlinePlayerIds() : []);
    if (role === 'master' && typeof loadUsers === 'function') {
      Object.keys((loadUsers().players) || {}).forEach(function (id) { allow.add(id); });
    }
    var staff = (state.staffBets || []).filter(function (b) {
      return allow.has(b.player || b.playerId);
    });
    var seen = {}, out = [];
    local.concat(staff).forEach(function (b) {
      var key = (b.player || b.playerId || '') + '|' + (b.ts || 0) + '|' + (b.amt || 0) + '|' + (b.team || '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(b);
    });
    out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return out.slice(0, 200);
  };

  window.exposureModal = function (id) {
    var u = (typeof findUserById === 'function' ? findUserById(id) : null) || { id: id, name: id };
    var bets = (typeof visibleBetsForRole === 'function' ? visibleBetsForRole() : (state.activeBets || []))
      .filter(function (b) { return (b.player || b.playerId) === id; })
      .slice(0, 40);
    Object.values(state.pendingBets || {}).forEach(function (arr) {
      (arr || []).forEach(function (b) {
        if ((b.player || b.playerId) === id) {
          bets.unshift({ match: b.type || 'Casino', team: b.team || b.side, amt: b.amt, rate: b.rate, type: b.type, ts: b.ts || Date.now(), status: 'open', profit: 0 });
        }
      });
    });
    var rows = bets.length ? bets.map(function (b) {
      return '<tr><td>' + (b.match || b.type || 'Casino') + '</td><td>' + (b.team || b.side || '—') +
        '</td><td>' + (b.amt || 0) + '</td><td>' + (b.rate || '—') + '</td><td>' + (b.type || 'KHAI') +
        '</td><td>' + new Date(b.ts || Date.now()).toLocaleTimeString('en-IN') +
        '</td><td class="bad">' + (b.status === 'lost' ? (b.amt || 0) : 0) +
        '</td><td class="ok">' + (b.status === 'won' ? (b.profit || 0) : 0) + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty-cell">No bets for ' + id + '</td></tr>';
    return '<div class="modal-overlay" onclick="if(event.target===this)closeExposure()"><div class="staff-modal exposure-modal">' +
      '<button class="modal-x" onclick="closeExposure()">×</button><h3>USER EXPOSURE</h3>' +
      '<div class="modal-subtitle">' + u.id + ' · ' + (u.name || '') + ' · All client bets</div>' +
      '<div class="table-scroll"><table class="bo-table"><thead><tr><th>MATCH</th><th>SELECTION</th><th>STAKE</th><th>RATE</th><th>TYPE</th><th>TIME</th><th>LOSS</th><th>PROFIT</th></tr></thead><tbody>' +
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
            gameKey: partial.gameKey || '',
            player: bet.player,
            side: bet.team,
            team: bet.team,
            type: bet.type,
            rate: bet.rate,
            amt: bet.amt,
            status: bet.status,
            profit: bet.profit,
            result: bet.result
          })
        }).catch(function () {});
      } catch (e) {}
      return bet;
    };
  }

  console.log('[AntPro] staff bets history + exposure ready');
})();
