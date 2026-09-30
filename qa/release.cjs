const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright')); }
const assert = require('node:assert/strict');
const out=__dirname;
const results=[];
async function check(name,fn){await fn();results.push({name,pass:true});console.log('PASS',name);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist',...(process.env.LTC_HARDWARE?[]:['--use-angle=swiftshader'])]});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await page.goto(process.env.LTC_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>=2&&document.querySelector('#loading').style.display==='none',{},{timeout:90000});
 await page.evaluate(()=>{__LTC.setParam('quality',.5);if(!__LTC.state.frozen)__LTC.toggleFreeze();});
 const base=await page.evaluate(()=>[...__LTC.runChecks(),...__LTC.v4Checks(),...__LTC.workshopChecks()]);
 assert.deepEqual(base.filter(c=>!c.pass),[]);results.push(...base);console.log('PASS',base.length,'built-in checks');
 await check('Canonical and social metadata',async()=>{
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://tront.xyz/ltc/');
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'),'https://tront.xyz/ltc/og-image.png');
 });
 await check('Options dialog traps keyboard focus and Escape restores it',async()=>{
  await page.click('#settingsBtn');await page.waitForFunction(()=>document.activeElement.id==='closeSettings');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Source on GitHub');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'closeSettings');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsBtn');
 });
 await check('Help replaces Options without stacking dialogs',async()=>{
  await page.click('#settingsBtn');await page.click('#aboutBtn');
  assert.equal(await page.locator('.modalCover.open').count(),1);
  assert.equal(await page.locator('#about').evaluate(e=>e.classList.contains('open')),true);
  await page.keyboard.press('Escape');
 });
 await check('Hide and Show controls are explicit and restore panel',async()=>{
  await page.click('#closeControls');assert.equal(await page.locator('#showControls').isVisible(),true);
  await page.click('#showControls');assert.equal(await page.locator('#sidebar').isVisible(),true);
 });
 await check('Photo mode has a working visible exit',async()=>{
  await page.click('#settingsBtn');await page.click('#photoBtn');assert.equal(await page.locator('#exitPhoto').isVisible(),true);
  await page.click('#exitPhoto');assert.equal(await page.locator('header').isVisible(),true);
 });
 await check('Scene picker keyboard close returns to trigger',async()=>{
  await page.click('#sceneMenuBtn');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'sceneMenuBtn');
 });
 for(const scene of ['studio','range','bay','clean','gallery']){
  await check('Scene switch and visible rendering: '+scene,async()=>{
   await page.click('#sceneMenuBtn');await page.click(`[data-exhibit="${scene}"]`);
   assert.equal(await page.evaluate(()=>__LTC.state.scene),scene);
   await page.waitForFunction(()=>!document.querySelector('#sceneMenu').classList.contains('open'));
   assert.equal(await page.evaluate(()=>Object.values(__LTC.exhibits).filter(x=>x.root.visible).length),1);
   await page.screenshot({path:path.join(out,scene+'.png')});
   assert.equal(await page.evaluate(()=>__LTC.renderer.getContext().isContextLost()),false);
  });
 }
 await check('Painting changes the shared material map and Undo restores it',async()=>{
  await page.click('#tooltray [data-tool="paint"]');
  const before=await page.evaluate(()=>__LTC.paintCTX.getImageData(512,512,1,1).data.toString());
  await page.evaluate(()=>__LTC.polishedStrip());
  assert.ok(await page.evaluate(()=>__LTC.paintCount>0));
  await page.click('#undoPaint');
  assert.equal(await page.evaluate(()=>__LTC.paintCTX.getImageData(512,512,1,1).data.toString()),before);
 });
 await check('Inspect and Compare return to the same tool and pause state',async()=>{
  const state=await page.evaluate(()=>({tool:__LTC.state.tool,frozen:__LTC.state.frozen}));
  await page.click('#inspectOpen');assert.equal(await page.evaluate(()=>__LTC.state.mode),'explain');
  await page.click('[data-step="3"]');await page.screenshot({path:path.join(out,'explain.png')});
  await page.click('#mode-compare');
  await page.waitForFunction(()=>__LTC.refFrames>0,{},{timeout:60000});
  await page.click('#view-error');assert.equal(await page.evaluate(()=>__LTC.state.compareView),'error');
  await page.click('#mode-playground');
  assert.deepEqual(await page.evaluate(()=>({tool:__LTC.state.tool,frozen:__LTC.state.frozen})),state);
 });
 await check('Edited light and camera survive setup round trip',async()=>{
  const values=await page.evaluate(async()=>{const d=__LTC.exportSetup();const s=typeof d==='string'?JSON.parse(d):d;__LTC.setLightParam('intensity',7);await __LTC.importSetup(s);return {version:s.version,round:__LTC.exportSetup().lights,original:s.lights};});
  assert.equal(values.version,4);assert.deepEqual(values.round,values.original);
 });
 await page.click('#tooltray [data-tool="workshop"]');
 for(const [width,height] of [[1440,900],[390,844],[320,740],[768,1024],[812,375]]){
  await page.setViewportSize({width,height});
  await check(`Viewport ${width}x${height}: reachable controls, no header overflow`,async()=>{
   const layout=await page.evaluate(()=>({overflow:document.querySelector('header').scrollWidth>innerWidth,canvas:document.querySelector('#viewport').getBoundingClientRect().toJSON(),scene:document.querySelector('#sceneMenuBtn').getBoundingClientRect().toJSON()}));
   assert.equal(layout.overflow,false);assert.ok(layout.canvas.height>=150);assert.ok(layout.scene.height>=38);
   await page.screenshot({path:path.join(out,`release-${width}x${height}.png`)});
  });
 }
 await page.setViewportSize({width:390,height:844});
 await check('Phone: photo exit, paper credit and inspection return',async()=>{
  await page.click('#settingsBtn');await page.click('#photoBtn');await page.click('#exitPhoto');
  await page.click('#settingsBtn');await page.getByRole('button',{name:'Paper & credit',exact:true}).click();
  assert.ok((await page.locator('#paper').innerText()).includes('Eric Heitz'));await page.keyboard.press('Escape');
  await page.click('#inspectOpen');await page.screenshot({path:path.join(out,'release-mobile-explain.png')});
  assert.ok(await page.locator('#mode-playground').isVisible());await page.click('#mode-playground');
 });
 await check('No page errors, shader errors, lost context or external runtime dependencies',async()=>{
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>__LTC.errors),[]);
  assert.equal(await page.evaluate(()=>__LTC.renderer.getContext().isContextLost()),false);
  if(!process.env.LTC_URL)assert.deepEqual(network,[]);
 });
 const gpu=await page.evaluate(()=>{const g=__LTC.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,gpu,errors,network,results},null,2));
 console.log(`COMPLETE ${results.length} checks passed. GPU: ${gpu}`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
