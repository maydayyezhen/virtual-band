import { useSyncExternalStore } from 'react';
import type { VirtualBandApp } from '../app/VirtualBandApp';

function formatTime(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AppShell({ app }: { app: VirtualBandApp }) {
  const snapshot = useSyncExternalStore(app.state.subscribe, app.state.getSnapshot, app.state.getSnapshot);

  return (
    <div className="ui-shell">
      <header className="brand-lockup">
        <strong>VIRTUAL BAND</strong>
        <span>V2 CORE</span>
      </header>

      <section className="runtime-card" aria-label="V2 runtime status">
        <div className="runtime-card__title">
          <span className={snapshot.running ? 'status-dot status-dot--live' : 'status-dot'} />
          <div>
            <small>RUNTIME</small>
            <strong>{snapshot.running ? 'Clean core online' : 'Stopped'}</strong>
          </div>
        </div>
        <dl>
          <div><dt>Venue</dt><dd>{snapshot.venueId ?? '—'}</dd></div>
          <div><dt>Transport</dt><dd>{snapshot.transport.status} · {formatTime(snapshot.transport.time)}</dd></div>
          <div><dt>Instruments</dt><dd>{snapshot.counts.instruments}</dd></div>
          <div><dt>Camera views</dt><dd>{snapshot.counts.cameraViews}</dd></div>
          <div><dt>Show cues</dt><dd>{snapshot.counts.showCues}</dd></div>
        </dl>
      </section>
    </div>
  );
}
