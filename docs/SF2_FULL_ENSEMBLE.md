# SF2 Full-Ensemble Routing

The `experiment/sf2-backend` branch now routes the full playable ensemble through one shared SoundFont bank while keeping the existing MP3 sample path as fallback.

## Shared-bank architecture

```text
VirtualBandApp
├── AudioEngine
├── SampleLibrary                 MP3 fallback
├── Sf2BankLibrary                one fetch + one parse per SF2 URL
├── drumsSf2                      independent Sf2Synth state
├── keyboardSf2                   independent lower/upper synth state
├── violinSf2                     independent violin sustain state
├── acousticSf2                   independent program backend
└── electricSf2                   independent program backend
```

The 148,398,306-byte `FluidR3_GM.sf2` is fetched and parsed once through `Sf2BankLibrary`. Instrument backends share the parsed SoundFont data but do not share program, sustain, pitch-bend or active-voice state.

## Runtime routing

- Drums: bank 128, program 0 (`Standard` percussion)
- Keyboard lower: bank 0, program 0 (`Yamaha Grand Piano`)
- Keyboard upper: bank 0, program 89 (`Warm Pad`)
- Violin arco: bank 0, program 40 (`Violin`)
- Violin pizzicato: current MP3 articulation path
- Acoustic guitar: bank 0, programs 24/25 (`Nylon String Guitar` / `Steel String Guitar`)
- Electric guitar: bank 0, programs 26–31 (`Jazz`, `Clean`, `Palm Muted`, `Overdrive`, `Distortion`, `Harmonics`)

## Sampler/backend boundary

`ProgramToneBackend` is the narrow sampler-facing contract for bank/program instruments. It exposes note lifecycle, sustain, pitch bend, gain and a small performance-profile surface without leaking parser or Web Audio node details into 3D instrument adapters.

```text
Instrument adapter
      ↓ semantic event
Sampler
      ↓ instrument policy
ProgramToneBackend
      ↓
Sf2Synth
```

The violin retains its dedicated `ViolinSustainBackend` because physical string identity and audible release duration are part of the existing violin visual/audio synchronization contract.

## Dynamic timbre

The native SF2 synth now executes the core low-pass filter path:

- `initialFilterFc`
- `initialFilterQ`
- `modEnvToFilterFc`
- modulation-envelope delay/attack/hold/decay/sustain/release
- `keynumToModEnvHold`
- `keynumToModEnvDecay`

Instrument performance profiles sit above those SoundFont values. They currently provide `brightnessCents`, low-velocity filter darkening and a filter-envelope depth multiplier.

Acoustic defaults:

| Program | Character | Brightness policy |
| --- | --- | --- |
| 24 Nylon | warmer/rounder | modest negative cutoff offset, stronger low-velocity darkening |
| 25 Steel | brighter attack | near-neutral cutoff, low-velocity darkening |

Electric programs keep separate profiles so Jazz/Palm Muted are darker, Harmonics is brighter, and Drive/Distortion remain controlled without sharing one global cutoff hack.

These are performance overrides layered above the SF2 engine; they do not mutate parser results.

## Guitar lifecycle

Frozen guitar donors schedule visible strum hits over several frames. The adapters tag those later hit callbacks as `strum` gestures so each SF2 pluck receives a finite ring ceiling. Retriggering the same physical string quickly chokes the previous voice, preventing old release tails from stacking under repeated strums.

Program-specific electric ring ceilings remain intentionally separate from the SoundFont envelope. Palm Muted is short; Clean/Jazz/Drive can ring longer; Harmonics is capped so it does not become an indefinite looped tail.

## Percussion behavior

The parser exposes `exclusiveClass`; `Sf2Synth` chokes existing voices in the same exclusive class before starting a replacement voice. FluidR3 closed/open hi-hat regions resolve to exclusive class 1, so SoundFont-level choking agrees with the instrument's explicit hi-hat semantics.

## Fallback behavior

Each sampler keeps its MP3 path. SF2 preparation happens in parallel with MP3 preload and donor/model setup:

```text
SF2 ready      → new notes use SF2
SF2 warming    → MP3 fallback remains usable
SF2 failed     → MP3 fallback remains usable
```

The 3D scene is not blocked on the 148 MB SoundFont download/parse.

## Validation

With the local SoundFont present:

```powershell
npm run build
npm run sf2:verify
```

The verification script checks:

- at least 128 presets and expected GM routing;
- violin and Warm Pad sustain loops;
- piano, acoustic/electric guitar and percussion region resolution;
- volume-envelope key tracking and 96 dB attenuation math;
- SF2 filter metadata and filter conversion math;
- percussion/hi-hat exclusive classes.

Listening validation remains necessary because compile/parser correctness cannot judge musical balance. Test repeated guitar strums, Harmonics, Palm Muted, velocity contrast, long Pad/violin holds, piano decay, sustain-pedal release and hi-hat choke.

## Known compatibility limits

The full-ensemble branch still does not execute the full `pmod`/`imod` graph, modulation/vibrato LFOs, arbitrary MIDI CC/aftertouch modulation, reverb/chorus sends or `sm24`. `modLfoToFilterFc` is parsed for inspection but not yet executed. See `docs/SF2_AUDIO_ENGINE.md` for the detailed support boundary.
