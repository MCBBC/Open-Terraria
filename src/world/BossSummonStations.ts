// Boss 召唤台纯逻辑（右键交互链的位置/行号计算，Player.cs / NPC.cs 1:1）：
//   - 蜥蜴祭坛 237 → 石巨人 245 的落位（NPC.cs SpawnOnPlayer case 245 :81284-81330）
//   - 永恒水晶座 466 的"底行"回推（Player.cs num28 :31938-31946）
// Game 侧右键分发（interactAt）调用此处；事件状态机在 world/OldOnesArmy.ts。
import type { TileStore } from './TileStore';

/** SpawnOnPlayer case 245（NPC.cs:81284-81330）：玩家 ±20 格内找祭坛顶中格
 *  （frameX==18 && frameY==0——3×2 物件的顶行中列），向上/向下 50 格找实心，
 *  落位 y = (上 + 上 + 下)/3（向上偏置），x = 祭坛列中心。
 *  返回 null = ±20 格内无祭坛（:81308-81311 静默返回）。
 *  @param altarTileId 内部 tile id（TILE_BY_KEY['v_237_lihzahrd_altar']） */
export function golemSpawnFromAltar(
  st: TileStore, altarTileId: number, pcx: number, pcy: number,
): { x: number; y: number; altarX: number; altarY: number } | null {
  let ax = 0, ay = 0;
  for (let j = Math.max(0, pcx - 20); j < Math.min(st.w, pcx + 20); j++) {
    for (let k = Math.max(0, pcy - 20); k < Math.min(st.h, pcy + 20); k++) {
      const i = st.idx(j, k);
      // ★X2-F6(2026-09-04):active 门（NPC.cs:81317-21 `tile.active() && type==237
      //  && frameX==18 && frameY==0`）——幽灵祭坛残型不得作石巨人落位锚
      if (!st.hasTile(j, k) || st.type[i] !== altarTileId) continue;
      if (st.frameX[i] === 18 && st.frameY[i] === 0) { ax = j; ay = k; }   // :81300-81304
    }
  }
  if (ax <= 0 || ay <= 0) return null;
  let up = ay - 15, down = ay - 15;     // num6/num7 初值 = num5-15（:81313-81314）
  for (let y = ay; y > ay - 50; y--) {  // 向上 50 找实心（:81315-81322）
    if (st.inBounds(ax, y) && st.isSolid(ax, y)) { up = y; break; }
  }
  for (let y = ay; y < ay + 50; y++) {  // 向下 50 找实心（:81323-81330 前段）
    if (st.inBounds(ax, y) && st.isSolid(ax, y)) { down = y; break; }
  }
  const gy = Math.floor((up + up + down) / 3);   // :81324（向上 2:1 偏置）
  return { x: ax * 16 + 8, y: gy * 16, altarX: ax, altarY: ay };
}

/** 永恒水晶座所点行 → 底行（Player.cs num28 :31938-31946）：
 *  frameY 0→+3 / 18→+2 / 36→+1 / 54→+0（4 行物件点哪行都归到底行） */
export function eterniaStandBottomRow(frameY: number): number {
  if (frameY === 0) return 3;
  if (frameY === 18) return 2;
  if (frameY === 36) return 1;
  return 0;
}

/** ★BJ356 Face5：水晶召唤锚四元组（Player.cs:32689 + DD2Event.cs:584-597 1:1）：
 *  (x,y) = 座【底行】格（num28=所点行+eterniaStandBottomRow）;frameX/Y = **底行格
 *  自身**的帧（vanilla Direct 内 GetTileSafely(x,y) 读帧回推——底行 frameY≡54→
 *  -3 格=顶行 → 水晶 Bottom = 顶行+64 = 地表）。
 *  ★曾传点击格帧配底行坐标=混合锚：点上部格（frameY 0/18/36）时水晶 Bottom 埋
 *  1-3 格——薄平台（桥式竞技场）下水晶悬空 → CheckArenaScore 扫场起点落空 →
 *  SendWalker i=0 坑探 6 格无地即断 → 双端 ±1 → 双传送门贴脸水晶（用户实报）。 */
export function eterniaStandSummonAnchor(
  st: TileStore, tx: number, ty: number,
): { x: number; y: number; frameX: number; frameY: number } {
  const by = ty + eterniaStandBottomRow(st.frameY[st.idx(tx, ty)]);
  const b = st.idx(tx, by);
  return { x: tx, y: by, frameX: st.frameX[b], frameY: st.frameY[b] };
}
