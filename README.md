# Virtual Band V2

Clean-slate rebuild of the browser 3D virtual-band project.

The old implementation remains on `nocturne-integrated-fix` and is treated as a reference implementation / asset library. V2 does not inherit its runtime architecture.

## Development

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

Useful checks:

```bash
npm run typecheck
npm run build
```

## Current runtime

V2 now provides:

- one Three.js renderer and scene
- one requestAnimationFrame loop
- one Transport state source
- first-class Venue manager
- stable Instrument registry
- one Camera registry and output camera
- Show scheduler plus control ownership arbiter
- React UI that only subscribes to app state
- playable drums, keyboard, violin, electric guitar, acoustic guitar and four-string electric bass
- a shared native SF2 audio backend with MP3 fallback
- audio calibration and mix-tuning development tools

The old runtime, camera patches, bootstrap chain and UI are not loaded. Reused donor geometry and authored animation behavior remain isolated behind V2 instrument adapters.

See `docs/ARCHITECTURE_V2.md` for the rules that future work must preserve.
