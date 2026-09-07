'use strict';
(() => {
  const parts = window.__NOCTURNE_STAGE_SOURCE_PARTS__ || [];
  const payload = parts.join('');
  const expected = window.__NOCTURNE_STAGE_SOURCE_EXPECTED_LENGTH__ || 42892;
  if (parts.length !== 7 || payload.length !== expected) {
    throw new Error(`NOCTURNE source payload incomplete: ${parts.length} parts, ${payload.length}/${expected} chars`);
  }
  window.__NOCTURNE_STAGE_SOURCE_GZIP_BASE64__ = payload;
  console.info(`[Venue] NOCTURNE source payload verified · ${payload.length} chars`);
})();
