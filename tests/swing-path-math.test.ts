// 近战任务A/B 纯几何回归（SwingPathMath.ts —— 任务书允许新建的纯函数小文件）：
// · 充能电水母族表（NPCID.Sets.ZappingJellyfish,Terarria1457/Terraria.ID/NPCID.cs:4460）
// · GetPointOnSwungItemPath（1457 Player.cs:45118-45129）——火之大剑(Volcano,type121)
//   延长臂探针源。★[J1] 勘误(蓝队 2026-08-30)：历史命名"星怒"系武器身份错挂——
//   真星怒 Starfury=65(ItemID.cs:1676),type 121=FieryGreatsword/Volcano(ItemID.cs:1788,
//   贴图 70×70 vs 星怒 42×42 可作物证);行为目标(swingVid===121)无误,仅名称错挂。
//   函数名 starfurySwingProbes 保留为历史 API 名（最小 churn）,详见 SwingPathMath.ts 头。
// · Utils.LineRectangleDistance（Utils.cs:837-848）——精确四角距离非中心距近似
// 数值期望全部手算闭合形（70√2×0.9×√½=63 等），防止实现被"顺手化简"漂移。
//
// ★红队 R3 2026-08-30 复核全套 clean 结论锚（勿动作，留行号清单供考古引用）：
// C1 rot↔世界角镜像共轭推导（rotatedRelativePoint 直移植 Player.cs:4209-4240;
//    本仓渲染层本地角与 C# 世界系互为共轭,d=−1 时取相反数——Game.updateSwingHits 注释）
// C2 LineRectangleDistance/Between/ClosestPointOnLine 三函数全套
//    （Utils.cs:837-848 / :1806-1813 / :1964-1980）——含"斜弦穿盒仍过角近似"怪癖照记
// C3 电水母反噬数值链 clean：击退方向/hitDirection 语义、banner 不涉——原版反噬支是
//    ProcessHitAgainstNPC 前导分支(:44619-44625),早于 banner/damage 面且独占;
//    本仓单点 takeDamageFromJellyfish(Game.ts ≈:21308,Player.cs:44607-44613 直移植)
// C4 充能态唯一置位点=NPC.AI aiStyle==18 expert 支 `dontTakeDamage = true`
//    (NPC.cs :24299,wet∧ai[1]==1 潜伏态;else 支 :24280 显式置 false=逐帧维护非粘滞);
//    门内 type 名单恰 {63,64,103,242}
// C5 族表第 4 元素 242=BloodJelly 猩红水域 1/3 档(NPCID.cs:11555)
import { describe, it, expect } from 'vitest';
import {
  ZAPPING_JELLYFISH,
  getPointOnSwungItemPath,
  lineRectangleDistance,
  starfurySwingProbes,
  rotatedRelativePoint,
} from '../src/player/SwingPathMath';

describe('任务A：NPCID.Sets.ZappingJellyfish 族表', () => {
  it('成员恰为 {63,64,103,242}', () => {
    expect([...ZAPPING_JELLYFISH].sort((a, b) => a - b)).toEqual([63, 64, 103, 242]);
  });
});

describe('任务B：GetPointOnSwungItemPath 探针点', () => {
  // 70×70 对角长 = 70√2 ≈ 98.99495；t=0.9 触达 89.09545；
  // 方向单位向量 ±√½ → 分量闭式解 ±63（89.09545×√½）
  it('t=0 → 恒等返回 itemLocation（fullRotation/gfxOffY 默认语境下 RRP 为恒等映射）', () => {
    const p = getPointOnSwungItemPath(70, 70, 0, 1, { x: 1234.5, y: -77 }, 0.37, 1);
    expect(p.x).toBeCloseTo(1234.5, 9);
    expect(p.y).toBeCloseTo(-77, 9);
  });

  it('direction=1：outward = rot+3.926991+π/2，rot=0 时探针端恰为 (+63,−63)', () => {
    const p = getPointOnSwungItemPath(70, 70, 0.9, 1, { x: 0, y: 0 }, 0, 1);
    expect(p.x).toBeCloseTo(63, 4);
    expect(p.y).toBeCloseTo(-63, 4);
  });

  it('direction=-1：outward 只加 3.926991（无 +π/2），rot=0 时探针端为 (−63,−63)', () => {
    const p = getPointOnSwungItemPath(70, 70, 0.9, 1, { x: 0, y: 0 }, 0, -1);
    expect(p.x).toBeCloseTo(-63, 4);
    expect(p.y).toBeCloseTo(-63, 4);
  });

  it('gravDir=-1 支：num2 += (π/2)·direction（本仓恒不触发,照移植并钉住）', () => {
    // dir=1 且 gravDir=-1：总角 = 3.926991+π/2+π/2 ≡ π/4 → (+63,+63)
    const down = getPointOnSwungItemPath(70, 70, 0.9, 1, { x: 0, y: 0 }, 0, 1, -1);
    expect(down.x).toBeCloseTo(63, 4);
    expect(down.y).toBeCloseTo(63, 4);
    // dir=-1 且 gravDir=-1：总角 = 3.926991−π/2 ≡ −π/4·3? 直接钉值 225°−90°=135° → (−63,+)。
    // 135° 单位向量 = (−√½,+√½)
    const up = getPointOnSwungItemPath(70, 70, 0.9, 1, { x: 0, y: 0 }, 0, -1, -1);
    expect(up.x).toBeCloseTo(-63, 4);
    expect(up.y).toBeCloseTo(63, 4);
  });

  it('itemScale 线性放大触达（手套档 ×1.1 与命中盒侧同规则）', () => {
    const p = getPointOnSwungItemPath(70, 70, 0.9, 2, { x: 0, y: 0 }, 0, 1);
    expect(p.x).toBeCloseTo(126, 4);
    expect(p.y).toBeCloseTo(-126, 4);
  });
});

describe('任务B：Utils.LineRectangleDistance 精确几何', () => {
  const R = { x: 0, y: 0, w: 100, h: 100 };

  it('线段端点落在盒内/角上（Between 含端点闭区间）→ 0', () => {
    expect(lineRectangleDistance(R, { x: 150, y: 50 }, { x: 100, y: 0 })).toBe(0);
    expect(lineRectangleDistance(R, { x: 150, y: 50 }, { x: 50, y: 50 })).toBe(0);
    // 边界线上（x=0 左缘）同样命中 0
    expect(lineRectangleDistance(R, { x: -30, y: 10 }, { x: 0, y: 99 })).toBe(0);
  });

  it('右方平行线段：最近角投影被钳到端点 → √(50²+50²)，非中心距近似', () => {
    const d = lineRectangleDistance(R, { x: 150, y: 50 }, { x: 300, y: 50 });
    expect(d).toBeCloseTo(Math.SQRT2 * 50, 9);
    // 反证：中心距近似会得 |200-50|=150+ 的另一个数
    expect(d).not.toBeCloseTo(150, 6);
  });

  it('斜弦穿过盒内但两端都在盒外：原版返回过角近似距而非 0（怪癖照记,勿修正）', () => {
    const r40 = { x: 0, y: 0, w: 40, h: 40 };
    const d = lineRectangleDistance(r40, { x: -20, y: 20 }, { x: 60, y: 20 });
    expect(d).toBeCloseTo(20, 9);
  });

  it('斜穿盒外的对角线：x+y=30 距角 (40,0)/(0,40) 10/√2', () => {
    const r40 = { x: 0, y: 0, w: 40, h: 40 };
    const d = lineRectangleDistance(r40, { x: -30, y: 60 }, { x: 60, y: -30 });
    expect(d).toBeCloseTo(10 / Math.SQRT2, 9);
  });

  it('远离且背向的线段：投影钳回起点,最近角 (10,10) → 190√2', () => {
    const r10 = { x: 0, y: 0, w: 10, h: 10 };
    const d = lineRectangleDistance(r10, { x: 200, y: 200 }, { x: 300, y: 300 });
    expect(d).toBeCloseTo(190 * Math.SQRT2, 9);
  });
});

describe('任务B：starfurySwingProbes 组装与 RotatedRelativePoint 非0旋转支', () => {
  it('双探针 = [itemLocation, itemLocation+(±63,∓63)]（rot=0/dir=1 口径）', () => {
    const [a, b] = starfurySwingProbes({ x: 10, y: 20 }, 0, 1, 1);
    expect(a.x).toBeCloseTo(10, 9);
    expect(a.y).toBeCloseTo(20, 9);
    expect(b.x).toBeCloseTo(73, 4);
    expect(b.y).toBeCloseTo(-43, 4);
  });

  it('rotatedRelativePoint 非0旋转支 = 绕底缘锚心旋转 +(−4,−4) 偏移（Player.cs:4209 展开式）', () => {
    // n=mount.PlayerOffset/2+4=4；fr=π/2：(10,0)→(0,10)、shift=(0,−4)+(−4,0)=(−4,−4)
    const out = rotatedRelativePoint(110, 100, { bottomX: 100, bottomY: 100, fullRotation: Math.PI / 2 });
    expect(out.x).toBeCloseTo(96, 9);   // 100 + 0 − 4
    expect(out.y).toBeCloseTo(106, 9);  // 100 + 10 − 4
  });

  it('≤16f 门：贴着 t=0.9 探针端的窄盒命中旗成立、远盒不成立', () => {
    const [a, b] = starfurySwingProbes({ x: 0, y: 0 }, 0, 1, 1);
    const near = lineRectangleDistance({ x: 55, y: -70, w: 20, h: 20 }, a, b);
    const far = lineRectangleDistance({ x: 200, y: 120, w: 10, h: 10 }, a, b);
    expect(near <= 16).toBe(true);   // flag2 真
    expect(far <= 16).toBe(false);
  });
});
