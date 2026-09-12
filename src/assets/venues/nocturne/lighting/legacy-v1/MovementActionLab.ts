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

export type MovementLabPhase = 'IDLE' | 'PREPARE' | 'READY' | 'PLAY' | 'HOLD' | 'RETURN';

export type MovementLabStatus = {
  phase: MovementLabPhase;
  message: string;
  progress?: number;
};

export type MovementActionDefinition = {
  id: MovementActionId;
  label: string;
  defaultBeats: number;
  note: string;
};

export const MOVEMENT_ACTIONS: readonly MovementActionDefinition[] = [
  { id: 'fan-open', label: '扇形展开', defaultBeats: 2, note: '先收成窄扇形，再向两侧展开。' },
  { id: 'fan-close', label: '扇形收拢', defaultBeats: 2, note: '先形成宽扇形，再向舞台中轴收拢。' },
  { id: 'sweep-left', label: '整组左扫', defaultBeats: 2, note: '先把整组放在右侧，再完整扫向左侧。' },
  { id: 'sweep-right', label: '整组右扫', defaultBeats: 2, note: '先把整组放在左侧，再完整扫向右侧。' },
  { id: 'cross', label: '左右交叉', defaultBeats: 2, note: '先左右分开，再让两半灯束交叉穿过舞台中心。' },
  { id: 'converge', label: '聚焦中央', defaultBeats: 2, note: '先向外分散，再一起聚焦到中央表演区。' },
  { id: 'burst', label: '快速炸开', defaultBeats: 1, note: '先紧密收束在中央，再快速向外炸开。' },
  { id: 'chase', label: '追逐展开', defaultBeats: 4, note: '先全部收拢，再按灯具顺序逐盏展开。' },
  { id: 'hold', label: '停住 / Hold', defaultBeats: 2, note: '准备阶段先保持轻微运动，播放时立刻结束运动并稳定停住。' },
  { id: 'idle-scan', label: '待机 Scan', defaultBeats: 16, note: '先静止构图，再开启极小幅度循环漂移；拍数表示一个扫描周期。' },
] as const;

const PREPARE_BEATS = 1.5;
const READY_HOLD_BEATS = 0.75;
const END_HOLD_BEATS = 1.5;
const DEBUG_COLOR = '#f4f0e7';
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) ? Number(value) : fallback;

export class MovementActionLab {
  private readonly stage: LightingStage;
  private readonly executor: PhysicalLightingExecutor;
  private readonly internals: ExecutorInternals;
  private readonly actionTimers = new Set<number>();
  private readonly waitTimers = new Map<number, (continued: boolean) => void>();
  private readonly onStatus?: (status: MovementLabStatus) => void;

  private sequence = 0;
  private prepared: { actionId: MovementActionId; group: MovementGroup } | null = null;
  private lastProgressAt = 0;

  constructor(
    stage: LightingStage,
    executor: PhysicalLightingExecutor,
    onStatus?: (status: MovementLabStatus) => void,
  ) {
    this.stage = stage;
    this.executor = executor;
    this.internals = executor as unknown as ExecutorInternals;
    this.onStatus = onStatus;
  }

  async prepare(actionId: MovementActionId, group: MovementGroup): Promise<boolean> {
    const token = this.beginSequence(false);
    return this.prepareWithin(actionId, group, token);
  }

  async play(actionId: MovementActionId, group: MovementGroup, beats: number): Promise<boolean> {
    const keepPrepared = this.prepared?.actionId === actionId && this.prepared.group === group;
    const token = this.beginSequence(keepPrepared);
    const fixtures = this.select(group);
    if (!fixtures.length) return this.noFixtures();

    if (!keepPrepared) {
      const ready = await this.prepareWithin(actionId, group, token);
      if (!ready) return false;
      const continued = await this.waitBeats(READY_HOLD_BEATS, token);
      if (!continued) return false;
    }

    return this.playWithin(actionId, group, sanitizeBeats(beats), token, true);
  }

  async replay(actionId: MovementActionId, group: MovementGroup, beats: number): Promise<boolean> {
    const token = this.beginSequence(false);
    const ready = await this.prepareWithin(actionId, group, token);
    if (!ready) return false;
    if (!await this.waitBeats(READY_HOLD_BEATS, token)) return false;
    return this.playWithin(actionId, group, sanitizeBeats(beats), token, true);
  }

  async autoDemo(actionId: MovementActionId, group: MovementGroup, beats: number): Promise<boolean> {
    const token = this.beginSequence(false);
    const fixtures = this.select(group);
    if (!fixtures.length) return this.noFixtures();

    const ready = await this.prepareWithin(actionId, group, token);
    if (!ready) return false;
    if (!await this.waitBeats(READY_HOLD_BEATS, token)) return false;

    const durationBeats = sanitizeBeats(beats);
    const played = await this.playWithin(actionId, group, durationBeats, token, false);
    if (!played || token !== this.sequence) return false;

    if (actionId === 'idle-scan') {
      this.emit('PLAY', `待机漂移 · ${formatBeats(durationBeats)} 拍一个周期`, 1);
      if (!await this.waitBeats(Math.min(4, Math.max(2, durationBeats / 2)), token)) return false;
      this.hold(fixtures);
      this.emit('HOLD', '结束待机 Scan · 回到静止', 1);
      await this.waitBeats(1, token);
      this.prepared = { actionId, group };
      this.emit('READY', '静止初始状态 · 可以再次播放', 1);
      return true;
    }

    if (!await this.waitBeats(actionId === 'hold' ? 2 : END_HOLD_BEATS, token)) return false;
    if (actionId === 'hold') {
      this.emit('HOLD', '灯束已经稳定停住', 1);
      return true;
    }

    this.emit('RETURN', '返回这个动作的初始状态', 0);
    this.applyPreparationPose(actionId, fixtures, Math.max(1, Math.min(2.5, durationBeats)));
    const returned = await this.waitForSettled(fixtures, token, Math.max(3, durationBeats + 2), 'RETURN', Math.max(1, durationBeats));
    if (!returned) return false;
    if (!await this.waitBeats(1, token)) return false;
    this.prepared = { actionId, group };
    this.emit('READY', '已回到标准初始状态 · 可继续观察', 1);
    return true;
  }

  /** Backward-compatible one-shot entry for console experiments. */
  run(actionId: MovementActionId, group: MovementGroup, beats?: number): void {
    const definition = MOVEMENT_ACTIONS.find((item) => item.id === actionId);
    void this.play(actionId, group, beats ?? definition?.defaultBeats ?? 2);
  }

  cancel(): void {
    this.sequence += 1;
    this.clearTimers();
    this.cancelPhysicalPlans();
    this.prepared = null;
  }

  private async prepareWithin(actionId: MovementActionId, group: MovementGroup, token: number): Promise<boolean> {
    if (token !== this.sequence) return false;
    const fixtures = this.select(group);
    if (!fixtures.length) return this.noFixtures();

    this.prepared = null;
    this.isolate(fixtures);
    const definition = MOVEMENT_ACTIONS.find((item) => item.id === actionId);
    this.emit('PREPARE', `${definition?.label ?? actionId} · 正在进入标准初始状态`, 0);
    this.applyPreparationPose(actionId, fixtures, PREPARE_BEATS);

    const settled = await this.waitForSettled(fixtures, token, 5, 'PREPARE', PREPARE_BEATS);
    if (!settled || token !== this.sequence) return false;

    if (actionId === 'hold') {
      this.startHoldPreparationMotion(fixtures);
      if (!await this.waitBeats(0.45, token)) return false;
    }

    this.prepared = { actionId, group };
    this.emit('READY', `${definition?.label ?? actionId} · 初始状态已就绪`, 1);
    return true;
  }

  private async playWithin(
    actionId: MovementActionId,
    group: MovementGroup,
    beats: number,
    token: number,
    finishWithHold: boolean,
  ): Promise<boolean> {
    if (token !== this.sequence) return false;
    const fixtures = this.select(group);
    if (!fixtures.length) return this.noFixtures();

    this.prepared = null;
    const definition = MOVEMENT_ACTIONS.find((item) => item.id === actionId);
    this.emit('PLAY', `${definition?.label ?? actionId} · ${formatBeats(beats)} 拍`, 0);
    this.execute(actionId, fixtures, beats);

    if (actionId === 'idle-scan') {
      this.emit('PLAY', `待机 Scan 已开启 · ${formatBeats(beats)} 拍一个周期`, 1);
      return true;
    }

    if (actionId === 'hold') {
      this.emit('HOLD', '运动已停止 · Hold', 1);
      return true;
    }

    const settled = await this.waitForSettled(fixtures, token, Math.max(4, beats + 3), 'PLAY', beats);
    if (!settled || token !== this.sequence) return false;
    if (finishWithHold) this.emit('HOLD', `${definition?.label ?? actionId} · 已到达结束姿态`, 1);
    return true;
  }

  private execute(actionId: MovementActionId, fixtures: LabFixture[], beats: number): void {
    switch (actionId) {
      case 'fan-open':
        this.moveFan(fixtures, 66, beats, 2);
        break;
      case 'fan-close':
        this.moveFan(fixtures, 8, beats, 0);
        break;
      case 'sweep-left':
        this.moveSweep(fixtures, -34, beats);
        break;
      case 'sweep-right':
        this.moveSweep(fixtures, 34, beats);
        break;
      case 'cross':
        this.moveCross(fixtures, beats);
        break;
      case 'converge':
        this.moveConverge(fixtures, beats);
        break;
      case 'burst':
        this.moveFan(fixtures, 86, beats, 10);
        break;
      case 'chase':
        this.moveChase(fixtures, beats);
        break;
      case 'hold':
        this.hold(fixtures);
        break;
      case 'idle-scan':
        this.idleScan(fixtures, beats);
        break;
    }
  }

  private applyPreparationPose(actionId: MovementActionId, fixtures: LabFixture[], beats: number): void {
    switch (actionId) {
      case 'fan-open':
        this.moveFan(fixtures, 8, beats, 0);
        break;
      case 'fan-close':
        this.moveFan(fixtures, 70, beats, 3);
        break;
      case 'sweep-left':
        this.moveSweep(fixtures, 34, beats);
        break;
      case 'sweep-right':
        this.moveSweep(fixtures, -34, beats);
        break;
      case 'cross':
        this.moveSeparated(fixtures, beats);
        break;
      case 'converge':
        this.moveFan(fixtures, 72, beats, 6);
        break;
      case 'burst':
        this.moveFan(fixtures, 5, beats, 0);
        break;
      case 'chase':
        this.moveFan(fixtures, 6, beats, 0);
        break;
      case 'hold':
        this.moveFan(fixtures, 44, beats, 3);
        break;
      case 'idle-scan':
        this.moveFan(fixtures, 44, beats, 2);
        break;
    }
  }

  private isolate(selected: LabFixture[]): void {
    const selectedIds = new Set(selected.map((fixture) => fixture.id));
    const all = [...this.stage.lights.values()] as unknown as LabFixture[];
    for (const fixture of all) {
      if (fixture.type !== 'beam') continue;
      if (selectedIds.has(fixture.id)) {
        fixture.set({
          enabled: true,
          beam: true,
          color: DEBUG_COLOR,
          intensity: 0.54,
          strobe: 0,
          beatSensitivity: 0,
          scan: null,
        }, 0.22);
      } else {
        fixture.set({ intensity: 0.012, strobe: 0, beatSensitivity: 0, scan: null }, 0.22);
      }
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

  private moveSeparated(fixtures: LabFixture[], beats: number): void {
    const middle = (fixtures.length - 1) / 2;
    fixtures.forEach((fixture, index) => {
      const side = index <= middle ? -1 : 1;
      const depth = 24 + Math.abs(index - middle) * 4;
      this.move(fixture, {
        pan: side * depth,
        tilt: this.baseTilt(fixture) + (index % 2 ? 3 : -3),
        scan: null,
      }, beats);
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

  private moveChase(fixtures: LabFixture[], totalBeats: number): void {
    const width = 70;
    const count = Math.max(1, fixtures.length);
    const startWindow = totalBeats * 0.58;
    const travelBeats = Math.max(0.35, totalBeats * 0.42);
    const staggerBeats = count <= 1 ? 0 : startWindow / (count - 1);
    const beatSeconds = this.beatSeconds();

    fixtures.forEach((fixture, index) => {
      const timer = window.setTimeout(() => {
        this.actionTimers.delete(timer);
        this.move(fixture, {
          pan: fanValue(index, fixtures.length, width),
          tilt: this.baseTilt(fixture) + fanValue(index, fixtures.length, 6),
          scan: null,
        }, travelBeats);
      }, index * staggerBeats * beatSeconds * 1000);
      this.actionTimers.add(timer);
    });
  }

  private hold(fixtures: LabFixture[]): void {
    for (const fixture of fixtures) {
      const wrapped = this.internals.wrapped.get(fixture.id);
      if (wrapped) {
        wrapped.plan = null;
        zeroVelocity(wrapped.motion);
      }
      fixture.set({ scan: null }, 0.22);
    }
  }

  private startHoldPreparationMotion(fixtures: LabFixture[]): void {
    const speed = 1 / (8 * this.beatSeconds());
    fixtures.forEach((fixture, index) => {
      fixture.set({
        scan: {
          pan: 5.5,
          tilt: 2.4,
          speed,
          phase: index * 0.74,
        },
      }, 0.32);
    });
  }

  private idleScan(fixtures: LabFixture[], periodBeats: number): void {
    const speed = 1 / (Math.max(0.25, periodBeats) * this.beatSeconds());
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

    // Fixture.set() creates a physically valid plan starting from the actual current pose.
    // The lab only changes the requested arrival time; max velocity/acceleration still cap the actuator.
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

  private beginSequence(preservePrepared: boolean): number {
    this.sequence += 1;
    this.clearTimers();
    this.cancelPhysicalPlans();
    if (!preservePrepared) this.prepared = null;
    this.lastProgressAt = 0;
    return this.sequence;
  }

  private cancelPhysicalPlans(): void {
    for (const wrapped of this.internals.wrapped.values()) {
      wrapped.plan = null;
      zeroVelocity(wrapped.motion);
    }
  }

  private async waitForSettled(
    fixtures: LabFixture[],
    token: number,
    timeoutBeats: number,
    phase: MovementLabPhase,
    plannedBeats: number,
  ): Promise<boolean> {
    const startedAt = performance.now();
    const timeoutAt = startedAt + Math.max(1, timeoutBeats) * this.beatSeconds() * 1000;
    const plannedMs = Math.max(0.08, plannedBeats * this.beatSeconds()) * 1000;

    while (token === this.sequence) {
      const moving = fixtures.some((fixture) => this.internals.wrapped.get(fixture.id)?.plan != null);
      if (!moving && this.actionTimers.size === 0) return true;

      const now = performance.now();
      if (now - this.lastProgressAt > 90) {
        this.lastProgressAt = now;
        const progress = clamp((now - startedAt) / plannedMs, 0, 0.98);
        const label = phase === 'PREPARE' ? '正在摆到初始姿态' : phase === 'RETURN' ? '正在返回初始姿态' : '动作执行中';
        this.emit(phase, `${label} · ${(progress * plannedBeats).toFixed(1)} / ${formatBeats(plannedBeats)} 拍`, progress);
      }

      if (now > timeoutAt) {
        this.emit(phase, '物理灯具仍在追赶目标位置', 0.98);
        return true;
      }
      if (!await this.waitSeconds(0.04, token)) return false;
    }
    return false;
  }

  private waitBeats(beats: number, token: number): Promise<boolean> {
    return this.waitSeconds(Math.max(0, beats) * this.beatSeconds(), token);
  }

  private waitSeconds(seconds: number, token: number): Promise<boolean> {
    if (token !== this.sequence) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.waitTimers.delete(timer);
        resolve(token === this.sequence);
      }, Math.max(0, seconds) * 1000);
      this.waitTimers.set(timer, resolve);
    });
  }

  private clearTimers(): void {
    for (const timer of this.actionTimers) window.clearTimeout(timer);
    this.actionTimers.clear();
    for (const [timer, resolve] of this.waitTimers) {
      window.clearTimeout(timer);
      resolve(false);
    }
    this.waitTimers.clear();
  }

  private emit(phase: MovementLabPhase, message: string, progress?: number): void {
    this.onStatus?.({ phase, message, progress });
  }

  private noFixtures(): false {
    this.emit('IDLE', '这个灯组里没有可调试的 Beam', 0);
    return false;
  }
}

function zeroVelocity(motion: ExecutorMotion): void {
  motion.vPan = 0;
  motion.vTilt = 0;
  motion.vAngle = 0;
  motion.vDistance = 0;
}

function fanValue(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return ((index / (count - 1)) - 0.5) * width;
}

function sanitizeBeats(beats: number): number {
  return clamp(finite(beats, 2), 0.25, 32);
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(1).replace(/\.0$/, '');
}
