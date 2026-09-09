import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AudioCalibrationHarness,
  recommendCalibration,
  type AudioCalibrationResult,
  type CalibrationRunProgress,
} from '../../audio/calibration/AudioCalibrationHarness';
import {
  CALIBRATION_TARGETS,
  calibrationTarget,
} from '../../audio/calibration/CalibrationTargets';

type RunMode = 'idle' | 'single' | 'all' | 'audition';

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
    // The harness owns AudioContext/AudioWorklet resources, so it belongs to
    // the committed effect lifetime rather than render-time memoization.
    // React StrictMode intentionally tears effects down and mounts them again
    // in development; each setup therefore receives a fresh live harness.
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
  const selectedRecommendation = selectedResult
    ? recommendCalibration(selectedResult, referenceLufs)
    : null;

  const getHarness = (): AudioCalibrationHarness => {
    const harness = harnessRef.current;
    if (!harness) throw new Error('Audio calibration harness is not ready');
    return harness;
  };

  const runOne = async (targetId = selectedId): Promise<void> => {
    if (busy) return;
    setMode('single');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await getHarness().runTarget(targetId, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResults((current) => ({ ...current, [targetId]: result }));
      setSelectedId(targetId);
    } catch (caught) {
      if (!isAbort(caught)) setError(messageOf(caught));
    } finally {
      abortRef.current = null;
      setProgress(null);
      setMode('idle');
    }
  };

  const runAll = async (): Promise<void> => {
    if (busy) return;
    setMode('all');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const harness = getHarness();
      for (const target of CALIBRATION_TARGETS) {
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
    setMode('audition');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await getHarness().audition(
        selectedId,
        auditionMode,
        selectedResult,
        referenceLufs,
        controller.signal,
      );
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
      .map((target) => results[target.id])
      .filter((result): result is AudioCalibrationResult => Boolean(result))
      .map((result) => {
        const recommendation = recommendCalibration(result, referenceLufs);
        return {
          target: result.targetId,
          source: result.source,
          lufs: round(result.metrics.integratedLufs, 2),
          peakDbfs: round(result.metrics.peakDbfs, 2),
          rmsDbfs: round(result.metrics.rmsDbfs, 2),
          currentTrimDb: round(result.currentTrimDb, 2),
          adjustmentDb: round(recommendation.adjustmentDb, 2),
          suggestedTrimDb: round(recommendation.suggestedTrimDb, 2),
          referenceLufs: recommendation.referenceLufs,
        };
      });
    await navigator.clipboard.writeText(JSON.stringify({
      referenceLufs,
      measurementPoint: 'pre-master summed mix',
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
            用真实 SF2 / MP3 fallback 音频链跑固定演奏序列，在 Master 之前测
            Sample Peak、RMS 和 K-weighted integrated loudness，再给
            <code> AudioMixProfile </code>一个可试听的 trim 建议。
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
          <span>Reference loudness</span>
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
          <button className="primary" disabled={busy} onClick={() => void runOne()}>
            Run selected
          </button>
          <button disabled={busy} onClick={() => void runAll()}>
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
          <span>Measurement point</span>
          <strong>Pre-master mix tap</strong>
          <small>Master listening volume does not change the measured result.</small>
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
                <th>Source</th>
                <th>LUFS</th>
                <th>Peak</th>
                <th>RMS</th>
                <th>Current trim</th>
                <th>Suggested Δ</th>
                <th>Suggested trim</th>
              </tr>
            </thead>
            <tbody>
              {CALIBRATION_TARGETS.map((target) => {
                const result = results[target.id];
                const recommendation = result
                  ? recommendCalibration(result, referenceLufs)
                  : null;
                const active = target.id === selectedId;
                return (
                  <tr
                    key={target.id}
                    className={active ? 'selected-row' : ''}
                    onClick={() => !busy && setSelectedId(target.id)}
                  >
                    <td>
                      <strong>{target.label}</strong>
                      <small>{target.family}</small>
                    </td>
                    <td>{result?.source ?? '—'}</td>
                    <td>{formatDb(result?.metrics.integratedLufs, ' LUFS')}</td>
                    <td>{formatDb(result?.metrics.peakDbfs, ' dBFS')}</td>
                    <td>{formatDb(result?.metrics.rmsDbfs, ' dBFS')}</td>
                    <td>{formatSigned(result?.currentTrimDb, ' dB')}</td>
                    <td className={adjustmentClass(recommendation?.adjustmentDb)}>
                      {formatSigned(recommendation?.adjustmentDb, ' dB')}
                    </td>
                    <td>{formatSigned(recommendation?.suggestedTrimDb, ' dB')}</td>
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
          {selectedResult ? (
            <p>
              测得 <strong>{formatDb(selectedResult.metrics.integratedLufs, ' LUFS')}</strong>，
              当前 trim <strong>{formatSigned(selectedResult.currentTrimDb, ' dB')}</strong>，
              建议 <strong>{formatSigned(selectedRecommendation?.suggestedTrimDb, ' dB')}</strong>。
              A/B 只在这个校准页面的 Master 上临时补偿，不改乐器状态。
            </p>
          ) : (
            <p>先跑一次这个 target，才能试听 Current / Suggested 的差异。</p>
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
            disabled={busy || !selectedResult}
            onClick={() => void audition('suggested')}
          >
            ▶ Suggested
          </button>
        </div>
      </section>

      <footer>
        <p>
          这里的 reference LUFS 是<strong>内部校准参考</strong>，不是发行母带标准。
          最终 AudioMixProfile 仍应经过全乐队实际 MIDI 场景的人耳确认。
        </p>
      </footer>
    </main>
  );
}

function phaseLabel(phase: CalibrationRunProgress['phase']): string {
  if (phase === 'prepare') return 'Preparing';
  if (phase === 'tail') return 'Release tail';
  return 'Measuring';
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
