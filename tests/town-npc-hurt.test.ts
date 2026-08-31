// 城镇 NPC 受击链回归(原版三源):
// ① 玩家弹幕/近战 = 巫毒窄门(Damage_PVE_Inner :11970-11972:仅向导 22+向导娃 267 /
//    裁缝师 54+裁缝娃 1307);② 敌怪弹/陷阱弹 = hostile 分支恒命中(:11975 flag2);
// ③ 敌怪接触(GetHurtByOtherNPCs :93605)/岩浆(:94511)/溺水(:96118)走 TownNPC 内置。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC, drownCollision } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
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

// =====================================================================
// ★蓝队修复批回归（2026-08-31，四轮对抗 F1-F6）
// =====================================================================
describe('★F4 DrownCollision 探针几何（Collision.cs:1385-1430，gravDir=1）', () => {
  // 标定世界：y=40*16+4 → 探针盒 = x[165..175]（列10）× y[642..654]（行 40）。
  // 世界高取 160：DrownCollision 扫描上缘钳 maxTilesY−40（row 段须落在钳内）
  const Y = 40 * 16 + 4;
  function mk() {
    const world = new World(60, 160, 30, 'drown-geom');
    return world.store;
  }
  it('全液格命中：探针盒与降面液面四严格不等式成立', () => {
    const st = mk();
    st.liquid[st.idx(10, 40)] = 255; st.liquidType[st.idx(10, 40)] = 1;
    expect(drownCollision(st, 160, Y, 20, 42)).toBe(true);
  });
  it('降面水位边界（liquid=64 → 液面下探 12px）：未触面 false / 触面 true', () => {
    const st = mk();
    st.liquid[st.idx(10, 40)] = 64;
    // y=640：探针 [638..650]，液面顶 652 → 底 650 不大于之 → false
    expect(drownCollision(st, 160, 40 * 16, 20, 42)).toBe(false);
    // y=643：探针底 653 > 652 → true（:1422 字面 `vector.Y + num2 > vector2.Y` 严格式）
    expect(drownCollision(st, 160, 40 * 16 + 3, 20, 42)).toBe(true);
  });
  it('lava(2)/shimmer(4) 显式不计水（原文本面 !tile.lava() && !tile.shimmer()）', () => {
    for (const lt of [2, 4]) {
      const st = mk();
      st.liquid[st.idx(10, 40)] = 255; st.liquidType[st.idx(10, 40)] = lt;
      expect(drownCollision(st, 160, Y, 20, 42)).toBe(false);
    }
  });
  it('扫描首行实心排除：includeSlopes=false 跳过 / true 且 blockType!=0 计水', () => {
    // y=320 → 扫描首行 j0=floor(320/16)−1=19；探针 [318..330] 与行19 相交
    const st = mk();
    st.setTileSilent(10, 19, TILE_BY_KEY['dirt']!);   // active 实心 + 带液（半格内液形态）
    st.liquid[st.idx(10, 19)] = 255; st.liquidType[st.idx(10, 19)] = 1;
    expect(drownCollision(st, 160, 320, 20, 42)).toBe(false);          // 默认排除
    expect(drownCollision(st, 160, 320, 20, 42, false)).toBe(false);
    st.slope[st.idx(10, 19)] = 2;                                       // blockType!=0
    expect(drownCollision(st, 160, 320, 20, 42, true)).toBe(true);      // includeSlopes 计入
  });
});

describe('★F6 溺水致死一击（force 通道端到端 + 非强制守门判别）', () => {
  it('深水浸头：呼吸耗尽后静默 −2 直扣至 hp≤0 → hp=1 → hurt(2,…,force) 死亡分支', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16);
    guide.stationary = true;
    const { world, game } = makeEnv([guide], []);
    // 头部探针带（Top−2..+12 行段 ≈ row96/97 起落区）全覆盖：95..99 全列注水
    for (let y = 92; y <= 99; y++) {
      world.store.liquid[world.store.idx(100, y)] = 255;
      world.store.liquidType[world.store.idx(100, y)] = 1;
    }
    let died = false;
    for (let t = 0; t < 6000 && !died; t++) {
      guide.fixedUpdate(1 / 60, game);
      died = guide.dead;
    }
    expect(guide.dead).toBe(true);
    // 致死一击链终值：hp 先钳 1(:96077) 再吃 StrikeNPCNoInteraction(2) 的防御减算下限 1 → 0
    expect(guide.hp).toBe(0);
    expect(guide.iframes).toBeGreaterThan(0);   // 死亡经 hurt 主链结算（iframes=10 已置）
  });

  it('force 判别：iframes>0 或 ai[0]==25(shimmerRise) 下普通 hurt 早退 false，仅 force 结算', () => {
    const a = new TownNPC('nurse', 100 * 16, 99 * 16, new Inventory());
    const g = makeEnv([a], []).game;
    a.iframes = 10;
    expect(a.hurt(40, 0, 0, g)).toBe(false);
    expect(a.hp).toBe(250);                       // 早退零结算
    expect(a.hurt(40, 0, 0, g, 0, 0, false, true)).toBe(true);   // force 直击通道
    expect(a.hp).toBeLessThan(250);
    const b = new TownNPC('nurse', 120 * 16, 99 * 16, new Inventory());
    (b as unknown as { shimmerRise: boolean }).shimmerRise = true;   // ai[0]==25 dontTakeDamage
    // 承接位（hurt 内非 force 早退）——外部测试只经强制转型写私有旗
    expect(b.hurt(9, 0, 0, g)).toBe(false);
    expect(b.hurt(9, 0, 0, g, 0, 0, false, true)).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});

describe('★F3 互殴准入门与 GetMeleeCollisionData 加宽族', () => {
  it('CritterThatCanTurnOnPlayers 十型攻击者（639 等十表）不伤城镇 NPC（:93573 门②）', () => {
    const g = new TownNPC('guide', 100 * 16, 99 * 16);
    g.stationary = true;
    const critter = { x: 100 * 16 + 4, y: 96 * 16, w: 20, h: 40, dead: false,
      damage: 40, vanillaId: 639 };   // 十型集 ∈ NPCID.cs:4781
    const { game } = makeEnv([g], [critter]);
    g.fixedUpdate(1 / 60, game);
    expect(g.hp).toBe(250);
  });
  it('type 400 攻击者 npcRect=default 恒不中（:96147-51 替换语义）', () => {
    const g = new TownNPC('guide', 100 * 16, 99 * 16);
    g.stationary = true;
    const foe = { x: 100 * 16 + 4, y: 96 * 16, w: 20, h: 40, dead: false,
      damage: 40, vanillaId: 400 };
    const { game } = makeEnv([g], [foe]);
    g.fixedUpdate(1 / 60, game);
    expect(g.hp).toBe(250);
  });
  it('持械僵尸(430)咬合态武器侧 +34px 加宽命中；非咬合同位不中；伤害【不乘】1.25（乘区死参）', () => {
    const mkCase = (ai2: number) => {
      const g = new TownNPC('guide', 100 * 16, 99 * 16);
      g.stationary = true;
      g.rng = () => 0.5;                        // tier0 无偏——首击掷等于原值
      // 落位按「首拍坐标」计算（envHurtUpdate 在 moveAndCollide 前跑——
      // 第一拍受害盒 = spawn 位 [1598..1618]）：x=1020 的普通盒(宽18→[1620..])
      // 与之不交；咬合态左扩 34 → [1586..1638] 相交。
      const z = { x: 100 * 16 + 20, y: 96 * 16, w: 18, h: 40, dead: false,
        damage: 40, vanillaId: 430, facing: -1, ai2 };
      const { game } = makeEnv([g], [z]);
      g.fixedUpdate(1 / 60, game);
      return 250 - g.hp;
    };
    // 受端 = 向导 def(vanilla)=30：trunc(40×1 − 30×0.5)=25；若乘区被接将放大至 31+
    expect(mkCase(7)).toBe(25);
    expect(mkCase(0)).toBe(0);                  // 未咬合：同位素触不及（间隙 10px）
  });
});

describe('★F1③ HurtingBees 二次调用无 friendly/type37 门（:91601-03）', () => {
  function beeReflectLog(): number[] {
    return [];
  }
  it('蜂(210)接触可伤老者(37)；老者反蜇臂照常执行；普通敌怪仍被 :91593 门挡在体外', () => {
    const om = new TownNPC('old_man', 100 * 16, 98 * 16, new Inventory());
    expect((om as unknown as { vanillaId: number }).vanillaId).toBe(37);
    om.stationary = true;
    const reflected: Array<{ amount: number }> = [];
    const bee = { x: 100 * 16 + 4, y: 96 * 16, w: 20, h: 30, dead: false,
      damage: 12, vanillaId: 210,
      hurt(amount: number) { reflected.push({ amount }); return true; } };
    const { game } = makeEnv([om], [bee]);
    om.fixedUpdate(1 / 60, game);
    expect(om.hp).toBeLessThan(om.maxHp);       // ★F1③ 定案：老人伤害面放开
    expect(reflected.length).toBe(1);           // HurtingBees 反蜇枝一次（:93682-96）

    const om2 = new TownNPC('old_man', 120 * 16, 98 * 16, new Inventory());
    om2.stationary = true;
    const walker = { x: 120 * 16 + 4, y: 94 * 16, w: 20, h: 40, dead: false,
      damage: 40, vanillaId: 8 };
    const env2 = makeEnv([om2], [walker]);
    om2.fixedUpdate(1 / 60, env2.game);
    expect(om2.hp).toBe(om2.maxHp);             // 三连门 type!=37 依旧不动普通互殴
  });
});
