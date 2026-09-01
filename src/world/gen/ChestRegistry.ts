/** IIII102c（2026-09-01）FTW 双钥·钥匙②：chest sink 洞数组影子账。
 *
 * 原版 Main.chest 是定长 8000 数组 + 洞模型（Terarria1457/Chest.cs）：
 *   - Chest.FindEmptyChest（cs:516-535）：i 0..7999 扫描,首个空槽下标即返回；
 *     途中任何槽位坐标==(X,Y) → 整体 -1（不建条目）；
 *   - Chest.CreateWorldChest/Assign（cs:98-110）：Main.chest[index]=chest,
 *     _chestsByCoords 同步;
 *   - Chest.RemoveChest（cs:126-134）：Main.chest[i]=null 留洞——**不压缩数组**；
 *     世界生成期唯一注销路径=KillTile 箱支（WorldGen.cs:58460）
 *     `Chest.DestroyChest(m,n)+KillTile(m,n)`（有货箱被 CanDestroyChest
 *     拒毁=整格 no-op）,以及 CheckTileBreakability2_ShouldTileSurvive 的 DestroyChest
 *     试毁门（cs:63006/63017）;
 *   - PlaceDresserDirect/PlaceChestDirect（WorldGen.cs:58329/:58363）直呼 CreateChest 带显式 id
 *     （placeTile 88 支在 cs:52602 `CreateChest(x-1,y-1)==-1 → flag2=false`）。
 *
 * JS 曾是「compact 数组 + TrapsPass 局部 splice」两条生命周期语义不同源：
 * 注销后全表左移 ⇒ 创建序 ≠ 槽位序,DeadMansChests(GetPossibleChestsToTrapify 按
 * Main.chest[j<8000] 枚举)候选序/成员面大面积分叉（IIIII101e X-only71/J-only66 实证）。
 *
 * 本模块把 sink 归一为「槽号=稀疏数组下标」：洞=null 占位,注册=首空槽复用,
 * 注销=置 null 留洞；枚举一律按下标升序跳洞。生成全程保持稀疏,出口处 densify()
 * （与 .wld 磁盘语义同构:按槽序写活箱坐标序列）。 */

export interface ChestEntryLike {
  x: number;
  y: number;
  items: Array<{ id: number; stack: number } | null>;
  locked?: boolean;
}

/** 稀疏 sink（洞=null）。与原版 Main.chest 下标一一对应。 */
export type SparseChestSink = Array<ChestEntryLike | null>;

function isLive(c: ChestEntryLike | null | undefined): c is ChestEntryLike {
  return !!c && typeof (c as ChestEntryLike).x === 'number';
}

/** Chest.FindEmptyChest（cs:516）镜像：目标坐标被任何活箱占用 → -1；
 *  否则返回首空槽下标（无空槽且未满 → 长度尾接位）。 */
export function findEmptySlot(sink: SparseChestSink, x: number, y: number): number {
  let free = -1;
  for (let i = 0; i < sink.length; i++) {
    const c = sink[i];
    if (!isLive(c)) { if (free === -1) free = i; continue; }
    if (c.x === x && c.y === y) return -1;
  }
  return free === -1 ? sink.length : free;
}

/** Chest.CreateChest(id=-1 路径)+CreateWorldChest 合流镜像：建条目入首空槽。
 *  返回槽下标；坐标重占时返回 -1 且不写入（调用侧须按放置失败处理,
 *  对齐 cs:52602 `CreateChest(...)==-1 → flag2=false` 门）。 */
export function registerChest(sink: SparseChestSink, entry: ChestEntryLike): number {
  const slot = findEmptySlot(sink, entry.x, entry.y);
  if (slot === -1) return -1;
  sink[slot] = entry;
  return slot;
}

/** Chest.FindChest（cs:507）镜像：返回活箱条目（跳过洞）；无则 null。 */
export function findLiveChest(sink: SparseChestSink, x: number, y: number): ChestEntryLike | null {
  for (const c of sink) if (isLive(c) && c.x === x && c.y === y) return c;
  return null;
}

/** 稠密活箱计数（DmLog CHEST 行总数口径 = 非空槽数）。 */
export function liveCount(sink: SparseChestSink): number {
  let n = 0;
  for (let i = 0; i < sink.length; i++) if (isLive(sink[i])) n++;
  return n;
}

/** 出口收缩：剥掉洞,保留槽序的活箱坐标序列（与 .wld chests 段同构）。
 *  仅应在 generateWorld 全 pass 结束后调用一次;生成中禁用（洞语义贯穿 #76..#105）。 */
export function densify<T extends ChestEntryLike>(sink: Array<T | null>): T[] {
  const out: T[] = [];
  for (const c of sink) if (isLive(c)) out.push(c);
  return out;
}
