# Audio Calibration Harness

`AudioMixProfile` remains the production loudness policy. The calibration harness is a development tool that measures the real runtime audio path and proposes trim changes; it does not normalize audio at runtime and it does not write the profile automatically.

## Entry point

Run:

```powershell
npm run dev:calibration
```

or open:

```text
/calibration.html
```

The normal stage app and the calibration page are separate Vite entry points. The calibration page does not construct the 3D scene, presentation modes, camera system or instrument interaction system.

## Architecture

```text
Calibration page (React)
        ↓
AudioCalibrationHarness
        ↓
CalibrationAudioRuntime
        ↓
real Drum / Keyboard / Violin / Guitar samplers
        ↓
real SF2 backend or MP3 fallback
        ↓
AudioEngine summed mix ─────→ Master → speakers
             │
             └── read-only pre-master tap
                    ├── raw level meter
                    └── K-weight filters → loudness meter
```

The harness owns an isolated audio runtime. This is intentional: calibration must use the production sampler/backend classes while remaining unable to mutate the live stage app, presentation state, MIDI state or camera state.

`AudioEngine` now has an explicit unity-gain summed mix node before the user-facing master. Production audio is unchanged (`mix → master(0.9) → destination`), but analysis code can attach a read-only tap before master gain. This prevents browser listening volume from changing measurement results.

## Measurements

The meter uses an `AudioWorkletProcessor` to accumulate 100 ms energy blocks. Two analysis branches are used:

- raw branch: sample peak and RMS;
- K-weighted branch: integrated loudness estimate with 400 ms windows, an absolute `-70 LUFS` gate and a relative `-10 LU` gate.

The Web Audio biquad stage is an approximation of the BS.1770 K-weighting transfer function. The tool is intended for repeatable internal calibration, not broadcast compliance certification or true-peak mastering.

## Reference sequences

Each target has a fixed sequence intended to exercise more than one velocity/register:

- drums: kick/snare/hat/cymbal groove;
- piano and warm pad: low/mid/high notes plus a chord;
- violin arco/pizzicato: four reference notes across the register;
- acoustic guitar: three velocity/register notes plus an open-string strum;
- every electric-guitar program: the same note/strum geometry so program trims are comparable.

The measured path includes the current `AudioMixProfile`, instrument/preset behavior, velocity response, filters and the real selected SF2/MP3 backend.

## Suggested trim

For a target:

```text
desired delta = reference LUFS - measured LUFS
suggested trim = current trim + desired delta
```

A single pass is limited to ±6 dB, and the suggestion is capped at `0 dB` total calibration gain so the existing “calibration never boosts above unity” headroom invariant remains intact.

The reference LUFS value is an internal comparison target, not a release-master standard. If many quiet targets hit the `0 dB` cap, lower the reference or attenuate louder peers instead of allowing calibration gain above unity.

## Human gate

The page can A/B `Current` and `Suggested`. Suggested auditioning is implemented as a temporary master compensation inside the isolated calibration runtime. It does not change the sampler, physical guitar controls, MIDI CC state or `AudioMixProfile`.

Final production values still require listening in a representative full-ensemble MIDI arrangement because equal measured loudness does not imply equal perceptual prominence.

## Verification

Pure calibration math can be checked without loading SF2:

```powershell
npm run calibration:verify
```

Full project verification remains:

```powershell
npm run mix:verify
npm run calibration:verify
npm run build
npm run sf2:fetch
npm run sf2:verify
```
