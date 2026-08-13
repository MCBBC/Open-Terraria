// 批次B备案四项落地回归（2026-08-14，原备案见 ScaleStats.ts 尾段头注）：
//   ① FTW sizeScaleOverride 膨胀 (o+o²)/2（NPC.cs:8362-8366）
//   ② 图鉴假人还原（:18020-18023/:17856-17859）+ 488 训练假人不入图鉴（NPCID.cs:10429-10435）
//   ③ canDisplayBuffs（:6124/:17945/:17950/:17955，消费 :92026/:92135）
//   ④ netID 族 anniversary 二次盒（首盒 :17733-17739 + 十周年无条件二盒 :17861-17862）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import {
  netIdSpawnScale, applySeedAdjustments, bindScaleStatsWorld, scaleStatsWorldOf,
  f32, type SeedAdjustStats,
} from '../src/stats/ScaleStats';
import { BESTIARY_HIDE_IDS } from '../src/data/bestiaryStatics.generated';

// 防跨用例泄漏（bindScaleStatsWorld 模块级单例——同 tests/scale-stats.test.ts 约定）
beforeEach(() => { bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 't'), () => false)); });
afterEach(() => { bindScaleStatsWorld(null); });

const CTX = (o: Partial<Record<'zenithWorld' | 'getGoodWorld' | 'tenthAnniversaryWorld' | 'remixWorld', boolean>>) => ({
  zenithWorld: false, getGoodWorld: false, tenthAnniversaryWorld: false, remixWorld: false, ...o,
});
const seed = (type: number, over: Partial<SeedAdjustStats> = {}): SeedAdjustStats => ({
  type, scale: 1, lifeMax: 100, defense: 0, damage: 0, ...over,
});
/** 绿史莱姆（基底 1）原始盒 24×18（vanilla-npcs.json）——netID -5/-7 等变体的基底 */

// ---------------------------------------------------------------------------
// ① FTW sizeScaleOverride 膨胀（NPC.cs:8362-8366）
//    o' = (o + o*o) / 2f——小者更小（0.6→0.48）、大者更大（1.2→1.32），1 恒等
// ---------------------------------------------------------------------------
describe('批次B① FTW sizeScaleOverride 膨胀 (o+o²)/2（NPC.cs:8362-8366）', () => {
  it('经典世界：override 原值不膨胀——-7 紫史莱姆 o=1.2 盒 24×18→28×21', () => {
    const r = netIdSpawnScale(1, 1.2, 24, 18, CTX({}));
    expect(r.scale).toBeCloseTo(1.2, 6);
    expect(r.width).toBe(28);   // (int)(24×1.2)=(int)28.8
    expect(r.height).toBe(21);  // (int)(18×1.2)=(int)21.6
  });

  it('FTW 世界：o=1.2 → (1.2+1.44)/2=1.32，盒 31×23（基底 1 未列 getGood 无二盒）', () => {
    const r = netIdSpawnScale(1, 1.2, 24, 18, CTX({ getGoodWorld: true }));
    expect(r.scale).toBeCloseTo(1.32, 5);
    expect(r.width).toBe(31);   // (int)(24×1.32)=(int)31.68
    expect(r.height).toBe(23);  // (int)(18×1.32)=(int)23.76
  });

  it('FTW 小体型同步缩：o=0.6 → (0.6+0.36)/2=0.48（-1 母史莱姆小体 0.6→更小）', () => {
    const r = netIdSpawnScale(16, 0.6, 58, 42, CTX({ getGoodWorld: true }));
    expect(r.scale).toBeCloseTo(f32(0.48), 6);
  });

  it('图鉴假人豁免膨胀（!IsABestiaryIconDummy 门）+ o=1 恒等 ((1+1)/2=1)', () => {
    // 假人：FTW 也不膨胀（:8363 门）；类型 1 未列 getGood → 无二盒
    const d = netIdSpawnScale(1, 1.2, 24, 18, CTX({ getGoodWorld: true }), true);
    expect(d.scale).toBeCloseTo(1.2, 6);
    expect(d.width).toBe(28);
    // o=1：(1+1×1)/2 = 1 —— 常规体型怪在 FTW 不受影响
    const one = netIdSpawnScale(1, 1, 24, 18, CTX({ getGoodWorld: true }));
    expect(one.scale).toBe(1);
    expect(one.width).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// ② 图鉴假人还原（getGood :18020-18023 / 十周年 :17856-17859）
//    scale 还原入口值、不扩盒（图鉴图标以原版体型呈现）
// ---------------------------------------------------------------------------
describe('批次B② 图鉴假人还原（IsABestiaryIconDummy）', () => {
  it('FTW 列族 262 世花：假人 scale 还原 1 且不扩盒；非假人 ×1.3 扩盒', () => {
    const dummy = seed(262, { isBestiaryIconDummy: true });
    expect(applySeedAdjustments(dummy, CTX({ getGoodWorld: true }))).toBe(false);
    expect(dummy.scale).toBe(1);                    // 还原 :17875 num
    const real = seed(262);
    expect(applySeedAdjustments(real, CTX({ getGoodWorld: true }))).toBe(true);
    expect(real.scale).toBeCloseTo(1.3, 6);
  });

  it('十周年列族 4 史莱姆王：假人还原不扩盒；非假人 ×0.5 扩盒', () => {
    const dummy = seed(4, { isBestiaryIconDummy: true });
    expect(applySeedAdjustments(dummy, CTX({ tenthAnniversaryWorld: true }))).toBe(false);
    expect(dummy.scale).toBe(1);
    const real = seed(4);
    expect(applySeedAdjustments(real, CTX({ tenthAnniversaryWorld: true }))).toBe(true);
    expect(real.scale).toBeCloseTo(0.5, 6);
  });

  it('488 训练假人不入图鉴：NPCBestiaryDrawOffset[488].Hide=true（NPCID.cs:10429-10435）', () => {
    expect(BESTIARY_HIDE_IDS).toContain(488);      // GetExclusions → 不建条目
    expect(BESTIARY_HIDE_IDS).toContain(696);
    expect(BESTIARY_HIDE_IDS).toContain(0);
  });
});

// ---------------------------------------------------------------------------
// ③ canDisplayBuffs（NPC.cs:6124 默认 true；FTW 245-248 置 false；249 不置）
// ---------------------------------------------------------------------------
describe('批次B③ canDisplayBuffs（FTW 石巨人族 245-248）', () => {
  it('FTW：245/246/247/248 → false + scale×0.5；249 → true + scale×0.5', () => {
    for (const t of [245, 246, 247, 248]) {
      const s = seed(t, { canDisplayBuffs: true });
      expect(applySeedAdjustments(s, CTX({ getGoodWorld: true }))).toBe(true);
      expect(s.canDisplayBuffs).toBe(false);       // :17945/:17950/:17955
      expect(s.scale).toBeCloseTo(0.5, 6);
    }
    const s249 = seed(249, { canDisplayBuffs: true });
    applySeedAdjustments(s249, CTX({ getGoodWorld: true }));
    expect(s249.canDisplayBuffs).toBe(true);       // :17959-17962 无 canDisplayBuffs
    expect(s249.scale).toBeCloseTo(0.5, 6);
  });

  it('Enemy.fromVanilla 落字段：FTW 245 → false / 249 与经典 245 → true', () => {
    const w = new World(100, 100, 7, 't');
    w.seedFlags = { ...w.seedFlags, getGoodWorld: true };
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    expect(Enemy.fromVanilla(245, 0, 0)!.canDisplayBuffs).toBe(false);
    expect(Enemy.fromVanilla(249, 0, 0)!.canDisplayBuffs).toBe(true);
    bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 't'), () => false));
    expect(Enemy.fromVanilla(245, 0, 0)!.canDisplayBuffs).toBe(true);
  });

  it('netIdSpawnScale 传递：FTW 245 + override 1 → canDisplayBuffs=false（膨胀恒等 1×0.5 盒 70）', () => {
    const r = netIdSpawnScale(245, 1, 140, 140, CTX({ getGoodWorld: true }));
    expect(r.canDisplayBuffs).toBe(false);
    expect(r.scale).toBeCloseTo(0.5, 6);           // (1+1)/2=1 再 ×0.5
    expect(r.width).toBe(70);                      // (int)140×1 → ×0.5 二盒
    expect(r.height).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// ④ netID 族 anniversary 二次盒（首盒 :17733-17739；十周年 :17861-17862 无条件二盒）
//    netID 基类型与十周年列族零交集 ⇒ 未列族 scaleNew=o → 盒=raw×o×o（原版怪癖）
// ---------------------------------------------------------------------------
describe('批次B④ netID anniversary 二次盒', () => {
  it('十周年 -7（基底 1，o=1.2）：首盒 28×21 → 二盒 33×25（×1.2 二次乘）', () => {
    const r = netIdSpawnScale(1, 1.2, 24, 18, CTX({ tenthAnniversaryWorld: true }));
    expect(r.scale).toBeCloseTo(1.2, 6);           // 未列族 scale 不变
    expect(r.width).toBe(33);                      // (int)((int)28.8 ×1.2)=(int)33.6
    expect(r.height).toBe(25);                     // (int)((int)21.6 ×1.2)=(int)25.2
  });

  it('经典世界无二盒：同参数只出首盒 28×21', () => {
    const r = netIdSpawnScale(1, 1.2, 24, 18, CTX({}));
    expect(r.width).toBe(28);
    expect(r.height).toBe(21);
  });

  it('首盒 h==16||32 → +1（:17736-17739）：-5 黑史莱姆 o=0.9 → h=(int)16.2=16→17', () => {
    const r = netIdSpawnScale(1, 0.9, 24, 18, CTX({}));
    expect(r.width).toBe(21);                      // (int)21.6
    expect(r.height).toBe(17);                     // (int)16.2=16 → +1
  });

  it('getGood 与十周年 else-if 互斥（:17778-17785）：FTW+十周年同开只走 getGood 路径', () => {
    const r = netIdSpawnScale(1, 1.2, 24, 18, CTX({ getGoodWorld: true, tenthAnniversaryWorld: true }));
    expect(r.scale).toBeCloseTo(1.32, 5);          // 膨胀生效、十周年不叠
    expect(r.width).toBe(31);                      // 基底 1 未列 getGood → 无二盒
  });
});
