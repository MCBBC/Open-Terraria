// 资源包列表语义（M13）——ResourcePackList.cs + UIResourcePackSelectionMenu 的
// 纯函数化（排序/启停/调序），node 单测直测。
//
// 优先级模型（反编译核实）：
//   - EnabledPacks 序 = SortingOrder 升序（同名按 Name/Version/FileName 决胜，
//     ResourcePackList.cs:25-28）；
//   - 【高 SortingOrder = 高优先级】：启用置顶 SetResourcePackAsTopPriority
//     （:211-226）= 其余启用包最大 order + 1；菜单"向前移动"（优先级↑）=
//     offset +1（OffsetFrontwardUpdate :507-515 → UI.OffsetTexturePackPriorityUp）。
//     AssetSourceController.UseResourcePacks（:38-63）按 SortingOrder 升序排源，
//     资产仓库取靠后（=高序）源为先——列表越靠下越后应用，覆盖前者；
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

/** EnabledPacks 序（SortingOrder 升序 + 决胜链）——同时是应用序（升序应用，
 *  高序后应用覆盖低序 = 高优先级） */
export function enabledSorted<T extends PackRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.enabled).sort((a, b) => (a.sortingOrder - b.sortingOrder) || byNameVersionFile(a, b));
}

/** DisabledPacks 序（Name/Version/FileName） */
export function disabledSorted<T extends PackRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !r.enabled).sort(byNameVersionFile);
}

/** 启用并置顶优先（UIResourcePackSelectionMenu.SetResourcePackAsTopPriority :211-226：
 *  其余启用包最大 SortingOrder + 1）。原地修改行并返回引用。 */
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
