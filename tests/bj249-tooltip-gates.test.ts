// BJ249 清债刀（红蓝-R4 归队快批）F1+F2 tooltip 面：
//   F1 金币枪门（Main.cs:20861,1458 同式 :20859）：三段门 damage>0 && (!notAmmo||useStyle!=0)
//     && (vid<71||vid>74||背包持金币枪 905)。金币 71-74（SetDefaults 带战斗面
//     damage 25/50/100/200/ranged/shoot 158-161,Item.cs:2219-2282）无 905 时
//     伤害/暴击/速度/击退四行整缺;HasItem(905)=inventory[0..57] 逐槽（P.cs:56551）。
//     旧病灶=仅 damage>0 直贴 → 悬停金币（无 905）贴四行=多行偏差。
//   F2 首用提示行行序（Main.cs:21519-21522）：flag2 && ShowLoadoutShareHint 行在
//     套装行（:21473-21517）后、研究行（:21521）前;旧置行族头部（:20824-20838 链内）
//     与原版行序不符。ctx.loadoutShareHint 经 assembleTooltipLines 插入。
// 变异（每件≥1 发,还原后本文件复绿）：
//   M-F1 摘第三段金币门（vid<71||vid>74 改 true）→ 「金币无 905 四行缺」爆红;
//   M-F2 提示行挪回行族头部（setBonusLines 前插入）→ 行序断言爆红。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildTooltipBody, assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { languageManager } from '../src/i18n/LanguageManager';

languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

function defOfVid(vid: number) {
  const key = ITEM_DEFS.find((d) => d && (d.vid ?? -1) === vid)?.key;   // ★方案 A:d&& 守洞;★BJ283 parseInt 兜底退役(⑥等价定谳)
  return key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
}
const TPS = {
  dmgMult: { melee: 1, ranged: 1, magic: 1, summon: 1 },
  crit: { melee: 0, ranged: 0, magic: 0 }, manaCostMul: 1,
  kbGlove: false, kbBuff: false,
};
const linesOf = (vid: number, ctx: Parameters<typeof assembleTooltipLines>[4]) => {
  const def = defOfVid(vid);
  expect(def, `vid ${vid} 缺 def`).toBeTruthy();
  return assembleTooltipLines(def!, { id: ITEM_BY_KEY[def!.key], stack: 1 }, TPS, null, ctx);
};
const tagOf = (vid: number, ctx: Parameters<typeof assembleTooltipLines>[4]) =>
  linesOf(vid, ctx).map((l) => l.tag);

describe('BJ249 F1 金币枪门（vid 71-74 需背包持 905 才出伤害四行）', () => {
  it('① 悬停金币 71（无 905,缺省 ctx）→ damage/crit/speed/knockback 四行整缺', () => {
    const tags = tagOf(71, {});
    expect(tags).not.toContain('damage');
    expect(tags).not.toContain('crit');
    expect(tags).not.toContain('speed');
    expect(tags).not.toContain('knockback');
  });
  it('② 悬停铂金币 74（hasCoinGun=true）→ 四行在（金币 ranged 面:25/50/100/200）', () => {
    const tags = tagOf(74, { hasCoinGun: true });
    expect(tags.slice(0, 4)).toEqual(['damage', 'crit', 'speed', 'knockback']);
    const dmg = linesOf(74, { hasCoinGun: true }).find((l) => l.tag === 'damage')!;
    expect(dmg.text).toContain('200');   // 铂金币 damage=200 ×乘区 1
  });
  it('③ 悬停金币 71（hasCoinGun=true）→ 四行在;伤害文本含 25', () => {
    const tags = tagOf(71, { hasCoinGun: true });
    expect(tags.slice(0, 4)).toEqual(['damage', 'crit', 'speed', 'knockback']);
    expect(linesOf(71, { hasCoinGun: true }).find((l) => l.tag === 'damage')!.text).toContain('25');
  });
  it('④ 普通武器铜短剑 4 不涉门（无 hasCoinGun → 四行在=门只管 71-74）', () => {
    const tags = tagOf(4, {});
    expect(tags.slice(0, 4)).toEqual(['damage', 'crit', 'speed', 'knockback']);
  });
  it('⑤ buildTooltipBody 直返面：金币 71 缺省 ctx → lines 零伤害族;905 门开 → 四行', () => {
    const def = defOfVid(71)!;
    const off = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, TPS, {});
    expect(off.lines.some((l) => l.tag === 'damage')).toBe(false);
    const on = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, TPS, { hasCoinGun: true });
    expect(on.lines.filter((l) => ['damage', 'crit', 'speed', 'knockback'].includes(l.tag!)).length).toBe(4);
  });
});

describe('BJ249 F2 首用提示行行序（套装行后、研究行前）', () => {
  it('① ctx.loadoutShareHint=true → loadouthint 行紧跟 setbonus 之后、research 之前', () => {
    const tags = tagOf(558, { loadoutShareHint: true, research: { have: 0, need: 1 } });
    const iSb = tags.indexOf('setbonus');
    const iHint = tags.indexOf('loadouthint');
    const iRes = tags.indexOf('research');
    expect(iSb, '神圣头盔 558 有套装行').toBeGreaterThanOrEqual(0);
    expect(iHint, '提示行在').toBeGreaterThanOrEqual(0);
    expect(iRes, '研究行在').toBeGreaterThanOrEqual(0);
    expect(iHint).toBe(iSb + 1);
    expect(iRes).toBe(iHint + 1);
  });
  it('② 缺省（无 loadoutShareHint）→ 无提示行;研究行仍紧跟套装行', () => {
    const tags = tagOf(558, { research: { have: 0, need: 1 } });
    expect(tags).not.toContain('loadouthint');
    expect(tags.indexOf('research')).toBe(tags.indexOf('setbonus') + 1);
  });
  it('③ 提示行色 = OurFavoriteColor α190（rgba(255,231,69,0.75),:21520）', () => {
    const hint = linesOf(558, { loadoutShareHint: true }).find((l) => l.tag === 'loadouthint')!;
    expect(hint.color).toBe('rgba(255,231,69,0.75)');
    expect(hint.text.length).toBeGreaterThan(0);
  });
});
