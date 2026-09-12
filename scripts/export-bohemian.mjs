// Compatibility entry point; all export logic lives in export-show.mjs.
if (!process.argv.includes('--song')) process.argv.push('--song', 'bohemian-rhapsody');
await import('./export-show.mjs');
