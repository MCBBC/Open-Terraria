// BJ310（2026-09-23，用户实报双件）：①猪鲨冲刺粒子面 ②狂暴模式参数面
// 件 1 判谳=真缺（非 BJ244 飞龙式原版本相）：原版冲刺态 ai0=1/6/11 每 tick 7 粒
//   d172（NPC.cs:49696-49708 / :49964-49976 / :50171-50189,1456 :49544-49554 系同构,
//   1457≡1458 逐字节全等复核）——旧实现 2 粒 #8FD8FF 泛用 spawnParticles（case6/11
//   连偏移都没有）=d172 尾流整缺。本测试钉：数量/型/α/scale/noGravity/noLight/
//   扇形几何（组件乘基向量+RotatedBy 非对称扇 (j−2)π/7）/后置速度 (=原速/4−npc速度)。
// 件 2 判谳=参数面已 1:1（R2-F1/批4 既往刀已收口），本文件补钉既有套件缺位的三面：
//   flag4（ai0>9）档速表 27/25、狂暴 flag6 冲速 +6、态10 悬浮侧偏 360 与态12 瞬移落点。
// 反编译锚：1457 NPC.cs :49295-50279 / Dust.cs :670-684(d172 蓝光)/ :2623-2626(GetAlpha
//   常量 250,250,250,150) / Main.cs :39501 DrawDust。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { dukeFishronAI } from '../src/entities/bossAI_duke_moonlord';
import { VanillaDust } from '../src/fx/VanillaDust';
import type { GameHooks } from '../src/entities/types';
import type { VDust } from '../src/fx/VanillaDust';

const W = 120, H = 260;

function makeWorld(difficulty = 0): World {
  const w = new World(W, H, 7, 'duke-bj310');
  w.groundLevel = 60;
  w.difficulty = difficulty;
  return w;
}

interface DustRec {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number; noGravity: boolean;
}
interface DustHandle { noLight: boolean; vx: number; vy: number; rawVx: number; rawVy: number }

/** spawnDust 录制桩：模拟 NewDust 0×0 盒链（位 +4、±2 速抖）并返回可变句柄 */
function makeDustRecorder() {
  const calls: DustRec[] = [];
  const handles: DustHandle[] = [];
  const spawnDust = (
    x: number, y: number, w: number, h: number, type: number,
    sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1, noGravity = false,
  ): VDust | null => {
    calls.push({ x, y, w, h, type, sx, sy, alpha, scale, noGravity });
    const jx = ((Math.random() * 41 | 0) - 20) * 0.1;
    const jy = ((Math.random() * 41 | 0) - 20) * 0.1;
    handles.push({ noLight: false, vx: jx + sx, vy: jy + sy, rawVx: jx + sx, rawVy: jy + sy });
    return handles[handles.length - 1] as unknown as VDust;
  };
  return { calls, handles, spawnDust };
}

function makeHooks(world: World, playerAt: { x: number; y: number }, rec = makeDustRecorder()) {
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: { has: () => false } as unknown as never,
  };
  const hooks = {
    world, player,
    scene: {},
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: rec.spawnDust,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { hooks, player, rec };
}

function tickDuke(e: Enemy, hooks: GameHooks, n: number): void {
  const p = (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player;
  for (let i = 0; i < n; i++) dukeFishronAI(e, hooks, p);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ310 件1：冲刺尾流 7×d172（:49696-49708 三态同构）', () => {
  it('态1 冲撞每 tick 恰 7 粒 d172：α100/scale1.4/0×0 盒/noGravity,后置 noLight+速度=原速/4−npc速度', () => {
    const rec = makeDustRecorder();
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 }, rec);
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.vx = 16; e.vy = 0;   // 直置冲撞态(速度在态内不被改写)
    const vx0 = e.vx, vy0 = e.vy;
    tickDuke(e, hooks, 1);
    expect(rec.calls.length).toBe(7);                        // num29=7 :49698
    for (const c of rec.calls) {
      expect(c.type).toBe(172);                              // :49703 NewDust type
      expect(c.alpha).toBe(100);                             // :49703 Alpha 参
      expect(c.scale).toBe(1.4);                             // :49703 Scale 参
      expect(c.w).toBe(0); expect(c.h).toBe(0);              // 0×0 盒(:49703)
      expect(c.noGravity).toBe(true);                        // :49704 后置
    }
    // 后置覆写(:49705-49708)：noLight + velocity=(抖动+v5·2)/4 − npc 速度
    for (const d of rec.handles) {
      expect(d.noLight).toBe(true);
      expect(Math.abs(d.vx + vx0 - d.rawVx / 4)).toBeLessThan(1e-9);
      expect(Math.abs(d.vy + vy0 - d.rawVy / 4)).toBeLessThan(1e-9);
    }
    expect(rec.handles.length).toBe(7);
  });

  it('扇形几何：v=(16,0) → 基向量 ⊙((w+50)/2,h)·0.75=75,旋转角 (j−2)π/7（非对称扇）;随机扇偏移钉', () => {
    const rec = makeDustRecorder();
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 }, rec);
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.vx = 16; e.vy = 0;
    const cx0 = e.cx, cy0 = e.cy;   // 原版尘用【积分前】center(AI 先于 position+=velocity)
    // 钉随机扇：rand()=0.5 → a5=0、m5=3+floor(2.5)=5 → v5=(5,0)
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    tickDuke(e, hooks, 1);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(14);   // 7 粒×2 掷
    const nv = Math.hypot(e.vx, e.vy);
    for (let j = 0; j < 7; j++) {
      const ang = (j - 2) * Math.PI / 7;                       // num29/2−1=2(整除)——非对称扇
      const bx = (e.vx / nv) * ((e.w + 50) / 2) * 0.75, by = (e.vy / nv) * e.h * 0.75;
      const rx = bx * Math.cos(ang) - by * Math.sin(ang), ry = bx * Math.sin(ang) + by * Math.cos(ang);
      // 调用参数 = center(积分前) + 旋转扇 + v5(+4 盒偏移在 VanillaDust.spawn 内部,不入参)
      expect(rec.calls[j].x).toBeCloseTo(cx0 + rx + 5, 6);
      expect(rec.calls[j].y).toBeCloseTo(cy0 + ry, 6);
    }
    // 角集合逐字钉（防退化为对称扇/均匀环）
    expect(rec.calls[0].x).toBeCloseTo(cx0 + 75 * Math.cos(-2 * Math.PI / 7) + 5, 6);
    expect(rec.calls[6].x).toBeCloseTo(cx0 + 75 * Math.cos(4 * Math.PI / 7) + 5, 6);
  });

  it('组件乘分臂：v=(0,16) → h 臂 75 独立生效(RB12a 组件乘家族钉)', () => {
    const rec = makeDustRecorder();
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 }, rec);
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.vx = 0; e.vy = 16;
    const cx0 = e.cx, cy0 = e.cy;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    tickDuke(e, hooks, 1);
    const nv = Math.hypot(e.vx, e.vy);
    for (let j = 0; j < 7; j++) {
      const ang = (j - 2) * Math.PI / 7;
      const bx = (e.vx / nv) * ((e.w + 50) / 2) * 0.75, by = (e.vy / nv) * e.h * 0.75;
      const rx = bx * Math.cos(ang) - by * Math.sin(ang), ry = bx * Math.sin(ang) + by * Math.cos(ang);
      expect(rec.calls[j].x).toBeCloseTo(cx0 + rx + 5, 6);
      expect(rec.calls[j].y).toBeCloseTo(cy0 + ry, 6);
    }
  });

  it('三态同相：态6/态11 各 7 粒 d172（:49964-49976 / :50171-50189）', () => {
    for (const st of [6, 11]) {
      const rec = makeDustRecorder();
      const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 }, rec);
      const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
      e.bInit = true;
      e.ai0 = st; e.ai1 = 0; e.ai2 = 0; e.vx = 16; e.vy = 0;
      tickDuke(e, hooks, 1);
      expect(rec.calls.length).toBe(7);
      expect(rec.calls.every((c) => c.type === 172 && c.alpha === 100 && c.scale === 1.4)).toBe(true);
    }
  });

  it('负 face：悬浮态(0) 零 spawnDust(尘只在冲刺支)', () => {
    const rec = makeDustRecorder();
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 }, rec);
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 300; e.ai2 = 0; e.vx = 0; e.vy = 0;
    tickDuke(e, hooks, 5);
    expect(rec.calls.length).toBe(0);
  });
});

describe('BJ310 件1 引擎侧：d172 GetAlpha 常量档 + 蓝光独立段', () => {
  it('alphaOf(172) = (250,250,250,150) 常量档（Dust.cs:2623-2626）——旧落 default 压暗档', () => {
    const a = VanillaDust.alphaOf({ type: 172, alpha: 100 } as VDust);
    expect(a.rgb).toBeCloseTo(250 / 255, 9);
    expect(a.a).toBeCloseTo(150 / 255, 9);
    // 与 default 档 (255−α)/255 分离判别
    expect(a.rgb).not.toBeCloseTo(155 / 255, 3);
  });

  it('update 独立段：d172 蓝光 (0,.25k,k) k=min(scale·0.5,1) 无 noLight 门 + vx×0.99(:670-684/:2136)', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 0, 0, 172, 4, -2, 100, null, 1.4);
    expect(d).not.toBeNull();
    d!.noGravity = true; d!.noLight = true;                    // 尾流后置双旗
    const scalePre = d!.scale;                                 // AddLight 读【老化前】scale(:670 在 :2148 前)
    const vxPre = d!.vx, vyPre = d!.vy;                        // 含 spawn ±2 抖动
    vd.update(0, 0, 100000, 100000);
    const k = Math.min(scalePre * 0.5, 1);
    const hit = vd.lights.find((l) => Math.abs(l.x - d!.x) < 0.01 && Math.abs(l.y - d!.y) < 0.01);
    expect(hit).toBeDefined();
    expect(hit!.r).toBe(0);
    expect(hit!.g).toBeCloseTo(k * 0.25, 9);
    expect(hit!.b).toBeCloseTo(k, 9);
    expect(d!.vx).toBeCloseTo(vxPre * 0.99 * 0.92, 9);         // :2136 ×0.99(独立段显式乘) → 链 B 兜底 ×0.92(noGravity) 净 ×0.9108
    expect(d!.vy).toBeCloseTo(vyPre * 0.92, 9);                // vy 只吃链 B ×0.92
  });
});

describe('BJ310 件2：狂暴参数面补钉（既有套件缺位三面）', () => {
  it('flag4（ai0>9）档速表：悬浮 30t/0.7/12、冲撞 25t@27（:49325-49346）', () => {
    const { hooks } = makeHooks(makeWorld(1), { x: 24, y: 55 });   // expert
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.spawnAlpha = 255;   // 狂暴段悬浮
    tickDuke(e, hooks, 30);
    expect(e.ai0).toBe(11);                                    // hoverT=30(:49327) → 冲撞
    expect(Math.abs(Math.hypot(e.vx, e.vy) - 27)).toBeLessThan(0.01);   // chargeSpd=27(:49344)
    tickDuke(e, hooks, 25);
    expect(e.ai0).toBe(10);                                    // chargeT=25(:49343) 回悬浮
    tickDuke(e, hooks, 30);
    expect(e.ai0).toBe(12);                                    // a3=1 → 瞬移档(:50133-50137)
  });

  it('狂暴 flag6 冲速 +6：经典 16→22（:49396 num7+=6 在档位之后加算）', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 24, y: 3 });     // y=3 格=太空 → flag6
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 300; e.ai2 = 0; e.ai3 = 0;
    tickDuke(e, hooks, 10);                                    // 狂暴 hoverT=10 → pick 冲撞
    expect(e.ai0).toBe(1);
    expect(Math.abs(Math.hypot(e.vx, e.vy) - 22)).toBeLessThan(0.01);   // 16+6
  });

  it('态10 悬浮侧偏 360（:50097 非 300）+ 态12 中点瞬移落点 = 玩家+(−ai1,−200)（:50224-50225）', () => {
    const { hooks, player } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.spawnAlpha = 255;
    tickDuke(e, hooks, 1);
    expect(Math.abs(Math.abs(e.ai1) - 360)).toBeLessThan(1e-9);    // 侧偏 360
    // 态12：ai2 预置 15(=num15/2, tick 头判定先于 ++) + 清速防尾积分漂移
    e.ai0 = 12; e.ai1 = -300; e.ai2 = 15; e.vx = 0; e.vy = 0;
    const pcx = player.cx, pcy = player.cy;
    tickDuke(e, hooks, 1);
    expect(e.cx).toBeCloseTo(pcx + 300, 6);                    // −ai1 = +300
    expect(e.cy).toBeCloseTo(pcy - 200, 6);
  });
});

// ===========================================================================
// ★BJ342 ND4（2026-09-25）出生尘环落点 = Center + 2×rotOffset（1457 NPC.cs:49548-
// 49556 `Dust.NewDust(vector + vector2,…)`——vector=Center+rotOffset、vector2=
// vector−Center ⇒ 落点=(Center+off)+off）。速度面（=Normalize(vector2)×3）与
// 环几何（36 粒/(i−17)·2π/36）不变——旧 1× 环半径减半=红。
// ===========================================================================
describe('BJ342 ND4：出生尘环 2× rotOffset（NPC.cs:49548-49556）', () => {
  it('36 粒位置 = Center + 2×[Normalize(v)·(w/2,h)·0.375].RotatedBy((i−17)·2π/36)；速度=径向 3 不变', () => {
    const parts: Array<{ x: number; y: number; opts: { vx: number; vy: number } }> = [];
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    (hooks as unknown as { spawnParticles: (x: number, y: number, c: unknown, n: unknown, s: unknown, opts: { vx: number; vy: number }) => void }).spawnParticles =
      (x, y, _c, _n, _s, opts) => { parts.push({ x, y, opts }); };
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = -1; e.ai1 = 0; e.ai2 = 60;   // nadoT(90)−30 出生环拍（分支判定先于 ai2++）
    e.spawnAlpha = 255;
    e.vx = 10; e.vy = 0;
    const cx0 = e.cx, cy0 = e.cy;   // 原版尘用【积分前】center（AI 尾 position+=velocity 在环之后）
    tickDuke(e, hooks, 1);
    expect(parts.length).toBe(36);
    // 出生支前置：vx×0.98 + ai2>20 → vy=−2（环基向量取该拍速度）
    const vx = 10 * 0.98, vy = -2;
    const nv = Math.hypot(vx, vy);
    for (let i = 0; i < 36; i++) {
      const ang = (i - 17) * (Math.PI * 2) / 36;
      const bx = (vx / nv) * (e.w / 2) * 0.375, by = (vy / nv) * e.h * 0.375;
      const rx = bx * Math.cos(ang) - by * Math.sin(ang), ry = bx * Math.sin(ang) + by * Math.cos(ang);
      const ol = Math.hypot(rx, ry) || 1;
      expect(parts[i].x).toBeCloseTo(cx0 + 2 * rx, 6);       // ★2× rotOffset（旧 1× 红）
      expect(parts[i].y).toBeCloseTo(cy0 + 2 * ry, 6);
      expect(parts[i].opts.vx).toBeCloseTo((rx / ol) * 3, 6);
      expect(parts[i].opts.vy).toBeCloseTo((ry / ol) * 3, 6);
    }
  });
});
