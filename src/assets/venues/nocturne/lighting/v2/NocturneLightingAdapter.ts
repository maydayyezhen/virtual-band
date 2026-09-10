import type { FrameState, FixtureState, LightingProperty, RigFixtureSnapshot, RigSnapshot } from './contracts';

type FixturePatch = Record<string, unknown>;

type StageFixture = {
  id: string;
  type: string;
  groups: Set<string>;
  set: (patch: FixturePatch, duration?: number) => unknown;
};

export type LightingStage = {
  time: number;
  demo: boolean;
  paused: boolean;
  lights: Map<string, StageFixture>;
  setDemo: (enabled: boolean) => unknown;
  setPaused: (paused: boolean) => unknown;
  setStageMode: (mode: string) => unknown;
  setBPM?: (bpm: number) => unknown;
};

const BEAM_PROPERTIES: LightingProperty[] = ['intensity', 'color', 'pan', 'tilt', 'beamAngleDeg'];
const PAR_PROPERTIES: LightingProperty[] = ['intensity', 'color', 'beamAngleDeg'];

function homeFor(fixture: StageFixture): FixtureState {
  if (fixture.type === 'beam') {
    if (fixture.groups.has('floor')) {
      return { intensity: 0, color: '#465a78', pan: 0, tilt: 42, beamAngleDeg: 3.2 };
    }
    if (fixture.groups.has('rear')) {
      return { intensity: 0, color: '#788391', pan: 0, tilt: -26, beamAngleDeg: 3.2 };
    }
    return { intensity: 0, color: '#f4f0e7', pan: 0, tilt: -22, beamAngleDeg: 4.2 };
  }

  return { intensity: 0, color: '#e3c9a4', pan: 0, tilt: -25, beamAngleDeg: 24 };
}

function snapshotOf(fixture: StageFixture): RigFixtureSnapshot {
  return {
    id: fixture.id,
    type: fixture.type,
    groups: [...fixture.groups].sort(),
    supports: fixture.type === 'beam' ? [...BEAM_PROPERTIES] : [...PAR_PROPERTIES],
    home: homeFor(fixture),
  };
}

export class NocturneLightingAdapter {
  private owner: string | null = null;
  private readonly rig: RigSnapshot;

  constructor(private readonly stage: LightingStage) {
    this.rig = {
      rigId: 'nocturne-stage',
      revision: `lights:${stage.lights.size}`,
      fixtures: [...stage.lights.values()].map(snapshotOf).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  describeRig(): RigSnapshot {
    return {
      ...this.rig,
      fixtures: this.rig.fixtures.map((fixture) => ({
        ...fixture,
        groups: [...fixture.groups],
        supports: [...fixture.supports],
        home: { ...fixture.home },
      })),
    };
  }

  acquireControl(ownerId: string): void {
    this.owner = ownerId;
    this.stage.setDemo(false);
    this.stage.setPaused(false);
    this.stage.setStageMode('manual');
  }

  applyFrame(frame: FrameState): void {
    if (!this.owner) return;

    for (const [fixtureId, state] of frame.fixtures) {
      const fixture = this.stage.lights.get(fixtureId);
      if (!fixture) continue;

      const patch: FixturePatch = {
        enabled: true,
        beam: true,
        color: state.color,
        intensity: Math.max(0, Math.min(2, state.intensity * (fixture.type === 'beam' ? 1.45 : 1.1))),
        angle: state.beamAngleDeg,
        strobe: 0,
        beatSensitivity: 0,
        scan: null,
      };

      if (fixture.type === 'beam') {
        patch.pan = state.pan;
        patch.tilt = state.tilt;
        patch.distance = fixture.groups.has('floor') ? 54 : 60;
      } else {
        patch.distance = 42;
      }

      fixture.set(patch, 0);
    }
  }

  releaseControl(ownerId: string): void {
    if (this.owner !== ownerId) return;
    this.owner = null;
  }

  dispose(): void {
    this.owner = null;
  }
}
