// 宠物控制键偏移回归（PetFollower 登记缺口①清偿,2026-09-03）：
//   Wisp 211（AI_026 专属支 Projectile.cs:60779-60790）：controlLeft→目标 −120 /
//   controlRight→+120（if/else if,同按左优先）；controlDown→+120 / controlUp→−120
//   （缺省 hoverY −60 已含 = 原版 else 支无条件 num65−=60）。
//   ShadowOrb 18（aiStyle 11 :24736-24745）：controlUp→目标=(中心X−6, 顶上 40)、
//   controlDown→(中心X−6, 底下 40)，两档保持距 num87 70→4、num84−=6。
import { describe, it, expect } from 'vitest';
import { PetFollower } from '../src/entities/PetFollower';
import type { GameHooks } from '../src/entities/types';

const game = { world: { store: { inBounds: () => false, isSolid: () => false } } } as unknown as GameHooks;

interface Owner {
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  facing: number; dead: boolean; vx: number; vy: number;
  inputLeft?: boolean; inputRight?: boolean; inputUp?: boolean; inputDown?: boolean;
}
const mkOwner = (over: Partial<Owner> = {}): Owner => ({
  x: 100 * 16, y: 60 * 16, w: 20, h: 42,
  cx: 100 * 16 + 10, cy: 60 * 16 + 21,
  facing: 1, dead: false, vx: 0, vy: 0, ...over,
});

describe('Wisp 211 控制键偏移（AI_026 :60779-60790）', () => {
  /** 从玩家正右 30px 起步（无 catchUp/近贴分支，fly 常规趋近档） */
  const mkWisp = (owner: Owner): PetFollower =>
    new PetFollower(owner.cx + 30, owner.cy - 60 - 0, 211, () => owner);

  it('controlLeft → 目标 X −120：一拍后 vx 比无键档更向左', () => {
    const none = mkOwner();
    const left = mkOwner({ inputLeft: true, inputRight: false, inputUp: false, inputDown: false });
    const right = mkOwner({ inputLeft: false, inputRight: true, inputUp: false, inputDown: false });
    const p0 = mkWisp(none), p1 = mkWisp(left), p2 = mkWisp(right);
    p0.fixedUpdate(1, game); p1.fixedUpdate(1, game); p2.fixedUpdate(1, game);
    expect(p0.vx).toBeLessThan(0);           // 目标在玩家后上方 → 左
    expect(p1.vx).toBeLessThan(p0.vx);       // 左键目标再 −120 → 更负
    expect(p2.vx).toBeGreaterThan(p0.vx);    // 右键目标 +120
    // Y 轴不受左右键影响
    expect(p1.vy).toBeCloseTo(p0.vy, 9);
  });

  it('controlUp/Down → 目标 Y ∓120（缺省 hoverY −60 已在表）', () => {
    const none = mkOwner();
    const up = mkOwner({ inputUp: true, inputDown: false, inputLeft: false, inputRight: false });
    const down = mkOwner({ inputDown: true, inputUp: false, inputLeft: false, inputRight: false });
    const p0 = mkWisp(none), p1 = mkWisp(up), p2 = mkWisp(down);
    p0.fixedUpdate(1, game); p1.fixedUpdate(1, game); p2.fixedUpdate(1, game);
    expect(p0.vy).toBeLessThan(0);           // 缺省 hoverY −60 = 原版 else 支 num65−=60
    expect(p1.vy).toBeLessThan(p0.vy);       // Up 再 −120
    expect(p2.vy).toBeGreaterThan(0);        // Down +120（玩家中心下方 → 向下）
    expect(p1.vx).toBeCloseTo(p0.vx, 9);
  });

  it('同按左+右 → 左优先（原版 if(controlLeft)/else if(controlRight) 序）', () => {
    const both = mkOwner({ inputLeft: true, inputRight: true, inputUp: false, inputDown: false });
    const leftOnly = mkOwner({ inputLeft: true, inputRight: false, inputUp: false, inputDown: false });
    const pb = mkWisp(both), pl = mkWisp(leftOnly);
    pb.fixedUpdate(1, game); pl.fixedUpdate(1, game);
    expect(pb.vx).toBeCloseTo(pl.vx, 9);
  });

  it('owner 无输入态字段 → 偏移不生效（=原版 control* 恒假观感,回归保护）', () => {
    const bare = mkOwner();
    const flagged = mkOwner({ inputLeft: false, inputRight: false, inputUp: false, inputDown: false });
    const p0 = mkWisp(bare), p1 = mkWisp(flagged);
    p0.fixedUpdate(1, game); p1.fixedUpdate(1, game);
    expect(p0.vx).toBeCloseTo(p1.vx, 9);
    expect(p0.vy).toBeCloseTo(p1.vy, 9);
  });
});

describe('ShadowOrb 18 控制键档（aiStyle 11 :24736-24745）', () => {
  it('controlUp → 目标=(中心X−6, 顶上40) 且保持距 70→4：速度直取向量', () => {
    const owner = mkOwner({ inputUp: true, inputDown: false });
    // 起步点 = 目标正下方 40px（距目标 40 ∈ (4,70) → 以速度 3 直取）
    const pet = new PetFollower(owner.cx - 6, owner.y - 40 + 40, 18, () => owner);
    const dx = (owner.cx - 6) - (owner.cx - 6), dy = (owner.y - 40) - (owner.y - 40 + 40);
    pet.fixedUpdate(1, game);
    expect(pet.vx).toBeCloseTo(0, 9);
    expect(pet.vy).toBeCloseTo(dy * (3 / Math.hypot(dx, dy)), 9);   // num85×num83/num88
  });

  it('controlDown → 目标=(中心X−6, 底下40)：num84−=6 与 Y 目标同吃', () => {
    const owner = mkOwner({ inputDown: true, inputUp: false });
    const tx = owner.cx - 6, ty = owner.y + owner.h + 40;
    // 起步 = 玩家中心（无键档的目标点）→ 有键后仍距目标 >4 → 保持移动（70→4 差异可观测）
    const pet = new PetFollower(owner.cx, owner.cy, 18, () => owner);
    pet.fixedUpdate(1, game);
    const dx = tx - (owner.cx), dy = ty - (owner.cy);
    const d = Math.hypot(dx, dy);
    expect(pet.vx).toBeCloseTo(dx * (3 / d), 9);
    expect(pet.vy).toBeCloseTo(dy * (3 / d), 9);
  });

  it('无键：目标 = 玩家中心、保持距 70 死区（回归保护）', () => {
    const owner = mkOwner();
    const pet = new PetFollower(owner.cx + 30, owner.cy, 18, () => owner);   // 距 30 ∈ (4,70)
    pet.fixedUpdate(1, game);
    expect(pet.vx).toBeCloseTo(-30 * (3 / 30), 9);
    expect(pet.vy).toBeCloseTo(0, 9);
    // 死区：距离 ≤70 停 —— 无键档 30 <70？→ 30∈(4,70) 移动;置于 70 内死区验证
    const inside = new PetFollower(owner.cx + 4, owner.cy, 18, () => owner);
    inside.fixedUpdate(1, game);
    expect(inside.vx).toBe(0); expect(inside.vy).toBe(0);
    // 有 Up 键：同一点对(顶上40)目标距 = 21+40+... > 4 → 不再死区
    const up = mkOwner({ inputUp: true });
    const petUp = new PetFollower(owner.cx, owner.cy, 18, () => up);
    petUp.fixedUpdate(1, game);
    const d = Math.hypot(-6, (up.y - 40) - owner.cy);
    expect(petUp.vy).toBeCloseTo(((up.y - 40) - owner.cy) * (3 / d), 9);
  });
});
