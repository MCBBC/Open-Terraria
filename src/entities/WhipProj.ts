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
import { MinionProj } from './MinionProj';

/** ItemID.UniqueTagEffects（ItemID.cs:1303-1414 全表核对）：鞭 → tag 附加伤害。
 *  4912 火鞭无 flat tag（专属爆炸 proc 未实装）；6143 妖精鞭 +4 */
const WHIP_TAG: Record<number, number> = {
  5688: 3, 5473: 3, 4672: 4, 5474: 5, 5475: 5, 5476: 2,
  4913: 6, 5074: 7, 4911: 6, 5477: 9, 4678: 9, 4680: 15,
  4679: 8, 5478: 12, 5479: 15, 4914: 20, 5480: 25, 6143: 4,
};
/** 鞭命中授予的玩家 buff（WhipTagEffect.PlayerBuffId/Time=180）：
 *  效果实装（Player.cs:9790-9802）：311 镰鞭→鞭攻速+35%、308 剑鞭→+25%、
 *  314 荆棘鞭→+12%（summonerWeaponSpeedBonus）；312/365 登记持续期（效果端暂不接） */
const WHIP_PLAYER_BUFF: Record<number, number> = {
  5473: 365, 4913: 314, 4911: 312, 4678: 308, 4680: 311,
};
/** 鞭 Tag 暴击率（ItemID.cs UniqueTagEffects 的 CritChance，%：随从命中被 tag 敌时
 *  TagEffectState.cs:61-71 判定 → 整击暴击）。未列入=0 */
const WHIP_TAG_CRIT: Record<number, number> = {
  4679: 10, 5478: 5, 5479: 15, 4914: 10, 5480: 10,
};
/** 每鞭射程倍率 GetWhipSettings（Projectile.cs:45694-45759，键=projId）：
 *  晨星 848 是赋值 1.6（非乘法）——本表已折算语义一致 */
const WHIP_RANGE: Record<number, number> = {
  1104: 0.75, 1028: 0.75, 841: 0.75, 1029: 0.95, 1030: 0.85, 914: 1.0,
  1031: 1.1, 952: 0.95, 913: 1.4, 912: 1.5, 847: 1.75, 1032: 1.8,
  848: 1.6, 849: 2.15, 1033: 2.0, 915: 2.2, 1034: 2.2, 1035: 2.2,
};
/** 多目标伤害衰减（:12626-12678：同一次挥动每多命中一个敌人 ×此倍率，键=projId） */
const WHIP_FALLOFF: Record<number, number> = {
  1104: 0.40, 1028: 0.40, 841: 0.50, 1029: 0.60, 1030: 0.60, 914: 0.60,
  1031: 0.70, 952: 0.90, 913: 0.66, 912: 0.70, 847: 0.80, 1032: 0.85,
  848: 0.95, 849: 0.90, 1033: 0.95, 915: 0.80, 1034: 0.90, 1035: 0.95,
};
/** proc 型鞭（OnHit 大 switch :12932-12974：命中启用 proc，随从首跳触发一次性特效）。
 *  黑收成 4680/万华镜 4914 是 OnTaggedHit（每次 tag 命中都触发，走 tag 链不在 proc） */
const WHIP_PROC_ITEMS = new Set([4912, 5476, 5477, 5479, 5480]);

export interface WhipTagged {
  /** 鞭 tag 剩余 tick（240=4 秒；原版 ApplyTag → npc.whipTimeLeft） */
  whipTagT?: number;
  /** tag 附加伤害（最近一次命中鞭的 TagDamage） */
  whipTagDmg?: number;
  /** tag 暴击率（UniqueTagEffects CritChance；随从命中判定） */
  whipTagCrit?: number;
  /** 最近命中鞭的物品 id（Dark Harvest OnTaggedHit 等按鞭分支） */
  whipTagItem?: number;
  /** proc 剩余 tick（proc 型鞭命中启用 240t，随从首跳触发后清零） */
  whipProcT?: number;
  /** proc 对应鞭物品 id */
  whipProcItem?: number;
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
    this.maxLen = speed * anim * 2 * (WHIP_RANGE[projId] ?? 1); // :45642×GetWhipSettings 倍率
    this.spriteDir = Math.cos(ang) >= 0 ? 1 : -1;
    this.ownerRef = owner;
    // 鞭长乘区（Projectile.cs:45642 ×owner.whipRangeMultiplier；提基/星尘/黑曜来源）
    const o = owner();
    if (o) this.maxLen *= 1 + o.equipStats.whipRange;
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
    // 命中：根部→鞭尖线段（分段采样，段半径 8px）与敌 AABB 相交。
    // 多目标衰减（:12626-12678）：本次挥动第 n 个命中敌 ×falloff^(n-1)（首敌全额）
    const falloff = WHIP_FALLOFF[this.projId] ?? 0.7;
    const baseDmg = Math.max(1, Math.round(this.damage * (owner ? owner.summonDamageMult : 1))
      + (owner ? owner.equipStats.armorPen : 0)); // 护甲穿透（:12068 命中侧）
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
        const dmg = Math.max(1, Math.round(baseDmg * Math.pow(falloff, this.hitSet.size - 1)));
        e.hurt(dmg, Math.sign(tip.x - this.x) * this.knockback, -1, game);
        // 鞭 tag（Projectile.cs:12760 ApplyTag：240t 内该敌受随从伤害 +TagDamage + CritChance）
        const tag = whipTagDamageOf(this.itemId);
        if (tag > 0) {
          e.whipTagT = 240;
          e.whipTagDmg = tag;
          e.whipTagCrit = WHIP_TAG_CRIT[this.itemId] ?? 0;
          e.whipTagItem = this.itemId;
        }
        // proc 型鞭（:12932-12974）：命中启用 240t 一次性 proc（随从首跳触发，见 MinionProj）
        if (WHIP_PROC_ITEMS.has(this.itemId)) {
          e.whipProcT = 240;
          e.whipProcItem = this.itemId;
        }
        // 玩家 buff（WhipTagEffect.PlayerBuffId：命中授予 180t）+ 附属召唤
        const pb = WHIP_PLAYER_BUFF[this.itemId];
        if (pb && owner) {
          owner.whipBuffs[pb] = 180;
          this.spawnSidekick(game, owner, this.itemId);
        }
        game.addDamageNumber(sx, sy, dmg, false, '#FFD060');
      }
    }
    // 生存期不位移（根部跟随玩家在 fixedUpdate 首段同步）
  }

  /** 命中附属召唤（OnHit switch）：酷鞭 4911 → 雪花哨兵 917（伤 15，buff 312 维持）；
   *  麻线鞭 5473 → 小蜘蛛 1036（伤 2，buff 365 维持）——同类在场不重复生成 */
  private spawnSidekick(game: GameHooks, owner: Player, itemId: number): void {
    const want = itemId === 4911 ? 917 : itemId === 5473 ? 1036 : 0;
    if (!want) return;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[]; add: (e: unknown, b: string) => void } }).entities;
    if (projs.projectiles.some((m) => m instanceof MinionProj && !m.dead && m.projId === want)) return;
    const m = new MinionProj(owner.cx, owner.cy - 30, want, want === 917 ? 15 : 2, 1.5,
      false, 0, false, () => (owner.dead ? null : owner));
    m.noSlot = true;
    projs.add(m, 'projectiles');
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
