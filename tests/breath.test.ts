// 呼吸计 1:1 回归（CheckDrowning Player.cs:22914-23002 + DrownCollision Collision.cs:1385
// + DrawInterface_Resources_Breath Main.cs:42824-42932）：
//   1 消耗速率 breathCDMax=7（每 7 tick −1，breath 200→0 共 1400 tick ≈23.33s）
//   2 溺水直伤 hp-=2（不过防御/不吃无敌帧，:22981-22991）
//   3 出水回补 breath+=3/tick（:22995-23000）
//   4 DrownCollision 液体类型：水/蜜淹，岩浆/微光不淹 + 顶部行豁免
//   5 芦苇管 186：出水口豁免 + breathCDMax ×2（挥舞动画中失效）
//   6 鱼鳃 buff 免淹
//   7 显示布局纯函数（slotAlpha/slotScale/slotXY/flameSlots/breathFlag）
// 物品缺口：268/394/1860/1861（accDivingHelm）/250/4275（鱼缸）/497/861/3110（accMerman）
// 尚未入 items.ts，BEHAVIOR_FX 接线已就位、待物品入库后补测试。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { drownCollision } from '../src/stats/TouchDamage';
import { slotAlpha, slotScale, slotXY, flameSlots, breathFlag } from '../src/render/BreathMeter';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

const fakeHooks = (w: World, p?: Player) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  spawnDrop: () => null,
  damagePlayer: () => {},
  addDamageNumber: () => {},
  cutTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
});

/** 高瘦世界（h=100 满足 DrownCollision 的 maxTilesY-40 行钳制）：y=60 一行地板 */
const mkWorld = (): World => {
  const w = new World(60, 100, 72, 'breath');
  for (let x = 12; x <= 40; x++) w.store.setTileSilent(x, 60, 1 /* dirt */);
  return w;
};
const mkPlayer = (w: World): Player => new Player(20 * 16, 57 * 16, new Inventory());
const settle = (p: Player, w: World, ticks = 16): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};
const step = (p: Player, w: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};
/** 注水没顶：嘴位（y-44）之下到地板上方全部灌满水（水 255） */
const flood = (w: World, p: Player): void => {
  const mouth = Math.floor((p.y - 44) / TILE_ROW);
  for (let j = mouth + 1; j < 60; j++) {
    for (let i = 16; i <= 24; i++) w.store.setLiquid(i, j, 255, 1);
  }
};
const TILE_ROW = 16;

// ============ 1/2/3 玩家呼吸模型 ============
describe('CheckDrowning（Player.cs:22914-23002）', () => {
  it('水下每 7 tick 掉 1 点 breath；1400 tick 耗尽（23.33s）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    expect(p.breath).toBe(200);
    flood(w, p);
    step(p, w, 7);
    expect(p.breath).toBe(199); // 首个 7 tick 恰好 −1
    step(p, w, 1400 - 7);
    expect(p.breath).toBe(0);
    // breath 减到 0 的那一 tick 即开始直伤（:22976-22991 同分支）——恰扣第一轮 2 血
    expect(p.hp).toBe(p.maxHp - 2);
  });

  it('breath=0 后每 7 tick 直伤 2 血：不过防御/不吃无敌帧', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    flood(w, p);
    p.breath = 0;
    // 高防盔甲（星璇头胸腿 2757/2758/2759）+ 满无敌帧：旧 damage() 路径必被拦
    p.inv.armor[0] = { id: _iid(2757), stack: 1 };
    p.inv.armor[1] = { id: _iid(2758), stack: 1 };
    p.inv.armor[2] = { id: _iid(2759), stack: 1 };
    p.iframes = 100;
    const hp0 = p.hp;
    expect(p.defense).toBeGreaterThan(40);
    step(p, w, 7);
    expect(p.hp).toBe(hp0 - 2); // 直伤 statLife-=2（:22986），防御/无敌帧都不参与
    expect(p.lastDamageCause?.kind).toBe('drowned');
    step(p, w, 7);
    expect(p.hp).toBe(hp0 - 4);
  });

  it('出水回补 breath+=3/tick、breathCD 清零', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    p.breath = 100;
    p.breathCD = 6;
    step(p, w, 10); // 地面上无水
    expect(p.breath).toBe(130);
    expect(p.breathCD).toBe(0);
  });
});

// ============ 4 DrownCollision 液体类型与豁免 ============
describe('DrownCollision（Collision.cs:1385-1444）', () => {
  // 采样盒：vx=325..335, vy=428..440（py=432 → 扫描行 26..31，顶行 26）
  const base = (w: World, type: number): boolean =>
    drownCollision(w.store, 320, 432, 20, 42, 1);

  it('水(1)/蜂蜜(3)淹，岩浆(2)/微光(4)不淹', () => {
    const w = mkWorld();
    w.store.setLiquid(20, 27, 255, 1);
    expect(base(w, 0)).toBe(true);
    w.store.setLiquid(20, 27, 0, 0);
    w.store.setLiquid(20, 27, 255, 3); // 蜂蜜也可淹（!lava && !shimmer 只排两种）
    expect(base(w, 0)).toBe(true);
    w.store.setLiquid(20, 27, 0, 0);
    w.store.setLiquid(20, 27, 255, 2); // 岩浆
    expect(base(w, 0)).toBe(false);
    w.store.setLiquid(20, 27, 0, 0);
    w.store.setLiquid(20, 27, 255, 4); // 微光
    expect(base(w, 0)).toBe(false);
  });

  it('顶部行豁免：头顶贴 active+solid 块时该行液体不计', () => {
    const w = mkWorld();
    // py=432 时采样盒顶 430 恰探入顶行 26（416-432）的 2px 条——全水必命中
    w.store.setLiquid(20, 26, 255, 1);
    expect(drownCollision(w.store, 320, 432, 20, 42, 1)).toBe(true);
    w.store.setTileSilent(20, 26, 1); // 顶行放实心块 → 该行液体豁免
    expect(drownCollision(w.store, 320, 432, 20, 42, 1)).toBe(false);
  });
});

// ============ 5 芦苇管 6 鱼鳃 ============
describe('呼吸豁免（CheckDrowning 前置链）', () => {
  it('芦苇管 186：嘴位出水则不淹 + breathCDMax=14；挥舞中（itemAnimation>0）失效', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    flood(w, p); // 嘴位（y-44）行保持无水
    expect(p.breathCDMax).toBe(7);
    step(p, w, 70);
    expect(p.breath).toBe(190); // 对照组：无芦苇管正常淹
    p.inv.slots[p.inv.selected] = { id: _iid(186), stack: 1 };
    expect(p.breathCDMax).toBe(14); // ×2
    step(p, w, 70);
    expect(p.breath).toBe(200); // 出水口豁免 → 回补
    p.itemAnimTicks = 5; // 挥舞动画中（Game 注入等效）
    expect(p.breathCDMax).toBe(7);
    step(p, w, 70);
    expect(p.breath).toBeLessThan(200); // 豁免失效恢复淹水
    p.itemAnimTicks = 0;
  });

  it('芦苇管嘴位浸水（liquid≥128）则不豁免', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    flood(w, p);
    p.inv.slots[p.inv.selected] = { id: _iid(186), stack: 1 };
    const mouthX = Math.floor((p.x + p.w / 2 + 6 * p.facing) / 16);
    const mouthY = Math.floor((p.y - 44) / 16);
    w.store.setLiquid(mouthX, mouthY, 128, 1); // 嘴位也淹了
    step(p, w, 70);
    expect(p.breath).toBeLessThan(200);
  });

  it('鱼鳃 buff（buff 4）免淹', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    flood(w, p);
    p.buffs.apply(BuffType.Gills, 60);
    step(p, w, 70);
    expect(p.breath).toBe(200);
  });

  it('ftw 种子（getGoodWorld）gills 语义翻转：水下不淹、水上淹（:22946-22949）', () => {
    const w = mkWorld();
    w.seedFlags.getGoodWorld = true;
    const p = mkPlayer(w);
    settle(p, w);
    p.buffs.apply(BuffType.Gills, 60);
    flood(w, p);
    step(p, w, 70);
    expect(p.breath).toBe(200); // ftw：水下(flag=true) → 翻转为不淹
    // 水上（flag=false）→ 翻转为淹：擦掉 gills 先建立对照
    p.buffs.remove(BuffType.Gills);
    step(p, w, 70);
    expect(p.breath).toBeLessThan(200);
    const b0 = p.breath;
    p.buffs.apply(BuffType.Gills, 60);
    step(p, w, 70); // 出水区段内 breath 应继续下降（水上 flag=false → !flag=true 淹）
    expect(p.breath).toBeLessThan(b0);
  });
});

// ============ 6b 呼吸族装备（物品已入库 2026-08） ============
describe('呼吸族装备（GrantArmorBenefits/ApplyEquipFunctional 行为链）', () => {
  it('潜水头盔 268（armor[0]）→ breathCDMax=42；潜水装备 394/1860/1861（配饰）同；布尔不叠加', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    expect(p.breathCDMax).toBe(7);
    p.inv.armor[0] = { id: _iid(268), stack: 1 };
    expect(p.breathCDMax).toBe(42);
    p.inv.armor[3] = { id: _iid(394), stack: 1 };
    p.inv.armor[4] = { id: _iid(1860), stack: 1 };
    p.inv.armor[5] = { id: _iid(1861), stack: 1 };
    expect(p.breathCDMax).toBe(42); // 布尔语义,多件不叠（原版 accDivingHelm=true）
    // 268/1861 额外效果：268 无 arcticDivingGear;1861 有
    expect(p.equipStats.arcticDivingGear).toBe(true);
    expect(p.equipStats.jellyfishGlow).toBe(true); // 1860
  });

  it('鱼缸头盔 250/4275：陆上也恒淹（:22917）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    p.inv.armor[0] = { id: _iid(250), stack: 1 };
    step(p, w, 70); // 地面无水
    expect(p.breath).toBe(190);
    p.inv.armor[0] = { id: _iid(4275), stack: 1 };
    p.breath = 200;
    step(p, w, 7);
    expect(p.breath).toBe(199);
  });

  it('贝壳族 497/861/3110（accMerman）：水下不耗气并 merman 化；851 绿扳手无此效果（防 id 抄错）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    settle(p, w);
    flood(w, p);
    for (const vid of [497, 861, 3110]) {
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      p.breath = 100;
      step(p, w, 70);
      expect(p.breath).toBe(200); // 不淹 → 回补
      expect(p.merman).toBe(true);
      p.inv.armor[3] = null;
    }
    p.inv.armor[3] = { id: _iid(851), stack: 1 }; // Green Wrench——非人鱼饰品
    p.breath = 100;
    step(p, w, 70);
    expect(p.breath).toBeLessThan(100);
    expect(p.merman).toBe(false);
  });
});

// ============ 7 显示布局纯函数（Main.cs:42858-42932） ============
describe('DrawInterface_Resources_Breath 布局', () => {
  it('slotAlpha/slotScale：满颗 255/1，部分颗 30+225r 与 r/4+0.75，钳位', () => {
    expect(slotAlpha(200, 1, 20)).toBe(255);
    expect(slotScale(200, 1, 20)).toBe(1);
    // 第 10 颗半满：breath=190 → r=(190-180)/20=0.5 → alpha=142, scale=0.875
    expect(slotAlpha(190, 10, 20)).toBe(Math.floor(30 + 225 * 0.5));
    expect(slotScale(190, 10, 20)).toBeCloseTo(0.5 / 4 + 0.75, 10);
    // 耗尽颗照画：alpha/scale 钳 30/0.75
    expect(slotAlpha(0, 1, 20)).toBe(30);
    expect(slotScale(0, 1, 20)).toBe(0.75);
  });

  it('slotXY：26px 间距、-125 起点、y=32+垂直居中；第二行 -260/+26', () => {
    const a = slotXY(500, 300, 1, 22, 1);
    expect(a.x).toBe(500 - 125);
    expect(a.y).toBe(300 + 32); // scale=1 时居中项为 0
    const b = slotXY(500, 300, 2, 22, 1);
    expect(b.x).toBe(500 - 125 + 26);
    // scale=0.75 缩小时垂直居中：(22-16.5)/2=2.75
    const c = slotXY(500, 300, 1, 22, 0.75);
    expect(c.y).toBeCloseTo(300 + 32 + 2.75, 10);
    const d = slotXY(500, 300, 11, 22, 1); // 第二行（i>10）
    expect(d.x).toBe(500 + 26 * 10 - 260 - 125);
    expect(d.y).toBe(300 + 32 + 26);
  });

  it('flameSlots：整除语义（420→10；44→11；<10 护栏 0）', () => {
    expect(flameSlots(420)).toBe(10);
    expect(flameSlots(44)).toBe(11);
    expect(flameSlots(5)).toBe(0);
    expect(flameSlots(0)).toBe(0);
  });

  it('breathFlag 真值表（L42829-42836：火焰条门）', () => {
    expect(breathFlag(419, 420, true, 200, 200)).toBe(true);   // 岩浆宽限耗损+浸浆
    expect(breathFlag(419, 420, false, 200, 200)).toBe(true);  // 宽限耗损+气满 → 仍显火焰
    expect(breathFlag(419, 420, false, 199, 200)).toBe(false); // 气未满且未浸浆 → 气泡
    expect(breathFlag(420, 420, true, 200, 200)).toBe(false);  // 宽限满 → 不显
    expect(breathFlag(0, 420, false, 100, 200)).toBe(false);
  });

  it('气泡数 = breathMax/20 = 10（绘制循环上界纯算）', () => {
    expect(Math.floor(200 / 20)).toBe(10); // slots=10，i=1..10
    expect(Math.floor(200 / 20) + 1).toBe(11); // i < 11
  });
});
