import assert from 'node:assert/strict';
import {
  amplitudeToDb,
  integratedLufsFromBlocks,
  powerToDb,
  powerToLufs,
  summarizeCalibrationMetrics,
} from '../src/audio/calibration/LoudnessMath.ts';

const oneSecondMono = Array.from({ length: 10 }, () => ({
  sumSquares: 4800,
  peak: 1,
  frames: 4800,
  channels: 1,
}));

assert.equal(powerToDb(1), 0);
assert.equal(amplitudeToDb(1), 0);
assert.ok(Math.abs(powerToLufs(1) - (-0.691)) < 1e-12);

const integrated = integratedLufsFromBlocks(oneSecondMono);
assert.ok(Math.abs(integrated.value - (-0.691)) < 1e-9);
assert.ok(integrated.windowCount > 0);

const summary = summarizeCalibrationMetrics(oneSecondMono, oneSecondMono, 48000);
assert.ok(Math.abs(summary.peakDbfs) < 1e-12);
assert.ok(Math.abs(summary.rmsDbfs) < 1e-12);
assert.ok(Math.abs(summary.integratedLufs - (-0.691)) < 1e-9);
assert.ok(Math.abs(summary.measuredSeconds - 1) < 1e-12);

const silence = integratedLufsFromBlocks([
  { sumSquares: 0, peak: 0, frames: 4800, channels: 1 },
]);
assert.equal(silence.value, Number.NEGATIVE_INFINITY);
assert.equal(silence.windowCount, 0);

console.log('Audio calibration math verification passed');
