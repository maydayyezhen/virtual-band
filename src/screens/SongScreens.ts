import type { ScreenContent } from './ScreenContent';
import type { ScreenSession } from './ScreenSession';

/** Application-level song ownership. Manual replacements survive unloading a song. */
export class SongScreens {
  content: ScreenContent | null = null;
  constructor(private readonly session: ScreenSession) {}
  async setShow(content: ScreenContent | null): Promise<void> {
    const previous = this.content;
    const owned = this.session.port.screens.filter(s => previous && this.session.hasContent(s.id, previous)).map(s => s.id);
    if (owned.length) this.session.restore(owned);
    this.content = content;
    if (content) await this.restore();
  }
  async restore(ids = this.session.port.screens.map(s => s.id)): Promise<void> {
    if (this.content) await this.session.setContent(ids, this.content, { clock: 'song', playing: true, brightness: .78 });
  }
}
