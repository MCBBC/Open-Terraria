// 缺失子系统补齐批回归（2026-09-01 T1+T2）：
//   T1 黄蜂枪 1155 全行为——出手侧 2-4 连发 volley（Player.cs:48809-48820）+
//      弹 189 aiStyle36 蜂族逐段（Arrow 追踪内核复用,homing-family-parity 同法）
//      + IDStatic 静态免疫组（SetDefaults :2777-2778 identity=type=189）+
//      撞块弹反（HandleMovement :19019-19030 蜂族四型）+ Hive Pack 双 +5
//      （Damage 面 :12855-12858/:12905-12907）。
//      ★定谳钉：Projectile.cs:13752-13760 OnHit 放蜂支受理门是 `type == 999`
//      = HiveFive 悠悠球弹（物品 5294），【非】黄蜂枪——189 命中侧无放蜂，
//      本文件以行为测试钉死该否证（弹命中敌后零伴生蜂）。
//   T2 旧世界跑酷指南 6190——SetDefaults（:47656-47660）无 useStyle/useTime/
//      accessory 数据面真值 + 全物品栏在场授予 equipStats.oldStyleParkour
//      （RefreshMechanicalAccsFromItemType :12933-12936）+ 右键 6190↔6195 快换
//      （Player.cs:31804-31808,仓内 Game.swapParkourBookVisual）依赖面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player, refreshMechanicalAccsFromItemType } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { Arrow, AI_STYLE36_TRACK_PARAMS } from '../src/entities/Arrow';
import { projectileData } from '../src/data/vanillaProjectiles';
import { projClassOfProjId } from '../src/entities/projTargets';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { vanillaStatOfVid, isAnyAccessory } from '../src/data/vanillaItemStats';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_ONLY_NEED_ONE_OVERRIDE } from '../src/data/items';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { waspGunVolleyRoll, waspGunHiveBonus } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 200;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; wet?: boolean; dontTakeDamage?: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: {
      store,
      get groundLevel() { return 80; },
    } as unknown as GameHooks['world'],
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnDust: (() => null) as never,
  };
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); },
    projectiles: [],
  };
  return { hooks, store, player, added };
}
const step = (p: Arrow, ticks: number, hooks: GameHooks): void => {
  for (let i = 0; i < ticks && !p.dead; i++) p.fixedUpdate(1, hooks);
};

describe('T1 黄蜂枪 1155：出手面（Player.cs:48809-48820）', () => {
  it('volley 掷骰 = Next(2,5)：三段位映射 2/3/4 且全域 ∈[2,4]', () => {
    expect(waspGunVolleyRoll(() => 0)).toBe(2);
    expect(waspGunVolleyRoll(() => 1 / 3)).toBe(3);
    expect(waspGunVolleyRoll(() => 2 / 3)).toBe(4);
    let min = 99, max = -1;
    for (let i = 0; i < 20000; i++) {
      const n = waspGunVolleyRoll(Math.random);
      min = Math.min(min, n); max = Math.max(max, n);
    }
    expect(min).toBe(2);
    expect(max).toBe(4);
  });

  it('Hive Pack 双 +5（:12855 穿甲 / :12905 终伤,暴击翻倍前）', () => {
    expect(waspGunHiveBonus(false)).toEqual({ dmg: 0, pen: 0 });
    expect(waspGunHiveBonus(true)).toEqual({ dmg: 5, pen: 5 });
  });

  it('物品 1155 数据面：auto 注册 + itemCombat 终值（Item.cs:14196-14212）', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[1155]).toBe('vi_1155_WaspGun');
    const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1155]];
    expect(ITEM_DEFS[iid]).toBeDefined();
    const c = itemCombat(1155)!;
    expect(c.damage).toBe(31);
    expect(c.mana).toBe(10);
    expect(c.useTime).toBe(18);
    expect(c.useAnimation).toBe(18);
    expect(c.shoot).toBe(189);
    expect(c.shootSpeed).toBe(9);
    expect(c.knockBack).toBeCloseTo(0.25, 5);
    expect(c.noMelee).toBe(true);
    expect(c.autoReuse).toBe(true);
    expect(c.magic).toBe(true);
  });
});

describe('T1 弹 189：数据面 + projClass 投影（SetDefaults :2771-2781）', () => {
  it('vanilla-projectiles 189 行逐值', () => {
    const pd = projectileData(189)!;
    expect(pd.aiStyle).toBe(36);
    expect(pd.width).toBe(8);
    expect(pd.height).toBe(8);
    expect(pd.penetrate).toBe(3);
    expect(pd.timeLeft).toBe(600);
    expect(pd.extraUpdates).toBe(3);
    expect(pd.armorPenetration).toBe(10);
    expect(pd.friendly).toBe(true);
    expect(pd.magic).toBe(true);
  });
  it('projClass 投影：189=magic（SetDefaults 直写）;181/566 仍 null（金标口径）', () => {
    expect(projClassOfProjId(189)).toBe('magic');
    expect(projClassOfProjId(181)).toBeNull();
    expect(projClassOfProjId(566)).toBeNull();
  });
  it('否证钉：189 无中毒/debuff 面（SetDefaults 无 buffType;projstatus 表无行）', () => {
    // 原版 189 SetDefaults（:2771-2781）无 buffType 赋值;Damage() 全链无 189
    // AddBuff 支——"黄蜂弹带毒"系任务稿误记，数据面 vanilla-projstatus.json
    // 无 189 行即真值投影。任一 AddBuff(20)（Poisoned）接线都将是凭空造面。
    const status = JSON.parse(readFileSync(join(__dirname, '../src/data/vanilla-projstatus.json'), 'utf8')) as Record<string, unknown>;
    expect(status['189']).toBeUndefined();
    expect((projectileData(189) ?? {}) as Record<string, unknown>).not.toHaveProperty('buffType');
  });
  it('IDStatic 静态免疫组：identity=type=189、cd 10t≈167ms（:2777-2778+P.cs:784）', () => {
    const { hooks } = makeHooks();
    const wasp = new Arrow(60 * 16, 90 * 16, 9, 0, 31, 0.25, 189, null, { grav: 0 });
    expect(wasp.idStaticGroup).toBe(189);
    expect(wasp.idStaticCdMs).toBe(167);
    // 181/566 共用组键 181（UseGroupStaticImmunity(181)）不与 189 互斥
    const bee = new Arrow(60 * 16, 90 * 16, 9, 0, 9, 1, 181, null, { grav: 0 });
    expect(bee.idStaticGroup).toBe(181);
    void hooks;
  });
});

describe('T1 弹 189：aiStyle36 蜂族 AI 逐段（1457 :27683-27862）', () => {
  it('逐型参数 189=[9,0.2]（:27795-27798）', () => {
    expect(AI_STYLE36_TRACK_PARAMS[189]).toEqual([9, 0.2]);
  });
  it('30 update 索敌延迟后逐轴转向收敛（:27761-27764+:27823-27862）', () => {
    const e2 = mkEnemy(2, 60 * 16 - 200, 90 * 16 + 100);
    const { hooks: h2 } = makeHooks([e2]);
    const wasp = new Arrow(60 * 16, 90 * 16, -9, 0, 31, 0.25, 189, null, { grav: 0 });
    step(wasp, 60, h2);
    expect(wasp.dead).toBe(false);
    expect(wasp.vy).toBeGreaterThan(0);      // 延迟后朝左下敌折线转向
  });
  it('800 曼哈顿门（:27772）：远敌不锁 → 保持直飞', () => {
    const far = mkEnemy(3, 60 * 16 - 1000, 90 * 16);
    const { hooks: hFar } = makeHooks([far]);
    const wasp = new Arrow(60 * 16, 90 * 16, -9, 0, 31, 0.25, 189, null, { grav: 0 });
    step(wasp, 80, hFar);
    expect(wasp.dead).toBe(false);
    expect(wasp.vy).toBe(0);
  });
  it('入水消亡（:27685-27688）/ 蜂蜜豁免', () => {
    const e = mkEnemy(1, 60 * 16 + 100, 90 * 16);
    const { hooks, store } = makeHooks([e]);
    const tx = 60, ty = 90;
    store.liquid[store.idx(tx, ty)] = 200;
    store.liquidType[store.idx(tx, ty)] = 1;   // WATER（LIQUID_TYPE +1 编码）
    const wasp = new Arrow(tx * 16, ty * 16, 9, 0, 31, 0.25, 189, null, { grav: 0 });
    wasp.fixedUpdate(1, hooks);
    expect(wasp.dead).toBe(true);
    store.liquidType[store.idx(tx, ty)] = 3;   // HONEY 豁免（!honeyWet 门）
    const wasp2 = new Arrow(tx * 16, ty * 16, 9, 0, 31, 0.25, 189, null, { grav: 0 });
    wasp2.fixedUpdate(1, hooks);
    expect(wasp2.dead).toBe(false);
  });
});

describe('T1 弹 189：撞块弹反（HandleMovement :19019-19030 蜂族四型）', () => {
  it('penetrate>0 撞实心块不消亡：pierce-- + 主轴全速反号', () => {
    const { hooks, store } = makeHooks();
    for (let y = 88; y <= 92; y++) store.setTile(70, y, 1);   // 竖墙
    const wasp = new Arrow(66 * 16, 90 * 16, 9, 0, 31, 0.25, 189, null, { grav: 0, life: 600 });
    step(wasp, 12, hooks);
    expect(wasp.dead).toBe(false);
    expect(wasp.pierce).toBe(2);            // 3→2（命中侧/撞侧共用同一计数）
    expect(wasp.vx).toBeLessThan(0);        // 反号弹回
  });
  it('pierce 归零后不再弹反 → 通用消亡口（原版 penetrate>0 门反面）', () => {
    const { hooks, store } = makeHooks();
    for (let y = 88; y <= 92; y++) store.setTile(70, y, 1);
    const wasp = new Arrow(66 * 16, 90 * 16, 9, 0, 31, 0.25, 189, null, { grav: 0, life: 600 });
    // 人工压穿透=1：一次弹反耗尽后再次撞墙必死
    wasp.pierce = 1;
    wasp.pierceInit = 1;
    step(wasp, 12, hooks);
    expect(wasp.pierce).toBe(0);
    expect(wasp.dead).toBe(false);          // 第一次撞块弹反存活
    step(wasp, 200, hooks);                 // 折回再撞（或飞行耗尽前）撞墙 → 消亡
    expect(wasp.dead).toBe(true);
  });
});

describe('T1 否证钉：189 命中侧无放蜂（999 陷阱拆除）', () => {
  it('弹命中敌后零伴生蜂（Projectile.cs:13752 支 type==999=HiveFive 非黄蜂枪）', () => {
    const e = mkEnemy(1, 60 * 16 + 40, 90 * 16);
    const { hooks, added } = makeHooks([e]);
    const wasp = new Arrow(60 * 16, 90 * 16, 9, 0, 31, 0.25, 189, null, { grav: 0, life: 600 });
    step(wasp, 30, hooks);
    expect(e.hits.length).toBeGreaterThan(0);   // 已结算命中
    const bees = added.filter((a) => a instanceof Arrow
      && [181, 566, 189].includes((a as Arrow).projId));
    expect(bees.length).toBe(0);                // 无任何伴生蜂生成
  });
});

describe('T2 旧世界跑酷指南 6190：SetDefaults 真值 + 生效链', () => {
  it('数据面：auto 注册 + value 350000（sellPrice(0,7)×5 :47657）+ rare 10', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[6190]).toBe('vi_6190_OldStyleParkourBook');
    expect(VANILLA_ITEM_KEY_BY_ID[6195]).toBe('vi_6195_OldStyleParkourBookInactive');
    const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[6190]];
    expect(ITEM_DEFS[iid].value).toBe(350000);
    // rare 走 vanilla-itemrare（SetShopValues(ItemRarityColor.StrongRed10)）
    const rare = JSON.parse(readFileSync(join(__dirname, '../src/data/vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
    expect(rare['6190']).toBe(10);
    expect(rare['6195']).toBe(10);
  });
  it('非配饰真值（:47656-47660 无 accessory;不在 ACC_STATS_1457）', () => {
    expect(vanillaStatOfVid(6190)).toBeNull();
    expect(vanillaStatOfVid(6195)).toBeNull();
    const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[6190]];
    expect(isAnyAccessory(iid)).toBe(false);
    // 无使用面：itemCombat 无条目 = 无 useStyle/useTime/useAnimation/shoot
    expect(itemCombat(6190)).toBeNull();
  });
  it('在场授予：refreshMechanicalAccsFromItemType(6190) → oldStyleParkour（:12933）', () => {
    const mk = () => ({ mechShowWires: false, autoActuator: false, autoPaint: false,
      dontHurtCritters: false, preventAllItemPickups: false, hasLucyTheAxe: false,
      oldStyleParkour: false });
    const f1 = mk();
    refreshMechanicalAccsFromItemType(f1, 6190);
    expect(f1.oldStyleParkour).toBe(true);
    const f2 = mk();
    refreshMechanicalAccsFromItemType(f2, 6195);   // 未激活态不授予
    expect(f2.oldStyleParkour).toBe(false);
  });
  it('右键快换依赖面：两型 def 可解析 + EmergencyStacking 覆写表已含（:47878）', () => {
    expect(invIndexOfVanilla(6190)).toBeGreaterThanOrEqual(0);
    expect(invIndexOfVanilla(6195)).toBeGreaterThanOrEqual(0);
    expect(ITEM_ONLY_NEED_ONE_OVERRIDE[6190]).toBe(true);
    expect(ITEM_ONLY_NEED_ONE_OVERRIDE[6195]).toBe(true);
  });
  it('l10n：ItemTooltip 两键已入产物（zh-Hans 真值 / en-US 真值）', () => {
    for (const loc of ['zh-Hans', 'en-US']) {
      const l = JSON.parse(readFileSync(join(__dirname, `../public/l10n/${loc}.json`), 'utf8')) as Record<string, Record<string, string>>;
      const it16 = l.ItemTooltip ?? {};
      expect(it16.OldStyleParkourBook, `${loc} active tooltip`).toBeTruthy();
      expect(it16.OldStyleParkourBookInactive, `${loc} inactive tooltip`).toBeTruthy();
      // 键名走原版 Pascal 键（ItemTooltip.OldStyleParkourBook）
      expect((l.ItemName ?? {}).OldStyleParkourBook).toBeTruthy();
    }
  });
});
