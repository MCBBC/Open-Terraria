// ★BJ-C1（2026-10-06）R1 红蓝渲染批 findings F1-F7 清偿判别套件
//
// 七件落刀（每件先定谳后动刀,判别面=原版语义锁非旧实现锁）：
//  F1（判谳级）516 恒量支重建模：GetAlpha NPC.cs:94667-94670 `type==516 → new
//    Color(alpha,alpha,alpha,alpha)` 常量覆写早退（alpha=0-255 字节域,AI_009
//    alpha+=40 封顶 220 :21466-21469）→ 本体=tex×(α/255) 恒量不吃光+罩 35/255+
//    vel4 加算+num288 恒 0.814（0.5+|0.86275−0.5|·√3·0.5,与格光无关）。本仓旧按
//    缺省族建模（ga=1−α/255=恒态 0.137 透底 6.3 倍+实体层乘光暗核欠亮+num 随光
//    包络反向）——判别测试随刀重产（bj510 旧钉值在满光档与原版恒量数值巧合
//    0.8141=误读漏网根因,本套件钉全光域恒值）。
//  F4 消费段重放锁：7d' 白提亮/恒量复绘 + 7d''' 塔 vel4 消费段抽方法
//    （flushNpcWhiteLift/flushTowerGlow,行为零变）+ recording-ctx 闭包重放锁
//    （bj529② 体裁）——M3 曾禁用整段全绿实锤,本刀补行为断言。
//  F2 19/35 收编：:81465-81468 `34||35||15||19||44||45 → Color.White` 活成员
//    19 Flamarang（Boomerang 载体）/35 Sunfury（FlailProj AI_015 连枷,尘支实证）
//    ——BJ530 同构 capture→return+projFullbrightQueue（drawProj capture 槽单源）
//    +BJ228 豁免注勘误（BJ529 定谳"常量弹面=光照无关"推翻"GA 豁免即承接"旧判）。
//  F3 常量色族通用全亮通道：vanillaProjAlpha kind 驱动+白 rgb 门（projConstFullbright
//    分类器）→ Arrow.draw 本体段 recording-ctx 通用 capture（502 Meowmere 判别代表）
//    +633 Prism/933 Zenith 专属载体接线；其余=表驱动结构锁。
//  F5 NPC 侧扩门：npcWhiteLiftAlpha 454-459 沙虫族（:94640 Lerp White 0.4+本体
//    A=150 半透）/402（:94569 恒全白 a=1 极限档）；583-585 保持 drawFairyBright
//    独占不双绘；死型（681/636/549/521/440…）活体普查不收。
//  F6 census 注勘误：1039 活支锚 :80753（旧 :76082=1456 退役行号）/1059-1076
//    =IsAPhaseblade 光刃投掷弹定性（Boomerang aiStyle3 载体,活支 :80613）。
//  F7 Enemy.ts.orig 残留删除（pgrep 纪律后删）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { Arrow, setProjSpriteOverride } from '../src/entities/Arrow';
import { Boomerang, FlailProj } from '../src/entities/WeaponProj';
import { PrismProj } from '../src/entities/PrismProj';
import { ZenithSword } from '../src/entities/SwingArc';
import { projConstFullbright } from '../src/data/vanillaProjAlpha';
import { npcWhiteLiftAlpha } from '../src/render/npcExtraParts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const rendererSrc = () => src('../src/render/Renderer.ts');
const arrowSrc = () => src('../src/entities/Arrow.ts');
const prismSrc = () => src('../src/entities/PrismProj.ts');
const zenithSrc = () => src('../src/entities/SwingArc.ts');
const partsSrc = () => src('../src/render/npcExtraParts.ts');

/** 区块抽取：startMark 行起至 endMark 行前（含两端标记行） */
function block(s: string, startMark: string, endMark: string): string {
  const lines = s.split('\n');
  const a = lines.findIndex((l) => l.includes(startMark));
  const b = lines.findIndex((l, i) => i > a && l.includes(endMark));
  expect(a, `startMark 未命中: ${startMark}`).toBeGreaterThanOrEqual(0);
  expect(b, `endMark 未命中: ${endMark}`).toBeGreaterThan(a);
  return lines.slice(a, b).join('\n');
}

/** 记录式 ctx（bj529② recording-ctx 体裁）：方法全记、状态带 get 回读 */
function recordingCtx() {
  const ops: Array<Record<string, unknown>> = [];
  let alpha = 1;
  let comp = 'source-over';
  let filter = 'none';
  const ctx = {
    canvas: { width: 800, height: 600 },
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    translate: (...a: unknown[]) => ops.push({ op: 'translate', a }),
    scale: (...a: unknown[]) => ops.push({ op: 'scale', a }),
    rotate: (r: number) => ops.push({ op: 'rotate', r }),
    drawImage: (...a: unknown[]) => ops.push({ op: 'draw', a, alpha }),
    fillRect: (...a: unknown[]) => ops.push({ op: 'fillRect', a, alpha }),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    imageSmoothingEnabled: false,
    set fillStyle(_v: string) {}, get fillStyle() { return ''; },
    set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    set(v: number) { alpha = v; ops.push({ op: 'alpha', v }); },
    get() { return alpha; },
  });
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    set(v: string) { comp = v; ops.push({ op: 'composite', v }); },
    get() { return comp; },
  });
  Object.defineProperty(ctx, 'filter', {
    set(v: string) { filter = v; ops.push({ op: 'filter', v }); },
    get() { return filter; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** 全亮队列捕手：闭包入列 + flush 时重放到记录 ctx（=7f flushTrailShade 语义） */
function makeSink() {
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  return {
    queued,
    sink: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
    /** 重放并返回主画布 op 序列 */
    flushTo(ops: Array<Record<string, unknown>>, ctx: CanvasRenderingContext2D) {
      for (const fn of queued) fn(ctx);
      void ops;
    },
  };
}

// ===================== F1. 516 恒量支重建模（判谳级） =====================
describe('BJ-C1 F1 516 日耀耀斑恒量支（NPC.cs:94667-94670 GetAlpha 早退）', () => {
  it('本体恒量复绘入 7d\' 队列：ga=spawnAlpha/255（非 1−α/255 缺省族,判别位=包络方向）', () => {
    const s = rendererSrc();
    const cap = block(s, '★BJ-C1 F1（2026-10-06）：516 日耀耀斑本体恒量支重建模', '} else if (!xnaColor && !bodyTint370) {');
    expect(cap).toContain('if (e.vanillaId === 516) {');
    // 恒量档 ga=alpha/255（220 恒态=0.86275 淡入;缺省族 1−α/255=0.137 反向=旧病）
    expect(cap).toContain('ga: Math.min(255, Math.max(e.spawnAlpha, 0)) / 255,');
    expect(cap).toContain("vid: 516, tex: 'vanilla/NPC_516.png',");
    // 本体不进实体层（capture→return,270/45 判例同构）
    expect(cap).not.toContain('ctx.drawImage');
  });
  it('debuff 染色链对 516 关闭（恒量支弃用输入色=Main.cs:23170 染色在 GetAlpha 之前并弃）', () => {
    const s = rendererSrc();
    expect(s).toContain('if (e.vanillaId !== 516 && drawColor && drawColor[3] > 0) {');
  });
  it('num288 恒量化：全光域同值 0.81412（格光无关判别位——旧式随光摆动）', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const N = (Renderer as unknown as {
      npcGlowVel4Num: (vid: number, l: readonly number[] | null, a?: number) => number;
    }).npcGlowVel4Num;
    const want = 0.5 + Math.sqrt(3) * Math.abs(220 / 255 - 0.5) * 0.5;   // 0.81412
    expect(want).toBeCloseTo(0.81412, 4);
    expect(N(516, [255, 255, 255], 220)).toBeCloseTo(want, 6);
    expect(N(516, [3, 7, 2], 220)).toBeCloseTo(want, 6);
    expect(N(516, [0, 0, 0], 220)).toBeCloseTo(want, 6);
    expect(N(516, null, 220)).toBeCloseTo(want, 6);
    // 出生拍 α=0 → tint=(0,0,0,0) → 0.93301（GetAlpha 定义面,非 base 兜底 0.5）
    expect(N(516, [255, 255, 255], 0)).toBeCloseTo(0.5 + Math.sqrt(3) * 0.25, 6);
  });
});

// ===================== F4. 7d'/7d''' 消费段重放锁（recording-ctx 体裁） =====================
describe('BJ-C1 F4 7d\'/7d\'\'\' 消费段方法化+闭包重放锁（M3 补行为断言）', () => {
  const atlasStub = { ensureVImage: (_k: string) => ({ width: 38, height: 152 }) } as never;
  const CAM = { x: 100.35, y: 200.65 } as never;
  const Z = 2, VW = 800, VH = 600;

  function flushWhiteLift(self: Record<string, unknown>) {
    return async (cam: unknown, z: number, vw: number, vh: number) => {
      const { Renderer } = await import('../src/render/Renderer');
      (Renderer.prototype as unknown as {
        flushNpcWhiteLift: (c: unknown, z: number, vw: number, vh: number) => void;
      }).flushNpcWhiteLift.call(self, cam, z, vw, vh);
      void cam;
    };
  }

  it('flushNpcWhiteLift 重放：相机 round 吸附+ga 恒量档直读+9 参本体同枢复绘', async () => {
    const rec = recordingCtx();
    const self = {
      atlas: atlasStub, ctx: rec.ctx, npcWhiteLiftQueue: [{
        vid: 516, tex: 'vanilla/NPC_516.png', sy: 38, sw: 38, sh: 38,
        cx: 1000, cy: 2000, rot: 0.7, mirror: false, scale: 1, by: -19,
        ga: 220 / 255,
      }],
    };
    await flushWhiteLift(self)(CAM, Z, VW, VH);
    // 队列不清空（帧头重建语义,消费位零改）
    expect((self.npcWhiteLiftQueue as unknown[]).length).toBe(1);
    const rounds = rec.ops.filter((o) => o.op === 'translate') as Array<{ a: unknown[] }>;
    // cam.x=100.35×2=200.7→round 201→/2=100.5;cam.y=200.65×2=401.3→round 401→/2=200.5
    expect(JSON.stringify(rounds[0].a)).toBe(JSON.stringify([400, 300]));            // vw/2,vh/2
    expect(JSON.stringify(rounds[1].a)).toBe(JSON.stringify([-100.5, -200.5]));     // -camRX/-camRY
    expect(rec.ops.some((o) => o.op === 'alpha' && o.v === 220 / 255)).toBe(true);   // F1 ga 直读
    const draw = rec.ops.find((o) => o.op === 'draw') as { a: unknown[] } | undefined;
    expect(draw).toBeTruthy();
    expect(draw!.a[1]).toBe(0); expect(draw!.a[2]).toBe(38);                         // sy=帧行
    expect(JSON.stringify(draw!.a.slice(5))).toBe(JSON.stringify([-19, -19, 38, 38]));// -sw/2,by,sw,sh
    expect(rec.ops.some((o) => o.op === 'rotate' && (o as { r: number }).r === 0.7)).toBe(true);
    expect(rec.ops.filter((o) => o.op === 'composite')[0]).toMatchObject({ v: 'source-over' });
  });
  it('flushNpcWhiteLift 缺省档：无 ga 走 npcWhiteLiftAlpha lerp 档（519→0.4 回归）', async () => {
    const rec = recordingCtx();
    const self = {
      atlas: atlasStub, ctx: rec.ctx, npcWhiteLiftQueue: [{
        vid: 519, tex: 'vanilla/NPC_519.png', sy: 0, sw: 20, sh: 20,
        cx: 50, cy: 60, rot: 0, mirror: true, scale: 1, by: -10,
      }],
    };
    await flushWhiteLift(self)(CAM, Z, VW, VH);
    expect(rec.ops.some((o) => o.op === 'alpha' && o.v === 0.4)).toBe(true);
    expect(rec.ops.some((o) => o.op === 'scale' && JSON.stringify((o as { a: unknown[] }).a) === '[-1,1]')).toBe(true);
  });
  it("flushTowerGlow 重放：lighter 域+64/255 α+vel4 四向 offset 单源（npcGlowVel4Offsets 纯函数对拍）", async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const rec = recordingCtx();
    const q = {
      vid: 493, tex: 'vanilla/Glow_132.png', iw: 80, sy: 0, gh: 80,
      sw: 80, sh: 80, wx: 500, wy: 700, vx: 3, vy: 4, num: 4, xoff: 0, opacity: 1,
    };
    const self = { atlas: atlasStub, ctx: rec.ctx, towerGlowQueue: [q] };
    (Renderer.prototype as unknown as {
      flushTowerGlow: (c: unknown, z: number, vw: number, vh: number) => void;
    }).flushTowerGlow.call(self, CAM, Z, VW, VH);
    expect(rec.ops.filter((o) => o.op === 'composite')[0]).toMatchObject({ v: 'lighter' });
    expect(rec.ops.some((o) => o.op === 'alpha' && Math.abs((o.v as number) - 64 / 255) < 1e-9)).toBe(true);
    // 四向 offset 与纯函数逐值对拍（收集/消费/测试三方单源判别位）
    const offs = Renderer.npcGlowVel4Offsets(3, 4, 4, 0);
    const draws = rec.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[] }>;
    expect(draws.length).toBe(4);
    for (let k = 0; k < 4; k++) {
      expect(draws[k].a[5]).toBeCloseTo(500 + offs[k][0], 9);
      expect(draws[k].a[6]).toBeCloseTo(700 + offs[k][1], 9);
    }
  });
  it("flushTowerGlow 516 面：白罩 overlay 先序 + single 单份短路（本体同枢=中心重放;两项=收集面 flare 主项+残影发射器分立）", async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const rec = recordingCtx();
    const self = {
      atlas: atlasStub, ctx: rec.ctx, towerGlowQueue: [
        {   // flare 主项：白罩 0.137 + vel4 四向（rot 路径）
          vid: 516, tex: 'vanilla/NPC_516.png', iw: 38, sy: 38, gh: 38,
          sw: 38, sh: 38, wx: 500, wy: 700, vx: 0, vy: 0, num: 0, xoff: 0,
          opacity: 1, noOpac: true, rot: 0.7, cx: 500, cy: 700,
          bx: -19, by: -19, scale: 1.2, overlay: 35 / 255,
        },
        {   // 残影发射器单份项（drawPreBodySpecialGhosts emit）
          vid: 516, tex: 'vanilla/NPC_516.png', iw: 38, sy: 38, gh: 38,
          sw: 38, sh: 38, wx: 500, wy: 700, vx: 0, vy: 0, num: 0, xoff: 0,
          opacity: 1, noOpac: true, single: 0.25,
          rot: 0.7, cx: 500, cy: 700, bx: -19, by: -19, scale: 1.2,
        },
      ],
    };
    (Renderer.prototype as unknown as {
      flushTowerGlow: (c: unknown, z: number, vw: number, vh: number) => void;
    }).flushTowerGlow.call(self, CAM, Z, VW, VH);
    // 主项:白罩(0.137)→vel4 四向（num=0 → 四向同位）;残影项:single(0.25) 短路 vel4
    const alphas = rec.ops.filter((o) => o.op === 'alpha') as Array<{ v: number }>;
    expect(alphas[0].v).toBeCloseTo(35 / 255, 9);
    expect(alphas[1].v).toBeCloseTo(64 / 255, 9);
    expect(alphas[2].v).toBeCloseTo(0.25, 9);
    expect(alphas.length).toBe(3);
    const draws = rec.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[] }>;
    expect(draws.length).toBe(6);                       // 主项 1 罩+4 向,残影 1
    expect(draws[1].a[5]).toBeCloseTo(-19 * 1.2, 9);    // bx×scale（本体同枢闭包路径）
    expect(draws[5].a[5]).toBeCloseTo(-19 * 1.2, 9);    // single bx×scale
  });
  it('render 调用序：7d\' whiteLift → 7d\'\'\' towerGlow（同序位,方法化零行为差）', () => {
    const s = rendererSrc();
    expect(s).toContain('this.flushNpcWhiteLift(cam, z, viewW, viewH);');
    expect(s).toContain('this.flushTowerGlow(cam, z, viewW, viewH);');
    expect(s.indexOf('this.flushNpcWhiteLift(cam, z, viewW, viewH);'))
      .toBeLessThan(s.indexOf('this.flushTowerGlow(cam, z, viewW, viewH);'));
  });
});

// ===================== F2. 19 Flamarang / 35 Sunfury 收编 =====================
describe('BJ-C1 F2 :81465 恒白族 19/35 收编（BJ530 同构 capture→复绘）', () => {
  const IMG19 = { width: 22, height: 22 } as unknown as HTMLImageElement;
  const IMG35 = { width: 26, height: 26 } as unknown as HTMLImageElement;
  afterEach(() => {
    setProjSpriteOverride(19, { width: 0, height: 0 } as unknown as HTMLImageElement);
    setProjSpriteOverride(35, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('19 Flamarang：本体不进实体层,恰 1 闭包入队,复绘 ga=1（Color.White A=255 恒定）', () => {
    setProjSpriteOverride(19, IMG19);
    const rec = recordingCtx();
    const sink = makeSink();
    const b = new Boomerang(1000, 2000, 6, -2, 32, 4, 19, 1);
    b.draw({
      ctx: rec.ctx, mainPlayer: undefined,
      queueProjFullbright: sink.sink,
    } as never, {} as never);
    expect(rec.ops.filter((o) => o.op === 'draw')).toHaveLength(0);   // capture→return
    expect(sink.queued).toHaveLength(1);
    const rec2 = recordingCtx();
    sink.flushTo(rec2.ops, rec2.ctx);
    const draws = rec2.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[]; alpha: number }>;
    expect(draws.length).toBe(1);
    expect(draws[0].alpha).toBe(1);                                   // 非 (255−α)/255 兜底
    expect(draws[0].a[0]).toBe(IMG19);
    expect(rec2.ops.some((o) => o.op === 'rotate')).toBe(true);
  });
  it('35 Sunfury：球体 capture ga=1（α=100 死值不读——旧 (255−100)/255≈0.61 半透判别位）', () => {
    setProjSpriteOverride(35, IMG35);
    const rec = recordingCtx();
    const sink = makeSink();
    const f = new FlailProj(1000, 2000, 24, 3, 35,
      () => false, () => ({ x: 1200, y: 2000 }));
    f.draw({
      ctx: rec.ctx, mainPlayer: undefined, queueProjFullbright: sink.sink,
    } as never, {} as never);
    expect(sink.queued).toHaveLength(1);
    const rec2 = recordingCtx();
    sink.flushTo(rec2.ops, rec2.ctx);
    const draws = rec2.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[]; alpha: number }>;
    expect(draws.length).toBe(1);
    expect(draws[0].alpha).toBe(1);                 // 判别位：恒白支不读 α
    expect(draws[0].a[0]).toBe(IMG35);
    // 中心锚组（FLAIL_CENTER_ANCHOR {25,26,35,63,154,247,757}）=盒心+贴图心 origin
    const tr = rec2.ops.filter((o) => o.op === 'translate') as Array<{ a: unknown[] }>;
    expect(JSON.stringify(tr[tr.length - 1].a)).toBe(JSON.stringify([1000 + f.w / 2, 2000 + f.h / 2]));
  });
  it('BJ228 豁免注勘误（BJ529 定谳推翻旧判：GA=1 只修 α 面,乘光面须复绘承接）', () => {
    const s = arrowSrc();
    expect(s).toContain('★BJ-C1 F2 注勘误');
    expect(s).toContain('19 Flamarang');
    expect(s).toContain('35 Sunfury（FlailProj 载体');
  });
});

// ===================== F3. 常量色族通用全亮通道 =====================
describe('BJ-C1 F3 常量色族通用通道（projConstFullbright 分类器+通用 capture）', () => {
  it('分类器钉值：502/633/933/1059/270 真;fade 缺省族/彩色 fixed/off 项假', () => {
    expect(projConstFullbright(502)).toBe(true);    // fixed (255,255,255,200)
    expect(projConstFullbright(633)).toBe(true);    // fixed (255,255,255,200)
    expect(projConstFullbright(933)).toBe(true);    // fade2（White×Opacity 后缺省=常量）
    expect(projConstFullbright(1059)).toBe(true);   // fixed IsAPhaseblade
    expect(projConstFullbright(270)).toBe(true);    // pulse40（专属支早退,表级真）
    expect(projConstFullbright(12)).toBe(false);    // fade=缺省族（RGB 含格光）
    expect(projConstFullbright(15)).toBe(false);    // off 登记（GA 94/95 同族自理）
    expect(projConstFullbright(34)).toBe(false);    // off（GA case 34 自理）
    expect(projConstFullbright(5)).toBe(false);     // invisible（A=0 加算族自理）
    expect(projConstFullbright(440)).toBe(false);   // 无表项
  });
  it('502 Meowmere 判别代表：本体段零实体落笔+恰 1 闭包+复绘 ga=200/255', () => {
    const IMG502 = { width: 16, height: 16 } as unknown as HTMLImageElement;
    setProjSpriteOverride(502, IMG502);
    try {
      const rec = recordingCtx();
      const sink = makeSink();
      const a = new Arrow(1000, 2000, 7, -1, 90, 6.5, 502, {});
      a.draw({
        ctx: rec.ctx, mainPlayer: undefined, queueProjFullbright: sink.sink,
      } as never, {} as never);
      expect(sink.queued).toHaveLength(1);                            // 通用门入队
      expect(rec.ops.filter((o) => o.op === 'draw')).toHaveLength(0); // 本体不进实体层
      const rec2 = recordingCtx();
      sink.flushTo(rec2.ops, rec2.ctx);
      const draws = rec2.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[]; alpha: number }>;
      expect(draws.length).toBeGreaterThanOrEqual(1);
      expect(draws[0].alpha).toBeCloseTo(200 / 255, 9);               // fixed A=200 恒定
      expect(draws[0].a[0]).toBe(IMG502);
    } finally {
      setProjSpriteOverride(502, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });
  it('门排除面：fade 缺省族（12 水箭）不入队照常实体层直绘（RGB 含格光=乘光同相）', () => {
    const IMG12 = { width: 14, height: 30 } as unknown as HTMLImageElement;
    setProjSpriteOverride(12, IMG12);
    try {
      const rec = recordingCtx();
      const sink = makeSink();
      const a = new Arrow(1000, 2000, 5, 0, 9, 0, 12, {});
      a.draw({
        ctx: rec.ctx, mainPlayer: undefined, queueProjFullbright: sink.sink,
      } as never, {} as never);
      expect(sink.queued).toHaveLength(0);
      expect(rec.ops.filter((o) => o.op === 'draw').length).toBeGreaterThanOrEqual(1);
    } finally {
      setProjSpriteOverride(12, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });
  it('633 Prism 判别代表：改道 projFullbrightQueue+复绘 ga=200/255（:80834 fixed 恒档）', () => {
    const IMG633 = { width: 26, height: 120 } as unknown as HTMLImageElement;
    setProjSpriteOverride(633, IMG633);
    try {
      const rec = recordingCtx();
      const sink = makeSink();
      const p = new PrismProj(10, 0, 100, 5,
        () => false, () => ({ x: 1100, y: 2000 }), () => true);
      p.dirX = 1; p.dirY = 0;
      p.draw({ ctx: rec.ctx, queueProjFullbright: sink.sink } as never);
      expect(rec.ops.filter((o) => o.op === 'draw')).toHaveLength(0);  // 旧 prismCrystal 位不再实体直画
      expect(sink.queued).toHaveLength(1);
      const rec2 = recordingCtx();
      sink.flushTo(rec2.ops, rec2.ctx);
      const draws = rec2.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[]; alpha: number }>;
      expect(draws.length).toBe(1);
      expect(draws[0].alpha).toBeCloseTo(200 / 255, 9);
      expect(draws[0].a[0]).toBe(IMG633);
    } finally {
      setProjSpriteOverride(633, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });
  it('933 Zenith 判别代表：本体/残影/叠绘/星芒封包改道（实体层零落笔）+彩带仍走 trailShade', () => {
    const owner = { cx: 1000, cy: 2000, x: 984, y: 1984, w: 32, h: 32, facing: 1, dead: false };
    const z = new ZenithSword(owner as never, 1100, 1900, 190, 0, 6.5);
    (z as unknown as { counter: number }).counter = 30;
    (z as unknown as { opacity: number }).opacity = 1;
    const rec = recordingCtx();
    const sink = makeSink();
    z.draw({ ctx: rec.ctx, queueProjFullbright: sink.sink } as never);
    expect(sink.queued).toHaveLength(1);
    expect(rec.ops.filter((o) => o.op === 'draw' || o.op === 'fillRect')).toHaveLength(0);
    const rec2 = recordingCtx();
    sink.flushTo(rec2.ops, rec2.ctx);
    // 本体+1.25× 双 pass = 3 fillRect（icon 缺席回退）+星芒
    const fills = rec2.ops.filter((o) => o.op === 'fillRect') as Array<{ alpha: number }>;
    expect(fills.length).toBeGreaterThanOrEqual(3);
    expect(fills[0].alpha).toBeCloseTo(1, 6);          // 本体 White×Opacity×num182
  });
  it('933 路由结构锁：projFullbrightQueue 缺席环境回退实体直画（测试/旧宿主兜底）', () => {
    const s = zenithSrc();
    const blk = block(s, '★BJ-C1 F3（2026-10-06,代表判别站）：933 天顶剑弹面', 'paint(ctx);');
    expect(blk).toContain("if (typeof fbSink === 'function') { fbSink(paint); return; }");
  });
});

// ===================== F5. NPC 侧 npcWhiteLiftAlpha 扩门 =====================
describe('BJ-C1 F5 白提亮/恒量档扩门（活体普查逐型定谳）', () => {
  it('454-459 沙虫族 0.4 档（:94640 Lerp White 0.4;活体=蠕虫白名单全 6 型）', () => {
    for (let v = 454; v <= 459; v++) expect(npcWhiteLiftAlpha(v)).toBe(0.4);
  });
  it('402 恒全白 a=1 极限档（:94569 Color(255,255,255,255)——复绘全覆盖即原版 tint）', () => {
    expect(npcWhiteLiftAlpha(402)).toBe(1);
  });
  it('回归面：395/519=0.4 不动;583-585 保持 null（drawFairyBright 独占,入本门=双绘）;死型 null', () => {
    expect(npcWhiteLiftAlpha(395)).toBe(0.4);
    expect(npcWhiteLiftAlpha(519)).toBe(0.4);
    for (const v of [583, 584, 585]) expect(npcWhiteLiftAlpha(v)).toBeNull();
    for (const v of [681, 636, 549, 521, 440, 683, 687, 662, 655, 360]) {
      expect(npcWhiteLiftAlpha(v)).toBeNull();
    }
  });
  it('454-459 本体半透面：缺省直绘 ga ×150/255（:94644 A=150×num5/255 定义面）', () => {
    const s = rendererSrc();
    expect(s).toContain('★BJ-C1 F5（2026-10-06）：454-459 沙虫族本体半透面');
    expect(s).toContain('? 150 / 255 : 1');
  });
});

// ===================== F6. census 注勘误 =====================
describe('BJ-C1 F6 census 注勘误（1457 活支重锚+光刃投掷弹定性）', () => {
  it('1039 条目：fixedfade 白×Opacity,锚勘误 :80753（旧 :76082=1456 退役行号）', () => {
    const s = src('../src/data/vanillaProjAlpha.ts');
    expect(s).toMatch(/1039: \{ kind: 'fixedfade', rgba: \[255,255,255,255\] \},\s*\/\/ :80753 \|/);
    expect(s).not.toContain(':76082 | White*Opacity');
  });
  it('1059-1076 条目：:80613 活支+光刃投掷弹定性（Boomerang aiStyle3 载体,非剑挥砍）', () => {
    const s = src('../src/data/vanillaProjAlpha.ts');
    expect(s).not.toContain(':75942 | IsAPhaseblade');
    expect((s.match(/:80613 \| IsAPhaseblade 光刃投掷弹/g) ?? []).length).toBeGreaterThanOrEqual(17);
    expect(s).toContain('载体=Boomerang aiStyle3 非剑挥砍');
  });
  it('BJ529 普查注：F2 收编批注+1039 活支勘误入档', () => {
    const s = src('../src/data/vanillaProjAlpha.ts');
    expect(s).toContain('★BJ-C1 F2（2026-10-06）同支 19 Flamarang/35 Sunfury 收编');
    expect(s).toContain('1039 活支=:80753-80756');
  });
});

// ===================== F7. Enemy.ts.orig 残留删除 =====================
describe('BJ-C1 F7 Enemy.ts.orig 残留（pgrep 纪律后删除）', () => {
  it('文件不复存在且无 import 引用', () => {
    expect(existsSync(new URL('../src/entities/Enemy.ts.orig', import.meta.url))).toBe(false);
    expect(arrowSrc()).not.toContain('Enemy.ts.orig');
  });
});
