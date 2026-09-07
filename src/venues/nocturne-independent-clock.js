'use strict';

// Keep the authored NOCTURNE fixture/LED/haze animation clock independent from whichever
// camera renders the frame. The venue adapter historically advanced only when the host
// camera object reached its renderer bridge; Camera v3.2 renders through a cloned PROGRAM
// camera, so non-Agent songs could freeze all moving lights/LEDs. This watchdog advances
// the same authored stage state only when the venue adapter did not advance it itself.
(() => {
  const venue=window.VirtualBandVenues;
  if(!venue)return;

  let raf=0;
  let lastWall=performance.now();
  let lastStageTime=NaN;
  let warned=false;

  function advance(app,realDt){
    if(!app||app.paused)return;
    const dt=Math.min(.05,Math.max(0,realDt));
    if(!dt)return;

    app.time+=dt;
    if(app.demo)app.demoTime+=dt;

    if(app.beat?.value!=null){
      app.beat.value*=Math.exp((-dt*4)/(app.beat.duration||.28));
      if(app.beat.value<.001)app.beat.value=0;
    }
    if(app.demo&&!app.paused&&app.demoTime>=app.nextDemoBeat&&app.mode!=='blackout'){
      app.triggerBeat?.(app.beat?.index%4===0?.9:.5,{source:'demo'});
      app.nextDemoBeat=app.demoTime+60/(app.bpm||120);
    }

    const frame={dt,time:app.time,beat:app.beat?.value||0,bpm:app.bpm||120,stage:app};
    for(const fn of [...(app.updates||[])]){
      try{fn(frame);}catch(error){app.updates?.delete?.(fn);console.error('[NOCTURNE clock update]',error);}
    }
    for(const item of app.instruments?.values?.()||[]){
      if(!item.update)continue;
      try{item.update(frame,item.root);}catch(error){item.update=null;console.error('[NOCTURNE instrument update]',error);}
    }
    app.haze?.update?.(dt);
    for(const fixture of app.lights?.values?.()||[])fixture.update?.(dt);
    for(const screen of app.screens?.values?.()||[])screen.update?.(dt);

    const main=app.screens?.get?.('main');
    if(main&&app.reflection){
      app.reflection.uniforms.source.value=main.material.uniforms.source.value;
      app.reflection.uniforms.brightness.value=main.brightness;
      app.reflection.uniforms.decodeSRGB.value=main.material.uniforms.decodeSRGB.value;
    }
  }

  function tick(now){
    raf=requestAnimationFrame(tick);
    if(venue.current!=='nocturne'){
      lastStageTime=NaN;
      lastWall=now;
      return;
    }
    const app=venue.stage;
    if(!app?.lights||!app?.screens){lastWall=now;return;}

    const stageTime=Number(app.time)||0;
    if(!Number.isFinite(lastStageTime)){
      lastStageTime=stageTime;
      lastWall=now;
      return;
    }

    // If venue-manager already advanced the stage since our previous rAF, it owns this
    // frame. Otherwise advance here. That avoids double-speed animation with the normal
    // host camera while fixing PROGRAM-camera renders.
    if(Math.abs(stageTime-lastStageTime)>1e-5){
      lastStageTime=stageTime;
      lastWall=now;
      return;
    }

    const dt=(now-lastWall)/1000;
    lastWall=now;
    try{
      advance(app,dt);
      lastStageTime=Number(app.time)||stageTime;
    }catch(error){
      if(!warned){warned=true;console.error('[NOCTURNE clock] independent stage update failed',error);}
    }
  }

  raf=requestAnimationFrame(tick);
  window.NocturneIndependentClock={
    get running(){return !!raf;},
    destroy(){if(raf)cancelAnimationFrame(raf);raf=0;},
  };
  console.info('[Venue] NOCTURNE independent fixture/LED clock attached');
})();
