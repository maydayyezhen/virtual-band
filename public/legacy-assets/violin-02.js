    const fholes=[fHole(-1),fHole(1)],faceShape=outline.clone();faceShape.holes=fholes.map(f=>f.hole);
    const archCache=new Map();
    function arch(x,y){
      const id=Math.round(x*1e5)+','+Math.round(y*1e5);if(archCache.has(id))return archCache.get(id);
      let distance=1e9;
      for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}
      const longitudinal=Math.pow(Math.max(0,Math.sin((y+1.81)/3.59*Math.PI)),.66),transverse=Math.exp(-x*x/1.03);
      const d=.122*longitudinal*transverse*Math.sin(Math.min(1,distance/.24)*Math.PI/2);archCache.set(id,d);return d;
    }
    const topZ=(x,y)=>.174+arch(x,y),backZ=(x,y)=>-.170-arch(x,y)*.82;
    function plate(shape,back=false){
      const flat=new T.ShapeGeometry(shape,20).toNonIndexed(),a=flat.attributes.position,triangles=[];
      function split(p,q,r,depth=0){
        const pq=p.distanceToSquared(q),qr=q.distanceToSquared(r),rp=r.distanceToSquared(p),m=Math.max(pq,qr,rp);
        if(m>.021&&depth<11){if(m===pq){const mid=p.clone().add(q).multiplyScalar(.5);split(p,mid,r,depth+1);split(mid,q,r,depth+1);}else if(m===qr){const mid=q.clone().add(r).multiplyScalar(.5);split(p,q,mid,depth+1);split(p,mid,r,depth+1);}else{const mid=r.clone().add(p).multiplyScalar(.5);split(p,q,mid,depth+1);split(mid,q,r,depth+1);}return;}
        triangles.push(p,back?r:q,back?q:r);
      }
      for(let i=0;i<a.count;i+=3)split(new T.Vector2(a.getX(i),a.getY(i)),new T.Vector2(a.getX(i+1),a.getY(i+1)),new T.Vector2(a.getX(i+2),a.getY(i+2)));
      flat.dispose();const positions=[],normals=[],uv=[],colors=[],fn=back?backZ:topZ,e=.0005;
      for(const p of triangles){const z=fn(p.x,p.y),zx=(fn(p.x+e,p.y)-fn(p.x-e,p.y))/(2*e),zy=(fn(p.x,p.y+e)-fn(p.x,p.y-e))/(2*e),n=V(-zx,-zy,1).normalize().multiplyScalar(back?-1:1);
        positions.push(p.x,p.y,z);normals.push(n.x,n.y,n.z);uv.push((p.x+1.12)/2.24,(p.y+1.82)/3.61);
        const warmth=clamp(arch(p.x,p.y)/.09,0,1),c=new T.Color().setRGB(.77+.23*warmth,.64+.36*warmth,.53+.47*warmth);colors.push(c.r,c.g,c.b);
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingSphere();
      return add(g,back?mat.back:mat.top,root,back?'Arched flamed maple back':'Carved spruce top with open f-holes');
    }
    const frontPlate=plate(faceShape),backPlate=plate(outline,true);
    function wall(points,z1,z2,material,parent=root,scaleXY=1){
      const pos=[],uv=[],idx=[];for(let i=0;i<=points.length;i++){
        const p=points[i%points.length],x=p.x*scaleXY,y=p.y*scaleXY;
        pos.push(x,y,z1(x,y),x,y,z2(x,y));uv.push(i/points.length*5,0,i/points.length*5,1);if(i<points.length){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return add(g,material,parent);
    }
    wall(rim,()=>-.166,()=>.170,mat.rib,root,.978).name='Thin maple ribs';
    wall(rim,(x,y)=>topZ(x,y)-.029,topZ,mat.edge);
    wall(rim,backZ,(x,y)=>backZ(x,y)+.030,mat.edge);
    for(const f of fholes)wall(f.points,(x,y)=>topZ(x,y)-.028,topZ,mat.lining).name='f-hole cut edge';
    // Purfling is inset just inside the plate overhang on both faces.
    for(const size of [.957,.966])for(const back of [false,true])wire(rim.map(p=>{const x=p.x*size,y=p.y*size;return V(x,y,(back?backZ(x,y):topZ(x,y))+(back?-.001:.001));}),.0035,mat.purfling,root,250,6,true);
    wire(rim.map(p=>V(p.x,p.y,topZ(p.x,p.y)-.005)),.009,mat.varnish,root,260,7,true);
    wire(rim.map(p=>V(p.x,p.y,backZ(p.x,p.y)+.005)),.009,mat.varnish,root,260,7,true);
    // Dark interior, a soundpost, and a bass bar are visible through the holes.
    const inside=add(new T.ShapeGeometry(outline,20),mat.lining);inside.position.z=-.147;inside.name='Interior of soundbox';
    rod(V(.18,-.072,-.14),V(.18,-.072,.260),.030,mat.maple,root,18);
    wire([V(-.16,-1.22,.188),V(-.18,-.66,.224),V(-.18,.13,.231),V(-.15,.92,.205)],.030,mat.maple,root,34,8);
    // A continuous, strongly radiused ebony fingerboard: no frets.
    const boardHalf=y=>.119+clamp((nutY-y)/(nutY-boardEnd),0,1)*.094;
    const boardZ=(x,y)=>.453+(.610-.453)*clamp((nutY-y)/(nutY-boardEnd),0,1)-x*x/.84;
    const fp=[],fn=[],fu=[],fi=[];
    for(let row=0;row<=58;row++){const y=boardEnd+(nutY-boardEnd)*row/58,hw=boardHalf(y);for(let j=0;j<=20;j++){
      const x=(j/20*2-1)*hw;fp.push(x,y,boardZ(x,y));const n=V(2*x/.84,(.610-.453)/(nutY-boardEnd),1).normalize();fn.push(n.x,n.y,n.z);fu.push(j/20,row/58);
      if(row<58&&j<20){const k=row*21+j;fi.push(k,k+1,k+21,k+1,k+22,k+21);}
    }}
    const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute(fp,3));fg.setAttribute('normal',new T.Float32BufferAttribute(fn,3));fg.setAttribute('uv',new T.Float32BufferAttribute(fu,2));fg.setIndex(fi);add(fg,mat.ebony).name='Fretless ebony fingerboard';
    const fbShape=new T.Shape();fbShape.moveTo(-boardHalf(boardEnd),boardEnd);fbShape.lineTo(boardHalf(boardEnd),boardEnd);fbShape.lineTo(.119,nutY);fbShape.lineTo(-.119,nutY);fbShape.closePath();
    const fbSolid=slab(fbShape,.042,0,mat.ebony),oldFB=fbSolid.geometry,kept={position:[],normal:[],uv:[]};
    for(let i=0;i<oldFB.attributes.position.count;i+=3){if([0,1,2].every(k=>oldFB.attributes.position.getZ(i+k)>.0419))continue;for(const key of Object.keys(kept)){const a=oldFB.attributes[key];for(let k=0;k<3;k++)for(let j=0;j<a.itemSize;j++)kept[key].push(a.array[(i+k)*a.itemSize+j]);}}
    fbSolid.geometry=new T.BufferGeometry();for(const key of Object.keys(kept))fbSolid.geometry.setAttribute(key,new T.Float32BufferAttribute(kept[key],key==='uv'?2:3));oldFB.dispose();const fbp=fbSolid.geometry.attributes.position;
    for(let i=0;i<fbp.count;i++)fbp.setZ(i,boardZ(fbp.getX(i),fbp.getY(i))-.042+fbp.getZ(i));fbSolid.geometry.computeVertexNormals();smoothNormals(fbSolid.geometry);
    // Maple neck, heel and open pegbox.
    const np=[],nu=[],ni=[],ny0=1.72,neckTop=y=>boardZ(0,y)-.047;
    for(let row=0;row<=32;row++){const y=ny0+(nutY-ny0)*row/32,hw=boardHalf(y)-.012,depth=.126+(1-row/32)*.050;
      for(let j=0;j<=24;j++){const a=j/24*Math.PI;np.push(Math.cos(a)*hw,y,neckTop(y)-Math.sin(a)*depth);nu.push(j/24,row/32);if(row<32&&j<24){const k=row*25+j;ni.push(k,k+1,k+25,k+1,k+26,k+25);}}
    }
    const ng=new T.BufferGeometry();ng.setAttribute('position',new T.Float32BufferAttribute(np,3));ng.setAttribute('uv',new T.Float32BufferAttribute(nu,2));ng.setIndex(ni);ng.computeVertexNormals();add(ng,mat.maple);
    ball(0,1.675,.260,.156,.198,.217,mat.maple);
    const nutShape=rect(.243,.040,.005),nut=slab(nutShape,.040,0,mat.ebony);nut.position.y=nutY+.014;
    const npos=nut.geometry.attributes.position;for(let i=0;i<npos.count;i++)npos.setZ(i,.428+npos.getZ(i)-npos.getX(i)**2/.84);nut.geometry.computeVertexNormals();
    const head=new T.Group();head.position.set(0,nutY+.034,.421);head.rotation.x=-.095;head.name='Open pegbox and carved volute';root.add(head);
    const pegbox=new T.Shape();pegbox.moveTo(-.121,0);pegbox.bezierCurveTo(-.161,.20,-.178,.50,-.172,.80);pegbox.quadraticCurveTo(0,.88,.172,.80);pegbox.bezierCurveTo(.178,.50,.161,.20,.121,0);pegbox.closePath();
    const cavity=new T.Path();cavity.moveTo(-.084,.095);cavity.lineTo(.084,.095);cavity.lineTo(.123,.698);cavity.quadraticCurveTo(0,.758,-.123,.698);cavity.closePath();pegbox.holes.push(cavity);
    slab(pegbox,.168,-.127,mat.varnish,head,.006,4);
    const backWall=new T.Shape();backWall.moveTo(-.134,.02);backWall.lineTo(.134,.02);backWall.lineTo(.159,.80);backWall.quadraticCurveTo(0,.85,-.159,.80);backWall.closePath();slab(backWall,.021,-.151,mat.maple,head,.003);
    const hollow=add(new T.ShapeGeometry(new T.Shape(cavity.getPoints(18)),18),mat.lining,head);hollow.position.z=-.126;
    const posts=[],postDefs=[[-1,.18],[1,.37],[-1,.555],[1,.725]];
    for(let i=0;i<4;i++){
      const [side,y]=postDefs[i],z=-.006;
      rod(V(-.168,y,z),V(.168,y,z),.022,mat.ebony,head,20);
      rod(V(side*.147,y,z),V(side*.307,y,z),.034,mat.ebony,head,20,.025);
      ball(side*.341,y,z,.064,.091,.032,mat.ebony,head);
      rod(V(side*.207,y,z),V(side*.225,y,z),.035,mat.silver,head,20);
      disk(side*.342,y,z+.033,.016,mat.pearl,head);
      const px=(i-1.5)*.035;posts.push(V(px,y,z+.026));
      const w=[];for(let j=0;j<=48;j++){const a=j/48*TAU*2.25;w.push(V(px-.013+j/48*.026,y+Math.cos(a)*.025,z+Math.sin(a)*.025));}wire(w,.0025,mat.string,head,55,6);
    }
    // Volute axis runs across the violin. Spiral ridges are modelled on both sides.
    rod(V(-.155,.867,-.035),V(.155,.867,-.035),.175,mat.varnish,head,64);
    for(const side of [-1,1]){
      rod(V(side*.155,.867,-.035),V(side*.173,.867,-.035),.160,mat.maple,head,64);
      const spiral=[];for(let j=0;j<=180;j++){const t=j/180,a=-.8+t*TAU*1.85,r=.147*(1-t)+.017;spiral.push(V(side*(.178+.014*t),.867+Math.sin(a)*r,-.035+Math.cos(a)*r));}wire(spiral,.012,mat.varnish,head,180,8);
      ball(side*.198,.867,-.035,.021,.024,.024,mat.varnish,head);
    }
    // Carved maple bridge with heart, kidneys, arch between the two feet.
    const bridge=new T.Group();bridge.name='Carved maple bridge';bridge.position.set(0,bridgeY,.289);root.add(bridge);
    const bs=new T.Shape();bs.moveTo(-.229,0);bs.lineTo(-.120,0);bs.lineTo(-.101,.065);bs.quadraticCurveTo(0,.127,.101,.065);bs.lineTo(.120,0);bs.lineTo(.229,0);
    bs.lineTo(.225,.040);bs.lineTo(.156,.063);bs.lineTo(.180,.126);bs.bezierCurveTo(.134,.148,.138,.209,.183,.215);bs.lineTo(.166,.336);
    bs.quadraticCurveTo(0,.462,-.166,.336);bs.lineTo(-.183,.215);bs.bezierCurveTo(-.138,.209,-.134,.148,-.180,.126);bs.lineTo(-.156,.063);bs.lineTo(-.225,.040);bs.closePath();
    const heart=new T.Path();heart.moveTo(0,.273);heart.bezierCurveTo(-.091,.297,-.088,.199,0,.166);heart.bezierCurveTo(.088,.199,.091,.297,0,.273);heart.closePath();bs.holes.push(heart);
    for(const side of [-1,1]){const kidney=new T.Path();kidney.absellipse(side*.113,.163,.024,.039,0,TAU,false,side*.25);bs.holes.push(kidney);}
