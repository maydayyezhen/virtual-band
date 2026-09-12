import assert from 'node:assert/strict';
import {
  cloneLayout,
  createDefaultLayout,
  parseLayoutDocument,
  stringifyLayout,
} from '../src/layout/LayoutDocument.ts';
import { autoArrangeLayout, arrangeLayout, occupation, validateLayout } from '../src/layout/AutoLayout.ts';
import { arrangeFormation } from '../src/layout/Formation.ts';

const stage = { venueId:'nocturne', surfaceY:1.2, area:{minX:-12,maxX:12,minZ:-5.4,maxZ:6.6}, exclusions:[], gap:.4 };
const defaults = createDefaultLayout();
const roundTrip = parseLayoutDocument(JSON.parse(stringifyLayout(defaults)));
assert.equal(
  stringifyLayout(roundTrip),
  stringifyLayout(defaults),
  'default layout must survive a normalized JSON round trip',
);

const moved = cloneLayout(defaults);
moved.name = 'custom-stage';
moved.instances.find((instance) => instance.id === 'bass-1').transform.position[0] = 7.25;
moved.instances.find((instance) => instance.id === 'drums-1').transform.scale = 1.75;
assert.equal(
  parseLayoutDocument(JSON.parse(stringifyLayout(moved))).instances.find((instance) => instance.id === 'bass-1').transform.position[0],
  7.25,
  'edited transforms must survive a JSON round trip',
);
assert.equal(
  parseLayoutDocument(JSON.parse(stringifyLayout(moved))).instances.find((instance) => instance.id === 'drums-1').transform.scale,
  1.75,
  'edited scales must survive a JSON round trip',
);

assert.throws(
  () => parseLayoutDocument({ ...defaults, schemaVersion: 1 }),
  /schemaVersion/,
  'unknown schema versions must be rejected',
);

assert.throws(
  () => parseLayoutDocument({ ...defaults, units: 'centimeters' }),
  /meters/,
  'unknown layout units must be rejected',
);

const unknownInstrument = JSON.parse(stringifyLayout(defaults));
unknownInstrument.instances[0].type = 'unknown';
assert.throws(
  () => parseLayoutDocument(unknownInstrument),
  /未知乐器类型/,
  'unknown instrument types must be rejected',
);

const invalidNumber = JSON.parse(stringifyLayout(defaults));
invalidNumber.instances[0].transform.position[0] = '2';
assert.throws(
  () => parseLayoutDocument(invalidNumber),
  /无效数字/,
  'invalid transform values must be rejected',
);

const invalidScale = JSON.parse(stringifyLayout(defaults));
invalidScale.instances[0].transform.scale = '1.5';
assert.throws(
  () => parseLayoutDocument(invalidScale),
  /0 到 15/,
  'scale values must remain JSON numbers',
);

const duplicate = cloneLayout(defaults);
duplicate.instances.push({
  id: 'electric-2',
  type: 'electric',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
});
assert.equal(parseLayoutDocument(JSON.parse(stringifyLayout(duplicate))).instances.length, defaults.instances.length + 1);
duplicate.instances.push({ id: 'cello-2', type: 'cello', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } });

const footprints = {
  cello: { width: .65, depth: .4 },
  saxophone: { width: .4, depth: .5 },
  piano: { width: 1.6, depth: 3.3 },
  drums: { width: 1.8, depth: 1.25 },
  keyboard: { width: 1.45, depth: 0.55 },
  violin: { width: 0.32, depth: 0.28 },
  electric: { width: 0.42, depth: 0.3 },
  acoustic: { width: 0.46, depth: 0.32 },
  bass: { width: 0.45, depth: 0.32 },
};
const arranged = autoArrangeLayout(duplicate, footprints, {stage});
assert.notDeepEqual(arranged.instances.find(i => i.id === 'cello-1').transform.position,
  arranged.instances.find(i => i.id === 'cello-2').transform.position, 'two cellos receive distinct stage positions');
assert.equal(stringifyLayout(arranged), stringifyLayout(autoArrangeLayout(duplicate, footprints, {stage})), 'auto layout must be deterministic');
assert.notEqual(
  arranged.instances.find((instance) => instance.id === 'electric-1').transform.position[0],
  arranged.instances.find((instance) => instance.id === 'electric-2').transform.position[0],
  'duplicate instruments must receive distinct positions',
);
assert.ok(
  arranged.instances.find((instance) => instance.id === 'drums-1').transform.position[2] < 0
  && arranged.instances.find((instance) => instance.id === 'bass-1').transform.position[2] > 0,
  'backline and frontline instruments must occupy separate zones',
);


// Independent rectangle checks cover collisions and boundaries, including mixed-scale rows.
function verifyPacking(layout, dimensions, stage) {
  const boxes = layout.instances.map(instance => {
    const d = occupation(instance, dimensions), [x,,z] = instance.transform.position;
    return { id: instance.id, minX:x-d.width/2, maxX:x+d.width/2, minZ:z-d.depth/2, maxZ:z+d.depth/2 };
  });
  for(const box of boxes) {
    assert.ok(box.minX >= stage.area.minX-1e-6 && box.maxX <= stage.area.maxX+1e-6 && box.minZ >= stage.area.minZ-1e-6 && box.maxZ <= stage.area.maxZ+1e-6, `bounds: ${box.id}`);
  }
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j],g=stage.gap-1e-6;
    assert.ok(a.maxX+g<=b.minX || b.maxX+g<=a.minX || a.maxZ+g<=b.minZ || b.maxZ+g<=a.minZ, `collision: ${a.id}/${b.id}`);
  }
}

verifyPacking(arranged,footprints,stage);
const mixed = cloneLayout(defaults);
mixed.instances = [.5,2,1,.7].map((scale,index)=>({id:`keyboard.${index}`,type:'keyboard',transform:{position:[0,0,0],rotation:[0,index%2*Math.PI/2,0],scale}}));
const mixedDimensions={ keyboard:{width:4,depth:4} };
const mixedResult=arrangeLayout(mixed,mixedDimensions,{stage});
assert.deepEqual(mixedResult.issues,[]);
verifyPacking(mixedResult.layout,mixedDimensions,stage);
assert.deepEqual(mixed.instances.map(i=>i.transform.position),Array(4).fill([0,0,0]),'input not mutated');
const reordered=autoArrangeLayout({...mixed,instances:[...mixed.instances].reverse()},mixedDimensions,{stage});
for(const instance of reordered.instances) assert.deepEqual(instance.transform,mixedResult.layout.instances.find(i=>i.id===instance.id).transform,'array order does not change instance placement');
const rotationProbe={id:'probe',type:'keyboard',transform:{position:[0,0,0],rotation:[0,Math.PI/2,0],scale:1}};
assert.ok(Math.abs(occupation(rotationProbe,{probe:{width:4,depth:2}}).width-2)<1e-6,'quarter turn swaps footprint axes');
const locked = cloneLayout(arranged);
locked.instances[0].locked=true;
locked.instances[0].transform.rotation[1]=Math.PI/8;
const lockResult=autoArrangeLayout(locked,footprints,{stage});
assert.deepEqual(lockResult.instances[0],locked.instances[0],'locked pose is preserved');
verifyPacking(lockResult,footprints,stage);
assert.equal(parseLayoutDocument(JSON.parse(stringifyLayout(locked))).instances[0].locked,true,'lock survives save/load');
const appended=cloneLayout(arranged);
appended.instances.push({id:'keyboard.new',type:'keyboard',transform:{position:[0,0,0],rotation:[0,Math.PI,0],scale:1}});
const fill=autoArrangeLayout(appended,footprints,{stage});
const fresh=cloneLayout(appended); for(const instance of fresh.instances) instance.transform.position=[0,0,0];
assert.equal(stringifyLayout(fill),stringifyLayout(autoArrangeLayout(fresh,footprints,{stage})),'automatic positions are independent of roster history');
assert.equal(stringifyLayout(fill),stringifyLayout(autoArrangeLayout(fill,footprints,{stage})),'rearrangement is idempotent');
verifyPacking(fill,footprints,stage);
const smallStage={...stage,area:{minX:-1,maxX:1,minZ:-1,maxZ:1}};
const failed=arrangeLayout(mixed,mixedDimensions,{stage:smallStage});
assert.ok(failed.unplaced.length>0 && failed.issues.length>0,'capacity failure is explicit');
assert.throws(()=>autoArrangeLayout(mixed,mixedDimensions,{stage:smallStage}),/演奏空间/);
const blockedStage={...stage,exclusions:[{minX:-1,maxX:1,minZ:-1,maxZ:1}]};
const blocked=autoArrangeLayout(defaults,footprints,{stage:blockedStage});
for(const instance of blocked.instances){const d=occupation(instance,footprints),[x,,z]=instance.transform.position;assert.ok(x+d.width/2+.4<=-1+1e-6||x-d.width/2-.4>=1-1e-6||z+d.depth/2+.4<=-1+1e-6||z-d.depth/2-.4>=1-1e-6,'excluded area clear');}
const invalidLock=cloneLayout(locked);invalidLock.instances[0].transform.position[0]=99;
assert.throws(()=>autoArrangeLayout(invalidLock,footprints,{stage}),/锁定/);
const legacy={...defaults,venueId:'atelier-studio'};
const migrated=parseLayoutDocument(JSON.parse(JSON.stringify(legacy)));
assert.equal(migrated.venueId,'nocturne');assert.equal(migrated.instances[0].transform.scale,1.5);
assert.equal(parseLayoutDocument(JSON.parse(stringifyLayout(migrated))).instances[0].transform.scale,1.5,'migration runs once');
console.info('Layout: round trip, migration, IDs, mixed sizes, rotation, bounds, gaps, exclusions, locks, roster reflow and capacity failure passed');

// Actual Queen roster and measured dimensions: shallow front line, wings beside the rear anchor.
const queen=cloneLayout(defaults);
queen.instances=['drums','keyboard','keyboard','keyboard','electric','electric','bass'].map((type,i)=>({id:`${type}.${i}`,type,transform:{position:[i-3,0,i],rotation:[0,type==='keyboard'?Math.PI:0,0],scale:1}}));
const measured={...footprints,drums:{width:2.779461867,depth:1.990327775}};
const queenLayout=autoArrangeLayout(queen,measured,{stage});verifyPacking(queenLayout,measured,stage);
const drum=queenLayout.instances.find(i=>i.type==='drums');assert.equal(drum.transform.position[0],0);
const keys=queenLayout.instances.filter(i=>i.type==='keyboard');
assert.ok(keys.every(i=>Math.abs(i.transform.position[0])>2.5 && i.transform.position[2]>=drum.transform.position[2]));
const front=queenLayout.instances.filter(i=>['electric','bass'].includes(i.type));
assert.ok(Math.max(...front.map(i=>i.transform.position[2]))-Math.min(...front.map(i=>i.transform.position[2]))<=.46,'front line stays shallow');
const xs=queenLayout.instances.map(i=>i.transform.position[0]),zs=queenLayout.instances.map(i=>i.transform.position[2]);
assert.ok(Math.max(...xs)-Math.min(...xs)>9 && Math.max(...zs)-Math.min(...zs)<4,'wide formation, not deep packing');
assert.deepEqual(validateLayout(queenLayout,measured,stage),[]);
const queenReversed=autoArrangeLayout({...queen,instances:[...queen.instances].reverse()},measured,{stage});
for(const instance of queenReversed.instances) assert.deepEqual(instance.transform,queenLayout.instances.find(i=>i.id===instance.id).transform);
const pinned=cloneLayout(queenLayout);pinned.instances[0].locked=true;pinned.instances[0].transform.position=[4,0,-3];
const repinned=autoArrangeLayout(pinned,measured,{stage});verifyPacking(repinned,measured,stage);assert.deepEqual(repinned.instances[0],pinned.instances[0]);
assert.throws(()=>autoArrangeLayout(queen,measured),/显式提供/);
assert.ok(arrangeLayout(queen,measured,{stage:{...stage,gap:NaN}}).issues.length);
assert.ok(validateLayout(queenLayout,measured,{...stage,venueId:'other'}).length);
// A new instrument needs only a generic description; the solver has no type-name switch.
const custom={id:'custom.marimba',width:2.6,depth:1.5,role:'wing',position:{x:999,z:999},locked:false};
const otherStage={venueId:'courtyard',surfaceY:0,area:{minX:10,maxX:20,minZ:30,maxZ:38},exclusions:[],gap:.3};
const customResult=arrangeFormation([custom],otherStage);
assert.deepEqual(customResult.issues,[]);assert.deepEqual(customResult.positions.get(custom.id),{x:15,z:34});
assert.equal(custom.position.x,999,'generic input is immutable');
const savedOther=parseLayoutDocument({...queenLayout,venueId:'courtyard'});
assert.equal(cloneLayout(savedOther).venueId,'courtyard','cloning preserves the venue identity');
for(const types of [['drums'],['keyboard','keyboard','keyboard'],['drums','drums','electric','bass'],Array(8).fill('electric')]) {
  const roster={...defaults,instances:types.map((type,i)=>({id:`${type}.${i}`,type,transform:{position:[0,0,0],rotation:[0,0,0],scale:1}}))};
  verifyPacking(autoArrangeLayout(roster,measured,{stage}),measured,stage);
}
console.info('Formation: Queen composition, shallow arc, wing grouping, locks, explicit venue, new instrument descriptions and saved venue identity passed.');
