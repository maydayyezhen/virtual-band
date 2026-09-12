import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { loadCatalog, checkAssets, root } from './lib/show-catalog.mjs';

const api = await loadCatalog();
const index = process.argv.indexOf('--song');
if (index >= 0 && !process.argv[index + 1]) throw new Error('--song 缺少作品 ID');
const entries = index >= 0 ? [api.getShow(process.argv[index + 1])] : api.SHOW_EXAMPLES;
assert.equal(new Set(api.SHOW_EXAMPLES.map(s => s.id)).size, api.SHOW_EXAMPLES.length, 'Duplicate show IDs');
assert(api.SONG_LIBRARY.length > 0, 'The game needs at least one published song');
assert.deepEqual(api.SONG_LIBRARY.map(s => s.id), api.SHOW_EXAMPLES.filter(s => s.menu).map(s => s.id));
// Captured NOCTURNE hardware descriptors; browser verification still checks the actual venue/models.
const { rig } = JSON.parse(await fs.readFile(join(root, 'scripts/fixtures/bohemian-show-baseline.json'), 'utf8'));
for (const entry of entries) {
  const { bytes } = await checkAssets(entry);
  const music = new api.MusicAnalysis(bytes), analysis = api.analyzeMidi(bytes);
  assert(music.duration > 0 && analysis.plan.totalInstruments > 0, `${entry.id}: empty MIDI`);
  assert(entry.title && entry.artist && entry.credit, `${entry.id}: missing credits`);
  assert(typeof entry.offline?.supported === 'boolean', `${entry.id}: declare offline support`);
  if (!entry.offline.supported) assert(entry.offline.reason?.trim(), 'Explain offline limitations');
  if (entry.menu) {
    const m = entry.menu;
    assert(m.title && /^\d+:\d{2}$/.test(m.duration), `${entry.id}: invalid menu metadata`);
    const [minutes, seconds] = m.duration.split(':').map(Number);
    assert(seconds < 60 && Math.abs(minutes * 60 + seconds - music.duration) < 2, `${entry.id}: duration label differs from MIDI`);
    assert(Number.isFinite(m.previewAt) && m.previewAt >= 0 && Number.isFinite(m.previewSeconds) && m.previewSeconds > 0 && m.previewAt + m.previewSeconds <= music.duration, `${entry.id}: invalid preview range`);
  }
  const show = entry.prepare(music, rig);
  assert(show.screens?.create && show.lighting?.evaluate && show.camera && show.titles, `${entry.id}: all four tracks are required`);
  assert(show.camera.cues.length > 0, `${entry.id}: no camera cues`);
  assert(Math.abs(show.camera.duration - music.duration) < .1, 'Camera duration differs from MIDI');
  for (const [i, cue] of show.camera.cues.entries()) {
    assert(Number.isFinite(cue.time) && cue.time >= 0 && cue.time <= music.duration && (!i || cue.time > show.camera.cues[i - 1].time), `${entry.id}: invalid cue ordering`);
  }
  assert.deepEqual(api.validateCameraPerformance(show.camera, analysis.plan), [], `${entry.id}: inactive closeups or long rests`);
  for (const cue of show.titles.cues) assert(cue.start >= 0 && cue.end > cue.start && cue.end <= music.duration + .1 && cue.title && cue.artist && cue.credit, `${entry.id}: invalid title cue`);
  const times = [...new Set([0, music.duration / 2, music.duration, ...show.camera.cues.map(c => c.time)])];
  const frames = times.map(t => structuredClone(show.lighting.evaluate(t)));
  for (let i = times.length - 1; i >= 0; i--) assert.deepEqual(show.lighting.evaluate(times[i]), frames[i], `${entry.id}: lighting depends on evaluation order`);
  console.log(JSON.stringify({ id: entry.id, duration: music.duration, instruments: analysis.plan.totalInstruments,
    cameraCues: show.camera.cues.length, published: !!entry.menu, offline: entry.offline.supported, status: 'passed' }));
}
