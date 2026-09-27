// ★2026-09-27 火苗速率案判别面（用户实报 120fps 上限火苗闪动快一倍）：
//  病灶族 = 「按渲染帧推进的视觉状态」——旧 TileFlames 在 drawTileFlames 内按调用
//  次数推进 TileFrameSeed（_drawCycle%5）、refreshItemFlamePos 按调用次数重掷
//  itemFlamePos——渲染 fps 与逻辑解耦（rAF frameCap 60/120/∞）后速率随 fps 翻倍。
//  原版锚（Terarria1457 亲读）：
//   · TileFrameSeed 推进点 = Main.DoDraw（Main.cs:62666-62670 _drawCycleCounter%5），
//     但默认 FrameSkipMode.Subtle+improvedSubtleFrameSkip（Main.cs:67615-67616）把
//     present 率钳回 60Hz（EndDraw :62624-62634）⇒ 绘制周期 ≡ 60Hz 逻辑 tick。
//   · itemFlamePos = LegacyPlayerRenderer.PrepareDrawForFrame :493-510 每 5 绘制帧重掷。
//  修 = 推进节拍重钉 Game.fixedUpdate 60Hz tick（BJ330 GTW 同款判例,pinGameTimeTicks
//  同钟）：seed = LCG^(⌊tick/5⌋+1) 纯函数（读侧幂等同步,多窗/多绘制每 tick 零多推）。
//  本测试：①帧序纯函数性（反编译公式逐位）②60fps vs 120fps 模拟帧序全等
//  ③同 tick 多读幂等④冻结仪具语义⑤回拨重放⑥手持火苗重掷节拍锁
//  ⑦结构锁（draw 路径禁再自带推进;waterfall/shimmer/windglow 重钉哨兵）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  currentTileFrameSeed,
  tileFrameSeedFreezeForTest,
  drawHeldItemFlame,
  randomNextSeed,
} from '../src/render/TileFlames';
import { pinGameTimeTicks } from '../src/core/GameTime';

const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（结构锁只禁代码改动,判定注释含词不误伤——BJ280 同款） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

// 反编译公式复算（Utils.RandomNextSeed Java LCG,Utils.cs:2388-2391）
const MASK48 = (1n << 48n) - 1n;
const SEED_BASE = 0x2545f4914f6cdd1dn & MASK48;
/** Main.cs:62666-62670 逐位：draw 周期 n 的种子 = LCG^(⌊n/5⌋+1)(初值)（首绘即推进） */
const vanillaSeedAt = (drawCycle: number): bigint => {
  let s = SEED_BASE;
  for (let k = 0; k < Math.floor(drawCycle / 5) + 1; k++) s = randomNextSeed(s);
  return s;
};

describe('火苗种子重钉逻辑 tick：帧序纯函数性', () => {
  it('①seed(tick) = LCG^(⌊tick/5⌋+1)(BASE) —— 与反编译公式逐位全等', () => {
    for (const tick of [0, 1, 4, 5, 6, 9, 10, 11, 12345, 216000]) {
      pinGameTimeTicks(tick);
      expect(currentTileFrameSeed()).toBe(vanillaSeedAt(tick));
    }
  });

  it('②速率锁：60fps（每 tick 一 draw）与 120fps（每 tick 两 draw）帧序全等', () => {
    // 60fps 基线：每逻辑 tick 恰一次绘制
    const seq60: bigint[] = [];
    for (let t = 0; t < 300; t++) {
      pinGameTimeTicks(t);
      seq60.push(currentTileFrameSeed());
    }
    // 120fps：每逻辑 tick 两次绘制（种子每 2 帧才换新——视觉序列=60fps 同速同序）
    // 同 150 tick 窗口对比：60fps=150 帧,120fps=300 帧（每帧视觉态=60fps 序列×2 展开）
    const seq120: bigint[] = [];
    for (let t = 0; t < 150; t++) {
      pinGameTimeTicks(t);
      seq120.push(currentTileFrameSeed());
      seq120.push(currentTileFrameSeed());
    }
    expect(seq120).toEqual(seq60.slice(0, 150).flatMap((s) => [s, s]));
    // 变异判别力：帧序确实随 tick 推进（非恒值）
    expect(new Set(seq60.map(String)).size).toBeGreaterThan(50);
  });

  it('③同 tick 多读幂等（多窗/behindTiles+主窗防双倍推进）', () => {
    pinGameTimeTicks(777);
    const a = currentTileFrameSeed();
    const b = currentTileFrameSeed();
    const c = currentTileFrameSeed();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe(vanillaSeedAt(777));
  });

  it('④B1 冻结仪具：冻结后 tick 推进不换种子（对拍确定性）', () => {
    pinGameTimeTicks(1000);
    tileFrameSeedFreezeForTest(true);
    const frozen = currentTileFrameSeed();
    pinGameTimeTicks(2000);
    expect(currentTileFrameSeed()).toBe(frozen);
    pinGameTimeTicks(2100);
    expect(currentTileFrameSeed()).toBe(frozen);
    tileFrameSeedFreezeForTest(false);
    expect(currentTileFrameSeed()).toBe(vanillaSeedAt(2100));   // 解冻即回正
  });

  it('⑤回拨重放：pin 回退后 seed 仍 = 公式值（tick 纯函数）', () => {
    pinGameTimeTicks(500);
    expect(currentTileFrameSeed()).toBe(vanillaSeedAt(500));
    pinGameTimeTicks(123);   // 回拨（测试钉钟路径）
    expect(currentTileFrameSeed()).toBe(vanillaSeedAt(123));
    pinGameTimeTicks(501);
    expect(currentTileFrameSeed()).toBe(vanillaSeedAt(501));
  });
});

describe('手持火苗重掷节拍（LegacyPlayerRenderer.cs:493-510 → ⌊tick/5⌋）', () => {
  const draws: string[] = [];
  const ctx = {
    save() { draws.push('save'); }, restore() { draws.push('restore'); },
    drawImage() { draws.push('draw'); },
  } as unknown as CanvasRenderingContext2D;
  const atlas = {
    ensureVImage: () => ({ width: 14, height: 16 }),
  } as unknown as import('../src/assets/SpriteAtlas').SpriteAtlas;

  /** Math.random 消耗计数（重掷一次 = 恰 14 掷:7 槽 × Next(-10,11)+Next(-10,1)） */
  const withCountedRandom = (fn: () => void): number => {
    const orig = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return 0.42; };
    try { fn(); } finally { Math.random = orig; }
    return calls;
  };

  it('⑥重掷只在 ⌊tick/5⌋ 滚档发生：tick 0 掷 14 次,tick 1-4 零掷,tick 5 再掷', () => {
    // tick 0：首掷
    pinGameTimeTicks(0);
    expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 8, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(14);
    // 120fps 模拟：同 tick 第二次绘制（paperdoll+世界双口）——零重掷
    expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 8, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(0);
    // tick 1-4：不滚档,零消耗
    for (const t of [1, 2, 3, 4]) {
      pinGameTimeTicks(t);
      expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 8, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(0);
    }
    // tick 5：滚档再掷
    pinGameTimeTicks(5);
    expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 8, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(14);
    // tick 6-9：又是零
    for (const t of [6, 7, 8, 9]) {
      pinGameTimeTicks(t);
      expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 8, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(0);
    }
    // 非 FLAME 物品：完全不掷（早退）
    pinGameTimeTicks(10);
    expect(withCountedRandom(() => drawHeldItemFlame(ctx, atlas, 1, 1, { x: 0, y: 0, w: 14, h: 16 }, null))).toBe(0);
  });
});

describe('重钉结构锁（draw 路径禁自带推进/墙钟哨兵）', () => {
  it('⑦a TileFlames：推进唯一驻点 = syncTileFrameSeed（读侧）;drawTileFlames 零推进', () => {
    const code = codeOf('src/render/TileFlames.ts');
    expect(code).toContain('gameTickCount');
    // 旧按调用推进的痕迹必须绝迹（_drawCycle 计数器已退役）
    expect(code).not.toContain('_drawCycle');
    // LCG 推进恰出现一次（syncTileFrameSeed 内）——任何第二推进点即爆红
    expect(code.split('randomNextSeed(_frameSeed)').length - 1).toBe(1);
    // 种子必须经 currentTileFrameSeed() 读侧同步（drawTileFlames 直读裸字段=绕过）
    expect(code).toContain('currentTileFrameSeed() ^ ((BigInt(x) << 32n)');
  });

  it('⑦b WaterfallRenderer：帧计数 = gameTickCount 纯函数,墙钟折帧绝迹', () => {
    const code = codeOf('src/render/WaterfallRenderer.ts');
    expect(code).toContain('gameTickCount');
    expect(code).not.toContain('nowMs / 50');
    expect(code).not.toContain('nowMs / 117');
    expect(code).not.toContain('nowMs / 16.7');
  });

  it('⑦c VanillaLiquidRenderer：微光 tVis = visEffectFrames,液体相位逐 tick 累计', () => {
    const code = codeOf('src/render/VanillaLiquidRenderer.ts');
    expect(code).toContain('visEffectFrames()');
    expect(code).toContain('gameTickCount');
    expect(code).not.toContain('(nowMs / 1000) * 60');
    expect(code).not.toContain('(nowMs / 1000) * rate');
  });

  it('⑦d WindSway：草 glow 脉冲 = tick 推进 mouseTextColor,墙钟正弦绝迹', () => {
    const code = codeOf('src/render/WindSway.ts');
    expect(code).toContain('SWAY_FLICKER.mouseTextColor / 255');
    expect(code).not.toContain('performance.now() / 180');
  });
});
