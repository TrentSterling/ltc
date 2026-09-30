// Controlled desktop study. This drives actual filtering and shading separately.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.addInitScript(()=>{window.benchmarkRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>window.benchmarkPaused?0:window.benchmarkRAF(fn);});
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>3);
 const result=await page.evaluate(async()=>{
  const a=__LTC,r=a.renderer,g=r.getContext(),ext=g.getExtension('EXT_disjoint_timer_query_webgl2'),debug=g.getExtension('WEBGL_debug_renderer_info');
  const tick=()=>new Promise(resolve=>window.benchmarkRAF(resolve));window.benchmarkPaused=true;await tick();await tick();
  const measure=async(fn)=>{
   const q=ext?g.createQuery():null;if(q)g.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();fn();if(q)g.endQuery(ext.TIME_ELAPSED_EXT);g.finish();const wall=performance.now()-start;
   if(!q)return {gpuMs:null,blockingWallMs:wall};
   while(!g.getQueryParameter(q,g.QUERY_RESULT_AVAILABLE))await tick();
   const gpu=g.getParameter(ext.GPU_DISJOINT_EXT)?null:g.getQueryParameter(q,g.QUERY_RESULT)/1e6;g.deleteQuery(q);return {gpuMs:gpu,blockingWallMs:wall};
  };
  const cases=[['rectangle-1',1,'rectangle',0,null],['rectangle-3',3,'rectangle',0,null],['star-3',3,'star',0,null],['painted-3',3,'rectangle',6,null],['shadow-off',1,'rectangle',0,false],['shadow-on',1,'rectangle',0,true]],rows=[];
  for(const [name,count,shape,pattern,shadow]of cases){
   a.setScene(shadow===null?'clean':'shadows',{reset:true,save:false});a.state.frozen=true;a.setParam('quality',1);a.selectLight(1);
   while(a.lights.filter(l=>l?.enabled).length<count)a.duplicateLight();
   a.lights.forEach(l=>{if(!l||!l.enabled)return;l.outline=a.polygon2D(shape);l.shape=shape;l.pattern=pattern;if(pattern){a.v5.seedEmission(l.id,'sign');l.paintMotion=2;}a.rebuildLight(l);a.updateLight(l);});
   if(shadow!==null){a.v5.shadow.enabled=shadow;a.v5.updateBlocker();}
   const origin=a.camera.position.clone(),target=new THREE.Vector3(0,1,0),samples=[];
   for(let i=-24;i<24;i++){
    const t=(i+24)%24/23,angle=(t-.5)*.30;a.camera.position.copy(origin).applyAxisAngle(new THREE.Vector3(0,1,0),angle);a.camera.lookAt(target);a.camera.updateMatrixWorld(true);
    if(pattern)a.lights.forEach(l=>{if(l?.enabled){l.phase=t*2;a.updateLight(l);a.textureDirty.add(l.id);}});
    const filtering=await measure(()=>a.renderTextures());
    const shading=await measure(()=>{const rt=a.targets.ltc;r.setRenderTarget(rt);r.setViewport(0,0,rt.width,rt.height);r.setScissorTest(false);r.clear();r.render(a.scene,a.camera);});
    if(i>=0)samples.push({t,camera:a.camera.position.toArray(),filtering,shading});
   }
   const average=field=>{const values=samples.map(s=>s[field].gpuMs).filter(x=>x!==null);return values.length?values.reduce((x,y)=>x+y,0)/values.length:null;};
   rows.push({name,lights:count,shape,pattern,shadow,resolution:a.renderSize,meanGpuFilteringMs:average('filtering'),meanGpuShadingMs:average('shading'),samples});
  }
  return {version:5,date:new Date().toISOString(),platform:navigator.platform,userAgent:navigator.userAgent,gpu:debug?g.getParameter(debug.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),timer:ext?'EXT_disjoint_timer_query_webgl2':'unavailable',viewport:[1280,800],warmupFrames:24,samplesPerCase:24,scope:'Desktop offscreen filtering and LTC scene shading; no presentation, UI, reference accumulation or headset timing. Shadow work is inside shading; compare the matched shadow-off/on cases. Blocking wall timings include CPU submission, synchronization and GPU execution.',rows};
 });
 fs.writeFileSync(path.join(__dirname,'benchmark-results.json'),JSON.stringify(result,null,2));
 for(const r of result.rows)console.log(r.name,JSON.stringify({filteringGpuMs:r.meanGpuFilteringMs,shadingGpuMs:r.meanGpuShadingMs,resolution:r.resolution}));
 console.log('COMPLETE benchmark saved with hardware, path, resolution and raw samples.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
