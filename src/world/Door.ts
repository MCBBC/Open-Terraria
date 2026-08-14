// 门帧算法（原版 Tiles_10/11 表竖排布局，WorldGen.OpenDoor L22384 / CloseDoor L15901 反推）：
//   关门 style = 36*(frameX/54) + frameY/54 —— 每列 36 个样式，frameX 只有 0/54 两列；
//   frameX = 变体(0/18/36 三张纹理) + 54*列，frameY = 54*(style%36) + 行内偏移(0/18/36)。
//   开门 frameX = 72*列 + (direction==-1 ? 36 : 0)（%72 后 0/36 为锚点列、18/54 为右侧列）。
// 本项目曾误用 frameX = style*54（横排），越界导致门贴图不可见/错位。
import type { TileStore } from './TileStore';
import { T, TILE_BY_KEY, doorSmashable } from '../data/tiles';

/** 关门锚点帧（顶格）：[frameX, frameY] */
export function doorClosedFrame(style: number, variant = 0): [number, number] {
  return [variant * 18 + 54 * Math.floor(style / 36), 54 * (style % 36)];
}

/** 由任意关门格帧反推 style */
export function doorStyleOf(fx: number, fy: number): number {
  return Math.floor(fx / 54) * 36 + Math.floor(fy / 54);
}

/** 生成期放置整扇关闭门（1×3，锚点在顶格 (x,y)） */
export function placeDoorClosed(st: TileStore, x: number, y: number, style: number, variant = 0): void {
  const [fx, fy] = doorClosedFrame(style, variant);
  for (let dy = 0; dy < 3; dy++) {
    if (st.inBounds(x, y + dy)) st.setTileSilent(x, y + dy, T.DOOR_CLOSED, fx, fy + dy * 18);
  }
}

/** 挖除含 (x,y) 格的整扇门（关门 1×3 / 开门 2×3，帧内偏移 = frame%/格步长）。
 *  返回掉落锚点；非门格返回 null。 */
export function clearDoorAt(st: TileStore, x: number, y: number): [number, number] | null {
  const t = st.get(x, y);
  if (t !== T.DOOR_CLOSED && t !== T.DOOR_OPEN) return null;
  const i = st.idx(x, y);
  const w = t === T.DOOR_OPEN ? 2 : 1;
  const col = Math.floor(st.frameX[i] / 18) % w;
  const row = Math.floor(st.frameY[i] / 18) % 3;
  const ax = x - col, ay = y - row;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      if (st.inBounds(ax + dx, ay + dy) && st.get(ax + dx, ay + dy) === t) st.setTile(ax + dx, ay + dy, 0);
    }
  }
  return [ax, ay];
}

/** 开门（原版 OpenDoor 语义）。direction: 玩家面朝方向 ±1。
 *  返回 false = 目标侧被挡（调用方应换 -direction 重试）。 */
export function openDoor(st: TileStore, x: number, y: number, direction: number): boolean {
  if (st.get(x, y) !== T.DOOR_CLOSED) return false;
  // 锚点行：frameY % 54 === 0
  let ay = y;
  while (st.get(x, ay) === T.DOOR_CLOSED && st.frameY[st.idx(x, ay)] % 54 !== 0) {
    if (--ay < 0) return false;
  }
  if (st.get(x, ay) !== T.DOOR_CLOSED) return false;
  const ai = st.idx(x, ay);
  const style = doorStyleOf(st.frameX[ai], st.frameY[ai]);
  const col = Math.floor(style / 36), row = style % 36;
  // 目标侧列仅许可砍切格（原版 OpenDoor cs:37698-37715：!tileCut && !=165 && !drip 才失败），
  // 可砍格随后碎掉（:37717-37724 KillTile）。★曾保守要求全空=蛛网堵门永远打不开（偏差）
  const clearX = direction === -1 ? x - 1 : x + 1;
  for (let dy = 0; dy < 3; dy++) {
    const t = st.get(clearX, ay + dy);
    if (t !== 0 && !doorSmashable(t)) return false;
  }
  for (let dy = 0; dy < 3; dy++) {
    if (st.get(clearX, ay + dy) !== 0) st.setTile(clearX, ay + dy, 0); // KillTile 近似（砍切类 drop 均 null）
  }
  // 开门占 2 列：direction==-1 锚点左移一格、frameX+36（原版 num1/x 逻辑）
  const ax = direction === -1 ? x - 1 : x;
  const baseFx = 72 * col + (direction === -1 ? 36 : 0);
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      if (!st.inBounds(ax + dx, ay + dy)) continue;
      st.setTile(ax + dx, ay + dy, T.DOOR_OPEN, baseFx + dx * 18, 54 * row + dy * 18);
    }
  }
  return true;
}

/** 关门（原版 CloseDoor 语义，点到的可以是开门 2×3 中任意一格）。
 *  blocked = 实体占格判定（原版 Collision.EmptyTile(ignoreTiles:true)：只看玩家/NPC，忽略图格——
 *  关门列此刻还是开门图格）。返回 false = 门位被实体挡住。 */
export function closeDoor(st: TileStore, x: number, y: number, rng: () => number = Math.random, blocked?: (x: number, y: number) => boolean): boolean {
  if (st.get(x, y) !== T.DOOR_OPEN) return false;
  // 锚点行：frameY % 54 === 0
  let ay = y;
  while (st.get(x, ay) === T.DOOR_OPEN && st.frameY[st.idx(x, ay)] % 54 !== 0) {
    if (--ay < 0) return false;
  }
  if (st.get(x, ay) !== T.DOOR_OPEN) return false;
  const fx = st.frameX[st.idx(x, ay)];
  // 原版 switch(frameX % 72)：关门列与开门方向
  let closedX: number;
  switch (fx % 72) {
    case 18: closedX = x - 1; break;   // 点到右侧列 → 锚点在左
    case 36: closedX = x + 1; break;   // direction==-1 的锚点列
    case 54: closedX = x; break;       // direction==-1 的右侧列
    default: closedX = x; break;       // 0：direction==+1 锚点列
  }
  // 关门位实体检查（原版 Collision.EmptyTile(ignoreTiles:true)：图格忽略，只挡实体）
  for (let dy = 0; dy < 3; dy++) {
    if (blocked?.(closedX, ay + dy)) return false;
  }
  // 样式行先取（清格后 frameY 归零；原版关门不重写 frameY，样式行开门/关门一致）
  const col = Math.floor(fx / 72);
  const row = Math.floor(st.frameY[st.idx(x, ay)] / 54) % 36;
  // 清扫区内的【开门图格】清空、关门列稍后重写（原版 :32037-32057:
  // `tile2.type == 11` 才动——l==num2 转关门型,否则 active(false)）。
  // ★曾 3 列无差别 setTile(0):门朝空侧开再关时 sweepR=x+1 越过门自身两列,
  // 把旁贴工作台/墓碑的半边格直接抹掉(用户报"开关门切半贴图",2026-08-14)
  const sweepL = Math.min(closedX, x - 1), sweepR = Math.max(closedX + 1, x + 1);
  for (let sx = sweepL; sx <= sweepR; sx++) {
    for (let dy = 0; dy < 3; dy++) {
      if (!st.inBounds(sx, ay + dy)) continue;
      if (st.get(sx, ay + dy) === T.DOOR_OPEN) st.setTile(sx, ay + dy, 0);
    }
  }
  const [cfx] = doorClosedFrame(col * 36, Math.floor(rng() * 3));
  for (let dy = 0; dy < 3; dy++) {
    if (!st.inBounds(closedX, ay + dy)) continue;
    st.setTile(closedX, ay + dy, T.DOOR_CLOSED, cfx, 54 * row + dy * 18);
  }
  return true;
}

// ================= 高门（Tall Gate 388/389，WorldGen.ShiftTallGate L51747 1:1） =================
// 关(388)/开(389) 两张表同布局（18×188）：切换 = 保帧换 type；开门声 SoundID 8。
// 锚点回溯：frameY % 90（CoordinateFullHeight）→ 行内偏移 /18 = 距顶格格数。

/** 切换高门（closing=true 关、false 开）。锚点可为门内任意格；返回锚点坐标或 null */
export function shiftTallGate(
  st: TileStore, x: number, y: number, closing: boolean,
  sfx?: (name: string) => void,
): [number, number] | null {
  const CLOSED = TILE_BY_KEY['v_388_tall_gate_closed'];
  const OPEN = TILE_BY_KEY['v_389_tall_gate_open'];
  if (!CLOSED || !OPEN) return null;
  const from = closing ? OPEN : CLOSED;
  const to = closing ? CLOSED : OPEN;
  const i0 = st.idx(x, y);
  if (st.type[i0] !== from) return null;
  const fy = st.frameY[i0];
  const anchorY = y - Math.floor((fy % 90) / 18); // CoordinateFullHeight 90 / 18
  for (let dy = 0; dy < 5; dy++) {
    const ii = st.idx(x, anchorY + dy);
    if (!st.inBounds(x, anchorY + dy) || st.type[ii] !== from) return null; // ValidateTileSquare
  }
  for (let dy = 0; dy < 5; dy++) st.setTile(x, anchorY + dy, to, st.frameX[i0], st.frameY[st.idx(x, anchorY + dy)]);
  sfx?.('door_open'); // 高门恒播 SoundID 8 不分开关(WorldGen.cs:51786);旧'door'非法名经 as 断言静默失效
  return [x, anchorY];
}

/** WorldGen.IsLockedDoor（cs:69248-69255）：门 10 且 frameY∈[594,646]（style 11
 *  神庙锁门段）且 frameX<54（关闭态）——开锁消耗神庙钥匙 1141（Player.cs:32332-32357） */
export function isLockedDoor(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  // WorldGen.cs:69248：type==10(关门表)——原版 tile id 10,此处须比内部 id
  //（door_closed=17）。★曾写 st.type[i]===10：10 是 sheet id,内部 id 空间恒 false
  // → 神庙锁门(PlaceDoor style11, fy=594)开锁链全灭,无钥匙也能开(2026-08-13)。
  return st.type[i] === T.DOOR_CLOSED && st.frameY[i] >= 594 && st.frameY[i] <= 646 && st.frameX[i] < 54;
}

/** WorldGen.UnlockDoor（cs:37613-37640）：向上扫锁段顶格（frameY==594），三格
 *  frameY += 54（移出 [594,646] 锁区 → 变普通可开关门）+ 播 SoundID 22 */
export function unlockDoor(st: TileStore, x: number, y: number, sfx?: (n: string) => void): boolean {
  if (!isLockedDoor(st, x, y)) return false;
  let top = y;
  while (st.frameY[st.idx(x, top)] !== 594) {
    top--;
    if (top <= 0 || st.frameY[st.idx(x, top)] < 594) return false;
  }
  for (let k = top; k <= top + 2; k++) {
    const i = st.idx(x, k);
    st.frameY[i] += 54;
  }
  sfx?.('unlock');
  return true;
}
