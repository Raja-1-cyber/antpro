/* AntPro stake-fix — typeable bet amount box */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;
  state.selectedStakes = state.selectedStakes || {};
  state._stakeTyping = state._stakeTyping || {};

  window.selectedStake = function (key) {
    var balance = typeof getCoins === 'function' ? getCoins() : 0;
    var saved = Number(state.selectedStakes[key]);
    if (Number.isInteger(saved) && saved >= 100 && saved <= Math.min(20000, Math.max(100, balance))) return saved;
    return balance >= 100 ? 100 : 0;
  };

  // While typing: do NOT force min 100, do NOT re-render
  window.setStakeValue = function (key, value) {
    state._stakeTyping[key] = true;
    var raw = String(value == null ? '' : value).replace(/[^0-9]/g, '');
    var input = document.getElementById('stake-' + key);
    if (input && input.value !== raw) {
      var pos = input.selectionStart;
      input.value = raw;
      try { input.setSelectionRange(pos, pos); } catch (e) {}
    }
    if (raw === '') {
      var note = document.getElementById('stake-note-' + key);
      if (note) note.textContent = 'Selected bet: — type amount';
      return;
    }
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    // soft save while typing (allow any positive int up to 20000)
    if (n >= 1 && n <= 20000) {
      state.selectedStakes[key] = n;
      var note2 = document.getElementById('stake-note-' + key);
      if (note2) note2.textContent = 'Selected bet: ' + n.toLocaleString() + ' coins';
    }
  };

  window.setStake = function (key, value) {
    var max = Math.min(20000, typeof getCoins === 'function' ? getCoins() : 20000);
    var n = Math.max(100, Math.min(max, Number(value) || 100));
    state.selectedStakes[key] = n;
    state._stakeTyping[key] = false;
    var input = document.getElementById('stake-' + key);
    if (input) input.value = String(n);
    var note = document.getElementById('stake-note-' + key);
    if (note) note.textContent = 'Selected bet: ' + n.toLocaleString() + ' coins';
  };

  window.readStake = function (key) {
    var input = document.getElementById('stake-' + key);
    var n = Number((input && input.value) || state.selectedStakes[key] || 0);
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
    return n;
  };

  window.stakeControl = function (key) {
    var balance = typeof getCoins === 'function' ? getCoins() : 0;
    var value = selectedStake(key);
    // If user is currently typing in this field, keep their draft value
    var draft = '';
    var existing = document.getElementById('stake-' + key);
    if (existing && document.activeElement === existing) {
      draft = existing.value;
    } else if (state._stakeTyping[key] && existing) {
      draft = existing.value;
    } else {
      draft = value ? String(value) : '';
    }
    var maxAttr = Math.min(20000, Math.max(100, balance));
    return '<div class="stake-control">' +
      '<label>BET AMOUNT<br><small>Min 100 · Balance: ' + balance.toLocaleString() + ' coins</small>' +
      '<b id="stake-note-' + key + '" class="selected-stake-note">Selected bet: ' + (value ? value.toLocaleString() : '—') + ' coins</b></label>' +
      '<input id="stake-' + key + '" type="text" inputmode="numeric" pattern="[0-9]*" ' +
      'min="100" max="' + maxAttr + '" value="' + draft + '" ' +
      'aria-label="Bet amount" autocomplete="off" ' +
      'onfocus="state._stakeTyping[\\' + key + '\\']=true" ' +
      'onblur="state._stakeTyping[\\' + key + '\\']=false;setStake(\\' + key + '\\',this.value||100)" ' +
      'oninput="setStakeValue(\\' + key + '\\',this.value)" ' +
      'onkeydown="event.stopPropagation()">' +
      '<div class="stake-chips" role="group" aria-label="Quick bet amount">' +
      '<button type="button" onclick="setStake(\\' + key + '\\',100)">100</button>' +
      '<button type="button" onclick="setStake(\\' + key + '\\',500)">500</button>' +
      '<button type="button" onclick="setStake(\\' + key + '\\',1000)">1K</button>' +
      '<button type="button" onclick="setStake(\\' + key + '\\',5000)">5K</button>' +
      '</div></div>';
  };

  // Preserve focused stake input across timer re-renders
  var _render = typeof window.render === 'function' ? window.render : null;
  if (_render && !_render.__stakeGuard) {
    window.render = function () {
      var active = document.activeElement;
      var stakeId = active && active.id && String(active.id).indexOf('stake-') === 0 ? active.id : null;
      var draft = stakeId ? active.value : null;
      var selStart = stakeId ? active.selectionStart : null;
      var selEnd = stakeId ? active.selectionEnd : null;
      var out = _render.apply(this, arguments);
      if (stakeId) {
        var el = document.getElementById(stakeId);
        if (el) {
          if (draft != null) el.value = draft;
          try {
            el.focus();
            if (selStart != null) el.setSelectionRange(selStart, selEnd != null ? selEnd : selStart);
          } catch (e) {}
        }
      }
      return out;
    };
    window.render.__stakeGuard = true;
  }

  console.log('[AntPro] stake box typing fixed');
})();
