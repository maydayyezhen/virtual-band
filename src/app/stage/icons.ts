import play from '../../assets/ui-icons/play.svg?raw';
import pause from '../../assets/ui-icons/pause.svg?raw';
import library from '../../assets/ui-icons/library.svg?raw';
import back from '../../assets/ui-icons/arrow-left.svg?raw';
import up from '../../assets/ui-icons/arrow-up.svg?raw';
import down from '../../assets/ui-icons/arrow-down.svg?raw';
import volume from '../../assets/ui-icons/volume-2.svg?raw';
import muted from '../../assets/ui-icons/volume-x.svg?raw';
import upload from '../../assets/ui-icons/upload.svg?raw';
import enter from '../../assets/ui-icons/corner-down-left.svg?raw';
import settings from '../../assets/ui-icons/sliders-horizontal.svg?raw';
import stop from '../../assets/ui-icons/square.svg?raw';

// Original Lucide SVGs, vendored with their license in assets/ui-icons/LICENSE.
const icons = { play, pause, library, back, up, down, volume, muted, upload, enter, settings, stop };
export type GameIcon = keyof typeof icons;
export function gameIcon(name: GameIcon): string {
  return icons[name].replace('<svg', '<svg class="game-icon" aria-hidden="true" focusable="false"');
}
