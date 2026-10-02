import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data');
const roundsFile=path.join(dataDir,'live-rounds.json');
const marqueeFile=path.join(dataDir,'marquee.json');
const usersFile=path.join(dataDir,'users.json');
const rawFirebaseDb=process.env.FIREBASE_DATABASE_URL||'https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_DB=(rawFirebaseDb.match(/https?:\/\/[^\s\]\)\"']+/)||[rawFirebaseDb])[0].replace(/\/$/,'');
fs.mkdirSync(dataDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const GAME_DEFS={'andar-bahar':{duration:20,lockSeconds:5},lucky7:{duration:15,lockSeconds:4},'teen-patti':{duration:20,lockSeconds:5},'dragon-tiger':{duration:15,lockSeconds:4}};
const SPORT_SCORE_URL='https://sportscore.com/api/widget/matches/?sport=cricket&limit=20';
let rounds={};try{rounds=JSON.parse(fs.readFileSync(roundsFile,'utf8'))||{}}catch{rounds={}}
let marquee='🌹 JAI SHREE SHYAM 🌹';try{marquee=JSON.parse(fs.readFileSync(marqueeFile,'utf8')).text||marquee}catch{}
let cricketCache={matches:[],updated:0,error:null};
function persist(){const tmp=roundsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rounds,null,2));fs.renameSync(tmp,roundsFile)}
function persistMarquee(){const tmp=marqueeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({text:marquee},null,2));fs.renameSync(tmp,marqueeFile)}
function defaultUsers(){return {superMaster:null,superMasters:{},masters:{MASTER:{id:'MASTER',name:'Root Master',role:'master',pass:'master123',chips:0,agents:[],status:'active'}},agents:{},players:{}};}
function loadUsersFile(){try{const u=JSON.parse(fs.readFileSync(usersFile,'utf8'));if(u&&u.masters?.MASTER)return u}catch{}const d=defaultUsers();try{fs.writeFileSync(usersFile,JSON.stringify(d,null,2))}catch{}return d}
function normalizeUsers(u){u=u||{};u.superMasters=u.superMasters||{};u.masters=u.masters||{};u.agents=u.agents||{};u.players=u.players||{};if(!u.masters.MASTER)u.masters.MASTER={id:'MASTER',name:'Root Master',role:'master',pass:'master123',chips:0,agents:[],status:'active'};Object.values(u.masters).forEach(m=>{m.agents=[];m.superMasters=[];m.share=typeof m.share==='number'?m.share:100});Object.values(u.superMasters).forEach(sm=>{sm.agents=[];sm.share=typeof sm.share==='number'?sm.share:0;const m=u.masters[sm.parentMasterId||'MASTER'];if(m)m.superMasters.push(sm.id)});Object.values(u.agents).forEach(a=>{a.players=[];a.share=typeof a.share==='number'?a.share:0;const m=u.masters[a.masterId||'MASTER'];if(m&&!m.agents.includes(a.id))m.agents.push(a.id);const sm=u.superMasters[a.superId];if(sm&&!sm.agents.includes(a.id))sm.agents.push(a.id)});Object.values(u.players).forEach(p=>{p.share=typeof p.share==='number'?p.share:0;const a=u.agents[p.agentId];if(a&&!a.players.includes(p.id))a.players.push(p.id)});return u}
function mergeUsers(current,incoming){const merged={...(current||{}),...(incoming||{})};for(const bucket of ['masters','superMasters','agents','players'])merged[bucket]={...((current&&current[bucket])||{}),...((incoming&&incoming[bucket])||{})};if(!incoming?.superMaster&&current?.superMaster)merged.superMaster=current.superMaster;return normalizeUsers(merged)}
function saveUsersFile(u){u=normalizeUsers(u);const tmp=usersFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(u,null,2));fs.renameSync(tmp,usersFile)}
async function mirrorUsersToFirebase(u){try{await fetch(FIREBASE_DB+'/users.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)})}catch(e){console.warn('firebase users mirror failed',e.message)}}
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
  return stamp>0&&(Date.now()-stamp)<120000;
}
function newRound(key,seconds=GAME_DEFS[key]?.duration||30){const def=GAME_DEFS[key]||{duration:seconds,lockSeconds:4};const r={gameKey:key,roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:seconds,duration:seconds,lockSeconds:def.lockSeconds,forcedWinner:null,startedAt:Date.now()};rounds[key]=r;persist();return r}
function currentRound(key){const def=GAME_DEFS[key]||{duration:30,lockSeconds:4};let r=rounds[key]||newRound(key,def.duration);let elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);let lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds));if(r.phase==='betting'&&elapsed>=lockAt){r.phase='locked';r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.lockedAt=r.startedAt+lockAt*1000;persist()}if(r.phase==='locked'&&elapsed>=(r.duration||def.duration)){r.timer=0;r.betTimer=0}if(r.phase==='result'&&Date.now()-(r.resultAt||r.startedAt||0)>=7000){r=newRound(key,def.duration);elapsed=0;lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds))}r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.betTimer=Math.max(0,lockAt-elapsed);return r}
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
  if(u.pathname==='/api/live-rounds'&&req.method==='GET')return json(res,200,snapshot());
  const force=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/force$/);
  if(force&&req.method==='POST'){const key=decodeURIComponent(force[1]);const body=await readBody(req);const r=currentRound(key);if(!GAME_DEFS[key]||typeof body.side!=='string')return json(res,400,{ok:false,error:'invalid game or side'});r.forcedWinner=body.side;rounds[key]=r;persist();return json(res,200,{ok:true,round:r})}
  const fresh=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/new$/);
  if(fresh&&req.method==='POST'){const key=decodeURIComponent(fresh[1]);if(!GAME_DEFS[key])return json(res,404,{ok:false,error:'unknown game'});return json(res,200,{ok:true,round:newRound(key,GAME_DEFS[key].duration)})}
  if(u.pathname==='/api/users'&&req.method==='GET'){return json(res,200,{ok:true,users:loadUsersFile()})}
  if(u.pathname==='/api/users'&&req.method==='POST'){const body=await readBody(req);const users=body.users||body;if(!users||!users.masters?.MASTER)return json(res,400,{ok:false,error:'invalid users payload'});const merged=mergeUsers(loadUsersFile(),users);saveUsersFile(merged);mirrorUsersToFirebase(merged);return json(res,200,{ok:true})}
  if(u.pathname==='/api/firebase/live'&&req.method==='GET'){const data=await fetchFirebaseLive();if(!data)return json(res,502,{ok:false,error:'firebase unavailable'});return json(res,200,{ok:true,live_matches:data.live_matches,meta:data.meta,newestUpdate:data.newestUpdate,fresh:firebaseIsFresh(data)})}
  return serveStatic(req,res,u);
}catch(err){console.error(err);return json(res,500,{ok:false,error:'server error'})}});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`AntPro shared demo listening on ${port}`));
