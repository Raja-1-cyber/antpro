import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data');
const roundsFile=path.join(dataDir,'live-rounds.json');
const marqueeFile=path.join(dataDir,'marquee.json');
const usersFile=path.join(dataDir,'users.json');
const betsFile=path.join(dataDir,'live-bets.json');
const rawFirebaseDb=process.env.FIREBASE_DATABASE_URL||'https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_DB=(rawFirebaseDb.match(/https?:\/\/[^\s\]\)\"']+/)||[rawFirebaseDb])[0].replace(/\/$/,'');
fs.mkdirSync(dataDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const GAME_DEFS={'andar-bahar':{duration:30,lockSeconds:5,resultHold:5000},lucky7:{duration:15,lockSeconds:4,resultHold:4000},'teen-patti':{duration:20,lockSeconds:5,resultHold:5000},'dragon-tiger':{duration:15,lockSeconds:4,resultHold:5000}};
const SPORT_SCORE_URL='https://sportscore.com/api/widget/matches/?sport=cricket&limit=20';
const CRICBUZZ_LIVE_URL='https://www.cricbuzz.com/cricket-match/live-scores';
let rounds={};try{rounds=JSON.parse(fs.readFileSync(roundsFile,'utf8'))||{}}catch{rounds={}}
let marquee='🌹 JAI SHREE SHYAM 🌹';try{marquee=JSON.parse(fs.readFileSync(marqueeFile,'utf8')).text||marquee}catch{}
let cricketCache={matches:[],updated:0,error:null};
let liveBets=[];try{liveBets=JSON.parse(fs.readFileSync(betsFile,'utf8'))||[]}catch{liveBets=[]}
function persist(){const tmp=roundsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rounds,null,2));fs.renameSync(tmp,roundsFile)}
function persistMarquee(){const tmp=marqueeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({text:marquee},null,2));fs.renameSync(tmp,marqueeFile)}
function persistBets(){const tmp=betsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(liveBets.slice(0,2000),null,2));fs.renameSync(tmp,betsFile)}
const LEGACY_DEMO_IDS=new Set(['SUPER','SM001','MASTER2','A1001','A1002','P2001','P2002','P2003']);
function purgeLegacyDemoUsers(u){
  if(!u||typeof u!=='object')u={};
  if(u.meta&&u.meta.demoCleanupVersion===1)return u;
  if(u.superMaster&&LEGACY_DEMO_IDS.has(String(u.superMaster.id||'').toUpperCase()))u.superMaster=null;
  for(const bucket of ['superMasters','masters','agents','players']){
    u[bucket]=u[bucket]||{};
    for(const id of Object.keys(u[bucket]))if(LEGACY_DEMO_IDS.has(String(id).toUpperCase())||LEGACY_DEMO_IDS.has(String(u[bucket][id]?.id||'').toUpperCase()))delete u[bucket][id];
  }
  for(const m of Object.values(u.masters||{}))if(Array.isArray(m.agents))m.agents=m.agents.filter(id=>!LEGACY_DEMO_IDS.has(String(id).toUpperCase()));
  for(const a of Object.values(u.agents||{}))if(Array.isArray(a.players))a.players=a.players.filter(id=>!LEGACY_DEMO_IDS.has(String(id).toUpperCase()));
  u.meta={...(u.meta||{}),demoCleanupVersion:1};
  return u;
}
function defaultUsers(){return {meta:{demoCleanupVersion:1},superMaster:null,superMasters:{},masters:{MASTER:{id:'MASTER',name:'Master',role:'master',pass:'master123',chips:0,commission:0,share:100,agents:[],status:'active'}},agents:{},players:{}};}
function loadUsersFile(){
  const defaults=defaultUsers();
  try{
    const raw=JSON.parse(fs.readFileSync(usersFile,'utf8'))||{};
    const u=purgeLegacyDemoUsers(raw);
    const merged={...u,meta:{...defaults.meta,...(u.meta||{})},superMaster:u.superMaster||defaults.superMaster,superMasters:{...defaults.superMasters,...(u.superMasters||{})},masters:{...defaults.masters,...(u.masters||{})},agents:{...defaults.agents,...(u.agents||{})},players:{...defaults.players,...(u.players||{})}};
    try{fs.writeFileSync(usersFile,JSON.stringify(merged,null,2))}catch{}
    return merged;
  }catch{}
  try{fs.writeFileSync(usersFile,JSON.stringify(defaults,null,2))}catch{}
  return defaults;
}
function saveUsersFile(u){const clean=purgeLegacyDemoUsers(u);const tmp=usersFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(clean,null,2));fs.renameSync(tmp,usersFile)}
function publicUser(u){if(!u)return null;const {pass,...safe}=u;return safe}
function findAccount(username,password){
  const id=String(username||'').trim().toUpperCase();
  const secret=String(password||'').trim();
  if(!id||!secret)return null;
  const users=loadUsersFile();
  const buckets=[['superMaster','supermaster'],['superMasters','supermaster'],['masters','master'],['agents','agent'],['players','player']];
  for(const [bucket,role] of buckets){
    const rows=bucket==='superMaster'?[users.superMaster]:Object.values(users[bucket]||{});
    for(const row of rows){
      if(row&&String(row.id||'').toUpperCase()===id&&String(row.pass||'')===secret){
        return {...row,role:row.role||role};
      }
    }
  }
  return null;
}
async function mirrorUsersToFirebase(u){try{await fetch(FIREBASE_DB+'/users.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)})}catch(e){console.warn('firebase users mirror failed',e.message)}}
function buildSessionLines(matchName,isLive,score){
  const over=Number((String(score||'').match(/\((\d+(?:\.\d+)?)\s*overs?/i)||[])[1]||0);
  const seed=String(matchName||'').split('').reduce((n,c)=>n+c.charCodeAt(0),0);
  const out={};
  for(const target of [6,10,15,20]){
    const key=`${target}_over`;
    if(!isLive) out[key]={yes_run:'—',no_run:'—',status:'CLOSED'};
    else if(over>=target) out[key]={yes_run:'—',no_run:'—',status:'SETTLED'};
    else {const yes=target*7+((seed+target)%9),no=yes+1+((seed+target*3)%3);out[key]={yes_run:String(yes),no_run:String(no),status:'OPEN'};}
  }
  return out;
}
async function fetchCricbuzzLive(){
  try{
    const response=await fetch(CRICBUZZ_LIVE_URL,{headers:{'user-agent':'Mozilla/5.0 AntPro-LiveScore/1.0','accept':'text/html'}});
    if(!response.ok)return [];
    const html=(await response.text()).replace(/\\"/g,'"');
    const pattern= /"matchInfo":\{([\s\S]*?)\},"matchScore":\{([\s\S]*?)\}\}\}/g;
    const out=[],seen=new Set();let hit;
    const pick=(text,key)=>{const m=text.match(new RegExp('"'+key+'":"?([^",}]+)'));return m?m[1]:''};
    while((hit=pattern.exec(html))){
      const info=hit[1],scoreBlock=hit[2],id=pick(info,'matchId');
      const t1=(info.match(/"team1":\{[\s\S]*?"teamName":"([^"]+)"/)||[])[1]||'';
      const t2=(info.match(/"team2":\{[\s\S]*?"teamName":"([^"]+)"/)||[])[1]||'';
      if(!id||!t1||!t2||seen.has(id))continue;seen.add(id);
      const state=pick(info,'state'),statusText=pick(info,'status')||pick(info,'shortStatus');
      const live=/in progress|live|started|playing|stumps|opt to bat|day \d/i.test(`${state} ${statusText}`);
      const stateLower=state.toLowerCase();
      const status=live?'live':stateLower==='complete'?'finished':'upcoming';
      const scoreFor=team=>{const m=scoreBlock.match(new RegExp('"'+team+'Score":\\{[\\s\\S]*?"runs":(\\d+),"wickets":(\\d+),"overs":([\\d.]+)'));return m?`${m[1]}/${m[2]} (${m[3]} overs)`:''};
      const homeScore=scoreFor('team1'),awayScore=scoreFor('team2');
      const scoreDisplay=homeScore&&awayScore?`${homeScore} - ${awayScore}`:homeScore||awayScore||'SCORE PENDING FROM PROVIDER';
      const name=`${t1} v ${t2}`;
      out.push({id:`cricbuzz-${id}`,name,home:t1,away:t2,homeScore,awayScore,score:`${homeScore}${awayScore?' - '+awayScore:''}`,scoreDisplay,status,statusText,time:'',competition:pick(info,'seriesName'),matchUrl:`${CRICBUZZ_LIVE_URL}/${id}`,live,sessions:buildSessionLines(name,live,homeScore||awayScore),overs:'',batsmen:[],bowler:'',bowlerStats:{},lastBalls:[],innings:'',providerUpdatedAt:Date.now()});
    }
    return out;
  }catch{return []}
}
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
    const score=String(m?.score||m?.score_text||'');
    const scoreParts=score.split(/\s+-\s+/);
    const clean=v=>{const x=String(v??'').trim();return !x||x==='—'||x==='-'||x.toLowerCase()==='n/a'?'':x};
    const status=String(m?.status||'UPCOMING').toLowerCase();
    return {id,name:teams,home:parts[0]||teams,away:parts.slice(1).join(' v ')||'',homeScore:clean(scoreParts[0]),awayScore:clean(scoreParts[1]),score,scoreDisplay:clean(scoreParts[0])&&clean(scoreParts[1])?`${clean(scoreParts[0])} - ${clean(scoreParts[1])}`:'SCORE PENDING FROM PROVIDER',status,statusText:status,time:m?.updated_at?new Date(Number(m.updated_at)).toISOString():'',competition:m?.competition||'',homeLogo:m?.home_logo||'',awayLogo:m?.away_logo||'',competitionLogo:m?.competition_logo||'',matchUrl:m?.url||'',live:status==='live',sessions:m?.sessions||{},overs:m?.overs||m?.current_overs||'',batsmen:Array.isArray(m?.batsmen)?m.batsmen:(Array.isArray(m?.players)?m.players:[]),bowler:m?.bowler||m?.current_bowler||'',bowlerStats:m?.bowler_stats||m?.bowlerStats||{},lastBalls:Array.isArray(m?.last_balls)?m.last_balls:[],innings:m?.innings||'',providerUpdatedAt:m?.updated_at||0};
  }).sort((a,b)=>{const rank=s=>s==='live'?0:s==='upcoming'?1:2;return rank(a.status)-rank(b.status)});
}
function firebaseIsFresh(snapshot){
  const stamp=Number(snapshot?.newestUpdate)||0;
  return stamp>0&&(Date.now()-stamp)<120000;
}
function newRound(key,seconds=GAME_DEFS[key]?.duration||30){const def=GAME_DEFS[key]||{duration:seconds,lockSeconds:4};const r={gameKey:key,roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:seconds,duration:seconds,lockSeconds:def.lockSeconds,forcedWinner:null,startedAt:Date.now()};rounds[key]=r;persist();return r}
function currentRound(key){const def=GAME_DEFS[key]||{duration:30,lockSeconds:4,resultHold:7000};let r=rounds[key]||newRound(key,def.duration);let elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);let lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds));if(r.phase==='betting'&&elapsed>=lockAt){r.phase='locked';r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.lockedAt=r.startedAt+lockAt*1000;persist()}if(r.phase==='locked'&&elapsed>=(r.duration||def.duration)){r=newRound(key,def.duration);elapsed=0;lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds))}if(r.phase==='result'&&Date.now()-(r.resultAt||r.startedAt||0)>=(def.resultHold??7000)){r=newRound(key,def.duration);elapsed=0;lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds))}r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.betTimer=Math.max(0,lockAt-elapsed);return r}
function snapshot(){const out={};for(const key of Object.keys(GAME_DEFS))out[key]={...currentRound(key)};return out}
function resultSideValid(key,side){const sides={'andar-bahar':['Andar','Bahar'],lucky7:['7 UP','7','7 DOWN'],'teen-patti':['Team A','Team B'],'dragon-tiger':['Dragon','Tie','Tiger']};return sides[key]?.includes(side)}
async function fetchCricket(){
  if(Date.now()-cricketCache.updated<30000&&cricketCache.matches.length)return cricketCache;
  const cricbuzz=await fetchCricbuzzLive();
  if(cricbuzz.length){cricketCache={matches:cricbuzz,updated:Date.now(),source:'cricbuzz-live',error:null,meta:{provider:'Cricbuzz'}};return cricketCache;}
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
  if(u.pathname==='/api/login'&&req.method==='POST'){
    const body=await readBody(req);const account=findAccount(body.username??body.id,body.password??body.pass);
    if(!account||account.status==='blocked'||account.status==='suspended')return json(res,401,{ok:false,error:account?'account blocked':'invalid credentials'});
    const expected=String(body.role||'').toLowerCase();
    if(expected&&expected!==String(account.role||'').toLowerCase())return json(res,403,{ok:false,error:'wrong role',user:publicUser(account)});
    const token=Buffer.from(JSON.stringify({id:account.id,role:account.role,iat:Date.now()})).toString('base64url');
    return json(res,200,{ok:true,user:publicUser(account),token});
  }
  if(u.pathname==='/api/marquee'&&req.method==='GET')return json(res,200,{text:marquee});
  if(u.pathname==='/api/marquee'&&req.method==='POST'){const body=await readBody(req);const text=String(body.text||'').trim().slice(0,120);if(!text)return json(res,400,{ok:false,error:'text required'});marquee=text;persistMarquee();return json(res,200,{ok:true,text:marquee})}
  if(u.pathname==='/api/cricket/matches'&&req.method==='GET'){const feed=await fetchCricket();return json(res,feed.matches.length?200:502,{source:feed.source||'unknown',updated:feed.updated,matches:feed.matches,meta:feed.meta||null,error:feed.matches.length?null:'Live cricket feed unavailable'})}
  if(u.pathname==='/api/cricket/sessions'&&req.method==='GET'){const feed=await fetchCricket();const matchName=u.searchParams.get('match')||'';if(!feed.matches.length)return json(res,502,{ok:false,error:'SportScore feed unavailable',sessions:[]});const match=feed.matches.find(m=>m.name===matchName);if(!match)return json(res,404,{ok:false,error:'Match not found',sessions:[]});return json(res,200,{ok:true,source:feed.source||'unknown',match:match.name,matchStatus:match.status,matchLive:match.live,updated:feed.updated,sessions:cricketSessions(match.name)})}
  if(u.pathname==='/api/live-rounds'&&req.method==='GET')return json(res,200,snapshot());
  const force=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/force$/);
  if(force&&req.method==='POST'){const key=decodeURIComponent(force[1]);const body=await readBody(req);if(!GAME_DEFS[key]||!resultSideValid(key,body.side))return json(res,400,{ok:false,error:'invalid game or side'});const r=currentRound(key);r.forcedWinner=body.side;rounds[key]=r;persist();return json(res,200,{ok:true,round:r})}
  const fresh=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/new$/);
  if(fresh&&req.method==='POST'){const key=decodeURIComponent(fresh[1]);if(!GAME_DEFS[key])return json(res,404,{ok:false,error:'unknown game'});return json(res,200,{ok:true,round:newRound(key,GAME_DEFS[key].duration)})}
  const result=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/result$/);
  if(result&&req.method==='POST'){
    const key=decodeURIComponent(result[1]);const body=await readBody(req);const winner=String(body.winner||'');
    if(!GAME_DEFS[key]||!resultSideValid(key,winner))return json(res,400,{ok:false,error:'invalid result'});
    const r=currentRound(key);r.phase='result';r.result=winner;r.resultAt=Date.now();r.timer=0;rounds[key]=r;persist();
    return json(res,200,{ok:true,round:r});
  }
  if(u.pathname==='/api/users'&&req.method==='GET'){return json(res,200,{ok:true,users:loadUsersFile(),savedAt:fs.statSync(usersFile).mtimeMs})}
  if(u.pathname==='/api/users'&&req.method==='POST'){const body=await readBody(req);const users=body.users||body;if(!users||typeof users!=='object')return json(res,400,{ok:false,error:'invalid users payload'});const base=loadUsersFile();const normalized={...base,...users,superMaster:users.superMaster||base.superMaster,superMasters:users.superMasters||base.superMasters,masters:users.masters||{},agents:users.agents||{},players:users.players||{}};saveUsersFile(normalized);mirrorUsersToFirebase(normalized);return json(res,200,{ok:true,savedAt:fs.statSync(usersFile).mtimeMs})}
  if(u.pathname==='/api/live-bets'&&req.method==='GET')return json(res,200,{ok:true,bets:liveBets.slice(0,500)});
  if(u.pathname==='/api/live-bets'&&req.method==='POST'){
    const body=await readBody(req);if(!body.player||!body.gameKey||!body.roundId)return json(res,400,{ok:false,error:'gameKey, roundId and player required'});
    const bet={...body,id:String(body.id||'B'+Date.now().toString(36).toUpperCase()),status:body.status||'open',ts:Number(body.ts)||Date.now()};
    liveBets=liveBets.filter(x=>x.id!==bet.id);liveBets.unshift(bet);persistBets();return json(res,200,{ok:true,bet});
  }
  if(u.pathname==='/api/bets-settle'&&req.method==='POST'){
    const body=await readBody(req);if(!body.id)return json(res,400,{ok:false,error:'bet id required'});
    const current=liveBets.find(x=>x.id===body.id);const bet={...(current||{}),...body,status:body.status||current?.status||'pending',ts:Number(body.ts)||current?.ts||Date.now()};
    liveBets=liveBets.filter(x=>x.id!==bet.id);liveBets.unshift(bet);persistBets();return json(res,200,{ok:true,bet});
  }
  if(u.pathname==='/api/firebase/live'&&req.method==='GET'){const data=await fetchFirebaseLive();if(!data)return json(res,502,{ok:false,error:'firebase unavailable'});return json(res,200,{ok:true,live_matches:data.live_matches,meta:data.meta,newestUpdate:data.newestUpdate,fresh:firebaseIsFresh(data)})}
  return serveStatic(req,res,u);
}catch(err){console.error(err);return json(res,500,{ok:false,error:'server error'})}});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`AntPro shared demo listening on ${port}`));
