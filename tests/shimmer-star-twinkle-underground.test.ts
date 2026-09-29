// ★SW-微光星空闪烁修复 守卫（2026-09-29 用户实报"微光环境背景星光原版会闪烁,
// 本仓疑似静态"）:
// 【定谳】vanilla Star.UpdateStars 的钟在 update 相（Main.cs:17429-17449）——地上
//  `screenPosition.Y < worldSurface*16+16` 支恒跑;地下走 `else if (shimmerAlpha>0)`
//  支同样恒跑（+1/90·tick 坠星掷+hidden 星重生）。本仓曾把逐星 Update 挂在
//  sky.draw 自然星段（:4125）= 深度门 early-return 整体跳过 → 微光域（地下）
//  twinkle 冻结 = 人工星空静态。
// 【修】SkyRenderer.draw 地下支按 vanilla 语义补 updateStars（shimmerAlpha>0 门 +
//  坠星掷 + hidden 重生）;地上支照旧;地下臂 return 在自然星段之前 = 无双更新。
// 【锁面】①行为:updateStars 推进 twinkle（钟源活）;②结构:地下支三件套
//  （深度门/暂停+shimmerAlpha 门/updateStars+坠星掷+重生）在位且 return 隔离
//  自然星段（双更新=twinkle 2 倍速回归判据）;③地上调用点原样;④消费端
//  drawShimmerStars/drawStar twinkle 面不漂移。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SkyRenderer } from '../src/render/SkyRenderer';

const SKY = readFileSync(resolve(__dirname, '../src/render/SkyRenderer.ts'), 'utf8');

// node 环境桩:SkyRenderer 构造器经 loadTex 走 new Image()（贴图懒加载,构造期
// 仅持占位 Image;draw 相关位本测试不触）
beforeAll(() => {
  if (typeof (globalThis as { Image?: unknown }).Image === 'undefined') {
    (globalThis as unknown as { Image: unknown }).Image = class {
      src = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      width = 0; height = 0;
    };
  }
});

describe('★微光星空闪烁 行为锁:updateStars 钟活（twinkle 逐帧推进）', () => {
  it('静止星 twinkle 0.6-1.0 往返推进（非恒值——修复前病灶=微光域钟死恒值）', () => {
    const sky = new SkyRenderer();
    const stars = (sky as unknown as { stars: Array<{ falling: boolean; hidden: boolean;
      fadeIn: number; twinkle: number; twSpeed: number; rot: number }> }).stars;
    expect(stars.length).toBeGreaterThanOrEqual(200);   // SpawnStars 200-400
    const s = stars[0];
    s.falling = false; s.hidden = false; s.fadeIn = 0;
    s.twinkle = 0.8; s.twSpeed = 0.0005;
    const t0 = s.twinkle;
    (sky as unknown as { updateStars(dayRate: number, isDay: boolean, dayTicks: number): void })
      .updateStars(1, false, 0);
    expect(s.twinkle).toBeCloseTo(t0 + 0.0005, 12);   // Star.Update 非坠落支 +twSpeed/帧
    // 边界回摆:推到上界 → 折返（Star.UpdateStars :137-163 同式）
    s.twinkle = 1; s.twSpeed = 0.0005;
    (sky as unknown as { updateStars(dayRate: number, isDay: boolean, dayTicks: number): void })
      .updateStars(1, false, 0);
    expect(s.twinkle).toBe(1);
    expect(s.twSpeed).toBe(-0.0005);
  });

  it('hidden 星经 updateStars 昼重生（fadeIn=1 渐显）——地下支重生块同式', () => {
    const sky = new SkyRenderer();
    const stars = (sky as unknown as { stars: Array<{ hidden: boolean; fadeIn: number }> }).stars;
    stars[0].hidden = true;
    (sky as unknown as { updateStars(dayRate: number, isDay: boolean, dayTicks: number): void })
      .updateStars(1, true, 27000);
    expect(stars[0].hidden).toBe(false);
    // spawnStar 设 fadeIn=1 后同一趟 updateStar 立即按原版式衰减一步
    // （Star.Update fadeIn 支:−6.1728395e-5·dayRate·10）——1−0.000617…≈0.99938
    expect(stars[0].fadeIn).toBeCloseTo(1 - 6.1728395e-5 * 10, 12);
  });
});

describe('★微光星空闪烁 结构锁:地下支补钟+坠星掷+重生,无双更新', () => {
  it('深度门内三件套在位:深度门→(!paused && shimmerAlpha>0)→updateStars+1/90 坠星掷+hidden 重生', () => {
    // 原版对应面:Main.cs:17429-17449 地下支 `else if (shimmerAlpha > 0f)`
    expect(SKY).toContain('if (screenTopWorld >= this.fx.surfaceY + 16) {');
    expect(SKY).toContain('if (!this.frameCtx?.paused && this.shimmerAlpha > 0) {');
    expect(SKY).toContain('this.updateStars(this.frameCtx?.world?.dayRate?.() ?? 1, isDay, dayTimeTicks);');
    expect(SKY).toContain('if (Math.random() * 90 < 1) {');                     // :17439 1/90·tick 坠星掷
    expect(SKY).toContain('if (stars[j]?.hidden) { this.spawnStar(j); stars[j].fadeIn = 1; }');
    // 坠星速度基（vanilla :17441-17444 verbatim:700-1000 / ±400·0.01）
    expect(SKY).toContain('s5.fvy = (700 + Math.floor(Math.random() * 301)) * 0.01;');
    expect(SKY).toContain('s5.fvx = (Math.floor(Math.random() * 801) - 400) * 0.01;');
  });

  it('地下臂 return 先于自然星段=无双更新（双更新=twinkle 2 倍速回归判据）', () => {
    // 深度门块以 return 收口,自然星段 updateStars(:4125 同门)在块外——
    // 地下帧走不到第二处（曾漏=微光域钟死;若两处都可达=钟 2 倍速,均回归）
    const gate = SKY.indexOf('if (screenTopWorld >= this.fx.surfaceY + 16) {');
    expect(gate).toBeGreaterThan(0);
    const ret = SKY.indexOf('      return;', gate);                              // 门内 return
    const gateEnd = SKY.indexOf('    }', ret);
    expect(ret).toBeGreaterThan(gate);
    expect(gateEnd).toBeGreaterThan(ret);
    const surfaceCall = SKY.indexOf('if (!this.frameCtx?.paused) this.updateStars(dayRate, isDay, dayTimeTicks);');
    expect(surfaceCall).toBeGreaterThan(gateEnd);   // 地上调用点在深度门块之后
  });

  it('地上调用点原样(:4125 同门 Star.UpdateStars 同门——暂停冻结;修复不触地上支)', () => {
    expect(SKY).toContain('if (!this.frameCtx?.paused) this.updateStars(dayRate, isDay, dayTimeTicks);');
  });

  it('消费端 twinkle 面不漂移:drawStar 主星尺寸×twinkle+三通道亮度×twinkle;shimmer 人工星同源', () => {
    expect(SKY).toContain('s.scale * s.twinkle');                       // :62600 尺寸脉动
    expect(SKY.match(/\* s\.twinkle/g)?.length ?? 0).toBeGreaterThanOrEqual(4); // 亮度 RGB 三通道+尺寸
    // 人工星 pass 逐星复用同一 drawStar（twinkle 脉动同源）
    expect(SKY).toContain('this.drawStar(ctx, i, starDim, viewW, viewH, this._lastStarBgTopY, bt, shim, true, cotsFaded);');
  });
});
