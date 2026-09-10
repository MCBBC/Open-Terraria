// SW-FX19 域②：builderAccStatus 开关面回归（1457 金标逐锚）。
//  金标：Player.cs:40-63（BuilderAccToggleIDs）/ :797 / :56749（ResetData [0]=1）/
//  Main.cs:48142-48377（图标列序 8,9,0,1,2,3,4,5,6,7 + 二态翻转 + 线材 4 态 ++>=3→0）/
//  :48381-48386（GetBuilderAccsCountToShow）/ :43242-43320（方块替换/群系炬图标）/
//  PL:55553-55555 写 / :56306-56325 读。
//  ★变异证红：注释给出「旧实现退化值」。
import { describe, it, expect } from 'vitest';
import {
  BACC, BUILDER_ACC_COUNT, BUILDER_ACC_ICON_ORDER, builderAccDefaults,
  builderAccGateSet, builderAccTotalIcons, cycleWireVisibility,
  toggleBuilderAccBit, playerAccessoryVidEquipped,
} from '../src/stats/builderAcc';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { VI_ID } from '../src/data/itemKeys';
import { exportPlr, parsePlr, PLR_VERSION_1457 } from '../src/save/PlrImport';
import type { SaveData } from '../src/save/serialize';
import type { Appearance } from '../src/player/Appearance';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

describe('BuilderAccToggleIDs 表与缺省（Player.cs:40-63/:56749）', () => {
  it('① 枚举序与 Count=12', () => {
    expect([BACC.RulerLine, BACC.RulerGrid, BACC.AutoActuate, BACC.AutoPaint,
      BACC.WireVisibility_Red, BACC.WireVisibility_Green, BACC.WireVisibility_Blue,
      BACC.WireVisibility_Yellow, BACC.HideAllWires, BACC.WireVisibility_Actuators,
      BACC.BlockSwap, BACC.TorchBiome]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(BUILDER_ACC_COUNT).toBe(12);
  });
  it('② ResetData 缺省 [0]=1 余 0（标尺线默认关）——Player.builderAccStatus 同形', () => {
    expect(builderAccDefaults()).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const p = new Player(0, 0, new Inventory());
    expect(p.builderAccStatus).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('③ 图标列槽序 = 8,9,0,1,2,3,4,5,6,7（Main.cs:48162-48346 num3 映射）', () => {
    expect(BUILDER_ACC_ICON_ORDER.map((s) => s.accIndex)).toEqual([8, 9, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(BUILDER_ACC_ICON_ORDER.filter((s) => s.wireMode).map((s) => s.accIndex))
      .toEqual([9, 4, 5, 6, 7]);                       // 线材可见度族 = [9]+[4..7]
  });
});

describe('开关位写面（Main.cs:48201 二态翻转 / :48340-48343 四态循环 quirk）', () => {
  it('① 二态翻转 0↔1', () => {
    const st = builderAccDefaults();
    toggleBuilderAccBit(st, BACC.AutoPaint);
    expect(st[BACC.AutoPaint]).toBe(1);                // 旧「恒 0 无 UI」退化值
    toggleBuilderAccBit(st, BACC.AutoPaint);
    expect(st[BACC.AutoPaint]).toBe(0);
  });
  it('② 线材四态循环 quirk：0→1→2→0（Hidden(3) 点击不可达;≥3 跳回 0）', () => {
    const st = builderAccDefaults();
    cycleWireVisibility(st, BACC.WireVisibility_Red);
    expect(st[BACC.WireVisibility_Red]).toBe(1);
    cycleWireVisibility(st, BACC.WireVisibility_Red);
    expect(st[BACC.WireVisibility_Red]).toBe(2);
    cycleWireVisibility(st, BACC.WireVisibility_Red);
    expect(st[BACC.WireVisibility_Red]).toBe(0);       // ★1457 字面 `++ 后 >=3→0`
    st[BACC.WireVisibility_Red] = 3;                   // Hidden 仅旧档/同步可达
    cycleWireVisibility(st, BACC.WireVisibility_Red);
    expect(st[BACC.WireVisibility_Red]).toBe(0);
  });
});

describe('配饰旗位门（Player.cs:12897-12913 RefreshMechanicalAccsFromItemType）', () => {
  it('① 喷漆器族 2216/3061/5126 → autoPaint;3624 → autoActuator', () => {
    const g = builderAccGateSet((v) => [2216, 3061, 5126, 3624].includes(v));
    expect(g.autoPaint).toBe(true);
    expect(g.autoActuator).toBe(true);
    expect(g.rulerLine).toBe(false);
    expect(g.rulerGrid).toBe(false);
    expect(g.infoAccMechShowWires).toBe(false);
  });
  it('② 3611 Architect Gadget Pack 复合三旗（wires+rulerLine+rulerGrid）', () => {
    const g = builderAccGateSet((v) => v === 3611);
    expect(g.infoAccMechShowWires).toBe(true);         // :12899-12901
    expect(g.rulerLine).toBe(true);                    // :12903-12905
    expect(g.rulerGrid).toBe(true);                    // :12907-12909
    expect(g.autoPaint).toBe(false);
  });
  it('③ 装备槽 vid 扫描：armor[3]=3061（已注册）命中;1131 重力地球仪已注册可命中', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: iid(3061), stack: 1 };
    expect(playerAccessoryVidEquipped(p.inv.armor, p.inv.accSlotMax, 3061)).toBe(true);
    expect(playerAccessoryVidEquipped(p.inv.armor, p.inv.accSlotMax, 5126)).toBe(false);
    // 1131 重力地球仪已注册（VI_ID≠0）→ gravControl2 装备门可达（:15184）
    expect(VI_ID(1131)).toBeGreaterThan(0);
    p.inv.armor[4] = { id: VI_ID(1131), stack: 1 };
    expect(playerAccessoryVidEquipped(p.inv.armor, p.inv.accSlotMax, 1131)).toBe(true);
    p.inv.armor[4] = null;
    expect(playerAccessoryVidEquipped(p.inv.armor, p.inv.accSlotMax, 1131)).toBe(false);
  });
  it('④ 时装槽（armor[10..]）不参与旗位（仅装备段 3..accSlotMax）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[13] = { id: iid(3061), stack: 1 };     // 时装段
    expect(playerAccessoryVidEquipped(p.inv.armor, p.inv.accSlotMax, 3061)).toBe(false);
  });
});

describe('GetBuilderAccsCountToShow（Main.cs:48381-48386）', () => {
  it('① 无任何配饰+未解锁群系炬 = 1（方块替换恒画）', () => {
    const g = builderAccGateSet(() => false);
    expect(builderAccTotalIcons(g, false)).toBe(1);
  });
  it('② 机械透镜装备 = 1+6=7;全配饰+群系炬 = 6+4+1+1 = 12（上限含列外两图标）', () => {
    const lens = builderAccGateSet((v) => v === 3619);
    expect(builderAccTotalIcons(lens, false)).toBe(7);
    const all = builderAccGateSet(() => true);
    expect(builderAccTotalIcons(all, true)).toBe(12);
  });
});

describe('.plr 持久化（PL:55553-55555 写 / :56306-56325 读）', () => {
  const mkAppearance = (): Appearance => ({
    name: 'fx19', hair: 0, skinVariant: 0,
    hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
    shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
    pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
    difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
  });
  const mkState = (ba: number[]): SaveData['player'] => ({
    hp: 100, x: 0, y: 0,
    inventory: Array.from({ length: 58 }, () => null),
    selected: 0, baseMaxHp: 100, baseMaxMana: 20, mana: 20,
    banks: [[], [], [], []],
    armor: Array.from({ length: 20 }, () => null),
    dye: Array.from({ length: 10 }, () => null),
    miscEquips: [null, null, null, null, null],
    miscDyes: [null, null, null, null, null],
    buffs: [],
    anglerQuestsFinished: 0,
    builderAccStatus: ba,
  });
  it('① exportPlr → parsePlr 往返 12 位真值（旧导出写 0 面）', () => {
    const ba = [1, 0, 1, 1, 2, 0, 3, 1, 0, 2, 1, 0];
    const bytes = exportPlr(mkAppearance(), mkState(ba));
    const p = parsePlr(bytes);
    expect(p.version).toBe(PLR_VERSION_1457);
    expect(p.playerState.builderAccStatus).toEqual(ba);
  });
  it('② 缺字段回落 ResetData 形（[0]=1 余 0）', () => {
    const bytes = exportPlr(mkAppearance(), mkState(undefined as unknown as number[]));
    const p = parsePlr(bytes);
    expect(p.playerState.builderAccStatus).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
