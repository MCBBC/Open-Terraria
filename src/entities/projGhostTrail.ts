// ★BJ219 弹幕域 Projectile.oldPos 残影族全表（2026-09-20）——BJ209（NPC 域拖影全族
// 普查刀）登记的弹幕另案。原版锚（Terarria1457；1458 对拍=DrawProj 残影区逐字节
// 等价,唯一差异 642 激光 slowMagicUse α 项不涉残影）：
//   · 记录面 = ProjectileID.Sets.TrailingMode（Terarria1457/Terraria.ID/ProjectileID.cs:385
//     全表）+ TrailCacheLength（:387 全表）+ Projectile.Update 子步循环内
//     UpdateTrails（Projectile.cs:17197-17300,mode 0-5 六式;【每子步】一段=extraUpdates
//     弹逐子步后移）。原版缺省 TrailingMode=-1 = 不记录。
//   · 绘制面 = Main.DrawProjDirect 通用残影表（Main.cs:30609-31360,num164/165/166/167/
//     168/169 参数系+逐型色/帧/锚特支）+ 专用帧残影四弹（409 剃刀台风 :32543-32561 /
//     437 吉加电矛 :32563-32586 / 385 鲨龙卷 :34867-34891 / 388 痂王幼体 :34895-34927,
//     形制与通用表同构:i 步进帧锚渐隐,并入同一参数表）。
//   · 排除面（本仓已有独立实现,勿双画——普查定谳 2026-09-20）：
//       660 天界碎裂（Arrow.draw 内联,Main.cs:30974-30980/:31363 已 1:1）/
//       94/1114 书族十份渐隐（Arrow.draw starTrail,Main.cs:35247-35317）/
//       502 喵刀 250 段链（Arrow.draw meowTrail,Main.cs:32495-32513）/
//       1047/1090 彩虹巨石 250 链+Extra_55（RollingBoulder.ts trailX 环,Main.cs:33279-33400）/
//       466/580 闪电链 Extra_33 激光链（LightningBoltProj.ts,Main.cs:34629-34700）/
//       34/16/106 弦带 shader（TrailShader FlameLash/MagicMissile/LightDisc,Main.cs:28616-28690）/
//       121-126+597+1120 宝石弦带（TrailShader RainbowRod）/
//       721/739-752 高尔夫插值尾迹（GolfBall.ts,Main.cs:31471-31512）/
//       933/1100/973 斩弧剑族（SwingArc.ts tneGhostLayers/ZenithSword mode4 环,
//         Main.cs:28136-28190/:30381-30611）。
//   · 高尔夫球通用表条目 quirk（先定谳勿"修"）：num166=0/num164=0/num165=-1 → 循环体
//     恒不执行（(num165>0&&0<num164) 与 (num165<0&&num170>0) 皆假）——表内条目为
//     死参数,真尾迹在 :31471 专用块,故本表不收 golf 球。661 同式死条目（1,0,1 → 空
//     循环;黑环在 :31362 特支）——收录但天然空循环。
//   · 1458 对拍：sed 区间 diff（Main.cs:28136-35700 两树逐行）仅 642 slowMagicUse
//     num296=proj.Opacity 一处（TurretLaser α 乘子）,残影面零变更。
//
// 本文件三件套：
//   PROJ_TRAILING_MODE / PROJ_TRAIL_CACHE_LEN —— ProjectileID.cs:385/:387 全表照录；
//   ProjGhostRing —— 记录面（mode 0-5 逐式 1:1,含 mode3 松弛 0.65/mode4 玩家位移补偿/
//     mode1 frameCounter 门）;接线在各类位移尾（原版 UpdateTrails 位序 :17198=
//     HandleMovement/Damage 之后）每子步调 record;
//   drawProjGhosts —— 绘制面通用循环（α=(end−i)/(cacheLen×1.5)（step<0 用 start−i,
//     :31331-31336）、scale=Lerp(bodyScale,gScale,i/denom)、rot=mode0 用当前本体角/
//     mode2-4 用 oldRot[i]（:31338-31342）+rotMul×(i−1)×镜像向、镜像=XOR oldSpriteDirection
//     ==−1（mode2/3/4,1001/933/1100 豁免 :31337-31341）、Zero 哨兵跳过、超环长跳过
//     （:31134 门））。
// 颜色=预乘习语（XNA AlphaBlend=预乘,rgb=贡献面/A=背景衰减面;GolfBall [G2]/npcExtraParts
// 同惯例）：aMul==1 档 source-over 单笔（globalAlpha=fade ⇒ rgb×fade+dst×(1−fade) 与
// XNA 逐项相等）;aMul<1 特支（639/640 A=127、711 A 环、684/706/710 A/=i、916 随机 127、
// 872 A×0.6、864 A/=4、833-835 A=0）双笔（黑染 cut=A 衰减 + 'lighter' add=rgb 贡献）。
// 逐型特支色（AI_156/171/173、FQW、星座、悬浮魔剑辉光）按 Projectile.cs 原式 1:1。
// 登记近似（参数面外,逐条注释锚定）：
//   ① ring dir = 记录拍 sign(vx)（原版 spriteDirection 语义的速度向子集;本仓弹域无
//      通用 spriteDirection 字段——镜像特异 id 未在活动集,偏差面登记）;
//   ② 873/976 槽色 ×格光（Main.cs:31362-31364/:31358-31361 Lighting.GetColor）未乘
//      （本仓弹域无逐槽位光采样——暗处残影偏亮的恒定偏差,登记债）;
//   ③ 864 辉光色相 whoAmI%6 项以 0 档近似（环内同色;原版随弹序异色）;
//   ④ 931 FQW 色玩家名彩蛋支（Cenx 等四人名,GetFairyQueenWeaponsColorFull switch）
//      未移植（常名不可达,色式主干 1:1）;
//   ⑤ 388 专用块 origin=(w/2,h/2)（proj 尺寸系 :34921）以帧矩形中心承载（同帧同尺寸
//      时逐值等价）。

import { tintedTex } from '../render/StringLine';
import { hslToRgb255 } from '../render/AuroraSky';

type Ctx = CanvasRenderingContext2D;
type Tex = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

// ===================== 记录面全表（ProjectileID.cs:385/:387 照录） =====================

/** ProjectileID.Sets.TrailingMode（ProjectileID.cs:385）——键=弹 id,值=记录式;
 *  缺省 -1 = 不记录（UpdateTrails 全跳）。 */
export const PROJ_TRAILING_MODE: Readonly<Record<number, number>> = {
  94: 0, 301: 0, 388: 0, 385: 0, 408: 0, 409: 0, 435: 0, 436: 0, 437: 0, 438: 0,
  452: 0, 459: 0, 462: 0, 502: 0, 503: 0, 466: 1, 532: 0, 533: 0, 573: 0, 580: 1,
  582: 0, 585: 0, 592: 0, 601: 0, 617: 0, 636: 0, 638: 0, 639: 0, 640: 0,
  424: 0, 425: 0, 426: 0, 1037: 0, 660: 0, 661: 0, 671: 2, 664: 0, 666: 0, 668: 0,
  675: 0, 680: 2, 682: 0, 684: 0, 686: 2, 700: 0, 706: 0, 709: 0, 710: 2, 711: 2,
  712: 0, 715: 2, 716: 2, 717: 2, 718: 2, 261: 0, 721: 0, 729: 2, 732: 0, 731: 0,
  739: 0, 740: 0, 741: 0, 742: 0, 743: 0, 744: 0, 745: 0, 746: 0, 747: 0, 748: 0,
  749: 0, 750: 0, 751: 0, 752: 0, 755: 2, 766: 2, 767: 2, 768: 2, 769: 2, 770: 2,
  771: 2, 811: 2, 814: 2, 822: 2, 823: 2, 824: 2, 826: 2, 827: 2, 828: 2, 829: 2,
  830: 2, 838: 2, 839: 2, 840: 2, 843: 2, 844: 2, 845: 2, 846: 2, 850: 2, 852: 2,
  853: 2, 856: 0, 857: 0, 864: 2, 873: 2, 872: 2, 833: 2, 834: 2, 835: 2, 818: 2,
  902: 0, 883: 0, 887: 0, 893: 0, 894: 0, 909: 0, 916: 2, 34: 3, 16: 3, 79: 3,
  931: 2, 933: 4, 946: 2, 964: 0, 965: 0, 977: 2, 976: 2, 973: 2, 106: 5, 85: 3,
  1001: 3, 1020: 2, 1024: 2, 1039: 2, 1026: 0, 1045: 2, 1047: 0, 1055: 0, 1089: 0,
  1090: 0, 1100: 4, 1097: 2, 1106: 3, 121: 2, 122: 2, 123: 2, 124: 2, 597: 2,
  125: 2, 126: 2, 1114: 0, 1120: 2, 563: 2,
};

/** ProjectileID.Sets.TrailCacheLength（ProjectileID.cs:387）——缺省 10。 */
export const PROJ_TRAIL_CACHE_LEN: Readonly<Record<number, number>> = {
  466: 20, 502: 25, 580: 20, 636: 20, 640: 20, 686: 20, 711: 20, 715: 20, 716: 20,
  717: 20, 718: 20, 261: 20, 721: 20, 729: 20, 731: 20, 739: 20, 740: 20, 741: 20,
  742: 20, 743: 20, 744: 20, 745: 20, 746: 20, 747: 20, 748: 20, 749: 20, 750: 20,
  751: 20, 752: 20, 766: 60, 767: 60, 768: 60, 769: 60, 770: 60, 771: 80, 814: 40,
  822: 80, 823: 80, 824: 60, 826: 60, 827: 65, 828: 60, 829: 60, 830: 80, 838: 80,
  839: 60, 840: 60, 843: 60, 844: 65, 845: 80, 846: 80, 850: 80, 852: 60, 853: 60,
  856: 2, 857: 2, 864: 60, 873: 60, 872: 120, 833: 20, 834: 20, 835: 20, 818: 20,
  883: 41, 887: 51, 893: 71, 894: 10, 909: 5, 916: 20, 34: 30, 16: 30, 79: 60,
  931: 20, 933: 60, 946: 20, 977: 30, 976: 60, 973: 20, 106: 15, 85: 60, 1001: 12,
  1020: 20, 1024: 40, 1039: 20, 1026: 10, 1045: 30, 1047: 25, 1089: 25, 1090: 10,
  1100: 60, 1097: 20, 1106: 60, 121: 30, 122: 30, 123: 30, 124: 30, 597: 30,
  125: 30, 126: 30, 1120: 20, 563: 60,
};

export function projTrailingMode(id: number): number {
  return PROJ_TRAILING_MODE[id] ?? -1;
}
export function projTrailCacheLen(id: number): number {
  return PROJ_TRAIL_CACHE_LEN[id] ?? 10;
}

// ===================== 记录面（Projectile.cs:17197-17300 逐式） =====================

/** oldPos/oldRot/oldSpriteDirection 三环 + 已填计数（原版未填槽=Vector2.Zero 哨兵,
 *  绘制/消费端跳过——本仓以 filled 计数承载同语义,世界原点 (0,0) 弹位不受误伤）。 */
export class ProjGhostRing {
  readonly cap: number;
  readonly mode: number;
  /** 扁平历史：槽 0=最新（原版 oldPos[0]）;未填槽读数=NaN（Zero 哨兵等价） */
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pr: Float64Array;   // oldRot（mode 2/3/4/5 记录）
  readonly pd: Int8Array;      // oldSpriteDirection（mode 2/3/4 记录）
  filled = 0;

  constructor(id: number) {
    this.cap = projTrailCacheLen(id);
    this.mode = projTrailingMode(id);
    this.px = new Float64Array(this.cap).fill(NaN);
    this.py = new Float64Array(this.cap).fill(NaN);
    this.pr = new Float64Array(this.cap).fill(NaN);
    this.pd = new Int8Array(this.cap);
  }

  /** 每子步位移后调（原版 UpdateTrails 位序）。isTickHead=本 tick 首子步
   *  （mode 4 玩家位移补偿只在 numUpdates==0 施加 :17283）;frameCounter=原版
   *  Projectile.frameCounter（mode 1 门 :17207,本仓 Arrow 无此字段→恒 0 档=每子步
   *  可记录,mode 1 仅 466/580（LightningBoltProj 自管）不受影响）。 */
  record(x: number, y: number, rot: number, dir: number,
    isTickHead: boolean, frameCounter = 0, playerDx = 0, playerDy = 0): void {
    const m = this.mode;
    if (m < 0) return;
    if (m === 1 && !(frameCounter === 0 || this.filled === 0)) return;   // :17207 门
    // ---- 位移链（全 mode 公共段 :17199-17201/:17210-17211/:17237-17240/...）----
    for (let i = this.cap - 1; i > 0; i--) {
      this.px[i] = this.px[i - 1]; this.py[i] = this.py[i - 1];
      if (m >= 2) { this.pr[i] = this.pr[i - 1]; this.pd[i] = this.pd[i - 1]; }
    }
    this.px[0] = x; this.py[0] = y;
    if (m === 2 || m === 3 || m === 4) {
      this.pr[0] = rot; this.pd[0] = dir;
    } else if (m === 5) {
      this.pr[0] = rot;    // mode 5：oldRot[0]=velocity.ToRotation()（:17296 调用方传）
    }
    if (this.filled < this.cap) this.filled++;
    // ---- mode 3：松弛单程（:17248-17273,amount=0.65,num26=1）----
    if (m === 3) {
      for (let i = this.cap - 1; i > 0; i--) {
        if (Number.isNaN(this.px[i])) continue;
        const dx = this.px[i - 1] - this.px[i], dy = this.py[i - 1] - this.py[i];
        if (Math.hypot(dx, dy) > 2) {
          this.px[i] += dx * 0.65; this.py[i] += dy * 0.65;
        }
        this.pr[i] = Math.atan2(dy, dx);
      }
    }
    // ---- mode 4：玩家位移补偿（:17274-17289,numUpdates==0 时旧槽 += 玩家帧位移）----
    if (m === 4 && isTickHead) {
      for (let i = 1; i < this.cap; i++) {
        if (!Number.isNaN(this.px[i])) { this.px[i] += playerDx; this.py[i] += playerDy; }
      }
    }
  }

  at(i: number): { x: number; y: number; rot: number; dir: number } | null {
    if (i < 0 || i >= this.cap || i >= this.filled) return null;   // Zero 哨兵+:31134 门
    return { x: this.px[i], y: this.py[i], rot: this.pr[i], dir: this.pd[i] };
  }
}

// ===================== 绘制面参数表（Main.cs:30609-31360 照录） =====================

/** 通用表逐型参数：start=num166/end=num164/step=num165/gScale=num167/denom=num168/
 *  rotMul=num169。缺省=表头初始化（1,8,2,1,15,0）（Main.cs:30724-30730）。
 *  动态档（459 scale×8、533 ai0 三态、1055 frame 系、388 ai0==2 长档）在
 *  drawProjGhosts 内展开。 */
interface GhostParams { start: number; end: number; step: number; gScale: number; denom: number; rotMul: number }
const P = (start: number, end: number, step: number, gScale: number, denom = 15, rotMul = 0): GhostParams =>
  ({ start, end, step, gScale, denom, rotMul });
const DEF = P(1, 8, 2, 1);

/** 通用残影表 id 全集（Main.cs:30609 长条件;golf 球 721/739-752 表内死条目不收——
 *  循环恒空,真尾迹在 :31471 专用块）。 */
export const GHOST_PARAMS: Readonly<Record<number, GhostParams>> = {
  261: P(18, 0, -2, 1.3),                          // 大地之杖滚石 :30771-30775
  408: DEF, 435: DEF, 682: DEF, 732: DEF,          // 缺省档
  424: P(1, 10, 2, 0.6), 425: P(1, 10, 2, 0.6), 426: P(1, 10, 2, 0.6),  // :30989-30992
  436: P(1, 8, 2, 0.5),                            // :30985-30988（仅 step/scale 覆写,end 留 8）
  438: P(1, 10, 2, 1),                             // :30997-31000
  452: P(1, 10, 3, 0.5),                           // :31001-31004
  459: P(1, 8, 2, 0.3),                            // 充能爆裂炮弹（end/step 动态 :31017-31024）
  454: P(1, 5, 1, 0.2),                            // :31005-31008
  462: P(1, 7, 1, 0.2),                            // :31009-31012
  503: P(1, 9, 3, 0.5),                            // 星怒 :30787-30790
  532: P(1, 10, 1, 0.7, 15, 0.2),                  // 骨头手套 :31054-31058
  533: P(1, 8, 2, 1),                              // 致命球（动态档 ai0∈[6,8] :31084-31098）
  573: DEF,                                        // 星云弹缺省档
  582: P(1, 10, 2, 0.7, 15, 0.2),                  // 机师扳手 :31036-31042
  585: P(1, 7, 1, 0.2),                            // 裁缝诅咒 :31013-31016
  592: P(1, 10, 2, 1),                             // 火星行者激光 :31094-31097
  601: P(1, 8, 1, 0.3),                            // 精门枪弹 :31090-31093
  636: P(1, 20, 3, 0.5),                           // 破晓 :31099-31102
  638: P(1, 5, 1, 1),                              // 月主子弹 :31051-31054
  639: P(1, 10, 1, 1),                             // 月主幻弓矢 :31081-31084
  640: P(1, 20, 1, 1),                             // 月主幻弓矢尾 :31077-31080
  661: P(1, 0, 1, 0.5),                            // 黑矢（死条目:1→0 空循环,黑环在 :31362 特支）
  664: P(1, 8, 2, 0.4), 666: P(1, 8, 2, 0.4), 668: P(1, 8, 2, 0.4),   // :31029-31032
  671: P(5, 0, -1, 2.6),                           // 火龙吐息 :30837-30841
  675: P(1, 5, 1, 0.4),                            // 暗师弹 :31021-31024
  680: P(1, 9, 3, 0.5),                            // 弩炮 :31085-31088
  684: P(1, 8, 1, 0.75),                           // 骑士音爆 :31025-31028
  686: P(19, 0, -3, 0.5),                          // 贝蒂火球 :30822-30827
  700: P(1, 5, 1, 2.6),                            // 僧杖二阶 :30862-30865
  706: P(9, 0, -2, 0.5),                           // 凤凰箭 :31045-31048
  709: P(1, 8, 2, 0.5),                            // 僧杖三阶副弹 :31049-31053
  710: P(9, 0, -2, 0.5),                           // 贝蒂箭 :31037-31040
  711: P(19, 0, -3, 0.5),                          // 学徒三阶弹 :30828-30833
  729: P(18, 0, -2, 1.3),                          // 超星斩 :30796-30800
  731: P(19, 0, -1, 0.5),                          // 雷弹 :30878-30881
  755: P(5, 0, -1, 2.6),                           // 蝠光 :30857-30861
  811: P(5, 0, -1, 2.6),                           // 血弹 :30842-30848
  814: P(18, 0, -1, 1),                            // 血鹦鹉螺弹 :30849-30856
  818: P(18, 0, -2, 1),                            // 白虎扑击 :30786-30790
  819: DEF,                                        // 血箭缺省档
  833: P(6, 0, -1, 1.5), 834: P(6, 0, -1, 1.5), 835: P(6, 0, -1, 1.5), // 磁暴虎 :30781-30785
  864: P(12, 0, -1, 1.4),                          // 悬浮魔剑 :30888-30892
  872: P(79, 0, -1, 1, 10),                        // 光女永恒虹 :30939-30945
  873: P(39, 0, -1, 1.4, 40),                      // 光女虹带 :30918-30923
  894: DEF, 901: DEF,                              // 宠物缺省档
  902: P(1, 10, 2, 0.7, 15, 0.2),                  // 战斗扳手 :31036-31042
  909: P(5, 0, -1, 1),                             // 岩巨石 :30766-30770
  916: P(19, 0, -1, 1.4),                          // 暗镰鞭 :30893-30898
  931: P(19, 0, -1, 0.7, 20),                      // 光女魔弹 :30924-30929
  964: P(1, 5, 1, 2.6), 965: P(1, 5, 1, 2.6),      // 微光暗影 :30866-30869
  976: P(18, 0, -3, 1.3),                          // 丛草刃弹 :30801-30806
  977: P(18, 0, -2, 1.3),                          // 村正弹 :30791-30795
  1001: P(10, 0, -2, 1.3),                         // 南瓜弹 :30807-30812
  1026: P(8, 0, -2, 0.5),                          // 藤壶弹 :30746-30750
  1037: DEF,                                       // 流星鞭流星缺省档
  1039: P(19, 0, -1, 0.7, 20),                     // 星座弹 :30936-30941
  1045: P(18, 0, -2, 1.3),                         // 月主鞭 proc :30812-30816
  1055: P(1, 8, 1, 1),                             // 骸巨石（end=frame 动态 :30728-30735）
  1097: P(19, 0, -3, 0.5),                         // 火绒狐火球 :30822-30827
  // ---- 专用帧残影四弹（形制同构并入;逐值 Main.cs:32543/:32563/:34867/:34895）----
  409: P(1, 10, 2, 0.5),                           // 剃刀台风（fade=(10−i)/15 ≡ 标准式,cacheLen=10）
  437: P(1, 10, 2, 0.2),                           // 吉加电矛（同上）
  385: P(1, 8, 2, 0.4),                            // 鲨龙卷（fade=Lerp(1,(8−i)/15,0.3) 特式→TINT 385）
  388: P(1, 2, 1, 1),                              // 痂王幼体（ai0==2→end=9 动态 :34903-34911）
};

/** 帧锚特支（Main.cs:30617-30726）+ 帧行进（916/873/976 逐槽推进 :31346-31362）。 */
export interface GhostFrameSpec {
  frameRow: 'cur' | 'zero' | 'next' | 'curHalfW' | 's976' | 'g873' | 'g916' | 'n408';
  originY?: number;      // 覆写 origin.Y（负值=自底 h+originY,如 686/711/1097 h−70）
  originX?: number | 'dirEdge';   // 'dirEdge'=W−20/20 按 spriteDirection（700/964/965）;负值=flip 条件偏移
  zeroHalfH?: boolean;   // 833-835 zero.Y+=h/2（:30703-30716）
  cellW?: number; cellH?: number;   // s976 32×18 单元
}
export const GHOST_FRAME: Readonly<Record<number, GhostFrameSpec>> = {
  503: { frameRow: 'cur', originY: 70 },             // :30643-30645
  686: { frameRow: 'cur', originY: -70 },            // originY=h−70 :30646-30648
  711: { frameRow: 'cur', originY: -70 },
  1097: { frameRow: 'cur', originY: -70 },
  438: { frameRow: 'zero' },                         // rect.Y=0 :30649-30651
  452: { frameRow: 'zero' },
  408: { frameRow: 'n408' },                         // rect.Y=num161（行+1,非帧系）:30655-30657
  636: { frameRow: 'cur', originY: 10 },             // :30658-30660
  638: { frameRow: 'cur', originY: 2 },              // :30661-30663
  639: { frameRow: 'cur', originY: 5 },              // :30664-30666
  640: { frameRow: 'cur', originY: 5 },
  710: { frameRow: 'cur', originY: 5 },
  700: { frameRow: 'cur', originX: 'dirEdge' },      // :30667-30669
  964: { frameRow: 'cur', originX: 'dirEdge' },      // :30674-30676
  965: { frameRow: 'cur', originX: 'dirEdge' },
  872: { frameRow: 'curHalfW' },                     // 半宽+右列 :30677-30679 + :30943 X+=Width
  833: { frameRow: 'cur', zeroHalfH: true, originY: -4, originX: -7 },  // :30703-30709
  834: { frameRow: 'cur', zeroHalfH: true, originY: -4, originX: -2 },  // :30710-30716
  835: { frameRow: 'cur', zeroHalfH: true, originY: -4, originX: -2 },
  864: { frameRow: 'next' },                         // value16.Y+=Height（一次,:30892）
  916: { frameRow: 'g916' },                         // 逐槽行进 H,回绕 H×frames（:31346-31349）
  873: { frameRow: 'g873' },                         // 逐槽行进 H+2,回绕 (H+2)×7（:31358-31362）
  976: { frameRow: 's976', cellW: 32, cellH: 18 },   // 32×18 单元,逐槽行进 H+2=20 回绕 140（:30804/:31355-31361）
};

// ===================== 逐型色特支（Main.cs:31141-31344 + Projectile.cs 色函数） =====================

export interface TintCtx {
  id: number;
  i: number;             // 槽序
  start: number; end: number;
  fade: number;          // 标准渐隐 (end−i)/(len×1.5)（step<0 用 start−i）
  ai0: number; ai1: number;
  timeLeft: number;
  opacity: number;       // proj.Opacity（1−alpha/255）
  bodyScale: number;
  vxLen: number;         // |velocity|（833-835 白染门）
  rng: () => number;     // 916 播种随机（seed=timeLeft LCG,循环内顺序消费）
}

/** 返回 [r,g,b] 染色（0-255）与 aMul（α 乘子=特支 A 面系数,1=A≡fade 档）。 */
export type GhostTintFn = (c: TintCtx) => { rgb: [number, number, number]; aMul: number; gScaleMul?: number } | null;

const lerpC = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const getLerp = (f0: number, f1: number, v: number) => clamp01((v - f0) / (f1 - f0));

const BLUE: [number, number, number] = [0, 0, 255];
const WHITE: [number, number, number] = [255, 255, 255];

export const GHOST_TINT: Readonly<Record<number, GhostTintFn>> = {
  // ---- 蓝染 0.5 族（:31141-31143）----
  408: () => ({ rgb: lerpC(WHITE, BLUE, 0.5), aMul: 1 }),
  435: () => ({ rgb: lerpC(WHITE, BLUE, 0.5), aMul: 1 }),
  682: (c) => ({ rgb: [127.5, 127.5 / c.i, 255], aMul: 1 }),      // 蓝染 0.5 后 G/=i（:31141+:31301-31304）
  732: () => ({ rgb: lerpC(WHITE, BLUE, 0.5), aMul: 1 }),
  731: () => ({ rgb: lerpC(WHITE, BLUE, 0.5), aMul: 1 }),
  1026: () => ({ rgb: lerpC(WHITE, BLUE, 0.5), aMul: 1 }),
  436: () => ({ rgb: lerpC(WHITE, [50, 205, 50], 0.5), aMul: 1 }),   // LimeGreen :31144-31146
  424: (c) => ({ rgb: [255, 127.5 / c.i, 127.5 / c.i], aMul: 1 / c.i }),   // 红染 0.5 后 B,G,A/=i（:31147+:31318-31322）
  425: (c) => ({ rgb: [255, 127.5 / c.i, 127.5 / c.i], aMul: 1 / c.i }),
  426: (c) => ({ rgb: [255, 127.5 / c.i, 127.5 / c.i], aMul: 1 / c.i }),
  1037: (c) => ({ rgb: [255, 127.5 / c.i, 127.5 / c.i], aMul: 1 / c.i }),  // :31148+:31323-31327
  639: () => ({ rgb: WHITE, aMul: 0.5 }),                                     // A=127 :31151-31153
  640: (c) => ({ rgb: [255 / c.i, 255, 255], aMul: 0.5 }),                    // R/=i + A=127 :31207-31210/:31154
  671: (c) => ({ rgb: lerpC(WHITE, [160, 32, 240], clamp01(c.i / c.end)), aMul: 1 }),  // 紫 grad :31155-31157
  811: (c) => ({ rgb: lerpC(WHITE, [110, 10, 30], clamp01(c.i / c.end)), aMul: 1 }),   // 绯×0.5 grad :31158-31160
  814: (c) => ({ rgb: lerpC(WHITE, [127.5, 127.5, 127.5], clamp01(c.i / c.end)), aMul: 1 }),  // 自暗 grad :31161-31163
  261: (c) => ({ rgb: lerpC(WHITE, [60, 60, 60], clamp01(c.i / c.end)), aMul: 1 }),    // 灰 grad :31164-31166
  438: (c) => ({ rgb: [255, 255 / c.i, 255 / c.i], aMul: 1 }),                // G,B/=i :31205-31208
  755: () => ({ rgb: [220, 20, 60], aMul: 1 }),                               // AI_156_GetColor=Crimson（P.cs type755 支）
  873: (c) => {                                                              // AI_171_GetColor :31212-31217
    const rgb = hslToRgb255((c.ai1 + 0.5) % 1, 1, 0.5);
    return { rgb, aMul: 0.5 * getLerp(0, 20, c.timeLeft) };   // A/=2 × timeLeft 门
  },
  931: (c) => ({ rgb: hslToRgb255((c.ai1 + 0.5) % 1, 1, 0.5), aMul: 0.5 * getLerp(0, 20, c.timeLeft) }),  // FQW(0.5) :31218-31222
  1039: (c) => ({ rgb: hslToRgb255((c.ai1 + 0.5) % 1, 1, 0.5), aMul: 0.5 * getLerp(0, 20, c.timeLeft) }), // 星座(0.5) :31223-31227
  872: (c) => {                                                              // AI_173_GetColor :31228-31236
    const h0 = hslToRgb255((c.ai1 + 0) % 1, 1, 0.5);
    const rgb: [number, number, number] = [h0[0] * 0.4, h0[1] * 0.4, h0[2] * 0.4];
    let aMul = 0.6;
    if (c.i > 80) aMul *= 0.15 * getLerp(120, 80, c.i);
    return { rgb, aMul };
  },
  864: () => {                                                               // FDMGlow A/=4 :31237-31240
    const hue = 0.66 + 0.33 * (0 / 6);                    // whoAmI%6——0 档近似（登记③）
    const h0 = hslToRgb255(hue, 0.7, 0.6);
    return { rgb: [h0[0] * 0.7, h0[1] * 0.7, h0[2] * 0.7], aMul: 0.25 };
  },
  686: (c) => {                                                              // 紫/黑两段 :31241-31252
    const t = c.i / c.start;
    const rgb = t < 0.5
      ? lerpC(WHITE, [160, 32, 240], getLerp(0, 0.5, t))
      : lerpC([160, 32, 240], [0, 0, 0], getLerp(0.5, 1, t));
    return { rgb, aMul: 1 };
  },
  1097: (c) => {                                                             // 橙红/红两段+ai1 :31253-31271
    const t = c.i / c.start;
    let rgb = t < 0.5
      ? lerpC(WHITE, [255, 69, 0], getLerp(0, 0.5, t))
      : lerpC([255, 69, 0], [255, 0, 0], getLerp(0.5, 1, t));
    let gMul: number | undefined;
    if (c.ai1 === 1) {
      rgb = lerpC(rgb, [255, 0, 0], clamp01(t * 3));
      rgb = lerpC(rgb, [0, 0, 0], getLerp(0.33, 0.66, t));
      gMul = 1.25;
    }
    return { rgb, aMul: 1, gScaleMul: gMul };
  },
  711: (c) => {                                                              // 紫/黑两段+A 环 :31272-31282
    const t = c.i / c.start;
    const rgb = t < 0.5
      ? lerpC(WHITE, [128, 0, 255], getLerp(0, 0.5, t))
      : lerpC([128, 0, 255], [0, 0, 0], getLerp(0.5, 1, t));
    const a = t < 0.5 ? 1 - 0.2941 * getLerp(0, 0.5, t) : 0.7059 + 0.2941 * getLerp(0.5, 1, t);
    return { rgb, aMul: a };
  },
  684: (c) => {                                                              // :31284-31293
    let k = 1 / c.i;
    if (c.i === 1) k /= 2;
    return { rgb: [255, 255 * k, 255 * k], aMul: k };
  },
  706: (c) => ({ rgb: [255, 255 / c.i, 255 / c.i], aMul: 1 / c.i }),         // B,G,A/=i :31294-31298
  710: (c) => ({ rgb: [255, 255 / c.i, 255 / c.i], aMul: 1 / c.i }),
  818: (c) => {                                                              // OurFavoriteColor :31299-31306
    const k = getLerp(0, 0.3, c.ai0) * getLerp(1, 0.7, c.ai0);
    const ofc: [number, number, number] = [255, 231, 69];
    return {
      rgb: [
        ofc[0] * k + (255 - ofc[0] * k) * k,
        ofc[1] * k + (255 - ofc[1] * k) * k,
        ofc[2] * k + (255 - ofc[2] * k) * k,
      ],
      aMul: 1,
    };
  },
  833: (c) => ({ rgb: WHITE, aMul: 0, gScaleMul: undefined }),               // A=0+白染×速 :31307-31314
  834: () => ({ rgb: WHITE, aMul: 0 }),
  835: () => ({ rgb: WHITE, aMul: 0 }),
  592: (c) => ({ rgb: [255 / c.i, 255 / c.i, 255], aMul: 1 }),               // R,G/=i :31315-31317
  964: (c) => ({ rgb: [0, 0, 0], aMul: 1 }),                                 // Black×Opacity（opacity 走 bodyAlpha 面）:31328-31330
  965: (c) => ({ rgb: [0, 0, 0], aMul: 1 }),
  385: (c) => ({ rgb: WHITE, aMul: (0.3 + 0.7 * (8 - c.i) / 15) / c.fade }), // Lerp(1,(8−i)/15,0.3) 折算 :34879-34883
};

// ===================== 绘制面 =====================

/** 循环参数解析（静态表+动态档展开;纯函数——单测/绘制共用）。
 *  返回 null = 该 id 不在通用表（或 step==0 死条目 → 循环体不执行）。 */
export function resolveGhostLoop(
  id: number, ai0: number, frame: number, bodyScale: number,
): { start: number; end: number; step: number; gScale: number; denom: number; rotMul: number } | null {
  const p = GHOST_PARAMS[id];
  if (!p) return null;
  let { start, end, step, gScale, denom, rotMul } = p;
  if (id === 459) {                                    // :31017-31024（scale×8 档）
    end = Math.trunc(bodyScale * 8);
    step = Math.trunc(end / 4);
    if (step < 1) step = 1;
    gScale = 0.3;
  } else if (id === 533) {                             // :31084-31098（ai0 三态）
    if (ai0 >= 6 && ai0 <= 8) {
      end = ai0 === 6 ? 8 : 4;
      step = 1;
      rotMul = ai0 !== 7 ? 0.2 : 0;
    } else {
      end = 0; step = 0;
    }
  } else if (id === 1055) {                            // :30728-30735（frame 系）
    end = frame;
    if (frame === 8) end--;
    if (frame === 9) end -= 2;
  } else if (id === 388) {                             // :34903-34911（ai0==2 长档）
    end = ai0 === 2 ? 9 : 2;
    step = 1;
  }
  if (step === 0) return null;
  return { start, end, step, gScale, denom, rotMul };
}

export interface DrawGhostOpts {
  ring: ProjGhostRing;
  id: number;
  tex: Tex | null;              // 本体贴图（projSprite 产物;调用方判空后直传）
  frames: number;               // projFrames[id]（帧矩形行高除数）
  frame: number;                // 当前帧序
  bodyW: number; bodyH: number; // 本体盒尺寸（世界 px——zeroHalfH/位置消费）
  bodyRot: number;              // 本体有效旋转（mode 0 档 ghost 角=本体角,:31333）
  bodyScale: number;            // proj.scale
  bodyAlpha: number;            // GetAlpha 承载面（drawGlobalAlpha 产物 0-1）
  ai0: number; ai1: number;
  timeLeft: number;
  opacity: number;
  vxLen: number;
  spriteDirection: number;      // 当前 spriteDirection 语义（dirEdge 锚/镜像偏移;登记①）
}

/** 通用残影绘制（Main.cs:31134-31349 循环 1:1）。在【本体之前】调用（原版残影块
 *  先于本体绘制段）。Zero 哨兵=未填槽跳过;超环长跳过（:31134）;661 死条目天然空循环。 */
export function drawProjGhosts(ctx: Ctx, o: DrawGhostOpts): void {
  const loop = resolveGhostLoop(o.id, o.ai0, o.frame, o.bodyScale);
  if (!loop || !o.tex) return;
  const { ring } = o;
  if (ring.mode < 0) return;
  const { start, end, step, gScale, denom, rotMul } = loop;
  const spec = GHOST_FRAME[o.id];
  const frames = Math.max(1, o.frames);
  const img = o.tex;
  const iw = img.width, ih = img.height;
  // ---- 帧矩形（rectangle4/value16;逐型覆写照录）----
  let sx = 0, sy = 0, sw = iw, sh = Math.floor(ih / frames);
  let ox = sw / 2, oy = sh / 2;
  if (spec) {
    switch (spec.frameRow) {
      case 'zero': sy = 0; break;
      case 'n408': sy = sh; break;
      case 'next': sy = sh * 2 >= ih ? 0 : sh * 2; break;          // Y+=Height（一次;环内第二行）
      case 'cur': sy = sh * o.frame; break;
      case 'curHalfW': sw = Math.floor(iw / 2); ox = sw / 2; sx = iw - sw; sy = sh * o.frame; break;
      case 's976': sw = 32; sh = 18; sy = 18 * o.frame; ox = 16; oy = 9; break;
      case 'g873': sh = Math.floor(ih / 7); sy = sh * o.frame; ox = sw / 2; oy = sh / 2; break;
      case 'g916': sh = Math.floor(ih / 7); sy = sh * o.frame; ox = sw / 2; oy = sh / 2; break;
    }
    if (spec.originY !== undefined) {
      oy = spec.originY < 0 ? sh + spec.originY : spec.originY;
    }
    if (spec.originX === 'dirEdge') {
      ox = o.spriteDirection === 1 ? sw - 20 : 20;
    } else if (spec.originX !== undefined && spec.originX < 0) {
      // 833-835：origin8.X −= 7/2×flipInt（flipInt=(dir&FlipHorizontally)!=0 ? 1 : 0）
      ox += spec.originX * (o.spriteDirection === -1 ? 1 : 0);
    }
  } else {
    sy = sh * o.frame;
  }
  // 916 播种随机（_tempSeededRandom.SetSeed(timeLeft)——LCG 简种,循环内顺序消费）
  let rngState = (Math.max(1, Math.abs(Math.trunc(o.timeLeft))) | 0) || 1;
  const rng = () => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) | 0;
    return ((rngState >>> 9) % 1000) / 1000;
  };
  const cacheLen = ring.cap;
  const mirrorExempt = o.id === 1001;                    // 1001/933/1100 豁免（933/1100 不在本表）
  for (let i = start; (step > 0 && i < end) || (step < 0 && i > end); i += step) {
    if (i >= cacheLen) continue;                          // :31134 环长门
    const slot = ring.at(i);
    if (!slot) continue;                                  // Zero 哨兵
    const fade = (step < 0 ? start - i : end - i) / (cacheLen * 1.5);   // :31331-31336
    // ---- 色（:31137-31330 特支链）----
    let rgb: [number, number, number] = WHITE;
    let aMul = 1;
    let gScaleEff = gScale;
    let alphaOverride = -1;                               // 916 专用 fade 替换
    const tint = GHOST_TINT[o.id];
    if (o.id === 916) {                                   // :31346-31357 整色替换
      const roll = rng();
      rgb = roll >= 2 / 3 ? [0, 0, 0]
        : lerpC([106, 90, 205], [0, 0, 0], 0.2 + 0.8 * rng());
      alphaOverride = getLerp(0, cacheLen * 0.75, step < 0 ? start - i : end - i);
    } else if (tint) {
      const t = tint({ id: o.id, i, start, end, fade, ai0: o.ai0, ai1: o.ai1,
        timeLeft: o.timeLeft, opacity: o.opacity, bodyScale: o.bodyScale,
        vxLen: o.vxLen, rng });
      if (t) { rgb = t.rgb; aMul = t.aMul; if (t.gScaleMul) gScaleEff *= t.gScaleMul; }
    }
    const fadeEff = alphaOverride >= 0 ? alphaOverride : fade;
    // ---- 姿态（:31333-31347）----
    const useOldRot = ring.mode === 2 || ring.mode === 3 || ring.mode === 4;
    const ghostFlip = useOldRot && !mirrorExempt && slot.dir === -1;   // XOR 镜像
    const flipMul = ghostFlip ? -1 : 1;
    const rot = (useOldRot ? slot.rot : o.bodyRot)
      + o.bodyRot * rotMul * (i - 1) * flipMul;
    // ---- 位置（:31330-31331 + :31351 绘制位）----
    let gx = slot.x + o.bodyW / 2;
    let gy = slot.y + o.bodyH / 2;
    if (spec?.zeroHalfH) gy += o.bodyH / 2;               // 833-835 zero.Y+=h/2
    if (o.id === 916) {                                   // NextVector2Circular(8,8) 抖动
      const aJ = rng() * Math.PI * 2, rJ = rng() * 8;
      gx += Math.cos(aJ) * rJ; gy += Math.sin(aJ) * rJ;
    }
    const scale = o.bodyScale + (gScaleEff - o.bodyScale) * (i / denom);  // Lerp(bodyScale,gScale,i/denom)
    // ---- 帧行进（916/873/976 逐槽累积推进）----
    let syI = sy;
    if (o.id === 873) {
      const rh = Math.floor(ih / 7) + 2;
      syI = (sh * o.frame + rh * (i - start + 1)) % (rh * 7);
    } else if (o.id === 916) {
      syI = (sh * (o.frame + (i - start + 1))) % (sh * frames);
    } else if (o.id === 976) {
      syI = (18 * o.frame + 20 * (i - start + 1)) % 140;
    }
    // ---- 预乘双笔（aMul==1 单笔 source-over 与 XNA 逐项相等;否则 cut+add 两笔）----
    const addGa = Math.max(0, Math.min(1, o.bodyAlpha * fadeEff));
    const cutGa = Math.max(0, Math.min(1, o.bodyAlpha * fadeEff * aMul));
    if (addGa <= 0 && cutGa <= 0) continue;
    const addTex = tintedTex(img, [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])], true);
    if (!addTex) continue;
    const drawOnce = (tex: Tex, ga: number, blend: GlobalCompositeOperation): void => {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = ga;
      ctx.globalCompositeOperation = blend;
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      if (ghostFlip) ctx.scale(-1, 1);
      ctx.drawImage(tex, sx, syI, sw, sh, -ox * scale, -oy * scale, sw * scale, sh * scale);
      ctx.restore();
    };
    if (aMul >= 0.999) {
      drawOnce(addTex, addGa, 'source-over');
    } else {
      const cutTex = tintedTex(img, [0, 0, 0], false);
      if (cutTex && cutGa > 0) drawOnce(cutTex, cutGa, 'source-over');   // A 衰减面（黑×aMul×fade）
      drawOnce(addTex, addGa, 'lighter');                                // rgb 贡献面
    }
  }
}
