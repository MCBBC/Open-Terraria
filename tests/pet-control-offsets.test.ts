// 宠物控制键偏移回归（PetFollower 登记缺口①清偿,2026-09-03）：
//   Wisp 211（AI_026 专属支 Projectile.cs:60779-60801）：controlLeft→目标 −120 /
//   controlRight→+120（if/else if,同按左优先）；纵轴按原文 if/else 结构——down 支
//   仅 +120【无 −60】（:60790-60793）,else 支 = 无条件 −60（:60800,基线 hoverY 即
//   该项）+ up −120（:60796-60798）→ 净偏移 up −180 / 无键 −60 / down +120。
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

describe('Wisp 211 控制键偏移（AI_026 :60779-60801）', () => {
  /** 收敛点断言：fly 趋近档稳态 = 目标点（hoverX 0/hoverY −60 + 控制键偏移）。
   *  200t 足够从 400px 外收敛进 brake 贴合（211 无 jitter/bob,flyAccel 缺省档） */
  const settle = (owner: Owner, startX: number, startY: number, ticks = 200): PetFollower => {
    const pet = new PetFollower(startX, startY, 211, () => owner);
    for (let i = 0; i < ticks; i++) pet.fixedUpdate(1, game);
    return pet;
  };
  const near = (a: number, b: number): number => Math.abs(a - b);

  it('controlLeft/Right → 收敛点 X = 玩家中心 ∓120（±120,:60782-60788）', () => {
    const none = mkOwner();
    const left = mkOwner({ inputLeft: true, inputRight: false, inputUp: false, inputDown: false });
    const right = mkOwner({ inputLeft: false, inputRight: true, inputUp: false, inputDown: false });
    const start = [none.cx + 300, none.cy - 160];
    const p0 = settle(none, start[0], start[1]);
    const p1 = settle(left, start[0], start[1]);
    const p2 = settle(right, start[0], start[1]);
    expect(near(p0.cx, none.cx)).toBeLessThan(1.5);        // hoverX=0 → 目标 X = 中心
    expect(near(p1.cx, left.cx - 120)).toBeLessThan(1.5);  // Left −120
    expect(near(p2.cx, right.cx + 120)).toBeLessThan(1.5); // Right +120
  });

  it('controlUp/Down → 收敛点 Y = −180 / −60 / +120（down 支无 −60,else 支 −60+up −120,:60790-60801）', () => {
    const none = mkOwner();
    const up = mkOwner({ inputUp: true, inputDown: false, inputLeft: false, inputRight: false });
    const down = mkOwner({ inputDown: true, inputUp: false, inputLeft: false, inputRight: false });
    const start = [none.cx + 300, none.cy - 160];
    expect(near(settle(none, start[0], start[1]).cy, none.cy - 60)).toBeLessThan(1.5);
    expect(near(settle(up, start[0], start[1]).cy, up.cy - 60 - 120)).toBeLessThan(1.5);
    expect(near(settle(down, start[0], start[1]).cy, down.cy + 120)).toBeLessThan(1.5);   // down 支仅 +120（:60792）,无 −60（红队 F7）
  });

  it('同按左+右 → 左优先（原版 if(controlLeft)/else if(controlRight) 序）', () => {
    const both = mkOwner({ inputLeft: true, inputRight: true, inputUp: false, inputDown: false });
    const leftOnly = mkOwner({ inputLeft: true, inputRight: false, inputUp: false, inputDown: false });
    const pb = settle(both, both.cx + 300, both.cy - 160);
    const pl = settle(leftOnly, leftOnly.cx + 300, leftOnly.cy - 160);
    expect(pb.cx).toBeCloseTo(pl.cx, 6);
  });

  it('owner 无输入态字段 → 偏移不生效（=原版 control* 恒假观感,回归保护）', () => {
    const bare = mkOwner();
    const flagged = mkOwner({ inputLeft: false, inputRight: false, inputUp: false, inputDown: false });
    const p0 = settle(bare, bare.cx + 300, bare.cy - 160);
    const p1 = settle(flagged, flagged.cx + 300, flagged.cy - 160);
    expect(p0.cx).toBeCloseTo(p1.cx, 6);
    expect(p0.cy).toBeCloseTo(p1.cy, 6);
  });
});

describe('ShadowOrb 18 控制键档（aiStyle 11 :24736-24745）', () => {
  /** 期望速度 = (目标−宠物中心)×(3/距离)（num84/85×num83/num88）——目标与
   *  保持距由控制键档决定;宠物中心从构造后的实际 cx/cy 反读（x,y 形参=顶左） */
  const expectVel = (pet: PetFollower, owner: Owner, tx: number, ty: number): void => {
    const dx = tx - pet.cx, dy = ty - pet.cy;
    const d = Math.hypot(dx, dy);
    pet.fixedUpdate(1, game);
    expect(pet.vx).toBeCloseTo(dx * (3 / d), 9);
    expect(pet.vy).toBeCloseTo(dy * (3 / d), 9);
  };

  it('controlUp → 目标=(中心X−6, 顶上40) 且保持距 70→4：速度直取向量', () => {
    const owner = mkOwner({ inputUp: true, inputDown: false });
    const pet = new PetFollower(owner.cx - 6, owner.y, 18, () => owner);   // 目标下方 ~40px
    expectVel(pet, owner, owner.cx - 6, owner.y - 40);
  });

  it('controlDown → 目标=(中心X−6, 底下40)：num84−=6 与 Y 目标同吃', () => {
    const owner = mkOwner({ inputDown: true, inputUp: false });
    // 起步 = 玩家中心（无键档的目标点）→ 有键后仍距目标 >4 → 保持移动（70→4 差异可观测）
    const pet = new PetFollower(owner.cx, owner.cy, 18, () => owner);
    expectVel(pet, owner, owner.cx - 6, owner.y + owner.h + 40);
  });

  it('无键：目标 = 玩家中心、保持距 70 死区（回归保护）', () => {
    const owner = mkOwner();
    const pet = new PetFollower(owner.cx + 100, owner.cy, 18, () => owner);
    expectVel(pet, owner, owner.cx, owner.cy);            // 距 ~100+ > 70 → 移动
    const inside = new PetFollower(owner.cx + 4, owner.cy, 18, () => owner);
    inside.fixedUpdate(1, game);
    expect(inside.vx).toBe(0); expect(inside.vy).toBe(0); // ≤70 死区（对中心距 <70）
    // 有 Up 键：同一点对(顶上40)目标距 > 4 → 不再死区、按新目标直取
    const up = mkOwner({ inputUp: true });
    const petUp = new PetFollower(owner.cx, owner.cy, 18, () => up);
    expectVel(petUp, up, owner.cx - 6, owner.y - 40);
  });
});
