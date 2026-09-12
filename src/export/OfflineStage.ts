import type { BandPlayer } from '../dev/band-viewer/BandPlayer';
import type { InstrumentRegistry } from '../instruments/Instrument';
import type { LightingSession } from '../lighting/LightingSession';
import type { ScreenSession } from '../screens/ScreenSession';
import type { CameraSystem } from '../camera/CameraSystem';
import type { CameraShowPlayer } from '../camera/CameraShowPlayer';
import type { RendererHost } from '../engine/RendererHost';
import type { TitleLayer } from '../titles/TitleLayer';

/** Sequential fixed-step simulation for authored shows with deterministic screen content. */
export class OfflineStage {
  private tick = 0;
  private previousFrameTime = 0;
  private started = false;
  private readonly hz = 120;
  constructor(private readonly parts: {
    player: () => BandPlayer | null; instruments: InstrumentRegistry;
    lighting: LightingSession; screens: ScreenSession; venue: { update(dt: number): void };
    camera: CameraSystem; cameraShow: CameraShowPlayer; titles: TitleLayer; host: RendererHost;
  }) {}
  begin(): { duration: number; width: number; height: number } {
    const p = this.parts, player = p.player();
    if (!player || !p.cameraShow.available) throw new Error('请先加载带导播编排的作品');
    player.stop(); p.instruments.resetAll();
    this.tick = 0; this.previousFrameTime = 0; this.started = true;
    player.updateVisuals(0);
    const size = p.host.resizeIfNeeded(); p.camera.setViewport(size.width, size.height);
    return { duration: player.total, width: p.host.renderer.domElement.width, height: p.host.renderer.domElement.height };
  }
  renderAt(time: number): HTMLCanvasElement {
    if (!this.started || !Number.isFinite(time) || time < this.previousFrameTime) throw new Error('离线渲染必须从零开始按时间顺序推进');
    const p = this.parts;
    const targetTick = Math.floor(time * this.hz + 1e-7);
    while (this.tick < targetTick) {
      const t = ++this.tick / this.hz;
      p.player()!.updateVisuals(t);
      p.instruments.update(1 / this.hz);
    }
    p.lighting.update(time);
    if (p.lighting.error) throw new Error(`灯光编排：${p.lighting.error}`);
    p.screens.update(time - this.previousFrameTime, { time, playing: true }, undefined, true);
    for (const screen of p.screens.port.screens) {
      const error = p.screens.status(screen.id).error;
      if (error) throw new Error(`LED ${screen.id}: ${error}`);
    }
    p.venue.update(0); // Authored lights/haze already have absolute time; no wall-clock drift.
    p.cameraShow.update(time);
    if (p.cameraShow.error) throw new Error(`镜头编排：${p.cameraShow.error}`);
    p.host.render(p.camera.output);
    p.titles.update(time); p.titles.render(p.host.renderer);
    this.previousFrameTime = time;
    return p.host.renderer.domElement;
  }
}
