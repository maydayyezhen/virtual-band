'use strict';

// Keep all performance cameras on the usable side of the main LED wall. The authored
// venue extends behind z=-8.17, but those backstage positions are visually useless for
// band shots because the LED/wall occludes the keyboard and drums.
(() => {
  const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
  if(!runtime?.camera||!runtime?.renderer)return;
  const MIN_Z=-7.25;
  const active=()=>window.VirtualBandVenues?.current==='nocturne';

  const host=runtime.camera.position;
  const priorSet=host.set.bind(host),priorCopy=host.copy.bind(host);
  host.set=function(x,y,z){return priorSet(x,y,active()?Math.max(MIN_Z,z):z);};
  host.copy=function(v){
    if(!active())return priorCopy(v);
    return priorCopy({x:v.x,y:v.y,z:Math.max(MIN_Z,v.z)});
  };

  const priorRender=runtime.renderer.render.bind(runtime.renderer);
  runtime.renderer.render=function(scene,cam){
    if(active()&&cam?.isPerspectiveCamera&&cam.position.z<MIN_Z){
      cam.position.z=MIN_Z;
      cam.updateMatrixWorld(true);
    }
    return priorRender(scene,cam);
  };

  window.NocturneCameraClearance={minZ:MIN_Z};
  console.info('[Venue camera] front-of-LED clearance attached',MIN_Z);
})();
