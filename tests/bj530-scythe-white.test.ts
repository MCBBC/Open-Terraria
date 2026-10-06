// ★BJ530 恶魔镰刀 44/45 GetAlpha Color.White 收编（BJ529 同族普查第二刀）三面锁：
//  ①A 通道形态钉值：GetAlpha :81465-81468 `type==34||35||15||19||44||45 →
//    Color.White`（本支实际生效面=35/19/44/45,15/34 被更早分支截走——F2/T2 勘误
//    同谳）——A=255【恒定】（无 270 式 pulse40 三角波/无 fade/不读 α,SetDefaults
//    α=100 :1277/:1285 系死值）,RGB 恒白【不读光照色】（Main.cs:30068 格光被
//    GetAlpha 整体替换 → :31532/:31578 EntitySpriteDraw color48=Color.White）。
//  ②两型可达/两载体复绘承接：44 hostile=Dart 载体（恶魔 62/66 NPC.cs:23533 →
//    Enemy 射手表 proj:44 → spawnHostileProj）;45 friendly=Arrow 载体（item 272
//    恶魔镰书法典 Item.cs:4560-4575 shoot=45 → Game case 'magic' 通用尾）。
//    两支 draw 均 capture→return（实体层零 drawImage=乘光面退役）+ projFullbrightQueue
//    恰 1 闭包（flushTrailShade 光照合成后主画布 source-over 复绘=BJ529 270 先例
//    同构）;闭包锁 ga=1、rotate=载体自旋累积角、单帧整图 9 参直切原图。
//  ③非同族不回归：270 pulse40 A 通道仍脉冲（形态异族）、12 真镜弹（fade=含格光域）
//    仍实体层照画不入复绘队、PROJ_ALPHA_MOD 表身份锁定。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Arrow, setProjSpriteOverride, projFrameSrcRect } from '../src/entities/Arrow';
import { Dart } from '../src/entities/Dart';
import { PROJ_ALPHA_MOD } from '../src/data/vanillaProjAlpha';

/** 记录式 ctx（save/translate/rotate/globalAlpha/drawImage 全记,无 DOM） */
function recordingCtx() {
  const recs: Array<{ op: string; args?: unknown[] }> = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect() {}, strokeRect() {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recs };
}

/** 捕获式 draw：返回实体层绘制记录 + projFullbrightQueue 闭包（Arrow 与 Dart 通用） */
function drawCaptured(e: Arrow | Dart): {
  entityDraws: Array<{ op: string; args?: unknown[] }>;
  queued: Array<(c: CanvasRenderingContext2D) => void>;
} {
  const rc = recordingCtx();
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  e.draw({
    ctx: rc.ctx,
    mainPlayer: undefined,
    queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
  } as never, {} as never);
  return { entityDraws: rc.recs, queued };
}

const BOX = 48;        // SetDefaults 44/45 width=height=48（P.cs:1273-1292）
const SCALE = 0.9;     // SetDefaults scale=0.9（json vanilla-projectiles 双型在账）

describe('BJ530 ① A 通道形态钉值：Color.White A=255 恒定（不读 α/无脉冲）', () => {
  it('表不加项锁：44/45 不入 PROJ_ALPHA_MOD（300 census 锁不动,F2 硬档先例）', () => {
    for (const id of [44, 45]) {
      expect(PROJ_ALPHA_MOD[id]).toBeUndefined();
    }
  });

  it('A 通道恒定：α 全域扫描闭包 ga≡1（SetDefaults α=100 死值不读——F2 案钉值延续）', () => {
    setProjSpriteOverride(45, { width: BOX, height: BOX } as unknown as HTMLImageElement);
    try {
      const a45 = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 45, { grav: 0 });
      const gaGA = (a45 as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha.bind(a45);
      expect(gaGA()).toBe(1);                        // F2 硬档（GetAlpha :81465 A=255 恒定）
      for (const al of [0, 50, 100, 128, 200, 255]) {
        const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 45, { grav: 0 });
        (a as unknown as { alpha: number }).alpha = al;
        const { queued } = drawCaptured(a);
        const rc = recordingCtx();
        queued[0](rc.ctx);
        expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
      }
    } finally {
      setProjSpriteOverride(45, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });

  it('形态异族对照：270=pulse40 三角脉冲/444=fade（非恒 White 族,不收编）', () => {
    expect(PROJ_ALPHA_MOD[270].kind).toBe('pulse40');
    expect(PROJ_ALPHA_MOD[444].kind).toBe('fade');
  });
});

describe('BJ530 ② 45 friendly 面（Arrow magic-case 通用尾载体）capture→return 复绘', () => {
  beforeEach(() => {
    setProjSpriteOverride(45, { width: BOX, height: BOX } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(45, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('draw：实体层零 drawImage（乘光面退役）,恰 1 闭包入队', () => {
    const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 45, { grav: 0 });
    const { entityDraws, queued } = drawCaptured(a);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
    expect(queued).toHaveLength(1);
  });

  it('闭包锁：save→translate(盒心)→rotate(spinRot)→ga=1→9 参 drawImage(整图×0.9,盒心锚)→restore', () => {
    const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 45, { grav: 0 });
    (a as unknown as { spinRot: number }).spinRot = 2.4;   // PROJ_SPIN[45] 累积角
    (a as unknown as { alpha: number }).alpha = 100;       // SetDefaults 死值在账也不读
    const { queued } = drawCaptured(a);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const ops = rc.recs;
    expect(ops[0].op).toBe('save');
    expect(ops[ops.length - 1].op).toBe('restore');
    const tr = ops.find((o) => o.op === 'translate');
    expect(tr?.args?.[0]).toBeCloseTo(80 * 16 + BOX / 2, 4);
    expect(tr?.args?.[1]).toBeCloseTo(100 * 16 + BOX / 2, 4);
    const rot = ops.filter((o) => o.op === 'rotate');
    expect(rot).toHaveLength(1);
    expect(rot[0].args?.[0]).toBeCloseTo(2.4, 6);          // 自旋累积角直通（无镜像面）
    expect(ops.filter((o) => o.op === 'scale')).toHaveLength(0);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
    const draw = ops.find((o) => o.op === 'drawImage');
    expect(draw).toBeDefined();
    const [img, sx, sy, sw, sh, dx, dy, dw, dh] = draw!.args as number[];
    expect((img as unknown as { width: number }).width).toBe(BOX);   // 原图直切（9 参）
    expect(sx).toBe(0); expect(sy).toBe(0);
    expect(sw).toBe(BOX); expect(sh).toBe(BOX);            // 单帧=整图（projFrames 无 44/45 赋值）
    expect(dx).toBeCloseTo(-BOX * SCALE / 2, 4);
    expect(dy).toBeCloseTo(-BOX * SCALE / 2, 4);
    expect(dw).toBeCloseTo(BOX * SCALE, 4);
    expect(dh).toBeCloseTo(BOX * SCALE, 4);
  });

  it('sprite 未就绪（width 0）→ 不入队不绘（P0-B 同律）', () => {
    setProjSpriteOverride(45, { width: 0, height: 0 } as unknown as HTMLImageElement);
    const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 45, { grav: 0 });
    const { entityDraws, queued } = drawCaptured(a);
    expect(queued).toHaveLength(0);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
  });

  it('帧源矩形单帧锁：projFrameSrcRect(45,0)=整图（Main.projFrames 缺省 1 帧）', () => {
    const rect = projFrameSrcRect(45, 0)!;
    expect(rect.sx).toBe(0); expect(rect.sy).toBe(0);
    expect(rect.sw).toBe(BOX); expect(rect.sh).toBe(BOX);
  });
});

describe('BJ530 ② 44 hostile 面（Dart 载体,Enemy 射手表 proj:44）capture→return 复绘', () => {
  beforeEach(() => {
    setProjSpriteOverride(44, { width: BOX, height: BOX } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(44, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('draw：实体层零 drawImage（半透+乘光双病退役）,恰 1 闭包入队', () => {
    const d = new Dart(80 * 16, 100 * 16, 2, 0, 21, 44);
    d.hostile = true;
    const { entityDraws, queued } = drawCaptured(d);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
    expect(queued).toHaveLength(1);
  });

  it('闭包锁：save→translate(盒心)→rotate(rot)→ga=1→9 参 drawImage(整图×0.9)→restore', () => {
    const d = new Dart(80 * 16, 100 * 16, 2, 0, 21, 44);
    (d as unknown as { rot: number }).rot = 1.6;           // DART_STYLE 'spin' 累积角
    const { queued } = drawCaptured(d);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const ops = rc.recs;
    expect(ops[0].op).toBe('save');
    expect(ops[ops.length - 1].op).toBe('restore');
    const tr = ops.find((o) => o.op === 'translate');
    expect(tr?.args?.[0]).toBeCloseTo(80 * 16 + BOX / 2, 4);
    expect(tr?.args?.[1]).toBeCloseTo(100 * 16 + BOX / 2, 4);
    const rot = ops.filter((o) => o.op === 'rotate');
    expect(rot).toHaveLength(1);
    expect(rot[0].args?.[0]).toBeCloseTo(1.6, 6);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
    const draw = ops.find((o) => o.op === 'drawImage');
    expect(draw).toBeDefined();
    const [img, sx, sy, sw, sh, dx, dy, dw, dh] = draw!.args as number[];
    expect((img as unknown as { width: number }).width).toBe(BOX);
    expect(sx).toBe(0); expect(sy).toBe(0);
    expect(sw).toBe(BOX); expect(sh).toBe(BOX);
    expect(dx).toBeCloseTo(-BOX * SCALE / 2, 4);
    expect(dy).toBeCloseTo(-BOX * SCALE / 2, 4);
    expect(dw).toBeCloseTo(BOX * SCALE, 4);
    expect(dh).toBeCloseTo(BOX * SCALE, 4);
  });

  it('ga 硬档钉值：α=100 在账闭包仍 ga=1（旧通用路径 (255−100)/255≈0.61 半透病退役）', () => {
    const d = new Dart(80 * 16, 100 * 16, 2, 0, 21, 44);
    (d as unknown as { alpha: number }).alpha = 100;       // DART_STYLE 44 alpha0=100 在账
    const { queued } = drawCaptured(d);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha)
      .not.toBeCloseTo((255 - 100) / 255, 3);              // 反证:非半透缺省路径
  });

  it('sprite 未就绪（width 0）→ 不入队不绘（P0-B 同律）', () => {
    setProjSpriteOverride(44, { width: 0, height: 0 } as unknown as HTMLImageElement);
    const d = new Dart(80 * 16, 100 * 16, 2, 0, 21, 44);
    const { entityDraws, queued } = drawCaptured(d);
    expect(queued).toHaveLength(0);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
  });
});

describe('BJ530 ③ 非同族不回归（BJ529 270 先例与通用路径零外溢）', () => {
  it('270 专属支不外溢：pulse40 仍脉冲,44/45 专属支 projId 门互斥', () => {
    setProjSpriteOverride(270, { width: 26, height: 90 } as unknown as HTMLImageElement);
    try {
      const a270 = new Arrow(80 * 16, 100 * 16, 3, 0, 17, 0, 270,
        { pierce: 3, skullBone: true, life: 300, grav: 0 });
      const fn270 = (a270 as unknown as { drawTableAlpha(): { ga: number } | null }).drawTableAlpha.bind(a270);
      (a270 as unknown as { life: number }).life = 320;
      expect(fn270()?.ga).toBeCloseTo(0, 6);               // 270 谷（脉冲面原样）
      (a270 as unknown as { life: number }).life = 310;
      expect(fn270()?.ga).toBeCloseTo(0.5, 6);             // 270 半峰（脉冲面原样）
    } finally {
      setProjSpriteOverride(270, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });

  it('含格光域（12 真镜弹 fade 档）不入复绘队：实体层照画（通用路径回归面）', () => {
    setProjSpriteOverride(12, { width: 28, height: 28 } as unknown as HTMLImageElement);
    try {
      const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 12, { grav: 0 });
      const { entityDraws, queued } = drawCaptured(a);
      expect(queued).toHaveLength(0);
      expect(entityDraws.filter((r) => r.op === 'drawImage').length).toBeGreaterThan(0);
    } finally {
      setProjSpriteOverride(12, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });

  it('Dart 载体非 44 弹照走通用路径（96 诅咒焰敌弹=乘光域,不收编）', () => {
    // Dart 通用路径恒走 projFrameImg（帧切片）→ node 环境打桩 document（arrow-fx-audit 同式）
    const ctx2d = { imageSmoothingEnabled: false, drawImage: () => {}, fillRect: () => {} };
    vi.stubGlobal('document', {
      createElement: () => ({ width: 16, height: 16, getContext: () => ctx2d }),
    });
    setProjSpriteOverride(96, { width: 16, height: 16 } as unknown as HTMLImageElement);
    try {
      const d = new Dart(80 * 16, 100 * 16, 2, 0, 12, 96);
      d.hostile = true;
      const { entityDraws, queued } = drawCaptured(d);
      expect(queued).toHaveLength(0);
      expect(entityDraws.filter((r) => r.op === 'drawImage').length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
      setProjSpriteOverride(96, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });
});
