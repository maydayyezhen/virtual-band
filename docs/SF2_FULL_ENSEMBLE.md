# SF2 Full-Ensemble Routing

The `experiment/sf2-backend` branch now uses one shared `Sf2BankLibrary` for the whole runtime. `FluidR3_GM.sf2` is fetched and parsed once, while each instrument owns an independent synth/backend state.

## Runtime routing

- Drums: bank 128, program 0 (`Standard` percussion)
- Keyboard lower: bank 0, program 0 (`Yamaha Grand Piano`)
- Keyboard upper: bank 0, program 89 (`Warm Pad`)
- Violin arco: bank 0, program 40 (`Violin`)
- Acoustic guitar: bank 0, programs 24/25 (`Nylon String Guitar` / `Steel String Guitar`)
- Electric guitar: bank 0, programs 26–31 (`Jazz`, `Clean`, `Palm Muted`, `Overdrive`, `Distortion`, `Harmonics`)

Each sampler keeps its existing MP3 path as a fallback while the shared SF2 bank is unavailable or still warming up.

`ProgramToneBackend` is the narrow sampler-facing contract for single-program instruments. `Sf2ProgramBackend` implements it without leaking parser or Web Audio voice details into 3D instrument adapters.

Electric-guitar SF2 voices are routed through the existing pickup/tone filter chain instead of bypassing the instrument's programmable tone controls.

The SF2 parser now exposes `exclusiveClass`; `Sf2Synth` applies class choking before starting a new voice. FluidR3's closed/open hi-hat regions resolve to exclusive class 1, so the native percussion bank and the project's explicit pedal choke semantics agree.

## Validation

The full-ensemble validation checks the real 148,398,306-byte FluidR3_GM.sf2 and verifies:

- all five instrument families resolve their expected GM presets;
- programs 24–31 resolve playable guitar regions;
- bank 128 program 0 resolves kick and hi-hat regions;
- Warm Pad has sustain-loop regions;
- Violin has sustain-loop regions;
- hi-hat exclusive class metadata is parsed.

The 3D scene is not blocked on SF2 warmup. MP3 preload and shared SF2 parsing happen in parallel with donor/model setup.
