'use strict';

window.loadVirtualBandSongs = async function loadVirtualBandSongs() {
  const ids = ['wish', 'hey', 'africa', 'dust', 'children'];
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support DecompressionStream(gzip).');
  }
  const entries = await Promise.all(ids.map(async (id) => {
    const response = await fetch(`./assets/songs/${id}.json.gz`);
    if (!response.ok) throw new Error(`Failed to load built-in song data: ${id} (${response.status})`);
    if (!response.body) throw new Error(`Built-in song data has no response body: ${id}`);
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return [id, JSON.parse(text)];
  }));
  window.VIRTUAL_BAND_SONGS = Object.fromEntries(entries);
  return window.VIRTUAL_BAND_SONGS;
};
