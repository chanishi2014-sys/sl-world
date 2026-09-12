"use strict";
// ==================== CONFIG (all provisional balance values) ====================
const CONFIG = {
 version:"process-engine-20260912-night-v2", tactics:{enabled:true}, innings:9, maxPitchesPerAction:20000,
 defaults:{meet:5,power:100,speed:10,velocity:140,control:100,stamina:100},
 ranges:{meet:[1,10],power:[1,200],speed:[1,20],velocity:[80,165],control:[1,200],stamina:[1,200]},
 // Per-family profiles can later be overridden by pitch.name, without changing the player DB.
 pitch:{weights:{straight:6,slow:1,moving:2,breaking:2},jitter:2,
  profiles:{straight:{speedOffset:0,quality:0,movement:0},slow:{speedOffset:-30,quality:.12,movement:.15},moving:{speedOffset:-2,quality:.025,movement:.25},breaking:{speedOffset:-15,quality:.10,movement:null}},
  qualityBase:.10,velocityWeight:.60,controlWeight:.12,movementWeight:.10,noise:.12,
  mistakeBase:.025,mistakeControl:.14,mistakeLoss:.22,excellentChance:.035,excellentBonus:.18,
  movementControlCost:.08,movementNoise:.12,movementExecutionBase:.35,movementExecutionControl:.65},
 fatigue:{baseBudget:45,staminaBudget:.65,window:80,speedLoss:4,controlLoss:.12,qualityLoss:.035},
 judgment:{zoneBase:.44,zoneControl:.24,zoneMin:.30,zoneMax:.78,inZoneSwing:.72,chase:.19,
  protectZone:.09,protectChase:.08,threeBallPatience:.05,mistakeAttack:.10,deceptionChase:.06},
 // Lower the small-gap slope; the cubic term retains the extreme-gap advantage.
 contact:{baseLogit:1.45,duelWeight:2.8,gapCurve:.90,chasePenalty:.65,min:.12,max:.975,foulBase:.29,foulDifficulty:.12,foulMin:.18,foulMax:.42},
 batted:{qualityBase:.48,meetWeight:.32,powerWeight:.23,pitchWeight:.60,gapCompression:.82,extremeGap:.40,noise:.18,
  thresholds:{perfect:.82,strong:.62,normal:.38,jammed:.18}
  },
};
const STORAGE_KEY="sl_world_players_v01";
const PITCH_CATALOG={straight:["ツーシーム","ムービングファスト"],slider:["スライダー","Hスライダー","カットボール"],curve:["カーブ","スローカーブ","Sスライダー","Dカーブ","スラーブ","ナックルカーブ"],fork:["フォーク","SFF","Vスライダー","チェンジアップ","パーム","ナックル"],sinker:["シンカー","スクリュー","Hシンカー"],shoot:["シュート","Hシュート","シンキングファスト"]};
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// ==================== player / team adapter (never writes storage) ====================
function readDB(storage){
 try{const raw=storage.getItem(STORAGE_KEY);if(!raw)return {players:[],message:"選手DBなし：TEST PLAYERで試合を構成"};const parsed=JSON.parse(raw);const list=Array.isArray(parsed)?parsed:parsed.players;if(!Array.isArray(list))throw Error("配列ではありません");return {players:list.filter(p=>p&&typeof p==="object"&&!Array.isArray(p)),message:`DB ${list.length}人を読取（書込なし）`};}
 catch(e){return {players:[],message:"選手DBを読めません：TEST PLAYERで継続（元データは未変更）"};}
}
function adaptPlayer(raw,key,cfg){
 const effective={},fallbacks=[];
 for(const stat of Object.keys(cfg.defaults)){
  const group=["meet","power","speed"].includes(stat)?raw.batting:raw.pitching;
  const value=group?.[stat];const valid=typeof value==="number"&&Number.isFinite(value);
  effective[stat]=valid?value:cfg.defaults[stat];if(!valid)fallbacks.push(stat);
 }
 const repertoire=[{name:"ストレート",family:"standard",breakAmount:null,kind:"straight"},{name:"スローボール",family:"standard",breakAmount:null,kind:"slow"}];
 for(const [family,names]of Object.entries(PITCH_CATALOG)){
  const entries=raw.pitchRepertoire?.[family];if(!Array.isArray(entries))continue;
  for(const entry of entries){if(!entry||!names.includes(entry.name)||repertoire.some(x=>x.name===entry.name))continue;
   repertoire.push({name:entry.name,family,kind:family==="straight"?"moving":"breaking",breakAmount:family!=="straight"&&Number.isInteger(entry.breakAmount)&&entry.breakAmount>=1&&entry.breakAmount<=7?entry.breakAmount:null});}
 }
 return {key,id:raw.id??null,name:String(raw.name||"名称未設定"),isTest:raw.isTest===true,isPitcher:raw.isPitcher===true,effective,fallbacks,repertoire,
  specials:Array.isArray(raw.specials)?[...raw.specials]:[],pitcherRoles:Array.isArray(raw.pitcherRoles)?[...raw.pitcherRoles]:[],profile:clone(raw)};
}
function makeTeam(name,side,db,cfg){
 const roster=db.filter(p=>p.team===name);const starterIndex=roster.findIndex(p=>p.isPitcher===true);
 const selected=roster.filter((p,i)=>i!==starterIndex).slice(0,8);
 function test(index,pitcher=false){return {id:`TEST_${side}_${index}`,name:`TEST PLAYER ${side.toUpperCase()} ${index}`,team:name,isTest:true,isFielder:!pitcher,isPitcher:pitcher,batting:{meet:cfg.defaults.meet,power:cfg.defaults.power,speed:cfg.defaults.speed},pitching:pitcher?{velocity:cfg.defaults.velocity,control:cfg.defaults.control,stamina:cfg.defaults.stamina}:{},pitchRepertoire:{}};}
 while(selected.length<8)selected.push(test(selected.length+1));
 selected.push(starterIndex>=0?roster[starterIndex]:test(9,true));
 const lineup=selected.map((p,i)=>adaptPlayer(p,`${side}_${i}`,cfg));
 const bench=roster.filter(p=>!selected.includes(p)).map((p,i)=>adaptPlayer(p,`${side}_bench_${i}`,cfg)); return {name,lineup,bench,pitcher:lineup[8],rosterCount:roster.length,testCount:lineup.filter(p=>p.isTest).length};
}
// ==================== RNG (seeded, no Math.random / wall clock) ====================
function createRNG(seed){let value=2166136261;for(const ch of String(seed)){value^=ch.charCodeAt(0);value=Math.imul(value,16777619);}const rng=()=>{value=(value+0x6D2B79F5)|0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};rng.getState=()=>value;rng.setState=n=>{value=n|0;};return rng;}
function weighted(rng,entries){const sum=entries.reduce((n,[,w])=>n+w,0);let n=rng()*sum;for(const [item,w]of entries){n-=w;if(n<0)return item;}return entries.at(-1)[0];}
// ==================== game state / statistics ====================
function newGame(teams,seed,cfg=CONFIG){
 const state={inning:1,half:"top",outs:0,balls:0,strikes:0,bases:[null,null,null],score:[0,0],hits:[0,0],errors:[0,0],virtualOuts:0,unearned:{},playActions:[],lines:[Array(9).fill(null),Array(9).fill(null)],order:[0,0],paCompleted:0,finished:false,finishReason:null,events:[],batting:{},pitching:{}};
 state.lines[0][0]=0;
 teams.forEach(t=>{[...t.lineup,...(t.bench||[])].forEach(p=>state.batting[p.key]={AB:0,H:0,doubles:0,triples:0,HR:0,RBI:0,BB:0,K:0,R:0,SB:0,CS:0,SF:0,SH:0});state.pitching[t.pitcher.key]={outs:0,pitches:0,H:0,HR:0,R:0,ER:0,BB:0,K:0};});
 return {teams:clone(teams),seed:String(seed),config:clone(cfg),rng:createRNG(seed),tacticalRng:createRNG(String(seed)+"|tactics-alpha1"),state};
}
const offense=g=>g.state.half==="top"?0:1;
const currentBatter=g=>g.teams[offense(g)].lineup[g.state.order[offense(g)]];
const currentPitcher=g=>g.teams[1-offense(g)].pitcher;
const identity=p=>p?{key:p.key,id:p.id,name:p.name,isTest:p.isTest}:null;
const runners=s=>s.bases.map(identity);
function scaled(player,stat,cfg){const [lo,hi]=cfg.ranges[stat];return (clamp(player.effective[stat],lo,hi)-lo)/(hi-lo);}
function finish(g,reason){g.state.finished=true;g.state.finishReason=reason;}
// ==================== baserunning (players, not booleans) ====================
function creditRun(g,runner,batter,pitcher){const s=g.state,side=offense(g);s.score[side]++;s.lines[side][s.inning-1]++;s.batting[runner.key].R++;if(batter&&!s.suppressRBI)s.batting[batter.key].RBI++;s.pitching[pitcher.key].R++;
 // Provisional accounting; preserve error context for future inning reconstruction.
 if(!s.unearned[runner.key]&&s.virtualOuts<3)s.pitching[pitcher.key].ER++;
 SL_FIELDING.move(g,runner,(s.playBefore?.findIndex(r=>r?.key===runner.key)??-1)+1,4,"safe","scoringPlay");}
function walkOff(g){const s=g.state;return s.inning===g.config.innings&&s.half==="bottom"&&s.score[1]>s.score[0];}
// A confirmed fence crossing awards four bases by rule. All live-ball advances
// are resolved by SL_FIELDING.process; this helper cannot prescribe hit bases.
function advanceHit(g,batter,pitcher,bases){if(bases!==4)throw Error('Live-ball advances require the process resolver');const previous=[...g.state.bases];g.state.bases=[null,null,null];for(let i=2;i>=0;i--)if(previous[i])creditRun(g,previous[i],batter,pitcher);creditRun(g,batter,batter,pitcher);if(walkOff(g))finish(g,'walkoff');}
function advanceWalk(g,batter,pitcher){const s=g.state;if(s.bases[0]){if(s.bases[1]){if(s.bases[2])creditRun(g,s.bases[2],batter,pitcher);s.bases[2]=s.bases[1];}s.bases[1]=s.bases[0];}s.bases[0]=batter;if(walkOff(g))finish(g,"walkoff");}
// ==================== individual special-effect extension points ====================
// Empty in this alpha: all stored specials remain intact, but none receive an invented effect.
// A future handler is keyed by a special ability, not a player/team/league name.
// Return additive deltas: quality scores, judgment probability, contact logit,
// extra-base weight multiplier and baserunning probability, respectively.
const SPECIAL_EFFECT_HANDLERS=Object.create(null);
function specialModifiers(batter,pitcher){
 const effects={pitchQuality:0,judgment:0,contact:0,battedQuality:0,extraBase:0,baserunning:0};
 for(const [role,player] of [["batter",batter],["pitcher",pitcher]]){
  for(const ability of player?.specials||[]){const handler=SPECIAL_EFFECT_HANDLERS[ability];if(typeof handler!=="function")continue;
   const changes=handler({role,player,batter,pitcher})||{};
   for(const key of Object.keys(effects))if(Number.isFinite(changes[key]))effects[key]+=changes[key];
  }
 }
 return effects;
}
const centeredNoise=rng=>rng()+rng()-1;
const logistic=x=>1/(1+Math.exp(-x));
// ==================== 1. pitch quality ====================
function generatePitchQuality(g,pitcher,effects){
 const c=g.config,pc=c.pitch,r=g.rng;
 const stamina=clamp(pitcher.effective.stamina,...c.ranges.stamina);
 const fatigue=clamp((g.state.pitching[pitcher.key].pitches-(c.fatigue.baseBudget+stamina*c.fatigue.staminaBudget))/c.fatigue.window,0,1);
 const pitch=weighted(r,pitcher.repertoire.map(p=>[p,pc.weights[p.kind]]));
 const profile=pc.profiles[pitch.kind];
 // Missing breaking amounts are explicitly neutral, not silently treated as level 7.
 const movement=profile.movement??(pitch.breakAmount===null?0:(pitch.breakAmount-1)/6);
 const control=clamp(scaled(pitcher,"control",c)-fatigue*c.fatigue.controlLoss,0,1);
 const effectiveControl=clamp(control-pc.movementControlCost*movement*(1-control),0,1);
 const movementExecution=movement*(pc.movementExecutionBase+pc.movementExecutionControl*control);
 const mistakeChance=pc.mistakeBase+pc.mistakeControl*(1-effectiveControl)**2;
 const isMistake=r()<mistakeChance,excellent=r()<pc.excellentChance;
 const pitchSpeed=Math.round((clamp(pitcher.effective.velocity,...c.ranges.velocity)+profile.speedOffset+(r()*2-1)*pc.jitter-fatigue*c.fatigue.speedLoss)*10)/10;
 const velocity=clamp((pitchSpeed-c.ranges.velocity[0])/(c.ranges.velocity[1]-c.ranges.velocity[0]),0,1);
 const pitchQuality=clamp(pc.qualityBase+pc.velocityWeight*velocity+pc.controlWeight*effectiveControl+profile.quality+pc.movementWeight*movementExecution
  -fatigue*c.fatigue.qualityLoss+(pc.noise+pc.movementNoise*movement*(1-control))*centeredNoise(r)+(excellent?pc.excellentBonus:0)-(isMistake?pc.mistakeLoss:0)+effects.pitchQuality,.02,.98);
 return {pitchType:pitch.name,pitchFamily:pitch.family,breakAmount:pitch.breakAmount,pitchSpeed,fatigue,effectiveControl,movement,movementExecution,mistakeChance,isMistake,excellent,pitchQuality};
}
// ==================== 2. judgment (independent of meet/power) ====================
function judgePitch(g,pitch,effects){
 const c=g.config.judgment,s=g.state;
 const zoneChance=clamp(c.zoneBase+c.zoneControl*pitch.effectiveControl,c.zoneMin,c.zoneMax);
 const inZone=g.rng()<zoneChance;
 // Count-based basic judgment; future plate-discipline/approach effects belong here.
 const swingChance=clamp(inZone
  ? c.inZoneSwing+(s.strikes===2?c.protectZone:0)-(s.balls===3?c.threeBallPatience:0)+(pitch.isMistake?c.mistakeAttack:0)
  : c.chase+(s.strikes===2?c.protectChase:0)-(s.balls===3?c.threeBallPatience:0)+c.deceptionChase*pitch.movementExecution-effects.judgment,.03,.97);
 return {zoneChance,inZone,swingChance,swing:g.rng()<swingChance};
}
// ==================== 3. contact duel ====================
function resolveContact(g,batter,pitch,effects){
 const c=g.config.contact,meet=scaled(batter,"meet",g.config),gap=meet-pitch.pitchQuality;
 const contactChance=clamp(logistic(c.baseLogit+c.duelWeight*(gap+c.gapCurve*gap**3)-(pitch.inZone?0:c.chasePenalty)+effects.contact),c.min,c.max);
 const foulChance=clamp(c.foulBase+c.foulDifficulty*(pitch.pitchQuality-meet),c.foulMin,c.foulMax);
 const outcome=!pitch.swing?(pitch.inZone?"calledStrike":"ball")
  :g.rng()>=contactChance?"swingingStrike":g.rng()<foulChance?"foul":"inPlay";
 return {contactChance,foulChance,outcome};
}
// ==================== 4. batted quality: centering, force, pitcher disruption ====================
function generateBattedQuality(g,batter,pitch,effects){
 const c=g.config.batted,meet=scaled(batter,"meet",g.config),power=scaled(batter,"power",g.config);
 // Compress small/mid individual matchup margins; restore full weight at extremeGap.
 const gap=c.meetWeight*(meet-.5)+c.powerWeight*(power-.5)-c.pitchWeight*(pitch.pitchQuality-.5);
 const gapScale=c.gapCompression+(1-c.gapCompression)*Math.min(1,(Math.abs(gap)/c.extremeGap)**2);
 const score=clamp(c.qualityBase+gap*gapScale+c.noise*centeredNoise(g.rng)+effects.battedQuality,0,1);
 const grade=Object.entries(c.thresholds).find(([,threshold])=>score>=threshold)?.[0]||"touch";
 return {score,grade};
}
// ==================== 5. final outcome conditioned on batted quality ====================
function resolveFinalResult(g,batter,pitch,ball,effects){
 return SL_FIELDING.process.generate(g,batter,ball,effects);
}
// Contact generation returns physical parameters, never an outcome prediction.
function resolveBattedBall(g,batter,pitch={pitchQuality:.5},effects=specialModifiers(batter,null)){
 return resolveFinalResult(g,batter,pitch,generateBattedQuality(g,batter,pitch,effects),effects);
}
function resolvePitch(g,pitcher,batter){
 const effects=specialModifiers(batter,pitcher);
 const pitch=generatePitchQuality(g,pitcher,effects);
 Object.assign(pitch,judgePitch(g,pitch,effects));
 Object.assign(pitch,resolveContact(g,batter,pitch,effects));
 return Object.assign(pitch,{battedResult:null,battedQuality:null,battedGrade:null,infieldHit:false},
  pitch.outcome==="inPlay"?resolveFinalResult(g,batter,pitch,generateBattedQuality(g,batter,pitch,effects),effects):{},
  {specialModifiers:effects});
}
// ==================== plate appearance / outs ====================
function recordOut(g,pitcher){if(g.state.outs>=3)return;g.state.outs++;g.state.virtualOuts++;g.state.pitching[pitcher.key].outs++;}
function completePA(g){const s=g.state,side=offense(g);s.order[side]=(s.order[side]+1)%9;s.paCompleted++;s.buntPlan=false;s.balls=0;s.strikes=0;}
function applyPitch(g,pitch,batter,pitcher){const s=g.state,bs=s.batting[batter.key],ps=s.pitching[pitcher.key];let result=pitch.outcome,ended=false;
 if(pitch.outcome==="ball"){s.balls++;if(s.balls===4){result="walk";bs.BB++;ps.BB++;advanceWalk(g,batter,pitcher);ended=true;}}
 else if(pitch.outcome==="foul"){if(s.strikes<2)s.strikes++;else if(pitch.buntAttempt){result="strikeout";bs.AB++;bs.K++;ps.K++;recordOut(g,pitcher);ended=true;pitch.log="スリーバント失敗、三振";}}
 else if(pitch.outcome==="calledStrike"||pitch.outcome==="swingingStrike"){s.strikes++;if(s.strikes===3){result="strikeout";bs.AB++;bs.K++;ps.K++;recordOut(g,pitcher);ended=true;}}
 else if(pitch.outcome==="inPlay"){
  bs.AB++;ended=true;
  if(!pitch.physical)Object.assign(pitch,SL_FIELDING.process.generate(g,batter,{score:pitch.battedQuality??.5,grade:pitch.battedGrade||'normal'}));
  result=SL_FIELDING.process.play(g,pitch,batter,pitcher);pitch.battedResult=result;
 }
 return {result,ended};
}
function switchHalf(g){const s=g.state;if(s.outs<3||s.finished)return;
 if(s.inning===g.config.innings){if(s.half==="top"&&s.score[1]>s.score[0]){finish(g,"homeLeadAfterTop9");return;}if(s.half==="bottom"){finish(g,s.score[0]===s.score[1]?"draw":"nineInnings");return;}}
 if(s.half==="top")s.half="bottom";else{s.half="top";s.inning++;}
 s.outs=0;s.buntPlan=false;s.lastStealPitch=null;s.virtualOuts=0;s.unearned={};s.balls=0;s.strikes=0;s.bases=[null,null,null];s.lines[offense(g)][s.inning-1]=0;
}
// ==================== event log (one immutable record per pitch) ====================
function onePitch(g){if(g.state.finished)return null;const operations=SL_TACTICS.prepare(g);const s=g.state,pitcher=currentPitcher(g),batter=currentBatter(g);
 s.playActions=[];s.playBefore=runners(s);
 const event={defensivePositions:SL_TACTICS.alignment(g).positions,outsBefore:s.outs,hitsBefore:[...s.hits],errorsBefore:[...s.errors],sequence:(s.eventCount||0)+1,inning:s.inning,half:s.half,outs:s.outs,balls:s.balls,strikes:s.strikes,pitcher:identity(pitcher),batter:identity(batter),battingOrder:s.order[offense(g)]+1,runnersBefore:runners(s),scoreBefore:[...s.score],pitcherSpecials:[...pitcher.specials],batterSpecials:[...batter.specials]};
 const tactical=SL_TACTICS.enabled(g),decision=tactical?SL_TACTICS.offenseDecision(g,batter,pitcher):null;
 const steal=tactical?(decision.decision.startsWith("STEAL_")?SL_FIELDING.steal(g,pitcher,decision):null):SL_FIELDING.steal(g,pitcher);
 const pitch=steal||SL_TACTICS.execute(g,pitcher,batter,decision);if(!pitch.intentionalWalk)s.pitching[pitcher.key].pitches++;
 if(pitch.intentionalWalk)s.balls=3; const applied=steal?{result:steal.result,ended:false}:applyPitch(g,pitch,batter,pitcher);if(steal&&s.outs<3){const delivered=applyPitch(g,{outcome:steal.deliveredPitch.outcome},batter,pitcher);applied.ended=delivered.ended;steal.pitchResult=delivered.result;}
 Object.assign(event,pitch,{result:applied.result,plateAppearanceEnded:applied.ended,outsAfter:s.outs,ballsAfter:s.balls,strikesAfter:s.strikes,runnersAfter:runners(s),scoreAfter:[...s.score],pitchCount:s.pitching[pitcher.key].pitches});
 event.eventType=steal?'baserunning':'pitch';event.hit=['single','double','triple','homeRun'].includes(event.result);
 event.hitsAfter=[...s.hits];event.errorsAfter=[...s.errors];event.runsScored=s.score.reduce((n,v,i)=>n+v-event.scoreBefore[i],0);event.scoringPlay=event.runsScored>0;
 const people=[...event.runnersBefore.map((runner,i)=>({runner,from:i+1})),...(applied.ended?[{runner:event.batter,from:0}]:[])];
 for(const {runner,from} of people){if(!runner||s.playActions.some(a=>a.runner.key===runner.key))continue;const to=s.bases.findIndex(r=>r?.key===runner.key)+1;if(to&&to!==from)SL_FIELDING.move(g,runner,from,to);}
 event.actions=clone(s.playActions);event.runnerAdvance=event.actions.filter(a=>a.result==='safe');event.earnedRunContext??={virtualOuts:s.virtualOuts,unearnedRunnerKeys:Object.keys(s.unearned),provisional:true};
 SL_FIELDING.annotate(g,event);
 if(decision)event.tactics=SL_TACTICS.eventTrace(event,decision);event.operations=operations;
 if(applied.ended)completePA(g);switchHalf(g);
 event.nextState={inning:s.inning,half:s.half,outs:s.outs,balls:s.balls,strikes:s.strikes,runners:runners(s),score:[...s.score],hits:[...s.hits],errors:[...s.errors],finished:s.finished,finishReason:s.finishReason};
 s.eventCount=(s.eventCount||0)+1;if(g.retainEvents!==false)s.events.push(event);return event;
}
function advance(g,mode){let count=0;const pa=g.state.paCompleted,inning=g.state.inning;
 while(!g.state.finished){onePitch(g);count++;if(mode==="pitch"||(mode==="atbat"&&g.state.paCompleted!==pa)||(mode==="inning"&&g.state.inning!==inning))break;
  if(count>=g.config.maxPitchesPerAction)throw Error("投球上限に到達。試合を終了扱いにせず停止しました。seed・ログを確認してください。");}
 return count;
}
function exportGame(g){return {format:"SL_WORLD_ENGINE_TEST",version:g.config.version,seed:g.seed,config:clone(g.config),teams:clone(g.teams),state:clone(g.state)};}
// ==================== isolated balance experiments (same match engine, no DB/storage) ====================
const BALANCE_PROFILES={
 topBatter:{meet:10,power:200,speed:20},highBatter:{meet:9,power:180,speed:18},
 midBatter:{meet:8,power:150,speed:14},teamLowBatter:{meet:4,power:80,speed:8},
 standardBatter:{meet:5,power:100,speed:10},lowBatter:{meet:3,power:50,speed:5},
 lowestPitcher:{velocity:80,control:1,stamina:1},standardPitcher:{velocity:140,control:100,stamina:100},
 midPitcher:{velocity:155,control:160,stamina:160},highPitcher:{velocity:160,control:180,stamina:180},
 peakPitcher:{velocity:165,control:200,stamina:200},lowPitcher:{velocity:130,control:50,stamina:50}
};
const BALANCE_PRESETS=[
 {id:"top-lowest",label:"最上位打者 vs 最底辺投手",batting:"topBatter",pitching:"lowestPitcher",breaking:0},
 {id:"top-mid",label:"最上位打者 vs 中位相当投手",batting:"topBatter",pitching:"midPitcher",breaking:4},
 {id:"top-peak",label:"最上位打者 vs 最高峰投手",batting:"topBatter",pitching:"peakPitcher",breaking:7},
 {id:"standard",label:"標準打者 vs 標準投手",batting:"standardBatter",pitching:"standardPitcher",breaking:0},
 {id:"low-peak",label:"低能力打者 vs 最高峰投手",batting:"lowBatter",pitching:"peakPitcher",breaking:7},
 {id:"compare-low",label:"旧版比較：標準打者 vs 低め投手",batting:"standardBatter",pitching:"lowPitcher",breaking:0},
 {id:"compare-high",label:"旧版比較：標準打者 vs 高め投手",batting:"standardBatter",pitching:"highPitcher",breaking:0}
];
const TEAM_BALANCE_PROFILES={
 HIGH:{batting:"highBatter",pitching:"highPitcher",breaking:6},
 MID:{batting:"midBatter",pitching:"midPitcher",breaking:4},
 LOW:{batting:"teamLowBatter",pitching:"lowPitcher",breaking:0}
};
const TEAM_BALANCE_PRESETS=[
 {id:"high-low",label:"HIGH vs LOW",opponent:"LOW"},
 {id:"high-mid",label:"HIGH vs MID",opponent:"MID"},
 {id:"high-high",label:"HIGH vs HIGH",opponent:"HIGH"}
];
function virtualTeam(label,side,batting,pitching,breaking,cfg=CONFIG){
 const lineup=Array.from({length:9},(_,i)=>adaptPlayer({id:`VIRTUAL_${side}_${i}`,name:`${label} ${i+1}`,isPitcher:i===8,isFielder:i!==8,
  batting:{...batting},pitching:{...pitching},specials:[],
  pitchRepertoire:breaking?{slider:[{name:"スライダー",breakAmount:breaking}],fork:[{name:"フォーク",breakAmount:breaking}]}:{}},`${side}_${i}`,cfg));
 return {name:label,lineup,pitcher:lineup[8],rosterCount:9,testCount:0};
}
function balanceDescription(preset){
 const b=BALANCE_PROFILES[preset.batting],p=BALANCE_PROFILES[preset.pitching];
 return `打者：ミート${b.meet} / パワー${b.power} / 走力${b.speed}　投手：${p.velocity}km/h / 制球${p.control} / スタミナ${p.stamina} / ${preset.breaking?`スライダー・フォーク各変化量${preset.breaking}`:"追加球種なし"}`;
}
function createDuelTest(preset,seed,startPitches=0,cfg=CONFIG){
 if(!Number.isInteger(startPitches)||startPitches<0||startPitches>500)throw Error("開始投球数は0〜500の整数で指定してください。");
 const batting=BALANCE_PROFILES[preset.batting],pitching=BALANCE_PROFILES[preset.pitching];
 const teams=[virtualTeam("BATTER","away",batting,pitching,0,cfg),virtualTeam("PITCHER","home",batting,pitching,preset.breaking,cfg)];
 return {game:newGame(teams,seed,cfg),startPitches,counts:{PA:0,AB:0,H:0,TB:0,single:0,double:0,triple:0,homeRun:0,strikeout:0,walk:0,groundout:0,flyout:0,lineout:0,error:0,fieldersChoice:0,doublePlay:0,sacrificeBunt:0,sacrificeFly:0},fiveAB:{atBats:0,hits:0,groups:0,hitless:0}};
}
function stepDuelTest(test){
 const g=test.game,s=g.state;
 // Each PA begins empty, top 1, same hitter/pitcher and selected fatigue baseline.
 // RNG continues across PAs. Within a PA, normal onePitch/applyPitch and fatigue apply.
 s.inning=1;s.half="top";s.outs=0;s.balls=0;s.strikes=0;s.bases=[null,null,null];
 s.score=[0,0];s.lines=[Array(g.config.innings).fill(null),Array(g.config.innings).fill(null)];s.lines[0][0]=0;
 s.order=[0,0];s.finished=false;s.finishReason=null;s.events.length=0;
 s.pitching[g.teams[1].pitcher.key].pitches=test.startPitches;
 advance(g,"atbat");
 const result=s.events.at(-1).result,c=test.counts,bases={single:1,double:2,triple:3,homeRun:4}[result]||0;
 if(!Object.hasOwn(c,result))throw Error(`未集計の打席結果：${result}`);
 c.PA++;c[result]++;
 if(result!=="walk"){
  c.AB++;c.H+=bases?1:0;c.TB+=bases;
  test.fiveAB.atBats++;test.fiveAB.hits+=bases?1:0;
  if(test.fiveAB.atBats===5){test.fiveAB.groups++;if(test.fiveAB.hits===0)test.fiveAB.hitless++;test.fiveAB.atBats=0;test.fiveAB.hits=0;}
 }
 return result;
}
function duelTestSummary(test){
 const c=test.counts,divide=(a,b)=>b?a/b:null;
 const AVG=divide(c.H,c.AB),OBP=divide(c.H+c.walk,c.PA),SLG=divide(c.TB,c.AB);
 return {...c,AVG,OBP,SLG,OPS:OBP===null||SLG===null?null:OBP+SLG,
  outRate:divide(c.groundout+c.flyout+c.lineout,c.PA),HRRate:divide(c.homeRun,c.PA),KRate:divide(c.strikeout,c.PA),BBRate:divide(c.walk,c.PA),
  fiveABGroups:test.fiveAB.groups,hitlessFiveAB:test.fiveAB.hitless,hitlessFiveRate:divide(test.fiveAB.hitless,test.fiveAB.groups)};
}
function createTeamTest(preset,seed,cfg=CONFIG){
 return {preset,seed,config:clone(cfg),games:0,wins:0,losses:0,draws:0,runs:0,allowed:0,largeMargins:0,shutouts:0,scores:[]};
}
function stepTeamTest(test){
 const profile=TEAM_BALANCE_PROFILES.HIGH,other=TEAM_BALANCE_PROFILES[test.preset.opponent],side=test.games%2;
 const make=(p,label,slot)=>virtualTeam(label,slot,BALANCE_PROFILES[p.batting],BALANCE_PROFILES[p.pitching],p.breaking,test.config);
 const high=make(profile,"HIGH",side===0?"away":"home"),opponent=make(other,test.preset.opponent,side===0?"home":"away");
 const g=newGame(side===0?[high,opponent]:[opponent,high],`${test.seed}/game/${test.games}`,test.config);
 advance(g,"game");
 const runs=g.state.score[side],allowed=g.state.score[1-side];
 test.games++;test.runs+=runs;test.allowed+=allowed;
 if(runs>allowed)test.wins++;else if(runs<allowed)test.losses++;else test.draws++;
 if(Math.abs(runs-allowed)>=10)test.largeMargins++;
 if(allowed===0)test.shutouts++;
 test.scores.push([runs,allowed]);
 return g;
}
function teamTestSummary(test){
 const n=test.games,decisions=test.wins+test.losses;
 return {games:n,wins:test.wins,losses:test.losses,draws:test.draws,winRate:decisions?test.wins/decisions:null,
  runs:n?test.runs/n:null,allowed:n?test.allowed/n:null,margin:n?(test.runs-test.allowed)/n:null,
  largeMargins:test.largeMargins,shutouts:test.shutouts,scores:test.scores.map(score=>[...score])};
}
// Exposed core for deterministic tests and later extraction into modules.
globalThis.SL_ENGINE={CONFIG,PITCH_CATALOG,readDB,adaptPlayer,makeTeam,createRNG,newGame,resolvePitch,resolveBattedBall,applyPitch,advanceHit,advanceWalk,completePA,switchHalf,onePitch,advance,exportGame,currentBatter,currentPitcher,generatePitchQuality,judgePitch,resolveContact,generateBattedQuality,resolveFinalResult,specialModifiers,SPECIAL_EFFECT_HANDLERS,BALANCE_PROFILES,BALANCE_PRESETS,TEAM_BALANCE_PROFILES,TEAM_BALANCE_PRESETS,createDuelTest,stepDuelTest,duelTestSummary,createTeamTest,stepTeamTest,teamTestSummary};
// ==================== UI ====================
