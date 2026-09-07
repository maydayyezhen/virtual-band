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