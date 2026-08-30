// Collision.CanHit / CanHitLine 1:1（Terarria1456, 1.4.5.6）：
//   CanHit     Collision.cs:388-480（Point 重载，实体矩形 → 中心 tile 起止）
//   CanHitLine Collision.cs:590-785（分数步进 Bresenham，三 tile 一组 ANY 判阻挡）
//
// 逐 tile 扫描（替换旧的 8px 采样近似），关键语义：
//  - 阻挡 tile = active && !inActive(致动) && tileSolid[type] && !tileSolidTop[type]
//    （CanHit 额外要求 slope==0 && !halfBrick；CanHitLine 不查半砖/坡面——原文如此）
//  - 半砖/坡面/平台(solidTop)/已致动 tile 一律不阻挡视线；
//    开门态是独立 tile id（tileSolid=false），天然不阻挡。
//  - CanHit：沿主轴逐格走，"上下(或左右)两邻格均为整块实心"= 被夹住 → false；
//    落脚格本身可穿才继续走，落脚格为整块实心即出循环 → false。
//  - CanHitLine：每步检查 当前+两邻格 ANY 整实心 → false；步末落脚格实心 → false。
//  - 起止 tile 钳制：x∈[1,maxTilesX-1]、y∈[1,maxTilesY-40]；越界 tile 视同 null → false。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';
import { TileStore as TS } from '../world/TileStore';

type Store = Pick<TileStore, 'w' | 'h' | 'type' | 'wire' | 'half' | 'slope' | 'inBounds' | 'idx'>;

/** tile == null（未加载/越界）→ 调用方 return false */
function isNull(st: Store, x: number, y: number): boolean {
  return !st.inBounds(x, y);
}

/** CanHit 的整块实心判定（Collision.cs:443-447 / :449-453 条件串）：
 *  active && !inActive && tileSolid && !tileSolidTop && slope==0 && !halfBrick */
function fullSolid(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;                                   // !active()
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;             // inActive()
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && st.slope[i] === 0 && st.half[i] === 0;
}

/** CanHitLine 的整块实心判定（不查 slope/halfBrick，cs:707-709） */
function plainSolid(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform;
}

/** CanHit 循环条件取反：当前格"可穿"才继续走（cs:477） */
function passable(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (st.wire[i] & TS.WIRE_ACTUATED) return true;              // inActive → 可穿
  if (t === 0) return true;                                    // !active → 可穿
  const d = TILE_DEFS[t];
  return !d || !d.solid || !!d.platform;                       // !tileSolid || tileSolidTop
}

/** 实体中心 tile 起止 + 原版钳制（cs:390-431） */
function centerTiles(st: Store, x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number): [number, number, number, number] {
  let n1 = Math.floor((x1 + w1 / 2) / 16);
  let n2 = Math.floor((y1 + h1 / 2) / 16);
  let n3 = Math.floor((x2 + w2 / 2) / 16);
  let n4 = Math.floor((y2 + h2 / 2) / 16);
  if (n1 <= 1) n1 = 1; else if (n1 >= st.w) n1 = st.w - 1;
  if (n3 <= 1) n3 = 1; else if (n3 >= st.w) n3 = st.w - 1;
  if (n2 <= 1) n2 = 1; else if (n2 >= st.h - 40) n2 = st.h - 40;
  if (n4 <= 1) n4 = 1; else if (n4 >= st.h - 40) n4 = st.h - 40;
  return [n1, n2, n3, n4];
}

/** Collision.CanHit（cs:388-480）：起点矩形左上角像素坐标 + 尺寸 → 目标同构 */
export function canHit(st: Store, x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number): boolean {
  let [num, num2, num3, num4] = centerTiles(st, x1, y1, w1, h1, x2, y2, w2, h2);
  for (;;) {
    const d5 = Math.abs(num - num3), d6 = Math.abs(num2 - num4);
    if (num === num3 && num2 === num4) return true;
    if (d5 > d6) {
      num += num >= num3 ? -1 : 1;
      if (isNull(st, num, num2 - 1) || isNull(st, num, num2 + 1)) return false;
      if (fullSolid(st, num, num2 - 1) && fullSolid(st, num, num2 + 1)) return false;
    } else {
      num2 += num2 >= num4 ? -1 : 1;
      if (isNull(st, num - 1, num2) || isNull(st, num + 1, num2)) return false;
      if (fullSolid(st, num - 1, num2) && fullSolid(st, num + 1, num2)) return false;
    }
    if (isNull(st, num, num2)) return false;
    if (!passable(st, num, num2)) return false;                // 落脚格整实心 → 阻挡
  }
}

/** Collision.CanHitLine（cs:590-785）：分数步进逐格扫描，ANY 整实心即阻挡 */
export function canHitLine(st: Store, x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number): boolean {
  const [num, num2, num3, num4] = centerTiles(st, x1, y1, w1, h1, x2, y2, w2, h2);
  const d5 = Math.abs(num - num3), d6 = Math.abs(num2 - num4);
  if (d5 === 0 && d6 === 0) return true;
  let stepX = 1, stepY = 1;                                   // num7/num8
  if (d5 === 0) stepX = 0;
  else if (d6 === 0) stepY = 0;
  else if (d5 > d6) stepX = d5 / d6;
  else stepY = d6 / d5;
  let accX = 0, accY = 0;                                     // num9/num10
  let phase = num2 < num4 ? 2 : 1;                            // num11：2=先行 X 步
  let remX = Math.floor(d5), remY = Math.floor(d6);           // num12/num13
  const sx = Math.sign(num3 - num), sy = Math.sign(num4 - num2);
  let cx = num, cy = num2;
  let done = false, lastSingle = false;                       // flag / flag2
  for (;;) {
    if (phase === 2) {
      accX += stepX;
      const steps = Math.floor(accX);
      accX -= steps;
      for (let j = 0; j < steps; j++) {
        if (isNull(st, cx, cy - 1) || isNull(st, cx, cy) || isNull(st, cx, cy + 1)) return false;
        if (plainSolid(st, cx, cy - 1) || plainSolid(st, cx, cy + 1) || plainSolid(st, cx, cy)) return false;
        if (remX === 0 && remY === 0) { done = true; break; }
        cx += sx; remX--;
        if (remX === 0 && remY === 0 && steps === 1) lastSingle = true;
      }
      if (remY !== 0) phase = 1;
    } else {
      accY += stepY;
      const steps = Math.floor(accY);
      accY -= steps;
      for (let i = 0; i < steps; i++) {
        if (isNull(st, cx - 1, cy) || isNull(st, cx, cy) || isNull(st, cx + 1, cy)) return false;
        if (plainSolid(st, cx - 1, cy) || plainSolid(st, cx + 1, cy) || plainSolid(st, cx, cy)) return false;
        if (remX === 0 && remY === 0) { done = true; break; }
        cy += sy; remY--;
        if (remX === 0 && remY === 0 && steps === 1) lastSingle = true;
      }
      if (remX !== 0) phase = 2;
    }
    if (isNull(st, cx, cy)) return false;
    if (plainSolid(st, cx, cy)) return false;
    if (done || lastSingle) return true;
  }
}

/** WorldGen.SolidTile(i,j) 公共口（Terarria1457 WorldGen.cs:70642-70661；1456 :70155
 *  同式）：active && tileSolid && !tileSolidTop(platform) && !halfBrick && slope==0
 *  && !inActuated——与 fullSolid 同判定式的越界安全版。语义要点：
 *  - 不含平台族（tileSolidTop）——与 TileStore.isSolid（含平台）互斥，消费方须按
 *    调用点选对：目标格快退（AI_137_CanHit Projectile.cs:71577）等 WorldGen.SolidTile
 *    站点一律本式；
 *  - 出界/未加载格原版返回 true（Main.tile[i,j]==null → return true 的守门怪癖
 *    :70646-70649），照搬保真——目标态常态在界内,少触发。
 *  （2026-08-30 实体侧对账批新增导出；既有函数体零改动） */
export function solidTileAt(st: Store, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;                         // Main.tile==null → true（怪癖保真）
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;                                   // !active()
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;             // inActive()
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && st.slope[i] === 0 && st.half[i] === 0;
}

/** 原版 Player.CanHit(Entity ent)（Terarria1457/Terraria/Player.cs:42858-42865；
 *  1456 :41886-41894）1:1——近战挥击对 NPC 的视线门，消费点 = ProcessHitAgainstNPC
 *  （1457 :44641 / 1456 :43619 `!flag || (!nPC.noTileCollide && !CanHit(nPC))`）。
 *  四条射线任一通过即可命中：A) Collision.CanHit 整盒对整盒；B/C/D) 三条
 *  "手位点→目标锚点"的 CanHitLine。手位 = Center+(direction*width/2,
 *  gravDir*-height/3)（反重力未实装恒 gravDir=1，与 SmartSelect.ts 同口径）。
 *  目标三锚点 = Center±(0,height/3) 与 Center 本体。p 只需 Player 盒面
 *  （Entity 基类即满足），e 为目标盒。 */
export interface LOSBox { x: number; y: number; w: number; h: number; cx?: number; cy?: number; facing?: number }

export function playerCanHitEntity(st: Store, p: LOSBox, e: LOSBox): boolean {
  if (canHit(st, p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) return true;
  const pcx = p.cx ?? p.x + p.w / 2;
  const pcy = p.cy ?? p.y + p.h / 2;
  const hx = pcx + (p.facing ?? 1) * (p.w / 2), hy = pcy - p.h / 3;
  const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
  // ★F3 目标锚 ±ent.height/3 是 C# **整型除法**（1457 :42860/:42862 ent.height 为
  //  int、除字面量 3 无 f 后缀 → int/int 向零截断后转 float 进 Vector2）：h=38 →
  //  ±12 而非 ±12.667（Player.CanHit(Entity)，1457 :42858-42865 / 1456 :41886-41894）。
  //  对照：玩家手位 y 偏移是浮点除 `(float)(-height)/3f`（:42859）——hy 保持浮点。
  //  登记不修：射线 A 的 Collision.CanHit(Vector2) 先 Utils.ToPoint (int) 截断坐标
  //  （Utils.cs:1911-1914），再纯整型除法求 tile（Collision.cs:390-393）——legacy
  //  canHit 主循环为既有全仓认证基建不动（Math.floor 对正坐标等价 ToPoint 截断；
  //  残余差仅在奇数宽高盒的亚像素窗，见 canHit 注释）。
  const bTop = Math.trunc((0 - e.h) / 3);                        // `-ent.height / 3`
  const dBot = Math.trunc(e.h / 3);                              // `ent.height / 3`
  return canHitLine(st, hx, hy, 0, 0, ecx, ecy + bTop, 0, 0)
    || canHitLine(st, hx, hy, 0, 0, ecx, ecy, 0, 0)
    || canHitLine(st, hx, pcy, 0, 0, ecx, ecy + dBot, 0, 0);
}
