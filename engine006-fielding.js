/* Engine-owned fielding and running; presentation never decides results. */
(() => {
 const positions=['P','C','1B','2B','3B','SS','LF','CF','RF'];
 const labels=['投手','捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];
 function defense(g){const t=g.teams[1-offense(g)],pool=t.lineup.filter(p=>p.key!==t.pitcher.key),out=[t.pitcher];for(let j=1;j<9;j++){let i=pool.findIndex(p=>p.profile.mainPosition===positions[j]||p.profile.mainPosition===labels[j]||(j>=6&&p.profile.mainPosition==='OF'));out.push(pool.splice(i<0?0:i,1)[0]);}return out;}
 const ability=(p,k)=>clamp((Number(p.profile.batting?.[k]??10)-1)/19,0,1);
 function move(g,p,from,to,result='safe',type='runnerAdvance'){g.state.playActions.push({type,runner:identity(p),fromBase:from,toBase:to,result});}
 const layout=Object.freeze({coordinateSpace:'field-800x500-v1',bases:[[400,430],[540,315],[400,225],[260,315],[400,430]],positions:[[400,332],[400,462],[553,302],[473,253],[249,302],[325,250],[200,155],[400,104],[600,155]]});
 // Force follows the uninterrupted occupied chain behind a runner, never the result.
 function forcePlan(bases,batter){let forced=true;return [{runner:identity(batter),fromBase:0,toBase:1,force:true},...bases.flatMap((r,i)=>{forced=forced&&!!r;return r?[{runner:identity(r),fromBase:i+1,toBase:forced?i+2:i+1,force:forced}]:[];})];}
 function receiverIndex(base,from,point){return base===1?(from===2&&Math.hypot(point[0]-540,point[1]-315)>45?0:2):base===2?(from===5?3:5):base===3?4:1;}

 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function relayFormation(at,toBase=2){const base=layout.bases[toBase],home=layout.bases[0],dx=at[0]-base[0],dy=at[1]-base[1],x=base[0]-home[0],y=base[1]-home[1];
  const radius=237+Math.min(18,distance(at,base)/15),a=dx*dx+dy*dy,b=2*(x*dx+y*dy),c=x*x+y*y-radius*radius;
  const t=a?clamp((-b+Math.sqrt(Math.max(0,b*b-4*a*c)))/(2*a),.08,.85):0;
  const relayIndex=at[0]>440?3:5;return {relayIndex,coverIndex:relayIndex===5?3:5,relayPoint:[base[0]+dx*t,base[1]+dy*t],targetBase:toBase,radius};
 }
 function groundTiming(g,p,b,target,receiverIndex){const fielders=defense(g),f=fielders[p.fielderIndex],receiver=fielders[receiverIndex],origins=globalThis.SL_TACTICS?.alignment?SL_TACTICS.alignment(g).positions:layout.positions,at=p.landingPoint||origins[p.fielderIndex];
  const movement=distance(origins[p.fielderIndex],at),reaction=p.physical?SL_FIELDING.process.reaction(f):.25+.25*(1-ability(f,'fielding')),fieldArrival=reaction+movement/(p.physical?SL_FIELDING.process.speed(f,p.fielderIndex):45+12*ability(f,'speed'));
  const ballArrival=p.trajectory?.fieldTime??distance(layout.bases[0],at)/(150+160*(p.battedQuality??.5));
  const fieldTime=Math.max(ballArrival,fieldArrival),turnDelay=p.physical?SL_FIELDING.process.turnDelay(p,p.fielderIndex,layout.bases[target.toBase]):0,pickupTime=turnDelay+(p.handling?.pickupTime??(.18+.22*(1-ability(f,'catching'))+.12*Math.min(1,movement/80))),throwTime=distance(at,layout.bases[target.toBase])/(receiverIndex===p.fielderIndex?(p.physical?SL_FIELDING.process.speed(f,p.fielderIndex):45+12*ability(f,'speed')):165+55*ability(f,'arm'));
  const coverETA=p.defensivePlan?SL_FIELDING.process.coverTime(g,p,receiverIndex,layout.bases[target.toBase],fieldTime):.25+distance(origins[receiverIndex],layout.bases[target.toBase])/(p.physical?SL_FIELDING.process.speed(receiver,receiverIndex):45+12*ability(receiver,'speed'));
  const ballETA=Math.max(coverETA,fieldTime+pickupTime+throwTime)+(target.force?0:.15),runnerETA=.13+(p.physical?SL_FIELDING.process.runTime(g,target.runner,target.fromBase):(target.fromBase===0?4.6:3.9)-1.25*scaled(target.runner,'speed',g.config));
  return {fieldTime,ballArrival,fieldArrival,movement,reaction,pickupTime,turnDelay,throwTime,coverETA,ballETA,runnerETA,margin:runnerETA-ballETA,source:'arrival-race'};
 }
 function geometry(g,p){if(!p.physical)Object.assign(p,SL_FIELDING.process.generate(g,currentBatter(g),{score:p.battedQuality??.5,grade:p.battedGrade||'normal'}));return SL_FIELDING.process.geometry(g,p);}
 // The existing speed/arm model is shared by selection and execution. Technique
 // changes the runner's start time, not a post-hoc success percentage.
 // Steal coverage is separate from batted-ball/DP receiving responsibilities.
 function stealCoverage(g,from){
  const fielders=defense(g),origins=SL_TACTICS.alignment(g).positions,toBase=from+1,index=toBase===2?3:4,start=.25;
  const assignment=(index,point,assignedRole)=>{const moveSpeed=45+12*ability(fielders[index],'speed');return {index,fielder:{...identity(fielders[index]),position:positions[index]},assignedRole,point:[...point],origin:[...origins[index]],start,moveSpeed,arrival:start+distance(origins[index],point)/moveSpeed};};
  const cover=assignment(index,layout.bases[toBase],'BASE COVER'),assignedRoles=[cover];
  if(toBase===2)assignedRoles.push(assignment(5,[layout.bases[2][0],layout.bases[2][1]-32],'BACKUP'));
  return {toBase,coverIndex:index,receiverIndex:index,taggerIndex:index,coverETA:cover.arrival,assignedRoles};
 }
 function stealExecution(g,runner,pitcher,from,noise=0,pitchVelocity=null){
  const startNoise=typeof noise==='number'?noise:noise.start||0,throwNoise=typeof noise==='number'?-noise:noise.transfer||0,motionNoise=typeof noise==='number'?0:noise.motion||0;
  const catcher=defense(g)[1],speed=scaled(runner,'speed',g.config),trait=(runner.specials||[]).find(x=>x==='盗塁○'||x==='盗塁×')||null,technique=trait==='盗塁○'?1.15:trait==='盗塁×'?.7:1;
  const recognition=.22/technique,startTime=Math.max(.03,recognition+startNoise*.18);
  const leadDistance=3.2,runDistance=27.432-leadDistance,maximumSpeed=7+2*speed,accelerationRate=6+.6*speed+.25*(technique-1);
  const accelerationTime=maximumSpeed/accelerationRate,accelerationDistance=maximumSpeed*accelerationTime/2;
  const runTime=runDistance<accelerationDistance?Math.sqrt(2*runDistance/accelerationRate):accelerationTime+(runDistance-accelerationDistance)/maximumSpeed;
  const acceleration=0; // Acceleration is integrated into runTime; never add it twice.
  const motion=1.28+motionNoise*.12-.18*scaled(pitcher,'control',g.config)-((pitcher.specials||[]).includes('クイック○')?.12:0),pitchFlight=18.44/((pitchVelocity||pitcher.effective.velocity)/3.6),pitchArrival=motion+pitchFlight;
  const transferTime=.35+.20*(1-ability(catcher,'catching'))+throwNoise*.12,throwMotionTime=.30+throwNoise*.08,popup=transferTime+throwMotionTime,throwTime=distance(layout.positions[1],layout.bases[from+1])/(165+55*ability(catcher,'arm'));
  const coverage=stealCoverage(g,from),{coverIndex,coverETA}=coverage;
  const throwStart=Math.max(pitchArrival+popup,coverETA-throwTime),ballETA=throwStart+throwTime,tagAt=ballETA+.15,runnerETA=startTime+acceleration+runTime;
  const chance=clamp(.5+(tagAt-(.22/technique+acceleration+runTime))/.65,.02,.98);
  return {...coverage,receivingFielder:coverage.assignedRoles[0].fielder,tagger:coverage.assignedRoles[0].fielder,trait,technique,speed,recognition,leadDistance,runDistance,maximumSpeed,accelerationRate,accelerationTime,accelerationDistance,startTime,runTime,acceleration,motion,pitchFlight,pitchArrival,popup,throwStart,throwTime,coverETA,ballETA,tagAt,runnerETA,catcherArm:ability(catcher,'arm'),chance,transferTime,throwMotionTime,transferStart:pitchArrival,transferComplete:pitchArrival+transferTime,throwMotionStart:pitchArrival+transferTime,releaseTime:throwStart,receiverCatchTime:ballETA,tagTime:.15,margin:tagAt-runnerETA,marginDefinition:'tagAt - runnerETA; nonnegative = SAFE',source:'shared-motion-clock'};
 }

 // Legal single-runner attempts only; no implicit double steals.
 function canSteal(g,from){return !g.state.finished&&g.state.outs<3&&(from===1||from===2)&&!!g.state.bases[from-1]&&!g.state.bases[from];}

 // Engine-owned temporal contract. All times are seconds since contact/steal release.
 // Tracks are append-only role transitions from the actual current position.
 function trackPosition(track,t){let at=track.origin;for(const leg of track.legs){if(t<leg.start)break;const f=clamp((t-leg.start)/Math.max(.001,leg.end-leg.start),0,1);at=[leg.from[0]+(leg.to[0]-leg.from[0])*f,leg.from[1]+(leg.to[1]-leg.from[1])*f];}return [...at];}
 function buildPlay(e){
  const steal=e.eventType==='baserunning'||!!e.runningExecution,inPlay=e.outcome==='inPlay';if(!steal&&!inPlay)return null;
  const origins=e.defensivePositions||layout.positions,fielders=e.defense||positions.map((position,index)=>({key:position,index,position,moveSpeed:85}));
  const actual=e.actualFielder?.index??e.fielderIndex??1,at=steal?origins[1]:(e.fieldingPoint||e.landingPoint||origins[actual]),landing=e.landingPoint||at;
  const reaction=fielders[actual]?.reaction??.35,speed=fielders[actual]?.moveSpeed??85;
  const execution=e.stealExecution||e.runningExecution?.stealExecution;
  const flight=steal?0:e.physical?(e.interception.airborne?e.trajectory.fieldTime:e.ballType==='ground'?e.trajectory.fieldTime:Math.min(e.trajectory.fieldTime,e.physical.hangTime)):Math.max(e.defenseDecision?.fieldTime??e.trajectory?.fieldTime??(e.bunt?1.3:e.ballType==='line'?.7:1.4),reaction+distance(origins[actual],landing)/speed);
  const roll=distance(landing,at),caught=steal?0:e.physical?e.trajectory.fieldTime:Math.max(flight+(roll?Math.max(.65,roll/speed):0),reaction+distance(origins[actual],at)/speed);

  const tracks=e.defensivePlan?clone(e.defensivePlan.tracks):origins.map((origin,index)=>({index,key:fielders[index]?.key,origin:[...origin],legs:[]}));
  function move(index,to,start,role,end=null){const track=tracks[index],from=trackPosition(track,start);track.legs=track.legs.filter(l=>l.start<start);const last=track.legs.at(-1);if(last&&last.end>start){last.end=start;last.to=from;}
   const arrival=end??start+distance(from,to)/(fielders[index]?.moveSpeed??85);track.legs.push({from,to:[...to],start,end:Math.max(start+.001,arrival),role});return arrival;
  }
  const outfield=actual>=6&&distance(layout.bases[0],landing)>190;
  const anticipatedTarget=(e.runnersBefore?.[1]||e.runnersBefore?.[2])?4:2;
  const anticipation=outfield?{...relayFormation(landing,anticipatedTarget),recognizedAt:e.ballType==='ground'?Math.min(caught,flight*180/Math.max(180,distance(layout.bases[0],landing))):Math.min(caught,e.chase?.until??.35),source:'observed-trajectory-and-runners-before'}:null;
  if(!e.defensivePlan){
  // Chase the observable landing/interception first; only pursue a loose ball after arrival.
  const chaseTarget=e.fenceCrossing?(()=>{const origin=origins[actual],fraction=Math.min(1,Math.max(0,caught-reaction)*speed/Math.max(.01,distance(origin,at)));return [origin[0]+(at[0]-origin[0])*fraction,origin[1]+(at[1]-origin[1])*fraction];})():e.physical?at:landing;move(actual,chaseTarget,steal?0:reaction,'primary',e.physical?caught:flight);
  if(roll&&!e.physical)move(actual,at,flight,'primary',caught);
  const secondary=e.chase?.secondary??e.defensiveRoles?.secondary??(e.trajectory?.candidates||e.catchCandidates||[]).find(c=>c.index!==actual&&c.time<=caught+.3)?.index;
  if(secondary!=null&&secondary!==actual){const dx=at[0]-400,dy=at[1]-430,d=Math.max(1,Math.hypot(dx,dy));const until=e.chase?.until??Math.min(caught,.7),target=e.chase?.point||landing,from=origins[secondary],fraction=Math.min(1,Math.max(0,until-.25)*(fielders[secondary]?.moveSpeed??85)/Math.max(1,distance(from,target)));move(secondary,[from[0]+(target[0]-from[0])*fraction,from[1]+(target[1]-from[1])*fraction],.25,'secondary',until);if(secondary!==anticipation?.relayIndex&&secondary!==anticipation?.coverIndex)move(secondary,secondary<6?layout.bases[secondary===4?3:2]:[at[0]+dx/d*24,at[1]+dy/d*24],until,secondary<6?'baseCover':'backup');}
  if(e.ballType==='ground'||e.physical){
   const first=actual===2?(distance(at,layout.bases[1])>45?0:null):2;
   if(first!=null)move(first,layout.bases[1],.25,'baseCover');
   const middle=actual===5?3:5;if(middle!==actual)move(middle,layout.bases[2],.25,'baseCover');
   if(actual!==4&&(e.physical||e.runnersBefore?.[1]))move(4,layout.bases[3],.25,'baseCover');
   if(actual!==1&&(e.physical||e.runnersBefore?.[2]))move(1,layout.bases[4],.25,'baseCover');
  }
  if(anticipation){move(anticipation.relayIndex,anticipation.relayPoint,anticipation.recognizedAt,'relay');move(anticipation.coverIndex,layout.bases[2],anticipation.recognizedAt,'baseCover');}
  if(execution){const toBase=e.toBase??e.runningExecution?.toBase??2,assignments=execution.assignedRoles||[{index:toBase===2?3:4,point:layout.bases[toBase],start:.25,arrival:execution.coverETA,assignedRole:'BASE COVER'}];for(const assignment of assignments)move(assignment.index,assignment.point,assignment.start-execution.pitchArrival,assignment.assignedRole==='BACKUP'?'backup':'baseCover',assignment.arrival-execution.pitchArrival);}
  }
  const timeline=[...(e.misplayAt!=null?[{type:'MISPLAY',at:e.misplayAt,point:[...at],ballOwner:null}]:[]),...(execution?[{type:'PITCHER_MOTION',at:-execution.pitchArrival},{type:'RUNNER_START',at:execution.startTime-execution.pitchArrival},{type:'PITCH_RELEASE',at:execution.motion-execution.pitchArrival},{type:'PITCH_RECEIVE',at:0}]:[]),{type:'PLAY_ACTIVE',at:execution?-execution.pitchArrival:0,ballOwner:null},{type:e.fenceCrossing?'FENCE_CROSSING':'FIELD',at:caught,actorIndex:e.fenceCrossing?null:actual,actorKey:e.fenceCrossing?null:fielders[actual]?.key,point:[...at],ballOwner:e.fenceCrossing?null:fielders[actual]?.key}];
  const transfers=[];let owner=actual,location=[...at],ready=caught+(execution?.popup??e.handling?.pickupTime??e.defenseDecision?.timing?.pickupTime??.23);
  for(const raw of e.transfers||[]){
   const fromIndex=owner,toIndex=raw.toIndex,to=raw.toPoint||layout.bases[raw.toBase],carried=fromIndex===toIndex;
   const travel=distance(location,to)/(carried?(fielders[owner]?.moveSpeed??85):(fielders[owner]?.throwSpeed??205)),tagDelay=raw.kind==='tag'?.15:0;
   let start=e.defensivePlan?raw.start:Math.max(ready,(execution?execution.tagAt-execution.pitchArrival:raw.timing?.ballETA??0)-travel-tagDelay),receiverReady=start;
   if(!e.defensivePlan){
   if(carried){receiverReady=move(owner,to,start,'carry');}
   else {const current=trackPosition(tracks[toIndex],caught);const pending=tracks[toIndex].legs.at(-1);receiverReady=pending&&distance(pending.to,to)<.01?pending.end:move(toIndex,to,Math.max(caught,transfers.filter(t=>t.fromIndex===toIndex).at(-1)?.start??caught),'receive');}
   start=Math.max(start,receiverReady-travel);}
   const end=e.defensivePlan?raw.end:start+travel,tagAt=e.defensivePlan?raw.tagAt:end+tagDelay;
   const leg={...raw,fromIndex,toIndex,from:fielders[fromIndex],receiver:fielders[toIndex],fromPoint:[...location],toPoint:[...to],start,end,tagAt,carried,throwerKey:fielders[fromIndex]?.key,receiverKey:fielders[toIndex]?.key};transfers.push(leg);
   timeline.push({type:carried?'CARRY_START':'THROW_START',at:start,actorIndex:fromIndex,actorKey:leg.throwerKey,thrower:leg.throwerKey,origin:[...location],ballOwner:carried?leg.throwerKey:null}, {type:'RECEIVE',at:end,actorIndex:toIndex,actorKey:leg.receiverKey,point:[...to],ballOwner:leg.receiverKey});
   if(execution&&raw.kind==='tag')timeline.push({type:'TAG',at:tagAt,actorIndex:toIndex,actorKey:leg.receiverKey,runnerKey:raw.runnerKey,toBase:raw.toBase,result:raw.result,point:[...to],ballOwner:leg.receiverKey});
   owner=toIndex;location=[...to];ready=tagAt+(e.doublePlay?.25:.21);
  }
  const outActions=(e.actions||[]).filter(a=>a.result==='out'),outs=[];
  for(const action of outActions){const leg=transfers.find(t=>t.runnerKey===action.runner.key&&t.result==='out');outs.push({type:'OUT',at:leg?.tagAt??caught,runnerKey:action.runner.key,toBase:action.toBase});}
  for(let n=outs.length;n<(e.outsAfter??0)-(e.outsBefore??e.outs??0);n++)outs.push({type:'OUT',at:caught,runnerKey:e.batter?.key,toBase:1});
  outs.sort((a,b)=>a.at-b.at);outs.forEach((o,i)=>{o.outCount=Math.min(3,(e.outsBefore??e.outs??0)+i+1);});timeline.push(...outs);
  const third=outs.find(o=>o.outCount===3)?.at;
  const intents=e.runnerIntents||e.forceAtContact||[],people=new Map();(e.runnersBefore||[]).forEach((r,i)=>{if(r)people.set(r.key,{runner:r,fromBase:i+1,toBase:i+1});});
  for(const i of intents)people.set(i.runner.key,i);if(inPlay&&e.batter&&!people.has(e.batter.key))people.set(e.batter.key,{runner:e.batter,fromBase:0,toBase:1});
  for(const a of e.actions||[])if(!people.has(a.runner.key))people.set(a.runner.key,a);
  const runners=[...people.values()].map(intent=>{const actions=(e.actions||[]).filter(a=>a.runner.key===intent.runner.key),action=actions.find(a=>a.result==='out')||actions.find(a=>a.toBase===4)||actions.at(-1),out=outs.find(o=>o.runnerKey===intent.runner.key);
   const toBase=action?.toBase??intent.toBase,start=steal?(execution?execution.startTime-execution.pitchArrival:-.3):e.fenceCrossing&&intent.fromBase>0?e.fenceCrossing.at+.13:e.tagUp&&intent.fromBase>0?caught+.1:.13,runTime=(intent.fromBase===0?(e.physical?4.55:4.6):(e.physical?3.85:3.9))-(e.physical?.85:1.25)*(e.runnerSpeedByKey?.[intent.runner.key]??.5);
   const arrivalAt=steal&&execution?execution.runnerETA-execution.pitchArrival:start+runTime*Math.max(0,toBase-intent.fromBase),end=out?.at??Math.min(arrivalAt,third??Infinity);
   return {...intent,toBase,start,arrivalAt,end,outAt:out?.at??null,state:out?'out':third!=null&&arrivalAt>third?'interrupted':'safe'};
  });
  if(e.runnerDecisions){for(const r of runners){const resolved=e.runnerDecisions.find(x=>x.runner.key===r.runner.key);if(resolved){r.legs=resolved.legs;r.start=resolved.start;r.arrivalAt=resolved.legs.at(-1)?.end??resolved.start;r.end=resolved.outAt??r.arrivalAt;r.toBase=resolved.out?resolved.target:third!=null?Math.max(resolved.lastSafe,resolved.target):resolved.lastSafe;if(third!=null){r.end=Math.min(r.end,third);if(!resolved.out&&r.arrivalAt>third)r.state='interrupted';}r.outAt=resolved.outAt??null;r.state=resolved.out?'out':third!=null&&r.arrivalAt>third?'interrupted':'safe';}}}
  const completeAt=Math.max(caught,transfers.at(-1)?.tagAt??0,...outs.map(o=>o.at),third??Math.max(0,...runners.map(r=>r.end)))+.001,resetAt=completeAt+.6,resetEnd=resetAt+.85;
  timeline.push({type:'PLAY_COMPLETE',at:completeAt,ballOwner:e.fenceCrossing?null:fielders[owner]?.key,outCount:e.outsAfter??0},{type:'POSITION_RESET',at:resetAt,ballOwner:e.fenceCrossing?null:fielders[owner]?.key});timeline.sort((a,b)=>a.at-b.at);
  for(const track of tracks)for(const leg of track.legs)leg.roleCode=({primary:'PRIMARY FIELDING',secondary:'SECONDARY CHASE',backup:'BACKUP',relay:'CUTOFF',baseCover:'BASE COVER',receive:'BASE COVER',carry:'PRIMARY FIELDING'})[leg.role]||'HOLD';
  return {schemaVersion:2,clock:'seconds-since-contact',outsBefore:e.outsBefore??e.outs??0,primaryFielder:e.primaryFielder?.key,actualFielder:e.fenceCrossing?null:fielders[actual]?.key,actualIndex:actual,catchPoint:[...at],flight,landingAt:flight,caught,anticipation:e.defensivePlan?.anticipation||anticipation,tracks,transfers,runners,outs,timeline,completeAt,resetAt,resetEnd};
 }
 function samplePlay(play,time){const phase=time>=play.resetAt?'POSITION_RESET':time>=play.completeAt?'PLAY_COMPLETE':'PLAY_ACTIVE';let ballOwner=null,ballPosition=null,inFlight=null;
  for(const event of play.timeline){if(event.at>time)break;if(Object.hasOwn(event,'ballOwner'))ballOwner=event.ballOwner;if(event.point)ballPosition=event.point;}
  const positions=play.tracks.map(track=>{const t=Math.min(time,play.completeAt),at=trackPosition(track,t);if(time<play.resetAt)return at;const f=clamp((time-play.resetAt)/(play.resetEnd-play.resetAt),0,1),from=trackPosition(track,play.completeAt);return [from[0]+(track.origin[0]-from[0])*f,from[1]+(track.origin[1]-from[1])*f];});
  for(const leg of play.transfers)if(time>=leg.start&&time<leg.end){const f=(time-leg.start)/(leg.end-leg.start);ballPosition=[leg.fromPoint[0]+(leg.toPoint[0]-leg.fromPoint[0])*f,leg.fromPoint[1]+(leg.toPoint[1]-leg.fromPoint[1])*f];inFlight=leg.carried?null:leg;break;}
  const ownerIndex=play.tracks.findIndex(t=>t.key===ballOwner);if(ownerIndex>=0)ballPosition=positions[ownerIndex];
  return {phase,ballOwner,ownerIndex,ballPosition,inFlight,outCount:play.outs.filter(o=>o.at<=time).at(-1)?.outCount??play.outsBefore,positions};
 }

 // Add replay facts without drawing RNG or modifying the game's result/state.
 function annotate(g,e){
  const fielders=defense(g).map((p,index)=>({...identity(p),index,position:positions[index],moveSpeed:e.physical?SL_FIELDING.process.speed(p,index):45+12*ability(p,'speed'),throwSpeed:(index>=6?105:165)+(index>=6?35:55)*ability(p,'arm'),reaction:e.physical?SL_FIELDING.process.reaction(p):.25+.25*(1-ability(p,'fielding'))}));
  e.defensivePositions??=SL_TACTICS.alignment(g).positions;e.eventVersion=3;e.coordinateSpace=layout.coordinateSpace;e.defense=fielders;
  if(e.runningExecution){e.fielderIndex=1;e.log='ヒットエンドラン空振り / '+e.runningExecution.log;} e.playType=e.hitAndRun?'hitAndRun':e.bunt?'bunt':e.eventType==='baserunning'?'steal':e.ballType||e.outcome;
  e.primaryFielder=fielders[e.fielderIndex]||null;
  e.playDescription=e.bunt?(e.buntPop?'バント小飛球':'送りバント'):e.primaryFielder&&e.outcome==='inPlay'?labels[e.fielderIndex]+'の'+({ground:'ゴロ',line:'ライナー',fly:'フライ',homer:'本塁打の打球'}[e.ballType]||'打球'):'';
  e.forceAtContact=e.forceTrace?.atContact||((e.ballType==='ground'&&e.batter)?forcePlan(e.runnersBefore||[null,null,null],e.batter):[]);
  e.landingPosition=e.landingPoint?[...e.landingPoint]:null;
  const hit=['single','double','triple'].includes(e.result);
  const roll=!e.physical&&hit&&!e.infieldHit&&e.ballType!=='ground'?12+28*(e.battedQuality??.5):0;
  e.fieldingPoint=e.fieldingPoint||(e.landingPoint?[clamp(e.landingPoint[0]+Math.sin(e.sprayAngle||0)*roll,90,710),clamp(e.landingPoint[1]-Math.cos(e.sprayAngle||0)*roll,60,420)]:null);
  const stealProcess=e.stealExecution||e.runningExecution?.stealExecution;
  if(stealProcess)e.assignedRoles=stealProcess.assignedRoles;
  const receiver=(base,from)=>stealProcess&&base===stealProcess.toBase?stealProcess.receiverIndex:receiverIndex(base,from,e.fieldingPoint||layout.positions[from]);
  let raw=e.runningExecution?[{fromIndex:1,toBase:e.runningExecution.toBase,runnerKey:e.runningExecution.runner.key,result:e.runningExecution.caughtStealing?'out':'safe',kind:'tag'}]:e.tagUp?e.actions.filter(a=>a.type==='tagUp').map(a=>({fromIndex:e.fielderIndex,toBase:a.toBase,runnerKey:a.runner.key,result:a.result,kind:'tag'})):e.throws|| (e.throw?[e.throw]:[]);
  const outfieldReturn=e.fielderIndex>=6&&e.outcome==='inPlay'&&e.result!=='homeRun'&&e.outsAfter<3&&e.runnersAfter?.some(Boolean);
  if(!e.physical&&(hit||outfieldReturn)&&!raw.length){e.defenseDecision=SL_TACTICS.defenseDecision(g,e,currentBatter(g),{settled:true});raw=e.defenseDecision.decision==='SECURE_RETURN'?[{toBase:2,kind:'return',result:'secured'}]:[];}
  let from=e.fielderIndex;
  e.transfers=raw.map(t=>{const fromIndex=t.fromIndex??from,toIndex=t.toIndex??receiver(t.toBase,fromIndex);const action=e.actions.find(a=>a.toBase===t.toBase&&a.result==='out');const transfer={start:t.start,end:t.end,tagAt:t.tagAt,timing:t.timing||null,toPoint:t.toPoint,relay:t.relay||false,fromIndex,toIndex,toBase:t.toBase,from:fielders[fromIndex],receiver:fielders[toIndex],kind:t.kind||(e.eventType==='baserunning'?'tag':e.forceOut||e.battedResult==='groundout'||e.doublePlay?'force':'return'),runnerKey:t.runnerKey||action?.runner.key||e.runner?.key||null,result:t.result||action?.result||(e.caughtStealing?'out':'safe')};from=toIndex;return transfer;});
  // Cutoff formation is independent of whether the throw uses it.
  if(e.fielderIndex>=6&&e.fieldingPoint){
   const target=e.transfers.at(-1)?.toBase||2,base=layout.bases[target],at=e.fieldingPoint;
   const relayIndex=at[0]>440?3:5,coverIndex=relayIndex===5?3:5;
   const relayPoint=relayFormation(at,target).relayPoint;
   e.returnFormation={relayIndex,coverIndex,relayPoint,targetBase:target};
   const first=e.transfers[0];if(first&&target===2&&!first.relay&&!e.defensivePlan){first.toIndex=coverIndex;first.receiver=fielders[coverIndex];}
   if(first){
    const arm=ability(defense(g)[e.fielderIndex],'arm'),directDistance=Math.hypot(at[0]-base[0],at[1]-base[1]);
    const directETA=directDistance/(150+80*arm),relayETA=Math.hypot(at[0]-relayPoint[0],at[1]-relayPoint[1])/(150+80*arm)+.2+Math.hypot(relayPoint[0]-base[0],relayPoint[1]-base[1])/(150+80*ability(defense(g)[relayIndex],'arm'));
    const mode=(first.kind==='return'&&directDistance>90)||relayETA<directETA?'relay':'direct';
    e.returnDecision={mode:e.physical?(e.transfers[0]?.relay?'relay':'direct'):mode,directETA,relayETA,targetBase:target,catchPoint:at,arm};
    if(mode==='relay'&&!e.physical){const leg={...first,toIndex:relayIndex,receiver:fielders[relayIndex],toPoint:relayPoint,kind:'return',result:'secured',runnerKey:null};e.transfers=[leg,{...first,fromIndex:relayIndex,from:fielders[relayIndex]},...e.transfers.slice(1)];}
   }
  }
  e.runningDebug={ballType:e.ballType,catchPoint:e.fieldingPoint,batterSpeed:currentBatter(g)?.profile?.batting?.speed??null,outfielderArm:e.fielderIndex>=6?defense(g)[e.fielderIndex]?.profile?.batting?.arm:null,returnDecision:e.returnDecision||null,batterDestination:e.runnersAfter?.findIndex(r=>r?.key===e.batter?.key)+1,timingSource:stealProcess?'shared steal clock; designated receiver arrival and tag':e.physical?'shared process clock; observed-ball runner decisions':e.defenseDecision?.timing?'engine arrival-race; play timeline in seconds':'recorded result; return timeline only (advance result retains existing model)'};
  e.runningDebug.rfFirstRace=e.rfFirstRace||null;
  e.coverage=e.transfers.map(t=>({fielderIndex:t.toIndex,toBase:t.toBase,role:'baseCover'}));
  if(e.eventType==='baserunning'){e.pitchType='盗塁中の投球';e.pitchSpeed=null;e.primaryFielder=fielders[1];e.receiver=e.transfers[0]?.receiver||null;if(e.receiver)e.tag={...e.tag,fielder:e.receiver,fielderIndex:e.transfers[0].toIndex};}
  if(e.runningExecution&&e.transfers[0]){e.receiver=e.transfers[0].receiver;e.tag={...e.runningExecution.tag,fielder:e.receiver,fielderIndex:e.transfers[0].toIndex};}
  e.actualFielder=fielders[e.fieldingFielderIndex??e.fielderIndex]||null;
  e.runnerSpeedByKey=Object.fromEntries(g.teams.flatMap(t=>t.lineup).map(p=>[p.key,scaled(p,'speed',g.config)]));
  e.play=buildPlay(e);if(e.play){e.fieldEvent=e.play.timeline.find(x=>x.type==='FIELD'||x.type==='FENCE_CROSSING');e.ballOwnerAtCatch=e.play.actualFielder;e.ballOwner=e.play.timeline.find(x=>x.type==='PLAY_COMPLETE').ballOwner;e.transfers=e.play.transfers;e.throwOrigin=e.play.catchPoint;}
 }

 function field(g,p,b,pitcher){
  // Ground fixtures may provide an observed interception directly; production
  // pitches always provide physical contact parameters and use process.play.
  if(!p.physical&&p.ballType==='ground'){p.fielder={...identity(defense(g)[p.fielderIndex]),position:positions[p.fielderIndex]};return SL_TACTICS.groundPlay(g,p,b,pitcher);}
  if(!p.physical)Object.assign(p,SL_FIELDING.process.generate(g,b,{score:p.battedQuality??.5,grade:p.battedGrade||'normal'}));
  return SL_FIELDING.process.play(g,p,b,pitcher);
 }
 function steal(g,pitcher,decision=null){
  const s=g.state,from=decision?.fromBase??(s.bases[1]&&!s.bases[2]?2:s.bases[0]&&!s.bases[1]?1:0);if(!canSteal(g,from))return null;
  const runner=s.bases[from-1],speed=scaled(runner,'speed',g.config),close=Math.abs(s.score[0]-s.score[1])<=3,attempt=(.001+.028*speed**3)*(from===2?.4:1)*(s.outs===2?.8:1)*(close?1:.25)*(s.inning>=7&&close?1.2:1);
  if(!decision&&g.rng()>=attempt)return null;
  const catcher=defense(g)[1],effects=specialModifiers(currentBatter(g),pitcher),deliveredPitch=decision?.noPitch?{outcome:'swingingStrike'}:generatePitchQuality(g,pitcher,effects);
  if(!decision?.noPitch){const judgment=judgePitch(g,deliveredPitch,effects);deliveredPitch.outcome=judgment.inZone?'calledStrike':'ball';}
  const execution=stealExecution(g,runner,pitcher,from,{start:g.rng()*2-1,transfer:g.rng()*2-1,motion:g.rng()*2-1},deliveredPitch.pitchSpeed||decision?.pitchSpeed),safe=execution.runnerETA<=execution.tagAt;
  const interrupted=!decision?.noPitch&&((s.outs===2&&s.strikes===2&&deliveredPitch.outcome==='calledStrike')||(s.bases.slice(0,from).every(Boolean)&&s.balls===3&&deliveredPitch.outcome==='ball'));
  const result=interrupted?(deliveredPitch.outcome==='ball'?'walk':'strikeout'):safe?'stolenBase':'caughtStealing';
  if(decision)s.lastStealPitch=s.pitching[pitcher.key].pitches;
  if(!interrupted){s.bases[from-1]=null;if(safe){s.bases[from]=runner;s.batting[runner.key].SB++;}else{s.batting[runner.key].CS++;recordOut(g,pitcher);}move(g,runner,from,from+1,safe?'safe':'out',result);}
  return {deliveredPitch,stealExecution:execution,stealAttempt:true,stealInterrupted:interrupted,eventType:'baserunning',outcome:'steal',result,stolenBase:!interrupted&&safe,caughtStealing:!interrupted&&!safe,runner:identity(runner),runnerIntents:[{runner:identity(runner),fromBase:from,toBase:from+1}],fromBase:from,toBase:from+1,fielder:identity(catcher),fielderIndex:1,...(interrupted?{}:{throw:{from:identity(catcher),fromIndex:1,toBase:from+1,toIndex:execution.receiverIndex,target:execution.receivingFielder,runnerKey:runner.key,kind:'tag'},tag:{toBase:from+1,fielderIndex:execution.taggerIndex,fielder:execution.tagger,result:safe?'safe':'out'}}),log:interrupted?'盗塁開始後、投球の判定でプレー終了':from+'塁走者'+runner.name+'、'+(from+1)+'塁盗塁'+(safe?'成功':'失敗'),pitchType:deliveredPitch.pitchType||'盗塁中の投球',pitchSpeed:deliveredPitch.pitchSpeed||pitcher.effective.velocity};
 }

 globalThis.SL_FIELDING={buildPlay,samplePlay,trackPosition,relayFormation,groundTiming,stealCoverage,stealExecution,forcePlan,receiverIndex,geometry,field,steal,move,defense,ability,layout,canSteal,annotate};
})();

/* Process-first play resolver. No DOM; seconds and field-800x500 coordinates.
 * Installed by the fielding module. Outcome names are emitted only after play.
 */
(() => {
 'use strict';
 const F=SL_FIELDING, bases=F.layout.bases, dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const speed=(p,index)=> (index>=6?20:36)+(index>=6?5:9)*F.ability(p,'speed');
 const reaction=p=>.18+.42*(1-F.ability(p,'fielding'));
 const throwSpeed=(p,index)=> (index>=6?105:165)+(index>=6?35:55)*F.ability(p,'arm');
 const runTime=(g,p,from)=> (from===0?4.55:3.85)-.85*scaled(p,'speed',g.config);
 function generate(g,b,quality,effects={}) {
  const power=scaled(b,'power',g.config),q=quality.score;
  const exitVelocity=22+13*power+7*q+8*(g.rng()-.5);
  const launchAngle=-12+76*g.rng(),sprayAngle=(g.rng()*2-1)*Math.PI/4;
  const rad=launchAngle*Math.PI/180,type=launchAngle<9?'GROUND':launchAngle<24?'LINER':'FLY';
  const hangTime=type==='GROUND'?0:Math.max(.45,2*exitVelocity*Math.sin(rad)/9.81);
  const horizontalSpeed=exitVelocity*(type==='GROUND'?6:5*Math.cos(rad)*(type==='LINER'?.86:.60+.10*q));
  return {battedResult:null,battedQuality:q,battedGrade:quality.grade,infieldHit:false,
   physical:{exitVelocity,launchAngle,sprayAngle,type,hangTime,horizontalSpeed,deceleration:type==='GROUND'?48:62,height:Math.max(0,(exitVelocity*Math.sin(rad))**2/19.62*5)}};
 }
 function ballAt(p,t){if(p.misplayAt!=null&&t>=p.misplayAt&&t<=p.trajectory.fieldTime)return {point:[...p.fieldingPoint],height:Math.abs(Math.sin((t-p.misplayAt)*12))*3,depth:dist(bases[0],p.fieldingPoint),bounced:true};
  const x=p.physical,air=Math.min(t,x.hangTime),roll=Math.max(0,t-x.hangTime),retained=x.type==='GROUND'?1:clamp(.72-.011*Math.max(0,x.launchAngle-10),.28,.72),v=x.horizontalSpeed*retained,drag=x.type==='LINER'?48:x.deceleration,r=Math.min(roll,v/drag);
  const raw=x.horizontalSpeed*air+v*r-drag*r*r/2,projected=raw<=180?raw:180+(raw-180)*.55,height=t<x.hangTime?Math.max(0,5*(x.exitVelocity*Math.sin(x.launchAngle*Math.PI/180)*t-4.905*t*t)):0,wall=365+35*Math.cos(x.sprayAngle*2),wallRaw=180+(wall-180)/.55;
  const airHit=wallRaw/x.horizontalSpeed,landingRaw=x.horizontalSpeed*x.hangTime,remaining=wallRaw-landingRaw;
  const groundHit=remaining>0&&remaining<=v*v/(2*drag)?x.hangTime+(v-Math.sqrt(Math.max(0,v*v-2*drag*remaining)))/drag:Infinity;
  const hit=airHit<=x.hangTime?airHit:groundHit,hitHeight=hit<x.hangTime?Math.max(0,5*(x.exitVelocity*Math.sin(x.launchAngle*Math.PI/180)*hit-4.905*hit*hit)):0;
  const bounced=t>=hit&&hitHeight<=12,incoming=hit<x.hangTime?x.horizontalSpeed:Math.max(0,v-drag*(hit-x.hangTime)),backSpeed=incoming*.55*.22,backTime=bounced?Math.min(t-hit,backSpeed/drag):0;
  const d=bounced?wall-backSpeed*backTime+drag*backTime*backTime/2:projected;
  return {point:[400+Math.sin(x.sprayAngle)*d,430-Math.cos(x.sprayAngle)*d],height:bounced?0:height,depth:d,bounced};
 }
 function geometry(g,p){
  const f=F.defense(g),origins=SL_TACTICS.alignment(g).positions,x=p.physical;
  p.ballType=x.type==='GROUND'?'ground':x.type==='LINER'?'line':'fly';p.sprayAngle=x.sprayAngle;
  const landing=ballAt(p,x.hangTime),wall=365+35*Math.cos(x.sprayAngle*2);
  const candidates=[];
  for(let i=0;i<9;i++)for(let t=.08;t<14;t+=.04){const ball=ballAt(p,t);
   if(ball.depth>wall&&ball.height>12)break;
   if(x.type!=='GROUND'&&!naturalAt(origins,origins,ball.point)[i].naturalCandidate)continue;
   const route=1+.16*(1-F.ability(f[i],'fielding')),arrival=reaction(f[i])+dist(origins[i],ball.point)*route/speed(f[i],i);
   if(ball.height<=11&&arrival<=t){candidates.push({index:i,time:t,point:ball.point,height:ball.height,arrival,airborne:t<x.hangTime&&!ball.bounced});break;}
  }
  candidates.sort((a,b)=>a.time-b.time);let first=candidates[0];
  if(x.type!=='GROUND'||first?.index>=6){const pursuit=pursueAir(g,p);if(pursuit.first){first=pursuit.first;p.pursuit=pursuit;p.roleEvaluations=pursuit.history;}}
  const fenceTime=(180+(wall-180)/.55)/x.horizontalSpeed,overFence=x.hangTime>fenceTime&&ballAt(p,fenceTime).height>12;
  if(overFence&&(!first||first.time>fenceTime)){p.fenceCrossing={at:fenceTime,height:ballAt(p,fenceTime).height,wall};first={index:x.sprayAngle<-.24?6:x.sprayAngle>.24?8:7,time:fenceTime,point:ballAt(p,fenceTime).point,airborne:false};p.ballType='homer';}
  if(!first){const point=ballAt(p,14).point;first=[6,7,8].map(index=>({index,point,time:Math.max(x.hangTime,reaction(f[index])+dist(origins[index],point)/speed(f[index],index)),airborne:false})).sort((a,b)=>a.time-b.time)[0];}
  p.fielderIndex=first.index;p.landingPoint=first.airborne||x.type==='GROUND'||p.fenceCrossing?first.point:landing.point;p.fieldingPoint=first.point;p.depth=dist(bases[0],p.landingPoint);
  p.fieldDirection=x.sprayAngle<-.12?'left':x.sprayAngle>.12?'right':'center';
  p.trajectory={type:x.type,initialSpeed:x.horizontalSpeed,deceleration:x.deceleration,fieldTime:first.time,landingAt:first.airborne?first.time:x.hangTime,candidates};
  p.handling=handlingAt(g,first);
  p.interception={...first,source:'trajectory-interception'};p.fieldingApproach={from:[...origins[first.index]],to:[...first.point]};
  // Initial secondary responsibility uses only trajectory and reachable territory.
  const near=f.map((player,index)=>({index,d:dist(origins[index],ballAt(p,Math.min(.9,x.hangTime||.6)).point)})).filter(c=>c.index!==first.index&&c.index!==0&&c.index!==1).sort((a,b)=>a.d-b.d)[0];
  const secondary=near?.d<155?near.index:null,plausible=candidates.find(c=>c.index===secondary&&c.time<=first.time+.4),until=Math.min(first.time,plausible?Math.max(.35,first.time-.12):secondary==null?.35:reaction(f[secondary])+.35);
  p.chase={secondary:p.pursuit?p.pursuit.history[0]?.fielders.find(f=>f.assignedRole==='SECONDARY CHASE')?.index??null:secondary,until,point:ballAt(p,Math.min(first.time,Math.max(.9,x.hangTime*.8))).point,reason:plausible?'primary interception established':'interception window lost'};
 }
 // Candidate qualification uses relative defensive structure, before reach/ETA.
 // No coordinate boundary or maximum pursuit distance is imposed.
 function naturalAt(origins,current,point){
  const anchors=origins.map((o,i)=>[.8*o[0]+.2*current[i][0],.8*o[1]+.2*current[i][1]]);
  const distances=anchors.map(o=>dist(o,point));
  const outfielder=[6,7,8].sort((a,b)=>distances[a]-distances[b])[0];
  const depth=Math.max(.001,dist(point,bases[0])),direction=[(point[0]-400)/depth,(point[1]-430)/depth];
  const along=o=>(point[0]-o[0])*direction[0]+(point[1]-o[1])*direction[1];
  // Across an outfield gap, Euclidean ties alone overvalue a fast infielder.
  // Compare the ball-direction depth responsibility of the actual formation.
  const delegated=anchors.map((o,index)=>index<6&&along(o)>0&&Math.abs(along(o))-Math.abs(along(anchors[outfielder]))>.30*Math.abs(along(o)-along(anchors[outfielder]))&&distances[outfielder]<=distances[index]+.5*dist(o,anchors[outfielder]));
  const nearest=distances.map((d,index)=>({d,index})).filter(x=>!delegated[x.index]).sort((a,b)=>a.d-b.d)[0].index;
  return distances.map((d,index)=>{
   const overlap=(index<2?.08:.30)*dist(anchors[index],anchors[nearest]);
   const naturalCandidate=!delegated[index]&&d<=distances[nearest]+overlap+.001;
   return {naturalCandidate,candidateReason:naturalCandidate?(index===nearest?'nearest defensive responsibility':'adjacent responsibility overlaps trajectory'):delegated[index]?'outfielder owns the deeper trajectory; retain infield responsibility':(index===1?'home plate responsibility; another defender owns this trajectory':index===0?'mound responsibility; another defender owns this trajectory':'another defender has clear positional responsibility'),responsibilityDistance:d};
  });
 }
 function baseNeeds(g,context={}){
  const occupied=context.runners? [1,2,3].map(base=>context.runners.some(r=>!r.out&&r.lastSafe===base&&r.at<4)):g.state.bases;
  const advancing=context.runners? [1,2,3].map(base=>context.runners.some(r=>!r.out&&!r.retreating&&r.target===base&&r.target>r.lastSafe&&r.at<base)):[];
  const air=context.airborne,secured=context.secured;
  return [1,2,3,4].map(base=>{
   let requiredState='NOT_CURRENTLY_REQUIRED',requiredReason='no runner or next play at this base';
   if(base===4){requiredState='REQUIRED';requiredReason='HOME PLATE RESPONSIBILITY';}
   else if(occupied[base-1]||advancing[base-1]){requiredState=air?'POTENTIAL':'REQUIRED';requiredReason=advancing[base-1]?'runner advancing toward this base':air?'occupied base: return or appeal':'runner holds this base';}
   else if(base>1&&occupied[base-2]){requiredState=air&&g.state.outs<2?'POTENTIAL':'REQUIRED';requiredReason=air?'possible tag up or uncaught ball advance':'next runner destination';}
   else if(base===2&&(context.nextThrowBase===2||context.batterMayAdvanceSecond)){requiredState='POTENTIAL';requiredReason=context.nextThrowBase===2?'next throw or return targets second':'batter can reach first before fielding; prepare for second';}
   else if(base===1&&!secured){requiredState=air?'POTENTIAL':'REQUIRED';requiredReason=air?'first only if ball is not caught':'batter runner first-base race';}
   return {base,requiredState,requiredReason};
  });
 }
 function canReleaseForChase(g,index,current,fielders,primary,previous,catchAt,t){
  const base=previous[index]?.base??([null,4,1,2,3,2][index]??null);
  if(!base||!(base===4?g.state.bases.some(Boolean):g.state.bases[base-1]))return true;
  // An occupied base may need a return/tag-up play immediately after the catch.
  return fielders.some((f,i)=>i!==index&&i!==primary&&i!==1&&Math.max(t,reaction(f))+dist(current[i],bases[base])/speed(f,i)<=catchAt);
 }
 function redistribute(g,current,fielders,primary,secondary,target,previous=[],at=0,context={}){
  const assignments=current.map(point=>({role:'HOLD',point:[...point],responsibility:'BACKUP RESPONSIBILITY',roleReason:'maintain defensive structure'}));
  const used=new Set([primary,secondary].filter(i=>i!=null)),occupied=context.runners? [1,2,3].map(base=>context.runners.some(r=>!r.out&&r.lastSafe===base&&r.at<4)):g.state.bases,needs=baseNeeds(g,context),origins=SL_TACTICS.alignment(g).positions;
  // Catcher retains home unless actually handling the ball. Never an idle spare.
  if(!used.has(1)){used.add(1);assignments[1]={role:'BASE COVER',point:[...bases[4]],base:4,responsibility:'HOME PLATE RESPONSIBILITY',roleReason:'protect home plate'};}
  const cost=(task,index)=>dist(current[index],task.point)/speed(fielders[index],index)+Math.max(0,reaction(fielders[index])-at)+(task.base===2?.2*dist(origins[index],task.point)/speed(fielders[index],index):0)-(task.base&&previous[index]?.base===task.base? .12:0);
  const assign=(task,allowed)=>{const candidates=fielders.map((f,index)=>({index,cost:cost(task,index)})).filter(x=>!used.has(x.index)&&x.index!==1&&(!allowed||allowed(x.index))).sort((a,b)=>a.cost-b.cost||a.index-b.index);const chosen=candidates[0];if(chosen){used.add(chosen.index);assignments[chosen.index]={...task,point:[...task.point],roleReason:task.base===2?'inherit needed second-base responsibility: '+task.requiredReason:task.requiredReason||'support next plausible throw'};}};
  for(const need of needs.filter(n=>n.requiredState==='REQUIRED').sort((a,b)=>b.base-a.base)){
   if(assignments.some(a=>a.base===need.base))continue;
   assign({...need,point:bases[need.base],role:'BASE COVER',responsibility:'BASE RESPONSIBILITY'});
  }
  const secondNeed=needs.find(n=>n.base===2&&n.requiredState==='POTENTIAL');
  const needsCutoff=primary>=6&&(!context.airborne||occupied.some(Boolean));
  let pairedMiddle=false;
  if(secondNeed&&needsCutoff&&!used.has(3)&&!used.has(5)){
   const baseTask={...secondNeed,point:bases[2],role:'BASE COVER',responsibility:'BASE RESPONSIBILITY'},formation=F.relayFormation(target,occupied[1]||occupied[2]?4:2),cutoffTask={point:formation.relayPoint,targetBase:formation.targetBase,role:'CUTOFF',responsibility:'THROW RESPONSIBILITY'};
   const twoBRelay=cost(cutoffTask,3)+cost(baseTask,5),ssRelay=cost(cutoffTask,5)+cost(baseTask,3),relay=twoBRelay<=ssRelay?3:5,cover=relay===3?5:3;
   used.add(relay);used.add(cover);
   assignments[relay]={...cutoffTask,point:[...cutoffTask.point],roleReason:'support next plausible throw'};
   assignments[cover]={...baseTask,point:[...baseTask.point],roleReason:'inherit needed second-base responsibility: '+baseTask.requiredReason};
   pairedMiddle=true;
  }
  // Potential bases retain their nearby defender; they do not trigger a chain of holes.
  for(const need of needs.filter(n=>n.requiredState==='POTENTIAL'&&!(pairedMiddle&&n.base===2))){
   if(need.base===2||occupied[need.base-1]||need.base>1&&occupied[need.base-2]){assign({...need,point:bases[need.base],role:'BASE COVER',responsibility:'BASE RESPONSIBILITY'},i=>i>=2&&i<6);continue;}
   const resident=need.base===1?2:need.base===3?4:null;
   if(resident!=null&&!used.has(resident)&&dist(current[resident],bases[need.base])<=dist(current[resident],target)){
    used.add(resident);assignments[resident]={...need,point:[...bases[need.base]],role:'BASE COVER',responsibility:'BASE RESPONSIBILITY',roleReason:'resident prepares for possible next play'};
   }
  }
  if(needsCutoff&&!pairedMiddle){const formation=F.relayFormation(target,occupied[1]||occupied[2]?4:2);assign({point:formation.relayPoint,targetBase:formation.targetBase,role:'CUTOFF',responsibility:'THROW RESPONSIBILITY'},i=>i>=2&&i<6);}
  // Outfield backup is another outfielder, never a pitcher sent behind a fly.
  const dx=target[0]-400,dy=target[1]-430,d=Math.max(1,Math.hypot(dx,dy));
  if(primary>=2)assign({point:[target[0]+dx/d*25,target[1]+dy/d*25],role:'BACKUP',responsibility:'BACKUP RESPONSIBILITY'},i=>i>=6);
  assignments[primary]={role:'PRIMARY FIELDING',point:target,responsibility:'BALL RESPONSIBILITY',roleReason:'natural candidate wins intercept comparison'};
  if(secondary!=null)assignments[secondary]={role:'SECONDARY CHASE',point:target,responsibility:'BALL RESPONSIBILITY',roleReason:'adjacent candidate; ownership still unresolved'};
  assignments.baseEvaluations=needs.map(n=>{const assignedFielder=assignments.findIndex(a=>a.base===n.base);return {...n,assignedFielder:assignedFielder<0?null:assignedFielder,assignmentReason:assignedFielder<0?'no immediate cover movement required':assignments[assignedFielder].roleReason};});
  return assignments;
 }
 const COVER_ARRIVAL_EPS=.05;
 function advanceCover(assignment,index,fielders,current,directions,tracks,t){
  const from=[...current[index]],goal=assignment.point,d=dist(from,goal),v=speed(fielders[index],index)/(1+.16*(1-F.ability(fielders[index],'fielding'))),start=Math.max(t-.04,reaction(fielders[index]));
  const last=tracks[index].at(-1);
  if(last?.movementState==='HOLD'&&dist(last.to,goal)<=COVER_ARRIVAL_EPS){assignment.movementState='HOLD';assignment.arrivedAt=last.start;directions[index]=[0,0];return;}
  const travel=Math.min(d,Math.max(0,t-start)*v),end=d<=travel?start+d/v:t,ratio=travel/Math.max(.000001,d);
  current[index]=[from[0]+(goal[0]-from[0])*ratio,from[1]+(goal[1]-from[1])*ratio];directions[index]=[current[index][0]-from[0],current[index][1]-from[1]];
  if(travel>0){if(last&&last.role==='baseCover'&&last.movementState!=='HOLD'&&dist(last.goal||last.to,goal)<.000001&&Math.abs(last.end-start)<.000001){last.end=end;last.to=[...current[index]];}else tracks[index].push({from,to:[...current[index]],goal:[...goal],start,end,role:'baseCover',movementState:'MOVING',base:assignment.base});}
  if(d<=travel){assignment.movementState='HOLD';assignment.arrivedAt=end;tracks[index].push({from:[...current[index]],to:[...current[index]],goal:[...goal],start:end,end,role:'baseCover',movementState:'HOLD',base:assignment.base});}
  else assignment.movementState='MOVING';
 }
 // Earliest reachable low trajectory point, including the rising liner window.
 function interceptEstimate(p,f,index,current,t,samples=null,qualifies=null){
  const route=1+.16*(1-F.ability(f,'fielding')),v=speed(f,index);let fallback=null;
  for(let step=Math.ceil(t/.04);step<=350;step++){
   const future=step*.04,ball=samples?samples[step]:ballAt(p,future);if(ball.height>11||qualifies&&!qualifies(step))continue;
   const arrival=Math.max(t,reaction(f))+dist(current,ball.point)*route/v;
   fallback={point:ball.point,time:future,arrival,airborne:future<p.physical.hangTime&&!ball.bounced};
   if(arrival<=future+.001)return fallback;
  }
  return fallback&&!qualifies?{...fallback,time:Math.max(14,fallback.arrival),airborne:false}:{point:[...current],time:Infinity,arrival:Infinity,airborne:false};
 }
 function pursueAir(g,p) {
  const fielders=F.defense(g),origins=SL_TACTICS.alignment(g).positions;
  const current=origins.map(x=>[...x]),directions=origins.map(()=>[0,0]),tracks=origins.map(()=>[]),history=[];
  let primary=null,secondary=null,lastRoles=Array(9).fill('HOLD'),lastBases=Array(9).fill(null),first=null,assignments=[],assignmentKey=null,ownerSince=0;
  const landingTime=p.physical.hangTime,landing=ballAt(p,landingTime).point,samples=Array.from({length:351},(_,i)=>ballAt(p,i*.04));
  for(let step=1;step<=350;step++){
   const t=step*.04,ball=ballAt(p,t);
   if(ball.depth>365+35*Math.cos(p.physical.sprayAngle*2)&&ball.height>12)break;
   if(step===1||step%3===0){
    const qualifications=samples.map(ball=>naturalAt(origins,current,ball.point));
    const estimates=fielders.map((f,index)=>{const intercept=interceptEstimate(p,f,index,current[index],t,samples,step=>qualifications[step][index].naturalCandidate);
     const eligible=qualifications.find((q,step)=>step*.04>=Math.max(t,reaction(f))&&samples[step].height<=11&&q[index].naturalCandidate);
     const qualification=Number.isFinite(intercept.time)?naturalAt(origins,current,intercept.point)[index]:eligible?.[index]||naturalAt(origins,current,landing)[index];
     return {index,position:['P','C','1B','2B','3B','SS','LF','CF','RF'][index],...qualification,naturalCandidate:!!eligible,interceptETA:intercept.time,currentPosition:[...current[index]],movementDirection:[...directions[index]],distanceToLanding:dist(current[index],landing),estimatedArrival:intercept.time,interceptPoint:intercept.point,interceptProbability:intercept.airborne?1:0,catchability:intercept.airborne?1:0,route:1+.16*(1-F.ability(f,'fielding')),movementSpeed:speed(f,index),turnDelay:0};
    }).sort((a,b)=>a.estimatedArrival-b.estimatedArrival||a.responsibilityDistance-b.responsibilityDistance||a.index-b.index);
    const best=estimates[0],incumbent=estimates.find(x=>x.index===primary);
    if(!incumbent||!incumbent.naturalCandidate||best.estimatedArrival+.12<incumbent.estimatedArrival||best.catchability>incumbent.catchability){if(primary!==best.index)ownerSince=t;primary=best.index;}
    const owner=estimates.find(x=>x.index===primary);
    // Competition is temporary. Equal catch times alone do not justify pursuit.
    const ownershipConfirmed=owner.catchability>0&&t>=Math.max(ownerSince,reaction(fielders[primary]))+.36;
    secondary=!ownershipConfirmed?estimates.find(x=>x.index!==primary&&x.naturalCandidate&&x.catchability>0&&owner.catchability>0&&x.estimatedArrival<=owner.estimatedArrival+.12&&Math.abs(x.responsibilityDistance-owner.responsibilityDistance)<dist(origins[x.index],origins[primary])*.30&&canReleaseForChase(g,x.index,current,fielders,primary,assignments,owner.estimatedArrival,t))?.index??null:null;
    const previousAssignments=assignments;
    const airborne=t<landingTime&&!ball.bounced;
    const batterMayAdvanceSecond=owner.catchability===0&&owner.estimatedArrival>=runTime(g,currentBatter(g),0);
    const nextKey=JSON.stringify([primary,secondary,airborne,batterMayAdvanceSecond,g.state.outs,g.state.bases.map(r=>r?.key)]),responsibilityReevaluated=nextKey!==assignmentKey;
    if(nextKey!==assignmentKey){assignments=redistribute(g,current,fielders,primary,secondary,owner.interceptPoint,assignments,t,{airborne,batterMayAdvanceSecond});assignmentKey=nextKey;}
    // Keep the selected support roles; only their ball-dependent destinations follow the latest intercept.
    if(!responsibilityReevaluated){
     const point=owner.interceptPoint,occupied=g.state.bases,relay=F.relayFormation(point,occupied[1]||occupied[2]?4:2).relayPoint;
     const dx=point[0]-400,dy=point[1]-430,d=Math.max(1,Math.hypot(dx,dy)),backup=[point[0]+dx/d*25,point[1]+dy/d*25];
     for(const a of assignments){const goal=a.role==='CUTOFF'?relay:a.role==='BACKUP'?backup:null;if(goal&&dist(a.point,goal)>1)a.point=[...goal];}
    }
    assignments[primary].point=owner.interceptPoint;
    const vacatedResponsibilities=[1,2,3,4].flatMap(base=>{const from=previousAssignments.findIndex(a=>a.base===base),to=assignments.findIndex(a=>a.base===base);return from>=0&&from!==to?[{base,from,to,at:t,reason:'previous defender changed responsibility'}]:[];});
    if(secondary!=null)assignments[secondary].point=estimates.find(x=>x.index===secondary).interceptPoint;
    const rows=estimates.sort((a,b)=>a.index-b.index).map(x=>{const a=assignments[x.index],role=a.role,wasChasing=['PRIMARY FIELDING','SECONDARY CHASE'].includes(lastRoles[x.index]),chasing=['PRIMARY FIELDING','SECONDARY CHASE'].includes(role),changed=lastRoles[x.index]!==role||lastBases[x.index]!==a.base;lastRoles[x.index]=role;lastBases[x.index]=a.base;return {...x,role,movementState:a.movementState??(role==='HOLD'?'HOLD':'MOVING'),arrivedAt:a.arrivedAt??null,roleReason:a.roleReason,chaseStart:chasing&&!wasChasing?t:null,chaseEnd:wasChasing&&!chasing?t:null,chaseExitReason:wasChasing&&!chasing?'ownership resolved or natural intercept window lost':null,nextResponsibility:a.responsibility,assignedRole:role,responsibility:a.responsibility,base:a.base??null,targetPoint:a.point,roleChangeTime:changed?t:null,reasonForRoleChange:changed?a.roleReason:null};});
    history.push({at:t,responsibilityReevaluated,primary,secondary,baseEvaluations:assignments.baseEvaluations,vacatedResponsibilities,predictedLandingPoint:landing,predictedLandingTime:landingTime,remainingTime:Math.max(0,landingTime-t),initialBallSpeed:p.physical.horizontalSpeed,ballSpeed:dist(ballAt(p,Math.max(0,t-.04)).point,ball.point)/.04,trajectory:p.physical.type,fielders:rows});
   }
   for(let index=0;index<9;index++){const assignment=assignments[index];if(t<reaction(fielders[index])||assignment.role==='HOLD')continue;if(assignment.role==='BASE COVER'){advanceCover(assignment,index,fielders,current,directions,tracks,t);continue;}const goal=assignment.point,from=[...current[index]],d=dist(from,goal),route=1+.16*(1-F.ability(fielders[index],'fielding')),travel=Math.min(d,(t-Math.max(t-.04,reaction(fielders[index])))*speed(fielders[index],index)/route),ratio=travel/Math.max(.001,d);current[index]=[from[0]+(goal[0]-from[0])*ratio,from[1]+(goal[1]-from[1])*ratio];directions[index]=[current[index][0]-from[0],current[index][1]-from[1]];const role=({'PRIMARY FIELDING':'primary','SECONDARY CHASE':'secondary','BASE COVER':'baseCover',CUTOFF:'relay',BACKUP:'backup'})[assignment.role],last=tracks[index].at(-1);if(last&&last.role===role&&dist(last.goal,goal)<.001&&Math.abs(last.end-(t-.04))<.001){last.end=t;last.to=[...current[index]];}else tracks[index].push({from,to:[...current[index]],goal:[...goal],start:Math.max(t-.04,reaction(fielders[index])),end:t,role});}
   const owner=[primary,secondary].filter(i=>i!=null&&t>=reaction(fielders[i])&&dist(current[i],ball.point)<=1).sort((a,b)=>dist(current[a],ball.point)-dist(current[b],ball.point))[0];
   if(owner!=null&&ball.height<=11){first={index:owner,time:t,point:ball.point,height:ball.height,arrival:t,airborne:t<landingTime&&!ball.bounced};break;}
  }
  return {first,tracks,history,assignments};
 }
 function handlingAt(g,first){const f=F.defense(g)[first.index],origin=SL_TACTICS.alignment(g).positions[first.index],effort=clamp(dist(origin,first.point)/(Math.max(.1,first.time-reaction(f))*speed(f,first.index)),0,1);return {effort,pickupTime:.18+.25*(1-F.ability(f,'catching'))+.35*effort**3,throwRisk:.002+.016*(1-F.ability(f,'arm'))**2+.015*effort**4};}
 function turnDelay(p,index,to){if(index!==p.fielderIndex||!p.fieldingApproach)return 0;const {from, to:at}=p.fieldingApproach,dx=at[0]-from[0],dy=at[1]-from[1],tx=to[0]-at[0],ty=to[1]-at[1],cosine=(dx*tx+dy*ty)/Math.max(.01,Math.hypot(dx,dy)*Math.hypot(tx,ty));return .10*(1-clamp(cosine,-1,1))*(p.handling?.effort??0);}
 function moveTrack(g,p,index,to,start,role,end=null){const track=p.defensivePlan.tracks[index],from=F.trackPosition(track,start);track.legs=track.legs.filter(l=>l.start<start);const last=track.legs.at(-1);if(last&&last.end>start){last.end=start;last.to=from;}if(role==='hold'||role==='baseCover'&&dist(from,to)<=COVER_ARRIVAL_EPS){track.legs.push({from,to:[...from],start,end:start,role,movementState:'HOLD'});return start;}const arrival=end??start+dist(from,to)/speed(F.defense(g)[index],index);track.legs.push({from,to:[...to],start,end:Math.max(start+.001,arrival),role});return arrival;}
 function defensePlan(g,p){
  const origins=SL_TACTICS.alignment(g).positions,primary=p.fielderIndex,fielders=F.defense(g),secondary=p.chase?.secondary;
  p.defensivePlan={tracks:origins.map((origin,index)=>({index,key:fielders[index].key,origin:[...origin],initialRole:'HOLD',legs:[]})),anticipation:null};
  const at=p.interception.point,time=p.interception.time,origin=origins[primary],fraction=p.fenceCrossing?Math.min(1,Math.max(0,time-reaction(fielders[primary]))*speed(fielders[primary],primary)/Math.max(.01,dist(origin,at))):1;
  moveTrack(g,p,primary,[origin[0]+(at[0]-origin[0])*fraction,origin[1]+(at[1]-origin[1])*fraction],reaction(fielders[primary]),'primary',time);
  if(p.trajectory.fieldTime>time)moveTrack(g,p,primary,p.fieldingPoint,time,'primary',p.trajectory.fieldTime);
  if(secondary!=null&&secondary!==primary){const start=reaction(fielders[secondary]),until=Math.max(start+.01,p.chase.until),from=origins[secondary],target=p.chase.point,ratio=Math.min(1,(until-start)*speed(fielders[secondary],secondary)/Math.max(.01,dist(from,target)));moveTrack(g,p,secondary,[from[0]+(target[0]-from[0])*ratio,from[1]+(target[1]-from[1])*ratio],start,'secondary',until);}
  const cover=(index,base)=>{
   if(index===primary)return;
   const urgent=p.physical.type==='GROUND'&&(base===2&&[3,5].includes(primary)||base===1&&primary===2);
   const release=index===secondary?(urgent?Math.min(p.chase.until,Math.max(reaction(fielders[index])+.12,reaction(fielders[primary])+.2)):p.chase.until):.25;
   moveTrack(g,p,index,bases[base],release,'baseCover');
  };
  // Assign each vacant responsibility once; a later cover must not overwrite it.
  const first=primary===2?(dist(at,bases[1])>45?([0,3].sort((a,b)=>{
   const cost=i=>dist(origins[i],bases[1])/speed(fielders[i],i)+(i===secondary?p.chase.until:0)+(i===3&&g.state.bases[0]?.key? .35:0);
   return cost(a)-cost(b);
  })[0]):null):2;
  if(first!=null)cover(first,1);
  const middle=primary===3||first===3?5:3;cover(middle,2);
  const lineBackup=primary===4&&(at[0]<260||p.physical.sprayAngle<-.4);
  const third=primary===4?(lineBackup?0:5):4;
  if(third!==first&&third!==middle)cover(third,3);
  cover(primary===1?0:1,4);
  if(lineBackup){const dx=at[0]-400,dy=at[1]-430,d=Math.max(1,Math.hypot(dx,dy));moveTrack(g,p,5,[at[0]+dx/d*22,at[1]+dy/d*22],secondary===5?p.chase.until:.25,'backup');}
  p.defensivePlan.responsibilities={first:first??primary,second:middle,third:primary===4?third:4,home:primary===1?0:1};
  p.defensivePlan.handoff={primary,secondary,occupied:g.state.bases.map(Boolean),source:'vacated-base-and-next-play'};
  if(primary>=6){const formation=F.relayFormation(p.landingPoint,g.state.bases[1]||g.state.bases[2]?4:2),recognizedAt=.35;p.defensivePlan.anticipation={...formation,recognizedAt,source:'observed-trajectory-and-runners'};moveTrack(g,p,formation.relayIndex,formation.relayPoint,formation.relayIndex===secondary?p.chase.until:recognizedAt,'relay');cover(formation.coverIndex,2);p.defensivePlan.responsibilities.second=formation.coverIndex;}
  else if(secondary!=null&&secondary>=6){const dx=at[0]-400,dy=at[1]-430,d=Math.max(1,Math.hypot(dx,dy));moveTrack(g,p,secondary,[at[0]+dx/d*25,at[1]+dy/d*25],p.chase.until,'backup');}
  if(p.pursuit){
   p.defensivePlan.tracks=origins.map((origin,index)=>({index,key:fielders[index].key,origin:[...origin],initialRole:'HOLD',legs:p.pursuit.tracks[index].map(l=>({...l}))}));
   const current=p.defensivePlan.tracks.map(track=>F.trackPosition(track,time));
   const assignments=redistribute(g,current,fielders,primary,null,at,p.pursuit.assignments,time,{secured:p.interception.airborne,nextThrowBase:!p.interception.airborne&&primary>=6?2:null,batterMayAdvanceSecond:!p.interception.airborne&&time>=runTime(g,currentBatter(g),0)}),responsibilities={};
   assignments.forEach((a,i)=>{if(i!==primary)moveTrack(g,p,i,a.point,time,({'BASE COVER':'baseCover',CUTOFF:'relay',BACKUP:'backup',HOLD:'hold'})[a.role]);if(a.base)responsibilities[['','first','second','third','home'][a.base]]=i;});
   // Gather the sub-unit glove reach during pickup; do not teleport to the ball.
   if(dist(current[primary],p.fieldingPoint)>.001)moveTrack(g,p,primary,p.fieldingPoint,time,'primary');
   if(p.trajectory.fieldTime>time)moveTrack(g,p,primary,p.fieldingPoint,time,'primary',p.trajectory.fieldTime);
   p.defensivePlan.responsibilities=responsibilities;p.defensivePlan.roleEvaluations=p.roleEvaluations;
   const relay=assignments.findIndex(a=>a.role==='CUTOFF');
   p.defensivePlan.anticipation=relay<0?null:{relayIndex:relay,relayPoint:assignments[relay].point,coverIndex:responsibilities.second,targetBase:assignments[relay].targetBase,recognizedAt:time,source:'current-responsibility-allocation'};
  }
  return p.defensivePlan;
 }
 function redistributeTransfer(g,p,owner,receiver,to,t,runners){
  if(!p.pursuit)return; // Existing ground/DP sequence is preserved.
  const fielders=F.defense(g),current=p.defensivePlan.tracks.map(track=>F.trackPosition(track,t));
  const existingRelay=p.defensivePlan.anticipation,returningToExistingRelay=owner>=6&&existingRelay?.relayIndex===receiver&&dist(to,existingRelay.relayPoint)<.001;
  const assignments=redistribute(g,current,fielders,owner,receiver===owner?null:receiver,to,[],t,{runners,nextThrowBase:[1,2,3,4].find(base=>dist(to,bases[base])<.001)??(p.defensivePlan.anticipation&&dist(to,p.defensivePlan.anticipation.relayPoint)<.001?p.defensivePlan.anticipation.targetBase:null)});
  // Receiving the throw fulfils this base's responsibility; release its spare.
  for(let i=0;i<assignments.length;i++){const a=assignments[i];if(i===owner||i===receiver)continue;if(returningToExistingRelay&&a.role==='CUTOFF'){a.role='HOLD';a.point=[...current[i]];a.responsibility='BACKUP RESPONSIBILITY';a.roleReason='existing cutoff receives outfield return; no second cutoff';moveTrack(g,p,i,a.point,t,'hold',t);continue;}if(a.base&&dist(a.point,to)<.001){a.role='BACKUP';a.responsibility='BACKUP RESPONSIBILITY';a.point=[to[0],to[1]+24];a.base=null;}moveTrack(g,p,i,a.point,t,({'BASE COVER':'baseCover',CUTOFF:'relay',BACKUP:'backup',HOLD:'hold'})[a.role]);}
  p.defensivePlan.transitions??=[];p.defensivePlan.transitions.push({at:t,reason:'throw receiver changes responsibility',owner,receiver,to,assignments});
 }
 function receiverFor(p,base,owner,point){const near=dist(point,bases[base]);if(near<12||near<45&&((base===1&&owner===2)||(base===3&&owner===4)||(base===4&&owner===1)))return owner;const cover=p.defensivePlan?.tracks.find(track=>track.index!==owner&&['baseCover','receive'].includes(track.legs.at(-1)?.role)&&dist(track.legs.at(-1).to,bases[base])<.001);return cover?.index??F.receiverIndex(base,owner,point);}
 function groundTracks(g,p){let owner=p.fielderIndex,point=p.fieldingPoint;const fielders=F.defense(g);for(const raw of p.throws||(p.throw?[p.throw]:[])){const toIndex=raw.toIndex??receiverFor(p,raw.toBase,owner,point),to=raw.toPoint||bases[raw.toBase],kind=raw.kind||'force',travel=dist(point,to)/(owner===toIndex?speed(fielders[owner],owner):throwSpeed(fielders[owner],owner)),tagAt=raw.timing.ballETA,end=tagAt-(kind==='tag'?.15:0),start=end-travel;Object.assign(raw,{fromIndex:owner,toIndex,toPoint:to,kind,start,end,tagAt});if(owner===toIndex)moveTrack(g,p,owner,to,start,'carry',end);else moveTrack(g,p,toIndex,to,raw.timing.fieldTime,'receive');owner=toIndex;point=to;}}
 function coverTime(g,p,index,to,t){const track=p.defensivePlan.tracks[index],leg=track.legs.at(-1);if(leg&&dist(leg.to,to)<.001)return Math.max(t,leg.end);return t+dist(F.trackPosition(track,t),to)/speed(F.defense(g)[index],index);}
 function creditHit(g,b,pitcher,result){const s=g.state,bs=s.batting[b.key],ps=s.pitching[pitcher.key];bs.H++;ps.H++;s.hits[offense(g)]++;if(result==='double')bs.doubles++;if(result==='triple')bs.triples++;if(result==='homeRun'){bs.HR++;ps.HR++;}}
 function classify(p,history,b){
  if(p.error)return 'error';
  if(p.fenceCrossing)return 'homeRun';
  if(p.interception.airborne)return p.ballType==='line'?'lineout':'flyout';
  const out=history.find(a=>a.runner.key===b.key&&a.result==='out');
  const otherAttempt=(p.throws||[]).some(t=>t.runnerKey&&t.runnerKey!==b.key&&t.kind!=='return');
  if(otherAttempt&&!out&&p.firstBaseOpportunity)return 'fieldersChoice';
  if(out&&out.toBase===1)return 'groundout';
  const reached=p.runnerDecisions?.find(r=>r.runner.key===b.key)?.lastSafe??1;
  return reached>=3?'triple':reached===2?'double':'single';
 }
 // Read only the current fielders and the visible trajectory, never interception.airborne.
 function flyObservation(g,p,t){
  const fielders=F.defense(g),remaining=Math.max(0,p.physical.hangTime-t);let best=null;
  for(let index=0;index<9;index++){
   const track=p.defensivePlan.tracks[index],active=track.legs.find(l=>l.start<=t&&l.end>=t)||track.legs.find(l=>l.start>t)||track.legs.at(-1);
   if(p.pursuit&&!['primary','secondary'].includes(active?.role))continue;
   const current=F.trackPosition(track,t);
   for(let future=t+.001;future<p.physical.hangTime;future+=.08){
    const ball=ballAt(p,future);if(ball.bounced||ball.height>16)continue;
    const distance=dist(current,ball.point),reach=(future-t)*speed(fielders[index],index)+12;
    if(distance<=reach){const candidate={index,at:future,point:ball.point,depth:ball.depth,current,effort:clamp(distance/Math.max(1,reach),0,1),arm:F.ability(fielders[index],'arm')};if(!best||future<best.at-.001||Math.abs(future-best.at)<.001&&distance<dist(best.current,best.point))best=candidate;break;}
   }
  }
  return {at:t,remaining,catchPossible:!!best,candidate:best,source:'current-positions-and-visible-trajectory'};
 }
 function flyRunningRead(g,p,r,outs,observation){
  const next=r.from+1,run=runTime(g,r.runner,r.from),c=observation.candidate;
  const inputs={outs,base:r.from,nextBase:next,runTime:run,nextDistance:dist(bases[r.from],bases[next]),direction:p.physical.sprayAngle,hangTime:p.physical.hangTime,...observation};
  if(outs===2)return {mode:'TWO_OUT_RUN',lead:1,inputs};
  if(!c)return {mode:'GO_ON_CONTACT',lead:1,inputs};
  const f=F.defense(g)[c.index],set=.18+.25*(1-F.ability(f,'catching'))+.35*c.effort**3;
  const returnTime=set+dist(c.point,bases[next])/throwSpeed(f,c.index)+.15,margin=returnTime-run;
  Object.assign(inputs,{predictedCatchPoint:c.point,outfielderArm:c.arm,predictedSetTime:set,returnTime,margin});
  // Different bases have different reward/risk; these choose intent, never SAFE.
  const tag=c.index>=6&&(r.from===1?c.depth>310&&margin>.35:r.from===2?c.depth>245&&margin>.15:c.depth>225&&margin>-.25);
  if(tag)return {mode:'TAG_UP_PREP',lead:0,inputs};
  if(c.index<6||c.depth<205)return {mode:'STAY',lead:0,inputs};
  const backThrow=set+dist(c.point,bases[r.from])/throwSpeed(f,c.index);
  return {mode:'READ_HOLD',lead:clamp(Math.min(backThrow/run*.38,observation.remaining/run*.45),.04,.28),inputs};
 }
 function runnerAt(r,t){const leg=r.legs.at(-1);return leg?leg.fromBase+(leg.toBase-leg.fromBase)*clamp((t-leg.start)/Math.max(.001,leg.end-leg.start),0,1):r.at;}
 function runnerLeg(g,r,to,t){
  const from=runnerAt(r,t),last=r.legs.at(-1);if(last&&last.end>t){last.toBase=from;last.end=t;}
  r.at=from;r.legs.push({fromBase:from,toBase:to,start:t,end:t+Math.max(.001,Math.abs(to-from)*runTime(g,r.runner,Math.max(r.from,r.lastSafe)))});
 }
 function retouchAfterCatch(g,runners,fieldTime){
  for(const r of runners.filter(r=>r.from>0&&!r.out)){
   r.at=runnerAt(r,fieldTime);r.lastSafe=r.from;r.mandatory=false;r.target=r.from;
   r.retouchRequired=r.at>r.from+.001;r.retouchAt=r.retouchRequired?null:fieldTime;
   if(r.retouchRequired){runnerLeg(g,r,r.from,fieldTime);r.retreating=true;r.decisions.push({at:fieldTime,decision:'TAG_RETURN',base:r.from,returnETA:r.legs.at(-1).end});}
   else if(r.flyMode==='TAG_UP_PREP'&&!runners.some(a=>a.from>r.from&&!a.out&&a.at<r.from+1.2)){
    r.target=r.from+1;r.tagReleased=true;runnerLeg(g,r,r.target,fieldTime);r.decisions.push({at:fieldTime,decision:'TAG_UP_START',base:r.from});
   }
  }
 }
 function runningTargets(g,p,runners,owner,ballPoint,t){
  const fielders=F.defense(g);
  return runners.filter(r=>!r.out&&(r.retouchRequired||r.target>r.lastSafe)).map(r=>{
   const appeal=r.retouchRequired,toBase=appeal?r.from:r.target,toIndex=receiverFor(p,toBase,owner,ballPoint),travel=dist(ballPoint,bases[toBase])/(owner===toIndex?speed(fielders[owner],owner):throwSpeed(fielders[owner],owner)),cover=owner===toIndex?t:coverTime(g,p,toIndex,bases[toBase],t),start=Math.max(t+turnDelay(p,owner,bases[toBase]),cover-travel),end=start+travel,runnerETA=r.legs.at(-1)?.end??Infinity,kind=appeal?'appeal':r.from===0&&toBase===1?'force':'tag';
   return {r,toBase,toIndex,start,end,kind,tagAt:end+(kind==='tag'?.15:0),runnerETA};
  }).filter(a=>a.tagAt<a.runnerETA+.25).sort((a,b)=>(a.kind==='appeal'?-1:0)-(b.kind==='appeal'?-1:0)||b.toBase-a.toBase);
 }
 function outAtTransfer(r,transfer){
  const at=runnerAt(r,transfer.tagAt);
  return transfer.kind==='appeal'?r.retouchRequired&&(r.retouchAt==null||r.retouchAt>transfer.tagAt)&&at>r.from+.001:r.target===transfer.toBase&&at<transfer.toBase-.001;
 }
 function retireOnTransfer(g,runners,transfer,pitcher){
  if(g.state.outs>=3)return;
  const r=runners.find(r=>r.runner.key===transfer.runnerKey);
  if(r&&!r.out){
   const out=outAtTransfer(r,transfer);
   if(out){r.out=true;r.outAt=transfer.tagAt;recordOut(g,pitcher);F.move(g,r.runner,r.from,transfer.toBase,'out',transfer.kind==='appeal'?'retouchOut':'tagOut');transfer.result='out';}else transfer.result='safe';
  }
 }
 function play(g,p,b,pitcher){
  geometry(g,p);const s=g.state,f=F.defense(g)[p.fielderIndex];
  if(p.fenceCrossing){defensePlan(g,p);advanceHit(g,b,pitcher,4,p);creditHit(g,b,pitcher,'homeRun');p.record={source:'completed-play-history',fenceCrossing:p.fenceCrossing};return 'homeRun';}
  if(p.ballType==='ground'&&p.fielderIndex<6){p.fielder={...identity(f),position:F.defense(g)[p.fielderIndex].profile.mainPosition};defensePlan(g,p);const result=SL_TACTICS.groundPlay(g,p,b,pitcher);groundTracks(g,p);p.record={source:'completed-play-history',classification:result,fieldingChoice:p.fieldingChoice||null,classificationReason:result==='fieldersChoice'?'another runner targeted; batter remains safe':result==='groundout'?'batter retired at first':result,outs:s.outs,actions:clone(s.playActions),batterKey:b.key,batterBase:s.bases.findIndex(r=>r?.key===b.key)+1,fieldingIndex:p.fielderIndex,target:p.throw?.toBase??null,fieldingMistake:p.fieldingMistake,throws:p.throws||(p.throw?[p.throw]:[])};return result;}
  const catchRisk=.002+.018*(1-F.ability(f,'catching'))**2+.012*p.handling.effort**4;
  if(p.interception.airborne&&g.rng()<catchRisk){p.fieldingMistake={type:'catching',costOut:null};p.errorType='catching';p.interception.airborne=false;p.misplayAt=p.trajectory.fieldTime;p.recoveryTime=.65;p.trajectory.fieldTime+=p.recoveryTime;}
  defensePlan(g,p);
  const caught=p.interception.airborne,fieldTime=p.trajectory.fieldTime;
  p.firstBaseOpportunity=fieldTime+p.handling.pickupTime+turnDelay(p,p.fielderIndex,bases[1])+dist(p.fieldingPoint,bases[1])/throwSpeed(f,p.fielderIndex)<.13+runTime(g,b,0);
  const outsAtContact=s.outs;
  const original=[...s.bases],forced=F.forcePlan(original,b),actors=original.flatMap((r,i)=>r?[{runner:r,from:i+1}]:[]);
  actors.push({runner:b,from:0});
  const runners=actors.map(a=>{const mandatory=outsAtContact===2||(a.from===0||p.ballType==='ground'||p.hitAndRun)&&forced.some(r=>r.runner.key===a.runner.key&&r.force);return {...a,lastSafe:a.from,at:a.from,target:mandatory?a.from+1:a.from,start:a.from===0?.13:p.hitAndRun?-.65:.18,legs:[],decisions:[],mandatory};});
  const fielders=F.defense(g);let owner=p.fielderIndex,ballPoint=p.fieldingPoint,ready=fieldTime+p.handling.pickupTime,transfer=null,secured=false;
  for(const r of runners)if(r.start<0&&r.target>r.lastSafe)r.legs.push({fromBase:r.lastSafe,toBase:r.target,start:r.start,end:r.start+runTime(g,r.runner,r.lastSafe)});
  p.throws=[];let end=0,fieldResolved=false,nextRead=0,observation={candidate:null};
  for(let t=0;t<32&&s.outs<3;t+=.04){end=t;
   if(!fieldResolved&&t>=fieldTime){
    fieldResolved=true;
    if(caught){
     const batterRunner=runners.find(r=>r.from===0);batterRunner.out=true;batterRunner.outAt=fieldTime;recordOut(g,pitcher);F.move(g,b,0,1,'out','catchOut');
     if(s.outs<3)retouchAfterCatch(g,runners,fieldTime);
     if(s.outs>=3)break;
    }
   }
   if(transfer&&t>=transfer.tagAt){
    owner=transfer.toIndex;ballPoint=transfer.toPoint||bases[transfer.toBase];ready=transfer.tagAt+.23;secured=!transfer.relay;transfer.arrived=true;
    retireOnTransfer(g,runners,transfer,pitcher);
    if(s.outs<3)redistributeTransfer(g,p,owner,owner,ballPoint,transfer.tagAt,runners);
    transfer=null;if(s.outs>=3)break;
   }
   if(!fieldResolved&&original.some(Boolean)&&outsAtContact<2&&t>=nextRead){observation=flyObservation(g,p,t);nextRead=t+.12;}
   for(const r of runners){if(r.out||r.lastSafe===4||t<r.start)continue;
    r.at=runnerAt(r,t);
    if(r.from>0&&!fieldResolved&&t<p.physical.hangTime&&(p.misplayAt==null||t<p.misplayAt)){
     const proposed=flyRunningRead(g,p,r,outsAtContact,observation);
     if(!r.flyRead){r.flyRead=proposed;r.readSince=t;r.pendingMode=proposed.mode;r.pendingSince=t;}
     if(proposed.mode!==r.pendingMode){r.pendingMode=proposed.mode;r.pendingSince=t;}
     if(proposed.mode!==r.flyRead.mode&&t-r.readSince>=.36&&t-r.pendingSince>=.24){r.flyRead=proposed;r.readSince=t;}
     const read=r.flyRead;
     if(r.flyMode!==read.mode){r.decisions.push({at:t,decision:read.mode,inputs:read.inputs});r.flyMode=read.mode;}
     if(!['GO_ON_CONTACT','TWO_OUT_RUN'].includes(read.mode)){
      r.mandatory=false;r.target=r.from;const desired=r.from+read.lead;
      if(!r.legs.length||Math.abs(r.legs.at(-1).toBase-desired)>.02)runnerLeg(g,r,desired,t);
      r.at=runnerAt(r,t);continue;
     }
    }
    if(!r.retreating&&transfer?.runnerKey===r.runner.key&&transfer.kind!=='appeal'&&!r.mandatory&&r.target>r.lastSafe&&r.at-r.lastSafe<.4&&transfer.tagAt<(r.legs.at(-1)?.end??0)&&(!r.tagReleased||t>=transfer.start+.18&&transfer.tagAt+.25<(r.legs.at(-1)?.end??0))){
     runnerLeg(g,r,r.lastSafe,t);r.target=r.lastSafe;r.retreating=true;if(r.from===0)r.continueTo=null;r.decisions.push({at:t,base:r.lastSafe,decision:'RETURN',ballState:'throw',ballPoint:[...ballPoint]});
    }
    if(!r.retreating&&r.target===r.lastSafe){
     const next=r.lastSafe+1,eta=t+runTime(g,r.runner,r.lastSafe),returnETA=Math.max(t,ready)+dist(ballPoint,bases[next])/throwSpeed(fielders[owner],owner)+.15;
     const loose=!fieldResolved,observedBall=loose?ballAt(p,t):{point:ballPoint,height:0},fielderNow=F.trackPosition(p.defensivePlan.tracks[p.fielderIndex],t),remaining=loose?Math.max(observedBall.height>11?Math.max(0,p.physical.hangTime-t):0,dist(fielderNow,observedBall.point)/speed(f,p.fielderIndex)):0,margin=loose?t+remaining+p.handling.pickupTime+dist(observedBall.point,bases[next])/throwSpeed(f,p.fielderIndex)-eta:returnETA-eta;
     if(!(fieldResolved&&caught)&&forced.some(a=>a.runner.key===r.runner.key&&a.force)&&r.lastSafe===r.from)r.mandatory=true;
     const ahead=runners.some(a=>a!==r&&!a.out&&a.from>r.from&&a.lastSafe<4&&a.at<next+.2);
     const go=!ahead&&!r.retouchRequired&&(r.mandatory&&r.lastSafe===r.from||margin>(secured&&r.from===0?.35:.12)&&(!secured||r.from===0)&&(loose||fieldResolved));
     if(!r.decisions.length||r.decisions.at(-1).decision!==(go?'ADVANCE':'HOLD'))r.decisions.push({at:t,base:r.lastSafe,decision:go?'ADVANCE':'HOLD',ballState:loose?'loose':transfer?'throw':'held',ballPoint:[...observedBall.point],margin,remaining});
     if(go){r.target=next;if(fieldResolved&&caught)r.tagReleased=true;runnerLeg(g,r,next,t);}else continue;
    }
    const leg=r.legs.at(-1);if(!leg){runnerLeg(g,r,r.target,t);continue;}
    // The batter reads the following base while completing the current leg, but still touches each base.
    if(r.from===0&&r.target>r.lastSafe&&r.target<3&&!r.retreating&&t<leg.end){
     const next=r.target+1,eta=leg.end+runTime(g,r.runner,r.target),loose=!fieldResolved,observedBall=loose?ballAt(p,t):{point:ballPoint,height:0};
     const fielderNow=F.trackPosition(p.defensivePlan.tracks[p.fielderIndex],t),remaining=loose?Math.max(observedBall.height>11?Math.max(0,p.physical.hangTime-t):0,dist(fielderNow,observedBall.point)/speed(f,p.fielderIndex)):0;
     const throwFrom=transfer?.toPoint||(transfer?bases[transfer.toBase]:ballPoint),thrower=transfer?transfer.toIndex:owner,throwReady=transfer?transfer.tagAt+.23:Math.max(t,ready);
     const returnETA=loose?t+remaining+p.handling.pickupTime+dist(observedBall.point,bases[next])/throwSpeed(f,p.fielderIndex)+.15:throwReady+dist(throwFrom,bases[next])/throwSpeed(fielders[thrower],thrower)+.15;
     const margin=returnETA-eta,ahead=runners.some(a=>a!==r&&!a.out&&a.from>r.from&&a.lastSafe<4&&a.at<next+.2),go=!ahead&&margin>(secured?.35:.12);
     const intent=go?next:null;if(r.continueTo!==intent){r.continueTo=intent;r.decisions.push({at:t,base:r.target,decision:go?'PREP_ADVANCE':'PREP_HOLD',nextBase:next,runnerETA:eta,returnETA,margin,secured,ballState:loose?'loose':transfer?'throw':'held'});}
    }
    r.at=runnerAt(r,t);
    if(t>=leg.end){r.lastSafe=r.target;r.at=r.lastSafe;r.mandatory=false;r.retreating=false;if(r.retouchRequired&&r.lastSafe===r.from){r.retouchAt=leg.end;r.retouchRequired=false;}if(r.from===0&&r.continueTo===r.lastSafe+1){r.target=r.continueTo;r.continueTo=null;runnerLeg(g,r,r.target,leg.end);r.at=runnerAt(r,t);}}
   }
   if(t>=ready&&!transfer&&fieldResolved){
    const targets=runningTargets(g,p,runners,owner,ballPoint,t);
    const chosen=targets[0];
    if(!p.throws.length){const first=targets.find(a=>a.r.from===0&&a.toBase===1);p.firstBaseOpportunity=!!first&&first.tagAt<first.runnerETA;p.fieldingChoice={at:t,chosenBase:chosen?.toBase??null,chosenRunner:chosen?.r.runner.key??null,batterKey:b.key,firstBaseOpportunity:p.firstBaseOpportunity,firstBaseTiming:first?{ballETA:first.tagAt,runnerETA:first.runnerETA}:null,source:'current runner legs and receiver cover ETA before throw'};}
    if(chosen){
     redistributeTransfer(g,p,owner,chosen.toIndex,bases[chosen.toBase],t,runners);
     if(owner===chosen.toIndex)moveTrack(g,p,owner,bases[chosen.toBase],chosen.start,'carry',chosen.end);else moveTrack(g,p,chosen.toIndex,bases[chosen.toBase],t,'receive');
     transfer={fromIndex:owner,toBase:chosen.toBase,toIndex:chosen.toIndex,runnerKey:chosen.r.runner.key,kind:chosen.kind,start:chosen.start,end:chosen.end,tagAt:chosen.tagAt,result:'safe',timing:{ballETA:chosen.tagAt,runnerETA:chosen.runnerETA,pickupTime:p.handling.pickupTime}};p.throws.push(transfer);secured=false;
    }else if(caught||owner<6){secured=true;}
    else if(!secured){
     const relay=owner>=6&&dist(ballPoint,bases[2])>100,formation=p.defensivePlan.anticipation||F.relayFormation(ballPoint,2),toIndex=relay?formation.relayIndex:receiverFor(p,2,owner,ballPoint),toPoint=relay?formation.relayPoint:bases[2],travel=dist(ballPoint,toPoint)/throwSpeed(fielders[owner],owner),cover=coverTime(g,p,toIndex,toPoint,t),end=Math.max(t+turnDelay(p,owner,toPoint)+travel,cover);
     redistributeTransfer(g,p,owner,toIndex,toPoint,t,runners);moveTrack(g,p,toIndex,toPoint,t,relay?'relay':'receive');transfer={fromIndex:owner,toIndex,toPoint,toBase:2,relay,kind:'return',result:'secured',start:end-travel,end,tagAt:end,runnerKey:null,timing:{ballETA:end,pickupTime:p.handling.pickupTime}};p.throws.push(transfer);
    }
   }
   if(t>fieldTime&&secured&&!transfer&&runners.every(r=>r.out||!r.retreating&&r.target===r.lastSafe))break;
  }
  if(caught&&s.outs-outsAtContact>=2)p.doublePlay=true;
  if(p.fieldingMistake){const batterState=runners.find(r=>r.from===0),costOut=!batterState.out,costBases=runners.some(r=>r.from>0&&!r.out&&r.lastSafe>r.from);p.fieldingMistake.costOut=costOut;p.fieldingMistake.costBases=costBases;if(costOut||costBases){p.error=true;s.errors[1-offense(g)]++;if(costOut){s.virtualOuts++;s.unearned[b.key]=true;}}}
  s.bases=[null,null,null];
  const thirdAt=s.outs>=3?Math.max(...runners.filter(r=>r.out).map(r=>r.outAt)):Infinity,thirdThrow=p.throws.find(t=>t.result==='out'&&Math.abs(t.tagAt-thirdAt)<.001),cancelRuns=s.outs>=3&&(thirdThrow?.kind==='force'||caught&&outsAtContact===2);
  for(const r of runners.sort((a,b)=>b.from-a.from)){if(r.out)continue;if(r.lastSafe===4&&(!cancelRuns&&(r.legs.at(-1)?.end??Infinity)<thirdAt)){creditRun(g,r.runner,p.error?null:b,pitcher);if(walkOff(g)){finish(g,'walkoff');break;}}else if(s.outs<3&&r.lastSafe>0){s.bases[r.lastSafe-1]=r.runner;if(r.lastSafe!==r.from)F.move(g,r.runner,r.from,r.lastSafe);}}
  if(p.fielderIndex===8){const throw1=p.throws.find(x=>x.fromIndex===8&&x.toBase===1&&x.kind!=='return'),runner=runners.find(r=>r.from===0),leg=runner.legs.find(l=>l.toBase===1);p.rfFirstRace={clock:'seconds since contact',fieldArrival:p.interception.arrival,pickupStart:fieldTime,pickupComplete:fieldTime+p.handling.pickupTime,throwInitiation:throw1?.start??null,releaseTime:throw1?.start??null,throwVelocity:throwSpeed(f,8),ballETA1B:throw1?.end??null,ballArrival1B:throw1?.arrived?throw1.end:null,runnerStart:leg?.start??null,acceleration:{model:'existing constant segment speed',value:0},currentSpeed:dist(bases[0],bases[1])/runTime(g,b,0),speedUnit:'field coordinates per second',runnerETA1B:leg?.end??null,runnerArrival1B:runner.lastSafe>=1?(leg?.end??null):null,raceMargin:throw1&&leg?leg.end-throw1.end:null,marginDefinition:'runnerETA1B - ballETA1B; positive means ball first',result:throw1?.result??'NO_THROW'};}
  p.runnerDecisions=runners.map(r=>({...r,runner:identity(r.runner)}));p.processEnd=end;
  const result=classify(p,s.playActions,b);
  if(['single','double','triple'].includes(result))creditHit(g,b,pitcher,result);
  p.infieldHit=result==='single'&&p.fielderIndex<6;
  if(caught&&s.playActions.some(a=>a.toBase===4&&a.result==='safe')){s.batting[b.key].AB--;s.batting[b.key].SF++;p.sacrificeFly=true;}
  p.record={source:'completed-play-history',classification:p.doublePlay?'doublePlay':p.sacrificeFly?'sacrificeFly':result,fieldingChoice:p.fieldingChoice||null,classificationReason:result==='fieldersChoice'?'another runner targeted; batter remains safe':caught?'airborne catch; subsequent runner outs use retouch/tag clock':result,runnerReads:runners.filter(r=>r.from>0).map(r=>({key:r.runner.key,from:r.from,retouchAt:r.retouchAt,decisions:r.decisions.filter(d=>['TAG_UP_PREP','TAG_UP_START','READ_HOLD','STAY','TWO_OUT_RUN','GO_ON_CONTACT','TAG_RETURN'].includes(d.decision)).slice(0,16)})),caught,fieldingMistake:p.fieldingMistake||null,firstBaseOpportunity:p.firstBaseOpportunity,rfFirstRace:p.rfFirstRace||null,actions:clone(s.playActions),throwTargets:p.throws.map(t=>({toBase:t.toBase,toPoint:t.toPoint,kind:t.kind,at:t.tagAt,runnerKey:t.runnerKey,result:t.result})),lastSafe:p.runnerDecisions.map(r=>[r.runner.key,r.lastSafe])};
  return p.sacrificeFly?'sacrificeFly':result;
 }
 F.process={naturalAt,baseNeeds,redistributeTransfer,redistribute,interceptEstimate,handlingAt,pursueAir,generate,ballAt,geometry,play,classify,runTime,speed,reaction,throwSpeed,defensePlan,moveTrack,coverTime,turnDelay,receiverFor,flyObservation,flyRunningRead,runnerAt,retouchAfterCatch,runningTargets,outAtTransfer,retireOnTransfer};
})();
