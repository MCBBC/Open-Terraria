// BJ536 2026-09-23/10-06 镐选中放置即被挖（用户实报：热键栏选镐 → 左键点背包单件
// 物块/家具 → 放置 → 放下的瞬间被镐挖一次）
//
// 原版定谳链（Terarria1457 亲读）：
//   ① 光标持物伪选中 58：PickItemSelectionOverride（Player.cs:17526-17532）mouseItem
//      非空 → selectedSlot=58 → HeldItem=inventory[58]=光标物（Player.cs:3837）——
//      背包开着捏物点世界 = 直接使用/放置光标物，此刻镐完全不是 HeldItem。
//   ② 消耗拍归零即 air：放置消耗 inventory[selectedItem].stack--（Player.cs:40011）
//      `stack==0 → SetDefaults(0)`（:40013-40015）——inventory[58] 立即空手；
//      Item.IsAir（Item.cs:386-395）`type>0 ? stack<=0 : true` = 0 堆叠即 air。
//   ③ 58 粘滞耗尽窗：SelectedItemState.Update（Player.cs:483-517）门
//      CanChangeSelectedItemImmediately（:415-421 `!UsingOrReusingItem &&
//      ItemTimeIsZero`）——放置挥击动画在途时 Update 整体早退，selected 粘 58、
//      HeldItem=inventory[58]=air（空手）→ 耗尽窗内【不存在】挖掘载体（air 无
//      useStyle/无 pick），同拍/次拍皆不可能起挥镐。
//   ④ 还原拍杀手面：动画走完后 Update 恢复 `selected = overridden`（:491-494，
//      = 伪选中前的热栏镐槽）→ OnSelectionChanged（:519-533）：
//      `if (controlUseItem) { if (!releaseUseItem) { Main.blockMouse = true;
//      player.controlUseItem = false; } }` —— 按住未松的那一下被 blockMouse 压死
//      （TriggersSet.cs:837-847 电平语义：按住期 controlUseItem 不置位，松键复位），
//      镐不可能在还原拍对刚放的块起挥；松手后的新点击 = 用户意志，照常挖掘。
//   ⇒ 原版此操作流【任何一拍】都不存在"镐挖刚放的块"：耗尽窗空手无载体，
//      还原拍 blockMouse 压制按住，新点击才恢复挖掘。
//
// 本仓病灶（SW-AZ1 光标持物镜像面 vs 原版③④缺失）：
//   镜像消耗即清（commitCursorMirror/syncCursorMirror stack<=0 立即 null）→
//   heldItem() 次拍即回落热栏镐 → 镐 autoReuse holdOk 放行工具分支 → tryMine
//   命中刚放的 tile（单件家具一击即碎）= 用户所见"放下的瞬间被挖一次"。
//
// 落刀（1:1 原版③④）：
//   A. Inventory.heldItem()：镜像存在但 stack<=0 → null（=inventory[58] air 粘滞）。
//   B. Game.syncCursorMirror：耗尽粘滞至 CanChangeSelectedItemImmediately 才清镜像；
//      清除拍 = 还原拍 → OnSelectionChanged 杀手面（controlUseItem 按住中 →
//      armBlockMouse = Main.blockMouse=true 电平压制，松键复位）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { HitTile } from '../src/core/HitTile';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import { releaseBlockMouse } from '../src/core/Input';

const iidOf = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;
const PICK_IID = iidOf(3509);   // 铜镐（SW-AZ1 e2e 同款热栏原物）
const TORCH_IID = iidOf(8);     // 火把（tileNoFail 族 = 一击即碎,用户"家具"症状件）

/** Game 壳（fx21/AZ1 同款 Object.create 桩法）+ 真 tile 逐拍驱动器。
 *  逐拍序 = Game.update 真序：syncCursorMirror(:10665) → updateUse(:10675) →
 *  commitCursorMirror(:10683) → updateSwingHits(:51714) → useTime--(Player.ts:4067)。 */
function bj536Game() {
  const world = new World(120, 120, 30, 'bj536');
  const st = world.store;
  // 石地板行 + 目标格（火把底锚 = 下方实心）
  for (let x = 40; x < 80; x++) st.setTileSilent(x, 62, TILE_BY_KEY['stone']);
  const inv = new Inventory();
  inv.slots[0] = { id: PICK_IID, stack: 1 };      // 热栏选中镐（selected 缺省 0）
  const cursor: { id: number; stack: number } = { id: TORCH_IID, stack: 1 };  // 单件火把在光标
  inv.cursorMirror = cursor as never;             // 光标持物伪选中激活态
  const player = new Player(60 * 16, 59 * 16, inv);
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    syncCursorMirror(): void;
    updateUse(dt: number): void;
    commitCursorMirror(): void;
    updateSwingHits(): void;
    tryMine(tx: number, ty: number, power: number, type: 'pick' | 'axe' | 'hammer',
      speed: number, useTime?: number, opts?: { drill?: boolean }): void;
    input: Record<string, unknown>;
    player: Player;
    world: World;
  };
  let uiCursor: { id: number; stack: number } | null = cursor;
  g.world = world;
  g.player = player;
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false,
    uiBlocking: false, blockMouse: false, delayUseItem: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 61], screenToWorld: () => [60 * 16 + 8, 61 * 16 + 8] };
  g.renderer = {
    canvas: { width: 800, height: 600 }, fullMap: { open: false },
    timeUiHover: false, weatherUiHover: false, minimapUiHover: false,
  };
  g.smartCursor = { showing: false, lockedContinuity: null, x: 0, y: 0 };
  // ★BJ600 回归修复（2026-10-10）：updateUse 内 tickWiresRadial（BJ569/572 于
  //  7647345e 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（既有红,与本刀无关,补桩复绿）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.prevSwingMouse = false;
  g._prevRightDown = false;
  g._prevMouseDown = false;
  g.inpOverDomUi = () => false;                    // 光标在世界（非 DOM UI）
  g.uiHeldItemRef = () => !!uiCursor;              // UI.heldStack 活对象三钩（AZ1 装配同位）
  g.uiHeldItemObj = () => uiCursor;
  g.uiHeldItemClear = () => { uiCursor = null; };
  g.netCanEditTile = () => true;
  g.netDeny = () => {};
  g.hitTiles = new HitTile();
  g.lastMineHitTick = -999;                        // tryMine 节流窗外
  g.lastMineItemTime = 0;
  g.tickCount = 1000;
  g.intentionGuesser = { allowTracking: () => {}, track: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.chunks = { markDirtyArea: () => {} };
  g.spawnDrop = () => null;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.itemIconCache = { update: () => {} };          // 放置路径余辉（:15953 itemIconCacheUpdate）
  g.entities = {
    critters: [], enemies: [], npcs: [], projectiles: [], add: () => {},
  };
  // tryMine 侦数包装（不改行为,只录击打目标）——原方法仍在原型上
  const mineCalls: Array<[number, number]> = [];
  const origTryMine = (Game.prototype as unknown as {
    tryMine: (...a: unknown[]) => void;
  }).tryMine;
  g.tryMine = function (this: unknown, ...a: unknown[]) {
    mineCalls.push([a[0] as number, a[1] as number]);
    return origTryMine.apply(this, a);
  } as typeof g.tryMine;

  const tick = (): void => {
    g.tickCount = (g.tickCount as number) + 1;
    g.syncCursorMirror();
    g.updateUse(1 / 60);
    g.commitCursorMirror();
    g.updateSwingHits();
    if (player.useTime > 0) player.useTime--;      // Player.fixedUpdate :4067
  };
  return { g, player, inv, cursor, world, st, mineCalls, tick, getUiCursor: () => uiCursor };
}

describe('BJ536 镐选中放置即被挖', () => {
  it('用户流：镐选中+光标单件火把+放置 → 按住全程火把存活（原版58粘滞+还原杀手面）', () => {
    const { g, inv, cursor, st, mineCalls, tick } = bj536Game();
    const TORCH = TILE_BY_KEY['torch'];
    // ---- tick T：放置拍（光标持物伪选中 → 放置光标物）----
    tick();
    expect(st.get(60, 61)).toBe(TORCH);                 // 火把放置成功
    expect(cursor.stack).toBe(0);                       // 单件耗尽（Player.cs:40011-40015 同拍归零）
    expect(inv.heldItem()).toBeNull();                  // ★③ inventory[58]=air：耗尽粘滞窗=空手（无挖掘载体）
    // ---- tick T+1..k：按住不松（病灶窗 = 镐被还原+autoReuse holdOk → tryMine）----
    for (let i = 0; i < 30; i++) {
      tick();
      // 窗口内（动画在途,useTime>0）两钉：镜像留守（未还原）+ HeldItem=空手
      // ——vanilla selected 粘 58 至 CanChangeSelectedItemImmediately（:483-494）,
      // 提前清镜像/回落镐者在此变红（变异②判别位）
      if (i === 1) {
        expect(g.player.useTime).toBeGreaterThan(0);      // 动画确在途（窗口判别前提）
        expect(inv.cursorMirror).not.toBeNull();          // 粘滞未解除
        expect(inv.heldItem()).toBeNull();                // inventory[58]=air 空手
      }
    }
    expect(st.get(60, 61)).toBe(TORCH);                 // ★BJ536 判别：刚放的火把【存活】（原版任何一拍都不挖）
    expect((g.hitTiles as HitTile).getDamage(60, 61)).toBe(0);   // 零伤害积累
    // ---- 动画走完 → 还原拍（vanilla :491-494 回热栏 + :519-533 杀手面）----
    expect(inv.heldItem()).toBe(inv.slots[0]);          // 还原后 HeldItem=镐
    expect(inv.cursorMirror).toBeNull();                // 粘滞解除
    expect((g.input as { blockMouse: boolean }).blockMouse).toBe(true);  // ★④ 按住被 blockMouse 压死
    expect(mineCalls).toHaveLength(0);                  // 全程零 tryMine（病灶=对(60,61)起挖）
    // ---- 松键（Input.mouseup → releaseBlockMouse,TriggersSet.cs:844-847 else 支）----
    const inp = g.input as { mouseDown: boolean; mouseHeld: boolean; blockMouse: boolean };
    inp.mouseDown = false;
    inp.mouseHeld = false;
    releaseBlockMouse(inp as never);
    tick();                                             // 松键拍：blockMouse 复位、无事发生
    expect(inp.blockMouse).toBe(false);
    expect(st.get(60, 61)).toBe(TORCH);
    // ---- 判别②：还原后【新点击】照常挖掘（松手再点=用户意志,原版相）----
    inp.mouseDown = true;
    inp.mouseHeld = true;
    tick();
    expect(mineCalls.some(([x, y]) => x === 60 && y === 61)).toBe(true);   // 新点击起挖
    expect(st.get(60, 61)).not.toBe(TORCH);             // 火把一击即碎（tileNoFail :22612 dmg=100）
  });

  it('病灶对照：耗尽粘滞窗 heldItem() 不得回落热栏镐（heldItem 58-air 语义单测）', () => {
    const { inv } = bj536Game();
    // 活光标物 = HeldItem=光标物（PickItemSelectionOverride :17528-17532）
    const live = { id: TORCH_IID, stack: 3 };
    inv.cursorMirror = live as never;
    expect(inv.heldItem()).toBe(live);
    // 消耗归零 = inventory[58] air（Item.cs:386-395 stack<=0 即 air）→ 空手,不回落镐
    live.stack = 0;
    expect(inv.heldItem()).toBeNull();
    // 镜像解除（还原拍后）→ 回热栏（:491-494 selected=overridden）
    inv.cursorMirror = null;
    expect(inv.heldItem()).toBe(inv.slots[0]);
  });
});
