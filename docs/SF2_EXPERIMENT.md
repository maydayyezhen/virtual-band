# SF2 backend

This native TypeScript/Web Audio SoundFont 2 engine was developed behind the V2 sampler boundaries on `experiment/sf2-backend`. It began as a violin sustain experiment and now covers the full playable ensemble plus dynamic filter/envelope/LFO behavior.

## Production status

The backend provides musically usable note lifecycle, SoundFont volume/filter/modulation envelopes, internal LFO behavior, default velocity response, sustain loops, percussion choking and instrument-level performance tuning.

The backend was promoted into `architecture-v2` after automated verification and browser listening acceptance. MP3 samples remain available as runtime fallback.

## Get the test SoundFont

The 148,398,306-byte `FluidR3_GM.sf2` is deliberately not committed because it exceeds GitHub's ordinary file-size limit.

```powershell
npm run sf2:fetch
```

The file is written to `public/soundfonts/FluidR3_GM.sf2` and ignored by Git.

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
- core SF2 low-pass cutoff/Q;
- shared modulation envelope -> filter cutoff and pitch;
- key-dependent modulation-envelope hold/decay;
- modulation LFO -> pitch/filter/volume;
- vibrato LFO -> pitch;
- LFO delay/frequency generators;
- default Note-On velocity -> attenuation behavior;
- sustain pedal and pitch bend;
- `exclusiveClass` choking;
- shared `Sf2BankLibrary` fetch/parse cache;
- guitar strum lifecycle policy and instrument performance profiles;
- MP3 fallback while SF2 is not ready or fails.

The volume envelope uses the SF2 96 dB attenuation interpretation rather than a linear-amplitude release ramp.

## Explicitly incomplete

The branch does not claim complete SoundFont 2.04 compatibility. Missing/high-value areas include:

- `pmod` / `imod` execution;
- arbitrary MIDI CC and aftertouch routing;
- complete default controller modulator graph;
- reverb and chorus sends;
- 24-bit `sm24` support.

The engine now uses the standard default velocity -> attenuation response. Velocity-dependent filter darkening in guitar profiles remains a deliberate performance policy; a global default velocity -> cutoff mapping is not enabled.

## Verify parser and DSP planning

With Node 22+ and the SF2 file present:

```powershell
npm run sf2:verify
npm run build
```

Verification resolves real FluidR3 presets/regions for violin, piano, Warm Pad, acoustic guitar, electric guitar and percussion. It checks volume-envelope math, filter conversion, modulation-envelope planning, LFO metadata/frequency conversion, default velocity attenuation, sustain loops and hi-hat exclusive classes.

## Browser listening tests

Start the dev server:

```powershell
npm run dev
```

Useful regression targets:

1. Violin arco can hold beyond the MP3 sample length and releases without a gain jump.
2. Warm Pad sustains while held and keeps a smooth patch-authored release.
3. Piano decays naturally and does not behave like a looped pad.
4. Repeated acoustic/electric strums do not accumulate indefinite old tails.
5. Palm Muted is shorter than Clean/Drive; Harmonics does not hang indefinitely.
6. Soft notes are audibly quieter under the SF2 default velocity attenuation curve.
7. Guitar performance profiles still make low-velocity plucks darker where intended.
8. Filter/modulation-envelope patches change brightness and/or pitch during the note.
9. Patches with authored modulation/vibrato LFO generators produce stable periodic modulation.
10. Open/closed hi-hat choking behaves coherently.

## Documentation

- `docs/SF2_AUDIO_ENGINE.md`: engine architecture, DSP/modulation semantics and missing features.
- `docs/SF2_FULL_ENSEMBLE.md`: instrument routing and ensemble behavior.
- `docs/ARCHITECTURE_V2.md`: V2 ownership rules and the production SF2 boundary.

## Promotion record

The backend was approved for promotion on 2026-09-09 after confirming:

1. `npm run build` and `npm run sf2:verify` pass against the exact FluidR3 binary;
2. audio mix and calibration verification pass;
3. guitar repeated-strum and violin/Pad long-note behavior remain controlled;
4. filter/LFO behavior, default velocity response and ensemble balance are musically acceptable;
5. the final branch contains no temporary validation workflow;
6. documentation matches the promoted support boundary.
