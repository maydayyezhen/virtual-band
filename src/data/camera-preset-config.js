'use strict';

// Baked camera preset curation. The in-browser editor writes a local draft on top of
// this file and exports the exact same schema. When a curated JSON is approved, replace
// this object with that JSON so the project ships with the user's camera library.
window.VIRTUAL_BAND_CAMERA_PRESET_CONFIG = {
  schema: 'virtual-band-camera-presets/v1',
  scope: 'nocturne',
  hidden: [],
  overrides: {},
  custom: [],
};
