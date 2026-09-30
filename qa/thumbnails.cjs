const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1000,height:560}});await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>window.__LTC?.ready);
 let css='/* Captured from the actual renderer by qa/thumbnails.cjs. */\n';
 for(const name of ['afterhours','shadows']){
  await page.evaluate(name=>{const a=__LTC;a.setScene(name);if(!a.state.frozen)a.toggleFreeze();if(!a.state.photo)a.togglePhoto();document.querySelector('#exitPhoto').hidden=true;},name);
  const n=await page.evaluate(()=>__LTC.frameCount);await page.waitForFunction(n=>__LTC.frameCount>n+2,n);
  const png=await page.locator('#viewport>canvas').screenshot();
  const uri=await page.evaluate(async uri=>{const im=new Image();im.src=uri;await im.decode();const c=document.createElement('canvas');c.width=440;c.height=246;c.getContext('2d').drawImage(im,0,0,440,246);return c.toDataURL('image/webp',.82);},'data:image/png;base64,'+png.toString('base64'));
  css+=`.sceneThumb.${name}{background-image:url(${uri})}\n`;
 }fs.writeFileSync(path.resolve(__dirname,'../src/v5-thumbnails.css'),css);console.log('Captured two scene thumbnails.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
