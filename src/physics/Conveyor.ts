// 传送带（Conveyor Belt，tile 421/422）实体输送 1:1
//
// 原版权威（Terarria1456 反编译）：
//  - TileID.cs:261  TileID.Sets.ConveyorDirection = {421:+1, 422:-1}
//  - Collision.cs:4215-4351  Collision.StepConveyorBelt（Player/NPC：位移步进）
//  - Collision.cs:3936-4211  Collision.ApplyConveyorBeltMovementToVelocity（WorldItem 掉落物：速度驱动）
//  - 调用点：Player.cs:27920（DryCollision 碰撞段内，SlopingCollision 之后；
//    isLockedToATile 门 :27921）/ Player.cs:23294（矿车变体碰撞路径）/
//    NPC.cs:93774-93787（ConveyorBeltCollision() 门）/ WorldItem.cs:938
//
// 方向语义（易错点，素材命名有误导）：
//  站上带后的水平推运方向 = +ConveyorDirection——421 向 +X（右）、422 向 -X（左）。
//  两条独立链路互相印证：
//   ① StepConveyorBelt：num = Σ dir×num5×gravDir（:4306），num5 站立=+1（上沿线命中
//     ：4299-4302），位移 velocity.X = num×gravDir（:4333）→ 421 取 +2.5；
//   ② ApplyConveyorBeltMovementToVelocity：Side=Bottom（物品底==格顶，BuildTileContacts
//     :2212-2216）→ zero.X += +num3×overlap（:3966-3968）→ 421 同样取正。
//  素材键 v_421_conveyorbeltleft / v_422_conveyor_belt_ccw 的 left/right 与推运方向
//  无关——物品名是 "Conveyor Belt (Clockwise / Counter Clockwise)"
//  （idNames.generated.ts:11361-11362）：顺时针带环顶面向右走。
//
// 数值（1456 最终态）：
//  - Player/NPC：固定步进 2.5px/tick（:4333-4334，方向经 Math.Sign 归一 :4328-4329），
//    直接改 position 不改 velocity；先按 TileCollision 钳制平移（:4335-4336），
//    再向下压 2.5×gravDir 贴合带面（:4337-4341，下坡/跨带不断联）。
//  - 掉落物：速度驱动。按脚下接触的带向×重叠量分档（:4028-4051）
//    |Σ|≤4→0.75、≤8→1.25、>8→2.5，每 tick vx += 目标×6/60（=0.1）且钳到目标
//    （:4130-4140）——即加速逼近、上限 2.5。
//
// 与原版的偏差（均为稳定性/规模取舍，行内另有标注）：
//  - 时序：原版在实体碰撞阶段内调用；本作统一为 fixedUpdate 实体更新后的后处理
//    （每 tick 末等价，对各自 moveAndCollide 无侵入）。
//  - 接触容差统一 0.1px（原版 line 判定 ε=0.0001 :4228/物品接触阈 0.1 :2212）。
//  - 不移植：Player gfxOffY/抓钩/pulley/onTrack 门与 height-5 采样收缩（:4218-4227，
//    本作无对应状态）；物品侧向接触 Y 速度与带端抬升快照（:3984-4020、:4102-4128，
//    仅取脚下接触）；artificialRising 人工爬升（:4326 起，TryFindingConveyorBeltRising
//    :4353 在 1.4.5.6 已无调用方=死代码）；onConveyor 摆动视觉标志（WorldItem.cs:41、
//    Main.cs:38049，渲染层未接，备案）。
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { vanillaNpc } from '../data/vanillaNpcs';
import type { TileStore } from '../world/TileStore';

/** 站上带后被推运的水平速度（px/tick）。Collision.cs:4333 的 *2.5f */
export const CONVEYOR_SPEED = 2.5;
/** 掉落物档位上限（px/tick）。Collision.cs:4068/4105 */
export const CONVEYOR_ITEM_MAX = 2.5;
/** 掉落物逼近加速度 = 目标×6/60（Collision.cs:4131/4137 的 6f/60f） */
export const CONVEYOR_ITEM_ACCEL = 6 / 60;
/** 接触容差（见文件头偏差说明） */
const EPS = 0.1;

/** 被输送实体最小形状（Entity/ItemDrop 均满足） */
export interface ConveyorBody {
  x: number; y: number; w: number; h: number;
  vx: number;
  /** 平台单向碰撞下落开关（glue 下压时判平台用；掉落物无此字段） */
  dropThrough?: boolean;
}

/** 原版 TileID.Sets.ConveyorDirection（TileID.cs:261）：421→+1、422→-1、其余 0。
 *  以 vanilla sheet 查表（同 Wiring.sheetOf 口径），与内部 tile id 解耦。 */
export function conveyorDirection(tileType: number): number {
  const sheet = TILE_DEFS[tileType]?.vanilla?.sheet;
  return sheet === 421 ? 1 : sheet === 422 ? -1 : 0;
}

/** NPCID.Sets.ConveyorBeltCollision（NPCID.cs:4789，CreateBoolSet 全员=true）：
 *  这些敌怪例外地会被传送带搬运（其余普通敌怪原版不吃带）。 */
export const CONVEYOR_BELT_NPCS: ReadonlySet<number> = new Set([
  624, 85, 629, 195, 1, 147, 184, 537, 204, 16, 59, 71, 535, 225, 676, 303,
  335, 336, 333, 334, 667, 141, 81, 121, 183, 138, 244, 304, 105, 123, 685,
  686, 687, 106, 354, 376, 579, 589, 37, 695, 696,
]);

/** NPC.cs:93780-93787 ConveyorBeltCollision() 门：townNPC || (lifeMax==5 &&
 *  damage==0) || NPCID.Sets.ConveyorBeltCollision[type] 才吃带。
 *  城镇 NPC 与小动物在 Game 接线处走各自桶（恒吃带），本函数只服务 enemies 桶。
 *
 *  数值口径 vs critter 标志差集（对账 public/sprites/vanilla-npcs.json 全量）：
 *  lifeMax==5&&damage==0 共 101 种，NPCID.Sets.CountsAsCritter（即 vanilla.critter，
 *  NPCID.cs:4823）只 99 种——375 TruffleWormDigger / 549 DD2LanePortal 满足数值
 *  口径但不入 CountsAsCritter，原版按数值门照常吃带；反向差集为空。故以数值
 *  口径为准（与 :93781 逐字一致），critter 标志仅作 json 缺条目时的兜底补充。 */
export function conveyorCarriesEnemy(
  e: { vanillaId?: number | null; vanilla?: { critter?: boolean } | null },
): boolean {
  if (e.vanilla?.critter) return true;
  if (e.vanillaId != null && CONVEYOR_BELT_NPCS.has(e.vanillaId)) return true;
  const v = e.vanillaId != null ? vanillaNpc(e.vanillaId) : null;
  return v != null && v.lifeMax === 5 && v.damage === 0; // :93781
}

/** 带面/带底两道扫描线的 Y（原版 :4277-4294 的 slope/halfBrick 几何，1:1 端点）。
 *  kind=2 上沿线（命中 +1）、kind=1 下沿线（命中 -1，:4295-4298）；t = 格内像素偏移。
 *  slope1=左高右低 2=右高左低 3/4=天花板坡（与 TileCollision.ts 坡面编码一致）。 */
function beltLineY(kind: 1 | 2, slope: number, half: boolean, ty: number, t: number): number {
  const top = ty * TILE, bot = ty * TILE + TILE;
  switch (slope) {
    case 1: return kind === 2 ? top + t : bot;              // :4279-4283
    case 2: return kind === 2 ? bot - t : bot;              // :4284-4288
    case 3: return kind === 2 ? top : bot - t;              // :4289-4293
    case 4: return kind === 2 ? top : top + t;              // :4284-4293 的 4 分支
    default: return kind === 2 ? top + (half ? 8 : 0) : bot; // :4299-4301 半砖顶 +8
  }
}

/** AABB 与带线段相交（原版 CheckAABBvLineCollision2 :265 的本场景简化）：
 *  线段恒为全格宽且 X 单调，取实体 X 与格 X 的交集后比较两端 Y 区间即可。
 *  返回 [yMin, yMax]（交叠段的线段 Y 范围）或 null（无 X 交集）。 */
function beltLineSpan(
  ax0: number, ax1: number, tx: number,
  kind: 1 | 2, slope: number, half: boolean, ty: number,
): [number, number] | null {
  const xs0 = Math.max(ax0, tx * TILE), xs1 = Math.min(ax1, tx * TILE + TILE);
  if (xs1 < xs0) return null;
  const ya = beltLineY(kind, slope, half, ty, xs0 - tx * TILE);
  const yb = beltLineY(kind, slope, half, ty, xs1 - tx * TILE);
  return ya <= yb ? [ya, yb] : [yb, ya];
}

interface BeltContact {
  /** Σ dir×num5×gravDir（:4306），Math.Sign 前的原值 */
  num: number;
  /** 坡面垂直分量 Σ（:4307-4314） */
  num2: number;
  /** 物品分档用的带向×重叠量 Σ（:3988-4002 的 Bottom/Top 接触） */
  overlapX: number;
}

/** 边缘行扫描（原版 GetEntityEdgeTiles :3882-3932 的 up+down 双边 + :4239 调用参数
 *  left:false right:false）：
 *  - down 行 = 脚下带（底边恰在格顶时取带所在行 :3902-3905），num5=+1 正向推运；
 *  - up 行   = 头顶带（顶边恰在格底时取带所在行 :3894-3897），带的下沿线命中走
 *    num5=-1（:4295-4298），num += num4×num5×gravDir（:4306）→ 反向水平推动——
 *    服务"带悬于实体头顶"场景；按压方向不变（:4337-4341 恒向下 2.5×gravDir）。
 *  两行可能同格（身高 <16 且顶边不入下一行）：原版把该格入列两次（:3912-3919 各
 *  Add 一次）→ 双倍计入，此处保持 1:1 不去重。
 *  O(2×实体宽/16) 单点查表，不做全图扫描。 */
function scanBeltContact(ent: ConveyorBody, st: TileStore, gravDir: number): BeltContact | null {
  // 列范围：边界贴合时原版向两侧各扩一列（:3890-3901）
  let l = Math.floor(ent.x), r = Math.floor(ent.x + ent.w);
  if (l % TILE === 0) l--;
  if (r % TILE === 0) r++;
  const c0 = Math.floor(l / TILE), c1 = Math.floor(r / TILE);
  // up 行：顶边恰在格底（头顶正下方悬带）→ 取带所在行（:3894-3897 的 num2--）
  let t = Math.floor(ent.y);
  if (t % TILE === 0) t--;
  const rowUp = Math.floor(t / TILE);
  // down 行：底边恰在格顶（正常落脚）→ 取带所在行（:3902-3905 的 num4++）
  let b = Math.floor(ent.y + ent.h);
  if (b % TILE === 0) b++;
  const rowDn = Math.floor(b / TILE);

  const ax0 = ent.x, ax1 = ent.x + ent.w, ay0 = ent.y, ay1 = ent.y + ent.h;
  const contact: BeltContact = { num: 0, num2: 0, overlapX: 0 };
  let found = false;
  for (let row = rowUp; row <= rowDn; row++) {
    for (let c = c0; c <= c1; c++) {
      if (!st.inBounds(c, row)) continue;
      const j = st.idx(c, row);
      const dir = conveyorDirection(st.type[j]);
      if (dir === 0) continue;
      // 原版要求 active() && nactive()（:4249-4252）：已致动（缩地）的带不搬运
      if (!st.isActive(c, row)) continue;
      const slope = st.slope[j], half = st.half[j] !== 0;
      // num5：上沿线命中 +1（:4299-4302）、下沿线命中 -1（:4295-4298；带非 platform）
      let num5 = 0;
      const top2 = beltLineSpan(ax0, ax1, c, 2, slope, half, row);
      if (top2 && top2[0] <= ay1 + EPS && top2[1] >= ay0 - EPS) num5++;
      const bot1 = beltLineSpan(ax0, ax1, c, 1, slope, half, row);
      if (bot1 && bot1[0] <= ay1 + EPS && bot1[1] >= ay0 - EPS) num5--;
      if (num5 === 0) continue;
      found = true;
      contact.num += dir * num5 * gravDir;
      // 坡面垂直分量（:4307-4314；leftSlope={2,4}/rightSlope={1,3}，Tile.cs:340-358）
      if (slope === 2 || slope === 4) contact.num2 += gravDir * -dir;
      if (slope === 1 || slope === 3) contact.num2 -= gravDir * -dir;
      // 物品分档重叠量（BuildTileContacts 权重公式 :2196-2198：X 需严格相交
      //  （ax1>格左 && ax0<格右）、overlap+0.5、下限 1，TileContact 构造再 (int) 截断
      //  （:2204/:2208）；num5>0=站立其上取 +dir、num5<0=带悬于其下取 -dir，对齐
      //  ApplyConveyorBeltMovementToVelocity Top/Bottom 累加（:3962-3968，逐格累入
      //  zero.X 后 :4028-4051 统一分档））
      const raw = Math.min(ax1, c * TILE + TILE) - Math.max(ax0, c * TILE);
      if (raw > 0) contact.overlapX += dir * num5 * Math.trunc(Math.max(raw + 0.5, 1));
    }
  }
  return found ? contact : null;
}

/** 单轴平移 + tile 钳制（原版 TileCollision :2340 起，本场景 ≤2.5px 单步的等价简化；
 *  守卫与 physics/TileCollision.ts moveAxis 同款：贴面接近才拦、坡面格放行）。
 *  与 moveAxis 的区别：不写 vx/vy/onGround（原版 TileCollision 也只返回钳制后的位移）。 */
function clampMove(ent: ConveyorBody, st: TileStore, dx: number, dy: number): void {
  if (dx !== 0) {
    const dir = dx > 0 ? 1 : -1;
    const oldEdge = dir > 0 ? ent.x + ent.w : ent.x;
    ent.x += dx;
    const edge = dir > 0 ? ent.x + ent.w : ent.x;
    const tx = Math.floor(edge / TILE);
    const y0 = Math.floor(ent.y / TILE), y1 = Math.floor((ent.y + ent.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (!st.inBounds(tx, ty)) continue;
      const j = st.idx(tx, ty);
      if (!st.isSolid(tx, ty) || st.slope[j] > 0) continue;
      const top = ty * TILE + (st.half[j] ? 8 : 0);
      if (ent.y + ent.h <= top) continue;
      // 上一位置完全在该格一侧（贴面接近）才拦：已横跨的不拦（moveAxis :62 同款）
      if (dir > 0 ? oldEdge > tx * TILE + 0.01 : oldEdge < (tx + 1) * TILE - 0.01) continue;
      ent.x = dir > 0 ? tx * TILE - ent.w : (tx + 1) * TILE;
      break;
    }
  }
  if (dy !== 0) {
    const dir = dy > 0 ? 1 : -1;
    const prevBottom = ent.y + ent.h;
    ent.y += dy;
    const ty = Math.floor((dir > 0 ? ent.y + ent.h : ent.y) / TILE);
    const x0 = Math.floor(ent.x / TILE), x1 = Math.floor((ent.x + ent.w - 0.01) / TILE);
    let best = Infinity;
    for (let tx = x0; tx <= x1; tx++) {
      if (!st.inBounds(tx, ty)) continue;
      const j = st.idx(tx, ty);
      if (dir > 0) {
        const solid = st.isSolid(tx, ty) && st.slope[j] === 0;
        const top = solid ? ty * TILE + (st.half[j] ? 8 : 0)
          // ★RB29/FX34b（F3）：半砖平台落面 = 格顶 +8（Collision.cs:2350-2354
          //  `vector4.Y += 8`,与 TileCollision.ts Y 轴 halfTop 同源）——传送带
          //  输送到半砖平台带的接人高度与玩家落面一致（曾按整格顶接=低 8px 失配）。
          : (!ent.dropThrough && st.isPlatform(tx, ty)) ? ty * TILE + (st.half[j] ? 8 : 0) : -1;
        if (top < 0) continue;
        // 落地门槛（moveAxis :96-97 同款）：新底越过盒顶且上一位置在盒顶之上
        if (ent.y + ent.h <= top || prevBottom > top + 0.01) continue;
        if (top < best) best = top;
      } else {
        if (!st.isSolid(tx, ty) || st.slope[j] > 0) continue;
        const bot = (ty + 1) * TILE;
        if (ent.y >= bot || ent.y - dy < bot - 0.01) continue;
        if (bot < best) best = bot;
      }
    }
    if (best !== Infinity) ent.y = dir > 0 ? best - ent.h : best;
  }
}

/** 掉落物档位（Collision.cs:4028-4051 1:1）：|Σ带向×重叠| ≤4→0.75、≤8→1.25、>8→2.5 */
function itemTier(v: number): number {
  if (v < 0) return v < -8 ? -CONVEYOR_ITEM_MAX : v < -4 ? -1.25 : -0.75;
  if (v > 0) return v > 8 ? CONVEYOR_ITEM_MAX : v > 4 ? 1.25 : 0.75;
  return 0;
}

/**
 * 传送带实体输送（Collision.StepConveyorBelt，Collision.cs:4215-4351 的脚下格简化版）。
 *
 * @param ent    被输送实体（Player/NPC/掉落物均可）
 * @param st     TileStore
 * @param gravDir 重力方向（Player 取 gravDir；NPC 原版恒 1f，NPC.cs:93778）
 * @param itemMode 掉落物路径（ApplyConveyorBeltMovementToVelocity :3936-4211）：
 *                 改 vx 逼近档位目标而非直接位移
 * @returns 是否接触传送带（原版 flag :4302，WorldItem.onConveyor 同义）
 */
export function stepConveyor(
  ent: ConveyorBody, st: TileStore, gravDir = 1, itemMode = false,
): boolean {
  const contact = scanBeltContact(ent, st, gravDir);
  if (!contact) return false;
  if (itemMode) {
    // 掉落物：vx 逼近档位目标，钳到目标（:4130-4140 1:1）
    const target = itemTier(contact.overlapX);
    if (target < 0 && ent.vx > target) ent.vx = Math.max(ent.vx + target * CONVEYOR_ITEM_ACCEL, target);
    else if (target > 0 && ent.vx < target) ent.vx = Math.min(ent.vx + target * CONVEYOR_ITEM_ACCEL, target);
    return true;
  }
  // Player/NPC：方向 Math.Sign 归一（:4328-4329）后 2.5px 步进（:4330-4334）
  const num = Math.sign(contact.num);
  if (num === 0) return true; // 双向带互相抵消（如跨 421|422 边界）：在带上但不动
  const num2 = Math.sign(contact.num2);
  const len = Math.hypot(num * gravDir, num2);
  const dx = (num * gravDir / len) * CONVEYOR_SPEED;
  const dy = (num2 / len) * CONVEYOR_SPEED;
  clampMove(ent, st, dx, dy);
  // 下压贴合（:4337-4341）：平移后向下探 2.5×gravDir，贴住带面/下坡不断联
  clampMove(ent, st, 0, CONVEYOR_SPEED * gravDir);
  return true;
}
