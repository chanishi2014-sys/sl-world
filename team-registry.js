/* Shared current teams. No storage writes, historical migrations or promotion rules. */
const SL_TEAM_REGISTRY = (() => {
  const rows = [
    ['club-001','デビルスターズ','SL','東東京',null,[]],
    ['club-002','アステリア','SL','徳島','納東一',[]],
    ['club-003','東京アスレチックス','SL','東東京','日体荏原',['日本体育大荏原']],
    ['club-004','桐蔭フロンティア','SL','大阪','大阪桐蔭',[]],
    ['club-005','ブルーマリナーズ','SL','静岡','壮青学院',[]],
    ['club-006','東海ユナイテッド','SL','神奈川','東海大相模',[]],
    ['club-007','明道仁球会','SL','福井','威伏',[]],
    ['club-008','明訓ベースボールクラブ','SL','神奈川','明訓',[]],
    ['club-009','武勇館','SL','石川',null,[]],
    ['club-010','キューバ・リベルタード','SL','福岡','西東国',[]],
    ['club-011','知略野球研究所','SL','兵庫','知位学園',[]],
    ['club-012','鳥取野球倶楽部','SL','鳥取','頭取商',[]],
    ['club-013','霞ヶ浦セイラーズ','TL','茨城','霜華',[]],
    ['club-014','邦成重工','TL','大分','邦成',[]],
    ['club-015','福島レガリア','TL','福島','黄静学院',[]],
    ['club-016','火乃国球道会','TL','熊本','能体工',[]],
    ['club-017','倉敷鋼業','TL','岡山','剛田理大附',[]],
    ['club-018','西東京オリオンズ','TL','西東京','将駄',[]],
    ['club-019','紀州パイレーツ','TL','和歌山','市若大商',[]],
    ['club-020','関西電機','TL','大阪','HG学院',[]],
    ['club-021','幕張アストロズ','TL','千葉','千羽経附',[]],
    ['club-022','飛騨製作所','TL','岐阜','県岐阜商',[]]
  ];
  // Membership is mutable data; identity and historical aliases remain stable.
  const clubs = Object.freeze(rows.map(([id,currentName,initialLeague,region,formerName,aliases]) => {
    let league=initialLeague;
    return Object.freeze({id,currentName,region,formerName,aliases:Object.freeze(aliases),
      get league(){return league;},
      set league(value){
        if(typeof value!=='string'||!value.trim())throw new TypeError('league must be a non-empty ID');
        if(value===league)return;league=value;
        if(typeof globalThis.dispatchEvent==='function')globalThis.dispatchEvent(new Event('sl-team-membership-change'));
      }
    });
  }));
  const byId = id => clubs.find(team => team.id === id) || null;
  const resolve = (name,league) => typeof name === 'string' && name.length ? clubs.find(team => (!league || team.league === league) &&
    (team.currentName === name || team.formerName === name || team.aliases.includes(name))) || null : null;
  const leagues=Object.freeze({SL:Object.freeze({id:'SL',name:'SUPER LEAGUE'}),TL:Object.freeze({id:'TL',name:'TECHNICAL LEAGUE'})});
  return Object.freeze({clubs,byId,resolve,leagues,forLeague:league=>clubs.filter(team=>team.league===league)});
})();
globalThis.SL_TEAM_REGISTRY=SL_TEAM_REGISTRY;
