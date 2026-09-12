# Band camera system

`/studio/band/` is the main integration surface. The instrument library reuses the same orbit implementation, while the layout editor remains an independent authoring tool.

## Ownership

- `CameraRegistry` stores authored poses in world or instance-local coordinates.
- `CameraSystem` resolves poses and owns finite transitions. Cubic spatial paths use quintic progress, interpolate lens magnification, and end at an exact pose. Long moves lift above the measured band; opposing viewpoints have a lateral bypass to avoid crossing the look-at pole. Paths and endpoints stay within the venue volume. Interrupted moves start from the currently displayed pose. Reduced-motion users get immediate switches.
- `OrbitController` handles manual orbit, pan, zoom and local/world conversion for the stage and all six instrument modes. Those modes retain their musical gestures, not copies of camera interpolation. Named transitions pause orbit writes; on completion the orbit adopts the displayed camera. Untouched stage presets remain named so viewport changes can reframe them. Manual input explicitly takes ownership.
- `StageDirector` has four states: band, one instrument instance, audience, or broadcast. It updates the camera transition, then the one active controller; broadcast poses come from the song-time `CameraShowPlayer`. Manual camera input relinquishes broadcast ownership immediately. See [Bohemian direction](BOHEMIAN_DIRECTION.md).
- `FreeCameraController` replaces the old grounded `AudienceController`. It uses the installed Three.js `PointerLockControls` for optional locked mouse-look and horizontal movement. Unlocked drag/pan, Q/E elevation and FOV zoom follow the supplied NOCTURNE/Queen reference's free-camera controls. It has no scene-root, instrument-registry, audio or UI dependency. Blur, hidden-page, mode exit and pointer-lock exit clear input. No extra dependency or physics engine is introduced.
- `BandCameraPanel` issues commands and shows state. It never changes camera transforms.

## Movement and limits

WASD/arrows move horizontally regardless of pitch; E raises and Q lowers the camera. Normal speed is 6 m/s; Shift raises it to 15 m/s, with normalized three-axis diagonal input and immediate stop on release. Drag grabs the scene (0.0035 rad/pixel, pitch limited to ±86.4°). Right-drag/Shift-drag pans in camera-right/world-up axes. Wheel zoom changes FOV (28–100°, 0.035° per pixel), not camera distance; two-finger pinch also changes FOV. Optional locked mouse-look uses conventional FPS direction.

The venue volume now includes the audience hall and galleries: X ±28.4 m, Z −8…57 m, maximum Y 20.5 m. Free movement keeps Y ≥1.7 m. These dimensions were checked against the embedded NOCTURNE geometry; the rear bound remains in front of the opaque stage LED wall. There is no instrument-footprint blocking or gravity. Initial height remains 1.65 m above the stage floor; it is a starting pose, not a height constraint. The camera can pass through interior props, as in the reference.

Entering restores the last free pose, orientation and lens; reset returns to the starting view. Movement, dragging or zooming can interrupt the entry transition immediately. Free mode remains the `audience` state in `StageDirector`; the panel name is “自由漫游”. Fixed orbit views remain a separate mode. The reference's automatic show camera is not imported.

Camera paths are authored smooth transfers with height clearance, not general 3D obstacle pathfinding. Geometry already occupying an endpoint or an extreme user-defined framing can still need a better authored preset. Interrupted transfers preserve position, but do not promise velocity continuity across arbitrary repeated retargets.

## Verification

`npm run camera:browser` runs in Google Chrome against a running Vite server. It checks fixed-view completion without snapback, per-frame position/orientation continuity, venue bounds, rapid retargets, showcase entry/preset/exit, horizontal and vertical movement, normalized diagonal speed, Shift speed, full-hall reach, drag/pan/FOV, restored/reset poses, interrupted entry, native pointer lock, input release on blur/Escape, reduced motion, and narrow-screen controls.

`npm run live:browser` checks that both same-type instances still pick/focus/play independently after the shared camera migration. Typecheck/build and layout verification remain required.
