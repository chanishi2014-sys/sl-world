/* Presentation-only report adapter. Does not execute or modify ENGINE policy. */
(()=>{'use strict';
const L=SL_LAB,copy=x=>JSON.parse(JSON.stringify(x));
const labels={STEAL:'盗塁',SWING_AWAY:'強攻',STEAL_2B:'二塁盗塁',STEAL_3B:'三塁盗塁',SAC_BUNT:'送りバント',SAFETY_BUNT:'セーフティバント',SQUEEZE:'スクイズ',HIT_AND_RUN:'H&R',PINCH_HIT:'代打',PINCH_RUN:'代走',DEFENSIVE_SUB:'守備固め',CONTINUE:'続投',RELIEF:'救援',CLOSER:'抑え',CHALLENGE:'勝負',CAUTIOUS:'警戒勝負',INTENTIONAL_WALK:'敬遠',NORMAL:'通常守備',IN:'前進守備',DEEP:'深め守備',SECURE_RETURN:'内野へ返球',HOLD_BALL:'その場で保持'};
const defaultAxes={steal:'runnerSpeed',bunt:'buntTrait',squeeze:'buntTrait',hitRun:'batterMeet',walk:'nextMeet',pinchHit:'benchMeet',pinchRun:'benchSpeed',relief:'fatigue',alignment:'none'};
const axisNames={runnerSpeed:'走者の走力',runnerTrait:'走者の盗塁特殊能力',catcherArm:'捕手の肩',batterMeet:'打者のミート',batterPower:'打者のパワー',buntTrait:'打者のバント特殊能力',nextMeet:'次打者のミート',pitcherControl:'投手の制球',fatigue:'投手の疲労（投球数）',benchMeet:'控えのミート',benchSpeed:'控えの走力',defenseFielding:'守備控えの守備力',none:'比較なし（単一条件）'};
const label=key=>labels[String(key||'').split(':').at(-1)]||String(key||'記録なし');
const title=s=>(L.scenarios[s.id]?.label||s.label||'CUSTOM')+'テスト';
const situation=s=>`${s.inning}回${s.half==='top'?'表':'裏'} ｜ ${s.score.join('–')} ｜ ${s.outs}死 ｜ ${s.bases.some(Boolean)?['一','二','三'].filter((_,i)=>s.bases[i]).join('・')+'塁':'走者なし'}`;
const condition=(g,i)=>({id:'ABC'[i]||String(i+1),label:g.changed?.value!=null?String(g.changed.value)==='none'?'なし':String(g.changed.value):g.label||'単一条件'});
function metric(r,id){let [kind,key]=id.split(':'),name,basis;
 if(kind==='initial'){name='初手'+label(key)+'選択率';basis='initialDecision（各試行の最初の判断）/ 全試行';}
 if(kind==='observed'){name=label(key)+'発生率（観測全体）';basis='初期判断を含む観測全体で1回以上発生した試行 / 全試行';}
 if(kind==='later'){name=label(key)+'発生率（初期判断後）';basis='最初の判断を除く観測期間で1回以上発生した試行 / 全試行';}
 if(kind==='operation'){name=label(key)+'選択率';basis='観測範囲内で1回以上 / 全試行（重複あり）';}
 if(kind==='matchup'){name=label(key);basis='各試行の最初の投手対打者判断 / 全試行';}
 if(kind==='alignment'){name=label(key);basis='各試行の最初の守備位置 / 全試行';}
 if(kind==='success'){name=label(key)+'成功率';basis=key==='STEAL'?'観測範囲全体の盗塁成功 / 盗塁実行（途中・H&R空振り後の盗塁も含む）':'成功 / 成否記録のある作戦（バントは打席内の計画結果）';if(key==='STEAL')name='盗塁成功率';}
 if(kind==='outcome'){name={scored:'得点率',noScore:'無得点率',tookLead:'勝ち越し率',tiedAtEnd:'終了時同点率',draw:'試合引き分け率',outEnded:'アウト終了率',gameFinished:'試合終了率'}[key]||key;basis='該当試行 / 全試行';}
 const values=r.groups.map((g,i)=>{let n=0,d=g.trials.length;const s=g.summary;
  if(kind==='initial')n=key==='STEAL'?(s.initialDecision.STEAL_2B||0)+(s.initialDecision.STEAL_3B||0):s.initialDecision[key]||0;
  if(kind==='observed'||kind==='later')n=g.trials.filter(t=>(t.decision[key]||0)-(kind==='later'&&t.initialDecision===key?1:0)>0).length;
  if(kind==='operation')n=g.trials.filter(t=>t.decision[id.slice('operation:'.length)]).length;
  if(kind==='matchup')n=g.trials.filter(t=>t.traces?.[0]?.matchup?.decision===key).length;
  if(kind==='alignment')n=g.trials.filter(t=>t.traces?.[0]?.alignment===key).length;
  if(kind==='outcome')n=s.outcome[key]||0;
  if(kind==='success'){const x=s.execution;n=x[key==='STEAL'?'stolenBase':key+':success']||0;d=n+(x[key==='STEAL'?'caughtStealing':key+':failure']||0);}
  return {conditionId:condition(g,i).id,numerator:n,denominator:d,rate:d?n/d:null,...(['observed','later'].includes(kind)?{occurrences:g.trials.reduce((n,t)=>n+Math.max(0,(t.decision[key]||0)-(kind==='later'&&t.initialDecision===key?1:0)),0)}:{})};});
 if(kind==='operation'&&key==='MATCHUP')name=label(id.split(':').at(-1))+'（trial内）';
 if(kind==='operation'&&key==='ALIGNMENT')name=label(id.split(':').at(-1))+'（trial内）';
 if(kind==='operation'&&key==='DEFENSE')name=label(id.split(':').at(-1))+'（trial内）';
 return {id,label:name||label(key),basis,values};
}
function metrics(r){const common=['initial:SWING_AWAY'];const ids={steal:['initial:STEAL','success:STEAL','initial:HIT_AND_RUN',...common],bunt:['initial:SAC_BUNT','success:SAC_BUNT',...common],squeeze:['initial:SQUEEZE','success:SQUEEZE',...common],hitRun:['initial:HIT_AND_RUN','observed:HIT_AND_RUN','later:HIT_AND_RUN','success:HIT_AND_RUN',...common],walk:['matchup:CHALLENGE','matchup:CAUTIOUS','matchup:INTENTIONAL_WALK'],pinchHit:['operation:PINCH_HIT'],pinchRun:['operation:PINCH_RUN'],relief:['operation:CONTINUE','operation:RELIEF','operation:CLOSER'],alignment:['alignment:NORMAL','alignment:IN','alignment:DEEP']}[r.groups[0].bundle.scenario.id]||common;
 const all=[...new Set(['observed:HIT_AND_RUN','later:HIT_AND_RUN',...r.groups.flatMap(g=>Object.keys(g.summary.initialDecision).map(k=>'initial:'+k)),...['PINCH_HIT','PINCH_RUN','DEFENSIVE_SUB','CONTINUE','RELIEF','CLOSER','MATCHUP:CHALLENGE','MATCHUP:CAUTIOUS','MATCHUP:INTENTIONAL_WALK','ALIGNMENT:NORMAL','ALIGNMENT:IN','ALIGNMENT:DEEP','DEFENSE:SECURE_RETURN','DEFENSE:HOLD_BALL'].map(k=>'operation:'+k),...['scored','noScore','tookLead','tiedAtEnd','draw','outEnded','gameFinished'].map(k=>'outcome:'+k),...['STEAL','SAC_BUNT','SAFETY_BUNT','SQUEEZE','HIT_AND_RUN'].map(k=>'success:'+k)])];
 return {primary:ids.map(id=>metric(r,id)),all:all.map(id=>metric(r,id))};
}
const explanations={STATE_LEGALITY:['走者またはアウト数に不整合','重複走者や成立しないアウト数を検出しました。'],TWO_OUT_SACRIFICE:['2死から送りバントを選択','送りバントの前提条件との矛盾が検出されました。'],OCCUPIED_STEAL:['走者のいる塁への盗塁','盗塁先が空いていない可能性があります。'],ILLEGAL_OPTION:['前提条件を満たさない選択','ENGINEが不成立と記録した選択肢が選ばれています。'],ILLEGAL_SQUEEZE:['スクイズの前提条件に不整合','三塁走者・アウト数を確認してください。'],ILLEGAL_HIT_RUN:['H&Rの前提条件に不整合','一塁走者・二塁の空き・アウト数を確認してください。'],MISSING_STEAL_EXECUTION:['盗塁判断と実行が不一致','盗塁を選んだ記録に対応する実行がありません。'],DEEP_HOLD:['外野で返球せず保持','意味のある保持か、返球が欠けたかを確認してください。'],MISSING_RETURN:['返球判断に送球記録がない','SECURE RETURNと実行記録が一致していません。'],REASON_CONTRADICTION:['理由と条件の不整合','能力条件と高成功見込みという理由が矛盾する可能性があります。'],EXECUTION_MISMATCH:['判断と実行が不一致','敬遠の判断と実行を確認してください。'],LOW_SENSITIVITY:['比較条件を変えても初回選択率がほぼ同じ','入力感度・成立する機会・標本数の切り分けを推奨します。'],REPLAY_RESULT_MISMATCH:['保存結果とseed再実行が不一致','保存された終了スコア等と今回のENGINE再生結果が一致しません。']};
function candidates(r){const list=[];function add(a,groupIndex=null){const [heading,reason]=explanations[a.rule]||['記録された要確認候補',a.detail||'詳細記録を確認してください。'];list.push({...a,groupIndex,heading,reason,source:'engine-check'});}
 for(const a of r.anomalies||[])add(a);
 r.groups.forEach((g,i)=>{for(const a of g.summary.anomalies||[])add(a,i);});
 for(const a of r.uiChecks||[])if(a.status==='mismatch')add({severity:'CRITICAL',rule:'REPLAY_RESULT_MISMATCH',...a},a.groupIndex);
 if(r.axis==='runnerSpeed'){const cg=r.groups.map((g,i)=>({g,i})).filter(x=>['C','G'].includes(x.g.changed?.value));if(cg.length===2&&cg.every(x=>x.g.trials.length>=100&&(x.g.summary.initialDecision.STEAL_2B||0)+(x.g.summary.initialDecision.STEAL_3B||0)===0))list.push({severity:'REVIEW',rule:'ZERO_STEAL_CG',source:'observed-summary',heading:'走力C/Gで初回盗塁選択が0件',reason:'閾値挙動の可能性があります。捕手肩や投手条件を固定・変更して追加比較すると切り分けに役立ちます。',groupIndices:cg.map(x=>x.i),groupIndex:cg[0].i,seed:null,detail:cg.map(x=>`${x.g.changed.value}: 0/${x.g.trials.length}`).join(', ')});}
 return list;
}
function diagnosis(r,flags){const facts=[];if(r.axis==='runnerSpeed'&&r.groups.length===3){const vals=metric(r,'initial:STEAL').values,high=vals[0],low=vals[2];if(high.rate!==null&&high.rate>low.rate)facts.push(`初回盗塁選択はA（${condition(r.groups[0],0).label}）${high.numerator}/${high.denominator}件、C（${condition(r.groups[2],2).label}）${low.numerator}/${low.denominator}件。今回の標本では走力条件間の選択率差が観測されました。`);}
 if(r.groups.some(g=>g.trials.length<100))facts.push('100回未満の条件があります。低頻度の判断への感度は、この標本だけでは確認できません。');
 const critical=flags.filter(f=>f.severity==='CRITICAL').length,review=flags.filter(f=>f.severity==='REVIEW').length;
 facts.push(`機械的な要確認候補は CRITICAL ${critical}件、REVIEW ${review}件です。`);
 if(flags.some(f=>f.rule==='ZERO_STEAL_CG'))facts.push('C/Gの初回盗塁選択が0件でした。閾値挙動の可能性を追加比較で確認してください。');
 if(!flags.length)facts.push('今回実行したチェックでは候補は検出されませんでした。作戦の正誤や理想の勝率を判定するものではありません。');
 return {status:critical?'candidate':review||r.groups.some(g=>g.trials.length<100)?'review':'normal',label:critical?'異常候補あり':review||r.groups.some(g=>g.trials.length<100)?'要確認':'正常（検査範囲内）',facts,scope:'観測事実と機械検査。野球判断の最終評価ではありません。',replayChecks:r.uiChecks||[],reproducibilityCoverage:'保存seedの2D再生が観測終了に達した場合のみ、保存スコア・試合終了情報と比較。全seedの再現検査は未実施。'};
}
function nextTest(r){const s=copy(r.groups[0].bundle.scenario);let axis,name;
 function runnerS(){const key='runner'+(s.bases.findIndex(Boolean)+1),p=copy(s.players[key]||s.players.runner||L.preset('RUNNER',s.runnerGrade,s.runnerTrait));p.batting??={};p.batting.speed=L.gradeValue('speed','S');s.players[key]=p;}
 if(['runnerSpeed','catcherArm'].includes(r.axis)&&s.bases.some(Boolean)){runnerS();if(r.axis==='runnerSpeed'){axis='catcherArm';name='走力S固定 × 捕手肩 S/C/G';}else{const p=copy(s.players.catcher||L.preset('CATCHER',s.catcherGrade));p.batting??={};p.batting.arm=L.gradeValue('arm','C');s.players.catcher=p;axis='runnerTrait';name='走力S・捕手肩C固定 × 盗塁○/なし/×';}}
 else{axis=({runnerTrait:'pitcherControl',buntTrait:'batterMeet',nextMeet:'pitcherControl',fatigue:'pitcherControl',benchMeet:'batterMeet',benchSpeed:'runnerSpeed'})[r.axis]||defaultAxes[s.id]||'none';if(L.axes[axis]?.role==='runner'&&!s.bases.some(Boolean))axis='batterMeet';name='同じ状況 × '+axisNames[axis];}
 return {label:name,reason:'比較対象を一つ切り替え、判断がどの入力に反応したかを切り分けます。',scenario:s,axis,trialCountPerCondition:r.trialCount,autoRun:false};
}
function differentPaths(a,b,prefix=''){const paths=[];for(const key of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){const path=prefix?prefix+'.'+key:key,x=a?.[key],y=b?.[key];if(JSON.stringify(x)===JSON.stringify(y))continue;if(x&&y&&typeof x==='object'&&typeof y==='object')paths.push(...differentPaths(x,y,path));else paths.push(path);}return paths;}
function comparison(r){const base=r.groups[0].bundle,paths=[...new Set(r.groups.slice(1).flatMap(g=>differentPaths({scenario:base.scenario,teams:base.teams},{scenario:g.bundle.scenario,teams:g.bundle.teams})))];return {axis:r.axis,target:L.axes[r.axis]?.role||null,ability:L.axes[r.axis]?.stat||(L.axes[r.axis]?.trait?'specials':r.axis==='fatigue'?'pitchCount':null),label:axisNames[r.axis]||r.axis,conditions:r.groups.map((g,i)=>({...condition(g,i),value:g.changed?.value??null,scenario:g.bundle.scenario})),fixedConditions:{referenceCondition:'A',changedPaths:paths,description:paths.length?'A条件の保存snapshotに対し、changedPaths以外は同一':'比較条件間の変更なし',referenceBundle:base}};}
function beforeAfter(a,b){if(!a)return null;return {before:{version:a.version,date:a.date,seedPrefix:a.seedPrefix},after:{version:b.version,date:b.date,seedPrefix:b.seedPrefix},conditions:b.groups.map((g,i)=>{const old=a.groups[i];return {condition:condition(g,i),sameScenario:!!old&&JSON.stringify(old.bundle.scenario)===JSON.stringify(g.bundle.scenario),samePlayers:!!old&&JSON.stringify(old.bundle.teams)===JSON.stringify(g.bundle.teams),sameSeedPrefix:a.seedPrefix===b.seedPrefix,sameCount:old?.trials.length===g.trials.length,before:old?.summary||null,after:g.summary};})};}
function analysis(r,before=null){const m=metrics(r),flags=candidates(r),d=diagnosis(r,flags),s=r.groups[0].bundle.scenario,interesting=[],bySeed=new Map();
 for(const f of flags){if(!f.seed)continue;const key=(f.groupIndex??'*')+'|'+f.seed;if(!bySeed.has(key))bySeed.set(key,[]);bySeed.get(key).push(f);}
 const saved=new Set(r.savedSeeds||[]);r.groups.forEach((g,i)=>{for(const t of g.trials){const relevant=[...(bySeed.get(i+'|'+t.seed)||[]),...(bySeed.get('*|'+t.seed)||[])];if(!relevant.length&&!saved.has(i+'|'+t.seed))continue;interesting.push({conditionId:condition(g,i).id,seed:t.seed,evidenceRole:relevant.length?'flagged':'saved',anomalyType:relevant.map(f=>f.rule),reason:relevant.map(f=>f.reason),intent:t.intent,decision:t.decision,execution:t.execution,outcome:t.outcome});}});
 const included=new Set(interesting.map(x=>x.conditionId+'|'+x.seed));for(const f of flags.filter(x=>!x.seed)){const indices=f.groupIndices||(f.groupIndex!=null?[f.groupIndex]:r.groups.map((_,i)=>i));for(const i of indices){const g=r.groups[i],t=g?.trials[0];if(!t)continue;const id=condition(g,i).id,key=id+'|'+t.seed;if(included.has(key))continue;included.add(key);interesting.push({conditionId:id,seed:t.seed,evidenceRole:'representative',anomalyType:[f.rule],reason:['条件全体の候補を確認する代表seedです。このseedの判断が異常と確定した意味ではありません。',f.reason],intent:t.intent,decision:t.decision,execution:t.execution,outcome:t.outcome});}}

 return {analysisSchemaVersion:1,engineVersion:r.version,testId:r.testId||r.seedPrefix,testName:title(s),timestamp:r.date,scenario:{inning:s.inning,half:s.half,score:s.score,outs:s.outs,runners:s.bases,battingOrder:s.order,pitcherFatigue:s.fatigue,observationRange:s.horizon},comparison:comparison(r),trialCountPerCondition:r.trialCount,totalTrialCount:r.groups.reduce((n,g)=>n+g.trials.length,0),executionTimeMs:r.elapsedMs,seedPrefix:r.seedPrefix,primaryMetrics:m.primary,allMetrics:{rates:m.all,rawByCondition:r.groups.map((g,i)=>({conditionId:condition(g,i).id,summary:g.summary}))},anomalySummary:{criticalCount:flags.filter(f=>f.severity==='CRITICAL').length,reviewCount:flags.filter(f=>f.severity==='REVIEW').length,candidates:flags},labDiagnosis:d,recommendedNextTest:nextTest(r),interestingSeeds:interesting,beforeAfter:beforeAfter(before,r)||r.beforeAfter||null};
}
// Bounded sharing adapter; archive and simulation contracts remain unchanged.
function solReport(r,before=null){
 const flags=candidates(r),m=metrics(r),cats=new Map(),chosen=new Map(),affected=new Set();
 const limits={seedsPerCategoryAndCondition:5,totalSeeds:60,detailBytesPerSeed:24000};
 const key=(i,seed)=>i+'|'+seed;
 function select(i,t,rule,role){if(!t)return;const k=key(i,t.seed);if(!chosen.has(k)){if(chosen.size>=limits.totalSeeds)return;chosen.set(k,{i,t,rules:new Set(),role});}chosen.get(k).rules.add(rule);}
 for(const f of flags){const indices=f.groupIndices||(f.groupIndex!=null?[f.groupIndex]:r.groups.map((_,i)=>i)),k=[f.severity,f.rule,...indices].join('|');
 if(!cats.has(k))cats.set(k,{severity:f.severity,rule:f.rule,reason:f.reason,heading:f.heading,scope:f.seed?'trial':'comparison',conditionIds:indices.map(i=>condition(r.groups[i],i).id),occurrences:0,seeds:new Set(),indices});
 const cat=cats.get(k);cat.occurrences++;if(f.seed)for(const i of indices){cat.seeds.add(key(i,f.seed));affected.add(key(i,f.seed));}}
 const pools=[...cats.values()].flatMap(cat=>cat.indices.map(i=>({cat,i,pool:r.groups[i].trials.filter(t=>cat.scope==='comparison'||cat.seeds.has(key(i,t.seed)))})));
 // Round-robin across categories and conditions before adding their next example.
 for(let j=0;j<limits.seedsPerCategoryAndCondition;j++)for(const {cat,i,pool}of pools){const n=Math.min(limits.seedsPerCategoryAndCondition,pool.length);if(j<n)select(i,pool[Math.floor(j*(pool.length-1)/Math.max(1,n-1))],cat.rule,cat.scope==='trial'?'flagged':'representative');}
 for(const saved of r.savedSeeds||[]){const i=Number(saved.split('|')[0]),seed=saved.slice(saved.indexOf('|')+1);select(i,r.groups[i]?.trials.find(t=>t.seed===seed),'USER_SAVED','saved');}
 const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
 const interestingSeeds=[...chosen.values()].map(({i,t,rules,role})=>{const detail={initial:t.initial,intent:t.intent,initialDecision:t.initialDecision,decision:t.decision,execution:t.execution,outcome:t.outcome,traces:[],operations:[],anomalies:[]},omittedRecords={};
 const sequences=new Set((t.anomalies||[]).map(a=>a.sequence)),traces=[...(t.traces||[])].sort((a,b)=>Number(sequences.has(b.sequence))-Number(sequences.has(a.sequence)));
 for(const [field,records]of Object.entries({traces,operations:t.operations||[],anomalies:t.anomalies||[]})){omittedRecords[field]=0;for(const record of records){detail[field].push(record);if(bytes(detail)>limits.detailBytesPerSeed){detail[field].pop();omittedRecords[field]++;}}}detail.traces.sort((a,b)=>a.sequence-b.sequence);
 return {conditionId:condition(r.groups[i],i).id,seed:t.seed,evidenceRole:role,anomalyType:[...rules],detail,omittedRecords};});
 const compactSummary=s=>{if(!s)return null;const {anomalies,...rest}=s;return {...rest,anomalyOccurrences:anomalies?.length||0};},ba=beforeAfter(before,r)||r.beforeAfter||null;
 const categories=[...cats.values()].map(({seeds,indices,...cat})=>{const denominator=indices.reduce((n,i)=>n+r.groups[i].trials.length,0);return {...cat,affectedTrialCount:cat.scope==='trial'?seeds.size:null,trialDenominator:denominator,affectedTrialRate:cat.scope==='trial'?seeds.size/denominator:null,representativeSeeds:interestingSeeds.filter(s=>s.anomalyType.includes(cat.rule)&&cat.conditionIds.includes(s.conditionId)).map(s=>({conditionId:s.conditionId,seed:s.seed}))};});
 const d=diagnosis(r,flags);delete d.replayChecks;
 return {format:'SL_WORLD_ENGINE_LAB_SOL',schemaVersion:1,analysisSchemaVersion:2,engineVersion:r.version,testId:r.testId||r.seedPrefix,testName:title(r.groups[0].bundle.scenario),timestamp:r.date,seedPrefix:r.seedPrefix,comparison:comparison(r),trialCountPerCondition:r.trialCount,totalTrialCount:r.groups.reduce((n,g)=>n+g.trials.length,0),executionTimeMs:r.elapsedMs,primaryMetrics:m.primary,allMetrics:{rates:m.all,rawByCondition:r.groups.map((g,i)=>({conditionId:condition(g,i).id,summary:compactSummary(g.summary)}))},anomalySummary:{candidateCount:flags.length,criticalCount:flags.filter(f=>f.severity==='CRITICAL').length,reviewCount:flags.filter(f=>f.severity==='REVIEW').length,affectedTrialCount:affected.size,categories},labDiagnosis:d,interestingSeeds,sampling:{...limits,includedSeedCount:interestingSeeds.length,policy:'カテゴリ・条件ごとに試行順の等間隔代表seed。比較候補のseedは異常確定ではない。省略はomittedRecordsに記録。全件は完全ログJSONで確認。'},recommendedNextTest:nextTest(r),beforeAfter:ba?{...ba,conditions:ba.conditions.map(c=>({...c,before:compactSummary(c.before),after:compactSummary(c.after)}))}:null};
}
function exportReport(r,before=null){return {...r,...analysis(r,before)};}
function importReport(value){if(value?.format==='SL_WORLD_ENGINE_LAB_SOL')throw Error('ソル解析用JSONは共有用の軽量形式です。履歴・seed再生の移行には「完全ログJSON」を読み込んでください。');if(value?.format!=='SL_WORLD_ENGINE_LAB'||value.schemaVersion!==1||!Array.isArray(value.groups)||!value.groups.length||value.groups.length>3)throw Error('対応するLAB JSON（schemaVersion 1）ではありません');for(const g of value.groups){L.validate(g.bundle.scenario);if(!Array.isArray(g.trials)||!g.trials.length||!Array.isArray(g.bundle.teams))throw Error('再現に必要なtrial / 選手snapshotがありません');for(const t of g.trials)if(typeof t.seed!=='string'||!t.decision||!t.execution||!t.outcome||!Array.isArray(t.outcome.finalScore)||t.outcome.finalScore.length!==2||t.outcome.finalScore.some(n=>!Number.isFinite(n))||!Array.isArray(t.anomalies))throw Error('trial詳細が不完全です');g.summary=L.summarize(g.trials);}value.anomalies??=[];value.savedSeeds??=[];return value;}
function filename(r){const safe=x=>String(x||'test').replace(/[^\p{L}\p{N}_.-]/gu,'-').slice(0,70);return `sl-world-lab_${safe(r.testId||r.seedPrefix)}_${safe((r.groups[0].bundle.scenario.id||'custom')+'-'+String(r.axis).replace(/[A-Z]/g,m=>'-'+m.toLowerCase()))}_${safe(r.date?.slice(0,10))}.json`;}
globalThis.SL_LAB_PRESENTATION={labels,label,title,situation,axisNames,defaultAxes,condition,metric,metrics,candidates,diagnosis,nextTest,comparison,beforeAfter,analysis,solReport,exportReport,importReport,filename};
})();

