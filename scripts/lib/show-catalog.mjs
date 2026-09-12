import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('../../', import.meta.url));

/** Bundle trusted repository TypeScript in memory, using Vite's existing esbuild dependency. */
export async function loadCatalog() {
  const bundle = await build({ stdin: { resolveDir: root, contents: `
    export * from './src/shows/catalog.ts';
    export { SONG_LIBRARY } from './src/app/stage/SongLibrary.ts';
    export { MusicAnalysis } from './src/lighting/MusicAnalysis.ts';
    export { analyzeMidi } from './src/midi/index.ts';
    export { validateCameraPerformance } from './src/shows/validateCameraPerformance.ts';
  ` }, bundle: true, write: false, platform: 'node', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

export async function publicAsset(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[?#\\]/.test(url)) throw new Error(`素材必须是 public 内的绝对 URL：${url}`);
  const base = await fs.realpath(resolve(root, 'public'));
  const path = await fs.realpath(resolve(base, `.${decodeURIComponent(url)}`));
  const rel = relative(base, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`素材超出 public：${url}`);
  return path;
}

export async function checkAssets(show) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(show.id)) throw new Error(`作品 ID 需使用小写英文、数字和连字符：${show.id}`);
  const midiPath = await publicAsset(show.midiUrl);
  const bytes = await fs.readFile(midiPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== show.sha256) throw new Error(`${show.id}: MIDI SHA-256 与编排版本不匹配`);
  if (show.menu) await publicAsset(show.menu.cover);
  return { midiPath, bytes, hash };
}
