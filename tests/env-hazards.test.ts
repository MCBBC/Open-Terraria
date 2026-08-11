// 环境接触伤害回归 1:1(尖刺/岩浆/窒息/灼烧,Collision.cs HurtTiles + Player.cs ApplyTouchDamage):
//   尖刺 48=60 / 木尖刺 232=80 / 荆棘族 10/17(+触碰毁块) / 灼烧族 Burning / 沙族窒息 20HP/s;
//   岩浆:盒判定接触 → 单发 80 + OnFire 7s,入水熄灭;
//   敌怪岩浆:30t 冷却 50 直伤 + onFire 4HP/s,lavaImmune 表豁免(NPC.cs:94520)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE_DEFS } from '../src/data/tiles';
import {
  hurtTiles, liquidCollision, TOUCH_IMMEDIATE, TOUCH_HOT, SUFFOCATE, TOUCH_DESTROY,
} from '../src/stats/TouchDamage';
import { NPC_LAVA_IMMUNE } from '../src/data/npcLavaImmune';
import { sheetId } from './env-hazards-util';

describe('接触伤害表(TileID.Sets 对账)', () => {
  it('尖刺 60 / 木尖刺 80 / 荆棘 10/17 / 流血族 / 灼烧族 / 窒息族 / 毁块族', () => {
    expect(TOUCH_IMMEDIATE.get(sheetId(48))).toBe(60);
    expect(TOUCH_IMMEDIATE.get(sheetId(232))).toBe(80);
    expect(TOUCH_IMMEDIATE.get(sheetId(32))).toBe(10);
    expect(TOUCH_IMMEDIATE.get(sheetId(69))).toBe(17);
    expect(TOUCH_HOT.has(sheetId(37))).toBe(true);      // 陨石
    expect(TOUCH_HOT.has(sheetId(58))).toBe(true);      // 狱石
    expect(SUFFOCATE.has(sheetId(53))).toBe(true);      // 沙
    expect(SUFFOCATE.has(sheetId(224))).toBe(true);     // 泥沙
    expect(TOUCH_DESTROY.has(sheetId(69))).toBe(true);  // 丛林刺触碰毁块
    // 仙人掌 80 在 IMMEDIATE 表内(数值 6),但 CanTileHurt 之外——原版仅饥荒种子生效
    expect(TOUCH_IMMEDIATE.get(sheetId(80))).toBe(6);
  });

  it('HurtTiles:实体盒接触尖刺命中;远离不命中', () => {
    // 注:原版 j1 裁剪 maxTilesY-40(面向全尺寸世界),测试世界须 >40 高
    const world = new World(64, 64, 1, '测试');
    const st = world.store;
    const spike = sheetId(48)!;
    st.setTileSilent(10, 10, spike);
    // 实体 (10*16, 10*16-40) 20×42:底边进入尖刺格上方 → 盒扩 1 命中
    const hit = hurtTiles(st, 10 * 16, 10 * 16 - 40, 20, 42, false);
    expect(hit?.type).toBe(spike);
    expect(hurtTiles(st, 20 * 16, 20 * 16, 20, 42, false)).toBeNull();
  });

  it('液体盒判定:岩浆格接触命中,空气不命中', () => {
    const world = new World(32, 32, 1, '测试');
    const st = world.store;
    st.setLiquid(5, 5, 255, 2);
    expect(liquidCollision(st, 5 * 16, 5 * 16 - 40, 20, 42, 2)).toBe(true);
    expect(liquidCollision(st, 5 * 16, 5 * 16 - 40, 20, 42, 1)).toBe(false); // 查水不命中
    expect(liquidCollision(st, 20 * 16, 20 * 16, 20, 42, 2)).toBe(false);
  });

  it('NPC 岩浆免疫表:含恶魔/火小鬼等,不含史莱姆/僵尸', () => {
    expect(NPC_LAVA_IMMUNE.has(59)).toBe(true);  // Demon
    expect(NPC_LAVA_IMMUNE.has(62)).toBe(true);  // Fire Imp
    expect(NPC_LAVA_IMMUNE.has(24)).toBe(true);  // 老人(骷髅王人形)
    expect(NPC_LAVA_IMMUNE.has(1)).toBe(false);  // Slime
    expect(NPC_LAVA_IMMUNE.has(3)).toBe(false);  // Zombie
  });

  it('窒息族 tile 全部注册且实心(沙族可掩埋)', () => {
    for (const s of [53, 112, 116, 123, 224, 234]) {
      const id = sheetId(s)!;
      expect(TILE_DEFS[id]?.solid, `sheet ${s}`).toBe(true);
    }
  });
});
