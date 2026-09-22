// BJ247 彩虹魔杖拖尾 1:1（RainbowRodDrawer.cs:12-37 + VertexStrip.cs:69-120 逐行移植,
// 旧 stroke 粗椭圆团串退役——2026-09-21 用户实报定谳）：
//  ① StripColors 色相循环钉值：hue=hslToRgb(p*1.6−GlobalTime,1,.5)→Lerp(White,·,
//     GetLerpValue(−0.2,0.5,p,clamp))×(1−GetLerpValue(0,0.98,p)【无 clamp】)→A=0,
//     byte 语义 Lerp=Round/op_Multiply=截断（:23-29）;
//  ② StripWidth 半宽钉值：Lerp(0,32,1−(1−lerp(0,0.2,p))²)（:31-37,AddVertexPair
//     pos±(rot−π/2)·hw——旧实现把半宽当全宽 ×2=64px=粗团根因）;
//  ③ PrepareStripWithProceduralPadding：|Δrot|≥15° → ⌊|Δ|/(π/12)⌋ 对内插
//     num3+1 个 Catmull-Rom 点（VertexStrip.cs:85-107）——直带零补间、直角折点
//     精确 +11 内插点（π/4→4、π/2→7）;
//  ④ 管线参数钉值：set='RainbowRod'（obj55 pass+Extra 195/197/196,UseSaturation
//     −2.8=EXTRA_SETS 钉值）、uOpacity=4（UseOpacity(4f) :16）、uTime=globalT;
//  ⑤ 旧实现退役锁：stroke 粗线带签名禁入（全宽 64 式/α=fade×0.8 私改系数）;
//  ⑥ 头部（Main.cs:33231-33236+33498-33512+33558-33562）：spawn<13 拍 oldPos[12]
//     =零槽→本体不可见（BJ228 回退退役）;悬停满亮=双绘 2 次（光环支尾+公共段）;
//     快速飞行 scale=0 不出画。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { MagicMissileProj } from '../src/entities/MissileProj';
import type { GameHooks } from '../src/entities/types';
import type { TrailSpec } from '../src/fx/TrailShader';

function emptyWorld(): World {
  const w = new World(400, 400, 30, 'open');
  for (let x = 0; x < 400; x++) w.store.setTileSilent(x, 380, 1, 0, 0);
  return w;
}

function makeGame(w: World): GameHooks {
  return {
    world: w,
  // ★BJ279 移交②接线后：引导 aim 以玩家盒心为心钳可达区——mock 玩家锚在星位（悬停 face 不被钳飞）
    player: { dead: true, iframes: 0, cx: 81 * TILE, cy: 100 * TILE, x: 81 * TILE - 10, y: 100 * TILE - 21, w: 20, h: 42 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

/** 带队列捕获的 draw mock：spec 走 queueTrailShade,不触真实光栅 */
function drawWithCapture(m: MagicMissileProj): { specs: TrailSpec[]; ctx: Record<string, unknown> } {
  const specs: TrailSpec[] = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() {}, restore() {},
    drawImage() {},
    globalCompositeOperation: 'source-over', globalAlpha: 1, imageSmoothingEnabled: false,
  };
  (m as unknown as { draw(r: unknown): void }).draw({
    ctx, queueTrailShade: (s: TrailSpec) => specs.push(s),
  });
  return { specs, ctx };
}

function mk79(game: GameHooks, aim: { x: number; y: number }, vx = 0, vy = 0,
  channel = false): { m: MagicMissileProj; aimRef: { x: number; y: number } } {
  const aimRef = { ...aim };
  const m = new MagicMissileProj(80 * TILE, 100 * TILE, vx, vy, {
    projId: 79, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => channel,
    aimCb: () => aimRef,
    payMana: () => true,
  }) as MagicMissileProj;
  return { m, aimRef };
}

// ---- 独立参考转录（RainbowRodDrawer.cs:23-37 直读,与实现同字节语义） ----
function hueRef(h: number): [number, number, number] {
  const h2 = (c: number, t1: number, t2: number): number => {
    let x = c; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (6 * x < 1) return t1 + (t2 - t1) * 6 * x;
    if (2 * x < 1) return t2;
    if (3 * x < 2) return t1 + (t2 - t1) * (2 / 3 - x) * 6;
    return t1;
  };
  const hh = ((h % 1) + 1) % 1;
  const q = 1, t = 0;                     // L=0.5,S=1（Main.cs:48701-48704）
  return [
    Math.round(h2(hh + 1 / 3, t, q) * 255),
    Math.round(h2(hh, t, q) * 255),
    Math.round(h2(hh - 1 / 3, t, q) * 255),
  ];
}
const trnRef = (v: number): number => Math.max(0, Math.min(255, Math.trunc(v)));
function stripColorsRef(p: number, T: number): [number, number, number] {
  const lv = Math.max(0, Math.min(1, (p + 0.2) / 0.7));   // GetLerpValue(−0.2,0.5,p,clamp)
  const fade = 1 - p / 0.98;                              // GetLerpValue(0,0.98,p) 缺省无 clamp
  const [hr, hg, hb] = hueRef(p * 1.6 - T);
  return [
    trnRef(Math.round(255 + (hr - 255) * lv) * fade),     // Lerp→Round、×fade→截断
    trnRef(Math.round(255 + (hg - 255) * lv) * fade),
    trnRef(Math.round(255 + (hb - 255) * lv) * fade),
  ];
}
function stripWidthRef(p: number): number {              // :31-37（半宽）
  const g = Math.max(0, Math.min(1, p / 0.2));
  return 32 * (1 - (1 - g) * (1 - g));
}

describe('BJ247 ①②StripColors 色相循环 + StripWidth 半宽钉值（RainbowRodDrawer.cs:23-37）', () => {
  it('直飞 30 拍：全带逐点色/宽与参考转录逐值一致（p=j/(n−1),0=头）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 80 * TILE + 6000, y: 100 * TILE }, 0, 0, true);
    for (let t = 0; t < 30; t++) m.fixedUpdate(1 / 60, game);
    const T = 1000;
    (m as unknown as { globalT: number }).globalT = T;
    const { specs } = drawWithCapture(m);
    expect(specs).toHaveLength(1);
    const spec = specs[0];
    expect(spec.set).toBe('RainbowRod');                    // ④ 管线参数
    expect(spec.opacity).toBe(4);                           // UseOpacity(4f) :16
    expect(spec.time).toBe(T);                              // GlobalTimeWrappedHourly
    const pts = spec.pts;
    expect(pts.length).toBe(30);                            // 直带零补间（VertexStrip :85-89）
    for (let j = 0; j < pts.length; j++) {
      const p = j / (pts.length - 1);
      const [er, eg, eb] = stripColorsRef(p, T);
      expect(pts[j].r * 255).toBeCloseTo(er, 6);            // 色相循环逐 byte
      expect(pts[j].g * 255).toBeCloseTo(eg, 6);
      expect(pts[j].b * 255).toBeCloseTo(eb, 6);
      expect(pts[j].hw).toBeCloseTo(stripWidthRef(p), 9);   // 半宽逐值
    }
    // 特征钉值：头 hw=0（:36 Lerp(0,32,0)）、p≥0.2 恒 32 半宽、尾 rgb=0（fade<0 截断）
    expect(pts[0].hw).toBe(0);
    expect(pts[6].hw).toBe(32);                             // p=6/29≈0.207≥0.2
    const tail = pts[pts.length - 1];
    expect(tail.r).toBe(0); expect(tail.g).toBe(0); expect(tail.b).toBe(0);
  });

  it('色相参考自检：hue 0/1:6..5:6 = 纯彩虹轮（hslToRgb(·,1,.5) 钉值）', () => {
    expect(hueRef(0)).toEqual([255, 0, 0]);
    expect(hueRef(1 / 6)).toEqual([255, 255, 0]);
    expect(hueRef(2 / 6)).toEqual([0, 255, 0]);
    expect(hueRef(3 / 6)).toEqual([0, 255, 255]);
    expect(hueRef(4 / 6)).toEqual([0, 0, 255]);
    expect(hueRef(5 / 6)).toEqual([255, 0, 255]);
  });
});

describe('BJ247 ③PrepareStripWithProceduralPadding（VertexStrip.cs:85-107）', () => {
  function drawHandStrip(m: MagicMissileProj, pts: Array<{ x: number; y: number }>, rot0: number): TrailSpec {
    (m as unknown as { strip: Array<{ x: number; y: number }> }).strip = pts;
    (m as unknown as { rot: number }).rot = rot0;
    const { specs } = drawWithCapture(m);
    expect(specs).toHaveLength(1);
    return specs[0];
  }

  it('直角折带：π/4 段补 4 内插 + π/2 段补 7 内插（⌊|Δ|/(π/12)⌋+1 逐值）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 80 * TILE, y: 100 * TILE });
    // 手工带（[0]=最新,运动向=右行后急转上行）：p0=(0,−100) ←拐点 p1=(0,0)
    // ←p2=(100,0) ←p3=(200,0)——rot[i≥1]=指向邻新点方向：rot1=−π/2(上)、
    // rot2=rot3=π(左)；rot0=−π/4（AI rotation 钉值,转向滞后 π/4）
    const spec = drawHandStrip(m, [
      { x: 0, y: -100 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 },
    ], -Math.PI / 4);
    // 对(0,1)：Δ=π/4 → num3=3 → 4 内插；对(1,2)：Δ=π/2 → num3=6 → 7 内插；
    // 对(2,3)：Δ=0 → 0。计 4+4+7 = 15
    expect(spec.pts.length).toBe(15);
    // Catmull-Rom 曲线切角：拐点邻域内插点离两弦（x=0 竖弦/y=0 横弦）有偏移
    const curved = spec.pts.filter((q) => q.x !== 0 && q.y !== 0);
    expect(curved.length).toBeGreaterThan(0);
  });

  it('直带零补间（|Δrot|<15° 不插点,VertexStrip :86-89）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 80 * TILE, y: 100 * TILE });
    // [0]=最新=最右（右行）：rot[i≥1]=dir(邻新点)=+x → 全 0 → 零补间
    const spec = drawHandStrip(m, [
      { x: 40, y: 0 }, { x: 25, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 },
    ], 0);
    expect(spec.pts.length).toBe(4);
  });
});

describe('BJ247 ⑤旧 stroke 粗椭圆实现退役锁', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MissileProj.ts'), 'utf8');
  it('新管线在位：drawRainbowRodTrail + set RainbowRod + uOpacity 4', () => {
    expect(src).toContain('drawRainbowRodTrail');
    expect(src).toContain("set: 'RainbowRod'");
    expect(src).toContain('opacity: 4');
  });
  it('旧 stroke 签名禁入：半宽×2 全宽 64 式 / 私改 α=fade×0.8 系数', () => {
    expect(src).not.toContain('64 * (1 - (1 - wGrow)');
    expect(src).not.toContain('fade * 0.8');
    expect(src).not.toContain('hueToRgb(p * 1.6 - this.globalT);\n          const wGrow');
  });
});

describe('BJ247 ⑥头部（Main.cs:33231-33236 + 33498-33512 + 33558-33562）', () => {
  beforeEach(() => {
    setProjSpriteOverride(79, { width: 32, height: 32 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(79, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  function countLighterImgs(m: MagicMissileProj): { n: number; ops: string[] } {
    const recs: Array<{ op: string; imgs: number }> = [];
    let cur: { op: string; imgs: number } | null = null;
    const ctx = new Proxy({
      canvas: { width: 800, height: 600 },
      save() { recs.push(cur = { op: 'source-over', imgs: 0 }); },
      restore() { cur = null; },
      drawImage() { if (cur) cur.imgs++; },
    }, {
      get(t, k: string) {
        if (k === 'drawImage') return (t as unknown as Record<string, unknown>).drawImage;
        if (k === 'globalCompositeOperation') return cur ? cur.op : undefined;
        return (t as unknown as Record<string, unknown>)[k];
      },
      set(t, k: string, v) {
        if (k === 'globalCompositeOperation' && cur) cur.op = v as string;
        return true;
      },
    });
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx, queueTrailShade: () => { /* 队列捕获不入 ctx */ },
    });
    const lighter = recs.filter((r) => r.op === 'lighter');
    return { n: lighter.reduce((s, r) => s + r.imgs, 0), ops: lighter.map(() => 'lighter') };
  }

  it('spawn<13 拍：oldPos[12]=零槽 → 本体不可见（P.cs:731-735 清零+无预填）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 80 * TILE, y: 100 * TILE });
    for (let t = 0; t < 5; t++) m.fixedUpdate(1 / 60, game);
    expect(countLighterImgs(m).n).toBe(0);
  });

  it('悬停满亮：本体双绘 2 次（光环支尾 :33511+公共段 :33558,加算 2×亮）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 80 * TILE, y: 100 * TILE }, 0.01, 0, true);
    for (let t = 0; t < 14; t++) m.fixedUpdate(1 / 60, game);
    // node 环境无 canvas → 光环染色纹理 null 跳过（浏览器 6 团+本体 2 次）
    expect(countLighterImgs(m).n).toBe(2);
  });

  it('快速飞行：scale=GetLerpValue(32,0,dist)=0 → 头部不出画（:33234）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const { m } = mk79(game, { x: 90 * TILE, y: 100 * TILE }, 20, 0);
    for (let t = 0; t < 14; t++) m.fixedUpdate(1 / 60, game);
    expect(countLighterImgs(m).n).toBe(0);
  });
});
