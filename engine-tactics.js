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
  // Execution probability retains the previous engine formula. Traits affect selection only.
  const success=clamp(.54+.35*speed-.18*arm-.08*n(g,pitcher,'control')-.05*n(g,pitcher,'velocity')-(from===2?.06:0),.2,.94);
  const caution=(has(pitcher,'クイック○')?.04:0)+(has(catcher,'盗塁阻止○')?.03:0);
  const estimate=clamp(success-caution,0,1),gain=.30+(from===1?.12:0)+.20*c.oneRunValue,loss=.65+(s.outs===2?.30:0)+.20*c.oneRunValue+(s.bases[2]?.18:0);
  const value=estimate*gain-(1-estimate)*loss;
  const traits=(has(runner,'盗塁○')?1.15:has(runner,'盗塁×')?.7:1)*(has(runner,'積極盗塁')?1.25:has(runner,'慎重盗塁')?.55:1)*(has(runner,'走塁○')?1.05:has(runner,'走塁×')?.9:1);
  const repeated=s.lastStealPitch===s.pitching[pitcher.key].pitches;
  const weight=!repeated&&value>0?.12*value*speed**2*traits*(Math.abs(c.scoreDifference)>=4?.1:1)*(from===2?.6:1):0;
  return {decision:`STEAL_${from+1}B`,fromBase:from,runner:identity(runner),legal:true,weight,successChance:success,estimatedValue:value,inputs:{speed,catcherArm:arm,gain,loss,traits,quickHint:has(pitcher,'クイック○')},reasons:[`runner speed: ${speed.toFixed(2)}; catcher arm: ${arm.toFixed(2)}`,`estimated success: ${estimate.toFixed(2)}`,`gain: ${gain.toFixed(2)}; failure cost: ${loss.toFixed(2)}`,`outs: ${s.outs}; score difference: ${c.scoreDifference}; inning: ${c.inning}`,`stored traits: ${(runner.specials||[]).filter(x=>['盗塁○','盗塁×','積極盗塁','慎重盗塁','走塁○','走塁×'].includes(x)).join(', ')||'none'}`,caution?'quick/catcher trait: cautious estimate':'no quick numeric ability exists',repeated?'wait for next delivered pitch':value>0?'opportunity favorable':'failure cost exceeds gain']};
 }
 function choose(g,candidates){const positive=candidates.filter(c=>c.weight>0);return weighted(g.tacticalRng,positive.map(c=>[c,c.weight]));}
 function offenseDecision(g,b,p){
  const bunt=buntOption(g,b),steals=[1,2].map(from=>stealOption(g,p,from));
  const swing={decision:'SWING_AWAY',weight:1,intent:'score more runs',reasons:['retain chance for multiple runs',`batter offense: ${offenseStrength(g,b).toFixed(2)}`]};
  const candidates=[swing,bunt,...steals];
  let selected;
  if(g.state.buntPlan&&bunt.legal)selected=bunt;
  else {g.state.buntPlan=false;if(g.state.balls!==0||g.state.strikes!==0)bunt.weight=0;selected=choose(g,candidates);}
  if(selected.decision==='SAC_BUNT')g.state.buntPlan=true;
  return {...selected,intent:selected.decision==='SWING_AWAY'?'score more runs':'runner advance',context:context(g),candidates:candidates.map(c=>({decision:c.decision,weight:c.weight,legal:c.legal??true,estimatedValue:c.estimatedValue??null})),policy:'shared-alpha1'};
 }
 function defenseDecision(g,p,b,{settled=false}={}){
  const c=context(g),s=g.state,fielders=F().defense(g),f=fielders[p.fielderIndex],point=p.landingPoint||F().layout.positions[p.fielderIndex],arm=F().ability(f,'arm'),skill=F().ability(f,'fielding');
  let chain=0;while(chain<3&&s.bases[chain])chain++;
  const advances=s.bases.flatMap((runner,i)=>runner?[{runner,fromBase:i+1,toBase:i<chain||p.bunt&&i<2?i+2:i+1,force:i<chain}]:[]);
  const targets=[{runner:b,fromBase:0,toBase:1,force:true},...advances.filter(a=>a.toBase!==a.fromBase)];
  const candidates=[1,2,3,4].map(base=>{
   const target=targets.find(a=>a.toBase===base),receiverIndex=base===1?2:base===2?(p.fielderIndex===5?3:5):base===3?4:1,receiver=fielders[receiverIndex];
   const distance=Math.hypot(point[0]-F().layout.bases[base][0],point[1]-F().layout.bases[base][1]);
   const catching=F().ability(receiver,'catching'),errorRisk=.001+.020*(1-arm)**2+.010*(1-catching)**2+.006*(distance/300)**2;
   const fieldTime=p.bunt?1.1+Math.hypot(point[0]-F().layout.positions[p.fielderIndex][0],point[1]-F().layout.positions[p.fielderIndex][1])/90+.8*(p.buntQuality??.5):.8+Math.hypot(point[0]-400,point[1]-430)/210+(1-skill)*.25;
   const ballETA=fieldTime+.2+distance/(receiverIndex===p.fielderIndex?85:150+80*arm)+(target&&!target.force?.15:0);
   const runnerETA=target?(target.fromBase===0?4.6:3.9)-1.25*n(g,target.runner,'speed'):0;
   const margin=runnerETA-ballETA,outChance=settled||!target?0:clamp(.5+margin*.4,.01,.97);
   const plausible=!settled&&!!target&&margin>-.9;
   const damage=(base===4?1.5:.45)+.35*c.oneRunValue;
   const value=plausible?outChance*(1+(base===4?.30*c.oneRunValue:0)+(s.outs===2?.2:0))-errorRisk*damage-(1-outChance)*.08:0;
   return {decision:`THROW_${base}B`,toBase:base,receiverIndex,runnerKey:target?.runner.key??null,fromBase:target?.fromBase??null,force:target?.force??false,outChance,distance,ballETA,runnerETA,errorRisk,catching,damage,value,weight:plausible&&value>.12?value**4:0,reasons:[settled?'runner already arrived':!target?'no runner to retire':margin<=-.9?'too late':`arrival margin: ${margin.toFixed(2)}s`,`out chance: ${outChance.toFixed(2)}; throw risk: ${errorRisk.toFixed(3)}`,`receiver catching: ${catching.toFixed(2)}; damage: ${damage.toFixed(2)}`]};
  });
  const viable=candidates.filter(c=>c.weight>0),hold={decision:'HOLD_BALL',weight:viable.length?.015:1,reasons:[viable.length?'avoid marginal throw risk':'no reachable out; unnecessary throw risk']};
  // Settled plays do not consume tactical RNG, and cannot invent a late putout.
  const selected=settled||!viable.length?hold:choose(g,[...viable,hold]);
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
  const d=defenseDecision(g,p,b);p.defenseDecision=d;
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
  if(error)return 'error';
  if(p.doublePlay){p.log='先行走者を封殺、一塁転送で併殺';return 'doublePlay';}
  if(success&&d.toBase===1){
   const advanced=s.playActions.some(a=>a.runner.key!==b.key&&a.result==='safe'&&a.toBase>a.fromBase);
   if(p.bunt&&advanced){s.batting[b.key].AB--;s.batting[b.key].SH++;p.sacrificeBunt=true;p.log='送りバント成功、打者アウト・走者進塁';return 'sacrificeBunt';}
   p.log=p.bunt?'バント、打者アウト':'一塁で打者アウト';return 'groundout';
  }
  p.fieldersChoice=true;p.log=hold?'送球を見送り、野選で出塁':success?'先行走者アウト、野選で打者出塁':'送球は間に合わず、野選で全員セーフ';return 'fieldersChoice';
 }
 function resolveBunt(g,pitcher,batter){
  const effects=specialModifiers(batter,pitcher),p=generatePitchQuality(g,pitcher,effects);Object.assign(p,judgePitch(g,p,effects));
  Object.assign(p,{bunt:true,buntAttempt:false,battedResult:null,battedQuality:null,battedGrade:null,infieldHit:false,specialModifiers:effects});
  if(!p.inZone){p.outcome='ball';return p;}
  p.buntAttempt=true;const meet=n(g,batter,'meet'),contact=clamp(.7+.2*meet-.20*p.pitchQuality,.4,.9);
  if(g.rng()>=contact){p.outcome=g.rng()<.7?'foul':'swingingStrike';return p;}
  p.buntQuality=clamp(.35+.4*meet-.25*p.pitchQuality+.20*centeredNoise(g.rng),.05,.9);
  p.buntPop=g.rng()<.08+.12*(1-meet);p.outcome='inPlay';p.battedResult=p.buntPop?'lineout':'groundout';p.battedQuality=p.buntQuality;p.battedGrade='touch';return p;
 }
 function buntGeometry(g,p){
  const angle=(g.rng()*2-1)*1.05,length=p.buntPop?25:25+100*p.buntQuality+25*g.rng();
  p.landingPoint=[400+Math.sin(angle)*length,430-Math.cos(angle)*length];p.depth=length;p.sprayAngle=angle;
  p.fielderIndex=[0,1,2,4].reduce((best,i)=>{const at=F().layout.positions[i],prev=F().layout.positions[best];return Math.hypot(at[0]-p.landingPoint[0],at[1]-p.landingPoint[1])<Math.hypot(prev[0]-p.landingPoint[0],prev[1]-p.landingPoint[1])?i:best;},0);
  p.fieldDirection=p.landingPoint[0]<360?'left':p.landingPoint[0]>440?'right':'center';p.ballType=p.buntPop?'line':'ground';
 }
 function eventTrace(e,decision){return {intent:decision.intent,decision:decision.decision,offense:decision,defense:e.defenseDecision||null,execution:{type:e.buntAttempt?'bunt attempt':e.bunt?'bunt stance / take pitch':e.eventType==='baserunning'?'steal attempt':'normal pitch',buntQuality:e.buntQuality??null},outcome:{result:e.result,runsScored:e.runsScored,outsAfter:e.outsAfter},policy:'shared-alpha1'};}
 globalThis.SL_TACTICS={enabled,context,buntOption,stealOption,offenseDecision,defenseDecision,groundPlay,resolveBunt,buntGeometry,eventTrace};
})();
