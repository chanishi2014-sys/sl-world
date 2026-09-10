/* Read-only League -> Team ID -> Player ID browser. No simulation or storage writes. */
(()=>{'use strict';
const R=SL_TEAM_REGISTRY,D=SL_ABILITY_DISPLAY,T=SL_TRAITS,STORAGE_KEY='sl_world_players_v01';
const BASIC=['meet','power','speed','arm','fielding','catching'];
// Both screens read the same registered values and official rank definitions.
const basicAbilities=p=>BASIC.map(type=>({type,value:p.batting?.[type],spec:D.describeAbility(type,p.batting?.[type])}));
const categoryLabels={blue:'青特殊能力（プラス系）',green:'緑特殊能力',red:'赤特殊能力（マイナス系）',gold:'金特殊能力（上位）',rainbow:'虹特殊能力（最上位・特別）'};
function readRoster(storage){
 const byId=new Map(),byTeam=new Map();let ignored=0;
 try{
  const text=storage.getItem(STORAGE_KEY),data=text?JSON.parse(text):[],players=Array.isArray(data)?data:data?.players;
  if(!Array.isArray(players))throw Error('invalid player collection');
  const ids=new Map();for(const p of players)if(p&&typeof p==='object')ids.set(p.id,(ids.get(p.id)||0)+1);
  for(const p of players){
   if(!p||typeof p!=='object'||Array.isArray(p)||!(typeof p.id==='string'&&p.id.length||typeof p.id==='number'&&Number.isFinite(p.id))||ids.get(p.id)!==1){ignored++;continue;}
   // Explicit IDs take precedence. Only legacy records without teamId use the verified alias bridge.
   const team=p.teamId!=null?R.byId(p.teamId):R.resolve(p.team);
   if(!team){ignored++;continue;}
   byId.set(p.id,p);if(!byTeam.has(team.id))byTeam.set(team.id,[]);byTeam.get(team.id).push(p.id);
  }
  return {byId,byTeam,ignored,error:null};
 }catch{return {byId,byTeam,ignored,error:'選手データを読み込めません。保存形式を確認してください。'};}
}
const instances=new WeakMap();
function render(root){
 if(instances.has(root)){instances.get(root).refresh();return;}
 const doc=root.ownerDocument,state={league:null,teamId:null,playerId:null};let roster;
 const node=(tag,className,text)=>{const n=doc.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 function button(text,action,fn){const b=node('button','clubBack',text);b.type='button';b.dataset.teamsAction=action;b.onclick=fn;return b;}
 function title(text){const h=node('h2','',text);h.tabIndex=-1;root.append(h);return h;}
 function move(next,focusId){Object.assign(state,next);draw();const target=focusId?[...root.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===focusId):root.querySelector('h2');target?.focus();}
 function home(){move({league:null,teamId:null,playerId:null},'league:'+state.league);}
 function list(){const old=state.teamId;move({teamId:null,playerId:null},'team:'+old);}
 function team(){const old=state.playerId;move({playerId:null},'player:'+typeof old+':'+old);}
 function draw(){
  roster=readRoster(localStorage);root.replaceChildren();
  let club=state.teamId?R.byId(state.teamId):null;
  if(club){if(R.leagues[club.league])state.league=club.league;else Object.assign(state,{league:null,teamId:null,playerId:null});}
  const relationships=doc.getElementById('teamRelationships');if(relationships)relationships.hidden=state.league!=null;
  if(!state.league){root.dataset.screen='leagues';title('所属リーグを選択');
   for(const league of Object.values(R.leagues)){const b=button('', 'league',()=>move({league:league.id,teamId:null,playerId:null}));b.className='clubOpen league-choice';b.dataset.leagueId=league.id;b.dataset.focusKey='league:'+league.id;b.append(node('span','league-title',league.id+'所属チーム'),node('span','league-name',league.name));root.append(b);}return;
  }
  const league=R.leagues[state.league];
  if(!state.teamId){root.dataset.screen='teams';root.append(button('SL / TL 選択へ戻る','leagues-back',home));title(league.id+'所属チーム');root.append(node('p','',league.name));
   const clubs=R.forLeague(league.id);root.append(node('p','notice','現在 '+clubs.length+'チーム'));
   for(const club of clubs){const card=node('div','card'),b=button(club.currentName,'team',()=>move({teamId:club.id,playerId:null}));b.className='clubOpen';b.dataset.teamId=club.id;b.dataset.focusKey='team:'+club.id;card.append(b,node('p','notice',club.region));root.append(card);}return;
  }
  club=R.byId(state.teamId);
  const ids=roster.byTeam.get(club.id)||[];
  if(state.playerId!=null&&!ids.includes(state.playerId))state.playerId=null;
  if(state.playerId==null){root.dataset.screen='team';root.append(button(league.id+'所属チーム一覧へ戻る','teams-back',list));title(club.currentName);
   root.append(node('p','', '所属リーグ：'+league.name),node('p','','地域：'+club.region));
   const section=node('section','card');section.append(node('h3','','所属選手'));
   if(roster.error)section.append(node('p','notice',roster.error));
   else if(!ids.length)section.append(node('p','notice','選手データ未登録'));
   for(const id of ids){const p=roster.byId.get(id),b=button(p.name||'氏名未登録','player',()=>move({playerId:id}));b.className='clubOpen player-open';b.dataset.playerId=String(id);b.dataset.focusKey='player:'+typeof id+':'+id;b.textContent='';b.append(node('span','roster-name',p.name||'氏名未登録'));
    const abilities=node('span','roster-abilities');for(const {type,value,spec} of basicAbilities(p)){const cell=node('span','roster-ability');cell.dataset.ability=type;cell.setAttribute('aria-label',spec.label+' '+(spec.rank||'未設定')+' '+(value??'未設定'));cell.append(node('span','ability-rank rank-'+(spec.rank||spec.status),spec.rank||'—'),node('small','',value==null||value===''?'—':String(value)));abilities.append(cell);}b.append(abilities);section.append(b);}
   root.append(section);if(roster.ignored)root.append(node('p','notice','IDまたは所属を確認できない登録データがあります。選手エディターで確認してください。'));return;
  }
  root.dataset.screen='player';const p=roster.byId.get(state.playerId);root.append(button(club.currentName+'の所属選手へ戻る','team-back',team));title(p.name||'氏名未登録');root.append(node('p','notice',club.currentName+' ｜ '+league.name));
  const section=node('section','card');section.append(node('h3','','基本能力'));
  const grid=node('dl','player-ability-grid');
  for(const {type,value,spec} of basicAbilities(p)){const cell=node('div','player-ability-card');cell.dataset.ability=type;
   const badge=node('dd','ability-rank rank-'+(spec.rank||spec.status),spec.rank||(spec.status==='unset'?'—':'対象外'));
   badge.setAttribute('aria-label',spec.rank?'能力ランク '+spec.rank:spec.status==='unset'?'ランク未設定':'ランク対象外');
   const numeric=node('dd','player-ability-value',value==null||value===''?'未設定':String(value));numeric.setAttribute('aria-label','登録数値 '+numeric.textContent);
   cell.append(node('dt','',spec.label),badge,numeric);grid.append(cell);
  }
  section.append(grid,node('p','notice','—：未設定 ／ 対象外：ランク判定の範囲外。'));
  root.append(section);
  const details=node('details','card player-traits'),specials=Array.isArray(p.specials)?p.specials:[];details.append(node('summary','','特殊能力 · 一覧を見る（'+specials.length+'）'));
  const traits=node('div','trait-list');if(!specials.length)traits.append(node('p','notice','特殊能力未登録'));
  for(const name of specials){const def=typeof name==='string'?T.get(name):null,color=def?.color||'unknown';const badge=node('span','sp on trait-badge '+color);badge.dataset.traitCategory=color;badge.append(node('span','',typeof name==='string'?name:'未対応の特殊能力データ'),node('small','',categoryLabels[color]||'カテゴリ未登録'));traits.append(badge);}
  details.append(traits);root.append(details);
 }
 const refresh=()=>draw();instances.set(root,{refresh});
 window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY||e.key===null)refresh();});window.addEventListener('focus',refresh);window.addEventListener('sl-team-membership-change',refresh);
 draw();
}
globalThis.SL_TEAMS_VIEW=Object.freeze({readRoster,basicAbilities,render});
})();
