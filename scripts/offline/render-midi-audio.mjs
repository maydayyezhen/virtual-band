import fs from 'node:fs/promises';
import { BasicMIDI, SoundBankLoader, SpessaLog, SpessaSynthProcessor, SpessaSynthSequencer, audioToWav } from 'spessasynth_core';
import { DEFAULT_AUDIO_MASTER_GAIN } from '../../src/audio/AudioEngine.ts';

/** Same synth and sound bank as playback. Original CC, programs, pedals and tempo remain intact. */
export async function renderMidiAudio({ midiPath, fontPath, output, duration, start = 0 }) {
  SpessaLog.setLogLevel(false, false, false);
  const binary = buffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const midi = BasicMIDI.fromArrayBuffer(binary(await fs.readFile(midiPath)));
  const bank = SoundBankLoader.fromArrayBuffer(binary(await fs.readFile(fontPath)));
  const sampleRate = 48000;
  const synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(bank, 'gm');
  await synth.processorInitialized;
  const seq = new SpessaSynthSequencer(synth);
  seq.skipToFirstNoteOn = false; seq.loopCount = 0;
  seq.loadNewSongList([midi]); seq.play();
  const count = Math.ceil((start + duration) * sampleRate);
  const left = new Float32Array(count), right = new Float32Array(count);
  for (let filled = 0; filled < count; filled += 128) {
    seq.processTick(); synth.process(left, right, filled, Math.min(128, count - filled));
  }
  const from = Math.round(start * sampleRate), samples = Math.round(duration * sampleRate);
  const channels = [left.subarray(from, from + samples), right.subarray(from, from + samples)];
  let peak = 0, clipped = 0, energy = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) {
    channel[i] *= DEFAULT_AUDIO_MASTER_GAIN;
    const amplitude = Math.abs(channel[i]); peak = Math.max(peak, amplitude); energy += channel[i] * channel[i];
    if (amplitude > 1) clipped++;
  }
  if (!Number.isFinite(peak)) throw new Error('离线音频包含无效采样');
  // One constant attenuation preserves balance/dynamics and leaves 1 dB for lossy encoding.
  // Never boost quiet pieces. Record the adjustment explicitly in the export report.
  // A selected interval can legitimately be silent (an opening curtain or ending blackout).
  const headroomGain = peak === 0 ? 1 : Math.min(1, Math.pow(10, -1 / 20) / peak);
  if (headroomGain < 1) for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= headroomGain;
  await fs.writeFile(output, new Uint8Array(audioToWav(channels, sampleRate, { normalizeAudio: false })));
  return { sampleRate, samples: channels[0].length, sourcePeak: peak, sourceClippedSamples: clipped,
    headroomDb: 20 * Math.log10(headroomGain), peak: peak * headroomGain,
    rms: Math.sqrt(energy / (channels[0].length * 2)) * headroomGain };
}
