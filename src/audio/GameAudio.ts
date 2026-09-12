import { AudioEngine, DEFAULT_AUDIO_MASTER_GAIN } from './AudioEngine';
import { gameIcon } from '../app/stage/icons';
import './game-audio.css';

export type UISound = 'hover' | 'confirm' | 'back';

/** Menu ambience and UI sounds share the game's existing mix; never sequence MIDI here. */
export class GameAudio {
  private readonly context: AudioContext;
  private readonly menu;
  private readonly effects;
  private readonly analyser: AnalyserNode;
  private readonly disconnectTap: () => void;
  private readonly bins = new Uint8Array(256);
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly abort = new AbortController();
  private readonly button = document.createElement('button');
  private source: AudioBufferSourceNode | null = null;
  private fading: AudioBufferSourceNode | null = null;
  private preparing: Promise<void> | null = null;
  private sourceTime = 0;
  private offset = 0;
  private menuWanted = true;
  private disposed = false;
  private lastEffect = -Infinity;
  private level = 0;
  private baseline = 0;
  private muted = false;
  private error = '';
  private unlockClick = false;

  constructor(private readonly audio: AudioEngine, automaticUI = false) {
    this.context = audio.getContext();
    this.menu = audio.createBus(.32); this.effects = audio.createBus(.22);
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = .25;
    this.disconnectTap = audio.connectMixTap(this.analyser);
    try { this.muted = localStorage.getItem('encore-muted') === '1'; this.offset = Number(sessionStorage.getItem('encore-menu-time')) || 0; } catch {}
    if (this.muted) audio.setMasterGain(0);
    this.button.className = 'game-sound-control'; this.button.type = 'button';
    this.button.addEventListener('click', () => {
      if (this.unlockClick || this.context.state !== 'running' || this.error) { this.unlockClick = false; this.error = ''; void this.unlock(); return; }
      this.muted = !this.muted;
      audio.setMasterGain(this.muted ? 0 : DEFAULT_AUDIO_MASTER_GAIN);
      try { localStorage.setItem('encore-muted', this.muted ? '1' : '0'); } catch {}
      this.refreshButton();
    }, { signal: this.abort.signal });
    document.body.append(this.button); this.refreshButton();
    this.button.addEventListener('pointerenter', () => this.uiSound('hover'), { signal: this.abort.signal });
    const unlock = (event: Event) => {
      if (this.button.contains(event.target as Node)) this.unlockClick = this.context.state !== 'running';
      if (this.context.state !== 'running') void this.unlock();
    };
    document.addEventListener('pointerdown', unlock, { capture: true, signal: this.abort.signal });
    document.addEventListener('keydown', unlock, { capture: true, signal: this.abort.signal });
    this.context.addEventListener('statechange', () => { this.startMenu(); this.refreshButton(); }, { signal: this.abort.signal });
    if (automaticUI) {
      let hovered: Element | null = null;
      document.addEventListener('pointerover', event => {
        const target = (event.target as Element).closest('button,a,select');
        if (target && target !== hovered && target !== this.button) this.uiSound('hover'); hovered = target;
      }, { signal: this.abort.signal });
      document.addEventListener('click', event => {
        if ((event.target as Element).closest('button,a,select') && !this.button.contains(event.target as Node)) this.uiSound('confirm');
      }, { signal: this.abort.signal });
    }
    void this.prepare();
    // Browsers which already permit this origin can resume immediately; fresh visits await a gesture.
    void audio.resume().then(() => { if (!this.disposed) this.startMenu(); }).catch(() => {});
  }
  private prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = Promise.all(['menu', 'hover', 'confirm', 'back'].map(async name => {
      if (this.buffers.has(name)) return;
      const url = name === 'menu' ? '/audio/menu-loop.mp3' : `/audio/${name}.ogg`;
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`音频加载失败：${response.status}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (!this.disposed) this.buffers.set(name, buffer);
    })).then(() => { this.error = ''; this.startMenu(); this.refreshButton(); }).catch(error => {
      this.preparing = null;
      if (!this.disposed) { this.error = String(error); this.refreshButton(); }
    });
    return this.preparing;
  }
  private async unlock(): Promise<void> {
    try { await this.audio.resume(); await this.prepare(); if (!this.disposed) this.startMenu(); }
    catch (error) { if (!this.disposed) this.error = String(error); }
    if (!this.disposed) this.refreshButton();
  }
  private startMenu(): void {
    const buffer = this.buffers.get('menu');
    if (this.disposed || !this.menuWanted || this.source || !buffer || this.context.state !== 'running') return;
    this.fading?.stop(); this.fading = null;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.connect(this.menu.input); this.source = source; this.offset %= buffer.duration;
    this.sourceTime = this.context.currentTime; source.start(0, this.offset);
    this.menu.setGain(0); this.menu.setGain(.32, .45);
    source.onended = () => source.disconnect();
  }
  setMenuPlaying(wanted: boolean): void {
    if (this.disposed) return;
    this.menuWanted = wanted;
    if (wanted) this.startMenu();
    else if (this.source) {
      this.offset += this.context.currentTime - this.sourceTime;
      this.menu.setGain(0, .18); this.source.stop(this.context.currentTime + .2); this.fading = this.source; this.source = null;
    }
  }
  uiSound(kind: UISound): void {
    if (this.disposed || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (kind === 'hover' && now - this.lastEffect < .085) return;
    const buffer = this.buffers.get(kind); if (!buffer) return;
    this.lastEffect = now;
    this.audio.playBuffer(buffer, kind === 'hover' ? .3 : .55, undefined, this.effects.input);
  }
  /** Normalized bass/transient envelope for subtle UI lighting, sampled by the host's RAF. */
  sample(): number {
    this.analyser.getByteFrequencyData(this.bins);
    let energy = 0;
    for (let i = 1; i < 24; i++) energy += this.bins[i];
    energy /= 23 * 255;
    this.baseline += (energy - this.baseline) * .025;
    const next = this.muted || this.context.state !== 'running' ? 0 : Math.min(1, Math.max(0, energy - this.baseline) * 6 + energy * .2);
    this.level += (next - this.level) * (next > this.level ? .5 : .12);
    return this.level;
  }
  get time(): number { return this.context.currentTime; }
  get state() { return { menu: !!this.source, muted: this.muted, ready: this.buffers.size === 4, error: this.error, level: this.level }; }
  private refreshButton(): void {
    const locked = this.context.state !== 'running';
    const label = this.error ? '音乐加载失败，点击重试' : locked ? '点击开启声音' : this.muted ? '开启声音' : '静音';
    this.button.innerHTML = gameIcon(locked || this.muted ? 'muted' : 'volume');
    this.button.title = label; this.button.setAttribute('aria-label', label); this.button.setAttribute('aria-pressed', String(this.muted));
    this.button.dataset.locked = String(locked); this.button.dataset.error = String(!!this.error);
  }
  dispose(): void {
    if (this.disposed) return;
    if (this.source) this.offset += this.context.currentTime - this.sourceTime;
    try { sessionStorage.setItem('encore-menu-time', String(this.offset)); } catch {}
    this.disposed = true; this.abort.abort(); this.source?.stop(); this.source = null;
    this.fading?.stop(); this.fading = null;
    this.menu.disconnect(); this.effects.disconnect(); this.disconnectTap(); this.analyser.disconnect();
    this.buffers.clear(); this.button.remove();
  }
}
