import * as THREE from 'three';
import { evaluateTitles, type TitleCue, type TitleShow } from './TitleShow';

/** Composite after the venue's effects into the SAME WebGL canvas, including future captures. */
export class TitleLayer {
  enabled = true;
  private show: TitleShow | null = null;
  private time = 0;
  private readonly canvas = document.createElement('canvas');
  private readonly texture = new THREE.CanvasTexture(this.canvas);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  private readonly blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  private readonly card = new THREE.Mesh(this.geometry, this.material);
  private readonly black = new THREE.Mesh(this.geometry, this.blackMaterial);
  private readonly size = new THREE.Vector2();
  private drawnCue: TitleCue | undefined;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.camera.position.z = 1;
    this.black.renderOrder = 0; this.card.renderOrder = 1;
    this.scene.add(this.black, this.card);
  }
  setShow(show: TitleShow | null): void { this.show = show; this.drawnCue = undefined; this.time = 0; }
  update(time: number): void { this.time = time; }
  get state() { return evaluateTitles(this.enabled ? this.show : null, this.time); }
  render(renderer: THREE.WebGLRenderer): void {
    const state = this.state;
    if (state.opacity <= 0 && state.blackout <= 0) return;
    renderer.getDrawingBufferSize(this.size);
    const { x: width, y: height } = this.size;
    if (state.cue && (this.drawnCue !== state.cue || this.canvas.width !== width || this.canvas.height !== height)) {
      this.canvas.width = width; this.canvas.height = height;
      drawCard(this.canvas, state.cue);
      this.texture.needsUpdate = true; this.drawnCue = state.cue;
    }
    this.material.opacity = state.opacity;
    this.card.visible = state.opacity > 0;
    this.card.position.y = this.reducedMotion.matches ? 0 : -state.lift * 2;
    this.blackMaterial.opacity = state.blackout;
    this.black.visible = state.blackout > 0;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try { renderer.render(this.scene, this.camera); }
    finally { renderer.autoClear = autoClear; }
  }
  dispose(): void {
    this.texture.dispose(); this.material.dispose(); this.blackMaterial.dispose(); this.geometry.dispose();
    this.canvas.width = this.canvas.height = 1;
  }
}

function drawCard(canvas: HTMLCanvasElement, cue: TitleCue): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height, unit = Math.min(w / 1440, h / 900);
  const y = h * (cue.placement === 'lower' ? .80 : .50);
  // A feathered scrim keeps the typography legible without a rectangular title plate.
  const scrim = ctx.createLinearGradient(0, y - 150 * unit, 0, Math.min(h, y + 160 * unit));
  scrim.addColorStop(0, 'rgba(3,7,12,0)'); scrim.addColorStop(.48, 'rgba(3,7,12,.55)'); scrim.addColorStop(1, 'rgba(3,7,12,0)');
  ctx.fillStyle = scrim; ctx.fillRect(0, y - 150 * unit, w, 310 * unit);
  ctx.textBaseline = 'middle';
  const tracked = (text: string, fontSize: number, spacing: number, family: string, baseline: number, color: string) => {
    ctx.font = `${fontSize * unit}px ${family}`;
    let tracking = spacing * unit;
    let widths = [...text].map(c => ctx.measureText(c).width);
    let total = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * tracking;
    if (total > w * .87) {
      const scale = w * .87 / total;
      ctx.font = `${fontSize * unit * scale}px ${family}`; tracking *= scale;
      widths = [...text].map(c => ctx.measureText(c).width);
      total = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * tracking;
    }
    ctx.fillStyle = color; ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 9 * unit;
    let x = (w - total) / 2;
    [...text].forEach((c, i) => { ctx.fillText(c, x, baseline); x += widths[i] + tracking; });
    ctx.shadowBlur = 0;
  };
  tracked(cue.artist, 13, 5, '"Segoe UI", sans-serif', y - 59 * unit, '#d2bd91');
  tracked(cue.title, 40, 3.8, 'Georgia, "Times New Roman", serif', y, '#f3eee2');
  ctx.strokeStyle = 'rgba(199,168,109,.65)'; ctx.lineWidth = Math.max(1, unit * .65);
  ctx.beginPath(); ctx.moveTo(w / 2 - 30 * unit, y + 39 * unit); ctx.lineTo(w / 2 + 30 * unit, y + 39 * unit); ctx.stroke();
  tracked(cue.credit, 17, 2, '"Segoe UI", "Microsoft YaHei", sans-serif', y + 72 * unit, '#d4cabc');
}
