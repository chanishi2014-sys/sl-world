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
 function geometry(g,p){
  // Keep the original geometry RNG call count; interception may change the fielder.
  const a=(g.rng()+g.rng()-1)*.78,ground=p.battedResult==='groundout'||p.infieldHit;
  const d=ground?155+g.rng()*55:p.battedResult==='homeRun'?410:p.battedResult==='single'?265+g.rng()*35:300+g.rng()*65;
  p.sprayAngle=a;p.depth=d;
  p.fielderIndex=ground?(a<-.25?4:a<0?5:a<.3?3:2):p.battedResult==='lineout'?(a<0?5:3):a<-.23?6:a>.23?8:7;
  const origin=layout.positions[p.fielderIndex];
  p.landingPoint=ground?[origin[0]+a*16,origin[1]+(d-155)/55*24-12]:p.battedResult==='lineout'?[origin[0]+a*16,origin[1]+(d-300)/65*28-14]:[400+Math.sin(a)*d,430-Math.cos(a)*d];
  if(ground||p.battedResult==='lineout'){p.sprayAngle=Math.atan2(p.landingPoint[0]-400,430-p.landingPoint[1]);p.depth=Math.hypot(p.landingPoint[0]-400,p.landingPoint[1]-430);}
  if(ground&&!p.infieldHit&&SL_TACTICS.enabled(g)){
   // Sample interception along the moving ground ball, not distance to a final XY.
   const speed=150+160*(p.battedQuality??.5),deceleration=60,fielders=defense(g),origins=globalThis.SL_TACTICS?.alignment?SL_TACTICS.alignment(g).positions:layout.positions;
   const stop=Math.min(390,speed*speed/(2*deceleration)),candidates=[];
   for(let i=0;i<9;i++){const reaction=.25+.25*(1-ability(fielders[i],'fielding')),runSpeed=65+30*ability(fielders[i],'speed');
    for(let t=.1;t<=7;t+=.05){const d=Math.min(stop,Math.max(0,speed*Math.min(t,speed/deceleration)-deceleration*Math.min(t,speed/deceleration)**2/2)),at=[400+Math.sin(a)*d,430-Math.cos(a)*d];
     if(Math.hypot(origins[i][0]-at[0],origins[i][1]-at[1])<=Math.max(0,t-reaction)*runSpeed+8){candidates.push({index:i,time:t,point:at,reaction,runSpeed});break;}
    }
   }
   candidates.sort((x,y)=>x.time-y.time);const primary=candidates[0];
   if(primary){p.fielderIndex=primary.index;p.landingPoint=primary.point;p.depth=Math.hypot(primary.point[0]-400,primary.point[1]-430);p.sprayAngle=a;
    if(primary.index>=6){p.battedResult='single';p.infieldHit=false;}
    p.trajectory={type:'GROUND',initialSpeed:speed,deceleration,fieldTime:primary.time,candidates};
   }
  }
  p.fieldDirection=p.landingPoint[0]<360?'left':p.landingPoint[0]>440?'right':'center';
  p.ballType=ground?'ground':p.battedResult==='homeRun'?'homer':p.battedResult==='lineout'?'line':p.battedResult==='single'&&p.battedQuality>=.38?'line':'fly';
  if(!ground&&p.ballType!=='homer'&&SL_TACTICS.enabled(g)){
   const time=p.ballType==='line'?.7:1.4,fielders=defense(g),at=p.landingPoint;
   p.catchCandidates=fielders.map((f,index)=>({index,time,point:at,height:0,arrival:.25+.25*(1-ability(f,'fielding'))+Math.hypot(layout.positions[index][0]-at[0],layout.positions[index][1]-at[1])/(65+30*ability(f,'speed'))})).filter(x=>x.arrival<=time).sort((a,b)=>a.arrival-b.arrival);
   // An infielder is eligible at the catch point and catch height, not merely
   // because the airborne ball crosses nearby XY coordinates.
   if(p.catchCandidates.length)p.fielderIndex=p.catchCandidates[0].index;
  }
 }
 // The existing speed/arm model is shared by selection and execution. Technique
 // changes the runner's start time, not a post-hoc success percentage.
 function stealExecution(g,runner,pitcher,from){const speed=scaled(runner,'speed',g.config),catcher=defense(g)[1],trait=(runner.specials||[]).find(x=>x==='盗塁○'||x==='盗塁×')||null;
  const technique=trait==='盗塁○'?1.15:trait==='盗塁×'?.7:1,runTime=3.9-1.25*speed,startTime=.6/technique;
  const effectiveSpeed=speed*runTime/(runTime+startTime-.6);
  const chance=clamp(.54+.35*effectiveSpeed-.18*ability(catcher,'arm')-.08*scaled(pitcher,'control',g.config)-.05*scaled(pitcher,'velocity',g.config)-(from===2?.06:0),.2,.94);
  return {trait,technique,speed,effectiveSpeed,startTime,runTime,runnerETA:runTime+startTime,catcherArm:ability(catcher,'arm'),chance};
 }
 // Legal single-runner attempts only; no implicit double steals.
 function canSteal(g,from){return !g.state.finished&&g.state.outs<3&&(from===1||from===2)&&!!g.state.bases[from-1]&&!g.state.bases[from];}
 // Add replay facts without drawing RNG or modifying the game's result/state.
 function annotate(g,e){
  const fielders=defense(g).map((p,index)=>({...identity(p),index,position:positions[index]}));
  e.defensivePositions??=SL_TACTICS.alignment(g).positions;e.eventVersion=3;e.coordinateSpace=layout.coordinateSpace;e.defense=fielders;
  if(e.runningExecution){e.fielderIndex=1;e.log='ヒットエンドラン空振り / '+e.runningExecution.log;} e.playType=e.hitAndRun?'hitAndRun':e.bunt?'bunt':e.eventType==='baserunning'?'steal':e.ballType||e.outcome;
  e.primaryFielder=fielders[e.fielderIndex]||null;
  e.playDescription=e.bunt?(e.buntPop?'バント小飛球':'送りバント'):e.primaryFielder&&e.outcome==='inPlay'?labels[e.fielderIndex]+'の'+({ground:'ゴロ',line:'ライナー',fly:'フライ',homer:'本塁打の打球'}[e.ballType]||'打球'):'';
  e.forceAtContact=e.forceTrace?.atContact||((e.ballType==='ground'&&e.batter)?forcePlan(e.runnersBefore||[null,null,null],e.batter):[]);
  e.landingPosition=e.landingPoint?[...e.landingPoint]:null;
  const hit=['single','double','triple'].includes(e.result);
  const roll=hit&&!e.infieldHit&&e.ballType!=='ground'?12+28*(e.battedQuality??.5):0;
  e.fieldingPoint=e.landingPoint?[clamp(e.landingPoint[0]+Math.sin(e.sprayAngle||0)*roll,90,710),clamp(e.landingPoint[1]-Math.cos(e.sprayAngle||0)*roll,60,420)]:null;
  const receiver=(base,from)=>receiverIndex(base,from,e.fieldingPoint||layout.positions[from]);
  let raw=e.runningExecution?[{fromIndex:1,toBase:e.runningExecution.toBase,runnerKey:e.runningExecution.runner.key,result:e.runningExecution.caughtStealing?'out':'safe',kind:'tag'}]:e.tagUp?e.actions.filter(a=>a.type==='tagUp').map(a=>({fromIndex:e.fielderIndex,toBase:a.toBase,runnerKey:a.runner.key,result:a.result,kind:'tag'})):e.throws|| (e.throw?[e.throw]:[]);
  const outfieldReturn=e.fielderIndex>=6&&e.outcome==='inPlay'&&e.result!=='homeRun'&&e.outsAfter<3&&e.runnersAfter?.some(Boolean);
  if((hit||outfieldReturn)&&!raw.length){e.defenseDecision=SL_TACTICS.defenseDecision(g,e,currentBatter(g),{settled:true});raw=e.defenseDecision.decision==='SECURE_RETURN'?[{toBase:2,kind:'return',result:'secured'}]:[];}
  let from=e.fielderIndex;
  e.transfers=raw.map(t=>{const fromIndex=t.fromIndex??from,toIndex=receiver(t.toBase,fromIndex);const action=e.actions.find(a=>a.toBase===t.toBase&&a.result==='out');const transfer={fromIndex,toIndex,toBase:t.toBase,from:fielders[fromIndex],receiver:fielders[toIndex],kind:t.kind||(e.eventType==='baserunning'?'tag':e.forceOut||e.battedResult==='groundout'||e.doublePlay?'force':'return'),runnerKey:t.runnerKey||action?.runner.key||e.runner?.key||null,result:t.result||action?.result||(e.caughtStealing?'out':'safe')};from=toIndex;return transfer;});
  // Cutoff formation is independent of whether the throw uses it.
  if(e.fielderIndex>=6&&e.fieldingPoint){
   const target=e.transfers.at(-1)?.toBase||2,base=layout.bases[target],at=e.fieldingPoint;
   const relayIndex=at[0]>440?3:5,coverIndex=relayIndex===5?3:5;
   const relayPoint=[base[0]+(at[0]-base[0])*.55,base[1]+(at[1]-base[1])*.55];
   e.returnFormation={relayIndex,coverIndex,relayPoint,targetBase:target};
   const first=e.transfers[0];if(first&&target===2){first.toIndex=coverIndex;first.receiver=fielders[coverIndex];}
   if(first){
    const arm=ability(defense(g)[e.fielderIndex],'arm'),directDistance=Math.hypot(at[0]-base[0],at[1]-base[1]);
    const directETA=directDistance/(150+80*arm),relayETA=Math.hypot(at[0]-relayPoint[0],at[1]-relayPoint[1])/(150+80*arm)+.2+Math.hypot(relayPoint[0]-base[0],relayPoint[1]-base[1])/(150+80*ability(defense(g)[relayIndex],'arm'));
    const mode=first.kind==='return'||relayETA<directETA?'relay':'direct';
    e.returnDecision={mode,directETA,relayETA,targetBase:target,catchPoint:at,arm};
    if(mode==='relay'){const leg={...first,toIndex:relayIndex,receiver:fielders[relayIndex],toPoint:relayPoint,kind:'return',result:'secured',runnerKey:null};e.transfers=[leg,{...first,fromIndex:relayIndex,from:fielders[relayIndex]},...e.transfers.slice(1)];}
   }
  }
  e.runningDebug={ballType:e.ballType,catchPoint:e.fieldingPoint,batterSpeed:currentBatter(g)?.profile?.batting?.speed??null,outfielderArm:e.fielderIndex>=6?defense(g)[e.fielderIndex]?.profile?.batting?.arm:null,returnDecision:e.returnDecision||null,batterDestination:e.runnersAfter?.findIndex(r=>r?.key===e.batter?.key)+1,timingSource:'replay visualization; advancement timing is not yet engine-authoritative'};
  e.coverage=e.transfers.map(t=>({fielderIndex:t.toIndex,toBase:t.toBase,role:'baseCover'}));
  if(e.eventType==='baserunning'){e.pitchType='盗塁';e.pitchSpeed=null;e.primaryFielder=fielders[1];e.receiver=e.transfers[0]?.receiver||null;e.tag={...e.tag,fielder:e.receiver};}
 }

 function field(g,p,b,pitcher){const s=g.state,f=defense(g)[p.fielderIndex],before=s.outs,ground=p.battedResult==='groundout',skill=ability(f,'fielding'),catching=ability(f,'catching'),arm=ability(f,'arm');p.fielder={...identity(f),position:positions[p.fielderIndex]};
  if(ground&&SL_TACTICS.enabled(g))return SL_TACTICS.groundPlay(g,p,b,pitcher);
  if(g.rng()<.003+.045*(1-(skill+catching)/2)**2){p.error=true;p.errorType=ground?(g.rng()<.45?'throwing':'groundFielding'):'catching';s.errors[1-offense(g)]++;s.virtualOuts++;s.unearned[b.key]=true;p.earnedRunContext={reachedOnError:true,virtualOuts:s.virtualOuts,errorFielder:p.fielder};p.log=`${labels[p.fielderIndex]}${f.name}の${p.errorType==='throwing'?'悪送球':'捕球エラー'}`;s.suppressRBI=true;advanceWalk(g,b,pitcher);return 'error';}
  if(ground){let chain=0;while(chain<3&&s.bases[chain])chain++;// Prefer the shortest reliable throw when the lead runner is fast.
   const firstChoice=chain&&g.rng()<clamp(.10+.22*scaled(s.bases[0],"speed",g.config)-.10*skill+(p.fielderIndex===2?.22:0)-(chain===3&&before<2?.08:0),.03,.50);const target=firstChoice?1:chain===3&&before<2?4:chain===2&&p.fielderIndex===4?3:chain?2:1,r=target===1?b:s.bases[target-2];p.throw={from:p.fielder,toBase:target};
   if(target>1&&g.rng()>=clamp(.85+.10*skill+.06*arm-.10*scaled(r,'speed',g.config),.65,.98)){p.fieldersChoice=true;p.log='野選により打者走者出塁（全員セーフ）';advanceWalk(g,b,pitcher);return 'fieldersChoice';}
   recordOut(g,pitcher);move(g,r,target===1?0:target-1,target,'out',target===1?'batterOut':'forceOut');p.forceOut=target>1;if(target>1){s.bases[target-2]=null;p.fieldersChoice=true;}
   const dp=target===2&&before<2&&g.rng()<clamp(.35+.23*skill+.15*catching+.16*arm+.15*(p.battedQuality??.5)-.24*scaled(b,'speed',g.config)-.12*scaled(r,'speed',g.config),.08,.82);
   if(dp){recordOut(g,pitcher);move(g,b,0,1,'out','batterOut');p.doublePlay=true;p.throws=[p.throw,{fromBase:2,toBase:1}];}
   if(s.outs<3){for(let i=chain-1;i>=0;i--){const runner=s.bases[i];if(!runner)continue;s.bases[i]=null;if(i===2)creditRun(g,runner,dp?null:b,pitcher);else{s.bases[i+1]=runner;move(g,runner,i+1,i+2);}}if(target>1&&!dp)s.bases[0]=b;if(walkOff(g))finish(g,'walkoff');}
   p.log=dp?'二塁封殺。一塁転送、併殺':target>1?`${target===4?'本塁':target===3?'三塁':'二塁'}封殺、野選により打者走者出塁`:'一塁送球、打者アウト';return dp?'doublePlay':target>1?'fieldersChoice':'groundout';
  }
  recordOut(g,pitcher);if(p.battedResult==='flyout'&&p.fielderIndex>=6&&before<2){for(let i=2;i>=1;i--){const r=s.bases[i];if(!r||s.outs>=3||s.finished||(i===1&&s.bases[2]))continue;const chance=clamp(.65+.26*scaled(r,'speed',g.config)-.19*arm+(p.depth-300)/240-(i===1?.12:0),.15,.97);if(chance<(i===2?.60:.78)||g.rng()>.90)continue;const safe=g.rng()<chance;s.bases[i]=null;p.tagUp=true;move(g,r,i+1,i+2,safe?'safe':'out','tagUp');p.throw={from:p.fielder,toBase:i+2};p.tag={toBase:i+2,result:safe?'safe':'out'};p.log=`${i+1}塁走者${r.name}、タッチアップ${safe?'成功':'失敗'}`;if(!safe)recordOut(g,pitcher);else if(i===2){creditRun(g,r,b,pitcher);p.sacrificeFly=true;s.batting[b.key].AB--;s.batting[b.key].SF++;if(walkOff(g))finish(g,'walkoff');}else s.bases[2]=r;}}
  return p.sacrificeFly?'sacrificeFly':p.battedResult;
 }
 function steal(g,pitcher,decision=null){const s=g.state,from=decision?.fromBase??(s.bases[1]&&!s.bases[2]?2:s.bases[0]&&!s.bases[1]?1:0);if(!canSteal(g,from))return null;const r=s.bases[from-1],speed=scaled(r,'speed',g.config),close=Math.abs(s.score[0]-s.score[1])<=3,attempt=(.001+.028*speed**3)*(from===2?.4:1)*(s.outs===2?.8:1)*(close?1:.25)*(s.inning>=7&&close?1.2:1);if(!decision&&g.rng()>=attempt)return null;const catcher=defense(g)[1],execution=stealExecution(g,r,pitcher,from),chance=execution.chance,safe=g.rng()<chance;if(decision)s.lastStealPitch=s.pitching[pitcher.key].pitches;s.bases[from-1]=null;if(safe){s.bases[from]=r;s.batting[r.key].SB++;}else{s.batting[r.key].CS++;recordOut(g,pitcher);}move(g,r,from,from+1,safe?'safe':'out',safe?'stolenBase':'caughtStealing');return {stealExecution:execution,eventType:'baserunning',outcome:'steal',result:safe?'stolenBase':'caughtStealing',stolenBase:safe,caughtStealing:!safe,runner:identity(r),fromBase:from,toBase:from+1,fielder:identity(catcher),fielderIndex:1,throw:{from:identity(catcher),toBase:from+1},tag:{toBase:from+1,result:safe?'safe':'out'},log:`${from}塁走者${r.name}、${from+1}塁盗塁${safe?'成功':'失敗'}`,pitchType:'盗塁',pitchSpeed:'—'};}
 globalThis.SL_FIELDING={stealExecution,forcePlan,receiverIndex,geometry,field,steal,move,defense,ability,layout,canSteal,annotate};
})();
