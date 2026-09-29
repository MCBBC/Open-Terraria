// ★BJ407（2026-09-29）用户实报定谳刀：重铸槽悬停饰品 tooltip 只显名行（无前缀差分/
// 可装备/材料/静态属性行）,武器（乘子词缀）看似正常——旧 showReforgeTooltip 自装
// 「名行+prefixLines」贫面两层缺。
// 定谳锚（1457 反编译亲读）：
//   · 重铸槽 = ItemSlot.Handle/Draw(ref reforgeItem, 5)（Main.cs:42389-42391,ctx5）
//   · 悬停 = ItemSlot.MouseHover（ItemSlot.cs:3168-3190）Main.HoverItem=item.Clone()
//     +tooltipContext——与物品栏同一组装;ctx5 不在置位 switch（8/9/11/15）=无特化
//   · tooltip = MouseText_DrawItemTooltip 全载荷;前缀差分链门=item.prefix>0
//     （Main.cs:21224）,62-80 配饰硬编码档同块（:21355-21460）——原版无重铸槽降级面
// 病灶层：①GetLinesInfo 全载荷行缺（鲨牙项链静态 ItemTooltip「盔甲穿透力增加5」/
//   可装备/材料）②PREFIX_FIXED_ROWS 62-80 硬编码差分行缺（仅 GetLinesInfo 组装内
//   产出）——Violent(80) tier-only 词缀乘子表全 1 档 → prefixLines 零行=只剩名行。
// 修复：内容装配单源 buildTooltipHtml（showTooltipFor ∪ showReforgeTooltip 同管）。
// 判别测试：重铸槽悬停 innerHTML ≡ 物品栏同物悬停 innerHTML（全等,非子集）。
// l10n 用真 zh-Hans（bj230 同法）逐字断言。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { languageManager } from '../src/i18n/LanguageManager';

languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const NECKLACE = idOfVid(3212);   // 鲨牙项链（acc:1;静态 ItemTooltip=盔甲穿透力增加5;合成材料）
const VIOLENT = 80;               // 暴力（配饰 tier-only 1.2 档;乘子表全 1 → 旧 prefixLines 零行=BJ407 触发词缀）
const WEAPON = idOfVid(75);       // 坠落星（rare=1,可重铸武器面）
const LEGENDARY = 81;             // 传奇（乘子词缀,武器面代表）

function mkUi(): AnyUI {
  const ui = Object.create(UI.prototype) as AnyUI;
  ui.tooltip = { style: {} as CSSStyleDeclaration, innerHTML: '' };
  ui.game = { npcShopOpen: false };            // 无 player → tps=null(中性快照) 两路同相
  ui.slotContent = () => null;
  ui.slotEl = () => null;
  ui.startTooltipPulse = () => {};             // node 无 rAF（qd4 uiStub 同法）
  ui.applyTooltipBg = () => {};                // node 无 DOM
  ui.reforgeItem = null;
  ui.reforgeSlotEl = null;
  ui.vinvReforgeSlotEl = null;
  ui.openChest = null;
  return ui;
}

const linesOf = (html: string): string => {
  const m = html.split('<span style="display:none"></span>')[1];
  expect(m, 'innerHTML 装配结构（名行+隐藏锚+行族）').toBeTruthy();
  return m.replace(/<\/div>$/, '');
};

// ============ ① 反编译重放哨（基线漂移守卫：原版重铸槽=背包同管,无降级面） ============
describe('BJ407 ① 反编译锚重放（1457）', () => {
  const cs = fs.readFileSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria.UI', 'ItemSlot.cs'), 'utf8');
  const mn = fs.readFileSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Main.cs'), 'utf8');

  it('重铸槽 = ItemSlot.Draw(ref reforgeItem, 5)（ctx5,非自创 context）', () => {
    expect(mn).toContain('ItemSlot.Draw(spriteBatch, ref reforgeItem, 5,');
    expect(mn).toContain('ItemSlot.Handle(ref reforgeItem, 5);');
  });

  it('MouseHover 全 context 同一 hoverItem 组装（:3182-3189）;ctx5 无特化臂', () => {
    const s = cs.indexOf('public static void MouseHover(Item[] inv, int context = 0, int slot = 0)');
    const e = cs.indexOf('public static void', s + 10);
    const body = cs.slice(s, e);
    expect(body).toContain('Main.hoverItemName = item.Name;');
    expect(body).toContain('Main.HoverItem = item.Clone();');
    expect(body).toContain('Main.HoverItem.tooltipContext = context;');
    // 置位 switch 只含 8/9/11/15（wornArmor/social/buy）——case 5 不存在=ctx5 零特化
    const sw = body.slice(body.indexOf('switch (context)'), body.indexOf('return;'));
    for (const c of ['case 8:', 'case 9:', 'case 11:', 'case 15:']) expect(sw).toContain(c);
    expect(sw).not.toContain('case 5:');
  });

  it('前缀差分链门 = item.prefix > 0（Main.cs:21224,配饰与武器同面无类目门）', () => {
    const i = mn.indexOf('if (item.prefix > 0)');
    expect(i).toBeGreaterThan(-1);
    // 62-80 配饰硬编码档在同块内（if (item.prefix == 80) 等臂随后）
    expect(mn.indexOf('if (item.prefix == 80)')).toBeGreaterThan(i);
  });
});

// ============ ② 判别核心：重铸槽 ≡ 物品栏（同物同词缀 innerHTML 全等） ============
describe('BJ407 ② 重铸槽/物品栏 tooltip 全等（饰品 + 武器两元）', () => {
  it('鲨牙项链+暴力：重铸槽悬停 = 物品栏悬停（行集全等,旧贫面即红）', () => {
    const rf = mkUi();
    rf.reforgeItem = { id: NECKLACE, stack: 1, prefix: VIOLENT };
    rf.showReforgeTooltip();
    const inv = mkUi();
    inv.slotContent = () => ({ id: NECKLACE, stack: 1, prefix: VIOLENT });
    inv.showTooltipFor(0, 'inv');
    expect(rf.tooltip.innerHTML).toBe(inv.tooltip.innerHTML);
  });

  it('坠落星+传奇（武器面零回归：同管全等 + 名色档位移保持）', () => {
    const rf = mkUi();
    rf.reforgeItem = { id: WEAPON, stack: 1, prefix: LEGENDARY };
    rf.showReforgeTooltip();
    const inv = mkUi();
    inv.slotContent = () => ({ id: WEAPON, stack: 1, prefix: LEGENDARY });
    inv.showTooltipFor(0, 'inv');
    expect(rf.tooltip.innerHTML).toBe(inv.tooltip.innerHTML);
    expect(rf.tooltip.innerHTML).toContain('color:rgb(255,200,150)');   // rare 1+2 档（BJ116-b 面不变）
  });
});

// ============ ③ 行级判别（旧贫面缺的三层,用户实报三行逐字） ============
describe('BJ407 ③ 重铸槽饰品行集（旧面全缺,本刀补齐）', () => {
  const rf = mkUi();
  rf.reforgeItem = { id: NECKLACE, stack: 1, prefix: VIOLENT };
  rf.showReforgeTooltip();
  const html = rf.tooltip.innerHTML as string;
  const lines = linesOf(html);

  it('静态 ItemTooltip 行「盔甲穿透力增加5」（GetLinesInfo 全载荷,旧面整缺）', () => {
    expect(lines).toContain('<br>盔甲穿透力增加5');
  });

  it('可装备行（LegacyTooltip.23,st.acc 门,旧面整缺）', () => {
    expect(lines).toContain('<br>可装备');
  });

  it('前缀差分行「+4%近战速度」（PREFIX_FIXED_ROWS[80]+tip47,62-80 硬编码档）', () => {
    expect(lines).toContain('<br><span style="color:rgb(120,190,120)">+4%近战速度</span>');
  });

  it('名行词缀 ‹暴力›鲨牙项链（CombineFormat.Prefix zh 格式,色=rare 位移后）', () => {
    expect(html).toContain('‹暴力›鲨牙项链');
  });
});

// ============ ④ 结构锁：showReforgeTooltip 内容面禁回退自装（变异即红） ============
describe('BJ407 ④ 结构锁（内容装配单源,回退自装贫面即红）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'UI.ts'), 'utf8');
  const s = src.indexOf('private showReforgeTooltip(): void {');
  const e = src.indexOf('closeReforge(): void {', s);
  const body = src.slice(s, e);

  it('重铸槽内容 = buildTooltipHtml 委托;prefixLines 自装面不复存在', () => {
    expect(s).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(s);
    expect(body).toContain('this.buildTooltipHtml(');
    expect(body).not.toContain('prefixLines(');
  });
});
