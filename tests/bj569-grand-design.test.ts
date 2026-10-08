// ★BJ569（2026-10-08）宏伟蓝图 3611 使用链判别测试——用户实报「宏伟蓝图无法使用」。
//  定谳锚（Terarria1457 亲读）：
//   · SetDefaults（Item.cs:32515-32528）useStyle5/useTime=useAnimation=10/shoot 651/
//     channel=true/mech=true/UseSound=Item64/无 tileBoost(=0)。
//   · 使用 = 通用 channel-shoot（Player.cs:43901-43903）→ 弹 651 aiStyle 125
//     （Projectile.cs:6992;AI_125 :36349-36474 逐拍跟【裸鼠标】,无射程门）；
//     Kill :73305 → Wiring.MassWireOperation :419（L 形,段序随 direction :3259;
//     Step :3342 逐格 ToolMode,材质耗尽中途止线 :3361;逐格 CanDoWireStuffHere
//     :3353 → Player.cs:47327-47350：墙 350 / 未败石巨人拒 87）。
//   · 3611 不在 ItemCheck_UseWiringTools 字面八件表（Player.cs:47158）——
//     无 IsInTileInteractionRange 射程门 = 全屏操作面。
//   · 起手门（:52701 ToolMode 位门 / :52713 wireOperationsCooldown[联机 ack 面,
//     单机恒 0]）；取消臂（:36358 noItems/CCed/dead;:36362 右键）。
//  旧实现断点（双因,探针实证）：①useWireTool 共用射程门 tileBoostOfVid(3611)=0 →
//    5/3 格盒,正常点击距离静默无效（锚根本不落）;②两击协议不吞 mouseDown 边沿 →
//    按住第 2 拍以锚点=终点自耗执行。
//  判别力（旧码必红）：§1 远距起手落锚（旧射程门必红）;§3 松开执行+精确耗线（旧
//    两击/自耗面必红）;§4 材料耗尽止线;§5 剪线路由;§6 三取消臂;§7 起手门;
//    §8 CanDoWireStuffHere 逐格拒;§9 数据面（wireTool.grand/itemCombat/tileBoost）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Wiring, TOOL_RED, TOOL_CUTTER } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { tileBoostOfVid, WIRE_TOOL_VIDS } from '../src/player/ToolCursorIcon';
import { BuffType } from '../src/stats/Buffs';
import { Game } from '../src/core/Game';

const TILE = 16;
// 原版鼠标格换算（裸鼠标 → tileUnder；Camera.tileUnder = screenToWorld/16）
const mouseAt = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });

/** fakeThis 驾驭（全仓 0 处 new Game()——prototype 方法 .call 窄视图,bj467 同款）。
 *  真 World+真 Player+真 Wiring 承载 store/导线位;input/camera/sfx 桩面。 */
function makeFake() {
  const w = new World(200, 120, 7, 'bj569-grand-design');
  w.groundLevel = 100;
  const inv = new Inventory();
  const player = new Player(60 * TILE, 90 * TILE, inv);
  const id3611 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3611]]!;
  const idWire = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[530]]!;
  inv.slots[0] = { id: id3611, stack: 1 };
  inv.slots[1] = { id: idWire, stack: 50 };
  inv.selected = 0;

  const starts: number[] = [];
  const places: string[] = [];
  const denies: string[] = [];
  const invChanged: number[] = [];
  const fake: Record<string, unknown> = {
    world: w,
    player,
    wiring: new Wiring(w.store),
    wireToolMode: TOOL_RED,                      // 单色路由=耗线数=格数（判读简单）
    grandAnchor: null as [number, number] | null,
    annotateMode: false,
    input: { mouseDown: false, mouseHeld: false, rightDown: false, mouseX: 0, mouseY: 0, uiBlocking: false, blockMouse: false, delayUseItem: false },
    camera: { tileUnder: (sx: number, sy: number): [number, number] => [Math.floor(sx / TILE), Math.floor(sy / TILE)] },
    renderer: { fullMap: { open: false } },
    netCanEditTile: () => true,
    netDeny: (m: string) => { denies.push(m); },
    inpOverDomUi: () => false,
    playUseSound: (vid: number) => { starts.push(vid); },
    sfx: { play: (n: string) => { places.push(n); } },
    cb: { onInventoryChanged: () => { invChanged.push(1); } },
  };
  const tick = () =>
    (Game.prototype as unknown as { tickGrandDesignRoute: (this: unknown) => void })
      .tickGrandDesignRoute.call(fake);
  // .call 窄视图:this.* 内呼面照 bj467 判例挂 prototype 方法
  const proto = Game.prototype as unknown as Record<string, unknown>;
  (fake as Record<string, unknown>).executeGrandDesignRoute = proto.executeGrandDesignRoute;
  (fake as Record<string, unknown>).canDoWireStuffHere = proto.canDoWireStuffHere;
  const canDo = () =>
    (Game.prototype as unknown as { canDoWireStuffHere: (this: unknown) => (x: number, y: number) => boolean })
      .canDoWireStuffHere.call(fake);
  const wire = (tx: number, ty: number) => w.store.wire[w.store.idx(tx, ty)];
  const setMouse = (tx: number, ty: number) => {
    const m = mouseAt(tx, ty);
    (fake.input as { mouseX: number; mouseY: number }).mouseX = m.x;
    (fake.input as { mouseX: number; mouseY: number }).mouseY = m.y;
  };
  return { fake, w, player, inv, tick, canDo, wire, setMouse, starts, places, denies, invChanged, idWire };
}

/** 起手（按下）+引导一拍 + 松开执行 的整段手势 */
function pressDragRelease(f: ReturnType<typeof makeFake>, from: [number, number], to: [number, number]) {
  const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; rightDown: boolean };
  f.setMouse(from[0], from[1]);
  inp.mouseDown = true; inp.mouseHeld = true; inp.rightDown = false;
  f.tick();                                    // 起手臂：落锚+吞边沿
  inp.mouseDown = false;
  f.setMouse(to[0], to[1]);
  f.tick();                                    // 引导期：跟随（无操作）
  inp.mouseHeld = false;
  f.tick();                                    // 释放臂：执行
}

// ================ §0 数据面（3611 判据三面） ================
describe('BJ569-§0：3611 数据面（Item.cs:32515-32528 / ItemCheck_UseWiringTools 字面表）', () => {
  it('def.wireTool.grand=true（WIRE_TOOL_TABLE 面在册）', () => {
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3611]]!];
    expect(def?.wireTool).toEqual({ grand: true });
  });
  it('itemCombat(3611)=useTime 10/shoot 651（SetDefaults :32517-32521）', () => {
    const c = itemCombat(3611);
    expect(c?.useTime).toBe(10);
    expect(c?.useAnimation).toBe(10);
    expect(c?.shoot).toBe(651);
  });
  it('tileBoostOfVid(3611)=0（SetDefaults 无 tileBoost 行=缺省 0）', () => {
    expect(tileBoostOfVid(3611)).toBe(0);
  });
  it('WIRE_TOOL_VIDS 不含 3611（C-F7 定谳:UseWiringTools 字面八件表无蓝图）', () => {
    expect(WIRE_TOOL_VIDS.has(3611)).toBe(false);
    expect(WIRE_TOOL_VIDS.has(3625)).toBe(true);
  });
});

// ================ §1 起手臂：远距落锚（旧射程门必红） ================
describe('BJ569-§1：起手臂——远距落锚+吞边沿+Item64+itemTime（:36389/:52701）', () => {
  it('玩家 80 格外点击照常落锚（旧 5/3 格射程门必红）', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; mouseDownReset?: boolean };
    f.setMouse(140, 40);                        // 玩家 tile(60,90) → 80 格外
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toEqual([140, 40]);
    expect(f.player.useTime).toBe(10);          // ApplyItemTime（useTime=10 :32518）
    expect(inp.mouseDown).toBe(false);          // 边沿已吞（旧不吞=按住第 2 拍自耗）
    expect(f.starts).toContain(3611);           // UseSound=Item64 起手播
  });
  it('useTime>0（上拍动作未清）不落锚（ItemTimeIsZero :43877 flag4 面）', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean };
    f.player.useTime = 5;
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
    expect(f.player.useTime).toBe(5);
  });
  it('纯剪线模式不落锚（ToolMode 位门 :52701 字面）', () => {
    const f = makeFake();
    (f.fake as { wireToolMode: number }).wireToolMode = TOOL_CUTTER;
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean };
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
  });
  it('uiBlocking 不落锚（controlUseItem 门面）', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; uiBlocking: boolean };
    inp.uiBlocking = true;
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
  });
});

// ================ §2/§3 引导期 + 释放臂（松开执行,旧两击面必红） ================
describe('BJ569-§3：释放臂——L 形批量执行+精确耗线（:73305 → MassWireOperation :419）', () => {
  it('引导期跟随不执行；松开帧以裸鼠标格为终点执行（朝向右=先垂直段 :3259）', () => {
    const f = makeFake();
    pressDragRelease(f, [140, 40], [143, 42]);
    // 朝向右（facing=1）:先垂直 (140,40)(140,41),再水平 (140,42)(141,42)(142,42),端点 (143,42)
    // =6 格（vanilla 第二段锚 pt.Y=pe.Y 起点含 (140,42)）
    expect(f.wire(140, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(140, 41) & TOOL_RED).toBeTruthy();
    expect(f.wire(140, 42) & TOOL_RED).toBeTruthy();
    expect(f.wire(141, 42) & TOOL_RED).toBeTruthy();
    expect(f.wire(142, 42) & TOOL_RED).toBeTruthy();
    expect(f.wire(143, 42) & TOOL_RED).toBeTruthy();
    // 段序判别格:先垂直 ⇒ (141,40) 必无线（先水平段则必有线）
    expect(f.wire(141, 40) & TOOL_RED).toBeFalsy();
    expect(f.fake.grandAnchor).toBeNull();       // 路由终结
    expect(f.places).toContain('place');
    expect(f.invChanged.length).toBe(1);
    expect(f.inv.countOf(f.idWire)).toBe(50 - 6);   // 6 格×1 线
  });
  it('朝向左=先水平段（dir=player.direction==1 :3259 段序翻转）', () => {
    const f = makeFake();
    f.player.facing = -1;
    pressDragRelease(f, [140, 40], [143, 42]);
    // 朝向左:先水平 (140,40)(141,40)(142,40),再垂直 (143,40)(143,41),端点 (143,42)
    expect(f.wire(140, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(141, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(142, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(143, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(143, 41) & TOOL_RED).toBeTruthy();
    expect(f.wire(143, 42) & TOOL_RED).toBeTruthy();
    // 段序判别格:先水平 ⇒ (140,41) 必无线（先垂直段则必有线）
    expect(f.wire(140, 41) & TOOL_RED).toBeFalsy();
    expect(f.inv.countOf(f.idWire)).toBe(50 - 6);
  });
  it('材料耗尽中途止线（MassWireOperationStep false 回程 :3361-3363）', () => {
    const f = makeFake();
    f.inv.remove(f.idWire, 48);                  // 剩 2 线
    pressDragRelease(f, [140, 40], [146, 40]);   // 7 格路由
    expect(f.inv.countOf(f.idWire)).toBe(0);
    expect(f.wire(140, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(141, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(142, 40) & TOOL_RED).toBeFalsy();   // 第 3 格起无材料
    expect(f.wire(146, 40) & TOOL_RED).toBeFalsy();
  });
});

// ================ §5 剪线路由（Cutter 臂,不耗材） ================
describe('BJ569-§5：剪线模式路由（MassWireOperationStep Cutter 臂 :3410-3431）', () => {
  it('Cutter|Red 路由拆线,不耗不检线材库存', () => {
    const f = makeFake();
    const st = f.w.store;
    for (let x = 140; x <= 143; x++) st.setWire(x, 40, TileStore.WIRE_RED);
    (f.fake as { wireToolMode: number }).wireToolMode = TOOL_CUTTER | TOOL_RED;
    f.inv.remove(f.idWire, 50);                  // 库存清零也要能剪
    pressDragRelease(f, [140, 40], [143, 40]);
    expect(f.wire(140, 40)).toBe(0);
    expect(f.wire(141, 40)).toBe(0);
    expect(f.wire(142, 40)).toBe(0);
    expect(f.wire(143, 40)).toBe(0);
  });
});

// ================ §6 取消臂三面（:36358-36367） ================
describe('BJ569-§6：取消臂——右键/Cursed/换手（Kill 无操作）', () => {
  it('右键取消:锚清空+吞右键+释放不执行', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean; rightDown: boolean };
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toEqual([140, 40]);
    inp.mouseDown = false;
    inp.rightDown = true;                        // 引导期右键
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
    expect(inp.rightDown).toBe(false);           // 原版吞帧(:36366 mouseInterface/blockMouse)
    inp.rightDown = false;
    inp.mouseHeld = false;
    const before = f.w.store.wire[f.w.store.idx(140, 40)];
    f.tick();                                    // 释放帧:路由已取消,不执行
    expect(f.w.store.wire[f.w.store.idx(140, 40)]).toBe(before);
  });
  it('Cursed(noItems :11326)引导期取消', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean };
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toEqual([140, 40]);
    inp.mouseDown = false;
    f.player.buffs.apply(BuffType.Cursed, 60);
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
    inp.mouseHeld = false;
    f.tick();
    expect(f.inv.countOf(f.idWire)).toBe(50);    // 无执行无消耗
  });
  it('换手取消（路由绑定按住,物品换手即断）', () => {
    const f = makeFake();
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean };
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toEqual([140, 40]);
    inp.mouseDown = false;
    f.inv.selected = 5;                          // 空槽=非蓝图在手
    inp.mouseHeld = false;
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
    expect(f.inv.countOf(f.idWire)).toBe(50);
  });
});

// ================ §8 CanDoWireStuffHere 逐格拒（Player.cs:47327-47350） ================
describe('BJ569-§8：CanDoWireStuffHere——墙 350/未败石巨人拒 87,拒=跳格不中断', () => {
  it('墙 350 格跳过（:47334）,路由其余格照铺', () => {
    const f = makeFake();
    f.w.store.setWall(141, 40, 350);
    pressDragRelease(f, [140, 40], [143, 40]);
    expect(f.wire(140, 40) & TOOL_RED).toBeTruthy();
    expect(f.wire(141, 40)).toBe(0);             // 拒格
    expect(f.wire(142, 40) & TOOL_RED).toBeTruthy();   // 路由未中断
    expect(f.wire(143, 40) & TOOL_RED).toBeTruthy();
    expect(f.inv.countOf(f.idWire)).toBe(50 - 3);
  });
  it('未败石巨人拒蜥蜴砖墙 87（:47338-47348）,败后放行', () => {
    const f = makeFake();
    f.w.store.setWall(141, 40, 87);
    pressDragRelease(f, [140, 40], [143, 40]);
    expect(f.wire(141, 40)).toBe(0);
    // 败石巨人后重取谓词
    f.w.flags['downed_245'] = true;
    const canDo = f.canDo();
    expect(canDo(141, 40)).toBe(true);
  });
});

// ================ §9 起手房规/裸鼠标语义（回归守卫） ================
describe('BJ569-§9：房规拒起手（netCanEditTile 面保留）', () => {
  it('netCanEditTile=false → 拒起手+toast,不落锚', () => {
    const f = makeFake();
    (f.fake as { netCanEditTile: () => boolean }).netCanEditTile = () => false;
    const inp = f.fake.input as { mouseDown: boolean; mouseHeld: boolean };
    f.setMouse(140, 40);
    inp.mouseDown = true; inp.mouseHeld = true;
    f.tick();
    expect(f.fake.grandAnchor).toBeNull();
    expect(f.denies.length).toBe(1);
    expect(inp.mouseDown).toBe(true);            // 未吞边沿（拒绝路径不消费）
  });
});
