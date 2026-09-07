import type * as THREE from 'three';
import type { RendererHost } from '../engine/RendererHost';
import type { InstrumentRegistry } from '../instruments/Instrument';
import type { InstrumentTransform, Venue } from './Venue';

export class VenueManager {
  private readonly renderer: RendererHost;
  private readonly scene: THREE.Scene;
  private readonly instruments: InstrumentRegistry;
  private readonly venues = new Map<string, Venue>();
  private activeVenue: Venue | null = null;

  constructor(renderer: RendererHost, instruments: InstrumentRegistry) {
    this.renderer = renderer;
    this.scene = renderer.scene;
    this.instruments = instruments;
  }

  register(venue: Venue): void {
    if (this.venues.has(venue.id)) throw new Error(`Venue already registered: ${venue.id}`);
    this.venues.set(venue.id, venue);
  }

  activate(id: string): Venue {
    const next = this.venues.get(id);
    if (!next) throw new Error(`Unknown venue: ${id}`);
    if (this.activeVenue === next) {
      this.renderer.applySceneProfile(next.sceneProfile);
      this.applyLayout(next);
      return next;
    }
    if (this.activeVenue?.root.parent === this.scene) this.scene.remove(this.activeVenue.root);
    this.activeVenue = next;
    this.renderer.applySceneProfile(next.sceneProfile);
    this.scene.add(next.root);
    this.applyLayout(next);
    return next;
  }

  update(dt: number): void {
    this.activeVenue?.update(dt);
  }

  get active(): Venue | null {
    return this.activeVenue;
  }

  dispose(): void {
    if (this.activeVenue?.root.parent === this.scene) this.scene.remove(this.activeVenue.root);
    for (const venue of this.venues.values()) venue.dispose();
    this.venues.clear();
    this.activeVenue = null;
  }

  private applyLayout(venue: Venue): void {
    for (const instrument of this.instruments.list()) {
      const transform = venue.layout[instrument.id];
      instrument.root.visible = Boolean(transform);
      if (!transform) continue;
      applyTransform(instrument.root, transform);
    }
  }
}

function applyTransform(root: THREE.Object3D, transform: InstrumentTransform): void {
  root.position.set(...transform.position);
  const rotation = transform.rotation ?? [0, 0, 0];
  root.rotation.set(...rotation);
  const scale = transform.scale ?? 1;
  if (typeof scale === 'number') root.scale.setScalar(scale);
  else root.scale.set(...scale);
  root.updateMatrixWorld(true);
}
