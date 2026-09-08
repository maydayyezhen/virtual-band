# Local soundfont assets

V2 serves its core audio samples from this directory so instrument playback does not depend on a runtime CDN.

## FluidR3_GM

The directories under `FluidR3_GM/` are pre-rendered samples derived from `FluidR3_GM.sf2` via the `gleitz/midi-js-soundfonts` project. That project documents FluidR3_GM as released under the Creative Commons Attribution 3.0 license.

Source project: `gleitz/midi-js-soundfonts`
License: Creative Commons Attribution 3.0

Only the program families currently used by the V2 core instruments are vendored here. Runtime code should address them through `SampleLibrary`; samplers should not embed external CDN URLs.

## Loading policy

- The visual scene must not wait for audio warmup.
- Atelier warmup decodes common notes for the currently exposed instrument programs in the background.
- A formal song playback path should inspect the MIDI first and await the exact Program + Note sample requirements before starting transport playback.
- Do not vendor all 128 GM programs into the core bundle without an explicit asset-size decision.
