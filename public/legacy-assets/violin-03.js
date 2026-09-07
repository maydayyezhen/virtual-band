    // Extrusion depth becomes the bridge's thickness along the instrument's length.
    const bg=new T.ExtrudeGeometry(bs,{depth:.040,curveSegments:20,bevelEnabled:true,bevelSize:.0025,bevelThickness:.0025,bevelSegments:2});bg.scale(1,.922,1);bg.rotateX(Math.PI/2);bg.translate(0,.020,0);smoothNormals(bg);add(bg,mat.bridge,bridge);
    // Tailpiece: raised curved ebony, string slots, four fine tuners and tailgut.
    const tailShape=new T.Shape();tailShape.moveTo(-.205,-.61);tailShape.quadraticCurveTo(0,-.56,.205,-.61);tailShape.lineTo(.139,-1.335);tailShape.quadraticCurveTo(0,-1.445,-.139,-1.335);tailShape.closePath();
    const tail=slab(tailShape,.055,0,mat.ebony,root,.009,3),tp=tail.geometry.attributes.position;
    for(let i=0;i<tp.count;i++){const y=tp.getY(i),x=tp.getX(i);tp.setZ(i,tp.getZ(i)+.302+(y+1.40)*.155-x*x*.32);}tail.geometry.computeVertexNormals();smoothNormals(tail.geometry);
    const tailTop=(x,y)=>.366+(y+1.40)*.155-x*x*.32;
    const stringColors=[0x765a3c,0x847467,0x915c3c,0x8b6444],tailAnchors=[];
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.105,tuner=new T.Group();tuner.position.set(x,-.665,tailTop(x,-.665));tuner.rotation.x=Math.atan(.155);root.add(tuner);
      roundBox(.035,.104,.003,.017,0,0,.0015,mat.black,tuner,.001);
      rod(V(0,-.024,.005),V(0,-.024,.053),.010,mat.silver,tuner,14);
      rod(V(-.022,-.024,.056),V(.022,-.024,.056),.012,mat.silver,tuner,14);
      rod(V(0,.009,.005),V(0,.093,.043),.012,mat.silver,tuner,14);root.updateMatrixWorld(true);tailAnchors.push(tuner.localToWorld(V(0,.093,.043)));
    }
    const inlay=new T.Shape();inlay.moveTo(0,-1.00);inlay.lineTo(.032,-1.065);inlay.lineTo(0,-1.129);inlay.lineTo(-.032,-1.065);inlay.closePath();const inset=slab(inlay,.001,0,mat.pearl),ip=inset.geometry.attributes.position;for(let i=0;i<ip.count;i++)ip.setZ(i,tailTop(ip.getX(i),ip.getY(i))+.0015+ip.getZ(i));inset.geometry.computeVertexNormals();
    rod(V(0,-1.825,-.015),V(0,-1.936,-.015),.040,mat.ebony,root,24,.054);
    for(const side of [-1,1])wire([V(side*.050,-1.355,.350),V(side*.079,-1.66,.227),V(side*.048,-1.848,.03),V(side*.012,-1.883,-.010)],.011,mat.black,root,30,6);
    // Rounded ebony chinrest with two silver clamps.
    const chin=ball(-.545,-1.278,.415,.418,.314,.073,mat.ebony);chin.rotation.z=-.18;chin.name='Ebony chinrest';
    for(const x of [-.56,-.76]){
      rod(V(x,-1.482,.404),V(x,-1.673,.210),.014,mat.silver,root,12);rod(V(x,-1.673,.210),V(x,-1.673,-.177),.014,mat.silver,root,12);
      ball(x,-1.618,-.207,.075,.072,.019,mat.rubber);rod(V(x,-1.673,-.012),V(x,-1.673,.075),.025,mat.silver,root,18);
    }
    const bridgeXs=[-.158,-.053,.053,.158],nutXs=[-.084,-.028,.028,.084],radii=[.0046,.0037,.0027,.0019];
    root.updateMatrixWorld(true);
    for(let i=0;i<4;i++){
      // The bridge's crown is a quadratic arc; all strings sit on it, not above it.
      const x=bridgeXs[i],bridgeTop=.289+.399*.922-.063*.922*(x/.166)**2;
      const saddle=V(x,bridgeY,bridgeTop+radii[i]+.002),nut=V(nutXs[i],nutY+.014,.469-nutXs[i]**2/.84+radii[i]);
      rod(tailAnchors[i],saddle,radii[i],mat.string,root,9);
      rod(nut,head.localToWorld(posts[i].clone()),radii[i],mat.string,root,9);
      const silk=new T.MeshStandardMaterial({color:stringColors[i],roughness:.75});rod(tailAnchors[i],tailAnchors[i].clone().lerp(saddle,.14),radii[i]*1.8,silk,root,8);
      const rows=100,sides=7,p=new Float32Array((rows+1)*(sides+1)*3),n=new Float32Array(p.length),uv=new Float32Array((rows+1)*(sides+1)*2),idx=[];
      for(let row=0;row<=rows;row++)for(let j=0;j<=sides;j++){const k=row*(sides+1)+j,a=j/sides*TAU;n.set([Math.cos(a),0,Math.sin(a)],k*3);uv.set([j/sides,row/rows],k*2);if(row<rows&&j<sides)idx.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
      const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(p,3).setUsage(T.DynamicDrawUsage));sg.setAttribute('normal',new T.BufferAttribute(n,3));sg.setAttribute('uv',new T.BufferAttribute(uv,2));sg.setIndex(idx);
      const mesh=add(sg,mat.string.clone(),root,['G','D','A','E'][i]+' string');mesh.userData.dynamic=true;mesh.userData.string=4-i;mesh.frustumCulled=false;
      const marker=ball(0,0,0,.027,.045,.010,mat.active);marker.visible=false;marker.userData.dynamic=true;marker.castShadow=false;
      strings.set(4-i,{number:4-i,name:['G','D','A','E'][i],openNote:VIOLIN_TUNING[i],nut,saddle,radius:radii[i],rows,sides,mesh,marker,note:null,held:false,interval:0,amount:0,energy:0,velocity:0,phase:0,age:0});
    }
    // Full-length bow. The hair is a flat ribbon below the cambered stick.
    const bow=new T.Group();bow.name='Pernambuco bow / horsehair / ebony frog';bow.userData.dynamic=true;root.add(bow);
    const stickPoints=[];for(let j=0;j<=28;j++){const t=j/28;stickPoints.push(V(-3.34+t*6.74,0,.154-.082*Math.sin(t*Math.PI)));}wire(stickPoints,.028,mat.bow,bow,90,10);
    rod(V(-3.55,0,.156),V(-3.34,0,.156),.034,mat.ebony,bow,16);rod(V(-3.54,0,.156),V(-3.49,0,.156),.035,mat.silver,bow,20);
    // Shaped frog, ferrule, pearl eye, grip and silver winding.
    roundBox(.35,.111,.106,.025,-2.965,0,.035,mat.ebony,bow,.006);
    roundBox(.051,.115,.069,.008,-2.789,0,.027,mat.silver,bow,.003);
    disk(-2.976,0,.147,.027,mat.pearl,bow);ring(-2.976,0,.148,.024,.033,mat.silver,bow);
    rod(V(-2.735,0,.129),V(-2.443,0,.116),.036,mat.ebony,bow,16);
    for(let j=0;j<31;j++){const x=-2.424+j*.0098;const coil=add(new T.TorusGeometry(.032,.0026,5,14),mat.silver,bow);coil.rotation.y=Math.PI/2;coil.position.set(x,0,.111-j*.00022);}
    const tipShape=new T.Shape();tipShape.moveTo(3.36,.09);tipShape.bezierCurveTo(3.43,.18,3.51,.195,3.58,.10);tipShape.lineTo(3.548,-.012);tipShape.lineTo(3.426,-.012);tipShape.lineTo(3.423,.044);tipShape.closePath();
    const tipGeo=new T.ExtrudeGeometry(tipShape,{depth:.046,curveSegments:18,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:2});tipGeo.rotateX(Math.PI/2);tipGeo.translate(0,.023,0);smoothNormals(tipGeo);add(tipGeo,mat.bow,bow);
    box(.131,.058,.009,3.486,0,-.010,mat.bone,bow);
    const hairGeo=new T.PlaneGeometry(6.23,.052,60,1);const hair=add(hairGeo,mat.hair,bow,'Flat bow-hair ribbon');hair.position.set(.308,0,.0);hair.castShadow=false;
    for(let j=0;j<12;j++)rod(V(-2.803,(j-5.5)*.0043,.0013),V(3.42,(j-5.5)*.0043,.0013),.00095,mat.hair,bow,5);
    bow.position.set(1.92,1.48,.92);bow.rotation.z=Math.PI/2+.045;
    // A low, restrained display cradle keeps the ribs and edgework visible.
    const stand=new T.Group();stand.name='Display cradle';root.add(stand);
    roundBox(1.78,.078,.74,.034,0,-2.15,-.37,mat.black,stand,.014);
    for(const side of [-1,1]){
      rod(V(side*.46,-2.146,-.21),V(side*.32,-1.91,-.18),.030,mat.black,stand,12);
      wire([V(side*.32,-1.91,-.18),V(side*.36,-1.82,.07),V(side*.39,-1.78,.23)],.034,mat.rubber,stand,24,8);
    }
    rod(V(0,-2.15,-.20),V(0,-.57,-.36),.028,mat.black,stand,14);ball(0,-.58,-.310,.13,.12,.035,mat.rubber,stand);
    function batch(group){
      root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
      function visit(o){if(o.userData.dynamic)return;if(o.isMesh){const key=o.material.uuid+':'+o.castShadow+':'+o.receiveShadow+':'+!!o.geometry.attributes.color;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);}for(const child of o.children)visit(child);}
      for(const o of group.children)visit(o);
      for(const meshes of batches.values()){
        if(meshes.length<2)continue;const p=[],n=[],uv=[],colors=[];
        for(const m of meshes){const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inv.clone().multiply(m.matrixWorld));for(const v of g.attributes.position.array)p.push(v);for(const v of g.attributes.normal.array)n.push(v);for(const v of g.attributes.uv.array)uv.push(v);if(g.attributes.color)for(const v of g.attributes.color.array)colors.push(v);g.dispose();}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(colors.length)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingSphere();
        const first=meshes[0],m=add(g,first.material,group,'Merged static craftsmanship');m.castShadow=first.castShadow;m.receiveShadow=first.receiveShadow;meshes.forEach(o=>o.removeFromParent());
      }
    }
    batch(bow);batch(root);archCache.clear();
    return {root,strings,bow,nutY,bridgeY,scale,boardEnd,boardHalf,boardZ,frontPlate,backPlate,fholes,rim};
  }
  function createViolinController(model,hooks={}){
    const voices=[...model.strings.values()],park=V(1.92,1.48,.92),parkQ=new T.Quaternion().setFromAxisAngle(V(0,0,1),Math.PI/2+.045);
    let clock=0,attacks=0,channel=5,mode='arco',vibrato=.28,bend=0,wantBend=0,bowSpeed=1,bowPressure=.72,bowPhase=0,engage=0,lastHeld=-10,dirty=true,bowAngle=0;
    let contact=V(0,.235,.64);const bowY=.235;
    const byte=v=>Number.isInteger(v)&&v>=0&&v<=127,validInterval=n=>Number.isInteger(n)&&n>=0&&n<=24;
    function wake(){dirty=true;hooks.wake?.();}
    function noteOn(note,velocity=100,stringNumber=null){
      if(!byte(note)||!byte(velocity)||note<55||note>100)return false;
      if(stringNumber!==null&&(!Number.isInteger(stringNumber)||!model.strings.has(stringNumber)))return false;
      if(velocity===0)return noteOff(note);
      const eligible=voices.filter(s=>validInterval(note-s.openNote)&&(stringNumber===null||s.number===stringNumber));if(!eligible.length)return false;
      let s=eligible.find(s=>s.note===note&&s.held);
      if(!s)s=eligible.sort((a,b)=>{
        const score=s=>(s.held?60:0)+(note-s.openNote)*.58+Math.abs(note-s.openNote-s.interval)*.08;
        return score(a)-score(b);
      })[0];
      s.note=note;s.interval=note-s.openNote;s.currentInterval=s.interval;s.held=true;s.velocity=velocity/127;s.energy=Math.min(1.1,s.energy*.16+s.velocity*.88);s.phase=0;s.age=clock;s.attackId=++attacks;lastHeld=clock;
      const result={note,velocity,string:s.number,stringName:s.name,semitones:s.interval};hooks.onHit?.(result);wake();return result;
    }
    function noteOff(note){
      if(!byte(note)||note<55||note>100)return false;for(const s of voices)if(s.note===note)s.held=false;wake();return true;
    }
