/* AntPro login-fix v3 — mobile + laptop */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;

  var DEMO_OTP = '318520';
  var LOGIN_TIMEOUT_MS = 5000;

  function seedDemoUsers() {
    var data = null;
    try {
      if (typeof loadUsers === 'function') data = loadUsers();
    } catch (e) {}
    if (!data || typeof data !== 'object') {
      data = { superMaster: null, superMasters: {}, masters: {}, agents: {}, players: {} };
    }
    data.masters = data.masters || {};
    data.agents = data.agents || {};
    data.players = data.players || {};
    data.superMasters = data.superMasters || {};

    if (!data.masters.MASTER) {
      data.masters.MASTER = {
        id: 'MASTER', name: 'Root Master', role: 'master',
        pass: 'master123', chips: 0, agents: [], status: 'active', share: 100
      };
    } else if (!data.masters.MASTER.pass) {
      data.masters.MASTER.pass = 'master123';
    }
    if (!data.superMasters.SM001) {
      data.superMasters.SM001 = {
        id: 'SM001', name: 'Demo SuperMaster', role: 'supermaster',
        pass: 'super123', chips: 0, agents: ['A1001'], status: 'active',
        parentMasterId: 'MASTER', share: 50
      };
    }
    if (!data.agents.A1001) {
      data.agents.A1001 = {
        id: 'A1001', name: 'Demo Agent', role: 'agent',
        pass: 'agent123', chips: 0, players: ['P2001'], status: 'active',
        masterId: 'MASTER', superId: 'SM001', share: 20
      };
    }
    if (!data.players.P2001) {
      data.players.P2001 = {
        id: 'P2001', name: 'Demo Player', role: 'player',
        pass: 'play123', chips: 100000, agentId: 'A1001', status: 'active', share: 0
      };
    }
    try {
      var key = typeof USERS_KEY !== 'undefined' ? USERS_KEY : 'antpro_users_v3';
      if (typeof normalizeHierarchy === 'function') data = normalizeHierarchy(data);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e3) {}
    return data;
  }

  seedDemoUsers();
  setTimeout(seedDemoUsers, 200);
  setTimeout(seedDemoUsers, 800);

  function localFind(username, password) {
    var id = String(username || '').trim().toUpperCase();
    var p = String(password || '').trim();
    if (!id || !p) return null;
    try {
      if (typeof findAccount === 'function') {
        var a = findAccount(username, password);
        if (a && a.id) return a;
      }
    } catch (e) {}
    var u = seedDemoUsers();
    function check(dict, role) {
      dict = dict || {};
      for (var k in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, k)) continue;
        var row = dict[k];
        if (!row) continue;
        if (String(row.id || k).toUpperCase() === id && String(row.pass || '') === p) {
          return Object.assign({}, row, { role: role, id: row.id || k });
        }
      }
      return null;
    }
    if (u.superMaster && String(u.superMaster.id || '').toUpperCase() === id && String(u.superMaster.pass || '') === p) {
      return Object.assign({}, u.superMaster, { role: 'supermaster' });
    }
    return check(u.superMasters, 'supermaster') ||
      check(u.masters, 'master') ||
      check(u.agents, 'agent') ||
      check(u.players, 'player');
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      });
    });
  }

  function readLoginFields() {
    var userEl = document.getElementById('loginUser');
    var passEl = document.getElementById('loginPass');
    var otpEl = document.getElementById('loginOtp');
    // Mobile autofill often skips oninput — read DOM first, then draft
    var username = '';
    var password = '';
    var otp = '';
    try {
      if (userEl) username = String(userEl.value || '').trim();
      if (passEl) password = String(passEl.value || '').trim();
      if (otpEl) otp = String(otpEl.value || '').trim();
    } catch (e) {}
    if (!username && state.loginDraft) username = String(state.loginDraft.user || '').trim();
    if (!password && state.loginDraft) password = String(state.loginDraft.pass || '').trim();
    if (!otp && state.loginDraft) otp = String(state.loginDraft.otp || '').trim();
    // also check any visible password input in login screen
    if (!password) {
      try {
        var all = document.querySelectorAll('.login-screen input[type="password"], input#loginPass');
        for (var i = 0; i < all.length; i++) {
          if (all[i].value) { password = String(all[i].value).trim(); break; }
        }
      } catch (e2) {}
    }
    state.loginDraft = { user: username, pass: password, otp: otp };
    return { username: username, password: password, otp: otp };
  }

  window.doLogin = async function doLogin() {
    // CRITICAL for mobile: read fields BEFORE any render() — render destroys inputs
    var fields = readLoginFields();
    var username = fields.username;
    var password = fields.password;
    var otp = fields.otp;

    if (state.loginBusy && state._loginStartedAt && Date.now() - state._loginStartedAt > 6000) {
      state.loginBusy = false;
    }
    if (state.loginBusy) {
      if (typeof toast === 'function') toast('Login chal raha hai...');
      return;
    }

    if (!username || !password) {
      if (typeof toast === 'function') toast('ID aur password dono likho');
      return;
    }

    state.loginBusy = true;
    state._loginStartedAt = Date.now();
    // Do NOT render here on mobile — keeps keyboard/fields intact until success

    var safety = setTimeout(function () {
      if (state.loginBusy) {
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Login timeout — phir try karo');
        try { if (typeof render === 'function') render(); } catch (e) {}
      }
    }, 7000);

    try {
      var expected = state.loginRole || 'player';
      var acc = null;
      var fromServer = false;

      // LOCAL first (instant)
      acc = localFind(username, password);

      // SERVER with timeout
      if (!acc) {
        try {
          var response = await withTimeout(
            fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: username,
                password: password,
                id: username,
                pass: password,
                role: expected
              })
            }),
            LOGIN_TIMEOUT_MS
          );
          var result = {};
          try { result = await withTimeout(response.json(), 2500); } catch (e2) { result = {}; }
          if (response.ok && result.user) {
            acc = result.user;
            fromServer = true;
            if (result.token) {
              try { sessionStorage.setItem('antpro_session_token', result.token); } catch (eT) {}
            }
            try {
              var store = seedDemoUsers();
              var role = acc.role || expected;
              var bucket = role === 'player' ? 'players' : role === 'agent' ? 'agents' : role === 'master' ? 'masters' : 'superMasters';
              store[bucket] = store[bucket] || {};
              store[bucket][acc.id] = Object.assign({}, store[bucket][acc.id] || {}, acc, { pass: password, role: role });
              localStorage.setItem(typeof USERS_KEY !== 'undefined' ? USERS_KEY : 'antpro_users_v3', JSON.stringify(store));
            } catch (e3) {}
          }
        } catch (netErr) {}
      } else {
        try {
          fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password, role: expected })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result && result.token) {
              try { sessionStorage.setItem('antpro_session_token', result.token); } catch (e) {}
            }
          }).catch(function () {});
        } catch (e4) {}
      }

      if (!acc) {
        clearTimeout(safety);
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Invalid login — ID/password check karo');
        try { if (typeof render === 'function') render(); } catch (e) {}
        return;
      }

      if (acc.role && expected && acc.role !== expected) {
        clearTimeout(safety);
        state.loginBusy = false;
        var pathMsg = typeof loginPath === 'function' ? loginPath(acc.role) : acc.role;
        if (typeof toast === 'function') toast('Ye ' + acc.role + ' account hai — ' + pathMsg + ' page use karo');
        try { if (typeof render === 'function') render(); } catch (e) {}
        return;
      }

      if (expected !== 'player') {
        if (!otp) {
          clearTimeout(safety);
          state.loginBusy = false;
          if (typeof toast === 'function') toast('OTP likho — demo: ' + DEMO_OTP);
          try { if (typeof render === 'function') render(); } catch (e) {}
          return;
        }
        if (otp !== DEMO_OTP) {
          clearTimeout(safety);
          state.loginBusy = false;
          if (typeof toast === 'function') toast('OTP galat — demo: ' + DEMO_OTP);
          try { if (typeof render === 'function') render(); } catch (e) {}
          return;
        }
      }

      if (typeof isBlocked === 'function' && isBlocked(acc.id)) {
        clearTimeout(safety);
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Account blocked');
        try { if (typeof render === 'function') render(); } catch (e) {}
        return;
      }

      clearTimeout(safety);
      state.user = acc;
      state.loggedIn = true;
      state.loginBusy = false;
      state.loginDraft = { user: '', pass: '', otp: '' };
      try { sessionStorage.setItem('antpro_user', JSON.stringify(acc)); } catch (e5) {}

      if (acc.role === 'player' || !acc.role) {
        if (typeof acc.chips === 'number' && typeof setCoins === 'function') setCoins(acc.chips);
        state.welcome = true;
      }

      if (typeof go === 'function') go('home');
      else { state.view = 'home'; if (typeof render === 'function') render(); }

      if (typeof toast === 'function') {
        toast((acc.role || 'player').toUpperCase() + ' login OK');
      }
    } catch (fatal) {
      clearTimeout(safety);
      state.loginBusy = false;
      if (typeof toast === 'function') toast('Login error — phir try karo');
      console.error('[AntPro] login', fatal);
      try { if (typeof render === 'function') render(); } catch (e) {}
    }
  };

  // Keep loginDraft in sync on every input/change (mobile autofill fires change)
  if (!window.__loginInputBound) {
    window.__loginInputBound = true;
    function syncDraft(e) {
      var t = e.target;
      if (!t || !t.id) return;
      state.loginDraft = state.loginDraft || { user: '', pass: '', otp: '' };
      if (t.id === 'loginUser') state.loginDraft.user = t.value;
      if (t.id === 'loginPass') state.loginDraft.pass = t.value;
      if (t.id === 'loginOtp') state.loginDraft.otp = t.value;
    }
    document.addEventListener('input', syncDraft, true);
    document.addEventListener('change', syncDraft, true);
    document.addEventListener('blur', syncDraft, true);

    // Touch + click on Login button (mobile Safari)
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest ? t.closest('.login-screen button, button.login-submit') : null;
      if (!btn && t.tagName === 'BUTTON') {
        var txt = (t.textContent || '').toLowerCase();
        if (txt.indexOf('login') >= 0 || txt.indexOf('verify otp') >= 0) btn = t;
      }
      if (!btn) return;
      if (state.loggedIn) return;
      // only when login fields exist
      if (!document.getElementById('loginUser')) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.doLogin === 'function') window.doLogin();
    }, true);

    document.addEventListener('touchend', function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest ? t.closest('.login-screen button') : null;
      if (!btn && t.tagName === 'BUTTON') {
        var txt = (t.textContent || '').toLowerCase();
        if (txt.indexOf('login') >= 0 || txt.indexOf('verify') >= 0) btn = t;
      }
      if (!btn || state.loggedIn) return;
      if (!document.getElementById('loginUser')) return;
      // prevent double-fire with click
      if (btn._loginTouch) return;
      btn._loginTouch = true;
      setTimeout(function () { btn._loginTouch = false; }, 500);
      e.preventDefault();
      if (typeof window.doLogin === 'function') window.doLogin();
    }, { passive: false, capture: true });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'loginUser' || t.id === 'loginPass' || t.id === 'loginOtp') {
        e.preventDefault();
        if (typeof window.doLogin === 'function') window.doLogin();
      }
    }, true);
  }

  // Preserve login inputs across accidental re-renders (mobile keyboard)
  function installLoginRenderGuard() {
    if (typeof window.render !== 'function' || window.render.__loginGuard) return;
    var orig = window.render;
    window.render = function () {
      var u = document.getElementById('loginUser');
      var p = document.getElementById('loginPass');
      var o = document.getElementById('loginOtp');
      var draft = {
        user: u ? u.value : (state.loginDraft && state.loginDraft.user) || '',
        pass: p ? p.value : (state.loginDraft && state.loginDraft.pass) || '',
        otp: o ? o.value : (state.loginDraft && state.loginDraft.otp) || ''
      };
      if (draft.user || draft.pass || draft.otp) state.loginDraft = draft;
      var activeId = document.activeElement && document.activeElement.id;
      var out = orig.apply(this, arguments);
      if (!state.loggedIn && (draft.user || draft.pass)) {
        var u2 = document.getElementById('loginUser');
        var p2 = document.getElementById('loginPass');
        var o2 = document.getElementById('loginOtp');
        if (u2 && draft.user) u2.value = draft.user;
        if (p2 && draft.pass) p2.value = draft.pass;
        if (o2 && draft.otp) o2.value = draft.otp;
        try {
          if (activeId) {
            var el = document.getElementById(activeId);
            if (el) el.focus();
          }
        } catch (e) {}
      }
      return out;
    };
    window.render.__loginGuard = true;
  }
  installLoginRenderGuard();
  setTimeout(installLoginRenderGuard, 400);
  setTimeout(installLoginRenderGuard, 1200);

  // Mobile-friendly input attributes after each render
  setInterval(function () {
    if (state.loggedIn) return;
    var u = document.getElementById('loginUser');
    var p = document.getElementById('loginPass');
    if (u) {
      u.setAttribute('autocapitalize', 'off');
      u.setAttribute('autocorrect', 'off');
      u.setAttribute('spellcheck', 'false');
      u.setAttribute('autocomplete', 'username');
      u.style.fontSize = '16px'; // prevent iOS zoom
    }
    if (p) {
      p.setAttribute('autocomplete', 'current-password');
      p.style.fontSize = '16px';
    }
  }, 1000);

  setInterval(function () {
    if (state.loginBusy && state._loginStartedAt && Date.now() - state._loginStartedAt > 8000) {
      state.loginBusy = false;
      try { if (typeof render === 'function') render(); } catch (e) {}
    }
  }, 2000);

  console.log('[AntPro] login-fix v3 mobile-ready | P2001/play123 | OTP ' + DEMO_OTP);
})();
