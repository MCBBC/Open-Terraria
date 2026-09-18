// ★SW-BJ157（2026-09-18）双实报刀：
// ① 右键取件臂（ItemSlot.RightClick :1677-1692 + PickupItemIntoMouse :1695-1750 +
//    RefreshStackSplitCooldown :1753-1761 + Main.cs:62728-62755 加速梯 + :63422-63430
//    松键归零/递减）——inv/chest/coin/ammo 四 context（0/3/4/32/1/2）右键=取【1】到
//    光标（旧 fallback=自创 splitHalf 拆半,整摘）;按住连取=stackSplit 电平面 1:1。
// ② 绳放置面 1:1（Player.PlaceThing_Tiles :40032-40101）——旧实现=RopeCoil 弹语义
//    误植（一次 use 级联下延至多 10 格仅耗 1 件）;原版一次 use 恒写 1 格,按住连放
//    =autoReuse(useTime 8)+ItemTimeIsZero 节拍;retarget 走查（CheckRopeUsability
//    :41826-41858）/支撑门（AssortedThings 尾支 :41565-41581）/岩浆门
//    （IsBlockedByLava :41809→legacy LiquidPlace→tileLavaDeath{213,353}）。
// 测试法：UI 原型桩（bj116 mkUi 同法,★类字段初始化器不入原型须显式补）+
//   Game.prototype 壳（ghost-place-swap shell 同法）驱动 tryPlace 真实现 + 真 World。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { LIQUID_TYPE } from '../src/world/TileStore';

type AnyUI = Record<string, any>;

const WOOD = ITEM_BY_KEY['vi_9_Wood'];          // 木材（1.4.4 堆叠 9999）
const TORCH = ITEM_BY_KEY['vi_8_Torch'];        // 火把（maxStack 999）

// ============ ① 取件臂：取 1 到光标 ============
describe('BJ157 ① 取件臂——右键多数量物品取 1（非拆半）', () => {
  /** UI 原型桩：★类字段初始化器（stackSplit 族）不入 prototype,显式补齐 */
  function mkUi(): { ui: AnyUI; sfx: string[] } {
    const ui = Object.create(UI.prototype) as unknown as AnyUI;
    const sfx: string[] = [];
    ui.game = {
      player: { inv: new Inventory() },
      sfx: { play: (name: string) => { sfx.push(name); } },
      achNotifyEquipChanged: () => {},
      npcShopOpen: false,
    };
    ui.heldStack = null;
    ui.heldFrom = null;
    ui.openChest = null;
    ui.refreshAll = () => {};
    // stackSplit 计时面字段（构造器初始化器,原型桩手工补）
    ui.stackSplit = 0;
    ui.stackDelay = 7;
    ui.stackCounter = 0;
    ui.superFastStack = 0;
    ui.timesTriedToFastStack = 0;
    ui.rcHold = null;
    ui.uiBtnRight = false;
    ui.uiBtnLeft = false;
    ui.invPanel = { style: { display: 'block' } };
    return { ui, sfx };
  }

  it('57 堆叠右键：光标取 1+格 56（PickupItemIntoMouse :1716/:1719 单件语义）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 57 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    expect(ui.heldStack).toMatchObject({ id: WOOD, stack: 1 });
    expect(inv.slots[10]!.stack).toBe(56);
    expect(sfx).toEqual(['menuTick']);                       // SoundEngine.PlaySound(12)
  });

  it('钱币格（context 1,i=50）/弹药格（context 2,i=54）同臂取 1（switch 无 case 直落）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[50] = { id: WOOD, stack: 30 };
    ui.runPickupArm('inv', 50, inv.slots[50]);
    expect(ui.heldStack).toMatchObject({ stack: 1 });
    expect(inv.slots[50]!.stack).toBe(29);
    ui.heldStack = null;
    ui.stackSplit = 0;                                       // 松键重按（:63422 归零面）
    inv.slots[54] = { id: TORCH, stack: 250 };
    ui.runPickupArm('inv', 54, inv.slots[54]);
    expect(ui.heldStack).toMatchObject({ stack: 1 });
    expect(inv.slots[54]!.stack).toBe(249);
  });

  it('宝箱格取 1：耗尽清槽写回 openChest.items（★旧 equipArray 尾支误写 miscDyes 勘误回归）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    const chest = { x: 5, y: 5, items: new Array(40).fill(null) };
    chest.items[3] = { id: TORCH, stack: 2 };
    ui.openChest = chest;
    ui.runPickupArm('chest', 3, chest.items[3]);
    expect(ui.heldStack).toMatchObject({ stack: 1 });
    expect(chest.items[3]!.stack).toBe(1);
    ui.stackSplit = 0;                                       // 松键重按
    ui.heldStack = null;
    ui.runPickupArm('chest', 3, chest.items[3]);             // 第二次：耗尽清槽
    expect(chest.items[3]).toBeNull();
    expect(inv.miscDyes.every((s: unknown) => s === null)).toBe(true);   // 旧 bug 写回面
  });

  it('收藏随件面（:1706-1709）：整格 stack==1 收藏随件;多叠收藏不随件', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[11] = { id: WOOD, stack: 1, favorited: true };
    ui.runPickupArm('inv', 11, inv.slots[11]);
    expect(ui.heldStack).toMatchObject({ favorited: true });
    ui.heldStack = null;
    ui.stackSplit = 0;
    inv.slots[12] = { id: WOOD, stack: 9, favorited: true };
    ui.runPickupArm('inv', 12, inv.slots[12]);
    expect(ui.heldStack).toMatchObject({ favorited: false });
    expect(inv.slots[12]!.favorited).toBe(true);
  });

  it('光标异款/满叠无动作（:1685 CanStack+stack<maxStack 门,变异：摘门即红）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: TORCH, stack: 57 };
    ui.heldStack = { id: WOOD, stack: 1 };                   // 异款
    ui.runPickupArm('inv', 10, inv.slots[10]);
    expect(inv.slots[10]!.stack).toBe(57);
    expect(ui.heldStack).toMatchObject({ id: WOOD, stack: 1 });
    const tmax = ITEM_DEFS[TORCH].maxStack;                  // 满叠=读实表 maxStack
    ui.heldStack = { id: TORCH, stack: tmax };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    expect(inv.slots[10]!.stack).toBe(57);
    ui.heldStack = null;
    ui.runPickupArm('inv', 20, null);                        // 空格 :1678 IsAir 门
    expect(ui.heldStack).toBeNull();
  });
});

// ============ ① b stackSplit 按住连取加速梯（Main.cs:62728/:63422 1:1 拍面） ============
describe('BJ157 ① b stackSplit 计时面——按住加速连取', () => {
  function mkUi(): AnyUI {
    const { ui } = ((): { ui: AnyUI; sfx: string[] } => {
      const u = Object.create(UI.prototype) as unknown as AnyUI;
      const sfx: string[] = [];
      u.game = {
        player: { inv: new Inventory() },
        sfx: { play: (name: string) => { sfx.push(name); } },
        achNotifyEquipChanged: () => {},
        npcShopOpen: false,
      };
      u.heldStack = null;
      u.heldFrom = null;
      u.openChest = null;
      u.refreshAll = () => {};
      u.stackSplit = 0;
      u.stackDelay = 7;
      u.stackCounter = 0;
      u.superFastStack = 0;
      u.timesTriedToFastStack = 0;
      u.rcHold = null;
      u.uiBtnRight = false;
      u.uiBtnLeft = false;
      u.invPanel = { style: { display: 'block' } };
      return { ui: u, sfx };
    })();
    return ui;
  }

  it('首取后 30 拍冷却：29 拍内不再取,第 29 拍取第 2 件（stackSplit 30→1 逐拍递减）', () => {
    const ui = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 999 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    expect(ui.heldStack!.stack).toBe(1);
    expect(ui.stackSplit).toBe(30);                          // RefreshStackSplitCooldown 首取支
    ui.uiBtnRight = true;
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => true } };
    for (let t = 0; t < 28; t++) ui.tickStackSplitMain();
    expect(ui.heldStack!.stack).toBe(1);                     // 冷却窗内不连取（:1678 门）
    ui.tickStackSplitMain();                                 // 第 29 拍：stackSplit=1 → 取
    expect(ui.heldStack!.stack).toBe(2);
    expect(inv.slots[10]!.stack).toBe(997);
  });

  it('加速梯：第 2 件后冷却收窄到 stackDelay（<29 拍即取第 3 件=加速非恒 30）', () => {
    const ui = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 999 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    ui.uiBtnRight = true;
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => true } };
    for (let t = 0; t < 29; t++) ui.tickStackSplitMain();    // 第 2 件
    expect(ui.heldStack!.stack).toBe(2);
    expect(ui.stackSplit).toBe(7);                           // 续取支 → stackDelay（:1760）
    for (let t = 0; t < 5; t++) ui.tickStackSplitMain();
    expect(ui.heldStack!.stack).toBe(2);                     // 冷却 7 → 第 5 拍仍未取
    ui.tickStackSplitMain();
    expect(ui.heldStack!.stack).toBe(3);                     // 第 6 拍取第 3 件（间隔 6<29=加速）
  });

  it('superFastStack 真空面：长按尾段一拍多件,999 堆 800 拍内取空（naive 57×29 拍不成立）', () => {
    const ui = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 999 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    ui.uiBtnRight = true;
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => true } };
    let maxPerTick = 0;
    for (let t = 0; t < 800 && inv.slots[10]; t++) {
      const before = ui.heldStack!.stack;
      ui.tickStackSplitMain();
      maxPerTick = Math.max(maxPerTick, ui.heldStack!.stack - before);
    }
    expect(inv.slots[10]).toBeNull();                        // 取空
    expect(maxPerTick).toBeGreaterThan(1);                   // 一拍多件=superFastStack 支
  });

  it('松键归零（Main.cs:63422 双键全松 → stackSplit=0）：再按立即取 1 非等冷却', () => {
    const ui = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 999 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    ui.uiBtnRight = true;
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => true } };
    for (let t = 0; t < 5; t++) ui.tickStackSplitMain();
    ui.uiBtnRight = false;                                   // 松键
    ui.rcHold = null;
    ui.tickStackSplitMain();
    expect(ui.stackSplit).toBe(0);
    ui.uiBtnRight = true;                                    // 重新按住
    ui.runPickupArm('inv', 10, inv.slots[10]);
    expect(ui.heldStack!.stack).toBe(2);                     // 立即取（非 30 拍冷却）
  });

  it('指针离格/面板关=连取停（:566 仅悬停格逐帧调用 RightClick 的电平域）', () => {
    const ui = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: WOOD, stack: 999 };
    ui.runPickupArm('inv', 10, inv.slots[10]);
    ui.uiBtnRight = true;
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => false } };  // 离格
    ui.tickStackSplitMain();
    expect(ui.rcHold).toBeNull();
    ui.rcHold = { where: 'inv', i: 10, el: { isConnected: true, matches: () => true } };
    ui.invPanel.style.display = 'none';                      // 关包
    ui.tickStackSplitMain();
    expect(ui.rcHold).toBeNull();
    expect(ui.heldStack!.stack).toBe(1);
  });
});

// ============ ② 绳放置面 1:1（一次 use=1 格） ============
describe('BJ157 ② 绳放置——一根一格（RopeCoil 级联摘除）', () => {
  const ROPE_V = 965;
  const ROPE_T = TILE_INTERNAL_BY_SHEET.get(213)!;
  const PLATFORM_T = TILE_BY_KEY['platform'];
  const STONE_T = TILE_BY_KEY['stone'];

  let vidToId: Record<number, number> | null = null;
  function iidOf(vid: number): number {
    if (!vidToId) {
      vidToId = {};
      ITEM_DEFS.forEach((d, i) => {
        const m = /^vi_(\d+)_/.exec(d.key);
        if (m) vidToId![+m[1]] = i;
      });
    }
    return vidToId[vid] ?? -1;
  }
  function defOf(vid: number) {
    return ITEM_DEFS[iidOf(vid)];
  }

  interface Shell {
    world: World;
    player: Record<string, unknown>;
    tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
  }

  function shell(w: World, consumed: number[], rec: Array<Record<string, unknown>>): Shell {
    const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
    g.world = w;
    g.chunks = { markDirtyArea: () => {} };
    g.sfx = { play: () => {} };
    g.cb = { onInventoryChanged: () => {} };
    g.input = { rightDown: true };
    g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
    g.critterVid = () => -1;
    g.spawnNpcByVanilla = () => null;
    g.spawnParticles = () => {};
    g.recLog = (_k: string, v: Record<string, unknown>) => { rec.push(v); };
    g.spawnDrop = () => {};
    g.hitTiles = { addDamage: () => 100, clear: () => {} };
    g.swingTileCutSet = new Set<number>();
    g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
    g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
    g.player = {
      cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
      facing: 1, useTime: 0, attackSpeedMult: 1,
      buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 },
      // pickSpeedOff=0：并行组A批 pickSpeedMult 直读 equipStats.pickSpeedOff（undefined→NaN）
      equipStats: { pickSpeedOff: 0 },
      placeSpeedTileRaw: () => 1,
      inv: {
        selected: 0,
        slots: [{ id: iidOf(ROPE_V), stack: 999 }],
        heldItem: () => ({ id: iidOf(ROPE_V), stack: 999 }),
        removeAt: () => {},
        removeHeld: (_n: number) => { consumed.push(1); },   // 消耗计数（1:1=每格 1 件）
      },
    };
    return g;
  }

  function mkWorld(): World {
    const w = new World(40, 60, 7, 'bj157-rope');
    for (let x = 2; x < 38; x++) w.store.setTileSilent(x, 21, STONE_T);
    return w;
  }
  const isRope = (w: World, x: number, y: number) =>
    w.store.hasTile(x, y) && w.store.type[w.store.idx(x, y)] === ROPE_T;

  it('干格单击：恰 1 格+耗 1 件+useTime=8（Item.cs:12511-12522 useTime 8/autoReuse）', () => {
    const w = mkWorld();
    const consumed: number[] = [];
    const rec: Array<Record<string, unknown>> = [];
    shell(w, consumed, rec).tryPlace(10, 20, defOf(ROPE_V));
    expect(isRope(w, 10, 20)).toBe(true);
    for (let y = 19; y <= 30; y++) {
      if (y !== 20) expect(isRope(w, 10, y), `y=${y} 无绳（旧 10 格级联摘除）`).toBe(false);
    }
    expect(consumed).toHaveLength(1);
    expect(rec[0]).toMatchObject({ cause: 'rope', n: 1 });
  });

  it('useTime 门（:40063 ItemTimeIsZero）：冷却窗内逐拍 tryPlace 不再写格不重复消耗', () => {
    const w = mkWorld();
    const consumed: number[] = [];
    const g = shell(w, consumed, []);
    g.tryPlace(10, 20, defOf(ROPE_V));
    expect(isRope(w, 10, 20)).toBe(true);
    expect((g.player as { useTime: number }).useTime).toBe(8);
    for (let t = 0; t < 5; t++) g.tryPlace(10, 20, defOf(ROPE_V));   // 冷却窗内连拍
    expect(consumed).toHaveLength(1);                        // 不重复消耗（按住 8 拍/格节拍）
  });

  it('useTime 门判别面②（冷却窗内换格）：拖拽换邻格仍被冷却拦下（autoReuse=8 拍/格,非逐拍格）', () => {
    const w = mkWorld();
    const consumed: number[] = [];
    const g = shell(w, consumed, []);
    g.tryPlace(10, 20, defOf(ROPE_V));                       // 第 1 格（useTime=8）
    g.tryPlace(11, 20, defOf(ROPE_V));                       // 冷却窗内拖到邻格
    expect(isRope(w, 11, 20)).toBe(false);                   // 冷却未出=不写格
    expect(consumed).toHaveLength(1);
    // retarget 续列面同理：点绳列中段连拍两次,第二拍不出冷却不续格
    const w2 = mkWorld();
    w2.store.setTileSilent(10, 21, 0);
    for (let y = 15; y <= 20; y++) w2.store.setTileSilent(10, y, ROPE_T);
    const g2 = shell(w2, consumed, []);
    g2.tryPlace(10, 17, defOf(ROPE_V));                      // retarget → (10,21) 续 1 格
    expect(isRope(w2, 10, 21)).toBe(true);
    g2.tryPlace(10, 17, defOf(ROPE_V));                      // 冷却窗内再点=不续 (10,22)
    expect(isRope(w2, 10, 22)).toBe(false);
  });

  it('retarget 走查（CheckRopeUsability :41826）：点绳列中段=列底续 1 格,非原地非级联', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 21, 0);                        // 清柱位地面=列下悬空
    for (let y = 15; y <= 20; y++) w.store.setTileSilent(10, y, ROPE_T);
    const consumed: number[] = [];
    shell(w, consumed, []).tryPlace(10, 17, defOf(ROPE_V));  // 点列中段（active 绳格）
    expect(isRope(w, 10, 21)).toBe(true);                    // 列底下方续 1 格
    expect(isRope(w, 10, 22)).toBe(false);                   // 非级联
    expect(consumed).toHaveLength(1);
  });

  it('走查穿平台 ≤5 隙（:41835 Platforms 集合）：平台甲板下续绳;>5 隙止步不 retarget', () => {
    const w = mkWorld();
    for (let y = 15; y <= 20; y++) w.store.setTileSilent(10, y, ROPE_T);
    for (let y = 21; y <= 25; y++) w.store.setTileSilent(10, y, PLATFORM_T);   // 5 格平台隙
    shell(w, [], []).tryPlace(10, 17, defOf(ROPE_V));
    expect(isRope(w, 10, 26)).toBe(true);                    // 穿 5 格平台,落点续绳
    const w2 = mkWorld();
    for (let y = 15; y <= 20; y++) w2.store.setTileSilent(10, y, ROPE_T);
    for (let y = 21; y <= 26; y++) w2.store.setTileSilent(10, y, PLATFORM_T);  // 6 格隙 > num=5
    shell(w2, [], []).tryPlace(10, 17, defOf(ROPE_V));
    expect(isRope(w2, 10, 26)).toBe(false);                  // 隙超限:走查止于平台(非 cut)→不 retarget→拒
    expect(isRope(w2, 10, 27)).toBe(false);
  });

  it('岩浆门（IsBlockedByLava→tileLavaDeath[213]）：绳列下邻岩浆止步;岩浆格拒置', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 21, 0);                        // 清柱位地面（排除实心止步干扰）
    for (let y = 15; y <= 20; y++) w.store.setTileSilent(10, y, ROPE_T);
    const st = w.store;
    st.liquid[st.idx(10, 21)] = 200;
    st.liquidType[st.idx(10, 21)] = LIQUID_TYPE.LAVA;
    shell(w, [], []).tryPlace(10, 17, defOf(ROPE_V));
    expect(isRope(w, 10, 21)).toBe(false);                   // 岩浆前止步（旧级联"遇岩浆截断"面不变）
    expect(isRope(w, 10, 22)).toBe(false);
    const w2 = mkWorld();
    const st2 = w2.store;
    st2.liquid[st2.idx(10, 20)] = 200;
    st2.liquidType[st2.idx(10, 20)] = LIQUID_TYPE.LAVA;
    shell(w2, [], []).tryPlace(10, 20, defOf(ROPE_V));       // 干格点击目标=岩浆格本体
    expect(isRope(w2, 10, 20)).toBe(false);
  });

  it('支撑门（AssortedThings 尾支 :41565）：四邻无锚且无墙=拒;背景墙=放行', () => {
    const w = mkWorld();
    shell(w, [], []).tryPlace(14, 15, defOf(ROPE_V));        // 全悬空（邻格全空无墙,射程内）
    expect(isRope(w, 14, 15)).toBe(false);
    const w2 = mkWorld();
    w2.store.wall[w2.store.idx(14, 15)] = 1;                 // 目标格背景墙
    shell(w2, [], []).tryPlace(14, 15, defOf(ROPE_V));
    expect(isRope(w2, 14, 15)).toBe(true);                   // 墙锚放行（:41580）
  });

  it('支撑门绳邻接：邻格为绳（tileRope 集合）/平台皆锚（:41568 tileRope||Solid 双旗面）', () => {
    const w = mkWorld();
    w.store.setTileSilent(11, 15, ROPE_T);                   // 左邻=绳
    shell(w, [], []).tryPlace(12, 15, defOf(ROPE_V));
    expect(isRope(w, 12, 15)).toBe(true);
    const w2 = mkWorld();
    w2.store.setTileSilent(12, 16, PLATFORM_T);              // 下邻=平台（tileSolid 双 true）
    shell(w2, [], []).tryPlace(12, 15, defOf(ROPE_V));
    expect(isRope(w2, 12, 15)).toBe(true);
  });

  it('结构锁：旧级联面（for y=ty; y<ty+10 / RopeCoil 语义注释）已摘（变异：回植即红）', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/core/Game.ts'), 'utf8');
    expect(src.includes('RopeCoil 语义')).toBe(false);
    expect(src.includes('y < ty + 10')).toBe(false);
    expect(src.includes('TILE_ROPE_SHEETS.has(g0)')).toBe(true);
    expect(src.includes('ROPE_LAVA_DEATH_SHEETS')).toBe(true);
    expect(src.includes('this.runPickupArm(where, i, cur);')).toBe(false);   // Game.ts 无取件臂
  });

  it('结构锁：splitHalf 拆半面全仓摘除（UI.ts 变异：回植即红）', () => {
    const uiSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');
    expect(uiSrc.includes('this.splitHalf(')).toBe(false);   // 调用点摘除（注释提及不计）
    expect(uiSrc.includes('private splitHalf')).toBe(false);
    expect(uiSrc.includes('runPickupArm')).toBe(true);
    expect(uiSrc.includes('tickStackSplitMain')).toBe(true);
    expect(uiSrc.includes('refreshStackSplitCooldown')).toBe(true);
  });
});

// vid↔本仓 id 反解防呆（COIN_GOLD 未注册时显式爆红而非 undefined 混入）
describe('BJ157 0 夹具自检', () => {
  it('木材/火把/金币 def 均在册', () => {
    expect(WOOD).toBeTruthy();
    expect(TORCH).toBeTruthy();
    expect(ITEM_DEFS[TORCH].maxStack).toBeGreaterThan(0);
  });
});
