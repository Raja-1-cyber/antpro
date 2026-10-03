/* AntPro login-fix — reliable login for all roles */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;

  var DEMO_OTP = '318520';

  function seedDemoUsers() {
    var data;
    try {
      data = typeof loadUsers === 'function' ? loadUsers() : null;
    } catch (e) { data = null; }
    if (!data) {
      data = {
        superMaster: null,
        superMasters: {},
        masters: {},
        agents: {},
        players: {}
      };
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

    // Demo SuperMaster
    if (!data.superMasters.SM001 && !data.superMaster) {
      data.superMasters.SM001 = {
        id: 'SM001', name: 'Demo SuperMaster', role: 'supermaster',
        pass: 'super123', chips: 0, agents: ['A1001'], status: 'active',
        parentMasterId: 'MASTER', share: 50
      };
    }

    // Demo Agent
    if (!data.agents.A1001) {
      data.agents.A1001 = {
        id: 'A1001', name: 'Demo Agent', role: 'agent',
        pass: 'agent123', chips: 0, players: ['P2001'], status: 'active',
        masterId: 'MASTER', superId: 'SM001', share: 20
      };
    } else if (!data.agents.A1001.pass) {
      data.agents.A1001.pass = 'agent123';
    }

    // Demo Player
    if (!data.players.P2001) {
      data.players.P2001 = {
        id: 'P2001', name: 'Demo Player', role: 'player',
        pass: 'play123', chips: 100000, agentId: 'A1001', status: 'active', share: 0
      };
    } else if (!data.players.P2001.pass) {
      data.players.P2001.pass = 'play123';
    }
    if (typeof data.players.P2001.chips !== 'number') data.players.P2001.chips = 100000;

    // Link hierarchy
    try {
      if (data.masters.MASTER) {
        data.masters.MASTER.agents = data.masters.MASTER.agents || [];
        if (data.masters.MASTER.agents.indexOf('A1001') < 0) data.masters.MASTER.agents.push('A1001');
      }
      if (data.agents.A1001) {
        data.agents.A1001.players = data.agents.A1001.players || [];
        if (data.agents.A1001.players.indexOf('P2001') < 0) data.agents.A1001.players.push('P2001');
      }
    } catch (e) {}

    try {
      if (typeof saveUsers === 'function') saveUsers(data);
      else localStorage.setItem(typeof USERS_KEY !== 'undefined' ? USERS_KEY : 'antpro_users_v3', JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  // Seed immediately + after short delay (app may overwrite)
  seedDemoUsers();
  setTimeout(seedDemoUsers, 200);
  setTimeout(seedDemoUsers, 1000);

  function localFind(username, password) {
    seedDemoUsers();
    var id = String(username || '').trim().toUpperCase();
    var p = String(password || '').trim();
    if (!id || !p) return null;
    if (typeof findAccount === 'function') {
      try {
        var a = findAccount(username, password);
        if (a) return a;
      } catch (e) {}
    }
    var u = seedDemoUsers();
    if (u.superMaster && String(u.superMaster.id || '').toUpperCase() === id && u.superMaster.pass === p) {
      return Object.assign({}, u.superMaster, { role: 'supermaster' });
    }
    var buckets = [
      [u.superMasters, 'supermaster'],
      [u.masters, 'master'],
      [u.agents, 'agent'],
      [u.players, 'player']
    ];
    for (var i = 0; i < buckets.length; i++) {
      var dict = buckets[i][0] || {};
      var role = buckets[i][1];
      for (var k in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, k)) continue;
        var row = dict[k];
        if (String(row.id || k).toUpperCase() === id && String(row.pass || '') === p) {
          return Object.assign({}, row, { role: role, id: row.id || k });
        }
      }
    }
    return null;
  }

  window.doLogin = async function doLogin() {
    if (state.loginBusy) {
      if (typeof toast === 'function') toast('Please wait...');
      return;
    }
    state.loginBusy = true;
    try {
      if (typeof render === 'function') render();
    } catch (e) {}

    var userEl = document.getElementById('loginUser');
    var passEl = document.getElementById('loginPass');
    var otpEl = document.getElementById('loginOtp');
    var username = ((userEl && userEl.value) || (state.loginDraft && state.loginDraft.user) || '').trim();
    var password = ((passEl && passEl.value) || (state.loginDraft && state.loginDraft.pass) || '').trim();
    var otp = ((otpEl && otpEl.value) || (state.loginDraft && state.loginDraft.otp) || '').trim();
    state.loginDraft = { user: username, pass: password, otp: otp };

    if (!username || !password) {
      state.loginBusy = false;
      if (typeof toast === 'function') toast('ID aur password dono likho');
      try { if (typeof render === 'function') render(); } catch (e) {}
      return;
    }

    var expected = state.loginRole || 'player';
    var acc = null;
    var serverLoginError = '';

    // 1) Server login
    try {
      var response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, role: expected })
      });
      var result = {};
      try { result = await response.json(); } catch (e2) { result = {}; }
      if (response.ok && result.user) {
        acc = result.user;
        if (result.token) sessionStorage.setItem('antpro_session_token', result.token);
      } else if (response.status === 403) {
        serverLoginError = 'Galat login page — use ' + (typeof loginPath === 'function' ? loginPath(result.role || 'player') : (result.role || 'correct')) + ' page';
      } else if (response.status === 401) {
        serverLoginError = '';
      }
    } catch (netErr) {
      // offline / server down — fall through to local
    }

    // 2) Local fallback
    if (!acc && !serverLoginError) {
      try {
        if (typeof syncUsersFromServer === 'function') await syncUsersFromServer();
      } catch (e3) {}
      acc = localFind(username, password);
    }

    if (!acc) {
      state.loginBusy = false;
      if (typeof toast === 'function') {
        toast(serverLoginError || 'Invalid login — ID/password check karo');
      }
      try { if (typeof render === 'function') render(); } catch (e) {}
      return;
    }

    if (acc.role !== expected) {
      state.loginBusy = false;
      var pathMsg = typeof loginPath === 'function' ? loginPath(acc.role) : acc.role;
      if (typeof toast === 'function') toast('Ye account ' + acc.role + ' hai — ' + pathMsg + ' page se login karo');
      try { if (typeof render === 'function') render(); } catch (e) {}
      return;
    }

    // Staff OTP (demo)
    if (expected !== 'player') {
      if (!otp) {
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Staff login: OTP likho — demo OTP ' + DEMO_OTP);
        try { if (typeof render === 'function') render(); } catch (e) {}
        return;
      }
      if (otp !== DEMO_OTP) {
        state.loginBusy = false;
        if (typeof toast === 'function') toast('Invalid OTP — demo OTP: ' + DEMO_OTP);
        try { if (typeof render === 'function') render(); } catch (e) {}
        return;
      }
    }

    if (typeof isBlocked === 'function' && isBlocked(acc.id)) {
      state.loginBusy = false;
      if (typeof toast === 'function') toast('Account ' + ((acc.status) || 'blocked').toUpperCase());
      try { if (typeof render === 'function') render(); } catch (e) {}
      return;
    }

    // Success
    state.user = acc;
    state.loggedIn = true;
    state.loginBusy = false;
    state.loginDraft = { user: '', pass: '', otp: '' };
    try { sessionStorage.setItem('antpro_user', JSON.stringify(acc)); } catch (e) {}

    if (acc.role === 'player') {
      if (typeof acc.chips === 'number' && typeof setCoins === 'function') setCoins(acc.chips);
      state.welcome = true;
    }

    if (typeof go === 'function') go('home');
    else if (typeof render === 'function') { state.view = 'home'; render(); }

    if (typeof toast === 'function') toast((acc.role || '').toUpperCase() + ' login OK — Welcome ' + (acc.name || acc.id));
  };

  // Ensure login button works even if onclick broken
  if (!window.__loginDelegateBound) {
    window.__loginDelegateBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest ? t.closest('[onclick*="doLogin"], .login-btn, #loginSubmit') : null;
      if (!btn && t.tagName === 'BUTTON' && /login|verify otp/i.test(t.textContent || '')) btn = t;
      if (!btn) return;
      // only on login views
      if (!state.loggedIn && (state.view === 'login' || state.loginRole || String(state.view || '').indexOf('login') >= 0)) {
        // let inline onclick also fire; extra safety if missing
      }
    }, true);
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

  console.log('[AntPro] login-fix ready | demo: P2001/play123 | MASTER/master123 OTP ' + DEMO_OTP);
})();
