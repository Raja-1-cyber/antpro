/* AntPro stake-fix — bet amount box fully typeable */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;
  state.selectedStakes = state.selectedStakes || {};
  state._stakeTyping = state._stakeTyping || {};
  state._stakeDraft = state._stakeDraft || {};

  window.selectedStake = function (key) {
    var balance = typeof getCoins === 'function' ? getCoins() : 0;
    var saved = Number(state.selectedStakes[key]);
    if (Number.isInteger(saved) && saved >= 100 && saved <= 20000) {
      if (balance <= 0 || saved <= balance) return saved;
    }
    return balance >= 100 ? 100 : 0;
  };

  window.setStakeValue = function (key, value) {
    state._stakeTyping[key] = true;
    var raw = String(value == null ? '' : value).replace(/[^0-9]/g, '');
    state._stakeDraft[key] = raw;
    var input = document.getElementById('stake-' + key);
    if (input && input.value !== raw) {
      var pos = input.selectionStart;
      input.value = raw;
      try { if (typeof pos === 'number') input.setSelectionRange(pos, pos); } catch (e) {}
    }
    var note = document.getElementById('stake-note-' + key);
    if (!raw) {
      if (note) note.textContent = 'Selected bet: type amount';
      return;
    }
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return;
    if (n > 20000) n = 20000;
    state.selectedStakes[key] = n;
    if (note) note.textContent = 'Selected bet: ' + n.toLocaleString() + ' coins';
  };

  window.setStake = function (key, value) {
    var balance = typeof getCoins === 'function' ? getCoins() : 20000;
    var max = Math.min(20000, Math.max(100, balance || 20000));
    var n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 100) n = 100;
    if (n > max) n = max;
    state.selectedStakes[key] = n;
    state._stakeDraft[key] = String(n);
    state._stakeTyping[key] = false;
    var input = document.getElementById('stake-' + key);
    if (input) input.value = String(n);
    var note = document.getElementById('stake-note-' + key);
    if (note) note.textContent = 'Selected bet: ' + n.toLocaleString() + ' coins';
  };

  window.readStake = function (key) {
    var input = document.getElementById('stake-' + key);
    var raw = (input && input.value) || state._stakeDraft[key] || state.selectedStakes[key] || 0;
    var n = parseInt(raw, 10);
    state._stakeTyping[key] = false;
    if (!Number.isInteger(n) || n < 100 || n > 20000) {
      if (typeof toast === 'function') toast('Bet amount 100 se 20,000 chips ke beech rakho');
      return 0;
    }
    if (typeof getCoins === 'function' && n > getCoins()) {
      if (typeof toast === 'function') toast('Bet amount aapke chips se zyada nahi ho sakta');
      return 0;
    }
    state.selectedStakes[key] = n;
    state._stakeDraft[key] = String(n);
    return n;
  };

  window.stakeControl = function (key) {
    var balance = typeof getCoins === 'function' ? getCoins() : 0;
    var value = selectedStake(key);
    var draft;
    if (state._stakeTyping[key] && state._stakeDraft[key] != null) {
      draft = state._stakeDraft[key];
    } else if (state._stakeDraft[key] != null && state._stakeDraft[key] !== '') {
      draft = state._stakeDraft[key];
    } else {
      draft = value ? String(value) : '';
    }
    // NO broken inline quotes — use data-stake-key + delegated events
    return '<div class="stake-control">' +
      '<label>BET AMOUNT<br><small>Min 100 · Balance: ' + balance.toLocaleString() + ' coins</small>' +
      '<b id="stake-note-' + key + '" class="selected-stake-note">Selected bet: ' +
      (value ? value.toLocaleString() + ' coins' : 'type amount') + '</b></label>' +
      '<input id="stake-' + key + '" class="stake-amount-input" type="text" inputmode="numeric" ' +
      'pattern="[0-9]*" autocomplete="off" data-stake-key="' + key + '" ' +
      'value="' + String(draft).replace(/"/g, '') + '" ' +
      'placeholder="100" aria-label="Bet amount">' +
      '<div class="stake-chips" role="group" aria-label="Quick bet amount">' +
      '<button type="button" data-stake-set="' + key + '" data-stake-amt="100">100</button>' +
      '<button type="button" data-stake-set="' + key + '" data-stake-amt="500">500</button>' +
      '<button type="button" data-stake-set="' + key + '" data-stake-amt="1000">1K</button>' +
      '<button type="button" data-stake-set="' + key + '" data-stake-amt="5000">5K</button>' +
      '</div></div>';
  };

  // Event delegation — works even after re-render recreates inputs
  if (!window.__stakeDelegateBound) {
    window.__stakeDelegateBound = true;
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var key = t.getAttribute('data-stake-key');
      if (!key) return;
      e.stopPropagation();
      setStakeValue(key, t.value);
    }, true);
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var key = t.getAttribute('data-stake-key');
      if (!key) return;
      state._stakeTyping[key] = true;
    }, true);
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var key = t.getAttribute('data-stake-key');
      if (!key) return;
      state._stakeTyping[key] = false;
      if (t.value) setStake(key, t.value);
    }, true);
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var key = t.getAttribute('data-stake-set');
      var amt = t.getAttribute('data-stake-amt');
      if (!key || !amt) return;
      e.preventDefault();
      setStake(key, amt);
    }, true);
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute('data-stake-key')) return;
      // allow digits, backspace, arrows, tab, delete
      e.stopPropagation();
    }, true);
  }

  // Preserve focused stake input across full-page re-renders
  function installRenderGuard() {
    if (typeof window.render !== 'function' || window.render.__stakeGuard) return;
    var orig = window.render;
    window.render = function () {
      var active = document.activeElement;
      var key = active && active.getAttribute && active.getAttribute('data-stake-key');
      var draft = key ? active.value : null;
      var selStart = key != null ? active.selectionStart : null;
      var selEnd = key != null ? active.selectionEnd : null;
      var out = orig.apply(this, arguments);
      if (key) {
        state._stakeTyping[key] = true;
        if (draft != null) state._stakeDraft[key] = draft;
        var el = document.getElementById('stake-' + key);
        if (el) {
          el.value = draft != null ? draft : el.value;
          try {
            el.focus();
            if (typeof selStart === 'number') el.setSelectionRange(selStart, typeof selEnd === 'number' ? selEnd : selStart);
          } catch (err) {}
        }
      }
      return out;
    };
    window.render.__stakeGuard = true;
  }
  installRenderGuard();
  setTimeout(installRenderGuard, 300);
  setTimeout(installRenderGuard, 1000);

  // Make sure input is clickable (some CSS may block)
  if (!document.getElementById('antpro-stake-css')) {
    var st = document.createElement('style');
    st.id = 'antpro-stake-css';
    st.textContent = [
      '.stake-control input.stake-amount-input, .stake-control input[data-stake-key]{',
      '  pointer-events:auto!important; user-select:text!important; -webkit-user-select:text!important;',
      '  background:#0d1117!important; color:#fff!important; border:1px solid #f0c040!important;',
      '  padding:10px 12px!important; font-size:16px!important; width:100%!important;',
      '  border-radius:6px!important; box-sizing:border-box!important; z-index:5; position:relative;',
      '}',
      '.stake-control{position:relative;z-index:5;pointer-events:auto!important;}',
      '.stake-chips button{pointer-events:auto!important;cursor:pointer;}'
    ].join('');
    document.head.appendChild(st);
  }

  console.log('[AntPro] stake box FIXED — type numbers freely');
})();
