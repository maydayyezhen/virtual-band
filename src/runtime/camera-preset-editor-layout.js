'use strict';

// Keep the camera menu compact: the preset editor body lives in its own floating
// inspector instead of expanding the camera panel to several viewport heights.
(() => {
  const section=document.querySelector('.camera-preset-editor');
  const body=document.getElementById('camera-editor-body');
  const toggle=document.getElementById('camera-editor-toggle');
  if(!section||!body||!toggle)return;

  document.getElementById('camera-editor-floating-shell')?.remove();
  document.getElementById('camera-editor-floating-style')?.remove();

  const shell=document.createElement('aside');
  shell.id='camera-editor-floating-shell';
  shell.hidden=true;
  shell.innerHTML=`<div class="camera-editor-floating-head"><div><strong>镜头库编辑</strong><small>NOCTURNE · 独立面板</small></div><button id="camera-editor-floating-close" type="button" aria-label="关闭镜头编辑面板">×</button></div>`;
  shell.appendChild(body);
  document.body.appendChild(shell);

  const style=document.createElement('style');
  style.id='camera-editor-floating-style';
  style.textContent=`
    #camera-editor-floating-shell{position:fixed;top:78px;right:18px;width:min(360px,calc(100vw - 36px));max-height:calc(100vh - 112px);z-index:2147482200;overflow:hidden;border:1px solid #cad9e024;border-radius:14px;background:rgba(10,23,28,.96);box-shadow:0 20px 70px rgba(0,0,0,.42);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    #camera-editor-floating-shell[hidden]{display:none!important}
    .camera-editor-floating-head{height:44px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 11px;border-bottom:1px solid #cad9e016;background:#102127}
    .camera-editor-floating-head>div{display:grid;gap:1px}.camera-editor-floating-head strong{font-size:10px;font-weight:600;color:#e0eae7}.camera-editor-floating-head small{font-size:7px;color:#6f838a}
    .camera-editor-floating-head button{width:28px;height:28px;border:1px solid #cad9e020;border-radius:8px;background:#172b32;color:#9eb0b2;font-size:16px;line-height:1;cursor:pointer}.camera-editor-floating-head button:hover{background:#213b44;color:#edf4f1}
    #camera-editor-floating-shell .camera-editor-body{display:grid;gap:8px;margin:0!important;padding:10px;max-height:calc(100vh - 156px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#53676d transparent}
    #camera-editor-floating-shell .camera-editor-body[hidden]{display:none!important}
    #camera-editor-floating-shell button,#camera-editor-floating-shell input{border:1px solid #cad9e023;border-radius:7px;background:#17262d;color:#cfdad8;font-size:8px}
    #camera-editor-floating-shell button{height:27px;padding:0 7px;cursor:pointer}#camera-editor-floating-shell button:hover{background:#223740}
    #camera-editor-floating-shell .camera-editor-capture{position:sticky;top:-10px;z-index:2;margin:-10px -10px 0;padding:10px;background:rgba(10,23,28,.97);border-bottom:1px solid #cad9e010}
    #camera-editor-floating-shell .camera-editor-group{gap:3px}.camera-editor-floating-head+.camera-editor-body .camera-editor-row{padding:3px 0}
    #camera-editor-floating-shell .camera-editor-actions button{height:23px;padding:0 5px;font-size:7px}
    #camera-editor-floating-shell .camera-editor-io{position:sticky;bottom:-10px;z-index:2;margin:0 -10px -10px;padding:9px 10px 10px;background:rgba(10,23,28,.97);border-top:1px solid #cad9e012}
    #camera-editor-floating-shell .camera-editor-tip{padding-bottom:2px}
    .camera-preset-editor{margin-top:8px!important;padding-top:8px!important}.camera-preset-editor .camera-editor-head{min-height:34px}.camera-preset-editor .camera-editor-head small{max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:680px){
      #camera-editor-floating-shell{top:auto;right:10px;bottom:10px;left:10px;width:auto;max-height:62vh;border-radius:13px}
      #camera-editor-floating-shell .camera-editor-body{max-height:calc(62vh - 44px)}
      .camera-editor-floating-head{height:40px}
    }
    @media(max-height:620px){
      #camera-editor-floating-shell{top:56px;bottom:8px;max-height:none}
      #camera-editor-floating-shell .camera-editor-body{max-height:calc(100vh - 108px)}
    }`;
  document.head.appendChild(style);

  const close=document.getElementById('camera-editor-floating-close');
  const sync=()=>{
    const open=!body.hidden&&window.VirtualBandVenues?.current==='nocturne';
    shell.hidden=!open;
  };
  new MutationObserver(sync).observe(body,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('virtual-band-venue-change',()=>requestAnimationFrame(sync));
  close?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!body.hidden)toggle.click();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!body.hidden){toggle.click();event.preventDefault();}},true);
  sync();
  console.info('[Camera preset editor] floating compact inspector attached');
})();
