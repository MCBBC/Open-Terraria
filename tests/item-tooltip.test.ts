// 物品悬停气泡统计行（MouseText_DrawItemTooltip_GetLinesInfo，Main.cs:20488-20920）：
//   vi_ 物品全量行族对照原版。断言用 tag 序列（l10n 未载时文案回退键名，不比中文串）。
import { describe, it, expect } from 'vitest';
import { buildTooltipBody, assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';

const NOPLAYER = null;

function defOfVid(vid: number) {
  const key = ITEM_DEFS.find((d) => (d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1)) === vid)?.key;
  return key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
}

function tags(vid: number, prefix?: number) {
  const def = defOfVid(vid)!;
  expect(def, `vid ${vid} 缺 def`).toBeTruthy();
  const body = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1, prefix }, NOPLAYER);
  const all = [...body.lines];
  if (body.durationLine) all.push(body.durationLine);
  all.push(...body.prefixDiff);
  return { tags: all.map((l) => l.tag!), lines: all };
}

describe('悬停气泡统计行（vi_ 全量）', () => {
  it('近战武器（铜短剑 4）：伤害+近战后缀 / 暴击 / 速度档 / 击退档', () => {
    const r = tags(4);
    expect(r.tags.slice(0, 4)).toEqual(['damage', 'crit', 'speed', 'knockback']);
    expect(r.lines[0].text).toContain('LegacyTooltip.2');   // 近战伤害后缀键
  });

  it('魔法武器（ Aqua Scepter 157）：魔法伤害 + 暴击 + 耗魔', () => {
    const r = tags(157);
    expect(r.tags).toContain('damage');
    expect(r.tags).toContain('mana');
    expect(r.lines.find((l) => l.tag === 'damage')!.text).toContain('LegacyTooltip.4');   // 魔法伤害
  });

  it('召唤武器（史莱姆法杖 2622 附近——取真 summon 件）：召唤伤害、无速度档', () => {
    // 1309 史莱姆法杖
    const r = tags(1309);
    expect(r.tags).toContain('damage');
    expect(r.lines.find((l) => l.tag === 'damage')!.text).toContain('LegacyTooltip.53');  // 召唤伤害
    expect(r.tags).not.toContain('speed');   // 非鞭召唤不显速度档
  });

  it('镐/斧（铜镐 3509 / 铜斧 3506）：镐力 / 斧力×5', () => {
    const pick = tags(3509);
    expect(pick.tags).toContain('pick');
    const axe = tags(3506);
    const axeLine = axe.lines.find((l) => l.tag === 'axe')!;
    expect(axeLine.text).toContain('35');   // 铜斧 axe=7 → 显示 ×5=35%（原版口径）
  });

  it('渔具（钓鱼竿 2289）：渔力 + 需要鱼饵；鱼饵 2674：鱼饵力', () => {
    const rod = tags(2289);
    expect(rod.tags).toContain('fishing');
    expect(rod.tags).toContain('baitreq');
    expect(tags(2674).tags).toContain('bait');
  });

  it('配饰（幸运马蹄铁 158）：可装备；盔甲（帽子 37 s=h）：可装备+防御', () => {
    expect(tags(158).tags).toContain('equippable');
    const r = tags(37);
    expect(r.tags).toContain('equippable');
    expect(r.tags).toContain('defense');
  });

  it('药水：治疗药水 188 恢复生命+消耗品（无 buff 无持续行）；黑曜石皮药水 288 带持续', () => {
    const heal = tags(188);
    expect(heal.tags).toContain('heallife');
    expect(heal.tags).toContain('consumable');
    expect(heal.tags).not.toContain('duration');   // 治疗药无 buff
    const obs = tags(288);
    expect(obs.tags).toContain('duration');
  });

  it('可放置（木材 9）/ 弹药（木箭 40，弹药行不与可放置同行）', () => {
    expect(tags(9).tags).toContain('placeable');
    expect(tags(9).tags).toContain('material');   // 木材=配方原料
    const arrow = tags(40);
    expect(arrow.tags).toContain('ammo');
    expect(arrow.tags).not.toContain('placeable');
  });

  it('箱子（48）：可放置 + 容器行', () => {
    const r = tags(48);
    expect(r.tags).toContain('placeable');
    expect(r.tags).toContain('container');
  });

  it('玩家乘区生效：伤害×2 饰品下伤害行翻倍；暴击含装备加成', () => {
    const def = defOfVid(4)!;
    const id = ITEM_BY_KEY[def.key];
    const base = buildTooltipBody(def, { id, stack: 1 }, null).lines.find((l) => l.tag === 'damage')!;
    const boosted = buildTooltipBody(def, { id, stack: 1 }, {
      dmgMult: { melee: 2, ranged: 1, magic: 1, summon: 1 },
      crit: { melee: 10, ranged: 0, magic: 0 }, manaCostMul: 1,
    }).lines.find((l) => l.tag === 'damage')!;
    const baseCrit = buildTooltipBody(def, { id, stack: 1 }, null).lines.find((l) => l.tag === 'crit')!;
    const boostCrit = buildTooltipBody(def, { id, stack: 1 }, {
      dmgMult: { melee: 2, ranged: 1, magic: 1, summon: 1 },
      crit: { melee: 10, ranged: 0, magic: 0 }, manaCostMul: 1,
    }).lines.find((l) => l.tag === 'crit')!;
    expect(parseInt(boosted.text, 10)).toBe(parseInt(base.text, 10) * 2);
    expect(parseInt(boostCrit.text, 10)).toBe(parseInt(baseCrit.text, 10) + 10);
  });
});

describe('低频行族（2026-08-18 二批）', () => {
  it('鞭（summon+IsAWhip）：显速度档（:20545 例外）', () => {
    const r = tags(4672);   // 皮鞭 Leather Whip（shoot=841 ∈ IsAWhip）
    expect(r.tags).toContain('damage');
    expect(r.lines.find((l) => l.tag === 'damage')!.text).toContain('LegacyTooltip.53');  // 召唤伤害
    expect(r.tags).toContain('speed');   // 鞭例外显速度档
  });

  it('悠悠球（3262 Code 1）：yoyoLogo 装饰位', () => {
    const def = defOfVid(3262)!;
    const body = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, null);
    expect(body.yoyoLogoLine?.yoyoLogo).toBe(true);
  });

  it('活木魔杖 832：消耗行（tip52 + 木材名）；泥土魔杖 114 无消耗行', () => {
    expect(tags(832).tags).toContain('tilewand');
    expect(tags(932).tags).toContain('tilewand');
    expect(tags(114).tags).not.toContain('tilewand');   // Dirt Rod 发射移土弹非消耗（:2725-2737 无 tileWand）
  });

  it('研究行（旅程未满）：CreativeSacrificeNeeded + journeyColor 紫', () => {
    const def = defOfVid(4)!;   // 铜短剑可研究
    const body = buildTooltipBody(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, null, {
      research: { have: 1, need: 25 },
    });
    expect(body.researchLine?.journeyColor).toBe(true);
    expect(body.researchLine?.text).toContain('CreativeSacrificeNeeded');
  });

  it('商店价格行（ctx.shop）：买入价 + 金档色', () => {
    const def = defOfVid(4)!;
    const lines = assembleTooltipLines(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, null, null, {
      shop: { buy: true, priceCopper: 12000 },   // 1金20银
    });
    const shop = lines.find((l) => l.tag === 'shopprice')!;
    expect(shop.text).toContain('LegacyTooltip.50');   // 买入价:
    expect(shop.color).toBe('rgb(224,201,92)');        // 金档色
  });

  it('专家/大师行（ctx 旗）', () => {
    const def = defOfVid(4)!;
    const lines = assembleTooltipLines(def, { id: ITEM_BY_KEY[def.key], stack: 1 }, null, null, {
      expert: true, master: true,
    });
    expect(lines.some((l) => l.tag === 'expert')).toBe(true);
    expect(lines.some((l) => l.tag === 'master')).toBe(true);
  });
});
