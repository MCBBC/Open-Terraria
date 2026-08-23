// 链锯/钻头/插孔锤族持械弹（AI_020 :23837-23942 共用段，Projectile.cs）：
//   509 屠夫链锯 3098（22×22 scale1.2 :5516-5521，2 帧 2t/帧 :23853-23865）
//   252 叶绿插孔锤 1262（18×18 scale1.1 :3083-3089，4 帧 4t/帧 :23840-23852）
// channel 持械——挂玩家手（position = RotatedRelativePoint(MountedCenter) − size/2
// :23879/:23921-23922）、velocity = 瞄准向归一×(shootSpeed×scale)（每帧直写
// :23884-23902）、松链即 Kill（:23904-23907）；音效按持械物品 pick 分档
// （:23866-23878：>0 → Item190 每 15t，否则 Item189 每 20t）；rotation =
// atan2(vy,vx)+1.57（:23923）；尘 31 火花（1/6、出生 = position+velocity×
// Next(6,10)×0.1 前向偏移、X−4、noGravity、vy = −Next(7,13)×0.15 向上反溅
// :23933-23941）；velocity.X 抖动 ×(1+Next(−3,4)×0.01)（:23932）。
// 命中 = 弹盒（SetDefaults 宽高）持续判定 + 同敌 10t 免疫（509
// usesIDStaticNPCImmunity+idStaticNPCHitCooldown 10 :5523-5524；252 走
// ownerHitCheck+immune[owner] 默认档 DefaultToDrillOrChainsaw :10148-10159——
// 同 10t 口径，1.4.5.6 ai20 无 -1 特判）。
// ★挖块交互登记：原版 aiStyle20 弹体本身不挖块——挖掘由持械物品经
// ItemCheck_UseMiningTools（:44967，channel 期 toolTime 按 useTime 循环
// :42891-42899 照常结算）并行完成，弹体只承载接触伤害。本仓同构承接：Game
// 工具分支 tryMine 并行挖掘（1262 tool.useTime=7 节奏 / 3098 axe30 经
// itemFuncTool 桥接），弹体侧无 CutTiles/KillTile 逻辑（原版同构，非债）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound, playerCanHitEnemy } from './projTargets';

/** 玩家侧挂点状态（RotatedRelativePoint 消费，Player.cs:4063-4089）：
 *  cx/cy = MountedCenter（:3189-3194；本仓不建模坐骑挂点偏移，恒等玩家中心）；
 *  h = 盒高（Bottom 推算用）；gfxOffY = 视觉纵向补偿（挂绳，Player.gfxOffY 已建模）；
 *  fullRotation 本仓不建模（重力旋转族未接，缺省 0 → 旋转项恒等，
 *  RotatedRelativePoint 退化为 MountedCenter+gfxOffY 竖移——与原版常规态一致） */
export interface SawOwner {
  cx: number; cy: number; facing: number; dead: boolean;
  h?: number; gfxOffY?: number; fullRotation?: number;
}

/** RotatedRelativePoint(MountedCenter)（P.cs:23879 调用 → Player.cs:4063-4089）：
 *  绕 Bottom+(0,gfxOffY) 旋 fullRotation，再叠加坐骑挂点竖移 vector2 =
 *  (0,−num2)+(0,num2).RotatedBy(num)，num2 = mount.PlayerOffset/2+4（本仓无坐骑
 *  建模 → PlayerOffset 0 → num2 = 4）。addGfxOffY 缺省 true → pos.Y 先 += gfxOffY */
export function rotatedRelativePoint(o: SawOwner): { x: number; y: number } {
  const rot = o.fullRotation ?? 0;
  const gfx = o.gfxOffY ?? 0;
  const num2 = 4;                                   // mount.PlayerOffset(0)/2 + 4
  const bx = o.cx, by = o.cy + (o.h ?? 42) / 2 + gfx;   // vector = Bottom + (0,gfxOffY)
  const px = o.cx, py = o.cy + gfx;                 // pos.Y += gfxOffY（addGfxOffY）
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const dx = px - bx, dy = py - by;
  const v2x = -sn * num2, v2y = num2 * cs - num2;   // (0,−num2)+(0,num2).RotatedBy(rot)
  return { x: bx + dx * cs - dy * sn + v2x, y: by + dx * sn + dy * cs + v2y };
}

export interface ChainsawOpts {
  /** 弹型（509 链锯 / 252 插孔锤；其余 aiStyle20 族同段共用） */
  projId: number;
  /** 持械物品镐力（音效分档 :23868——原版读 inventory[selectedItem].pick） */
  pick?: number;
  /** 持械物品 shootSpeed（:23884；509=48 / 252=46，Item.cs SetDefaults） */
  shootSpeed?: number;
}

export class ChainsawProj extends Entity {
  /** SetDefaults 宽高（509 :5516-5521 / 252 :3083-3089）——构造按 projId 定 */
  w: number;
  h: number;
  readonly projId: number;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  private frame = 0;
  private frameCtr = 0;
  private sndT = 0;
  private hitCd = new Map<number, number>();
  private owner: SawOwner;
  /** 音效分档阈值数据：持械物品 pick（:23868） */
  private pick: number;
  /** 出膛速度模 = shootSpeed×scale（:23884；509 48×1.2 / 252 46×1.1） */
  private speed: number;
  channelCb: () => boolean;
  aimCb: () => { x: number; y: number };
  dead = false;
  /** 绘制 scale（SetDefaults：509=1.2 :5522 / 252=1.1 :3088） */
  private drawScale: number;

  constructor(owner: SawOwner, damage: number, knockback: number,
    channelCb: () => boolean, aimCb: () => { x: number; y: number },
    opts?: Partial<ChainsawOpts>) {
    super();
    this.owner = owner;
    this.damage = damage;
    this.knockback = knockback;
    this.channelCb = channelCb;
    this.aimCb = aimCb;
    this.projId = opts?.projId ?? 509;
    this.pick = opts?.pick ?? 0;
    this.drawScale = this.projId === 252 ? 1.1 : 1.2;   // :3088 / :5522
    this.w = this.h = this.projId === 252 ? 18 : 22;    // :3084-3085 / :5517-5518
    this.speed = (opts?.shootSpeed ?? (this.projId === 252 ? 46 : 48)) * this.drawScale;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // channel 门（:23882-23907）：断链即 Kill
    if (!this.channelCb()) { this.dead = true; return; }
    // 帧动画（:23840-23865）：252 = 4 帧 4t/帧；509 = 2 帧 2t/帧
    const ft = this.projId === 252 ? 4 : 2;
    if (++this.frameCtr >= ft) { this.frameCtr = 0; this.frame = (this.frame + 1) % ft; }
    // 链锯音分档（:23866-23878）：持械物品 pick>0 → Item190 每 15t（钻族）；
    // 否则 Item189 每 20t（链锯/插孔锤——509 axe30/pick0、252 hammer90/pick0 均此档）
    if (--this.sndT <= 0) {
      if (this.pick > 0) {
        this.sndT = 15;
        game.playSfxFiles(['Item_190'], 1, this.cx, this.cy);
      } else {
        this.sndT = 20;
        game.playSfxFiles(['Item_189'], 1, this.cx, this.cy);
      }
    }
    // 挂手（:23879 vector18 = RotatedRelativePoint(MountedCenter)；:23921-23922
    // position = vector18 − size/2）——含持械旋转偏移/挂绳 gfxOffY
    const anchor = rotatedRelativePoint(this.owner);
    // 瞄准直写（:23884-23902）：vel = (鼠标世界位 − anchor) 归一 ×(shootSpeed×scale)
    const aim = this.aimCb();
    const avx = aim.x - anchor.x, avy = aim.y - anchor.y;
    const al = Math.hypot(avx, avy) || 1;
    this.vx = avx / al * this.speed;
    this.vy = avy / al * this.speed;
    // 面向（:23909-23916）：velocity.X 符号 ChangeDir
    if (this.vx > 0) this.owner.facing = 1;
    else if (this.vx < 0) this.owner.facing = -1;
    this.x = anchor.x - this.w / 2;
    this.y = anchor.y - this.h / 2;
    // velocity.X 抖动（:23932）：×(1+Next(−3,4)×0.01)——原版在旋转/尘之前，
    // 每帧被 channel 直写覆盖，实际只影响下方尘的前向偏移
    this.vx *= 1 + (Math.floor(Math.random() * 8) - 3) * 0.01;
    // 尘 31 火花（:23933-23941）：1/6、出生 = position+velocity×Next(6,10)×0.1
    // （单掷同乘双轴 → 前向偏移 0.6-0.9）、position.X−4、noGravity、
    // velocity×0.2 后 vy = −Next(7,13)×0.15（向上反溅）
    if (Math.floor(Math.random() * 6) === 0) {
      const k = (6 + Math.floor(Math.random() * 4)) * 0.1;   // Next(6,10) ∈ [6,9]
      const dx = this.x + this.vx * k, dy = this.y + this.vy * k;
      const d = game.spawnDust?.(dx, dy, this.w, this.h, 31, 0, 0, 80, null, 1.4);
      if (d) {
        d.x -= 4;                                            // :23936
        d.noGravity = true;                                  // :23937
        d.vx *= 0.2;                                         // :23939
        d.vy = -(7 + Math.floor(Math.random() * 6)) * 0.15;  // :23940 −Next(7,13)×0.15
      } else {
        // 无尘池兜底：反弹速度只落 grav 参数（spawnParticles 无初速参）
        game.spawnParticles(dx + this.w / 2 - 4, dy + this.h / 2, '#D8B878', 1, 1.4,
          { life: 18, grav: -0.15 });
      }
    }
    // 命中（弹盒持续 + 10t 冷却）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit);   // 音/飘值=单点
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const frames = Math.max(1, Math.round(img.height / img.width));
    const fh = img.height / frames;
    const idx = Math.min(frames - 1, this.frame % frames);
    const rot = Math.atan2(this.vy, this.vx) + Math.PI / 2 + 1.57;   // :23923（+π/2 贴图纵向 +1.57 链锯修正）
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(rot);
    if (this.vx < 0) ctx.scale(1, -1);
    ctx.imageSmoothingEnabled = false;
    const dw = img.width * this.drawScale, dh = fh * this.drawScale;
    ctx.drawImage(img, 0, idx * fh, img.width, fh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}
