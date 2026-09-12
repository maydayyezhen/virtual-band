import type { ScreenAudio, ScreenContent, ScreenControl, ScreenDescriptor, ScreenFrame, ScreenOptions, ScreenPlayer, ScreenPort } from './ScreenContent';

interface Binding {
  descriptor: ScreenDescriptor; player: ScreenPlayer; control: ScreenControl; label: string; content: ScreenContent;
  options: ScreenOptions; localTime: number; time: number; error: string | null;
}
const DEFAULTS: ScreenOptions = { fit: 'contain', brightness: .85, clock: 'song', playing: true };

/** Source loading, clocks and lifecycle. The application calls update; there is no private RAF. */
export class ScreenSession {
  private readonly bindings = new Map<string, Binding>();
  private readonly pending = new Map<string, AbortController>();
  private disposed = false;
  private accumulator = 0;
  private transport: { time: number; playing: boolean } | null = null;
  private audio?: ScreenAudio;
  constructor(readonly port: ScreenPort) {}
  hasContent(id: string, content: ScreenContent): boolean { return this.bindings.get(id)?.content === content; }
  status(id: string) {
    const b = this.bindings.get(id);
    return { label: b?.label ?? '默认图案', time: b?.time ?? 0, error: b?.error ?? null,
      options: { ...(b?.options ?? DEFAULTS) }, loading: this.pending.has(id), active: !!b };
  }
  async setContent(ids: readonly string[], content: ScreenContent, patch: Partial<ScreenOptions> = {}): Promise<void> {
    if (this.disposed) throw new Error('屏幕模块已关闭');
    const descriptors = this.descriptors(ids);
    const options = { ...DEFAULTS, ...patch }; validateOptions(options);
    for (const id of ids) this.pending.get(id)?.abort();
    const abort = new AbortController(); for (const id of ids) this.pending.set(id, abort);
    const prepared: { descriptor: ScreenDescriptor; player: ScreenPlayer; time: number }[] = [];
    const acquired = new Map<string, ScreenControl>();
    try {
      // All players must be ready before any screen changes. Sequential creation also bounds decoders.
      for (const descriptor of descriptors) {
        const player = await content.create(descriptor, abort.signal);
        const next = { descriptor, player, time: 0 }; prepared.push(next);
        if (abort.signal.aborted || this.disposed) throw new DOMException('素材加载已取消', 'AbortError');
        next.time = options.clock === 'song' && this.transport ? this.transport.time : 0;
        player.update(this.frame(descriptor, next.time, 0, options.playing && (options.clock !== 'song' || !this.transport || this.transport.playing)));
      }
      for (const { descriptor } of prepared) if (!this.bindings.has(descriptor.id)) acquired.set(descriptor.id, this.port.acquire(descriptor.id));
      for (const { descriptor, player } of prepared) {
        const control = this.bindings.get(descriptor.id)?.control ?? acquired.get(descriptor.id)!;
        control.present(player.surface, options);
      }
      for (const { descriptor, player, time } of prepared) {
        const old = this.bindings.get(descriptor.id);
        this.bindings.set(descriptor.id, { descriptor, player, control: old?.control ?? acquired.get(descriptor.id)!,
          label: content.label, content, options: { ...options }, localTime: time, time, error: null });
        if (old) disposePlayer(old.player);
      }
    } catch (error) {
      // Restore already-presented screens if a custom source cannot be attached.
      for (const { descriptor } of prepared) {
        const old = this.bindings.get(descriptor.id);
        if (old) old.control.present(old.player.surface, old.options);
      }
      for (const control of acquired.values()) control.release();
      for (const { player } of prepared) disposePlayer(player);
      throw error;
    } finally {
      for (const id of ids) if (this.pending.get(id) === abort) this.pending.delete(id);
    }
  }
  setOptions(ids: readonly string[], patch: Partial<ScreenOptions>): void {
    this.descriptors(ids);
    for (const id of ids) validateOptions({ ...this.status(id).options, ...patch });
    for (const id of ids) {
      const binding = this.bindings.get(id); if (!binding) continue;
      if (patch.clock && patch.clock !== binding.options.clock) binding.localTime = binding.time;
      binding.options = { ...binding.options, ...patch };
      binding.control.present(binding.player.surface, binding.options);
    }
    this.accumulator = 1;
  }
  cancelPending(ids: readonly string[]): void {
    this.descriptors(ids);
    for (const id of ids) this.pending.get(id)?.abort();
  }
  restore(ids: readonly string[] = this.port.screens.map(s => s.id)): void {
    this.descriptors(ids);
    for (const id of ids) {
      this.pending.get(id)?.abort(); this.pending.delete(id);
      const binding = this.bindings.get(id); if (!binding) continue;
      binding.control.release(); disposePlayer(binding.player); this.bindings.delete(id);
    }
  }
  update(dt: number, transport: { time: number; playing: boolean } | null, audio?: ScreenAudio, force = false): void {
    if (this.disposed) return;
    this.transport = transport; this.audio = audio;
    const delta = Math.max(0, Math.min(.1, dt)); this.accumulator += delta;
    for (const b of this.bindings.values()) if (b.options.playing && !b.error) b.localTime += delta;
    if (!force && this.accumulator < 1 / 30) return;
    this.accumulator = 0;
    for (const b of this.bindings.values()) {
      if (b.error) continue;
      const song = b.options.clock === 'song' ? transport : null;
      const time = b.options.playing ? (song?.time ?? b.localTime) : b.time;
      const playing = b.options.playing && (song?.playing ?? true);
      try {
        const changed = b.player.update(this.frame(b.descriptor, time, time - b.time, playing));
        b.time = time;
        if (changed !== false) b.control.invalidate();
      } catch (error) {
        b.error = String(error); b.options.playing = false;
        // Freeze a failed provider without breaking other screens or the application's loop.
      }
    }
  }
  dispose(): void { if (this.disposed) return; this.restore(); this.disposed = true; }
  private descriptors(ids: readonly string[]): ScreenDescriptor[] {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('屏幕选择不能为空或重复');
    return ids.map(id => { const screen = this.port.screens.find(s => s.id === id); if (!screen) throw new Error(`未知屏幕：${id}`); return screen; });
  }
  private frame(screen: ScreenDescriptor, time: number, delta: number, playing: boolean): ScreenFrame {
    return { time, delta, playing, width: screen.pixelWidth, height: screen.pixelHeight, audio: this.audio };
  }
}
function validateOptions(options: ScreenOptions): void {
  if (!['contain', 'cover'].includes(options.fit) || !['local', 'song'].includes(options.clock)
    || !Number.isFinite(options.brightness) || options.brightness < 0 || options.brightness > 2 || typeof options.playing !== 'boolean')
    throw new Error('无效的屏幕显示选项');
}
function disposePlayer(player: ScreenPlayer): void {
  try { player.dispose(); } catch (error) { console.warn('[LED] 内容源释放失败', error); }
}
