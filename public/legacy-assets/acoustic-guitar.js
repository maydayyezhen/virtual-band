'use strict';
function createGuitar() {
    const root = new T.Group(); root.name = 'Procedural acoustic guitar';
    const spruce = woodTexture('spruce'), rosewood = woodTexture('rosewood'), ebony = woodTexture('ebony', 512), mahogany = woodTexture('mahogany', 512);
    const sideTex = rosewood.clone(); sideTex.rotation = Math.PI / 2; sideTex.wrapS = sideTex.wrapT = T.RepeatWrapping; sideTex.repeat.set(1, 2.1);
    const phys = (parameters) => new T.MeshPhysicalMaterial(parameters);
    const mat = {
      top: phys({map:spruce, bumpMap:spruce, bumpScale:.009, roughness:.40, metalness:0, clearcoat:.42, clearcoatRoughness:.25, envMapIntensity:.55}),
      back: phys({map:rosewood, bumpMap:rosewood, bumpScale:.008, roughness:.31, clearcoat:.55, clearcoatRoughness:.20, envMapIntensity:.75}),
      side: phys({map:sideTex, bumpMap:sideTex, bumpScale:.007, roughness:.34, clearcoat:.50, clearcoatRoughness:.24, side:T.DoubleSide, envMapIntensity:.65}),
      neck: phys({map:mahogany, roughness:.42, clearcoat:.26, clearcoatRoughness:.36}),
      ebony: phys({map:ebony, bumpMap:ebony, bumpScale:.006, roughness:.4, clearcoat:.13}),
      bone: phys({color:0xe6d8b7, roughness:.31, clearcoat:.20}),
      dark: new T.MeshStandardMaterial({color:0x23180f, roughness:.68}),
      inner: new T.MeshStandardMaterial({map:spruce, color:0x9c774b, roughness:.95, side:T.DoubleSide}),
      gold: phys({color:0xbfa162, metalness:.87, roughness:.23, clearcoat:.2}),
      chrome: phys({color:0xc6d0d1, metalness:.90, roughness:.22}),
      pearl: phys({color:0xdedbc5, metalness:.25, roughness:.23, iridescence:.5, iridescenceIOR:1.34, iridescenceThicknessRange:[120,310]}),
      guard: phys({map:tortoiseTexture(), roughness:.25, clearcoat:.85, clearcoatRoughness:.15, color:0xd7b79a}),
    };
    const add = (g, material, parent = root, name = '') => {
      const m = new T.Mesh(g, material); parent.add(m); m.name = name;
      m.castShadow = true; m.receiveShadow = true; return m;
    };
    const box = (w,h,d,x,y,z,material,parent=root) => {
      const m=add(new T.BoxGeometry(w,h,d), material, parent); m.position.set(x,y,z); return m;
    };
    const ball = (x,y,z,sx,sy,sz,material,parent=root) => {
      const m=add(new T.SphereGeometry(1,20,12), material, parent); m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m;
    };
    function rod(a, b, radius, material, parent=root, segments=10, radiusEnd=radius) {
      const delta=b.clone().sub(a), length=delta.length();
      const m=add(new T.CylinderGeometry(radiusEnd,radius,length,segments,1),material,parent);
      m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;
    }
    function tube(points,radius,material,parent=root,closed=false,steps=64,sides=6) {
      const curve=new T.CatmullRomCurve3(points,closed,'centripetal');
      return add(new T.TubeGeometry(curve,steps,radius,sides,closed),material,parent);
    }
    function planarUV(g) {
      g.computeBoundingBox(); const b=g.boundingBox, p=g.attributes.position, uv=g.attributes.uv;
      for(let i=0;i<p.count;i++) uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x || 1),(p.getY(i)-b.min.y)/(b.max.y-b.min.y || 1));
      uv.needsUpdate=true;return g;
    }
    function slab(shape,thickness,z,material,parent=root,bevel=0) {
      const g=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,steps:1,curveSegments:36});
      planarUV(g);const m=add(g,material,parent);m.position.z=z;return m;
    }
    function bodyOutline() {
      const s=new T.Shape();s.moveTo(0,-3.76);
      s.bezierCurveTo(1.10,-3.78,1.90,-3.28,1.90,-2.44);
      s.bezierCurveTo(1.90,-1.90,1.55,-1.47,1.12,-1.03);
      s.bezierCurveTo(.96,-.87,.97,-.58,1.18,-.33);
      s.bezierCurveTo(1.40,-.09,1.52,.16,1.36,.49);
      s.bezierCurveTo(1.12,.91,.65,1.04,0,1.04);
      s.bezierCurveTo(-.65,1.04,-1.12,.91,-1.36,.49);
      s.bezierCurveTo(-1.52,.16,-1.40,-.09,-1.18,-.33);
      s.bezierCurveTo(-.97,-.58,-.96,-.87,-1.12,-1.03);
      s.bezierCurveTo(-1.55,-1.47,-1.90,-1.90,-1.90,-2.44);
      s.bezierCurveTo(-1.90,-3.28,-1.10,-3.78,0,-3.76);s.closePath();return s;
    }
    const outline=bodyOutline(), contour=outline.getSpacedPoints(280).slice(0,-1);
    const holeY=-.56,holeR=.525,topZ=.543;
    const top=bodyOutline(),hole=new T.Path();hole.absarc(0,holeY,holeR,0,TAU,true);top.holes.push(hole);
    slab(top,.042,.486,mat.top,root,.014).name='Spruce soundboard with open sound hole';
    slab(bodyOutline(),.045,-.555,mat.back,root,.012).name='Rosewood back';
    const insideBack=add(planarUV(new T.ShapeGeometry(bodyOutline(),36)),mat.inner);insideBack.position.z=-.494;

    // Hollow sides: two open contour rings, with no solid fill across the body.
    const sidePositions=[],sideUV=[],sideIndices=[];
    for(let i=0;i<=contour.length;i++) {
      const p=contour[i%contour.length];
      sidePositions.push(p.x,p.y,-.516,p.x,p.y,.510);
      sideUV.push(i/contour.length,0,i/contour.length,1);
      if(i<contour.length){const j=i*2;sideIndices.push(j,j+2,j+1,j+2,j+3,j+1);}
    }
    const sideGeo=new T.BufferGeometry();sideGeo.setAttribute('position',new T.Float32BufferAttribute(sidePositions,3));sideGeo.setAttribute('uv',new T.Float32BufferAttribute(sideUV,2));sideGeo.setIndex(sideIndices);sideGeo.computeVertexNormals();
    add(sideGeo,mat.side).name='Hollow rosewood sides';
    function edge(inset,z,radius,material) {
      const pts=contour.map((p,i)=>{
        const before=contour[(i+contour.length-1)%contour.length],after=contour[(i+1)%contour.length];
        const tangent=after.clone().sub(before).normalize();
        return V(p.x-tangent.y*inset,p.y+tangent.x*inset,z);
      });
      return tube(pts,radius,material,root,true,420,6);
    }
    edge(.005,.515,.029,mat.bone);edge(.013,-.537,.027,mat.bone);
    edge(.040,topZ,.008,mat.dark);edge(.065,topZ,.010,mat.bone);edge(.085,topZ,.006,mat.dark);
    edge(.051,-.560,.008,mat.dark);edge(.067,-.560,.006,mat.bone);
    // End graft and bookmatched back centre strip.
    box(.043,4.61,.010,0,-1.31,-.572,mat.bone);
    box(.010,4.61,.012,-.037,-1.31,-.573,mat.dark);box(.010,4.61,.012,.037,-1.31,-.573,mat.dark);
    box(.061,.016,.94,0,-3.763,-.025,mat.bone);
    rod(V(0,-3.78,-.045),V(0,-3.87,-.045),.050,mat.chrome,root,20,.068);

    // Ring inlays are real geometry, including an alternating mosaic band.
    function ring(inner,outer,material,z=topZ+.004) {
      const m=add(new T.RingGeometry(inner,outer,128),material);m.position.set(0,holeY,z);return m;
    }
    ring(.525,.535,mat.dark);ring(.535,.548,mat.bone);ring(.550,.571,mat.dark);ring(.572,.585,mat.bone);
    const mosaic=new T.RingGeometry(.587,.635,144,1),colors=[],pos=mosaic.attributes.position;
    const palette=[0x513a1e,0xcfb57c,0x8c6536,0xe1d5aa].map(c=>new T.Color(c));
    for(let i=0;i<pos.count;i++){
      const theta=Math.atan2(pos.getY(i),pos.getX(i));const c=palette[((Math.floor((theta+Math.PI)/TAU*144)%4)+4)%4];colors.push(c.r,c.g,c.b);
    }
    mosaic.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const mosaicMesh=add(mosaic,new T.MeshStandardMaterial({vertexColors:true,roughness:.38}));mosaicMesh.position.set(0,holeY,topZ+.006);
    ring(.637,.649,mat.bone);ring(.651,.662,mat.dark);ring(.664,.671,mat.bone);
    const lip=add(new T.CylinderGeometry(holeR,holeR,.066,96,1,true),new T.MeshStandardMaterial({color:0x7a4f29,roughness:.83,side:T.DoubleSide}));lip.rotation.x=Math.PI/2;lip.position.set(0,holeY,.510);
    // A real cavity, with braces on its underside and a paper maker's label.
    rod(V(-1.29,-2.72,.39),V(.76,-.73,.39),.047,mat.inner,root,6);
    rod(V(1.29,-2.72,.39),V(-.76,-.73,.39),.047,mat.inner,root,6);
    box(2.10,.073,.11,0,.29,.41,mat.inner);
    box(.090,.64,.10,-.64,-.44,.41,mat.inner);box(.090,.64,.10,.64,-.44,.41,mat.inner);
    const labelTex=canvasTexture(512,256,(ctx,w,h)=>{
      ctx.fillStyle='#c8af80';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#695436';ctx.lineWidth=3;ctx.strokeRect(14,14,w-28,h-28);
      ctx.textAlign='center';ctx.fillStyle='#4a3825';ctx.font='54px Georgia, serif';ctx.fillText('ATELIER',w/2,108);
      ctx.font='21px Georgia, serif';ctx.fillText('ACOUSTIC  ·  No. 01',w/2,151);ctx.font='15px Georgia, serif';ctx.fillText('SPRUCE  /  ROSEWOOD',w/2,190);
    });
    const label=add(new T.PlaneGeometry(.84,.42),new T.MeshStandardMaterial({map:labelTex,roughness:1}));label.position.set(0,-.59,-.487);

    // Tortoiseshell pickguard follows the sound-hole arc.
    const guard=new T.Shape();guard.moveTo(.61,-.18);
    guard.bezierCurveTo(.98,-.38,1.28,-.97,1.14,-1.42);
    guard.bezierCurveTo(.98,-1.83,.42,-1.83,.29,-1.35);
    guard.bezierCurveTo(.27,-1.27,.25,-1.21,.25,-1.20);
    guard.bezierCurveTo(.70,-1.05,.88,-.62,.61,-.18);guard.closePath();
    slab(guard,.008,topZ+.002,mat.guard,root,.005).name='Tortoiseshell pickguard';

    // Carved bridge, compensated bone saddle, six individual bridge pins.
    const bridge=new T.Shape();bridge.moveTo(-.76,-2.22);
    bridge.bezierCurveTo(-.92,-2.20,-.95,-1.91,-.79,-1.85);
    bridge.bezierCurveTo(-.57,-1.85,-.40,-1.78,-.32,-1.76);
    bridge.lineTo(.32,-1.76);bridge.bezierCurveTo(.40,-1.78,.57,-1.85,.79,-1.85);
    bridge.bezierCurveTo(.95,-1.91,.92,-2.20,.76,-2.22);
    bridge.bezierCurveTo(.40,-2.21,-.40,-2.21,-.76,-2.22);bridge.closePath();
    slab(bridge,.077,topZ+.005,mat.ebony,root,.025).name='Carved ebony bridge';
    const saddle=box(.688,.043,.083,0,-1.856,.661,mat.bone);saddle.rotation.z=.045;
    const pinXs=[-.285,-.171,-.057,.057,.171,.285];
    pinXs.forEach(x=>{
      rod(V(x,-2.091,.638),V(x,-2.091,.684),.027,mat.bone,root,16,.041);
      ball(x,-2.091,.687,.040,.040,.019,mat.bone);
      ball(x,-2.091,.704,.013,.013,.003,mat.dark);
    });

    // D-profile mahogany neck. The top closes under the ebony fingerboard.
    const neckP=[],neckUV=[],neckI=[],rows=28,cols=28;
    for(let row=0;row<=rows;row++){
      const t=row/rows,y=1.00+t*3.42,half=.302*(1-t)+.218*t,depth=.325*(1-t)+.245*t;
      for(let k=0;k<=cols;k++){
        const a=k/cols*Math.PI;neckP.push(Math.cos(a)*half,y,.601-Math.sin(a)*depth);neckUV.push(k/cols,t);
        if(row<rows&&k<cols){const j=row*(cols+1)+k;neckI.push(j,j+1,j+cols+1,j+1,j+cols+2,j+cols+1);}
      }
    }
    const ng=new T.BufferGeometry();ng.setAttribute('position',new T.Float32BufferAttribute(neckP,3));ng.setAttribute('uv',new T.Float32BufferAttribute(neckUV,2));ng.setIndex(neckI);ng.computeVertexNormals();
    add(ng,mat.neck).name='Shaped mahogany neck';
    // Heel joins the neck to the body; its profile narrows toward the back.
    const heelPositions=[],heelUV=[],heelIndices=[];
    const heelLevels=[[.56,.08,.04,.55],[.67,.16,-.32,.59],[.88,.27,-.39,.60],[1.12,.292,.03,.60],[1.38,.28,.26,.60]];
    for(let r=0;r<heelLevels.length;r++){
      const [y,hw,back,front]=heelLevels[r];
      for(let j=0;j<=32;j++){
        const a=j/32*TAU;heelPositions.push(Math.cos(a)*hw,y,(front+back)/2+Math.sin(a)*(front-back)/2);heelUV.push(j/32,r/(heelLevels.length-1));
        if(r<heelLevels.length-1&&j<32){const k=r*33+j;heelIndices.push(k,k+33,k+1,k+1,k+33,k+34);}
      }
    }
    const hg=new T.BufferGeometry();hg.setAttribute('position',new T.Float32BufferAttribute(heelPositions,3));hg.setAttribute('uv',new T.Float32BufferAttribute(heelUV,2));hg.setIndex(heelIndices);hg.computeVertexNormals();add(hg,mat.neck);
    ball(0,.67,-.325,.153,.068,.04,mat.bone);

    const board=new T.Shape();board.moveTo(-.329,.052);board.lineTo(.329,.052);board.lineTo(.230,4.42);board.lineTo(-.230,4.42);board.closePath();
    slab(board,.070,.600,mat.ebony,root,.010).name='Ebony fingerboard';
    const boardHalf=y=>.230+(4.42-y)/4.368*.099;
    [-1,1].forEach(s=>rod(V(s*.331,.062,.642),V(s*.231,4.42,.642),.011,mat.bone));
    const nut=box(.477,.061,.080,0,4.433,.680,mat.bone);
    const nutY=4.42,scaleLength=6.30;
    const frets=[nutY];
    root.userData.fretGeometry={nutY,scaleLength,frets};
    for(let fret=1;fret<=20;fret++){
      const y=nutY-scaleLength*(1-Math.pow(2,-fret/12)),half=boardHalf(y)-.007;frets.push(y);
      tube([V(-half,y,.682),V(0,y,.694),V(half,y,.682)],.0105,mat.chrome,root,false,14,8).name='Fret '+fret;
    }
    [3,5,7,9,12,15,17,19].forEach(n=>{
      const y=(frets[n]+frets[n-1])/2,xs=n===12?[-.092,.092]:[0];
      xs.forEach(x=>{
        const g=new T.CircleGeometry(.041,24),m=add(g,mat.pearl);m.position.set(x,y,.681);
      });
      const side=add(new T.CircleGeometry(.014,12),mat.bone);side.rotation.y=-Math.PI/2;side.position.set(-boardHalf(y)-.007,y,.638);
    });

    // Angled, solid headstock with six complete tuning machines.
    const head=new T.Group();head.name='Angled headstock';head.position.set(0,4.46,.652);head.rotation.x=-.205;root.add(head);
    function headOutline(){
      const h=new T.Shape();h.moveTo(-.225,0);h.bezierCurveTo(-.24,.20,-.34,.37,-.356,.55);h.lineTo(-.353,1.35);
      h.bezierCurveTo(-.354,1.44,-.31,1.485,-.22,1.47);h.bezierCurveTo(-.10,1.44,-.055,1.43,0,1.43);
      h.bezierCurveTo(.055,1.43,.10,1.44,.22,1.47);h.bezierCurveTo(.31,1.485,.354,1.44,.353,1.35);h.lineTo(.356,.55);
      h.bezierCurveTo(.34,.37,.24,.20,.225,0);h.closePath();return h;
    }
    slab(headOutline(),.175,-.167,mat.neck,head,.012);slab(headOutline(),.019,.009,mat.back,head,.006);
    tube(headOutline().getSpacedPoints(100).slice(0,-1).map(p=>V(p.x,p.y,.027)),.012,mat.bone,head,true,180,6);
    // Tiny original pearl diamond and paired leaves.
    const logo=new T.Shape();logo.moveTo(0,1.045);logo.lineTo(.042,1.117);logo.lineTo(0,1.19);logo.lineTo(-.042,1.117);logo.closePath();
    slab(logo,.002,.034,mat.pearl,head);
    [-1,1].forEach(s=>{
      const leaf=new T.Shape();leaf.moveTo(0,.97);leaf.bezierCurveTo(s*.11,1.00,s*.12,1.10,s*.055,1.09);leaf.bezierCurveTo(s*.022,1.065,s*.035,1.00,0,.97);
      slab(leaf,.002,.034,mat.pearl,head);
    });
    const truss=new T.Shape();truss.moveTo(-.07,.065);truss.lineTo(.07,.065);truss.quadraticCurveTo(.065,.27,0,.30);truss.quadraticCurveTo(-.065,.27,-.07,.065);
    slab(truss,.013,.030,mat.ebony,head,.006);
    [0.11,.247].forEach(y=>{const screw=rod(V(0,y,.047),V(0,y,.053),.015,mat.chrome,head,12);box(.019,.003,.001,0,y,.057,mat.dark,head);});
    const postLocations=[];
    for(let i=0;i<6;i++){
      const side=i<3?-1:1,row=i<3?i:5-i,x=side*.249,y=.444+row*.345;
      postLocations.push(V(x,y,.151));
      // Back gearbox, screw and horizontal worm shaft.
      const housing=box(.147,.215,.076,x,y,-.211,mat.gold,head);
      ball(x,y-.071,-.254,.024,.024,.009,mat.chrome,head);
      box(.027,.004,.002,x,y-.071,-.264,mat.dark,head);
      rod(V(x,y,-.220),V(side*.485,y,-.220),.026,mat.gold,head,12);
      ball(side*.517,y,-.220,.081,.103,.037,mat.bone,head);
      rod(V(side*.517,y,-.263),V(side*.517,y,-.259),.015,mat.gold,head,12);
      // Face bushing and post; the wire wraps around this actual cylinder.
      rod(V(x,y,.030),V(x,y,.054),.069,mat.gold,head,24);
      rod(V(x,y,.055),V(x,y,.071),.055,mat.chrome,head,24);
      rod(V(x,y,.058),V(x,y,.165),.029,mat.chrome,head,20);
      rod(V(x,y,.165),V(x,y,.172),.034,mat.chrome,head,16);
      const winding=[];for(let j=0;j<=90;j++){const a=j/90*TAU*3.4;winding.push(V(x+Math.cos(a)*.032,y+Math.sin(a)*.032,.086+j/90*.065));}
      tube(winding,.0035,i<3?mat.gold:mat.chrome,head,false,110,5);
    }
    root.updateMatrixWorld(true);
    const windingTex=canvasTexture(8,64,(ctx,w,h)=>{
      for(let y=0;y<h;y++){const light=150+Math.sin(y/h*TAU)*55;ctx.fillStyle=`rgb(${light},${light},${light})`;ctx.fillRect(0,y,w,1);}
    });windingTex.wrapS=windingTex.wrapT=T.RepeatWrapping;windingTex.repeat.set(1,630);
    const wound=new T.MeshStandardMaterial({color:0xc8ac78,metalness:.87,roughness:.32,map:windingTex,bumpMap:windingTex,bumpScale:.0006});
    const radii=[.0063,.0052,.0042,.0033,.0025,.0021];
    const stringNames=['E2','A2','D3','G3','B3','E4'];
    root.userData.playableStrings=[];
    function makePlayableString(a,b,radius,material,index){
      const points=[];
      for(let j=0;j<=10;j++) points.push(a.clone().lerp(b,j/10));
      const mesh=add(new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),40,radius,6,false),material,root);
      mesh.name=stringNames[index]+' playable string';
      root.userData.playableStrings.push({
        mesh,a:a.clone(),b:b.clone(),radius,material,index,phase:0,amp:0,active:false,
        visualHz:7.6+index*.85,decay:3.0+index*.22
      });
      return mesh;
    }
    for(let i=0;i<6;i++){
      const nutX=(i-2.5)*.072,bridgeX=pinXs[i];
      const saddleY=-1.856+bridgeX*.045,nutPoint=V(nutX,4.439,.728),saddlePoint=V(bridgeX,saddleY,.707);
      const material=i<4?wound:mat.chrome;
      makePlayableString(saddlePoint,nutPoint,radii[i],material,i);
      rod(V(bridgeX,-2.065,.650),saddlePoint,radii[i],material,root,8);
      const toPost=head.localToWorld(postLocations[i].clone());
      rod(nutPoint,toPost,radii[i],material,root,8);
      // Small dark slots make it clear that the strings sit in the nut.
      box(.010,.064,.003,nutX,4.433,.721,mat.dark);
    }
    return root;
  }

