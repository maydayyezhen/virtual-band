import { useEffect, useRef, useState } from 'react';
import {
  LAYOUT_INSTRUMENTS,
  parseLayoutDocument,
  stringifyLayout,
} from '../../layout/LayoutDocument';
import { BAND_SCALE } from '../../layout/BandPresentation';
import { LayoutEditorRuntime, type LayoutEditorSnapshot } from './LayoutEditorRuntime';

export function LayoutEditorApp() {
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runtimeRef = useRef<LayoutEditorRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<LayoutEditorSnapshot | null>(null);
  const [notice, setNotice] = useState('');
  const [nameDraft, setNameDraft] = useState('atelier-band-layout');

  useEffect(() => {
    const mount = stageRef.current;
    if (!mount) return;
    const runtime = new LayoutEditorRuntime(mount);
    runtimeRef.current = runtime;
    const unsubscribe = runtime.subscribe(setSnapshot);
    void runtime.start();
    return () => {
      unsubscribe();
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (snapshot) setNameDraft(snapshot.document.name);
  }, [snapshot?.document.name]);

  const selectedInstance = snapshot?.document.instances.find((instance) => instance.id === snapshot.selectedId);
  const selected = selectedInstance?.transform;
  const selectedDefinition = LAYOUT_INSTRUMENTS.find((item) => item.id === selectedInstance?.type);
  const disabled = !snapshot?.ready || snapshot.selectedLocked;

  const saveJson = () => {
    if (!snapshot) return;
    const blob = new Blob([stringifyLayout(snapshot.document)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(snapshot.document.name)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('布局 JSON 已导出');
  };

  const loadJson = async (file: File | undefined) => {
    if (!file || !runtimeRef.current) return;
    try {
      if (file.size > 1_000_000) throw new Error('布局文件不能超过 1 MB');
      const document = parseLayoutDocument(JSON.parse(await file.text()));
      runtimeRef.current.load(document);
      setNotice(`已加载 ${file.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? `加载失败：${error.message}` : '加载失败');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="layout-shell">
      <section className="layout-stage" aria-label="三维乐器摆放画布">
        <div className="layout-canvas" ref={stageRef} />
        <div className="stage-brand" aria-hidden="true">
          <span>VIRTUAL BAND</span>
          <strong>LAYOUT LAB</strong>
        </div>
        <div className="stage-help">
          拖动乐器移动 · Shift + 拖动乐器水平旋转 · 拖动空白处旋转视角 · 滚轮缩放
        </div>
        {!snapshot?.ready && (
          <div className="loading-card" role="status">
            <span className="loading-spinner" />
            <strong>{snapshot?.error ? '载入失败' : '正在准备独立编辑器'}</strong>
            <small>{snapshot?.error ?? snapshot?.loadingLabel ?? '初始化…'}</small>
          </div>
        )}
      </section>

      <aside className="layout-panel" aria-label="布局编辑工具">
        <header className="panel-header">
          <div>
            <p>ATELIER STUDIO</p>
            <h1>乐器摆放</h1>
          </div>
          <span className="status-pill">独立页面</span>
        </header>

        <label className="field-block">
          <span>布局名称</span>
          <input
            type="text"
            value={nameDraft}
            maxLength={80}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => runtimeRef.current?.setName(nameDraft.trim() || 'atelier-band-layout')}
            disabled={!snapshot?.ready}
          />
        </label>

        <section className="panel-section" aria-labelledby="instrument-heading">
          <div className="section-heading">
            <h2 id="instrument-heading">乐器</h2>
            <span>{snapshot?.document.instances.length ?? 0} 件</span>
          </div>
          <div className="instrument-grid">
            {(snapshot?.document.instances ?? []).map((instance, index) => {
              const instrument = LAYOUT_INSTRUMENTS.find((definition) => definition.id === instance.type);
              if (!instrument) return null;
              const sameTypeCount = snapshot?.document.instances.filter((item) => item.type === instance.type).length ?? 1;
              const sameTypeIndex = (snapshot?.document.instances ?? [])
                .filter((item) => item.type === instance.type)
                .findIndex((item) => item.id === instance.id) + 1;
              return (
              <button
                key={instance.id}
                type="button"
                className={snapshot?.selectedId === instance.id ? 'instrument-card selected' : 'instrument-card'}
                onClick={() => runtimeRef.current?.select(instance.id)}
                disabled={!snapshot?.ready}
                aria-pressed={snapshot?.selectedId === instance.id}
              >
                <span className={`instrument-number tone-${LAYOUT_INSTRUMENTS.findIndex((item) => item.id === instance.type)}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{instrument.label}{sameTypeCount > 1 ? ` ${sameTypeIndex}` : ''}</strong>
                  <small>{instrument.shortLabel} · {instance.id}</small>
                </span>
              </button>
              );
            })}
          </div>
          <div className="instance-actions">
            <button type="button" className="auto-layout-action" onClick={() => runtimeRef.current?.autoArrange()} disabled={!snapshot?.ready}>自动排位</button>
            <button type="button" onClick={() => runtimeRef.current?.duplicateSelected()} disabled={!snapshot?.ready}>复制当前</button>
            <button type="button" onClick={() => runtimeRef.current?.removeSelected()} disabled={!snapshot?.ready || (snapshot?.document.instances.length ?? 0) <= 1}>删除当前</button>
          </div>
        </section>

        <section className="panel-section transform-section" aria-labelledby="transform-heading">
          <div className="section-heading">
            <h2 id="transform-heading">{selectedDefinition?.label ?? '变换'}</h2>
            <label className="lock-toggle">
              <input
                type="checkbox"
                checked={snapshot?.selectedLocked ?? false}
                onChange={(event) => runtimeRef.current?.setSelectedLocked(event.target.checked)}
                disabled={!snapshot?.ready}
              />
              锁定
            </label>
          </div>

          <div className="number-grid">
            <NumberField
              label="X"
              value={selected?.position[0] ?? 0}
              disabled={disabled}
              onCommit={(value) => runtimeRef.current?.setSelectedPosition('x', value)}
            />
            <NumberField
              label="Z"
              value={selected?.position[2] ?? 0}
              disabled={disabled}
              onCommit={(value) => runtimeRef.current?.setSelectedPosition('z', value)}
            />
            <NumberField label="Y · 自动贴地" value={selected?.position[1] ?? 0} disabled readOnly />
            <NumberField
              label="比例（现实基准）"
              suffix="×"
              value={selected?.scale ?? 1}
              min={0.1}
              max={5}
              step={0.05}
              disabled={disabled}
              onCommit={(value) => runtimeRef.current?.setSelectedScale(value)}
            />
          </div>

          <p className="scale-note">
            1× 总高约 {((selectedDefinition?.targetHeight ?? 0) * BAND_SCALE).toFixed(2)} m
            （现实 {selectedDefinition?.targetHeight.toFixed(2) ?? '—'} m × 乐队放大 {BAND_SCALE}×）。
          </p>

          <div className="rotation-row">
            <button type="button" onClick={() => runtimeRef.current?.rotateSelected(-1)} disabled={disabled} aria-label="向左旋转 15 度">−15°</button>
            <NumberField
              label="水平朝向"
              suffix="°"
              value={selected ? radiansToDegrees(selected.rotation[1]) : 0}
              disabled={disabled}
              onCommit={(value) => runtimeRef.current?.setSelectedRotationDegrees(value)}
            />
            <button type="button" onClick={() => runtimeRef.current?.rotateSelected(1)} disabled={disabled} aria-label="向右旋转 15 度">+15°</button>
          </div>

          <label className="option-row">
            <input
              type="checkbox"
              checked={snapshot?.snapToGrid ?? true}
              onChange={(event) => runtimeRef.current?.setSnapToGrid(event.target.checked)}
              disabled={!snapshot?.ready}
            />
            <span>
              <strong>网格吸附</strong>
              <small>移动步长 0.25</small>
            </span>
          </label>
        </section>

        <section className="panel-section" aria-labelledby="camera-heading">
          <div className="section-heading"><h2 id="camera-heading">视角</h2></div>
          <div className="button-pair">
            <button type="button" onClick={() => runtimeRef.current?.setCameraPreset('stage')}>舞台视角</button>
            <button type="button" onClick={() => runtimeRef.current?.setCameraPreset('top')}>俯视布局</button>
          </div>
        </section>

        <div className="history-row">
          <button type="button" onClick={() => runtimeRef.current?.undo()} disabled={!snapshot?.canUndo}>撤销</button>
          <button type="button" onClick={() => runtimeRef.current?.redo()} disabled={!snapshot?.canRedo}>重做</button>
          <button type="button" className="danger-quiet" onClick={() => runtimeRef.current?.reset()} disabled={!snapshot?.ready}>重置</button>
        </div>

        <footer className="file-actions">
          <button type="button" className="secondary-action" onClick={() => fileRef.current?.click()} disabled={!snapshot?.ready}>加载 JSON</button>
          <button type="button" className="primary-action" onClick={saveJson} disabled={!snapshot?.ready}>保存 JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void loadJson(event.target.files?.[0])}
          />
        </footer>

        <p className="notice" aria-live="polite">{notice || 'JSON 只保存布局数据，不包含模型或音频。'}</p>
      </aside>
    </main>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  readOnly?: boolean;
  onCommit?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatNumber(props.value));
  useEffect(() => setDraft(formatNumber(props.value)), [props.value]);

  const commit = () => {
    const value = Number(draft);
    if (Number.isFinite(value)) props.onCommit?.(value);
    else setDraft(formatNumber(props.value));
  };

  return (
    <label className="number-field">
      <span>{props.label}</span>
      <div>
        <input
          type="number"
          value={draft}
          min={props.min}
          max={props.max}
          step={props.step ?? 0.25}
          disabled={props.disabled}
          readOnly={props.readOnly}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {props.suffix && <small>{props.suffix}</small>}
      </div>
    </label>
  );
}

function radiansToDegrees(value: number): number {
  return Math.round(value * 180 / Math.PI * 10) / 10;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function safeFileName(value: string): string {
  return (value.trim() || 'atelier-band-layout').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80);
}
