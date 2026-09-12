import { gameIcon, type GameIcon } from '../../app/stage/icons';

/**
 * The play bar: transport controls, a scrubber and a one-line summary of the band that was built.
 *
 * It appears only once a file has been dropped in, so the stage stays empty until there is
 * something to play.
 */
export class TransportBar {
  private readonly root: HTMLDivElement;
  private readonly playButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly scrub: HTMLInputElement;
  private readonly clockLabel: HTMLSpanElement;
  private readonly summary: HTMLDivElement;
  private dragging = false;

  constructor(handlers: {
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onSeek: (seconds: number) => void;
  }) {
    installTransportStyles();

    this.root = document.createElement('div');
    this.root.className = 'mb-bar';
    this.root.hidden = true;

    const controls = document.createElement('div');
    controls.className = 'mb-bar__controls';

    this.playButton = button('play', '播放');
    this.pauseButton = button('pause', '暂停');
    this.stopButton = button('stop', '停止');
    this.playButton.addEventListener('click', handlers.onPlay);
    this.pauseButton.addEventListener('click', handlers.onPause);
    this.stopButton.addEventListener('click', handlers.onStop);

    this.scrub = document.createElement('input');
    this.scrub.type = 'range';
    this.scrub.setAttribute('aria-label', '播放进度');
    this.scrub.className = 'mb-bar__scrub';
    this.scrub.min = '0';
    this.scrub.max = '1000';
    this.scrub.value = '0';
    this.scrub.addEventListener('pointerdown', () => {
      this.dragging = true;
    });
    this.scrub.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    this.scrub.addEventListener('pointercancel', () => { this.dragging = false; });
    this.scrub.addEventListener('lostpointercapture', () => { this.dragging = false; });
    this.scrub.addEventListener('input', () => {
      if (!this.duration) return;
      handlers.onSeek((Number(this.scrub.value) / 1000) * this.duration);
    });

    this.clockLabel = document.createElement('span');
    this.clockLabel.className = 'mb-bar__clock';
    this.clockLabel.textContent = '0:00 / 0:00';

    controls.append(this.playButton, this.pauseButton, this.stopButton, this.scrub, this.clockLabel);

    this.summary = document.createElement('div');
    this.summary.className = 'mb-bar__summary';

    this.root.append(controls, this.summary);
    document.body.append(this.root);
  }

  private duration = 0;

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setSummary(text: string): void {
    this.summary.textContent = text;
  }

  setDuration(seconds: number): void {
    this.duration = seconds;
  }

  /** Called every frame; skips the DOM while the user is dragging the scrubber. */
  update(time: number, total: number, playing: boolean): void {
    if (this.root.hidden) return;
    if (!this.dragging && total > 0) {
      this.scrub.value = String(Math.round((Math.min(time, total) / total) * 1000));
    }
    this.clockLabel.textContent = `${clock(time)} / ${clock(total)}`;
    this.playButton.disabled = playing;
    this.pauseButton.disabled = !playing;
  }

  dispose(): void {
    this.root.remove();
  }
}

function button(glyph: GameIcon, title: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'mb-bar__button';
  element.innerHTML = gameIcon(glyph);
  element.title = title;
  element.setAttribute('aria-label', title);
  return element;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function installTransportStyles(doc: Document = document): void {
  if (doc.getElementById('mb-bar-styles')) return;
  const style = doc.createElement('style');
  style.id = 'mb-bar-styles';
  style.textContent = `
.mb-bar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 30;
  width: min(680px, calc(100vw - 40px)); padding: 10px 14px 8px;
  background: rgba(12, 16, 22, .9); border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px; color: #dfe6ef;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  backdrop-filter: blur(8px);
}
.mb-bar__controls { display: flex; align-items: center; gap: 10px; }
.mb-bar__button {
  width: 30px; height: 26px; background: #1a212b; color: #dfe6ef;
  border: 1px solid rgba(255,255,255,.18); border-radius: 5px;
  font: inherit; cursor: pointer;
}
.mb-bar__button:disabled { opacity: .35; cursor: default; }
.mb-bar__button svg { width: 15px; height: 15px; vertical-align: middle; }
.mb-bar__scrub { flex: 1; min-width: 0; accent-color: #7fb3ff; }
.mb-bar__clock { width: 92px; text-align: right; opacity: .75; }
.mb-bar__summary { margin-top: 6px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mb-hint {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30;
  padding: 18px 26px; border: 1px dashed rgba(255,255,255,.28); border-radius: 12px;
  color: #cfd8e3; background: rgba(12,16,22,.55); text-align: center;
  font: 14px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  pointer-events: none; transition: opacity .18s ease; white-space: pre-line;
}
.mb-hint[hidden] { display: none; }
`;
  doc.head.append(style);
}

/** The drop-target message, shown only while a file is being dragged over the page. */
export class DropHint {
  private readonly root: HTMLDivElement;

  constructor() {
    installTransportStyles();
    this.root = document.createElement('div');
    this.root.className = 'mb-hint';
    this.root.hidden = true;
    this.root.innerHTML = '把 .mid 文件拖到这里<br><span style="opacity:.6">任意 MIDI，自动分配乐器</span>';
    document.body.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setText(text: string): void {
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
