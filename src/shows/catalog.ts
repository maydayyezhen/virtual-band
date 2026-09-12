import { MusicAnalysis } from '../lighting/MusicAnalysis.ts';
import type { LightingRig } from '../lighting/Lighting';
import type { ShowDefinition, PreparedBandShow } from './ShowDefinition';
import { bohemianShow } from './BohemianShow.ts';
import { prepareFreeformStudy } from './examples/FreeformStudy.ts';
export type { ShowDefinition, PreparedBandShow } from './ShowDefinition';

/** Register once: the game menu and CLI both derive their entries from this list. */
export const SHOW_EXAMPLES: readonly ShowDefinition[] = [bohemianShow, {
  ...bohemianShow, id: 'freeform-study', title: '自由创作示例', menu: null,
  prepare: (music, rig) => ({ ...bohemianShow.prepare(music, rig), ...prepareFreeformStudy(music, rig) }),
}];

export function getShow(id: string): ShowDefinition {
  const entry = SHOW_EXAMPLES.find(show => show.id === id);
  if (!entry) throw new Error(`未知作品 ID：${id}`);
  return entry;
}

/** Match exact content. Explicit selection must not silently fall back to an unarranged song. */
export async function prepareMatchingShow(binary: ArrayBuffer, rig: LightingRig, exampleId?: string): Promise<PreparedBandShow | null> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', binary))].map(n => n.toString(16).padStart(2, '0')).join('');
  const entry = exampleId ? getShow(exampleId) : SHOW_EXAMPLES.find(example => example.sha256 === hash);
  if (entry && entry.sha256 !== hash) throw new Error(`作品 ${entry.id} 的 MIDI 内容与编排版本不匹配`);
  return entry ? entry.prepare(new MusicAnalysis(binary), rig) : null;
}
