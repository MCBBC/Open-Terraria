/** 近战挥击命中几何纯函数集（任务A 充能电水母族常量 + 任务B 星怒延长臂）。
 *  全部自 Terraria 1.4.5.7 反编译源逐行移植，无 DOM/引擎依赖（vitest 直测）。
 *
 *  移植源锚点：
 *   · Player.GetPointOnSwungItemPath —— Terarria1457/Terraria/Player.cs:45118-45129
 *     （1456 :44114-44123）
 *   · Player.RotatedRelativePoint —— 1457 :4209-4240（1456 :4063-4087）
 *   · Utils.LineRectangleDistance —— 1457/Terraria/Utils.cs:837-848（1456 :805）
 *   · Utils.Between —— Utils.cs:1806-1813；Vector2.ClosestPointOnLine —— Utils.cs:1964-1980
 *   · ItemCheck_ApplyUseStyle 的 useStyle1 挥转角公式 —— 1457 :51292 起、普通武器支
 *     rot = (anim/max−0.5)·(−dir)·3.5 − dir·0.3 在 ：51476（displaydoll/claw 同式
 *     :51304/:51328）；1456 :49921 起、普通支 ：50100。
 */

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** NPCID.Sets.ZappingJellyfish（Terarria1457/Terraria.ID/NPCID.cs:4460
 *  `Factory.CreateBoolSet(63,64,103,242)`）：充能电水母族——潜伏期
 *  dontTakeDamage=true（专家 ai[1]==1 潜伏态），被玩家近战挥中反噬玩家。 */
export const ZAPPING_JELLYFISH = new Set<number>([63, 64, 103, 242]);

/**
 * RotatedRelativePoint 直移植（Player.cs:4209-4240）：
 *   anchor = base.Bottom + (0,gfxOffY)
 *   n      = mount.PlayerOffset/2 + 4 + pushFromOriginHack
 *   shift  = (0,-n) + (0,n).RotatedBy(fullRotation)
 *   pos.Y += gfxOffY（addGfxOffY=true 支）
 *   return anchor + (pos-anchor).RotatedBy(fullRotation) + shift
 * 本仓恒定语境：fullRotation=0 / gfxOffY=0 / mountPlayerOffset=0（无重力旋转、
 * 不建模就坐挥击与坐骑手持偏移——此时 n 分量两两项抵消，函数=恒等映射）；
 * sleeping/sitting 偏移支（:4229-4239）同此语义缺席。reverseRotation/addGfxOffY/
 * pushFromOriginHack 三可选参均取原版调用点实值（false/true/0，唯一调用族未传）。 */
export function rotatedRelativePoint(
  posX: number, posY: number,
  frame: { bottomX: number; bottomY: number; fullRotation?: number;
    gfxOffY?: number; mountPlayerOffset?: number },
): Pt {
  const fr = frame.fullRotation ?? 0;
  const gfx = frame.gfxOffY ?? 0;
  const n = (frame.mountPlayerOffset ?? 0) / 2 + 4;
  // shift = (0,-n) + (0,n).RotatedBy(fr)；fr=0 时为 (0,0)，上式照写不化简
  const shx = -n * Math.sin(fr);
  const shy = -n + n * Math.cos(fr);
  const ax = frame.bottomX;
  const ay = frame.bottomY + gfx;
  const rx = posX - ax;
  const ry = posY - ay;               // (pos - anchor) 待旋
  return {
    x: ax + (rx * Math.cos(fr) - ry * Math.sin(fr)) + shx,
    y: ay + (rx * Math.sin(fr) + ry * Math.cos(fr)) + shy,
  };
}

/**
 * GetPointOnSwungItemPath 直移植（Player.cs:45118-45129）：
 *   num   = √(spriteWidth²+spriteHeight²)
 *   num2  = (direction==1 ? 1 : 0)·(π/2)；gravDir==−1 时 num2 += (π/2)·direction
 *   outwardDirection = unit(itemRotation).RotatedBy(3.926991 + num2)
 *   location = RotatedRelativePoint(itemLocation + outward·num·t·itemScale)
 * gravDir 仅 SmartSelect 口径恒 1（任务口径）：−1 支照实现备用并测试钉住。
 * 3.926991f = 反编译字面量（≈225°）。坐标系与 XNA 相同：y 向下、角以 atan2 正向。 */
export function getPointOnSwungItemPath(
  spriteWidth: number, spriteHeight: number,
  normalizedPointOnPath: number, itemScale: number,
  itemLocation: Pt, itemRotation: number, direction: number,
  gravDir = 1,
  frame?: Parameters<typeof rotatedRelativePoint>[2],
): Pt {
  const num = Math.sqrt(spriteWidth * spriteWidth + spriteHeight * spriteHeight);
  let num2 = (direction === 1 ? 1 : 0) * Math.PI / 2;
  if (gravDir === -1) num2 += Math.PI / 2 * direction;
  // unit(itemRotation).RotatedBy(φ) ≡ 角度相加后的单位向量
  const outAng = itemRotation + (3.926991 + num2);
  const reach = num * normalizedPointOnPath * itemScale;
  return rotatedRelativePoint(
    itemLocation.x + Math.cos(outAng) * reach,
    itemLocation.y + Math.sin(outAng) * reach,
    frame ?? { bottomX: itemLocation.x, bottomY: itemLocation.y },
  );
}

/**
 * Vector2.ClosestPointOnLine 直移植（Utils.cs:1964-1980）：P 在线段 AB 上的
 * 投影，t 钳 [0,1] 后回 A/B 端点——【带端点钳制】的线段最近点。 */
function closestPointOnLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): Pt {
  const vx = px - ax, vy = py - ay;
  const wx = bx - ax, wy = by - ay;
  const lenSq = wx * wx + wy * wy;
  const t = (vx * wx + vy * wy) / lenSq;
  if (t < 0) return { x: ax, y: ay };
  if (t > 1) return { x: bx, y: by };
  return { x: ax + wx * t, y: ay + wy * t };
}

/** Vector2.Between 直移植（Utils.cs:1806-1813）：四半开分量含端点闭区间判定。 */
function between(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Utils.LineRectangleDistance 直移植（Utils.cs:837-848）：
 * 线段任一端 Between(TopLeft,BottomRight) → 0；否则对矩形【四角】分别取
 * 「角到线段的最近距离」（ClosestPointOnLine 投影钳制），返回四者最小值。
 * 注意它不是对矩形边集的真实最小距——线弦穿盒而不过角时仍返回过角的近似值；
 * 原版如此，勿"修正"。星怒命中门即消费该值 ≤16f（Player.cs:44639/1456 :43617）。 */
export function lineRectangleDistance(rect: Rect, lineStart: Pt, lineEnd: Pt): number {
  const tlX = rect.x,          tlY = rect.y;
  const trX = rect.x + rect.w, trY = rect.y;
  const blX = rect.x,          blY = rect.y + rect.h;
  const brX = rect.x + rect.w, brY = rect.y + rect.h;
  if (between(lineStart.x, lineStart.y, tlX, tlY, brX, brY)
    || between(lineEnd.x, lineEnd.y, tlX, tlY, brX, brY)) return 0;
  const corners: Array<[number, number]> = [
    [tlX, tlY], [trX, trY], [blX, blY], [brX, brY],
  ];
  let best = Infinity;
  for (const [cx, cy] of corners) {
    const p = closestPointOnLine(cx, cy, lineStart.x, lineStart.y, lineEnd.x, lineEnd.y);
    const d = Math.hypot(cx - p.x, cy - p.y);   // Vector2.Distance 同式
    if (d < best) best = d;
  }
  return best;
}

/**
 * 星怒 Starfury（type 121）延长臂双探针（Player.ProcessHitAgainstNPC 内
 * 1457 :44634-44645 / 1456 :43612-43617）：
 *   GetPointOnSwungItemPath(70,70, 0f , GetAdjustedItemScale(sItem), …→ location )
 *   GetPointOnSwungItemPath(70,70, 0.9f, GetAdjustedItemScale(sItem), …→ location2)
 * flag2 = LineRectangleDistance(enemyRect, location, location2) ≤ 16f
 * sprite 尺寸常量 70×70 为反编译硬编码（与实际贴图帧无关）；itemScale =
 * GetAdjustedItemScale（1457 :42891：item.scale ×ApplyMeleeScale 手套 1.1——本仓
 * 命中盒侧同规则只吃手套档,基 scale 未建模按 1）。返回 [t=0 探针, t=0.9 探针]。
 * 本仓世界系换算见 Game.updateSwingHits 调用点注释（镜像共轭 rot→±rot）。 */
export function starfurySwingProbes(
  itemLocation: Pt, itemRotation: number, direction: number, itemScale: number,
): [Pt, Pt] {
  const a = getPointOnSwungItemPath(70, 70, 0, itemScale, itemLocation, itemRotation, direction);
  const b = getPointOnSwungItemPath(70, 70, 0.9, itemScale, itemLocation, itemRotation, direction);
  return [a, b];
}
