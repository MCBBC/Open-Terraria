// SW-BJ44（2026-09-09）岩浆钓鱼浮标面 1:1 回归。用户实报「地狱鱼饵也没能在岩浆钓鱼」。
// 物品定谳：原版无名为「地狱鱼饵」的物品；用户所指 = 岩浆饵生物族（zh-Hans l10n
//   ItemName：地狱蝴蝶 HellButterfly / 熔岩蝇 Lavafly / 岩浆蜗牛 MagmaSnail）。
// 金标（1457 反编译；1458 同域逐行核对同值）：
//   ① 浮标不因岩浆销毁：AI_061 浮支三液对称（Projectile.cs:54684-54753）、共享湿段
//      LavaCollision 只置 lavaWet 不 Kill（Projectile.cs:16906-16911）;Projectile.AI 内
//      lavaWet→Kill 唯一支 :26071 属 aiStyle 22 与浮标（aiStyle 61）无关。
//   ② 合法性 = 三源门：CanFishInLava[竿]||IsLavaBait[饵]||accLavaFishing
//      （Projectile.cs:20758;竿集 {2422 热线钓钩} ItemID.cs:1078、饵集
//      {4845 地狱蝴蝶,4847 熔岩蝇,4849 岩浆蜗牛} ItemID.cs:1080;配饰 4881/5064
//      Player.cs:14774-14776/:14787-14790）。
//   ③ 渔获表 LavaDrops：三源皆有才有渔获;AddStopper(InLava)（GameContentFishDropPopulator
//      .cs:247）→ 三源皆无 = 表全空 = TryGetItemDropType 恒 0 = 永不咬钩（原版即静默,
//      无任何提示、浮标永浮）。
//   ④ 饵消耗与液体无关：岩浆不烧饵;消耗仅发生在咬钩收竿掷
//      （Player.cs ItemCheck_CheckFishingBobber_ConsumeBait :53108-53175,消耗率
//      1/(1+bait/6)+钓具箱）。
// 变异判别力（红蓝自审）：回插旧自创门 `if (!this.ownerLavaOk()) { this.dead = true;
//   return; }` → ①③⑤ 全红（浮标入岩浆即死 = 用户实报根因复现）。
// 掷序注：rand→0 = 五档+crate 全中 + 咬钩门必过 + 收竿 1/7 断线 Next(7)==0 也会中——
//   断线掷须换 0.5（floor(0.5×7)=3≠0）,故 reel 面用 Once(0)+恒 0.5 序列。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { CAN_FISH_IN_LAVA_POLES, IS_LAVA_BAIT, tryGetItemDrop } from '../src/data/vanillaFishing';
import type { FishingRollCtx } from '../src/data/vanillaFishing';

const TILE = 16;
const itemOfVid = (vid: number) => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]!]!;

/** 岩浆池 harness：rows 40..42、30 宽 = 90 格 ≥ 75（FishingCheck 池门）。
 *  liquidType 2 = 岩浆（TileStore.liquidType：1 水/2 岩浆/3 蜜/4 微光）。 */
function mkLavaHarness() {
  const store = new TileStore(200, 120);
  for (let dx = 40; dx < 70; dx++) {
    for (let dy = 40; dy <= 42; dy++) store.setLiquid(dx, dy, 255, 2);
  }
  const player = new Player(50 * TILE, 36 * TILE, new Inventory());
  player.inv.selected = 5;
  player.inv.slots[5] = { id: itemOfVid(2289), stack: 1 };   // 木钓竿（power 5）
  const dusts: Array<{ x: number; y: number; w: number; h: number }> = [];
  const hooks = {
    world: {
      store,
      groundLevel: 100,
      rockLevel: 400,
      seedFlags: {},
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0, cloudBGAlpha: 0 },
      flags: { hardMode: false },
      scene: null,
    },
    player,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, _t: number) => {
      const d = { x, y, w, h };
      dusts.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { hooks, player, store, dusts };
}

/** 岩浆池内浮标：cy 预置 = 液面（GetWaterLine :54818-54821 = 41×16 − ⌊255/16⌋ = 641）
 *  → 浮态首拍即 settled（浮支 else 支字面 vy = wl − cy = 0）,免 float 收敛尾随机。 */
function mkLavaBobber(h: ReturnType<typeof mkLavaHarness>, baitVid: number, opts?: { poleVid?: number; accessoryLava?: boolean }) {
  const baitSlot = 6;
  h.player.inv.slots[baitSlot] = { id: itemOfVid(baitVid), stack: 5 };
  if (opts?.accessoryLava) {
    // 真装备面：4881 防熔线钓钩入配饰槽 3（ACC_ARMOR_START）→ equipStats 惰性重算
    h.player.inv.armor[3] = { id: itemOfVid(4881), stack: 1 };
    expect(h.player.equipStats.lavaFishing).toBe(true);
  }
  const b = new Bobber(54 * TILE, 641 - 7, 0, 0, 5, baitSlot,
    itemFuncOfVid(baitVid)?.bait ?? 0, () => h.player);
  b.poleVid = opts?.poleVid ?? 2289;
  b.baitVid = baitVid;
  return b;
}

/** 入岩浆漂浮 → 强制 lAI1>660（AI_061 :54779-54783）→ settled 拍触发 FishingCheck。 */
function settleAndCheck(b: Bobber, h: ReturnType<typeof mkLavaHarness>) {
  for (let i = 0; i < 60 && !b.floating; i++) b.fixedUpdate(1 / 60, h.hooks);
  expect(b.floating).toBe(true);
  (b as unknown as { lAI1: number }).lAI1 = 661;
  for (let i = 0; i < 20 && b.biteT === 0 && b.catchId === 0; i++) b.fixedUpdate(1 / 60, h.hooks);
}

afterEach(() => { vi.restoreAllMocks(); });

// ============ ① 入岩浆不烧毁（本刀:旧自创「无配饰即烧毁」退役） ============

describe('浮标入岩浆（AI_061 浮支三液对称,Projectile.cs:54684-54753）', () => {
  it('地狱蝴蝶饵 + 木竿、无配饰：入岩浆漂浮存活（旧门此处即 dead = 变异红）', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 4845);
    for (let i = 0; i < 30 && !b.floating; i++) b.fixedUpdate(1 / 60, h.hooks);
    expect(b.dead).toBe(false);
    expect(b.floating).toBe(true);
    expect(b.liquidKind).toBe('lava');
  });

  it('普通饵（2674 大师饵）无配饰：入岩浆同样漂浮（合法性与浮标生死无关）', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 2674);
    for (let i = 0; i < 30 && !b.floating; i++) b.fixedUpdate(1 / 60, h.hooks);
    expect(b.dead).toBe(false);
    expect(b.floating).toBe(true);
    expect(b.liquidKind).toBe('lava');
  });
});

// ============ ② 三源门矩阵（Projectile.cs:20758 + LavaDrops stopper :247） ============

describe('岩浆三源门矩阵（rand→0:crate 档必中 → 渔获 4877 黑曜石匣,pre-HM）', () => {
  it('地狱蝴蝶 4845（IsLavaBait）+ 木竿 → 咬钩 + 渔获', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 4845);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    expect(b.biteT).toBeGreaterThan(0);
    expect(b.catchId).toBe(4877);
  });

  it('熔岩蝇 4847 / 岩浆蜗牛 4849 各一臂 → 同样合法', () => {
    for (const vid of [4847, 4849]) {
      const h = mkLavaHarness();
      const b = mkLavaBobber(h, vid);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      settleAndCheck(b, h);
      expect(b.biteT).toBeGreaterThan(0);
      expect(b.catchId).toBe(4877);
    }
  });

  it('热线钓钩 2422（CanFishInLava 竿源）+ 普通饵 → 合法', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 2674, { poleVid: 2422 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    expect(b.biteT).toBeGreaterThan(0);
    expect(b.catchId).toBe(4877);
  });

  it('防熔线钓钩 4881 配饰（accLavaFishing）+ 普通饵 → 合法', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 2674, { accessoryLava: true });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    expect(b.biteT).toBeGreaterThan(0);
    expect(b.catchId).toBe(4877);
  });

  it('反例：普通饵、三源皆无 → 浮标存活但永不咬钩（stopper 全空,原版静默）', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 2674);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    expect(b.dead).toBe(false);
    expect(b.biteT).toBe(0);       // 无渔获无敌怪 → 不开窗（:20896-20911 只加速等待）
    expect(b.catchId).toBe(0);
    expect(b.catchEnemy).toBe(0);
  });

  it('数据面锚：CAN_FISH_IN_LAVA_POLES={2422}、IS_LAVA_BAIT={4845,4847,4849}', () => {
    expect([...CAN_FISH_IN_LAVA_POLES]).toEqual([2422]);
    expect([...IS_LAVA_BAIT].sort((a, b) => a - b)).toEqual([4845, 4847, 4849]);
  });
});

// ============ ③ 饵消耗语义（岩浆不烧饵;消耗只在咬钩收竿掷） ============

describe('岩浆饵消耗语义（Player.cs :53108-53175 与液体无关）', () => {
  it('漂浮/空咬不耗饵：地狱蝴蝶 stack 5 原封（原版无「岩浆烧饵」机制）', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 4845);
    for (let i = 0; i < 30 && !b.floating; i++) b.fixedUpdate(1 / 60, h.hooks);
    for (let i = 0; i < 200; i++) b.fixedUpdate(1 / 60, h.hooks);   // 含有机 FishingCheck
    expect(b.dead).toBe(false);
    expect(h.player.inv.slots[6]?.stack).toBe(5);
  });

  it('咬钩收竿：掷中消耗 1 个,渔获 = 岩浆渔获族入包路径返回', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 4845);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    expect(b.catchId).toBe(4877);
    vi.restoreAllMocks();
    // 收竿两掷：消耗率掷（0 → 必中 1/(1+15/6)）→ 1/7 断线掷（0.5 → 3≠0 不断线）
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.5);
    const caught = b.reel(h.hooks);
    expect(caught).toBe(4877);
    expect(h.player.inv.slots[6]?.stack).toBe(4);   // 5 − 1
  });

  it('岩浆收竿不溅水花（AI_061 DoASplash 门 :54626-54631 !lavaWet——溅花 100 粒缺席）', () => {
    const h = mkLavaHarness();
    const b = mkLavaBobber(h, 4845);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    settleAndCheck(b, h);
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.5);
    h.dusts.length = 0;
    expect(b.reel(h.hooks)).toBe(4877);
    expect(h.dusts.length).toBe(0);
  });
});

// ============ ④ vid↔名锚链（订正 vanillaFishing.ts 旧注名↔id 错位） ============

describe('岩浆饵 vid↔名锚链（NPCID.cs:12377-12381 → NPC.cs:17295/17310/17325 → Item.cs:39570-39595）', () => {
  it('4845=地狱蝴蝶(bait15)、4847=熔岩蝇(bait25)、4849=岩浆蜗牛(bait35)', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[4845]).toBe('vi_4845_HellButterfly');
    expect(VANILLA_ITEM_KEY_BY_ID[4847]).toBe('vi_4847_Lavafly');
    expect(VANILLA_ITEM_KEY_BY_ID[4849]).toBe('vi_4849_MagmaSnail');
    expect(itemFuncOfVid(4845)?.bait).toBe(15);
    expect(itemFuncOfVid(4847)?.bait).toBe(25);
    expect(itemFuncOfVid(4849)?.bait).toBe(35);
  });
});

// ============ ⑤ 规则表直检（LavaDrops stopper 数据面） ============

describe('LavaDrops stopper 数据面（GameContentFishDropPopulator.cs:239-247）', () => {
  const base: FishingRollCtx = {
    inLava: true, inHoney: false, junk: false, crate: false,
    common: true, uncommon: true, rare: true, veryrare: true, legendary: true,
    anyEnemies: false, canFishInLava: false,
    x: 1000, y: 100, waterTilesCount: 2000,
    rockLayer: 400, maxTilesX: 4200, heightLevel: 1, questFish: -1,
    hardMode: false, bloodMoon: false, combatBookWasUsed: false, remix: false,
    zones: { corrupt: false, crimson: false, jungle: false, snow: false, dungeon: false, desert: false, hallow: false },
    rolled: { corruption: false, crimson: false, jungle: false, snow: false, desert: false, infectedDesert: false, remixOcean: false },
  };
  it('三源皆无 → 0（stopper 终表）;canFishInLava 开 → 2312（veryrare 独占）', () => {
    expect(tryGetItemDrop({ ...base, legendary: false })).toBe(0);
    expect(tryGetItemDrop({ ...base, canFishInLava: true, legendary: false })).toBe(2312);
  });
});
