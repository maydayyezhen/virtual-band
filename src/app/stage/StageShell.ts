import { SONG_LIBRARY, type LibrarySong } from './SongLibrary';
import { gameIcon } from './icons';
import type { LoadingCurtain } from './LoadingCurtain';
import './fonts.css';
import './stage-shell.css';

type View = 'home' | 'songs' | 'performance' | 'paused';
interface StageShellActions {
  onView(view: View): void;
  uiSound(kind: 'hover' | 'confirm' | 'back'): void;
  preview(song: LibrarySong): Promise<void>;
  stopPreview(): void;
  start(song: LibrarySong): Promise<void>;
  home(): Promise<void>;
  importFile(file: File): Promise<void>;
  roam(): void;
  broadcast(): void;
  pause(): void;
  resume(): Promise<void>;
}

/** Product navigation only. Playback, stage ownership and rendering stay in their modules. */
export class StageShell {
  private readonly root = document.createElement('div');
  private readonly abort = new AbortController();
  private view: View = 'home';
  private song: LibrarySong = SONG_LIBRARY[0];
  private busy = false;
  private previewing = false;
  private previewRequest = 0;
  private previewSongId: string | null = null;
  private lastSoundTarget: Element | null = null;
  private audioLevel = 0;
  private audioTime = 0;
  private pendingFocus: HTMLElement | null = null;
  private readonly message: HTMLElement;
  private readonly file: HTMLInputElement;

  constructor(private readonly actions: StageShellActions, private readonly curtain: LoadingCurtain) {
    this.root.className = 'stage-shell';
    this.root.innerHTML = `
      <section class="shell-pause" data-view="paused" role="dialog" aria-modal="true" aria-label="演出暂停菜单" hidden>
        <div class="shell-home-graphic" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="shell-pause-copy">
          <h1 class="shell-game-title"><span>幕间</span><strong>PAUSED</strong><i aria-hidden="true"></i></h1>
          <nav class="shell-menu shell-pause-menu" aria-label="暂停菜单">
            <button class="shell-menu-main" data-action="resume"><span class="shell-menu-marker">${gameIcon('play')}</span><span>继续演出</span><span class="shell-arrow" aria-hidden="true">RESUME</span></button>
            <button data-action="songs"><span class="shell-menu-marker">${gameIcon('library')}</span><span>选择音乐</span><span class="shell-arrow" aria-hidden="true">MUSIC</span></button>
            <button data-action="broadcast"><span class="shell-menu-marker">${gameIcon('play')}</span><span>作品导播</span><span class="shell-arrow" aria-hidden="true">DIRECTOR</span></button>
            <button data-action="roam"><span class="shell-menu-marker">${gameIcon('up')}</span><span>自由视角</span><span class="shell-arrow" aria-hidden="true">EXPLORE</span></button>
            <button data-action="tools" aria-pressed="false"><span class="shell-menu-marker">${gameIcon('settings')}</span><span>创作工具</span><span class="shell-arrow" aria-hidden="true">STUDIO</span></button>
            <button data-action="home"><span class="shell-menu-marker">${gameIcon('back')}</span><span>返回主菜单</span><span class="shell-arrow" aria-hidden="true">EXIT</span></button>
          </nav>
        </div>
      </section>
      <main class="shell-home" data-view="home">
        <div class="shell-home-graphic" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="shell-home-copy">
          <h1 class="shell-game-title"><span>返场</span><strong>ENCORE</strong><i aria-hidden="true"></i></h1>
          <nav class="shell-menu" aria-label="开始菜单">
            <button class="shell-menu-main" data-action="songs"><span class="shell-menu-marker">${gameIcon('play')}</span><span>播放歌曲</span><span class="shell-arrow" aria-hidden="true">PLAY</span></button>
            <a href="/assets/instruments/"><span class="shell-menu-marker">${gameIcon('library')}</span><span>乐器库</span><span class="shell-arrow" aria-hidden="true">LIBRARY</span></a>
          </nav>
        </div>
      </main>
      <main class="shell-songs" data-view="songs" hidden>
        <div class="shell-library-heading"><h1 tabindex="-1"><span aria-hidden="true">MUSIC SELECT</span>选择音乐</h1></div>
        <div class="shell-library-grid">
          <aside class="shell-tracklist" aria-label="曲目列表"><div class="shell-song-items"></div>
            <div class="shell-import"><button data-action="import">${gameIcon('upload')} 导入 MIDI</button><input type="file" accept=".mid,.midi,audio/midi" aria-label="导入 MIDI 文件" hidden></div>
          </aside>
          <section class="shell-song-detail" aria-label="歌曲详情">
            <div class="shell-record-zone"><div class="shell-record"><img alt="波西米亚狂想曲演出封面" draggable="false"><span class="shell-record-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div></div>
            <div class="shell-song-copy"><h2 class="shell-song-title"></h2><div class="shell-song-meta"><span class="shell-song-artist"></span><span class="shell-song-duration"></span></div>
              <div class="shell-song-actions">
              <button class="shell-start" data-action="start"><span>开始演出</span>${gameIcon('play')}</button></div>
            </div>
          </section>
        </div>
      </main>
      <div class="shell-notice" role="status" aria-live="polite" hidden></div>`;
    document.body.append(this.root);
    this.message = this.root.querySelector('.shell-notice')!;
    this.file = this.root.querySelector('input[type="file"]')!;
    const recordZone = this.root.querySelector<HTMLElement>('.shell-record-zone')!;
    const record = this.root.querySelector<HTMLElement>('.shell-record')!;
    const resetTilt = () => { record.style.setProperty('--cover-x', '0deg'); record.style.setProperty('--cover-y', '0deg'); };
    recordZone.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = recordZone.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      record.style.setProperty('--cover-x', `${(-y * 5).toFixed(2)}deg`);
      record.style.setProperty('--cover-y', `${(x * 5).toFixed(2)}deg`);
    }, { signal: this.abort.signal });
    for (const event of ['pointerleave', 'pointercancel']) recordZone.addEventListener(event, resetTilt, { signal: this.abort.signal });
    const items = this.root.querySelector('.shell-song-items')!;
    for (const song of SONG_LIBRARY) {
      const button = document.createElement('button');
      button.className = 'shell-track'; button.type = 'button'; button.setAttribute('aria-pressed', String(song.id === this.song.id));
      button.dataset.songId = song.id;
      const cover = document.createElement('img'); cover.className = 'shell-track-cover'; cover.src = song.cover; cover.alt = ''; cover.draggable = false;
      const label = document.createElement('span'); const title = document.createElement('strong'); title.textContent = song.title;
      const artist = document.createElement('small'); artist.textContent = song.artist; label.append(title, artist);
      const duration = document.createElement('span'); duration.className = 'shell-track-duration'; duration.textContent = song.duration;
      button.append(cover, label, duration); items.append(button);
      const select = () => {
        if (this.busy || this.view !== 'songs') return;
        if (this.song.id !== song.id) { this.stopPreview(); this.song = song; this.renderSong(); }
        this.beginPreview();
      };
      for (const event of ['pointerenter', 'focus', 'click']) button.addEventListener(event, select, { signal: this.abort.signal });
    }
    const hoverSound = (event: Event) => {
      const target = (event.target as Element).closest('button, a');
      if (!target || this.busy || target === this.lastSoundTarget || target.matches(':disabled')) return;
      this.lastSoundTarget = target;
      actions.uiSound('hover');
    };
    this.root.addEventListener('pointerover', hoverSound, { signal: this.abort.signal });
    this.root.addEventListener('pointerout', event => {
      if (!this.lastSoundTarget?.contains(event.relatedTarget as Node | null)) this.lastSoundTarget = null;
    }, { signal: this.abort.signal });
    this.root.addEventListener('focusin', hoverSound, { signal: this.abort.signal });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('button, a');
      if (!button || this.busy) return;
      const action = button.dataset.action;
      actions.uiSound(action === 'home' ? 'back' : 'confirm');
      if (action === 'home' || action === 'songs') {
        void this.run(async () => { this.stopPreview(); if (!this.inLobby) await actions.home(); this.setView(action === 'home' ? 'home' : 'songs'); });
      } else if (action === 'start') {
        void this.run(async () => { this.stopPreview(); await actions.start(this.song); this.setView('performance'); }, '正在准备乐队与演出…');
      } else if (action === 'resume') void this.resume();
      else if (action === 'import') this.file.click();
      else if (action === 'tools') {
        const open = document.body.dataset.stageTools !== 'open';
        document.body.dataset.stageTools = open ? 'open' : 'closed'; button.setAttribute('aria-pressed', String(open)); this.syncInert();
      } else if (action === 'roam') { actions.roam(); void this.resume(); }
      else if (action === 'broadcast') { actions.broadcast(); void this.resume(); }
    }, { signal: this.abort.signal });
    this.file.addEventListener('change', () => {
      const file = this.file.files?.[0]; this.file.value = '';
      if (file) void this.run(async () => { this.stopPreview(); await actions.importFile(file); this.enterPerformance(true); }, '正在准备你的音乐…');
    }, { signal: this.abort.signal });
    document.addEventListener('keydown', event => {
      if (this.isPaused) event.stopPropagation();
      if (event.key === 'Escape' && !this.inLobby) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.repeat || this.busy) return;
        actions.uiSound('back');
        if (this.isPaused) {
          if (document.body.dataset.stageTools === 'open') {
            document.body.dataset.stageTools = 'closed'; this.syncInert();
            const tools = this.root.querySelector<HTMLElement>('[data-action="tools"]')!;
            tools.setAttribute('aria-pressed', 'false'); tools.focus();
          } else void this.resume();
        } else { actions.pause(); this.setView('paused'); }
        return;
      }
      if (this.isPaused && event.key === 'Tab' && document.body.dataset.stageTools !== 'open') {
        const options = [...this.root.querySelectorAll<HTMLElement>('.shell-pause-menu button:not(:disabled)')];
        const index = options.indexOf(document.activeElement as HTMLElement);
        event.preventDefault(); options[(index + (event.shiftKey ? options.length - 1 : 1)) % options.length]?.focus(); return;
      }
      if (!this.busy && (this.inLobby || this.isPaused) && !(event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const selector = this.view === 'paused' ? '.shell-pause-menu button' : this.view === 'home' ? '.shell-home .shell-menu > button, .shell-menu > a' : '.shell-track, .shell-import button, .shell-start';
        const options = [...this.root.querySelectorAll<HTMLElement>(selector)];
        const current = options.indexOf(document.activeElement as HTMLElement);
        const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
        const next = current < 0 ? 0 : (current + direction + options.length) % options.length;
        event.preventDefault(); options[next]?.focus();
        return;
      }
      if (event.key !== 'Escape' || this.busy) return;
      if (this.view === 'songs') { event.preventDefault(); actions.uiSound('back'); this.stopPreview(); this.setView('home'); }
    }, { capture: true, signal: this.abort.signal });
    this.renderSong(); this.setView('home', false);
  }

  get inLobby(): boolean { return this.view === 'home' || this.view === 'songs'; }
  get isPaused(): boolean { return this.view === 'paused'; }
  private resume(): Promise<void> {
    return this.run(async () => { await this.actions.resume(); this.setView('performance'); });
  }
  get isBusy(): boolean { return this.busy; }
  private renderSong(): void {
    const text = (selector: string, value: string) => { this.root.querySelector(selector)!.textContent = value; };
    const cover = this.root.querySelector<HTMLImageElement>('.shell-record img')!;
    cover.src = this.song.cover; cover.alt = `${this.song.subtitle || this.song.title}演出封面`;
    text('.shell-song-artist', this.song.artist); text('.shell-song-title', this.song.title);

    text('.shell-song-duration', this.song.duration);
    for (const button of this.root.querySelectorAll<HTMLElement>('.shell-track')) button.setAttribute('aria-pressed', String(button.dataset.songId === this.song.id));
  }
  private setView(view: View, focus = true): void {
    this.view = view; document.body.dataset.stageView = view; document.body.dataset.stageTools = 'closed';
    this.message.hidden = true;
    document.body.classList.remove('concert-watch');
    this.root.querySelector('[data-action="tools"]')!.setAttribute('aria-pressed', 'false');
    for (const pane of this.root.querySelectorAll<HTMLElement>('[data-view]')) pane.hidden = pane.dataset.view !== view;
    this.syncInert();
    this.actions.onView(view);
    if (view === 'songs') this.beginPreview();
    if (focus) {
      const target = view === 'performance' ? document.querySelector<HTMLElement>('[data-band-view] canvas') : this.root.querySelector<HTMLElement>(view === 'songs' ? '.shell-library-heading h1' : view === 'home' ? '.shell-home .shell-menu-main' : '[data-action="resume"]');
      if (view === 'performance' && target) target.tabIndex = -1;
      this.lastSoundTarget = target;
      if (this.busy) this.pendingFocus = target; else target?.focus();
    }
  }
  private syncInert(): void {
    for (const element of document.querySelectorAll<HTMLElement>('.band-camera, .mb-bar, .band-camera-pad, [data-band-view] canvas')) {
      element.inert = element.matches('.band-camera') ? !this.isPaused || document.body.dataset.stageTools !== 'open' : this.inLobby || this.isPaused || element.matches('.mb-bar, .band-camera-pad');
    }
  }
  enterPerformance(tools = false): void {
    this.stopPreview(); this.setView('performance');
    if (tools) { this.actions.pause(); this.setView('paused'); document.body.dataset.stageTools = 'open'; this.root.querySelector('[data-action="tools"]')!.setAttribute('aria-pressed', 'true'); this.syncInert(); }
  }
  stopPreview(): void {
    this.previewRequest++; this.previewSongId = null;
    this.actions.stopPreview(); this.previewing = false;
    this.root.dataset.previewPlaying = 'false';
  }
  /** Preview loading never blocks navigation; the host owns transport cancellation. */
  private beginPreview(): void {
    if (this.view !== 'songs' || this.previewSongId === this.song.id) return;
    const request = ++this.previewRequest;
    this.previewSongId = this.song.id;
    void this.actions.preview(this.song).then(() => {
      if (request !== this.previewRequest || this.view !== 'songs') return;
      this.previewing = true;
    }).catch(() => {
      if (request !== this.previewRequest || this.view !== 'songs') return;
      this.previewSongId = null; this.previewing = false;
    });
  }
  /** Called from the stage's existing RAF, using the existing MIDI transport. */
  updatePreview(_time: number, playing: boolean): void {
    if (!this.previewing) return;
    this.root.dataset.previewPlaying = String(playing);
  }
  /** A bounded envelope of the real audio analyser; no independent animation loop. */
  updateAudio(level: number, time: number): void {
    const target = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    const elapsed = time - this.audioTime;
    const delta = Number.isFinite(elapsed) && elapsed > 0 ? Math.min(.1, elapsed) : 1 / 60;
    this.audioTime = time;
    this.audioLevel += (target - this.audioLevel) * (1 - Math.exp(-delta / (target > this.audioLevel ? .07 : .28)));
    this.root.style.setProperty('--shell-level', this.audioLevel.toFixed(3));
  }
  private async run(action: () => Promise<void>, label = ''): Promise<void> {
    this.busy = true; this.root.setAttribute('aria-busy', 'true');
    this.message.hidden = true;
    for (const button of this.root.querySelectorAll('button')) button.disabled = true;
    const reveal = label ? await this.curtain.begin() : null;
    try { await action(); this.message.hidden = true; }
    catch (error) { this.message.textContent = `暂时未能完成，请重试。${error instanceof Error ? error.message : String(error)}`; this.message.hidden = false; }
    finally {
      await reveal?.();
      this.busy = false; this.root.removeAttribute('aria-busy');
      for (const button of this.root.querySelectorAll('button')) button.disabled = false;
      this.pendingFocus?.focus(); this.pendingFocus = null;
    }
  }
  dispose(): void { this.stopPreview(); this.abort.abort(); this.root.remove(); }
}
