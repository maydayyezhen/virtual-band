# Virtual Band Architecture v2

## Goal

Build a clean runtime architecture without rewriting the working instruments or donated NOCTURNE stage in one shot.

The v2 branch keeps the current product usable while progressively moving ownership out of ad-hoc patches and DOM coupling.

## Core principles

1. **One runtime root**
   - Scene, renderer, host camera, instruments, transport and venue state are exposed through one runtime object.
   - New systems consume runtime APIs instead of discovering private state through monkey patches.

2. **One transport clock**
   - Playback time, play/pause/seek and active song come from a transport service.
   - UI, camera, lighting and LED consume the same clock.
   - DOM progress is presentation only, never a timing source.

3. **One camera registry**
   - Scene/stage views are scoped to a venue.
   - Instrument views are root-local and shared across venues.
   - Manual camera, editor, Auto Director and Agent Camera all resolve views from the same registry.

4. **First-class venues**
   - `none`, `nocturne` and future venues implement the same minimal venue contract.
   - Venue code may register stage views, layout and show capabilities, but must not own camera UI.

5. **Explicit show ownership**
   - Camera, lighting and LED have explicit owners/priorities.
   - Higher-priority layers acquire a channel instead of repeatedly overwriting lower-priority state.

6. **One song analysis layer**
   - MIDI analysis is shared by Camera, Lighting and LED.
   - Song-specific arrangements may add art direction, but should reuse common timing/energy/role analysis.

7. **UI is a client of runtime state**
   - Runtime modules do not independently inject competing camera/show controls into the same panel.
   - UI components render from shared state and invoke public commands.

## Target runtime shape

```text
VirtualBandRuntime
├── transport
│   ├── time
│   ├── duration
│   ├── playing
│   ├── song
│   ├── play / pause / seek
│   └── events
├── renderer
├── scene
├── camera
├── instruments
├── venues
│   ├── current
│   ├── registry
│   └── switch(id)
├── cameras
│   ├── registry
│   ├── controller
│   └── director
└── show
    ├── analysis
    ├── ownership
    ├── lighting
    └── led
```

## Migration order

### Phase 1 — Runtime boundary

Introduce `VirtualBandRuntime` as a stable facade over the existing app.

Do not change rendering behavior yet.

Move consumers away from:
- Scene/Camera discovery hooks
- renderer discovery through classic-script scope
- DOM-derived playback time

### Phase 2 — Transport

Expose the real playback clock and events.

Migrate:
- Auto Show
- Agent Lighting
- Agent LED
- Auto Director
- Agent Camera

away from `#bp-progress.style.width` timing.

### Phase 3 — Camera

Create a single camera registry and resolver.

Migrate:
- Camera v2 system views
- venue stage views
- user scene views
- root-local instrument views
- Auto Director view selection
- Agent Camera cues

Normal UI and editor become two clients of the same registry.

### Phase 4 — Venue contract

Make `none` and `nocturne` first-class venue descriptors.

A venue can provide:
- id / label
- mount / unmount
- layout
- stage camera views
- lights/screens/haze capabilities
- optional update(dt)

NOCTURNE source adapter remains frozen during this phase; only its boundary changes.

### Phase 5 — Show ownership

Introduce channel ownership:

```text
camera   manual > agent > auto
lighting manual > song-agent > auto
led      manual-media > song-agent > auto
```

Remove re-assert/guard loops where possible.

### Phase 6 — Shared song analysis

Move repeated MIDI analysis into one service consumed by all show systems.

## Migration rules

- No big-bang rewrite.
- No merge back to `nocturne-integrated-fix` unless explicitly approved.
- Keep existing instruments and model code working during every phase.
- Preserve NOCTURNE authored visuals and controls.
- Prefer adapters around legacy code before replacing it.
- Each phase should end with a runnable browser build.
- New v2 systems must have one clear owner and one public API.

## First implementation milestone

The first code milestone is intentionally small:

```text
VirtualBandRuntime
  renderer
  scene
  camera
  instruments
  transport snapshot + events
```

Once this exists, later Camera/Venue/Show cleanup can migrate onto it incrementally instead of creating more patches.
