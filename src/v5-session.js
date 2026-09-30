// Validate and decode the complete extension before the legacy importer mutates state.
const v5ExportBase=exportSetup;
exportSetup=function(){
 const d=v5ExportBase();d.version=5;
 d.lights.forEach(l=>l.paintMotion=lights[l.id].paintMotion||0);
 d.v5={emission:emissionMaps.map(c=>c.toDataURL('image/png')),shadow:{...v5.shadow},softness:v5.softness,floor:serializePair(activeFloor().userData.pair),
  surfaces:[...v5.surfaceMaps.values()].map(m=>({id:m.mesh.userData.sessionID,...serializePair(m.mesh.userData.pair),color:m.a.toDataURL('image/png'),props:m.b.toDataURL('image/png')})),
  panel:afterPanel.position.toArray()};
 return d;
};
function decodeV5Map(uri,size){return new Promise((resolve,reject)=>{
 if(typeof uri!=='string'||uri.length>3e6||!uri.startsWith('data:image/png;base64,'))return reject(Error('Expected an embedded PNG.'));
 const image=new Image();image.onload=()=>image.width===size&&image.height===size?resolve(image):reject(Error('Invalid map dimensions.'));image.onerror=()=>reject(Error('Unreadable map.'));image.src=uri;
});}
const v5ImportBase=importSetup;
importSetup=async function(input){
 if(typeof input==='string'&&input.length>32e6)throw Error('Setup exceeds 32 MB.');
 const d=typeof input==='string'?JSON.parse(input):input,x=d?.v5;
 let emission=[],surfaces=[];
 if(d?.version===5){
  if(!x||!Array.isArray(x.emission)||x.emission.length!==MAX_LIGHTS||!Array.isArray(x.surfaces)||x.surfaces.length>customMeshes.length)throw Error('Missing v5 map data.');
  const sh=x.shadow;
  if(!sh||typeof sh.enabled!=='boolean'||!['x','y','z','width','depth','angle'].every(k=>Number.isFinite(sh[k]))||Math.abs(sh.x)>6||Math.abs(sh.z)>6||sh.y<.3||sh.y>4.5||sh.width<.2||sh.width>5||sh.depth<.2||sh.depth>5||Math.abs(sh.angle)>360)throw Error('Invalid blocker settings.');
  if(!Number.isFinite(x.softness)||x.softness<0||x.softness>1||!finiteArray(x.panel,3)||x.panel.some(n=>Math.abs(n)>30))throw Error('Invalid scene settings.');
  if(!x.floor||!/^#[0-9a-f]{6}$/i.test(x.floor.base)||!Number.isFinite(x.floor.r)||x.floor.r<.04||x.floor.r>1||!Number.isFinite(x.floor.m)||x.floor.m<0||x.floor.m>1)throw Error('Invalid floor finish.');
  const ids=new Set();for(const f of x.surfaces){
   if(!Number.isInteger(f.id)||!customMeshes[f.id]||ids.has(f.id)||isPaintFloor(customMeshes[f.id])||!/^#[0-9a-f]{6}$/i.test(f.base)||!Number.isFinite(f.r)||f.r<.04||f.r>1||!Number.isFinite(f.m)||f.m<0||f.m>1||![0,1,2].includes(f.pattern))throw Error('Invalid painted surface.');ids.add(f.id);
  }
  if(!Array.isArray(d.lights)||d.lights.some(l=>!Number.isInteger(l.paintMotion)||l.paintMotion<0||l.paintMotion>3))throw Error('Invalid emission animation.');
  emission=await Promise.all(x.emission.map(uri=>decodeV5Map(uri,emissionSize)));
  surfaces=await Promise.all(x.surfaces.map(async f=>({...f,images:await Promise.all([decodeV5Map(f.color,PAINT_SIZE),decodeV5Map(f.props,PAINT_SIZE)])})));
 }
 await v5ImportBase(d);
 for(const map of v5.surfaceMaps.values()){
  if(!d.finishes.some(f=>f.id===map.mesh.userData.sessionID)){map.mesh.userData.pair=map.original;map.mesh.material=map.original.ltc;}
  map.texA.dispose();map.texB.dispose();
 }v5.surfaceMaps.clear();v5.sceneExtras.clear();exhibitSnapshots.clear();v5.emissionHistory.clear();
 emissionMaps.forEach((c,id)=>{const ctx=c.getContext('2d');ctx.clearRect(0,0,emissionSize,emissionSize);if(emission[id])ctx.drawImage(emission[id],0,0);uploadEmission(id);});
 if(x&&d.version===5){
  Object.assign(v5.shadow,x.shadow);v5.softness=x.softness;afterPanel.position.fromArray(x.panel);
  const floorUniforms=activeFloor().userData.pair.uniforms;floorUniforms.uBase.value.copy(color(x.floor.base));floorUniforms.uRoughness.value=x.floor.r;floorUniforms.uMetalness.value=x.floor.m;s.floorR=x.floor.r;
  for(const f of surfaces){const m=mapForSurface(customMeshes[f.id]),u=m.mesh.userData.pair.uniforms;
   u.uBase.value.set(f.base).convertSRGBToLinear();u.uRoughness.value=f.r;u.uMetalness.value=f.m;
   m.ctxA.drawImage(f.images[0],0,0);m.ctxB.drawImage(f.images[1],0,0);changedSurface(m);
  }
 }
 paintHistory.length=0;v5.selection=null;v5.brushArmed=false;updateBlocker();updateAllLights();syncV5();return true;
};
const v5SessionScene=setScene;
setScene=function(name,opts={}){
 if(v5.ready&&opts.save!==false)v5.sceneExtras.set(s.scene,{emission:emissionMaps.map(c=>c.getContext('2d').getImageData(0,0,emissionSize,emissionSize))});
 v5SessionScene(name,opts);
 if(!v5.ready||opts.configure===false)return;
 const saved=opts.reset?null:v5.sceneExtras.get(s.scene);
 if(saved)saved.emission.forEach((pixels,id)=>{emissionMaps[id].getContext('2d').putImageData(pixels,0,0);uploadEmission(id);});
 if(opts.reset){
  const finish=exhibits[s.scene].defaultFloorFinish,u=activeFloor().userData.pair.uniforms;
  u.uBase.value.copy(color(finish.base));u.uRoughness.value=finish.r;u.uMetalness.value=finish.m;s.floorR=finish.r;
  for(const [mesh,map]of v5.surfaceMaps)if(isVisible(mesh)){mesh.userData.pair=map.original;mesh.material=map.original.ltc;map.texA.dispose();map.texB.dispose();v5.surfaceMaps.delete(mesh);}
  v5.sceneExtras.delete(s.scene);
  if(s.scene==='shadows'){Object.assign(v5.shadow,{enabled:true,x:0,y:2.3,z:-.2,width:1.8,depth:1.25,angle:0});updateBlocker();}
  if(s.scene==='afterhours')afterPanel.position.set(-3.35,.66,-.85);
 }
 v5.emissionHistory.clear();v5.brushArmed=false;syncV5();
};
let v5InspectorReturn=null;
const v5SessionOpen=openInspector,v5SessionClose=closeInspector;
openInspector=function(){if(s.mode==='playground')v5InspectorReturn={selection:v5.selection,tool:s.tool,armed:v5.brushArmed};v5SessionOpen();};
closeInspector=function(){v5SessionClose();if(v5InspectorReturn){const back=v5InspectorReturn;v5InspectorReturn=null;setTool(back.tool);v5.selection=back.selection;v5.brushArmed=back.armed;syncV5();}};
$('setupFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>32e6)throw Error('Setup exceeds 32 MB.');await importSetup(await file.text());closeModal('settings');}catch(err){toast('Setup not loaded: '+err.message);}finally{e.target.value='';}};
const v5StageUpdate=updateLight;
updateLight=function(l){if(s.scene==='shadows'&&l.id!==1)l.enabled=false;v5StageUpdate(l);};
