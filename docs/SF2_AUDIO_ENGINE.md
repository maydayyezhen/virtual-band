# SF2 Audio Engine

This document describes the native TypeScript/Web Audio SoundFont 2 path on `experiment/sf2-backend`. The branch keeps the V2 runtime ownership rules intact: 3D instrument adapters emit musical intent, samplers own instrument semantics, and the SF2 engine remains an audio backend rather than leaking into donor geometry or UI code.

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
- sustain pedal and pitch bend;
- `exclusiveClass` voice choking, including GM hi-hat behavior.

`modLfoToFilterFc` is parsed and exposed for inspection but the modulation LFO itself is not yet executed.

## Volume-envelope model

SoundFont volume decay/release is treated as attenuation changing at a constant dB rate, not linear Web Audio gain. The engine uses a -96 dB effective silence floor for the SF2 volume envelope.

For example, if a region has a nominal 1 second decay time but its sustain attenuation is 12 dB, the audible decay stage uses 12/96 = 12.5% of that nominal time. Web Audio gain automation uses an exponential ramp so the amplitude curve follows the constant-dB envelope.

When Note Off arrives during attack/hold/decay, the engine reconstructs the current envelope level before starting release. Release duration is shortened according to how much of the 96 dB attenuation range has already been traversed, which avoids a gain jump and avoids replaying an unnecessarily long full release from a quiet state.

## Filter model

Each SF2 region can insert a Web Audio `BiquadFilterNode` before its volume envelope:

```text
AudioBufferSource
      ↓
SF2 low-pass filter
      ↓
volume envelope
      ↓
pan
      ↓
instrument destination / AudioEngine bus
```

`initialFilterFc` is converted from absolute cents to Hz. `initialFilterQ` is converted from centibels to dB for the Web Audio low-pass resonance parameter. The modulation envelope drives filter cutoff through `detune`, which is already expressed in cents and therefore maps naturally to the SoundFont cutoff modulation units.

The filter envelope has its own delay/attack/hold/decay/sustain/release and key-dependent hold/decay timing. Note Off reconstructs the current filter-envelope level before ramping back to the static cutoff position.

## Performance profiles

SoundFont data remains the source of truth for preset/region programming. Instrument-specific musical tuning is layered above the SF2 engine through `ProgramTonePerformanceProfile` rather than mutating parsed regions.

Current profile controls are:

- `brightnessCents`: static additive cutoff offset;
- `velocityToFilterCents`: extra low-velocity cutoff reduction that fades to zero at velocity 127;
- `filterEnvelopeScale`: multiplier for the SoundFont `modEnvToFilterFc` depth.

Per-note options can add temporary offsets on top of the active profile. This separation is deliberate:

```text
SoundFont authoring
      ↓
SF2 parser/synth
      ↓
Instrument performance profile
      ↓
Per-note gesture policy
```

Guitar programs use profiles to differentiate nylon/steel and the six electric-guitar programs without placing guitar knowledge in `Sf2Parser` or `Sf2Synth`.

## Plucked-string lifecycle

A guitar strum is treated as an impulse with a finite physical ring ceiling, not as an indefinitely held keyboard key. The frozen donor still schedules visible string strikes; the instrument adapter tags those later `onHit` events as `strum` gestures, and the sampler assigns the corresponding SF2 voices an automatic release ceiling.

Retriggering the same physical string quickly chokes its previous voice so repeated strums cannot accumulate many old release tails. Program-specific ring ceilings remain a performance policy and do not rewrite SoundFont envelopes.

## Velocity status

Region velocity ranges are fully respected. The synth still uses a project velocity-to-gain curve rather than implementing the complete SoundFont default modulator graph. Guitar performance profiles additionally make low-velocity notes darker through cutoff modulation.

This is intentionally documented as partial support: the current result should not be described as a complete SF2 default-modulator implementation.

## Not implemented yet

The following remain outside the current compatibility set:

- `pmod` / `imod` modulator execution;
- modulation and vibrato LFO execution;
- arbitrary MIDI CC / aftertouch modulation routing;
- full default SoundFont modulator set;
- filter modulation driven by the unimplemented LFO;
- reverb and chorus sends;
- 24-bit `sm24` sample extension;
- a full SoundFont 2.04 compliance pass.

These are future engine work, not sampler work.

## Validation

With `FluidR3_GM.sf2` present locally:

```powershell
npm run build
npm run sf2:verify
```

`sf2:verify` checks real FluidR3 preset/region resolution across violin, piano, Warm Pad, acoustic/electric guitars and percussion. It also validates volume-envelope math, filter conversion math, filter metadata ranges, sustain loops and hi-hat exclusive classes.

Listening validation should include long violin/Pad holds, piano decay, repeated guitar strums, guitar harmonics/palm mute, hi-hat choke, velocity contrast and sustain-pedal release.

## Next compatibility work

The next high-value engine step is the SoundFont modulator layer: default velocity-to-attenuation behavior, LFO execution and selected CC mappings. Those should be added beneath the same backend boundary rather than creating instrument-specific DSP branches in the 3D adapters.
