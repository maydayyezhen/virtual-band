import * as THREE from 'three';
import { DustLightingDirector, type DustLightingStatus, type LightingStage } from './lighting/DustLightingDirector';
import dustMidiUrl from './lighting/dust.json.gz?url';
import sourcePart01 from './source/nocturne-stage-source-01.js?raw';
import sourcePart02 from './source/nocturne-stage-source-02.js?raw';
import sourcePart03 from './source/nocturne-stage-source-03.js?raw';
import sourcePart04 from './source/nocturne-stage-source-04.js?raw';
import sourcePart05 from './source/nocturne-stage-source-05.js?raw';
import sourcePart06 from './source/nocturne-stage-source-06.js?raw';
import sourcePart07 from './source/nocturne-stage-source-07.js?raw';

const SOURCE_LENGTH = 127_767;
const sourceParts = [sourcePart01, sourcePart02, sourcePart03, sourcePart04, sourcePart05, sourcePart06, sourcePart07];

declare global {
  interface Window {
    THREE: typeof THREE;
    stage?: LightingStage;
    stageReady?: Promise<LightingStage>;
    dustLighting?: DustLightingDirector;
  }
}

async function decodeSource(): Promise<string> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器不支持 DecompressionStream');
  }

  const base64 = sourceParts.map(extractChunk).join('');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  if (source.length !== SOURCE_LENGTH) {
    throw new Error(`NOCTURNE source length mismatch: ${source.length}`);
  }
  return source;
}

function extractChunk(moduleSource: string): string {
  const match = moduleSource.match(/\.push\('([A-Za-z0-9+/=]+)'\);?/);
  if (!match) throw new Error('NOCTURNE source chunk is malformed');
  return match[1];
}

function patchForAssetViewer(source: string): string {
  if (!source.includes('          bindUI(app);')) {
    throw new Error('NOCTURNE UI bootstrap marker is missing');
  }
  return source.replace(
    '          bindUI(app);',
    '          // Venue Asset Library owns the thin overlay UI.',
  );
}

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function updateDustStatus(status: DustLightingStatus): void {
  const statusNode = document.getElementById('dustStatus');
  if (statusNode) {
    statusNode.textContent = `${formatTime(status.time)} / ${formatTime(status.duration)} · bar ${status.bar + 1} · ${status.cue} · ${status.focus}`;
  }
  const playButton = document.getElementById('dustPlay') as HTMLButtonElement | null;
  if (playButton) {
    playButton.textContent = status.playing ? '暂停 Dust' : '播放 Dust';
    playButton.classList.toggle('active', status.playing);
  }
}

function bindAssetControls(stage: LightingStage, director: DustLightingDirector): void {
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      director.stop(false);
      stage.setDemo(false);
      const mode = button.dataset.mode ?? 'nocturne';
      stage.setStageMode(mode);
      for (const candidate of modeButtons) candidate.classList.toggle('active', candidate === button);
    });
  }

  const dustPlay = document.getElementById('dustPlay') as HTMLButtonElement | null;
  dustPlay?.addEventListener('click', () => {
    for (const candidate of modeButtons) candidate.classList.remove('active');
    if (director.isPlaying) director.pause();
    else director.play();
  });

  const dustRestart = document.getElementById('dustRestart') as HTMLButtonElement | null;
  dustRestart?.addEventListener('click', () => {
    for (const candidate of modeButtons) candidate.classList.remove('active');
    director.restart(true);
  });

  const demoToggle = document.getElementById('demoToggle') as HTMLButtonElement | null;
  demoToggle?.addEventListener('click', () => {
    director.stop(false);
    if (stage.demo) {
      stage.setDemo(false);
    } else {
      stage.setStageMode('nocturne');
      stage.setDemo(true);
    }
    if (demoToggle) demoToggle.textContent = stage.demo ? '停止演示' : '开始演示';
  });

  const pauseToggle = document.getElementById('pauseToggle') as HTMLButtonElement | null;
  pauseToggle?.addEventListener('click', () => {
    stage.setPaused(!stage.paused);
    if (pauseToggle) pauseToggle.textContent = stage.paused ? '继续动画' : '冻结动画';
  });
}

async function createDustDirector(stage: LightingStage): Promise<DustLightingDirector> {
  const nativeFetch = window.fetch.bind(window);
  const routedFetch: typeof window.fetch = (input, init) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (requested === '/nocturne-lighting/dust.json.gz' || requested.endsWith('/nocturne-lighting/dust.json.gz')) {
      return nativeFetch(dustMidiUrl, init);
    }
    return nativeFetch(input, init);
  };

  window.fetch = routedFetch;
  try {
    return await DustLightingDirector.create(stage, updateDustStatus);
  } finally {
    window.fetch = nativeFetch;
  }
}

async function start(): Promise<void> {
  window.THREE = THREE;
  const source = await decodeSource();
  Function(patchForAssetViewer(source))();
  if (!window.stageReady) throw new Error('NOCTURNE stageReady was not created');
  const stage = await window.stageReady;

  const director = await createDustDirector(stage);
  window.dustLighting = director;
  bindAssetControls(stage, director);
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.classList.remove('active'));
  director.play();
  document.getElementById('viewport')?.focus();
}

start().catch((error) => {
  console.error('[Venue Asset / NOCTURNE]', error);
  const note = document.getElementById('loadingNote');
  if (note) note.textContent = `场景未能启动：${error instanceof Error ? error.message : String(error)}`;
  const line = document.querySelector<HTMLElement>('.loading-line');
  if (line) line.style.display = 'none';
});
