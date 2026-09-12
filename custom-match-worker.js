importScripts('engine006-fielding.js','engine006-tactics.js','engine006.js','custom-match-core.js');
let cancelled=false;
onmessage=async({data})=>{
 if(data.type==='cancel'){cancelled=true;return;}cancelled=false;let report;
 try{report=SL_CUSTOM_MATCH.create(data.settings);const size=report.requestedRunCount>=500?25:10;postMessage({type:'progress',completed:0,total:report.requestedRunCount});
  while(report.runCount<report.requestedRunCount&&!cancelled){for(let n=0;n<size&&report.runCount<report.requestedRunCount;n++)SL_CUSTOM_MATCH.step(report);postMessage({type:'progress',completed:report.runCount,total:report.requestedRunCount});await new Promise(r=>setTimeout(r,0));}
  report.status=cancelled?'cancelled':'complete';postMessage({type:'complete',report});
 }catch(e){postMessage({type:'error',message:e.stack||e.message,report});}
};
