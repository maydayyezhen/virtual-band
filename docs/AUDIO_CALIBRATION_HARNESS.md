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
AudioCalibrationHarness  ← audio-resource lifetime only
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

Measured results
        ↓
CalibrationPlan           ← pure recommendation policy
        ↓
family-relative program normalization
+ shared family/instrument trim proposal
+ sample-peak headroom gate
```

The harness owns an isolated audio runtime. This is intentional: calibration must use the production sampler/backend classes while remaining unable to mutate the live stage app, presentation state, MIDI state or camera state.

Recommendation policy is kept out of `AudioCalibrationHarness`. The harness only measures and auditions a caller-supplied dB compensation; `CalibrationPlan` is deterministic/pure and can therefore be verified without creating an `AudioContext`.

`AudioEngine` exposes an explicit unity-gain summed mix node before the user-facing master. Production audio remains `mix → master(0.9) → destination`, while analysis code attaches a read-only tap before master gain. Browser listening volume therefore does not change measurement results.

## Measurements

The meter uses an `AudioWorkletProcessor` to accumulate 100 ms energy blocks. Two analysis branches are used:

- raw branch: sample peak and RMS;
- K-weighted branch: integrated loudness estimate with 400 ms windows, an absolute `-70 LUFS` gate and a relative `-10 LU` gate.

The Web Audio biquad stage is an approximation of the BS.1770 K-weighting transfer function. The tool is intended for repeatable internal calibration, not broadcast compliance certification or true-peak mastering.

## Reference sequences and comparison groups

Each target has a fixed sequence intended to exercise more than one velocity/register:

- drums: kick/snare/hat/cymbal groove;
- piano and warm pad: low/mid/high notes plus a chord;
- violin arco/pizzicato: four reference notes across the register;
- acoustic guitar programs 24/25: the same note/strum geometry;
- electric-guitar programs 26–31: the same note/strum geometry.

Only targets with comparable sequence geometry receive automatic relative-normalization suggestions. Current comparison groups are:

```text
acoustic.programs = GM 24 / 25
electric.programs = GM 26 / 27 / 28 / 29 / 30 / 31
```

Drums, piano, warm pad, violin arco and violin pizzicato still report LUFS/peak/RMS, but their distance from the absolute diagnostic reference is **diagnostic only**. A transient drum groove, sustained violin and pizzicato sequence are not forced to the same integrated LUFS.

## Family-relative normalization

For a complete comparable family, the planner first takes the median of the currently measured loudness values:

```text
family center = median(measured LUFS)
```

That center preserves the current family-scale loudness instead of imposing one arbitrary project-wide LUFS target.

A quiet preset may need positive gain to reach the center. Positive program offsets are allowed, but the planner checks predicted sample peak. The current safety ceiling is:

```text
-3 dBFS sample peak
```

Because the meter does not calculate oversampled true peak, this margin is intentionally conservative. If a quiet preset cannot reach the median center without crossing that ceiling, the **whole family reference is lowered** until all boost-side members can reach it safely.

Example:

```text
median family center       -18.90 LUFS
quiet preset max safe ref  -20.38 LUFS
-------------------------------------
family safe reference      -20.38 LUFS
```

This is preferable to clipping the quiet preset's suggestion while leaving the rest of the family aimed at an unreachable target.

A secondary ±18 dB normalization range prevents pathological recommendations. If attenuation still exceeds that range, the affected target is marked `RANGE LIMIT` rather than silently pretending the family is normalized.

## Family trim vs program offset

`AudioMixProfile` already has two calibration layers:

```text
shared instrument/family trim
+
per-program trim
=
effective calibration trim
```

The planner keeps that separation explicit.

After computing the effective trim required for every member, it chooses the median suggested effective trim as the shared family trim. Each program offset becomes the residual around that median:

```text
suggested family trim = median(suggested effective trims)
suggested program trim = suggested effective trim - suggested family trim
```

This makes the program-offset set naturally center around zero while preserving exactly the same effective gain. A program offset may be positive or negative; safety is evaluated from the resulting predicted output peak, not from the sign of the offset alone.

The production `AudioMixProfile` is **not** automatically rewritten. Existing production values remain conservative until a measured family plan is listened to and explicitly accepted.

## UI status meanings

- `READY`: family-relative recommendation reached the safe family reference;
- `PEAK ANCHOR`: this quiet preset forced the family reference downward to preserve sample-peak headroom;
- `RANGE LIMIT`: ±18 dB normalization range was insufficient;
- `WAIT FAMILY`: only part of a comparable family has been measured;
- `DIAGNOSTIC`: measurement is useful, but no automatic cross-role trim is proposed;
- `INVALID`: no finite loudness measurement was available.

`Run family` measures the selected comparable family as one unit so relative suggestions are based on a complete data set.

## Human gate

The page can A/B `Current` and `Suggested` for actionable family-relative rows. Suggested auditioning is implemented as a temporary master compensation inside the isolated calibration runtime. It does not change the sampler, physical guitar controls, MIDI CC state or `AudioMixProfile`.

Final production values still require listening in a representative full-ensemble MIDI arrangement because equal measured loudness within one preset family does not imply correct musical prominence across different instruments.

## Verification

Pure meter math and family-plan policy can be checked without loading SF2:

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
