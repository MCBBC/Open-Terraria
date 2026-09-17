// ★SW-清债④（2026-09-17）：UI DOM tooltip expert 面两刀 + −13 大师活色（债刀-2/3 登记债清偿）。
// 定谳锚（1457 反编译亲读;1458 :20505-20515/:21214-21223 同位同文对拍零差）：
//   · Main.cs:20511-20515 MouseText_DrawItemTooltip：rare = hoverItem.rare →
//     if (hoverItem.expert) { rare = -12; }——【末位】覆写（变体覆写=SetDefaults 域在前、
//     词缀档位移=Prefix() 域在中、expert 覆写=tooltip 域最后）。Item.cs SetDefaults 全表
//     零处 `rare = -12;`（grep 计 0）：专家件表值 1..10（3090 rare=2+expert=true
//     :28598-28600）,名色全靠 tooltip 时覆写进 −12 disco 档;vanilla-itemrare.json 亦全表
//     无 −12 ⇒ 旧 ctx.expert = rare===-12 门永假 = Expert/Master 行整缺（本刀主债）。
//   · Main.cs:21214-21223 GetLinesInfo：if (item.expert) → "GameUI.Expert" 行;
//     if (item.rare == -13) → "GameUI.Master" 行。Master 行门 = item.rare【字段值】
//     −13（非难度档;字段已含变体/词缀域位移）——非 expert 旗、非 world.masterMode。
//   · GetItemNameColor :20745-20751：−13 = (255,(byte)(masterColor×200f),0) 脉冲 /
//     −12 = (byte)DiscoR/G/B 彩虹。UI.rarityColor 旧 '#FF6400' 定值（=中点 0.5 档）/
//     绿脉冲近似撤除,单源委托 Renderer.mouseTextInnerColor（mt=255 → num3=1 =
//     GetItemNameColor 无 mouseTextColor 乘区原生语义）,钟源=Game.lighting.clock
//     （与 Renderer.drawMouseTextLayer :15431 同源注入）。
// 测试法：UI 原型桩（sw-fx60 Object.create(UI.prototype) 同法）真实现驱动
//   showTooltipFor/showReforgeTooltip/rarityColor + 钟桩注入（discoColor/masterColor
//   结构化假钟）;rAF 逐帧重染面（node 无 rAF）以源码结构锁钉住（变异即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { prefixValueMul } from '../src/data/vanillaPrefixes';
import vanillaRareJson from '../src/data/vanilla-itemrare.json';
import vanillaExpertJson from '../src/data/vanilla-expert.json';

const ITEM_RARE = vanillaRareJson as Record<string, number>;
const ITEM_EXPERT = vanillaExpertJson as Record<string, number>;

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

/** UI 原型桩：真实现 + DOM/钟桩。钟桩 disco=[1,0.5,0]（→ -12 档 rgb(255,127,0)）、
 *  masterColor=1（→ -13 档 rgb(255,200,0)）——两档各得一非平凡采样值可断言 */
function uiStub(opts: { clockless?: boolean } = {}): AnyUI {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  ui.tooltip = { style: {} as CSSStyleDeclaration, innerHTML: '' };
  ui.game = {
    lighting: opts.clockless ? null : { clock: { discoColor: () => [1, 0.5, 0], masterColor: 1 } },
    npcShopOpen: false,
  };
  ui.slotContent = () => null;
  ui.slotEl = () => null;
  ui.startTooltipPulse = () => {};   // node 无 rAF（活色重染面走结构锁）
  ui.applyTooltipBg = () => {};      // node 无 DOM
  return ui;
}

/** 悬停一次并回 tooltip HTML（where='inv' 走普通背包格语义） */
function hover(ui: AnyUI, id: number, extra: Record<string, unknown> = {}): string {
  ui.slotContent = () => ({ id, stack: 1, ...extra });
  ui.showTooltipFor(0, 'inv');
  return ui.tooltip.innerHTML as string;
}

// ============ ① expert→−12 名色覆写 + Expert 行（Main.cs:20511-20515/:21214-21218） ============
describe('清债④ ① DOM tooltip expert 面（3090 史莱姆王之凝 rare=2 旗件）', () => {
  const id3090 = idOfVid(3090);

  it('前置锚：3090 旗∈表、表值 rare=2（非 −12）——覆写是唯一 −12 来源', () => {
    expect(ITEM_EXPERT['3090']).toBe(1);
    expect(ITEM_RARE['3090']).toBe(2);
  });

  it('名色 → −12 disco 档（钟桩 [1,0.5,0] → rgb(255,127,0)）+ data-rare 钉档', () => {
    const html = hover(uiStub(), id3090);
    expect(html).toContain('sw-tooltip-rare');
    expect(html).toContain('data-rare="-12"');
    expect(html).toContain('color:rgb(255,127,0)');
  });

  it('Expert 行出现（旗门=item.expert 本体 :21214——旧 rare===−12 门永假已废）', () => {
    const html = hover(uiStub(), id3090);
    expect(html).toMatch(/专家|Expert/);
    expect(html).not.toMatch(/大师|Master/);
  });

  it('词缀件同相：pv≥1.2 档位移后仍覆写 −12（原版序=词缀域在中、expert 覆写最后）', () => {
    // 找一个 pv≥1.2 的实词缀（数据驱动,不钉具体 id）
    const p = Array.from({ length: 84 }, (_, k) => k + 1).find((q) => prefixValueMul(q) >= 1.2);
    expect(p).toBeTruthy();
    const html = hover(uiStub(), id3090, { prefix: p });
    expect(html).toContain('data-rare="-12"');          // 位移后被覆写回 −12
    expect(html).toContain('color:rgb(255,127,0)');     // 名色仍 disco
    expect(html).toMatch(/专家|Expert/);                // 行仍出（旗不随词缀位移丢）
  });
});

// ============ ② Master 行门 = item.rare 字段 −13（:21219-21223 原文语义） ============
describe('清债④ ② −13 大师档（4796 黑斑坐骑 ITEM_RARE=−13）', () => {
  const id4796 = idOfVid(4796);

  it('前置锚：4796 表值 −13、不在 expert 旗表（两旗正交）', () => {
    expect(ITEM_RARE['4796']).toBe(-13);
    expect(ITEM_EXPERT['4796']).toBeUndefined();
  });

  it('Master 行出现（门=字段值 −13,非难度档）+ 名色活色 (255,200,0)', () => {
    const html = hover(uiStub(), id4796);
    expect(html).toMatch(/大师|Master/);
    expect(html).toContain('data-rare="-13"');
    expect(html).toContain('color:rgb(255,200,0)');     // masterColor=1 钟桩
    expect(html).not.toMatch(/专家|Expert/);            // master 件无 expert 旗 → 无 Expert 行
  });
});

// ============ ③ 阴性：非 expert/非 −13 件零变化 ============
describe('清债④ ③ 阴性对照（75 坠落星 rare=1）', () => {
  const id75 = idOfVid(75);

  it('无 data-rare 钉档、无 Expert/Master 行、名色维持 1 档原表色', () => {
    const html = hover(uiStub(), id75);
    expect(html).not.toContain('sw-tooltip-rare');
    expect(html).not.toMatch(/专家|Expert/);
    expect(html).not.toMatch(/大师|Master/);
    expect(html).toContain('color:#9696ff');            // rare=1 档静态色（原版 150,150,255）
  });
});

// ============ ④ rarityColor −13/−12 活色档（单源换算 + 同源钟） ============
describe('清债④ ④ UI.rarityColor 两档活色（GetItemNameColor :20745-20751）', () => {
  it('−13 = (255,(byte)(masterColor×200),0) 逐采样值对拍（1/0.5/0）', () => {
    const ui = uiStub();
    expect(ui.rarityColor(-13)).toBe('rgb(255,200,0)');   // masterColor=1（Main.cs:1312 初值）
    ui.game.lighting.clock.masterColor = 0.5;
    expect(ui.rarityColor(-13)).toBe('rgb(255,100,0)');   // 中点 = 旧 '#FF6400' 同相（直测不破）
    ui.game.lighting.clock.masterColor = 0;
    expect(ui.rarityColor(-13)).toBe('rgb(255,0,0)');
  });

  it('−12 = (byte)DiscoR/G/B 彩虹（钟桩 6 相采样）;无钟回退白（:20749-20751）', () => {
    const ui = uiStub();
    expect(ui.rarityColor(-12)).toBe('rgb(255,127,0)');   // disco [1,0.5,0]
    ui.game.lighting.clock.discoColor = () => [0, 1, 0.5];
    expect(ui.rarityColor(-12)).toBe('rgb(0,255,127)');
    ui.game.lighting = null;
    expect(ui.rarityColor(-12)).toBe('rgb(255,255,255)'); // mouseTextInnerColor 无钟回退
  });

  it('无钟 −13 回退中点 0.5 = 旧定值档（#FF6400 直测同相,债刀-2 清债①预埋语义）', () => {
    const ui = uiStub({ clockless: true });
    expect(ui.rarityColor(-13)).toBe('rgb(255,100,0)');
  });

  it('其余档维持旧表（−11/−1 灰、1 蓝——漂移档另账登记,不在本刀判据内）', () => {
    const ui = uiStub();
    expect(ui.rarityColor(-11)).toBe('#828282');
    expect(ui.rarityColor(-1)).toBe('#828282');
    expect(ui.rarityColor(1)).toBe('#9696ff');
  });
});

// ============ ⑤ 重铸槽 tooltip 同面覆写（:3315 区,同一 MouseText 消费面） ============
describe('清债④ ⑤ showReforgeTooltip expert 覆写', () => {
  it('重铸槽悬停专家件（3090）→ 名色同进 −12 disco 档', () => {
    const ui = uiStub();
    ui.reforgeItem = { id: idOfVid(3090), stack: 1 };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(255,127,0)');
  });
});

// ============ ⑥ 结构锁：逐帧活色重染面（node 无 rAF,行为面不可达） ============
describe('清债④ ⑥ 结构锁：startTooltipPulse 逐帧重染接线（变异即红）', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');

  it('脉冲 rAF 循环内按 data-rare 档重染（摘块/换函数即红）', () => {
    const s = src.indexOf('private startTooltipPulse(): void {');
    const e = src.indexOf('/** tooltip 九宫底应用', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const body = src.slice(s, e);
    expect(body).toContain("querySelector<HTMLElement>('.sw-tooltip-rare')");
    expect(body).toContain('mouseTextInnerColor');
    expect(body).toContain('lighting?.clock');            // 同源钟（Renderer :15431 同款注入）
  });
});
