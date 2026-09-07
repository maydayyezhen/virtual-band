'use strict';

// Venue-specific ensemble layout. The base stage layout remains untouched for the
// "none" scene; NOCTURNE gets a tighter, smaller arrangement with guaranteed clearance
// from the main LED plane at z=-8.17.
(() => {
  const T=THREE;
  const camera=window.VirtualBandCamera;
  const venue=window.VirtualBandVenues;
  if(!camera||!venue)return;

  const MAIN_LED_Z=-8.17;
  const LED_CLEARANCE=.85;
  const MIN_GEOMETRY_Z=MAIN_LED_Z+LED_CLEARANCE;

  const LAYOUT={
    keyboard:{x:-6.6,z:-2.8,scale:.62},
    drums:{x:3.0,z:-2.8,scale:1.58},
    acoustics:[
      {x:-8.0,z:3.3,scale:.44},
      {x:-4.7,z:5.1,scale:.45},
      {x:-1.4,z:4.1,scale:.44},
    ],
    bass:{x:2.1,z:5.0,scale:.43},
    electrics:[
      {x:5.3,z:3.5,scale:.45},
      {x:7.8,z:1.1,scale:.44},
      {x:9.4,z:-1.4,scale:.43},
    ],
  };

  function specFor(root){
    const n=root?.name||'';
    if(n==='Atelier — dual-tier stage rig')return LAYOUT.keyboard;
    if(n==='Atelier Session 04 · Band Drums')return LAYOUT.drums;
    if(n==='Wish Fingered Bass')return LAYOUT.bass;
    let m=/^Wish Acoustic (\d+)$/.exec(n);
    if(m)return LAYOUT.acoustics[Number(m[1])-1]||null;
    m=/Electric (\d+)$/.exec(n);
    if(m)return LAYOUT.electrics[Number(m[1])-1]||null;
    return null;
  }

  function clearLed(root){
    root.updateWorldMatrix(true,true);
    const box=new T.Box3().setFromObject(root,true);
    if(box.isEmpty()||box.min.z>=MIN_GEOMETRY_Z)return 0;
    const push=MIN_GEOMETRY_Z-box.min.z;
    root.position.z+=push;
    root.updateWorldMatrix(true,true);
    return push;
  }

  function apply(){
    if(venue.current!=='nocturne')return;
    let pushed=0;
    for(const root of camera.roots||[]){
      const spec=specFor(root);if(!spec)continue;
      // Keep the venue manager's correct vertical offset and the authored instrument
      // orientation. Only horizontal placement and scale are venue-specific.
      root.position.x=spec.x;
      root.position.z=spec.z;
      root.scale.setScalar(spec.scale);
      pushed+=clearLed(root);
    }
    const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    runtime?.scene?.updateMatrixWorld?.(true);
    if(runtime?.renderer?.shadowMap)runtime.renderer.shadowMap.needsUpdate=true;
    window.refreshVirtualBandShadows?.();
    console.info('[Venue layout] NOCTURNE band fitted · LED clearance enforced',{
      mainLedZ:MAIN_LED_Z,minimumBandZ:MIN_GEOMETRY_Z,pushApplied:+pushed.toFixed(3),
    });
  }

  window.addEventListener('virtual-band-venue-change',event=>{
    if(event.detail?.id==='nocturne')requestAnimationFrame(apply);
  });

  // The initial venue-change event fires before this module is loaded, so apply once now.
  if(venue.current==='nocturne')requestAnimationFrame(apply);
  window.NocturneBandLayout={apply,layout:LAYOUT,mainLedZ:MAIN_LED_Z,minimumBandZ:MIN_GEOMETRY_Z};
})();
