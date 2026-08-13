// 宠物跟随实体（vanity/light pet 的视觉体）。原版宠物 = 独立投射物 AI（每款
// 专属 AI：Bunny/Slime/追踪悬停各异——Projectile.AI 全量移植工程量大，此处为
// 【统一跟随 AI 近似】：悬停玩家肩后 + 正弦浮动 + 远距瞬移，动画横排帧假设；
// 偏差已记录，逐款 AI 待宠物系统二期）。
// 存续语义 = Player.UpdatePet（Player.cs:17147-17162）：装备槽 buffType 在位
// 即存活；Game 每帧 ensure/despawn（见 Game.updatePets）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projectileData } from '../data/vanillaProjectiles';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class PetFollower extends Entity {
  w = 16;
  h = 16;
  dead = false;
  /** 慢速帧计时（每 8 tick 进一帧） */
  private animTick = 0;

  constructor(x: number, y: number, public readonly projId: number,
    private ownerRef: () => { x: number; y: number; w: number; h: number; cx: number; cy: number; facing: number; dead: boolean } | null) {
    super();
    this.x = x; this.y = y;
    const pd = projectileData(projId);
    this.w = pd?.width ?? 16;
    this.h = pd?.height ?? 16;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    void game;
    const p = this.ownerRef();
    if (!p || p.dead) { this.dead = true; return; }
    this.animTick++;
    // 目标位：玩家肩后（朝向反向 ×22px，头侧 -26px）+ 正弦浮动（±4px，0.06/t）
    const bob = Math.sin(this.animTick * 0.06) * 4;
    const tx = p.cx - p.facing * 22 - this.w / 2;
    const ty = p.y - 26 + bob;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1200) {
      // 远距瞬移（原版宠物超距重生近似）
      this.x = tx; this.y = ty;
      return;
    }
    // 追赶：钳速 6px/t（近距缓动收敛——dist 本身做步长上限）
    const step = Math.min(6, dist);
    if (dist > 0.01) {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`);
    const ctx = r.canvas.getContext('2d');
    if (!ctx || !img) return;
    // 横排帧假设：帧宽 = 贴图高（方形帧）；不足一帧的整图直接画
    const fw = img.height;
    const frames = fw > 0 ? Math.max(1, Math.floor(img.width / fw)) : 1;
    const fi = frames > 1 ? Math.floor(this.animTick / 8) % frames : 0;
    const p = this.ownerRef();
    const flip = p ? p.facing < 0 : false;
    ctx.save();
    if (flip) {
      ctx.translate(this.x + this.w, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, fi * fw, 0, fw, fw, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, fi * fw, 0, fw, fw, this.x, this.y, this.w, this.h);
    }
    ctx.restore();
  }
}
