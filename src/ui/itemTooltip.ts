// 悬停气泡行构建器（Main.MouseText_DrawItemTooltip_GetLinesInfo，Main.cs:20488-20920 1:1）。
// 纯函数：UI 传入物品格与玩家统计快照，产出 {text, color?, tag?} 行数组；
// tag 供测试断言行类（l10n 未载时文案回退键名）。
// 行序（原版）：名(稀有度色/×N/★) → 伤害[+类型后缀] → 暴击 → 速度档 → 击退档 →
//   渔力/鱼饵 → 可装备 → 时装 → 防御 → 镐/斧/锤力 → 恢复生命/魔力 → 耗魔 →
//   可放置/弹药/消耗品 → 材料 → 容器/线触发 → 物品自带说明 → Buff 持续 →
//   词缀差分行（绿/红）。
import type { ITEM_DEFS } from '../data/items';
import { itemCombat } from '../data/vanillaItemCombat';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { statOfInternal } from '../data/vanillaItemStats';
import { equipKindOfInternal } from '../data/vanillaEquip';
import { prefixStat, prefixLines, type PrefixStat } from '../data/vanillaPrefixes';
import { VANILLA_RECIPES } from '../data/vanillaRecipes';
import { Lang } from '../i18n/Lang';

export interface TooltipLine { text: string; color?: string; tag?: string }
export interface TooltipPlayerStats {
  /** 各系伤害乘区（Player.damageMult） */
  dmgMult: { melee: number; ranged: number; magic: number; summon: number };
  /** 各系装备/buff 暴击（Player.critChance——不含武器自带 4% 与词条） */
  crit: { melee: number; ranged: number; magic: number };
  /** 耗魔乘区（equipStats.manaCostMul） */
  manaCostMul: number;
}
export type TooltipSlot = { id: number; stack: number; prefix?: number; favorited?: boolean };

type ItemDef = (typeof ITEM_DEFS)[number];
const T = (key: string, ...args: (string | number)[]) => Lang.text(key, ...args) || key;

/** 材料集（物品自带 material 旗的近似 = 出现任一配方原料；原版 material 标记的
 *  实际用途就是合成提示，原料反查覆盖面等价） */
let MATERIAL_IIDS: Set<number> | null = null;
function materialIids(): Set<number> {
  if (MATERIAL_IIDS) return MATERIAL_IIDS;
  const s = new Set<number>();
  for (const r of VANILLA_RECIPES) for (const ing of r.items) s.add(ing.id);
  MATERIAL_IIDS = s;
  return s;
}

/** 击退档（:20602-20632） */
const KB_TIERS: Array<[number, number]> = [
  [1.5, 15], [3, 16], [4, 17], [6, 18], [7, 19], [9, 20], [11, 21],
];
function kbTierIndex(kb: number): number {
  if (kb === 0) return 14;
  for (const [max, tip] of KB_TIERS) if (kb <= max) return tip;
  return 22;
}

/** 速度档（:20545-20577，useAnimation 分档 → LegacyTooltip 6-13） */
const SPEED_TIERS: Array<[number, number]> = [
  [8, 6], [20, 7], [25, 8], [30, 9], [35, 10], [45, 11], [55, 12],
];
function speedTierIndex(anim: number): number {
  for (const [max, tip] of SPEED_TIERS) if (anim <= max) return tip;
  return 13;
}

/** 统计行集合（名行/商店行由 UI 侧拼装——各自带稀有度色与价格上下文） */
export interface TooltipBody {
  lines: TooltipLine[];
  durationLine: TooltipLine | null;
  prefixDiff: TooltipLine[];
}

/** 悬停气泡统计行（vi_ 全量 + legacy 兜底） */
export function buildTooltipBody(
  def: ItemDef, slot: TooltipSlot, player: TooltipPlayerStats | null,
): TooltipBody {
  const lines: TooltipLine[] = [];
  const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
  const ps: PrefixStat | null = slot.prefix ? prefixStat(slot.prefix) : null;
  const pm = (k: keyof PrefixStat) => (ps ? (ps[k] as number) : 1);

  // ── legacy（非 vi_）物品：维持原近似（damage/pick/axe/防御/恢复）──
  if (vid < 0) {
    if (def.tool?.damage) {
      lines.push({ text: T('Mods.SandboxWorld.Item.Damage', Math.round(def.tool.damage * pm('dmg'))), tag: 'damage' });
    }
    if (def.tool?.power && def.tool.type !== 'sword') {
      lines.push({ text: T(def.tool.type === 'pick' ? 'Mods.SandboxWorld.Item.PickPower' : 'Mods.SandboxWorld.Item.AxePower', def.tool.power), tag: 'toolpower' });
    }
    const st0 = statOfInternal(slot.id);
    const d0 = def.armor?.defense ?? st0?.def;
    if (d0) lines.push({ text: d0 + T('LegacyTooltip.25'), tag: 'defense' });
    if (def.heal) lines.push({ text: T('CommonItemTooltip.RestoresLife', def.heal), tag: 'heallife' });
    return { lines, durationLine: null, prefixDiff: ps ? prefixLines(slot.prefix!).map((ln) => ({ text: ln.text, color: ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)', tag: 'prefix' })) : [] };
  }

  const f = itemFuncOfVid(vid);
  const c = itemCombat(vid);
  const st = statOfInternal(slot.id);
  const equipKind = equipKindOfInternal(slot.id);

  // ── 伤害族四行（damage>0 门，:20511-20632）──
  if ((c?.damage ?? 0) > 0) {
    const kind = f?.melee ? 'melee' : f?.ranged ? 'ranged' : f?.magic ? 'magic' : f?.summon ? 'summon' : null;
    const mult = player ? player.dmgMult[kind ?? 'melee'] : 1;
    const dmg = Math.round(c!.damage! * pm('dmg') * mult + 5e-6);
    const tipSuffix = kind === 'melee' ? 2 : kind === 'ranged' ? 3 : kind === 'magic' ? 4 : kind === 'summon' ? 53 : 55;
    lines.push({ text: dmg + T(`LegacyTooltip.${tipSuffix}`), tag: 'damage' });
    // 暴击（近/远/魔，:20518-20544）：视觉暴击 = 4 基础 + 装备/buff + 词条
    // （原版 playerClassCrit−选中武器+悬停武器；本仓 equipStats 不含武器 → 同式）
    if (kind === 'melee' || kind === 'ranged' || kind === 'magic') {
      const crit = 4 + (player ? player.crit[kind] : 0) + (ps ? ps.crt * 2 : 0);
      lines.push({ text: crit + T('LegacyTooltip.5'), tag: 'crit' });
    }
    // 速度档（useStyle!=0 且非召唤——鞭例外未辨；useAnimation/词条 spd）
    if ((f?.useStyle ?? 0) !== 0 && !f?.summon) {
      const anim = Math.max(1, Math.round((c!.useAnimation ?? c!.useTime ?? 20) / pm('spd')));
      lines.push({ text: T(`LegacyTooltip.${speedTierIndex(anim)}`), tag: 'speed' });
    }
    // 击退档（kb×词条 kb；召唤 +minionKB 修正略）
    const kb = (c!.knockBack ?? 0) * pm('kb');
    lines.push({ text: T(`LegacyTooltip.${kbTierIndex(kb)}`), tag: 'knockback' });
  }

  // ── 渔具/鱼饵（:20633-20646）──
  if ((f?.fishingPole ?? 0) > 0) {
    lines.push({ text: T('GameUI.PrecentFishingPower', f!.fishingPole!), tag: 'fishing' });
    lines.push({ text: T('GameUI.BaitRequired'), tag: 'baitreq' });
  }
  if ((f?.bait ?? 0) > 0) lines.push({ text: T('GameUI.BaitPower', f!.bait!), tag: 'bait' });

  // ── 可装备（:20647-20660：护甲三槽/配饰/钩爪/坐骑/照明宠/宠物）──
  const isArmor = (st?.hs ?? 0) > 0 || (st?.bs ?? 0) > 0 || (st?.ls ?? 0) > 0;
  if (isArmor || (st?.acc ?? 0) > 0 || equipKind === 'hook' || equipKind === 'mount'
    || equipKind === 'pet' || equipKind === 'light' || equipKind === 'cart') {
    lines.push({ text: T('LegacyTooltip.23'), tag: 'equippable' });
  }
  // 时装物品（itemstats van 字段；缺数据族跳过）
  if ((st?.van ?? 0) > 0) lines.push({ text: T('LegacyTooltip.24'), tag: 'vanity' });

  // ── 防御（:20671-20675）──
  if (st?.def) lines.push({ text: st.def + T('LegacyTooltip.25'), tag: 'defense' });

  // ── 镐/斧/锤力（:20676-20702；斧力 ×5 是原版口径）──
  if ((f?.pick ?? 0) > 0) lines.push({ text: f!.pick! + T('LegacyTooltip.26'), tag: 'pick' });
  if ((f?.axe ?? 0) > 0) lines.push({ text: f!.axe! * 5 + T('LegacyTooltip.27'), tag: 'axe' });
  if ((f?.hammer ?? 0) > 0) lines.push({ text: f!.hammer! + T('LegacyTooltip.28'), tag: 'hammer' });

  // ── 恢复生命/魔力（:20717-20743；3001 龙果区间档）──
  if ((f?.healLife ?? 0) > 0) {
    lines.push({ text: vid === 3001 ? T('CommonItemTooltip.RestoresLifeRange', f!.healLife!, 120)
      : T('CommonItemTooltip.RestoresLife', f!.healLife!), tag: 'heallife' });
  }
  if ((f?.healMana ?? 0) > 0) lines.push({ text: T('CommonItemTooltip.RestoresMana', f!.healMana!), tag: 'healmana' });

  // ── 耗魔（:20744-20751：×玩家 manaCost；太空枪族豁免略）──
  if ((f?.mana ?? 0) > 0) {
    const mc = Math.round(f!.mana! * pm('mcst') * (player ? player.manaCostMul : 1));
    lines.push({ text: T('CommonItemTooltip.UsesMana', mc), tag: 'mana' });
  }

  // ── 可放置/弹药/消耗品（:20752-20781，else-if 链）──
  // item.ammo（=是弹药，值为弹药族 id）提取器落在 combat json（func 缺箭族）
  const placeable = f?.createWall != null || f?.createTile != null;
  if (placeable) {
    if (f?.consumable) lines.push({ text: T('LegacyTooltip.33'), tag: 'placeable' });
  } else if ((c?.ammo ?? 0) > 0 && !f?.notAmmo) {
    lines.push({ text: T('LegacyTooltip.34'), tag: 'ammo' });
  } else if (f?.consumable) {
    lines.push({ text: T('LegacyTooltip.35'), tag: 'consumable' });
  }

  // ── 材料（:20782-20786；material 旗=配方原料反查近似）──
  if (materialIids().has(slot.id)) lines.push({ text: T('LegacyTooltip.36'), tag: 'material' });

  // ── 容器/线触发（:20795-20810）──
  if (f?.createTile === 21 || f?.createTile === 467) lines.push({ text: T('CommonItemTooltip.Container'), tag: 'container' });
  if (f?.createTile === 441 || f?.createTile === 468) lines.push({ text: T('CommonItemTooltip.WireTrigger'), tag: 'wiretrigger' });

  // ── Buff 持续（:20834-20843；原版排在自带说明之后——装配时并入）──
  let durationLine: TooltipLine | null = null;
  if ((f?.buffType ?? 0) > 0 && (f?.buffTime ?? 0) > 0) {
    const secs = f!.buffTime! / 60;
    durationLine = secs < 60
      ? { text: T('CommonItemTooltip.SecondDuration', Math.round(secs)), tag: 'duration' }
      : { text: T('CommonItemTooltip.MinuteDuration', Math.round(secs / 60)), tag: 'duration' };
  }

  // ── 词缀差分行（:20856+，绿/红——复用 prefixLines 表）──
  const prefixDiff: TooltipLine[] = ps
    ? prefixLines(slot.prefix!).map((ln) => ({ text: ln.text, color: ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)', tag: 'prefix' }))
    : [];

  return { lines, durationLine, prefixDiff };
}

/** 完整装配（静态说明 + 持续行按原版序并入 + 差分收尾）——UI 侧消费 */
export function assembleTooltipLines(
  def: ItemDef, slot: TooltipSlot, player: TooltipPlayerStats | null,
  staticTipText: string | null,
): TooltipLine[] {
  const body = buildTooltipBody(def, slot, player);
  const out = [...body.lines];
  if (staticTipText) for (const ln of staticTipText.split('\n')) out.push({ text: ln, tag: 'static' });
  if (body.durationLine) out.push(body.durationLine);
  out.push(...body.prefixDiff);
  return out;
}
