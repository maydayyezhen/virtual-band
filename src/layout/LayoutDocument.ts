export const LAYOUT_SCHEMA_VERSION = 3 as const;
export const LAYOUT_VENUE_ID = 'atelier-studio';
export const LAYOUT_UNITS = 'meters' as const;

export const LAYOUT_INSTRUMENTS = [
  { id: 'drums', assetId: 'drums.main', label: '架子鼓', shortLabel: 'DRUMS', targetHeight: 1.45, role: 'backline', defaultYaw: 0 },
  { id: 'keyboard', assetId: 'keyboard.main', label: '双层键盘', shortLabel: 'KEYS', targetHeight: 1.2, role: 'backline', defaultYaw: Math.PI },
  { id: 'violin', assetId: 'violin.main', label: '小提琴', shortLabel: 'VIOLIN', targetHeight: 0.72, role: 'frontline', defaultYaw: 0 },
  { id: 'electric', assetId: 'electric.main', label: '电吉他', shortLabel: 'ELECTRIC', targetHeight: 1.08, role: 'frontline', defaultYaw: 0 },
  { id: 'acoustic', assetId: 'acoustic.main', label: '木吉他', shortLabel: 'ACOUSTIC', targetHeight: 1.1, role: 'frontline', defaultYaw: 0 },
  { id: 'bass', assetId: 'bass.main', label: 'Bass', shortLabel: 'BASS', targetHeight: 1.24, role: 'frontline', defaultYaw: 0 },
] as const;

export type LayoutInstrumentType = (typeof LAYOUT_INSTRUMENTS)[number]['id'];
export type LayoutRole = (typeof LAYOUT_INSTRUMENTS)[number]['role'];

export interface LayoutTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export interface LayoutInstrumentInstance {
  id: string;
  type: LayoutInstrumentType;
  transform: LayoutTransform;
}

export interface LayoutDocument {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  venueId: typeof LAYOUT_VENUE_ID;
  units: typeof LAYOUT_UNITS;
  name: string;
  instances: LayoutInstrumentInstance[];
}

export function createDefaultLayout(): LayoutDocument {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    venueId: LAYOUT_VENUE_ID,
    units: LAYOUT_UNITS,
    name: 'atelier-band-layout',
    instances: LAYOUT_INSTRUMENTS.map((definition) => ({
      id: `${definition.id}-1`,
      type: definition.id,
      transform: transform([0, 0, 0], [0, definition.defaultYaw, 0], 1),
    })),
  };
}

export function cloneLayout(document: LayoutDocument): LayoutDocument {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    venueId: LAYOUT_VENUE_ID,
    units: LAYOUT_UNITS,
    name: document.name,
    instances: document.instances.map((instance) => ({
      id: instance.id,
      type: instance.type,
      transform: cloneTransform(instance.transform),
    })),
  };
}

export function parseLayoutDocument(value: unknown): LayoutDocument {
  if (!isRecord(value)) throw new Error('JSON 根节点必须是对象');
  if (value.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
    throw new Error(`不支持的 schemaVersion：${String(value.schemaVersion)}`);
  }
  if (value.venueId !== LAYOUT_VENUE_ID) {
    throw new Error(`当前编辑器只接受 ${LAYOUT_VENUE_ID} 布局`);
  }
  if (value.units !== LAYOUT_UNITS) throw new Error(`当前编辑器只接受 ${LAYOUT_UNITS} 单位`);
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('布局名称不能为空');
  if (!Array.isArray(value.instances) || value.instances.length === 0) {
    throw new Error('instances 必须是非空数组');
  }
  if (value.instances.length > 64) throw new Error('布局最多包含 64 个乐器实例');

  const knownTypes = new Set<string>(LAYOUT_INSTRUMENTS.map((instrument) => instrument.id));
  const ids = new Set<string>();
  const instances = value.instances.map((raw, index): LayoutInstrumentInstance => {
    if (!isRecord(raw)) throw new Error(`instances[${index}] 必须是对象`);
    if (typeof raw.id !== 'string' || !/^[a-z][a-z0-9-]{0,48}$/.test(raw.id)) {
      throw new Error(`instances[${index}].id 格式无效`);
    }
    if (ids.has(raw.id)) throw new Error(`发现重复实例 ID：${raw.id}`);
    ids.add(raw.id);
    if (typeof raw.type !== 'string' || !knownTypes.has(raw.type)) {
      throw new Error(`未知乐器类型：${String(raw.type)}`);
    }
    if (!isRecord(raw.transform)) throw new Error(`${raw.id}.transform 必须是对象`);
    return {
      id: raw.id,
      type: raw.type as LayoutInstrumentType,
      transform: {
        position: numberTuple(raw.transform.position, `${raw.id}.position`),
        rotation: numberTuple(raw.transform.rotation, `${raw.id}.rotation`),
        scale: positiveNumber(raw.transform.scale, `${raw.id}.scale`),
      },
    };
  });

  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    venueId: LAYOUT_VENUE_ID,
    units: LAYOUT_UNITS,
    name: value.name.trim().slice(0, 80),
    instances,
  };
}

export function stringifyLayout(document: LayoutDocument): string {
  const rounded = cloneLayout(document);
  rounded.name = rounded.name.trim() || 'atelier-band-layout';
  for (const instance of rounded.instances) {
    instance.transform.position = instance.transform.position.map(round) as [number, number, number];
    instance.transform.rotation = instance.transform.rotation.map(round) as [number, number, number];
    instance.transform.scale = round(instance.transform.scale);
  }
  return `${JSON.stringify(rounded, null, 2)}\n`;
}

export function getInstrumentDefinition(type: LayoutInstrumentType) {
  const definition = LAYOUT_INSTRUMENTS.find((instrument) => instrument.id === type);
  if (!definition) throw new Error(`未知乐器类型：${type}`);
  return definition;
}

function transform(
  position: [number, number, number],
  rotation: [number, number, number],
  scale: number,
): LayoutTransform {
  return { position, rotation, scale };
}

function cloneTransform(source: LayoutTransform): LayoutTransform {
  return {
    position: [...source.position],
    rotation: [...source.rotation],
    scale: source.scale,
  };
}

function numberTuple(value: unknown, path: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${path} 必须包含 3 个数字`);
  if (!value.every((item): item is number => typeof item === 'number' && Number.isFinite(item))) {
    throw new Error(`${path} 包含无效数字`);
  }
  if (value.some((number) => Math.abs(number) > 100)) throw new Error(`${path} 超出安全范围`);
  return value as [number, number, number];
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10) {
    throw new Error(`${path} 必须在 0 到 10 之间`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
