const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync('lineup-display.js', 'utf8'), context);
const D = context.SL_ABILITY_DISPLAY;
for (const type of Object.keys(D.ABILITIES)) {
  for (const value of [null, undefined, '', '10', NaN, Infinity]) {
    assert.equal(D.getAbilityRank(type, value), null);
    assert.equal(D.describeAbility(type, value).status, 'unset');
  }
}
const players = Array.from({length:9}, (_,i) => ({key:`p${i}`, name:`選手${i}`, isTest:false, effective:{meet:10}, profile:{mainPosition:'SS', isPitcher:i===1||i===8, batting:{meet:i===0?null:5,power:200,speed:10,arm:12,fielding:13,catching:14}, pitching:i===1||i===8?{velocity:165,control:180,stamina:200}:{}}}));
const teams = [{name:'先攻',lineup:players,pitcher:players[8]},{name:'後攻',lineup:players,pitcher:players[8]}];
const original = JSON.stringify(teams);
const result = D.lineupModel(teams);
assert.equal(result.length,2);
for (const team of result) {
  assert.equal(team.players.length,9);
  assert.equal(team.players[0].batting[0].status,'unset'); // Never engine fallback meet:10.
  assert.equal(team.players[1].pitching.length,3);
  assert.equal(team.players[1].batting.length,6);
  assert.equal(team.players[1].batting[1].rank,'S');
  assert.equal(team.players[1].pitching[0].rank,'S');
  assert.equal(team.players[1].pitching[1].rank,'A');
  assert.equal(team.players[8].pitching.length,3);
  assert(team.players[8].starter);
}
assert.equal(JSON.stringify(teams),original);
assert(!/localStorage|Math\.random|\.effective/.test(fs.readFileSync('lineup-display.js','utf8')));
// Independent expected strings transcribed from the official tables, every valid integer.
const repeat = (rank,n) => rank.repeat(n);
const expected = {
 meet: { min:1, ranks:'GFFEDDCBAS' },
 speed: { min:1, ranks:'GGGFFFEEEDDDCCCBBAAS' },
 control: { min:1, ranks:repeat('G',39)+repeat('F',30)+repeat('E',30)+repeat('D',30)+repeat('C',25)+repeat('B',20)+repeat('A',15)+repeat('S',11) },
 velocity: { min:80, ranks:repeat('G',5)+repeat('F',5)+repeat('E',10)+repeat('D',15)+repeat('C',15)+repeat('B',15)+repeat('A',10)+repeat('S',11) }
};
for (const [type, profile] of Object.entries(expected)) {
 const types=type==='control'?['power','control','stamina']:type==='speed'?['speed','arm','fielding','catching']:[type];
 for (const stat of types) {
  [...profile.ranks].forEach((rank,i)=>assert.equal(D.getAbilityRank(stat,profile.min+i),rank,stat+':'+(profile.min+i)));
  for(const value of [profile.min-1,profile.min+profile.ranks.length,profile.min+.5]) {
   assert.equal(D.getAbilityRank(stat,value),null);
   assert.equal(D.describeAbility(stat,value).status,'unsupported');
  }
 }
}
assert.equal(D.getAbilityRank('unknown',10),null);
assert.equal(D.getAbilityRank('velocity',80),'G');
assert.equal(D.getAbilityRank('velocity',79),null);
assert.equal(D.getAbilityRank('power',200),'S');
assert.equal(D.getAbilityRank('meet',9),'A');
console.log('PASS: all 776 valid integer values for nine abilities, all boundaries, null/out-of-table inputs, both lineups and two-way groups, no DB mutation or engine changes.');
