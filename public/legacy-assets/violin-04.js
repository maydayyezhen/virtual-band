    function playString(stringNumber,velocity=100,semitones=0){const s=model.strings.get(stringNumber);if(!s||!validInterval(semitones))return false;return noteOn(s.openNote+semitones,velocity,stringNumber);}
    function allNotesOff(){for(const s of voices)s.held=false;wake();return true;}
    function panic(){for(const s of voices){s.held=false;s.note=null;s.energy=0;s.amount=0;s.interval=s.currentInterval=0;}engage=0;lastHeld=-10;bowPhase=0;wantBend=bend=0;hooks.onPanic?.();wake();return true;}
    function setArticulation(value){if(!['arco','pizzicato'].includes(value))return false;mode=value;if(mode==='pizzicato')for(const s of voices)if(s.held)s.energy=s.velocity;hooks.onMode?.(mode);wake();return true;}
    function setPitchBend(value){if(!Number.isFinite(value)||value<-1||value>1)return false;wantBend=value;wake();return true;}
    function setVibrato(value){if(!Number.isFinite(value)||value<0||value>1)return false;vibrato=value;wake();return true;}
    function setBow(options){
      if(!options||typeof options!=='object')return false;
      if(options.speed!==undefined&&(!Number.isFinite(options.speed)||options.speed<0||options.speed>2))return false;
      if(options.pressure!==undefined&&(!Number.isFinite(options.pressure)||options.pressure<0||options.pressure>1))return false;
      if(options.speed!==undefined)bowSpeed=options.speed;if(options.pressure!==undefined)bowPressure=options.pressure;wake();return true;
    }
    function controlChange(cc,value){
      if(!byte(cc)||!byte(value))return false;if(cc===1)return setVibrato(value/127);if(cc===11)return setBow({pressure:value/127});
      if(cc===120)return panic();if(cc===123)return allNotesOff();if(cc===121){setPitchBend(0);setVibrato(.28);setBow({pressure:.72,speed:1});return true;}return false;
    }
    function handleMIDIMessage(eventOrData){
      const d=eventOrData?.data??eventOrData;if(!d||d.length!==3)return false;
      const status=d[0],a=d[1],b=d[2];if(!Number.isInteger(status)||status<0x80||status>0xEF||(status&15)!==channel-1||!byte(a)||!byte(b))return false;
      const type=status&0xF0;if(type===0x90)return noteOn(a,b);if(type===0x80)return noteOff(a);if(type===0xB0)return controlChange(a,b);
      if(type===0xE0){const raw=a+(b<<7);return setPitchBend((raw-8192)/(raw>=8192?8191:8192));}return false;
    }
    function stringPoint(s,y,vibration=false){
      const span=s.nut.y-s.saddle.y,t=clamp((y-s.saddle.y)/span,0,1),stopY=model.bridgeY+model.scale*2**(-s.currentInterval/12),at=clamp((stopY-s.saddle.y)/span,.04,.9999);
      const x=T.MathUtils.lerp(s.saddle.x,s.nut.x,t),restZ=T.MathUtils.lerp(s.saddle.z,s.nut.z,t),stopX=T.MathUtils.lerp(s.saddle.x,s.nut.x,at);
      const contactZ=model.boardZ(stopX,stopY)+s.radius+.0015;
      const pressed=t<=at?T.MathUtils.lerp(s.saddle.z,contactZ,t/at):T.MathUtils.lerp(contactZ,s.nut.z,(t-at)/(1-at));
      let z=T.MathUtils.lerp(restZ,pressed,s.amount),dx=0;
      if(vibration&&(!s.interval||t<at)){
        const u=s.interval?t/at:t,contactDamping=mode==='arco'?1-.92*Math.exp(-(((y-bowY)/.038)**2)):1;
        const amp=s.energy*.014*(reducedMotion?.45:1)*Math.sin(u*Math.PI)*contactDamping;
        dx=amp*(Math.sin(s.phase*(33+s.number*2.3))+.20*Math.sin(s.phase*67)*Math.sin(u*TAU));z+=amp*.09*Math.sin(s.phase*47);
      }
      return V(x+dx,y,z);
    }
    function drawString(s){
      const p=s.mesh.geometry.attributes.position;
      for(let row=0;row<=s.rows;row++){const y=T.MathUtils.lerp(s.saddle.y,s.nut.y,row/s.rows),v=stringPoint(s,y,true);
        for(let j=0;j<=s.sides;j++){const a=j/s.sides*TAU;p.setXYZ(row*(s.sides+1)+j,v.x+Math.cos(a)*s.radius,y,v.z+Math.sin(a)*s.radius);}}
      p.needsUpdate=true;s.mesh.geometry.computeBoundingSphere();s.mesh.material.emissive.setHex(0xbfc9b5);s.mesh.material.emissiveIntensity=s.energy*.12;
      s.marker.visible=s.interval>0&&s.amount>.035;if(s.marker.visible){const y=model.bridgeY+model.scale*2**(-s.currentInterval/12),v=stringPoint(s,y);s.marker.position.set(v.x,y,v.z+.023);s.marker.scale.set(.027*s.amount,.045*s.amount,.010*s.amount);}
    }
    function tick(dt){
      if(!Number.isFinite(dt)||dt<=0)return {moved:false,animating:false};dt=Math.min(dt,.05);clock+=dt;
      const held=voices.filter(s=>s.held).sort((a,b)=>b.attackId-a.attackId),bowed=[];
      if(held.length){lastHeld=clock;bowed.push(held[0]);const adjacent=held.find(s=>s!==held[0]&&Math.abs(s.number-held[0].number)===1);if(adjacent)bowed.push(adjacent);}
      const oldBend=bend;bend+=(wantBend-bend)*(1-Math.exp(-dt*24));if(Math.abs(wantBend-bend)<.0002)bend=wantBend;
      let moved=dirty,animating=false;
      for(const s of voices){
        const target=s.held&&s.interval>0?1:0,oldAmount=s.amount,oldEnergy=s.energy;
        s.amount+=(target-s.amount)*(1-Math.exp(-dt*27));if(Math.abs(target-s.amount)<.0002)s.amount=target;
        const oscillation=s.held&&clock-s.age>.24?vibrato*.18*Math.sin(clock*TAU*5.4):0;
        s.currentInterval=s.interval>0?clamp(s.interval+bend*2+oscillation,0,24):0;
        const sounding=mode==='arco'&&bowed.includes(s)&&bowSpeed>0;
        if(sounding)s.energy+=(s.velocity*bowPressure-s.energy)*(1-Math.exp(-dt*16));else s.energy*=Math.exp(-dt*(mode==='pizzicato'?4.2:8.5));
        if(s.energy<.0012)s.energy=0;s.phase+=dt;
        if(dirty||s.energy>0||oldEnergy!==s.energy||s.amount!==oldAmount||oldBend!==bend||s.held&&s.interval>0&&vibrato>0){drawString(s);moved=true;}
        animating=animating||s.energy>0||s.amount!==target||s.held&&s.interval>0&&vibrato>0||bend!==wantBend;
      }
      const wantEngage=mode==='arco'&&(held.length||clock-lastHeld<.55)?1:0,oldEngage=engage;
      engage+=(wantEngage-engage)*(1-Math.exp(-dt*16));if(Math.abs(wantEngage-engage)<.0015)engage=wantEngage;
      if(bowed.length){
        const points=bowed.map(s=>{const p=stringPoint(s,bowY);p.z+=s.radius+.0025;return p;});let slope;
        if(points.length===2){slope=(points[1].z-points[0].z)/(points[1].x-points[0].x);points[0].add(points[1]).multiplyScalar(.5);}
        else{
          const p=points[0];let lower=-1.6,upper=1.6;
          for(const s of voices)if(s!==bowed[0]){const q=stringPoint(s,bowY);q.z+=s.radius+.0025;const k=(q.z-p.z)/(q.x-p.x);if(q.x>p.x)lower=Math.max(lower,k+.012);else upper=Math.min(upper,k-.012);}
          slope=clamp(-p.x*3.7,Math.min(lower,upper),Math.max(lower,upper));
        }
        contact.lerp(points[0],1-Math.exp(-dt*30));const angle=-Math.atan(slope);bowAngle+=(angle-bowAngle)*(1-Math.exp(-dt*30));
      }
      if(held.length&&mode==='arco')bowPhase+=dt*2.7*bowSpeed;
      if(dirty||oldEngage!==engage||engage>0){
        const q=new T.Quaternion().setFromAxisAngle(V(0,1,0),bowAngle),axis=V(1,0,0).applyQuaternion(q),travel=Math.sin(bowPhase)*.93;
        const playing=contact.clone().addScaledVector(axis,travel);if(!held.length)playing.z+=.07;
        model.bow.position.copy(park).lerp(playing,engage);model.bow.position.z+=.74*Math.sin(Math.PI*engage);
        model.bow.quaternion.copy(parkQ).slerp(q,engage);moved=true;
      }
      animating=animating||engage!==wantEngage||engage>0&&held.length>0&&mode==='arco'||mode==='arco'&&clock-lastHeld<.55;dirty=false;
      return {moved,animating};
    }
    const api={noteOn,noteOff,playString,allNotesOff,panic,setArticulation,setPitchBend,setVibrato,setBow,controlChange,handleMIDIMessage,
      setMIDIChannel(value){if(!Number.isInteger(value)||value<1||value>16)return false;allNotesOff();channel=value;return true;},
      get midiChannel(){return channel;},get articulation(){return mode;},get activeNotes(){return [...new Set(voices.filter(s=>s.held).map(s=>s.note))];},
      getFingering(){return voices.filter(s=>s.held).map(s=>({string:s.number,note:s.note,semitones:s.currentInterval,positionY:model.bridgeY+model.scale*2**(-s.currentInterval/12)}));},
      strings:model.strings,bow:model.bow,root:model.root,minNote:55,maxNote:100
    };
    tick(.016);return {api,tick,stringPoint};
  }
