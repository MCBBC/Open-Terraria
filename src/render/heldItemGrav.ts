/**
 * SW-FX31 波 3：反重力（gravDir=-1）持物域纯公式层。
 *
 * 原版模型（1457 反编译，数值/行为唯一标杆）：
 *  - FlipItemLocationAndRotationForGravity（Player.cs:52281-52290）：
 *      gravDir==-1 → itemRotation = -itemRotation;
 *                    itemLocation.Y = Bottom.Y + (position.Y - itemLocation.Y)
 *    即对「自玩家顶 p.y 起算的持物 Y 偏移 offY」做关于玩家盒竖直中心的镜像：
 *    offY' = h - offY（2·p.y + h - (p.y + offY) - p.y = h - offY），旋转取反。
 *    8 个显式调用位 = holdStyle 4/5/6/8（:51154/:51170/:51184/:51196）与
 *    useStyle 8/12/14/15（:51901/:51946/:51991/:52008）；另有 8 处内联同式分支：
 *    useStyle 1/7/9/6/2/11/3/4（:51478/:51497/:51528/:51553/:51595/:51649/
 *    :51683/:51709）与 holdStyle 1/2 双支（:51070/:51091/:51110）——
 *    useStyle 5/13 与 holdStyle 3【无】翻转支（us5 锚=MountedCenter 域天然
 *    重力中性、us13 复合臂持位居中；hs3 itemLocation 锚 MountedCenter 同理）。
 *    holdStyle 1 特例：930（ 泡沫机）镜像后 itemLocation.Y -= 24（:51073-51077）。
 *  - itemEffect（PlayerDrawSet.cs:1722/:1727）：gravDir==-1 时
 *    itemEffect = FlipVertically（direction==1）| FlipHorizontally|FlipVertically
 *    （direction==-1）——持物【贴图】竖直镜像无条件随 gravDir（含 us5/13）。
 *  - 绘制 origin 翻转（PlayerDrawLayers.cs:3269-3271）：
 *      if (gravDir == -1f) origin.Y = rectangle.Height - origin.Y
 *    仓内绘制以「贴图顶左角放置位 drawOY（缺省 -fh=底左角锚）」表达，语义换算
 *    origin.Y = -drawOY → 翻转后放置位 = -(H - origin.Y) = -drawOY - H。
 *  - Main.DrawPlayerItemPos(gravdir, itemtype)（Main.cs:3357-3692）：useStyle 5
 *    枪/弓握把 per-item dy 逐项 `±N * gravdir` —— gravDir=-1 时 dy 反号。
 *  - GetTargetTileWithReverseGravity（Player.cs:52962-52970）：Dirt Rod 目标格
 *    Y 换算带 gravDir==-1 反演支（screenPosition.Y + screenHeight - mouseY）；
 *    仓内由 FX27 的 Camera.screenToWorld（flipY 门，Main.cs:2835-2842 MouseWorld
 *    逆变换）统一承载，本模块仅提供公式镜像供测试对拍。
 *
 * ★gd=1 逐位恒等铁律：本模块全部函数在 gravDir=1 时返回输入原值（无翻转支可达），
 *   消费端以 gravDir===-1 门控，普通重力零基线差。
 */

/** 需要应用 FlipItemLocationAndRotationForGravity 的 useStyle 集。
 *  排除 5（枪/弓/杖瞄准持位，:51745-51801 无翻转支且分支尾 `!=5065 return`）
 *  与 13（短剑复合臂，:51806-51820 无翻转支）。 */
export function useStyleFlipsForGravity(useStyle: number): boolean {
  return useStyle !== 5 && useStyle !== 13;
}

/** 需要应用翻转的 holdStyle 集（:51070 hs1 / :51091+:51110 hs2 双支 / FlipItem
 *  :51154 hs4 / :51170 hs5 / :51184 hs6 / :51196 hs8）。hs3（:51115-51121）与
 *  hs7（无持位支）无翻转。 */
export function holdStyleFlipsForGravity(holdStyle: number): boolean {
  return holdStyle === 1 || holdStyle === 2 || holdStyle === 4
    || holdStyle === 5 || holdStyle === 6 || holdStyle === 8;
}

/**
 * FlipItemLocationAndRotationForGravity（Player.cs:52281）仓内参数域换算。
 * @param offY 持物锚 Y（自玩家盒顶 p.y 起算，≙ vanilla itemLocation.Y - position.Y）
 * @param rot  绘制旋转（≙ vanilla itemRotation，镜像空间等价角）
 * @param h    玩家碰撞盒高（player.height）
 * @param gravDir 1 普通重力（恒等返回）/ -1 倒挂
 */
export function flipItemLocationAndRotationForGravity(
  offY: number, rot: number, h: number, gravDir: 1 | -1,
): { offY: number; rot: number } {
  if (gravDir !== -1) return { offY, rot };
  // itemRotation = 0f - itemRotation（:52284）
  // itemLocation.Y = Bottom.Y + (position.Y - itemLocation.Y)（:52286-52287）
  //   ⇒ p.y + offY' = (p.y + h) + (p.y - (p.y + offY)) ⇒ offY' = h - offY
  return { offY: h - offY, rot: -rot };
}

/**
 * 持物绘制 origin 翻转后的「贴图顶左角放置位 Y」（PlayerDrawLayers.cs:3269-3271）。
 * 仓内 drawOY 为 vanilla origin.Y 的反号（贴图顶左相对锚点放置位）：
 *   翻转后放置位 = -(H - origin.Y) = -(H + drawOY)。
 * gd=1 恒等返回 drawOY（翻转支不可达——与消费端 gravDir 门双保险）。
 */
export function heldItemOriginFlipY(drawOY: number, frameH: number, gravDir: 1 | -1): number {
  if (gravDir !== -1) return drawOY;
  return -drawOY - frameH;
}

/**
 * Main.DrawPlayerItemPos(gravdir, itemtype) 的 dy 分量 gravDir 因子
 * （Main.cs:3366-3690 逐项 `±N * gravdir`；result.Y = H/2 + dy）。
 * gd=1 恒等。
 */
export function drawPlayerItemPosDy(dy: number, gravDir: 1 | -1): number {
  return dy * gravDir;
}

/**
 * GetTargetTileWithReverseGravity（Player.cs:52962-52970）Y 换算公式镜像。
 * 原式：普通 `(int)(mouseY + screenPosition.Y)/16`；gravDir==-1 支
 * `(int)(screenPosition.Y + screenHeight - mouseY)/16`（★整型除法截断序：
 * 先对整个和取 (int) 再 /16）。仓内 FX27 后由 Camera.screenToWorld(flipY 门)
 * 统一承载（worldTopY = 屏顶世界 Y、worldScaleH = 屏高世界比例、rawY = 裸鼠标
 * 世界比例屏 Y），本函数为该式的一比一镜像（测试对拍用，不进运行时热路径）。
 */
export function reverseGravityTargetTileY(
  worldTopY: number, worldScaleH: number, rawMouseYWorldScale: number, gravDir: 1 | -1,
): number {
  const y = gravDir === -1
    ? worldTopY + worldScaleH - rawMouseYWorldScale
    : worldTopY + rawMouseYWorldScale;
  return Math.trunc(Math.trunc(y) / 16);
}
