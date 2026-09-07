const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const context=vm.createContext({console});
for(const path of ['engine-fielding.js','match-viewer.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context);
vm.runInContext(fs.readFileSync('engine-test.html','utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1],context);
const E=context.SL_ENGINE,V=context.SL_MATCH_VIEWER,F=context.SL_FIELDING;
const teams=[E.makeTeam('A','away',[],E.CONFIG),E.makeTeam('B','home',[],E.CONFIG)];const game=seed=>E.newGame(teams,seed);
let tally={};
for(let seed=0;seed<150;seed++){
 const g=game(seed);E.advance(g,'game');assert(g.state.finished);
 const hits=[0,0],errors=[0,0],runs=[0,0],sb={};
 for(const e of g.state.events){const side=e.half==='top'?0:1;tally[e.result]=(tally[e.result]||0)+1;assert(e.outsAfter<=3);assert(e.outsAfter>=e.outsBefore);const keys=e.runnersAfter.filter(Boolean).map(p=>p.key);assert.equal(new Set(keys).size,keys.length);
 if(e.hit)hits[side]++;if(e.error){errors[1-side]++;assert(!e.hit);}runs[side]+=e.runsScored;
 if(e.doublePlay)assert.equal(e.outsAfter-e.outsBefore,2);
 if(e.caughtStealing)assert.equal(e.outsAfter-e.outsBefore,1);
 if(e.stolenBase)sb[e.runner.key]=(sb[e.runner.key]||0)+1;
 if(e.sacrificeFly){assert(e.outsBefore<2);assert(e.runsScored>0);}
 const replay=V.toReplayEvent(e),plan=V.animationPlan(replay);for(const time of [0,plan.runStart,plan.end])for(const r of V.runnerAnimation(replay,plan,time))assert(r.position.every(Number.isFinite));
 const before=V.scoreboardSnapshot(g,e),after=V.scoreboardSnapshot(g,e,true);assert.deepEqual(before.hits,e.hitsBefore);assert.deepEqual(after.errors,e.errorsAfter);
 }
 assert.deepEqual(Array.from(g.state.hits),hits);assert.deepEqual(Array.from(g.state.errors),errors);assert.deepEqual(Array.from(g.state.score),runs);
 for(let side=0;side<2;side++){assert.equal(g.state.lines[side].reduce((a,b)=>a+(b||0),0),runs[side]);assert.equal(g.teams[side].lineup.reduce((a,p)=>a+g.state.batting[p.key].H,0),hits[side]);}
 for(const [key,stat] of Object.entries(g.state.batting))assert.equal(stat.SB,sb[key]||0);
 if(seed<10)for(const mode of ['FULL','MINI','HIGHLIGHT','SKIP']){const other=game(seed);while(!other.state.finished)E.advance(other,mode==='SKIP'?'game':'pitch');assert.equal(JSON.stringify(other.state),JSON.stringify(g.state));}
}
// Exhaust every occupied-base combination and out count over varied deterministic rolls.
for(let mask=0;mask<8;mask++)for(let outs=0;outs<3;outs++)for(let seed=0;seed<100;seed++){
 const g=game(seed),b=E.currentBatter(g),p=E.currentPitcher(g);g.state.outs=outs;g.state.virtualOuts=outs;g.state.bases=g.teams[0].lineup.slice(1,4).map((r,i)=>mask&(1<<i)?r:null);
 const pitch={outcome:'inPlay',battedResult:'groundout',battedQuality:.5};E.applyPitch(g,pitch,b,p);assert(g.state.outs<=3);const keys=g.state.bases.filter(Boolean).map(p=>p.key);assert.equal(keys.length,new Set(keys).size);if(g.state.outs===3)assert.equal(g.state.score[0],0);
 if(mask===1&&g.state.outs<3&&pitch.error!==true)assert(g.state.bases[0]?.key!==g.teams[0].lineup[1].key);
}
assert(tally.error&&tally.doublePlay&&tally.sacrificeFly&&tally.stolenBase&&tally.caughtStealing&&tally.homeRun&&tally.walk&&tally.strikeout);
console.log('PASS: 150 games, 40 mode comparisons, 2400 ground-ball situations',tally);
// Directed scoring and independent baserunning regressions.
function fixture(outs=0){const g=game('directed');g.state.outs=outs;g.state.virtualOuts=outs;g.state.bases=[null,null,g.teams[0].lineup[1]];g.state.playBefore=g.state.bases.map(r=>r?{key:r.key}:null);return g;}
for(const outs of [0,1,2]){const g=fixture(outs),b=E.currentBatter(g),p=E.currentPitcher(g);g.rng=()=>.1;const pitch={outcome:'inPlay',battedResult:'flyout',battedQuality:.5};const a=E.applyPitch(g,pitch,b,p);assert.equal(g.state.score[0],outs<2?1:0);assert.equal(g.state.batting[b.key].RBI,outs<2?1:0);assert.equal(g.state.batting[b.key].AB,outs<2?0:1);}
for(const kind of ['groundout','flyout','lineout']){const g=fixture(),b=E.currentBatter(g),p=E.currentPitcher(g);g.state.bases=[g.teams[0].lineup[2],g.teams[0].lineup[3],g.teams[0].lineup[1]];g.rng=()=>0;const pitch={outcome:'inPlay',battedResult:kind,battedQuality:.5};E.applyPitch(g,pitch,b,p);assert.equal(g.state.errors[1],1);assert.equal(g.state.hits[0],0);assert.equal(g.state.pitching[p.key].H,0);assert.equal(g.state.batting[b.key].RBI,0);}
for(const from of [1,2])for(const safe of [true,false]){const g=game('steal'),p=E.currentPitcher(g),r=g.teams[0].lineup[1];g.state.outs=2;g.state.bases[from-1]=r;let n=0;g.rng=()=>n++===0?0:safe?0:.999;const order=g.state.order[0],e=E.onePitch(g);assert.equal(e.result,safe?'stolenBase':'caughtStealing');assert.equal(g.state.batting[r.key][safe?'SB':'CS'],1);assert.equal(g.state.order[0],order);assert.equal(g.state.pitching[p.key].pitches,0);assert.equal(e.outsAfter,safe?2:3);if(!safe)assert.equal(g.state.half,'bottom');}
const sample=game('ability'),f=F.defense(sample)[5];f.profile.batting.fielding=20;f.profile.batting.catching=20;assert.equal(F.ability(f,'fielding'),1);const elite=.003+.045*(1-F.ability(f,'fielding'))**2;f.profile.batting.fielding=1;assert(elite>0&&elite<.003+.045*(1-F.ability(f,'fielding'))**2);
console.log('PASS: directed SF/AB/RBI, all error categories, second/third SB/CS and third-out batting order');
