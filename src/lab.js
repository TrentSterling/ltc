/* ARC / LTC LIGHT LAB v2 — readable single-file application.
 * Preserves v1's fitted LUTs, polygon integral, CPU inspector and MIS comparison.
 * No point lights, environment maps, server, imports, external textures or fonts.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id),$$=q=>Array.from(document.querySelectorAll(q));
const T=THREE,PI=Math.PI,TAU=PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rad=d=>d*PI/180;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),v2=(x=0,y=0)=>new T.Vector2(x,y),color=h=>new T.Color(h).convertSRGBToLinear();
const s={mode:'playground',tool:'workshop',scene:'bay',selected:0,solo:-1,frozen:false,slow:false,photo:false,fill:true,bloom:true,exposure:1.18,quality:1,animateTextures:true,sound:false,step:0,morph:0,rays:true,compareView:'split',split:.5,paused:false,target:1024,brush:'steel',brushRadius:.7,throwPower:11,brushMode:'coat',brushStrength:1,surfaceView:0,bounded:false,trailMode:'polish'};
let ready=false,dirtyRef=true,dirtyInspector=true,sceneDirty=true,frameNo=0,refFrames=0,lastTime=performance.now(),simTime=0,morphGoal=null;
let W=1,H=1,mainWidth=1,explainWidth=1,rtWidth=1,rtHeight=1,drag=null,point=null,worldVerts=[],contour=[],triangles=[];
let rtLTC,rtSample,accA,accB,rtGlowA,rtGlowB,lastStatus=0,lastFPS=performance.now(),fpsFrames=0,fps=60,cpuMs=0,gpuMs=null,sceneCalls=0,sceneTris=0;
let toastTimer=0;const keys=new Set(),debugErrors=[];
window.addEventListener('error',e=>debugErrors.push(String(e.error||e.message)));
function invalidate(){dirtyRef=true;dirtyInspector=true;sceneDirty=true;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}
function fatal(message){$('loading').style.display='flex';$('loadingText').textContent=message;$('loading').querySelector('.loadBar').style.display='none';}
const container=$('viewport'),canvas=document.createElement('canvas');container.prepend(canvas);canvas.tabIndex=0;
let renderer,gl;
try{gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:true});if(!gl)throw Error('WebGL 2 is unavailable. Enable browser hardware acceleration.');if(!gl.getExtension('EXT_color_buffer_float'))throw Error('This browser/GPU lacks floating-point color attachments.');
renderer=new T.WebGLRenderer({canvas,context:gl});renderer.setPixelRatio(1);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.NoToneMapping;renderer.autoClear=false;renderer.info.autoReset=false;
}catch(e){fatal(e.message);return;}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;if(window.__LTC)window.__LTC.ready=false;fatal('Graphics context lost. Reload the demo to continue.');});
const timerExt=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pendingTimers=[];let activeTimer=null;
function beginTimer(){if(!timerExt||pendingTimers.length>=4||activeTimer)return;activeTimer=gl.createQuery();gl.beginQuery(timerExt.TIME_ELAPSED_EXT,activeTimer);}
function endTimer(){if(!activeTimer)return;gl.endQuery(timerExt.TIME_ELAPSED_EXT);pendingTimers.push(activeTimer);activeTimer=null;}
function pollTimers(){if(!timerExt)return;const disjoint=gl.getParameter(timerExt.GPU_DISJOINT_EXT);while(pendingTimers.length){const q=pendingTimers[0];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))break;pendingTimers.shift();if(!disjoint){const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gpuMs=gpuMs===null?ms:gpuMs*.8+ms*.2;}gl.deleteQuery(q);}if(disjoint)gpuMs=null;}
const bytes=Uint8Array.from(atob(LUT_BASE64),c=>c.charCodeAt(0)),table=new Float32Array(bytes.buffer),table1=table.slice(0,64*64*4),table2=table.slice(64*64*4);
function dataTexture(data){const t=new T.DataTexture(data,64,64,T.RGBAFormat,T.FloatType);t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;return t;}
function gpuLight(){return{center:vec(),U:vec(1,0,0),V:vec(0,1,0),N:vec(0,0,1),radiance:vec(),size:v2(1,1),area:1,twoSided:1,phase:0,reach:18,count:0,triCount:0,pattern:0,paintMotion:0,impact:new T.Vector4(.5,.5,-1,0),poly:Array.from({length:MAX_VERTS},()=>v2()),tris:Array.from({length:10},()=>new T.Vector4())};}
const lightGPU=Array.from({length:MAX_LIGHTS},gpuLight),lights=Array(MAX_LIGHTS).fill(null),textureDirty=new Set();
const blank=new T.DataTexture(new Uint8Array([0,0,0,0]),1,1,T.RGBAFormat);blank.needsUpdate=true;
const lightUniforms={uLUT1:{value:dataTexture(table1)},uLUT2:{value:dataTexture(table2)},uLights:{value:lightGPU},uRaw:{value:null},uFiltered:{value:null},uMean:{value:null},uBounded:{value:0},uSurfaceView:{value:0},uFrame:{value:0},uUserEmission:{value:blank},uShadowOn:{value:0},uShadowLight:{value:1},uBlockCenter:{value:vec(0,2.2,0)},uBlockSize:{value:v2(1.8,1.2)},uBlockAngle:{value:0},uReferenceModel:{value:0}};
const scene=new T.Scene();scene.background=color('#09131c');const camera=new T.PerspectiveCamera(46,1,.05,130);let orbitTarget=vec(0,1.55,-1.7);
const bay=new T.Group(),clean=new T.Group(),emitterRoot=new T.Group();scene.add(bay,clean,emitterRoot);clean.visible=false;
const pairs=[],surfaces=[],customMeshes=[],colliders=[];
function materialPair(base='#7f8f9f',roughness=.35,metalness=.8,pattern=0){
 const uniforms={...lightUniforms,uBase:{value:color(base)},uRoughness:{value:roughness},uMetalness:{value:metalness},uFill:{value:s.fill?.14:0},uPattern:{value:pattern},uPaintEnabled:{value:0},uPaintColor:{value:blank},uPaintProps:{value:blank},uLightMask:{value:31}};
 const ltc=new T.ShaderMaterial({vertexShader,fragmentShader:ltcFragment,uniforms}),ref=new T.ShaderMaterial({vertexShader,fragmentShader:referenceFragment,uniforms});
 const p={ltc,ref,uniforms,base:color(base),roughness,metalness,pattern};pairs.push(p);return p;
}
function addSurface(name,geo,pos,pair,parent=bay){const m=new T.Mesh(geo,pair.ltc);m.position.copy(pos);m.name=name;m.userData.pair=pair;m.onBeforeRender=receiverMask;parent.add(m);surfaces.push(m);customMeshes.push(m);return m;}
function roundedBox(w,h,d,r=.08){r=Math.min(r,w*.22,h*.22,d*.38);let sh=new T.Shape();sh.moveTo(-w/2+r,-h/2);sh.lineTo(w/2-r,-h/2);sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);sh.lineTo(w/2,h/2-r);sh.quadraticCurveTo(w/2,h/2,w/2-r,h/2);sh.lineTo(-w/2+r,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);sh.lineTo(-w/2,-h/2+r);sh.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new T.ExtrudeGeometry(sh,{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r*.45,bevelSegments:3,curveSegments:5,steps:1});g.center();g.computeVertexNormals();return g;}
function box(name,w,h,d,pos,pair,parent=bay,r=.06){return addSurface(name,roundedBox(w,h,d,r),vec(...pos),pair,parent);}
function tube(name,pts,r,pair,parent=bay){const path=new T.CatmullRomCurve3(pts.map(p=>vec(...p)));return addSurface(name,new T.TubeGeometry(path,48,r,8,false),vec(),pair,parent);}
function labelSprite(text,foreground='#91a5b6',size=16){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.font=`500 ${size*4}px ui-monospace,Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=foreground;ctx.fillText(text,256,64,492);const tx=new T.CanvasTexture(c);tx.encoding=T.sRGBEncoding;const m=new T.SpriteMaterial({map:tx,transparent:true,depthWrite:false});const o=new T.Sprite(m);o.scale.set(1.1,.275,1);return o;}
function worldLabel(text,pos,width=1.2,fg='#8da7b9',parent=bay){const c=document.createElement('canvas');c.width=1024;c.height=128;let x=c.getContext('2d');x.font='500 62px ui-monospace,Consolas,monospace';x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.fillText(text,512,64,1000);const tx=new T.CanvasTexture(c);tx.encoding=T.sRGBEncoding;const m=new T.Mesh(new T.PlaneGeometry(width,width/8),new T.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false}));m.position.set(...pos);parent.add(m);return m;}
const mat={frame:materialPair('#253946',.5,.65),rubber:materialPair('#263139',.85,0,2),steel:materialPair('#b7c5cf',.2,1),paint:materialPair('#476875',.33,.35),dark:materialPair('#1c2c37',.7,.3),orange:materialPair('#c78242',.35,.45),gold:materialPair('#d9b582',.24,1),wall:materialPair('#425362',.75,.12),ceramic:materialPair('#cdd2d0',.28,0)};
const floorPair=materialPair('#667a89',.32,.75,1);
const floor=addSurface('Test-bay floor',new T.PlaneGeometry(24,28),vec(0,0,1),floorPair,bay);floor.rotation.x=-PI/2;
// Art pass: a deliberately small bay, with readable bevels and material breaks.
box('Rear structure',18,6.8,.28,[0,3.35,-6.55],mat.dark);
for(let i=0;i<8;i++){const x=-7.85+i*2.24;box('Wall panel',2.13,5.85,.13,[x,3.05,-6.33],mat.wall);box('Wall seam',.055,6,.14,[x+1.1,3.05,-6.19],mat.frame,bay,.01);}
for(let i=0;i<4;i++)box('Architectural rail',18,.08,.19,[0,.35+i*1.9,-6.12],mat.frame);
for(const x of [-8.35,8.35]){box('Corner pillar',.36,6.5,.55,[x,3.25,-5.8],mat.frame);box('Floor perimeter strip',.06,.025,16,[x,.014,1.45],mat.orange);}
box('Upper lintel',17,.32,.45,[0,6.25,-6.05],mat.frame);
worldLabel('A R C   /   F I E L D   D I V I S I O N',[0,5.6,-6.12],5.4,'#8aaaba');
worldLabel('01',[7.05,4.68,-6.05],1.2,'#637c8a');
// Raised equipment pad, caution stripes, cables that rest on the floor.
box('Reactor base',4.7,.16,3.0,[-3.65,.08,-2.35],mat.frame);
for(let i=0;i<9;i++){const m=box('Caution stripe',.19,.012,.46,[-5.55+i*.47,.169,-.95],mat.orange,bay,.003);m.rotation.y=.4;}
tube('Power cable A',[[-5.2,.5,-2.8],[-5.65,.18,-3.2],[-6.35,.055,-3.9],[-6.7,.055,-5.2],[-6.6,.5,-6.0]],.065,mat.rubber);
tube('Power cable B',[[-5.0,.5,-2.6],[-5.35,.12,-3.5],[-5.7,.055,-4.15],[-5.9,.08,-5.1],[-5.9,.65,-6.0]],.037,mat.orange);
// Hero 1: curved machinery with a real circular opening and layered turbine.
const machine=new T.Group();machine.position.set(-3.55,1.47,-2.4);bay.add(machine);
for(const x of [-1.2,1.2]){box('Reactor foot',.55,.62,1.5,[x,-.99,0],mat.frame,machine);box('Reactor foot cap',.8,.12,1.75,[x,-1.26,0],mat.steel,machine);}
const body=addSurface('Curved reactor housing',new T.CylinderGeometry(.92,.92,2.8,80,1,true),vec(),mat.paint,machine);body.rotation.z=PI/2;
for(const x of [-1.43,1.43]){const ring=addSurface('Steel end collar',new T.TorusGeometry(.92,.1,16,80),vec(x,0,0),mat.steel,machine);ring.rotation.y=PI/2;}
for(const x of [-1.1,.78]){const band=addSurface('Service band',new T.CylinderGeometry(.934,.934,.18,80,1,true),vec(x,0,0),mat.orange,machine);band.rotation.z=PI/2;}
const inner=addSurface('Turbine recess',new T.CylinderGeometry(.82,.82,.23,64),vec(1.26,0,0),mat.dark,machine);inner.rotation.z=PI/2;
for(const x of [1.42,1.49]){const r=addSurface('Turbine inset ring',new T.TorusGeometry(x===1.42?.74:.37,.038,12,64),vec(x,0,0),mat.steel,machine);r.rotation.y=PI/2;}
for(let i=0;i<12;i++){const a=i*TAU/12;const fin=box('Turbine vane',.07,.42,.13,[1.46,Math.cos(a)*.52,Math.sin(a)*.52],mat.steel,machine,.012);fin.rotation.x=-a+.38;}
const hub=addSurface('Turbine hub',new T.SphereGeometry(.26,40,24),vec(1.49,0,0),mat.gold,machine);hub.scale.x=.38;
box('Instrument housing',1.2,.55,.2,[-.3,.28,.93],mat.frame,machine);
box('Instrument glass',.9,.26,.045,[-.3,.3,1.06],mat.dark,machine,.015);
for(let i=0;i<4;i++)box('Instrument segment',.095,.12,.025,[-.58+i*.18,.31,1.09],i%2?mat.gold:mat.steel,machine,.004);
worldLabel('ARC / FIELD POWER',[-3.9,2.05,-1.37],1.35,'#c3d5db');
colliders.push({min:vec(-5.15,.2,-3.37),max:vec(-1.95,2.45,-1.45)});
// Hero 2: helmet with curved visor, cheek armor, jaw and ear hardware.
box('Helmet plinth base',1.8,.16,1.65,[3.05,.08,-.8],mat.frame);
box('Helmet plinth',1.45,.76,1.28,[3.05,.53,-.8],mat.dark);
box('Helmet plinth lip',1.62,.07,1.45,[3.05,.94,-.8],mat.steel,bay,.022);
const helmet=new T.Group();helmet.position.set(3.05,1.92,-.8);helmet.rotation.y=-.32;bay.add(helmet);
const shell=addSurface('Helmet shell',new T.SphereGeometry(.72,64,40,0,TAU,0,PI*.79),vec(),mat.ceramic,helmet);shell.scale.set(1,1.05,.98);
// A fitted, tapered visor rather than a rectangular patch of a larger sphere.
function visorPosition(angle,v){const edge=Math.abs(angle)/1.05,top=.30-.055*edge*edge,bottom=-.20+.075*edge*edge,y=T.MathUtils.lerp(top,bottom,v),r=Math.sqrt(Math.max(.01,.738*.738-(y/1.05)**2));return vec(Math.sin(angle)*r,y,Math.cos(angle)*r*.98+.01);}
const visorGeo=new T.BufferGeometry(),visorPos=[],visorUV=[],visorIndices=[];const va=64,vb=14;
for(let j=0;j<=vb;j++)for(let i=0;i<=va;i++){visorPos.push(...visorPosition(-1.05+2.1*i/va,j/vb).toArray());visorUV.push(i/va,j/vb);}
for(let j=0;j<vb;j++)for(let i=0;i<va;i++){const k=j*(va+1)+i;visorIndices.push(k,k+va+1,k+1,k+1,k+va+1,k+va+2);}
visorGeo.setAttribute('position',new T.Float32BufferAttribute(visorPos,3));visorGeo.setAttribute('uv',new T.Float32BufferAttribute(visorUV,2));visorGeo.setIndex(visorIndices);visorGeo.computeVertexNormals();
const visor=addSurface('Curved smoked-metal visor',visorGeo,vec(),materialPair('#526576',.115,1),helmet);
const visorSeal=[];for(let i=0;i<=48;i++)visorSeal.push(visorPosition(-1.05+2.1*i/48,0));for(let i=48;i>=0;i--)visorSeal.push(visorPosition(-1.05+2.1*i/48,1));
const sealCurve=new T.CatmullRomCurve3(visorSeal,true,'centripetal');addSurface('Visor gasket',new T.TubeGeometry(sealCurve,152,.022,8,true),vec(),mat.frame,helmet);
// Narrow crown strip follows the shell curvature rather than floating above it.
const crestGeo=new T.BufferGeometry(),crestPos=[],crestIndices=[];
for(let j=0;j<=32;j++)for(const x of [-.049,.049]){const t=-.68+j/32*1.24,r=Math.sqrt(.737*.737-x*x);crestPos.push(x,r*Math.cos(t)*1.05,r*Math.sin(t)*.98);}
for(let j=0;j<32;j++){const k=j*2;crestIndices.push(k,k+2,k+1,k+1,k+2,k+3);}crestGeo.setAttribute('position',new T.Float32BufferAttribute(crestPos,3));crestGeo.setIndex(crestIndices);crestGeo.computeVertexNormals();crestGeo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(66*2),2));addSurface('Conformal crown stripe',crestGeo,vec(),mat.orange,helmet);
for(const x of [-.66,.66]){
 const e=addSurface('Helmet ear unit',new T.CylinderGeometry(.22,.22,.12,40),vec(x,-.03,-.015),mat.frame,helmet);e.rotation.z=PI/2;
 const cap=addSurface('Ear-unit insert',new T.CylinderGeometry(.145,.145,.13,32),vec(x*1.02,-.03,-.015),mat.steel,helmet);cap.rotation.z=PI/2;const center=addSurface('Ear-unit center',new T.CylinderGeometry(.06,.06,.141,20),vec(x*1.02,-.03,-.015),mat.dark,helmet);center.rotation.z=PI/2;
 const cheek=box('Cheek armor',.24,.35,.35,[x*.75,-.42,.36],mat.ceramic,helmet,.065);cheek.rotation.z=x>0?-.2:.2;cheek.rotation.y=x>0?.32:-.32;const strip=box('Cheek inset',.12,.07,.022,[x*.75,-.45,.55],mat.frame,helmet,.008);strip.rotation.y=x>0?.32:-.32;
}
box('Jaw guard',.68,.22,.33,[0,-.63,.40],mat.frame,helmet,.055);
for(let i=0;i<5;i++)box('Jaw vent',.04,.11,.015,[(i-2)*.085,-.63,.57],mat.steel,helmet,.003);

const neck=addSurface('Neck gasket',new T.CylinderGeometry(.31,.35,.35,48),vec(0,-.79,-.08),mat.rubber,helmet);
worldLabel('02 / SURFACE STUDY',[3.05,.5,-.14],1.08,'#9db2bc');
colliders.push({min:vec(2.2,0,-1.57),max:vec(3.9,2.82,0.0)});
// Hero 3: segmented wall materials, each a distinct physical surface.
box('Material rack',8.55,2.45,.26,[.65,1.76,-5.88],mat.frame);
const panelSpecs=[['PAINT','#6f8995',.33,.3],['STEEL','#b6c5d2',.12,1],['BRUSHED','#9faeb7',.42,1],['RUBBER','#303740',.9,0],['GOLD','#dab68b',.24,1],['CERAMIC','#bcc9cc',.32,0]];
for(let i=0;i<6;i++){let x=-2.86+i*1.405;const p=materialPair(panelSpecs[i][1],panelSpecs[i][2],panelSpecs[i][3]);box(panelSpecs[i][0]+' wall sample',1.12,1.60,.22,[x,1.95,-5.66],p,bay,.15);worldLabel(panelSpecs[i][0],[x,.9,-5.57],.9,'#91aebd');
 const stud=addSurface('Sample curvature',new T.SphereGeometry(.26,28,20),vec(x,1.87,-5.46),p);stud.scale.z=.32;}
worldLabel('MATERIAL RESPONSE / ROUGHNESS →',[.65,3.18,-5.78],4.2,'#90adbc');
// Screen chassis and hanging warm panel. The emitting faces are separate lights.
box('Animated panel chassis',3.30,1.77,.16,[3.35,4.47,-6.0],mat.frame);
// The inspection gantry is constructed in the workshop extension.
// Physical launcher, aimed by its turret at the shield.
const launcher=new T.Group();launcher.position.set(-5.5,.40,3.0);bay.add(launcher);
box('Launcher base',1.05,.37,1.1,[0,0,0],mat.frame,launcher);
const turret=new T.Group();turret.position.set(0,.35,0);launcher.add(turret);
const barrel=addSurface('Test launcher barrel',new T.CylinderGeometry(.13,.16,.9,24),vec(0,0,.2),mat.steel,turret);barrel.rotation.x=PI/2;
box('Launcher body',.55,.42,.48,[0,0,-.3],mat.orange,turret);
// Keep the original clean material-lab composition as a switchable diagnostic scene.
const cleanFloor=addSurface('Clean studio floor',new T.PlaneGeometry(40,40),vec(),materialPair('#889ba8',.18,.94,1),clean);cleanFloor.rotation.x=-PI/2;
addSurface('Studio backdrop',new T.PlaneGeometry(80,30),vec(0,12,-7),materialPair('#273543',.85,0),clean);
addSurface('Hero sphere',new T.SphereGeometry(1.02,80,48),vec(-3,1.28,-.85),materialPair('#b8c7d3',.18,.94),clean);
addSurface('Sphere plinth',new T.CylinderGeometry(1.19,1.23,.27,56),vec(-3,.135,-.85),mat.frame,clean);
const cb=box('Beveled study block',1.35,1.35,1.35,[3,.99,-1.05],materialPair('#cbab7e',.18,.94),clean,.14);cb.rotation.y=-.32;
addSurface('Block plinth',new T.CylinderGeometry(1.1,1.14,.22,48),vec(3,.11,-1.05),mat.frame,clean);
const cr=addSurface('Metal ring',new T.TorusGeometry(.66,.19,28,88),vec(0,1.42,-2.6),materialPair('#9aacbe',.18,1),clean);cr.rotation.y=-.26;
for(let i=0;i<4;i++){let r=[.06,.2,.45,.8][i],x=(i-1.5)*1.1;addSurface('Roughness sample '+r,new T.SphereGeometry(.36,36,24),vec(x,.52,.25),materialPair('#a5b8c8',r,.94),clean);addSurface('Sample plinth',new T.CylinderGeometry(.43,.46,.16,32),vec(x,.08,.25),mat.frame,clean);const lab=labelSprite('r '+r.toFixed(2),'#718a9e',11);lab.position.set(x,.1,.88);clean.add(lab);}
point={P:vec(1.25,0,3.25),N:vec(0,1,0),mesh:floor,uv:null};
// Emitters: normalized geometry, world-space integration and area-sampling metadata.
function polygon2D(shape){
 const presets={rectangle:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],bolt:[[-.05,.5],[-.43,-.02],[-.06,-.02],[-.25,-.5],[.46,.14],[.06,.14],[.24,.5]],arrow:[[-.48,-.18],[.06,-.18],[.06,-.46],[.49,0],[.06,.46],[.06,.18],[-.48,.18]],jagged:[[-.38,.36],[.1,.5],[.4,.3],[.49,-.02],[.25,-.12],[.02,-.5],[-.25,-.36],[-.47,.02]]};
 if(presets[shape])return presets[shape].map(p=>v2(...p));
 const n=shape==='star'?10:shape==='triangle'?3:shape==='disc'?12:6;
 return Array.from({length:n},(_,i)=>{const a=PI/2+i*TAU/n,r=shape==='star'&&i%2?.225:.5;return v2(Math.cos(a)*r,Math.sin(a)*r);});
}
function polygonArea(p){let a=0;for(let i=0;i<p.length;i++){const b=p[(i+1)%p.length];a+=p[i].x*b.y-b.x*p[i].y;}return Math.abs(a)*.5;}
function validateOutline(p){
 if(p.length<3||p.length>MAX_VERTS)return{valid:false,reason:'Use 3–12 vertices.'};
 if(p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return{valid:false,reason:'Coordinates must be finite.'};
 for(let i=0;i<p.length;i++)if(p[i].distanceTo(p[(i+1)%p.length])<.022)return{valid:false,reason:'That edge is too short. The last valid light is retained.'};
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  if(j===i+1||(i===0&&j===p.length-1))continue;
  const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
  const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
  if(x*y<=1e-12&&z*w<=1e-12&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-8&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+1e-8)return{valid:false,reason:'Self-intersection rejected. The last valid light is retained.'};
 }
 if(polygonArea(p)<.025)return{valid:false,reason:'The outline has collapsed to almost zero area.'};
 const tris=T.ShapeUtils.triangulateShape(p,[]);if(tris.length!==p.length-2)return{valid:false,reason:'This outline cannot be triangulated safely.'};
 return{valid:true,reason:p.length+' edges · valid simple polygon',triangles:tris};
}
function makeLight(id,opts){
 const l={id,name:'Polygon light',shape:'rectangle',outline:null,width:2,height:2,position:vec(),rotation:new T.Euler(0,0,0,'YXZ'),intensity:5,reach:18,color:'#ffffff',twoSided:true,pattern:0,enabled:true,spin:false,phase:0,pulse:0,hitAge:-1,hitUV:v2(.5,.5),hitStrength:0,scale:1,root:new T.Group(),world:[],tris:[],mesh:null,rim:null,...opts};
 l.outline=l.outline?l.outline.map(v=>v.clone()):polygon2D(l.shape);lights[id]=l;emitterRoot.add(l.root);l.root.name=l.name;l.root.userData.lightId=id;rebuildLight(l);return l;
}
function rebuildLight(l){
 const valid=validateOutline(l.outline);if(!valid.valid)return false;l.tris=valid.triangles;l.normalizedArea=polygonArea(l.outline);
 for(const child of l.root.children.slice()){l.root.remove(child);if(child.geometry)child.geometry.dispose();if(child.material)child.material.dispose();}
 const geo=new T.ShapeGeometry(new T.Shape(l.outline));const uv=geo.attributes.uv,pos=geo.attributes.position;for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)+.5,pos.getY(i)+.5);uv.needsUpdate=true;
 l.mesh=new T.Mesh(geo,new T.ShaderMaterial({vertexShader,fragmentShader:emitterFragment,uniforms:{...lightUniforms,uEmitter:{value:l.id}},side:T.DoubleSide}));l.mesh.userData.lightId=l.id;l.root.add(l.mesh);
 const edges=[];for(let i=0;i<l.outline.length;i++){const a=l.outline[i],b=l.outline[(i+1)%l.outline.length];const curve=new T.LineCurve3(vec(a.x,a.y,-.016),vec(b.x,b.y,-.016));const frame=new T.Mesh(new T.TubeGeometry(curve,1,.009,6,false),new T.MeshBasicMaterial({color:color('#667783')}));l.root.add(frame);}
 l.rim=new T.LineLoop(new T.BufferGeometry().setFromPoints(l.outline.map(p=>vec(p.x,p.y,.005))),new T.LineBasicMaterial({color:0xa5f6fa,transparent:true,opacity:.6}));l.root.add(l.rim);
 textureDirty.add(l.id);updateLight(l);return true;
}
function updateLight(l){
 const g=lightGPU[l.id],scale=Math.max(.001,l.scale);if(Math.abs(g.size.x-l.width*scale)>1e-6||Math.abs(g.size.y-l.height*scale)>1e-6)textureDirty.add(l.id);l.root.position.copy(l.position);l.root.quaternion.setFromEuler(l.rotation);if(l.id===0&&shield.recoil>0)l.root.quaternion.multiply(new T.Quaternion().setFromAxisAngle(vec(1,0,0),shield.recoil*.7));l.root.scale.set(l.width*scale,l.height*scale,1);l.root.updateMatrixWorld(true);
 g.center.copy(l.position);g.U.set(1,0,0).applyQuaternion(l.root.quaternion);g.V.set(0,1,0).applyQuaternion(l.root.quaternion);g.N.set(0,0,1).applyQuaternion(l.root.quaternion);g.size.set(l.width*scale,l.height*scale);
 g.count=l.outline.length;g.triCount=l.tris.length;g.area=Math.max(1e-8,l.normalizedArea*g.size.x*g.size.y);g.reach=l.reach||18;g.twoSided=l.twoSided?1:0;g.pattern=l.pattern;g.paintMotion=l.paintMotion||0;g.phase=l.phase;g.impact.set(l.hitUV.x,l.hitUV.y,l.hitAge,l.hitStrength);
 const active=l.enabled&&(s.solo<0||s.solo===l.id)&&scale>.007;const c=color(l.color).multiplyScalar(active?l.intensity*(1+l.pulse):0);g.radiance.set(c.r,c.g,c.b);
 l.root.visible=l.enabled&&scale>.007&&(s.solo<0||s.solo===l.id);l.mesh.material.side=l.twoSided?T.DoubleSide:T.FrontSide;
 l.world=[];for(let i=0;i<MAX_VERTS;i++){const p=l.outline[i]||v2();g.poly[i].set(p.x*g.size.x,p.y*g.size.y);if(i<l.outline.length)l.world.push(l.position.clone().addScaledVector(g.U,g.poly[i].x).addScaledVector(g.V,g.poly[i].y));}
 let area=0;for(let i=0;i<10;i++){const tri=l.tris[i];if(tri){const a=l.outline[tri[0]],b=l.outline[tri[1]],c=l.outline[tri[2]];area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5;g.tris[i].set(...tri,area/l.normalizedArea);}else g.tris[i].set(0,0,0,1);}
 if(l.id===s.selected)syncSelectedGeometry();sceneDirty=true;dirtyRef=true;dirtyInspector=true;
}
function selectedLight(){return lights[s.selected]||lights.find(Boolean);}
function syncSelectedGeometry(){const l=selectedLight();if(!l)return;worldVerts=l.world;contour=lightGPU[l.id].poly.slice(0,l.outline.length);triangles=l.tris;}
function updateAllLights(){for(const l of lights)if(l)updateLight(l);}
const shield={held:false,deployed:true,open:1,charging:false,charge:0,autoFire:false,nextShot:1,impacts:0,recoil:0};
const disc={mode:'parked',resumeMode:'flight',velocity:vec(),omega:vec(3,8,1.5),bounces:0,age:0};
function initLights(){
 for(const l of lights)if(l){emitterRoot.remove(l.root);l.root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}lights.fill(null);for(let i=0;i<MAX_LIGHTS;i++){Object.assign(lightGPU[i],gpuLight());textureDirty.add(i);}
 makeLight(0,{name:'Energy shield',shape:'hexagon',width:2.05,height:2.32,position:vec(-1.45,1.72,.55),rotation:new T.Euler(rad(-8),rad(-14),rad(-4),'YXZ'),intensity:8,color:'#71e8ff',pattern:1});
 makeLight(1,{name:'Inspection scanner',shape:'rectangle',width:4.2,height:.64,position:vec(1.6,5.08,-.55),rotation:new T.Euler(PI/2,0,0,'YXZ'),intensity:6.5,color:'#ffc58c',pattern:0});
 makeLight(2,{name:'Animated wall panel',shape:'rectangle',width:3.04,height:1.5,position:vec(3.35,4.47,-5.89),intensity:8,color:'#ffffff',pattern:2});
 makeLight(3,{name:'Light disc',shape:'disc',width:1.2,height:1.2,position:vec(3.8,.18,2.1),rotation:new T.Euler(-PI/2,0,0,'YXZ'),intensity:6,color:'#c9a1ff',pattern:5});
 s.selected=0;s.solo=-1;syncSelectedGeometry();
}
// Linear render targets: no sRGB conversion until the final composite.
const postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),postGeo=new T.PlaneGeometry(2,2);
const postUniforms={uLTC:{value:null},uReference:{value:null},uGlow:{value:null},uMode:{value:0},uSplit:{value:.5},uExposure:{value:s.exposure},uBloom:{value:.16}};
function quadMaterial(fragmentShader,uniforms){return new T.ShaderMaterial({vertexShader:quadVertex,fragmentShader,uniforms,depthTest:false,depthWrite:false});}
const postMat=quadMaterial(compositeFragment,postUniforms),postQuad=new T.Mesh(postGeo,postMat);postScene.add(postQuad);
const accumMat=quadMaterial(accumulationFragment,{uPrev:{value:null},uNew:{value:null},uFrames:{value:0}}),blurMat=quadMaterial(bloomFragment,{uSource:{value:null},uOffset:{value:v2()},uThreshold:{value:1}});
function target(w,h,float32=false,depth=true){return new T.WebGLRenderTarget(w,h,{type:float32?T.FloatType:T.HalfFloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:depth,stencilBuffer:false});}
const rawRT=target(ATLAS_TILE,ATLAS_TILE*MAX_LIGHTS,false,false),horizontalRT=target(ATLAS_TILE*ATLAS_LEVELS,ATLAS_TILE*MAX_LIGHTS,false,false),filterRT=target(ATLAS_TILE*ATLAS_LEVELS,ATLAS_TILE*MAX_LIGHTS,false,false);
for(const rt of [rawRT,horizontalRT,filterRT])rt.texture.minFilter=rt.texture.magFilter=T.LinearFilter;
lightUniforms.uRaw.value=rawRT.texture;lightUniforms.uFiltered.value=filterRT.texture;
const meanRT=target(1,MAX_LIGHTS,false,false);lightUniforms.uMean.value=meanRT.texture;
const meanMat=quadMaterial(meanFragment,lightUniforms);
const rawMat=quadMaterial(rawFragment,lightUniforms),filterMat=quadMaterial(prefilterFragment,{...lightUniforms,uHorizontal:{value:horizontalRT.texture},uPass:{value:0}});
function renderTextures(){
 filterMeans=0;if(!textureDirty.size)return;
 const ids=[...textureDirty].filter(id=>lights[id]&&lights[id].pattern>0);textureDirty.clear();if(!ids.length)return;filterMeans=ids.length;
 // Re-render only dirty emitter rows. Changing a parameter is never throttled.
 renderer.setScissorTest(true);postQuad.material=rawMat;renderer.setRenderTarget(rawRT);renderer.setViewport(0,0,rawRT.width,rawRT.height);
 for(const id of ids){renderer.setScissor(0,id*ATLAS_TILE,rawRT.width,ATLAS_TILE);renderer.render(postScene,postCamera);}
 renderer.setRenderTarget(meanRT);renderer.setViewport(0,0,1,MAX_LIGHTS);postQuad.material=meanMat;
 for(const id of ids){renderer.setScissor(0,id,1,1);renderer.render(postScene,postCamera);}
 postQuad.material=filterMat;renderer.setRenderTarget(horizontalRT);renderer.setViewport(0,0,horizontalRT.width,horizontalRT.height);filterMat.uniforms.uPass.value=0;filterMat.uniforms.uHorizontal.value=rawRT.texture;
 for(const id of ids){renderer.setScissor(0,id*ATLAS_TILE,ATLAS_TILE*7,ATLAS_TILE);renderer.render(postScene,postCamera);}
 renderer.setRenderTarget(filterRT);filterMat.uniforms.uPass.value=1;filterMat.uniforms.uHorizontal.value=horizontalRT.texture;
 for(const id of ids){renderer.setScissor(0,id*ATLAS_TILE,ATLAS_TILE*7,ATLAS_TILE);renderer.render(postScene,postCamera);}
 renderer.setScissorTest(false);postQuad.material=postMat;sceneDirty=true;
}
function resize(){
 const r=container.getBoundingClientRect();W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));mainWidth=s.mode==='explain'&&!s.photo?Math.floor(W*.5):W;explainWidth=W-mainWidth;
 rtWidth=Math.max(1,Math.round(mainWidth*s.quality));rtHeight=Math.max(1,Math.round(H*s.quality));renderer.setSize(W,H,false);camera.aspect=mainWidth/H;camera.updateProjectionMatrix();
 for(const rt of [rtLTC,rtSample,accA,accB,rtGlowA,rtGlowB])if(rt)rt.dispose();
 rtLTC=target(rtWidth,rtHeight);rtSample=target(rtWidth,rtHeight);accA=target(rtWidth,rtHeight,true,false);accB=target(rtWidth,rtHeight,true,false);rtLTC.samples=4;rtSample.samples=4;
 rtGlowA=target(Math.max(1,Math.ceil(rtWidth/4)),Math.max(1,Math.ceil(rtHeight/4)),false,false);rtGlowB=target(rtGlowA.width,rtGlowA.height,false,false);for(const rt of [rtGlowA,rtGlowB])rt.texture.minFilter=rt.texture.magFilter=T.LinearFilter;
 postUniforms.uLTC.value=rtLTC.texture;postUniforms.uReference.value=accA.texture;postUniforms.uGlow.value=rtGlowB.texture;refFrames=0;invalidate();updateInspectorCamera();
}
function switchMaterials(reference){for(const m of customMeshes)m.material=reference?m.userData.pair.ref:m.userData.pair.ltc;}
function renderSceneTo(rt){renderer.setRenderTarget(rt);renderer.setViewport(0,0,rt.width,rt.height);renderer.setScissorTest(false);renderer.clear();renderer.render(scene,camera);}
// Material brushes store actual surface parameters. Alpha is brush coverage.
const PAINT_SIZE=512;
function paintCanvas(){const c=document.createElement('canvas');c.width=c.height=PAINT_SIZE;return c;}
const paintColor=paintCanvas(),paintProps=paintCanvas(),paintCTX=paintColor.getContext('2d',{willReadFrequently:true}),propsCTX=paintProps.getContext('2d',{willReadFrequently:true});
const paintColorTex=new T.CanvasTexture(paintColor),paintPropsTex=new T.CanvasTexture(paintProps);for(const tx of [paintColorTex,paintPropsTex]){tx.minFilter=T.LinearMipmapLinearFilter;tx.magFilter=T.LinearFilter;tx.generateMipmaps=true;tx.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
for(const f of [floor,cleanFloor]){f.userData.pair.uniforms.uPaintEnabled.value=1;f.userData.pair.uniforms.uPaintColor.value=paintColorTex;f.userData.pair.uniforms.uPaintProps.value=paintPropsTex;}
const paintMaterials={steel:{label:'Polished steel',color:'#bfcdda',r:.065,m:1},paint:{label:'Blue paint',color:'#688caa',r:.38,m:.18},rubber:{label:'Rubber',color:'#222d38',r:.88,m:0},brushed:{label:'Brushed metal',color:'#acbcc7',r:.5,m:1},gold:{label:'Gold',color:'#d8b47a',r:.18,m:1},ceramic:{label:'Ceramic',color:'#d4dce0',r:.24,m:0}};
const paintHistory=[];let lastPaintUV=null,lastPaintProbe=null,paintCount=0;
function stashPaint(){paintHistory.push({kind:'floor',a:paintCTX.getImageData(0,0,PAINT_SIZE,PAINT_SIZE),b:propsCTX.getImageData(0,0,PAINT_SIZE,PAINT_SIZE)});if(paintHistory.length>12)paintHistory.shift();}
function paintChanged(){paintColorTex.needsUpdate=true;paintPropsTex.needsUpdate=true;paintCount++;invalidate();}
function uvAtFloor(P,f=point.mesh){const a=f===cleanFloor?40:24,b=f===cleanFloor?40:28,center=f===cleanFloor?0:1;return v2(P.x/a+.5,.5-(P.z-center)/b);}
function stampBrush(uv,radius=s.brushRadius){
 const m=paintMaterials[s.brush],f=activeFloor(),fw=f===cleanFloor?40:24,fh=f===cleanFloor?40:28;
 const x=uv.x*PAINT_SIZE,y=(1-uv.y)*PAINT_SIZE,rx=radius/fw*PAINT_SIZE,ry=radius/fh*PAINT_SIZE;
 for(const [ctx,c] of [[paintCTX,m.color],[propsCTX,`rgb(${Math.round(m.r*255)},${Math.round(m.m*255)},0)`]]){
 ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,.72,0,0,1);g.addColorStop(0,c);g.addColorStop(1,c.startsWith('#')?c+'00':`rgba(${Math.round(m.r*255)},${Math.round(m.m*255)},0,0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();}
}
function brushHit(hit){if(!isPaintFloor(hit.object))return false;lastPaintProbe={P:hit.point.clone(),N:vec(0,1,0),mesh:hit.object};const uv=hit.uv||uvAtFloor(hit.point,hit.object);
 if(lastPaintUV){const span=uv.distanceTo(lastPaintUV)*28,steps=Math.min(80,Math.max(1,Math.ceil(span/(s.brushRadius*.18))));for(let i=1;i<=steps;i++)stampBrush(lastPaintUV.clone().lerp(uv,i/steps));}else stampBrush(uv);lastPaintUV=uv.clone();paintChanged();return true;}
function stampObject(mesh){const m=paintMaterials[s.brush],old=mesh.userData.pair;if(!mesh.userData.originalPair)mesh.userData.originalPair=old;const p=materialPair(m.color,m.r,m.m,old.pattern);mesh.userData.pair=p;mesh.material=p.ltc;paintHistory.push({kind:'object',mesh,old,newPair:p});if(paintHistory.length>12)paintHistory.shift();paintCount++;invalidate();toast(mesh.name+' → '+m.label);}
function undoPaint(){const h=paintHistory.pop();if(!h){toast('Nothing to undo.');return;}if(h.kind==='floor'){paintCTX.putImageData(h.a,0,0);propsCTX.putImageData(h.b,0,0);if(h.props)for(const o of h.props){o.mesh.userData.pair=o.pair;o.mesh.userData.originalPair=o.original;o.mesh.material=o.pair.ltc;}paintChanged();}else{h.mesh.userData.pair=h.old;h.mesh.material=h.old.ltc;invalidate();}toast('Material edit undone.');}
function clearPaint(){stashPaint();paintHistory[paintHistory.length-1].props=customMeshes.filter(m=>m.userData.originalPair&&isVisible(m)).map(mesh=>({mesh,pair:mesh.userData.pair,original:mesh.userData.originalPair}));paintCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);propsCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);for(const m of customMeshes)if(m.userData.originalPair&&isVisible(m)){m.userData.pair=m.userData.originalPair;m.material=m.userData.pair.ltc;delete m.userData.originalPair;}paintChanged();}
function polishedStrip(){stashPaint();const old=s.brush;s.brush='steel';const f=activeFloor();for(let z=-2;z<=6;z+=.12)stampBrush(uvAtFloor(vec(.15,0,z),f),.7);s.brush=old;lastPaintProbe={P:vec(.15,0,clamp(reflectionPoint().z,-2,6)),N:vec(0,1,0),mesh:f};paintChanged();toast('Polished strip painted. Sweep the shield over its edges.');}
function sampleCanvasLinear(ctx,uv){
 const x=clamp(uv.x*PAINT_SIZE-.5,0,PAINT_SIZE-1),y=clamp((1-uv.y)*PAINT_SIZE-.5,0,PAINT_SIZE-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,PAINT_SIZE-1),y1=Math.min(y0+1,PAINT_SIZE-1),fx=x-x0,fy=y-y0;
 const at=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data,v=>v/255),a=at(x0,y0),b=at(x1,y0),c=at(x0,y1),d=at(x1,y1);
 return a.map((v,k)=>(v*(1-fx)+b[k]*fx)*(1-fy)+(c[k]*(1-fx)+d[k]*fx)*fy);
}
function sampleSurface(mesh,P){const u=mesh.userData.pair.uniforms;let r=u.uRoughness.value,m=u.uMetalness.value,base=u.uBase.value.clone();if(u.uPaintEnabled.value){const uv=uvAtFloor(P,mesh),a=sampleCanvasLinear(propsCTX,uv),c=sampleCanvasLinear(paintCTX,uv);r=r*(1-a[3])+a[0]*a[3];m=m*(1-a[3])+a[1]*a[3];base.lerp(new T.Color(c[0],c[1],c[2]).convertSRGBToLinear(),c[3]);}return{r:clamp(r,.04,1),m:clamp(m,0,1),base};}

const brushCursor=new T.Mesh(new T.RingGeometry(.97,1.0,64),new T.MeshBasicMaterial({color:0x9eeaf0,side:T.DoubleSide,transparent:true,opacity:.72,depthWrite:false}));brushCursor.rotation.x=-PI/2;brushCursor.visible=false;scene.add(brushCursor);

const pin=new T.Group();scene.add(pin);const pinRing=new T.Mesh(new T.RingGeometry(.055,.072,48),new T.MeshBasicMaterial({color:0x8affec,side:T.DoubleSide,depthTest:false,transparent:true,opacity:.95}));pin.add(pinRing);const pinCenter=new T.Mesh(new T.SphereGeometry(.025,12,8),new T.MeshBasicMaterial({color:0xb5ffea,depthTest:false}));pinCenter.position.z=.007;pin.add(pinCenter);const pinNormal=new T.ArrowHelper(vec(0,0,1),vec(),.5,0x72d5d7,.07,.025);pin.add(pinNormal);pin.visible=false;pin.renderOrder=99;

// CPU forms of the exact GPU lookup, local frame, clipping, and edge sum.
function sampleTable(data,r,ndv){const x=clamp(r,0,1)*63,y=Math.sqrt(Math.max(0,1-clamp(ndv,0,1)))*63,x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,63),y1=Math.min(y0+1,63),fx=x-x0,fy=y-y0;
 return [0,1,2,3].map(k=>{const a=data[(y0*64+x0)*4+k]*(1-fx)+data[(y0*64+x1)*4+k]*fx,b=data[(y1*64+x0)*4+k]*(1-fx)+data[(y1*64+x1)*4+k]*fx;return a*(1-fy)+b*fy;});}
function frameBasis(N,V){let X=V.clone().addScaledVector(N,-N.dot(V));if(X.lengthSq()<1e-8)X=(Math.abs(N.y)<.99?vec(0,1,0):vec(1,0,0)).cross(N);X.normalize();const Y=N.clone().cross(X);return new T.Matrix3().set(X.x,X.y,X.z,Y.x,Y.y,Y.z,N.x,N.y,N.z);}
function matrixAt(r,ndv){const m=sampleTable(table1,r,ndv);return new T.Matrix3().set(m[0],0,m[2],0,1,0,m[1],0,m[3]);}
function clipPolygon(poly){const out=[];if(!poly.length)return out;for(let i=0;i<poly.length;i++){const a=poly[(i+poly.length-1)%poly.length],b=poly[i],ia=a.z>0,ib=b.z>0;if(ia!==ib)out.push(a.clone().lerp(b,clamp(a.z/(a.z-b.z),0,1)));if(ib)out.push(b.clone());}return out;}
function edgeSum(poly){const clipped=clipPolygon(poly);const edge=[],n=clipped.length;let total=0;if(n<3)return{E:0,edges:[],poly:clipped,total:0};for(let i=0;i<n;i++){const a=clipped[i].clone().normalize(),b=clipped[(i+1)%n].clone().normalize(),c=a.clone().cross(b),sn=c.length(),co=clamp(a.dot(b),-1,1);const e=sn>1e-8?Math.atan2(sn,co)*c.z/sn/TAU:0;edge.push(e);total+=e;}const sign=total<0?-1:1;return{E:clamp(Math.abs(total),0,1),edges:edge.map(e=>e*sign),poly:clipped,total};}
function cpuPoint(){const P=point.P,N=point.N.clone(),V=camera.position.clone().sub(P).normalize();if(N.dot(V)<0)N.negate();const ndv=Math.max(.000001,N.dot(V)),r=sampleSurface(point.mesh,P).r,F=frameBasis(N,V),inv=matrixAt(r,ndv),amp=sampleTable(table2,r,ndv),local=worldVerts.map(v=>v.clone().sub(P).applyMatrix3(F));const transformed=local.map(v=>v.clone().applyMatrix3(inv));return{P,N,V,ndv,r,F,inv,amp,local,transformed,result:edgeSum(transformed),vl:V.clone().applyMatrix3(F)};}
// Figure 4-inspired inspector. It displays the real matrix and real pinned polygon.
const inspectScene=new T.Scene();inspectScene.background=new T.Color('#0b1420');const inspectCamera=new T.PerspectiveCamera(44,1,.01,50);inspectCamera.up.set(0,0,1);let inspectTheta=-1.0,inspectPhi=1.05,inspectDistance=6.8;
const densityUniforms={uInv:{value:new T.Matrix3()},uPeak:{value:1}};
const densityMat=new T.ShaderMaterial({vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:sphereDensityFragment,uniforms:densityUniforms,transparent:true,depthWrite:true});
const heatSphere=new T.Mesh(new T.SphereGeometry(1,96,64),densityMat);inspectScene.add(heatSphere);
const wire=new T.LineSegments(new T.WireframeGeometry(new T.SphereGeometry(1.008,24,16)),new T.LineBasicMaterial({color:0x97c3d5,transparent:true,opacity:.075,depthWrite:false}));inspectScene.add(wire);
const circlePts=Array.from({length:129},(_,i)=>vec(Math.cos(i*TAU/128)*1.14,Math.sin(i*TAU/128)*1.14,0));
const horizon=new T.Line(new T.BufferGeometry().setFromPoints(circlePts),new T.LineBasicMaterial({color:0x68bfcf,transparent:true,opacity:.7}));inspectScene.add(horizon);
const horizonDisc=new T.Mesh(new T.CircleGeometry(1.14,96),new T.MeshBasicMaterial({color:0x7cb7cb,transparent:true,opacity:.045,side:T.DoubleSide,depthWrite:false}));inspectScene.add(horizonDisc);
const dyn=new T.Group();inspectScene.add(dyn);const normalArrow=new T.ArrowHelper(vec(0,0,1),vec(),1.48,0x83c6ff,.09,.035);inspectScene.add(normalArrow);const viewArrow=new T.ArrowHelper(vec(.5,0,.7).normalize(),vec(),1.48,0xe4eaf0,.09,.035);inspectScene.add(viewArrow);
const zLabel=labelSprite('+Z','#8ac4ef',12);zLabel.position.set(0,0,1.67);zLabel.scale.set(.6,.15,1);inspectScene.add(zLabel);const viewLabel=labelSprite('V','#d1d9e1',13);viewLabel.scale.set(.28,.14,1);inspectScene.add(viewLabel);
const sampleSeeds=Array.from({length:256},(_,i)=>{const u=(i+.5)/256;let bits=i,rev=0,f=.5;while(bits){rev+=(bits&1)*f;bits>>=1;f*=.5;}return vec(Math.sqrt(u)*Math.cos(TAU*rev),Math.sqrt(u)*Math.sin(TAU*rev),Math.sqrt(1-u));});
const matCache=new Map();function lineMat(c,opacity=1){const k=c+':'+opacity;if(!matCache.has(k))matCache.set(k,new T.LineBasicMaterial({color:c,transparent:opacity<1,opacity,depthTest:false,depthWrite:false}));return matCache.get(k);}
const warmFill=new T.MeshBasicMaterial({color:0xffc383,side:T.DoubleSide,transparent:true,opacity:.12,depthWrite:false,depthTest:false});
const dotMat=new T.PointsMaterial({size:.028,color:0x6cd5e1,transparent:true,opacity:.72,depthTest:false,depthWrite:false});const missMat=new T.PointsMaterial({size:.014,color:0xabc1d5,transparent:true,opacity:.19,depthTest:false,depthWrite:false});
function clearDynamic(){dyn.traverse(o=>{if(o.geometry)o.geometry.dispose();});dyn.clear();}
function addLine(points,col,opacity=1,loop=false){if(points.length<2)return;let l=new (loop?T.LineLoop:T.Line)(new T.BufferGeometry().setFromPoints(points),lineMat(col,opacity));dyn.add(l);return l;}
function addSegments(points,col,opacity=1){if(!points.length)return;dyn.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points),lineMat(col,opacity)));}
function projectArc(a,b,r=1.025){const points=[];for(let j=0;j<=24;j++){const p=a.clone().lerp(b,j/24);if(p.lengthSq()<1e-15)continue;points.push(p.normalize().multiplyScalar(r));}return points;}
function rayHitsLocal(L,poly){const ray=new T.Ray(vec(),L);for(const tr of triangles){if(ray.intersectTriangle(poly[tr[0]],poly[tr[1]],poly[tr[2]],false,vec()))return true;}return false;}
let latestPoint=null,highlightEdge=-1;
function rebuildInspector(){
 dirtyInspector=false;if(!worldVerts.length)return;
 const d=cpuPoint();latestPoint=d;const A=new T.Matrix3();A.elements=A.elements.map((v,i)=>v*(1-s.morph)+d.inv.elements[i]*s.morph);
 const invA=A.clone().invert(),currentInv=d.inv.clone().multiply(invA);densityUniforms.uInv.value.copy(currentInv);
 let peak=1/PI;const M=d.inv.clone().invert(),hitPoints=[],missPoints=[],hitLines=[];let hits=0,hitsAfter=0;
 const rawCurrent=d.local.map(p=>p.clone().applyMatrix3(A));
 for(const seed of sampleSeeds){const original=seed.clone().applyMatrix3(M).normalize(),dir=original.clone().applyMatrix3(A).normalize(),hit=rayHitsLocal(original,d.local);if(hit)hits++;
  if(rayHitsLocal(dir,rawCurrent))hitsAfter++;
  const q=dir.clone().applyMatrix3(currentInv),ds=q.z>0?q.z*Math.abs(currentInv.determinant())/(PI*q.lengthSq()**2):0;peak=Math.max(peak,ds);
  if(hit){hitPoints.push(dir.clone().multiplyScalar(1.036));if(hits%3===0)hitLines.push(vec(),dir.clone().multiplyScalar(1.03));}else missPoints.push(dir.clone().multiplyScalar(1.032));
 }
 densityUniforms.uPeak.value=peak;
 clearDynamic();const maxR=Math.max(...rawCurrent.map(p=>p.length())),displayScale=2.4/Math.max(maxR,1e-5);let shown=rawCurrent;const doClip=s.step>=2&&s.morph>.999;
 if(doClip)shown=clipPolygon(rawCurrent);
 // Fill with the real, non-overlapping emitter triangulation. Clip each
 // triangle separately so disconnected concave remnants cannot become a fan.
 const positions=[];
 for(const tr of triangles){let poly=tr.map(i=>rawCurrent[i].clone());if(doClip)poly=clipPolygon(poly);for(let j=1;j+1<poly.length;j++)for(const v of [poly[0],poly[j],poly[j+1]])positions.push(...v.clone().multiplyScalar(displayScale).toArray());}
 if(positions.length){let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));dyn.add(new T.Mesh(g,warmFill));}
 addLine(rawCurrent.map(p=>p.clone().multiplyScalar(displayScale)),doClip?0x8c5948:0xffc383,doClip?.35:.94,true);
 if(doClip)addLine(shown.map(p=>p.clone().multiplyScalar(displayScale)),0xffc383,1,true);
 const rays=[];for(const p of shown)rays.push(vec(),p.clone().multiplyScalar(displayScale));addSegments(rays,0xe8c7a3,.15);
 for(let i=0;i<shown.length;i++){let c=0x7bd7e4;if(s.step===3&&doClip)c=(d.result.edges[i]||0)<0?0x75cbdc:0xffc383;if(i===highlightEdge)c=0xffffff;addLine(projectArc(shown[i],shown[(i+1)%shown.length]),c,.95);}
 if(s.rays){if(hitPoints.length)dyn.add(new T.Points(new T.BufferGeometry().setFromPoints(hitPoints),dotMat));if(missPoints.length)dyn.add(new T.Points(new T.BufferGeometry().setFromPoints(missPoints),missMat));addSegments(hitLines,0x70d4dd,.12);}
 const nn=vec(0,0,1),vv=d.vl.clone().applyMatrix3(A).normalize();normalArrow.setDirection(nn);viewArrow.setDirection(vv);zLabel.position.copy(nn).multiplyScalar(1.7);viewLabel.position.copy(vv).multiplyScalar(1.66);
 pin.position.copy(d.P).addScaledVector(d.N,.01);pin.quaternion.setFromUnitVectors(vec(0,0,1),d.N);
 $('pointName').textContent=point.mesh.name;$('pointAngle').textContent=(Math.acos(clamp(d.ndv,0,1))*180/PI).toFixed(1)+'°';$('pointRoughness').textContent=d.r.toFixed(3)+' / '+(d.r*d.r).toFixed(3);$('pointIntegral').textContent=d.result.E.toFixed(5);$('pointMagnitude').textContent=d.amp[0].toFixed(5);
 $('integralValue').textContent='E = '+d.result.E.toFixed(5);$('rayCount').textContent=`${hits} / 256 rays hit before = ${hitsAfter} / 256 after · same intersections`;
 const m=d.inv.elements;$('matrix').innerHTML=[0,3,6,1,4,7,2,5,8].map(i=>`<span>${Math.abs(m[i])<1e-9?'0':m[i].toFixed(4)}</span>`).join('');
 const maxEdge=Math.max(.001,...d.result.edges.map(Math.abs));$('edgeRows').innerHTML=d.result.edges.map((v,i)=>`<div class="edgeRow" data-edge="${i}"><span>e${i+1}</span><div class="edgeTrack"><div class="edgeBar ${v<0?'negative':''}" style="width:${Math.abs(v)/maxEdge*100}%"></div></div><span class="mono" style="text-align:right">${v>=0?'+':''}${v.toFixed(5)}</span></div>`).join('');
 window.__LTC.lastInvariant={hits,hitsAfter,integral:d.result.E,determinant:d.inv.determinant(),roughness:d.r};
}
function updateInspectorCamera(){if(typeof inspectCamera==='undefined')return;const controlsHeight=$('explainControls').getBoundingClientRect().height||208;const usable=Math.max(100,H-controlsHeight);inspectCamera.aspect=Math.max(1,explainWidth)/usable;inspectCamera.position.set(inspectDistance*Math.sin(inspectPhi)*Math.cos(inspectTheta),inspectDistance*Math.sin(inspectPhi)*Math.sin(inspectTheta),inspectDistance*Math.cos(inspectPhi));inspectCamera.lookAt(0,0,.16);inspectCamera.updateProjectionMatrix();}

// Light toys. Geometry and radiance always follow the same simulated transform.
const projectileGeo=new T.SphereGeometry(.065,10,8),sparkGeo=new T.SphereGeometry(.018,5,4),projectileMat=new T.MeshBasicMaterial({color:new T.Color(3.0,1.55,.55)}),sparkMat=new T.MeshBasicMaterial({color:new T.Color(2,3.2,3.5)});
const projectiles=[],sparks=[];let audio=null;
function tone(frequency,duration=.12,volume=.025,fall=80){if(!s.sound)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,audio.currentTime);o.frequency.exponentialRampToValueAtTime(fall,audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
function ensureLive(){if(s.mode!=='playground')setMode('playground');if(s.frozen){s.frozen=false;syncGlobalUI();}}
function releaseCharge(){if(!shield.charging)return;shield.charging=false;const l=lights[0],power=.45+shield.charge*1.9;l.pulse=Math.max(l.pulse,power*3.4);l.hitAge=0;l.hitUV.set(.5,.5);l.hitStrength=power*1.5;shield.recoil=.07+shield.charge*.1;shield.charge=0;textureDirty.add(0);updateLight(l);tone(190+power*80,.38,.035,43);}
function startCharge(){ensureLive();shield.deployed=true;lights[0].enabled=true;shield.charging=true;shield.charge=0;syncGlobalUI();}
function holdShield(){ensureLive();shield.held=!shield.held;shield.deployed=true;lights[0].enabled=true;syncGlobalUI();toast(shield.held?'Shield held. Look around; F drops it.':'Shield left in the world.');}
function toggleDeploy(){ensureLive();shield.deployed=!shield.deployed;if(shield.deployed)lights[0].enabled=true;shield.charging=false;syncGlobalUI();tone(shield.deployed?210:115,.24,.022,shield.deployed?550:45);}
function fireProjectile(){ensureLive();const l=lights[0];if(!shield.deployed){shield.deployed=true;l.enabled=true;}
 const g=lightGPU[0],origin=launcher.localToWorld(vec(0,.35,.72)),target=l.position.clone().addScaledVector(g.U,(Math.random()-.5)*l.width*.38).addScaledVector(g.V,(Math.random()-.5)*l.height*.33);
 const mesh=new T.Mesh(projectileGeo,projectileMat);mesh.position.copy(origin);scene.add(mesh);projectiles.push({mesh,velocity:target.sub(origin).normalize().multiplyScalar(15),age:0});
 if(projectiles.length>24)scene.remove(projectiles.shift().mesh);tone(530,.075,.025,115);}
function impactShield(P,strength=1){const l=lights[0],g=lightGPU[0],d=P.clone().sub(l.position);l.hitUV.set(dotSafe(d,g.U)/g.size.x+.5,dotSafe(d,g.V)/g.size.y+.5);l.hitAge=0;l.hitStrength=strength;l.pulse=Math.max(l.pulse,.7*strength);shield.recoil=.12;shield.impacts++;textureDirty.add(0);updateLight(l);
 for(let i=0;i<16;i++){const m=new T.Mesh(sparkGeo,sparkMat);m.position.copy(P).addScaledVector(g.N,.02);scene.add(m);sparks.push({mesh:m,velocity:g.U.clone().multiplyScalar((Math.random()-.5)*3).addScaledVector(g.V,(Math.random()-.5)*3).addScaledVector(g.N,Math.random()*2),life:.35+Math.random()*.4});}
 while(sparks.length>180)scene.remove(sparks.shift().mesh);tone(850,.13,.023,120);}
function dotSafe(a,b){return a.dot(b);}
function shieldCollision(a,b){
 const l=lights[0],g=lightGPU[0];if(!l.enabled||shield.open<.5)return null;
 const da=a.clone().sub(l.position).dot(g.N),db=b.clone().sub(l.position).dot(g.N);if(da*db>0||Math.abs(da-db)<1e-10)return null;
 const p=a.clone().lerp(b,da/(da-db)),d=p.clone().sub(l.position),q=v2(d.dot(g.U)/g.size.x,d.dot(g.V)/g.size.y);return inside2D(q,l.outline)?p:null;
}
function inside2D(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c;}return c;}
function throwDisc(direction=null){beginDiscTrail();ensureLive();const l=lights[3],f=(direction||camera.getWorldDirection(vec())).clone().normalize();l.enabled=true;s.solo=s.solo===3?3:s.solo;l.position.copy(camera.position).addScaledVector(f,1.4).add(vec(0,-.25,0));disc.velocity.copy(f).multiplyScalar(s.throwPower);disc.velocity.y+=1.6;disc.omega.set(4.5,9.5,2.2);disc.mode='flight';disc.age=0;disc.bounces=0;l.rotation.copy(camera.rotation);updateLight(l);syncGlobalUI();tone(330,.2,.03,105);}
function recallDisc(){ensureLive();lights[3].enabled=true;disc.mode='recall';syncGlobalUI();tone(160,.25,.024,580);}
function suspendDisc(){if(disc.mode==='suspended'){disc.mode=disc.resumeMode==='parked'?'flight':disc.resumeMode;ensureLive();}else{disc.resumeMode=disc.mode;disc.mode='suspended';}syncGlobalUI();invalidate();}
function parkDisc(){disc.trailLast=null;ensureLive();const l=lights[3];l.position.copy(camera.position).addScaledVector(camera.getWorldDirection(vec()),3);l.position.y=.15;l.position.x=clamp(l.position.x,-7.5,7.5);l.position.z=clamp(l.position.z,-5.5,8.8);l.rotation.set(-PI/2,0,0,'YXZ');disc.velocity.set(0,0,0);disc.mode='parked';l.enabled=true;updateLight(l);syncGlobalUI();}
function stepDisc(dt){
 const l=lights[3];if(!l)return;
 if(disc.mode==='rolling'){stepRollingDisc(dt);return;}
 if(disc.mode==='recall'||disc.mode==='held'){
  const f=camera.getWorldDirection(vec()),right=vec(1,0,0).applyQuaternion(camera.quaternion),up=vec(0,1,0).applyQuaternion(camera.quaternion),dest=camera.position.clone().addScaledVector(f,1.8).addScaledVector(right,.65).addScaledVector(up,-.48);
  if(disc.mode==='held')l.position.lerp(dest,1-Math.exp(-dt*18));else{l.position.lerp(dest,1-Math.exp(-dt*7));if(l.position.distanceTo(dest)<.12){disc.mode='held';syncGlobalUI();}}
  l.rotation.x+=dt*1.4;l.rotation.y+=dt*3;updateLight(l);return;
 }
 if(disc.mode!=='flight')return;
 disc.age+=dt;const steps=Math.max(1,Math.ceil(dt/(1/120))),h=dt/steps;
 for(let k=0;k<steps;k++){
  const old=l.position.clone();disc.velocity.y-=9.8*h;l.position.addScaledVector(disc.velocity,h);
  for(const [axis,lo,hi] of [['x',-8,8],['z',-5.9,9.6]]){if(l.position[axis]<lo||l.position[axis]>hi){l.position[axis]=clamp(l.position[axis],lo,hi);disc.velocity[axis]*=-.67;disc.bounces++;}}
  // Coarse prop bounds are intentionally exposed as toy physics, not a rigid-body engine.
  if(s.scene==='bay')for(const c of colliders){const r=.22;if(l.position.x>c.min.x-r&&l.position.x<c.max.x+r&&l.position.z>c.min.z-r&&l.position.z<c.max.z+r&&l.position.y>c.min.y-r&&l.position.y<c.max.y+r){
   const faces=[['x',c.min.x-r],['x',c.max.x+r],['y',c.min.y-r],['y',c.max.y+r],['z',c.min.z-r],['z',c.max.z+r]];faces.sort((a,b)=>Math.abs(old[a[0]]-a[1])-Math.abs(old[b[0]]-b[1]));const [axis,pos]=faces[0];l.position[axis]=pos;disc.velocity[axis]*=-.6;disc.bounces++;}}
  const q=new T.Quaternion().setFromEuler(l.rotation),n=vec(0,0,1).applyQuaternion(q),clearance=.11+.42*Math.sqrt(Math.max(0,1-n.y*n.y));
  if(l.position.y<clearance){l.position.y=clearance;leaveDiscTrail(old,l.position,.16);if(disc.velocity.y<-.6){disc.velocity.y*=-.61;disc.velocity.x*=.88;disc.velocity.z*=.88;disc.omega.multiplyScalar(.7);disc.bounces++;tone(160+Math.random()*60,.075,.013,60);}else{disc.velocity.y=0;disc.velocity.x*=Math.exp(-h*3);disc.velocity.z*=Math.exp(-h*3);disc.omega.multiplyScalar(Math.exp(-h*5));l.rotation.x=T.MathUtils.lerp(l.rotation.x,-PI/2,1-Math.exp(-h*5));l.rotation.z*=Math.exp(-h*5);}}
  if(l.position.y>clearance+.002)disc.trailLast=null;
  const speed=disc.omega.length();if(speed>.005){q.multiply(new T.Quaternion().setFromAxisAngle(disc.omega.clone().normalize(),speed*h));l.rotation.setFromQuaternion(q,'YXZ');}
 }
 if(disc.age>1&&disc.velocity.length()<.15&&l.position.y<.6){disc.mode='parked';l.position.y=.12;l.rotation.set(-PI/2,0,0,'YXZ');disc.velocity.set(0,0,0);syncGlobalUI();}
 if(disc.age>30||l.position.y<-.5||l.position.length()>60){disc.mode='parked';l.position.set(3.8,.15,2.1);l.rotation.set(-PI/2,0,0);disc.velocity.set(0,0,0);}
 updateLight(l);
}
function simulate(dt){
 if(s.frozen||s.mode==='compare')return;dt*=s.slow?.2:1;simTime+=dt;stepWorkshop(dt);stepExhibit(dt);
 const l=lights[0];let shieldChanged=false;
 const goal=shield.deployed?1:0,old=shield.open;shield.open+=(goal-shield.open)*(1-Math.exp(-dt*9));if(Math.abs(goal-shield.open)<.002)shield.open=goal;
 if(old!==shield.open){l.scale=shield.open;shieldChanged=true;}
 if(shield.charging){shield.charge=Math.min(1,shield.charge+dt*.7);l.pulse=.1+shield.charge*1.4;shieldChanged=true;}
 if(shield.held){const f=camera.getWorldDirection(vec()),right=vec(1,0,0).applyQuaternion(camera.quaternion),up=vec(0,1,0).applyQuaternion(camera.quaternion),dest=camera.position.clone().addScaledVector(f,3.4).addScaledVector(right,1.15).addScaledVector(up,-.45);
 l.position.lerp(dest,1-Math.exp(-dt*14));l.position.y=Math.max(l.height*.5+.12,l.position.y);l.rotation.setFromQuaternion(camera.quaternion,'YXZ');l.rotation.y-=.12;l.rotation.z-=.055;shieldChanged=true;}
 if(shield.recoil>.001){shield.recoil*=Math.exp(-dt*8);if(shield.held)l.position.addScaledVector(camera.getWorldDirection(vec()),-shield.recoil);shieldChanged=true;}
 if(shieldChanged)updateLight(l);
 if(shield.autoFire){shield.nextShot-=dt;if(shield.nextShot<=0){shield.nextShot=.85;fireProjectile();}}
 // The launcher aim and muzzle now share a transform; see stepLauncher().
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],old=p.mesh.position.clone();p.mesh.position.addScaledVector(p.velocity,dt);p.age+=dt;const hit=shieldCollision(old,p.mesh.position);if(hit){impactShield(hit);scene.remove(p.mesh);projectiles.splice(i,1);}else if(p.age>2.5){scene.remove(p.mesh);projectiles.splice(i,1);}sceneDirty=true;}
 for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt;p.velocity.y-=dt*2;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.min(1,p.life*4));if(p.life<=0){scene.remove(p.mesh);sparks.splice(i,1);}sceneDirty=true;}
 stepDisc(dt);if(trailDirty){trailDirty=false;paintChanged();}
 for(const light of lights)if(light){let changed=false,tex=false;
  if(light.spin){light.rotation.y+=dt*.28;light.rotation.z+=dt*.11;changed=true;}
  if(light.pattern>0&&s.animateTextures&&light.enabled&&(s.solo<0||s.solo===light.id)){light.phase+=dt;tex=true;}
  if(light.hitAge>=0){light.hitAge+=dt;if(light.hitAge>2)light.hitAge=-1;tex=true;}
  if(light.pulse>.0001&&!(light.id===0&&shield.charging)){light.pulse*=Math.exp(-dt*5);if(light.pulse<.002)light.pulse=0;changed=true;}
  if(tex){textureDirty.add(light.id);changed=true;}
  if(changed)updateLight(light);
 }
 $('chargeFill').style.width=(shield.charge*100)+'%';
}
// UI: selected-tool controls; diagnostics live behind Explain, Compare and Settings.
const bindings=new Map();
function range(parent,key,label,min,max,step,format=v=>Number(v).toFixed(2),scope='light'){
 const root=document.createElement('div');root.className='field';root.innerHTML=`<label for="param-${key}"><span>${label}</span><output id="value-${key}"></output></label><input type="range" id="param-${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}">`;$(parent).appendChild(root);
 const input=$('param-'+key);bindings.set(key,{input,format,scope});input.addEventListener('input',()=>{const v=Number(input.value);if(scope==='light')setLightParam(key,v);else{s[key]=v;if(key==='floorR'){activeFloor().userData.pair.uniforms.uRoughness.value=v;invalidate();}if(key==='exposure')postUniforms.uExposure.value=v;}syncField(key);});
}
function lightParam(key){const l=selectedLight();if(!l)return 0;if(['x','y','z'].includes(key))return l.position[key];if(['yaw','pitch','roll'].includes(key))return l.rotation[{yaw:'y',pitch:'x',roll:'z'}[key]]*180/PI;return l[key];}
function setLightParam(key,v){const l=selectedLight();if(!l)return;if(l.id===1&&['x','y','z','yaw','pitch','roll'].includes(key))workshop.scan=false;if(['x','y','z'].includes(key)){l.position[key]=v;if(l.id===0)shield.held=false;if(l.id===3)disc.mode='suspended';}else if(['yaw','pitch','roll'].includes(key)){l.rotation[{yaw:'y',pitch:'x',roll:'z'}[key]]=rad(v);if(l.id===0)shield.held=false;}else l[key]=v;textureDirty.add(l.id);updateLight(l);syncGlobalUI();}
function syncField(key){const b=bindings.get(key);if(!b)return;const v=b.scope==='light'?lightParam(key):s[key];b.input.value=v;$('value-'+key).textContent=b.format(v);}
range('lightFields','intensity','Radiance',0,24,.1,v=>v.toFixed(1));range('lightFields','width','Width',.25,6,.02,v=>v.toFixed(2)+' m');range('transformFields','height','Height',.25,6,.02,v=>v.toFixed(2)+' m');
for(const [key,label,min,max] of [['x','Position X',-8,8],['y','Position Y',.05,7],['z','Position Z',-6,10]])range('transformFields',key,label,min,max,.02,v=>v.toFixed(2)+' m');
for(const [key,label] of [['yaw','Yaw'],['pitch','Tilt'],['roll','Roll']])range('transformFields',key,label,-180,180,.5,v=>v.toFixed(1)+'°');
s.floorR=.32;range('displayFields','exposure','Exposure',.25,2.5,.01,v=>v.toFixed(2),'global');range('displayFields','floorR','Unpainted floor roughness',.04,1,.005,v=>v.toFixed(3),'global');
function syncGlobalUI(){
 $('freezeBtn').disabled=s.mode!=='playground';$('freezeBtn').textContent=s.mode!=='playground'?'Frozen':s.frozen?'Resume':'Freeze';$('freezeBtn').classList.toggle('active',s.frozen);$('slowBtn').classList.toggle('active',s.slow);$('slowBtn').textContent=s.slow?'Slow · 20%':'Slow motion';
 $('holdShield').textContent=shield.held?'Drop shield':'Hold shield';$('holdShield').classList.toggle('active',shield.held);$('deployShield').textContent=shield.deployed?'Retract':'Deploy';$('autoFire').textContent=shield.autoFire?'Launcher on':'Launcher off';$('autoFire').classList.toggle('active',shield.autoFire);
 $('shieldState').textContent=!shield.deployed?'Retracted':shield.held?'Held · F drops it':'Deployed in the bay';$('discState').textContent=({parked:'Parked · ready to roll',rolling:'Rolling · editing the finish',flight:'Flying · '+disc.bounces+' bounces',recall:'Returning to you',held:'Held · click to throw',suspended:'Suspended in midair'})[disc.mode];$('freezeDisc').textContent=disc.mode==='suspended'?'Release':'Suspend';
 $('worldState').textContent=(s.frozen?'FROZEN':s.slow?'SLOW · 20%':'LIVE')+' · UN-SHADOWED';$('modeState').style.display=s.frozen&&s.mode!=='compare'?'block':'none';$('modeState').textContent=s.mode==='explain'?'Time is frozen for inspection. Return to Workshop to resume.':'Time is frozen. Camera, lights and materials remain editable. Press P to resume.';
 $('shieldSolo').classList.toggle('active',s.solo===0);$('discSolo').classList.toggle('active',s.solo===3);$('soloLight').classList.toggle('active',s.solo===s.selected);$('soloLight').textContent=s.solo===s.selected?'Unsolo':'Solo';
 syncWorkshopUI();$('shieldSize').value=lights[0]?.width||2.5;$('shieldSizeValue').textContent=(lights[0]?.width||2.5).toFixed(2)+' m';$('shieldPattern').value=String(lights[0]?.pattern||0);
 $('pauseReference').textContent=s.paused?'Resume':'Pause';$('studioFill').checked=s.fill;$('bloom').checked=s.bloom;$('animateTextures').checked=s.animateTextures;$('quality').value=String(s.quality);$('sceneSelect').value=s.scene;
}
function syncLightUI(){const l=selectedLight();if(!l)return;for(const k of bindings.keys())syncField(k);$('selectedName').textContent=l.name;$('lightColor').value=l.color;$('lightPattern').value=String(l.pattern);$('twoSided').checked=l.twoSided;$('spinLight').classList.toggle('active',l.spin);$('spinLight').textContent=l.spin?'Stop spin':'Spin';$('shapeName').textContent=l.name;$('shapePreset').value=l.shape;$('probeLight').value=String(l.id);$('removeLight').disabled=l.id===0||l.id===3;$('duplicateLight').disabled=lights.every(Boolean);syncGlobalUI();}
function refreshLightList(){
 $('lightBudget').textContent=lights.filter(Boolean).length+' / '+MAX_LIGHTS;$('lightList').innerHTML='';$('probeLight').innerHTML='';
 for(const l of lights)if(l){const row=document.createElement('div');row.className='lightRow';row.innerHTML=`<button class="selectLight ${s.selected===l.id?'active':''}" data-id="${l.id}"><span class="lightDot" style="background:${l.color}"></span>${l.name}</button><button class="muteLight ${l.enabled?'active':''}" data-toggle="${l.id}">${l.enabled?'On':'Off'}</button>`;$('lightList').appendChild(row);row.querySelector('[data-id]').onclick=()=>selectLight(l.id);row.querySelector('[data-toggle]').onclick=()=>{l.enabled=!l.enabled;updateLight(l);refreshLightList();syncGlobalUI();};const option=document.createElement('option');option.value=l.id;option.textContent=l.name;$('probeLight').appendChild(option);}
 $('probeLight').value=s.selected;
}
function selectLight(id){if(!lights[id])return;s.selected=id;syncSelectedGeometry();refreshLightList();syncLightUI();resetSculptor();dirtyInspector=true;}
function solo(id=s.selected){s.solo=s.solo===id?-1:id;updateAllLights();syncGlobalUI();toast(s.solo<0?'All enabled emitters restored.':'Solo: '+lights[id].name);}
function duplicateLight(){const id=lights.findIndex(l=>!l);if(id<0){toast('Five-light budget reached. Remove a fixture first.');return;}const l=selectedLight();makeLight(id,{name:l.name+' copy',shape:l.shape,outline:l.outline,width:l.width,height:l.height,position:l.position.clone().add(vec(.7,.15,.2)),rotation:l.rotation.clone(),intensity:l.intensity,color:l.color,twoSided:l.twoSided,pattern:l.pattern,phase:l.phase});selectLight(id);toast('Emitter duplicated.');}
function removeLight(){const l=selectedLight();if(l.id===0||l.id===3){toast('The shield and disc are reserved toys. Toggle them off instead.');return;}emitterRoot.remove(l.root);l.root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});lights[l.id]=null;lightGPU[l.id].count=0;lightGPU[l.id].radiance.set(0,0,0);textureDirty.add(l.id);if(s.solo===l.id)s.solo=-1;selectLight(0);updateAllLights();toast('Fixture removed.');}
const toolHints={workshop:'Drag to orbit · paint a finish · roll a trail · right-drag look · WASD move',shield:'Drag light · Alt-drag tilt · Space charge · F hold/drop · right-drag look · WASD move',disc:'Click scene to throw · R recall · G suspend · right-drag look · WASD move',paint:'Drag floor to brush · click prop to stamp · wheel brush size · right-drag look',lights:'Drag an emitter to move · Alt-drag to tilt · click a surface to inspect',shape:'Drag outline vertices · live analytic lighting · right-drag scene to look',probe:'Click a surface to pin · select an emitter · drag the inspector to orbit'};
function setTool(tool){if(!toolHints[tool])return;s.tool=tool;$$('.toolPane').forEach(p=>p.classList.toggle('visible',p.dataset.tool===tool));$$('.tools button').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('toolHint').textContent=toolHints[tool];document.body.dataset.tool=tool;brushCursor.visible=false;lastPaintUV=null;
 if(tool==='workshop')syncWorkshopUI();if(tool==='shield')selectLight(0);if(tool==='disc')selectLight(3);if(tool==='shape')resetSculptor();if(tool==='lights')refreshLightList();syncLightUI();
}
function setMode(mode){if(!['playground','explain','compare'].includes(mode))return;const old=s.mode;s.mode=mode;document.body.dataset.mode=mode;for(const m of ['playground','explain','compare'])$('mode-'+m).classList.toggle('active',m===mode);
 if(old==='playground'&&mode!=='playground'){diagnosticResume={frozen:s.frozen,tool:s.tool};setSurfaceView(0);}
 if(mode==='compare'||mode==='explain'){s.frozen=true;shield.charging=false;keys.clear();if(mode==='explain')setTool('probe');else setTool('lights');}
 if(mode==='playground'&&old!=='playground'){s.frozen=diagnosticResume.frozen;setTool(diagnosticResume.tool==='probe'?'workshop':diagnosticResume.tool);}else if(mode==='playground'&&s.tool==='probe')setTool('workshop');pin.visible=mode==='explain';brushCursor.visible=false;
 $('sceneTitle').textContent=mode==='explain'?'Follow this pixel.':s.scene==='bay'?'Light meets material.':'One polygon. Every highlight.';
 $('sceneHint').textContent=mode==='explain'?'Click a surface. Inspect one emitter.':'Paint a finish. Let the light reveal it.';
 updateCompareUI();syncGlobalUI();resize();if(old!==mode&&mode==='compare')toast('Simulation and emission textures frozen for a fair comparison.');
}
function updateCompareUI(){const cmp=s.mode==='compare';$('splitDivider').style.display=cmp&&s.compareView==='split'?'block':'none';$('ltcLabel').style.display=cmp&&s.compareView==='split'?'block':'none';$('refLabel').style.display=cmp?'block':'none';$('errorLegend').style.display=cmp&&s.compareView==='error'?'block':'none';$('splitDivider').style.left=(s.split*100)+'%';for(const v of ['split','error','reference'])$('view-'+v).classList.toggle('active',s.compareView===v);postUniforms.uMode.value=!cmp?0:s.compareView==='error'?2:s.compareView==='reference'?3:1;postUniforms.uSplit.value=s.split;}
const captions=[['The fitted distribution','View direction and roughness select the GGX fit. Orange is the selected emitter; cyan is its spherical projection.'],['Warp the polygon, not the integral','M⁻¹ transforms directions and the polygon together. The fitted lobe becomes a simple cosine.'],['Clip to the cosine hemisphere','Remove the part below z = 0, then normalize the surviving vertex directions.'],['Add the signed edges','Sum the oriented spherical edges. Concave notches subtract; the integral is analytic for this LTC.']];
function setStep(n){s.step=n;$$('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===n));$('inspectTitle').textContent=captions[n][0];$('stepCaption').textContent=captions[n][1];if(n===0){s.morph=0;morphGoal=null;}else if(n===1)morphGoal=1;else{s.morph=1;morphGoal=null;}if(n===3)$('matrixDetails').open=true;syncMorph();dirtyInspector=true;}
function syncMorph(){$('morphRange').value=s.morph;$('morphValue').textContent=Math.round(s.morph*100)+'%';$('animateTransform').textContent=s.morph>.5?'Undo M⁻¹':'Apply M⁻¹';}
const bookmarks={home:{pos:[9.8,6.4,12.3],target:[-.05,1.95,-1.6]},shield:{pos:[3.65,3.55,8.0],target:[.1,1.35,.2]},machine:{pos:[-.3,3.25,-.15],target:[-3.55,1.35,-2.35]},helmet:{pos:[5.6,3.05,3.2],target:[3.05,1.8,-.78]},wall:{pos:[.6,3.15,.65],target:[.6,1.9,-5.66]},screen:{pos:[6.8,3.6,7],target:[2.0,2.0,-2.7]}};
let cameraTween=null;
function cameraBookmark(name,instant=false){const b=bookmarks[name]||bookmarks.home;const p=s.scene==='clean'&&name==='home'?{pos:[7,5.4,11.5],target:[0,1,-.7]}:b;
 if(instant){camera.position.set(...p.pos);orbitTarget.set(...p.target);camera.lookAt(orbitTarget);camera.updateMatrixWorld(true);cameraTween=null;invalidate();}else cameraTween={start:camera.position.clone(),target:orbitTarget.clone(),end:vec(...p.pos),look:vec(...p.target),t:0};$('cameraBookmark').value=name;
}
function setScene(name){s.scene=name==='clean'?'clean':'bay';bay.visible=s.scene==='bay';clean.visible=s.scene==='clean';point={P:vec(1.25,0,3.25),N:vec(0,1,0),mesh:activeFloor()};s.floorR=point.mesh.userData.pair.uniforms.uRoughness.value;$('sceneTag').textContent=s.scene==='bay'?'Surface Works / 03':'Original clean material studio';$('sceneTitle').textContent=s.scene==='bay'?'Light meets material.':'One polygon. Every highlight.';cameraBookmark('home');syncGlobalUI();syncField('floorR');invalidate();}
function toggleFreeze(){if(s.mode!=='playground'){toast('The inspector holds time still. Return to Workshop to resume.');return;}s.frozen=!s.frozen;shield.charging=false;syncGlobalUI();}
function togglePhoto(){s.photo=!s.photo;document.body.classList.toggle('photo',s.photo);$('settings').classList.remove('open');$('about').classList.remove('open');$('paper').classList.remove('open');keys.clear();if(s.photo){brushCursor.visible=false;pin.visible=false;}resize();}
function resetBay(){Object.assign(s,{mode:'playground',tool:'shield',scene:'bay',selected:0,solo:-1,frozen:false,slow:false,fill:true,bloom:true,animateTextures:true,exposure:1.18,floorR:.32,paused:false});Object.assign(shield,{held:false,deployed:true,open:1,charging:false,charge:0,autoFire:false,nextShot:1,impacts:0,recoil:0});Object.assign(disc,{mode:'parked',age:0,bounces:0});disc.velocity.set(0,0,0);for(const p of [...projectiles,...sparks])scene.remove(p.mesh);projectiles.length=sparks.length=0;clearPaint();paintHistory.length=0;initLights();bay.visible=true;clean.visible=false;floor.userData.pair.uniforms.uRoughness.value=.32;cameraBookmark('home',true);setMode('playground');setTool('shield');setStep(0);syncLightUI();for(const p of pairs)p.uniforms.uFill.value=.14;$('sceneTag').textContent='Surface Works / 03';toast('Test bay reset.');}
// Live polygon editor with explicit invalid-shape feedback.
const shapeCanvas=$('shapeCanvas'),shapeCTX=shapeCanvas.getContext('2d');let shapeEdit=[],shapeIndex=0,shapeDrag=false,shapeValidation={valid:true,reason:''};
function resetSculptor(){const l=selectedLight();if(!l)return;shapeEdit=l.outline.map(v=>v.clone());shapeIndex=clamp(shapeIndex,0,shapeEdit.length-1);shapeValidation=validateOutline(shapeEdit);drawSculptor();}
function shapeToCanvas(v){return v2(252+v.x*388,225-v.y*388);}
function drawSculptor(){if(!shapeEdit.length)return;const c=shapeCTX;c.clearRect(0,0,504,450);c.fillStyle='#0b1821';c.fillRect(0,0,504,450);c.strokeStyle='#20333f';c.lineWidth=1;for(let i=-5;i<=5;i++){c.beginPath();c.moveTo(252+i*38.8,18);c.lineTo(252+i*38.8,432);c.stroke();c.beginPath();c.moveTo(28,225+i*38.8);c.lineTo(476,225+i*38.8);c.stroke();}
 c.beginPath();shapeEdit.forEach((p,i)=>{const q=shapeToCanvas(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.closePath();c.fillStyle=shapeValidation.valid?'#22566b77':'#772c284f';c.fill();c.strokeStyle=shapeValidation.valid?'#81e0e7':'#ff947e';c.lineWidth=3;c.stroke();
 shapeEdit.forEach((p,i)=>{const q=shapeToCanvas(p);c.beginPath();c.arc(q.x,q.y,i===shapeIndex?9:7,0,TAU);c.fillStyle=i===shapeIndex?'#f8c285':'#9eeaf0';c.fill();c.font='19px ui-monospace,Consolas,monospace';c.fillStyle='#a6becc';c.fillText(String(i+1),q.x+11,q.y-10);});$('shapeStatus').textContent=shapeValidation.reason;$('shapeStatus').classList.toggle('invalid',!shapeValidation.valid);$('addVertex').disabled=shapeEdit.length>=MAX_VERTS;$('removeVertex').disabled=shapeEdit.length<=3;
}
function commitShape(){shapeValidation=validateOutline(shapeEdit);if(shapeValidation.valid){const l=selectedLight();l.outline=shapeEdit.map(v=>v.clone());l.shape='custom';rebuildLight(l);$('shapePreset').value='custom';refreshLightList();}drawSculptor();}
shapeCanvas.addEventListener('pointerdown',e=>{e.preventDefault();const r=shapeCanvas.getBoundingClientRect(),x=(e.clientX-r.left)*504/r.width,y=(e.clientY-r.top)*450/r.height;let dist=1e9;shapeEdit.forEach((p,i)=>{const q=shapeToCanvas(p),d=Math.hypot(q.x-x,q.y-y);if(d<dist){dist=d;shapeIndex=i;}});if(dist<35){shapeDrag=true;shapeCanvas.setPointerCapture(e.pointerId);}drawSculptor();});
shapeCanvas.addEventListener('pointermove',e=>{if(!shapeDrag)return;const r=shapeCanvas.getBoundingClientRect(),x=(e.clientX-r.left)*504/r.width,y=(e.clientY-r.top)*450/r.height;shapeEdit[shapeIndex].set(clamp((x-252)/388,-.5,.5),clamp((225-y)/388,-.5,.5));commitShape();});
shapeCanvas.addEventListener('pointerup',()=>{shapeDrag=false;});shapeCanvas.addEventListener('pointercancel',()=>{shapeDrag=false;});
$('shapePreset').onchange=e=>{if(e.target.value==='custom')return;const l=selectedLight();l.shape=e.target.value;l.outline=polygon2D(l.shape);rebuildLight(l);resetSculptor();syncLightUI();};
$('addVertex').onclick=()=>{if(shapeEdit.length>=MAX_VERTS)return;let j=shapeIndex;const mid=shapeEdit[j].clone().lerp(shapeEdit[(j+1)%shapeEdit.length],.5);shapeEdit.splice(j+1,0,mid);shapeIndex=j+1;commitShape();};
$('removeVertex').onclick=()=>{if(shapeEdit.length<=3)return;shapeEdit.splice(shapeIndex,1);shapeIndex=Math.min(shapeIndex,shapeEdit.length-1);commitShape();};
// Every visible control is connected; actions preserve the selected-light identity.
for(const mode of ['playground','explain','compare'])$('mode-'+mode).onclick=()=>setMode(mode);
$$('.tools [data-tool]').forEach(b=>b.onclick=()=>{const tool=b.dataset.tool;if(tool==='probe')setMode('explain');else{if(s.mode==='explain'||(s.mode==='compare'&&tool!=='lights'))setMode('playground');setTool(tool);}});
$('freezeBtn').onclick=toggleFreeze;$('slowBtn').onclick=()=>{s.slow=!s.slow;syncGlobalUI();};$('photoBtn').onclick=togglePhoto;$('photoSettings').onclick=togglePhoto;
$('holdShield').onclick=holdShield;$('deployShield').onclick=toggleDeploy;$('testHit').onclick=fireProjectile;$('autoFire').onclick=()=>{ensureLive();shield.autoFire=!shield.autoFire;shield.nextShot=.1;syncGlobalUI();};
$('chargeShield').addEventListener('pointerdown',e=>{e.preventDefault();$('chargeShield').setPointerCapture(e.pointerId);startCharge();});$('chargeShield').addEventListener('pointerup',()=>releaseCharge());$('chargeShield').addEventListener('pointercancel',()=>{shield.charging=false;shield.charge=0;});
$('chargeShield').addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(!e.repeat)startCharge();}});$('chargeShield').addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();releaseCharge();}});
$('shieldSize').oninput=e=>{const l=lights[0],v=Number(e.target.value),ratio=l.height/l.width;l.width=v;l.height=clamp(v*ratio,.25,6);updateLight(l);syncLightUI();};
$('shieldSolo').onclick=()=>solo(0);$('discSolo').onclick=()=>solo(3);
$('shieldPattern').onchange=e=>{lights[0].pattern=Number(e.target.value);textureDirty.add(0);updateLight(lights[0]);syncLightUI();};
$('shieldInspect').onclick=()=>probeReflection(0);
$('shieldEdit').onclick=()=>{selectLight(0);setTool('shape');};$('shieldLightSettings').onclick=()=>{selectLight(0);setTool('lights');};
$('throwDisc').onclick=()=>throwDisc();$('recallDisc').onclick=recallDisc;$('freezeDisc').onclick=suspendDisc;$('parkDisc').onclick=parkDisc;
$('throwPower').oninput=e=>{s.throwPower=Number(e.target.value);$('throwPowerValue').textContent=s.throwPower.toFixed(0)+' m/s';};$('discSettings').onclick=()=>{selectLight(3);setTool('lights');};
function syncPalette(){$$('[data-paint]').forEach(b=>b.classList.toggle('active',b.dataset.paint===s.brush));$('brushRadius').value=s.brushRadius;$('brushRadiusValue').textContent=s.brushRadius.toFixed(2)+' m';}
for(const [key,m] of Object.entries(paintMaterials)){const b=document.createElement('button');b.dataset.paint=key;b.innerHTML=`<span class="swatch" style="background:${m.color}"></span>${m.label}`;b.onclick=()=>{s.brush=key;syncPalette();};$('materialPalette').appendChild(b);}
$('brushRadius').oninput=e=>{s.brushRadius=Number(e.target.value);syncPalette();};$('undoPaint').onclick=undoPaint;$('clearPaint').onclick=clearPaint;$('polishedStrip').onclick=polishedStrip;$('paintProbe').onclick=()=>{if(lastPaintProbe)point={P:lastPaintProbe.P.clone(),N:lastPaintProbe.N.clone(),mesh:lastPaintProbe.mesh};setMode('explain');};
$('duplicateLight').onclick=duplicateLight;$('removeLight').onclick=removeLight;$('soloLight').onclick=()=>solo();$('outlineLight').onclick=()=>setTool('shape');$('shapeBack').onclick=()=>setTool('lights');
$('lightColor').oninput=e=>{const l=selectedLight();l.color=e.target.value;updateLight(l);refreshLightList();};$('lightPattern').onchange=e=>{const l=selectedLight();l.pattern=Number(e.target.value);textureDirty.add(l.id);updateLight(l);syncGlobalUI();};
$('twoSided').onchange=e=>{selectedLight().twoSided=e.target.checked;updateLight(selectedLight());};$('spinLight').onclick=()=>{const l=selectedLight();l.spin=!l.spin;if(l.spin)ensureLive();syncLightUI();};
$('focusLight').onclick=()=>{const l=selectedLight(),dir=camera.position.clone().sub(l.position).normalize(),dest=l.position.clone().addScaledVector(dir,Math.max(l.width,l.height)*2.2);cameraTween={start:camera.position.clone(),target:orbitTarget.clone(),end:dest,look:l.position.clone(),t:0};};
$('probeLight').onchange=e=>selectLight(Number(e.target.value));
$$('[data-step]').forEach(b=>b.onclick=()=>setStep(Number(b.dataset.step)));
$('animateTransform').onclick=()=>{const goal=s.morph>.5?0:1;s.step=1;$$('[data-step]').forEach(b=>b.classList.toggle('active',b.dataset.step==='1'));$('inspectTitle').textContent=captions[1][0];$('stepCaption').textContent=captions[1][1];morphGoal=goal;};
$('morphRange').oninput=e=>{s.morph=Number(e.target.value);s.step=1;morphGoal=null;$$('[data-step]').forEach(b=>b.classList.toggle('active',b.dataset.step==='1'));$('inspectTitle').textContent=captions[1][0];$('stepCaption').textContent=captions[1][1];syncMorph();dirtyInspector=true;};
$('showRays').onchange=e=>{s.rays=e.target.checked;dirtyInspector=true;};
$('edgeRows').addEventListener('pointerover',e=>{const row=e.target.closest('[data-edge]');if(row){const n=Number(row.dataset.edge);if(n!==highlightEdge){highlightEdge=n;dirtyInspector=true;}}});$('edgeRows').addEventListener('pointerleave',()=>{highlightEdge=-1;dirtyInspector=true;});
for(const view of ['split','error','reference'])$('view-'+view).onclick=()=>{s.compareView=view;updateCompareUI();};
$('pauseReference').onclick=()=>{s.paused=!s.paused;syncGlobalUI();};$('restartReference').onclick=()=>{refFrames=0;dirtyRef=true;$('sampleCount').textContent='0 spp / emitter';};$('sampleTarget').onchange=e=>{s.target=Number(e.target.value);};
function closeModal(id){$(id).classList.remove('open');keys.clear();}
for(const [id,button,close] of [['about','aboutBtn','closeAbout'],['settings','settingsBtn','closeSettings']]){$(button).onclick=()=>{$(id).classList.add('open');keys.clear();$(close).focus();};$(close).onclick=()=>closeModal(id);$(id).addEventListener('pointerdown',e=>{if(e.target===$(id))closeModal(id);});}
$('sceneSelect').onchange=e=>setScene(e.target.value);$('cameraBookmark').onchange=e=>{cameraBookmark(e.target.value);closeModal('settings');};$('homeCamera').onclick=()=>{cameraBookmark('home');closeModal('settings');};
$('studioFill').onchange=e=>{s.fill=e.target.checked;for(const p of pairs)p.uniforms.uFill.value=s.fill?.14:0;invalidate();};$('bloom').onchange=e=>{s.bloom=e.target.checked;sceneDirty=true;};$('animateTextures').onchange=e=>{s.animateTextures=e.target.checked;};$('soundToggle').onchange=e=>{s.sound=e.target.checked;if(s.sound)tone(370,.15,.025,550);};
$('quality').onchange=e=>{s.quality=Number(e.target.value);resize();};$('resetBtn').onclick=()=>{resetBay();closeModal('settings');};
$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){toast('Fullscreen is not available in this browser.');}};
let photoPending=false;
$('saveImage').onclick=()=>{closeModal('settings');photoPending=true;toast('Saving the rendered canvas as a PNG.');};
function saveCanvas(){canvas.toBlob(blob=>{if(!blob){toast('Image capture failed.');return;}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='ARC_Light_Lab.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);},'image/png');}
// Picking, brushing and navigation. Pointer capture ends on release; no pointer lock.
const raycaster=new T.Raycaster(),pointerNDC=v2();
function rayAt(x,y){pointerNDC.set(x/mainWidth*2-1,-y/H*2+1);camera.updateMatrixWorld(true);raycaster.setFromCamera(pointerNDC,camera);return raycaster;}
function isVisible(o){while(o){if(!o.visible)return false;o=o.parent;}return true;}
function visibleSurfaceHits(ray){return ray.intersectObjects(surfaces.filter(isVisible),false);}
function lightHitAt(ray){const meshes=lights.filter(l=>l&&l.root.visible).map(l=>l.mesh);const hit=ray.intersectObjects(meshes,false)[0];return hit||null;}
function smoothHitNormal(hit){const geo=hit.object.geometry,attr=geo.getAttribute('normal');if(!hit.face||!attr)return vec(0,1,0);const pos=geo.getAttribute('position'),a=vec().fromBufferAttribute(pos,hit.face.a),b=vec().fromBufferAttribute(pos,hit.face.b),c=vec().fromBufferAttribute(pos,hit.face.c),local=hit.object.worldToLocal(hit.point.clone()),bary=T.Triangle.getBarycoord(local,a,b,c,vec());if(!bary)return hit.face.normal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();const n=vec().fromBufferAttribute(attr,hit.face.a).multiplyScalar(bary.x).addScaledVector(vec().fromBufferAttribute(attr,hit.face.b),bary.y).addScaledVector(vec().fromBufferAttribute(attr,hit.face.c),bary.z);return n.applyMatrix3(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();}
function reflectionPoint(l=lights[0]){const mirrored=l.position.clone();mirrored.y=-mirrored.y;const denom=mirrored.y-camera.position.y,t=Math.abs(denom)>1e-8?-camera.position.y/denom:.5;const p=camera.position.clone().lerp(mirrored,clamp(t,0,1));p.y=0;return p;}
function probeReflection(id=0){selectLight(id);point={P:reflectionPoint(lights[id]),N:vec(0,1,0),mesh:activeFloor()};setMode('explain');}
function pinHit(hit){point={P:hit.point.clone(),N:smoothHitNormal(hit),mesh:hit.object,uv:hit.uv?.clone()};if(s.mode!=='explain')setMode('explain');invalidate();}
function localPointer(e){const r=container.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function modalOpen(){if($('paper').classList.contains('open'))return true;return $('about').classList.contains('open')||$('settings').classList.contains('open');}
function updateBrushCursor(hit){const v=!!hit&&isPaintFloor(hit.object)&&s.tool==='paint'&&s.mode==='playground'&&!s.photo;if(brushCursor.visible!==v)sceneDirty=true;brushCursor.visible=v;if(v){brushCursor.position.copy(hit.point).add(vec(0,.012,0));brushCursor.scale.setScalar(s.brushRadius);sceneDirty=true;}}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
 if(modalOpen())return;e.preventDefault();canvas.focus({preventScroll:true});const p=localPointer(e);canvas.setPointerCapture(e.pointerId);cameraTween=null;
 if(s.mode==='explain'&&!s.photo&&p.x>=mainWidth){drag={type:'inspect',id:e.pointerId,x:e.clientX,y:e.clientY,theta:inspectTheta,phi:inspectPhi};return;}
 if(e.button===2){const d=camera.getWorldDirection(vec());drag={type:'look',id:e.pointerId,x:e.clientX,y:e.clientY,yaw:Math.atan2(-d.x,-d.z),pitch:Math.asin(clamp(d.y,-1,1))};brushCursor.visible=false;sceneDirty=true;return;}
 if(e.button!==0)return;scene.updateMatrixWorld(true);const ray=rayAt(p.x,p.y),lightHit=lightHitAt(ray),hit=visibleSurfaceHits(ray)[0]||null;
 if(v5PointerDown(e,p,ray,lightHit,hit))return;
 if(s.tool==='paint'&&s.mode==='playground'&&!v5.ready){if(hit&&isPaintFloor(hit.object)){stashPaint();lastPaintUV=null;brushHit(hit);updateBrushCursor(hit);drag={type:'paint',id:e.pointerId,x:e.clientX,y:e.clientY};}else if(hit)stampObject(hit.object);return;}
 if(s.tool==='disc'&&s.mode==='playground'&&!e.altKey){throwDisc(ray.ray.direction);return;}
 if(s.tool!=='probe'&&lightHit&&(!hit||lightHit.distance<hit.distance)){
  const l=lights.find(l=>l&&l.mesh===lightHit.object);selectLight(l.id);l.spin=false;if(l.id===1&&s.scene==='bay')workshop.scan=false;if(s.scene==='gallery')exhibitMotion=false;if(l.id===0)shield.held=false;if(l.id===3){disc.resumeMode=disc.mode;disc.mode='suspended';}syncLightUI();
  if(e.altKey)drag={type:'tilt',id:e.pointerId,light:l,x:e.clientX,y:e.clientY,rotation:l.rotation.clone()};else{const plane=new T.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(vec()),lightHit.point),startHit=ray.ray.intersectPlane(plane,vec());drag={type:'light',id:e.pointerId,light:l,plane,startHit,startLight:l.position.clone(),x:e.clientX,y:e.clientY};}canvas.style.cursor='grabbing';return;
 }
 if(s.tool==='probe'&&hit){pinHit(hit);return;}
 drag={type:'orbit',id:e.pointerId,x:e.clientX,y:e.clientY,spherical:new T.Spherical().setFromVector3(camera.position.clone().sub(orbitTarget)),target:orbitTarget.clone(),hit,moved:false};
});
canvas.addEventListener('pointermove',e=>{
 const p=localPointer(e);if(v5PointerMove(e,p))return;if(!drag){if(p.x<mainWidth){scene.updateMatrixWorld(true);const ray=rayAt(p.x,p.y);if(s.tool==='paint'){const hit=visibleSurfaceHits(ray)[0];updateBrushCursor(hit);canvas.style.cursor='crosshair';}else{canvas.style.cursor=lightHitAt(ray)?'grab':s.tool==='disc'||s.tool==='probe'?'crosshair':'default';}}else canvas.style.cursor='grab';return;}
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(drag.type==='inspect'){inspectTheta=drag.theta-dx*.007;inspectPhi=clamp(drag.phi+dy*.007,.15,PI-.15);updateInspectorCamera();return;}
 if(drag.type==='paint'){const hit=visibleSurfaceHits(rayAt(p.x,p.y))[0];if(hit)brushHit(hit);updateBrushCursor(hit);return;}
 if(drag.type==='light'){const q=rayAt(p.x,p.y).ray.intersectPlane(drag.plane,vec());if(q){const pos=drag.startLight.clone().add(q.sub(drag.startHit));drag.light.position.set(clamp(pos.x,-8,8),clamp(pos.y,.07,7),clamp(pos.z,-6,10));updateLight(drag.light);for(const k of ['x','y','z'])syncField(k);}return;}
 if(drag.type==='tilt'){drag.light.rotation.set(clamp(drag.rotation.x+dy*.006,-PI,PI),drag.rotation.y+dx*.006,drag.rotation.z,'YXZ');updateLight(drag.light);syncField('yaw');syncField('pitch');return;}
 if(drag.type==='look'){camera.rotation.set(clamp(drag.pitch-dy*.004,-1.53,1.53),drag.yaw-dx*.004,0,'YXZ');orbitTarget.copy(camera.position).addScaledVector(camera.getWorldDirection(vec()),8);invalidate();return;}
 if(drag.type==='orbit'&&(drag.moved||Math.hypot(dx,dy)>4)){drag.moved=true;const sp=drag.spherical.clone();sp.theta-=dx*.005;sp.phi=clamp(sp.phi-dy*.005,.08,PI/2-.015);camera.position.copy(vec().setFromSpherical(sp)).add(drag.target);camera.lookAt(drag.target);invalidate();}
});
function endDrag(e){if(!drag)return;const d=drag;drag=null;lastPaintUV=null;canvas.style.cursor='default';try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch{}v5EndDrag(d);}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',()=>{v5.stroke=null;drag=null;lastPaintUV=null;canvas.style.cursor='default';});canvas.addEventListener('pointerleave',()=>{if(!drag){brushCursor.visible=false;sceneDirty=true;}});
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=localPointer(e);if(s.mode==='explain'&&!s.photo&&p.x>=mainWidth){inspectDistance=clamp(inspectDistance*Math.exp(e.deltaY*.001),3,13);updateInspectorCamera();return;}if(s.tool==='paint'){s.brushRadius=clamp(s.brushRadius*Math.exp(-e.deltaY*.0015),.12,2.5);syncPalette();brushCursor.scale.setScalar(s.brushRadius);sceneDirty=true;return;}cameraTween=null;const d=camera.getWorldDirection(vec()).multiplyScalar(-e.deltaY*.007);camera.position.add(d);orbitTarget.add(d);invalidate();},{passive:false});
const divider=$('splitDivider');divider.addEventListener('pointerdown',e=>{e.preventDefault();divider.setPointerCapture(e.pointerId);const change=ev=>{s.split=clamp(localPointer(ev).x/W,.03,.97);updateCompareUI();};change(e);divider.onpointermove=change;divider.onpointerup=divider.onpointercancel=()=>{divider.onpointermove=null;};});
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'){e.preventDefault();if(s.photo)togglePhoto();else if(modalOpen()){closeModal('about');closeModal('settings');closeModal('paper');closeSceneMenu();}else if(s.mode!=='playground')closeInspector();else if(document.body.classList.contains('controlsClosed')){document.body.classList.remove('controlsClosed');resize();}drag=null;keys.clear();shield.charging=false;return;}
 if(modalOpen()||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 if(e.code==='Space'&&s.tool==='shield'){e.preventDefault();if(!e.repeat&&document.activeElement!==$('chargeShield'))startCharge();return;}
 if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();undoPaint();return;}
 if(e.code==='KeyB'&&!e.repeat){if(s.mode!=='playground')setMode('playground');setTool('paint');return;}
 if(!e.repeat){if(e.code==='KeyF'){holdShield();return;}if(e.code==='KeyR'){recallDisc();return;}if(e.code==='KeyG'){suspendDisc();return;}if(e.code==='KeyT'){fireProjectile();return;}if(e.code==='KeyP'){toggleFreeze();return;}if(e.code==='KeyH'){togglePhoto();return;}if(['Digit1','Digit2','Digit3'].includes(e.code)){setMode(['playground','explain','compare'][Number(e.code.slice(-1))-1]);return;}}
 if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);cameraTween=null;}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&shield.charging&&document.activeElement!==$('chargeShield'))releaseCharge();});window.addEventListener('blur',()=>{keys.clear();drag=null;shield.charging=false;});window.addEventListener('resize',()=>{if(ready)resize();});
function movement(dt){if(!keys.size||modalOpen())return;const delta=vec(),f=camera.getWorldDirection(vec()),r=vec(1,0,0).applyQuaternion(camera.quaternion);if(keys.has('KeyW')||keys.has('ArrowUp'))delta.add(f);if(keys.has('KeyS')||keys.has('ArrowDown'))delta.sub(f);if(keys.has('KeyD')||keys.has('ArrowRight'))delta.add(r);if(keys.has('KeyA')||keys.has('ArrowLeft'))delta.sub(r);if(keys.has('KeyE'))delta.y++;if(keys.has('KeyQ'))delta.y--;if(delta.lengthSq()>0){delta.normalize().multiplyScalar(dt*((keys.has('ShiftLeft')||keys.has('ShiftRight'))?10:3.5));camera.position.add(delta);camera.position.y=Math.max(.16,camera.position.y);orbitTarget.add(delta);invalidate();}}
function updateCameraTween(dt){if(!cameraTween)return;const t=cameraTween;t.t=Math.min(1,t.t+dt/1.1);const k=t.t*t.t*(3-2*t.t);camera.position.copy(t.start).lerp(t.end,k);orbitTarget.copy(t.target).lerp(t.look,k);camera.lookAt(orbitTarget);if(t.t>=1)cameraTween=null;invalidate();}
function draw(now){if(!ready)return;requestAnimationFrame(draw);const start=performance.now(),dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;movement(dt);updateCameraTween(dt);simulate(dt);
 if(morphGoal!==null){s.morph+=(morphGoal-s.morph)*(1-Math.exp(-dt*5));if(Math.abs(s.morph-morphGoal)<.002){s.morph=morphGoal;morphGoal=null;}syncMorph();dirtyInspector=true;}
 camera.updateMatrixWorld(true);syncScannerGeometry();pollTimers();renderer.info.reset();beginTimer();renderTextures();
 const redraw=sceneDirty||dirtyRef||frameNo===0||(s.mode==='explain'&&dirtyInspector);
 if(dirtyInspector&&s.mode==='explain')rebuildInspector();if(dirtyRef){refFrames=0;dirtyRef=false;}
 pin.visible=s.mode==='explain'&&!s.photo;switchMaterials(false);if(redraw){const before=renderer.info.render.calls;cullStats.tested=cullStats.rejected=0;renderSceneTo(rtLTC);sceneCalls=renderer.info.render.calls-before;sceneTris=renderer.info.render.triangles;sceneDirty=false;}
 if(s.mode==='compare'&&((!s.paused&&refFrames*4<s.target)||refFrames===0)){
  lightUniforms.uFrame.value=refFrames;switchMaterials(true);renderSceneTo(rtSample);switchMaterials(false);accumMat.uniforms.uPrev.value=accA.texture;accumMat.uniforms.uNew.value=rtSample.texture;accumMat.uniforms.uFrames.value=refFrames;postQuad.material=accumMat;
  renderer.setRenderTarget(accB);renderer.setViewport(0,0,rtWidth,rtHeight);renderer.setScissorTest(false);renderer.render(postScene,postCamera);[accA,accB]=[accB,accA];refFrames++;postQuad.material=postMat;
 }
 if(s.bloom&&s.mode!=='compare'&&redraw){postQuad.material=blurMat;blurMat.uniforms.uSource.value=rtLTC.texture;blurMat.uniforms.uOffset.value.set(4/rtWidth,0);blurMat.uniforms.uThreshold.value=1;renderer.setRenderTarget(rtGlowA);renderer.setViewport(0,0,rtGlowA.width,rtGlowA.height);renderer.setScissorTest(false);renderer.render(postScene,postCamera);blurMat.uniforms.uSource.value=rtGlowA.texture;blurMat.uniforms.uOffset.value.set(0,1/rtGlowA.height);blurMat.uniforms.uThreshold.value=0;renderer.setRenderTarget(rtGlowB);renderer.render(postScene,postCamera);postQuad.material=postMat;}
 postUniforms.uLTC.value=rtLTC.texture;postUniforms.uReference.value=accA.texture;postUniforms.uGlow.value=rtGlowB.texture;postUniforms.uExposure.value=s.exposure;postUniforms.uBloom.value=s.bloom&&s.mode!=='compare'?.14:0;
 renderer.setRenderTarget(null);renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);renderer.setClearColor('#09131c');renderer.clear();renderer.setViewport(0,0,mainWidth,H);renderer.render(postScene,postCamera);
 if(s.mode==='explain'&&!s.photo){const ch=$('explainControls').getBoundingClientRect().height,ih=Math.max(1,H-ch);renderer.setViewport(mainWidth,ch,explainWidth,ih);renderer.setScissor(mainWidth,ch,explainWidth,ih);renderer.setScissorTest(true);renderer.clear();renderer.render(inspectScene,inspectCamera);renderer.setScissorTest(false);}
 endTimer();frameNo++;cpuMs=performance.now()-start;fpsFrames++;if(now-lastFPS>750){fps=fpsFrames*1000/(now-lastFPS);fpsFrames=0;lastFPS=now;}
 if(now-lastStatus>250){lastStatus=now;syncGlobalUI();if(s.tool==='lights')for(const k of bindings.keys())syncField(k);const spp=refFrames*4,active=lights.filter(l=>l&&l.enabled&&(s.solo<0||s.solo===l.id)&&lightGPU[l.id].radiance.lengthSq()>0),edgeCount=active.reduce((n,l)=>n+l.outline.length,0);
  $('sampleCount').textContent=spp.toLocaleString()+' spp / emitter';$('referenceState').textContent=s.paused?'Paused':spp>=s.target?'Target reached':'Sampling';$('refBar').style.width=(Math.min(1,spp/s.target)*100)+'%';$('refLabel').textContent=(s.compareView==='error'?(lightUniforms.uReferenceModel.value===1?'Visibility error':'Error vs GGX'):(lightUniforms.uReferenceModel.value===1?'LTC visibility':'GGX reference'))+' · '+spp.toLocaleString()+' spp';
  $('perfCulled').textContent=cullStats.rejected+' / '+cullStats.tested;$('perfMeans').textContent=filterMeans;
  $('perfFPS').textContent=fps.toFixed(1)+' fps';$('perfGPU').textContent=gpuMs!==null?gpuMs.toFixed(2)+' ms':timerExt?'Waiting for timer':'Unavailable';$('perfCPU').textContent=cpuMs.toFixed(2)+' ms';$('perfResolution').textContent=rtWidth+' × '+rtHeight;$('perfEdges').textContent=active.length+' lights / '+edgeCount+' edges';$('perfDraws').textContent=sceneCalls+' scene draws / '+Math.round(sceneTris/1000)+'k tris';
  if(disc.mode==='flight')$('discState').textContent='Flying · '+disc.bounces+' bounces';
 }
 if(photoPending){photoPending=false;saveCanvas();}
}
// ---------------------------------------------------------------------------
// SURFACE WORKS / 03 — a connected material workshop. No new light technique.
// Lighting remains Heitz / Dupuy / Hill / Neubelt, SIGGRAPH 2016.
// ---------------------------------------------------------------------------
const workshop={scan:true,belt:true,speed:1,time:0,beltDistance:0,scanPosition:0,coatings:0};
let diagnosticResume={frozen:false,tool:'workshop'},trailDirty=false,filterMeans=0;
const cullStats={tested:0,rejected:0},maskCenter=vec();
function receiverMask(_renderer,_scene,_camera,geometry,material){
 if(!material.uniforms?.uLightMask)return;let mask=0;
 if(!geometry.boundingSphere)geometry.computeBoundingSphere();
 const sphere=this.userData.receiverSphere||geometry.boundingSphere;
 maskCenter.copy(sphere.center).applyMatrix4(this.matrixWorld);
 const e=this.matrixWorld.elements,scale=Math.max(Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])),radius=sphere.radius*scale;
 for(let i=0;i<MAX_LIGHTS;i++){const l=lights[i];if(!l||!l.enabled||lightGPU[i].radiance.lengthSq()<1e-9)continue;
  cullStats.tested++;if(s.bounded&&maskCenter.distanceToSquared(l.position)>((l.reach||18)+radius)**2){cullStats.rejected++;continue;}mask|=1<<i;
 }
 material.uniforms.uLightMask.value=mask;material.uniformsNeedUpdate=true;
}
const workshopRoot=new T.Group();workshopRoot.name='Surface Works conveyor';bay.add(workshopRoot);
const scannerRig=new T.Group(),scannerCarriage=new T.Group();bay.add(scannerRig,scannerCarriage);
const specimens=[];let beltSlats=null,rotor=null;const beltCenter=vec(2.05,.79,-3.58),trackStraight=3.95,trackRadius=.66,trackLength=trackStraight*2+TAU*trackRadius;
function trackPoint(distance){
 let d=((distance%trackLength)+trackLength)%trackLength;const half=trackStraight*.5,r=trackRadius;let x,z,tx,tz;
 if(d<trackStraight){x=-half+d;z=r;tx=1;tz=0;}
 else if((d-=trackStraight)<PI*r){const a=PI/2-d/r;x=half+r*Math.cos(a);z=r*Math.sin(a);tx=Math.sin(a);tz=-Math.cos(a);}
 else if((d-=PI*r)<trackStraight){x=half-d;z=-r;tx=-1;tz=0;}
 else{d-=trackStraight;const a=-PI/2-d/r;x=-half+r*Math.cos(a);z=r*Math.sin(a);tx=Math.sin(a);tz=-Math.cos(a);}
 return {position:vec(beltCenter.x+x,beltCenter.y,beltCenter.z+z),tangent:vec(tx,0,tz)};
}
function ringPath(offset=0){const out=[];for(let i=0;i<=96;i++){const p=trackPoint(i/96*trackLength).position;p.y+=offset;out.push(p);}return out;}
function specimenBox(w,h,d,r){
 const g=new T.BoxGeometry(1,1,1,8,8,8),p=g.attributes.position,n=g.attributes.normal;
 const half=[w*.5,h*.5,d*.5];r=Math.min(r,...half.map(v=>v*.8));
 for(let i=0;i<p.count;i++){
  const v=[p.getX(i),p.getY(i),p.getZ(i)],core=v.map(x=>clamp(x,-.25,.25)),delta=v.map((x,j)=>x-core[j]);
  const len=Math.hypot(...delta);for(let j=0;j<3;j++)delta[j]/=len;
  p.setXYZ(i,...v.map((_,j)=>core[j]*4*(half[j]-r)+delta[j]*r));n.setXYZ(i,...delta);
 }return g;
}
function bentSheet(){
 const positions=[],uvs=[],indices=[],nx=24,ny=24,stride=nx+1,layer=stride*(ny+1);
 const at=(u,v,side)=>[(u-.5)*.84*(1-.14*v),v*.87+.11*Math.sin(u*PI)*Math.pow(v,8),Math.sin((u-.5)*PI*1.25)*.15+Math.sin(v*PI)*.07+side*.025];
 for(const side of [1,-1])for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){positions.push(...at(x/nx,y/ny,side));uvs.push(x/nx,y/ny);}
 for(let side=0;side<2;side++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=side*layer+y*stride+x,b=a+1,d=a+stride,c=d+1;indices.push(...(side?[a,d,b,b,d,c]:[a,b,d,b,c,d]));}
 const edge=(ua,va,ub,vb)=>{const k=positions.length/3;positions.push(...at(ua,va,1),...at(ub,vb,1),...at(ub,vb,-1),...at(ua,va,-1));uvs.push(0,0,1,0,1,1,0,1);indices.push(k,k+1,k+2,k,k+2,k+3);};
 for(let i=0;i<nx;i++){edge(i/nx,0,(i+1)/nx,0);edge((i+1)/nx,1,i/nx,1);}
 for(let i=0;i<ny;i++){edge(0,(i+1)/ny,0,i/ny);edge(1,i/ny,1,(i+1)/ny);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function buildTrack(){
 // A closed, two-lane conveyor rather than pieces teleporting at either end.
 for(const x of [-.23,4.33])for(const z of [-4.10,-3.04]){box('Conveyor foot',.40,.11,.38,[x,.06,z],mat.frame,workshopRoot);box('Conveyor leg',.14,.66,.14,[x,.39,z],mat.steel,workshopRoot,.02);}
 box('Conveyor bed',trackStraight,.22,1.74,[beltCenter.x,.62,beltCenter.z],mat.frame,workshopRoot,.1);
 for(const side of [-1,1]){const cap=addSurface('Conveyor end housing',new T.CylinderGeometry(.87,.87,.22,48),vec(beltCenter.x+side*trackStraight/2,.62,beltCenter.z),mat.frame,workshopRoot);}
 const curve=new T.CatmullRomCurve3(ringPath(.015).slice(0,-1),true,'centripetal');
 addSurface('Continuous belt channel',new T.TubeGeometry(curve,160,.17,8,true),vec(),mat.rubber,workshopRoot);
 const slatGeo=new T.BoxGeometry(.14,.055,.47);beltSlats=new T.InstancedMesh(slatGeo,mat.dark.ltc,80);beltSlats.userData.pair=mat.dark;beltSlats.name='Conveyor tread';beltSlats.instanceMatrix.setUsage(T.DynamicDrawUsage);beltSlats.userData.receiverSphere=new T.Sphere(beltCenter.clone(),4);beltSlats.onBeforeRender=receiverMask;beltSlats.frustumCulled=false;workshopRoot.add(beltSlats);customMeshes.push(beltSlats);
 for(const z of [-4.51,-2.65])box('Conveyor safety edge',4.02,.13,.075,[beltCenter.x,.82,z],mat.orange,workshopRoot,.025);
 for(const x of [.45,3.65])box('Conveyor cross brace',.12,.10,1.50,[x,.29,-3.58],mat.frame,workshopRoot,.015);
 worldLabel('M A T E R I A L   L O O P',[2.05,.57,-2.69],2.02,'#95acb8',workshopRoot);
 const finishes=[materialPair('#b6c5ce',.14,1),materialPair('#b9c9c4',.34,0),materialPair('#d4aa71',.25,1)];
 for(let i=0;i<3;i++){
  const root=new T.Group(),turn=new T.Group();root.name=['01 / Coupler','02 / Ceramic shell','03 / Folded fin'][i];workshopRoot.add(root);root.add(turn);const main=[];
  const carrier=addSurface('Specimen turntable',new T.CylinderGeometry(.47,.50,.11,40),vec(0,.08,0),mat.steel,root);
  addSurface('Turntable gasket',new T.CylinderGeometry(.40,.43,.09,36),vec(0,.16,0),mat.rubber,root);
  turn.position.y=.21;
  const pair=finishes[i];
  if(i===0){
   main.push(addSurface('Coupler shell',new T.CylinderGeometry(.32,.36,.78,48,1,false),vec(0,.42,0),pair,turn));
   for(const y of [.09,.25,.68,.8]){const ring=addSurface('Coupler collar',new T.TorusGeometry(.35,.04,10,40),vec(0,y,0),y===.25?mat.orange:mat.steel,turn);ring.rotation.x=PI/2;}
   main.push(addSurface('Coupler face plate',specimenBox(.36,.46,.075,.03),vec(0,.44,.326),pair,turn));
   for(const x of [-.115,.115])for(const y of [.31,.58]){const bolt=addSurface('Coupler fastener',new T.CylinderGeometry(.032,.032,.027,6),vec(x,y,.376),mat.dark,turn);bolt.rotation.x=PI/2;}
   addSurface('Coupler socket',new T.CylinderGeometry(.19,.19,.033,32),vec(0,.82,0),mat.dark,turn);
  }else if(i===1){
   const shell=addSurface('Ceramic housing',specimenBox(.67,.72,.62,.14),vec(0,.43,0),pair,turn);shell.rotation.z=.12;main.push(shell);
   const insert=addSurface('Ceramic port',new T.TorusGeometry(.18,.055,12,40),vec(0,.5,.347),mat.steel,turn);
   const disk=addSurface('Port well',new T.CircleGeometry(.15,40),vec(0,.5,.347),mat.dark,turn);
   for(const x of [-.29,.29])box('Housing foot',.15,.10,.43,[x,.10,.0],mat.frame,turn,.02);
   main.push(addSurface('Ceramic crown',specimenBox(.50,.10,.43,.035),vec(.04,.84,0),pair,turn));
  }else{
   // A subdivided curved sheet: the reflection follows continuous geometry,
   // instead of bending a handful of large extrusion-cap triangles.
   main.push(addSurface('Folded metal fin',bentSheet(),vec(0,.05,-.03),pair,turn));
   box('Fin clamp',.69,.13,.43,[0,.10,0],mat.frame,turn,.03);
   for(const x of [-.24,.24]){const screw=addSurface('Clamp bolt',new T.CylinderGeometry(.045,.045,.03,6),vec(x,.18,.12),mat.steel,turn);}
  }
  const item={root,turn,main,offset:i*trackLength/3,phase:i*1.7,name:root.name};specimens.push(item);main.forEach(m=>{m.userData.coatingGroup=main;m.userData.specimen=item;});
 }
 colliders.push({min:vec(-.87,0,-4.46),max:vec(4.99,.90,-2.70)});
}
function buildScanner(){
 // The rail, moving carriage and light share the same world position.
 const hardware=new T.Group();hardware.name='Inspection gantry';bay.add(hardware);
 for(const x of [-.64,3.84]){
  box('Scanner rail',.11,.16,10.8,[x,5.46,-1.12],mat.frame,hardware,.02);
  box('Scanner rail inset',.035,.027,10.7,[x,5.36,-1.12],mat.steel,hardware,.008);
  box('Gantry rear support',.18,5.7,.23,[x,2.85,-6.36],mat.frame,hardware,.03);
  tube('Gantry tension brace',[[x,6.05,-6.36],[x,5.56,3.94]],.018,mat.steel,hardware);
  box('Scanner trolley',.29,.22,.52,[x,5.45,0],mat.orange,scannerCarriage,.03);
 }
 box('Gantry cross member',4.78,.17,.2,[1.6,5.55,-6.36],mat.frame,hardware,.03);
 box('Scanner backing',1.04,1.27,.13,[0,0,-.1],mat.frame,scannerRig,.035);
 for(const x of [-.52,.52])box('Scanner bumper',.04,1.23,.16,[x,0,-.07],mat.steel,scannerRig,.012);
 for(const y of [-.60,.60])box('Scanner rim',1.0,.04,.04,[0,y,.013],mat.orange,scannerRig,.01);
 // Rotor animation retains the already-iterated reactor art.
 rotor=new T.Group();machine.add(rotor);machine.updateMatrixWorld(true);for(const o of machine.children.slice())if(o.name==='Turbine vane'||o.name==='Turbine hub')rotor.attach(o);
 const ring=addSurface('Helmet turntable',new T.CylinderGeometry(.66,.69,.07,48),vec(3.05,1.01,-.80),mat.steel,bay);
}
function syncScannerGeometry(){
 const l=lights[1];scannerRig.visible=scannerCarriage.visible=s.scene==='bay'&&!!l?.enabled&&l?.name==='Inspection scanner'&&(s.solo<0||s.solo===1);
 if(!l)return;scannerRig.position.copy(l.position);scannerRig.quaternion.copy(l.root.quaternion);scannerRig.scale.set(l.width,l.height,1);scannerCarriage.position.z=l.position.z;
}
const slatDummy=new T.Object3D();
function updateConveyor(){
 for(let i=0;i<80;i++){const p=trackPoint(i*trackLength/80+workshop.beltDistance);slatDummy.position.copy(p.position);slatDummy.rotation.set(0,Math.atan2(-p.tangent.z,p.tangent.x),0);slatDummy.updateMatrix();beltSlats.setMatrixAt(i,slatDummy.matrix);}beltSlats.instanceMatrix.needsUpdate=true;
 for(const item of specimens){const p=trackPoint(item.offset+workshop.beltDistance);item.root.position.copy(p.position);item.turn.rotation.y=item.phase+workshop.time*.36;}
}
function stepWorkshop(dt){
 if(!beltSlats||s.scene!=='bay')return;const d=dt*workshop.speed;
 if(workshop.belt){workshop.beltDistance+=d*.34;workshop.time+=d;updateConveyor();helmet.rotation.y=-.32+Math.sin(workshop.time*.35)*.25;if(rotor)rotor.rotation.x+=d*.60;sceneDirty=dirtyRef=dirtyInspector=true;}
 if(workshop.scan&&lights[1]){workshop.scanPosition+=d;const l=lights[1];l.position.set(1.6,5.08,-.55+3.8*Math.sin(workshop.scanPosition*.38));l.rotation.set(PI/2,0,0,'YXZ');updateLight(l);}
 syncScannerGeometry();
}
function initWorkshop(){
 buildTrack();buildScanner();updateConveyor();syncScannerGeometry();$('sidebar').prepend($('comparePane'));
 // A little finish contrast makes the first scan readable, without painting for the user.
 floor.userData.pair.uniforms.uRoughness.value=.46;s.floorR=.46;
 bookmarks.home={pos:[10.1,7.0,13.4],target:[.1,1.55,-1.25]};
 bookmarks.samples={pos:[2.2,5.2,.45],target:[2.05,1.3,-3.5]};
 bookmarks.floor={pos:[5.5,3.9,9.4],target:[-.4,.05,2.0]};
 for(const [name,label] of [['samples','Moving test pieces'],['floor','Painted floor']]){const o=document.createElement('option');o.value=name;o.textContent=label;$('cameraBookmark').appendChild(o);}
 // Stable indices make explicit local saves deterministic for this version.
 customMeshes.forEach((m,i)=>{m.userData.sessionID=i;});
 range('rangeFields','reach','Influence reach',3,28,.25,v=>v.toFixed(1)+' m');
 $('rangeFields').title='Enable bounded light reach in Settings → Performance to use this artistic cutoff.';
 syncWorkshopUI();
}
function syncWorkshopUI(){
 if(!$('scanToggle'))return;const running=!s.frozen&&s.mode==='playground'&&s.scene==='bay';
 $('scanToggle').textContent=workshop.scan?(running?'Running':'Paused'):'Stopped';$('scanToggle').classList.toggle('active',workshop.scan);
 $('beltToggle').textContent=workshop.belt?(running?'Running':'Paused'):'Stopped';$('beltToggle').classList.toggle('active',workshop.belt);
 $('workSpeed').value=workshop.speed;$('workSpeedValue').textContent=workshop.speed.toFixed(1)+'×';
 $('workStatus').textContent=!running?(s.scene==='clean'?'Clean studio · workshop parked':'Time frozen · surfaces editable'):workshop.scan&&workshop.belt?'Scanner + conveyor live':workshop.scan?'Scanner live':workshop.belt?'Conveyor live':'Workshop parked';
 $('pauseWorkshop').textContent=s.frozen?'Resume workshop':'Freeze the moment';$('discTrail').value=s.trailMode;
 $('scanProgress').style.transform='translateX('+((Math.sin(workshop.scanPosition*.38)*.5+.5)*400)+'%)';
 $('boundedLights').checked=s.bounded;if($('param-reach')){$('param-reach').disabled=!s.bounded;$('rangeFields').style.opacity=s.bounded?'1':'.55';}
}
function setSurfaceView(n){s.surfaceView=[0,1,2].includes(+n)?+n:0;lightUniforms.uSurfaceView.value=s.surfaceView;$$('[data-surface-view]').forEach(b=>b.classList.toggle('active',+b.dataset.surfaceView===s.surfaceView));invalidate();}
function setBrushMode(mode){
 s.brushMode=['coat','polish','scuff','restore'].includes(mode)?mode:'coat';
 $$('[data-brush-mode]').forEach(b=>b.classList.toggle('active',b.dataset.brushMode===s.brushMode));
 $('materialPalette').hidden=s.brushMode!=='coat';
 $('brushModeHelp').textContent={coat:'Coat with a material. Drag the floor or click a test piece.',polish:'Lower roughness. Keep the existing color and metalness.',scuff:'Raise roughness. Keep the existing color and metalness.',restore:'Erase floor edits, or restore a prop’s original finish.'}[s.brushMode];
 brushCursor.material.color.set(s.brushMode==='restore'?'#f3c997':s.brushMode==='scuff'?'#c4b7a5':'#a1e1e4');
}
// Two persistent maps, still no per-stroke meshes. Brush bounds limit CPU work.
const oldStampBrush=stampBrush;
stampBrush=function(uv,radius=s.brushRadius,options=null){
 const mode=options?.mode||s.brushMode,strength=options?.strength??s.brushStrength,material=paintMaterials[options?.material||s.brush],f=activeFloor(),fw=f===cleanFloor?40:24,fh=f===cleanFloor?40:28;
 const x=uv.x*PAINT_SIZE,y=(1-uv.y)*PAINT_SIZE,rx=radius/fw*PAINT_SIZE,ry=radius/fh*PAINT_SIZE;
 if(mode==='coat'||mode==='restore'){
  for(const [ctx,c] of [[paintCTX,material.color],[propsCTX,`rgb(${Math.round(material.r*255)},${Math.round(material.m*255)},0)`]]){
   ctx.save();ctx.globalAlpha=strength;if(mode==='restore')ctx.globalCompositeOperation='destination-out';ctx.translate(x,y);ctx.scale(rx,ry);
   const ink=mode==='restore'?'#ffffff':c,g=ctx.createRadialGradient(0,0,.58,0,0,1);g.addColorStop(0,ink);g.addColorStop(1,ink.startsWith('#')?ink+'00':`rgba(${Math.round(material.r*255)},${Math.round(material.m*255)},0,0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
  }return;
 }
 const x0=clamp(Math.floor(x-rx-1),0,PAINT_SIZE-1),y0=clamp(Math.floor(y-ry-1),0,PAINT_SIZE-1),x1=clamp(Math.ceil(x+rx+1),0,PAINT_SIZE),y1=clamp(Math.ceil(y+ry+1),0,PAINT_SIZE);
 if(x1<=x0||y1<=y0)return;const data=propsCTX.getImageData(x0,y0,x1-x0,y1-y0),p=data.data,baseR=f.userData.pair.uniforms.uRoughness.value,baseM=f.userData.pair.uniforms.uMetalness.value,target=mode==='polish'?.075:.88;
 for(let j=0;j<data.height;j++)for(let i=0;i<data.width;i++){
  const dist=Math.hypot((x0+i+.5-x)/rx,(y0+j+.5-y)/ry);if(dist>=1)continue;
  const t=clamp((1-dist)/.42,0,1),w=t*t*(3-2*t)*strength,k=(j*data.width+i)*4,a=p[k+3]/255,r=baseR*(1-a)+p[k]/255*a,m=baseM*(1-a)+p[k+1]/255*a;
  p[k]=Math.round((r+(target-r)*w)*255);p[k+1]=Math.round(m*255);p[k+2]=0;p[k+3]=255;
 }propsCTX.putImageData(data,x0,y0);
};
const coatingCache=new Map();
function coatingPair(base,rough,metal,pattern){const key=[base,rough.toFixed(4),metal.toFixed(4),pattern].join('|');let p=coatingCache.get(key);if(!p){p=materialPair(base,rough,metal,pattern);coatingCache.set(key,p);}return p;}
const oldStampObject=stampObject;
stampObject=function(mesh){
 const members=mesh.userData.coatingGroup||[mesh],parts=[];let changed=false;
 for(const m of members){if(!m.userData.pair)continue;const old=m.userData.pair,u=old.uniforms,original=m.userData.originalPair||old,brush=paintMaterials[s.brush];let p;
  if(s.brushMode==='restore')p=original;
  else if(s.brushMode==='coat')p=coatingPair(brush.color,brush.r,brush.m,old.pattern);
  else p=coatingPair('#'+u.uBase.value.clone().convertLinearToSRGB().getHexString(),s.brushMode==='polish'?.075:.88,u.uMetalness.value,old.pattern);
  if(p===old)continue;parts.push({mesh:m,old,original:m.userData.originalPair});if(!m.userData.originalPair)m.userData.originalPair=old;m.userData.pair=p;m.material=p.ltc;changed=true;
 }
 if(!changed)return;paintHistory.push({kind:'assembly',parts});if(paintHistory.length>12)paintHistory.shift();paintCount++;workshop.coatings++;invalidate();
 const name=mesh.userData.specimen?.name||mesh.name;toast(name+' · '+(s.brushMode==='coat'?paintMaterials[s.brush].label:s.brushMode==='polish'?'polished':s.brushMode==='scuff'?'scuffed':'original finish'));
};
const oldUndo=undoPaint;
undoPaint=function(){
 const h=paintHistory[paintHistory.length-1];if(!h)return oldUndo();
 if(disc.mode==='rolling'||disc.mode==='flight'){disc.resumeMode=disc.mode;disc.mode='suspended';disc.trailLast=null;}
 if(h.kind==='assembly'){paintHistory.pop();for(const p of h.parts){p.mesh.userData.pair=p.old;p.mesh.material=p.old.ltc;if(p.original)p.mesh.userData.originalPair=p.original;else delete p.mesh.userData.originalPair;}invalidate();toast('Finish edit undone.');}
 else oldUndo();syncWorkshopUI();
};
const oldPolishedStrip=polishedStrip;
polishedStrip=function(){stashPaint();const old=s.brushMode;s.brushMode='polish';for(let z=-.2;z<=6.5;z+=.10)stampBrush(uvAtFloor(vec(-.6,0,z),activeFloor()),.65);s.brushMode=old;lastPaintProbe={P:vec(-.6,0,2),N:vec(0,1,0),mesh:activeFloor()};paintChanged();toast('Finish polished. The scanner will sweep across it.');};
const oldClearPaint=clearPaint;
clearPaint=function(){if(disc.mode==='rolling'){disc.mode='parked';disc.velocity.set(0,0,0);lights[3].rotation.set(-PI/2,0,0,'YXZ');lights[3].position.y=.12;updateLight(lights[3]);}disc.trailLast=null;oldClearPaint();};
const oldUpdateBrush=updateBrushCursor;
updateBrushCursor=function(hit){oldUpdateBrush(hit);if(!hit){$('hoverSurface').textContent='Point at a surface';$('hoverValues').textContent='r — · m —';return;}
 const params=sampleSurface(hit.object,hit.point);$('hoverSurface').textContent=hit.object.userData.specimen?.name||hit.object.name;$('hoverValues').textContent='r '+params.r.toFixed(3)+' · m '+params.m.toFixed(2);
};
function beginDiscTrail(){disc.trailLast=null;disc.trailDistance=0;if(s.trailMode!=='off')stashPaint();}
function leaveDiscTrail(a,b,width=.18){
 if(s.trailMode==='off')return;const current=b.clone();current.y=0;
 const prev=disc.trailLast||vec(a.x,0,a.z);if(current.distanceTo(prev)>2){disc.trailLast=current;return;}
 const length=current.distanceTo(prev);if(length<.025&&disc.trailLast)return;
 const count=Math.max(1,Math.ceil(length/.065));
 for(let i=1;i<=count;i++){const p=prev.clone().lerp(current,i/count);stampBrush(uvAtFloor(p,activeFloor()),width,{mode:s.trailMode,material:s.brush,strength:.8});}
 disc.trailDistance=(disc.trailDistance||0)+length;disc.trailLast=current;trailDirty=true;
}
function rollDisc(){
 ensureLive();beginDiscTrail();const l=lights[3];l.enabled=true;disc.mode='rolling';disc.age=0;disc.bounces=0;disc.rollAngle=0;disc.velocity.set(.55,0,-5.0);l.position.set(-.65,Math.max(l.width,l.height)*.5+.04,6.6);s.solo=-1;updateAllLights();syncGlobalUI();tone(210,.18,.025,95);
}
function stepRollingDisc(dt){
 const l=lights[3],radius=Math.max(l.width,l.height)*.5;
 const steps=Math.max(1,Math.ceil(dt/(1/120))),h=dt/steps;disc.age+=dt;
 for(let i=0;i<steps;i++){
  const old=l.position.clone();l.position.addScaledVector(disc.velocity,h);l.position.y=radius+.035;
  for(const [axis,lo,hi] of [['x',-6.8+radius,6.8-radius],['z',.20+radius,8.7-radius]])if(l.position[axis]<lo||l.position[axis]>hi){l.position[axis]=clamp(l.position[axis],lo,hi);disc.velocity[axis]*=-.84;disc.bounces++;tone(145,.09,.013,60);}
  const distance=l.position.distanceTo(old);disc.rollAngle-=distance/Math.max(radius,.1);leaveDiscTrail(old,l.position,.21);disc.velocity.multiplyScalar(Math.exp(-h*.18));
 }
 const dir=disc.velocity.clone().normalize(),normal=vec(-dir.z,0,dir.x),q=new T.Quaternion().setFromUnitVectors(vec(0,0,1),normal);
 q.multiply(new T.Quaternion().setFromAxisAngle(vec(0,0,1),disc.rollAngle));l.rotation.setFromQuaternion(q,'YXZ');updateLight(l);
 if(disc.velocity.length()<.24||disc.age>24){disc.mode='parked';disc.velocity.set(0,0,0);l.position.y=.12;l.rotation.set(-PI/2,0,0,'YXZ');updateLight(l);syncGlobalUI();}
}
// Explicit local saves preserve experiments without a service or account.
function serializePair(p){return{base:'#'+p.uniforms.uBase.value.clone().convertLinearToSRGB().getHexString(),r:p.uniforms.uRoughness.value,m:p.uniforms.uMetalness.value,pattern:p.pattern};}
function exportSetup(){return{format:'ARC-SURFACE-WORKS',version:3,credit:'LTC: Eric Heitz, Jonathan Dupuy, Stephen Hill, David Neubelt. SIGGRAPH 2016. DOI 10.1145/2897824.2925895',
 lights:lights.filter(Boolean).map(l=>({id:l.id,name:l.name,shape:l.shape,outline:l.outline.map(v=>v.toArray()),width:l.width,height:l.height,position:l.position.toArray(),rotation:[l.rotation.x,l.rotation.y,l.rotation.z],intensity:l.intensity,color:l.color,twoSided:l.twoSided,pattern:l.pattern,enabled:l.enabled,phase:l.phase,reach:l.reach||18})),
 paint:{color:paintColor.toDataURL('image/png'),props:paintProps.toDataURL('image/png')},finishes:customMeshes.filter(m=>m.userData.originalPair).map(m=>({id:m.userData.sessionID,...serializePair(m.userData.pair)})),
 workshop:{...workshop},camera:{position:camera.position.toArray(),target:orbitTarget.toArray()},state:{scene:s.scene,exposure:s.exposure,floorR:s.floorR,bounded:s.bounded,brush:s.brush,brushMode:s.brushMode,trailMode:s.trailMode}};}
function finiteArray(a,n){return Array.isArray(a)&&a.length===n&&a.every(x=>typeof x==='number'&&Number.isFinite(x));}
async function importSetup(data){
 if(typeof data==='string'){if(data.length>6e6)throw Error('Setup file is too large.');data=JSON.parse(data);}
 if(!data||data.format!=='ARC-SURFACE-WORKS'||![3,4,5].includes(data.version))throw Error('This is not an ARC v3, v4 or v5 setup.');
 if(!Array.isArray(data.lights)||data.lights.length<2||data.lights.length>5||!data.lights.some(l=>l.id===0)||!data.lights.some(l=>l.id===3))throw Error('The setup needs the reserved shield and disc.');
 const ids=new Set();
 for(const l of data.lights){
  if(!Number.isInteger(l.id)||l.id<0||l.id>=5||ids.has(l.id))throw Error('Invalid or duplicate light slot.');ids.add(l.id);
  if(!finiteArray(l.position,3)||!finiteArray(l.rotation,3)||!Array.isArray(l.outline)||!l.outline.every(v=>finiteArray(v,2)&&v.every(x=>Math.abs(x)<=.51))||!validateOutline(l.outline.map(v=>v2(...v))).valid)throw Error('Invalid polygon or transform.');
  if(![l.width,l.height,l.intensity,l.phase,l.reach].every(Number.isFinite)||l.width<.25||l.width>6||l.height<.25||l.height>6||l.intensity<0||l.intensity>24||l.reach<3||l.reach>28||!/^#[0-9a-f]{6}$/i.test(l.color)||!Number.isInteger(l.pattern)||l.pattern<0||l.pattern>6)throw Error('Invalid light parameters.');
 }
 if(!data.paint||!finiteArray(data.camera?.position,3)||!finiteArray(data.camera?.target,3))throw Error('Missing paint or camera data.');
 const loadMap=uri=>new Promise((resolve,reject)=>{if(typeof uri!=='string'||uri.length>3e6||!uri.startsWith('data:image/png;base64,')){reject(Error('Paint must be embedded PNG data.'));return;}const image=new Image();image.onload=()=>image.width===PAINT_SIZE&&image.height===PAINT_SIZE?resolve(image):reject(Error('Paint resolution does not match this build.'));image.onerror=()=>reject(Error('Unreadable paint map.'));image.src=uri;});
 const [a,b]=await Promise.all([loadMap(data.paint.color),loadMap(data.paint.props)]);
 if(!Array.isArray(data.finishes)||data.finishes.some(f=>!Number.isInteger(f.id)||!customMeshes[f.id]||!/^#[0-9a-f]{6}$/i.test(f.base)||!Number.isFinite(f.r)||!Number.isFinite(f.m)||f.r<.04||f.r>1||f.m<0||f.m>1||![0,1,2].includes(f.pattern)))throw Error('Invalid specimen finish.');
 // Validate everything before replacing any current state.
 for(const l of lights)if(l){emitterRoot.remove(l.root);l.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}lights.fill(null);for(const g of lightGPU){g.count=0;g.radiance.set(0,0,0);}
 for(const l of data.lights)makeLight(l.id,{...l,name:String(l.name).slice(0,60).replace(/[<>]/g,''),position:vec(...l.position),rotation:new T.Euler(...l.rotation,'YXZ'),outline:l.outline.map(v=>v2(...v))});
 for(const m of customMeshes)if(m.userData.originalPair){m.userData.pair=m.userData.originalPair;m.material=m.userData.pair.ltc;delete m.userData.originalPair;}
 for(const f of data.finishes){const m=customMeshes[f.id];m.userData.originalPair=m.userData.pair;m.userData.pair=coatingPair(f.base,f.r,f.m,f.pattern);m.material=m.userData.pair.ltc;}
 paintCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);propsCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);paintCTX.drawImage(a,0,0);propsCTX.drawImage(b,0,0);paintChanged();paintHistory.length=0;
 const st=data.state||{};s.exposure=clamp(Number(st.exposure)||1.18,.25,2.5);s.floorR=clamp(Number(st.floorR)||.46,.04,1);s.bounded=!!st.bounded;s.brush=paintMaterials[st.brush]?st.brush:'steel';s.trailMode=['off','polish','scuff','coat'].includes(st.trailMode)?st.trailMode:'polish';lightUniforms.uBounded.value=s.bounded?1:0;postUniforms.uExposure.value=s.exposure;
 const w=data.workshop||{};workshop.scan=!!w.scan;workshop.belt=!!w.belt;workshop.speed=clamp(Number(w.speed)||1,.25,2);workshop.time=Number.isFinite(w.time)?w.time:0;workshop.beltDistance=Number.isFinite(w.beltDistance)?w.beltDistance:0;workshop.scanPosition=Number.isFinite(w.scanPosition)?w.scanPosition:0;updateConveyor();
 Object.assign(shield,{held:false,deployed:true,open:1,charging:false,charge:0,autoFire:false,recoil:0});disc.mode='suspended';disc.resumeMode='parked';disc.velocity.set(0,0,0);disc.trailLast=null;
 for(const p of [...projectiles,...sparks])scene.remove(p.mesh);projectiles.length=sparks.length=0;
 if(s.photo)togglePhoto();s.selected=0;s.solo=-1;setScene(st.scene||'bay',{configure:false,save:false});setMode('playground');s.frozen=true;setTool('workshop');setSurfaceView(0);setBrushMode(st.brushMode);syncPalette();refreshLightList();syncLightUI();
 camera.position.set(...data.camera.position);orbitTarget.set(...data.camera.target);camera.lookAt(orbitTarget);cameraTween=null;updateAllLights();syncScannerGeometry();invalidate();syncGlobalUI();toast('Workshop restored and frozen. Resume when ready.');return true;
}
function downloadSetup(){const data=JSON.stringify(exportSetup()),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ARC_Surface_Works_setup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Setup saved: lights, finishes, paint and camera.');}
function openPaper(){closeModal('about');closeModal('settings');$('paper').classList.add('open');keys.clear();$('closePaper').focus();}
for(const id of ['paperBtn','paperCredit','workPaper'])$(id).onclick=openPaper;
$('closePaper').onclick=()=>closeModal('paper');$('paper').addEventListener('pointerdown',e=>{if(e.target===$('paper'))closeModal('paper');});
$('scanToggle').onclick=()=>{workshop.scan=!workshop.scan;if(workshop.scan){ensureLive();if(!lights[1])makeLight(1,{name:'Inspection scanner',width:4.2,height:.64,position:vec(1.6,5.08,-1),rotation:new T.Euler(PI/2,0,0,'YXZ'),intensity:6.5,color:'#ffc58c'});lights[1].enabled=true;updateLight(lights[1]);refreshLightList();}syncWorkshopUI();};
$('beltToggle').onclick=()=>{workshop.belt=!workshop.belt;if(workshop.belt)ensureLive();syncWorkshopUI();};
$('workSpeed').oninput=e=>{workshop.speed=+e.target.value;syncWorkshopUI();};
$('startPainting').onclick=()=>{setMode('playground');setTool('paint');setBrushMode('coat');};
$('runPolisher').onclick=()=>{s.trailMode='polish';rollDisc();};$('rollDisc').onclick=rollDisc;
$('pauseWorkshop').onclick=toggleFreeze;$('focusSpecimens').onclick=()=>cameraBookmark('samples');$('focusFloor').onclick=()=>cameraBookmark('floor');$('workHome').onclick=()=>cameraBookmark('home');
$('workShield').onclick=()=>{setTool('shield');};$('workDisc').onclick=()=>setTool('disc');
$('discTrail').onchange=e=>{s.trailMode=e.target.value;disc.trailLast=null;};
$$('[data-brush-mode]').forEach(b=>b.onclick=()=>setBrushMode(b.dataset.brushMode));
$$('[data-surface-view]').forEach(b=>b.onclick=()=>setSurfaceView(b.dataset.surfaceView));
$('brushStrength').oninput=e=>{s.brushStrength=+e.target.value;$('brushStrengthValue').textContent=Math.round(s.brushStrength*100)+'%';};
$('undoPaint').onclick=undoPaint;$('clearPaint').onclick=clearPaint;$('polishedStrip').onclick=polishedStrip;
$('saveSetup').onclick=downloadSetup;$('loadSetup').onclick=()=>$('setupFile').click();
$('setupFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>6e6)throw Error('Setup file is too large.');await importSetup(await file.text());closeModal('settings');}catch(err){toast('Setup not loaded: '+err.message);}finally{e.target.value='';}};
$('boundedLights').onchange=e=>{s.bounded=e.target.checked;lightUniforms.uBounded.value=s.bounded?1:0;invalidate();};
const oldSetLightParam=setLightParam;
setLightParam=function(key,value){oldSetLightParam(key,value);syncScannerGeometry();};
const oldResetBay=resetBay;
resetBay=function(){
 workshop.scan=workshop.belt=true;workshop.speed=1;workshop.time=workshop.beltDistance=workshop.scanPosition=0;s.bounded=false;lightUniforms.uBounded.value=0;s.trailMode='polish';s.brush='steel';s.brushMode='coat';s.brushStrength=1;workshop.coatings=0;disc.trailLast=null;diagnosticResume={frozen:false,tool:'workshop'};
 oldResetBay();s.floorR=.46;floor.userData.pair.uniforms.uRoughness.value=.46;cleanFloor.userData.pair.uniforms.uRoughness.value=.46;helmet.rotation.y=-.32;if(rotor)rotor.rotation.x=0;syncPalette();updateConveyor();syncScannerGeometry();setTool('workshop');setBrushMode('coat');setSurfaceView(0);cameraBookmark('home',true);syncGlobalUI();
};
$('resetBtn').onclick=()=>{resetBay();closeModal('settings');};
// The callback uses the current function, so late-installed workshop behaviors
// remain testable without duplicated event handlers.
setBrushMode('coat');
function workshopChecks(){
 const out=[],check=(name,pass,detail='')=>out.push({name,pass:!!pass,detail});
 check('Three independently coatable moving specimens',specimens.length===3&&specimens.every(i=>i.main.length>0));
 check('Closed conveyor path position and tangent',trackPoint(0).position.distanceTo(trackPoint(trackLength).position)<1e-9&&trackPoint(.0001).tangent.distanceTo(trackPoint(trackLength-.0001).tangent)<.001);
 check('Shared mean target contains one pixel per slot',meanRT.width===1&&meanRT.height===MAX_LIGHTS);
 check('Paint textures use mipmaps',paintColorTex.generateMipmaps&&paintPropsTex.generateMipmaps&&paintColorTex.minFilter===T.LinearMipmapLinearFilter);
 check('No point/spot lighting introduced',!scene.getObjectByProperty('type','PointLight')&&!scene.getObjectByProperty('type','SpotLight'));
 check('Paper credit includes all four authors',$('paper').textContent.includes('Eric Heitz')&&$('paper').textContent.includes('Jonathan Dupuy')&&$('paper').textContent.includes('Stephen Hill')&&$('paper').textContent.includes('David Neubelt'));
 check('Conveyor has instanced treads',beltSlats?.isInstancedMesh&&beltSlats.count===80);
 check('Setup serialization carries paint and credit',exportSetup().format==='ARC-SURFACE-WORKS'&&exportSetup().credit.includes('SIGGRAPH 2016'));
 check('No workshop errors',debugErrors.length===0,debugErrors);return out;
}

// ARC v4 — focused scenes, one inspection workflow, and a real muzzle transform.
const exhibits = {}, exhibitSnapshots = new Map();
let exhibitsReady=false, exhibitTime=0, exhibitMotion=true, galleryOrbit=null, carRoot=null;
let carBodyMeshes=[],carPaintIndex=0,sceneVariant=0,launcherKick=0,launcherFlash=0,lastLauncherTarget=null,lastShot=null;
const v4State={sceneChanges:0,shots:0,inspectionEntries:0};
const sceneOrder=['gallery','studio','range','bay','clean'];
const floorSet = new Set([floor,cleanFloor]);
function activeFloor(){return exhibits[s.scene]?.floor || (s.scene==='clean'?cleanFloor:floor);}
function isPaintFloor(mesh){return floorSet.has(mesh);}
function newFloor(name,parent,base,r,m){const f=addSurface(name,new T.PlaneGeometry(24,28),vec(0,0,1),materialPair(base,r,m,1),parent);f.rotation.x=-PI/2;floorSet.add(f);Object.assign(f.userData.pair.uniforms,{uPaintEnabled:{value:1},uPaintColor:{value:paintColorTex},uPaintProps:{value:paintPropsTex}});return f;}
function basicMesh(geo,pos,material,parent){const mesh=new T.Mesh(geo,material);mesh.position.copy(pos);parent.add(mesh);return mesh;}
function exhibitSign(text,pos,w,parent,fg='#8a9da9'){return worldLabel(text,pos,w,fg,parent);}
function cylinder(name,radius,height,pos,pair,parent,segments=64){return addSurface(name,new T.CylinderGeometry(radius,radius,height,segments),vec(...pos),pair,parent);}
function metalRail(name,a,b,r,pair,parent){const A=vec(...a),B=vec(...b),mesh=addSurface(name,new T.CylinderGeometry(r,r,A.distanceTo(B),12),A.clone().lerp(B,.5),pair,parent);mesh.quaternion.setFromUnitVectors(vec(0,1,0),B.sub(A).normalize());return mesh;}
function setEmitter(id,props){const existing=lights[id];if(existing){emitterRoot.remove(existing.root);existing.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}const opts={...props,position:vec(...props.position),rotation:new T.Euler(...(props.rotation||[0,0,0]),'YXZ')};makeLight(id,opts);return lights[id];}
function pointEmitter(light,target){light.root.position.copy(light.position);light.root.lookAt(vec(...target));light.rotation.setFromQuaternion(light.root.quaternion,'YXZ');updateLight(light);}
function clearFlights(){for(const p of [...projectiles,...sparks])scene.remove(p.mesh);projectiles.length=sparks.length=0;disc.mode='parked';disc.velocity.set(0,0,0);disc.trailLast=null;shield.charging=false;shield.held=false;shield.autoFire=false;launcherKick=launcherFlash=0;}
function resetEmitterSlots(){
 for(const l of lights)if(l){emitterRoot.remove(l.root);l.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}lights.fill(null);
 for(let i=0;i<MAX_LIGHTS;i++){Object.assign(lightGPU[i],gpuLight());textureDirty.add(i);}
 setEmitter(0,{name:'Energy shield',shape:'hexagon',width:2.35,height:2.65,position:[0,1.85,-.3],intensity:5.2,color:'#67dfff',pattern:1,enabled:false});
 setEmitter(3,{name:'Polishing disc',shape:'disc',width:1.05,height:1.05,position:[2.8,.15,3],rotation:[-PI/2,0,0],intensity:5,color:'#b098ff',pattern:5,enabled:false});
 Object.assign(shield,{deployed:true,open:1,charge:0,recoil:0});s.solo=-1;
}
function buildGallery(){
 const root=new T.Group();root.name='Nocturne gallery';scene.add(root);
 const f=newFloor('Nocturne polished floor',root,'#526675',.105,.86);
 const dark=materialPair('#233142',.52,.35),trim=materialPair('#708091',.25,.92),plinth=materialPair('#172731',.39,.5);
 box('Gallery end wall',12.4,6.1,.3,[0,3.0,-6.2],dark,root,.06);
 box('Recess behind emitter',6.3,5.2,.12,[0,3,-5.98],materialPair('#101921',.8,.05),root,.1);
 for(const x of [-5.45,5.45]){
  box('Gallery side wall',.22,5.8,9.0,[x,2.9,-1.6],dark,root,.06);
  for(const z of [-5.5,-2.3,.9,4.1]){
   box('Architectural rib',.35,5.2,.32,[x-x/40,2.6,z],trim,root,.07);
   box('Rib dark insert',.075,4.7,.34,[x-x/36,2.65,z+.02],plinth,root,.025);
  }
  box('Floor reveal',.035,.035,11.2,[x-x/8,.025,-.25],trim,root,.008);
 }
 for(const z of [-5.5,-2.3,.9])box('Cross beam',11.1,.14,.3,[0,5.15,z],plinth,root,.04);
 exhibitSign('N O C T U R N E',[0,5.5,-5.99],4.3,root,'#93aabb');
 const copper=materialPair('#c1a788',.22,.94),pearl=materialPair('#afcbd3',.13,.95);
 galleryOrbit=new T.Group();root.add(galleryOrbit);
 for(const [x,pair] of [[-3.3,copper],[3.3,pearl]]){
  cylinder('Display base',1.15,.20,[x,.10,-1.35],plinth,root);
  cylinder('Display cap',1.07,.05,[x,.225,-1.35],trim,root);
  const g=new T.Group();g.position.set(x,1.43,-1.35);galleryOrbit.add(g);
  const shape=x<0?new T.TorusKnotGeometry(.67,.24,128,20,2,3):new T.TorusGeometry(.78,.31,32,96);
  const item=addSurface(x<0?'Bronze knot':'Polished silver loop',shape,vec(),pair,g);item.rotation.set(.12,.2,x<0?.45:PI/5);g.userData.spin=x<0?.13:-.17;
 }
 root.visible=false;
 return{root,floor:f,title:'Nocturne',subtitle:'Polygon silhouettes, color, and a polished floor.',camera:{pos:[3.6,3.35,11.5],target:[0,1.75,-2.2]},close:{pos:[4.1,2.0,8.1],target:[0,.85,-1.55]}};
}
function loftBody(parent,pair){
 const profile=[[-2.28,.54,.62,.84],[-2.05,.84,.48,1.02],[-1.45,1.0,.43,1.04],[-.7,.99,.44,1.03],[.15,.98,.45,1.04],[.92,.95,.46,1.02],[1.66,.87,.49,.92],[2.08,.68,.57,.77],[2.23,.42,.63,.7]];
 const loCurve=new T.CatmullRomCurve3(profile.map(([z,w,lo,hi])=>vec(w,lo,z))),hiCurve=new T.CatmullRomCurve3(profile.map(([z,w,lo,hi])=>vec(w,hi,z)));const rings=Array.from({length:49},(_,i)=>{const a=loCurve.getPoint(i/48),b=hiCurve.getPoint(i/48);return[a.z,a.x,a.y,b.y];});
 const pos=[],uv=[],idx=[],N=48;
 for(let j=0;j<rings.length;j++){const[z,w,lo,hi]=rings[j];for(let k=0;k<=N;k++){const a=k/N*TAU,x=Math.sin(a)*w;const c=Math.cos(a),y=(hi+lo)*.5+(hi-lo)*.5*Math.sign(c)*Math.pow(Math.abs(c),.64);pos.push(x,y,z);uv.push(k/N,j/(rings.length-1));}}
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<N;k++){let a=j*(N+1)+k,b=a+N+1;idx.push(a,b,a+1,a+1,b,b+1);}
 // Close the end rings; this is a painted body, not a hollow shell.
 for(const [j,flip] of [[0,true],[rings.length-1,false]]){const c=pos.length/3;pos.push(0,(rings[j][2]+rings[j][3])*.5,rings[j][0]);uv.push(.5,.5);for(let k=0;k<N;k++){let a=j*(N+1)+k;idx.push(...(flip?[c,a+1,a]:[c,a,a+1]));}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
 const mesh=addSurface('Roadster body',geo,vec(),pair,parent);carBodyMeshes.push(mesh);return mesh;
}
function canopy(parent){
 // An arched, tapered canopy. Controlled rings avoid intersecting slab windows.
 const profile=[[-1.0,.66,1.0],[-.70,.63,1.44],[-.25,.61,1.60],[.35,.57,1.51],[.93,.54,1.01]],curve=new T.CatmullRomCurve3(profile.map(([z,w,h])=>vec(w,h,z))),rings=Array.from({length:33},(_,i)=>{const p=curve.getPoint(i/32);return[p.z,p.x,p.y];}),verts=[],uv=[],idx=[],N=32;
 for(let j=0;j<rings.length;j++)for(let k=0;k<=N;k++){const a=k/N*PI,[z,w,h]=rings[j];verts.push(Math.cos(a)*w,1.0+Math.sin(a)*(h-1),z);uv.push(k/N,j/(rings.length-1));}
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<N;k++){let a=j*(N+1)+k,b=a+N+1;idx.push(a,a+1,b,a+1,b+1,b);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
 const m=addSurface('Smoked canopy',geo,vec(),materialPair('#405768',.11,.95),parent);m.material.side=T.DoubleSide;m.userData.pair.ref.side=T.DoubleSide;
 for(const x of [-1,1])tube('Canopy bright trim',rings.map(([z,w,h])=>[x*w,1.015,z]),.018,mat.steel,parent);
 for(const j of [8,24]){const[z,w,h]=rings[j],pts=[];for(let k=0;k<=20;k++){let a=k/20*PI;pts.push([Math.cos(a)*w,1.0+Math.sin(a)*(h-1),z]);}tube('Canopy frame',pts,.024,mat.frame,parent);}
}
function buildStudio(){
 const root=new T.Group();root.name='Softbox automotive studio';scene.add(root);
 const f=newFloor('Studio satin floor',root,'#9cabb2',.27,.4);
 const wall=materialPair('#8e9ea5',.92,0),dark=materialPair('#18232c',.6,.4),bright=materialPair('#b7cbd4',.2,1);
 // Continuous cyclorama bends the floor upward without a harsh vertical seam.
 const points=[];for(let k=0;k<=24;k++){const a=k/24*PI/2;points.push([2*(1-Math.cos(a)),-5-2*Math.sin(a)]);}points.push([7,-7]);
 const p=[],u=[],ind=[];points.forEach(([y,z],j)=>{p.push(-12,y,z,12,y,z);u.push(0,j/25,1,j/25);if(j){let a=(j-1)*2;ind.push(a,a+1,a+2,a+1,a+3,a+2);}});
 const cg=new T.BufferGeometry();cg.setAttribute('position',new T.Float32BufferAttribute(p,3));cg.setAttribute('uv',new T.Float32BufferAttribute(u,2));cg.setIndex(ind);cg.computeVertexNormals();addSurface('Continuous cyclorama',cg,vec(),wall,root);
 cylinder('Turntable base',3.0,.16,[0,.08,0],dark,root,96);cylinder('Turntable satin top',2.92,.035,[0,.18,0],materialPair('#5c6c78',.35,.67),root,96);
 const turntableRim=addSurface('Turntable rim',new T.TorusGeometry(2.93,.025,8,128),vec(0,.22,0),bright,root);turntableRim.rotation.x=PI/2;
 carRoot=new T.Group();carRoot.position.y=.2;carRoot.rotation.y=-.55;root.add(carRoot);
 const bodyPair=materialPair('#cb5f36',.21,.6);loftBody(carRoot,bodyPair);canopy(carRoot);
 box('Lower sill',1.65,.18,3.50,[0,.48,0],dark,carRoot,.08);
 for(const z of [-1.4,1.38])for(const x of [-1.01,1.01]){
  const wheel=addSurface('Tire',new T.CylinderGeometry(.48,.48,.26,48),vec(x,.48,z),materialPair('#20272b',.83,0),carRoot);wheel.rotation.z=PI/2;
  const hub=addSurface('Alloy wheel',new T.CylinderGeometry(.34,.34,.28,48),vec(x,.48,z),bright,carRoot);hub.rotation.z=PI/2;
  const cover=addSurface('Inset wheel face',new T.CylinderGeometry(.255,.255,.37,40),vec(x,.48,z),dark,carRoot);cover.rotation.z=PI/2;
  for(let k=0;k<5;k++){const a=k/5*TAU;const spoke=box('Wheel spoke',.024,.42,.052,[x+(x>0?.23:-.23),.48+Math.sin(a)*.06,z+Math.cos(a)*.06],bright,carRoot,.007);spoke.rotation.x=a;}
  const cap=addSurface('Wheel center',new T.SphereGeometry(.085,16,12),vec(x+(x>0?.255:-.255),.48,z),mat.orange,carRoot);cap.scale.x=.18;
 }
 // Dark bumper openings and actual surface trim — no hidden punctual lighting.
 for(const z of [-2.08,2.10]){box('Bumper insert',1.15,.13,.05,[0,.66,z],dark,carRoot,.035);for(const x of [-.48,.48])box('Lamp cover',.33,.09,.038,[x,.82,z<0?-2.13:2.12],z<0?bright:mat.orange,carRoot,.025);}
 for(const x of [-1,1]){box('Side intake',.024,.11,.46,[x*.985,.72,.6],dark,carRoot,.025);const mirror=box('Mirror',.22,.09,.19,[x*.8,1.15,.65],bodyPair,carRoot,.025);carBodyMeshes.push(mirror);}
 exhibitSign('S T U D I O  /  0 2',[0,4.9,-6.95],3.7,root,'#70838e');
 root.visible=false;
 return{root,floor:f,title:'Softbox studio',subtitle:'Broad sources sliding over a curved painted body.',camera:{pos:[5.7,3.2,7.4],target:[0,1.05,0]},close:{pos:[3.3,2.0,4.8],target:[0,.95,.15]}};
}
const fixtureRigs=new Map();
function buildStudioFixtures(){
 const p=materialPair('#455462',.45,.72),back=materialPair('#263340',.8,.05);
 for(const id of [1,2,4]){
  const rig=new T.Group(),head=new T.Group();rig.name='Softbox stand '+id;exhibits.studio.root.add(rig,head);
  const pole=addSurface('Light stand',new T.CylinderGeometry(.023,.04,1,12),vec(),p,rig);
  const socket=cylinder('Stand swivel',.072,.11,[0,0,0],p,rig,16);
  for(let k=0;k<3;k++){let a=k/3*TAU;metalRail('Stand foot',[0,.16,0],[Math.cos(a)*.52,.055,Math.sin(a)*.52],.018,p,rig);}
  const panel=box('Softbox backing',1,1,.065,[0,0,-.045],back,head,.018);
  fixtureRigs.set(id,{rig,head,pole,socket,panel});
 }
}
function syncFixture(l){
 const f=fixtureRigs.get(l.id);if(!f)return;
 f.rig.visible=f.head.visible=s.scene==='studio'&&l.enabled&&(s.solo<0||s.solo===l.id);
 const p=l.position.clone().addScaledVector(lightGPU[l.id].N,-.12),height=Math.max(.25,p.y);
 f.rig.position.set(p.x,0,p.z);f.pole.position.y=height/2;f.pole.scale.y=height;f.socket.position.y=height;
 f.head.position.copy(l.position);f.head.quaternion.copy(l.root.quaternion);f.panel.scale.set(l.width,l.height,1);f.panel.visible=l.shape==='rectangle';
}
const v4OriginalUpdateLight=updateLight;updateLight=function(l){v4OriginalUpdateLight(l);if(exhibitsReady)syncFixture(l);};
function buildRange(){
 const root=new T.Group();root.name='Impact range';scene.add(root);
 const f=newFloor('Range polished runway',root,'#718292',.18,.85),dark=materialPair('#263642',.65,.38),metal=materialPair('#8395a5',.3,.9);
 box('Range backstop',10,4.8,.25,[0,2.4,-5.95],dark,root,.1);
 for(const x of [-4.75,4.75]){box('Backstop pilaster',.28,4.8,.4,[x,2.4,-5.65],metal,root);box('Runway side curb',.2,.17,11.0,[x,.085,-.1],dark,root);}
 for(let i=0;i<5;i++){const r=1.05+i*.39;const ring=addSurface('Target concentric ring',new T.TorusGeometry(r,.016,6,64),vec(0,2.2,-5.79),metal,root);}
 for(const x of [-3.3,3.3])for(const z of [-3.3,-1,1.3,3.6,5.9])box('Runway marker',.08,.012,.62,[x,.007,z],mat.orange,root,.004);
 exhibitSign('I M P A C T  /  0 3',[0,4.24,-5.79],3.5,root,'#9ebbc9');
 // Three finish samples on the backstop make changes in highlight width readable.
 for(let i=0;i<3;i++){const p=materialPair(['#91aebc','#c19c64','#afb8c0'][i],[.1,.3,.6][i],1);const m=box('Range finish panel',1.02,1.36,.06,[-3.4+i*3.4,1.7,-5.7],p,root,.09);}
 root.visible=false;
 return{root,floor:f,title:'Impact range',subtitle:'Aim, pulse, and watch the shield light the runway.',camera:{pos:[6.15,3.55,9.5],target:[-.35,1.45,-.55]},close:{pos:[2.45,2.15,6.5],target:[-1.2,1.1,1.0]}};
}
// The muzzle lives on the same aimed/recoiling transform as the actual barrel.
const recoilRoot=new T.Group();turret.add(recoilRoot);recoilRoot.add(barrel);
const launcherBody=turret.children.find(o=>o.name==='Launcher body');if(launcherBody)recoilRoot.add(launcherBody);
barrel.geometry.dispose();barrel.geometry=new T.CylinderGeometry(.13,.16,.9,32,1,true);
const muzzleLip=addSurface('Muzzle lip',new T.TorusGeometry(.14,.023,10,32),vec(0,0,.65),mat.steel,recoilRoot);
const bore=addSurface('Muzzle bore',new T.CircleGeometry(.12,32),vec(0,0,.61),mat.dark,recoilRoot);
const muzzleSocket=new T.Object3D();muzzleSocket.position.set(0,0,.676);recoilRoot.add(muzzleSocket);
const muzzleFlashMesh=basicMesh(new T.ConeGeometry(.11,.30,7),vec(0,0,.15),new T.MeshBasicMaterial({color:new T.Color(4,2.8,1.0),transparent:true,opacity:0,depthWrite:false}),muzzleSocket);muzzleFlashMesh.rotation.x=PI/2;muzzleFlashMesh.visible=false;
function aimLauncher(target,immediate=false,dt=1/60){
 launcher.updateWorldMatrix(true,true);const local=target.clone().sub(turret.getWorldPosition(vec())).normalize();
 const parentQ=launcher.getWorldQuaternion(new T.Quaternion()).invert();local.applyQuaternion(parentQ);
 const q=new T.Quaternion().setFromUnitVectors(vec(0,0,1),local);if(immediate)turret.quaternion.copy(q);else turret.quaternion.slerp(q,1-Math.exp(-dt*18));
 turret.updateWorldMatrix(true,true);
}
function launcherTarget(){const l=lights[0],g=lightGPU[0];let p=v2();for(let i=0;i<40;i++){p.set((Math.random()-.5)*.65,(Math.random()-.5)*.6);if(inside2D(p,l.outline))break;}return l.position.clone().addScaledVector(g.U,p.x*g.size.x).addScaledVector(g.V,p.y*g.size.y);}
fireProjectile=function(){
 ensureLive();if(!isVisible(launcher)){toast('Open the Impact range or Workshop to use the launcher.');return;}
 const l=lights[0];l.enabled=true;shield.deployed=true;if(shield.open<.98){shield.open=1;l.scale=1;}updateLight(l);
 const target=launcherTarget();lastLauncherTarget=target.clone();recoilRoot.position.z=0;aimLauncher(target,true);
 const origin=muzzleSocket.getWorldPosition(vec()),direction=vec(0,0,1).applyQuaternion(muzzleSocket.getWorldQuaternion(new T.Quaternion())).normalize();
 const mesh=new T.Mesh(projectileGeo,projectileMat);mesh.position.copy(origin);scene.add(mesh);
 const projectile={mesh,velocity:direction.clone().multiplyScalar(15),age:0,spawn:origin.clone(),target:target.clone()};projectiles.push(projectile);
 lastShot={origin:origin.toArray(),muzzle:origin.toArray(),direction:direction.toArray(),target:target.toArray(),time:simTime};v4State.shots++;
 launcherKick=.085;launcherFlash=.07;muzzleFlashMesh.visible=true;muzzleFlashMesh.material.opacity=1;
 if(projectiles.length>24)scene.remove(projectiles.shift().mesh);invalidate();tone(530,.075,.025,115);
};
function stepLauncher(dt){
 if(!isVisible(launcher))return;launcherFlash=Math.max(0,launcherFlash-dt);launcherKick*=Math.exp(-dt*18);recoilRoot.position.z=-launcherKick;
 muzzleFlashMesh.visible=launcherFlash>0;muzzleFlashMesh.material.opacity=launcherFlash/.07;
 const target=launcherFlash>0&&lastLauncherTarget?lastLauncherTarget:lights[0].position;aimLauncher(target,false,dt);
 if(shield.autoFire||projectiles.length||launcherKick>.0001)sceneDirty=true;
}
function rememberExhibit(){
 if(!exhibitsReady||!exhibits[s.scene])return;
 const data=exportSetup();exhibitSnapshots.set(s.scene,{lights:data.lights,paintA:paintCTX.getImageData(0,0,PAINT_SIZE,PAINT_SIZE),paintB:propsCTX.getImageData(0,0,PAINT_SIZE,PAINT_SIZE),camera:data.camera,floorR:activeFloor().userData.pair.uniforms.uRoughness.value,selected:s.selected,exposure:s.exposure,frozen:s.frozen,motion:exhibitMotion,time:exhibitTime,variant:sceneVariant,carPaintIndex});
}
function configureExhibit(name){
 resetEmitterSlots();
 if(name==='bay'){
  lights[0].enabled=true;lights[0].position.set(-.25,1.9,.15);lights[0].rotation.set(-.1,-.24,0);lights[0].intensity=5.5;
  setEmitter(1,{name:'Inspection scanner',shape:'rectangle',width:4.6,height:.60,position:[1.6,5.08,-.55],rotation:[PI/2,0,0],intensity:6.5,color:'#ffd39c',pattern:0});
  setEmitter(2,{name:'Animated wall panel',shape:'rectangle',width:3.04,height:1.5,position:[3.35,4.47,-5.89],intensity:5.5,color:'#ffffff',pattern:2});lights[3].enabled=true;s.selected=0;s.exposure=1.10;
 }else if(name==='gallery'){
  setEmitter(1,{name:'Star installation',shape:'star',width:4.0,height:4.0,position:[0,3.12,-4.65],intensity:6.1,color:'#ffd3ec',pattern:2});
  const sideA=setEmitter(2,{name:'Cyan side panel',shape:'rectangle',width:1.15,height:3.25,position:[-4.5,2.40,-.15],intensity:5.0,color:'#69daf0',pattern:0});pointEmitter(sideA,[0,1,-1]);
  const sideB=setEmitter(4,{name:'Amber side panel',shape:'rectangle',width:1.15,height:3.25,position:[4.5,2.4,-2.1],intensity:4.5,color:'#ff986a',pattern:0});pointEmitter(sideB,[0,1,-1]);s.selected=1;s.exposure=1.08;
 }else if(name==='studio'){
  const key=setEmitter(1,{name:'Warm softbox',shape:'rectangle',width:3.4,height:2.35,position:[-3.8,3.8,1.35],intensity:5.8,color:'#ffdfb7',pattern:0,twoSided:false});pointEmitter(key,[0,.9,0]);
  const fill=setEmitter(2,{name:'Cool strip',shape:'rectangle',width:.65,height:3.55,position:[3.5,2.8,-.5],intensity:6.1,color:'#acdfff',pattern:0,twoSided:false});pointEmitter(fill,[0,1,0]);
  const top=setEmitter(4,{name:'Overhead softbox',shape:'rectangle',width:3.3,height:1.25,position:[0,4.4,-2.5],intensity:4.3,color:'#fff4e0',pattern:0,twoSided:false});pointEmitter(top,[0,.8,0]);s.selected=1;s.exposure=1.08;
 }else if(name==='range'){
  lights[0].enabled=true;lights[0].position.set(0,1.95,-.65);lights[0].rotation.set(-.03,-.17,0);lights[0].intensity=5.2;
  const rim=setEmitter(1,{name:'Range strip',shape:'rectangle',width:4.0,height:.45,position:[0,4.2,-3.5],intensity:5,color:'#ffc784',pattern:0});pointEmitter(rim,[0,.1,1]);s.selected=0;s.exposure=1.08;
 }else{
  setEmitter(1,{name:'Polygon study',shape:'star',width:2.65,height:2.65,position:[.2,2.8,-1.35],intensity:6,color:'#fff0d4',pattern:0});s.selected=1;s.exposure=1.12;
 }
 updateAllLights();refreshLightList();
}
function showExhibitRoots(name){for(const [id,x]of Object.entries(exhibits))x.root.visible=id===name;launcher.parent?.remove(launcher);(name==='range'?exhibits.range.root:bay).add(launcher);launcher.position.set(...(name==='range'?[-3.6,.40,3.0]:[-5.5,.4,3.0]));launcher.visible=name==='range'||name==='bay';syncScannerGeometry();}
setScene=function(name,opts={}){
 if(!exhibitsReady)return;name=exhibits[name]?name:'gallery';
 if(opts.save!==false)rememberExhibit();if(s.mode!=='playground')setMode('playground');
 s.scene=name;exhibitTime=0;sceneVariant=0;exhibitMotion=true;cameraTween=null;drag=null;keys.clear();clearFlights();
 showExhibitRoots(name);
 if(opts.reset)resetActiveFinishes();
 if(opts.configure!==false){
  const saved=opts.reset?null:exhibitSnapshots.get(name);
  if(saved){
   resetEmitterSlots();for(const l of [...lights])if(l){emitterRoot.remove(l.root);l.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}lights.fill(null);for(const g of lightGPU){g.count=0;g.radiance.set(0,0,0);}
   for(const l of saved.lights)makeLight(l.id,{...l,position:vec(...l.position),rotation:new T.Euler(...l.rotation,'YXZ'),outline:l.outline.map(v=>v2(...v))});
   paintCTX.putImageData(saved.paintA,0,0);propsCTX.putImageData(saved.paintB,0,0);activeFloor().userData.pair.uniforms.uRoughness.value=saved.floorR;
   s.selected=lights[saved.selected]?saved.selected:1;s.exposure=saved.exposure;exhibitMotion=saved.motion;exhibitTime=saved.time;sceneVariant=saved.variant;carPaintIndex=saved.carPaintIndex;
   camera.position.set(...saved.camera.position);orbitTarget.set(...saved.camera.target);camera.lookAt(orbitTarget);
  }else{
   configureExhibit(name);paintCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);propsCTX.clearRect(0,0,PAINT_SIZE,PAINT_SIZE);activeFloor().userData.pair.uniforms.uRoughness.value=exhibits[name].roughness;
   applySceneCamera('home',true);
  }
  s.frozen=saved?!!saved.frozen:false;s.solo=-1;setSurfaceView(0);paintChanged();paintHistory.length=0;
 }
 s.floorR=activeFloor().userData.pair.uniforms.uRoughness.value;point={P:reflectionPoint(lights[s.selected]||lights[0]),N:vec(0,1,0),mesh:activeFloor()};
 postUniforms.uExposure.value=s.exposure;updateAllLights();aimLauncher(lights[0].position,true);refreshLightList();setTool('workshop');syncLightUI();syncSceneUI();closeSceneMenu();v4State.sceneChanges++;invalidate();
};
function applySceneCamera(kind='home',instant=false){const x=exhibits[s.scene],b=kind==='close'?x.close:x.camera;if(!b)return;const p=vec(...b.pos),look=vec(...b.target);if(instant){camera.position.copy(p);orbitTarget.copy(look);camera.lookAt(look);cameraTween=null;}else cameraTween={start:camera.position.clone(),target:orbitTarget.clone(),end:p,look,t:0};invalidate();}
const previousBookmark=cameraBookmark;
cameraBookmark=function(name,instant=false){if(exhibitsReady&&(name==='home'||name==='close')){applySceneCamera(name,instant);return;}previousBookmark(name,instant);};
function changeShape(){const l=selectedLight(),shapes=['star','rectangle','hexagon','triangle'];l.shape=shapes[(shapes.indexOf(l.shape)+1)%shapes.length];l.outline=polygon2D(l.shape);rebuildLight(l);resetSculptor();syncLightUI();syncSceneUI();}
function changeCarPaint(){const colors=['#cb5f36','#a2b7c3','#195662','#d0b882','#772e3e'];carPaintIndex=(carPaintIndex+1)%colors.length;for(const m of carBodyMeshes){const p=m.userData.pair;if(!m.userData.originalPair)m.userData.originalPair=p;m.userData.pair=coatingPair(colors[carPaintIndex],p.uniforms.uRoughness.value,.65,0);m.material=m.userData.pair.ltc;}invalidate();}
function scenePrimary(){
 if(s.scene==='gallery'||s.scene==='clean'){selectLight(1);changeShape();}
 else if(s.scene==='studio')changeCarPaint();else if(s.scene==='range')fireProjectile();else{s.trailMode='polish';rollDisc();}
}
function sceneSecondary(){
 if(s.scene==='gallery'){sceneVariant++;const palettes=[['#69daf0','#ff986a','#ffd3ec'],['#9fafef','#ee7489','#ffffff'],['#8eeaa1','#f7cc7b','#ffffff']];const c=palettes[sceneVariant%palettes.length];lights[2].color=c[0];lights[4].color=c[1];lights[1].color=c[2];updateAllLights();syncLightUI();}
 else if(s.scene==='studio'){exhibitMotion=!exhibitMotion;syncSceneUI();}
 else if(s.scene==='range'){shield.autoFire=!shield.autoFire;shield.nextShot=.12;if(shield.autoFire)ensureLive();syncGlobalUI();}
 else if(s.scene==='bay')cameraBookmark('floor');else{const l=lights[1];l.pattern=l.pattern?0:2;textureDirty.add(1);updateLight(l);}
 syncSceneUI();
}
function sceneSlider(v){
 if(s.scene==='studio'){for(const m of carBodyMeshes){const p=m.userData.pair;const next=coatingPair('#'+p.uniforms.uBase.value.clone().convertLinearToSRGB().getHexString(),v,p.uniforms.uMetalness.value,0);if(!m.userData.originalPair)m.userData.originalPair=p;m.userData.pair=next;m.material=next.ltc;}}
 else if(s.scene==='range'){const l=lights[0];l.height=v*1.13;l.width=v;updateLight(l);}
 else if(s.scene==='bay')workshop.speed=v;else{s.floorR=v;activeFloor().userData.pair.uniforms.uRoughness.value=v;}
 syncSceneUI();invalidate();
}
function stepExhibit(dt){
 if(!exhibitsReady)return;stepLauncher(dt);
 if(!exhibitMotion)return;exhibitTime+=dt;
 if(s.scene==='gallery'){
  for(const g of galleryOrbit.children)g.rotation.y=exhibitTime*g.userData.spin;
  if(lights[1]&&!drag&&s.tool!=='lights'&&s.tool!=='shape'){const l=lights[1];l.rotation.y=Math.sin(exhibitTime*.23)*.23;l.rotation.z=Math.sin(exhibitTime*.16)*.16;updateLight(l);}
  sceneDirty=dirtyRef=dirtyInspector=true;
 }else if(s.scene==='studio'){carRoot.rotation.y=-.55+exhibitTime*.115;sceneDirty=dirtyRef=dirtyInspector=true;}else if(s.scene==='range'&&s.tool==='workshop'&&!shield.held&&lights[0]){lights[0].rotation.y=-.17+Math.sin(exhibitTime*.45)*.24;updateLight(lights[0]);}
}
function syncSceneUI(){
 if(!exhibitsReady)return;const x=exhibits[s.scene];if(!x)return;
 $('sceneMenuBtn').textContent='Scenes ▾';$('sceneMenuBtn').setAttribute('aria-label','Choose a scene. Current: '+x.title);$('scenePanelTitle').textContent=x.title;$('scenePanelHint').textContent=x.subtitle;
 $('sceneTitle').textContent=x.title;$('sceneTag').textContent='Area light studies / '+String(sceneOrder.indexOf(s.scene)+1).padStart(2,'0');$('sceneHint').textContent='';
 $('sceneCurrent').textContent=x.title;document.body.dataset.exhibit=s.scene;
 const primary={gallery:'Change light shape',studio:'Change car paint',range:'Fire a shot',bay:'Roll a polish trail',clean:'Change light shape'};
 const secondary={gallery:'Swap light colors',studio:exhibitMotion?'Stop turntable':'Start turntable',range:shield.autoFire?'Auto fire · On':'Auto fire · Off',bay:'View painted floor',clean:'Toggle texture'};
 $('scenePrimary').textContent=primary[s.scene];$('sceneSecondary').textContent=secondary[s.scene];
 const range=$('sceneAdjustment');const defs=s.scene==='studio'?['Body roughness',.05,1,.01,carBodyMeshes[0].userData.pair.uniforms.uRoughness.value]:s.scene==='range'?['Shield size',.8,4,.02,lights[0].width]:s.scene==='bay'?['Scanner speed',.25,2,.05,workshop.speed]:['Floor roughness',.04,1,.01,activeFloor().userData.pair.uniforms.uRoughness.value];
 $('sceneAdjustmentLabel').textContent=defs[0];range.min=defs[1];range.max=defs[2];range.step=defs[3];if(document.activeElement!==range)range.value=defs[4];$('sceneAdjustmentValue').textContent=Number(defs[4]).toFixed(2)+(s.scene==='range'?' m':s.scene==='bay'?'×':'');
 $('sceneSelect').value=s.scene;$('sceneMotion').textContent=exhibitMotion?'Movement on':'Movement off';$('sceneMotion').hidden=s.scene==='studio';
 $$('[data-exhibit]').forEach(b=>{if(b.tagName==='BUTTON')b.classList.toggle('active',b.dataset.exhibit===s.scene);});
 const toys=s.scene==='range'||s.scene==='bay';$$('#tooltray [data-tool=shield],#tooltray [data-tool=disc]').forEach(b=>b.hidden=!toys);
 $('bayControls').hidden=s.scene!=='bay';
 $('freezeBtn').textContent=s.frozen?'Play':'Pause';
 if(s.mode!=='playground'){$('sceneTitle').textContent=s.mode==='explain'?'Inspect a surface':'';$('sceneHint').textContent=s.mode==='explain'?'Click the scene to move the pinned point.':'';}
}
const prevSyncGlobalUI=syncGlobalUI;syncGlobalUI=function(){prevSyncGlobalUI();syncSceneUI();};
const prevSetTool=setTool;setTool=function(tool){const closed=document.body.classList.contains('controlsClosed');prevSetTool(tool);document.body.classList.remove('controlsClosed');$('sidebar').scrollTop=0;syncSceneUI();if(closed&&ready)resize();};
const prevSetMode=setMode;setMode=function(mode){
 const before=s.mode;prevSetMode(mode);document.body.classList.toggle('diagnostic',mode!=='playground');
 if(before==='playground'&&mode!=='playground')v4State.inspectionEntries++;
 if(mode!=='playground'){document.body.classList.remove('controlsClosed');if(mode==='compare')$$('.toolPane').forEach(p=>p.classList.remove('visible'));}
 $('sidebar').scrollTop=0;syncSceneUI();if(ready)resize();
};
function openInspector(){
 if(s.mode!=='playground')return;const id=lights[s.selected]?.enabled?s.selected:lights.find(l=>l?.enabled)?.id||0;
 selectLight(id);point={P:reflectionPoint(lights[id]),N:vec(0,1,0),mesh:activeFloor()};setStep(0);setMode('explain');$('mode-playground').focus();
}
function closeInspector(){if(s.mode!=='playground'){setMode('playground');$('inspectOpen').focus();}}
function closeSceneMenu(){$('sceneMenu').classList.remove('open');$('sceneMenuBtn').setAttribute('aria-expanded','false');}
function openSceneMenu(){$('sceneMenu').classList.toggle('open');$('sceneMenuBtn').setAttribute('aria-expanded',String($('sceneMenu').classList.contains('open')));keys.clear();}
const prevModalOpen=modalOpen;modalOpen=function(){return prevModalOpen()||$('sceneMenu').classList.contains('open');};
function initV4(){
 // Preserve every v3 receiver ID; new muzzle meshes were constructed before its workshop.
 for(const m of [muzzleLip,bore]){const i=customMeshes.indexOf(m);if(i>=0)customMeshes.splice(i,1);}customMeshes.push(muzzleLip,bore);
 exhibits.bay={root:bay,floor,title:'Surface works',subtitle:'Paint finishes. Roll trails. Let the scanner reveal them.',camera:{pos:[7.6,4.8,10.2],target:[.1,1.35,-1.2]},close:{pos:[5.5,3.3,7.3],target:[0,.4,1]}};
 exhibits.clean={root:clean,floor:cleanFloor,title:'Reference studio',subtitle:'A clean scene for inspecting the approximation.',camera:{pos:[7,4.0,10.2],target:[0,1,-.7]},close:{pos:[4.6,2.8,7],target:[0,.6,-.3]}};
 exhibits.gallery=buildGallery();exhibits.studio=buildStudio();exhibits.range=buildRange();buildStudioFixtures();
 for(const x of Object.values(exhibits))x.roughness=x.floor.userData.pair.uniforms.uRoughness.value;
 customMeshes.forEach((m,i)=>m.userData.sessionID=i);exhibitsReady=true;
 $('sceneSelect').innerHTML=sceneOrder.map(id=>`<option value="${id}">${exhibits[id].title}</option>`).join('');
 $('sceneMenuBtn').onclick=openSceneMenu;$('sceneMenuClose').onclick=closeSceneMenu;
 $$('[data-exhibit]').filter(b=>b.tagName==='BUTTON').forEach(b=>b.onclick=()=>setScene(b.dataset.exhibit));
 $('inspectOpen').onclick=openInspector;$('mode-playground').onclick=closeInspector;
 $('scenePrimary').onclick=scenePrimary;$('sceneSecondary').onclick=sceneSecondary;$('sceneAdjustment').oninput=e=>sceneSlider(+e.target.value);
 $('sceneHome').onclick=()=>applySceneCamera('home');$('sceneClose').onclick=()=>applySceneCamera('close');
 $('sceneMotion').onclick=()=>{exhibitMotion=!exhibitMotion;syncSceneUI();};
 $('closeControls').onclick=()=>{document.body.classList.add('controlsClosed');resize();};
 $('testHit').onclick=fireProjectile;$('workHome').onclick=()=>applySceneCamera('home');
 $('autoFire').onclick=()=>{ensureLive();shield.autoFire=!shield.autoFire;shield.nextShot=.1;syncGlobalUI();};
 $('sceneSelect').onchange=e=>setScene(e.target.value);$('homeCamera').onclick=()=>applySceneCamera('home');
 // One entry to inspection; no surprise mode change when clicking editable geometry.
 toolHints.lights='Drag a light · Alt-drag to tilt · WASD move';toolHints.workshop='Drag to orbit · right-drag to look · WASD move';toolHints.probe='Click a surface · drag the diagram to orbit · Esc returns to scene';
 $('shapeBack').onclick=()=>setTool('lights');$('closeAnalysis').onclick=closeInspector;
 $('saveSetup').onclick=downloadSetup;
 $('resetBtn').onclick=()=>{exhibitSnapshots.delete(s.scene);setScene(s.scene,{reset:true,save:false});closeModal('settings');toast('Scene reset.');};
 setScene('gallery',{save:false});
}
function resetActiveFinishes(){for(const m of customMeshes)if(isVisible(m)&&m.userData.originalPair){m.userData.pair=m.userData.originalPair;m.material=m.userData.pair.ltc;delete m.userData.originalPair;}carPaintIndex=0;}
const prevLightParam=setLightParam;setLightParam=function(key,v){if(['gallery','range'].includes(s.scene)&&['x','y','z','yaw','pitch','roll'].includes(key))exhibitMotion=false;prevLightParam(key,v);};
const prevExportSetup=exportSetup;exportSetup=function(){const d=prevExportSetup();d.version=4;d.exhibit={motion:exhibitMotion,time:exhibitTime,variant:sceneVariant,carPaintIndex};return d;};
const prevImportSetup=importSetup;importSetup=async function(d){if(typeof d==='string')d=JSON.parse(d);const result=await prevImportSetup(d);s.floorR=clamp(Number(d.state?.floorR)||.18,.04,1);activeFloor().userData.pair.uniforms.uRoughness.value=s.floorR;if(d.exhibit){exhibitMotion=!!d.exhibit.motion;exhibitTime=Number.isFinite(d.exhibit.time)?d.exhibit.time:0;sceneVariant=d.exhibit.variant|0;carPaintIndex=d.exhibit.carPaintIndex|0;}syncSceneUI();return result;};
function v4Checks(){const out=[],test=(name,pass,detail='')=>out.push({name,pass:!!pass,detail});
 test('Seven actual scene roots',Object.keys(exhibits).length===7&&new Set(Object.values(exhibits).map(x=>x.root.uuid)).size===7);
 test('Exactly one scene is visible',Object.values(exhibits).filter(x=>x.root.visible).length===1);
 test('Every scene has a paintable floor',Object.values(exhibits).every(x=>isPaintFloor(x.floor)&&x.floor.userData.pair.uniforms.uPaintEnabled.value===1));
 test('Muzzle attached to physical barrel root',muzzleSocket.parent===barrel.parent&&barrel.parent===recoilRoot);
 test('Muzzle at visible forward bore',Math.abs(muzzleSocket.position.z-.676)<1e-8&&Math.abs(muzzleLip.position.z-.65)<1e-8);
 test('Only one Inspect entry',!$('inspectOpen').hidden&&$$('#tooltray [data-tool=probe]').length===0);
 test('Explicit Back to scene', $('mode-playground').textContent.includes('Back to scene'));
 test('Every scene has an authored camera',Object.values(exhibits).every(x=>x.camera.pos.length===3&&x.close.pos.length===3));
 test('Paper attribution retained', ['Eric Heitz','Jonathan Dupuy','Stephen Hill','David Neubelt'].every(n=>$('paper').textContent.includes(n)));
 test('No application errors',debugErrors.length===0,debugErrors);return out;}

/* V5_EXTENSION */

// Diagnostics expose the same objects and calculations used by the application.
function runChecks(){const results=[],test=(name,pass,detail='')=>results.push({name,pass:!!pass,detail});
 test('Embedded LUT data length',table.length===32768,table.length);test('All LUT coefficients finite',table.every(Number.isFinite));let det=true;for(let i=0;i<4096;i++){const k=i*4;if(table1[k]*table1[k+3]-table1[k+1]*table1[k+2]<=0)det=false;}test('4096 fitted matrices invertible',det);
 for(const shape of ['hexagon','rectangle','triangle','star','bolt','arrow','jagged','disc']){const p=polygon2D(shape),v=validateOutline(p);let area=0;for(const tri of v.triangles||[])area+=Math.abs(p[tri[1]].clone().sub(p[tri[0]]).cross(p[tri[2]].clone().sub(p[tri[0]])))*.5;test(shape+' valid and triangulated',v.valid&&Math.abs(area-Math.abs(polygonArea(p)))<1e-8,v.reason);}
 test('Self-intersecting outlines rejected',!validateOutline([v2(-.4,-.4),v2(.4,.4),v2(-.4,.4),v2(.4,-.4)]).valid);
 const quad=[vec(-1,-1,1),vec(1,-1,1),vec(1,1,1),vec(-1,1,1)],a=edgeSum(quad),b=edgeSum([...quad].reverse());test('Winding-independent oriented sum',Math.abs(a.E-b.E)<1e-12,a.E);test('Unit-square cosine integral',Math.abs(a.E-.554126423979572)<1e-8,a.E);
 const clip=clipPolygon([vec(-1,-1,-.5),vec(1,-1,1),vec(1,1,1),vec(-1,1,-.5)]);test('Horizon clipping above z=0',clip.length===4&&clip.every(v=>v.z>=-1e-12));
 const d=cpuPoint();test('Pinned integral finite and bounded',Number.isFinite(d.result.E)&&d.result.E>=0&&d.result.E<=1,d.result.E);
 let areas=true;for(const l of lights)if(l){const g=lightGPU[l.id];if(Math.abs(g.area-Math.abs(polygonArea(l.outline))*g.size.x*g.size.y)>1e-6)areas=false;if(l.tris.length!==l.outline.length-2)areas=false;}
 test('All emitter areas match triangulation domains',areas);if(window.__LTC.lastInvariant){const inv=window.__LTC.lastInvariant;test('Affine transform preserves every sampled hit',inv.hits===inv.hitsAfter,inv);}
 test('Light budget respected',lights.filter(Boolean).length<=5);test('Material maps attached to both floors',[floor,cleanFloor].every(f=>f.userData.pair.uniforms.uPaintEnabled.value===1));test('No application exceptions',!debugErrors.length,debugErrors);return results;
}
window.__LTC={v5,v4Checks,v4State,exhibits,activeFloor,openInspector,closeInspector,scenePrimary,sceneSecondary,sceneSlider,applySceneCamera,launcher,turret,barrel,muzzleSocket,muzzleLip,recoilRoot,aimLauncher,get projectiles(){return projectiles;},get lastShot(){return lastShot;},get exhibitTime(){return exhibitTime;},get carRoot(){return carRoot;},get carBodyMeshes(){return carBodyMeshes;},workshop,workshopChecks,rollDisc,exportSetup,importSetup,setBrushMode,stepWorkshop,specimens,scannerRig,paintCTX,propsCTX,paintColorTex,paintPropsTex,meanRT,workshopRoot,get cullStats(){return {...cullStats};},get filterMeans(){return filterMeans;},state:s,ready:false,renderer,camera,scene,inspectCamera,lights,lightGPU,shield,disc,colliders,floor,cleanFloor,mat,paintMaterials,bookmarks,textureDirty,runChecks,setMode,setTool,setScene,setStep,selectLight,setSurfaceView,solo,duplicateLight,removeLight,setLightParam,cameraBookmark,updateLight,updateAllLights,rebuildLight,polygon2D,validateOutline,polygonArea,cpuPoint,sampleTable,edgeSum,clipPolygon,simulate,throwDisc,recallDisc,suspendDisc,parkDisc,holdShield,toggleDeploy,startCharge,releaseCharge,fireProjectile,impactShield,polishedStrip,undoPaint,clearPaint,stampObject,sampleSurface,brushHit,toggleFreeze,togglePhoto,resetBay,resize,invalidate,renderTextures,
 probeReflection,reflectionPoint,get refFrames(){return refFrames;},get frameCount(){return frameNo;},get renderSize(){return[rtWidth,rtHeight];},get errors(){return debugErrors;},get point(){return point;},get worldVerts(){return worldVerts;},get contour(){return contour;},get paintCount(){return paintCount;},get targets(){return{mean:meanRT,ltc:rtLTC,reference:accA,sample:rtSample,raw:rawRT,filtered:filterRT};},get keys(){return Array.from(keys);},get projectileCount(){return projectiles.length;},get sparkCount(){return sparks.length;},get gpuTime(){return gpuMs;},
 pin(P,N=[0,1,0],mesh=null){point={P:vec(...P),N:vec(...N),mesh:mesh||(activeFloor())};invalidate();},
 setParam(key,value){if(key in lightGPU[0]||['x','y','z','width','height','yaw','pitch','roll','intensity'].includes(key))setLightParam(key,value);else{s[key]=value;if(key==='quality')resize();if(key==='fill')for(const p of pairs)p.uniforms.uFill.value=value?.14:0;if(key==='floorR')for(const f of [floor,cleanFloor])f.userData.pair.uniforms.uRoughness.value=value;invalidate();}syncLightUI();},
 samplePixel(kind,x,y){const rt=this.targets[kind];if(!rt)throw Error('Unknown target '+kind);const half=rt.texture.type===T.HalfFloatType,data=half?new Uint16Array(4):new Float32Array(4);renderer.readRenderTargetPixels(rt,clamp(x|0,0,rt.width-1),clamp(y|0,0,rt.height-1),1,1,data);return Array.from(data,v=>half?T.DataUtils.fromHalfFloat(v):v);}
};
try{
 initLights();initWorkshop();initV4();initV5();refreshLightList();setTool('workshop');syncPalette();setStep(0);cameraBookmark('home',true);point={P:reflectionPoint(lights[s.selected]),N:vec(0,1,0),mesh:activeFloor()};updateCompareUI();resize();syncGlobalUI();
 renderer.compile(scene,camera);renderer.compile(inspectScene,inspectCamera);ready=true;window.__LTC.ready=true;lastTime=lastFPS=performance.now();requestAnimationFrame(t=>{try{draw(t);$('loading').style.display='none';}catch(e){debugErrors.push(String(e));fatal('First render failed: '+e.message);console.error(e);}});
}catch(e){debugErrors.push(String(e));fatal('Startup failed: '+e.message);console.error(e);}
})();
