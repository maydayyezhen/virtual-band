export interface MeterEnergyBlock {
  readonly sumSquares: number;
  readonly peak: number;
  readonly frames: number;
  readonly channels: number;
}

export interface CalibrationMetrics {
  readonly peakDbfs: number;
  readonly rmsDbfs: number;
  readonly integratedLufs: number;
  readonly crestFactorDb: number;
  readonly measuredSeconds: number;
  readonly gatedWindowCount: number;
}

const LUFS_OFFSET = -0.691;
const ABSOLUTE_GATE_LUFS = -70;
const WINDOW_BLOCKS = 4;

export function summarizeCalibrationMetrics(
  rawBlocks: readonly MeterEnergyBlock[],
  weightedBlocks: readonly MeterEnergyBlock[],
  sampleRate: number,
): CalibrationMetrics {
  const rawFrames = rawBlocks.reduce((sum, block) => sum + valid(block.frames), 0);
  const rawSamples = rawBlocks.reduce(
    (sum, block) => sum + valid(block.frames) * Math.max(1, Math.round(valid(block.channels))),
    0,
  );
  const rawPower = rawSamples > 0
    ? rawBlocks.reduce((sum, block) => sum + valid(block.sumSquares), 0) / rawSamples
    : 0;
  const peak = rawBlocks.reduce((value, block) => Math.max(value, valid(block.peak)), 0);

  const loudness = integratedLufsFromBlocks(weightedBlocks);
  const peakDbfs = amplitudeToDb(peak);
  const rmsDbfs = powerToDb(rawPower);

  return {
    peakDbfs,
    rmsDbfs,
    integratedLufs: loudness.value,
    crestFactorDb: finiteDb(peakDbfs - rmsDbfs),
    measuredSeconds: sampleRate > 0 ? rawFrames / sampleRate : 0,
    gatedWindowCount: loudness.windowCount,
  };
}

export function integratedLufsFromBlocks(
  blocks: readonly MeterEnergyBlock[],
): { value: number; windowCount: number } {
  const validBlocks = blocks
    .filter((block) => block.frames > 0 && block.sumSquares >= 0)
    .map((block) => ({
      energy: block.sumSquares,
      frames: block.frames,
    }));

  if (validBlocks.length === 0) return { value: Number.NEGATIVE_INFINITY, windowCount: 0 };

  const windows: number[] = [];
  if (validBlocks.length < WINDOW_BLOCKS) {
    const totalEnergy = validBlocks.reduce((sum, block) => sum + block.energy, 0);
    const totalFrames = validBlocks.reduce((sum, block) => sum + block.frames, 0);
    if (totalFrames > 0) windows.push(totalEnergy / totalFrames);
  } else {
    for (let end = WINDOW_BLOCKS - 1; end < validBlocks.length; end += 1) {
      let energy = 0;
      let frames = 0;
      for (let index = end - WINDOW_BLOCKS + 1; index <= end; index += 1) {
        energy += validBlocks[index].energy;
        frames += validBlocks[index].frames;
      }
      if (frames > 0) windows.push(energy / frames);
    }
  }

  const absoluteGated = windows.filter((power) => powerToLufs(power) >= ABSOLUTE_GATE_LUFS);
  if (absoluteGated.length === 0) {
    return { value: Number.NEGATIVE_INFINITY, windowCount: 0 };
  }

  const preliminaryPower = mean(absoluteGated);
  const relativeGate = powerToLufs(preliminaryPower) - 10;
  const gate = Math.max(ABSOLUTE_GATE_LUFS, relativeGate);
  const finalWindows = absoluteGated.filter((power) => powerToLufs(power) >= gate);
  if (finalWindows.length === 0) {
    return { value: Number.NEGATIVE_INFINITY, windowCount: 0 };
  }

  return {
    value: powerToLufs(mean(finalWindows)),
    windowCount: finalWindows.length,
  };
}

export function powerToLufs(power: number): number {
  if (!(power > 0) || !Number.isFinite(power)) return Number.NEGATIVE_INFINITY;
  return LUFS_OFFSET + 10 * Math.log10(power);
}

export function powerToDb(power: number): number {
  if (!(power > 0) || !Number.isFinite(power)) return Number.NEGATIVE_INFINITY;
  return 10 * Math.log10(power);
}

export function amplitudeToDb(amplitude: number): number {
  if (!(amplitude > 0) || !Number.isFinite(amplitude)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(amplitude);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function valid(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteDb(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
