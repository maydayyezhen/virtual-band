import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { audioMixDevPlugin } from './tools/audioMixDevPlugin';

export default defineConfig({
  plugins: [react(), audioMixDevPlugin()],
  build: {
    rollupOptions: {
      input: [
        'index.html',
        'assets/instruments/index.html',
        'assets/venues/index.html',
        'assets/venues/nocturne/index.html',
        'studio/layout/index.html',
        'tools/audio/calibration/index.html',
        'tools/audio/mix/index.html',
        // Compatibility entry points for old local URLs.
        'layout.html',
        'calibration.html',
        'mix.html',
      ],
    },
  },
});
