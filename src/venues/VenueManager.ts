import type * as THREE from 'three';
import type { Venue } from './Venue';

export class VenueManager {
  private readonly scene: THREE.Scene;
  private readonly venues = new Map<string, Venue>();
  private activeVenue: Venue | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  register(venue: Venue): void {
    if (this.venues.has(venue.id)) throw new Error(`Venue already registered: ${venue.id}`);
    this.venues.set(venue.id, venue);
  }

  activate(id: string): Venue {
    const next = this.venues.get(id);
    if (!next) throw new Error(`Unknown venue: ${id}`);
    if (this.activeVenue === next) return next;
    if (this.activeVenue?.root.parent === this.scene) this.scene.remove(this.activeVenue.root);
    this.activeVenue = next;
    this.scene.add(next.root);
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
}
