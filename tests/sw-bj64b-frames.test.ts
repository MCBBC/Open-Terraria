// ★SW-BJ64b（2026-09-13）彩虹巨石 1047 视觉四面金标（帧账/切片/光照/旋转）。
// 用户实报："光效不对 + 滚动动画帧贴图不对，像多帧完整彩虹巨石贴图在滚动"。
// 根因定谳：RollingBoulder.draw 整图直绘（Projectile_1047.png 95×380 = 5 列×20 行
// 19×19 壳表）→ 100 帧壳全画 = 报告症状;且 AI 帧账/拖尾彩虹光/250 拖尾/Extra_55
// 星屑四缺。
// 金标锚（1457=1458 同域逐字,2026-09-13 对拍）：
//   切片  Main.cs:33209 Frame(5,20, frame/20, frame%20) + Utils.cs:1389 Frame 直译
//   缩放  Main.cs:33208 vector82 *= 2f（SetDefaults scale=1 → 绘制 38×38）
//   帧账  P.cs:26414-26418 frameCounter 每 2t 一帧、frame 环 0..99
//   光照  P.cs:26420-26435 hsl(((GTW×120)%300)/300,1,0.6)×1.4×(1−i/10) 沿 oldPos
//         CastLightOpen（DelegateMethods.cs:729-742 实心体格不吃光）
//   旋转  P.cs:26549-26551 type!=1055 → rotation += velocity.X*0.06（既有存量面）
//   全亮  P.cs:80967 GetAlpha(1047) = (255,255,255,255)
// 变异实验（判别力）：每断言附注被击杀的变异体（整图直绘/轴反转/逐帧推进/恒光/
//   l=0.5 色度漂移/实心格透光）。
import { describe, it, expect } from 'vitest';
import { RollingBoulder, rainbowBoulderCell, rainbowBoulderLight } from '../src/entities/RollingBoulder';
import { TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const EPS = 1e-9;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- 夹具：全空场 + 可打点 store（CastLightOpen 门消费） ----
function fakeStore(solidAt?: Set<number>, platformAt?: Set<number>) {
  const w = 64, h = 64;
  const solidId = TILE_DEFS.findIndex((d) => d && d.solid && !d.platform);
  const platId = TILE_DEFS.findIndex((d) => d && d.platform);
  const cells = new Map<number, number>();
  for (const c of solidAt ?? []) cells.set(c, solidId);
  for (const c of platformAt ?? []) cells.set(c, platId);
  return {
    w, h,
    type: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
    half: new Uint8Array(w * h),
    liquid: new Float32Array(w * h),
    liquidType: new Float32Array(w * h),
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: (_x: number, _y: number) => false,
    // ★SW-BJ67：isPlatform/isActive 补面——D5 动态门（P.cs:26437）落库后 1047
    //  空场 tileCollide=true → moveAndCollide 实跑,store 面补齐（断言面零变化）
    isPlatform: (_x: number, _y: number) => false,
    isActive: (x: number, y: number) => cells.has(y * w + x),
    hasTile: (x: number, y: number) => cells.has(y * w + x),
    isActuated: () => false,
    get: (x: number, y: number) => cells.get(y * w + x) ?? 0,
  };
}

function fakeGame(store: ReturnType<typeof fakeStore>) {
  const lights: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];
  const g = {
    world: { store, w: store.w, h: store.h },
    player: { dead: true, x: -9999, y: -9999, w: 1, h: 1, cx: -9999, cy: -9999 },
    enemies: () => [] as unknown[],
    critters: () => [] as unknown[],
    npcs: () => [] as unknown[],
    spawnParticles: () => {},
    playSfx: () => {},
    damagePlayer: () => 0,
    addLightAt: (x: number, y: number, r: number, g2: number, b: number) => {
      lights.push({ x, y, r, g: g2, b });
    },
    lights,
  };
  return g as unknown as GameHooks & { lights: typeof lights };
}

const mkBoulder = (sheet = 711): RollingBoulder => {
  const b = new RollingBoulder(104, 104, sheet);   // 711 → proj 1047
  (b as unknown as { tileCollide?: boolean }).tileCollide = false;   // 纯积分（不测碰撞）
  return b;
};

// ================= ① 切片金标（Main.cs:33209 + Utils.cs:1389） =================
describe('SW-BJ64b 1047 切片数学（Frame(5,20, f/20, f%20)）', () => {
  it('金标点：帧 0/19/20/21/99 → 精确源矩形（列=f/20 色相带、行=f%20 微光相）', () => {
    expect(rainbowBoulderCell(0)).toEqual({ sx: 0, sy: 0, sw: 19, sh: 19 });
    expect(rainbowBoulderCell(19)).toEqual({ sx: 0, sy: 19 * 19, sw: 19, sh: 19 });
    expect(rainbowBoulderCell(20)).toEqual({ sx: 19, sy: 0, sw: 19, sh: 19 });
    expect(rainbowBoulderCell(21)).toEqual({ sx: 19, sy: 19, sw: 19, sh: 19 });
    expect(rainbowBoulderCell(99)).toEqual({ sx: 4 * 19, sy: 19 * 19, sw: 19, sh: 19 });
  });

  it('帧账全域：frame 0..99 与 5×20 壳表恰好双射（AI 环 0..99,P.cs:26417-26418）', () => {
    const seen = new Set<string>();
    for (let f = 0; f < 100; f++) {
      const c = rainbowBoulderCell(f);
      expect(c.sw).toBe(19);
      expect(c.sh).toBe(19);
      seen.add(`${c.sx},${c.sy}`);
    }
    expect(seen.size).toBe(100);
  });

  it('环回：frame 100 ≡ 0（P.cs:26417 `if (++frame >= 100) frame = 0`）', () => {
    expect(rainbowBoulderCell(100)).toEqual(rainbowBoulderCell(0));
    expect(rainbowBoulderCell(119)).toEqual(rainbowBoulderCell(19));
  });

  it('变异①整图直绘（实报症状：多帧完整贴图滚动）→ 帧宽 19 ≠ 整图 95/380', () => {
    // 整图直绘变异体 = sw:95,sh:380;本断言击杀之
    const c = rainbowBoulderCell(0);
    expect(c.sw).toBe(19);
    expect(c.sh).toBe(19);
    expect(c.sw).toBeLessThan(95);
    expect(c.sh).toBeLessThan(380);
  });

  it('变异②轴反转（行当列读）→ 帧 20 必须 sx=19,sy=0（非 sx=0,sy=19）', () => {
    const c = rainbowBoulderCell(20);
    expect(c.sx).toBe(19);
    expect(c.sy).toBe(0);
  });

  it('变异③非 5×20 网格（如 NPC 竖排帧/2×2）→ 网格常数钉死', () => {
    // 2×2 变异体给 sw=47.5;3 列变异给 31.67——帧宽恒 19 击杀之
    for (const f of [0, 7, 33, 64, 99]) {
      expect(rainbowBoulderCell(f).sw).toBe(19);
      expect(rainbowBoulderCell(f).sh).toBe(19);
    }
  });
});

// ================= ② 帧账（P.cs:26414-26418 每 2t 一帧） =================
describe('SW-BJ64b 1047 帧账（frameCounter 每 2t 前进、环 0..99）', () => {
  it('fixedUpdate 逐拍：frame(t) = floor(t/2) % 100（首拍 frame 保持 0）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(711);
    const expectAt: Array<[number, number]> = [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [8, 4]];
    let t = 0;
    for (const [tick, want] of expectAt) {
      while (t < tick) { b.fixedUpdate(1 / 60, game); t++; }
      expect(b.frame).toBe(want);
    }
  });

  it('200t 恰满一环：frame(199)=99、frame(200)=0', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(711);
    for (let t = 0; t < 199; t++) b.fixedUpdate(1 / 60, game);
    expect(b.frame).toBe(99);
    b.fixedUpdate(1 / 60, game);
    expect(b.frame).toBe(0);
  });

  it('变异④逐帧推进（漏 2t 计数门）→ 首拍即 1 = 红', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(711);
    b.fixedUpdate(1 / 60, game);
    expect(b.frame).toBe(0);     // 逐帧推进变异体此处给 1
  });

  it('家族余员（99 仙人掌/727）不进 1047 专支：frame 恒 0（无壳表消费）', () => {
    const game = fakeGame(fakeStore());
    for (const sheet of [138, 484, 664, 713, 715, 716]) {
      const b = mkBoulder(sheet);
      for (let t = 0; t < 10; t++) b.fixedUpdate(1 / 60, game);
      expect(b.frame).toBe(0);
    }
  });
});

// ================= ③ 光照金标（P.cs:26420-26435） =================
describe('SW-BJ64b 1047 拖尾彩虹光（hsl(hue,1,0.6)×1.4×(1−i/10)）', () => {
  it('金标点：hue=0（gtw=0）→ 红相 (1.0,0.2,0.2)×1.4 = (1.4,0.28,0.28)', () => {
    const [r, g, b] = rainbowBoulderLight(0, 0);
    expect(near(r, 1.4)).toBe(true);
    expect(near(g, 0.28)).toBe(true);
    expect(near(b, 0.28)).toBe(true);
  });

  it('金标点：hue=0.5（gtw=1.25）→ 青相 (0.2,1.0,1.0)×1.4', () => {
    const [r, g, b] = rainbowBoulderLight(1.25, 0);
    expect(near(r, 0.28)).toBe(true);
    expect(near(g, 1.4)).toBe(true);
    expect(near(b, 1.4)).toBe(true);
  });

  it('尾衰减：(1−i/10) 线性（num208 Remap × num207²≡1）——i=5 折半、i=10 归零', () => {
    for (let i = 0; i <= 10; i++) {
      const [r0, , ] = rainbowBoulderLight(0, 0);
      const [ri, , ] = rainbowBoulderLight(0, i);
      expect(ri / r0).closeTo(1 - i / 10, 1e-9);
    }
    const [r10] = rainbowBoulderLight(0, 10);
    expect(near(r10, 0)).toBe(true);
  });

  it('色相周期：GTW×120%300 → 2.5s 一环（L(t)≡L(t+2.5)）', () => {
    const a = rainbowBoulderLight(7.3, 2);
    const b2 = rainbowBoulderLight(7.3 + 2.5, 2);
    expect(a.every((v, i) => near(v, b2[i]))).toBe(true);
  });

  it('变异⑤恒光（漏尾衰减）→ i=5 比值必 0.5;变异⑥l=0.5 色度漂移 → hue0 g=0.28 非 0', () => {
    const [r0, g0] = rainbowBoulderLight(0, 0);
    const [r5] = rainbowBoulderLight(0, 5);
    expect(r5 / r0).not.toBe(1);          // ⑤ 恒光变异体此处给 1
    expect(near(g0, 0.28)).toBe(true);    // ⑥ l=0.5 变异体给 0（(1,0,0)×1.4）
  });
});

// ================= ④ 实体接线：拖尾捕获 + CastLightOpen 门 =================
describe('SW-BJ64b 实体接线（TrailingMode[1047]=0 旧位环 + 实心体格不吃光）', () => {
  it('拖尾捕获：位移后 [0]=本拍位、逐拍 shift、trailN 10 封顶', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(711);
    b.vx = 2; b.vy = 0;
    for (let t = 0; t < 15; t++) b.fixedUpdate(1 / 60, game);
    const inner = b as unknown as { trailX: number[]; trailY: number[]; trailN: number };
    expect(inner.trailN).toBe(10);
    expect(near(inner.trailX[0], b.x, 1e-6)).toBe(true);
    // shift 序：越旧越靠后（x 单调向右 → trailX 严格递减）
    for (let i = 1; i < 10; i++) expect(inner.trailX[i]).toBeLessThan(inner.trailX[i - 1]);
  });

  it('空场发光：trailN 段逐点 addLightAt（首拍 0 点 → 次拍 1 点 → 三拍 2 点;累计账）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(711);
    b.vx = 2; b.vy = 0;
    b.fixedUpdate(1 / 60, game);
    expect(game.lights.length).toBe(0);          // 首拍 trail 空 ≡ 原版 Zero 哨兵
    b.fixedUpdate(1 / 60, game);
    expect(game.lights.length).toBe(1);
    const inner = b as unknown as { trailN: number; trailX: number[]; trailY: number[] };
    // 三拍前钉住推送时的最新旧位点（滚地加速每拍 vx+=0.05,先取快照免漂移）
    const preX = inner.trailX[0] + b.w / 2, preY = inner.trailY[0] + b.h / 2;
    b.fixedUpdate(1 / 60, game);
    expect(game.lights.length).toBe(3);          // 累计 0+1+2
    expect(inner.trailN).toBe(3);
    // 首推灯位 = 推送时 trailX[0]（快照对账）
    const L = game.lights[1]!;                   // lights[0] = 次拍推送
    expect(L.x).toBe(preX);
    expect(L.y).toBe(preY);
  });

  it('CastLightOpen 门：实心格挡光、平台格（solidTop）透光（DelegateMethods.cs:737-741）', () => {
    const cx = Math.floor((104 + 31 / 2) / 16);
    const cy = Math.floor((104 + 31 / 2) / 16);
    const solidSet = new Set([cy * 64 + cx]);
    // ① 实心格：光被吃（独立弹体 × 独立灯账,末拍 delta 断言）
    const b1 = mkBoulder(711);
    b1.vx = 0; b1.vy = 0;
    const gSolid = fakeGame(fakeStore(solidSet));
    for (let t = 0; t < 4; t++) b1.fixedUpdate(1 / 60, gSolid);
    expect(gSolid.lights.length).toBe(0);
    // ② 平台格：透光（tileSolidTop=true → CastLightOpen 放行）
    const b2 = mkBoulder(711);
    b2.vx = 0; b2.vy = 0;
    const gPlat = fakeGame(fakeStore(new Set(), solidSet));
    for (let t = 0; t < 3; t++) b2.fixedUpdate(1 / 60, gPlat);
    expect(gPlat.lights.length).toBe(0 + 1 + 2);          // 三拍累计
    // ③ 空气：透光（对照）
    const b3 = mkBoulder(711);
    b3.vx = 0; b3.vy = 0;
    const gAir = fakeGame(fakeStore());
    for (let t = 0; t < 3; t++) b3.fixedUpdate(1 / 60, gAir);
    expect(gAir.lights.length).toBe(0 + 1 + 2);
  });

  it('变异⑦实心格透光 → 实心夹具 3 拍恒 0 灯被击杀（透光变异体给 2 灯）', () => {
    const b = mkBoulder(711);
    b.vx = 0; b.vy = 0;
    const cx = Math.floor((b.x + b.w / 2) / 16);
    const cy = Math.floor((b.y + b.h / 2) / 16);
    const gSolid = fakeGame(fakeStore(new Set([cy * 64 + cx])));
    for (let t = 0; t < 3; t++) b.fixedUpdate(1 / 60, gSolid);
    expect(gSolid.lights.length).toBe(0);
  });
});

// ================= ⑤ 素材双锚：壳表真身 5×20（贴图域金标） =================
describe('SW-BJ64b 素材双锚（贴图尺寸=切片前提）', () => {
  it('Projectile_1047.png 95×380 → 5×20 网格恰除尽（19×19 壳）', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const root = join(fileURLToPath(import.meta.url), '..', '..');
    const buf = readFileSync(join(root, 'public/sprites/vanilla/Projectile_1047.png'));
    // PNG IHDR：宽 @16..19、高 @20..23（大端）
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(95);
    expect(h).toBe(380);
    expect(w % 5).toBe(0);
    expect(h % 20).toBe(0);
    expect(rainbowBoulderCell(0, w, h).sw).toBe(19);
  });
});
