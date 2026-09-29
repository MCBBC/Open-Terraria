// ★清偿刀 X（2026-09-29）装备槽域三门位判别测试（清偿刀 U 新立债 #1/#3/#4）。
// 定谳锚（1457 反编译亲读）：
//   门① 矿车 expertOnly 效益门：Player.cs:22856 `int num4 = 13`（木质缺省）+
//     :22859 `(!miscEquips[2].expertOnly || Main.expertMode)`——GrappleMovement 贴轨
//     上车段=全树唯一矿车型消费面（轨道右键 :33524-33539/QuickMinecartSnap :6140/
//     QuickMinecart :6107 三路全经 LaunchMinecartHook→403→此段）;门不满足=恒 13
//     木质车。1457 全树零 `expertOnly = true` 赋值（Item.cs:129 声明/:48960 ResetStats
//     复位）→ 门为可达谓词,判别力由测试内点亮 def 产生（U 刀面①同法）。本仓手持/
//     背包两级后备=无原版对应面的近似（bestCartMount 既有登记）,按同门收束。
//   门② 互斥组残面（拖放+时装互换）：CanEquipInArmorSlot 链（ItemSlot.cs:1399-1458）
//     配饰支双段扫均含组臂——同段 HasIncompatibleAccessory（:3472-3482,冲突槽=目标槽
//     放行 :3544）+ 对段 HasSameItemInSlot（:3505-3520 组臂跨段同拘）;拖放面
//     PickItemMovementAction case 8-11（:1496-1503）与时装互换面 SwapVanityEquip
//     （:1852）均经此链。U 刀只接右键面,两面本刀收口：accFitsInSegment 改
//     accPairConflicts 全臂单源（顺补 3580 社交段双翼例外,Item.cs:32290 wingSlot=33,
//     旧内联缺臂误拒）+ placeHeld→armorAcceptsDrag 合成组臂（armorAccepts 本体在
//     Inventory.ts=P 刀终态禁碰,组臂调用侧合成;取出反向回查不加组门=取出恒合法）。
//   门③ Game.ts 配饰消费面 expertOnly 门：strongBees :15461/starCloakItem :15700
//     =ApplyEquipFunctional 设旗面（头门 :14475-14478）;dontHurtNature 经
//     GrantArmorBenefits :13208-13210=UpdateEquips k-loop :13018 门内;八音盒录音
//     :15725 亦在 ApplyEquipFunctional 内——accessoryVanillaIds（8 消费点单源）+
//     录音环同门接线。
// 测试法：U 刀 mkUi/mkPlayer 桩（真实现+真 Inventory+sfx 录音）+ withExpertOnly
//   测试内点亮（1457 数据面零真值,门的行为分支只能由测试数据点亮,finally 还原防串测）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { Game, accessoryVanillaIds, starCloakStarInfo } from '../src/core/Game';

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const CYC_A = idOfVid(6168);        // 混沌弹筒（AccessoryIncompatibilityType 组主键）
const CYC_B = idOfVid(6169);        // 混沌弹筒·满载（同组 6168）
const CART_MECH = idOfVid(4745);    // Mechanical Cart（MOUNT_SETS.Cart[38],mount 38）
const BOOTS = idOfVid(54);          // Hermes Boots（accfx 面,组外对照）
const STAR_VEIL = idOfVid(862);     // Star Veil（starCloak 族 725）
const WING_A = idOfVid(492);        // 恶魔之翼 wing:1
const WING_B = idOfVid(493);        // 天使之翼 wing:2（双翼互斥对照）
const DEV_WING = idOfVid(3580);     // 开发者翼 3580（wing:33,社交段双翼例外件）
const WATCH_COPPER = idOfVid(15);   // 铜表（acc:1,组外对照）

/** 测试内点亮 expertOnly（原版数据面零真值;finally 还原防串测——U 刀面①同法） */
function withExpertOnly<T>(id: number, fn: () => T): T {
  const def = ITEM_DEFS[id] as unknown as Record<string, unknown>;
  def.expertOnly = true;
  try {
    return fn();
  } finally {
    delete def.expertOnly;
  }
}

const mkPlayer = (): Player => new Player(60 * 16, 90 * 16, new Inventory());

/** UI 原型桩（U 刀 mkUi 同法）：真实现 + 真 Inventory + sfx 录音 */
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
  return { ui, sfx };
}

/** Game 原型桩：bestCartMount 只消费 player.inv（miscEquips/heldItem/slots）+
 *  cartMountOfItem 纯链（ITEM_DEFS/mountOfItem/isCartMount）,无需世界面 */
function mkGame(): { g: AnyUI; inv: Inventory } {
  const g = Object.create(Game.prototype) as unknown as AnyUI;
  const inv = new Inventory();
  g.player = { inv };
  return { g, inv };
}

// ===================== 门① 矿车 expertOnly 效益门 =====================
describe('清偿刀 X 门① 矿车 expertOnly 效益门（Player.cs:22856/:22859）', () => {
  it('miscEquips[2] 矿车：经典世界专家档件回落木质车（-1 缺省=13）,专家/大师世界照常出车型', () => {
    withExpertOnly(CART_MECH, () => {
      const { g, inv } = mkGame();
      inv.miscEquips[2] = { id: CART_MECH, stack: 1 };
      expect(g.bestCartMount()).toBe(-1);          // :22859 门内 → num4 恒 13（-1=mountMinecartAt 木质缺省）
      inv.gateExpert = true;
      expect(g.bestCartMount()).toBe(38);          // 门开 → miscEquips[2].mountType（vanilla-mounts itemMount 4745→38）
      inv.gateExpert = false;
      inv.gateMaster = true;
      expect(g.bestCartMount()).toBe(38);          // 大师档亦开（或门同 k-loop/ApplyEquipFunctional 族）
    });
  });

  it('无门干扰：miscEquips[2] > 手持 > 背包 三级优先照旧（既有行为回归锁）', () => {
    const { g, inv } = mkGame();
    inv.slots[0] = { id: CART_MECH, stack: 1 };
    inv.miscEquips[2] = { id: CART_MECH, stack: 1 };
    expect(g.bestCartMount()).toBe(38);            // 装备槽优先（同型;门关）
  });

  it('手持/背包后备级同门收束：经典世界专家档件不供矿车型（本仓近似面效益一致）', () => {
    withExpertOnly(CART_MECH, () => {
      const { g, inv } = mkGame();
      inv.slots[0] = { id: CART_MECH, stack: 1 };  // selected 缺省 0 → heldItem()=slots[0]
      expect(g.bestCartMount()).toBe(-1);          // 手持级门内
      inv.slots[0] = null;
      inv.slots[3] = { id: CART_MECH, stack: 1 };
      inv.selected = 5;
      expect(g.bestCartMount()).toBe(-1);          // 背包扫描级门内
      inv.gateExpert = true;
      expect(g.bestCartMount()).toBe(38);          // 门开 → 背包后备供型
    });
  });
});

// ===================== 门② 拖放面互斥组 =====================
describe('清偿刀 X 门② 拖放面互斥组（placeHeld→armorAcceptsDrag,:1496-1503 链）', () => {
  it('组员拖入同段空槽被拒（HasIncompatibleAccessory :3472-3482 组臂,冲突槽≠目标槽）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };
    ui.heldStack = { id: CYC_B, stack: 1 };
    ui.placeHeld(4, 'armor');
    expect(inv.armor[4]).toBeNull();               // 拒（收刀前=自创放行）
    expect(ui.heldStack).toMatchObject({ id: CYC_B });   // 光标件未动
  });

  it('组员拖入冲突槽=顶掉被换件（:3544 slot==collisionSlot 放行,换出件回光标）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };
    ui.heldStack = { id: CYC_B, stack: 1 };
    ui.placeHeld(3, 'armor');
    expect(inv.armor[3]).toMatchObject({ id: CYC_B });
    expect(ui.heldStack).toMatchObject({ id: CYC_A });
    expect(sfx).toContain('unlock');               // R4-39 AfterItemSwap（6168 组员∈换型表）
  });

  it('对段组同拘（HasSameItemInSlot :3505-3520 组臂）：功能段组员在场,社交段空槽拖入被拒', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };
    ui.heldStack = { id: CYC_B, stack: 1 };
    ui.placeHeld(13, 'armor');
    expect(inv.armor[13]).toBeNull();
  });

  it('组外配饰不受牵连（回归锁）：同段组员在场,Boots 拖入照常', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };
    ui.heldStack = { id: BOOTS, stack: 1 };
    ui.placeHeld(4, 'armor');
    expect(inv.armor[4]).toMatchObject({ id: BOOTS });
  });
});

// ===================== 门② 时装互换面互斥组 =====================
describe('清偿刀 X 门② 时装互换面互斥组（swapVanityEquip→accFitsInSegment 全臂单源）', () => {
  it('组员换入功能段被拒（:1852 组臂——冲突槽≠镜像目标槽时双向门拦）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[4] = { id: CYC_A, stack: 1 };        // 冲突槽 4（≠镜像目标 3）
    inv.armor[13] = { id: CYC_B, stack: 1 };
    ui.swapVanityEquip(13);
    expect(inv.armor[13]).toMatchObject({ id: CYC_B });   // 无动作
    expect(inv.armor[4]).toMatchObject({ id: CYC_A });    // 冲突件未动
    expect(inv.armor[3]).toMatchObject({ id: WATCH_COPPER });
  });

  it('冲突槽=镜像目标槽放行（:3544）：组员恰占同位孪生槽照常互换', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };
    inv.armor[13] = { id: CYC_B, stack: 1 };
    ui.swapVanityEquip(13);
    expect(inv.armor[13]).toMatchObject({ id: CYC_A });
    expect(inv.armor[3]).toMatchObject({ id: CYC_B });
  });

  it('3580 社交段双翼例外（:3466-3473,全臂单源顺补）：开发者翼×普通翼社交段可共戴,互换照常', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: WING_A, stack: 1 };
    inv.armor[13] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[14] = { id: DEV_WING, stack: 1 };    // 社交段在场开发者翼
    ui.swapVanityEquip(13);                        // 表→功能段;恶魔之翼→社交段（与 3580 共戴）
    expect(inv.armor[13]).toMatchObject({ id: WING_A });
    expect(inv.armor[3]).toMatchObject({ id: WATCH_COPPER });
    expect(sfx).toContain('pickup');               // SwapVanityEquip 成功支 Sound 7（:1857）
  });

  it('双翼对照（无 3580 例外照拒）：社交段普通翼在场,互换被拦（:3466-3473 双翼臂）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: WING_A, stack: 1 };
    inv.armor[13] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[14] = { id: WING_B, stack: 1 };
    ui.swapVanityEquip(13);
    expect(inv.armor[13]).toMatchObject({ id: WATCH_COPPER });   // 无动作
    expect(inv.armor[3]).toMatchObject({ id: WING_A });
  });
});

// ===================== 门③ Game.ts 配饰消费面 expertOnly 门 =====================
describe('清偿刀 X 门③ Game.ts 配饰消费面 expertOnly 门（:13018/:14475 族）', () => {
  it('accessoryVanillaIds：经典世界专家档配饰不计入,专家/大师世界照常（8 消费点单源）', () => {
    withExpertOnly(BOOTS, () => {
      const p = mkPlayer();
      p.inv.armor[3] = { id: BOOTS, stack: 1 };
      expect(accessoryVanillaIds(p)).toEqual([]);  // 经典：门内=零
      p.inv.gateExpert = true;
      expect(accessoryVanillaIds(p)).toEqual([54]);
      p.inv.gateExpert = false;
      p.inv.gateMaster = true;
      expect(accessoryVanillaIds(p)).toEqual([54]);
    });
  });

  it('消费面端到端：starCloakStarInfo 经门——经典世界专家档星纱零反击,专家世界 725 触发', () => {
    withExpertOnly(STAR_VEIL, () => {
      const p = mkPlayer();
      p.inv.armor[3] = { id: STAR_VEIL, stack: 1 };
      expect(starCloakStarInfo(accessoryVanillaIds(p), false)).toEqual({ active: false, projType: 726 });
      p.inv.gateExpert = true;
      const r = starCloakStarInfo(accessoryVanillaIds(p), false);
      expect(r.active).toBe(true);
      expect(r.projType).toBe(725);
    });
  });

  it('八音盒录音环内接门（结构锁——录音支在 ApplyEquipFunctional :15725 门内面,变异即红）', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/core/Game.ts'), 'utf8');
    const a = src.indexOf('// ---- 八音盒录音');
    const b = src.indexOf('// ---- 玩家输入 ----', a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    const body = src.slice(a, b);
    expect(body).toContain('MUSIC_BOX_EMPTY_VID');
    expect(body).toContain('expertOnly && !(player.inv.gateExpert || player.inv.gateMaster)');
  });
});
