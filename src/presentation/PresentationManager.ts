export interface PresentationMode {
  id: string;
  activate(): void;
  deactivate(): void;
  update(dt: number): void;
  dispose(): void;
}

export class PresentationManager {
  private readonly modes = new Map<string, PresentationMode>();
  private activeMode: PresentationMode | null = null;

  register(mode: PresentationMode): void {
    if (this.modes.has(mode.id)) throw new Error(`Presentation mode already registered: ${mode.id}`);
    this.modes.set(mode.id, mode);
  }

  activate(id: string): PresentationMode {
    const next = this.modes.get(id);
    if (!next) throw new Error(`Unknown presentation mode: ${id}`);
    if (this.activeMode === next) return next;
    this.activeMode?.deactivate();
    this.activeMode = next;
    next.activate();
    return next;
  }

  deactivate(): void {
    this.activeMode?.deactivate();
    this.activeMode = null;
  }

  update(dt: number): void {
    this.activeMode?.update(dt);
  }

  get active(): PresentationMode | null {
    return this.activeMode;
  }

  dispose(): void {
    this.deactivate();
    for (const mode of this.modes.values()) mode.dispose();
    this.modes.clear();
  }
}
