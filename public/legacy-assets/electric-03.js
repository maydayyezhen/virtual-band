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
    const standStart=root.children.length;
    for(const s of [-1,1]){
      rod(V(s*.72,-3.49,.42),V(s*.24,-.89,-.56),.037,mat.black,root,14);
      rod(V(s*.72,-3.49,.42),V(s*.65,-3.49,-.92),.034,mat.black,root,14);
      for(const z of [.43,-.93])ball(s*(z>0?.72:.65),-3.49,z,.075,.061,.082,mat.rubber);
      wire([V(s*.46,-3.16,-.56),V(s*.56,-3.23,-.03),V(s*.61,-3.13,.34),V(s*.61,-3.00,.36)],.045,mat.black,root,30,10);
      wire([V(s*.57,-3.20,-.10),V(s*.61,-3.13,.32),V(s*.61,-3.04,.36)],.066,mat.rubber,root,24,10);
    }
    rod(V(-.63,-3.26,-.57),V(.63,-3.26,-.57),.030,mat.black);rod(V(-.24,-.89,-.56),V(.24,-.89,-.56),.038,mat.black);
    ball(0,-.89,-.346,.27,.12,.10,mat.rubber);
    const stand=new T.Group();stand.name='electric:stand';stand.userData.electricAppearance=true;
    for(const part of root.children.slice(standStart))stand.add(part);root.add(stand);
    rod(V(1.51,-2.37,-.025),V(1.667,-2.41,-.025),.047,mat.chrome,root,20);rod(V(1.66,-2.41,-.025),V(1.82,-2.46,-.025),.045,mat.rubber,root,16);
    wire([V(1.81,-2.46,-.025),V(2.0,-2.85,.03),V(1.76,-3.49,.38),V(1.14,-3.50,.89),V(1.61,-3.50,1.21),V(2.34,-3.50,.75),V(2.02,-3.50,.38),V(1.66,-3.50,.93),V(2.80,-3.50,.96)],.021,mat.rubber,root,120,8);
    // Merge only static meshes. Strings, position markers, controls and pick
    // keep their own geometry for animation and picking.
    function batch(group){
      root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
      function visit(o){if(o.userData.dynamic||o.userData.electricAppearance)return;if(o.isMesh){const key=o.material.uuid+':'+o.castShadow+':'+o.receiveShadow;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);}for(const c of o.children)visit(c);}
      for(const o of group.children)visit(o);
      for(const meshes of batches.values()){
        if(meshes.length<2)continue;const p=[],n=[],u=[];
        for(const m of meshes){const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inv.clone().multiply(m.matrixWorld));for(const v of g.attributes.position.array)p.push(v);for(const v of g.attributes.normal.array)n.push(v);for(const v of g.attributes.uv.array)u.push(v);g.dispose();}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.computeBoundingSphere();
        const m=add(g,meshes[0].material,group,'Merged hardware');m.castShadow=meshes[0].castShadow;m.receiveShadow=meshes[0].receiveShadow;meshes.forEach(o=>o.removeFromParent());
      }
    }
    batch(exterior);batch(stand);for(const id of ['volume','tone','pickup'])batch(controls[id].group);batch(tremolo);batch(pick);batch(root);
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
