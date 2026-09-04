// IIII163 帧通道（第 9/10 通道 frx/fry）对账口径 · 测试辅助函数。
// 产物面契约见 content-parity 章 CXXXVIII；一次性仪 = tools/_iii163fx.test.ts。
//
// ── 通道语义（x86 权威锚）────────────────────────────────────────────────────
// - rig159 DumpGrid（JJHook.dll 反编实证）：.fx/.fy = tile.frameX/frameY **裸 u16LE 直写**，
//   零编码变换、零哨兵注入——dump 值即 x86 世界真实 Tile 帧域。
// - x86 -1（u16 环回 65535）=「未定帧」哨兵，由 vanilla 1.4.5.7 世界生成自己写：
//   ① TerrainPass.FillColumn/RetargetColumn 逐格 `active+type+frameX=-1+frameY=-1`
//     （Terarria1457/Terraria.GameContent.Biomes/TerrainPass.cs:251/260/267/278/287）
//     ——世界生成开局全图 5,040,000 格 frame=-1（w159 000_Terrain 实测 fxSent=N 全等）；
//   ② WorldGen.KillTile 尾 `tile.frameX=-1; tile.frameY=-1`（WorldGen.cs:64400-64401）
//     ——KillTile 杀格清帧到 -1（非 ClearTile；Tile.ClearTile() 不碰帧）；
//   ③ 非上述两路的「失活不清帧」路径留下残帧（w159 全链 inactive 残帧 3,678 格 fx/
//     2,263 格 fy 非哨兵值）与显式 0 帧（inactive 1,068 万格 fx=0=曾写 0 后失活）。
// - TS37 世系 rig（gen2-m/gen2-g/golden-toadstool 等）.frx/.fry 同语义（同 -1 哨兵，
//   census-x86 三桶 negOther=0：除 65535 外无其他负半区值）。
// - JS 侧：TileStore.frameX/frameY = Uint16Array 零填默认（未定帧=0，非 -1）；
//   JS 移植 vanilla `frameX=-1` 惯用处的落点（ShimmerPass.ts:449/DungeonPass.ts:6979
//   等）以 65535 环回形出现在 store —— js-076 实测 208 格。故 **双侧都可能持有 65535**。
//
// ── 规范映射（CXXXVIII 定谳）────────────────────────────────────────────────
//   规则：**双侧 0xFFFF → 0 归一后整格比对**（normFrame 对称应用）。
//   - 编码伪影（不入差集）：x86 -1（TerrainPass/KillTile 未定帧哨兵）↔ JS 0（store 默认）
//     ——即移交面「~228 万格/槽」的铺底层，归一后恒等；
//     及双侧 -1 惯用法对撞（x86 -1 ↔ JS 65535，归一后同为 0）。
//   - 真帧差（入差集，逐格归因）：归一后任一侧不等。四类：
//     js_framed（x86 -1 vs JS 实帧）/ x86_framed_js0（x86 实帧 vs JS 0——**口径盲区**：
//     JS store 无未定帧哨兵,「JS 误写 0 帧」与「双未定帧」经 store 不可分,登记为已知
//     盲区）/ mismatch（双侧实帧不等）/ js_neg（JS 65535 vs x86 实帧）。
//   - 裁决面：**active/inactive 全格参与**（x86 通道是裸 dump,残帧信息在,不像
//     「-1=失活标记」的误读那样丢失活格帧面）。
//   - 备选口径「JS 侧补 -1 哨兵」= TileStore 初值改 -1,属 src 生产面编辑（渲染/存档
//     连带面不可控）且对已有 16 链 8ch 认证零增益——**否决**（CXXXVIII §②）。

/** 未定帧哨兵（x86 TerrainPass/KillTile -1 的 u16 环回形）。 */
export const FRAME_UNFRAMED = 0xffff;

/** 规范归一：0xFFFF（-1 未定帧哨兵）→ 0。双侧同构应用（x86 与 JS 都可能持有 65535）。 */
export function normFrame(v: number): number {
  return v === FRAME_UNFRAMED ? 0 : v;
}

/** 规范比对：归一后相等=通过（编码伪影并入相等）。 */
export function frameEq(x86: number, js: number): boolean {
  return normFrame(x86) === normFrame(js);
}

/** 差分类（真帧差归因面；'artifact'=编码伪影不入差集）。 */
export type FrameDiffClass =
  | 'artifact'        // x86 -1 ↔ JS 0（未定帧哨兵 vs store 默认）或 x86 -1 ↔ JS -1（双侧惯用法）
  | 'js_framed'       // x86 -1 vs JS 实帧——JS 给未定帧格写了帧
  | 'x86_framed_js0'  // x86 实帧 vs JS 0——x86 有帧 JS 无（含口径盲区:JS 误写 0 不可分）
  | 'mismatch'        // 双侧实帧不等
  | 'js_neg';         // JS 65535 vs x86 实帧——JS -1 惯用法落在 x86 有帧格

export function frameClass(x86: number, js: number): FrameDiffClass {
  if (frameEq(x86, js)) return 'artifact';
  const xs = x86 === FRAME_UNFRAMED, jsS = js === FRAME_UNFRAMED;
  if (xs && !jsS) return 'js_framed';          // JS 实帧（含 0?——0 已被归一并入 artifact,此处 JS≠0）
  if (!xs && jsS) return 'js_neg';             // JS -1 vs x86 实帧
  if (normFrame(js) === 0) return 'x86_framed_js0';
  return 'mismatch';
}

/** 差分是否入裁决（artifact 之外全入）。 */
export function frameAdjudicates(x86: number, js: number): boolean {
  return frameClass(x86, js) !== 'artifact';
}
