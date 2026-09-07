'use strict';

// Full-screen venue loading cover. It is intentionally installed before the large
// NOCTURNE source chunks are loaded so the browser can paint a stable loading state
// before scene construction temporarily occupies the main thread.
(() => {
  const STORE='vb-venue-preset-v2';
  let hideTimer=0;

  const cover=document.createElement('div');
  cover.id='nocturne-loading-cover';
  cover.setAttribute('role','status');
  cover.setAttribute('aria-live','polite');
  cover.innerHTML=`
    <div class="nocturne-loading-inner">
      <div class="nocturne-loading-kicker">VIRTUAL BAND · VENUE</div>
      <div class="nocturne-loading-name">NOCTURNE</div>
      <div class="nocturne-loading-line"><i></i></div>
      <div class="nocturne-loading-note">正在搭建场馆、灯光与 LED 系统</div>
    </div>`;

  const style=document.createElement('style');
  style.id='nocturne-loading-style';
  style.textContent=`
    #nocturne-loading-cover{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#080b13;color:#eef2f5;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .42s ease,visibility 0s linear .42s}
    #nocturne-loading-cover.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .16s ease}
    #nocturne-loading-cover.error{background:#090b11}
    .nocturne-loading-inner{text-align:center;padding:34px;max-width:520px}
    .nocturne-loading-kicker{font:500 10px/1.3 Inter,"Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:.22em;color:#6f858f;margin-bottom:13px}
    .nocturne-loading-name{font:300 28px/1.1 Inter,"Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:.34em;padding-left:.34em;color:#edf5f4}
    .nocturne-loading-line{width:190px;height:1px;margin:24px auto 19px;background:#20313a;overflow:hidden}
    .nocturne-loading-line i{display:block;width:70px;height:100%;background:#a4e3e8;animation:nocturne-loading-slide 1.25s ease-in-out infinite}
    .nocturne-loading-note{font:400 12px/1.7 Inter,"Segoe UI","Microsoft YaHei",sans-serif;color:#8fa1ae;letter-spacing:.035em}
    #nocturne-loading-cover.error .nocturne-loading-line i{animation:none;width:100%;background:#8f4851}
    #nocturne-loading-cover.error .nocturne-loading-note{color:#d2a4aa}
    @keyframes nocturne-loading-slide{0%{transform:translateX(-72px)}100%{transform:translateX(192px)}}
    @media(prefers-reduced-motion:reduce){.nocturne-loading-line i{animation:none;width:100%}}
  `;
  document.head.appendChild(style);
  document.body.appendChild(cover);

  const note=cover.querySelector('.nocturne-loading-note');
  function show(text='正在搭建场馆、灯光与 LED 系统'){
    clearTimeout(hideTimer);cover.classList.remove('error');note.textContent=text;
    cover.classList.add('on');
  }
  function hide(){
    clearTimeout(hideTimer);cover.classList.remove('on','error');
  }
  function hideAfterFirstFrames(){
    clearTimeout(hideTimer);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      hideTimer=setTimeout(hide,260);
    }));
  }
  function fail(error){
    clearTimeout(hideTimer);cover.classList.add('on','error');
    note.textContent='NOCTURNE 加载失败 · '+(error?.message||String(error||'未知错误'));
  }

  window.VirtualBandVenueLoading={show,hide,ready:hideAfterFirstFrames,fail};

  // The venue manager installs its own change handler later. Because this listener is
  // registered first, a scene switch gets covered before the heavy activation work.
  const select=document.getElementById('bp-venue');
  select?.addEventListener('change',()=>{
    if(select.value==='nocturne')show('正在进入 NOCTURNE');
    else hide();
  });
  window.addEventListener('virtual-band-venue-change',event=>{
    if(event.detail?.id==='nocturne')hideAfterFirstFrames();
    else hide();
  });

  const initial=localStorage.getItem(STORE)==='none'?'none':'nocturne';
  if(initial==='nocturne')show();
})();