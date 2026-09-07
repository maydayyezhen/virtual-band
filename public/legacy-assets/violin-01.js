  const VIOLIN_TUNING=[55,62,69,76];
  const violinNoteName=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
  function createViolinModel(){
    const root=new T.Group();root.name='Atelier 06 / Violin';
    const strings=new Map(),nutY=3.28,bridgeY=0,scale=nutY-bridgeY,boardEnd=.48;
    const spruce=woodTexture('spruce',512),maple=woodTexture('maple',512),ebony=woodTexture('ebony',256);
    const flame=canvasTexture(512,512,(c,w,h)=>{const data=c.createImageData(w,h);let seed=2606;for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed=(Math.imul(seed,1664525)+1013904223)|0;const wave=Math.sin(y/h*132+Math.sin(x/w*8)*1.8+Math.sin(y/h*19)*.8),grain=Math.sin(x*.86+Math.sin(y*.011)*1.4)*3,noise=(seed>>>24)/255*5;const d=wave*14+grain+noise,i=(y*w+x)*4;data.data[i]=188+d;data.data[i+1]=113+d*.70;data.data[i+2]=52+d*.37;data.data[i+3]=255;}c.putImageData(data,0,0);});
    const phys=p=>new T.MeshPhysicalMaterial(p);
    const mat={
      top:phys({map:spruce,color:0xe8ae69,vertexColors:true,roughness:.39,clearcoat:.7,clearcoatRoughness:.24,bumpMap:spruce,bumpScale:.0014}),
      back:phys({map:flame,vertexColors:true,roughness:.36,clearcoat:.75,clearcoatRoughness:.22,bumpMap:flame,bumpScale:.001}),
      rib:phys({map:flame,color:0xa2683e,roughness:.38,clearcoat:.65,side:T.DoubleSide}),
      maple:phys({map:maple,color:0xe0b77d,roughness:.44,clearcoat:.34}),
      varnish:phys({map:flame,color:0xc99562,roughness:.35,clearcoat:.68}),
      edge:phys({color:0x92552e,roughness:.42,clearcoat:.45}),
      ebony:phys({map:ebony,color:0x353437,roughness:.40,clearcoat:.22}),
      black:new T.MeshStandardMaterial({color:0x0c1115,roughness:.64}),
      rubber:new T.MeshStandardMaterial({color:0x11191c,roughness:.94}),
      lining:new T.MeshStandardMaterial({color:0x41291a,roughness:.85,side:T.DoubleSide}),
      purfling:new T.MeshStandardMaterial({color:0x3a271d,roughness:.64}),
      bone:phys({color:0xe7dbc0,roughness:.48}),
      silver:phys({color:0xcbd3d4,metalness:.92,roughness:.27}),
      screw:phys({color:0x929f9f,metalness:.85,roughness:.32}),
      pearl:phys({color:0xd9e0d9,metalness:.25,roughness:.30}),
      bridge:new T.MeshStandardMaterial({map:maple,color:0xefcb91,roughness:.79}),
      bow:phys({color:0x643023,roughness:.38,clearcoat:.65,clearcoatRoughness:.23}),
      hair:new T.MeshStandardMaterial({color:0xe8dfca,roughness:.88,side:T.DoubleSide}),
      string:phys({color:0xd6d7ca,metalness:.81,roughness:.35}),
      active:phys({color:0xa1d4da,emissive:0x73b1bb,emissiveIntensity:.28,roughness:.48,transparent:true,opacity:.87}),
    };
    mat.chrome=mat.silver;
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
      const g=new T.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:18,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:segments});
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
    // Mirrored bouts with four projecting corners and a narrow C-shaped waist.
    const outline=new T.Shape();outline.moveTo(0,1.78);
    const sections=[
      [.29,1.79,.62,1.62,.77,1.44],
      [.94,1.23,.90,.99,.81,.83],
      [.75,.70,.64,.60,.67,.51],
      [.69,.49,.76,.48,.79,.46],
      [.71,.44,.57,.39,.52,.25],
      [.44,.06,.48,-.20,.59,-.32],
      [.65,-.40,.77,-.44,.82,-.49],
      [.74,-.50,.75,-.57,.82,-.69],
      [1.07,-.91,1.11,-1.30,.91,-1.54],
      [.69,-1.79,.30,-1.83,0,-1.81]
    ];
    const anchors=[[0,1.78],...sections.map(s=>s.slice(4))];
    for(const s of sections)outline.bezierCurveTo(...s);
    for(let i=sections.length-1;i>=0;i--){const s=sections[i],p=anchors[i];outline.bezierCurveTo(-s[2],s[3],-s[0],s[1],-p[0],p[1]);}outline.closePath();
    const rim=outline.getSpacedPoints(192).slice(0,-1);
    function fHole(side){
      const raw=new T.Path();raw.moveTo(.022,.270);
      raw.bezierCurveTo(.110,.321,.082,.430,.014,.426);raw.bezierCurveTo(-.059,.420,-.074,.332,-.024,.282);
      raw.bezierCurveTo(-.050,.20,-.091,.105,-.052,.030);raw.lineTo(-.095,.030);raw.lineTo(-.081,.002);raw.lineTo(-.040,.002);
      raw.bezierCurveTo(-.015,-.045,.050,-.089,.045,-.193);raw.bezierCurveTo(.038,-.263,.006,-.291,-.024,-.312);
      raw.bezierCurveTo(-.088,-.297,-.116,-.387,-.049,-.423);raw.bezierCurveTo(.024,-.460,.092,-.397,.069,-.339);
      raw.bezierCurveTo(.067,-.327,.052,-.316,.039,-.311);raw.bezierCurveTo(.102,-.220,.117,-.111,.069,-.027);
      raw.lineTo(.110,-.027);raw.lineTo(.094,.007);raw.lineTo(.048,.007);raw.bezierCurveTo(.010,.061,-.011,.115,.008,.206);raw.bezierCurveTo(.013,.231,.018,.253,.022,.270);raw.closePath();
      const points=raw.getPoints(12).map(p=>new T.Vector2(side*(.387+.112*Math.pow(Math.abs(p.y)/.44,1.4)+p.x*.66),p.y));
      const hole=new T.Path();points.forEach((p,i)=>i?hole.lineTo(p.x,p.y):hole.moveTo(p.x,p.y));hole.closePath();return {hole,points};
    }
