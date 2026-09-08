import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioCalibrationApp } from './AudioCalibrationApp';
import './calibration.css';

const root = document.getElementById('audio-calibration-root');
if (!root) throw new Error('Audio calibration mount is missing');

createRoot(root).render(
  <StrictMode>
    <AudioCalibrationApp />
  </StrictMode>,
);
