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