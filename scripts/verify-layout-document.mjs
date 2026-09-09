import assert from 'node:assert/strict';
import {
  cloneLayout,
  createDefaultLayout,
  parseLayoutDocument,
  stringifyLayout,
} from '../src/dev/layout-editor/LayoutDocument.ts';
import { autoArrangeLayout } from '../src/dev/layout-editor/AutoLayout.ts';

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
  /0 到 10/,
  'scale values must remain JSON numbers',
);

const duplicate = cloneLayout(defaults);
duplicate.instances.push({
  id: 'electric-2',
  type: 'electric',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
});
assert.equal(parseLayoutDocument(JSON.parse(stringifyLayout(duplicate))).instances.length, 7);

const footprints = {
  drums: { width: 1.8, depth: 1.25 },
  keyboard: { width: 1.45, depth: 0.55 },
  violin: { width: 0.32, depth: 0.28 },
  electric: { width: 0.42, depth: 0.3 },
  acoustic: { width: 0.46, depth: 0.32 },
  bass: { width: 0.45, depth: 0.32 },
};
const arranged = autoArrangeLayout(duplicate, footprints);
assert.equal(stringifyLayout(arranged), stringifyLayout(autoArrangeLayout(duplicate, footprints)), 'auto layout must be deterministic');
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

console.info('Layout document validation passed');
