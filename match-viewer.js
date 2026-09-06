/* SL WORLD 2D MATCH VIEWER alpha0.1. Presentation only; never consumes engine RNG. */
(() => {
 "use strict";
 const copy=value=>JSON.parse(JSON.stringify(value));
 const names={ball:'ボール',calledStrike:'見逃しストライク',swingingStrike:'空振り',foul:'ファウル',strikeout:'三振',walk:'四球',single:'単打',double:'二塁打',triple:'三塁打',homeRun:'本塁打',groundout:'ゴロアウト',flyout:'フライアウト',lineout:'ライナーアウト'};
 const bases=[[400,430],[540,315],[400,225],[260,315],[400,430]];
 const positions=[[400,332],[400,462],[553,302],[473,253],[249,302],[325,250],[200,155],[400,104],[600,155]];
 function toReplayEvent(event){
  const e=copy(event),destinations={groundout:[300,290],flyout:[585,163],lineout:[322,248],single:[520,205],double:[170,113],triple:[625,107],homeRun:[565,27],foul:[670,425]};
  return {...e,outsBefore:e.outs,pitchResult:e.outcome,battingResult:e.battedResult,
   contactType:e.battedResult||e.outcome,fieldDirection:e.fieldDirection??null,
   presentation:{directionSource:'illustrative-only',target:destinations[e.result]||[400,448]},
   runsScored:e.scoreAfter.reduce((n,v,i)=>n+v-e.scoreBefore[i],0)};
 }
 // Extend this list when new engine events (steals, abilities, fielding plays) exist.
 const HIGHLIGHT_RULES=[
  {reason:'得点',weight:6,test:e=>e.scoreAfter.some((n,i)=>n>e.scoreBefore[i])},
  {reason:'本塁打',weight:7,test:e=>e.result==='homeRun'},
  {reason:'長打',weight:4,test:e=>['double','triple'].includes(e.result)},
  {reason:'得点圏',weight:3,test:e=>!!(e.runnersBefore[1]||e.runnersBefore[2])},
  {reason:'満塁',weight:4,test:e=>e.runnersBefore.every(Boolean)},
  {reason:'終盤の接戦',weight:4,test:e=>e.inning>=7&&Math.abs(e.scoreBefore[0]-e.scoreBefore[1])<=2},
  {reason:'三振でピンチ脱出',weight:6,test:e=>e.result==='strikeout'&&e.outsAfter===3&&e.runnersBefore.some(Boolean)},
  {reason:'同点・逆転・勝ち越し',weight:6,test:e=>{const a=e.scoreBefore[0]-e.scoreBefore[1],b=e.scoreAfter[0]-e.scoreAfter[1];return a!==b&&(a===0||b===0||Math.sign(a)!==Math.sign(b))}}
 ];
 function highlightImportance(e){const rules=HIGHLIGHT_RULES.filter(r=>r.test(e));return {score:rules.reduce((n,r)=>n+r.weight,0),reasons:rules.map(r=>r.reason)}}
 function create({root,getGame,step,onChange}){
  root.innerHTML=`<div class="toolbar"><button data-action="log">LOG VIEW</button><button data-action="view" aria-pressed="false">2D VIEW</button></div>
   <div data-panel hidden><h2>SL WORLD / 2D MATCH VIEWER α0.1</h2><p data-score></p>
   <canvas width="800" height="500" role="img" aria-label="簡易球場。プレー内容は下のテキストでも表示します"></canvas>
   <p data-detail></p><p data-result role="status" aria-live="polite">待機中</p>
   <div class="toolbar"><button data-action="advance">1球進める</button><button data-action="auto">自動再生</button><button data-action="pause">一時停止</button><label>再生速度<select data-speed><option value="1">NORMAL</option><option value="2">FAST</option></select></label></div>
   <p class="note">結果は既存エンジンで確定済み。打球方向・守備配置は仮の映像表現です。通常の試合操作で進めた分は現在状態へ同期します。</p></div>`;
  const el=s=>root.querySelector(s),panel=el('[data-panel]'),canvas=el('canvas'),ctx=canvas.getContext('2d');
  let selectedMode='FULL';
  const modeNames={FULL:'フル観戦',MINI:'ミニ観戦',HIGHLIGHT:'ハイライト',SKIP:'スキップ'};
  const palette=['#459de7','#d75c65']; // Team slot colours only, unrelated to strength.
  let active=false,busy=false,paused=false,mode=null,frameId=0,last=0,elapsed=0,event=null;
  const mix=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.max(0,Math.min(1,t));
  function person(x,y,color,tag,pose=0){
   ctx.save();ctx.translate(x,y);ctx.strokeStyle='#091525';ctx.lineWidth=3;
   ctx.beginPath();ctx.moveTo(-4,1);ctx.lineTo(-5,10);ctx.moveTo(4,1);ctx.lineTo(6,10);ctx.stroke();
   ctx.fillStyle=color;ctx.fillRect(-7,-16,14,18);ctx.fillStyle='#edd1aa';ctx.beginPath();ctx.arc(0,-22,6,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=color;ctx.fillRect(-7,-29,14,5);ctx.fillRect(-2,-26,12,3);
   ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-6,-13);ctx.lineTo(-12,-4-pose*20);ctx.moveTo(6,-13);ctx.lineTo(12,-5-pose*20);ctx.stroke();
   if(tag){ctx.fillStyle='#fff';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(tag,0,24)}ctx.restore();
  }
  function path(points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}}
  function field(){ctx.fillStyle='#071a27';ctx.fillRect(0,0,800,500);path([[400,445],[65,178],[120,93],[250,48],[400,35],[550,48],[680,93],[735,178]],'#174a3c','#6d897b');path([bases[0],bases[1],bases[2],bases[3]],'#8a7051');path([[400,405],[506,315],[400,249],[294,315]],'#225d45');ctx.beginPath();ctx.moveTo(80,174);ctx.lineTo(...bases[0]);ctx.lineTo(720,174);ctx.strokeStyle='#b2beb0';ctx.lineWidth=2;ctx.stroke();
   ctx.fillStyle='#ae9676';ctx.beginPath();ctx.ellipse(400,332,19,10,0,0,7);ctx.fill();bases.slice(0,4).forEach(([x,y])=>path([[x,y-5],[x+6,y],[x,y+5],[x-6,y]],'#eee9cf'));}
  function runnerPositions(e,t){
   const result=[];const ended=e.plateAppearanceEnded;const people=e.runnersBefore.map((p,i)=>p?{p,start:i+1}:null).filter(Boolean);
   if(t>0&&['single','double','triple','homeRun','walk'].includes(e.result))people.push({p:e.batter,start:0});
   for(const {p,start} of people){const i=e.runnersAfter.findIndex(q=>q&&q.key===p.key);const finish=i>=0?i+1:ended?4:start;
    const progress=start+(finish-start)*t,base=Math.min(3,Math.floor(progress)),f=progress>=4?1:progress-base;
    result.push([mix(bases[base][0],bases[base+1][0],f),mix(bases[base][1],bases[base+1][1],f)]);
   }return result;
  }
  function duration(e){return 380+ Math.max(260,640-(e.pitchSpeed-80)*4)+220;}
  function paint(e,time=0,settled=false){
   field();const g=getGame(),side=(e?(settled?e.nextState.half:e.half):g.state.half)==='top'?0:1,pitchEnd=e?duration(e):1100;
   const hit=e&&(e.outcome==='inPlay'||e.outcome==='foul'),travel=clamp((time-pitchEnd)/950),run=clamp((time-pitchEnd-250)/1150),target=e?.presentation.target;
   let nearest=-1;if(hit){let dist=Infinity;positions.slice(2).forEach(([x,y],i)=>{const d=(x-target[0])**2+(y-target[1])**2;if(d<dist){dist=d;nearest=i+2}})}
   positions.forEach(([x,y],i)=>{let t=hit&&!settled&&i===nearest?travel:0;if(e&&['single','double','triple','homeRun'].includes(e.result))t*=.66;
    person(mix(x,target?.[0]??x,t),mix(y,target?.[1]??y,t),palette[1-side],['投','捕','一','二','三','遊','左','中','右'][i],i===0&&time<380?Math.sin(time/380*Math.PI):0)});
   if(!e||settled){(e?e.nextState.runners:g.state.bases).forEach((p,i)=>{if(p)person(bases[i+1][0]+12,bases[i+1][1],palette[e?(e.nextState.half==='top'?0:1):side],'走')})}
   else runnerPositions(e,run).forEach(([x,y])=>person(x+10,y,palette[side],'走'));
   const swing=e&&['swingingStrike','foul','inPlay'].includes(e.outcome)&&time>pitchEnd-220&&time<pitchEnd+200;
   person(378,427,palette[side],'打',swing?.7:0);ctx.strokeStyle='#caa471';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(367,415);ctx.lineTo(swing?415:355,swing?417:390);ctx.stroke();
   if(e&&!settled){let x=400,y=332;const flight=clamp((time-380)/(pitchEnd-380-220));y=mix(332,448,flight);
    if(hit&&time>pitchEnd){x=mix(400,target[0],travel);y=mix(430,target[1],travel);if(!['groundout','lineout'].includes(e.result))y-=Math.sin(travel*Math.PI)*65;}
    ctx.fillStyle='#fff8da';ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();}
  }
  function scoreboard(e,after=false){const g=getGame(),s=e?(after?e.nextState:{inning:e.inning,half:e.half,outs:e.outs,balls:e.balls,strikes:e.strikes,score:e.scoreBefore,runners:e.runnersBefore}):{...g.state,runners:g.state.bases};
   el('[data-score]').textContent=`${g.teams[0].name} ${s.score[0]} − ${s.score[1]} ${g.teams[1].name} ｜ ${s.finished?'試合終了':`${s.inning}回${s.half==='top'?'表':'裏'}`} ｜ ${s.outs}アウト ${s.balls}ボール ${s.strikes}ストライク ｜ 走者：${s.runners.map((p,i)=>p?`${i+1}塁 ${p.name}`:null).filter(Boolean).join(' / ')||'なし'}`;}
  function controls(){
   root.querySelectorAll('[data-action="advance"],[data-action="auto"]').forEach(b=>b.disabled=busy||getGame().state.finished||selectedMode==='SKIP');
   el('[data-action="advance"]').textContent=selectedMode==='FULL'?'1球進める':selectedMode==='MINI'?'1打席進める':'ハイライト開始';
   el('[data-action="pause"]').disabled=!busy;el('[data-action="pause"]').textContent=paused?'再開':'一時停止';
   ['pitch','atbat','inning','game'].forEach(id=>document.getElementById(id).disabled=busy||getGame().state.finished);
   document.querySelectorAll('[data-watch-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.watchMode===selectedMode)));
  }
  function stop(){cancelAnimationFrame(frameId);busy=false;paused=false;mode=null;event=null;controls();}
  function sync(){if(!busy&&getGame()){scoreboard(null);paint(null);controls();el('[data-detail]').textContent=modeNames[selectedMode]+' ／ '+(getGame().state.finished?'試合終了':'次のプレーを待っています');el('[data-result]').textContent=getGame().state.finished?'最終結果':'待機中';}}
  function next(){
   if(getGame().state.finished){stop();sync();return}
   try{
    event=null;
    // Bounded batches keep pause/mode switching responsive during omitted plays.
    for(let n=0;n<12&&!getGame().state.finished;n++){
     const events=step(selectedMode==='FULL'?'pitch':'atbat');
     const candidate=events.at(-1);
     if(!candidate)break;
     const importance=highlightImportance(candidate);
     if(selectedMode!=='HIGHLIGHT'||importance.score>=3){event=toReplayEvent(candidate);event.highlightImportance=importance;break;}
    }
    onChange();controls();elapsed=0;last=0;
    if(event){scoreboard(event);el('[data-detail]').textContent=`${modeNames[selectedMode]} ／ 投手：${event.pitcher.name} ／ 打者：${event.batter.name} ／ ${event.pitchType} ${event.pitchSpeed}km/h`;
     el('[data-result]').textContent=selectedMode==='HIGHLIGHT'?event.highlightImportance.reasons.join('・'):'投球中';
    }else{el('[data-result]').textContent='重要場面を検索中';}
    frameId=requestAnimationFrame(tick);
   }catch(error){stop();el('[data-result]').textContent=`再生停止：${error.message}`;onChange();}
  }
  function tick(now){
   if(!busy)return;
   if(last&&!paused)elapsed+=(now-last)*Number(el('[data-speed]').value)*(selectedMode==='FULL'?1:1.5);
   last=now;if(paused){frameId=requestAnimationFrame(tick);return}
   if(!event){next();return}
   const end=duration(event)+(event.outcome==='inPlay'||event.result==='walk'?1700:650);
   paint(event,elapsed);if(elapsed>duration(event)+350)el('[data-result]').textContent=(names[event.result]||event.result)+(event.runsScored?` ／ ${event.runsScored}得点`:'');
   if(elapsed>=end){paint(event,elapsed,true);scoreboard(event,true);const proceed=mode==='auto'||selectedMode==='HIGHLIGHT';
    if(proceed&&!getGame().state.finished){next();return}busy=false;paused=false;mode=null;controls();return}
   frameId=requestAnimationFrame(tick);
  }
  function showView(value){active=value;panel.hidden=!active;el('[data-action="view"]').setAttribute('aria-pressed',String(active));document.getElementById('log').closest('section').hidden=active;}
  document.querySelectorAll('[data-watch-mode]').forEach(button=>button.addEventListener('click',()=>{
   stop();selectedMode=button.dataset.watchMode;showView(selectedMode!=='SKIP');sync();
   if(selectedMode==='SKIP'){
    try{step('game');}catch(error){document.getElementById('status').textContent=error.message}onChange();sync();
   }else if(selectedMode==='HIGHLIGHT'&&!getGame().state.finished){busy=true;mode='auto';next();}
  }));
  root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
   if(action==='log'||action==='view'){stop();showView(action==='view');sync();return}
   if(action==='pause'){paused=!paused;controls();return}
   if(busy||getGame().state.finished||selectedMode==='SKIP')return;busy=true;mode=action;next();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy){paused=true;controls()}});
  return {sync,reset(){stop();sync()},get replayEvent(){return event?copy(event):null}};
 }
 globalThis.SL_MATCH_VIEWER={toReplayEvent,highlightImportance,HIGHLIGHT_RULES,create};
})();
