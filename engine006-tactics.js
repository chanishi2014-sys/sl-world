/* Explainable shared tactics alpha1. No DOM, storage, team-name or league modifiers. */
(() => {
 'use strict';
 const F=()=>SL_FIELDING;
 const enabled=g=>g.config.tactics?.enabled===true;
 const has=(p,name)=>(p.specials||[]).includes(name);
 const n=(g,p,k)=>scaled(p,k,g.config);
 const offenseStrength=(g,p)=>.55*n(g,p,'meet')+.45*n(g,p,'power');
 function context(g){const s=g.state,diff=s.score[offense(g)]-s.score[1-offense(g)],remaining=Math.max(1,g.config.innings-s.inning+1);return {inning:s.inning,outs:s.outs,scoreDifference:diff,remainingInnings:remaining,close:Math.abs(diff)<=1,oneRunValue:Math.abs(diff)<=1?(remaining<=3?1:.4):Math.abs(diff)<=2?.2:0};}
 function buntOption(g,b){
  const s=g.state,c=context(g),strength=offenseStrength(g,b),next=g.teams[offense(g)].lineup[(s.order[offense(g)]+1)%9],nextStrength=offenseStrength(g,next);
  const legal=s.outs<2&&!s.bases[2]&&!!(s.bases[0]||s.bases[1])&&s.strikes<2;
  let weight=legal?(.04+.65*c.oneRunValue)*(1-strength)**2*(.5+Math.max(0,nextStrength-strength)*2)*(s.outs===0?1:.25)*(Math.abs(c.scoreDifference)<=1?1:.12):0;
  if(strength>.8||n(g,b,'power')>.88||Math.abs(c.scoreDifference)>=4)weight=0;
  return {decision:'SAC_BUNT',weight,legal,estimatedValue:c.oneRunValue,inputs:{batterOffense:strength,nextBatterOffense:nextStrength},reasons:[`inning: ${c.inning}; remaining: ${c.remainingInnings}`,`score difference: ${c.scoreDifference}; outs: ${s.outs}`,`one-run value: ${c.oneRunValue}`,`batter offense: ${strength.toFixed(2)}; next: ${nextStrength.toFixed(2)}`,legal?'advance a runner with one out':'no sacrifice situation / two strikes']};
 }
 function stealOption(g,pitcher,from){
  const s=g.state,c=context(g),legal=F().canSteal(g,from),runner=s.bases[from-1],catcher=F().defense(g)[1];
  if(!legal)return {decision:`STEAL_${from+1}B`,fromBase:from,weight:0,legal:false,reasons:['destination occupied or no eligible runner']};
  const speed=n(g,runner,'speed'),arm=F().ability(catcher,'arm');
  const execution=F().stealExecution(g,runner,pitcher,from),success=execution.chance;
  const caution=(has(pitcher,'クイック○')?.04:0)+(has(catcher,'盗塁阻止○')?.03:0);
  const estimate=clamp(success-caution,0,1),gain=.30+(from===1?.12:0)+.20*c.oneRunValue,loss=.65+(s.outs===2?.30:0)+.20*c.oneRunValue+(s.bases[2]?.18:0);
  const value=estimate*gain-(1-estimate)*loss;
  const traits=(has(runner,'盗塁○')?1.15:has(runner,'盗塁×')?.7:1)*(has(runner,'積極盗塁')?1.25:has(runner,'慎重盗塁')?.55:1)*(has(runner,'走塁○')?1.05:has(runner,'走塁×')?.9:1);
  const repeated=s.lastStealPitch===s.pitching[pitcher.key].pitches;
  const weight=!repeated&&value>0?.12*value*speed**2*traits*(Math.abs(c.scoreDifference)>=4?.1:1)*(from===2?.6:1):0;
  return {decision:`STEAL_${from+1}B`,fromBase:from,runner:identity(runner),legal:true,weight,successChance:success,estimatedValue:value,inputs:{execution,speed,catcherArm:arm,gain,loss,traits,quickHint:has(pitcher,'クイック○')},reasons:[`runner speed: ${speed.toFixed(2)}; catcher arm: ${arm.toFixed(2)}`,`estimated success: ${estimate.toFixed(2)}`,`gain: ${gain.toFixed(2)}; failure cost: ${loss.toFixed(2)}`,`outs: ${s.outs}; score difference: ${c.scoreDifference}; inning: ${c.inning}`,`stored traits: ${(runner.specials||[]).filter(x=>['盗塁○','盗塁×','積極盗塁','慎重盗塁','走塁○','走塁×'].includes(x)).join(', ')||'none'}`,caution?'quick/catcher trait: cautious estimate':'no quick numeric ability exists',repeated?'wait for next delivered pitch':value>0?'opportunity favorable':'failure cost exceeds gain']};
 }
 function choose(g,candidates){const positive=candidates.filter(c=>c.weight>0);return weighted(g.tacticalRng,positive.map(c=>[c,c.weight]));}
 function offenseDecision(g,b,p){
  const bunt=buntOption(g,b),steals=[1,2].map(from=>stealOption(g,p,from));
  const swing={decision:'SWING_AWAY',weight:1,intent:'score more runs',reasons:['retain chance for multiple runs',`batter offense: ${offenseStrength(g,b).toFixed(2)}`]};
  const extra=extraOptions(g,b),candidates=[swing,bunt,...steals,...extra];
  const trait=has(b,'バント○')?1.4:has(b,'バント×')?.5:1;bunt.weight*=trait;
  let selected;
  const planned=candidates.find(x=>x.decision===g.state.buntPlan&&x.legal);if(planned)selected=planned;else if(g.state.buntPlan===true&&bunt.legal)selected=bunt;
  else {g.state.buntPlan=false;if(g.state.balls!==0||g.state.strikes!==0)bunt.weight=0;selected=choose(g,candidates);}
  if(['SAC_BUNT','SAFETY_BUNT','SQUEEZE'].includes(selected.decision))g.state.buntPlan=selected.decision;
  const duel=matchup(g,b);if(duel.decision==='INTENTIONAL_WALK'){selected={...duel,candidates:duel.options};g.state.buntPlan=false;} return {...selected,matchup:duel,alignment:alignment(g),intent:selected.intent||(selected.decision==='SWING_AWAY'?'score more runs':'runner advance'),context:context(g),candidates:(selected.decision==='INTENTIONAL_WALK'?duel.options:candidates).map(c=>({decision:c.decision,weight:c.weight,legal:c.legal??true,estimatedValue:c.estimatedValue??null})),policy:'shared-006-alpha1'};
 }
 function defenseDecision(g,p,b,{settled=false}={}){
  const c=context(g),s=g.state,fielders=F().defense(g),f=fielders[p.fielderIndex],point=p.landingPoint||F().layout.positions[p.fielderIndex],arm=F().ability(f,'arm'),skill=F().ability(f,'fielding');
  const forcePlan=F().forcePlan(s.bases,b);let chain=forcePlan.filter(a=>a.fromBase>0&&a.force).length;
  const advances=s.bases.flatMap((runner,i)=>runner?[{runner,fromBase:i+1,toBase:i<chain||p.bunt&&i<2||p.squeeze&&i===2?i+2:i+1,force:i<chain}]:[]);
  const targets=[{runner:b,fromBase:0,toBase:1,force:true},...advances.filter(a=>a.toBase!==a.fromBase)];
  const candidates=[1,2,3,4].map(base=>{
   const target=targets.find(a=>a.toBase===base),receiverIndex=F().receiverIndex(base,p.fielderIndex,point),receiver=fielders[receiverIndex];
   const distance=Math.hypot(point[0]-F().layout.bases[base][0],point[1]-F().layout.bases[base][1]);
   const catching=F().ability(receiver,'catching'),errorRisk=.001+.020*(1-arm)**2+.010*(1-catching)**2+.006*(distance/300)**2;
   const fieldTime=p.trajectory?.fieldTime??(p.bunt?1.1+Math.hypot(point[0]-alignment(g).positions[p.fielderIndex][0],point[1]-alignment(g).positions[p.fielderIndex][1])/90+Math.hypot(point[0]-400,point[1]-430)/(150-90*(p.buntQuality??.5)):.8+Math.hypot(point[0]-400,point[1]-430)/210+Math.hypot(point[0]-alignment(g).positions[p.fielderIndex][0],point[1]-alignment(g).positions[p.fielderIndex][1])/150+(1-skill)*.25);
   const coverETA=Math.hypot(F().layout.positions[receiverIndex][0]-F().layout.bases[base][0],F().layout.positions[receiverIndex][1]-F().layout.bases[base][1])/(65+30*F().ability(receiver,'speed'));
   const ballETA=Math.max(coverETA,fieldTime+.2+distance/(receiverIndex===p.fielderIndex?85:150+80*arm)+(target&&!target.force?.15:0));
   const runnerETA=target?(target.fromBase===0?4.6:3.9)-1.25*n(g,target.runner,'speed'):0;
   const margin=runnerETA-ballETA,outChance=settled||!target?0:clamp(.5+margin*.4,.01,.97);
   const plausible=!settled&&!!target&&margin>-.9;
   const damage=(base===4?1.5:.45)+.35*c.oneRunValue;
   const value=plausible?outChance*(1+(base===4?.30*c.oneRunValue:0)+(s.outs===2?.2:0))-errorRisk*damage-(1-outChance)*.08:0;
   return {decision:`THROW_${base}B`,toBase:base,receiverIndex,runnerKey:target?.runner.key??null,fromBase:target?.fromBase??null,force:target?.force??false,outChance,distance,coverETA,ballETA,runnerETA,errorRisk,catching,damage,value,weight:plausible&&value>.12?value**4:0,reasons:[settled?'runner already arrived':!target?'no runner to retire':margin<=-.9?'too late':`arrival margin: ${margin.toFixed(2)}s`,`out chance: ${outChance.toFixed(2)}; throw risk: ${errorRisk.toFixed(3)}`,`receiver catching: ${catching.toFixed(2)}; damage: ${damage.toFixed(2)}`]};
  });
  const viable=candidates.filter(c=>c.weight>0),hold={decision:'HOLD_BALL',weight:viable.length?.015:1,reasons:[viable.length?'avoid marginal throw risk':'no reachable out; unnecessary throw risk']};
  // Settled plays do not consume tactical RNG, and cannot invent a late putout.
  let selected=settled||!viable.length?hold:choose(g,[...viable,hold]);
  if(selected.decision==='HOLD_BALL'&&p.fielderIndex>=6)selected={decision:'SECURE_RETURN',toBase:2,receiverIndex:5,weight:1,reasons:['no reachable out; return to infield to contain runners','avoid low-probability out attempt and long throw risk']};
  selected.action=selected.decision.startsWith('THROW_')?'OUT_ATTEMPT':selected.decision;
  candidates.push(hold,{decision:'SECURE_RETURN',legal:p.fielderIndex>=6,weight:p.fielderIndex>=6?1:0});
  return {...selected,intent:'prevent runs',context:c,candidates,advances:advances.map(a=>({...a,runner:identity(a.runner)}))};
 }
 function advanceGround(g,p,b,pitcher,decision,outKeys=[],error=false){
  const s=g.state;if(s.outs>=3)return;
  const before=[...s.bases];s.bases=[null,null,null];
  for(let i=2;i>=0;i--){const runner=before[i];if(!runner||outKeys.includes(runner.key))continue;const plan=decision.advances.find(a=>a.runner.key===runner.key),to=plan?.toBase??i+1;
   if(to===4){creditRun(g,runner,error||p.doublePlay?null:b,pitcher);if(walkOff(g)){finish(g,'walkoff');break;}}
   else {s.bases[to-1]=runner;if(to!==i+1)F().move(g,runner,i+1,to);}
  }
  if(!outKeys.includes(b.key)&&!s.finished)s.bases[0]=b;
 }
 function groundPlay(g,p,b,pitcher){
  const s=g.state,f=F().defense(g)[p.fielderIndex],skill=F().ability(f,'fielding'),catching=F().ability(f,'catching');
  const d=defenseDecision(g,p,b);p.defenseDecision=d;p.forceTrace={atContact:F().forcePlan(s.bases,b),advances:d.advances};
  const catchError=g.rng()<(.003+.045*(1-(skill+catching)/2)**2)*.55;
  if(catchError){d.decision='HOLD_BALL';d.reasons=['fielding error; no throw opportunity'];}
  const hold=d.decision==='HOLD_BALL',throwError=!hold&&g.rng()<d.errorRisk,error=catchError||throwError;
  if(error){p.error=true;p.errorType=catchError?'groundFielding':'throwing';s.errors[1-offense(g)]++;s.virtualOuts++;s.unearned[b.key]=true;p.log=catchError?'ゴロ捕球エラー':'送球エラー';}
  if(!hold)p.throw={from:p.fielder,toBase:d.toBase,kind:d.force?'force':'tag',runnerKey:d.runnerKey};
  const success=!hold&&!error&&g.rng()<d.outChance,outKeys=[];
  if(success){const runner=d.fromBase===0?b:s.bases[d.fromBase-1];outKeys.push(runner.key);recordOut(g,pitcher);F().move(g,runner,d.fromBase,d.toBase,'out',d.force?'forceOut':'tagOut');p.forceOut=d.force;
   if(d.toBase===2&&d.force&&s.outs<3){const chance=clamp(.25+.2*skill+.15*catching+.1*F().ability(f,'arm')-.20*n(g,b,'speed')-(p.bunt?.15:0),.03,.75);if(g.rng()<chance){recordOut(g,pitcher);outKeys.push(b.key);F().move(g,b,0,1,'out','batterOut');p.doublePlay=true;p.throws=[p.throw,{fromBase:2,toBase:1}];}}
  }
  // Removed runners must not remain in the terminal pre-switch snapshot.
  for(let i=0;i<3;i++)if(outKeys.includes(s.bases[i]?.key))s.bases[i]=null;
  advanceGround(g,p,b,pitcher,d,outKeys,error);
  p.forceTrace.outKeys=outKeys;p.forceTrace.finalBases=s.bases.map(r=>r?.key||null);p.forceTrace.actions=s.playActions.map(a=>({...a}));
  if(error)return 'error';
  if(!success&&(hold||d.toBase===1)){s.batting[b.key].H++;s.pitching[pitcher.key].H++;s.hits[offense(g)]++;p.infieldHit=true;p.log='一塁で打者セーフ、内野安打';return 'single';}
  if(p.doublePlay){p.log='先行走者を封殺、一塁転送で併殺';return 'doublePlay';}
  if(success&&d.toBase===1){
   const advanced=s.playActions.some(a=>a.runner.key!==b.key&&a.result==='safe'&&a.toBase>a.fromBase);
   if(p.bunt&&!p.safetyBunt&&advanced){s.batting[b.key].AB--;s.batting[b.key].SH++;p.sacrificeBunt=true;p.log='送りバント成功、打者アウト・走者進塁';return 'sacrificeBunt';}
   p.log=p.bunt?'バント、打者アウト':'一塁で打者アウト';return 'groundout';
  }
  p.fieldersChoice=true;p.log=hold?'送球を見送り、野選で出塁':success?'先行走者アウト、野選で打者出塁':'送球は間に合わず、野選で全員セーフ';return 'fieldersChoice';
 }
 function resolveBunt(g,pitcher,batter){
  const effects=specialModifiers(batter,pitcher),p=generatePitchQuality(g,pitcher,effects);Object.assign(p,judgePitch(g,p,effects));
  Object.assign(p,{bunt:true,buntAttempt:false,battedResult:null,battedQuality:null,battedGrade:null,infieldHit:false,specialModifiers:effects});
  if(!p.inZone){p.outcome='ball';return p;}
  p.buntAttempt=true;const meet=n(g,batter,'meet'),contact=clamp(.7+(has(batter,'バント○')?.10:has(batter,'バント×')?-.10:0)+.2*meet-.20*p.pitchQuality,.4,.9);
  if(g.rng()>=contact){p.outcome=g.rng()<.7?'foul':'swingingStrike';return p;}
  p.buntQuality=clamp(.35+(has(batter,'バント○')?.12:has(batter,'バント×')?-.12:0)+.4*meet-.25*p.pitchQuality+.20*centeredNoise(g.rng),.05,.9);
  p.buntPop=g.rng()<.08+.12*(1-meet);p.outcome='inPlay';p.battedResult=p.buntPop?'lineout':'groundout';p.battedQuality=p.buntQuality;p.battedGrade='touch';return p;
 }
 function buntGeometry(g,p){
  const angle=(g.rng()*2-1)*1.05,length=p.buntPop?25:25+100*(1-p.buntQuality)+25*g.rng();
  p.landingPoint=[400+Math.sin(angle)*length,430-Math.cos(angle)*length];p.depth=length;p.sprayAngle=angle;
  p.fielderIndex=[0,1,2,4].reduce((best,i)=>{const at=F().layout.positions[i],prev=F().layout.positions[best];return Math.hypot(at[0]-p.landingPoint[0],at[1]-p.landingPoint[1])<Math.hypot(prev[0]-p.landingPoint[0],prev[1]-p.landingPoint[1])?i:best;},0);
  p.fieldDirection=p.landingPoint[0]<360?'left':p.landingPoint[0]>440?'right':'center';p.ballType=p.buntPop?'line':'ground';
 }
 // Position strategies are registered by ID; no team-dependent policies.
 const alignments={NORMAL:{infield:0,outfield:0},IN:{infield:40,outfield:0},DEEP:{infield:-15,outfield:-30}};
 function alignment(g){const s=g.state,c=context(g),decision=s.inning>=7&&c.close?(s.bases[2]&&s.outs<2?'IN':'DEEP'):'NORMAL';return {decision,intent:'prevent runs',options:Object.keys(alignments),reasons:[`inning ${s.inning}; run value ${c.oneRunValue}; third occupied ${!!s.bases[2]}`],positions:F().layout.positions.map((p,i)=>[p[0],p[1]+(i>=6?alignments[decision].outfield:i>=2?alignments[decision].infield:0)])};}
 function extraOptions(g,b){const s=g.state,c=context(g),fresh=s.balls===0&&s.strikes===0,speed=n(g,b,'speed'),meet=n(g,b,'meet');return [
  {decision:'SAFETY_BUNT',legal:(fresh||s.buntPlan==='SAFETY_BUNT')&&s.strikes<2&&s.outs<3&&!s.bases[0],weight:fresh&&!s.bases[0]?.10*speed**3*(1-n(g,b,'power')):0,reasons:[`batter speed ${speed.toFixed(2)}; surprise bunt for a hit`]},
  {decision:'SQUEEZE',legal:(fresh||s.buntPlan==='SQUEEZE')&&s.strikes<2&&s.outs<2&&!!s.bases[2],weight:fresh&&s.outs<2&&s.bases[2]?.25*c.oneRunValue*meet:0,reasons:[`third occupied ${!!s.bases[2]}; outs ${s.outs}; one-run value ${c.oneRunValue}`]},
  {decision:'HIT_AND_RUN',legal:fresh&&s.outs<2&&!!s.bases[0]&&!s.bases[1],weight:fresh&&s.outs<2&&s.bases[0]&&!s.bases[1]?.12*meet*(.5+n(g,s.bases[0],'speed')):0,reasons:[`contact ${meet.toFixed(2)}; first occupied ${!!s.bases[0]}; second open ${!s.bases[1]}`]}
 ];}
 function matchup(g,b){const s=g.state,c=context(g),next=g.teams[offense(g)].lineup[(s.order[offense(g)]+1)%9],strength=offenseStrength(g,b),nextStrength=offenseStrength(g,next);
  const id=`${s.inning}/${s.half}/${s.paCompleted}`;if(s.matchupPlan?.id===id)return s.matchupPlan;
  const legal=!s.bases[0]&&!!(s.bases[1]||s.bases[2])&&s.outs>0;
  const options=[{decision:'CHALLENGE',weight:1},{decision:'CAUTIOUS',weight:strength*.5*(c.close?1:.4)},{decision:'INTENTIONAL_WALK',weight:legal?Math.max(0,strength-nextStrength)*c.oneRunValue:0}];
  const selected=choose(g,options);s.matchupPlan={id,...selected,intent:'prevent runs',options,reasons:[`batter offense ${strength.toFixed(2)}; next batter ${nextStrength.toFixed(2)}`,`first open ${!s.bases[0]}; outs ${s.outs}; one-run value ${c.oneRunValue}`]};return s.matchupPlan;
 }
 function prepare(g){const s=g.state,id=`${s.inning}/${s.half}/${s.paCompleted}`;if(s.prepared===id)return [];s.prepared=id;const c=context(g),records=[];
  const stat=p=>{s.batting[p.key]??={AB:0,H:0,doubles:0,triples:0,HR:0,RBI:0,BB:0,K:0,R:0,SB:0,CS:0,SF:0,SH:0};};
  function replace(team,old,p,decision,reason){const index=team.lineup.findIndex(x=>x.key===old.key);if(index<0)throw Error('substitution player not in lineup');team.lineup[index]=p;team.bench=team.bench.filter(x=>x.key!==p.key);team.removed??=[];team.removed.push(old.key);stat(p);records.push({intent:'use available player',decision,options:[decision,'KEEP'],reasons:[reason],execution:{out:identity(old),in:identity(p)},outcome:'substituted'});}
  const def=g.teams[1-offense(g)],p=def.pitcher,budget=g.config.fatigue.baseBudget+g.config.fatigue.staminaBudget*p.effective.stamina,fatigue=s.pitching[p.key].pitches/budget;
  const relief=(def.bench||[]).filter(x=>x.isPitcher).sort((a,b)=>(n(g,b,'velocity')+n(g,b,'control'))-(n(g,a,'velocity')+n(g,a,'control')));
  const closer=relief.find(x=>x.pitcherRoles.some(r=>/抑|closer/i.test(r))),lead=-c.scoreDifference;
  const incoming=def.pendingPitcherSlot!=null?relief[0]:s.inning>=9&&lead>0&&lead<=3&&closer?closer:fatigue>=1&&relief[0]?relief[0]:null;
  if(incoming){replace(def,def.pendingPitcherSlot!=null?def.lineup[def.pendingPitcherSlot]:p,incoming,s.inning>=9&&lead>0&&lead<=3&&incoming===closer?'CLOSER':'RELIEF',`fatigue ${fatigue.toFixed(2)}; inning ${s.inning}; defensive lead ${lead}`);def.pitcher=incoming;delete def.pendingPitcherSlot;s.pitching[incoming.key]={outs:0,pitches:0,H:0,HR:0,R:0,ER:0,BB:0,K:0};}
  else records.push({intent:'pitcher usage',decision:'CONTINUE',options:['CONTINUE',...(relief.length?['RELIEF']:[])],reasons:[`fatigue ${fatigue.toFixed(2)}; available relief ${relief.length}`],execution:'retain pitcher',outcome:'continued'});
  const off=g.teams[offense(g)],bench=()=> (off.bench||[]).filter(x=>!x.isPitcher),b=currentBatter(g);
  if(s.inning>=7&&c.scoreDifference<=0&&c.scoreDifference>=-3){const best=bench().sort((a,b)=>offenseStrength(g,b)-offenseStrength(g,a))[0];if(best&&(b.key!==off.pitcher.key||(off.bench||[]).some(x=>x.isPitcher))&&offenseStrength(g,best)>offenseStrength(g,b)+.2){if(b.key===off.pitcher.key)off.pendingPitcherSlot=off.lineup.findIndex(x=>x.key===b.key);replace(off,b,best,'PINCH_HIT','late deficit/tie; bench offense exceeds current batter by > 0.20');}}
  if(s.inning>=7&&c.close){for(let i=2;i>=0;i--){const r=s.bases[i],best=bench().sort((a,b)=>n(g,b,'speed')-n(g,a,'speed'))[0];if(r&&(r.key!==off.pitcher.key||(off.bench||[]).some(x=>x.isPitcher))&&best&&n(g,best,'speed')>n(g,r,'speed')+.25){if(r.key===off.pitcher.key)off.pendingPitcherSlot=off.lineup.findIndex(x=>x.key===r.key);replace(off,r,best,'PINCH_RUN','late close game; bench speed exceeds runner by > 0.25');s.bases[i]=best;break;}}}
  if(s.inning>=7&&lead>0&&lead<=3){const best=(def.bench||[]).filter(x=>!x.isPitcher).sort((a,b)=>F().ability(b,'fielding')-F().ability(a,'fielding'))[0];if(best){const old=def.lineup.filter(x=>x.key!==def.pitcher.key&&x.profile.mainPosition===best.profile.mainPosition).sort((a,b)=>F().ability(a,'fielding')-F().ability(b,'fielding'))[0];if(old&&F().ability(best,'fielding')>F().ability(old,'fielding')+.25)replace(def,old,best,'DEFENSIVE_SUB','late lead; same-position bench fielding exceeds starter by > 0.25');}}
  return records;
 }
 function execute(g,p,b,d){
  if(d.matchup.decision==='INTENTIONAL_WALK')return {outcome:'ball',intentionalWalk:true,pitchType:'敬遠',pitchSpeed:null,log:'申告敬遠'};
  if(['SAC_BUNT','SAFETY_BUNT','SQUEEZE'].includes(d.decision)){const pitch=resolveBunt(g,p,b);pitch.safetyBunt=d.decision==='SAFETY_BUNT';pitch.squeeze=d.decision==='SQUEEZE';return pitch;}
  const local=d.matchup.decision==='CAUTIOUS'?{...g,config:{...g.config,judgment:{...g.config.judgment,zoneBase:g.config.judgment.zoneBase-.14}}}:g;
  let pitch;
  if(d.decision==='HIT_AND_RUN'){
   const effects=specialModifiers(b,p);pitch=generatePitchQuality(local,p,effects);Object.assign(pitch,judgePitch(local,pitch,effects),{swing:true});Object.assign(pitch,resolveContact(local,b,pitch,effects));if(pitch.outcome==='inPlay')Object.assign(pitch,resolveFinalResult(local,b,pitch,generateBattedQuality(local,b,pitch,effects),effects));pitch.hitAndRun=true;
   // A miss exposes the started runner to the existing legal steal execution.
   if(pitch.outcome==='swingingStrike'&&F().canSteal(g,1)){const running=F().steal(g,p,{fromBase:1});pitch.runningExecution=running;}
  }else pitch=resolvePitch(local,p,b);
  return pitch;
 }

 function eventTrace(e,decision){return {situation:{inning:e.inning,half:e.half,outs:e.outsBefore,score:e.scoreBefore,runners:e.runnersBefore},options:decision.candidates,reason:decision.reasons,intent:decision.intent,decision:decision.decision,offense:decision,defense:e.defenseDecision||null,execution:{matchup:decision.matchup.decision,alignment:decision.alignment.decision,running:e.runningExecution?.result??null,type:e.intentionalWalk?'intentional walk':e.hitAndRun?'hit and run':e.buntAttempt?'bunt attempt':e.bunt?'bunt stance / take pitch':e.eventType==='baserunning'?'steal attempt':'normal pitch',steal:e.stealExecution??null,buntQuality:e.buntQuality??null,buntPoint:e.bunt?e.landingPoint:null,defense:e.defenseDecision??null},outcome:{result:e.result,runsScored:e.runsScored,outsAfter:e.outsAfter},policy:'shared-alpha1'};}
 globalThis.SL_TACTICS={prepare,execute,extraOptions,matchup,alignment,alignments,enabled,context,buntOption,stealOption,offenseDecision,defenseDecision,groundPlay,resolveBunt,buntGeometry,eventTrace};
})();
