/* AntPro UI reference patch — visual betting modal only.
   Existing game handlers remain the source of truth for validation, chips and settlement. */
(function () {
  'use strict';
  var AMOUNTS = [100, 200, 500, 1000, 3000, 5000, 10000, 20000, 25000, 50000, 100000, 200000];
  var RATES = {
    'andar-bahar': { Andar: '1.95', Bahar: '1.95' },
    lucky7: { '7 UP': '1.97', '7': '11', '7 DOWN': '1.97' },
    'teen-patti': { 'Team A': '1.95', Tie: '44', 'Team B': '1.95' },
    'dragon-tiger': { Dragon: '1.97', Tie: '44', Tiger: '1.97' }
  };
  var TITLES = {
    'andar-bahar': 'ANDAR BAHAR', lucky7: 'LUCKY 7', 'teen-patti': '20-20 TEENPATTI', 'dragon-tiger': '20-20 DRAGON'
  };
  var playFns = {
    'andar-bahar': 'playAndarBahar', lucky7: 'playLucky7', 'teen-patti': 'playTeenPatti', 'dragon-tiger': 'playDragonTiger'
  };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function currentKey() { return typeof casinoKeyForView === 'function' ? casinoKeyForView() : ''; }
  function rateFor(key, side) { return (RATES[key] && RATES[key][side]) || '1.95'; }
  function removeModal() { var el = document.getElementById('antpro-bet-modal'); if (el) el.remove(); }
  window.closeCasinoBetModal = removeModal;
  window.openCasinoBetModal = function (key, side) {
    removeModal();
    var rate = rateFor(key, side);
    var modal = document.createElement('div');
    modal.id = 'antpro-bet-modal';
    modal.className = 'antpro-bet-overlay';
    modal.innerHTML = '<div class="antpro-bet-modal" role="dialog" aria-modal="true" aria-label="Place bet">' +
      '<div class="antpro-bet-head"><div><span>Team</span><b>' + esc(side) + '</b></div><div><span>Rate</span><b>' + esc(rate) + '</b></div></div>' +
      '<div class="antpro-chip-grid">' + AMOUNTS.map(function (n) { return '<button type="button" data-modal-amt="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
      '<div class="antpro-amount-row"><input id="antpro-modal-amount" inputmode="numeric" type="text" placeholder="Enter Amount" autocomplete="off"><span>' + esc(rate === '11' ? '7' : (key === 'dragon-tiger' ? '8' : '7')) + '</span></div>' +
      '<div class="antpro-modal-actions"><button type="button" class="antpro-cancel">Cancel</button><button type="button" class="antpro-submit">Submit</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    var input = document.getElementById('antpro-modal-amount');
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('antpro-cancel')) { removeModal(); return; }
      var chip = e.target.closest && e.target.closest('[data-modal-amt]');
      if (chip && input) { input.value = chip.getAttribute('data-modal-amt'); input.focus(); }
      if (e.target.classList.contains('antpro-submit')) {
        var val = input ? String(input.value || '').replace(/[^0-9]/g, '') : '';
        var num = parseInt(val, 10);
        var balance = typeof getCoins === 'function' ? Number(getCoins()) || 0 : 0;
        if (!Number.isFinite(num) || num < 100 || num > 200000) { if (typeof toast === 'function') toast('Bet amount 100 se 2,00,000 chips ke beech rakho'); return; }
        if (num > balance) { if (typeof toast === 'function') toast('Aapke chips se zyada bet nahi laga sakte'); return; }
        // Feed the existing stake reader; no betting/settlement logic is duplicated here.
        var existing = document.getElementById('stake-' + key);
        if (existing) existing.value = String(num);
        removeModal();
        var fn = window[playFns[key]];
        if (typeof fn === 'function') fn(side);
      }
    });
    if (input) input.focus();
  };
  function enhanceRows() {
    var key = currentKey(); if (!key) return;
    document.querySelectorAll('.game-screen .bet-lock-row').forEach(function (row) {
      var sideEl = row.querySelector('.side'); var lock = row.querySelector('.lock');
      if (!sideEl || !lock || !sideEl.textContent.trim() || lock.classList.contains('back-btn-g')) return;
      var side = sideEl.textContent.trim();
      row.classList.add('antpro-bet-trigger');
      row.setAttribute('data-bet-key', key); row.setAttribute('data-bet-side', side);
      lock.classList.add('antpro-bet-trigger');
      lock.setAttribute('data-bet-key', key); lock.setAttribute('data-bet-side', side);
      lock.textContent = (typeof bettingOpen === 'function' && bettingOpen(key)) ? 'BET' : 'LOCKED';
      var old = row.querySelector('.antpro-rate');
      if (!old) { old = document.createElement('span'); old.className = 'antpro-rate'; old.textContent = rateFor(key, side); row.insertBefore(old, lock); }
      sideEl.classList.add('antpro-side-label');
    });
    document.querySelectorAll('.game-screen .section-gold.result-heading').forEach(function (el) { el.classList.add('antpro-result-head'); });
  }
  if (!window.__antproBetModalEvents) {
    window.__antproBetModalEvents = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('.antpro-bet-trigger');
      if (!t) return;
      e.preventDefault(); e.stopImmediatePropagation();
      openCasinoBetModal(t.getAttribute('data-bet-key'), t.getAttribute('data-bet-side'));
    }, true);
  }
  function hookRender() {
    if (typeof window.render !== 'function' || window.render.__uiReference) return;
    var orig = window.render;
    window.render = function () { var out = orig.apply(this, arguments); try { enhanceRows(); } catch (e) {} return out; };
    window.render.__uiReference = true;
    enhanceRows();
  }
  hookRender(); setTimeout(hookRender, 250); setTimeout(hookRender, 900);
  console.log('[AntPro] screenshot UI reference modal enabled');
})();
