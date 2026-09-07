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
    './src/runtime/camera-capture.js',
    './src/runtime/stage-layout.js',
    './src/runtime/shadow-sync.js',
    './src/data/song-library-loader.js',
  ];

  for (const src of sourceOrder) await loadScript(src);
  await window.loadVirtualBandSongs();
  await loadScript('./src/runtime/app.js');
  await loadScript('./src/runtime/camera-runtime-bridge.js');
  await loadScript('./src/runtime/camera-controller.js');
  await loadScript('./src/venues/venue-ui.js');
  await loadScript('./src/venues/venue-loading-overlay.js');
  await nextPaint();
  await loadScript('./src/venues/nocturne-stage-source.js');
  for (let i = 1; i <= 7; i++) {
    await loadScript(`./src/venues/nocturne-stage-source-${String(i).padStart(2, '0')}.js`);
  }
  await loadScript('./src/venues/nocturne-stage-source-finalize.js');
  await loadScript('./src/venues/venue-manager.js');
  await window.VirtualBandVenuesReady;

  await waitForRuntime(
    () => window.VirtualBandCamera?.pose && window.__VIRTUAL_BAND_CAMERA_RUNTIME__?.renderer,
    'Camera v2 runtime',
  );

  await loadScript('./src/venues/nocturne-band-layout.js');
  await loadScript('./src/venues/venue-camera-guard.js');
  await loadScript('./src/venues/nocturne-camera-clearance.js');
  await loadScript('./src/venues/nocturne-independent-clock.js');

  await loadScript('./src/venues/nocturne-auto-show.js');
  await loadScript('./src/venues/nocturne-led-image-test.js');
  await loadScript('./src/venues/nocturne-led-image-test-guard.js');
  await loadScript('./src/venues/nocturne-led-video-test.js');
  await loadScript('./src/venues/nocturne-led-canvas-examples.js');
  await loadScript('./src/venues/nocturne-led-wing-link.js');
  await loadScript('./src/venues/nocturne-agent-lighting-dust.js');
  await loadScript('./src/venues/nocturne-agent-led-dust.js');

  await loadScript('./src/runtime/auto-director.js');
  await loadScript('./src/runtime/agent-camera-arrangements.js');
  await loadScript('./src/runtime/agent-camera-dust-demo.js');
  await loadScript('./src/runtime/playback-camera-toggle.js');

  // Camera unification boundary. Keep the old baked file loaded only as migration input;
  // the new library owns one visible UI and one schema for every venue. Scene views stay
  // scene-local, while instrument views use root-local anchors and therefore cross venues.
  await loadScript('./src/data/camera-preset-config.js');
  await loadScript('./src/data/camera-library-config.js');
  await loadScript('./src/runtime/camera-library.js');
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
