    const tex=canvasTexture(2048,320,(c,cw,ch)=>{
      c.fillStyle='#131b21';c.fillRect(0,0,cw,ch);
      const xx=x=>(x/w+.5)*cw,zz=v=>(v+1.68)/d*ch;
      c.textAlign='center';c.fillStyle='#aab5b7';c.font='500 22px Arial, sans-serif';
      const sections=upper?[[-3.30,'OSCILLATORS'],[-1.70,'FILTER'],[-.22,'PROGRAM'],[1.66,'ENVELOPE'],[3.68,'MOD / FX']]:[[-5.55,'MASTER'],[-4.38,'PIANO'],[-2.89,'E. PIANO'],[-.35,'PROGRAM'],[2.68,'DRAWBARS'],[4.98,'EFFECTS']];
      sections.forEach(([x,label])=>{c.fillText(label,xx(x),zz(-1.49));c.strokeStyle='#6b79823b';c.beginPath();c.moveTo(xx(x)-70,zz(-1.38));c.lineTo(xx(x)+70,zz(-1.38));c.stroke();});
      c.font='17px Arial, sans-serif';c.fillStyle='#617883';
      if(upper){['A','D','S','R'].forEach((t,i)=>c.fillText(t,xx(1.06+i*.41),zz(-.44)));}
      else{["16′","5⅓′","8′","4′","2⅔′","2′","1⅗′","1⅓′","1′"].forEach((t,i)=>c.fillText(t,xx(1.84+i*.21),zz(-.45)));}
    });
    topPlane(tex,w-.018,d-.018,0,.434,-1.00,layer.group);
    if(upper){
      [-3.97,-3.41,-2.85].forEach(x=>[-1.095,-.617].forEach(z=>knob(x,z,layer.group,.100)));
      knob(-1.94,-1.005,layer.group,.132,mat.amber);knob(-1.43,-1.005,layer.group,.089);pad(-1.85,-.56,layer.group,mat.amber);pad(-1.47,-.56,layer.group);
      screen(layer,-.25,-1.02,1.43,.57);
      [-.76,-.44,-.12,.20].forEach((x,i)=>pad(x,-.520,layer.group,i===0?mat.amber:mat.graphite,.21,.104));
      [1.06,1.47,1.88,2.29].forEach((x,i)=>fader(x,-.94,layer.group,[.72,.25,.68,.44][i],.63));
      [3.00,3.56,4.12].forEach(x=>[-1.09,-.62].forEach(z=>knob(x,z,layer.group,.094)));
    }else{
      knob(-5.57,-.94,layer.group,.145);pad(-5.57,-.47,layer.group,mat.redLED,.21,.10);
      [-4.90,-4.44,-3.98].forEach(x=>knob(x,-1.00,layer.group,.090));[-4.90,-4.44,-3.98].forEach((x,i)=>pad(x,-.50,layer.group,i===0?mat.redLED:mat.graphite));
      [-3.18,-2.70].forEach(x=>knob(x,-1.00,layer.group,.09));pad(-3.18,-.50,layer.group);pad(-2.70,-.50,layer.group,mat.cyan);
      screen(layer,-.40,-1.02,1.66,.57);knob(.90,-.98,layer.group,.102);
      [-1.01,-.62,-.23,.16].forEach((x,i)=>pad(x,-.510,layer.group,i===0?mat.cyan:mat.graphite,.235,.11));
      for(let i=0;i<9;i++)fader(1.84+i*.21,-.96,layer.group,[.90,.83,.67,.71,.34,.39,.24,.28,.38][i],.57,i<2||i>6?mat.bone||mat.white:mat.satin);
      [4.41,4.93,5.45].forEach(x=>knob(x,-1.00,layer.group,.094));[4.41,4.93,5.45].forEach((x,i)=>pad(x,-.50,layer.group,i===1?mat.redLED:mat.graphite));
    }
    [-w/2+.105,w/2-.105].forEach(x=>[-1.57,-.43].forEach(z=>screw(x,.437,z,layer.group)));
  }
  function rearPanel(layer){
    const g=layer.group,z=-1.756,xx=layer.id==='upper'?-3.85:-5.3;
    block(layer.width-.42,.292,.028,0,-.045,-1.73,mat.panel,g,.015);
    [0,.34,.68,1.12].forEach((dx,i)=>{
      const x=xx+dx;ringZ(x,-.03,z-.005,.030,.058,g);ringZ(x,-.03,z-.006,0,.030,g,mat.edge);
      const label=['L / MONO','R','PHONES','DAMPER'][i],p=add(new T.PlaneGeometry(.25,.043),new T.MeshStandardMaterial({map:textTexture(label,'#b8c2c0',45),transparent:true,depthWrite:false,roughness:.7}),g);p.rotation.y=Math.PI;p.position.set(x,.072,z-.008);p.castShadow=false;
    });
    for(let i=0;i<2;i++){
      const x=xx+1.82+i*.43;ringZ(x,-.031,z-.006,.073,.092,g,mat.satin);ringZ(x,-.031,z-.007,0,.073,g,mat.edge);
      for(let k=0;k<5;k++){const a=(25+k*32.5)*Math.PI/180;ringZ(x+Math.cos(a)*.045,-.031+Math.sin(a)*.045,z-.009,0,.006,g,mat.satin);}
    }
    block(.16,.14,.023,xx+2.77,-.018,z-.010,mat.satin,g,.012);block(.120,.106,.004,xx+2.77,-.018,z-.025,mat.edge,g,.003);
    block(.285,.171,.030,layer.width/2-.85,-.03,z-.014,mat.edge,g,.014);box(.145,.055,.004,layer.width/2-.85,-.03,z-.031,mat.satin,g);
    const vents=new T.InstancedMesh(new T.BoxGeometry(.023,.145,.004),mat.edge,24),dummy=new T.Object3D();g.add(vents);
    for(let i=0;i<24;i++){dummy.position.set(.58+i*.100,-.035,z-.003);dummy.updateMatrix();vents.setMatrixAt(i,dummy.matrix);}
    const frontText=add(new T.PlaneGeometry(2.0,.16),new T.MeshStandardMaterial({map:textTexture('ATELIER  /  '+(layer.id==='lower'?'STAGE 88':'VECTOR 61'),'#d9ded7',57),transparent:true,depthWrite:false,roughness:.6}),g);frontText.position.set(-layer.width/2+1.58,-.046,1.756);frontText.castShadow=false;
  }
  function instrument(id,min,max,width,keyCenter){
    const group=new T.Group();root.add(group);group.name=id==='lower'?'88-key Stage Piano':'61-key Synthesizer';
    const layer={id,minNote:min,maxNote:max,width,keyCenter,keys:new Map(),group};layers[id]=layer;
    block(width,.53,3.5,0,-.085,0,id==='lower'?mat.red:mat.graphite,group,.070);
    box(width-.13,.030,.046,0,.163,1.724,mat.edge,group);
    [-1,1].forEach(s=>{
      block(id==='upper'?.275:.23,.677,3.40,s*(width/2-.145),.005,0,id==='upper'?mat.wood:mat.red,group,.045);
      [-1.40,1.40].forEach(z=>screw(s*(width/2-.15),.345,z,group));
    });
    const keyCount=id==='lower'?52:36,keyWidth=keyCount*.23;
    const leftEdge=keyCenter-keyWidth/2;
    block(Math.max(.28,leftEdge+width/2-.27),.270,1.73,(-width/2+.25+leftEdge)/2,.205,.742,mat.panel,group,.026);
    const rightEdge=keyCenter+keyWidth/2,rightSpan=width/2-.25-rightEdge;
    block(Math.max(.05,rightSpan),.270,1.73,rightEdge+rightSpan/2,.205,.742,mat.panel,group,.024);
    makeKeys(layer);makePanel(layer);wheels(layer);rearPanel(layer);drawScreen(layer);return layer;
  }
  const lower=instrument('lower',21,108,13.44,.24);lower.group.position.set(0,7.75,.05);
  const upper=instrument('upper',36,96,10.40,.46);upper.group.position.set(0,10.28,-.78);upper.group.rotation.x=.19;

  // Two Z-frame legs, locking collars and telescopic upper-tier supports.
  for(const side of [-1,1]){
    const x=side*4.18;
    beam(V(x,.19,-1.45),V(x,.19,1.54),.36,.27);
    [-1.5,1.59].forEach(z=>block(.408,.288,.169,x,.181,z,mat.rubber,root,.039));
    beam(V(x,.365,.96),V(x,7.15,-.64),.287,.322);
    beam(V(x,7.235,-1.31),V(x,7.235,1.48),.294,.253);
    [-1.14,1.23].forEach(z=>block(.33,.095,.41,x,7.397,z,mat.rubber,root,.017));
    for(const [y,z] of [[.51,.922],[7.085,-.625]]){
      rod(V(x-side*.171,y,z),V(x+side*.189,y,z),.061,mat.satin,root,12);
      rod(V(x+side*.191,y,z),V(x+side*.208,y,z),.039,mat.edge,root,6);
    }
    const collar=block(.393,.325,.414,x,5.68,-.287,mat.graphite,root,.039);collar.rotation.x=-.231;
    rod(V(x,5.68,-.287),V(x+side*.333,5.68,-.287),.033,mat.satin,root,14);
    const clampHandle=rod(V(x+side*.301,5.68,-.287),V(x+side*.420,5.68,-.287),.115,mat.rubber,root,10);