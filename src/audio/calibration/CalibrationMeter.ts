import type { AudioEngine } from '../AudioEngine';
import {
  summarizeCalibrationMetrics,
  type CalibrationMetrics,
  type MeterEnergyBlock,
} from './LoudnessMath';

const PROCESSOR_NAME = 'virtual-band-calibration-meter';
const WORKLET_URL = '/worklets/virtual-band-calibration-meter.js';
const STOP_TIMEOUT_MS = 1500;

interface MeterMessage {
  readonly type: 'block' | 'stopped';
  readonly sessionId: number;
  readonly sumSquares?: number;
  readonly peak?: number;
  readonly frames?: number;
  readonly channels?: number;
}

interface StopWaiter {
  readonly sessionId: number;
  resolve(): void;
  reject(error: Error): void;
}

const loadedContexts = new WeakSet<AudioContext>();

export class CalibrationMeter {
  private readonly audio: AudioEngine;
  private rawNode: AudioWorkletNode | null = null;
  private weightedNode: AudioWorkletNode | null = null;
  private highShelf: BiquadFilterNode | null = null;
  private highPass: BiquadFilterNode | null = null;
  private disconnectRawTap: (() => void) | null = null;
  private disconnectWeightedTap: (() => void) | null = null;
  private rawBlocks: MeterEnergyBlock[] = [];
  private weightedBlocks: MeterEnergyBlock[] = [];
  private rawStopWaiter: StopWaiter | null = null;
  private weightedStopWaiter: StopWaiter | null = null;
  private sessionId = 0;
  private activeSessionId = 0;
  private initialized = false;
  private disposed = false;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.disposed) throw new Error('Calibration meter is disposed');

    const context = this.audio.getContext();
    if (!context.audioWorklet) {
      throw new Error('AudioWorklet is not supported by this browser');
    }
    if (!loadedContexts.has(context)) {
      await context.audioWorklet.addModule(WORKLET_URL);
      loadedContexts.add(context);
    }

    const rawNode = createMeterNode(context);
    const weightedNode = createMeterNode(context);
    const highShelf = context.createBiquadFilter();
    const highPass = context.createBiquadFilter();

    // BS.1770 K-weighting approximation using Web Audio biquads. The exact
    // calibration math is still deterministic; this filter stage is intentionally
    // isolated from the production mix graph.
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 1681.974450955533;
    highShelf.gain.value = 3.999843853973347;

    highPass.type = 'highpass';
    highPass.frequency.value = 38.13547087602444;
    highPass.Q.value = 0.5003270373238773;

    rawNode.port.onmessage = (event: MessageEvent<MeterMessage>) => {
      this.receive('raw', event.data);
    };
    weightedNode.port.onmessage = (event: MessageEvent<MeterMessage>) => {
      this.receive('weighted', event.data);
    };

    this.disconnectRawTap = this.audio.connectMixTap(rawNode);
    this.disconnectWeightedTap = this.audio.connectMixTap(highShelf);
    highShelf.connect(highPass).connect(weightedNode);

    this.rawNode = rawNode;
    this.weightedNode = weightedNode;
    this.highShelf = highShelf;
    this.highPass = highPass;
    this.initialized = true;
  }

  async start(): Promise<void> {
    await this.initialize();
    if (this.activeSessionId !== 0) throw new Error('Calibration meter is already running');

    this.rawBlocks = [];
    this.weightedBlocks = [];
    const sessionId = ++this.sessionId;
    this.activeSessionId = sessionId;
    this.rawNode?.port.postMessage({ type: 'start', sessionId });
    this.weightedNode?.port.postMessage({ type: 'start', sessionId });
  }

  async stop(): Promise<CalibrationMetrics> {
    const sessionId = this.activeSessionId;
    if (sessionId === 0) throw new Error('Calibration meter is not running');

    const [rawStopped, weightedStopped] = [
      this.waitForStop('raw', sessionId),
      this.waitForStop('weighted', sessionId),
    ];
    this.rawNode?.port.postMessage({ type: 'stop', sessionId });
    this.weightedNode?.port.postMessage({ type: 'stop', sessionId });

    await Promise.all([rawStopped, weightedStopped]);
    this.activeSessionId = 0;

    return summarizeCalibrationMetrics(
      this.rawBlocks,
      this.weightedBlocks,
      this.audio.getContext().sampleRate,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeSessionId = 0;

    this.disconnectRawTap?.();
    this.disconnectWeightedTap?.();
    this.disconnectRawTap = null;
    this.disconnectWeightedTap = null;

    this.rawNode?.disconnect();
    this.weightedNode?.disconnect();
    this.highShelf?.disconnect();
    this.highPass?.disconnect();
    this.rawNode = null;
    this.weightedNode = null;
    this.highShelf = null;
    this.highPass = null;

    this.rawStopWaiter?.reject(new Error('Calibration meter disposed'));
    this.weightedStopWaiter?.reject(new Error('Calibration meter disposed'));
    this.rawStopWaiter = null;
    this.weightedStopWaiter = null;
  }

  private receive(kind: 'raw' | 'weighted', message: MeterMessage): void {
    if (message.sessionId !== this.activeSessionId) return;

    if (message.type === 'block') {
      const block = normalizeBlock(message);
      if (block) {
        if (kind === 'raw') this.rawBlocks.push(block);
        else this.weightedBlocks.push(block);
      }
      return;
    }

    const waiter = kind === 'raw' ? this.rawStopWaiter : this.weightedStopWaiter;
    if (!waiter || waiter.sessionId !== message.sessionId) return;
    if (kind === 'raw') this.rawStopWaiter = null;
    else this.weightedStopWaiter = null;
    waiter.resolve();
  }

  private waitForStop(kind: 'raw' | 'weighted', sessionId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (kind === 'raw') this.rawStopWaiter = null;
        else this.weightedStopWaiter = null;
        reject(new Error(`Calibration ${kind} meter stop timed out`));
      }, STOP_TIMEOUT_MS);

      const waiter: StopWaiter = {
        sessionId,
        resolve: () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(error);
        },
      };

      if (kind === 'raw') this.rawStopWaiter = waiter;
      else this.weightedStopWaiter = waiter;
    });
  }
}

function createMeterNode(context: AudioContext): AudioWorkletNode {
  return new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCountMode: 'max',
    channelInterpretation: 'speakers',
  });
}

function normalizeBlock(message: MeterMessage): MeterEnergyBlock | null {
  const frames = Number(message.frames ?? 0);
  const channels = Number(message.channels ?? 0);
  const sumSquares = Number(message.sumSquares ?? 0);
  const peak = Number(message.peak ?? 0);

  if (
    !Number.isFinite(frames)
    || frames <= 0
    || !Number.isFinite(channels)
    || channels <= 0
    || !Number.isFinite(sumSquares)
    || sumSquares < 0
    || !Number.isFinite(peak)
    || peak < 0
  ) return null;

  return {
    frames,
    channels,
    sumSquares,
    peak,
  };
}
