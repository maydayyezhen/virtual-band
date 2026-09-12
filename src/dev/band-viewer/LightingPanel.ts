import type { LightingSession } from '../../lighting/LightingSession';
import { SHOW_EXAMPLES } from '../../shows/catalog';

/** Controls and status only. The lighting session owns all show state. */
export class LightingPanel {
  readonly element = document.createElement('section');
  private readonly status = document.createElement('span');
  private readonly toggle = document.createElement('input');
  private readonly sections = document.createElement('select');
  private readonly load = document.createElement('button');
  private busy = false;
  private showId: string | undefined;
  constructor(private readonly session: LightingSession, actions: {
    loadExample: (id: string) => void; toggle: (enabled: boolean) => void; seek: (seconds: number) => void;
  }) {
    this.element.className = 'band-lighting'; this.element.setAttribute('aria-label', '灯光编排');
    this.load.type = 'button'; this.load.textContent = '载入波西米亚示例';
    this.load.addEventListener('click', () => actions.loadExample(SHOW_EXAMPLES[0].id));
    this.toggle.type = 'checkbox'; this.toggle.addEventListener('change', () => actions.toggle(this.toggle.checked));
    const label = document.createElement('label'); label.append(this.toggle, document.createTextNode('歌曲灯光'));
    const controls = document.createElement('div'); controls.className = 'band-camera__controls'; controls.append(this.load, label);
    this.sections.setAttribute('aria-label', '灯光段落');
    this.sections.addEventListener('change', () => actions.seek(Number(this.sections.value)));
    this.status.setAttribute('role', 'status');
    this.element.append(controls, this.sections, this.status); this.update();
  }
  setBusy(busy: boolean): void { this.busy = busy; this.update(); }
  update(): void {
    const show = this.session.currentShow;
    this.load.disabled = this.busy;
    this.toggle.disabled = this.busy || !show; this.toggle.checked = this.session.enabled;
    this.sections.disabled = this.busy; this.sections.hidden = !show;
    if (this.showId !== show?.id) {
      this.sections.replaceChildren();
      for (const section of show?.sections ?? []) this.sections.add(new Option(section.name, String(section.time)));
      this.showId = show?.id;
    }
    const section = show?.sections.find(s => s.name === this.session.frame?.section);
    if (section && document.activeElement !== this.sections) this.sections.value = String(section.time);
    const text = this.busy ? '正在载入…' : !show ? '装饰灯光 · 载入示例后点击播放'
      : this.session.enabled ? `${show.title} · ${this.session.frame?.section ?? ''}` : '装饰灯光 · 歌曲编排已关闭';
    if (this.status.textContent !== text) this.status.textContent = text;
  }
  dispose(): void { this.element.remove(); }
}
