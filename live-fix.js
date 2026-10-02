/* AntPro live-fix — AB joker + Teen no-Tie + DT Tie 11x */
(function () {
  'use strict';
  window.getGamesLive = function () {
    return { virtual: true, 'andar-bahar': true, lucky7: true, 'teen-patti': true, 'dragon-tiger': true };
  };
  function ensureBettingRound(key) {
    var timings = (typeof GAME_TIMINGS !== 'undefined' && GAME_TIMINGS[key]) || { duration: 30, lock: 4 };
    var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {};
    var r = all[key];
    var needNew = !r || (r.phase !== 'betting' && r.phase !== 'locked' && r.phase !== 'revealing' && r.phase !== 'result');
    if (needNew) {
      var secs = timings.duration || 30;
      all[key] = { roundId: 'R-' + Date.now().toString(36).toUpperCase(), phase: 'betting', timer: secs, duration: secs, lockSeconds: timings.lock != null ? timings.lock : 4, forcedWinner: null, startedAt: Date.now() };
      if (typeof setLiveRounds === 'function') setLiveRounds(all);
      try { fetch('/api/live-rounds/' + encodeURIComponent(key) + '/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: secs }) }).catch(function () {}); } catch (e) {}
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
    if (typeof state !== 'undefined' && state.user && typeof isBlocked === 'function' && isBlocked(state.user.id)) { if (typeof toast === 'function') toast('Account blocked/suspended'); return false; }
    if (typeof state !== 'undefined' && state.resolving && state.resolving[key]) { if (typeof toast === 'function') toast('Result aa raha hai — wait'); return false; }
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
        if (!forced && r && r.phase === 'result' && r.result) forced = r.result;
      }
    } catch (e) {}
    if ((key === 'andar-bahar' || key === 'teen-patti') && forced === 'Tie') forced = null;
    if (forced && options && options.indexOf(forced) >= 0) {
      try { var all = typeof getLiveRounds === 'function' ? getLiveRounds() : {}; if (all[key]) { all[key].forcedWinner = null; if (typeof setLiveRounds === 'function') setLiveRounds(all); } } catch (e2) {}
      return forced;
    }
    if (natural != null && options && options.indexOf(natural) >= 0) return natural;
    if (key === 'andar-bahar') {
      var abOpts = options.filter(function (o) { return o === 'Andar' || o === 'Bahar'; });
      if (abOpts.length) return abOpts[Math.floor(Math.random() * abOpts.length)];
    }
    if (key === 'teen-patti') {
      var tpOpts = options.filter(function (o) { return o === 'Team A' || o === 'Team B'; });
      if (tpOpts.length) return tpOpts[Math.floor(Math.random() * tpOpts.length)];
    }
    return options[Math.floor(Math.random() * options.length)];
  };
  function isDealing() { if (typeof state === 'undefined') return false; return !!(state.andarSpinning || state.l7Spin || state.tpSpin || state.dtSpin); }
  function isResolvingAny() { if (typeof state === 'undefined' || !state.resolving) return false; return Object.keys(state.resolving).some(function (k) { return state.resolving[k]; }); }
  function installRenderGuard() {
    if (typeof window.render !== 'function' || window.render.__antproGuard) return;
    var orig = window.render;
    window.render = function () { if (isResolvingAny() && !isDealing() && !window.render._allow) return; return orig.apply(this, arguments); };
    window.render.__antproGuard = true;
  }
  setTimeout(installRenderGuard, 0); setTimeout(installRenderGuard, 500);
  window.syncSharedRounds = async function () {
    if (typeof state !== 'undefined' && (!state.loggedIn || ['andar','lucky7','teenpatti','dragontiger'].indexOf(state.view) < 0)) return;
    if (isResolvingAny() || isDealing()) return;
    try { var r = await fetch('/api/live-rounds', { cache: 'no-store' }); if (!r.ok) return; var data = await r.json(); if (typeof state !== 'undefined') state.sharedRounds = data; try { localStorage.setItem('antpro_live_rounds', JSON.stringify(data)); } catch (e) {} } catch (e) {}
  };
  setInterval(function () { if (typeof window.syncSharedRounds === 'function') window.syncSharedRounds(); }, 500);
  var _finish = typeof finishRound === 'function' ? finishRound : null;
  window.finishRound = function (key) {
    if (_finish) _finish(key);
    setTimeout(function () {
      if (typeof state !== 'undefined' && state.resolving) state.resolving[key] = false;
      ensureBettingRound(key);
      if (typeof window.render === 'function') { window.render._allow = true; try { window.render(); } finally { window.render._allow = false; } }
    }, 3500);
  };
  window.applyCascade = function () {};
  window.pushSettledBet = function (partial) {
    var bet = { id: typeof uid === 'function' ? uid() : ('B' + Date.now()), team: partial.team || partial.side || '', type: partial.type || '', rate: Number(partial.rate) || 0, amt: Math.abs(Number(partial.amt) || 0), profit: Math.abs(Number(partial.profit) || 0), ts: Date.now(), player: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player', playerId: partial.player || (typeof state !== 'undefined' && state.user && state.user.id) || 'Player', status: partial.status || 'pending', result: partial.result || '', rolled_back: false };
    if (bet.status === 'won' && bet.rate > 1 && !(partial.profit > 0)) bet.profit = Math.round(bet.amt * (bet.rate - 1));
    if (typeof state !== 'undefined') { state.activeBets = state.activeBets || []; state.activeBets.unshift(bet); if (typeof saveBets === 'function') saveBets(); }
    if (bet.status === 'won' || bet.status === 'lost') window.applyCascade(bet);
    return bet;
  };

  /* ANDAR BAHAR — joker center */
  window.andar = function () {
    var live = typeof getGamesLive === 'function' ? getGamesLive()['andar-bahar'] : true;
    if (!live) return (typeof topBtn === 'function' ? topBtn() : '') + '<div class="view-title">ANDAR BAHAR</div><div style="padding:40px;text-align:center;color:#666">Offline</div>' + (typeof back === 'function' ? back() : '');
    var rid = (typeof ensureRound === 'function' && ensureRound('andar-bahar').roundId) || '—';
    var j = state.abJoker, a = (state.andarCards && state.andarCards.andar) || [], b = (state.andarCards && state.andarCards.bahar) || [];
    var ch = typeof cardHTML === 'function' ? cardHTML : function () { return ''; };
    var hist = (state.abHistory && state.abHistory.length ? state.abHistory : ['R','R','R','R','R','R','R','R','R','R']).slice(0, 10);
    var bets = (state.activeBets || []).filter(function (x) { return x.type === 'AndarBahar'; }).slice(0, 5);
    return '<div class="game-screen">' + (typeof gameTop === 'function' ? gameTop('ANDAR BAHAR', rid) : '') +
      '<div class="cards-zone live-video-stage"><div class="game-live-cards">' +
      '<div class="ab-joker-row"><div class="live-side-label ab-joker-label">★ JOKER ★</div><div class="card-pair ab-joker-card">' + ch(j || null) + '</div></div>' +
      '<div class="ab-sides-row"><div class="ab-side"><div class="live-side-label">Andar</div><div class="card-pair">' + (a.length ? a.map(ch).join('') : ch(null) + ch(null)) + '</div></div>' +
      '<div class="ab-side"><div class="live-side-label">Bahar</div><div class="card-pair">' + (b.length ? b.map(ch).join('') : ch(null) + ch(null)) + '</div></div></div></div>' +
      (typeof alwaysGameSpinner === 'function' ? alwaysGameSpinner() : '') + '</div>' +
      '<div class="bet-locks">' + (typeof stakeControl === 'function' ? stakeControl('andar-bahar') : '') +
      '<div class="bet-lock-row"><div class="side">Andar</div><div class="amt">' + (typeof betAmountFor === 'function' ? betAmountFor('andar-bahar','Andar') : 0) + '</div><div class="lock" onclick="playAndarBahar(\'Andar\')">' + (typeof lockLabel === 'function' ? lockLabel('andar-bahar') : '🔒') + '</div></div>' +
      '<div class="bet-lock-row"><div class="side">Bahar</div><div class="amt">' + (typeof betAmountFor === 'function' ? betAmountFor('andar-bahar','Bahar') : 0) + '</div><div class="lock" onclick="playAndarBahar(\'Bahar\')">' + (typeof lockLabel === 'function' ? lockLabel('andar-bahar') : '🔒') + '</div></div>' +
      '<div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go(\'casino\')">BACK</div></div></div>' +
      '<div class="completed-bets">Completed Casino Bets</div><div class="section-gold result-heading"><span>Last Result</span><span>View All</span></div>' +
      '<div class="last-result">' + hist.map(function (x) { return '<div class="result-dot">' + String(x)[0] + '</div>'; }).join('') + '</div>' +
      '<div class="section-gold">My Bet</div><table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead><tbody>' +
      (bets.length ? bets.map(function (x) { return '<tr><td>' + x.team + '</td><td>' + x.rate + '</td><td>' + x.amt + '</td><td>' + (x.result || x.profit) + '</td></tr>'; }).join('') : '<tr><td colspan="4" style="color:#555">—</td></tr>') +
      '</tbody></table></div>' + (typeof back === 'function' ? back() : '');
  };

  /* TEEN PATTI — no Tie */
  window.teenpatti = function () {
    var live = typeof getGamesLive === 'function' ? getGamesLive()['teen-patti'] : true;
    if (!live) return (typeof topBtn === 'function' ? topBtn() : '') + '<div class="view-title">TEEN PATTI</div><div style="padding:40px;text-align:center;color:#666">Offline</div>' + (typeof back === 'function' ? back() : '');
    var rid = (typeof ensureRound === 'function' && ensureRound('teen-patti').roundId) || '—';
    var ph = state.tpPlayer || [], dh = state.tpDealer || [];
    var ch = typeof cardHTML === 'function' ? cardHTML : function () { return ''; };
    var bets = (state.activeBets || []).filter(function (x) { return x.type === 'TEEN PATTI'; }).slice(0, 5);
    return '<div class="game-screen">' + (typeof gameTop === 'function' ? gameTop('TEEN PATTI', rid) : '') +
      '<div class="cards-zone live-video-stage"><div class="game-live-cards">' +
      '<div class="live-side-label">Team A</div><div class="card-pair">' + (ph.length ? ph.map(ch).join('') : ch(null) + ch(null) + ch(null)) + '</div>' +
      '<div class="live-side-label">Team B</div><div class="card-pair">' + (dh.length ? dh.map(ch).join('') : ch(null) + ch(null) + ch(null)) + '</div></div>' +
      (typeof alwaysGameSpinner === 'function' ? alwaysGameSpinner() : '') + '</div>' +
      '<div class="bet-locks">' + (typeof stakeControl === 'function' ? stakeControl('teen-patti') : '') +
      '<div class="bet-lock-row"><div class="side">Team A</div><div class="amt">' + (typeof betAmountFor === 'function' ? betAmountFor('teen-patti','Team A') : 0) + '</div><div class="lock" onclick="playTeenPatti(\'Team A\')">' + (typeof lockLabel === 'function' ? lockLabel('teen-patti') : '🔒') + '</div></div>' +
      '<div class="bet-lock-row"><div class="side">Team B</div><div class="amt">' + (typeof betAmountFor === 'function' ? betAmountFor('teen-patti','Team B') : 0) + '</div><div class="lock" onclick="playTeenPatti(\'Team B\')">' + (typeof lockLabel === 'function' ? lockLabel('teen-patti') : '🔒') + '</div></div>' +
      '<div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go(\'casino\')">BACK</div></div></div>' +
      (typeof previousResultsHTML === 'function' ? previousResultsHTML() : '') +
      '<div class="completed-bets">Completed Casino Bets</div><div class="section-gold">My Bet</div>' +
      '<table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead><tbody>' +
      (bets.length ? bets.map(function (x) { return '<tr><td>' + x.team + '</td><td>' + x.rate + '</td><td>' + x.amt + '</td><td>' + (x.result || x.profit) + '</td></tr>'; }).join('') : '<tr><td colspan="4" style="color:#555">—</td></tr>') +
      '</tbody></table></div>' + (typeof back === 'function' ? back() : '');
  };

  if (!document.getElementById('antpro-ab-joker')) {
    var s = document.createElement('style');
    s.id = 'antpro-ab-joker';
    s.textContent = '.ab-joker-row{display:flex;flex-direction:column;align-items:center;margin:6px 0 14px;padding:8px 12px;background:linear-gradient(180deg,#1a1508 0%,#0d1117 100%);border:1px solid #f0c04055;border-radius:10px}.ab-joker-label{color:#ffe566!important;font-weight:900;font-size:12px;letter-spacing:2px;margin-bottom:4px;text-shadow:0 0 8px #f0c04088}.ab-joker-card .p-card{transform:scale(1.15);box-shadow:0 0 0 3px #f0c040,0 4px 16px #000a;margin:4px}.ab-sides-row{display:flex;justify-content:center;gap:28px;flex-wrap:wrap;width:100%}.ab-side{display:flex;flex-direction:column;align-items:center}';
    document.head.appendChild(s);
  }
  console.log('[AntPro] AB joker + Teen no-Tie');
})();

(function () {
  'use strict';
  var CFG = {'andar-bahar':{duration:20,lock:5},lucky7:{duration:15,lock:4},'teen-patti':{duration:20,lock:5},'dragon-tiger':{duration:15,lock:4}};
  var GAP_AB=4000, GAP_TEEN=4000, GAP_DT=2500, RESULT_HOLD=2000, RESULT_HOLD_DT=3000, RESULT_HOLD_TEEN=3000, RESULT_HOLD_L7=2000, L7_FLIP_DELAY=2000, roundSeen={}, runToken={};
  function cfg(k){return CFG[k]||{duration:20,lock:0}}
  window.applyCascade=function(){};
  state.previousResults=state.previousResults||JSON.parse(localStorage.getItem('antpro_previous_results')||'{}');
  window.lockLabel=function(k){return window.bettingOpen&&window.bettingOpen(k)?'BET':'LOCKED'};
  function all(){return typeof getLiveRounds==='function'?getLiveRounds():{}}
  function save(a){if(typeof setLiveRounds==='function')setLiveRounds(a)}
  function cur(k){var a=all(),c=cfg(k),r=a[k];var invalid=!r||!r.roundId||!Number.isFinite(Number(r.duration))||Number(r.duration)<=0||!Number.isFinite(Number(r.lockSeconds))||Number(r.lockSeconds)!==Number(c.lock)||Number(r.lockSeconds)<0||Number(r.lockSeconds)>=Number(r.duration);if(invalid||(!active(k)&&r.phase!=='betting'&&r.phase!=='locked'&&r.phase!=='revealing'&&r.phase!=='result')){r={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:c.duration,duration:c.duration,lockSeconds:c.lock,forcedWinner:null,startedAt:Date.now(),previousResults:[]};a[k]=r;save(a);try{fetch('/api/live-rounds/'+encodeURIComponent(k)+'/new',{method:'POST'}).catch(function(){})}catch(e){}}return r}
  function elapsed(r){return Math.max(0,Math.floor((Date.now()-Number(r.startedAt||Date.now()))/1000))}
  function active(k){return !!(state.resolving&&state.resolving[k])}
  function deck(){return typeof freshDeck==='function'?freshDeck():[]}
  function safeCard(c){return c&&typeof c==='object'&&c.v?c:{v:'?',s:'',suit:''}}
  function rank(c){try{return typeof cardRank==='function'?Number(cardRank(safeCard(c)))||0:0}catch(e){return 0}}
  function hand(cards){var list=(cards||[]).map(safeCard);while(list.length<3)list.push({v:'?',s:'',suit:''});try{return typeof handScore==='function'?Number(handScore(list))||0:0}catch(e){return 0}}
  function nextRun(k){runToken[k]=(runToken[k]||0)+1;return runToken[k]}
  function runAlive(k,t){return runToken[k]===t}
  function setR(k,p){var a=all(),r=a[k]||cur(k);Object.keys(p||{}).forEach(function(x){r[x]=p[x]});a[k]=r;save(a);return r}
  window.gameTop=function(title,round){var map={'ANDAR BAHAR':'andar-bahar','LUCKY 7':'lucky7','TEEN PATTI':'teen-patti','DRAGON TIGER':'dragon-tiger'},k=map[title],r=k?cur(k):null,status='LIVE',prev=k&&state.previousResults[k]?state.previousResults[k].winner:'—';if(r&&r.previousResults&&r.previousResults.length){prev=r.previousResults[0];state.previousResults[k]={winner:prev,history:r.previousResults}}if(r){var left=Math.max(0,cfg(k).duration-elapsed(r));status=r.phase==='betting'?'BET '+left+'s':r.phase==='locked'?'LOCKED '+left+'s':String(r.phase||'LIVE').toUpperCase()}return '<div class="game-top"><span class="g-title">'+title+'</span><span class="g-meta">'+status+' · Prev: '+prev+' · Round : '+(round||'—')+'</span></div>'}
  var syncBusy=false;
  window.syncSharedRounds=async function(){if(syncBusy||!state.loggedIn||['andar','lucky7','teenpatti','dragontiger'].indexOf(state.view)<0)return;syncBusy=true;try{var raw={};try{raw=JSON.parse(localStorage.getItem('antpro_live_rounds')||'{}')}catch(e){}var res=await fetch('/api/live-rounds',{cache:'no-store'});if(!res.ok)return;var remote=await res.json(),merged={};Object.keys(CFG).forEach(function(k){var l=raw[k],r=remote[k],c=cfg(k);if(l&&r&&l.roundId===r.roundId)merged[k]=Object.assign({},r,(l.phase==='result'&&r.phase!=='result')?l:{},r.forcedWinner?{forcedWinner:r.forcedWinner}:l.forcedWinner?{forcedWinner:l.forcedWinner}:{});else if(l&&r&&l.roundId!==r.roundId&&l.phase==='betting'&&r.phase==='locked'&&elapsed(r)>c.duration+5)merged[k]=l;else merged[k]=r||l;if(r&&r.previousResults&&r.previousResults.length)state.previousResults[k]={winner:r.previousResults[0],history:r.previousResults}});state.sharedRounds=merged;localStorage.setItem('antpro_live_rounds',JSON.stringify(merged));localStorage.setItem('antpro_previous_results',JSON.stringify(state.previousResults))}catch(e){}finally{syncBusy=false}}
  function reset(k,r){if(roundSeen[k]===r.roundId)return;roundSeen[k]=r.roundId;runToken[k]=(runToken[k]||0)+1;state.resolving[k]=false;state.pendingBets=state.pendingBets||{};state.pendingBets[k]=[];if(k==='andar-bahar'){var d=deck();state.abJoker=d.pop()||null;state.andarCards={andar:[],bahar:[]};state.andarSpinning=false}else if(k==='lucky7'){state.l7Card=null;state.l7Spin=false}else if(k==='teen-patti'){state.tpPlayer=[];state.tpDealer=[];state.tpSpin=false}else{state.dtDragon=null;state.dtTiger=null;state.dtSpin=false}}
  function place(k,side,type,rate){var r=cur(k),c=cfg(k);if(r.phase!=='betting'||elapsed(r)>=c.duration-c.lock||active(k)){toast('Betting locked — next round automatic start hoga');return}var amt=readStake(k);if(!amt||getCoins()<amt){if(getCoins()<amt)toast('Chips kam hain');return}var player=state.user&&state.user.id||'Player';syncPlayerChips(getCoins()-amt);state.pendingBets=state.pendingBets||{};state.pendingBets[k]=state.pendingBets[k]||[];state.pendingBets[k].push({team:side,type:type,rate:rate,amt:amt,player:player});try{var token=sessionStorage.getItem('antpro_session_token')||'';fetch('/api/live-bets',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({gameKey:k,roundId:r.roundId,player:player,side:side,type:type,rate:rate,amt:amt})}).catch(function(){})}catch(e){}render()}
  function settleFromServer(k,t,roundId,natural){var tries=0;function poll(){if(!runAlive(k,t))return;fetch('/api/live-rounds',{cache:'no-store'}).then(function(res){return res.json()}).then(function(data){var r=data&&data[k];if(r&&r.roundId===roundId&&r.phase==='result'&&r.result)return settle(k,r.result);if(++tries<80)setTimeout(poll,250);else settle(k,natural)}).catch(function(){if(++tries<80)setTimeout(poll,250);else settle(k,natural)})}poll()}
  function settle(k,winner){var bets=(state.pendingBets&&state.pendingBets[k])||[];bets.forEach(function(b){var won=b.team===winner,p=Math.round(b.amt*(b.rate-1));if(won)syncPlayerChips(getCoins()+b.amt+p);pushSettledBet({team:b.team,type:b.type,rate:b.rate,amt:b.amt,profit:p,player:b.player,status:won?'won':'lost',result:won?'WON +'+(b.amt+p):'LOST -'+b.amt})});state.pendingBets[k]=[];state.previousResults[k]={winner:winner,at:Date.now(),history:[winner].concat((state.previousResults[k]&&state.previousResults[k].history)||[]).slice(0,10)};localStorage.setItem('antpro_previous_results',JSON.stringify(state.previousResults));try{fetch('/api/live-rounds/'+encodeURIComponent(k)+'/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({winner:winner})}).catch(function(){})}catch(e){}if(k==='andar-bahar'){state.abHistory=state.abHistory||[];state.abHistory.unshift(winner==='Andar'?'A':'B');state.andarSpinning=false}else if(k==='lucky7')state.l7Spin=false;else if(k==='teen-patti')state.tpSpin=false;else state.dtSpin=false;state.resolving[k]=false;setR(k,{phase:'result',timer:0,result:winner,resultAt:Date.now()});render();setTimeout(function(){if(!active(k))newRound(k)},k==='dragon-tiger'?RESULT_HOLD_DT:k==='teen-patti'?RESULT_HOLD_TEEN:k==='lucky7'?RESULT_HOLD_L7:RESULT_HOLD)}
  function newRound(k){var c=cfg(k),a=all(),old=a[k]||{};if(old.phase==='betting'&&old.roundId)return;var history=old.previousResults||((state.previousResults[k]&&state.previousResults[k].history)||[]);runToken[k]=(runToken[k]||0)+1;state.resolving[k]=false;a[k]={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:c.duration,duration:c.duration,lockSeconds:c.lock,forcedWinner:null,startedAt:Date.now(),previousResults:history.slice(0,10)};save(a);try{fetch('/api/live-rounds/'+encodeURIComponent(k)+'/new',{method:'POST'}).catch(function(){})}catch(e){}reset(k,a[k]);render()}
  function resolveAB(){var k='andar-bahar',t=nextRun(k),roundId=cur(k).roundId,d=deck(),j=state.abJoker||safeCard(d.pop()),a=[],b=[],first='Andar',win=null,revealed=0;if(!state.abJoker)state.abJoker=j;var matchIndex=d.findIndex(function(c){return c&&c.v===j.v});var match=matchIndex>=0?d.splice(matchIndex,1)[0]:{v:j.v,s:j.s,suit:j.suit};var revealIndex=1+Math.floor(Math.random()*12);var insertAt=Math.max(0,d.length-revealIndex);d.splice(insertAt,0,match);state.resolving[k]=true;state.andarSpinning=true;state.andarCards={andar:[],bahar:[]};render();function done(){if(!runAlive(k,t))return;settleFromServer(k,t,roundId,win||(Math.random()<0.5?'Andar':'Bahar'))}function rev(){if(!runAlive(k,t))return;if(win||revealed>=12||!d.length)return done();var c=safeCard(d.pop());revealed++;if(first==='Andar'&&a.length<6)a.push(c);else if(first==='Bahar'&&b.length<6)b.push(c);else{first=first==='Andar'?'Bahar':'Andar';return rev()}state.andarCards={andar:a.slice(),bahar:b.slice()};render();if(c.v===j.v)win=first;first=first==='Andar'?'Bahar':'Andar';if(!win)setTimeout(rev,GAP_AB);else setTimeout(done,RESULT_HOLD)}rev()}
  function resolveLucky(){var k='lucky7';if(active(k))return;var t=nextRun(k),roundId=cur(k).roundId;state.resolving[k]=true;state.l7Spin=true;state.l7Card=null;render();var c=safeCard(deck()[0]);setTimeout(function(){if(!runAlive(k,t))return;state.l7Card=c;state.l7Spin=false;render();var cr=rank(c),n=cr>7?'7 UP':cr<7?'7 DOWN':'7';setTimeout(function(){if(runAlive(k,t))settleFromServer(k,t,roundId,n)},RESULT_HOLD_L7)},L7_FLIP_DELAY)}
  function resolveTeen(){var k='teen-patti',t=nextRun(k),roundId=cur(k).roundId,d=deck(),p=[safeCard(d.pop()),safeCard(d.pop()),safeCard(d.pop())],q=[safeCard(d.pop()),safeCard(d.pop()),safeCard(d.pop())],i=0;state.resolving[k]=true;state.tpSpin=true;state.tpPlayer=[];state.tpDealer=[];render();function rev(){if(!runAlive(k,t))return;if(i<6){if(i%2===0)state.tpPlayer.push(p[Math.floor(i/2)]);else state.tpDealer.push(q[Math.floor(i/2)]);i++;render();setTimeout(rev,GAP_TEEN)}else{var ps=hand(p),ds=hand(q);setTimeout(function(){if(runAlive(k,t))settleFromServer(k,t,roundId,ps>ds?'Team A':ds>ps?'Team B':(Math.random()<0.5?'Team A':'Team B'))},RESULT_HOLD_TEEN)}}rev()}
  function resolveDragon(){var k='dragon-tiger';if(active(k))return;var t=nextRun(k),roundId=cur(k).roundId,d=deck(),x=safeCard(d.pop()),y=safeCard(d.pop());state.resolving[k]=true;state.dtSpin=true;state.dtDragon=null;state.dtTiger=null;render();setTimeout(function(){if(!runAlive(k,t))return;state.dtDragon=x;render();setTimeout(function(){if(!runAlive(k,t))return;state.dtTiger=y;state.dtSpin=false;render();var rx=rank(x),ry=rank(y),n=rx>ry?'Dragon':ry>rx?'Tiger':'Tie';setTimeout(function(){if(runAlive(k,t))settleFromServer(k,t,roundId,n)},RESULT_HOLD_DT)},GAP_DT)},500)}
  function resolve(k){if(k==='andar-bahar')resolveAB();else if(k==='lucky7')resolveLucky();else if(k==='teen-patti')resolveTeen();else resolveDragon()}
  window.playAndarBahar=function(s){if(s==='Tie')return;place('andar-bahar',s,'AndarBahar',1.95)};
  window.playLucky7=function(s){place('lucky7',s,'LUCKY 7',s==='7'?11:1.95)};
  window.playTeenPatti=function(s){if(s==='Tie'){if(typeof toast==='function')toast('Teen Patti mein Tie nahi hai');return;}place('teen-patti',s,'TEEN PATTI',1.98)};
  window.playDragonTiger=function(s){place('dragon-tiger',s,'DRAGON TIGER',s==='Tie'?11:1.95)};
  window.canPlaceBet=function(k){var r=cur(k),c=cfg(k);return r.phase==='betting'&&elapsed(r)<c.duration-c.lock&&!active(k)};
  window.__antproTimerTick=function(){if(!state.loggedIn||['andar','lucky7','teenpatti','dragontiger'].indexOf(state.view)<0)return;['andar-bahar','lucky7','teen-patti','dragon-tiger'].forEach(function(k){var r=cur(k),c=cfg(k);reset(k,r);var e=elapsed(r);r.timer=Math.max(0,c.duration-e);if(r.phase==='betting'&&e>=c.duration-c.lock){r.phase='locked';save(all())}if((r.phase==='locked'||r.phase==='revealing')&&e>=c.duration&&!active(k))resolve(k);if(r.phase==='result'&&!active(k)&&Date.now()-Number(r.resultAt||0)>=(k==='dragon-tiger'?RESULT_HOLD_DT:k==='teen-patti'?RESULT_HOLD_TEEN:k==='lucky7'?RESULT_HOLD_L7:RESULT_HOLD))newRound(k)});render()};
  setInterval(window.__antproTimerTick,500);setTimeout(window.__antproTimerTick,100);
  console.log('[AntPro] AB joker | Teen no-Tie | DT Tie 11x');
})();
