import type { ScreenSession } from '../../screens/ScreenSession';
import type { SongScreens } from '../../screens/SongScreens';
import { imageContent, videoContent, textContent } from '../../screens/content';
import { ribbonsContent, spectrumContent } from '../../screens/examples';
import type { ScreenContent, ScreenOptions } from '../../screens/ScreenContent';

/** A small content picker. Custom providers use the same session API as these built-ins. */
export class ScreenPanel {
  readonly element = document.createElement('details');
  private readonly target = document.createElement('select');
  private readonly file = document.createElement('input');
  private readonly text = document.createElement('textarea');
  private readonly fit = document.createElement('select');
  private readonly brightness = document.createElement('input');
  private readonly follow = document.createElement('input');
  private readonly play = document.createElement('button');
  private readonly cancel = document.createElement('button');
  private readonly song = document.createElement('button');
  private readonly status = document.createElement('p');
  private busy = false;
  private message = '';
  constructor(private readonly session: ScreenSession, private readonly songs: SongScreens) {
    this.element.className = 'band-screens';
    const summary = document.createElement('summary'); summary.textContent = 'LED 内容';
    this.target.setAttribute('aria-label', '目标屏幕');
    this.target.add(new Option('全部屏幕', 'all'));
    for (const screen of session.port.screens) this.target.add(new Option(({ main: '主屏', left: '左屏', right: '右屏' } as Record<string, string>)[screen.id] ?? screen.id, screen.id));
    this.target.addEventListener('change', () => { this.message = ''; this.refreshOptions(); });
    this.file.type = 'file'; this.file.accept = 'image/*,video/*'; this.file.hidden = true;
    this.file.setAttribute('aria-label', '导入 LED 图片或视频');
    this.file.addEventListener('change', () => {
      const file = this.file.files?.[0]; this.file.value = '';
      if (file) void this.setFile(file);
    });
    const row = document.createElement('div'); row.className = 'band-camera__controls';
    row.append(this.target, this.button('导入图片 / 视频', () => this.file.click()));
    const presets = document.createElement('div'); presets.className = 'band-camera__controls';
    presets.append(this.button('光带动画', () => { void this.apply(ribbonsContent()); }), this.button('实时声谱', () => { void this.apply(spectrumContent()); }));
    this.song.type = 'button'; this.song.textContent = '恢复歌曲画面';
    this.song.addEventListener('click', () => { void this.run(() => this.songs.restore(this.ids())); });
    presets.append(this.song);
    this.text.rows = 2; this.text.maxLength = 500; this.text.placeholder = '输入屏幕文字，支持换行'; this.text.setAttribute('aria-label', '屏幕文字');
    const displayText = this.button('显示文字', () => { void this.apply(textContent(this.text.value || 'NOCTURNE')); });
    this.fit.setAttribute('aria-label', '画面适配'); this.fit.add(new Option('完整显示', 'contain')); this.fit.add(new Option('裁切铺满', 'cover'));
    this.fit.addEventListener('change', () => this.options({ fit: this.fit.value as ScreenOptions['fit'] }));
    this.brightness.type = 'range'; this.brightness.min = '0'; this.brightness.max = '2'; this.brightness.step = '.05';
    this.brightness.setAttribute('aria-label', 'LED 亮度');
    this.brightness.addEventListener('input', () => this.options({ brightness: Number(this.brightness.value) }));
    const brightness = document.createElement('label'); brightness.append('亮度', this.brightness);
    this.follow.type = 'checkbox'; this.follow.checked = true;
    this.follow.addEventListener('change', () => this.options({ clock: this.follow.checked ? 'song' : 'local' }));
    const follow = document.createElement('label'); follow.append(this.follow, '跟随歌曲');
    this.play.type = 'button'; this.play.addEventListener('click', () => this.options({ playing: !session.status(this.ids()[0]).options.playing }));
    this.cancel.type = 'button'; this.cancel.textContent = '取消加载'; this.cancel.addEventListener('click', () => session.cancelPending(this.ids()));
    const controls = document.createElement('div'); controls.className = 'band-camera__controls';
    controls.append(this.fit, follow, this.play, this.button('恢复默认', () => { session.restore(this.ids()); this.message = ''; this.refreshOptions(); }));
    this.status.setAttribute('role', 'status');
    this.element.append(summary, row, this.file, presets, this.text, displayText, controls, brightness, this.cancel, this.status);
    this.refreshOptions();
  }
  private ids(): string[] { return this.target.value === 'all' ? this.session.port.screens.map(s => s.id) : [this.target.value]; }
  async setFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { this.message = '请选择图片或视频文件'; this.update(); return; }
    await this.apply(file.type.startsWith('video/') ? videoContent(file) : imageContent(file));
  }
  private async apply(content: ScreenContent): Promise<void> {
    await this.run(() => this.session.setContent(this.ids(), content, { fit: this.fit.value as ScreenOptions['fit'],
      brightness: Number(this.brightness.value), clock: this.follow.checked ? 'song' : 'local' }));
  }
  async setSong(content: ScreenContent | null): Promise<void> {
    // Song load has priority over an in-flight manual import. Cancellation preserves old surfaces.
    this.session.cancelPending(this.session.port.screens.map(s => s.id));
    await this.run(() => this.songs.setShow(content), true);
  }
  private operation = 0;
  private async run(action: () => Promise<void>, replace = false): Promise<void> {
    if (this.busy && !replace) return;
    const operation = ++this.operation;
    this.busy = true; this.message = '正在加载素材…'; this.update();
    try {
      await action();
      if (operation === this.operation) this.message = '';
    } catch (error) { if (operation === this.operation) this.message = error instanceof DOMException && error.name === 'AbortError' ? '已取消加载，保留原画面' : `未替换画面：${String(error)}`; }
    finally { if (operation === this.operation) { this.busy = false; this.refreshOptions(); } }
  }
  private options(patch: Partial<ScreenOptions>): void { this.session.setOptions(this.ids(), patch); this.message = ''; this.update(); }
  private refreshOptions(): void {
    const options = this.session.status(this.ids()[0]).options;
    this.fit.value = options.fit; this.brightness.value = String(options.brightness); this.follow.checked = options.clock === 'song'; this.update();
  }
  update(): void {
    const statuses = this.ids().map(id => this.session.status(id));
    for (const control of this.element.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea')) control.disabled = this.busy;
    this.cancel.disabled = false; this.cancel.hidden = !this.busy;
    this.play.disabled = this.busy || !statuses.some(s => s.active);
    this.song.disabled = this.busy || !this.songs.content;
    this.play.textContent = statuses[0].options.playing ? '暂停画面' : '继续画面';
    const labels = [...new Set(statuses.map(s => s.label))];
    const text = this.message || statuses.find(s => s.error)?.error || `${labels.join(' / ')} · 视频静音，未载入歌曲时独立播放`;
    if (this.status.textContent !== text) this.status.textContent = text;
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.addEventListener('click', action); return button;
  }
  dispose(): void { this.element.remove(); }
}
