import type { WorkletSynthesizer } from 'spessasynth_lib';
import { SpessaSynthEngine } from './SpessaSynthEngine';

/** Channel leases belong to an instrument, never to its type or scene position. */
export class LiveAudioEngine {
  readonly engine: SpessaSynthEngine;
  private readonly channels = new Map<number, LiveChannel>();
  private ready: WorkletSynthesizer | null = null;
  private preparing: Promise<void> | null = null;
  private disposed = false;
  private channelCapacity = 16;
  onError: (error: unknown) => void = (error) => console.error('[自由弹奏]', error);

  constructor(readonly context: AudioContext, output: AudioNode = context.destination) {
    this.engine = new SpessaSynthEngine(context, output);
  }
  prepare(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('自由弹奏音源已关闭'));
    return this.preparing ??= this.engine.prepare().then((synth) => {
      this.channelCapacity = 16;
      this.ready = synth;
      for (const channel of this.channels.values()) channel.connect(synth);
    }).catch((error) => { this.preparing = null; throw error; });
  }
  wake(): void {
    if (this.disposed) return;
    void this.context.resume().catch(this.onError);
    void this.prepare().catch(this.onError);
  }
  allocate(program: number, drums = false): LiveChannel {
    if (this.disposed) throw new Error('自由弹奏音源已关闭');
    let id = 0;
    while (this.channels.has(id)) id++;
    const channel = new LiveChannel(this, id, program, drums);
    this.channels.set(id, channel);
    if (this.ready) channel.connect(this.ready);
    return channel;
  }
  ensureChannel(id: number): void {
    // In 4.3.14 midiChannels also grows on channelAdded echoes. Count requests, not that UI array.
    while (this.channelCapacity <= id) {
      this.ready!.addNewChannel();
      this.channelCapacity++;
    }
  }
  release(channel: LiveChannel): void {
    if (this.channels.get(channel.id) === channel) this.channels.delete(channel.id);
  }
  dispose(): void {
    this.disposed = true;
    for (const channel of [...this.channels.values()]) channel.dispose();
    this.ready = null;
    this.engine.dispose();
  }
}

type Controller = Parameters<WorkletSynthesizer['controllerChange']>[1];

interface HeldNote { note: number; velocity: number; timer?: ReturnType<typeof setTimeout> }

/** Only gesture ownership lives here. SF2 envelopes, sustain, bends and synthesis belong to SpessaSynth. */
export class LiveChannel {
  private synth: WorkletSynthesizer | null = null;
  private readonly voices = new Map<string, HeldNote>();
  private readonly controllers = new Map<Controller, number>();
  private bend = 0;
  private disposed = false;
  constructor(private readonly host: LiveAudioEngine, readonly id: number, public program: number, private readonly drums: boolean) {}

  connect(synth: WorkletSynthesizer): void {
    if (this.disposed) return;
    this.host.ensureChannel(this.id);
    this.synth = synth;
    synth.controllerChange(this.id, 120, 0);
    synth.controllerChange(this.id, 121, 0);
    // CC121 intentionally preserves volume/pan in MIDI; a recycled lease needs fresh defaults.
    for (const [cc, value] of [[7, 100], [10, 64], [11, 127], [64, 0], [74, 64]] as const) {
      synth.controllerChange(this.id, cc, value);
    }
    synth.midiChannels[this.id].setDrums(this.drums);
    synth.programChange(this.id, this.program);
    synth.pitchWheelRange(this.id, 2);
    for (const [cc, value] of this.controllers) synth.controllerChange(this.id, cc, value);
    this.setPitchBend(this.bend);
    // Released clicks are removed while loading, so they cannot sound seconds later.
    const notes = new Map([...this.voices.values()].map((voice) => [voice.note, voice.velocity]));
    for (const [note, velocity] of notes) synth.noteOn(this.id, note, velocity);
  }
  noteOn(key: string, note: number, velocity: number, duration?: number): void {
    if (this.disposed || !Number.isInteger(note) || note < 0 || note > 127 || !Number.isFinite(velocity)) return;
    if (velocity <= 0) { this.noteOff(key); return; }
    this.host.wake();
    this.noteOff(key);
    const voice: HeldNote = { note, velocity: Math.max(1, Math.min(127, Math.round(velocity))) };
    const alreadyHeld = [...this.voices.values()].some((other) => other.note === note);
    this.voices.set(key, voice);
    if (!alreadyHeld) this.synth?.noteOn(this.id, note, voice.velocity);
    if (duration !== undefined) voice.timer = setTimeout(() => {
      if (this.voices.get(key) === voice) this.noteOff(key);
    }, duration * 1000);
  }
  noteOff(key: string): void {
    const voice = this.voices.get(key);
    if (!voice) return;
    clearTimeout(voice.timer);
    this.voices.delete(key);
    if (![...this.voices.values()].some((other) => other.note === voice.note)) this.synth?.noteOff(this.id, voice.note);
  }
  releasePitch(note: number): void {
    for (const [key, voice] of this.voices) if (voice.note === note) this.noteOff(key);
  }
  setProgram(program: number): boolean {
    if (this.disposed || !Number.isInteger(program) || program < 0 || program > 127) return false;
    this.program = program;
    this.synth?.programChange(this.id, program);
    return true;
  }
  cc(controller: Controller, value: number): void {
    if (this.disposed || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(127, Math.round(value)));
    this.controllers.set(controller, next);
    this.synth?.controllerChange(this.id, controller, next);
  }
  setPitchBend(value: number): boolean {
    if (this.disposed || !Number.isFinite(value)) return false;
    this.bend = Math.max(-1, Math.min(1, value));
    this.synth?.pitchWheel(this.id, Math.round(8192 + this.bend * (this.bend < 0 ? 8192 : 8191)));
    return true;
  }
  silence(): void {
    for (const voice of this.voices.values()) clearTimeout(voice.timer);
    this.voices.clear();
    this.synth?.controllerChange(this.id, 120, 0);
  }
  reset(): void {
    this.silence();
    this.cc(64, 0);
    this.setPitchBend(0);
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.synth = null;
    this.host.release(this);
  }
}
