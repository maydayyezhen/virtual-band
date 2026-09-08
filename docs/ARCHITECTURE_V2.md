# Virtual Band V2 Architecture

## Goal

V2 is a clean application, not a refactor of the old runtime. The old branch and frozen donor files are sources of reusable modeling / animation algorithms and authored visual behavior.

## Composition root

`VirtualBandApp` is the only place allowed to wire top-level systems together.

```text
VirtualBandApp
├── RendererHost
├── Engine
├── Transport
├── AudioEngine
├── SampleLibrary
├── InstrumentRegistry
├── InstrumentInteractionSystem
├── VenueManager
├── CameraRegistry / CameraSystem
├── PresentationManager
├── ShowcaseSwitchController
├── ShowScheduler
├── ControlArbiter
└── AppState
```

## Non-negotiable rules

1. **One frame loop.** Only `Engine` owns `requestAnimationFrame` for simulation/rendering. Venue, presentation, camera, lighting, screens, instruments and editors expose `update()` instead of starting their own loops.
2. **One transport clock.** Song time comes from `Transport`. DOM progress bars, camera modules and venue modules never infer playback time independently. Presentation-only demos consume Engine `dt`; they do not create another RAF or wall-clock loop.
3. **Stable entity IDs.** Systems address instruments by IDs such as `drums.main`, `keyboard.main`, `violin.main`, `electric.main` or `acoustic.main`. Object names are labels, not identity or routing logic.
4. **Venues are first-class.** `atelier-studio`, `empty-stage`, `nocturne` and future stages implement the same `Venue` interface. A Venue owns environment, fog, floor, fixed lighting, renderer profile and spatial layout.
5. **One camera system.** Presentation modes, manual control, editor, auto director and Agent command `CameraSystem`; none creates a second output camera or a second render loop.
6. **Presentation is separate from Venue.** A Venue answers “where and under what light”; a PresentationMode answers “how the user observes and interacts with it”. Atelier showcase modes own orbit/pan/zoom/play gesture behavior without owning saved camera assets, the renderer or the output camera.
7. **Saved camera views belong to CameraRegistry.** Venue views use world coordinates. Instrument views use instrument-local coordinates and may include authored orbit/framing data. Drum, keyboard, violin, electric-guitar and acoustic-guitar close-up views are reusable camera assets and can be invoked by showcase, show plans, manual director or Agent code.
8. **3D picking is a service, not gesture ownership.** `InstrumentInteractionSystem` owns the shared raycast and dispatches start/end interactions. Static parts may expose `userData.hit`; instruments with continuous authored surfaces may implement `resolveHit(intersection)` to map that same nearest intersection to a stable part ID. This keeps fretless or fretted fingerboard geometry out of the generic picker while preserving one raycast owner.
9. **Single-instrument showcase selection is explicit.** `ShowcaseSwitchController` only chooses which registered instrument is visible and which registered PresentationMode is active. It does not own cameras, audio, Venue state or instrument behavior. The current switch gesture is `Tab` / `Shift+Tab`; a future UI can call the same `select()` API.
10. **Show control is arbitrated.** Camera / lighting / screen writers acquire channel ownership through `ControlArbiter`; priority is explicit instead of systems repeatedly overwriting each other.
11. **UI is optional.** The current Atelier showcase intentionally has no application UI. If React UI is reintroduced later, it remains an adapter and runtime systems still never query or mutate UI DOM.
12. **No runtime monkey patches.** Do not patch Three.js prototypes, `renderer.render`, `position.set`, venue APIs, or other systems to discover/steal ownership.
13. **No load-order architecture.** Dependencies are ES modules imported explicitly; frozen donor chunks are concatenated only inside their narrow legacy adapters and never expose runtime globals.

## Atelier donor parity boundary

The GPT-generated Atelier instrument HTML files are treated as golden references for instrument geometry, materials and authored mechanical animation. Their reusable responsibilities are separated rather than bundled into standalone pages:

```text
Frozen donor geometry/controller
        ↓
legacy*Asset adapter
        ↓
Instrument adapter ───────→ AudioEngine / sampler
        ↓
AtelierStudioVenue         fixed shared environment / lights / fog / floor
        ↓
CameraRegistry             authored instrument-local saved views
        ↓
Atelier*ShowcaseMode       orbit / pan / zoom / play gestures / optional demo
        ↓
CameraSystem               sole output camera
```

The drum kit uses `DrumsInstrument + DrumSampler`; the dual stage keyboard uses `KeyboardInstrument + KeyboardSampler`; the violin uses `ViolinInstrument + ViolinSampler`; the electric guitar uses `ElectricGuitarInstrument + ElectricGuitarSampler`; the acoustic guitar uses `AcousticGuitarInstrument + AcousticGuitarSampler`. Donor geometry remains intact. Differences in donor coordinate systems are normalized only through Atelier Venue layout transforms, so the common studio environment stays fixed while each instrument keeps its authored local geometry and local camera views.

The violin keeps the donor's four physical strings, continuous fretless fingerboard positioning, independent string vibration, bow engagement, adjacent-string double-stop bow logic, vibrato, pitch-bend animation and arco/pizzicato articulation state. The electric guitar keeps its six independently animated strings, 22-fret fingering, pick animation, tremolo/pitch-bend motion, sustain state, volume/tone/pickup controls and delayed down/up strum controller. The acoustic guitar keeps the authored spruce/rosewood model and 20-fret geometry while its V2 adapter adds six dynamic playable strings, fretting markers, animated plectrum motion, pitch-bend deformation and delayed down/up strum behavior based on the old acoustic visual semantics. Their original page renderers, lighting, UI, RAF and DOM controls are not imported into V2.

Audio compatibility may intentionally cover a wider set of programs than the current authored geometry. Such cases must be documented rather than hidden behind runtime geometry patches. The current acoustic model is visually a steel-string guitar: GM 25 Steel is aligned with that model, while GM 24 Nylon is supported as an audio-compatibility mode and knowingly reuses the same steel-string visual asset. See `docs/INSTRUMENT_FIDELITY.md` for the explicit mismatch and future resolution policy.

Audio receives the same semantic note events as visual animation. Mouse, computer keyboard, presentation demos and future MIDI routing therefore converge on instrument APIs instead of maintaining separate sound and animation paths. `SampleLibrary` owns local sample paths, fetch/decode and the shared decoded-buffer cache; sampler classes own instrument-specific program, articulation, sustain, pitch, tone/effect and voice semantics. Core samples are served from `/soundfonts` rather than an external runtime CDN.

Atelier starts audio warmup in parallel with donor/model setup. The warmup decodes common notes for drums, both keyboard tiers, both violin articulations, all exposed electric-guitar programs and both acoustic-guitar programs without blocking the visual scene. Program switches also request their program warmup as a fallback. A future formal song-playback path should derive exact Program + Note requirements from the loaded MIDI and await those samples before starting `Transport`.

## Data direction

```text
MIDI file
   ↓
MidiParser
   ↓
Song
   ↓
Transport
   ↓
SongAnalysis
   ↓
ShowPlan
   ↓
ShowScheduler
   ↓
ControlArbiter
   ├── CameraSystem
   ├── LightingChannel
   └── ScreenChannel
```

## Migration policy

The following may be reimplemented from old code after the clean interfaces exist:

- procedural instrument geometry
- instrument animation/controller algorithms
- Standard MIDI parsing and GM routing logic
- authored studio/stage environment, lighting and camera behavior
- NOCTURNE authored stage assets and fixture/screen behavior
- lighting/LED look-development and song-specific cue ideas

The following must not be copied into V2 runtime:

- old `app.js`
- camera capture/runtime bridges
- renderer or Three.js monkey patches
- independent venue clocks
- LED ownership guards
- UI-sync patches
- DOM-derived playback clocks
- bootstrap-script dependency chains

## Build sequence

1. Runtime skeleton and first-class Venue/Presentation ownership.
2. Migrate donor instruments behind the common `Instrument` boundary.
3. MIDI `Song` model + parser + audio-backed Transport.
4. Complete InstrumentRegistry and venue layouts.
5. Camera interaction/editor on top of CameraRegistry / CameraSystem / PresentationManager.
6. Reintegrate NOCTURNE behind the Venue interface.
7. SongAnalysis + ShowPlan + lighting/screen channels.
8. Practice/free-play features and production UI when needed.

Each milestone must remain directly runnable before moving to the next one.
