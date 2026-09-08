import {
  mixTrimDb,
  type AudioMixTarget,
} from '../AudioMixProfile';

export type CalibrationTargetKind =
  | 'drums'
  | 'keyboard'
  | 'violin'
  | 'acoustic'
  | 'electric';

export interface CalibrationTarget {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly kind: CalibrationTargetKind;
  readonly mixTarget: AudioMixTarget;
  readonly program?: number;
  readonly tier?: 'lower' | 'upper';
  readonly articulation?: 'arco' | 'pizzicato';
  readonly tailSeconds: number;
  readonly description: string;
}

export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = Object.freeze([
  {
    id: 'drums',
    label: 'Drums',
    family: 'Rhythm',
    kind: 'drums',
    mixTarget: 'drums',
    tailSeconds: 0.8,
    description: 'Kick, snare, hi-hat and cymbal reference groove.',
  },
  {
    id: 'keyboard.lower',
    label: 'Keyboard · Piano',
    family: 'Keyboard',
    kind: 'keyboard',
    mixTarget: 'keyboard.lower',
    tier: 'lower',
    tailSeconds: 0.8,
    description: 'Acoustic grand piano single notes plus a triad.',
  },
  {
    id: 'keyboard.upper',
    label: 'Keyboard · Warm Pad',
    family: 'Keyboard',
    kind: 'keyboard',
    mixTarget: 'keyboard.upper',
    tier: 'upper',
    tailSeconds: 1.6,
    description: 'Warm pad sustained notes and chord reference.',
  },
  {
    id: 'violin.arco',
    label: 'Violin · Arco',
    family: 'Violin',
    kind: 'violin',
    mixTarget: 'violin.arco',
    articulation: 'arco',
    tailSeconds: 0.8,
    description: 'Bowed violin across the playable register.',
  },
  {
    id: 'violin.pizzicato',
    label: 'Violin · Pizzicato',
    family: 'Violin',
    kind: 'violin',
    mixTarget: 'violin.pizzicato',
    articulation: 'pizzicato',
    tailSeconds: 1.2,
    description: 'Pizzicato impulses across the playable register.',
  },
  {
    id: 'acoustic.24',
    label: 'Acoustic · Nylon',
    family: 'Acoustic Guitar',
    kind: 'acoustic',
    mixTarget: 'acoustic',
    program: 24,
    tailSeconds: 1.6,
    description: 'Nylon guitar single-note velocities plus open-string strum.',
  },
  {
    id: 'acoustic.25',
    label: 'Acoustic · Steel',
    family: 'Acoustic Guitar',
    kind: 'acoustic',
    mixTarget: 'acoustic',
    program: 25,
    tailSeconds: 1.6,
    description: 'Steel guitar single-note velocities plus open-string strum.',
  },
  {
    id: 'electric.26',
    label: 'Electric · Jazz',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 26,
    tailSeconds: 1.6,
    description: 'Jazz guitar reference notes and strum.',
  },
  {
    id: 'electric.27',
    label: 'Electric · Clean',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 27,
    tailSeconds: 1.6,
    description: 'Clean guitar reference notes and strum.',
  },
  {
    id: 'electric.28',
    label: 'Electric · Muted',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 28,
    tailSeconds: 0.8,
    description: 'Palm-muted guitar reference notes and short strum.',
  },
  {
    id: 'electric.29',
    label: 'Electric · Overdrive',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 29,
    tailSeconds: 1.8,
    description: 'Overdrive guitar reference notes and strum.',
  },
  {
    id: 'electric.30',
    label: 'Electric · Distortion',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 30,
    tailSeconds: 1.8,
    description: 'Distortion guitar reference notes and strum.',
  },
  {
    id: 'electric.31',
    label: 'Electric · Harmonics',
    family: 'Electric Guitar',
    kind: 'electric',
    mixTarget: 'electric',
    program: 31,
    tailSeconds: 1.5,
    description: 'Guitar harmonics reference notes and ringing strum.',
  },
]);

const BY_ID = new Map(CALIBRATION_TARGETS.map((target) => [target.id, target]));

export function calibrationTarget(id: string): CalibrationTarget {
  const target = BY_ID.get(id);
  if (!target) throw new Error(`Unknown calibration target: ${id}`);
  return target;
}

export function currentCalibrationTrimDb(target: CalibrationTarget): number {
  return mixTrimDb(target.mixTarget, target.program);
}
