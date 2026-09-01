// 植物族（AI_013）头部旋转回归：原版 cs:22778-22794——
// 43/101/175 头随朝玩家伸展方向旋转（目标在左 +π 且 spriteDirection=-1，不倒挂）；
// 259/260 恒 +π/2。此前只镜像不旋转 → "横向左右硬转"。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

function plantWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  st.setTileSilent(40, 55, 2); // 锚点格
  const player = {
    x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
    cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
    dead: false, useTime: 0,
  };
  const hooks = {
    world: w,
    player,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: (): number => 0,
    entities: { add: () => {} },
  } as never;
  return { w, hooks, player };
}

describe('植物族 AI_013 头部旋转（cs:22778-22794）', () => {
  it('食人怪 43：玩家右上方 → facing=1、visAngle=atan2(oy,ox)', () => {
    const { hooks } = plantWorld({ x: 52, y: 48 }); // 锚点 (40,55) 的右上
    const e = Enemy.fromVanilla(43, 40 * 16, 54 * 16)!;
    e.ai0 = 40; e.ai1 = 55; // 锚点 tile 坐标
    e.fixedUpdate(1 / 60, hooks);
    const ax = 40 * 16 + 8, ay = 55 * 16 + 8;
    const ox = 52 * 16 - 15 - ax, oy = 48 * 16 + 21 - 15 - ay;
    expect(e.facing).toBe(1);
    expect(e.visAngle).toBeCloseTo(Math.atan2(oy, ox), 5);
    expect(Math.abs(e.visAngle)).toBeLessThan(Math.PI / 2); // 朝右不倒挂
  });

  it('食人怪 43：玩家左下方 → facing=-1、visAngle=atan2+π（镜像+旋转组合）', () => {
    const { hooks } = plantWorld({ x: 30, y: 60 });
    const e = Enemy.fromVanilla(43, 40 * 16, 54 * 16)!;
    e.ai0 = 40; e.ai1 = 55;
    e.fixedUpdate(1 / 60, hooks);
    const ax = 40 * 16 + 8, ay = 55 * 16 + 8;
    const ox = 30 * 16 - 15 - ax, oy = 60 * 16 + 21 - 15 - ay;
    expect(e.facing).toBe(-1);
    expect(e.visAngle).toBeCloseTo(Math.atan2(oy, ox) + Math.PI, 5);
  });

  it('真菌球 259：恒 +π/2（不随左右分支）', () => {
    const { hooks } = plantWorld({ x: 52, y: 48 });
    const e = Enemy.fromVanilla(259, 40 * 16, 54 * 16)!;
    e.ai0 = 40; e.ai1 = 55;
    e.fixedUpdate(1 / 60, hooks);
    const ax = 40 * 16 + 8, ay = 55 * 16 + 8;
    const ox = 52 * 16 - 10 - ax, oy = 48 * 16 + 21 - 10 - ay;
    expect(e.visAngle).toBeCloseTo(Math.atan2(oy, ox) + Math.PI / 2, 5);
  });

  it('无目标（player 语义缺位）→ 保留上帧角度', () => {
    const { hooks } = plantWorld({ x: 52, y: 48 });
    const e = Enemy.fromVanilla(43, 40 * 16, 54 * 16)!;
    e.ai0 = 40; e.ai1 = 55;
    e.fixedUpdate(1 / 60, hooks);
    const a1 = e.visAngle;
    e.fixedUpdate(1 / 60, { ...(hooks as object), player: undefined } as never);
    expect(e.visAngle).toBe(a1);
  });
});
