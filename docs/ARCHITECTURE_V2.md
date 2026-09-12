# Virtual Band V2 Architecture

## Current runtime (2026-09-11)

The instrument library (`VirtualBandApp`), band viewer and layout editor remain separate page hosts. Shared responsibilities belong to modules, not copied page setup code:

- `BandAudioGraph`: host AudioContext/master bus and shared free-play audio resources.
- `SpessaSynthEngine`: SpessaSynth worklet/SoundFont lifecycle, used by MIDI and free play.
- `MidiPlayback`: original MIDI bytes, native sequencer, playback clock, pause/seek/stop.
- `LiveAudioEngine`: independent, recycled MIDI channel leases for live instrument instances.
- `InstrumentDefinitions`: one catalog of model, sound-port adapter, camera templates and interaction mode per type.
- `InstrumentRegistry`: unique instance identity, ownership of scene roots and disposal.
- `InstrumentInteractionSystem`: shared raycast, part resolution and gesture dispatch.
- `CameraRegistry` / `CameraSystem`: named views, finite camera transitions and one output camera.
- `OrbitController`: shared orbit/pan/zoom and preset handoff for the stage and all six showcase modes.
- `FreeCameraController`: horizontal/vertical venue roaming, drag/pan/FOV zoom and optional native Three.js mouse-look.
- `PresentationManager`: active interaction mode; band `StageDirector` owns the exclusive stage/showcase/spectator mode and frame handoff.
- `RendererHost`: renderer and an explicit, disposable scene-render-pass attachment.
- `NocturneVenue`: independent scene assets, venue-owned layout/camera bounds, explicit update and disposal. Both stage and editor use it directly.
- `BandSession`: prepares and validates ID-based layouts before application; startup, MIDI replacement and saved layouts share the host's `mountBand` commit path.

```text
Original MIDI ──> MidiPlayback / SpessaSynth Sequencer ──> audio
                          │ native playback clock
                          v
@tonejs/midi ──> band plan ──> VisualPerformance ──> silent model animation

User gesture ──> Instrument ──> InstrumentAudio port ──> LiveAudioEngine ──> audio
```

The live and file paths share the same synthesis implementation, with separate synthesizer state. Song reset/program/controller/SysEx events must not change live channels. Visual planning never reconstructs the audio MIDI stream or schedules sound from render frames. The legacy `Transport` is not the MIDI song clock.

## Instrument instances

A type definition supplies a model builder, live audio adapter, authored camera templates and a mode factory. A stage member is an instance descriptor such as `{ id: 'keyboard.2', type: 'keyboard' }`. Hosts use `createInstrumentInstance` and register every resulting object. Repeating a type does not require a second type-specific setup path.

- Assign IDs before registration; each registered root has one owner.
- Picking resolves the registered owner of the intersected mesh. A cloned mesh's old `userData.instrumentId` is not authoritative.
- Camera templates use local coordinates and are copied/rebound to `${instanceId}:${viewName}`.
- Modes use `${instanceId}:showcase` and resolve their own instance's views.
- Instances own their sound ports; disposal releases channel leases and model resources. The host owns the synthesizer and AudioContext.
- The initial instrument library still has six authored showcase controls. The band viewer accepts a list with multiple instances of every supported type. Adding a new type requires an implementation in the catalog, not merely a new name.

## Audio boundary

`InstrumentAudio.ts` declares small semantic ports for keyboard tiers, strings/articulation and percussion. Models do not import a concrete sampler or SF2 backend. `LiveInstrumentAudio` maps these gestures to native MIDI commands; SpessaSynth owns SoundFont parsing, sample playback, envelopes, effects, sustain and bends.

A keyboard gets independent tier channels; a guitar/bass gets independent string channels; violin uses bowed and pizzicato channels; a drum kit gets a percussion channel. Channels are recycled with fresh program/controller state. Source ownership prevents releasing one held keyboard source from stopping another source at the same pitch. Audio release does not depend on a model fingering potentially overwritten by MIDI animation.

The old `SampleLibrary`, samplers and `audio/sf2` implementation remain available to calibration/development tools. They are outside the library/band runtime graph. Those tools' custom mix/EQ/effect profiles do not tune the new engine. GM has no physical pickup selector; the existing pickup control maps approximately to native brightness.

See [MIDI_PLAYBACK.md](MIDI_PLAYBACK.md) for native seek behavior, exact boundaries and browser checks. Full GM/GS/XG conformance is not asserted.

## Preserved visual assets

Frozen Atelier donors remain geometry/material/mechanical-animation references, accessed through narrow `legacy*Asset` adapters. Instruments own local models; venue/layout code applies stage transforms. Existing physical fingerings, strum gestures, bow animations and local camera composition are retained. Visual constraints may simplify a score; they cannot remove notes from audio playback.

Venues supply environment and placement constraints. Presentation supplies orbit/pan/zoom and playing gestures. Saved views belong to CameraRegistry. NOCTURNE attaches through `RendererHost.setSceneRenderPass`; `NocturneAsset.js` is a static, instance-local procedural visual asset behind a typed interface. It has no page bootstrap, window bridge, decompression, source-string patching, camera controller or private RAF. Editor panning uses an explicit camera/target API.

Automatic placement uses `Formation.ts`: explicit venue space + instance occupancy and placement roles → complete concert formation → collision adjustment. `AutoLayout` adapts saved documents and measured geometry; `validateLayout` checks exact saved poses separately. MIDI roster changes reflow automatic positions while preserving explicit locks, model identity, rotation and scale. The core imports no venue implementation, instrument catalog or renderer. See [FORMATION.md](FORMATION.md).

Song lighting has a separate boundary: original MIDI → `MusicAnalysis` + beat-indexed `SectionShow` → complete `LightingFrame` → the venue's exclusive `LightingPort`. `LightingSession` runs from the existing playback clock and releases control back to the decorative look. `ConcertShow` provides reusable patterns so a song can be a section table, demonstrated by `shows/BohemianRhapsody.ts`. The venue owns optional pixels/gobos and a six-slot surface-light pool. Screens and cameras are excluded from lighting frames. See [LIGHTING_SYSTEM.md](LIGHTING_SYSTEM.md).

## Working rules and remaining work

Each host owns its frame loop. Modules expose update/dispose instead of starting extra RAF loops. Song time comes from the native sequencer; DOM and renderer time are not audio clocks. Keep rendering, audio and camera dependencies explicit, with no runtime monkey patches or load-order globals.

LED sources use a parallel boundary: `ScreenContent.create` returns a media/canvas/texture player; `ScreenSession` supplies song or local time and owns loading/cancellation/disposal. `NocturneVenue.screens` grants per-screen display leases and restores the default hardware state. `ScreenAudioTap` reads the existing mix without owning playback. See [SCREEN_CONTENT.md](SCREEN_CONTENT.md).

`src/shows/catalog.ts` composes lighting and screen arrangements from one `MusicAnalysis`, matching exact MIDI bytes. The Bohemian theatre is a regular `ScreenContent` with extracted, instance-owned Canvas artwork and deterministic absolute-time motion. `SongScreens` releases song-owned screens by content object identity; manual replacements remain independent. The catalogue coordinates preparation, not rendering or camera control.

The authored instrument controllers and six presentation modes still contain substantial instrument-specific behavior. This change centralizes assembly and instance ownership; it does not claim a full rewrite of those internals. `ShowScheduler` and `ControlArbiter` remain groundwork for future coordinated shows and do not own current MIDI playback.

Future changes should remain runnable in stages. Validate with typecheck/build, visual timeline checks, layout checks and Chrome behavior tests after the last relevant edit.

The band viewer is the primary integration page. See [CAMERA_SYSTEM.md](CAMERA_SYSTEM.md) for camera responsibilities and verification.

See [BAND_MAINLINE_PLAN.md](BAND_MAINLINE_PLAN.md) for the delivered venue/layout boundaries and remaining work. Song lighting and the reference theatre are connected through independent ports. Automatic camera control remains outside this integration.
