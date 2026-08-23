// 链锤类细节对齐回归（2026-08-23 备案遗留 4 项,标杆 Terarria1457）：
//   ① 链起点 −4px：DrawProj_FlailChains armPosition.MoveTowards(center, 4f)
//     （1457 Main.cs:35941,方法体 :35901-35990;1456 同式 :34792）——链向量自臂位
//     向球心先收 4px → 链长 = 臂球距 − 4（曾全距起步 = 链多 4px 戳进手臂）
//   ② 链节无 alpha 下限：逐节 Lighting.GetColor（:35950）即原版语义,黑暗中链
//     全黑不可见（曾设 0.15 globalAlpha 下限;948 中段 140/255 是原版【色阶】
//     下限 :35963-35976,保留为 alpha 近似）
//   ③ 配重球绘制角 = proj.rotation 原样（1457 通用尾支 Main.cs:35040
//     rotation=proj.rotation;自转增量在 AI_099_1 :68463 rotation+=0.5f——
//     曾 +π/2 = 球体朝向恒偏 90°）
//   ④ 出生位形：链锤/悠悠球走 ItemCheck_Shoot 通用尾支,pointPosition =
//     RotatedRelativePoint(MountedCenter)（1457 Player.cs:47588,发射 :49952）
//     → NewProjectile 盒心落点（Projectile.cs:10878-10879）= 玩家中心;
//     无 per-weapon 出生偏移（备案"Center.X+9×dir、Bottom−8"经 1457/1456/1405
//     三版源码核对不存在）
// 手法：记录型 ctx 代理（9 参 drawImage=链节 / 5 参=球体中心锚）+ global Image 替身。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FlailProj, YoyoProj, CounterweightProj, placeAtShootSpawn } from '../src/entities/WeaponProj';
import type { CounterweightCtx } from '../src/entities/WeaponProj';

// ---------------------------------------------------------------- 记录型 ctx
type Call = { m: string; a: unknown[] };
function makeRecCtx() {
  const calls: Call[] = [];
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(store, {
    get: (t, k) => (typeof k === 'string' && k in t ? t[k] : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    set: (_t, k, v) => { store[String(k)] = v; calls.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}

/** 链节绘制（9 参 drawImage）序列：[中心x, 中心y, 该节 globalAlpha]——
 *  中心/透明度各取该节 drawImage 前最近的 translate / globalAlpha 写入 */
function chainSegments(calls: Call[]): Array<{ x: number; y: number; alpha: number }> {
  const out: Array<{ x: number; y: number; alpha: number }> = [];
  let tx = 0, ty = 0, ga = 1;
  for (const c of calls) {
    if (c.m === 'translate') { tx = c.a[0] as number; ty = c.a[1] as number; }
    else if (c.m === 'set:globalAlpha') { ga = c.a[0] as number; }
    else if (c.m === 'drawImage' && c.a.length === 9) out.push({ x: tx, y: ty, alpha: ga });
  }
  return out;
}

/** renderer 桩：lighting.lightAt 可编程（返回 0..255 三通道） */
function makeR(light: () => [number, number, number] = () => [255, 255, 255]) {
  const { calls, ctx } = makeRecCtx();
  const r = { ctx, lighting: { lightAt: (_tx: number, _ty: number) => light() } };
  return { calls, r: r as never };
}

// ------------------------------------------------- global Image 替身（链/球贴图）
// 链节高 = 12（非 757 无附加 → linkH=12）
const IMG_W = 8, IMG_H = 12;
beforeAll(() => {
  vi.stubGlobal('Image', class {
    width = IMG_W; height = IMG_H;
    naturalWidth = IMG_W; naturalHeight = IMG_H;
    complete = true;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  });
});

const mkFlail = (projId: number, handX: number, handY: number) => {
  // 球盒 (100,100)（25 号 scale0.9 → 19×19,球心 (109.5,109.5)）;手坐标直写
  // （fixedUpdate 每帧自玩家中心刷新,绘制侧只读）
  const f = new FlailProj(100, 100, 20, 4, projId, () => false, () => ({ x: handX, y: handY }));
  f.handX = handX; f.handY = handY;
  return f;
};

// ============================================================
// ① 链起点 −4px（1457 Main.cs:35941 MoveTowards(center,4)）
// ============================================================
describe('链起点 = 臂位向球心收 4px（1457 Main.cs:35941）', () => {
  it('臂球距 44 → 链长 40（+半节 6 = 46）→ 4 节;末节中心距球 36（曾全距 50 → 5 节）', () => {
    const f = mkFlail(25, 109.5, 153.5);   // 手在球心正下 44px
    const { calls, r } = makeR();
    f.draw(r, undefined as never);
    const segs = chainSegments(calls);
    expect(segs.length).toBe(4);   // ceil((44−4+6)/12)=4;旧全距式 ceil(50/12)=5
    expect(segs[0].x).toBeCloseTo(109.5);
    expect(segs[0].y).toBeCloseTo(109.5);   // 首节仍在球心（:35940 center=proj.Center）
    expect(segs[3].y).toBeCloseTo(109.5 + 36);   // 步长=链节高 12（:35943 num2）
    // 旧实现的第 5 节（球心+48=手部坐标）必须不存在
    for (const s of segs) expect(s.y).not.toBeCloseTo(109.5 + 48);
  });

  it('臂球距 56 → 链长 52（+半节 6 = 58）→ 5 节（旧全距式 ceil(62/12)=6）', () => {
    const f = mkFlail(25, 109.5, 165.5);
    const { calls, r } = makeR();
    f.draw(r, undefined as never);
    const segs = chainSegments(calls);
    expect(segs.length).toBe(5);
    expect(segs[4].y).toBeCloseTo(109.5 + 48);   // 末节 = 球心 + 4×12
  });

  it('臂球距 ≤4 → MoveTowards 落球心（链长钳 0,不画越臂节）', () => {
    const f = mkFlail(25, 109.5, 112.5);   // 距 3 < 4
    const { calls, r } = makeR();
    f.draw(r, undefined as never);
    const segs = chainSegments(calls);
    // d=0 → remain=半节 6 → 恰 1 节在球心（SafeNormalize(Zero) 归零态）
    expect(segs.length).toBe(1);
    expect(segs[0].y).toBeCloseTo(109.5);
  });
});

// ============================================================
// ② 链节无 alpha 下限（:35950 逐节取光;黑暗中全黑不可见）
// ============================================================
describe('链节 alpha = 逐节取光,无 0.15 下限（1457 Main.cs:35950）', () => {
  it('全黑光照 → 各节 alpha=0（曾钳 0.15 = 黑暗中链仍隐约可见）', () => {
    const f = mkFlail(25, 109.5, 153.5);
    const { calls, r } = makeR(() => [0, 0, 0]);
    f.draw(r, undefined as never);
    const segs = chainSegments(calls);
    expect(segs.length).toBe(4);
    for (const s of segs) expect(s.alpha).toBe(0);
  });

  it('满光照 → alpha=1;948 中段保留原版色阶下限 140/255（:35963-35976）', () => {
    // 948 盒 20×20 → 球心 (110,110);手在下方 100px → 链长 96 → 9 节
    const f = mkFlail(948, 110, 210);
    const { calls, r } = makeR(() => [0, 0, 0]);
    f.draw(r, undefined as never);
    const segs = chainSegments(calls);
    expect(segs.length).toBe(9);
    expect(segs[0].alpha).toBe(1);              // 前 4 节 Chain43 全亮（color=White :35980）
    expect(segs[4].alpha).toBeCloseTo(140 / 255);   // Chain42 色阶下限
    expect(segs[5].alpha).toBeCloseTo(140 / 255);
    expect(segs[6].alpha).toBe(0);              // 其余 Chain41 纯取光,无下限
  });
});

// ============================================================
// ③ 配重球绘制角 = rot 原样（1457 Main.cs:35040;自转在 AI :68463）
// ============================================================
describe('配重球绘制无 +π/2 偏移（1457 Main.cs:35040 rotation=proj.rotation）', () => {
  const mkCtx = (): CounterweightCtx => ({
    owner: () => null,
    channel: () => false,
    yoyoInPlay: () => true,
    mouseDelta: () => ({ dx: 0, dy: 0 }),
  });

  it('rot=1.25 → rotate(1.25)（曾 +π/2 ≈ 2.821）', () => {
    const cw = new CounterweightProj(100, 100, 20, 4, 556, 0, mkCtx());
    (cw as unknown as { rot: number }).rot = 1.25;   // AI_099_1 :68463 每帧 +0.5 的私有累积
    const { calls, r } = makeR();
    cw.draw(r, undefined as never);
    const rots = calls.filter((c) => c.m === 'rotate').map((c) => c.a[0] as number);
    expect(rots.length).toBe(1);
    expect(rots[0]).toBeCloseTo(1.25, 6);
    expect(rots[0]).not.toBeCloseTo(1.25 + Math.PI / 2, 3);
  });

  it('rot=0（出生态）→ rotate(0) 贴图直立,与悠悠球同族同式', () => {
    const cw = new CounterweightProj(100, 100, 20, 4, 1079, 0, mkCtx());
    const { calls, r } = makeR();
    cw.draw(r, undefined as never);
    const rots = calls.filter((c) => c.m === 'rotate').map((c) => c.a[0] as number);
    expect(rots[0]).toBeCloseTo(0, 6);
  });
});

// ============================================================
// ④ 出生位形：盒心=玩家中心,无 per-weapon 偏移（Player.cs:47588/:49952 +
//   Projectile.cs:10878-10879;备案 +9×dir/Bottom−8 不存在）
// ============================================================
describe('链锤/悠悠球 shoot 出生 = 盒心落玩家中心（placeAtShootSpawn）', () => {
  it('链锤 25：placeAtShootSpawn 后盒心 = 指定点（盒 19×19 → 左上 = 心−9.5）', () => {
    const f = new FlailProj(0, 0, 20, 4, 25, () => false, () => ({ x: -999, y: -999 }));
    placeAtShootSpawn(f, 800, 1440);
    expect(f.w).toBe(19); expect(f.h).toBe(19);   // SetDefaults×scale 盒
    expect(f.cx).toBe(800);
    expect(f.cy).toBe(1440);
    expect(f.x).toBe(800 - 9.5);
    expect(f.y).toBe(1440 - 9.5);
  });

  it('悠悠球 544：盒心 = 指定点（盒 16×16）', () => {
    const y = new YoyoProj(0, 0, 20, 4, 544, 0, () => false, () => ({ x: 0, y: 0 }));
    placeAtShootSpawn(y, 800, 1440);
    expect(y.w).toBe(16); expect(y.h).toBe(16);
    expect(y.cx).toBe(800);
    expect(y.cy).toBe(1440);
  });

  it('出生锚与光标方位无关（无 per-weapon 方向偏移——备案 +9×dir 核对不存在）', () => {
    // 同一玩家中心两次构造（光标分别在左/右侧）→ 落点逐位相等
    const a = new FlailProj(0, 0, 20, 4, 26, () => false, () => ({ x: 700, y: 1400 }));
    const b = new FlailProj(0, 0, 20, 4, 26, () => false, () => ({ x: 900, y: 1500 }));
    placeAtShootSpawn(a, 800, 1440);
    placeAtShootSpawn(b, 800, 1440);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });
});
