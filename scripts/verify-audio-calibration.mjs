import assert from 'node:assert/strict';
import {
  amplitudeToDb,
  integratedLufsFromBlocks,
  powerToDb,
  powerToLufs,
  summarizeCalibrationMetrics,
} from '../src/audio/calibration/LoudnessMath.ts';
import {
  buildCalibrationPlan,
  CALIBRATION_SAMPLE_PEAK_CEILING_DBFS,
} from '../src/audio/calibration/CalibrationPlan.ts';
import {
  calibrationTarget,
  currentCalibrationMix,
} from '../src/audio/calibration/CalibrationTargets.ts';

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

// Family-relative planning is verified with a captured electric-guitar data set.
// The family target starts at the median measured loudness, then moves downward
// only when a quiet preset cannot safely reach that center without exceeding the
// sample-peak ceiling.
const electricRows = [
  ['electric.26', -26.79, -14.48],
  ['electric.27', -21.70, -7.66],
  ['electric.28', -32.74, -15.36],
  ['electric.29', -16.10, -5.05],
  ['electric.30', -11.02, -1.58],
  ['electric.31', -15.91, -5.95],
];
const electricResults = Object.fromEntries(
  electricRows.map(([targetId, lufs, peakDbfs]) => [
    targetId,
    fakeResult(targetId, lufs, peakDbfs),
  ]),
);
const electricPlan = buildCalibrationPlan(electricResults, -22);
const electricFamily = electricPlan.families.find((family) => family.group === 'electric.programs');
assert.ok(electricFamily?.complete);
assert.ok(Math.abs(electricFamily.centerLufs - (-18.9)) < 1e-9);
assert.ok(Math.abs(electricFamily.referenceLufs - (-20.38)) < 1e-9);
assert.equal(electricFamily.constraint, 'sample-peak');
assert.equal(electricFamily.constraintTargetId, 'electric.28');
assert.ok(Math.abs(electricFamily.suggestedInstrumentTrimDb - (-4.325)) < 1e-9);

const muted = electricPlan.recommendations['electric.28'];
assert.equal(muted.status, 'headroom-anchor');
assert.ok(Math.abs(muted.adjustmentDb - 12.36) < 1e-9);
assert.ok(Math.abs(muted.predictedPeakDbfs - CALIBRATION_SAMPLE_PEAK_CEILING_DBFS) < 1e-9);
assert.ok(Math.abs(muted.suggestedProgramTrimDb - 16.435) < 1e-9);

const distortion = electricPlan.recommendations['electric.30'];
assert.equal(distortion.status, 'ready');
assert.ok(Math.abs(distortion.adjustmentDb - (-9.36)) < 1e-9);
assert.ok(distortion.predictedPeakDbfs < CALIBRATION_SAMPLE_PEAK_CEILING_DBFS);

// A single program is deliberately not enough to create a stable family plan.
const partialPlan = buildCalibrationPlan({
  'electric.27': electricResults['electric.27'],
});
assert.equal(partialPlan.recommendations['electric.27'].status, 'awaiting-family');

// Cross-instrument/articulation targets stay diagnostic-only instead of being
// forced toward the absolute LUFS reference.
const diagnosticPlan = buildCalibrationPlan({
  drums: fakeResult('drums', -27.32, -6.21),
}, -22);
const drums = diagnosticPlan.recommendations.drums;
assert.equal(drums.status, 'diagnostic-only');
assert.equal(drums.adjustmentDb, undefined);
assert.ok(Math.abs(drums.diagnosticDeltaDb - 5.32) < 1e-9);

console.log('Audio calibration math and family-plan verification passed');

function fakeResult(targetId, integratedLufs, peakDbfs) {
  const target = calibrationTarget(targetId);
  const mix = currentCalibrationMix(target);
  return {
    targetId,
    label: target.label,
    source: targetId === 'violin.pizzicato' ? 'MP3 fallback' : 'SF2',
    currentInstrumentTrimDb: mix.instrumentTrimDb,
    currentProgramTrimDb: mix.programTrimDb,
    currentTrimDb: mix.effectiveTrimDb,
    metrics: {
      integratedLufs,
      peakDbfs,
      rmsDbfs: integratedLufs - 4,
      crestFactorDb: peakDbfs - (integratedLufs - 4),
      measuredSeconds: 4,
      gatedWindowCount: 12,
    },
  };
}
