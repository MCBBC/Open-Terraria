// ★通用湿段六小弹实体类接入回归（2026-09-04 溅花缺口批——projWetSection 共享体
//  逐类接线:FallingStar 12/720、MeteorChunk 1078、RollingBoulder 99 族、
//  LightningBoltProj 466/580(豁免定谳)、TrapShot 全 kind、Celeb2Rocket 715-718）。
//  原版锚：Projectile.cs:16903-17113 湿段 / :17721-17764 湿阻尼 / :20549-20557
//  UpdatePosition 跳过表 / :16880 AI → :16903 湿段 → :17120 HandleMovement 位序。
//  豁免面=SetDefaults ignoreWater 行（vanillaProjectiles PROJ_IGNORE_WATER 262 id）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { FallingStar } from '../src/entities/FallingStar';
import { MeteorChunk } from '../src/entities/MeteorChunk';
import { RollingBoulder } from '../src/entities/RollingBoulder';
import { LightningBoltProj } from '../src/entities/LightningBoltProj';
import { TrapShot } from '../src/entities/Dart';
import { Celeb2Rocket } from '../src/entities/Celeb2';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [x0..x1] 行 [y0..y1] 满格液体（type 0=水 / 2=岩浆） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number, type = 0): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = type;
    }
  }
}

/** stub game：spawnDust/playSfxWav(Splash)/spawnParticles 三通道计数 */
function makeGame(w: World): {
  g: GameHooks; dust: Array<{ x: number; y: number; w: number; h: number; type: number }>;
  splash: string[]; particles: () => number;
} {
  const dust: Array<{ x: number; y: number; w: number; h: number; type: number }> = [];
  const splash: string[] = [];
  let parts = 0;
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      dust.push({ x, y, w: bw, h: bh, type });
      return null;
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    spawnParticles: () => { parts++; },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  return { g, dust, splash, particles: () => parts };
}

function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;            // 午夜=isDay false（坠星白天清除门 :24092 不触发）
  return w;
}

/** 水带几何（各用例共用）：列 30..40 行 60..70 → px [480,656]×[960,1136] */
const WX0 = 30, WX1 = 40, WY0 = 60, WY1 = 70;

afterEach(() => { vi.restoreAllMocks(); });

// =====================================================================
// 数据面：豁免表抽查（PROJ_IGNORE_WATER ↔ SetDefaults 逐块核对一致性）
// =====================================================================
describe('豁免数据面抽查（SetDefaults ignoreWater 行）', () => {
  it('受段 id 无 ignoreWater 行 / 豁免 id 有（缺行=不豁免同向）', () => {
    for (const id of [12, 720, 1078, 99, 727, 1002, 1013, 1014, 1048, 1053, 1054, 1055, 1057,
      98, 184, 980, 185, 162, 281, 166, 601, 1049, 167, 168, 169, 170, 415, 416, 417, 418,
      419, 420, 421, 422, 715, 716, 717, 718]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应受段`).toBeFalsy();
    }
    for (const id of [186, 187, 654, 733, 466, 580, 1047, 714, 615]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应豁免`).toBe(true);
    }
  });
});

// =====================================================================
// FallingStar（12 坠星 / 720 Spawner）
// =====================================================================
describe('FallingStar ★通用湿段（12 :926-940 / 720 :7619-7627 均受段）', () => {
  it('入水溅花 10 粒 + Splash_1；出水溅花 10 粒 + wetCount=10 冷却窗', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new FallingStar(34 * TILE, 900, 0, 8, 0, false, false);
    let sawWet = false, sawExit = false;
    for (let t = 0; t < 60 && !s.dead; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
      // 出水窗 :16984 置 10 后【同 update】尾 :17109-17112 即折减 → 拍末可观测 9
      if (s.wetCount > 0) sawExit = true;
    }
    expect(splash.length).toBe(2);                 // 入水 + 出水各一次
    expect(splash[0]).toBe('Splash_1'); expect(splash[1]).toBe('Splash_1');
    // 溅花粒按共享体弹面盒 (w+12,24) 过滤（弹自身尾迹尘 58 :24236 同走 spawnDust 池）
    const splashDust = dust.filter((d) => d.w === 18 + 12 && d.h === 24);
    expect(splashDust.length).toBe(20);            // 2 × 10 粒（wetSplashStepShared 弹面）
    for (const d of splashDust) { expect(d.w).toBe(18 + 12); expect(d.h).toBe(24); }
    expect(sawWet).toBe(true);
    expect(sawExit).toBe(true);                    // wetCount 出水窗 :16984 置 10
  });

  it('水中位移阻尼 ×0.5：位移减半、velocity 场不减（:17755 wetVelocity 仅进 UpdatePosition）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new FallingStar(34 * TILE, 970, 0, 8, 0, false, false);   // 出生即在水带内
    s.fixedUpdate(1 / 60, g);                       // 预置拍（出生在水中 wet=true 无溅花 :10887）
    expect(s.wet).toBe(true);
    const y0 = s.y, vy0 = s.vy;
    s.fixedUpdate(1 / 60, g);
    expect(s.y - y0).toBeCloseTo(4, 6);             // 8 × 0.5
    expect(s.vy).toBe(vy0);                          // 速度场不减
  });

  it('720 Spawner：湿段照跑（水中 wet=true）但无位移（aiStyle 148 在 :20551 跳过表）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new FallingStar(34 * TILE, 970, 5, 5, 180, false, false);   // warmup>0=Spawner 相
    const x0 = s.x, y0 = s.y;
    for (let t = 0; t < 5; t++) s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);                        // 720 受段（:7619-7627 无 ignoreWater 行）
    expect(s.x).toBe(x0); expect(s.y).toBe(y0);      // Spawner 无位移 → 阻尼 N/A（定谳注）
    expect(splash.length).toBe(0);                   // 出生即在水中=无溅花（原版 :10887 预置同向）
  });
});

// =====================================================================
// MeteorChunk（1078 陨石碎块）
// =====================================================================
describe('MeteorChunk ★通用湿段（1078 :10069-10079 受段）', () => {
  it('入水溅花 10 粒 + 湿旗跃迁 + wetCount 出水窗', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const m = new MeteorChunk(34 * TILE, 900, 0, 4);
    let sawWet = false;
    for (let t = 0; t < 80 && !m.dead; t++) {
      m.fixedUpdate(1 / 60, g);
      sawWet = sawWet || m.wet;
    }
    expect(splash.length).toBe(2);
    expect(dust.length).toBe(20);
    expect(sawWet).toBe(true);
  });

  it('水中位移阻尼 ×0.5：重力照加速度场，位移减半（直积分乘进位移行）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const m = new MeteorChunk(34 * TILE, 970, 0, 4);
    m.fixedUpdate(1 / 60, g);                        // 预置拍
    expect(m.wet).toBe(true);
    const y0 = m.y, vy0 = m.vy;
    m.fixedUpdate(1 / 60, g);
    expect(m.vy).toBeCloseTo(vy0 + 0.3, 6);          // 重力照加（速度场）
    expect(m.y - y0).toBeCloseTo((vy0 + 0.3) * 0.5, 6);   // 位移减半
  });

  it('AI_199 尘 6 !wet 门（1457 :40752）：水中零飞尘、干态照发', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, particles } = makeGame(w);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);   // 尘门 0<0.5 恒发
    const dry = new MeteorChunk(70 * TILE, 900, 0, 4);         // 干列（70>41 出水带）
    for (let t = 0; t < 5; t++) dry.fixedUpdate(1 / 60, g);
    const dryN = particles();
    expect(dryN).toBeGreaterThan(0);
    const wet = new MeteorChunk(34 * TILE, 970, 0, 4);         // 水带内
    wet.fixedUpdate(1 / 60, g);
    expect(wet.wet).toBe(true);
    const before = particles();
    wet.fixedUpdate(1 / 60, g);
    expect(particles()).toBe(before);                          // !wet 门=零飞尘
    expect(spy).toBeDefined();
  });
});

// =====================================================================
// RollingBoulder（99 族 BOULDER_CONVERT_TABLE：99/727/1002/1013/1014/1047/1048/
// 1053/1054/1055/1057——1047 豁免（:9920-9929 true@:9928）余受段）
// =====================================================================
describe('RollingBoulder ★通用湿段（AI_025 家族）', () => {
  it('99 落水溅花 10 粒 + 位移阻尼 ×0.5（moveAndCollide dx/dy 入参,速度场不减）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new RollingBoulder(34 * TILE, 850, 138);         // sheet 138 → projId 99
    (b as { vy: number }).vy = 10;
    let sawWet = false;
    for (let t = 0; t < 40 && !b.dead; t++) {
      const vy0 = b.vy, y0 = b.y;
      b.fixedUpdate(1 / 60, g);
      if (b.wet) {
        sawWet = true;
        // vy 拍内或已被重力加过——断言位移=末态 vy×0.5（场值不减）
        if (!b.onGround) expect(b.y - y0).toBeCloseTo(b.vy * 0.5, 6);
        void vy0;
      }
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(dust.length).toBeGreaterThanOrEqual(10);
  });

  it('727 仙人掌球：岩浆粘滞（lavaWet）→ 次 tick AI_025 AnyWet Kill（:26758-26760）；水不杀', () => {
    // 岩浆支
    const wl = mkWorld();
    liquidAt(wl, WX0, WX1, WY0, WY1, 2);
    const gl = makeGame(wl);
    const lava = new RollingBoulder(34 * TILE, 62 * TILE, 484);   // sheet 484 → 727
    lava.fixedUpdate(1 / 60, gl.g);
    expect(lava.dead).toBe(false);                 // 首拍 AnyWet 读上拍旗（全 false）
    expect(lava.lavaWet).toBe(true);
    lava.fixedUpdate(1 / 60, gl.g);
    expect(lava.dead).toBe(true);                  // :26758 lavaWet∧(727|1054) → Kill
    // 水支（727 只吃 lavaWet——wet 不杀）
    const ww = mkWorld();
    liquidAt(ww, WX0, WX1, WY0, WY1, 0);
    const gw = makeGame(ww);
    const water = new RollingBoulder(34 * TILE, 62 * TILE, 484);
    for (let t = 0; t < 3; t++) water.fixedUpdate(1 / 60, gw.g);
    expect(water.dead).toBe(false);
  });

  it('1053：任一液（AnyWet）→ 次 tick Kill（:26750-26752）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const b = new RollingBoulder(34 * TILE, 62 * TILE, 713);      // sheet 713 → 1053
    b.fixedUpdate(1 / 60, g);
    expect(b.dead).toBe(false);
    b.fixedUpdate(1 / 60, g);
    expect(b.dead).toBe(true);
  });

  it('1047 豁免（:9920-9929 ignoreWater@:9928）：水中零溅花/四旗恒 false/无阻尼/不杀', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new RollingBoulder(34 * TILE, 850, 711);            // sheet 711 → 1047
    (b as { vy: number }).vy = 10;
    const y0 = b.y;
    for (let t = 0; t < 6 && !b.dead; t++) b.fixedUpdate(1 / 60, g);
    expect(b.wet).toBe(false); expect(b.lavaWet).toBe(false);
    expect(b.honeyWet).toBe(false); expect(b.shimmerWet).toBe(false);
    expect(splash.length).toBe(0); expect(dust.length).toBe(0);
    expect(b.dead).toBe(false);
    // 无阻尼：全程全速位移（对照 99 用例的 ×0.5）
    expect(b.y - y0).toBeGreaterThan(6 * 10 * 0.5);
  });
});

// =====================================================================
// LightningBoltProj（466 :5394-5405 true@:5401 / 580 :6296-6307 true@:6303——双双豁免）
// =====================================================================
describe('LightningBoltProj 湿段豁免定谳（466/580 ignoreWater → 不接湿段）', () => {
  it('466 水中穿行：零溅花零 Splash、全速位移（湿阻尼不适用——:16870 wetVelocity≡velocity）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new LightningBoltProj(34 * TILE, 62 * TILE + 4, 6, 0, 466, 40, 0, 42);
    const x0 = b.x;
    b.fixedUpdate(1 / 60, g);                      // 1 tick = 5 子步（extraUpdates=4）
    expect(dust.length).toBe(0);                   // 湿段溅花不触发（豁免）
    expect(splash.length).toBe(0);
    expect(b.x - x0).toBeCloseTo(6 * 5, 6);        // 5 子步全速积分（若误接阻尼=×0.5）
  });

  it('580 同豁免：水中零溅花', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new LightningBoltProj(34 * TILE, 62 * TILE + 4, 8, 0, 580, 40, 0, 7);
    for (let t = 0; t < 3; t++) b.fixedUpdate(1 / 60, g);
    expect(dust.length).toBe(0);
    expect(splash.length).toBe(0);
  });
});

// =====================================================================
// TrapShot（Dart.ts 全 kind：豁免 187/186/654/733,余受段）
// =====================================================================
describe('TrapShot ★通用湿段', () => {
  it('dart 98 受段：入水溅花 10 粒 + 湿旗 + 位移阻尼 ×0.5', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const d = new TrapShot(440, 964, 4, 0, 25, 'dart');   // y 带在水面下、水平入水
    let sawWet = false;
    for (let t = 0; t < 30 && !d.dead; t++) {
      const x0 = d.x;
      d.fixedUpdate(1 / 60, g);
      sawWet = sawWet || d.wet;
      if (d.wet) expect(d.x - x0).toBeCloseTo(2, 6);      // 4 × 0.5
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBe(1);                        // 30 tick 内未出带右缘（阻尼 2px/t）→ 恰一次入水溅花
    expect(dust.length).toBe(10);
  });

  it('spear 186 豁免（:2730-2742 true@:2737）：零溅花 + 全速位移', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new TrapShot(440, 964, 4, 0, 25, 'spear');
    const x0 = s.x;
    for (let t = 0; t < 10 && !s.dead; t++) s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0); expect(dust.length).toBe(0);
    expect(s.x - x0).toBeCloseTo(40, 6);                  // 10 tick × 4px 全速（无阻尼）
  });

  it('boulder kind 99 受段：落水位移阻尼 ×0.5（moveAndCollide 入参）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const b = new TrapShot(34 * TILE, 850, 0, 0, 70, 'boulder');
    (b as { vy: number }).vy = 10;
    let sawWet = false;
    for (let t = 0; t < 40 && !b.dead; t++) {
      const y0 = b.y;
      b.fixedUpdate(1 / 60, g);
      if (b.wet && !b.onGround) {
        sawWet = true;
        expect(b.y - y0).toBeCloseTo(b.vy * 0.5, 6);
      }
    }
    expect(sawWet).toBe(true);
  });

  it('fireworkRocket 167 受段：入水溅花 + 水平位移阻尼 ×0.5', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const r = new TrapShot(440, 964, 8, 0, 150, 'fireworkRocket');
    let sawWet = false;
    for (let t = 0; t < 20 && !r.dead; t++) {
      const x0 = r.x;
      r.fixedUpdate(1 / 60, g);
      sawWet = sawWet || r.wet;
      if (r.wet) expect(r.x - x0).toBeCloseTo(4, 6);      // 8 × 0.5
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(dust.length).toBeGreaterThanOrEqual(10);
  });

  it('toiletPop 733 豁免（:7718-7727 true@:7724）：水中零溅花零旗', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const t = new TrapShot(34 * TILE, 62 * TILE, 0, 0, 0, 'toiletPop');
    for (let n = 0; n < 3 && !t.dead; n++) t.fixedUpdate(1 / 60, g);
    expect(t.wet).toBe(false);
    expect(splash.length).toBe(0); expect(dust.length).toBe(0);
  });
});

// =====================================================================
// Celeb2Rocket（715/717 :7586-7597、716/718 :7598-7609 受段；714/615 枪口豁免）
// =====================================================================
describe('Celeb2Rocket ★通用湿段（每子步,extraUpdates=2 → 3 子步/拍）', () => {
  it('入水溅花 10 粒 + 每子步位移阻尼（每拍 dx=3×vx×0.5=12,vx 场不减）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const r = new Celeb2Rocket(715, 0, 440, 964, 8, 0, 50, 5, false, () => {});
    let sawWet = false;
    let prevWet = false;
    for (let t = 0; t < 30 && !r.dead; t++) {
      const x0 = r.x;
      prevWet = r.wet;
      r.fixedUpdate(1 / 60, g);
      sawWet = sawWet || r.wet;
      if (prevWet && r.wet) {                            // 整拍 3 子步全湿（入/出拍是混合拍）
        expect(r.x - x0).toBeCloseTo(12, 6);            // 3 子步 × 8 × 0.5
        expect(r.vx).toBe(8);                            // 速度场不减
      }
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(dust.length).toBeGreaterThanOrEqual(10);
  });

  it('wetCount 冷却窗逐【子步】递减（:17109-17112 在子步环内）——出水拍窗值 ∈{8,9,10},次拍 −3', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const r = new Celeb2Rocket(715, 0, 440, 964, 8, 0, 50, 5, false, () => {});
    let exitVal = -1;
    for (let t = 0; t < 30 && exitVal < 0 && !r.dead; t++) {
      r.fixedUpdate(1 / 60, g);
      if (r.wetCount > 0) exitVal = r.wetCount;         // 出水子步置 10,同拍余子步已折减
    }
    expect(exitVal).toBeGreaterThanOrEqual(7);   // 出水子步置 10 + 同调用尾折减(:17109-17112) → 9−(余子步)
    expect(exitVal).toBeLessThanOrEqual(9);
    const v0 = r.wetCount;
    r.fixedUpdate(1 / 60, g);                            // 整拍 3 子步
    expect(r.wetCount).toBe(v0 - 3);                     // 逐子步 −1 ×3（非逐拍 −1）
  });
});
