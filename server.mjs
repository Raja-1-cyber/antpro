import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data');
const roundsFile=path.join(dataDir,'live-rounds.json');
const liveBetsFile=path.join(dataDir,'live-bets.json');
const marqueeFile=path.join(dataDir,'marquee.json');
const usersFile=path.join(dataDir,'users.json');
const rawFirebaseDb=process.env.FIREBASE_DATABASE_URL||'https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_DB=(rawFirebaseDb.match(/https?:\/\/[^\s\]\)\"']+/)||[rawFirebaseDb])[0].replace(/\/$/,'');
const SESSION_SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
function makeSessionToken(account){const payload=b64url(JSON.stringify({id:account.id,role:account.role,exp:Date.now()+86400000}));const sig=b64url(crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest());return `${payload}.${sig}`}
function verifySessionToken(req){try{const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const [payload,sig]=raw.split('.');if(!payload||!sig)return null;const expected=b64url(crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest());if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;const account=JSON.parse(Buffer.from(payload,'base64url').toString());return account.exp>Date.now()?account:null}catch{return null}}
let firebaseToken='',firebaseTokenExpires=0;
const b64url=value=>Buffer.from(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function firebaseAuthHeaders(){
  const raw=process.env.FIREBASE_CREDENTIALS_JSON;
  if(!raw)return {};
  if(firebaseToken&&Date.now()<firebaseTokenExpires-60000)return {Authorization:`Bearer ${firebaseToken}`};
  const cred=JSON.parse(raw),now=Math.floor(Date.now()/1000);
  const head=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const body=b64url(JSON.stringify({iss:cred.client_email,scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const input=`${head}.${body}`;
  const signature=crypto.createSign('RSA-SHA256').update(input).sign(String(cred.private_key).replace(/\\n/g,'\n'),'base64url');
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${input}.${signature}`})});
  if(!tokenRes.ok)throw new Error(`Firebase auth HTTP ${tokenRes.status}`);
  const token=await tokenRes.json();firebaseToken=token.access_token;firebaseTokenExpires=Date.now()+Number(token.expires_in||3600)*1000;
  return {Authorization:`Bearer ${firebaseToken}`};
}
async function firebaseFetch(pathname,options={}){const auth=await firebaseAuthHeaders();return fetch(`${FIREBASE_DB}${pathname}`,{...options,headers:{...(options.headers||{}),...auth}})}
fs.mkdirSync(dataDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const GAME_DEFS={'andar-bahar':{duration:20,lockSeconds:5},lucky7:{duration:15,lockSeconds:4},'teen-patti':{duration:20,lockSeconds:5},'dragon-tiger':{duration:15,lockSeconds:4}};
const REVEAL_TIMEOUTS={'andar-bahar':20,lucky7:8,'teen-patti':20,'dragon-tiger':8};
const GAME_SIDES={'andar-bahar':['Andar','Bahar'],lucky7:['7 UP','7','7 DOWN'],'teen-patti':['Team A','Team B'],'dragon-tiger':['Dragon','Tie','Tiger']};
const SPORT_SCORE_URL='https://sportscore.com/api/widget/matches/?sport=cricket&limit=20';
let rounds={};try{rounds=JSON.parse(fs.readFileSync(roundsFile,'utf8'))||{}}catch{rounds={}}
let liveBets=[];try{liveBets=JSON.parse(fs.readFileSync(liveBetsFile,'utf8'))||[]}catch{liveBets=[]}
let marquee='🌹 JAI SHREE SHYAM 🌹';try{marquee=JSON.parse(fs.readFileSync(marqueeFile,'utf8')).text||marquee}catch{}
let cricketCache={matches:[],updated:0,error:null};
function persist(){const tmp=roundsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rounds,null,2));fs.renameSync(tmp,roundsFile)}
function persistLiveBets(){const tmp=liveBetsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(liveBets.slice(-2000),null,2));fs.renameSync(tmp,liveBetsFile)}
function persistMarquee(){const tmp=marqueeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({text:marquee},null,2));fs.renameSync(tmp,marqueeFile)}
function defaultUsers(){return {superMaster:null,superMasters:{SM001:{id:'SM001',name:'Demo SuperMaster',role:'supermaster',pass:'super123',chips:0,agents:['A1001'],status:'active',parentMasterId:'MASTER',share:50}},masters:{MASTER:{id:'MASTER',name:'Root Master',role:'master',pass:'master123',chips:0,agents:['A1001'],status:'active',share:100}},agents:{A1001:{id:'A1001',name:'Demo Agent',role:'agent',pass:'agent123',chips:0,players:['P2001'],status:'active',masterId:'MASTER',superId:'SM001',share:20}},players:{P2001:{id:'P2001',name:'Demo Player',role:'player',pass:'play123',chips:100000,agentId:'A1001',status:'active',share:0}}};}
function loadUsersFile(){try{const u=JSON.parse(fs.readFileSync(usersFile,'utf8'));if(u&&u.masters?.MASTER){const d=defaultUsers();u.superMasters=u.superMasters||{};u.agents=u.agents||{};u.players=u.players||{};if(!u.players.P2001)u.players.P2001=d.players.P2001;if(!u.agents.A1001)u.agents.A1001=d.agents.A1001;if(!u.superMasters.SM001)u.superMasters.SM001=d.superMasters.SM001;if(!u.masters.MASTER.pass)u.masters.MASTER.pass='master123';return u}}catch{}const d=defaultUsers();try{fs.writeFileSync(usersFile,JSON.stringify(d,null,2))}catch{}return d}
function normalizeUsers(u){u=u||{};u.superMasters=u.superMasters||{};u.masters=u.masters||{};u.agents=u.agents||{};u.players=u.players||{};if(!u.masters.MASTER)u.masters.MASTER={id:'MASTER',name:'Root Master',role:'master',pass:'master123',chips:0,agents:[],status:'active'};Object.values(u.masters).forEach(m=>{m.agents=[];m.superMasters=[];m.share=typeof m.share==='number'?m.share:100});Object.values(u.superMasters).forEach(sm=>{sm.agents=[];sm.share=typeof sm.share==='number'?sm.share:0;const m=u.masters[sm.parentMasterId||'MASTER'];if(m)m.superMasters.push(sm.id)});Object.values(u.agents).forEach(a=>{a.players=[];a.share=typeof a.share==='number'?a.share:0;const m=u.masters[a.masterId||'MASTER'];if(m&&!m.agents.includes(a.id))m.agents.push(a.id);const sm=u.superMasters[a.superId];if(sm&&!sm.agents.includes(a.id))sm.agents.push(a.id)});Object.values(u.players).forEach(p=>{p.share=typeof p.share==='number'?p.share:0;const a=u.agents[p.agentId];if(a&&!a.players.includes(p.id))a.players.push(p.id)});return u}
function mergeUsers(current,incoming){const merged={...(current||{}),...(incoming||{})};for(const bucket of ['masters','superMasters','agents','players']){merged[bucket]={...((current&&current[bucket])||{}),...((incoming&&incoming[bucket])||{})};for(const [id,oldValue] of Object.entries((current&&current[bucket])||{})){const next=merged[bucket][id];if(oldValue?.pass&&!next?.pass)merged[bucket][id]={...oldValue,...next,pass:oldValue.pass}}}if(!incoming?.superMaster&&current?.superMaster)merged.superMaster=current.superMaster;else if(current?.superMaster?.pass&&!merged.superMaster?.pass)merged.superMaster={...current.superMaster,...merged.superMaster,pass:current.superMaster.pass};return normalizeUsers(merged)}
function saveUsersFile(u){u=normalizeUsers(u);const tmp=usersFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(u,null,2));fs.renameSync(tmp,usersFile)}
function storedAccount(users,username,password){const id=String(username||'').trim().toUpperCase(),pass=String(password||'').trim();const check=(bucket,role)=>{for(const [key,value] of Object.entries(users[bucket]||{})){if(String(value.id||key).toUpperCase()===id&&value.pass===pass)return {...value,role}}return null};if(users.superMaster&&String(users.superMaster.id||'').toUpperCase()===id&&users.superMaster.pass===pass)return {...users.superMaster,role:'supermaster'};return check('superMasters','supermaster')||check('masters','master')||check('agents','agent')||check('players','player')||null}
function publicUsers(users){const safe=JSON.parse(JSON.stringify(users));if(safe.superMaster)delete safe.superMaster.pass;for(const bucket of ['superMasters','masters','agents','players'])for(const value of Object.values(safe[bucket]||{}))delete value.pass;return safe}
async function mirrorUsersToFirebase(u){try{const r=await firebaseFetch('/users.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)});if(!r.ok)throw new Error(`Firebase write HTTP ${r.status}`);console.log('users mirrored to Firebase')}catch(e){console.warn('firebase users mirror failed',e.message)}}
async function restoreUsersFromFirebase(){try{const r=await firebaseFetch('/users.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return false;const remote=await r.json();if(!remote||!remote.masters?.MASTER)return false;if(remote.superMaster&&typeof remote.superMaster==='object'){remote.superMasters={...(remote.superMasters||{}),[remote.superMaster.id||'SUPER']:remote.superMaster}}const local=loadUsersFile();const merged=mergeUsers(local,remote);saveUsersFile(merged);console.log(`restored users from Firebase: ${Object.keys(merged.agents).length} agents, ${Object.keys(merged.players).length} clients`);return true}catch(e){console.warn('firebase users restore skipped',e.message);return false}}
const usersReady=restoreUsersFromFirebase();
async function fetchFirebaseLive(){
  try{
    const [matchesRes,metaRes]=await Promise.all([
      fetch(FIREBASE_DB+'/live_matches.json',{signal:AbortSignal.timeout(8000)}),
      fetch(FIREBASE_DB+'/meta/scraper.json',{signal:AbortSignal.timeout(8000)})
    ]);
    if(!matchesRes.ok)return null;
    const live_matches=await matchesRes.json();
    const meta=metaRes.ok?await metaRes.json():{};
    const entries=Object.entries(live_matches||{});
    const newest=entries.reduce((max,[,m])=>Math.max(max,Number(m?.updated_at)||0),0);
    const lastUpdate=meta?.last_update?Date.parse(meta.last_update):0;
    return {live_matches:live_matches||{},meta:meta||{},newestUpdate:Math.max(newest,lastUpdate)};
  }catch{return null}
}
function normalizeFirebaseMatches(snapshot){
  return Object.entries(snapshot?.live_matches||{}).map(([id,m])=>{
    const teams=String(m?.teams||'Unknown v Unknown');
    const parts=teams.split(/\s+v(?:s)?\.?\s+/i);
    const score=String(m?.score||'');
    const scoreParts=score.split(/\s+-\s+/);
    const status=String(m?.status||'UPCOMING').toLowerCase();
    return {id,name:teams,home:parts[0]||teams,away:parts.slice(1).join(' v ')||'',homeScore:scoreParts[0]&&scoreParts[0]!=='—'&&scoreParts[0]!=='-'?scoreParts[0]:'',awayScore:scoreParts[1]&&scoreParts[1]!=='—'&&scoreParts[1]!=='-'?scoreParts[1]:'',status,statusText:status,time:m?.updated_at?new Date(Number(m.updated_at)).toISOString():'',competition:m?.competition||'',live:status==='live',sessions:m?.sessions||{},overs:m?.overs||'',batsmen:Array.isArray(m?.batsmen)?m.batsmen:[],bowler:m?.bowler||'',bowlerStats:m?.bowler_stats||{},lastBalls:Array.isArray(m?.last_balls)?m.last_balls:[],innings:m?.innings||'',providerUpdatedAt:m?.updated_at||0};
  }).sort((a,b)=>{const rank=s=>s==='live'?0:s==='upcoming'?1:2;return rank(a.status)-rank(b.status)});
}
function firebaseIsFresh(snapshot){
  const stamp=Number(snapshot?.newestUpdate)||0;
  return stamp>0&&(Date.now()-stamp)<600000;
}
function newRound(key,seconds=GAME_DEFS[key]?.duration||30){const def=GAME_DEFS[key]||{duration:seconds,lockSeconds:4};const old=rounds[key]||{};const history=Array.isArray(old.previousResults)?old.previousResults.slice(0,10):[];const r={gameKey:key,roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:seconds,duration:seconds,lockSeconds:def.lockSeconds,forcedWinner:null,startedAt:Date.now(),previousResults:history};rounds[key]=r;persist();return r}
function commitServerResult(key,r,winner){const history=Array.isArray(r.previousResults)?r.previousResults:[];r.phase='result';r.timer=0;r.result=winner;r.resultAt=Date.now();r.forcedWinner=null;r.previousResults=[winner,...history].slice(0,10);rounds[key]=r;persist();return r}
function serverWinner(key,r){const options=GAME_SIDES[key]||[];return options.includes(r?.forcedWinner)?r.forcedWinner:options[Math.floor(Math.random()*options.length)]||'Tie'}
function currentRound(key){const def=GAME_DEFS[key]||{duration:30,lockSeconds:4};let r=rounds[key];const invalid=!r||!r.roundId||!Number.isFinite(Number(r.duration))||Number(r.duration)<=0||!Number.isFinite(Number(r.lockSeconds))||Number(r.lockSeconds)!==Number(def.lockSeconds)||Number(r.lockSeconds)<0||Number(r.lockSeconds)>=Number(r.duration);if(invalid)r=newRound(key,def.duration);let elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);const duration=Number(r.duration)||def.duration;const lockSeconds=def.lockSeconds;const lockAt=Math.max(0,duration-lockSeconds);if(r.phase==='betting'&&elapsed>=lockAt){r.phase='locked';r.timer=Math.max(0,duration-elapsed);r.lockedAt=r.startedAt+lockAt*1000;persist()}if((r.phase==='locked'||r.phase==='revealing')&&elapsed>=duration){if(r.phase!=='revealing'){r.phase='revealing';r.revealAt=r.startedAt+duration*1000;persist()}r.timer=0;r.betTimer=0;if(elapsed>=duration+(REVEAL_TIMEOUTS[key]||12)){r=commitServerResult(key,r,serverWinner(key,r));elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000)}}if(r.phase==='result'&&Date.now()-(r.resultAt||r.startedAt||0)>=7000){r=newRound(key,def.duration);elapsed=0}r.duration=duration;r.lockSeconds=lockSeconds;r.timer=r.phase==='betting'?Math.max(0,duration-elapsed):0;r.betTimer=Math.max(0,lockAt-elapsed);r.elapsedSeconds=elapsed;return r}
function snapshot(){const out={};for(const key of Object.keys(GAME_DEFS))out[key]={...currentRound(key)};return out}
async function fetchCricket(){
  if(Date.now()-cricketCache.updated<30000&&cricketCache.matches.length)return cricketCache;
  const firebase=await fetchFirebaseLive();
  if(firebase&&firebaseIsFresh(firebase)){
    const matches=normalizeFirebaseMatches(firebase);
    if(matches.length){cricketCache={matches,updated:Date.now(),source:'firebase-scraper',error:null,meta:firebase.meta};return cricketCache;}
  }
  try{
    const response=await fetch(SPORT_SCORE_URL,{headers:{'user-agent':'AntPro-Demo/1.0','accept':'application/json'}});
    if(!response.ok)throw new Error('SportScore HTTP '+response.status);
    const data=await response.json();
    const matches=(data.matches||[]).map((m,i)=>({id:i,name:(m.home||'?')+' v '+(m.away||'?'),home:m.home||'',away:m.away||'',homeScore:m.home_score||'',awayScore:m.away_score||'',status:(m.status||'').toLowerCase(),statusText:m.status_text||m.status||'',time:m.time||'',competition:m.competition||'',homeLogo:m.home_logo||'',awayLogo:m.away_logo||'',competitionLogo:m.competition_logo||'',url:m.url||'',live:(m.status||'').toLowerCase()==='live',overs:m.overs??m.current_overs??'',batsmen:Array.isArray(m.batsmen)?m.batsmen:(Array.isArray(m.players)?m.players:[]),bowler:m.bowler||m.current_bowler||'',bowlerStats:m.bowler_stats||m.bowlerStats||{overs:m.bowler_overs,maidens:m.bowler_maidens,runs:m.bowler_runs,wickets:m.bowler_wickets,economy:m.bowler_economy},lastBalls:Array.isArray(m.last_balls)?m.last_balls:(Array.isArray(m.lastBalls)?m.lastBalls:[]),innings:m.innings||'',providerUpdatedAt:m.updated_at||m.updatedAt||''}));
    matches.sort((a,b)=>{const rank=s=>s==='live'?0:s==='upcoming'?1:2;return rank(a.status)-rank(b.status)});
    cricketCache={matches,updated:Date.now(),source:'sportscore-fallback',error:null};
  }catch(error){cricketCache.error=String(error);if(!cricketCache.matches.length)cricketCache.updated=Date.now()}
  return cricketCache;
}
function hashKey(value){let h=2166136261;for(const ch of value){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function cricketSessions(matchName){
  const key=String(matchName||'').trim();
  const live=cricketCache.matches.find(m=>m.name===key);
  const sessions=live?.sessions||{};
  const entries=Object.entries(sessions);
  if(entries.length)return entries.map(([name,s],id)=>({id,name:name.endsWith('_over')?`${name.split('_')[0]} OVER RUN ${(live.home||'TEAM').slice(0,8).toUpperCase()}`:name.replaceAll('_',' ').toUpperCase(),not:s?.no_run??s?.not??'—',yes:s?.yes_run??s?.yes??'—',rate:s?.rate??'—',status:s?.status||'SUSPENDED',source:'firebase-scraper',updated:cricketCache.updated}));
  return [{id:0,name:live?.live?'Provider session lines unavailable':'Sessions open when match goes LIVE',not:'—',yes:'—',rate:'—',status:'SUSPENDED',source:'provider-unavailable',updated:cricketCache.updated}];
}
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(payload))}
function readBody(req){return new Promise(resolve=>{let raw='';req.on('data',c=>{raw+=c.toString();if(raw.length>10000)req.destroy()});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{resolve({})}});req.on('error',()=>resolve({}))})}
function serveStatic(req,res,u){let rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\//,'');let file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');try{const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-cache'});res.end(data)}catch{res.writeHead(500);res.end('error')}}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');try{
  if(u.pathname==='/api/health')return json(res,200,{ok:true,service:'antpro-demo',time:Date.now(),cricketFeed:'firebase-scraper-first'});
  if(u.pathname==='/api/marquee'&&req.method==='GET')return json(res,200,{text:marquee});
  if(u.pathname==='/api/marquee'&&req.method==='POST'){const body=await readBody(req);const text=String(body.text||'').trim().slice(0,120);if(!text)return json(res,400,{ok:false,error:'text required'});marquee=text;persistMarquee();return json(res,200,{ok:true,text:marquee})}
  if(u.pathname==='/api/cricket/matches'&&req.method==='GET'){const feed=await fetchCricket();return json(res,feed.matches.length?200:502,{source:feed.source||'unknown',updated:feed.updated,matches:feed.matches,meta:feed.meta||null,error:feed.matches.length?null:'Live cricket feed unavailable'})}
  if(u.pathname==='/api/cricket/sessions'&&req.method==='GET'){const feed=await fetchCricket();const matchName=u.searchParams.get('match')||'';if(!feed.matches.length)return json(res,502,{ok:false,error:'SportScore feed unavailable',sessions:[]});const match=feed.matches.find(m=>m.name===matchName);if(!match)return json(res,404,{ok:false,error:'Match not found',sessions:[]});return json(res,200,{ok:true,source:feed.source||'unknown',match:match.name,matchStatus:match.status,matchLive:match.live,updated:feed.updated,sessions:cricketSessions(match.name)})}
  if(u.pathname==='/api/firebase/live'&&req.method==='GET'){const snap=await fetchFirebaseLive();if(!snap)return json(res,502,{ok:false,error:'firebase unavailable',live_matches:{},meta:{}});return json(res,200,{ok:true,live_matches:snap.live_matches||{},meta:snap.meta||{},newestUpdate:snap.newestUpdate||0})}
  if(u.pathname==='/api/live-rounds'&&req.method==='GET')return json(res,200,snapshot());
  if(u.pathname==='/api/live-bets'&&req.method==='GET'){const requested=u.searchParams.get('gameKey');const roundsNow=snapshot();const bets=liveBets.filter(b=>(!requested||b.gameKey===requested)&&roundsNow[b.gameKey]?.roundId===b.roundId);return json(res,200,{ok:true,bets})}
  if(u.pathname==='/api/bets-history'&&req.method==='GET'){const account=verifySessionToken(req);if(!account)return json(res,401,{ok:false,error:'login required'});const player=u.searchParams.get('player');const limit=Math.min(500,Math.max(20,Number(u.searchParams.get('limit'))||200));let bets=liveBets.slice(-2000);if(player)bets=bets.filter(b=>String(b.player||'').toUpperCase()===String(player).toUpperCase());return json(res,200,{ok:true,bets:bets.slice(-limit),role:account.role,viewer:account.id})}
  if(u.pathname==='/api/bets-settle'&&req.method==='POST'){const account=verifySessionToken(req);if(!account)return json(res,401,{ok:false,error:'login required'});const body=await readBody(req);const player=String(body.player||'').slice(0,64);const roundId=String(body.roundId||'');const side=String(body.side||body.team||'');const status=String(body.status||'');const profit=Number(body.profit)||0;const amt=Number(body.amt)||0;const type=String(body.type||'');const rate=Number(body.rate)||0;const gameKey=String(body.gameKey||'');if(!player||!status)return json(res,400,{ok:false,error:'player and status required'});liveBets.push({gameKey,roundId,player,side,type,rate,amt:Math.floor(amt),ts:Date.now(),status,profit:Math.floor(profit),result:String(body.result||status)});persistLiveBets();return json(res,201,{ok:true})}
  if(u.pathname==='/api/live-bets'&&req.method==='POST'){if(!verifySessionToken(req))return json(res,401,{ok:false,error:'login required'});const body=await readBody(req);const gameKey=String(body.gameKey||'');const round=currentRound(gameKey);const side=String(body.side||'');const amt=Number(body.amt);const sides=GAME_SIDES[gameKey]||[];const elapsed=Math.floor((Date.now()-Number(round.startedAt||Date.now()))/1000);const bettingOpen=round.phase==='betting'&&elapsed<Math.max(0,Number(round.duration)-Number(round.lockSeconds));if(!GAME_DEFS[gameKey]||!body.player||!sides.includes(side)||!Number.isInteger(amt)||amt<100)return json(res,400,{ok:false,error:'invalid live bet'});if(body.roundId&&String(body.roundId)!==round.roundId)return json(res,409,{ok:false,error:'stale round'});if(!bettingOpen)return json(res,409,{ok:false,error:'betting closed',roundId:round.roundId});liveBets.push({gameKey,roundId:round.roundId,player:String(body.player).slice(0,64),side:side.slice(0,32),type:String(body.type||gameKey).slice(0,32),rate:Number(body.rate)||0,amt:Math.floor(amt),ts:Date.now(),status:'open'});persistLiveBets();return json(res,201,{ok:true,roundId:round.roundId})}
  const result=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/result$/);if(result&&req.method==='POST'){const key=decodeURIComponent(result[1]);const body=await readBody(req);const winner=String(body.winner||'');const sides=GAME_SIDES[key]||[];if(!GAME_DEFS[key]||!sides.includes(winner))return json(res,400,{ok:false,error:'invalid result'});const r=currentRound(key);commitServerResult(key,r,winner);return json(res,200,{ok:true,round:rounds[key]})}
  const force=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/force$/);if(force&&req.method==='POST'){const key=decodeURIComponent(force[1]);const body=await readBody(req);const side=String(body.side||'');const sides=GAME_SIDES[key]||[];if(!GAME_DEFS[key]||!sides.includes(side))return json(res,400,{ok:false,error:'invalid side'});const r=currentRound(key);r.forcedWinner=side;rounds[key]=r;persist();return json(res,200,{ok:true,round:r})}
  const neu=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/new$/);if(neu&&req.method==='POST'){const key=decodeURIComponent(neu[1]);if(!GAME_DEFS[key])return json(res,400,{ok:false,error:'invalid game'});const body=await readBody(req);const secs=Number(body.seconds)||GAME_DEFS[key].duration;return json(res,200,{ok:true,round:newRound(key,secs)})}
  if(u.pathname==='/api/login'&&req.method==='POST'){try{await Promise.race([usersReady,new Promise(r=>setTimeout(r,1500))])}catch{}const body=await readBody(req);const users=loadUsersFile();const account=storedAccount(users,body.username||body.id,body.password||body.pass);if(!account)return json(res,401,{ok:false,error:'invalid credentials'});const token=makeSessionToken(account);return json(res,200,{ok:true,token,user:{id:account.id,role:account.role,name:account.name||account.id,chips:account.chips||0}})}
  if(u.pathname==='/api/users'&&req.method==='GET'){try{await Promise.race([usersReady,new Promise(r=>setTimeout(r,1500))])}catch{}return json(res,200,publicUsers(loadUsersFile()))}
  if(u.pathname==='/api/users'&&req.method==='POST'){try{await Promise.race([usersReady,new Promise(r=>setTimeout(r,1500))])}catch{}const body=await readBody(req);const current=loadUsersFile();const merged=mergeUsers(current,body.users||body);saveUsersFile(merged);mirrorUsersToFirebase(merged);return json(res,200,{ok:true,users:publicUsers(merged)})}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});return res.end()}
  return serveStatic(req,res,u);
}catch(e){console.error(e);json(res,500,{ok:false,error:String(e.message||e)})}});
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log('AntPro on :'+PORT));
