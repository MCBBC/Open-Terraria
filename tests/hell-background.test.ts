// 地狱背景层序/位置/动画回归(对照 Main.cs :52237/:52265-70/:61657-65/:52488-97):
// ① 黑盒最先打底(曾画在最后盖掉岩浆带) ② 岩浆带顶 = magmaLayer 公式(曾误用 lavaLine)
// ③ 岩浆体 3 帧动画行 ④ 表面波纹条(185+hell)存在(曾从未绘制)
import { describe, it, expect } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

/** 录制式 ctx:drawImage/fillRect 全记,stub img 解码完成态 */
function recorder() {
  const calls: Array<Record<string, unknown>> = [];
  const ctx = {
    save: () => {}, restore: () => {},
    drawImage: (im: unknown, ...a: unknown[]) => calls.push({ op: 'img', tex: (im as { tex?: number }).tex, args: a }),
    fillRect: (...a: unknown[]) => calls.push({ op: 'rect', args: a }),
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** 伪 img:naturalWidth/Height 按地狱贴图实际尺寸;complete 恒真 */
function stubImgs(bg: BiomeBackground) {
  const SIZES: Record<number, [number, number]> = {
    125: [160, 288], 126: [160, 288], 127: [160, 288],
    185: [160, 48], 186: [160, 48], 187: [160, 48],
  };
  const map = (bg as unknown as { imgs: Map<number, HTMLImageElement | null> }).imgs;
  const orig = (bg as unknown as { img(n: number): HTMLImageElement | null }).img;
  (bg as unknown as { img(n: number): HTMLImageElement | null }).img = (n: number) => {
    const s = SIZES[n];
    if (s) {
      const fake = { tex: n, complete: true, naturalWidth: s[0], naturalHeight: s[1] } as unknown as HTMLImageElement;
      map.set(n, fake);
      return fake;
    }
    return orig.call(bg, -1);
  };
}

function hellWorld() {
  const w = new World(400, 600, 42, 'hell');
  w.groundLevel = 100; w.rockLevel = 200;
  return w;
}

describe('地狱背景(Main.cs DrawBackground 地下层)', () => {
  it('黑盒在带层【之前】打底且下界=UnderworldLayer(层序 :52267 在 Rock/Magma 前)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    bg.ugAlpha = 1; bg.ugOld = bg.ugStyle;   // 无过渡,单份
    const { ctx, calls } = recorder();
    const world = hellWorld();
    const camY = (600 - 345) * 16;            // 玩家在 h-345(岩浆带内)
    bg.draw(ctx, world, {} as never, { x: 3200, y: camY }, 1280, 800, [1, 1, 1], 100);
    const rectIdx = calls.findIndex(c => c.op === 'rect');
    const firstImg = calls.findIndex(c => c.op === 'img');
    expect(rectIdx).toBeGreaterThanOrEqual(0);
    expect(firstImg).toBeGreaterThan(rectIdx);       // 黑盒先于一切贴图
    // 下界 = (h-200)*16 - camTopY(h-200 格,UnderworldLayer)
    const hRect = calls[rectIdx].args as number[];
    const camTopY = camY - 800 / 2;
    expect(hRect[3]).toBeCloseTo((600 - 200) * 16 - camTopY, 0);
  });

  it('岩浆带顶 = magmaLayer 公式(h-335 带,非 lavaLine h-200——曾低 ~135 格 :52237)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    bg.ugAlpha = 1; bg.ugOld = bg.ugStyle;
    const { ctx, calls } = recorder();
    const world = hellWorld();
    const camY = (600 - 345) * 16;
    bg.draw(ctx, world, {} as never, { x: 3200, y: camY }, 1280, 800, [1, 1, 1], 100);
    const magma = calls.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126 || c.tex === 127));
    expect(magma).toBeTruthy();
    const camTopY = camY - 400;
    const expectedTop = (100 + Math.floor((600 - 330 - 100) / 6) * 6 - 5) * 16 - camTopY + 16 + 600 - 8;
    expect((magma!.args as number[])[1]).toBeCloseTo(expectedTop, 0);
  });

  it('岩浆体按 magmaFrame 行取帧(3 帧×96px;surface 条 185+hell 取 frame*16 行 :52488-97)', () => {
    const bg = new BiomeBackground();
    stubImgs(bg);
    bg.ugAlpha = 1; bg.ugOld = bg.ugStyle;
    const { ctx, calls } = recorder();
    const world = hellWorld();
    const camY = (600 - 345) * 16;
    // 推到第 2 帧:8 tick/帧 × 2 = 16 tick = 2133ms
    bg.draw(ctx, world, {} as never, { x: 3200, y: camY }, 1280, 800, [1, 1, 1], 2133);
    const magma = calls.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126));
    expect(magma).toBeTruthy();
    expect((magma!.args as number[])[1]).toBe(96 * 2);          // sourceY = frame*96
    const strip = calls.find(c => c.op === 'img' && (c.tex === 185 || c.tex === 186));
    expect(strip).toBeTruthy();                                  // 表面条存在(曾缺失)
    expect((strip!.args as number[])[1]).toBe(16 * 2);           // sourceY = frame*16
    // 帧循环:3 帧后回 0(40 tick=5333ms)
    const { ctx: ctx2, calls: calls2 } = recorder();
    bg.draw(ctx2, world, {} as never, { x: 3200, y: camY }, 1280, 800, [1, 1, 1], 5333);
    const magma2 = calls2.find(c => c.op === 'img' && (c.tex === 125 || c.tex === 126));
    expect((magma2!.args as number[])[1]).toBe(0);               // mod 3 回 0
  });
});
