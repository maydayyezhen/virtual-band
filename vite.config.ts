import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { audioMixDevPlugin } from './tools/audioMixDevPlugin';

const DUST_VIRTUAL_ID = 'virtual:nocturne-dust-midi';
const DUST_RESOLVED_ID = '\0virtual:nocturne-dust-midi';
const DUST_MIDI_PATH = fileURLToPath(new URL('./src/assets/venues/nocturne/lighting/dust.json.gz', import.meta.url));

function nocturneDustMidiPlugin(): Plugin {
  return {
    name: 'nocturne-dust-midi',
    resolveId(id) {
      return id === DUST_VIRTUAL_ID ? DUST_RESOLVED_ID : null;
    },
    load(id) {
      if (id !== DUST_RESOLVED_ID) return null;
      const base64 = readFileSync(DUST_MIDI_PATH).toString('base64');
      return `export default ${JSON.stringify(base64)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), audioMixDevPlugin(), nocturneDustMidiPlugin()],
  build: {
    rollupOptions: {
      input: [
        'index.html',
        'assets/instruments/index.html',
        'assets/venues/index.html',
        'assets/venues/nocturne/index.html',
        'studio/layout/index.html',
        'studio/band/index.html',
        'studio/cello/index.html',
        'tools/audio/calibration/index.html',
        'tools/audio/mix/index.html',
        'tools/audio/player/index.html',
        // Compatibility entry points for old local URLs.
        'layout.html',
        'calibration.html',
        'mix.html',
      ],
    },
  },
});
