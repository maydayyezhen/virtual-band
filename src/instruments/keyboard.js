'use strict';
function createStageModel(){
  const root=new T.Group();root.name='Atelier — dual-tier stage rig';
  const pickables=[],layers={},pedals={},geometryCache=new Map();
  const walnut=woodTexture('walnut',512);
  const phys=p=>new T.MeshPhysicalMaterial(p);
  const mat={
    red:phys({color:0x941e2a,metalness:.48,roughness:.34,clearcoat:.34,clearcoatRoughness:.25}),
    graphite:phys({color:0x262d32,metalness:.55,roughness:.37,clearcoat:.16}),
    panel:new T.MeshStandardMaterial({color:0x10171c,metalness:.45,roughness:.49}),
    steel:phys({color:0x222b32,metalness:.72,roughness:.38}),
    edge:new T.MeshStandardMaterial({color:0x05090c,roughness:.65}),
    rubber:new T.MeshStandardMaterial({color:0x090d10,roughness:.92}),
    white:phys({color:0xe9e8df,roughness:.28,clearcoat:.30,clearcoatRoughness:.20}),
    black:phys({color:0x090e12,roughness:.25,clearcoat:.43,clearcoatRoughness:.17}),
    chrome:phys({color:0xd0d7d8,metalness:1,roughness:.22}),
    satin:phys({color:0x929c9e,metalness:.90,roughness:.32}),
    wood:phys({map:walnut,bumpMap:walnut,bumpScale:.006,roughness:.39,clearcoat:.3}),
    felt:new T.MeshStandardMaterial({color:0x8c4144,roughness:1}),
    ink:new T.MeshBasicMaterial({color:0xc9d5d4}),
    cyan:new T.MeshStandardMaterial({color:0x92d8d7,emissive:0x42c8d0,emissiveIntensity:1.0,roughness:.34}),
    amber:new T.MeshStandardMaterial({color:0xf9c684,emissive:0xf9a551,emissiveIntensity:.85,roughness:.34}),
    redLED:new T.MeshStandardMaterial({color:0xea7d72,emissive:0xdf302d,emissiveIntensity:.8,roughness:.36}),
  };
  function add(g,m,parent=root,name=''){
    const mesh=new T.Mesh(g,m);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function rect(w,h,r){
    const s=new T.Shape(),x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;
  }
  function smooth(g){
    const p=g.attributes.position,n=g.attributes.normal,sums=new Map(),keys=[];
    for(let i=0;i<p.count;i++){
      const k=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');keys.push(k);
      if(!sums.has(k))sums.set(k,V(0,0,0));sums.get(k).add(V(n.getX(i),n.getY(i),n.getZ(i)));
    }
    for(const v of sums.values())v.normalize();for(let i=0;i<n.count;i++){const v=sums.get(keys[i]);n.setXYZ(i,v.x,v.y,v.z);}return g;
  }
  function roundedGeo(w,h,d,r){
    const id=[w,h,d,r].join(':');if(geometryCache.has(id))return geometryCache.get(id);
    r=Math.min(r,w*.22,h*.22,d*.22);
    const g=new T.ExtrudeGeometry(rect(w-2*r,h-2*r,r),{depth:d-2*r,bevelEnabled:r>0,bevelSize:r,bevelThickness:r,bevelSegments:3,curveSegments:5,steps:1});
    g.translate(0,0,-d/2+r);smooth(g);
    const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);
    geometryCache.set(id,g);return g;
  }
  function block(w,h,d,x,y,z,m,parent=root,r=.02){const obj=add(roundedGeo(w,h,d,r),m,parent);obj.position.set(x,y,z);return obj;}
  function box(w,h,d,x,y,z,m,parent=root){
    const id='box:'+w+':'+h+':'+d;if(!geometryCache.has(id))geometryCache.set(id,new T.BoxGeometry(w,h,d));
    const obj=add(geometryCache.get(id),m,parent);obj.position.set(x,y,z);return obj;
  }
  function rod(a,b,r,m,parent=root,sides=16,rTop=r){
    const delta=b.clone().sub(a),g=new T.CylinderGeometry(rTop,r,delta.length(),sides),o=add(g,m,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return o;
  }
  function beam(a,b,w,d,m=mat.steel,parent=root){
    const delta=b.clone().sub(a),o=block(w,delta.length(),d,0,0,0,m,parent,.025);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return o;
  }
  function tube(points,r,m=mat.rubber,parent=root,steps=100){
    const curve=new T.CatmullRomCurve3(points),sample=curve.getPoint.bind(curve);
    curve.getPoint=(t,target)=>{const p=sample(t,target);p.y=Math.max(r+.011,p.y);return p;};
    return add(new T.TubeGeometry(curve,steps,r,8,false),m,parent);
  }
  function topPlane(texture,w,d,x,y,z,parent=root,emissive=false){
    const material=emissive?new T.MeshBasicMaterial({map:texture,toneMapped:false}):new T.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.58,metalness:.12});
    const p=add(new T.PlaneGeometry(w,d),material,parent);p.rotation.x=-Math.PI/2;p.position.set(x,y,z);p.castShadow=false;return p;
  }
  function textTexture(text,color='#c7cfcb',size=72){
    return canvasTexture(1024,128,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle=color;c.font=`500 ${size}px Arial, sans-serif`;c.textBaseline='middle';c.textAlign='center';c.fillText(text,w/2,h/2);});
  }
  function screw(x,y,z,parent,axis='y',r=.023){
    const a=V(x,y,z),b=a.clone();b[axis]+=.014;rod(a,b,r,mat.satin,parent,12);
    if(axis==='y'){const slot=box(r*1.13,.0015,r*.15,x,y+.015,z,mat.edge,parent);slot.rotation.y=.45;}
    else{const slot=box(r*1.1,r*.15,.0015,x,y,z+.015,mat.edge,parent);slot.rotation.z=.45;}
  }
  function ringZ(x,y,z,inner,outer,parent,m=mat.chrome,back=true){const o=add(new T.RingGeometry(inner,outer,32),m,parent);o.position.set(x,y,z);if(back)o.rotation.y=Math.PI;return o;}
  function knob(x,z,parent,r=.096,accent=mat.ink,y=.454){
    rod(V(x,y,z),V(x,y+.027,z),r*1.14,mat.edge,parent,24);
    rod(V(x,y+.020,z),V(x,y+.163,z),r,mat.black,parent,28,r*.9);
    rod(V(x,y+.163,z),V(x,y+.174,z),r*.89,mat.graphite,parent,24);
    box(.012,.002,r*.58,x,y+.177,z-r*.38,accent,parent);
  }
  function fader(x,z,parent,value=.6,length=.58,cap=mat.satin){
    block(.050,.007,length,x,.450,z,mat.edge,parent,.004);
    box(.007,.008,length-.045,x,.455,z,mat.satin,parent);
    block(.151,.065,.121,x,.497,z+(value-.5)*(length-.12),cap,parent,.014);
    box(.10,.0015,.012,x,.5305,z+(value-.5)*(length-.12),mat.ink,parent);
  }
  function pad(x,z,parent,m=mat.graphite,w=.18,d=.105){return block(w,.047,d,x,.473,z,m,parent,.012);}
  function screen(layer,x,z,w=1.66,d=.57){
    block(w+.19,.052,d+.17,x,.465,z,mat.edge,layer.group,.038);
    const c=document.createElement('canvas');c.width=640;c.height=240;const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    layer.screen={canvas:c,texture:tex,ctx:c.getContext('2d'),last:''};
    topPlane(tex,w,d,x,.496,z,layer.group,true);
  }
  function drawScreen(layer,notes=[]){
    const id=notes.join(',');if(layer.screen.last===id&&layer.screen.initialized)return;
    const {ctx:c,canvas,texture}=layer.screen,w=canvas.width,h=canvas.height,upper=layer.id==='upper';
    c.fillStyle=upper?'#11262c':'#10272e';c.fillRect(0,0,w,h);c.strokeStyle=upper?'#e3b270':'#6fbfca';c.fillStyle=c.strokeStyle;
    c.font='17px monospace';c.fillText(upper?'ATELIER   /   SYNTH ENGINE':'ATELIER   /   PIANO ENGINE',24,32);
    c.font='bold 36px monospace';c.fillText(upper?'01  WARM ANALOG':'01  CONCERT GRAND',24,86);
    c.strokeStyle='#3b6771';c.beginPath();c.moveTo(23,106);c.lineTo(w-24,106);c.stroke();
    c.fillStyle=upper?'#e7c28d':'#a4dce0';c.font='22px monospace';c.fillText(notes.length?notes.slice(-7).map(noteName).join('  '):upper?'OSC 1 + 2       LPF 24':'STEREO GRAND     DAMPER',24,145);
    c.strokeStyle=upper?'#d7ae73':'#63b7c3';c.lineWidth=2;c.beginPath();
    for(let i=0;i<300;i++){const y=upper?189+((i%48)/48-.5)*29:189+Math.sin(i*.072)*Math.exp(-i/165)*18;i?c.lineTo(24+i,y):c.moveTo(24+i,y);}c.stroke();
    c.font='16px monospace';c.fillStyle='#78a8ae';c.fillText('CH '+(upper?'02':'01'),476,191);c.fillText(notes.length?'ACTIVE '+notes.length:'READY',470,218);
    layer.screen.last=id;layer.screen.initialized=true;texture.needsUpdate=true;
  }
  function keyGeometry(left,right,len,black=false){
    const pitch=.23,hw=pitch/2-.0045,bw=.137,blackLen=1.045;
    const cacheKey=['key',left.toFixed(4),right.toFixed(4),len,black].join(':');if(geometryCache.has(cacheKey))return geometryCache.get(cacheKey);
    const s=new T.Shape();
    if(black){s.moveTo(-bw/2,0);s.lineTo(bw/2,0);s.lineTo(bw/2,-blackLen);s.lineTo(-bw/2,-blackLen);}
    else{s.moveTo(left,0);s.lineTo(right,0);s.lineTo(right,-1.08);s.lineTo(hw,-1.08);s.lineTo(hw,-len);s.lineTo(-hw,-len);s.lineTo(-hw,-1.08);s.lineTo(left,-1.08);}
    s.closePath();const thickness=black?.150:.119;
    const g=new T.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSize:black?.008:.003,bevelThickness:black?.008:.003,bevelSegments:2,curveSegments:4,steps:1});
    g.rotateX(-Math.PI/2);g.translate(0,-thickness,0);smooth(g);geometryCache.set(cacheKey,g);return g;
  }
  function makeKeys(layer){
    const pitch=.23,positions=new Map();let wi=0;
    for(let n=layer.minNote;n<=layer.maxNote;n++)if(!isBlack(n))positions.set(n,wi++);
    const whiteCount=wi,start=layer.keyCenter-(whiteCount-1)*pitch/2;
    for(let n=layer.minNote;n<=layer.maxNote;n++){
      if(isBlack(n)){const offset={1:-.020,3:.020,6:-.024,8:0,10:.024}[n%12];positions.set(n,start+(positions.get(n-1)+.5)*pitch+offset);}
    }
    for(let n=layer.minNote;n<=layer.maxNote;n++)if(!isBlack(n))positions.set(n,start+positions.get(n)*pitch);
    for(let n=layer.minNote;n<=layer.maxNote;n++){
      const black=isBlack(n),x=positions.get(n),hw=pitch/2-.0045;
      let left=-hw,right=hw;
      if(!black){
        if(n>layer.minNote&&isBlack(n-1))left=Math.max(left,positions.get(n-1)-x+.137/2+.009);
        if(n<layer.maxNote&&isBlack(n+1))right=Math.min(right,positions.get(n+1)-x-.137/2-.009);
      }
      const pivot=new T.Group();pivot.userData.dynamic=true;pivot.position.set(x,.300+(black?.151:0),-.064);layer.group.add(pivot);
      const key=add(keyGeometry(left,right,1.68,black),black?mat.black:mat.white,pivot,noteName(n));
      const record={note:n,tier:layer.id,black,pivot,mesh:key,sources:new Map(),amount:0,target:0,velocity:0,angle:black?.075:.060};
      key.userData.key=record;layer.keys.set(n,record);pickables.push(key);
    }
    layer.whiteCount=whiteCount;
    block(whiteCount*pitch+.07,.042,1.74,layer.keyCenter,.162,.77,mat.edge,layer.group,.004);
    box(whiteCount*pitch+.03,.043,.035,layer.keyCenter,.332,-.076,mat.felt,layer.group);
  }
  function wheels(layer){
    const parent=layer.group;
    for(let j=0;j<2;j++){
      const x=layer.id==='upper'?-4.79+j*.45:-6.30+j*.36,z=.55;
      block(.265,.015,.66,x,.206,z,mat.edge,parent,.025);
      const pivot=new T.Group();pivot.userData.dynamic=true;pivot.position.set(x,.216,z);parent.add(pivot);
      const wheel=add(new T.CylinderGeometry(.210,.210,.124,40),mat.black,pivot);wheel.rotation.z=Math.PI/2;
      const ridges=new T.InstancedMesh(new T.BoxGeometry(.119,.012,.029),mat.graphite,32),dummy=new T.Object3D();pivot.add(ridges);ridges.castShadow=true;
      for(let i=0;i<32;i++){const a=i/32*TAU;dummy.position.set(0,Math.cos(a)*.209,Math.sin(a)*.209);dummy.rotation.x=a;dummy.updateMatrix();ridges.setMatrixAt(i,dummy.matrix);}
      box(.085,.005,.027,0,.222,0,j?mat.cyan:mat.amber,pivot);
      const record={pivot,amount:0,target:0};if(j)layer.modWheel=record;else layer.pitchWheel=record;
      topPlane(textTexture(j?'MOD':'PITCH','#bfc9c8',50),.30,.046,x,.213,z+.43,parent);
    }
  }
  function makePanel(layer){
    const upper=layer.id==='upper',w=layer.width-.90,d=1.36,z=-1.00;
    block(w,.255,d,0,.305,z,mat.panel,layer.group,.035);
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
    block(.016,.156,.245,x+side*.425,5.68,-.287,mat.rubber,root,.025);
    const ux=side*3.53;
    const attachment=block(.457,.365,.452,ux,7.025,-1.025,mat.graphite,root,.035);
    rod(V(ux,7.025,-1.025),V(ux+side*.282,7.025,-1.025),.036,mat.satin,root,12);
    rod(V(ux+side*.260,7.025,-1.025),V(ux+side*.360,7.025,-1.025),.091,mat.rubber,root,10);
    upper.group.updateMatrixWorld(true);
    const end=upper.group.localToWorld(V(ux,-.488,-1.045));
    beam(V(ux,7.05,-1.075),end,.222,.243);
    const mid=V(ux,8.58,-1.449);
    const upperCollar=block(.332,.268,.349,mid.x,mid.y,mid.z,mat.graphite,root,.032);upperCollar.rotation.x=-.24;
    rod(V(ux,8.58,-1.449),V(ux+side*.253,8.58,-1.449),.027,mat.chrome,root,12);
    rod(V(ux+side*.23,8.58,-1.449),V(ux+side*.305,8.58,-1.449),.079,mat.rubber,root,10);
    beam(V(ux,-.48,-1.40),V(ux,-.48,1.81),.23,.190,mat.steel,upper.group);
    [-1.20,1.19].forEach(z=>block(.268,.057,.44,ux,-.367,z,mat.rubber,upper.group,.012));
    block(.259,.345,.142,ux,-.118,1.83,mat.rubber,upper.group,.025);
    beam(V(ux,-.48,1.80),V(ux,-.27,1.80),.223,.18,mat.steel,upper.group);
  }
  beam(V(-4.18,7.045,-1.12),V(4.18,7.045,-1.12),.238,.282);
  beam(V(-4.17,5.875,-.343),V(4.17,5.875,-.343),.228,.263);
  beam(V(-4.17,.685,.881),V(4.17,.685,.881),.208,.210);
  topPlane(textTexture('ATELIER   /   DUAL STAGE','#a2adb0',57),2.25,.083,0,5.999,-.345,root);
  // Three separate chrome pedals on one weighted floor unit.
  const pedalBase=block(1.59,.186,1.61,0,.117,2.56,mat.edge,root,.076);pedalBase.name='Triple-pedal unit';
  block(1.48,.052,1.48,0,.031,2.56,mat.rubber,root,.035);
  [-.535,.535].forEach(x=>[1.99,3.14].forEach(z=>screw(x,.214,z,root,'y',.026)));
  const pedalDefs=[['soft',-.435],['sostenuto',0],['sustain',.435]];
  for(const [id,x] of pedalDefs){
    const pivot=new T.Group();pivot.userData.dynamic=true;pivot.position.set(x,.374,2.027);root.add(pivot);
    const shape=new T.Shape();shape.moveTo(-.082,0);shape.lineTo(.082,0);shape.lineTo(.133,-.933);shape.quadraticCurveTo(.130,-1.02,0,-1.037);shape.quadraticCurveTo(-.130,-1.02,-.133,-.933);shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelSize:.013,bevelThickness:.013,bevelSegments:3,curveSegments:12});geometry.rotateX(-Math.PI/2);geometry.translate(0,-.045,0);smooth(geometry);
    const surface=add(geometry,mat.chrome,pivot,id+' pedal');
    rod(V(-.109,-.057,.005),V(.109,-.057,.005),.042,mat.satin,pivot,16);
    for(let i=0;i<4;i++)box(.173,.002,.012,0,.024,.689+i*.055,mat.satin,pivot);
    const record={id,pivot,amount:0,target:0,sources:new Map(),angle:.119};pedals[id]=record;surface.userData.pedal=record;pivot.userData.pedal=record;pickables.push(surface);
    topPlane(textTexture(id==='sustain'?'DAMPER':id==='soft'?'SOFT':'SOST.','#8f9c9f',58),.27,.04,x,.219,3.215,root);
  }
  // The controller cable follows the stand, with a small loop on the floor.
  tube([V(0,.136,1.791),V(-.54,.090,1.535),V(-2.85,.085,1.04),V(-4.07,.17,.54),V(-4.21,1.7,.43),V(-4.28,5.98,-.73),V(-3.55,7.3,-1.68),V(-4.18,7.72,-1.812)],.027);
  rod(V(-4.18,7.72,-1.710),V(-4.18,7.72,-1.998),.047,mat.edge,root,14);
  root.updateMatrixWorld(true);
  const upperOut=upper.group.localToWorld(V(-3.85,-.03,-1.793));
  rod(V(-3.85,-.03,-1.765),V(-3.85,-.03,-1.971),.045,mat.edge,upper.group,14);
  block(.207,.127,.175,4.35,-.03,-1.821,mat.rubber,upper.group,.020);
  block(.207,.127,.175,5.87,-.03,-1.821,mat.rubber,lower.group,.020);
  tube([upperOut,V(upperOut.x,upperOut.y-.12,upperOut.z-.30),V(-3.80,8.91,-2.24),V(-3.74,7.33,-1.91),V(-3.92,1.11,-.25),V(-3.47,.072,-.93),V(-1.20,.075,-2.05)],.032);
  const upperPower=upper.group.localToWorld(V(4.35,-.03,-1.803));
  tube([upperPower,V(4.42,upperPower.y-.20,upperPower.z-.27),V(3.79,8.53,-1.68),V(4.02,6.95,-1.04),V(4.36,1.02,.66),V(3.52,.074,-.76),V(2.78,.074,-1.90)],.030);
  const lowerPower=V(5.87,7.72,-1.76);tube([lowerPower,V(5.79,7.45,-2.10),V(4.01,6.76,-1.06),V(4.23,2.09,.28),V(4.10,.074,.04),V(2.96,.074,-1.82)],.029);
  for(const [x,y,z] of [[-4.2,2.40,.201],[-4.20,5.98,-.48],[4.2,2.40,.201],[4.20,5.98,-.48]])block(.35,.067,.375,x,y,z,mat.edge,root,.010);
  // Batch static hardware within its own instrument. Every key, wheel and
  // pedal keeps its separate object and pivot for external animation.
  function batchStatic(group,exclude=[]){
    root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
    function visit(node){
      if(node.userData.dynamic||exclude.includes(node))return;
      if(node.isMesh&&!node.isInstancedMesh&&!Array.isArray(node.material)){
        const key=node.material.uuid+':'+node.castShadow+':'+node.receiveShadow;
        if(!batches.has(key))batches.set(key,[]);batches.get(key).push(node);
      }
      for(const child of node.children)visit(child);
    }
    for(const child of group.children)visit(child);
    for(const meshes of batches.values()){
      if(meshes.length<3)continue;
      const list=meshes.map(m=>{
        const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,m.matrixWorld));return g;
      });
      const count=list.reduce((sum,g)=>sum+g.attributes.position.count,0),p=new Float32Array(count*3),n=new Float32Array(count*3),u=new Float32Array(count*2);let at=0;
      for(const g of list){p.set(g.attributes.position.array,at*3);n.set(g.attributes.normal.array,at*3);if(g.attributes.uv)u.set(g.attributes.uv.array,at*2);at+=g.attributes.position.count;g.dispose();}
      const merged=new T.BufferGeometry();merged.setAttribute('position',new T.BufferAttribute(p,3));merged.setAttribute('normal',new T.BufferAttribute(n,3));merged.setAttribute('uv',new T.BufferAttribute(u,2));
      const m=new T.Mesh(merged,meshes[0].material);m.castShadow=meshes[0].castShadow;m.receiveShadow=meshes[0].receiveShadow;m.name='Static hardware';group.add(m);meshes.forEach(o=>o.removeFromParent());
    }
  }
  batchStatic(lower.group);batchStatic(upper.group);batchStatic(root,[lower.group,upper.group]);
  return {root,layers,pedals,pickables,drawScreen};
}
const STAGE_KEY_UP_DURATION=.050;
function stageKeyboardDownDuration(velocity=100,source=''){
  const v=clamp(Number(velocity)||100,1,127)/127;
  if(String(source).startsWith('song:'))return .065-.018*v;
  return .034-.010*v;
}

function createStageController(model,hooks={}){
  const wake=()=>hooks.wake?.();
  const getLayer=tier=>(tier==='lower'||tier==='upper')?model.layers[tier]:undefined;
  const getRecord=(note,tier)=>Number.isInteger(note)?getLayer(tier)?.keys.get(note):undefined;
  const activeNotes=tier=>[...getLayer(tier).keys.values()].filter(k=>k.sources.size).map(k=>k.note);

  // PERFORMANCE: the keyboard's built-in LCD is a 640×240 CanvasTexture.
  // It used to be repainted + uploaded to WebGL synchronously on every Note On
  // and every Note Off. That is the key-specific hitch the practice mode exposed.
  const screenDirty=new Set();
  let screenRefreshPending=false;
  function scheduleScreenRefresh(tier){
    if(hooks.screenEnabled?.()===false)return;
    screenDirty.add(tier);
    if(screenRefreshPending)return;
    screenRefreshPending=true;

    const flush=()=>{
      screenRefreshPending=false;
      if(hooks.screenEnabled?.()===false){screenDirty.clear();return;}
      for(const id of screenDirty){
        const layer=getLayer(id);
        if(layer)model.drawScreen(layer,activeNotes(id));
      }
      screenDirty.clear();wake();
    };

    // Decorative LCD updates are low priority. Never put them on the keydown path.
    if(typeof requestIdleCallback==='function')requestIdleCallback(flush,{timeout:900});
    else setTimeout(flush,240);
  }
  function changed(tier){
    scheduleScreenRefresh(tier);
    hooks.onChange?.(tier);
    wake();
  }
  const clockNow=()=>hooks.audioNow?.() ?? performance.now()/1000;
  function sampleKeyMotion(key,now=clockNow()){
    if(!key.motionActive)return key.amount;
    const start=key.motionStart??now,dur=Math.max(.001,key.motionDuration||.04);
    if(now<=start){key.amount=key.motionFrom??key.amount;return key.amount;}
    let p=clamp((now-start)/dur,0,1);
    // Smoothstep reaches the exact endpoint at a known absolute time.
    const e=p*p*(3-2*p);
    key.amount=(key.motionFrom??key.amount)+((key.motionTo??key.target)-(key.motionFrom??key.amount))*e;
    if(p>=1){key.amount=key.motionTo??key.target;key.motionActive=false;}
    return key.amount;
  }
  function beginKeyMotion(key,to,startAt=null,source=''){
    const now=clockNow();
    sampleKeyMotion(key,now);
    key.motionFrom=key.amount;
    key.motionTo=to;
    key.motionStart=Number.isFinite(startAt)?startAt:now;
    key.motionDuration=to?stageKeyboardDownDuration(key.velocity,source):STAGE_KEY_UP_DURATION;
    key.motionActive=true;
  }
  function recalculate(key){
    key.target=key.sources.size?1:0;
    if(key.sources.size)key.velocity=Math.max(...key.sources.values());
  }
  const strikeThreshold=clamp(hooks.strikeThreshold??1,.5,1);
  function press(note,velocity=100,tier='lower',source='midi',startAt=null){
    const key=getRecord(note,tier);if(!key||!Number.isFinite(velocity))return false;
    velocity=clamp(Math.round(velocity),0,127);if(!velocity)return release(note,tier,source,startAt);
    const wasDown=key.sources.size>0;
    key.sources.set(source,velocity);
    if(!wasDown){
      key.strikeArmed=true;key.strikeSource=source;key.strikeVelocity=velocity;
      recalculate(key);beginKeyMotion(key,1,startAt,source);
    }else recalculate(key);
    changed(tier);return true;
  }
  function release(note,tier='lower',source='midi',startAt=null){
    const key=getRecord(note,tier);if(!key)return false;
    key.sources.delete(source);
    if(!key.sources.size){
      key.strikeArmed=false;key.strikeSource=null;
      recalculate(key);beginKeyMotion(key,0,startAt,source);
    }else recalculate(key);
    changed(tier);return true;
  }
  function pedal(id,pressed,source='midi:lower'){
    const p=model.pedals[id];if(!p)return false;
    if(pressed)p.sources.set(source,true);else p.sources.delete(source);
    p.target=p.sources.size?1:0;wake();return true;
  }
  function allNotesOff(tier){
    if(tier!==undefined&&!getLayer(tier))return false;
    for(const id of tier?[tier]:['lower','upper']){
      for(const key of getLayer(id).keys.values()){key.sources.clear();key.strikeArmed=false;key.strikeSource=null;recalculate(key);}changed(id);
    }
    return true;
  }
  function clearSources(prefix){
    for(const id of ['lower','upper']){
      let altered=false;
      for(const key of getLayer(id).keys.values())for(const source of [...key.sources.keys()])if(String(source).startsWith(prefix)){key.sources.delete(source);recalculate(key);altered=true;}
      if(altered){for(const key of getLayer(id).keys.values())if(!key.sources.size){key.strikeArmed=false;key.strikeSource=null;}changed(id);}
    }
    for(const p of Object.values(model.pedals)){
      for(const source of [...p.sources.keys()])if(String(source).startsWith(prefix))p.sources.delete(source);p.target=p.sources.size?1:0;
    }
    wake();
  }
  function resetControllers(tier){
    const l=getLayer(tier);if(!l)return false;l.pitchWheel.target=0;l.modWheel.target=0;l.sustain=false;
    if(tier==='lower')for(const id of ['sustain','sostenuto','soft'])pedal(id,false,'midi:lower');wake();return true;
  }
  function controlChange(cc,value,tier='lower'){
    const l=getLayer(tier);if(!l||!Number.isInteger(cc)||cc<0||cc>127||!Number.isFinite(value))return false;
    value=clamp(Math.round(value),0,127);
    if(cc===1){l.modWheel.target=value/127;wake();return true;}
    if(cc===64||cc===66||cc===67){
      if(cc===64)l.sustain=value>=64;
      if(tier==='lower')pedal({64:'sustain',66:'sostenuto',67:'soft'}[cc],value>=64,'midi:lower');return true;
    }
    if(cc===120||cc===123)return allNotesOff(tier);
    if(cc===121)return resetControllers(tier);
    return false;
  }
  function setPitchBend(value,tier='upper'){
    const l=getLayer(tier);if(!l||!Number.isFinite(value))return false;l.pitchWheel.target=clamp(value,-1,1);wake();return true;
  }
  function handleMIDIMessage(message){
    const data=message?.data??message;
    if(!data||typeof data.length!=='number'||data.length<3)return false;
    const [status,a,b]=data;
    if(!Number.isInteger(status)||status<128||status>239||![a,b].every(n=>Number.isInteger(n)&&n>=0&&n<=127))return false;
    const channel=status&15;if(channel>1)return false;const tier=channel===0?'lower':'upper';
    switch(status&240){
      case 144:return press(a,b,tier);
      case 128:return release(a,tier);
      case 176:return controlChange(a,b,tier);
      case 224:{const n=a|(b<<7);return setPitchBend((n-8192)/(n>=8192?8191:8192),tier);}
      default:return false;
    }
  }
  function panic(){
    hooks.onPanic?.();allNotesOff();
    for(const id of ['lower','upper'])resetControllers(id);
    for(const p of Object.values(model.pedals)){p.sources.clear();p.target=0;}wake();return true;
  }
  function tick(dt){
    let moved=false,animating=false;
    for(const layer of Object.values(model.layers)){
      for(const key of layer.keys.values()){
        if(!key.motionActive&&key.amount===key.target)continue;
        const before=key.amount;
        sampleKeyMotion(key,clockNow());
        if(key.motionActive)animating=true;

        if(key.target&&key.strikeArmed&&before<strikeThreshold&&key.amount>=strikeThreshold){
          key.strikeArmed=false;
          const source=key.strikeSource;key.strikeSource=null;
          hooks.onStrike?.({note:key.note,tier:key.tier,source,velocity:key.strikeVelocity||key.velocity,amount:key.amount});
        }

        key.pivot.rotation.x=key.amount*key.angle;moved=true;
      }
      for(const [name,scale] of [['pitchWheel',.72],['modWheel',1.18]]){
        const w=layer[name];if(w.amount===w.target)continue;w.amount+=(w.target-w.amount)*(1-Math.exp(-dt*20));
        if(Math.abs(w.target-w.amount)<.0008)w.amount=w.target;else animating=true;w.pivot.rotation.x=w.amount*scale;moved=true;
      }
    }
    for(const p of Object.values(model.pedals)){
      if(p.amount===p.target)continue;p.amount+=(p.target-p.amount)*(1-Math.exp(-dt*18));
      if(Math.abs(p.target-p.amount)<.0008)p.amount=p.target;else animating=true;p.pivot.rotation.x=p.amount*p.angle;moved=true;
    }
    return {moved,animating};
  }
  const api={
    version:'1.0.0',noteOn:(n,v=100,t='lower')=>press(n,v,t),noteOff:(n,t='lower')=>release(n,t),
    controlChange,setPitchBend,handleMIDIMessage,allNotesOff,panic,
    setSustain:(pressed,tier='lower')=>controlChange(64,pressed?127:0,tier),
    getKey:(note,tier='lower')=>getRecord(note,tier),
    getActiveNotes:(tier='lower')=>getLayer(tier)?activeNotes(tier):[],
    get sceneObject(){return model.root;}
  };
  for(const id of ['lower','upper']){
    const l=getLayer(id);l.sustain=false;
    api[id]={minNote:l.minNote,maxNote:l.maxNote,keys:l.keys,object:l.group,noteOn:(n,v=100)=>press(n,v,id),noteOff:n=>release(n,id),allNotesOff:()=>allNotesOff(id),setSustain:pressed=>api.setSustain(pressed,id),controlChange:(cc,v)=>controlChange(cc,v,id),setPitchBend:v=>setPitchBend(v,id)};
  }
  return {api,press,release,pedal,clearSources,tick,activeNotes};
}
