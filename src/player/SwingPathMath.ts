/** 近战挥击命中几何纯函数集（任务A 充能电水母族常量 + 任务B 火之大剑延长臂）。
 *  全部自 Terraria 1.4.5.7 反编译源逐行移植，无 DOM/引擎依赖（vitest 直测）。
 *
 *  ★勘误[J1]（蓝队复核 2026-08-30）：历史注释与函数名里的"星怒"系武器身份错挂——
 *   原版探针门是 `type == 121` = 火之大剑 FieryGreatsword（游戏内显示名 Volcano；
 *   Terarria1457/Terraria.ID/ItemID.cs:1788；官方改名映射 en-US.Items.json:491
 *   "FieryGreatsword":"Volcano"），真正的星怒 Starfury=65（ItemID.cs:1676）。
 *   行为面无错：仓内 swingVid===121 与原版 type==121 是同一物品，命中集本来就对，
 *   错的只是命名与由其派生的"星怒窗口"等登记说法。函数名 starfurySwingProbes
 *   作为历史 API 名保留以免跨文件大 diff（Game.ts 调用点等），语义一律按
 *   火之大剑/Volcano 延长臂读。
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

/** 充能水母接触反噬弹幕资格（Projectile.Damage_PVE_Inner :12682：aiStyle 19/161/75/140
 *  || ProjectileID.Sets.IsAWhip || AllowsContactDamageFromJellyfish——ProjectileID.cs:39
 *  = {972,982,984,997,1043}）。IsAWhip 面由 WhipProj 全类自证免查。供弹幕/近战/鞭
 *  各命中环同构复用（最终清零补——曾仅 proj1457 私有） */
export const JELLY_ZAP_AI_STYLES = new Set<number>([19, 161, 75, 140]);
export const JELLY_ZAP_PROJ_IDS = new Set<number>([972, 982, 984, 997, 1043]);
export function jellyZapProjectile(projId: number, aiStyle?: number): boolean {
  return (aiStyle !== undefined && JELLY_ZAP_AI_STYLES.has(aiStyle))
    || JELLY_ZAP_PROJ_IDS.has(projId);
}

/**
 * RotatedRelativePoint 直移植（Player.cs:4209-4240）：
 *   anchor = base.Bottom + (0,gfxOffY)
 *   n      = mount.PlayerOffset/2 + 4 + pushFromOriginHack
 *   shift  = (0,-n) + (0,n).RotatedBy(fullRotation)
 *   pos.Y += gfxOffY（addGfxOffY=true 支）
 *   return anchor + (pos-anchor).RotatedBy(fullRotation) + shift
 * sleeping/sitting 偏移支（:4229-4239）语义缺席（本仓 Player.rotatedRelativePoint
 * 的同款登记——两态与线锚消费互斥）。reverseRotation/addGfxOffY/pushFromOriginHack
 * 三可选参均取原版调用点实值（false/true/0，唯一调用族未传）。
 * ★[N1] RESOLVED（2026-08-30 对齐清零批）：gfxOffY / mount.PlayerOffset 不再按 0 近似
 * ——本仓 Player 已有非零 gfxOffY 写面（Entities/Player.ts:565 声明、:5683 挂绳跳变
 * 置位、:5693 衰减）与非零 anchorPlayerOffset（Player.ts:5738-5741，矿车 8/10 +
 * vanilla-mounts.json playerYOffsets 帧），Game.updateSwingHits 的消费点已把这两个
 * 实际字段经 frame 参传入（见 starfurySwingProbes 调用点），坐骑/重力旋转面全部落进
 * RotatedRelativePoint 结构本身而非调用点近似。itemLocation.Y 侧的 ApplyUseStyle
 * `+ mountOffset` 支 = HeightOffsetHitboxCenter（Player.cs:3237-3250：mount.Active →
 * mount.PlayerOffsetHitbox = −PlayerOffset + data.heightBoost，Mount.cs:424-431；
 * 折叠凳 → HeightBoost−VisualYOffset）由 Game 侧按本仓坐标闭式承载（推导见其注释：
 * 本仓骑乘不改玩家盒 ⇒ 原式 ≡ itemLocationY−playerOffset）。 */
export function rotatedRelativePoint(
  posX: number, posY: number,
  frame: { bottomX: number; bottomY: number; fullRotation?: number;
    gfxOffY?: number; mountPlayerOffset?: number },
): Pt {
  const fr = frame.fullRotation ?? 0;
  const gfx = frame.gfxOffY ?? 0;
  // ★R2-09（蓝队二轮）：vanilla `int num2 = mount.PlayerOffset / 2 + 4;`
  // （Player.cs:4221，1456 :4071 同式）——PlayerOffset 为 int 字段，int/int 除法
  // 【朝零截断】。负偏移（奇数）时 Math.floor 形（如 −7/2 → −4）与原版截断
  // （−3）分叉；统一 trunc 形与 entities/Player.ts:5804 同站点一致。
  const n = Math.trunc((frame.mountPlayerOffset ?? 0) / 2) + 4;
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
 * 原版如此，勿"修正"。火之大剑(type121)命中门消费该值 ≤16f
 * （1457 Player.cs:44638-44639 / 1456 :43616-43617）。
 * ★[N2] RESOLVED（2026-08-30 对齐清零批）：原版敌盒为 Rectangle((int)nPC.position.X,
 * (int)nPC.position.Y, …)（:44631 整数截断），调用侧已改传截断盒（Game.updateSwingHits
 * 的 vanRect 助手），本函数保持纯几何语义——入参必须是已截断矩形。 */
export function intRect(x: number, y: number, w: number, h: number): Rect {
  // C# Rectangle((int)x,(int)y,w,h)：坐标截断朝零（非 floor；负半轴 −2.5→−2 与 JS
  // Math.floor 的 −3 不同）。原版所有命中相交都经此构造：
  //   近战敌盒 :44631 / 捕虫小动物盒 :45089 / 掉落物 :44301 等同式。
  return { x: Math.trunc(x), y: Math.trunc(y), w, h };
}

/** C# Rectangle.Intersects 等价（IntXna：lhs.X < rhs.Right && rhs.X < lhs.Right …，
 * 左闭右开——边界相触 = 不相交）。两侧入参须先过 intRect 截断。 */
export function rectIntersects(
  a: Rect, b: Rect,
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * ★[N5] 挥击三段分档闭式（ItemCheck_ApplyUseStyle / ItemCheck_GetMeleeHitbox /
 * PlayerDrawLayer bodyFrame 三处共用判定）：
 *   晚收段 tail：`(double)itemAnimation < (double)itemAnimationMax * 0.333`
 *     （1457 Player.cs:45526 命中盒缩支 / :51294 持位段 / :36596 bodyFrame 行3）
 *   早挥段 head：`!(itemAnimation < itemAnimationMax * 0.666)` 即 anim ≥ max·0.666
 *     （:45536 double 取反写法 / :36596 族对称档）
 * C# 以【双精度浮点阈值】比较而非有理数三分之一——JS number 同为 IEEE754 double，
 * `anim < max * 0.333` 位级同构，直接照抄即为"精确离散档边界闭式"；整数形式：
 *   tail ⟺ anim ≤ ⌈max·0.333⌉−1（若 max·0.333 恰为整数则 anim < 该整数）
 *   head ⟺ anim ≥ ⌈max·0.666⌉
 * max 可整除 3 的 ±1 帧分档抖动源：anim=max/3 时 pAnim==1/3，旧式 `pAnim≤1/3`
 * 把它误入 tail（0.333 < 1/3 严格小，vanilla 判中段）；anim=max·2/3 时 pAnim==2/3，
 * 旧式 `pAnim>2/3` 把它误留中段（vanilla 判早挥段）。本函数为唯一权威口径，
 * Game.updateSwingHits 与 Renderer.useStyleBodyRow/drawUseItem 共表统一至此。 */
export type MeleeThird = 'head' | 'mid' | 'tail';
export function meleeThirdOf(itemAnimation: number, itemAnimationMax: number): MeleeThird {
  if (itemAnimation < itemAnimationMax * 0.333) return 'tail';    // cs:45526/:36596
  if (!(itemAnimation < itemAnimationMax * 0.666)) return 'head'; // cs:45536 双重否定原文形
  return 'mid';
}
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
 * 火之大剑 Fiery Greatsword（type 121，游戏内名 Volcano）延长臂双探针
 * （Player.ProcessHitAgainstNPC 内 `if (type == 121)` 支：1457 :44634-44639 /
 * 1456 :43612-43617。★[J1] 函数名沿用历史误挂"starfury*"为零 churn，见文件头勘误）：
 *   GetPointOnSwungItemPath(70,70, 0f , GetAdjustedItemScale(sItem), …→ location )
 *   GetPointOnSwungItemPath(70,70, 0.9f, GetAdjustedItemScale(sItem), …→ location2)
 * flag2 = LineRectangleDistance(enemyRect, location, location2) ≤ 16f
 * sprite 尺寸常量 70×70 为反编译硬编码字面量——恰与该物贴图 70×70 一致
 * （vanilla.json items['121'] iw/ih 自证；真·星怒 Starfury(65) 贴图只有 42×42，
 * 两尺寸可作身份误挂的物证）。原版此处不读 sItem.spriteWidth，勿改成动态尺寸。
 * itemScale = GetAdjustedItemScale（1457 :42891 → ApplyMeleeScale :42901：
 * melee 且手套档 ×1.1）。
 * ★[C7] RESOLVED（红队 R3 2026-08-30）：item 121 基 scale=1f
 * （src/data/vanilla-itemcombat.json "scale":1，item-stats-golden-1457 闸门背书）
 * ⇒ 本仓调用侧传 meleeScaleGlove?1.1:1 即精确闭式复刻，早批登记的
 * "泰坦手套下探针短 10%"偏离担忧作废、不再挂账。
 * 返回 [t=0 探针, t=0.9 探针]。本仓世界系换算见 Game.updateSwingHits 调用点注释
 * （镜像共轭 rot→±rot）。 */
export function starfurySwingProbes(
  itemLocation: Pt, itemRotation: number, direction: number, itemScale: number,
  frame?: Parameters<typeof rotatedRelativePoint>[2],
): [Pt, Pt] {
  const a = getPointOnSwungItemPath(70, 70, 0, itemScale, itemLocation, itemRotation, direction, 1, frame);
  const b = getPointOnSwungItemPath(70, 70, 0.9, itemScale, itemLocation, itemRotation, direction, 1, frame);
  return [a, b];
}
