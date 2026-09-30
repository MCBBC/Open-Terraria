// 爬藤怪法杖 3014 → 弹 482「诅咒焰之墙」（BJ286 用户实报「弹幕效果错误」定谳刀）。
// 原版锚（Terarria1457，1458 同域 diff=same——Item.cs case 3014 :27877-27893 零数值变更）：
//   · 发射侧 = Player.cs:49084-49141 ItemCheck_Shoot 3014 专支 → computeClingerWallSpawn
//     （本文件纯函数，钉值单测 tests/bj286-clinger-staff-wall.test.ts）：
//       ① pointPosition3 = Main.MouseWorld 经 LimitPointToPlayerReachableArea
//         （Player.cs:45832-45870：CenteredRectangle(玩家中心, MaxWorldViewSize=1920×1200
//         Main.cs:758) → ClampToWorldBorders（WorldUtils.GetWorldPlayArea=世界边界内缩
//         640px + Utils.Clamp 定尺寸平移钳）→ 从钳后矩形中心【径向缩放】钳点）；
//       ② pointPosition 自玩家中心沿 (num4,num5)=归一(MouseWorld−pointPosition)×shootSpeed
//         逐步推进（:49093-49103）：Collision.CanHitLine(玩家盒→1×1 点) 为真才步进，
//         步进后与 pointPosition3 距 <20+|vx|+|vy| → 吸附 pointPosition3 收束——净效果 =
//         鼠标可达 → 墙落鼠标列；视线被挡 → 墙落遮挡点；
//       ③ 竖扫（:49105-49135）：以推进点图格列为墙柱，向下扫 ≤30 格找实心/平台/380
//         （PlanterBox）定墙底 num159=底行×16（中途停在非三者行=扫满 30/世界底 → flag7
//         整支不发射）；向上扫 ≤30 格定自由跨度 num161=num159−num160，钳 240px（16×15）；
//       ④ NewProjectile(X 吸附格左缘, mpy, 0,0, 482, Damage, KnockBack, i, ai0=num160,
//         ai1=num161)（:49136-49140）。
//   · SetDefaults（Projectile.cs:5574-5586）：w16×h200（h 每 tick 被 ai[1] 重写）、
//     aiStyle=87、friendly、tileCollide=false、penetrate=-1、alpha=255、ignoreWater=true、
//     timeLeft=18000（5 分钟——「墙常驻直到被新墙顶替」的原文语义）、magic=true、
//     usesIDStaticNPCImmunity=true + idStaticNPCHitCooldown=10（全场同型一张 10t 静态表）。
//   · AI_087（Projectile.cs:32471-32503）：position.Y=ai[0]、height=ai[1]（每 tick 重写）；
//     direction=墙心在玩家左/右侧 ±1、velocity.X=direction×1E-06（纯朝向载体）；
//     同主同型在场且 timeLeft 更大者存活——旧墙自 Kill（单主同时仅一面墙）；
//     尘量 = width×height×0.0045（:32495-32496 浮点条件 (float)num742<num741 →
//     ceil(16×240×0.0045)=ceil(17.28)=18/tick；★BJ291 定谳——trunc 是数学误读），
//     尘 75 CursedTorch
//     （NewDust(·,0,0,100) 内掷 → 75 族特例 vy 重掷/vx×0.3/scale×0.7 → AI 后置：
//     noGravity、velocity×0.5、velocity.Y-=0.5、scale=1.4、position+=(6,-2)）。
//   · 命中面：StatusNPC buff39 CursedInferno 420t（:11674，数据面 vanilla-projstatus.json
//     482 行已就位，dealContacts→applyProjStatus 自动承载）；对蠕形 aiStyle 6/37 目标
//     dmg/=2（:12983，int 除——经 dealContacts damageAdj 尾参注入，序在 DamageVar 后、
//     banner/暴击翻倍前 = 原文序）；usesIDStaticNPCImmunity ⇒ 免疫梯首支真（penetrate=-1）
//     ⇒ 命中写 immune[owner]=0（本仓 hitPierce=-2 等价档，SporeGasCloud 判例同式）。
//   · 视觉 = 纯尘（alpha=255 ⇒ GetAlpha 默认支 (255-alpha)/255 全透明，贴图 Projectile_482
//     原版常驻不画）；本仓 draw 空实现 = 同相（非缺料）。
// 湿段定谳：ignoreWater=true（SetDefaults :5582）→ 通用湿段整段豁免（ChainsawProj 445
// 激光钻同判）；且 AI_087 无位移面（velocity=1E-06 级、无 UpdatePosition 语义）→ 无湿阻尼
// 观察面。本类不接 projWetSection（原版同构非债）。
// MP 备案：netProjBroadcast 3014 支以 kind0 静态傀儡重建（贴图本就不画）→ 访客侧尘效
// 缺省（与现网所有 dust-only 弹同档），登记债 BJ286-MP。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { dealContacts, ID_STATIC_482_TABLE } from './proj1457';
// ★BJ383 小动物命中面 + 幽灵兜帽吸血 proc（BJ381 登记债清偿;482=proj1457 dealContacts
//  第 12 调用方——「其余 11 个」含本文件）
// ★清偿刀 R1 D1（2026-09-30）：ghostHurt 幽灵伤害头同构补面（BJ420 登记债五弹之末）
import { hitCritters } from './projTargets';
import { ghostHealProc, ghostHurtOnHit, playerHasGhostHurt } from './SpectreSoulProj';
import { vanillaNpc } from '../data/vanillaNpcs';
import { PLATFORMS_SHEETS } from '../data/tiles';
import { limitPointToPlayerReachableArea } from './PlayerReachableArea';   // ★BJ290 件3 单源化

/** :12983 蠕形 aiStyle 集（6=蠕虫族 Devourer/EoW/Destroyer；37=134-136 Hungry 族） */
const WORM_HALF_AI_STYLES = new Set([6, 37]);

/** :12983 dmg/=2（int 除，正数域=floor）——DamageVar 后、banner/暴击前 */
function halveWormDamage(ent: unknown, dmg: number): number {
  const vid = (ent as { vanillaId?: number }).vanillaId ?? 0;
  const ai = vid > 0 ? vanillaNpc(vid)?.aiStyle : undefined;
  return ai !== undefined && WORM_HALF_AI_STYLES.has(ai) ? Math.trunc(dmg / 2) : dmg;
}

/** TileID.Sets.Platforms || type==380（PlanterBox）——发射侧向下扫描的停行集（:49113） */
const CLINGER_WALL_STOP_SHEETS = new Set<number>([...PLATFORMS_SHEETS, 380]);

export interface ClingerWallScan {
  /** 原版 Main.MouseWorld（未钳） */
  mouse: { x: number; y: number };
  playerCenter: { x: number; y: number };
  playerBox: { x: number; y: number; w: number; h: number };
  facing: number;
  shootSpeed: number;
  /** 世界像素尺寸（Main.rightWorld/bottomWorld 等价） */
  worldPx: { w: number; h: number };
  /** Collision.CanHitLine（Physics.LineOfSight.canHit 单源） */
  canHitLine: (x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number) => boolean;
  /** WorldGen.SolidTile */
  isSolid: (tx: number, ty: number) => boolean;
  /** 原版 sheet 域查表（平台/380 停行判定用） */
  sheetAt: (tx: number, ty: number) => number;
}

export interface ClingerWallSpawn {
  /** NewProjectile 盒左上 X（=墙柱格左缘） */
  x: number;
  /** NewProjectile 盒左上 Y（原文传推进点 Y——首拍 AI 被 ai[0] 覆写，怪癖照录） */
  y: number;
  /** ai[0] 墙顶 Y */
  topY: number;
  /** ai[1] 墙高（≤240；负值=原版退化怪癖照录 → 空转无尘无命中） */
  hpx: number;
  /** flag7：30 格内无底（实心/平台/380 皆无）→ 整支不发射 */
  noFloor: boolean;
}

/** 发射侧几何全量（Player.cs:49084-49141 1:1——含 LimitPointToPlayerReachableArea /
 *  推进吸附 / 竖扫三段；纯函数无随机、无副作用，钉值单测锚） */
export function computeClingerWallSpawn(s: ClingerWallScan): ClingerWallSpawn {
  // ---- ① LimitPointToPlayerReachableArea（Player.cs:45832-45870） ----
  // ★BJ290 件3（2026-09-23,普-U1 单源化）：内联 clampSeq 退役改指单源
  // ./PlayerReachableArea——定尺寸平移钳（Utils.cs:236-239 盒恒 1920×1200 只平移）
  // + Utils.Clamp<T> 判序统一（:223-231 先 max 后 min;旧 clampSeq min 先判,
  // 退化域 (max,min) 带取 min=反向,★BJ286② 定谳）。单源另补 CenteredRectangle
  // 截断（Utils.cs:961-963=(int)(c−960),整型玩家心无差,分数心=原版语义归位）。
  const [reachX, reachY] = limitPointToPlayerReachableArea(
    s.mouse.x, s.mouse.y, s.playerCenter.x, s.playerCenter.y, s.worldPx.w, s.worldPx.h,
  );                                                       // pointPosition3
  // ---- ② 速度步与推进吸附（:47681-47707 零向量支 + :49093-49103） ----
  const ppx0 = s.playerCenter.x, ppy0 = s.playerCenter.y;
  const ddx = s.mouse.x - ppx0, ddy = s.mouse.y - ppy0;
  let num4: number, num5: number;
  if ((Number.isNaN(ddx) && Number.isNaN(ddy)) || (ddx === 0 && ddy === 0)) {
    num4 = s.facing * s.shootSpeed; num5 = 0;
  } else {
    const dl = Math.hypot(ddx, ddy);
    num4 = ddx / dl * s.shootSpeed; num5 = ddy / dl * s.shootSpeed;
  }
  let mpx = ppx0, mpy = ppy0;
  for (;;) {
    if (!s.canHitLine(s.playerBox.x, s.playerBox.y, s.playerBox.w, s.playerBox.h, mpx, mpy, 1, 1)) break;
    mpx += num4; mpy += num5;
    if (Math.hypot(mpx - reachX, mpy - reachY) < 20 + Math.abs(num4) + Math.abs(num5)) {
      mpx = reachX; mpy = reachY;
      break;
    }
    // ★BJ286-MARCH-BOUND（登记债）：可达钳点可偏离射线上方（矩形平移钳后中心≠玩家心,
    // 径向钳保方向基于矩形心）→ 护栏 20+|vx|+|vy| 恒不触发。原版此象限由 CanHitLine
    // 出界终止——但 vanilla Collision.CanHit 对出界目标做 tile 钳制（Collision.cs:403-412）
    // 后出界面退化为恒可视,推进环实为依赖实现细节;本仓 canHit 同钳制语义 = 无界环
    // （实机自旋已由钉值桩复现）。以世界边界为硬终止（出界即断,出界点保留——扫描列
    // 落界外 → noFloor 整支不发射,确定性收敛）。
    if (mpx < 0 || mpy < 0 || mpx > s.worldPx.w || mpy > s.worldPx.h) break;
  }
  // ---- ③ 竖扫（:49105-49135） ----
  const tileX = Math.trunc(mpx / 16);
  let row = Math.trunc(mpy / 16);
  const startRow = row;
  // 向下：条件序 = 行界 < maxTilesY−10 → 30 格窗 → 非实心；体内查平台/380 停行
  for (; row < s.worldPx.h / 16 - 10 && row - startRow < 30 && !s.isSolid(tileX, row); row++) {
    if (CLINGER_WALL_STOP_SHEETS.has(s.sheetAt(tileX, row))) break;
  }
  const noFloor = !s.isSolid(tileX, row) && !CLINGER_WALL_STOP_SHEETS.has(s.sheetAt(tileX, row));
  const bottomY = row * 16;                                   // num159
  // 向上：>10 行界 → 30 格窗 → 非实心
  let row2 = startRow;
  while (row2 > 10 && startRow - row2 < 30 && !s.isSolid(tileX, row2)) row2--;
  let hpx = bottomY - (row2 * 16 + 16);                       // num161 = num159 − num160
  if (hpx > 16 * 15) hpx = 16 * 15;                           // num162=15 钳 240px
  const topY = bottomY - hpx;                                 // num160 = num159 − num161
  return { x: Math.trunc(mpx / 16) * 16, y: mpy, topY, hpx, noFloor };
}

export class ClingerStaffWallProj extends Entity {
  readonly projId = 482;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  /** ai[0] = 墙顶 Y（px；AI_087 每 tick 重写 position.Y） */
  private readonly wallTopY: number;
  /** ai[1] = 墙高（px；≤240 = 16×15 裁剪；负值=原版退化怪癖照录 → 空转无尘无命中） */
  private readonly wallH: number;
  /** SetDefaults timeLeft=18000（:5583）——逐 tick 递减，0 即 Kill；同主新墙在场时提前自亡
   *  （原版 Projectile.timeLeft 为 public 字段，同型比对消费端按真值读） */
  timeLeft = 18000;
  /** ★BJ383：PVE 受理命中计数（原版 Projectile.numHits :14263;proc 读自增前值;
   *  critter 受理命中亦入账——同 :14263 无条件递增） */
  pveNumHits = 0;

  constructor(x: number, y: number, wallTopY: number, wallH: number, damage: number, knockback: number) {
    super();
    // NewProjectile(pointPosition.X, pointPosition.Y, 0, 0, …, ai0=num160, ai1=num161)
    //（Player.cs:49138-49140）——y 载原文传值，首拍 AI 即被 ai[0] 覆写（同构怪癖照录）
    this.x = x; this.y = y;
    this.w = 16;            // SetDefaults :5576
    this.h = wallH;         // SetDefaults h200 → 首拍 ai[1] 重写（本仓构造即知终值，直接落位）
    this.wallTopY = wallTopY;
    this.wallH = wallH;
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // ---- AI_087（Projectile.cs:32471-32503） ----
    this.y = this.wallTopY;   // position.Y = ai[0]（:32472）
    this.h = this.wallH;      // height = (int)ai[1]（:32473）
    const dir = this.cx > game.player.cx ? 1 : -1;   // :32474-32480
    this.vx = dir * 1e-6;                            // velocity.X = direction*1E-06f（:32481）
    // 同主同型保 timeLeft 最大者（:32482-32492；原版 owner==Main.myPlayer 门 = 本地
    // 权威面，本仓单权威恒真）；粒度扫描 1000 槽 = projectiles 桶只读等价。
    // type==type 同型比对：本仓 482 友方墙唯一承载即本类（Arrow 直飞旧链已由
    // case 'magic' 3014 专支分流退役）→ instanceof 即同构
    for (const q of game.projectiles?.() ?? []) {
      if (q instanceof ClingerStaffWallProj && q !== this && !q.dead
        && q.timeLeft > this.timeLeft) {
        this.dead = true;   // Kill()（旧墙让位新墙）
        return;
      }
    }
    // timeLeft 递减（Projectile.Update 通用段）——0 即亡（18000t=5min 兜底）
    if (--this.timeLeft <= 0) { this.dead = true; return; }
    // 尘（:32493-32503）：num741 = (width*height)*0.0045f，循环条件 (float)num742 < num741
    // 为【浮点比较】→ 迭代数 = ceil(num741)（i=0..⌈n⌉−1）：h=240→ceil(17.28)=18、
    // h=16→ceil(1.152)=2、h=32→ceil(2.304)=3、负 h→0。★BJ291 定谳刀：此前 Math.trunc
    // 是数学误读（把浮点条件当整数上界）——全域每拍少一颗（h=240 时 17≠18）。
    // 可达 h 恒为 16 的倍数（竖扫两侧行界差,computeClingerWallSpawn）→ 0.072h 无整点
    // （k=1..15: 1.152k 均非整），f32 舍入不翻档,ceil 与原版浮点条件逐拍同构。
    const dustN = Math.ceil(this.w * this.h * 0.0045);
    for (let i = 0; i < dustN; i++) {
      // Dust.NewDust(position, width, height, 75, 0, 0, 100)——spawnDust 契约缺省
      // 5px 盒/±2 内掷 + 75 族特例（vy 重掷/vx×0.3/scale×0.7）在 VanillaDust.spawn 承载
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 75, 0, 0, 100, null, 1);
      if (!d) break;
      d.noGravity = true;        // :32498
      d.vx *= 0.5;               // dust2.velocity *= 0.5f（:32499——矢量乘,XY 两轴）
      d.vy *= 0.5;
      d.vy -= 0.5;               // velocity.Y -= 0.5f（:32501）
      d.scale = 1.4;             // :32502
      d.x += 6;                  // position.X += 6f（:32503）
      d.y -= 2;                  // position.Y -= 2f（:32503）
    }
    // ★BJ383 小动物命中面（BJ381 登记债清偿）：482 friendly penetrate=−1（:5579）→
    //  原版 critter 入墙照伤弹不亡（:12618 flag=!friendly;:14184 penetrate>0 才递减）;
    //  受理命中入 numHits 账（:14263 无条件;critter lifeMax=5 经 flag10 lifeMax>5 段
    //  恒不吸血——只入账不 proc）。critter 一击即死 ⇒ IDStatic 10t 窗语义无可观测差。
    if (hitCritters(this, game)) this.pveNumHits++;
    // 命中面：usesIDStaticNPCImmunity+10t 全场同型表（penetrate=-1 ⇒ hitPierce=-2 清窗档，
    // SporeGasCloud 判例）；damageAdj = :12983 蠕形减半（DamageVar 后/banner/暴击前）
    dealContacts(this, game, ID_STATIC_482_TABLE, 10, (t) => {
      // ★BJ383 幽灵兜帽吸血 proc（:13877-79 Damage() 通用 on-hit 段;482 magic :5585）
      //  ——proc 先于 :14263 numHits++（读自增前值）;拒收不 proc 不计数。
      ghostHealProc(game, this.projId, this.pveNumHits,
        t as never as Parameters<typeof ghostHealProc>[3]);
      // ★清偿刀 R1 D1（2026-09-30）幽灵伤害头 ghostHurt（Projectile.cs:13881 调用点/
      //  :12021 方法体,SpectreSoulProj 单源零改动复用;BJ420 1115/1116 同构）——
      //  482 数据面 magic（SetDefaults :5574-5588 `magic = true` :5585）+ 幽灵面具
      //  套装 → 受害者 Center 放浮魂 356。受理面 = dealContacts 内环免疫门
      //  （:12635/:12600 收编,在 onHit 前拒）⇒ 到达本位即 flag10 块可达面。
      if (playerHasGhostHurt(game.player)) {
        const v420 = t as never as { vanillaId?: number | null; lastStrikeDealt?: number;
          maxHp?: number; def?: { lifeMax?: number } };
        ghostHurtOnHit(game,
          { magic: true, projDamage: this.damage,
            projX: this.x, projY: this.y, projW: this.w, projH: this.h,
            ownerCx: game.player.cx, ownerCy: game.player.cy },
          { x: t.x, y: t.y, w: t.w, h: t.h,
            cx: t.x + t.w / 2, cy: t.y + t.h / 2,
            vanillaId: v420.vanillaId,
            lifeMax: v420.maxHp ?? v420.def?.lifeMax,
            dealt: v420.lastStrikeDealt ?? 0 });
      }
      this.pveNumHits++;
    }, undefined, -2, false, halveWormDamage);
  }

  /** 原版 alpha=255 → GetAlpha 默认支全透明（Projectile.cs:80595 GetAlpha 尾默认
   *  (255-alpha)/255 乘）——贴图 Projectile_482.png 常驻不画，视觉全靠 AI 尘。空实现=1:1。 */
  draw(_r: Renderer, _cam: Camera): void { /* 纯尘视觉，无贴图绘制面 */ }
}
