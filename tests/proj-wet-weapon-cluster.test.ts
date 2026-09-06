// ★武器弹簇湿段接入回归（2026-09-06 溅花缺口批第二波——projWetSection 共享体逐类接线:
//   proj1457 ChloroSaberStab 1127 / ChloroSporeCloud 1128 / ThunderBoltShot 731、
//   ChloroLeafShot 227、MagicMissileProj 34（16/79 豁免对照）、SpectreSoulProj 356、
//   PhoenixBolt 706、PrismProng 632 / BlasterBeam 461;豁免定谳批注面）。
//  原版锚：Projectile.cs:16903-17113 湿段 / :17721-17764 湿阻尼 / :10886-10892 出生预置 /
//  :16880 AI → :16895 湿段 → HandleMovement(:17578/:17120) → Damage(:17184) 位序
//  （湿段在 Update 子步循环 :16781 内 → EU 弹逐子步跑）。豁免面 = SetDefaults
//  ignoreWater=true（P.cs 699-10676 逐块核对,行号见各类字段块注）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { ChloroLeafShot } from '../src/entities/ChloroLeafCrystalProj';
import { ChloroSaberStab, ChloroSporeCloud, ThunderBoltShot } from '../src/entities/proj1457';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { SpectreSoulProj } from '../src/entities/SpectreSoulProj';
import { PhoenixBolt } from '../src/entities/PhoenixBowProj';
import { PrismProng, BlasterBeam } from '../src/entities/PrismProj';
import { RainbowBolt, RainbowSegment } from '../src/entities/RainbowProj';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [x0..x1] 行 [y0..y1] 满格液体（type 0=水） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number, type = 0): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = type;
    }
  }
}

/** stub game：spawnDust/playSfxWav/spawnParticles 计数 + 离屏玩家 + 空敌桶 */
function makeGame(w: World): {
  g: GameHooks; dust: Array<{ x: number; y: number; w: number; h: number }>;
  splash: string[]; particles: () => number;
} {
  const dust: Array<{ x: number; y: number; w: number; h: number }> = [];
  const splash: string[] = [];
  const sfx: string[] = [];
  let parts = 0;
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number) => {
      dust.push({ x, y, w: bw, h: bh });
      return null;
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    spawnParticles: () => { parts++; },
    playSfx: () => {}, playSfxAt: () => {},
    playSfxFiles: (names: string[]) => { void names; sfx.push('group'); },   // 计调用次数
    playSfxFile: () => {},
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, addLightAt: () => {},
    entities: { add: () => {} },
  } as unknown as GameHooks;
  return { g, dust, splash, sfx, particles: () => parts };
}

function mkWorld(): World {
  return new World(120, 160, 30, 'open');
}

/** 水带几何（用例共用）：列 30..40 行 60..70 → px [960,1136]² 域 */
const WX0 = 30, WX1 = 40, WY0 = 60, WY1 = 70;
/** 溅花尘按共享体弹面盒过滤（NewDust(x-6, y+h/2-8, w+12, 24)——wetSplashStepShared） */
const splashDustOf = (dust: Array<{ w: number; h: number }>, w: number) =>
  dust.filter((d) => d.w === w + 12 && d.h === 24);

afterEach(() => { vi.restoreAllMocks(); });

// =====================================================================
// 数据面：豁免表抽查（PROJ_IGNORE_WATER ↔ SetDefaults 逐块核对一致性）
// =====================================================================
describe('豁免数据面抽查（SetDefaults ignoreWater 行,行号见文件头/字段块注）', () => {
  it('武器弹簇受段 id 无 ignoreWater 行（缺行=不豁免同向）', () => {
    for (const id of [1127, 1128, 731, 227, 34, 356, 706, 632, 461]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应受段`).toBeFalsy();
    }
  });
  it('武器弹簇豁免 id 有 ignoreWater=true（P.cs 逐块行号）', () => {
    for (const id of [1126, 1129, 1116, 1117, 1122, 1091, 1115, 439, 440, 704, 950, 908,
      226, 611, 612, 707, 708, 709, 1110, 697, 698, 699, 700,
      16, 79, 221, 856, 443, 705, 978, 857, 250, 251, 633, 460, 459]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应豁免`).toBe(true);
    }
  });
});

// =====================================================================
// proj1457：ChloroSaberStab 1127 / ChloroSporeCloud 1128 / ThunderBoltShot 731
// =====================================================================
describe('ChloroSaberStab ★通用湿段（1127 :10561-10566 经 DefaultToShortsword 无 ignoreWater）', () => {
  it('出杆前伸入水溅 10 粒 + Splash_1 + wet 旗跃迁;阻尼 N/A（AI 直写位+tileCollide=false）', () => {
    const w = mkWorld();
    liquidAt(w, 24, 27, 20, 23);                 // 水带在右（px 384..432,320..384）
    const { g, dust, splash } = makeGame(w);
    const s = new ChloroSaberStab(1, 0, 12, 1, 100, 4);   // 出杆向右 12px/t 伸长
    let sawWet = false;
    for (let t = 0; t < 8 && !s.dead; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
    }
    expect(splash.length).toBe(1);               // 杆带伸进水带那拍一次
    expect(splash[0]).toBe('Splash_1');
    const sd = splashDustOf(dust, 18);           // w=18 → 溅花盒 30×24
    expect(sd.length).toBe(10);
    expect(sawWet).toBe(true);
    // 阻尼 N/A：位置恒由玩家锚重算（无 velocity 积分位移行）
  });
});

describe('ChloroSporeCloud ★通用湿段（1128 :10567-10581 无 ignoreWater）', () => {
  it('入水溅 10 粒 + wet 旗跃迁;阻尼 N/A（tileCollide=false :10569）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);             // 深水带（960..1136）——驻留不出水
    const { g, dust, splash } = makeGame(w);
    const c = new ChloroSporeCloud(34 * TILE, 930, 0, 20, 100, 0);   // 盒 30×30
    let sawWet = false;
    for (let t = 0; t < 6; t++) {
      c.fixedUpdate(1 / 60, g);
      sawWet = sawWet || c.wet;
    }
    expect(splash.length).toBe(1);               // 入水一次（湿旗粘滞,不重复溅）
    expect(splash[0]).toBe('Splash_1');
    // 云体早龄 scale≈0.29 → 盒宽随缩放（splash 盒 = 当拍 w+12）;高度 24 恒定
    expect(dust.filter((d) => d.h === 24).length).toBe(10);
    expect(sawWet).toBe(true);
  });
});

describe('ThunderBoltShot ★通用湿段（731 :7696-7706 无 ignoreWater;tileCollide 缺省 true）', () => {
  it('水中位移阻尼 ×0.5（2 子步 ×0.5 = 速度场×1/tick）且速度场不减;干态 2 子步全速', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const wet = new ThunderBoltShot(34 * TILE, 1000, 0, 8, 100, 2);   // 出生即在水带
    const y0 = wet.y;
    wet.fixedUpdate(1 / 60, g);
    expect(wet.y - y0).toBeCloseTo(8, 6);        // 2 子步 × 8×0.5 = 8（阻尼生效）
    expect(wet.vy).toBe(8);                      // 速度场不减（:17721-17764 wetVelocity 面）
    const dry = new ThunderBoltShot(60 * TILE, 1000, 0, 8, 100, 2);   // 干态对照
    const dy0 = dry.y;
    dry.fixedUpdate(1 / 60, g);
    expect(dry.y - dy0).toBeCloseTo(16, 6);      // 2 子步 × 8 = 16
    expect(dry.wet).toBe(false);
  });
  it('入水溅 10 粒（弹面盒 w+12=22 × 24）+ Splash_1 + wet 旗跃迁', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new ThunderBoltShot(34 * TILE, 900, 0, 8, 100, 2);
    let sawWet = false;
    for (let t = 0; t < 8 && !b.dead; t++) {
      b.fixedUpdate(1 / 60, g);
      sawWet = sawWet || b.wet;
    }
    expect(splash.length).toBe(1);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 10).length).toBe(10);
    expect(sawWet).toBe(true);
  });
});

// =====================================================================
// ChloroLeafShot 227（181 子步/拍;湿段逐子步;tileCollide=false :3129 → 阻尼 N/A）
// =====================================================================
describe('ChloroLeafShot ★通用湿段（227 :3126-3138 无 ignoreWater）', () => {
  it('单拍 181 子步：入水溅 + 出水溅（湿段逐子步,wetCount 逐子步折减）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    // 中心口径出生、vy=1.1/子步 ×181 ≈ 199px —— 一拍内穿入并穿出水带（960..1136）
    // （寿命 timeLeft=180 逐子步耗尽 → 本拍末即 Kill,后续无位移）
    const s = new ChloroLeafShot(34 * TILE, 944, 0, 1.1, 100, 10);
    s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(2);               // 入水 + 出水各一次（同拍两子步事件）
    expect(splash[0]).toBe('Splash_1');
    expect(splash[1]).toBe('Splash_1');
    expect(splashDustOf(dust, 14).length).toBe(20);   // w=14 → 盒 26×24 ×2 事件
    expect(s.dead).toBe(true);                   // timeLeft=180 逐子步耗尽（:17308-17313）
  });
  it('出生预置（:10886-10892）：出生即在水中 → wet=true 且无入水溅花', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new ChloroLeafShot(34 * TILE, 1000, 0, 0.5, 100, 10);
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);
    expect(splash.length).toBe(0);               // 预置 wet=true → !wet 门不触发
    expect(splashDustOf(dust, 14).length).toBe(0);
  });
});

// =====================================================================
// MagicMissileProj 34（block :1164-1175 无 ignoreWater = 受段+水death）
// 16/79 豁免对照（:985/:1607）
// =====================================================================
describe('MagicMissileProj ★通用湿段（34 受段 / 16·79 豁免数据面分流）', () => {
  it('34 水中位移阻尼 ×0.5 且速度场不减（AI_009 松手归一 32 → 位移 16）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const m = new MagicMissileProj(34 * TILE, 1000, 0, 8, {
      projId: 34, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    m.fixedUpdate(1 / 60, g);                    // 首拍松手归一 32 + 预置 wet + 阻尼位移
    expect(m.vy).toBe(32);
    expect(m.wet).toBe(true);
    expect(m.y - 1000).toBeCloseTo(16, 6);       // 32 × 0.5（y 出生=top-left 1000）
    const dry = new MagicMissileProj(60 * TILE, 1000, 0, 8, {
      projId: 34, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    dry.fixedUpdate(1 / 60, g);
    expect(dry.y - 1000).toBeCloseTo(32, 6);     // 干态全速
    expect(dry.wet).toBe(false);
  });
  it('34 入水溅花（弹面盒 44×24）→ 下一拍水death Kill（IsDestroyedByWater :16923-16925）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const m = new MagicMissileProj(34 * TILE, 860, 0, 4, {
      projId: 34, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    let splashTick = -1, deadTick = -1;
    for (let t = 1; t <= 8 && deadTick < 0; t++) {
      m.fixedUpdate(1 / 60, g);
      if (splash.length > 0 && splashTick < 0) splashTick = t;
      if (m.dead) deadTick = t;
    }
    expect(splashTick).toBeGreaterThan(0);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 32).length).toBe(10);   // 32×32 盒 → 44×24
    expect(deadTick).toBe(splashTick + 1);       // 溅花拍置旗 → 下一拍 wet&&!lavaWet Kill
  });
  it('34 浆穿（:16933-16936 `flag2=(wet=(lavaWet=false))`——逐拍清三旗,不 Kill 不溅）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1, 2);          // 岩浆带（WetCollision 对任意液体真）
    const { g, splash } = makeGame(w);
    const m = new MagicMissileProj(34 * TILE, 1000, 0, 8, {
      projId: 34, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    for (let t = 0; t < 4; t++) m.fixedUpdate(1 / 60, g);
    expect(m.dead).toBe(false);                  // wet/lavaWet 逐拍清 → 水death 门恒假
    expect(m.wet).toBe(false);                   // 34 浆穿支逐拍清 wet
    expect(m.lavaWet).toBe(false);               // 同支清 lavaWet（粘滞位不驻留）
    expect(splash.length).toBe(0);               // flag2=false → 无出入水溅
  });
  it('16/79 豁免：穿水零溅花/零湿旗/零水death（:985/:1607）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    for (const id of [16, 79]) {
      const m = new MagicMissileProj(34 * TILE, 860, 0, 4, {
        projId: id, damage: 100, knockback: 4, useTime: 20,
        channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
      });
      for (let t = 0; t < 8 && !m.dead; t++) m.fixedUpdate(1 / 60, g);
      expect(splash.length, `id ${id} 不溅花`).toBe(0);
      expect(splashDustOf(dust, 32).length, `id ${id} 零溅尘`).toBe(0);
      expect(m.wet, `id ${id} 湿旗恒假`).toBe(false);
      expect(m.dead, `id ${id} 不因水death 消亡（寿命/撞块除外）`).toBe(false);
    }
  });
});

// =====================================================================
// SpectreSoulProj 356（:4466-4475 无 ignoreWater = 受段;EU=3 → 4 子步逐跑）
// =====================================================================
describe('SpectreSoulProj ★通用湿段（356 受段——旧 ignoreWater=true 字段系误标,本批撤除）', () => {
  it('出生预置湿旗 + 无溅花;阻尼 N/A（tileCollide=false :4473）位移与干态恒等', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const wet = new SpectreSoulProj(34 * TILE, 1000, 0, 2, 100, null);
    const y0 = wet.y;
    wet.fixedUpdate(1 / 60, g);
    expect(wet.wet).toBe(true);
    expect(splash.length).toBe(0);               // 预置 wet=true → 入水免溅
    expect(splashDustOf(dust, 6).length).toBe(0);
    expect(wet.y - y0).toBeCloseTo(8, 6);        // 4 子步 × 2 = 8（无水阻尼）
    const dry = new SpectreSoulProj(60 * TILE, 1000, 0, 2, 100, null);
    const dy0 = dry.y;
    dry.fixedUpdate(1 / 60, g);
    expect(dry.y - dy0).toBeCloseTo(8, 6);       // 干态同位移 → 阻尼 N/A 定谳
  });
  it('飞行入水溅 10 粒（弹面盒 18×24）+ Splash_1 + wet 旗跃迁', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new SpectreSoulProj(34 * TILE, 900, 0, 2, 100, null);   // 8px/tick 下潜
    let sawWet = false;
    for (let t = 0; t < 12 && !s.dead; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
    }
    expect(splash.length).toBe(1);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 6).length).toBe(10);
    expect(sawWet).toBe(true);
  });
});

// =====================================================================
// PhoenixBolt 706（:7463-7475 无 ignoreWater = 受段;AI_001 湿灭消费上拍旗 :56743-56746）
// =====================================================================
describe('PhoenixBolt ★通用湿段（706 受段;载体 705 豁免 :6781 不接）', () => {
  it('飞行入水：入水拍溅 10 粒 → 下一拍湿灭（wet 旗驱动,弹心单格近似退役）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new PhoenixBolt(34 * TILE, 800, 0, 32, 100, 2);
    let splashTick = -1, deadTick = -1;
    for (let t = 1; t <= 10 && deadTick < 0; t++) {
      b.fixedUpdate(1 / 60, g);
      if (splash.length > 0 && splashTick < 0) splashTick = t;
      if (b.dead) deadTick = t;
    }
    expect(splashTick).toBeGreaterThan(0);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 10).length).toBe(10);   // 命中盒 10×10 → 溅花盒 22×24
    expect(deadTick).toBe(splashTick + 1);       // :56743 湿灭读上拍旗 → 下一拍
  });
  it('湿灭拍照走湿段+阻尼位移（段/HandleMovement 无 active 门）;首拍音仅一次', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash, sfx } = makeGame(w);
    const b = new PhoenixBolt(34 * TILE, 800, 0, 32, 100, 2);
    let prevY = b.y;
    let enteredWet = false;
    for (let t = 1; t <= 10 && !b.dead; t++) {
      b.fixedUpdate(1 / 60, g);
      if (b.wet) {
        enteredWet = true;
        // wet 态位移 = 速度 ×0.5（入水拍与湿灭拍同——移动无 active 门,AI Kill 拍仍走）
        const step = b.y - prevY;
        expect(step).toBeCloseTo(32 * 0.5, 6);
      }
      prevY = b.y;
    }
    expect(enteredWet).toBe(true);
    expect(b.dead).toBe(true);
    expect(splash.length).toBe(1);
    expect(sfx.length).toBe(1);                  // 首拍音仅一次（湿灭拍 AI 即返不播）
  });
  it('出生预置（:10886-10892）：出生即在水中 → 首拍湿灭且无首拍音（AI 即返）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash, sfx } = makeGame(w);
    const b = new PhoenixBolt(34 * TILE, 1000, 0, 32, 100, 2);
    b.fixedUpdate(1 / 60, g);
    expect(b.dead).toBe(true);
    expect(splash.length).toBe(0);               // 预置 wet=true → 段内不再溅
    expect(sfx.length).toBe(0);                  // AI 湿灭即返 → 首拍音尘全跳
  });
});

// =====================================================================
// PrismProng 632 / BlasterBeam 461（aiStyle 84 锚定束:无 ignoreWater = 受段;
// 阻尼 N/A——AI 直写位 + tileCollide=false + UpdatePosition :20549 早退表）
// =====================================================================
describe('PrismProng/BlasterBeam ★通用湿段（632 :6807-6817 / 461 :5319-5330 均无 ignoreWater）', () => {
  it('632 锚定位入水溅 10 粒（弹面盒 30×24）+ wet 旗跃迁 + 驻留不重复溅', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const parent = { dead: false, charge: 200, cx: 34 * TILE, cy: 900, dirX: 0, dirY: -1 };
    const p = new PrismProng(2, 100, 4);
    (p as unknown as { parent: unknown }).parent = parent;
    p.fixedUpdate(1 / 60, g);                    // 锚位在水带上方 → 干态
    expect(p.wet).toBe(false);
    expect(splash.length).toBe(0);
    parent.cy = 1000;                            // 晶体下压 → 光棱锚位入水
    p.fixedUpdate(1 / 60, g);
    expect(p.wet).toBe(true);
    expect(splash.length).toBe(1);               // 入水一溅;驻留湿旗粘滞不再溅
    p.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(1);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 18).length).toBe(10);
  });
  it('461 锚定束入水溅 10 粒 + wet 旗跃迁（阻尼 N/A 定谳——无位移行）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const parent = { dead: false, cx: 34 * TILE, cy: 900, dirX: 0, dirY: -1 };
    const b = new BlasterBeam(100, 4);
    (b as unknown as { parent: unknown }).parent = parent;
    b.fixedUpdate(1 / 60, g);                    // 锚位=父心+16 向上 → 干态
    expect(b.wet).toBe(false);
    parent.cy = 1000;                            // 父晶体下移 → 束锚入水
    b.fixedUpdate(1 / 60, g);
    expect(b.wet).toBe(true);
    expect(splash.length).toBe(1);
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 18).length).toBe(10);
  });
});

// =====================================================================
// 豁免运行时零触发抽查（250/251——SetDefaults ignoreWater=true :3332/:3348）
// =====================================================================
describe('RainbowBolt/RainbowSegment 豁免零触发（250 :3332 / 251 :3348）', () => {
  it('250 彩虹头穿水：零溅花/零湿尘/无水阻尼（位移恒 15.95）/不消亡', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const b = new RainbowBolt(34 * TILE, 940, 0, 15.95, 100, 2);
    for (let t = 0; t < 6 && !b.dead; t++) b.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0);
    expect(splashDustOf(dust, 12).length).toBe(0);
    expect(b.dead).toBe(false);                  // 水非实心,不撞亡
    // 恒速归一（:26723-26731）+ 豁免无阻尼 → 位移恒 15.95/tick
    expect(b.vy).toBeCloseTo(15.95, 6);
  });
  it('251 彩虹段水中驻留：零溅花/零溅尘（段无湿段接入面）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new RainbowSegment(34 * TILE, 1000, 0, 1, 100, 2);
    for (let t = 0; t < 5; t++) s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0);
    expect(splashDustOf(dust, 14).length).toBe(0);
    expect(s.dead).toBe(false);
  });
});
