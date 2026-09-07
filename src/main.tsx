import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VirtualBandApp } from './app/VirtualBandApp';
import { AppShell } from './ui/AppShell';
import './styles/app.css';

const stageRoot = document.getElementById('stage-root');
const uiRoot = document.getElementById('ui-root');

if (!stageRoot || !uiRoot) throw new Error('Virtual Band V2 mount points are missing');

const app = new VirtualBandApp({ mount: stageRoot });

createRoot(uiRoot).render(
  <StrictMode>
    <AppShell app={app} />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  Object.defineProperty(window, 'virtualBandV2', {
    configurable: true,
    value: app,
  });
}
