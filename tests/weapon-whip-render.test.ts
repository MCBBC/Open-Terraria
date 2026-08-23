// 鞭渲染回归（2026-08-23，标杆 Terarria1457/Terraria/Main.cs:36656-37670 DrawWhip 族）：
//  ① 鞭身渔线段数（:36732-36756）：num = 控制点数-1（=segments）,1028-1035 flag →
//    末段少画 1 节（:36734-36736）,1035 flag2=false 整条不画（:36726/:36738）
//  ② 鞭身 per-whip 线色表抽查（:36669-36729）
//  ③ 鞭尖分发表（switch :36759-36815 → WHIP_TIPS 全 18 条,16 个专署函数）
//  ④ 鞭尖竖向帧切片（记录型 ctx 捕获 drawImage 源/宿矩形;Frame(cols,rows) :36822 后
//    Height-=2 :36824、origin=Size/2 :36825、部分档 origin.Y-4）
// 手法：记录型 ctx 桩（weapon-summon-fix 同款）+ setProjSpriteOverride 假贴图直调
//  WhipProj.draw。彩色档（A<255/非白）走 tintedTex 需 2D 画布——文件顶部装最小
//  document 替身（createElement→假 canvas）让染色管线在 node 下照跑,染色产物 =
//  假 canvas 实例,可按引用与源贴图区分。
import { describe, expect, it } from 'vitest';
import {
  WhipProj, WHIP_LINE_COLORS, WHIP_TIPS, whipLineSegmentCount,
  type WhipTipCtx,
} from '../src/entities/WhipProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { WHIP_SEGMENTS } from '../src/entities/WhipTag';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

// ---- 最小 document 替身（仅 tintedTex 的 createElement/getContext 消费面） ----
const fake2dCtx = {
  drawImage() {}, fillRect() {},
  set globalCompositeOperation(_: string) {},
  set fillStyle(_: string) {},
  set imageSmoothingEnabled(_: boolean) {},
};
class FakeCanvas {
  width = 0; height = 0;
  getContext(): typeof fake2dCtx { return fake2dCtx; }
}
(globalThis as { document?: unknown }).document = {
  createElement: (): FakeCanvas => new FakeCanvas(),
};
const isFakeCanvas = (t: unknown): boolean => t instanceof FakeCanvas;

/** 假贴图（只承载 width/height——记录型 ctx 不真画） */
const fakeTex = (w: number, h: number): HTMLImageElement =>
  ({ width: w, height: h }) as unknown as HTMLImageElement;

interface DrawCall {
  tex: unknown; sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number; comp: string; alpha: number;
}

/** 记录型 ctx 桩：捕获 9 参 drawImage + composite/alpha/flip/stroke */
function recordingCtx() {
  const calls: DrawCall[] = [];
  const flips: number[][] = [];
  let comp = 'source-over';
  let alpha = 1;
  let stroked = 0;
  const stack: Array<{ comp: string; alpha: number }> = [];   // 真 ctx 的状态栈语义
  const ctx = {
    save() { stack.push({ comp, alpha }); },
    restore() { const s = stack.pop(); if (s) { comp = s.comp; alpha = s.alpha; } },
    translate() {}, rotate() {},
    scale(x: number, y: number) { flips.push([x, y]); },
    set imageSmoothingEnabled(_: boolean) {},
    set globalCompositeOperation(v: string) { comp = v; },
    get globalCompositeOperation() { return comp; },
    set globalAlpha(v: number) { alpha = v; },
    get globalAlpha() { return alpha; },
    drawImage(tex: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number, dw: number, dh: number) {
      calls.push({ tex, sx, sy, sw, sh, dx, dy, dw, dh, comp, alpha });
    },
    set strokeStyle(_: string) {}, set lineWidth(_: number) {},
    beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { stroked++; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, flips, stroked: () => stroked };
}

/** Renderer 壳：r.ctx = 记录型 ctx;atlas 只供 FishingLine/Glow_358 */
function makeRenderer(lineTex: HTMLImageElement | null, glowTex: HTMLImageElement | null) {
  const rec = recordingCtx();
  return {
    rec,
    // Renderer 形状：r.ctx 直达画布上下文
    ctx: rec.ctx,
    atlas: {
      ensureVImage: (f: string) =>
        f === 'vanilla/FishingLine.png' ? lineTex : f === 'vanilla/Glow_358.png' ? glowTex : null,
    },
  };
}

function mkWhip(projId: number, itemId: number, player: Player): WhipProj {
  // anim=30 → timeToFlyOut = 30×MaxUpdates;不跑 fixedUpdate → ai0=0 → prog=0（帧档/缩放确定）
  return new WhipProj(player.cx, player.cy, 0, projId, itemId, 14, 1, 30, 4, () => player);
}

const player = new Player(60 * 16, 90 * 16, new Inventory());

// ============ ① 鞭身线体段数（:36732-36756） ============
describe('鞭身渔线段数（:36732-36756,1028-1035 末段缩短/1035 不画）', () => {
  // 段数 = GetWhipSettings segments（WHIP_SEGMENTS 缺省 20）;flag（1028-1035）再 -1
  const CASES: Array<[projId: number, want: number]> = [
    [841, 20],   // 缺省 20、非 flag → 20（:36733 num = list.Count-1）
    [847, 20], [848, 40], [849, 30], [912, 20], [913, 20], [914, 20],
    [915, 40], [952, 20],
    [1028, 11],  // segments 12,flag → 11（:36734-36736 末段缩短 1 节）
    [1029, 19], [1030, 19], [1031, 19], [1032, 19], [1033, 44], [1034, 19],
    [1035, 0],   // flag2=false 整条不画（:36726/:36738）
    [1104, 36],  // segments 36,1104 不置 flag（:36728-36729 仅色）→ 36
  ];
  for (const [projId, want] of CASES) {
    it(`proj ${projId}：segments ${WHIP_SEGMENTS[projId] ?? 20} → 线体 ${want} 段`, () => {
      const segs = WHIP_SEGMENTS[projId] ?? 20;
      expect(whipLineSegmentCount(projId, segs)).toBe(want);
    });
  }

  it('记录型 ctx 实画计数：841=20 段 / 915=40 段 / 1035=0 段（白线直画档 :36755）', () => {
    const lineTex = fakeTex(12, 12);
    for (const [projId, want] of [[841, 20], [915, 40], [1035, 0]] as const) {
      const r = makeRenderer(lineTex, null);
      setProjSpriteOverride(projId, fakeTex(22, 140));
      mkWhip(projId, 4672, player).draw(r as never);
      const lineDraws = r.rec.calls.filter((c) => c.tex === lineTex);
      expect(lineDraws.length, `proj ${projId}`).toBe(want);
    }
  });

  it('鞭身段宿矩形 = origin(W/2,2)、宿高 = 段长+2（:36662/:36746）', () => {
    const lineTex = fakeTex(12, 12);
    const r = makeRenderer(lineTex, null);
    setProjSpriteOverride(841, fakeTex(10, 140));
    mkWhip(841, 4672, player).draw(r as never);
    const lineDraws = r.rec.calls.filter((c) => c.tex === lineTex);
    expect(lineDraws.length).toBe(20);
    for (const c of lineDraws) {
      expect(c.sx).toBe(0); expect(c.sy).toBe(0);          // value.Frame() 整图 :36661
      expect(c.sw).toBe(12); expect(c.sh).toBe(12);
      expect(c.dx).toBe(-6);                               // origin.X = W/2 :36662
      expect(c.dy).toBeCloseTo(-2 * (2 / 12), 5);          // 左上 = −origin×scale = −2×(2/12) :36662/:36746
      expect(c.dw).toBe(12);                               // scale.X = 1 :36746
      expect(c.dh).toBeCloseTo(2, 5);                      // ai0=0 → 段长 0 → (0+2)/12×12 :36746
    }
  });

  it('1104 染色档（A=127 中间档）→ 线体 36×2 + 鞭尖 13×2 笔（黑形 + 摊平染色 lighter）', () => {
    const lineTex = fakeTex(12, 12);
    const r = makeRenderer(lineTex, null);
    setProjSpriteOverride(1104, fakeTex(14, 140));
    mkWhip(1104, 5688, player).draw(r as never);
    const tinted = r.rec.calls.filter((c) => isFakeCanvas(c.tex));
    // 线体 36 段（:36751-36753 ×0.5 → A=127）+ 鞭尖 13 笔（Lighting×0.5 :36858 →
    //  i=0/3..33/35 = 13）——中间档各两笔
    expect(tinted.length).toBe(98);
    const dark = tinted.filter((c) => c.comp === 'source-over');
    const add = tinted.filter((c) => c.comp === 'lighter');
    expect(dark.length).toBe(49);
    expect(add.length).toBe(49);
    expect(dark[0]!.alpha).toBeCloseTo(127 / 255, 5);      // color2 = (78,136,255,255)×0.5
  });
  it('847 橙红染色线体（A=255 保形档）→ 20 段 × 单笔 source-over', () => {
    const lineTex = fakeTex(12, 12);
    const r = makeRenderer(lineTex, null);
    setProjSpriteOverride(847, fakeTex(22, 140));
    mkWhip(847, 4678, player).draw(r as never);
    const tinted = r.rec.calls.filter((c) => isFakeCanvas(c.tex));
    expect(tinted.length).toBe(20);                        // 20 段 × 1（保形染色直画）
    for (const c of tinted) expect(c.comp).toBe('source-over');
  });
});

// ============ ② 鞭身线色表抽查（:36669-36729） ============
describe('鞭身 per-whip 线色表抽查（:36669-36729）', () => {
  it('具名色/直构色逐条对齐 1457 switch', () => {
    expect(WHIP_LINE_COLORS[847]).toEqual([255, 69, 0, 255]);     // OrangeRed :36669-36670
    expect(WHIP_LINE_COLORS[849]).toEqual([0, 0, 0, 255]);        // SlateBlue→Black 死赋值 :36672-36674
    expect(WHIP_LINE_COLORS[848]).toEqual([0, 0, 139, 255]);      // DarkBlue :36676-36677
    expect(WHIP_LINE_COLORS[912]).toEqual([173, 216, 230, 255]);  // LightBlue :36679-36680
    expect(WHIP_LINE_COLORS[913]).toEqual([178, 34, 34, 255]);    // Firebrick :36682-36683
    expect(WHIP_LINE_COLORS[914]).toEqual([34, 139, 34, 255]);    // ForestGreen :36685-36686
    expect(WHIP_LINE_COLORS[915]).toEqual([255, 255, 255, 255]);  // White :36688-36689
    expect(WHIP_LINE_COLORS[952]).toEqual([210, 180, 140, 255]);  // Tan :36691-36692
    expect(WHIP_LINE_COLORS[1028]).toEqual([128, 128, 128, 255]); // Gray :36694-36696
    expect(WHIP_LINE_COLORS[1029]).toEqual([128, 0, 128, 255]);   // Purple :36698-36700
    expect(WHIP_LINE_COLORS[1030]).toEqual([255, 0, 0, 255]);     // Red :36702-36704
    expect(WHIP_LINE_COLORS[1031]).toEqual([88, 85, 155, 255]);   // :36706-36708
    expect(WHIP_LINE_COLORS[1032]).toEqual([143, 215, 29, 255]);  // :36710-36712
    expect(WHIP_LINE_COLORS[1033]).toEqual([0, 0, 255, 255]);     // Blue :36714-36716
    expect(WHIP_LINE_COLORS[1035]).toEqual([0, 255, 0, 255]);     // Lime :36723-36725
    expect(WHIP_LINE_COLORS[1104]).toEqual([78, 136, 255, 255]);  // :36728-36729（画时 ×0.5 :36751-36753）
  });
  it('1034 = hslToRgb(0.6,1,0.5,20)×0.6 = (0,61,153,12)（:36720,Color*float 截断）', () => {
    // hslToRgb(0.6,1,0.5) = (0,102,255)（Main.cs:48689 hue2rgb）,×0.6 逐通道截断
    expect(WHIP_LINE_COLORS[1034]).toEqual([0, 61, 153, 12]);
  });
  it('表外鞭缺省 White（:36663）——841 无表项', () => {
    expect(WHIP_LINE_COLORS[841]).toBeUndefined();
    expect(WHIP_LINE_COLORS[9999]).toBeUndefined();
  });
});

// ============ ③ 鞭尖分发表（switch :36759-36815） ============
describe('鞭尖分发表（:36759-36815 全 18 条 → 16 个专署函数）', () => {
  const IDS = [841, 847, 848, 849, 912, 913, 914, 915, 952,
    1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1104] as const;
  it('18 条鞭 proj 全部入表且为函数', () => {
    for (const id of IDS) expect(typeof WHIP_TIPS[id], `proj ${id}`).toBe('function');
    expect(Object.keys(WHIP_TIPS).length).toBe(18);
  });
  it('同体档共享函数：913≡912（FireWhip≡CoolWhip :37302-37351）、1029≡1030（Generic 0.5 档）', () => {
    expect(WHIP_TIPS[913]).toBe(WHIP_TIPS[912]);
    expect(WHIP_TIPS[1029]).toBe(WHIP_TIPS[1030]);
  });
  it('专署档不共享：847/848/849/841 四函数互异', () => {
    const set = new Set([WHIP_TIPS[847], WHIP_TIPS[848], WHIP_TIPS[849], WHIP_TIPS[841]]);
    expect(set.size).toBe(4);
  });
  it('分发表覆盖 WHIP_SEGMENTS 鞭全集（无缺漏）', () => {
    for (const id of Object.keys(WHIP_SEGMENTS).map(Number)) {
      expect(WHIP_TIPS[id], `proj ${id}`).toBeTypeOf('function');
    }
  });
});

// ============ ④ 鞭尖竖向帧切片（记录型 ctx） ============
describe('鞭尖帧切片（Frame(cols,rows) 后 Height-=2、origin=Size/2）', () => {
  it('912 酷鞭：帧档 10 笔;i=0 → Y-4、i=19 → row4（:37263-37286）', () => {
    const tex = fakeTex(22, 130);                       // 5 帧 × 26,Height-=2 → 24
    const r = makeRenderer(null, null);
    setProjSpriteOverride(912, tex);
    mkWhip(912, 4911, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(10);                      // {0,3,5,7,9,11,13,15,17,19}
    const head = draws.find((c) => c.sy === 0)!;        // i==0 → row0
    expect(head.dy).toBe(-8);                           // origin.Y = 24/2-4 = 8
    expect(head.dx).toBe(-11);                          // origin.X = 22/2
    const tail = draws.find((c) => c.sy === 4 * 26)!;   // i==19 → row4 :37282
    expect(tail!.dy).toBe(-12);                         // origin.Y = 12（无 -4 档）
    for (const c of draws) { expect(c.sh).toBe(24); expect(c.dw).toBe(22); }
  });

  it('952 骨鞭：20 段全画,行集 {0,1,2,3,4}、首段 Y-4（:37226-37236）', () => {
    const tex = fakeTex(20, 150);                       // 5 帧 × 30,sh=28
    const r = makeRenderer(null, null);
    setProjSpriteOverride(952, tex);
    mkWhip(952, 5074, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(20);
    const rows = new Set(draws.map((c) => c.sy / 30));
    expect(rows).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(draws[0]!.dy).toBe(-10);                     // sh/2-4 = 10
  });

  it('848 晨星鞭：偶数段 20 笔,尾段 row4 + prog=0 → scale 0.5（:37534-37542）', () => {
    const tex = fakeTex(14, 140);                       // 5 帧 × 28,sh=26
    const r = makeRenderer(null, null);
    setProjSpriteOverride(848, tex);
    mkWhip(848, 4679, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(21);                      // i=0 + 偶数 2..38（19）+ 尾段 39
    const tail = draws.find((c) => c.sy === 4 * 28)!;   // 尾段 row4 :37537
    expect(tail).toBeTruthy();
    expect(tail!.dw).toBeCloseTo(7, 5);                 // scale = lerp(0.5,2,0) = 0.5 :37542
    expect(tail!.dh).toBeCloseTo(13, 5);
  });

  it('1035 月主鞭：Frame(4,7) 列 0 → sw18/sh28,30 笔,尾帧行 = 4+(lai1-1)（:37067）', () => {
    const tex = fakeTex(72, 210);                       // 4 列 × 7 行,帧 18×30,sh=28
    const r = makeRenderer(null, null);
    setProjSpriteOverride(1035, tex);
    mkWhip(1035, 5480, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(30);                      // segments 30 → 30 段全画
    for (const c of draws) { expect(c.sw).toBe(18); expect(c.sh).toBe(28); }
    const tails = draws.filter((c) => c.sy === 120 || c.sy === 150 || c.sy === 180);
    expect(tails.length).toBe(1);                       // 尾段恰一笔,row 4..6
    expect(tails[0]!.dh).toBeCloseTo(35, 5);            // scale.Y = 1.25 :37091
  });

  it('1033 电鳗鞭：i==0 跳笔 → 44 笔 + GlowMask[358] 同矩形加色（:37205-37207）', () => {
    const tex = fakeTex(22, 120);                       // 5 帧 × 24,sh=22
    const glow = fakeTex(22, 120);
    const r = makeRenderer(null, glow);
    setProjSpriteOverride(1033, tex);
    mkWhip(1033, 5478, player).draw(r as never);
    const body = r.rec.calls.filter((c) => c.tex === tex);
    const glowDraws = r.rec.calls.filter((c) => isFakeCanvas(c.tex));  // 染色产物 canvas
    expect(body.length).toBe(44);                       // n=45,i==0 跳笔 :37178-37179
    expect(glowDraws.length).toBe(44);                  // 逐段同矩形辉光 :37207
    for (const c of glowDraws) expect(c.comp).toBe('lighter');  // A=0 → 纯加色
    expect(glowDraws[0]!.dh).toBeCloseTo(body[0]!.dh, 5);
  });

  it('841 皮鞭：20 段全画 + spriteDirection==1 水平翻转（:37619-37622）', () => {
    const tex = fakeTex(10, 140);
    const r = makeRenderer(null, null);
    setProjSpriteOverride(841, tex);
    mkWhip(841, 4672, player).draw(r as never);         // ang=0 → dir=+1
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(20);
    expect(r.rec.flips.length).toBe(20);                // 逐段 scale(-1,1)
    expect(r.rec.flips[0]).toEqual([-1, 1]);
  });

  it('1028 麻线鞭：跳 i==1 → 11 笔,尾段 row5（segmentCount 6,:36897-36899）', () => {
    const tex = fakeTex(24, 168);                       // 6 帧 × 28,sh=26
    const r = makeRenderer(null, null);
    setProjSpriteOverride(1028, tex);
    mkWhip(1028, 5473, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(11);                      // n=12,i==1 continue :36882
    expect(draws.some((c) => c.sy === 5 * 28)).toBe(true);  // 尾段 row = segmentCount-1
  });

  it('1031 星陨鞭：i%3 门 → 8 笔（i=0/3/6/9/12/15/18/19,:37137-37139）', () => {
    const tex = fakeTex(18, 144);                       // 6 帧 × 24,sh=22
    const r = makeRenderer(null, null);
    setProjSpriteOverride(1031, tex);
    mkWhip(1031, 5476, player).draw(r as never);
    const draws = r.rec.calls.filter((c) => c.tex === tex);
    expect(draws.length).toBe(8);                       // i=0 + i%3==0 中段 6 + 尾段 19
  });
});

// ============ 兜底与 WhipTipCtx 形状 ============
describe('渲染兜底与 WhipTipCtx 注入', () => {
  it('鞭贴图未就绪 → 折线兜底（stroke 恰一次）', () => {
    const r = makeRenderer(null, null);                 // 914 未 override → img=null、无 atlas → 线缺
    mkWhip(914, 5475, player).draw({ ctx: r.ctx } as never);
    expect(r.rec.stroked()).toBe(1);
  });

  it(' WhipTipCtx 直调分发表：返回末控制点、dir=-1 不翻转（:37622 flip 门）', () => {
    const rec = recordingCtx();
    const tex = fakeTex(20, 150);
    const c: WhipTipCtx = {
      ctx: rec.ctx, tex, glow: null,
      pts: Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0 })),
      n: 20, prog: 0.5, dir: -1, lai1: 0, hue: 0.25, opacity: 1,
    };
    const tip = WHIP_TIPS[952]!(c);
    expect(tip).toEqual({ x: 190, y: 0 });              // 返回末控制点（:37249 vector2）
    expect(rec.calls.length).toBe(20);                  // 20 段全画
    expect(rec.flips.length).toBe(0);                   // dir=-1 → spriteEffects None
    // prog=0.5 → 848 尾段包络 = GetLerpValue(0.1,0.7,.5)×GetLerpValue(0.9,0.7,.5) = 2/3
    const tex848 = fakeTex(14, 140);
    const rec2 = recordingCtx();
    WHIP_TIPS[848]!({ ...c, tex: tex848, n: 40,
      pts: Array.from({ length: 41 }, (_, i) => ({ x: i * 10, y: 0 })) });
    void rec2;
    const env = ((0.5 - 0.1) / 0.6) * 1;
    const rec3 = recordingCtx();
    WHIP_TIPS[848]!({ ctx: rec3.ctx, tex: tex848, glow: null, dir: -1, lai1: 0, hue: 0, opacity: 1,
      prog: 0.5, n: 40, pts: Array.from({ length: 41 }, (_, i) => ({ x: i * 10, y: 0 })) });
    const tail = rec3.calls.filter((x) => x.sy === 4 * 28)[0]!;
    expect(tail.dw).toBeCloseTo(14 * (0.5 + 1.5 * env), 5);  // lerp(0.5,2,2/3) = 1.5 → dw 21
  });
});
