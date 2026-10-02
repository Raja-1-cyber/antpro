/* AntPro live-fix — NO UI redesign. Game logic only: no blink, auto decision, hierarchy + AB joker */
(function () {
  'use strict';

  window.getGamesLive = function () {
    return { virtual: true, 'andar-bahar': true, lucky7: true, 'teen-patti': true, 'dragon-tiger': true };
  };

  function ensureBettingRound(key) {
    var timings = (typeof GAME_TIMINGS !== 'undefined' && GAME_TIMINGS[key]) || { duration: 30, lock: 4 };
    var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
    var r = all[key];
    var needNew = !r || (r.phase !== 'betting' && r.phase !== 'locked');
    if (!needNew && r && r.phase === 'betting') {
      var elapsed = Math.floor((Date.now() - (r.startedAt || Date.now())) / 1000);
      if (elapsed >= (r.duration || timings.duration) + 3) needNew = true;
    }
    if (needNew) {
      var secs = timings.duration || 30;
      all[key] = {
        roundId: 'R-' + Date.now().toString(36).toUpperCase(),
        phase: 'betting', timer: secs, duration: secs,
        lockSeconds: timings.lock != null ? timings.lock : 4,
        forcedWinner: null, startedAt: Date.now()
      };
      if (typeof setLiveRounds === 'function') setLiveRounds(all);
      try {
        fetch('/api/live-rounds/' + encodeURIComponent(key) + '/new', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: secs })
        }).catch(function () {});
      } catch (e) {}
    }
    return all[key];
  }

  window.bettingOpen = function (key) {
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) return false;
    ensureBettingRound(key);
    var r = typeof getLiveRounds === 'function' ? getLiveRounds()[key] : null;
    return !!(r && r.phase === 'betting');
  };

  window.canPlaceBet = function (key) {
    if (typeof state !== 'undefined' && state.user && typeof isBlocked === 'function' && isBlocked(state.user.id)) {
      if (typeof toast === 'function') toast('Account blocked/suspended');
      return false;
    }
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) {
      if (typeof toast === 'function') toast('Result aa raha hai — wait');
      return false;
    }
    ensureBettingRound(key);
    if (typeof state === 'undefined') return true;
    state.resolving = state.resolving || {};
    state.resolving[key] = true;
    return true;
  };

  window.smartDecision = function (key, options, natural) {
    var forced = null;
    try {
      if (typeof getForced === 'function') forced = getForced(key);
      if (!forced) {
        var r = typeof getLiveRounds === 'function' ? getLiveRounds()[key] : null;
        forced = r && r.forcedWinner;
      }
    } catch (e) {}
    if (forced && options && options.indexOf(forced) >= 0) {
      try {
        var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
        if (all[key]) {
          all[key].forcedWinner = null;
          if (typeof setLiveRounds === 'function') setLiveRounds(all);
        }
      } catch (e2) {}
      return forced;
    }
    if (natural != null && options && options.indexOf(natural) >= 0) return natural;
    return options[Math.floor(Math.random() * options.length)];
  };

  function isDealing() {
    if (typeof state === 'undefined') return false;
    return !!(state.andarSpinning || state.l7Spin || state.tpSpin || state.dtSpin);
  }
  function isResolvingAny() {
    if (typeof state === 'undefined' || !state.resolving) return false;
    return Object.keys(state.resolving).some(function (k) { return state.resolving[k]; });
  }

  function installRenderGuard() {
    if (typeof window.render !== 'function' || window.render.__antproGuard) return;
    var orig = window.render;
    window.render = function () {
      if (isResolvingAny() && !isDealing() && !window.render._allow) return;
      return orig.apply(this, arguments);
    };
    window.render.__antproGuard = true;
  }
  setTimeout(installRenderGuard, 0);
  setTimeout(installRenderGuard, 500);

  window.syncSharedRounds = async function () {
    if (isResolvingAny() || isDealing()) return;
    try {
      var r = await fetch('/api/live-rounds', { cache: 'no-store' });
      if (!r.ok) return;
      var data = await r.json();
      if (typeof state !== 'undefined') state.sharedRounds = data;
      try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {}
    } catch (e) {}
  };
  setInterval(function () {
    if (typeof window.syncSharedRounds === 'function') window.syncSharedRounds();
  }, 1000);

  var _finish = typeof finishRound === 'function' ? finishRound : null;
  window.finishRound = function (key) {
    if (_finish) _finish(key);
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.resolving) state.resolving[key] = false;
      ensureBettingRound(key);
      if (typeof window.render === 'function') {
        window.render._allow = true;
        try { window.render(); } finally { window.render._allow = false; }
      }
    }, 3500);
  };

  function safeFind(id) {
    try { return typeof findUserById === 'function' ? findUserById(id) : null; } catch (e) { return null; }
  }
  window.applyCascade = function (bet) {
    if (!bet || bet.rolled_back) return;
    if (typeof creditChips !== 'function') return;
    var playerId = bet.player || bet.playerId;
    if (!playerId) return;
    var pl = safeFind(playerId);
    if (!pl || pl.role !== 'player') return;
    var agent = pl.agentId ? safeFind(pl.agentId) : null;
    var master = agent && agent.masterId ? safeFind(agent.masterId) : null;
    var superId = (master && (master.superId || master.superMasterId)) || (agent && (agent.superId || agent.superMasterId)) || 'SUPER';
    var superM = safeFind(superId);
    var amt = Math.abs(Number(bet.amt) || 0);
    var profit = Math.abs(Number(bet.profit) || 0);
    var won = bet.status === 'won';
    var lost = bet.status === 'lost';
    if (!won && !lost) return;
    var bookPnL = won ? -profit : amt;
    var aPct = Math.min(100, Math.max(0, Number(agent && agent.share) || 0));
    var mPct = Math.min(100, Math.max(0, Number(master && master.share) || 0));
    if (mPct < aPct) mPct = aPct;
    var agentCut = Math.floor(bookPnL * aPct / 100);
    var masterCut = Math.floor(bookPnL * (mPct - aPct) / 100);
    var superCut = bookPnL - agentCut - masterCut;
    var tag = (bet.type || 'GAME') + ' ' + (bet.team || '') + ' ' + playerId;
    if (agent && agentCut) creditChips(agent.id, agentCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    if (master && masterCut) creditChips(master.id, masterCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    if (superM && superCut) creditChips(superM.id, superCut, (won ? 'Share pay win ' : 'Share on loss ') + tag);
    var cPct = Number(agent && agent.commission) || 0;
    if (agent && cPct > 0 && amt > 0) {
      var comm = Math.floor(amt * cPct / 100);
      if (comm) creditChips(agent.id, comm, 'Commission ' + tag);
    }
  };

  window.pushSettledBet = function (partial) {
    var bet = {
      id: typeof uid === 'function' ? uid() : ('B' + Date.now()),
      team: partial.team || partial.side || '',
      type: partial.type || '',
      rate: Number(partial.rate) || 0,
      amt: Math.abs(Number(partial.amt) || 0),
      profit: Math.abs(Number(partial.profit) || 0),
      ts: Date.now(),
      player: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      playerId: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player',
      status: partial.status || 'pending',
      result: partial.result || '',
      rolled_back: false
    };
    if (bet.status === 'won' && bet.rate > 1 && !(partial.profit > 0)) {
      bet.profit = Math.round(bet.amt * (bet.rate - 1));
    }
    if (typeof state !== 'undefined') {
      state.activeBets = state.activeBets || [];
      state.activeBets.unshift(bet);
      if (typeof saveBets === 'function') saveBets();
    }
    if (bet.status === 'won' || bet.status === 'lost') window.applyCascade(bet);
    return bet;
  };

  window.gameTop = function (title, round, cards) {
    var keyMap = { 'ANDAR BAHAR': 'andar-bahar', 'LUCKY 7': 'lucky7', 'TEEN PATTI': 'teen-patti', 'DRAGON TIGER': 'dragon-tiger' };
    var key = keyMap[title];
    var r = key && typeof ensureRound === 'function' ? ensureRound(key) : null;
    var status = '';
    if (r && typeof roundSeconds === 'function') {
      status = r.phase === 'betting' ? ('BET ' + roundSeconds(key) + 's')
        : r.phase === 'locked' ? ('LOCKED ' + roundSeconds(key) + 's')
        : String(r.phase || 'LIVE').toUpperCase();
    }
    return '<div class="game-top">' +
      '<span class="g-title">' + title + '</span>' +
      '<span class="g-meta">' + (status ? status + ' \u00b7 ' : '') + 'Round : ' + (round || '\u2014') + '</span>' +
      '</div>';
  };

  window.andar = function andar() {
    var live = typeof getGamesLive === 'function' ? getGamesLive()['andar-bahar'] : true;
    if (!live) {
      return (typeof topBtn === 'function' ? topBtn() : '') +
        '<div class="view-title">ANDAR BAHAR</div><div style="padding:40px;text-align:center;color:#666">Offline</div>' +
        (typeof back === 'function' ? back() : '');
    }
    var rid = (typeof ensureRound === 'function' && ensureRound('andar-bahar').roundId) || '\u2014';
    var j = state.abJoker;
    var a = (state.andarCards && state.andarCards.andar) || [];
    var b = (state.andarCards && state.andarCards.bahar) || [];
    var ch = typeof cardHTML === 'function' ? cardHTML : function () { return ''; };
    var jokerBlock =
      '<div class="ab-joker-row">' +
        '<div class="live-side-label">Joker</div>' +
        '<div class="card-pair ab-joker-card">' + ch(j || null) + '</div>' +
      '</div>';
    var sides =
      '<div class="ab-sides-row">' +
        '<div class="ab-side">' +
          '<div class="live-side-label">Andar</div>' +
          '<div class="card-pair">' + (a.length ? a.map(ch).join('') : ch(null) + ch(null)) + '</div>' +
        '</div>' +
        '<div class="ab-side">' +
          '<div class="live-side-label">Bahar</div>' +
          '<div class="card-pair">' + (b.length ? b.map(ch).join('') : ch(null) + ch(null)) + '</div>' +
        '</div>' +
      '</div>';
    var hist = (state.abHistory && state.abHistory.length ? state.abHistory : ['R','R','R','R','R','R','R','R','R','R']).slice(0, 10);
    var bets = (state.activeBets || []).filter(function (x) { return x.type === 'AndarBahar'; }).slice(0, 5);
    return '<div class="game-screen">' +
      gameTop('ANDAR BAHAR', rid, '') +
      '<div class="cards-zone live-video-stage">' +
        '<div class="game-live-cards">' + jokerBlock + sides + '</div>' +
        (typeof alwaysGameSpinner === 'function' ? alwaysGameSpinner() : '') +
      '</div>' +
      '<div class="bet-locks">' + (typeof stakeControl === 'function' ? stakeControl('andar-bahar') : '') +
        '<div class="bet-lock-row"><div class="side">Andar</div><div class="amt">0</div><div class="lock" onclick="playAndarBahar(\'Andar\')">' + (typeof lockLabel === 'function' ? lockLabel('andar-bahar') : '\ud83d\udd12') + '</div></div>' +
        '<div class="bet-lock-row"><div class="side">Bahar</div><div class="amt">0</div><div class="lock" onclick="playAndarBahar(\'Bahar\')">' + (typeof lockLabel === 'function' ? lockLabel('andar-bahar') : '\ud83d\udd12') + '</div></div>' +
        '<div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go(\'casino\')">BACK</div></div>' +
      '</div>' +
      '<div class="completed-bets">Completed Casino Bets</div>' +
      '<div class="section-gold result-heading"><span>Last Result</span><span>View All</span></div>' +
      '<div class="last-result">' + hist.map(function (x) { return '<div class="result-dot">' + String(x)[0] + '</div>'; }).join('') + '</div>' +
      '<div class="section-gold">My Bet</div>' +
      '<table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead><tbody>' +
      (bets.length ? bets.map(function (x) {
        return '<tr><td>' + x.team + '</td><td>' + x.rate + '</td><td>' + x.amt + '</td><td>' + (x.result || x.profit) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" style="color:#555">\u2014</td></tr>') +
      '</tbody></table></div>' + (typeof back === 'function' ? back() : '');
  };

  if (!document.getElementById('antpro-ab-joker')) {
    var s = document.createElement('style');
    s.id = 'antpro-ab-joker';
    s.textContent = [
      '.ab-joker-row{display:flex;flex-direction:column;align-items:center;margin-bottom:10px}',
      '.ab-joker-row .live-side-label{color:#ffe566;font-weight:800;font-size:11px;margin-bottom:2px}',
      '.ab-joker-card .p-card{box-shadow:0 0 0 2px #f0c040,0 2px 8px #000a}',
      '.ab-sides-row{display:flex;justify-content:center;gap:28px;flex-wrap:wrap;width:100%}',
      '.ab-side{display:flex;flex-direction:column;align-items:center}',
      '.game-top .g-meta{font-size:10px;color:#aaa}'
    ].join('\n');
    document.head.appendChild(s);
  }

  setTimeout(function () {
    ['andar-bahar', 'lucky7', 'teen-patti', 'dragon-tiger'].forEach(function (k) {
      try { ensureBettingRound(k); } catch (e) {}
    });
    console.log('[AntPro] AB joker center + logic fix');
  }, 300);

  console.log('[AntPro] live-fix minimal + AB joker');
})();

/* Timer-driven casino rounds: betting stays open until the configured lock,
   then cards resolve automatically even when nobody clicks a bet button. */
(function () {
  'use strict';
  var CFG = {'andar-bahar':{duration:20,lock:5},lucky7:{duration:15,lock:4},'teen-patti':{duration:20,lock:5},'dragon-tiger':{duration:15,lock:4}};
  var GAP=2500, roundSeen={};
  function cfg(k){return CFG[k]||{duration:20,lock:0}}
  state.previousResults=state.previousResults||JSON.parse(localStorage.getItem('antpro_previous_results')||'{}');
  window.lockLabel=function(k){return window.canPlaceBet&&window.canPlaceBet(k)?'BET':'LOCKED'};
  function all(){return typeof getLiveRounds==='function'?getLiveRounds():{}}
  function save(a){if(typeof setLiveRounds==='function')setLiveRounds(a)}
  function cur(k){var a=all(),c=cfg(k),r=a[k],age=r?elapsed(r):0;if(!r||r.duration!==c.duration||r.lockSeconds!==c.lock||(!active(k)&&r.phase==='locked'&&age>c.duration+5)){r={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:c.duration,duration:c.duration,lockSeconds:c.lock,forcedWinner:null,startedAt:Date.now()};a[k]=r;save(a);try{fetch('/api/live-rounds/'+encodeURIComponent(k)+'/new',{method:'POST'}).catch(function(){})}catch(e){}}return r}
  function elapsed(r){return Math.max(0,Math.floor((Date.now()-Number(r.startedAt||Date.now()))/1000))}
  function active(k){return !!(state.resolving&&state.resolving[k])}
  function deck(){return typeof freshDeck==='function'?freshDeck():[]}
  function setR(k,p){var a=all(),r=a[k]||cur(k);Object.keys(p||{}).forEach(function(x){r[x]=p[x]});a[k]=r;save(a);return r}
  window.gameTop=function(title,round){var map={'ANDAR BAHAR':'andar-bahar','LUCKY 7':'lucky7','TEEN PATTI':'teen-patti','DRAGON TIGER':'dragon-tiger'},k=map[title],r=k?cur(k):null,status='LIVE',prev=k&&state.previousResults[k]?state.previousResults[k].winner:'—';if(r){var left=Math.max(0,cfg(k).duration-elapsed(r));status=r.phase==='betting'?'BET '+left+'s':r.phase==='locked'?'LOCKED '+left+'s':String(r.phase||'LIVE').toUpperCase()}return '<div class="game-top"><span class="g-title">'+title+'</span><span class="g-meta">'+status+' · Prev: '+prev+' · Round : '+(round||'—')+'</span></div>'}
  window.syncSharedRounds=async function(){if(isResolvingAny()||isDealing())return;try{var raw={};try{raw=JSON.parse(localStorage.getItem('antpro_live_rounds')||'{}')}catch(e){}var res=await fetch('/api/live-rounds',{cache:'no-store'});if(!res.ok)return;var remote=await res.json(),merged={};Object.keys(CFG).forEach(function(k){var l=raw[k],r=remote[k],c=cfg(k);if(l&&r&&l.roundId!==r.roundId&&l.phase==='betting'&&r.phase==='locked'&&elapsed(r)>c.duration+5)merged[k]=l;else merged[k]=r||l});state.sharedRounds=merged;localStorage.setItem('antpro_live_rounds',JSON.stringify(merged))}catch(e){}}
  function reset(k,r){if(roundSeen[k]===r.roundId)return;roundSeen[k]=r.roundId;state.pendingBets=state.pendingBets||{};state.pendingBets[k]=[];if(k==='andar-bahar'){var d=deck();state.abJoker=d.pop()||null;state.andarCards={andar:[],bahar:[]};state.andarSpinning=false}else if(k==='lucky7'){state.l7Card=null;state.l7Spin=false}else if(k==='teen-patti'){state.tpPlayer=[];state.tpDealer=[];state.tpSpin=false}else{state.dtDragon=null;state.dtTiger=null;state.dtSpin=false}}
  function place(k,side,type,rate){var r=cur(k),c=cfg(k);if(r.phase!=='betting'||elapsed(r)>=c.duration-c.lock||active(k)){toast('Betting locked — next round automatic start hoga');return}var amt=readStake(k);if(!amt||getCoins()<amt){if(getCoins()<amt)toast('Chips kam hain');return}syncPlayerChips(getCoins()-amt);state.pendingBets=state.pendingBets||{};state.pendingBets[k]=state.pendingBets[k]||[];state.pendingBets[k].push({team:side,type:type,rate:rate,amt:amt,player:state.user&&state.user.id||'Player'});render()}
  function settle(k,winner){var bets=(state.pendingBets&&state.pendingBets[k])||[];bets.forEach(function(b){var won=b.team===winner,p=Math.round(b.amt*(b.rate-1));if(won)syncPlayerChips(getCoins()+b.amt+p);pushSettledBet({team:b.team,type:b.type,rate:b.rate,amt:b.amt,profit:p,player:b.player,status:won?'won':'lost',result:won?'WON +'+(b.amt+p):'LOST -'+b.amt})});state.pendingBets[k]=[];state.previousResults[k]={winner:winner,at:Date.now()};localStorage.setItem('antpro_previous_results',JSON.stringify(state.previousResults));if(k==='andar-bahar'){state.abHistory=state.abHistory||[];state.abHistory.unshift(winner==='Andar'?'A':'B');state.andarSpinning=false}else if(k==='lucky7')state.l7Spin=false;else if(k==='teen-patti')state.tpSpin=false;else state.dtSpin=false;state.resolving[k]=false;setR(k,{phase:'result',timer:0,result:winner,resultAt:Date.now()});render();setTimeout(function(){if(!active(k))newRound(k)},k==='dragon-tiger'||k==='teen-patti'?3000:2000)}
  function newRound(k){var c=cfg(k),a=all();a[k]={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:c.duration,duration:c.duration,lockSeconds:c.lock,forcedWinner:null,startedAt:Date.now()};save(a);try{fetch('/api/live-rounds/'+encodeURIComponent(k)+'/new',{method:'POST'}).catch(function(){})}catch(e){}reset(k,a[k]);render()}
  function decide(k,opts,n){return smartDecision(k,opts,n)}
  function resolveAB(){var k='andar-bahar',d=deck(),j=state.abJoker,a=[],b=[],first='Andar',win=null;state.resolving[k]=true;state.andarSpinning=true;state.andarCards={andar:[],bahar:[]};render();function done(){settle(k,decide(k,['Andar','Bahar'],win||'Andar'))}function rev(){var c=d.pop();if(!c)return done();(first==='Andar'?a:b).push(c);state.andarCards={andar:a.slice(),bahar:b.slice()};render();if(j&&c.v===j.v)win=first;first=first==='Andar'?'Bahar':'Andar';if(!win)setTimeout(rev,GAP);else setTimeout(done,2000)}rev()}
  function resolveLucky(){var k='lucky7',c=deck()[0];state.resolving[k]=true;state.l7Spin=true;state.l7Card=null;render();state.l7Card=c;state.l7Spin=false;render();var n=cardRank(c)>7?'7 UP':cardRank(c)<7?'7 DOWN':'7';setTimeout(function(){settle(k,decide(k,['7 UP','7','7 DOWN'],n))},2000)}
  function resolveTeen(){var k='teen-patti',d=deck(),p=[d.pop(),d.pop(),d.pop()],q=[d.pop(),d.pop(),d.pop()],i=0;state.resolving[k]=true;state.tpSpin=true;state.tpPlayer=[];state.tpDealer=[];render();function rev(){if(i<6){if(i%2===0)state.tpPlayer.push(p[Math.floor(i/2)]);else state.tpDealer.push(q[Math.floor(i/2)]);i++;render();setTimeout(rev,GAP+500)}else{var ps=handScore(p),ds=handScore(q);setTimeout(function(){settle(k,decide(k,['Team A','Tie','Team B'],ps>ds?'Team A':ds>ps?'Team B':'Tie'))},3000)}}rev()}
  function resolveDragon(){var k='dragon-tiger',d=deck(),x=d.pop(),y=d.pop();state.resolving[k]=true;state.dtSpin=true;state.dtDragon=null;state.dtTiger=null;render();state.dtDragon=x;render();setTimeout(function(){state.dtTiger=y;state.dtSpin=false;render();var n=cardRank(x)>cardRank(y)?'Dragon':cardRank(y)>cardRank(x)?'Tiger':'Tie';setTimeout(function(){settle(k,decide(k,['Dragon','Tie','Tiger'],n))},3000)},GAP)}
  function resolve(k){if(k==='andar-bahar')resolveAB();else if(k==='lucky7')resolveLucky();else if(k==='teen-patti')resolveTeen();else resolveDragon()}
  window.playAndarBahar=function(s){place('andar-bahar',s,'AndarBahar',1.95)};
  window.playLucky7=function(s){place('lucky7',s,'LUCKY 7',s==='7'?11:1.95)};
  window.playTeenPatti=function(s){place('teen-patti',s,'TEEN PATTI',s==='Tie'?8.5:1.98)};
  window.playDragonTiger=function(s){place('dragon-tiger',s,'DRAGON TIGER',s==='Tie'?9:1.95)};
  window.canPlaceBet=function(k){var r=cur(k),c=cfg(k);return r.phase==='betting'&&elapsed(r)<c.duration-c.lock&&!active(k)};
  window.__antproTimerTick=function(){['andar-bahar','lucky7','teen-patti','dragon-tiger'].forEach(function(k){var r=cur(k),c=cfg(k);reset(k,r);var e=elapsed(r);r.timer=Math.max(0,c.duration-e);if(r.phase==='betting'&&e>=c.duration-c.lock){r.phase='locked';save(all())}if(r.phase==='locked'&&e>=c.duration&&!active(k))resolve(k);if(r.phase==='result'&&!active(k)&&Date.now()-Number(r.resultAt||0)>=(k==='dragon-tiger'||k==='teen-patti'?3000:2000))newRound(k)});if(['andar','lucky7','teenpatti','dragontiger'].indexOf(state.view)>=0)render()};
  setInterval(window.__antproTimerTick,1000);setTimeout(window.__antproTimerTick,100);
})();
