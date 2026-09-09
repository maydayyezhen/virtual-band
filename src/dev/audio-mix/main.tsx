import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioMixTunerApp } from './AudioMixTunerApp';
import './audio-mix-tuner.css';

const root = document.getElementById('root');
if (!root) throw new Error('Audio mix tuner root is missing');

createRoot(root).render(
  <StrictMode>
    <AudioMixTunerApp />
  </StrictMode>,
);
