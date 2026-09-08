        return score(a)-score(b);
      })[0];
      s.note=note;s.fret=note-s.openNote;s.held=true;s.released=false;s.target=s.fret?1:0;s.phase=0;s.energy=Math.min(1.12,s.energy*.19+(velocity/127)**.72);s.age=clock;
      pickAge=0;pickString=s.number;hooks.onHit?.({note,velocity,string:s.number,fret:s.fret});wake();return {string:s.number,fret:s.fret,note};
    }
    function noteOff(note){
      if(!midiByte(note)||note<40||note>86)return false;
      for(const s of voices)if(s.note===note&&s.held){s.held=false;s.released=!sustain;if(!sustain)s.target=0;}
      wake();return true;
    }
    function pluck(stringNumber,velocity=100,fret=0){
      const s=model.strings.get(stringNumber);if(!s||!validFret(fret))return false;return noteOn(s.openNote+fret,velocity,stringNumber);
    }
    function strum(frets=[0,2,2,1,0,0],velocity=100,direction='down'){
      if(!Array.isArray(frets)||frets.length!==6||!frets.every(f=>f===null||validFret(f))||!midiByte(velocity)||!['down','up'].includes(direction))return false;
      if(!velocity)return allNotesOff();
      pending=[];for(const s of voices){s.held=false;s.released=true;s.target=0;}
      const order=direction==='down'?[0,1,2,3,4,5]:[5,4,3,2,1,0];
      let n=0;for(const i of order)if(frets[i]!==null)pending.push({time:clock+n++*.025,string:6-i,fret:frets[i],velocity:Math.max(1,velocity-Math.min(i*2,10))});wake();return true;
    }
    function allNotesOff(){pending=[];for(const s of voices){s.held=false;s.released=true;s.target=0;}wake();return true;}
    function panic(){
      pending=[];sustain=false;pickAge=10;wantBend=bend=0;
      for(const s of voices){s.note=null;s.held=false;s.released=true;s.energy=0;s.amount=s.target=0;s.phase=0;}
      hooks.onPanic?.();wake();return true;
    }
    function setPitchBend(value){if(!Number.isFinite(value)||value<-1||value>1)return false;wantBend=value;wake();return true;}
    function setControl(id,value){
      if(id==='pickup'){if(!Number.isInteger(value)||value<0||value>2)return false;model.controls.pickup.value=value;model.controls.pickup.group.rotation.x=(value-1)*.26;}
      else if(id==='volume'||id==='tone'){if(!Number.isFinite(value)||value<0||value>1)return false;model.controls[id].value=value;model.controls[id].group.rotation.z=(value-.5)*Math.PI*1.45;}
      else return false;wake();return true;
    }
    function controlChange(cc,value){
      if(!midiByte(cc)||!midiByte(value))return false;
      if(cc===64){sustain=value>=64;if(!sustain)for(const s of voices)if(!s.held){s.released=true;s.target=0;}wake();return true;}
      if(cc===7)return setControl('volume',value/127);
      if(cc===74)return setControl('tone',value/127);
      if(cc===120)return panic();if(cc===123)return allNotesOff();if(cc===121){sustain=false;setPitchBend(0);for(const s of voices)if(!s.held){s.released=true;s.target=0;}return true;}
      return false;
    }
    function handleMIDIMessage(eventOrData){
      const d=eventOrData?.data??eventOrData;if(!d||d.length!==3)return false;
      const status=d[0],a=d[1],b=d[2];if(!Number.isInteger(status)||status<0x80||status>0xEF||(status&15)!==channel-1||!midiByte(a)||!midiByte(b))return false;
      const type=status&0xF0;if(type===0x90)return noteOn(a,b);if(type===0x80)return noteOff(a);if(type===0xB0)return controlChange(a,b);
      if(type===0xE0){const raw=a+(b<<7);return setPitchBend((raw-8192)/(raw>=8192?8191:8192));}return false;
    }
    function drawString(s){
      const pos=s.mesh.geometry.attributes.position,fretY=s.fret?model.frets[s.fret]:model.nutY;
      const at=(fretY-model.bridgeY)/model.scale,pressX=T.MathUtils.lerp(s.saddle.x,s.nut.x,at),contactZ=model.boardZ(pressX,fretY)+.0157+s.radius;
      const amp=s.energy*.019*(reducedMotion?.45:1);
      for(let row=0;row<=s.rows;row++){
        const t=row/s.rows,y=T.MathUtils.lerp(s.saddle.y,s.nut.y,t),restZ=T.MathUtils.lerp(s.saddle.z,s.nut.z,t);
        const local=s.fret?Math.min(1,t/at):t,shape=Math.sin(local*Math.PI),vibrating=!s.fret||t<at;
        const bent=(t<at?t/at:(1-t)/Math.max(.001,1-at))*bend*.028*s.amount;
        const x=T.MathUtils.lerp(s.saddle.x,s.nut.x,t)+bent+(vibrating?shape*amp*(Math.sin(s.phase*(31+s.number*2.1))+.23*Math.sin(s.phase*67)*Math.sin(local*TAU)):0);
        let targetZ=restZ;if(s.fret)targetZ=t<=at?T.MathUtils.lerp(s.saddle.z,contactZ,t/at):T.MathUtils.lerp(contactZ,s.nut.z,(t-at)/(1-at));
        const z=T.MathUtils.lerp(restZ,targetZ,s.amount)+(vibrating?shape*amp*.16*Math.sin(s.phase*39):0);
        for(let j=0;j<=s.sides;j++){const a=j/s.sides*TAU;pos.setXYZ(row*(s.sides+1)+j,x+Math.cos(a)*s.radius,y,z+Math.sin(a)*s.radius);}
      }
      pos.needsUpdate=true;s.mesh.geometry.computeBoundingSphere();s.mesh.material.emissive.setHex(0xd0a566);s.mesh.material.emissiveIntensity=s.energy*.17;
      s.marker.visible=s.fret>0&&s.amount>.04&&(s.energy>.009||s.held);
      if(s.marker.visible){const y=fretY+(model.frets[s.fret-1]-fretY)*.25,t=(y-model.bridgeY)/model.scale,x=T.MathUtils.lerp(s.saddle.x,s.nut.x,t)+bend*.028*s.amount;s.marker.position.set(x,y,model.boardZ(x,y)+.052);s.marker.scale.set(.033*s.amount,.044*s.amount,.013*s.amount);}
    }
    function tick(dt){
      if(!Number.isFinite(dt)||dt<=0)return {moved:false,animating:false};dt=Math.min(dt,.05);clock+=dt;
      while(pending.length&&pending[0].time<=clock){const e=pending.shift();pluck(e.string,e.velocity,e.fret);}
      let moved=dirty,animating=pending.length>0;const oldBend=bend;bend+=(wantBend-bend)*(1-Math.exp(-dt*19));if(Math.abs(bend-wantBend)<.0002)bend=wantBend;
      if(oldBend!==bend){moved=true;animating=animating||bend!==wantBend;}
      for(const s of voices){
        const changed=dirty||s.energy>0||s.amount!==s.target||oldBend!==bend;
        s.phase+=dt;s.energy*=Math.exp(-dt*(s.released?15:2.7));if(s.energy<.0012)s.energy=0;
        s.amount+=(s.target-s.amount)*(1-Math.exp(-dt*28));if(Math.abs(s.amount-s.target)<.0002)s.amount=s.target;
        if(changed){drawString(s);moved=true;}animating=animating||s.energy>0||s.amount!==s.target;
      }
      model.controls.tremolo.rotation.x=-bend*.10;
      if(pickAge<.25){pickAge+=dt;const s=model.strings.get(pickString);model.pick.visible=pickAge<.22;
        model.pick.position.set(T.MathUtils.lerp(s.saddle.x,s.nut.x,.16)+Math.sin(pickAge/.22*Math.PI)*.075-.025,-1.13,.529+Math.sin(pickAge/.22*Math.PI)*.020);model.pick.rotation.z=-.18+Math.sin(pickAge/.22*Math.PI)*.36;moved=true;animating=true;
      }else if(model.pick.visible){model.pick.visible=false;moved=true;}
      dirty=false;return {moved,animating};
    }
    const api={noteOn,noteOff,pluck,strum,allNotesOff,panic,setPitchBend,setControl,controlChange,handleMIDIMessage,
      setMIDIChannel(value){if(!Number.isInteger(value)||value<1||value>16)return false;allNotesOff();channel=value;return true;},
      get midiChannel(){return channel;},get activeNotes(){return [...new Set(voices.filter(s=>s.held).map(s=>s.note))];},
      getFingering(){return voices.filter(s=>s.held).map(s=>({string:s.number,fret:s.fret,note:s.note}));},
      strings:model.strings,root:model.root,controls:model.controls,minNote:40,maxNote:86
    };
    for(const id of ['volume','tone','pickup'])setControl(id,model.controls[id].value);tick(.016);
    return {api,tick};
  }
