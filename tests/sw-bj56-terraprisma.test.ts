// ★SW-BJ56 2026-09-10（用户实报：泰拉棱镜「召唤只有一把 + 没有光效」）
// 定谳：
//  · 数量面 = 原版 1:1 无偏差（实机矩阵探针 scripts/_bj56-terraprisma-count.mjs 11/11 绿）：
//    一次召唤 1 把（Player.cs:49049 SpawnMinionOnCursor 专支）、槽满再召=腾位替换
//    （FreeUpPetsAndMinions Player.cs:52335-52458 + MinionSacrificable[946]=true
//    ProjectileID.cs:401）、超限自裁（Projectile.cs:16816-16841）、按住 autoReuse 连召补满。
//  · 光效面 = 三处整缺（本批补齐）：
//    D1 946 专绘整缺 → MinionProj.draw 新支（Main.cs:28677-28692 派发 + DrawProj_EmpressBlade
//       :36562-36601 全层：幻影×6/环晕×4/本体 A×0.7/女皇色罩,rot−π/2,色相循环 num22）
//    D2 EmpressBladeDrawer 拖尾整缺 → tHist 历史环（TrailingMode[946]=2,ProjectileID.cs:385,
//       Projectile.cs:17237-17246）+ buildEmpressTrailPts（EmpressBladeDrawer.cs:16-42）+
//       queueTrailShade 全亮通道;EXTRA_SETS.EmpressBlade.ssd 误值 [4,0,0,4]→[1,0,0,0.6]
//       （EmpressBladeDrawer.cs:18-26）
//    D3 本体不读格光（:36576-36577 硬编码 White×Opacity）→ Renderer.SELF_LUMINOUS_PROJS
//       946 条目（floor 1 / whiten）
//  · shader 假设回应：原版「EmpressBlade」确为 XNA misc shader（FinalFractalVertex 技术,
//    DyeInitializer.cs:478-480,.cso 编译产物）——但本仓 SM2Effect/obj58 codegen 已逐字节
//    忠实移植该技术（TrailShader.ts tech 路径,天顶剑同管线已金标）;数量面与光照面均不依赖
//    .cso。946 世界光照 = AI_156_BatOfLight 经 CastLightOpen 施光,而 v3_1=Transparent(0,0,0)
//    （Projectile.cs:52463-52465 + DelegateMethods.cs:729-747）= 原版本就零世界光。
// 跑法：npx vitest run tests/sw-bj56-terraprisma.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MinionProj, buildEmpressTrailPts, empressHuePhase, fairyHueRgb } from '../src/entities/MinionProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MINION_SACRIFICABLE } from '../src/core/Game';
import combatJson from '../src/data/vanilla-itemcombat.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
const TRAIL_TS = readFileSync(join(ROOT, 'src/fx/TrailShader.ts'), 'utf8');
const RENDERER_TS = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

// =====================================================================
// ① fairyHueRgb：Main.hslToRgb(h,1,0.5) 独立参照复算（Main.cs:48689-48734）
// =====================================================================
function refHsl(hue: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    if (c < 0) c++;
    if (c > 1) c--;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  const q = 0.5 + 1 - 0.5 * 1;   // l + s − l·s
  const p = 2 * 0.5 - q;         // 2l − q
  return [
    Math.round(hue2rgb(hue + 1 / 3, p, q) * 255) / 255,
    Math.round(hue2rgb(hue, p, q) * 255) / 255,
    Math.round(hue2rgb(hue - 1 / 3, p, q) * 255) / 255,
  ];
}

describe('SW-BJ56 ①女皇色相（Main.hslToRgb 移植,GetFairyQueenWeaponsColorFull Projectile.cs:22062）', () => {
  it('锚点：h=0→红 / 1/3→绿 / 2/3→蓝（s=1,l=0.5 全饱和）', () => {
    expect(fairyHueRgb(0)).toEqual([1, 0, 0]);
    expect(fairyHueRgb(1 / 3).map((v) => Math.round(v * 255))).toEqual([0, 255, 0]);
    expect(fairyHueRgb(2 / 3).map((v) => Math.round(v * 255))).toEqual([0, 0, 255]);
  });
  it('72 相位全样本与独立参照逐通道全等（变异面：公式任何一支错即红）', () => {
    for (let i = 0; i < 72; i++) {
      const h = i / 72;
      expect(fairyHueRgb(h), `h=${h}`).toEqual(refHsl(h));
    }
  });
});

// =====================================================================
// ② 色相相位 num22（Main.cs:28680-28682）
// =====================================================================
describe('SW-BJ56 ②色相相位（IndexForVisuals%max(1,maxMinions)/max + GTW%3/3）', () => {
  it('maxMinions 下限 1（MathHelper.Max(1f, maxMinions)）；单剑相位=纯时间循环', () => {
    expect(empressHuePhase(7, 0, 0)).toBe(0);
    expect(empressHuePhase(7, 1, 1.5)).toBeCloseTo(0.5, 10);
  });
  it('多剑分相位：max=3 → id 0/1/2 = 0/1/3/2/3 + 时间循环（3s 一轮回卷）', () => {
    expect(empressHuePhase(0, 3, 0)).toBe(0);
    expect(empressHuePhase(1, 3, 0)).toBeCloseTo(1 / 3, 10);
    expect(empressHuePhase(2, 3, 0)).toBeCloseTo(2 / 3, 10);
    expect(empressHuePhase(3, 3, 0)).toBe(0);            // id%max 回卷
    expect(empressHuePhase(0, 3, 1.5)).toBeCloseTo(0.5, 10);  // 1.5s → 半相位
    expect(empressHuePhase(0, 3, 3)).toBe(0);            // GlobalTime%3 回卷（:28680）
  });
});

// =====================================================================
// ③ EmpressBladeDrawer 条带色列（EmpressBladeDrawer.cs:16-42）
// =====================================================================
describe('SW-BJ56 ③拖尾顶点色列（StripColors/StripWidth/expectedPairs）', () => {
  const ring = (n: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(1000 + i, 2000 + i, 0.5 * i);   // [x,y,rot] 新→旧
    return out;
  };
  it('hw=36（StripWidth=36=VertexStrip 半宽）且 x/y/rot 直通（oldPos[0]=最新）', () => {
    const pts = buildEmpressTrailPts(ring(10), 0.25);
    expect(pts).toHaveLength(10);
    expect(pts[0].hw).toBe(36);
    expect(pts[0].x).toBe(1000);
    expect(pts[0].rot).toBe(0);
    expect(pts[9].x).toBe(1009);
    expect(pts[9].rot).toBe(4.5);
  });
  it('p=0 端=ColorStart（g1=g2=0）、a=0.5（A/=2 语义）;p≥0.7 → Lerp 到 ColorEnd×(1−g2);p≥0.98 → 淡出归零', () => {
    // ★SW-RB11a：pairs=TrailCacheLength[946]=20（ProjectileID.cs:387,旧 10 系把
    //   CreateIntSet 缺省当覆写值）→ progressOnStrip = i/19（VertexStrip.cs:57-58）。
    const pts = buildEmpressTrailPts(ring(20), 0.25);
    const start = pts[0], end = pts[14];       // p=14/19≈0.7368 ≥0.7 → g1=1;g2=(14/19)/0.98
    // ColorStart/ColorEnd 互为 +0.5 补色（Main.cs:28684-28685）
    expect(start.a).toBeCloseTo(0.5, 10);
    expect(start.g).toBeCloseTo(refHsl(((0.25 % 1) + 0.5) % 1)[1], 6);
    const fadeEnd = 1 - (14 / 19) / 0.98;
    expect(end.r).toBeCloseTo(refHsl((((0.25 + 0.5) % 1) + 0.5) % 1)[0] * fadeEnd, 6);
    expect(pts[19].r).toBe(0);                 // p=1 → fade=0
    expect(pts[19].a).toBe(0);
  });
  it('历史环上限 20（oldPos.Length=TrailCacheLength[946],SW-RB11a 订正）;progressOnStrip 恒 i/19（expectedPairs 与实际点数无关）', () => {
    const short = buildEmpressTrailPts(ring(3), 0.5);
    expect(short).toHaveLength(3);
    expect(short[2].x).toBe(1002);             // 仍按环序,不重摊 p
    const mid = buildEmpressTrailPts(ring(17), 0.5);
    expect(mid).toHaveLength(17);              // 未满环=不截断（VertexStrip :55 零位停）
    const over = buildEmpressTrailPts(ring(25), 0.5);
    expect(over).toHaveLength(20);             // 多余旧点截断
  });
});

// =====================================================================
// ④ 946 专绘行为锁（记录型 ctx,DrawProj_EmpressBlade Main.cs:36562-36601 折算）
// =====================================================================
function fakeTex(w: number, h: number): HTMLImageElement {
  return ({ width: w, height: h }) as unknown as HTMLImageElement;
}
function recordingCtx() {
  const draws: Array<{ tex: unknown; args: number[]; alpha: number }> = [];
  const translates: number[][] = [];
  const rots: number[] = [];
  const scales: number[][] = [];
  let alpha = 1;
  const stack: number[] = [];
  const ctx = {
    save() { stack.push(alpha); },
    restore() { alpha = stack.pop() ?? 1; },
    translate(x: number, y: number) { translates.push([x, y]); },
    rotate(a: number) { rots.push(a); },
    scale(x: number, y: number) { scales.push([x, y]); },
    set imageSmoothingEnabled(_: boolean) {},
    set globalAlpha(v: number) { alpha = v; },
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    fillRect() {}, strokeRect() {}, clearRect() {},
    set globalCompositeOperation(_: string) {},
    get globalCompositeOperation() { return 'source-over'; },
    drawImage(tex: unknown, ...rest: number[]) { draws.push({ tex, args: rest, alpha }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws, translates, rots, scales };
}

describe('SW-BJ56 ④946 专绘行为锁（幻影×6+环晕×4+本体+色罩,rot−π/2,拖尾入队）', () => {
  // 文档 shim：tintFrameHue 懒建 scratch（染层路径可达）
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        clearRect() {}, drawImage() {}, fillRect() {},
        set globalCompositeOperation(_: string) {},
        set fillStyle(_: string) {},
      }),
    }),
  };

  function mk946(rot: number): { m: MinionProj; player: Player; queue: unknown[] } {
    setProjSpriteOverride(946, fakeTex(56, 56));
    const player = new Player(60 * 16, 90 * 16, new Inventory());
    const m = new MinionProj(player.cx - 3, player.cy - 3, 946, 10, 2, false, 0, false, () => player);
    (m as { alphaFade: number }).alphaFade = 0;
    m.rot = rot;
    // tHist 历史环 20 拍（TrailingMode=2 满环,TrailCacheLength[946]=20 SW-RB11a）：静止在盒心
    const hist: number[] = [];
    for (let i = 0; i < 20; i++) hist.push(m.cx, m.cy, rot);
    (m as unknown as { tHist: number[] }).tHist = hist;
    const queue: unknown[] = [];
    return { m, player, queue };
  }

  it('跃空段窗（ai0=65,num3=(70−ai0)/20>0）：幻影 6 + 环晕 4 + 本体 1 + 色罩 1 = 12 次 drawImage；旋转全= rot−π/2', () => {
    const rot = 0.7;
    const { m, player, queue } = mk946(rot);
    (m as unknown as { tA0: number }).tA0 = 65;               // 跃空段中段：num3=0.25
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx, queueTrailShade: (sp: unknown) => queue.push(sp) } as never);
    expect(rec.draws).toHaveLength(12);                       // :36578-36600 层账
    expect(rec.rots.every((a) => Math.abs(a - (rot - Math.PI / 2)) < 1e-9)).toBe(true);
    // 本体 A×0.7（:36576-36577）+ 色罩 ×num2×0.5（:36600 = 63/255×0.3×0.5）
    // + 幻影（63/255×0.3×(1−f)×num3,f=0 层 = 63/255×0.075）、环晕 = 63/255×0.3（无 num3 因子）
    const alphas = rec.draws.map((d) => d.alpha);
    expect(alphas).toContain(0.7);
    const overlayA = (63 / 255) * 0.3 * 0.5;
    expect(alphas.filter((a) => Math.abs(a - overlayA) < 1e-9)).toHaveLength(1);
    const haloA = (63 / 255) * 0.3;
    expect(alphas.filter((a) => Math.abs(a - haloA) < 1e-9)).toHaveLength(4);   // 环晕×4（无 num3 因子）
    const num3 = (70 - 65) / 20;
    const after0 = (63 / 255) * 0.3 * num3;                                     // 幻影 f=0 层
    expect(alphas.filter((a) => Math.abs(a - after0) < 1e-9)).toHaveLength(1);
    // scale 0.75 只在本体（:36575 proj.scale）
    expect(rec.scales).toEqual([[0.75, 0.75]]);
    // 拖尾入队（EmpressBladeDrawer :16-33）
    expect(queue).toHaveLength(1);
    const spec = queue[0] as { set: string; expectedPairs: number; pts: Array<{ hw: number; a: number }> };
    expect(spec.set).toBe('EmpressBlade');
    expect(spec.expectedPairs).toBe(20);       // SW-RB11a：TrailCacheLength[946]=20
    expect(spec.pts).toHaveLength(20);
    expect(spec.pts[0].hw).toBe(36);
  });

  it('跃空段窗幻影几何：lerpValue=GetLerpValue(60,50,65)=0 → 6 层全叠盒心；环晕 f5=0 偏移 (num 向)×3', () => {
    const rot = 0.7;
    const { m, player, queue } = mk946(rot);
    (m as unknown as { tA0: number }).tA0 = 65;
    void queue;
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx, queueTrailShade: () => {} } as never);
    void player;
    const num = rot - Math.PI / 2;
    // ai0=65 > from=60 → lerpValue=0（Utils.cs:315 clamped 分支）：−120×f×0 = 全层 [cx,cy]
    expect(rec.translates[0]).toEqual([m.cx, m.cy]);
    expect(rec.translates[5]).toEqual([m.cx, m.cy]);
    // 环晕 f5=0（translate 流位 6）：偏移 = (f5×2π+num) 向 ×4×0.75
    const tHalo0 = rec.translates[6];
    expect(tHalo0[0]).toBeCloseTo(m.cx + Math.cos(num) * 3, 6);
    expect(tHalo0[1]).toBeCloseTo(m.cy + Math.sin(num) * 3, 6);
  });

  it('待机（ai0=0）：num3=0 → 幻影 6 层 alpha=0 无贡献;环晕×4 恒可见——层账 12（原版同相）', () => {
    const { m, player } = mk946(0.7);
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx, queueTrailShade: () => {} } as never);
    void player;
    expect(rec.draws).toHaveLength(12);
    const alphas = rec.draws.map((d) => d.alpha);
    expect(alphas.filter((a) => a === 0)).toHaveLength(6);        // 幻影 num3=0（:36586 色乘 0）
    const haloA = (63 / 255) * 0.3;
    expect(alphas.filter((a) => Math.abs(a - haloA) < 1e-9)).toHaveLength(4);   // 环晕恒可见
  });

  it('跃空段起手（ai0=80）num3=0：幻影 6 层 alpha=0、环晕×4 恒可见——层账 12（原版同相）', () => {
    const { m, player } = mk946(0.7);
    (m as unknown as { tA0: number }).tA0 = 80;               // 起手跃空段
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx, queueTrailShade: () => {} } as never);
    void player;
    expect(rec.draws).toHaveLength(12);
    const alphas = rec.draws.map((d) => d.alpha);
    expect(alphas.filter((a) => a === 0)).toHaveLength(6);    // 幻影色乘 num3=0（:36586）
  });
});

// =====================================================================
// ⑤ 数量/腾位/光照数据面（ProjectileID.cs:401 + SetDefaults :8924-8941）
// =====================================================================
describe('SW-BJ56 ⑤数量与光照链数据面', () => {
  const combat = combatJson as Record<string, { summon?: boolean; shoot?: number; autoReuse?: boolean; reuseDelay?: number }>;
  it('item 5005：summon+shoot 946+autoReuse（Item.cs:40279-40296）', () => {
    const it5 = combat['5005'];
    expect(it5?.summon).toBe(true);
    expect(it5?.shoot).toBe(946);
    expect(it5?.autoReuse).toBe(true);
  });
  it('946 ∈ MinionSacrificable（ProjectileID.cs:401——腾位链 FreeUpPetsAndMinions :52359 前门）', () => {
    expect(MINION_SACRIFICABLE.has(946)).toBe(true);
  });
  it('结构锁：tHist 历史环压栈/上限、wrapper 调 AI（TrailingMode=2 :17237-17246）', () => {
    expect(MINION_TS).toContain('this.tHist.unshift(this.cx, this.cy, this.rot)');
    expect(MINION_TS).toContain('if (this.tHist.length > 60) this.tHist.length = 60;');   // SW-RB11a: TrailCacheLength[946]=20（环上限 60=[x,y,rot]×20）
    expect(MINION_TS).toContain('this.terraprismaAI(game, p, dmg0);');
    expect(MINION_TS).toContain('if (this.projId === 946 && img) {');
    expect(MINION_TS).toContain('const num = this.rot - Math.PI / 2;');
    expect(MINION_TS).toContain('-120 * f * lerpValue');
    expect(MINION_TS).toContain('const num22 = empressHuePhase(this.id, own?.maxMinions ?? 1, gtwSec());');
  });
  it('755 同族世界光（CastLightOpen :52440-52441 Crimson → DelegateMethods.cs:741-744）', () => {
    expect(MINION_TS).toContain('0.863, 0.078, 0.235');
  });
  it('TrailShader：EmpressBlade SSD=(1,0,0,0.6)（EmpressBladeDrawer.cs:18-26）+ Extra_209/210（DyeInitializer.cs:479-480）', () => {
    expect(TRAIL_TS).toMatch(/EmpressBlade: \{ imgs: \['vanilla\/Extra_209\.png', 'vanilla\/Extra_210\.png', null\], tech: true, ssd: \[1, 0, 0, 0\.6\] \}/);
  });
  it('Renderer：SELF_LUMINOUS_PROJS 946 全亮条目（本体不读格光 :36576-36577 → floor 1/whiten）', () => {
    expect(RENDERER_TS).toContain('[946, () => ({ floor: 1, whiten: true })]');
  });
});
