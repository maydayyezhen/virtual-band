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

async function boot() {
  const sourceOrder = [
    './src/core/core.js',
    './src/instruments/acoustic-guitar.js',
    './src/instruments/bass.js',
    './src/instruments/keyboard.js',
    './src/instruments/drums.js',
    './src/instruments/electric-guitar.js',
    './src/data/song-library-loader.js',
  ];

  for (const src of sourceOrder) await loadScript(src);
  await window.loadVirtualBandSongs();
  await loadScript('./src/runtime/app.js');
  await loadScript('./src/runtime/shadow-sync.js');
}

boot().catch((error) => {
  console.error('[Virtual Band bootstrap]', error);
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  const panel = document.getElementById('error');
  const message = document.getElementById('error-message');
  if (panel) panel.style.display = 'flex';
  if (message) message.textContent = '项目资源加载失败，请通过本地 HTTP 服务打开并检查网络连接。';
});
