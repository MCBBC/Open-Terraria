/**
 * heldProj / 手持投射物指向(渲染层;docs/weapon-proj-audit 两轮引擎级登记项)
 *
 * 原版模型锚(1.4.5.6 反编译,数值/行为以此为准):
 *  - Player.heldProj            Player.cs:1400(声明);投射物 AI 赋值 Projectile.cs
 *    :23919(aiStyle20 钻头链锯)/:29536/:34887/:41497(链枷新 AI)/:41965/:43203/
 *    :43575/:45002/:45031(aiStyle39 食人鱼/鞭族);reset Player.cs:24104
 *  - SelectedDrawnProjectile    PlayerDrawSet.cs:263-269(BoringSetup:heldProj →
 *    绘制缓存层 projectileDrawPosition,PlayerDrawLayers.cs:3152-3154/:3874/:4306)
 *  - 指向角                     AI_AdjustPlayerItemRotationToFaceProjectile
 *    Projectile.cs:21161-21191;链枷新 AI 内联同式 :41497-41504
 *    (DirectionFrom(mountedCenter).ToRotation() + proj 在左补 π —— 与 AI_Adjust
 *    按"投射物在左翻 flip"逐 case 等价,已核)
 *  - 优先序                     Main.cs:17685-17688 玩家 Update 先于投射物 AI →
 *    AI_Adjust 的 itemRotation 写覆盖 ItemCheck_ApplyUseStyle 的瞄准角
 *    (Player.cs:46708-46737)——活体投射物在场时指向胜;无活体时挥舞/瞄准原样
 *
 * ★前提修正(回源结论,勿再按"手臂指向投射物"理解本系统):
 *  1) itemRotation 的唯一可见消费者是持物贴图(DrawPlayer_27_HeldItem,
 *     PlayerDrawLayers.cs:3281/:3370/:3444),而该层有 !noUseGraphic 门(:3192)。
 *  2) 连枷/悠悠球/长枪/鞭四族全部 noUseGraphic=true(链枷 Item.cs:3321 /
 *     悠悠球 :30033 / DefaultToSpear :47648 / DefaultToWhip :47451)→ 四族的
 *     itemRotation 在原版无任何可见效果。
 *  3) 手臂不跟随 itemRotation:useStyle 5 分支只写 itemLocation 不设复合臂
 *     (Player.cs:50339-50422);复合臂仅 useStyles 7/8/9/12/13/14/15 与
 *     holdStyles 4/5/8 启用且全部定角,唯一跟随 itemRotation 的是 useStyle 13
 *     (短剑,:50443-50445)。链枷链条锚点也纯 bodyFrame 推导(GetPlayerArmPosition,
 *     Main.cs:37071-37091)。→ 本仓纸娃娃手臂烘焙在帧内无法旋转,与原版对这
 *     几族的"不转"恰好一致,非缺口。
 *  ⇒ 本仓与原版的可见交集唯一 = 食人鱼枪(item 1156 → 弹 190):1156 无
 *    noUseGraphic(Item.cs:14194-14206),useStyle 5 持物贴图照画;190 的
 *    aiStyle 39 尾部调 AI_AdjustPlayerItemRotationToFaceProjectile
 *    (Projectile.cs:26313)→ 按住期间枪口持续指向食人鱼。
 *
 * 本模块只做渲染:纯角度函数 + 帧内账本(实体 draw() 期间由 Renderer 实体循环
 * 登记,同帧 drawPlayer 消费)+ 持物 swing 覆写。不改实体行为、不碰 Game.ts。
 */
import { ITEM_DEFS } from '../data/items';
import { itemCombat, viIdFromKey } from '../data/vanillaItemCombat';

/** 账本条目:投射物中心(世界坐标)+ 原版 alpha 语义(255=隐形,0=不透明) */
export interface HeldProjSample {
  projId: number;
  cx: number;
  cy: number;
  alpha: number;
}

/** 已实装且原版存在可见消费的弹型(见头注"前提修正"):190 食人鱼枪弹。
 *  连枷/悠悠球/长枪/鞭勿加——原版不画持物,加了也无消费端。 */
const HELD_PROJ_TYPES: ReadonlySet<number> = new Set([190]);

const samplesByType = new Map<number, HeldProjSample[]>();

/** 帧首清账(Renderer 实体循环前调用;账本生命周期 = 单个渲染帧) */
export function heldProjFrameBegin(): void {
  samplesByType.clear();
}

/** 实体登记:在 Renderer 实体循环的自带 draw 分支里对每个实体调用。
 *  非目标弹型/已死实体静默跳过;坐标取碰撞盒中心(≈原版 projectile.Center)。 */
export function noteHeldProjEntity(e: unknown): void {
  const o = e as { projId?: unknown; dead?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; pAlpha?: unknown };
  if (!o || typeof o.projId !== 'number' || !HELD_PROJ_TYPES.has(o.projId)) return;
  if (o.dead === true) return;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return;
  const cx = o.x + (typeof o.w === 'number' ? o.w : 0) / 2;
  const cy = o.y + (typeof o.h === 'number' ? o.h : 0) / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  let arr = samplesByType.get(o.projId);
  if (!arr) samplesByType.set(o.projId, (arr = []));
  arr.push({ projId: o.projId, cx, cy, alpha: typeof o.pAlpha === 'number' ? o.pAlpha : 0 });
}

/** 该弹型的活体样本。多弹时取最后登记的一条(实体列表序 = 出生序,近似原版
 *  多弹共存时 Main.projectile 高槽位者最后写 heldProj 而胜出的语义) */
export function heldProjSample(projId: number): HeldProjSample | undefined {
  const arr = samplesByType.get(projId);
  return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function wrapAngle(a: number): number {
  // MathHelper.WrapAngle:规约到 (−π, π]
  const t = Math.PI * 2;
  a = (a + Math.PI) % t;
  if (a < 0) a += t;
  return a - Math.PI;
}

/**
 * AI_AdjustPlayerItemRotationToFaceProjectile(Projectile.cs:21161-21191)逐字移植。
 *
 * @returns 原版 player.itemRotation 语义值(direction=+1 基准、正=下偏;投射物
 *          在左时含隐式 π 翻转,与 :46708 瞄准角 atan2(dy*dir,dx*dir) 同约定)。
 *          null = 门拦下不更新(alpha/minSpeed)。
 */
export function heldProjItemRotation(
  mountedCx: number,
  mountedCy: number,
  projCx: number,
  projCy: number,
  opts: { gfxOffY?: number; minSpeed?: number } = {},
): number | null {
  // :21177-21178(向量取 MountedCenter − Center,y 项含 gfxOffY)
  const x = mountedCx - projCx;
  const y = mountedCy + (opts.gfxOffY ?? 0) - projCy;
  // :21183 minSpeed 门:|x|+|y| <= minSpeed 时不更新
  const minSpeed = opts.minSpeed ?? 0;
  if (minSpeed > 0 && Math.abs(x) + Math.abs(y) <= minSpeed) return null;
  // :21185-21188 投射物在玩家左侧 → flip=1(角含 π 翻转),否则 −1
  const flip = projCx < mountedCx ? 1 : -1;
  // :21189 itemRotation = Atan2(y*flip, x*flip)
  return Math.atan2(y * flip, x * flip);
}

/**
 * 世界指向角(玩家 → 投射物的 atan2,与 Game 侧 swing.aim 同约定)。
 * 本仓持物绘制在镜像空间:局部绘制角 = facing < 0 ? π − φ : φ
 * (Renderer.drawUseItem 头注的既定换算,枪/弓/法杖路径同源)。
 * 由 heldProjItemRotation 换算:flip=−1(投射物在右)时两者相等;
 * flip=1(在左)时差 π(见头注"内联同式"核验)。
 */
export function heldProjAimWorld(
  mountedCx: number,
  mountedCy: number,
  projCx: number,
  projCy: number,
  opts: { gfxOffY?: number; minSpeed?: number } = {},
): number | null {
  const rot = heldProjItemRotation(mountedCx, mountedCy, projCx, projCy, opts);
  if (rot === null) return null;
  return projCx < mountedCx ? wrapAngle(rot - Math.PI) : rot;
}

/** applyHeldProjPointing 需要的玩家最小形状(与 drawPlayer 的 Player 同源字段) */
export interface HeldProjPlayer {
  cx: number;
  cy: number;
  inv: { heldItem(): { id: number } | null };
}

/** drawPlayer 的 swing 形状(与 Renderer.drawPlayer 参数一致) */
export interface HeldProjSwing {
  t: number;
  dur: number;
  item: number;
  useStyle?: number;
  aim?: number;
  noGraphic?: boolean;
}

/**
 * Renderer 单点接入:玩家持有"挂着活体投射物"的武器时,持物瞄准角改为指向
 * 投射物。门与覆写规则(全部回源):
 *  - 持有物不匹配 HeldItem.shoot != type(Projectile.cs:21167)→ 原样返回
 *  - 活体样本 alpha>0(:21163)→ 原样返回(淡入 ~6t 内不抢瞄准角)
 *  - 已有 swing 且非 useStyle 5(挥砍/饮用等动画)→ 原样返回:
 *    AI_Adjust 的消费族全是 useStyle 5 持物(itemfunc 全表核过),挥舞优先
 *  - noGraphic swing(短剑族)→ 原样返回(原版 noUseGraphic 不画持物)
 *  - swing 已过期(本仓 useAnimation 计满即停画持物)→ 合成一条 useStyle 5
 *    swing:渲染侧等价于 aiStyle 39 的 SetDummyItemTime(5)(Projectile.cs:26086)
 *    把 itemAnimation 钉活、持物持续可见
 * 其余情况:aim 覆写为指向角,swing 其余字段不动。
 */
export function applyHeldProjPointing<P extends HeldProjPlayer>(
  p: P,
  swing: HeldProjSwing | null,
): HeldProjSwing | null {
  const held = p.inv.heldItem();
  if (!held) return swing;
  const def = ITEM_DEFS[held.id];
  if (!def) return swing;
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid === undefined || vid < 0) return swing;
  const shoot = itemCombat(vid)?.shoot ?? 0;
  if (!HELD_PROJ_TYPES.has(shoot)) return swing;
  const s = heldProjSample(shoot);
  if (!s) return swing;
  if (s.alpha > 0) return swing;                       // :21163 alpha 门
  if (swing && (swing.noGraphic || swing.useStyle !== 5)) return swing;
  const aim = heldProjAimWorld(p.cx, p.cy, s.cx, s.cy);
  if (aim === null) return swing;
  if (swing) return { ...swing, aim };
  // SetDummyItemTime(5) 的渲染侧等价:t=dur=1(useStyle 5 分支不消费 pAnim)
  return { t: 1, dur: 1, item: held.id, useStyle: 5, aim };
}
