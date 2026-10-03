/* AntPro cricket-fix — live matches, scores, sessions, player details */
(function () {
  'use strict';
  if (typeof state === 'undefined') return;

  var FB_DIRECT = 'https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app';

  function normalizeFirebaseMatch(id, m) {
    if (typeof window.normalizeFirebaseMatch === 'function') {
      try { return window.normalizeFirebaseMatch(id, m); } catch (e) {}
    }
    var teams = String((m && m.teams) || 'Unknown v Unknown');
    var parts = teams.split(/\s+v(?:s)?\.?\s+/i);
    var score = String((m && m.score) || '—');
    var scoreParts = score.split(/\s+-\s+/);
    var status = String((m && m.status) || 'UPCOMING').toLowerCase();
    return {
      id: String(id),
      name: teams,
      home: parts[0] || teams,
      away: parts.slice(1).join(' v ') || '',
      homeScore: scoreParts[0] && scoreParts[0] !== '—' && scoreParts[0] !== '-' ? scoreParts[0] : '',
      awayScore: scoreParts[1] && scoreParts[1] !== '—' && scoreParts[1] !== '-' ? scoreParts[1] : '',
      score: score,
      status: status,
      statusText: status,
      time: m && m.updated_at ? new Date(Number(m.updated_at)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
      competition: (m && m.competition) || '',
      homeLogo: (m && (m.home_logo || m.homeLogo)) || '',
      awayLogo: (m && (m.away_logo || m.awayLogo)) || '',
      competitionLogo: (m && (m.competition_logo || m.competitionLogo)) || '',
      matchUrl: (m && (m.url || m.matchUrl)) || '',
      live: status === 'live',
      sessions: (m && m.sessions) || {},
      overs: (m && (m.overs != null ? m.overs : m.current_overs)) || '',
      batsmen: Array.isArray(m && m.batsmen) ? m.batsmen : (Array.isArray(m && m.players) ? m.players : []),
      bowler: (m && (m.bowler || m.current_bowler)) || '',
      bowlerStats: (m && (m.bowler_stats || m.bowlerStats)) || {},
      lastBalls: Array.isArray(m && m.last_balls) ? m.last_balls : (Array.isArray(m && m.lastBalls) ? m.lastBalls : []),
      innings: (m && m.innings) || '',
      providerUpdatedAt: (m && m.updated_at) || 0
    };
  }

  function sessionsFromMatch(m) {
    var sessions = (m && m.sessions) || {};
    var entries = Object.entries(sessions);
    if (!entries.length) return [];
    return entries.map(function (pair, id) {
      var name = pair[0];
      var s = pair[1] || {};
      var label = name.endsWith('_over')
        ? (name.split('_')[0] + ' OVER RUN')
        : String(name).replace(/_/g, ' ').toUpperCase();
      return {
        id: id,
        name: label,
        not: s.no_run != null ? s.no_run : (s.not != null ? s.not : '—'),
        yes: s.yes_run != null ? s.yes_run : (s.yes != null ? s.yes : '—'),
        rate: s.rate != null ? s.rate : '—',
        status: s.status || 'SUSPENDED'
      };
    });
  }

  window.fetchLiveCricket = async function fetchLiveCricket() {
    state.liveMatchesLoading = true;
    state.liveMatchesError = '';
    try {
      var list = [];

      // 1) Server proxy /api/firebase/live
      try {
        var firebaseRes = await fetch('/api/firebase/live', { cache: 'no-store' });
        if (firebaseRes.ok) {
          var firebaseData = await firebaseRes.json();
          var entries = Object.entries(firebaseData.live_matches || {});
          var newest = Number(firebaseData.newestUpdate) || entries.reduce(function (max, pair) {
            return Math.max(max, Number(pair[1] && pair[1].updated_at) || 0);
          }, 0);
          // Accept up to 15 min old (scraper can lag)
          var fresh = newest > 0 && (Date.now() - newest) < 900000;
          if (entries.length && (fresh || !list.length)) {
            list = entries.map(function (pair) {
              return normalizeFirebaseMatch(pair[0], pair[1]);
            });
          }
        }
      } catch (e1) {}

      // 2) Direct Firebase (public read) if still empty
      if (!list.length) {
        try {
          var direct = await fetch(FB_DIRECT + '/live_matches.json', { cache: 'no-store' });
          if (direct.ok) {
            var raw = await direct.json();
            var entries2 = Object.entries(raw || {});
            if (entries2.length) {
              list = entries2.map(function (pair) {
                return normalizeFirebaseMatch(pair[0], pair[1]);
              });
            }
          }
        } catch (e2) {}
      }

      // 3) Server /api/cricket/matches
      if (!list.length) {
        try {
          var res = await fetch('/api/cricket/matches', { cache: 'no-store' });
          if (res.ok) {
            var data = await res.json();
            list = (data.matches || []).map(function (m, i) {
              return {
                id: m.id != null ? m.id : i,
                name: m.name || ((m.home || '?') + ' v ' + (m.away || '?')),
                home: m.home || '',
                away: m.away || '',
                homeScore: m.homeScore != null ? m.homeScore : (m.home_score || ''),
                awayScore: m.awayScore != null ? m.awayScore : (m.away_score || ''),
                status: String(m.status || '').toLowerCase(),
                statusText: m.statusText || m.status_text || m.status || '',
                time: m.time || '',
                competition: m.competition || '',
                homeLogo: m.homeLogo || m.home_logo || '',
                awayLogo: m.awayLogo || m.away_logo || '',
                competitionLogo: m.competitionLogo || m.competition_logo || '',
                matchUrl: m.url || m.matchUrl || '',
                overs: m.overs != null ? m.overs : '',
                batsmen: Array.isArray(m.batsmen) ? m.batsmen : [],
                bowler: m.bowler || '',
                bowlerStats: m.bowlerStats || m.bowler_stats || {},
                lastBalls: Array.isArray(m.lastBalls) ? m.lastBalls : (m.last_balls || []),
                innings: m.innings || '',
                live: String(m.status || '').toLowerCase() === 'live',
                sessions: m.sessions || {}
              };
            });
          }
        } catch (e3) {}
      }

      list.sort(function (a, b) {
        function rank(s) { return s === 'live' ? 0 : s === 'upcoming' ? 1 : 2; }
        return rank(a.status) - rank(b.status);
      });

      state.liveMatches = list;
      if (!list.length) state.liveMatchesError = 'No matches right now — scraper empty or offline';
      else state.liveMatchesError = '';
    } catch (e) {
      state.liveMatchesError = 'Live feed temporarily unavailable';
      console.warn('[AntPro] cricket fetch failed', e);
    }
    state.liveMatchesLoading = false;
    if (state.view === 'inplay' || state.view === 'match') {
      try { if (typeof render === 'function') render(); } catch (e) {}
    }
  };

  window.fetchMatchSessions = async function fetchMatchSessions(matchName) {
    state.liveSessionsLoading = true;
    try {
      // Prefer sessions already on the match object
      var list = state.liveMatches || [];
      var found = list.find(function (m) {
        return m.name === matchName || String(m.id) === String(matchName);
      });
      if (found && found.sessions && Object.keys(found.sessions).length) {
        state.liveSessions = sessionsFromMatch(found);
        state.liveSessionsKey = matchName;
        state.liveSessionsLoading = false;
        if (state.view === 'match' && typeof render === 'function') render();
        return;
      }

      var res = await fetch('/api/cricket/sessions?match=' + encodeURIComponent(matchName), { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        state.liveSessions = data.sessions || [];
        state.liveSessionsKey = matchName;
      }
    } catch (e) {
      console.warn('[AntPro] sessions failed', e);
    }
    state.liveSessionsLoading = false;
    if (state.view === 'match' && typeof render === 'function') render();
  };

  // Auto-load when opening inplay
  var _go = typeof go === 'function' ? go : null;
  if (_go && !_go.__cricketHook) {
    window.go = function (view) {
      var r = _go.apply(this, arguments);
      if (view === 'inplay' || view === 'match') {
        setTimeout(function () {
          if (typeof window.fetchLiveCricket === 'function') window.fetchLiveCricket();
        }, 50);
      }
      return r;
    };
    window.go.__cricketHook = true;
  }

  setInterval(function () {
    if (state.view === 'inplay' || state.view === 'match') {
      if (typeof window.fetchLiveCricket === 'function') window.fetchLiveCricket();
    }
  }, 20000);

  // Initial prefetch
  setTimeout(function () {
    if (typeof window.fetchLiveCricket === 'function') window.fetchLiveCricket();
  }, 600);

  console.log('[AntPro] cricket-fix ready — matches + sessions');
})();
