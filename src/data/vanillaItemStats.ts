// 盔甲/配饰基础属性运行时（tools/extract-equip-prefix.mjs → vanilla-itemstats.json）。
// vi_ 批次物品注册期无 armor/accessory 字段——槽位归属与防御值以本表为权威：
//   s: 'h'|'b'|'l' 盔甲部位（headSlot/bodySlot/legSlot 赋值即归属，Item.cs SetDefaults）
//   def: 防御值（defense = N 字面量）
//   acc: 1 功能配饰 / 0 社交配饰——★R4 双旗定谳归一（2026-10-02 Z4 注释批,审计 D6）：
//     acc 有定义（0 或 1）⟺ Item.accessory=true（35 件 acc:0 逐例核实=accessory+
//     vanity 双旗,非「非配饰」）；0 档非「无功能效果」——原版功能/社交段共用
//     accessory 单门、无 vanity 排除臂,双旗进功能段照给 benefits。消费面:
//     槽位归属门读 acc!==undefined（Inventory.isAccessory :134）,功能独占门读
//     acc===1（:152）,社交槽路由读 van===1（SwapEquip ArmorSwap :3289 面）
import statsJson from './vanilla-itemstats.json';
import { ITEM_DEFS } from './items';
import { activeVariantStatsOfVid } from './vanillaItemVariants';

export interface VanillaItemStat {
  s?: 'h' | 'b' | 'l';
  def?: number;
  acc?: 0 | 1;
  van?: 1;         // Item.vanity=true（tools/patch-vanity-stats.mjs 从 Item.cs 提取 390 件;
                   // SwapEquip 社交槽路由依据 ArmorSwap :3289）
  life?: number;   // 生命回复（Item.lifeRegen，再生手环族）
  wing?: number;   // 翅膀槽（Item.wingSlot>0 即翅膀；飞行属性查 vanilla-wingstats）
  hs?: number; bs?: number; ls?: number; // 盔甲绘制槽序号（套装匹配键，Player.cs UpdateArmorSets）

  str?: number;    // 悠悠球线（Item.stringColor>0 → yoyoString，Player.cs:14170）

  // ★B6 六十六刀:mod 配饰 UpdateEquip 加法面(引擎 PlayerEquipStats 同名域;
  //  dmgX=加法 +0.05 形(:2386 实锤);读侧=聚合器配饰环,余段登记)
  dmgMelee?: number; dmgRanged?: number; dmgMagic?: number; dmgAll?: number;
  critMelee?: number; critRanged?: number; critMagic?: number;
  moveMult?: number; endurance?: number;
}

const STATS = statsJson as Record<string, VanillaItemStat>;

// 提取器缺口手补（生成数据勿手改 JSON，代码层并表——vanillaAccFx BEHAVIOR_FX 同法）：
// 3309-3314 彩色配重球（黑/蓝/绿/紫/红/黄）在 Item.cs SetDefaults 的 switch return
// 之后独立 if 块（:30233-30240）——与 2214-17 同类漏提段：width/height 24、rare 2、
// buyPrice 5 银、accessory = true（无 stringColor——非线饰品，Player 侧走
// UpdateEquips :14219-14222 counterWeight 直置 + ApplyEquipVanity :13800-13803 虚荣档）
for (let _v = 3309; _v <= 3314; _v++) STATS[String(_v)] ??= { acc: 1 };

// 1457 新配饰族 acc 槽位手补（提取器源=1456 无 6147-6195;1457 ItemID.cs:13858-13936 +
// Item.cs SetDefaults DefaultToAccessory——accessory=true。armorAccepts 功能配饰槽门
// `st.acc===1` 依赖本标记,缺失 = 全族无法穿进配饰槽）。非配饰成员不入表：
// 6147 巨型提基像/6148-6152 Palworld 宠物坐骑/6153-6155 武器/6161·6164 召唤杖/
// 6163 暮光之握=配饰!/6171 宝石法杖/6173 ArcSurge 武器/6174 Digtoise 坐骑/
// 6190·6195 跑酷书/6191·6192 亲缘桃子（使用型）
const ACC_STATS_1457: Array<[number, VanillaItemStat]> = [
  [6156, { acc: 1 }], [6157, { acc: 1 }], [6158, { acc: 1 }], [6159, { acc: 1 }],
  [6160, { acc: 1 }], [6163, { acc: 1 }], [6165, { acc: 1 }], [6166, { acc: 1 }],
  [6167, { acc: 1 }], [6168, { acc: 1 }], [6169, { acc: 1 }], [6170, { acc: 1 }],
  [6172, { acc: 1 }], [6175, { acc: 1 }], [6176, { acc: 1 }], [6177, { acc: 1 }],
  [6178, { acc: 1 }], [6179, { acc: 1 }], [6180, { acc: 1 }], [6181, { acc: 1 }],
  [6182, { acc: 1 }], [6183, { acc: 1 }], [6184, { acc: 1 }], [6185, { acc: 1 }],
  [6186, { acc: 1 }], [6187, { acc: 1 }],
  // 6188/6189 提取器已有条目（def/life）但缺 acc——合并而非覆盖
  [6188, { acc: 1 }], [6189, { acc: 1 }],
  [6193, { acc: 1 }], [6194, { acc: 1 }],
];
for (const [_v, _s] of ACC_STATS_1457) {
  STATS[String(_v)] = { ...(STATS[String(_v)] ?? {}), ..._s };
}

// 世界态变体防御覆写（Item.cs :41852-41875：remix 世界灰烬木三件 def 全降 1）
// ——取数口叠层（vanillaItemCombat.itemCombat 同法），上下文由 Game.afterWorldLoad 灌入
function overlayVariantDefense(vid: number, s: VanillaItemStat | null): VanillaItemStat | null {
  const vs = activeVariantStatsOfVid(vid);
  if (s && vs?.defense !== undefined) return { ...s, def: vs.defense };
  return s;
}

/** 原版 item id → 盔甲/配饰属性（含变体防御覆写） */
export function vanillaStatOfVid(vid: number): VanillaItemStat | null {
  return overlayVariantDefense(vid, STATS[String(vid)] ?? null);
}

/** 内部 item id → 属性（ITEM_DEFS 缓存）+ 内部 id → 原版 id 伴表 */
const STAT_BY_IID = (() => {
  const m = new Map<number, VanillaItemStat>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    // ★BJ283：键前缀 parseInt 兜底退役（BJ268 登记,方案 A ⑥回填后恒短路=items.ts:2414 等价定谳）
    const vid = d.vid ?? -1;
    if (vid < 0) continue;
    const s = STATS[String(vid)];
    if (s) m.set(i, s);
  }
  return m;
})();

const VID_BY_IID = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    // ★BJ283：键前缀 parseInt 兜底退役（BJ268 登记,方案 A ⑥回填后恒短路=items.ts:2414 等价定谳）
    const vid = d.vid ?? -1;
    if (vid >= 0) m.set(i, vid);
  }
  return m;
})();

export function statOfInternal(id: number): VanillaItemStat | null {
  const s = STAT_BY_IID.get(id) ?? null;
  if (!s) return null;
  const vid = VID_BY_IID.get(id);
  return vid === undefined ? s : overlayVariantDefense(vid, s);
}

/** ★Mod 盔甲/配饰注册面(2026-10-04):三表直写——STATS(vid 域查表)+STAT_BY_IID/
 *  VID_BY_IID(模块期构建的缓存 Map,mod 条目运行时直写补位;armorSlotIndexOfInternal/
 *  isFunctionalAccessory/isAnyAccessory 消费面零改即通)。 */
export function registerModStats(vid: number, stat: VanillaItemStat, internalId: number): void {
  if (vid < 30000) throw new Error(`[mod-stats] vid 须 ≥30000(mod 段): ${vid}`);
  STATS[String(vid)] = stat;
  STAT_BY_IID.set(internalId, stat);
  VID_BY_IID.set(internalId, vid);
}

/** 盔甲部位槽序（0 头 / 1 身 / 2 腿；非盔甲 -1） */
export function armorSlotIndexOfInternal(id: number): number {
  const s = STAT_BY_IID.get(id)?.s;
  return s === 'h' ? 0 : s === 'b' ? 1 : s === 'l' ? 2 : -1;
}

/** 功能配饰判定（ItemSlot context 10：accessory && !vanity） */
export function isFunctionalAccessory(id: number): boolean {
  return STAT_BY_IID.get(id)?.acc === 1;
}

/** 任意配饰（含社交）判定 */
export function isAnyAccessory(id: number): boolean {
  const acc = STAT_BY_IID.get(id)?.acc;
  return acc !== undefined;
}
