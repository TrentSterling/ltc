const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>window.__LTC?.ready);
 await page.evaluate(()=>{const a=__LTC;a.setScene('shadows');a.v5.shadow.angle=27;a.v5.updateBlocker();a.setParam('quality',.5);a.openInspector();a.setMode('compare');a.state.target=8192;a.state.paused=false;const u=a.activeFloor().userData.pair.uniforms;u.uRoughness.value=.55;u.uMetalness.value=.7;const sel=document.querySelector('#referenceModel');sel.value='1';sel.dispatchEvent(new Event('change'));a.invalidate();});
 await page.waitForFunction(()=>__LTC.refFrames>=2048,{},{timeout:180000});
 const samples=await page.evaluate(()=>{const a=__LTC,[w,h]=a.renderSize;return [[0,0,1],[1.5,0,1],[3,0,1],[-2,0,1]].map(p=>{
  const v=new THREE.Vector3(...p).project(a.camera),x=Math.round((v.x*.5+.5)*w),y=Math.round((v.y*.5+.5)*h);const ltc=[0,0,0],ref=[0,0,0];
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const l=a.samplePixel('ltc',x+i,y+j),r=a.samplePixel('reference',x+i,y+j);for(let k=0;k<3;k++){ltc[k]+=l[k]/9;ref[k]+=r[k]/9;}}
  return {p,x,y,ltc,ref,error:Math.max(...ltc.map((n,i)=>Math.abs(n-ref[i])/Math.max(.01,n)))};
 });});console.log(JSON.stringify(samples,null,2));assert.ok(samples.every(x=>x.error<.10),'GPU analytic/reference mismatch');assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(__dirname,'v5-shadow-compare.png')});fs.writeFileSync(path.join(__dirname,'v5-shadow-results.json'),JSON.stringify({samples,errors,spp:8192},null,2));console.log('COMPLETE GPU visibility reference agrees at all four receiver points');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
