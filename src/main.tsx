import { VirtualBandApp } from './app/VirtualBandApp';
import { GameAudio } from './audio/GameAudio';
import { LoadingCurtain } from './app/stage/LoadingCurtain';
import './styles/app.css';

const stageRoot = document.getElementById('stage-root');
if (!stageRoot) throw new Error('Virtual Band V2 stage mount is missing');

const curtain = new LoadingCurtain();
const reveal = await curtain.begin('正在唤醒整间乐器库');
const app = new VirtualBandApp({ mount: stageRoot });
const gameAudio = new GameAudio(app.audio, true);
window.addEventListener('pagehide', () => { curtain.dispose(); gameAudio.dispose(); app.dispose(); }, { once: true });
try { await app.start(); await reveal(); }
catch (error) { curtain.fail(); console.error('[Instrument library] loading failed', error); }

if (import.meta.env.DEV) {
  Object.defineProperty(window, 'virtualBandV2', {
    configurable: true,
    value: app,
  });
  Object.defineProperty(window, 'gameAudio', { value: gameAudio, configurable: true });
}

console.info('[Virtual Band V2] runtime started');
