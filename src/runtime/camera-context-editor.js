'use strict';

// Compact context editor layered on top of the preset editor.
// It deliberately shows only the camera family the user is currently working on:
// stage/venue while no instrument is focused, or one concrete instrument after focus.
// Instrument drafts are stored as root-local anchors so moving the stage layout later
// does not invalidate the composition. Export bundles stage + instrument drafts together.
(() => {
  const T=THREE;
  const camera=window.VirtualBandCamera;
  const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
  const baseEditor=window.VirtualBandCameraPresetEditor;
  const shell=document.getElementById('camera-editor-floating-shell');
  const body=document.getElementById('camera-editor-body');
  const nameInput=document.getElementById('camera-editor-name');
  const saveButton=document.getElementById('camera-editor-save');
  if(!T||!camera||!runtime?.camera||!baseEditor||!shell||!body||!saveButton)return;

  const STORE='vb-camera-instrument-draft-v1';
  const SCHEMA='virtual-band-camera-workbench/v1';
  const STAGE_SYSTEM=[
    ['front','正面'],['left','左侧'],['right','右侧'],['top','高机位'],
    ['nocturne:panorama','场馆全景'],['nocturne:stage','舞台正面'],
    ['nocturne:wing','舞台侧翼'],['nocturne:balcony','看台视角'],['nocturne:reverse','回望场馆'],
  ];
  const VIEWS={
    keyboard:[['overall','整体'],['lower','88 键'],['upper','61 键'],['panel','控制面板'],['pedals','踏板'],['observeAll','演奏总览'],['observeLower','下层观察'],['observeUpper','上层观察']],
    drums:[['overall','整体'],['front','正面'],['left34','左前 3/4'],['right34','右前 3/4'],['top','高机位'],['observeAll','演奏总览'],['observeLeft','左侧观察'],['observeRight','右侧观察']],
    acoustic:[['overall','整体'],['body','琴身'],['neck','指板'],['side','侧面']],
    electric:[['overall','整体'],['body','琴身'],['neck','指板'],['side','侧面']],
    bass:[['overall','整体'],['body','琴身'],['neck','指板'],['side','侧面']],
  };

  let lockedRootName='';
  let lastFocusedView='overall';
  let toastTimer=0;
  let config=load();

  const round=(v,d=3)=>{const p=10**d;return Math.round((Number(v)||0)*p)/p;};
  const editing=()=>!!baseEditor.editing;
  const active=()=>window.VirtualBandVenues?.current==='nocturne';
  const stageConfig=()=>baseEditor.config;
  const rootByName=name=>(camera.roots||[]).find(root=>root.name===name)||null;
  const stateRoot=()=>rootByName(camera.state?.focused||'');

  function typeOf(root){
    const n=root?.name||'';
    if(n.includes('dual-tier'))return'keyboard';
    if(n.includes('Band Drums'))return'drums';
    if(n.includes('Fingered Bass'))return'bass';
    if(/^Wish Acoustic \d+$/.test(n))return'acoustic';
    if(/Electric \d+$/.test(n))return'electric';
    return'';
  }
  function subjectOf(root){
    const type=typeOf(root),n=root?.name||'';
    if(type==='acoustic')return`acoustic:${(/(\d+)$/.exec(n)||[])[1]||1}`;
    if(type==='electric')return`electric:${(/(\d+)$/.exec(n)||[])[1]||1}`;
    return type;
  }
  function labelOf(root){
    const type=typeOf(root),n=root?.name||'';
    if(type==='keyboard')return'双层键盘';
    if(type==='drums')return'架子鼓';
    if(type==='bass')return'Bass';
    if(type==='acoustic')return`木吉他 ${(/(\d+)$/.exec(n)||[])[1]||''}`.trim();
    if(type==='electric')return`电吉他 ${(/(\d+)$/.exec(n)||[])[1]||''}`.trim();
    return n||'乐器';
  }
  function key(subject,id){return`${subject}::${id}`;}
  function normalize(value){
    const src=value&&typeof value==='object'?value:{};
    const hidden=[...new Set(Array.isArray(src.hidden)?src.hidden.map(String):[])];
    const overrides={};
    for(const [k,item] of Object.entries(src.overrides||{})){
      const a=item?.anchor;
      if(!Array.isArray(a?.camera)||!Array.isArray(a?.target)||a.camera.length<3||a.target.length<3)continue;
      overrides[k]={subject:String(item.subject||''),id:String(item.id||''),label:String(item.label||item.id||''),anchor:{camera:a.camera.slice(0,3).map(Number),target:a.target.slice(0,3).map(Number),fov:Number(a.fov)||42}};
    }
    const custom=[];
    for(const item of Array.isArray(src.custom)?src.custom:[]){
      const a=item?.anchor;
      if(!item?.subject||!String(item.id||'').startsWith('user:')||!Array.isArray(a?.camera)||!Array.isArray(a?.target))continue;
      custom.push({subject:String(item.subject),id:String(item.id),label:String(item.label||item.id),anchor:{camera:a.camera.slice(0,3).map(Number),target:a.target.slice(0,3).map(Number),fov:Number(a.fov)||42}});
    }
    return{hidden,overrides,custom};
  }
  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(STORE)||'null'));}catch{return normalize({});}
  }
  function persist(){localStorage.setItem(STORE,JSON.stringify(config));}

  function currentRoot(){
    const live=stateRoot();
    if(live){
      lockedRootName=live.name;
      if(camera.state?.focusedView)lastFocusedView=camera.state.focusedView;
      return live;
    }
    return lockedRootName?rootByName(lockedRootName):null;
  }
  function captureAnchor(root){
    if(!root)return null;
    runtime.camera.updateMatrixWorld(true);root.updateWorldMatrix(true,true);
    const cameraWorld=runtime.camera.position.clone();
    const s=camera.state?.target;
    const targetWorld=s?.isVector3?s.clone():s&&Number.isFinite(s.x)?new T.Vector3(s.x,s.y,s.z):cameraWorld.clone().add(runtime.camera.getWorldDirection(new T.Vector3()).multiplyScalar(20));
    const cameraLocal=root.worldToLocal(cameraWorld.clone());
    const targetLocal=root.worldToLocal(targetWorld.clone());
    return{camera:cameraLocal.toArray().map(v=>round(v)),target:targetLocal.toArray().map(v=>round(v)),fov:round(runtime.camera.fov,2)};
  }
  function showAnchor(root,anchor){
    if(!root||!anchor)return false;
    root.updateWorldMatrix(true,true);
    const p=root.localToWorld(new T.Vector3(...anchor.camera));
    const t=root.localToWorld(new T.Vector3(...anchor.target));
    camera.pose?.({position:p.toArray(),target:t.toArray(),fov:anchor.fov||42,durationMs:120},false);
    return true;
  }

  // Hide the original long list. The underlying stage editor remains the persistence
  // engine; this module presents the same data through one compact selector.
  for(const group of body.querySelectorAll('.camera-editor-group'))group.style.display='none';
  body.querySelector('.camera-editor-io')?.style.setProperty('display','none');
  body.querySelector('.camera-editor-tip')?.style.setProperty('display','none');

  const context=document.createElement('div');
  context.className='camera-context-workbench';
  context.innerHTML=`
    <div class="camera-context-head"><div><small>当前对象</small><strong id="camera-context-subject">整体 / 场馆</strong></div><button id="camera-context-stage" type="button" hidden>回到整体</button></div>
    <label class="camera-context-select"><span>视角</span><select id="camera-context-view"></select></label>
    <div class="camera-context-actions"><button id="camera-context-go" type="button">看</button><button id="camera-context-overwrite" type="button">覆盖</button><button id="camera-context-hide" type="button">隐藏</button><button id="camera-context-default" type="button" hidden>恢复默认</button></div>
    <div class="camera-context-io"><button id="camera-context-copy" type="button">复制 JSON</button><button id="camera-context-download" type="button">下载 JSON</button></div>
    <div class="camera-context-note" id="camera-context-note">未聚焦乐器时，只编辑整体与场馆机位。</div>`;
  const pose=body.querySelector('.camera-editor-pose');
  body.insertBefore(context,pose||body.firstChild);

  const style=document.createElement('style');style.id='camera-context-workbench-style';style.textContent=`
    .camera-context-workbench{display:grid;gap:8px;padding:8px;border:1px solid #cad9e016;border-radius:10px;background:#ffffff03}.camera-context-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.camera-context-head>div{display:grid;gap:2px}.camera-context-head small,.camera-context-select span{font-size:7px;color:#71858d;letter-spacing:.08em}.camera-context-head strong{font-size:10px;color:#dce7e5;font-weight:600}.camera-context-select{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px}.camera-context-select select{min-width:0;width:100%;height:30px;border:1px solid #cad9e023;border-radius:7px;background:#17262d;color:#d6e0de;padding:0 7px;font-size:9px}.camera-context-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.camera-context-actions button[hidden]{display:none!important}.camera-context-io{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding-top:7px;border-top:1px solid #cad9e010}.camera-context-note{font-size:7px;line-height:1.5;color:#62767d}.camera-editor-pose{max-height:46px;overflow:hidden}.camera-editor-capture{grid-template-columns:minmax(0,1fr) auto!important}
  `;document.head.appendChild(style);

  const $=id=>document.getElementById(id),subject=$('camera-context-subject'),select=$('camera-context-view'),stageBtn=$('camera-context-stage'),hideBtn=$('camera-context-hide'),defaultBtn=$('camera-context-default'),note=$('camera-context-note');

  function stageEntries(){
    const cfg=stageConfig();
    const base=STAGE_SYSTEM.map(([id,label])=>({id,label,system:true,hidden:cfg.hidden.includes(id),overridden:!!cfg.overrides[id]}));
    const custom=(cfg.custom||[]).map(item=>({id:item.id,label:item.label||item.id,system:false,hidden:false,overridden:false}));
    return[...base,...custom];
  }
  function instrumentEntries(root){
    const type=typeOf(root),subjectId=subjectOf(root),base=(VIEWS[type]||[]).map(([id,label])=>({id,label,system:true,hidden:config.hidden.includes(key(subjectId,id)),overridden:!!config.overrides[key(subjectId,id)]}));
    const custom=config.custom.filter(item=>item.subject===subjectId).map(item=>({id:item.id,label:item.label,system:false,hidden:false,overridden:false}));
    return[...base,...custom];
  }
  function entries(){const root=currentRoot();return root?instrumentEntries(root):stageEntries();}
  function selected(){return entries().find(item=>item.id===select.value)||entries()[0]||null;}

  function render(prefer=''){
    if(!editing()||!active())return;
    const root=currentRoot(),list=root?instrumentEntries(root):stageEntries();
    subject.textContent=root?labelOf(root):'整体 / 场馆';stageBtn.hidden=!root;
    const old=prefer||select.value||(root?lastFocusedView:'front');
    select.innerHTML='';
    for(const item of list){const o=document.createElement('option');o.value=item.id;o.textContent=`${item.label}${item.hidden?' · 已隐藏':''}${item.overridden?' · 已覆盖':''}`;select.appendChild(o);}
    if(list.some(item=>item.id===old))select.value=old;else if(list.length)select.value=list[0].id;
    syncActions();
    note.textContent=root?'只显示当前乐器的镜头；你可以继续双击其他乐器切换编辑对象。':'未聚焦乐器时，只编辑整体与场馆机位。';
  }
  function syncActions(){
    const item=selected();if(!item)return;
    hideBtn.textContent=item.system?(item.hidden?'恢复':'隐藏'):'删除';
    defaultBtn.hidden=!(item.system&&item.overridden);
  }
  select.addEventListener('change',syncActions);

  function goSelected(){
    const root=currentRoot(),item=selected();if(!item)return;
    if(!root){camera.view?.(item.id);return;}
    const subjectId=subjectOf(root),draft=config.overrides[key(subjectId,item.id)]||config.custom.find(x=>x.subject===subjectId&&x.id===item.id);
    if(draft?.anchor)showAnchor(root,draft.anchor);
    else camera.focusView?.(root,item.id);
    lastFocusedView=item.id;
  }
  function overwriteSelected(){
    if(!editing())return;
    const root=currentRoot(),item=selected();if(!item)return;
    if(!root){
      const cfg=stageConfig();
      if(item.system){
        const p=baseEditor.capture(item.label);cfg.overrides[item.id]={id:item.id,...p};cfg.hidden=cfg.hidden.filter(id=>id!==item.id);baseEditor.apply(cfg);render(item.id);
      }else{
        const p=baseEditor.capture(item.label),target=cfg.custom.find(x=>x.id===item.id);if(target){Object.assign(target,{id:item.id,...p});baseEditor.apply(cfg);render(item.id);}
      }
      return;
    }
    const subjectId=subjectOf(root),anchor=captureAnchor(root);if(!anchor)return;
    if(item.system){config.overrides[key(subjectId,item.id)]={subject:subjectId,id:item.id,label:item.label,anchor};config.hidden=config.hidden.filter(k=>k!==key(subjectId,item.id));}
    else{const target=config.custom.find(x=>x.subject===subjectId&&x.id===item.id);if(target)target.anchor=anchor;}
    persist();render(item.id);flash(`已覆盖：${item.label}`);
  }
  function hideSelected(){
    const root=currentRoot(),item=selected();if(!item)return;
    if(!root){
      const cfg=stageConfig();
      if(item.system){cfg.hidden=cfg.hidden.includes(item.id)?cfg.hidden.filter(id=>id!==item.id):[...cfg.hidden,item.id];}
      else cfg.custom=cfg.custom.filter(x=>x.id!==item.id);
      baseEditor.apply(cfg);render();return;
    }
    const subjectId=subjectOf(root),k=key(subjectId,item.id);
    if(item.system)config.hidden=config.hidden.includes(k)?config.hidden.filter(x=>x!==k):[...config.hidden,k];
    else config.custom=config.custom.filter(x=>!(x.subject===subjectId&&x.id===item.id));
    persist();render();
  }
  function resetSelected(){
    const root=currentRoot(),item=selected();if(!item?.system)return;
    if(!root){const cfg=stageConfig();delete cfg.overrides[item.id];baseEditor.apply(cfg);render(item.id);return;}
    delete config.overrides[key(subjectOf(root),item.id)];persist();render(item.id);
  }
  function nextCustom(subjectId){
    let n=1;const used=new Set(config.custom.filter(x=>x.subject===subjectId).map(x=>x.id));
    while(used.has(`user:${subjectId}:${String(n).padStart(3,'0')}`))n++;
    return`user:${subjectId}:${String(n).padStart(3,'0')}`;
  }
  function addCurrentInstrument(){
    const root=currentRoot();if(!root)return false;
    const subjectId=subjectOf(root),label=nameInput?.value.trim()||`自定义视角 ${config.custom.filter(x=>x.subject===subjectId).length+1}`,id=nextCustom(subjectId),anchor=captureAnchor(root);
    config.custom.push({subject:subjectId,id,label,anchor});persist();if(nameInput)nameInput.value='';render(id);flash(`已保存：${label}`);return true;
  }

  // Save-current is context-sensitive. On stage we preserve the original editor action;
  // on an instrument we stop that action and create a root-local instrument view instead.
  document.addEventListener('click',event=>{
    if(event.target!==saveButton||!editing())return;
    if(currentRoot()){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();addCurrentInstrument();}
  },true);

  $('camera-context-go').addEventListener('click',goSelected);
  $('camera-context-overwrite').addEventListener('click',overwriteSelected);
  hideBtn.addEventListener('click',hideSelected);
  defaultBtn.addEventListener('click',resetSelected);
  stageBtn.addEventListener('click',()=>{lockedRootName='';lastFocusedView='overall';camera.view?.('front');render('front');});

  function exportBundle(){return{schema:SCHEMA,scope:'nocturne',stage:stageConfig(),instruments:normalize(config)};}
  function exportText(){return JSON.stringify(exportBundle(),null,2);}
  async function copy(){try{await navigator.clipboard.writeText(exportText());flash('完整 JSON 已复制');}catch{flash('复制失败，请使用下载 JSON');}}
  function download(){const blob=new Blob([exportText()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nocturne-camera-workbench.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);flash('完整 JSON 已下载');}
  $('camera-context-copy').addEventListener('click',copy);$('camera-context-download').addEventListener('click',download);

  function flash(text){
    const status=document.getElementById('camera-editor-status');if(!status)return;
    status.textContent=text;if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(editing())status.textContent='NOCTURNE · 编辑中 · 镜头已固定';},1300);
  }

  // Keep the compact selector following whichever instrument the user most recently
  // focused. A custom-pose preview clears Camera v2's internal focus, so lockedRootName
  // intentionally preserves that editing context until another instrument is focused or
  // the user taps "回到整体".
  let lastSignature='';
  function loop(){
    requestAnimationFrame(loop);if(!editing()||!active())return;
    const live=stateRoot();if(live){lockedRootName=live.name;if(camera.state?.focusedView)lastFocusedView=camera.state.focusedView;}
    const root=currentRoot(),sig=`${root?.name||'stage'}|${camera.state?.focusedView||''}|${stageConfig().custom?.length||0}|${config.custom.length}|${config.hidden.length}|${Object.keys(config.overrides).length}`;
    if(sig!==lastSignature){lastSignature=sig;render();}
  }
  requestAnimationFrame(loop);
  new MutationObserver(()=>{if(editing())render();}).observe(body,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('virtual-band-venue-change',()=>{lockedRootName='';lastSignature='';});

  window.VirtualBandCameraContextEditor={
    export:exportBundle,exportText,
    get subject(){const root=currentRoot();return root?subjectOf(root):'stage';},
    get instrumentConfig(){return normalize(config);},
  };
  console.info('[Camera editor] compact current-subject workflow attached');
})();