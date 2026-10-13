// mod 自定义稀有度档色(★刀3-1,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀3 节)。
// tML ModRarity 形:档 id(12+ 段;原版 rare 值域 -13..10、词缀位移可达 11=紫档域,
// Item.Prefix :604-614 clamp 上限)→ 档色。红队 R 复查修正:基址 11→12(11 为原版
// 可达域,mod 档 11 会吃掉「9 级+高词缀」的紫名色)。
// 消费面三处查表回退:①MouseText 主链 mouseTextInnerColor(Renderer.ts,tooltip 名色
// 同源 UI.rarityColor 委托)②拾取飘字 popupRarityColor(Game.ts,Item.cs:633-696)
// ③UI.tooltipRareOf 的 mod 物品 def.rare 直读(旧实现漏读=mod 物品恒白,一并接通)。
// 零注册恒等:modRarityColorOf miss → null → 原链(≥11 紫档)。
import { MOD_RARITY_ID_BASE } from './types';

export interface ModRarityContent {
  key: string;
  /** '#RRGGBB' */
  color: string;
}

/** 档 id → '#RRGGBB'(12+ 段;plan 确定性分配) */
const colorById = new Map<number, string>();
/** 全键 `mod_<modid>_<key>` → 档 id(物品 rare `{$rarity}` 解析面) */
const idByFullKey = new Map<string, number>();

export function registerModRarity(id: number, color: string, fullKey: string): void {
  if (!(id >= MOD_RARITY_ID_BASE && id <= 254)) {
    throw new Error(`[mod-rarity] 档 id 须在 ${MOD_RARITY_ID_BASE}..254: ${id}(${fullKey})`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`[mod-rarity] 色值须 #RRGGBB: ${color}(${fullKey})`);
  }
  if (colorById.has(id)) throw new Error(`[mod-rarity] 档 id 重复注册: ${id}`);
  if (idByFullKey.has(fullKey)) throw new Error(`[mod-rarity] 重复注册: ${fullKey}`);
  colorById.set(id, color);
  idByFullKey.set(fullKey, id);
}

/** 物品 rare `{$rarity: key}` → 档 id(注册期解析;未注册键 fail-fast 由调用方) */
export function modRarityIdOf(fullKey: string): number | undefined {
  return idByFullKey.get(fullKey);
}

/** 档 id → 模块色 rgb255(miss=null → 消费方走原链);MouseText 链亮度乘区消费 */
export function modRarityRgb255(rare: number): [number, number, number] | null {
  const hex = colorById.get(rare);
  if (hex === undefined) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** 档 id → '#RRGGBB'(miss=null;飘字面直用) */
export function modRarityColorOf(rare: number): string | null {
  return colorById.get(rare) ?? null;
}

export function _resetModRarityForTests(): void {
  colorById.clear();
  idByFullKey.clear();
}
