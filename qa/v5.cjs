const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});
 const results=[],errors=[];
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>3);
 const check=async(name,fn)=>{assert.ok(await fn(),name);results.push(name);console.log('PASS',name);};
 await check('Seven scenes and native rendering',()=>page.evaluate(()=>Object.keys(__LTC.exhibits).length===7&&__LTC.errors.length===0));
 await page.click('#scenePrimary');
 await check('Scene action opens emission editor',()=>page.evaluate(()=>__LTC.state.tool==='emission'&&__LTC.v5.selection.type==='light'));
 const before=await page.evaluate(()=>__LTC.v5.emissionMaps[1].toDataURL());const box=await page.locator('#emissionCanvas').boundingBox();
 await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+180,box.y+180,{steps:10});await page.mouse.up();
 await check('Pointer stroke changes emission pixels',async()=>before!==await page.evaluate(()=>__LTC.v5.emissionMaps[1].toDataURL()));
 await page.click('#emissionUndo');await check('Emission undo restores exact pixels',async()=>before===await page.evaluate(()=>__LTC.v5.emissionMaps[1].toDataURL()));
 await page.selectOption('#emissionAnimation','2');
 await check('Scene switching preserves painted light and animation',async()=>{const r=await page.evaluate(()=>{const a=__LTC;const pixels=a.v5.emissionMaps[1].getContext('2d').getImageData(0,0,256,256).data,before=a.lights[1].paintMotion,exported=a.exportSetup().lights.find(l=>l.id===1).paintMotion;a.setScene('shadows');a.setScene('afterhours');const afterPixels=a.v5.emissionMaps[1].getContext('2d').getImageData(0,0,256,256).data;return {pixels:pixels.every((v,i)=>v===afterPixels[i]),maxDiff:pixels.reduce((m,v,i)=>Math.max(m,Math.abs(v-afterPixels[i])),0),keys:[...a.v5.sceneExtras.keys()],before,exported,after:a.lights[1].paintMotion};});console.log(r);return r.pixels&&r.after===2;});
 await check('Curved surface paint changes roughness and undo restores it',()=>page.evaluate(()=>{
  const a=__LTC,m=a.scene.getObjectByName('Curved metal bench');if(!m)throw Error('Bench names: '+a.scene.children.map(x=>x.name));
  const map=a.v5.mapForSurface(m),uv=new THREE.Vector2(.5,.5),before=a.v5.sampleSurfaceMap(map,uv).r;
  a.v5.stashSurface(map);a.v5.stampSurface(map,uv,.4,{mode:'polish',strength:1});a.v5.changedSurface(map);
  const after=a.v5.sampleSurfaceMap(map,uv).r;a.undoPaint();return after<before&&Math.abs(a.v5.sampleSurfaceMap(map,uv).r-before)<1e-6;
 }));
 await check('V5 setup restores pixels, finish, animation and blocker',()=>page.evaluate(async()=>{
  const a=__LTC,m=a.scene.getObjectByName('Curved metal bench'),map=a.v5.mapForSurface(m);a.v5.stampSurface(map,new THREE.Vector2(.5,.5),.4,{mode:'coat',strength:1});a.v5.changedSurface(map);a.v5.shadow.x=1.2;
  const saved=a.exportSetup(),pixels=map.a.toDataURL();a.v5.seedEmission(1,'ring');a.v5.shadow.x=-1;await a.importSetup(saved);
  return saved.version===5&&a.v5.surfaceMaps.get(m).a.toDataURL()===pixels&&a.v5.emissionMaps[1].toDataURL()===saved.v5.emission[1]&&a.lights[1].paintMotion===2&&a.v5.shadow.x===1.2;
 }));
 await check('Malformed extension rejected without mutation',()=>page.evaluate(async()=>{const a=__LTC,before=JSON.stringify(a.exportSetup()),bad=JSON.parse(before);bad.v5.shadow.y=10;try{await a.importSetup(bad);return false;}catch{return before===JSON.stringify(a.exportSetup());}}));
 await check('Inspector returns to selected surface',()=>page.evaluate(()=>{const a=__LTC,m=a.scene.getObjectByName('Curved metal bench');a.v5.select({type:'surface',mesh:m});a.openInspector();a.closeInspector();return a.v5.selection?.mesh===m&&a.state.tool==='paint';}));
 await check('Shadow integral agrees with independent area quadrature',()=>page.evaluate(()=>{
  const a=__LTC;a.setScene('shadows');a.v5.shadow.x=0;a.v5.shadow.angle=27;a.v5.updateBlocker();
  const l=a.lights[1],g=a.lightGPU[1],A=new THREE.Matrix3().set(1,0,0,0,0,-1,0,1,0),n=240,area=l.width*l.height;
  const checks=[];
  for(const p of [[0,0,0],[1.5,0,1],[3,0,0],[-2,0,-1]]){
   const P=new THREE.Vector3(...p);let sum=0;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const Q=l.position.clone().addScaledVector(g.U,((x+.5)/n-.5)*l.width).addScaledVector(g.V,((y+.5)/n-.5)*l.height);
    if(a.v5.rayBlockedCPU(P,Q))continue;const D=Q.sub(P),r2=D.lengthSq();sum+=Math.max(0,D.y)*Math.abs(D.dot(g.N))/(Math.PI*r2*r2);
   }
   const numerical=sum*area/(n*n),analytic=a.v5.shadowIntegralCPU(P,A).visible;checks.push({p,numerical,analytic,error:Math.abs(numerical-analytic)});
  }a.v5.numericChecks=checks;return checks.every(c=>c.error<.00035);
 }));
 await page.evaluate(()=>__LTC.sceneSecondary());await page.screenshot({path:path.join(__dirname,'v5-visibility.png')});
 for(const [width,height]of [[1440,900],[390,844],[768,1024],[844,390]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{__LTC.closeInspector();__LTC.setScene('afterhours');__LTC.scenePrimary();});
  await check(`Emission canvas reachable at ${width}x${height}`,()=>page.evaluate(()=>{const c=document.querySelector('#emissionCanvas'),r=c.getBoundingClientRect();return r.width>100&&r.left>=0&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;}));
  await page.screenshot({path:path.join(__dirname,`v5-editor-${width}.png`)});
 }
 assert.deepEqual(errors,[]);console.log('PASS no browser or shader errors');
 fs.writeFileSync(path.join(__dirname,'v5-results.json'),JSON.stringify({results,errors,numerical:await page.evaluate(()=>__LTC.v5.numericChecks)},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
