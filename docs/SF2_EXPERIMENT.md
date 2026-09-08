# SF2 backend experiment

This branch tests a narrow, native Web Audio SoundFont 2 path without replacing the current MP3 samplers.

## Scope

The experiment currently implements:

- RIFF `sfbk` parsing
- `sdta/smpl` 16-bit PCM access
- `phdr/pbag/pgen` preset zones
- `inst/ibag/igen` instrument zones
- `shdr` sample headers
- key / velocity region resolution
- sample address and loop offsets
- root key, scale tuning, coarse/fine tuning and sample pitch correction
- attenuation and pan
- volume attack / hold / decay / sustain / release envelope
- SF2 sample loop modes 1 and 3
- program / bank selection
- pitch bend and sustain pedal in the experimental voice engine

Modulators, filters, LFOs, effects sends, 24-bit `sm24`, exclusive-class behavior and a full SoundFont 2.04 compatibility pass are intentionally outside this first experiment.

## Get the test SoundFont

The 148,398,306-byte `FluidR3_GM.sf2` is deliberately **not committed** to Git because it exceeds GitHub's ordinary file limit. The helper downloads the v3.1 release asset from `pianobooster/fluid-soundfont`, which documents that its Fluid files came from the Ubuntu `fluid-soundfont` package.

```powershell
npm run sf2:fetch
```

The file is written to:

```text
public/soundfonts/FluidR3_GM.sf2
```

and is ignored by Git.

## Verify the parser

With Node 22+:

```powershell
npm run sf2:verify
```

The verification parses the real FluidR3 bank, requires at least 128 presets, resolves bank 0 / program 40 (GM Violin) at A4, and requires at least one valid sustain-loop region.

The first CI validation resolved 189 presets. Violin A4 resolved two linked L/R regions, both with SF2 loop mode 1 and valid loop points.

## Browser listening test

Start the dev server after downloading the SF2:

```powershell
npm run dev
```

In the browser developer console:

```js
await sf2Experiment.load()
```

Inspect the Violin A4 regions and their loop/envelope metadata:

```js
sf2Experiment.inspectViolin(69, 100)
```

Then run the target test: hold GM Violin A4 for ten seconds and release it using the SF2 release envelope.

```js
await sf2Experiment.testViolin(10, 69, 100)
```

For manual control:

```js
sf2Experiment.synth.programChange(40, 0)
sf2Experiment.synth.noteOn(69, 100)
// wait as long as desired
sf2Experiment.synth.noteOff(69)
```

## Decision gate

This branch is successful if the browser test produces a stable sustained violin tone for well beyond the original rendered-MP3 length, without audible hard breaks at the loop boundary, and releases naturally on Note Off.

If that result is good, the next experiment should add the missing high-value SF2 semantics (filter/LFO/modulators/exclusive class) and then test Organ, Warm Pad, Piano and the GM percussion bank before considering integration into `architecture-v2`.
