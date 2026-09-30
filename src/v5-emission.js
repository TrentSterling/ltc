function drawEmissionEditor(){
 const canvas=$('emissionCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d'),l=selectedLight();ctx.clearRect(0,0,256,256);ctx.drawImage(emissionMaps[l.id],0,0);
 ctx.save();ctx.strokeStyle='#e9ebd2';ctx.setLineDash([4,4]);ctx.lineWidth=1.2;ctx.beginPath();
 l.outline.forEach((p,i)=>{const x=(p.x+.5)*256,y=(.5-p.y)*256;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();ctx.restore();
 $('emissionName').textContent=l.name;$('emissionAnimation').value=String(l.paintMotion||0);
 $('emissionUndo').disabled=!(v5.emissionHistory.get(l.id)?.length);
 $('emissionStatus').textContent=l.pattern===6?'Your drawing drives this emitter and its lighting.':'Choose Draw, a stamp, or Import to use your own emission.';
}
function stashEmission(id){const history=v5.emissionHistory.get(id)||[];history.push({data:emissionMaps[id].getContext('2d').getImageData(0,0,256,256),pattern:lights[id].pattern,motion:lights[id].paintMotion||0});if(history.length>12)history.shift();v5.emissionHistory.set(id,history);}
function activateEmission(id){const l=lights[id];l.pattern=6;uploadEmission(id);updateLight(l);syncLightUI();drawEmissionEditor();}
function openEmissionEditor(){if(s.scene==='shadows'){toast('The shadow stage uses a constant rectangular emitter. Try After Hours to paint a light.');return;}v5.selection={type:'light',id:s.selected};setTool('emission');drawEmissionEditor();}
function emissionPoint(e){const r=$('emissionCanvas').getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*256,0,256),y:clamp((e.clientY-r.top)/r.height*256,0,256)};}
function emissionLine(a,b){
 const l=selectedLight(),ctx=emissionMaps[l.id].getContext('2d');ctx.save();ctx.globalCompositeOperation=v5.emissionMode==='erase'?'destination-out':'source-over';
 ctx.strokeStyle=v5.emissionColor;ctx.fillStyle=v5.emissionColor;ctx.lineWidth=v5.emissionRadius*2;ctx.lineCap=ctx.lineJoin='round';
 if(Math.hypot(a.x-b.x,a.y-b.y)<.01){ctx.beginPath();ctx.arc(b.x,b.y,v5.emissionRadius,0,TAU);ctx.fill();}
 else{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();activateEmission(l.id);
}
function emissionUndo(){const l=selectedLight(),h=v5.emissionHistory.get(l.id)?.pop();if(!h)return;emissionMaps[l.id].getContext('2d').putImageData(h.data,0,0);l.pattern=h.pattern;l.paintMotion=h.motion;uploadEmission(l.id);updateLight(l);syncLightUI();drawEmissionEditor();}
async function importEmissionFile(file){
 if(!file)return;if(file.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 const image=await createImageBitmap(file);if(!image.width||!image.height){image.close();throw Error('The image could not be read.');}
 const id=s.selected;stashEmission(id);const ctx=emissionMaps[id].getContext('2d'),scale=Math.min(256/image.width,256/image.height);
 ctx.clearRect(0,0,256,256);ctx.drawImage(image,(256-image.width*scale)/2,(256-image.height*scale)/2,image.width*scale,image.height*scale);image.close();activateEmission(id);
}
function initEmissionEditor(){
 const c=$('emissionCanvas');
 c.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();c.setPointerCapture(e.pointerId);stashEmission(s.selected);v5.emissionStroke=emissionPoint(e);emissionLine(v5.emissionStroke,v5.emissionStroke);});
 c.addEventListener('pointermove',e=>{if(!v5.emissionStroke)return;const p=emissionPoint(e);emissionLine(v5.emissionStroke,p);v5.emissionStroke=p;});
 const end=e=>{v5.emissionStroke=null;if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);};
 c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
 $$('[data-emission-tool]').forEach(b=>b.onclick=()=>{v5.emissionMode=b.dataset.emissionTool;$$('[data-emission-tool]').forEach(x=>x.classList.toggle('active',x===b));});
 $('emissionColor').oninput=e=>v5.emissionColor=e.target.value;
 $('emissionRadius').oninput=e=>{v5.emissionRadius=+e.target.value;$('emissionRadiusValue').textContent=e.target.value+' px';};
 $('emissionAnimation').onchange=e=>{const l=selectedLight();l.paintMotion=+e.target.value;activateEmission(l.id);};
 $('emissionUndo').onclick=emissionUndo;
 $('emissionClear').onclick=()=>{stashEmission(s.selected);emissionMaps[s.selected].getContext('2d').clearRect(0,0,256,256);activateEmission(s.selected);};
 $$('[data-emission-stamp]').forEach(b=>b.onclick=()=>{stashEmission(s.selected);seedEmission(s.selected,b.dataset.emissionStamp);activateEmission(s.selected);});
 $('emissionImport').onclick=()=>$('emissionFile').click();
 $('emissionFile').onchange=async e=>{try{await importEmissionFile(e.target.files?.[0]);}catch(err){$('emissionStatus').textContent=err.message;}finally{e.target.value='';}};
}
const v5Duplicate=duplicateLight;
duplicateLight=function(){const old=selectedLight(),id=old.id;v5Duplicate();if(s.selected!==id){const ctx=emissionMaps[s.selected].getContext('2d');ctx.clearRect(0,0,256,256);ctx.drawImage(emissionMaps[id],0,0);lights[s.selected].paintMotion=old.paintMotion||0;uploadEmission(s.selected);updateLight(lights[s.selected]);}};
const v5SelectLight=selectLight;
selectLight=function(id){if(s.scene==='shadows')id=1;v5SelectLight(id);if(v5.ready&&lights[id]&&s.mode==='playground'&&['lights','shape','emission'].includes(s.tool)){v5.selection={type:'light',id};drawEmissionEditor();syncV5();}};
const v5LightParam=setLightParam;
setLightParam=function(key,value){
 if(s.scene==='shadows'&&s.selected===1&&['x','y','z','pitch','yaw','roll','pattern','shape'].includes(key)){toast('This stage keeps the light horizontal. Move the blocker or resize the emitter.');return;}
 v5.sweep=false;v5LightParam(key,value);
};
Object.assign(v5,{emissionUndo,emissionLine,stashEmission,activateEmission,openEmissionEditor,importEmissionFile});
