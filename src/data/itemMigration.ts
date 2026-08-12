// 本地自制物品退役迁移层(2026-08:172+12 循环盔甲 = 184 键全量切原版 vi_ 空间)。
// 迁移链零手写:本地 key --ITEM_KEY_TO_ID--> 原版 vid --VANILLA_ITEM_KEY_BY_ID--> vi_ 键
// (VANILLA_ITEM_KEY_BY_ID 归一驼峰键,严禁手拼蛇形键)。
// 数据源:legacyItemIndex.generated.json = 删除前最后一次构建的 index→key 快照
// (v3 存档 armor/dye/trash/misc 段裸内部下标的解码表,items.ts 注册顺序再变必须重跑生成器)。
import { ITEM_KEY_TO_ID } from '../i18n/idNames.generated';
import legacyIndexJson from './legacyItemIndex.generated.json';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, PRIV_ITEM_STABLE, ITEM_INTERNAL_OF_STABLE } from './items';

/** 快照:迁移前构建的 内部下标→key(v3 存档裸下标段解码表) */
export const LEGACY_KEY_OF_INTERNAL_V3: string[] = legacyIndexJson as string[];

/** 本地自制键全量(快照过滤;vi_/place_v_ 除外) */
export const LEGACY_LOCAL_KEYS: string[] = LEGACY_KEY_OF_INTERNAL_V3.filter(
  (k) => !k.startsWith('vi_') && !k.startsWith('place_v_'),
);

/** ITEM_KEY_TO_ID 缺登/错登的补正(原版 id 权威:idNames ITEM_NAME_BY_ID) */
export const RETIRED_EXTRA_VID: Record<string, number> = {
  coin_platinum: 74,        // 铂金币(ITEM_KEY_TO_ID 缺登;items.ts 曾误写 vid:73=金币)
  mana_regen_potion: 293,   // Mana Regeneration Potion
  // 循环生成盔甲(ITEM_KEY_TO_ID 全部未登;vanilla:头 89-92 / 胸 80-83 / 腿 76-79)
  copper_helmet: 89, copper_chainmail: 80, copper_greaves: 76,
  iron_helmet: 90, iron_chainmail: 81, iron_greaves: 77,
  silver_helmet: 91, silver_chainmail: 82, silver_greaves: 78,
  gold_helmet: 92, gold_chainmail: 83, gold_greaves: 79,
  // 错登覆盖:3625=Multicolor Wrench;The Grand Design=3611
  // (build-l10n.mjs 曾按 internal 名 "MulticolorWrench" 折叠,泄漏进 vid 映射)
  grand_design: 3611,
};

/** 纯自创无原版对应——直接删除,不迁移(用户:只留原版 1:1) */
export const DELETED_KEYS = new Set(['wood_pickaxe', 'wood_axe']);

/** 退役键 → 原版 vid(迁移+删除全表;读档 remap 与消费点改写共用) */
export const RETIRED_KEY_TO_VID: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const k of LEGACY_LOCAL_KEYS) {
    if (DELETED_KEYS.has(k)) continue;
    out[k] = RETIRED_EXTRA_VID[k] ?? ITEM_KEY_TO_ID[k];
  }
  return out;
})();

/** 退役键 → vi_ 键(VANILLA_ITEM_KEY_BY_ID 查表,驼峰权威) */
export function viKeyOfRetired(key: string): string | undefined {
  const vid = RETIRED_KEY_TO_VID[key];
  return vid !== undefined ? VANILLA_ITEM_KEY_BY_ID[vid] : undefined;
}

/** 退役键 → vi_ 内部 id(读档 remap 漏斗用) */
export function viIdOfRetired(key: string): number {
  const viKey = viKeyOfRetired(key);
  return viKey !== undefined ? (ITEM_BY_KEY[viKey] ?? 0) : 0;
}

// ---- 读档 remap 单漏斗(退役定义删除后生效;删除前是 no-op) ----
// v3 存档里本地物品存的稳定 id 是 PRIV 段 10000+:定义删除后这些号没有落点,
// 此处把 旧稳定 id → 对应 vi_ 物品的内部 id 灌进 ITEM_INTERNAL_OF_STABLE,
// SaveFile 读档路径一行不改即可还原。幸存键(place_v_*)与删除键跳过。
for (const [key, stable] of Object.entries(PRIV_ITEM_STABLE)) {
  if (ITEM_BY_KEY[key] !== undefined) continue;       // 定义幸存,照旧
  if (DELETED_KEYS.has(key)) continue;                 // 纯自创删除,弃
  const viId = viIdOfRetired(key);
  if (viId > 0 && !ITEM_INTERNAL_OF_STABLE.has(stable)) ITEM_INTERNAL_OF_STABLE.set(stable, viId);
}
