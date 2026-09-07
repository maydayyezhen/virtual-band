'use strict';

// Queen · Another One Bites the Dust — Agent lighting arrangement v1.
// The arrangement is generated from the loaded MIDI, then art-directed with a song-
// specific "groove noir" look. It owns fixtures / haze / stage key+fill only; LED stays
// under nocturne-auto-show.js. Agent re-asserts its current cue after Auto Lighting bar
// updates, so priority is Agent lighting > Auto lighting while this song is playing.
(() => {
  const T=THREE;
  const SONG_ID='dust';
  const songs=window.VIRTUAL_BAND_SONGS||{};
  const venue=window.VirtualBandVenues;
  const songSelect=document.getElementById('bp-song');
  const modeSelect=document.getElementById('bp-mode');
  const playButton=document.getElementById('bp-play');
  const progress=document.getElementById('bp-progress');
  if(!T||!venue||!songs[SONG_ID]||!songSelect||!playButton||!progress)return;

  const TAU=Math.PI*2;
  const LOOK={
    id:'queen-dust-groove-noir',
    concept:'groove-noir',
    // Deliberately restrained: dark red + cold/warm white + graphite blue. White is an
    // accent, not a permanent wash, so the bass/drum groove can create the rhythm.
    red:'#b8323c', deepRed:'#631821', white:'#f4f0e7', steel:'#788391', blue:'#465a78', warm:'#e3c9a4',
    accent:'#ffffff', dark:'#1d1217',
  };
  const ROLE_WEIGHT={drums:1.22,bass:1.18,electric:.92,guitar:.72,lower:.58,upper:.62};
  const caches=new WeakMap();
  const timers=new Set();
  let running=false,analysis=null,plan=null,cueIndex=-1,eventPtr=0,lastTime=0,lastBar=-1,currentCue=null,raf=0;

  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const bpmOf=s=>{const m=String(s?.bpm??'').match(/[\d.]+/);const n=m?Number(m[0]):110;return Number.isFinite(n)&&n>20?n:110;};
  const percentile=(a,q)=>{const v=a.filter(Number.isFinite).sort((x,y)=>x-y);return v.length?Math.max(.0001,v[Math.round((v.length-1)*q)]):1;};
  const drumKind=n=>[35,36].includes(n)?'kick':[37,38,39,40].includes(n)?'snare':[49,52,55,57].includes(n)?'crash':[41,43,45,47,48,50].includes(n)?'tom':[42,44,46].includes(n)?'hat':'other';

  function analyze(song){
    if(caches.has(song))return caches.get(song);
    const bpm=bpmOf(song),beat=60/bpm,bar=beat*4;
    const count=Math.max(1,Math.ceil((Number(song.duration)||1)/bar));
    const bars=Array.from({length:count},(_,index)=>({index,raw:0,energy:0,density:0,roles:{},drums:{kick:0,snare:0,crash:0,tom:0,hat:0,other:0},events:0}));
    const events=[...(song.events||[])].sort((a,b)=>(+a.s||0)-(+b.s||0));
    for(const ev of events){
      const t=Math.max(0,+ev.s||0),bi=clamp(Math.floor(t/bar),0,count-1),b=bars[bi];
      const vel=clamp((+ev.v||90)/127,.06,1),dur=Math.max(.035,(+ev.e||t+.08)-t),role=ev.i||'other';
      const w=vel*(ROLE_WEIGHT[role]??.52)*(role==='drums'?1:clamp(.72+dur*.16,.72,1.16));
      b.raw+=w;b.events++;b.roles[role]=(b.roles[role]||0)+w;
      if(role==='drums')b.drums[drumKind(+ev.n)]++;
    }
    const energyScale=percentile(bars.map(b=>b.raw),.9),densityScale=percentile(bars.map(b=>b.events),.9);
    for(let i=0;i<bars.length;i++){
      const p=bars[Math.max(0,i-1)].raw/energyScale,c=bars[i].raw/energyScale,n=bars[Math.min(bars.length-1,i+1)].raw/energyScale;
      bars[i].energy=clamp(p*.16+c*.68+n*.16,0,1);
      bars[i].density=clamp(bars[i].events/densityScale,0,1);
      bars[i].focus=Object.entries(bars[i].roles).sort((a,b)=>b[1]-a[1])[0]?.[0]||'bass';
    }
    const out={song,bpm,beat,bar,bars,events,duration:Number(song.duration)||count*bar};
    caches.set(song,out);return out;
  }

  function phraseStats(a,start,end){
    const slice=a.bars.slice(start,Math.min(a.bars.length,end));
    if(!slice.length)return{energy:0,density:0,focus:'bass',crashes:0,roles:{}};
    const roles={};let energy=0,density=0,crashes=0;
    for(const b of slice){
      energy+=b.energy;density+=b.density;crashes+=b.drums.crash;
      for(const [k,v] of Object.entries(b.roles))roles[k]=(roles[k]||0)+v;
    }
    return{energy:energy/slice.length,density:density/slice.length,focus:Object.entries(roles).sort((a,b)=>b[1]-a[1])[0]?.[0]||'bass',crashes,roles};
  }

  function styleFor(stats,index,total,trend){
    if(index===0)return'opening-lock';
    if(index>=total-2&&stats.energy<.48)return'outro-shadow';
    if(stats.energy<.20)return'void';
    if(stats.focus==='bass'&&stats.energy<.58)return'bass-lock';
    if(stats.energy<.43)return index%2?'groove-left':'groove-right';
    if(stats.energy<.64)return trend>.08?'build-fan':index%2?'cross-groove':'stagger-groove';
    if(stats.energy<.82)return stats.crashes?'knife-hit':'knife-drive';
    return'climax-grid';
  }

  function buildPlan(song){
    const a=analyze(song),starts=new Set([0]);
    // Four-bar phrases are the backbone. Extra cue boundaries are admitted only for a
    // real texture/energy change, so the design evolves in phrases instead of flickering.
    for(let i=4;i<a.bars.length;i+=4)starts.add(i);
    for(let i=1;i<a.bars.length;i++){
      const d=Math.abs(a.bars[i].energy-a.bars[i-1].energy);
      const focusChanged=a.bars[i].focus!==a.bars[i-1].focus;
      if(d>.24||(d>.16&&focusChanged)||a.bars[i].drums.crash>=2)starts.add(i);
    }
    const sorted=[...starts].sort((x,y)=>x-y),cues=[];
    for(let i=0;i<sorted.length;i++){
      const start=sorted[i],end=sorted[i+1]??Math.min(a.bars.length,start+4),stats=phraseStats(a,start,end);
      const before=start?phraseStats(a,Math.max(0,start-2),start).energy:stats.energy;
      const after=phraseStats(a,end,Math.min(a.bars.length,end+2)).energy;
      const trend=after-before,style=styleFor(stats,i,sorted.length,trend);
      cues.push({
        index:i,bar:start,time:start*a.bar,endBar:end,style,energy:stats.energy,density:stats.density,focus:stats.focus,crashes:stats.crashes,
        transitionBeats:style==='void'||style==='outro-shadow'?1.8:style==='climax-grid'?.65:1.1,
        reason:{midi:{energy:+stats.energy.toFixed(2),density:+stats.density.toFixed(2),focus:stats.focus,crashes:stats.crashes,trend:+trend.toFixed(2)},artDirection:LOOK.concept},
      });
    }
    return{song:SONG_ID,bpm:a.bpm,look:{...LOOK},generatedFromMidi:true,cues,analysis:a};
  }

  function songTime(song){
    const pct=clamp(parseFloat(progress.style.width)||0,0,100);
    return clamp((Number(song.duration)||0)*pct/100,0,Number(song.duration)||0);
  }
  function isPlaying(){return venue.current==='nocturne'&&modeSelect?.value==='song'&&songSelect.value===SONG_ID&&(/停止/.test(playButton.textContent||'')||/^■/.test((playButton.textContent||'').trim()));}
  function fixtureSets(){
    const all=[...(venue.stage?.lights?.values?.()||[])];
    return{
      all,
      rear:all.filter(f=>f.type==='beam'&&f.groups?.has('rear')),
      side:all.filter(f=>f.type==='beam'&&f.groups?.has('side')),
      floor:all.filter(f=>f.type==='beam'&&f.groups?.has('floor')),
      front:all.filter(f=>f.type==='par'&&f.groups?.has('front')&&!f.groups?.has('front-floor')),
      frontFloor:all.filter(f=>f.type==='par'&&f.groups?.has('front-floor')),
    };
  }
  function roleRoot(role){
    const roots=window.VirtualBandCamera?.roots||[];
    const find=re=>roots.find(r=>re.test(r.name||'')&&r.visible!==false)||null;
    if(role==='bass')return find(/Fingered Bass/);
    if(role==='drums')return find(/Band Drums/);
    if(role==='electric')return find(/Electric \d+$/);
    if(role==='guitar')return find(/Wish Acoustic \d+$/);
    if(role==='lower'||role==='upper')return find(/dual-tier/);
    return null;
  }
  function focusPoint(role){
    const root=roleRoot(role)||roleRoot('bass')||roleRoot('drums');
    if(!root)return new T.Vector3(0,3,1.5);
    try{root.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(root,true);if(!box.isEmpty())return box.getCenter(new T.Vector3());}catch{}
    return root.getWorldPosition(new T.Vector3());
  }

  function scanContinuous(f,pan,tilt,speed,seed){
    const old=f.state?.scan,t=venue.stage?.time||0;
    const absolute=old?t*TAU*old.speed+old.phase:seed;
    return{pan,tilt,speed,phase:absolute-t*TAU*speed};
  }
  function setFixture(f,patch,duration){try{f.set(patch,duration);}catch(error){console.warn('[Agent Lighting · Dust]',f?.id,error);}}
  function dimPatch(color,intensity=.012){return{enabled:true,beam:true,color,intensity,angle:3.2,distance:48,strobe:0,beatSensitivity:.06,scan:null};}

  function applyCue(cue,{force=false}={}){
    if(!running||!cue)return;
    const a=analysis,e=cue.energy,sets=fixtureSets(),beat=a.beat;
    const dur=force?.08:clamp(beat*cue.transitionBeats,.28,1.25);
    const focus=focusPoint(cue.focus),bass=focusPoint('bass'),drums=focusPoint('drums');
    const rearFan=[-30,-18,-7,7,18,30],floorFan=[30,18,7,-7,-18,-30];
    const red=LOOK.red,white=LOOK.white,steel=LOOK.steel,blue=LOOK.blue,warm=LOOK.warm;
    const rearSpeed=a.bpm/60/8,faster=a.bpm/60/4,slow=a.bpm/60/16;

    // Start from a deterministic low-power state, then style-specific layers add energy.
    sets.rear.forEach((f,i)=>setFixture(f,{...dimPatch(i%2?LOOK.deepRed:steel),pan:rearFan[i]||0,tilt:-26},dur));
    sets.floor.forEach((f,i)=>setFixture(f,{...dimPatch(i%2?blue:LOOK.deepRed),pan:floorFan[i]||0,tilt:42},dur));
    sets.side.forEach((f,i)=>setFixture(f,{...dimPatch(i%2?white:red,.01),target:focus.toArray(),angle:4.2},dur));
    sets.front.forEach(f=>setFixture(f,{enabled:true,beam:true,color:warm,intensity:lerp(.12,.42,e),angle:24,distance:42,strobe:0,beatSensitivity:.035,scan:null},dur));
    sets.frontFloor.forEach((f,i)=>setFixture(f,{enabled:true,beam:true,color:i%2?LOOK.deepRed:red,intensity:lerp(.035,.18,e),angle:22,distance:34,strobe:0,beatSensitivity:.08,scan:null},dur));

    const rear=(count,intensity,colorA=red,colorB=white,scanPan=10,scanTilt=3,speed=rearSpeed)=>sets.rear.forEach((f,i)=>{
      const active=i<count||i>=sets.rear.length-count;
      setFixture(f,{enabled:true,beam:true,color:i%2?colorB:colorA,intensity:active?intensity:.012,angle:lerp(2.8,1.9,e),distance:58,
        pan:rearFan[i]||0,tilt:lerp(-29,-21,e),strobe:0,beatSensitivity:lerp(.14,.42,e),
        scan:active?scanContinuous(f,scanPan,scanTilt,speed,i*.81):null},dur);
    });
    const floor=(count,intensity,colorA=LOOK.deepRed,colorB=red,scanPan=8,scanTilt=5,speed=rearSpeed)=>sets.floor.forEach((f,i)=>{
      const active=Math.abs(i-(sets.floor.length-1)/2)<=count;
      setFixture(f,{enabled:true,beam:true,color:i%2?colorB:colorA,intensity:active?intensity:.01,angle:lerp(3.2,2.0,e),distance:54,
        pan:floorFan[i]||0,tilt:lerp(48,35,e),strobe:0,beatSensitivity:lerp(.18,.52,e),
        scan:active?scanContinuous(f,scanPan,scanTilt,speed,i*.93):null},dur);
    });

    switch(cue.style){
      case'opening-lock':
      case'bass-lock':{
        rear(2,lerp(.24,.46,e),LOOK.deepRed,red,5,2,slow);
        floor(1,lerp(.13,.28,e),LOOK.deepRed,steel,4,4,slow);
        sets.side.forEach((f,i)=>setFixture(f,{enabled:true,beam:true,color:i%2?white:red,intensity:i<2?.34:.12,angle:i<2?3.1:4.6,distance:52,target:bass.toArray(),scan:null,strobe:0,beatSensitivity:.10},dur));
        break;
      }
      case'void':
      case'outro-shadow':{
        rear(1,.13,LOOK.deepRed,steel,3,1,slow);
        floor(0,.05,LOOK.deepRed,LOOK.deepRed,2,2,slow);
        sets.front.forEach(f=>setFixture(f,{color:warm,intensity:.11,beatSensitivity:.02},dur));
        sets.side.forEach((f,i)=>setFixture(f,{color:i?'#6f7780':red,intensity:i===0?.18:.025,target:(cue.focus==='drums'?drums:bass).toArray(),angle:3.2,scan:null},dur));
        break;
      }
      case'groove-left':
      case'groove-right':{
        const mirror=cue.style==='groove-left'?-1:1;
        rear(2,lerp(.34,.56,e),red,steel,12,3,rearSpeed);
        floor(1,lerp(.20,.38,e),LOOK.deepRed,red,8,7,rearSpeed);
        sets.rear.forEach((f,i)=>setFixture(f,{pan:(rearFan[i]||0)*mirror},dur));
        sets.side.forEach((f,i)=>setFixture(f,{color:i%2?white:red,intensity:i%2?.22:.34,target:focus.toArray(),angle:3.4,beatSensitivity:.14},dur));
        break;
      }
      case'stagger-groove':{
        rear(3,lerp(.42,.68,e),red,white,17,4,rearSpeed);
        floor(2,lerp(.24,.46,e),LOOK.deepRed,steel,11,8,rearSpeed);
        sets.rear.forEach((f,i)=>setFixture(f,{scan:scanContinuous(f,14,4,rearSpeed,i*.95+(i%2?1.3:0))},dur));
        break;
      }
      case'cross-groove':{
        rear(3,lerp(.44,.70,e),red,steel,20,5,rearSpeed);
        floor(2,lerp(.28,.48,e),LOOK.deepRed,red,15,9,rearSpeed);
        sets.side.forEach((f,i)=>{
          const target=(i%2?drums:bass).clone();target.x+=(i<2?-1:1)*1.2;
          setFixture(f,{color:i%2?white:red,intensity:.46,angle:2.8,target:target.toArray(),beatSensitivity:.12},dur);
        });
        break;
      }
      case'build-fan':{
        rear(3,lerp(.52,.76,e),red,white,25,7,rearSpeed);
        floor(2,lerp(.30,.54,e),blue,red,18,10,rearSpeed);
        sets.side.forEach((f,i)=>setFixture(f,{color:i%2?white:red,intensity:.40,angle:3,target:focus.toArray()},dur));
        break;
      }
      case'knife-hit':
      case'knife-drive':{
        rear(3,lerp(.64,.86,e),red,white,32,7,faster);
        floor(3,lerp(.42,.68,e),LOOK.deepRed,red,24,12,faster);
        sets.rear.forEach(f=>setFixture(f,{angle:1.7,distance:68,beatSensitivity:.34},dur));
        sets.floor.forEach(f=>setFixture(f,{angle:1.9,distance:62,beatSensitivity:.44},dur));
        sets.side.forEach((f,i)=>setFixture(f,{color:i%2?white:red,intensity:.54,angle:2.4,target:(i%2?drums:bass).toArray(),beatSensitivity:.10},dur));
        break;
      }
      case'climax-grid':{
        rear(3,.92,red,white,38,10,faster);
        floor(3,.74,LOOK.deepRed,white,30,14,faster);
        sets.side.forEach((f,i)=>setFixture(f,{color:i%2?white:red,intensity:.72,angle:2.3,target:(i%2?focus:drums).toArray(),beatSensitivity:.18},dur));
        sets.front.forEach(f=>setFixture(f,{color:white,intensity:.56,beatSensitivity:.08},dur));
        sets.frontFloor.forEach((f,i)=>setFixture(f,{color:i%3===0?white:red,intensity:.34,beatSensitivity:.22},dur));
        break;
      }
    }

    try{
      const stage=venue.stage;
      venue.controls?.setHaze?.({density:lerp(.075,.17,e),speed:lerp(.045,.13,e),animated:true,color:e>.72?LOOK.steel:LOOK.warm});
      if(stage?.key)stage.key.intensity=lerp(850,1520,e);
      if(stage?.fill)stage.fill.intensity=lerp(.48,.98,e);
      if(stage?.mats?.edge?.color)stage.mats.edge.color.set(e>.68?LOOK.red:LOOK.steel).multiplyScalar(.46);
    }catch{}
    currentCue=cue;
  }

  function restoreCue(delay=0){
    const fn=()=>{timers.delete(id);if(running&&currentCue)applyCue(currentCue,{force:true});};
    let id;if(delay>0){id=setTimeout(fn,delay);timers.add(id);}else applyCue(currentCue,{force:true});
  }
  function accent(kind,vel){
    if(!currentCue)return;
    const sets=fixtureSets();
    if(kind==='snare'&&vel>.70){
      sets.frontFloor.forEach((f,i)=>{if(i%2===0)setFixture(f,{enabled:true,color:LOOK.white,intensity:clamp(.48+vel*.34,0,1),beatSensitivity:.04},.025);});
      restoreCue(82);
    }else if(kind==='crash'){
      [...sets.rear,...sets.floor].forEach(f=>setFixture(f,{enabled:true,beam:true,color:LOOK.accent,intensity:clamp(.76+vel*.22,0,1),strobe:vel>.88?9:0,beatSensitivity:.05},.018));
      sets.frontFloor.forEach(f=>setFixture(f,{enabled:true,color:LOOK.white,intensity:.92},.018));
      restoreCue(125);
    }
  }

  function lowerBound(events,t){let lo=0,hi=events.length;while(lo<hi){const m=(lo+hi)>>1;if((+events[m].s||0)<t)lo=m+1;else hi=m;}return lo;}
  function cueAtBar(bar){
    const cues=plan?.cues||[];let lo=0,hi=cues.length;
    while(lo<hi){const m=(lo+hi)>>1;if(cues[m].bar<=bar)lo=m+1;else hi=m;}
    return Math.max(0,lo-1);
  }
  function begin(){
    analysis=analyze(songs[SONG_ID]);plan=buildPlan(songs[SONG_ID]);running=true;
    lastTime=songTime(songs[SONG_ID]);lastBar=-1;eventPtr=lowerBound(analysis.events,Math.max(0,lastTime-.03));cueIndex=-1;currentCue=null;
    const bar=clamp(Math.floor(lastTime/analysis.bar),0,analysis.bars.length-1);cueIndex=cueAtBar(bar);applyCue(plan.cues[cueIndex],{force:true});lastBar=bar;
    console.info('[Agent Lighting · Dust] MIDI + song-concept arrangement started',{concept:LOOK.concept,cues:plan.cues.length,bpm:analysis.bpm});
  }
  function stop(){
    if(!running)return;running=false;analysis=null;plan=null;cueIndex=-1;currentCue=null;eventPtr=0;lastBar=-1;
    for(const id of timers)clearTimeout(id);timers.clear();
    console.info('[Agent Lighting · Dust] released to Auto Lighting');
  }

  function tick(){
    raf=requestAnimationFrame(tick);
    if(!isPlaying()){if(running)stop();return;}
    if(!running)begin();
    if(!analysis||!plan)return;
    const t=songTime(songs[SONG_ID]);
    if(t<lastTime-.18||t>lastTime+.8)eventPtr=lowerBound(analysis.events,Math.max(0,t-.03));
    const bar=clamp(Math.floor(t/analysis.bar),0,analysis.bars.length-1);
    if(bar!==lastBar){
      lastBar=bar;
      const next=cueAtBar(bar);
      if(next!==cueIndex){cueIndex=next;applyCue(plan.cues[cueIndex]);}
      else applyCue(plan.cues[cueIndex]); // re-assert after Auto Lighting's per-bar update.
    }
    while(eventPtr<analysis.events.length&&(+analysis.events[eventPtr].s||0)<=t+.035){
      const ev=analysis.events[eventPtr++];
      if((+ev.s||0)>=lastTime-.05&&ev.i==='drums')accent(drumKind(+ev.n),clamp((+ev.v||90)/127,0,1));
    }
    lastTime=t;
  }

  window.AgentLightingDust={
    get running(){return running;},
    get plan(){return plan?{song:plan.song,bpm:plan.bpm,look:{...plan.look},generatedFromMidi:true,cues:plan.cues.map(c=>({...c,reason:{...c.reason,midi:{...c.reason.midi}}}))}:buildPlan(songs[SONG_ID]);},
    rebuild(){if(running){plan=buildPlan(songs[SONG_ID]);cueIndex=cueAtBar(lastBar);applyCue(plan.cues[cueIndex],{force:true});}return this.plan;},
    refresh(){if(running&&currentCue)applyCue(currentCue,{force:true});},
  };
  raf=requestAnimationFrame(tick);
  console.info('[Agent Lighting · Dust] Queen-specific lighting planner attached · LED remains Auto');
})();
