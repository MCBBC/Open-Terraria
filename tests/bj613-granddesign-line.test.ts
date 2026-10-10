// ★BJ613（2026-10-10）宏伟蓝图画线形状+消耗数量判别测试——用户实报「放置的电线
//  长度和使用的电线数量对不上,而且我画直线出来是 L 形」。
//  定谳锚（Terarria1457 亲读）:
//   · 路径算法 = Wiring.MassWireOperationInner（Wiring.cs:3248-3337）:两段循环
//     +端点 pe。朝右（dir=master.direction==1 :3259/:436）=先竖段（x=ps.x 固定,
//     y ps.y→pe.y 开区间,`i != num4` 首拍即断=同行拖拽零格）后横段（y=pe.y 固定,
//     x ps.x→pe.x 开区间）+端点;朝左=先横段后竖段。⇒ 精确同行/同列拖拽=纯直线
//     （无 L）;斜拖=L 形=原版本相（预览绘制 Main.cs:32241 同段序 flag34）。
//   · 消耗 = MassWireOperation（:419-453）预算计数 inventory[0..57] 530/849 →
//     MassWireOperationStep（:3342-3431）逐格逐色 `!tile.wire()` 才 wireLeft--（共享
//     池,四色全选=每格 4 线=原版语义;已有线格跳过不耗）→ 收尾 ConsumeItem×实耗
//     =【放置数==消耗数】恒等式。wiresLeftToConsume<=0 → return false → 双环齐断
//     +端点跳过（:3291-3335 flag 支）。
//   · CanDoWireStuffHere 拒（:3353-3356 → Player.cs:47327-47350）= null → 跳格
//     【不】中断路由（HasValue&&!Value 只吃 false）。
//   · 图标计数 = ItemSlot.cs:2665-2674:热栏槽（context 13）持 509/850/851/3612/
//     3625/3611 图标右下恒绘背包 530 总数（num22!=-1 压 stack 支,0 也绘）。
//   · 引导期朝向 = AI_125 :36477-36481 `ChangeDir(Sign(velocity.X))` 逐拍同步
//     （vx=0 不翻;释放帧 Kill 内 MassWireOperation 先于同拍 ChangeDir=吃上拍值）。
//  判别力（旧码必红）:§1 直线拖拽出 L 的路径面（旧预览固定先竖段/终点吃 hover;
//    放置面若被改两段必红）;§2 消耗恒等式+共享池×N+已有线跳过+耗尽止线跳端点;
//    §3 canDo 拒=跳格不中断;§4 预览/放置单源 cell 序+连接掩码帧表;§5 图标计数
//    数据面+热栏门。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  Wiring, grandDesignPath, pathConnectionMasks,
  TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR, TOOL_CUTTER,
} from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, WIRE_ICON_COUNTER_VIDS } from '../src/data/items';
import { wireIconCounterOf } from '../src/ui/UI';
import { Game } from '../src/core/Game';

const TILE = 16;
const mouseAt = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });

function makeFake() {
  const w = new World(200, 120, 7, 'bj613-granddesign-line');
  w.groundLevel = 100;
  const inv = new Inventory();
  const player = new Player(60 * TILE, 90 * TILE, inv);
  const id3611 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3611]]!;
  const idWire = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[530]]!;
  inv.slots[0] = { id: id3611, stack: 1 };
  inv.slots[1] = { id: idWire, stack: 50 };
  inv.selected = 0;
  const fake: Record<string, unknown> = {
    world: w,
    player,
    wiring: new Wiring(w.store),
    wireToolMode: TOOL_RED,
    grandAnchor: null as [number, number] | null,
    annotateMode: false,
    input: { mouseDown: false, mouseHeld: false, rightDown: false, mouseX: 0, mouseY: 0, uiBlocking: false, blockMouse: false, delayUseItem: false },
    camera: { tileUnder: (sx: number, sy: number): [number, number] => [Math.floor(sx / TILE), Math.floor(sy / TILE)] },
    renderer: { fullMap: { open: false } },
    netCanEditTile: () => true,
    netDeny: () => {},
    inpOverDomUi: () => false,
    playUseSound: () => {},
    sfx: { play: () => {} },
    cb: { onInventoryChanged: () => {} },
  };
  const tick = () =>
    (Game.prototype as unknown as { tickGrandDesignRoute: (this: unknown) => void })
      .tickGrandDesignRoute.call(fake);
  const proto = Game.prototype as unknown as Record<string, unknown>;
  (fake as Record<string, unknown>).executeGrandDesignRoute = proto.executeGrandDesignRoute;
  (fake as Record<string, unknown>).canDoWireStuffHere = proto.canDoWireStuffHere;
  const wire = (tx: number, ty: number) => w.store.wire[w.store.idx(tx, ty)];
  const setMouse = (tx: number, ty: number) => {
    const m = mouseAt(tx, ty);
    (fake.input as { mouseX: number; mouseY: number }).mouseX = m.x;
    (fake.input as { mouseX: number; mouseY: number }).mouseY = m.y;
  };
  return { fake, w, player, inv, tick, wire, setMouse, idWire };
}

/** 起手（按下）+引导一拍 + 松开执行 的整段手势（bj569 同款） */
function pressDragRelease(f: ReturnType<typeof makeFake>, from: [number, number], to: [number, number]) {
  const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; rightDown: boolean };
  f.setMouse(from[0], from[1]);
  inp.mouseDown = true; inp.mouseHeld = true; inp.rightDown = false;
  f.tick();
  inp.mouseDown = false;
  f.setMouse(to[0], to[1]);
  f.tick();
  inp.mouseHeld = false;
  f.tick();
}

/** 行/列外扫描:路径格集合外必须零线（L 形判别面） */
function wiredCells(w: { store: TileStore }, x0: number, x1: number, y0: number, y1: number, bit: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (w.store.wire[w.store.idx(x, y)] & bit) out.push([x, y]);
    }
  }
  return out;
}

// ================ §1 直线形状锁（水平/垂直拖拽=纯直线,无 L） ================
describe('BJ613-§1：直线拖拽形状锁（Wiring.cs:3248-3337 同行/同列=一段空转=纯直线）', () => {
  it('水平拖拽 7 格 → 放置格全在同行（旧「先竖段恒开」面/两段必红出 L）', () => {
    const f = makeFake();
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [146, 40]);
    const cells = wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED);
    expect(cells).toEqual([[140, 40], [141, 40], [142, 40], [143, 40], [144, 40], [145, 40], [146, 40]]);
  });
  it('垂直拖拽 7 格 → 放置格全在同列（朝右/朝左同相）', () => {
    for (const facing of [1, -1]) {
      const f = makeFake();
      f.player.facing = facing;
      pressDragRelease(f, [140, 40], [140, 46]);
      const cells = wiredCells(f.w, 137, 143, 38, 48, TileStore.WIRE_RED);
      expect(cells).toEqual([[140, 40], [140, 41], [140, 42], [140, 43], [140, 44], [140, 45], [140, 46]]);
    }
  });
  it('水平反向拖拽（pe 在 ps 左/上）→ 直线无 L（sign=0 段不空转不倒走）', () => {
    const f = makeFake();
    f.player.facing = 1;
    pressDragRelease(f, [146, 40], [140, 40]);
    const cells = wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED);
    expect(cells).toEqual([[140, 40], [141, 40], [142, 40], [143, 40], [144, 40], [145, 40], [146, 40]]);
  });
  it('斜拖=朝向依赖 L 形（原版本相;段序单源函数锁）', () => {
    expect(grandDesignPath([140, 40], [143, 42], true)).toEqual([
      [140, 40], [140, 41], [140, 42], [141, 42], [142, 42], [143, 42],
    ]);
    expect(grandDesignPath([140, 40], [143, 42], false)).toEqual([
      [140, 40], [141, 40], [142, 40], [143, 40], [143, 41], [143, 42],
    ]);
  });
  it('单格（ps==pe）→ 孤点一格', () => {
    expect(grandDesignPath([5, 5], [5, 5], true)).toEqual([[5, 5]]);
    expect(grandDesignPath([5, 5], [5, 5], false)).toEqual([[5, 5]]);
  });
});

// ================ §2 消耗对账锁（放置数==消耗数恒等式,MassWireOperation :419-453） ================
describe('BJ613-§2：消耗对账锁（逐格扣减=实放;共享池;已有线跳过;耗尽止线跳端点）', () => {
  it('单色 7 格直线:实放 7==实耗 7（inv 50→43）', () => {
    const f = makeFake();
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [146, 40]);
    const placed = wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED).length;
    expect(placed).toBe(7);
    expect(f.inv.countOf(f.idWire)).toBe(50 - 7);
  });
  it('四色全选 3 格:每格 4 线共享池（实耗 12=4×3,格格四通道齐）', () => {
    const f = makeFake();
    (f.fake as { wireToolMode: number }).wireToolMode =
      TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW;
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [142, 40]);
    for (let x = 140; x <= 142; x++) {
      const b = f.wire(x, 40);
      expect(b & TileStore.WIRE_RED).toBeTruthy();
      expect(b & TileStore.WIRE_GREEN).toBeTruthy();
      expect(b & TileStore.WIRE_BLUE).toBeTruthy();
      expect(b & TileStore.WIRE_YELLOW).toBeTruthy();
    }
    expect(f.inv.countOf(f.idWire)).toBe(50 - 12);
  });
  it('已有同色线格跳过不耗（tile.wire() 门 :3359）', () => {
    const f = makeFake();
    f.w.store.setWire(142, 40, TileStore.WIRE_RED);   // 路径中格已有红线
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [144, 40]);
    expect(f.inv.countOf(f.idWire)).toBe(50 - 4);     // 5 格路径-1 已有=耗 4
  });
  it('耗尽止线+端点跳过（:3361-3363 false → flag 双环断 + :3335 端点支不吃）', () => {
    const f = makeFake();
    f.inv.remove(f.idWire, 48);                        // 剩 2
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [144, 40]);         // 5 格路径
    expect(f.inv.countOf(f.idWire)).toBe(0);
    expect(wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED)).toEqual([[140, 40], [141, 40]]);
  });
  it('红+致动器 3 格:线 3 致动器 3 分账', () => {
    const f = makeFake();
    (f.fake as { wireToolMode: number }).wireToolMode = TOOL_RED | TOOL_ACTUATOR;
    const idAct = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[849]]!;
    f.inv.slots[2] = { id: idAct, stack: 10 };
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [142, 40]);
    expect(f.inv.countOf(f.idWire)).toBe(50 - 3);
    expect(f.inv.countOf(idAct)).toBe(10 - 3);
    for (let x = 140; x <= 142; x++) {
      expect(f.wire(x, 40) & TileStore.WIRE_ACTUATOR).toBeTruthy();
    }
  });
  it('致动器耗尽止线:线池有余也断,端点不落线（:3361 false→flag+:3335 端点支跳过）', () => {
    const f = makeFake();
    (f.fake as { wireToolMode: number }).wireToolMode = TOOL_RED | TOOL_ACTUATOR;
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [143, 40]);         // 无致动器库存=首格即断
    expect(f.inv.countOf(f.idWire)).toBe(50 - 1);      // 仅首格耗线
    expect(wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED)).toEqual([[140, 40]]);
  });
  it('剪线模式不耗不检（cutter 支 :3410-3431）', () => {
    const f = makeFake();
    (f.fake as { wireToolMode: number }).wireToolMode = TOOL_CUTTER | TOOL_RED;
    f.inv.remove(f.idWire, 50);                        // 库存 0 也要能剪
    for (let x = 140; x <= 142; x++) f.w.store.setWire(x, 40, TileStore.WIRE_RED);
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [142, 40]);
    expect(f.inv.countOf(f.idWire)).toBe(0);
    expect(wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED)).toEqual([]);
  });
});

// ================ §3 CanDoWireStuffHere 拒=跳格不中断（:3353 null 回程同相） ================
describe('BJ613-§3：canDo 拒=跳格继续路由（HasValue&&!Value 只吃 false）', () => {
  it('路径中格拒（墙 350）→ 跳过不耗,后段照放,端点照落', () => {
    const f = makeFake();
    f.w.store.wall[f.w.store.idx(142, 40)] = 350;      // Player.cs:47334 拒墙
    f.player.facing = 1;
    pressDragRelease(f, [140, 40], [144, 40]);
    const cells = wiredCells(f.w, 138, 148, 37, 43, TileStore.WIRE_RED);
    expect(cells).toEqual([[140, 40], [141, 40], [143, 40], [144, 40]]);
    expect(f.inv.countOf(f.idWire)).toBe(50 - 4);
  });
});

// ================ §4 预览/放置单源 + ghost 连接掩码（Main.cs:32157-32405 帧表） ================
describe('BJ613-§4：预览单源 cell 序 + pathConnectionMasks 掩码帧表', () => {
  it('massWireOperation 访问序==grandDesignPath 序（单源判据,canDo 台账）', () => {
    const w = new World(200, 120, 7, 'bj613-order');
    const wiring = new Wiring(w.store);
    const visited: Array<[number, number]> = [];
    wiring.massWireOperation([140, 40], [143, 42], TOOL_RED, 99, 0, true,
      (x, y) => { visited.push([x, y]); return true; });
    expect(visited).toEqual(grandDesignPath([140, 40], [143, 42], true));
    visited.length = 0;
    wiring.massWireOperation([140, 40], [143, 42], TOOL_RED, 99, 0, false,
      (x, y) => { visited.push([x, y]); return true; });
    expect(visited).toEqual(grandDesignPath([140, 40], [143, 42], false));
  });
  it('掩码帧表:横 36|180|144,竖 72|90|18,单格 0（Projectile_651 帧域同码）', () => {
    expect(pathConnectionMasks([[0, 0], [1, 0], [2, 0]])).toEqual([36, 180, 144]);
    expect(pathConnectionMasks([[5, 0], [5, 1], [5, 2]])).toEqual([72, 90, 18]);
    expect(pathConnectionMasks([[7, 7]])).toEqual([0]);
  });
  it('L 形角点掩码:朝右 54（上+右）/朝左 216（左+下）;端帽向段', () => {
    // 朝右 (0,0)→(2,2):竖 (0,0)(0,1) 横 (0,2)(1,2) 端 (2,2)
    expect(pathConnectionMasks(grandDesignPath([0, 0], [2, 2], true)))
      .toEqual([72, 90, 54, 180, 144]);
    // 朝左 (0,0)→(2,2):横 (0,0)(1,0)(2,0) 竖 (2,1) 端 (2,2)
    expect(pathConnectionMasks(grandDesignPath([0, 0], [2, 2], false)))
      .toEqual([36, 180, 216, 90, 18]);
  });
});

// ================ §5 热栏图标电线计数（ItemSlot.cs:2665-2674） ================
describe('BJ613-§5：图标计数数据面+热栏门（context 13 面,num22 压 stack 支）', () => {
  const invStub = (n: number) => ({ countOf: (_id: number) => n });
  it('WIRE_ICON_COUNTER_VIDS=原版字面六件（:2665 行内 || 链）', () => {
    expect([...WIRE_ICON_COUNTER_VIDS].sort((a, b) => a - b)).toEqual([509, 850, 851, 3611, 3612, 3625]);
    expect(WIRE_ICON_COUNTER_VIDS.has(530)).toBe(false);   // 电线本体不画
    expect(WIRE_ICON_COUNTER_VIDS.has(510)).toBe(false);   // 剪线钳不在字面表
    expect(WIRE_ICON_COUNTER_VIDS.has(849)).toBe(false);
    expect(WIRE_ICON_COUNTER_VIDS.has(3620)).toBe(false);  // 致动魔杖不在字面表
  });
  it('热栏槽（0-9）扳手族/蓝图 → 计数=背包 530 总数（0 也计数）', () => {
    const vid3611 = VANILLA_ITEM_KEY_BY_ID[3611]!;
    const id3611 = ITEM_BY_KEY[vid3611]!;
    expect(wireIconCounterOf({ id: id3611 }, 0, invStub(123))).toBe(123);
    expect(wireIconCounterOf({ id: id3611 }, 9, invStub(0))).toBe(0);   // 0 也绘
  });
  it('非热栏（≥10/undefined）=context 0 无计数;非字面族物品无计数', () => {
    const id3611 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3611]]!;
    const idWire = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[530]]!;
    expect(wireIconCounterOf({ id: id3611 }, 10, invStub(123))).toBeNull();
    expect(wireIconCounterOf({ id: id3611 }, undefined, invStub(123))).toBeNull();
    expect(wireIconCounterOf({ id: idWire }, 3, invStub(123))).toBeNull();
  });
});

// ================ §6 引导期朝向同步（AI_125 :36477-36481 → 段序源） ================
describe('BJ613-§6：引导期 ChangeDir(Sign(velocity.X)) 同步（缺=段序挂陈旧朝向）', () => {
  it('channel 帧 vx<0 → facing 翻 -1;vx=0 不翻;释放帧执行吃同步后朝向', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; rightDown: boolean };
    f.player.facing = 1;
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true; inp.rightDown = false;
    f.tick();                                   // 起手落锚
    inp.mouseDown = false;
    f.player.vx = -1.5;                         // 引导期向左移动
    f.setMouse(143, 42);
    f.tick();                                   // channel 帧:朝向同步为 -1
    expect(f.player.facing).toBe(-1);
    f.player.vx = 0;
    f.tick();                                   // vx=0 不翻（Sign=0 无 ChangeDir）
    expect(f.player.facing).toBe(-1);
    inp.mouseHeld = false;
    f.tick();                                   // 释放执行:先竖/先横随 facing=-1
    // 朝左=先横段:判别格 (140,41) 必无线（先竖段则必有线）
    expect(f.wire(140, 41) & TileStore.WIRE_RED).toBeFalsy();
    expect(f.wire(141, 40) & TileStore.WIRE_RED).toBeTruthy();
  });
});
