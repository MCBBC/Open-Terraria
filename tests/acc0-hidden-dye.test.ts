// ★清偿刀 R4-acc0-①（2026-09-30）hidden 态 num 名单染料直通判别测试。
// 定谳锚（Terarria1457 唯一标杆,亲读）：
//   · UpdateDyes（Player.cs:9673-9700）逐 20 槽调 UpdateItemDye(i<10, hideVisible-
//     Accessory[num], GetEffectiveArmor(i), GetEffectiveDye(num))。
//   · UpdateItemDye（:9702-9843）：num = armorItem.wingSlot>0 ∨ type∈{934 飞毯,
//     4341 折叠凳,5126 造物之手,4563 Shroud,1987 天使光环}（:9708）;flag =
//     isNotInVanitySlot ∧ isSetToHidden（:9709）;`if (!num && flag) return;`
//     （:9714-9717）⇒ 功能槽∧隐藏时【名单成员仍把配对染料写进 c* 通道】。
//   · 视觉槽另走 UpdateVisibleAccessories 功能轮 !hide 门（:36361）——隐藏只藏
//     贴图,染的是该层【其他】occupant 的贴图 ⇒ 本仓 accDrawApply 的 dyeOnly 模式:
//     视觉槽不写、染料通道照写（back 披风的 front 互斥清写是 :36468 可见轮臂,
//     UpdateItemDye 无此臂,dyeOnly 跳过）。
//   · 翼 face（wingSlot>0）:cWings 走 num 豁免——本仓 wingDyeVid（Player.ts:1758）
//     无 hide 门=已同相（回归锁）。
//   · R4 后双旗族（accessory∧vanity）可进功能段 3-9 ⇒ 1987/4563 使该缝新可达;
//     934/4341/4563/1987 的 cCarpet/cPortableStool/cUnicornHorn/cAngelHalo 专通道
//     本仓未建模（无绘制面=落位 no-op,登记债）;5126 的 back35/handOn23/handOff15
//     为本刀可达判别面（vanilla-acc-drawslots.json '5126' 三槽亲读）。
// 判别法：真 Player+Inventory 直调 equipStats（accessory-unmodeled.test.ts ①同法）;
//   单腿判别（hidden 5126 染料直通）+对照回归锁（hidden 532 染料随隐不回归）。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';

const iid = (vid: number): number => {
  const key = vanillaItemKey(vid);
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const HAND = iid(5126);     // 造物之手（num 名单;back35/handOn23/handOff15）
const VEIL = iid(532);      // 星星斗篷（back=2,非名单对照）
const SHROUD = iid(4563);   // Shroud（num 名单;无建模视觉槽）
const DYE = iid(1002);      // 染料（通道载荷）
const WINGS = iid(785);     // 鸟妖之翼（wingSlot=7,翼 face）

describe('R4-acc0-① hidden num 名单染料直通（UpdateItemDye :9708-9717）', () => {
  it('hidden 5126+染料:染料直通 dyeBack/dyeHandOn/dyeHandOff,视觉槽仍隐（旧:全随隐=红）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: HAND, stack: 1 };
    p.inv.dye[3] = { id: DYE, stack: 1 };
    p.hideVisibleAccessory[3] = true;
    const d = p.equipStats.accDraw;
    expect(d.back).toBe(0);            // 视觉槽被 :36361 !hide 门挡（只染不显）
    expect(d.dyeBack).toBe(1002);      // 旧:-1（整门跳过=染料同落）红
    expect(d.dyeHandOn).toBe(1002);
    expect(d.dyeHandOff).toBe(1002);
    expect(d.handOn).toBe(0);          // 视觉半边不写
  });

  it('可见 5126 对照:视觉+染料双写（dyeOnly 模式不外溢可见轮）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: HAND, stack: 1 };
    p.inv.dye[3] = { id: DYE, stack: 1 };
    const d = p.equipStats.accDraw;
    expect(d.back).toBe(35);
    expect(d.dyeBack).toBe(1002);
    expect(d.handOn).toBe(23);
  });

  it('对照回归锁:hidden 非 532 名单外披风染料随隐（accessory-unmodeled ①既有断言不回归）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: VEIL, stack: 1 };
    p.inv.dye[3] = { id: DYE, stack: 1 };
    p.hideVisibleAccessory[3] = true;
    const d = p.equipStats.accDraw;
    expect(d.back).toBe(0);
    expect(d.dyeBack).toBe(-1);        // !num∧flag 早退（:9714）——名单外照旧随隐
  });

  it('num 名单无建模槽成员（4563）hidden:直通调用 no-op,不污染相邻通道', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: SHROUD, stack: 1 };
    p.inv.armor[4] = { id: VEIL, stack: 1 };
    p.inv.dye[3] = { id: DYE, stack: 1 };
    p.inv.dye[4] = { id: DYE, stack: 1 };
    p.hideVisibleAccessory[3] = true;
    const d = p.equipStats.accDraw;
    expect(d.back).toBe(2);            // 槽 4 可见 532 正常上身
    expect(d.dyeBack).toBe(1002);      // 染料来自可见 532 的配对（4563 无建模槽=零写）
  });

  it('翼 face 回归锁:hidden 翼染料恒通（wingDyeVid 无 hide 门=cWings num 豁免同相）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: WINGS, stack: 1 };
    p.inv.dye[3] = { id: DYE, stack: 1 };
    expect(p.wingDyeVid()).toBe(1002);
    p.hideVisibleAccessory[3] = true;
    expect(p.wingDyeVid()).toBe(1002);   // 隐藏仍染（原版 :9807-9810 cWings 无 flag 门）
  });
});
