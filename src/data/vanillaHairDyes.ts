// 发色剂运行时表（tools/extract-hairdyes.mjs ← DyeInitializer.cs → vanilla-hairdyes.json）。
// 数据 1:1：12 件物品 → shaderId 1..12（BindShader 执行序，HairShaderDataSet.cs:22）。
//
// 物品侧语义（Item.cs）：
//   ResetStats hairDye=-1(:48559) → SetDefaults 尾钩 `if (hairDye != 0)
//   hairDye = Hair.GetShaderIdFromItemId(type)`(:48320-48322) → 未绑定物品 -1；
//   1977-1986 连续段门(:21210)+2863+3259 得 1..12；case 1990 hairDye=0(:21275)
//   跳过查表 → 去除剂 Item.hairDye=0。
//   ⇒ Item.hairDye：-1 非发色剂 / 0 去除剂 / 1..12 染料。
// 使用链（Player.cs:42179-42186）：`item.hairDye >= 0` 即 1990 在内 →
//   player.hairDye = item.hairDye（byte）；1990 = 清除。
// 存档（Player.cs:53805-53808 写 / :54214-54216 读）：byte，随角色持久化。
import hairJson from './vanilla-hairdyes.json';

export interface HairDyeEntry {
  /** HairShaderDataSet 内下标（Apply/GetColor 的 shaderId；1 基） */
  shaderId: number;
  /** legacy = LegacyHairShaderData 纯 CPU 色；twilight = ArmorTwilight 像素着色器（近似） */
  kind: 'legacy' | 'twilight' | string;
  /** DyeInitializer.cs 绑定行号锚 */
  bindLine: number;
}

const META = (hairJson as unknown as { meta: { removerItem: number; entries: number } }).meta;
const TABLE = (hairJson as unknown as { hairDyes: Record<string, HairDyeEntry> }).hairDyes;

/** 发色剂去除剂（1990，Item.cs:21275 hairDye=0；使用即 player.hairDye=0） */
export const HAIR_DYE_REMOVER_ITEM = META.removerItem;

/** 全部发色剂物品 id（含去除剂；升序） */
export const HAIR_DYE_ITEM_IDS: number[] = [
  ...Object.keys(TABLE).map(Number),
  HAIR_DYE_REMOVER_ITEM,
].sort((a, b) => a - b);

/** Item.hairDye 语义复刻：物品 → 染料 shaderId。
 *  -1 = 非发色剂物品 / 0 = 去除剂 / 1..12 = 染料（Item.cs:48320-48322 + :21275） */
export function hairDyeShaderOfItem(vid: number): number {
  if (vid === HAIR_DYE_REMOVER_ITEM) return 0;
  const e = vid > 0 ? TABLE[String(vid)] : undefined;
  return e ? e.shaderId : -1;
}

/** shaderId → 物品 id（反向查；无效返回 null） */
export function hairDyeItemOfShader(shaderId: number): number | null {
  for (const [k, e] of Object.entries(TABLE)) if (e.shaderId === shaderId) return +k;
  return null;
}

/** 表条目（测试/登记用） */
export function hairDyeEntryOfItem(vid: number): HairDyeEntry | null {
  return vid > 0 ? TABLE[String(vid)] ?? null : null;
}

/** 派对发色剂 shaderId（物品 1984）。原版常量名 TeamDyeShaderIndex 是历史误名
 *  （ContentSamples.cs:19 取的却是 GetShaderIdFromItemId(1984)）——消费点是
 *  UpdateHairDyeDust 的彩纸尘/内脏（Player.cs:23996-24001），非队伍染料。 */
export const PARTY_HAIR_DYE_SHADER_ID = hairDyeShaderOfItem(1984);
