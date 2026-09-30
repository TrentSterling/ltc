const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{
 const root=path.resolve(__dirname,'..');
 const source=fs.readFileSync(path.join(root,'index.html'));
 const server=http.createServer((req,res)=>{
  const name=req.url==='/ltc/og-image.png'?'og-image.png':'index.html';
  res.setHeader('Content-Type',name.endsWith('png')?'image/png':'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,name)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800},acceptDownloads:true});
  const url=`http://127.0.0.1:${server.address().port}/ltc/`;
  await page.goto(url);await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>2);
  await page.click('#settingsBtn');
  const downloadEvent=page.waitForEvent('download');await page.click('#downloadDemo');const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'LTCsingle.html');
  assert.ok(fs.readFileSync(await download.path()).equals(source));
  console.log('PASS served download exactly matches standalone release HTML');
  const unsupported=await browser.newPage();
  await unsupported.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await unsupported.goto(url);
  assert.ok(await unsupported.locator('#reloadDemo').isVisible());
  assert.ok((await unsupported.locator('#loadingText').innerText()).includes('WebGL 2 is unavailable'));
  console.log('PASS unsupported WebGL shows recovery and portfolio actions');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>__LTC.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>!__LTC.ready&&document.querySelector('#loading').classList.contains('failed'));
  assert.ok(await page.locator('#reloadDemo').isVisible());
  console.log('PASS context loss invalidates readiness and exposes reload');
  console.log('COMPLETE 3 delivery checks passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
