// ★EoL2 光之女皇发暗修复锁（2026-10-05,定谳链 scripts/_eol2-xray0..7 + 活机
//   _eol2-live0 双臂）：四刀的机制面回归——
//   ① 修1：636 女皇本体 GetAlpha 补偿——原版 NPC.GetAlpha case 636 =
//      Lerp(格光,White,0.25)×Opacity（NPC.cs:94647-94651,真暗处本体仍 25% 可见）,
//      本仓 drawEmpress 纹理直画×compositeLight 全乘零补偿 → 暗处湮灭。raise 窗
//      内本体 AABB 覆盖格逐通道 Lerp(l,255,0.25)（只升不降保色相）;出生渐显窗
//      （Opacity<0.06）跳过防无源亮块;restore 逐字节还原;非 636 NPC/projId 未接
//      弹零改动。
//   ② 修2：彩虹尾迹族补覆盖——原版 AI_171/173_GetColor / GetFairyQueenWeaponsColor
//      全族不读 Lighting.GetColor（Projectile.cs:46275-46284/46398-46406/21780）→
//      SELF_LUMINOUS_PROJS += 871/872/873/874/919/923/931（whiten 全 true=自色/白
//      不读格光;919/923 floor=本仓 draw 出场窗包络,防出生无源白块）。
//   ③ 修5：932 月总矢——AI_181 alpha=Lerp(255,0,GTLV(0,10,ai0))（Projectile.cs:
//      43979-43981）→ floor=(255−α)/255 同源窗;netPuppet 全显档（selfLumEffAlpha）。
//   ④ 修4（相位2色相环加算复原,Main.cs:27010-27013 color3.A=0）为纯绘制面混合
//      语义,node 无 canvas 不入本锁,活机像素对拍覆盖。
// 锚:NPC.cs:94647-94651 / Projectile.cs:46275/46298/21780/43979-43991 / Main.cs:
//   28768-28815(871)/31543-31553(872/873/931)/36619-36654(874)/36492-36536(919)/
//   28706-28741(923)/36528-36553(932)。
import { describe, it, expect, beforeAll } from 'vitest';

let Renderer: typeof import('../src/render/Renderer').Renderer;
let r: InstanceType<typeof Renderer>;

beforeAll(async () => {
  // Renderer 字段初始化器链会 new Image（SkyRenderer.loadTex）——node 先垫最小桩
  //（self-luminous-floor.test.ts 同款）
  (globalThis as Record<string, unknown>).Image = class {
    src = ''; onload: (() => void) | null = null;
    width = 0; height = 0;
    addEventListener() { /* noop */ }
  };
  const anyStub = (): Record<string, unknown> => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
    set: () => true,
    apply: () => anyStub(),
    construct: () => anyStub(),
  });
  (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
  (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
  (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
  ({ Renderer } = await import('../src/render/Renderer'));
  r = new Renderer(null as never);
}, 120000);

/** 私有静态系数表直调（Map 值 = (proj)=>{floor,whiten} 动态形态） */
const lumOf = (pid: number): ((proj: object) => { floor: number; whiten: boolean }) => {
  const map = (Renderer as unknown as {
    SELF_LUMINOUS_PROJS: Map<number, (proj: never) => { floor: number; whiten: boolean }>;
  }).SELF_LUMINOUS_PROJS;
  const f = map.get(pid);
  expect(f).toBeDefined();
  return (proj: object) => f!(proj as never);
};

/** 假弹（projId/alpha/x/y/w/h/age/netPuppet 最小面） */
type FakeDart = {
  projId: number; alpha: number;
  x: number; y: number; w: number; h: number;
  dead?: boolean; netPuppet?: boolean; age?: number; la0?: number;
};
const dart = (projId: number, tx: number, ty: number, over: Partial<FakeDart> = {}): FakeDart => ({
  projId,
  alpha: 0,
  x: tx * 16 + 4, y: ty * 16 + 4, w: 8, h: 8,
  ...over,
});

/** 假女皇（Enemy 字段面:vanillaId/spawnAlpha/x/y/w/h/dead）——修1 载体 */
type FakeEmpress = {
  vanillaId: number; spawnAlpha: number;
  x: number; y: number; w: number; h: number;
  dead?: boolean;
};
const empress = (tx: number, ty: number, over: Partial<FakeEmpress> = {}): FakeEmpress => ({
  vanillaId: 636,
  spawnAlpha: 0,               // 全显态（Opacity=1）
  x: tx * 16, y: ty * 16, w: 100, h: 100,   // 100×100 盒 ≈ 7×7 格
  ...over,
});

/** 4×4 格光窗 + 三通道数组,缺省暗盒（全 0） */
const W4 = 4;
const mkLight = (fill?: (i: number) => number) => {
  const mk = () => Uint8Array.from({ length: W4 * W4 }, (_v, i) => (fill ? fill(i) : 0));
  return { r: mk(), g: mk(), b: mk() };
};
const li = (tx: number, ty: number) => ty * W4 + tx;

const raiseOf = () =>
  (r as unknown as {
    raiseSelfLuminousProjLight(
      ents: unknown[], lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
      rx: number, ry: number, rw: number, rh: number,
    ): void;
    restoreSelfLuminousProjLight(lr: Uint8Array, lg: Uint8Array, lb: Uint8Array): void;
    fullbright: boolean;
  });

// ============================================================ ① 修2 表面
describe('EoL2 修2: 彩虹尾迹族地板表（原版不读格光 → floor=1/whiten=true）', () => {
  it('静态档 871/872/873/874/931 = floor 1.0 + whiten=true', () => {
    for (const pid of [871, 872, 873, 874, 931]) {
      const v = lumOf(pid)(dart(pid, 1, 2));
      expect(v.floor, `p${pid} floor`).toBeCloseTo(1.0, 6);
      expect(v.whiten, `p${pid} whiten（自色/白,不读格光 → ★I″ 消色差）`).toBe(true);
    }
  });
  it('919 出场窗包络（本体 GTLV(0,20,la0) ∨ 光带 GTLV(60,55)×GTLV(0,10)）', () => {
    // la0=0：全零 → floor 0（消费点 <0.06 跳过=无源白块防线）
    expect(lumOf(919)(dart(919, 1, 2, { la0: 0 })).floor).toBe(0);
    // la0=5：本体 0.25 ∨ 光带 1×0.5=0.5 → 0.5
    expect(lumOf(919)(dart(919, 1, 2, { la0: 5 })).floor).toBeCloseTo(0.5, 6);
    // la0=10：光带满档 1×1 → 1
    expect(lumOf(919)(dart(919, 1, 2, { la0: 10 })).floor).toBeCloseTo(1.0, 6);
    // la0=20..55：本体 1（光带 1）→ 1（稳态 floor=1 满足处方）
    expect(lumOf(919)(dart(919, 1, 2, { la0: 20 })).floor).toBeCloseTo(1.0, 6);
    expect(lumOf(919)(dart(919, 1, 2, { la0: 70 })).floor).toBeCloseTo(1.0, 6);
    expect(lumOf(919)(dart(919, 1, 2)).floor, '缺 la0 字段=出生档 0').toBe(0);
  });
  it('923 出场窗包络 = num25 = GTLV(0,30,la0)×GTLV(180,150,la0)（draw 自身包络）', () => {
    expect(lumOf(923)(dart(923, 1, 2, { la0: 0 })).floor).toBe(0);
    expect(lumOf(923)(dart(923, 1, 2, { la0: 15 })).floor).toBeCloseTo(0.5, 6);
    expect(lumOf(923)(dart(923, 1, 2, { la0: 30 })).floor).toBeCloseTo(1.0, 6);
    expect(lumOf(923)(dart(923, 1, 2, { la0: 90 })).floor).toBeCloseTo(1.0, 6);
    // 收尾 150→180 线性归零（la0≥180 Kill 恒先于 floor=0,飞行域内 160=2/3）
    expect(lumOf(923)(dart(923, 1, 2, { la0: 160 })).floor).toBeCloseTo(2 / 3, 6);
    expect(lumOf(923)(dart(923, 1, 2, { la0: 179 })).floor).toBeCloseTo(1 / 30, 6);
  });
});

// ============================================================ ③ 修5 932 面
describe('EoL2 修5: 932 月总矢（AI_181 α 窗同源地板）', () => {
  it('floor = (255−α)/255：全显 α=0 → 1；首拍 α=229 → 26/255', () => {
    // AI_181（P.cs:43979-43981）首拍 ai0=1 → α=(int)Lerp(255,0,0.1)=229
    expect(lumOf(932)(dart(932, 1, 2, { alpha: 0 })).floor).toBeCloseTo(1.0, 6);
    expect(lumOf(932)(dart(932, 1, 2, { alpha: 229 })).floor).toBeCloseTo(26 / 255, 6);
  });
  it('netPuppet 傀儡按全显档（selfLumEffAlpha 缺省 0）', () => {
    expect(lumOf(932)(dart(932, 1, 2, { alpha: 229, netPuppet: true })).floor).toBeCloseTo(1.0, 6);
  });
  it('α=250（近不可见窗）→ floor<0.06 整体跳过', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(932, 1, 2, { alpha: 250 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(0);
  });
});

// ============================================================ ④ raise 行为
describe('EoL2 修2/修5: raise 写面（暗盒抬亮/出场窗跳过/restore 幂等）', () => {
  it('872 暗盒单格抬满 255（whiten 三通道归一）', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(872, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(255);
    expect(L.g[li(1, 2)]).toBe(255);
    expect(L.b[li(1, 2)]).toBe(255);
  });
  it('919 la0=0（出场窗）不抬亮；la0=10 抬满', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(919, 1, 2, { la0: 0 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(0);
    const L2 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(919, 1, 2, { la0: 10 })], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(L2.r[li(1, 2)]).toBe(255);
  });
  it('923 la0=0 不抬亮；la0=30 抬满', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(923, 1, 2, { la0: 0 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(0);
    const L2 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(923, 1, 2, { la0: 30 })], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(L2.r[li(1, 2)]).toBe(255);
  });
  it('919/923 whiten 全 true（自色,不读格光）', () => {
    expect(lumOf(919)(dart(919, 1, 2, { la0: 30 })).whiten).toBe(true);
    expect(lumOf(923)(dart(923, 1, 2, { la0: 30 })).whiten).toBe(true);
  });
});

// ============================================================ ⑤ 修1 636 载体
describe('EoL2 修1: 636 女皇本体 GetAlpha lerp 抬亮（NPC.cs:94647-94651）', () => {
  it('暗盒: 本体 AABB 覆盖格逐通道 Lerp(l,255,0.25)（0→64）', () => {
    const L = mkLight();
    // 100×100 盒 @ (1,1) → 覆盖格 (1..7,1..7)∩(0..3,0..3) = (1..3,1..3)
    raiseOf().raiseSelfLuminousProjLight([empress(1, 1)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 1)]).toBe(Math.round(0 + 255 * 0.25));   // 64
    expect(L.r[li(3, 3)]).toBe(64);
    expect(L.r[li(0, 0)]).toBe(0);                            // 盒外格不动
    expect(L.r[li(2, 2)]).toBe(64);
  });
  it('亮盒 201: 201→215（=Lerp(201,255,.25),只升不降保色相）', () => {
    const L = mkLight((i) => 201);
    raiseOf().raiseSelfLuminousProjLight([empress(1, 1)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(2, 2)]).toBe(Math.round(201 + 54 * 0.25));  // 215（214.5 half-up）
    expect(L.g[li(2, 2)]).toBe(215);
    expect(L.b[li(2, 2)]).toBe(215);
  });
  it('满亮格 255 零写（只升不降,已达标格零记账）', () => {
    const L = mkLight((i) => (i === li(2, 2) ? 255 : 0));
    raiseOf().raiseSelfLuminousProjLight([empress(1, 1)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(2, 2)]).toBe(255);
    expect(L.r[li(1, 1)]).toBe(64);
  });
  it('出生渐显窗 spawnAlpha=254（Opacity≈0.004<0.06）→ 整体跳过', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([empress(1, 1, { spawnAlpha: 254 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(2, 2)]).toBe(0);
  });
  it('dead 女皇跳过', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([empress(1, 1, { dead: true })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(2, 2)]).toBe(0);
  });
  it('非 636 NPC（无 projId）零改动（其余 NPC 面不接）', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight(
      [empress(1, 1, { vanillaId: 245 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(2, 2)]).toBe(0);
  });
  it('restore 逐字节还原（修1+修2 同账混排）', () => {
    const L = mkLight((i) => (i % 3 === 0 ? 40 : i % 3 === 1 ? 90 : 130));
    const snap = { r: Uint8Array.from(L.r), g: Uint8Array.from(L.g), b: Uint8Array.from(L.b) };
    const ro = raiseOf();
    ro.raiseSelfLuminousProjLight(
      [empress(1, 1), dart(872, 2, 2), dart(932, 3, 1, { alpha: 0 })],
      L.r, L.g, L.b, 0, 0, W4, W4);
    // 确有抬亮发生（前真;fill: li(1,1)=5→130 / li(2,2)=10→90 / li(3,1)=13→40）
    expect(L.r[li(2, 2)]).toBe(255);                          // 872 whiten 满档
    expect(L.r[li(1, 1)]).toBe(Math.round(130 + 125 * 0.25)); // 636 lerp = 161
    ro.restoreSelfLuminousProjLight(L.r, L.g, L.b);
    expect(Array.from(L.r)).toEqual(Array.from(snap.r));
    expect(Array.from(L.g)).toEqual(Array.from(snap.g));
    expect(Array.from(L.b)).toEqual(Array.from(snap.b));
  });
});
