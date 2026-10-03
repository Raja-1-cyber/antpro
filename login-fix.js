/* AntPro login-fix v2 — never stuck, works on new devices */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;

  var DEMO_OTP = '318520';
  var LOGIN_TIMEOUT_MS = 4000;

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

    // Only ADD missing — never delete existing accounts
    if (!data.masters.MASTER) {
      data.masters.MASTER = {
        id: 'MASTER', name: 'Root Master', role: 'master',
        pass: 'master123', chips: 0, agents: [], status: 'active', share: 100
      };
    } else if (!data.masters.MASTER.pass) {
      data.masters.MASTER.pass = data.masters.MASTER.pass || 'master123';
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
      if (typeof saveUsers === 'function') {
        // saveUsers also POSTs server — use local only to avoid loop during login
        try {
          var key = typeof USERS_KEY !== 'undefined' ? USERS_KEY : 'antpro_users_v3';
          // Prefer normalize if available without network
          if (typeof normalizeHierarchy === 'function') data = normalizeHierarchy(data);
          localStorage.setItem(key, JSON.stringify(data));
        } catch (e2) {}
      } else {
        localStorage.setItem('antpro_users_v3', JSON.stringify(data));
      }
    } catch (e3) {}
    return data;
  }

  seedDemoUsers();
  setTimeout(seedDemoUsers, 300);

  function localFind(username, password) {
    var id = String(username || '').trim().toUpperCase();
    var p = String(password || '').trim();
    if (!id || !p) return null;

    // Try app findAccount first
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

  function finishBusy() {
    state.loginBusy = false;
    try { if (typeof render === 'function') render(); } catch (e) {}
  }

  window.doLogin = async function doLogin() {
    // Force unlock if stuck from previous attempt
    if (state.loginBusy && state._loginStartedAt && Date.now() - state._loginStartedAt > 6000) {
      state.loginBusy = false;
    }
    if (state.loginBusy) {
      if (typeof toast === 'function') toast('Login chal raha hai... wait');
      return;
    }

    state.loginBusy = true;
    state._loginStartedAt = Date.now();
    try { if (typeof render === 'function') render(); } catch (e) {}

    // Safety unlock after 6s no matter what
    var safety = setTimeout(function () {
      if (state.loginBusy) {
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Login timeout — phir try karo');
        try { if (typeof render === 'function') render(); } catch (e) {}
      }
    }, 6000);

    try {
      var userEl = document.getElementById('loginUser');
      var passEl = document.getElementById('loginPass');
      var otpEl = document.getElementById('loginOtp');
      var username = ((userEl && userEl.value) || (state.loginDraft && state.loginDraft.user) || '').trim();
      var password = ((passEl && passEl.value) || (state.loginDraft && state.loginDraft.pass) || '').trim();
      var otp = ((otpEl && otpEl.value) || (state.loginDraft && state.loginDraft.otp) || '').trim();
      state.loginDraft = { user: username, pass: password, otp: otp };

      if (!username || !password) {
        clearTimeout(safety);
        finishBusy();
        if (typeof toast === 'function') toast('ID aur password dono likho');
        return;
      }

      var expected = state.loginRole || 'player';
      var acc = null;
      var fromServer = false;

      // 1) LOCAL FIRST (instant — works offline / new device with seeded demos)
      acc = localFind(username, password);

      // 2) SERVER (with hard timeout — never hang)
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
          try { result = await withTimeout(response.json(), 2000); } catch (e2) { result = {}; }
          if (response.ok && result.user) {
            acc = result.user;
            fromServer = true;
            if (result.token) sessionStorage.setItem('antpro_session_token', result.token);
            // Keep password locally so next find works
            try {
              var store = seedDemoUsers();
              var role = acc.role || expected;
              var bucket = role === 'player' ? 'players' : role === 'agent' ? 'agents' : role === 'master' ? 'masters' : 'superMasters';
              store[bucket] = store[bucket] || {};
              store[bucket][acc.id] = Object.assign({}, store[bucket][acc.id] || {}, acc, { pass: password, role: role });
              localStorage.setItem(typeof USERS_KEY !== 'undefined' ? USERS_KEY : 'antpro_users_v3', JSON.stringify(store));
            } catch (e3) {}
          }
        } catch (netErr) {
          // timeout or network — continue with local only
        }
      } else {
        // Still try server in background for token (non-blocking)
        try {
          fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password, role: expected })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result && result.token) sessionStorage.setItem('antpro_session_token', result.token);
          }).catch(function () {});
        } catch (e4) {}
      }

      if (!acc) {
        clearTimeout(safety);
        finishBusy();
        if (typeof toast === 'function') {
          toast('Invalid login — ID/password galat ya account is device/server pe nahi');
        }
        return;
      }

      // Role portal check
      if (acc.role && expected && acc.role !== expected) {
        clearTimeout(safety);
        finishBusy();
        var pathMsg = typeof loginPath === 'function' ? loginPath(acc.role) : acc.role;
        if (typeof toast === 'function') toast('Ye ' + acc.role + ' account hai — ' + pathMsg + ' page se login karo');
        return;
      }

      // Staff OTP
      if (expected !== 'player') {
        if (!otp) {
          clearTimeout(safety);
          finishBusy();
          if (typeof toast === 'function') toast('OTP likho — demo: ' + DEMO_OTP);
          return;
        }
        if (otp !== DEMO_OTP) {
          clearTimeout(safety);
          finishBusy();
          if (typeof toast === 'function') toast('OTP galat — demo OTP: ' + DEMO_OTP);
          return;
        }
      }

      if (typeof isBlocked === 'function' && isBlocked(acc.id)) {
        clearTimeout(safety);
        finishBusy();
        if (typeof toast === 'function') toast('Account blocked');
        return;
      }

      // SUCCESS
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
        toast((acc.role || 'player').toUpperCase() + ' login OK' + (fromServer ? '' : ' (local)'));
      }
    } catch (fatal) {
      clearTimeout(safety);
      finishBusy();
      if (typeof toast === 'function') toast('Login error — phir try karo');
      console.error('[AntPro] login error', fatal);
    }
  };

  // Enter key always works
  if (!window.__loginKeyBound) {
    window.__loginKeyBound = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'loginUser' || t.id === 'loginPass' || t.id === 'loginOtp') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.doLogin === 'function') window.doLogin();
      }
    }, true);
  }

  // Auto-unstick loginBusy if page left hanging
  setInterval(function () {
    if (state.loginBusy && state._loginStartedAt && Date.now() - state._loginStartedAt > 8000) {
      state.loginBusy = false;
      try { if (typeof render === 'function') render(); } catch (e) {}
    }
  }, 2000);

  console.log('[AntPro] login-fix v2 — no stick | demo P2001/play123 | OTP ' + DEMO_OTP);
})();
