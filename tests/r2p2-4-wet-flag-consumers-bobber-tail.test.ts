// R2 P2-4 + B1 三刀回归（2026-09-07 蓝队 L）。权威 = 1.4.5.7 反编译：
//   ① 655 蜂巢 AI_025 入水 Kill 读【湿段维护旗】（Projectile.cs:26752 `else if (wet &&
//      type == 655) Kill()`——AI(:16880) 在子步内先于湿段(:16903),读的是上一子步采样
//      wet(P_{k-1}),出生预置 :10886-10892 为初值）——旧当拍 wetCollision 直探退役
//      （直探读当拍位 = 较原版早 1 拍入水爆,且绕过湿段旗维护）。断言：入水溅花拍
//      （湿段首采样到液=拍 k）与死亡拍分离（k+1）——直探版同拍死。
//   ② 1049 霰石湿段逐【子步】（extraUpdates=1 :9949 → 原版每拍 2 子步,湿段 :16903 在
//      numUpdates 子步环 :16781-17345 内 → 每拍 2 次;wetCount :17109-17112 逐子步 −1
//      → 10 计窗=5 拍）——旧每拍 1 次（窗 10 拍）。断言：wetCount 每拍 −2 / 10→0 恰
//      5 拍 / 跨水缘当拍（步 2 采样=上一子步位移末位）入水溅花。
//   ③ 浮漂浮支收敛尾 XNA float32 语义（:54699-54740 全 fl32 站点 Math.fround 模拟 +
//      UpdatePosition :20555 position += wetVelocity 的 fl32 和取整）——float64 收敛
//      尾要降到 ULP64(y≈2048)≈4.5e-13 才撞墙（实测 46 拍落地）,fl32 在 ULP32≈2.4e-4
//      即落地（实测 17 拍）→ 咬钩重抖/重溅节拍 123t vs 原版 59t（三臂仿真对拍）。断言：
//      settled 收敛 vy 精确 ===0 且 ≤30 拍落地。
//   ④ 饵 2673 松露虫渔情警告每拍写（AI_061 :54754-54757——位=物理后/累积咬钩前,
//      飞行段同写;显示侧 Main.cs:47727 浮标在场只读 displayedFishingInfo 粘性缓存,
//      本仓 Game.tickInfoAccs 同构）——旧仅 FishingCheck（:20743）写 = 抛竿后头几秒
//      显示残留旧渔力行。断言：浮态/飞行态每拍写 + 非松露虫饵不冲粘性缓存。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { TrapShot } from '../src/entities/Dart';
import { GrenadeProj } from '../src/entities/WeaponProj';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Lang } from '../src/i18n/Lang';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const LIQ = 255;

beforeAll(async () => { await Lang.init('zh-Hans').catch(() => undefined); });

function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  return w;
}

/** 水带：列 [x0..x1] 行 [y0..y1] 满格液体（type 0=水） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = 0;
    }
  }
}

/** stub game：可变尘桩（湿段溅花绝对覆写面要有着落,return-null 桩反向陷阱）+
 *  Splash 音捕获。player 死桩（hostile 命中面静默）。 */
function mkGame(w: World): { g: GameHooks; splash: string[]; dust: number[] } {
  const splash: string[] = [];
  const dust: number[] = [];
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      dust.push(type);
      return { x, y, w: bw, h: bh, type, vx: 1, vy: 1, scale: 1, alpha: 0, fadeIn: 0,
        noGravity: false, noLight: false, color: null };
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, hitTilesFx: () => {},
  } as unknown as GameHooks;
  return { g, splash, dust };
}

// =====================================================================
// ① 655 蜂巢：AI_025 入水 Kill 读湿段维护旗（:26752）
// =====================================================================
describe('655 蜂巢入水 Kill=上拍湿段旗（:26752,R2 P2-4 直探退役）', () => {
  it('溅花拍 k 与死亡拍 k+1 分离（湿段首采样拍 AI 已跑过=上拍干旗;直探版同拍死）', () => {
    const w = mkWorld();
    liquidAt(w, 30, 40, 60, 70);                       // 水带 px [480,656]×[960,1136]
    const { g, splash } = mkGame(w);
    const bee: Array<{ wet: boolean }> = [];
    const p = new GrenadeProj(560, 880, 0, 2, 100, 3600, 655, () => {});   // 带上方干区直落
    p.onBeehiveKill = (wet) => { bee.push({ wet }); };
    let splashTick = -1, deadTick = -1;
    for (let t = 1; t <= 120 && deadTick < 0; t++) {
      p.fixedUpdate(1 / 60, g);
      if (splashTick < 0 && splash.includes('Splash_1')) splashTick = t;
      if (p.dead) deadTick = t;
    }
    expect(splashTick).toBeGreaterThan(0);             // 入水溅花确曾发生
    expect(deadTick).toBe(splashTick + 1);             // ★滞后一拍 = 原版 AI 读上子步旗
    expect(bee.length).toBe(1);
    expect(bee[0].wet).toBe(true);                     // Kill wet 分支落蜂巢块（:76626）
  });

  it('干飞 40 拍不误杀（湿旗恒 false——维护旗非当拍直探的负面守卫）', () => {
    const w = mkWorld();
    const { g } = mkGame(w);
    const p = new GrenadeProj(100, 200, 0, 2, 100, 3600, 655, () => {});   // 干列直落
    for (let t = 0; t < 40; t++) p.fixedUpdate(1 / 60, g);
    expect(p.dead).toBe(false);
  });
});

// =====================================================================
// ② 1049 霰石：湿段逐子步（extraUpdates=1 → 每拍 2 次）
// =====================================================================
describe('1049 湿段逐子步（:16903 子步环内,R2 P2-4 每拍 vs 每子步）', () => {
  it('wetCount 每拍 −2（旧每拍 −1）', () => {
    const w = mkWorld();
    const { g } = mkGame(w);
    const h = new TrapShot(440, 900, 8, 0, 30, 'hail');    // 干区
    h.wetCount = 3;
    h.fixedUpdate(1 / 60, g);
    expect(h.wetCount).toBe(1);
  });

  it('10 计窗 = 恰 5 拍清零（:17109-17112 逐子步 −1 ×2/拍）', () => {
    const w = mkWorld();
    const { g } = mkGame(w);
    const h = new TrapShot(440, 900, 8, 0, 30, 'hail');
    h.wetCount = 10;
    for (let k = 0; k < 5; k++) h.fixedUpdate(1 / 60, g);
    expect(h.wetCount).toBe(0);
  });

  it('步 2 采样=上一子步位移末位：跨水缘当拍入水溅花（旧拍头单采样晚 1 拍）', () => {
    const w = mkWorld();
    liquidAt(w, 30, 40, 60, 70);
    const { g, splash } = mkGame(w);
    // P1 探盒 [455,465] 干（列 28/29）;vx=24 → 步 1 后 px=472,探盒 [479,489] 入列 30
    const h = new TrapShot(448, 950, 24, 0, 30, 'hail');
    h.fixedUpdate(1 / 60, g);
    expect(splash.filter((s) => s === 'Splash_1').length).toBe(1);   // :16948 门当拍溅
    expect(h.wet).toBe(true);                                        // :17020
  });
});

// =====================================================================
// ③ 浮漂浮支收敛尾 = XNA float32（:54699-54740 + :20555,B1）
// =====================================================================

// 浮漂专用池：rows 40..42、L=255（湿段扫描钳窗 h−40 内,Collision.cs:1596）
function mkBobberHarnessInner() {
  const w = mkWorld();
  liquidAt(w, 40, 69, 40, 42);                 // 30 宽 ×3 深 = 90 格 ≥75（池门）
  const player = new Player(50 * TILE, 36 * TILE, new Inventory());
  const ROD_2289 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!;
  player.inv.selected = 5;
  player.inv.slots[5] = { id: ROD_2289, stack: 1 };
  const sfx: string[] = [];
  const dusts: number[] = [];
  const g = {
    world: w,
    player,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    playSfxWav: (f: string) => { sfx.push(f); },
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      dusts.push(type);
      return { x, y, w: bw, h: bh, type, vx: 1, vy: 1, scale: 1, alpha: 0, fadeIn: 0,
        noGravity: false, noLight: false, color: null };
    },
  } as unknown as GameHooks;
  return { g, player, w, sfx, dusts };
}

describe('浮支收敛尾 float32 语义（:54699-54740,B1 修）', () => {
  it('settled 收敛 vy 精确 ===0 且 ≤30 拍落地（float64 版 46 拍;fl32 墙 17 拍）', () => {
    const h = mkBobberHarnessInner();
    const b = new Bobber(50 * TILE, 641.5 - 7, 0, 0, 5, 0, 5, () => h.player);
    b.floating = true;                                  // 直置浮态（cy=641.5,wl=641 下方 0.5）
    (b as unknown as { vy: number }).vy = 0;
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);   // 钉累积器不触 FishingCheck
    try {
      let land = -1;
      for (let t = 1; t <= 120; t++) {
        b.fixedUpdate(1, h.g);
        if ((b as unknown as { vy: number }).vy === 0) { land = t; break; }
      }
      expect(land).toBeGreaterThan(0);
      expect(land).toBeLessThanOrEqual(30);             // ★fl32 墙标度（float64 46 拍必炸）
      expect((b as unknown as { vy: number }).vy).toBe(0);
      b.fixedUpdate(1, h.g);                            // settled 稳态（else 支字面 wl−cy=0）
      expect((b as unknown as { vy: number }).vy).toBe(0);
    } finally {
      rnd.mockRestore();
    }
  });
});

// =====================================================================
// ④ 饵 2673 松露虫渔情警告每拍写（:54754-54757,R25-E16 补写位）
// =====================================================================
describe('饵 2673 渔情警告每拍写（:54754-54757）', () => {
  it('浮态每拍写 FishingWarning（旧仅 FishingCheck 写=抛竿头几秒残留旧行）', () => {
    const h = mkBobberHarnessInner();
    const b = new Bobber(50 * TILE, 641.5 - 7, 0, 0, 5, 0, 5, () => h.player);
    b.baitVid = 2673;
    b.floating = true;
    h.player.displayedFishingInfo = 'STALE';
    b.fixedUpdate(1, h.g);
    expect(h.player.displayedFishingInfo).toBe(Lang.text('GameUI.FishingWarning'));
  });

  it('非松露虫饵不写（粘性缓存不冲——:54754 条件不成立）', () => {
    const h = mkBobberHarnessInner();
    const b = new Bobber(50 * TILE, 641.5 - 7, 0, 0, 5, 0, 5, () => h.player);
    b.baitVid = 2307;
    b.floating = true;
    h.player.displayedFishingInfo = 'STALE';
    b.fixedUpdate(1, h.g);
    expect(h.player.displayedFishingInfo).toBe('STALE');
  });

  it('飞行段同写（:54754 位=干物理后/!flag3 早退前,原版飞行中即写）', () => {
    const h = mkBobberHarnessInner();
    const b = new Bobber(50 * TILE, 500, 0, 0, 5, 0, 5, () => h.player);   // 空中未浮
    b.baitVid = 2673;
    b.fixedUpdate(1, h.g);
    expect(b.floating).toBe(false);
    expect(h.player.displayedFishingInfo).toBe(Lang.text('GameUI.FishingWarning'));
  });
});
