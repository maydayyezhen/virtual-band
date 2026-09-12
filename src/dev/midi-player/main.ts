import { MidiPlayback } from '../../audio/MidiPlayback';

const context = new AudioContext();
const playback = new MidiPlayback(context);
const input = document.querySelector<HTMLInputElement>('#midi-file')!;
const status = document.querySelector<HTMLElement>('#status')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const stop = document.querySelector<HTMLButtonElement>('#stop')!;
const seek = document.querySelector<HTMLInputElement>('#seek')!;
const clock = document.querySelector<HTMLOutputElement>('#clock')!;
let ready = false;

input.addEventListener('change', () => { void load(); });
async function load(): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  ready = false;
  input.disabled = true;
  status.textContent = `正在载入 ${file.name} 和音源…`;
  try {
    // Called from a user gesture; worklet initialization can now process its messages.
    await context.resume();
    await playback.load(await file.arrayBuffer(), file.name);
    ready = true;
    status.textContent = `${file.name} · 已就绪`;
    seek.max = String(playback.total);
  } catch (error) { status.textContent = `载入失败：${String(error)}`; }
  finally { input.disabled = false; update(); }
}
play.addEventListener('click', () => { void playback.play().catch((error) => {
  status.textContent = `播放失败：${String(error)}`;
}); });
pause.addEventListener('click', () => playback.pause());
stop.addEventListener('click', () => playback.stop());
seek.addEventListener('input', () => playback.seek(Number(seek.value)));
const format = (time: number): string => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
function update(): void {
  play.disabled = !ready || playback.isPlaying;
  pause.disabled = !ready || !playback.isPlaying;
  stop.disabled = seek.disabled = !ready;
  if (document.activeElement !== seek) seek.value = String(playback.time);
  clock.textContent = `${format(playback.time)} / ${format(playback.total)}`;
}
const timer = window.setInterval(update, 100);
window.addEventListener('pagehide', () => {
  clearInterval(timer);
  playback.dispose();
  void context.close();
}, { once: true });
if (import.meta.env.DEV) Object.assign(window, { midiPreview: { playback, context } });
