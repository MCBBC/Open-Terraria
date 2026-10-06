// ★BJ-C4-F1（2026-10-06 R4 UI 批清偿）Smart Select 换选/还原缺 OnSelectionChanged
// 杀手面（blockMouse）判别锁。
//
// 原版定谳链（Terarria1457 亲读）：
//   ① SelectedItemState.Update（Player.cs:483-517）内任一 selected 变化拍——换选
//      （PickItemSelectionOverride :17526 → SmartSelectLookup :17536 → Override-
//      Selection :424-434）∪ 还原（:491-494 selected=overridden）——末位统一走
//      OnSelectionChanged（:529 唯一调用位 `if (selected != num)`）。
//   ② OnSelectionChanged（:519-533）杀手面三件：
//      itemTime=(itemTimeMax=0)；lastItemUseAttemptSuccess=true；
//      if (controlUseItem) { continueAutoReuse ? releaseUseItem=true
//        : (!releaseUseItem → Main.blockMouse=true; controlUseItem=false) }。
//   ③ 可达性：releaseUseItem=!controlUseItem 每拍覆写（:43160）→ 按住中恒 false
//      = 压制门恒开——Shift 智选换工具/松 Shift 还原的瞬间按住鼠标 = blockMouse
//      电平压制余下按住期（TriggersSet.cs:837-847,松键复位,下次点击不受影响）。
//
// 本仓病灶：SmartSelect host.onSelectionChanged（Game.ts,原 14159 行）只挂
//   cb.onInventoryChanged()（热栏 UI 刷新）——杀手面整缺 = Shift 换选/还原拍按住
//   的那一下照常起挥/连发（BJ536 restoreSelectionKill 只补了伪选中 58 还原拍的
//   同族面,SmartSelect 臂漏挂）。
//
// 落刀：selectionChangedKill()（OnSelectionChanged 全量①+③,②本地单人零消费点
//   不移植=登记面）挂入 host.onSelectionChanged（换选/还原两拍同吃）。
// 判别面：Shift 过渡压制（换选拍+还原拍按住中均 armBlockMouse）+松键不误压+
//   itemTime 归零；变异台账见文末。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { SmartSelect } from '../src/player/SmartSelect';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');

const iidOf = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;
const PICK_IID = iidOf(3509);   // 铜镐（BJ536/SW-AZ1 同款热栏件）
const TORCH_IID = iidOf(8);     // 火把（非工具,占 0 号选中位）

/** Game 壳（bj536 同款 Object.create 桩法）+ 真 updateSmartSelect 逐拍驱动器。
 *  布景：石地板行 y=62;0 号火把（选中位）+5 号铜镐;鼠标悬 (60,62) 石格;
 *  Shift 按住 = downAction('SmartSelect') 真;mouseHeld = 左键按住电平。 */
function c4Game(opts: { shift: boolean; mouseHeld: boolean }) {
  const world = new World(120, 120, 30, 'bj-c4-f1');
  const st = world.store;
  for (let x = 40; x < 80; x++) st.setTileSilent(x, 62, TILE_BY_KEY['stone']);
  const inv = new Inventory();
  inv.slots[0] = { id: TORCH_IID, stack: 1 };   // 0 号选中位（非工具）
  inv.slots[5] = { id: PICK_IID, stack: 1 };    // 智选池内铜镐
  const player = new Player(60 * 16, 59 * 16, inv);
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    updateSmartSelect(): void;
    selectionChangedKill(): void;
    input: Record<string, unknown>;
    player: Player;
    world: World;
  };
  g.world = world;
  g.player = player;
  g.input = {
    mouseDown: opts.mouseHeld, mouseHeld: opts.mouseHeld,
    mouseX: 700, mouseY: 300, rightDown: false,
    uiBlocking: false, blockMouse: false, delayUseItem: false,
    downAction: (a: string) => a === 'SmartSelect' && opts.shift,
  };
  g.camera = {
    x: 1000, y: 1000, zoom: 1,
    screenToWorld: () => [60 * 16 + 8, 62 * 16 + 8],   // 鼠标 → 石格世界 px
  };
  g.renderer = {
    canvas: { width: 800, height: 600 }, fullMap: { open: false },
    timeUiHover: false, weatherUiHover: false, minimapUiHover: false,
  };
  g.annotateMode = false;
  g._dirtRodChannel = false;
  g._smartSelectSlots = Array.from({ length: 58 }, () => ({
    vid: 0, stack: 0, pick: 0, axe: 0, hammer: 0, ammo: 0, useAmmo: 0, tileBoost: 0,
  }));
  g.smartSelect = new SmartSelect();
  g.smartSelectHotbar = 0;
  g.spectatingSlot = -1;
  g._afkKiteForceUse = false;
  g.inpOverDomUi = () => false;                  // 鼠标在世界（非 DOM UI）
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [], add: () => {} };
  return { g, player, inv, st };
}

describe('BJ-C4-F1 Smart Select 杀手面（OnSelectionChanged blockMouse）', () => {
  it('①Shift 过渡压制:换选拍按住中 → blockMouse 置位+选中切到镐（:529 换选臂）', () => {
    const { g, player } = c4Game({ shift: true, mouseHeld: true });
    (g.updateSmartSelect as () => void)();
    expect(player.inv.selected, 'Shift 智选切到池内铜镐（OverrideSelection :433）').toBe(5);
    expect((g.input as { blockMouse: boolean }).blockMouse,
      '换选拍按住中 = OnSelectionChanged 杀手面 blockMouse=true（Player.cs:531）').toBe(true);
  });

  it('②还原拍同吃:松 Shift 还原原槽拍按住中 → 杀手面再武装+selected 回 0（:491-494 臂）', () => {
    const { g, player } = c4Game({ shift: true, mouseHeld: true });
    (g.updateSmartSelect as () => void)();            // 换选 0→5
    expect((g.input as { blockMouse: boolean }).blockMouse).toBe(true);
    // 松 Shift（键位电平消失）,鼠标仍按住 → 还原拍
    (g.input as { downAction: (a: string) => boolean }).downAction =
      () => false;
    (g.updateSmartSelect as () => void)();
    expect(player.inv.selected, 'overridden 还原（:491-494 selected=overridden）').toBe(0);
    expect((g.input as { blockMouse: boolean }).blockMouse,
      '还原拍按住中照压（:529 if (selected != num) 对还原拍同真）').toBe(true);
  });

  it('③松键不误压+稳态零触发:mouseHeld=false 时换选不置位;selected 不变拍不触发（:529 门）', () => {
    const { g, player } = c4Game({ shift: true, mouseHeld: false });
    (g.updateSmartSelect as () => void)();
    expect(player.inv.selected).toBe(5);
    expect((g.input as { blockMouse: boolean }).blockMouse,
      '未按住 = controlUseItem false = 无压制臂（:526 if (player.controlUseItem)）').toBe(false);
    // 稳态:同 Shift 按住同目标,selected 振荡还原+重选净零变化 → 不触发（:529 门）
    const held2 = c4Game({ shift: true, mouseHeld: true });
    (held2.g.updateSmartSelect as () => void)();      // 0→5,触发一次
    (held2.g.input as { blockMouse: boolean }).blockMouse = false;   // 清哨兵
    (held2.g.updateSmartSelect as () => void)();      // 5 还原 0 再重选 5 = 净零变化
    expect(held2.player.inv.selected).toBe(5);
    expect((held2.g.input as { blockMouse: boolean }).blockMouse,
      'selected 净零变化拍不触发（Player.cs:529 if (selected != num) 门）').toBe(false);
  });

  it('④itemTime 归零臂:killer face 写 useTime=0（itemTime=(itemTimeMax=0) 单计时器塌缩）', () => {
    const { g, player } = c4Game({ shift: false, mouseHeld: true });
    player.useTime = 7;                                // 门内不可达态直写,验写点在
    (g.selectionChangedKill as () => void)();
    expect(player.useTime, 'OnSelectionChanged :520 itemTime=(itemTimeMax=0)').toBe(0);
  });

  it('⑤结构面:host 接线=UI 刷新+杀手面串联;killer 面锚在（漂移即红）', () => {
    expect(gameSrc).toContain(
      'onSelectionChanged: () => { this.cb.onInventoryChanged(); this.selectionChangedKill(); }');
    expect(gameSrc).toContain('private selectionChangedKill(): void {');
    const iFn = gameSrc.indexOf('private selectionChangedKill(): void {');
    const body = gameSrc.slice(iFn, iFn + 1400);
    expect(body).toContain('this.player.useTime = 0');
    expect(body).toContain('armBlockMouse(inp)');
  });
});

// 变异证红（本轮实录,逐字节还原+sha256 对拍）:
//   M1 摘杀手面接线(host 回 cb.onInventoryChanged() 单调)→ ①②⑤ 红,③④绿;
//   M2 selectionChangedKill 摘 armBlockMouse 行 → ①②③②臂红,④绿;
//   M3 摘 useTime=0 行 → ④红。
