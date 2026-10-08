// ★BJ547（2026-10-07 BJ546 复报定谳：永恒水晶本体全白过曝 vs 原版紫细节）。
// 三环复验结论（亲读 1457 反编译 + 真机剥层探针 /tmp/probe-out/_bj547）：
//  ①【主凶·光柱核心笔 α 语义】Main.cs:24377-24378 第二笔 Extra_89 色 =
//    Color.Lerp(color28, White, 0.5f) —— XNA Color.Lerp 四通道【含 A】:
//    color28.A=0 → A=0→255 半程 = 127.5→(int)127（★BJ-C9 F1 勘误:旧注"=128"系
//    127.5 误上取整;color28 本体=(140,50,255,0)×0.6f=(84,30,153,0) :24348-24349,
//    Lerp 色面=(169,142,204,127)=Renderer.BJ_C9_CORE_TINT）。AlphaBlend(One,InvSrcAlpha)
//    语义 = 半削底+半加算（out = src.rgb + dst×(1−src.a),src.a=texel.a×127/255
//    随束图 α 逐像素加权;Extra_89=72×72 径向辉光盘,中心 α≈0.545）——本体在束
//    下被衰减 ~50% 再添紫辉光 = 紫细节保留（原版相「紫晶体+白高光」）。
//    BJ546 误作 A=0 纯加算 α=1 全贡献 → 辉光盘全额加算罩在 58×44 本体上 =
//    全通道饱和白（探针:全层 blown 73.7%/摘叠层 0%,mean RGB 231→122）。
//    落刀=destination-out(束图,ga=127/255)→lighter 两步式（draw546GlowCore 同构）。
//  ②【次凶·内环层序】内环 4 拷贝（Main.cs:24266-24282）画在本体（:24283,不透明
//    AlphaBlend 覆盖）【之前】= 只露轮廓外 ±3px 呼吸晃影;BJ546 挂 drawNpcGlow
//    （本体后槽）= 叠印本体之上 +1.5×texel（修①后仍洗白本体;修①前被饱和掩蔽
//    =剥层探针摘内环 blown 73.7%→73.7% 不变的判谳面）。落刀=归位本体前槽专法
//    draw548CrystalInnerHalo（drawEnemy 本体 dispatch 之前）,NPC_GLOW[548] 退役。
//  ③【非病面·证伪记录】(a)内环 α 钉值 (1−n122a)∈[0.25,0.5] 与原版逐字同——
//    BJ546 K3「α≈1 四份全量拷贝」嫌疑证伪（值域锁见下）; (b)双绘锁：
//    npcWhiteLiftAlpha(548)=null（BJ510 白提亮复绘队列不含 548）、516 恒量支
//    不适用、behindTiles 主循环 continue 单绘（Main.cs:38802 专缓同构）;
//    (c)贴图 NPC_548.png=紫色系（148,118,230 族,白化非贴图病）;(d)光照调制面：
//    白日光照图饱和 (255,255,255) 原版同相（AddLight 1.3/0.5/1.5 白日下被
//    环境白光吞没）,且全屏乘光对「先加算后乘光」与原版「先乘光后加算」在
//    乘法分配律下等价——光照非本次白化根因。
//  判别力：核心笔退回纯加算（M1）→ ④红;内环挂回 NPC_GLOW/α 提到 1（M2/M3）→
//  ②/③红;削底系数 127 改值 → ④逐位断言红;删前槽专法 → ②红;核心 tint 漏乘
//  （169,142,204→[198,153,255]）→ ★BJ-C9 F1 tint 钉值红。
import { describe, it, expect, beforeAll } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { npcWhiteLiftAlpha } from '../src/render/npcExtraParts';

// Renderer 构造含 SkyRenderer（Image/document 消费）——BJ546 同款 Node 垫片
beforeAll(async () => {
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
});

type Rec = { comp: string; alpha: number; w: number; h: number; dx: number; dy: number; img?: unknown };

const makeCtxStub = (ops: Rec[]) => {
  let comp = 'source-over';
  let alpha = 1;
  return {
    save() { /* noop */ }, restore() { /* noop */ },
    translate() { /* noop */ }, rotate() { /* noop */ },
    set globalCompositeOperation(v: string) { comp = v; },
    get globalCompositeOperation() { return comp; },
    set globalAlpha(v: number) { alpha = v; },
    get globalAlpha() { return alpha; },
    drawImage(img: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
      dx: number, dy: number, w: number, h: number) {
      ops.push({ comp, alpha, w, h, dx, dy, img });
    },
  };
};

describe('BJ547①：内环 α 钉值（K3「α≈1」嫌疑证伪锁）', () => {
  it('n122a/n122b 值域钉死 [0.5,0.75] → 内环单拷贝 α=(1−n122a)∈[0.25,0.5],永不 ≈1', () => {
    for (let i = 0; i < 256; i++) {
      const w = Renderer.dd2CrystalGlowWaves(i / 8);
      expect(w.n122a).toBeGreaterThanOrEqual(0.5);
      expect(w.n122a).toBeLessThanOrEqual(0.75);
      expect(w.n122b).toBeGreaterThanOrEqual(0.5);
      expect(w.n122b).toBeLessThanOrEqual(0.75);
      expect(1 - w.n122a).toBeLessThanOrEqual(0.5);   // α 提到 >0.5（M3）→ 红
      expect(1 - w.n122a).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('内环 4 拷贝行为面（前槽专法）：恰 4 笔 lighter、α 同相 ∈[0.25,0.5]×Opacity、基数向 ±(2..3)px', () => {
    const ops: Rec[] = [];
    const ctx = makeCtxStub(ops);
    const host = { ctx };
    const r = new Renderer(null as never);
    const fn = (r as unknown as { draw548CrystalInnerHalo(...args: unknown[]): void })
      .draw548CrystalInnerHalo;
    expect(typeof fn).toBe('function');                          // 删专法（M2）→ 红
    const rect = { img: {}, sx: 0, sy: 0, sw: 58, sh: 44 };
    fn.call(host, { spawnAlpha: 0 }, rect, -29, -40, 1, false);
    expect(ops).toHaveLength(4);                                 // 拷贝数（M2）→ 红
    for (const o of ops) {
      expect(o.comp).toBe('lighter');                            // A=0 纯加算 idiom
      expect(o.alpha).toBeGreaterThan(0.24);
      expect(o.alpha).toBeLessThanOrEqual(0.5);                  // ×Opacity=1 值域
      expect(o.w).toBe(58); expect(o.h).toBe(44);                // 本体帧矩形载体
      // 基数向：i/4×2π → (±rad,0)/(0,±rad),rad=4×n122a ∈ [2,3]
      // （录制面=目标坐标 bx+off/bx+offy → 先减锚 (−29,−40)）
      const ax = Math.abs(o.dx + 29), ay = Math.abs(o.dy + 40);
      expect((ax < 1e-6) !== (ay < 1e-6)).toBe(true);            // 恰一轴非零
      expect(Math.max(ax, ay)).toBeGreaterThanOrEqual(2);
      expect(Math.max(ax, ay)).toBeLessThanOrEqual(3);
    }
    expect(new Set(ops.map((o) => o.alpha)).size).toBe(1);        // 同相位同 α
    // Opacity 链（败北渐隐）：同相位下 α 随 spawnAlpha=128 折 ×(1−128/255)
    const fullAlpha = ops[0]!.alpha;
    ops.length = 0;
    fn.call(host, { spawnAlpha: 128 }, rect, -29, -40, 1, false);
    expect(ops[0]!.alpha).toBeCloseTo(fullAlpha * (127 / 255), 9);
  });
});

describe('BJ547②：光柱核心笔 A=127 半削底+半加算（主凶定谳面）', () => {
  // ★BJ-C9 F1：tintedSprite stub 判别化（旧 stub 忽略 tint=盲区,R8 定谳面）——
  //  每 tint 一枚独立矩形 marker,ops 记 img 身份 → 核心笔 tint 钉值可断言。
  const TINT_MARKS = new Map<string, { c: { mark: string }; x: number; y: number; w: number; h: number }>();
  const tintedStub = (_k: string, _r: unknown, tint: number[]) => {
    const key = tint.join(',');
    if (!TINT_MARKS.has(key)) {
      TINT_MARKS.set(key, { c: { mark: key }, x: 0, y: 0, w: 72, h: 72 });
    }
    return TINT_MARKS.get(key)!;
  };
  const markOf = (o: Rec | undefined): string | undefined => {
    const m = (o?.img as { mark?: string } | undefined)?.mark;
    return m;
  };

  const runOverlays = (ops: Rec[]) => {
    const ctx = makeCtxStub(ops);
    const beamTex = { width: 72, height: 72 };
    const ringTex = { width: 96, height: 96 };   // Glow_239 原生 96×96（★BJ-C9 F1 环笔出图）
    const host = {
      ctx,
      atlas: {
        ensureVImage: (name: string) =>
          name === 'vanilla/Extra_89.png' ? beamTex
            : name === 'vanilla/Glow_239.png' ? ringTex : null,
      },
      tintedSprite: tintedStub,   // 环/柱/核心全部出图,按 tint 判别
    };
    const r = new Renderer(null as never);
    const fn = (r as unknown as { draw548CrystalOverlays(...args: unknown[]): void })
      .draw548CrystalOverlays;
    const e0 = { spawnAlpha: 0, ai1: 0, ai0: 0, h: 40, dontTakeDamageFromHostiles: false, visAngle: 0 };
    fn.call(host, e0, { img: {}, sx: 0, sy: 0, sw: 58, sh: 44 }, -29, -40, 1, true);
  };

  it('核心笔=两步式：destination-out(ga=127/255) → lighter(ga=1),同束矩形 108×108 收尾', () => {
    const ops: Rec[] = [];
    runOverlays(ops);
    expect(ops.length).toBeGreaterThanOrEqual(2);
    const tail = ops.slice(-2);
    expect(tail[0]!.comp).toBe('destination-out');               // M1 退回纯加算 → 红
    expect(tail[0]!.alpha).toBeCloseTo(127 / 255, 12);           // 削底系数改值 → 红（★BJ-C9 F1 128→127）
    expect(tail[1]!.comp).toBe('lighter');
    expect(tail[1]!.alpha).toBe(1);                              // RGB 全额（A 只承载削底）
    expect(tail[0]!.w).toBe(108); expect(tail[0]!.h).toBe(108);  // 72×1.5（scale=1）
    expect(tail[1]!.w).toBe(108); expect(tail[1]!.h).toBe(108);
    // 两步同矩形（同锚同缩放=逐像素 src.a 加权语义）
    expect(tail[0]!.dx).toBe(tail[1]!.dx);
    expect(tail[0]!.dy).toBe(tail[1]!.dy);
  });

  it('★BJ-C9 F1 核心笔 tint 钉值 = (169,142,204)（=Lerp((140,50,255,0)×0.6f,White,.5);漏乘变异→红）', () => {
    // 单源常数钉值：FNA Color.Lerp 四通道 (int) 截断 1:1（Main.cs:24348→:24349→:24366）
    expect(Renderer.BJ_C9_CORE_TINT).toEqual([169, 142, 204]);
    const ops: Rec[] = [];
    runOverlays(ops);
    const tail = ops.slice(-2);
    // 两步笔同用 [169,142,204] 烘焙矩形（tint 标记一致=单源）
    expect(markOf(tail[0])).toBe('169,142,204');                 // 旧 [198,153,255] 漏乘 → 红
    expect(markOf(tail[1])).toBe('169,142,204');
  });

  it('★BJ-C9 F1 环/光柱底笔 tint 恒 (140,50,255)（×0.6 折 ga=0.6 系,不随核心笔勘误漂移）', () => {
    const ops: Rec[] = [];
    runOverlays(ops);
    // 环 Glow_239 三笔 + 光柱首笔共 ≥4 笔同用 (140,50,255) 烘焙矩形
    const pens = ops.filter((o) => markOf(o)?.startsWith('140,50,255'));
    expect(pens.length).toBeGreaterThanOrEqual(4);
    // 首笔恒 α=0.6（×0.6f 折面在 α 不在 tint,判据面）
    expect(ops.some((o) => o.alpha === 0.6 && markOf(o)?.startsWith('140,50,255'))).toBe(true);
  });

  it('其余笔不受染：外环/环/首笔光柱恒纯加算（无 destination-out 混入）', () => {
    const ops: Rec[] = [];
    runOverlays(ops);
    const destOuts = ops.filter((o) => o.comp === 'destination-out');
    expect(destOuts).toHaveLength(1);                            // 唯一削底笔=核心
    const head = ops.slice(0, -2);
    for (const o of head) expect(o.comp).toBe('lighter');
    // 外环 4 笔 α=0.3×(1−n122b) ∈ [0.075,0.15]
    const aura = head.filter((o) => o.alpha > 0.01 && o.alpha < 0.2);
    expect(aura.length).toBeGreaterThanOrEqual(4);
  });
});

describe('BJ547③：单绘锁 + 前槽层序锁', () => {
  it('白提亮复绘队列不含 548（BJ510 二次复绘排查面）', () => {
    expect(npcWhiteLiftAlpha(548)).toBeNull();                   // 误收 → 红
    expect(npcWhiteLiftAlpha(516)).toBeNull();
  });

  it('NPC_GLOW[548] 表项退役（挂回本体后槽=变异必红）', () => {
    const G = (Renderer as unknown as { NPC_GLOW: Record<number, unknown> }).NPC_GLOW;
    expect(G[548]).toBeUndefined();
  });
});
