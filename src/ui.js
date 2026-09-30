/* Small UI additions; rendering and material behavior stay in the original lab. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const lab = window.__LTC;
  const overlays = ['sceneMenu','settings','about','paper'].map($);
  const trigger = {sceneMenu:'sceneMenuBtn',settings:'settingsBtn',about:'settingsBtn',paper:'paperBtn'};
  let active = null;
  let returnTo = null;
  const visible = el => !!el && el.getClientRects().length > 0;
  const focusables = el => [...el.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(visible);
  function restoreFocus() {
    const target = visible(returnTo) ? returnTo : $('settingsBtn');
    target.focus({preventScroll:true});
    returnTo = null;
  }
  function syncDialogs() {
    const open = overlays.filter(el=>el.classList.contains('open'));
    const next = open.find(el=>el!==active) || open[0] || null;
    if(next===active)return;
    if(next){
      if(!active)returnTo = visible($(trigger[next.id])) ? $(trigger[next.id]) : $('settingsBtn');
      for(const other of open)if(other!==next)other.classList.remove('open');
      if(next.id!=='sceneMenu')$('sceneMenuBtn').setAttribute('aria-expanded','false');
      active=next;
      (focusables(active)[0] || active).focus({preventScroll:true});
    }else{active=null;restoreFocus();}
  }
  for(const el of overlays){
    el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    el.setAttribute('aria-label',({settings:'Options',about:'Help and licenses',paper:'Research and credit',sceneMenu:'Choose a lighting scene'})[el.id]);
    el.tabIndex=-1;
    new MutationObserver(syncDialogs).observe(el,{attributes:true,attributeFilter:['class']});
  }
  // Capture Escape before the original shortcut handler so only the dialog closes.
  window.addEventListener('keydown',e=>{
    if(!active)return;
    if(e.key==='Escape'){
      e.preventDefault();e.stopImmediatePropagation();
      active.classList.remove('open');$('sceneMenuBtn').setAttribute('aria-expanded','false');
      syncDialogs();return;
    }
    if(e.key==='Tab'){
      const nodes=focusables(active),first=nodes[0],last=nodes[nodes.length-1];
      if(!first){e.preventDefault();active.focus();return;}
      if(e.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){e.preventDefault();first.focus();}
    }
  },true);
  document.addEventListener('focusin',e=>{if(active&&!active.contains(e.target))(focusables(active)[0]||active).focus();});
  $('showControls').onclick=()=>{lab?.setTool(lab.state.tool);$('closeControls').focus();};
  $('closeControls').addEventListener('click',()=>$('showControls').focus());
  $('exitPhoto').onclick=()=>{if(lab?.state.photo)lab.togglePhoto();$('settingsBtn').focus();};
  const syncPhoto=()=>{
    if(document.body.classList.contains('photo'))$('exitPhoto').focus({preventScroll:true});
  };
  new MutationObserver(syncPhoto).observe(document.body,{attributes:true,attributeFilter:['class']});
  $('reloadDemo').onclick=()=>location.reload();
  const loading=$('loading');
  const syncLoading=()=>{
    const failed=loading.style.display==='flex'&&loading.querySelector('.loadBar').style.display==='none';
    loading.classList.toggle('failed',failed);
    if(failed)loading.setAttribute('role','alert');
  };
  new MutationObserver(syncLoading).observe(loading,{attributes:true,attributeFilter:['style'],subtree:true,childList:true});
  syncLoading();
  const canvas=$('viewport').querySelector('canvas');
  if(canvas){canvas.setAttribute('aria-label','Interactive lighting scene. Drag to orbit; use Scene, Paint, or Lights for controls.');canvas.addEventListener('webglcontextlost',()=>{if(lab)lab.ready=false;});}
  $('toast').setAttribute('role','status');$('toast').setAttribute('aria-live','polite');
  if(lab){
    $('downloadDemo').addEventListener('click',async e=>{
      if(location.protocol==='file:')return;
      e.preventDefault();
      const button=e.currentTarget,old=button.textContent;button.textContent='Preparing download…';
      try{
        const response=await fetch('./index.html');if(!response.ok)throw Error('Download failed');
        const url=URL.createObjectURL(await response.blob());
        const a=document.createElement('a');a.href=url;a.download='LTCsingle.html';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
      }catch{button.textContent='Download unavailable. Try again.';return;}
      button.textContent=old;
    });
  }
})();
