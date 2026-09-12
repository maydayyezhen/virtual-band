import type { FixtureGroup } from '../Lighting.ts';
import type { MusicFrame } from '../MusicAnalysis.ts';
import { TAU, clamp } from '../math.ts';
export type ConcertLookKind = 'overture' | 'piano' | 'ballad' | 'rise' | 'solo' | 'opera' | 'spiral' | 'rock' | 'storm' | 'coda' | 'farewell';
export interface ConcertLook {
    kind: ConcertLookKind;
    power: number;
}
/** Reusable target trajectories and role responses, adapted from the supplied reference.
 * Pure world-space output: no fixture objects, mutations, timers, or accumulated phase.
 */
export function concertLook(c: ConcertLook, f: MusicFrame, g: FixtureGroup, i: number, n: number) {
    const u = n > 1 ? i / (n - 1) * 2 - 1 : 0;
    const side = u < 0 ? -1 : 1, phase = f.quarter * TAU / 16;
    const swing = Math.sin(phase + i * .48), wave = .5 + .5 * Math.sin(phase + i * 1.15);
    let x = u * 13, y = 1.25, z = 3, power = .25, angle = 3.0, accent = i % 2 === 1;
    const floor = g === 'floor', rear = g === 'rear', wing = g === 'side', par = g === 'par';
    if (floor) {
        y = 15;
        z = 10;
        x = u * 18;
    }
    if (wing) {
        x = -u * 5;
        y = 3;
        z = 1;
    }
    if (par) {
        x = u * 11;
        y = 1.25;
        z = 0;
        angle = 22;
        power = .12;
    }
    switch (c.kind) {
        case 'overture':
            if (rear) {
                x = u * 1.8;
                y = 1.25;
                z = -2;
                power = i === 2 || i === 3 ? .30 + .22 * f.choir : .025;
                angle = 2.4;
            }
            else if (floor) {
                x = u * 8;
                y = 17;
                z = -2;
                power = (i === 0 || i === 5) ? .08 + .13 * f.choir : 0;
                angle = 1.5;
            }
            else if (wing) {
                power = .045;
                z = -2;
            }
            else
                power = .04 + .045 * f.choir;
            break;
        case 'piano':
            if (rear) {
                x = u * 7 + Math.sin(phase * .35) * 1.2;
                z = 0;
                power = .10 + .42 * f.piano * (.55 + .45 * Math.cos((f.pianoNote % 12 - i * 2) * .52));
                angle = 2.6;
            }
            else if (floor) {
                x = u * 14;
                y = 18;
                z = 3;
                power = .08 + .12 * f.choir;
                angle = 1.8;
            }
            else if (wing)
                power = .10 + .1 * f.strings;
            else
                power = .055 + .04 * f.piano;
            break;
        case 'ballad':
            if (rear) {
                x = u * 3.5;
                z = -.5;
                power = (i === 2 || i === 3 ? .58 : .1) + f.lead * .15;
                angle = i === 2 || i === 3 ? 5 : 2.2;
                accent = i < 2 || i > 3;
            }
            else if (floor) {
                x = u * 20;
                y = 14;
                z = 1;
                power = .09 + .1 * f.piano;
                angle = 1.65;
            }
            else if (wing) {
                power = .18;
                x = -u * 6;
                z = 2;
            }
            else
                power = .09 + f.lead * .04;
            break;
        case 'rise':
            if (rear) {
                x = u * (7 + 4 * Math.sin(phase * .22)) + swing * 2;
                z = 2 + wave * 4;
                power = .21 + .28 * f.snare + .13 * f.strings;
                angle = 3;
            }
            else if (floor) {
                x = u * 17 + swing * 2;
                y = 13 + wave * 4;
                z = 9;
                power = .15 + .36 * f.kick;
                angle = 2;
            }
            else if (wing) {
                x = -u * 7;
                y = 2 + wave * 4;
                power = .2 + .18 * f.lead;
            }
            else
                power = .12 + f.bass * .17;
            break;
        case 'solo':
            if (rear) {
                x = -u * 12 + Math.sin(phase * 1.5) * 5;
                z = 2 + Math.cos(phase + i) * 4;
                y = 1.25;
                power = .34 + .36 * f.guitar + .15 * f.snare;
                angle = 2.6;
            }
            else if (floor) {
                x = -u * 18 + swing * 4;
                y = 14 + wave * 3;
                z = 13;
                power = .32 + .3 * f.guitar + .14 * f.kick;
                angle = 2.3;
            }
            else if (wing) {
                x = (f.guitarNote - 65) * .25;
                y = 2.4;
                z = 1;
                power = .28 + .25 * f.guitar;
                angle = 4.5;
                accent = false;
            }
            else
                power = .17 + .18 * f.snare;
            break;
        case 'opera': {
            const call = (f.leadChannel + f.choirChannel) % 2, lit = i % 2 === call;
            if (rear) {
                x = u * 9;
                y = 1.25;
                z = 2 + side * 2;
                power = (lit ? .24 : .05) + f.choir * (lit ? .5 : .08) + f.lead * (lit ? .24 : .45);
                angle = 3.4;
            }
            else if (floor) {
                x = u * 22;
                y = 12;
                z = 8 + side * 3;
                power = (lit ? .18 : .035) + f.choir * .35;
                angle = 2;
            }
            else if (wing) {
                x = -u * 9;
                y = 4;
                z = 2;
                power = .1 + (lit ? f.lead : f.choir) * .6;
                angle = 4;
            }
            else
                power = .06 + (lit ? f.snare * .29 : f.piano * .15);
            accent = lit;
            break;
        }
        case 'spiral':
            if (rear) {
                x = 10 * Math.sin(phase * 2 + i * TAU / 6);
                y = 1.25;
                z = 1 + 4 * Math.cos(phase * 2 + i * TAU / 6);
                power = .3 + .23 * f.choir + .3 * f.snare;
                angle = 2.7;
            }
            else if (floor) {
                x = Math.sin(phase * 2 - i * TAU / 6) * 18;
                y = 12 + Math.cos(phase * 2 - i * TAU / 6) * 5;
                z = 13;
                power = .24 + .4 * f.choir + .12 * f.kick;
                angle = 2;
            }
            else if (wing) {
                x = -side * 9;
                y = 2 + wave * 7;
                z = 1;
                power = .25 + .28 * f.tom;
            }
            else
                power = .1 + .22 * f.snare;
            break;
        case 'rock':
            if (rear) {
                x = u * 15 + Math.sin(phase * 2) * 4;
                z = 5 + Math.cos(phase * 2) * 2;
                power = .35 + .48 * f.snare + .2 * f.guitar;
                angle = 3.4;
            }
            else if (floor) {
                x = u * (14 + 5 * Math.sin(phase));
                y = 15 + Math.cos(phase + i * .3) * 3;
                z = 18;
                power = .27 + .62 * f.kick + .2 * f.bass;
                angle = 2.7;
            }
            else if (wing) {
                x = -u * 12;
                y = 4 + 4 * wave;
                z = 6;
                power = .35 + .4 * f.guitar;
                angle = 3.8;
            }
            else
                power = .12 + .45 * f.snare;
            accent = rear ? i % 2 === 0 : floor ? i % 3 === 0 : wing;
            break;
        case 'storm':
            if (rear) {
                x = Math.sin(phase * 3 + i * TAU / 6) * 14;
                y = 1.25;
                z = 3 + Math.cos(phase * 3 + i * TAU / 6) * 4;
                power = .35 + .5 * f.guitar + .4 * f.snare;
                angle = 2.2;
            }
            else if (floor) {
                x = Math.sin(-phase * 3 + i * TAU / 6) * 19;
                y = 13 + Math.cos(-phase * 3 + i * TAU / 6) * 5;
                z = 17;
                power = .36 + .45 * f.kick + .32 * f.guitar;
                angle = 1.9;
            }
            else if (wing) {
                x = -side * 5;
                y = 8 + 3 * wave;
                z = 8;
                power = .3 + .4 * f.crash;
            }
            else
                power = .12 + .35 * f.snare;
            accent = floor;
            break;
        case 'coda':
            if (rear) {
                x = u * (4 + Math.sin(phase * .2));
                z = 0;
                power = .10 + f.piano * .22 + f.lead * .15;
                angle = 3.3;
            }
            else if (floor) {
                x = u * 12;
                y = 17;
                z = -1;
                power = .06 + .1 * f.strings;
                angle = 1.5;
            }
            else if (wing) {
                power = .08 + .12 * f.lead;
                z = 0;
            }
            else
                power = .07 + .06 * f.piano;
            break;
        case 'farewell':
            if (rear) {
                x = u * 2 * f.tail;
                y = 1.25;
                z = 0;
                power = i === 2 || i === 3 ? .28 : .018;
                angle = 2.2;
            }
            else if (floor) {
                x = u * 11;
                y = 17;
                z = 0;
                power = .055;
                angle = 1.3;
            }
            else
                power = .04;
            break;
    }
    return { x, y, z, power: clamp(power * c.power * f.tail, 0, 1.7), angle, accent };
}
