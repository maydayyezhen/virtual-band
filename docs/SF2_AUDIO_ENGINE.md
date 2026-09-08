# SF2 Audio Engine

This document describes the SoundFont path used by the V2 runtime on `experiment/sf2-backend`.

The native SF2 path is an experiment branch feature. `architecture-v2` remains unchanged while this backend is evaluated.

## Runtime boundary

`Sf2BankLibrary` owns SoundFont fetch/parse/cache. It is shared by the composition root, but it does not own synthesizer state.

Each instrument owns its own backend and therefore its own independent synth state:

- drums: `Sf2ProgramBackend`, bank 128 program 0;
- electric guitar: `Sf2ProgramBackend`, bank 0;
- acoustic guitar: `Sf2ProgramBackend`, bank 0;
- keyboard: `Sf2KeyboardBackend`;
- violin: `Sf2ViolinBackend`.

`SampleLibrary` remains the sole MP3 fetch/decode/cache layer. SF2 bytes never enter `SampleLibrary`.

## Voice signal path

Each SF2 region voice is built as:

```text
sample source
  -> low-pass filter
  -> LFO gain stage
  -> volume-envelope gain
  -> stereo pan
  -> caller destination or synth output bus
```

The source pitch can also be modulated by:

- tuning generators;
- pitch bend;
- modulation envelope -> pitch;
- modulation LFO -> pitch;
- vibrato LFO -> pitch.

Filter cutoff can be modulated by the modulation envelope and modulation LFO. Volume can be modulated by the modulation LFO.

## Generator semantics

The parser applies generator accumulation at the SoundFont hierarchy boundary:

- local zones override their matching global zones;
- key/velocity ranges intersect;
- instrument generators establish absolute region values;
- preset generators are additive offsets where SoundFont allows them;
- illegal preset-level operators are ignored;
- default generator values are applied before accumulation.

The current parser exposes the generator subset needed by envelope, filter, tuning, looping, pan, attenuation, exclusive class and LFO execution.

## Volume envelope

SoundFont volume envelopes are handled in the dB domain where the silence floor is 960 cB = -96 dB.

Implemented stages:

- delay;
- attack;
- hold;
- decay;
- sustain;
- release.

Hold/decay support key-number timecents tracking. Decay is interpreted as the full-scale 96 dB decay time, then shortened to the actual sustain attenuation. Release reconstructs the current envelope level at Note Off so a note released halfway through attack/decay does not restart from full level.

Loop mode 3 stops looping when release begins; loop mode 1 continues through release.

## Filter

Each region gets a low-pass `BiquadFilterNode` from:

- `initialFilterFc`;
- `initialFilterQ`;
- performance-profile brightness offset;
- performance-profile velocity brightness;
- modulation envelope -> cutoff.

Filter-envelope release reconstructs the current cutoff-envelope position before returning toward the static cutoff.

`modLfoToFilterFc` is now executed by the internal modulation layer described below.

## Internal modulation and LFOs

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

Acoustic- and electric-guitar browser interactions are treated as physical pluck impulses, not keyboard-style gates. A pointer or computer-key press produces the strike; releasing that input only releases the donor's held/fingering visual state. The audio voice keeps its natural decay ceiling instead of receiving an immediate Note Off.

Strums use the same impulse lifecycle. The frozen donors still schedule visible string strikes; the instrument adapters tag those later `onHit` events as `strum` gestures, while direct `pluck()` calls are tagged separately as `pluck` gestures. Both receive finite SF2 auto-release ceilings.

MIDI Note On / Note Off remains gated. This distinction is intentional: imported/device MIDI retains explicit note-duration semantics, while manual guitar picking models the fact that the hand leaves the string immediately after the excitation.

Retriggering the same physical string quickly chokes its previous voice. Explicit muting (`muteString`, panic/reset, All Notes Off, or a new chord/strum preparation) can also damp an impulse voice. Program-specific ring ceilings remain a performance policy and do not rewrite SoundFont envelopes.

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

The parser verifier checks real FluidR3 presets plus synthetic envelope/filter/modulation math.
