/* AntPro controller-fix — 4-game grid, live side totals, force decision only
   Does NOT change game timers, coin math, or settlement logic. */
(function () {
  'use strict';

  var GAMES = [
    { key: 'andar-bahar', title: 'Andar Bahar', sides: ['Andar', 'Bahar'] },
    { key: 'lucky7', title: 'Lucky 7', sides: ['7 UP', '7', '7 DOWN'] },
    { key: 'teen-patti', title: 'Teen Patti', sides: ['Team A', 'Team B'] },
    { key: 'dragon-tiger', title: 'Dragon Tiger', sides: ['Dragon', 'Tie', 'Tiger'] }
  ];

  var cache = { rounds: {}, bets: [], updated: 0 };
  var pollTimer = null;
  var busyForce = {};

  function isControllerView() {
    try {
      if (typeof state !== 'undefined' && (state.view === 'admin' || state.view === 'controller')) return true;
      var path = (location.pathname || '').toLowerCase();
      if (path.indexOf('x9k2-ns-ctrl') >= 0 || path.indexOf('controller') >= 0) return true;
      if (location.hash && location.hash.toLowerCase().indexOf('admin') >= 0) return true;
    } catch (e) {}
    return false;
  }

  function fmt(n) {
    n = Math.floor(Number(n) || 0);
    return n.toLocaleString('en-IN');
  }

  function sideOfBet(b) {
    return String(b.side || b.team || b.selection || '').trim();
  }

  function isOpenBet(b) {
    var s = String(b.status || 'open').toLowerCase();
    return s === 'open' || s === 'pending' || s === '' || s === 'active';
  }

  function sideTotals(gameKey, roundId) {
    var totals = {};
    var sides = (GAMES.find(function (g) { return g.key === gameKey; }) || {}).sides || [];
    sides.forEach(function (s) { totals[s] = 0; });
    (cache.bets || []).forEach(function (b) {
      if (!b || String(b.gameKey || b.game || '') !== gameKey) return;
      if (roundId && b.roundId && String(b.roundId) !== String(roundId)) return;
      if (!isOpenBet(b)) return;
      var side = sideOfBet(b);
      if (!side) return;
      if (totals[side] == null) {
        var hit = sides.find(function (s) { return s.toLowerCase() === side.toLowerCase(); });
        if (hit) side = hit;
        else return;
      }
      totals[side] = (totals[side] || 0) + Math.abs(Number(b.amt || b.amount || b.stake) || 0);
    });
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

  async function refresh() {
    try {
      var rRes = await fetch('/api/live-rounds', { cache: 'no-store' });
      var bRes = await fetch('/api/live-bets', { cache: 'no-store' });
      if (rRes.ok) {
        var rd = await rRes.json();
        cache.rounds = rd && typeof rd === 'object' ? rd : {};
      }
      if (bRes.ok) {
        var bd = await bRes.json();
        cache.bets = Array.isArray(bd.bets) ? bd.bets : (Array.isArray(bd) ? bd : []);
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
      var res = await fetch('/api/live-rounds/' + encodeURIComponent(gameKey) + '/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side: side, roundId: roundId || '' })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        alert(data.error || ('Force failed: ' + res.status));
      } else {
        if (data.round) cache.rounds[gameKey] = data.round;
        await refresh();
      }
    } catch (e) {
      alert('Force request failed');
    } finally {
      busyForce[lock] = false;
    }
  }

  function cardHTML(g) {
    var r = cache.rounds[g.key] || {};
    var phase = String(r.phase || '\u2014');
    var timer = r.timer != null ? r.timer : (r.betTimer != null ? r.betTimer : '\u2014');
    var roundId = r.roundId || '\u2014';
    var forced = r.forcedWinner || null;
    var totals = sideTotals(g.key, r.roundId);
    var canForce = phase === 'betting' || phase === 'locked';

    var sidesHtml = g.sides.map(function (side) {
      var amt = totals[side] || 0;
      var cls = amountClass(totals, side);
      var btnDisabled = !canForce ? 'disabled' : '';
      return (
        '<div class="ctrl-side ctrl-side-' + cls + '">' +
          '<div class="ctrl-side-name">' + side + '</div>' +
          '<div class="ctrl-side-amt">' + fmt(amt) + '</div>' +
          '<button type="button" class="ctrl-force-btn" data-game="' + g.key + '" data-side="' + side + '" data-round="' + String(roundId).replace(/"/g, '') + '" ' + btnDisabled + '>FORCE ' + side + '</button>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="ctrl-game-card" data-game="' + g.key + '">' +
        '<div class="ctrl-game-head">' +
          '<span class="ctrl-game-title">' + g.title + '</span>' +
          '<span class="ctrl-phase ctrl-phase-' + phase + '">' + phase.toUpperCase() + '</span>' +
        '</div>' +
        '<div class="ctrl-meta">Round: <b>' + roundId + '</b> \u00b7 Timer: <b>' + timer + 's</b>' +
          (forced ? ' \u00b7 Forced: <b class="ctrl-forced">' + forced + '</b>' : ' \u00b7 Natural engine ready') +
        '</div>' +
        '<div class="ctrl-sides">' + sidesHtml + '</div>' +
      '</div>'
    );
  }

  function panelHTML() {
    return (
      '<div class="ctrl-root">' +
        '<div class="ctrl-header">' +
          '<div class="ctrl-header-title">AntPro Controller</div>' +
          '<div class="ctrl-header-sub">Live side totals \u00b7 Force only in BETTING/LOCKED \u00b7 Else natural engine</div>' +
          '<div class="ctrl-legend">' +
            '<span class="ctrl-leg-low">Green = kam chips</span>' +
            '<span class="ctrl-leg-high">Red = zyada chips</span>' +
            '<span class="ctrl-leg-eq">Gray = equal</span>' +
          '</div>' +
        '</div>' +
        '<div class="ctrl-grid">' + GAMES.map(cardHTML).join('') + '</div>' +
        '<div class="ctrl-foot">Auto-refresh 1.5s \u00b7 Updated: ' + (cache.updated ? new Date(cache.updated).toLocaleTimeString() : '\u2014') + '</div>' +
      '</div>'
    );
  }

  function paint() {
    var root = document.getElementById('controller-live-root');
    if (!root) {
      var host = document.querySelector('.admin-panel') || document.getElementById('app');
      if (!host) return;
      root = document.getElementById('controller-live-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'controller-live-root';
        if (host.classList && host.classList.contains('admin-panel')) {
          host.insertBefore(root, host.firstChild);
        } else if (isControllerView()) {
          host.innerHTML = '';
          host.appendChild(root);
        } else {
          return;
        }
      }
    }
    root.innerHTML = panelHTML();
    root.querySelectorAll('.ctrl-force-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var game = btn.getAttribute('data-game');
        var side = btn.getAttribute('data-side');
        var round = btn.getAttribute('data-round');
        if (!game || !side) return;
        if (!confirm('Force ' + side + ' on ' + game + '?')) return;
        forceDecision(game, side, round === '\u2014' ? '' : round);
      });
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
      '.ctrl-phase-revealing,.ctrl-phase-result{background:#1e3a8a;color:#93c5fd}',
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
      '.ctrl-foot{margin-top:10px;font-size:10px;color:#6b7280;text-align:center}'
    ].join('');
    document.head.appendChild(s);
  }

  function start() {
    ensureStyles();
    if (!isControllerView() && !(typeof state !== 'undefined' && state.adminAuthed)) {
      if (!document.querySelector('.admin-panel')) return;
    }
    paint();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.getElementById('controller-live-root') || isControllerView() || document.querySelector('.admin-panel')) {
        refresh();
      }
    }, 1500);
    refresh();
  }

  var tries = 0;
  function boot() {
    tries++;
    start();
    if (tries < 20) setTimeout(boot, 500);
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

  console.log('[AntPro] controller-fix ready \u2014 live side totals + force');
})();
