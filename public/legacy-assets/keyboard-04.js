    block(.016,.156,.245,x+side*.425,5.68,-.287,mat.rubber,root,.025);
    const ux=side*3.53;
    const attachment=block(.457,.365,.452,ux,7.025,-1.025,mat.graphite,root,.035);
    rod(V(ux,7.025,-1.025),V(ux+side*.282,7.025,-1.025),.036,mat.satin,root,12);
    rod(V(ux+side*.260,7.025,-1.025),V(ux+side*.360,7.025,-1.025),.091,mat.rubber,root,10);
    upper.group.updateMatrixWorld(true);
    const end=upper.group.localToWorld(V(ux,-.488,-1.045));
    beam(V(ux,7.05,-1.075),end,.222,.243);
    const mid=V(ux,8.58,-1.449);
    const upperCollar=block(.332,.268,.349,mid.x,mid.y,mid.z,mat.graphite,root,.032);upperCollar.rotation.x=-.24;
    rod(V(ux,8.58,-1.449),V(ux+side*.253,8.58,-1.449),.027,mat.chrome,root,12);
    rod(V(ux+side*.23,8.58,-1.449),V(ux+side*.305,8.58,-1.449),.079,mat.rubber,root,10);
    beam(V(ux,-.48,-1.40),V(ux,-.48,1.81),.23,.190,mat.steel,upper.group);
    [-1.20,1.19].forEach(z=>block(.268,.057,.44,ux,-.367,z,mat.rubber,upper.group,.012));
    block(.259,.345,.142,ux,-.118,1.83,mat.rubber,upper.group,.025);
    beam(V(ux,-.48,1.80),V(ux,-.27,1.80),.223,.18,mat.steel,upper.group);
  }
  beam(V(-4.18,7.045,-1.12),V(4.18,7.045,-1.12),.238,.282);
  beam(V(-4.17,5.875,-.343),V(4.17,5.875,-.343),.228,.263);
  beam(V(-4.17,.685,.881),V(4.17,.685,.881),.208,.210);
  topPlane(textTexture('ATELIER   /   DUAL STAGE','#a2adb0',57),2.25,.083,0,5.999,-.345,root);
  // Three separate chrome pedals on one weighted floor unit.
  const pedalBase=block(1.59,.186,1.61,0,.117,2.56,mat.edge,root,.076);pedalBase.name='Triple-pedal unit';
  block(1.48,.052,1.48,0,.031,2.56,mat.rubber,root,.035);
  [-.535,.535].forEach(x=>[1.99,3.14].forEach(z=>screw(x,.214,z,root,'y',.026)));
  const pedalDefs=[['soft',-.435],['sostenuto',0],['sustain',.435]];
  for(const [id,x] of pedalDefs){
    const pivot=new T.Group();pivot.userData.dynamic=true;pivot.position.set(x,.374,2.027);root.add(pivot);
    const shape=new T.Shape();shape.moveTo(-.082,0);shape.lineTo(.082,0);shape.lineTo(.133,-.933);shape.quadraticCurveTo(.130,-1.02,0,-1.037);shape.quadraticCurveTo(-.130,-1.02,-.133,-.933);shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelSize:.013,bevelThickness:.013,bevelSegments:3,curveSegments:12});geometry.rotateX(-Math.PI/2);geometry.translate(0,-.045,0);smooth(geometry);
    const surface=add(geometry,mat.chrome,pivot,id+' pedal');
    rod(V(-.109,-.057,.005),V(.109,-.057,.005),.042,mat.satin,pivot,16);
    for(let i=0;i<4;i++)box(.173,.002,.012,0,.024,.689+i*.055,mat.satin,pivot);
    const record={id,pivot,amount:0,target:0,sources:new Map(),angle:.119};pedals[id]=record;surface.userData.pedal=record;pivot.userData.pedal=record;pickables.push(surface);
    topPlane(textTexture(id==='sustain'?'DAMPER':id==='soft'?'SOFT':'SOST.','#8f9c9f',58),.27,.04,x,.219,3.215,root);
  }
  // The controller cable follows the stand, with a small loop on the floor.
  tube([V(0,.136,1.791),V(-.54,.090,1.535),V(-2.85,.085,1.04),V(-4.07,.17,.54),V(-4.21,1.7,.43),V(-4.28,5.98,-.73),V(-3.55,7.3,-1.68),V(-4.18,7.72,-1.812)],.027);
  rod(V(-4.18,7.72,-1.710),V(-4.18,7.72,-1.998),.047,mat.edge,root,14);
  root.updateMatrixWorld(true);
  const upperOut=upper.group.localToWorld(V(-3.85,-.03,-1.793));
  rod(V(-3.85,-.03,-1.765),V(-3.85,-.03,-1.971),.045,mat.edge,upper.group,14);
  block(.207,.127,.175,4.35,-.03,-1.821,mat.rubber,upper.group,.020);
  block(.207,.127,.175,5.87,-.03,-1.821,mat.rubber,lower.group,.020);
  tube([upperOut,V(upperOut.x,upperOut.y-.12,upperOut.z-.30),V(-3.80,8.91,-2.24),V(-3.74,7.33,-1.91),V(-3.92,1.11,-.25),V(-3.47,.072,-.93),V(-1.20,.075,-2.05)],.032);
  const upperPower=upper.group.localToWorld(V(4.35,-.03,-1.803));
  tube([upperPower,V(4.42,upperPower.y-.20,upperPower.z-.27),V(3.79,8.53,-1.68),V(4.02,6.95,-1.04),V(4.36,1.02,.66),V(3.52,.074,-.76),V(2.78,.074,-1.90)],.030);
  const lowerPower=V(5.87,7.72,-1.76);tube([lowerPower,V(5.79,7.45,-2.10),V(4.01,6.76,-1.06),V(4.23,2.09,.28),V(4.10,.074,.04),V(2.96,.074,-1.82)],.029);
  for(const [x,y,z] of [[-4.2,2.40,.201],[-4.20,5.98,-.48],[4.2,2.40,.201],[4.20,5.98,-.48]])block(.35,.067,.375,x,y,z,mat.edge,root,.010);
  // Batch static hardware within its own instrument. Every key, wheel and
  // pedal keeps its separate object and pivot for external animation.
  function batchStatic(group,exclude=[]){
    root.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),batches=new Map();
    function visit(node){
      if(node.userData.dynamic||exclude.includes(node))return;
      if(node.isMesh&&!node.isInstancedMesh&&!Array.isArray(node.material)){
        const key=node.material.uuid+':'+node.castShadow+':'+node.receiveShadow;
        if(!batches.has(key))batches.set(key,[]);batches.get(key).push(node);
      }
      for(const child of node.children)visit(child);
    }
    for(const child of group.children)visit(child);
    for(const meshes of batches.values()){
      if(meshes.length<3)continue;
      const list=meshes.map(m=>{
        const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,m.matrixWorld));return g;
      });
      const count=list.reduce((sum,g)=>sum+g.attributes.position.count,0),p=new Float32Array(count*3),n=new Float32Array(count*3),u=new Float32Array(count*2);let at=0;
      for(const g of list){p.set(g.attributes.position.array,at*3);n.set(g.attributes.normal.array,at*3);if(g.attributes.uv)u.set(g.attributes.uv.array,at*2);at+=g.attributes.position.count;g.dispose();}
      const merged=new T.BufferGeometry();merged.setAttribute('position',new T.BufferAttribute(p,3));merged.setAttribute('normal',new T.BufferAttribute(n,3));merged.setAttribute('uv',new T.BufferAttribute(u,2));
      const m=new T.Mesh(merged,meshes[0].material);m.castShadow=meshes[0].castShadow;m.receiveShadow=meshes[0].receiveShadow;m.name='Static hardware';group.add(m);meshes.forEach(o=>o.removeFromParent());
    }
  }
  batchStatic(lower.group);batchStatic(upper.group);batchStatic(root,[lower.group,upper.group]);
  return {root,layers,pedals,pickables,drawScreen};
}