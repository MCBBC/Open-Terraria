// BJ224 实报定谳「穿神圣套后凡可装备物品 tooltip 全贴神圣套套装奖励」——
// 修复后双锁：
//   A. 金标：src/data/vanillaArmorSets.ts ARMOR_SET_TOOLTIP_SETS（tooltip lane）
//      ≡ 反编译 Terraria.DataStructures/ArmorSetBonuses.cs Initialize 全量重放
//      （64 套/170 三元组,注册序 + PartType 主件位逐套逐条对拍）。
//   B. 行为：套装奖励行按 Main.cs:21473-21517（1456:21097-21141/1458:21473-21517
//      三基线同相）语义——行门=悬停 vid ∈ 注册套装（SetsContaining[vid]）,分
//      非佩戴悬停（单件文本 UI.ItemSetBonusGeneral）/佩戴悬停（UI.ItemSetBonus-
//      Equipped N/D 计数 + best-match + LimeGreen）。旧病灶=isArmor&&玩家生效套装
//      全局贴（贝壳发夹 2417 非成员原版无行,却贴了神圣套奖励）。
// l10n 用真 zh-Hans（bestiary-ungated-tooltip.test.ts 同法）——文案逐字断言。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => fs.existsSync(new URL(`../../${d}`, import.meta.url)));

import path from 'node:path';
import { buildTooltipBody, assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { ARMOR_SET_TOOLTIP_SETS, armorSetTooltipContaining } from '../src/data/vanillaArmorSets';
import { languageManager } from '../src/i18n/LanguageManager';

languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

// ---- 反编译 Initialize 重放（tools/recon-armorset-1457.mjs §1a 同法）----
function methodBody(src: string, signature: string): string {
  const i = src.indexOf(signature);
  if (i < 0) throw new Error(`签名未找到: ${signature}`);
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(open + 1, j); }
  }
  throw new Error('方法体未闭合');
}
function splitTopLevel(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function parseSetArg(raw: string): number[] {
  const arr = raw.trim().match(/new\s+int\[\d*\]\s*\{([^}]*)\}/);
  if (arr) return arr[1].split(',').map((x) => parseInt(x.trim(), 10));
  return [parseInt(raw.trim(), 10)];
}
interface GoldenSet { name: string; primary: number; triples: [number, number, number][] }
function replayInitialize(): GoldenSet[] {
  const cs = fs.readFileSync(
    path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria.DataStructures', 'ArmorSetBonuses.cs'), 'utf8');
  const initBody = methodBody(cs, 'public static void Initialize()');
  const found: Array<GoldenSet & { idx: number }> = [];
  const chainRe = /Create\(Benefits\.(\w+),\s*"([^"]+)"(?:,\s*ArmorSetBonus\.PartType\.(\w+))?\)((?:\s*\.Set\(([^)]*)\))*)\s*\.Add\(\)/g;
  for (const m of initBody.matchAll(chainRe)) {
    const triples: [number, number, number][] = [];
    for (const sm of m[4].matchAll(/\.Set\(([^)]*)\)/g)) {
      const parts = splitTopLevel(sm[1]).map(parseSetArg);
      for (const h of parts[0]) for (const b of parts[1]) for (const l of parts[2]) triples.push([h, b, l]);
    }
    const re = new RegExp(`Create\\(Benefits\\.${m[1]}\\b`);
    const at = cs.search(re);
    found.push({ idx: at, name: m[2].replace('ArmorSetBonus.', ''), primary: m[3] ? { None: 0, Head: 1, Body: 2, Legs: 3 }[m[3] as 'None' | 'Head' | 'Body' | 'Legs'] : 0, triples });
  }
  const addRe = /\bAdd\(Benefits\.(\w+),\s*"([^"]+)"(?:,\s*ArmorSetBonus\.PartType\.(\w+))?,\s*(\d+),\s*(\d+),\s*(\d+)\)/g;
  for (const m of initBody.matchAll(addRe)) {
    const re = new RegExp(`Add\\(Benefits\\.${m[1]}\\b`);
    const at = cs.search(re);
    found.push({ idx: at, name: m[2].replace('ArmorSetBonus.', ''), primary: m[3] ? { None: 0, Head: 1, Body: 2, Legs: 3 }[m[3] as 'None' | 'Head' | 'Body' | 'Legs'] : 0, triples: [[+m[4], +m[5], +m[6]]] });
  }
  found.sort((a, b) => a.idx - b.idx);   // 注册序 = Initialize 体内 Create/Add 出现序
  return found.map(({ name, primary, triples }) => ({ name, primary, triples }));
}

// ---- 行为夹具 ----
function defOfVid(vid: number) {
  const key = ITEM_DEFS.find((d) => d && (d.vid ?? -1) === vid)?.key;   // ★方案 A:d&& 守洞(find 对洞以 undefined 调用);★BJ283 parseInt 兜底退役
  return key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
}
const TPS = {
  dmgMult: { melee: 1, ranged: 1, magic: 1, summon: 1 },
  crit: { melee: 0, ranged: 0, magic: 0 }, manaCostMul: 1,
  kbGlove: false, kbBuff: false,
};
const hoverCtx = (worn: boolean, wornH = 0, wornB = 0, wornL = 0) =>
  ({ setBonusHover: { worn, wornH, wornB, wornL } });
function linesOf(vid: number, ctx: ReturnType<typeof hoverCtx>) {
  const def = defOfVid(vid);
  expect(def, `vid ${vid} 缺 def`).toBeTruthy();
  return assembleTooltipLines(def!, { id: ITEM_BY_KEY[def!.key], stack: 1 }, TPS, null, ctx);
}
const sbOf = (vid: number, ctx: ReturnType<typeof hoverCtx>) =>
  linesOf(vid, ctx).filter((l) => l.tag === 'setbonus');

describe.skipIf(EXT_MISSING)('BJ224 金标：tooltip lane ≡ ArmorSetBonuses.cs Initialize 重放', () => {
  it('64 套 / 170 三元组 / 注册序 / 主件位逐套对拍', () => {
    const golden = replayInitialize();
    expect(golden.length).toBe(64);
    expect(ARMOR_SET_TOOLTIP_SETS.length).toBe(golden.length);
    expect(ARMOR_SET_TOOLTIP_SETS.reduce((n, s) => n + s.triples.length, 0)).toBe(170);
    for (let i = 0; i < golden.length; i++) {
      expect(ARMOR_SET_TOOLTIP_SETS[i], `第 ${i} 套 ${golden[i].name} 漂移`).toEqual(golden[i]);
    }
  });
  it('成员锚：神圣三件在表;注册序 HS 先于 Hallowed;发夹 2417 / vid0 / 非甲件非成员', () => {
    expect(armorSetTooltipContaining(558)[0]!.name).toBe('Hallowed');
    const chest = armorSetTooltipContaining(551).map((m) => m.name);
    expect(chest[0]).toBe('HallowedSummoner');      // :463 注册先于 :464（array[0] 语义）
    expect(chest).toContain('Hallowed');
    expect(armorSetTooltipContaining(4873).every((m) => m.name === 'HallowedSummoner')).toBe(true);
    expect(armorSetTooltipContaining(2417)).toEqual([]);   // 贝壳发夹（时装头件）
    expect(armorSetTooltipContaining(0)).toEqual([]);      // SetsContaining[0] 显式清零
    expect(armorSetTooltipContaining(4)).toEqual([]);      // 铜短剑
  });
});

describe.skipIf(EXT_MISSING)('BJ224 行为：套装奖励行（zh-Hans 实文案）', () => {
  it('① 时装件贝壳发夹 2417：无套装奖励行（佩戴/非佩戴悬停皆无=病灶主诉）', () => {
    expect(sbOf(2417, hoverCtx(false))).toHaveLength(0);
    expect(sbOf(2417, hoverCtx(true, 558, 551, 552))).toHaveLength(0);
  });
  it('② 悬停神圣头盔 558（背包）：单件文本「套装奖励：攻击敌人后进入免疫状态」灰', () => {
    const sb = sbOf(558, hoverCtx(false));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励：攻击敌人后进入免疫状态']);
    expect(sb[0]!.color).toBe('rgba(130,130,130,0.75)');
  });
  it('③ 悬停神圣胸甲 551（非佩戴）：注册序首套 HallowedSummoner 主件=头 → 随头部装备改变', () => {
    const sb = sbOf(551, hoverCtx(false));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励：随头部装备改变']);
  });
  it('④ 佩戴悬停胸甲 551 全套神圣（近战头 558）：套装奖励(3/3)+本套文本 亮绿', () => {
    const sb = sbOf(551, hoverCtx(true, 558, 551, 552));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励(3/3)', '攻击敌人后进入免疫状态']);
    expect(sb[0]!.color).toBe('rgb(50,205,50)');   // XNA LimeGreen
  });
  it('⑤ 佩戴仅胸+腿悬停胸甲 551：套装奖励(2/3)灰,主件缺 → 随头部装备改变', () => {
    const sb = sbOf(551, hoverCtx(true, 0, 551, 552));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励(2/3)', '随头部装备改变']);
    expect(sb[0]!.color).toBe('rgb(130,130,130)');
  });
  it('⑥ 穿神圣套悬停叶绿胸甲 1004：叶绿族信息,不再贴神圣套文本（非佩戴/佩戴两态）', () => {
    // 非佩戴：单件态 = 叶绿（注册序 ChlorophyteMelee 先,主件头 → 随头部装备改变）
    const inv = sbOf(1004, hoverCtx(false, 558, 551, 552));
    expect(inv.some((l) => l.text.includes('攻击敌人后进入免疫状态'))).toBe(false);
    expect(inv[0]!.text).toBe('套装奖励：随头部装备改变');
    // 佩戴悬停：叶绿 found=0 → (0/3) 灰 + 随头部装备改变
    const worn = sbOf(1004, hoverCtx(true, 558, 551, 552));
    expect(worn.map((l) => l.text)).toEqual(['套装奖励(0/3)', '随头部装备改变']);
  });
  it('⑦ 神圣召唤套 4873/551/552 悬停兜帽：best-match=召唤套(3/3)而非神圣套(2/3)', () => {
    const sb = sbOf(4873, hoverCtx(true, 4873, 551, 552));
    // HallowedSummoner 文案自带 \n（双行 Description）→ 同色拆 3 行
    expect(sb.map((l) => l.text)).toEqual(['套装奖励(3/3)', '攻击敌人后进入免疫状态，', '仆从数量上限增加2']);
    expect(sb[0]!.color).toBe('rgb(50,205,50)');
  });
  it('⑧ 空 setBonus（零穿戴）悬停成员：原版=成员驱动仍显单件行（定谳：行不依赖生效套装）', () => {
    const sb = sbOf(558, hoverCtx(false, 0, 0, 0));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励：攻击敌人后进入免疫状态']);
  });
  it('⑨ 佩戴悬停头盔 558 本尊（全套在身）：套装奖励(3/3) 绿（UI.ts worn 链）', () => {
    const sb = sbOf(558, hoverCtx(true, 558, 551, 552));
    expect(sb.map((l) => l.text)).toEqual(['套装奖励(3/3)', '攻击敌人后进入免疫状态']);
    expect(sb[0]!.color).toBe('rgb(50,205,50)');
  });
  it('⑩ buildTooltipBody 直返 setBonusLines 数组（非成员=空）', () => {
    const def = defOfVid(2417)!;
    const body = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, TPS, hoverCtx(false));
    expect(body.setBonusLines).toEqual([]);
  });
});
