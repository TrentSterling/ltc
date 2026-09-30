function mountV5UI(){
 document.body.classList.add('v5');
 $('sidebar').insertAdjacentHTML('afterbegin',`<div id="selectionHeader" hidden><div id="selectionType" class="eyebrow">Selected surface</div><h2 id="selectionTitle"></h2><p id="selectionHint"></p><div id="lightEditTabs" class="editorTabs" hidden><button id="editLightProperties">Light</button><button id="editLightEmission">Emission</button><button id="editLightOutline">Outline</button></div></div>`);
 const sidebarTop=$('sidebar').querySelector('.sidebarTop');$('sidebar').prepend(sidebarTop);
 $('scenePanelHint').insertAdjacentHTML('afterend','<p id="sceneInstruction">Click a light or surface to edit it. Drag empty space to orbit.</p>');
 const lightsPane=$('.toolPane[data-tool="lights"]')||document.querySelector('.toolPane[data-tool="lights"]');
 const library=lightsPane.querySelector('.section'),libraryDetails=document.createElement('details');libraryDetails.className='lightLibrary';libraryDetails.innerHTML='<summary>All scene lights</summary>';library.before(libraryDetails);libraryDetails.appendChild(library);
 $('lightPattern').insertAdjacentHTML('beforeend','<option value="6">Your drawing / image</option>');
 $('lightPattern').addEventListener('change',()=>{if(selectedLight().pattern===6){uploadEmission(s.selected);openEmissionEditor();}});
 const paintPane=document.querySelector('.toolPane[data-tool="paint"]');
 paintPane.insertAdjacentHTML('afterbegin',`<div class="surfaceBase"><div class="row"><span>Base finish</span><input type="color" id="surfaceColor" aria-label="Surface base color"></div><div class="field"><label for="surfaceRoughness">Roughness <output id="surfaceRoughnessValue"></output></label><input type="range" id="surfaceRoughness" min=".04" max="1" step=".01"></div><div class="field"><label for="surfaceMetalness">Metalness <output id="surfaceMetalnessValue"></output></label><input type="range" id="surfaceMetalness" min="0" max="1" step=".01"></div><button id="moveSurface" hidden>Move panel</button></div><div class="brushHeading"><h3>Work the surface</h3><button id="brushToggle" class="primary">Start brushing</button></div>`);
 paintPane.querySelector('.brushModes').insertAdjacentHTML('beforeend','<button data-brush-mode="spray">Spray</button><button data-brush-mode="wipe">Wipe</button>');
 $('brushRadius').parentElement.insertAdjacentHTML('afterend','<div class="field"><label for="brushSoftness">Soft edge <output id="brushSoftnessValue">65%</output></label><input id="brushSoftness" type="range" min=".05" max="1" step=".05" value=".65"></div>');
 $('clearPaint').textContent='Clear this surface';
 const emission=document.createElement('div');emission.className='toolPane';emission.dataset.tool='emission';
 emission.innerHTML=`<p class="editorIntro">Draw what the light emits. The dashed line is its polygon outline.</p><span id="emissionName" hidden></span><canvas id="emissionCanvas" width="256" height="256" aria-label="Emission drawing canvas. Drag to draw or erase." tabindex="0"></canvas><div class="row emissionTools"><div class="choices"><button data-emission-tool="draw" class="active">Draw</button><button data-emission-tool="erase">Erase</button></div><input id="emissionColor" type="color" value="#ffd194" aria-label="Emission brush color"></div><div class="field"><label for="emissionRadius">Brush size <output id="emissionRadiusValue">13 px</output></label><input type="range" id="emissionRadius" min="2" max="45" value="13"></div><div class="choices"><button id="emissionUndo">Undo</button><button id="emissionClear">Clear</button><button id="emissionImport">Import image</button></div><input id="emissionFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><details class="emissionStamps"><summary>Starting shapes</summary><div class="choices"><button data-emission-stamp="sign">Sign</button><button data-emission-stamp="bolt">Bolt</button><button data-emission-stamp="ring">Ring</button><button data-emission-stamp="solid">Fill</button></div></details><div class="field"><label for="emissionAnimation">Animate the image</label><select id="emissionAnimation"><option value="0">Still</option><option value="1">Pulse</option><option value="2">Scroll</option><option value="3">Sweep</option></select></div><p id="emissionStatus" class="scope" role="status"></p>`;
 $('sidebar').appendChild(emission);
 const block=document.createElement('div');block.className='toolPane';block.dataset.tool='blocker';block.innerHTML='<p class="editorIntro">Drag the panel across the stage, or adjust its position here.</p><label class="check"><input type="checkbox" id="shadowEnabled" checked>Analytic shadow</label><div id="blockerFields"></div><div class="field"><label for="stageLightSize">Emitter width <output id="stageLightSizeValue"></output></label><input id="stageLightSize" type="range" min=".5" max="6" step=".05" value="3.4"></div><p class="scope">One horizontal rectangular emitter and one opaque planar blocker. Only this blocker casts a shadow.</p>';
 $('sidebar').appendChild(block);
 $('sidebar').appendChild($('sidebar').querySelector('.footerCredit'));
 for(const [key,label,min,max,step]of [['x','Across',-3.5,3.5,.02],['z','Forward',-3.5,3.5,.02],['y','Height',.35,4.5,.02],['width','Blocker width',.25,4,.05],['depth','Blocker depth',.25,3,.05],['angle','Rotation',-90,90,1]]){
  $('blockerFields').insertAdjacentHTML('beforeend',`<div class="field"><label for="block-${key}">${label}<output id="block-${key}-value"></output></label><input type="range" id="block-${key}" min="${min}" max="${max}" step="${step}"></div>`);
  $('block-'+key).oninput=e=>{v5.shadow[key]=+e.target.value;updateBlocker();syncV5();};
 }
 const visibility=document.createElement('section');visibility.id='visibilityInspector';visibility.hidden=true;
 visibility.innerHTML='<h3>What this point sees</h3><canvas id="visibilityCanvas" width="560" height="360" aria-label="Emitter polygon with the blocked region marked in amber"></canvas><div class="visibilityLegend"><span>Visible emitter</span><span>Blocked region</span></div><p id="visibilityValues" class="mono"></p><p class="scope">The amber region is subtracted from the same fitted LTC integral. Compare can use a ray-tested LTC reference to isolate visibility error.</p>';
 document.querySelector('.toolPane[data-tool="probe"]').prepend(visibility);
 $('comparePane').querySelector('h2').textContent='Frozen reference';
 $('comparePane').insertAdjacentHTML('afterbegin','<div class="field referenceChoice"><label for="referenceModel">Compare against</label><select id="referenceModel"><option value="0">Sampled GGX</option><option value="1">Sampled LTC + ray visibility</option></select></div>');
 $('referenceModel').onchange=e=>{lightUniforms.uReferenceModel.value=+e.target.value;invalidate();updateCompareUI();};
 $('shadowEnabled').onchange=e=>{v5.shadow.enabled=e.target.checked;updateBlocker();syncV5();};
 $('stageLightSize').oninput=e=>{lights[1].width=+e.target.value;updateLight(lights[1]);syncV5();};
 $('editLightProperties').onclick=()=>setTool('lights');$('editLightEmission').onclick=openEmissionEditor;$('editLightOutline').onclick=()=>setTool('shape');
 $('brushToggle').onclick=()=>{v5.brushArmed=!v5.brushArmed;v5.moveSurface=false;syncV5();};
 $('moveSurface').onclick=()=>{v5.moveSurface=!v5.moveSurface;v5.brushArmed=false;syncV5();};
 $('brushSoftness').oninput=e=>{v5.softness=+e.target.value;$('brushSoftnessValue').textContent=Math.round(v5.softness*100)+'%';};
 $$('[data-brush-mode]').forEach(b=>b.onclick=()=>setBrushMode(b.dataset.brushMode));
 $('undoPaint').onclick=undoPaint;
 $('clearPaint').onclick=()=>{const mesh=v5.selection?.mesh||activeFloor(),map=mapForSurface(mesh);stashSurface(map);map.ctxA.clearRect(0,0,512,512);map.ctxB.clearRect(0,0,512,512);changedSurface(map);toast('Brush edits cleared from '+mesh.name+'.');};
 for(const [id,property]of [['surfaceRoughness','uRoughness'],['surfaceMetalness','uMetalness'],['surfaceColor','uBase']]){
  $(id).addEventListener('pointerdown',()=>stashFinish());
  $(id).addEventListener('keydown',e=>{if(!e.repeat)stashFinish();});
  $(id).oninput=e=>{const mesh=v5.selection?.mesh||activeFloor(),map=mapForSurface(mesh),u=mesh.userData.pair.uniforms;if(property==='uBase')u[property].value.copy(color(e.target.value));else u[property].value=+e.target.value;invalidate();syncV5();};
 }
 $('tooltray').querySelector('[data-tool="workshop"]').textContent='Explore';$('tooltray').querySelector('[data-tool="paint"]').textContent='Surface';$('tooltray').querySelector('[data-tool="lights"]').textContent='Light';
 $('paperHeading').textContent='Research & credit';
 $('paper').querySelector('.paperFoot').insertAdjacentHTML('beforebegin',`<div class="paperCitation"><strong>Fast Analytic Soft Shadows from Area Lights</strong><p>Aakash KT, Parikshit Sakurikar, and P. J. Narayanan · EGSR 2021</p><p>This controlled stage follows the visible-emitter integration idea. It implements a single planar convex blocker beneath a rectangular emitter, with independent ray-tested references. It is not the paper's general scene algorithm.</p><a href="https://diglib.eg.org/items/b4d101ec-840e-4269-b549-ef16ea70d8f9" target="_blank" rel="noopener">Shadow research / publication</a></div>`);
 initEmissionEditor();
}
function stashFinish(){const mesh=v5.selection?.mesh||activeFloor();mapForSurface(mesh);const u=mesh.userData.pair.uniforms;paintHistory.push({kind:'v5finish',mesh,base:u.uBase.value.clone(),r:u.uRoughness.value,m:u.uMetalness.value});if(paintHistory.length>20)paintHistory.shift();}
function selectV5(selection){
 v5.selection=selection;v5.brushArmed=false;v5.moveSurface=false;
 if(selection.type==='light'){selectLight(selection.id);setTool('lights');}
 else if(selection.type==='blocker'){setTool('blocker');}
 else{if(s.scene==='studio')exhibitMotion=false;setTool('paint');v5.brushArmed=false;}
 syncV5();
}
function syncV5(){
 if(!v5.ready||!$('selectionHeader'))return;
 const selection=v5.selection,kind=selection?.type,light=['lights','shape','emission'].includes(s.tool),surface=s.tool==='paint';
 const visible=s.mode==='playground'&&s.tool!=='workshop'&&!!selection;
 $('selectionHeader').hidden=!visible;$('lightEditTabs').hidden=!light;
 $('selectionType').textContent=kind==='light'?'Selected emitter':kind==='blocker'?'Visibility control':'Selected surface';
 $('selectionTitle').textContent=kind==='light'?(lights[selection.id]?.name||'Emitter'):(selection?.mesh?.name||'Surface');
 $('selectionHint').textContent=kind==='light'?'Its shape and image both contribute to the lighting.':kind==='blocker'?'An opaque panel between light and receiver.':v5.brushArmed?'Brush this surface. Right-drag to look around.':'Adjust the base finish or start a brush stroke.';
 for(const [id,tool]of [['editLightProperties','lights'],['editLightEmission','emission'],['editLightOutline','shape']]){$(id).classList.toggle('active',s.tool===tool);$(id).disabled=s.scene==='shadows'&&tool!=='lights';}
 $('brushToggle').textContent=v5.brushArmed?'Stop brushing':'Start brushing';$('brushToggle').classList.toggle('active',v5.brushArmed);
 const mesh=selection?.mesh||activeFloor();if(surface&&mesh.userData.pair){const u=mesh.userData.pair.uniforms;
  for(const [id,value]of [['surfaceRoughness',u.uRoughness.value],['surfaceMetalness',u.uMetalness.value]]){if(document.activeElement!==$(id))$(id).value=value;$(id+'Value').textContent=value.toFixed(2);}
  if(document.activeElement!==$('surfaceColor'))$('surfaceColor').value='#'+u.uBase.value.clone().convertLinearToSRGB().getHexString();
 }
 $('moveSurface').hidden=!mesh.userData.movable;$('moveSurface').textContent=v5.moveSurface?'Stop moving':'Move panel';
 $('shadowEnabled').checked=v5.shadow.enabled;
 for(const key of ['x','y','z','width','depth','angle']){if(document.activeElement!==$('block-'+key))$('block-'+key).value=v5.shadow[key];$('block-'+key+'-value').textContent=v5.shadow[key].toFixed(key==='angle'?0:2)+(key==='angle'?'°':' m');}
 if(s.scene==='shadows'&&lights[1]){if(document.activeElement!==$('stageLightSize'))$('stageLightSize').value=lights[1].width;$('stageLightSizeValue').textContent=lights[1].width.toFixed(2)+' m';}
 for(const id of ['lightPattern','spinLight','outlineLight','duplicateLight','removeLight'])$(id).disabled=s.scene==='shadows'||(id==='removeLight'&&[0,3].includes(s.selected))||(id==='duplicateLight'&&lights.every(Boolean));
 for(const key of ['x','y','z','pitch','yaw','roll'])if($('param-'+key))$('param-'+key).disabled=s.scene==='shadows';
 $('visibilityInspector').hidden=s.scene!=='shadows'||s.mode!=='explain';
 document.querySelector('.lightLibrary').hidden=s.scene==='shadows';
 if(!$('visibilityInspector').hidden)drawVisibility();
 document.body.classList.toggle('brushActive',surface&&v5.brushArmed);
 if(s.mode==='playground')$('toolHint').textContent=v5.brushArmed?'Drag to brush / Right-drag to look / Ctrl+Z undo':kind==='blocker'?'Drag panel to move / Height controls its distance from the light':'Click to select / Drag to orbit / Right-drag to look';
}
function drawVisibility(){
 const l=lights[1];if(!l)return;const P=point?.P||vec(1.5,0,1),poly=blockedPolygonCPU(P,l),c=$('visibilityCanvas'),ctx=c.getContext('2d');
 ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#111d23';ctx.fillRect(0,0,c.width,c.height);
 const g=lightGPU[1],scale=Math.min(470/l.width,270/l.height),project=q=>{const d=q.clone().sub(l.position);return[280+d.dot(g.U)*scale,180-d.dot(g.V)*scale];};
 const draw=(p,fill,stroke)=>{if(p.length<3)return;ctx.beginPath();p.forEach((q,i)=>{const xy=project(q);i?ctx.lineTo(...xy):ctx.moveTo(...xy);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();};
 draw(l.world,'#385f65','#9bd5d5');draw(poly,'#be8544','#f2c489');
 const data=cpuPoint(),A=data.inv.clone().multiply(data.F),integral=shadowIntegralCPU(P,A,l);
 $('visibilityValues').textContent='Full '+integral.whole.toFixed(4)+' - blocked '+integral.blocked.toFixed(4)+' = '+integral.visible.toFixed(4);
}
const v5SetTool=setTool;
setTool=function(tool){
 if(v5.ready){
  if(tool==='paint'&&v5.selection?.type!=='surface'){v5.selection={type:'surface',mesh:activeFloor()};v5.brushArmed=true;}
  if(['lights','shape','emission'].includes(tool))v5.selection={type:'light',id:s.selected};
  if(tool==='workshop'){v5.selection=null;v5.brushArmed=false;v5.moveSurface=false;}
 }
 v5SetTool(tool);if(v5.ready){syncV5();if(tool==='emission')drawEmissionEditor();}
};
const v5SyncGlobal=syncGlobalUI;
syncGlobalUI=function(){v5SyncGlobal();if(v5.ready)syncV5();};
const v5OpenInspector=openInspector;
openInspector=function(){
 const sel=v5.selection;v5OpenInspector();
 if(sel?.type==='surface'&&sel.point){point={P:sel.point.clone(),N:sel.normal.clone(),mesh:sel.mesh,uv:sel.uv?.clone()};invalidate();}
 else if(s.scene==='shadows'){point={P:vec(1.25,0,1.1),N:vec(0,1,0),mesh:activeFloor()};selectLight(1);invalidate();}
 syncV5();
};
Object.assign(v5,{select:selectV5,sync:syncV5,drawVisibility});
Object.defineProperty(v5,'blocker',{get:()=>blockerMesh});
