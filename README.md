# 返场 ENCORE

A virtual music stage built on Virtual Band V2: MIDI playback, a Three.js band and an interactive instrument library. Both `/` and `/studio/band/` open the game menu; development tools retain their dedicated URLs.

For a new song or first-time agent handoff, start with [新作品交付流程](docs/NEW_SONG.md). For API details, see [演出创作接口：灯光、导播镜头与 LED](docs/SHOW_AUTHORING.md). It maps the current APIs, reusable techniques, original examples, extension points and verification boundaries. Repository collaboration instructions are in [AGENTS.md](AGENTS.md).

## Run

```powershell
npm ci
npm run dev
```

The MIDI player uses the existing `public/soundfonts/FluidR3_GM.sf2`. If missing, run `npm run sf2:fetch`.

- `/tools/audio/player/`: standalone MIDI player, without a 3D scene.
- `/studio/band/`: concert start screen with an empty animated stage, song selection, MIDI preview and instrument-library entry. Performances show only the stage; Escape pauses into the game menu, with resume, song selection, camera modes and creation tools; `?workspace=1` opens the direct workbench used by existing development checks.
- `/assets/instruments/`: interactive instrument library.
- `/studio/layout/`: layout editor.

The game shell uses `StageShell` for navigation and cover interaction, `SongLibrary` as a derived view of the unified show catalogue, and `GameAudio` for menu music and UI samples on the existing audio mix. Highlighting a song previews a looping excerpt through `MidiPlayback`; entering a show hands audio over to the performance. Menu and library ambience resume automatically after the browser's first user gesture. UI lighting follows the real audio envelope and respects reduced-motion preferences. Asset sources and licenses are recorded in `public/audio/README.md`, `public/fonts/README.md` and `src/assets/ui-icons/LICENSE`; the generated cover prompt is in `public/artwork/bohemian-cover.prompt.txt`.

During a performance, `StageShell` owns the Escape pause menu: it pauses the existing player, freezes stage updates, and hands music to `GameAudio`. Resume restores the same transport position and hides all player UI. `scripts/verify-pause-menu-browser.mjs` checks pause/resume, audio ownership, clean playback, menu navigation and camera/tool choices.

## Playback boundary

`LoadingCurtain` provides the opaque modal loading screen for stage/model construction and initial instrument-library loading. Nested loaders share one curtain; it paints before model creation and reveals after a rendered frame. `scripts/verify-loading-curtain-browser.mjs` checks coverage, input blocking, animation, reduced motion and load failure recovery.

Original MIDI bytes go to **SpessaSynth 4.3.14** for parsing, sequencing and SoundFont synthesis in an AudioWorklet. The standalone player and stage share `MidiPlayback`. Stage size, instrument range, short tracks and visual note limits do not alter the audio.

`@tonejs/midi` is used only for visual score analysis. `BandPlayer` observes the library transport and drives silent `visualNoteOn` / `visualNoteOff` methods. It has no audio scheduler.

Interactive free play also uses SpessaSynth through `LiveAudioEngine`. Each instance owns independent channel leases behind `InstrumentAudio` ports. `InstrumentDefinitions` binds a model, sound adapter, views and interaction mode; adding another existing instrument type is an instance descriptor. Calibration/mix tools retain the experimental old backend and do not tune the new runtime. Models, authored animations, layouts and cameras are preserved. Editor panning and NOCTURNE rendering now attach explicitly, without prototype patches.

See [playback details and limitations](docs/MIDI_PLAYBACK.md). In particular, library seeking restores controllers but does not re-trigger notes that began before the seek target. Pause/resume does re-trigger held notes.

Register a `ShowDefinition` once in `src/shows/catalog.ts`; menu songs and offline exports derive from it. `npm run song:verify -- --song <id>` validates a work; `npm run video:export -- --song <id>` exports it.

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

The default entry is the ENCORE desktop game menu, set in NOCTURNE hall. “播放歌曲” opens song selection with artwork and a 25-second MIDI preview; “开始演出” loads the complete arrangement. Arrow keys navigate the menus, Enter activates, and Escape returns. “创作工具” reveals the existing stage panels. Returning to the start screen stops playback, removes the band and restores the venue's default light/screen animation. The shell is in `src/app/stage/StageShell.ts`; display metadata is in `SongLibrary.ts`, while executable show arrangements remain in `src/shows/catalog.ts`. `node scripts/verify-stage-shell-browser.mjs` checks the Chrome flow at desktop resolutions. Local font sources and licenses are recorded in `public/fonts/README.md`.

The top-left camera panel switches between fixed stage views and “自由漫游”. Double-click an instrument to enter its close-up. Fixed stage shortcuts are 1–4; instruments retain their own playing and preset keys.

In free mode use WASD or arrow keys for horizontal movement, Q/E to descend/ascend, and Shift for speed. Drag to look around; right-drag or Shift-drag pans. The wheel changes field of view, and two-finger pinch also zooms. “鼠标跟随” optionally locks mouse-look using Three.js PointerLockControls. Escape or leaving mouse lock returns to the stage. “重置漫游” restores the starting position and lens. Touch devices get horizontal and elevation buttons. The camera can cross the audience hall and rise to the galleries, with venue bounds but no instrument collision or gravity. Manual input interrupts an entry transition at the displayed pose.

See [camera ownership and transition behavior](docs/CAMERA_SYSTEM.md).

The band page includes a Bohemian Rhapsody show with lighting, seven-act LED content, authored camera direction and opening/closing titles. Load it from the stage panel and press Play; “作品导播” follows the authored shots, while the manual “灯光全景” view displays the full rig. These modules share song time through the show catalogue. See [演出创作接口](docs/SHOW_AUTHORING.md) and [灯光架构与新增编排](docs/LIGHTING_SYSTEM.md).

## Stage layout

The band and layout editor share the independent `NocturneVenue`, metre-normalized models and the same pure layout solver. Placement uses instance IDs, measured geometry plus performance space, yaw-aware bounds, venue exclusions and saved locks. Failed arrangements are reported without replacing the live scene. MIDI changes reuse existing instances and valid positions; “重新排位” requests a fresh arrangement while respecting locks.

Drop a layout JSON exported by `/studio/layout/` onto `/studio/band/` to apply its exact IDs/transforms and enter live-playing mode. Invalid or conflicting layouts are rejected with a message. Old schema-3 `atelier-studio` documents migrate to `nocturne`; their former implicit 1.5x enlargement becomes explicit instance scale. New layouts use real metres.

The “LED 内容” panel accepts images and silent videos, Canvas animations, text and real audio spectra. `ScreenContent` also accepts external canvas/image surfaces and GPU textures through a common extension point, with independent screen ownership and song/local clocks. The Bohemian example includes the reference's seven-act Canvas theatre, with independent main/wing compositions and manual media overrides. “恢复歌曲画面” restores the selected screens to song time. See [屏幕内容接口](docs/SCREEN_CONTENT.md); offline media support has separate limits described in [视频导出](docs/VIDEO_EXPORT.md).
