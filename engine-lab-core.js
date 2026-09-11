/* Scenario sensitivity harness. Pure engine execution, no DOM/storage/clock. */
(()=>{'use strict';
const E=SL_ENGINE,copy=x=>JSON.parse(JSON.stringify(x));
const grades={S:1,C:.5,G:0};
// Representatives inside the existing official display rank intervals.
const gradeValues={meet:{S:10,C:7,G:1},power:{S:195,C:142,G:20},speed:{S:20,C:14,G:2},arm:{S:20,C:14,G:2},fielding:{S:20,C:14,G:2},catching:{S:20,C:14,G:2},velocity:{S:160,C:122,G:82},control:{S:195,C:142,G:20},stamina:{S:195,C:142,G:20}};
const gradeValue=(stat,grade)=>gradeValues[stat][grade];
const scenarios={
 steal:{label:'盗塁感度',inning:8,half:'bottom',outs:1,bases:[true,false,false]},
 bunt:{label:'送りバント感度',inning:8,half:'bottom',outs:0,bases:[true,false,false]},
 squeeze:{label:'スクイズ判断',inning:9,half:'bottom',outs:1,bases:[false,false,true]},
 hitRun:{label:'ヒットエンドラン判断',inning:5,half:'top',outs:1,bases:[true,false,false]},
 walk:{label:'警戒勝負 / 敬遠',inning:8,half:'bottom',outs:1,bases:[false,true,true],batterGrade:'S',nextGrade:'G'},
 pinchHit:{label:'代打判断',inning:8,half:'bottom',outs:1,bases:[false,false,false],score:[1,0],batterGrade:'G',benchGrade:'S'},
 pinchRun:{label:'代走判断',inning:8,half:'bottom',outs:1,bases:[true,false,false],runnerGrade:'G',benchGrade:'S'},
 relief:{label:'継投判断',inning:8,half:'top',outs:1,bases:[true,false,false],score:[0,1],fatigue:140,relief:true},
 alignment:{label:'前進 / 深め守備',inning:9,half:'bottom',outs:1,bases:[false,false,true],score:[1,0]}
};
function preset(role='BATTER',grade='C',trait='none'){
 const p={id:`LAB_${role}`,name:`${role} ${grade}`,isTest:true,isFielder:true,isPitcher:role==='PITCHER',batting:{meet:7,power:142,speed:14,arm:14,fielding:14,catching:14},pitching:{velocity:122,control:142,stamina:142},specials:[],mainPosition:role==='CATCHER'?'C':role==='PITCHER'?'P':'OF'};
 const v=grades[grade];
 const set=k=>{const r=E.CONFIG.ranges[k]||[1,20];(k in p.pitching?p.pitching:p.batting)[k]=gradeValue(k,grade);};
 if(role==='RUNNER')set('speed');else if(role==='CATCHER')set('arm');else if(role==='PITCHER')set('control');else set('meet');
 if(trait!=='none')p.specials=[trait];return p;
}
function config(id='steal'){return {id,...copy(scenarios[id]),score:[...(scenarios[id].score||[0,0])],order:1,fatigue:scenarios[id].fatigue||0,runnerGrade:scenarios[id].runnerGrade||'C',batterGrade:scenarios[id].batterGrade||'C',nextGrade:scenarios[id].nextGrade||'C',catcherGrade:'C',pitcherGrade:'C',benchGrade:scenarios[id].benchGrade||'C',runnerTrait:'none',buntTrait:'none',horizon:'half',players:{}};}
function validate(s){if(!Number.isInteger(s.inning)||s.inning<1||s.inning>9)throw Error('inning must be 1..9');if(!['top','bottom'].includes(s.half))throw Error('invalid half');if(!Number.isInteger(s.outs)||s.outs<0||s.outs>2)throw Error('outs must be 0..2');if(!Array.isArray(s.bases)||s.bases.length!==3)throw Error('three base slots required');if(!Array.isArray(s.score)||s.score.length!==2||s.score.some(n=>!Number.isInteger(n)||n<0))throw Error('invalid score');if(!Number.isInteger(s.order)||s.order<1||s.order>9)throw Error('order must be 1..9');if(!Number.isFinite(s.fatigue)||s.fatigue<0)throw Error('invalid fatigue');if(!['half','game','pa'].includes(s.horizon))throw Error('invalid horizon');}
function normalizeScenario(input){
 const s=copy(input);s.players??={};
 // Materialize fixed inputs before deriving metadata; a changed runner must not alter other occupied bases.
 s.players.batter??=preset('BATTER',s.batterGrade,s.buntTrait);s.players.next??=preset('BATTER',s.nextGrade);
 s.players.catcher??=preset('CATCHER',s.catcherGrade);s.players.pitcher??=preset('PITCHER',s.pitcherGrade);
 s.bases.forEach((yes,i)=>{if(yes)s.players['runner'+(i+1)]??=copy(s.players.runner||preset('RUNNER',s.runnerGrade,s.runnerTrait));});
 if(s.id==='pinchHit'||s.id==='pinchRun')s.players.bench??=preset(s.id==='pinchRun'?'RUNNER':'BATTER',s.benchGrade);
 const roles={batter:['batterGrade','meet'],next:['nextGrade','meet'],catcher:['catcherGrade','arm'],pitcher:['pitcherGrade','control'],bench:['benchGrade',s.id==='pinchRun'?'speed':'meet'],runner:['runnerGrade','speed']};
 for(const [role,[key,stat]] of Object.entries(roles)){const p=s.players[role==='runner'?'runner'+(s.bases.findIndex(Boolean)+1):role]||s.players[role];if(!p)continue;const value=p[stat==='control'?'pitching':'batting']?.[stat],grade=Object.keys(gradeValues[stat]).find(g=>gradeValue(stat,g)===value)||'CUSTOM';s[key]=grade;}
 const trait=(p,names)=>(p.specials||[]).find(x=>names.includes(x))||'none';
 if(s.players.batter)s.buntTrait=trait(s.players.batter,['バント○','バント×']);
 const runner=s.players['runner'+(s.bases.findIndex(Boolean)+1)]||s.players.runner;if(runner)s.runnerTrait=trait(runner,['盗塁○','盗塁×']);
 for(const p of Object.values(s.players))if(p.isTest&&String(p.id).startsWith('LAB_'))p.name=String(p.id).slice(4)+' '+Object.entries({...p.batting,...p.pitching}).map(([k,v])=>k+'='+v).join(' / ');
 return s;
}
function setup(s){s=normalizeScenario(s);validate(s);const teams=['AWAY','HOME'].map((name,i)=>E.makeTeam(name,i?'home':'away',[],E.CONFIG)),off=s.half==='top'?0:1,def=1-off;
 function put(side,index,raw){const p=E.adaptPlayer(raw,`${side?'home':'away'}_${index}`,E.CONFIG);teams[side].lineup[index]=p;if(index===8)teams[side].pitcher=p;return p;}
 // Give every fielder an explicit position so catcher and replacements are stable.
 const pos=['C','1B','2B','3B','SS','LF','CF','RF','P'];
 for(let side=0;side<2;side++)for(let i=0;i<9;i++){const p=preset(i===8?'PITCHER':'BATTER');p.mainPosition=pos[i];put(side,i,p);}
 const batterIndex=s.order-1,nextIndex=s.order%9;
 put(off,batterIndex,s.players.batter||preset('BATTER',s.batterGrade,s.buntTrait));
 put(off,nextIndex,s.players.next||preset('BATTER',s.nextGrade));
 const free=Array.from({length:9},(_,i)=>(batterIndex+8-i+9)%9).filter(i=>i!==batterIndex&&i!==nextIndex&&i!==8),runnerIndices=[];
 s.bases.forEach((yes,i)=>{if(yes){const index=free.shift(),raw=copy(s.players['runner'+(i+1)]||s.players.runner||preset('RUNNER',s.runnerGrade,s.runnerTrait));put(off,index,raw);runnerIndices[i]=index;}});
 const catcher=copy(s.players.catcher||preset('CATCHER',s.catcherGrade));catcher.mainPosition='C';put(def,0,catcher);
 put(def,8,s.players.pitcher||preset('PITCHER',s.pitcherGrade));
 // Bench selection is explicit. Empty means no substitution candidates.
 if(s.players.bench||s.id==='pinchHit'||s.id==='pinchRun'){const raw=s.players.bench||preset(s.id==='pinchRun'?'RUNNER':'BATTER',s.benchGrade);teams[off].bench=[E.adaptPlayer(raw,'lab_off_bench',E.CONFIG)];}
 if(s.relief||s.players.relief){const raw=copy(s.players.relief||preset('PITCHER','C'));raw.isPitcher=true;raw.pitcherRoles=['救援','抑え'];teams[def].bench=[E.adaptPlayer(raw,'lab_relief',E.CONFIG)];}
 if(s.players.defensiveBench){const raw=copy(s.players.defensiveBench);if(raw.mainPosition==='OF')raw.mainPosition='LF';teams[def].bench.push(E.adaptPlayer(raw,'lab_def_bench',E.CONFIG));}
 return {scenario:copy(s),teams,runnerIndices,config:copy(E.CONFIG)};
}
function create(bundle,seed){const s=bundle.scenario,g=E.newGame(bundle.teams,seed,bundle.config),st=g.state,off=s.half==='top'?0:1;Object.assign(st,{inning:s.inning,half:s.half,outs:s.outs,virtualOuts:s.outs,score:[...s.score]});st.lines=[Array(9).fill(null),Array(9).fill(null)];for(let side=0;side<2;side++){for(let i=0;i<s.inning;i++)st.lines[side][i]=0;st.lines[side][0]=s.score[side];}st.order[off]=s.order-1;st.bases=s.bases.map((yes,i)=>yes?g.teams[off].lineup[bundle.runnerIndices[i]]:null);st.pitching[E.currentPitcher(g).key].pitches=s.fatigue;return g;}
function anomalies(e){const out=[],add=(severity,rule,detail)=>out.push({severity,rule,detail,sequence:e.sequence});
 const d=e.tactics?.decision,keys=e.runnersAfter.filter(Boolean).map(p=>p.key);
 if(new Set(keys).size!==keys.length||e.outsAfter>3||e.outsAfter<e.outsBefore)add('CRITICAL','STATE_LEGALITY','duplicate runner / invalid out count');
 if(d==='SAC_BUNT'&&e.outsBefore===2)add('CRITICAL','TWO_OUT_SACRIFICE','sacrifice with two outs');
 if(e.eventType==='baserunning'&&e.runnersBefore[e.toBase-1])add('CRITICAL','OCCUPIED_STEAL','destination occupied');
 if(e.tactics?.offense?.legal===false)add('CRITICAL','ILLEGAL_OPTION','selected option marked illegal');
 if(e.defenseDecision?.decision==='HOLD_BALL'&&e.fielderIndex>=6)add('REVIEW','DEEP_HOLD','outfielder retained ball without secure return');
 if(e.defenseDecision?.decision==='SECURE_RETURN'&&!e.transfers.some(t=>t.kind==='return'))add('CRITICAL','MISSING_RETURN','secure return without transfer');
 if(d?.startsWith('STEAL_')){const x=e.tactics.offense||{};if(x.inputs?.speed<.1&&x.inputs?.catcherArm>.9&&x.reasons.some(r=>/success probability high/i.test(r)))add('REVIEW','REASON_CONTRADICTION','low estimate but high-success reason');}
 if(d==='SQUEEZE'&&(!e.runnersBefore[2]||e.outsBefore===2))add('CRITICAL','ILLEGAL_SQUEEZE','missing third runner / two outs');
 if(d==='HIT_AND_RUN'&&(!e.runnersBefore[0]||e.runnersBefore[1]||e.outsBefore===2))add('CRITICAL','ILLEGAL_HIT_RUN','no first runner / occupied second / two outs');
 if(d?.startsWith('STEAL_')&&e.eventType!=='baserunning')add('CRITICAL','MISSING_STEAL_EXECUTION','steal decision without attempt');
 if(e.intentionalWalk&&d!=='INTENTIONAL_WALK')add('REVIEW','EXECUTION_MISMATCH','walk decision/execution mismatch');
 return out;
}
function trial(bundle,seed,{events=false}={}){const g=create(bundle,seed),initial=copy({inning:g.state.inning,half:g.state.half,outs:g.state.outs,score:g.state.score,bases:g.state.bases.map(p=>p?.key||null)}),off=initial.half==='top'?0:1,traces=[],flags=[],counts={},executions={},reasons={},all=[],operations=[],firstPA=g.state.paCompleted;let activeBunt=null,lastEvent=null;
 let guard=0;
 do {if(++guard>3000)throw Error('scenario pitch guard exceeded: '+seed);const e=E.onePitch(g);if(!e)break;e.sequence=guard;lastEvent=e;if(events)all.push(e);flags.push(...anomalies(e));
  const t=e.tactics,add=(map,k)=>map[k]=(map[k]||0)+1;
  // Selection rates use initial count / PA opportunities plus legal steal attempts.
  if((e.balls===0&&e.strikes===0)||e.eventType==='baserunning'){
   add(counts,t.decision);add(counts,'MATCHUP:'+t.offense.matchup.decision);add(counts,'ALIGNMENT:'+t.offense.alignment.decision);for(const r of t.reason||[])add(reasons,r);
   traces.push({sequence:e.sequence,intent:t.intent,situation:t.situation,options:t.options,decision:t.decision,reason:t.reason,matchup:t.offense.matchup,alignment:t.offense.alignment.decision,execution:t.execution,outcome:t.outcome});
  }
  if(e.plateAppearanceEnded&&traces.length){traces.at(-1).finalExecution={buntQuality:e.buntQuality,point:e.landingPoint,defense:e.defenseDecision,force:e.forceTrace,actions:e.actions};}if(e.plateAppearanceEnded&&traces.length)traces.at(-1).plateAppearanceOutcome={sequence:e.sequence,result:e.result,score:e.scoreAfter,outs:e.outsAfter};
  add(executions,e.result);if(e.hitAndRun)add(executions,'HIT_AND_RUN:'+((e.outcome==='inPlay'&&e.actions.some(a=>a.fromBase>0&&a.toBase>a.fromBase&&a.result==='safe'))?'success':'failure'));if(e.intentionalWalk)add(executions,'INTENTIONAL_WALK');if(e.buntAttempt)add(executions,'BUNT_ATTEMPT');if(e.runningExecution)add(executions,e.runningExecution.result);
  if(['SAC_BUNT','SAFETY_BUNT','SQUEEZE'].includes(t.decision))activeBunt=t.decision;
  if(e.plateAppearanceEnded&&activeBunt){const success=activeBunt==='SQUEEZE'?e.bunt&&e.runsScored>0:activeBunt==='SAFETY_BUNT'?e.safetyBunt&&e.hit:e.sacrificeBunt;add(executions,activeBunt+':'+(success?'success':'failure'));activeBunt=null;}
  for(const op of e.operations||[]){operations.push(op);add(counts,op.decision);for(const reason of op.reasons||[])add(reasons,op.decision+': '+reason);}
  if(e.defenseDecision){add(counts,'DEFENSE:'+e.defenseDecision.decision);for(const reason of e.defenseDecision.reasons||[])add(reasons,e.defenseDecision.decision+': '+reason);}
  if(bundle.scenario.horizon==='pa'&&g.state.paCompleted!==firstPA)break;
  if(bundle.scenario.horizon==='half'&&(g.state.inning!==initial.inning||g.state.half!==initial.half))break;
  // Events are retained only for explicit replay, keeping bulk execution small.
  if(!events)g.state.events=[];
 }while(!g.state.finished);
 const score=[...g.state.score],scored=score[off]>initial.score[off],last=all.at(-1),terminal=g.state.finished?g.state.finishReason:bundle.scenario.horizon==='pa'?'plateAppearanceComplete':'halfInningComplete';
 return {seed:String(seed),initial,initialDecision:traces[0]?.decision,intent:traces[0]?.intent||'observe engine response',decision:counts,reason:reasons,execution:executions,outcome:{finalScore:score,scored,noScore:!scored,tookLead:initial.score[off]<=initial.score[1-off]&&score[off]>score[1-off],tiedAtEnd:score[0]===score[1],draw:g.state.finished&&g.state.finishReason==='draw',outEnded:lastEvent?.outsAfter===3,gameFinished:g.state.finished,finishReason:g.state.finishReason,trialEndReason:terminal},traces,operations,anomalies:flags,classification:flags.some(x=>x.severity==='CRITICAL')?'CRITICAL':flags.length?'REVIEW':'NORMAL',...(events?{events:all,game:g}:{})};
}
function summarize(trials){const r={trials:trials.length,initialDecision:{},decision:{},reason:{},execution:{},outcome:{},anomalies:[]},add=(map,k,n=1)=>map[k]=(map[k]||0)+n;
 for(const t of trials){add(r.initialDecision,t.initialDecision);for(const type of ['decision','reason','execution'])for(const [k,v]of Object.entries(t[type]))add(r[type],k,v);for(const [k,v]of Object.entries(t.outcome))if(typeof v==='boolean'&&v)add(r.outcome,k);for(const a of t.anomalies)r.anomalies.push({seed:t.seed,...a});}return r;
}
const axes={runnerSpeed:{label:'走者 走力 S/C/G',role:'runner',stat:'speed',values:['S','C','G']},runnerTrait:{label:'走者 盗塁○/なし/×',role:'runner',trait:true,values:['盗塁○','none','盗塁×']},catcherArm:{label:'捕手 肩 S/C/G',role:'catcher',stat:'arm',values:['S','C','G']},batterMeet:{label:'打者 ミート S/C/G',role:'batter',stat:'meet',values:['S','C','G']},batterPower:{label:'打者 パワー S/C/G',role:'batter',stat:'power',values:['S','C','G']},buntTrait:{label:'打者 バント○/なし/×',role:'batter',trait:true,values:['バント○','none','バント×']},nextMeet:{label:'次打者 ミート S/C/G',role:'next',stat:'meet',values:['S','C','G']},pitcherControl:{label:'投手 制球 S/C/G',role:'pitcher',stat:'control',values:['S','C','G']},fatigue:{label:'投手 球数 0/80/140',values:[0,80,140]},benchMeet:{label:'控え ミート S/C/G',role:'bench',stat:'meet',values:['S','C','G']},benchSpeed:{label:'控え 走力 S/C/G',role:'bench',stat:'speed',values:['S','C','G']},defenseFielding:{label:'守備控え 守備 S/C/G',role:'defensiveBench',stat:'fielding',values:['S','C','G']}};
// Reusable numeric input rules; execution accepts finite, non-negative integer counts.
const numericInputs={fatigue:{label:'投手疲労（投球数）',unit:'球',labels:{0:'0球 / fresh'},presets:[0,40,80,100,110,140,180],min:0,max:Number.MAX_SAFE_INTEGER}};
function numericValue(value,spec){const n=typeof value==='string'&&value.trim()===''?NaN:Number(value);if(!Number.isSafeInteger(n)||n<spec.min||n>spec.max)throw Error(spec.label+'は'+spec.min+'以上の有効な整数で入力してください');return n;}
function comparisonValues(s,axis){if(axis!=='fatigue'||s?.comparisonPitchCounts==null)return axes[axis].values;const raw=s.comparisonPitchCounts,values=Array.isArray(raw)?raw:String(raw).split(/[\s,、/]+/);if(values.length<2||values.length>20)throw Error('投球数比較は2〜20値を入力してください');const ns=values.map(v=>numericValue(v,numericInputs.fatigue));if(new Set(ns).size!==ns.length)throw Error('投球数比較に重複値があります');return ns;}
function comparisonSpec(axis='none',axisB=null,s=null){
 const ids=axisB?[axis,axisB]:axis==='none'?[]:[axis];
 if(ids.some(id=>!axes[id]))throw Error('比較軸を選択してください');
 const targets=ids.map(id=>axes[id].role+':'+(axes[id].stat||id));
 if(new Set(targets).size!==targets.length)throw Error('同一対象・同一能力を2軸に指定できません');
 return {mode:ids.length===2?'matrix':ids.length?'axis':'single',axes:ids.map(id=>({id,...copy(axes[id]),values:comparisonValues(s,id)})),conditionCount:ids.reduce((n,id)=>n*comparisonValues(s,id).length,1)};
}
function executionSize(axis,axisB,count,s=null){const spec=comparisonSpec(axis,axisB,s);if(!Number.isInteger(count)||count<1||count>10000)throw Error('試行数は1〜10000 / 条件');return {...spec,trialCountPerCondition:count,totalTrials:count*spec.conditionCount};}
function effectiveInputs(bundle){const s=bundle.scenario,off=s.half==='top'?0:1,teams=bundle.teams,runner=bundle.runnerIndices[s.bases.findIndex(Boolean)];
 const players={batter:teams[off].lineup[s.order-1],next:teams[off].lineup[s.order%9],pitcher:teams[1-off].pitcher,catcher:teams[1-off].lineup[0],runner:teams[off].lineup[runner],bench:teams[off].bench?.find(p=>p.key==='lab_off_bench'),defensiveBench:teams[1-off].bench?.find(p=>p.key==='lab_def_bench')};
 return Object.fromEntries(Object.entries(axes).map(([id,a])=>{const p=players[a.role]?.profile;return [id,id==='fatigue'?s.fatigue:a.trait?(p?.specials||[]).filter(x=>(id==='runnerTrait'?['盗塁○','盗塁×']:['バント○','バント×']).includes(x)):p?.[['control','velocity','stamina'].includes(a.stat)?'pitching':'batting']?.[a.stat]??null];}));
}
function compare(s,axis,axisB=null){
 s=normalizeScenario(s);numericValue(s.fatigue,numericInputs.fatigue);comparisonSpec(axis,axisB,s);
 if(axisB){let index=0;return compare(s,axis).flatMap(a=>compare(a.bundle.scenario,axisB).map(b=>({label:String.fromCharCode(65+index++)+' / '+a.changed.value+' × '+b.changed.value,changed:{axis,value:a.changed.value,axisB,valueB:b.changed.value},bundle:b.bundle})));}
 if(axis==='none')return [{label:'A',bundle:setup(s)}];const a=axes[axis];if(!a)throw Error('unknown comparison axis');if(a.role==='runner'&&!s.bases.some(Boolean))throw Error('走者比較には走者を配置してください');return comparisonValues(s,axis).map((value,i)=>{const c=copy(s);if(axis==='fatigue')c.fatigue=value;else{const role=a.role,targetRole=role==='runner'?'runner'+(c.bases.findIndex(Boolean)+1):role,raw=copy(c.players[targetRole]||c.players[role]||preset(role==='runner'?'RUNNER':role==='catcher'?'CATCHER':role==='pitcher'?'PITCHER':'BATTER',role==='runner'?c.runnerGrade:role==='batter'?c.batterGrade:role==='catcher'?c.catcherGrade:role==='pitcher'?c.pitcherGrade:role==='next'?c.nextGrade:c.benchGrade,role==='runner'?c.runnerTrait:role==='batter'?c.buntTrait:'none'));
 if(a.trait){const names=axis==='runnerTrait'?['盗塁○','盗塁×']:['バント○','バント×'];raw.specials=(raw.specials||[]).filter(x=>!names.includes(x));if(value!=='none')raw.specials.push(value);}else{const range=E.CONFIG.ranges[a.stat]||[1,20];const group=['control','stamina','velocity'].includes(a.stat)?'pitching':'batting';raw[group]??={};raw[group][a.stat]=gradeValue(a.stat,value);}c.players[targetRole]=raw;}
 return {label:`${String.fromCharCode(65+i)} / ${value}`,changed:{axis,value},bundle:setup(c)};});}
function compactTrial(t){const first=t.traces[0];t.omittedRecords={traces:t.traces.length,operations:t.operations.length};t.traces=first?[{sequence:first.sequence,decision:first.decision,matchup:{decision:first.matchup?.decision},alignment:first.alignment,plateAppearanceOutcome:first.plateAppearanceOutcome}]:[];t.operations=[];t.detailMode='regenerate';return t;}
function sensitivity(groups,axis){if(groups.length<2||groups.some(g=>(g.summary?.trials??g.trials.length)<100))return [];
 const keys={runnerSpeed:'STEAL_2B',runnerTrait:'STEAL_2B',catcherArm:'STEAL_2B',buntTrait:'SAC_BUNT',nextMeet:'INTENTIONAL_WALK'},key=keys[axis];if(!key)return [];const rates=groups.map(g=>(g.summary.initialDecision[key]||0)/g.summary.trials),n=Math.min(...groups.map(g=>g.summary.trials));
 return Math.max(...rates)-Math.min(...rates)<Math.max(.002,1/n)?[{severity:'REVIEW',rule:'LOW_SENSITIVITY',detail:`${key}: near-identical initial rates (${rates.join(', ')}). Check opportunity, sample size and policy; not a confirmed defect.`}]:[];
}
function csv(report){const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"',rows=[['version','date','condition','seed','scenario','initialDecision','decision','reason','execution','outcome','anomalies']];for(const g of report.groups)for(const t of g.trials)rows.push([report.version,report.date,g.label,t.seed,JSON.stringify(g.bundle.scenario),t.initialDecision,JSON.stringify(t.decision),JSON.stringify(t.reason),JSON.stringify(t.execution),JSON.stringify(t.outcome),JSON.stringify(t.anomalies)]);return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');}
globalThis.SL_LAB={compactTrial,normalizeScenario,comparisonValues,numericInputs,numericValue,comparisonSpec,executionSize,effectiveInputs,anomalies,grades,gradeValue,gradeValues,scenarios,axes,preset,config,validate,setup,create,trial,summarize,compare,sensitivity,csv};
})();

