// ★Q4 刀 2026-09-30（BJ413 登记·挂机放风筝 AFK 链 1:1 建模判别面）：
//   原文链（1457 Player.cs）：
//     ①步进 :25696-25702 IsConsideredStandingStill && (itemAnimation==0||IsAKite[held])
//       && 六输入皆空 → afkCounter++ 与 afkCounterForKiting++ 同一 if/else 同拍；
//     ②kite 计数独有清零 :25702-25704 光标持物（!Main.mouseItem.IsAir → 0,afkCounter
//       不清）/:25705-25710 petting·sitting·sleeping → 0；
//     ③selectedKite 每 tick 重算 ResetEffects :18548 清 -1 → UpdateEquips :12994
//       HeldItem 槽优先 + :13001 0..57 顺序扫（RefreshAutoKitingFromItemTypeAndSlot
//       :12939-12944 `selectedKite<=-1 && IsAKite[accType] → slot`）；
//     ④消费 PickItemSelectionOverride :17533-17547：≥AFKTimeNeededForAutoKiting(3600,
//       :977) ∧ selectedKite>=0 ∧ !noItems ∧ !isOperatingAnotherEntity ∧ spectating<0
//       → selectedSlot=selectedKite;holdStyle==0 → controlUseItem=(releaseUseItem=true)
//       （holdStyle 由 ItemCheck_HackHoldStyles :53495-53512 写：场上有同型风筝弹=1）。
//   变异证红（手工执行实录）：
//     M1 步进块 `this.afkCounterForKiting = steppedAfk` 行删 → A1 红（kite 计数恒 0）
//     M2 cursorMirror 清零行删 → A2 红（kite 计数不清零）
//     M3 selectedKite 扫描 held-first 支删 → A4 红（同持双风筝档 held 不胜出）
//     M4 Game AFK 臂门 `!controlTorch` 删 → B8 红（Shift 智选被 AFK 抢占）
//     M5 Game AFK 臂 noItems 腿删 → B4/B5 红（诅咒/钻头坐骑照切风筝）
//   ★BJ428（2026-10-01）M6 updateUse G1 总闸 `&& !this._afkKiteForceUse` 删 →
//     C1 红（装备置旗但 KiteProj 出膛数 0——用户实报「装备不放飞」断链层）
import { describe, it, expect, vi } from 'vitest';
import { newWiresRadialState } from '../src/stats/wiresRadial';   // ★BJ662 桩族补齐（BJ626 newWiresRadialState 先例）
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { SmartSelect, EMPTY_SLOT } from '../src/player/SmartSelect';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { KITE_ITEM_PROJ } from '../src/entities/LeashedCritter';
import { KiteProj } from '../src/entities/KiteProj';
import { BuffType } from '../src/stats/Buffs';

const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  if (k === undefined) throw new Error(`vid ${vid} 缺 def 键`);
  return ITEM_BY_KEY[k];
};
const KITE_VID = 4367;                                   // 蓝风筝（KiteBlue）

const mkWorld = (): World => {
  const w = new World(160, 160, 33, 'q4-afk');
  // 地板钉 y>640（bordersMovement 顶界钳 B=640——160×160 小世界 y<640 全带被钳）
  for (let x = 12; x <= 140; x++) w.store.setTileSilent(x, 50, 1 /* dirt */);
  return w;
};

const fakeHooks = (w: World, p?: Player, enemies: unknown[] = []) => ({
  world: w,
  player: p,
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
  recLog: () => {},
  achievements: undefined,
  scene: {},
});

const mkPlayer = (w: World, inv = new Inventory()): Player => {
  void w;
  const p = new Player(40 * 16, 50 * 16 - 44, inv);
  p.x = 40 * 16; p.y = 50 * 16 - 44; p.vx = 0; p.vy = 0;   // 构造器不位移,显式钉位防钳
  return p;
};

// ═══ ①②步进 + 独有清零面（Player.fixedUpdate 实驱） ═══
describe('Q4-A AFK 两计数链（Player.cs:25696-25710）', () => {
  it('A1 静置同拍步进：afkCounter 与 afkCounterForKiting 同值同增（:25697-25700）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    for (let i = 0; i < 40; i++) tick();                 // 落地收敛（下落拍 vy≠0 清零）
    const base = p.afkCounter;
    expect(base).toBeGreaterThan(0);                     // 已静置计数中
    expect(p.afkCounterForKiting).toBe(base);            // 两计数同拍同值
    for (let i = 0; i < 5; i++) tick();
    expect(p.afkCounter).toBe(base + 5);
    expect(p.afkCounterForKiting).toBe(base + 5);
  });

  it('A2 光标持物只清 kite 计数（:25702-25704——afkCounter 不清）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    for (let i = 0; i < 40; i++) tick();
    const base = p.afkCounter;
    p.inv.cursorMirror = { id: iidOf(8) /* 火把 */, stack: 1 };
    for (let i = 0; i < 3; i++) tick();
    expect(p.afkCounter).toBe(base + 3);                 // afkCounter 照常步进
    expect(p.afkCounterForKiting).toBe(0);               // kite 计数独立清零
  });

  it('A3 petting/sitting/sleeping 只清 kite 计数（:25705-25710）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    for (let i = 0; i < 40; i++) tick();
    p.sitting = true;
    for (let i = 0; i < 3; i++) tick();
    // （坐椅物理本仓带微动=afkCounter 步进面不在此判,只判 kite 计数独立清零）
    expect(p.afkCounterForKiting).toBe(0);
    p.sitting = false;
    // 坐骑抚摸支（petMount 态）——非 mount 抚摸在 updatePettingAnimal 的
    // validTarget/drift 门首拍即自清（repo 内部维护面,与原版 :25705 判据无关）
    p.petting.isPetting = true;
    p.petting.mount = true;
    for (let i = 0; i < 2; i++) tick();
    expect(p.afkCounterForKiting).toBe(0);
    p.petting.isPetting = false;
    p.petting.mount = false;
    for (let i = 0; i < 2; i++) tick();
    expect(p.afkCounterForKiting).toBeGreaterThan(0);    // 体力面退出即恢复步进
  });

  it('A4 selectedKite 每 tick 重算：HeldItem 槽优先 + 0..57 首件胜出（:12994/:13001）', () => {
    const w = mkWorld();
    const inv = new Inventory();
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    tick();
    expect(p.selectedKite).toBe(-1);                     // 无风筝
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    tick();
    expect(p.selectedKite).toBe(3);                      // 0..57 首件
    inv.slots[0] = { id: iidOf(KITE_VID), stack: 1 };
    tick();
    expect(p.selectedKite).toBe(0);                      // 更低槽胜出（held 槽 0 空）
    inv.selected = 1;
    inv.slots[1] = { id: iidOf(KITE_VID), stack: 1 };
    tick();
    expect(p.selectedKite).toBe(1);                      // HeldItem 槽优先（:12994）
    inv.slots[1] = { id: iidOf(8), stack: 1 };           // 手持换火把
    tick();
    expect(p.selectedKite).toBe(0);                      // 回落到 0..57 首件
  });

  it('A5 移动/输入清两计数（else 分支 :25701）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    for (let i = 0; i < 40; i++) tick();
    expect(p.afkCounterForKiting).toBeGreaterThan(0);
    p.inputTorch = true;                                 // 六输入之一
    tick();
    expect(p.afkCounter).toBe(0);
    expect(p.afkCounterForKiting).toBe(0);
    p.inputTorch = false;
    p.inputX = 1;
    tick();
    expect(p.afkCounterForKiting).toBe(0);
  });
});

// ═══ ④消费端：PickItemSelectionOverride 第三臂（Game.updateSmartSelect 尾） ═══
// 原型壳（sw-fx51 同款：private 仅编译期,vitest 无 DOM 不走构造器）
interface AfkShell {
  player: Player;
  input: { mouseX: number; mouseY: number; downAction: (a: string) => boolean };
  camera: { screenToWorld: (x: number, y: number) => [number, number]; y: number; zoom: number };
  renderer: { fullMap: { open: boolean }; canvas: { width: number; height: number } };
  world: { store: unknown };
  smartSelect: SmartSelect;
  smartSelectHotbar: number;
  _smartSelectSlots: Array<Record<string, number>>;
  spectatingSlot: number;
  cb: { onInventoryChanged: ReturnType<typeof vi.fn> };
  entities: { projectiles: Array<{ projId?: number; dead?: boolean }> };
  _afkKiteForceUse: boolean;
  usingOrReusingItem(): boolean;
  updateSmartSelect(): void;
  updateUse(_dt: number): void;
  kiteProjAirborne(shoot: number): boolean;
}

function afkShell(p: Player): AfkShell {
  const g = Object.create(Game.prototype) as unknown as AfkShell;
  // ★BJ662（2026-10-12）updateUse 头 tickWiresRadial（BJ572）读 this.wiresRadial——Object.create 壳无构造器字段 → flowerUpdate(st=undefined) TypeError（存量桩族缺件,持物非 wire 工具走早退支,桩仅为通路）
  (g as unknown as { wiresRadial: unknown }).wiresRadial = newWiresRadialState();
  g.player = p;
  g.input = { mouseX: 320, mouseY: 240, downAction: () => false };
  g.camera = { screenToWorld: () => [0, 0], y: 0, zoom: 1 };
  g.renderer = { fullMap: { open: false }, canvas: { width: 1600, height: 900 } };
  // wetCollision 只需不越界即零循环（w/h=1 → 扫描区空）
  g.world = {
    store: { w: 1, h: 1, idx: () => 0, inBounds: () => false, liquid: [0], flags: [0], slope: [0] },
  };
  g.smartSelect = new SmartSelect();
  g.smartSelectHotbar = 0;
  g._smartSelectSlots = Array.from({ length: 58 }, () => ({ ...EMPTY_SLOT }));
  g.spectatingSlot = -1;
  g.cb = { onInventoryChanged: vi.fn() };
  g.entities = { projectiles: [] };
  g._afkKiteForceUse = false;
  return g;
}

describe('Q4-B PickItemSelectionOverride AFK 臂（Player.cs:17533-17547）', () => {
  function readyPlayer(invSlots?: Array<[number, number]>): Player {
    const inv = new Inventory();
    const p = new Player(40 * 16, 27 * 16, inv);
    for (const [slot, vid] of invSlots ?? []) {
      if (vid > 0) inv.slots[slot] = { id: iidOf(vid), stack: 1 };
    }
    p.afkCounterForKiting = 3600;                        // 阈值恰达（:977 常量面）
    p.selectedKite = 3;                                  // Player.fixedUpdate 逐拍重算面的产物
    return p;
  }

  it('B1 阈值达+风筝在手 → 自动选中风筝槽+一拍强制使用旗（holdStyle==0 面）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.selectedKite = 3;
    const g = afkShell(p);
    p.inv.selected = 0;
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(3);                      // OverrideSelection(selectedKite)
    expect(g.cb.onInventoryChanged).toHaveBeenCalled();  // OnSelectionChanged :511-513
    expect(g._afkKiteForceUse).toBe(true);               // holdStyle==0 → 强制使用
  });

  it('B2 未达 3600 → 不动（AFKTimeNeededForAutoKiting :977）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.afkCounterForKiting = 3599;
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
    expect(g._afkKiteForceUse).toBe(false);
  });

  it('B3 场上有同型风筝弹（holdStyle==1 面 :53500-53511）→ 只切选不强制使用', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    const g = afkShell(p);
    const shoot = itemFuncOfVid(KITE_VID)?.shoot ?? -1;
    expect(shoot).toBe(KITE_ITEM_PROJ[KITE_VID]);
    g.entities.projectiles.push({ projId: shoot, dead: false });
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(3);
    expect(g._afkKiteForceUse).toBe(false);
  });

  it('B4 noItems（诅咒 23）→ 不动（:17538 腿；语义=Cursed+钻头坐骑,非 PvP 观战）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.buffs.apply(BuffType.Cursed, 10);
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
    expect(g._afkKiteForceUse).toBe(false);
  });

  it('B5 noItems（钻头坐骑 8）→ 不动（:53576 ItemCheck_HandleMount 面）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.mount.active = true;
    (p.mount as unknown as { type: number }).type = 8;
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
  });

  it('B6 观战态 spectating>=0 → 不动（:17538 腿,本仓 spectatingSlot 承载）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    const g = afkShell(p);
    g.spectatingSlot = 1;
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
  });

  it('B7 光标持物（mouseItem 非空第一臂 :17528-17531）→ 不动', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.inv.cursorMirror = { id: 1, stack: 1 };
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
  });

  it('B8 Shift 智选（controlTorch 第二臂 :17536）→ 不动（Lookup 返回 true 短路）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    const g = afkShell(p);
    g.input.downAction = () => true;                     // controlTorch
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
  });

  it('B9 已选中风筝槽 → 照发强制使用旗（OverrideSelection 同槽 no-op 但 :17541 在 return 前）', () => {
    const p = readyPlayer([[3, KITE_VID]]);
    p.inv.selected = 3;
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(3);
    expect(g.cb.onInventoryChanged).not.toHaveBeenCalled();  // 同槽无变更拍
    expect(g._afkKiteForceUse).toBe(true);
  });

  it('B10 kite 槽 vid 无 shoot（脏数据守卫）→ 臂整体空转', () => {
    const inv = new Inventory();
    const p = new Player(40 * 16, 27 * 16, inv);
    inv.slots[3] = { id: -5, stack: 1 };                 // 非法 id → vid -1
    p.afkCounterForKiting = 3600;
    p.selectedKite = 3;
    const g = afkShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
    expect(g._afkKiteForceUse).toBe(false);
  });
});

// ═══ BJ428 全链消费（2026-10-01 用户实报「AFK 自动装备风筝但不放飞」）═══
// 定谳断链层：updateUse G1 总闸（曾 `(?!mouseDown && !holdOk)` 即 return）不认
//   _afkKiteForceUse 旗——旗置位后 updateUse 在分派链起点早退,尾清自灭,装备当拍
//   永不放飞。原版同拍序：SelectedItemState.Update（PickItemSelectionOverride
//   :17541-17543 controlUseItem=(releaseUseItem=true)）→ 同 tick ItemCheck 消费
//   （controlUseItem 消费【无 mouseDown 前置】,TriggersSet.cs:835-847 MouseLeft
//   只是置位源之一）。修复=G1 第三触发源 `!this._afkKiteForceUse` 放行。
// 变异证红（手工执行实录）：
//   M6 G1 门 `&& !this._afkKiteForceUse` 删 → C1 红（装备但 KiteProj 出膛数 0）
describe('Q4-D BJ428 全链消费：G1 消费面放行→装备当拍同链放飞（:17541→ItemCheck 同拍）', () => {
  /** updateUse 面追加字段（afkShell 只覆盖 updateSmartSelect 面） */
  function useShell(p: Player): AfkShell {
    const g = afkShell(p) as AfkShell & Record<string, unknown>;
    Object.assign(g.input, {
      mouseDown: false, mouseHeld: false, rightDown: false,
      uiBlocking: false, blockMouse: false, delayUseItem: false,
    });
    g.inpOverDomUi = () => false;
    g.smartCursor = { showing: false, x: 0, y: 0 };
    (g.camera as unknown as { tileUnder: () => [number, number] }).tileUnder = () => [20, 20];
    g.world = {
      store: {
        w: 400, h: 400, get: () => 0, hasTile: () => false,
        idx: () => 0, inBounds: () => false, liquid: [0], flags: [0], slope: [0],
      },
    };
    const projectiles: unknown[] = [];
    g.entities = {
      projectiles,
      add: (e: unknown) => { projectiles.push(e); return e; },
    } as unknown as AfkShell['entities'];
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.recLog = () => {};
    g._prevMouseDown = false;
    g._prevRightDown = false;
    g.annotateMode = false;
    return g;
  }

  it('C1 全链实驱：fixedUpdate 3600+ 拍 → updateSmartSelect 装备+置旗 → updateUse 同拍放飞出膛', () => {
    const w = mkWorld();
    const inv = new Inventory();
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    let n = 0;
    while (p.afkCounterForKiting < 3600 && n < 8000) { tick(); n++; }  // 落地收敛后步进至阈值
    expect(p.afkCounterForKiting).toBeGreaterThanOrEqual(3600);
    const g = useShell(p);
    p.inv.selected = 0;
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(3);                      // 装备（OverrideSelection）
    expect(g._afkKiteForceUse).toBe(true);               // controlUseItem=(releaseUseItem=true)
    g.updateUse(1 / 60);                                 // 同拍 ItemCheck（G1 放行）
    const kites = (g.entities.projectiles as unknown[]).filter((e) => e instanceof KiteProj);
    expect(kites.length).toBe(1);                        // ★BJ428 判别：放飞出膛（断链曾=0）
    expect(p.inv.selected).toBe(3);                      // 装备保持
    expect(p.useTime).toBe(15);                          // combat useTime 15（vanilla-itemcombat）
    expect(p.inv.slots[3]).toBeTruthy();                 // 风筝不消耗（非 consumable）
  });

  it('C2 未达阈值对照：3599 拍 → 不装备不置旗不放飞', () => {
    const w = mkWorld();
    const inv = new Inventory();
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    for (let i = 0; i < 3599; i++) tick();               // 顶格 3599 拍（落地收敛只减不增）< 3600
    expect(p.afkCounterForKiting).toBeLessThan(3600);
    const g = useShell(p);
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(0);
    expect(g._afkKiteForceUse).toBe(false);
    g.updateUse(1 / 60);
    expect((g.entities.projectiles as unknown[]).filter((e) => e instanceof KiteProj).length).toBe(0);
  });

  it('C3 在场弹挡门对照（holdStyle==1 面）：有同型风筝弹 → 旗不置,G1 不放行', () => {
    const w = mkWorld();
    const inv = new Inventory();
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    let n = 0;
    while (p.afkCounterForKiting < 3600 && n < 8000) { tick(); n++; }
    const g = useShell(p);
    const shoot = itemFuncOfVid(KITE_VID)?.shoot ?? -1;
    (g.entities.projectiles as unknown[]).push({ projId: shoot, dead: false });
    g.updateSmartSelect();
    expect(p.inv.selected).toBe(3);                      // 只切选
    expect(g._afkKiteForceUse).toBe(false);              // 不强制使用
    g.updateUse(1 / 60);
    expect((g.entities.projectiles as unknown[]).filter((e) => e instanceof KiteProj).length).toBe(0);
  });
});

// ═══ BJ428-D1 uiBlocking 帧残面（2026-10-01 定谳+清偿）═══
// 定谳（原版开包挂机【照放飞】,逐行）：uiBlocking 等价面（开包/悬停面板/全屏地图）
//   不拦 AFK 链——Player.Update 逐拍序：ResetControls(:24961 清 controlUseItem) →
//   CopyInto(:24964;TriggersSet.cs:846-853 的 blockMouse/mouseInterface 门只拦
//   【MouseLeft 置位源】,不清既有置位) → :25583 mouseInterface→delayUseItem 与
//   :24993 mapFullscreen 全零站 → :25413 selectedItemState.Update【AFK 臂后置重申】
//   controlUseItem=(releaseUseItem=true)(:17537-17547,无任何 UI 门) → ItemCheck
//   消费门 :43064 / CanUse :52657 均无 playerInventory/mouseInterface 门（后者仅
//   LocalPlayerHasPendingInventoryActions :43322=FakeCursorItem/制作请求,与开包
//   无关）。死亡面反证：:24948-24957 dead 路径 return 先于 ResetControls/selection/
//   ItemCheck → 死亡拍臂不跑不放飞（本仓 dead 排除同相）。cursorHeld 拍=光标持物,
//   臂门 !env.mouseItemHeld+计数清零 :25702-25704 → 旗恒 false=自然 no-op。
// 本仓病面：updateUse uiBlocking/inpOverDomUi 早退（mouseInterface 等价拦截面,拦
//   鼠源使用拦得对）吞掉 override 直置旗 → 旗尾清自灭=悬停帧永不放飞。
// 修复=早退块内旗救援：直调 useCombatWeapon kite 支（⑩臂同路,useTime==0 同门,
//   kind==='kite' defensive 门零旁漏;dead/annotateMode 排除）。
// 变异证红（手工执行实录）：
//   M7 救援块整删 → D1/D2/D6 红（uiBlocking/inpOverDomUi/fullMap 帧 KiteProj 出膛 0）
describe('Q4-E BJ428-D1 uiBlocking 帧残面：早退块内旗救援→悬停/面板帧照放飞', () => {
  function useShell(p: Player): AfkShell & Record<string, unknown> {
    const g = afkShell(p) as AfkShell & Record<string, unknown>;
    Object.assign(g.input, {
      mouseDown: false, mouseHeld: false, rightDown: false,
      uiBlocking: false, blockMouse: false, delayUseItem: false,
    });
    g.inpOverDomUi = () => false;
    g.smartCursor = { showing: false, x: 0, y: 0 };
    (g.camera as unknown as { tileUnder: () => [number, number] }).tileUnder = () => [20, 20];
    g.world = {
      store: {
        w: 400, h: 400, get: () => 0, hasTile: () => false,
        idx: () => 0, inBounds: () => false, liquid: [0], flags: [0], slope: [0],
        isSolid: () => false,
      },
    };
    const projectiles: unknown[] = [];
    g.entities = {
      projectiles,
      add: (e: unknown) => { projectiles.push(e); return e; },
    } as unknown as AfkShell['entities'];
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.recLog = () => {};
    g._prevMouseDown = false;
    g._prevRightDown = false;
    g.annotateMode = false;
    return g;
  }

  /** 阈值达+风筝在槽 3 的玩家（C1 同款准备面） */
  function readyKitePlayer(): { w: ReturnType<typeof mkWorld>; p: Player; g: AfkShell & Record<string, unknown> } {
    const w = mkWorld();
    const inv = new Inventory();
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    let n = 0;
    while (p.afkCounterForKiting < 3600 && n < 8000) { tick(); n++; }
    const g = useShell(p);
    p.inv.selected = 0;
    g.updateSmartSelect();                               // AFK 臂：装备风筝槽+置旗
    expect(p.inv.selected).toBe(3);
    expect(g._afkKiteForceUse).toBe(true);
    return { w, p, g };
  }

  const kiteCount = (g: AfkShell & Record<string, unknown>): number =>
    ((g.entities.projectiles as unknown[]).filter((e) => e instanceof KiteProj)).length;

  it('D1 uiBlocking 帧（模态面板等价面,sim 照跑）→ 早退块内救援放飞', () => {
    const { p, g } = readyKitePlayer();
    (g.input as unknown as { uiBlocking: boolean }).uiBlocking = true;
    g.updateUse(1 / 60);                                 // 早退块 → 救援支
    expect(kiteCount(g)).toBe(1);                        // ★判别：照放飞（病面曾=0）
    expect(p.useTime).toBe(15);                          // 出手面=⑩臂同路（combat useTime）
    expect(p.inv.selected).toBe(3);                      // 装备保持
  });

  it('D2 inpOverDomUi 帧（mouseInterface 等价面,悬停面板）→ 救援放飞', () => {
    const { p, g } = readyKitePlayer();
    g.inpOverDomUi = () => true;                         // 光标压在 DOM 面板上
    g.updateUse(1 / 60);
    expect(kiteCount(g)).toBe(1);
    expect(p.useTime).toBe(15);
  });

  it('D6 fullMap.open 帧（Main.mapFullscreen 等价面,:24993 全零站后臂重申）→ 救援放飞', () => {
    const { g } = readyKitePlayer();
    (g.renderer as { fullMap: { open: boolean } }).fullMap.open = true;
    g.updateUse(1 / 60);
    expect(kiteCount(g)).toBe(1);
  });

  it('D3 dead 帧 → 不放飞（原版 :24948-24957 死亡路径 return 先于臂/ItemCheck=同相反证）', () => {
    const { p, g } = readyKitePlayer();
    p.dead = true;
    g.updateUse(1 / 60);
    expect(kiteCount(g)).toBe(0);
  });

  it('D4 defensive kind 门：旗在场但手持非风筝（脏态漂移）→ 零旁漏不放飞', () => {
    const { p, g } = readyKitePlayer();
    p.inv.selected = 1;                                  // 手持改非风筝（槽 1 空火把域）
    p.inv.slots[1] = { id: iidOf(8) /* 火把,combatWeapon=null */, stack: 1 };
    g._afkKiteForceUse = true;                           // 强制旗在场（模拟漂移）
    (g.input as unknown as { uiBlocking: boolean }).uiBlocking = true;
    g.updateUse(1 / 60);
    expect(kiteCount(g)).toBe(0);                        // kind 门拦=非风筝零旁漏
    expect(p.useTime).toBe(0);                           // useSwing/useTime 零副作用
  });

  it('D5 cursorHeld 拍对照：旗不置（臂门 mouseItemHeld+计数清零）→ 早退不放飞=原版同相', () => {
    const w = mkWorld();
    const inv = new Inventory();
    inv.slots[3] = { id: iidOf(KITE_VID), stack: 1 };
    const p = mkPlayer(w, inv);
    const tick = () => p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    let n = 0;
    while (p.afkCounterForKiting < 3600 && n < 8000) { tick(); n++; }
    const g = useShell(p);
    p.inv.cursorMirror = { id: 1, stack: 1 };            // 光标持物（mouseItem 非空）
    g.updateSmartSelect();
    expect(g._afkKiteForceUse).toBe(false);              // 臂不动（:17528-17531 第一臂短路）
    g.inpOverDomUi = () => true;
    g.updateUse(1 / 60);
    expect(kiteCount(g)).toBe(0);
  });
});

// ═══ 附：KiteProj Kill 门 noItems 腿（任务3 判别面——Cursed/钻头坐骑即杀弹） ═══
describe('Q4-C KiteProj Kill 门 noItems 腿（AI_160 :49312）', () => {
  function makeCtx(over: Record<string, unknown> = {}) {
    return {
      channel: () => false,
      letOut: () => false,
      heldShoot: () => 766,
      cced: () => false,
      noItems: () => false,
      pulley: () => false,
      dead: () => false,
      armPos: () => ({ x: 100, y: 100 }),
      playerDir: () => 1,
      faceDir: () => {},
      applyKiteBuff: () => {},
      playerTopY: () => 1000,
      playerCenter: () => ({ x: 100, y: 100 }),
      wind: () => 0,
      cloudAlpha: () => 0,
      inWind: () => true,
      playReelSfx: () => {},
      ...over,
    };
  }

  it('noItems=true（诅咒/钻头坐骑）→ 弹即 Kill（与 CCed 同臂 :49311-49312）', () => {
    const k = new KiteProj(100, 60, 766, makeCtx({ noItems: () => true }) as never);
    k.fixedUpdate(1 / 60, {} as never);
    expect(k.dead).toBe(true);
  });

  it('noItems=false → 弹存活（对照）', () => {
    const k = new KiteProj(100, 60, 766, makeCtx() as never);
    k.fixedUpdate(1 / 60, {} as never);
    expect(k.dead).toBe(false);
  });

  it('数据面锚：ITEM_DEFS[风筝].vid ∈ 背包可持域（selectedKite 扫描域一致性）', () => {
    const def = ITEM_DEFS[iidOf(KITE_VID)];
    expect(def.vid).toBe(KITE_VID);
  });
});
