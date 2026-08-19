// 迷雾入场序列仿真（用户报"刚进世界视野未开，要走动才更新"）：
// 用真 Renderer.ensureFogData + 真 World.markExplored 按帧序推进，断言
// 入场 tick0 标记后 CPU 雾缓冲出生点即清雾（不需移动）。
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

// Renderer 构造只存 gl 引用；字段初始化器都有 typeof 守卫（node 下跳过 DOM）
const r = new Renderer(null as never);
// @ts-expect-error private 访问（测试内窥）
const ensure = (w: World) => (r as unknown as { ensureFogData(x: World): unknown }).ensureFogData.call(r, w);

function setup(w = 200, h = 200): World {
  const world = new World(w, h, 42, 'fog-test');
  for (let x = 0; x < w; x++) for (let y = 90; y < h; y++) world.store.setTile(x, y, 1);
  return world;
}

describe('迷雾入场序列（真 ensureFogData 帧推进）', () => {
  it('入场即标记 → 分带重建完成后出生点亮（HUD 缓冲）', () => {
    const world = setup();
    const spawn = { x: 100, y: 85 };
    // tick0：markExplored（Game.fixedUpdate 同序）
    world.markExplored(spawn.x, spawn.y, 28);
    // 渲染帧：每帧一次 ensureFogData（HUD drawMinimap 同频），足够分带完成
    const fogH = Math.ceil(world.store.h / 2);
    const bands = Math.ceil(fogH / 120);
    for (let f = 0; f < bands; f++) ensure(world);
    // @ts-expect-error private 内窥
    const p32 = (r as unknown as { fogP32: Uint32Array }).fogP32;
    const fogW = Math.ceil(world.store.w / 2);
    const FOG = 0xff080505;
    expect(p32[(spawn.y >> 1) * fogW + (spawn.x >> 1)]).toBe(0);          // 出生点清雾
    expect(p32[2 * fogW + 2]).toBe(FOG);                                   // 远处仍雾
  });

  it('入场后不移动的 15tick 追加标记也能清（CPU 增量路径）', () => {
    const world = setup();
    world.markExplored(100, 85, 28);
    const fogH = Math.ceil(world.store.h / 2);
    for (let f = 0; f < Math.ceil(fogH / 120); f++) ensure(world);
    // 不移动，仍在原地反复标记（fixedUpdate 每 15tick 同点）→ 无新格 → 版本不变
    const v0 = world.exploredVersion;
    world.markExplored(100, 85, 28);
    expect(world.exploredVersion).toBe(v0);
    ensure(world);
    const p32 = (r as unknown as { fogP32: Uint32Array }).fogP32;
    const fogW = Math.ceil(world.store.w / 2);
    expect(p32[(85 >> 1) * fogW + (100 >> 1)]).toBe(0);
  });

  it('换世界后缓冲复用不串档（fogWorld 重置 → 整幅重建）', () => {
    const world1 = setup();
    world1.markExplored(10, 10, 28);
    const world2 = setup(200, 200);
    world2.markExplored(150, 150, 28);
    const fogH = Math.ceil(200 / 2);
    for (let f = 0; f < Math.ceil(fogH / 120); f++) ensure(world2);
    const p32 = (r as unknown as { fogP32: Uint32Array }).fogP32;
    const fogW = 100;
    // 世界2 的出生点清雾；世界1 的旧探索点(10,10)在新世界未探索 → 应为雾
    expect(p32[(150 >> 1) * fogW + (150 >> 1)]).toBe(0);
    expect(p32[(10 >> 1) * fogW + (10 >> 1)]).toBe(0xff080505);
  });
});
