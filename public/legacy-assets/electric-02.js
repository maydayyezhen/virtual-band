    shape.lineTo(-.32,.40);
    shape.bezierCurveTo(-.43,.29,-.49,.50,-.47,.78);
    shape.bezierCurveTo(-.44,1.11,-.56,1.46,-.76,1.43);
    shape.bezierCurveTo(-1.00,1.42,-1.09,.86,-1.15,.49);
    shape.bezierCurveTo(-1.19,.02,-1.49,-.29,-1.57,-.87);
    shape.bezierCurveTo(-1.73,-1.59,-1.60,-2.52,-1.20,-2.93);
    shape.bezierCurveTo(-.89,-3.20,-.48,-3.25,-.10,-3.22);shape.closePath();
    // Keep replaceable exterior separate from the shared animated instrument.
    const exterior=new T.Group();exterior.name='electric:exterior';exterior.userData.electricAppearance=true;root.add(exterior);
    const body=slab(shape,.36,-.18,mat.paint,exterior,.065,7);body.name='Deep marine metallic double-cut body';
    // A narrow cream pinstripe follows the rounded face, with no floating decal.
    wire(shape.getSpacedPoints(220).slice(0,-1).map(p=>V(p.x,p.y,.251)),.0085,mat.bone,exterior,280,6,true);
    const guard=new T.Shape();guard.moveTo(-.33,.31);guard.lineTo(.33,.31);guard.lineTo(.33,-.40);
    guard.bezierCurveTo(.35,-.61,.64,-.54,.66,-.83);guard.lineTo(.67,-1.69);
    guard.bezierCurveTo(.69,-1.96,.40,-2.06,.09,-2.06);
    guard.bezierCurveTo(-.52,-2.11,-1.14,-1.83,-1.24,-1.36);
    guard.bezierCurveTo(-1.40,-.74,-1.06,-.25,-.98,.18);
    guard.bezierCurveTo(-.95,.58,-.84,1.05,-.71,1.10);
    guard.bezierCurveTo(-.62,1.09,-.74,.52,-.63,.31);
    guard.bezierCurveTo(-.53,.15,-.41,.13,-.33,.31);guard.closePath();
    slab(guard,.006,.251,mat.guard,exterior,.002);
    slab(guard,.006,.258,mat.guardEdge,exterior,.001);
    slab(guard,.009,.265,mat.guard,exterior,.002);
    [[-.71,.94],[-.98,-.10],[-1.16,-.72],[-1.13,-1.35],[-.71,-1.82],[-.06,-1.96],[.53,-1.78],[.56,-1.04],[.45,-.55],[-.39,.15]].forEach(([x,y])=>screw(x,y,.278,exterior,.019));
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
    const upperStrap=new T.Group(),lowerStrap=new T.Group();upperStrap.name='electric:upper-strap';lowerStrap.name='electric:lower-strap';
    for(const g of [upperStrap,lowerStrap]){g.userData.electricAppearance=true;root.add(g);}
    rod(V(-.755,1.45,-.02),V(-.78,1.572,-.02),.029,mat.chrome,upperStrap,20,.055);
    rod(V(-.09,-3.268,-.02),V(-.09,-3.392,-.02),.029,mat.chrome,lowerStrap,20,.055);
    const boardEnd=nutY-scale*(1-2**(-22.65/12)),boardHalf=y=>.220+clamp((nutY-y)/(nutY-boardEnd),0,1)*.109;
    const boardZ=(x,y)=>.366-.011*(x/boardHalf(y))**2;
    const np=[],nu=[],ni=[],neckRows=38,neckSides=24;
    for(let row=0;row<=neckRows;row++){
      const y=.28+(nutY-.28)*row/neckRows,hw=boardHalf(y)-.009,depth=.215+(1-row/neckRows)*.055;
      for(let j=0;j<=neckSides;j++){const a=j/neckSides*Math.PI;np.push(Math.cos(a)*hw,y,.286-Math.sin(a)*depth);nu.push(j/neckSides,row/neckRows);if(row<neckRows&&j<neckSides){const k=row*(neckSides+1)+j;ni.push(k,k+1,k+neckSides+1,k+1,k+neckSides+2,k+neckSides+1);}}
    }
    const ng=new T.BufferGeometry();ng.setAttribute('position',new T.Float32BufferAttribute(np,3));ng.setAttribute('uv',new T.Float32BufferAttribute(nu,2));ng.setIndex(ni);ng.computeVertexNormals();add(ng,mat.maple).name='Carved maple neck';
    wire([V(0,.45,.025),V(0,1.5,.044),V(0,3,.061),V(0,4.17,.070)],.012,mat.walnut,root,50,6);
