// 可控导弹族（Projectile aiStyle 9 = AI_009_MagicMissiles，Projectile.cs:40518-40751）
// + 老星怒天降落星（proj 9，aiStyle 5，Projectile.cs:22130-22247 + Player.cs 出生链）。
// 此前两族都被 Game.useCombatWeapon 的"兜底 mArrow"当直线弹发出去——导弹失去
// 光标操控语义、老星怒失去天降语义。本文件 1:1 移植两族行为层。
//
// ── 成员（SetDefaults 实测，aiStyle 全部 = 9，:22676-22680 分派）─────────────
//   16 魔法飞弹   item 113 Magic Missile（:714-724）   32×32 alpha100 light0.8
//                 magic ignoreWater；penetrate 缺省 1（命中即灭）
//   34 Flamelash  item 218（:902-912）                 32×32 penetrate2 light0.8 magic
//                 usesLocalNPCImmunity / localNPCHitCooldown=12；6 帧动画 Main.cs:8403
//   79 彩虹魔杖弹 item 495 Rainbow Rod（:1322-1333）   32×32 penetrate3 light0.8 magic
//                 同 34 免疫档 + ignoreWater
//   ★ 任务清单里的 579/753/1262 经核对【不是】本族：579=Drax（钻镐，shoot 107）、
//     753=Seaweed（海龟宠物链，buffType 42，shoot 127=aiStyle 26 宠物）、
//     1262=ChlorophyteJackhammer（shoot 252=aiStyle 20 手持钻头，:23837-23942）。
//     aiStyle 20 是钻头/链锯挂手 AI（:23837），28 是直线风动物理族（:24866）——
//     都不是光标导弹，本实体只接管 aiStyle 9（同族还有 491 Flying Knife，走
//     AI_009_MagicMissiles_Old :40753 回旋语义，另案登记）。
//
// ── 操控语义（AI_009_MagicMissiles 逐段）──────────────────────────────────
//   channel 期间 ai[0]/ai[1] = 光标点（:40560-40574），amount=1 的 Lerp（:40654）
//   → 速度直接对齐 normalize(目标−中心)×min(32, 距离)——转向是【瞬时】的；
//   "转向速率"只作用于视觉 rotation：AngleTowards(速度角, π/4/tick)（:40678-40681）。
//   近距 <64px 改为衰减盘旋：vel×0.3 + (目标−中心)×0.3（:40657-40660）。
//   松手（:40575-40593）：FindTargetWithLineOfSight（:42972-42999：800px 内最近
//   CanBeChasedBy(NPC.cs:91070-91082) NPC + Collision.CanHit 视线 + 免疫表空）→
//   ai[1]=NPC 槽位追踪（amount 公式 :40620-40623 恒收敛 0.2，逐字保留）；无目标 →
//   速度归一 32 直飞（<2 时取 DirectionFrom(玩家)），timeLeft 钳 300（:40667-40676）。
//   持按连发：原版 item.channel 武器每 useAnimation 循环重用一次（pendingItemReuse
//   Player.cs:42143-42147 → ItemCheck_TryStartUse :51182-51196 每拍扣 mana）——
//   每循环【一发】新弹，由最新存活弹独占驱动（否则 N 弹会指数增殖）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { projSprite, projFrameImg, projFrameCount } from './Arrow';
import { applyProjStatus } from './projStatus';
import { noteVanillaProjImmune, applyBannerDamageDealt } from './projTargets';
import { projectileSnapStrikeBonus } from '../stats/SnapStrike';
import { ghostHurtOnHit, playerHasGhostHurt } from './SpectreSoulProj';
// RainbowRodHit 编排本体（收编池;L5 批 2026-08-31——79 命中/Kill 爆本地直生 +
// broadcast 上行同用此函数）
import { rainbowRodHitFx } from '../fx/orchestraFx';
import { ParticleOrchestraType } from '../net/syncModules';
import { hitCritters, hitTownNpcs, playerCanHitEnemy } from './projTargets';
import { canHit } from '../physics/LineOfSight';
import { projectileData } from '../data/vanillaProjectiles';

// ===================== 数学原语（逐字对源码） =====================

/**
 * Player.LimitPointToPlayerReachableArea（Player.cs:45830-45858，2026-08-31 台账清偿）
 * ——光标点钳进"玩家可达区"：以玩家中心为心、Main.MaxWorldViewSize(1920×1200,
 * Main.cs:754-758) 的矩形经 WorldUtils.ClampToWorldBorders（:26-33 = Utils.Clamp 到
 * GetWorldPlayArea(:18-24)——世界四边各留 640px 缓冲）裁剪后的盒；盒外点沿中心射线
 * 等比回拉到盒面（X/Y 各取更紧的半宽比例，方向不变、距离归界）。
 * 消费位：AI_009_MagicMissiles_Old :44247-44249（491 飞刀）与 AI_009_MagicMissiles
 * :44045-44046（16/34/79 新导弹族）都在算距离前先钳。★本批按台账只接飞刀（A6），
 * 新导弹族接线登记为遗漏判定（各自 fixture 相对几何依赖大世界,见台账同日注）。
 */
export function limitPointToPlayerReachableArea(
  px: number, py: number, pcx: number, pcy: number, worldWPx: number, worldHPx: number,
): [number, number] {
  // worldRect = CenteredRectangle(Center, MaxWorldViewSize)（左上=心−Size/2）
  // ∩ GetWorldPlayArea()（世界边框 px 域 0..W/H 内缩 640）——Utils.Clamp 矩形
  // 相交语义：贴边玩家处盒被裁小、Center 随之位移,num4/num6 用【裁后】半宽/高。
  const pl = 640, pt = 640, pr = Math.max(pl, worldWPx - 640), pb = Math.max(pt, worldHPx - 640);
  const l = Math.max(pcx - 960, pl);
  const r = Math.min(pcx + 960, pr);
  const t = Math.max(pcy - 600, pt);
  const b = Math.min(pcy + 600, pb);
  const cx = (l + r) / 2, cy = (t + b) / 2;
  const hw = Math.max((r - l) / 2, 0), hh = Math.max((b - t) / 2, 0);
  const vx = px - cx, vy = py - cy;
  const ax = Math.abs(vx), ay = Math.abs(vy);
  let k = 1;
  if (ax > hw) k = Math.min(k, hw / ax);
  if (ay > hh) k = Math.min(k, hh / ay);
  return [cx + vx * k, cy + vy * k];
}

/** Utils.GetLerpValue（Utils.cs:283-307，clamped=true）——含 from>to 倒置区间 */
function lerpValue(from: number, to: number, t: number): number {
  if (from < to) {
    if (t < from) return 0;
    if (t > to) return 1;
  } else {
    if (t < to) return 1;
    if (t > from) return 0;
  }
  return (t - from) / (to - from);
}

/** MathHelper.Lerp */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** float.AngleTowards（Utils.cs:2142-2159）：最短路径钳 maxChange/tick */
function angleTowards(cur: number, target: number, maxChange: number): number {
  let c = wrapAngle(cur);
  const t = wrapAngle(target);
  if (c < t) { if (t - c > Math.PI) c += Math.PI * 2; }
  else if (c - t > Math.PI) c -= Math.PI * 2;
  c += Math.max(-maxChange, Math.min(maxChange, t - c));
  return wrapAngle(c);
}

/** float.AngleLerp（Utils.cs:2122-2140）：最短路径 Lerp(amount) */
function angleLerp(cur: number, target: number, amount: number): number {
  let angle: number;
  if (target < cur) {
    const up = target + Math.PI * 2;
    angle = (up - cur > cur - target) ? lerp(cur, target, amount) : lerp(cur, up, amount);
  } else if (target > cur) {
    const dn = target - Math.PI * 2;
    angle = (target - cur > cur - dn) ? lerp(cur, dn, amount) : lerp(cur, target, amount);
  } else {
    return cur;
  }
  return wrapAngle(angle);
}

/** XNA Vector2.MoveTowards：整向量朝 target 最多移动 max（方向保持） */
function moveTowardsV2(cx: number, cy: number, tx: number, ty: number, max: number): [number, number] {
  const dx = tx - cx, dy = ty - cy;
  const d = Math.hypot(dx, dy);
  if (d <= max || d === 0) return [tx, ty];
  return [cx + dx / d * max, cy + dy / d * max];
}

/** hslToRgb(S=1, L=0.5) 纯色环（彩虹拖尾色相档） */
function hueToRgb(h: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  const x = 1 - Math.abs((h * 6) % 2 - 1);
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h * 6);
  if (seg === 0) { r = 1; g = x; } else if (seg === 1) { r = x; g = 1; }
  else if (seg === 2) { g = 1; b = x; } else if (seg === 3) { g = x; b = 1; }
  else if (seg === 4) { r = x; b = 1; } else { r = 1; b = x; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ===================== 可控导弹（aiStyle 9） =====================

/** 敌怪视图（CanBeChasedBy 口径，NPC.cs:91070-91082） */
interface MissileEnemyView {
  x: number; y: number; w: number; h: number; id: number;
  cx?: number; cy?: number; maxHp?: number; dead: boolean;
  def?: { friendly?: boolean; critter?: boolean; hitSound?: string[] };
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
    pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
}

/** 同族存活链：尾部 = 最新弹，独占"持按连发"循环（原版每 useAnimation 一发新弹） */
const ALIVE: MagicMissileProj[] = [];

export interface MissileCtor {
  projId: number;
  damage: number;
  knockback: number;
  /** 原版 item useTime（== useAnimation，113/218/495 三件均相等）——持按连发节奏 */
  useTime: number;
  /** channel 电平（按住 && 同物品在手 && 未被 UI 挡） */
  channelCb: () => boolean;
  /** 光标世界坐标（Main.MouseWorld，:40566） */
  aimCb: () => { x: number; y: number };
  /** 每循环扣魔（ItemCheck_ActuallyPayMana :51190）——失败则本循环不发新弹 */
  payMana: () => boolean;
  /** 生成同族新弹（Game 侧闭包：枪口位 + 当前瞄准向 × shootSpeed） */
  fireExtra?: () => void;
}

export class MagicMissileProj extends Entity {
  projId: number;
  damage: number;
  knockback: number;
  /** 绘制 scale（SetDefaults scale；16/34/79 均 1） */
  drawScale = 1;
  /** 暴击总概率（spawn 侧注入，同 mArrow 口径） */
  critChance = 0.04;
  /** 护甲穿透（N:81913 减防——spawn 注入） */
  armorPen = 0;
  /** 星云套 booster 回调（StrikeNPC :12892-12905） */
  nebulaCb: (() => void) | null = null;
  /** 弹体点光（Game 实体光扫读） */
  lightRGB: [number, number, number] | null = null;
  dead = false;

  /** ai[0] 三态：0=光标操控（≥0）/ 1=已松手（−1）/ 2=34 命中后的终段（−2） */
  private mode = 0;
  /** ai[1]：松手后的追踪目标 NPC id（−1 = 无） */
  private homingId = -1;
  /** 34 的 num3 翻页位（:40544-40549：穿透余 1 且仍在操控 → 置位） */
  private page = false;
  /** localAI[0]：发红计时（:40555-40558） */
  private redT = 0;
  /** rotation（Projectile.cs:523 初值 0；AI :40678-40685 驱动） */
  rot = 0;
  /** timeLeft（SetDefaults 默认 3600，:526） */
  timeLeft: number;
  /** 穿透（16=1 / 34=2 / 79=3；穿透弹语义同 Arrow） */
  pierce: number;
  private pierceInit: number;
  /** 34 六帧动画（:40534-40543） */
  private frame = 0;
  private frameCounter = 0;
  /** Item9 周期音（:40689-40693） */
  private soundDelay = 0;
  /** 上 tick 速度（:40686 flag3 急转判定） */
  private pvx = 0;
  private pvy = 0;
  /** 上一帧中心（34 绘制位 = oldPos[0]+Size/2−vel/2，Main.cs:32436） */
  private prevCx: number;
  private prevCy: number;
  /** 79 彩虹拖尾采样环（RainbowRodDrawer oldPos 链） */
  private trail: number[] = [];
  /** Main.GlobalTimeWrappedHourly（Main.cs:17014 游戏运行秒 %3600）——拖尾色相相位
   *  基准。★2026-08-31 台账 C1 清偿：曾用逐弹本地钟（每 tick +1/60 自起点起算），
   *  同帧发射的多弹色相恒差一个常数偏移、也和世界的 GlobalTime 不同相；改为直读
   *  共享墙钟 %3600（与本仓 Game.ts:7435 沙暴节拍的既有口径一致） */
  private globalT = (performance.now() / 1000) % 3600;
  /** Main.DiscoR/G/B（Main.cs:19441 六段 ±7/帧；79 点光 :15157-15160） */
  private discoR = 255;
  private discoG = 0;
  private discoB = 0;
  private discoStyle = 0;
  /** 同敌冷却（34/79 usesLocalNPCImmunity=12t；16 单发无需） */
  private hitCd = new Map<number, number>();
  /** 持按连发计数（useTime 拍） */
  private reuseT = 0;
  private useTime: number;
  private channelCb: () => boolean;
  private aimCb: () => { x: number; y: number };
  private payMana: () => boolean;
  private fireExtra?: () => void;

  constructor(x: number, y: number, vx: number, vy: number, o: MissileCtor) {
    super();
    const pd = projectileData(o.projId);
    this.projId = o.projId;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = o.damage;
    this.knockback = o.knockback;
    this.useTime = Math.max(1, o.useTime);
    this.channelCb = o.channelCb;
    this.aimCb = o.aimCb;
    this.payMana = o.payMana;
    this.fireExtra = o.fireExtra;
    if (pd?.width) this.w = pd.width;
    if (pd?.height) this.h = pd.height;
    this.drawScale = pd?.scale ?? 1;
    this.timeLeft = pd?.timeLeft ?? 3600;
    this.pierce = this.pierceInit = Math.max(1, pd?.penetrate ?? 1);
    this.prevCx = this.cx;
    this.prevCy = this.cy;
    ALIVE.push(this);
  }

  /** EntityManager 剔除时的兜底出链（world unload / 测试直弃） */
  destroy(): void {
    const i = ALIVE.indexOf(this);
    if (i >= 0) ALIVE.splice(i, 1);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.timeLeft <= 0) { this.killNow(game); return; }
    this.pvx = this.vx; this.pvy = this.vy;
    this.prevCx = this.cx; this.prevCy = this.cy;
    this.globalT = (performance.now() / 1000) % 3600;   // GlobalTimeWrappedHourly（Main.cs:17014）
    this.steer(game);
    if (this.dead) return;
    this.x += this.vx;
    this.y += this.vy;
    this.trail.push(this.cx, this.cy);
    if (this.trail.length > 24) this.trail.splice(0, this.trail.length - 24);
    this.hitStep(game);
  }

  /** AI_009_MagicMissiles 主体（:40518-40751） */
  private steer(game: GameHooks): void {
    const num = 32;   // :40525 最大速度
    // ---- type 34：帧动画 + 翻页/发红计时（:40534-40558）----
    if (this.projId === 34) {
      if (++this.frameCounter >= 4) {
        this.frameCounter = 0;
        this.frame = (this.frame + 1) % projFrameCount(34);
      }
      if (this.pierce === 1 && this.mode === 0 && !this.page) this.page = true;    // :40544-40549
      if (this.pierce === 1 && this.mode === 1) this.mode = 2;                      // :40550-40554
      if (this.page || this.mode === 2) this.redT++;                               // :40555-40558
    }
    // ---- 主人操控（:40560-40604）----
    let aim: { x: number; y: number } | null = null;
    if (this.mode === 0) {
      if (this.channelCb()) {
        // channel 期用魔动画续期（Player.cs:43143-43146 itemAnimation 持续>0 每帧
        // ItemCheck_ApplyManaRegenDelay → delay 钉 4 = 全程 5% 滴流回蓝；2026-08-22
        // 审计 ❌ 修复——channel 弹寿命>useTime,不续期则 10t 后回满速回蓝白嫖魔力）
        game.player.onChannelManaHold?.();
        aim = this.aimCb();   // ai[0]/ai[1] = 光标（:40566-40573）
        // 持按连发（Player.cs:42143-42147 循环重用）：每 useTime 一发新弹，由最新
        // 存活弹独占驱动（尾部）；扣魔走 Game 侧 payMana 回调（1457 ManaV2 恒放行,
        // 空蓝照发+slowMagicUse 标记——CheckMana :53216-53253 同语义）
        while (ALIVE.length && ALIVE[ALIVE.length - 1].dead) ALIVE.pop();
        if (ALIVE[ALIVE.length - 1] === this) {
          if (++this.reuseT >= this.useTime) {
            this.reuseT = 0;
            if (this.payMana()) this.fireExtra?.();
          }
        }
      } else {
        // 松手（:40575-40593）：ai[0]=-1；找视线内最近目标，无则速度归一 32
        this.mode = 1;
        this.homingId = this.findTarget(game);
        if (this.homingId === -1) {
          const sp = Math.hypot(this.vx, this.vy);
          if (sp < 2) {
            // DirectionFrom(player.Center)（:40587）——中心重合时为零向量
            const p = game.player;
            const dx = this.cx - p.cx, dy = this.cy - p.cy;
            const dl = Math.hypot(dx, dy);
            this.vx = dl > 0 ? dx / dl * num : 0;
            this.vy = dl > 0 ? dy / dl * num : 0;
          } else {
            this.vx = this.vx / sp * num;
            this.vy = this.vy / sp * num;
          }
        }
      }
    }
    if (this.mode !== 0 && this.homingId === -1) {
      const t = this.findTarget(game);      // :40595-40603（命中清 ai[1] 后重索敌）
      if (t !== -1) this.homingId = t;
    }
    // ---- 目标解析（:40605-40630）----
    let tx = 0, ty = 0, has = false;
    let amount = 1;
    if (this.mode === 0 && aim) { tx = aim.x; ty = aim.y; has = true; }  // :40607-40609
    if (this.mode !== 0 && this.homingId >= 0) {
      const e = this.findEnemy(game, this.homingId);
      if (!e) {
        this.homingId = -1;                // :40624-40628（目标失效清 ai[1]）
      } else {
        const ecx = e.cx ?? e.x + e.w / 2, ecy = e.cy ?? e.y + e.h / 2;
        tx = ecx; ty = ecy; has = true;
        const d = Math.hypot(ecx - this.cx, ecy - this.cy);
        const num7 = lerpValue(0, 100, d) * lerpValue(600, 400, d);       // :40621
        amount = lerp(0, 0.2, lerpValue(200, 20, 1 - num7));             // :40622（恒收敛 0.2）
      }
    }
    // ---- 转向/移动（:40636-40677）----
    let flag2 = this.mode !== 0;            // :40631-40635（flag = 已松手）
    if (has) {
      const dx = tx - this.cx, dy = ty - this.cy;
      const d = Math.hypot(dx, dy);
      if (d >= 64) {                        // :40639-40655
        flag2 = true;
        const sp2 = Math.hypot(this.vx, this.vy);
        if (sp2 < 4 && sp2 > 0) {
          // vel += normalize(vel).RotatedBy(π/4)*4（:40646-40649；零向量不踢）
          const a = Math.atan2(this.vy, this.vx) + Math.PI / 4;
          this.vx += Math.cos(a) * 4;
          this.vy += Math.sin(a) * 4;
        }
        if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) { this.killNow(game); return; }
        const want = Math.min(num, d);
        this.vx = lerp(this.vx, dx / d * want, amount);
        this.vy = lerp(this.vy, dy / d * want, amount);
      } else {                              // :40656-40661 近距盘旋
        this.vx *= 0.3; this.vy *= 0.3;
        this.vx += (tx - this.cx) * 0.3;
        this.vy += (ty - this.cy) * 0.3;
        flag2 = Math.hypot(this.vx, this.vy) >= 2;
      }
      if (this.timeLeft < 60) this.timeLeft = 60;   // :40662-40665
    }
    if (this.mode !== 0 && this.homingId < 0) {
      // :40667-40676 直飞档：速度朝 normalize(vel)|UnitY ×32 以 ≤4/tick 收敛；寿命钳 300
      const sp3 = Math.hypot(this.vx, this.vy);
      if (sp3 !== num) {
        const ux = sp3 > 0 ? this.vx / sp3 : 0;
        const uy = sp3 > 0 ? this.vy / sp3 : 1;   // SafeNormalize(UnitY)（:40671）
        [this.vx, this.vy] = moveTowardsV2(this.vx, this.vy, ux * num, uy * num, 4);
      }
      if (this.timeLeft > 300) this.timeLeft = 300;
    }
    // ---- rotation（:40678-40685）----
    const velA = Math.atan2(this.vy, this.vx);
    if (flag2 && (this.vx !== 0 || this.vy !== 0)) {
      this.rot = angleTowards(this.rot, velA, Math.PI / 4);
    } else {
      this.rot = angleLerp(this.rot, 0, 0.2);
    }
    this.fxStep(game);
  }

  /** 尘/音/光（:40687-40750 + ProjLight :14808-15160） */
  private fxStep(game: GameHooks): void {
    if (this.projId === 16) {
      // :40689-40693 Item9 周期音（soundDelay=10，|vx|+|vy|>2 门）——原版 soundDelay
      // 在 Update 头递减、AI 判 ==0（R27 对齐十拍节拍：曾"判<=0 再减"=11 拍/响）
      if (this.soundDelay > 0) this.soundDelay--;
      if (this.soundDelay === 0 && Math.abs(this.vx) + Math.abs(this.vy) > 2) {
        this.soundDelay = 10;
        game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
      }
      // :40694-40702 尘 15（1/9 概率无重力漂尘）
      if (Math.random() < 1 / 9) game.spawnParticles(this.cx, this.cy, '#9CD8FF', 1, 1.1, { life: 20 });
      this.lightRGB = [0.08, 0.32, 1.0];   // :15006-15010（light0.8 × (0.1,0.4,1)）
    } else if (this.projId === 34) {
      // :40721-40736 火尘（发红档 Crimson 按 localAI[0] 0→10 渐入）
      const red = lerpValue(0, 10, this.redT);
      if (Math.random() < 1 / 6) {
        game.spawnParticles(this.cx, this.cy, red > 0.5 ? '#C41E3A' : '#FFA040', 1, 1.4, { life: 18 });
      }
      this.lightRGB = [0.8, 0.8, 0.8];     // 无覆盖档（:14815-14817 白 × light）
    } else if (this.projId === 79) {
      // ★1458 变更面（AI_009_MagicMissiles 新增 type==79 块 :44390-44406；红队 R27 §12，
      // R26 归属质疑已复核维持原判——块体逐行确认在 AI_009 方法体内、`if (type != 34)
      // return`(:44196) 之后）：soundDelay==0 且 |vx|+|vy|>2 → PlaySound(Item9)+
      // soundDelay=10（十拍循环啸声——Update 头递减/AI 判==0 的原版节拍）;
      // 每拍 1×d66 Disco 色(scale2.5,alpha100,noGravity,初速×0.1 后 +=弹速×0.2,
      // 位置=中心+4±rand(-2..2))——飞行期彩虹尘迹
      if (this.soundDelay > 0) this.soundDelay--;
      if (this.soundDelay === 0 && Math.abs(this.vx) + Math.abs(this.vy) > 2) {
        this.soundDelay = 10;
        game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
      }
      const dd79 = game.spawnDust?.(this.x, this.y, this.w, this.h, 66, 0, 0, 100,
        { r: this.discoR, g: this.discoG, b: this.discoB, a: 255 }, 2.5, true);
      if (dd79) {
        dd79.vx = dd79.vx * 0.1 + this.vx * 0.2;
        dd79.vy = dd79.vy * 0.1 + this.vy * 0.2;
        dd79.x = this.x + this.w / 2 + 4 + Math.floor(Math.random() * 5) - 2;
        dd79.y = this.y + this.h / 2 + Math.floor(Math.random() * 5) - 2;
      }
      const n = 7;                          // Main.cs:19441 六段 ±7/帧
      switch (this.discoStyle) {
        case 0: this.discoG = Math.min(255, this.discoG + n); if (this.discoG >= 255) this.discoStyle++; break;
        case 1: this.discoR = Math.max(0, this.discoR - n); if (this.discoR <= 0) this.discoStyle++; break;
        case 2: this.discoB = Math.min(255, this.discoB + n); if (this.discoB >= 255) this.discoStyle++; break;
        case 3: this.discoG = Math.max(0, this.discoG - n); if (this.discoG <= 0) this.discoStyle++; break;
        case 4: this.discoR = Math.min(255, this.discoR + n); if (this.discoR >= 255) this.discoStyle++; break;
        default: this.discoB = Math.max(0, this.discoB - n); if (this.discoB <= 0) this.discoStyle = 0; break;
      }
      this.lightRGB = [this.discoR / 255 * 0.8, this.discoG / 255 * 0.8, this.discoB / 255 * 0.8]; // :15157-15160
    }
    // 急转尘爆（:40686 flag3——oldVel·vel 归一 < 0.2 时 2-5 尘，:40703-40715/:40737-40749）
    const speed = Math.hypot(this.vx, this.vy);
    const pSpeed = Math.hypot(this.pvx, this.pvy);
    if (speed > 0.1 && pSpeed > 0.1) {
      const dot = (this.pvx * this.vx + this.pvy * this.vy) / (pSpeed * speed);
      if (dot < 0.2) {
        game.spawnParticles(this.cx, this.cy,
          this.projId === 34 ? '#FF7030' : this.projId === 79 ? '#FFD0FF' : '#9CD8FF',
          2, 0.8, { life: 14 });
      }
    }
  }

  /** FindTargetWithLineOfSight（:42972-42999）：800px 内最近可追 + CanHit 视线 */
  private findTarget(game: GameHooks): number {
    let best = 800, result = -1;
    const st = game.world.store;
    for (const ent of game.enemies()) {
      const e = ent as MissileEnemyView;
      if (e.dead || e.id === undefined) continue;
      if (!((e.maxHp ?? 99) > 5) || e.def?.friendly || e.def?.critter) continue; // NPC.cs:91070
      if (this.hitCd.has(e.id)) continue;                  // localNPCImmunity（:42980）
      const d = Math.hypot((e.cx ?? e.x + e.w / 2) - this.cx, (e.cy ?? e.y + e.h / 2) - this.cy);
      if (d < best && canHit(st, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) {
        best = d; result = e.id;
      }
    }
    return result;
  }

  private findEnemy(game: GameHooks, id: number): MissileEnemyView | null {
    for (const ent of game.enemies()) {
      const e = ent as MissileEnemyView;
      if (!e.dead && e.id === id
        && (e.maxHp ?? 99) > 5 && !e.def?.friendly && !e.def?.critter) return e;
    }
    return null;
  }

  /** 位移后的碰撞/命中段（同 Arrow 约定：中心格实心即灭） */
  private hitStep(game: GameHooks): void {
    const world = game.world;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    if (world.store.get(tx, ty) !== 0) {
      game.cutTile(tx, ty);
      if (world.store.isSolid(tx, ty)) { this.killNow(game); return; }
    }
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    if (hitCritters(this, game)) { this.killNow(game); return; }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as MissileEnemyView;
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      if (this.projId !== 16) {
        const cd = this.hitCd.get(e.id) ?? 0;
        if (cd > 0) continue;
        this.hitCd.set(e.id, 12);   // localNPCHitCooldown=12（SetDefaults 34/79）
      }
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // + 催化指环 6185（StatusNPC :11192-11196,玩家弹命中 398 300t）
      applyProjStatus(this.projId, e as unknown as Record<string, number>,
        { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
      if (this.nebulaCb) this.nebulaCb();
      // ★焰爆石+拍击石弹幕双支位（Projectile.cs:13439-13446；F3/F1 收编升级）：
      // 可控导弹族三型（16/34/79）均 magic 数据面 → 原版同样不触发；双支类门
      // projectileSnapStrikeBonus 单源（melee|ranged/ranged 过滤），站位补齐；
      // 返回 num14 加伤随暴击并入实伤参。
      const snapBonusMissile = projectileSnapStrikeBonus(game, this,
        (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2,
        e.id, { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusMissile ? Math.trunc(snapBonusMissile * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit, this.pierceInit, true);   // 音/飘值=单点
      // ★GC1 写方桥（Projectile.Damage :14031-14183 命中尾梯,StrikeNPC 后原位）：
      // 16 显型档=immune[owner]=8（:14096-14098）→ 非 local 面按表写；
      // 34/79 usesLocalNPCImmunity（1457 SetDefaults :1173/:1605,cd=12）→ 写 0
      // 清全局窗（节流归上方 hitCd 局部表）。蓝队二轮 F5 起该 face 由补表自动解析,
      // 此处显参保留为历史锚。penetrate 取写前现存 this.pierce（未递减——
      // :14189 的 penetrate-- 在梯子后）
      noteVanillaProjImmune(game, this.projId, e.id,
        { penetrate: this.pierce, localFace: this.projId === 34 || this.projId === 79 });
      // 命中清追踪（StrikeNPC :13260-13283：34 仅 ai[0]==-1 档清 / 79 恒清 + 彩虹粒子；
      // 34 的 ai[0]==-2 终段不再清——逐字对源码）。79 命中的 RainbowRodHit 编排
      // （Projectile.cs:14293-14304:ai[0]==-1 门→ RequestParticleSpawn clientOnly:false,
      //   PositionInWorld=targetNPC.Center、MovementVector=velocity）——L5 批真值升级
      // （原 #FFB0FF 占位紫粒退役）+ module8 上行
      if (this.projId === 79 && this.mode !== 0) {
        this.homingId = -1;
        const ecx = (e as { cx?: number }).cx ?? e.x + e.w / 2;
        const ecy = (e as { cy?: number }).cy ?? e.y + e.h / 2;
        rainbowRodHitFx(game, ecx, ecy, this.vx, this.vy);
        game.broadcastParticleOrchestra?.(ParticleOrchestraType.RainbowRodHit,
          ecx, ecy, this.vx, this.vy);
      } else if (this.projId === 34 && this.mode === 1) {
        this.homingId = -1;
      }
      // 幽灵套吸血（Projectile.cs:12883-12888：magic 弹 ghostHeal；numHits 含本次）
      game.applyLifeSteal?.('ghost', Math.round(dmg), this.pierceInit - this.pierce + 1,
        this.x, this.y, true);
      // ★GB1（GC 契约，2026-08-31）：幽灵伤害头 ghostHurt（Projectile.cs:13881 →
      //  :12021 方法体）——触发位在 StrikeNPC(:13712)/ghostHeal(:13879) 之后、同一
      //  flag10 on-hit 段内。导弹族三型（16 魔法飞弹 /34 Flamelash /79 彩虹魔杖弹）
      //  的 SetDefaults 均为 magic=true（vanilla-projectiles.json 三条 magic 位）；
      //  按弹 id 数据门（magic 归属面）+ Spectre Mask 套装 → 受害者 Center 放浮魂
      //  弹 356。dealt = Enemy.lastStrikeDealt（StrikeNPC num41 等价位）
      if (this.projId > 0 && projectileData(this.projId)?.magic === true
        && playerHasGhostHurt(game.player)) {
        const v156 = e as unknown as { lastStrikeDealt?: number };
        ghostHurtOnHit(game,
          { magic: true, projDamage: this.damage,
            projX: this.x, projY: this.y, projW: this.w, projH: this.h,
            ownerCx: game.player.cx, ownerCy: game.player.cy },
          { x: e.x, y: e.y, w: e.w, h: e.h, cx: e.cx ?? e.x + e.w / 2, cy: e.cy ?? e.y + e.h / 2,
            vanillaId: (e as unknown as { vanillaId?: number | null }).vanillaId,
            dealt: v156.lastStrikeDealt ?? 0 });   // 本拍结算面（蓝队 F2② 修订）
      }
      if (--this.pierce <= 0) { this.killNow(game); return; }
    }
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)
      && --this.pierce <= 0) { this.killNow(game); return; }
  }

  /** 统一消亡出口。★R27：79 彩虹魔杖补 Kill 爆（Projectile.cs:72426-72503，1458 同）：
   *  Resize(128,128) → maxPenetrate=−1 → Damage()（128px 死亡 AoE 二次结算）→
   *  Item10 音 + 沿 oldPos 全程彩虹 d267 尾迹迸散（逐点 hue 相位/数量按距离衰减/
   *  白影 CloneDust）+ RainbowRodHit 编排粒子×2（L5 批收编 fx/orchestraFx 真值本体）
   *  + 14×d66 随机色 vel×3 */
  private killNow(game: GameHooks): void {
    if (this.projId === 79 && !this.dead) {
      // Resize(128,128) 死亡 AoE（:72428-72434）：以弹心为心 128px 盒重结算一次伤害
      const R = 64;
      for (const ent of game.enemies()) {
        const e = ent as MissileEnemyView;
        if (e.dead) continue;
        const ecx = (e.cx ?? e.x + e.w / 2), ecy = (e.cy ?? e.y + e.h / 2);
        if (!(Math.abs(ecx - this.cx) < R + e.w / 2 && Math.abs(ecy - this.cy) < R + e.h / 2)) continue;
        if (!playerCanHitEnemy(e, game, this.projId)) continue;
        const crit = Math.random() < this.critChance;
        e.hurt(applyBannerDamageDealt(game, e, crit ? this.damage * 2 : this.damage), Math.sign(this.vx) * this.knockback,
          0, game, this.armorPen, crit, 0, true);
      }
      game.playSfxFiles?.(['Item_10'], 1, this.cx, this.cy);
      // 沿 oldPos 尾迹迸散（:72436-72487）：逐点 hue 相位、数量按点序衰减（≥0.3 −1、
      // ≥0.65 再 −2、≥0.85 再 −3）、白影 CloneDust 以半尺白尘近似
      const N = this.trail.length / 2;
      const hue0 = Math.random();
      for (let i = 0; i < N; i++) {
        const px = this.trail[i * 2], py = this.trail[i * 2 + 1];
        const t = N <= 1 ? 0 : i / (N - 1);                 // GetLerpValue(oldPos.Length,0,i)
        let count = 1 + Math.floor(Math.random() * 3);
        if (t >= 0.3) count--;
        if (t >= 0.65) count -= 2;
        if (t >= 0.85) count -= 3;
        const [rr, gg, bb] = hueToRgb((hue0 + t) % 1);
        for (let k = 0; k < Math.max(count, 0); k++) {
          const sc = lerp(0.3, 1, t) * (0.9 + Math.random() * 1.2);   // Lerp(0.3,1,lerpValue2) :72448
          game.spawnDust?.(px, py, 4, 4, 267, 0, 0, 0,
            { r: rr, g: gg, b: bb, a: 255 }, sc, true);
          game.spawnDust?.(px, py, 4, 4, 267, 0, 0, 0,
            { r: 255, g: 255, b: 255, a: 255 }, sc / 2, true);   // CloneDust 白影
        }
      }
      // RainbowRodHit 编排粒子 ×2（:72488-72495）——L5 批收编真值本体（六掷虹彩
      // 簇+12×d267 双层）;原版 clientOnly:true 不上网,本地直驱同口径
      rainbowRodHitFx(game, this.cx, this.cy);
      rainbowRodHitFx(game, this.cx, this.cy);
      // 14×d66 随机色 vel×3（:72496-72502）
      for (let i = 0; i < 14; i++) {
        const [rr, gg, bb] = hueToRgb(Math.random());
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 66, 0, 0, 100,
          { r: rr, g: gg, b: bb, a: 255 }, 1.7, true);
        if (d) { d.vx *= 3; d.vy *= 3; }
      }
    }
    this.dead = true;
    const i = ALIVE.indexOf(this);
    if (i >= 0) ALIVE.splice(i, 1);
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const speed = Math.hypot(this.vx, this.vy);
    // ---- 79 彩虹拖尾（RainbowRodDrawer.cs:12-37 的 canvas 近似：沿 oldPos 逐段绘
    //      hue=(p*1.6−GlobalTime)%1 色、宽 lerp(0,32,1−(1−lerp(0,0.2,p))²)、尾淡出；
    //      本体贴图恒 alpha0（Main.cs:32438-32442）不画 ----
    if (this.projId === 79) {
      const N = this.trail.length / 2;
      if (N >= 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 1; i < N; i++) {
          const p = i / (N - 1);                       // progressOnStrip（0 头 → 1 尾）
          const [rr, gg, bb] = hueToRgb(p * 1.6 - this.globalT);
          const wGrow = lerpValue(0, 0.2, p);
          const width = 32 * (1 - (1 - wGrow) * (1 - wGrow));   // StripWidth :31-37
          const white = lerpValue(-0.2, 0.5, p);
          const fade = 1 - lerpValue(0, 0.98, p);               // StripColors :26
          const a = Math.max(0, Math.min(1, fade * 0.8));
          if (a <= 0.02 || width < 0.5) continue;
          const cr = Math.round(lerp(255, rr, white));
          const cg = Math.round(lerp(255, gg, white));
          const cb = Math.round(lerp(255, bb, white));
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(this.trail[(i - 1) * 2], this.trail[(i - 1) * 2 + 1]);
          ctx.lineTo(this.trail[i * 2], this.trail[i * 2 + 1]);
          ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }
    // ---- 16/34 旋转族（Main.cs:32360 族分支 + :32420-32436 各型覆写）----
    const img = this.projId === 34 ? projFrameImg(34, this.frame) : projSprite(this.projId);
    if (!img) return;
    const asImg = img as HTMLImageElement;
    const ready = (img as HTMLCanvasElement).width !== undefined
      ? (img as HTMLCanvasElement).width > 0
      : (asImg.width > 0) && asImg.width > 0;
    if (!ready) return;
    const lerpS = lerpValue(0, 8, speed);   // GetLerpValue(0,8,|vel|)（:32421/:32430）
    const iw = (img as HTMLCanvasElement).width || asImg.width;
    const ih = (img as HTMLCanvasElement).height || asImg.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.projId === 16) {
      // :32420-32427：rotation×lerp8；scale 0.6、X lerp(1,1.5)、Y lerp(1,0.8)；
      // SetDefaults alpha100 → GetAlpha ≈ (255−100)/255
      ctx.globalAlpha = 155 / 255;
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot * lerpS);
      const sx = 0.6 * lerp(1, 1.5, lerpS) * this.drawScale;
      const sy = 0.6 * lerp(1, 0.8, lerpS) * this.drawScale;
      ctx.drawImage(img as CanvasImageSource, -iw * sx / 2, -ih * sy / 2, iw * sx, ih * sy);
    } else {
      // :32429-32436：rotation = lerp9×(rot−π/2)、X scale lerp(1,0.8)、
      // 绘制位 = oldPos[0]+Size/2−vel/2（上一帧中心 − 速度/2）
      ctx.translate(this.prevCx - this.vx / 2, this.prevCy - this.vy / 2);
      ctx.rotate(lerpS * this.rot - Math.PI / 2 * lerpS);
      const sx = lerp(1, 0.8, lerpS) * this.drawScale;
      const sy = this.drawScale;
      ctx.drawImage(img as CanvasImageSource, -iw * sx / 2, -ih * sy / 2, iw * sx, ih * sy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ===================== 飞刀 491（aiStyle 9 的 Old 分支，AI_009_MagicMissiles_Old） =====================

/**
 * proj 491（SetDefaults :5131-5139：26×26 aiStyle9 friendly melee penetrate−1）——
 * item 3030 飞刀（Item.cs:28029-28045：channel、useStyle1、shootSpeed17、dmg40、
 * noMelee）。AI_009 入口 :40520-40524 把 type==491 整体转投 Old 分支（:40753-40910），
 * 与本文件新导弹（光标点对齐 + 松手索敌/直飞）语义完全不同：
 *   · channel 期间（:40757-40830）：距光标 ≥100px → 速度朝光标方向 4:1 收敛
 *     （上限 20px/t，:40794-40817）；<100px → 只沿当前方向 ×1.1 加速并自锁
 *     ai[0]=−10 计数（:40778-40793）——近距是"悬停绕圈"不是贴脸瞬移；
 *   · 松手（:40832-40863）：491 不重瞄鼠标，ai[0]=1 直接回收；
 *   · 回收（:40869-40880）：localAI[0]>15 后穿墙，速度朝玩家 5:1 收敛到 25px/t，
 *     距玩家 <20px 消失；
 *   · 撞块（:17053-17066）：双轴反弹（lastVelocity 取反），操控态自锁 ai[0]=−10；
 *   · 距玩家 >2000px 消失（:40894-40897）；穿透 −1（同敌 10t 冷却后可再中）。
 */
export interface FlyingKnifeCtor {
  /** channel 电平（:40757 player.channel && HeldItem.shoot==491——Game 侧
   *  mouseHeld+持物 id+未死 的既有口径） */
  channelCb: () => boolean;
  /** 光标世界坐标（Main.MouseWorld :40769）。★2026-08-31 台账 A6 清偿：消费侧
   *  steer() 先经 limitPointToPlayerReachableArea 钳进玩家可达区（原版
   *  Projectile.cs:44249 同位），"未建模登记偏差"就此关闭 */
  aimCb: () => { x: number; y: number };
}

export class FlyingKnifeProj extends Entity {
  readonly projId = 491;
  damage: number;
  knockback: number;
  /** 暴击总概率（spawn 侧注入，同 mArrow 口径） */
  critChance = 0.04;
  /** 护甲穿透（spawn 注入，命中传 hurt 减防） */
  armorPen = 0;
  dead = false;
  w = 26; h = 26;                        // :5132-5133
  /** ai[0]：≤0 操控（−10..−1 自锁计数，:40791）/ 1 松手回收（:40862） */
  private ai0 = 0;
  /** localAI[0]（:40868——回收延迟计数） */
  private localT = 0;
  /** rotation（:40882-40893：ai0<0/零速 自旋 0.3、ai0>0 按 direction 自旋、否则 atan2+π/2） */
  private rot = 0;
  /** projectile.direction（原版 Update 按 velocity.X 符号刷新的近似） */
  private dir = 1;
  /** timeLeft（SetDefaults 缺省 3600，:526） */
  private timeLeft = 3600;
  /** 回收段 tileCollide=false（:40871） */
  private passTiles = false;
  /** 同敌冷却（NPC.immune[owner]=10——:13189-13192 penetrate≠1 缺省档） */
  private hitCd = new Map<number, number>();
  private channelCb: () => boolean;
  private aimCb: () => { x: number; y: number };

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number,
    o: FlyingKnifeCtor) {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.damage = damage; this.knockback = knockback;
    this.channelCb = o.channelCb; this.aimCb = o.aimCb;
    if (vx !== 0) this.dir = vx > 0 ? 1 : -1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.timeLeft <= 0) { this.killNow(game); return; }
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    this.steer(game);                      // :40753-40909（操控/回收/姿态/2000px 门）
    if (this.dead) return;
    this.moveStep(game);                   // 撞块反弹 :17053-17066 / 回收穿墙 :40871
    if (this.dead) return;
    this.hitStep(game);                    // 穿透 −1：10t 冷却后同敌可再中
  }

  /** AI_009_MagicMissiles_Old（:40753-40910） */
  private steer(game: GameHooks): void {
    const p = game.player;
    // ---- 操控/松手分流（:40755-40863）----
    if (this.ai0 <= 0) {
      if (this.channelCb()) {
        const num = 20;                    // :40764-40767（491 专属上限）
        // ★2026-08-31 台账 A6 清偿（Projectile.cs:44247-44249）：光标先钳进玩家可达区
        // （LimitPointToPlayerReachableArea，Player.cs:45830-45858 盒=1920×1200 中心
        // 玩家∩世界边框内缩 640px）再算距离——曾直追原始 MouseWorld 导致"距光标<100px
        // 刹车/悬停环"在大屏/越界光标下永远不可达（未建模登记就此关闭）
        const raw = this.aimCb();
        const lim = limitPointToPlayerReachableArea(raw.x, raw.y, p.cx, p.cy,
          game.world.store.w * TILE, game.world.store.h * TILE);
        const dx = lim[0] - this.cx, dy = lim[1] - this.cy;
        const d = Math.hypot(dx, dy);      // :40773
        if (this.ai0 < 0) this.ai0 += 1;   // :40774-40777（自锁计数回卷）
        if (d < 100) {                     // :40778-40793 近距：只加速 + 自锁 −10
          if (Math.hypot(this.vx, this.vy) < num) {
            this.vx *= 1.1; this.vy *= 1.1;
            const sp = Math.hypot(this.vx, this.vy);
            if (sp > num) { this.vx = this.vx / sp * num; this.vy = this.vy / sp * num; }
          }
          if (this.ai0 === 0) this.ai0 = -10;
        } else if (d > num) {              // :40794-40817（491 在 d≥100 时恒真）
          this.vx = (this.vx * 4 + dx / d * num) / 5;   // :40807-40811
          this.vy = (this.vy * 4 + dy / d * num) / 5;
        } else {                           // :40818-40830（d∈(20,100) 被 <100 支截，不可达）
          this.vx = dx; this.vy = dy;
        }
      } else if (this.ai0 <= 0) {
        this.ai0 = 1;                      // :40832-40863（491 不重瞄鼠标）
      }
    }
    // ---- 回收/姿态/射程/尘（:40866-40909，两相恒跑）----
    this.localT += 1;                      // :40868
    if (this.ai0 > 0 && this.localT > 15) {
      this.passTiles = true;               // :40871
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < 20) { this.killNow(game); return; }       // :40873-40876
      const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
      this.vx = (this.vx * 5 + ux * 25) / 6;            // :40877-40879
      this.vy = (this.vy * 5 + uy * 25) / 6;
    }
    if (this.ai0 < 0 || (this.vx === 0 && this.vy === 0)) this.rot += 0.3;      // :40882-40885
    else if (this.ai0 > 0) this.rot += 0.3 * this.dir;                          // :40886-40889
    else this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;                 // :40890-40893
    if (this.vx !== 0) this.dir = this.vx > 0 ? 1 : -1;
    if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 2000) { this.killNow(game); return; } // :40894-40897
    // 尘（:40898-40909：1/2 概率，15/57/58 三色随机、初速 = 速度×0.25 后再 ×0.25）
    if (Math.random() < 0.5) {
      const c = ['#9CD8FF', '#FFD080', '#FFA050'][Math.floor(Math.random() * 3)];
      game.spawnParticles((this.cx + this.x) / 2, (this.cy + this.y) / 2, c, 1, 0.7, { life: 18 });
    }
  }

  /** 移动 + 撞块反弹（:17053-17066 双轴 lastVelocity 取反 + 操控态自锁 −10） */
  private moveStep(game: GameHooks): void {
    if (this.passTiles) { this.x += this.vx; this.y += this.vy; return; }
    const st = game.world.store;
    const solidBox = (x: number, y: number): boolean => {
      const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
      const x1 = Math.floor((x + this.w - 1) / TILE), y1 = Math.floor((y + this.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
      }
      return false;
    };
    const lvx = this.vx, lvy = this.vy;
    let hitX = false, hitY = false;
    const nx = this.x + this.vx;
    if (solidBox(nx, this.y)) hitX = true; else this.x = nx;
    const ny = this.y + this.vy;
    if (solidBox(this.x, ny)) hitY = true; else this.y = ny;
    if (!hitX && !hitY) return;
    game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });
    game.playSfx('dig', 1, this.cx, this.cy);
    if (this.ai0 <= 0) this.ai0 = -10;     // :17055-17058
    if (hitX && lvx !== 0) this.vx = -lvx; // :17059-17062
    if (hitY && lvy !== 0) this.vy = -lvy; // :17063-17066
  }

  /** 命中结算（穿透 −1：10t 冷却；StatusNPC 表驱动；直飞 Arrow 同口径） */
  private hitStep(game: GameHooks): void {
    const world = game.world;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    game.cutTile(tx, ty);                  // CutTiles（挥砍草/陶罐同链）
    if (hitCritters(this, game)) return;
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)) return;
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as MissileEnemyView;
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const cd = this.hitCd.get(e.id) ?? 0;
      if (cd > 0) continue;
      this.hitCd.set(e.id, 10);
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // + 催化指环 6185（StatusNPC :11192-11196,玩家弹命中 398 300t）
      applyProjStatus(this.projId, e as unknown as Record<string, number>,
        { catalystBand: ((game.player as unknown as { equipStats?: { catalystBand?: boolean } } | null)?.equipStats?.catalystBand) === true });
      // ★焰爆石+拍击石弹幕双支位（Projectile.cs:13439-13446；F3/F1 收编升级）——
      // 飞刀 491 数据面 melee（SetDefaults 类旗投影）→ 过 kind1 门即脉冲、kind0 门
      // 天然拒；返回 num14 加伤随暴击并入实伤参
      const snapBonusKnife = projectileSnapStrikeBonus(game, this,
        (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2,
        e.id, { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusKnife ? Math.trunc(snapBonusKnife * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit, 0, true);   // 音/飘值=单点
    }
  }

  private killNow(game: GameHooks): void {
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    if (!img || !(img.width > 0) || img.width === 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);                  // GetAlpha 恒白（:76286-76291），无淡入
    ctx.drawImage(img, -this.w / 2, -this.h / 2, this.w, this.w * img.height / img.width);
    ctx.restore();
  }
}

// ===================== 老星怒落星（proj 9，aiStyle 5） =====================

/**
 * proj 9（SetDefaults :626-636：24×24 aiStyle5 penetrate2 scale0.8 tileCollide=false
 * melee）。出生链 = Player.cs:46613-46625（projToShoot==9：出生点 = 光标 X + 远离
 * 玩家侧 rand(0..200)、Y = MountedCenter−600；伤害 ×1.5、击退清零）+
 * :48479-48491（type 65：目标线从光标向出生点方向逐 16px 回退到首个非实心格）。
 * 行为（:22130-22247）：恒速无重力；tileCollide = Bottom.Y ≥ ai[1]（:22159-22162，
 * 与 503 的 Center.Y > ai[1] 不同——底边对齐）；alpha −15/t（线上钳 150 / 线下钳 0，
 * :22194-22207）；Item9 周期音 20-60t（:22175-22179）；rotation 按
 * (|vx|+|vy|)×0.01×direction 翻滚（:22246，非 503 的 vel−π/2）；尘 86 粉星尾
 * （:22325-22337）。
 */
export class StarfuryStar extends Entity {
  /** 原版弹型 id（SetDefaults :626-636 melee 旗——resolveProjClass 类门数据源） */
  readonly projId = 9;
  damage: number;
  /** 出生注入的穿透（SetDefaults 2） */
  pierce: number;
  critChance = 0.04;
  armorPen = 0;
  /** 目标线 Y（ai[1]）：Bottom.Y ≥ targetY 后开始撞块 */
  targetY: number;
  /** alpha（255 起 −15/t；线上钳 150 / 线下钳 0） */
  alpha = 255;
  /** rotation（翻滚累积，:22246） */
  rot = 0;
  /** timeLeft（SetDefaults 默认 3600） */
  timeLeft: number;
  dead = false;
  private soundT = 0;

  constructor(x: number, y: number, vx: number, vy: number,
    damage: number, pierce: number, targetY: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.pierce = pierce;
    this.targetY = targetY;
    this.w = 24; this.h = 24;
    this.timeLeft = 3600;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.timeLeft <= 0) { this.killNow(game); return; }
    // :22159-22162 tileCollide = Bottom.Y ≥ ai[1]（越线前穿墙）
    const collide = this.y + this.h >= this.targetY;
    // :22175-22179 Item9 周期音（20-60t 掷一次）
    if (this.soundT <= 0) {
      this.soundT = 20 + Math.floor(Math.random() * 41);
      game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
    } else this.soundT--;
    // :22194-22207 alpha −15/t；线上（Center.Y < ai[1]）钳 150，线下钳 0
    const floor = this.cy < this.targetY ? 150 : 0;
    this.alpha = Math.max(floor, this.alpha - 15);
    // :22246 翻滚（503 才是 rotation = vel−π/2，:22242）
    this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01;
    this.x += this.vx;
    this.y += this.vy;
    // :22325-22337 尘 86 粉星尾（1/4 概率；半数位置回退 vel×4）
    if (Math.random() < 0.25) {
      const px = Math.random() < 0.5 ? this.cx - this.vx * 4 : this.cx;
      game.spawnParticles(px, this.cy, '#FF8CD8', 1, 0.8, { life: 22 });
    }
    const world = game.world;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    if (collide && world.store.get(tx, ty) !== 0) {
      game.cutTile(tx, ty);
      if (world.store.isSolid(tx, ty)) { this.killNow(game); return; }
    }
    if (hitCritters(this, game)) { this.killNow(game); return; }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as MissileEnemyView;
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★焰爆石+拍击石弹幕双支位（Projectile.cs:13439-13446；F3/F1 收编升级）——
      // 老星怒落星 9 数据面 melee → 过 kind1 门即脉冲；返回 num14 加伤随暴击并入实伤参
      const snapBonusStar = projectileSnapStrikeBonus(game, this,
        (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2,
        e.id, { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusStar ? Math.trunc(snapBonusStar * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * 5, 0, game, this.armorPen, crit, this.pierce, true);   // 音/飘值=单点
      if (--this.pierce <= 0) { this.killNow(game); return; }
    }
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2)
      && --this.pierce <= 0) { this.killNow(game); return; }
  }

  private killNow(game: GameHooks): void {
    this.dead = true;
    game.onProjectileDeath?.(9, this.x, this.y, this.w, this.h);
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(9);
    if (!img || !(img.width > 0) || img.width === 0) return;
    const sp = Math.hypot(this.vx, this.vy) || 1;
    // Main.cs:31101-31127 type 9 覆写：绘制位 = Center + normalize(vel)×8（vector46）、
    // scale ×0.75（num207）；色 = Gold(A=180) ↔ (194,22,134,127) 按 rotation 脉动
    // （num212=0.5 档）。Extra[91] 三条星芒尾（:31170-31172）以渐隐金粉曳光近似
    const phase = wrapAngle(this.rot * 0.5) / (Math.PI * 2) + 0.5;
    const pulse = 1 - lerpValue(0.15, 0.5, phase) * lerpValue(0.5, 0.85, phase);
    const px = this.cx + this.vx / sp * 8;
    const py = this.cy + this.vy / sp * 8;
    const a = Math.max(0, Math.min(1, (255 - this.alpha) / 255));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,215,0,${(0.25 * a).toFixed(3)})`;
    ctx.lineWidth = 2 + 5 * 0.8 * pulse;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - this.vx / sp * 26, py - this.vy / sp * 26);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(px, py);
    ctx.rotate(this.rot);
    const s = 0.75 * 0.8;   // num207×0.75 × SetDefaults scale 0.8
    ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2,
      img.width * s, img.height * s);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
