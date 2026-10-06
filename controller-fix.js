/* AntPro controller-fix
   - 4 games, live side chip totals, all phases (betting/locked/revealing/result)
   - Force decision via server API only
   - Does NOT change game timers, coin math, or settlement logic
*/
(function () {
  'use strict';

  var GAMES = [
    { key: 'andar-bahar', title: 'Andar Bahar', sides: ['Andar', 'Bahar'], types: ['andarbahar', 'andar'] },
    { key: 'lucky7', title: 'Lucky 7', sides: ['7 UP', '7', '7 DOWN'], types: ['lucky'] },
    { key: 'teen-patti', title: 'Teen Patti', sides: ['Team A', 'Team B'], types: ['teen'] },
    { key: 'dragon-tiger', title: 'Dragon Tiger', sides: ['Dragon', 'Tie', 'Tiger'], types: ['dragon'] }
  ];

  var cache = { rounds: {}, bets: [], updated: 0 };
  var pollTimer = null;
  var busyForce = {};

  function isControllerView() {
    try {
      if (typeof state !== 'undefined' && (state.view === 'admin' || state.view === 'controller' || state.adminAuthed)) return true;
      var path = (location.pathname || '').toLowerCase();
      if (path.indexOf('x9k2-ns-ctrl') >= 0 || path.indexOf('controller') >= 0) return true;
    } catch (e) {}
    return false;
  }

  function fmt(n) {
    return Math.floor(Number(n) || 0).toLocaleString('en-IN');
  }

  function sideOfBet(b) {
    return String((b && (b.side || b.team || b.selection)) || '').trim();
  }

  function isOpenBet(b) {
    var s = String((b && b.status) || 'open').toLowerCase();
    return s === 'open' || s === 'pending' || s === 'active' || s === '';
  }

  function betBelongsToGame(b, g) {
    var gk = String((b && (b.gameKey || b.game)) || '').toLowerCase();
    if (gk && gk === g.key) return true;
    var t = String((b && b.type) || '').toLowerCase().replace(/\s+/g, '');
    if (!t) return false;
    return (g.types || []).some(function (x) { return t.indexOf(x) >= 0; });
  }

  /** Server round preferred; client phase used only for display if server lags */
  function getRound(key) {
    var server = (cache.rounds && cache.rounds[key]) || {};
    var local = {};
    try {
      if (typeof getLiveRounds === 'function') local = getLiveRounds()[key] || {};
      else if (typeof state !== 'undefined' && state.sharedRounds) local = state.sharedRounds[key] || {};
    } catch (e) {}
    var phase = server.phase || local.phase || '\u2014';
    return {
      roundId: server.roundId || local.roundId || '',
      phase: phase,
      timer: server.timer != null ? server.timer : (local.timer != null ? local.timer : '\u2014'),
      betTimer: server.betTimer != null ? server.betTimer : local.betTimer,
      forcedWinner: server.forcedWinner || local.forcedWinner || null,
      startedAt: server.startedAt || local.startedAt,
      duration: server.duration || local.duration,
      result: server.result || local.result || null
    };
  }

  function sideTotals(gameKey, roundId) {
    var g = GAMES.find(function (x) { return x.key === gameKey; }) || { sides: [], types: [] };
    var totals = {};
    g.sides.forEach(function (s) { totals[s] = 0; });

    var matchedRound = 0;
    var matchedAny = 0;

    (cache.bets || []).forEach(function (b) {
      if (!b || !isOpenBet(b) || !betBelongsToGame(b, g)) return;
      var side = sideOfBet(b);
      if (!side) return;
      if (totals[side] == null) {
        var hit = g.sides.find(function (s) { return s.toLowerCase() === side.toLowerCase(); });
        if (!hit) return;
        side = hit;
      }
      var amt = Math.abs(Number(b.amt || b.amount || b.stake) || 0);
      matchedAny += amt;
      if (roundId && b.roundId && String(b.roundId) !== String(roundId)) return;
      totals[side] += amt;
      matchedRound += amt;
    });

    // If strict round filter yielded 0 but open bets exist for game, show those (avoids empty panel on id drift)
    if (matchedRound === 0 && matchedAny > 0) {
      g.sides.forEach(function (s) { totals[s] = 0; });
      (cache.bets || []).forEach(function (b) {
        if (!b || !isOpenBet(b) || !betBelongsToGame(b, g)) return;
        var side = sideOfBet(b);
        if (!side) return;
        if (totals[side] == null) {
          var hit = g.sides.find(function (s) { return s.toLowerCase() === side.toLowerCase(); });
          if (!hit) return;
          side = hit;
        }
        totals[side] += Math.abs(Number(b.amt || b.amount || b.stake) || 0);
      });
    }
    return totals;
  }

  function amountClass(totals, side) {
    var vals = Object.keys(totals).map(function (k) { return totals[k]; });
    if (!vals.length) return 'eq';
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (min === max) return 'eq';
    if (totals[side] === min) return 'low';
    if (totals[side] === max) return 'high';
    return 'mid';
  }

  function phaseLabel(phase) {
    var p = String(phase || '').toLowerCase();
    if (p === 'betting') return 'BETTING';
    if (p === 'locked') return 'LOCKED';
    if (p === 'revealing') return 'REVEALING';
    if (p === 'result') return 'RESULT';
    if (p === 'forced') return 'FORCED';
    return (phase || '\u2014').toUpperCase();
  }

  async function refresh() {
    try {
      var rRes = await fetch('/api/live-rounds', { cache: 'no-store' });
      var bRes = await fetch('/api/live-bets', { cache: 'no-store' });
      if (rRes.ok) {
        var rd = await rRes.json();
        cache.rounds = rd && typeof rd === 'object' ? rd : {};
        // Keep client sharedRounds in sync for display only (no timer rewrite)
        try {
          if (typeof state !== 'undefined') state.sharedRounds = cache.rounds;
        } catch (e1) {}
      }
      if (bRes.ok) {
        var bd = await bRes.json();
        cache.bets = Array.isArray(bd.bets) ? bd.bets : (Array.isArray(bd) ? bd : []);
        try {
          if (typeof state !== 'undefined') state.serverBets = cache.bets;
        } catch (e2) {}
      }
      cache.updated = Date.now();
    } catch (e) {
      console.warn('[AntPro] controller poll failed', e);
    }
    paint();
  }

  async function forceDecision(gameKey, side, roundId) {
    var lock = gameKey + ':' + side;
    if (busyForce[lock]) return;
    busyForce[lock] = true;
    try {
      // Always re-read server round so force uses current window (does not alter timers)
      var rr = await fetch('/api/live-rounds', { cache: 'no-store' });
      if (rr.ok) {
        var rd = await rr.json();
        if (rd && rd[gameKey] && rd[gameKey].roundId) roundId = rd[gameKey].roundId;
        cache.rounds = rd || cache.rounds;
      }
      var res = await fetch('/api/live-rounds/' + encodeURIComponent(gameKey) + '/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side: side, roundId: roundId || '' })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (typeof toast === 'function') toast(data.error || ('Force failed: ' + res.status));
        else alert(data.error || ('Force failed: ' + res.status));
      } else {
        if (data.round) cache.rounds[gameKey] = data.round;
        // Reflect force on client round object only (engine already respects forcedWinner)
        try {
          if (typeof getLiveRounds === 'function' && typeof setLiveRounds === 'function') {
            var all = getLiveRounds();
            if (all[gameKey]) {
              all[gameKey].forcedWinner = side;
              if (data.round && data.round.roundId) all[gameKey].roundId = data.round.roundId;
              setLiveRounds(all);
            }
          }
        } catch (e3) {}
        if (typeof toast === 'function') toast(gameKey + ' \u2192 FORCE ' + side);
        await refresh();
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Force request failed');
      else alert('Force request failed');
    } finally {
      busyForce[lock] = false;
    }
  }

  // Override legacy forceWinner so admin buttons hit server with correct roundId
  // Does not change settlement math \u2014 only sets forcedWinner via existing API
  window.forceWinner = function (gameKey, side) {
    var r = getRound(gameKey);
    forceDecision(gameKey, side, r.roundId || '');
  };

  function cardHTML(g) {
    var r = getRound(g.key);
    var phase = String(r.phase || '\u2014');
    var timer = r.timer != null ? r.timer : '\u2014';
    var roundId = r.roundId || '\u2014';
    var forced = r.forcedWinner || null;
    var totals = sideTotals(g.key, r.roundId);
    var totalAll = Object.keys(totals).reduce(function (n, k) { return n + (totals[k] || 0); }, 0);
    var canForce = phase === 'betting' || phase === 'locked';

    var sidesHtml = g.sides.map(function (side) {
      var amt = totals[side] || 0;
      var cls = amountClass(totals, side);
      return (
        '<div class="ctrl-side ctrl-side-' + cls + '">' +
          '<div class="ctrl-side-name">' + side + '</div>' +
          '<div class="ctrl-side-amt">' + fmt(amt) + '</div>' +
          '<button type="button" class="ctrl-force-btn" data-game="' + g.key + '" data-side="' + side + '" data-round="' +
            String(roundId).replace(/"/g, '') + '" ' + (canForce ? '' : 'disabled') + '>FORCE ' + side + '</button>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="ctrl-game-card" data-game="' + g.key + '">' +
        '<div class="ctrl-game-head">' +
          '<span class="ctrl-game-title">' + g.title + '</span>' +
          '<span class="ctrl-phase ctrl-phase-' + phase.toLowerCase() + '">' + phaseLabel(phase) + '</span>' +
        '</div>' +
        '<div class="ctrl-meta">' +
          'Round: <b>' + roundId + '</b> \u00b7 Timer: <b>' + timer + 's</b> \u00b7 Open chips: <b>' + fmt(totalAll) + '</b>' +
          (forced ? ' \u00b7 Forced: <b class="ctrl-forced">' + forced + '</b>' : ' \u00b7 Natural engine ready') +
          (r.result ? ' \u00b7 Last: <b>' + r.result + '</b>' : '') +
        '</div>' +
        '<div class="ctrl-sides">' + sidesHtml + '</div>' +
        '<div class="ctrl-phase-hint">' +
          (canForce
            ? 'Decision OPEN \u2014 force allowed (betting / locked)'
            : (phase.toLowerCase() === 'revealing'
                ? 'REVEALING \u2014 decision locked, cards showing'
                : (phase.toLowerCase() === 'result'
                    ? 'RESULT \u2014 wait for next auto round'
                    : 'Decision locked \u2014 natural engine'))) +
        '</div>' +
      '</div>'
    );
  }

  function panelHTML() {
    return (
      '<div class="ctrl-root">' +
        '<div class="ctrl-header">' +
          '<div class="ctrl-header-title">AntPro Controller</div>' +
          '<div class="ctrl-header-sub">Phases: BETTING \u2192 LOCKED \u2192 REVEALING \u2192 RESULT \u00b7 Force only in betting/locked \u00b7 Timers/math untouched</div>' +
          '<div class="ctrl-legend">' +
            '<span class="ctrl-leg-low">Green = kam chips</span>' +
            '<span class="ctrl-leg-high">Red = zyada chips</span>' +
            '<span class="ctrl-leg-eq">Gray = equal</span>' +
          '</div>' +
        '</div>' +
        '<div class="ctrl-grid">' + GAMES.map(cardHTML).join('') + '</div>' +
        '<div class="ctrl-foot">Auto-refresh 1.2s \u00b7 Updated: ' +
          (cache.updated ? new Date(cache.updated).toLocaleTimeString() : '\u2014') +
          ' \u00b7 Open bets tracked: ' + (cache.bets || []).filter(isOpenBet).length +
        '</div>' +
      '</div>'
    );
  }

  function paint() {
    var root = document.getElementById('controller-live-root');
    if (!root) {
      var host = document.querySelector('.admin-panel') || document.getElementById('app');
      if (!host) return;
      root = document.createElement('div');
      root.id = 'controller-live-root';
      if (host.classList && host.classList.contains('admin-panel')) {
        host.insertBefore(root, host.firstChild);
      } else if (isControllerView()) {
        host.appendChild(root);
      } else {
        return;
      }
    }
    root.innerHTML = panelHTML();
    root.querySelectorAll('.ctrl-force-btn').forEach(function (btn) {
      btn.onclick = function () {
        var game = btn.getAttribute('data-game');
        var side = btn.getAttribute('data-side');
        var round = btn.getAttribute('data-round');
        if (!game || !side) return;
        forceDecision(game, side, round === '\u2014' ? '' : round);
      };
    });
  }

  function ensureStyles() {
    if (document.getElementById('antpro-controller-fix-css')) return;
    var s = document.createElement('style');
    s.id = 'antpro-controller-fix-css';
    s.textContent = [
      '.ctrl-root{padding:12px;max-width:1100px;margin:0 auto;font-family:Roboto,Arial,sans-serif;color:#e5e7eb}',
      '.ctrl-header{margin-bottom:12px}',
      '.ctrl-header-title{font-size:18px;font-weight:800;color:#fbbf24}',
      '.ctrl-header-sub{font-size:11px;color:#9ca3af;margin-top:2px}',
      '.ctrl-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:10px;font-weight:700}',
      '.ctrl-leg-low{color:#86efac}.ctrl-leg-high{color:#fca5a5}.ctrl-leg-eq{color:#9ca3af}',
      '.ctrl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '@media(max-width:720px){.ctrl-grid{grid-template-columns:1fr}}',
      '.ctrl-game-card{background:linear-gradient(180deg,#111827,#0b1220);border:1px solid #30363d;border-radius:10px;padding:12px;box-shadow:0 8px 24px #0004}',
      '.ctrl-game-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
      '.ctrl-game-title{font-weight:800;font-size:14px;color:#f3f4f6}',
      '.ctrl-phase{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:#1f2937}',
      '.ctrl-phase-betting{background:#14532d;color:#86efac}',
      '.ctrl-phase-locked{background:#78350f;color:#fde68a}',
      '.ctrl-phase-revealing{background:#4c1d95;color:#ddd6fe}',
      '.ctrl-phase-result,.ctrl-phase-forced{background:#1e3a8a;color:#93c5fd}',
      '.ctrl-meta{font-size:10px;color:#9ca3af;margin-bottom:10px}',
      '.ctrl-forced{color:#fbbf24}',
      '.ctrl-sides{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}',
      '.ctrl-side{border-radius:8px;padding:8px;text-align:center;border:1px solid #374151;background:#0f172a}',
      '.ctrl-side-low{background:#052e1a;border-color:#166534}',
      '.ctrl-side-high{background:#3f1212;border-color:#991b1b}',
      '.ctrl-side-eq,.ctrl-side-mid{background:#111827;border-color:#374151}',
      '.ctrl-side-name{font-size:11px;font-weight:700;color:#d1d5db}',
      '.ctrl-side-amt{font-size:18px;font-weight:900;margin:4px 0;color:#fff}',
      '.ctrl-side-low .ctrl-side-amt{color:#86efac}',
      '.ctrl-side-high .ctrl-side-amt{color:#fca5a5}',
      '.ctrl-force-btn{width:100%;margin-top:4px;padding:6px 4px;border:0;border-radius:6px;background:#b45309;color:#fff;font-size:10px;font-weight:800;cursor:pointer}',
      '.ctrl-force-btn:hover:not(:disabled){background:#d97706}',
      '.ctrl-force-btn:disabled{opacity:.4;cursor:not-allowed;background:#374151}',
      '.ctrl-phase-hint{margin-top:8px;font-size:10px;color:#6b7280;text-align:center}',
      '.ctrl-foot{margin-top:10px;font-size:10px;color:#6b7280;text-align:center}'
    ].join('');
    document.head.appendChild(s);
  }

  function start() {
    ensureStyles();
    if (!isControllerView() && !document.querySelector('.admin-panel')) return;
    paint();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.getElementById('controller-live-root') || isControllerView() || document.querySelector('.admin-panel')) {
        refresh();
      }
    }, 1200);
    refresh();
  }

  var tries = 0;
  function boot() {
    tries++;
    start();
    if (tries < 25) setTimeout(boot, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  setTimeout(function () {
    if (typeof window.go === 'function' && !window.go.__ctrlHook) {
      var _go = window.go;
      window.go = function (view) {
        var r = _go.apply(this, arguments);
        setTimeout(function () {
          if (view === 'admin' || view === 'controller' || isControllerView()) start();
        }, 80);
        return r;
      };
      window.go.__ctrlHook = true;
    }
  }, 300);

  // Light speed helper: swap heavy *-4k.png to smaller *.png when available (UI only)
  function lightenImages() {
    try {
      document.querySelectorAll('img[src*="-4k"]').forEach(function (img) {
        var src = img.getAttribute('src') || '';
        var light = src.replace('-4k.png', '.png').replace('-4k-transparent.png', '.png');
        if (light !== src) {
          img.setAttribute('src', light);
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
        }
      });
    } catch (e) {}
  }
  setInterval(lightenImages, 2000);
  lightenImages();

  console.log('[AntPro] controller-fix v2 \u2014 phases + live totals + force (no game math change)');
})();
