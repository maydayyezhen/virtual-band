import { readFileSync } from 'node:fs';
import { analyzeMidi } from '../src/midi/index.ts';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/analyze-midi.mjs <file.mid>');
  process.exit(1);
}

const bytes = readFileSync(file);
const analysis = analyzeMidi(new Uint8Array(bytes));
console.log(analysis.report);
