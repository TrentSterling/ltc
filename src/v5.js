// V5 extends the existing lab inside its closure. Sources are embedded at build time.
const v5={ready:false,selection:null,brushArmed:false,softness:.65,stroke:null,moveSurface:false,
 emissionMode:'draw',emissionColor:'#ffd194',emissionRadius:13,emissionStroke:null,
 sweep:false,sweepTime:0,shadow:{enabled:true,x:0,y:2.3,z:-.2,width:1.8,depth:1.25,angle:0},
 surfaceMaps:new Map(),sceneExtras:new Map(),emissionHistory:new Map(),benchmark:null};
const emissionSize=256,emissionAtlas=document.createElement('canvas');
emissionAtlas.width=emissionSize;emissionAtlas.height=emissionSize*MAX_LIGHTS;
const emissionAtlasContext=emissionAtlas.getContext('2d');
const emissionTexture=new T.CanvasTexture(emissionAtlas);emissionTexture.minFilter=emissionTexture.magFilter=T.LinearFilter;
emissionTexture.generateMipmaps=false;lightUniforms.uUserEmission.value=emissionTexture;
const emissionMaps=Array.from({length:MAX_LIGHTS},()=>{const c=document.createElement('canvas');c.width=c.height=emissionSize;return c;});
let afterPanel,blockerMesh,shadowOutline,selectedOutline;

function uploadEmission(id){
 // CanvasTexture flips Y. Slot zero is the bottom atlas tile in the shader.
 emissionAtlasContext.clearRect(0,(MAX_LIGHTS-1-id)*emissionSize,emissionSize,emissionSize);
 emissionAtlasContext.drawImage(emissionMaps[id],0,(MAX_LIGHTS-1-id)*emissionSize);
 emissionTexture.needsUpdate=true;textureDirty.add(id);invalidate();
}
function seedEmission(id,kind='sign'){
 const c=emissionMaps[id],ctx=c.getContext('2d');ctx.clearRect(0,0,256,256);
 if(kind==='sign'){
  ctx.fillStyle='#ffce91';ctx.font='600 53px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('AFTER',128,93);ctx.fillText('HOURS',128,155);
  ctx.fillStyle='#9ce1d6';ctx.fillRect(30,40,196,3);ctx.fillRect(30,207,196,3);
  ctx.font='600 11px "Segoe UI",sans-serif';ctx.fillText('LIGHT / MATERIAL / MOTION',128,232);
 }else if(kind==='bolt'){
  ctx.fillStyle=v5.emissionColor;ctx.beginPath();ctx.moveTo(140,25);ctx.lineTo(63,141);ctx.lineTo(120,141);ctx.lineTo(102,234);ctx.lineTo(198,107);ctx.lineTo(137,107);ctx.closePath();ctx.fill();
 }else if(kind==='ring'){
  ctx.strokeStyle=v5.emissionColor;ctx.lineWidth=19;ctx.beginPath();ctx.arc(128,128,77,0,TAU);ctx.stroke();
 }else if(kind==='solid'){ctx.fillStyle=v5.emissionColor;ctx.fillRect(0,0,256,256);}
 uploadEmission(id);
}
function buildAfterHours(){
 const root=new T.Group();root.name='After Hours storefront';scene.add(root);
 const f=newFloor('After Hours pavement',root,'#788583',.32,.42);
 const masonry=materialPair('#a2a18e',.78,.04),enamel=materialPair('#376967',.30,.3),trim=materialPair('#b8b3a0',.26,.85),dark=materialPair('#1a282d',.7,.12);
 box('Storefront facade',11,5.6,.32,[0,2.8,-4.8],masonry,root);
 box('Shop recess',5.1,3.0,.23,[-1.9,1.7,-4.56],dark,root);
 for(let i=0;i<17;i++)box('Closed shutter',4.52,.13,.15,[-1.85,.5+i*.153,-4.35],enamel,root,.025);
 for(const x of [-4.25,.55])box('Window jamb',.12,3.15,.31,[x,1.65,-4.27],trim,root,.018);
 box('Window sill',5.05,.16,.53,[-1.85,.2,-4.22],trim,root,.03);
 box('Door surround',2.3,3.3,.2,[2.2,1.65,-4.47],enamel,root,.04);
 box('Door inset',1.94,2.92,.07,[2.2,1.68,-4.33],dark,root,.03);
 for(const y of [.43,2.91])box('Door rail',1.93,.075,.1,[2.2,y,-4.27],trim,root,.01);
 box('Door handle',.055,.42,.14,[2.92,1.42,-4.2],trim,root,.018);
 exhibitSign('CLOSED / BACK TOMORROW',[2.2,2.03,-4.22],1.25,root,'#c4c5b4');
 box('Sign housing',4.72,1.95,.28,[-1.8,3.92,-4.28],dark,root,.08);
 for(const x of [-4.6,4.6])box('Facade edge',.17,5.6,.18,[x,2.8,-4.5],enamel,root,.02);
 box('Awning',10.6,.16,1.3,[0,5.0,-4.08],enamel,root,.045);
 for(let i=0;i<14;i++)box('Awning seam',.022,.015,1.24,[-4.9+i*.75,5.09,-4.08],trim,root,.002);
 const benchPair=materialPair('#a5b4af',.24,.85),pos=[],uv=[],idx=[];
 const profile=new T.CatmullRomCurve3([vec(0,.55,.40),vec(0,.53,-.22),vec(0,.68,-.54),vec(0,1.48,-.75)]);
 for(let j=0;j<=40;j++){const p=profile.getPoint(j/40);for(let i=0;i<=24;i++){pos.push((i/24-.5)*3.4,p.y,p.z);uv.push(i/24,j/40);}}
 for(let j=0;j<40;j++)for(let i=0;i<24;i++){const k=j*25+i;idx.push(k,k+1,k+25,k+1,k+26,k+25);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
 const bench=addSurface('Curved metal bench',g,vec(1.2,.04,-1.55),benchPair,root);benchPair.ltc.side=benchPair.ref.side=T.DoubleSide;bench.userData.paintSpan=[3.4,2.0];
 for(const x of [-.05,2.45]){box('Bench foot',.5,.09,.91,[x,.045,-1.8],dark,root);box('Bench leg',.13,.51,.15,[x,.30,-1.82],trim,root);}
 afterPanel=box('Maintenance panel',1.45,1.2,.08,[-3.35,.66,-.85],materialPair('#bf8e63',.39,.7),root,.035);
 afterPanel.rotation.y=.28;afterPanel.userData.movable=true;
 for(const x of [-5.15,5.15]){cylinder('Street bollard',.105,.81,[x,.41,1.2],dark,root,24);cylinder('Bollard collar',.11,.07,[x,.66,1.2],trim,root,24);}
 for(let i=0;i<10;i++)box('Curb stone',1.06,.10,.28,[-4.8+i*1.08,.05,3.6],masonry,root,.025);
 exhibitSign('05 / NIGHT SHIFT',[-4.04,.98,-4.20],.9,root,'#bfd3c5');
 root.visible=false;return{root,floor:f,title:'After Hours',subtitle:'Draw the sign. Work the pavement. Follow the light.',camera:{pos:[7.4,4.6,10.3],target:[-.65,1.55,-2.0]},close:{pos:[3.5,2.1,5.1],target:[-.3,.85,-1.9]}};
}
function buildShadowStage(){
 const root=new T.Group();root.name='Controlled shadow stage';scene.add(root);
 const f=newFloor('Shadow-stage receiver',root,'#bdc5c7',.42,.1);
 box('Backdrop',12,5,.2,[0,2.5,-6],materialPair('#30444c',.65,.15),root);
 const frame=materialPair('#697f83',.3,.85);
 for(const x of [-3.3,3.3]){box('Lighting stand',.09,5.4,.09,[x,2.7,-1],frame,root,.018);box('Stand foot',.8,.04,.8,[x,.02,-1],frame,root,.01);}
 box('Lighting crossbar',6.7,.10,.1,[0,5.3,-1],frame,root);
 blockerMesh=addSurface('Movable opaque blocker',new T.PlaneGeometry(1,1),vec(),materialPair('#435d62',.45,.55),root);
 blockerMesh.rotation.x=-PI/2;blockerMesh.userData.pair.ltc.side=blockerMesh.userData.pair.ref.side=T.DoubleSide;blockerMesh.userData.blocker=true;
 shadowOutline=new T.LineLoop(new T.BufferGeometry().setFromPoints([vec(-.5,-.5,.004),vec(.5,-.5,.004),vec(.5,.5,.004),vec(-.5,.5,.004)]),new T.LineBasicMaterial({color:'#e9bd83'}));blockerMesh.add(shadowOutline);
 exhibitSign('VISIBILITY / ONE LIGHT, ONE BLOCKER',[0,4.25,-5.87],6.1,root,'#b5cbc8');
 root.visible=false;return{root,floor:f,title:'Shadow stage',subtitle:'Move one blocker through a rectangular area light.',camera:{pos:[7.0,5.0,8.3],target:[0,1.4,-.5]},close:{pos:[4.7,2.7,6.3],target:[0,.15,.25]}};
}
function updateBlocker(){
 const b=v5.shadow;
 lightUniforms.uShadowOn.value=s.scene==='shadows'&&b.enabled?1:0;
 lightUniforms.uBlockCenter.value.set(b.x,b.y,b.z);lightUniforms.uBlockSize.value.set(b.width,b.depth);lightUniforms.uBlockAngle.value=rad(b.angle);
 if(blockerMesh){blockerMesh.position.set(b.x,b.y,b.z);blockerMesh.rotation.set(-PI/2,0,-rad(b.angle));blockerMesh.scale.set(b.width,b.depth,1);}
 invalidate();
}
function blockedPolygonCPU(P,l=lights[1],b=v5.shadow){
 if(!l||!b.enabled||P.y>=b.y-1e-4||l.position.y<=b.y+1e-4)return[];
 const c=Math.cos(rad(b.angle)),sn=Math.sin(rad(b.angle)),center=vec(b.x,b.y,b.z);
 const vertices=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>vec(b.x+c*x*b.width-sn*z*b.depth,b.y,b.z+sn*x*b.width+c*z*b.depth));
 let poly=l.world.map(p=>p.clone());
 for(let i=0;i<4;i++){
  const n=vertices[i].clone().sub(P).cross(vertices[(i+1)%4].clone().sub(P));if(n.dot(center.clone().sub(P))<0)n.negate();
  const next=[];
  for(let j=0;j<poly.length;j++){const a=poly[(j+poly.length-1)%poly.length],q=poly[j],da=n.dot(a.clone().sub(P)),db=n.dot(q.clone().sub(P));
   if((da>=0)!==(db>=0))next.push(a.clone().lerp(q,da/(da-db)));if(db>=0)next.push(q.clone());}
  poly=next;if(poly.length<3)return[];
 }return poly;
}
function rayBlockedCPU(P,Q,b=v5.shadow){
 if(!b.enabled||P.y>=b.y-1e-4||Q.y<=b.y+1e-4)return false;
 const t=(b.y-P.y)/(Q.y-P.y),x=P.x+(Q.x-P.x)*t-b.x,z=P.z+(Q.z-P.z)*t-b.z,c=Math.cos(rad(b.angle)),sn=Math.sin(rad(b.angle));
 return Math.abs(c*x+sn*z)<=b.width*.5&&Math.abs(-sn*x+c*z)<=b.depth*.5;
}
function shadowIntegralCPU(P,A,l=lights[1]){
 const transform=poly=>poly.map(q=>q.clone().sub(P).applyMatrix3(A));
 const whole=edgeSum(transform(l.world)).E,blocked=edgeSum(transform(blockedPolygonCPU(P,l))).E;
 return{whole,blocked,visible:Math.max(0,whole-blocked)};
}
Object.assign(v5,{emissionMaps,uploadEmission,seedEmission,updateBlocker,blockedPolygonCPU,rayBlockedCPU,shadowIntegralCPU});

const v5Configure=configureExhibit;
configureExhibit=function(name){
 if(name!=='afterhours'&&name!=='shadows'){v5Configure(name);return;}
 resetEmitterSlots();
 if(name==='afterhours'){
  setEmitter(1,{name:'Painted shop sign',shape:'rectangle',width:4.45,height:1.72,position:[-1.8,3.92,-4.11],intensity:9,color:'#ffffff',pattern:6});seedEmission(1);
  const side=setEmitter(2,{name:'Street softbox',shape:'rectangle',width:.60,height:2.8,position:[4.55,2.8,-1.75],intensity:4.5,color:'#a2d8db',pattern:0});pointEmitter(side,[.5,.5,-1]);
  const warm=setEmitter(4,{name:'Door light',shape:'rectangle',width:1.55,height:.25,position:[2.2,3.08,-4.14],rotation:[.5,0,0],intensity:4,color:'#ffd8a7',pattern:0});
  s.exposure=1.18;
 }else{
  setEmitter(1,{name:'Rectangular study light',shape:'rectangle',width:3.4,height:2.4,position:[0,5,-.5],rotation:[PI/2,0,0],intensity:6,color:'#fff2df',pattern:0});s.exposure=1.12;
 }
 s.selected=1;updateAllLights();refreshLightList();updateBlocker();
};
const v5SetScene=setScene;
setScene=function(name,opts={}){v5SetScene(name,opts);if(v5.ready){v5.selection=null;v5.sweep=false;updateBlocker();syncV5();}};
const v5SyncScene=syncSceneUI;
syncSceneUI=function(){v5SyncScene();if(!v5.ready)return;
 $('sceneMenuBtn').textContent=exhibits[s.scene].title+' ▾';
 if(s.scene==='afterhours'){$('scenePrimary').textContent='Paint the sign';$('sceneSecondary').textContent=v5.sweep?'Stop light sweep':'Sweep the light';}
 if(s.scene==='shadows'){$('scenePrimary').textContent='Move the blocker';$('sceneSecondary').textContent='Inspect visibility';}
 $('worldState').textContent=s.scene==='shadows'?(v5.shadow.enabled?'ANALYTIC SHADOW / ONE BLOCKER':'SHADOW DISABLED'):'DIRECT AREA LIGHT / UNSHADOWED';
};
const v5Primary=scenePrimary,v5Secondary=sceneSecondary;
scenePrimary=function(){if(s.scene==='afterhours'){selectLight(1);setTool('lights');openEmissionEditor();}else if(s.scene==='shadows')selectV5({type:'blocker',mesh:blockerMesh});else v5Primary();};
sceneSecondary=function(){if(s.scene==='afterhours'){v5.sweep=!v5.sweep;v5.sweepTime=0;if(v5.sweep)ensureLive();syncSceneUI();}else if(s.scene==='shadows'){selectLight(1);openInspector();}else v5Secondary();};
const v5Step=stepExhibit;
stepExhibit=function(dt){v5Step(dt);if(v5.ready&&v5.sweep&&s.scene==='afterhours'){v5.sweepTime+=dt;const l=lights[1];l.rotation.y=Math.sin(v5.sweepTime*.75)*.40;updateLight(l);}};

function initV5(){
 toolHints.emission='Draw or import an emission image';toolHints.blocker='Drag the blocker to move it';
 mountV5UI();
 exhibits.afterhours=buildAfterHours();exhibits.shadows=buildShadowStage();sceneOrder.unshift('afterhours','shadows');
 for(const name of ['afterhours','shadows']){const x=exhibits[name];x.roughness=x.floor.userData.pair.uniforms.uRoughness.value;}
 customMeshes.forEach((m,i)=>m.userData.sessionID=i);
 for(const x of Object.values(exhibits))x.defaultFloorFinish=serializePair(x.floor.userData.pair);
 for(const name of ['shadows','afterhours']){
  const b=document.createElement('button');b.className='sceneCard';b.dataset.exhibit=name;b.innerHTML=`<div class="sceneThumb ${name}"></div><strong>${exhibits[name].title}</strong><span>${name==='afterhours'?'Draw a sign. Work the pavement.':'One light. One movable blocker.'}</span>`;b.onclick=()=>setScene(name);$('sceneMenu').querySelector('.sceneCards').prepend(b);
 }
 $('sceneSelect').innerHTML=sceneOrder.map(id=>`<option value="${id}">${exhibits[id].title}</option>`).join('');
 v5.ready=true;setScene('afterhours',{save:false});
 $('scenePrimary').onclick=scenePrimary;$('sceneSecondary').onclick=sceneSecondary;$('inspectOpen').onclick=openInspector;
 $('duplicateLight').onclick=duplicateLight;
 $('mode-playground').onclick=closeInspector;$('closeAnalysis').onclick=closeInspector;
 $('undoPaint').onclick=undoPaint;
}
