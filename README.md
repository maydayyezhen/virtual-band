# Virtual Band

Browser-based 3D MIDI virtual band, split from the v24 single-file prototype.

## Current scope

This first project split intentionally preserves the v24 runtime behavior instead of redesigning it:

- procedural Three.js instrument models
- built-in song library and universal MIDI import
- song / free-play / practice modes
- multi-channel electric guitar routing
- MusyngKite SoundFont audio via `smplr` (online)
- ABCJS percussion samples (online)

## Project layout

```text
index.html
styles/{base,player,practice}.css
assets/songs/                  # exact v24 built-in song data, gzip-compressed JSON
src/bootstrap.mjs              # loads pinned Three.js and project scripts
src/core/core.js
src/instruments/
  acoustic-guitar.js
  bass.js
  keyboard.js
  drums.js
  electric-guitar.js
src/data/song-library-loader.js
src/runtime/app.js
docs/stage-rig-api.txt
THIRD_PARTY_NOTICES.md
```

The original single-file runtime is separated into shared core utilities, one source file per instrument family, runtime/application logic, CSS, and generated song-data assets. The split is intentionally conservative: model geometry, controller behavior, MIDI routing and practice logic stay aligned with v24.

## Run locally

Use a local static server rather than opening `index.html` directly:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`.

This version still requires Internet access for the pinned Three.js module, `smplr`, MusyngKite SoundFonts and percussion samples. Audio assets can be localized later without changing the project split.

## Built-in song data

The five built-in songs are stored as exact gzip-compressed JSON snapshots of the v24 event objects. They are decompressed in the browser with `DecompressionStream` before the runtime starts. This keeps the repository much smaller without changing the event/timing data.

## Source baseline

Refactored from `3d-band-song-library-practice-v24-electric-multichannel-modes.html`.
