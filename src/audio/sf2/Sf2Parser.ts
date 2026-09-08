export interface Sf2PresetInfo {
  readonly name: string;
  readonly program: number;
  readonly bank: number;
}

export interface Sf2SampleHeader {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly loopStart: number;
  readonly loopEnd: number;
  readonly sampleRate: number;
  readonly originalPitch: number;
  readonly pitchCorrection: number;
  readonly sampleLink: number;
  readonly sampleType: number;
}

export interface Sf2Region {
  readonly sampleId: number;
  readonly sample: Sf2SampleHeader;
  readonly start: number;
  readonly end: number;
  readonly loopStart: number;
  readonly loopEnd: number;
  readonly sampleModes: number;
  readonly exclusiveClass: number;
  readonly keyRange: readonly [number, number];
  readonly velocityRange: readonly [number, number];
  readonly coarseTune: number;
  readonly fineTune: number;
  readonly rootKey: number;
  readonly scaleTuning: number;
  readonly initialAttenuation: number;
  readonly pan: number;
  readonly modLfoToPitch: number;
  readonly vibLfoToPitch: number;
  readonly modEnvToPitch: number;
  readonly initialFilterFc: number;
  readonly initialFilterQ: number;
  readonly modLfoToFilterFc: number;
  readonly modEnvToFilterFc: number;
  readonly modLfoToVolume: number;
  readonly delayModLFO: number;
  readonly freqModLFO: number;
  readonly delayVibLFO: number;
  readonly freqVibLFO: number;
  readonly delayModEnv: number;
  readonly attackModEnv: number;
  readonly holdModEnv: number;
  readonly decayModEnv: number;
  readonly sustainModEnv: number;
  readonly releaseModEnv: number;
  readonly keynumToModEnvHold: number;
  readonly keynumToModEnvDecay: number;
  readonly delayVolEnv: number;
  readonly attackVolEnv: number;
  readonly holdVolEnv: number;
  readonly decayVolEnv: number;
  readonly sustainVolEnv: number;
  readonly releaseVolEnv: number;
  readonly keynumToVolEnvHold: number;
  readonly keynumToVolEnvDecay: number;
}

interface PresetHeader {
  readonly name: string;
  readonly program: number;
  readonly bank: number;
  readonly bagIndex: number;
}

interface InstrumentHeader {
  readonly name: string;
  readonly bagIndex: number;
}

interface BagRecord {
  readonly generatorIndex: number;
}

interface GeneratorRecord {
  readonly operator: number;
  readonly rawAmount: number;
  readonly signedAmount: number;
}

interface ChunkView {
  readonly id: string;
  readonly dataOffset: number;
  readonly size: number;
}

interface ZoneState {
  readonly values: Map<number, number>;
  keyRange: [number, number];
  velocityRange: [number, number];
}

const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4,
  modLfoToPitch: 5,
  vibLfoToPitch: 6,
  modEnvToPitch: 7,
  initialFilterFc: 8,
  initialFilterQ: 9,
  modLfoToFilterFc: 10,
  modEnvToFilterFc: 11,
  endAddrsCoarseOffset: 12,
  modLfoToVolume: 13,
  pan: 17,
  delayModLFO: 21,
  freqModLFO: 22,
  delayVibLFO: 23,
  freqVibLFO: 24,
  delayModEnv: 25,
  attackModEnv: 26,
  holdModEnv: 27,
  decayModEnv: 28,
  sustainModEnv: 29,
  releaseModEnv: 30,
  keynumToModEnvHold: 31,
  keynumToModEnvDecay: 32,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  keynumToVolEnvHold: 39,
  keynumToVolEnvDecay: 40,
  instrument: 41,
  keyRange: 43,
  velocityRange: 44,
  startloopAddrsCoarseOffset: 45,
  keynum: 46,
  velocity: 47,
  initialAttenuation: 48,
  endloopAddrsCoarseOffset: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  scaleTuning: 56,
  exclusiveClass: 57,
  overridingRootKey: 58,
} as const;

const ASSIGN_OPERATORS = new Set<number>([
  GEN.instrument,
  GEN.sampleID,
  GEN.sampleModes,
  GEN.keynum,
  GEN.velocity,
  GEN.exclusiveClass,
  GEN.overridingRootKey,
]);

const ILLEGAL_PRESET_OPERATORS = new Set<number>([
  GEN.startAddrsOffset,
  GEN.endAddrsOffset,
  GEN.startloopAddrsOffset,
  GEN.endloopAddrsOffset,
  GEN.startAddrsCoarseOffset,
  GEN.endAddrsCoarseOffset,
  GEN.startloopAddrsCoarseOffset,
  GEN.keynum,
  GEN.velocity,
  GEN.endloopAddrsCoarseOffset,
  GEN.sampleID,
  GEN.sampleModes,
  GEN.exclusiveClass,
  GEN.overridingRootKey,
]);

export class Sf2SoundFont {
  private readonly data: ArrayBuffer;
  private readonly presets: readonly PresetHeader[];
  private readonly presetBags: readonly BagRecord[];
  private readonly presetGenerators: readonly GeneratorRecord[];
  private readonly instruments: readonly InstrumentHeader[];
  private readonly instrumentBags: readonly BagRecord[];
  private readonly instrumentGenerators: readonly GeneratorRecord[];
  private readonly samples: readonly Sf2SampleHeader[];
  private readonly sampleDataOffset: number;
  private readonly samplePointCount: number;

  constructor(options: {
    data: ArrayBuffer;
    presets: readonly PresetHeader[];
    presetBags: readonly BagRecord[];
    presetGenerators: readonly GeneratorRecord[];
    instruments: readonly InstrumentHeader[];
    instrumentBags: readonly BagRecord[];
    instrumentGenerators: readonly GeneratorRecord[];
    samples: readonly Sf2SampleHeader[];
    sampleDataOffset: number;
    samplePointCount: number;
  }) {
    this.data = options.data;
    this.presets = options.presets;
    this.presetBags = options.presetBags;
    this.presetGenerators = options.presetGenerators;
    this.instruments = options.instruments;
    this.instrumentBags = options.instrumentBags;
    this.instrumentGenerators = options.instrumentGenerators;
    this.samples = options.samples;
    this.sampleDataOffset = options.sampleDataOffset;
    this.samplePointCount = options.samplePointCount;
  }

  listPresets(): Sf2PresetInfo[] {
    return this.presets.slice(0, -1).map((preset) => ({
      name: preset.name,
      program: preset.program,
      bank: preset.bank,
    }));
  }

  resolveRegions(bank: number, program: number, key: number, velocity: number): Sf2Region[] {
    const presetIndex = this.presets.slice(0, -1).findIndex(
      (preset) => preset.bank === bank && preset.program === program,
    );
    if (presetIndex < 0) return [];

    const presetZones = this.readZones(
      this.presets[presetIndex].bagIndex,
      this.presets[presetIndex + 1].bagIndex,
      this.presetBags,
      this.presetGenerators,
    );
    const presetGlobal = presetZones.find((zone) => !hasOperator(zone, GEN.instrument)) ?? [];
    const regions: Sf2Region[] = [];

    for (const presetLocal of presetZones) {
      const instrumentGenerator = presetLocal.find((generator) => generator.operator === GEN.instrument);
      if (!instrumentGenerator) continue;

      const instrumentIndex = instrumentGenerator.rawAmount;
      const instrument = this.instruments[instrumentIndex];
      const nextInstrument = this.instruments[instrumentIndex + 1];
      if (!instrument || !nextInstrument) continue;

      const presetState = mergeZoneOverrides(presetGlobal, presetLocal);
      if (!matchesRange(presetState, key, velocity)) continue;

      const instrumentZones = this.readZones(
        instrument.bagIndex,
        nextInstrument.bagIndex,
        this.instrumentBags,
        this.instrumentGenerators,
      );
      const instrumentGlobal = instrumentZones.find((zone) => !hasOperator(zone, GEN.sampleID)) ?? [];

      for (const instrumentLocal of instrumentZones) {
        const sampleGenerator = instrumentLocal.find((generator) => generator.operator === GEN.sampleID);
        if (!sampleGenerator) continue;

        const instrumentState = mergeZoneOverrides(instrumentGlobal, instrumentLocal);
        const state = mergePresetWithInstrument(presetState, instrumentState);
        if (!matchesRange(state, key, velocity)) continue;

        const sampleId = sampleGenerator.rawAmount;
        const sample = this.samples[sampleId];
        if (!sample) continue;

        const start = clampSamplePoint(
          sample.start
            + getValue(state, GEN.startAddrsOffset)
            + getValue(state, GEN.startAddrsCoarseOffset) * 32768,
          this.samplePointCount,
        );
        const end = clampSamplePoint(
          sample.end
            + getValue(state, GEN.endAddrsOffset)
            + getValue(state, GEN.endAddrsCoarseOffset) * 32768,
          this.samplePointCount,
        );
        const loopStart = clampSamplePoint(
          sample.loopStart
            + getValue(state, GEN.startloopAddrsOffset)
            + getValue(state, GEN.startloopAddrsCoarseOffset) * 32768,
          this.samplePointCount,
        );
        const loopEnd = clampSamplePoint(
          sample.loopEnd
            + getValue(state, GEN.endloopAddrsOffset)
            + getValue(state, GEN.endloopAddrsCoarseOffset) * 32768,
          this.samplePointCount,
        );
        if (end <= start + 1) continue;

        const overrideRoot = getValue(state, GEN.overridingRootKey);
        regions.push({
          sampleId,
          sample,
          start,
          end,
          loopStart: Math.max(start, Math.min(end, loopStart)),
          loopEnd: Math.max(start, Math.min(end, loopEnd)),
          sampleModes: getValue(state, GEN.sampleModes) & 0x3,
          exclusiveClass: getValue(state, GEN.exclusiveClass),
          keyRange: state.keyRange,
          velocityRange: state.velocityRange,
          coarseTune: getValue(state, GEN.coarseTune),
          fineTune: getValue(state, GEN.fineTune),
          rootKey: overrideRoot >= 0 && overrideRoot <= 127 ? overrideRoot : sample.originalPitch,
          scaleTuning: getValue(state, GEN.scaleTuning),
          initialAttenuation: Math.max(0, getValue(state, GEN.initialAttenuation)),
          pan: clamp(getValue(state, GEN.pan), -500, 500),
          modLfoToPitch: clamp(getValue(state, GEN.modLfoToPitch), -12000, 12000),
          vibLfoToPitch: clamp(getValue(state, GEN.vibLfoToPitch), -12000, 12000),
          modEnvToPitch: clamp(getValue(state, GEN.modEnvToPitch), -12000, 12000),
          initialFilterFc: clamp(getValue(state, GEN.initialFilterFc), 1500, 13500),
          initialFilterQ: clamp(getValue(state, GEN.initialFilterQ), 0, 960),
          modLfoToFilterFc: clamp(getValue(state, GEN.modLfoToFilterFc), -12000, 12000),
          modEnvToFilterFc: clamp(getValue(state, GEN.modEnvToFilterFc), -12000, 12000),
          modLfoToVolume: clamp(getValue(state, GEN.modLfoToVolume), -960, 960),
          delayModLFO: getValue(state, GEN.delayModLFO),
          freqModLFO: clamp(getValue(state, GEN.freqModLFO), -16000, 4500),
          delayVibLFO: getValue(state, GEN.delayVibLFO),
          freqVibLFO: clamp(getValue(state, GEN.freqVibLFO), -16000, 4500),
          delayModEnv: getValue(state, GEN.delayModEnv),
          attackModEnv: getValue(state, GEN.attackModEnv),
          holdModEnv: getValue(state, GEN.holdModEnv),
          decayModEnv: getValue(state, GEN.decayModEnv),
          sustainModEnv: clamp(getValue(state, GEN.sustainModEnv), 0, 1000),
          releaseModEnv: getValue(state, GEN.releaseModEnv),
          keynumToModEnvHold: clamp(getValue(state, GEN.keynumToModEnvHold), -1200, 1200),
          keynumToModEnvDecay: clamp(getValue(state, GEN.keynumToModEnvDecay), -1200, 1200),
          delayVolEnv: getValue(state, GEN.delayVolEnv),
          attackVolEnv: getValue(state, GEN.attackVolEnv),
          holdVolEnv: getValue(state, GEN.holdVolEnv),
          decayVolEnv: getValue(state, GEN.decayVolEnv),
          sustainVolEnv: getValue(state, GEN.sustainVolEnv),
          releaseVolEnv: getValue(state, GEN.releaseVolEnv),
          keynumToVolEnvHold: clamp(getValue(state, GEN.keynumToVolEnvHold), -1200, 1200),
          keynumToVolEnvDecay: clamp(getValue(state, GEN.keynumToVolEnvDecay), -1200, 1200),
        });
      }
    }

    return regions;
  }

  getPcm16(start: number, end: number): Int16Array {
    const safeStart = clampSamplePoint(start, this.samplePointCount);
    const safeEnd = clampSamplePoint(end, this.samplePointCount);
    if (safeEnd <= safeStart) return new Int16Array(0);
    return new Int16Array(this.data, this.sampleDataOffset + safeStart * 2, safeEnd - safeStart);
  }

  private readZones(
    firstBag: number,
    endBag: number,
    bags: readonly BagRecord[],
    generators: readonly GeneratorRecord[],
  ): GeneratorRecord[][] {
    const zones: GeneratorRecord[][] = [];
    for (let bagIndex = firstBag; bagIndex < endBag; bagIndex += 1) {
      const bag = bags[bagIndex];
      const next = bags[bagIndex + 1];
      if (!bag || !next) continue;
      zones.push(generators.slice(bag.generatorIndex, next.generatorIndex));
    }
    return zones;
  }
}

export function parseSf2(data: ArrayBuffer): Sf2SoundFont {
  const view = new DataView(data);
  if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'sfbk') {
    throw new Error('Invalid SF2: expected RIFF/sfbk');
  }

  const riffEnd = Math.min(data.byteLength, 8 + view.getUint32(4, true));
  const topLevel = scanChunks(view, 12, riffEnd);
  const sdta = topLevel.find((chunk) => chunk.id === 'LIST' && readFourCC(view, chunk.dataOffset) === 'sdta');
  const pdta = topLevel.find((chunk) => chunk.id === 'LIST' && readFourCC(view, chunk.dataOffset) === 'pdta');
  if (!sdta || !pdta) throw new Error('Invalid SF2: missing sdta or pdta LIST');

  const sdtaChunks = scanChunks(view, sdta.dataOffset + 4, sdta.dataOffset + sdta.size);
  const smpl = sdtaChunks.find((chunk) => chunk.id === 'smpl');
  if (!smpl) throw new Error('Invalid SF2: missing sdta/smpl');

  const pdtaChunks = new Map(
    scanChunks(view, pdta.dataOffset + 4, pdta.dataOffset + pdta.size)
      .map((chunk) => [chunk.id, chunk] as const),
  );

  const phdr = requiredChunk(pdtaChunks, 'phdr');
  const pbag = requiredChunk(pdtaChunks, 'pbag');
  const pgen = requiredChunk(pdtaChunks, 'pgen');
  const inst = requiredChunk(pdtaChunks, 'inst');
  const ibag = requiredChunk(pdtaChunks, 'ibag');
  const igen = requiredChunk(pdtaChunks, 'igen');
  const shdr = requiredChunk(pdtaChunks, 'shdr');

  return new Sf2SoundFont({
    data,
    presets: parsePresetHeaders(view, phdr),
    presetBags: parseBags(view, pbag),
    presetGenerators: parseGenerators(view, pgen),
    instruments: parseInstrumentHeaders(view, inst),
    instrumentBags: parseBags(view, ibag),
    instrumentGenerators: parseGenerators(view, igen),
    samples: parseSampleHeaders(view, shdr),
    sampleDataOffset: smpl.dataOffset,
    samplePointCount: Math.floor(smpl.size / 2),
  });
}

function scanChunks(view: DataView, start: number, end: number): ChunkView[] {
  const chunks: ChunkView[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + size > end + 1) throw new Error(`Invalid SF2 chunk ${id}: out of bounds`);
    chunks.push({ id, dataOffset, size });
    offset = dataOffset + size + (size & 1);
  }
  return chunks;
}

function parsePresetHeaders(view: DataView, chunk: ChunkView): PresetHeader[] {
  assertRecordSize(chunk, 38, 'phdr');
  const records: PresetHeader[] = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataOffset + chunk.size; offset += 38) {
    records.push({
      name: readFixedString(view, offset, 20),
      program: view.getUint16(offset + 20, true),
      bank: view.getUint16(offset + 22, true),
      bagIndex: view.getUint16(offset + 24, true),
    });
  }
  return records;
}

function parseInstrumentHeaders(view: DataView, chunk: ChunkView): InstrumentHeader[] {
  assertRecordSize(chunk, 22, 'inst');
  const records: InstrumentHeader[] = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataOffset + chunk.size; offset += 22) {
    records.push({
      name: readFixedString(view, offset, 20),
      bagIndex: view.getUint16(offset + 20, true),
    });
  }
  return records;
}

function parseBags(view: DataView, chunk: ChunkView): BagRecord[] {
  assertRecordSize(chunk, 4, chunk.id);
  const records: BagRecord[] = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataOffset + chunk.size; offset += 4) {
    records.push({ generatorIndex: view.getUint16(offset, true) });
  }
  return records;
}

function parseGenerators(view: DataView, chunk: ChunkView): GeneratorRecord[] {
  assertRecordSize(chunk, 4, chunk.id);
  const records: GeneratorRecord[] = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataOffset + chunk.size; offset += 4) {
    records.push({
      operator: view.getUint16(offset, true),
      rawAmount: view.getUint16(offset + 2, true),
      signedAmount: view.getInt16(offset + 2, true),
    });
  }
  return records;
}

function parseSampleHeaders(view: DataView, chunk: ChunkView): Sf2SampleHeader[] {
  assertRecordSize(chunk, 46, 'shdr');
  const records: Sf2SampleHeader[] = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataOffset + chunk.size; offset += 46) {
    records.push({
      name: readFixedString(view, offset, 20),
      start: view.getUint32(offset + 20, true),
      end: view.getUint32(offset + 24, true),
      loopStart: view.getUint32(offset + 28, true),
      loopEnd: view.getUint32(offset + 32, true),
      sampleRate: view.getUint32(offset + 36, true),
      originalPitch: view.getUint8(offset + 40),
      pitchCorrection: view.getInt8(offset + 41),
      sampleLink: view.getUint16(offset + 42, true),
      sampleType: view.getUint16(offset + 44, true),
    });
  }
  return records;
}

function mergeZoneOverrides(
  globalZone: readonly GeneratorRecord[],
  localZone: readonly GeneratorRecord[],
): ZoneState {
  const state: ZoneState = {
    values: new Map<number, number>(),
    keyRange: [0, 127],
    velocityRange: [0, 127],
  };
  applyZoneOverrides(state, globalZone);
  applyZoneOverrides(state, localZone);
  return state;
}

function applyZoneOverrides(state: ZoneState, zone: readonly GeneratorRecord[]): void {
  for (const generator of zone) {
    if (generator.operator === GEN.keyRange || generator.operator === GEN.velocityRange) {
      const low = generator.rawAmount & 0xff;
      const high = (generator.rawAmount >>> 8) & 0xff;
      const target = generator.operator === GEN.keyRange ? state.keyRange : state.velocityRange;
      target[0] = Math.max(target[0], low);
      target[1] = Math.min(target[1], high);
      continue;
    }

    const amount = ASSIGN_OPERATORS.has(generator.operator)
      ? generator.rawAmount
      : generator.signedAmount;
    state.values.set(generator.operator, amount);
  }
}

function mergePresetWithInstrument(preset: ZoneState, instrument: ZoneState): ZoneState {
  const state: ZoneState = {
    values: new Map(instrument.values),
    keyRange: [
      Math.max(preset.keyRange[0], instrument.keyRange[0]),
      Math.min(preset.keyRange[1], instrument.keyRange[1]),
    ],
    velocityRange: [
      Math.max(preset.velocityRange[0], instrument.velocityRange[0]),
      Math.min(preset.velocityRange[1], instrument.velocityRange[1]),
    ],
  };

  for (const [operator, offset] of preset.values) {
    if (operator === GEN.instrument || ILLEGAL_PRESET_OPERATORS.has(operator)) continue;
    const base = state.values.get(operator) ?? defaultGeneratorValue(operator);
    state.values.set(operator, base + offset);
  }
  return state;
}

function hasOperator(zone: readonly GeneratorRecord[], operator: number): boolean {
  return zone.some((generator) => generator.operator === operator);
}

function matchesRange(state: ZoneState, key: number, velocity: number): boolean {
  return key >= state.keyRange[0]
    && key <= state.keyRange[1]
    && velocity >= state.velocityRange[0]
    && velocity <= state.velocityRange[1];
}

function getValue(state: ZoneState, operator: number): number {
  return state.values.get(operator) ?? defaultGeneratorValue(operator);
}

function defaultGeneratorValue(operator: number): number {
  if (operator === GEN.initialFilterFc) return 13500;
  if (
    operator === GEN.delayModLFO
    || operator === GEN.delayVibLFO
    || operator === GEN.delayModEnv
    || operator === GEN.attackModEnv
    || operator === GEN.holdModEnv
    || operator === GEN.decayModEnv
    || operator === GEN.releaseModEnv
    || operator === GEN.delayVolEnv
    || operator === GEN.attackVolEnv
    || operator === GEN.holdVolEnv
    || operator === GEN.decayVolEnv
    || operator === GEN.releaseVolEnv
  ) return -12000;
  if (operator === GEN.scaleTuning) return 100;
  if (operator === GEN.overridingRootKey) return -1;
  return 0;
}

function requiredChunk(chunks: ReadonlyMap<string, ChunkView>, id: string): ChunkView {
  const chunk = chunks.get(id);
  if (!chunk) throw new Error(`Invalid SF2: missing pdta/${id}`);
  return chunk;
}

function assertRecordSize(chunk: ChunkView, recordSize: number, name: string): void {
  if (chunk.size % recordSize !== 0) {
    throw new Error(`Invalid SF2 ${name}: ${chunk.size} is not a multiple of ${recordSize}`);
  }
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readFixedString(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    const value = view.getUint8(offset + index);
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result;
}

function clampSamplePoint(value: number, samplePointCount: number): number {
  return Math.max(0, Math.min(samplePointCount, Math.trunc(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
