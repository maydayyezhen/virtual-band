import type {
  BlendMode,
  CompiledCue,
  CompiledShow,
  CueChannel,
  CueLayer,
  Diagnostic,
  EffectSpec,
  FixtureSelector,
  FixtureState,
  FrameState,
  LightingProperty,
  RigFixtureSnapshot,
  RigSnapshot,
  ShowPlan,
  SongEvent,
  SongScore,
} from './contracts';
import type { NocturneLightingAdapter } from './NocturneLightingAdapter';

const LAYERS: CueLayer[] = ['section', 'motion', 'accent'];
const TAU = Math.PI * 2;
const EVENT_INDEX = new WeakMap<CompiledShow, Map<string, SongEvent[]>>();

export type RuntimeStatus = {
  time: number;
  duration: number;
  sectionId: string | null;
  sectionLabel: string;
  activeCueIds: string[];
};

export function compileShowPlan(plan: ShowPlan, rig: RigSnapshot, score: SongScore): CompiledShow {
  const diagnostics: Diagnostic[] = [];
  const fixtureById = new Map(rig.fixtures.map((fixture) => [fixture.id, fixture]));
  const cuesByLayer: Record<CueLayer, CompiledCue[]> = { section: [], motion: [], accent: [] };

  const sectionIds = new Set<string>();
  for (const section of plan.sections) {
    if (sectionIds.has(section.id)) {
      diagnostics.push({ severity: 'error', code: 'DUPLICATE_SECTION_ID', message: `重复 Section id: ${section.id}` });
    }
    sectionIds.add(section.id);
    if (!(section.startSeconds >= 0 && section.endSeconds > section.startSeconds && section.endSeconds <= score.duration + 0.05)) {
      diagnostics.push({ severity: 'error', code: 'INVALID_SECTION_RANGE', message: `Section ${section.id} 时间范围无效` });
    }
  }

  const cueIds = new Set<string>();
  for (const cue of plan.cues) {
    if (cueIds.has(cue.id)) {
      diagnostics.push({ severity: 'error', code: 'DUPLICATE_CUE_ID', message: `重复 Cue id: ${cue.id}`, cueId: cue.id });
      continue;
    }
    cueIds.add(cue.id);

    if (!sectionIds.has(cue.sectionId)) {
      diagnostics.push({ severity: 'error', code: 'UNKNOWN_SECTION', message: `Cue ${cue.id} 引用了不存在的 Section ${cue.sectionId}`, cueId: cue.id });
    }
    if (!(cue.startSeconds >= 0 && cue.endSeconds > cue.startSeconds && cue.endSeconds <= score.duration + 0.05)) {
      diagnostics.push({ severity: 'error', code: 'INVALID_CUE_RANGE', message: `Cue ${cue.id} 时间范围无效`, cueId: cue.id });
    }

    const fixtureIds = resolveSelector(cue.select, rig, diagnostics, cue.id);
    if (!fixtureIds.length) {
      diagnostics.push({ severity: 'error', code: 'EMPTY_SELECTOR', message: `Cue ${cue.id} 没有选中灯具`, cueId: cue.id });
    }

    for (const [property, channel] of Object.entries(cue.channels) as Array<[LightingProperty, CueChannel]>) {
      validateChannel(cue.id, property, channel, fixtureIds, fixtureById, diagnostics);
    }

    const fadeIn = Math.max(0, cue.fadeInSeconds ?? 0);
    const fadeOut = Math.max(0, cue.fadeOutSeconds ?? 0);
    if (fadeIn + fadeOut > cue.endSeconds - cue.startSeconds + 1e-6) {
      diagnostics.push({ severity: 'error', code: 'FADE_EXCEEDS_CUE', message: `Cue ${cue.id} 的淡入淡出超过 Cue 长度`, cueId: cue.id });
    }

    const compiled: CompiledCue = {
      ...cue,
      channels: normalizeChannels(cue.channels),
      fixtureIds,
    };
    cuesByLayer[cue.layer].push(compiled);
  }

  for (const layer of LAYERS) {
    cuesByLayer[layer].sort((a, b) => a.priority - b.priority || a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
  }

  return { plan, rig, score, cuesByLayer, diagnostics };
}

export function evaluateShow(compiled: CompiledShow, musicSeconds: number): FrameState {
  const time = clamp(musicSeconds, 0, compiled.score.duration);
  const fixtures = new Map<string, FixtureState>();
  for (const fixture of compiled.rig.fixtures) {
    fixtures.set(fixture.id, { ...fixture.home, intensity: compiled.plan.baseLook.intensity });
  }

  const activeCueIds: string[] = [];
  for (const layer of LAYERS) {
    for (const cue of compiled.cuesByLayer[layer]) {
      if (time < cue.startSeconds || time >= cue.endSeconds) continue;
      const weight = cueWeight(cue, time);
      if (weight <= 0) continue;
      activeCueIds.push(cue.id);

      for (let fixtureIndex = 0; fixtureIndex < cue.fixtureIds.length; fixtureIndex += 1) {
        const fixtureId = cue.fixtureIds[fixtureIndex];
        if (!fixtureId) continue;
        const state = fixtures.get(fixtureId);
        if (!state) continue;

        for (const [property, channel] of Object.entries(cue.channels) as Array<[LightingProperty, CueChannel]>) {
          const effectValue = evaluateEffect(channel.effect, compiled, time, fixtureIndex);
          applyChannel(state, property, channel.blend, effectValue, weight);
        }
      }
    }
  }

  for (const state of fixtures.values()) {
    state.intensity = clamp(state.intensity, 0, 1);
    state.pan = clamp(state.pan, -180, 180);
    state.tilt = clamp(state.tilt, -90, 90);
    state.beamAngleDeg = clamp(state.beamAngleDeg, 1, 60);
  }

  const section = compiled.plan.sections.find((candidate) => time >= candidate.startSeconds && time < candidate.endSeconds)
    ?? compiled.plan.sections.at(-1)
    ?? null;

  return {
    musicSeconds: time,
    sectionId: section?.id ?? null,
    activeCueIds,
    fixtures,
  };
}

export class DeterministicLightingRuntime {
  private frame = 0;
  private running = false;
  private lastStatusAt = -Infinity;
  private lastFrame: FrameState | null = null;
  private readonly ownerId = 'nocturne-lighting-runtime-v2';

  constructor(
    private readonly adapter: NocturneLightingAdapter,
    private compiled: CompiledShow,
    private readonly currentMusicTime: () => number,
    private readonly onStatus?: (status: RuntimeStatus) => void,
  ) {}

  get show(): CompiledShow {
    return this.compiled;
  }

  get currentFrame(): FrameState | null {
    return this.lastFrame;
  }

  start(): void {
    if (this.running) return;
    this.adapter.acquireControl(this.ownerId);
    this.running = true;
    this.renderNow();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.adapter.releaseControl(this.ownerId);
  }

  setShow(compiled: CompiledShow): void {
    this.compiled = compiled;
    this.renderNow();
  }

  evaluateAt(time: number): FrameState {
    return evaluateShow(this.compiled, time);
  }

  renderNow(time = this.currentMusicTime()): FrameState {
    const frame = evaluateShow(this.compiled, time);
    this.adapter.applyFrame(frame);
    this.lastFrame = frame;
    this.emitStatus(frame, true);
    return frame;
  }

  dispose(): void {
    this.stop();
    this.adapter.dispose();
  }

  private readonly tick = (): void => {
    this.frame = 0;
    if (!this.running) return;
    const frame = evaluateShow(this.compiled, this.currentMusicTime());
    this.adapter.applyFrame(frame);
    this.lastFrame = frame;
    this.emitStatus(frame, false);
    this.frame = requestAnimationFrame(this.tick);
  };

  private emitStatus(frame: FrameState, force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastStatusAt < 120) return;
    this.lastStatusAt = now;
    const section = this.compiled.plan.sections.find((candidate) => candidate.id === frame.sectionId);
    this.onStatus?.({
      time: frame.musicSeconds,
      duration: this.compiled.score.duration,
      sectionId: frame.sectionId,
      sectionLabel: section?.label ?? '未命名段落',
      activeCueIds: frame.activeCueIds,
    });
  }
}

function resolveSelector(selector: FixtureSelector, rig: RigSnapshot, diagnostics: Diagnostic[], cueId: string): string[] {
  if ('ids' in selector) {
    const available = new Set(rig.fixtures.map((fixture) => fixture.id));
    const resolved: string[] = [];
    const missing: string[] = [];
    for (const id of selector.ids) {
      if (available.has(id)) resolved.push(id);
      else missing.push(id);
    }
    if (missing.length) {
      diagnostics.push({ severity: 'error', code: 'MISSING_FIXTURE', message: `Cue ${cueId} 引用了不存在的灯具`, cueId, fixtureIds: missing });
    }
    return [...new Set(resolved)];
  }

  const groups = selector.groupsAll ?? [];
  const resolved = rig.fixtures
    .filter((fixture) => !selector.fixtureType || fixture.type === selector.fixtureType)
    .filter((fixture) => groups.every((group) => fixture.groups.includes(group)))
    .map((fixture) => fixture.id)
    .sort((a, b) => a.localeCompare(b));
  if (selector.order === 'id-desc') resolved.reverse();
  return resolved;
}

function validateChannel(
  cueId: string,
  property: LightingProperty,
  channel: CueChannel,
  fixtureIds: string[],
  fixtureById: Map<string, RigFixtureSnapshot>,
  diagnostics: Diagnostic[],
): void {
  const unsupported = fixtureIds.filter((id) => !fixtureById.get(id)?.supports.includes(property));
  if (unsupported.length) {
    diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_PROPERTY', message: `Cue ${cueId} 的 ${property} 不被部分灯具支持`, cueId, fixtureIds: unsupported });
  }

  const effect = channel.effect;
  if (property === 'color') {
    if (channel.blend !== 'replace') {
      diagnostics.push({ severity: 'error', code: 'COLOR_BLEND_UNSUPPORTED', message: `Cue ${cueId} 的 color 第一版只支持 replace`, cueId });
    }
    if ((effect.op === 'constant' && typeof effect.value !== 'string') ||
        (effect.op === 'curve' && effect.keyframes.some((frame) => typeof frame.value !== 'string')) ||
        effect.op === 'oscillator' || effect.op === 'eventEnvelope') {
      diagnostics.push({ severity: 'error', code: 'EFFECT_TYPE_MISMATCH', message: `Cue ${cueId} 的 color 效果类型不匹配`, cueId });
    }
    return;
  }

  if (effect.op === 'constant' && typeof effect.value !== 'number') {
    diagnostics.push({ severity: 'error', code: 'EFFECT_TYPE_MISMATCH', message: `Cue ${cueId} 的 ${property} 需要数值`, cueId });
  }
  if (effect.op === 'curve' && effect.keyframes.some((frame) => typeof frame.value !== 'number')) {
    diagnostics.push({ severity: 'error', code: 'EFFECT_TYPE_MISMATCH', message: `Cue ${cueId} 的 ${property} 曲线需要数值`, cueId });
  }
  if (effect.op === 'eventEnvelope' && property !== 'intensity') {
    diagnostics.push({ severity: 'error', code: 'EVENT_ENVELOPE_PROPERTY', message: `Cue ${cueId} 的 eventEnvelope 第一版只允许写 intensity`, cueId });
  }
  if (property !== 'intensity' && channel.blend !== 'replace') {
    diagnostics.push({ severity: 'error', code: 'MOTION_BLEND_UNSUPPORTED', message: `Cue ${cueId} 的 ${property} 第一版只支持 replace`, cueId });
  }
}

function normalizeChannels(channels: LightingCueChannels): LightingCueChannels {
  const normalized: LightingCueChannels = {};
  for (const [property, channel] of Object.entries(channels) as Array<[LightingProperty, CueChannel]>) {
    if (channel.effect.op === 'curve') {
      normalized[property] = {
        ...channel,
        effect: {
          ...channel.effect,
          keyframes: [...channel.effect.keyframes].sort((a, b) => a.time - b.time),
        },
      };
    } else {
      normalized[property] = { ...channel, effect: { ...channel.effect } as EffectSpec };
    }
  }
  return normalized;
}

type LightingCueChannels = Partial<Record<LightingProperty, CueChannel>>;

function cueWeight(cue: CompiledCue, time: number): number {
  const fadeIn = Math.max(0, cue.fadeInSeconds ?? 0);
  const fadeOut = Math.max(0, cue.fadeOutSeconds ?? 0);
  let weight = 1;
  if (fadeIn > 0 && time < cue.startSeconds + fadeIn) {
    weight = Math.min(weight, smoothstep((time - cue.startSeconds) / fadeIn));
  }
  if (fadeOut > 0 && time > cue.endSeconds - fadeOut) {
    weight = Math.min(weight, smoothstep((cue.endSeconds - time) / fadeOut));
  }
  return clamp(weight, 0, 1);
}

function evaluateEffect(effect: EffectSpec, compiled: CompiledShow, time: number, fixtureIndex: number): number | string {
  switch (effect.op) {
    case 'constant':
      return effect.value;
    case 'curve':
      return evaluateCurve(effect.keyframes, time);
    case 'oscillator': {
      const period = Math.max(0.05, effect.periodSeconds);
      const phase = effect.phase ?? 0;
      const step = effect.fixturePhaseStep ?? 0;
      const unit = 0.5 + 0.5 * Math.sin(TAU * (time / period + phase + fixtureIndex * step));
      return effect.min + (effect.max - effect.min) * unit;
    }
    case 'eventEnvelope':
      return evaluateEventEnvelope(effect, compiled, time);
  }
}

function evaluateCurve(keyframes: Array<{ time: number; value: number | string }>, time: number): number | string {
  if (!keyframes.length) return 0;
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index]!;
    if (time > right.time) continue;
    const left = keyframes[index - 1]!;
    const span = Math.max(1e-6, right.time - left.time);
    const t = smoothstep((time - left.time) / span);
    if (typeof left.value === 'number' && typeof right.value === 'number') return lerp(left.value, right.value, t);
    if (typeof left.value === 'string' && typeof right.value === 'string') return mixColorLinear(left.value, right.value, t);
    return right.value;
  }
  return last.value;
}

function evaluateEventEnvelope(effect: Extract<EffectSpec, { op: 'eventEnvelope' }>, compiled: CompiledShow, time: number): number {
  const index = eventIndexFor(compiled);
  const attack = Math.max(0, effect.attackSeconds);
  const decay = Math.max(0.001, effect.decaySeconds);
  const window = attack + decay;
  let value = 0;

  for (const role of effect.roleIds) {
    const events = index.get(role) ?? [];
    let cursor = lowerBound(events, Math.max(0, time - window));
    while (cursor < events.length) {
      const event = events[cursor++];
      if (!event || event.s > time) break;
      if (effect.noteNumbers?.length && !effect.noteNumbers.includes(Number(event.n))) continue;
      const age = time - event.s;
      let envelope = 0;
      if (attack > 0 && age < attack) envelope = age / attack;
      else if (age <= window) envelope = 1 - (age - attack) / decay;
      if (envelope <= 0) continue;
      const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
      const contribution = envelope * velocity * effect.gain;
      if ((effect.reducer ?? 'max') === 'sumClamped') value = clamp(value + contribution, 0, 1);
      else value = Math.max(value, contribution);
    }
  }
  return value;
}

function eventIndexFor(compiled: CompiledShow): Map<string, SongEvent[]> {
  const cached = EVENT_INDEX.get(compiled);
  if (cached) return cached;
  const index = new Map<string, SongEvent[]>();
  for (const event of compiled.score.events) {
    const role = String(event.i || 'other');
    const list = index.get(role) ?? [];
    list.push(event);
    index.set(role, list);
  }
  for (const list of index.values()) list.sort((a, b) => a.s - b.s);
  EVENT_INDEX.set(compiled, index);
  return index;
}

function applyChannel(
  state: FixtureState,
  property: LightingProperty,
  blend: BlendMode,
  effectValue: number | string,
  weight: number,
): void {
  const base = readProperty(state, property);
  if (typeof base === 'string' || typeof effectValue === 'string') {
    if (typeof base === 'string' && typeof effectValue === 'string') writeProperty(state, property, mixColorLinear(base, effectValue, weight));
    return;
  }

  let next = base;
  switch (blend) {
    case 'replace': next = lerp(base, effectValue, weight); break;
    case 'add': next = base + effectValue * weight; break;
    case 'max': next = lerp(base, Math.max(base, effectValue), weight); break;
    case 'multiply': next = base * (1 - weight + weight * effectValue); break;
  }
  writeProperty(state, property, next);
}

function readProperty(state: FixtureState, property: LightingProperty): number | string {
  switch (property) {
    case 'intensity': return state.intensity;
    case 'color': return state.color;
    case 'pan': return state.pan;
    case 'tilt': return state.tilt;
    case 'beamAngleDeg': return state.beamAngleDeg;
  }
}

function writeProperty(state: FixtureState, property: LightingProperty, value: number | string): void {
  switch (property) {
    case 'intensity': if (typeof value === 'number') state.intensity = value; break;
    case 'color': if (typeof value === 'string') state.color = value; break;
    case 'pan': if (typeof value === 'number') state.pan = value; break;
    case 'tilt': if (typeof value === 'number') state.tilt = value; break;
    case 'beamAngleDeg': if (typeof value === 'number') state.beamAngleDeg = value; break;
  }
}

function lowerBound(events: SongEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((events[middle]?.s ?? 0) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function mixColorLinear(a: string, b: string, t: number): string {
  const left = hexToLinear(a);
  const right = hexToLinear(b);
  if (!left || !right) return t < 0.5 ? a : b;
  return linearToHex([
    lerp(left[0], right[0], t),
    lerp(left[1], right[1], t),
    lerp(left[2], right[2], t),
  ]);
}

function hexToLinear(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1]!;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255);
  return channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)) as [number, number, number];
}

function linearToHex(channels: [number, number, number]): string {
  const text = channels.map((channel) => {
    const linear = clamp(channel, 0, 1);
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(clamp(srgb, 0, 1) * 255).toString(16).padStart(2, '0');
  }).join('');
  return `#${text}`;
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
