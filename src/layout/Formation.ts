import type { StageLayout, StageRect } from '../venues/StageLayout.ts';

export type FormationRole = 'rear-center' | 'wing' | 'front';
export interface Point { x: number; z: number }
export interface FormationMember {
  id: string;
  width: number;
  depth: number;
  role: FormationRole;
  position: Point;
  locked: boolean;
}
export interface FormationResult { positions: Map<string, Point>; unplaced: string[]; issues: string[] }

/** Artistic spacing is independent of the venue's minimum clearance. All lengths are metres. */
export const CONCERT_FORMATION = {
  gap: .8, rowGap: .9, frontSpacing: 3, maxFrontWidth: 10, arcDepth: .45,
} as const;
const EPS = 1e-6;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const byId = (a: FormationMember, b: FormationMember) => a.id.localeCompare(b.id, 'en');
const rowWidth = (row: readonly FormationMember[], gap: number) => row.reduce((sum, item) => sum + item.width, 0) + Math.max(0, row.length - 1) * gap;
function rect(item: FormationMember, p: Point): StageRect {
  return { minX: p.x - item.width / 2, maxX: p.x + item.width / 2, minZ: p.z - item.depth / 2, maxZ: p.z + item.depth / 2 };
}
function intersects(a: StageRect, b: StageRect, gap: number): boolean {
  return a.minX < b.maxX + gap - EPS && a.maxX > b.minX - gap + EPS && a.minZ < b.maxZ + gap - EPS && a.maxZ > b.minZ - gap + EPS;
}
function inside(a: StageRect, b: StageRect): boolean {
  return a.minX >= b.minX - EPS && a.maxX <= b.maxX + EPS && a.minZ >= b.minZ - EPS && a.maxZ <= b.maxZ + EPS;
}

/** Compose the entire roster before solving collisions. IDs stabilize same-role ordering. */
export function concertTargets(members: readonly FormationMember[], stage: StageLayout): Map<string, Point> {
  const items = [...members].sort(byId), positions = new Map<string, Point>();
  const cx = (stage.area.minX + stage.area.maxX) / 2, cz = (stage.area.minZ + stage.area.maxZ) / 2;
  const centers = items.filter(i => i.role === 'rear-center'), wings = items.filter(i => i.role === 'wing'), front = items.filter(i => i.role === 'front');
  const gap = Math.max(stage.gap, CONCERT_FORMATION.gap);
  const back = [...centers, ...wings];
  const backDepth = Math.max(0, ...back.map(i => i.depth)), frontDepth = Math.max(0, ...front.map(i => i.depth));
  const rowGap = Math.max(stage.gap, CONCERT_FORMATION.rowGap);
  const rearZ = front.length && back.length ? cz - (frontDepth + rowGap) / 2 : cz;
  const frontZ = front.length && back.length ? cz + (backDepth + rowGap) / 2 : cz;
  const placeRow = (row: readonly FormationMember[], z: number, width = rowWidth(row, gap), arc = 0) => {
    const extra = row.length > 1 ? (width - rowWidth(row, 0)) / (row.length - 1) : 0;
    let edge = cx - width / 2;
    for (const item of row) {
      const x = edge + item.width / 2;
      const phase = width > item.width ? Math.min(1, Math.abs(x - cx) / ((width - item.width) / 2)) : 0;
      positions.set(item.id, { x, z: z + arc * (1 - phase * phase) });
      edge += item.width + extra;
    }
  };
  placeRow(centers, rearZ);
  if (!centers.length) placeRow(wings, rearZ);
  else {
    // Extend two wing groups outwards; never send an extra wing behind the center anchor.
    let left = rowWidth(centers, gap) / 2, right = left;
    for (const item of wings) {
      const isLeft = left <= right;
      const reach = (isLeft ? left : right) + gap + item.width / 2;
      positions.set(item.id, { x: cx + (isLeft ? -reach : reach), z: rearZ + .25 });
      if (isLeft) left += gap + item.width; else right += gap + item.width;
    }
  }
  const naturalWidth = rowWidth(front, gap);
  const rearWidth = centers.length ? rowWidth(back, gap) : rowWidth(wings, gap);
  const spreadWidth = Math.min(CONCERT_FORMATION.maxFrontWidth, Math.max(front.length * CONCERT_FORMATION.frontSpacing, rearWidth * .8));
  const width = front.length > 1 ? Math.max(naturalWidth, Math.min(spreadWidth, stage.area.maxX - stage.area.minX)) : naturalWidth;
  placeRow(front, frontZ, width, front.length > 1 ? CONCERT_FORMATION.arcDepth : 0);
  return positions;
}

function inputIssues(members: readonly FormationMember[], stage: StageLayout): string[] {
  const validRect = (r: StageRect) => [r.minX, r.maxX, r.minZ, r.maxZ].every(Number.isFinite) && r.minX < r.maxX && r.minZ < r.maxZ;
  if (!validRect(stage.area) || stage.exclusions.some(r => !validRect(r)) || !Number.isFinite(stage.gap) || stage.gap < 0 || !Number.isFinite(stage.surfaceY)) return ['场馆空间约束无效'];
  const ids = new Set<string>(), issues: string[] = [];
  for (const item of members) {
    if (ids.has(item.id)) issues.push(`重复实例 ID：${item.id}`);
    ids.add(item.id);
    if (![item.width, item.depth].every(n => Number.isFinite(n) && n > 0) || ![item.position.x, item.position.z].every(Number.isFinite) || !['rear-center', 'wing', 'front'].includes(item.role)) issues.push(`${item.id} 的编队描述无效`);
  }
  return issues;
}

/** Validate exact saved positions independently of the artistic formation policy. */
export function validateFormation(members: readonly FormationMember[], stage: StageLayout): string[] {
  const issues = inputIssues(members, stage); if (issues.length) return issues;
  const placed: { id: string; box: StageRect }[] = [];
  for (const item of [...members].sort(byId)) {
    const box = rect(item, item.position);
    if (!inside(box, stage.area)) issues.push(`${item.id} 超出舞台边界`);
    if (stage.exclusions.some(other => intersects(box, other, stage.gap))) issues.push(`${item.id} 进入禁放区`);
    for (const other of placed) if (intersects(box, other.box, stage.gap)) issues.push(`${item.id} 与 ${other.id} 占位冲突`);
    placed.push({ id: item.id, box });
  }
  return issues;
}

/** Bounded deterministic adjustment. No model, instrument catalog, venue implementation or camera. */
export function arrangeFormation(members: readonly FormationMember[], stage: StageLayout): FormationResult {
  const result: FormationResult = { positions: new Map(), unplaced: [], issues: inputIssues(members, stage) };
  if (result.issues.length) return result;
  const locked = members.filter(i => i.locked);
  result.issues = validateFormation(locked, stage).map(issue => `锁定的 ${issue}`);
  if (result.issues.length) return result;
  const occupied = locked.map(item => rect(item, item.position));
  for (const item of locked) result.positions.set(item.id, { ...item.position });
  const targets = concertTargets(members, stage);
  const priority = { 'rear-center': 0, wing: 1, front: 2 };
  const pending = members.filter(i => !i.locked).sort((a, b) => priority[a.role] - priority[b.role] || b.width * b.depth - a.width * a.depth || byId(a, b));
  const valid = (box: StageRect) => inside(box, stage.area) && !stage.exclusions.some(other => intersects(box, other, stage.gap)) && !occupied.some(other => intersects(box, other, stage.gap));
  for (const item of pending) {
    const target = targets.get(item.id)!;
    const minX = stage.area.minX + item.width / 2, maxX = stage.area.maxX - item.width / 2;
    const minZ = stage.area.minZ + item.depth / 2, maxZ = stage.area.maxZ - item.depth / 2;
    let best: Point | null = null, bestScore = Infinity;
    const consider = (p: Point) => {
      const score = (p.x - target.x) ** 2 + 3 * (p.z - target.z) ** 2;
      if (score >= bestScore - EPS || !valid(rect(item, p))) return;
      best = p; bestScore = score;
    };
    if (minX <= maxX && minZ <= maxZ) {
      consider({ x: clamp(target.x, minX, maxX), z: clamp(target.z, minZ, maxZ) });
      if (bestScore > EPS) {
        // At most 97 x 97 candidates even in a very large custom venue; include both boundaries.
        const nx = Math.min(96, Math.max(1, Math.ceil((maxX - minX) / .25)));
        const nz = Math.min(96, Math.max(1, Math.ceil((maxZ - minZ) / .25)));
        for (let zi = 0; zi <= nz; zi++) for (let xi = 0; xi <= nx; xi++) consider({ x: minX + (maxX - minX) * xi / nx, z: minZ + (maxZ - minZ) * zi / nz });
      }
    }
    if (!best) { result.unplaced.push(item.id); result.issues.push(`${item.id} 没有找到足够的演奏空间，请调整编制、锁定位置或场馆`); continue; }
    result.positions.set(item.id, best); occupied.push(rect(item, best));
  }
  return result;
}
