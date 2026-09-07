'use strict';

// Venue presets are presentation-only. Instrument models, MIDI playback and camera
// director stay independent from the selected room.
(() => {
  const T = THREE;
  const select = document.getElementById('bp-venue');
  const menu = document.getElementById('venue-menu');
  const STORE = 'vb-venue-preset';
  const SURFACE_Y = 1.2;
  const presets = new Map();
  const bandHome = new Map();
  let scene = null;
  let renderer = null;
  let activeId = '';
  let activeVenue = null;
  let originalBackground = null;
  let originalFog = null;
  let attached = false;
  let tries = 0;

  const mat = (color, roughness=.8, metalness=.05) => new T.MeshStandardMaterial({color, roughness, metalness});
  const emissive = color => new T.MeshBasicMaterial({color, toneMapped:false});
  const vec = v => v?.isVector3 ? v.clone() : new T.Vector3(...v);

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    return texture;
  }

  function labelTexture(text, width=1024, height=128) {
    return canvasTexture(width, height, (ctx,w,h) => {
      ctx.fillStyle = '#0c131d'; ctx.fillRect(0,0,w,h);
      const g = ctx.createLinearGradient(0,0,w,0);
      g.addColorStop(0,'#6c8197'); g.addColorStop(.5,'#d7e9ef'); g.addColorStop(1,'#6c8197');
      ctx.fillStyle = g;
      ctx.font = `500 ${Math.floor(h*.46)}px "Segoe UI",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w/2, h/2, w*.92);
    });
  }

  class Batch {
    constructor(root, materials) {
      this.root = root;
      this.materials = materials;
      this.items = new Map();
      this.geos = {
        box:new T.BoxGeometry(1,1,1),
        rod:new T.CylinderGeometry(1,1,1,8),
        round:new T.CylinderGeometry(1,1,1,18),
      };
      this.dummy = new T.Object3D();
    }
    put(type, material, position, scale, rotation) {
      const key = `${type}:${material.uuid}`;
      if (!this.items.has(key)) this.items.set(key,{geo:this.geos[type],material,matrices:[]});
      this.dummy.position.set(...position);
      this.dummy.scale.set(...scale);
      this.dummy.quaternion.identity();
      if (rotation?.isQuaternion) this.dummy.quaternion.copy(rotation);
      else if (rotation) this.dummy.rotation.set(...rotation);
      this.dummy.updateMatrix();
      this.items.get(key).matrices.push(this.dummy.matrix.clone());
    }
    box(size, position, material, rotation) { this.put('box',material,position,size,rotation); }
    rod(a,b,r,material) {
      const p=vec(a), q=vec(b), d=q.clone().sub(p);
      this.put('rod',material,p.clone().add(q).multiplyScalar(.5).toArray(),[r,d.length(),r],
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));
    }
    truss(a,b,size=.48) {
      const start=vec(a), end=vec(b), length=start.distanceTo(end), axis=end.clone().sub(start).normalize();
      const basis=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis);
      const pt=(x,y,z)=>new T.Vector3(x,y,z).applyQuaternion(basis).add(start).toArray();
      const half=size/2, n=Math.max(1,Math.ceil(length/1.5));
      for(const x of [-half,half]) for(const z of [-half,half]) this.rod(pt(x,0,z),pt(x,length,z),.04,this.materials.truss);
      for(let i=0;i<n;i++){
        const y=i*length/n, y1=(i+1)*length/n;
        for(const s of [-half,half]){
          this.rod(pt(s,y,-half),pt(s,y1,half),.017,this.materials.truss);
          this.rod(pt(-half,y,s),pt(half,y1,s),.017,this.materials.truss);
        }
      }
    }
    flush() {
      for(const item of this.items.values()){
        const mesh=new T.InstancedMesh(item.geo,item.material,item.matrices.length);
        item.matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
        mesh.instanceMatrix.needsUpdate=true;
        mesh.receiveShadow=true;
        mesh.castShadow=false;
        this.root.add(mesh);
      }
      this.items.clear();
    }
  }

  function addBox(root,size,position,material,rotation=null){
    const mesh=new T.Mesh(new T.BoxGeometry(...size),material);
    mesh.position.set(...position);
    if(rotation) mesh.rotation.set(...rotation);
    mesh.receiveShadow=true;
    root.add(mesh);
    return mesh;
  }

  function addLED(root,id,position,width,height,rotation=0){
    const texture=canvasTexture(id==='main'?1536:256,id==='main'?480:960,(ctx,w,h)=>{
      const bg=ctx.createLinearGradient(0,0,w,h);
      bg.addColorStop(0,'#030914');bg.addColorStop(.48,'#0a0c20');bg.addColorStop(1,'#13091f');
      ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      const grad=ctx.createLinearGradient(w*.1,0,w*.9,h);
      grad.addColorStop(0,'#67dcf6');grad.addColorStop(.5,'#9d74ed');grad.addColorStop(1,'#526deb');
      ctx.strokeStyle=grad;
      for(let j=0;j<18;j++){
        ctx.globalAlpha=.12+j*.025;ctx.lineWidth=j%6===0?3:1;
        ctx.beginPath();
        for(let i=0;i<=100;i++){
          const a=i/100*Math.PI*2, k=.58+j*.025;
          const x=w*.5+Math.cos(a)*w*.34*k;
          const y=h*.5+Math.sin(a)*h*.78*k+Math.sin(a*3+j*.2)*h*.045;
          i?ctx.lineTo(x,y):ctx.moveTo(x,y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;
      ctx.fillStyle='#eaf7fb';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`600 ${Math.floor(h*(id==='main'?.15:.07))}px "Segoe UI",sans-serif`;
      ctx.fillText(id==='main'?'N O C T U R N E':'N',w/2,h*.48,w*.88);
      if(id==='main'){
        ctx.fillStyle='#9db2c5';ctx.font=`500 ${Math.floor(h*.035)}px "Segoe UI",sans-serif`;
        ctx.fillText('LIVE SESSION',w/2,h*.63);
      }
    });
    const material=new T.MeshBasicMaterial({map:texture,toneMapped:false});
    const screen=new T.Mesh(new T.PlaneGeometry(width,height),material);
    screen.name=`NOCTURNE LED · ${id}`;
    screen.position.set(...position);screen.rotation.y=rotation;
    root.add(screen);
    addBox(root,[width+.22,height+.22,.18],[position[0],position[1],position[2]-.11],mat('#090d14',.7,.25),[0,rotation,0]);
    return screen;
  }

  function addBeam(root,position,target,color,index){
    const p=vec(position), q=vec(target), direction=q.clone().sub(p), length=direction.length();
    const light=new T.SpotLight(color,260,Math.max(18,length+8),T.MathUtils.degToRad(9),.65,2);
    light.position.copy(p);light.target.position.copy(q);light.name=`NOCTURNE beam ${index}`;
    root.add(light,light.target);
    const radius=Math.tan(T.MathUtils.degToRad(4.5))*length;
    const geometry=new T.ConeGeometry(radius,length,24,1,true);
    geometry.translate(0,-length/2,0);
    geometry.rotateX(Math.PI);
    const material=new T.MeshBasicMaterial({color,transparent:true,opacity:.045,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});
    const beam=new T.Mesh(geometry,material);
    beam.position.copy(p);
    beam.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),direction.normalize());
    beam.renderOrder=2;beam.frustumCulled=false;
    root.add(beam);
  }

  function buildNocturne() {
    const root=new T.Group();
    root.name='Venue · NOCTURNE Livehouse';
    const m={
      concrete:mat('#262c36',.96,.02),wall:mat('#111722',.9,.05),panel:mat('#19222e',.87,.1),
      steel:mat('#222d3b',.4,.72),truss:mat('#647380',.38,.68),rubber:mat('#0b0f16',.87,.04),
      deck:mat('#272e39',.69,.2),fascia:mat('#141a25',.68,.3),seat:mat('#1c3143',.76,.1),
      seatAlt:mat('#26384b',.8,.05),rail:mat('#586473',.38,.75),edge:emissive('#91dce4'),aisle:emissive('#ac8251'),
    };
    const b=new Batch(root,m);

    // Room shell: the uploaded venue uses a 61 x 77 m hall around a 30 x 16 m stage.
    b.box([61,.38,77],[0,-.24,20.5],m.concrete);
    b.box([.55,22,77],[-30.3,11,20.5],m.wall);b.box([.55,22,77],[30.3,11,20.5],m.wall);
    b.box([61,22,.55],[0,11,-18],m.wall);b.box([61,22,.55],[0,11,59],m.wall);
    b.box([61,.5,77],[0,22.25,20.5],m.wall);
    for(const side of [-1,1]) for(let z=-14;z<=56;z+=4.2){
      b.box([.34,20.5,.17],[side*29.75,10.25,z],m.steel);
      b.box([.11,5.4,3.1],[side*29.87,12.7,z+1.7],m.panel);
    }
    for(let z=-14;z<=56;z+=10){b.truss([-29,21.2,z],[29,21.2,z],.54);}
    for(let x=-24;x<=24;x+=8)b.truss([x,21.55,-16],[x,21.55,58],.38);

    // Main stage. Central surface stays flat and unobstructed.
    b.box([30,1.15,16],[0,.575,0],m.fascia);
    b.box([30,.055,16],[0,1.177,0],m.deck);
    b.box([30,.055,.05],[0,1.09,8.03],m.edge);
    b.box([.05,.055,16],[-15.03,1.09,0],m.edge);b.box([.05,.055,16],[15.03,1.09,0],m.edge);
    for(let x=-15;x<=15;x+=2.5)b.box([.009,.004,15.9],[x,1.208,0],m.fascia);
    for(let z=-8;z<=8;z+=2)b.box([29.9,.004,.009],[0,1.21,z],m.fascia);
    for(const side of [-1,1]) for(let i=0;i<4;i++){
      const h=(4-i)*.3,z=8.55+i*.6;b.box([2.4,h,.6],[side*13.75,h/2,z],m.deck);
    }

    // Stage truss and black rear drape.
    for(const x of [-16,16]) for(const z of [-8.7,7]) b.truss([x,.13,z],[x,13.5,z],.52);
    b.truss([-16,13.5,-8.7],[16,13.5,-8.7],.58);b.truss([-16,13.5,7],[16,13.5,7],.58);
    b.truss([-16,13.5,-8.7],[-16,13.5,7],.54);b.truss([16,13.5,-8.7],[16,13.5,7],.54);
    b.truss([-13,12.6,-5.8],[13,12.6,-5.8],.4);
    for(let x=-19;x<=19;x+=.55)b.box([.34,11.4,.22],[x,6.75,-11.8+Math.sin(x*8)*.06],m.rubber);

    // Side technical walks and line arrays.
    for(const side of [-1,1]){
      b.box([1.7,.22,13.5],[side*17.5,2.5,-1.5],m.steel);
      b.rod([side*18.35,3.75,-8],[side*18.35,3.75,5],.04,m.rail);
      const x=side*17.6;
      b.box([1.6,.12,1],[x,12,-4],m.steel);
      for(let i=0;i<9;i++){
        const y=11.62-i*.43,z=-4+i*i*.014;
        b.box([1.58,.405,.92],[x,y,z],m.rubber,[i*.022,0,0]);
      }
      for(let k=0;k<3;k++) b.box([2.2,1.05,1.24],[side*17.5,.54,-1.7+k*1.38],m.rubber);
    }

    // Simplified side/rear audience tiers. The same layout language as the source venue,
    // but fewer seats so this preset can coexist with the animated band on mobile GPUs.
    const seat=(x,y,z,a,index)=>{
      const material=index%8===0?m.seatAlt:m.seat;
      b.box([.43,.1,.46],[x,y+.44,z],material,[0,a,0]);
      b.box([.44,.46,.09],[x,y+.68,z+.2],material,[-.1,a,0]);
    };
    for(const side of [-1,1]) for(let row=0;row<5;row++){
      const x=side*(22+row*1.12),h=.6+row*.65;
      b.box([1.12,h,32],[x,h/2,31],m.concrete);
      for(let i=0;i<25;i++) seat(x,h,18+i*1.2,side*Math.PI/2,i+row);
    }
    for(let row=0;row<5;row++){
      const z=51+row*1.1,h=.65+row*.65;
      b.box([40,h,1.1],[0,h/2,z],m.concrete);
      for(let i=0;i<27;i++) seat(-15.6+i*1.2,h,z,0,i+row);
    }

    // FOH booth visible when the camera turns around.
    b.box([7,.3,4.3],[0,.15,41],m.fascia);b.box([5.3,.14,1.5],[0,1.2,40.9],m.steel,[-.1,0,0]);
    for(const x of [-1.65,0,1.65]) b.box([1.38,.83,.13],[x,1.86,40.45],m.rubber,[-.2,0,0]);
    b.flush();

    // LED wall and side blades keep the source venue dimensions/placement.
    addLED(root,'main',[0,7.1,-8.12],24,7.5,0);
    addLED(root,'left',[-13.6,7.1,-6.8],1.55,7.5,.16);
    addLED(root,'right',[13.6,7.1,-6.8],1.55,7.5,-.16);

    const signMat=new T.MeshBasicMaterial({map:labelTexture('N O C T U R N E'),toneMapped:false});
    const sign=new T.Mesh(new T.PlaneGeometry(13,1.7),signMat);sign.position.set(0,10.2,58.55);sign.rotation.y=Math.PI;root.add(sign);

    // Stable room light + a restrained fixed beam rig. No second render loop is added.
    root.add(new T.HemisphereLight('#9caec7','#1b1d29',.42));
    const fill=new T.DirectionalLight('#c9dcf1',.65);fill.position.set(-9,19,17);root.add(fill);
    const roof=new T.PointLight('#bbcfe5',110,70,2);roof.position.set(0,18,32);root.add(roof);
    const palette=['#67dcf6','#9d74ed','#526deb','#79d8eb','#b58ee8','#6686ed'];
    for(let i=0;i<6;i++){
      const x=-11+i*4.4;
      addBeam(root,[x,12.02,-5.8],[x*.42,1.2,4.6],palette[i],i+1);
    }

    root.userData.surfaceY=SURFACE_Y;
    root.userData.stageBounds=new T.Box3(new T.Vector3(-15,SURFACE_Y,-8),new T.Vector3(15,13.5,8));
    return root;
  }

  const NOCTURNE_LAYOUT = {
    keyboard:[-9.3,-4.95],
    drums:[3.8,-4.9],
    'acoustic:0':[-9.4,3.8],
    'acoustic:1':[-5.4,5.05],
    'acoustic:2':[-1.25,4.45],
    bass:[3.35,5.25],
    'electric:0':[6.8,4.55],
    'electric:1':[10.05,2.0],
    'electric:2':[11.35,-1.55],
  };

  function rootKey(root){
    const name=root?.name||'';
    if(name.includes('dual-tier'))return'keyboard';
    if(name.includes('Band Drums'))return'drums';
    if(name.includes('Fingered Bass'))return'bass';
    let m=/Wish Acoustic (\d+)$/.exec(name);if(m)return`acoustic:${+m[1]-1}`;
    m=/Electric (\d+)$/.exec(name);if(m)return`electric:${+m[1]-1}`;
    return null;
  }

  function captureBand(){
    for(const root of window.VirtualBandCamera?.roots||[]){
      if(!bandHome.has(root.uuid)) bandHome.set(root.uuid,{root,position:root.position.clone()});
    }
  }

  function placeBand(id){
    captureBand();
    for(const home of bandHome.values()){
      const {root,position}=home;
      if(id==='none'){
        root.position.copy(position);
        continue;
      }
      const key=rootKey(root),xz=NOCTURNE_LAYOUT[key];
      root.position.set(xz?.[0]??position.x,position.y+SURFACE_Y,xz?.[1]??position.z);
    }
  }

  function setRoomLook(id){
    if(id==='nocturne'){
      scene.background=new T.Color('#080e19');
      scene.fog=new T.FogExp2('#0b1322',.0065);
    }else{
      scene.background=originalBackground;
      scene.fog=originalFog;
    }
  }

  function activate(id,{persist=true}={}){
    if(!presets.has(id))id='none';
    const preset=presets.get(id);
    if(activeVenue)activeVenue.visible=false;
    if(preset.root){preset.root.visible=true;activeVenue=preset.root;}else activeVenue=null;
    activeId=id;
    placeBand(id);
    setRoomLook(id);
    if(select)select.value=id;
    document.body.dataset.venue=id;
    if(persist)localStorage.setItem(STORE,id);
    renderer.shadowMap.needsUpdate=true;
    window.refreshVirtualBandShadows?.();
    window.VirtualBandCamera?.refit?.();
    window.dispatchEvent(new CustomEvent('vb-venue',{detail:{id,preset}}));
    return id;
  }

  function register(preset){
    if(!preset?.id||!preset?.label)throw new Error('Venue preset requires id and label');
    presets.set(preset.id,preset);
    return preset;
  }

  function attach(){
    if(attached)return true;
    const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    if(!runtime?.scene||!runtime?.renderer||!window.VirtualBandCamera||!select)return false;
    scene=runtime.scene;renderer=runtime.renderer;
    originalBackground=scene.background;originalFog=scene.fog;
    captureBand();

    register({id:'none',label:'无 · 纯乐队',root:null,surfaceY:0});
    const nocturne=buildNocturne();nocturne.visible=false;scene.add(nocturne);
    register({id:'nocturne',label:'NOCTURNE · Livehouse',root:nocturne,surfaceY:SURFACE_Y});

    select.innerHTML=[...presets.values()].map(p=>`<option value="${p.id}">${p.label}</option>`).join('');
    select.addEventListener('change',()=>{activate(select.value);menu?.removeAttribute('open');});

    const stored=localStorage.getItem(STORE);
    const initial=presets.has(stored)?stored:'nocturne';
    activate(initial,{persist:false});

    window.VirtualBandVenues={
      register,
      activate,
      get current(){return activeId;},
      get presets(){return [...presets.values()].map(p=>({id:p.id,label:p.label,surfaceY:p.surfaceY}));},
      get stageBounds(){return activeVenue?.userData?.stageBounds?.clone?.()||null;},
    };
    attached=true;
    console.info('[Venue] presets attached · default NOCTURNE Livehouse · none available');
    return true;
  }

  function wait(){
    if(attach())return;
    if(++tries<600)requestAnimationFrame(wait);
    else console.warn('[Venue] camera/runtime unavailable after waiting.');
  }
  wait();
})();
