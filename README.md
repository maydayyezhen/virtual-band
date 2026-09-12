# Virtual Band V2

Browser MIDI playback with a Three.js virtual band and six interactive instrument assets.

## Run

```powershell
npm ci
npm run dev
```

The MIDI player uses the existing `public/soundfonts/FluidR3_GM.sf2`. If missing, run `npm run sf2:fetch`.

- `/tools/audio/player/`: standalone MIDI player, without a 3D scene.
- `/studio/band/`: primary workspace for MIDI bands, live playing, camera presets and free venue roaming.
- `/assets/instruments/`: interactive instrument library.
- `/studio/layout/`: layout editor.

## Playback boundary

Original MIDI bytes go to **SpessaSynth 4.3.14** for parsing, sequencing and SoundFont synthesis in an AudioWorklet. The standalone player and stage share `MidiPlayback`. Stage size, instrument range, short tracks and visual note limits do not alter the audio.

`@tonejs/midi` is used only for visual score analysis. `BandPlayer` observes the library transport and drives silent `visualNoteOn` / `visualNoteOff` methods. It has no audio scheduler.

Interactive free play also uses SpessaSynth through `LiveAudioEngine`. Each instance owns independent channel leases behind `InstrumentAudio` ports. `InstrumentDefinitions` binds a model, sound adapter, views and interaction mode; adding another existing instrument type is an instance descriptor. Calibration/mix tools retain the experimental old backend and do not tune the new runtime. Models, authored animations, layouts and cameras are preserved. Editor panning and NOCTURNE rendering now attach explicitly, without prototype patches.

See [playback details and limitations](docs/MIDI_PLAYBACK.md). In particular, library seeking restores controllers but does not re-trigger notes that began before the seek target. Pause/resume does re-trigger held notes.

## Checks

```powershell
npm run typecheck
npm run build
npm run midi:verify
npm run layout:verify
```

For browser checks, provide Playwright through `PLAYWRIGHT_MODULE` (or install it in your test environment), run Vite, then:

```powershell
npm run midi:browser
node scripts/verify-band-browser.mjs
npm run live:browser
npm run camera:browser
npm run stage:browser
```

Browser checks use **Google Chrome**. `TEST_URL` optionally selects a different local server. They exercise generated MIDI fixtures, actual audio output, controller state, pause/resume, seek, completion/replay, silent visuals, stage reload, duplicate-instance picking/cameras, live input and channel isolation.

## Band camera controls

The top-left camera panel switches between fixed stage views and “自由漫游”. Double-click an instrument to enter its close-up. Fixed stage shortcuts are 1–4; instruments retain their own playing and preset keys.

In free mode use WASD or arrow keys for horizontal movement, Q/E to descend/ascend, and Shift for speed. Drag to look around; right-drag or Shift-drag pans. The wheel changes field of view, and two-finger pinch also zooms. “鼠标跟随” optionally locks mouse-look using Three.js PointerLockControls. Escape or leaving mouse lock returns to the stage. “重置漫游” restores the starting position and lens. Touch devices get horizontal and elevation buttons. The camera can cross the audience hall and rise to the galleries, with venue bounds but no instrument collision or gravity. Manual input interrupts an entry transition at the displayed pose.

See [camera ownership and transition behavior](docs/CAMERA_SYSTEM.md).

The band page includes a Bohemian Rhapsody lighting example. Load it from the stage panel, press Play, and select the manual “灯光全景” view to see the full rig. Songs supply beat-indexed arrangements through a separate lighting module; screens and automatic cameras remain separate. See [灯光架构与新增编排](docs/LIGHTING_SYSTEM.md) and [主线模块分工](docs/BAND_MAINLINE_PLAN.md).

## Stage layout

The band and layout editor share the independent `NocturneVenue`, metre-normalized models and the same pure layout solver. Placement uses instance IDs, measured geometry plus performance space, yaw-aware bounds, venue exclusions and saved locks. Failed arrangements are reported without replacing the live scene. MIDI changes reuse existing instances and valid positions; “重新排位” requests a fresh arrangement while respecting locks.

Drop a layout JSON exported by `/studio/layout/` onto `/studio/band/` to apply its exact IDs/transforms and enter live-playing mode. Invalid or conflicting layouts are rejected with a message. Old schema-3 `atelier-studio` documents migrate to `nocturne`; their former implicit 1.5x enlargement becomes explicit instance scale. New layouts use real metres.

The “LED 内容” panel accepts images and silent videos, Canvas animations, text and real audio spectra. `ScreenContent` also accepts external canvas/image surfaces and GPU textures through a common extension point, with independent screen ownership and song/local clocks. The Bohemian example now includes the reference's seven-act Canvas theatre, with independent main/wing compositions and manual media overrides. “恢复歌曲画面” restores the selected screens to song time. See [屏幕内容接口](docs/SCREEN_CONTENT.md). Automatic cameras remain a future integration.
