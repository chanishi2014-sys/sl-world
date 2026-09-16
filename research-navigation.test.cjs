const fs=require('fs'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(f,'utf8'),has=(f,s)=>assert(read(f).includes(s),`${f}: missing ${s}`);
has('index.html','href="./research.html"');has('index.html','研究所');console.log('PASS main menu -> research institute');
for(const [name,target,label] of [['A','engine-lab.html','LABでテストする'],['B','responsibility-lab.html','守備を詳しく調べる'],['C','custom-match.html','CUSTOMで試合を研究する'],['D','engine006.html#decisionTracePanel','実戦のプレーを解析する'],['DATA','engine-lab.html#historySection','研究データを見る']]){has('research.html',`href="${target}"`);has('research.html',label);console.log('PASS TEST-'+name,target);}
for(const file of ['engine-lab.html','responsibility-lab.html','custom-match.html','engine006.html']){has(file,'href="research.html"');has(file,'研究所へ戻る');console.log('PASS TEST-E',file);}
has('research.html','href="index.html#home"');has('research.html','メインメニューへ戻る');console.log('PASS TEST-F');
has('research.css','@media(max-width:650px)');has('research.css','grid-template-columns:1fr');has('research.css','min-height:44px');console.log('PASS TEST-G iPhone vertical rules');
has('service-worker.js',"const VERSION = 'v29'");for(const f of ['research.html','research.css','responsibility-lab.html'])has('service-worker.js',`'${f}'`);console.log('PASS PWA v29 assets');
const forbidden=['engine006.js','engine006-fielding.js','engine006-tactics.js','engine-fielding.js','engine-tactics.js'];const changed=require('child_process').execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/);assert(!forbidden.some(f=>changed.includes(f)),'game logic file changed');console.log('PASS game logic untouched');
