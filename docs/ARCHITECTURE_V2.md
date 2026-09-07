# Virtual Band V2 Architecture

## Goal

V2 is a clean application, not a refactor of the old runtime. The old branch is a source of reusable modeling / animation algorithms and visual assets only.

## Composition root

`VirtualBandApp` is the only place allowed to wire top-level systems together.

```text
VirtualBandApp
├── RendererHost
├── Engine
├── Transport
├── InstrumentRegistry
├── VenueManager
├── CameraRegistry / CameraSystem
├── ShowScheduler
├── ControlArbiter
└── AppState -> UI
```

## Non-negotiable rules

1. **One frame loop.** Only `Engine` owns `requestAnimationFrame` for simulation/rendering. Venue, camera, lighting, screens, instruments and editors expose `update()` instead of starting their own loops.
2. **One transport clock.** Song time comes from `Transport`. DOM progress bars, camera modules and venue modules never infer playback time independently.
3. **Stable entity IDs.** Systems address instruments by IDs such as `drums.main` or `electric.2`. Object names are labels, not identity or routing logic.
4. **Venues are first-class.** `empty-stage`, `nocturne` and future stages implement the same `Venue` interface. Switching venues swaps venue roots/profiles; it does not restore snapshots of another application state.
5. **One camera system.** Manual control, editor, auto director and Agent must resolve views through `CameraRegistry` and command `CameraSystem`. No cloned PROGRAM camera and no second camera definition table.
6. **Camera coordinates have explicit scope.** Venue views use world coordinates. Instrument views use instrument-local anchors so they survive venue/layout changes.
7. **Show control is arbitrated.** Camera / lighting / screen writers acquire channel ownership through `ControlArbiter`; priority is explicit instead of systems repeatedly overwriting each other.
8. **UI is an adapter.** React reads `AppState` and sends commands to `VirtualBandApp`. Engine modules never query or mutate UI DOM.
9. **No runtime monkey patches.** Do not patch Three.js prototypes, `renderer.render`, `position.set`, venue APIs, or other systems to discover/steal ownership.
10. **No load-order architecture.** Dependencies are ES modules imported explicitly; bootstrap order must not be the hidden integration mechanism.

## Data direction

```text
MIDI file
   ↓
MidiParser
   ↓
Song
   ↓
Transport ───────────────→ UI time display
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
- NOCTURNE authored stage assets and fixture/screen behavior
- useful camera numbers and composition ideas
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

1. Runtime skeleton and empty venue — current milestone.
2. MIDI `Song` model + parser + audio-backed Transport.
3. Import one instrument through the common `Instrument` interface; validate MIDI -> audio -> animation.
4. Complete InstrumentRegistry and venue layouts.
5. Camera interaction/editor on top of CameraRegistry.
6. Reintegrate NOCTURNE behind the Venue interface.
7. SongAnalysis + ShowPlan + lighting/screen channels.
8. Practice/free-play features and production UI.

Each milestone must remain directly runnable before moving to the next one.
