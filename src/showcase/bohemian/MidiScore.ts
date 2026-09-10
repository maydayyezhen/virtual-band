import midi01 from './midi/part-01.txt?raw';
import midi02 from './midi/part-02.txt?raw';
import midi03 from './midi/part-03.txt?raw';
import midi04 from './midi/part-04.txt?raw';
import midi05 from './midi/part-05.txt?raw';
import midi06 from './midi/part-06.txt?raw';

export type BohemianRole = 'drums' | 'bass' | 'guitar' | 'piano' | 'choir' | 'strings' | 'lead';

export type BohemianNote = {
  id: string;
  tick: number;
  endTick: number;
  time: number;
  end: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
  track: number;
  role: BohemianRole;
};

export type TempoPoint = {
  tick: number;
  microsPerQuarter: number;
  seconds: number;
};

export type BohemianScore = {
  ppq: number;
  duration: number;
  notes: BohemianNote[];
  tempos: TempoPoint[];
  tickToSeconds(tick: number): number;
};

type RawNote = Omit<BohemianNote, 'id' | 'time' | 'end' | 'role'>;
type RawTempo = { tick: number; microsPerQuarter: number };
type ActiveNote = { tick: number; velocity: number; channel: number; program: number; track: number; note: number };

const MIDI_PARTS = [midi01, midi02, midi03, midi04, midi05, midi06];

export function bohemianMidiBytes(): Uint8Array {
  const base64 = MIDI_PARTS.join('').replace(/\s+/g, '');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function parseBohemianScore(bytes = bohemianMidiBytes()): BohemianScore {
  const reader = new Reader(bytes);
  if (reader.text(4) !== 'MThd') throw new Error('Bohemian MIDI: missing MThd');
  const headerLength = reader.u32();
  const headerEnd = reader.offset + headerLength;
  const format = reader.u16();
  const trackCount = reader.u16();
  const division = reader.u16();
  if (format > 1) throw new Error(`Bohemian MIDI: unsupported format ${format}`);
  if (division & 0x8000) throw new Error('Bohemian MIDI: SMPTE timing is not supported');
  const ppq = division;
  reader.offset = headerEnd;

  const rawNotes: RawNote[] = [];
  const rawTempos: RawTempo[] = [{ tick: 0, microsPerQuarter: 500_000 }];
  let maxTick = 0;

  for (let track = 0; track < trackCount && reader.offset < bytes.length; track += 1) {
    const id = reader.text(4);
    if (id !== 'MTrk') throw new Error(`Bohemian MIDI: missing MTrk at track ${track}`);
    const length = reader.u32();
    const end = Math.min(bytes.length, reader.offset + length);
    const programs = new Uint8Array(16);
    const active = new Map<string, ActiveNote[]>();
    let tick = 0;
    let runningStatus = 0;

    while (reader.offset < end) {
      tick += reader.varUint();
      maxTick = Math.max(maxTick, tick);
      let status = reader.u8();
      let firstData: number | null = null;
      if (status < 0x80) {
        if (!runningStatus) throw new Error(`Bohemian MIDI: bad running status in track ${track}`);
        firstData = status;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      const data = (): number => {
        if (firstData !== null) {
          const value = firstData;
          firstData = null;
          return value;
        }
        return reader.u8();
      };

      if (status === 0xff) {
        const type = data();
        const size = reader.varUint();
        if (type === 0x51 && size === 3) {
          const microsPerQuarter = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8();
          rawTempos.push({ tick, microsPerQuarter });
        } else {
          reader.skip(size);
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        reader.skip(reader.varUint());
        continue;
      }

      const kind = status & 0xf0;
      const channel = status & 0x0f;
      if (kind === 0xc0) {
        programs[channel] = data();
        continue;
      }
      if (kind === 0xd0) {
        data();
        continue;
      }

      const a = data();
      const b = data();
      if (kind !== 0x80 && kind !== 0x90) continue;

      const key = `${channel}:${a}`;
      if (kind === 0x90 && b > 0) {
        const stack = active.get(key) ?? [];
        stack.push({ tick, velocity: b, channel, program: programs[channel] ?? 0, track, note: a });
        active.set(key, stack);
        continue;
      }

      const stack = active.get(key);
      const start = stack?.shift();
      if (!start) continue;
      if (!stack?.length) active.delete(key);
      rawNotes.push({
        tick: start.tick,
        endTick: Math.max(start.tick + 1, tick),
        note: start.note,
        velocity: start.velocity,
        channel: start.channel,
        program: start.program,
        track: start.track,
      });
    }

    for (const stack of active.values()) {
      for (const start of stack) {
        rawNotes.push({
          tick: start.tick,
          endTick: Math.max(start.tick + 1, maxTick + Math.round(ppq * 0.5)),
          note: start.note,
          velocity: start.velocity,
          channel: start.channel,
          program: start.program,
          track: start.track,
        });
      }
    }
    reader.offset = end;
  }

  const tempos = buildTempoMap(rawTempos, ppq);
  const tickToSeconds = makeTickToSeconds(tempos, ppq);
  const notes = rawNotes
    .map((note, index): BohemianNote => ({
      ...note,
      id: `bohemian:${index}`,
      time: tickToSeconds(note.tick),
      end: tickToSeconds(note.endTick),
      role: classifyRole(note.channel, note.program),
    }))
    .sort((a, b) => a.time - b.time || a.track - b.track || a.note - b.note || a.end - b.end);

  const duration = Math.max(
    tickToSeconds(maxTick),
    ...notes.map((note) => note.end),
  );

  return { ppq, duration, notes, tempos, tickToSeconds };
}

function classifyRole(channel: number, program: number): BohemianRole {
  if (channel === 9) return 'drums';
  if (program >= 32 && program <= 39) return 'bass';
  if (program >= 24 && program <= 31) return 'guitar';
  if (program <= 23) return 'piano';
  if (program >= 48 && program <= 51) return 'strings';
  if (program >= 52 && program <= 55) return 'choir';
  return 'lead';
}

function buildTempoMap(raw: RawTempo[], ppq: number): TempoPoint[] {
  const byTick = new Map<number, number>();
  for (const point of raw) byTick.set(point.tick, point.microsPerQuarter);
  if (!byTick.has(0)) byTick.set(0, 500_000);
  const sorted = [...byTick.entries()].sort((a, b) => a[0] - b[0]);
  const tempos: TempoPoint[] = [];
  let seconds = 0;
  let lastTick = sorted[0]?.[0] ?? 0;
  let lastMicros = sorted[0]?.[1] ?? 500_000;
  for (const [tick, microsPerQuarter] of sorted) {
    if (tempos.length) seconds += ((tick - lastTick) / ppq) * (lastMicros / 1_000_000);
    tempos.push({ tick, microsPerQuarter, seconds });
    lastTick = tick;
    lastMicros = microsPerQuarter;
  }
  return tempos;
}

function makeTickToSeconds(tempos: TempoPoint[], ppq: number): (tick: number) => number {
  return (tick: number): number => {
    const target = Math.max(0, tick);
    let low = 0;
    let high = tempos.length;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if ((tempos[middle]?.tick ?? Infinity) <= target) low = middle;
      else high = middle;
    }
    const point = tempos[low] ?? { tick: 0, microsPerQuarter: 500_000, seconds: 0 };
    return point.seconds + ((target - point.tick) / ppq) * (point.microsPerQuarter / 1_000_000);
  };
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) throw new Error('Bohemian MIDI: unexpected EOF');
    return this.bytes[this.offset++]!;
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  varUint(): number {
    let value = 0;
    for (let count = 0; count < 4; count += 1) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('Bohemian MIDI: invalid variable-length value');
  }

  text(length: number): string {
    let result = '';
    for (let index = 0; index < length; index += 1) result += String.fromCharCode(this.u8());
    return result;
  }

  skip(length: number): void {
    this.offset = Math.min(this.bytes.length, this.offset + Math.max(0, length));
  }
}
