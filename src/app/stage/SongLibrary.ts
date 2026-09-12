import { SHOW_EXAMPLES } from '../../shows/catalog';
import type { ShowDefinition } from '../../shows/ShowDefinition';

export type LibrarySong = NonNullable<ShowDefinition['menu']> & Pick<ShowDefinition, 'id' | 'artist' | 'credit'>;
/** Derived presentation only; add songs in shows/catalog.ts, never maintain a second registry. */
export const SONG_LIBRARY: readonly LibrarySong[] = SHOW_EXAMPLES.flatMap(entry => entry.menu
  ? [{ ...entry.menu, id: entry.id, artist: entry.artist, credit: entry.credit }] : []);
