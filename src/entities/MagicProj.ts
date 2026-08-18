// 魔法投射物(直飞发光弹兜底实体;G9 贴图化):
// 行为 = 直线飞行、撞块消失、命中伤害、寿命短(spark 30tick 语义)。
// 渲染 = projId 有效时走原版 Projectile_N.png 贴图(Main.DrawProj 通用分支
//   Main.cs:32360-32371:中心锚 + proj.rotation + proj.scale),复用 Arrow.ts
//   导出的 projSprite/projFrameImg/projFrameCount(竖向多帧行切片)与
//   PROJ_ROT_RIGHT 旋转模式表;projId 缺省(0)或表未就绪 → 圆点兜底。
// ★可控导弹族(aiStyle 9/20/28,16/34/79 等)已分流 MissileProj(MagicMissileProj),
//   其 Main.cs:32420-32442 的 lerp 缩放/拖尾专属分支【不在此实现】——本类只做
//   通用贴图绘制,勿把那族特例搬进来。
import { Entity } from './Entity';
import { hitCritters, hitTownNpcs, playEnemyHitSound } from './projTargets';
import { projSprite, projFrameImg, projFrameCount, PROJ_ROT_RIGHT } from './Arrow';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class MagicProj extends Entity {
  /** GetWeaponCrit 合并值（Game 注入；缺省 4% 基础） */
  critChance = 0.04;
  w = 6; h = 6;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  dead = false;
  color: string;
  grav = 0;
  /** 原版弹型 id（= item.shoot）：贴图/帧数/旋转模式/绘制 scale 的数据源。
   *  0 = 未指定 → 圆点兜底（联机 kind 4 重建路径与旧 spawn 调用兼容）。
   *  ★联机分类陷阱：netSnapProj（Game.ts:836-857）的分支序是
   *    `p instanceof Arrow` → `instanceof Dart` → `p.projId !== undefined`（:849）
   *    → `instanceof TrapShot` → `p.color !== undefined`（:857）。
   *  本字段一旦赋值，MagicProj 会被 :849 抢先分类成 kind 1（WeaponProj 族），
   *  访客端重建 new Boomerang(...)——sprite 与朝向全错。主会话接线 spawn 点传
   *  projId 时【必须同步】在 :849 之前加 `else if (p instanceof MagicProj)`
   *  分支（kind 4，tag 载 projId 或颜色），见报告单点清单。 */
  projId = 0;
  /** SetDefaults scale（vanilla-projectiles.json scale 列；绘制尺寸 = 贴图原生 × scale，
   *  与判定盒 w/h 解耦——同 Arrow.drawScale 注释） */
  drawScale = 1;
  /** 出生态 tick（多帧行帧推进用；联机傀儡不推进 = 帧冻结，同 Arrow.age 语义） */
  private age = 0;

  /** 第 8 参 projId 为可选尾参（缺省 0=圆点）：既有调用点
   *  Game.ts:1024（联机 kind 4 重建）/ :5992（旧 heldDef.magic 直射）零改动兼容。
   *  主会话接线时在 :5992 尾部补 `itemCombat(viIdFromKey(heldDef.key))?.shoot ?? 0`。 */
  constructor(x: number, y: number, vx: number, vy: number, damage: number, life: number, color: string, projId = 0) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.life = life;
    this.color = color;
    this.projId = Math.max(0, Math.trunc(projId || 0));
    if (this.projId > 0) {
      const pd = projectileData(this.projId);
      // 判定盒/绘制 scale 按弹型取 SetDefaults（同 Arrow.ts 构造器：width/height/scale）
      if (pd?.width) this.w = pd.width;
      if (pd?.height) this.h = pd.height;
      this.drawScale = pd?.scale ?? 1;
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标)
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    if (this.projId > 0 && this.drawProjTexture(ctx)) return;
    // 兜底圆点(projId 未指定 或 贴图未就绪)
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 贴图绘制（Main.DrawProj 通用分支 Main.cs:32360-32371 1:1）：
   *  位置 = Center、origin = 帧中心、rotation = proj.rotation、scale = proj.scale。
   *  rotation 取值同 Arrow.draw（PROJ_ROT_RIGHT 注释：朝右族 atan2(vy,vx) +
   *  向左运动水平镜像；默认朝上族 atan2+π/2，AI_001 尾部 Projectile.cs:54877）。
   *  多帧行切片：帧号按 age/5 档推进（Arrow 同款近似；原版逐型 frameCounter 在
   *  AI 内推进，Projectile.cs:20963 起散布，兜底实体不做逐型直译）。
   *  @returns false = 贴图未就绪，调用方走圆点兜底 */
  private drawProjTexture(ctx: CanvasRenderingContext2D): boolean {
    const frames = projFrameCount(this.projId);
    const sliced = frames > 1 ? projFrameImg(this.projId, Math.floor(this.age / 5) % frames) : null;
    const img = sliced ?? projSprite(this.projId);
    if (!img) return false;
    // 就绪判定同 Arrow.draw：HTMLImageElement 未 complete / 零宽 = 未就绪
    const asImg = img as HTMLImageElement;
    if ((asImg.width > 0) === false) return false;
    const iw = (img as HTMLCanvasElement).width || asImg.width;
    const ih = (img as HTMLCanvasElement).height || asImg.height;
    if (!iw || !ih) return false;
    const ang = Math.atan2(this.vy, this.vx);
    const rightArt = PROJ_ROT_RIGHT.has(this.projId);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.cx, this.cy);
    if (rightArt && this.vx < 0) {
      // 先镜像再旋转（Arrow.draw 同式：R(π−ang)∘M ≡ 原版 spriteDirection 翻转）
      ctx.scale(-1, 1);
      ctx.rotate(Math.PI - ang);
    } else {
      ctx.rotate(rightArt ? ang : ang + Math.PI / 2);
    }
    const s = this.drawScale;
    ctx.drawImage(img as CanvasImageSource, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
    ctx.restore();
    return true;
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    this.age++;
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    // 小动物:一击致死并消耗弹体(近战挥砍同语义)
    if (hitCritters(this, game)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; dead: boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        playEnemyHitSound(game, e);
        const crit = Math.random() < this.critChance; // 暴击链（P:52512——曾恒 false）
        e.hurt(crit ? this.damage * 2 : this.damage, Math.sign(this.vx) * 2, 0, game, 0, false, 0, true);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#C080FF');
        this.dead = true;
        return;
      }
    }
    // 城镇 NPC 受击(原版 friendly 弹对 NPC 同效;一碰即碎同敌怪)——窄门 =
    // 巫毒(22/54) ∪ 臭鸡蛋 318（Damage_PVE_Inner :11970-11972，projId 传入）
    if (hitTownNpcs(this, game, this.damage, Math.sign(this.vx) * 2, 'playerProj', this.projId)) { this.dead = true; return; }
  }
}
