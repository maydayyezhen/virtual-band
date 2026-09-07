export type SongRole = 'keyboard' | 'drums' | 'bass' | 'acoustic' | 'electric' | string;

export interface SongNoteEvent {
  id: string;
  role: SongRole;
  lane?: number;
  note: number;
  velocity: number;
  start: number;
  end: number;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  bpm: number;
  duration: number;
  events: SongNoteEvent[];
}
