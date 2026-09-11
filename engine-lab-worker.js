importScripts('engine006-fielding.js','engine006-tactics.js','engine006.js','engine-lab-core.js');
onmessage=({data})=>{
 let phase='setup';
 try{
  const size=SL_LAB.executionSize(data.axis,data.axisB,data.count,data.scenario),start=performance.now(),groups=SL_LAB.compare(data.scenario,data.axis,data.axisB);let completed=0;
  for(let gi=0;gi<groups.length;gi++){
   const group=groups[gi];group.trials=[];phase='simulate';
   for(let i=0;i<data.count;i++){
    const trial=SL_LAB.trial(group.bundle,data.seed+':'+i);SL_LAB.compactTrial(trial);group.trials.push(trial);completed++;
    if(completed%100===0)postMessage({type:'progress',phase,completed,total:size.totalTrials,elapsedMs:performance.now()-start});
   }
   phase='aggregate';postMessage({type:'phase',phase,groupIndex:gi});group.summary=SL_LAB.summarize(group.trials);
   phase='handoff';postMessage({type:'group',groupIndex:gi,group});group.trials=[];
  }
  phase='complete';postMessage({type:'complete',report:{format:'SL_WORLD_ENGINE_LAB',schemaVersion:1,version:SL_ENGINE.CONFIG.version,date:new Date().toISOString(),axis:data.axis,...(data.axisB?{axisB:data.axisB,comparisonMode:'matrix'}:{}),seedPrefix:data.seed,trialCount:data.count,elapsedMs:performance.now()-start,groups,storage:{mode:'compact-trials',details:'regenerate from bundle and seed'},anomalies:data.axisB?[]:SL_LAB.sensitivity(groups,data.axis)}});
 }catch(e){postMessage({type:'error',phase,message:phase+': '+(e.stack||e.message)});}
};
