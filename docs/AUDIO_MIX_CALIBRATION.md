# Audio Mix Calibration

This document defines the loudness-calibration boundary for the V2 audio runtime.

The goal is deliberately narrow: keep preset-to-preset and instrument-to-instrument baseline loudness coherent without changing SoundFont semantics, articulation, dynamics or user controls.

## Ownership

Calibration lives in `src/audio/AudioMixProfile.ts`.

```text
sample / SF2 region
      ↓
voice DSP
velocity / envelope / filter / LFO
      ↓
instrument or preset calibration trim
      ↓
user volume / physical control where one exists
      ↓
AudioEngine master
```

The calibration table is not part of `Sf2Parser`, `Sf2Synth` or `ProgramTonePerformanceProfile`.

- SF2 generator values remain source data.
- Performance profiles continue to describe timbral/performance behavior such as brightness and filter-envelope depth.
- Mix calibration only supplies static dB compensation.
- User/MIDI volume is a separate live control and is multiplied with calibration rather than stored in the calibration table.

## Why dB

The previous runtime accumulated several unrelated linear coefficients (`0.68`, `0.74`, `0.82`, `0.86`, preset volumes, accent factors, and so on) in different samplers. That made it difficult to tell whether a number represented voice headroom, user volume or loudness compensation.

The mix profile stores explicit dB trims and converts them with:

```text
gain = 10 ^ (dB / 20)
```

The current profile keeps every final calibration gain at or below unity so it cannot create clipping merely by applying a trim.

## Current FluidR3 calibration v1

These are first-pass listening trims for the current FluidR3 SF2 plus matching MP3 fallbacks. They are intentionally conservative and should be refined after ensemble listening, not treated as universal GM loudness values.

### Instrument trims

| Target | Trim |
| --- | ---: |
| Drums | -2.00 dB |
| Keyboard lower / piano | -2.00 dB |
| Keyboard upper / Warm Pad | -4.00 dB |
| Violin arco | -2.00 dB |
| Violin pizzicato | -2.00 dB |
| Acoustic guitar | -2.00 dB |
| Electric guitar | -3.25 dB |

### Acoustic-guitar program trims

| GM program | Preset | Additional trim |
| --- | --- | ---: |
| 24 | Nylon | +0.50 dB |
| 25 | Steel | 0.00 dB |

### Electric-guitar program trims

| GM program | Preset | Additional trim |
| --- | --- | ---: |
| 26 | Jazz | +1.50 dB |
| 27 | Clean | 0.00 dB |
| 28 | Muted | +3.00 dB |
| 29 | Overdrive | -2.00 dB |
| 30 | Distortion | -3.00 dB |
| 31 | Harmonics | +1.00 dB |

The electric offsets compensate the large baseline jumps produced by the existing preset volume/accent choices without deleting those choices: accent still affects playing response and timbre, while the calibration stage reduces the resulting loudness jump.

## Runtime application

The same target trim is applied to the SF2 primary path and its MP3 fallback:

- drums: `ProgramToneBackend.setGain()` for SF2 and the same gain on fallback sample voices;
- keyboard: lower/upper synth output gains and matching fallback gains;
- violin: arco SF2 output gain and articulation-specific MP3 fallback gains;
- acoustic guitar: program-aware backend gain and matching fallback gain; CC7/user volume multiplies it separately;
- electric guitar: both SF2 and MP3 already enter the common pickup/tone output bus, so program-aware calibration is applied once on that bus after the physical Volume control.

This avoids creating another per-voice Web Audio node solely for calibration.

## What calibration must not do

Do not use this table to erase musical dynamics. In particular:

- velocity differences must remain audible;
- Muted should still have a different envelope and attack from Distortion;
- Pad should retain a softer attack than piano;
- violin arco and pizzicato remain distinct articulations;
- no compressor/limiter is used to fake balance.

The target is comparable baseline loudness, not identical waveforms or identical peak levels.

## Verification

Static invariants can be checked without downloading the SF2:

```powershell
npm run mix:verify
```

The verifier checks that every configured target/program resolves to a finite dB value and a safe gain in `(0, 1]`.

Browser listening remains the final calibration gate. Use the same MIDI velocity and comparable register when switching presets, then test the full ensemble because a single-note peak cannot predict perceived mix balance.

## Future refinement

If the project changes SoundFont banks, create a separate source-specific profile rather than reusing FluidR3 trims blindly. A later metering tool may assist calibration, but runtime auto-normalization is intentionally avoided because it can flatten intended articulation and dynamic contrast.
