/* AntPro controller-fix v3
   - No blink: root outside #app, patch numbers only when changed
   - Chips: ONLY current server round open bets (reset each new round)
   - Force via API; game timers/math untouched
*/
(function () {
  'use strict';

  var GAMES = [
    { key: 'andar-bahar', title: 'Andar Bahar', sides: ['Andar', 'Bahar'], types: ['andarbahar', 'andar'] },
    { key: 'lucky7', title: 'Lucky 7', sides: ['7 UP', '7', '7 DOWN'], types: ['lucky'] },
    { key: 'teen-patti', title: 'Teen Patti', sides: ['Team A', 'Team B'], types: ['teen'] },
    { key: 'dragon-tiger', title: 'Dragon Tiger', sides: ['Dragon', 'Tie', 'Tiger'], types: ['dragon'] }
  ];

  var cache = { rounds: {}, bets: [], updated: 0, sig: '' };
  var pollTimer = null;
  var busyForce = {};
  var structureBuilt = false;
  var started = false;

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

  function getRound(key) {
    var server = (cache.rounds && cache.rounds[key]) || {};
    return {
      roundId: server.roundId || '',
      phase: server.phase || '\u2014',
      timer: server.timer != null ? server.timer : '\u2014',
      betTimer: server.betTimer,
      forcedWinner: server.forcedWinner || null,
      startedAt: server.startedAt,
      duration: server.duration,
      result: server.result || null
    };
  }

  /** STRICT: only open bets for THIS server roundId. New round => totals 0. */
  function sideTotals(gameKey, roundId) {
    var g = GAMES.find(function (x) { return x.key === gameKey; }) || { sides: [], types: [] };
    var totals = {};
    g.sides.forEach(function (s) { totals[s] = 0; });
    if (!roundId) return totals;

    (cache.bets || []).forEach(function (b) {
      if (!b || !isOpenBet(b) || !betBelongsToGame(b, g)) return;
      if (!b.roundId || String(b.roundId) !== String(roundId)) return;
      var side = sideOfBet(b);
      if (!side) return;
      if (totals[side] == null) {
        var hit = g.sides.find(function (s) { return s.toLowerCase() === side.toLowerCase(); });
        if (!hit) return;
        side = hit;
      }
      totals[side] += Math.abs(Number(b.amt || b.amount || b.stake) || 0);
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

  function phaseLabel(phase) {
    var p = String(phase || '').toLowerCase();
    if (p === 'betting') return 'BETTING';
    if (p === 'locked') return 'LOCKED';
    if (p === 'revealing') return 'REVEALING';
    if (p === 'result') return 'RESULT';
    if (p === 'forced') return 'FORCED';
    return (phase || '\u2014').toUpperCase();
  }

  function snapshotSig() {
    var parts = [];
    GAMES.forEach(function (g) {
      var r = getRound(g.key);
      var t = sideTotals(g.key, r.roundId);
      parts.push(g.key + '|' + r.roundId + '|' + r.phase + '|' + r.timer + '|' + (r.forcedWinner || '') + '|' + JSON.stringify(t));
    });
    return parts.join('||');
  }

  async function refresh() {
    if (!isControllerView()) {
      var rootHide = document.getElementById('controller-live-root');
      if (rootHide) rootHide.style.display = 'none';
      return;
    }
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
        if (typeof toast === 'function') toast(gameKey + ' \u2192 FORCE ' + side);
        cache.sig = '';
        await refresh();
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Force request failed');
    } finally {
      busyForce[lock] = false;
    }
  }

  window.forceWinner = function (gameKey, side) {
    var r = getRound(gameKey);
    forceDecision(gameKey, side, r.roundId || '');
  };

  function ensureRoot() {
    var root = document.getElementById('controller-live-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'controller-live-root';
    // Outside #app so app.js render() does not wipe / blink this panel
    var app = document.getElementById('app');
    if (app && app.parentNode) app.parentNode.insertBefore(root, app.nextSibling);
    else document.body.appendChild(root);
    return root;
  }

  function buildStructure(root) {
    var cards = GAMES.map(function (g) {
      var sides = g.sides.map(function (side) {
        return (
          '<div class="ctrl-side" data-side="' + side + '">' +
            '<div class="ctrl-side-name">' + side + '</div>' +
            '<div class="ctrl-side-amt" data-role="amt">0</div>' +
            '<button type="button" class="ctrl-force-btn" data-game="' + g.key + '" data-side="' + side + '">FORCE ' + side + '</button>' +
          '</div>'
        );
      }).join('');
      return (
        '<div class="ctrl-game-card" data-game="' + g.key + '">' +
          '<div class="ctrl-game-head">' +
            '<span class="ctrl-game-title">' + g.title + '</span>' +
            '<span class="ctrl-phase" data-role="phase">\u2014</span>' +
          '</div>' +
          '<div class="ctrl-meta" data-role="meta">Round: \u2014</div>' +
          '<div class="ctrl-sides">' + sides + '</div>' +
          '<div class="ctrl-phase-hint" data-role="hint"></div>' +
        '</div>'
      );
    }).join('');

    root.innerHTML =
      '<div class="ctrl-root">' +
        '<div class="ctrl-header">' +
          '<div class="ctrl-header-title">AntPro Controller</div>' +
          '<div class="ctrl-header-sub">Current round chips only \u00b7 auto reset on next round \u00b7 force in BETTING/LOCKED</div>' +
          '<div class="ctrl-legend">' +
            '<span class="ctrl-leg-low">Green = kam</span>' +
            '<span class="ctrl-leg-high">Red = zyada</span>' +
            '<span class="ctrl-leg-eq">Gray = equal</span>' +
          '</div>' +
        '</div>' +
        '<div class="ctrl-grid">' + cards + '</div>' +
        '<div class="ctrl-foot" data-role="foot">\u2014</div>' +
      '</div>';

    if (!root.__forceBound) {
      root.__forceBound = true;
      root.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.ctrl-force-btn');
        if (!btn || btn.disabled) return;
        var game = btn.getAttribute('data-game');
        var side = btn.getAttribute('data-side');
        if (!game || !side) return;
        var r = getRound(game);
        forceDecision(game, side, r.roundId || '');
      });
    }
    structureBuilt = true;
  }

  function setText(el, text) {
    if (!el) return;
    var t = String(text);
    if (el.textContent !== t) el.textContent = t;
  }

  function paint() {
    var root = ensureRoot();
    if (!isControllerView()) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'block';

    var sig = snapshotSig();
    if (!structureBuilt) buildStructure(root);
    else if (sig === cache.sig) {
      // only update footer clock lightly
      var footOnly = root.querySelector('[data-role="foot"]');
      if (footOnly && cache.updated) {
        setText(footOnly, 'Live \u00b7 ' + new Date(cache.updated).toLocaleTimeString() + ' \u00b7 this-round open bets only');
      }
      return;
    }
    cache.sig = sig;

    GAMES.forEach(function (g) {
      var card = root.querySelector('.ctrl-game-card[data-game="' + g.key + '"]');
      if (!card) return;
      var r = getRound(g.key);
      var phase = String(r.phase || '\u2014');
      var totals = sideTotals(g.key, r.roundId);
      var totalAll = g.sides.reduce(function (n, s) { return n + (totals[s] || 0); }, 0);
      var canForce = phase === 'betting' || phase === 'locked';

      var phaseEl = card.querySelector('[data-role="phase"]');
      if (phaseEl) {
        setText(phaseEl, phaseLabel(phase));
        phaseEl.className = 'ctrl-phase ctrl-phase-' + phase.toLowerCase();
      }

      var meta = card.querySelector('[data-role="meta"]');
      if (meta) {
        setText(
          meta,
          'Round: ' + (r.roundId || '\u2014') +
            ' \u00b7 Timer: ' + (r.timer != null ? r.timer : '\u2014') + 's' +
            ' \u00b7 This round chips: ' + fmt(totalAll) +
            (r.forcedWinner ? ' \u00b7 Forced: ' + r.forcedWinner : '') +
            (r.result ? ' \u00b7 Last: ' + r.result : '')
        );
      }

      var hint = card.querySelector('[data-role="hint"]');
      if (hint) {
        setText(
          hint,
          canForce
            ? 'Decision OPEN \u2014 force allowed'
            : (phase.toLowerCase() === 'result'
                ? 'RESULT \u2014 chips reset next round'
                : 'Decision locked')
        );
      }

      g.sides.forEach(function (side) {
        var box = card.querySelector('.ctrl-side[data-side="' + side + '"]');
        if (!box) return;
        var amt = totals[side] || 0;
        var cls = amountClass(totals, side);
        box.className = 'ctrl-side ctrl-side-' + cls;
        setText(box.querySelector('[data-role="amt"]'), fmt(amt));
        var btn = box.querySelector('.ctrl-force-btn');
        if (btn) {
          btn.disabled = !canForce;
          btn.setAttribute('data-round', r.roundId || '');
        }
      });
    });

    var foot = root.querySelector('[data-role="foot"]');
    if (foot) {
      setText(
        foot,
        'Live \u00b7 ' +
          (cache.updated ? new Date(cache.updated).toLocaleTimeString() : '\u2014') +
          ' \u00b7 only current-round open chips (reset each round)'
      );
    }
  }

  function ensureStyles() {
    if (document.getElementById('antpro-controller-fix-css')) return;
    var s = document.createElement('style');
    s.id = 'antpro-controller-fix-css';
    s.textContent = [
      '#controller-live-root{display:none}',
      '.ctrl-root{padding:12px;max-width:1100px;margin:0 auto 24px;font-family:Roboto,Arial,sans-serif;color:#e5e7eb;background:#0b1220;border-top:2px solid #fbbf24}',
      '.ctrl-header{margin-bottom:12px}',
      '.ctrl-header-title{font-size:18px;font-weight:800;color:#fbbf24}',
      '.ctrl-header-sub{font-size:11px;color:#9ca3af;margin-top:2px}',
      '.ctrl-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:10px;font-weight:700}',
      '.ctrl-leg-low{color:#86efac}.ctrl-leg-high{color:#fca5a5}.ctrl-leg-eq{color:#9ca3af}',
      '.ctrl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '@media(max-width:720px){.ctrl-grid{grid-template-columns:1fr}}',
      '.ctrl-game-card{background:linear-gradient(180deg,#111827,#0b1220);border:1px solid #30363d;border-radius:10px;padding:12px}',
      '.ctrl-game-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
      '.ctrl-game-title{font-weight:800;font-size:14px;color:#f3f4f6}',
      '.ctrl-phase{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:#1f2937}',
      '.ctrl-phase-betting{background:#14532d;color:#86efac}',
      '.ctrl-phase-locked{background:#78350f;color:#fde68a}',
      '.ctrl-phase-revealing{background:#4c1d95;color:#ddd6fe}',
      '.ctrl-phase-result,.ctrl-phase-forced{background:#1e3a8a;color:#93c5fd}',
      '.ctrl-meta{font-size:10px;color:#9ca3af;margin-bottom:10px}',
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
    if (started) return;
    started = true;
    ensureStyles();
    ensureRoot();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 1500);
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  setTimeout(function () {
    if (typeof window.go === 'function' && !window.go.__ctrlHook) {
      var _go = window.go;
      window.go = function (view) {
        var r = _go.apply(this, arguments);
        setTimeout(function () {
          if (view === 'admin' || view === 'controller') {
            structureBuilt = false;
            cache.sig = '';
            refresh();
          } else {
            var root = document.getElementById('controller-live-root');
            if (root) root.style.display = 'none';
          }
        }, 100);
        return r;
      };
      window.go.__ctrlHook = true;
    }
  }, 400);

  console.log('[AntPro] controller-fix v3 \u2014 no blink + current-round chips only');
})();
