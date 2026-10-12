import type { PackCategoryId } from './packPaths';

// 资源包列表语义（M13）——ResourcePackList.cs + UIResourcePackSelectionMenu 的
// 纯函数化（排序/启停/调序），node 单测直测。
//
// ★SW-FX16 2026-09-10 优先级定谳（原版命名层与解析层互相矛盾,以【解析层行为】为锚）：
//   - EnabledPacks 序 = SortingOrder 升序（同名按 Name/Version/FileName 决胜，
//     ResourcePackList.cs:25-28）；UI 启用列按此序插入（UIList 首条在最上,
//     UIResourcePackSelectionMenu.PopulatePackList :85-119）→ 显示列顶 = 最小 order。
//   - 【解析层（真值）：列表顶 = 最小 SortingOrder = 冲突胜者】。纹理 =
//     AssetRepository.FindSourceForAsset `_sources.FirstOrDefault(HasAsset)`
//     （ReLogic/Content/AssetRepository.cs,tModLoader patch 双面同码:1.4.4 原版
//     TryLoadingAsset 同式;1.4.5 异步重写 = foreach { 命中即 SubmitLoadedContent+
//     return }）,源序 = AssetSourceController.UseResourcePacks :45-48 的
//     [packs 按 order 升序, 静态源尾随] → 首源胜 = 最小 order 胜;音频 =
//     LegacyAudioSystem.FindReplacementTrack(:84-124) 对【反转表】
//     （UseResourcePacks :53-57 list2=reverse(list)）逐源命中即覆盖 → 末次覆盖
//     胜 = 仍是最小 order 胜。Wiki/社区观测同向（"uppermost one on the list will
//     take priority"）。三通道互证,钉死。
//   - 【命名层（噪声,登记不照抄）】：SetResourcePackAsTopPriority(:211-226) 给
//     新启用包 = 其余最大 order+1（= 显示列底 = 解析层最【低】优先,方法名系
//     误称）；"向前移动" tooltip（OffsetFrontwardUpdate :507-515 →
//     UI.OffsetTexturePackPriorityUp）配 offset+1（= 显示列下移 = 解析层更输）,
//     而按钮精灵 TexturePackButtons frame0=▲(offset-1)/frame1=▼(offset+1)——
//     原版 UI 命名整体与引擎行为相反（社区有专改箭头标签的 Workshop 模组侧证）。
//   - 本仓落刀：列表/启用/调序/重整纯函数照抄原版命名层代码（1:1）；【合并方向】
//     在 ResourcePackManager 按解析层真值落（enabledSorted 升序遍历 + 首写胜,
//     见 applyAll/pushAudioOverrides）；UI 箭头字形按显示方向配 tooltip 键
//     （ResourcePackPage,适配登记）。
//   - 调序 = 与相邻元素交换 SortingOrder（OffsetResourcePackPriority :228-242）；
//   - 重整 = 按 SortingOrder 序重编 0..n-1（CleanUpResourcePackPriority :280-288）。

/** 已安装包行（持久化形态；对应原版 ResourcePack 实例 + ResourcePackEntry 存档态） */
export interface PackRow {
  id: string;
  /** zip 文件名（原版 FileName——排序决胜键与存档主键） */
  fileName: string;
  name: string;
  description: string;
  author: string;
  version: { major: number; minor: number };
  enabled: boolean;
  sortingOrder: number;
  addedAt: number;
  /** 有效内容文件数（信息页展示） */
  fileCount: number;
  /** icon.png dataURL（缺省 null → 默认图标） */
  iconDataUrl: string | null;
  /** ★材质类别开关(2026-10-12):缺项=开(默认全开)——合并期按类别过滤该包注入 */
  categories?: Partial<Record<PackCategoryId, boolean>>;
}

type RowLike = Pick<PackRow, 'name' | 'version' | 'fileName'>;

/** Name → Version(major,minor) → FileName 决胜链（ResourcePackList.cs 三处同款） */
function byNameVersionFile(a: RowLike, b: RowLike): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  const va = a.version.major - b.version.major;
  if (va !== 0) return va;
  const vi = a.version.minor - b.version.minor;
  if (vi !== 0) return vi;
  return a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0;
}

/** EnabledPacks 序（SortingOrder 升序 + 决胜链）——同时是合并遍历序（首写胜，
 *  列表顶 = 最小 order = 冲突胜者,见文件头 SW-FX16 优先级定谳） */
export function enabledSorted<T extends PackRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.enabled).sort((a, b) => (a.sortingOrder - b.sortingOrder) || byNameVersionFile(a, b));
}

/** DisabledPacks 序（Name/Version/FileName） */
export function disabledSorted<T extends PackRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !r.enabled).sort(byNameVersionFile);
}

/** 启用置尾（原版 SetResourcePackAsTopPriority :211-226 代码 1:1：其余启用包最大
 *  SortingOrder + 1——★方法名系原版误称,实际落点 = 显示列【底】= 解析层最低优先；
 *  与原版行为（新启用包不压制已启用同键包,需手动调上）一致。保留原名作反编译锚。
 *  原地修改行并返回引用。 */
export function enableAsTopPriority(row: PackRow, rows: readonly PackRow[]): PackRow {
  row.enabled = true;
  let max = -1;
  for (const r of rows) {
    if (r === row || !r.enabled) continue;
    if (max < r.sortingOrder) max = r.sortingOrder;
  }
  row.sortingOrder = max + 1;
  return row;
}

/** 调序（OffsetResourcePackPriority :228-242）：在 EnabledPacks 序中与偏移 neighbor
 *  交换 SortingOrder；钳 [0, n-1]；越界/未启用 no-op。返回是否发生交换。 */
export function offsetPriority(row: PackRow, rows: readonly PackRow[], offset: -1 | 1): boolean {
  if (!row.enabled || (offset !== -1 && offset !== 1)) return false;
  const list = enabledSorted(rows);
  const i = list.indexOf(row);
  if (i < 0) return false;
  const j = Math.min(list.length - 1, Math.max(0, i + offset));
  if (j === i) return false;
  const t = list[i].sortingOrder;
  list[i].sortingOrder = list[j].sortingOrder;
  list[j].sortingOrder = t;
  return true;
}

/** 重整（CleanUpResourcePackPriority :280-288）：EnabledPacks 序重编 0..n-1 */
export function cleanUpPriority(rows: PackRow[]): void {
  let n = 0;
  for (const r of enabledSorted(rows)) r.sortingOrder = n++;
}

/** 禁用（IsEnabled=false 即可；SortingOrder 保留，cleanUp 时收敛） */
export function disablePack(row: PackRow): void {
  row.enabled = false;
}
