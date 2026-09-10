import { AudioEngine } from '../../../audio/AudioEngine';
import { Sf2BankLibrary } from '../../../audio/sf2/Sf2BankLibrary';
import { Sf2ProgramBackend } from '../../../audio/sf2/Sf2ProgramBackend';

type MidiEvent = {
  s: number;
  e?: number;
  v?: number;
  i?: string;
  n?: number;
};

type DustSong = {
  duration: number;
  events: MidiEvent[];
};

type ScheduledNote = {
  id: string;
  start: number;
  end: number;
  role: string;
  note: number;
  velocity: number;
};

type Route = {
  bank: number;
  program: number;
  gain: number;
};

export type DustAudioState = 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';

export type DustAudioStatus = {
  state: DustAudioState;
  time: number;
  duration: number;
  message: string;
};

const ROUTES: Record<string, Route> = {
  drums: { bank: 128, program: 0, gain: 0.92 },
  bass: { bank: 0, program: 33, gain: 0.98 },
  electric: { bank: 0, program: 27, gain: 0.72 },
  guitar: { bank: 0, program: 25, gain: 0.62 },
  lower: { bank: 0, program: 0, gain: 0.48 },
  upper: { bank: 0, program: 89, gain: 0.40 },
};

const FALLBACK_ROUTE: Route = { bank: 0, program: 0, gain: 0.42 };
const START_EPSILON = 0.018;
const END_EPSILON = 0.012;

export class DustAudioPlayer {
  private readonly gzipBytes: Uint8Array;
  private readonly onStatus?: (status: DustAudioStatus) => void;
  private readonly audio = new AudioEngine();
  private readonly banks = new Sf2BankLibrary();
  private readonly backend: Sf2ProgramBackend;

  private notes: ScheduledNote[] = [];
  private endings: ScheduledNote[] = [];
  private duration = 0;
  private preparePromise: Promise<boolean> | null = null;
  private prepared = false;
  private playing = false;
  private position = 0;
  private contextStart = 0;
  private startPtr = 0;
  private endPtr = 0;
  private frame = 0;
  private lastStatusAt = 0;

  constructor(gzipBytes: Uint8Array, onStatus?: (status: DustAudioStatus) => void) {
    this.gzipBytes = gzipBytes.slice();
    this.onStatus = onStatus;
    this.backend = new Sf2ProgramBackend(this.audio, this.banks, {
      bank: 0,
      program: 33,
      label: 'nocturne-dust',
      gain: 1,
    });
    this.audio.setMasterGain(0.82, 0);
    this.emit('loading', '正在载入 FluidR3_GM 音源…');
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.position;
    const context = this.audio.getContext();
    return clamp(context.currentTime - this.contextStart, 0, this.duration);
  }

  get songDuration(): number {
    return this.duration;
  }

  prepare(): Promise<boolean> {
    if (this.prepared) return Promise.resolve(true);
    if (this.preparePromise) return this.preparePromise;

    this.preparePromise = (async () => {
      try {
        const song = await decodeSong(this.gzipBytes);
        this.duration = Math.max(0.1, Number(song.duration) || 0.1);
        this.notes = normalizeNotes(song.events ?? [], this.duration);
        this.endings = this.notes
          .filter((note) => note.role !== 'drums')
          .slice()
          .sort((a, b) => a.end - b.end || a.start - b.start);
        this.seekPointers(this.position);

        const ready = await this.backend.prepare();
        if (!ready) throw new Error('FluidR3_GM.sf2 不可用');
        this.prepared = true;
        this.emit('ready', '音频已就绪 · SF2');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit('error', `音频载入失败：${message}`);
        console.error('[Dust Audio]', error);
        return false;
      } finally {
        this.preparePromise = null;
      }
    })();

    return this.preparePromise;
  }

  async play(): Promise<boolean> {
    // Resume immediately while this call is still inside the user's click gesture.
    await this.audio.resume();
    const ready = await this.prepare();
    if (!ready) return false;
    if (this.playing) return true;
    if (this.position >= this.duration - 0.01) this.position = 0;

    this.backend.reset();
    this.seekPointers(this.position);
    const context = this.audio.getContext();
    this.contextStart = context.currentTime - this.position;
    this.playing = true;
    this.resumeActiveNotes(this.position);
    this.lastStatusAt = 0;
    this.emit('playing', '播放中 · SF2');
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
    return true;
  }

  pause(): void {
    if (!this.playing) return;
    this.position = this.currentTime;
    this.playing = false;
    this.backend.reset();
    this.seekPointers(this.position);
    this.emit('paused', '已暂停 · SF2');
  }

  seek(time: number): void {
    const target = clamp(Number.isFinite(time) ? time : 0, 0, this.duration);
    const wasPlaying = this.playing;
    this.position = target;
    this.backend.reset();
    this.seekPointers(target);

    if (wasPlaying) {
      const context = this.audio.getContext();
      this.contextStart = context.currentTime - target;
      this.resumeActiveNotes(target);
      this.emit('playing', '已定位 · SF2');
      if (!this.frame) this.frame = requestAnimationFrame(this.tick);
    } else {
      this.emit(this.prepared ? 'paused' : 'loading', this.prepared ? '已定位 · SF2' : '正在载入 FluidR3_GM 音源…');
    }
  }

  async restart(autoPlay = true): Promise<boolean> {
    this.playing = false;
    this.position = 0;
    this.backend.reset();
    this.seekPointers(0);
    if (!autoPlay) {
      this.emit(this.prepared ? 'ready' : 'loading', this.prepared ? '音频已就绪 · SF2' : '正在载入 FluidR3_GM 音源…');
      return this.prepared;
    }
    return this.play();
  }

  stop(): void {
    this.playing = false;
    this.position = 0;
    this.backend.reset();
    this.seekPointers(0);
    this.emit('stopped', this.prepared ? '已停止 · SF2' : '音频未就绪');
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.backend.dispose();
    this.banks.dispose();
    this.audio.dispose();
  }

  private seekPointers(time: number): void {
    this.startPtr = lowerBound(this.notes, time, (note) => note.start);
    this.endPtr = lowerBound(this.endings, time, (note) => note.end);
  }

  private resumeActiveNotes(time: number): void {
    if (time <= 0) return;
    for (const note of this.notes) {
      if (note.start >= time) break;
      if (note.role !== 'drums' && note.end > time + END_EPSILON) this.startNote(note);
    }
  }

  private startNote(note: ScheduledNote): void {
    const route = ROUTES[note.role] ?? FALLBACK_ROUTE;
    this.backend.setProgram(route.program, route.bank);
    const options = note.role === 'drums'
      ? { gainScale: route.gain, autoReleaseSeconds: 2.2, autoReleaseFadeSeconds: 0.08 }
      : { gainScale: route.gain };
    this.backend.noteOn(note.id, note.note, note.velocity, options);
  }

  private endNote(note: ScheduledNote): void {
    this.backend.noteOff(note.id);
  }

  private readonly tick = (): void => {
    this.frame = 0;
    if (!this.playing) return;

    const now = this.currentTime;
    while (this.startPtr < this.notes.length && (this.notes[this.startPtr]?.start ?? Infinity) <= now + START_EPSILON) {
      const note = this.notes[this.startPtr++];
      if (note && note.start >= now - 0.08) this.startNote(note);
    }
    while (this.endPtr < this.endings.length && (this.endings[this.endPtr]?.end ?? Infinity) <= now + END_EPSILON) {
      const note = this.endings[this.endPtr++];
      if (note) this.endNote(note);
    }

    const wall = performance.now();
    if (wall - this.lastStatusAt > 180) {
      this.lastStatusAt = wall;
      this.emit('playing', '播放中 · SF2');
    }

    if (now >= this.duration - 0.01) {
      this.position = this.duration;
      this.playing = false;
      this.backend.reset();
      this.emit('paused', '播放结束 · SF2');
      return;
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  private emit(state: DustAudioState, message: string): void {
    this.onStatus?.({ state, time: this.currentTime, duration: this.duration, message });
  }
}

async function decodeSong(bytes: Uint8Array): Promise<DustSong> {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 gzip 解压');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).text();
  const parsed = JSON.parse(raw) as Partial<DustSong>;
  if (!Array.isArray(parsed.events) || !Number.isFinite(Number(parsed.duration))) {
    throw new Error('Dust MIDI 数据格式无效');
  }
  return parsed as DustSong;
}

function normalizeNotes(events: MidiEvent[], duration: number): ScheduledNote[] {
  return events
    .map((event, index): ScheduledNote | null => {
      const start = Math.max(0, Number(event.s) || 0);
      const note = Number(event.n);
      if (!Number.isFinite(note) || note < 0 || note > 127 || start > duration + 0.1) return null;
      const role = String(event.i || 'other');
      const fallbackLength = role === 'drums' ? 0.18 : role === 'upper' ? 0.9 : 0.5;
      const endValue = Number(event.e);
      const end = clamp(Number.isFinite(endValue) ? endValue : start + fallbackLength, start + 0.025, duration + 2);
      return {
        id: `event:${index}`,
        start,
        end,
        role,
        note: Math.round(note),
        velocity: clamp(Math.round(Number(event.v) || 90), 1, 127),
      };
    })
    .filter((note): note is ScheduledNote => note !== null)
    .sort((a, b) => a.start - b.start || a.note - b.note);
}

function lowerBound<T>(items: T[], time: number, valueOf: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (valueOf(items[middle]!) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
