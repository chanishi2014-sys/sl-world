/* Read-only basic ability display. Never use effective match abilities or RNG. */
(() => {
  'use strict';
  const RANKS = Object.freeze(['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S']);
  // Official pitcher criteria: latest user specification and image0 (1).png.
  // Fielder ratings are deferred by the latest request, including prior tables.
  // Inclusive integer intervals: do not clamp, round or invent out-of-table ranks.
  const table = rows => Object.freeze(rows.map(([min, max, rank]) => Object.freeze({ min, max, rank })));
  const SCALE_200 = table([[1,39,'G'],[40,69,'F'],[70,99,'E'],[100,129,'D'],[130,154,'C'],[155,174,'B'],[175,189,'A'],[190,200,'S']]);
  // The revised official velocity table includes G:80–84, F:85–89, E:90–99.
  const VELOCITY = table([[80,84,'G'],[85,89,'F'],[90,99,'E'],[100,114,'D'],[115,129,'C'],[130,144,'B'],[145,154,'A'],[155,165,'S']]);
  const ABILITIES = Object.freeze({
    meet: Object.freeze({ label: 'ミート', group: 'batting', thresholds: null }),
    power: Object.freeze({ label: 'パワー', group: 'batting', thresholds: null }),
    speed: Object.freeze({ label: '走力', group: 'batting', thresholds: null }),
    arm: Object.freeze({ label: '肩力', group: 'batting', thresholds: null }),
    fielding: Object.freeze({ label: '守備力', group: 'batting', thresholds: null }),
    catching: Object.freeze({ label: '捕球', group: 'batting', thresholds: null }),
    velocity: Object.freeze({ label: '球速', group: 'pitching', thresholds: VELOCITY }),
    control: Object.freeze({ label: 'コントロール', group: 'pitching', thresholds: SCALE_200 }),
    stamina: Object.freeze({ label: 'スタミナ', group: 'pitching', thresholds: SCALE_200 })
  });
  const hasValue = value => typeof value === 'number' && Number.isFinite(value);
  function getAbilityRank(type, value) {
    if (!Number.isInteger(value)) return null;
    const thresholds = ABILITIES[type]?.thresholds;
    return thresholds?.find(entry => value >= entry.min && value <= entry.max)?.rank ?? null;
  }
  function describeAbility(type, value) {
    const rank = getAbilityRank(type, value);
    return { label: ABILITIES[type].label, rank, status: !hasValue(value) ? 'unset' : rank ? 'ranked' : ABILITIES[type].thresholds === null ? 'pending' : 'unsupported' };
  }
  const positionNames = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右', OF: '外', DH: '指' };
  function lineupModel(teams) {
    return teams.map((team, side) => ({
      name: team.name, side,
      players: team.lineup.map((player, index) => {
        const profile = player.profile || {};
        const starter = player.key === team.pitcher.key;
        const showPitching = starter || profile.isPitcher === true || ['velocity', 'control', 'stamina'].some(type => hasValue(profile.pitching?.[type]));
        return {
          key: player.key, name: player.name, order: index + 1, starter, isTest: player.isTest,
          position: starter ? '投' : positionNames[profile.mainPosition] || profile.mainPosition || '—',
          batting: Object.entries(ABILITIES).filter(([, spec]) => spec.group === 'batting').map(([type]) => describeAbility(type, profile.batting?.[type])),
          pitching: showPitching ? Object.entries(ABILITIES).filter(([, spec]) => spec.group === 'pitching').map(([type]) => describeAbility(type, profile.pitching?.[type])) : []
        };
      })
    }));
  }
  function render(root, teams) {
    const doc = root.ownerDocument;
    const make = (tag, className, text) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    root.replaceChildren();
    root.append(make('h2', '', 'オーダー / LINEUP'));
    root.append(make('p', 'note', '登録された基本能力を表示します。—：未設定 ／ 評価待：野手の正式基準待ち ／ 対象外：評価表の範囲外・整数以外。試合中の成績や能力補完は反映しません。守備は登録位置（先発は投）を表示します。'));
    const legend = make('div', 'lineup-legend');
    legend.setAttribute('aria-label', '能力ランクの色（GからS）');
    for (const rank of RANKS) legend.append(make('span', `ability-rank rank-${rank}`, rank));
    root.append(legend);
    const columns = make('div', 'lineup-teams');
    function abilities(label, entries) {
      const group = make('div', 'lineup-ability-group');
      group.append(make('p', 'lineup-group-label', label));
      const list = make('dl', 'lineup-abilities');
      for (const entry of entries) {
        const item = make('div', 'lineup-ability');
        const value = entry.rank || (entry.status === 'unset' ? '—' : entry.status === 'pending' ? '評価待' : '対象外');
        const badge = make('dd', `ability-rank ${entry.rank ? 'rank-' + entry.rank : 'rank-' + entry.status}`, value);
        if (entry.status === 'unset') badge.setAttribute('aria-label', '未設定');
        item.append(make('dt', '', entry.label), badge);
        list.append(item);
      }
      group.append(list);
      return group;
    }
    for (const team of lineupModel(teams)) {
      const section = make('section', 'lineup-team');
      section.append(make('h3', '', `${team.side === 0 ? '先攻' : '後攻'}：${team.name}`));
      const list = make('ol', 'lineup-list');
      for (const player of team.players) {
        const item = make('li', 'lineup-player');
        item.dataset.playerKey = player.key;
        item.append(make('h4', '', `${player.order}　${player.position}　${player.name}${player.starter ? '（先発）' : ''}${player.isTest ? '［テスト選手］' : ''}`));
        if (player.pitching.length) item.append(abilities('投手能力', player.pitching));
        item.append(abilities('打撃・守備能力', player.batting));
        list.append(item);
      }
      section.append(list);
      columns.append(section);
    }
    root.append(columns);
  }
  globalThis.SL_ABILITY_DISPLAY = Object.freeze({ RANKS, ABILITIES, getAbilityRank, describeAbility, lineupModel, render });
})();
