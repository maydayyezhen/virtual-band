import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioMixConfigFile, AudioMixTarget } from '../../audio/AudioMixProfile';
import {
  CALIBRATION_TARGETS,
  calibrationTarget,
  type CalibrationTarget,
} from '../../audio/calibration/CalibrationTargets';
import { AudioMixPreviewRuntime } from './AudioMixPreviewRuntime';

interface GitStatus {
  readonly branch: string;
  readonly fileStatus: string;
}

interface StatusResponse {
  readonly config: AudioMixConfigFile;
  readonly git: GitStatus;
}

type AuditionMode = 'draft' | 'saved';

const INSTRUMENT_CONTROLS: readonly {
  key: AudioMixTarget;
  label: string;
  auditionTargetId: string;
}[] = [
  { key: 'drums', label: 'Drums', auditionTargetId: 'drums' },
  { key: 'keyboard.lower', label: 'Keyboard · Piano', auditionTargetId: 'keyboard.lower' },
  { key: 'keyboard.upper', label: 'Keyboard · Warm Pad', auditionTargetId: 'keyboard.upper' },
  { key: 'violin.arco', label: 'Violin · Arco', auditionTargetId: 'violin.arco' },
  { key: 'violin.pizzicato', label: 'Violin · Pizzicato', auditionTargetId: 'violin.pizzicato' },
  { key: 'acoustic', label: 'Acoustic Guitar · Family', auditionTargetId: 'acoustic.24' },
  { key: 'electric', label: 'Electric Guitar · Family', auditionTargetId: 'electric.27' },
  { key: 'bass', label: 'Electric Bass · Family', auditionTargetId: 'bass.33' },
];

const ACOUSTIC_PROGRAMS = [
  { program: '24', label: 'Nylon', targetId: 'acoustic.24' },
  { program: '25', label: 'Steel', targetId: 'acoustic.25' },
] as const;

const ELECTRIC_PROGRAMS = [
  { program: '26', label: 'Jazz', targetId: 'electric.26' },
  { program: '27', label: 'Clean', targetId: 'electric.27' },
  { program: '28', label: 'Muted', targetId: 'electric.28' },
  { program: '29', label: 'Overdrive', targetId: 'electric.29' },
  { program: '30', label: 'Distortion', targetId: 'electric.30' },
  { program: '31', label: 'Harmonics', targetId: 'electric.31' },
] as const;

const BASS_PROGRAMS = [
  { program: '33', label: 'Fingered', targetId: 'bass.33' },
  { program: '34', label: 'Picked', targetId: 'bass.34' },
  { program: '36', label: 'Slap', targetId: 'bass.36' },
] as const;

export function AudioMixTunerApp() {
  const previewRef = useRef<AudioMixPreviewRuntime | null>(null);
  const [persisted, setPersisted] = useState<AudioMixConfigFile | null>(null);
  const [draft, setDraft] = useState<AudioMixConfigFile | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [selectedId, setSelectedId] = useState('acoustic.24');
  const [auditionMode, setAuditionMode] = useState<AuditionMode>('draft');
  const [busyTargetId, setBusyTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState('Loading mix config…');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const preview = new AudioMixPreviewRuntime();
    previewRef.current = preview;
    return () => {
      if (previewRef.current === preview) previewRef.current = null;
      preview.dispose();
    };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void fetch('/__dev/audio-mix/status', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseText(response));
        return response.json() as Promise<StatusResponse>;
      })
      .then((status) => {
        const config = cloneConfig(status.config);
        setPersisted(config);
        setDraft(cloneConfig(config));
        setGit(status.git);
        setMessage(`Loaded ${status.git.branch || 'detached HEAD'}`);
        setError(null);
      })
      .catch((reason) => {
        if (abort.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setMessage('Run this page through npm run dev:mix');
      });
    return () => abort.abort();
  }, []);

  const selectedTarget = useMemo(() => calibrationTarget(selectedId), [selectedId]);
  const selectedDeltaDb = persisted && draft
    ? auditionDeltaDb(persisted, draft, selectedTarget, auditionMode)
    : 0;

  useEffect(() => {
    previewRef.current?.setPreviewDeltaDb(selectedDeltaDb);
  }, [selectedDeltaDb]);

  const dirty = Boolean(persisted && draft && !sameConfig(persisted, draft));

  async function audition(targetId: string): Promise<void> {
    if (!persisted || !draft) return;
    const target = calibrationTarget(targetId);
    const deltaDb = auditionDeltaDb(persisted, draft, target, auditionMode);
    setSelectedId(targetId);
    setBusyTargetId(targetId);
    setError(null);
    setMessage(`Auditioning ${target.label} · ${auditionMode === 'draft' ? 'draft' : 'saved'} mix`);
    try {
      await previewRef.current?.audition(target, deltaDb);
      setMessage(`${target.label} audition finished`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyTargetId((current) => current === targetId ? null : current);
    }
  }

  function updateInstrument(target: AudioMixTarget, value: number): void {
    setDraft((current) => current ? {
      ...current,
      instrumentTrimDb: {
        ...current.instrumentTrimDb,
        [target]: sanitizeDb(value),
      },
    } : current);
  }

  function updateProgram(
    family: 'acoustic' | 'electric' | 'bass',
    program: string,
    value: number,
  ): void {
    setDraft((current) => current ? {
      ...current,
      programTrimDb: {
        ...current.programTrimDb,
        [family]: {
          ...current.programTrimDb[family],
          [program]: sanitizeDb(value),
        },
      },
    } : current);
  }

  async function save(push: boolean): Promise<void> {
    if (!draft || !git) return;
    setSaving(true);
    setError(null);
    setMessage(push ? 'Saving, committing and pushing…' : 'Saving config…');
    try {
      const response = await fetch('/__dev/audio-mix/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          config: draft,
          git: push,
          expectedBranch: git.branch,
        }),
      });
      const body = await response.json() as { error?: string; git?: { sha?: string } };
      if (!response.ok) throw new Error(body.error ?? `Save failed (${response.status})`);
      setMessage(push
        ? `Saved and pushed${body.git?.sha ? ` · ${body.git.sha.slice(0, 8)}` : ''}`
        : 'Saved config/audio-mix.json');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaving(false);
    }
  }

  if (!draft || !persisted) {
    return (
      <main className="mix-page">
        <section className="mix-loading">
          <h1>Audio Mix Tuner</h1>
          <p>{message}</p>
          {error && <pre className="error-box">{error}</pre>}
        </section>
      </main>
    );
  }

  return (
    <main className="mix-page">
      <header className="mix-header">
        <div>
          <div className="eyebrow">Virtual Band · developer tool</div>
          <h1>Audio Mix Tuner</h1>
          <p>
            实时试听只叠加 draft 与已保存配置之间的 dB 差值；保存后正式运行、MIDI 和 Showcase 都读取同一个
            <code> config/audio-mix.json</code>。
          </p>
        </div>
        <div className="header-actions">
          <div className={`dirty-pill ${dirty ? 'dirty' : ''}`}>{dirty ? 'UNSAVED' : 'SAVED'}</div>
          <button disabled={!dirty || saving} onClick={() => setDraft(cloneConfig(persisted))}>Reset</button>
          <button className="primary" disabled={!dirty || saving} onClick={() => void save(false)}>Save file</button>
          <button className="push" disabled={!dirty || saving || !git?.branch} onClick={() => void save(true)}>
            Save + Commit & Push
          </button>
        </div>
      </header>

      <section className="status-strip">
        <span>Branch <strong>{git?.branch || 'detached HEAD'}</strong></span>
        <span>Source <strong>{draft.source}</strong></span>
        <span>{message}</span>
        {error && <span className="status-error">{error}</span>}
      </section>

      <section className="audition-panel panel">
        <div className="panel-title-row">
          <div>
            <h2>Audition</h2>
            <p>先点一个目标试听，声音还在响的时候拖下面滑块就会实时变化。</p>
          </div>
          <div className="ab-switch">
            <button className={auditionMode === 'draft' ? 'active' : ''} onClick={() => setAuditionMode('draft')}>Draft</button>
            <button className={auditionMode === 'saved' ? 'active' : ''} onClick={() => setAuditionMode('saved')}>Saved A/B</button>
            <button onClick={() => previewRef.current?.stop()}>Stop</button>
          </div>
        </div>

        <div className="audition-grid">
          {CALIBRATION_TARGETS.map((target) => {
            const effective = effectiveTrimDb(draft, target);
            const saved = effectiveTrimDb(persisted, target);
            const selected = target.id === selectedId;
            return (
              <button
                key={target.id}
                className={`audition-card ${selected ? 'selected' : ''}`}
                onClick={() => void audition(target.id)}
              >
                <span>{busyTargetId === target.id ? '■' : '▶'} {target.label}</span>
                <strong>{formatDb(effective)}</strong>
                <small>{signedDelta(effective - saved)} vs saved</small>
              </button>
            );
          })}
        </div>
        <div className="selected-readout">
          Selected <strong>{selectedTarget.label}</strong> · draft <strong>{formatDb(effectiveTrimDb(draft, selectedTarget))}</strong>
          {' · '}saved <strong>{formatDb(effectiveTrimDb(persisted, selectedTarget))}</strong>
          {' · '}preview delta <strong>{formatDb(selectedDeltaDb)}</strong>
        </div>
      </section>

      <div className="mix-columns">
        <section className="panel">
          <h2>Instrument / Family Trim</h2>
          <p className="panel-help">这里控制整件乐器。木吉他整体太大，就只动 Acoustic family，不破坏 Nylon / Steel 的相对差。</p>
          <div className="control-list">
            {INSTRUMENT_CONTROLS.map((row) => (
              <DbControl
                key={row.key}
                label={row.label}
                value={draft.instrumentTrimDb[row.key]}
                selected={selectedId === row.auditionTargetId}
                onChange={(value) => updateInstrument(row.key, value)}
                onAudition={() => void audition(row.auditionTargetId)}
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Program Offset</h2>
          <p className="panel-help">只处理同一乐器内部不同音色的相对响度。Effective = family + program。</p>
          <h3>Acoustic Guitar</h3>
          <div className="control-list compact">
            {ACOUSTIC_PROGRAMS.map((row) => (
              <DbControl
                key={row.program}
                label={`${row.program} · ${row.label}`}
                value={draft.programTrimDb.acoustic[row.program]}
                effective={draft.instrumentTrimDb.acoustic + draft.programTrimDb.acoustic[row.program]}
                selected={selectedId === row.targetId}
                onChange={(value) => updateProgram('acoustic', row.program, value)}
                onAudition={() => void audition(row.targetId)}
              />
            ))}
          </div>

          <h3>Electric Guitar</h3>
          <div className="control-list compact">
            {ELECTRIC_PROGRAMS.map((row) => (
              <DbControl
                key={row.program}
                label={`${row.program} · ${row.label}`}
                value={draft.programTrimDb.electric[row.program]}
                effective={draft.instrumentTrimDb.electric + draft.programTrimDb.electric[row.program]}
                selected={selectedId === row.targetId}
                onChange={(value) => updateProgram('electric', row.program, value)}
                onAudition={() => void audition(row.targetId)}
              />
            ))}
          </div>

          <h3>Electric Bass</h3>
          <div className="control-list compact">
            {BASS_PROGRAMS.map((row) => (
              <DbControl
                key={row.program}
                label={`${row.program} · ${row.label}`}
                value={draft.programTrimDb.bass[row.program]}
                effective={draft.instrumentTrimDb.bass + draft.programTrimDb.bass[row.program]}
                selected={selectedId === row.targetId}
                onChange={(value) => updateProgram('bass', row.program, value)}
                onAudition={() => void audition(row.targetId)}
              />
            ))}
          </div>
        </section>
      </div>

      <footer className="mix-footer">
        <span>Save file 只写工作区；Save + Commit & Push 只提交 <code>config/audio-mix.json</code>，然后推送当前分支。</span>
        {git?.fileStatus && <span>Git before edit: <code>{git.fileStatus}</code></span>}
      </footer>
    </main>
  );
}

function DbControl(props: {
  label: string;
  value: number;
  effective?: number;
  selected: boolean;
  onChange: (value: number) => void;
  onAudition: () => void;
}) {
  return (
    <div className={`db-control ${props.selected ? 'selected' : ''}`}>
      <button className="listen-button" onClick={props.onAudition}>▶</button>
      <div className="db-label">
        <strong>{props.label}</strong>
        {props.effective !== undefined && <small>effective {formatDb(props.effective)}</small>}
      </div>
      <button className="nudge" onClick={() => props.onChange(props.value - 1)}>−1</button>
      <input
        className="db-range"
        type="range"
        min="-36"
        max="18"
        step="0.25"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <button className="nudge" onClick={() => props.onChange(props.value + 1)}>+1</button>
      <input
        className="db-number"
        type="number"
        min="-48"
        max="24"
        step="0.25"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <span className="db-unit">dB</span>
    </div>
  );
}

function auditionDeltaDb(
  saved: AudioMixConfigFile,
  draft: AudioMixConfigFile,
  target: CalibrationTarget,
  mode: AuditionMode,
): number {
  if (mode === 'saved') return 0;
  return effectiveTrimDb(draft, target) - effectiveTrimDb(saved, target);
}

function effectiveTrimDb(config: AudioMixConfigFile, target: CalibrationTarget): number {
  const instrument = config.instrumentTrimDb[target.mixTarget] ?? 0;
  if (target.program === undefined) return instrument;
  if (target.kind === 'acoustic') return instrument + (config.programTrimDb.acoustic[String(target.program)] ?? 0);
  if (target.kind === 'electric') return instrument + (config.programTrimDb.electric[String(target.program)] ?? 0);
  if (target.kind === 'bass') return instrument + (config.programTrimDb.bass[String(target.program)] ?? 0);
  return instrument;
}

function cloneConfig(config: AudioMixConfigFile): AudioMixConfigFile {
  return {
    schemaVersion: 1,
    source: config.source,
    instrumentTrimDb: { ...config.instrumentTrimDb },
    programTrimDb: {
      acoustic: { ...config.programTrimDb.acoustic },
      electric: { ...config.programTrimDb.electric },
      bass: { ...config.programTrimDb.bass },
    },
  };
}

function sameConfig(a: AudioMixConfigFile, b: AudioMixConfigFile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sanitizeDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(-48, Math.min(24, value)) * 100) / 100;
}

function formatDb(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} dB`;
}

function signedDelta(value: number): string {
  if (Math.abs(value) < 0.005) return '±0.00 dB';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} dB`;
}

async function responseText(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}
