import * as THREE from 'three';
import type { ScreenControl, ScreenDescriptor, ScreenPort, ScreenSurface } from '../../screens/ScreenContent';

interface NativeScreen {
  id: string; width: number; height: number; canvas: HTMLCanvasElement;
  pattern: unknown; source: ScreenSurface | null; external: THREE.Texture | null;
  demoOwner: boolean; params: object; brightness: number; playing: boolean; time: number; fit: string; autoClear: boolean;
  error: unknown;
  material: THREE.ShaderMaterial;
  setContent(content: unknown, options?: object): void;
  setPattern(pattern: unknown, options?: object, internal?: boolean): void;
  setOptions(options: object): void;
  invalidate(): void;
}

/** The screen hardware exposes presentation only. Source players own media and timing. */
export class NocturneScreens implements ScreenPort {
  readonly screens: readonly ScreenDescriptor[];
  private readonly owners = new Map<string, { token: symbol; release(): void }>();
  private disposed = false;
  constructor(private readonly native: Map<string, NativeScreen>) {
    this.screens = [...native.values()].map(s => ({ id: s.id, width: s.width, height: s.height, pixelWidth: s.canvas.width, pixelHeight: s.canvas.height }));
  }
  controlled(id: string): boolean { return this.owners.has(id); }
  acquire(id: string): ScreenControl {
    if (this.disposed) throw new Error('屏幕模块已关闭');
    const screen = this.native.get(id);
    if (!screen) throw new Error(`未知屏幕：${id}`);
    if (this.owners.has(id)) throw new Error(`屏幕 ${id} 已被其他内容控制`);
    const token = Symbol(id);
    const baseline = { pattern: screen.pattern, source: screen.source ?? screen.external, demoOwner: screen.demoOwner,
      options: { params: { ...screen.params }, brightness: screen.brightness, playing: screen.playing,
        time: screen.time, fit: screen.fit, autoClear: screen.autoClear,
        decodeSRGB: screen.material.uniforms.decodeSRGB.value },
      scale: screen.material.uniforms.contentScale.value.clone() as THREE.Vector2,
    };
    let current: ScreenSurface | null = null;
    const check = () => { if (this.disposed || this.owners.get(id)?.token !== token) throw new Error('屏幕控制已释放'); };
    const release = () => {
      if (this.owners.get(id)?.token !== token) return;
      screen.setPattern(baseline.pattern, baseline.options, baseline.demoOwner);
      if (baseline.source) screen.setContent(baseline.source, baseline.options);
      screen.demoOwner = baseline.demoOwner;
      screen.material.uniforms.contentScale.value.copy(baseline.scale);
      this.owners.delete(id);
    };
    this.owners.set(id, { token, release });
    const fitTexture = () => {
      const texture = current as THREE.Texture | null;
      const scale = screen.material.uniforms.contentScale.value as THREE.Vector2;
      scale.set(1, 1);
      if (!texture?.isTexture) return;
      const image = texture.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined;
      const width = image?.videoWidth || image?.width, height = image?.videoHeight || image?.height;
      if (!width || !height) return;
      const ratio = (width / height) / (screen.width / screen.height);
      if (screen.fit === 'contain') { if (ratio > 1) scale.y = ratio; else scale.x = 1 / ratio; }
      else { if (ratio > 1) scale.x = 1 / ratio; else scale.y = ratio; }
    };
    return {
      present(surface, options) {
        check();
        if (!Number.isFinite(options.brightness) || options.brightness < 0 || options.brightness > 2 || !['contain', 'cover'].includes(options.fit))
          throw new Error('无效的屏幕显示选项');
        if (current !== surface) { screen.setContent(surface, { ...options, playing: false }); current = surface; }
        else screen.setOptions({ ...options, playing: false });
        fitTexture();
      },
      invalidate() { check(); if (screen.error) throw screen.error; fitTexture(); screen.invalidate(); },
      release,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    for (const owner of [...this.owners.values()]) owner.release();
    this.disposed = true;
  }
}
