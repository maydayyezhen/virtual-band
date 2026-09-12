import type { CameraShow } from '../../shows/CameraShow';
import type { TitleShow } from '../../titles/TitleShow';
import './director-panel.css';

export class DirectorPanel {
  readonly element = document.createElement('section');
  private readonly enabled = document.createElement('input');
  private readonly shots = document.createElement('select');
  private readonly status = document.createElement('span');
  private readonly exit = document.createElement('button');
  private readonly titleEnabled = document.createElement('input');
  private readonly titlePreviews = document.createElement('div');
  constructor(private readonly actions: { toggle: (enabled: boolean) => void; seek: (time: number) => void; toggleTitles: (enabled: boolean) => void }) {
    this.element.className = 'band-director';
    const label = document.createElement('label');
    this.enabled.type = 'checkbox'; this.enabled.disabled = true;
    label.append(this.enabled, '作品导播');
    this.enabled.addEventListener('change', () => actions.toggle(this.enabled.checked));
    this.shots.setAttribute('aria-label', '导播镜头'); this.shots.disabled = true;
    this.shots.addEventListener('change', () => { actions.seek(Number(this.shots.value)); this.shots.blur(); });
    const watch = document.createElement('button'); watch.type = 'button'; watch.textContent = '观看模式';
    watch.addEventListener('click', () => document.body.classList.add('concert-watch'));
    this.exit.type = 'button'; this.exit.textContent = '退出观看'; this.exit.className = 'concert-watch-exit';
    this.exit.addEventListener('click', () => document.body.classList.remove('concert-watch'));
    this.status.setAttribute('role', 'status'); this.status.textContent = '载入配有镜头编排的歌曲后启用';
    this.element.append(label, this.shots, watch, this.status); document.body.append(this.exit);
    const titleLabel = document.createElement('label');
    this.titleEnabled.type = 'checkbox'; this.titleEnabled.disabled = true;
    titleLabel.append(this.titleEnabled, '片头片尾');
    this.titleEnabled.addEventListener('change', () => actions.toggleTitles(this.titleEnabled.checked));
    this.titlePreviews.className = 'band-title-previews';
    this.element.append(titleLabel, this.titlePreviews);
  }
  setTitles(show: TitleShow | null): void {
    this.titleEnabled.disabled = !show; this.titleEnabled.checked = !!show;
    this.titlePreviews.replaceChildren();
    for (const cue of show?.cues ?? []) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = cue.id === 'opening' ? '预览片头' : '预览片尾';
      button.addEventListener('click', () => {
        this.titleEnabled.checked = true; this.actions.toggleTitles(true);
        this.actions.seek(Math.min(cue.end - cue.fadeOut, cue.start + cue.fadeIn + .5));
      });
      this.titlePreviews.append(button);
    }
  }
  setShow(show: CameraShow | null): void {
    this.shots.replaceChildren();
    this.enabled.disabled = this.shots.disabled = !show;
    this.enabled.checked = false;
    for (const cue of show?.cues ?? []) {
      const s = Math.floor(cue.time);
      this.shots.add(new Option(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${cue.name}`, String(cue.time)));
    }
    this.status.textContent = show ? `${show.cues.length} 个编排镜头 · 手动操作可随时接管` : '此曲暂未编排镜头，可手动选择机位';
  }
  update(enabled: boolean, name?: string): void {
    this.enabled.checked = enabled;
    if (name && this.status.textContent !== name) this.status.textContent = name;
  }
  dispose(): void { this.element.remove(); this.exit.remove(); document.body.classList.remove('concert-watch'); }
}
