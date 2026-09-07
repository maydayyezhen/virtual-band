'use strict';
function createDrumModel(){
  const root=new T.Group();root.name='ATELIER / SESSION 04';
  const pieces=new Map(),pedals={},cache=new Map();
  const phys=p=>new T.MeshPhysicalMaterial(p);
  const wood=woodTexture('mahogany',512);
  const mat={
    shell:phys({color:0x901d2d,metalness:.32,roughness:.27,clearcoat:.9,clearcoatRoughness:.20}),
    wood:phys({map:wood,color:0x713d30,roughness:.43,clearcoat:.22}),
    black:new T.MeshStandardMaterial({color:0x11191e,roughness:.65,metalness:.15}),
    rubber:new T.MeshStandardMaterial({color:0x080c10,roughness:.94}),
    chrome:phys({color:0xd4dee2,metalness:1,roughness:.19}),
    satin:phys({color:0x9aa9af,metalness:.96,roughness:.35}),
    brass:phys({color:0xc7954c,metalness:.92,roughness:.31,clearcoat:.16}),
    darkBrass:phys({color:0x91612b,metalness:.85,roughness:.44}),
    felt:new T.MeshStandardMaterial({color:0x383c3b,roughness:1}),
    ivory:new T.MeshStandardMaterial({color:0xe0ded3,roughness:.76}),
    head:new T.MeshStandardMaterial({color:0xdfdfd4,roughness:.8}),
    snare:phys({color:0x4a5360,metalness:.80,roughness:.31}),
  };
  function add(g,m,parent=root,name=''){
    const o=new T.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
  }
  function geometry(id,make){if(!cache.has(id))cache.set(id,make());return cache.get(id);}
  function box(w,h,d,x,y,z,m,parent=root){const o=add(geometry(['box',w,h,d].join(':'),()=>new T.BoxGeometry(w,h,d)),m,parent);o.position.set(x,y,z);return o;}
  function rounded(w,h,d,r){
    return geometry(['round',w,h,d,r].join(':'),()=>{
      r=Math.min(r,w*.24,h*.24,d*.24);const s=new T.Shape(),x=-w/2+r,y=-h/2+r,W=w-2*r,H=h-2*r;
      s.moveTo(x+r,y);s.lineTo(x+W-r,y);s.quadraticCurveTo(x+W,y,x+W,y+r);s.lineTo(x+W,y+H-r);s.quadraticCurveTo(x+W,y+H,x+W-r,y+H);s.lineTo(x+r,y+H);s.quadraticCurveTo(x,y+H,x,y+H-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
      const g=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:5});g.translate(0,0,-d/2+r);return g;
    });
  }
  function block(w,h,d,x,y,z,m,parent=root,r=.015){const o=add(rounded(w,h,d,r),m,parent);o.position.set(x,y,z);return o;}
  function rod(a,b,r,m=mat.chrome,parent=root,sides=16,top=r){
    const d=b.clone().sub(a),len=d.length(),o=add(geometry(['rod',r,top,len.toFixed(5),sides].join(':'),()=>new T.CylinderGeometry(top,r,len,sides)),m,parent);
    o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return o;
  }
  function cylinder(r,h,x,y,z,m,parent=root,segments=64,open=false){const g=geometry(['cyl',r,h,segments,open].join(':'),()=>new T.CylinderGeometry(r,r,h,segments,1,open));const o=add(g,m,parent);o.position.set(x,y,z);return o;}
  function ring(r,t,x,y,z,m=mat.chrome,parent=root){const o=add(geometry(['ring',r,t].join(':'),()=>new T.TorusGeometry(r,t,8,64)),m,parent);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);return o;}
  function sphere(r,x,y,z,m=mat.chrome,parent=root){const o=add(geometry('sphere:'+r,()=>new T.SphereGeometry(r,16,10)),m,parent);o.position.set(x,y,z);return o;}
  function decal(texture,w,h,x,y,z,parent=root,top=false){
    const m=new T.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.72,metalness:.12,polygonOffset:true,polygonOffsetFactor:-1});
    const o=add(new T.PlaneGeometry(w,h),m,parent);o.castShadow=false;o.position.set(x,y,z);if(top)o.rotation.x=-Math.PI/2;return o;
  }
  function textTex(text,color='#dcdad0',size=64){return canvasTexture(1024,128,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle=color;c.font=`500 ${size}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2);});}
  function wing(x,y,z,parent=root){
    rod(V(x,y,z),V(x+.085,y,z),.014,mat.chrome,parent,10);
    const o=block(.027,.037,.12,x+.098,y,z,mat.satin,parent,.005);o.rotation.x=.35;
  }
  function tripod(x,z,height,spread=.70,angle=.15){
    const g=new T.Group();g.position.set(x,.025,z);root.add(g);
    cylinder(.038,height-.06,0,height/2,0,mat.chrome,g,16);
    cylinder(.052,.44,0,.37,0,mat.satin,g,16);
    for(const y of [.36,height*.62,height-.03]){cylinder(.062,.075,0,y,0,mat.black,g,16);wing(0,y,0,g);}
    for(let i=0;i<3;i++){
      const a=angle+TAU*i/3,foot=V(Math.sin(a)*spread,.045,Math.cos(a)*spread),mid=foot.clone().multiplyScalar(.69);mid.y=.18;
      rod(V(0,.52,0),foot,.021,mat.chrome,g,12);rod(V(0,.18,0),mid,.012,mat.satin,g,10);
      rod(foot.clone().add(V(-.055,0,0)),foot.clone().add(V(.055,0,0)),.053,mat.rubber,g,12);
    }
    return g;
  }
  const headMap=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#dddcd4';c.fillRect(0,0,w,h);let s=173;
    for(let i=0;i<14500;i++){s=(Math.imul(s,1664525)+1013904223)|0;const x=(s>>>0)%w;s=(Math.imul(s,1664525)+1013904223)|0;const y=(s>>>0)%h;c.fillStyle=i%2?'#ffffff17':'#555d5711';c.fillRect(x,y,1,1);}
    c.strokeStyle='#b4b8ae4d';c.lineWidth=2;c.beginPath();c.arc(w/2,h/2,w*.453,0,TAU);c.stroke();
    c.fillStyle='#616b68';c.textAlign='center';c.font='bold 20px Arial';c.fillText('ATELIER',w/2,h*.18);c.font='9px Arial';c.fillText('COATED / SESSION',w/2,h*.212);
    c.strokeStyle='#a7aca226';c.lineWidth=1;for(let i=0;i<32;i++){c.beginPath();c.arc(w/2+i%4,h/2-i%3,20+i*2.2,i*.47,i*.47+.53);c.stroke();}
  });
  mat.head.map=headMap;
  function membrane(r,parent,y,material=mat.head){
    const positions=[0,0,0],uvs=[.5,.5],indices=[],segments=64,rings=10;
    for(let row=1;row<=rings;row++)for(let k=0;k<=segments;k++){const a=k/segments*TAU,rr=r*row/rings;positions.push(Math.sin(a)*rr,0,Math.cos(a)*rr);uvs.push(Math.sin(a)*row/rings*.5+.5,.5-Math.cos(a)*row/rings*.5);}
    for(let k=0;k<segments;k++)indices.push(0,k+1,k+2);
    for(let row=1;row<rings;row++)for(let k=0;k<segments;k++){const a=1+(row-1)*(segments+1)+k,b=a+segments+1;indices.push(a,b,b+1,a,b+1,a+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
    const mesh=add(geo,material,parent,'Independent deformable drumhead');mesh.position.y=y;mesh.userData.dynamic=true;
    const weights=new Float32Array(positions.length/3);for(let i=0;i<weights.length;i++){const rr=Math.hypot(positions[i*3],positions[i*3+2])/r;weights[i]=(1-rr*rr)**2;}
    return {mesh,weights,r,last:0};
  }
  function drum(id,label,r,d,x,y,z,rx=0,rz=0){
    const g=new T.Group();g.position.set(x,y,z);g.rotation.set(rx,0,rz);g.userData.dynamic=true;g.userData.hit=id;g.name=label;root.add(g);
    // Open shell and both bearing edges, so the rear stays a real 3D object.
    cylinder(r,d,0,0,0,id==='snare'?mat.snare:mat.shell,g,64,true);
    const inside=cylinder(r-.035,d-.008,0,0,0,mat.wood,g,64,true);inside.material=mat.wood.clone();inside.material.side=T.BackSide;
    for(const s of [-1,1]){
      cylinder(r+.01,.056,0,s*d/2,0,mat.chrome,g,64,true);
      ring(r+.016,.018,0,s*(d/2+.029),0,mat.chrome,g);
      ring(r-.014,.012,0,s*(d/2+.011),0,mat.ivory,g);
      if(id==='kick'){cylinder(r+.025,.075,0,s*(d/2+.052),0,mat.wood,g,64,true);ring(r+.028,.012,0,s*(d/2+.090),0,mat.shell,g);}
    }
    const n=id==='kick'?10:8;
    for(let i=0;i<n;i++){
      const a=TAU*(i+.5)/n,xx=Math.sin(a)*(r+.038),zz=Math.cos(a)*(r+.038);
      const lug=block(.070,Math.min(.21,d*.44),.095,xx,0,zz,mat.chrome,g,.016);lug.rotation.y=a;
      for(const s of [-1,1]){
        rod(V(xx,s*.072,zz),V(xx,s*(d/2+.023),zz),.014,mat.chrome,g,10);
        cylinder(.031,.025,xx,s*(d/2+.044),zz,mat.satin,g,6);
      }
    }
    // The small brass shell badge faces the audience.
    decal(textTex('A T E L I E R','#e5c997',49),r*.58,.089,0,-.035,r+.004,g);
    let head;
    if(id==='kick'){
      const front=canvasTexture(768,768,(c,w,h)=>{
        c.fillStyle='#171f26';c.fillRect(0,0,w,h);c.strokeStyle='#87908a';c.lineWidth=2;c.beginPath();c.arc(w/2,h/2,w*.453,0,TAU);c.stroke();
        c.textAlign='center';c.fillStyle='#e5ded0';c.font='500 77px Arial';c.fillText('ATELIER',w/2,h*.43);c.font='18px Arial';c.fillStyle='#a9b5b4';c.fillText('S E S S I O N   /   0 4',w/2,h*.50);
        c.strokeStyle='#6d7b7c';c.beginPath();c.moveTo(w*.40,h*.535);c.lineTo(w*.60,h*.535);c.stroke();c.font='12px Arial';c.fillText('HANDCRAFTED IN CODE',w/2,h*.57);
      });
      head=membrane(r-.027,g,d/2+.027,new T.MeshStandardMaterial({map:front,color:0xffffff,roughness:.62}));
      // The front logo is printed into the head texture, so it follows the
      // membrane without a separate coplanar decal or an overlapping port.
      const rear=membrane(r-.026,g,-d/2-.031);rear.mesh.rotation.z=Math.PI;
      cylinder(.155,.006,0,-d/2-.040,0,mat.felt,g,32);
    }else{
      head=membrane(r-.027,g,d/2+.030);
      const rear=cylinder(r-.022,.01,0,-d/2-.020,0,mat.ivory,g,64);
      if(id==='snare'){
        for(let i=0;i<10;i++)rod(V(-r*.88,-d/2-.033,(i-4.5)*.018),V(r*.88,-d/2-.033,(i-4.5)*.018),.004,mat.satin,g,5);
        block(.12,.21,.09,0,-.01,-r-.059,mat.chrome,g,.008);rod(V(0,.025,-r-.102),V(0,.17,-r-.15),.015,mat.satin,g,10);
      }
    }
    const p={id,label,kind:'drum',group:g,head,restRotation:g.rotation.clone(),phase:0,energy:0,amplitude:0,lastMotion:0};pieces.set(id,p);return p;
  }
  const kick=drum('kick','底鼓 / 22″',1.075,1.48,0,1.155,.37,Math.PI/2);
  const tomHigh=drum('tomHigh','高音通鼓 / 10″',.51,.57,.70,2.67,.10,.27,-.11);
  const tomMid=drum('tomMid','中音通鼓 / 12″',.60,.68,-.75,2.74,.08,.26,.105);
  const floorTom=drum('floorTom','落地通鼓 / 16″',.76,.98,-1.65,1.47,-1.03,.035,.035);
  const snare=drum('snare','军鼓 / 14″',.665,.31,1.33,1.51,-1.17,.105,-.05);
  // Bass-drum spurs and telescopic rack-tom mount.
  for(const s of [-1,1]){
    const a=V(s*.93,.58,.72),b=V(s*1.32,.093,1.07);
    rod(a,b,.034);sphere(.065,a.x,a.y,a.z);rod(b.clone().add(V(0,-.018,0)),b.clone().add(V(0,.086,0)),.048,mat.rubber);wing(a.x,a.y,a.z);
  }
  // A low central post connects to external side brackets. Attachment points
  // use each tilted drum's local coordinates; nothing extends into a head.
  const rackHub=V(0,2.50,.59);
  block(.17,.056,.17,0,2.232,.59,mat.black);
  rod(V(0,2.24,.59),V(0,2.555,.59),.041);
  cylinder(.064,.072,0,2.48,.59,mat.satin);wing(0,2.49,.59);
  for(const [p,r] of [[tomHigh,.51],[tomMid,.60]]){
    const normal=V(-Math.sign(p.group.position.x)*.88,0,.475).normalize();
    const mount=new T.Group();mount.position.copy(normal).multiplyScalar(r+.008);mount.position.y=-.055;
    mount.quaternion.setFromUnitVectors(V(0,0,1),normal);p.group.add(mount);
    block(.112,.158,.040,0,0,.018,mat.black,mount,.007);
    block(.086,.132,.048,0,0,.056,mat.chrome,mount,.009);
    rod(V(0,0,.076),V(0,0,.157),.027,mat.satin,mount,12);
    sphere(.045,0,0,.163,mat.chrome,mount);
    root.updateMatrixWorld(true);
    const socket=mount.localToWorld(V(0,0,.163));rod(rackHub,socket,.027);
  }
  for(let i=0;i<3;i++){
    const a=.35+i*TAU/3,x=-1.65+Math.sin(a)*.75,z=-1.03+Math.cos(a)*.75;
    rod(V(x,1.37,z),V(x+Math.sin(a)*.15,.08,z+Math.cos(a)*.15),.028);cylinder(.048,.12,x,1.31,z,mat.chrome);wing(x,1.31,z);sphere(.059,x+Math.sin(a)*.15,.061,z+Math.cos(a)*.15,mat.rubber);
  }
  tripod(1.33,-1.17,1.05,.55);
  for(let i=0;i<3;i++){const a=i*TAU/3;rod(V(1.33,1.03,-1.17),V(1.33+Math.sin(a)*.59,1.31,-1.17+Math.cos(a)*.59),.023);sphere(.04,1.33+Math.sin(a)*.59,1.33,-1.17+Math.cos(a)*.59,mat.rubber);}
  const cymbalMap=canvasTexture(1024,1024,(c,w,h)=>{
    c.fillStyle='#d9bb75';c.fillRect(0,0,w,h);c.strokeStyle='#74582730';c.lineWidth=.65;
    for(let r=17;r<512;r+=2.1){c.beginPath();c.arc(w/2,h/2,r,0,TAU);c.stroke();}
    let seed=447;for(let i=0;i<1800;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const a=(seed>>>0)/4294967296*TAU;seed=(Math.imul(seed,1664525)+1013904223)|0;const r=Math.sqrt((seed>>>0)/4294967296)*490;c.fillStyle=i%2?'#ffffff13':'#59452413';c.beginPath();c.ellipse(512+Math.sin(a)*r,512+Math.cos(a)*r,2.5,4,a,0,TAU);c.fill();}
    c.fillStyle='#383024';c.textAlign='center';c.font='italic 500 54px Georgia';c.fillText('Atelier',512,740);c.font='15px Arial';c.fillText('B 2 0   /   H A N D   H A M M E R E D',512,768);
  });
  const gold=phys({map:cymbalMap,color:0xcdae62,metalness:.90,roughness:.32,clearcoat:.15,side:T.DoubleSide});
  function cymbalGeometry(r,flat=false){
    return geometry('cymbal:'+r+':'+flat,()=>{
      const profile=[[.018,.102],[.044,.115],[r*.11,.12],[r*.15,.105],[r*.20,.059],[r*.28,.036],[r*.48,.022],[r*.72,.008],[r*.92,-.009],[r,-.019],[r,-.027],[r*.90,-.020],[r*.50,.010],[r*.24,.039],[r*.15,.093],[.045,.105],[.018,.092]];
      const g=new T.LatheGeometry(profile.map(([x,y])=>new T.Vector2(x,y*(flat?.50:1))),96);
      const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/r*.5+.5,.5-p.getZ(i)/r*.5);return g;
    });
  }
  function cymbal(id,label,r,x,y,z,tiltX,tiltZ,baseX=x,baseZ=z){
    const stand=tripod(baseX,baseZ,y-.35,.70,id==='ride'?.56:.16);
    const anchor=V(baseX,y-.34,baseZ),tip=V(x,y-.03,z),back=anchor.clone().addScaledVector(tip.clone().sub(anchor),-.42);
    rod(back,tip,.024);cylinder(.072,.067,baseX,y-.31,baseZ,mat.satin);wing(baseX,y-.29,baseZ);sphere(.056,x,y-.023,z);
    const g=new T.Group();g.position.set(x,y,z);g.rotation.set(tiltX,0,tiltZ);g.userData.dynamic=true;g.userData.hit=id;g.name=label;root.add(g);
    const surface=add(cymbalGeometry(r),gold,g,label);ring(r-.005,.004,0,-.021,0,mat.darkBrass,g);
    cylinder(.049,.040,0,.095,0,mat.felt,g,20);cylinder(.048,.024,0,.140,0,mat.felt,g,20);rod(V(0,-.05,0),V(0,.20,0),.013,mat.chrome,g,12);block(.091,.029,.021,0,.19,0,mat.satin,g,.005);
    const p={id,label,kind:'cymbal',group:g,surface,restRotation:g.rotation.clone(),phase:0,energy:0,amplitude:0,lastMotion:0};pieces.set(id,p);return p;
  }
  cymbal('crashLeft','左 Crash / 16″',.83,1.88,3.36,.57,-.105,-.12,2.31,.62);
  cymbal('crashRight','右 Crash / 18″',.92,-1.66,3.43,.74,-.10,.10,-2.29,.82);
  cymbal('ride','Ride / 20″',1.02,-2.18,2.82,-.83,.16,.19,-2.76,-.77);
  cymbal('splash','Splash / 10″',.47,.25,3.41,-.26,.09,.025,.0,.45);
  // Hi-hat: two separate cymbals, sliding clutch, pull rod, three legs and pedal.
  const hx=2.25,hz=-1.48,hy=2.46;
  tripod(hx,hz,hy+.23,.63,.57);
  const hatLower=new T.Group();hatLower.position.set(hx,hy-.06,hz);root.add(hatLower);hatLower.rotation.x=Math.PI;hatLower.userData.hit='hihat';
  add(cymbalGeometry(.695,true),gold,hatLower,'Bottom hi-hat');
  const hat=new T.Group();hat.position.set(hx,hy-.031,hz);hat.userData.dynamic=true;hat.userData.hit='hihat';hat.name='Hi-hat / 14″';root.add(hat);
  const hatSurface=add(cymbalGeometry(.695,true),gold,hat);cylinder(.043,.036,0,.080,0,mat.felt,hat,20);cylinder(.034,.11,0,.138,0,mat.chrome,hat,16);wing(0,.16,0,hat);
  pieces.set('hihat',{id:'hihat',label:'踩镲 / 14″',kind:'hat',group:hat,surface:hatSurface,restRotation:hat.rotation.clone(),restY:hy-.031,phase:0,energy:0,amplitude:0,lastMotion:0});
  // Both pedal boards pivot at the heel; the bass beater has its own axle.
  function pedal(id,x,z){
    const base=new T.Group();base.position.set(x,.047,z);base.userData.hit=id;root.add(base);
    block(.34,.049,.85,0,0,-.36,mat.black,base,.018);block(.29,.031,.15,0,.048,-.70,mat.satin,base,.009);
    const pivot=new T.Group();pivot.position.set(0,.080,-.68);pivot.userData.dynamic=true;pivot.userData.hit=id;base.add(pivot);
    block(.243,.026,.635,0,.08,.293,mat.satin,pivot,.013);
    for(let i=0;i<7;i++)box(.16,.004,.016,0,.096,.065+i*.066,mat.rubber,pivot);
    decal(textTex('A','#202d32',92),.13,.105,0,.097,.31,pivot,true);
    rod(V(-.14,0,0),V(.14,0,0),.026,mat.chrome,pivot,16);
    const p={id,pivot,amount:0,target:0,base};pedals[id]=p;return p;
  }
  const kickPedal=pedal('kickPedal',0,-.47);
  for(const x of [-.14,.14])rod(V(x,.12,-.51),V(x,.44,-.51),.021);
  rod(V(-.19,.44,-.51),V(.19,.44,-.51),.032);
  const beater=new T.Group();beater.position.set(0,.44,-.51);beater.userData.dynamic=true;beater.userData.hit='kickPedal';root.add(beater);
  rod(V(0,0,0),V(0,.62,-.13),.018,mat.chrome,beater,12);
  const mallet=cylinder(.085,.10,0,.67,-.14,mat.ivory,beater,24);mallet.rotation.x=Math.PI/2;
  sphere(.055,0,.0,0,mat.satin,beater);kickPedal.beater=beater;
  rod(V(.18,.12,-.51),V(.18,.41,-.51),.024,mat.satin);for(let i=0;i<12;i++)ring(.031,.004,.18,.18+i*.015,-.51,mat.chrome);
  const hhPedal=pedal('hatPedal',hx,hz-.08);
  rod(V(hx,.11,hz-.13),V(hx,.38,hz),.017,mat.satin);
  // Round upholstered throne, seam ring, telescopic post and double-braced legs.
  tripod(0,-2.27,.84,.61,.2);
  cylinder(.50,.14,0,.96,-2.27,mat.rubber,root,64);cylinder(.47,.022,0,1.034,-2.27,mat.black,root,64);ring(.488,.006,0,1.018,-2.27,mat.satin);
  cylinder(.08,.18,0,.79,-2.27,mat.satin);wing(0,.73,-2.27);
  // A pair of maple sticks rests on the rug next to the throne.
  const stickMat=phys({color:0xc8a272,roughness:.50});
  for(let i=0;i<2;i++){
    const a=V(.59+i*.07,.088,-2.13+i*.03),b=V(1.16+i*.07,.088,-2.46+i*.025);
    rod(a,b,.017,stickMat,root,10,.012);const tip=b.clone().addScaledVector(b.clone().sub(a).normalize(),.035);sphere(.022,tip.x,tip.y,tip.z,stickMat);
  }
  const rugMap=canvasTexture(512,512,(c,w,h)=>{c.fillStyle='#202d33';c.fillRect(0,0,w,h);c.strokeStyle='#43535b45';c.lineWidth=1;for(let i=0;i<w;i+=3){c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();}c.strokeStyle='#0b151b80';for(let i=0;i<h;i+=4){c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();}c.strokeStyle='#83918b';c.lineWidth=3;c.strokeRect(7,7,w-14,h-14);c.strokeStyle='#71807960';c.lineWidth=1;c.strokeRect(12,12,w-24,h-24);});
  const rug=block(7.15,.028,5.12,-.07,.018,-.44,new T.MeshStandardMaterial({color:0x1b252c,roughness:1}),root,.007);
  const rugTop=decal(rugMap,7.10,5.07,-.07,.034,-.44,root,true);rugTop.receiveShadow=true;
  decal(textTex('A T E L I E R   /   S E S S I O N   0 4','#9aaba9',43),1.33,.10,2.58,.036,1.87,root,true);
  // Static geometry is merged by material inside each independent part.
  function batchStatic(group){
    root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
    function visit(node){
      if(node.userData.dynamic||node.userData.hit)return;
      if(node.isMesh&&!Array.isArray(node.material)){
        const key=node.material.uuid+':'+node.castShadow+':'+node.receiveShadow;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(node);
      }
      for(const child of node.children)visit(child);
    }
    for(const node of group.children)visit(node);
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;const positions=[],normals=[],uvs=[];
      for(const mesh of meshes){
        const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();source.applyMatrix4(inv.clone().multiply(mesh.matrixWorld));
        positions.push(...source.attributes.position.array);normals.push(...source.attributes.normal.array);const uv=source.attributes.uv;uvs.push(...(uv?uv.array:new Float32Array(source.attributes.position.count*2)));source.dispose();
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeBoundingSphere();
      const first=meshes[0],o=add(g,first.material,group,'Merged static hardware');o.castShadow=first.castShadow;o.receiveShadow=first.receiveShadow;for(const mesh of meshes)mesh.removeFromParent();
    }
  }
  for(const p of pieces.values())batchStatic(p.group);
  for(const p of Object.values(pedals)){batchStatic(p.pivot);batchStatic(p.base);}batchStatic(beater);batchStatic(hatLower);batchStatic(root);
  root.updateMatrixWorld(true);
  return {root,pieces,pedals};
}
// General MIDI percussion. Raw MIDI is routed on channel 10 only.
const DRUM_NOTES=Object.freeze({
  35:'kick',36:'kick',37:'snare',38:'snare',40:'snare',
  41:'floorTom',43:'floorTom',45:'tomMid',47:'tomMid',48:'tomHigh',50:'tomHigh',
  42:'hihat',44:'hihat',46:'hihat',49:'crashLeft',57:'crashRight',
  51:'ride',53:'ride',59:'ride',55:'splash'
});
const DEFAULT_NOTE=Object.freeze({kick:36,snare:38,tomHigh:50,tomMid:47,floorTom:43,hihat:42,crashLeft:49,crashRight:57,ride:51,splash:55});
function createDrumController(model,hooks={}){
  const held=new Set();let openness=0,wantOpen=0,kickAge=10,resetPending=false,lastNote=null;
  const byte=v=>Number.isInteger(v)&&v>=0&&v<=127;
  function wake(){hooks.wake?.();}
  function setHiHat(value){
    if(!Number.isFinite(value)||value<0||value>1)return false;
    wantOpen=value;wake();return true;
  }
  function noteOn(note,velocity=100){
    if(!byte(note)||!byte(velocity)||!DRUM_NOTES[note])return false;
    if(velocity===0)return noteOff(note);
    const p=model.pieces.get(DRUM_NOTES[note]),v=velocity/127;
    p.energy=Math.min(1.2,p.energy*.24+Math.pow(v,.70));p.phase=0;p.lastMotion=1;
    held.add(note);lastNote=note;
    if(p.id==='kick')kickAge=0;
    if(note===42||note===44)wantOpen=0;
    if(note===46)wantOpen=Math.max(.78,wantOpen);
    hooks.onHit?.({note,velocity,id:p.id,label:p.label});wake();return true;
  }
  function noteOff(note){
    if(!byte(note)||!DRUM_NOTES[note])return false;
    held.delete(note);return true; // Percussion rebounds/decays after note-off.
  }
  function hit(id,velocity=100){return DEFAULT_NOTE[id]===undefined?false:noteOn(DEFAULT_NOTE[id],velocity);}
  function choke(id){
    const p=model.pieces.get(typeof id==='number'?DRUM_NOTES[id]:id);
    if(!p||p.kind==='drum')return false;p.energy=0;p.lastMotion=1;wake();return true;
  }
  function allNotesOff(){held.clear();return true;}
  function panic(){
    held.clear();for(const p of model.pieces.values()){p.energy=0;p.phase=0;p.lastMotion=1;}
    kickAge=10;wantOpen=openness=0;resetPending=true;hooks.onPanic?.();wake();return true;
  }
  function controlChange(cc,value){
    if(!byte(cc)||!byte(value))return false;
    if(cc===4)return setHiHat(1-value/127); // 0=open, 127=closed.
    if(cc===120)return panic();
    if(cc===123)return allNotesOff();
    if(cc===121)return setHiHat(0);
    return false;
  }
  function handleMIDIMessage(eventOrData){
    const d=eventOrData?.data??eventOrData;
    if(!d||!Number.isInteger(d.length)||d.length!==3)return false;
    const status=d[0],a=d[1],b=d[2];
    if(!Number.isInteger(status)||status<0x80||status>0xEF||(status&15)!==9||!byte(a)||!byte(b))return false;
    const type=status&0xF0;
    if(type===0x90)return noteOn(a,b);
    if(type===0x80)return noteOff(a);
    if(type===0xB0)return controlChange(a,b);
    if(type===0xA0)return b>=64?choke(a):false;
    return false;
  }
  function tick(dt){
    if(!Number.isFinite(dt)||dt<=0)return {moved:false,animating:false};dt=Math.min(.05,dt);
    let moved=resetPending,animating=false;resetPending=false;
    for(const p of model.pieces.values()){
      if(p.energy<=0&&!p.lastMotion)continue;
      p.phase+=dt;
      const decay=p.kind==='drum'?13:p.kind==='hat'?(wantOpen<.1?15:4.3):p.id==='ride'?1.7:2.3;
      p.energy*=Math.exp(-dt*decay);if(p.energy<.0015)p.energy=0;
      const e=p.energy,t=p.phase;
      p.group.rotation.copy(p.restRotation);
      if(p.kind==='drum'){
        const dent=-Math.sin(t*44)*e*.065;p.head.last=dent;
        const positions=p.head.mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)positions.setY(i,dent*p.head.weights[i]);
        positions.needsUpdate=true;p.head.mesh.geometry.computeVertexNormals();
        if(p.id!=='kick'){p.group.rotation.x+=Math.sin(t*34)*e*.008;p.group.rotation.z+=Math.sin(t*29)*e*.004;}
      }else{
        const amount=p.kind==='hat'?.012+openness*.050:.17;
        p.group.rotation.x+=Math.sin(t*17.5)*e*amount;
        p.group.rotation.z+=Math.sin(t*13+.7)*e*amount*.65;
      }
      p.lastMotion=e>0?1:0;moved=true;animating=animating||e>0;
    }
    const oldOpen=openness;openness+=(wantOpen-openness)*(1-Math.exp(-dt*22));
    if(Math.abs(openness-wantOpen)<.0002)openness=wantOpen;
    model.pieces.get('hihat').group.position.y=model.pieces.get('hihat').restY+openness*.15;
    if(oldOpen!==openness){moved=true;animating=openness!==wantOpen||animating;}
    const h=model.pedals.hatPedal;const nextHat=1-openness;
    if(h.amount!==nextHat){h.amount=nextHat;h.pivot.rotation.x=nextHat*.18;moved=true;}
    const k=model.pedals.kickPedal;let amount=0;
    if(kickAge<.46){kickAge+=dt;amount=kickAge<.055?Math.sin(kickAge/.055*Math.PI/2):Math.exp(-(kickAge-.055)*17);animating=true;}
    if(k.amount!==amount){k.amount=amount;k.pivot.rotation.x=amount*.15;k.beater.rotation.x=amount*.43;moved=true;}
    return {moved,animating};
  }
  const api={
    noteOn,noteOff,hit,choke,setHiHat,controlChange,handleMIDIMessage,allNotesOff,panic,
    pieces:model.pieces,pedals:model.pedals,root:model.root,mapping:DRUM_NOTES,
    get activeNotes(){return [...held];},get hiHatOpen(){return openness;},get lastNote(){return lastNote;},midiChannel:10
  };
  return {api,noteOn,noteOff,hit,setHiHat,panic,tick};
}
