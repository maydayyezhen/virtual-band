import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const url = 'https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2';
const destination = new URL('../public/soundfonts/FluidR3_GM.sf2', import.meta.url);
const temporary = new URL('../public/soundfonts/FluidR3_GM.sf2.part', import.meta.url);
const expectedBytes = 148398306;

await mkdir(new URL('../public/soundfonts/', import.meta.url), { recursive: true });

try {
  const current = await stat(destination);
  if (current.size === expectedBytes) {
    console.log(`FluidR3_GM.sf2 already present (${current.size} bytes)`);
    process.exit(0);
  }
} catch {}

console.log('Downloading FluidR3_GM.sf2 (~142 MiB)...');
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok || !response.body) {
  throw new Error(`Download failed: HTTP ${response.status}`);
}

await rm(temporary, { force: true });
await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
const downloaded = await stat(temporary);
if (downloaded.size !== expectedBytes) {
  await rm(temporary, { force: true });
  throw new Error(`Unexpected FluidR3_GM.sf2 size: ${downloaded.size}, expected ${expectedBytes}`);
}

await rename(temporary, destination);
console.log(`Saved FluidR3_GM.sf2 (${downloaded.size} bytes)`);
