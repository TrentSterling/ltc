function mapForSurface(mesh){
 if(isPaintFloor(mesh))return {mesh,a:paintColor,b:paintProps,ctxA:paintCTX,ctxB:propsCTX,texA:paintColorTex,texB:paintPropsTex,span:mesh===cleanFloor?[40,40]:[24,28]};
 if(v5.surfaceMaps.has(mesh))return v5.surfaceMaps.get(mesh);
 const old=mesh.userData.pair,u=old.uniforms;
 const p=materialPair('#'+u.uBase.value.clone().convertLinearToSRGB().getHexString(),u.uRoughness.value,u.uMetalness.value,old.pattern);
 p.ltc.side=old.ltc.side;p.ref.side=old.ref.side;
 const a=paintCanvas(),b=paintCanvas(),texA=new T.CanvasTexture(a),texB=new T.CanvasTexture(b);
 for(const t of [texA,texB]){t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
 Object.assign(p.uniforms,{uPaintEnabled:{value:1},uPaintColor:{value:texA},uPaintProps:{value:texB}});
 mesh.userData.pair=p;mesh.material=p.ltc;
 if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
 const dims=mesh.geometry.boundingBox.getSize(vec()).multiply(mesh.getWorldScale(vec())),sorted=dims.toArray().sort((a,b)=>b-a);
 const map={mesh,a,b,ctxA:a.getContext('2d',{willReadFrequently:true}),ctxB:b.getContext('2d',{willReadFrequently:true}),texA,texB,span:mesh.userData.paintSpan||[Math.max(.1,sorted[0]),Math.max(.1,sorted[1])],original:old};
 v5.surfaceMaps.set(mesh,map);return map;
}
function stashSurface(map){
 paintHistory.push({kind:'v5surface',map,a:map.ctxA.getImageData(0,0,PAINT_SIZE,PAINT_SIZE),b:map.ctxB.getImageData(0,0,PAINT_SIZE,PAINT_SIZE)});
 if(paintHistory.length>20)paintHistory.shift();
}
function changedSurface(map){map.texA.needsUpdate=map.texB.needsUpdate=true;paintCount++;invalidate();}
function stampSurface(map,uv,radius,options={}){
 const mode=options.mode||s.brushMode,strength=options.strength??s.brushStrength,soft=clamp(v5.softness,.02,1),m=paintMaterials[options.material||s.brush];
 const x=uv.x*PAINT_SIZE,y=(1-uv.y)*PAINT_SIZE,rx=Math.max(1,radius/map.span[0]*PAINT_SIZE),ry=Math.max(1,radius/map.span[1]*PAINT_SIZE);
 const x0=clamp(Math.floor(x-rx-1),0,PAINT_SIZE-1),y0=clamp(Math.floor(y-ry-1),0,PAINT_SIZE-1),x1=clamp(Math.ceil(x+rx+1),0,PAINT_SIZE),y1=clamp(Math.ceil(y+ry+1),0,PAINT_SIZE);
 if(x1<=x0||y1<=y0)return;
 const a=map.ctxA.getImageData(x0,y0,x1-x0,y1-y0),b=map.ctxB.getImageData(x0,y0,x1-x0,y1-y0),base=map.mesh.userData.pair.uniforms;
 const ink=new T.Color(m.color),inkRGB=[ink.r*255,ink.g*255,ink.b*255];
 for(let j=0;j<a.height;j++)for(let i=0;i<a.width;i++){
  const xx=(x0+i+.5-x)/rx,yy=(y0+j+.5-y)/ry,dist=Math.hypot(xx,yy);if(dist>=1)continue;
  const k=(j*a.width+i)*4,t=clamp((1-dist)/soft,0,1);let w=t*t*(3-2*t)*strength;
  if(mode==='spray'){
   const grain=((Math.imul(x0+i+1,73856093)^Math.imul(y0+j+1,19349663)^Math.imul(paintCount+1,83492791))>>>0)%1000/1000;
   w*=grain>.54?.35:.035;
  }
  if(options.direction){const across=xx*options.direction.y-yy*options.direction.x;w*=.70+.30*Math.pow(Math.cos(across*28),2);}
  if(mode==='restore'||mode==='wipe'){
   a.data[k+3]*=1-w;b.data[k+3]*=1-w;continue;
  }
  const alpha=b.data[k+3]/255,r=base.uRoughness.value*(1-alpha)+b.data[k]/255*alpha,metal=base.uMetalness.value*(1-alpha)+b.data[k+1]/255*alpha;
  const targetR=mode==='polish'?.065:mode==='scuff'?.88:mode==='spray'?.09:m.r;
  const targetM=mode==='polish'||mode==='scuff'?metal:m.m;
  b.data[k]=(r+(targetR-r)*w)*255;b.data[k+1]=(metal+(targetM-metal)*w)*255;b.data[k+2]=0;b.data[k+3]=255;
  if(mode==='coat'||mode==='spray'){
   const oldAlpha=a.data[k+3]/255,newAlpha=w+oldAlpha*(1-w);
   for(let c=0;c<3;c++)a.data[k+c]=(inkRGB[c]*w+a.data[k+c]*oldAlpha*(1-w))/Math.max(newAlpha,1e-9);
   a.data[k+3]=newAlpha*255;
  }
 }
 map.ctxA.putImageData(a,x0,y0);map.ctxB.putImageData(b,x0,y0);
}
const v5StampBrush=stampBrush;
stampBrush=function(uv,radius=s.brushRadius,options=null){
 if(!v5.ready)return v5StampBrush(uv,radius,options);
 stampSurface(mapForSurface(activeFloor()),uv,radius,options||{});
};
const v5BrushMode=setBrushMode;
setBrushMode=function(mode){
 if(!v5.ready||!['spray','wipe'].includes(mode)){v5BrushMode(mode);}else{
  s.brushMode=mode;$$('[data-brush-mode]').forEach(b=>b.classList.toggle('active',b.dataset.brushMode===mode));
  $('materialPalette').hidden=mode!=='spray';
 }
 if(v5.ready){
  $('brushModeHelp').textContent={coat:'Brush on a material. Existing light responds to the new finish.',polish:'Lower roughness while keeping color and metalness.',scuff:'Raise roughness while keeping color and metalness.',restore:'Remove brush edits to reveal the base finish.',spray:'A soft, speckled wet coating. This is a material effect.',wipe:'Wipe away the coating along your stroke.'}[s.brushMode];
  v5.brushArmed=true;syncV5();
 }
};
const v5UndoPaint=undoPaint;
undoPaint=function(){
 const h=paintHistory[paintHistory.length-1];
 if(h?.kind==='v5surface'){paintHistory.pop();h.map.ctxA.putImageData(h.a,0,0);h.map.ctxB.putImageData(h.b,0,0);changedSurface(h.map);toast('Brush stroke undone.');}
 else if(h?.kind==='v5finish'){paintHistory.pop();Object.assign(h.mesh.userData.pair.uniforms.uBase.value,h.base);h.mesh.userData.pair.uniforms.uRoughness.value=h.r;h.mesh.userData.pair.uniforms.uMetalness.value=h.m;invalidate();}
 else v5UndoPaint();if(v5.ready)syncV5();
};
const v5LeaveTrail=leaveDiscTrail;
leaveDiscTrail=function(a,b,width=.18){
 if(!v5.ready)return v5LeaveTrail(a,b,width);
 if(s.trailMode==='off')return;
 const prev=disc.trailLast||vec(a.x,0,a.z),current=vec(b.x,0,b.z),length=current.distanceTo(prev);
 if(length>2){disc.trailLast=current;return;}if(length<.025&&disc.trailLast)return;
 const count=Math.max(1,Math.ceil(length/.04)),direction=v2(current.x-prev.x,prev.z-current.z).normalize();
 for(let i=1;i<=count;i++){const p=prev.clone().lerp(current,i/count);stampBrush(uvAtFloor(p,activeFloor()),width,{mode:s.trailMode,material:s.brush,strength:.65,direction});}
 disc.trailDistance=(disc.trailDistance||0)+length;disc.trailLast=current;trailDirty=true;
};
function paintSurfaceHit(hit){
 if(!hit?.uv||!hit.object.userData.pair)return false;
 const map=mapForSurface(hit.object),uv=hit.uv,stroke=v5.stroke;
 if(!stroke)return false;
 if(stroke.map!==map){stashSurface(map);stroke.map=map;stroke.uv=null;}
 if(stroke.uv&&uv.distanceTo(stroke.uv)<.4){
  const span=Math.hypot((uv.x-stroke.uv.x)*map.span[0],(uv.y-stroke.uv.y)*map.span[1]);
  const steps=Math.min(128,Math.max(1,Math.ceil(span/(s.brushRadius*.12))));
  for(let i=1;i<=steps;i++)stampSurface(map,stroke.uv.clone().lerp(uv,i/steps),s.brushRadius);
 }else stampSurface(map,uv,s.brushRadius);
 stroke.uv=uv.clone();lastPaintProbe={P:hit.point.clone(),N:smoothHitNormal(hit),mesh:hit.object,uv:uv.clone()};changedSurface(map);return true;
}
const v5SampleSurface=sampleSurface;
sampleSurface=function(mesh,P){
 const map=v5.surfaceMaps.get(mesh);if(!map)return v5SampleSurface(mesh,P);
 const u=mesh.userData.pair.uniforms,uv=point?.mesh===mesh&&point.uv&&point.P.distanceTo(P)<.001?point.uv:lastPaintProbe?.mesh===mesh&&lastPaintProbe.P.distanceTo(P)<.001?lastPaintProbe.uv:null;
 if(!uv){
  const normal=P.clone().sub(mesh.getWorldPosition(vec())).normalize(),ray=new T.Raycaster(P.clone().addScaledVector(normal,.02),normal.clone().negate(),0,.1);
  const hits=ray.intersectObject(mesh,false);if(hits[0]?.uv)return sampleSurfaceMap(map,hits[0].uv);
  return{r:u.uRoughness.value,m:u.uMetalness.value,base:u.uBase.value.clone()};
 }return sampleSurfaceMap(map,uv);
};
function sampleSurfaceMap(map,uv){
 const u=map.mesh.userData.pair.uniforms,p=sampleCanvasLinear(map.ctxB,uv),c=sampleCanvasLinear(map.ctxA,uv);
 return{r:clamp(u.uRoughness.value*(1-p[3])+p[0]*p[3],.04,1),m:clamp(u.uMetalness.value*(1-p[3])+p[1]*p[3],0,1),base:u.uBase.value.clone().lerp(new T.Color(c[0],c[1],c[2]).convertSRGBToLinear(),c[3])};
}
updateBrushCursor=function(hit){
 const on=!!hit&&!!hit.uv&&s.tool==='paint'&&v5.brushArmed&&s.mode==='playground'&&!s.photo;
 brushCursor.visible=on;
 if(on){const n=smoothHitNormal(hit);brushCursor.position.copy(hit.point).addScaledVector(n,.012);brushCursor.quaternion.setFromUnitVectors(vec(0,0,1),n);brushCursor.scale.setScalar(s.brushRadius);}
 if(hit?.object.userData.pair){const params=v5.surfaceMaps.has(hit.object)&&hit.uv?sampleSurfaceMap(v5.surfaceMaps.get(hit.object),hit.uv):sampleSurface(hit.object,hit.point);$('hoverSurface').textContent=hit.object.name;$('hoverValues').textContent='Roughness '+params.r.toFixed(2)+' / Metalness '+params.m.toFixed(2);}
 sceneDirty=true;
};
function beginSurfaceStroke(hit,e){
 const map=mapForSurface(hit.object);stashSurface(map);v5.stroke={map,uv:null,screen:{x:e.clientX,y:e.clientY}};
 paintSurfaceHit(hit);drag={type:'v5paint',id:e.pointerId,x:e.clientX,y:e.clientY};updateBrushCursor(hit);
}
function v5PointerDown(e,p,ray,lightHit,hit){
 if(!v5.ready||s.mode!=='playground')return false;
 v5.sweep=false;
 if(v5.moveSurface&&v5.selection?.mesh&&hit?.object===v5.selection.mesh){
  const mesh=hit.object,plane=new T.Plane(vec(0,1,0),-hit.point.y),startHit=ray.ray.intersectPlane(plane,vec());
  drag={type:'v5move',id:e.pointerId,mesh,plane,startHit,start:mesh.position.clone()};return true;
 }
 if(s.tool==='paint'&&v5.brushArmed&&hit?.uv&&hit.object.userData.pair){
  v5.selection={type:'surface',mesh:hit.object,point:hit.point.clone(),normal:smoothHitNormal(hit),uv:hit.uv.clone()};syncV5();
  if(s.scene==='studio')exhibitMotion=false;beginSurfaceStroke(hit,e);return true;
 }
 if(lightHit&&(!hit||lightHit.distance<hit.distance)){
  const l=lights.find(l=>l?.mesh===lightHit.object);selectV5({type:'light',id:l.id});
  if(s.scene==='shadows')return true;
 }
 if(hit?.object===blockerMesh){
  selectV5({type:'blocker',mesh:blockerMesh});const plane=new T.Plane(vec(0,1,0),-v5.shadow.y);
  drag={type:'v5block',id:e.pointerId,plane,startHit:ray.ray.intersectPlane(plane,vec()),start:vec(v5.shadow.x,v5.shadow.y,v5.shadow.z)};return true;
 }
 return false;
}
function v5PointerMove(e,p){
 if(!drag?.type.startsWith('v5'))return false;
 if(drag.type==='v5paint'){
  const last=v5.stroke.screen,steps=Math.min(96,Math.max(1,Math.ceil(Math.hypot(e.clientX-last.x,e.clientY-last.y)/4))),rect=container.getBoundingClientRect();
  for(let i=1;i<=steps;i++){
   const x=last.x+(e.clientX-last.x)*i/steps-rect.left,y=last.y+(e.clientY-last.y)*i/steps-rect.top;
   const hit=visibleSurfaceHits(rayAt(x,y))[0];if(hit?.object===v5.selection?.mesh||!v5.selection?.mesh){if(hit)paintSurfaceHit(hit);}else v5.stroke.uv=null;
  }
  v5.stroke.screen={x:e.clientX,y:e.clientY};updateBrushCursor(visibleSurfaceHits(rayAt(p.x,p.y))[0]);return true;
 }
 const q=rayAt(p.x,p.y).ray.intersectPlane(drag.plane,vec());if(!q||!drag.startHit)return true;
 const pos=drag.start.clone().add(q.sub(drag.startHit));
 if(drag.type==='v5block'){v5.shadow.x=clamp(pos.x,-3.5,3.5);v5.shadow.z=clamp(pos.z,-3.5,3.5);updateBlocker();syncV5();}
 else{drag.mesh.position.x=clamp(pos.x,-7,7);drag.mesh.position.z=clamp(pos.z,-5,6);invalidate();}return true;
}
function v5EndDrag(d){
 v5.stroke=null;
 if(s.mode==='playground'&&d.type==='orbit'&&!d.moved&&d.hit?.object.userData.pair){selectV5({type:d.hit.object===blockerMesh?'blocker':'surface',mesh:d.hit.object,point:d.hit.point.clone(),normal:smoothHitNormal(d.hit),uv:d.hit.uv?.clone()});}
}
Object.assign(v5,{mapForSurface,stampSurface,stashSurface,changedSurface,sampleSurfaceMap,beginSurfaceStroke,paintSurfaceHit});
