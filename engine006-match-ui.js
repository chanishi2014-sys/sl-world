if(typeof document!=="undefined"){
 const $=id=>document.getElementById(id);let game,viewer,appearanceTeams=[];
 $("engineVersion").textContent=`ENGINE VERSION: ${CONFIG.version}`;
 const labels={ball:"ボール",calledStrike:"見逃しストライク",swingingStrike:"空振り",foul:"ファウル",strikeout:"三振",walk:"四球",single:"単打",double:"二塁打",triple:"三塁打",homeRun:"本塁打",groundout:"ゴロアウト",flyout:"フライアウト",lineout:"ライナーアウト"};
 function table(target,headers,rows){target.replaceChildren();for(const [i,row]of [headers,...rows].entries()){const tr=document.createElement("tr");for(const item of row){const cell=document.createElement(i===0?"th":"td");cell.textContent=String(item);tr.appendChild(cell);}target.appendChild(tr);}}
 function statList(entries,kind=""){const list=document.createElement("dl");list.className="stat-list "+kind;entries.forEach(([label,value])=>{const item=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=String(value);item.append(dt,dd);list.appendChild(item);});return list;}
 function playerStats(parent,name,entries,kind=""){const card=document.createElement("article"),h=document.createElement("h5");card.className="player-stat";h.textContent=name;card.append(h,statList(entries,kind));parent.appendChild(card);}
 // Retain everyone seen in this game's lineup, pitching slot or events; no nine-player cap.
 // Future substitution code can also supply team.appearances for fielding-only appearances between renders.
 function renderAppearanceOverview(){
  game.teams.forEach((t,i)=>{for(const p of [...t.lineup,t.pitcher,...(t.appearances||[])]){if(p)appearanceTeams[i].set(p.key,p);}});
  for(const e of game.state.events){const side=e.half==="top"?0:1;
   for(const p of [e.batter,...e.runnersBefore,...e.runnersAfter]){if(p)appearanceTeams[side].set(p.key,p);}
   if(e.pitcher)appearanceTeams[1-side].set(e.pitcher.key,e.pitcher);
  }
  $("appearanceOverview").replaceChildren();
  game.teams.forEach((t,i)=>{
   const section=document.createElement("section"),heading=document.createElement("h2"),overview=document.createElement("table");
   section.className="card";heading.className="appearance-heading";heading.id="appearance-heading-"+i;heading.textContent=t.name+" 出場選手成績一覧";
   overview.className="appearance-table";overview.setAttribute("aria-labelledby",heading.id);
   const head=document.createElement("thead"),hr=document.createElement("tr");
   const columns=[["AB","打数"],["H","安打"],["doubles","二塁打"],["triples","三塁打"],["HR","本塁打"],["RBI","打点"],["R","得点"],["BB","四球"],["K","三振"],["SB","盗塁"]];
   for(const label of ["選手名",...columns.map(([,label])=>label)]){const th=document.createElement("th");th.scope="col";th.textContent=label;hr.appendChild(th);}head.appendChild(hr);
   const body=document.createElement("tbody");
   for(const p of appearanceTeams[i].values()){
    const row=document.createElement("tr"),name=document.createElement("th");name.scope="row";name.textContent=p.name;row.appendChild(name);
    const stats=game.state.batting[p.key];
    for(const [key,label] of columns){const td=document.createElement("td"),caption=document.createElement("span"),value=document.createElement("span");caption.className="appearance-label";caption.setAttribute("aria-hidden","true");caption.textContent=label;value.textContent=String(stats?.[key]??"—");td.append(caption,value);row.appendChild(td);}body.appendChild(row);
   }
   overview.append(head,body);section.append(heading,overview);$("appearanceOverview").appendChild(section);
  });
 }
 function render(){const s=game.state;$("matchTitle").textContent=`試合seed：${game.seed}`;
  const pitcher=currentPitcher(game),batter=currentBatter(game);
  $("pitcher").textContent=`投手：${pitcher.name}`;$("batter").textContent=s.finished?"打者：—":`打者：${s.order[offense(game)]+1}番 ${batter.name}`;
  $("pitchCount").textContent=game.teams.map(t=>`${t.pitcher.name} ${s.pitching[t.pitcher.key].pitches}球`).join(" / ");
  const log=$("log"),previousTop=log.scrollTop,followLatest=log.scrollHeight-log.clientHeight-previousTop<=32;
  log.textContent=s.events.map(e=>`#${e.sequence} ${e.inning}${e.half==="top"?"表":"裏"} ${e.pitcher.name} → ${e.batter.name} / ${e.pitchType||"—"}${Number.isFinite(e.pitchSpeed)?` ${e.pitchSpeed}km/h`:""} / ${e.log||labels[e.result]||e.result} / ${e.scoreAfter.join("−")}`).join("\n")||"まだ投球していません。";
  log.scrollTop=s.events.length===0?0:followLatest?log.scrollHeight:previousTop;
  renderAppearanceOverview();
  $("statistics").replaceChildren();game.teams.forEach(t=>{
   const team=document.createElement("section"),h=document.createElement("h3");h.textContent=t.name;team.appendChild(h);
   const bat=document.createElement("h4");bat.textContent="打撃成績";team.appendChild(bat);
   t.lineup.forEach((p,i)=>{const b=s.batting[p.key];playerStats(team,(i+1)+"番 · "+p.name,[["打数",b.AB],["安打",b.H],["二塁打",b.doubles],["三塁打",b.triples],["本塁打",b.HR],["打点",b.RBI],["得点",b.R],["四球",b.BB],["三振",b.K],["盗塁",b.SB]]);});
   const title=document.createElement("h4");title.textContent="投手成績";team.appendChild(title);
   const ps=s.pitching[t.pitcher.key],innings=Math.floor(ps.outs/3)+(ps.outs%3?"と"+ps.outs%3+"/3":"")+"回";
   playerStats(team,t.pitcher.name,[["投球回",innings],["投球数",ps.pitches],["被安打",ps.H],["被本塁打",ps.HR],["失点",ps.R],["自責点",ps.ER],["与四球",ps.BB],["奪三振",ps.K]],"pitching");$("statistics").appendChild(team);
  });
  ["pitch","atbat","inning","game"].forEach(id=>$(id).disabled=s.finished);
  viewer?.sync();
 }
 // The development panel owns separate game instances and RNG streams.
 let balanceJob=null;
 const rate=value=>value===null?"—":value.toFixed(3);
 const percent=value=>value===null?"—":`${(value*100).toFixed(1)}%`;
 function fillBalanceOptions(id,presets){
  const select=$(id),all=document.createElement("option");all.value="all";all.textContent="全条件を比較";select.appendChild(all);
  presets.forEach(p=>{const option=document.createElement("option");option.value=p.id;option.textContent=p.label;select.appendChild(option);});
 }
 function balanceCard(parent,title,description){
  const card=document.createElement("section"),h=document.createElement("h3"),note=document.createElement("p"),body=document.createElement("div");
  card.className="balance-result";h.textContent=title;note.className="note";note.textContent=description;
  card.append(h,note,body);parent.appendChild(card);return body;
 }
 function showDuelResult(body,test){
  const s=duelTestSummary(test);body.replaceChildren(statList([
   ["打席数",s.PA],["打数",s.AB],["打率",rate(s.AVG)],["出塁率",rate(s.OBP)],["長打率",rate(s.SLG)],["OPS",rate(s.OPS)],
   ["単打",s.single],["二塁打",s.double],["三塁打",s.triple],["本塁打",s.homeRun],["三振",s.strikeout],["四球",s.walk],
   ["凡打率",percent(s.outRate)],["本塁打率",percent(s.HRRate)],["三振率",percent(s.KRate)]]));
  const h=document.createElement("h4");h.textContent="投手側の成績";
  const note=document.createElement("p");note.className="note";note.textContent=`5打数0安打：${s.hitlessFiveAB} / ${s.fiveABGroups}組（${percent(s.hitlessFiveRate)}）`;
  body.append(h,statList([["被打率",rate(s.AVG)],["被長打率",rate(s.SLG)],["奪三振率",percent(s.KRate)],["与四球率",percent(s.BBRate)]]),note);
 }
 function showTeamResult(body,test){
  const s=teamTestSummary(test);body.replaceChildren(statList([
   ["試合数",s.games],["勝利",s.wins],["敗戦",s.losses],["引き分け",s.draws],["勝率",percent(s.winRate)],
   ["平均得点",s.runs===null?"—":s.runs.toFixed(2)],["平均失点",s.allowed===null?"—":s.allowed.toFixed(2)],
   ["平均得点差",s.margin===null?"—":s.margin.toFixed(2)],["10点差以上",s.largeMargins],["完封数",s.shutouts]]));
  const note=document.createElement("p");note.className="note";note.textContent="先に表記したHIGH側の成績。勝率は引き分けを除外。10点差以上は勝敗を問わず集計、完封数は相手を0点に抑えた試合数です。";
  const scores=document.createElement("details"),summary=document.createElement("summary"),list=document.createElement("p");summary.textContent="全試合のスコア";list.className="note";
  list.textContent=s.scores.map((score,i)=>`${i+1}試合目 ${score[0]}−${score[1]}`).join(" / ");scores.append(summary,list);body.append(note,scores);
 }
 const yieldBalance=()=>new Promise(resolve=>setTimeout(resolve,0));
 async function runBalance(kind){
  if(balanceJob)return;
  const ids=["balanceRun","teamBalanceRun","balanceSeed","balancePreset","balanceCount","balancePitchCount","teamBalancePreset","teamBalanceCount"];
  const job={cancelled:false};balanceJob=job;ids.forEach(id=>$(id).disabled=true);$("balanceCancel").disabled=false;
  let completed=0,total=0;
  try{
   const isDuel=kind==="duel",catalog=isDuel?BALANCE_PRESETS:TEAM_BALANCE_PRESETS;
   const selected=$(isDuel?"balancePreset":"teamBalancePreset").value;
   const presets=selected==="all"?catalog:catalog.filter(p=>p.id===selected);
   const count=Number($(isDuel?"balanceCount":"teamBalanceCount").value),seed=$("balanceSeed").value;
   if(!presets.length||!(isDuel?[1000,10000]:[50,100]).includes(count))throw Error("テスト条件を選択してください。");
   const pitchText=$("balancePitchCount").value,startPitches=Number(pitchText);
   if(isDuel&&(pitchText.trim()===""||!Number.isInteger(startPitches)||startPitches<0||startPitches>500))throw Error("開始投球数は0〜500の整数で指定してください。");
   total=presets.length*count;
   const parent=$(isDuel?"balanceResults":"teamBalanceResults");parent.replaceChildren();
   for(const preset of presets){
    if(job.cancelled)break;
    const testSeed=`${seed}/${preset.id}`;
    const test=isDuel?createDuelTest(preset,testSeed,startPitches):createTeamTest(preset,testSeed);
    const teamSpec=profile=>balanceDescription(TEAM_BALANCE_PROFILES[profile]);
    const description=isDuel?balanceDescription(preset)+` / 毎打席の開始投球数 ${startPitches}`:`HIGH：${teamSpec("HIGH")} / 相手：${teamSpec(preset.opponent)}`;
    const body=balanceCard(parent,preset.label,`${description} / seed: ${testSeed} / ${CONFIG.version}`);
    const display=()=>isDuel?showDuelResult(body,test):showTeamResult(body,test);
    display();
    for(let i=0;i<count&&!job.cancelled;){
     const end=Math.min(count,i+(isDuel?100:1));
     for(;i<end;i++){if(isDuel)stepDuelTest(test);else stepTeamTest(test);completed++;}
     display();$("balanceStatus").textContent=`${preset.label}：${i.toLocaleString()} / ${count.toLocaleString()}${isDuel?"打席":"試合"}（全体 ${completed.toLocaleString()} / ${total.toLocaleString()}）`;
     await yieldBalance();
    }
   }
   $("balanceStatus").textContent=`${job.cancelled?"中止・途中集計":"完了"}：${completed.toLocaleString()} / ${total.toLocaleString()}${isDuel?"打席":"試合"}。通常試合の状態は変更していません。`;
  }catch(error){$("balanceStatus").textContent=`テスト停止：${error.message}（表示済み結果は途中集計）`;}
  finally{balanceJob=null;ids.forEach(id=>$(id).disabled=false);$("balanceCancel").disabled=true;}
 }
 fillBalanceOptions("balancePreset",BALANCE_PRESETS);fillBalanceOptions("teamBalancePreset",TEAM_BALANCE_PRESETS);
 $("balanceRun").onclick=()=>runBalance("duel");$("teamBalanceRun").onclick=()=>runBalance("team");
 $("balanceCancel").onclick=()=>{if(balanceJob)balanceJob.cancelled=true;};
 function reset(){let db;try{db=readDB(localStorage);}catch{db={players:[],message:"保存領域にアクセスできないためTEST PLAYERを使用"};}
  const names=[$("away").value.trim()||"デビルスターズ",$("home").value.trim()||"明道仁球会"];
  const teams=names.map((name,i)=>makeTeam(name,i===0?"away":"home",db.players,CONFIG));game=newGame(teams,$("seed").value,CONFIG);appearanceTeams=teams.map(()=>new Map());SL_ABILITY_DISPLAY.render($("lineupOverview"),game.teams);viewer?.reset();
  $("source").textContent=db.message+" / "+teams.map(t=>`${t.name}：実選手${9-t.testCount}人、TEST PLAYER ${t.testCount}人、未設定能力補完 ${t.lineup.reduce((n,p)=>n+p.fallbacks.length,0)}項目`).join(" / ");$("status").textContent="";render();
 }
 ["pitch","atbat","inning","game"].forEach(id=>$(id).onclick=()=>{try{advance(game,id);$("status").textContent="";}catch(e){$("status").textContent=e.message;}render();});$("reset").onclick=reset;
 $("export").onclick=()=>{const blob=new Blob([JSON.stringify(exportGame(game),null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="SL_WORLD_TEST_MATCH_006.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 viewer=SL_MATCH_VIEWER.create({root:$("matchViewer"),getGame:()=>game,step:mode=>{const start=game.state.events.length;advance(game,mode);return game.state.events.slice(start);},onChange:render});
 reset();
}

