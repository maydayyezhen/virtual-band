'use strict';

// Automatic NOCTURNE lighting + LED director.
// Reads the already parsed MIDI song data and turns it into a deterministic live-show
// layer: bar-scale palettes/energy, continuous beam motion, instrument focus, drum
// accents, and existing LED presets. No new LED artwork is generated here.
(() => {
  const T = THREE;
  const venue = window.VirtualBandVenues;
  const songs = window.VIRTUAL_BAND_SONGS;
  const songSelect = document.getElementById('bp-song');
  const modeSelect = document.getElementById('bp-mode');
  const playButton = document.getElementById('bp-play');
  const progress = document.getElementById('bp-progress');
  if (!T || !venue || !songs || !songSelect || !playButton || !progress) return;

  const PALETTES = [
    { name:'ice-violet', a:'#69e7ff', b:'#9b78ff', c:'#4d74ff', warm:'#d7e6ff', accent:'#ffffff' },
    { name:'teal-indigo', a:'#69f0d5', b:'#657cff', c:'#b77cff', warm:'#d8ddff', accent:'#ffffff' },
    { name:'blue-rose', a:'#70cfff', b:'#b373ef', c:'#ef82b6', warm:'#ecd8f0', accent:'#ffffff' },
    { name:'cyan-amber', a:'#64e5ee', b:'#5f83ef', c:'#e7a765', warm:'#ffe0b8', accent:'#ffffff' },
  ];
  const ROLE_WEIGHT = { drums:1.28, electric:.95, guitar:.82, bass:.72, upper:.62, lower:.58 };
  const BEAM_FAN = [-28,-17,-7,7,17,28];
  const caches = new WeakMap();
  const timers = new Set();
  let enabled = true;
  let running = false;
  let currentSong = null;
  let analysis = null;
  let eventPtr = 0;
  let lastTime = 0;
  let lastBar = -1;
  let lastBeat = -1;
  let lastLedKey = '';
  let lastTriggerAt = -Infinity;
  let raf = 0;
  let palette = PALETTES[0];
  let baseState = null;

  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const number=v=>{const m=String(v??'').match(/[\d.]+/);return m?Number(m[0]):NaN;};
  const now=()=>performance.now();

  function hash(text){
    let h=2166136261;
    for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function percentile(values,q){
    const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return 1;
    const i=clamp(Math.round((a.length-1)*q),0,a.length-1);
    return Math.max(.0001,a[i]);
  }
  function levelFor(e){return e<.24?'quiet':e<.48?'low':e<.70?'medium':e<.86?'high':'climax';}
  function classifyDrum(note){
    if(note===35||note===36)return 'kick';
    if(note===37||note===38||note===39||note===40)return 'snare';
    if(note===42||note===44||note===46)return 'hat';
    if([41,43,45,47,48,50].includes(note))return 'tom';
    if([49,52,55,57].includes(note))return 'crash';
    if(note===51||note===53||note===59)return 'ride';
    return 'other';
  }

  function analyze(song){
    if(caches.has(song))return caches.get(song);
    const bpm=clamp(number(song.bpm)||120,40,260);
    const beat=60/bpm,bar=beat*4;
    const count=Math.max(1,Math.ceil((song.duration||1)/bar));
    const bars=Array.from({length:count},(_,index)=>({
      index,raw:0,energy:0,events:0,roles:{},drums:{kick:0,snare:0,hat:0,tom:0,crash:0,ride:0,other:0},focus:'drums',
    }));
    const events=[...(song.events||[])].sort((a,b)=>a.s-b.s||a.id-b.id);
    for(const ev of events){
      const bi=clamp(Math.floor(Math.max(0,ev.s)/bar),0,count-1),b=bars[bi];
      const velocity=clamp((ev.v||90)/127,.08,1);
      const duration=Math.max(.03,(ev.e??ev.s+.08)-ev.s);
      const roleWeight=ROLE_WEIGHT[ev.i]??.55;
      const sustain=ev.i==='drums'?1:clamp(.72+duration*.18,.72,1.2);
      const w=velocity*roleWeight*sustain;
      b.raw+=w;b.events++;
      b.roles[ev.i]=(b.roles[ev.i]||0)+w;
      if(ev.i==='drums')b.drums[classifyDrum(ev.n)]++;
    }
    const scale=percentile(bars.map(b=>b.raw),.90);
    for(let i=0;i<bars.length;i++){
      const prev=bars[Math.max(0,i-1)].raw/scale,cur=bars[i].raw/scale,next=bars[Math.min(bars.length-1,i+1)].raw/scale;
      const smoothed=clamp(prev*.18+cur*.64+next*.18,0,1.18);
      bars[i].energy=clamp(smoothed/1.03,0,1);
      const roles=Object.entries(bars[i].roles).sort((a,b)=>b[1]-a[1]);
      bars[i].focus=roles[0]?.[0]||'drums';
      bars[i].level=levelFor(bars[i].energy);
    }
    const result={song,bpm,beat,bar,bars,events,seed:hash((song.artist||'')+'|'+(song.title||''))};
    caches.set(song,result);return result;
  }

  function isVenueActive(){return enabled&&venue.current==='nocturne'&&(modeSelect?.value||'song')==='song';}
  function isPlaying(){return isVenueActive()&&/^■/.test((playButton.textContent||'').trim());}
  function songForUi(){return songs[songSelect.value]||null;}
  function songTime(song){
    const pct=clamp(parseFloat(progress.style.width)||0,0,100);
    return clamp((song?.duration||0)*pct/100,0,song?.duration||0);
  }

  function fixtures(){return [...(venue.stage?.lights?.values?.()||[])];}
  function fixtureSets(){
    const all=fixtures();
    return {
      all,
      rear:all.filter(f=>f.type==='beam'&&f.groups?.has('rear')),
      side:all.filter(f=>f.type==='beam'&&f.groups?.has('side')),
      floor:all.filter(f=>f.type==='beam'&&f.groups?.has('floor')),
      front:all.filter(f=>f.type==='par'&&f.groups?.has('front')&&!f.groups?.has('front-floor')),
      frontFloor:all.filter(f=>f.type==='par'&&f.groups?.has('front-floor')),
    };
  }
  function patch(list,changes,duration=0){
    for(const f of list){try{f.set(changes,duration);}catch(error){console.warn('[Auto show] light patch failed',f?.id,error);}}
  }
  function rootMatches(role,root){
    const n=root?.name||'';
    if(role==='drums')return n==='Atelier Session 04 · Band Drums';
    if(role==='bass')return n==='Wish Fingered Bass';
    if(role==='lower'||role==='upper')return n==='Atelier — dual-tier stage rig';
    if(role==='guitar')return /^Wish Acoustic \d+$/.test(n);
    if(role==='electric')return /Electric \d+$/.test(n);
    return false;
  }
  function focusPoint(role,barIndex){
    const roots=(window.VirtualBandCamera?.roots||[]).filter(r=>rootMatches(role,r)&&r.visible!==false);
    const root=roots.length?roots[(barIndex+analysis.seed)%roots.length]:null;
    if(!root)return new T.Vector3(0,3.3,1.8);
    try{
      root.updateWorldMatrix(true,true);
      const box=new T.Box3().setFromObject(root,true);
      if(!box.isEmpty())return box.getCenter(new T.Vector3());
    }catch{}
    return root.getWorldPosition(new T.Vector3());
  }

  function paletteFor(barIndex,info){
    const phrase=Math.floor(barIndex/8);
    const energyShift=info.energy>.82?1:0;
    return PALETTES[(analysis.seed+phrase+energyShift)%PALETTES.length];
  }
  function activeCount(total,e){
    if(e<.22)return Math.min(2,total);
    if(e<.48)return Math.min(3,total);
    if(e<.70)return Math.min(4,total);
    return total;
  }
  function spreadMask(total,count,offset=0){
    const indices=[...Array(total).keys()].sort((a,b)=>Math.abs((a-(total-1)/2)+offset)-Math.abs((b-(total-1)/2)+offset));
    return new Set(indices.slice(0,count));
  }

  function applyBase(barIndex,force=false){
    if(!analysis||!isVenueActive())return;
    const info=analysis.bars[clamp(barIndex,0,analysis.bars.length-1)];
    palette=paletteFor(barIndex,info);
    const e=info.energy,sets=fixtureSets();
    const mirror=(barIndex&1)?-1:1;
    const rearMask=spreadMask(sets.rear.length,activeCount(sets.rear.length,e));
    const floorMask=spreadMask(sets.floor.length,activeCount(sets.floor.length,Math.max(0,e-.08)),mirror*.25);
    const rearSpeed=analysis.bpm/60/(e>.78?4:e>.48?8:16);
    const floorSpeed=analysis.bpm/60/(e>.72?4:e>.42?8:16);
    const focus=focusPoint(info.focus,barIndex);
    const transition=force ? .06 : clamp(analysis.beat*.35,.12,.42);

    sets.rear.forEach((f,i)=>{
      const enabled=rearMask.has(i),fan=(BEAM_FAN[i]??((i-(sets.rear.length-1)/2)*10))*mirror;
      f.set({
        enabled,color:i%2?palette.b:palette.a,intensity:enabled?lerp(.18,.84,e):.02,
        beam:enabled,angle:lerp(3.4,2.0,e),pan:fan*lerp(.45,1,e),tilt:lerp(-30,-21,e),
        scan:enabled?{pan:lerp(7,34,e),tilt:lerp(2,9,e),speed:rearSpeed,phase:i*.72+(barIndex%4)*.45}:null,
        beatSensitivity:lerp(.18,.62,e),
      },transition);
    });
    sets.floor.forEach((f,i)=>{
      const enabled=floorMask.has(i),fan=(BEAM_FAN[i]??((i-(sets.floor.length-1)/2)*10))*-mirror;
      f.set({
        enabled,color:i%2?palette.c:palette.b,intensity:enabled?lerp(.12,.72,e):.01,
        beam:enabled,angle:lerp(3.6,2.2,e),pan:fan*lerp(.35,.9,e),tilt:lerp(49,35,e),
        scan:enabled?{pan:lerp(5,29,e),tilt:lerp(3,13,e),speed:floorSpeed,phase:i*.86+(barIndex%2)*1.2}:null,
        beatSensitivity:lerp(.22,.78,e),
      },transition);
    });
    sets.side.forEach((f,i)=>{
      const active=e>.30&&(e>.62||i%2===(barIndex&1));
      const side=i<sets.side.length/2?-1:1;
      const target=focus.clone();target.x+=side*(e>.72?.3:1.0);
      f.set({
        enabled:active,color:i%2?palette.b:palette.a,intensity:active?lerp(.18,.70,e):.01,
        beam:active,angle:lerp(4.6,2.5,e),target:target.toArray(),scan:null,
        beatSensitivity:lerp(.08,.38,e),
      },transition);
    });
    patch(sets.front,{enabled:true,color:palette.warm,intensity:lerp(.16,.54,e),beatSensitivity:.06},transition);
    patch(sets.frontFloor,{enabled:true,color:palette.a,intensity:lerp(.08,.40,e),beatSensitivity:lerp(.08,.30,e)},transition);
    try{venue.controls?.setHaze?.({density:lerp(.075,.155,e),speed:lerp(.045,.12,e),animated:true,color:palette.warm});}catch{}
    baseState={barIndex,info,sets,palette};
    applyLed(barIndex,info,palette,force);
  }

  function ledPattern(info,barIndex){
    if(info.energy<.20)return 'typography';
    if(info.energy<.46)return 'orbital';
    if(info.energy<.72)return 'ribbons';
    return (Math.floor(barIndex/4)&1)?'grid':'ribbons';
  }
  function applyLed(barIndex,info,p,force=false){
    const stage=venue.stage;if(!stage?.screens)return;
    const segment=Math.floor(barIndex/4),pattern=ledPattern(info,barIndex);
    const key=`${segment}|${pattern}|${p.name}`;
    const brightness=lerp(.38,.92,info.energy);
    const main=stage.screens.get('main'),left=stage.screens.get('left'),right=stage.screens.get('right');
    if(key!==lastLedKey||force){
      try{
        venue.controls?.setScreenPattern?.('main',pattern,{
          brightness,playing:true,params:{palette:[p.a,p.b,p.c],text:true,subtitle:currentSong?.title||'LIVE SESSION'},
        });
        venue.controls?.setScreenPattern?.('left','ribbons',{brightness:brightness*.78,playing:true,params:{palette:[p.a,p.b,p.c],text:false}});
        venue.controls?.setScreenPattern?.('right','ribbons',{brightness:brightness*.78,playing:true,time:8,params:{palette:[p.c,p.b,p.a],text:false}});
      }catch(error){console.warn('[Auto show] LED cue failed',error);}
      lastLedKey=key;
    }else{
      try{main?.setOptions?.({brightness});left?.setOptions?.({brightness:brightness*.78});right?.setOptions?.({brightness:brightness*.78});}catch{}
    }
    try{venue.controls?.setSongSection?.(info.level);}catch{}
  }

  function triggerBeat(strength,duration=.25,force=false){
    const t=now();if(!force&&t-lastTriggerAt<70)return;
    lastTriggerAt=t;
    try{venue.controls?.triggerBeat?.(clamp(strength,0,1),{duration});}catch{}
  }
  function later(fn,ms){
    const id=setTimeout(()=>{timers.delete(id);if(running&&isVenueActive())fn();},ms);timers.add(id);return id;
  }
  function whiteHit(kind,strength){
    if(!baseState)return;
    const {sets,palette:p,info}=baseState;
    if(kind==='snare'){
      patch(sets.frontFloor,{enabled:true,color:p.accent,intensity:clamp(.62+strength*.38,0,1),beatSensitivity:.1},.025);
      later(()=>patch(sets.frontFloor,{color:p.a,intensity:lerp(.08,.40,info.energy),beatSensitivity:lerp(.08,.30,info.energy)},.10),85);
    }else if(kind==='crash'){
      const beams=[...sets.rear,...sets.floor,...sets.side];
      patch(beams,{enabled:true,color:p.accent,intensity:clamp(.72+strength*.30,0,1),beam:1,beatSensitivity:.2},.02);
      patch(sets.frontFloor,{enabled:true,color:p.accent,intensity:1},.02);
      later(()=>applyBase(baseState.barIndex,true),120);
    }
  }

  function processEvent(ev){
    const vel=clamp((ev.v||90)/127,0,1);
    if(ev.i==='drums'){
      const kind=classifyDrum(ev.n);
      if(kind==='kick')triggerBeat(.30+vel*.38,.18);
      else if(kind==='snare'){triggerBeat(.38+vel*.42,.18);if(vel>.48)whiteHit('snare',vel);}
      else if(kind==='crash'){triggerBeat(.78+vel*.22,.32,true);whiteHit('crash',vel);}
      else if(kind==='tom')triggerBeat(.28+vel*.35,.20);
      else if(kind==='ride'&&vel>.72)triggerBeat(.26+vel*.20,.14);
      else if(kind==='hat'&&baseState?.info?.energy>.72&&vel>.78)triggerBeat(.18+vel*.15,.10);
    }else if((ev.i==='electric'||ev.i==='guitar')&&vel>.88&&baseState?.info?.energy>.56){
      triggerBeat(.18+vel*.18,.12);
    }
  }

  function lowerBound(events,t){
    let lo=0,hi=events.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].s<t)lo=mid+1;else hi=mid;}
    return lo;
  }
  function syncPointer(t){eventPtr=lowerBound(analysis.events,Math.max(0,t-.025));}
  function begin(song){
    currentSong=song;analysis=analyze(song);running=true;lastTime=songTime(song);lastBar=-1;lastBeat=-1;lastLedKey='';lastTriggerAt=-Infinity;
    syncPointer(lastTime);
    try{venue.controls?.setDemo?.(false);venue.controls?.setPaused?.(false);venue.controls?.setStageMode?.('manual');}catch{}
    applyBase(Math.floor(lastTime/analysis.bar),true);
    console.info('[Auto show] MIDI lighting + existing LED presets started',{
      title:song.title,bpm:analysis.bpm,bars:analysis.bars.length,
    });
  }
  function stop({restore=true}={}){
    if(!running)return;
    running=false;currentSong=null;analysis=null;baseState=null;eventPtr=0;lastBar=lastBeat=-1;lastLedKey='';
    for(const id of timers)clearTimeout(id);timers.clear();
    if(restore&&venue.current==='nocturne'){
      try{venue.controls?.setStageMode?.('nocturne');venue.controls?.setDemo?.(false);}catch{}
    }
    console.info('[Auto show] stopped');
  }

  function tick(){
    raf=requestAnimationFrame(tick);
    const song=songForUi(),playing=isPlaying();
    if(!playing||!song){if(running)stop({restore:true});return;}
    if(!running||song!==currentSong){if(running)stop({restore:false});begin(song);}
    if(!analysis)return;
    const t=songTime(song);
    if(t<lastTime-.18||t>lastTime+.75)syncPointer(t);
    const barIndex=clamp(Math.floor(t/analysis.bar),0,analysis.bars.length-1);
    const beatIndex=Math.floor(t/analysis.beat);
    if(barIndex!==lastBar){lastBar=barIndex;applyBase(barIndex,false);}
    if(beatIndex!==lastBeat){
      lastBeat=beatIndex;
      const info=analysis.bars[barIndex],beatInBar=((beatIndex%4)+4)%4;
      if(beatInBar===0)triggerBeat(.22+info.energy*.34,.22);
      else if(info.energy>.68&&beatInBar===2)triggerBeat(.14+info.energy*.22,.14);
    }
    while(eventPtr<analysis.events.length&&analysis.events[eventPtr].s<=t+.035){
      const ev=analysis.events[eventPtr++];if(ev.s>=lastTime-.05)processEvent(ev);
    }
    lastTime=t;
  }

  window.addEventListener('virtual-band-venue-change',event=>{
    if(event.detail?.id!=='nocturne'){if(running)stop({restore:false});}
  });
  songSelect.addEventListener('change',()=>{if(running)stop({restore:false});});
  modeSelect?.addEventListener('change',()=>{if(running&&modeSelect.value!=='song')stop({restore:true});});

  window.AutoShowDirector={
    get enabled(){return enabled;},
    setEnabled(value){enabled=!!value;if(!enabled&&running)stop({restore:true});return enabled;},
    get running(){return running;},
    get state(){return running&&analysis?{song:currentSong?.title,time:lastTime,bar:lastBar,beat:lastBeat,energy:baseState?.info?.energy??0,palette:palette.name}:null;},
    analyze(song=songForUi()){return song?analyze(song):null;},
    refresh(){if(running)applyBase(lastBar<0?0:lastBar,true);},
  };
  raf=requestAnimationFrame(tick);
  console.info('[Auto show] automatic lighting + LED director attached');
})();
