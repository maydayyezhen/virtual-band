import type { LightingStage } from './DustLightingDirector';
import type { PhysicalLightingExecutor } from './PhysicalLightingExecutor';

type FixturePatch = Record<string, unknown>;

type LabFixture = {
  id: string;
  type: string;
  groups: Set<string>;
  effective?: { pan?: number; tilt?: number };
  set: (patch: FixturePatch, duration?: number) => unknown;
};

type ExecutorMotion = {
  pan: number;
  tilt: number;
  angle: number;
  distance: number;
  vPan: number;
  vTilt: number;
  vAngle: number;
  vDistance: number;
};

type ExecutorPlan = {
  startAt: number;
  arriveAt: number;
};

type ExecutorWrapped = {
  raw: LabFixture;
  motion: ExecutorMotion;
  plan: ExecutorPlan | null;
};

type ExecutorInternals = {
  wrapped: Map<string, ExecutorWrapped>;
};

export type MovementGroup = 'rear' | 'floor' | 'side' | 'all-beams';

export type MovementActionId =
  | 'fan-open'
  | 'fan-close'
  | 'sweep-left'
  | 'sweep-right'
  | 'cross'
  | 'converge'
  | 'burst'
  | 'chase'
  | 'hold'
  | 'idle-scan';

export type MovementActionDefinition = {
  id: MovementActionId;
  label: string;
  beats: number | null;
  note: string;
};

export const MOVEMENT_ACTIONS: readonly MovementActionDefinition[] = [
  { id: 'fan-open', label: '扇形展开 · 2拍', beats: 2, note: '从当前构型展开成宽扇形' },
  { id: 'fan-close', label: '扇形收拢 · 2拍', beats: 2, note: '从当前构型向舞台中轴收拢' },
  { id: 'sweep-left', label: '整组左扫 · 2拍', beats: 2, note: '整组保留少量间距向左移动' },
  { id: 'sweep-right', label: '整组右扫 · 2拍', beats: 2, note: '整组保留少量间距向右移动' },
  { id: 'cross', label: '左右交叉 · 2拍', beats: 2, note: '左半组向右、右半组向左' },
  { id: 'converge', label: '聚焦中央 · 2拍', beats: 2, note: '所有灯束指向舞台中央表演区' },
  { id: 'burst', label: '快速炸开 · 1拍', beats: 1, note: '快速向外展开，适合 crash / 段落击打' },
  { id: 'chase', label: '追逐展开 · 4拍', beats: 4, note: '灯具按顺序启动，形成一句完整动作' },
  { id: 'hold', label: '停住 / Hold', beats: null, note: '取消移动并关闭扫描，停在画面当前位置' },
  { id: 'idle-scan', label: '待机 Scan · 16拍', beats: 16, note: '很小幅度的慢速待机漂移，不作为主运动' },
] as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) ? Number(value) : fallback;

export class MovementActionLab {
  private readonly stage: LightingStage;
  private readonly executor: PhysicalLightingExecutor;
  private readonly internals: ExecutorInternals;
  private readonly timers = new Set<number>();
  private readonly onStatus?: (message: string) => void;

  constructor(
    stage: LightingStage,
    executor: PhysicalLightingExecutor,
    onStatus?: (message: string) => void,
  ) {
    this.stage = stage;
    this.executor = executor;
    this.internals = executor as unknown as ExecutorInternals;
    this.onStatus = onStatus;
  }

  run(actionId: MovementActionId, group: MovementGroup): void {
    this.clearTimers();
    const fixtures = this.select(group);
    if (!fixtures.length) {
      this.onStatus?.('这个灯组里没有可调试的 Beam');
      return;
    }

    const definition = MOVEMENT_ACTIONS.find((item) => item.id === actionId);
    const beat = this.beatSeconds();

    switch (actionId) {
      case 'fan-open':
        this.moveFan(fixtures, 64, 2, 0);
        break;
      case 'fan-close':
        this.moveFan(fixtures, 8, 2, 0);
        break;
      case 'sweep-left':
        this.moveSweep(fixtures, -30, 2);
        break;
      case 'sweep-right':
        this.moveSweep(fixtures, 30, 2);
        break;
      case 'cross':
        this.moveCross(fixtures, 2);
        break;
      case 'converge':
        this.moveConverge(fixtures, 2);
        break;
      case 'burst':
        this.moveFan(fixtures, 82, 1, 7);
        break;
      case 'chase':
        this.moveChase(fixtures, beat);
        break;
      case 'hold':
        this.hold(fixtures);
        break;
      case 'idle-scan':
        this.idleScan(fixtures);
        break;
    }

    this.onStatus?.(`${definition?.label ?? actionId} · ${groupLabel(group)}`);
  }

  cancel(): void {
    this.clearTimers();
    for (const wrapped of this.internals.wrapped.values()) {
      wrapped.plan = null;
      wrapped.motion.vPan = 0;
      wrapped.motion.vTilt = 0;
      wrapped.motion.vAngle = 0;
      wrapped.motion.vDistance = 0;
    }
  }

  private beatSeconds(): number {
    const bpm = clamp(finite(this.stage.bpm, 108), 40, 220);
    return 60 / bpm;
  }

  private select(group: MovementGroup): LabFixture[] {
    const all = [...this.stage.lights.values()] as unknown as LabFixture[];
    if (group === 'all-beams') return all.filter((fixture) => fixture.type === 'beam');
    return all.filter((fixture) => fixture.type === 'beam' && fixture.groups.has(group));
  }

  private moveFan(fixtures: LabFixture[], width: number, beats: number, tiltSpread: number): void {
    fixtures.forEach((fixture, index) => {
      const pan = fanValue(index, fixtures.length, width);
      const tilt = this.baseTilt(fixture) + fanValue(index, fixtures.length, tiltSpread);
      this.move(fixture, { pan, tilt, scan: null }, beats);
    });
  }

  private moveSweep(fixtures: LabFixture[], center: number, beats: number): void {
    fixtures.forEach((fixture, index) => {
      const pan = center + fanValue(index, fixtures.length, 18);
      this.move(fixture, { pan, tilt: this.baseTilt(fixture), scan: null }, beats);
    });
  }

  private moveCross(fixtures: LabFixture[], beats: number): void {
    const middle = (fixtures.length - 1) / 2;
    fixtures.forEach((fixture, index) => {
      const side = index <= middle ? 1 : -1;
      const depth = 24 + Math.abs(index - middle) * 4;
      this.move(fixture, {
        pan: side * depth,
        tilt: this.baseTilt(fixture) + (index % 2 ? 3 : -3),
        scan: null,
      }, beats);
    });
  }

  private moveConverge(fixtures: LabFixture[], beats: number): void {
    fixtures.forEach((fixture, index) => {
      const x = (index - (fixtures.length - 1) / 2) * 0.28;
      this.move(fixture, {
        target: [x, 2.0, 0.6],
        angle: 2.6,
        distance: 58,
        scan: null,
      }, beats);
    });
  }

  private moveChase(fixtures: LabFixture[], beatSeconds: number): void {
    const width = 68;
    const staggerBeats = fixtures.length <= 4 ? 0.7 : 0.5;
    fixtures.forEach((fixture, index) => {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        this.move(fixture, {
          pan: fanValue(index, fixtures.length, width),
          tilt: this.baseTilt(fixture) + fanValue(index, fixtures.length, 6),
          scan: null,
        }, 1);
      }, index * staggerBeats * beatSeconds * 1000);
      this.timers.add(timer);
    });
  }

  private hold(fixtures: LabFixture[]): void {
    for (const fixture of fixtures) {
      const wrapped = this.internals.wrapped.get(fixture.id);
      if (wrapped) {
        wrapped.plan = null;
        wrapped.motion.vPan = 0;
        wrapped.motion.vTilt = 0;
        wrapped.motion.vAngle = 0;
        wrapped.motion.vDistance = 0;
      }
      fixture.set({ scan: null }, 0.22);
    }
  }

  private idleScan(fixtures: LabFixture[]): void {
    const speed = 1 / (16 * this.beatSeconds());
    fixtures.forEach((fixture, index) => {
      fixture.set({
        scan: {
          pan: 2.2,
          tilt: 1.1,
          speed,
          phase: index * 0.72,
        },
      }, 0.32);
    });
  }

  private move(fixture: LabFixture, patch: FixturePatch, beats: number): void {
    const wrappedBefore = this.internals.wrapped.get(fixture.id);
    const motion = wrappedBefore?.motion;
    const completePatch: FixturePatch = {
      angle: motion?.angle,
      distance: motion?.distance,
      ...patch,
    };
    if (completePatch.angle === undefined) delete completePatch.angle;
    if (completePatch.distance === undefined) delete completePatch.distance;

    fixture.set(completePatch, 0);

    // Fixture.set() creates a physically valid plan that starts from the actual current pose.
    // For the action lab we keep that plan, but stretch/compress its requested arrival to an exact beat length.
    // The actuator's speed/acceleration limits still win if the requested time is physically impossible.
    const wrapped = this.internals.wrapped.get(fixture.id);
    const plan = wrapped?.plan;
    if (!plan) return;
    plan.arriveAt = plan.startAt + Math.max(0.08, beats * this.beatSeconds());
  }

  private baseTilt(fixture: LabFixture): number {
    if (fixture.groups.has('floor')) return 40;
    if (fixture.groups.has('rear')) return -24;
    if (fixture.groups.has('side')) return -12;
    return finite(this.internals.wrapped.get(fixture.id)?.motion.tilt, -20);
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
  }
}

function fanValue(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return ((index / (count - 1)) - 0.5) * width;
}

function groupLabel(group: MovementGroup): string {
  if (group === 'rear') return 'Rear';
  if (group === 'floor') return 'Floor';
  if (group === 'side') return 'Side';
  return 'All Beam';
}
