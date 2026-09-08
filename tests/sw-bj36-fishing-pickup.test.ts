// SW-BJ36 2026-09-08 钓鱼捕获拾取提示回归（用户实报"钓上东西没有拾取提示"）。
// 原版锚（Terarria1457）：收线带渔获 → AI_061_FishingBobber_GiveItemToPlayer
// （Projectile.cs:54852-54905，BuildItem+stack → QuickSpawnItem）→ Player.QuickSpawnItem
// （Player.cs:7186-7195）→ GetOrDropItem（:7197-7204）内联 GetItem（GetItemSettings.
// PickupItemFromWorld，GetItemSettings.cs:13 NoText=false）——【入包即飘名】：
// PopupText.NewText(PopupTextContext.RegularItemPickup, newItem, base.Center, 入包数)：
//   · GetItem_FillIntoOccupiedSlot  Player.cs:39810（整并入）/ :39825（部分填满）
//   · GetItem_FillEmptyInventorySlot Player.cs:39876
//   · FillAmmo                       Player.cs:39592 / :39606
// 溢出余量走 RequestNewItem（:7202，NewItemOwnership.ReserveForLocalPlayer）落为掉落，
// 生成时【不】飘名、拾取时才飘（本仓 ItemDrop.ts:273/:280 承载）。
// 任务鱼/宝箱/垃圾件走同一 QuickSpawnItem 面，无专属捕获文案（PopupText.NewText 调用点
// 全表核查：SonarAlert(:20872/:20886)/RegularItemPickup/ItemPickupToVoidContainer/ItemReforge）。
// 缺口 = Game.reelBobber 渔获入包支漏调 showPickupLabel（SW-BJ36 2026-09-08 修）。
// harness：Object.create(Game.prototype) 零场桩（同 ammo-remainder-fixes 惯例）+
// 真 Player/Inventory/Bobber——走真 reel()（断线掷/耗饵掷用 Math.random 钉值定性）+
// 真 showPickupLabel（端到端落 dmgNumbers）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Game } from '../src/core/Game';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { ANGLER_QUEST_ITEMS } from '../src/data/vanillaFishing';
import { Lang } from '../src/i18n/Lang';

/** 零场 Game（Object.create(Game.prototype)，同 ammo-remainder-fixes mkDeathGame 模式）：
 *  真 showPickupLabel（端到端落 dmgNumbers）/spawnDrop 记账桩；渔获入包支触达面 =
 *  player/cb/dmgNumbers/spawnDrop（showPickupLabel 内部另读 options.data.showItemText
 *  默认 true，Options.ts:286） */
function mkCatchGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    reelBobber: (b: Bobber) => void;
    player: Player;
  };
  const inv = new Inventory();
  const player = new Player(1000, 1000, inv);
  g.player = player;
  g.cb = { onInventoryChanged: () => {} };
  g.dmgNumbers = [] as Array<Record<string, unknown>>;
  g.boss = null;
  // doSplash 收线溅花经 Game.playSfxWav（原型真方法,`?.` 不短路）→ this.sfx 需在位
  g.sfx = { playWavFile: () => {}, play: () => {}, playFiles: () => true };
  const drops: Array<{ key: string; stack: number }> = [];
  g.spawnDrop = (_x: number, _y: number, key: string, count: number) => {
    drops.push({ key, stack: count });
    return null;
  };
  return { g, inv, player, drops };
}

/** 咬钩中浮标（真 reel() 可走）：ai1=-100（biteT=100>0）+ catchId=渔获；
 *  baitSlot=0 空槽（consumeBait :53093 查无饵即 false,不触碰随机流后段） */
function mkBitingBobber(player: Player, catchVid: number): Bobber {
  const b = new Bobber(1000, 1000, 0, 0, 5, 0, 50, () => player);
  (b as unknown as { ai1: number }).ai1 = -100;
  b.catchId = catchVid;
  b.liquidKind = 'water';
  return b;
}

const keyOf = (vid: number): string => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(k, `vanilla.json 缺 vid=${vid} 键`).toBeDefined();
  return k as string;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SW-BJ36 渔获捕获飘名（Game.reelBobber → showPickupLabel）', () => {
  it('普通鱼（鲈鱼 2328）入包 → 飘名一次,计数=实入包数,无溢出落地', () => {
    const { g, inv, drops } = mkCatchGame();
    const key = keyOf(2328);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // ≥1/7 免断线、≥1/9.33 免耗饵
    g.reelBobber(mkBitingBobber(g.player, 2328));
    expect(inv.countOf(ITEM_BY_KEY[key])).toBe(1);
    expect(drops).toEqual([]);
    const labels = g.dmgNumbers as Array<Record<string, unknown>>;
    expect(labels).toHaveLength(1);
    expect(labels[0]?.pickupKey).toBe(key);          // 合并身份 = 本名（无词缀）
    expect(labels[0]?.stack).toBe(1);                // picked=1（:39876 picked=入包数）
    expect(String(labels[0]?.label).length).toBeGreaterThan(0);
    // 位置 = 玩家（原版 base.Center,:39876 第 3 参）——showPickupLabel 内部落点
    expect(labels[0]?.x).toBe((g.player as Player).cx);
  });

  it('任务鱼（ANGLER_QUEST_ITEMS[0] 族）入包 → 飘名=本名,无专属任务文案（原版同相）', () => {
    const vid = ANGLER_QUEST_ITEMS[0]!;              // 2450（vanilla-fishing.json anglerQuest.items 首）
    const key = keyOf(vid);
    const { g, inv } = mkCatchGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    g.reelBobber(mkBitingBobber(g.player, vid));
    expect(inv.countOf(ITEM_BY_KEY[key])).toBe(1);
    const labels = g.dmgNumbers as Array<Record<string, unknown>>;
    expect(labels).toHaveLength(1);
    expect(labels[0]?.pickupKey).toBe(key);
    // 原版任务鱼捕获 = 标准 RegularItemPickup 文本（picked=1 → 无计数后缀），
    // 不造"任务鱼上钩"类自创文案——label 即物品本名
    expect(labels[0]?.label).toBe(Lang.itemNameByKey(key));
  });

  it('宝箱（木匣 2334）捕获入包 → 飘名（开箱前捕获面同 QuickSpawnItem 域）', () => {
    const { g, inv, drops } = mkCatchGame();
    const key = keyOf(2334);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    g.reelBobber(mkBitingBobber(g.player, 2334));
    expect(inv.countOf(ITEM_BY_KEY[key])).toBe(1);
    expect(drops).toEqual([]);
    const labels = g.dmgNumbers as Array<Record<string, unknown>>;
    expect(labels).toHaveLength(1);
    expect(labels[0]?.pickupKey).toBe(key);
  });

  it('满包全溢出 → 不飘名、渔获落玩家脚下（原版 RequestNewItem 落地=拾取时才飘,ItemDrop.ts:273）', () => {
    const { g, inv, player, drops } = mkCatchGame();
    const dirtKey = keyOf(2);                        // ItemID 2 = Dirt Block（不与鲈鱼互并）
    const dirtIid = ITEM_BY_KEY[dirtKey];
    for (let i = 0; i < 50; i++) inv.slots[i] = { id: dirtIid, stack: 999 };
    const key = keyOf(2328);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    g.reelBobber(mkBitingBobber(player, 2328));
    expect(inv.countOf(ITEM_BY_KEY[key])).toBe(0);   // 实入包 0 → picked=0
    expect(drops).toEqual([{ key, stack: 1 }]);      // 溢出落点=玩家（QuickSpawnItem 余量面）
    expect(g.dmgNumbers).toEqual([]);                // ★picked=0 不飘 = 原版同相
  });

  it('非渔获不掉提示（负例）:空咬收线 → 无飘名无落地', () => {
    const { g, drops } = mkCatchGame();
    const b = new Bobber(1000, 1000, 0, 0, 5, 0, 50, () => g.player as Player);
    (b as unknown as { ai1: number }).ai1 = 0;       // 无咬钩窗
    g.reelBobber(b);
    expect(g.dmgNumbers).toEqual([]);
    expect(drops).toEqual([]);
    expect(b.dead).toBe(false);                      // retract=1 收线飞行,非即时 Kill
  });

  it('非渔获不掉提示（负例）:1/7 断线（无高测钓线）渔获作废 → 无飘名无落地', () => {
    const { g, drops, inv } = mkCatchGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.05);  // floor(0.05×7)=0 → 断线（PullBobber :53077）
    g.reelBobber(mkBitingBobber(g.player as Player, 2328));
    expect(g.dmgNumbers).toEqual([]);
    expect(drops).toEqual([]);
    expect(inv.countOf(ITEM_BY_KEY[keyOf(2328)])).toBe(0);
  });
});
