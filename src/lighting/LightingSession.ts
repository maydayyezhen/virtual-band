import type { LightingControl, LightingFrame, LightingPort, PreparedLightingShow } from './Lighting.ts';

/** Called by the existing application loop using the player's clock. Owns no timers. */
export class LightingSession {
  private control: LightingControl | null = null;
  private show: PreparedLightingShow | null = null;
  private lastTime = NaN;
  frame: LightingFrame | null = null;
  constructor(private readonly port: LightingPort) {}
  get currentShow(): PreparedLightingShow | null { return this.show; }
  get enabled(): boolean { return this.control !== null; }
  setShow(show: PreparedLightingShow | null, seconds = 0): void {
    this.control?.release(); this.control = null;
    this.show = show; this.frame = null; this.lastTime = NaN;
    if (show) this.setEnabled(true, seconds);
  }
  setEnabled(enabled: boolean, seconds = 0): void {
    if (!enabled) { this.control?.release(); this.control = null; this.lastTime = NaN; return; }
    if (!this.show || this.control) return;
    const frame = this.show.evaluate(seconds);
    const control = this.port.acquire();
    try { control.apply(frame); } catch (error) { control.release(); throw error; }
    this.control = control; this.frame = frame; this.lastTime = seconds;
  }
  update(seconds: number): void {
    if (!this.control || !this.show || seconds === this.lastTime) return;
    const frame = this.show.evaluate(seconds);
    this.control.apply(frame); this.frame = frame; this.lastTime = seconds;
  }
  dispose(): void { this.setShow(null); }
}
