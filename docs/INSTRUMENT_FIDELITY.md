# Instrument Fidelity Notes

This document records intentional places where V2 audio compatibility is broader than the currently authored 3D geometry. These are explicit product/architecture tradeoffs, not claims of physical visual fidelity.

## Acoustic guitar: GM 24 / 25

`acoustic.main` currently uses one authored six-string steel-string acoustic guitar model. The model geometry, headstock hardware, bridge construction, neck proportions, string appearance and other visible details should therefore be interpreted as a steel-string acoustic guitar.

The V2 audio layer supports both General MIDI acoustic-guitar programs:

| GM program | Audio program | Current visual representation | Fidelity status |
| --- | --- | --- | --- |
| 24 | Acoustic Guitar (Nylon) | Existing steel-string acoustic model | Known visual/audio mismatch |
| 25 | Acoustic Guitar (Steel) | Existing steel-string acoustic model | Aligned |

Program 25 is the default because it matches the current donor model.

Program 24 exists for MIDI/audio compatibility. Selecting Nylon changes the sampler family but does **not** currently replace or mutate the 3D instrument. A nylon/classical guitar normally differs visibly in areas such as headstock/tuner construction, bridge/string anchoring, neck/fingerboard proportions and string material. Those differences are intentionally not faked by runtime patches.

This mismatch is acceptable for the current migration phase because audio Program support and visual model identity are separate concerns. The runtime must keep that distinction explicit.

## Resolution policy

If a dedicated classical/nylon model is added later, resolve the mismatch through an explicit instrument/model variant or entity mapping, for example a separate `acoustic.classical` visual asset or a clean program-to-visual-variant mapping. Do not solve it by monkey-patching donor geometry when Program Change events arrive.

Program changes also should not become a catch-all for playing technique. Fingerstyle, muted playing, harmonics, percussive/slap techniques and similar behaviors belong to articulation/performance semantics when they are implemented. A 12-string guitar should be treated as a physically different instrument/visual variant rather than merely another six-string sample preset.

## Current input behavior

In the Atelier acoustic showcase:

- `Q` toggles GM 24 Nylon / GM 25 Steel.
- `E` remains the up-strum key.
- Program changes affect newly triggered notes; already sounding sample voices are allowed to finish naturally.

Future MIDI routing should call `AcousticGuitarInstrument.programChange(program)` for GM 24/25 rather than reaching into the sampler or Presentation layer directly.
