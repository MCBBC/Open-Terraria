// 迷雾入场序列仿真（用户报"刚进世界视野未开，要走动才更新"）：
// 用真 Renderer.ensureFogData + 真 World.markExplored 按帧序推进，断言
// 入场 tick0 标记后 CPU 雾缓冲出生点即清雾（不需移动）。
// Renderer 字段初始化器链会 new Image（SkyRenderer.loadTex）——node 环境先垫
// 最小 DOM 桩（src/onload 可挂即可，不真加载）。
import { describe, it, expect, beforeAll } from 'vitest';

let Renderer: typeof import('../src/render/Renderer').Renderer;
let World: typeof import('../src/world/World').World;
let r: InstanceType<typeof Renderer>;

beforeAll(async () => {   // 机器高载时模块图 transform 慢——放宽钩子超时
  (globalThis as Record<string, unknown>).Image = class {
    src = ''; onload: (() => void) | null = null;
    width = 0; height = 0;
    addEventListener() { /* noop */ }
  };
  // 全容忍 Proxy 桩：任意方法调用/属性访问/构造都回桩（Renderer 构造只建画布
  // 占位，ensureFogData 不触 DOM——桩只为过构造）
  const anyStub: () => unknown = () => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
    set: () => true,
    apply: () => anyStub(),
    construct: () => anyStub(),
  });
  (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
  (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
  ({ Renderer } = await import('../src/render/Renderer'));
  ({ World } = await import('../src/world/World'));
  r = new Renderer(null as never);
}, 120000);

/** private ensureFogData 直调（HUD drawMinimap 每帧同款） */
const ensure = (w: import('../src/world/World').World) =>
  (r as unknown as { ensureFogData(x: import('../src/world/World').World): unknown }).ensureFogData(w);
const p32of = () => (r as unknown as { fogP32: Uint32Array; fogW: number }).fogP32;
const fogWof = () => (r as unknown as { fogW: number }).fogW;

function setup(w = 200, h = 200): InstanceType<typeof World> {
  const world = new World(w, h, 42, 'fog-test');
  for (let x = 0; x < w; x++) for (let y = 90; y < h; y++) world.store.setTile(x, y, 1);
  return world;
}
const FOG = 0xff080505;

describe('迷雾入场序列（真 ensureFogData 帧推进）', () => {
  it('入场即标记 → 分带重建完成后出生点亮（HUD 缓冲），远处仍雾', () => {
    const world = setup();
    // tick0：markExplored（Game.fixedUpdate 同序，无需移动）
    world.markExplored(100, 85, 28);
    // 渲染帧：每帧一次 ensureFogData（HUD drawMinimap 同频），分带完成
    const bands = Math.ceil(Math.ceil(world.store.h / 2) / 120);
    for (let f = 0; f < bands; f++) ensure(world);
    const p32 = p32of(), fogW = fogWof();
    expect(p32[(85 >> 1) * fogW + (100 >> 1)]).toBe(0);   // 出生点清雾
    expect(p32[2 * fogW + 2]).toBe(FOG);                  // 远处仍雾
  });

  it('入场后原地反复标记（不移动）→ 版本稳定，出生点保持清雾', () => {
    const world = setup();
    world.markExplored(100, 85, 28);
    for (let f = 0; f < Math.ceil(Math.ceil(world.store.h / 2) / 120); f++) ensure(world);
    const v0 = world.exploredVersion;
    world.markExplored(100, 85, 28);      // 15tick 后同点再标（无新格）
    expect(world.exploredVersion).toBe(v0);
    ensure(world);
    const p32 = p32of(), fogW = fogWof();
    expect(p32[(85 >> 1) * fogW + (100 >> 1)]).toBe(0);
  });

  it('换世界后缓冲复用不串档（fogWorld 重置 → 整幅重建）', () => {
    const world1 = setup();
    world1.markExplored(10, 10, 28);
    const world2 = setup();
    world2.markExplored(150, 150, 28);
    for (let f = 0; f < Math.ceil(Math.ceil(200 / 2) / 120); f++) ensure(world2);
    const p32 = p32of(), fogW = fogWof();
    expect(p32[(150 >> 1) * fogW + (150 >> 1)]).toBe(0);          // 新世界出生点清雾
    expect(p32[(10 >> 1) * fogW + (10 >> 1)]).toBe(FOG);          // 旧世界探索点在新世界=雾
  });
});
