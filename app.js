/* AntPro — visual match to original */
const app = document.querySelector('#app');

const COINS_KEY = 'antpro_coins_v1';
const GAMES_KEY = 'antpro_games_live_v1';
const BETS_KEY = 'antpro_bets_v1';
const MARQUEE_KEY = 'antpro_marquee_v1';
const STMT_KEY = 'antpro_statements_v1';
const COMM_KEY = 'antpro_commission_v1';

const PASS_KEY = 'antpro_master_pass';
const USERS_KEY = 'antpro_users_v2';

/* Hierarchy demo data — Master creates Agents; Agents manage Players */
function defaultUsers(){
  return {
    superMaster: {id:'SUPER', name:'Super Master', role:'supermaster', pass:'super123', chips:0, status:'active'},
    masters: {
      'MASTER': {id:'MASTER', name:'Master One', role:'master', pass:'master123', chips:100000, commission:5, share:95, superId:'SUPER', agents:['A1001','A1002'], status:'active'},
      'MASTER2': {id:'MASTER2', name:'Master Two', role:'master', pass:'master123', chips:80000, commission:5, share:95, superId:'SUPER', agents:[], status:'active'}
    },
    agents: {
      'A1001': {id:'A1001', name:'Agent-01', role:'agent', pass:'agent123', chips:50000, commission:10, share:20, masterId:'MASTER', players:['P2001','P2002'], status:'active'},
      'A1002': {id:'A1002', name:'Agent-02', role:'agent', pass:'agent123', chips:25000, commission:8, share:15, masterId:'MASTER', players:['P2003'], status:'active'}
    },
    players: {
      'P2001': {id:'P2001', name:'Player One', role:'player', pass:'play123', chips:5000, agentId:'A1001', status:'active'},
      'P2002': {id:'P2002', name:'Player Two', role:'player', pass:'play123', chips:3200, agentId:'A1001', status:'active'},
      'P2003': {id:'P2003', name:'Player Three', role:'player', pass:'play123', chips:1500, agentId:'A1002', status:'active'}
    }
  };
}
function loadUsers(){
  try{
    const raw=localStorage.getItem(USERS_KEY);
    if(raw){const parsed=JSON.parse(raw);if(parsed&&parsed.superMaster)return parsed;}
  }catch{}
  const d=defaultUsers();
  try{localStorage.setItem(USERS_KEY,JSON.stringify(d))}catch{}
  return d;
}
function saveUsers(u){
  try{localStorage.setItem(USERS_KEY,JSON.stringify(u))}catch{}
  // permanent server + Firebase mirror (fire-and-forget)
  fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({users:u})}).catch(()=>{});
}
async function syncUsersFromServer(){
  try{
    const r=await fetch('/api/users',{cache:'no-store'});
    const d=await r.json();
    if(d&&d.ok&&d.users&&d.users.superMaster){
      localStorage.setItem(USERS_KEY,JSON.stringify(d.users));
      return d.users;
    }
  }catch{}
  return loadUsers();
}
function findAccount(username, password){
  const u=loadUsers();
  const id=(username||'').trim().toUpperCase();
  const p=(password||'').trim();
  // Super Master
  if(u.superMaster && (u.superMaster.id.toUpperCase()===id || id==='SUPER' || id==='SUPERMASTER') && (p===u.superMaster.pass || p==='super123')){
    return {...u.superMaster, role:'supermaster'};
  }
  // Masters (dict)
  if(u.masters){
    for(const k of Object.keys(u.masters)){
      const m=u.masters[k];
      if((m.id||k).toUpperCase()===id && m.pass===p) return {...m, role:'master'};
    }
  }
  // legacy single master
  if(u.master && (u.master.id.toUpperCase()===id || id==='MASTER') && (p===u.master.pass || p==='master123')){
    return {role:'master', id:'MASTER', name:'Master', pass:u.master.pass, chips:u.master.chips||0, share:95, commission:5};
  }
  const agents=u.agents||{};
  if(agents[id] && agents[id].pass===p) return {role:'agent', ...agents[id]};
  // also allow login by name-ish
  for(const k of Object.keys(agents)){
    if((agents[k].id||k).toUpperCase()===id && agents[k].pass===p) return {role:'agent', ...agents[k]};
  }
  const players=u.players||{};
  if(players[id] && players[id].pass===p) return {role:'player', ...players[id]};
  for(const k of Object.keys(players)){
    if((players[k].id||k).toUpperCase()===id && players[k].pass===p) return {role:'player', ...players[k]};
  }
  // Stable built-in accounts survive stale or incomplete browser/server user data.
  if(id==='SUPER' && p==='super123') return {id:'SUPER',name:'Super Master',role:'supermaster',pass:'super123',chips:0,status:'active'};
  if(id==='MASTER' && p==='master123') return {id:'MASTER',name:'Master One',role:'master',pass:'master123',chips:100000,commission:5,share:95,status:'active'};
  if((id==='A1001'||id==='A1002') && p==='agent123') return {id,name:id==='A1001'?'Agent-01':'Agent-02',role:'agent',pass:'agent123',chips:id==='A1001'?50000:25000,commission:id==='A1001'?10:8,share:id==='A1001'?20:15,masterId:'MASTER',players:[],status:'active'};
  return null;
}

function getCoins(){const v=localStorage.getItem(COINS_KEY);return v===null?200:Math.max(0,parseInt(v,10)||0)}
function setCoins(n){localStorage.setItem(COINS_KEY,String(Math.max(0,Math.floor(n))))}
function getGamesLive(){
  // Permanent games — always ON, master cannot disable
  const PERMANENT = {'andar-bahar':true,'lucky7':true,'teen-patti':true,'dragon-tiger':true};
  try{
    const stored = JSON.parse(localStorage.getItem(GAMES_KEY)||'{}');
    return {...{virtual:true}, ...stored, ...PERMANENT};
  }catch{
    return {...PERMANENT, virtual:true};
  }
}
function setGamesLive(o){localStorage.setItem(GAMES_KEY,JSON.stringify(o))}
function getMasterPass(){return localStorage.getItem(PASS_KEY)||'TEX99AdMIN@090'}
const DEFAULT_MARQUEE='🌹 JAI SHREE SHYAM 🌹';
function escapeHTML(value){return String(value||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function getMarquee(){return localStorage.getItem(MARQUEE_KEY)||DEFAULT_MARQUEE}
function saveMarquee(){
  const input=document.getElementById('marqueeText');
  const text=(input&&input.value||'').trim().slice(0,120)||DEFAULT_MARQUEE;
  localStorage.setItem(MARQUEE_KEY,text);
  fetch('/api/marquee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}).catch(()=>{});
  toast('Marquee text updated'); render();
}
async function syncMarquee(){
  try{const r=await fetch('/api/marquee',{cache:'no-store'});const d=await r.json();if(d.text){localStorage.setItem(MARQUEE_KEY,d.text);if(state.view==='home')render()}}catch{}
}

function getLiveRounds(){
  let local={};
  try{local=JSON.parse(localStorage.getItem('antpro_live_rounds')||'{}')}catch{local={}}
  if(typeof state!=='undefined'&&state.sharedRounds&&Object.keys(state.sharedRounds).length)return {...local,...state.sharedRounds};
  return local;
}
function setLiveRounds(o){localStorage.setItem('antpro_live_rounds',JSON.stringify(o));if(typeof state!=='undefined')state.sharedRounds=o}
// Keep users in sync with server/Firebase on load
syncUsersFromServer().then(u=>{if(u){/* cached */} }).catch(()=>{});
function ensureRound(gameKey){
  const all=getLiveRounds();
  if(!all[gameKey]){
    all[gameKey]={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:(GAME_TIMINGS[gameKey]||{duration:30}).duration,duration:(GAME_TIMINGS[gameKey]||{duration:30}).duration,lockSeconds:(GAME_TIMINGS[gameKey]||{lock:4}).lock,forcedWinner:null,startedAt:Date.now()};
    setLiveRounds(all);
  }
  return all[gameKey];
}
function sideTotalsFor(gameType, sides){
  const totals={};
  sides.forEach(s=>totals[s]=0);
  state.activeBets.filter(b=>{
    const t=(b.type||'').toLowerCase();
    if(gameType==='AndarBahar') return t==='andarbahar'||t.includes('andar');
    if(gameType==='LUCKY 7') return t.includes('lucky');
    if(gameType==='TEEN PATTI') return t.includes('teen');
    if(gameType==='DRAGON TIGER') return t.includes('dragon');
    return false;
  }).forEach(b=>{
    const side=b.team||'';
    // map
    let key=side;
    if(sides.includes(side)) key=side;
    else if(side==='7 UP') key='7 UP';
    else if(side==='7 DOWN') key='7 DOWN';
    else if(side==='7') key='7';
    if(totals[key]!==undefined) totals[key]+=(b.amt||0);
  });
  return totals;
}
function forceWinner(gameKey, side){
  const all=getLiveRounds();
  const r=all[gameKey]||ensureRound(gameKey);
  r.forcedWinner=side;
  if(r.phase!=='betting') r.phase='forced';
  all[gameKey]=r;
  setLiveRounds(all);
  fetch('/api/live-rounds/'+encodeURIComponent(gameKey)+'/force',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({side})}).catch(()=>{});
  toast(gameKey+' → FORCE '+side);
  render();
}
function startNewRound(gameKey, secs){
  const all=getLiveRounds();
  all[gameKey]={
    roundId:'R-'+Date.now().toString(36).toUpperCase(),
    phase:'betting',
    timer:Math.max(5,parseInt(secs,10)||30),
    duration:Math.max(5,parseInt(secs,10)||30),
    forcedWinner:null,
    startedAt:Date.now()
  };
  setLiveRounds(all);
  fetch('/api/live-rounds/'+encodeURIComponent(gameKey)+'/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:all[gameKey].duration})}).catch(()=>{});
  toast('New round '+all[gameKey].roundId+' · '+all[gameKey].timer+'s');
  render();
}
function closeRound(gameKey){
  const all=getLiveRounds();
  const r=all[gameKey]||ensureRound(gameKey);
  r.phase='closed';
  r.timer=0;
  all[gameKey]=r;
  setLiveRounds(all);
  toast(gameKey+' round CLOSED');
  render();
}
function getForced(gameKey){
  const r=getLiveRounds()[gameKey];
  return r&&r.forcedWinner?r.forcedWinner:null;
}
const GAME_KEYS=['andar-bahar','lucky7','teen-patti','dragon-tiger'];
const GAME_TIMINGS={'andar-bahar':{duration:30,lock:5},lucky7:{duration:15,lock:4},'teen-patti':{duration:20,lock:4},'dragon-tiger':{duration:15,lock:4}};
const CARD_GAP_MS=2500, RESULT_HOLD_MS=2000, NEXT_ROUND_DELAY_MS=5000;
function roundSeconds(key){
  const r=ensureRound(key);const elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);
  return Math.max(0,(r.duration||GAME_TIMINGS[key]?.duration||30)-elapsed);
}
function bettingOpen(key){
  const r=ensureRound(key);const elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);const lock=r.lockSeconds??GAME_TIMINGS[key]?.lock??4;
  return r.phase==='betting'&&elapsed<Math.max(0,(r.duration||30)-lock);
}
function startNewRoundSilent(key,secs=30){
  const all=getLiveRounds();
  all[key]={roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:secs,duration:secs,lockSeconds:GAME_TIMINGS[key]?.lock??4,forcedWinner:null,startedAt:Date.now()};
  setLiveRounds(all);
}
function scheduleNextRound(key,delay=NEXT_ROUND_DELAY_MS){
  clearTimeout(scheduleNextRound.timers?.[key]);
  scheduleNextRound.timers=scheduleNextRound.timers||{};
  scheduleNextRound.timers[key]=setTimeout(()=>{startNewRoundSilent(key,30);state.resolving[key]=false;render()},delay);
}
function finishRound(key){
  const all=getLiveRounds(), r=all[key]||ensureRound(key);
  r.phase='result';r.timer=0;r.resultAt=Date.now();all[key]=r;setLiveRounds(all);
  setTimeout(()=>scheduleNextRound(key,NEXT_ROUND_DELAY_MS),RESULT_HOLD_MS);
}
function smartDecision(key,options,natural){
  const forced=getForced(key);
  if(forced&&options.includes(forced)){
    const all=getLiveRounds();if(all[key]){all[key].forcedWinner=null;all[key].phase='result';setLiveRounds(all)}
    return forced;
  }
  return natural||options[Math.floor(Math.random()*options.length)];
}
function stakeControl(key){return `<div class="stake-control"><label>STAKE (1 - 20,000 DEMO CHIPS)</label><input id="stake-${key}" type="number" min="1" max="20000" step="1" value="100" inputmode="numeric"></div>`}
function readStake(key){
  const n=Number((document.getElementById('stake-'+key)||{}).value||0);
  if(!Number.isInteger(n)||n<1||n>20000){toast('Stake 1 se 20,000 demo chips ke beech rakho');return 0}
  return n;
}
function canPlaceBet(key){
  if(state.user&&isBlocked(state.user.id)){toast('Account blocked/suspended');return false}
  if(state.resolving[key]){toast('Current round result aa raha hai');return false}
  if(!bettingOpen(key)){toast('Betting locked — next round automatic start hoga');return false}
  state.resolving[key]=true;
  return true;
}
function tickRounds(){
  for(const key of GAME_KEYS){
    const r=ensureRound(key);
    if(r.phase==='betting'&&!bettingOpen(key)){
      r.phase='locked';r.timer=roundSeconds(key);r.lockedAt=Date.now();const all=getLiveRounds();all[key]=r;setLiveRounds(all);
      setTimeout(()=>{const now=getLiveRounds()[key];if(now&&now.phase==='locked'){startNewRoundSilent(key,30);if(['andar','lucky7','teenpatti','dragontiger'].includes(state.view))render()}},3000);
    }
    if(r.phase==='locked'&&roundSeconds(key)<=0){
      startNewRoundSilent(key,GAME_TIMINGS[key]?.duration||30);
    }
    if(r.phase==='result'&&Date.now()-(r.resultAt||r.startedAt||0)>=RESULT_HOLD_MS+NEXT_ROUND_DELAY_MS){
      startNewRoundSilent(key,30);
    }
  }
}
setInterval(()=>{tickRounds();if(['andar','lucky7','teenpatti','dragontiger'].includes(state.view))render()},1000);



const state={
  view:'home',menu:false,loggedIn:location.pathname!=='/login' && !!JSON.parse(sessionStorage.getItem('antpro_user')||'null'),
  rules:'hindi',toast:'',adminAuthed:sessionStorage.getItem('antpro_admin_ok')==='1',
  matchId:0,
  activeBets:JSON.parse(localStorage.getItem(BETS_KEY)||'[]'),
  andarCards:{andar:[{v:'8',s:'red',suit:'♦'},{v:'3',s:'red',suit:'♦'}],bahar:[{v:'3',s:'',suit:'♣'},{v:'6',s:'',suit:'♣'}]}, andarSpinning:false,
  user: JSON.parse(sessionStorage.getItem('antpro_user')||'null'),
  agentTab: 'players',
  liveMatches: [],
  liveMatchesLoading: false,
  liveMatchesError: '',
  liveSessions: [], liveSessionsKey: '', liveSessionsLoading: false,
  abJoker:null, abHistory:[], l7Card:{v:'7',s:'red',suit:'♥'}, l7Spin:false,
  tpPlayer:[{v:'A',s:'red',suit:'♥'},{v:'8',s:'',suit:'♣'},{v:'4',s:'red',suit:'♦'}], tpDealer:[{v:'K',s:'',suit:'♠'},{v:'6',s:'red',suit:'♥'},{v:'2',s:'',suit:'♣'}], tpSpin:false,
  dtDragon:{v:'8',s:'',suit:'♣'}, dtTiger:{v:'6',s:'',suit:'♣'}, dtSpin:false, resolving:{}, sharedRounds:{}
};

let sharedSyncBusy=false;
async function syncSharedRounds(){
  if(sharedSyncBusy)return;
  sharedSyncBusy=true;
  try{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),1200);
    const r=await fetch('/api/live-rounds',{cache:'no-store',signal:controller.signal});clearTimeout(timeout);
    if(!r.ok)throw new Error('round api '+r.status);
    const data=await r.json();state.sharedRounds=data;localStorage.setItem('antpro_live_rounds',JSON.stringify(data));
    if(['andar','lucky7','teenpatti','dragontiger'].includes(state.view))render();
  }catch{}
  finally{sharedSyncBusy=false}
}
setTimeout(syncSharedRounds,50);
setInterval(syncSharedRounds,1000);

(function initRoute(){
  const p=location.pathname.replace(/\/$/,'')||'/';
  if(p==='/x9k2-ns-ctrl'){state.view='admin';state.loggedIn=true}
  else if(p==='/login'){state.view='login';state.loggedIn=false}
  else if(p==='/inplay')state.view='inplay';
  else if(p==='/casino')state.view='casino';
  else if(p==='/andar-bahar')state.view='andar';
  else if(p==='/lucky7')state.view='lucky7';
  else if(p==='/teen-patti')state.view='teenpatti';
  else if(p==='/dragon-tiger')state.view='dragontiger';
  else if(p==='/ledger')state.view='ledger';
  else if(p==='/rules')state.view='rules';
  else if(p==='/hierarchy')state.view='hierarchy';
  else if(p==='/password')state.view='password';
  else state.view='home';
})();

function toast(m,ms=1600){state.toast=m;render();setTimeout(()=>{state.toast='';render()},ms)}
function saveBets(){localStorage.setItem(BETS_KEY,JSON.stringify(state.activeBets.slice(0,120)))}
function syncPlayerChips(n){setCoins(n);if(state.user&&state.user.role==='player'){state.user.chips=getCoins();sessionStorage.setItem('antpro_user',JSON.stringify(state.user));const data=loadUsers();if(data.players&&state.user.id&&data.players[state.user.id]){data.players[state.user.id].chips=getCoins();saveUsers(data)}}}

/* ===== PRO OPS: P&L · Commission cascade · Block · Rollback · Statements ===== */
function loadStatements(){try{return JSON.parse(localStorage.getItem(STMT_KEY)||'[]')}catch{return []}}
function saveStatements(a){localStorage.setItem(STMT_KEY,JSON.stringify((a||[]).slice(0,500)))}
function loadCommissions(){try{return JSON.parse(localStorage.getItem(COMM_KEY)||'[]')}catch{return []}}
function saveCommissions(a){localStorage.setItem(COMM_KEY,JSON.stringify((a||[]).slice(0,500)))}
function uid(){return 'B'+Date.now().toString(36).toUpperCase()+Math.floor(Math.random()*999)}
function findUserById(id){
  const data=loadUsers(); const ID=(id||'').toUpperCase();
  if(data.superMaster&&(data.superMaster.id||'').toUpperCase()===ID) return {...data.superMaster, role:'supermaster', _path:'superMaster'};
  if(data.masters){for(const k of Object.keys(data.masters)){const m=data.masters[k]; if((m.id||k).toUpperCase()===ID) return {...m, role:'master', _path:'masters', _key:k};}}
  if(data.agents){for(const k of Object.keys(data.agents)){const a=data.agents[k]; if((a.id||k).toUpperCase()===ID) return {...a, role:'agent', _path:'agents', _key:k};}}
  if(data.players){for(const k of Object.keys(data.players)){const pl=data.players[k]; if((pl.id||k).toUpperCase()===ID) return {...pl, role:'player', _path:'players', _key:k};}}
  return null;
}
function updateUserFields(id, fields){
  const data=loadUsers(); const ID=(id||'').toUpperCase();
  let hit=false;
  if(data.superMaster&&(data.superMaster.id||'').toUpperCase()===ID){Object.assign(data.superMaster, fields); hit=true;}
  if(data.masters){for(const k of Object.keys(data.masters)){if((data.masters[k].id||k).toUpperCase()===ID){Object.assign(data.masters[k], fields); hit=true;}}}
  if(data.agents){for(const k of Object.keys(data.agents)){if((data.agents[k].id||k).toUpperCase()===ID){Object.assign(data.agents[k], fields); hit=true;}}}
  if(data.players){for(const k of Object.keys(data.players)){if((data.players[k].id||k).toUpperCase()===ID){Object.assign(data.players[k], fields); hit=true;}}}
  if(hit) saveUsers(data);
  return hit;
}
function userStatus(id){const u=findUserById(id); return (u&&u.status)||'active'}
function isBlocked(id){const s=userStatus(id); return s==='blocked'||s==='suspended'}
function setUserStatus(id, status){
  if(!['active','blocked','suspended'].includes(status)) return;
  updateUserFields(id, {status});
  toast(id+' → '+status.toUpperCase());
  render();
}
function addStatement(entry){
  const list=loadStatements();
  list.unshift({...entry, id:entry.id||uid(), ts:entry.ts||Date.now()});
  saveStatements(list);
}
function creditChips(userId, amount, note){
  const u=findUserById(userId); if(!u) return;
  const next=Math.max(0, Math.floor((u.chips||0)+amount));
  updateUserFields(userId, {chips:next});
  addStatement({type:'CHIP', userId, amount, note:note||'', balance:next});
}
function applyCascade(bet){
  /* Multi-level share cascade on settled casino/session bets (coins only) */
  if(!bet||bet.rolled_back) return;
  const playerId=bet.player||bet.playerId; if(!playerId) return;
  const pl=findUserById(playerId); if(!pl||pl.role!=='player') return;
  const agent=pl.agentId?findUserById(pl.agentId):null;
  const master=agent&&agent.masterId?findUserById(agent.masterId):null;
  const amt=Number(bet.amt)||0;
  const profit=Number(bet.profit)||0;
  const won=bet.status==='won';
  const agentShare=Number(agent&&agent.share)||0;
  const masterShare=Number(master&&master.share)||0;
  const agentCommPct=Number(agent&&agent.commission)||0;
  const lines=[];
  if(won){
    // upline pays player's profit according to share
    if(agent){
      const cut=Math.floor(profit*(agentShare/100));
      if(cut){creditChips(agent.id, -cut, 'Share pay win '+bet.type+' '+playerId); lines.push({who:agent.id, role:'agent', amount:-cut, kind:'share_win'});}
      const comm=Math.floor(profit*(agentCommPct/100));
      if(comm){creditChips(agent.id, comm, 'Commission on win '+bet.type); lines.push({who:agent.id, role:'agent', amount:comm, kind:'commission'});}
    }
    if(master){
      const cut=Math.floor(profit*(masterShare/100));
      if(cut){creditChips(master.id, -cut, 'Share pay win '+bet.type+' '+playerId); lines.push({who:master.id, role:'master', amount:-cut, kind:'share_win'});}
    }
  } else if(bet.status==='lost'){
    // upline receives share of player loss
    if(agent){
      const take=Math.floor(amt*(agentShare/100));
      if(take){creditChips(agent.id, take, 'Share on loss '+bet.type+' '+playerId); lines.push({who:agent.id, role:'agent', amount:take, kind:'share_loss'});}
      const comm=Math.floor(amt*(agentCommPct/100));
      if(comm){creditChips(agent.id, comm, 'Commission on loss '+bet.type); lines.push({who:agent.id, role:'agent', amount:comm, kind:'commission'});}
    }
    if(master){
      const take=Math.floor(amt*(masterShare/100));
      if(take){creditChips(master.id, take, 'Share on loss '+bet.type+' '+playerId); lines.push({who:master.id, role:'master', amount:take, kind:'share_loss'});}
    }
  }
  if(lines.length){
    const comms=loadCommissions();
    comms.unshift({betId:bet.id, player:playerId, market:bet.type, status:bet.status, amt, profit, lines, ts:Date.now()});
    saveCommissions(comms);
  }
  addStatement({type:'BET', userId:playerId, amount:won?(profit):(-(amt)), note:(bet.type||'')+' '+(bet.team||'')+' '+(bet.status||''), betId:bet.id, market:bet.type, side:bet.team, status:bet.status});
}
function pushSettledBet(partial){
  const bet={
    id:uid(),
    team:partial.team||partial.side||'',
    type:partial.type||'',
    rate:partial.rate||0,
    amt:partial.amt||0,
    profit:partial.profit||0,
    ts:Date.now(),
    player:(partial.player)||((state.user&&state.user.id)||'Player'),
    playerId:(partial.player)||((state.user&&state.user.id)||'Player'),
    status:partial.status||'pending',
    result:partial.result||'',
    rolled_back:false
  };
  state.activeBets.unshift(bet);
  saveBets();
  if(bet.status==='won'||bet.status==='lost') applyCascade(bet);
  return bet;
}
function rollbackBet(betId){
  const role=(state.user&&state.user.role)||'';
  if(role!=='master'&&role!=='supermaster'){toast('Only Master can rollback');return}
  const bet=state.activeBets.find(b=>b.id===betId);
  if(!bet){toast('Bet not found');return}
  if(bet.rolled_back){toast('Already rolled back');return}
  const playerId=bet.player||bet.playerId;
  const amt=Number(bet.amt)||0;
  const profit=Number(bet.profit)||0;
  // reverse player chips
  if(bet.status==='won'){
    // take back stake+profit that was credited
    creditChips(playerId, -(amt+profit), 'ROLLBACK win '+betId);
  } else if(bet.status==='lost'){
    // return stake
    creditChips(playerId, amt, 'ROLLBACK loss '+betId);
  }
  // reverse cascade roughly by inverse lines from commission log
  const comms=loadCommissions();
  const entry=comms.find(c=>c.betId===betId);
  if(entry&&entry.lines){
    entry.lines.forEach(l=>{if(l.who&&l.amount) creditChips(l.who, -l.amount, 'ROLLBACK '+l.kind+' '+betId);});
  }
  bet.rolled_back=true;
  bet.status='rolled_back';
  bet.result='ROLLBACK';
  saveBets();
  addStatement({type:'ROLLBACK', userId:playerId, amount:0, note:'Bet '+betId+' rolled back', betId});
  toast('Bet '+betId+' rolled back');
  render();
}
function pnlForUser(userId){
  const bets=(state.activeBets||[]).filter(b=>(b.player||b.playerId)===userId && !b.rolled_back);
  let won=0, lost=0, stake=0, profit=0;
  bets.forEach(b=>{
    stake+=Number(b.amt)||0;
    if(b.status==='won'){won++; profit+=Number(b.profit)||0;}
    if(b.status==='lost'){lost++; profit-=Number(b.amt)||0;}
  });
  return {bets:bets.length, won, lost, stake, pnl:profit};
}
function allDownlinePlayerIds(){
  const role=(state.user&&state.user.role)||'';
  const data=loadUsers();
  if(role==='supermaster') return Object.keys(data.players||{});
  if(role==='master'){
    const mid=(state.user.id||'').toUpperCase();
    const agentIds=Object.values(data.agents||{}).filter(a=>(a.masterId||'').toUpperCase()===mid).map(a=>a.id);
    return Object.values(data.players||{}).filter(pl=>agentIds.includes(pl.agentId)).map(pl=>pl.id);
  }
  if(role==='agent'){
    const aid=(state.user.id||'').toUpperCase();
    return Object.values(data.players||{}).filter(pl=>(pl.agentId||'').toUpperCase()===aid).map(pl=>pl.id);
  }
  if(role==='player') return [state.user.id];
  return [];
}

function pagePnL(){
  const role=(state.user&&state.user.role)||'player';
  const ids=allDownlinePlayerIds();
  const rows=ids.map(id=>{
    const u=findUserById(id)||{id, name:id};
    const p=pnlForUser(id);
    return {id, name:u.name||id, status:u.status||'active', ...p};
  });
  const tot=rows.reduce((a,r)=>({stake:a.stake+r.stake, pnl:a.pnl+r.pnl, bets:a.bets+r.bets}), {stake:0,pnl:0,bets:0});
  return `${topBtn()}
  <div class="view-title">P &amp; L REPORT</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val">${tot.bets}</div><div class="stat-lbl">Bets</div></div>
    <div class="stat-box"><div class="stat-val">${tot.stake}</div><div class="stat-lbl">Total Stake</div></div>
    <div class="stat-box"><div class="stat-val" style="color:${tot.pnl>=0?'#0a7a0a':'#c00'}">${tot.pnl>=0?'+':''}${tot.pnl}</div><div class="stat-lbl">Net P/L</div></div>
    <div class="stat-box"><div class="stat-val">${rows.length}</div><div class="stat-lbl">Clients</div></div>
  </div>
  <div class="section-bar">CLIENT WISE P/L (Coins)</div>
  <table class="ledger-table">
    <thead><tr><th>ID</th><th>NAME</th><th>STATUS</th><th>BETS</th><th>STAKE</th><th>W</th><th>L</th><th>P/L</th></tr></thead>
    <tbody>
      ${rows.length?rows.map(r=>`<tr>
        <td style="font-weight:700">${r.id}</td><td>${r.name||''}</td>
        <td style="color:${r.status==='active'?'#0a7a0a':('#c00')};font-size:10px;text-transform:uppercase">${r.status}</td>
        <td>${r.bets}</td><td>${r.stake}</td><td class="pos">${r.won}</td><td class="neg">${r.lost}</td>
        <td class="${r.pnl>=0?'pos':'neg'}">${r.pnl>=0?'+':''}${r.pnl}</td>
      </tr>`).join(''):'<tr><td colspan="8" style="color:#999">No clients / bets yet</td></tr>'}
    </tbody>
  </table>
  ${back()}`;
}

function pageBetHistory(){
  const role=(state.user&&state.user.role)||'player';
  let bets=(state.activeBets||[]).slice(0,100);
  if(role==='player'){
    const id=(state.user&&state.user.id)||'';
    bets=bets.filter(b=>(b.player||b.playerId)===id);
  } else if(role==='agent'||role==='master'||role==='supermaster'){
    const allow=new Set(allDownlinePlayerIds());
    if(role==='player') allow.add(state.user.id);
    bets=bets.filter(b=>allow.has(b.player||b.playerId));
  }
  return `${topBtn()}
  <div class="view-title">BET HISTORY</div>
  <div class="section-bar">PLUS / MINUS DETAIL</div>
  <table class="ledger-table">
    <thead><tr><th>TIME</th><th>ID</th><th>MARKET</th><th>SIDE</th><th>STAKE</th><th>+ / −</th><th>STATUS</th><th></th></tr></thead>
    <tbody>
      ${bets.length?bets.map(b=>{
        const t=new Date(b.ts||Date.now()).toLocaleString('en-IN',{hour12:false});
        const st=b.status||'';
        const signed = st==='won' ? (Number(b.profit)||0) : st==='lost' ? -(Number(b.amt)||0) : 0;
        const canRb = (role==='master'||role==='supermaster') && !b.rolled_back && (st==='won'||st==='lost');
        return `<tr>
          <td style="font-size:9px">${t}</td>
          <td style="font-weight:700;font-size:10px">${b.player||b.playerId||'—'}</td>
          <td style="font-size:10px">${b.type||'—'}</td>
          <td>${b.team||'—'}</td>
          <td>${b.amt||0}</td>
          <td class="${signed>=0?'pos':'neg'}">${signed>0?'+':''}${signed}</td>
          <td style="font-size:10px;text-transform:uppercase">${st}${b.rolled_back?' ✓':''}</td>
          <td>${canRb?`<button style="font-size:9px;padding:2px 6px" onclick="rollbackBet('${b.id}')">RB</button>`:''}</td>
        </tr>`;
      }).join(''):'<tr><td colspan="8" style="color:#999;padding:14px">No bets yet</td></tr>'}
    </tbody>
  </table>
  ${back()}`;
}

function pageStatement(){
  const role=(state.user&&state.user.role)||'player';
  let list=loadStatements().slice(0,120);
  if(role==='player'){
    const id=state.user.id;
    list=list.filter(x=>x.userId===id);
  } else {
    const allow=new Set(allDownlinePlayerIds());
    // also show own chip movements for agent/master
    allow.add(state.user.id);
    list=list.filter(x=>allow.has(x.userId));
  }
  return `${topBtn()}
  <div class="view-title">CLIENT STATEMENT</div>
  <div class="section-bar">ALL PLUS / MINUS ENTRIES</div>
  <table class="ledger-table">
    <thead><tr><th>TIME</th><th>USER</th><th>TYPE</th><th>NOTE</th><th>AMOUNT</th></tr></thead>
    <tbody>
      ${list.length?list.map(e=>{
        const t=new Date(e.ts||Date.now()).toLocaleString('en-IN',{hour12:false});
        const amt=Number(e.amount)||0;
        return `<tr>
          <td style="font-size:9px">${t}</td>
          <td style="font-weight:700">${e.userId||'—'}</td>
          <td style="font-size:10px">${e.type||'—'}</td>
          <td style="font-size:10px;text-align:left">${e.note||''}</td>
          <td class="${amt>=0?'pos':'neg'}">${amt>0?'+':''}${amt}</td>
        </tr>`;
      }).join(''):'<tr><td colspan="5" style="color:#999">No statement lines yet</td></tr>'}
    </tbody>
  </table>
  ${back()}`;
}

function pageCommission(){
  const role=(state.user&&state.user.role)||'';
  if(role!=='master'&&role!=='supermaster'&&role!=='agent') return shell(home());
  const list=loadCommissions().slice(0,80);
  const myId=(state.user&&state.user.id)||'';
  let total=0;
  list.forEach(c=>{(c.lines||[]).forEach(l=>{if(l.who===myId) total+=Number(l.amount)||0;});});
  return `${topBtn()}
  <div class="view-title">COMMISSION / SHARE</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val" style="color:${total>=0?'#0a7a0a':'#c00'}">${total>=0?'+':''}${total}</div><div class="stat-lbl">My Net Cascade</div></div>
    <div class="stat-box"><div class="stat-val">${list.length}</div><div class="stat-lbl">Settled Bets</div></div>
  </div>
  <div class="section-bar">AUTO CASCADE LOG (Multi-level)</div>
  <table class="ledger-table">
    <thead><tr><th>TIME</th><th>PLAYER</th><th>MARKET</th><th>RESULT</th><th>LINES</th></tr></thead>
    <tbody>
      ${list.length?list.map(c=>{
        const t=new Date(c.ts||Date.now()).toLocaleTimeString('en-IN');
        const lines=(c.lines||[]).map(l=>`${l.who}:${l.amount>0?'+':''}${l.amount}(${l.kind})`).join(' · ');
        return `<tr>
          <td style="font-size:9px">${t}</td>
          <td style="font-weight:700">${c.player}</td>
          <td style="font-size:10px">${c.market||''}</td>
          <td style="font-size:10px">${c.status}</td>
          <td style="font-size:9px;text-align:left">${lines}</td>
        </tr>`;
      }).join(''):'<tr><td colspan="5" style="color:#999">No commission yet — bets settle ke baad auto aayega</td></tr>'}
    </tbody>
  </table>
  ${back()}`;
}

function pageUserManage(){
  const role=(state.user&&state.user.role)||'';
  if(role!=='master'&&role!=='supermaster'&&role!=='agent') return shell(home());
  const data=loadUsers();
  let list=[];
  if(role==='supermaster'){
    list=list.concat(Object.values(data.masters||{}).map(x=>({...x, role:'master'})));
    list=list.concat(Object.values(data.agents||{}).map(x=>({...x, role:'agent'})));
    list=list.concat(Object.values(data.players||{}).map(x=>({...x, role:'player'})));
  } else if(role==='master'){
    const mid=(state.user.id||'').toUpperCase();
    list=list.concat(Object.values(data.agents||{}).filter(a=>(a.masterId||'').toUpperCase()===mid).map(x=>({...x, role:'agent'})));
    const aids=new Set(list.map(a=>a.id));
    list=list.concat(Object.values(data.players||{}).filter(pl=>aids.has(pl.agentId)).map(x=>({...x, role:'player'})));
  } else {
    const aid=(state.user.id||'').toUpperCase();
    list=Object.values(data.players||{}).filter(pl=>(pl.agentId||'').toUpperCase()===aid).map(x=>({...x, role:'player'}));
  }
  return `${topBtn()}
  <div class="view-title">USER BLOCK / SUSPEND</div>
  <div class="section-bar">ACTIVE · SUSPENDED · BLOCKED</div>
  <table class="ledger-table">
    <thead><tr><th>ID</th><th>NAME</th><th>ROLE</th><th>CHIPS</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>
      ${list.map(u=>{
        const st=u.status||'active';
        return `<tr>
          <td style="font-weight:700">${u.id}</td>
          <td>${u.name||''}</td>
          <td style="font-size:10px">${u.role}</td>
          <td>${(u.chips||0).toLocaleString()}</td>
          <td style="color:${st==='active'?'#0a7a0a':'#c00'};text-transform:uppercase;font-size:10px">${st}</td>
          <td style="white-space:nowrap">
            <button style="font-size:9px;padding:2px 5px" onclick="setUserStatus('${u.id}','active')">OK</button>
            <button style="font-size:9px;padding:2px 5px" onclick="setUserStatus('${u.id}','suspended')">SUS</button>
            <button style="font-size:9px;padding:2px 5px" onclick="setUserStatus('${u.id}','blocked')">BLK</button>
          </td>
        </tr>`;
      }).join('')||'<tr><td colspan="6">No users</td></tr>'}
    </tbody>
  </table>
  <div style="padding:8px;font-size:10px;color:#666">Blocked / Suspended users login nahi kar sakte · bet nahi laga sakte</div>
  ${back()}`;
}

function placeSessionBet(sessionName,side,line){
  const stakeEl=document.getElementById('sessionStake');
  const amount=Number((stakeEl&&stakeEl.value)||0);
  if(!Number.isInteger(amount)||amount<100||amount>20000){toast('Stake 100 se 20,000 virtual coins ke beech rakho');return}
  if(amount>getCoins()){toast('Insufficient virtual coin balance');return}
  if(!confirm(`${side} · ${sessionName}\nLine: ${line}\nStake: ${amount} coins\nConfirm session bet?`))return;
  syncPlayerChips(getCoins()-amount);
  pushSettledBet({type:'CRICKET SESSION',team:side,rate:1.9,amt:amount,profit:0,player:(state.user&&state.user.id)||'Player',status:'open',result:'PENDING'});toast(`${side} bet placed · ${amount} coins`);render();
}

function header(){
  const u=state.user||{id:'C150642',name:'Rahl',role:'player'};
  const c=(u.role==='player'?getCoins():(u.chips||0)).toFixed(2);
  const label = u.role==='supermaster' ? `${u.id} (Super Master)` : u.role==='agent' ? `${u.id} (Agent)` : u.role==='master' ? `${u.id} (Master)` : `${u.id} (${u.name||''})`;
  return `<div class="topbar">
    <div class="brand-logo"><img src="/assets/header-logo.jpg" alt="antpro"></div>
    <div class="user"><strong>${label}</strong></div>
    <button class="header-menu" onclick="state.menu=true;render()" aria-label="Open menu">☰</button>
  </div>
  <div class="chips-bar">Chips: ${c} <span class="expo">Expo : 0.00</span></div>
  ${state.view==='home'?`<div class="marquee-bar"><span>${escapeHTML(getMarquee())}&nbsp;&nbsp;&nbsp;${escapeHTML(getMarquee())}&nbsp;&nbsp;&nbsp;${escapeHTML(getMarquee())}</span></div>`:''}`;
}
function footer(){return `<nav class="bottomnav"><span>‹</span><span>›</span><span>⌂</span><span class="addr">antpro999.net</span><span>•••</span></nav>`}
function shell(body){
  return `<div class="app-shell">${header()}
    <main class="content">${body}</main>${footer()}
    <div class="drawer ${state.menu?'show':''}" onclick="closeMenu(event)">
      <aside class="drawer-panel" onclick="event.stopPropagation()">
        <button class="drawer-close" onclick="state.menu=false;render()">✕</button>
        ${(function(){
          const role=(state.user&&state.user.role)||'player';
          let items=[['🏠 HOME','home']];
          if(role==='master'||role==='supermaster'){ items.push(['👥 HIERARCHY','hierarchy']); items.push(['📋 LIVE BETS','livebets']); items.push(['📊 P&L REPORT','pnl']); items.push(['📑 STATEMENT','statement']); items.push(['💰 COMMISSION','commission']); items.push(['🛡 USER CONTROL','usermgmt']); items.push(['📜 BET HISTORY','bethistory']); }
          if(role==='agent'){ items.push(['👥 MY PLAYERS','agent']); items.push(['📋 LIVE BETS','livebets']); items.push(['📊 P&L REPORT','pnl']); items.push(['📑 STATEMENT','statement']); items.push(['💰 COMMISSION','commission']); items.push(['🛡 USER CONTROL','usermgmt']); items.push(['📜 BET HISTORY','bethistory']); }
          if(role==='player'){ items.push(['📜 BET HISTORY','bethistory']); items.push(['📑 STATEMENT','statement']); }
          items=items.concat([
            ['👤 CHANGE PASSWORD','password'],
            ['▶ IN PLAY','inplay'],
            ['▦ MATKA','matka'],
            ['ℹ RULES','rules'],
            ['◎ LEDGER','ledger'],
            ['▶ CASINO GAMES','casino'],
            ['⏻ LOGOUT','login']
          ]);
          return items.map(([t,v])=>`<div class="drawer-item" onclick="go('${v}')">${t}<span>→</span></div>`).join('');
        })()}
      </aside>
    </div>
    <div class="toast ${state.toast?'show':''}">${state.toast}</div>
  </div>`;
}
function topBtn(){return `<button class="menu-btn" onclick="state.menu=true;render()">☰ MAIN MENU</button>`}
function back(){return `<button class="back-btn" onclick="go('home')">BACK TO MAIN MENU</button>`}
function gameTop(title, round, cards){const key={'ANDAR BAHAR':'andar-bahar','LUCKY 7':'lucky7','TEEN PATTI':'teen-patti','DRAGON TIGER':'dragon-tiger'}[title];const r=key?ensureRound(key):null;const status=r&&r.phase==='betting'?'BET '+roundSeconds(key)+'s':(r&&r.phase==='locked'?'LOCKED '+roundSeconds(key)+'s':(r?(r.phase||'LIVE').toUpperCase():'LIVE'));return `<div class="game-top"><span class="g-title">${title}</span><span>Round ID : ${round}</span></div>`}
function alwaysGameSpinner(){return `<div class="always-spinner" aria-label="Live game loading"><div class="spinner"></div></div>`}


/* ===== LOGIN ===== */
function login(){
  return `<div class="login-screen">
    <div class="logo">ant<span>pro</span></div>
    <h2>Please Login to Continue</h2>
    <input id="loginUser" autocomplete="username" placeholder="Username" value="" onkeydown="if(event.key==='Enter')doLogin()">
    <input id="loginPass" autocomplete="current-password" type="password" placeholder="Password" onkeydown="if(event.key==='Enter')doLogin()">
    <button type="button" onclick="doLogin()">Login ⇥</button>
    <div class="footer-links">Privacy Policy &nbsp;|&nbsp; Terms & Condition &nbsp;|&nbsp; Rules & Regulation</div>
  </div>`;
}
function doLogin(){
  const userEl=document.getElementById('loginUser');
  const passEl=document.getElementById('loginPass');
  const username=(userEl&&userEl.value)||'';
  const password=(passEl&&passEl.value)||'';
  const acc=findAccount(username,password);
  if(!acc){toast('Invalid login');return;}
  if(isBlocked(acc.id)){toast('Account '+((acc.status)||'blocked').toUpperCase());return;}
  state.user=acc;
  state.loggedIn=true;
  sessionStorage.setItem('antpro_user',JSON.stringify(acc));
  if(acc.role==='supermaster'){
    go('super');
  } else if(acc.role==='master'){
    go('home');
  } else if(acc.role==='agent'){
    go('agent');
  } else {
    if(typeof acc.chips==='number') setCoins(acc.chips);
    go('home');
  }
  toast(acc.role.toUpperCase()+' login OK');
}

/* ===== HOME (exact tile set from video) ===== */
function home(){
  const tiles=[
    {label:'IN PLAY',cls:'ic-inplay',asset:'inplay',view:'inplay'},
    {label:'GAMES',cls:'ic-games',asset:'games',view:'casino'},
    {label:'MATKA',cls:'ic-matka',asset:'matka',view:'matka'},
    {label:'Aviator',cls:'ic-aviator',asset:'aviator',view:'aviator'},
    {label:'STATEMENT',cls:'ic-statement',asset:'statement',view:'ledger'},
    {label:'RULES',cls:'ic-rules',asset:'rules',view:'rules'},
    {label:'MY LEDGER',cls:'ic-ledger',asset:'ledger',view:'ledger'},
    {label:'CHANGE PASSWORD',cls:'ic-pass',asset:'password',view:'password'}
  ];
  return `<div class="home-grid">${tiles.map(t=>`
    <div class="home-tile" onclick="go('${t.view}')">
      <div class="icon-wrap ${t.cls}"><img src="/assets/${t.asset}.png" alt="${t.label}"></div>
      <label>${t.label}</label>
    </div>`).join('')}</div>`;
}

/* ===== RULES (Hindi default like video) ===== */
function rules(){
  return `${topBtn()}
  <div class="view-title">RULES & REGULATION</div>
  <div class="rules-tabs">
    <button class="${state.rules==='hindi'?'active':''}" onclick="state.rules='hindi';render()">Hindi</button>
    <button class="${state.rules==='english'?'active':''}" onclick="state.rules='english';render()">English</button>
  </div>
  <div class="rules-body">${state.rules==='hindi'?`
    <p><b>NOTE-</b></p>
    <p>1. सभी डीलर्स से निवेदन है कि क्लाइंट्स को साइट के रूल्स समझाने के बाद ही सौदे करवायें।</p>
    <p>2. अगर आप इस एग्रीमेंट को एक्सेप्ट नहीं करते हो तो कोई सौदा नहीं कीजिये।</p>
    <p>3. सर्वर या वेबसाइट में किसी तरह की खराबी आने या बंद हो जाने पर केवल किए गए सौदे ही मान्य होंगे। ऐसी स्थिति में किसी तरह का वाद-विवाद मान्य नहीं होगा।</p>
    <p>कंपनी के पास अधिकार है कि वे किसी भी ऐड/शर्तों को निलंबित/रद्द करें अगर यह गलतफहमी साबित होता है।</p>
    <p><b>BOOKMAKER</b></p>
    <p>• किसी भी कारण से किसी भी टीम को फायदा होगा या नुकसान, इसमें हमारी कोई जवाबदारी नहीं है।</p>
    <p>• कंपनी के पास किसी भी आईडी/बेट्स को हटाने/शून्य करने का अधिकार है।</p>
    <p><b>CASINO RULES</b></p>
    <p>1. यदि किसी कैसीनो गेम में किसी टेक्निकल इशू की वजह से रिजल्ट नहीं आता है तो उस गेम के लगाए गए कॉइन्स वापिस कर दिए जाएंगे।</p>
    <p><b>FANCY RULES</b></p>
    <p>1. मैच टाई होने पर सभी फैंसी बेट्स मान्य होंगी।</p>
    <p>2. टॉस या खराब मौसम की स्थिति से पहले सभी एडवांस फैंसी सस्पेंड कर दी जाएगी।</p>
  `:`
    <p><b>NOTE-</b></p>
    <p>1. All dealers must explain site rules to clients before taking any bets.</p>
    <p>2. If you do not accept this agreement, do not place any bets.</p>
    <p>3. In case of server/website failure only already placed bets will be valid.</p>
    <p><b>BOOKMAKER / CASINO / FANCY</b> rules apply as per management decision. Final decision rests with management.</p>
  `}</div>${back()}`;
}

/* ===== IN PLAY ===== */

/* ===== LIVE CRICKET (Firebase scraper first, SportScore fallback) ===== */
function firebaseSessionsToList(sessions, teamName='TEAM'){
  return Object.entries(sessions||{}).map(([key,s])=>({
    name: key.endsWith('_over') ? `${key.split('_')[0]} OVER RUN ${(teamName||'TEAM').slice(0,8).toUpperCase()}` : key.replaceAll('_',' ').toUpperCase(),
    not: s?.no_run ?? s?.not ?? '—',
    yes: s?.yes_run ?? s?.yes ?? '—',
    rate: s?.rate ?? '—',
    status: s?.status || 'SUSPENDED'
  }));
}

function normalizeFirebaseMatch(id, m){
  const teams=String(m?.teams||'Unknown v Unknown');
  const parts=teams.split(/\s+v(?:s)?\.?\s+/i);
  const score=String(m?.score||'—');
  const scoreParts=score.split(/\s+-\s+/);
  const status=String(m?.status||'').toLowerCase();
  return {
    id: String(id),
    name: teams,
    home: parts[0]||teams,
    away: parts.slice(1).join(' v ')||'',
    homeScore: scoreParts[0]||'—',
    awayScore: scoreParts[1]||'—',
    score,
    status,
    statusText: status,
    time: m?.updated_at ? new Date(m.updated_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '',
    competition: m?.competition||'',
    live: status==='live',
    sessions: m?.sessions||{}
  };
}

async function fetchLiveCricket(){
  state.liveMatchesLoading = true;
  state.liveMatchesError = '';
  try{
    let list=[];
    const firebaseRes = await fetch('/api/firebase/live',{cache:'no-store'});
    if(firebaseRes.ok){
      const firebaseData=await firebaseRes.json();
      const firebaseEntries=Object.entries(firebaseData.live_matches||{});
      const newestFirebaseUpdate=firebaseEntries.reduce((max,[,m])=>Math.max(max,Number(m?.updated_at)||0),0);
      const firebaseFresh=newestFirebaseUpdate>0 && (Date.now()-newestFirebaseUpdate)<120000;
      if(firebaseFresh) list=firebaseEntries.map(([id,m])=>normalizeFirebaseMatch(id,m));
      else console.warn('Ignoring stale Firebase scraper snapshot; using fresh cricket feed');
    }
    if(!list.length){
      const res = await fetch('/api/cricket/matches',{cache:'no-store'});
      if(!res.ok) throw new Error('live feed API '+res.status);
      const data = await res.json();
      list = (data.matches || []).map((m,i)=>({
        id: i,
        name: (m.home||'?') + ' v ' + (m.away||'?'),
        home: m.home||'',
        away: m.away||'',
        homeScore: m.homeScore ?? m.home_score ?? '—',
        awayScore: m.awayScore ?? m.away_score ?? '—',
        status: (m.status||'').toLowerCase(),
        statusText: m.status_text||m.status||'',
        time: m.time ? new Date(m.time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '',
        competition: m.competition||'',
        live: (m.status||'').toLowerCase()==='live',
        sessions: {}
      }));
    }
    // live first, then upcoming, then finished
    list.sort((a,b)=>{
      const rank = s => s==='live'?0:s==='upcoming'?1:2;
      return rank(a.status)-rank(b.status);
    });
    state.liveMatches = list;
  }catch(e){
    state.liveMatchesError = 'Live feed temporarily unavailable';
    console.warn('Firebase/SportScore fetch failed', e);
  }
  state.liveMatchesLoading = false;
  if(state.view==='inplay'||state.view==='match') render();
}
// refresh every 45s when on inplay
setInterval(()=>{ if(state.view==='inplay'||state.view==='match') fetchLiveCricket(); }, 45000);


const MATCHES=[
  {id:0,name:'Victoria W v South Australia W',time:'Sep 29 2026, 09:00 AM',live:true},
  {id:1,name:'Western Australia W v Tasmania W',time:'Sep 29 2026, 11:00 AM',live:true},
  {id:2,name:'South Africa Emerging v Tuskers',time:'Sep 29 2026, 16:30 PM',live:false},
  {id:3,name:'Warriors v Limpopo',time:'Sep 29 2026, 17:30 PM',live:false},
  {id:4,name:'Boland v Knights',time:'Sep 29 2026, 21:30 PM',live:false},
  {id:5,name:'Zimbabwe W v West Indies W',time:'Sep 30 2026, 13:00 PM',live:false},
  {id:6,name:'India v West Indies',time:'Sep 30 2026, 14:00 PM',live:false},
  {id:7,name:'South Africa v Australia',time:'Sep 30 2026, 17:00 PM',live:false}
];
function inplay(){
  if(!state.liveMatches.length && !state.liveMatchesLoading && !state.liveMatchesError){
    fetchLiveCricket();
  }
  const list = state.liveMatches.length ? state.liveMatches : MATCHES.map((x,i)=>({...x, id:i, homeScore:'', awayScore:'', status:x.live?'live':'upcoming', statusText:'', competition:''}));
  return `${topBtn()}
  <div class="view-title">IN PLAY — LIVE CRICKET</div>
  <div style="padding:6px 8px;font-size:10px;color:#666;background:#fff;border-bottom:1px solid #eee">
    Live scores + sessions via Firebase scraper · auto-refresh
    <button onclick="fetchLiveCricket();toast('Refreshing…')" style="float:right;background:var(--gold);color:#fff;border:0;padding:3px 8px;font-size:10px;border-radius:3px;cursor:pointer">↻ Refresh</button>
  </div>
  ${state.liveMatchesLoading?'<div style="padding:16px;text-align:center;color:#888">Loading live matches…</div>':''}
  ${state.liveMatchesError?'<div style="padding:10px;text-align:center;color:#c00;font-size:11px">'+state.liveMatchesError+' · showing fallback list</div>':''}
  <div class="match-list">${list.map(m=>`
    <div class="match-row" onclick="state.matchId=${m.id};go('match')">
      <div class="match-dot" style="background:${m.live||m.status==='live'?'#4caf50':m.status==='finished'?'#999':'#bbb'}"></div>
      <div class="match-icons"><span>C</span><span>F</span><span>B</span></div>
      <div class="match-info">
        <div class="name">${m.name}</div>
        <div class="time">${m.live||m.status==='live'?'● LIVE · ':''}${m.homeScore&&m.homeScore!=='—'&&m.homeScore!=='-'?m.homeScore+' vs '+m.awayScore+' · ':''}${m.time||''} ${m.competition?'· '+m.competition:''}</div>
      </div>
    </div>`).join('')||'<div style="padding:20px;text-align:center;color:#888">No matches right now</div>'}</div>
  <div style="text-align:center;font-size:10px;color:#888;padding:10px">Kisi match pe tap karo → usi match ka scorecard + lines</div>
  ${back()}`;
}
async function fetchCricketSessions(matchName){
  if(!matchName||state.liveSessionsLoading)return;
  state.liveSessionsLoading=true;
  try{
    const firebaseMatch=state.liveMatches.find(m=>m.name===matchName);
    const firebaseList=firebaseSessionsToList(firebaseMatch?.sessions, firebaseMatch?.home);
    if(firebaseList.length){
      state.liveSessions=firebaseList;
      state.liveSessionsKey=matchName;
      state.liveSessionsLoading=false;
      if(state.view==='match')render();
      return;
    }
    const res=await fetch('/api/cricket/sessions?match='+encodeURIComponent(matchName),{cache:'no-store'});
    if(!res.ok)throw new Error('session api '+res.status);
    const data=await res.json();state.liveSessions=data.sessions||[];state.liveSessionsKey=matchName;
  }catch(e){console.warn('session feed failed',e)}
  state.liveSessionsLoading=false;
  if(state.view==='match')render();
}

function match(){
  const list = state.liveMatches.length ? state.liveMatches : (typeof MATCHES!=='undefined'?MATCHES:[]).map((x,i)=>({...x,id:i,home:(x.name||'').split(' v ')[0]||'Team A',away:(x.name||'').split(' v ')[1]||'Team B',homeScore:'—',awayScore:'—',status:x.live?'live':'upcoming',statusText:'',competition:'',time:x.time||''}));
  const m = list[state.matchId] || list[0] || {name:'Match',home:'Team A',away:'Team B',homeScore:'—',awayScore:'—',live:false,status:'upcoming',statusText:'',competition:'',time:''};
  const isLive = m.live || m.status==='live';
  if(state.liveSessionsKey!==m.name&&!state.liveSessionsLoading)fetchCricketSessions(m.name);
  const base = isLive ? 70 + Math.floor(Math.random()*25) : 0;
  const lagai1 = isLive ? base : '—';
  const khai1 = isLive ? base + 2 + Math.floor(Math.random()*3) : '—';
  const lagai2 = isLive ? 95 - base + Math.floor(Math.random()*10) : '—';
  const khai2 = isLive ? (typeof lagai2==='number'?lagai2:0) + 2 + Math.floor(Math.random()*3) : '—';
  const fallbackSessions = isLive ? [
    {name:'6 OVER RUN '+((m.home||'T1').slice(0,8).toUpperCase()), not:42, yes:45, rate:'1.90', status:'OPEN'},
    {name:'10 OVER RUN '+((m.home||'T1').slice(0,8).toUpperCase()), not:68, yes:72, rate:'1.90', status:'OPEN'},
    {name:'15 OVER RUN '+((m.home||'T1').slice(0,8).toUpperCase()), not:95, yes:100, rate:'1.90', status:'OPEN'},
    {name:'20 OVER RUN '+((m.home||'T1').slice(0,8).toUpperCase()), not:125, yes:132, rate:'1.90', status:'OPEN'},
    {name:'FALL OF 1ST WKT', not:18, yes:22, rate:'1.90', status:'OPEN'},
    {name:'MATCH 1ST INNING TOTAL', not:140, yes:155, rate:'1.90', status:'OPEN'}
  ] : [{name:'Sessions open when match goes LIVE', not:'—', yes:'—', rate:'—', status:'SUSPENDED'}];
  const sessions = state.liveSessionsKey===m.name && state.liveSessions.length ? state.liveSessions : fallbackSessions;

  return `${topBtn()}
  <div class="match-head">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="live-badge">${isLive?'● LIVE':(m.status||'UPCOMING').toUpperCase()}</span>
      <span style="font-size:10px">${m.competition||''}</span>
    </div>
  </div>

  <!-- THIS MATCH ONLY scorecard -->
  <div class="section-bar">SCORECARD — THIS MATCH ONLY</div>
  <div class="this-match-score">
    <div class="tms-row">
      <div class="tms-team">
        <div class="tms-name">${m.home||'Team A'}</div>
        <div class="tms-score">${m.homeScore||'—'}</div>
      </div>
      <div class="tms-vs">VS</div>
      <div class="tms-team">
        <div class="tms-name">${m.away||'Team B'}</div>
        <div class="tms-score">${m.awayScore||'—'}</div>
      </div>
    </div>
    <div class="tms-meta">
      ${isLive?'<span class="tms-live">● LIVE</span>':''}
      <span>${m.statusText||m.status||''}</span>
      <span>${m.time||''}</span>
    </div>
    <div class="tms-note">Sirf is match ka score · doosre match ke liye list se select karo</div>
  </div>

  <div class="section-bar">BOOKMAKER | Min : 100 &nbsp; Max : —</div>
  <table class="bm-table">
    <thead><tr><th style="text-align:left">TEAM</th><th>LAGAI</th><th>KHAI</th><th>POS.</th></tr></thead>
    <tbody>
      <tr>
        <td style="text-align:left;font-weight:600">${m.home||'Team A'}</td>
        <td class="lagai" style="cursor:pointer" onclick="toast('Lagai ${m.home||''} @ ${lagai1}')">${lagai1}</td>
        <td class="khai" style="cursor:pointer" onclick="toast('Khai ${m.home||''} @ ${khai1}')">${khai1}</td>
        <td>0</td>
      </tr>
      <tr>
        <td style="text-align:left;font-weight:600">${m.away||'Team B'}</td>
        <td class="lagai" style="cursor:pointer" onclick="toast('Lagai ${m.away||''} @ ${lagai2}')">${lagai2}</td>
        <td class="khai" style="cursor:pointer" onclick="toast('Khai ${m.away||''} @ ${khai2}')">${khai2}</td>
        <td>0</td>
      </tr>
    </tbody>
  </table>
  <div class="section-bar">SESSION <span style="font-weight:400;font-size:10px">AUTO · VIRTUAL COINS</span></div>
  <div class="session-stakebar"><span>Balance: <b>${getCoins().toLocaleString()}</b> coins</span><label for="sessionStake">STAKE</label><input id="sessionStake" type="number" min="100" max="20000" step="100" value="100" inputmode="numeric"><small>Min 100 · Max 20,000</small></div>
  ${sessions.map(s=>`
    <div class="session-row">
      <div style="flex:1">
        <b>${s.name}</b><br>
        <small>NOT <b style="color:#1a5fb4">${s.not}</b> &nbsp; YES <b style="color:#c00">${s.yes}</b></small>
      </div>
      <div class="session-market">
        <button class="no-box" ${s.status!=='OPEN'?'disabled':''} onclick='placeSessionBet(${JSON.stringify(s.name)},"NO",${Number(s.not)||0})'>NO<small>${s.not}</small></button>
        <button class="yes-box" ${s.status!=='OPEN'?'disabled':''} onclick='placeSessionBet(${JSON.stringify(s.name)},"YES",${Number(s.yes)||0})'>YES<small>${s.yes}</small></button>
      </div>
      <span class="sus" style="color:${s.status==='OPEN'?'#0a7a0a':'#c00'}">${s.status}</span>
    </div>`).join('')}
  <div class="section-bar">FANCY / MATCH BETS</div>
  <table class="bm-table">
    <thead><tr><th>SESSION</th><th>RUN</th><th>RATE</th><th>MODE</th></tr></thead>
    <tbody>
      ${isLive?sessions.slice(0,3).map(s=>`
        <tr>
          <td style="text-align:left;font-size:10px">${s.name}</td>
          <td>${s.not}/${s.yes}</td>
          <td>${s.rate||'—'}</td>
          <td style="color:#0a7a0a">OPEN</td>
        </tr>`).join(''):'<tr><td colspan="4" style="color:#999;padding:12px">Sessions auto-open when LIVE</td></tr>'}
    </tbody>
  </table>
  ${back()}`;
}
function casino(){
  const live=getGamesLive();
  const virtual=[['DUS KA DUM','virtual','dus-ka-dum'],['ROULETTE','virtual','roulette'],['ANDAR BAHAR','andar','virtual-andar-bahar']];
  const liveGames=[
    ['ANDAR BAHAR','andar','andar-bahar','live-andar-bahar'],
    ['T20 TEEN PATTI','teenpatti','teen-patti','t20-teen-patti'],
    ['LUCKY 7','lucky7','lucky7','lucky-7'],
    ['DRAGON TIGER','dragontiger','dragon-tiger','dragon-tiger'],
    ['AMAR AKBAR ANTHONY','aaa','virtual','amar-akbar-anthony'],
    ['ONE DAY TEEN PATTI','odtp','virtual','one-day-teen-patti']
  ];
  return `${topBtn()}
  <div class="view-title">CASINO GAMES</div>
  <div class="casino-section">
    <h3>Virtual Casino</h3>
    <div class="casino-grid virtual-grid">${virtual.map(([n,v,a])=>`
      <div class="casino-tile ${live.virtual!==false?'':'off'}" onclick="${v==='andar'?'go(\'andar\')':'toast(\'Coming soon\')'}">
        <img class="casino-art" src="/assets/casino-${a}.jpg" alt="${n}">
      </div>`).join('')}</div>
    <h3>Live Casino</h3>
    <div class="casino-grid">${liveGames.map(([n,v,k,a])=>{
      const on=k?live[k]!==false:true;
      return `<div class="casino-tile ${on?'':'off'}" onclick="${on&&['andar','lucky7','teenpatti','dragontiger'].includes(v)?`go('${v}')`:'toast(\'Coming soon\')'}">
        <img class="casino-art" src="/assets/casino-${a}.jpg" alt="${n}">
      </div>`;
    }).join('')}</div>
  </div>${back()}`;
}

/* ===== ANDAR BAHAR (black UI like video) ===== */


/* ===== CARD HELPERS (standard casino rules) ===== */
function freshDeck(){
  const faces=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits=[{s:'♠',c:''},{s:'♥',c:'red'},{s:'♦',c:'red'},{s:'♣',c:''}];
  const d=[];
  for(const f of faces) for(const su of suits) d.push({v:f,suit:su.s,s:su.c});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}
function cardRank(c){
  const o={'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13};
  return o[c.v]||0;
}
function cardHTML(c){
  if(!c) return '<div class="p-card ghost">?</div>';
  return `<div class="p-card ${c.s||''}">${c.v}<br><small>${c.suit||''}</small></div>`;
}

function andar(){
  const live=getGamesLive()['andar-bahar'];
  if(!live) return `${topBtn()}<div class="view-title">ANDAR BAHAR</div><div style="padding:40px;text-align:center;color:#666">Offline</div>${back()}`;
  const rid=String(Date.now()).slice(-13);
  const j=state.abJoker, a=state.andarCards.andar||[], b=state.andarCards.bahar||[];
  return `<div class="game-screen">
    ${gameTop('ANDAR BAHAR',(ensureRound('andar-bahar').roundId)||rid,cardHTML(j||null))}
    <div class="cards-zone live-video-stage">
      <div class="game-live-cards"><div class="live-side-label">Andar</div><div class="card-pair">${a.length?a.map(cardHTML).join(''):cardHTML(null)+cardHTML(null)}</div><div class="live-side-label">Bahar</div><div class="card-pair">${b.length?b.map(cardHTML).join(''):cardHTML(null)+cardHTML(null)}</div></div>
      ${alwaysGameSpinner()}
    </div>
    <div class="bet-locks">${stakeControl('andar-bahar')}
      <div class="bet-lock-row"><div class="side">Andar</div><div class="amt">0</div><div class="lock" onclick="playAndarBahar('Andar')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">Bahar</div><div class="amt">0</div><div class="lock" onclick="playAndarBahar('Bahar')">🔒</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    <div class="completed-bets">Completed Casino Bets</div>
    <div class="section-gold result-heading"><span>Last Result</span><span>View All</span></div>
    <div class="last-result">${(state.abHistory.length?state.abHistory:['R','R','R','R','R','R','R','R','R','R']).slice(0,10).map(x=>`<div class="result-dot">${x[0]}</div>`).join('')}</div>
    <div class="section-gold">My Bet</div>
    <table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead>
    <tbody>${state.activeBets.filter(x=>x.type==='AndarBahar').slice(0,5).map(x=>`<tr><td>${x.team}</td><td>${x.rate}</td><td>${x.amt}</td><td>${x.result||x.profit}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#555">—</td></tr>'}</tbody></table>
  </div>${back()}`;
}
function playAndarBahar(side){
  const key='andar-bahar', amt=readStake(key), rate=1.95;
  if(!amt||!canPlaceBet(key))return;
  if(getCoins()<amt){state.resolving[key]=false;toast('Chips kam hain');return}
  syncPlayerChips(getCoins()-amt);state.andarSpinning=true;state.abJoker=null;state.andarCards={andar:[],bahar:[]};render();
  setTimeout(()=>{
    const deck=freshDeck(),joker=deck.pop();state.abJoker=joker;render();
    const andar=[],bahar=[];let first='Andar',winner=null;
    const settle=()=>{winner=smartDecision(key,['Andar','Bahar'],winner);const won=side===winner,profit=Math.round(amt*(rate-1));if(won)syncPlayerChips(getCoins()+amt+profit);state.abHistory=state.abHistory||[];state.abHistory.unshift(winner==='Andar'?'A':'B');pushSettledBet({team:side,type:'AndarBahar',rate,amt,profit,player:(state.user&&state.user.id)||'Player',status:won?'won':'lost',result:won?'WON +'+(amt+profit):'LOST -'+amt});state.andarSpinning=false;toast(won?side+' WON · '+winner:'LOST · '+winner);finishRound(key);render()};
    const reveal=()=>{const c=deck.pop();if(first==='Andar')andar.push(c);else bahar.push(c);if(c.v===joker.v)winner=first;first=first==='Andar'?'Bahar':'Andar';state.andarCards={andar:[...andar],bahar:[...bahar]};render();if(!winner&&deck.length)setTimeout(reveal,CARD_GAP_MS);else setTimeout(settle,RESULT_HOLD_MS)};
    setTimeout(reveal,CARD_GAP_MS);
  },CARD_GAP_MS);
}
function lucky7(){
  const live=getGamesLive()['lucky7'];
  if(!live) return `${topBtn()}<div class="view-title">LUCKY 7</div><div style="padding:40px;text-align:center;color:#666">Offline</div>${back()}`;
  const c=state.l7Card;
  return `<div class="game-screen">
    ${gameTop('LUCKY 7',(ensureRound('lucky7').roundId)||'—',cardHTML(c||null))}
    <div class="cards-zone live-video-stage">
      <div class="game-live-cards"><div class="live-side-label">Lucky 7</div><div class="card-pair">${cardHTML(c||null)}</div></div>
      ${alwaysGameSpinner()}
    </div>
    <div class="bet-locks">${stakeControl('lucky7')}
      <div class="bet-lock-row"><div class="side">7 UP</div><div class="amt">0</div><div class="lock" onclick="playLucky7('7 UP')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">7</div><div class="amt">0</div><div class="lock" onclick="playLucky7('7')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">7 DOWN</div><div class="amt">0</div><div class="lock" onclick="playLucky7('7 DOWN')">🔒</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    <div class="completed-bets">Completed Casino Bets</div>
    <div class="section-gold">My Bet</div>
    <table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead>
    <tbody>${state.activeBets.filter(x=>x.type==='LUCKY 7').slice(0,5).map(x=>`<tr><td>${x.team}</td><td>${x.rate}</td><td>${x.amt}</td><td>${x.result||x.profit}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#555">—</td></tr>'}</tbody></table>
  </div>${back()}`;
}
function playLucky7(side){
  const key='lucky7',rates={'7 UP':1.95,'7':11,'7 DOWN':1.95},rate=rates[side]||1.95,amt=readStake(key);
  if(!amt||!canPlaceBet(key))return;if(getCoins()<amt){state.resolving[key]=false;toast('Chips kam hain');return}
  syncPlayerChips(getCoins()-amt);state.l7Spin=true;state.l7Card=null;render();
  setTimeout(()=>{
    const card=freshDeck()[0];state.l7Card=card;state.l7Spin=false;render();
    setTimeout(()=>{const natural=cardRank(card)>7?'7 UP':cardRank(card)<7?'7 DOWN':'7',winSide=smartDecision(key,['7 UP','7','7 DOWN'],natural),won=side===winSide,profit=Math.round(amt*(rate-1));if(won)syncPlayerChips(getCoins()+amt+profit);pushSettledBet({team:side,type:'LUCKY 7',rate,amt,profit,player:(state.user&&state.user.id)||'Player',status:won?'won':'lost',result:won?'WON +'+(amt+profit):'LOST -'+amt});toast(won?side+' WON · card '+card.v:'LOST · card '+card.v);finishRound(key);render()},RESULT_HOLD_MS);
  },CARD_GAP_MS);
}
function teenpatti(){
  const live=getGamesLive()['teen-patti'];
  if(!live) return `${topBtn()}<div class="view-title">TEEN PATTI</div><div style="padding:40px;text-align:center;color:#666">Offline</div>${back()}`;
  const ph=state.tpPlayer||[], dh=state.tpDealer||[];
  return `<div class="game-screen">
    ${gameTop('TEEN PATTI',(ensureRound('teen-patti').roundId)||'—',cardHTML(ph[0]||dh[0]||null)+cardHTML(ph[1]||dh[1]||null))}
    <div class="cards-zone live-video-stage">
      <div class="game-live-cards"><div class="live-side-label">Team A</div><div class="card-pair">${ph.length?ph.map(cardHTML).join(''):cardHTML(null)+cardHTML(null)+cardHTML(null)}</div><div class="live-side-label">Team B</div><div class="card-pair">${dh.length?dh.map(cardHTML).join(''):cardHTML(null)+cardHTML(null)+cardHTML(null)}</div></div>
      ${alwaysGameSpinner()}
    </div>
    <div class="bet-locks">${stakeControl('teen-patti')}
      <div class="bet-lock-row"><div class="side">Team A</div><div class="amt">0</div><div class="lock" onclick="playTeenPatti('Team A')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">Tie</div><div class="amt">0</div><div class="lock" onclick="playTeenPatti('Tie')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">Team B</div><div class="amt">0</div><div class="lock" onclick="playTeenPatti('Team B')">🔒</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    <div class="completed-bets">Completed Casino Bets</div>
    <div class="section-gold">My Bet</div>
    <table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead>
    <tbody>${state.activeBets.filter(x=>x.type==='TEEN PATTI').slice(0,5).map(x=>`<tr><td>${x.team}</td><td>${x.rate}</td><td>${x.amt}</td><td>${x.result||x.profit}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#555">—</td></tr>'}</tbody></table>
  </div>${back()}`;
}
function handScore(cards){
  // simplified: trail > pure sequence > sequence > color > pair > high
  const ranks=cards.map(cardRank).sort((a,b)=>a-b);
  const sum=ranks.reduce((s,x)=>s+x,0);
  const isPair=ranks[0]===ranks[1]||ranks[1]===ranks[2]||ranks[0]===ranks[2];
  const isTrail=ranks[0]===ranks[1]&&ranks[1]===ranks[2];
  const sameSuit=cards[0].suit===cards[1].suit&&cards[1].suit===cards[2].suit;
  let score=sum;
  if(isTrail) score+=1000;
  else if(sameSuit&&ranks[2]-ranks[0]===2) score+=800;
  else if(ranks[2]-ranks[0]===2&&new Set(ranks).size===3) score+=600;
  else if(sameSuit) score+=400;
  else if(isPair) score+=200;
  return score;
}
function playTeenPatti(side){
  const key='teen-patti',rates={'Team A':1.98,'Tie':8.5,'Team B':1.98},rate=rates[side]||1.98,amt=readStake(key);
  if(!amt||!canPlaceBet(key))return;if(getCoins()<amt){state.resolving[key]=false;toast('Chips kam hain');return}
  syncPlayerChips(getCoins()-amt);state.tpSpin=true;state.tpPlayer=[];state.tpDealer=[];render();
  const deck=freshDeck(),player=[deck.pop(),deck.pop(),deck.pop()],dealer=[deck.pop(),deck.pop(),deck.pop()];let step=0;
  const settle=()=>{const ps=handScore(player),ds=handScore(dealer),natural=ps>ds?'Team A':ds>ps?'Team B':'Tie',result=smartDecision(key,['Team A','Tie','Team B'],natural),won=side===result,profit=Math.round(amt*(rate-1));if(won)syncPlayerChips(getCoins()+amt+profit);pushSettledBet({team:side,type:'TEEN PATTI',rate,amt,profit,player:(state.user&&state.user.id)||'Player',status:won?'won':'lost',result:won?'WON +'+(amt+profit):'LOST -'+amt});state.tpSpin=false;toast(won?side+' WON':'LOST · '+result);finishRound(key);render()};
  const reveal=()=>{if(step%2===0)state.tpPlayer.push(player[Math.floor(step/2)]);else state.tpDealer.push(dealer[Math.floor(step/2)]);step++;render();if(step<6)setTimeout(reveal,CARD_GAP_MS);else setTimeout(settle,RESULT_HOLD_MS)};
  setTimeout(reveal,CARD_GAP_MS);
}
function dragontiger(){
  const live=getGamesLive()['dragon-tiger'];
  if(!live) return `${topBtn()}<div class="view-title">DRAGON TIGER</div><div style="padding:40px;text-align:center;color:#666">Offline</div>${back()}`;
  const d=state.dtDragon, t=state.dtTiger;
  return `<div class="game-screen">
    ${gameTop('DRAGON TIGER',(ensureRound('dragon-tiger').roundId)||'—',cardHTML(d||null)+cardHTML(t||null))}
    <div class="cards-zone live-video-stage">
      <div class="game-live-cards"><div class="live-side-label">Dragon</div><div class="card-pair">${cardHTML(d||null)}</div><div class="live-side-label">Tiger</div><div class="card-pair">${cardHTML(t||null)}</div></div>
      ${alwaysGameSpinner()}
    </div>
    <div class="bet-locks">${stakeControl('dragon-tiger')}
      <div class="bet-lock-row"><div class="side">Dragon</div><div class="amt">0</div><div class="lock" onclick="playDragonTiger('Dragon')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">Tie</div><div class="amt">0</div><div class="lock" onclick="playDragonTiger('Tie')">🔒</div></div>
      <div class="bet-lock-row"><div class="side">Tiger</div><div class="amt">0</div><div class="lock" onclick="playDragonTiger('Tiger')">🔒</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    <div class="completed-bets">Completed Casino Bets</div>
    <div class="section-gold">My Bet</div>
    <table class="my-bet-table"><thead><tr><th>Name</th><th>Odds</th><th>Stake</th><th>P/L</th></tr></thead>
    <tbody>${state.activeBets.filter(x=>x.type==='DRAGON TIGER').slice(0,5).map(x=>`<tr><td>${x.team}</td><td>${x.rate}</td><td>${x.amt}</td><td>${x.result||x.profit}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#555">—</td></tr>'}</tbody></table>
  </div>${back()}`;
}
function playDragonTiger(side){
  const key='dragon-tiger',rates={'Dragon':1.95,'Tie':9,'Tiger':1.95},rate=rates[side]||1.95,amt=readStake(key);
  if(!amt||!canPlaceBet(key))return;if(getCoins()<amt){state.resolving[key]=false;toast('Chips kam hain');return}
  syncPlayerChips(getCoins()-amt);state.dtSpin=true;state.dtDragon=null;state.dtTiger=null;render();
  const deck=freshDeck(),dragon=deck.pop(),tiger=deck.pop();
  setTimeout(()=>{state.dtDragon=dragon;render();setTimeout(()=>{state.dtTiger=tiger;state.dtSpin=false;render();setTimeout(()=>{const natural=cardRank(dragon)>cardRank(tiger)?'Dragon':cardRank(tiger)>cardRank(dragon)?'Tiger':'Tie',result=smartDecision(key,['Dragon','Tie','Tiger'],natural),won=side===result,profit=Math.round(amt*(rate-1));if(won)syncPlayerChips(getCoins()+amt+profit);pushSettledBet({team:side,type:'DRAGON TIGER',rate,amt,profit,player:(state.user&&state.user.id)||'Player',status:won?'won':'lost',result:won?'WON +'+(amt+profit):'LOST -'+amt});toast(won?side+' WON':'LOST · '+result);finishRound(key);render()},RESULT_HOLD_MS)},CARD_GAP_MS)},CARD_GAP_MS);
}
function matka(){return `${topBtn()}<div class="view-title">MATKA</div><div style="padding:40px;text-align:center;color:#666">Coming soon</div>${back()}`}
function aviator(){return `${topBtn()}<div class="view-title">AVIATOR</div><div style="padding:40px;text-align:center;color:#666">Coming soon</div>${back()}`}

/* ===== LEDGER ===== */


function liveBetsMaster(){
  /* Master / SuperMaster / Agent — live bets feed (who bet what) */
  const role=(state.user&&state.user.role)||'';
  if(!['master','supermaster','agent'].includes(role)) return shell(home());

  let bets = (state.activeBets||[]).slice(0,80);

  // Agent: only their downline players
  if(role==='agent'){
    const data=loadUsers();
    const myId=(state.user.id||'').toUpperCase();
    const myPlayers=new Set(
      Object.values(data.players||{})
        .filter(pl=>(pl.agentId||'').toUpperCase()===myId)
        .map(pl=>(pl.id||'').toUpperCase())
    );
    myPlayers.add(myId);
    bets = bets.filter(b=>myPlayers.has(String(b.player||'').toUpperCase()) || myPlayers.has(String(b.playerId||'').toUpperCase()));
  }

  const totalStake = bets.reduce((s,b)=>s+(b.amt||0),0);
  const won = bets.filter(b=>b.status==='won').length;
  const lost = bets.filter(b=>b.status==='lost').length;
  const pending = bets.filter(b=>!b.status||b.status==='pending'||b.status==='open').length;
  const title = role==='agent' ? 'LIVE BETS — MY PLAYERS' : 'LIVE BETS — ALL';

  return `${topBtn()}
  <div class="view-title">${title}</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val">${bets.length}</div><div class="stat-lbl">Total Bets</div></div>
    <div class="stat-box"><div class="stat-val">${totalStake}</div><div class="stat-lbl">Total Stake</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#0a7a0a">${won}</div><div class="stat-lbl">Won</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#c00">${lost}</div><div class="stat-lbl">Lost</div></div>
  </div>
  <div class="section-bar">WHO BET WHAT (Live Feed)</div>
  <table class="ledger-table">
    <thead>
      <tr>
        <th>TIME</th>
        <th>ID</th>
        <th>MARKET</th>
        <th>SIDE</th>
        <th>RATE</th>
        <th>STAKE</th>
        <th>STATUS</th>
        <th>P/L</th>
      </tr>
    </thead>
    <tbody>
      ${bets.length?bets.map(b=>{
        const t=new Date(b.ts||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        const player=b.player||b.playerId||'—';
        const st=b.status||'pending';
        const pl = st==='won' ? '+'+(b.amt+(b.profit||0)) : st==='lost' ? '-'+(b.amt||0) : '—';
        const stColor = st==='won'?'#0a7a0a':st==='lost'?'#c00':'#888';
        return `<tr>
          <td style="font-size:9px">${t}</td>
          <td style="font-size:10px;font-weight:700">${player}</td>
          <td style="font-size:10px">${b.type||'—'}</td>
          <td style="font-weight:600">${b.team||b.side||'—'}</td>
          <td>${b.rate||'—'}</td>
          <td style="font-weight:700">${b.amt||0}</td>
          <td style="color:${stColor};font-weight:700;text-transform:uppercase;font-size:10px">${st}</td>
          <td style="color:${stColor};font-weight:700">${pl}</td>
        </tr>`;
      }).join(''):'<tr><td colspan="8" style="color:#999;padding:16px">Abhi koi bet nahi · players jab bet lagayenge yahan live dikhega</td></tr>'}
    </tbody>
  </table>
  <div style="padding:8px;font-size:10px;color:#666;text-align:center">Auto-updates when players place bets · ID · market · side · stake</div>
  ${back()}`;
}

function superPanel(){
  if(!state.user||state.user.role!=='supermaster') return shell(home());
  const data=loadUsers();
  const masters=Object.values(data.masters||{});
  const totalAgents=Object.keys(data.agents||{}).length;
  const totalPlayers=Object.keys(data.players||{}).length;
  return `${topBtn()}
  <div class="view-title">SUPER MASTER PANEL</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val">${masters.length}</div><div class="stat-lbl">Masters</div></div>
    <div class="stat-box"><div class="stat-val">${totalAgents}</div><div class="stat-lbl">Agents</div></div>
    <div class="stat-box"><div class="stat-val">${totalPlayers}</div><div class="stat-lbl">Players</div></div>
    <div class="stat-box"><div class="stat-val">∞</div><div class="stat-lbl">Limit</div></div>
  </div>
  <div class="section-bar">MY MASTERS (Downline Books)</div>
  <div class="agent-player-list">
    ${masters.length?masters.map(m=>{
      const agCount=(m.agents||[]).length;
      return `<div class="agent-player-card">
        <div class="ap-left">
          <strong>${m.id}</strong>
          <small>${m.name||''} · ${agCount} agents</small>
          <small style="display:block;color:#5c3d1e">Share ${m.share||0}% · Comm ${m.commission||0}%</small>
        </div>
        <div class="ap-chips">${(m.chips||0).toLocaleString()}</div>
      </div>`;
    }).join(''):'<div style="padding:16px;text-align:center;color:#888">No masters yet</div>'}
  </div>
  <div class="view-title">CREATE MASTER (New Book / Game)</div>
  <div class="form-box">
    <p style="font-size:10px;color:#666;margin-bottom:8px">Har master alag book · Share 95%+ dono ko de sakte ho (apna-apna book)</p>
    <label>Master ID</label><input id="newMasterId" placeholder="e.g. MASTER3">
    <label>Name</label><input id="newMasterName" placeholder="Master name">
    <label>Password</label><input id="newMasterPass" placeholder="Password" value="master123">
    <label>Share % (e.g. 95)</label><input id="newMasterShare" type="number" value="95" min="0" max="99">
    <label>Commission %</label><input id="newMasterComm" type="number" value="5" min="0" max="50">
    <label>Opening Chips</label><input id="newMasterChips" type="number" value="100000">
    <button class="btn-green" onclick="superCreateMaster()">CREATE MASTER BOOK</button>
  </div>
  <div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">
    <button class="menu-btn" style="margin:0" onclick="go('livebets')">📡 LIVE BETS</button>
    <button class="menu-btn" style="margin:0" onclick="go('inplay')">IN PLAY</button>
    <button class="menu-btn" style="margin:0" onclick="go('casino')">CASINO</button>
  </div>
  ${back()}`;
}
function superCreateMaster(){
  if(!state.user||state.user.role!=='supermaster'){toast('Only Super Master');return;}
  const id=((document.getElementById('newMasterId')||{}).value||'').trim().toUpperCase();
  const name=((document.getElementById('newMasterName')||{}).value||'').trim();
  const pass=((document.getElementById('newMasterPass')||{}).value||'').trim();
  const share=Math.min(99,Math.max(0,parseInt((document.getElementById('newMasterShare')||{}).value,10)||0));
  const comm=Math.min(50,Math.max(0,parseInt((document.getElementById('newMasterComm')||{}).value,10)||0));
  const chips=parseInt((document.getElementById('newMasterChips')||{}).value,10)||0;
  if(!id||!pass){toast('ID + Password required');return;}
  const data=loadUsers();
  if(!data.masters) data.masters={};
  if(data.masters[id]){toast('Master ID exists');return;}
  data.masters[id]={id,name:name||id,role:'master',pass,chips,commission:comm,share,superId:'SUPER',agents:[]};
  saveUsers(data);
  toast('Master '+id+' created · Share '+share+'%');
  render();
}


function hierarchy(){
  const data=loadUsers();
  const agents=Object.values(data.agents||{});
  return `${topBtn()}
  <div class="view-title">MASTER & AGENT HIERARCHY</div>
  <div class="master-card">
    <div class="role-chip">MASTER</div>
    <div class="master-row"><strong>${(state.user&&state.user.id)||'MASTER'}</strong><span class="unlimited">Share ${(state.user&&state.user.share)||95}%</span></div>
    <p style="font-size:10px;color:#666;margin-top:6px">Master creates Agents · sets Commission % & Share %</p>
  </div>
  <div class="agent-list">
    <div class="agent-heading">AGENTS <span>${agents.length}</span></div>
    ${agents.map(a=>{
      const pc=(a.players||[]).length;
      return `<div class="agent-card">
        <div class="agent-avatar">${(a.name||a.id||'?')[0]}</div>
        <div><strong>${a.id}</strong><small>${a.name||''} · ${pc} players</small>
          <small style="display:block;color:#5c3d1e">Comm ${a.commission||0}% · Share ${a.share||0}%</small>
        </div>
        <div class="agent-coins">${(a.chips||0).toLocaleString()}</div>
      </div>`;
    }).join('') || '<div style="padding:12px;color:#888">No agents yet</div>'}
  </div>
  <div class="view-title" style="margin-top:8px">CREATE AGENT</div>
  <div class="form-box">
    <label>Agent ID</label><input id="newAgentId" placeholder="e.g. A1003">
    <label>Name</label><input id="newAgentName" placeholder="Agent name">
    <label>Password</label><input id="newAgentPass" placeholder="Password">
    <label>Commission %</label><input id="newAgentComm" type="number" value="10">
    <label>Share %</label><input id="newAgentShare" type="number" value="20">
    <label>Opening Chips</label><input id="newAgentChips" type="number" value="10000">
    <button class="btn-green" onclick="masterCreateAgent()">CREATE AGENT</button>
  </div>
  <div class="view-title">ASSIGN PLAYER TO AGENT</div>
  <div class="form-box">
    <label>Player ID</label><input id="asgPlayerId" placeholder="P2004">
    <label>Player Name</label><input id="asgPlayerName" placeholder="Name">
    <label>Agent ID</label><input id="asgAgentId" placeholder="A1001">
    <label>Opening Chips</label><input id="asgPlayerChips" type="number" value="1000">
    <button class="btn-green" onclick="masterAssignPlayer()">CREATE & ASSIGN PLAYER</button>
  </div>
  ${back()}`;
}
function masterCreateAgent(){
  if(!state.user||state.user.role!=='master'){toast('Only Master');return;}
  const id=((document.getElementById('newAgentId')||{}).value||'').trim().toUpperCase();
  const name=((document.getElementById('newAgentName')||{}).value||'').trim();
  const pass=((document.getElementById('newAgentPass')||{}).value||'').trim();
  const comm=parseInt((document.getElementById('newAgentComm')||{}).value,10)||0;
  const share=parseInt((document.getElementById('newAgentShare')||{}).value,10)||0;
  const chips=parseInt((document.getElementById('newAgentChips')||{}).value,10)||0;
  if(!id||!pass){toast('ID + Password required');return;}
  const data=loadUsers();
  if(data.agents[id]){toast('Agent ID exists');return;}
  data.agents[id]={id,name:name||id,role:'agent',pass,chips,commission:comm,share,masterId:(state.user&&state.user.id)||'MASTER',players:[]};
  if(data.masters&&data.masters[state.user.id]){ if(!data.masters[state.user.id].agents) data.masters[state.user.id].agents=[]; if(!data.masters[state.user.id].agents.includes(id)) data.masters[state.user.id].agents.push(id); }
  saveUsers(data);
  toast('Agent '+id+' created');
  render();
}
function masterAssignPlayer(){
  if(!state.user||state.user.role!=='master'){toast('Only Master');return;}
  const pid=((document.getElementById('asgPlayerId')||{}).value||'').trim().toUpperCase();
  const pname=((document.getElementById('asgPlayerName')||{}).value||'').trim();
  const aid=((document.getElementById('asgAgentId')||{}).value||'').trim().toUpperCase();
  const chips=parseInt((document.getElementById('asgPlayerChips')||{}).value,10)||0;
  if(!pid||!aid){toast('Player ID + Agent ID required');return;}
  const data=loadUsers();
  if(!data.agents[aid]){toast('Agent not found');return;}
  data.players[pid]={id:pid,name:pname||pid,role:'player',pass:'play123',chips,agentId:aid};
  if(!data.agents[aid].players) data.agents[aid].players=[];
  if(!data.agents[aid].players.includes(pid)) data.agents[aid].players.push(pid);
  saveUsers(data);
  toast('Player '+pid+' → Agent '+aid);
  render();
}


function ledger(){
  const bets=state.activeBets;
  let totalWon=0, totalLost=0;
  bets.forEach(b=>{
    if(b.status==='won') totalWon += (b.amt + (b.profit||0));
    else totalLost += (b.amt||0);
  });
  const hisab = totalWon - totalLost;
  return `${topBtn()}
  <div class="view-title">MY LEDGER</div>
  <table class="ledger-table">
    <thead><tr><th>DESCRIPTION</th><th>WON BY</th><th>WON</th><th>LOST</th><th>HISAB</th></tr></thead>
    <tbody>
      <tr>
        <td style="color:#1a5fb4">Casino Ledger (09-09-2026)</td>
        <td>Ledger</td><td>${totalWon}</td><td>${totalLost||9950}</td>
        <td class="neg">-${(totalLost||9950).toFixed(2)}</td>
      </tr>
      ${bets.slice(0,15).map(b=>{
        const won = b.status==='won' ? (b.amt+(b.profit||0)) : 0;
        const lost = b.status==='won' ? 0 : (b.amt||0);
        const h = won - lost;
        return `<tr>
          <td>${b.team} (${b.type})</td>
          <td>${b.status||'—'}</td>
          <td>${won||0}</td>
          <td>${lost||0}</td>
          <td class="${h>=0?'pos':'neg'}">${h>=0?'+':''}${h}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div style="padding:8px;font-size:11px;text-align:center">Balance: <b>${getCoins().toLocaleString()}</b> chips</div>
  ${back()}`;
}
function password(){
  return `${topBtn()}
  <div class="view-title">RATE INFORMATION</div>
  <div class="form-box" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:11px">Rate Difference :</span>
    <input type="number" value="1" style="width:60px;padding:6px;border:1px solid #ccc">
    <button class="btn-green" style="width:auto;padding:6px 14px;margin:0" onclick="toast('Updated')">UPDATE</button>
  </div>
  <div class="view-title">PERSONAL INFORMATION</div>
  <table class="info-table">
    <tr><td>Client Code :</td><td>C150642</td></tr>
    <tr><td>Client Name :</td><td>Rahl</td></tr>
    <tr><td>Chips :</td><td>${getCoins().toFixed(2)}</td></tr>
    <tr><td>Contact No :</td><td>9898989638</td></tr>
    <tr><td>Date Of Joining :</td><td>09-09-2026</td></tr>
    <tr><td>Address :</td><td>India</td></tr>
  </table>
  <div class="view-title">CHANGE PASSWORD</div>
  <div class="form-box">
    <label>OLD PASSWORD :</label><input type="password" placeholder="Old Password">
    <label>NEW PASSWORD :</label><input type="password" placeholder="New Password">
    <label>CONFIRM PASSWORD :</label><input type="password" placeholder="Confirm Password">
    <button class="btn-green" onclick="toast('Password updated')">UPDATE PASSWORD</button>
  </div>
  ${back()}`;
}

/* ===== ADMIN (games only + live bets + password change) ===== */

/* ===== AGENT PANEL ===== */
function agentHome(){
  const u=state.user;
  if(!u||u.role!=='agent') return shell(home());
  const data=loadUsers();
  const agent=data.agents[u.id]||u;
  const playerIds=agent.players||[];
  const players=playerIds.map(id=>data.players[id]).filter(Boolean);
  const totalPlayerChips=players.reduce((s,p)=>s+(p.chips||0),0);
  return `${topBtn()}
  <div class="view-title">AGENT PANEL — ${agent.id}</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val">${agent.commission||0}%</div><div class="stat-lbl">Commission</div></div>
    <div class="stat-box"><div class="stat-val">${agent.share||0}%</div><div class="stat-lbl">Share</div></div>
    <div class="stat-box"><div class="stat-val">${(agent.chips||0).toLocaleString()}</div><div class="stat-lbl">My Chips</div></div>
    <div class="stat-box"><div class="stat-val">${players.length}</div><div class="stat-lbl">Players</div></div>
  </div>
  <div class="section-bar" style="margin-top:8px">MY PLAYERS (Downline)</div>
  <div class="agent-player-list">
    ${players.length?players.map(p=>`
      <div class="agent-player-card">
        <div class="ap-left">
          <strong>${p.id}</strong>
          <small>${p.name||''}</small>
        </div>
        <div class="ap-chips">${(p.chips||0).toLocaleString()} chips</div>
        <div class="ap-actions">
          <button onclick="agentViewPlayer('${p.id}')">Ledger</button>
          <button onclick="agentCutChips('${p.id}')">Cut</button>
          <button onclick="agentAddChips('${p.id}')">Add</button>
        </div>
      </div>`).join('')+'<div style="padding:8px;font-size:11px;color:#666">Total players chips: <b>'+totalPlayerChips.toLocaleString()+'</b></div>'
      :'<div style="padding:16px;text-align:center;color:#888">No players under you yet. Master assigns players.</div>'}
  </div>
  <div class="section-bar">QUICK</div>
  <div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">
    <button class="menu-btn" style="margin:0" onclick="go('inplay')">IN PLAY</button>
    <button class="menu-btn" style="margin:0" onclick="go('casino')">CASINO</button>
    <button class="menu-btn" style="margin:0" onclick="go('ledger')">MY LEDGER</button>
    <button class="menu-btn" style="margin:0" onclick="go('password')">PASSWORD</button>
  </div>
  ${back()}`;
}
function agentViewPlayer(pid){
  const data=loadUsers();
  const p=data.players[pid];
  if(!p){toast('Player not found');return;}
  // show simple statement in toast/modal style via state
  state.view='agent-player';
  state._viewPlayer=p;
  render();
}
function agentPlayerView(){
  const p=state._viewPlayer;
  if(!p) return agentHome();
  return `${topBtn()}
  <div class="view-title">PLAYER STATEMENT — ${p.id}</div>
  <table class="info-table">
    <tr><td>Player ID</td><td>${p.id}</td></tr>
    <tr><td>Name</td><td>${p.name||'—'}</td></tr>
    <tr><td>Chips</td><td><b>${(p.chips||0).toLocaleString()}</b></td></tr>
    <tr><td>Agent</td><td>${p.agentId||'—'}</td></tr>
  </table>
  <div class="section-bar">LEDGER / ACTIVITY</div>
  <div class="bets-card" style="margin:8px">
    <p style="font-size:11px;color:#666">Player bets reflect in master/agent live feed when they play.</p>
    <p style="font-size:11px">Current balance: <b>${(p.chips||0).toLocaleString()} chips</b></p>
  </div>
  <div style="padding:8px;display:flex;gap:8px">
    <button class="menu-btn" style="margin:0;flex:1" onclick="agentCutChips('${p.id}')">Cut Chips</button>
    <button class="menu-btn" style="margin:0;flex:1" onclick="agentAddChips('${p.id}')">Add Chips</button>
  </div>
  <button class="back-btn" onclick="go('agent')">← BACK TO AGENT PANEL</button>`;
}
function agentCutChips(pid){
  const amt=prompt('Kitne chips CUT karne hain?', '500');
  if(amt===null) return;
  const n=parseInt(amt,10);
  if(!n||n<=0){toast('Invalid amount');return;}
  const data=loadUsers();
  const p=data.players[pid];
  if(!p){toast('Not found');return;}
  if((p.chips||0)<n){toast('Player ke paas itne chips nahi');return;}
  p.chips=(p.chips||0)-n;
  // credit agent book
  const agent=data.agents[state.user.id];
  if(agent) agent.chips=(agent.chips||0)+n;
  saveUsers(data);
  state.user=data.agents[state.user.id]||state.user;
  sessionStorage.setItem('antpro_user',JSON.stringify(state.user));
  toast(`Cut ${n} from ${pid}`);
  if(state.view==='agent-player'){state._viewPlayer=p;}
  render();
}
function agentAddChips(pid){
  const amt=prompt('Kitne chips ADD karne hain?', '500');
  if(amt===null) return;
  const n=parseInt(amt,10);
  if(!n||n<=0){toast('Invalid amount');return;}
  const data=loadUsers();
  const agent=data.agents[state.user.id];
  if(!agent){toast('Agent error');return;}
  if((agent.chips||0)<n){toast('Aapke paas itne chips nahi');return;}
  agent.chips-=n;
  const p=data.players[pid];
  if(!p){toast('Player not found');return;}
  p.chips=(p.chips||0)+n;
  saveUsers(data);
  state.user=agent;
  sessionStorage.setItem('antpro_user',JSON.stringify(agent));
  toast(`Added ${n} to ${pid}`);
  if(state.view==='agent-player'){state._viewPlayer=p;}
  render();
}


function adminBetsFeed(){
  const bets=state.activeBets.slice(0,30);
  if(!bets.length)return '<p style="color:#8b949e;font-size:11px">Abhi koi bet nahi · players bet lagayenge to yahan live dikhega.</p>';
  return bets.map(b=>{
    const t=new Date(b.ts||Date.now()).toLocaleTimeString();
    const pl=b.player||'Player';
    const st=b.status||'pending';
    const col=st==='won'?'#3fb950':st==='lost'?'#f85149':'#8b949e';
    return `<div class="bet-row-admin"><span><b>${pl}</b> → ${b.team} <small>(${b.type})</small> @ ${b.rate}</span><span style="color:${col}">${b.amt} · ${st} · ${t}</span></div>`;
  }).join('');
}
function adminDecisionCards(){
  const defs=[
    {key:'andar-bahar',name:'Andar Bahar',type:'AndarBahar',sides:['Andar','Bahar']},
    {key:'lucky7',name:'Lucky 7',type:'LUCKY 7',sides:['7 UP','7','7 DOWN']},
    {key:'teen-patti',name:'Teen Patti',type:'TEEN PATTI',sides:['Team A','Tie','Team B']},
    {key:'dragon-tiger',name:'Dragon Tiger',type:'DRAGON TIGER',sides:['Dragon','Tie','Tiger']}
  ];
  return defs.map(g=>{
    const r=ensureRound(g.key);
    const totals=sideTotalsFor(g.type,g.sides);
    const minSide=g.sides.reduce((a,s)=> (totals[s]||0)<(totals[a]||0)?s:a, g.sides[0]);
    const elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);
    const left=roundSeconds(g.key);
    return `<div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:#f0c040">${g.name}</strong>
        <span style="font-size:11px;color:#8b949e">Round <b style="color:#58a6ff">${r.roundId||'—'}</b></span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:11px">
        <span style="background:#21262d;padding:4px 8px;border-radius:4px">Phase: <b style="color:${r.phase==='betting'?'#3fb950':r.phase==='forced'?'#f0c040':'#f85149'}">${(r.phase||'idle').toUpperCase()}</b></span>
        <span style="background:#21262d;padding:4px 8px;border-radius:4px">⏱ <b>${left}s</b></span>
        ${r.forcedWinner?`<span style="background:#3d2a00;color:#f0c040;padding:4px 8px;border-radius:4px">FORCE: ${r.forcedWinner}</span>`:''}
      </div>
      <div style="font-size:11px;color:#8b949e;margin-bottom:6px">Side totals (kam coins wali soft highlight)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${g.sides.map(s=>{
          const v=totals[s]||0;
          const soft=s===minSide&&v>=0;
          return `<div style="flex:1;min-width:70px;text-align:center;padding:8px;border-radius:6px;background:${soft?'#1a2332':'#161b22'};border:1px solid ${soft?'#388bfd':'#30363d'}">
            <div style="font-size:10px;color:#8b949e">${s}</div>
            <div style="font-weight:700;font-size:14px;color:#fff">${v}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:10px;color:#8b949e;margin-bottom:6px">Force result (next / current reveal)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${g.sides.map(s=>`<button onclick="forceWinner('${g.key}','${s}')" style="flex:1;min-width:60px;padding:8px;background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;font-size:11px;cursor:pointer">${s}</button>`).join('')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="startNewRound('${g.key}',${GAME_TIMINGS[g.key]?.duration||30})" style="padding:7px 10px;background:#238636;border:0;color:#fff;border-radius:4px;font-size:11px;cursor:pointer">Restart ${GAME_TIMINGS[g.key]?.duration||30}s</button>
        <button onclick="closeRound('${g.key}')" style="padding:7px 10px;background:#da3633;border:0;color:#fff;border-radius:4px;font-size:11px;cursor:pointer">Close Round</button>
      </div>
    </div>`;
  }).join('');
}
function admin(){
  if(!state.adminAuthed){
    return `<div class="admin-login"><div class="admin-box">
      <h3>Controller Access</h3>
      <input type="password" id="adminPass" placeholder="Password" autocomplete="off">
      <button onclick="tryAdminLogin()">Enter</button>
      <p style="color:#8b949e;font-size:10px;margin-top:12px">Authorized only</p>
    </div></div>`;
  }
  const live=getGamesLive();
  const games=[{key:'andar-bahar',name:'Andar Bahar',perm:true},{key:'lucky7',name:'Lucky 7',perm:true},{key:'teen-patti',name:'Teen Patti',perm:true},{key:'dragon-tiger',name:'Dragon Tiger',perm:true},{key:'virtual',name:'Virtual Games',perm:false}];
  return `<div class="admin-panel">
    <div class="admin-top"><strong>NS Controller</strong><button onclick="adminLogout()" style="background:#30363d;color:#fff;border:0;padding:6px 10px;border-radius:4px">Logout</button></div>
    <div class="admin-section"><h4>MASTER GAME DECISION PANEL</h4>
      <p style="font-size:10px;color:#8b949e;margin-bottom:10px">Round No · live phase · seconds · side totals · force result (mainlibra style). Player ko force control nahi dikhta.</p>
      ${adminDecisionCards()}
    </div>
    <div class="admin-section"><h4>Games 24×7</h4>
      ${games.map(g=>`<div class="admin-row"><span>${g.name}${g.perm?' <small style="color:#f0c040">(permanent)</small>':''}</span>
        ${g.perm
          ? '<span class="toggle on" style="cursor:default">● LIVE 24×7</span>'
          : `<button class="toggle ${live[g.key]!==false?'on':'off'}" onclick="toggleGame('${g.key}')">${live[g.key]!==false?'● LIVE':'OFF'}</button>`}
      </div>`).join('')}
    </div>
    <div class="admin-section"><h4>Live Bets Feed</h4>${adminBetsFeed()}</div>
    <div class="admin-section"><h4>Controller Password</h4>
      <input type="password" id="newMasterPass" placeholder="New Password" style="width:100%;padding:8px;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#fff;border-radius:4px">
      <button onclick="changeMasterPass()" style="background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:7px 10px;border-radius:4px">Change Password</button>
    </div>
    <div class="admin-section"><h4>MASTER MARQUEE CONTROL</h4>
      <p style="font-size:10px;color:#8b949e;margin-bottom:8px">Home screen par chalne wali line ko Master yahan se replace kar sakta hai.</p>
      <input id="marqueeText" maxlength="120" value="${escapeHTML(getMarquee())}" placeholder="Enter scrolling announcement" style="width:100%;padding:8px;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#fff;border-radius:4px">
      <button onclick="saveMarquee()" style="background:#238636;color:#fff;border:0;padding:7px 10px;border-radius:4px">Update Marquee</button>
    </div>
    <div class="admin-actions"><button onclick="go('home')">Go to Site</button></div>
    <div class="admin-foot">/x9k2-ns-ctrl · AntPro UI · Libra controller logic</div>
  </div>`;
}
function tryAdminLogin(){const v=(document.getElementById('adminPass')||{}).value||'';if(v===getMasterPass()){state.adminAuthed=true;sessionStorage.setItem('antpro_admin_ok','1');render()}else toast('Wrong password')}
function adminLogout(){state.adminAuthed=false;sessionStorage.removeItem('antpro_admin_ok');render()}
function toggleGame(key){
  const PERMANENT = ['andar-bahar','lucky7','teen-patti','dragon-tiger'];
  if(PERMANENT.includes(key)){toast('Yeh game permanent hai — band nahi ho sakti');return;}
  const live=getGamesLive();
  live[key]=!(live[key]!==false);
  setGamesLive(live);
  toast(live[key]?key+' → LIVE':key+' → OFF');
  render();
}
function changeMasterPass(){const v=((document.getElementById('newMasterPass')||{}).value||'').trim();if(v.length<6){toast('Min 6 chars');return}localStorage.setItem(PASS_KEY,v);toast('Password changed')}

/* ===== ROUTER ===== */
function view(){
  if(state.view==='admin')return admin();
  if(!state.loggedIn)return login();
  if(state.view==='agent'){
    if(!state.user||(state.user.role!=='agent'&&state.user.role!=='master')) return shell(home());
    return shell(agentHome());
  }
  if(state.view==='agent-player'){
    if(!state.user||(state.user.role!=='agent'&&state.user.role!=='master')) return shell(home());
    return shell(agentPlayerView());
  }
  if(state.view==='super'){
    if(!state.user||state.user.role!=='supermaster') return shell(home());
    return shell(superPanel());
  }
  if(state.view==='livebets'){
    if(!state.user||!['master','supermaster','agent'].includes(state.user.role)) return shell(home());
    return shell(liveBetsMaster());
  }
  if(state.view==='hierarchy'){
    if(!state.user||(state.user.role!=='master'&&state.user.role!=='supermaster')) return shell(home());
    return shell(hierarchy());
  }
  if(state.view==='home')return shell(home());
  if(state.view==='rules')return shell(rules());
  if(state.view==='inplay')return shell(inplay());
  if(state.view==='match')return shell(match());
  if(state.view==='casino')return shell(casino());
  if(state.view==='andar')return shell(andar());
  if(state.view==='lucky7')return shell(lucky7());
  if(state.view==='teenpatti')return shell(teenpatti());
  if(state.view==='dragontiger')return shell(dragontiger());
  if(state.view==='hierarchy')return shell(hierarchy());
  if(state.view==='ledger')return shell(ledger());
  if(state.view==='password')return shell(password());
  if(state.view==='matka')return shell(matka());
  if(state.view==='aviator')return shell(aviator());
  if(state.view==='pnl')return shell(pagePnL());
  if(state.view==='bethistory')return shell(pageBetHistory());
  if(state.view==='statement')return shell(pageStatement());
  if(state.view==='commission')return shell(pageCommission());
  if(state.view==='usermgmt')return shell(pageUserManage());
  return shell(home());
}
function render(){try{app.innerHTML=view()}catch(err){console.error('AntPro render recovery',err);app.innerHTML='<div style="min-height:100vh;background:#111;color:#ffe566;display:grid;place-items:center;padding:24px;text-align:center;font:700 14px Arial"><div>Live service reconnecting…<br><small style="display:block;margin-top:8px;color:#aaa;font-weight:400">Your demo round is safe. Please wait a moment.</small></div></div>'}}
function go(v){
  if(v==='login'){state.loggedIn=false;state.menu=false;state.view='login';state.user=null;sessionStorage.removeItem('antpro_user');render();return}
  const role=(state.user&&state.user.role)||'player';
  // Guards: player cannot open agent/hierarchy/admin
  if(v==='super' && role!=='supermaster'){toast('Only Super Master');return}
  if(v==='hierarchy' && role!=='master' && role!=='supermaster'){toast('Only Master');return}
  if(v==='livebets' && role!=='master' && role!=='supermaster' && role!=='agent'){toast('Only Master / Agent');return}
  if((v==='agent'||v==='agent-player') && role!=='agent' && role!=='master'){toast('Only Agent');return}
  if(v==='admin' && role!=='master'){toast('Only Master');return}
  if((v==='pnl'||v==='commission'||v==='usermgmt') && role!=='master' && role!=='supermaster' && role!=='agent'){toast('Not allowed');return}
  if(v==='statement' && !role){toast('Login required');return}
  if(v==='bethistory' && !role){toast('Login required');return}
  state.view=v;state.menu=false;
  if(v!=='admin'&&location.pathname.indexOf('x9k2-ns-ctrl')===-1){try{history.replaceState(null,'','/')}catch(e){}}
  render();
}
function closeMenu(e){if(e.target.classList.contains('drawer')){state.menu=false;render()}}
render();
syncMarquee();
setInterval(syncMarquee,15000);
