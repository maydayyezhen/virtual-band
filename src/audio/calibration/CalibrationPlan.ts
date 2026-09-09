import type { AudioCalibrationResult } from './AudioCalibrationHarness.ts';
import {
  CALIBRATION_TARGETS,
  calibrationTargetsInGroup,
  type CalibrationComparisonGroup,
  type CalibrationTarget,
} from './CalibrationTargets.ts';

export const CALIBRATION_SAMPLE_PEAK_CEILING_DBFS = -3;
export const MAX_FAMILY_NORMALIZATION_DB = 18;

export type CalibrationRecommendationBasis =
  | 'family-relative'
  | 'absolute-diagnostic';

export type CalibrationRecommendationStatus =
  | 'ready'
  | 'headroom-anchor'
  | 'range-limited'
  | 'awaiting-family'
  | 'diagnostic-only'
  | 'invalid';

export type CalibrationFamilyConstraint =
  | 'none'
  | 'sample-peak'
  | 'boost-range';

export interface CalibrationRecommendation {
  readonly targetId: string;
  readonly basis: CalibrationRecommendationBasis;
  readonly status: CalibrationRecommendationStatus;
  readonly comparisonGroup?: CalibrationComparisonGroup;
  readonly absoluteReferenceLufs: number;
  readonly diagnosticDeltaDb: number;
  readonly familyCenterLufs?: number;
  readonly targetLufs?: number;
  readonly adjustmentDb?: number;
  readonly achievedLufs?: number;
  readonly residualLufs?: number;
  readonly currentInstrumentTrimDb: number;
  readonly currentProgramTrimDb: number;
  readonly currentEffectiveTrimDb: number;
  readonly suggestedInstrumentTrimDb?: number;
  readonly suggestedProgramTrimDb?: number;
  readonly suggestedEffectiveTrimDb?: number;
  readonly predictedPeakDbfs?: number;
}

export interface CalibrationFamilyPlan {
  readonly group: CalibrationComparisonGroup;
  readonly label: string;
  readonly targetIds: readonly string[];
  readonly measuredCount: number;
  readonly totalCount: number;
  readonly complete: boolean;
  readonly centerLufs?: number;
  readonly referenceLufs?: number;
  readonly referenceShiftDb?: number;
  readonly constraint: CalibrationFamilyConstraint;
  readonly constraintTargetId?: string;
  readonly suggestedInstrumentTrimDb?: number;
}

export interface CalibrationPlan {
  readonly absoluteReferenceLufs: number;
  readonly samplePeakCeilingDbfs: number;
  readonly maxFamilyNormalizationDb: number;
  readonly recommendations: Readonly<Record<string, CalibrationRecommendation>>;
  readonly families: readonly CalibrationFamilyPlan[];
}

interface ProvisionalFamilyRecommendation {
  readonly target: CalibrationTarget;
  readonly result: AudioCalibrationResult;
  readonly desiredAdjustmentDb: number;
  readonly adjustmentDb: number;
  readonly achievedLufs: number;
  readonly predictedPeakDbfs: number;
  readonly suggestedEffectiveTrimDb: number;
  readonly status: CalibrationRecommendationStatus;
}

export function buildCalibrationPlan(
  results: Readonly<Record<string, AudioCalibrationResult>>,
  absoluteReferenceLufs = -22,
): CalibrationPlan {
  const absoluteReference = normalizeReference(absoluteReferenceLufs);
  const recommendations: Record<string, CalibrationRecommendation> = {};
  const families: CalibrationFamilyPlan[] = [];

  for (const target of CALIBRATION_TARGETS) {
    const result = results[target.id];
    if (!result) continue;
    if (!Number.isFinite(result.metrics.integratedLufs)) {
      recommendations[target.id] = baseRecommendation(
        target,
        result,
        absoluteReference,
        'absolute-diagnostic',
        'invalid',
      );
      continue;
    }
    if (!target.comparisonGroup) {
      recommendations[target.id] = baseRecommendation(
        target,
        result,
        absoluteReference,
        'absolute-diagnostic',
        'diagnostic-only',
      );
    }
  }

  const groups = uniqueComparisonGroups();
  for (const group of groups) {
    const targets = calibrationTargetsInGroup(group);
    const measured = targets
      .map((target) => ({ target, result: results[target.id] }))
      .filter((entry): entry is { target: CalibrationTarget; result: AudioCalibrationResult } =>
        Boolean(entry.result) && Number.isFinite(entry.result.metrics.integratedLufs));

    if (measured.length !== targets.length) {
      families.push({
        group,
        label: targets[0]?.family ?? group,
        targetIds: targets.map((target) => target.id),
        measuredCount: measured.length,
        totalCount: targets.length,
        complete: false,
        constraint: 'none',
      });
      for (const { target, result } of measured) {
        recommendations[target.id] = baseRecommendation(
          target,
          result,
          absoluteReference,
          'family-relative',
          'awaiting-family',
        );
      }
      continue;
    }

    const familyPlan = buildFamilyPlan(group, targets, measured, absoluteReference);
    families.push(familyPlan.family);
    Object.assign(recommendations, familyPlan.recommendations);
  }

  return {
    absoluteReferenceLufs: absoluteReference,
    samplePeakCeilingDbfs: CALIBRATION_SAMPLE_PEAK_CEILING_DBFS,
    maxFamilyNormalizationDb: MAX_FAMILY_NORMALIZATION_DB,
    recommendations,
    families,
  };
}

export function isActionableRecommendation(
  recommendation: CalibrationRecommendation | undefined,
): recommendation is CalibrationRecommendation & { adjustmentDb: number } {
  return Boolean(
    recommendation
    && recommendation.basis === 'family-relative'
    && recommendation.adjustmentDb !== undefined
    && recommendation.status !== 'awaiting-family'
    && recommendation.status !== 'invalid',
  );
}

function buildFamilyPlan(
  group: CalibrationComparisonGroup,
  targets: readonly CalibrationTarget[],
  measured: readonly { target: CalibrationTarget; result: AudioCalibrationResult }[],
  absoluteReference: number,
): {
  family: CalibrationFamilyPlan;
  recommendations: Record<string, CalibrationRecommendation>;
} {
  const centerLufs = median(measured.map(({ result }) => result.metrics.integratedLufs));
  let referenceLufs = centerLufs;
  let constraint: CalibrationFamilyConstraint = 'none';
  let constraintTargetId: string | undefined;

  for (const { target, result } of measured) {
    const measuredLufs = result.metrics.integratedLufs;
    if (measuredLufs >= centerLufs) continue;

    const peakBudget = Number.isFinite(result.metrics.peakDbfs)
      ? Math.max(0, CALIBRATION_SAMPLE_PEAK_CEILING_DBFS - result.metrics.peakDbfs)
      : MAX_FAMILY_NORMALIZATION_DB;
    const positiveBudget = Math.min(MAX_FAMILY_NORMALIZATION_DB, peakBudget);
    const safeReference = measuredLufs + positiveBudget;
    if (safeReference < referenceLufs - 1e-9) {
      referenceLufs = safeReference;
      constraintTargetId = target.id;
      constraint = peakBudget <= MAX_FAMILY_NORMALIZATION_DB
        ? 'sample-peak'
        : 'boost-range';
    }
  }

  const provisional: ProvisionalFamilyRecommendation[] = measured.map(({ target, result }) => {
    const measuredLufs = result.metrics.integratedLufs;
    const desiredAdjustmentDb = referenceLufs - measuredLufs;
    const adjustmentDb = clamp(
      desiredAdjustmentDb,
      -MAX_FAMILY_NORMALIZATION_DB,
      MAX_FAMILY_NORMALIZATION_DB,
    );
    const rangeLimited = Math.abs(adjustmentDb - desiredAdjustmentDb) > 1e-9;
    const achievedLufs = measuredLufs + adjustmentDb;
    const predictedPeakDbfs = Number.isFinite(result.metrics.peakDbfs)
      ? result.metrics.peakDbfs + adjustmentDb
      : Number.NEGATIVE_INFINITY;

    return {
      target,
      result,
      desiredAdjustmentDb,
      adjustmentDb,
      achievedLufs,
      predictedPeakDbfs,
      suggestedEffectiveTrimDb: result.currentTrimDb + adjustmentDb,
      status: rangeLimited
        ? 'range-limited'
        : target.id === constraintTargetId && constraint === 'sample-peak'
          ? 'headroom-anchor'
          : 'ready',
    };
  });

  const suggestedInstrumentTrimDb = median(
    provisional.map((entry) => entry.suggestedEffectiveTrimDb),
  );
  const recommendations: Record<string, CalibrationRecommendation> = {};

  for (const entry of provisional) {
    const { target, result } = entry;
    recommendations[target.id] = {
      targetId: target.id,
      basis: 'family-relative',
      status: entry.status,
      comparisonGroup: group,
      absoluteReferenceLufs: absoluteReference,
      diagnosticDeltaDb: absoluteReference - result.metrics.integratedLufs,
      familyCenterLufs: centerLufs,
      targetLufs: referenceLufs,
      adjustmentDb: entry.adjustmentDb,
      achievedLufs: entry.achievedLufs,
      residualLufs: referenceLufs - entry.achievedLufs,
      currentInstrumentTrimDb: result.currentInstrumentTrimDb,
      currentProgramTrimDb: result.currentProgramTrimDb,
      currentEffectiveTrimDb: result.currentTrimDb,
      suggestedInstrumentTrimDb,
      suggestedProgramTrimDb: entry.suggestedEffectiveTrimDb - suggestedInstrumentTrimDb,
      suggestedEffectiveTrimDb: entry.suggestedEffectiveTrimDb,
      predictedPeakDbfs: entry.predictedPeakDbfs,
    };
  }

  return {
    family: {
      group,
      label: targets[0]?.family ?? group,
      targetIds: targets.map((target) => target.id),
      measuredCount: measured.length,
      totalCount: targets.length,
      complete: true,
      centerLufs,
      referenceLufs,
      referenceShiftDb: referenceLufs - centerLufs,
      constraint,
      constraintTargetId,
      suggestedInstrumentTrimDb,
    },
    recommendations,
  };
}

function baseRecommendation(
  target: CalibrationTarget,
  result: AudioCalibrationResult,
  absoluteReferenceLufs: number,
  basis: CalibrationRecommendationBasis,
  status: CalibrationRecommendationStatus,
): CalibrationRecommendation {
  return {
    targetId: target.id,
    basis,
    status,
    comparisonGroup: target.comparisonGroup,
    absoluteReferenceLufs,
    diagnosticDeltaDb: absoluteReferenceLufs - result.metrics.integratedLufs,
    currentInstrumentTrimDb: result.currentInstrumentTrimDb,
    currentProgramTrimDb: result.currentProgramTrimDb,
    currentEffectiveTrimDb: result.currentTrimDb,
  };
}

function uniqueComparisonGroups(): CalibrationComparisonGroup[] {
  return [...new Set(
    CALIBRATION_TARGETS
      .map((target) => target.comparisonGroup)
      .filter((group): group is CalibrationComparisonGroup => Boolean(group)),
  )];
}

function normalizeReference(value: number): number {
  if (!Number.isFinite(value)) return -22;
  return clamp(value, -36, -12);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
