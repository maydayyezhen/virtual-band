import type { RGB } from './Lighting.ts';

export const TAU = Math.PI * 2;
export const clamp = (x: number, min = 0, max = 1): number => Math.max(min, Math.min(max, x));
export const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (x: number): number => { x = clamp(x); return x * x * (3 - 2 * x); };
export const mixColor = (a: RGB, b: RGB, k: number): RGB => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
export const scaleColor = (a: RGB, gain: number): RGB => [a[0] * gain, a[1] * gain, a[2] * gain];
/** Match Three's sRGB hex -> linear working colour conversion, without a renderer dependency. */
export function rgb(hex: string): RGB {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Invalid colour: ${hex}`);
  return [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c < .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  }) as unknown as RGB;
}
