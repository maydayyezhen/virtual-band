# SF2 backend experiment

This branch tests a native TypeScript/Web Audio SoundFont 2 engine behind the V2 sampler boundaries. It began as a violin sustain experiment and has now expanded to the full playable ensemble.

## Current goal

The experiment is no longer just proving that an `.sf2` file can be decoded. The current target is a musically usable backend with correct note lifecycle, SoundFont volume envelopes, sustain loops, core filter behavior, percussion choking and instrument-level performance tuning.

The production decision is still gated on listening quality and runtime cost. `architecture-v2` is not modified by this experiment until the branch is explicitly promoted.

## Get the test SoundFont

The 148,398,306-byte `FluidR3_GM.sf2` is deliberately not committed because it exceeds GitHub's ordinary file-size limit.

```powershell
npm run sf2:fetch
```

The file is written to:

```text
public/soundfonts/FluidR3_GM.sf2
```

and is ignored by Git.

## Implemented scope

Current implementation includes:

- RIFF `sfbk` parsing and 16-bit `sdta/smpl` PCM access;
- preset/instrument global and local zones;
- key/velocity region resolution;
- sample addressing, root/tuning and loop modes;
- bank/program routing for the ensemble;
- attenuation and pan;
- volume delay/attack/hold/decay/sustain/release;
- key-dependent volume hold/decay;
- core SF2 low-pass filter cutoff/Q;
- modulation envelope to filter cutoff with key-dependent hold/decay;
- sustain pedal and pitch bend;
- `exclusiveClass` choking;
- shared `Sf2BankLibrary` fetch/parse cache;
- guitar strum lifecycle policy and instrument performance profiles;
- MP3 fallback while SF2 is not ready or fails.

The volume envelope uses the SF2 96 dB attenuation interpretation rather than a linear-amplitude release ramp.

## Explicitly incomplete

The branch does not yet claim complete SoundFont 2.04 compatibility. Missing/high-value areas include:

- `pmod` / `imod` execution;
- the full default SoundFont modulator set;
- modulation and vibrato LFO execution;
- arbitrary CC and aftertouch routing;
- LFO-driven filter modulation;
- reverb and chorus sends;
- 24-bit `sm24` support.

The current velocity-to-gain curve is still project-defined. Velocity-dependent filter darkening in guitar profiles is a performance policy, not a claim that the complete SF2 default modulator graph exists.

## Verify parser and DSP planning

With Node 22+ and the SF2 file present:

```powershell
npm run sf2:verify
```

Verification resolves real FluidR3 presets/regions for violin, piano, Warm Pad, acoustic guitar, electric guitar and percussion. It also checks volume-envelope math, filter cutoff conversion, filter resonance units, filter-envelope planning, sustain loops and hi-hat exclusive classes.

Build the browser runtime as well:

```powershell
npm run build
```

## Browser listening tests

Start the dev server:

```powershell
npm run dev
```

Useful regression targets:

1. Violin arco can hold well beyond the original MP3 length and releases without a gain jump.
2. Warm Pad sustains while held and has a long but smooth patch-authored release.
3. Piano decays naturally and does not behave like a looped pad.
4. Repeated acoustic/electric strums do not accumulate indefinite old tails.
5. Palm Muted is clearly shorter than Clean/Drive; Harmonics does not hang indefinitely.
6. Low-velocity guitar notes are darker than hard strikes.
7. Filter-envelope patches change brightness over the note instead of only scaling volume.
8. Open/closed hi-hat choking behaves coherently.

The browser DEV handle can still be used for low-level SF2 inspection where exposed by the app/experiment bootstrap.

## Documentation

- `docs/SF2_AUDIO_ENGINE.md`: engine architecture, DSP semantics, profile boundary and missing features.
- `docs/SF2_FULL_ENSEMBLE.md`: instrument routing and ensemble behavior.
- `docs/ARCHITECTURE_V2.md`: V2 ownership rules and how the experimental SF2 backend fits without changing donor boundaries.

## Promotion gate

Before merging any part of this experiment into `architecture-v2`:

1. `npm run build` passes;
2. `npm run sf2:verify` passes against the exact FluidR3 binary;
3. guitar repeated-strum behavior is audibly controlled;
4. violin/Pad long-note behavior remains correct;
5. filter changes improve timbral realism without destabilizing level or CPU use;
6. branch diff contains no temporary validation workflow or unrelated architecture edits;
7. documentation matches the actual implemented support boundary.
