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

## Current milestone

Phase 1 establishes the runtime boundaries only:

- one Three.js renderer and scene
- one requestAnimationFrame loop
- one Transport state source
- first-class Venue manager
- stable Instrument registry
- one Camera registry and output camera
- Show scheduler plus control ownership arbiter
- React UI that only subscribes to app state

No legacy instruments, NOCTURNE source, MIDI parser, lighting show, LED tests, camera patches, or old UI are loaded yet.

See `docs/ARCHITECTURE_V2.md` for the rules that future work must preserve.
