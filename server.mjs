import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data');
const roundsFile=path.join(dataDir,'live-rounds.json');
const marqueeFile=path.join(dataDir,'marquee.json');
const usersFile=path.join(dataDir,'users.json');
const FIREBASE_DB=process.env.FIREBASE_DATABASE_URL||'https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app';
fs.mkdirSync(dataDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const GAME_DEFS={'andar-bahar':{duration:30,lockSeconds:5},lucky7:{duration:15,lockSeconds:4},'teen-patti':{duration:20,lockSeconds:4},'dragon-tiger':{duration:15,lockSeconds:4}};
const SPORT_SCORE_URL='https://sportscore.com/api/widget/matches/?sport=cricket&limit=20';
let rounds={};try{rounds=JSON.parse(fs.readFileSync(roundsFile,'utf8'))||{}}catch{rounds={}}
let marquee='🌹 JAI SHREE SHYAM 🌹';try{marquee=JSON.parse(fs.readFileSync(marqueeFile,'utf8')).text||marquee}catch{}
let cricketCache={matches:[],updated:0,error:null};
function persist(){const tmp=roundsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rounds,null,2));fs.renameSync(tmp,roundsFile)}
function persistMarquee(){const tmp=marqueeFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({text:marquee},null,2));fs.renameSync(tmp,marqueeFile)}
function defaultUsers(){return {superMaster:{id:'SUPER',name:'Super Master',role:'supermaster',pass:'super123',chips:0},masters:{MASTER:{id:'MASTER',name:'Master One',role:'master',pass:'master123',chips:100000,commission:5,share:95,superId:'SUPER',agents:['A1001','A1002']},MASTER2:{id:'MASTER2',name:'Master Two',role:'master',pass:'master123',chips:80000,commission:5,share:95,superId:'SUPER',agents:[]}},agents:{A1001:{id:'A1001',name:'Agent-01',role:'agent',pass:'agent123',chips:50000,commission:10,share:20,masterId:'MASTER',players:['P2001','P2002']},A1002:{id:'A1002',name:'Agent-02',role:'agent',pass:'agent123',chips:25000,commission:8,share:15,masterId:'MASTER',players:['P2003']}},players:{P2001:{id:'P2001',name:'Player One',role:'player',pass:'play123',chips:5000,agentId:'A1001'},P2002:{id:'P2002',name:'Player Two',role:'player',pass:'play123',chips:3200,agentId:'A1001'},P2003:{id:'P2003',name:'Player Three',role:'player',pass:'play123',chips:1500,agentId:'A1002'}}};}
function loadUsersFile(){try{const u=JSON.parse(fs.readFileSync(usersFile,'utf8'));if(u&&u.superMaster)return u}catch{}const d=defaultUsers();try{fs.writeFileSync(usersFile,JSON.stringify(d,null,2))}catch{}return d}
function saveUsersFile(u){const tmp=usersFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(u,null,2));fs.renameSync(tmp,usersFile)}
async function mirrorUsersToFirebase(u){try{await fetch(FIREBASE_DB+'/users.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)})}catch(e){console.warn('firebase users mirror failed',e.message)}}
async function fetchFirebaseLive(){try{const r=await fetch(FIREBASE_DB+'/live_matches.json',{signal:AbortSignal.timeout(8000)});if(!r.ok)return null;return await r.json()}catch{return null}}
function newRound(key,seconds=GAME_DEFS[key]?.duration||30){const def=GAME_DEFS[key]||{duration:seconds,lockSeconds:4};const r={gameKey:key,roundId:'R-'+Date.now().toString(36).toUpperCase(),phase:'betting',timer:seconds,duration:seconds,lockSeconds:def.lockSeconds,forcedWinner:null,startedAt:Date.now()};rounds[key]=r;persist();return r}
function currentRound(key){const def=GAME_DEFS[key]||{duration:30,lockSeconds:4};let r=rounds[key]||newRound(key,def.duration);let elapsed=Math.floor((Date.now()-(r.startedAt||Date.now()))/1000);let lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds));if(r.phase==='betting'&&elapsed>=lockAt){r.phase='locked';r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.lockedAt=r.startedAt+lockAt*1000;persist()}if(r.phase==='locked'&&elapsed>=(r.duration||def.duration)){r=newRound(key,def.duration);elapsed=0;lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds))}if(r.phase==='result'&&Date.now()-(r.resultAt||r.startedAt||0)>=7000){r=newRound(key,def.duration);elapsed=0;lockAt=Math.max(0,(r.duration||def.duration)-(r.lockSeconds??def.lockSeconds))}r.timer=Math.max(0,(r.duration||def.duration)-elapsed);r.betTimer=Math.max(0,lockAt-elapsed);return r}
function snapshot(){const out={};for(const key of Object.keys(GAME_DEFS))out[key]={...currentRound(key)};return out}
async function fetchCricket(){
  if(Date.now()-cricketCache.updated<30000&&cricketCache.matches.length)return cricketCache;
  try{
    const response=await fetch(SPORT_SCORE_URL,{headers:{'user-agent':'AntPro-Demo/1.0','accept':'application/json'}});
    if(!response.ok)throw new Error('SportScore HTTP '+response.status);
    const data=await response.json();
    const matches=(data.matches||[]).map((m,i)=>({id:i,name:(m.home||'?')+' v '+(m.away||'?'),home:m.home||'',away:m.away||'',homeScore:m.home_score||'—',awayScore:m.away_score||'—',status:(m.status||'').toLowerCase(),statusText:m.status_text||m.status||'',time:m.time||'',competition:m.competition||'',homeLogo:m.home_logo||'',awayLogo:m.away_logo||'',competitionLogo:m.competition_logo||'',url:m.url||'',live:(m.status||'').toLowerCase()==='live'}));
    matches.sort((a,b)=>{const rank=s=>s==='live'?0:s==='upcoming'?1:2;return rank(a.status)-rank(b.status)});
    cricketCache={matches,updated:Date.now(),error:null};
  }catch(error){cricketCache.error=String(error);if(!cricketCache.matches.length)cricketCache.updated=Date.now()}
  return cricketCache;
}
function hashKey(value){let h=2166136261;for(const ch of value){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function cricketSessions(matchName){
  const key=String(matchName||'').trim();const seed=hashKey(key);const n=(min,span,offset=0)=>min+((seed+offset)%span);
  const live=cricketCache.matches.find(m=>m.name===key);
  const open=!!(live&&live.live&&live.status==='live');
  const status=open?'OPEN':'SUSPENDED';
  const home=(live?.home||key.split(' v ')[0]||'TEAM').slice(0,8).toUpperCase();
  const sessions=[
    ['6 OVER RUN '+home,42,45],['10 OVER RUN '+home,68,72],['15 OVER RUN '+home,95,100],['20 OVER RUN '+home,125,132],['FALL OF 1ST WKT',18,22],['MATCH 1ST INNING TOTAL',140,155]
  ];
  return sessions.map((x,i)=>({id:i,name:x[0],not:x[1]+(n(0,8,i*7)%8),yes:x[2]+(n(0,7,i*11)%7),rate:(1.8+((n(0,40,i*13)%40)/100)).toFixed(2),status,source:'sportscore-status',updated:cricketCache.updated}));
}
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(payload))}
function readBody(req){return new Promise(resolve=>{let raw='';req.on('data',c=>{raw+=c.toString();if(raw.length>10000)req.destroy()});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{resolve({})}});req.on('error',()=>resolve({}))})}
function serveStatic(req,res,u){let rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\//,'');let file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');try{const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-cache'});res.end(data)}catch{res.writeHead(500);res.end('error')}}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');try{
  if(u.pathname==='/api/health')return json(res,200,{ok:true,service:'antpro-demo',time:Date.now(),cricketFeed:'sportscore'});
  if(u.pathname==='/api/marquee'&&req.method==='GET')return json(res,200,{text:marquee});
  if(u.pathname==='/api/marquee'&&req.method==='POST'){const body=await readBody(req);const text=String(body.text||'').trim().slice(0,120);if(!text)return json(res,400,{ok:false,error:'text required'});marquee=text;persistMarquee();return json(res,200,{ok:true,text:marquee})}
  if(u.pathname==='/api/cricket/matches'&&req.method==='GET'){const feed=await fetchCricket();return json(res,feed.matches.length?200:502,{source:'sportscore',updated:feed.updated,matches:feed.matches,error:feed.matches.length?null:'SportScore feed unavailable'})}
  if(u.pathname==='/api/cricket/sessions'&&req.method==='GET'){const feed=await fetchCricket();const matchName=u.searchParams.get('match')||'';if(!feed.matches.length)return json(res,502,{ok:false,error:'SportScore feed unavailable',sessions:[]});const match=feed.matches.find(m=>m.name===matchName);if(!match)return json(res,404,{ok:false,error:'Match not found',sessions:[]});return json(res,200,{ok:true,source:'sportscore',match:match.name,matchStatus:match.status,matchLive:match.live,updated:feed.updated,sessions:cricketSessions(match.name)})}
  if(u.pathname==='/api/live-rounds'&&req.method==='GET')return json(res,200,snapshot());
  const force=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/force$/);
  if(force&&req.method==='POST'){const key=decodeURIComponent(force[1]);const body=await readBody(req);const r=currentRound(key);if(!GAME_DEFS[key]||typeof body.side!=='string')return json(res,400,{ok:false,error:'invalid game or side'});r.forcedWinner=body.side;rounds[key]=r;persist();return json(res,200,{ok:true,round:r})}
  const fresh=u.pathname.match(/^\/api\/live-rounds\/([^/]+)\/new$/);
  if(fresh&&req.method==='POST'){const key=decodeURIComponent(fresh[1]);if(!GAME_DEFS[key])return json(res,404,{ok:false,error:'unknown game'});return json(res,200,{ok:true,round:newRound(key,GAME_DEFS[key].duration)})}
  if(u.pathname==='/api/users'&&req.method==='GET'){return json(res,200,{ok:true,users:loadUsersFile()})}
  if(u.pathname==='/api/users'&&req.method==='POST'){const body=await readBody(req);const users=body.users||body;if(!users||!users.superMaster)return json(res,400,{ok:false,error:'invalid users payload'});saveUsersFile(users);mirrorUsersToFirebase(users);return json(res,200,{ok:true})}
  if(u.pathname==='/api/firebase/live'&&req.method==='GET'){const data=await fetchFirebaseLive();if(!data)return json(res,502,{ok:false,error:'firebase unavailable'});return json(res,200,{ok:true,live_matches:data})}
  return serveStatic(req,res,u);
}catch(err){console.error(err);return json(res,500,{ok:false,error:'server error'})}});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`AntPro shared demo listening on ${port}`));
