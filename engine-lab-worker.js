importScripts('engine006-fielding.js','engine006-tactics.js','engine006.js','engine-lab-core.js');
onmessage=({data})=>{
 let phase='setup';
 try{
  const size=SL_LAB.executionSize(data.axis,data.axisB,data.count,data.scenario),start=performance.now(),groups=SL_LAB.compare(data.scenario,data.axis,data.axisB);let completed=0;
  for(let gi=0;gi<groups.length;gi++){
   const group=groups[gi];group.trials=[];group.summary=SL_LAB.summarize([]);phase='simulate';
   for(let i=0;i<data.count;i++){
    const trial=SL_LAB.trial(group.bundle,data.seed+':'+i),one=SL_LAB.summarize([trial]);
    group.summary.trials++;for(const key of ['initialDecision','decision','reason','execution','outcome'])for(const [name,value] of Object.entries(one[key]))group.summary[key][name]=(group.summary[key][name]||0)+value;
    for(const anomaly of one.anomalies)group.summary.anomalies.push(anomaly);
    if(i<12)trial.representativeProcess=trial.traces.slice(0,3).map(t=>({sequence:t.sequence,decision:t.decision,execution:t.execution,finalExecution:t.finalExecution}));
    SL_LAB.compactTrial(trial);trial.reason={};trial.initial=null;trial.intent='observe engine response';trial.omittedRecords.reason='aggregated in group summary; regenerate using seed';group.trials.push(trial);completed++;
    if(completed%100===0)postMessage({type:'progress',phase,completed,total:size.totalTrials,elapsedMs:performance.now()-start});
   }
   phase='aggregate';postMessage({type:'phase',phase,groupIndex:gi});
   phase='handoff';postMessage({type:'group',groupIndex:gi,group});group.trials=[];group.summary={trials:group.summary.trials,initialDecision:group.summary.initialDecision};
  }
  phase='complete';postMessage({type:'complete',report:{format:'SL_WORLD_ENGINE_LAB',schemaVersion:1,version:SL_ENGINE.CONFIG.version,date:new Date().toISOString(),axis:data.axis,...(data.axisB?{axisB:data.axisB,comparisonMode:'matrix'}:{}),seedPrefix:data.seed,trialCount:data.count,elapsedMs:performance.now()-start,groups,storage:{mode:'aggregate-and-thin-trials',details:'regenerate from bundle and seed'},anomalies:data.axisB?[]:SL_LAB.sensitivity(groups,data.axis)}});
 }catch(e){postMessage({type:'error',phase,message:phase+': '+(e.stack||e.message)});}
};
