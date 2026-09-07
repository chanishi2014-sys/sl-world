const {chromium}=require('playwright');const assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.SL_BROWSER_CHANNEL||'msedge'}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(text==null||/undefined|null/.test(String(text)))throw Error('invalid canvas text: '+String(text));return fill.call(this,text,...args);};let clock=1;window.requestAnimationFrame=fn=>setTimeout(()=>fn(clock+=10000),0);window.cancelAnimationFrame=clearTimeout;});
 for(const seed of ['SL-WORLD-001','REPLAY-002']){let reference;for(const mode of ['SKIP','FULL','MINI','HIGHLIGHT']){
  await page.goto(pathToFileURL(path.resolve('engine-test.html')).href);await page.locator('#seed').fill(seed);await page.locator('#reset').click();const db=await page.evaluate(()=>localStorage.getItem('sl_world_players_v01'));
  await page.locator(`[data-watch-mode="${mode}"]`).click();if(['FULL','MINI'].includes(mode))await page.locator('[data-action="auto"]').click();
  await page.waitForFunction(()=>document.querySelector('.sb-phase strong').textContent==='試合終了',null,{timeout:120000});
  const score=await page.locator('.sb-table').innerText(),stats=await page.locator('#statistics').innerText();if(reference)assert.deepEqual({score,stats},reference);reference={score,stats};
  assert(!/undefined|null/.test(await page.locator('main').innerText()));assert.equal(await page.evaluate(()=>localStorage.getItem('sl_world_players_v01')),db);console.log(seed,mode,'PASS');
 }}
 // Sample frames of actual engine events, not manually decided outcomes.
 const samples=await page.evaluate(()=>{
  const E=SL_ENGINE,V=SL_MATCH_VIEWER,teams=[E.makeTeam('A','away',[],E.CONFIG),E.makeTeam('B','home',[],E.CONFIG)],found={};
  for(let seed=0;seed<35;seed++){const g=E.newGame(teams,seed);E.advance(g,'game');for(const e of g.state.events){for(const [key,yes] of Object.entries({steal:e.caughtStealing,ground:e.battedResult==='groundout'&&e.fielderIndex===5,line:e.battedResult==='lineout'&&e.fielderIndex===3,hit:e.result==='single'&&!e.infieldHit,dp:e.doublePlay,tagUp:e.tagUp,error:e.error,transition:e.nextState.half!==e.half&&!e.nextState.finished})){if(yes&&!found[key])found[key]={g,e};}}if(Object.keys(found).length===8)break;}
  window.replaySamples=found;window.sampleViewer=V.create({root:document.getElementById('matchViewer'),getGame:()=>window.sampleGame,step:()=>[],onChange:()=>{}});
  let frames=0;for(const {g,e} of Object.values(found)){window.sampleGame=g;const p=V.animationPlan(V.toReplayEvent(e));for(let t=0;t<=p.end;t+=80){sampleViewer.renderEvent(e,t);frames++;}sampleViewer.renderEvent(e,0);}
  return {keys:Object.keys(found),frames};
 });assert.equal(samples.keys.length,8);console.log('frames',samples);
 await page.evaluate(()=>{sampleGame=replaySamples.steal.g;const e=replaySamples.steal.e,p=SL_MATCH_VIEWER.animationPlan(SL_MATCH_VIEWER.toReplayEvent(e));sampleViewer.renderEvent(e,p.transfers[0].tagAt);document.querySelector('[data-panel]').hidden=false;});
 await page.locator('#matchViewer').screenshot({path:path.join(require('node:os').tmpdir(),'sl-world-replay-steal.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#matchViewer').screenshot({path:path.join(require('node:os').tmpdir(),'sl-world-replay-mobile.png')});
 await page.locator('[data-action="debug"]').click();assert(await page.locator('[data-debug]').isHidden());assert.deepEqual(errors,[]);await browser.close();console.log('PASS: 8 browser games, 8 play types, canvas labels, DEBUG toggle, DB unchanged.');
})();
