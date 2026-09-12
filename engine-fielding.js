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
 function stealExecution(g,runner,pitcher,from,noise=0,pitchVelocity=null){
  const startNoise=typeof noise==='number'?noise:noise.start||0,throwNoise=typeof noise==='number'?-noise:noise.transfer||0,motionNoise=typeof noise==='number'?0:noise.motion||0;
  const catcher=defense(g)[1],speed=scaled(runner,'speed',g.config),trait=(runner.specials||[]).find(x=>x==='盗塁○'||x==='盗塁×')||null,technique=trait==='盗塁○'?1.15:trait==='盗塁×'?.7:1;
  const startTime=Math.max(.03,.22/technique+startNoise*.18),runTime=3.65-.65*speed+(from===2?.2:0),acceleration=.16/technique;
  const motion=1.28+motionNoise*.12-.18*scaled(pitcher,'control',g.config)-((pitcher.specials||[]).includes('クイック○')?.12:0),pitchFlight=18.44/((pitchVelocity||pitcher.effective.velocity)/3.6),pitchArrival=motion+pitchFlight;
  const popup=.65+.20*(1-ability(catcher,'catching'))+throwNoise*.20,throwTime=distance(layout.positions[1],layout.bases[from+1])/(165+55*ability(catcher,'arm'));
  const coverIndex=from===1?5:4,coverETA=.25+distance(layout.positions[coverIndex],layout.bases[from+1])/(45+12*ability(defense(g)[coverIndex],'speed'));
  const throwStart=pitchArrival+popup,ballETA=Math.max(coverETA,throwStart+throwTime),tagAt=ballETA+.15,runnerETA=startTime+acceleration+runTime;
  const chance=clamp(.5+(tagAt-(.22/technique+acceleration+runTime))/.65,.02,.98);
  return {trait,technique,speed,startTime,runTime,acceleration,motion,pitchFlight,pitchArrival,popup,throwStart,throwTime,coverETA,ballETA,tagAt,runnerETA,catcherArm:ability(catcher,'arm'),chance,source:'shared-motion-clock'};
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
  if(execution){const toBase=e.toBase??e.runningExecution?.toBase??2;move(toBase===2?5:4,layout.bases[toBase],-execution.pitchArrival+.25,'baseCover');}
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
  const receiver=(base,from)=>receiverIndex(base,from,e.fieldingPoint||layout.positions[from]);
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
  e.runningDebug={ballType:e.ballType,catchPoint:e.fieldingPoint,batterSpeed:currentBatter(g)?.profile?.batting?.speed??null,outfielderArm:e.fielderIndex>=6?defense(g)[e.fielderIndex]?.profile?.batting?.arm:null,returnDecision:e.returnDecision||null,batterDestination:e.runnersAfter?.findIndex(r=>r?.key===e.batter?.key)+1,timingSource:e.physical?'shared process clock; observed-ball runner decisions':e.defenseDecision?.timing?'engine arrival-race; play timeline in seconds':'recorded result; return timeline only (advance result retains existing model)'};
  e.coverage=e.transfers.map(t=>({fielderIndex:t.toIndex,toBase:t.toBase,role:'baseCover'}));
  if(e.eventType==='baserunning'){e.pitchType='盗塁中の投球';e.pitchSpeed=null;e.primaryFielder=fielders[1];e.receiver=e.transfers[0]?.receiver||null;e.tag={...e.tag,fielder:e.receiver};}
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
  return {deliveredPitch,stealExecution:execution,stealAttempt:true,stealInterrupted:interrupted,eventType:'baserunning',outcome:'steal',result,stolenBase:!interrupted&&safe,caughtStealing:!interrupted&&!safe,runner:identity(runner),runnerIntents:[{runner:identity(runner),fromBase:from,toBase:from+1}],fromBase:from,toBase:from+1,fielder:identity(catcher),fielderIndex:1,...(interrupted?{}:{throw:{from:identity(catcher),toBase:from+1},tag:{toBase:from+1,result:safe?'safe':'out'}}),log:interrupted?'盗塁開始後、投球の判定でプレー終了':from+'塁走者'+runner.name+'、'+(from+1)+'塁盗塁'+(safe?'成功':'失敗'),pitchType:deliveredPitch.pitchType||'盗塁中の投球',pitchSpeed:deliveredPitch.pitchSpeed||pitcher.effective.velocity};
 }

 globalThis.SL_FIELDING={buildPlay,samplePlay,trackPosition,relayFormation,groundTiming,stealExecution,forcePlan,receiverIndex,geometry,field,steal,move,defense,ability,layout,canSteal,annotate};
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
 function ballAt(p,t){if(p.misplayAt!=null&&t>=p.misplayAt&&t<=p.trajectory.fieldTime)return {point:[...p.fieldingPoint],height:Math.abs(Math.sin((t-p.misplayAt)*12))*3,depth:dist(bases[0],p.fieldingPoint),bounced:true};const x=p.physical,air=Math.min(t,x.hangTime),roll=Math.max(0,t-x.hangTime),v=x.horizontalSpeed*(x.type==='GROUND'?1:.36),r=Math.min(roll,v/x.deceleration);
  const raw=x.horizontalSpeed*air+v*r-x.deceleration*r*r/2,projected=raw<=180?raw:180+(raw-180)*.55,height=t<x.hangTime?Math.max(0,5*(x.exitVelocity*Math.sin(x.launchAngle*Math.PI/180)*t-4.905*t*t)):0,wall=365+35*Math.cos(x.sprayAngle*2),bounced=projected>wall&&height<=12,d=bounced?wall-Math.min(35,(projected-wall)*.45):projected;
  return {point:[400+Math.sin(x.sprayAngle)*d,430-Math.cos(x.sprayAngle)*d],height:bounced?0:height,depth:d,bounced};
 }
 function geometry(g,p){
  const f=F.defense(g),origins=SL_TACTICS.alignment(g).positions,x=p.physical;
  p.ballType=x.type==='GROUND'?'ground':x.type==='LINER'?'line':'fly';p.sprayAngle=x.sprayAngle;
  const landing=ballAt(p,x.hangTime),wall=365+35*Math.cos(x.sprayAngle*2);
  const candidates=[];
  for(let i=0;i<9;i++)for(let t=.08;t<14;t+=.04){const ball=ballAt(p,t),range=i<6?255:470;
   if(ball.depth>wall&&ball.height>12)break;
   const route=1+.16*(1-F.ability(f[i],'fielding')),arrival=reaction(f[i])+dist(origins[i],ball.point)*route/speed(f[i],i);
   if(ball.height<=11&&ball.depth<=range&&arrival<=t){candidates.push({index:i,time:t,point:ball.point,height:ball.height,arrival,airborne:t<x.hangTime&&!ball.bounced});break;}
  }
  candidates.sort((a,b)=>a.time-b.time);let first=candidates[0];
  const fenceTime=(180+(wall-180)/.55)/x.horizontalSpeed,overFence=x.hangTime>fenceTime&&ballAt(p,fenceTime).height>12;
  if(overFence&&(!first||first.time>fenceTime)){p.fenceCrossing={at:fenceTime,height:ballAt(p,fenceTime).height,wall};first={index:x.sprayAngle<-.24?6:x.sprayAngle>.24?8:7,time:fenceTime,point:ballAt(p,fenceTime).point,airborne:false};p.ballType='homer';}
  if(!first){const point=ballAt(p,14).point;first=[6,7,8].map(index=>({index,point,time:Math.max(x.hangTime,reaction(f[index])+dist(origins[index],point)/speed(f[index],index)),airborne:false})).sort((a,b)=>a.time-b.time)[0];}
  p.fielderIndex=first.index;p.landingPoint=first.airborne||x.type==='GROUND'||p.fenceCrossing?first.point:landing.point;p.fieldingPoint=first.point;p.depth=dist(bases[0],p.landingPoint);
  p.fieldDirection=x.sprayAngle<-.12?'left':x.sprayAngle>.12?'right':'center';
  p.trajectory={type:x.type,initialSpeed:x.horizontalSpeed,deceleration:x.deceleration,fieldTime:first.time,landingAt:first.airborne?first.time:x.hangTime,candidates};
  const effort=clamp(dist(origins[first.index],first.point)/(Math.max(.1,first.time-reaction(f[first.index]))*speed(f[first.index],first.index)),0,1);
  p.handling={effort,pickupTime:.18+.25*(1-F.ability(f[first.index],'catching'))+.35*effort**3,throwRisk:.002+.016*(1-F.ability(f[first.index],'arm'))**2+.015*effort**4};
  p.interception={...first,source:'trajectory-interception'};p.fieldingApproach={from:[...origins[first.index]],to:[...first.point]};
  // Initial secondary responsibility uses only trajectory and reachable territory.
  const near=f.map((player,index)=>({index,d:dist(origins[index],ballAt(p,Math.min(.9,x.hangTime||.6)).point)})).filter(c=>c.index!==first.index&&c.index!==0&&c.index!==1).sort((a,b)=>a.d-b.d)[0];
  const secondary=near?.d<155?near.index:null,plausible=candidates.find(c=>c.index===secondary&&c.time<=first.time+.4),until=Math.min(first.time,plausible?Math.max(.35,first.time-.12):secondary==null?.35:reaction(f[secondary])+.35);
  p.chase={secondary,until,point:ballAt(p,Math.min(first.time,Math.max(.9,x.hangTime*.8))).point,reason:plausible?'primary interception established':'interception window lost'};
 }
 function turnDelay(p,index,to){if(index!==p.fielderIndex||!p.fieldingApproach)return 0;const {from, to:at}=p.fieldingApproach,dx=at[0]-from[0],dy=at[1]-from[1],tx=to[0]-at[0],ty=to[1]-at[1],cosine=(dx*tx+dy*ty)/Math.max(.01,Math.hypot(dx,dy)*Math.hypot(tx,ty));return .10*(1-clamp(cosine,-1,1))*(p.handling?.effort??0);}
 function moveTrack(g,p,index,to,start,role,end=null){const track=p.defensivePlan.tracks[index],from=F.trackPosition(track,start);track.legs=track.legs.filter(l=>l.start<start);const last=track.legs.at(-1);if(last&&last.end>start){last.end=start;last.to=from;}const arrival=end??start+dist(from,to)/speed(F.defense(g)[index],index);track.legs.push({from,to:[...to],start,end:Math.max(start+.001,arrival),role});return arrival;}
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
  return p.defensivePlan;
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
   const current=F.trackPosition(p.defensivePlan.tracks[index],t);
   for(let future=t+.001;future<p.physical.hangTime;future+=.08){
    const ball=ballAt(p,future);if(ball.bounced||ball.height>16||index<6&&ball.depth>255)continue;
    const distance=dist(current,ball.point),reach=(future-t)*speed(fielders[index],index)+12;
    if(distance<=reach){const candidate={index,at:future,point:ball.point,depth:ball.depth,current,effort:clamp(distance/Math.max(1,reach),0,1),arm:F.ability(fielders[index],'arm')};if(!best||future<best.at)best=candidate;break;}
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
  if(p.ballType==='ground'&&p.fielderIndex<6){p.fielder={...identity(f),position:F.defense(g)[p.fielderIndex].profile.mainPosition};defensePlan(g,p);const result=SL_TACTICS.groundPlay(g,p,b,pitcher);groundTracks(g,p);p.record={source:'completed-play-history',classification:result,classificationReason:result==='fieldersChoice'?'another runner targeted; batter remains safe':result==='groundout'?'batter retired at first':result,outs:s.outs,actions:clone(s.playActions),batterKey:b.key,batterBase:s.bases.findIndex(r=>r?.key===b.key)+1,fieldingIndex:p.fielderIndex,target:p.throw?.toBase??null,fieldingMistake:p.fieldingMistake,throws:p.throws||(p.throw?[p.throw]:[])};return result;}
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
    transfer=null;if(s.outs>=3)break;
   }
   if(!fieldResolved&&original.some(Boolean)&&outsAtContact<2&&t>=nextRead){observation=flyObservation(g,p,t);nextRead=t+.12;}
   for(const r of runners){if(r.out||r.lastSafe===4||t<r.start)continue;
    r.at=runnerAt(r,t);
    if(r.from>0&&!fieldResolved&&t<p.physical.hangTime&&(p.misplayAt==null||t<p.misplayAt)){
     const read=flyRunningRead(g,p,r,outsAtContact,observation);
     if(r.flyMode!==read.mode){r.decisions.push({at:t,decision:read.mode,inputs:read.inputs});r.flyMode=read.mode;}
     if(!['GO_ON_CONTACT','TWO_OUT_RUN'].includes(read.mode)){
      r.mandatory=false;r.target=r.from;const desired=r.from+read.lead;
      if(!r.legs.length||Math.abs(r.legs.at(-1).toBase-desired)>.02)runnerLeg(g,r,desired,t);
      r.at=runnerAt(r,t);continue;
     }
    }
    if(!r.retreating&&transfer?.runnerKey===r.runner.key&&transfer.kind!=='appeal'&&!r.mandatory&&r.target>r.lastSafe&&r.at-r.lastSafe<.4&&transfer.tagAt<(r.legs.at(-1)?.end??0)&&(!r.tagReleased||t>=transfer.start+.18&&transfer.tagAt+.25<(r.legs.at(-1)?.end??0))){
     runnerLeg(g,r,r.lastSafe,t);r.target=r.lastSafe;r.retreating=true;r.decisions.push({at:t,base:r.lastSafe,decision:'RETURN',ballState:'throw',ballPoint:[...ballPoint]});
    }
    if(!r.retreating&&r.target===r.lastSafe){
     const next=r.lastSafe+1,eta=t+runTime(g,r.runner,r.lastSafe),returnETA=Math.max(t,ready)+dist(ballPoint,bases[next])/throwSpeed(fielders[owner],owner)+.15;
     const loose=!fieldResolved,observedBall=loose?ballAt(p,t):{point:ballPoint,height:0},fielderNow=F.trackPosition(p.defensivePlan.tracks[p.fielderIndex],t),remaining=loose?Math.max(observedBall.height>11?Math.max(0,p.physical.hangTime-t):0,dist(fielderNow,observedBall.point)/speed(f,p.fielderIndex)):0,margin=loose?t+remaining+p.handling.pickupTime+dist(observedBall.point,bases[next])/throwSpeed(f,p.fielderIndex)-eta:returnETA-eta;
     if(!(fieldResolved&&caught)&&forced.some(a=>a.runner.key===r.runner.key&&a.force)&&r.lastSafe===r.from)r.mandatory=true;
     const ahead=runners.some(a=>a!==r&&!a.out&&a.from>r.from&&a.lastSafe<4&&a.at<next+.2);
     const go=!ahead&&!r.retouchRequired&&(r.mandatory&&r.lastSafe===r.from||margin>.12&&!secured&&(loose||fieldResolved));
     if(!r.decisions.length||r.decisions.at(-1).decision!==(go?'ADVANCE':'HOLD'))r.decisions.push({at:t,base:r.lastSafe,decision:go?'ADVANCE':'HOLD',ballState:loose?'loose':transfer?'throw':'held',ballPoint:[...observedBall.point],margin,remaining});
     if(go){r.target=next;if(fieldResolved&&caught)r.tagReleased=true;runnerLeg(g,r,next,t);}else continue;
    }
    const leg=r.legs.at(-1);if(!leg){runnerLeg(g,r,r.target,t);continue;}
    r.at=runnerAt(r,t);
    if(t>=leg.end){r.lastSafe=r.target;r.at=r.lastSafe;r.mandatory=false;r.retreating=false;if(r.retouchRequired&&r.lastSafe===r.from){r.retouchAt=leg.end;r.retouchRequired=false;}}
   }
   if(t>=ready&&!transfer&&fieldResolved){
    const targets=runningTargets(g,p,runners,owner,ballPoint,t);
    const chosen=targets[0];
    if(chosen){
     if(owner===chosen.toIndex)moveTrack(g,p,owner,bases[chosen.toBase],chosen.start,'carry',chosen.end);else moveTrack(g,p,chosen.toIndex,bases[chosen.toBase],t,'receive');
     transfer={fromIndex:owner,toBase:chosen.toBase,toIndex:chosen.toIndex,runnerKey:chosen.r.runner.key,kind:chosen.kind,start:chosen.start,end:chosen.end,tagAt:chosen.tagAt,result:'safe',timing:{ballETA:chosen.tagAt,runnerETA:chosen.runnerETA,pickupTime:p.handling.pickupTime}};p.throws.push(transfer);secured=false;
    }else if(caught||owner<6){secured=true;}
    else if(!secured){
     const relay=owner>=6&&dist(ballPoint,bases[2])>100,formation=F.relayFormation(ballPoint,2),toIndex=relay?formation.relayIndex:receiverFor(p,2,owner,ballPoint),toPoint=relay?formation.relayPoint:bases[2],travel=dist(ballPoint,toPoint)/throwSpeed(fielders[owner],owner),cover=coverTime(g,p,toIndex,toPoint,t),end=Math.max(t+turnDelay(p,owner,toPoint)+travel,cover);
     moveTrack(g,p,toIndex,toPoint,t,relay?'relay':'receive');transfer={fromIndex:owner,toIndex,toPoint,toBase:2,relay,kind:'return',result:'secured',start:end-travel,end,tagAt:end,runnerKey:null,timing:{ballETA:end,pickupTime:p.handling.pickupTime}};p.throws.push(transfer);
    }
   }
   if(t>fieldTime&&secured&&!transfer&&runners.every(r=>r.out||!r.retreating&&r.target===r.lastSafe))break;
  }
  if(caught&&s.outs-outsAtContact>=2)p.doublePlay=true;
  if(p.fieldingMistake){const batterState=runners.find(r=>r.from===0),costOut=!batterState.out,costBases=runners.some(r=>r.from>0&&!r.out&&r.lastSafe>r.from);p.fieldingMistake.costOut=costOut;p.fieldingMistake.costBases=costBases;if(costOut||costBases){p.error=true;s.errors[1-offense(g)]++;if(costOut){s.virtualOuts++;s.unearned[b.key]=true;}}}
  s.bases=[null,null,null];
  const thirdAt=s.outs>=3?Math.max(...runners.filter(r=>r.out).map(r=>r.outAt)):Infinity,thirdThrow=p.throws.find(t=>t.result==='out'&&Math.abs(t.tagAt-thirdAt)<.001),cancelRuns=s.outs>=3&&(thirdThrow?.kind==='force'||caught&&outsAtContact===2);
  for(const r of runners.sort((a,b)=>b.from-a.from)){if(r.out)continue;if(r.lastSafe===4&&(!cancelRuns&&(r.legs.at(-1)?.end??Infinity)<thirdAt)){creditRun(g,r.runner,p.error?null:b,pitcher);if(walkOff(g)){finish(g,'walkoff');break;}}else if(s.outs<3&&r.lastSafe>0){s.bases[r.lastSafe-1]=r.runner;if(r.lastSafe!==r.from)F.move(g,r.runner,r.from,r.lastSafe);}}
  p.runnerDecisions=runners.map(r=>({...r,runner:identity(r.runner)}));p.processEnd=end;
  const result=classify(p,s.playActions,b);
  if(['single','double','triple'].includes(result))creditHit(g,b,pitcher,result);
  p.infieldHit=result==='single'&&p.fielderIndex<6;
  if(caught&&s.playActions.some(a=>a.toBase===4&&a.result==='safe')){s.batting[b.key].AB--;s.batting[b.key].SF++;p.sacrificeFly=true;}
  p.record={source:'completed-play-history',classification:p.sacrificeFly?'sacrificeFly':result,classificationReason:result==='fieldersChoice'?'another runner targeted; batter remains safe':caught?'airborne catch; subsequent runner outs use retouch/tag clock':result,runnerReads:runners.filter(r=>r.from>0).map(r=>({key:r.runner.key,from:r.from,retouchAt:r.retouchAt,decisions:r.decisions.filter(d=>['TAG_UP_PREP','TAG_UP_START','READ_HOLD','STAY','TWO_OUT_RUN','GO_ON_CONTACT','TAG_RETURN'].includes(d.decision)).slice(0,16)})),caught,fieldingMistake:p.fieldingMistake||null,firstBaseOpportunity:p.firstBaseOpportunity,actions:clone(s.playActions),throwTargets:p.throws.map(t=>({toBase:t.toBase,toPoint:t.toPoint,kind:t.kind,at:t.tagAt,runnerKey:t.runnerKey,result:t.result})),lastSafe:p.runnerDecisions.map(r=>[r.runner.key,r.lastSafe])};
  return p.sacrificeFly?'sacrificeFly':result;
 }
 F.process={generate,ballAt,geometry,play,classify,runTime,speed,reaction,throwSpeed,defensePlan,moveTrack,coverTime,turnDelay,receiverFor,flyObservation,flyRunningRead,runnerAt,retouchAfterCatch,runningTargets,outAtTransfer,retireOnTransfer};
})();
