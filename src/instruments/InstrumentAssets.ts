import { LAYOUT_INSTRUMENTS } from '../layout/LayoutDocument';
import { createDefaultInstruments, createInstrumentInstance, type InstrumentDescriptor } from './InstrumentDefinitions';
import type { LiveAudioEngine } from '../audio/LiveAudioEngine';
import type { Instrument } from './Instrument';

/** Named model assets, independent of GM programs and stage instance IDs. */
export const INSTRUMENT_ASSETS: readonly (InstrumentDescriptor & { label: string })[] = [
  ...LAYOUT_INSTRUMENTS.map(({ id, label }) => ({ id: `${id}.main`, type: id,
    label: id === 'electric' ? '电吉他 · 深蓝双缺角' : id === 'acoustic' ? '木吉他 · 原木圆肩' : label })),
  { id: 'electric.single-cut', type: 'electric', variant: 'single-cut', label: '电吉他 · 酒红单缺角' },
  { id: 'electric.flying-v', type: 'electric', variant: 'flying-v', label: '电吉他 · 琥珀橙 V 型' },
  { id: 'acoustic.sunburst', type: 'acoustic', variant: 'cutaway-sunburst', label: '木吉他 · 琥珀渐变单缺角' },
];

export async function createInstrumentLibrary(audio: LiveAudioEngine) {
  const defaults = await createDefaultInstruments(audio);
  const extra = await Promise.allSettled(INSTRUMENT_ASSETS.filter(asset => asset.variant)
    .map(asset => createInstrumentInstance(asset, audio)));
  const list: Instrument[] = Object.values(defaults);
  for (const result of extra) if (result.status === 'fulfilled') list.push(result.value);
  const failed = extra.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') {
    for (const instrument of list) instrument.dispose();
    throw failed.reason;
  }
  return { defaults, list };
}
