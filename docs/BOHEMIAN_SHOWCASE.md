# Bohemian Rhapsody Showcase

This branch is intentionally a **small finished-piece branch**, not an architecture exercise.

Goal: turn the existing NOCTURNE / Bohemian Rhapsody demo into a complete browser performance by placing the project's procedural instruments on stage and driving their visible playing animation from the MIDI timeline.

## Scope

- Keep the existing NOCTURNE stage, lighting, LED story screens, player and camera choreography.
- Reuse the project's existing playable instrument implementations instead of rebuilding simplified props.
- Put a practical Queen-style band on stage: drums, bass, electric guitar and keyboard first. Extra acoustic / violin parts are optional only when the MIDI arrangement actually benefits from them.
- MIDI playback is the clock. Instrument `noteOn` / `noteOff` events are driven from the same timeline so visible performance, lighting and audio stay aligned.
- Favor visual payoff over reusable architecture. Direct adapters and song-specific mappings are welcome on this branch.
- Do not refactor the V2 runtime merely to make this showcase cleaner.

## First milestone

1. Place drums, bass, electric guitar and keyboard in the NOCTURNE stage.
2. Map MIDI tracks/roles to those four instruments.
3. Drive `noteOn` / `noteOff` during play, seek, restart and pause.
4. Add simple performance staging: keyboard key motion, drum hits/cymbal motion, bass fret/string motion and electric-guitar fret/string motion.
5. Then tune camera blocking and lighting around the visible performers.

This branch may be messy internally as long as the final performance is coherent, scrub-friendly and fun to watch.
