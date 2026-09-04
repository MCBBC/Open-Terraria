// SW-Q1 2026-09-03：集束弹药裂片（ProjectileID.ClusterFragmentsI/II 779/783 +
// ClusterSnowmanFragmentsI/II 862/863）——发射源定谳（I 代理备案"DD2 专支"实为
// 火箭发射器弹药族,非 DD2 哨塔）：
//   · 779 ← Kill(776 ClusterRocketI / 777 ClusterGrenadeI / 778 ClusterMineI)
//   · 783 ← Kill(780 ClusterRocketII / 781 ClusterGrenadeII / 782 ClusterMineII)
//   · 862/863 ← Kill(803/804 ClusterSnowmanRocketI/II)
//   原文=Projectile.Kill_Bombs_DoUsualKillCode（Projectile.cs:79799-79823）:
//   owner==Main.myPlayer 时每爆 6 片,基角 NextFloat×2π、环速 4+NextFloat×2、
//   vy−1;伤=damage/2（C# 整除截断）、kb=0;发射器链见 AmmoID.Sets.
//   SpecificLauncherAmmoProjectileMatches（AmmoID.cs:11-103）——本仓
//   vanillaItemCombat.SPECIFIC_LAUNCHER_AMMO 已有,弹由 Game.ts 发射器支
//   GrenadeProj(fired) 的 Kill 回调裂解。
// SetDefaults（P.cs:7941-7952 共档 `(776..801)||(803..810)`）：14×14/aiStyle16/
//   friendly/penetrate -1/ranged;不含 usesLocalNPCImmunity（该档仅 777/781/794/
//   797/800/785/788/800）。timeLeft=60（NewProjectile 后置表 P.cs:11055/11059/
//   :11063）再 −Next(30) → 31..60（:79822）。
// AI_016（P.cs:47763-48404）：专支尘 :48265-48283（1/25 尘 228 + 独立 1/5 尘 31,
//   spawn 速 −v/10 被 velocity×0 覆写归零、scale 绝对 1.3、noGravity、alpha 100;
//   两掷独立可同拍双出）+ 帧初始化 :48277-48286（frameCounter==0 → 1、
//   frame=Next(4),Main.cs:8587-8590 projFrames=4,贴图 14×64 四帧竖条）+ 重力门
//   :48377 第一析取支（ai[0]>10 开门 → vy+0.2;落地帧 vy==0&&vx≠0 → vx×0.97、
//   |vx|<0.01 归零 :48379-48385）+ 滚转 :48404（不在排除表 → rot+=vx×0.1）。
// Kill（timeLeft≤3 → :48034 AI Kill）：PrepareBombToBlow :47674-47678
//   Resize(48,48) knockBack=8 → 48×48 伤盒（半宽 24,旧 hurtBox16 表 11 档不适用,
//   裂片走本实体回调自管）;地形闸门 :79027 表含 783/863 → r3（:79052 组）、
//   779/862 不在表 = 不毁地形（Game.EXPLODE_RADIUS 783:3/863:3 已有）。
//   Kill 视觉 :79719-79783（Item62+尘 31×15/228×10/226×3+gore 61-64）——
//   SW-R3 2026-09-03（Q-4）起由 Game.explodeAt 裂片专支逐参承载（旧"通用爆炸
//   近似/视觉单口径"备案退役;母弹专支 :79753-79800 同批）。
import { Entity } from './Entity';
import { moveAndCollide } from '../physics/TileCollision';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projectileSnapStrikeBonus } from '../stats/SnapStrike';

/** 父弹（集束火箭/榴弹/感应雷 I/II + 雪人炮集束 I/II）→ 裂片弹型
 *  （P.cs:79803-79814 num52 选择式） */
export const CLUSTER_FRAGMENT_OF: Record<number, number> = {
  776: 779, 777: 779, 778: 779,
  780: 783, 781: 783, 782: 783,
  803: 862, 804: 863,
};

/** SW-Q1：专支尾尘 spawn 规格纯函数（AI_016 :48265-48276 逐参）。两掷独立可同拍
 *  双出——Next(25)==0 → 尘 228、Next(5)==0 → 尘 31（调用方按原序掷）;spawn 速
 *  = −v/10（原版 NewDust 后 `velocity *= 0f` 整体覆写 → 终速恒 0,调用方归零）、
 *  scale 绝对 1.3、alpha 100、noGravity。 */
export function fragmentTrailDustSpecs(vx: number, vy: number, hit228: boolean, hit31: boolean):
  Array<{ type: number; svx: number; svy: number; scale: number }> {
  const out: Array<{ type: number; svx: number; svy: number; scale: number }> = [];
  if (hit228) out.push({ type: 228, svx: -vx / 10, svy: -vy / 10, scale: 1.3 });
  if (hit31) out.push({ type: 31, svx: -vx / 10, svy: -vy / 10, scale: 1.3 });
  return out;
}

/** 裂片贴图帧数（Main.cs:8587-8590 projFrames[779/783/862/863]=4） */
const FRAGMENT_FRAMES = 4;

export class ClusterFragmentProj extends Entity {
  w = 14; h = 14;                     // SetDefaults 14×14（P.cs:7942-7943）
  vx: number;
  vy: number;
  damage: number;
  projId: number;
  dead = false;
  /** 引信（timeLeft;NewProjectile 表 60 − 发射侧 Next(30) → 本仓在出生点传值） */
  private fuse: number;
  /** 暴击率（父弹发射玩家 crit——原版 Damage_PVE 按 owner 玩家面板掷） */
  critChance = 0;
  onExplode: (x: number, y: number, damage: number, oldVx?: number) => void;
  private rot = 0;
  /** ai[0]（:48332 每 tick +1;重力门节拍轴） */
  private ai0 = 0;
  private frameCounter = 0;
  private frame = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    projId: number, fuse: number, onExplode: (x: number, y: number, damage: number, oldVx?: number) => void) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;   // NewProjectile position=Center−Size/2（P.cs:10878）
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.projId = projId;
    this.fuse = fuse;
    this.onExplode = onExplode;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // SW-R3 2026-09-03（蓝队 L-6）：dead 守卫——Entities.update 对 dead 实体仍泵
    // fixedUpdate（compact 在桶尾），直泵重入面（父弹 Kill 裂解回调内再进
    // updateSwing 通道等）与 GrenadeProj SW-L1 守卫同式
    if (this.dead) return;
    const st = game.world.store;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.dead = true;                // 出界静默消亡（P.cs:16793-16802）
      return;
    }
    // 接触引爆（Damage_PVE_Inner :12330-12340 aiStyle16：full 结算 + timeLeft 钳 3;
    // 裂片在 BOMB_DAMAGE_KEEP_16 豁免表内=接触伤=发射伤 d/2,kb=0/pen=0——
    // NewProjectile 弹不吃武器穿甲 P.cs:79821 七参重载无 armorPen 位）
    if (this.fuse > 3) {
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; cx: number; cy: number;
          dead?: boolean;
          hurt?: (d: number, kx: number, ky: number, g: unknown, pen?: number, crit?: boolean, pierce?: number, fp?: boolean) => boolean };
        if (e.dead) continue;
        if (this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y) {
          const dir = (e.x + e.w / 2) < this.cx ? -1 : 1;
          const crit = Math.random() < (this.critChance || 0.04);
          const snap = projectileSnapStrikeBonus(game, this, e.cx, e.cy,
            (e as unknown as { id?: number }).id ?? -1,
            { victimBox: { w: e.w, h: e.h, cx: e.cx, cy: e.cy } });
          e.hurt?.(this.damage + (snap ? Math.trunc(snap * (crit ? 2 : 1)) : 0),
            dir * 0, 0, game, 0, crit, 0, true);
          this.fuse = 3;
          break;
        }
      }
      if (this.fuse > 3) {
        for (const cent of game.critters?.() ?? []) {
          const c = cent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (g: unknown) => boolean };
          if (!c || c.dead) continue;
          if (this.x < c.x + c.w && this.x + this.w > c.x
            && this.y < c.y + c.h && this.y + c.h > c.y) {
            c.hurt?.(game);
            this.fuse = 3;
            break;
          }
        }
      }
    }
    // 引信爆（原版 AI 头 timeLeft≤3 Kill → Update 尾 dec;本仓 SW-L1 口径
    // post-dec ≤2 ≡ pre-dec ≤3——与 GrenadeProj 同式）
    if (--this.fuse <= 2) {
      this.dead = true;
      game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
      // SW-AC1 2026-09-04：尾参 oldVx=Kill 态弹末 vx——Game 侧换算 kbDir 弹体朝向
      //  （Projectile.direction,Update :17121-17132 sign(velocity.X);裂片 779/783/
      //  862/863 aiStyle16 自动面,0→+1 else 档）
      this.onExplode(this.cx, this.cy, this.damage, this.vx);
      return;
    }
    // ---- 专支尘（P.cs:48265-48276 逐参;两掷独立,可同拍双出）----
    for (const spec of fragmentTrailDustSpecs(this.vx, this.vy,
      Math.random() < 1 / 25, Math.random() < 1 / 5)) {
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, spec.type,
        spec.svx, spec.svy, 100, null, spec.scale, true);
      if (d) { d.noGravity = true; d.vx = 0; d.vy = 0; d.scale = spec.scale; }   // :48270-48273 逐字
    }
    // 帧初始化（:48277-48286）：首拍 frame=Next(4) 后 frameCounter 钉 1 不再改
    if (this.frameCounter === 0) {
      this.frameCounter = 1;
      this.frame = Math.floor(Math.random() * 4);
    }
    // 重力门（:48377 第一析取支 779/783/862/863 ∈ 名单 → ai[0]>10 开门）
    this.ai0 += 1;
    if (this.ai0 > 10) {
      if (this.vy === 0 && this.vx !== 0) {              // 落地帧摩擦（:48379-48385）
        this.vx *= 0.97;
        if (this.vx > -0.01 && this.vx < 0.01) this.vx = 0;
      }
      this.vy += 0.2;   // SW-R3 2026-09-03（F-6①）：SW-N1 定谳——AI_016 :48394 恒
                        // +0.2 无终端钳（仅 911 有 Clamp :48396-48399）,去钳
    }
    // 位移+撞块（aiStyle16 通用反弹 ×−0.4——与 GrenadeProj firedStep 同式;
    // 裂片不在 FIRED_STICK 撞块 vel=0 表）
    const lastVx = this.vx, lastVy = this.vy;
    const bodyY0 = this.y;   // SW-R3 2026-09-03（F-6②）：本拍积分前 y（残差=实际位移）
    // SW-AQ1 2026-09-05：oldPosition 上报（Update :17118 AI 后/位移前置位）——
    //  779/783/862/863 走 objType 4 扫描（:19978）,新旧位判定
    //  （Collision.cs:3346-3353/:3356）消费
    this.oldX = this.x; this.oldY = this.y;
    const body = {
      x: this.x, y: this.y, w: this.w, h: this.h,
      vx: this.vx, vy: this.vy,
      onGround: false, hitWall: false, hitHead: false, collideY: false,
      tileCollide: true, dropThrough: true,
    };
    moveAndCollide(body, game.world, this.vx, this.vy);
    this.x = body.x; this.y = body.y;
    this.vx = body.vx; this.vy = body.vy;
    if (body.hitWall) this.vx = lastVx * -0.4;
    if (body.collideY || body.onGround || body.hitHead) {
      if (lastVy > 0.7) this.vy = lastVy * -0.4;
      // SW-R3 2026-09-03（F-6②）：软着陆保留钳速残差（=本拍实际 Y 位移）——
      // GrenadeProj SW-N1 ③ 同款:TileCollision 只回钳速度,响应支 lastVy≤0.7
      // 不写 vy → 残差存活到下拍;旧 `vy=0` 吞残差 → 下拍 vy==0 摩擦门提前 1 拍
      else this.vy = this.y - bodyY0;
    }
    // CutTiles（CanCutTiles:friendly&&damage>0 → 草/藤切割,同 GrenadeProj 单格心）
    game.cutTile(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
    this.rot += this.vx * 0.1;                           // 滚转（:48404,裂片不在排除表）
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // 帧支（Main.cs:33693 组 proj.type∈{779,783,862,863} → Frame(1,projFrames,0,frame)
      // 竖条 4 帧 14×16;SW-L1 I-4 同款底行 −1 shave）。dest = Center−origin,
      // origin=(贴图宽/2=7, 盒高/2+off143=7)（Main.cs 通支 num145/num151）,
      // dest 高 = 宽×(帧源高/宽) = 15
      const fh = img.height / FRAGMENT_FRAMES;
      const sh = fh - 1;
      ctx.drawImage(img, 0, fh * this.frame, img.width, sh, -7, -7, img.width, img.width * (sh / img.width));
    } else {
      ctx.fillStyle = '#C06020';
      ctx.fillRect(-7, -7, 14, 14);
    }
    ctx.restore();
  }
}
