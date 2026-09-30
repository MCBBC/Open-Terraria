// BJ418：668 鹿角怪（独眼巨鹿）"一闪一闪"定谳刀（用户实报:先"攻击时消失"后修正
// 为"一闪一闪"=间歇性消失/变透明闪烁）。闪烁判别面 = deerclopsDrawLayers 纯函数的
// 60 拍逐拍 alpha/帧序列恒定锁（BJ244 判例:闪烁=序列翻转的量化证据）。
//
// 定谳（反编译直读,1457 Main.cs DrawNPCDirect_Deerclops :26714-26800）：
//  原版本体 alpha 链（XNA Color.Lerp 四通道同插,npcColor.A=255、npc.alpha=0）：
//    ① lai3>0: Lerp(Transparent,color,1−num3)      → A×(1−num3)      :26742
//    ② lai3>0: Lerp(·,(50,0,160,A=255),r1)         → A→A(1−r1)+255r1 :26759-26762
//    ③ ai0∈{7,8}: Lerp(·,(50,0,160),num7) → ×(1−num7)                :26767-26768
//    ⇒ A=[(1−num3)(1−r1)+r1] →（7/8）[(·)(1−num7)+num7](1−num7)。
//  lai3∈[0,30]（AI_123 远距免伤爬升,NPC.cs:44485-44487,阈值 450px）时 A 恒 ≥0.9543
//  ——原版远距态=【不透明紫影剪影】（r1→1 时纯 (50,0,160)）,从不整段淡出。
//  旧式 α=Opacity(1−r²)(1−num7) 漏②③两次 alpha 回升 → 玩家 ≥450px 本体衰减到
//  0.3056、450px 阈值往返/进退循环=逐拍翻转闪烁（用户实报根因）。
// 三类候选根因排除记录：
//  - 帧表面：deerclopsNextFrame idx∈0..24 与 NPC_GRIDS[668]（5×5,perRow 5）全域
//    内收,无越界空帧（tests/sw-bj51 + 帧表对账闸）。
//  - 残影/拖影面：668 不在 projGhostTrail（弹幕 id 域）/npcExtraParts 派发表;唯一
//    ghost=原版 redGhost/purpleGhost,同源于本纯函数,无本体/残影交替绘制面。
//  - alphaOf/tint 面：alphaOf=dust 域;668 无 NPC_STATIC_ALPHA/colorRGBA 静态档,
//    spawnAlpha=0 恒定。
import { describe, it, expect } from 'vitest';
import { deerclopsDrawLayers } from '../src/render/Renderer';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const bodyAlphaOf = (lai3: number, ai0 = 0, ai1 = 0) =>
  deerclopsDrawLayers({ lai3, ai0, ai1, opacity: 1, gt: 0 })
    .layers.find((l) => l.kind === 'body')!.alpha;

/** 原版 AI lai3 逐拍推进（NPC.cs:44486 flag.ToDirectionInt ±1,Clamp[0,30]） */
function lai3Series(farSeq: boolean[]): number[] {
  const out: number[] = [];
  let lai3 = 0;
  for (const far of farSeq) {
    lai3 = Math.max(0, Math.min(30, lai3 + (far ? 1 : -1)));
    out.push(lai3);
  }
  return out;
}

describe('BJ418 ①60 拍序列恒定锁：近距战斗（lai3=0,ai0=0）', () => {
  it('60 拍 alpha 恒 ≡ 1（无任何翻转;gt 变化不进 alpha 链）', () => {
    for (let t = 0; t < 60; t++) {
      expect(near(bodyAlphaOf(0, 0, 0), 1)).toBe(true);
    }
  });
});

describe('BJ418 ②60 拍序列恒定锁：远距爬升窗（玩家 ≥450px 攻击,实报"攻击时消失"域）', () => {
  it('lai3 0→30 爬升+hold 60 拍:每拍 α≥0.95（旧式跌到 0.3056=红）+逐拍极差<0.05', () => {
    const seq = lai3Series(Array(60).fill(true));   // 首拍即 +1:seq[t]=min(30,t+1)
    const alphas = seq.map((lai3) => bodyAlphaOf(lai3, 0, 0));
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeLessThan(0.05);
    // 逐拍解析锁（vanilla 链直算:A=[(1−num3)(1−r1)+r1]）
    for (let t = 0; t < 60; t++) {
      const L = seq[t];
      const r1 = Math.min(1, L / 20);
      expect(near(alphas[t], (1 - (L / 36) ** 2) * (1 - r1) + r1, 1e-9)).toBe(true);
    }
    expect(near(alphas[0], (1 - (1 / 36) ** 2) * 0.95 + 0.05, 1e-9)).toBe(true);
    for (let t = 19; t < 60; t++) expect(near(alphas[t], 1)).toBe(true);   // lai3≥20 → r1=1 拉满
  });

  it('全 lai3 域 0..30 扫描:α 恒 ≥0.954（原版无整段淡出面）', () => {
    for (let lai3 = 0; lai3 <= 30; lai3++) {
      expect(bodyAlphaOf(lai3)).toBeGreaterThanOrEqual(0.954);
    }
  });
});

describe('BJ418 ③60 拍序列恒定锁：450px 阈值锯齿（实报"一闪一闪"主域）', () => {
  it('远/近每 10 拍交替（玩家在阈值边游走）:lai3 锯齿,α 序列恒 ≥0.95 且逐拍 |Δ|<0.02', () => {
    const farSeq = Array.from({ length: 60 }, (_, t) => Math.floor(t / 10) % 2 === 0);
    const seq = lai3Series(farSeq);
    const alphas = seq.map((lai3) => bodyAlphaOf(lai3, 0, 0));
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.95);
    for (let t = 1; t < alphas.length; t++) {
      expect(Math.abs(alphas[t] - alphas[t - 1])).toBeLessThan(0.02);
    }
  });

  it('进退循环（远 30 拍→近 30 拍,典型 charge-retreat 节奏）:α 全窗恒 ≥0.95', () => {
    const seq = lai3Series([...Array(30).fill(true), ...Array(30).fill(false)]);
    const alphas = seq.map((lai3) => bodyAlphaOf(lai3, 0, 0));
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.95);
  });
});

describe('BJ418 ④消散态（ai0=7/8）60 拍曲线=原版锁', () => {
  it('ai0=8,lai3=0,ai1=0..59:α=1−num7 三角曲线逐点锁（20→1,30→0.5,40→0,50→0.5,59→0.95）', () => {
    for (let ai1 = 0; ai1 < 60; ai1++) {
      const n7raw = ai1 <= 20 ? 0 : ai1 >= 60 ? 2 : ((ai1 - 20) / 40) * 2;
      const num7 = n7raw > 1 ? 2 - n7raw : n7raw;
      expect(near(bodyAlphaOf(0, 8, ai1), 1 - num7, 1e-9)).toBe(true);
    }
    expect(near(bodyAlphaOf(0, 8, 40), 0)).toBe(true);     // 峰值全消散
  });

  it('ai0=8,lai3=30（离场时玩家仍远）:alpha 回升链生效——40→0,50→0.5,20/60→1', () => {
    expect(near(bodyAlphaOf(30, 8, 20), 1)).toBe(true);
    expect(near(bodyAlphaOf(30, 8, 40), 0)).toBe(true);
    expect(near(bodyAlphaOf(30, 8, 50), 0.5)).toBe(true);
    expect(near(bodyAlphaOf(30, 8, 60), 1)).toBe(true);
    // 中段与 lai3=0 同值（a1=1 时链同形）——旧式在 lai3=30 段会再叠 ×0.3056
    expect(near(bodyAlphaOf(30, 8, 50), bodyAlphaOf(0, 8, 50))).toBe(true);
  });

  it('紫重影 α=本体×0.5 全窗成立（color2×0.5 :26783,含 lai3>0 叠加态）', () => {
    for (const [lai3, ai0, ai1] of [[0, 8, 30], [30, 8, 30], [30, 7, 45], [12, 7, 33]] as const) {
      const { layers } = deerclopsDrawLayers({ lai3, ai0, ai1, opacity: 1, gt: 0 });
      const b = layers.find((l) => l.kind === 'body')!.alpha;
      for (const g of layers.filter((l) => l.kind === 'purpleGhost')) {
        expect(near(g.alpha, b * 0.5)).toBe(true);
      }
    }
  });
});

describe('BJ418 ⑤同域回归锁（红雾环/雾层不受本刀影响）', () => {
  it('红雾环 α=(128/255)(1−r²/2) 不乘 Opacity;雾 α 乘 Opacity 与 (1−num7)（SW-RB10e 面不回潮）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 36, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'redGhost')!.alpha, (128 / 255) * 0.5)).toBe(true);
    expect(near(layers.find((l) => l.kind === 'fog')!.alpha, 66 / 255 * 0.25)).toBe(true);
    const half = deerclopsDrawLayers({ lai3: 36, ai0: 0, ai1: 0, opacity: 0.4, gt: 0 });
    expect(near(half.layers.find((l) => l.kind === 'redGhost')!.alpha, (128 / 255) * 0.5)).toBe(true);
    expect(near(half.layers.find((l) => l.kind === 'fog')!.alpha, (66 / 255) * 0.25 * 0.4)).toBe(true);
  });
});
