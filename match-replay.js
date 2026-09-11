/* Pure replay choreography. Timings visualize supplied outcomes; they never judge a play. */
(() => {
 'use strict';
 const layout=SL_FIELDING.layout,{bases,positions}=layout;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const clamp01=x=>Math.max(0,Math.min(1,x));
 const lerp=(a,b,t)=>a+(b-a)*t;
 const point=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const progress=(time,start,end)=>clamp01((time-start)/Math.max(1,end-start));
 const tagFacing=(e,leg)=>{const action=e.actions.find(a=>a.runner?.key===leg.runnerKey);const from=action?.fromBase??e.fromBase??1;return bases[from][0]<leg.toPoint[0]?-1:1;};
 const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 const names={sacrificeBunt:'送りバント成功',error:'失策',fieldersChoice:'野選',doublePlay:'併殺',sacrificeFly:'犠牲フライ',stolenBase:'盗塁成功',caughtStealing:'盗塁死',ball:'ボール',calledStrike:'見逃しストライク',swingingStrike:'空振り',foul:'ファウル',strikeout:'三振',walk:'四球',single:'単打',double:'二塁打',triple:'三塁打',homeRun:'本塁打',groundout:'ゴロアウト',flyout:'フライアウト',lineout:'ライナーアウト'};
 const banners={sacrificeBunt:'SAC BUNT',error:'ERROR',fieldersChoice:'FC',doublePlay:'DOUBLE PLAY',sacrificeFly:'SAC FLY',stolenBase:'SAFE',caughtStealing:'OUT',groundout:'OUT',flyout:'OUT',lineout:'OUT',single:'SINGLE',double:'DOUBLE',triple:'TRIPLE',homeRun:'HOME RUN',strikeout:'STRIKE OUT',calledStrike:'STRIKE',swingingStrike:'STRIKE',foul:'FOUL',ball:'BALL',walk:'FOUR BALLS'};
 const safeText=(value,fallback='—')=>typeof value==='string'&&value.trim()&&!/^(undefined|null)$/i.test(value)?value:fallback;
 function decisionDebug(e){
  if(!e.tactics)return '';
  const sections=[e.tactics.offense,e.tactics.defense].filter(Boolean);
  return sections.map(d=>{const options=d.candidates?.filter(c=>c.toBase).map(c=>'- '+c.toBase+'B out chance: '+c.outChance.toFixed(2)+' / risk: '+c.errorRisk.toFixed(3)).join('\n');return 'Decision: '+d.decision.replaceAll('_',' ')+'\nReason:\n'+d.reasons.map(r=>'- '+r).join('\n')+(options?'\n'+options:'');}).join('\n\n')+'\n'+JSON.stringify({force:e.forceAtContact,trajectory:e.trajectory,return:e.returnDecision,running:e.runningDebug});
 }
 function resultLabel(e){return safeText(e.log,names[e.result]||'プレー終了');}
 function toReplayEvent(event){
  const e=copy(event),steal=e.eventType==='baserunning'||['stolenBase','caughtStealing'].includes(e.result);
  e.eventType=steal?'baserunning':e.eventType||'pitch';
  e.runnersBefore=e.runnersBefore||[null,null,null];e.runnersAfter=e.runnersAfter||[null,null,null];e.scoreBefore=e.scoreBefore||[0,0];e.scoreAfter=e.scoreAfter||e.scoreBefore;
  e.outsBefore=e.outsBefore??e.outs??0;e.batter=e.batter||{key:'legacy-batter',name:'打者'};e.pitcher=e.pitcher||{key:'legacy-pitcher',name:'投手'};
  e.ballType=e.ballType||(e.infieldHit||e.battedResult==='groundout'||e.result==='groundout'?'ground':e.result==='lineout'||e.result==='single'?'line':e.result==='homeRun'?'homer':e.result==='foul'?'foul':'fly');
  let index=e.primaryFielder?.index??e.fielderIndex;
  let target=e.landingPosition||e.landingPoint;
  const candidates=e.ballType==='ground'||e.result==='lineout'?[2,3,4,5]:[6,7,8];
  if(!Number.isInteger(index)||index<0||index>8)index=steal?1:candidates.reduce((best,i)=>validPoint(target)&&distance(positions[i],target)<distance(positions[best],target)?i:best,candidates[0]);
  if(!validPoint(target))target=[...positions[index]];
  // Old events mixed infield fielders with outfield coordinates. Project only legacy geometry,
  // retaining its assigned fielder and its authoritative baseball outcome.
  if(!e.eventVersion&&(e.ballType==='ground'||e.result==='lineout')&&distance(target,positions[index])>70)target=point(positions[index],target,35/distance(target,positions[index]));
  e.fielderIndex=index;e.presentation={directionSource:e.eventVersion?'engine':'legacy',target};
  e.fieldingPoint=validPoint(e.fieldingPoint)?e.fieldingPoint:['single','double','triple'].includes(e.result)?[target[0],Math.max(60,target[1]-22)]:target;
  e.transfers=e.transfers||[];
  if(!e.transfers.length&&(e.throw||steal)){
   let from=index;
   e.transfers=(e.throws||[e.throw||{toBase:e.toBase}]).filter(t=>bases[t.toBase]).map(t=>{const toIndex=t.toBase===1?2:t.toBase===2?(from===5?3:5):t.toBase===3?4:1;const transfer={fromIndex:from,toIndex,toBase:t.toBase,kind:steal||e.tagUp?'tag':'force',runnerKey:e.runner?.key,result:e.caughtStealing?'out':e.tag?.result||(['groundout','doublePlay'].includes(e.result)?'out':'safe')};from=toIndex;return transfer;});
  }
  if(!e.actions){e.actions=[];e.runnersBefore.forEach((runner,i)=>{if(!runner)return;const to=e.runnersAfter.findIndex(p=>p?.key===runner.key)+1;if(to&&to!==i+1)e.actions.push({runner,fromBase:i+1,toBase:to,result:'safe',type:'runnerAdvance'});});const to=e.runnersAfter.findIndex(p=>p?.key===e.batter.key)+1;if(to)e.actions.push({runner:e.batter,fromBase:0,toBase:to,result:'safe',type:'runnerAdvance'});if(steal&&e.runner)e.actions.push({runner:e.runner,fromBase:e.fromBase,toBase:e.toBase,result:e.caughtStealing?'out':'safe',type:e.result});}
  e.runsScored=e.runsScored??e.scoreAfter.reduce((n,v,i)=>n+v-e.scoreBefore[i],0);
  e.nextState=e.nextState||{inning:e.inning,half:e.half,outs:e.outsAfter,balls:e.ballsAfter||0,strikes:e.strikesAfter||0,runners:e.runnersAfter,score:e.scoreAfter,hits:e.hitsAfter,errors:e.errorsAfter,finished:false};
  return e;
 }
 function animationPlan(e){
  const steal=e.eventType==='baserunning',inPlay=e.outcome==='inPlay'&&!steal,foul=e.outcome==='foul',kind=e.ballType;
  const release=620,pitchEnd=release+Math.max(300,650-((Number(e.pitchSpeed)||140)-80)*4.4);
  const fielder=e.fielderIndex,target=e.presentation.target,fieldPoint=e.fieldingPoint;
  const loose=inPlay&&!e.trajectory&&(['single','double','triple'].includes(e.result)||(e.error&&e.errorType!=='throwing'));
  const flight=e.trajectory?.fieldTime?e.trajectory.fieldTime*1000:inPlay||foul?Math.max(e.bunt?1300:kind==='line'?700:kind==='ground'?850:kind==='homer'?1900:1400,distance(positions[fielder],target)/.18+180):0;
  const landingAt=pitchEnd+flight,rollDuration=loose?Math.max(650,distance(positions[fielder],fieldPoint)/.18-flight+180):0;
  const caught=steal?pitchEnd:landingAt+rollDuration;
  let ready=caught+230,location=steal?positions[1]:loose?fieldPoint:target;
  const transfers=e.transfers.map(t=>{
   const carried=t.fromIndex===t.toIndex,to=t.toPoint||bases[t.toBase];
   const travel=Math.max(300,distance(location,to)/(carried?.17:.42));
   const earlyCover=kind==='ground'&&t.toBase===1&&t.toIndex===(fielder===2?0:2),coverStart=earlyCover?pitchEnd+140:caught;
   const receiverReady=coverStart+distance(positions[t.toIndex],to)/.18;
   const start=Math.max(ready,receiverReady-travel),end=start+travel;
   const leg={...t,fromPoint:location,toPoint:to,start,end,tagAt:end+(t.kind==='tag'?150:0),carried};
   ready=leg.tagAt+210;location=to;return leg;
  });
  const runStart=steal?release+40:e.tagUp?caught+100:pitchEnd+130;
  let resultAt=Math.max(caught+350,transfers.at(-1)?.tagAt+180||0);
  if(e.result==='homeRun')resultAt=Math.max(resultAt,pitchEnd+4200);
  if(['single','double','triple','walk'].includes(e.result))resultAt=Math.max(resultAt,pitchEnd+({single:2000,double:2800,triple:3500,walk:1600}[e.result]));
  const runEnd=resultAt-100,returnAt=resultAt+600,resetEnd=returnAt+850;
  const halfChanged=e.nextState&&!e.nextState.finished&&(e.nextState.inning!==e.inning||e.nextState.half!==e.half);
  return {release,pitchEnd,kind,inPlay,foul,steal,target,fieldPoint,fielder,flight,landingAt,rollDuration,loose,caught,transfers,hasThrow:transfers.length>0,throwStart:transfers[0]?.start||caught,throwEnd:transfers.at(-1)?.end||caught,throwTarget:transfers.at(-1)?.toPoint||target,resultAt,runStart,runEnd,returnAt,resetEnd,runningDebug:{...e.runningDebug,returnStart:transfers[0]?.start??null,batterSecondArrival:e.actions.some(a=>a.runner?.key===e.batter.key&&a.toBase>=2)?runEnd:null},halfChanged,end:halfChanged?returnAt+1600:resetEnd};
 }
 function ballAnimation(e,p,time){
  if(time<p.release)return {phase:'windup',ground:positions[0],height:0,visible:false};
  if(time<p.pitchEnd)return {phase:'pitch',ground:point(positions[0],p.steal?positions[1]:bases[0],progress(time,p.release,p.pitchEnd)),height:4,visible:true};
  if(!p.inPlay&&!p.foul&&!p.steal)return {phase:'catcher',ground:positions[1],height:8,visible:time<p.pitchEnd+230};
  if(!p.steal&&time<p.landingAt){const t=progress(time,p.pitchEnd,p.landingAt);return {phase:p.kind,ground:point(bases[0],p.target,t),height:p.kind==='ground'?Math.abs(Math.sin(t*Math.PI*5))*(e.bunt?1:3):p.kind==='line'?Math.sin(t*Math.PI)*18:p.kind==='homer'?Math.sin(t*Math.PI)*115+25*t:Math.sin(t*Math.PI)*95,visible:true};}
  if(p.kind==='homer'&&!p.steal)return {phase:'homerExit',ground:p.target,height:0,visible:false};
  if(p.foul)return {phase:'foulDone',ground:p.target,height:0,visible:false};
  if(p.loose&&time<p.caught){const t=progress(time,p.landingAt,p.caught),travel=1-(1-t)**2;return {phase:'rolling',ground:point(p.target,p.fieldPoint,travel),height:Math.abs(Math.sin(t*Math.PI*3))*(1-t)*(p.kind==='fly'?7:4),visible:true};}
  let held=p.steal?positions[1]:p.loose?p.fieldPoint:p.target,phase='fieldCatch',receivedLeg=null;
  for(const leg of p.transfers){
   if(time<leg.start)break;
   if(time<leg.end)return {phase:leg.carried?'carry':'throw',ground:point(leg.fromPoint,leg.toPoint,progress(time,leg.start,leg.end)),height:leg.carried?8:12,visible:true};
   held=leg.toPoint;receivedLeg=leg;phase=time<leg.tagAt?'received':leg.kind==='tag'?'tag':leg.kind==='force'?'baseTouch':'received';
  }
  const facing=phase==='tag'?tagFacing(e,receivedLeg):receivedLeg?(receivedLeg.fromPoint[0]<held[0]?-1:1):(held[0]<positions[p.fielder][0]?-1:1);
  return {phase,ground:[held[0]+12*facing,held[1]],height:phase==='tag'||(!receivedLeg&&p.kind==='ground')?6:30,visible:time<p.returnAt};
 }
 function runnerAnimation(e,p,time){
  const people=e.runnersBefore.flatMap((who,i)=>who?[{who,start:i+1}]:[]);
  const batterAction=e.actions.find(a=>a.runner?.key===e.batter.key&&a.fromBase===0);
  if(batterAction&&time>=p.runStart&&!people.some(r=>r.who.key===e.batter.key))people.push({who:e.batter,start:0});
  return people.map(({who,start})=>{
   const actions=e.actions.filter(a=>a.runner?.key===who.key);if(!actions.length){const force=e.forceAtContact?.find(a=>a.runner.key===who.key&&a.force);if(force)actions.push({...force,type:'forceStart'});}const action=actions.find(a=>a.result==='out')||actions.find(a=>a.toBase===4)||actions.at(-1);
   const finish=action?.toBase??start,leg=p.transfers.find(t=>t.runnerKey===who.key)||p.transfers.find(t=>t.toBase===finish&&t.kind!=='return');
   const end=leg?leg.tagAt+(action?.result==='out'?80:-80):p.runEnd;
   const t=progress(time,p.runStart,end),d=lerp(start,finish,t),segment=Math.min(3,Math.floor(d));
   const out=action?.result==='out',outAt=leg?.tagAt??p.resultAt;
   return {who,start,finish,position:point(bases[segment],bases[segment+1],d-segment),running:t>0&&t<1&&start!==finish,visible:!(out&&time>=outAt+400)&&!(finish===4&&t===1)};
  });
 }
 function batterVisible(e,p,time){return !(time>=p.runStart&&e.actions.some(a=>a.runner?.key===e.batter.key&&a.fromBase===0))&&!(e.plateAppearanceEnded&&time>=p.resultAt);}
 function fieldingAnimation(e,p,time,i){
  const origin=positions[i];if(!p||(!p.inPlay&&!p.steal))return {position:origin,pose:{}};
  let target=origin,start=p.pitchEnd+140,end=p.caught,role='hold';
  if(i===p.fielder){target=p.steal?positions[1]:p.target;end=p.landingAt;role='primary';if(time>=p.landingAt){start=p.landingAt;target=p.fieldPoint;end=p.caught;}}
  // No future throw receiver or outcome is consulted before fielding is resolved.
  else if(i===e.defensiveRoles?.secondary){target=p.target;role='secondary';end=p.landingAt;}
  else if(p.kind==='ground'&&i=== (p.fielder===2?0:2)){target=bases[1];role='baseCover';end=start+Math.max(280,distance(origin,target)/.18);}
  if(time>=p.caught&&e.returnFormation&&i!==p.fielder){const f=e.returnFormation;if(i===f.relayIndex){target=f.relayPoint;role='relay';start=p.caught;end=start+distance(origin,target)/.18;}else if(i===f.coverIndex){target=bases[2];role='baseCover';start=p.caught;end=start+distance(origin,target)/.18;}}

  const receiver=p.transfers.find(t=>t.toIndex===i);
  if(receiver&&i!==p.fielder&&(p.steal||time>=p.caught)){target=receiver.toPoint;start=p.steal?p.release+70:p.kind==='ground'&&receiver.toBase===1&&i===(p.fielder===2?0:2)?p.pitchEnd+140:p.caught;end=Math.min(receiver.end-120,start+Math.max(280,distance(origin,target)/.18));role='cover';}
  let position=point(i===p.fielder&&time>=p.landingAt?p.target:origin,target,progress(time,start,end));
  // A primary fielder may become a later receiver (for example a 3-6-3 DP).
  if(receiver&&i===p.fielder&&!receiver.carried){
   const departure=(p.transfers.find(t=>t.fromIndex===i)?.start??p.caught)+100;
   if(time>=departure){start=departure;target=receiver.toPoint;end=Math.min(receiver.end-100,start+Math.max(240,distance(p.loose?p.fieldPoint:p.target,target)/.18));position=point(p.loose?p.fieldPoint:p.target,target,progress(time,start,end));role='cover';}
  }
  const carry=p.transfers.find(t=>t.carried&&t.fromIndex===i);
  if(carry&&time>=carry.start)position=point(carry.fromPoint,carry.toPoint,progress(time,carry.start,carry.end));
  const receiving=p.transfers.find(t=>t.toIndex===i&&time>=t.end-80&&time<t.end+130);
  const tagging=p.transfers.find(t=>t.toIndex===i&&t.kind==='tag'&&time>=t.end+80&&time<t.tagAt+250);
  const throwing=p.transfers.find(t=>t.fromIndex===i&&!t.carried&&time>=t.start-100&&time<t.start+180);
  const catchBall=p.kind!=='homer'&&i===p.fielder&&time>=p.caught-80&&time<p.caught+160;
  const beforeReturn=position;
  if(time>=p.returnAt&&!p.halfChanged)position=point(beforeReturn,origin,progress(time,p.returnAt,p.resetEnd));
  const facing=tagging?tagFacing(e,tagging):receiving?(receiving.fromPoint[0]<position[0]?-1:1):target[0]<origin[0]?-1:1;
  return {position,role,receiving:!!receiving,tagging:!!tagging,pose:{time,running:(time>start&&time<end)||(time>p.returnAt&&time<p.resetEnd&&!p.halfChanged),facing,catch:!!(receiving||tagging||catchBall),glove:tagging?[12,-6]:receiving||catchBall?[12,catchBall&&p.kind==='ground'?-6:-30]:undefined,hand:throwing?[17,-38]:undefined}};
 }
 function transition(e,p,time){if(!p.halfChanged||time<p.returnAt)return null;const t=progress(time,p.returnAt,p.end),entering=t>=.5;return {entering,progress:entering?(t-.5)*2:t*2};}
 globalThis.SL_MATCH_REPLAY={toReplayEvent,animationPlan,ballAnimation,runnerAnimation,batterVisible,fieldingAnimation,transition,resultLabel,decisionDebug,bannerLabel:e=>banners[e.result]||'PLAY',safeText,names};
})();
