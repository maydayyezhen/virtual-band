'use strict';
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
  shape.lineTo(-.32,.40);
  shape.bezierCurveTo(-.43,.29,-.49,.50,-.47,.78);
  shape.bezierCurveTo(-.44,1.11,-.56,1.46,-.76,1.43);
  shape.bezierCurveTo(-1.00,1.42,-1.09,.86,-1.15,.49);
  shape.bezierCurveTo(-1.19,.02,-1.49,-.29,-1.57,-.87);
  shape.bezierCurveTo(-1.73,-1.59,-1.60,-2.52,-1.20,-2.93);
  shape.bezierCurveTo(-.89,-3.20,-.48,-3.25,-.10,-3.22);shape.closePath();
  const body=slab(shape,.36,-.18,mat.paint,root,.065,7);body.name='Deep marine metallic double-cut body';
  // A narrow cream pinstripe follows the rounded face, with no floating decal.
  wire(shape.getSpacedPoints(220).slice(0,-1).map(p=>V(p.x,p.y,.251)),.0085,mat.bone,root,280,6,true);
  const guard=new T.Shape();guard.moveTo(-.33,.31);guard.lineTo(.33,.31);guard.lineTo(.33,-.40);
  guard.bezierCurveTo(.35,-.61,.64,-.54,.66,-.83);guard.lineTo(.67,-1.69);
  guard.bezierCurveTo(.69,-1.96,.40,-2.06,.09,-2.06);
  guard.bezierCurveTo(-.52,-2.11,-1.14,-1.83,-1.24,-1.36);
  guard.bezierCurveTo(-1.40,-.74,-1.06,-.25,-.98,.18);
  guard.bezierCurveTo(-.95,.58,-.84,1.05,-.71,1.10);
  guard.bezierCurveTo(-.62,1.09,-.74,.52,-.63,.31);
  guard.bezierCurveTo(-.53,.15,-.41,.13,-.33,.31);guard.closePath();
  slab(guard,.006,.251,mat.guard,root,.002);
  slab(guard,.006,.258,mat.guardEdge,root,.001);
  slab(guard,.009,.265,mat.guard,root,.002);
  [[-.71,.94],[-.98,-.10],[-1.16,-.72],[-1.13,-1.35],[-.71,-1.82],[-.06,-1.96],[.53,-1.78],[.56,-1.04],[.45,-.55],[-.39,.15]].forEach(([x,y])=>screw(x,y,.278,root,.019));
  function pickup(y,covered){
    const g=new T.Group();g.position.set(0,y,.273);g.name=covered?'Neck humbucker / nickel cover':'Bridge humbucker / zebra coils';root.add(g);
    roundBox(.92,.39,.025,.035,0,0,0,mat.black,g,.004);
    if(covered){roundBox(.765,.307,.068,.033,0,0,.029,mat.satin,g,.008);}
    else for(const s of [-1,1]){roundBox(.768,.149,.070,.027,0,s*.079,.029,s===1?mat.bone:mat.black,g,.006);}
    for(let i=0;i<6;i++){
      const x=(i-2.5)/5*.473;
      rod(V(x,covered?.075:.080,.096),V(x,covered?.075:.080,.102),.019,mat.chrome,g,16);
      box(.024,.003,.001,x,.080,.103,mat.black,g);
      if(!covered)rod(V(x,-.080,.097),V(x,-.080,.103),.018,mat.satin,g,16);
    }
    [-.421,.421].forEach(x=>screw(x,0,.036,g,.021));
  }
  pickup(-.78,true);pickup(-1.58,false);
  const bridge=new T.Group();bridge.name='Two-post tremolo with six saddles';root.add(bridge);
  roundBox(.92,.60,.037,.038,0,-2.34,.250,mat.chrome,bridge,.006);
  roundBox(.89,.065,.070,.012,0,-2.60,.285,mat.satin,bridge,.003);
  for(const x of [-.396,.396]){rod(V(x,-2.065,.256),V(x,-2.065,.310),.047,mat.chrome,bridge,24);screw(x,-2.065,.315,bridge,.028);}
  const bridgeXs=[],nutXs=[],radii=[.0071,.0058,.0045,.0032,.0027,.0023];
  for(let i=0;i<6;i++){
    const x=(i-2.5)/5*.505;bridgeXs.push(x);nutXs.push((i-2.5)/5*.347);
    const y=bridgeY-[.040,.030,.019,.028,.014,0][i];
    roundBox(.071,.242,.074,.011,x,y-.053,.308,mat.satin,bridge,.005);
    rod(V(x-.031,bridgeY,.399),V(x+.031,bridgeY,.399),.020,mat.chrome,bridge,24);
    [-.024,.024].forEach(dx=>{rod(V(x+dx,y+.021,.372),V(x+dx,y+.021,.401),.006,mat.screw,bridge,8);disk(x+dx,y+.021,.4015,.004,mat.black,bridge);});
    rod(V(x,y-.079,.345),V(x,-2.616,.345),.007,mat.chrome,bridge,10);
    const spring=[];for(let j=0;j<=45;j++){const a=j/45*TAU*5;spring.push(V(x+Math.cos(a)*.015,-2.56+j/45*.155,.345+Math.sin(a)*.015));}wire(spring,.0026,mat.satin,bridge,55,5);
    disk(x,-2.515,.292,.016,mat.black,bridge);
    rod(V(x,-2.515,.294),V(x,bridgeY,.421+radii[i]),radii[i],mat.string,bridge,8);
  }
  const tremolo=new T.Group();tremolo.position.set(.383,-2.42,.315);tremolo.userData.dynamic=true;root.add(tremolo);
  wire([V(0,0,0),V(.11,.17,.13),V(.29,.60,.18),V(.33,.80,.18)],.015,mat.chrome,tremolo,36,10);
  rod(V(.30,.66,.18),V(.337,.84,.18),.029,mat.bone,tremolo,18,.024);
  ring(.383,-2.42,.314,.019,.045,mat.satin);controls.tremolo=tremolo;
  function knob(id,x,y){
    const g=new T.Group();g.position.set(x,y,.258);g.userData.dynamic=true;g.userData.control=id;g.name=id;root.add(g);
    ring(0,0,0,.053,.111,mat.black,g);
    rod(V(0,0,.014),V(0,0,.105),.091,mat.brass,g,64,.086);disk(0,0,.106,.086,mat.brass,g);ring(0,0,.108,.075,.086,mat.satin,g);
    for(let j=0;j<40;j++){const a=j/40*TAU;rod(V(Math.cos(a)*.091,Math.sin(a)*.091,.025),V(Math.cos(a)*.086,Math.sin(a)*.086,.094),.0018,mat.satin,g,5);}
    box(.006,.032,.002,0,.052,.109,mat.black,g);controls[id]={group:g,value:id==='volume'?.80:.66};
    label(id==='volume'?'VOLUME':'TONE',.26,.054,x,y-.181,.250,root,'#d4d2c5');
  }
  knob('volume',.956,-1.42);knob('tone',1.09,-2.01);
  ring(.903,-.73,.260,.019,.083,mat.satin);
  const selector=new T.Group();selector.position.set(.903,-.73,.267);selector.userData.dynamic=true;selector.userData.control='pickup';root.add(selector);
  rod(V(0,0,.01),V(0,0,.159),.015,mat.chrome,selector,16);ball(0,0,.182,.037,.037,.071,mat.bone,selector);controls.pickup={group:selector,value:1};
  label('RHYTHM / LEAD',.41,.050,.915,-.946,.250,root,'#d4d2c5');
  // Neck heel and rear cavity details remain visible when the model is turned.
  roundBox(.56,.61,.029,.044,0,.132,-.277,mat.chrome,root,.004);
  [-.202,.202].forEach(x=>[-.09,.35].forEach(y=>screw(x,y,-.283,root,.029,true)));
  label('ATELIER / 05',.33,.07,0,.13,-.285,root,'#29383e',true);
  roundBox(.97,1.16,.018,.078,0,-2.0,-.264,mat.black,root,.003);
  [-.40,.40].forEach(x=>[-2.46,-1.54].forEach(y=>screw(x,y,-.269,root,.018,true)));
  for(let i=0;i<6;i++){const slot=roundBox(.032,.31,.002,.015,(i-2.5)*.10,-2.07,-.269,mat.rubber,root,.001);}
  roundBox(.51,1.18,.016,.14,1.02,-1.65,-.262,mat.black,root,.003);
  [V(1.02,-1.16,-.268),V(1.02,-2.12,-.268)].forEach(v=>screw(v.x,v.y,v.z,root,.018,true));
  rod(V(-.755,1.45,-.02),V(-.78,1.572,-.02),.029,mat.chrome,root,20,.055);
  rod(V(-.09,-3.268,-.02),V(-.09,-3.392,-.02),.029,mat.chrome,root,20,.055);
  const boardEnd=nutY-scale*(1-2**(-22.65/12)),boardHalf=y=>.220+clamp((nutY-y)/(nutY-boardEnd),0,1)*.109;
  const boardZ=(x,y)=>.366-.011*(x/boardHalf(y))**2;
  const np=[],nu=[],ni=[],neckRows=38,neckSides=24;
  for(let row=0;row<=neckRows;row++){
    const y=.28+(nutY-.28)*row/neckRows,hw=boardHalf(y)-.009,depth=.215+(1-row/neckRows)*.055;
    for(let j=0;j<=neckSides;j++){const a=j/neckSides*Math.PI;np.push(Math.cos(a)*hw,y,.286-Math.sin(a)*depth);nu.push(j/neckSides,row/neckRows);if(row<neckRows&&j<neckSides){const k=row*(neckSides+1)+j;ni.push(k,k+1,k+neckSides+1,k+1,k+neckSides+2,k+neckSides+1);}}
  }
  const ng=new T.BufferGeometry();ng.setAttribute('position',new T.Float32BufferAttribute(np,3));ng.setAttribute('uv',new T.Float32BufferAttribute(nu,2));ng.setIndex(ni);ng.computeVertexNormals();add(ng,mat.maple).name='Carved maple neck';
  wire([V(0,.45,.025),V(0,1.5,.044),V(0,3,.061),V(0,4.17,.070)],.012,mat.walnut,root,50,6);
  const fb=new T.Shape();fb.moveTo(-boardHalf(boardEnd),boardEnd);fb.lineTo(boardHalf(boardEnd),boardEnd);fb.lineTo(.22,nutY);fb.lineTo(-.22,nutY);fb.closePath();slab(fb,.069,.286,mat.board);
  const fp=[],fu=[],fi=[];
  for(let row=0;row<=52;row++){const y=boardEnd+(nutY-boardEnd)*row/52;
    for(let j=0;j<=16;j++){const x=(j/16*2-1)*boardHalf(y);fp.push(x,y,boardZ(x,y));fu.push(j/16,row/52);if(row<52&&j<16){const k=row*17+j;fi.push(k,k+1,k+17,k+1,k+18,k+17);}}
  }
  const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute(fp,3));fg.setAttribute('uv',new T.Float32BufferAttribute(fu,2));fg.setIndex(fi);fg.computeVertexNormals();add(fg,mat.board).name='Radiused rosewood fingerboard';
  for(let i=1;i<=22;i++){
    const y=nutY-scale*(1-2**(-i/12)),hw=boardHalf(y)-.004;frets.push(y);
    wire([-1,-.5,0,.5,1].map(q=>V(q*hw,y,boardZ(q*hw,y)+.006)),.0085,mat.chrome,root,20,8).name='Fret '+i;
  }
  [3,5,7,9,12,15,17,19,21].forEach(n=>{
    const y=(frets[n-1]+frets[n])/2,xs=n===12?[-.088,.088]:[0];xs.forEach(x=>disk(x,y,boardZ(x,y)+.0013,.031,mat.pearl));
    const d=disk(-boardHalf(y)-.001,y,.326,.009,mat.bone);d.rotation.y=-Math.PI/2;
  });
  [-1,1].forEach(s=>rod(V(s*boardHalf(boardEnd),boardEnd,.326),V(s*.221,nutY,.326),.0045,mat.bone,root,8));
  roundBox(.456,.053,.083,.008,0,nutY+.015,.317,mat.bone,root,.003);
  nutXs.forEach((x,i)=>box(radii[i]*1.5,.058,.0018,x,nutY+.014,.402,mat.black));
  // Compact three-a-side headstock; each post has a separate, direct string path.
  const head=new T.Group();head.name='3 + 3 locking tuners';head.position.set(0,nutY+.052,.289);head.rotation.x=-.12;root.add(head);
  const hs=new T.Shape();hs.moveTo(-.216,0);hs.bezierCurveTo(-.245,.19,-.46,.25,-.49,.50);hs.lineTo(-.438,1.47);hs.bezierCurveTo(-.421,1.65,-.22,1.72,0,1.60);hs.bezierCurveTo(.22,1.72,.421,1.65,.438,1.47);hs.lineTo(.49,.50);hs.bezierCurveTo(.46,.25,.245,.19,.216,0);hs.closePath();
  slab(hs,.173,-.176,mat.maple,head,.012,5);slab(hs,.008,.005,mat.paint,head,.005,3);
  const logo=canvasTexture(1024,256,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#e7ddc6';c.textAlign='center';c.font='italic 148px Georgia';c.fillText('Atelier',w/2,180);});
  const logomesh=add(new T.PlaneGeometry(.54,.135),new T.MeshStandardMaterial({map:logo,transparent:true,depthWrite:false,roughness:.55,polygonOffset:true,polygonOffsetFactor:-1}),head);logomesh.position.set(0,1.36,.023);logomesh.castShadow=false;
  label('V O L T  /  0 5',.40,.054,0,1.215,.023,head,'#afb8bc');
  const truss=new T.Shape();truss.moveTo(-.080,.12);truss.lineTo(.080,.12);truss.lineTo(.057,.32);truss.quadraticCurveTo(0,.39,-.057,.32);truss.closePath();slab(truss,.012,.020,mat.black,head,.004);screw(0,.16,.041,head,.012);
  const posts=[];
  for(let i=0;i<6;i++){
    const side=i<3?-1:1,row=i<3?i:5-i,x=side*(.342-row*.017),y=.48+row*.292;
    posts.push(V(x,y,.119));
    roundBox(.19,.238,.045,.034,x,y,-.215,mat.satin,head,.005);screw(x,y-.078,-.222,head,.015,true);
    rod(V(x,y,-.217),V(x+side*.219,y,-.217),.021,mat.chrome,head,12);
    const key=ball(x+side*.255,y,-.218,.089,.064,.034,mat.chrome,head);key.rotation.z=side*.17;
    rod(V(x,y,.020),V(x,y,.043),.055,mat.chrome,head,24);rod(V(x,y,.043),V(x,y,.136),.028,mat.satin,head,24);disk(x,y,.137,.010,mat.black,head);
    const winding=[];for(let j=0;j<=65;j++){const a=j/65*TAU*2.6;winding.push(V(x+Math.cos(a)*(.029+radii[i]*.5),y+Math.sin(a)*(.029+radii[i]*.5),.064+j/65*.057));}wire(winding,radii[i]*.80,mat.string,head,70,6);
  }
  root.updateMatrixWorld(true);
  for(let i=0;i<6;i++){
    const nut=V(nutXs[i],nutY+.016,.404+radii[i]),saddle=V(bridgeXs[i],bridgeY,.421+radii[i]);
    rod(nut,head.localToWorld(posts[i].clone()),radii[i],mat.string,root,8);
    const rows=112,sides=7,positions=new Float32Array((rows+1)*(sides+1)*3),normals=new Float32Array(positions.length),uv=new Float32Array((rows+1)*(sides+1)*2),indices=[];
    for(let row=0;row<=rows;row++)for(let j=0;j<=sides;j++){const k=row*(sides+1)+j,a=j/sides*TAU;normals.set([Math.cos(a),0,Math.sin(a)],k*3);uv.set([j/sides,row/rows],k*2);if(row<rows&&j<sides)indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(indices);
    const sm=mat.string.clone(),mesh=add(g,sm,root,'String '+(6-i));mesh.userData.dynamic=true;mesh.userData.string=6-i;mesh.frustumCulled=false;
    const marker=ball(0,0,0,.033,.044,.013,mat.active);marker.visible=false;marker.userData.dynamic=true;marker.castShadow=false;marker.renderOrder=1;
    strings.set(6-i,{number:6-i,openNote:ELECTRIC_TUNING[i],mesh,marker,nut,saddle,radius:radii[i],rows,sides,energy:0,phase:0,note:null,fret:0,amount:0,target:0,held:false,released:true,age:0});
  }
  const pick=new T.Group();pick.name='Animated plectrum';pick.userData.dynamic=true;root.add(pick);
  const ps=new T.Shape();ps.moveTo(-.075,.071);ps.quadraticCurveTo(0,.13,.075,.071);ps.quadraticCurveTo(.080,.024,0,-.099);ps.quadraticCurveTo(-.080,.024,-.075,.071);ps.closePath();slab(ps,.012,0,mat.bone,pick,.004);pick.position.set(.10,-1.13,.535);pick.visible=false;
  // A compact A-frame stand and a loose lead give the instrument a stage base.
  for(const s of [-1,1]){
    rod(V(s*.72,-3.49,.42),V(s*.24,-.89,-.56),.037,mat.black,root,14);
    rod(V(s*.72,-3.49,.42),V(s*.65,-3.49,-.92),.034,mat.black,root,14);
    for(const z of [.43,-.93])ball(s*(z>0?.72:.65),-3.49,z,.075,.061,.082,mat.rubber);
    wire([V(s*.46,-3.16,-.56),V(s*.56,-3.23,-.03),V(s*.61,-3.13,.34),V(s*.61,-3.00,.36)],.045,mat.black,root,30,10);
    wire([V(s*.57,-3.20,-.10),V(s*.61,-3.13,.32),V(s*.61,-3.04,.36)],.066,mat.rubber,root,24,10);
  }
  rod(V(-.63,-3.26,-.57),V(.63,-3.26,-.57),.030,mat.black);rod(V(-.24,-.89,-.56),V(.24,-.89,-.56),.038,mat.black);
  ball(0,-.89,-.346,.27,.12,.10,mat.rubber);
  rod(V(1.51,-2.37,-.025),V(1.667,-2.41,-.025),.047,mat.chrome,root,20);rod(V(1.66,-2.41,-.025),V(1.82,-2.46,-.025),.045,mat.rubber,root,16);
  wire([V(1.81,-2.46,-.025),V(2.0,-2.85,.03),V(1.76,-3.49,.38),V(1.14,-3.50,.89),V(1.61,-3.50,1.21),V(2.34,-3.50,.75),V(2.02,-3.50,.38),V(1.66,-3.50,.93),V(2.80,-3.50,.96)],.021,mat.rubber,root,120,8);
  // Merge only static meshes. Strings, position markers, controls and pick
  // keep their own geometry for animation and picking.
  function batch(group){
    root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
    function visit(o){if(o.userData.dynamic)return;if(o.isMesh){const key=o.material.uuid+':'+o.castShadow+':'+o.receiveShadow;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);}for(const c of o.children)visit(c);}
    for(const o of group.children)visit(o);
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;const p=[],n=[],u=[];
      for(const m of meshes){const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inv.clone().multiply(m.matrixWorld));for(const v of g.attributes.position.array)p.push(v);for(const v of g.attributes.normal.array)n.push(v);for(const v of g.attributes.uv.array)u.push(v);g.dispose();}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.computeBoundingSphere();
      const m=add(g,meshes[0].material,group,'Merged hardware');m.castShadow=meshes[0].castShadow;m.receiveShadow=meshes[0].receiveShadow;meshes.forEach(o=>o.removeFromParent());
    }
  }
  for(const id of ['volume','tone','pickup'])batch(controls[id].group);batch(tremolo);batch(pick);batch(root);
  return {root,strings,controls,pick,frets,nutY,scale,bridgeY,boardZ,boardHalf};
}
function createElectricController(model,hooks={}){
  const voices=[...model.strings.values()];let clock=0,pending=[],pickAge=10,pickString=6,bend=0,wantBend=0,sustain=false,channel=3,dirty=true;
  const midiByte=v=>Number.isInteger(v)&&v>=0&&v<=127;
  const validFret=f=>Number.isInteger(f)&&f>=0&&f<=22;
  function wake(){dirty=true;hooks.wake?.();}
  function noteOn(note,velocity=100,stringNumber=null){
    if(!midiByte(note)||!midiByte(velocity)||note<40||note>86)return false;
    if(stringNumber!==null&&(!Number.isInteger(stringNumber)||!model.strings.has(stringNumber)))return false;
    if(!velocity)return noteOff(note);
    const eligible=voices.filter(s=>validFret(note-s.openNote)&&(stringNumber===null||s.number===stringNumber));if(!eligible.length)return false;
    let s=eligible.find(s=>s.held&&s.note===note);
    if(!s)s=eligible.sort((a,b)=>{
      const score=s=>(s.held?80:0)+(note-s.openNote)*.5+Math.abs(note-s.openNote-s.fret)*.075+s.energy*.4;
      return score(a)-score(b);
    })[0];
    s.note=note;s.fret=note-s.openNote;s.held=true;s.released=false;s.target=s.fret?1:0;s.phase=0;s.energy=Math.min(1.12,s.energy*.19+(velocity/127)**.72);s.age=clock;
    pickAge=0;pickString=s.number;hooks.onHit?.({note,velocity,string:s.number,fret:s.fret});wake();return {string:s.number,fret:s.fret,note};
  }
  function noteOff(note){
    if(!midiByte(note)||note<40||note>86)return false;
    for(const s of voices)if(s.note===note&&s.held){s.held=false;s.released=!sustain;if(!sustain)s.target=0;}
    wake();return true;
  }
  function pluck(stringNumber,velocity=100,fret=0){
    const s=model.strings.get(stringNumber);if(!s||!validFret(fret))return false;return noteOn(s.openNote+fret,velocity,stringNumber);
  }
  function strum(frets=[0,2,2,1,0,0],velocity=100,direction='down'){
    if(!Array.isArray(frets)||frets.length!==6||!frets.every(f=>f===null||validFret(f))||!midiByte(velocity)||!['down','up'].includes(direction))return false;
    if(!velocity)return allNotesOff();
    pending=[];for(const s of voices){s.held=false;s.released=true;s.target=0;}
    const order=direction==='down'?[0,1,2,3,4,5]:[5,4,3,2,1,0];
    let n=0;for(const i of order)if(frets[i]!==null)pending.push({time:clock+n++*.025,string:6-i,fret:frets[i],velocity:Math.max(1,velocity-Math.min(i*2,10))});wake();return true;
  }
  function allNotesOff(){pending=[];for(const s of voices){s.held=false;s.released=true;s.target=0;}wake();return true;}
  function panic(){
    pending=[];sustain=false;pickAge=10;wantBend=bend=0;
    for(const s of voices){s.note=null;s.held=false;s.released=true;s.energy=0;s.amount=s.target=0;s.phase=0;}
    hooks.onPanic?.();wake();return true;
  }
  function setPitchBend(value){if(!Number.isFinite(value)||value<-1||value>1)return false;wantBend=value;wake();return true;}
  function setControl(id,value){
    if(id==='pickup'){if(!Number.isInteger(value)||value<0||value>2)return false;model.controls.pickup.value=value;model.controls.pickup.group.rotation.x=(value-1)*.26;}
    else if(id==='volume'||id==='tone'){if(!Number.isFinite(value)||value<0||value>1)return false;model.controls[id].value=value;model.controls[id].group.rotation.z=(value-.5)*Math.PI*1.45;}
    else return false;wake();return true;
  }
  function controlChange(cc,value){
    if(!midiByte(cc)||!midiByte(value))return false;
    if(cc===64){sustain=value>=64;if(!sustain)for(const s of voices)if(!s.held){s.released=true;s.target=0;}wake();return true;}
    if(cc===7)return setControl('volume',value/127);
    if(cc===74)return setControl('tone',value/127);
    if(cc===120)return panic();if(cc===123)return allNotesOff();if(cc===121){sustain=false;setPitchBend(0);for(const s of voices)if(!s.held){s.released=true;s.target=0;}return true;}
    return false;
  }
  function handleMIDIMessage(eventOrData){
    const d=eventOrData?.data??eventOrData;if(!d||d.length!==3)return false;
    const status=d[0],a=d[1],b=d[2];if(!Number.isInteger(status)||status<0x80||status>0xEF||(status&15)!==channel-1||!midiByte(a)||!midiByte(b))return false;
    const type=status&0xF0;if(type===0x90)return noteOn(a,b);if(type===0x80)return noteOff(a);if(type===0xB0)return controlChange(a,b);
    if(type===0xE0){const raw=a+(b<<7);return setPitchBend((raw-8192)/(raw>=8192?8191:8192));}return false;
  }
  function drawString(s){
    const pos=s.mesh.geometry.attributes.position,fretY=s.fret?model.frets[s.fret]:model.nutY;
    const at=(fretY-model.bridgeY)/model.scale,pressX=T.MathUtils.lerp(s.saddle.x,s.nut.x,at),contactZ=model.boardZ(pressX,fretY)+.0157+s.radius;
    const amp=s.energy*.019*(reducedMotion?.45:1);
    for(let row=0;row<=s.rows;row++){
      const t=row/s.rows,y=T.MathUtils.lerp(s.saddle.y,s.nut.y,t),restZ=T.MathUtils.lerp(s.saddle.z,s.nut.z,t);
      const local=s.fret?Math.min(1,t/at):t,shape=Math.sin(local*Math.PI),vibrating=!s.fret||t<at;
      const bent=(t<at?t/at:(1-t)/Math.max(.001,1-at))*bend*.028*s.amount;
      const x=T.MathUtils.lerp(s.saddle.x,s.nut.x,t)+bent+(vibrating?shape*amp*(Math.sin(s.phase*(31+s.number*2.1))+.23*Math.sin(s.phase*67)*Math.sin(local*TAU)):0);
      let targetZ=restZ;if(s.fret)targetZ=t<=at?T.MathUtils.lerp(s.saddle.z,contactZ,t/at):T.MathUtils.lerp(contactZ,s.nut.z,(t-at)/(1-at));
      const z=T.MathUtils.lerp(restZ,targetZ,s.amount)+(vibrating?shape*amp*.16*Math.sin(s.phase*39):0);
      for(let j=0;j<=s.sides;j++){const a=j/s.sides*TAU;pos.setXYZ(row*(s.sides+1)+j,x+Math.cos(a)*s.radius,y,z+Math.sin(a)*s.radius);}
    }
    pos.needsUpdate=true;s.mesh.geometry.computeBoundingSphere();s.mesh.material.emissive.setHex(0xd0a566);s.mesh.material.emissiveIntensity=s.energy*.17;
    s.marker.visible=s.fret>0&&s.amount>.04&&(s.energy>.009||s.held);
    if(s.marker.visible){const y=fretY+(model.frets[s.fret-1]-fretY)*.25,t=(y-model.bridgeY)/model.scale,x=T.MathUtils.lerp(s.saddle.x,s.nut.x,t)+bend*.028*s.amount;s.marker.position.set(x,y,model.boardZ(x,y)+.052);s.marker.scale.set(.033*s.amount,.044*s.amount,.013*s.amount);}
  }
  function tick(dt){
    if(!Number.isFinite(dt)||dt<=0)return {moved:false,animating:false};dt=Math.min(dt,.05);clock+=dt;
    while(pending.length&&pending[0].time<=clock){const e=pending.shift();pluck(e.string,e.velocity,e.fret);}
    let moved=dirty,animating=pending.length>0;const oldBend=bend;bend+=(wantBend-bend)*(1-Math.exp(-dt*19));if(Math.abs(bend-wantBend)<.0002)bend=wantBend;
    if(oldBend!==bend){moved=true;animating=animating||bend!==wantBend;}
    for(const s of voices){
      const changed=dirty||s.energy>0||s.amount!==s.target||oldBend!==bend;
      s.phase+=dt;s.energy*=Math.exp(-dt*(s.released?15:2.7));if(s.energy<.0012)s.energy=0;
      s.amount+=(s.target-s.amount)*(1-Math.exp(-dt*28));if(Math.abs(s.amount-s.target)<.0002)s.amount=s.target;
      if(changed){drawString(s);moved=true;}animating=animating||s.energy>0||s.amount!==s.target;
    }
    model.controls.tremolo.rotation.x=-bend*.10;
    if(pickAge<.25){pickAge+=dt;const s=model.strings.get(pickString);model.pick.visible=pickAge<.22;
      model.pick.position.set(T.MathUtils.lerp(s.saddle.x,s.nut.x,.16)+Math.sin(pickAge/.22*Math.PI)*.075-.025,-1.13,.529+Math.sin(pickAge/.22*Math.PI)*.020);model.pick.rotation.z=-.18+Math.sin(pickAge/.22*Math.PI)*.36;moved=true;animating=true;
    }else if(model.pick.visible){model.pick.visible=false;moved=true;}
    dirty=false;return {moved,animating};
  }
  const api={noteOn,noteOff,pluck,strum,allNotesOff,panic,setPitchBend,setControl,controlChange,handleMIDIMessage,
    setMIDIChannel(value){if(!Number.isInteger(value)||value<1||value>16)return false;allNotesOff();channel=value;return true;},
    get midiChannel(){return channel;},get activeNotes(){return [...new Set(voices.filter(s=>s.held).map(s=>s.note))];},
    getFingering(){return voices.filter(s=>s.held).map(s=>({string:s.number,fret:s.fret,note:s.note}));},
    strings:model.strings,root:model.root,controls:model.controls,minNote:40,maxNote:86
  };
  for(const id of ['volume','tone','pickup'])setControl(id,model.controls[id].value);tick(.016);
  return {api,tick};
}

