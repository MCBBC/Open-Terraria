// R4 伴随项 2026-09-03：猪龙鱼之翼 2611↔5526 右键互换（ChangeItemType）行为锁。
// 原版权威（1457）：
//   Player.cs:31764-31877 ItemCheck_ManageRightClickFeatures——flag（:31766
//   controlUseTile && !tileInteractionHappened && releaseUseItem && !controlUseItem &&
//   !mouseInterface && …）+ :31772 门 `altFunctionUse==0 && itemTime==0 &&
//   itemAnimation==0` + 快换表 case 2611→num=5526 / case 5526→num=2611（:31864-31868,
//   type 缺省 7=legacy Grab 音）→ :31871-31876 releaseUseTile=false +
//   Main.mouseRightRelease=false + PlaySound(7) + inventory[selected].ChangeItemType(num)
//   （Item.cs:47841-47850 = SetDefaults(to) + Prefix(prefix) + favorited/stack 保留）。
//   2611/5526 不在 ItemsThatAllowRepeatedRightClick（ItemID.cs:66 仅 3384/3858/3852）
//   → mouseRightRelease 边沿触发；HasItemSwap（ItemID.cs:1219）含两 vid（提示面）；
//   两型 IsConsideredSameItemAsType（Item.cs:47925-47931）视同一件。
//   SetDefaults 全等（useStyle5/useAnim=useTime20/autoReuse/66/4.5/shootSpeed14/
//   melee+noMelee+noUseGraphic）唯一差异 shoot 404↔1058 + channel → 换型即换
//   射击形态：2611 掷球回收（kind 'flairon',FlaironHeadProj 弹 404）↔
//   5526 经典链锤（kind 'flail',FlailProj 弹 1058）。
// 仓内：Game.updateUse 右键交互块触发（6190↔6195 先例同位）+ Game.swapFlaironForm。
// 运行：cd game && npx vitest run tests/flairon-swap.test.ts
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { FlaironHeadProj, FlailProj } from '../src/entities/WeaponProj';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const PX = 50 * TILE, PY = 90 * TILE;
const iidOf = (vid: number) => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];

/** FlaironHeadProj/FlailProj 行为面最小 hooks（同 flairon-head/weapon-flail-fix 先例） */
function makeHooks() {
  const store = new TileStore(200, 160);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 160; y++) store.setTile(x, y, 1);
  const player = new Player(PX, PY, new Inventory());
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => [],
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
    mapFullscreen: () => false,
    spawnDust: () => null,
  };
  const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, n: number) => {
    for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, hooks);
  };
  return { hooks, player, run };
}

/** updateUse 最小桩（2611/5526 右键互换手势面,同 wasp-gun-parkour parkourGame 先例：
 *  右键交互块全链可达——tile 交互分派全部落空 + 快换支在 altUse 族支之前） */
function flaironGame(vid: 2611 | 5526, input: Record<string, unknown>, prevRightDown = false) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(PX, PY, new Inventory());
  player.inv.add(iidOf(vid), 1);
  g.player = player;
  g.entities = { add: () => {}, projectiles: [], npcs: [], critters: [], enemies: [] };
  g.input = { mouseDown: false, mouseHeld: false, rightDown: true, mouseX: 700, mouseY: 300,
    uiBlocking: false, downAction: () => false, ...input };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0] };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false },
    timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.mining = null;
  g.housingMode = null;
  g.recallChannel = null;
  g.golfWhistleAt = null;
  g.minecart = null;
  g.cartKeyLatch = false;
  g.swing = null;
  g._prevMouseDown = false;
  g._prevRightDown = prevRightDown;
  g.world = { store: { get: () => 0 }, flags: {} };
  g.tryFaceHeldAim = () => {};
  g.itemFuncTool = () => undefined;
  g.inTileRange = () => false;
  g.findChestNear = () => null;
  g.talkToNearbyNpc = () => false;
  g.interactAt = () => {};
  g.sfx = { play: () => {}, playWavFile: () => true, playFiles: () => true };
  g.achievements = { handleSpecialEvent: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  return { g, player };
}

const runUse = (g: Record<string, unknown>): void =>
  (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);

// ============================================================
// ① 双向互换（Player.cs:31864-31868 快换表 + :31871-31876 消费）
// ============================================================
describe('2611↔5526 右键互换（快换表 :31864-31868,仓内 updateUse 右键交互块）', () => {
  it('持 2611 纯右键帧：右键边沿 → 换 5526 + 吞边沿（:31874 mouseRightRelease=false）', () => {
    const { g, player } = flaironGame(2611, {});
    runUse(g);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(5526));
    expect((g.input as { rightDown: boolean }).rightDown).toBe(false);
  });

  it('持 5526 → 换回 2611（快换表双向）', () => {
    const { g, player } = flaironGame(5526, {});
    runUse(g);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(2611));
  });

  it('ChangeItemType（Item.cs:47841-47850）：stack/prefix/favorited 保留', () => {
    const { g, player } = flaironGame(2611, {});
    const slot = player.inv.heldItem()!;
    slot.prefix = 81;        // legendary（近战词缀代表位,只验换型不动词缀）
    slot.favorited = true;
    runUse(g);
    expect(slot.id).toBe(invIndexOfVanilla(5526));
    expect(slot.stack).toBe(1);
    expect(slot.prefix).toBe(81);
    expect(slot.favorited).toBe(true);
  });

  it('右键非边沿帧（不在 ItemsThatAllowRepeatedRightClick,ItemID.cs:66）不换型', () => {
    const { g, player } = flaironGame(2611, { rightDown: true }, true);  // prevRightDown=true=非边沿
    runUse(g);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(2611));
  });
});

// ============================================================
// ② 互换后 shoot 值（SetDefaults 全等,唯一差异 shoot 404↔1058）
// ============================================================
describe('互换后射击面分流（唯一差异 shoot 404↔1058,2611↔5526）', () => {
  it('2611→5526：combatWeapon(shoot)=1058 + kind flail；数值面保持全等', () => {
    const { g, player } = flaironGame(2611, {});
    runUse(g);
    const cw = combatWeapon({ key: VANILLA_ITEM_KEY_BY_ID[5526], vid: 5526 });
    expect(cw?.kind).toBe('flail');
    expect(cw?.shoot).toBe(1058);              // aiStyle 15 经典链锤（DefaultToFlail :10000-10006）
    expect(cw?.damage).toBe(66);               // 两型 SetDefaults 全等面（Item.cs 2611/5526 同值）
    expect(cw?.useTime).toBe(20);
    expect(cw?.shootSpeed).toBe(14);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(5526));
  });

  it('5526→2611：combatWeapon(shoot)=404 + kind flairon', () => {
    const { g, player } = flaironGame(5526, {});
    runUse(g);
    const cw = combatWeapon({ key: VANILLA_ITEM_KEY_BY_ID[2611], vid: 2611 });
    expect(cw?.kind).toBe('flairon');
    expect(cw?.shoot).toBe(404);               // aiStyle 69 掷球回收（AI_069 内联 :30730-30829）
    expect(cw?.damage).toBe(66);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(2611));
  });
});

// ============================================================
// ③ 门面（Player.cs:31765 flag + :31772 itemTime/itemAnimation 归零门）
// ============================================================
describe('互换门面（:31765 releaseUseItem&&!controlUseItem + :31772 使用态门）', () => {
  it('按住左键期间点右键：不换型（!controlUseItem 门,rightDown 未吞）', () => {
    const { g, player } = flaironGame(2611, { mouseHeld: true });
    runUse(g);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(2611));
    expect((g.input as { rightDown: boolean }).rightDown).toBe(true);
  });

  it('useTime>0（itemTime/itemAnimation 未归零,如 2611 球在场钉持）不换型', () => {
    const { g, player } = flaironGame(2611, {});
    player.useTime = 10;                       // SetDummyItemTime(10) 钉持等价态
    runUse(g);
    expect(player.inv.heldItem()!.id).toBe(invIndexOfVanilla(2611));
  });
});

// ============================================================
// ④ 链球链各自正常（换型即换形态,两链互不干扰）
// ============================================================
describe('两形态链各自正常（404 掷球回收 / 1058 经典链锤）', () => {
  it('2611 链：404 球在场 pinUse 钉持（SetDummyItemTime(10) :30739→:4417-4426）'
    + '= 互换不可达（useTime===0 门恒假）的单实例门承载', () => {
    const { player, run } = makeHooks();
    const ball = new FlaironHeadProj(player.cx + 40 - 13, player.cy - 13, 14, 0, 66, 4.5);
    ball.pinUse = () => { player.useTime = Math.max(player.useTime, 10); };
    run(ball, 5);
    expect(player.useTime).toBeGreaterThanOrEqual(10);   // 球在场期间钉持
  });

  it('2611 链：404 出程直线 → 超 400px 转回收速 20（:30754-30776）', () => {
    const { player, run } = makeHooks();
    const ball = new FlaironHeadProj(player.cx + 40 - 13, player.cy - 13, 14, 0, 66, 4.5);
    run(ball, 27);                                       // 第 27 拍 dist=40+14×26=404 > 400
    expect(ball.aiState).toBe(1);                        // 回收态
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(20, 9);   // 速 20
  });

  it('5526 链：1058 球 channel 真值 → 旋转态；换手后（旧 id 失配）掷出不回收', () => {
    const { player, run } = makeHooks();
    const oldId = iidOf(5526);                 // 掷出时捕获的手持物品 id（case 'flail' 同款闭包）
    player.inv.add(oldId, 1);
    const f = new FlailProj(player.cx, player.cy, 66, 4.5, 1058,
      () => player.inv.heldItem()?.id === oldId,
      () => ({ x: player.cx + 100, y: player.cy }));
    expect(f.aiState).toBe(0);                 // channel 期旋转态
    // 右键换型：手持变 2611 → channel 回调失配 = 原版「换手即掷出」同源语义
    player.inv.slots[player.inv.selected] = { id: iidOf(2611), stack: 1 };
    run(f, 1);
    expect(f.aiState).toBe(1);                 // 旋转 → 掷出（AI_015 case0 !held 支）
    expect(f.dead).toBe(false);                // 掷出后独立在飞,换型不回收（st≥1 不读 channel）
  });
});
