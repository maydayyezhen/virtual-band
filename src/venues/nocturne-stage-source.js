'use strict';
// The exact gifted NOCTURNE stage-application is gzip/base64 encoded and split across
// numbered files only to stay below connector/file-write limits. The venue manager joins
// these chunks, verifies the exact payload length, decompresses it, then adapts host
// ownership without redrawing or simplifying the authored venue.
window.__NOCTURNE_STAGE_SOURCE_PARTS__ = [];
window.__NOCTURNE_STAGE_SOURCE_EXPECTED_LENGTH__ = 42892;
