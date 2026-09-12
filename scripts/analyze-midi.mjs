import fs from 'node:fs/promises';
import { loadCatalog } from './lib/show-catalog.mjs';

const file = process.argv[2];
if (!file) throw new Error('用法：npm run midi:analyze -- <file.mid>');
const { analyzeMidi } = await loadCatalog();
console.log(analyzeMidi(await fs.readFile(file)).report);
