# MIDI playback

## Ownership

```text
Original MIDI bytes ──> SpessaSynth Sequencer + WorkletSynthesizer ──> audio
                                  │
                                  └── playback time
                                         │
@tonejs/midi ──> visual band plan ──> VisualPerformance ──> silent instrument animations
```

`src/audio/MidiPlayback.ts` is a small lifecycle/transport adapter. SpessaSynth handles file events, tempo maps, channel state, program/bank changes, controllers, pitch bend, SoundFont parsing, effects and synthesis. We do not reconstruct an audio score or schedule sound from requestAnimationFrame.

SpessaSynth is pinned to 4.3.14; its core version is locked by package-lock.json. Vite imports the worklet with `?url`, so the production worklet always comes from the same installed package. No copied vendor files or CDN dependency.

`/tools/audio/player/` uses the adapter without Three.js. `/studio/band/` connects it to the existing master bus. Legacy mix calibration profiles apply only to the experimental old samplers. Neither runtime MIDI playback nor free play uses those profiles.

`BandPlayer` and `VisualPerformance` affect visuals only. Short tracks are retained. Visual release events are ordered before attacks at the same timestamp; overlapping notes have distinct identities. Slow rendering skips expired gestures without resetting a still-held pose each frame. Models can still simplify or omit physically impossible fingerings, but audio remains intact.

## Free play and instance ownership

`SpessaSynthEngine` owns worklet and SoundFont initialization for both paths. `LiveAudioEngine` uses one shared live synthesizer; the sequencer uses a separate synthesizer so song resets and SysEx cannot overwrite user-held notes. Both connect to the host's existing master bus.

`InstrumentAudio` contains small, implementation-independent ports. Models report keys/strings/gestures through those ports. `LiveInstrumentAudio` converts them into MIDI commands: independent channels per keyboard tier and string, GM percussion for drums, and program 45 for pizzicato. SpessaSynth owns sample playback, envelopes, sustain and pitch bend. Pluck/strum gestures ring after pointer-up, with a bounded release timeout. GM has no pickup selector; the existing electric pickup control maps approximately to CC74 brightness. The old custom DSP/effects and mix calibration curves are not reproduced.

Channel leases are recycled on removal with explicit controller defaults; queued/released gestures cannot fire after loading or disposal. Sound release looks at live audio ownership, not the animated model's current fingering. `VisualPerformance.clear()` releases only its score poses, so pause/seek never resets live audio.

`InstrumentDefinitions` is the single type catalog for model creation, live audio, camera templates and interaction modes. `createInstrumentInstance({ id: 'keyboard.2', type: 'keyboard' }, liveAudio)` creates another independently disposable instance. The host registers all instances and builds presentation from that list. IDs must be unique and assigned before registration. A new instrument *type* still requires its model, port adapter and authored interaction/views.

`InstrumentRegistry.ownerOf(mesh)` resolves the registered root. Picking does not trust copied `userData.instrumentId` tags. Camera templates are cloned and rebound to each instance's ID; presentation modes also have per-instance IDs. No first-of-type camera special case remains in the band viewer.

## Native behavior and limits

- After a blocked main thread resumes, queued native sync messages can briefly make the displayed clock lag behind audio. Chrome regression checks require it to recover within 2.5 seconds with the original 0.2-second tolerance; no second application clock is added.
- Pause/resume uses the library's held-note retrigger behavior. It is not sample-exact continuation of the old envelope.
- Seeking restores tempo, programs and controllers and plays subsequent events. **SpessaSynth 4.3.14 does not chase/re-trigger notes whose Note On preceded the target.** A seek into a held chord can therefore be silent until the next attack. Visuals show the score's held pose. We deliberately do not add a second audio event engine to conceal this limitation. Any future chase support should be a library-supported change with sustain/overlap tests.
- Standard sequential playback preserves the source file's controls and note durations; exact sound still depends on the SoundFont and engine compatibility. This is not a claim of complete GM/GS/XG conformance.
- The old samplers and custom SF2 DSP remain only in development/calibration tools. Free play uses the same SpessaSynth initialization and SoundFont as MIDI playback.
- Visual analysis still uses a reduced note model and does not animate every controller. Multi-port MIDI may have richer routing than the current six-instrument display.

## Verification

`npm run midi:verify` covers visual time-zero attacks, long holds, seek/resume poses, repeated pitch, overlapping pitch and slow frames.

`npm run midi:browser` uses Google Chrome and actual AudioWorklet output. It verifies zero-time audio, pause clock, resumed audio, controller restoration after seeking, audio continuity and transport resynchronization after a blocked main thread, stop, replacement, completion and replay. It does **not** count reverb tail energy as proof of note chasing.

`node scripts/verify-band-browser.mjs` verifies all six visual APIs with sampler Note On calls trapped, one-note tracks, stage playback/pause and reloading with disposal. Browser checks need a running Vite server and Playwright available via `PLAYWRIGHT_MODULE` or normal module resolution.

`npm run live:browser` verifies all six real sounds, duplicate-keyboard double-click and computer-key input, live/MIDI isolation, controller defaults and channel recycling in Chrome.

The renderer/editor prototype patches were removed while restoring the typecheck/build baseline. RendererHost exposes one owned scene render pass; layout panning takes an explicit camera target and returns a cleanup function.

## Upstream references

- [Sequencer](https://spessasus.github.io/spessasynth_lib/sequencer/)
- [WorkletSynthesizer](https://spessasus.github.io/spessasynth_lib/synthesizer/worklet-synthesizer/)
- [Source and Apache-2.0 license](https://github.com/spessasus/spessasynth_lib)
