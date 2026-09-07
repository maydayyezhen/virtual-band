import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { VirtualBandApp } from '../app/VirtualBandApp';
import type { AtelierViewId } from '../presentation/atelier/AtelierDrumShowcaseMode';

interface HitState {
  note: number;
  velocity: number;
  id: string;
  label: string;
}

const STRIKES = [
  { note: 36, key: 'A', label: '底鼓', title: '底鼓 · A' },
  { note: 38, key: 'S', label: '军鼓', title: '军鼓 · S' },
  { note: 42, key: 'D', label: '踩镲', title: '闭镲 · D' },
  { note: 46, key: 'F', label: '开镲', title: '开镲 · F' },
  { note: 50, key: 'J', label: '高通', title: '高音通鼓 · J' },
  { note: 47, key: 'K', label: '中通', title: '中音通鼓 · K' },
  { note: 43, key: 'L', label: '落地', title: '落地通鼓 · L' },
  { note: 49, key: 'Q', label: 'Crash', title: '左 Crash · Q' },
  { note: 57, key: 'W', label: 'Crash 2', title: '右 Crash · W' },
  { note: 51, key: 'E', label: 'Ride', title: 'Ride · E' },
  { note: 55, key: 'T', label: 'Splash', title: 'Splash · T' },
] as const;

const VIEWS: Array<{ id: AtelierViewId; label: string }> = [
  { id: 'whole', label: '全貌' },
  { id: 'drummer', label: '鼓手位' },
  { id: 'cymbals', label: '镲片' },
  { id: 'pedals', label: '踏板' },
];

export function AppShell({ app }: { app: VirtualBandApp }) {
  const snapshot = useSyncExternalStore(app.state.subscribe, app.state.getSnapshot);

  useEffect(() => {
    void app.start().catch((error) => {
      console.error('[Virtual Band V2] startup failed', error);
    });
  }, [app]);

  return (
    <>
      {snapshot.running ? <AtelierExperience app={app} /> : null}
      <LoadingOverlay ready={snapshot.running} />
      {snapshot.error ? (
        <div className="error visible" role="alert">
          <p>架子鼓未能启动：{snapshot.error}</p>
        </div>
      ) : null}
    </>
  );
}

function AtelierExperience({ app }: { app: VirtualBandApp }) {
  const drums = app.requireDrumKit();
  const showcase = app.requireAtelierShowcase();
  const showcaseSnapshot = useSyncExternalStore(showcase.subscribe.bind(showcase), showcase.getSnapshot);
  const [hit, setHit] = useState<HitState | null>(null);
  const [litNote, setLitNote] = useState<number | null>(null);
  const hitTimer = useRef<number | null>(null);
  const helpRef = useRef<HTMLDialogElement>(null);

  useEffect(() => drums.subscribeHit((event) => {
    setHit(event);
    setLitNote(event.note);
    if (hitTimer.current !== null) window.clearTimeout(hitTimer.current);
    hitTimer.current = window.setTimeout(() => {
      setHit(null);
      setLitNote(null);
      hitTimer.current = null;
    }, 650);
  }), [drums]);

  useEffect(() => () => {
    if (hitTimer.current !== null) window.clearTimeout(hitTimer.current);
    showcase.setKeyboardBlocked(false);
  }, [showcase]);

  const openHelp = () => {
    showcase.setKeyboardBlocked(true);
    helpRef.current?.showModal();
  };

  const closeHelp = () => {
    helpRef.current?.close();
  };

  const onHelpClose = () => {
    showcase.setKeyboardBlocked(false);
  };

  const onHelpBackdrop = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) closeHelp();
  };

  return (
    <>
      <header>
        <div className="identity">
          <span className="brand">节拍</span>
          <span className="hairline" />
          <span className="edition">ATELIER<br />DRUM KIT / 04</span>
        </div>
        <span className="header-right">SESSION SERIES&nbsp; / &nbsp;BURGUNDY LACQUER</span>
      </header>

      <div className="status">
        <div className="instrument">{hit?.label ?? '5 DRUMS / 5 CYMBAL VOICES'}</div>
        <div className={`notes${hit ? ' note-on' : ''}`}>
          {hit ? `NOTE ${hit.note}  /  VEL ${String(hit.velocity).padStart(3, '0')}` : 'SESSION 04 · MIDI CH 10'}
        </div>
      </div>

      <div className="right-tools">
        <button className="circle" type="button" title="操作与 MIDI 接口" aria-label="操作与 MIDI 接口" onClick={openHelp}>
          <svg viewBox="0 0 24 24"><path d="M9 8a3 3 0 1 1 5 2.2c-1.4 1-2 1.2-2 3M12 17h.01" /></svg>
        </button>
        <button className="circle" type="button" title="放大" aria-label="放大" onClick={() => showcase.zoomIn()}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="circle" type="button" title="缩小" aria-label="缩小" onClick={() => showcase.zoomOut()}>
          <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
        </button>
        <button className="circle" type="button" title="复位" aria-label="复位" onClick={() => showcase.resetView()}>
          <svg viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 2 8M4 5v5h5" /></svg>
        </button>
      </div>

      <footer className="toolbar">
        <div className="strike-strip" role="group" aria-label="打击鼓组">
          {STRIKES.map((strike) => (
            <button
              key={strike.note}
              className={`strike${litNote === strike.note ? ' struck' : ''}`}
              type="button"
              title={strike.title}
              onClick={() => showcase.triggerNote(strike.note, 108)}
            >
              <kbd>{strike.key}</kbd><span>{strike.label}</span>
            </button>
          ))}
        </div>
        <p className="hint">点击鼓 / 镲片<span className="sep">·</span>拖动空白旋转<span className="sep">·</span>滚轮 / 双指缩放</p>
        <div className="controls" role="group" aria-label="观察视角">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              className="view"
              type="button"
              aria-pressed={showcaseSnapshot.view === view.id}
              onClick={() => showcase.selectView(view.id)}
            >
              {view.label}
            </button>
          ))}
          <span className="separator" />
          <button
            className="demo"
            type="button"
            title="108 BPM 循环打击动画，含音频"
            aria-pressed={showcaseSnapshot.demoPlaying}
            onClick={() => showcase.toggleDemo()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13 8z" /></svg>
            <span>{showcaseSnapshot.demoPlaying ? '停止演示' : '节奏演示'}</span>
          </button>
        </div>
      </footer>

      <div className="corner">22 / 10 / 12 / 14 / 16</div>
      <div className="corner right">04 — SESSION KIT</div>

      <dialog ref={helpRef} onClose={onHelpClose} onClick={onHelpBackdrop}>
        <button className="close-help" type="button" aria-label="关闭说明" onClick={closeHelp}>×</button>
        <p className="eyebrow">SESSION 04 / QUICK GUIDE</p>
        <h2>鼓手的视角</h2>
        <p>点击鼓或镲片，或使用底部按钮打击。拖动空白旋转；按住 Shift 或右键拖动平移。双指可缩放、平移。空格踩下踩镲踏板，松开抬起；Esc 停止演示并复位鼓组。</p>
        <p>保留原始纯代码 3D 演奏动画，并通过 V2 AudioEngine 加入鼓采样音频。镲片自然衰减，noteOff 不会立即止振；使用 choke 可以制镲。</p>
        <h3>MIDI 驱动接口</h3>
        <pre><code>{`const drums = virtualBandV2.requireDrumKit();
drums.noteOn(36, 110); // 底鼓
drums.noteOn(38, 100); // 军鼓
drums.noteOff(38);
drums.setHiHat(0.8);
drums.choke('crashLeft');
drums.reset();`}</code></pre>
        <p>标准 MIDI 鼓通道继续使用 GM Percussion 映射。CC 4：0 打开、127 闭合。音符力度范围为 0–127，力度 0 等同 noteOff。</p>
        <div className="mapping">
          <span>36 底鼓</span><span>38 军鼓</span><span>50 高通鼓</span>
          <span>47 中通鼓</span><span>43 落地通鼓</span><span>42 / 44 / 46 踩镲</span>
          <span>49 / 57 Crash</span><span>51 / 53 Ride</span><span>55 Splash</span>
        </div>
      </dialog>
    </>
  );
}

function LoadingOverlay({ ready }: { ready: boolean }) {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => setFading(true));
    const timer = window.setTimeout(() => setHidden(true), 450);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [ready]);

  if (hidden) return null;
  return (
    <div className={`loading${fading ? ' fading' : ''}`}>
      <div className="loader-beat" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <p>节拍就绪之前</p>
    </div>
  );
}
