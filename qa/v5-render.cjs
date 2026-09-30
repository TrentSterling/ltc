let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message)});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE',m.text().slice(0,4500));}});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>3,{},{timeout:90000});
  for(const name of ['afterhours','shadows']){
   await page.evaluate(name=>{__LTC.setScene(name);__LTC.toggleFreeze();},name);
   await page.screenshot({path:path.join(__dirname,'v5-'+name+'.png')});
   console.log('SCENE',name,await page.evaluate(()=>({frame:__LTC.frameCount,errors:__LTC.errors,lights:__LTC.lights.filter(Boolean).map(l=>({id:l.id,pattern:l.pattern,enabled:l.enabled})),shadow:__LTC.v5.shadowIntegralCPU(new THREE.Vector3(0,0,0),new THREE.Matrix3().set(1,0,0,0,0,-1,0,1,0))})));
  }
  console.log('ERROR COUNT',errors.length);
  fs.writeFileSync(path.join(__dirname,'v5-render.json'),JSON.stringify({errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
