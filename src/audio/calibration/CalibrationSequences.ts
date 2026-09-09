import type { CalibrationAudioRuntime } from './CalibrationAudioRuntime';
import type { CalibrationTarget } from './CalibrationTargets';

export interface CalibrationSequenceProgress {
  readonly step: number;
  readonly total: number;
  readonly label: string;
}

type ProgressListener = (progress: CalibrationSequenceProgress) => void;

const GUITAR_OPEN_NOTES = [40, 45, 50, 55, 59, 64] as const;
const BASS_OPEN_NOTES = [28, 33, 38, 43] as const;

export async function runCalibrationSequence(
  runtime: CalibrationAudioRuntime,
  target: CalibrationTarget,
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  if (target.kind === 'drums') {
    await runDrumSequence(runtime, signal, onProgress);
    return;
  }
  if (target.kind === 'keyboard') {
    await runKeyboardSequence(runtime, target.tier ?? 'lower', signal, onProgress);
    return;
  }
  if (target.kind === 'violin') {
    await runViolinSequence(
      runtime,
      target.articulation ?? 'arco',
      signal,
      onProgress,
    );
    return;
  }
  if (target.kind === 'acoustic') {
    await runAcousticSequence(runtime, signal, onProgress);
    return;
  }
  if (target.kind === 'bass') {
    await runBassSequence(runtime, signal, onProgress);
    return;
  }
  await runElectricSequence(runtime, signal, onProgress);
}

export async function runAuditionSequence(
  runtime: CalibrationAudioRuntime,
  target: CalibrationTarget,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  if (target.kind === 'drums') {
    runtime.drumSampler.noteOn(36, 100);
    await wait(260, signal);
    runtime.drumSampler.noteOn(42, 74);
    runtime.drumSampler.noteOn(38, 104);
    await wait(320, signal);
    runtime.drumSampler.noteOn(36, 94);
    runtime.drumSampler.noteOn(46, 76);
    await wait(760, signal);
    return;
  }

  if (target.kind === 'keyboard') {
    const tier = target.tier ?? 'lower';
    const notes = tier === 'lower' ? [60, 64, 67] : [55, 60, 64, 67];
    const source = `calibration:audition:${tier}`;
    for (const note of notes) runtime.keyboardSampler.noteOn(tier, note, 84, source);
    await wait(tier === 'lower' ? 900 : 1500, signal);
    for (const note of notes) runtime.keyboardSampler.noteOff(tier, note, source);
    await wait(tier === 'lower' ? 500 : 900, signal);
    return;
  }

  if (target.kind === 'violin') {
    const articulation = target.articulation ?? 'arco';
    runtime.violinSampler.noteOn(2, 69, 86, articulation);
    await wait(articulation === 'arco' ? 950 : 650, signal);
    runtime.violinSampler.noteOff(2);
    await wait(articulation === 'arco' ? 550 : 850, signal);
    return;
  }

  if (target.kind === 'bass') {
    for (let index = 0; index < BASS_OPEN_NOTES.length; index += 1) {
      runtime.bassSampler.noteOn(4 - index, BASS_OPEN_NOTES[index], 90, 'pluck');
      await wait(70, signal);
    }
    await wait(1800, signal);
    return;
  }

  const sampler = target.kind === 'acoustic'
    ? runtime.acousticSampler
    : runtime.electricSampler;
  for (let index = 0; index < GUITAR_OPEN_NOTES.length; index += 1) {
    const stringNumber = 6 - index;
    sampler.noteOn(stringNumber, GUITAR_OPEN_NOTES[index], 88, 'strum');
    await wait(30, signal);
  }
  await wait(target.program === 28 ? 900 : 1800, signal);
}

async function runDrumSequence(
  runtime: CalibrationAudioRuntime,
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const steps = [
    { delay: 0, hits: [[36, 100], [42, 72]], label: 'Kick + closed hat' },
    { delay: 250, hits: [[42, 64]], label: 'Closed hat' },
    { delay: 250, hits: [[38, 104], [42, 78]], label: 'Snare + closed hat' },
    { delay: 250, hits: [[42, 66]], label: 'Closed hat' },
    { delay: 250, hits: [[36, 96], [42, 74]], label: 'Kick + closed hat' },
    { delay: 250, hits: [[42, 68]], label: 'Closed hat' },
    { delay: 250, hits: [[38, 108], [46, 82]], label: 'Snare + open hat' },
    { delay: 320, hits: [[49, 92]], label: 'Crash tail' },
  ] as const;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.delay > 0) await wait(step.delay, signal);
    report(onProgress, index, steps.length, step.label);
    for (const [note, velocity] of step.hits) runtime.drumSampler.noteOn(note, velocity);
  }
  await wait(550, signal);
}

async function runKeyboardSequence(
  runtime: CalibrationAudioRuntime,
  tier: 'lower' | 'upper',
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const singles = tier === 'lower'
    ? [
        { note: 48, velocity: 48, hold: 460, label: 'C2 · velocity 48' },
        { note: 60, velocity: 80, hold: 520, label: 'C3 · velocity 80' },
        { note: 72, velocity: 112, hold: 560, label: 'C4 · velocity 112' },
      ]
    : [
        { note: 55, velocity: 48, hold: 900, label: 'G2 · velocity 48' },
        { note: 67, velocity: 80, hold: 1050, label: 'G3 · velocity 80' },
        { note: 79, velocity: 112, hold: 1150, label: 'G4 · velocity 112' },
      ];
  const total = singles.length + 1;

  for (let index = 0; index < singles.length; index += 1) {
    const step = singles[index];
    const source = `calibration:${tier}:single:${index}`;
    report(onProgress, index, total, step.label);
    runtime.keyboardSampler.noteOn(tier, step.note, step.velocity, source);
    await wait(step.hold, signal);
    runtime.keyboardSampler.noteOff(tier, step.note, source);
    await wait(tier === 'lower' ? 180 : 320, signal);
  }

  const chord = tier === 'lower' ? [60, 64, 67] : [55, 60, 64, 67];
  const chordSource = `calibration:${tier}:chord`;
  report(onProgress, singles.length, total, 'Reference chord');
  for (const note of chord) runtime.keyboardSampler.noteOn(tier, note, 82, chordSource);
  await wait(tier === 'lower' ? 950 : 1550, signal);
  for (const note of chord) runtime.keyboardSampler.noteOff(tier, note, chordSource);
  await wait(tier === 'lower' ? 300 : 600, signal);
}

async function runViolinSequence(
  runtime: CalibrationAudioRuntime,
  articulation: 'arco' | 'pizzicato',
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const notes = [
    { stringNumber: 4, note: 55, velocity: 48, label: 'G3 · velocity 48' },
    { stringNumber: 3, note: 62, velocity: 80, label: 'D4 · velocity 80' },
    { stringNumber: 2, note: 69, velocity: 96, label: 'A4 · velocity 96' },
    { stringNumber: 1, note: 76, velocity: 112, label: 'E5 · velocity 112' },
  ] as const;

  for (let index = 0; index < notes.length; index += 1) {
    const step = notes[index];
    report(onProgress, index, notes.length, step.label);
    runtime.violinSampler.noteOn(
      step.stringNumber,
      step.note,
      step.velocity,
      articulation,
    );
    await wait(articulation === 'arco' ? 760 : 420, signal);
    runtime.violinSampler.noteOff(step.stringNumber);
    await wait(articulation === 'arco' ? 250 : 360, signal);
  }
}

async function runAcousticSequence(
  runtime: CalibrationAudioRuntime,
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const steps = [
    { stringNumber: 6, note: 40, velocity: 48, label: 'Low E · velocity 48' },
    { stringNumber: 3, note: 55, velocity: 80, label: 'G3 · velocity 80' },
    { stringNumber: 1, note: 64, velocity: 112, label: 'High E · velocity 112' },
  ] as const;
  const total = steps.length + 1;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    report(onProgress, index, total, step.label);
    runtime.acousticSampler.noteOn(
      step.stringNumber,
      step.note,
      step.velocity,
      'pluck',
    );
    await wait(720, signal);
  }

  report(onProgress, steps.length, total, 'Open-string reference strum');
  for (let index = 0; index < GUITAR_OPEN_NOTES.length; index += 1) {
    runtime.acousticSampler.noteOn(
      6 - index,
      GUITAR_OPEN_NOTES[index],
      86,
      'strum',
    );
    await wait(28, signal);
  }
  await wait(1200, signal);
}

async function runElectricSequence(
  runtime: CalibrationAudioRuntime,
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const steps = [
    { stringNumber: 6, note: 40, velocity: 48, label: 'Low E · velocity 48' },
    { stringNumber: 3, note: 55, velocity: 80, label: 'G3 · velocity 80' },
    { stringNumber: 1, note: 64, velocity: 112, label: 'High E · velocity 112' },
  ] as const;
  const total = steps.length + 1;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    report(onProgress, index, total, step.label);
    runtime.electricSampler.noteOn(
      step.stringNumber,
      step.note,
      step.velocity,
      'pluck',
    );
    await wait(720, signal);
  }

  report(onProgress, steps.length, total, 'Open-string reference strum');
  for (let index = 0; index < GUITAR_OPEN_NOTES.length; index += 1) {
    runtime.electricSampler.noteOn(
      6 - index,
      GUITAR_OPEN_NOTES[index],
      86,
      'strum',
    );
    await wait(28, signal);
  }
  await wait(1250, signal);
}

async function runBassSequence(
  runtime: CalibrationAudioRuntime,
  signal?: AbortSignal,
  onProgress?: ProgressListener,
): Promise<void> {
  const steps = [
    { stringNumber: 4, note: 28, velocity: 48, label: 'E1 · velocity 48' },
    { stringNumber: 3, note: 33, velocity: 80, label: 'A1 · velocity 80' },
    { stringNumber: 2, note: 38, velocity: 96, label: 'D2 · velocity 96' },
    { stringNumber: 1, note: 43, velocity: 112, label: 'G2 · velocity 112' },
  ] as const;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    report(onProgress, index, steps.length, step.label);
    runtime.bassSampler.noteOn(step.stringNumber, step.note, step.velocity, 'pluck');
    await wait(850, signal);
  }
  await wait(1000, signal);
}

function report(
  listener: ProgressListener | undefined,
  index: number,
  total: number,
  label: string,
): void {
  listener?.({
    step: index + 1,
    total,
    label,
  });
}

export function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, milliseconds));

    const onAbort = (): void => {
      cleanup();
      reject(abortError());
    };
    const cleanup = (): void => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException('Calibration run aborted', 'AbortError');
}
