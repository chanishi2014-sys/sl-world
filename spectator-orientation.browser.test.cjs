const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const artifacts=path.join(__dirname,'test-artifacts');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(__dirname,decodeURIComponent(req.url.split('?')[0]));fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'msedge'}),reports=[],errors=[];
 try{
  for(const entry of ['engine-test.html','engine006.html'])for(const scenario of ['missing','safari','reject','auto-landscape','lock','portrait-native','no-orientation','lock-reject','late-lock','late-fullscreen','reenter-lock']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
   await context.addInitScript(({scenario})=>{
    window.apiCalls=[];window.mockFullscreen=null;window.testMode=scenario;
    Object.defineProperty(navigator,'standalone',{configurable:true,value:scenario!=='safari'});
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.mockFullscreen});
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
    const full=async function(){window.apiCalls.push('fullscreen');if(scenario==='reject')throw Error('Fullscreen unavailable');if(scenario==='late-fullscreen')await new Promise(resolve=>window.finishFullscreen=resolve);window.mockFullscreen=this;document.dispatchEvent(new Event('fullscreenchange'));};
    Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:['missing','safari'].includes(scenario)?undefined:full});
    Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined});
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>{window.apiCalls.push('exit');window.mockFullscreen=null;document.dispatchEvent(new Event('fullscreenchange'));}});
    const orientation=new EventTarget();orientation.type='portrait-primary';
    if(!['missing','safari'].includes(scenario))orientation.lock=async value=>{window.apiCalls.push('lock:'+value);if(scenario==='reject'||scenario==='lock-reject')throw Error('Orientation unavailable');if(scenario==='late-lock')await new Promise(resolve=>window.finishLock=resolve);if(scenario==='auto-landscape')await window.simulateRotation();if(scenario==='reenter-lock'){if(window.apiCalls.filter(c=>c==='lock:landscape').length===1)await new Promise(resolve=>window.finishLock=resolve);else throw Error('second lock rejected');}};
    orientation.unlock=()=>window.apiCalls.push('unlock');Object.defineProperty(screen,'orientation',{configurable:true,value:scenario==='no-orientation'?undefined:orientation});
   },{scenario});
   const page=await context.newPage();page.on('pageerror',e=>errors.push({entry,scenario,message:e.message}));
   await page.exposeFunction('simulateRotation',()=>page.setViewportSize({width:844,height:390}));
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+entry);
   const root=page.locator('#matchViewer'),hint=root.locator('.game-rotate-hint'),button=root.locator('[data-action=fullscreen]');
   await page.waitForSelector('#matchViewer canvas');assert.equal(await root.getAttribute('data-is-landscape'),'false');assert(!(await hint.isVisible()));
   await button.click();await page.waitForTimeout(60);
   assert.equal(await root.getAttribute('data-is-spectator-fullscreen-mode'),'true');
   if(scenario==='auto-landscape'){
    await page.waitForFunction(()=>document.querySelector('#matchViewer').dataset.isLandscape==='true');assert(!(await hint.isVisible()));
    assert.deepEqual(await page.evaluate(()=>window.apiCalls),['fullscreen','lock:landscape']);
    await button.click();await page.waitForTimeout(60);assert.equal(await root.getAttribute('data-is-spectator-fullscreen-mode'),'false');
    reports.push({entry,scenario,calls:await page.evaluate(()=>window.apiCalls),passed:true});await context.close();console.log('PASS',entry,scenario);continue;
   }
   assert(await hint.isVisible());assert((await hint.textContent()).includes('端末を横向きにしてください'));
   assert.equal(await root.getAttribute('data-is-fullscreen'),['missing','safari','reject','late-fullscreen'].includes(scenario)?'false':'true');
   if(scenario==='reenter-lock'){
    await hint.locator('button').click();await page.waitForTimeout(30);await button.click();await page.waitForTimeout(30);
    await page.evaluate(()=>window.finishLock());await page.waitForTimeout(30);await hint.locator('button').click();await page.waitForTimeout(30);
    assert.equal(await root.getAttribute('data-is-spectator-fullscreen-mode'),'false');assert((await page.evaluate(()=>window.apiCalls)).includes('unlock'));
   }else if(scenario==='late-lock'||scenario==='late-fullscreen'){
    await hint.locator('button').click();await page.evaluate(()=>window.finishLock?window.finishLock():window.finishFullscreen());await page.waitForTimeout(60);
    assert.equal(await root.getAttribute('data-is-spectator-fullscreen-mode'),'false');assert.equal(await root.getAttribute('data-is-fullscreen'),'false');assert(!(await hint.isVisible()));
    if(scenario==='late-lock')assert((await page.evaluate(()=>window.apiCalls)).includes('unlock'));
   }else{
    if(scenario==='missing')await root.screenshot({path:path.join(artifacts,'orientation-'+entry+'-prompt.png')});
    // Resize is sufficient; no orientationchange event is synthesized.
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
    assert.equal(await root.getAttribute('data-is-landscape'),'true');assert(await root.evaluate(e=>e.classList.contains('spectator-landscape')));assert(!(await hint.isVisible()));
    const layout=await root.evaluate(e=>{const rect=x=>{const b=x.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};return {root:rect(e),width:innerWidth,height:innerHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,clientWidth:e.clientWidth,clientHeight:e.clientHeight,items:['canvas','.stadium-board','.sb-counts','.sb-runners','.game-side','.game-controls'].map(s=>({selector:s,...rect(e.querySelector(s))})),tables:[...e.querySelectorAll('.live-lineups table')].map(rect)};});
    assert(layout.scrollWidth<=layout.clientWidth+1,JSON.stringify(layout));assert(layout.scrollHeight<=layout.clientHeight+1,JSON.stringify(layout));
    for(const box of layout.items)assert(box.left>=-1&&box.top>=-1&&box.right<=layout.width+1&&box.bottom<=layout.height+1,JSON.stringify(box));
    assert(layout.tables[0].right<=layout.tables[1].left+1);assert.equal(await root.locator('.sb-counts').count(),1);
    if(scenario==='missing'){
     for(const size of [{width:667,height:375},{width:844,height:320},{width:667,height:280},{width:568,height:320},{width:1024,height:768}]){
      await page.setViewportSize(size);await page.waitForTimeout(80);
      const compact=await root.evaluate(e=>({scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,boxes:[...e.querySelectorAll('canvas,.game-side,.game-controls')].map(n=>{const b=n.getBoundingClientRect();return {bottom:b.bottom,right:b.right};})}));
      assert(compact.scrollHeight<=compact.clientHeight+1&&compact.scrollWidth<=compact.clientWidth+1,JSON.stringify({size,compact}));
      assert(compact.boxes.every(b=>b.bottom<=size.height+1&&b.right<=size.width+1),JSON.stringify({size,compact}));
     }
     await page.setViewportSize({width:844,height:390});await page.waitForTimeout(80);
    }
    if(scenario==='missing')await page.screenshot({path:path.join(artifacts,'orientation-'+entry+'-landscape.png')});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(60);assert(await hint.isVisible());
    if(scenario==='portrait-native'){
     // OS fullscreen exit: viewport event also synchronizes if fullscreenchange is lost.
     await page.evaluate(()=>{window.mockFullscreen=null;window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(60);
    }else await hint.locator('button').click();
    assert.equal(await root.getAttribute('data-is-spectator-fullscreen-mode'),'false');assert(!(await hint.isVisible()));
    assert(!(await root.evaluate(e=>e.classList.contains('spectator-landscape'))));
    if(scenario==='lock'||scenario==='portrait-native')assert((await page.evaluate(()=>window.apiCalls)).includes('unlock'));
   }
   reports.push({entry,scenario,calls:await page.evaluate(()=>window.apiCalls),passed:true});await context.close();console.log('PASS',entry,scenario);
  }
  // Real browser fullscreen integration, not the mocked iPhone constraints.
  const page=await browser.newPage({viewport:{width:844,height:390}});page.on('pageerror',e=>errors.push({message:e.message}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/engine-test.html');await page.locator('[data-action=fullscreen]').click();
  await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal(await page.locator('#matchViewer').getAttribute('data-is-spectator-fullscreen-mode'),'true');
  await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>document.querySelector('#matchViewer').dataset.isSpectatorFullscreenMode==='false');
  reports.push({entry:'engine-test.html',scenario:'native-fullscreen-external-exit',passed:true});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'spectator-orientation-regression.json'),JSON.stringify({reports,errors,realIPhone:false},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
