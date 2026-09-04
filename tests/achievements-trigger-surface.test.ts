// 成就触发面审计修复批（2026-09-04）回归——只锁运行时触发面（注册表/引擎已另测）：
//   P0 ①钓夫五连（Main.cs:40954 HandleAnglerService 接线）②镇民入住 prog 8/17/18/26
//      （WorldGen.cs:5381/5498/5502/5531/5597 + AchievementsHelper.cs:196）
//      ③UI→背包 pickup（ItemSlot.cs case-0 语义=落背包才发）
//   P1 ④岩浆钓（Projectile.cs:20921）⑤微光转化 prog 27（WorldItem.cs:1878）
//      ⑥TRAINING_DAY 40 ⑦ON_FLEEK 38 ⑧MINI_ME 41（Player.cs:25886-25902）
//      ⑩achOnWorldEnter bank0-4+loadouts（cs:118-168）
//   P2 ⑮DRINK_BOTTLED（Player.cs:5537/:43204）⑯机械矿车 prog 32（Mount.cs:6369）
//      ⑱BOULDER_LORD prog 30 / ⑰QUEEN_MACHINE prog 31（NPC.cs:80218/:79681）
// Game 侧桩 = Object.create(Game.prototype) 惯例（tests/_hammer-wall-priority.test.ts 同式）
import { describe, it, expect } from 'vitest';
import { Achievements } from '../src/core/Achievements';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Bobber } from '../src/entities/Bobber';
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { lootAllFromContainer } from '../src/stats/QuickStacking';
import { ITEM_DEFS } from '../src/data/items';
import { VI_ID } from '../src/data/itemKeys';
import { TILE_BY_KEY } from '../src/data/tiles';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { ACH_DEFS } from '../src/data/vanillaAchievements';
import { BuffType } from '../src/stats/Buffs';

const TILE = 16;
type GameHooks = import('../src/entities/types').GameHooks;

/** 内存成就实例（无持久化） */
const ach = () => new Achievements(null);

/** Game 原型桩（无构造器副作用；字段按测试面注入） */
function stubGame(): Game {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.achievements = ach();
  return g as unknown as Game;
}

/** 内部 id 反查（按 vanillaItemStats 槽位谓词）——MINI_ME/ON_FLEEK 装备用 */
function internalOfArmor(pred: (s: { hs?: number; bs?: number; ls?: number }) => boolean): number {
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const s = statOfInternal(i);
    if (s && pred(s)) return i;
  }
  return -1;
}

const byDef = (n: string) => ACH_DEFS.find((d) => d.name === n)!;

// ---------------------------------------------------------------------------
// 注册表条件形状（触发面的数据前提）
// ---------------------------------------------------------------------------
describe('受影响成就的注册表条件', () => {
  it('钓夫五连：flag Finish + 四计数 10/25/50/200', () => {
    expect(byDef('SERVANT_IN_TRAINING').conditions[0]).toMatchObject({ kind: 'flag', name: 'Finish' });
    expect(byDef('GOOD_LITTLE_SLAVE').conditions[0]).toMatchObject({ kind: 'int', value: 10 });
    expect(byDef('TROUT_MONKEY').conditions[0]).toMatchObject({ kind: 'int', value: 25 });
    expect(byDef('FAST_AND_FISHIOUS').conditions[0]).toMatchObject({ kind: 'int', value: 50 });
    expect(byDef('SUPREME_HELPER_MINION').conditions[0]).toMatchObject({ kind: 'int', value: 200 });
  });
  it('入住/复查/状态/杂项：prog 8/17/18/26/27/30/31/32/38/39/40/41 + 旗条件', () => {
    for (const [n, ev] of [['NO_HOBO', 8], ['REAL_ESTATE_AGENT', 17], ['IT_CAN_TALK', 18],
      ['ALL_TOWN_SLIMES', 26], ['TRANSMUTE_ITEM', 27], ['BOULDER_LORD', 30],
      ['QUEEN_MACHINE', 31], ['ROLLIN_IN_YOUR_GRAVE', 32], ['ON_FLEEK', 38],
      ['FORTUNE_FAVORS_THE_BOULD', 39], ['TRAINING_DAY', 40], ['MINI_ME', 41]] as const) {
      expect(byDef(n).conditions[0]).toMatchObject({ kind: 'progressionEvent', ids: [ev] });
    }
    expect(byDef('GO_LAVA_FISHING').conditions[0]).toMatchObject({ kind: 'flag', name: 'Do' });
    expect(byDef('DRINK_BOTTLED_WATER_WHILE_DROWNING').conditions[0]).toMatchObject({ kind: 'flag', name: 'Use' });
    expect(byDef('FLY_A_KITE_ON_A_WINDY_DAY').conditions[0]).toMatchObject({ kind: 'flag', name: 'Use' });
    expect(byDef('RAINBOWS_AND_UNICORNS').conditions[0]).toMatchObject({ kind: 'flag', name: 'Use' });
    expect(byDef('TO_INFINITY_AND_BEYOND').conditions[0]).toMatchObject({ kind: 'flag', name: 'Do' });
  });
});

// ---------------------------------------------------------------------------
// 引擎：HandleAnglerService（AchievementsHelper.cs:423-431 1:1）
// ---------------------------------------------------------------------------
describe('① handleAnglerService 五连阈值', () => {
  it('一次服务 → SERVANT_IN_TRAINING 完成、GOOD_LITTLE_SLAVE 进 1/10', () => {
    const a = ach();
    a.handleAnglerService();
    expect(a.isCompleted('SERVANT_IN_TRAINING')).toBe(true);
    expect(a.isCompleted('GOOD_LITTLE_SLAVE')).toBe(false);
    expect(a.progressOf('GOOD_LITTLE_SLAVE').ratio).toBeCloseTo(0.1);
  });
  it('10/25/50/200 次逐档完成', () => {
    const a = ach();
    for (let i = 0; i < 10; i++) a.handleAnglerService();
    expect(a.isCompleted('GOOD_LITTLE_SLAVE')).toBe(true);
    for (let i = 0; i < 15; i++) a.handleAnglerService();
    expect(a.isCompleted('TROUT_MONKEY')).toBe(true);
    for (let i = 0; i < 25; i++) a.handleAnglerService();
    expect(a.isCompleted('FAST_AND_FISHIOUS')).toBe(true);
    for (let i = 0; i < 150; i++) a.handleAnglerService();
    expect(a.isCompleted('SUPREME_HELPER_MINION')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ① 交任务点接线：anglerQuestTurnIn → handleAnglerService（Main.cs:40954 if(flag) 支）
// ---------------------------------------------------------------------------
describe('① 钓夫任务交鱼接线（Game.anglerQuestTurnIn）', () => {
  function anglerGame() {
    const w = new World(200, 200, 7, 'angler');
    w.anglerQuest = 0;
    const g = stubGame();
    g.world = w;
    const rg = g as unknown as Record<string, unknown>;
    rg.dialogNpc = { vanillaId: 369 };
    rg.playerName = () => 'tester';
    rg.grantAnglerRewards = () => {};
    rg.refreshNpcDialog = () => {};
    rg.sfx = { play: () => {} };
    rg.cb = { onInventoryChanged: () => {} };
    const inv = new Inventory();
    rg.player = { inv, anglerQuestsFinished: 0, maxHp: 100, maxMana: 20 };
    return { g, w, inv };
  }
  it('交鱼成功 → SERVANT_IN_TRAINING 完成、计数前进', () => {
    const { g, inv } = anglerGame();
    const questVid = (g as unknown as { anglerQuestItemId(): number }).anglerQuestItemId();
    expect(questVid).toBeGreaterThan(0);
    expect(inv.add(VI_ID(questVid), 1)).toBe(0);
    (g as unknown as { anglerQuestTurnIn(): void }).anglerQuestTurnIn();
    expect(g.achievements.isCompleted('SERVANT_IN_TRAINING')).toBe(true);
    expect(g.achievements.progressOf('GOOD_LITTLE_SLAVE').ratio).toBeCloseTo(0.1);
  });
  it('同日已交 → 二次点击不再计数', () => {
    const { g, inv } = anglerGame();
    const questVid = (g as unknown as { anglerQuestItemId(): number }).anglerQuestItemId();
    inv.add(VI_ID(questVid), 2);
    const turnIn = () => (g as unknown as { anglerQuestTurnIn(): void }).anglerQuestTurnIn();
    turnIn();
    turnIn();   // anglerQuestFinished=true → done=false → 不再 handleAnglerService
    expect(g.achievements.progressOf('GOOD_LITTLE_SLAVE').ratio).toBeCloseTo(0.1);
  });
});

// ---------------------------------------------------------------------------
// ② REAL_ESTATE_AGENT / ALL_TOWN_SLIMES 复查器（WorldGen.cs:5581-5598 1:1）
// ---------------------------------------------------------------------------
describe('② 有房镇民复查器 checkAchievementRealEstateAndTownSlimes', () => {
  const ROSTER: Array<[string, number]> = [
    ['demolitionist', 38], ['merchant', 17], ['goblin_tinkerer', 107], ['arms_dealer', 19],
    ['guide', 22], ['mechanic', 124], ['witch_doctor', 228], ['steampunker', 178],
    ['nurse', 18], ['pirate', 229], ['cyborg', 209], ['clothier', 54], ['wizard', 108],
    ['truffle', 160], ['dryad', 20], ['angler', 369], ['dyer', 207], ['painter', 227],
    ['party_girl', 208], ['tax_collector', 441], ['stylist', 353], ['tavernkeep', 550],
    ['golfer', 588], ['zoologist', 633], ['princess', 663],
  ];
  const SLIMES: Array<[string, number]> = [
    ['town_slime_blue', 670], ['town_slime_cool', 678], ['town_slime_old', 679],
    ['town_slime_clumsy', 680], ['town_slime_diva', 681], ['town_slime_red', 682],
    ['town_slime_yellow', 683], ['town_slime_squire', 684],
  ];
  const housedNpc = (key: string, id: number) => {
    const n = new TownNPC(key, 10 * TILE, 10 * TILE, new Inventory());
    expect(n.vanillaId).toBe(id);
    n.home = { x: 10, y: 10 };
    return n;
  };
  const check = (g: Game) =>
    (g as unknown as { checkAchievementRealEstateAndTownSlimes(): void })
      .checkAchievementRealEstateAndTownSlimes();
  it('全 25 型有房 → REAL_ESTATE_AGENT（17）；史莱姆未齐不发', () => {
    const g = stubGame();
    (g as unknown as Record<string, unknown>).entities = { npcs: ROSTER.map(([k, id]) => housedNpc(k, id)), projectiles: [], enemies: [] };
    check(g);
    expect(g.achievements.isCompleted('REAL_ESTATE_AGENT')).toBe(true);
    expect(g.achievements.isCompleted('ALL_TOWN_SLIMES')).toBe(false);
  });
  it('缺一型 → 不发；补齐后可补发（幂等）', () => {
    const g = stubGame();
    (g as unknown as Record<string, unknown>).entities = { npcs: ROSTER.slice(1).map(([k, id]) => housedNpc(k, id)), projectiles: [], enemies: [] };
    check(g);
    expect(g.achievements.isCompleted('REAL_ESTATE_AGENT')).toBe(false);
    ((g as unknown as Record<string, unknown>).entities as { npcs: TownNPC[] }).npcs.push(housedNpc(ROSTER[0][0], ROSTER[0][1]));
    check(g);
    expect(g.achievements.isCompleted('REAL_ESTATE_AGENT')).toBe(true);
  });
  it('无家（homeless）镇民不记档；镇民史莱姆全 8 型有房 → ALL_TOWN_SLIMES（26）', () => {
    const g = stubGame();
    const homeless = new TownNPC('merchant', 0, 0, new Inventory());   // home=null
    (g as unknown as Record<string, unknown>).entities = {
      npcs: [...SLIMES.map(([k, id]) => housedNpc(k, id)), homeless],
      projectiles: [], enemies: [],
    };
    check(g);
    expect(g.achievements.isCompleted('ALL_TOWN_SLIMES')).toBe(true);
    expect(g.achievements.isCompleted('REAL_ESTATE_AGENT')).toBe(false);  // homeless 17 型不算
  });
});

// ---------------------------------------------------------------------------
// ③ UI→背包 pickup（case-0 语义：落背包才发，按实际落袋数）
// ---------------------------------------------------------------------------
describe('③ pickup 通知面', () => {
  it('Loot All 入包（QuickStacking.onPickup）：入袋才通知、按实际落袋数', () => {
    const a = ach();
    const inv = new Inventory();
    const items: Array<{ id: number; stack: number } | null> = [{ id: VI_ID(35), stack: 5 }];   // 铁矿 35 → HEAVY_METAL
    const seen: Array<[number, number]> = [];
    lootAllFromContainer(inv, items, undefined, {
      onPickup: (id, n) => { seen.push([id, n]); a.notifyItemPickup(35); },
    });
    expect(items[0]).toBeNull();                       // 全部入包
    expect(seen).toEqual([[VI_ID(35), 5]]);
    expect(a.isCompleted('HEAVY_METAL')).toBe(true);
  });
  it('npcShopBuy 空手直入背包 → 通知；光标代持支不通知', () => {
    const buyGame = (held?: { id: number; stack: number }) => {
      const g = stubGame();
      g.world = new World(120, 120, 3, 'shop');
      const rg = g as unknown as Record<string, unknown>;
      rg.shopStockFor = () => [[35, 100]];            // 铁矿 35 价 100 铜
      rg.dialogNpc = {};
      rg.shopHappinessMul = 1;
      rg.coinsOwned = () => 1_000_000;
      rg.spendCopper = () => true;
      rg.shopSellbackMemo = new Map();
      rg.shopBuybackStock = [];
      rg.openNpcShop = () => {};
      rg.sfx = { play: () => {} };
      rg.cb = { onInventoryChanged: () => {}, onToast: () => {} };
      const inv = new Inventory();
      rg.player = { inv, equipStats: { discount: false }, maxHp: 100, maxMana: 20 };
      const res = (g as unknown as { npcShopBuy(v: number, b?: number, h?: typeof held): boolean })
        .npcShopBuy(35, undefined, held);
      return { g, res };
    };
    const a1 = buyGame();
    expect(a1.res).toBe(true);
    expect(a1.g.achievements.isCompleted('HEAVY_METAL')).toBe(true);   // 落背包才发
    const a2 = buyGame({ id: VI_ID(35), stack: 1 });                   // 光标代持：不落背包不通知
    expect(a2.res).toBe(true);
    expect(a2.g.achievements.isCompleted('HEAVY_METAL')).toBe(false);
  });
  it('placeHeld 落背包格 → 通知（ItemSlot case 0 :932 语义）', () => {
    const g = stubGame();
    const inv = new Inventory();
    (g as unknown as Record<string, unknown>).player = { inv };
    (g as unknown as Record<string, unknown>).sfx = { play: () => {} };
    const ui = Object.create(UI.prototype) as unknown as {
      heldStack: { id: number; stack: number } | null;
      game: Game;
      placeHeld(i: number, where: string): void;
    };
    ui.game = g;
    ui.heldStack = { id: VI_ID(35), stack: 1 };
    ui.placeHeld(0, 'inv');
    expect(ui.heldStack).toBeNull();
    expect(g.achievements.isCompleted('HEAVY_METAL')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ GO_LAVA_FISHING（Projectile.cs:20921-20923 SetFishingCheckResults 尾）
// ---------------------------------------------------------------------------
describe('④ 岩浆钓成就接线（Bobber.fishingCheck）', () => {
  function lavaWorld() {
    const w = new World(60, 60, 5, 'lava');
    const st = w.store;
    for (let x = 20; x < 40; x++) {
      for (let y = 30; y < 40; y++) {
        const i = st.idx(x, y);
        st.liquid[i] = 255;
        st.liquidType[i] = 2;                          // lava
      }
    }
    w.groundLevel = 25;
    w.rockLevel = 45;
    return w;
  }
  function bobberStub(poleVid: number) {
    const b = Object.create(Bobber.prototype) as unknown as Record<string, unknown> & {
      fishingCheck(p: unknown, game: GameHooks, idx: number): void;
    };
    b.x = 30 * TILE; b.y = 32 * TILE; b.w = 8; b.h = 8;   // 中心在熔岩池内
    b.dead = false;
    b.poleVid = poleVid;                                   // 2422 热线钓钩 = CanFishInLava
    b.baitVid = 1;
    b.polePower = 500; b.baitPower = 10;                   // private 构造参（运行时直填）
    // ★渔力≥125 使咬钩门 Next(100) <= ⌊(力+75)/2⌋ 恒过——否则 FishingCheck 在
    // :397 咬钩掷早退（原版同语义:掷败不抵 SetFishingCheckResults）→ 测试非确定
    b.baitSlot = 0; (b as unknown as { ownerRef: () => unknown }).ownerRef = () => null;
    b.ai1 = 0; b.lAI1 = 0; b.retract = 0; b.floating = true;
    b.catchId = 0; b.catchEnemy = 0; b.truffleBite = false;
    return b;
  }
  const playerStub = () => ({
    inWater: false, inHoney: false, dead: false, luck: 0,
    buffs: { has: () => false }, equipStats: { fishingSkill: 0 },
    inv: new Inventory(), displayedFishingInfo: '',
    maxHp: 100, maxMana: 20, cx: 30 * TILE, cy: 20 * TILE,
  });
  it('CanFishInLava 竿 + inLava → handleSpecialEvent(19)（GO_LAVA_FISHING）', () => {
    const w = lavaWorld();
    const st = w.store;
    const g = stubGame();
    g.world = w;
    (g as unknown as Record<string, unknown>).scene = {};
    (g as unknown as Record<string, unknown>).npcs = () => [];
    const rg = g as unknown as Record<string, unknown>;
    rg.playSfx = () => {}; rg.playSfxFile = () => {}; rg.playSfxWav = () => {};
    rg.spawnParticles = () => {}; rg.spawnDrop = () => {}; rg.spawnNpcByVanilla = () => null;
    const b = bobberStub(2422);
    b.fishingCheck(playerStub(), g as unknown as GameHooks, st.idx(30, 32));
    expect(g.achievements.isCompleted('GO_LAVA_FISHING')).toBe(true);
  });
  it('普通竿（CanFishInLava 外）不触发', () => {
    const w = lavaWorld();
    const st = w.store;
    const g = stubGame();
    g.world = w;
    (g as unknown as Record<string, unknown>).scene = {};
    (g as unknown as Record<string, unknown>).npcs = () => [];
    const rg = g as unknown as Record<string, unknown>;
    rg.playSfx = () => {}; rg.playSfxFile = () => {}; rg.playSfxWav = () => {};
    rg.spawnParticles = () => {}; rg.spawnDrop = () => {}; rg.spawnNpcByVanilla = () => null;
    const b = bobberStub(0);
    b.fishingCheck(playerStub(), g as unknown as GameHooks, st.idx(30, 32));
    expect(g.achievements.isCompleted('GO_LAVA_FISHING')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 微光转化 prog 27（WorldItem.cs:1878 共尾）+ 4986 复查（:1771）
// ---------------------------------------------------------------------------
describe('⑤ 微光转化触发面（ItemDrop.getShimmered）', () => {
  function shimmerGame(over: Record<string, unknown> = {}) {
    const g = stubGame();
    g.world = { store: new World(40, 40, 1, 'shim').store, flags: {}, clock: { moonPhase: 0 } } as unknown as World;
    const rg = g as unknown as Record<string, unknown>;
    rg.playSfx = () => {};
    rg.playSfxFile = () => {};
    rg.player = { luckState: { addCoinLuck: () => {} }, cx: 0, cy: 0 };
    rg.spawnNpcByVanilla = () => null;
    rg.checkAchievementRealEstateAndTownSlimes = () => {};
    Object.assign(rg, over);
    return g;
  }
  const mkDrop = (vid: number) => {
    const d = Object.create(ItemDrop.prototype) as unknown as Record<string, unknown> & {
      getShimmered(game: GameHooks): void;
    };
    d.itemId = VI_ID(vid);
    d.stack = 1;
    d.x = 0; d.y = 0; d.w = 8; d.h = 8;   // cx/cy = Entity getter（x+w/2 派生）
    d.vx = 0; d.vy = 0; d.dead = false;
    d.shimmered = false; d.shimmerTime = 0;
    return d;
  };
  it('钱币支共尾 → NotifyProgressionEvent(27)（TRANSMUTE_ITEM）', () => {
    const g = shimmerGame();
    mkDrop(71).getShimmered(g as unknown as GameHooks);
    expect(g.achievements.isCompleted('TRANSMUTE_ITEM')).toBe(true);
  });
  it('4986 彩虹史莱姆解锁 → 复查器回调（WorldItem.cs:1771）+ prog 27', () => {
    let checked = 0;
    const g = shimmerGame({ checkAchievementRealEstateAndTownSlimes: () => { checked++; } });
    mkDrop(4986).getShimmered(g as unknown as GameHooks);
    expect(checked).toBe(1);
    expect(g.achievements.isCompleted('TRANSMUTE_ITEM')).toBe(true);
    expect((g.world as unknown as { flags: Record<string, boolean> }).flags['unlockedSlimeRainbowSpawn'])
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑥⑦⑧ Player.Update 逐帧态（Player.cs:25886-25902）
// ---------------------------------------------------------------------------
describe('⑥⑦⑧ achCheckPlayerState（40/38/41）', () => {
  function stateGame() {
    const w = new World(120, 120, 2, 'state');
    w.groundLevel = 40;
    const g = stubGame();
    g.world = w;
    return { g, w };
  }
  const playerOf = (armor: Array<[internalId: number, slot: 0 | 1 | 2]>) => {
    const inv = new Inventory();
    for (const [id, slot] of armor) inv.armor[slot] = { id, stack: 1 };
    return { y: 100, maxHp: 100, maxMana: 20, inv };
  };
  const run = (g: Game, p: unknown) =>
    (g as unknown as { achCheckPlayerState(p: unknown): void }).achCheckPlayerState(p);
  it('双战斗书旗 → prog 40（TRAINING_DAY）', () => {
    const { g, w } = stateGame();
    w.flags.combatBookWasUsed = true;
    w.flags.combatBookVolumeTwoWasUsed = true;
    run(g, playerOf([]));
    expect(g.achievements.isCompleted('TRAINING_DAY')).toBe(true);
  });
  it('头槽 12（太阳镜）白天地表晴 → prog 38（ON_FLEEK）；雨天不发', () => {
    const { g, w } = stateGame();
    w.clock.timeOfDay = 0.5;                                  // 正午
    const sunglasses = internalOfArmor((s) => s.hs === 12);
    expect(sunglasses).toBeGreaterThan(0);
    const p = playerOf([[sunglasses, 0]]);
    run(g, p);
    expect(g.achievements.isCompleted('ON_FLEEK')).toBe(true);
    w.weather.cloudAlpha = 0.5;   // IsItRaining = Main.cloudAlpha > 0（Main.cs:2659/2682）
    g.achievements = ach();
    run(g, p);
    expect(g.achievements.isCompleted('ON_FLEEK')).toBe(false);
  });
  it('头 187+胸 249+腿 217 → prog 41（MINI_ME）', () => {
    const { g } = stateGame();
    const head = internalOfArmor((s) => s.hs === 187);
    const body = internalOfArmor((s) => s.bs === 249);
    const leg = internalOfArmor((s) => s.ls === 217);
    expect(head).toBeGreaterThan(0);
    expect(body).toBeGreaterThan(0);
    expect(leg).toBeGreaterThan(0);
    run(g, playerOf([[head, 0], [body, 1], [leg, 2]]));
    expect(g.achievements.isCompleted('MINI_ME')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑩ achOnWorldEnter bank0-4+loadouts 扫描（AchievementsHelper.cs:118-168）
// ---------------------------------------------------------------------------
describe('⑩ 进世界成就基线（bank/loadouts 补扫）', () => {
  it('bank 格内物品照发 pickup 通知（HEAVY_METAL 存钱罐即满足）', () => {
    const g = stubGame();
    (g as unknown as Record<string, unknown>).entities = { npcs: [], projectiles: [], enemies: [] };
    const inv = new Inventory();
    const bank0 = [{ id: VI_ID(35), stack: 3 }];
    (g as unknown as Record<string, unknown>).player = { inv, banks: [bank0, [], [], []], maxMana: 20, maxHp: 100 };
    (g as unknown as { achOnWorldEnter(): void }).achOnWorldEnter();
    expect(g.achievements.isCompleted('HEAVY_METAL')).toBe(true);
  });
  it('loadout 档内装备照发 pickup 通知', () => {
    const g = stubGame();
    (g as unknown as Record<string, unknown>).entities = { npcs: [], projectiles: [], enemies: [] };
    const inv = new Inventory();
    inv.loadouts[0].armor[0] = { id: VI_ID(35), stack: 1 };
    (g as unknown as Record<string, unknown>).player = { inv, banks: [[], [], [], []], maxMana: 20, maxHp: 100 };
    (g as unknown as { achOnWorldEnter(): void }).achOnWorldEnter();
    expect(g.achievements.isCompleted('HEAVY_METAL')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑮ DRINK_BOTTLED（Player.cs:5537 QuickHeal 支；手动支 :43204 同式门）
// ---------------------------------------------------------------------------
describe('⑮ 快喝瓶装水（quickHeal → event 25 面）', () => {
  function healGame(breath: number) {
    const g = stubGame();
    g.world = new World(120, 120, 4, 'heal');
    const rg = g as unknown as Record<string, unknown>;
    rg.addDamageNumber = () => {};
    rg.applyPotionSickness = () => {};
    rg.foodUseSound = () => {};
    rg.cb = { onInventoryChanged: () => {} };
    const inv = new Inventory();
    inv.add(VI_ID(126), 2);   // 瓶装水
    const p = {
      inv, banks: [null, null, null, []], breath,
      buffs: { has: () => false, healBlocked: false, apply: () => {} },
      cced: false, dead: false, hp: 50, maxHp: 100, maxMana: 40, mana: 10,
      undoSlowMagicUse: () => {},
    };
    rg.player = p;
    return { g, p };
  }
  it('breath==0 快喝瓶装水 → DRINK_BOTTLED_WATER_WHILE_DROWNING', () => {
    const { g } = healGame(0);
    (g as unknown as { quickHeal(): void }).quickHeal();
    expect(g.achievements.isCompleted('DRINK_BOTTLED_WATER_WHILE_DROWNING')).toBe(true);
  });
  it('breath>0（未溺水）不触发', () => {
    const { g } = healGame(150);
    (g as unknown as { quickHeal(): void }).quickHeal();
    expect(g.achievements.isCompleted('DRINK_BOTTLED_WATER_WHILE_DROWNING')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑯ ROLLIN_IN_YOUR_GRAVE prog 32（Mount.EquipMount _type==38，Mount.cs:6369）
// ---------------------------------------------------------------------------
describe('⑯ 机械矿车 38 上车（mountMinecartAt）', () => {
  function cartGame(mountId: number) {
    const w = new World(60, 60, 9, 'cart');
    const st = w.store;
    // 铺一条轨道（tile 314）供 GetOnTrack 吸附
    for (let x = 20; x < 40; x++) st.setTileSilent(x, 30, TILE_BY_KEY['v_314_minecart_track'], 0, 0);
    const g = stubGame();
    g.world = w;
    const rg = g as unknown as Record<string, unknown>;
    rg.minecart = null;
    rg.superCartUnlocked = () => false;
    rg.playSfxFile = () => {};
    rg.entities = { add: () => {} };
    rg.player = { ridingCart: false, cart: null, x: 30 * TILE, y: 29 * TILE };
    const ok = (g as unknown as { mountMinecartAt(tx: number, ty: number, m: number): boolean })
      .mountMinecartAt(30, 30, mountId);
    return { g, ok };
  }
  it('mountId 38 → prog 32（ROLLIN_IN_YOUR_GRAVE）', () => {
    const { g, ok } = cartGame(38);
    expect(ok).toBe(true);
    expect(g.achievements.isCompleted('ROLLIN_IN_YOUR_GRAVE')).toBe(true);
  });
  it('木质矿车 13 不发', () => {
    const { g, ok } = cartGame(13);
    expect(ok).toBe(true);
    expect(g.achievements.isCompleted('ROLLIN_IN_YOUR_GRAVE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑰⑱ BOULDER_LORD prog 30 / QUEEN_MACHINE prog 31（NPC.cs:80218/:79681）
// ---------------------------------------------------------------------------
describe('⑰⑱ 击杀事件（onEnemyKilled → prog 30/31）', () => {
  function killGame(seedFlags: Record<string, boolean>) {
    const g = stubGame();
    const w = new World(120, 120, 6, 'kill');
    w.seedFlags = seedFlags;
    g.world = w;
    (g as unknown as Record<string, unknown>).entities = { enemies: [], npcs: [], projectiles: [] };
    (g as unknown as Record<string, unknown>).player = { lastCreatureHit: 0, maxHp: 100, maxMana: 20 };
    return g;
  }
  const enemyOf = (vid: number) => ({
    vanillaId: vid, vanillaNetId: 0, playerInteracted: true, killBossFlag: true,
    dead: true, def: { boss: true }, hp: 0,
  });
  it('getGoodWorld 月主 398 → BOULDER_LORD（30）', () => {
    const g = killGame({ getGoodWorld: true });
    (g as unknown as { onEnemyKilled(k: string, e: unknown): void }).onEnemyKilled('vi_398', enemyOf(398));
    expect(g.achievements.isCompleted('BOULDER_LORD')).toBe(true);
  });
  it('非 FTW 世界不触发', () => {
    const g = killGame({});
    (g as unknown as { onEnemyKilled(k: string, e: unknown): void }).onEnemyKilled('vi_398', enemyOf(398));
    expect(g.achievements.isCompleted('BOULDER_LORD')).toBe(false);
  });
  it('Mechdusa 世界末体节（127）全灭 → QUEEN_MACHINE（31）', () => {
    const g = killGame({ remix: true, getGoodWorld: true });
    (g as unknown as { onEnemyKilled(k: string, e: unknown): void }).onEnemyKilled('vi_127', enemyOf(127));
    expect(g.achievements.isCompleted('QUEEN_MACHINE')).toBe(true);
  });
  it('Mechdusa 世界但其余体节仍在场 → 不触发', () => {
    const g = killGame({ remix: true, getGoodWorld: true });
    ((g as unknown as Record<string, unknown>).entities as { enemies: unknown[] }).enemies = [
      { vanillaId: 126, vanillaNetId: 0, dead: false, killBossFlag: false },
      { vanillaId: 134, vanillaNetId: 0, dead: false, killBossFlag: false },
    ];
    (g as unknown as { onEnemyKilled(k: string, e: unknown): void }).onEnemyKilled('vi_127', enemyOf(127));
    expect(g.achievements.isCompleted('QUEEN_MACHINE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑨ 跑动里程门（Player.cs:28372/28383-28386/28443-28446）
// ---------------------------------------------------------------------------
describe('⑨ achTickRunning 门（!mount.Active && !tongued）', () => {
  const pOf = (over: Record<string, unknown> = {}) => ({
    onGround: true, x: 100, mount: { active: false },
    buffs: { has: (b: unknown) => b === 'TheTongue' },
    ...over,
  });
  it('着地跑动 → 里程累计（60px/1106688）', () => {
    const g = stubGame();
    (g as unknown as { achTickRunning(p: unknown, px: number): void }).achTickRunning(pOf(), 40);
    expect(g.achievements.progressOf('MARATHON_MEDALIST').ratio).toBeCloseTo(60 / 1106688);
  });
  it('骑乘（mount.Active）不计——flag33=false', () => {
    const g = stubGame();
    (g as unknown as { achTickRunning(p: unknown, px: number): void })
      .achTickRunning(pOf({ mount: { active: true } }), 40);
    expect(g.achievements.progressOf('MARATHON_MEDALIST').ratio).toBe(0);
  });
  it('tongued（狂卷之舌积分分支强制 flag33=false）不计', () => {
    const g = stubGame();
    const p = pOf();
    (p.buffs as { has: (b: unknown) => boolean }).has = (b: unknown) => b === BuffType.TheTongue;
    (g as unknown as { achTickRunning(p: unknown, px: number): void }).achTickRunning(p, 40);
    expect(g.achievements.progressOf('MARATHON_MEDALIST').ratio).toBe(0);
  });
  it('空中（onGround=false ≙ velocity.Y!=0）不计', () => {
    const g = stubGame();
    (g as unknown as { achTickRunning(p: unknown, px: number): void })
      .achTickRunning(pOf({ onGround: false }), 40);
    expect(g.achievements.progressOf('MARATHON_MEDALIST').ratio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ⑪ HandleSpecialEvent 无 case 29（BOOK_WORM 唯一通路 = NotifyProgressionEvent(29)）
// ---------------------------------------------------------------------------
describe('⑪ handleSpecialEvent(29) 为 no-op（误移植死调用回归锁）', () => {
  it('handleSpecialEvent(29) 不完成 BOOK_WORM；notifyProgressionEvent(29) 才完成', () => {
    const a = ach();
    a.handleSpecialEvent(29, { statLifeMax: 100, statManaMax: 20 });
    expect(a.isCompleted('BOOK_WORM')).toBe(false);
    a.notifyProgressionEvent(29);
    expect(a.isCompleted('BOOK_WORM')).toBe(true);
  });
});
