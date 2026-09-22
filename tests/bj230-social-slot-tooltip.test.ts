// BJ230 清债刀：时装甲槽悬停缺「无属性/仅外观」双行（BJ224 邻接登记债）——
// ★定谳【推翻债面】：登记债称"原版 context 9/11 social=true → tooltip tip0/tip1
// 双行（无属性/仅外观）"。三版反编译对读（1456/1457/1458）证伪：
//   ①social 置位唯一写点 ItemSlot.MouseHover switch（1457 :3187-3197）——case 8 →
//     wornArmor、case 9/11 → social（时装甲 10-12=context 9 Main.cs:42193；时装配饰
//     13-19=context 11 :42196；染料槽 dye 数组 context 12 :42233 不在 switch 内）。
//   ②item.social 全树唯一读点 Main.cs:20854-20858（1456 同相 :20508-20512）——
//     social && !vanity && !hasVanityEffects → Lang.tip[61]【单行】"Not functional
//     in social slot"（zh「在社交栏中不起作用」）。
//   ③tip[0]"Equipped in social slot"/tip[1]"No stats will be gained"三版零消费
//     （Lang.cs:500 全量装载,无任何 Lang.tip[0]/tip[1] 读点）=死键——本仓旧 dye 臂
//     推 tip0+tip1 双行系伪锚定,同刀摘除（染料槽原版悬停无社交行）。
//   ④hasVanityEffects 置位点全表=Item.cs:7165/7308/11469/21271 四件：月符 485/
//     海神贝壳 497/月光贝壳 861/天使光环 1987（后件兼 van=1,前二门在 485 上隔离验证）。
// 本仓修复：UI.ts 门 dye||miscDye → armor&&i>=10（=context 9∪11 全臂）；行块改
// tip[61] 单行 + !van + !hasVanityEffects 门（itemTooltip.ts SOCIAL_VANITY_EFFECTS_VIDS）。
// l10n 用真 zh-Hans（bj224-setbonus-tooltip.test.ts 同法）——文案逐字断言。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { languageManager } from '../src/i18n/LanguageManager';

languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

function defOfVid(vid: number) {
  const key = ITEM_DEFS.find((d) => d && (d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1)) === vid)?.key;   // ★方案 A:d&& 守洞
  return key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
}

function socialLines(vid: number, socialSlot: boolean) {
  const def = defOfVid(vid);
  expect(def, `vid ${vid} 缺 def（ITEM_DEFS 注册面）`).toBeTruthy();
  const lines = assembleTooltipLines(def!, { id: ITEM_BY_KEY[def!.key], stack: 1 }, null, null, { socialSlot });
  return lines.filter((l) => l.tag === 'social');
}

describe('BJ230 社交槽悬停提示行（1457 语义:tip[61] 单行三门）', () => {
  it('① 功能件（铜短剑 4）在社交槽 → 单行「在社交栏中不起作用」（LegacyTooltip.61）', () => {
    const soc = socialLines(4, true);
    expect(soc).toHaveLength(1);
    expect(soc[0]!.text).toBe('在社交栏中不起作用');
    // 行位（原版:紧随 favorited/共享行族、在伤害行族之前）：先于首个 damage 行
    const def = defOfVid(4)!;
    const all = assembleTooltipLines(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, null, null, { socialSlot: true });
    const socIdx = all.findIndex((l) => l.tag === 'social');
    const dmgIdx = all.findIndex((l) => l.tag === 'damage');
    expect(socIdx).toBeGreaterThanOrEqual(0);
    expect(dmgIdx).toBeGreaterThan(socIdx);
  });

  it('② vanity 件（TopHat 239 / TuxedoShirt 240,van=1）在社交槽 → 零 social 行（!vanity 门）', () => {
    expect(socialLines(239, true)).toHaveLength(0);
    expect(socialLines(240, true)).toHaveLength(0);
  });

  it('③ hasVanityEffects 件（月符 485,acc=1 无 van）在社交槽 → 零 social 行（第三门隔离验证）', () => {
    expect(socialLines(485, true)).toHaveLength(0);
    // 同族:海神贝壳 497 / 月光贝壳 861
    expect(socialLines(497, true)).toHaveLength(0);
    expect(socialLines(861, true)).toHaveLength(0);
  });

  it('④ 非社交槽（socialSlot=false）→ 功能件零 social 行（功能甲槽 context 8=wornArmor 臂）', () => {
    expect(socialLines(4, false)).toHaveLength(0);
  });
});

describe('BJ230 门哨兵（UI.ts socialSlot 门 + 反编译置位面重放）', () => {
  it('⑤ UI.ts 门 = armor&&i>=10（context 9∪11 全臂）,旧 dye/miscDye 臂已摘', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'UI.ts'), 'utf8');
    expect(src).toContain("socialSlot: where === 'armor' && i >= 10,");
    expect(src).not.toContain("socialSlot: where === 'dye' || where === 'miscDye',");
  });

  it('⑥ 反编译重放：ItemSlot.MouseHover switch——case 9/11→social、case 8→wornArmor（基线漂移守卫）', () => {
    const cs = fs.readFileSync(
      path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria.UI', 'ItemSlot.cs'), 'utf8');
    const anchor = cs.indexOf('Main.HoverItem.social = true;');
    expect(anchor).toBeGreaterThan(-1);
    const switchHead = cs.lastIndexOf('switch (context)', anchor);
    const switchBody = cs.slice(switchHead, anchor + 40);
    // case 9 与 case 11 落到同一 social 置位（fall-through 对）;case 8 → wornArmor
    expect(switchBody).toMatch(/case 9:\s*case 11:\s*Main\.HoverItem\.social = true;/s);
    expect(switchBody).toContain('case 8:');
    expect(switchBody).toContain('Main.HoverItem.wornArmor = true;');
    // tip0/tip1 死键复验：全 Main.cs 无 Lang.tip[0]/Lang.tip[1] 读点
    const main = fs.readFileSync(
      path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Main.cs'), 'utf8');
    expect(main).not.toMatch(/Lang\.tip\[0\]/);
    expect(main).not.toMatch(/Lang\.tip\[1\]/);   // 精确键（`[1]` 带闭括号,不误吞 tip[10..19]）
  });
});
