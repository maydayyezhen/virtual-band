import { VirtualBandApp } from './app/VirtualBandApp';
import { Sf2Experiment } from './audio/sf2/Sf2Experiment';
import './styles/app.css';

const stageRoot = document.getElementById('stage-root');
if (!stageRoot) throw new Error('Virtual Band V2 stage mount is missing');

const app = new VirtualBandApp({ mount: stageRoot });
await app.start();

if (import.meta.env.DEV) {
  Object.defineProperty(window, 'virtualBandV2', {
    configurable: true,
    value: app,
  });
  Object.defineProperty(window, 'sf2Experiment', {
    configurable: true,
    value: new Sf2Experiment(app.audio, app.violinSf2.synth),
  });
}

console.info('[Virtual Band V2] runtime started');
