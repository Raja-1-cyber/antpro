/* AntPro — visual match to original */
const app = document.querySelector('#app');

const COINS_KEY = 'antpro_coins_v1';
const GAMES_KEY = 'antpro_games_live_v1';
const BETS_KEY = 'antpro_bets_v2';
const MARQUEE_KEY = 'antpro_marquee_v1';
const STMT_KEY = 'antpro_statements_v2';
const COMM_KEY = 'antpro_commission_v2';
const AUDIT_KEY = 'antpro_audit_v2';

const PASS_KEY = 'antpro_master_pass';
const USERS_KEY = 'antpro_users_v3';
function readSessionUser(){
  try{
    const user=JSON.parse(sessionStorage.getItem('antpro_user')||'null');
    return user&&user.id&&user.role?user:null;
  }catch{
    sessionStorage.removeItem('antpro_user');
    return null;
  }
}
const restoredUser=readSessionUser();
function roleFromPath(){
  const p=location.pathname.toLowerCase();
  if(p.includes('supermaster'))return 'supermaster';
  if(p.includes('master'))return 'master';
  if(p.includes('agent'))return 'agent';
  return 'player';
}
function loginPath(role){return role==='supermaster'?'/supermaster-login':role==='master'?'/master-login':role==='agent'?'/agent-login':'/login'}

/* Clean hierarchy: Root Master → Super Master → Agent → Client. */
function defaultUsers(){
  return {
    superMaster: null,
    superMasters: {},
    masters: {
      'MASTER': {id:'MASTER', name:'Root Master', role:'master', pass:'master123', chips:0, agents:[], status:'active'}
    },
    agents: {},
    players: {}
  };
}
function loadUsers(){
  try{
    const raw=localStorage.getItem(USERS_KEY);
    if(raw){const parsed=JSON.parse(raw);if(parsed&&parsed.masters?.MASTER)return parsed;}
  }catch{}
  const d=defaultUsers();
  try{localStorage.setItem(USERS_KEY,JSON.stringify(d))}catch{}
  return d;
}
function normalizeHierarchy(data){
  data=data||{};data.superMasters=data.superMasters||{};data.masters=data.masters||{};data.agents=data.agents||{};data.players=data.players||{};
  if(!data.masters.MASTER)data.masters.MASTER={id:'MASTER',name:'Root Master',role:'master',pass:'master123',chips:0,agents:[],status:'active'};
  Object.values(data.masters).forEach(m=>{m.agents=[];m.superMasters=m.superMasters||[];m.status=m.status||'active';m.share=typeof m.share==='number'?m.share:100});
  Object.values(data.superMasters).forEach(sm=>{sm.agents=[];sm.status=sm.status||'active';sm.share=typeof sm.share==='number'?sm.share:0;const parent=data.masters[sm.parentMasterId||'MASTER'];if(parent){parent.superMasters=parent.superMasters||[];if(!parent.superMasters.includes(sm.id))parent.superMasters.push(sm.id)}});
  Object.values(data.agents).forEach(a=>{a.players=[];a.status=a.status||'active';a.share=typeof a.share==='number'?a.share:0;const parent=data.masters[a.masterId||'MASTER'];if(parent&&!parent.agents.includes(a.id))parent.agents.push(a.id);const sm=data.superMasters[a.superId];if(sm&&!sm.agents.includes(a.id))sm.agents.push(a.id)});
  Object.values(data.players).forEach(p=>{p.status=p.status||'active';p.share=typeof p.share==='number'?p.share:0;const agent=data.agents[p.agentId];if(agent&&!agent.players.includes(p.id))agent.players.push(p.id)});
  return data;
}
function mergeUserStores(local,remote){
  const merged={...(local||{}),...(remote||{})};
  ['masters','superMasters','agents','players'].forEach(bucket=>{
    merged[bucket]={...((local&&local[bucket])||{}),...((remote&&remote[bucket])||{})};
  });
  if(!remote?.superMaster&&local?.superMaster)merged.superMaster=local.superMaster;
  return normalizeHierarchy(merged);
}
function saveUsers(u){
  u=normalizeHierarchy(u);
  try{localStorage.setItem(USERS_KEY,JSON.stringify(u))}catch{}
  // permanent server + Firebase mirror (fire-and-forget)
  const token=sessionStorage.getItem('antpro_session_token')||'';
  fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({users:u})}).catch(()=>{});
}
function hierarchyRoot(data=loadUsers()){return data.rootMaster||data.masters?.MASTER||{id:'MASTER',name:'Master',role:'master',chips:0,share:100,commission:0}}
function hierarchySuperMasters(data=loadUsers()){
  const sm=data.superMasters||{};
  if(Object.keys(sm).length)return Object.values(sm);
  return data.superMaster?[data.superMaster]:[];
}
function hierarchyAgents(data=loadUsers(), superId=''){
  const list=Object.values(data.agents||{});
  return list.filter(a=>!superId || (a.superId||'SUPER').toUpperCase()===superId.toUpperCase());
}
function hierarchyClientIds(data=loadUsers(), superId=''){
  const agents=hierarchyAgents(data,superId);const ids=new Set(agents.map(a=>(a.id||'').toUpperCase()));
  return Object.values(data.players||{}).filter(p=>ids.has((p.agentId||'').toUpperCase())).map(p=>p.id);
}
async function syncUsersFromServer(){
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),5000);
    const r=await fetch('/api/users',{cache:'no-store',signal:controller.signal});
    clearTimeout(timeout);
    const d=await r.json();
    if(d&&d.ok&&d.users&&d.users.masters?.MASTER){
      const merged=mergeUserStores(loadUsers(),d.users);
      localStorage.setItem(USERS_KEY,JSON.stringify(merged));
      return merged;
    }
  }catch{}
  return loadUsers();
}
function findAccount(username, password){
  const id=(username||'').trim().toUpperCase();
  const p=(password||'').trim();
  const u=loadUsers();
  // Super Master
  if(u.superMaster && u.superMaster.id && u.superMaster.id.toUpperCase()===id && u.superMaster.pass===p){
    return {...u.superMaster, role:'supermaster'};
  }
  if(u.superMasters){
    for(const k of Object.keys(u.superMasters)){
      const sm=u.superMasters[k];
      if((sm.id||k).toUpperCase()===id && sm.pass===p) return {...sm, role:'supermaster'};
    }
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
  if(typeof state!=='undefined' && state.view!=='home')return;
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
    lockSeconds:GAME_TIMINGS[gameKey]?.lock??4,
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
const GAME_TIMINGS={'andar-bahar':{duration:20,lock:5},lucky7:{duration:15,lock:4},'teen-patti':{duration:20,lock:5},'dragon-tiger':{duration:15,lock:4}};
const CARD_GAP_MS=2500, RESULT_HOLD_MS=2000, NEXT_ROUND_DELAY_MS=3000;
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
  scheduleNextRound.timers[key]=setTimeout(()=>{startNewRoundSilent(key,GAME_TIMINGS[key]?.duration||30);state.resolving[key]=false;render()},delay);
}
function finishRound(key){
  const all=getLiveRounds(), r=all[key]||ensureRound(key);
  r.phase='result';r.timer=0;r.resultAt=Date.now();all[key]=r;setLiveRounds(all);
}
function smartDecision(key,options,natural){
  const forced=getForced(key);
  if(forced&&options.includes(forced)){
    const all=getLiveRounds();if(all[key]){all[key].forcedWinner=null;all[key].phase='result';setLiveRounds(all)}
    return forced;
  }
  return natural||options[Math.floor(Math.random()*options.length)];
}
function selectedStake(key){const balance=getCoins(),saved=Number(state.selectedStakes?.[key]);return Number.isInteger(saved)&&saved>=100&&saved<=Math.min(20000,balance)?saved:(balance>=100?100:0)}
function setStakeValue(key,value){const max=Math.min(20000,getCoins()),n=Math.max(100,Math.min(max,parseInt(value,10)||100));state.selectedStakes=state.selectedStakes||{};state.selectedStakes[key]=n;const note=document.getElementById('stake-note-'+key);if(note)note.textContent='Selected bet: '+n.toLocaleString()+' coins';}
function betAmountFor(key,side){return ((state.pendingBets&&state.pendingBets[key])||[]).filter(b=>b.team===side).reduce((sum,b)=>sum+(Number(b.amt)||0),0)}
function stakeControl(key){const balance=getCoins(),value=selectedStake(key);return `<div class="stake-control"><label>BET AMOUNT<br><small>Min 100 · Balance: ${balance.toLocaleString()} coins</small><b id="stake-note-${key}" class="selected-stake-note">Selected bet: ${value.toLocaleString()} coins</b></label><input id="stake-${key}" type="number" min="100" max="${Math.min(20000,balance)}" step="1" value="${value||''}" inputmode="numeric" aria-label="Bet amount" oninput="setStakeValue('${key}',this.value)"><div class="stake-chips" role="group" aria-label="Quick bet amount"><button type="button" onclick="setStake('${key}',100)">100</button><button type="button" onclick="setStake('${key}',500)">500</button></div></div>`}
function setStake(key,value){const max=Math.min(20000,getCoins()),n=Math.max(100,Math.min(max,Number(value)||100));state.selectedStakes=state.selectedStakes||{};state.selectedStakes[key]=n;const input=document.getElementById('stake-'+key);if(input)input.value=n;const note=document.getElementById('stake-note-'+key);if(note)note.textContent='Selected bet: '+n.toLocaleString()+' coins';}
function readStake(key){
  const n=Number((document.getElementById('stake-'+key)||{}).value||0);
  if(!Number.isInteger(n)||n<100||n>20000){toast('Bet amount 100 se 20,000 chips ke beech rakho');return 0}
  if(n>getCoins()){toast('Bet amount aapke chips se zyada nahi ho sakta');return 0}
  state.selectedStakes=state.selectedStakes||{};state.selectedStakes[key]=n;
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
      // The timer-driven game scheduler owns the result sequence.
    }
    if(r.phase==='locked'&&roundSeconds(key)<=0){ /* resolved by live-fix scheduler */ }
  }
}
setInterval(()=>{if(!state.loggedIn)return;tickRounds();if(['andar','lucky7','teenpatti','dragontiger'].includes(state.view))render()},1000);



const state={
  view:'home',menu:false,loggedIn:!location.pathname.toLowerCase().includes('login') && !!restoredUser,
  loginRole:roleFromPath(),
  loginDraft:{user:'',pass:'',otp:''},loginBusy:false,
  rules:'hindi',toast:'',adminAuthed:sessionStorage.getItem('antpro_admin_ok')==='1',
  matchId:0,
  activeBets:JSON.parse(localStorage.getItem(BETS_KEY)||'[]'),controllerBets:[],controllerRounds:{},controllerBetsBusy:false,
  welcome:false,createClient:false,staffModal:'',staffPage:1,pnlFrom:'2026-09-17',pnlTo:'2026-10-01',pnlType:'ALL',exposureUser:'',
  andarCards:{andar:[{v:'8',s:'red',suit:'♦'},{v:'3',s:'red',suit:'♦'}],bahar:[{v:'3',s:'',suit:'♣'},{v:'6',s:'',suit:'♣'}]}, andarSpinning:false,
  user: restoredUser,
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
async function syncControllerBets(){
  if(state.view!=='admin'||!state.adminAuthed||state.controllerBetsBusy)return;
  state.controllerBetsBusy=true;
  try{const [betsRes,roundsRes]=await Promise.all([fetch('/api/live-bets',{cache:'no-store'}),fetch('/api/live-rounds',{cache:'no-store'})]);if(betsRes.ok){const d=await betsRes.json();state.controllerBets=Array.isArray(d.bets)?d.bets:[]}if(roundsRes.ok)state.controllerRounds=await roundsRes.json();if(state.view==='admin')render()}catch{}
  finally{state.controllerBetsBusy=false}
}
async function syncSharedRounds(){
  if(!state.loggedIn||!['andar','lucky7','teenpatti','dragontiger'].includes(state.view))return;
  if(sharedSyncBusy)return;
  sharedSyncBusy=true;
  try{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),1200);
    const r=await fetch('/api/live-rounds',{cache:'no-store',signal:controller.signal});clearTimeout(timeout);
    if(!r.ok)throw new Error('round api '+r.status);
    const data=await r.json();
    state.sharedRounds=data;
    const ab=data&&data['andar-bahar'];
    if(ab&&Array.isArray(ab.previousResults)){
      state.abHistory=ab.previousResults.map(x=>x==='Andar'?'A':x==='Bahar'?'B':x).filter(Boolean).slice(0,10);
    }
    localStorage.setItem('antpro_live_rounds',JSON.stringify(data));
    if(['andar','lucky7','teenpatti','dragontiger'].includes(state.view))render();
  }catch{}
  finally{sharedSyncBusy=false}
}
setTimeout(syncSharedRounds,50);
setInterval(syncSharedRounds,1000);

(function initRoute(){
  const p=location.pathname.replace(/\/$/,'')||'/';
  if(p==='/x9k2-ns-ctrl'){state.view='admin';state.loggedIn=true}
  else if(p==='/login'||p==='/client-login'||p==='/agent-login'||p==='/master-login'||p==='/supermaster-login'){state.view='login';state.loginRole=roleFromPath();state.loggedIn=false}
  else if(p==='/inplay')state.view='inplay';
  else if(p==='/match')state.view='match';
  else if(p==='/casino')state.view='casino';
  else if(p==='/andar-bahar')state.view='andar';
  else if(p==='/lucky7')state.view='lucky7';
  else if(p==='/teen-patti')state.view='teenpatti';
  else if(p==='/dragon-tiger')state.view='dragontiger';
  else if(p==='/ledger')state.view='ledger';
  else if(p==='/rules')state.view='rules';
  else if(p==='/hierarchy')state.view='hierarchy';
  else if(p==='/clientdetails')state.view='clientdetails';
  else if(p==='/password')state.view='password';
  else if(p==='/pnl')state.view='pnl';
  else if(p==='/statement')state.view='statement';
  else if(p==='/commission')state.view='commission';
  else if(p==='/bethistory')state.view='bethistory';
  else if(p==='/usermgmt')state.view='usermgmt';
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
function loadAudit(){try{return JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]')}catch{return []}}
function audit(action,target,detail=''){
  const actor=state.user&&state.user.id||'SYSTEM';
  const rows=loadAudit(); rows.unshift({ts:Date.now(),actor,action,target,detail});
  localStorage.setItem(AUDIT_KEY,JSON.stringify(rows.slice(0,300)));
}
function uid(){return 'B'+Date.now().toString(36).toUpperCase()+Math.floor(Math.random()*999)}
function findUserById(id){
  const data=loadUsers(); const ID=(id||'').toUpperCase();
  if(data.superMasters){for(const k of Object.keys(data.superMasters)){const sm=data.superMasters[k];if((sm.id||k).toUpperCase()===ID)return {...sm,role:'supermaster',_path:'superMasters',_key:k};}}
  if(data.superMaster&&(data.superMaster.id||'').toUpperCase()===ID) return {...data.superMaster, role:'supermaster', _path:'superMaster'};
  if(data.masters){for(const k of Object.keys(data.masters)){const m=data.masters[k]; if((m.id||k).toUpperCase()===ID) return {...m, role:'master', _path:'masters', _key:k};}}
  if(data.agents){for(const k of Object.keys(data.agents)){const a=data.agents[k]; if((a.id||k).toUpperCase()===ID) return {...a, role:'agent', _path:'agents', _key:k};}}
  if(data.players){for(const k of Object.keys(data.players)){const pl=data.players[k]; if((pl.id||k).toUpperCase()===ID) return {...pl, role:'player', _path:'players', _key:k};}}
  return null;
}
function updateUserFields(id, fields){
  const data=loadUsers(); const ID=(id||'').toUpperCase();
  let hit=false;
  if(data.superMasters){for(const k of Object.keys(data.superMasters)){if((data.superMasters[k].id||k).toUpperCase()===ID){Object.assign(data.superMasters[k],fields);hit=true;}}}
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
  audit('STATUS',id,status);
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
  /* Settlements are player-only virtual coins. No automatic upline share or commission payouts. */
  if(!bet||bet.rolled_back) return;
  const playerId=bet.player||bet.playerId; if(!playerId) return;
  const amt=Number(bet.amt)||0;
  const profit=Number(bet.profit)||0;
  const won=bet.status==='won';
  addStatement({type:'BET', userId:playerId, amount:won?profit:-amt, note:(bet.type||'')+' '+(bet.team||'')+' '+(bet.status||''), betId:bet.id, market:bet.type, side:bet.team, status:bet.status});
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
  if(role==='supermaster') return hierarchyClientIds(data,state.user.id);
  if(role==='master'){
    return Object.keys(data.players||{});
  }
  if(role==='agent'){
    const aid=(state.user.id||'').toUpperCase();
    return Object.values(data.players||{}).filter(pl=>(pl.agentId||'').toUpperCase()===aid).map(pl=>pl.id);
  }
  if(role==='player') return [state.user.id];
  return [];
}
function visibleBetsForRole(){
  const settled=(state.activeBets||[]).slice(0,120);
  const pending=Object.values(state.pendingBets||{}).flat().map((b,i)=>({...b,id:b.id||`PENDING-${i}`,status:'open',ts:b.ts||Date.now(),result:'PENDING'}));
  const allow=new Set(allDownlinePlayerIds());
  if(state.user?.role==='player')allow.add(state.user.id);
  return settled.concat(pending).filter(b=>allow.has(b.player||b.playerId));
}

function pagePnL(){
  const role=(state.user&&state.user.role)||'player';
  const ids=allDownlinePlayerIds();
  const rows=ids.map(id=>{const u=findUserById(id)||{id,name:id};return {id,name:u.name||id,status:u.status||'active',...pnlForUser(id)}});
  const tot=rows.reduce((a,r)=>({stake:a.stake+r.stake,pnl:a.pnl+r.pnl,bets:a.bets+r.bets}),{stake:0,pnl:0,bets:0});
  return `${topBtn()}
  <div class="view-title">PROFIT LOSS</div>
  <div class="report-filter-card"><label>FROM<input id="pnlFrom" type="date" value="${state.pnlFrom}" onchange="state.pnlFrom=this.value"></label><label>TO<input id="pnlTo" type="date" value="${state.pnlTo}" onchange="state.pnlTo=this.value"></label><label>GAME TYPE<select id="pnlType" onchange="state.pnlType=this.value"><option>ALL</option><option>CRICKET</option><option>CASINO</option><option>FANCY</option></select></label><button class="blue-btn" onclick="render()">SEARCH</button></div>
  <div class="agent-stats"><div class="stat-box"><div class="stat-val">${tot.bets}</div><div class="stat-lbl">BETS</div></div><div class="stat-box"><div class="stat-val">${tot.stake.toFixed(2)}</div><div class="stat-lbl">TOTAL STAKE</div></div><div class="stat-box"><div class="stat-val" style="color:${tot.pnl>=0?'#0a7a0a':'#c00'}">${tot.pnl>=0?'+':''}${tot.pnl.toFixed(2)}</div><div class="stat-lbl">TOTAL P/L</div></div><div class="stat-box"><div class="stat-val">${rows.length}</div><div class="stat-lbl">CLIENTS</div></div></div>
  <div class="section-bar">CLIENT-WISE PROFIT LOSS</div><div class="table-scroll"><table class="bo-table"><thead><tr><th>CODE</th><th>NAME</th><th>STATUS</th><th>BETS</th><th>STAKE</th><th>WON</th><th>LOST</th><th>P/L</th><th>DETAIL</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${r.id}</td><td>${r.name}</td><td class="${r.status==='active'?'ok':'bad'}">${r.status}</td><td>${r.bets}</td><td>${r.stake.toFixed(2)}</td><td class="ok">${r.won}</td><td class="bad">${r.lost}</td><td class="${r.pnl>=0?'ok':'bad'}">${r.pnl>=0?'+':''}${r.pnl.toFixed(2)}</td><td><button class="blue-btn" onclick="openExposure('${r.id}')">Exposure</button></td></tr>`).join(''):`<tr><td colspan="9" class="empty-cell">No report rows yet</td></tr>`}</tbody></table></div>${state.exposureUser?exposureModal(state.exposureUser):''}${back()}`;
}

function pageBetHistory(){
  const role=(state.user&&state.user.role)||'player';
  let bets=visibleBetsForRole().slice(0,100);
  if(role==='player'){
    const id=(state.user&&state.user.id)||'';
    bets=bets.filter(b=>(b.player||b.playerId)===id);
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
    list=list.concat(hierarchyAgents(data,state.user.id).map(x=>({...x, role:'agent'})));
    const aids=new Set(hierarchyAgents(data,state.user.id).map(a=>a.id));
    list=list.concat(Object.values(data.players||{}).filter(pl=>aids.has(pl.agentId)).map(x=>({...x, role:'player'})));
  } else if(role==='master'){
    const supers=hierarchySuperMasters(data);
    list=list.concat(supers.map(x=>({...x, role:'supermaster'})));
    list=list.concat(Object.values(data.agents||{}).map(x=>({...x, role:'agent'})));
    list=list.concat(Object.values(data.players||{}).map(x=>({...x, role:'player'})));
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

function getExposure(){
  const pending=Object.values(state.pendingBets||{}).flat().reduce((sum,b)=>sum+(Number(b.amt)||0),0);
  const open=(state.activeBets||[]).filter(b=>b.status==='open').reduce((sum,b)=>sum+(Number(b.amt)||0),0);
  return pending+open;
}
function header(){
  const u=state.user||{id:'C150642',name:'Rahl',role:'player'};
  const c=(u.role==='player'?getCoins():(u.chips||0)).toFixed(2);
  const label = u.role==='supermaster' ? `${u.id} (Super Master)` : u.role==='agent' ? `${u.id} (Agent)` : u.role==='master' ? `${u.id} (Master)` : `${u.id} (${u.name||''})`;
  return `<div class="topbar">
    <div class="brand-logo"><img src="/assets/antpro-logo.svg" alt="antpro"></div>
    <div class="user"><strong>${label}</strong></div>
    <button class="header-menu" onclick="state.menu=true;render()" aria-label="Open menu">☰</button>
  </div>
  <div class="chips-bar">Chips: ${c} <span class="expo">Expo : ${getExposure().toLocaleString('en-IN')}</span></div>
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
          if(role==='master'||role==='supermaster'){ items.push(['👥 HIERARCHY','hierarchy']); items.push(['📋 LIVE BETS','livebets']); items.push(['📊 P&L REPORT','pnl']); items.push(['📑 STATEMENT','statement']); items.push(['🛡 USER CONTROL','usermgmt']); items.push(['📜 BET HISTORY','bethistory']); }
          if(role==='agent'){ items.push(['👥 MY PLAYERS','agent']); items.push(['📋 LIVE BETS','livebets']); items.push(['📊 P&L REPORT','pnl']); items.push(['📑 STATEMENT','statement']); items.push(['🛡 USER CONTROL','usermgmt']); items.push(['📜 BET HISTORY','bethistory']); }
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
    ${state.welcome&&state.user&&state.user.role==='player'?welcomeModal():''}
    ${state.staffModal==='hierarchy-picker'?hierarchyPicker():''}
    <div class="toast ${state.toast?'show':''}">${state.toast}</div>
  </div>`;
}
function topBtn(){return `<button class="menu-btn" onclick="state.menu=true;render()">☰ MAIN MENU</button>`}
function back(){return `<button class="back-btn" onclick="go('home')">BACK TO MAIN MENU</button>`}
function gameTop(title, round, cards){const key={'ANDAR BAHAR':'andar-bahar','LUCKY 7':'lucky7','TEEN PATTI':'teen-patti','DRAGON TIGER':'dragon-tiger'}[title];const r=key?((state.sharedRounds&&state.sharedRounds[key])||ensureRound(key)):null;const clock=r&&Number.isFinite(Number(r.timer))?Math.max(0,Number(r.timer)):key?roundSeconds(key):0;const betClock=r&&Number.isFinite(Number(r.betTimer))?Math.max(0,Number(r.betTimer)):clock;const elapsed=r&&Number.isFinite(Number(r.elapsedSeconds))?Number(r.elapsedSeconds):0;const duration=r&&Number(r.duration)||0;const status=r&&r.phase==='betting'?`BET ${clock}s · LOCK IN ${betClock}s`:r&&r.phase==='locked'?`LOCKED · REVEAL IN ${Math.max(0,duration-elapsed)}s`:r&&r.phase==='revealing'?`REVEALING · ${Math.max(0,elapsed-duration)}s`:r&&r.phase==='result'?`RESULT · ${r.result||'PENDING'}`:'LIVE';return `<div class="game-top"><span class="g-title">${title}</span><span class="game-status">${status}</span><span>Round ID : ${round}</span></div>`}
function alwaysGameSpinner(){const active=Boolean(state.andarSpinning||state.l7Spin||state.tpSpin||state.dtSpin);return active?`<div class="always-spinner" aria-label="Live game resolving"><div class="spinner"></div></div>`:`<div class="game-live-indicator" aria-label="Live game">● LIVE</div>`}


/* ===== LOGIN ===== */
function login(){
  const staff=state.loginRole!=='player';
  const roleName=state.loginRole==='supermaster'?'SUPER MASTER':state.loginRole==='master'?'MASTER':state.loginRole==='agent'?'AGENT':'CLIENT';
  const title=staff?`${roleName} LOGIN`:'Please Login to Continue';
  const userLabel=staff?'User ID':'Username';
  const draft=state.loginDraft||{user:'',pass:'',otp:''};
  return `<div class="login-screen">
    <div class="logo login-wordmark" aria-label="antpro"><span class="wordmark-ant">ant</span><span class="wordmark-pro">pro</span></div>
    ${staff?`<div class="role-login-badge">${roleName} PORTAL</div>`:''}
    <h2>${title}</h2>
    <input id="loginUser" name="antpro-login-id" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${userLabel}" value="${escapeHTML(draft.user)}" oninput="state.loginDraft.user=this.value" onkeydown="return loginKeydown(event)">
    <input id="loginPass" name="antpro-login-secret" autocomplete="off" data-lpignore="true" data-1p-ignore="true" type="password" placeholder="Password" value="${escapeHTML(draft.pass)}" oninput="state.loginDraft.pass=this.value" onkeydown="return loginKeydown(event)">
    ${staff?`<input id="loginOtp" name="antpro-login-otp" autocomplete="off" inputmode="numeric" maxlength="6" placeholder="6-digit OTP (demo: 318520)" value="${escapeHTML(draft.otp)}" oninput="state.loginDraft.otp=this.value" onkeydown="return loginKeydown(event)">`:''}
    <button type="button" onclick="doLogin()">${staff?'Verify OTP':'Login'} ⇥</button>
    ${staff?`<div class="login-role-links"><a href="/login">Client</a><a href="/agent-login">Agent</a><a href="/master-login">Master</a><a href="/supermaster-login">Super Master</a></div>`:''}
    <div class="footer-links">Privacy Policy &nbsp;|&nbsp; Terms & Condition &nbsp;|&nbsp; Rules & Regulation</div>
  </div>`;
}
function loginKeydown(event){
  if(event.key==='Enter'){
    event.preventDefault();
    event.stopPropagation();
    doLogin();
    return false;
  }
  return true;
}
async function doLogin(){
  if(state.loginBusy)return;
  state.loginBusy=true;
  const userEl=document.getElementById('loginUser');
  const passEl=document.getElementById('loginPass');
  const username=(userEl&&userEl.value)||'';
  const password=(passEl&&passEl.value)||'';
  state.loginDraft={user:username,pass:password,otp:(document.getElementById('loginOtp')||{}).value||''};
  const expected=state.loginRole||'player';
  let acc=null,serverLoginError='';
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,role:expected}),signal:controller.signal});
    clearTimeout(timeout);
    const result=await response.json();
    if(response.ok){acc=result.user||null;if(result.token)sessionStorage.setItem('antpro_session_token',result.token)}else if(response.status===403)serverLoginError='Use the '+loginPath(result.role||'player')+' login page';
  }catch{}
  if(!acc&&!serverLoginError){await syncUsersFromServer();acc=findAccount(username,password)}
  if(!acc){state.loginBusy=false;toast(serverLoginError||'Invalid login — check ID and password');return;}
  if(acc.role!==expected){state.loginBusy=false;toast('Use the '+loginPath(acc.role)+' login page');return;}
  if(expected!=='player' && state.loginDraft.otp.trim()!=='318520'){state.loginBusy=false;toast('Invalid demo OTP');return;}
  if(isBlocked(acc.id)){state.loginBusy=false;toast('Account '+((acc.status)||'blocked').toUpperCase());return;}
  state.user=acc;
  state.loggedIn=true;
  state.loginBusy=false;
  state.loginDraft={user:'',pass:'',otp:''};
  sessionStorage.setItem('antpro_user',JSON.stringify(acc));
  if(acc.role==='supermaster'){
    go('home');
  } else if(acc.role==='master'){
    go('home');
  } else if(acc.role==='agent'){
    go('home');
  } else {
    if(typeof acc.chips==='number') setCoins(acc.chips);
    state.welcome=true;
    go('home');
  }
  toast(acc.role.toUpperCase()+' login OK');
}
function welcomeModal(){return `<div class="modal-overlay" onclick="if(event.target===this){state.welcome=false;render()}"><div class="welcome-modal"><button class="modal-x" onclick="state.welcome=false;render()">×</button><h3>Welcome to antpro999</h3><p><b>Dear Client,</b></p><p>Please verify that you are using the correct official website. Duplicate websites may misuse your login details. Never share your password or OTP with anyone.</p><p>कृपया सही वेबसाइट का ही उपयोग करें और अपना पासवर्ड किसी के साथ साझा न करें।</p><button class="btn-green" onclick="state.welcome=false;render()">Close</button></div></div>`}

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
  const scoreParts=score.split(/\s+[-–—]\s+/).map(x=>{const v=String(x||'').trim();return !v||['-','—','–'].includes(v)?'':v});
  const status=String(m?.status||'').toLowerCase();
  const live=Boolean(m?.is_live)||status==='live'||status==='inplay'||status==='in progress';
  return {
    id: String(id),
    name: teams,
    home: parts[0]||teams,
    away: parts.slice(1).join(' v ')||'',
    homeScore: scoreParts[0]&&scoreParts[0]!=='—'?scoreParts[0]:'',
    awayScore: scoreParts[1]&&scoreParts[1]!=='—'?scoreParts[1]:'',
    score,
    status:live?'live':status||'upcoming',
    statusText: status,
    time: m?.updated_at ? new Date(m.updated_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '',
    competition: m?.competition||'',
    live,
    sessions: m?.sessions||{},
    overs: m?.overs ?? m?.current_overs ?? '',
    batsmen: Array.isArray(m?.batsmen)?m.batsmen:(Array.isArray(m?.players)?m.players:[]),
    bowler: m?.bowler || m?.current_bowler || '',
    bowlerStats: m?.bowler_stats || m?.bowlerStats || {overs:m?.bowler_overs,maidens:m?.bowler_maidens,runs:m?.bowler_runs,wickets:m?.bowler_wickets,economy:m?.bowler_economy},
    lastBalls: Array.isArray(m?.last_balls)?m.last_balls:(Array.isArray(m?.lastBalls)?m.lastBalls:[]),
    innings: m?.innings || '',
    providerUpdatedAt: m?.updated_at || ''
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
        homeScore: m.homeScore ?? m.home_score ?? '',
        awayScore: m.awayScore ?? m.away_score ?? '',
        status: (m.status||'').toLowerCase(),
        statusText: m.status_text||m.status||'',
        time: m.time ? new Date(m.time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '',
        competition: m.competition||'',
        overs: m.overs ?? m.current_overs ?? '',
        batsmen: Array.isArray(m.batsmen)?m.batsmen:(Array.isArray(m.players)?m.players:[]),
        bowler: m.bowler || m.current_bowler || '',
        bowlerStats: m.bowler_stats || m.bowlerStats || {overs:m.bowler_overs,maidens:m.bowler_maidens,runs:m.bowler_runs,wickets:m.bowler_wickets,economy:m.bowler_economy},
        lastBalls: Array.isArray(m.last_balls)?m.last_balls:(Array.isArray(m.lastBalls)?m.lastBalls:[]),
        innings: m.innings || '',
        providerUpdatedAt: m.updated_at || m.updatedAt || '',
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
        <div class="time">${m.live||m.status==='live'?'● LIVE · ':''}${m.homeScore&&m.awayScore?m.homeScore+' vs '+m.awayScore+' · ':((m.statusText&&m.statusText.toLowerCase()!=='live')?m.statusText+' · ':'')}${m.time||''} ${m.competition?'· '+m.competition:''}</div>
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
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    const res=await fetch('/api/cricket/sessions?match='+encodeURIComponent(matchName),{cache:'no-store',signal:controller.signal});
    clearTimeout(timeout);
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
  const fallbackSessions = [{name:isLive?'Provider session lines unavailable':'Sessions open when match goes LIVE', not:'—', yes:'—', rate:'—', status:'SUSPENDED'}];
  const sessions = state.liveSessionsKey===m.name && state.liveSessions.length ? state.liveSessions : fallbackSessions;
  const scorecardPlayers = Array.isArray(m.batsmen)?m.batsmen:[];
  const playerLabel = p => typeof p==='string' ? p : (p?.name || p?.player || p?.batter || '—');
  const stat = (p,...keys) => {if(typeof p!=='object'||!p)return '';for(const k of keys){if(p[k]!==undefined&&p[k]!==null&&p[k]!=='')return p[k]}return ''};
  const lastBalls = Array.isArray(m.lastBalls)?m.lastBalls:[];
  const bowlerStats=m.bowlerStats||{};
  const bookmakerMin=Number.isFinite(Number(m.bookmakerMin))?Number(m.bookmakerMin):100;
  const bookmakerMax=Number.isFinite(Number(m.bookmakerMax))?Number(m.bookmakerMax):20000;

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
        <div class="tms-score">${m.homeScore||'SCORE PENDING'}</div>
      </div>
      <div class="tms-vs">VS</div>
      <div class="tms-team">
        <div class="tms-name">${m.away||'Team B'}</div>
        <div class="tms-score">${m.awayScore||'SCORE PENDING'}</div>
      </div>
    </div>
    <div class="tms-meta">
      ${isLive?'<span class="tms-live">● LIVE</span>':''}
      <span>${m.statusText||m.status||''}</span>
      <span>${m.time||''}</span>
      <span>${m.overs?`Overs ${escapeHTML(m.overs)}`:'Overs unavailable'}</span>
    </div>
    <div class="tms-note">Sirf is match ka score · doosre match ke liye list se select karo</div>
  </div>

  <div class="section-bar">SCORECARD</div>
  <div class="video-scorecard-wrap"><table class="video-scorecard"><thead><tr><th class="name-col">BATSMEN</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${scorecardPlayers.length?scorecardPlayers.map(p=>`<tr><td class="name-col">${escapeHTML(playerLabel(p))}</td><td>${escapeHTML(stat(p,'runs','score'))}</td><td>${escapeHTML(stat(p,'balls','ball'))}</td><td>${escapeHTML(stat(p,'fours','4s','boundaries4'))}</td><td>${escapeHTML(stat(p,'sixes','6s','boundaries6'))}</td><td>${escapeHTML(stat(p,'strikeRate','strike_rate','sr'))}</td></tr>`).join(''):'<tr><td colspan="6" class="provider-empty">Provider did not supply batter names</td></tr>'}</tbody><thead><tr><th class="name-col">BOWLER</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ER</th></tr></thead><tbody><tr><td class="name-col">${escapeHTML(m.bowler||'Provider did not supply bowler name')}</td><td>${escapeHTML(bowlerStats.overs??m.overs??'')}</td><td>${escapeHTML(bowlerStats.maidens??'')}</td><td>${escapeHTML(bowlerStats.runs??'')}</td><td>${escapeHTML(bowlerStats.wickets??'')}</td><td>${escapeHTML(bowlerStats.economy??'')}</td></tr></tbody></table></div>
  <div class="section-bar">LAST BALLS</div><div class="last-balls scorecard-detail-grid"><div class="ball-strip">${lastBalls.length?lastBalls.map(b=>`<span>${escapeHTML(typeof b==='object'?(b.result||b.value||b.runs||'—'):b)}</span>`).join(''):'<em>Provider did not supply last-ball sequence</em>'}</div></div>

  <div class="section-bar">BOOKMAKER | Min : ${bookmakerMin.toLocaleString()} &nbsp; Max : ${bookmakerMax.toLocaleString()}</div>
  <table class="bm-table">
    <thead><tr><th style="text-align:left">TEAM</th><th>LAGAI</th><th>KHAI</th><th>POS.</th></tr></thead>
    <tbody>
      <tr>
        <td style="text-align:left;font-weight:600">${m.home||'Team A'}</td>
        <td class="lagai">—</td>
        <td class="khai">—</td>
        <td>0</td>
      </tr>
      <tr>
        <td style="text-align:left;font-weight:600">${m.away||'Team B'}</td>
        <td class="lagai">—</td>
        <td class="khai">—</td>
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
          <td style="color:${s.status==='OPEN'?'#0a7a0a':'#c00'}">${escapeHTML(s.status||'SUSPENDED')}</td>
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
        <img class="casino-art" src="/assets/casino-${a}.png" alt="${n}">
      </div>`).join('')}</div>
    <h3>Live Casino</h3>
    <div class="casino-grid">${liveGames.map(([n,v,k,a])=>{
      const on=k?live[k]!==false:true;
      return `<div class="casino-tile ${on?'':'off'}" onclick="${on&&['andar','lucky7','teenpatti','dragontiger'].includes(v)?`go('${v}')`:'toast(\'Coming soon\')'}">
        <img class="casino-art" src="/assets/casino-${a}.png" alt="${n}">
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
  if(!c) return '<div class="p-card ghost" aria-label="Card back"><span>ANT<br>PRO</span></div>';
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
      <div class="bet-lock-row"><div class="side">Andar</div><div class="amt">${betAmountFor('andar-bahar','Andar')}</div><div class="lock" onclick="playAndarBahar('Andar')">${typeof lockLabel==='function'?lockLabel('andar-bahar'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">Bahar</div><div class="amt">${betAmountFor('andar-bahar','Bahar')}</div><div class="lock" onclick="playAndarBahar('Bahar')">${typeof lockLabel==='function'?lockLabel('andar-bahar'):'🔒'}</div></div>
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
function previousResultsHTML(){
  const key={lucky7:'lucky7',teenpatti:'teen-patti',dragontiger:'dragon-tiger',andar:'andar-bahar'}[state.view]||state.view;
  const remote=getLiveRounds()[key]?.previousResults||[];
  const local=state.previousResults?.[key]?.history||[];
  const history=(remote.length?remote:local).slice(0,10);
  const label=x=>{const v=String(x);if(key==='teen-patti')return v==='Team A'?'A':v==='Team B'?'B':'T';if(key==='lucky7')return v==='7 UP'?'UP':v==='7 DOWN'?'DOWN':'7';if(key==='dragon-tiger')return v==='Dragon'?'D':v==='Tiger'?'T':'Tie';return v==='Andar'?'A':v==='Bahar'?'B':v[0]||'—'};
  return `<div class="section-gold result-heading"><span>Previous Results</span><span>Last 10</span></div><div class="last-result previous-results">${(history.length?history:['—','—','—','—','—']).map(x=>`<div class="result-dot">${label(x)}</div>`).join('')}</div>`;
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
      <div class="bet-lock-row"><div class="side">7 UP</div><div class="amt">${betAmountFor('lucky7','7 UP')}</div><div class="lock" onclick="playLucky7('7 UP')">${typeof lockLabel==='function'?lockLabel('lucky7'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">7</div><div class="amt">${betAmountFor('lucky7','7')}</div><div class="lock" onclick="playLucky7('7')">${typeof lockLabel==='function'?lockLabel('lucky7'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">7 DOWN</div><div class="amt">${betAmountFor('lucky7','7 DOWN')}</div><div class="lock" onclick="playLucky7('7 DOWN')">${typeof lockLabel==='function'?lockLabel('lucky7'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    ${previousResultsHTML()}<div class="completed-bets">Completed Casino Bets</div>
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
      <div class="bet-lock-row"><div class="side">Team A</div><div class="amt">${betAmountFor('teen-patti','Team A')}</div><div class="lock" onclick="playTeenPatti('Team A')">${typeof lockLabel==='function'?lockLabel('teen-patti'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">Tie</div><div class="amt">${betAmountFor('teen-patti','Tie')}</div><div class="lock" onclick="playTeenPatti('Tie')">${typeof lockLabel==='function'?lockLabel('teen-patti'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">Team B</div><div class="amt">${betAmountFor('teen-patti','Team B')}</div><div class="lock" onclick="playTeenPatti('Team B')">${typeof lockLabel==='function'?lockLabel('teen-patti'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    ${previousResultsHTML()}<div class="completed-bets">Completed Casino Bets</div>
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
      <div class="bet-lock-row"><div class="side">Dragon</div><div class="amt">${betAmountFor('dragon-tiger','Dragon')}</div><div class="lock" onclick="playDragonTiger('Dragon')">${typeof lockLabel==='function'?lockLabel('dragon-tiger'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">Tie</div><div class="amt">${betAmountFor('dragon-tiger','Tie')}</div><div class="lock" onclick="playDragonTiger('Tie')">${typeof lockLabel==='function'?lockLabel('dragon-tiger'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side">Tiger</div><div class="amt">${betAmountFor('dragon-tiger','Tiger')}</div><div class="lock" onclick="playDragonTiger('Tiger')">${typeof lockLabel==='function'?lockLabel('dragon-tiger'):'🔒'}</div></div>
      <div class="bet-lock-row"><div class="side"></div><div class="amt"></div><div class="lock back-btn-g" onclick="go('casino')">BACK</div></div>
    </div>
    ${previousResultsHTML()}<div class="completed-bets">Completed Casino Bets</div>
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

  const bets = visibleBetsForRole().slice(0,80);

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
  const root=hierarchyRoot(data);const agents=hierarchyAgents(data,state.user.id);const playerIds=hierarchyClientIds(data,state.user.id);
  return `${topBtn()}
  <div class="view-title">SUPER MASTER PANEL</div>
  <div class="agent-stats">
    <div class="stat-box"><div class="stat-val">${root.id}</div><div class="stat-lbl">Root Master</div></div>
    <div class="stat-box"><div class="stat-val">${agents.length}</div><div class="stat-lbl">Agents</div></div>
    <div class="stat-box"><div class="stat-val">${playerIds.length}</div><div class="stat-lbl">Clients</div></div>
    <div class="stat-box"><div class="stat-val">∞</div><div class="stat-lbl">Limit</div></div>
  </div>
  <div class="section-bar">MY AGENTS (Under ${state.user.id})</div>
  <div class="agent-player-list">
    ${agents.length?agents.map(a=>{
      const clientCount=(a.players||[]).length;
      return `<div class="agent-player-card">
        <div class="ap-left">
          <strong>${a.id}</strong>
          <small>${a.name||''} · ${clientCount} clients</small>

        </div>
          <div class="ap-chips">${(a.chips||0).toLocaleString()} <button class="action-trigger" onclick="state.staffModal='${a.id}';render()">＋</button></div>
      </div>`;
    }).join(''):'<div style="padding:16px;text-align:center;color:#888">No agents yet</div>'}
  </div>
  <div class="section-bar">AUDIT HISTORY</div>
  <div class="table-scroll"><table class="bo-table"><thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>TARGET</th><th>DETAIL</th></tr></thead><tbody>${loadAudit().slice(0,12).map(a=>`<tr><td>${new Date(a.ts).toLocaleTimeString('en-IN')}</td><td>${a.actor}</td><td>${a.action}</td><td>${a.target}</td><td>${a.detail||'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">No audited actions yet</td></tr>'}</tbody></table></div>
  <div class="view-title">CREATE AGENT UNDER SUPER MASTER</div>
  <div class="form-box">
    <label>Agent ID</label><input id="newAgentId" placeholder="e.g. A1003">
    <label>Name</label><input id="newAgentName" placeholder="Agent name">
    <label>Password</label><input id="newAgentPass" placeholder="Create a password">
    <label>Opening Chips</label><input id="newAgentChips" type="number" value="10000">
    <label>Agent Share %</label><input id="newAgentShare" type="number" min="0" max="100" value="0">
    <button class="btn-green" onclick="superCreateAgent()">CREATE AGENT</button>
  </div>
  <div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">
    <button class="menu-btn" style="margin:0" onclick="go('livebets')">📡 LIVE BETS</button>
    <button class="menu-btn" style="margin:0" onclick="go('inplay')">IN PLAY</button>
    <button class="menu-btn" style="margin:0" onclick="go('casino')">CASINO</button>
  </div>
  ${state.staffModal?staffActionMenu(state.staffModal):''}${back()}`;
}
function superCreateMaster(){
  if(!state.user||state.user.role!=='supermaster'){toast('Only Super Master');return;}
  const id=((document.getElementById('newMasterId')||{}).value||'').trim().toUpperCase();
  const name=((document.getElementById('newMasterName')||{}).value||'').trim();
  const pass=((document.getElementById('newMasterPass')||{}).value||'').trim();
  const chips=parseInt((document.getElementById('newMasterChips')||{}).value,10)||0;
  if(!id||!pass){toast('ID + Password required');return;}
  const data=loadUsers();
  if(!data.masters) data.masters={};
  if(data.masters[id]){toast('Master ID exists');return;}
  data.masters[id]={id,name:name||id,role:'master',pass,chips,agents:[],status:'active'};
  saveUsers(data);
  audit('CREATE MASTER',id,'root master created');
  toast('Master '+id+' created');
  render();
}


function hierarchy(){
  const data=loadUsers();const role=state.user&&state.user.role;const root=hierarchyRoot(data);const supers=hierarchySuperMasters(data);const agents=role==='supermaster'?hierarchyAgents(data,state.user.id):Object.values(data.agents||{});
  const cards=role==='master'?supers.map(sm=>`<div class="agent-card"><div class="agent-avatar">S</div><div><button class="hierarchy-link" onclick="state.selectedSuper='${sm.id}';state.hierarchyLayer='agent';go('hierarchy-details')">${sm.id}</button><small>${sm.name||''} · Super Master · Share ${sm.share||0}%</small><small style="display:block;color:#5c3d1e">Parent: ${sm.parentMasterId||root.id}</small></div><div class="agent-coins">${(sm.chips||0).toLocaleString()}</div></div>`).join(''):agents.map(a=>`<div class="agent-card"><div class="agent-avatar">${(a.name||a.id||'?')[0]}</div><div><button class="hierarchy-link" onclick="state.selectedAgent='${a.id}';go('clientdetails')">${a.id}</button><small>${a.name||''} · ${(a.players||[]).length} clients · Share ${a.share||0}%</small><small style="display:block;color:#5c3d1e">Super: ${a.superId||'SUPER'}</small></div><div class="agent-coins">${(a.chips||0).toLocaleString()}</div></div>`).join('');
  return `${topBtn()}<div class="table-toolbar"><button class="blue-btn" onclick="state.hierarchyLayer='super';go('hierarchy-details')">SUPER MASTER</button><button class="blue-btn" onclick="state.hierarchyLayer='agent';go('hierarchy-details')">AGENTS</button><button class="blue-btn" onclick="state.hierarchyLayer='client';go('hierarchy-details')">CLIENTS</button></div><div class="view-title">MASTER → SUPER MASTER → AGENT → CLIENT</div><div class="master-card"><div class="role-chip">${role==='master'?'ROOT MASTER':'SUPER MASTER'}</div><div class="master-row"><strong>${role==='master'?root.id:(state.user&&state.user.id)||'SUPER'}</strong><span class="unlimited">${role==='master'?'Top-level control':'Under Root Master '+(root.id||'MASTER')}</span></div><p style="font-size:10px;color:#666;margin-top:6px">${role==='master'?'Root Master creates and controls Super Masters.':'Super Master creates and controls Agents; Agents manage Clients.'}</p></div><div class="agent-list"><div class="agent-heading">${role==='master'?'SUPER MASTERS':'AGENTS'} <span>${role==='master'?supers.length:agents.length}</span></div>${cards||'<div style="padding:12px;color:#888">No records yet</div>'}</div>${role==='master'?`<div class="view-title" style="margin-top:8px">CREATE SUPER MASTER</div><div class="form-box"><label>Super Master ID</label><input id="newSuperId" placeholder="e.g. SUPER2"><label>Name</label><input id="newSuperName" placeholder="Super Master name"><label>Password</label><input id="newSuperPass" placeholder="Create a password"><label>Opening Chips</label><input id="newSuperChips" type="number" value="50000"><label>Super Master Share %</label><input id="newSuperShare" type="number" min="0" max="100" value="0"><button class="btn-green" onclick="masterCreateSuperMaster()">CREATE SUPER MASTER</button></div>`:`<div class="view-title" style="margin-top:8px">CREATE AGENT UNDER ${state.user&&state.user.id}</div><div class="form-box"><label>Agent ID</label><input id="newAgentId" placeholder="e.g. A1003"><label>Name</label><input id="newAgentName" placeholder="Agent name"><label>Password</label><input id="newAgentPass" placeholder="Password"><label>Opening Chips</label><input id="newAgentChips" type="number" value="10000"><label>Agent Share %</label><input id="newAgentShare" type="number" min="0" max="100" value="0"><button class="btn-green" onclick="superCreateAgent()">CREATE AGENT</button></div>`}${back()}`;
}
function masterCreateSuperMaster(){
  if(!state.user||state.user.role!=='master'){toast('Only Root Master');return}
  const id=((document.getElementById('newSuperId')||{}).value||'').trim().toUpperCase();const name=((document.getElementById('newSuperName')||{}).value||'').trim();const pass=((document.getElementById('newSuperPass')||{}).value||'').trim();const chips=parseInt((document.getElementById('newSuperChips')||{}).value,10)||0;const share=Math.max(0,Math.min(100,parseInt((document.getElementById('newSuperShare')||{}).value,10)||0));
  if(!id||!pass){toast('Super ID + Password required');return}
  const data=loadUsers();if(!data.superMasters)data.superMasters={};if(data.superMasters[id]){toast('Super Master ID exists');return}
  data.superMasters[id]={id,name:name||id,role:'supermaster',pass,chips,share,parentMasterId:state.user.id,status:'active',agents:[]};
  data.masters[state.user.id].superMasters=data.masters[state.user.id].superMasters||[];data.masters[state.user.id].superMasters.push(id);
  saveUsers(data);audit('CREATE SUPER MASTER',id,`parent ${state.user.id}`);toast('Super Master '+id+' created');render();
}
function superCreateAgent(){
  if(!state.user||state.user.role!=='supermaster'){toast('Only Super Master');return}
  const id=((document.getElementById('newAgentId')||{}).value||'').trim().toUpperCase();const name=((document.getElementById('newAgentName')||{}).value||'').trim();const pass=((document.getElementById('newAgentPass')||{}).value||'').trim();const chips=parseInt((document.getElementById('newAgentChips')||{}).value,10)||0;const share=Math.max(0,Math.min(100,parseInt((document.getElementById('newAgentShare')||{}).value,10)||0));
  if(!id||!pass){toast('Agent ID + Password required');return}
  const data=loadUsers();if(data.agents[id]){toast('Agent ID exists');return}
  const masterId=state.user.parentMasterId||'MASTER';
  data.agents[id]={id,name:name||id,role:'agent',pass,chips,share,masterId,superId:state.user.id,players:[],status:'active'};
  data.superMasters[state.user.id].agents=data.superMasters[state.user.id].agents||[];data.superMasters[state.user.id].agents.push(id);
  data.masters[masterId].agents=data.masters[masterId].agents||[];data.masters[masterId].agents.push(id);
  saveUsers(data);audit('CREATE AGENT',id,`super master ${state.user.id}`);toast('Agent '+id+' created and saved in hierarchy');render();
}
function masterCreateAgent(){
  if(!state.user||state.user.role!=='master'){toast('Only Master');return;}
  const id=((document.getElementById('newAgentId')||{}).value||'').trim().toUpperCase();
  const name=((document.getElementById('newAgentName')||{}).value||'').trim();
  const pass=((document.getElementById('newAgentPass')||{}).value||'').trim();
  const chips=parseInt((document.getElementById('newAgentChips')||{}).value,10)||0;const share=Math.max(0,Math.min(100,parseInt((document.getElementById('newAgentShare')||{}).value,10)||0));
  if(!id||!pass){toast('ID + Password required');return;}
  const data=loadUsers();
  if(data.agents[id]){toast('Agent ID exists');return;}
  data.agents[id]={id,name:name||id,role:'agent',pass,chips,share,masterId:(state.user&&state.user.id)||'MASTER',players:[],status:'active'};
  if(data.masters&&data.masters[state.user.id]){ if(!data.masters[state.user.id].agents) data.masters[state.user.id].agents=[]; if(!data.masters[state.user.id].agents.includes(id)) data.masters[state.user.id].agents.push(id); }
  saveUsers(data);
  audit('CREATE AGENT',id,`master ${(state.user&&state.user.id)||'MASTER'}`);
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
  audit('ASSIGN CLIENT',pid,`agent ${aid}`);
  toast('Player '+pid+' → Agent '+aid);
  render();
}

function scopedClients(){
  const data=loadUsers(), role=state.user&&state.user.role, id=(state.user&&state.user.id||'').toUpperCase();
  let list=Object.values(data.players||{});
  if(state.selectedAgent) list=list.filter(p=>(p.agentId||'').toUpperCase()===String(state.selectedAgent).toUpperCase());
  if(role==='agent') list=list.filter(p=>(p.agentId||'').toUpperCase()===id);
  if(role==='supermaster'){
    const aids=new Set(hierarchyAgents(data,id).map(a=>a.id));
    list=list.filter(p=>aids.has(p.agentId));
  }
  return list;
}
function openExposure(id){state.exposureUser=id;render()}
function closeExposure(){state.exposureUser='';render()}
function exposureModal(id){
  const u=findUserById(id)||{id,name:id};
  const bets=(state.activeBets||[]).filter(b=>(b.player||b.playerId)===id).slice(0,12);
  return `<div class="modal-overlay" onclick="if(event.target===this)closeExposure()"><div class="staff-modal exposure-modal"><button class="modal-x" onclick="closeExposure()">×</button><h3>USER EXPOSURE</h3><div class="modal-subtitle">${u.id} · ${u.name||''} · Demo coins only</div><div class="table-scroll"><table class="bo-table"><thead><tr><th>MATCH</th><th>SELECTION NAME</th><th>STAKE</th><th>RATE</th><th>TYPE</th><th>TIME</th><th>LOSS</th><th>PROFIT</th></tr></thead><tbody>${bets.length?bets.map(b=>`<tr><td>${b.match||b.type||'Casino'}</td><td>${b.team||b.side||'—'}</td><td>${b.amt||0}</td><td>${b.rate||'—'}</td><td>${b.type||'KHAI'}</td><td>${new Date(b.ts||Date.now()).toLocaleTimeString('en-IN')}</td><td class="bad">${b.status==='lost'?b.amt||0:0}</td><td class="ok">${b.status==='won'?b.profit||0:0}</td></tr>`).join(''):`<tr><td colspan="8" class="empty-cell">No active exposure for ${u.id}</td></tr>`}</tbody></table></div><button class="back-btn" onclick="closeExposure()">CLOSE</button></div></div>`;
}
function staffActionMenu(id){
  const u=findUserById(id)||{id};
  const actions=[['Set Share','share'],['Deposit','deposit'],['Withdraw','withdraw'],['InActive','inactive'],['Block Betting','block'],['Block Casino','casino'],['Edit','edit'],['Statement','statement'],['Account Operations','account'],['Login Report','loginreport'],['Reset Password','reset'],['User Exposure','exposure']];
  return `<div class="modal-overlay" onclick="if(event.target===this){state.staffModal='';render()}"><div class="staff-modal action-modal"><button class="modal-x" onclick="state.staffModal='';render()">×</button><h3>${u.id} ACTIONS</h3><div class="modal-subtitle">All actions affect demo coins/local state only.</div>${actions.map(([label,key])=>`<button class="modal-action" onclick="boAction('${id}','${key}')">${label}<span>›</span></button>`).join('')}<button class="back-btn" onclick="state.staffModal='';render()">CLOSE</button></div></div>`;
}
function hierarchyPicker(){
  return `<div class="modal-overlay" onclick="if(event.target===this){state.staffModal='';render()}"><div class="staff-modal hierarchy-modal"><button class="modal-x" onclick="state.staffModal='';render()">×</button><h3>SELECT MASTER VIEW</h3><button class="modal-action" onclick="state.hierarchyLayer='super';state.staffModal='';go('hierarchy-details')">Super Master<span>›</span></button><button class="modal-action" onclick="state.hierarchyLayer='agent';state.staffModal='';go('hierarchy-details')">Agent Master<span>›</span></button><button class="modal-action" onclick="state.hierarchyLayer='client';state.staffModal='';go('hierarchy-details')">Client Master<span>›</span></button><button class="back-btn" onclick="state.staffModal='';render()">CLOSE</button></div></div>`;
}

function staffLedger(){
  const u=state.user||{};const players=scopedClients();
  const lena=players.filter(p=>(p.chips||0)>=0), dena=players.filter(p=>(p.chips||0)<0);
  const block=(title,list,cls)=>`<div class="section-bar ${cls}">${title} <span>${list.reduce((n,p)=>n+Math.abs(p.chips||0),0).toFixed(2)}</span></div><div class="table-scroll"><table class="bo-table"><thead><tr><th>USER</th><th>NAME</th><th>BALANCE</th><th>SETTLEMENT</th></tr></thead><tbody>${list.length?list.map(p=>`<tr><td>${p.id}</td><td>${p.name||'—'}</td><td class="${cls==='lena'?'ok':'bad'}">${Math.abs(p.chips||0).toFixed(2)}</td><td><button class="blue-btn" onclick="boAction('${p.id}','settlement')">SETTLEMENT</button></td></tr>`).join(''):`<tr><td colspan="4" class="empty-cell">No ${title.toLowerCase()} entries</td></tr>`}</tbody></table></div>`;
  return `${topBtn()}<div class="view-title">MY LEDGER</div><div class="bo-ledger-summary"><span>Balance: <b>${(u.chips||0).toFixed(2)}</b></span><span>Role: <b>${(u.role||'').toUpperCase()}</b></span></div><div class="table-scroll"><table class="bo-table"><thead><tr><th>DATE</th><th>EVENT NAME</th><th>CREDIT</th><th>DEBIT</th><th>BALANCE</th><th>TYPE</th></tr></thead><tbody><tr><td>2026-10-01</td><td>Opening Chips</td><td class="ok">${(u.chips||0).toFixed(2)}</td><td>0.00</td><td>${(u.chips||0).toFixed(2)}</td><td>Account</td></tr><tr><td>2026-10-01</td><td>Cricket / Casino Ledger</td><td>0.00</td><td>0.00</td><td>${(u.chips||0).toFixed(2)}</td><td>Ledger</td></tr></tbody></table></div>${block('LENA · RECEIVABLE',lena,'lena')}${block('DENA · PAYABLE',dena,'dena')}${back()}`;
}
function staffTransactions(){
  const u=state.user||{};const data=loadUsers();const list=Object.values(data.players||{});
  return `${topBtn()}<div class="view-title">LIST OF ALL TRANSACTIONS (0)</div><div class="table-toolbar"><button class="blue-btn">All</button><button class="blue-btn">P&amp;L</button><button class="blue-btn">Account</button></div><table class="ledger-table"><thead><tr><th>DATE</th><th>DESCRIPTION</th><th>CREDIT</th><th>DEBIT</th><th>BALANCE</th></tr></thead><tbody>${list.map(p=>`<tr><td>2026-10-01</td><td>${p.id} · Opening Chips</td><td class="pos">${(p.chips||0).toFixed(2)}</td><td>0.00</td><td>${(p.chips||0).toFixed(2)}</td></tr>`).join('')||'<tr><td colspan="5">No transaction entries yet</td></tr>'}</tbody></table><div class="bo-footnote">Account: ${u.id||'—'} · transaction history is scoped to your hierarchy.</div>${back()}`;
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

function logoutToRole(){location.href=loginPath(state.user&&state.user.role||'player')}
function staffHome(){
  const u=state.user||{};const role=u.role;const data=loadUsers();
  const masters=Object.values(data.masters||{});const supers=hierarchySuperMasters(data);const agents=Object.values(data.agents||{});const players=Object.values(data.players||{});
  const memberCount=role==='agent'?players.filter(p=>(p.agentId||'').toUpperCase()===u.id.toUpperCase()).length:role==='supermaster'?hierarchyClientIds(data,u.id).length:role==='master'?supers.length+agents.length+players.length:supers.length+agents.length+players.length;
  const stats=role==='agent'?[['CHIPS',(u.chips||0).toFixed(2)],['CLIENTS',memberCount],['MY SHARE',(u.share||30)+''],['COMPANY SHARE',(100-(u.share||30))+'%'],['MATCH COMMISSION',(u.commission||2)+'%'],['SESSION COMMISSION','3%']]:role==='master'?[['CHIPS',(u.chips||0).toFixed(2)],['SUPER MASTERS',supers.length],['AGENTS',agents.length],['CLIENTS',players.length],['MY SHARE',(u.share||100)+'%'],['REPORTS','READY']]:[['ROOT MASTER',hierarchyRoot(data).id],['AGENTS',hierarchyAgents(data,u.id).length],['CLIENTS',hierarchyClientIds(data,u.id).length],['TOTAL CHIPS',players.filter(p=>hierarchyClientIds(data,u.id).includes(p.id)).reduce((n,p)=>n+(p.chips||0),0).toLocaleString()],['ACTIVE GAMES','—'],['REPORTS','READY']];
  const actions=role==='agent'?[['AGENT DETAIL','clientdetails','♙'],['SPORTS-BETTING','inplay','▣'],['CASINO','casino','◆'],['MATKA','matka','◈'],['LEDGER','ledger','₹'],['CASH TRANSACTION','statement','▤'],['REPORTS','pnl','▥'],['SETTING','password','⚙'],['LOGOUT','logout','↪']]:role==='master'?[['MASTER DETAIL','hierarchy','♙'],['AGENT / CLIENT','clientdetails','♙'],['SPORTS-BETTING','inplay','▣'],['CASINO','casino','◆'],['MATKA','matka','◈'],['LEDGER','ledger','₹'],['CASH TRANSACTION','statement','▤'],['REPORTS','pnl','▥'],['USER CONTROL','usermgmt','⚙'],['LOGOUT','logout','↪']]:[['SUPER MASTER','super','♙'],['MASTER DETAILS','hierarchy-details','▣'],['AGENT DETAILS','hierarchy-details','♙'],['CLIENT DETAILS','clientdetails','♙'],['LEDGER','ledger','₹'],['REPORTS','livebets','▥'],['USER CONTROL','usermgmt','⚙'],['AUDIT / SETTINGS','super','⚙'],['LOGOUT','logout','↪']];
  return `${topBtn()}<div class="bo-dashboard">
    <div class="bo-identity"><strong>${u.id||'USER'}</strong><span>You are ${role==='agent'?'Agent':role==='master'?'Master':'Super Master'}</span></div>
    <div class="bo-actions">${actions.map(([label,view,icon])=>`<button class="bo-action-card" onclick="${view==='logout'?'logoutToRole()':`go('${view}')`}"><span class="bo-icon">${icon}</span><b>${label}</b></button>`).join('')}</div>
    <div class="bo-stats">${stats.map(([label,value])=>`<div class="bo-stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
    <div class="bo-section-note">${role==='agent'?'Manage assigned clients, sports betting and settlement':role==='master'?'Root Master: manage Super Masters, Agents, Clients and hierarchy':'Super Master: manage assigned Agents, Clients and platform reports'}</div>
  </div>`;
}
function boAction(id,action){
  const u=findUserById(id);if(!u){toast('User not found');return}
  if(action==='share'){
    const n=parseInt(prompt('Share % for '+id, String(u.share||0)),10);if(Number.isNaN(n)||n<0||n>100){toast('Share 0 se 100 ke beech hona chahiye');return;}
    updateUserFields(id,{share:n});audit('SET SHARE',id,`${n}%`);toast('Share updated · '+id);return;
  }else if(action==='deposit'||action==='withdraw'){
    const n=parseInt(prompt((action==='deposit'?'Deposit':'Withdraw')+' chips for '+id,'500'),10);if(!n||n<0)return;
    const next=Math.max(0,(u.chips||0)+(action==='deposit'?n:-n));updateUserFields(id,{chips:next});audit(action.toUpperCase(),id,`${n} demo chips`);toast(action+' '+n+' chips · '+id);
  }else if(action==='block'){setUserStatus(id,'blocked');toast('Demo betting blocked · '+id)}
  else if(action==='inactive'){setUserStatus(id,'suspended');toast('Demo user inactive · '+id)}
  else if(action==='exposure'){openExposure(id);return}
  else if(action==='settlement'){audit('SETTLEMENT',id,'demo ledger settlement');toast('Demo settlement recorded · '+id)}
  else if(action==='edit'||action==='account'||action==='loginreport'){toast(action.toUpperCase()+' demo view · '+id)}
  else if(action==='casino'){updateUserFields(id,{casinoBlocked:true});audit('BLOCK CASINO',id);toast('Casino blocked · '+id)}
  else if(action==='reset'){updateUserFields(id,{pass:u.role==='player'?'play123':u.role==='agent'?'agent123':'master123'});audit('RESET PASSWORD',id,'demo default');toast('Password reset · '+id)}
  else if(action==='statement'){state._viewPlayer=u;state.view='agent-player'}
  render();
}
function createClientForm(){return `<div class="create-client-card"><div class="section-bar">CREATE NEW CLIENT</div><div class="create-client-grid"><label>Client ID<input id="newClientId" placeholder="C3001"></label><label>Client Name<input id="newClientName" placeholder="Client name"></label><label>Password<input id="newClientPass" placeholder="Create a password"></label><label>Opening Chips<input id="newClientChips" type="number" value="1000"></label><label>Client Share %<input id="newClientShare" type="number" min="0" max="100" value="0"></label>${state.user&&state.user.role!=='agent'?'<label>Agent ID<input id="newClientAgent" placeholder="Agent ID"></label>':''}</div><div class="create-client-actions"><button class="blue-btn" onclick="agentCreateClient()">CREATE CLIENT</button><button class="back-btn" style="margin:0;width:auto" onclick="state.createClient=false;render()">CANCEL</button></div></div>`}
function agentCreateClient(){
  const role=state.user&&state.user.role;if(!['agent','master','supermaster'].includes(role)){toast('Not allowed');return}
  const id=((document.getElementById('newClientId')||{}).value||'').trim().toUpperCase();const name=((document.getElementById('newClientName')||{}).value||'').trim();const pass=((document.getElementById('newClientPass')||{}).value||'').trim();const chips=parseInt((document.getElementById('newClientChips')||{}).value,10)||0;const share=Math.max(0,Math.min(100,parseInt((document.getElementById('newClientShare')||{}).value,10)||0));const aid=role==='agent'?state.user.id:((document.getElementById('newClientAgent')||{}).value||'').trim().toUpperCase();
  if(!id||!name||!pass||!aid){toast('Client ID, name, password and Agent ID required');return}
  const data=loadUsers();if(data.players[id]){toast('Client ID already exists');return}
  if(!data.agents[aid]&&role==='agent'&&String(state.user.id).toUpperCase()===aid){data.agents[aid]={...state.user,id:aid,role:'agent',players:[],status:'active'};}
  if(!data.agents[aid]){toast('Agent not found — refresh hierarchy once');return}
  if(role==='agent'&&aid!==state.user.id){toast('Sirf apne clients bana sakte ho');return}
  if(role==='supermaster'&&!hierarchyAgents(data,state.user.id).some(a=>a.id===aid)){toast('Ye Agent aapke under nahi hai');return}
  data.players[id]={id,name,role:'player',pass,chips,share,agentId:aid,status:'active',createdAt:new Date().toISOString()};
  data.agents[aid].players=data.agents[aid].players||[];if(!data.agents[aid].players.includes(id))data.agents[aid].players.push(id);
  saveUsers(data);state.createClient=false;toast('Client '+id+' created and saved under Agent '+aid);render();
}
function clientDetails(){
  const role=state.user&&state.user.role;if(!['agent','master','supermaster'].includes(role))return shell(home());
  const list=scopedClients();
  return `${topBtn()}<div class="view-title">CLIENT DETAILS</div><div class="table-toolbar"><button class="blue-btn" onclick="state.createClient=true;render()">＋ CREATE</button><button class="blue-btn" onclick="render()">UPDATE LIST</button></div>${state.createClient?createClientForm():''}<div class="table-scroll"><table class="bo-table"><thead><tr><th>#</th><th>CODE</th><th>NAME</th><th>AGENT</th><th>D.O.J</th><th>SHARE%</th><th>PWD</th><th>EXPOSURE</th><th>CLIENT COMM%</th><th>C.CHIPS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${list.map((p,i)=>`<tr><td>${i+1}</td><td>${p.id}</td><td>${p.name||'—'}</td><td>${p.agentId||'—'}</td><td>${p.createdAt?p.createdAt.slice(0,10):'09-09-2026'}</td><td>${p.share||20}%</td><td>••••</td><td><button class="blue-btn" onclick="openExposure('${p.id}')">0.00</button></td><td>${p.commission||10}%</td><td>${(p.chips||0).toLocaleString()}</td><td class="${p.status==='active'?'ok':'bad'}">${(p.status||'active').toUpperCase()}</td><td><button class="action-trigger" onclick="state.staffModal='${p.id}';render()">＋</button></td></tr>`).join('')||'<tr><td colspan="12" class="empty-cell">No clients in this hierarchy</td></tr>'}</tbody></table></div><div class="bo-footnote">Blue plus opens Deposit · Withdraw · InActive · Block Betting · Block Casino · Edit · Statement · Account Operations · Login Report · Reset Password.</div>${state.staffModal?staffActionMenu(state.staffModal):''}${state.exposureUser?exposureModal(state.exposureUser):''}${back()}`;
}

/* ===== AGENT PANEL ===== */
function agentHome(){
  const u=state.user;
  if(!u||u.role!=='agent') return shell(home());
  const data=loadUsers();
  const agent=data.agents[u.id]||u;
  const playerIds=agent.players||[];
  const players=playerIds.map(id=>data.players[id]).filter(Boolean);
  return `${topBtn()}
  <div class="hier-grid">
    <button class="hier-btn" onclick="go('ledger')"><span class="icon">📒</span><small>P/L</small></button>
    <button class="hier-btn" onclick="go('ledger')"><span class="icon">📋</span><small>My Ledger</small></button>
    <button class="hier-btn" onclick="go('clientdetails')"><span class="icon">👤</span><small>Client</small></button>
    <button class="hier-btn" onclick="go('rules')"><span class="icon">ℹ️</span><small>Rules</small></button>
  </div>
  <div class="hier-stats">
    <div class="hier-stat"><span class="val">${players.length}</span><span class="lbl">Members</span></div>
    <div class="hier-stat"><span class="val">${agent.share||0}</span><span class="lbl">My Share</span></div>
    <div class="hier-stat"><span class="val">${agent.commission||0}%</span><span class="lbl">Company Share</span></div>
    <div class="hier-stat"><span class="val">2%</span><span class="lbl">Match Commission</span></div>
    <div class="hier-stat"><span class="val">3%</span><span class="lbl">Session Commission</span></div>
    <div class="hier-stat"><span class="val">${(agent.chips||0).toLocaleString()}</span><span class="lbl">Chips</span></div>
  </div>
  <div class="section-bar">Active Matches</div>
  <div style="background:#fff;padding:12px;font-size:12px;color:#666;text-align:center">No active matches right now</div>
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
  if(state.user?.role!=='agent'||String(p.agentId||'').toUpperCase()!==String(state.user.id||'').toUpperCase()){toast('Sirf apne client ke chips manage kar sakte ho');return;}
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
  const p=data.players[pid];
  if(!p||String(p.agentId||'').toUpperCase()!==String(state.user.id||'').toUpperCase()){toast('Sirf apne client ke chips manage kar sakte ho');return;}
  if((agent.chips||0)<n){toast('Aapke paas itne chips nahi');return;}
  agent.chips-=n;
  p.chips=(p.chips||0)+n;
  saveUsers(data);
  state.user=agent;
  sessionStorage.setItem('antpro_user',JSON.stringify(agent));
  toast(`Added ${n} to ${pid}`);
  if(state.view==='agent-player'){state._viewPlayer=p;}
  render();
}


function adminBetsFeed(){
  const bets=(state.view==='admin'?state.controllerBets:state.activeBets).slice(0,30);
  if(!bets.length)return '<p style="color:#8b949e;font-size:11px">Abhi koi bet nahi · players bet lagayenge to yahan live dikhega.</p>';
  return bets.map(b=>{
    const t=new Date(b.ts||Date.now()).toLocaleTimeString();
    const pl=b.player||'Player';
    const st=b.status||'pending';
    const col=st==='won'?'#3fb950':st==='lost'?'#f85149':'#8b949e';
    return `<div class="bet-row-admin"><span><b>${escapeHTML(pl)}</b> → ${escapeHTML(b.side||b.team||'—')} <small>(${escapeHTML(b.type||'—')})</small> @ ${b.rate}</span><span style="color:${col}">${Number(b.amt)||0} · ${st} · ${t}</span></div>`;
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
    const r=state.controllerRounds[g.key]||ensureRound(g.key);
    const gameBets=(state.controllerBets||[]).filter(b=>b.gameKey===g.key&&b.roundId===r.roundId);
    const totals=g.sides.reduce((out,s)=>(out[s]=gameBets.filter(b=>(b.side||b.team)===s).reduce((n,b)=>n+(Number(b.amt)||0),0),out),{});
    const minSide=g.sides.reduce((a,s)=> (totals[s]||0)<(totals[a]||0)?s:a, g.sides[0]);
    const elapsed=Math.max(0,Number.isFinite(Number(r.elapsedSeconds))?Number(r.elapsedSeconds):Math.floor((Date.now()-(r.startedAt||Date.now()))/1000));
    const duration=Number(r.duration)||GAME_TIMINGS[g.key]?.duration||30;
    const lock=Number.isFinite(Number(r.lockSeconds))?Number(r.lockSeconds):(GAME_TIMINGS[g.key]?.lock||0);
    const serverTimer=Math.max(0,Number.isFinite(Number(r.timer))?Number(r.timer):duration-elapsed);
    const betLeft=Math.max(0,Number.isFinite(Number(r.betTimer))?Number(r.betTimer):duration-lock-elapsed);
    const lockLeft=Math.max(0,duration-elapsed);
    const revealElapsed=Math.max(0,elapsed-duration);
    const resultElapsed=r.resultAt?Math.max(0,Math.floor((Date.now()-Number(r.resultAt))/1000)):0;
    const resultHold=Math.max(0,7-resultElapsed);
    const status=r.phase==='betting'?`BETTING · ROUND ${serverTimer}s · LOCK IN ${betLeft}s`:r.phase==='locked'?`LOCKED · REVEAL IN ${lockLeft}s`:r.phase==='revealing'?`REVEALING · ${revealElapsed}s`:r.phase==='result'?`RESULT · ${escapeHTML(r.result||'—')} · NEXT IN ${resultHold}s`:String(r.phase||'LIVE').toUpperCase();
    const previous=Array.isArray(r.previousResults)&&r.previousResults.length?r.previousResults[0]:'—';
    const totalCoins=Object.values(totals).reduce((n,v)=>n+v,0);
    return `<div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:#f0c040">${g.name}</strong>
        <span style="font-size:11px;color:#8b949e">Round <b style="color:#58a6ff">${r.roundId||'—'}</b></span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:11px">
        <span class="controller-status ${r.phase||''}">${status}</span>
        ${r.phase==='result'?`<span class="controller-result">Result hold ${resultHold}s · next timer starts with new round</span>`:''}
        ${r.forcedWinner?`<span class="controller-force">FORCE QUEUED: ${escapeHTML(r.forcedWinner)}</span>`:''}
      </div>
      <div style="font-size:11px;color:#8b949e;margin-bottom:6px">Current round bets · ${gameBets.length} slips · TOTAL ${totalCoins} coins · ROUND CLOCK ${serverTimer}s · ${r.phase==='betting'?`BET CLOSES IN ${betLeft}s`:'BETTING CLOSED'}</div>
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
      <div style="display:flex;justify-content:space-between;gap:6px;margin:4px 0 8px;font-size:10px;color:#8b949e"><span>DECISION: <b style="color:#7dd3fc">${escapeHTML(r.result||'PENDING')}</b></span><span>PREVIOUS: <b style="color:#fde68a">${escapeHTML(previous)}</b></span></div>
      <div class="controller-bet-list">${gameBets.length?gameBets.slice(-8).reverse().map(b=>`<div><b>${escapeHTML(b.player||'Player')}</b><span>${escapeHTML(b.side||b.team)} · ${Number(b.amt)||0}</span></div>`).join(''):'<em>No bets in this round — totals reset automatically on next round</em>'}</div>
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
  syncControllerBets();
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

function hierarchyDetails(){
  const layer=state.hierarchyLayer||'super';const data=loadUsers();const role=state.user&&state.user.role;const id=(state.user&&state.user.id||'').toUpperCase();
  let rows=[];
  if(layer==='super'){
    rows=role==='master'?hierarchySuperMasters(data).map(sm=>[sm.id,sm.name||'—',sm.parentMasterId||'MASTER',sm.share||0,sm.commission||0,sm.chips||0,sm.status||'active']):role==='supermaster'?hierarchyAgents(data,id).map(a=>[a.id,a.name||'—',a.superId||id,a.share||0,a.commission||0,a.chips||0,a.status||'active']):[[data.superMaster?.id||'SUPER',data.superMaster?.name||'Super Master','PLATFORM','—','—',data.superMaster?.chips||0,data.superMaster?.status||'active']];
  }else if(layer==='agent'){
    rows=hierarchyAgents(data,role==='supermaster'?id:'').map(a=>[a.id,a.name||'—',a.superId||'SUPER',a.share||20,a.commission||10,a.chips||0,a.status||'active']);
  }else{
    rows=scopedClients().map(p=>[p.id,p.name||'—',p.agentId||'—',p.share||0,p.commission||0,p.chips||0,p.status||'active']);
  }
  const title=layer==='super'?'SUPER DETAILS':layer==='agent'?'AGENT DETAILS':'CLIENT DETAILS';
  return `${topBtn()}<div class="view-title">${title}</div><div class="table-toolbar"><button class="blue-btn" onclick="state.hierarchyLayer='super';render()">Super Master</button><button class="blue-btn" onclick="state.hierarchyLayer='agent';render()">Agent Master</button><button class="blue-btn" onclick="state.hierarchyLayer='client';render()">Client Master</button></div><div class="table-scroll"><table class="bo-table"><thead><tr><th>CODE</th><th>NAME</th><th>UPLINE</th><th>SHARE%</th><th>COMM%</th><th>C.CHIPS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${Number(r[5]).toLocaleString()}</td><td class="${r[6]==='active'?'ok':'bad'}">${String(r[6]).toUpperCase()}</td><td><button class="action-trigger" onclick="state.staffModal='${r[0]}';render()">＋</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty-cell">No records in this hierarchy scope</td></tr>'}</tbody></table></div>${state.staffModal?staffActionMenu(state.staffModal):''}${back()}`;
}

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
  if(state.view==='clientdetails'){
    if(!state.user||!['agent','master','supermaster'].includes(state.user.role)) return shell(home());
    return shell(clientDetails());
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
  if(state.view==='hierarchy-details'){
    if(!state.user||(state.user.role!=='master'&&state.user.role!=='supermaster')) return shell(home());
    return shell(hierarchyDetails());
  }
  if(state.view==='home')return shell(state.user&&state.user.role!=='player'?staffHome():home());
  if(state.view==='rules')return shell(rules());
  if(state.view==='inplay')return shell(inplay());
  if(state.view==='match')return shell(match());
  if(state.view==='casino')return shell(casino());
  if(state.view==='andar')return shell(andar());
  if(state.view==='lucky7')return shell(lucky7());
  if(state.view==='teenpatti')return shell(teenpatti());
  if(state.view==='dragontiger')return shell(dragontiger());
  if(state.view==='hierarchy')return shell(hierarchy());
  if(state.view==='ledger')return shell(state.user&&state.user.role!=='player'?staffLedger():ledger());
  if(state.view==='password')return shell(password());
  if(state.view==='matka')return shell(matka());
  if(state.view==='aviator')return shell(aviator());
  if(state.view==='pnl')return shell(pagePnL());
  if(state.view==='bethistory')return shell(pageBetHistory());
  if(state.view==='statement')return shell(state.user&&state.user.role!=='player'?staffTransactions():pageStatement());
  if(state.view==='commission')return shell(pageCommission());
  if(state.view==='usermgmt')return shell(pageUserManage());
  return shell(home());
}
function render(){try{app.innerHTML=view()}catch(err){console.error('AntPro render recovery',err);app.innerHTML='<div style="min-height:100vh;background:#111;color:#ffe566;display:grid;place-items:center;padding:24px;text-align:center;font:700 14px Arial"><div>Live service reconnecting…<br><small style="display:block;margin-top:8px;color:#aaa;font-weight:400">Your demo round is safe. Please wait a moment.</small></div></div>'}}
function go(v){
  if(v==='login'){const role=state.user&&state.user.role||'player';state.loggedIn=false;state.menu=false;state.user=null;sessionStorage.removeItem('antpro_user');sessionStorage.removeItem('antpro_session_token');location.href=loginPath(role);return}
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
setInterval(()=>{if(state.view==='admin'&&state.adminAuthed)syncControllerBets()},500);
