import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

window.THREE = THREE;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function waitForRuntime(test, label, maxFrames = 600) {
  return new Promise((resolve, reject) => {
    let frames = 0;
    const tick = () => {
      let value = null;
      try { value = test(); } catch {}
      if (value) { resolve(value); return; }
      if (++frames >= maxFrames) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function boot() {
  const sourceOrder = [
    './src/core/core.js',
    './src/instruments/acoustic-guitar.js',
    './src/instruments/bass.js',
    './src/instruments/keyboard.js',
    './src/instruments/drums.js',
    './src/instruments/electric-guitar.js',
    // Capture the actual stage Scene/Camera before app.js starts. This no longer hooks
    // WebGLRenderer.render, because Three.js installs render on renderer instances.
    './src/runtime/camera-capture.js',
    './src/runtime/stage-layout.js',
    './src/runtime/shadow-sync.js',
    './src/data/song-library-loader.js',
  ];

  for (const src of sourceOrder) await loadScript(src);
  await window.loadVirtualBandSongs();
  await loadScript('./src/runtime/app.js');
  // app.js has now created the shared renderer. Bridge it with the captured Scene and
  // Camera, attach the authored camera layer, then import the complete gifted venue
  // before any automatic director starts choosing shots.
  await loadScript('./src/runtime/camera-runtime-bridge.js');
  await loadScript('./src/runtime/camera-controller.js');
  await loadScript('./src/venues/venue-ui.js');
  // Paint a full-screen cover before fetching/decompressing/constructing NOCTURNE so a
  // heavy first mount reads as deliberate loading rather than a frozen page.
  await loadScript('./src/venues/venue-loading-overlay.js');
  await nextPaint();
  await loadScript('./src/venues/nocturne-stage-source.js');
  for (let i = 1; i <= 7; i++) {
    await loadScript(`./src/venues/nocturne-stage-source-${String(i).padStart(2, '0')}.js`);
  }
  await loadScript('./src/venues/nocturne-stage-source-finalize.js');
  await loadScript('./src/venues/venue-manager.js');
  await window.VirtualBandVenuesReady;

  // camera-controller.js attaches on requestAnimationFrame, so script.onload does not
  // guarantee that window.VirtualBandCamera already exists. Wait for the actual Camera
  // v2 API before installing the venue capture handlers; otherwise the guard exits once
  // during startup and left-drag appears completely dead.
  await waitForRuntime(
    () => window.VirtualBandCamera?.pose && window.__VIRTUAL_BAND_CAMERA_RUNTIME__?.renderer,
    'Camera v2 runtime',
  );

  // Re-fit the donated band assets to the actual NOCTURNE stage footprint. This module
  // only applies in venue mode; switching to "无" still restores the original layout.
  await loadScript('./src/venues/nocturne-band-layout.js');

  // Venue mode follows the original CameraRig interaction model: head-look instead of
  // orbit, FOV zoom, and a renderer-level guarantee that every perspective eye stays
  // inside the authored room bounds. Install before the PROGRAM director wraps render.
  await loadScript('./src/venues/venue-camera-guard.js');
  // Prevent performance/detail cameras from slipping behind the main LED wall, where
  // keyboard/drum shots would be physically occluded by the screen hardware.
  await loadScript('./src/venues/nocturne-camera-clearance.js');

  // The authored venue used to advance its fixture/LED clock only when the real host
  // camera reached its renderer bridge. Camera v3.2 often renders a cloned PROGRAM
  // camera, so keep venue animation time alive independently of camera ownership.
  await loadScript('./src/venues/nocturne-independent-clock.js');

  // Music-driven show layer: analyze each MIDI song by bar/beat, move the authored
  // fixtures, react to drum accents, and sequence only NOCTURNE's existing LED presets.
  await loadScript('./src/venues/nocturne-auto-show.js');

  await loadScript('./src/runtime/auto-director.js');
  // Agent-authored timelines sit above the automatic director and can temporarily own
  // the camera for a song while preserving the user's manual override priority.
  await loadScript('./src/runtime/agent-camera-arrangements.js');
  await loadScript('./src/runtime/agent-camera-dust-demo.js');
  // Load the transport-level master last so FIXED can suppress both lower camera layers
  // from the first frame while leaving lighting/LED automation untouched.
  await loadScript('./src/runtime/playback-camera-toggle.js');
}

boot().catch((error) => {
  console.error('[Virtual Band bootstrap]', error);
  window.VirtualBandVenueLoading?.fail?.(error);
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  const panel = document.getElementById('error');
  const message = document.getElementById('error-message');
  if (panel) panel.style.display = 'flex';
  if (message) message.textContent = '项目资源加载失败，请通过本地 HTTP 服务打开并检查网络连接。';
});