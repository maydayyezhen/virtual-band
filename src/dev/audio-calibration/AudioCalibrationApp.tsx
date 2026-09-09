import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AudioCalibrationHarness,
  type AudioCalibrationResult,
  type CalibrationRunProgress,
} from '../../audio/calibration/AudioCalibrationHarness';
import {
  buildCalibrationPlan,
  isActionableRecommendation,
  type CalibrationFamilyPlan,
  type CalibrationRecommendation,
} from '../../audio/calibration/CalibrationPlan';
import {
  CALIBRATION_TARGETS,
  calibrationComparisonGroupTargets,
  calibrationTarget,
  type CalibrationTarget,
} from '../../audio/calibration/CalibrationTargets';

type RunMode = 'idle' | 'single' | 'family' | 'all' | 'audition';

export function AudioCalibrationApp() {
  const harnessRef = useRef<AudioCalibrationHarness | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [selectedId, setSelectedId] = useState('electric.27');
  const [referenceLufs, setReferenceLufs] = useState(-22);
  const [results, setResults] = useState<Record<string, AudioCalibrationResult>>({});
  const [progress, setProgress] = useState<CalibrationRunProgress | null>(null);
  const [mode, setMode] = useState<RunMode>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const harness = new AudioCalibrationHarness();
    harnessRef.current = harness;

    return () => {
      abortRef.current?.abort();
      if (harnessRef.current === harness) harnessRef.current = null;
      harness.dispose();
    };
  }, []);

  const busy = mode !== 'idle';
  const selectedTarget = calibrationTarget(selectedId);
  const selectedResult = results[selectedId];
  const plan = buildCalibrationPlan(results, referenceLufs);
  const selectedRecommendation = plan.recommendations[selectedId];
  const selectedFamilyTargets = calibrationComparisonGroupTargets(selectedTarget);
  const hasComparableFamily = Boolean(selectedTarget.comparisonGroup);
  const selectedFamily = selectedTarget.comparisonGroup
    ? plan.families.find((family) => family.group === selectedTarget.comparisonGroup)
    : undefined;

  const getHarness = (): AudioCalibrationHarness => {
    const harness = harnessRef.current;
    if (!harness) throw new Error('Audio calibration harness is not ready');
    return harness;
  };

  const runTargets = async (
    targets: readonly CalibrationTarget[],
    runMode: Exclude<RunMode, 'idle' | 'audition'>,
  ): Promise<void> => {
    if (busy || targets.length === 0) return;
    setMode(runMode);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const harness = getHarness();
      for (const target of targets) {
        if (controller.signal.aborted) break;
        setSelectedId(target.id);
        const result = await harness.runTarget(target.id, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        setResults((current) => ({ ...current, [target.id]: result }));
      }
    } catch (caught) {
      if (!isAbort(caught)) setError(messageOf(caught));
    } finally {
      abortRef.current = null;
      setProgress(null);
      setMode('idle');
    }
  };

  const audition = async (auditionMode: 'current' | 'suggested'): Promise<void> => {
    if (busy) return;
    if (auditionMode === 'suggested' && !isActionableRecommendation(selectedRecommendation)) return;
    setMode('audition');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const adjustmentDb = auditionMode === 'suggested'
        && isActionableRecommendation(selectedRecommendation)
        ? selectedRecommendation.adjustmentDb
        : 0;
      await getHarness().audition(selectedId, adjustmentDb, controller.signal);
    } catch (caught) {
      if (!isAbort(caught)) setError(messageOf(caught));
    } finally {
      abortRef.current = null;
      setMode('idle');
    }
  };

  const cancel = (): void => {
    abortRef.current?.abort();
  };

  const copyReport = async (): Promise<void> => {
    const rows = CALIBRATION_TARGETS
      .map((target) => ({ target, result: results[target.id], recommendation: plan.recommendations[target.id] }))
      .filter((entry): entry is {
        target: CalibrationTarget;
        result: AudioCalibrationResult;
        recommendation: CalibrationRecommendation;
      } => Boolean(entry.result && entry.recommendation))
      .map(({ target, result, recommendation }) => ({
        target: result.targetId,
        family: target.family,
        basis: recommendation.basis,
        status: recommendation.status,
        source: result.source,
        lufs: round(result.metrics.integratedLufs, 2),
        peakDbfs: round(result.metrics.peakDbfs, 2),
        rmsDbfs: round(result.metrics.rmsDbfs, 2),
        absoluteDiagnosticDeltaDb: round(recommendation.diagnosticDeltaDb, 2),
        familyCenterLufs: roundOptional(recommendation.familyCenterLufs, 2),
        targetLufs: roundOptional(recommendation.targetLufs, 2),
        adjustmentDb: roundOptional(recommendation.adjustmentDb, 2),
        currentInstrumentTrimDb: round(recommendation.currentInstrumentTrimDb, 2),
        currentProgramTrimDb: round(recommendation.currentProgramTrimDb, 2),
        currentEffectiveTrimDb: round(recommendation.currentEffectiveTrimDb, 2),
        suggestedInstrumentTrimDb: roundOptional(recommendation.suggestedInstrumentTrimDb, 2),
        suggestedProgramTrimDb: roundOptional(recommendation.suggestedProgramTrimDb, 2),
        suggestedEffectiveTrimDb: roundOptional(recommendation.suggestedEffectiveTrimDb, 2),
        predictedPeakDbfs: roundOptional(recommendation.predictedPeakDbfs, 2),
        residualLufs: roundOptional(recommendation.residualLufs, 2),
      }));

    const families = plan.families.map((family) => ({
      group: family.group,
      label: family.label,
      complete: family.complete,
      measuredCount: family.measuredCount,
      totalCount: family.totalCount,
      centerLufs: roundOptional(family.centerLufs, 2),
      referenceLufs: roundOptional(family.referenceLufs, 2),
      referenceShiftDb: roundOptional(family.referenceShiftDb, 2),
      constraint: family.constraint,
      constraintTargetId: family.constraintTargetId ?? null,
      suggestedInstrumentTrimDb: roundOptional(family.suggestedInstrumentTrimDb, 2),
    }));

    await navigator.clipboard.writeText(JSON.stringify({
      absoluteDiagnosticReferenceLufs: plan.absoluteReferenceLufs,
      measurementPoint: 'pre-master summed mix',
      samplePeakCeilingDbfs: plan.samplePeakCeilingDbfs,
      maxFamilyNormalizationDb: plan.maxFamilyNormalizationDb,
      families,
      rows,
    }, null, 2));
  };

  return (
    <main className="calibration-shell">
      <header className="calibration-header">
        <div>
          <p className="eyebrow">Virtual Band · Developer Audio Tool</p>
          <h1>Audio Calibration Harness</h1>
          <p className="lede">
            同一乐器家族用一致测试序列做 <strong>family-relative normalization</strong>；
            跨乐器只保留绝对响度诊断，不再把鼓、钢琴、小提琴硬拉到同一个 LUFS。
            Program offset 与共享 family trim 分开计算，并用 sample-peak headroom 约束可提升范围。
          </p>
        </div>
        <a className="back-link" href="/">← 返回乐器展示</a>
      </header>

      <section className="control-card">
        <label>
          <span>Calibration target</span>
          <select
            value={selectedId}
            disabled={busy}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedId(event.target.value)}
          >
            {CALIBRATION_TARGETS.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Absolute diagnostic reference</span>
          <div className="number-field">
            <input
              type="number"
              min="-36"
              max="-12"
              step="0.5"
              disabled={busy}
              value={referenceLufs}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReferenceLufs(Number(event.target.value))}
            />
            <b>LUFS</b>
          </div>
        </label>

        <div className="control-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void runTargets([selectedTarget], 'single')}
          >
            Run selected
          </button>
          <button
            disabled={busy || !hasComparableFamily}
            onClick={() => void runTargets(selectedFamilyTargets, 'family')}
          >
            Run family
          </button>
          <button disabled={busy} onClick={() => void runTargets(CALIBRATION_TARGETS, 'all')}>
            Run all
          </button>
          {busy && (
            <button className="danger" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="status-grid">
        <article className="status-card">
          <span>Selected</span>
          <strong>{selectedTarget.label}</strong>
          <small>{selectedTarget.description}</small>
        </article>
        <article className="status-card">
          <span>Comparison policy</span>
          <strong>{hasComparableFamily ? 'Family-relative' : 'Diagnostic only'}</strong>
          <small>
            {hasComparableFamily
              ? `${selectedTarget.family} programs share comparable test geometry.`
              : 'Different roles/articulations are measured, but receive no automatic trim recommendation.'}
          </small>
        </article>
        <article className="status-card">
          <span>Headroom policy</span>
          <strong>{plan.samplePeakCeilingDbfs.toFixed(1)} dBFS sample peak</strong>
          <small>
            Family reference is lowered when a quiet preset cannot be boosted safely. This is not true-peak certification.
          </small>
        </article>
        <article className="status-card">
          <span>Write policy</span>
          <strong>Read / suggest only</strong>
          <small>No automatic write-back to AudioMixProfile.</small>
        </article>
      </section>

      {(progress || error) && (
        <section className={`run-status ${error ? 'has-error' : ''}`}>
          {error ? (
            <>
              <strong>Calibration failed</strong>
              <span>{error}</span>
            </>
          ) : progress ? (
            <>
              <strong>
                {progress.target.label} · {phaseLabel(progress.phase)}
              </strong>
              <span>
                {progress.detail}
                {progress.step && progress.total
                  ? ` (${progress.step}/${progress.total})`
                  : ''}
              </span>
            </>
          ) : null}
        </section>
      )}

      <section className="family-plan-grid">
        {plan.families.map((family) => (
          <FamilyPlanCard key={family.group} family={family} />
        ))}
      </section>

      <section className="results-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Measured runtime path</p>
            <h2>Calibration matrix</h2>
          </div>
          <button
            disabled={Object.keys(results).length === 0}
            onClick={() => void copyReport()}
          >
            Copy report JSON
          </button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Basis</th>
                <th>LUFS</th>
                <th>Peak</th>
                <th>Current F / P / E</th>
                <th>Target</th>
                <th>Δ</th>
                <th>Suggested F</th>
                <th>Suggested P</th>
                <th>Suggested E</th>
                <th>Pred. peak</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {CALIBRATION_TARGETS.map((target) => {
                const result = results[target.id];
                const recommendation = plan.recommendations[target.id];
                const active = target.id === selectedId;
                return (
                  <tr
                    key={target.id}
                    className={active ? 'selected-row' : ''}
                    onClick={() => !busy && setSelectedId(target.id)}
                  >
                    <td>
                      <strong>{target.label}</strong>
                      <small>{result ? `${target.family} · ${result.source}` : target.family}</small>
                    </td>
                    <td>{recommendation ? basisLabel(recommendation) : '—'}</td>
                    <td>{formatDb(result?.metrics.integratedLufs, ' LUFS')}</td>
                    <td>{formatDb(result?.metrics.peakDbfs, ' dBFS')}</td>
                    <td>
                      {recommendation
                        ? `${formatSigned(recommendation.currentInstrumentTrimDb, '')} / ${formatSigned(recommendation.currentProgramTrimDb, '')} / ${formatSigned(recommendation.currentEffectiveTrimDb, ' dB')}`
                        : '—'}
                    </td>
                    <td>
                      {recommendation?.targetLufs !== undefined
                        ? formatDb(recommendation.targetLufs, ' LUFS')
                        : recommendation
                          ? `${formatSigned(recommendation.diagnosticDeltaDb, ' dB')} diag`
                          : '—'}
                    </td>
                    <td className={adjustmentClass(recommendation?.adjustmentDb)}>
                      {formatSigned(recommendation?.adjustmentDb, ' dB')}
                    </td>
                    <td>{formatSigned(recommendation?.suggestedInstrumentTrimDb, ' dB')}</td>
                    <td>{formatSigned(recommendation?.suggestedProgramTrimDb, ' dB')}</td>
                    <td>{formatSigned(recommendation?.suggestedEffectiveTrimDb, ' dB')}</td>
                    <td>{formatDb(recommendation?.predictedPeakDbfs, ' dBFS')}</td>
                    <td>
                      {recommendation
                        ? <span className={`status-pill ${recommendation.status}`}>{statusLabel(recommendation)}</span>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="audition-card">
        <div>
          <p className="eyebrow">Human listening gate</p>
          <h2>{selectedTarget.label}</h2>
          {selectedResult && selectedRecommendation ? (
            isActionableRecommendation(selectedRecommendation) ? (
              <p>
                测得 <strong>{formatDb(selectedResult.metrics.integratedLufs, ' LUFS')}</strong>，
                family 目标 <strong>{formatDb(selectedRecommendation.targetLufs, ' LUFS')}</strong>，
                临时补偿 <strong>{formatSigned(selectedRecommendation.adjustmentDb, ' dB')}</strong>。
                建议拆成 family trim <strong>{formatSigned(selectedRecommendation.suggestedInstrumentTrimDb, ' dB')}</strong>
                与 program offset <strong>{formatSigned(selectedRecommendation.suggestedProgramTrimDb, ' dB')}</strong>。
              </p>
            ) : (
              <p>
                {selectedRecommendation.status === 'diagnostic-only'
                  ? `这个 target 只做绝对诊断；相对 ${referenceLufs} LUFS 的差值为 ${formatSigned(selectedRecommendation.diagnosticDeltaDb, ' dB')}，不会自动转成 mix trim。`
                  : '先把同一个可比较 family 全部测完，才能生成稳定的相对校准建议。'}
              </p>
            )
          ) : (
            <p>先测量这个 target；如果它属于可比较 preset family，建议在 Run family 后生成。</p>
          )}
          {selectedFamily?.complete && (
            <p className="subtle-note">
              Family center {formatDb(selectedFamily.centerLufs, ' LUFS')} → safe reference {formatDb(selectedFamily.referenceLufs, ' LUFS')}，
              {familyConstraintLabel(selectedFamily)}。
            </p>
          )}
        </div>
        <div className="audition-actions">
          <button
            disabled={busy || !selectedResult}
            onClick={() => void audition('current')}
          >
            ▶ Current
          </button>
          <button
            className="primary"
            disabled={busy || !selectedResult || !isActionableRecommendation(selectedRecommendation)}
            onClick={() => void audition('suggested')}
          >
            ▶ Suggested
          </button>
        </div>
      </section>

      <footer>
        <p>
          Absolute reference 只用于跨乐器诊断。正式自动建议只发生在使用相同测试几何的 preset family 内；
          最终 AudioMixProfile 仍需在代表性的全乐队 MIDI 编曲里做人耳确认。
        </p>
      </footer>
    </main>
  );
}

function FamilyPlanCard({ family }: { family: CalibrationFamilyPlan }) {
  return (
    <article className="family-plan-card">
      <div>
        <span>Family normalization</span>
        <strong>{family.label}</strong>
      </div>
      {family.complete ? (
        <>
          <dl>
            <div><dt>Center</dt><dd>{formatDb(family.centerLufs, ' LUFS')}</dd></div>
            <div><dt>Safe ref</dt><dd>{formatDb(family.referenceLufs, ' LUFS')}</dd></div>
            <div><dt>Family trim</dt><dd>{formatSigned(family.suggestedInstrumentTrimDb, ' dB')}</dd></div>
          </dl>
          <small>{familyConstraintLabel(family)}</small>
        </>
      ) : (
        <small>Measured {family.measuredCount}/{family.totalCount}. Run the whole family before generating relative trims.</small>
      )}
    </article>
  );
}

function phaseLabel(phase: CalibrationRunProgress['phase']): string {
  if (phase === 'prepare') return 'Preparing';
  if (phase === 'tail') return 'Release tail';
  return 'Measuring';
}

function basisLabel(recommendation: CalibrationRecommendation): string {
  return recommendation.basis === 'family-relative' ? 'Family' : 'Diagnostic';
}

function statusLabel(recommendation: CalibrationRecommendation): string {
  if (recommendation.status === 'ready') return 'READY';
  if (recommendation.status === 'headroom-anchor') return 'PEAK ANCHOR';
  if (recommendation.status === 'range-limited') return 'RANGE LIMIT';
  if (recommendation.status === 'awaiting-family') return 'WAIT FAMILY';
  if (recommendation.status === 'diagnostic-only') return 'DIAGNOSTIC';
  return 'INVALID';
}

function familyConstraintLabel(family: CalibrationFamilyPlan): string {
  if (!family.complete) return 'Awaiting complete family measurement';
  if (family.constraint === 'sample-peak') {
    return `reference lowered by sample-peak headroom${family.constraintTargetId ? ` (${family.constraintTargetId})` : ''}`;
  }
  if (family.constraint === 'boost-range') {
    return `reference lowered by ±${18} dB normalization range${family.constraintTargetId ? ` (${family.constraintTargetId})` : ''}`;
  }
  return 'median reference required no headroom reduction';
}

function formatDb(value: number | undefined, suffix: string): string {
  if (value === undefined) return '—';
  if (!Number.isFinite(value)) return '−∞';
  return `${value.toFixed(2)}${suffix}`;
}

function formatSigned(value: number | undefined, suffix: string): string {
  if (value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}${suffix}`;
}

function adjustmentClass(value: number | undefined): string {
  if (value === undefined || Math.abs(value) < 0.25) return '';
  return value > 0 ? 'raise' : 'lower';
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isAbort(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}

function round(value: number, digits: number): number | null {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundOptional(value: number | undefined, digits: number): number | null {
  return value === undefined ? null : round(value, digits);
}
