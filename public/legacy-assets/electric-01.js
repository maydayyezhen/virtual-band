  const ELECTRIC_TUNING=[40,45,50,55,59,64];
  const electricNoteName=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
  function createElectricModel(){
    const root=new T.Group();root.name='Atelier 05 / Electric';
    const strings=new Map(),controls={},frets=[4.3],nutY=4.3,scale=6.48,bridgeY=nutY-scale;
    const maple=woodTexture('maple',512),rosewood=woodTexture('rosewood',512);
    const paint=canvasTexture(512,512,(c,w,h)=>{const p=c.createImageData(w,h);let seed=531;for(let i=0;i<p.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;const n=(seed>>>24)/255,d=n>.988?14:n*5-2;p.data[i]=30+d;p.data[i+1]=66+d;p.data[i+2]=108+d;p.data[i+3]=255;}c.putImageData(p,0,0);});
    const phys=p=>new T.MeshPhysicalMaterial(p);
    const mat={
      paint:phys({map:paint,metalness:.43,roughness:.27,clearcoat:1,clearcoatRoughness:.17}),
      maple:phys({map:maple,bumpMap:maple,bumpScale:.003,roughness:.44,clearcoat:.32}),
      board:phys({map:rosewood,color:0x7b665d,roughness:.49,clearcoat:.13}),
      walnut:new T.MeshStandardMaterial({color:0x523525,roughness:.56}),
      chrome:phys({color:0xd9e2e5,metalness:1,roughness:.19}),
      satin:phys({color:0xb0bdc1,metalness:.94,roughness:.34}),
      brass:phys({color:0xb49a69,metalness:.84,roughness:.30}),
      screw:phys({color:0x8c9b9f,metalness:.90,roughness:.30}),
      black:new T.MeshStandardMaterial({color:0x10171d,roughness:.57}),
      rubber:new T.MeshStandardMaterial({color:0x0a1015,roughness:.93}),
      guard:phys({color:0xe0dccd,roughness:.35,clearcoat:.40,clearcoatRoughness:.25}),
      guardEdge:new T.MeshStandardMaterial({color:0x2b3339,roughness:.48}),
      bone:phys({color:0xe7dec8,roughness:.40}),
      pearl:phys({color:0xe4dfcf,metalness:.28,roughness:.28}),
      string:phys({color:0xd3d9d7,metalness:.84,roughness:.30}),
      active:phys({color:0xf0c584,emissive:0xe7a545,emissiveIntensity:.50,metalness:.3,roughness:.33,transparent:true,opacity:.92}),
    };
    function add(g,material,parent=root,name=''){
      const m=new T.Mesh(g,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    }
    function box(w,h,d,x,y,z,material,parent=root){const m=add(new T.BoxGeometry(w,h,d),material,parent);m.position.set(x,y,z);return m;}
    function ball(x,y,z,sx,sy,sz,material,parent=root){const m=add(new T.SphereGeometry(1,24,14),material,parent);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m;}
    function rod(a,b,r,material,parent=root,sides=12,endRadius=r){
      const delta=b.clone().sub(a),m=add(new T.CylinderGeometry(endRadius,r,delta.length(),sides),material,parent);
      m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;
    }
    function wire(points,r,material,parent=root,steps=48,sides=6,closed=false){
      return add(new T.TubeGeometry(new T.CatmullRomCurve3(points,closed,'centripetal'),steps,r,sides,closed),material,parent);
    }
    function rect(w,h,r){
      const s=new T.Shape(),x=-w/2,y=-h/2;
      s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);
      s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
      s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;
    }
    function uvXY(g){
      g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x||1),(p.getY(i)-b.min.y)/(b.max.y-b.min.y||1));
      return g;
    }
    function smoothNormals(g){
      const p=g.attributes.position,n=g.attributes.normal,sums=new Map(),keys=[];
      for(let i=0;i<p.count;i++){
        const k=Math.round(p.getX(i)*1e5)+','+Math.round(p.getY(i)*1e5)+','+Math.round(p.getZ(i)*1e5);keys.push(k);
        if(!sums.has(k))sums.set(k,V(0,0,0));sums.get(k).add(V(n.getX(i),n.getY(i),n.getZ(i)));
      }
      for(const v of sums.values())v.normalize();
      for(let i=0;i<n.count;i++){const v=sums.get(keys[i]);n.setXYZ(i,v.x,v.y,v.z);}
      return g;
    }
    function slab(shape,depth,z,material,parent=root,bevel=0,segments=3){
      const g=new T.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:36,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:segments});
      if(bevel)smoothNormals(g);uvXY(g);const m=add(g,material,parent);m.position.z=z;return m;
    }
    function roundBox(w,h,depth,r,x,y,z,material,parent=root,bevel=.005){
      const m=slab(rect(w,h,r),depth,z,material,parent,bevel);m.position.x=x;m.position.y=y;return m;
    }
    function disk(x,y,z,r,material,parent=root,back=false){
      const m=add(new T.CircleGeometry(r,32),material,parent);m.position.set(x,y,z);if(back)m.rotation.y=Math.PI;return m;
    }
    function ring(x,y,z,inner,outer,material,parent=root,back=false){
      const m=add(new T.RingGeometry(inner,outer,40),material,parent);m.position.set(x,y,z);if(back)m.rotation.y=Math.PI;return m;
    }
    function screw(x,y,z,parent=root,r=.026,back=false){
      const sign=back?-1:1;
      rod(V(x,y,z-sign*.014),V(x,y,z),r,mat.screw,parent,16,r*.88);
      const slot=box(r*1.20,r*.16,.0018,x,y,z+sign*.0012,mat.black,parent);slot.rotation.z=.34;
      return slot;
    }
    function label(text,w,h,x,y,z,parent=root,color='#d1d5cc',back=false){
      const tex=canvasTexture(1024,256,(c,W,H)=>{c.clearRect(0,0,W,H);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='500 100px Arial';c.fillText(text,W/2,H/2);});
      const m=add(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tex,transparent:true,depthWrite:false,roughness:.65,polygonOffset:true,polygonOffsetFactor:-1}),parent);m.position.set(x,y,z);m.castShadow=false;if(back)m.rotation.y=Math.PI;return m;
    }
    const shape=new T.Shape();shape.moveTo(-.10,-3.22);
    shape.bezierCurveTo(.70,-3.28,1.48,-2.93,1.59,-2.21);
    shape.bezierCurveTo(1.73,-1.48,1.34,-.98,1.09,-.49);
    shape.bezierCurveTo(.99,-.22,1.12,.15,1.05,.45);
    shape.bezierCurveTo(1.01,.74,.83,.90,.69,.78);
    shape.bezierCurveTo(.55,.64,.67,.33,.53,.20);
    shape.bezierCurveTo(.43,.09,.34,.21,.32,.40);
