// 猪龙鱼链球族 2611/5526 出生前移支行为锁（1457 Player.cs:47648-47657 / 1456 :46603-46612 同文）：
//  ①偏移量恒等 1px（单位向量,非 1 格 16px——任务前提"前移 1 格(16px)"系误读,:47655 += 的是已归一向量）
//  ②方向 = normalize(MouseWorld − pointPosition)（:47619-47622 归一,:47653 防御性重归一）
//  ③vid 门：仅 2611 Flairon / 5526 FlaironFlail 在册,其余链锤/悠悠球原样返回
//  ④零向量门：鼠标恰压玩家中心不偏移（:47651 `!= Vector2.Zero` 字面,勿用 cos/sin(ang) 路线）
//  ⑤盒心落点积分：偏移后中心 → FlailProj + placeAtShootSpawn 盒心=偏移后 pointPosition（:10878-10879）
//  ⑥在册集合内容锁
// ★落位：本文件应置于 game/tests/flairon-spawn-nudge.test.ts（依赖 /tmp/p2/2611-branch.ts
//  【A】段 helper 先落入 src/entities/WeaponProj.ts,Game.ts【B】段接线由本文件⑤间接覆盖）。
//  运行：cd game && npx vitest run tests/flairon-spawn-nudge.test.ts
import { describe, it, expect } from 'vitest';
import { FlailProj, placeAtShootSpawn, flaironSpawnNudge, FLAIRON_NUDGE_VIDS } from '../src/entities/WeaponProj';

const CX = 1000, CY = 500;

/** 在 (CX,CY) 玩家中心、鼠标 (CX+ax, CY+ay) 下取 2611/5526 偏移后出生中心 */
function nudged(vid: number, ax: number, ay: number): { x: number; y: number } {
  return flaironSpawnNudge(vid, CX, CY, CX + ax, CY + ay);
}

describe('猪龙鱼链球族 2611/5526 出生前移支（1457 Player.cs:47648-47657）', () => {
  it('①偏移量恒等 1px（单位向量,非 1 格 16px）——任意瞄准向', () => {
    for (const [ax, ay] of [[200, 0], [0, -150], [3, 4], [-7, 24], [1, 1], [-123, -45]] as const) {
      for (const vid of [2611, 5526]) {
        const s = nudged(vid, ax, ay);
        const d = Math.hypot(s.x - CX, s.y - CY);
        expect(d, `vid=${vid} aim=(${ax},${ay})`).toBeCloseTo(1, 9);        // += 单位向量 = 1px
        expect(d, `16px 误读反锁 vid=${vid} aim=(${ax},${ay})`).toBeLessThan(1.0001);
      }
    }
  });

  it('②方向 = 瞄准单位向 normalize(MouseWorld−pointPosition)（:47619-47622）', () => {
    const s = nudged(2611, 3, 4);                                          // len=5
    expect(s.x - CX).toBeCloseTo(0.6, 12);
    expect(s.y - CY).toBeCloseTo(0.8, 12);
    const s2 = nudged(5526, -7, 24);                                       // len=25
    expect(s2.x - CX).toBeCloseTo(-7 / 25, 12);
    expect(s2.y - CY).toBeCloseTo(24 / 25, 12);
  });

  it('③vid 门：仅 2611/5526 在册,其余链锤/悠悠球原样返回（无偏移）', () => {
    for (const vid of [25, 26, 35, 63, 154, 247, 757, 947, 948, 220, 1226, -1]) {
      expect(flaironSpawnNudge(vid, CX, CY, CX + 3, CY + 4), `vid=${vid}`)
        .toEqual({ x: CX, y: CY });
    }
    for (const vid of [2611, 5526]) {
      const s = flaironSpawnNudge(vid, CX, CY, CX + 3, CY + 4);
      expect(s.x).not.toBe(CX);                                            // 在册件必偏移
    }
  });

  it('④零向量门：鼠标恰压玩家中心不偏移（:47651 != Vector2.Zero 字面）', () => {
    expect(flaironSpawnNudge(2611, CX, CY, CX, CY)).toEqual({ x: CX, y: CY });
    expect(flaironSpawnNudge(5526, CX, CY, CX, CY)).toEqual({ x: CX, y: CY });
  });

  it('⑤盒心落点积分：FlailProj(1058) 偏移中心 + placeAtShootSpawn → 盒心=偏移后 pointPosition', () => {
    const flSpawn = nudged(5526, 300, 400);                                // 单位向 (0.6,0.8)
    const p = new FlailProj(flSpawn.x, flSpawn.y, 66, 4.5, 1058,
      () => true, () => ({ x: CX + 300, y: CY + 400 }));
    placeAtShootSpawn(p, flSpawn.x, flSpawn.y);                            // 盒心落点（Projectile.cs:10878-10879）
    expect(p.w).toBe(26);                                                  // SetDefaults 1058 宽 26（vanilla-projectiles.json）
    expect(p.x + p.w / 2).toBeCloseTo(flSpawn.x, 10);
    expect(p.y + p.h / 2).toBeCloseTo(flSpawn.y, 10);
    // 与未偏移基线（玩家中心直落）对比：盒心恰前移单位向 (0.6,0.8)
    const q = new FlailProj(CX, CY, 66, 4.5, 1058,
      () => true, () => ({ x: CX + 300, y: CY + 400 }));
    placeAtShootSpawn(q, CX, CY);
    expect(p.x + p.w / 2 - (q.x + q.w / 2)).toBeCloseTo(0.6, 12);
    expect(p.y + p.h / 2 - (q.y + q.h / 2)).toBeCloseTo(0.8, 12);
  });

  it('⑥在册集合内容锁（勿扩名单：全库唯二受惠件）', () => {
    expect([...FLAIRON_NUDGE_VIDS].sort((a, b) => a - b)).toEqual([2611, 5526]);
  });
});
