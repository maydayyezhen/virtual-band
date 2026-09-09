# SF2 Audio Engine

This document describes the native TypeScript/Web Audio SoundFont 2 path in V2. The implementation keeps the V2 ownership rules intact: 3D instrument adapters emit musical intent, samplers own instrument semantics, and the SF2 engine remains an audio backend rather than leaking into donor geometry or UI code.

## Runtime boundary

```text
3D Instrument / MIDI
        ↓
Instrument sampler
        ↓
ProgramToneBackend / ViolinSustainBackend
        ↓
Performance profile
        ↓
Sf2Synth
├── Sf2Envelope
├── Sf2Filter
├── Sf2Modulation
├── Sf2Parser
└── Sf2BankLibrary
        ↓
AudioEngine / Web Audio
```

`Sf2BankLibrary` owns shared fetch/parse work for the 148 MB `FluidR3_GM.sf2` bank. Individual instrument backends own independent `Sf2Synth` state, so program, sustain, pitch bend and voices do not bleed between instruments.

`SampleLibrary` remains the MP3 fallback path. SF2 is not stored inside `SampleLibrary` because decoded MP3 sample caching and SoundFont preset/zone/sample semantics are different responsibilities.

## Implemented SoundFont semantics

The current parser/synth implements the following high-value SF2 behavior:

- RIFF `sfbk`, `sdta/smpl`, preset and instrument zone parsing;
- preset-global/local and instrument-global/local generator composition;
- key and velocity ranges;
- sample start/end/loop offsets and sample loop modes 1/3;
- root key, scale tuning, coarse/fine tuning and sample pitch correction;
- bank/program selection;
- initial attenuation and pan;
- volume delay/attack/hold/decay/sustain/release;
- `keynumToVolEnvHold` and `keynumToVolEnvDecay`;
- `initialFilterFc`, `initialFilterQ` and `modEnvToFilterFc`;
- modulation-envelope delay/attack/hold/decay/sustain/release;
- `keynumToModEnvHold` and `keynumToModEnvDecay`;
- modulation envelope to pitch (`modEnvToPitch`);
- modulation LFO to pitch/filter/volume;
- vibrato LFO to pitch;
- LFO delay and frequency generators;
- default Note-On velocity to initial attenuation behavior;
- sustain pedal and pitch bend;
- `exclusiveClass` voice choking, including GM hi-hat behavior.

## Volume-envelope model

SoundFont volume decay/release is treated as attenuation changing at a constant dB rate, not linear Web Audio gain. The engine uses a -96 dB effective silence floor for the SF2 volume envelope.

For example, if a region has a nominal 1 second decay time but its sustain attenuation is 12 dB, the audible decay stage uses 12/96 = 12.5% of that nominal time. Web Audio gain automation uses an exponential ramp so the amplitude curve follows the constant-dB envelope.

When Note Off arrives during attack/hold/decay, the engine reconstructs the current envelope level before starting release. Release duration is shortened according to how much of the 96 dB attenuation range has already been traversed.

## Filter and modulation-envelope model

Each SF2 region can insert a Web Audio low-pass filter before its volume envelope:

```text
AudioBufferSource
      ↓
SF2 low-pass filter
      ↓
LFO volume stage
      ↓
volume envelope
      ↓
pan
      ↓
instrument destination / AudioEngine bus
```

`initialFilterFc` is converted from absolute cents to Hz. `initialFilterQ` is converted from centibels to dB for Web Audio resonance. The shared modulation envelope can drive both filter cutoff and sample pitch. Filter cutoff modulation uses `BiquadFilterNode.detune`; pitch modulation uses `AudioBufferSourceNode.detune`.

The modulation envelope has delay/attack/hold/decay/sustain/release and key-dependent hold/decay timing. Note Off reconstructs the current envelope level before releasing back toward the static value.

## Internal LFO behavior

SoundFont defines two triangular low-frequency oscillators:

- Modulation LFO: can drive pitch, filter cutoff and volume;
- Vibrato LFO: drives pitch.

The engine now parses and executes:

- `modLfoToPitch`
- `vibLfoToPitch`
- `modLfoToFilterFc`
- `modLfoToVolume`
- `delayModLFO` / `freqModLFO`
- `delayVibLFO` / `freqVibLFO`

LFO frequency uses SoundFont absolute cents, where 0 corresponds to about 8.176 Hz. Delay uses timecents. LFOs are voice-local and stop/disconnect with the voice.

Volume LFO is implemented in a separate gain stage so it does not fight volume-envelope automation. The dB-domain triangle is converted to multiplicative gain through a `WaveShaperNode`. Extreme tremolo depth is browser-safety bounded; normal musical depths such as 6 dB are preserved.

## Default velocity behavior

The previous synth used a project-specific `velocity^1.35` gain curve. The SF2 path now applies the implicit default Note-On velocity -> initial attenuation modulator: negative-unipolar, concave, with a 960 cB amount. Under the standard 96 dB concave convention used by SoundFont compliance tests, the equivalent attenuation is:

```text
attenuation_cB = -400 * log10(velocity / 127)
```

clamped to the SoundFont 96 dB range. This gives the expected near-square-law amplitude response; for example velocity 111 is about 2.34 dB below velocity 127.

This is engine behavior and therefore applies consistently to piano, pads, violin sustain, guitars and percussion.

The controversial SoundFont default velocity -> filter cutoff modulator is not enabled globally. FluidSynth also disables that default mapping because the specification is internally inconsistent. Guitar `PerformanceProfile` settings may still deliberately darken low-velocity notes as an instrument policy.

## Performance profiles

SoundFont data remains the source of truth for preset/region programming. Instrument-specific musical tuning is layered above the SF2 engine through `ProgramTonePerformanceProfile` rather than mutating parsed regions.

Current profile controls are:

- `brightnessCents`: static additive cutoff offset;
- `velocityToFilterCents`: extra low-velocity cutoff reduction that fades to zero at velocity 127;
- `filterEnvelopeScale`: multiplier for the SoundFont `modEnvToFilterFc` depth.

Per-note options can add temporary offsets on top of the active profile.

## Plucked-string lifecycle

Acoustic- and electric-guitar browser interactions are treated as physical pluck impulses, not indefinitely held keyboard keys. A pointer or computer-key press produces the strike; releasing that input only releases the donor's held/fingering visual state. The audio voice keeps its natural decay ceiling instead of receiving an immediate Note Off.

Strums use the same impulse lifecycle. The frozen donors still schedule visible string strikes; the instrument adapters tag those later `onHit` events as `strum` gestures, while direct `pluck()` calls are tagged as `pluck` gestures. Both receive finite SF2 auto-release ceilings.

MIDI Note On / Note Off remains gated. Retriggering the same physical string quickly chokes its previous voice, while explicit muting (`muteString`, panic/reset, All Notes Off, or strum preparation) can damp an impulse voice immediately. Program-specific ring ceilings remain a performance policy and do not rewrite SoundFont envelopes.

## MIDI controller boundary

This phase implements sound-engine defaults that should work even without an external MIDI controller. The full external control graph is intentionally deferred until MIDI integration.

Already available as direct runtime controls:

- Note On / Note Off + velocity;
- program/bank selection;
- sustain;
- pitch bend.

Deferred controller/modulator work includes:

- CC1 Mod Wheel -> LFO depth;
- CC7 Volume;
- CC10 Pan;
- CC11 Expression;
- CC64 routing through a channel-controller layer (the synth already has sustain semantics);
- CC74 brightness/filter;
- CC91 reverb send;
- CC93 chorus send;
- channel/key aftertouch;
- pitch-bend sensitivity via RPN;
- SoundFont `pmod` / `imod` execution and arbitrary source/destination modulator chaining.

The intended boundary is: the synth should sound correct by itself first; MIDI later supplies external hands/knobs to parameters that already have stable engine semantics.

## Not implemented yet

The following remain outside the current compatibility set:

- `pmod` / `imod` modulator execution;
- arbitrary MIDI CC / aftertouch modulation routing;
- full default controller modulator set;
- reverb and chorus sends;
- 24-bit `sm24` sample extension;
- a full SoundFont 2.04 compliance pass.

## Validation

With `FluidR3_GM.sf2` present locally:

```powershell
npm run build
npm run sf2:verify
```

`sf2:verify` checks real FluidR3 preset/region resolution across violin, piano, Warm Pad, acoustic/electric guitars and percussion. It validates volume-envelope math, filter conversion math, modulation-envelope metadata, LFO generator metadata/frequency conversion, default velocity attenuation, sustain loops and hi-hat exclusive classes.

Listening validation should include long violin/Pad holds, piano decay, direct guitar plucks, repeated guitar strums, guitar harmonics/palm mute, hi-hat choke, velocity contrast, patches with vibrato/tremolo and sustain-pedal release.

## Next compatibility work

The next major layer is the external controller/modulator graph. It should be built beneath the same backend boundary and map MIDI CC/aftertouch/RPN sources onto existing pitch, gain, filter and LFO parameters rather than creating instrument-specific controller code in 3D adapters.
