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
import { ChloroSaberStab, ChloroSporeCloud, ThunderBoltShot, BookStormTwister } from '../src/entities/proj1457';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { SpectreSoulProj } from '../src/entities/SpectreSoulProj';
import { PhoenixBolt } from '../src/entities/PhoenixBowProj';
import { PrismProng, BlasterBeam } from '../src/entities/PrismProj';
import { RainbowBolt, RainbowSegment } from '../src/entities/RainbowProj';
import { Arrow } from '../src/entities/Arrow';
import { projectileWetSection } from '../src/entities/projWetSection';
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
type DustRec = {
  x: number; y: number; w: number; h: number; type: number;
  d: { vx: number; vy: number; scale: number; alpha: number; noGravity: boolean; color: unknown };
};
function makeGame(w: World): {
  g: GameHooks; dust: DustRec[];
  splash: string[]; sfx: string[]; particles: () => number;
} {
  // ★2026-09-06 尘桩改可变（勿 return null,参照 proj-wet-cache mkSplash）：四液溅花
  //  尘的型内初速预处理（Dust.cs:227-231/:246-254,调用侧补链）以【有返回值】为门,
  //  null 桩 = 型内段静默丢弃 → 四液尘型/字段覆写断言无从立起。返回可变尘对象并
  //  随盒记录一并留存（rec.d）,调用侧覆写面（vx/vy/scale/alpha/noGravity/color）可断言。
  const dust: DustRec[] = [];
  const splash: string[] = [];
  const sfx: string[] = [];
  let parts = 0;
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type = 0) => {
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
      dust.push({ x, y, w: bw, h: bh, type, d });
      return d;
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

// =====================================================================
// ★2026-09-06 修刀批 E（红队四件）：
//  ①704 支撑谓词补 WetCollision（P.cs:71467 `SolidCollision(...) || WetCollision(...)`
//    ——湿柱也算支撑=水面悬停;旧版只查 isSolid → 龙卷穿水）;
//  ②1127 杀拍湿段（⑥口径 Arrow.ts wetSectionStep 配方推广——原版湿段无 active 门,
//    AI 杀当拍湿段照跑）;
//  ③出生预置逐字面化（NewProjectile :10886-10893 红队 R1+R2:wet/honey/shimmer 无条件
//    写【含豁免弹】,仅 `if (ignoreWater) wet=false` 清 wet;lavaWet 原文本点不写）;
//  ④:16891-16894 三型前置换位（242 高速子弹/302 狙击弹/638 月主炮弹 wet=false,
//    AI 后/湿段前,豁免门外=死码照抄）。
// =====================================================================

describe('BookStormTwister 704 支撑谓词（:71467 SolidCollision || WetCollision,盒=16×160 探测柱）', () => {
  it('水面悬停：探测柱湿支命中 → 升支（vy<0）;60 拍悬停带内震荡不沉穿水底;干区对照直坠（修前穿水）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);                 // px [480,656]×[960,1136]
    const { g } = makeGame(w);
    // 中心 (552,945) → 盒 y=840、底=1050;wet 子盒=探测柱(16×160)内缩 10×80 底心
    // → [547,557)×[930,1010)（npcLiquid.wetCollision 同式）——与水面带 [960,1136) 相交
    const tw = new BookStormTwister(552, 945, 0, 100, 4);
    tw.fixedUpdate(1 / 60, g);
    expect(tw.vy).toBeLessThan(0);                   // ← 湿柱算支撑 → 升（修前走坠支 vy=+2）
    expect(tw.y).toBeLessThan(840);
    // 悬停：平衡带 = wet 子盒下沿门（底 >1000 即 blocked）→ 底在 ≈1000 附近震荡,
    // 既不沉到水带底（1136）也不脱离
    let minBottom = Infinity, maxBottom = -Infinity;
    for (let t = 0; t < 60 && !tw.dead; t++) {
      tw.fixedUpdate(1 / 60, g);
      minBottom = Math.min(minBottom, tw.y + tw.h);
      maxBottom = Math.max(maxBottom, tw.y + tw.h);
    }
    expect(tw.dead).toBe(false);
    expect(minBottom).toBeLessThanOrEqual(1010);     // 触到平衡带
    expect(maxBottom).toBeLessThan(1136);            // 全程未沉穿水带底（修前恒穿）
    // 干区对照：同位无水 → 直坠,10 拍内坠深超过水带全深
    const dry = new BookStormTwister(552, 945, 0, 100, 4);
    const dg = makeGame(mkWorld()).g;
    let dryBottom = 1050;
    for (let t = 0; t < 10 && !dry.dead; t++) { dry.fixedUpdate(1 / 60, dg); dryBottom = dry.y + dry.h; }
    expect(dryBottom).toBeGreaterThan(1120);
  });
});

describe('ChloroSaberStab 1127 杀拍湿段（⑥口径:AI 杀当拍湿段照跑,:16895 无 active 门）', () => {
  it('寿命尽拍恰逢入水（液后变）→ 死拍补跑湿段溅花 ×10 + Splash_1（修前跳段=不溅）', () => {
    const w = mkWorld();
    const { g, dust, splash } = makeGame(w);
    const s = new ChloroSaberStab(1, 0, 12, 1, 100, 4);   // life=16×1+5=21;终位盒 [511,529]×[332,350]
    for (let t = 0; t < 20; t++) s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(false);
    expect(splash.length).toBe(0);                   // 前 20 拍干区（世界无液体）
    liquidAt(w, 31, 33, 20, 21);                     // 淹没终位盒（px [496,544)×[320,352)）
    s.fixedUpdate(1 / 60, g);                        // t=21 寿命尽 → Kill 拍
    expect(s.dead).toBe(true);
    expect(splash.length).toBe(1);                   // ← 杀拍湿段补跑（修前恒 0）
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustOf(dust, 18).length).toBe(10);  // w=18 → 溅花盒 30×24
  });
});

describe('出生预置逐字面化（NewProjectile :10886-10893,红队 R1+R2）', () => {
  it('共享体·豁免弹（16）出生在蜂蜜：wet=false 反清 + honeyWet=true 无条件写（修前整段跳过=漏写）', () => {
    expect(projectileData(16)?.ignoreWater, '前置:16 豁免').toBe(true);
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1, 3);              // 蜂蜜带
    const { g } = makeGame(w);
    const m = new MagicMissileProj(34 * TILE, 1000, 0, 8, {
      projId: 16, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    m.fixedUpdate(1 / 60, g);
    expect(m.wet).toBe(false);                       // :10888-10891（豁免只反清 wet）
    expect(m.honeyWet).toBe(true);                   // :10892 无条件赋值（原文字面,修前=false）
    expect(m.shimmerWet).toBe(false);
  });
  it('共享体·豁免弹（16）出生在微光：shimmerWet=true 无条件写', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1, 4);              // 微光带
    const { g } = makeGame(w);
    const m = new MagicMissileProj(34 * TILE, 1000, 0, 8, {
      projId: 16, damage: 100, knockback: 4, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    m.fixedUpdate(1 / 60, g);
    expect(m.wet).toBe(false);
    expect(m.shimmerWet).toBe(true);                 // :10893 无条件赋值（修前=false）
    expect(m.honeyWet).toBe(false);
  });
  it('共享体·非豁免（731）出生在蜂蜜：wet=true + honeyWet=true（无条件写对受段弹同值,消亡族除外）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1, 3);
    const { g } = makeGame(w);
    const b = new ThunderBoltShot(34 * TILE, 1000, 0, 8, 100, 2);
    b.fixedUpdate(1 / 60, g);
    expect(b.wet).toBe(true);                        // WetCollision 对任意液体真
    expect(b.honeyWet).toBe(true);
    expect(b.dead).toBe(false);                      // 731 非消亡族
  });
  it('Arrow 预置逐字面：豁免弹（5 水矢）出生在蜂蜜 → wet=false 且 honeyWet=true;非豁免（2）出生在浆 → lavaWet 由首拍湿段并入=保护仍在', () => {
    expect(projectileData(5)?.ignoreWater, '前置:5 豁免').toBe(true);
    const hw = mkWorld();
    liquidAt(hw, WX0, WX1, WY0, WY1, 3);
    const a = new Arrow(34 * TILE, 1000, 0, 0, 12, 1, 5, { grav: 0 });
    a.w = 10; a.h = 10;
    a.fixedUpdate(1 / 60, makeGame(hw).g);
    expect(a.wet).toBe(false);                       // :10888-10891
    expect(a.honeyWet).toBe(true);                   // :10892（修前豁免整块跳过=漏写）
    expect(a.shimmerWet).toBe(false);
    // 浆中出生（非豁免 2 变型族）:lavaWet 首档不再出自预置（原文本点不写）,由本子步
    // 湿段 :16906-16911 在消亡判定 :16921 前并入 → 粘滞面保护不因预置瘦身而失
    const lw = mkWorld();
    liquidAt(lw, WX0, WX1, WY0, WY1, 2);
    const b = new Arrow(34 * TILE, 1000, 0, 0, 12, 1, 2, { grav: 0 });
    b.w = 10; b.h = 10;
    b.fixedUpdate(1 / 60, makeGame(lw).g);
    expect(b.dead).toBe(false);
    expect(b.projId).toBe(2);                        // 不误杀/不变型
    expect(b.lavaWet).toBe(true);                    // :16906-16911 并入（tick1 档）
  });
});

describe('四液溅花尘型（可变尘桩,型内预处理段以有返回值为门）', () => {
  it('水 33 / 蜂蜜 152 / 微光 308 / 岩浆 35（各 10 粒,盒 (w+12)×24）+ 覆写面逐值', () => {
    // 覆写面期望（桩初速 vx=vy=1,scale=1,α=0）:型内预处理（Dust.cs 型内段）→ 调用侧覆写
    //   水 33：型内 α170/v×0.5/Y++（池内已植,桩侧不现）→ vy=1−4=−3、vx=2.5、α100
    //   蜜 152：型内 v×0.1+vy 钉 −0.5 → 桩净 vy=−0.5−1=−1.5、vx=0.25、α100
    //   微光 308：型内 v×0.5+Y++ → 桩净 vy=1.5−4=−2.5、vx=1.25、α 不设=0、六掷三色
    //   岩浆 35：型内 v×0.1+vy 钉 −0.5 → 桩净 vy=−0.5−1.5=−2、vx=0.25、α100
    const palette = [[255, 255, 210], [190, 245, 255], [255, 150, 255], [190, 175, 255]];
    const want: Record<number, { vy: number; vx: number; alpha: number }> = {
      33: { vy: -3, vx: 2.5, alpha: 100 },
      152: { vy: -1.5, vx: 0.25, alpha: 100 },
      308: { vy: -2.5, vx: 1.25, alpha: 0 },
      35: { vy: -2, vx: 0.25, alpha: 100 },
    };
    for (const [liq, dustId] of [[0, 33], [3, 152], [4, 308], [2, 35]] as const) {
      const w = mkWorld();
      liquidAt(w, WX0, WX1, WY0, WY1, liq);
      const { g, dust } = makeGame(w);
      const b = new ThunderBoltShot(34 * TILE, 900, 0, 8, 100, 2);   // 飞行入液
      for (let t = 0; t < 8 && !b.dead; t++) b.fixedUpdate(1 / 60, g);
      const sd = dust.filter((d) => d.w === 22 && d.h === 24);       // 溅花专用盒
      expect(sd.length, `liquid ${liq} 溅花粒数`).toBe(10);
      expect(sd.every((d) => d.type === dustId), `liquid ${liq} 尘型`).toBe(true);
      const wv = want[dustId];
      expect(sd.every((d) => d.d.vy === wv.vy && d.d.vx === wv.vx), `liquid ${liq} 净初速`).toBe(true);
      expect(sd.every((d) => d.d.scale === 1.3 && d.d.noGravity && d.d.alpha === wv.alpha),
        `liquid ${liq} scale/noGravity/α`).toBe(true);
      if (dustId === 308) {   // 微光六掷三色（Projectile.cs :16954-16970 同式）
        expect(sd.every((d) => {
          const c = d.d.color as { r: number; g: number; b: number; a: number };
          return palette.some(([r, g2, b2]) => c.r === r && c.g === g2 && c.b === b2 && c.a === 255);
        }), '微光三色档').toBe(true);
      }
    }
  });
});

describe(':16891-16894 三型前置换位（242/302/638 wet=false——双重死码照抄,直驱共享体激活）', () => {
  // 三型数据面均为豁免弹（242/302/638 ignoreWater=true）→ 实机无任何活体走到本支:
  // 豁免弹预置已反清 wet+段体整跳,共享体消费域亦无此三型。本组直驱 projectileWetSection
  // （ignoreWater=false 假想受段宿主）钉清位分支本体。
  it('wet 旗已真入段：242 被前置换位 → !wet 溅花门重开当拍溅 10 粒;对照 id（1）同态零溅', () => {
    for (const id of [242, 302, 638]) {
      expect(projectileData(id)?.ignoreWater, `${id} 数据面豁免（清位在豁免门外,原文如此）`).toBe(true);
    }
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust } = makeGame(w);
    const mkFlags = () => ({ wet: true, lavaWet: false, honeyWet: false, shimmerWet: false, wetCount: 0, presetDone: true });
    const f242 = mkFlags();
    projectileWetSection(f242, g, w.store, 34 * TILE, 1000, 10, 10, 242, false);
    expect(dust.filter((d) => d.w === 22 && d.h === 24).length).toBe(10);   // ← 清位开门（修前 0）
    expect(f242.wet).toBe(true);                    // 段尾 flag2 重新置真（:17020）
    const f1 = mkFlags();
    projectileWetSection(f1, g, w.store, 34 * TILE, 1000, 10, 10, 1, false);
    expect(dust.filter((d) => d.w === 22 && d.h === 24).length).toBe(10);   // 仍 10 = 对照零新增
    expect(f1.wet).toBe(true);
  });
});
