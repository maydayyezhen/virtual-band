import * as THREE from 'three';
import type { FixtureDescriptor, LightingFrame, LightingPort, LightingRig, RGB } from '../../lighting/Lighting';

interface NativeFixture {
  id: string; type: 'beam' | 'par'; groups: Set<string>; root: THREE.Group;
  light: THREE.SpotLight; direction: THREE.Vector3; effective: { intensity: number };
  demoOwner: boolean;
  state: { color: THREE.Color; intensity: number; target: THREE.Vector3; angle: number; distance: number;
    enabled: boolean; beam: boolean; beatSensitivity: number };
  set(patch: object, duration?: number, internal?: boolean): void;
}
/** Only the native lighting resources used by this adapter; no camera, screen or audio access. */
interface LightingHost {
  scene: THREE.Scene; lights: Map<string, NativeFixture>;
  master: number; demo: boolean; time: number; demoTime: number; nextDemoBeat: number;
  beat: { value: number; index: number };
  key: THREE.SpotLight; ambient: THREE.HemisphereLight;
  haze: { time: number; density: number; animated: boolean; enabled: boolean; demoOwner: boolean };
}
type Pixel = THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
type Gobo = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** Native fixture implementation remains private. A lease is the sole show writer. */
export class NocturneLighting implements LightingPort {
  readonly rig: LightingRig;
  private owner: symbol | null = null;
  private disposed = false;
  private restore: (() => void) | null = null;
  private extras: THREE.Group | null = null;
  private readonly pixels = new Map<string, Pixel>();
  private readonly gobos = new Map<string, Gobo>();
  private readonly pool: THREE.SpotLight[] = [];
  constructor(private readonly host: LightingHost) {
    const fixtures: FixtureDescriptor[] = [...host.lights.values()].map(f => ({
      id: f.id, type: f.type, groups: [...f.groups], position: f.root.position.toArray(),
      group: f.type === 'par' ? 'par' : f.groups.has('rear') ? 'rear' : f.groups.has('side') ? 'side' : 'floor',
    }));
    this.rig = { id: 'nocturne', fixtures,
      pixels: Array.from({ length: 56 }, (_, i) => ({ id: `pixel-${i}`, row: Math.floor(i / 28), index: i % 28, count: 28 })),
      gobos: Array.from({ length: 4 }, (_, i) => ({ id: `gobo-${i}`, index: i })),
    };
  }
  get controlled(): boolean { return this.owner !== null; }
  acquire() {
    if (this.disposed) throw new Error('灯光模块已关闭');
    if (this.owner) throw new Error('舞台灯光已由另一编排控制');
    this.ensureAccents();
    const app = this.host;
    const baseline = { master: app.master, demo: app.demo, time: app.time, demoTime: app.demoTime,
      nextDemoBeat: app.nextDemoBeat, beat: { ...app.beat }, key: app.key.intensity, ambient: app.ambient.intensity,
      background: (app.scene.background as THREE.Color).clone(),
      haze: { time: app.haze.time, density: app.haze.density, animated: app.haze.animated, enabled: app.haze.enabled, demoOwner: app.haze.demoOwner },
    };
    const fixtures = [...app.lights.values()].map(f => ({ fixture: f, demoOwner: f.demoOwner,
      state: { ...f.state, color: f.state.color.clone(), target: f.state.target.clone() },
    }));
    this.restore = () => {
      for (const { fixture, state, demoOwner } of fixtures) {
        fixture.set(state, 0, true); fixture.demoOwner = demoOwner;
        app.scene.add(fixture.light, fixture.light.target);
      }
      for (const light of this.pool) { light.removeFromParent(); light.target.removeFromParent(); light.intensity = 0; }
      this.extras!.removeFromParent();
      app.master = baseline.master; app.demo = baseline.demo; app.time = baseline.time;
      app.demoTime = baseline.demoTime; app.nextDemoBeat = baseline.nextDemoBeat;
      Object.assign(app.beat, baseline.beat); Object.assign(app.haze, baseline.haze);
      app.key.intensity = baseline.key; app.ambient.intensity = baseline.ambient;
      (app.scene.background as THREE.Color).copy(baseline.background);
    };
    for (const f of app.lights.values()) {
      f.set({ scan: null, strobe: 0, beatSensitivity: 0, enabled: true });
      f.light.removeFromParent(); f.light.target.removeFromParent();
    }
    app.demo = false; app.beat.value = 0; app.haze.animated = false; app.haze.enabled = true;
    app.scene.add(this.extras!);
    for (const light of this.pool) app.scene.add(light, light.target);
    const token = Symbol('lighting-control'); this.owner = token;
    return {
      apply: (frame: LightingFrame) => {
        if (this.owner !== token || this.disposed) throw new Error('灯光控制已释放');
        this.apply(frame);
      },
      release: () => {
        if (this.owner !== token) return;
        this.restore?.(); this.restore = null; this.owner = null;
      },
    };
  }
  private apply(frame: LightingFrame): void {
    validateFrame(frame, this.rig); // Validate the entire frame before mutating any fixture.
    const app = this.host;
    app.time = frame.time; app.master = frame.master;
    for (const state of frame.fixtures) {
      const f = app.lights.get(state.id)!;
      f.set({ target: state.target, intensity: state.intensity, angle: state.angle,
        distance: state.distance, beam: state.beam }, 0, true);
      f.state.color.setRGB(...state.color);
    }
    for (const state of frame.pixels) this.pixels.get(state.id)!.material.color.setRGB(...state.color);
    for (const state of frame.gobos) {
      const gobo = this.gobos.get(state.id)!;
      gobo.material.color.setRGB(...state.color); gobo.material.opacity = state.opacity;
      gobo.rotation.z = state.rotation;
    }
    app.key.intensity = frame.environment.key; app.ambient.intensity = frame.environment.ambient;
    (app.scene.background as THREE.Color).setRGB(...frame.environment.background);
    app.haze.density = frame.environment.hazeDensity; app.haze.time = frame.environment.hazeTime;
  }
  /** Called after fixture poses have updated, within the host's existing frame. */
  updateSurfaceLights(): void {
    if (!this.owner) return;
    const candidates = [...this.host.lights.values()].filter(f => f.direction.y < -.12)
      .sort((a, b) => b.effective.intensity - a.effective.intensity || a.id.localeCompare(b.id));
    this.pool.forEach((light, i) => {
      const f = candidates[i];
      if (!f) { light.intensity = 0; return; }
      light.position.copy(f.light.position); light.target.position.copy(f.light.target.position);
      light.color.copy(f.light.color); light.intensity = f.light.intensity;
      light.angle = f.light.angle; light.distance = f.light.distance;
      light.penumbra = f.type === 'par' ? .65 : .42;
    });
  }
  private ensureAccents(): void {
    if (this.extras) return;
    this.extras = new THREE.Group(); this.extras.name = 'lighting:accents';
    const geo = new THREE.BoxGeometry(.77, .065, .07), caseGeo = new THREE.BoxGeometry(.91, .12, .10);
    const dark = new THREE.MeshStandardMaterial({ color: '#13171c', metalness: .6, roughness: .4 });
    for (const descriptor of this.rig.pixels) {
      const { row, index } = descriptor;
      const x = (index - 13.5) * .99, y = row ? 12.88 : .88, z = row ? -5.78 : 8.045;
      const body = new THREE.Mesh(caseGeo, dark); body.position.set(x, y, z); this.extras.add(body);
      const pixel = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0, toneMapped: false }));
      pixel.name = descriptor.id; pixel.position.set(x, y, z + .06); this.extras.add(pixel); this.pixels.set(descriptor.id, pixel);
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!; ctx.translate(128, 128);
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate(i * Math.PI * 2 / 12); ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.beginPath(); ctx.moveTo(31, -4); ctx.lineTo(105, -14); ctx.lineTo(114, 2); ctx.lineTo(35, 4); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 37, 0, Math.PI * 2); ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.PlaneGeometry(6, 6);
    for (const descriptor of this.rig.gobos) {
      const gobo = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, color: '#a2cbea', transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
      gobo.name = descriptor.id; gobo.rotation.x = -Math.PI / 2;
      gobo.position.set(-9 + descriptor.index * 6, 1.235, 3); this.extras.add(gobo); this.gobos.set(descriptor.id, gobo);
    }
    for (let i = 0; i < 6; i++) {
      const light = new THREE.SpotLight('#fff', 0, 65, .1, .5, 2);
      light.name = `lighting:surface-${i}`; this.pool.push(light);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.restore?.(); this.restore = null; this.owner = null; this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.extras?.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(mat); if ('map' in mat && mat.map) textures.add(mat.map as THREE.Texture);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.pool.forEach(light => light.dispose()); this.pool.length = 0;
    this.extras?.clear(); this.extras = null; this.pixels.clear(); this.gobos.clear();
  }
}

function validateFrame(frame: LightingFrame, rig: LightingRig): void {
  const finite = (n: number, min = -Infinity, max = Infinity) => Number.isFinite(n) && n >= min && n <= max;
  const color = (c: RGB) => c.length === 3 && c.every(n => finite(n, 0));
  const ids = (states: readonly { id: string }[], expected: readonly { id: string }[]) =>
    states.length === expected.length && new Set(states.map(s => s.id)).size === states.length && states.every(s => expected.some(e => e.id === s.id));
  const env = frame.environment;
  if (!finite(frame.time, 0) || !finite(frame.master, 0, 2) || !finite(env.key, 0) || !finite(env.ambient, 0)
    || !finite(env.hazeDensity, 0, 1) || !finite(env.hazeTime, 0) || !color(env.background)
    || !ids(frame.fixtures, rig.fixtures) || !ids(frame.pixels, rig.pixels) || !ids(frame.gobos, rig.gobos)
    || frame.fixtures.some(f => !color(f.color) || f.target.length !== 3 || !f.target.every(n => finite(n))
      || !finite(f.intensity, 0, 2) || !finite(f.angle, .6, 55) || !finite(f.distance, 1, 90) || typeof f.beam !== 'boolean')
    || frame.pixels.some(p => !color(p.color))
    || frame.gobos.some(g => !color(g.color) || !finite(g.opacity, 0, 1) || !finite(g.rotation)))
    throw new Error('Invalid or incomplete lighting frame');
}
