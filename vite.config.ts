import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { audioMixDevPlugin } from './tools/audioMixDevPlugin';

export default defineConfig({
  plugins: [react(), audioMixDevPlugin()],
  build: {
    rollupOptions: {
      input: ['index.html', 'calibration.html', 'mix.html'],
    },
  },
});
