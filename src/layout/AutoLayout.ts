import {
  cloneLayout,
  getInstrumentDefinition,
  type LayoutDocument,
  type LayoutInstrumentInstance,
  type LayoutInstrumentType,
  type LayoutRole,
} from './LayoutDocument.ts';

export interface InstrumentFootprint {
  width: number;
  depth: number;
}

export type InstrumentFootprints = Record<LayoutInstrumentType, InstrumentFootprint>;

interface PackedItem {
  instance: LayoutInstrumentInstance;
  width: number;
  depth: number;
}

const MAX_ROW_WIDTH = 7.2;
const ITEM_GAP = 0.38;
const ROW_GAP = 0.5;

export function autoArrangeLayout(
  source: LayoutDocument,
  footprints: InstrumentFootprints,
): LayoutDocument {
  const document = cloneLayout(source);
  const backline = document.instances.filter((instance) => roleOf(instance) === 'backline');
  const frontline = document.instances.filter((instance) => roleOf(instance) === 'frontline');

  placeRows(packRows(backline, footprints), -1.45, -1);
  placeRows(packRows(frontline, footprints), 0.72, 1);
  return document;
}

function packRows(
  instances: LayoutInstrumentInstance[],
  footprints: InstrumentFootprints,
): PackedItem[][] {
  const rows: PackedItem[][] = [];
  let row: PackedItem[] = [];
  let rowWidth = 0;

  for (const instance of instances) {
    const footprint = footprints[instance.type];
    if (!footprint) {
      throw new Error(
        `自动排布缺少 ${instance.type} 的尺寸：请用一套包含全部六件乐器的编制测量 footprints，` +
          `否则排布结果取决于谁先被量过`,
      );
    }
    const item: PackedItem = {
      instance,
      width: Math.max(0.28, footprint.width * instance.transform.scale),
      depth: Math.max(0.2, footprint.depth * instance.transform.scale),
    };
    const nextWidth = row.length === 0 ? item.width : rowWidth + ITEM_GAP + item.width;
    if (row.length > 0 && nextWidth > MAX_ROW_WIDTH) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(item);
    rowWidth = row.length === 1 ? item.width : rowWidth + ITEM_GAP + item.width;
  }
  if (row.length) rows.push(row);
  return rows;
}

function placeRows(rows: PackedItem[][], firstZ: number, direction: -1 | 1): void {
  let z = firstZ;
  for (const row of rows) {
    const width = row.reduce((total, item) => total + item.width, 0) + ITEM_GAP * Math.max(0, row.length - 1);
    const rowDepth = Math.max(...row.map((item) => item.depth));
    let x = -width / 2;
    for (const item of row) {
      const definition = getInstrumentDefinition(item.instance.type);
      item.instance.transform.position = [round(x + item.width / 2), 0, round(z)];
      item.instance.transform.rotation = [0, definition.defaultYaw, 0];
      x += item.width + ITEM_GAP;
    }
    z += direction * (rowDepth + ROW_GAP);
  }
}

function roleOf(instance: LayoutInstrumentInstance): LayoutRole {
  return getInstrumentDefinition(instance.type).role;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
