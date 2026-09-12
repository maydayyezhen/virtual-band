import type { ConcertLook } from './patterns/ConcertLooks.ts';
import type { SectionShow, ShowSection } from './SectionShow.ts';
import type { FixtureGroup, LightingFrame } from './Lighting.ts';
import { concertLook } from './patterns/ConcertLooks.ts';
import { clamp, mix, mixColor, rgb, scaleColor, smooth } from './math.ts';
import { withLightingEffects, type LightingEffect } from './LightingProgram.ts';

export interface ConcertSection extends ShowSection, ConcertLook { color: string; second: string }
export interface ConcertShowOptions {
  id: string;
  title: string;
  sections: readonly ConcertSection[];
  transitionSeconds?: number;
  level?: number;
  flash?: number;
  fadeOutSeconds?: number;
  /** Original effects may extend or replace any part of the library look's current frame. */
  effects?: readonly LightingEffect<ConcertSection>[];
}
const WHITE = rgb('#fff4dd');
const BACKGROUND = rgb('#060d16');

/** Common concert vocabulary: a new song can supply only a beat-indexed section table.
 * Custom arrangements can instead implement SectionShow.evaluate with the same output contract.
 */
export function createConcertShow(options: ConcertShowOptions): SectionShow<ConcertSection> {
  const { level = .86, flash = .8, fadeOutSeconds = 9 } = options;
  if (![level, flash, fadeOutSeconds].every(Number.isFinite) || level < 0 || level > 2 || flash < 0 || flash > 1 || fadeOutSeconds < 0)
    throw new Error('Invalid concert show settings');
  const kinds = new Set(['overture', 'piano', 'ballad', 'rise', 'solo', 'opera', 'spiral', 'rock', 'storm', 'coda', 'farewell']);
  if (options.sections.some(section => !kinds.has(section.kind) || !Number.isFinite(section.power) || section.power < 0))
    throw new Error('Invalid concert section');
  const colors = new Map(options.sections.flatMap(section => [section.color, section.second]).map(hex => [hex, rgb(hex)]));
  return withLightingEffects({ id: options.id, title: options.title, sections: options.sections, transitionSeconds: options.transitionSeconds ?? 1.15,
    evaluate({ music, current, previous, transition: k, rig }): LightingFrame {
      const f = { ...music, tail: fadeOutSeconds > 0 ? 1 - smooth((music.t - (music.duration - fadeOutSeconds)) / fadeOutSeconds) : music.finished ? 0 : 1 };

      const from = [colors.get(previous.color)!, colors.get(previous.second)!], to = [colors.get(current.color)!, colors.get(current.second)!];
      const colorA = mixColor(from[0], to[0], k), colorB = mixColor(from[1], to[1], k);
      const groups = new Map<FixtureGroup, typeof rig.fixtures>();
      for (const group of ['rear', 'floor', 'side', 'par'] as const) groups.set(group, rig.fixtures.filter(fixture => fixture.group === group));
      const rock = current.kind === 'rock' || current.kind === 'storm';
      return {
        time: f.t, section: current.name, master: level,
        fixtures: rig.fixtures.map(fixture => {
          const group = groups.get(fixture.group)!, i = group.indexOf(fixture);
          const a = concertLook(previous, f, fixture.group, i, group.length);
          const b = concertLook(current, f, fixture.group, i, group.length);
          let color = b.accent ? colorB : colorA;
          let intensity = mix(a.power, b.power, k);
          if (rock && fixture.group === 'par') color = mixColor(color, WHITE, clamp(f.snare * flash));
          if ((rock || current.kind === 'spiral') && fixture.group === 'rear') intensity += f.crash * .16 * flash * f.tail;
          return { id: fixture.id, target: [mix(a.x, b.x, k), mix(a.y, b.y, k), mix(a.z, b.z, k)],
            color, intensity: f.finished ? 0 : clamp(intensity, 0, 2), angle: mix(a.angle, b.angle, k), distance: 65,
            beam: fixture.type !== 'par' || fixture.groups.includes('front-floor') };
        }),
        pixels: rig.pixels.map(({ id, row, index: i, count }) => {
          const step = Math.floor(f.quarter * 2);
          const runner = Math.exp(-(((i - step % count) / 1.8) ** 2));
          const note = Math.exp(-(((i - (f.pianoNote - 36) % count) / 2.3) ** 2));
          let power = (row ? .04 : .055) + f.bass * (row ? .10 : .3) + runner * f.hat * .6 + note * f.piano * .28;
          if (rock) power += ((i + Math.floor(f.quarter)) % 2 ? f.snare : f.kick) * .8;
          if (current.kind === 'opera' || current.kind === 'spiral') power += (i % 2 ? f.choir : f.lead) * .4;
          return { id, color: scaleColor(i % 7 === 0 ? colorB : colorA, (.04 + power * 3) * level * f.tail) };
        }),
        gobos: rig.gobos.map(({ id, index: i }) => ({ id, rotation: f.t * .07 * (i % 2 ? 1 : -1),
          color: i % 2 ? colorB : colorA,
          opacity: ((rock || current.kind === 'solo' || current.kind === 'spiral') ? .13 + .14 * f.piano + .12 * f.snare : .015 + .05 * f.piano) * f.tail,
        })),
        environment: { key: (35 + 330 * current.power + 90 * f.energy) * level * f.tail,
          ambient: .10 + .04 * f.tail, background: BACKGROUND, hazeDensity: .15 + .07 * current.power, hazeTime: f.t * .12 },
      };
    },
  }, options.effects ?? []);
}
