import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMidiAudio } from './offline/render-midi-audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
const width = 1920, height = 1080, fps = Number(arg('fps', '60'));
const start = Number(arg('start', '0')), requestedDuration = Number(arg('duration', '0'));
assert.ok([30, 60].includes(fps) && Number.isFinite(start) && start >= 0 && Number.isFinite(requestedDuration) && requestedDuration >= 0, 'invalid export range/fps');
const output = resolve(root, arg('output', `exports/bohemian-rhapsody-yezhen-1080p${fps}.mp4`));
assert.equal(output.toLowerCase().endsWith('.mp4'), true);
try { await fs.access(output); throw new Error(`输出已存在，请换一个文件名：${output}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await fs.mkdir(dirname(output), { recursive: true });
const work = await fs.mkdtemp(join(dirname(output), '.bohemian-export-'));
const video = join(work, 'video.h264'), wav = join(work, 'audio.wav'), partial = join(work, 'result.mp4');
const baseURL = arg('url', 'http://localhost:5173');
const token = randomUUID();
let written = 0;
const videoFile = await fs.open(video, 'wx');
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', new URL(baseURL).origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.url !== `/${token}`) { res.writeHead(404).end(); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  try {
    for await (const chunk of req) {
      let offset = 0;
      while (offset < chunk.length) {
        const result = await videoFile.write(chunk, offset, chunk.length - offset, written);
        offset += result.bytesWritten; written += result.bytesWritten;
      }
    }
    res.writeHead(204).end();
  } catch (error) { console.error(error); res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const uploadURL = `http://127.0.0.1:${server.address().port}/${token}`;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
const run = (program, args) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr = (stderr + d).slice(-12000); });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${program} failed (${code}): ${stderr}`)));
});
const began = Date.now();
try {
  await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']);
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(`${baseURL}/studio/band/?offline=1`);
  await page.waitForFunction(() => window.bandView?.offline, null, { timeout: 120000 });
  await page.evaluate(() => window.bandView.loadLightingExample('bohemian-rhapsody'));
  const metadata = await page.evaluate(async () => {
    await document.fonts.ready;
    const v = window.bandView;
    if (!v.player || !v.cameraShow.available) throw Error('波西米亚示例未加载成功');
    const info = v.offline.begin();
    const gl = v.host.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { ...info, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  assert.equal(metadata.width, width); assert.equal(metadata.height, height);
  assert.ok(start < metadata.duration, 'start exceeds song duration');
  const duration = Math.min(requestedDuration || metadata.duration - start, metadata.duration - start);
  const frames = Math.ceil(duration * fps), videoDuration = frames / fps;
  console.log(JSON.stringify({ stage: 'ready', ...metadata, start, frames, fps, output }));
  console.log(JSON.stringify({ stage: 'audio' }));
  const audio = await renderMidiAudio({ midiPath: join(root, 'public/examples/bohemian-rhapsody/queen.mid'),
    fontPath: join(root, 'public/soundfonts/FluidR3_GM.sf2'), output: wav, start, duration: videoDuration });
  console.log(JSON.stringify({ stage: 'audio-ready', audio }));
  let lastLog = 0;
  await page.exposeFunction('exportProgress', n => {
    if (Date.now() - lastLog < 10000 && n < frames) return;
    lastLog = Date.now();
    console.log(JSON.stringify({ stage: 'video', percent: +(n / frames * 100).toFixed(1), frame: n, frames, elapsed: Math.round((Date.now() - began) / 1000) }));
  });
  const encoded = await page.evaluate(async options => {
    const { encodeVideo } = await import('/src/export/encodeVideo.ts');
    return encodeVideo(window.bandView.offline, { ...options, onProgress: window.exportProgress });
  }, { width, height, fps, start, frames, bitrate: fps === 60 ? 24000000 : 16000000, uploadURL });
  assert.equal(encoded.frames, frames); assert.deepEqual(pageErrors, []);
  await videoFile.sync();
  await browser.close(); browser = null;
  console.log(JSON.stringify({ stage: 'mux', videoBytes: written }));
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-r', String(fps), '-i', video, '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-t', String(videoDuration),
    '-movflags', '+faststart', '-metadata', 'title=Bohemian Rhapsody', '-metadata', 'artist=Queen', '-metadata', 'comment=yezhen 制作', partial]);
  const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', partial]));
  const v = probe.streams.find(s => s.codec_type === 'video'), a = probe.streams.find(s => s.codec_type === 'audio');
  assert.equal(v.width, width); assert.equal(v.height, height); assert.equal(Number(v.nb_frames), frames);
  assert.equal(v.avg_frame_rate, `${fps}/1`); assert.equal(a.channels, 2); assert.equal(a.sample_rate, '48000');
  assert.ok(Math.abs(Number(v.duration) - Number(a.duration)) < .05, 'audio/video duration mismatch');
  // Decode the entire finished file: a muxed file alone does not prove every packet is valid.
  await run('ffmpeg', ['-v', 'error', '-xerror', '-i', partial, '-f', 'null', '-']);
  await fs.rename(partial, output);
  const report = { output, width, height, fps, frames, duration: videoDuration, bytes: (await fs.stat(output)).size,
    renderer: metadata.renderer, audio, elapsedSeconds: Math.round((Date.now() - began) / 1000), start };
  await fs.writeFile(`${output}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ stage: 'complete', ...report }));
} finally {
  await browser?.close();
  await videoFile.close();
  await new Promise(resolve => server.close(resolve));
  // Only this invocation's freshly created temporary directory is removed; failures retain it for diagnosis.
  try { await fs.access(output); await fs.rm(work, { recursive: true }); }
  catch { console.log(`Intermediate files retained: ${work}`); }
}
