'use strict';

// Venue-specific ensemble layout. The base stage layout remains untouched for the
// "none" scene; NOCTURNE gets a smaller live-stage arrangement that preserves the
// 24m x 7.5m main LED as the dominant visual element instead of letting instrument
// showcase models fill the screen.
(() => {
  const T=THREE;
  const camera=window.VirtualBandCamera;
  const venue=window.VirtualBandVenues;
  if(!camera||!venue)return;

  const MAIN_LED_Z=-8.17;
  const LED_CLEARANCE=.95;
  const MIN_GEOMETRY_Z=MAIN_LED_Z+LED_CLEARANCE;

  // Art-direction pass 3: move the whole band about two metres toward the audience so
  // the live area does not feel glued to the LED wall. Keep the centre corridor open,
  // and trim the wide dual-keyboard rig another step so it reads at venue scale.
  const LAYOUT={
    keyboard:{x:-7.5,z:-1.7,scale:.46},
    drums:{x:3.7,z:-1.5,scale:1.22},
    acoustics:[
      {x:-8.8,z:4.0,scale:.34},
      {x:-5.7,z:5.8,scale:.35},
      {x:-2.8,z:4.5,scale:.34},
    ],
    bass:{x:4.4,z:5.6,scale:.31},
    electrics:[
      {x:6.7,z:4.1,scale:.34},
      {x:8.8,z:2.2,scale:.33},
      {x:10.2,z:0.0,scale:.32},
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
    const report=[];
    for(const root of camera.roots||[]){
      const spec=specFor(root);if(!spec)continue;
      // Venue manager already owns the correct stage-height offset and the instrument
      // orientation. This layer changes only horizontal placement and absolute scale.
      root.position.x=spec.x;
      root.position.z=spec.z;
      root.scale.setScalar(spec.scale);
      pushed+=clearLed(root);
      root.updateWorldMatrix(true,true);
      const box=new T.Box3().setFromObject(root,true);
      report.push({name:root.name,scale:spec.scale,height:box.isEmpty()?0:+box.getSize(new T.Vector3()).y.toFixed(2)});
    }
    const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    runtime?.scene?.updateMatrixWorld?.(true);
    if(runtime?.renderer?.shadowMap)runtime.renderer.shadowMap.needsUpdate=true;
    window.refreshVirtualBandShadows?.();
    console.info('[Venue layout] NOCTURNE live-stage proportions applied',{
      mainLedZ:MAIN_LED_Z,minimumBandZ:MIN_GEOMETRY_Z,pushApplied:+pushed.toFixed(3),instruments:report,
    });
  }

  window.addEventListener('virtual-band-venue-change',event=>{
    if(event.detail?.id==='nocturne')requestAnimationFrame(apply);
  });

  // The initial venue-change event fires before this module is loaded, so apply once now.
  if(venue.current==='nocturne')requestAnimationFrame(apply);
  window.NocturneBandLayout={apply,layout:LAYOUT,mainLedZ:MAIN_LED_Z,minimumBandZ:MIN_GEOMETRY_Z};
})();
