export type CueLayer = 'section' | 'motion' | 'accent';
export type LightingProperty = 'intensity' | 'color' | 'pan' | 'tilt' | 'beamAngleDeg';
export type BlendMode = 'replace' | 'add' | 'max' | 'multiply';

export type FixtureSelector =
  | { ids: string[]; order?: 'given' }
  | {
      fixtureType?: string;
      groupsAll?: string[];
      order?: 'id-asc' | 'id-desc';
    };

export type ConstantEffect = {
  op: 'constant';
  value: number | string;
};

export type CurveKeyframe = {
  time: number;
  value: number | string;
};

export type CurveEffect = {
  op: 'curve';
  keyframes: CurveKeyframe[];
};

export type OscillatorEffect = {
  op: 'oscillator';
  min: number;
  max: number;
  periodSeconds: number;
  phase?: number;
  fixturePhaseStep?: number;
};

export type EventEnvelopeEffect = {
  op: 'eventEnvelope';
  roleIds: string[];
  noteNumbers?: number[];
  attackSeconds: number;
  decaySeconds: number;
  gain: number;
  reducer?: 'max' | 'sumClamped';
};

export type EffectSpec = ConstantEffect | CurveEffect | OscillatorEffect | EventEnvelopeEffect;

export type CueChannel = {
  blend: BlendMode;
  effect: EffectSpec;
};

export type LightingCue = {
  id: string;
  sectionId: string;
  startSeconds: number;
  endSeconds: number;
  layer: CueLayer;
  priority: number;
  select: FixtureSelector;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  channels: Partial<Record<LightingProperty, CueChannel>>;
};

export type ShowSection = {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  intent: string;
};

export type ShowPlan = {
  schemaVersion: '2.0-prototype';
  id: string;
  revision: number;
  title: string;
  brief: string;
  seed: number;
  baseLook: {
    intensity: number;
  };
  sections: ShowSection[];
  cues: LightingCue[];
};

export type SongEvent = {
  s: number;
  e?: number;
  v?: number;
  i?: string;
  n?: number;
};

export type SongScore = {
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  events: SongEvent[];
};

export type FixtureState = {
  intensity: number;
  color: string;
  pan: number;
  tilt: number;
  beamAngleDeg: number;
};

export type RigFixtureSnapshot = {
  id: string;
  type: string;
  groups: string[];
  supports: LightingProperty[];
  home: FixtureState;
};

export type RigSnapshot = {
  rigId: string;
  revision: string;
  fixtures: RigFixtureSnapshot[];
};

export type FrameState = {
  musicSeconds: number;
  sectionId: string | null;
  activeCueIds: string[];
  fixtures: Map<string, FixtureState>;
};

export type Diagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  cueId?: string;
  fixtureIds?: string[];
};

export type CompiledCue = LightingCue & {
  fixtureIds: string[];
};

export type CompiledShow = {
  plan: ShowPlan;
  rig: RigSnapshot;
  score: SongScore;
  cuesByLayer: Record<CueLayer, CompiledCue[]>;
  diagnostics: Diagnostic[];
};
