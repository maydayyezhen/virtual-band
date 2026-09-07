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
├── InstrumentRegistry
├── InstrumentInteractionSystem
├── VenueManager
├── CameraRegistry / CameraSystem
├── PresentationManager
├── ShowScheduler
├── ControlArbiter
└── AppState
```

## Non-negotiable rules

1. **One frame loop.** Only `Engine` owns `requestAnimationFrame` for simulation/rendering. Venue, presentation, camera, lighting, screens, instruments and editors expose `update()` instead of starting their own loops.
2. **One transport clock.** Song time comes from `Transport`. DOM progress bars, camera modules and venue modules never infer playback time independently. Presentation-only demos consume Engine `dt`; they do not create another RAF or wall-clock loop.
3. **Stable entity IDs.** Systems address instruments by IDs such as `drums.main` or `electric.2`. Object names are labels, not identity or routing logic.
4. **Venues are first-class.** `atelier-studio`, `empty-stage`, `nocturne` and future stages implement the same `Venue` interface. A Venue owns environment, fog, floor, fixed lighting, renderer profile and spatial layout.
5. **One camera system.** Presentation modes, manual control, editor, auto director and Agent command `CameraSystem`; none creates a second output camera or a second render loop.
6. **Presentation is separate from Venue.** A Venue answers “where and under what light”; a PresentationMode answers “how the user observes and interacts with it”. `AtelierDrumShowcaseMode` owns orbit/pan/zoom gesture behavior without owning saved camera assets, the renderer or the output camera.
7. **Saved camera views belong to CameraRegistry.** Venue views use world coordinates. Instrument views use instrument-local coordinates and may include authored orbit/framing data. The four Atelier drum views (`whole`, `drummer`, `cymbals`, `pedals`) are reusable camera assets and can be invoked by showcase, show plans, manual director or Agent code.
8. **3D picking is a service, not gesture ownership.** `InstrumentInteractionSystem` resolves raycast hits and dispatches start/end interactions. Presentation modes decide whether a pointer gesture means play, orbit, pan or zoom.
9. **Show control is arbitrated.** Camera / lighting / screen writers acquire channel ownership through `ControlArbiter`; priority is explicit instead of systems repeatedly overwriting each other.
10. **UI is optional.** The current Atelier showcase intentionally has no application UI. If React UI is reintroduced later, it remains an adapter and runtime systems still never query or mutate UI DOM.
11. **No runtime monkey patches.** Do not patch Three.js prototypes, `renderer.render`, `position.set`, venue APIs, or other systems to discover/steal ownership.
12. **No load-order architecture.** Dependencies are ES modules imported explicitly; bootstrap order must not be the hidden integration mechanism.

## Atelier donor parity boundary

The GPT-generated Atelier drum HTML is treated as a golden reference for the drum model, animation, studio environment and interaction feel. Its reusable responsibilities are separated rather than bundled into one page:

```text
Frozen drum model/controller
        ↓
legacyDrumAsset adapter
        ↓
DrumsInstrument ───────→ AudioEngine / DrumSampler
        ↓
AtelierStudioVenue      fixed environment / lights / fog / floor
        ↓
CameraRegistry          whole / drummer / cymbals / pedals
        ↓
AtelierDrumShowcaseMode orbit / pan / zoom / play gestures / demo
        ↓
CameraSystem            sole output camera
```

The added audio layer receives the same `noteOn` events as the donor animation. Mouse, keyboard, demo and future MIDI routing therefore converge on one instrument API instead of maintaining separate sound and animation paths.

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
