// ★BJ466 尘池 spawn 屏外裁剪 + dCount 阶梯（BJ460③ 钉案落刀,2026-10-03）判别测试。
//
// 原版锚（Terarria1457/Terraria/Dust.cs）：
//  · NewDust :97-101：margin=(int)(400f×(1f−dCount));视口=screenPosition 四向外扩
//    margin;spawn 盒=(Position,10,10) 恒定（w/h 形参只决定盒内偏移分布）;不相交→
//    return 6000——拒且零 RNG 消费（先于密度梯 :106-151 与全部初始化掷）。
//  · UpdateDust 尾 :2470-2494：num119 对 maxDustToDraw 分位 {0.9,0.8,0.7,0.6,0.5,else}
//    定 dCount ∈ {0.9,0.8,0.7,0.6,0.5,0}f。
//  · NewDustPerfect :52-63 通道（BJ460③ 钉案）与 prettySparkle 载体豁免。
//
// ★BJ466 复核定谳（源码锚见 VanillaDust.ts 实现注）：
//  · margin 六档 f32 实值 = {400,200,159,120,79,40}——非登记账理想值 {…160…80…}：
//    400f×(1f−0.6f)=159.99998→(int)159、400f×(1f−0.8f)=79.99999→(int)79、0.9 档
//    f64 直算反为 39 而 f32 40.00001→40（C# float 算术,Math.fround 复算;BJ342 157
//    型 f32 阈值判例同族）。
//  · 原版【运行时】margin 恒 400：尾段读 num119=num（:2470）而 num（:429）全程无
//    写点 → 恒走 else dCount=0f（:2420-2459 缩没梯同死;dCount 全树零外部写点）。
//    本仓按 BJ460③ 钉案激活阶梯（activeN 驱动）——activeN≤3000 域与原版运行时
//    无差,>3000 高压域为登记分歧。
import { describe, it, expect, afterEach } from 'vitest';
import { VanillaDust, dustCullMarginOf } from '../src/fx/VanillaDust';
import type { VDust } from '../src/fx/VanillaDust';

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

/** 测试视口：update(1000,1000,800,600)——视口右缘 1800 / 底缘 1600（世界像素） */
const VX = 1000, VY = 1000, VW = 800, VH = 600;

const poolOf = (vd: VanillaDust) => (vd as unknown as { pool: VDust[] }).pool;
const activeOf = (vd: VanillaDust) => poolOf(vd).filter((d) => d.active).length;
const dCountOf = (vd: VanillaDust) => (vd as unknown as { dCount: number }).dCount;

/** 直填池 n 个活跃尘（零 RNG 消费;type 0 在 update 中存活：scale=1>0.1、
 *  y=1300<屏底 1600 不触发屏底清除） */
function fillActive(vd: VanillaDust, n: number): void {
  const pool = poolOf(vd);
  for (let i = 0; i < n; i++) {
    const d = pool[i];
    d.active = true; d.x = 1200; d.y = 1300; d.vx = 0; d.vy = 0;
    d.type = 0; d.scale = 1; d.alpha = 0; d.fadeIn = 0; d.noGravity = false;
  }
}

/** LCG 定掷流（种子可复位 → 前掷后置对拍） */
function makeLcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('BJ466 ① 视口内 spawn 照常', () => {
  it('视口内（含 400 外扩域内）spawn 入池', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    expect(dCountOf(vd)).toBe(0);            // 0 活跃 → 阶梯 else → dCount=0
    const d = vd.spawn(1200, 1300, 16, 16, 1);
    expect(d).not.toBeNull();
    expect(d!.active).toBe(true);
    expect(activeOf(vd)).toBe(1);
  });
});

describe('BJ466 ② 屏外 spawn 拒且 RNG 不动（掷流不变性）', () => {
  it('被裁 spawn 零 Math.random 消费（直证）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    let rolls = 0;
    Math.random = (() => { rolls++; return 0.99; }) as never;
    expect(vd.spawn(5000, 1300, 16, 16, 1)).toBeNull();   // 右缘 1800+400=2200 外
    expect(rolls).toBe(0);                                 // 密度门与抖动掷全未发生
    expect(activeOf(vd)).toBe(0);                          // 池零新增
  });

  it('前掷后置对拍：[裁剪 spawn,有效 spawn] 与 [有效 spawn] 掷流逐字节全等', () => {
    // Path A：先被裁 spawn（期望零掷）,再有效 spawn
    const va = new VanillaDust();
    va.update(VX, VY, VW, VH);
    const lcg = makeLcg(123456789);
    const seqA: number[] = [];
    Math.random = (() => { const v = lcg(); seqA.push(v); return v; }) as never;
    const culled = va.spawn(5000, 1300, 16, 16, 1);
    const rollsAfterCull = seqA.length;
    const a = va.spawn(1200, 1300, 16, 16, 1)!;

    // Path B：仅有效 spawn（同种子同池态——全新实例）
    const vb = new VanillaDust();
    vb.update(VX, VY, VW, VH);
    const lcg2 = makeLcg(123456789);
    const seqB: number[] = [];
    Math.random = (() => { const v = lcg2(); seqB.push(v); return v; }) as never;
    const b = vb.spawn(1200, 1300, 16, 16, 1)!;

    expect(culled).toBeNull();
    expect(rollsAfterCull).toBe(0);          // 裁剪在密度门前=零 RNG 早退
    expect(seqA).toEqual(seqB);              // 掷流逐字节不变=反伪影关键
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.vx).toBe(b.vx);
    expect(a.vy).toBe(b.vy);
    expect(a.fx).toBe(b.fx);
    expect(a.fy).toBe(b.fy);
    expect(a.scale).toBe(b.scale);
  });

  it('clone 不豁免（原版 CloneDust :281 走 NewDust 同吃裁剪）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    const src = vd.spawn(1200, 1300, 16, 16, 1)!;
    expect(vd.clone(src)).not.toBeNull();    // 屏内源尘照常克隆
    src.x = 7200; src.y = 1300;              // 源尘瞬移屏外
    expect(vd.clone(src)).toBeNull();        // 屏外克隆被裁
  });
});

describe('BJ466 ③ dCount 阶梯六档 margin 钉值', () => {
  // ★f32 钉值：{400,200,159,120,79,40}（dustCullMarginOf=spawn 路径同函数）
  it('margin 纯函数六档（含 f32 159/79 与 f64 反例 39 的判别）', () => {
    expect(dustCullMarginOf(0)).toBe(400);
    expect(dustCullMarginOf(Math.fround(0.5))).toBe(200);
    expect(dustCullMarginOf(Math.fround(0.6))).toBe(159);   // 理想实数域 160 是错的
    expect(dustCullMarginOf(Math.fround(0.7))).toBe(120);
    expect(dustCullMarginOf(Math.fround(0.8))).toBe(79);    // 理想实数域 80 是错的
    expect(dustCullMarginOf(Math.fround(0.9))).toBe(40);    // f64 直算反为 39
  });

  // UpdateDust 尾 :2470-2494 分位赋值（阈值=严格 (double)n > max×k）
  it('activeN 分位 → dCount f32 钉值（含 3000/3001、5400/5401 边界）', () => {
    const tiers: Array<[number, number]> = [
      [3000, 0], [3001, Math.fround(0.5)], [3600, Math.fround(0.5)],
      [3601, Math.fround(0.6)], [4200, Math.fround(0.6)], [4201, Math.fround(0.7)],
      [4800, Math.fround(0.7)], [4801, Math.fround(0.8)], [5400, Math.fround(0.8)],
      [5401, Math.fround(0.9)],
    ];
    for (const [n, want] of tiers) {
      const vd = new VanillaDust();
      fillActive(vd, n);
      vd.update(VX, VY, VW, VH);
      expect(dCountOf(vd)).toBe(want);
    }
  });

  // 行为探针（右缘 ±1px）：n≤4200 域密度门以 r=0.99 恒过,allowed/culled 纯由裁剪定
  it('阶梯 margin 行为探针：右缘 margin−1 收 / margin 拒（400/200/159/120 四档）', () => {
    const tiers: Array<[number, number, number]> = [
      // [fillN, margin, 右缘 1800+margin]
      [3000, 400, 2200],
      [3001, 200, 2000],
      [3601, 159, 1959],
      [4201, 120, 1920],
    ];
    for (const [n, m, edge] of tiers) {
      const vd = new VanillaDust();
      fillActive(vd, n);
      vd.update(VX, VY, VW, VH);
      Math.random = (() => 0.99) as never;   // 过密度门（frac≤0.7 域恒过）
      expect(dustCullMarginOf(dCountOf(vd))).toBe(m);
      expect(vd.spawn(edge - 1, 1300, 16, 16, 1)).not.toBeNull();
      expect(vd.spawn(edge, 1300, 16, 16, 1)).toBeNull();
    }
  });

  it('dCount≥0.8 档（79/40）margin 由 dCount 钉值×margin 函数传递钉定', () => {
    // frac>0.8 域密度门恒拒（R2 #4 既有近似,域外不撕）——行为探针不可达,
    // 以「dCount 实测 f32 值 × spawn 同款 margin 函数」组合钉定
    for (const [n, dc, m] of [
      [4801, Math.fround(0.8), 79],
      [5401, Math.fround(0.9), 40],
    ] as Array<[number, number, number]>) {
      const vd = new VanillaDust();
      fillActive(vd, n);
      vd.update(VX, VY, VW, VH);
      expect(dCountOf(vd)).toBe(dc);
      expect(dustCullMarginOf(dc)).toBe(m);
    }
  });
});

describe('BJ466 ④ NewDustPerfect / prettySparkle 载体豁免', () => {
  it('perfect 通道屏外不裁（覆写面 position/velocity 精确）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    const p = vd.spawn(7200, 1300, 16, 16, 1, 3, 4, 0, null, 1, { perfect: true });
    expect(p).not.toBeNull();
    expect(p!.x).toBe(7200);
    expect(p!.vx).toBe(3);
    expect(p!.vy).toBe(4);
  });

  it('prettySparkle 载体屏外不裁（原版 ParticlePool 不入 Dust 池零门）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    const q = vd.spawn(7200, 1300, 16, 16, 1, 3, 4, 0, null, 1, { prettySparkle: true });
    expect(q).not.toBeNull();
    expect(q!.x).toBe(7200);
  });

  it('同位非豁免 spawn 仍拒（豁免面不外溢）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    expect(vd.spawn(7200, 1300, 16, 16, 1)).toBeNull();
  });
});

describe('BJ466 ⑤ margin=400 四向外扩域边界（贴边严格不等）', () => {
  it('右缘 2199 收 / 2200 拒；左缘 591 收 / 590 拒', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    expect(vd.spawn(2199, 1300, 16, 16, 1)).not.toBeNull();
    expect(vd.spawn(2200, 1300, 16, 16, 1)).toBeNull();
    // 左：外扩左缘 vl=600,盒宽 10 → bx=591 盒 [591,601) 跨 600 收;bx=590 贴边拒
    expect(vd.spawn(591, 1300, 16, 16, 1)).not.toBeNull();
    expect(vd.spawn(590, 1300, 16, 16, 1)).toBeNull();
  });

  it('上缘 591 收 / 590 拒；下缘 1999 收 / 2000 拒', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    expect(vd.spawn(1200, 591, 16, 16, 1)).not.toBeNull();
    expect(vd.spawn(1200, 590, 16, 16, 1)).toBeNull();
    // 下：外扩底缘 vb=1600+400=2000
    expect(vd.spawn(1200, 1999, 16, 16, 1)).not.toBeNull();
    expect(vd.spawn(1200, 2000, 16, 16, 1)).toBeNull();
  });
});

describe('BJ466 ⑥ 首帧 update 前不裁（既有契约：无视口信息域）', () => {
  it('未 update 的全新实例任意位置 spawn 照常入池', () => {
    const vd = new VanillaDust();
    Math.random = (() => 0.99) as never;
    expect(vd.spawn(1e6, 1e6, 16, 16, 1)).not.toBeNull();
    expect(vd.spawn(-1e6, -1e6, 16, 16, 1)).not.toBeNull();
  });
});
