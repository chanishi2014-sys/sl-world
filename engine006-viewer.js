/* SL WORLD 2D MATCH VIEWER alpha0.2. Presentation only; never consumes engine RNG. */
(() => {
 "use strict";
 const copy=value=>JSON.parse(JSON.stringify(value));
 const {names,toReplayEvent,animationPlan,ballAnimation,runnerAnimation,batterVisible,fieldingAnimation,transition,resultLabel,decisionDebug,bannerLabel,safeText}=SL_MATCH_REPLAY;
 const {bases,positions}=SL_FIELDING.layout;
 const clamp01=n=>Math.max(0,Math.min(1,n)),lerp=(a,b,t)=>a+(b-a)*t;
 const point=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
 // Extend this list when new engine events (steals, abilities, fielding plays) exist.
 const HIGHLIGHT_RULES=[
  {reason:'送りバント',weight:4,test:e=>e.buntAttempt},
  {reason:'守備・走塁',weight:4,test:e=>e.error||e.doublePlay||e.tagUp||e.stolenBase||e.caughtStealing},
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
 // Read-only scoreboard projection. Engine events supply every run and count.
 function scoreboardSnapshot(g,event=null,after=false){
  const state=event?(after?event.nextState:{inning:event.inning,half:event.half,outs:event.outs,balls:event.balls,strikes:event.strikes,score:event.scoreBefore,hits:event.hitsBefore,errors:event.errorsBefore,runners:event.runnersBefore,finished:false}):{...g.state,runners:g.state.bases};
  const innings=Math.max(9,g.config.innings,state.inning,...g.state.lines.map(row=>row.length));
  let lines;
  if(!event)lines=g.state.lines.map(row=>Array.from({length:innings},(_,i)=>row[i]??null));
  else{
   lines=Array.from({length:2},()=>Array(innings).fill(null));
   const stop=event.sequence-(after?0:1);
   for(const recorded of g.state.events){
    if(recorded.sequence>stop)break;
    const side=recorded.half==='top'?0:1,index=recorded.inning-1;
    lines[side][index]=(lines[side][index]??0)+(recorded.scoreAfter[side]-recorded.scoreBefore[side]);
   }
   if(!state.finished)lines[state.half==='top'?0:1][state.inning-1]??=0;
  }
  const {inning,half,outs,balls,strikes,score,runners,finished,finishReason}=state;
  const hits=state.hits||[0,0],errors=state.errors||[0,0];
  return {...copy({inning,half,outs,balls,strikes,score,runners,finished,finishReason,hits,errors}),lines,innings,teams:g.teams.map(t=>({name:t.name,shortName:t.shortName||t.displayName||t.name}))};
 }
 function mountScoreboard(root){
  root.innerHTML=`<div class="sb-brand"><span>SL WORLD</span><span>LIVE SCOREBOARD</span></div><div class="sb-table-wrap"><table class="sb-table" aria-label="イニング別スコア"><colgroup></colgroup><thead></thead><tbody></tbody></table></div>
   <div class="sb-status"><div class="sb-counts" aria-label="ストライク・ボール・アウト"></div><div class="sb-phase"><strong></strong><span></span></div><div class="sb-runners"><span class="sb-base-map" aria-hidden="true"><i data-base="2"></i><i data-base="3"></i><i data-base="1"></i></span><span class="sb-runner-text"></span></div></div><p class="sb-note">未実施は — ／ 点灯中の回は進行中（得点は暫定）</p>`;
  const table=root.querySelector('table'),body=table.tBodies[0],head=table.tHead,cols=table.querySelector('colgroup');
  let columnCount=0;
  const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node};
  const lamps=[['S','ストライク',2,'strikes'],['B','ボール',3,'balls'],['O','アウト',2,'outs']].map(([letter,label,max,key])=>{
   const row=make('div',undefined,'sb-lamp-row sb-'+letter.toLowerCase());row.append(make('b',letter));
   const lights=Array.from({length:max},()=>{const lamp=make('span',undefined,'sb-lamp');lamp.setAttribute('aria-hidden','true');row.append(lamp);return lamp});
   root.querySelector('.sb-counts').append(row);return {row,lights,label,key};
  });
  function update(s){
   if(columnCount!==s.innings){columnCount=s.innings;cols.replaceChildren();head.replaceChildren();body.replaceChildren();
    const nameCol=make('col');nameCol.className='sb-name-col';cols.append(nameCol);
    for(let i=0;i<s.innings;i++)cols.append(make('col'));const totalCol=make('col');totalCol.className='sb-total-col';cols.append(totalCol);cols.append(make('col'));cols.append(make('col'));
    const headings=make('tr');for(const title of ['チーム',...Array.from({length:s.innings},(_,i)=>i+1),'R','H','E']){const th=make('th',title);th.scope='col';headings.append(th)}head.append(headings);
    for(let side=0;side<2;side++){const row=make('tr'),name=make('th');name.scope='row';row.append(name);for(let i=0;i<s.innings+3;i++)row.append(make('td'));body.append(row)}
   }
   const activeSide=s.half==='top'?0:1;
   [...head.rows[0].cells].forEach((cell,i)=>cell.classList.toggle('sb-current-col',!s.finished&&i===s.inning));
   s.teams.forEach((team,side)=>{
    const row=body.rows[side],full=team.name,short=String(team.shortName);
    row.cells[0].textContent=Array.from(short).length>9?Array.from(short).slice(0,8).join('')+'…':short;
    row.cells[0].title=full;row.cells[0].setAttribute('aria-label',full);row.classList.toggle('sb-batting',!s.finished&&side===activeSide);
    for(let i=0;i<s.innings;i++){
     const cell=row.cells[i+1],value=s.lines[side][i],current=!s.finished&&side===activeSide&&i===s.inning-1;
     const omitted=s.finished&&s.finishReason==='homeLeadAfterTop9'&&side===1&&i===s.inning-1&&value===null;
     cell.textContent=omitted?'X':value===null||current&&value===0?'—':String(value);
     cell.dataset.runs=String(value??0);cell.classList.toggle('sb-current-col',!s.finished&&i===s.inning-1);cell.classList.toggle('sb-active-cell',current);
     cell.setAttribute('aria-label',`${i+1}回${side===0?'表':'裏'}：${omitted?'実施不要':value===null?'未実施':`${value}点${current?'、進行中':''}`}`);
    }
    row.cells[s.innings+2].textContent=String(s.hits[side]);row.cells[s.innings+3].textContent=String(s.errors[side]);
    const total=row.cells[s.innings+1];total.className='sb-total';total.textContent=String(s.score[side]);total.setAttribute('aria-label',`合計${s.score[side]}点`);
   });
   const reasons={walkoff:'サヨナラ',draw:'引き分け',homeLeadAfterTop9:'最終回裏は実施不要',nineInnings:'試合終了'};
   root.querySelector('.sb-phase strong').textContent=s.finished?'試合終了':`${s.half==='top'?'▲':'▼'} ${s.inning}回${s.half==='top'?'表':'裏'}`;
   root.querySelector('.sb-phase span').textContent=s.finished?(reasons[s.finishReason]||'試合終了'):`${s.teams[activeSide].shortName}の攻撃`;
   lamps.forEach(({row,lights,label,key})=>{const raw=s[key];row.setAttribute('aria-label',s.finished?`${label}：試合終了（終了時${raw}）`:`${label} ${raw}`);row.dataset.count=String(raw);lights.forEach((light,i)=>light.classList.toggle('is-on',!s.finished&&i<raw))});
   s.runners.forEach((runner,i)=>root.querySelector(`[data-base="${i+1}"]`).classList.toggle('is-on',!!runner));
   const runners=s.runners.map((p,i)=>p?`${i+1}塁：${p.name}`:null).filter(Boolean);
   const occupied=s.runners.flatMap((runner,i)=>runner?[i+1]:[]);
   const runnerText=root.querySelector('.sb-runner-text');
   if(occupied.length===3)runnerText.textContent='満塁';
   else runnerText.replaceChildren(make('span','ランナー'),make('span',occupied.length?occupied.join('・')+'塁':'なし'));
   runnerText.title=runners.join(' ／ ');root.querySelector('.sb-runners').setAttribute('aria-label',runnerText.textContent+(runners.length?'：'+runners.join(' ／ '):''));
   root.classList.toggle('sb-extra-innings',s.innings>9);
  }
  return {update};
 }

 function create({root,getGame,step,onChange}){
  root.innerHTML=`<div class="toolbar"><button data-action="log">LOG VIEW</button><button data-action="view" aria-pressed="false">2D VIEW</button></div>
   <section class="stadium-board" aria-label="SL WORLD 電光スコアボード"></section>
   <div data-panel hidden><h2>SL WORLD / 2D MATCH VIEWER α0.2</h2>
   <canvas width="800" height="500" role="img" aria-label="簡易球場。プレー内容は下のテキストでも表示します"></canvas>
   <button data-action="debug" aria-pressed="false">DEBUG OFF</button><p data-debug hidden class="note" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;padding:6px 10px;background:#071422cc;border-radius:6px;min-height:2em" aria-label="再生デバッグ"></p>
   <p data-detail></p><p data-result role="status" aria-live="polite">待機中</p>
   <div class="toolbar"><button data-action="advance">1球進める</button><button data-action="auto">自動再生</button><button data-action="pause">一時停止</button><label>再生速度<select data-speed><option value="1">NORMAL</option><option value="2">FAST</option></select></label></div>
   <p class="note">結果は既存エンジンで確定済み。打球方向・走者経路はENGINEのeventを再生します。守備モーションは簡易表現です。通常の試合操作で進めた分は現在状態へ同期します。</p></div>`;
  const el=s=>root.querySelector(s),panel=el('[data-panel]'),canvas=el('canvas');let ctx=canvas.getContext('2d');
  const board=mountScoreboard(el('.stadium-board'));
  let scoreboardAfter=false,debugEnabled=false,lastPaint=null;
  let selectedMode='FULL';
  const modeNames={FULL:'フル観戦',MINI:'ミニ観戦',HIGHLIGHT:'ハイライト',SKIP:'スキップ'};
  const palette=['#459de7','#d75c65']; // Team slot colours only, unrelated to strength.
  let active=false,busy=false,paused=false,mode=null,frameId=0,last=0,elapsed=0,event=null;
  const mix=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.max(0,Math.min(1,t));
  function ellipse(x,y,rx,ry,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
  function limb(points,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()}
  function path(points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}}
  function person(x,y,color,tag,pose={}){
   const crouch=pose.role==='catcher'?9:pose.role==='batter'?3:pose.catch?8:2;
   const gait=pose.running?Math.sin(pose.time/75)*6:0,facing=pose.facing||1;
   ellipse(x,y+2,14,4,'#0005');ctx.save();ctx.translate(x,y+crouch);ctx.scale(facing,1);
   const lift=pose.lift||0,twist=pose.twist||0;
   // Stocky trousers, bent knees, socks and cleats instead of stick legs.
   limb([[-5,-12],[-7-gait/2,-6-lift*12],[-9-gait,-2-lift*13]],'#dce4e5',7);
   limb([[5,-12],[7+gait/2,-6],[9+gait,-2]],'#dce4e5',7);
   limb([[-9-gait,-2-lift*13],[-5-gait,-2-lift*13]],'#132536',5);limb([[9+gait,-2],[14+gait,-2]],'#132536',5);
   ctx.save();ctx.translate(twist*3,0);ctx.rotate(twist*.10);
   path([[-10,-28],[9,-28],[11,-13],[7,-10],[-8,-10],[-12,-16]],color,'#0b2536');
   limb([[0,-26],[0,-12]],'#ffffff65',1);limb([[-8,-11],[8,-11]],'#172638',3);
   ellipse(0,-37,10,10,'#edbd91');ellipse(-8,-36,2,3,'#d89e73');
   ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,-40,10,Math.PI,Math.PI*2);ctx.fill();ctx.fillRect(-10,-41,20,4);
   limb([[2,-38],[13,-37]],color,4);ellipse(4,-35,1.2,1.5,'#263245');
   ctx.fillStyle='#fff';ctx.font='bold 7px system-ui';ctx.textAlign='center';ctx.fillText('SL',0,-42);
   let hand=pose.hand||[13,-17],glove=pose.glove||[-12,-19];
   if(pose.role==='batter'){hand=pose.bunt?[12,-23]:[8,-23];glove=pose.bunt?[26,-24]:[4,-22]}
   if(pose.running){hand=[13,-18-gait];glove=[-13,-18+gait]}
   limb([[8,-26],[14,-23],hand],color,7);ellipse(...hand,3,3,'#edbd91');
   limb([[-8,-26],[-13,-23],glove],color,7);
   if(pose.role!=='batter'&&!pose.running){ellipse(...glove,6,7,'#9a6537');limb([[glove[0]-3,glove[1]-2],[glove[0]+3,glove[1]+3]],'#523c27',1)}
   else ellipse(...glove,3,3,'#edbd91');
   if(pose.role==='catcher'){
    path([[-6,-27],[6,-27],[7,-13],[-6,-13]],'#21364a');ctx.strokeStyle='#91a7b9';ctx.lineWidth=1;
    ctx.strokeRect(-7,-40,15,12);limb([[-7,-34],[8,-34]],'#91a7b9',1);
   }
   if(pose.role==='batter'){
    const angle=pose.batAngle??-1.9,batStart=[8,-23],batEnd=[8+Math.cos(angle)*31,-23+Math.sin(angle)*31];
    limb([batStart,batEnd],'#d9b777',4);limb([batStart,[8+Math.cos(angle)*7,-23+Math.sin(angle)*7]],'#38343a',3);
    if(pose.swing>0&&pose.swing<1){ctx.strokeStyle='#f7e9b450';ctx.lineWidth=3;ctx.beginPath();ctx.arc(8,-23,29,-1.9,angle);ctx.stroke()}
   }
   ctx.restore();ctx.restore();
   if(tag){ctx.fillStyle='#e0eef2';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(tag,x,y+18)}
  }
  let fieldCache;
  function drawField(){
   ctx.fillStyle='#071a27';ctx.fillRect(0,0,800,500);
   const fence=[[65,178],[120,93],[250,48],[400,35],[550,48],[680,93],[735,178]];
   path([[400,445],...fence],'#24634b');
   ctx.save();ctx.beginPath();ctx.moveTo(400,445);fence.forEach(p=>ctx.lineTo(...p));ctx.closePath();ctx.clip();
   for(let x=-400;x<1200;x+=78)path([[x,0],[x+38,0],[x+355,500],[x+317,500]],'#ffffff06');
   ctx.restore();
   path([...fence,...fence.slice().reverse().map(([x,y])=>[x,y-15])],'#183c4a','#65878c');
   for(let i=0;i<fence.length;i++){const [x,y]=fence[i];limb([[x,y],[x,y-15]],'#8faba34d',2)}
   ctx.fillStyle='#c7d2b4';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText('122m',400,31);ctx.fillText('99m',100,124);ctx.fillText('99m',700,124);
   ctx.fillStyle='#9c7d56';ctx.beginPath();ctx.moveTo(400,447);ctx.lineTo(238,325);ctx.quadraticCurveTo(230,255,400,205);ctx.quadraticCurveTo(570,255,562,325);ctx.closePath();ctx.fill();
   path([[400,409],[515,315],[400,246],[285,315]],'#2c7050');
   // Fixed procedural detail, cached once; no random generator is used.
   for(let i=0;i<100;i++){const x=270+(i*47)%260,y=320+(i*23)%95;if(Math.abs(x-400)>110-(y-320)*.8)ellipse(x,y,.7,.5,'#b5976d50')}
   limb([[80,174],bases[0],[720,174]],'#e2dfc3',2);
   ellipse(400,332,20,11,'#b2946c');path([[394,330],[406,330],[406,333],[394,333]],'#f1ecd8');
   bases.slice(1,4).forEach(([x,y])=>path([[x,y-5],[x+7,y],[x,y+5],[x-7,y]],'#fcf2d4','#b3a383'));
   path([[394,426],[406,426],[406,432],[400,438],[394,432]],'#fff4d7');
   ctx.strokeStyle='#d6cbae';ctx.lineWidth=1;ctx.strokeRect(374,419,14,20);ctx.strokeRect(413,419,14,20);
   ctx.fillStyle='#759598';ctx.font='bold 11px system-ui';ctx.fillText('SL WORLD  /  MATCH FIELD',400,491);
  }
  function field(){if(!fieldCache){fieldCache=document.createElement('canvas');fieldCache.width=800;fieldCache.height=500;const original=ctx;ctx=fieldCache.getContext('2d');drawField();ctx=original}ctx.drawImage(fieldCache,0,0)}
  function pitchAnimation(time,p){
   if(time<150)return {hand:[9,-24],glove:[-2,-23]};
   if(time<390)return {lift:Math.sin((time-150)/240*Math.PI/2),twist:-.7,hand:[10,-27],glove:[-2,-25]};
   if(time<p.release){const t=(time-390)/(p.release-390);return {lift:1-t,twist:lerp(-.7,1,t),hand:[lerp(10,18,t),lerp(-46,-14,t)],glove:[-15,-23]}}
   const t=clamp((time-p.release)/240);return {twist:1-t*.7,hand:[lerp(18,-5,t),lerp(-14,-9,t)],glove:[-14,-18]};
  }
  function battingAnimation(e,p,time){
   if(e?.bunt)return {role:'batter',bunt:true,batAngle:-.1,twist:.15,swing:0};
   const swings=['swingingStrike','inPlay','foul'].includes(e?.outcome);
   const progress=swings?clamp((time-p.pitchEnd+190)/420):0;
   return {role:'batter',batAngle:lerp(-1.9,e?.outcome==='swingingStrike'?2.1:1.6,progress),swing:progress,twist:progress*.9,lift:progress>0&&progress<.4?.2:0};
  }
  function drawBall(ball){
   if(!ball.visible)return;const [x,y]=ball.ground;
   ellipse(x,y+2,Math.max(2,5-ball.height/40),2,'#0006');
   const by=y-ball.height;
   if(['pitch','line','throw'].includes(ball.phase))limb([[x-5,by-3],[x,by]],'#fff7cb50',3);
   ellipse(x,by,3.6,3.6,'#fff8d9');limb([[x-1,by-2],[x+1,by+1]],'#b95e50',.7);
  }
  function resultBanner(e,p,time){
   if(time<p.resultAt)return;
   const good=['single','double','triple','homeRun','walk'].includes(e.result),color=e.result==='homeRun'?'#f5ca6b':good?'#7edcd1':'#9ec8f5';
   const label=bannerLabel(e);
   ctx.fillStyle='#071422ee';ctx.fillRect(238,62,324,67);ctx.fillStyle=color;ctx.fillRect(238,62,4,67);
   ctx.textAlign='center';ctx.font='900 28px system-ui';ctx.fillText(label,400,94);ctx.font='13px system-ui';ctx.fillText(resultLabel(e)+(e.runsScored?`  +${e.runsScored}得点`:''),400,116);
  }
  function paint(e,time=0,settled=false){
   lastPaint={e,time,settled};
   const g=getGame(),p=e?animationPlan(e):null,change=e&&!settled?transition(e,p,time):null;
   const oldSide=(e?e.half:g.state.half)==='top'?0:1,side=settled&&e?(e.nextState.half==='top'?0:1):change?.entering?1-oldSide:oldSide;
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const follow=p&&!settled&&!reduced&&['homeRun','double','triple'].includes(e.result)?Math.sin(clamp((time-p.pitchEnd)/(p.resultAt-p.pitchEnd))*Math.PI):0;
   ctx.fillStyle='#071a27';ctx.fillRect(0,0,800,500);ctx.save();ctx.translate(400,250+follow*9);ctx.scale(1+follow*.025,1+follow*.025);ctx.translate(-400,-250);field();
   positions.forEach((origin,i)=>{
    let motion=e&&!settled?fieldingAnimation(e,p,time,i):{position:origin,pose:{}};
    if(change){const bench=[change.entering?(oldSide===0?60:740):(oldSide===0?740:60),425];const previous=fieldingAnimation(e,p,p.returnAt,i).position;motion={position:change.entering?point(bench,origin,change.progress):point(previous,bench,change.progress),pose:{running:true,time}};}
    else {
     if(i===0&&e&&!settled&&time<=p.pitchEnd)motion.pose={...motion.pose,...pitchAnimation(time,p)};
     if(i===1)motion.pose={...motion.pose,role:'catcher'};
    }
    person(...motion.position,palette[1-side],['投','捕','一','二','三','遊','左','中','右'][i],motion.pose);
   });
   if(!change){
    if(!e||settled){(e?e.nextState.runners:g.state.bases).forEach((who,i)=>{if(who)person(bases[i+1][0]+9,bases[i+1][1],palette[side],'走',{role:'runner'})});}
    else runnerAnimation(e,p,time).forEach(r=>{if(r.visible)person(r.position[0]+9,r.position[1],palette[side],'走',{running:r.running,time,facing:r.finish>r.start&&r.position[0]>400?1:-1})});
    const showBatter=(!e||settled)?!(e?e.nextState.finished:g.state.finished):batterVisible(e,p,time);
    if(showBatter)person(377,438,palette[side],'打',e&&!settled?battingAnimation(e,p,time):{role:'batter'});
    if(e&&!settled)drawBall(ballAnimation(e,p,time));
   }
   ctx.restore();
   const phase=e&&!settled?ballAnimation(e,p,time).phase:'';
   const captions={windup:'構え → リリース',pitch:'投球',catcher:'捕手が捕球',ground:'ゴロ',line:'ライナー',fly:'フライ',homer:'フェンスへ伸びる打球',foul:'ファウル',fieldCatch:'捕球',homerExit:'本塁打',foulDone:'ファウル',rolling:'バウンド → 減速 → 打球処理',carry:'捕球した野手がベースへ',baseTouch:'捕球 → ベースを踏む',throw:'送球 → ベースカバー',received:'カバー野手が捕球',tag:'捕球 → 走者へタッチ'};
   el('[data-debug]').textContent=debugEnabled?(change?(change.entering?'攻守交代：次の守備が定位置へ':'攻守交代：ベンチへ戻る'):[safeText(e?.playDescription,''),captions[phase]||'待機中'].filter(Boolean).join(' ／ ')):'';
   if(debugEnabled&&e?.tactics)el('[data-debug]').textContent+='\n\n'+decisionDebug(e);
   if(e&&!settled&&!change)resultBanner(e,p,time);
  }
  function scoreboard(e,after=false){board.update(scoreboardSnapshot(getGame(),e,after));}
  function controls(){
   root.querySelectorAll('[data-action="advance"],[data-action="auto"]').forEach(b=>b.disabled=busy||getGame().state.finished||selectedMode==='SKIP');
   el('[data-action="advance"]').textContent=selectedMode==='FULL'?'1球進める':selectedMode==='MINI'?'1打席進める':'ハイライト開始';
   el('[data-action="pause"]').disabled=!busy;el('[data-action="pause"]').textContent=paused?'再開':'一時停止';
   ['pitch','atbat','inning','game'].forEach(id=>{const button=document.getElementById(id);if(button)button.disabled=busy||getGame().state.finished;});
   document.querySelectorAll('[data-watch-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.watchMode===selectedMode)));
  }
  function stop(){cancelAnimationFrame(frameId);busy=false;paused=false;mode=null;event=null;elapsed=0;last=0;scoreboardAfter=false;lastPaint=null;el('[data-debug]').textContent='';controls();}
  function sync(){if(!busy&&getGame()){scoreboard(null);paint(null);controls();el('[data-detail]').textContent=modeNames[selectedMode]+' ／ '+(getGame().state.finished?'試合終了':'次のプレーを待っています');el('[data-result]').textContent=getGame().state.finished?'最終結果':'待機中';}}
  function next(){
   if(getGame().state.finished){stop();sync();return}
   try{
    event=null;scoreboardAfter=false;
    // Bounded batches keep pause/mode switching responsive during omitted plays.
    for(let n=0;n<12&&!getGame().state.finished;n++){
     const events=step('pitch');
     const candidate=events.at(-1);
     if(!candidate)break;
     if(selectedMode!=='FULL'&&!candidate.plateAppearanceEnded&&candidate.eventType!=='baserunning')continue;
     const importance=highlightImportance(candidate);
     if(selectedMode!=='HIGHLIGHT'||importance.score>=3){event=toReplayEvent(candidate);event.highlightImportance=importance;break;}
    }
    onChange();controls();elapsed=0;last=0;
    if(event){scoreboard(event);el('[data-detail]').textContent=`${modeNames[selectedMode]} ／ 投手：${safeText(event.pitcher?.name,"投手")} ／ 打者：${safeText(event.batter?.name,"打者")} ／ ${safeText(event.pitchType,"投球")}${Number.isFinite(event.pitchSpeed)?` ${event.pitchSpeed}km/h`:""}`;
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
   const plan=animationPlan(event),end=plan.end;
   paint(event,elapsed);if(elapsed>=plan.resultAt)el('[data-result]').textContent=resultLabel(event)+(event.runsScored?` ／ ${event.runsScored}得点`:'');
   if(elapsed>=plan.resultAt&&!scoreboardAfter){scoreboard(event,true);scoreboardAfter=true;}
   if(elapsed>=end){paint(event,elapsed,true);scoreboard(event,true);const proceed=mode==='auto'||selectedMode==='HIGHLIGHT';
    if(proceed&&!getGame().state.finished){next();return}busy=false;paused=false;mode=null;controls();return}
   frameId=requestAnimationFrame(tick);
  }
  function showView(value){active=value;panel.hidden=!active;el('[data-action="view"]').setAttribute('aria-pressed',String(active));const log=document.getElementById('log');if(log)log.closest('section').hidden=active;}
  document.querySelectorAll('[data-watch-mode]').forEach(button=>button.addEventListener('click',()=>{
   stop();selectedMode=button.dataset.watchMode;showView(selectedMode!=='SKIP');sync();
   if(selectedMode==='SKIP'){
    try{step('game');}catch(error){document.getElementById('status').textContent=error.message}onChange();sync();
   }else if(selectedMode==='HIGHLIGHT'&&!getGame().state.finished){busy=true;mode='auto';next();}
  }));
  root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
   if(action==='debug'){debugEnabled=!debugEnabled;el('[data-debug]').hidden=!debugEnabled;el('[data-action="debug"]').textContent=debugEnabled?'DEBUG ON':'DEBUG OFF';el('[data-action="debug"]').setAttribute('aria-pressed',String(debugEnabled));if(lastPaint)paint(lastPaint.e,lastPaint.time,lastPaint.settled);return;}
   if(action==='log'||action==='view'){stop();showView(action==='view');sync();return}
   if(action==='pause'){paused=!paused;controls();return}
   if(busy||getGame().state.finished||selectedMode==='SKIP')return;busy=true;mode=action;next();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy){paused=true;controls()}});
  return {sync,renderEvent(record,time){paint(toReplayEvent(record),time)},reset(){stop();sync()},get replayEvent(){return event?copy(event):null}};
 }
 globalThis.SL_MATCH_VIEWER={scoreboardSnapshot,mountScoreboard,toReplayEvent,animationPlan,ballAnimation,runnerAnimation,fieldingAnimation,batterVisible,transition,resultLabel,bannerLabel,highlightImportance,HIGHLIGHT_RULES,create};
})();

