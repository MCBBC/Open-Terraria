// ============================================================================
// 高尔夫球实体 1:1 —— Projectile.cs AI_149_GolfBall(:18924-18970) +
// GolfHelper.cs 全量公式 + Terraria.Physics/BallCollision.cs 步进（world/golf/golfPhysics.ts）。
// 行号注释对准 仓库外基准树(game/ 的兄弟目录)Terarria1456/
//   SetDefaults 721/739-752  :7344-7352  7×7、aiStyle 149、tileCollide=false、penetrate -1
//   AI_149_GolfBall           :18924-18970
//     · timeLeft<10 → 10（球永不消失）      :18926-18929
//     · ai[1]==-1（球座待发）→ 脚下非 494 转 0 :18931-18941
//     · StepGolfBall + Resting 伤害清零      :18943-18952
//     · 旋转 = 角速度 + 空中滚动补偿        :18956-18960
//   GolfHelper:
//     · ClubProperties/ShotStrength  :14-30
//     · PointsNeededForLevel1-3      :267-271（Golfer 商店/台词门槛常量）
//     · PhysicsProperties(0.3,0.99)  :273
//     · StepGolfBall                 :279-282
//     · FindVectorOnOval             :284-291
//     · CalculateShotStrength        :293-302 / :318-341（蓄力=(光标-球心)/300）
//     · IsPlayerHoldingClub          :304-316
//     · GetClubProperties            :348-371
//     · IsGolfBallResting            :400-407
//     · ValidateShot                 :423-449（角度钳 [-87.12°,0°] + 站位盒）
//     · HitGolfBall                  :451-474（材质阻尼 + ai[1] + RecordSwing）
//   GetGolfTrailColor                :10533-10550（球色表；1458 = Projectile.cs:11154-11174,
//   DrawProjDirect 动球支 = Main.cs:31459-31515 / 通用本体 = :31578）
// ============================================================================
// ★通用湿段接入（2026-09-06 溅花缺口杂项批）：高尔夫球 721/739-752 走 SetDefaults
// 共档 :7628-7637（netImportant/7×7/friendly/penetrate −1/aiStyle149/tileCollide
// false）【无 ignoreWater 行】→ 受段（vanilla-projectiles.json 同向;任务侧旧记
// "607-609 豁免"系 id 误记——606 ScutlixLaser/607 SolarFlareRay/608 SolarCounter 才在
// 豁免集,球体真实域=721/739-752 全受段）。AI_149 无湿旗消费（:20447-20545 grep 实证
// ——球体物理 StepGolfBall/BallCollision 不读 wet）→ 入/出水溅花+旗维护即全部效果。
// ★阻尼 N/A 定谳：IsAGolfBall ∈ UpdatePosition 早退表（:20551-20552
// `ProjectileID.Sets.IsAGolfBall[type]` → return）= 位移全由 AI_149 直写,
// wetVelocity 位移行永不消费 → 位移不折减。
import { Entity } from './Entity';
import { projSprite } from './Arrow';
import { projectileWetSection } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { TILE_DEFS } from '../data/tiles';
import {
  BallState, stepGolfBall, clubDampenVelocity, golfMapFromStore,
  type GolfTileMap,
} from '../world/golf/golfPhysics';
import type { GolfState } from '../world/golf/GolfState';
import { tintedTex } from '../render/StringLine';

/** oldPos 环长（ProjectileID.Sets.TrailCacheLength[721/739-752] = 20，ProjectileID.cs:387）
 *  ——Resting 弱判定读尾槽（GolfHelper.cs:404）；渲染支只另读 [4]（Main.cs:31507） */
export const GOLF_TRAIL_CACHE_LEN = 20;

/** 高尔夫宿主（Game 注入：LocalGolfState + 进洞结算回调 = GolfHelper.PutBallInCup） */
export interface GolfHost {
  /** Main.LocalGolfState（GolfState.cs 1:1） */
  state: GolfState;
  /** 本地玩家解析（proj.owner == Main.myPlayer 判定，PutBallInCup :88）。
   *  取函数：换世界会重建 Player 实例，须动态解析 */
  playerRef(): unknown;
  /** 进洞结算（GolfHelper.PutBallInCup :86-115：计分/公告/电路/杀球） */
  onCupCapture(ball: GolfBall, tileX: number, tileY: number): void;
}

export class GolfBall extends Entity {
  /** Game 启动时注入（球体 AI 经此读写 GolfState 与结算链） */
  static host: GolfHost | null = null;

  /** SetDefaults :7350-7351（width=height=7） */
  override w = 7; override h = 7;
  /** 球色变体（投射物 id：721 泥球 / 739-752 染色球） */
  projId: number;
  /** ai[1]：击杆数；-1 = 球座待发态（NewProjectile 末参，Player.cs:31881/48916） */
  swings = 0;
  // ---- ★通用湿段旗（ProjWetFlags 同形;projectileWetSection 共享体逐值维护）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步折减） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调自做） */
  presetDone = false;
  /** localAI[0]：角速度 */
  angular = 0;
  /** localAI[1]：BallState（Resting=0/Moving=1）——GolfState.getLastHitBall 的跟踪门 */
  ballState: BallState = BallState.Resting;
  /** 渲染旋转累加（Projectile.rotation，AI_149 :18956-18960） */
  rotation = 0;
  /** oldPos 渲染窗（DrawProjDirect 高尔夫支读 oldPos[4]——Main.cs:31503；Update
   *  尾随平移 Projectile.cs:17200-17203 每 tick 1 格，SetDefaults :7636 无
   *  extraUpdates ⇒ 不多步。5 槽 = 未满不画插值尾迹(:31503 Zero 门) */
  private posHist: Array<{ x: number; y: number }> = [];
  /** IsGolfBallResting 弱判定窗（GolfHelper.cs:400-407）：oldPos 实长 =
   *  TrailCacheLength[721/739-752] = 20（ProjectileID.cs:387），尾槽 = 20 tick 前
   *  位置——与渲染窗（只用 [4]）分用独立环。未满时尾槽为 Zero，世界坐标距离恒
   *  >1px ⇒ 视同未静（与原版零槽等价） */
  private restHist: Array<{ x: number; y: number }> = [];
  owner: () => unknown;

  constructor(cx: number, cy: number, projId: number, owner: () => unknown, onTee = false) {
    super();
    // NewProjectProject 语义：入参为中心 → position = center - size/2（Projectile.cs:15162 一带）
    this.x = cx - this.w / 2; this.y = cy - this.h / 2;
    this.projId = projId;
    this.owner = owner;
    this.swings = onTee ? -1 : 0;      // ai[1] 初值（球座放置传 -1）
  }

  /** 本地玩家的球（proj.owner == Main.myPlayer，PutBallInCup :88 计分门） */
  get isMine(): boolean {
    const host = GolfBall.host;
    return !!host && this.owner() === host.playerRef();
  }

  /** IsGolfBallResting（GolfHelper.cs:400-407）：
   *   localAI[1]==0 → 真（(:402) 强支，本作 ballState 直存枚举）；
   *   Moving 态弱支（:404）：Distance(position, oldPos[尾]) < 1px 才算静球——
   *  滚动末段 <1px/20tick 爬行时按静球处理（尾迹消失 + 瞄准白圈提前亮）。 */
  get atRest(): boolean {
    if (this.ballState === BallState.Resting) return true;
    const h = this.restHist;
    if (h.length >= GOLF_TRAIL_CACHE_LEN) {
      const o = h[h.length - GOLF_TRAIL_CACHE_LEN];
      return Math.hypot(this.x - o.x, this.y - o.y) < 1;   // Vector2.Distance < 1f
    }
    return false;                                          // 尾槽 Zero ⇒ 恒 >1px
  }

  get moving(): boolean { return this.ballState !== BallState.Resting; }

  /** HitGolfBall（GolfHelper.cs:451-474）：材质阻尼 + ai[1] 累加 + RecordSwing。
   *  belowTileType：球底+1px 所在格的 tile id（null = 空气，不阻尼） */
  clubHit(vx: number, vy: number, rough: number, belowTileType: number | null): void {
    const d = clubDampenVelocity(vx, vy, rough, belowTileType);   // :453-461
    this.vx = d.vx; this.vy = d.vy;                                // :462
    // timeLeft = 18000（:465）——本作球体不自然消亡，语义恒成立
    if (this.swings < 0) this.swings = 0;                          // :466-469
    this.swings += 1;                                              // :470
    this.ballState = BallState.Moving;                             // localAI[1] = 1（:471）
    GolfBall.host?.state.recordSwing(this);                        // :472
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // ---- ai[1] == -1：球座待发（AI_149 :18931-18941）----
    if (this.swings === -1) {
      // Framing.GetTileSafely(base.Bottom.ToTileCoordinates())（:18933）——
      // Entity.Bottom = (x+w/2, y+h)（Entity.cs:122-131）→ 中心X/底边Y 取格
      const btx = Math.floor((this.x + this.w / 2) / TILE);
      const bty = Math.floor((this.y + this.h) / TILE);
      const active = st.inBounds(btx, bty) && st.flags[st.idx(btx, bty)] !== 0;
      const isTee = active && TILE_DEFS[st.type[st.idx(btx, bty)]]?.vanilla?.sheet === 494;
      if (!isTee) this.swings = 0;              // !tile.active() || type != 494（:18936-18938）
      // ★湿段照跑（原版 AI_149 球座支 :18931-18941 早退在 AI 内,湿段在其后 :16903
      //  无 active/分支门——球座待发球静置水中仍维护旗/溅花）
      projectileWetSection(this, game, st, this.x, this.y, this.w, this.h,
        this.projId, !!projectileData(this.projId)?.ignoreWater);
      return;                                   // :18941（本帧不做物理）
    }
    // ---- 物理步进（AI_149 :18943 + BallCollision.Step）----
    // 原版 PutBallInCup 内 proj.Kill()（:114）使后续子步重入变为无害空操作
    //（ShouldScoreHole 已被 ResetScoreTime 关闭）；这里以 capturedOnce 防止重复回调
    let capturedOnce = false;
    const hooks = GolfBall.host
      ? {
        onCupCapture: (tx: number, ty: number) => {
          if (capturedOnce) return;
          capturedOnce = true;
          // PutBallInCup（GolfHelper.cs:86-115）：计分门在宿主内，杀球在此
          GolfBall.host!.onCupCapture(this, tx, ty);
          this.dead = true;                     // proj.Kill()（:114）
        },
      }
      : undefined;
    const map: GolfTileMap = golfMapFromStore(st);
    const state = stepGolfBall(this, map, hooks);
    if (state === BallState.OutOfBounds) { this.dead = true; return; }  // 出界杀球
    this.ballState = state;                     // localAI[1] = State（:18951）
    // 旋转（:18956-18960）：rotation += 角速度；空中（vy!=0 且 Moving）再补 vx/vy×0.1
    this.rotation += this.angular;
    if (this.vy !== 0 && state === BallState.Moving) {
      this.rotation += this.vx * 0.1 + this.vy * 0.1;
    }
    // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    // 位序 = AI_149(:20447,含 StepGolfBall 物理直写位)→湿段(:16903)→HandleMovement
    // (:17120,tileCollide=false 无位移)→UpdatePosition(:20551 IsAGolfBall 早退表 →
    // 阻尼 N/A,见头注)。采样位=AI 物理结算后位 = 原版湿段同位
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // oldPos 平移缓存（Projectile.cs:17200-17203 每 Update 尾随平移 1 格，
    // SetDefaults :7636 无 extraUpdates ⇒ 每 tick 恰 1 次）：渲染窗(posHist,
    // DrawProjDirect :31503 读 oldPos[4])+Resting 弱判定窗(restHist,尾槽
    // =TrailCacheLength 20,GolfHelper.cs:404) 同源双环
    const pos = { x: this.x, y: this.y };
    this.posHist.push(pos);
    if (this.posHist.length > 5) this.posHist.shift();
    this.restHist.push(pos);
    if (this.restHist.length > GOLF_TRAIL_CACHE_LEN) this.restHist.shift();
  }

  /** 绘制保真（2026-08-31 平涂扫描批 → 2026-09-01 层序+乘色修正批[G1/G2]）：
   *  高尔夫球贴图在盘（Projectile_721/739..752.png 均 8×8 实图）。原版动球支
   *  （Main.cs:31494 !IsGolfBallResting 门，色 :31496）先画——插值尾迹(:31503
   *  oldPos[4]≠Zero 门，:31508 发射)f=0..1 步 .04 共 26 发 + 本体染色复刻
   *  scale×1.5(:31511)，通用主本体（color48=GetAlpha :31532，发射 :31578）在支后
   *  无条件补画盖顶 ⇒ 叠层恒为
   *  「尾迹垫底 / ×1.5 彩晕居中 / 本体最顶」（[G1] 旧实现反序先本体后彩晕 =
   *  层级倒置，滚动球面发"脆"、彩色晕染被本体压没，已修为原版流序）。
   *  乘色面（[G2]）：原版实体 pass = BlendState.AlphaBlend 预乘混合，画色 C 的
   *  效果 =「加色贡献 贴图.rgb×C.rgb ＋ 背景衰减 ×(1−C.A)」（StringLine.ts 头注
   *  口径）——RGB 色调用 globalAlpha 单通道复现不了（16 色表 rgb 分量曾整链丢失，
   *  740 蓝/748 红晕成苍白 wash）。修法 = 仓内现成 multiply+destination-in 助手
   *  tintedTex（StringLine.ts:120，texReady 半加载窗守卫）预烘两张**静态缓存**
   *  副本：cut=[0,0,0] 保形黑背板走 source-over @q·f（A 衰减面，α 数值与旧实现
   *  一致），add=[色表 rgb] 保形染走 'lighter' @k·f（色值面：速度因子只进 rgb
   *  通道——原版 C'=golfTrailColor×k·f 四通道同乘，预乘式里 rgb 面不吃表 A）；
   *  贴图自身像素 alpha 经 destination-in 保留,加色面连 AA 边缘的贴图 α 也逐项
   *  相等。本体（:31578 GetAlpha(light)，α 缺省 0 ⇒ 全亮原色）不动。
   *  node 单测无 document / 贴图半加载窗拒烘时退回 globalAlpha 兜底（同几何同
   *  A 面,仅缺乘色下帧自愈）；停杆瞄准 GolfBallOutline 叠层(:31569 持杆可打门)
   *  归 Game 瞄准 UI 域,登记不接。 */
  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
    if (!ctx) return;
    // GetGolfTrailColor（Projectile.cs:11154-11174）—— 球色按投射物 id(A 支=衰减面)
    const colors: Record<number, [number, number, number, number]> = {
      739: [50, 50, 50, 80], 740: [30, 50, 255, 40], 741: [150, 90, 60, 90], 742: [30, 255, 170, 30],
      743: [30, 255, 30, 40], 744: [190, 255, 30, 50], 745: [255, 130, 30, 50], 746: [255, 50, 110, 50],
      747: [130, 10, 200, 40], 748: [255, 30, 50, 50], 749: [100, 180, 255, 30], 750: [50, 240, 160, 30],
      751: [220, 80, 220, 70], 752: [255, 180, 50, 30],
    };
    const c = colors[this.projId] ?? [160, 160, 255, 50];   // 721 默认(:11173)
    const img = projSprite(this.projId);
    if (!img || !(img.width > 0)) return;                   // 懒加载未就绪(下帧自愈)
    const sz = img.width;                                   // 8×8(proj.scale 缺省 1)
    // ---- [G2] 预烘乘色副本（两键均静态缓存于 tintedTex WeakMap,零逐帧重烘）----
    const addTex = tintedTex(img, [c[0], c[1], c[2]], false);  // 加色贡献面(色表 rgb)
    const cutTex = tintedTex(img, [0, 0, 0], false);           // 黑背板=A 衰减面载体
    const hasTint = !!addTex && !!cutTex;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (!this.atRest) {
      // ---- 动球追加链（!IsGolfBallResting 门,GolfHelper.cs:400-407）----
      const k = Math.min(1, Math.hypot(this.vx, this.vy) / 16);   // num188(:31477)
      const q = k * (c[3] / 255);                              // A 面=衰减系数
      /** 一处落点双通道：f=null=本体染色复刻档（色不带 f 因子,:31511）。
       *  cut@q·f 与旧实现 globalAlpha 数值全同 = alpha 面一致；'lighter' 补上
       *  加色贡献=P.rgb×C.rgb×P.a×k·f,与预乘混合最终式逐项相等。 */
      const put = (ix: number, iy: number, sp: number, f: number | null): void => {
        if (hasTint && cutTex && addTex) {
          ctx.save();                                          // pass1 背景 A 衰减
          ctx.translate(ix, iy);
          ctx.rotate(this.rotation);
          ctx.globalAlpha = Math.max(0, Math.min(1, q * (f ?? 1)));
          ctx.drawImage(cutTex, -sp / 2, -sp / 2, sp, sp);
          ctx.restore();
          ctx.save();                                          // pass2 rgb 加色贡献
          ctx.translate(ix, iy);
          ctx.rotate(this.rotation);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, Math.min(1, k * (f ?? 1)));
          ctx.drawImage(addTex, -sp / 2, -sp / 2, sp, sp);
          ctx.restore();
        } else {
          // 兜底（node 无 DOM/半加载窗）：legacy 单笔——A 面保留,乘色缺失备案
          ctx.save();
          ctx.translate(ix, iy);
          ctx.rotate(this.rotation);
          ctx.globalAlpha = Math.max(0, Math.min(1, q * (f ?? 1)));
          ctx.drawImage(img, -sp / 2, -sp / 2, sp, sp);
          ctx.restore();
        }
      };
      // 插值尾迹（:31503 oldPos[4]≠Zero 门 ⇔ 轨迹窗满,:31508 发射）——先画垫底
      if (this.posHist.length >= 5) {
        const o = this.posHist[0];               // oldest ≈ oldPos[4](每 tick 平移一格)
        for (let n = 0; n <= 25; n++) {
          const f = n / 25;                      // 等价 f+=0.04 浮点序列
          const ix = o.x + (this.x - o.x) * f + this.w / 2;   // Lerp+Size/2
          const iy = o.y + (this.y - o.y) * f + this.h / 2;
          put(ix, iy, sz * (0.7 + 0.8 * f), f);  // scale=Lerp(.7,1.5,f)(:31508)
        }
      }
      put(this.cx, this.cy, sz * 1.5, null);     // 本体染色复刻 ×1.5(:31511)
    }
    // ---- 无条件本体最后画盖顶（Main.cs:31578 通用支,[G1] 层序终点）----
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.drawImage(img, -sz / 2, -sz / 2);
    ctx.restore();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 击球公式（GolfHelper.cs）
// ---------------------------------------------------------------------------

/** 杆型属性（GetClubProperties :348-371：min/max 为椭圆半径 + RoughLandResistance；
 *  材质等级同属性——IsPlayerHoldingClub :304-316：4039 / 4092-4094 / 4587-4598） */
export interface ClubProps { minX: number; minY: number; maxX: number; maxY: number; rough: number }
const CLUB_IRON: ClubProps = { minX: 0.25, minY: 0.25, maxX: 1.0, maxY: 1.0, rough: 0 };
const CLUB_PUTTER: ClubProps = { minX: 0, minY: 0, maxX: 0.25, maxY: 0.25, rough: 0 };
const CLUB_WEDGE: ClubProps = { minX: 0.25, minY: 0.25, maxX: 0.65, maxY: 1.5, rough: 1 };
const CLUB_DRIVER: ClubProps = { minX: 0.25, minY: 0.25, maxX: 1.5, maxY: 0.65, rough: 0 };
export const GOLF_CLUBS: Record<number, ClubProps> = {
  4039: CLUB_IRON, 4092: CLUB_PUTTER, 4093: CLUB_WEDGE, 4094: CLUB_DRIVER,
  4587: CLUB_IRON, 4591: CLUB_IRON, 4595: CLUB_IRON,           // 石/秘银/钛金铁杆
  4588: CLUB_PUTTER, 4592: CLUB_PUTTER, 4596: CLUB_PUTTER,     // 锈铁/铅/发光蘑菇推杆
  4589: CLUB_WEDGE, 4593: CLUB_WEDGE, 4597: CLUB_WEDGE,        // 青铜/金/钻石挖起杆
  4590: CLUB_DRIVER, 4594: CLUB_DRIVER, 4598: CLUB_DRIVER,     // 木/珍珠木/叶绿木杆
};

/** FindVectorOnOval（:276-291）：normalize(v/r)×r 的模 */
function ovalLen(vx: number, vy: number, rx: number, ry: number): number {
  if (rx === 0 || ry === 0) return 0; // 推杆下限 (0,0)：C# v/0=NaN 比较恒假 → 下限不生效
  const nx = vx / rx, ny = vy / ry;
  const nl = Math.hypot(nx, ny) || 1;
  return Math.hypot((nx / nl) * rx, (ny / nl) * ry);
}

/** CalculateShotStrength（:293-302/:318-341）：
 *  shotVector=(光标-球心)/300 → 角度钳（ValidateShot :431-439）→ 椭圆钳 → ×32。
 *  返回 {vx, vy, rel}（rel=力度条 0..1，:300）。 */
export function golfShot(
  mouseX: number, mouseY: number, ball: { cx: number; cy: number }, club: ClubProps,
): { vx: number; vy: number; rel: number } {
  let dx = mouseX - ball.cx, dy = mouseY - ball.cy;
  // 角度钳：rot>0 → 0（水平）；rot<-1.5207964(≈-87.12°) → 钳下限（不能向下打）
  let ang = Math.atan2(dy, dx);
  if (ang > 0) ang = 0;
  if (ang < -1.5207964) ang = -1.5207964;
  const len = Math.hypot(dx, dy);
  dx = Math.cos(ang) * len; dy = Math.sin(ang) * len;
  const sx = dx / 300, sy = dy / 300;
  const value = Math.hypot(sx, sy);
  const maxL = ovalLen(sx, sy, club.maxX, club.maxY);
  const minL = ovalLen(sx, sy, club.minX, club.minY);
  const L = Math.max(minL, Math.min(value, maxL));
  const rel = Math.max((maxL > minL ? (L - minL) / (maxL - minL) : 1), 0.001);
  const speed = L * 32;
  const n = Math.hypot(sx, sy) || 1;
  return { vx: (sx / n) * speed, vy: (sy / n) * speed, rel };
}

/** ValidateShot 站位盒（:423-449）：球须在玩家脚下盒内
 *  （以玩家 Bottom 为原点、面向取反：X∈[-16,32]、Y∈[-16,16]） */
export function golfBallInStance(
  ball: { x: number; y: number; w: number; h: number },
  player: { x: number; y: number; w: number; h: number; facing: number },
): boolean {
  const flip = player.facing < 0 ? -1 : 1;
  const dx = (ball.x + ball.w / 2) - (player.x + player.w / 2);
  const dy = (ball.y + ball.h) - (player.y + player.h); // Bottom 差
  const rx = dx * flip, ry = dy;
  return rx >= -16 && rx <= 32 && ry >= -16 && ry <= 16;
}
