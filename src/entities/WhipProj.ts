// 鞭投射物（原版 ProjectileAI_Whip，Projectile.cs:45600 起 1:1 主干简化）：
//  ai[0] 计时飞出/收回（timeToFlyOut = useAnimation/2，:45600），长度 =
//  shootSpeed × useAnimation×2 × 进度包络（:45642 num7），命中段为玩家到鞭尖的
//  弧线折线；命中敌人施加伤害 + tag（ItemID.UniqueTagEffects TagDamage，
//  240t 内随从对该敌伤害 +N）。绘制走 projFrame 单帧贴图沿切向排布（近似
//  原版 Bezier 段绘制）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { projFrameImg, projFrameCount } from './Arrow';

/** ItemID.UniqueTagEffects（ItemID.cs:1303-1350）：鞭 → tag 附加伤害
 *  （未列入的鞭 TagDamage=0 或走默认表；星璇/万花筒特效简化为纯伤害） */
const WHIP_TAG: Record<number, number> = {
  5688: 3, 5473: 3, 4672: 4, 5474: 5, 5475: 5, 5476: 2,
  4913: 6, 5074: 7, 4911: 8, 5477: 5, 4678: 9, 5478: 10, 5479: 10,
  4679: 11, 4914: 13, 5480: 14, 4680: 14, 4912: 15,
};

export interface WhipTagged {
  /** 鞭 tag 剩余 tick（240=4 秒；原版 ApplyTag → npc.whipTimeLeft） */
  whipTagT?: number;
  /** tag 附加伤害（最近一次命中鞭的 TagDamage） */
  whipTagDmg?: number;
}

export function whipTagDamageOf(itemId: number): number {
  return WHIP_TAG[itemId] ?? 0;
}

export class WhipProj extends Entity {
  w = 12; h = 12;
  dead = false;
  /** 原版鞭投射物 id（贴图来源） */
  projId: number;
  /** 鞭物品 id（tag 查表） */
  itemId: number;
  damage: number;
  knockback: number;
  /** 鞭最大长度 px（shootSpeed × useAnimation×2） */
  maxLen: number;
  /** 总时长（= useAnimation）与已飞 tick */
  anim: number;
  private t = 0;
  private ang: number;
  private spriteDir: number;
  private hitSet = new Set<number>();
  private ownerRef: () => Player | null;

  constructor(
    x: number, y: number, ang: number, projId: number, itemId: number,
    damage: number, knockback: number, anim: number, speed: number,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y;
    this.ang = ang;
    this.projId = projId;
    this.itemId = itemId;
    this.damage = damage;
    this.knockback = knockback;
    this.anim = anim;
    this.maxLen = speed * anim * 2; // :45642 数量级（皮鞭 4×60=240px）
    this.spriteDir = Math.cos(ang) >= 0 ? 1 : -1;
    this.ownerRef = owner;
  }

  /** 鞭尖位置（飞出/收回包络：前半程伸展、后半程收回；弧线下垂 num2=0.5 档） */
  private tip(): { x: number; y: number } {
    const p = Math.min(1, this.t / (this.anim / 2)); // 飞出进度
    const out = this.t < this.anim / 2 ? p : 1 - (this.t - this.anim / 2) / (this.anim / 2);
    const len = this.maxLen * Math.max(0, out);
    const sag = Math.sin(p * Math.PI) * 24; // 弧线下垂
    return {
      x: this.x + Math.cos(this.ang) * len,
      y: this.y + Math.sin(this.ang) * len + sag,
    };
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (++this.t >= this.anim) { this.dead = true; return; }
    const owner = this.ownerRef();
    if (owner) { this.x = owner.cx; this.y = owner.cy; } // 根部钉在玩家身上
    const tip = this.tip();
    // 命中：根部→鞭尖线段（分段采样，段半径 8px）与敌 AABB 相交
    const dmg = Math.max(1, Math.round(this.damage * (owner ? owner.damageMult('magic') : 1)));
    const segs = 6;
    for (let s = 1; s <= segs; s++) {
      const k = s / segs;
      const sx = this.x + (tip.x - this.x) * k, sy = this.y + (tip.y - this.y) * k;
      for (const ent of game.enemies()) {
        const e = ent as unknown as { id: number; dead: boolean; x: number; y: number; w: number; h: number;
          hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean } & WhipTagged;
        if (e.dead || this.hitSet.has(e.id)) continue;
        if (sx < e.x - 8 || sx > e.x + e.w + 8 || sy < e.y - 8 || sy > e.y + e.h + 8) continue;
        this.hitSet.add(e.id);
        e.hurt(dmg, Math.sign(tip.x - this.x) * this.knockback, -1, game);
        // 鞭 tag（Projectile.cs ApplyTag：240t 内该敌受随从伤害 +TagDamage）
        const tag = whipTagDamageOf(this.itemId);
        if (tag > 0) {
          e.whipTagT = 240;
          e.whipTagDmg = tag;
        }
        game.addDamageNumber(sx, sy, dmg, false, '#FFD060');
      }
    }
    // 生存期不位移（根部跟随玩家在 fixedUpdate 首段同步）
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projFrameImg(this.projId, 0);
    const tip = this.tip();
    if (!img) {
      // 兜底：细线
      ctx.strokeStyle = '#D8B060';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 沿根部→鞭尖排布 8 个贴图段（近似原版 Bezier 段绘制）
    const segs = 8;
    for (let s = 0; s < segs; s++) {
      const k = s / segs;
      const px = this.x + (tip.x - this.x) * k, py = this.y + (tip.y - this.y) * k;
      const a = Math.atan2(tip.y - this.y, tip.x - this.x);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + Math.PI / 2);
      if (this.spriteDir < 0) ctx.scale(1, -1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
