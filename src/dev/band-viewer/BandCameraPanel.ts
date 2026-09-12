import { BAND_VIEWS, bandViewId } from './BandViews';
import type { StageFocus } from './StageDirector';
import type { InstrumentRegistry } from '../../instruments/Instrument';
import './camera-panel.css';

/** UI sends mode requests. It never writes a camera pose or starts an animation. */
export class BandCameraPanel {
  private readonly root = document.createElement('section');
  private readonly status = document.createElement('span');
  private readonly hint = document.createElement('p');
  private readonly select = document.createElement('select');
  private readonly roam: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private readonly roamTools = document.createElement('div');
  private readonly pad = document.createElement('div');
  constructor(actions: {
    onBandView: (id: string) => void; onAudience: () => void; onBack: () => void;
    onLock: () => void; onHome: () => void; onMove: (key: string, down: boolean) => void;
    onArrange: () => void;
  }) {
    this.root.className = 'band-camera';
    this.root.setAttribute('aria-label', '镜头控制');
    const heading = document.createElement('div');
    heading.className = 'band-camera__heading';
    const title = document.createElement('strong');
    title.textContent = '乐队舞台';
    this.status.setAttribute('role', 'status');
    heading.append(title, this.status);
    const controls = document.createElement('div');
    controls.className = 'band-camera__controls';
    this.select.setAttribute('aria-label', '固定机位');
    const placeholder = new Option('切换固定机位', '');
    placeholder.disabled = true;
    placeholder.hidden = true;
    this.select.add(placeholder);
    for (const [index, view] of BAND_VIEWS.entries()) {
      this.select.add(new Option(`${index + 1} · ${view.label}`, bandViewId(view.key)));
    }
    this.select.addEventListener('change', () => { actions.onBandView(this.select.value); this.select.blur(); });
    const button = (label: string, action: () => void) => {
      const element = document.createElement('button');
      element.type = 'button'; element.textContent = label;
      element.addEventListener('click', () => { action(); element.blur(); });
      return element;
    };
    this.roam = button('自由漫游', actions.onAudience);
    this.roam.setAttribute('aria-pressed', 'false');
    this.back = button('返回全景', actions.onBack);
    controls.append(this.select, this.roam, this.back);
    controls.append(button('重新排位', actions.onArrange));
    const assets = document.createElement('a');
    assets.href = '/assets/instruments/'; assets.textContent = '乐器资产库';
    controls.append(assets);
    this.roamTools.className = 'band-camera__roam-tools';
    this.roamTools.append(button('鼠标跟随', actions.onLock), button('重置漫游', actions.onHome));
    this.hint.className = 'band-camera__hint';
    this.root.append(heading, controls, this.roamTools, this.hint);
    this.pad.className = 'band-camera-pad';
    this.pad.setAttribute('aria-label', '漫游移动');
    for (const [key, label, symbol] of [['KeyW', '向前', '↑'], ['KeyA', '向左', '←'], ['KeyS', '向后', '↓'], ['KeyD', '向右', '→'], ['KeyE', '升高', '升'], ['KeyQ', '降低', '降']]) {
      const item = document.createElement('button');
      item.type = 'button'; item.textContent = symbol; item.setAttribute('aria-label', label);
      item.addEventListener('pointerdown', event => { event.preventDefault(); item.setPointerCapture(event.pointerId); actions.onMove(key, true); });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) item.addEventListener(event, () => actions.onMove(key, false));
      this.pad.append(item);
    }
    document.body.append(this.root, this.pad);
    this.update({ kind: 'band' });
  }
  update(focus: StageFocus, instruments?: InstrumentRegistry, viewId?: string): void {
    const roaming = focus.kind === 'audience';
    this.roam.setAttribute('aria-pressed', String(roaming));
    this.back.hidden = focus.kind === 'band';
    this.roamTools.hidden = !roaming;
    this.pad.hidden = !roaming;
    if (focus.kind !== 'band') this.select.value = '';
    else if (viewId) this.select.value = viewId;
    this.status.textContent = roaming ? '自由视角' : focus.kind === 'broadcast' ? '作品导播' : focus.kind === 'band' ? '全景' : `近景 · ${instruments?.get(focus.instrumentId)?.label ?? '乐器'}`;
    this.hint.textContent = roaming
      ? 'WASD 移动 · Q 降 / E 升 · Shift 加速 · 拖动环顾 · 右键拖动平移 · 滚轮变焦 · Esc 返回全景'
      : focus.kind === 'broadcast' ? '镜头随歌曲编排 · 拖动或选择机位即可手动接管'
      : focus.kind === 'band' ? '拖动环绕 · 双击乐器进入近景 · 拖入 MIDI 演奏或布局 JSON 摆放'
      : '演奏与近景操作保持可用 · 双击其他乐器切换 · Esc 返回全景';
  }
  appendPanel(element: HTMLElement): void { this.root.append(element); }
  dispose(): void { this.root.remove(); this.pad.remove(); }
}
