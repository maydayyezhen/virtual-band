# Bohemian Rhapsody Showcase

This branch is intentionally a **small finished-piece branch**, not an architecture exercise.

Goal: turn the existing NOCTURNE / Bohemian Rhapsody demo into a complete browser performance by placing the project's procedural instruments on stage and driving their visible playing animation from the MIDI timeline.

## Scope

- Keep the existing NOCTURNE stage and build a song-specific Queen performance on top of it.
- Reuse the project's existing playable instrument implementations instead of rebuilding simplified props.
- Put a practical Queen-style band on stage: drums, bass, electric guitar and keyboard.
- MIDI playback is the clock. Instrument `noteOn` / `noteOff` events are driven from the same timeline so visible performance, lighting and audio stay aligned.
- Favor visual payoff over reusable architecture. Direct adapters and song-specific mappings are welcome on this branch.
- Do not refactor the V2 runtime merely to make this showcase cleaner.

## Playable milestone

Current entry:

```text
/assets/showcase/bohemian/
```

The page now provides:

1. The actual project drum kit, electric bass, electric guitar and dual-tier keyboard placed directly in NOCTURNE.
2. The embedded 51 KB public Bohemian Rhapsody MIDI parsed with its real tempo map.
3. Full score routing: drums -> drum kit, bass -> bass, GM guitar -> electric guitar, piano -> lower keyboard, choir/strings/other lead material -> upper keyboard.
4. Existing instrument animation APIs drive the physical keys, drum pieces, strings and fret/fingering state. There is no fake overlay animation.
5. The instrument samplers provide the audible performance through the shared SF2 bank / existing project audio system.
6. Eleven song chapters derived from the standalone Bohemian lighting piece drive NOCTURNE camera framing and lighting palettes.
7. The LED triptych is now score-aware: chapter, song progress and live role activity are rendered procedurally.
8. Play / pause / restart / seek and chapter jumps all use the same MIDI timeline.

### MIDI tail repair

The source MIDI contains percussion note-offs hundreds of seconds after the real music ends. Those events are valid enough to parse but must not define the show duration. Percussion releases are therefore capped for presentation purposes and duration is derived from the musical note tail. The resulting performance is about 5:31 instead of roughly 17 minutes.

## Next polish pass

The next work is deliberately visual rather than architectural: tune stage placement after seeing it in-browser, improve song-specific camera cuts, make guitar/bass performance read more clearly in close shots, and decide whether the opera section should keep the four physical instruments visible or temporarily let the LED theatre dominate.

This branch may be messy internally as long as the final performance is coherent, scrub-friendly and fun to watch.
