// 城镇 NPC 受击链回归(原版三源):
// ① 玩家弹幕/近战 = 巫毒窄门(Damage_PVE_Inner :11970-11972:仅向导 22+向导娃 267 /
//    裁缝师 54+裁缝娃 1307);② 敌怪弹/陷阱弹 = hostile 分支恒命中(:11975 flag2);
// ③ 敌怪接触(GetHurtByOtherNPCs :93605)/岩浆(:94511)/溺水(:96118)走 TownNPC 内置。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { Inventory } from '../src/items/Inventory';
import { hitTownNpcs } from '../src/entities/projTargets';
import { TILE } from '../src/core/constants';

// 穿甲接收端（对齐批④）：TownNPC.hurt 契约 = hurt(dmg,kbX,kbY,game,penPercent?,flatPen?)
// ——Player.cs:44700 FlyMeal penPercent=1f 的受端应用序（npcCheckArmorPenetration
// 加伤 → CalculateDamageNPCsTake 减防）。护师 def=15（vanilla-npcs.json / NPC.cs:9029）。
describe('TownNPC.hurt penPercent/flatPen 受端契约', () => {
  function nurse() {
    return new TownNPC('nurse', 100 * 16, 99 * 16, new Inventory());
  }
  const mkGame = (n: TownNPC) => ({
    world: new World(200, 200, 100, 'pen-world'),
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    addDamageNumber: () => {}, spawnParticles: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, critters: () => [], enemies: () => [],
  }) as never;

  it('缺省参完全向后兼容：def×0.5 减算不变（★F6 trunc：40−7.5=32.5→32）', () => {
    const n = nurse();
    n.hurt(40, 0, 0, mkGame(n));
    expect(250 - n.hp).toBe(32);          // CalculateDamageNPCsTake double 面不取整,
  });                                     // 末位 StrikeNPC_Inner (int) 截断(Main.cs:67126-31)
  it('penPercent=1（FlyMeal 面）：pool=trunc(def×1)=15 ≤ def → 加成 7（40+7−7.5=39.5→39）', () => {
    const n = nurse();
    n.hurt(40, 0, 0, mkGame(n), 1);
    expect(250 - n.hp).toBe(39);
  });
  it('pool 超防钳 def/2：flatPen=40 与 pct=1 同值（40>15 → 7；39.5→39）', () => {
    const n = nurse();
    n.hurt(40, 0, 0, mkGame(n), 0, 40);
    expect(250 - n.hp).toBe(39);
  });
  it('pct=0.5：pool=trunc(7.5)=7 <15 → 加成 3；trunc(40+3−7.5)=35', () => {
    const n = nurse();
    n.hurt(40, 0, 0, mkGame(n), 0.5);
    expect(250 - n.hp).toBe(35);
  });

  // ★F6（2026-08-31）：暴击乘法在【截断前】的 double 上、整体一次性 (int) 截断
  // （StrikeNPC_Inner NPC.cs:82067 字面）。旧式"先 round 再 ×2"在半值防上双偏差。
  it('★F6 暴击序：×2 施于截断前 double——非暴击 32 / 暴击 trunc(32.5×2)=65（旧式 66 假阳）', () => {
    const a = nurse();
    a.hurt(40, 0, 0, mkGame(a), 0, 0, false);
    expect(250 - a.hp).toBe(32);
    const b = nurse();
    b.hurt(40, 0, 0, mkGame(b), 0, 0, true);
    expect(250 - b.hp).toBe(65);
  });
  it('★F6 下限钳后暴击序：dmg8/def15 → calc 0.5 钳 1 → 非暴击 1 / 暴击 2', () => {
    const a = nurse();
    a.hurt(8, 0, 0, mkGame(a), 0, 0, false);
    expect(250 - a.hp).toBe(1);
    const b = nurse();
    b.hurt(8, 0, 0, mkGame(b), 0, 0, true);
    expect(250 - b.hp).toBe(2);           // Math.Max(1.0,…)*2(:82067 双参序)
  });
  it('★F9 飘值色单源：非暴击 DamagedFriendly #FF505A / 暴击 #FF641E（CombatText.cs:8/:10）', () => {
    const seen: Array<{ crit: boolean; color?: string }> = [];
    const g = {
      world: new World(200, 200, 100, 'color-world'),
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      addDamageNumber: (_x: number, _y: number, _amt: number, crit: boolean, color?: string) =>
        seen.push({ crit, color }),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      critters: () => [], enemies: () => [],
    } as never;
    const a = nurse(); a.hurt(20, 0, 0, g);
    const b = nurse(); b.hurt(20, 0, 0, g, 0, 0, true);
    expect(seen[0]).toEqual({ crit: false, color: '#FF505A' });
    expect(seen[1]).toEqual({ crit: true, color: '#FF641E' });
  });
});

function makeEnv(npcList: TownNPC[], enemyList: Array<{ x: number; y: number; w: number; h: number }> = [], killGuide = false) {
  const world = new World(200, 200, 100, 'hurt-test');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, equipStats: { killGuide, killClothier: false } },
    enemies: () => enemyList,
    npcs: () => npcList,
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {}, critters: () => [],
  } as never;
  return { world, game };
}

const box = { x: 100 * 16 - 10, y: 98 * 16, w: 20, h: 20 };

describe('城镇 NPC 受击链(巫毒门/hostile/环境)', () => {
  it('玩家弹幕无娃娃:向导/裁缝师均免疫(原版 :11970-11972 窄门)', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const { game } = makeEnv([guide], [], false);
    const hp0 = guide.hp;
    expect(hitTownNpcs(box, game, 30, 2, 'playerProj')).toBe(false);
    expect(guide.hp).toBe(hp0);
  });

  it('玩家弹幕 + 向导巫毒娃娃:向导(22)可伤,其他 NPC 仍免疫', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const merch = new TownNPC('merchant', 102 * 16, 99 * 16, new Inventory());
    const { game } = makeEnv([guide, merch], [], true);
    const g0 = guide.hp, m0 = merch.hp;
    hitTownNpcs(box, game, 30, 2, 'playerProj');
    expect(guide.hp).toBeLessThan(g0);      // 22 + killGuide → 命中
    expect(merch.hp).toBe(m0);              // 17 无门 → 免疫
  });

  it('敌怪弹(hostile 分支):任意城镇 NPC 恒命中(原版 :11975 flag2)', () => {
    const merch = new TownNPC('merchant', 100 * 16, 99 * 16, new Inventory());
    const { game } = makeEnv([merch], [], false);
    const m0 = merch.hp;
    expect(hitTownNpcs(box, game, 25, 0, 'hostile')).toBe(true);
    expect(merch.hp).toBeLessThan(m0);
  });

  it('敌怪接触(GetHurtByOtherNPCs :93605):重叠敌伤 NPC,30t 专属冷却', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    guide.stationary = true;
    const enemy = { x: 100 * 16 + 4, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40 };
    const { game } = makeEnv([guide], [enemy]);
    guide.fixedUpdate(1 / 60, game); // 首帧即应互殴
    expect(guide.hp).toBeLessThan(250);
    const hp1 = guide.hp;
    guide.fixedUpdate(1 / 60, game); // 冷却内不二连
    expect(guide.hp).toBe(hp1);
  });

  it('岩浆(:94511):50 直伤 + 30t 冷却', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    guide.stationary = true;
    const { world, game } = makeEnv([guide], []);
    for (let y = 95; y <= 99; y++) { // 落定前后中心格都覆盖
      world.store.liquid[world.store.idx(100, y)] = 255;
      world.store.liquidType[world.store.idx(100, y)] = 2;
    }
    for (let t = 0; t < 5; t++) guide.fixedUpdate(1 / 60, game);
    // hurt 扣防:50 - def(30)*0.5 = 35（★1456 向导 defense=30，NPC.cs:69207 case 22
    // 段——曾按 1405 旧值 15 断言 43，2026-08-21 数据对账修正）
    expect(guide.hp).toBe(250 - 35);
  });

  it('溺水(:96118):呼吸耗尽后每 7t 掉 2(不过防御)', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    guide.stationary = true;
    const { world, game } = makeEnv([guide], []);
    // 头部格(落定后 y≈97;95-99 全列注水覆盖起跳/落定两种位置)
    for (let y = 95; y <= 99; y++) {
      world.store.liquid[world.store.idx(100, y)] = 255;
      world.store.liquidType[world.store.idx(100, y)] = 1;
    }
    for (let t = 0; t < 200 * 7 + 10; t++) guide.fixedUpdate(1 / 60, game);
    expect(guide.hp).toBeLessThan(250);
  });
});
