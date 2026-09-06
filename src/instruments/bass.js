'use strict';
function createBass() {
    const root=new T.Group();root.name='Atelier 02 — four-string electric bass';
    const maple=woodTexture('maple',1024),darkWood=woodTexture('ebony',512);
    const paint=canvasTexture(512,512,(ctx,w,h)=>{
      const data=ctx.createImageData(w,h);let seed=92813;
      for(let i=0;i<data.data.length;i+=4){
        seed=(Math.imul(seed,1664525)+1013904223)|0;
        const n=(seed>>>24)/255,flake=n>.978?19:n*5-2;
        data.data[i]=28+flake;data.data[i+1]=99+flake;data.data[i+2]=104+flake;data.data[i+3]=255;
      }
      ctx.putImageData(data,0,0);
    });
    const physical=p=>new T.MeshPhysicalMaterial(p);
    const mat={
      paint:physical({map:paint,metalness:.42,roughness:.28,clearcoat:1,clearcoatRoughness:.15,envMapIntensity:.87}),
      maple:physical({map:maple,bumpMap:maple,bumpScale:.004,roughness:.43,clearcoat:.32,clearcoatRoughness:.3,envMapIntensity:.6}),
      board:physical({map:maple,bumpMap:maple,bumpScale:.002,roughness:.34,clearcoat:.45,clearcoatRoughness:.22,envMapIntensity:.65}),
      walnut:new T.MeshStandardMaterial({color:0x593a24,roughness:.5}),
      inlay:physical({map:darkWood,color:0x55595b,roughness:.26,clearcoat:.36}),
      chrome:physical({color:0xd9e0e1,metalness:1,roughness:.20,envMapIntensity:1.0}),
      satin:physical({color:0xa8b2b4,metalness:.90,roughness:.31}),
      brass:physical({color:0xb39857,metalness:.88,roughness:.3}),
      screw:new T.MeshStandardMaterial({color:0x999f9e,metalness:.86,roughness:.28}),
      black:new T.MeshStandardMaterial({color:0x13171a,roughness:.58}),
      rubber:new T.MeshStandardMaterial({color:0x070a0b,roughness:.91}),
      guard:physical({color:0xdadbc9,roughness:.34,clearcoat:.35,clearcoatRoughness:.25}),
      guardEdge:new T.MeshStandardMaterial({color:0x202829,roughness:.44}),
      bone:physical({color:0xebe1c1,roughness:.40,clearcoat:.18}),
      mark:new T.MeshBasicMaterial({color:0x303329}),
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
    const bodyShape=new T.Shape();bodyShape.moveTo(-.22,-3.66);
    bodyShape.bezierCurveTo(.66,-3.74,1.65,-3.22,1.70,-2.25);
    bodyShape.bezierCurveTo(1.78,-1.38,1.41,-.74,1.14,-.14);
    bodyShape.bezierCurveTo(1.01,.16,1.02,.51,.87,.61);
    bodyShape.bezierCurveTo(.68,.75,.51,.55,.57,.27);
    bodyShape.bezierCurveTo(.67,-.13,.50,-.38,.34,-.25);
    bodyShape.bezierCurveTo(.32,-.10,.32,.34,.32,.60);
    bodyShape.lineTo(-.32,.60);
    bodyShape.bezierCurveTo(-.47,.44,-.47,.74,-.49,1.03);
    bodyShape.bezierCurveTo(-.49,1.31,-.53,1.75,-.70,1.77);
    bodyShape.bezierCurveTo(-.95,1.84,-1.10,1.25,-1.19,.80);
    bodyShape.bezierCurveTo(-1.29,.21,-1.52,-.15,-1.62,-.65);
    bodyShape.bezierCurveTo(-1.92,-1.37,-1.84,-2.52,-1.45,-3.12);
    bodyShape.bezierCurveTo(-1.09,-3.56,-.70,-3.71,-.22,-3.66);bodyShape.closePath();
    const body=slab(bodyShape,.34,-.18,mat.paint,root,.08,8);body.name='Offset solid body with rounded edges';
    // The back's upper edge is relieved slightly for the player's torso.
    const bp=body.geometry.attributes.position;
    for(let i=0;i<bp.count;i++){
      const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);
      if(z<.035){const amount=clamp((-x-.30)/1.2,0,1)*clamp((y+1.25)/1.5,0,1)*clamp((.035-z)/.10,0,1);bp.setZ(i,z+amount*.058);}
    }
    body.geometry.computeVertexNormals();smoothNormals(body.geometry);
    const guard=new T.Shape();guard.moveTo(-.34,.48);guard.lineTo(.34,.48);guard.lineTo(.34,-.06);
    guard.bezierCurveTo(.37,-.33,.59,-.56,.77,-.94);guard.lineTo(.77,-1.55);
    guard.bezierCurveTo(.69,-1.83,.59,-2.07,.32,-2.24);
    guard.bezierCurveTo(-.15,-2.37,-.76,-2.30,-1.10,-2.02);
    guard.bezierCurveTo(-1.57,-1.55,-1.45,-.81,-1.22,-.22);
    guard.bezierCurveTo(-1.05,.21,-1.03,.73,-.84,1.19);
    guard.bezierCurveTo(-.73,1.42,-.61,1.43,-.66,1.15);
    guard.bezierCurveTo(-.75,.77,-.72,.38,-.47,.31);
    guard.bezierCurveTo(-.40,.28,-.35,.35,-.34,.48);guard.closePath();
    slab(guard,.008,.243,mat.guard,root,.003).name='Three-ply parchment pickguard';
    slab(guard,.007,.251,mat.guardEdge,root,.0015);slab(guard,.010,.258,mat.guard,root,.0025);
    [[-.77,1.12],[-1.12,-.12],[-1.34,-.81],[-1.28,-1.55],[-.93,-2.08],[-.27,-2.23],[.38,-2.11],[.68,-1.52],[.66,-.90],[.43,-.33],[-.43,.22]].forEach(([x,y])=>screw(x,y,.274,root,.023));
    // Two Jazz-style single coils, each with two pole pieces per string.
    function pickup(y,width){
      const g=new T.Group();g.name='Single-coil pickup';g.position.set(0,y,.267);root.add(g);
      roundBox(width+.10,.34,.022,.04,0,0,0,mat.rubber,g,.004);
      roundBox(width,.276,.074,.030,0,0,.018,mat.black,g,.008);
      [-1,1].forEach(side=>{
        roundBox(.125,.18,.058,.035,side*(width/2+.026),0,.012,mat.black,g,.005);
        screw(side*(width/2+.035),0,.078,g,.024);
      });
      const spread=.330+(6-y)/8.66*.240;
      for(let s=0;s<4;s++){
        const center=(s-1.5)/3*spread;
        [-.027,.027].forEach(dx=>{
          rod(V(center+dx,0,.087),V(center+dx,0,.100),.021,mat.satin,g,20);
          ring(center+dx,0,.1005,.014,.0205,mat.chrome,g);
        });
      }
    }
    pickup(-1.02,.86);pickup(-1.96,.93);

    // Bent chrome bridge plate, four barrel saddles and working-sized screws.
    const bridge=new T.Group();bridge.name='Four-saddle bridge';root.add(bridge);
    roundBox(.94,.735,.038,.037,0,-2.865,.244,mat.chrome,bridge,.008);
    roundBox(.928,.055,.155,.012,0,-3.185,.274,mat.chrome,bridge,.006);
    roundBox(.033,.590,.049,.010,-.459,-2.855,.279,mat.satin,bridge,.002);
    roundBox(.033,.590,.049,.010,.459,-2.855,.279,mat.satin,bridge,.002);
    [-.342,0,.342].forEach(x=>screw(x,-3.078,.291,bridge,.027));
    const stringXs=[-.285,-.095,.095,.285],saddleYs=[-2.706,-2.684,-2.656,-2.632],stringR=[.0129,.0107,.0082,.0058];
    stringXs.forEach((x,i)=>{
      const y=saddleYs[i],top=.446;
      rod(V(x-.085,y,.393),V(x+.085,y,.393),.053,mat.satin,bridge,32);
      // Narrow circular groove around the saddle gives the string a seat.
      const groove=add(new T.TorusGeometry(.053,.0025,5,40),mat.black,bridge);groove.rotation.y=Math.PI/2;groove.position.set(x,y,.393);
      [-.053,.053].forEach(dx=>{
        rod(V(x+dx,y-.011,.325),V(x+dx,y-.011,.443),.009,mat.screw,bridge,10);
        disk(x+dx,y-.011,.444,.005,mat.black,bridge);
      });
      rod(V(x,y-.040,.370),V(x,-3.213,.370),.010,mat.screw,bridge,10);
      rod(V(x,-3.223,.370),V(x,-3.230,.370),.025,mat.chrome,bridge,16);
      // A helical spring surrounds the intonation screw, between saddle and lip.
      const spring=[];for(let k=0;k<=90;k++){const a=k/90*TAU*9;spring.push(V(x+Math.cos(a)*.027,-3.13+(y+.075+3.13)*k/90,.370+Math.sin(a)*.027));}
      wire(spring,.0042,mat.satin,bridge,108,5);
      const anchor=disk(x,-3.1508,.409,.019,mat.black,bridge);anchor.rotation.x=-Math.PI/2;
      const eye=ring(x,-3.1503,.409,.016,.024,mat.chrome,bridge);eye.rotation.x=-Math.PI/2;
    });

    // Curved control plate, three knurled knobs, recessed jack and hex nut.
    const controls=new T.Group();controls.name='Volume, volume, tone and output';controls.position.set(.997,-1.976,.246);controls.rotation.z=.16;root.add(controls);
    slab(rect(.325,1.83,.151),.022,0,mat.chrome,controls,.006);
    screw(0,.781,.030,controls,.026);screw(0,-.822,.030,controls,.024);
    function knob(y){
      const positions=[],indices=[],normals=[],uv=[],n=128;
      for(let ringN=0;ringN<4;ringN++){
        const z=[.038,.05,.157,.165][ringN],base=[.103,.111,.107,.099][ringN];
        for(let j=0;j<=n;j++){
          const a=j/n*TAU,r=base+(j%2?-.0025:.0025);
          positions.push(Math.cos(a)*r,y+Math.sin(a)*r,z);uv.push(j/n,ringN/3);
          if(ringN<3&&j<n){const k=ringN*(n+1)+j;indices.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);}
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();add(g,mat.chrome,controls);
      disk(0,y,.1655,.099,mat.satin,controls);ring(0,y,.166,.085,.099,mat.chrome,controls);
      box(.007,.041,.0015,0,y+.058,.167,mat.black,controls);
      ring(0,y,.031,.050,.096,mat.rubber,controls);
    }
    [.514,.029,-.456].forEach(knob);
    const jack=new T.Shape();for(let i=0;i<6;i++){const a=i/6*TAU,p=[Math.cos(a)*.071,Math.sin(a)*.071-.716];i?jack.lineTo(...p):jack.moveTo(...p);}jack.closePath();
    const jackHole=new T.Path();jackHole.absarc(0,-.716,.040,0,TAU,true);jack.holes.push(jackHole);
    slab(jack,.025,.030,mat.chrome,controls,.003);disk(0,-.716,.029,.041,mat.rubber,controls);ring(0,-.716,.058,.040,.049,mat.satin,controls);
    // Strap buttons: neck-side horn and the body's tail.
    rod(V(-.71,1.79,-.030),V(-.725,1.903,-.030),.039,mat.chrome,root,24,.065);
    rod(V(-.22,-3.71,-.025),V(-.22,-3.849,-.025),.039,mat.chrome,root,24,.065);
    // Four-bolt neck plate and its thin black gasket on the rear.
    roundBox(.592,.786,.007,.050,0,.174,-.276,mat.rubber,root,.002);
    roundBox(.572,.766,.026,.042,0,.174,-.302,mat.chrome,root,.005);
    [-.209,.209].forEach(x=>[-.106,.454].forEach(y=>screw(x,y,-.309,root,.035,true)));
    const serial=canvasTexture(512,128,(ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#3f4647';ctx.font='24px Georgia, serif';ctx.textAlign='center';ctx.fillText('ATELIER  /  02',w/2,69);});
    const serialMesh=add(new T.PlaneGeometry(.31,.078),new T.MeshStandardMaterial({map:serial,transparent:true,depthWrite:false,roughness:.65}));serialMesh.position.set(0,.166,-.309);serialMesh.rotation.y=Math.PI;

    // A long, tapering maple neck, with a walnut skunk stripe down its back.
    const neckPositions=[],neckIndices=[],neckUV=[],neckRows=52,neckSides=36;
    const neckHalf=y=>.216+clamp((6.01-y)/5.58,0,1)*.12;
    const neckDepth=y=>.222+clamp((6.01-y)/5.58,0,1)*.065;
    for(let r=0;r<=neckRows;r++){
      const t=r/neckRows,y=.43+t*5.58,half=neckHalf(y),depth=neckDepth(y);
      for(let j=0;j<=neckSides;j++){
        const angle=j/neckSides*Math.PI;neckPositions.push(Math.cos(angle)*half,y,.285-Math.sin(angle)*depth);neckUV.push(j/neckSides,t);
        if(r<neckRows&&j<neckSides){const k=r*(neckSides+1)+j;neckIndices.push(k,k+1,k+neckSides+1,k+1,k+neckSides+2,k+neckSides+1);}
      }
    }
    const neckGeo=new T.BufferGeometry();neckGeo.setAttribute('position',new T.Float32BufferAttribute(neckPositions,3));neckGeo.setAttribute('uv',new T.Float32BufferAttribute(neckUV,2));neckGeo.setIndex(neckIndices);neckGeo.computeVertexNormals();add(neckGeo,mat.maple).name='Long maple neck with D profile';
    const stripe=[];for(let n=0;n<=24;n++){const y=.71+n/24*5.14;stripe.push(V(0,y,.285-neckDepth(y)-.0008));}
    wire(stripe,.017,mat.walnut,root,80,6);
    const nutY=6.0,scale=8.66,boardHalf=y=>.222+(6-y)/6.18*.126;
    const fingerboard=new T.Shape();fingerboard.moveTo(-.348,-.18);fingerboard.lineTo(.348,-.18);fingerboard.lineTo(.222,nutY);fingerboard.lineTo(-.222,nutY);fingerboard.closePath();
    slab(fingerboard,.067,.282,mat.board,root,0).name='Maple fingerboard';
    // A subtly radiused playing surface sits over the solid fingerboard.
    const fbP=[],fbUV=[],fbI=[],uSteps=20,vSteps=64;
    for(let r=0;r<=vSteps;r++){
      const t=r/vSteps,y=-.18+t*6.18,hw=boardHalf(y);
      for(let j=0;j<=uSteps;j++){
        const u=j/uSteps,q=u*2-1;fbP.push(q*hw,y,.359-.010*q*q);fbUV.push(u,t);
        if(r<vSteps&&j<uSteps){const k=r*(uSteps+1)+j;fbI.push(k,k+1,k+uSteps+1,k+1,k+uSteps+2,k+uSteps+1);}
      }
    }
    const fbG=new T.BufferGeometry();fbG.setAttribute('position',new T.Float32BufferAttribute(fbP,3));fbG.setAttribute('uv',new T.Float32BufferAttribute(fbUV,2));fbG.setIndex(fbI);fbG.computeVertexNormals();add(fbG,mat.board);
    [-1,1].forEach(s=>rod(V(s*.349,-.174,.321),V(s*.223,6.0,.321),.007,mat.bone,root,8));
    const frets=[nutY];
    for(let i=1;i<=21;i++){
      const y=nutY-scale*(1-2**(-i/12)),hw=boardHalf(y)-.006;frets.push(y);
      const fret=wire([V(-hw,y,.360),V(-hw/2,y,.368),V(0,y,.371),V(hw/2,y,.368),V(hw,y,.360)],.0104,mat.chrome,root,20,8);fret.name='Fret '+i;
    }
    [3,5,7,9,12,15,17,19,21].forEach(n=>{
      const y=(frets[n-1]+frets[n])/2,half=boardHalf(y)*.69,h=clamp((frets[n-1]-frets[n])*.48,.065,.18);
      const p=[],uv=[],idx=[];
      for(let r=0;r<=1;r++)for(let j=0;j<=16;j++){
        const x=(j/16*2-1)*half,yy=y+(r-.5)*h,z=.359-.010*(x/boardHalf(yy))**2+.0006;
        p.push(x,yy,z);uv.push(j/16,r);
        if(!r&&j<16)idx.push(j,j+1,j+17,j+1,j+18,j+17);
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();add(g,mat.inlay).name='Inset block marker';
      const dotYs=n===12?[y-.04,y+.04]:[y];dotYs.forEach(yy=>{const dot=disk(-boardHalf(yy)-.0078,yy,.319,.012,mat.black);dot.rotation.y=-Math.PI/2;});
    });
    roundBox(.459,.056,.077,.008,0,6.017,.318,mat.bone,root,.003);
    roundBox(.418,.120,.206,.024,0,6.018,.079,mat.maple,root,.009);
    const nutXs=[-.165,-.055,.055,.165];
    nutXs.forEach((x,i)=>box(stringR[i]*1.3,.062,.002,x,6.017,.398,mat.black));

    // The four-in-line headstock is a solid maple shape, not a flat silhouette.
    const head=new T.Group();head.name='Four-in-line maple headstock';head.position.set(0,6.051,.269);head.rotation.x=-.055;root.add(head);
    const hs=new T.Shape();hs.moveTo(-.22,0);hs.bezierCurveTo(-.29,.19,-.39,.23,-.42,.49);hs.lineTo(-.68,2.08);
    hs.bezierCurveTo(-.70,2.25,-.59,2.39,-.38,2.40);hs.bezierCurveTo(-.10,2.48,.40,2.28,.48,2.10);
    hs.bezierCurveTo(.53,1.94,.40,1.78,.22,1.71);hs.bezierCurveTo(.05,1.61,.10,1.30,.13,1.08);
    hs.lineTo(.235,.30);hs.bezierCurveTo(.27,.14,.26,.05,.22,0);hs.closePath();
    slab(hs,.165,-.160,mat.maple,head,.012,5);
    const access=disk(0,.143,.018,.058,mat.walnut,head);access.scale.y=1.47;
    const accessHole=disk(0,.146,.019,.042,mat.black,head);accessHole.scale.y=1.40;
    ring(0,.172,.020,.017,.028,mat.satin,head);
    const logoTexture=canvasTexture(1024,384,(ctx,w,h)=>{
      ctx.clearRect(0,0,w,h);ctx.fillStyle='#302d23';ctx.textAlign='center';ctx.font='italic 164px Georgia, serif';ctx.fillText('Atelier',w/2,196);
      ctx.font='43px Georgia, serif';ctx.fillText('E L E C T R I C   B A S S',w/2,284);
    });
    const logo=add(new T.PlaneGeometry(.580,.218),new T.MeshStandardMaterial({map:logoTexture,transparent:true,depthWrite:false,roughness:.60} ),head);logo.position.set(.035,2.073,.018);
    const postLocations=[];
    function keyShape(){
      const k=new T.Shape();k.moveTo(.022,-.138);
      k.bezierCurveTo(.101,-.19,.16,-.080,.079,-.003);
      k.bezierCurveTo(.151,.093,.047,.172,-.016,.101);
      k.bezierCurveTo(-.094,.177,-.168,.062,-.089,-.020);
      k.bezierCurveTo(-.16,-.12,-.048,-.197,.022,-.138);k.closePath();return k;
    }
    for(let i=0;i<4;i++){
      const x=-.287-i*.068,y=.47+i*.47;postLocations.push(V(x,y,.150));
      // Rear plate, open brass gear, worm shaft and four attachment screws.
      roundBox(.217,.354,.021,.024,x,y-.024,-.196,mat.chrome,head,.004);
      [-.079,.079].forEach(dx=>[-.142,.096].forEach(dy=>screw(x+dx,y+dy,-.203,head,.016,true)));
      rod(V(x,y,-.195),V(x,y,-.250),.079,mat.brass,head,40);
      const gearTeeth=new T.InstancedMesh(new T.BoxGeometry(.022,.015,.022),mat.brass,24);gearTeeth.castShadow=true;gearTeeth.receiveShadow=true;head.add(gearTeeth);
      const transform=new T.Object3D();
      for(let j=0;j<24;j++){const a=j/24*TAU;transform.position.set(x+Math.cos(a)*.080,y+Math.sin(a)*.080,-.229);transform.rotation.z=a;transform.updateMatrix();gearTeeth.setMatrixAt(j,transform.matrix);}
      gearTeeth.instanceMatrix.needsUpdate=true;
      screw(x,y,-.255,head,.026,true);
      rod(V(x+.075,y-.092,-.235),V(x-.357,y-.092,-.235),.019,mat.satin,head,12);
      const worm=[];for(let n=0;n<=50;n++){const a=n/50*TAU*6;worm.push(V(x-.025+n/50*.119,y-.092+Math.cos(a)*.025,-.235+Math.sin(a)*.025));}
      wire(worm,.005,mat.chrome,head,65,5);
      roundBox(.04,.094,.05,.009,x-.13,y-.093,-.256,mat.chrome,head,.003);
      const tuningKey=slab(keyShape(),.030,-.252,mat.chrome,head,.009,4);tuningKey.position.set(x-.418,y-.092,-.252);tuningKey.name='Cloverleaf tuning key';
      rod(V(x-.358,y-.092,-.236),V(x-.419,y-.092,-.236),.021,mat.chrome,head,12);
      // Front ferrule and a wide winding post.
      rod(V(x,y,.014),V(x,y,.037),.082,mat.chrome,head,32);
      rod(V(x,y,.037),V(x,y,.053),.060,mat.satin,head,32);
      rod(V(x,y,.047),V(x,y,.161),.042,mat.satin,head,32);
      ring(x,y,.163,.014,.042,mat.chrome,head);disk(x,y,.1625,.014,mat.black,head);
      const winding=[];for(let k=0;k<=120;k++){const a=k/120*TAU*3.10;winding.push(V(x+Math.cos(a)*(.043+stringR[i]*.48),y+Math.sin(a)*(.043+stringR[i]*.48),.068+k/120*.082));}
      wire(winding,stringR[i]*.84,mat.satin,head,150,8);
    }
    // D and G run under a small chrome string tree before their tuning posts.
    rod(V(-.015,.425,.016),V(-.015,.425,.099),.017,mat.chrome,head,12);
    rod(V(-.096,.425,.111),V(.066,.425,.111),.021,mat.chrome,head,16);
    screw(-.015,.425,.131,head,.020);
    root.updateMatrixWorld(true);
    const wrapMap=canvasTexture(32,128,(ctx,w,h)=>{
      const data=ctx.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const a=y/h*TAU+x/w*TAU,light=180+Math.sin(a)*41,i=(y*w+x)*4;
        data.data[i]=light;data.data[i+1]=light;data.data[i+2]=light;data.data[i+3]=255;
      }
      ctx.putImageData(data,0,0);
    });wrapMap.wrapS=wrapMap.wrapT=T.RepeatWrapping;wrapMap.repeat.set(1,1100);
    const wound=new T.MeshStandardMaterial({color:0xe0e0d4,metalness:.9,roughness:.28,map:wrapMap,bumpMap:wrapMap,bumpScale:.0010});
    root.userData.playableStrings=[];
    for(let i=0;i<4;i++){
      const nut=V(nutXs[i],6.020,.398+stringR[i]*.8),saddle=V(stringXs[i],saddleYs[i],.446+stringR[i]*.82);
      // The speaking length is authored directly in the bass root's local
      // coordinate system. This matters because the animated TubeGeometry below
      // also uses root-local points; keeping both in the same coordinate system
      // prevents the string from being translated twice when it vibrates.
      const speaking=add(
        new T.TubeGeometry(new T.LineCurve3(saddle.clone(),nut.clone()),44,stringR[i],8,false),
        wound,root
      );
      speaking.name=['E1','A1','D2','G2'][i]+' bass string';
      root.userData.playableStrings.push({
        mesh:speaking,a:saddle.clone(),b:nut.clone(),
        baseGeometry:speaking.geometry.clone(),radius:stringR[i],
        amp:0,phase:0,active:false,visualHz:4.7+i*.62,decay:2.05+i*.12,index:i
      });
      rod(V(stringXs[i],-3.149,.409),saddle,stringR[i],wound,root,12);
      const toPost=head.localToWorld(postLocations[i].clone());
      if(i>1){
        const tree=head.localToWorld(V(i===2?-.071:.040,.425,.090).clone());
        rod(nut,tree,stringR[i],wound,root,12);rod(tree,toPost,stringR[i],wound,root,12);
      }else rod(nut,toPost,stringR[i],wound,root,12);
    }
    return root;
  }

