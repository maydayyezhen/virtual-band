'use strict';

// Baked unified camera library. Browser edits live in localStorage until exported.
// Scene views are venue-local; instrument views are shared across every venue.
window.VIRTUAL_BAND_CAMERA_LIBRARY_CONFIG = {
  schema: 'virtual-band-camera-library/v1',
  scenes: {
    none: { hidden: [], overrides: {}, custom: [] },
    nocturne: { hidden: [], overrides: {}, custom: [] },
  },
  instruments: { hidden: [], overrides: {}, custom: [] },
};
