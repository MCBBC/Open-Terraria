// ★T1 自发光弹光照地板（F1/F2 仲裁修订版,2026-09-02 红队 I′ 对抗定罪后蓝队回归）：
//   Renderer.SELF_LUMINOUS_PROJS 弹覆盖格光值抬亮地板——
//   ① F1 定罪：596 地板 = GetAlpha RGB(255−α) 白化系数（Projectile.cs:80903-80910,
//      α=0 全显态=1.0）,旧固定 0.5 档系误把 A 通道 128/255 当自发光（A 已由
//      Dart.draw globalAlpha 重放,不进地板）；
//   ② F2 定罪：地板对弹自身 α 敏感——596 渐显/渐隐窗/穿墙钳 128 三段、811 出场
//      13 拍渐显（α−20/t）,原版弹不可见或半透的窗内地板恒满档 = 无源白块;
//      系数 <0.06（近不可见窗）整体跳过；
//   ③ raise/restore 幂等：compositeLight 前后光数组逐字节还原（含多弹同格重叠——
//      账本须记【原值】,Set 去重改造不得记账抬亮后的值）；
//   ④ F3 粒子缺省重力契约：ax/ay 通道在位 → 缺省 grav=0（Game.particleGravDefault）。
//   ⑤ ★I″ 去色（2026-09-02 蓝队白化批,原"已知边界③"清偿）+ ★M′-MAJOR-2 白化按 k
//      分档（2026-09-02 红蓝对抗定谳）：raise 写面分道——
//      · 596/811 顶点色恒白（Projectile.cs:80903 / Main.cs:30846 Lerp 恒白端,不读
//        格光色）→ whiten=true：白化 R=G=B=max(r,g,b,fr) 消色差,熔岩红光区白剪影
//        不再被染色;白化值取三通道最大值=只升不降（白天暖光不压暗）;
//      · 814 顶点色=Lerp(格光,White,0.35)【读格光】（Main.cs:30068+:30855）→
//        whiten=false：逐通道 max 抬 fr 旧形,保留 65% 光色相（全白白化破坏色相+
//        地形漂白,红队确认旧形更近原版;原 I″"残留微差"备案就此清偿）;
//      账本记原 RGB×3、restore 逐字节还原,两形已达标格零写零记账。
// 锚:Projectile.cs GetAlpha 575/596/659 专支 + 缺省段 :81503-81510、Main.cs
//   轨迹支 :30841-30856、Dust 缺省重力 Dust.cs:894 族。
import { describe, it, expect, beforeAll } from 'vitest';

let Renderer: typeof import('../src/render/Renderer').Renderer;
let particleGravDefault: typeof import('../src/core/Game').particleGravDefault;
let r: InstanceType<typeof Renderer>;

beforeAll(async () => {
  // Renderer 字段初始化器链会 new Image（SkyRenderer.loadTex）——node 先垫最小桩
  //（fog-entry-seq.test.ts 同款）
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
  ({ particleGravDefault } = await import('../src/core/Game'));
  r = new Renderer(null as never);
}, 120000);

/** 私有静态系数表直调（Map 值 = (proj)=>{floor,whiten} 动态形态,★M′-MAJOR-2） */
const lumOf = (pid: number): ((proj: object) => { floor: number; whiten: boolean }) => {
  const map = (Renderer as unknown as {
    SELF_LUMINOUS_PROJS: Map<number, (proj: never) => { floor: number; whiten: boolean }>;
  }).SELF_LUMINOUS_PROJS;
  const f = map.get(pid);
  expect(f).toBeDefined();
  return (proj: object) => f!(proj as never);
};

/** 假弹（Dart 字段面：projId/alpha/life/x/y/w/h/netPuppet） */
type FakeDart = {
  projId: number; alpha: number; life: number;
  x: number; y: number; w: number; h: number;
  dead?: boolean; netPuppet?: boolean;
};
const dart = (projId: number, tx: number, ty: number, over: Partial<FakeDart> = {}): FakeDart => ({
  projId,
  alpha: 0,                  // 全显态（原版 α=0）
  life: 600,                 // 未入 596 timeLeft<30 渐隐窗
  x: tx * 16 + 4, y: ty * 16 + 4, w: 8, h: 8,   // 单格 (tx,ty) 内
  ...over,
});

/** 4×4 格光窗（rx=0,ry=0,rw=4,rh=4）+ 三通道数组,暗盒（全 0）或梯度纹理 */
const W4 = 4;
const mkLight = (fill?: (i: number) => number) => {
  const mk = () => Uint8Array.from({ length: W4 * W4 }, (_v, i) => (fill ? fill(i) : 0));
  return { r: mk(), g: mk(), b: mk() };
};
/** 格 (tx,ty) → 光数组下标（rx=ry=0） */
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

// ============================================================ ① F1 系数表
describe('F1: SELF_LUMINOUS_PROJS 地板动态化（RGB 顶点色乘数口径 + whiten 分档）', () => {
  it('596 全显态（α=0）= floor 1.0（原 RGB(255−α) 乘数,非旧 A 通道 0.5 档）+ whiten=true', () => {
    const v = lumOf(596)(dart(596, 1, 2));
    expect(v.floor).toBeCloseTo(1.0, 6);
    expect(v.whiten, '顶点色恒白（Projectile.cs:80903 GetAlpha 专支不读格光）→ ★I″ 消色差').toBe(true);
  });
  it('811 恒亮端 k=1.0（Remap(ai0,0,15,1,0.3) 恒下端）+ whiten=true', () => {
    const v = lumOf(811)(dart(811, 1, 2));
    expect(v.floor).toBeCloseTo(1.0, 6);
    expect(v.whiten, '顶点色恒白（Main.cs:30846 Lerp 恒白端不读格光）→ ★I″ 消色差').toBe(true);
  });
  it('814 = floor 0.35（轨迹支 Lerp(·,White,0.35) 常数）+ whiten=false（★M′-MAJOR-2 顶点色读格光）', () => {
    const v = lumOf(814)(dart(814, 1, 2));
    expect(v.floor).toBeCloseTo(0.35, 6);
    expect(v.whiten, '顶点色=Lerp(格光,White,0.35) 读格光（Main.cs:30068+:30855）→ 逐通道 max 保留色相').toBe(false);
  });
});

// ================================================== ② F2 对弹自身 α 敏感
describe('F2: 地板按弹自身 effAlpha 缩放（近不可见窗跳过）', () => {
  it('暗盒全亮面：811/814 全显态抬亮到 k×255（811→255 / 814→89）', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(255);
    const L2 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(814, 1, 2)], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(L2.r[li(1, 2)]).toBe(Math.round(255 * 0.35));   // 89
    expect(L2.g[li(1, 2)]).toBe(89);
    expect(L2.b[li(1, 2)]).toBe(89);
  });

  it('811 出场渐显（AI α−20/t）：α=128 → 半档,α=250（近不可见）→ 跳过', () => {
    // 出场第 7 拍 α=255−140=115 → floor=(255−115)/255≈0.549
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2, { alpha: 115 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(Math.round(255 * (140 / 255)));   // 140
    // α=250 → floor≈0.0196 < 0.06 → 整体跳过（无源白块防线）
    const L2 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2, { alpha: 250 })], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(L2.r[li(1, 2)]).toBe(0);
  });

  it('596 三段：全显 1.0 / 穿墙钳 128 半档 / 渐隐窗末段（life→0）≈0 跳过', () => {
    // 穿墙钳（:34208-34219 实心盒 α=128）→ floor=(255−128)/255≈0.498
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(596, 1, 2, { alpha: 128 })], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(127);
    // 渐隐窗（timeLeft<30 GetAlpha 就地覆写 α=255−255·timeLeft/30）：
    // life=15 → α=127.5 → floor=0.5
    const L2 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(596, 1, 2, { life: 15 })], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(L2.r[li(1, 2)]).toBe(Math.round(255 * 0.5));          // 128
    // life=0（窗末）→ α=255 → floor=0 → 跳过
    const L3 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(596, 1, 2, { life: 0 })], L3.r, L3.g, L3.b, 0, 0, W4, W4);
    expect(L3.r[li(1, 2)]).toBe(0);
    // 出生渐显首拍（AI α=255）→ 跳过
    const L4 = mkLight();
    raiseOf().raiseSelfLuminousProjLight([dart(596, 1, 2, { alpha: 255 })], L4.r, L4.g, L4.b, 0, 0, W4, W4);
    expect(L4.r[li(1, 2)]).toBe(0);
  });

  it('地板只在光值低于地板时抬亮（白天光照≥地板零改动）', () => {
    const L = mkLight((i) => 200 + (i % 56));    // 200..255
    const before = Array.from(L.r);
    // 814 地板 0.35（fr=89）< 200 → 零改动;811 地板 1.0（fr=255）仅在满白格零改动
    raiseOf().raiseSelfLuminousProjLight([dart(814, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(Array.from(L.r)).toEqual(before);
    const L2 = mkLight(() => 255);
    const before2 = Array.from(L2.r);
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2)], L2.r, L2.g, L2.b, 0, 0, W4, W4);
    expect(Array.from(L2.r)).toEqual(before2);
  });

  it('dead 弹 / 表外弹型不抬亮', () => {
    const L = mkLight();
    raiseOf().raiseSelfLuminousProjLight(
      [dart(811, 1, 2, { dead: true }), dart(55, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(0);
  });
});

// ==================================================== ③ raise/restore 幂等
describe('raise/restore 幂等（compositeLight 前后光数组还原）', () => {
  it('raise 改动光值 → restore 逐字节还原（含多弹覆盖格）', () => {
    const L = mkLight((i) => (i * 17) % 256);
    const snap = { r: Array.from(L.r), g: Array.from(L.g), b: Array.from(L.b) };
    const ents = [dart(811, 0, 0), dart(596, 2, 3), dart(814, 3, 0)];
    raiseOf().raiseSelfLuminousProjLight(ents, L.r, L.g, L.b, 0, 0, W4, W4);
    // raise 确实抬亮过（非空转）：至少一格被抬高
    expect(L.r.some((v, i) => v > snap.r[i])).toBe(true);
    raiseOf().restoreSelfLuminousProjLight(L.r, L.g, L.b);
    expect(Array.from(L.r)).toEqual(snap.r);
    expect(Array.from(L.g)).toEqual(snap.g);
    expect(Array.from(L.b)).toEqual(snap.b);
  });

  it('多弹同格重叠：账本记原值（低档先抬、高档再抬不重复记账,restore 一次即还原）', () => {
    const L = mkLight((i) => (i * 5 + 3) % 256);
    const snap = { r: Array.from(L.r), g: Array.from(L.g), b: Array.from(L.b) };
    // 814（fr=89）先抬 → 811（fr=255）同格再抬：首触已记账原值 48,二触不得改记 89
    raiseOf().raiseSelfLuminousProjLight(
      [dart(814, 1, 2), dart(811, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(L.r[li(1, 2)]).toBe(255);
    raiseOf().restoreSelfLuminousProjLight(L.r, L.g, L.b);
    expect(L.r[li(1, 2)]).toBe(snap.r[li(1, 2)]);
    expect(Array.from(L.r)).toEqual(snap.r);
    // 幂等：raise→restore 循环两次,终态仍逐字节还原
    for (let k = 0; k < 2; k++) {
      raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
      raiseOf().restoreSelfLuminousProjLight(L.r, L.g, L.b);
    }
    expect(Array.from(L.r)).toEqual(snap.r);
    expect(Array.from(L.b)).toEqual(snap.b);
  });

  it('空弹面 / fullbright 模式：raise 空转,restore 无副作用', () => {
    const L = mkLight((i) => (i * 31) % 256);
    const snap = Array.from(L.r);
    raiseOf().raiseSelfLuminousProjLight([], L.r, L.g, L.b, 0, 0, W4, W4);
    raiseOf().restoreSelfLuminousProjLight(L.r, L.g, L.b);
    expect(Array.from(L.r)).toEqual(snap);
    const fb = raiseOf();
    const prevFb = fb.fullbright;
    fb.fullbright = true;
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect(Array.from(L.r)).toEqual(snap);
    fb.fullbright = prevFb;
  });
});

// = ③′ ★I″ 去色 + ★M′-MAJOR-2 白化按 k 分档（2026-09-02 红蓝对抗定谳）
describe('★M′ 白化分档：596/811 whiten（消色差）vs 814 逐通道 max（保留 65% 光色相）', () => {
  it('熔岩红光 (200,40,10) + 814（fr=89）→ 逐通道 max (200,89,89) 不白化（色相保留）;restore 还原', () => {
    const L = mkLight();
    L.r[li(1, 2)] = 200; L.g[li(1, 2)] = 40; L.b[li(1, 2)] = 10;
    raiseOf().raiseSelfLuminousProjLight([dart(814, 1, 2)], L.r, L.g, L.b, 0, 0, W4, W4);
    // whiten=false（顶点色=Lerp(格光,White,0.35) 读格光）→ 逐通道 max 旧形：
    // 低于地板的 G/B 抬到 89,红通道原值保留（I″ 旧形白化 (200,200,200) 破坏色相,已废）
    expect(L.r[li(1, 2)], 'R≥fr 原值保留（65% 色相）').toBe(200);
    expect(L.g[li(1, 2)], 'G<fr 抬到地板').toBe(89);
    expect(L.b[li(1, 2)], 'B<fr 抬到地板').toBe(89);
    raiseOf().restoreSelfLuminousProjLight(L.r, L.g, L.b);
    expect(L.r[li(1, 2)]).toBe(200);
    expect(L.g[li(1, 2)]).toBe(40);
    expect(L.b[li(1, 2)]).toBe(10);
  });

  it('亮橙光 (255,128,30) + 814：仅 B<fr 抬 89,R/G≥fr 零写（逐通道 max 不白化成全白）', () => {
    const L = mkLight();
    L.r[li(2, 1)] = 255; L.g[li(2, 1)] = 128; L.b[li(2, 1)] = 30;
    raiseOf().raiseSelfLuminousProjLight([dart(814, 2, 1)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect([L.r[li(2, 1)], L.g[li(2, 1)], L.b[li(2, 1)]],
      'I″ 旧形全白 (255,255,255) 破坏色相 → 逐通道 max').toEqual([255, 128, 89]);
  });

  it('暗红光 (100,20,10) + 596 全显态（fr=255）→ 全白（原版 GetAlpha 恒白不读格光）', () => {
    const L = mkLight();
    L.r[li(0, 3)] = 100; L.g[li(0, 3)] = 20; L.b[li(0, 3)] = 10;
    raiseOf().raiseSelfLuminousProjLight([dart(596, 0, 3)], L.r, L.g, L.b, 0, 0, W4, W4);
    expect([L.r[li(0, 3)], L.g[li(0, 3)], L.b[li(0, 3)]]).toEqual([255, 255, 255]);
  });

  it('判别保留：同格熔岩红光 (200,40,10)——811 whiten=true 白化灰阶,814 保留色相', () => {
    const lava = (L: { r: Uint8Array; g: Uint8Array; b: Uint8Array }) => {
      L.r[li(1, 2)] = 200; L.g[li(1, 2)] = 40; L.b[li(1, 2)] = 10;
    };
    const L811 = mkLight(); lava(L811);
    raiseOf().raiseSelfLuminousProjLight([dart(811, 1, 2)], L811.r, L811.g, L811.b, 0, 0, W4, W4);
    expect([L811.r[li(1, 2)], L811.g[li(1, 2)], L811.b[li(1, 2)]],
      '811 顶点色恒白（Main.cs:30846 Lerp 恒白端）→ ★I″ 消色差（fr=255 全程 → 三通道同值）')
      .toEqual([255, 255, 255]);
    const L814 = mkLight(); lava(L814);
    raiseOf().raiseSelfLuminousProjLight([dart(814, 1, 2)], L814.r, L814.g, L814.b, 0, 0, W4, W4);
    expect([L814.r[li(1, 2)], L814.g[li(1, 2)], L814.b[li(1, 2)]],
      '814 顶点色读格光（Lerp(格光,White,0.35)）→ 逐通道 max 色相保留')
      .toEqual([200, 89, 89]);
  });
});

// ================================================= ④ F3 缺省重力契约
describe('F3: 粒子缺省重力契约（ax/ay 在位 → 缺省 grav=0）', () => {
  it('加速度通道在位：缺省零重力（编排粒子 Velocity+APF 全责）', () => {
    expect(particleGravDefault({ ax: -0.1, ay: 0 })).toBe(0);
    expect(particleGravDefault({ ay: -0.1 })).toBe(0);
    expect(particleGravDefault({ ax: 0 })).toBe(0);
    expect(particleGravDefault({ ax: undefined, ay: undefined })).toBe(0.05);
  });
  it('无通道普通重力尘维持 +0.05;显式 grav 恒优先（含 0）', () => {
    expect(particleGravDefault({})).toBe(0.05);
    expect(particleGravDefault({ grav: 0.02, ax: -0.1 })).toBe(0.02);
    expect(particleGravDefault({ grav: 0 })).toBe(0);
    expect(particleGravDefault({ grav: 0, ax: -0.1, ay: -0.1 })).toBe(0);
  });
});
