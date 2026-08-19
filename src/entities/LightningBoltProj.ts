// 闪电链弹（proj 466 月总闪电链 / 580 星旋门电击，aiStyle 88，
// Projectile.cs:30937-31185 type 段 + :5119-5127/:6014-6023 SetDefaults）：
//   466 = 邪教徒闪电球 465（LightningOrb，bossAI_lategame）每 30t 朝玩家掷出；
//   580 = 星旋传送门 578（VortexPortalProj，bossAI_lunar_misc）开门瞬间的短命电击。
//
// 规格（SetDefaults 466 :5119-5127 / 580 :6014-6023）：14×14 / hostile / alpha 255 /
//   ignoreWater / tileCollide=true / extraUpdates=4（每逻辑帧 5 子步）/
//   timeLeft=600（逐子步消耗 → 实际 120t）。
// AI（:31058-31185，两型同构）：每子步 frameCounter++ + AddLight(0.3,0.45,0.5)；
//   velocity==0（撞墙/撞限静止）：frameCounter≥8 一拍 → 静止满 oldPos 10 点 Kill
//   （:31086-31098/:31150-31162），1/4×(localAI1==2?1/2:1/6) 尘 226 双束 + 1/5 尘 31；
//   velocity≠0：frameCounter≥8 一拍 → 速度模长守恒的锯齿换向（:31017-31052/
//   :31108-31185）：以 ai[1] 为种子 new UnifiedRandom((int)ai[1])，每候选 next()
//   覆写 ai[1] 后 %100 取向，约束「换向前 Y≤−0.02（向上）+ X 预算 localAI0±40」，
//   100 次无解 → 停摆（466 localAI1=1 / 580 localAI1+=2，:31050/:31174-31177）；
//   通过 → localAI0 += pick.X×10×速，velocity = pick.RotatedBy(ai[0]+π/2)×速，
//   rotation = velocity 角 + π/2。
//   580 哨兵（:31061-31065）：localAI1==0 且 ai[0]≥900 → ai[0]−=1000、localAI1=−1
//   （门生 580 的 ai0=角度恒 <900，此门为防御性，照抄）。
// 撞墙（HandleMovement :16896-16903）：localAI1<1 → +2、velocity 清零【不消亡】，
//   原版另有 position+=velocity 一步（此时 velocity 已被碰撞管线下调，本仓碰撞在
//   位移后检测，再推一步会过嵌，省略——净效果同为「贴墙停摆」）。
// 命中（Colliding :14733-14744）：本体矩形 ∪ oldPos 轨迹逐点矩形（TrailingMode 1，
//   ProjectileID.cs:291——466/580 每 AI 步记 1 点、10 点环，整条锯齿轨迹都有判定）。
// 绘制（Main.cs:33678-33760）：不用 Projectile_N.png——沿 oldPos 逐段
//   Utils.DrawLaser(Extra_33, LightningLaserDraw)（DelegateMethods.cs:979-1005 三段
//   帧带 21×8/21×6/21×8）；466 三层（宽 ×0.6/0.4/0.2，色 (115,204,219)/(113,251,255)/
//   白，各 ×0.5 加色）；580 两层（宽 ×0.5/0.3，localAI1∈{−1,1} 再 −0.2，
//   色 (115,244,219)/白）。本仓以 Extra_33 体带（0,8,21,6）沿段拉伸近似。
import { Entity } from './Entity';
import { UnifiedRandom } from '../core/rng';
import { hitPlayer, hitTownNpcs, hitCritters } from './projTargets';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { upgradeToBitmap } from '../assets/SpriteAtlas';

/** Extra_33（22×22 闪电纹理）懒加载（Arrow.projSprite 同款模式，不 import
 *  Renderer 运行时以免实体→渲染器环） */
let boltImg: ImageBitmap | HTMLImageElement | null = null;
let boltTried = false;
function extra33(): ImageBitmap | HTMLImageElement | null {
  if (boltTried) return boltImg;
  boltTried = true;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  im.onload = () => upgradeToBitmap(im, (b) => { boltImg = b; });
  im.src = 'sprites/vanilla/Extra_33.png';
  boltImg = im;
  return im;
}

/** Extra_33 体带高（LightningLaserDraw stage1 帧 (0,8,21,6)，DelegateMethods.cs:989） */
const BAND_Y = 8, BAND_H = 6, BAND_W = 21;

export class LightningBoltProj extends Entity {
  readonly projId: number;        // 466 / 580
  damage: number;
  w = 14; h = 14;                 // SetDefaults :5119-5120 / :6015-6016
  /** ai[0]：换向基角（466=弹心→玩家角 :30916 / 580=门朝向角 :32658） */
  private ai0: number;
  /** ai[1]：UnifiedRandom 种子（每候选 next() 覆写，:31028-31031） */
  private ai1: number;
  /** localAI[0]：换向 X 预算累积（±40 越界即弃，:31041-31046） */
  private lai0 = 0;
  /** localAI[0/1] 复用槽：0 飞行 / 1(466 撞限) / 2(撞墙|580 撞限) / −1(580 哨兵) */
  private lai1 = 0;
  private frameCounter = 0;
  private readonly extraUpdates = 4;
  private life = 600;             // 逐子步消耗（:15861）→ 120t
  private rot = 0;                // rotation（换向时 = 速度角+π/2，:31048）
  /** oldPos 环（TrailingMode 1：每 AI 步记 1 点，10 点，:15762-15768）——
   *  判定（:14733-14744）与绘制（:33693-33711）共用；x/y 交错存储 */
  private trail: number[] = [];
  /** 连续静止记录数（≈ oldPos 全等判定的计数等价，:31091-31099） */
  private stationarySteps = 0;
  private lastRecX = 0; private lastRecY = 0;

  /** x/y = NewProjectile 的 X/Y（中心锚，:10258-10259 position=X−w/2）；
   *  vx/vy = 初速（466=7 速散射向 / 580=门方向 ×8）；rotBase = ai[0]；
   *  seed = ai[1]（原版 Main.rand.Next(100)/Next(80)） */
  constructor(x: number, y: number, vx: number, vy: number, projId: 466 | 580,
    damage: number, rotBase: number, seed: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.damage = damage;
    this.ai0 = rotBase;
    this.ai1 = seed;
  }

  /** oldPos 记录（:15762-15768：frameCounter==0 时移位入环） */
  private recordStep(): void {
    if (this.x === this.lastRecX && this.y === this.lastRecY) this.stationarySteps++;
    else this.stationarySteps = 1;
    this.lastRecX = this.x; this.lastRecY = this.y;
    this.trail.push(this.x, this.y);
    if (this.trail.length > 20) this.trail.splice(0, this.trail.length - 20);   // 10 点
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // extraUpdates 子步循环（:15331-15336）：AI/位移/命中逐子步
    for (let u = 0; u <= this.extraUpdates; u++) {
      this.subStep(game);
      if (this.dead) return;
    }
  }

  private subStep(game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    // 580 哨兵（:31061-31065）
    if (this.projId === 580 && this.lai1 === 0 && this.ai0 >= 900) {
      this.ai0 -= 1000;
      this.lai1 = -1;
    }
    this.frameCounter++;
    game.addLightAt?.(this.cx, this.cy, 0.3, 0.45, 0.5);   // :31068/:30946
    if (this.vx === 0 && this.vy === 0) {
      // ---- 静止相（:31086-31025 / :31144-31134 同构）----
      if (this.frameCounter >= this.extraUpdates * 2) {
        this.frameCounter = 0;
        this.recordStep();
        // oldPos 全等 → Kill（:31091-31099；记录满 10 点全静止即等价）
        if (this.stationarySteps >= 10) { this.dead = true; return; }
        // 尘门 1/4 × (localAI1==2 ? 1/2 : 1/6)（:31100/:31009）
        if (Math.floor(Math.random() * this.extraUpdates) === 0
          && Math.floor(Math.random() * (this.lai1 === 2 ? 2 : 6)) === 0) {
          for (let k = 0; k < 2; k++) {
            // rotation ± π/2 随机侧向、速 1..1.8（:31102-31109/:31011-31018）
            const a = this.rot + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2);
            const len = Math.random() * 0.8 + 1;
            game.spawnDust?.(this.cx, this.cy, 0, 0, 226,
              Math.cos(a) * len, Math.sin(a) * len, 0, null, 1.2, true);
          }
          if (Math.floor(Math.random() * 5) === 0) {
            // 尘 31 上升火花（:31112-31118；静止相 velocity=0 → 偏移 0）
            const d = game.spawnDust?.(this.cx - 4, this.cy - 4, 8, 8, 31,
              0, 0, 100, null, 1.5);
            if (d) { d.vx *= 0.5; d.vy = -Math.abs(d.vy); }
          }
        }
      }
    } else {
      // ---- 飞行相（:31017-31052 / :31088 起 466 同构）----
      if (this.frameCounter >= this.extraUpdates * 2) {
        this.frameCounter = 0;
        const spd = Math.hypot(this.vx, this.vy);
        const ur = new UnifiedRandom(this.ai1 | 0);        // (int)ai[1]（:31024）
        let attempts = 0;
        let pickX = 0, pickY = -1;
        let settled = false;
        for (;;) {
          let next = ur.next();
          this.ai1 = next;                                  // :31029 覆写种子
          next %= 100;
          const f = (next / 100) * Math.PI * 2;
          let cx = Math.cos(f), cy = Math.sin(f);
          if (cy > 0) cy *= -1;                             // 只取向上半（:31036-31039）
          let fail = false;
          if (cy > -0.02) fail = true;                      // :31040-31043 近水平弃
          const budget = cx * (this.extraUpdates + 1) * 2 * spd + this.lai0;
          if (budget > 40 || budget < -40) fail = true;     // :31044-31049 X 预算
          if (fail) {
            // 100 次无解 → 停摆（466 localAI1=1 :31050-31052 / 580 +=2 :31174-31177）
            if (++attempts >= 100) {
              this.vx = 0; this.vy = 0;
              if (this.projId === 466) this.lai1 = 1;
              else if (this.lai1 < 1) this.lai1 += 2;
              settled = true;
              break;
            }
            continue;
          }
          pickX = cx; pickY = cy;
          break;
        }
        if (!settled) {
          this.lai0 += pickX * (this.extraUpdates + 1) * 2 * spd;   // :31045
          // velocity = pick.RotatedBy(ai[0]+π/2) × spd（:31046-31048）
          const a = this.ai0 + Math.PI / 2;
          const c = Math.cos(a), s = Math.sin(a);
          this.vx = (pickX * c - pickY * s) * spd;
          this.vy = (pickX * s + pickY * c) * spd;
          this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        }
        this.recordStep();
      }
      // 引擎位移（UpdatePosition :19026 逐子步）
      this.x += this.vx;
      this.y += this.vy;
    }
    // 撞块（tileCollide=true；HandleMovement 撞实心 → :16896-16903 停摆不消亡）
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    const st = game.world.store;
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }
    if (st.get(tx, ty) !== 0) {
      game.cutTile?.(tx, ty);
      if (st.isSolid(tx, ty) && this.lai1 < 1) {
        this.lai1 += 2;
        this.vx = 0; this.vy = 0;
      }
    }
    // 命中玩家：本体 ∪ oldPos 轨迹逐点矩形（Colliding :14733-14744；敌弹不消耗）
    hitPlayer(this, game, this.damage);
    for (let i = 0; i < this.trail.length; i += 2) {
      const px = this.trail[i], py = this.trail[i + 1];
      if (px === 0 && py === 0) continue;                  // Zero 槽跳过（:14735）
      if (hitPlayer({ x: px, y: py, w: this.w, h: this.h }, game, this.damage)) break;
    }
    hitTownNpcs(this, game, this.damage, 0, 'hostile');
    hitCritters(this, game);
  }

  draw(r: Renderer, _cam: Camera): void {
    // Main.cs:33678-33760：沿 oldPos 逐段 DrawLaser(Extra_33)。466 三层 / 580 两层
    const ctx = r.ctx;
    if (!ctx) return;
    const tex = extra33();
    // 折线点列：oldPos（最老→最新，Zero 槽跳过）→ 本体中心（:33705 oldPos[0]→end 段）
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < this.trail.length; i += 2) {
      if (this.trail[i] === 0 && this.trail[i + 1] === 0) continue;
      pts.push([this.trail[i] + this.w / 2, this.trail[i + 1] + this.h / 2]);
    }
    pts.push([this.cx, this.cy]);
    const passes: Array<{ w: number; col: string }> = this.projId === 466
      ? [{ w: 0.6, col: 'rgba(115,204,219,0.5)' },
        { w: 0.4, col: 'rgba(113,251,255,0.5)' },
        { w: 0.2, col: 'rgba(255,255,255,0.5)' }]
      // 580 停摆（localAI1∈{−1,1}）后各层 −0.2（Main.cs:33726）
      : [{ w: this.lai1 === -1 || this.lai1 === 1 ? 0.3 : 0.5, col: 'rgba(115,244,219,0.5)' },
        { w: this.lai1 === -1 || this.lai1 === 1 ? 0.1 : 0.3, col: 'rgba(255,255,255,0.5)' }];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.5) continue;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      for (const p of passes) {
        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(ang);
        if (tex && tex.width > 0) {
          const bw = BAND_W * p.w;
          ctx.drawImage(tex, 0, BAND_Y, BAND_W, BAND_H,
            -bw / 2, 0, bw, len);   // 体带沿段拉伸（LightningLaserDraw stage1 近似）
        } else {
          ctx.strokeStyle = p.col;
          ctx.lineWidth = Math.max(1, 14 * p.w * 0.3);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
