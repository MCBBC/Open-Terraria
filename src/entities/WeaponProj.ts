// 数据驱动近战/爆炸武器投射物（1456 aiStyle 家族行为，Game.useCombatWeapon 派发）：
//   Boomerang  aiStyle 3   —— 飞出减速后返回主角（AI_003）
//   SpearProj  aiStyle 19/161 —— 随主角前刺伸缩（AI_019 的 owner 相对位移简化）
//   YoyoProj   aiStyle 99  —— 按住鼠标滞留追光标，松手收回（AI_099 channel 语义）
//   FlailProj  aiStyle 15  —— AI_015_Flails 全状态机（旋转/掷出/回拉/坠落/悬荡/回收）
//   GrenadeProj aiStyle 16 —— 弹跳 + 引信爆炸（手雷 180/炸弹 150/炸药 135 tick）
// 贴图统一 Projectile_N.png 懒加载（Arrow.projSprite 共享缓存）。
import { Entity } from './Entity';
import { moveAndCollide } from '../physics/TileCollision';
import { upgradeToBitmap } from '../assets/SpriteAtlas';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitCritters, hitTownNpcs, playerCanHitEnemy, tryReflectProjectile } from './projTargets';
import { applyProjStatus, applyMeleeImbue, applyFrostBurn, applyMagmaStoneProj } from './projStatus';
import { projectileData } from '../data/vanillaProjectiles';
import { canHit } from '../physics/LineOfSight';
import { hostileProjectileDamage, mainDifficulty } from '../stats/ScaleStats';
import { drawYoyoStringLine, stringColorOpts } from '../render/StringLine';
import { BuffType } from '../stats/Buffs';
import { TORCH_DUST_BY_STYLE } from '../world/Torch';

/** 原版投射物绘制偏移表（Main.cs:29375-29826 num143/num144 表,96 条静态项）。
 *  语义:贴图左上角落于 (盒左 + num144, 盒上 − num143)——num143 为"上移"量。
 *  典型:炸弹 28=上移 8(22×30 贴图,引线 y=0-7 全在盒外,弹体 y=8-29 恰填 22×22 盒,
 *  Main.cs:29560);雷管 29=上移 11(10×32)。
 *  方向/高度依赖项已入 PROJ_DRAW_OFFSET_DYN(959/1095/1096/1003/1004/112/
 *  191-194/390-392/313/397——待对应弹型接入时传 dirX 生效);
 *  浮标 proj.bobber=8 不适用(本仓 Bobber 自绘近似)。 */
const PROJ_DRAW_OFFSET: Record<number, readonly [number, number]> = {
  1022: [1, 0], 175: [10, 0], 1036: [-4, 0], 1025: [22, 0],   // 392 移 DYN 表
  499: [12, 0], 765: [22, -16], 966: [-26, -6], 519: [6, -6], 520: [12, 0],
  492: [5, -4], 498: [6, 0], 489: [-2, 0], 486: [-6, 0], 525: [5, 0],
  488: [0, -8], 373: [6, -10], 375: [12, -11], 423: [0, -5], 346: [4, 0],
  331: [0, -4], 254: [3, 0], 273: [0, 2], 335: [6, 0], 162: [1, 1],
  377: [-6, 0], 353: [36, -12], 324: [22, -6], 266: [6, -13], 319: [10, -12],
  315: [-13, -6], 314: [0, -8], 269: [18, -14], 268: [22, -2], 18: [3, 3],
  16: [6, 0], 17: [2, 0], 31: [2, 0], 25: [6, -6], 26: [6, -6], 35: [6, -6],
  63: [6, -6], 154: [6, -6], 947: [4, -4], 948: [4, -4],
  28: [8, 0], 37: [8, 0], 75: [8, 0], 1077: [8, 0],          // 炸弹族(含引线)
  29: [11, 0], 470: [11, 0], 637: [11, 0],                    // 雷管族(长引线)
  43: [4, 0], 208: [2, -12], 209: [4, -8], 210: [2, -22], 251: [18, -10],
  163: [10, 0], 310: [10, 0], 1008: [10, 0], 1009: [10, 0], 1010: [10, 0], 1011: [10, 0],
  69: [4, 4], 70: [4, 4], 50: [0, -8], 53: [0, -8], 515: [0, -8], 870: [0, -8],
  473: [2, -6], 72: [8, -16], 86: [8, -16], 87: [8, -16], 74: [0, -6],
  99: [1, 0], 727: [1, 0], 1013: [1, 0], 1014: [1, 0], 1047: [1, 0], 1048: [1, 0],
  1053: [1, 0], 1054: [1, 0], 1055: [1, 0], 1057: [1, 0], 655: [1, 0],
  111: [18, -16], 875: [16, -16], 881: [14, -8], 934: [14, -20], 884: [16, -12],
  890: [26, -9], 891: [30, -12], 897: [38, -13], 899: [28, -12], 900: [54, -30],
  334: [8, -18], 816: [6, -19], 821: [6, -10], 825: [14, -19], 854: [10, -14],
  858: [16, -8], 859: [8, -8], 860: [34, -8], 958: [48, -20], 960: [24, -14],
  956: [16, -12], 994: [18, -10], 998: [14, -10], 1027: [4, -6],
  200: [12, -12], 211: [14, 0], 236: [30, -14],
  517: [6, 0], 681: [6, 0], 516: [6, 0], 127: [8, 0], 155: [3, 3],   // 397 移 DYN 表(num145−1)
};

/** 方向/高度依赖偏移项（Main.cs:29375-29826 表内 spriteDirection/direction/height
 *  条目,2026-08-19 补齐机制）。dirX = 弹体朝向（spriteDirection 语义:+1 右/-1 左,
 *  调用方传实体 facing）。397 的 num145-=1 以第三元素表达（0/−1）。
 *  ★当前消费端（本仓 aiStyle 族的 drawProj 调用方）尚未覆盖这些型号——表先行就位,
 *  对应弹型接入时传 dirX 即生效;浮标 bobber=8 项本仓 Bobber 为自绘近似不适用 */
const PROJ_DRAW_OFFSET_DYN: Record<number, (dirX: number, h: number) => readonly [number, number, number]> = {
  959: (d) => [40, -14 + (d === -1 ? -8 : 0), 0],
  1095: (d) => [40, -14 + (d === -1 ? -8 : 0), 0],
  1096: (d) => [40, -14 + (d === -1 ? -8 : 0), 0],
  1003: (d) => [22, -18 + (d === 1 ? 8 : 0), 0],
  1004: (d) => [26, -18 + (d === 1 ? 6 : 0), 0],
  112: (d) => [14, -8 + 4 * d, 0],
  191: (d) => [26, d !== 1 ? -22 : -10, 0],
  192: (d) => [26, d !== 1 ? -22 : -10, 0],
  193: (d) => [26, d !== 1 ? -22 : -10, 0],
  194: (d) => [26, d !== 1 ? -22 : -10, 0],
  390: (d) => [0, 4 * d, 0],
  391: (d) => [0, 4 * d, 0],
  392: (d) => [-2, 4 * d, 0],
  313: (_d, h) => (h !== 54 ? [20, -12, 0] : [0, 0, 0]),
  397: () => [-2, -2, -1],   // num145−1（cs:29821-29823）
};

/** num143/num144(含 397 的 num145−1)偏移求值——静态+动态两表共用,
 *  供 MinionProj 等非 drawProj 消费端接入。返回 null = 两表均未登记。
 *  dirX = spriteDirection 语义(+1 右/−1 左);boxH = 碰撞盒高(313 高度门用)。 */
export function projDrawOffsetFor(projId: number, dirX: number, boxH: number): readonly [number, number, number] | null {
  const dyn = PROJ_DRAW_OFFSET_DYN[projId];
  if (dyn) return dyn(dirX, boxH);
  const st = PROJ_DRAW_OFFSET[projId];
  return st ? [st[0], st[1], 0] : null;
}

/** 共用绘制：投射物贴图按角度旋转。
 *  锚点 1:1 原版通用绘制公式（Main.cs:34040）:
 *    anchor = (盒左 + num145 + num144, 盒上 + 盒高/2),origin = (num145, 盒高/2 + num143)
 *    num145 = (贴图宽 + 盒宽)/2 → 展开后贴图左上角落于 (盒左 + num144, 盒上 − num143),
 *    旋转绕 anchor 进行。非方贴图(W≠盒宽)按此公式为"盒左对齐"而非居中。
 *  世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标) */
function drawProj(r: Renderer, _cam: Camera, e: { x: number; y: number; w: number; h: number }, projId: number, ang: number, fallbackColor: string, alpha = 1, drawSize = 0, mirror = false, centerAnchor = false, scale = 1): void {
  // drawSize=绘制尺寸(0=取碰撞盒 w；-1=贴图原生尺寸——原版投射物绘制语义,
  // 爆炸族雷管 10×32 竖条等非方贴图必须走原生尺寸否则被拉方)
  // mirror=旋转坐标系内水平镜像（XNA dir=FlipHorizontally 等价，绕 origin 翻转）
  // centerAnchor=Main.cs:32360 专属组（802/842/938-945 短剑刺族等）：锚=盒中心、
  // origin=贴图中心、无 num143/144 偏置——曾误走通用 num145 偏置锚（枢轴≈剑尖），
  // 右刺角度巧合正常、左刺 −π/4×sd 与镜像叠加后枢轴错位=剑柄朝前（2026-08-17 用户报）
  const img0 = projSprite(projId);
  const natural = drawSize < 0 && img0 && (img0.width > 0) && img0.width > 0;
  const dw = natural ? img0!.width : drawSize > 0 ? drawSize : e.w;
  const ctx = r.ctx;
  if (!ctx) return;
  const img = img0;
  const hasImg = !!(img && (img.width > 0) && img.width > 0);
  const W = hasImg ? img!.width : dw;
  // num145 = (贴图宽−盒宽)/2 + 盒宽/2 = 贴图宽/2（Main.cs:29601 原式化简）——
  // 旋转枢=贴图水平中点;曾误写 (贴图宽+盒宽)/2 → 悠悠球/回旋镖绕偏心点公转
  const num145 = W / 2;
  // 偏移取值：方向/高度依赖项优先（弹体朝向取实体 facing——spriteDirection 语义），
  // 其余走静态表（共享求值——MinionProj 等消费端同源）
  const off3 = projDrawOffsetFor(projId, (e as { facing?: number }).facing ?? 0, e.h);
  const [off143, off144, num145Adj] = off3 ?? [0, 0, 0];
  const num145f = num145 + num145Adj;
  const dwS = dw * scale;                             // 绘制缩放（M.cs:32360 Vector2.One×proj.scale）
  const s = dwS / W;                                  // 绘制缩放(原生尺寸=1)
  ctx.save();
  ctx.globalAlpha = alpha; // AI_161 细剑淡入淡出(:44993-44994)
  if (centerAnchor) {
    // :32361-32367：vector75=盒中心+gfxOffY、origin=贴图中心、scale=proj.scale(1)
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.rotate(ang);
    if (mirror) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (hasImg) {
      // ★中心锚组绘制尺寸=贴图原生×scale（M.cs:32360 vector76=Vector2.One×proj.scale,
      // origin=贴图中心）——勿用 dw（drawSize=0 时 dw=盒宽,会把球缩到命中盒大小）
      const sw = W * scale, sh = img!.height * scale;
      ctx.drawImage(img!, -sw / 2, -sh / 2, sw, sh);
    } else {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(-dwS / 2, -dwS / 2, dwS, dwS);
    }
    ctx.restore();
    return;
  }
  ctx.translate(e.x + num145f + off144, e.y + e.h / 2);
  ctx.rotate(ang);
  if (mirror) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  if (hasImg) {
    ctx.drawImage(img!, -num145f * s, -(e.h / 2 + off143) * s, dwS, dwS * (img!.height / img!.width));
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(-dwS / 2, -dwS / 2, dwS, dwS);
  }
  ctx.restore();
}

/** 同敌命中去重 + 冷却的通用伤害结算。
 *  hitCd 记录每敌剩余冷却 tick，每 fixedUpdate 调用方先 tickCd() 递减；
 *  cooldown >= 9999 视作单次结算（突刺类：一击每敌只中一次） */
class HitCooldown {
  private map = new Map<number, number>();
  tick(): void {
    for (const [k, v] of this.map) {
      if (v <= 1) this.map.delete(k);
      else this.map.set(k, v - 1);
    }
  }
  ready(id: number, cooldown: number): boolean {
    if (this.map.has(id)) return false;
    if (cooldown < 9999) this.map.set(id, cooldown);
    else this.map.set(id, 2147483647); // 永不再中
    return true;
  }
  clear(): void { this.map.clear(); }
}

type ReflectableWeaponProj = {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  damage: number; knockback: number;
  projId?: number;
  hostile?: boolean;
  reflected?: boolean;
  /** 暴击率（GetWeaponCrit：4 基础+武器 item.crit+装备/buff,Game 侧算好传入） */
  critChance?: number;
  /** 近战系投射物（吃武器浸剂 meleeEnchant,StatusNPC:10559 门 (melee||whip)） */
  meleeProj?: boolean;
};

function hitEnemies(
  self: { x: number; y: number; w: number; h: number; vx: number; damage: number; knockback: number; projId?: number },
  game: GameHooks,
  hitCd: HitCooldown,
  cooldown: number,
  dirX: number,
  pen = 0,
  /** 每次命中敌结算后的回调（Boomerang 的 Projectile.Damage 回收门 :12278-12291 用；
   *  悠悠球/配重球的 :12467-12508 命中链也在此语义点触发——入参=命中敌） */
  onHit?: (e: unknown) => void,
  /** 命中伤害乘区（求值于 hurt 前、按敌逐个）：悠悠球对玩家无视线时 ×0.75
   *  （Projectile.cs:12503-12505 num12×0.75） */
  dmgScale?: (e: unknown) => number,
  /** 玩家级共享免疫门（NPC.immune[owner]>0 语义 = Enemy.iframes）：true 时不建
   *  逐弹私账、改按敌方全局免疫帧去重——悠悠球/配重球走此档（DefaultToYoyo
   *  不设 usesLocalNPCImmunity/localNPCHitCooldown,Projectile.cs:10155-10161;
   *  Damage_PVE 前置门 npc.immune[owner]==0 :11905,hurt 落地置 10t :13152 缺省档）。
   *  同玩家全部 aiStyle 99 弹共享:手套二号球/配重球 10t 内不能重复命中同敌 */
  playerImmune = false,
  /** 前向延伸命中盒（AI_019 长矛 105/46/153 伸出相,Projectile.cs:43530-43571）：
   *  Colliding（:14554-14576）语义 = 弹心→盒心按 max(w,h)(min12) 步进连续方盒
   *  + 延伸盒本体,与弹体 AABB 并集判定 */
  extBox?: { x: number; y: number; w: number; h: number } | null,
): void {
  // 小动物:一击致死(原版小动物是 NPC;近战挥砍同语义)。回旋镖/悠悠球等穿透型
  // 命中小动物不消耗穿透语义——hurt 自带 iframes 防同帧连击
  hitCritters(self, game);
  // 城镇 NPC 受击(原版 Projectile.Damage 对 friendly NPC 同样生效,杀裁缝师即此链);
  // 穿透型不消耗穿透语义(NPC.hurt 8t iframes 自去重)
  hitTownNpcs(self, game, self.damage, Math.sign(self.vx) * 2, 'playerProj', self.projId ?? 0);
  const me = self as ReflectableWeaponProj;
  // 反射后的弹体 friendly 已翻——不再入敌怪判定（原版 Damage NPC 需 friendly 门禁）
  if (me.reflected) return;
  // 延伸盒步进盒组（Colliding :14560-14572：num18 = max(W,H) 且 ≥12，从弹心到
  // 盒心每 num18 一个同尺寸方盒,末盒=延伸盒本体——弹体 AABB 之外的走廊补判）
  const extRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (extBox) {
    const scx = self.x + self.w / 2, scy = self.y + self.h / 2;
    const ccx = extBox.x + extBox.w / 2, ccy = extBox.y + extBox.h / 2;
    const dist = Math.hypot(ccx - scx, ccy - scy);
    const step = Math.max(12, Math.max(extBox.w, extBox.h));   // :14564-14566
    for (let d = step; d < dist; d += step) {
      const t = d / dist;
      extRects.push({ x: scx + (ccx - scx) * t - extBox.w / 2, y: scy + (ccy - scy) * t - extBox.h / 2, w: extBox.w, h: extBox.h });
    }
    extRects.push(extBox);                                     // :14573-14575
  }
  for (const ent of game.enemies()) {
    if (!playerCanHitEnemy(ent, game, self.projId ?? 0)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
    const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
    if (e.dead) continue;
    const bodyHit = self.x < e.x + e.w && self.x + self.w > e.x && self.y < e.y + e.h && self.y + self.h > e.y;
    const extHit = !bodyHit && extRects.some((r) =>
      r.x < e.x + e.w && r.x + r.w > e.x && r.y < e.y + e.h && r.y + r.h > e.y);
    if (!bodyHit && !extHit) continue;
    // 反射源命中（Projectile.cs:12050-12060）：按 projId 查 CanBeReflected 白名单——
    // 回旋镖 aiStyle3/长矛 19/161/悠悠球 99/15 均不在表内不反射，白名单内新弹型自动生效
    if (me.projId !== undefined && tryReflectProjectile(me, me.projId, e, game)) return;
    if (playerImmune) {
      // 玩家级共享免疫门（:11905 npc.immune[owner]==0 前置;本仓 = Enemy.iframes,
      // hurt 落地置 10t）——替代逐弹 hitCd 私账（mock 敌无 iframes 字段 = 恒放行）
      if (((e as { iframes?: number }).iframes ?? 0) > 0) continue;
    } else if (!hitCd.ready(e.id, cooldown)) continue;
    // 暴击 = GetWeaponCrit 语义:4 基础 + 武器 item.crit + 装备/buff（Game 侧合并传入；
    // 此前全族写死 4%——Sunfury 原版 crit=7 应为 11%）
    const crit = Math.random() < (me.critChance ?? 0.04);
    // (int) 截断 + 命中乘区（悠悠球无视线 ×0.75，:12504）
    const dmg = Math.trunc((crit ? self.damage * 2 : self.damage) * (dmgScale?.(e) ?? 1));
    const kdir = Math.sign((e.x + e.w / 2) - (self.x + self.w / 2)) || dirX;
    e.hurt(dmg, kdir * self.knockback, 0, game, pen, crit, 0, true); // 裸 kb（0.65 自造已摘）——hurt 内原版管线;音/飘值=单点
    onHit?.(e); // Damage 内回收门/穿透自减/悠悠球命中链在此语义点求值（Projectile.cs:12278-12291）
    // 命中 debuff(StatusNPC:10555——阳炎之怒 50% OnFire 300t / 粉恒星之锤 OnFire 等,按型号查表)
    applyProjStatus(me.projId, e as unknown as Record<string, number>);
    // 武器浸剂（StatusNPC:10559 门 (melee||whip)&&meleeEnchant>0——近战四族命中施加,
    // 时长 Player.cs:6141-6171;挥砍侧同表在 Game 挥击结算）
    if (me.meleeProj) {
      const pl = game.player as unknown as { buffs: { has: (b: never) => boolean }; equipStats: { frostBurn: boolean; magmaStone: boolean } };
      applyMeleeImbue(pl.buffs, e as unknown as Record<string, number>,
        () => game.spawnParticles(e.x + e.w / 2, e.y + e.h / 2,
          ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 }));
      // 冰霜盔甲引擎(melee 门,:93712)
      applyFrostBurn(pl.equipStats.frostBurn, e as unknown as Record<string, number>);
      // 岩浆石/火焰护手（melee 门,:10866 1/7 → OnFire3 6s）
      applyMagmaStoneProj(pl.equipStats.magmaStone, e as unknown as Record<string, number>);
    }
  }
}

// ================= 回旋镖（aiStyle 3，AI_003_Boomerang，Projectile.cs:36623-37352） =================
// 原版四段（Update 的 numUpdates 循环内【先 AI(:15434) 后移动/碰撞(:15674)】——step() 同序）：
//   ① 出程 ai[0]==0（:36783-37087）：无摩擦直线——AI 内无任何通用摩擦/减速项,
//      速度只被特例族（下垂/追踪/双门）改写;
//   ② 回收门（三处独立）：
//      命中敌 → Projectile.Damage :12278-12291（出程速度反转 + ai[0]=1;
//              豁免 301/866/902/光刃族）;
//      撞墙  → HandleMovement :18103-18161（33/106/866 分轴反弹不回收;光刃转悬停
//              ai[0]=2(:17975-17990);其余 ai[0]=1 + 速度=-lastVelocity,383 豁免取反）;
//      计数门 → per-type 见下表;
//   ③ 返回段 ai[0]==1（:37111-37288）：tileCollide=false 穿墙（:37145）;目标速度制
//      逼近（朝玩家 num28 px/t,每轴步进 num29,异号加倍 :37249-37282;383 专属
//      沿差向量加速 :37237-37247）;距玩家 >3000px Kill（301 6000,:37223-37232）;
//   ④ 回收：与玩家 AABB 相交即 Kill（:37272-37288）。
//
// ★特例族计数门/出程行为小表（ai[1] 每 AI 次自增 :36790-36793;866 计数在 localAI[0]
//   :36985/:36999;extraUpdates 型号（182/866/301,SetDefaults）按 AI 次计数,
//   折合实际 tick = 计数 ÷ (1+extraUpdates)）：
//   6/19/52/113/272/333/867/902/1000/1052 → ai[1]≥30 回收（:37082-37086）
//   106 光碟     → 同 30 回收——独立 45 门（:36794-36799）在其后的类型链尾
//                  else if(ai[1]≥30)（:37082-37087,未豁免 106）之前永不可达
//                  =1456 影子死代码,实测回收点就是 30;撞墙反弹不回收（:18142-18151）
//   320 冰回旋镖 → ai[1]≥10 起下垂 vy+0.5/vx×0.95（:36868-36886）
//   383 附魔飞刀 → 同 320（上升再+0.35）;距玩家>800 回收（:36868-36888）
//   182 圣骑士锤 → 追踪窗 ai[1]∈(10,360) 取 800px 最近敌（CanHit 视线门）,
//                  无目标且 ≥30 回收（:36889-36973;目标速度 12/轴步进 0.25 :36937-36973）
//   866 飞刀     → localAI[0] 同窗（FindTargetWithLineOfSight 缺省 800 :42972）;
//                  无目标 ≥30 回收（:36980-37057）
//   301 弹跳盾   → 按住 ≥20/松手 ≥100 双门,回收时速度归零（:37062-37080）
//   光刃族 19 型 → ai[1]≥30 起垂落 vy+1/vx×0.96（:36800-36832）;撞墙转悬停 ai[0]=2
//                  （vy<0 减半/rotation=2.335/vx=0/vy+1,:37089-37109）

/** 返回段型号参数表（:37146-37206）：[num28 目标速率, num29 轴步进加速度]。
 *  未列型号 = 缺省 9/0.4（:37146-37147）;光刃族整族 40/3（:37148-37151） */
const BOOMERANG_RETURN: Record<number, [number, number]> = {
  19: [20, 1.5], 33: [18, 1.2], 106: [16, 1.2], 182: [16, 1.2],
  272: [20, 1.5], 866: [16, 1.2], 333: [12, 0.6], 301: [15, 3],
  320: [15, 3], 383: [16, 4], 1000: [9.5, 0.4],
};

/** Phaseblade 族（ProjectileID.cs:27 IsAPhaseblade,19 型）：
 *  出程 30t 后垂落;返回 40/3 高速穿墙归位 + extraUpdates 随距离增长（:37211-37221） */
const PHASEBLADE_PROJ = new Set([1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067,
  1068, 1069, 1070, 1071, 1072, 1074, 1075, 1076, 1101, 1102]);

/** 撞墙反弹族（:18142-18151）：33 荆棘轮/106 光碟/866 飞刀——撞墙不回收,
 *  命中轴速度取反（lastVelocity 语义）续飞 */
const WALL_BOUNCE_PROJ = new Set([33, 106, 866]);

/** 命中敌不触回收的型号（Damage :12278 豁免列;902 另走"返回段命中 direction 翻转"
 *  :12292-12297,301/383 命中时 direction 朝敌改写 :12249-12263） */
const NO_HIT_RETURN_PROJ = new Set([301, 866, 902]);

/** 出程尘近似表（AI_003 头段 :36652-36738 per-type Dust——颜色/概率近似,
 *  粒型/noGravity/光源不建模;未列型号原版本就无尘） */
const BOOMERANG_DUST: Record<number, [string, number]> = {
  19: ['#FFA040', 1], 33: ['#B0E080', 0.6], 6: ['#FFE0A0', 0.25],
  113: ['#B0C0FF', 1], 320: ['#C0E8FF', 0.4], 383: ['#D0A0FF', 0.3],
  867: ['#FF6060', 0.4], 1000: ['#FFD080', 0.3], 182: ['#FFD080', 0.5],
};

/** melee 投掷初速（ItemCheck_Shoot :46430-46434）：shootSpeed / meleeSpeed——
 *  本仓 attackSpeedMult = 1/meleeSpeed（Player.ts CapAttackSpeeds 镜像）,
 *  等价 shootSpeed × attackSpeedMult。NoMeleeSpeedVelocityScaling 排除表
 *  {699,707,877-879,985,973}（ProjectileID.cs:337）的弹型不缩放,调用方自查 */
export function meleeThrowSpeed(shootSpeed: number, attackSpeedMult: number): number {
  return shootSpeed * (attackSpeedMult || 1);
}

/** 挥掷系 shoot 出生落点核（ItemCheck_Shoot 通用尾支）：pointPosition =
 *  RotatedRelativePoint(MountedCenter)（1457 Player.cs:47588——无旋转/坐骑/睡坐
 *  = 玩家中心）→ NewProjectile 盒心落点（Projectile.cs:10878-10879
 *  position=(X−w/2, Y−h/2)）。链锤/悠悠球不在任何 sItem.type 特支 = 【无 per-weapon
 *  出生偏移】（备案所记"Center.X+9×dir、Bottom−8"经 1457/1456/1405 三版
 *  Player.cs/Projectile.cs 核对均无此式,2026-08-23）。e = 已构造弹体（读其
 *  SetDefaults 盒宽高）,(cx,cy) = 玩家中心;原地写回盒左上并返回。 */
export function placeAtShootSpawn<T extends { x: number; y: number; w: number; h: number }>(
  e: T, cx: number, cy: number): T {
  e.x = cx - e.w / 2;
  e.y = cy - e.h / 2;
  return e;
}

/** 回旋镖命中盒型号表（SetDefaults aiStyle=3 全 36 型提取：type→size;
 *  光刃族 1065-1070/1072/1074/1076/1102=46,其余 38） */
const BOOMERANG_SIZE: Record<number, number> = {
  6: 22, 19: 22, 33: 38, 52: 22, 106: 32, 113: 22, 182: 30, 272: 32,
  301: 38, 320: 34, 333: 38, 383: 34, 866: 30, 867: 22, 902: 20, 1000: 22,
  1052: 22, 1074: 46,
  1059: 38, 1060: 38, 1061: 38, 1062: 38, 1063: 38, 1064: 38, 1071: 38,
  1075: 38, 1101: 38,
  1065: 46, 1066: 46, 1067: 46, 1068: 46, 1069: 46, 1070: 46, 1072: 46,
  1076: 46, 1102: 46,
};

export class Boomerang extends Entity {
  w = 22; h = 22; // 默认（型号表覆盖）
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（301 Bouncing Shield 双门用；Game 仅 301 注入,其余族空挂无害） */
  channel: (() => boolean) | null = null;
  /** ★ai[0]（:36783 起）：0 飞出 / 1 返回 / 2 光刃撞墙悬停（:17975-17990 置 2） */
  ai0 = 0;
  /** 探针 _weapons-family-probe 读 returning——ai[0]==1 即返回段（保留旧名兼容） */
  get returning(): boolean { return this.ai0 === 1; }
  /** direction：掷出瞬间玩家 facing（NewProjectile 语义;旋转自旋符号 :37294 起） */
  private dir: number;
  /** ai[1]：飞出段计数（866 占用为目标索引,计数走 localT） */
  private outT = 0;
  /** localAI[0]：866 目标窗计数（:36985/:36999）;1074 悬停后置 -1 供返回音选择（:37102） */
  private localT = 0;
  /** localAI[1]：光刃悬停音一次性门（:37098-37109） */
  private hoverSfxDone = false;
  /** rotation（尾段 per-type :37294-37352 + 光刃出程/悬停/返回专属段） */
  private rot = 0;
  /** soundDelay（掷出呼啸 8t/301 10t,:36626-36651;每 tick 自减 :15427-15429） */
  private soundDelay = 0;
  /** SetDefaults penetrate（命中自减 :13175-13182;==0 Kill :15866-15868;866 特例 :13124-13137） */
  private penetrate: number;
  /** SetDefaults extraUpdates（AI 每 tick 跑 1+extra 次,Update :15336-15339 while 循环） */
  private extra: number;
  private hitCd = new HitCooldown();
  /** timeLeft 缺省 3600（SetDefaults :526,aiStyle 3 族无型号覆写——旧值 900 是自造） */
  life = 3600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number,
    projId: number, dir = 1) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.dir = dir >= 0 ? 1 : -1;
    const def = projectileData(projId);
    this.penetrate = def?.penetrate ?? -1;
    this.extra = def?.extraUpdates ?? 0;
    const sz = BOOMERANG_SIZE[projId]; // ⑬-2 命中盒按型号（曾统一 22×22）
    if (sz) { this.w = sz; this.h = sz; }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot, '#C0A060');
  }

  /** 轴向目标速度逼近（AI_003 追踪/返回共用式 :36937-36973/:37249-37282）：
   *  每轴朝目标速度步进 acc,当前速度与目标异号再加倍 */
  private steerTo(tvx: number, tvy: number, acc: number): void {
    if (this.vx < tvx) { this.vx += acc; if (this.vx < 0 && tvx > 0) this.vx += acc; }
    else if (this.vx > tvx) { this.vx -= acc; if (this.vx > 0 && tvx < 0) this.vx -= acc; }
    if (this.vy < tvy) { this.vy += acc; if (this.vy < 0 && tvy > 0) this.vy += acc; }
    else if (this.vy > tvy) { this.vy -= acc; if (this.vy > 0 && tvy < 0) this.vy -= acc; }
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.soundDelay > 0) this.soundDelay--; // :15427-15429 每 tick 一次（AI 循环外）
    this.hitCd.tick();
    // extraUpdates（Update :15336-15339）：AI+移动每 tick 跑 1+extra 次;
    // 光刃返回段动态加速 = dist/3000（+1(1074),上限 20,:37211-37221）
    let runs = this.extra + 1;
    if (PHASEBLADE_PROJ.has(this.projId) && this.ai0 === 1) {
      const p0 = game.player;
      runs = Math.min(20, Math.floor(Math.hypot(p0.cx - this.cx, p0.cy - this.cy) / 3000)
        + (this.projId === 1074 ? 1 : 0)) + 1;
    }
    for (let i = 0; i < runs && !this.dead; i++) this.step(game);
  }

  /** 单次 AI 迭代（等价原版 numUpdates 循环体一次：AI → 移动/碰撞 → 尾段 → 命中） */
  private step(game: GameHooks): void {
    const p = game.player;
    const isPhase = PHASEBLADE_PROJ.has(this.projId);
    // ---- AI 段 ----
    // 掷出呼啸（:36626-36651;383/光刃族豁免;301 延时 10 其余 8,均 ×(extra+1)）。
    // 301 的 -0.33 变调未建模（playSfxFiles 无 pitch 参数）
    if (this.projId !== 383 && !isPhase && this.soundDelay === 0) {
      this.soundDelay = (this.projId === 301 ? 10 : 8) * (this.extra + 1);
      game.playSfxFiles(['Item_7'], 1, this.cx, this.cy);
    }
    if (isPhase) {
      // :36745-36748 中心出界（InWorld 外扩 10 格）→ 直接进返回
      const st = game.world.store;
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (tx < 10 || ty < 10 || tx >= st.w - 10 || ty >= st.h - 10) this.ai0 = 1;
      // :36750-36756 timeLeft<5 且玩家存活 → 续命 5t 并回收（悬停/垂落态的唯一出路）
      else if (this.life < 5 && !(p as { dead?: boolean }).dead) {
        this.life = 5;
        if (this.ai0 !== 1) this.ai0 = 1;
      }
      // :36758-36764 再掷召回门（持光刃按 use 即回收）——需 Player controlUseItem/
      //   releaseUseItem 输入语义,本引擎未建模（GAP,登记 docs/weapon-proj-audit）
    }
    if (this.ai0 === 0) this.aiOut(game, isPhase);
    else if (isPhase && this.ai0 === 2) this.aiHover(game); // 光刃撞墙悬停
    else this.aiReturn(game, isPhase);
    // ---- 移动段（HandleMovement;ai[0]==1 时 tileCollide=false 穿墙 :37145） ----
    this.moveStep(game, isPhase);
    // ---- 尾段 rotation/尘（:37294-37352,全部状态运行） ----
    this.aiVisual(game, isPhase);
    // ---- direction 自动更新（Projectile.Update :15674-15682 AutomaticallyChangesDirection:
    //      aiStyle 3 且 ai[0]!=1 → direction = vx<0 ? -1 : 1（vx==0 → 1）——出程每 tick
    //      跟随速度 X 符号,撞墙反弹后自旋反向;返回段（ai[0]==1）冻结。置于 rotation 段
    //      后 = 本 tick 自旋仍用上一 tick 符号,与原版"AI(:15434)先于移动/转向(:15674)"
    //      的节拍一致;曾恒用出生 facing → 反弹后自旋不反向）----
    if (this.ai0 !== 1) this.dir = this.vx < 0 ? -1 : 1;
    // ---- 命中结算（同敌冷却 10t = NPC immune[owner]=10,:13172-13174） ----
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || this.dir, this.armorPen,
      () => this.onHitEnemy());
  }

  /** ① 出程段（ai[0]==0,:36783-37087）——分支序与源码一致 */
  private aiOut(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (this.projId !== 866) this.outT++; // :36786-36793（866 不计 ai[1],计数在 localT）
    // :36794-36799 独立 106/45 门——按源码原样保留,但 ai[1] 先被类型链尾的
    // else if(ai[1]≥30)（:37082-37087,106 未豁免）截住 → 1456 中此门不可达
    // （影子死代码）。实测 106 回收点=30,勿按 45 调参
    if (this.projId === 106 && this.outT >= 45) { this.ai0 = 1; this.outT = 0; return; }
    if (isPhase) {
      // 光刃族（:36800-36866）：前 30 AI 次自旋,之后 vy+1/vx×0.96 垂落（vy 钳 16）
      if (this.outT >= 30) {
        this.vy += 1;
        this.vx *= 0.96;
        if (this.vy > 16) this.vy = 16;
        if (this.vy > 0) {
          // :36811-36832 垂落姿态:rotation 逼近 dir>0→2.335 / dir<0→-3.948（差值绕 2π 取近路）
          const tgt = this.dir > 0 ? 2.335 : -3.948;
          this.rot = this.dir > 0
            ? (this.rot <= tgt ? (this.rot * 4 + tgt) / 5 : (this.rot * 9 + tgt + Math.PI * 2) / 10)
            : (this.rot >= tgt ? (this.rot * 4 + tgt) / 5 : (this.rot * 9 + tgt - Math.PI * 2) / 10);
        } else {
          this.rot += 0.4 * this.dir; // :36834-36844（音门 1074 9t/其余 14t）
          if (this.soundDelay === 0) {
            game.playSfxFiles([this.projId === 1074 ? 'Item_7' : 'Item_15'], 1, this.cx, this.cy);
            this.soundDelay = this.projId === 1074 ? 9 : 14;
          }
        }
      } else {
        this.rot += 0.4 * this.dir; // :36836-36847（1074 11t/其余 14t;-0.3 变调略）
        if (this.soundDelay === 0) {
          game.playSfxFiles([this.projId === 1074 ? 'Item_7' : 'Item_15'], 1, this.cx, this.cy);
          this.soundDelay = this.projId === 1074 ? 11 : 14;
        }
      }
      return;
    }
    if (this.projId === 320 || this.projId === 383) {
      // 320 冰回旋镖 / 383 附魔飞刀（:36868-36888）：≥10 起下垂 vy+0.5（383 上升再+0.35）/
      // vx×0.95/vy 钳 16;383 距玩家>800 回收
      if (this.outT >= 10) {
        this.vy += 0.5;
        if (this.projId === 383 && this.vy < 0) this.vy += 0.35;
        this.vx *= 0.95;
        if (this.vy > 16) this.vy = 16;
        if (this.projId === 383 && Math.hypot(p.cx - this.cx, p.cy - this.cy) > 800) {
          this.ai0 = 1; this.outT = 0;
        }
      }
      return;
    }
    if (this.projId === 182 || this.projId === 866) {
      // 182 圣骑士锤（:36889-36973）/ 866 飞刀（:36980-37057）:800px 内最近敌追踪
      // （CanHit 视线门）,目标速度=(目标-球心)norm×12,轴步进 0.25;无目标 ≥30 回收。
      // ★计数源不同:182=ai[1]（:36790-36793,顶部已自增）/ 866=localAI[0]（:36999,
      //   ai[1] 被 866 占用为目标索引）——数值门一致,这里统一取 cnt
      const cnt = this.projId === 866 ? ++this.localT : this.outT;
      let tx = this.cx + this.vx * 100, ty = this.cy + this.vy * 100; // :36944-36946 无目标前瞻点
      let found = false;
      if (cnt > 10 && cnt < 360) { // :36909-36938 / :36985-36997
        let best = 800; // :36907 / FindTargetWithLineOfSight 缺省 800 :42972
        for (const ent of game.enemies()) {
          const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
          if (!playerCanHitEnemy(ent, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
          if (e.dead) continue;
          if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          const d = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
          if (d < best) { best = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2; found = true; }
        }
      }
      if (!found && cnt >= 30) { this.ai0 = 1; this.outT = 0; return; } // :36932-36938 / :37009-37017
      const dd = Math.hypot(tx - this.cx, ty - this.cy) || 1;
      this.steerTo(((tx - this.cx) / dd) * 12, ((ty - this.cy) / dd) * 12, 0.25); // :36937-36973
      return;
    }
    if (this.projId === 301) {
      // 301 Bouncing Shield（:37062-37080）：按住 ≥20/松手 ≥100 双门,回收时速度归零
      const held = this.channel ? this.channel() : false;
      if ((held && this.outT >= 20) || (!held && this.outT >= 100)) {
        this.ai0 = 1; this.outT = 0; this.vx = 0; this.vy = 0;
      }
      return;
    }
    // 缺省族（:37082-37086）：无摩擦直线,ai[1]≥30 回收
    if (this.outT >= 30) { this.ai0 = 1; this.outT = 0; }
  }

  /** 光刃撞墙悬停态（ai[0]==2,:37089-37109;由撞墙分支 :17975-17990 进入） */
  private aiHover(game: GameHooks): void {
    if (this.vy < 0) this.vy *= 0.5; // :37091-37093
    this.rot = 2.335;                // :37095
    this.vx = 0;                     // :37096
    this.vy += 1;                    // :37097
    if (!this.hoverSfxDone) {        // localAI[1] 一次性门 :37098-37109
      if (this.projId === 1074) { this.localT = -1; game.playSfxFiles(['Item_182'], 1, this.cx, this.cy); }
      else game.playSfxFiles(['Item_15'], 1, this.cx, this.cy);
      this.hoverSfxDone = true;
    }
  }

  /** ③ 返回段（ai[0]==1,:37111-37288） */
  private aiReturn(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (isPhase) {
      // :37114-37124 direction 朝玩家侧;rotation = 飞行向 - 2.335
      this.dir = this.cx < p.cx ? -1 : 1;
      this.rot = Math.atan2(this.vy, this.vx) - 2.335;
      if (this.localT <= 0) { // :37125-37144 localAI[0] 门（悬停过=Item_182,否则 Item_7）
        game.playSfxFiles([this.projId === 1074 ? (this.localT < 0 ? 'Item_182' : 'Item_7') : 'Item_15'],
          1, this.cx, this.cy);
        this.localT = 1;
      }
    }
    // tileCollide=false（:37145）——moveStep 直接积分
    const [spd0, acc0] = BOOMERANG_RETURN[this.projId] ?? (isPhase ? [40, 3] : [9, 0.4]); // :37146-37206
    // 1457 :40172-40186（1456 无）:回程参数接攻速缩放——num30 = Remap(1.5,0,1,1,1/meleeSpeed)
    // = 1.5/meleeSpeed − 0.5 钳 1..10（本仓 meleeSpeed = 1/attackSpeedMult，即 toMax =
    // attackSpeedMult）;光刃族豁免（flag3=false）。攻速惩罚档回程更慢更飘,加速档钳底 1 不缩
    let spd = spd0, acc = acc0;
    if (!isPhase) {
      const asm = game.player.attackSpeedMult || 1;
      let num30 = 1.5 * asm - 0.5;
      if (num30 > 10) num30 = 10;
      if (num30 < 1) num30 = 1;
      spd *= num30;
      acc *= num30;
    }
    let dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    // :37223-37232 距离 Kill 门（301 6000/其余 3000）
    if (d > (this.projId === 301 ? 6000 : 3000)) { this.dead = true; return; }
    dx = (dx / d) * spd; dy = (dy / d) * spd; // :37234-37236 目标速度 = 朝向 × num28
    if (this.projId === 383) {
      // :37237-37247 383 专属:沿 (目标速度-当前速度) 方向加速 min(num29, 差距长)
      const ddx = dx - this.vx, ddy = dy - this.vy;
      const dl = Math.hypot(ddx, ddy);
      if (dl > 0) {
        const s = Math.min(acc, dl);
        this.vx += (ddx / dl) * s; this.vy += (ddy / dl) * s;
      }
    } else {
      this.steerTo(dx, dy, acc); // :37249-37282 轴步进,异号加倍
    }
    // ④ 回收:与玩家 AABB 相交即 Kill（:37272-37288,仅本机投射物）
    if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
      this.dead = true;
    }
  }

  /** 移动/撞墙段（HandleMovement 撞墙分支 :18103-18161;分轴探测 = lastVelocity 语义） */
  private moveStep(game: GameHooks, isPhase: boolean): void {
    if (this.ai0 === 1) { this.x += this.vx; this.y += this.vy; return; } // 穿墙（:37145）
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
    if (WALL_BOUNCE_PROJ.has(this.projId)) {
      // 撞墙尘 + 挖掘音（默认族 Collision.HitTiles :18139-18140 + SoundID 0 :18161）
      game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });
      game.playSfx('dig', 1, this.cx, this.cy);
      // :18142-18151 33/106/866 命中轴反弹,不回收（106 LightDisc_Bounce 溅射视觉略）
      if (hitX) this.vx = -lvx;
      if (hitY) this.vy = -lvy;
    } else if (isPhase) {
      // :17975-17990 光刃撞墙 → 悬停态（独立 else 链:无 HitTiles 尘/挖掘音,
      // 入态音尘由 aiHover 的 localAI[1] 门承担）
      this.ai0 = 2; this.outT = 0;
    } else {
      // 撞墙尘 + 挖掘音（同上 :18139-18140/:18161）
      game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });
      game.playSfx('dig', 1, this.cx, this.cy);
      // :18152-18160 其余:ai[0]=1 回收 + 速度=-lastVelocity（383 豁免取反 :18156）。
      // 383 ≥10 的 HitTilesInACircle(300)+Item14 / 301 冲击波粒（:18115-18138）未建模
      this.ai0 = 1; this.outT = 0;
      if (this.projId !== 383) { this.vx = -lvx; this.vy = -lvy; }
    }
  }

  /** 尾段 rotation/尘（:37294-37352,出程/悬停/返回全状态运行;光刃走专属段不进此链） */
  private aiVisual(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (this.projId === 106) {
      this.rot += 0.3 * this.dir; // :37294-37296 光碟两段自旋 0.3
    } else if (this.projId === 866) {
      this.rot = Math.atan2(this.vy, this.vx); // :37298-37308 飞刀贴图对准飞行向
    } else if (this.projId === 383) {
      // :37310-37325 出程对准飞行向 / 返回段对准 (球心-玩家) 向量,+π/2
      this.rot = (this.ai0 === 0
        ? Math.atan2(this.vy, this.vx)
        : Math.atan2(this.cy - p.cy, this.cx - p.cx)) + Math.PI / 2;
    } else if (this.projId === 301) {
      // :37326-37350 出程对准飞行向+π/4（尘略）/ 返回段自旋 0.4×direction
      if (this.ai0 === 0) this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 4;
      else this.rot += 0.4 * this.dir;
    } else if (!isPhase) {
      this.rot += 0.4 * this.dir; // :37351-37352 缺省族两段自旋 0.4（非定角!）
    }
    // per-type 尘近似（:36652-36738,色/率近似）
    const dust = BOOMERANG_DUST[this.projId];
    if (dust && Math.random() < dust[1]) {
      game.spawnParticles(this.cx, this.cy, dust[0], 1, 0.4, { life: 18, grav: 0, size: 2 });
    }
  }

  /** 命中敌回调 = Projectile.Damage 回收门 + 穿透自减（:12278-12299/:13124-13182） */
  private onHitEnemy(): void {
    // :12278-12291 出程命中敌 → 速度反转 + ai[0]=1（豁免 301/866/902/光刃族;
    // 106 的 LightDisc_Bounce 溅射 :12282-12284 视觉略）
    if (this.ai0 === 0 && !NO_HIT_RETURN_PROJ.has(this.projId)
      && !PHASEBLADE_PROJ.has(this.projId)) {
      this.vx = -this.vx; this.vy = -this.vy;
      this.ai0 = 1; this.outT = 0;
    }
    // :12292-12297 902 返回段命中 direction 翻转
    if (this.projId === 902 && this.ai0 !== 0) this.dir *= -1;
    // penetrate 自减（:13175-13182）;==0 → Kill（:15866-15868）;
    // 866 特例（:13124-13137):五击后 penetrate 复位 1、伤害归零不消失
    if (this.penetrate > 0) {
      this.penetrate--;
      if (this.penetrate === 0) {
        if (this.projId === 866) { this.penetrate = 1; this.damage = 0; }
        else this.dead = true;
      }
    }
  }
}

// ================= 长矛（aiStyle 19，AI_019_Spears，Projectile.cs:43198） =================

/** 每型号伸缩参数（AI_019_Spears_GetSpearOffsetRelativeToPlayer :43417-43540 switch）：
 *  [初始偏移 num6, 伸出速 num7, 缩回速 num8]——位移 = dir × shootSpeed × offset。
 *  aiStyle 161（短剑刺 802/842/938-945）不走此表——见 RAPIER_PROJ 独立 AI_161 模型 */
const SPEAR_PARAMS: Record<number, [number, number, number]> = {
  46: [3, 1.4, 1.6], 105: [3, 2.1, 2.4], 367: [3, 1.5, 1.6], 368: [3, 1.4, 1.5],
  222: [3, 2.1, 2.4], 342: [3, 2.1, 2.4], 47: [4, 0.9, 1.2], 153: [4, 1.3, 1.5],
  49: [4, 0.85, 1.1], 730: [8, 1.2, 1.5], 877: [28, 0.4, 0.4], 878: [28, 0.4, 0.4],
  879: [28, 0.4, 0.4], 64: [3, 1.7, 1.9], 215: [3, 1.7, 1.9],
  66: [3, 1.9, 2.1], 97: [3, 1.9, 2.1], 212: [3, 1.9, 2.1], 218: [3, 1.9, 2.1],
  130: [3, 1.0, 1.3], 1103: [4, 0.85, 1.1],
};

/** aiStyle 161 短剑刺族（DefaultToShortsword :10158-10172 全集合：802 GladiusStab /
 *  842 RulerStab / 938-945 七金属短剑+铁短剑刺）。AI_161_RapierStabs（:44987-45004）
 *  独立直刺模型：Center = 玩家MountedCenter + velocity×(ai[0]−1),ai[0]≥16 Kill;
 *  ★extraUpdates = 1（:10165）——每帧跑 2 个 AI 子步（Projectile.cs:15331-15336
 *  numUpdates 循环）,整刺 16 步在 8 帧内完成、每帧推进 2×shootSpeed（1.4.4 短剑
 *  重做的"快刺"节奏本体）。考古备注：1.4.5.6 的 aiStyle 161 无"掷出"独立态——
 *  短剑重做的可投掷性体现在物品侧（useStyle 13 + noUseGraphic + shoot=刺弹）,
 *  Projectile.AI case 161 仅持握刺击单态（无 ai[1] 分支/无 throw 站点,
 *  938-945 唯一生成点 = ItemCheck_Shoot 通用尾段 :48637） */
const RAPIER_PROJ = new Set([802, 842, 938, 939, 940, 941, 942, 943, 944, 945]);
/** 802/842（Gladius/Ruler）出膛抖动族（ItemCheck_Shoot :46700-46707）：
 *  角 ±π/8、速 ±0.7——Ruler/Gladius 的"尺子不准"机制本体 */
const RAPIER_JITTER_PROJ = new Set([802, 842]);

/** 长矛/细剑绘制角与镜像(纯函数,供 draw 与回归测试共用)。
 *  AI_019 = DrawProj_Spear 专支(Main.cs:34153-34157 按 aiStyle==19 派发,
 *  :34659-34668):num = atan2(vy,vx)+2.355(=3π/4);theOwner.direction>0(玩家朝右)
 *  → dir=FlipHorizontally 且 num -= π/2、origin.X=贴图宽。AI 侧 rotation 赋值同值
 *  (:43271-43276,:43214 spriteDirection=-direction)。
 *  AI_161 = :44990 rotation=atan2+π/2;DrawProjDirect(:32360 族)里【仅 938-945】
 *  再 num327 -= π/4×sd（:32443-32446）——802/842 无此偏置,只 atan2+π/2;
 *  dir=spriteDirection==-1 → FlipHorizontally（:29825-29829,DrawProj 层级全局位,
 *  AI_161 :44995 设 spriteDirection=sign(vx)）。
 *  ★朝向陷阱(2026-08-13 终审):AI_019 的翻转条件是"玩家朝右",曾写反成 dx<0 且丢
 *  mirror——右刺纯数值巧合仍指正右,左刺矛头指 φ-π/2(正下)偏 90°。 */
export function spearDrawAngle(
  dx: number, dy: number, isRapier: boolean, rapierNoQuarter = false,
): { ang: number; mirror: boolean } {
  const sd = dx >= 0 ? 1 : -1;
  if (isRapier) {
    // rapierNoQuarter = 802/842（Main.cs:32443 只列 938-945）
    return { ang: Math.atan2(dy, dx) + Math.PI / 2 - (rapierNoQuarter ? 0 : Math.PI / 4 * sd), mirror: sd === -1 };
  }
  let ang = Math.atan2(dy, dx) + 2.355; // :34659
  let mirror = false;
  if (sd > 0) { ang -= Math.PI / 2; mirror = true; } // :34664-34668 朝右翻转
  return { ang, mirror };
}

/** 命中盒型号表（SetDefaults 逐 type width/height,Projectile.cs:1036/1924/4045 等;
 *  其余型号均 18×18,46=20、130=22、877-879=25;342 是 22×2 薄刃——原版真值勿当
 *  提取器错值修掉）。161 细剑族全 18×18。此前恒 20×20 → 14 型号命中盒失真(2026-08-13 终审) */
const SPEAR_SIZE: Record<number, [number, number]> = {
  46: [20, 20], 130: [22, 22], 342: [22, 2],
  877: [25, 25], 878: [25, 25], 879: [25, 25],
};

/** AI_019_Spears_GetExtensionHitbox（Projectile.cs:43530-43571）纯函数：
 *  105 昆恩枪/46 暗黑长枪/153 腐叉（default return false——其余长矛无延伸盒）在
 *  【伸出相】（itemAnimation ≥ itemAnimationMax/3，:43533 缩回相不生成）沿速度向
 *  生成前向延伸方盒：
 *    num2 = Remap(itemAnimation, max, ⌊max/3⌋, 0,1) = t/(max−⌊max/3⌋)（出生 0 →
 *           伸出相末 1，钳 [0,1]）
 *    距离 num7 = 10 + len·num2（len：105/46=50、153=40；default 30）、
 *    边长 num8 = 10 + size·num2（size：105=20、46=15、153=10；default 10）
 *    len ×= 1/meleeSpeed（:43559——本仓 attackSpeedMult = 1/meleeSpeed）
 *    盒 = CenteredRectangle(Center + velocity向·num7, (num8,num8))
 *  消费：伤害 Colliding 步进盒（:14554-14576，hitEnemies extBox 参）+ CutTiles
 *  （:14176-14179 CutTilesAt(extensionBox)）。t/dur 与 SpearProj 的 itemAnimation
 *  同源（itemAnim = dur − t） */
export function spearExtensionHitbox(
  projId: number, t: number, dur: number,
  cx: number, cy: number, dx: number, dy: number,
  attackSpeedMult = 1,
): { x: number; y: number; w: number; h: number } | null {
  if (projId !== 105 && projId !== 46 && projId !== 153) return null;   // :43544 default
  if (dur - t < dur / 3) return null;                    // :43533-43535 缩回相（浮点 max/3）
  const num3 = Math.floor(dur / 3);                                     // :43536 int 除法
  let num4 = 50, num6 = 15;
  if (projId === 105) { num4 = 50; num6 = 20; }
  else if (projId === 153) { num4 = 40; num6 = 10; }
  num4 *= attackSpeedMult;                                              // :43559
  const num2 = Math.min(1, Math.max(0, t / (dur - num3)));              // :43539 Remap
  const num7 = 10 + num4 * num2;                                        // :43560
  const num8 = 10 + num6 * num2;                                        // :43561
  const ccx = cx + dx * num7, ccy = cy + dy * num7;                     // :43562
  return { x: ccx - num8 / 2, y: ccy - num8 / 2, w: num8, h: num8 };    // :43563
}

export class SpearProj extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 刺出方向（单位向量，原版出手时定死） */
  private dx: number;
  private dy: number;
  /** 原版 item.shootSpeed（velocity 模长——位移=offset×此值,勿当单位向量用） */
  private spd: number;
  /** 出生帧乘上的 meleeSpeed 缩放（attackSpeedMult = 1/meleeSpeed）——延伸盒
   *  len ×= 1/meleeSpeed（Projectile.cs:43559）复用同值（缺省 1 = 无缩放） */
  private spdMul = 1;
  private t = 0;
  private dur: number;
  /** 型号伸缩参数 */
  private prm: [number, number, number];
  private hitCd = new HitCooldown();
  dead = false;

  constructor(dirX: number, dirY: number, spd: number, dur: number, damage: number, knockback: number, projId: number) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dx = dirX / n;
    this.dy = dirY / n;
    this.spd = spd || 2.4; // 兜底:提取表 shootSpeed 缺失(七金属短剑模板坑)时按短剑族 2.1-2.4 档
    this.dur = dur;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.prm = SPEAR_PARAMS[projId] ?? [3, 1.9, 2.1];
    const sz = SPEAR_SIZE[projId];
    if (sz) { this.w = sz[0]; this.h = sz[1]; } // 342 薄刃 22×2 等按型号
    // 802/842 出膛抖动（ItemCheck_Shoot :46700-46707）：向 ±π/8 旋转 + 速 ±0.7
    //（num8=π/4、NextFloat()−0.5 → [−π/8,+π/8];NextFloatDirection()×0.7 减速）
    if (RAPIER_JITTER_PROJ.has(projId)) {
      const ang = Math.atan2(this.dy, this.dx) + Math.PI / 4 * (Math.random() - 0.5);
      this.spd = Math.max(0, this.spd - (Math.random() * 2 - 1) * 0.7);
      this.dx = Math.cos(ang);
      this.dy = Math.sin(ang);
    }
  }

  draw(r: Renderer, cam: Camera): void {
    const isRap = RAPIER_PROJ.has(this.projId);
    const noQuarter = RAPIER_JITTER_PROJ.has(this.projId);
    const { ang, mirror } = spearDrawAngle(this.dx, this.dy, isRap, noQuarter);
    // Utils.GetLerpValue clamped(:44992):淡入 t/7(t≤7),淡出 (16-t)/4(t≥12)
    const aIn = Math.min(1, this.t / 7);
    const aOut = this.t <= 12 ? 1 : Math.max(0, (16 - this.t) / 4);
    // 绘制尺寸：投射物一律贴图原生尺寸（原版 SpriteBatch scale=1 语义）。
    // ★非细剑族曾 drawSize=0 → 取碰撞盒 w=18px,而三叉戟 47=70×70、圣骑矛 153=84×84、
    //   暗黑长枪 222=116×116 全被缩到 18px = "特别小"根因（2026-08-17 用户抓到）。
    //   细剑族 938-945 恰 32×32 沿用固定 32（等值无差）;jitter 族仍 -1 原生
    drawProj(r, cam, this, this.projId, ang,
      '#A0A0B0', isRap ? aIn * aOut : 1, isRap ? (noQuarter ? -1 : 32) : -1, mirror, isRap);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (this.dead) return;   // 已消亡不再推进（EntityManager compact 之外的直调防护）
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = game.player;
    // melee 弹速 /meleeSpeed（ItemCheck_Shoot :46431-46434——长矛与短剑刺都不在
    // NoMeleeSpeedVelocityScaling 排除表 {699,707,877-879,985,973} 内,ProjectileID.cs:337;
    // attackSpeedMult = 1/meleeSpeedTotal,Player.ts 同式）。出生帧一次定型
    if (this.t === 0) {
      const am = (p as { attackSpeedMult?: number }).attackSpeedMult;
      if (am && am > 0 && am !== 1) { this.spd *= am; this.spdMul = am; }
    }
    if (RAPIER_PROJ.has(this.projId)) {
      // AI_161_RapierStabs(:44987-45004) + extraUpdates=1(DefaultToShortsword :10165;
      // Projectile.cs:15331-15336 numUpdates 循环)：每帧 2 个 AI 子步,16 步 8 帧跑完
      this.rapierStep(game);
      if (!this.dead) this.rapierStep(game);
      return;
    }
    this.t++;
    if (this.t >= this.dur) { this.dead = true; return; }
    // AI_019 伸缩包络 1:1（:43441-43540）：
    //   itemAnimation 从 max 递减；伸出相占前 2/3（num5 增长），缩回相占后 1/3（num10 增长）
    const max = this.dur;
    const num3 = Math.floor(max / 3);
    const itemAnim = Math.max(0, max - this.t);
    const num4 = Math.min(itemAnim, num3);
    const num5 = itemAnim - num4;
    const num9 = (max - num3) - num5;
    const num10 = num3 - num4;
    const [n6, n7, n8] = this.prm;
    const offset = n6 + n7 * num9 - n8 * num10;
    this.x = p.cx - this.w / 2 + this.dx * offset * this.spd;
    this.y = p.cy - this.h / 2 + this.dy * offset * this.spd;
    // 前向延伸盒（AI_019_Spears_GetExtensionHitbox :43530-43571，仅 105/46/153 伸出相）
    const extBox = spearExtensionHitbox(this.projId, this.t, this.dur,
      this.cx, this.cy, this.dx, this.dy, this.spdMul);
    // CutTiles（Projectile.CutTiles aiStyle 19 支 :14176-14179）：CutTilesAt(extensionBox)
    // ——伸出相延伸盒扫杂草/瓦罐（弹体本体格在下方 hitCritters/命中管线外另行处理）
    if (extBox) {
      for (let ty = Math.floor(extBox.y / 16); ty <= Math.floor((extBox.y + extBox.h) / 16); ty++) {
        for (let tx = Math.floor(extBox.x / 16); tx <= Math.floor((extBox.x + extBox.w) / 16); tx++) {
          game.cutTile(tx, ty);
        }
      }
    }
    hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen,
      undefined, undefined, false, extBox); // 一次突刺每敌只结算一次（延伸盒并入判定）
  }

  /** AI_161 单个 AI 子步（:44989-45003）：ai[0]++ → Center=玩家心+velocity×(ai[0]−1)
   *  → ai[0]≥16 Kill（原版 Kill 步仍先落位再消亡——:44994 落位在 :44996 判死之前） */
  private rapierStep(game: GameHooks): void {
    this.t++;
    const p = game.player;
    this.x = p.cx - this.w / 2 + this.dx * this.spd * (this.t - 1);
    this.y = p.cy - this.h / 2 + this.dy * this.spd * (this.t - 1);
    if (this.t >= 16) { this.dead = true; return; }
    // CutTiles（Projectile.cs:14151-14155：Center 起 10px×scale 线段扫杂草/瓦罐
    // ——细剑戳击可清障的机制本体，曾整段漏接 2026-08-13 报障修复）
    game.cutTile(Math.floor((this.cx + this.dx * 10) / 16), Math.floor((this.cy + this.dy * 10) / 16));
    hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen);
  }
}

// ================= 燃烧瓶（proj 399 aiStyle 68；Molotov 2590→399，Kill 链 :70889-70928） =================
// 弹跳物理（ai[0]>=15 起重力 0.2/t，AI_068 :29048-29100）；死亡（撞块/命中/超时）→
// 6 朵火云 400+rand3（:70918-70927：散布 ±8/上抛，伤 ×0.5，火云=aiStyle 14 弹跳穿透 3、
// 360t、命中 OnFire 3-6s :10850-10852）
export class MolotovProj extends Entity {
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  private t = 0;
  private hitSet = new Set<number>();
  dead = false;
  /** 火云生成回调（Game 注入——避免实体循环依赖） */
  spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.spawnFires = spawnFires;
  }

  private breakOpen(game: GameHooks): void {
    this.dead = true;
    // :70918-70927 六朵火云：x 散布 -vx×rand(20,50)%±8、y -|vy|×rand(30,50)%-8..+2
    for (let i = 0; i < 6; i++) {
      const fx = -this.vx * (20 + Math.floor(Math.random() * 30)) * 0.01 + (Math.random() * 40 - 20) * 0.4;
      const fy = -Math.abs(this.vy) * (30 + Math.floor(Math.random() * 20)) * 0.01 + (Math.random() * 24 - 20) * 0.4;
      this.spawnFires(this.cx + fx, this.cy + fy, Math.max(1, Math.round(this.damage * 0.5)), fx, fy);
    }
    game.spawnParticles(this.cx, this.cy, '#FF9A3C', 20, 5, { life: 30, grav: -0.06, damp: 0.94 });
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (++this.t >= 3) { /* alpha 淡入（:29054）视觉从略 */ }
    if (this.t >= 15) this.vy = Math.min(this.vy + 0.2, 16); // :29063
    else this.vy = Math.min(this.vy + 0.1, 16);
    this.vx *= 0.99;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (solidAt(nx + this.w / 2, this.y + this.h / 2)) { this.breakOpen(game); return; } // 撞块即裂
    if (solidAt(this.x + this.w / 2, ny + this.h - 1)) { this.breakOpen(game); return; }
    this.x = nx; this.y = ny;
    if (this.t > 600) { this.dead = true; return; }
    // 命中敌即裂（penetrate 1）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean };
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        this.hitSet.add(e.id);
        this.breakOpen(game);
        return;
      }
    }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 399, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#804020');
  }
}

// ================= 配重球（aiStyle 99 type 556-561/1079，AI_099_1 :64472-64824） =================
// SetDefaults（:5805-5813）：10×10 命中盒、extraUpdates=1（AI/移动/命中每 tick 跑 2 次）、
// DefaultToYoyo、counterweight=true、drawLayer=0。
// ai[0] 状态机：0 主球 / 1 副球（Counterweight() 已有在场时掷,轨道半径 ×0.75,:64532）/
//   -1 回收（松手 :64643-64646 或场上无悠悠球 :64491-64506）→ 飞回玩家 40px 内消亡
//   （:64777-64824:num13=num3×1.5=18 速/惯性 12/>2000 亦亡;tileCollide=false 穿墙）/
//   -3 魔法线幽灵（-1+magicString → 隐身零伤,:64727-64737）/ -2 脱离坠落（克隆,
//   penetrate=1、撞墙即亡、重力 0.3 缓落漂移,:64738-64776 + :16988-17006）。
// 环绕段：半径 num=250×0.5=125（yoyoString +25%+10,:64486-64488）；超径钳回轨道 +
//   切向增速 vector2=(vy,vx) 翻转带象限符号（:64540-64608,仅超径时运行）；鼠标位移
//   反推（vector5×-1×0.1,:64614-64642）；800px 内最近敌追踪 v3×6 lerp 1/8
//   （:64643-64717,敌须距玩家 <num×0.9 且有视线）；速度钳 [num4=9,num3=12]
//   （:64718-64726）。撞墙全轴反转 + 朝玩家 0.25 合成 + 钳 6（:17005-17028）。
/** 配重球运行上下文（Game 注入闭包——实体不持 EntityManager 引用） */
export interface CounterweightCtx {
  /** 拥有者（玩家中心/装备/绳锚链；null 或 dead → Kill,:64490-64493）。
   *  yoyoStringAnchor = Main.cs:27794-27803 悠悠球/配重球线起点全链
   *  （mountedCenter → mount52 → +gfxOffY → ApplyItemPositionOffsetFromMount），
   *  Player 实装——Game 闭包返回完整 Player 实例，结构满足 */
  owner: () => {
    cx: number; cy: number; dead?: boolean;
    equipStats?: { stringColor?: number; yoyoString?: boolean; magicString?: boolean };
    yoyoStringAnchor(target?: { x: number; y: number }, channelActive?: boolean): { x: number; y: number };
  } | null;
  /** Main.player[owner].channel 语义（按住使用中）——false → 回收（:64643-64646） */
  channel: () => boolean;
  /** 场上还有悠悠球（AI_099_1 :64488-64500 扫描门:aiStyle99 非配重球且 ai0>=-1） */
  yoyoInPlay: () => boolean;
  /** 光标世界坐标（线起点 mount54 行档 aim 用——原版读 player.itemRotation，
   *  其原料 = 鼠标世界位对 RotatedRelativePoint(MountedCenter) 参照点，Player 侧
   *  itemAimRotDir 复算；缺省 = 无 aim 走行 3 中档带） */
  aimTarget?: () => { x: number; y: number };
  /** 本帧鼠标屏幕位移（Main.mouseX-lastMouseX,:64614） */
  mouseDelta: () => { dx: number; dy: number };
  /** 魔法线克隆回调（:64727-64733:-1 回收 + magicString → 掷 75% 伤/击退脱离克隆） */
  spawnClone?: (x: number, y: number, vx: number, vy: number, dmg: number, kb: number, projId: number, crit?: number, armorPen?: number) => void;
  /** 悠悠球命中链回调（Projectile.cs:12482 Player.Counterweight）——配重球命中同样触发 */
  counterweight?: (hitX: number, hitY: number, dmg: number, kb: number) => void;
}

export class CounterweightProj extends Entity {
  /** SetDefaults :5808-5809 */
  w = 10; h = 10;
  damage: number;
  knockback: number;
  projId: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  /** ai[0] 状态（0/1 环绕、-1 回收、-3 幽灵、-2 脱离） */
  ai0: number;
  private rot = 0;
  private ctx: CounterweightCtx;
  private hitCd = new HitCooldown();
  /** 方向（-2 漂移/rotation 定号） */
  private dir = 1;
  dead = false;
  /** 手部坐标 + 线色快照（线段链起点/染色，每 AI 次刷新） */
  handX = 0;
  handY = 0;
  stringColor = 0;
  /** -3 幽灵隐身（alpha=255,:64734-64736）——绘制侧消费 */
  ghost = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    ai0: number, ctx: CounterweightCtx) {
    super();
    this.x = x; this.y = y;
    this.damage = damage; this.knockback = knockback; this.projId = projId;
    this.ai0 = ai0;
    this.ctx = ctx;
    this.handX = x; this.handY = y;
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡：纯位移外推
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // extraUpdates=1（SetDefaults :5807）:AI/移动/命中每 tick 跑 2 次;-2 脱离态
    // extraUpdates=0（:64739,克隆出生即脱离 → 单跑）
    const iters = this.ai0 === -2 ? 1 : 2;
    for (let i = 0; i < iters && !this.dead; i++) this.aiStep(game);
  }

  private aiStep(game: GameHooks) {
    const p = this.ctx.owner();
    if (!p || p.dead) { this.dead = true; return; }   // player.dead → Kill（:64490-64493）
    // 线起点（Main.cs:27794-27803 悠悠球/配重球共用段）：mountedCenter → mount52
    // 修正 → +gfxOffY → ApplyItemPositionOffsetFromMount（Player.yoyoStringAnchor
    // 全链；aimTarget = 光标世界坐标，channel = itemAnimation>0 代理——原版
    // 悠悠球 channel 期 itemAnimation 持续刷新）
    const t = this.ctx.aimTarget?.();
    const hand = p.yoyoStringAnchor(t, this.ctx.channel());
    this.handX = hand.x; this.handY = hand.y;
    const eq = p.equipStats;   // 装备快照（accessor 每次全量重算,单次捕获）
    this.stringColor = eq?.stringColor ?? 0;
    // num=250×0.5=125 轨道半径（:64477/:64482）;num3=15×0.8=12 速度上限;
    // num4=12×1.5×0.5=9 速度下限（:64478-64483/:64531）;num5=num3=12 漂移钳
    let num = 125;
    const num3 = 12, num4 = 9, num5 = 12;
    // 场上无悠悠球 → 回收（:64491-64506,owner 本机 && ai0>=0 门）
    if (this.ai0 >= 0 && !this.ctx.yoyoInPlay()) this.ai0 = -1;
    if (eq?.yoyoString) num += num * 0.25 + 10;   // :64486-64488
    this.rot += 0.5;   // :64489
    if (Number.isNaN(this.vx) || Number.isNaN(this.vy)) { this.dead = true; return; }
    if (this.ai0 === 0 || this.ai0 === 1) {
      if (this.ai0 === 1) num *= 0.75;   // 副球收紧轨道（:64532-64535）
      let flag3 = false;
      let dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy);
      // :64536-64540 flag3 = 距玩家超 0.9×轨道（原版同位还有 ai[0] != -2f 恒真死检查,
      // 本分支已在 ai0∈{0,1} 内,省略不改变语义）
      if (d > num * 0.9) flag3 = true;
      if (d > num) {
        // 超径钳回（:64541-64550）：钳到轨道 + 速度径向衰减（去超出的 num6,至少留 1）
        const over = d - num;
        dx /= d || 1; dy /= d || 1;
        this.x = p.cx - dx * num - this.w / 2;
        this.y = p.cy - dy * num - this.h / 2;
        const sp = Math.hypot(this.vx, this.vy);
        const cut = Math.min(over, Math.max(0, sp - 1));   // num6 钳（:64556）
        if (sp > 0) { this.vx *= (sp - cut) / sp; this.vy *= (sp - cut) / sp; }
        // 切向增速（:64552-64608）：vector2=(vy,vx) 按象限定号后并入速度方向
        const sp0 = Math.hypot(this.vx, this.vy);
        if (sp0 > 0) {
          let tx = this.vy, ty = this.vx;   // vector2 翻转
          if (this.cy < p.cy) ty = Math.abs(ty); else if (this.cy > p.cy) ty = -Math.abs(ty);
          if (this.cx < p.cx) tx = Math.abs(tx); else if (this.cx > p.cx) tx = -Math.abs(tx);
          const tl = Math.hypot(tx, ty) || 1;
          tx = tx / tl * sp0; ty = ty / tl * sp0;   // vector2 *= velocity.Length()
          if (Math.abs(this.vx) > Math.abs(this.vy)) {
            let nvx = this.vx, nvy = this.vy + ty;
            const nl = Math.hypot(nvx, nvy) || 1;
            nvx = nvx / nl * sp0; nvy = nvy / nl * sp0;
            if (Math.abs(tx) < 0.1 || Math.abs(ty) < 0.1) { this.vx = nvx; this.vy = nvy; }
            else { this.vx = (nvx + this.vx * 2) / 3; this.vy = (nvy + this.vy * 2) / 3; }
          } else {
            let nvx = this.vx + tx, nvy = this.vy;
            const nl = Math.hypot(nvx, nvy) || 1;
            nvx = nvx / nl * sp0; nvy = nvy / nl * sp0;
            if (Math.abs(tx) < 0.2 || Math.abs(ty) < 0.2) { this.vx = nvx; this.vy = nvy; }
            else { this.vx = (nvx + this.vx * 2) / 3; this.vy = (nvy + this.vy * 2) / 3; }
          }
        }
      }
      // 鼠标位移反推（:64614-64642）：vector5=-(mouseDelta)×num2(0.1);velocity 非零才
      // 生效;flag3 时清掉继续远离玩家的分量
      if (this.ctx.channel()) {
        const md = this.ctx.mouseDelta();
        if (this.vx !== 0 || this.vy !== 0) {
          let mx = -md.dx, my = -md.dy;   // flag 恒 true → ×-1（:64623-64626）
          if (flag3) {
            if (this.cx < p.cx && mx < 0) mx = 0;
            if (this.cx > p.cx && mx > 0) mx = 0;
            if (this.cy < p.cy && my < 0) my = 0;
            if (this.cy > p.cy && my > 0) my = 0;
          }
          this.vx += mx * 0.1;
          this.vy += my * 0.1;
        }
      } else {
        this.ai0 = -1;   // 松手回收（:64643-64646）
      }
      // 800px 内最近敌追踪（:64643-64717;flag 恒真——配重球全走 num8=800 档;
      // num11=|dx|+|dy| 曼哈顿距;敌距玩家 <num×0.9 且对球有视线）
      {
        let best = 800, tx = 0, ty = 0, found = false;
        for (const ent of game.enemies()) {
          if (!playerCanHitEnemy(ent, game)) continue;   // CanBeChasedBy :91070
          const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
          if (e.dead) continue;
          const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
          const dist = Math.abs(this.cx - ecx) + Math.abs(this.cy - ecy);
          if (dist >= best) continue;
          if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          if (Math.hypot(ecx - p.cx, ecy - p.cy) >= num * 0.9) continue;
          best = dist; tx = ecx; ty = ecy; found = true;
        }
        if (found) {
          let cdx = tx - this.cx, cdy = ty - this.cy;
          const cd = Math.hypot(cdx, cdy) || 1;
          cdx = cdx / cd * 6; cdy = cdy / cd * 6;   // v3 *= 6（:64710-64712）
          this.vx = (this.vx * 7 + cdx) / 8;
          this.vy = (this.vy * 7 + cdy) / 8;
        }
      }
      // 速度钳 [num4=9, num3=12]（:64718-64726;零速保持零——SafeNormalize(Zero) 语义）
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > num3) { this.vx = this.vx / sp * num3; this.vy = this.vy / sp * num3; }
      else if (sp > 0 && sp < num4) { this.vx = this.vx / sp * num4; this.vy = this.vy / sp * num4; }
    }
    // 魔法线（:64727-64733）：-1 回收态 + magicString → -3 幽灵 + 掷 75% 伤/击退脱离克隆
    if (this.ai0 === -1 && eq?.magicString) {
      this.ai0 = -3;
      this.ctx.spawnClone?.(this.cx, this.cy, this.vx, this.vy,
        Math.trunc(this.damage * 0.75), Math.trunc(this.knockback * 0.75), this.projId,
        this.critChance, this.armorPen);
    }
    if (this.ai0 === -3) { this.ghost = true; this.damage = 0; }   // alpha=255 + damage=0（:64734-64737）
    if (this.ai0 === -2) {
      // 脱离坠落（:64738-64776）：penetrate=1（克隆一次命中即亡）;重力 0.3、速度上限
      // 16、vy≤3 缓落水平漂移 ±0.1（num5 钳）
      this.vy += 0.3;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 16) { this.vx = this.vx / sp * 16; this.vy = this.vy / sp * 16; }
      else if (this.vy <= 3) {
        if (Math.abs(this.vx) < 0.1) {
          if (this.cx < p.cx) { this.vx -= 0.1; this.dir = -1; }
          else { this.vx += 0.1; this.dir = 1; }
        } else if (this.vx > 0 && this.vx < num5) this.vx += 0.1;
        else if (this.vx < 0 && this.vx > -num5) this.vx -= 0.1;
      }
    } else if (this.ai0 < 0) {
      // 回收（:64777-64824）：num13=num3×1.5=18 速、惯性 num14=12;
      // 距玩家 <40 / NaN / >2000 → Kill;tileCollide=false 穿墙直积分
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < 40 || Number.isNaN(d) || d > 2000) { this.dead = true; return; }
      this.vx = (this.vx * 11 + (dx / (d || 1)) * 18) / 12;
      this.vy = (this.vy * 11 + (dy / (d || 1)) * 18) / 12;
      this.x += this.vx;
      this.y += this.vy;
      hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1, this.armorPen,
        (e) => this.onHit(e), undefined, true);   // 玩家级共享免疫（aiStyle 99 同族）
      return;
    }
    // 移动/碰撞（环绕与脱离态;回收态上方已直积分返回）
    const lvx = this.vx, lvy = this.vy;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.ai0 === -2) {
      // 脱离态撞块（:16988-17006；1457 :69152-69160 定向自转门并入 554 Kraken）：竖撞 lastVy>4 → 弹起 ×-0.6;横撞 → HitTiles 尘 +
      // SoundID 0 + Kill（配重 AI_099_1——1457 的 554 定向自转门仅 AI_099_2 本体）
      if ((this.onGround || this.hitHead) && lvy > 4) this.vy = -lvy * 0.6;
      if (this.hitWall) {
        game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });   // HitTiles 尘
        game.playSfx('dig', 1, this.cx, this.cy);   // SoundID 0
        this.dead = true;
        return;
      }
    } else if (this.hitWall || this.onGround || this.hitHead) {
      // 环绕态撞块（:17005-17028）：逐轴反转 + 朝玩家合成 0.25 + 速度钳 6
      if (this.hitWall) this.vx = -lvx;
      if (this.onGround || this.hitHead) this.vy = -lvy;
      let hx = p.cx - this.cx, hy = p.cy - this.cy;
      const hd = Math.hypot(hx, hy) || 1;
      const spd = Math.hypot(this.vx, this.vy);
      hx = hx / hd * spd * 0.25;   // v *= velocity.Length() × 0.25
      hy = hy / hd * spd * 0.25;
      this.vx = this.vx * 0.75 + hx;
      this.vy = this.vy * 0.75 + hy;
      const ns = Math.hypot(this.vx, this.vy);
      if (ns > 6) { this.vx *= 0.5; this.vy *= 0.5; }
    }
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1, this.armorPen,
      (e) => this.onHit(e), undefined, true);   // 玩家级共享免疫（DefaultToYoyo :5809-5813）
  }

  /** 命中链（Projectile.cs:12467-12508 aiStyle 99 段;-2 只被弹开,其余走
   *  Counterweight 调用 + 方向定号 + ai0>=0 活跃反弹（localAI[0] += 20 段对配重球
   *  无寿命语义,天然无效）） */
  private onHit(e: unknown) {
    const ecx = (e as { x: number; w: number }).x + (e as { x: number; w: number }).w / 2;
    const ecy = (e as { y: number; h: number }).y + (e as { y: number; h: number }).h / 2;
    if (this.ai0 === -2) {
      // 脱离态被弹开（:12469-12477）：速度 ÷5 + 上抛 Next(50,81)×0.1 钳 -16
      this.vx /= 5; this.vy /= 5;
      this.vy -= (50 + Math.floor(Math.random() * 31)) * 0.1;
      if (this.vy < -16) this.vy = -16;
      this.dead = true;   // penetrate=1（:64741-64744）一次命中即亡
      return;
    }
    const p = this.ctx.owner();
    if (!p) return;
    this.ctx.counterweight?.(ecx, ecy, this.damage, this.knockback);   // :12482
    this.dir = ecx < p.cx ? -1 : 1;   // :12484-12489
    if (this.ai0 >= 0) {
      // 活跃态命中反弹（:12490-12500）：v×-0.5 + 离敌向 ×16
      let bx = this.cx - ecx, by = this.cy - ecy;
      const bd = Math.hypot(bx, by) || 1;
      this.vx = this.vx * -0.5 + (bx / bd) * 16;
      this.vy = this.vy * -0.5 + (by / bd) * 16;
    }
  }

  draw(r: Renderer, cam: Camera): void {
    // 线（配重球同走 aiStyle 99 段链,Main.cs:27799-27908——ai[0] != -2 命中;-3 幽灵仍画线）
    if (this.ai0 !== -2) {
      const c = r.ctx;
      const tex = r.atlas?.ensureVImage?.('vanilla/FishingLine.png');
      if (c && tex) {
        drawYoyoStringLine(c, tex, this.handX, this.handY, this,
          this.stringColor, stringColorOpts(r.lighting?.clock));
      }
    }
    // -3 幽灵 alpha=255（全透明,:64734-64736）;贴图原生尺寸（SetDefaults 盒 10×10 而贴
    // 图 16×16,drawSize=-1 防缩）。旋转 = proj.rotation 原样（1457 通用尾支
    // M.cs:35040 rotation=proj.rotation、origin=(num153,盒高/2+num151),配重球 556-561/1079
    // 无 num151/152 特支亦无 +π/2——自转增量在 AI（AI_099_1 :68463 rotation+=0.5f,本仓
    // rot+=0.5 同源）;曾 +π/2 = 球体朝向恒偏 90°。悠悠球同族直绘 this.rot（YoyoProj.draw）
    drawProj(r, cam, this, this.projId, this.rot, '#B09060', this.ghost ? 0 : 1, -1);
  }
}

/** Player.Counterweight 决策核（Player.cs:11946-12004 纯逻辑,Game 侧执行掷出）：
 *  数场上悠悠球（非配重球旗标、ai0 != -2）与配重球（旗标、ai0 != -2）→
 *  ① yoyoGlove 且悠悠球数 <2 且 ≥1 → 掷同型二号悠悠球（ai0=1）
 *  ② else if counterWeight >0 且配重球数 <悠悠球数 → 掷配重球（vanity 优先;
 *     kb=(kb+6)/2;已有在场 ai0=1 否则 0——两支速度同为朝命中点 16）
 *  入参 play = 该玩家全部 aiStyle 99 投射物视图（含本球）,按数组序（num=最后一个悠悠球） */
export interface CounterweightPlayView { isWeight: boolean; ai0: number; }
export type CounterweightSpawn =
  | { kind: 'none' }
  | { kind: 'second-yoyo' }
  | { kind: 'counterweight'; type: number; kb: number; secondary: boolean };

/** 悠悠球袋配重球颜色掷骰（Player.cs:14176/:14200——1/7→黑配重 1079,
 *  否则 556+Next(6) 彩色族）。2026-08-19 从 equipStats getter 迁出：原版
 *  ResetEffects 每帧清零后 UpdateEquips 重掷 = 使用期随机；getter 每访问掷
 *  会随记忆化冻结成"每套装备一次"，消费端掷 = 每次命中独立（与原采样等价）。 */
export function rollYoyoCounterweight(): number {
  return Math.floor(Math.random() * 7) === 0 ? 1079 : 556 + Math.floor(Math.random() * 6);
}

export function counterweightDecision(
  eq: { yoyoGlove: boolean; counterWeight: number; vanityCounterWeight: number; yoyoBag?: boolean },
  play: readonly CounterweightPlayView[],
  kb: number,
): CounterweightSpawn {
  if (!eq.yoyoGlove && eq.counterWeight <= 0) return { kind: 'none' };   // :11947-11950
  let yoyos = 0, weights = 0;
  for (const p of play) {
    if (p.isWeight) {
      if (p.ai0 !== -2) weights++;   // num3
    } else if (p.ai0 !== -2) {
      yoyos++;   // num2（num=最后一个悠悠球索引——计数即 ≥1 判据）
    }
  }
  if (eq.yoyoGlove && yoyos < 2) {
    if (yoyos >= 1) return { kind: 'second-yoyo' };   // num >= 0（:11973-11985）
    return { kind: 'none' };   // 手套分支已占用 else-if（:11986）——无球在场不掷配重
  }
  if ((eq.counterWeight > 0 || eq.yoyoBag) && weights < yoyos) {
    return {
      kind: 'counterweight',
      // :11990-11994 vanity 优先 → 功能槽直置(5547 黑/3309-14 彩) → 悠悠球袋
      // 现场掷(原版每帧 UpdateEquips 掷,消费端掷=每次命中独立)
      type: eq.vanityCounterWeight !== 0 ? eq.vanityCounterWeight
        : eq.counterWeight !== 0 ? eq.counterWeight
        : rollYoyoCounterweight(),
      kb: (kb + 6) / 2,   // :11987
      secondary: weights > 0,   // :11995-12003 已有在场 → ai0=1
    };
  }
  return { kind: 'none' };
}

// ================= 悠悠球 / 连枷（aiStyle 99 / 15，channel 语义） =================

/** 悠悠球型号三表（ProjectileID.cs:185/187/189 全量 1:1；键=projId，缺省=表默认） */
export const YOYO_RANGE: Record<number, number> = { // 最大射程 px（默认 200）
  541: 130, 548: 170, 542: 195, 543: 207, 544: 215, 534: 220, 564: 225, 999: 225,
  545: 235, 562: 320, 563: 250, 546: 275, 552: 270, 553: 330, 547: 280, 549: 290,
  554: 380, 550: 370, 551: 370, 555: 360, 603: 400, // 1457: 562 FormatC 235→320 / 554 Kraken 340→380（ProjectileID.cs:281）
};
export const YOYO_TOP: Record<number, number> = {  // 顶速（默认 10）
  541: 9, 548: 11, 542: 12.5, 543: 12, 544: 13, 534: 13, 564: 14, 999: 14,
  545: 14, 562: 17, 563: 16, 546: 15, 552: 14, 553: 15, 547: 17, 549: 16,
  554: 22, 550: 16, 551: 16, 555: 16.5, 603: 17.5, // 1457: 563 Gradient 12→16 / 554 Kraken 16→22（ProjectileID.cs:283）
};
export const YOYO_LIFE: Record<number, number> = {  // 寿命倍率（默认 -1=无限）
  541: 3, 548: 5, 542: 7, 543: 6, 544: 8, 534: 9, 564: 11, 999: 11,
  545: 13, 563: 30, 562: 16, 553: 12, 546: 16, 552: 15, 549: 14,
};

export class YoyoProj extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 持续按住判定（原版 channel：按住时悠悠球滞留追光标） */
  private channel: () => boolean;
  /** 光标世界坐标 getter */
  private target: () => { x: number; y: number };
  /** ★废弃死参数（Game 侧传 0）:射程唯一源 = Sets.YoyosMaximumRange 表
   *  （ProjectileID.cs:187,21 型号缺省 200）+ yoyoString×1.25+30（:64968-64970）+
   *  ÷(1+meleeSpeed×3)/4（:64974）——旧"220+spd×10"自造公式已废,勿再启用 */
  private stringLen: number;
  private hitCd = new HitCooldown();
  private rot = 0;
  /** 手部坐标（线起点，fixedUpdate 每帧刷新为主角中心） */
  handX = 0;
  handY = 0;
  /** 线饰品线色快照（Player.stringColor，fixedUpdate 每帧从 equipStats 刷新；
   *  绘制侧消费——线段链染色/29 号闪烁免取光，Main.cs:27901） */
  stringColor = 0;
  /** localAI[0] 累积寿命（秒，÷(1+meleeSpeed)/2 折算；超 YOYO_LIFE → 回收态） */
  private lifeT = 0;
  /** ai[0] 状态机（AI_099_2_Yoyos 全量）：
   *  >=0 = 目标 X 缓存（活跃追标，ai[1]=目标 Y）；
   *  -1  = 回收（松手/石化冰冻/超寿命/1.3×超程 → 飞回玩家 <top+10 消亡）；
   *  -2  = 脱离坠落（魔法线克隆专属出生态：重力 0.3、penetrate=Next(3,7)、撞墙即亡、
   *        免画线 Main.cs:27799；:65118-65151）；
   *  -3  = 魔法线幽灵（-1+magicString → 隐身零伤飞回，:65110-65120）。 */
  ai0 = 0;
  /** ai[1] 目标 Y 缓存（回收转移时清 0，:65005） */
  private ai1 = 0;
  /** 旧"回收锁"语义兼容读口（= ai0 ∈ {-1,-3}） */
  get recalled(): boolean { return this.ai0 === -1 || this.ai0 === -3; }
  /** projectile.direction（AI_099 ChangeDir 段 :64925-64935：球在玩家右侧 >2px → 1、
   *  左侧 → -1,±2 死区内保持原值；flag/脱离态不更新——:64907-64934 门）——
   *  击退方向以此为准（曾误用 sign(vx)） */
  private dir = 1;
  /** -2 脱离态穿透计数（penetrate 懒置 Next(3,7)=3-6，:65122-65125；-1=未置） */
  private pierceLeft = -1;
  /** -3 幽灵隐身（alpha=255，:65117-65119）——绘制侧消费 */
  ghost = false;
  /** 存活 tick 上限:有限寿命型号 7200 防泄漏;无限寿命（YOYO_LIFE 缺省 -1）无上限——
   *  原版 timeLeft=6 每帧刷新（:64942）,无限寿命悠悠球可永久滞留直至松手回收。
   *  脱离态（-2）寿命无限（:64850-64852 num2=-1）——撞墙/穿透尽才亡 */
  life = 7200;
  /** 型号顶速（YOYO_TOP 注入，缺省 10——ProjectileID.cs:189） */
  topSpeed = 10;
  dead = false;
  /** 同型前球在场（AI_099_2 flag :64827-64835：手套二号球寿命加速烧 rand(10,31)×0.1、
   *  死区 +20（:64976-64978）、免持械转向（:64907-64934）——Game 注入闭包扫描） */
  secondInPlay?: () => boolean;
  /** 寿命尽全量回收广播（:64852-64866：该玩家所有 aiStyle99 且 ai0>=0 → -1——含
   *  配重球；Game 注入闭包扫描） */
  recallFamily?: () => void;
  /** 魔法线克隆回调（:65110-65116：-1+magicString → 掷 75% 伤/击退的 -2 脱离克隆） */
  spawnClone?: (x: number, y: number, vx: number, vy: number, dmg: number, kb: number) => void;
  /** 悠悠球命中链回调（Projectile.cs:12482 Player.Counterweight；-2 免调） */
  counterweight?: (hitX: number, hitY: number, dmg: number, kb: number) => void;
  /** 1457 EverySomeYoyoHits per-hit 族伴生弹生成回调（:13761-13870 NewProjectile——
   *  entities.add 不在 GameHooks,Game 侧 wireYoyoCallbacks 注入） */
  spawnShot?: (spec: YoyoShotSpec) => void;
  /** 出生物品内部 id（Game 注入——channel 闭包的手持核对/族成员遗传：手套二号球、
   *  魔法线克隆、配重球 ctx 共用同物品 channel 判定） */
  itemId?: number;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    stringLen: number, channel: () => boolean, target: () => { x: number; y: number },
    /** 出生初速（=16×attackSpeedMult = 16/meleeSpeed,Game 侧初掷传入;缺省 0 =
     *  魔法线克隆/手套二号球等自带速度的生成点不注入——原版走各自 NewProjectile
     *  显式速度 :65110-65116/:11977-11992） */
    initSpeed = 0) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.stringLen = stringLen;
    this.channel = channel;
    this.target = target;
    // 出生初速（ItemCheck_Shoot :46430-46434 melee 弹速 = shootSpeed/meleeSpeed——
    // 悠悠球 shootSpeed=16 且不在 NoMeleeSpeedVelocityScaling 排除表;:46642-46680
    // num4/5 = (光标−手心)归一×speed → 16/meleeSpeed 朝光标。此前零速起步,
    // 首帧全靠 AI 逼近段加速=出速迟钝）
    if (initSpeed > 0) {
      const t0 = target();
      const ddx = t0.x - (x + this.w / 2), ddy = t0.y - (y + this.h / 2);
      const dl = Math.hypot(ddx, ddy);
      if (dl > 0) { this.vx = (ddx / dl) * initSpeed; this.vy = (ddy / dl) * initSpeed; }
      else { this.vx = initSpeed; this.vy = 0; }   // num4==0&&num5==0 → (direction,0) 档
    }
    // 无限寿命型号（Sets.YoyosLifeTimeMultiplier 缺省 -1,ProjectileID.cs:185）不上限
    if ((YOYO_LIFE[projId] ?? -1) === -1) this.life = Number.POSITIVE_INFINITY;
  }

  draw(r: Renderer, cam: Camera): void {
    // 线（Main.cs:27799-27908 DrawProjDirect aiStyle99 段 1:1）：手部→球体 12px 段链，
    // FishingLine.png 竖条逐段旋贴、摆垂、线饰品染色（StringLine 共享模块——曾灰直线近似）。
    // ★ai[0] != -2 免画线门（Main.cs:27799——脱离态无线；-3 幽灵仍画线）
    if (this.ai0 !== -2) {
      const c = r.ctx;
      const tex = r.atlas?.ensureVImage?.('vanilla/FishingLine.png');
      if (c && tex) {
        drawYoyoStringLine(c, tex, this.handX, this.handY, this,
          this.stringColor, stringColorOpts(r.lighting?.clock));
      }
    }
    // :65180-65186 rotation：-2 档 += 0.45×direction（漂移向），其余 +0.45
    // 1457 :69152-69160:定向自转门 ai[0]==-2 并入 554 Kraken（0.45×direction 同款）
    this.rot += (this.ai0 === -2 || this.projId === 554) ? 0.45 * this.dir : 0.45;
    // -3 幽灵 alpha=255 全透明（:65117-65119）
    drawProj(r, cam, this, this.projId, this.rot, '#E04040', this.ghost ? 0 : 1);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    const eq = p.equipStats;
    // 线起点（Main.cs:27794-27803）：mountedCenter → mount52 修正 → +gfxOffY →
    // ApplyItemPositionOffsetFromMount（Player.yoyoStringAnchor 全链；target =
    // 光标世界坐标（mount54 行档 aim），channel = itemAnimation>0 代理——原版
    // 悠悠球 channel 期 itemAnimation 持续刷新恒>0）
    {
      const h = p.yoyoStringAnchor(this.target(), this.channel());
      this.handX = h.x;
      this.handY = h.y;
    }
    this.stringColor = eq.stringColor;
    // flag：同型前球在场（:64827-64835——手套二号球标记）
    const flag = !!this.secondInPlay?.();
    // ChangeDir 段（:64907-64934）：!flag && ai0 != -2 才持械转向（±2px 死区保原值）
    if (!flag && this.ai0 !== -2) {
      if (this.cx > p.cx + 2) this.dir = 1;
      else if (this.cx < p.cx - 2) this.dir = -1;
    }
    this.hitCd.tick();
    // ---- AI_099_2_Yoyos 参数链（:64945-64977）----
    // ★原版 meleeSpeed 基 1（Player.cs:2328 =1f,装备加法 +0.12 档）——本仓
    //   attackSpeedMult = 1/meleeSpeed(CapAttackSpeeds :28566-28573),取倒数还原;
    //   曾直接拿 attackSpeedMult 当 meleeSpeed 用,加成方向反（越快射程越长）
    const vms = 1 / (p.attackSpeedMult || 1);
    const msRange = (1 + vms * 3) / 4;          // 射程/顶速缩放(:64974-64975)
    let range = YOYO_RANGE[this.projId] ?? 200;
    if (eq.yoyoString) range = range * 1.25 + 30;  // 线圈 yoyoString(:64971)
    range /= msRange;
    let top = (YOYO_TOP[this.projId] ?? 10) / msRange;
    let inertia = Math.max(1, 14 - top / 2);   // num7(:64968-64971)
    const deadZone = 5 + top / 2 + (flag ? 20 : 0);  // num9 光标死区半径(:64972 + flag:64976-64978)
    // 寿命（:64827-64854）：localAI[0] += 1（flag 另加 rand(10,31)×0.1）→ 秒数
    // ÷(1+meleeSpeed)/2,超 YoyosLifeTimeMultiplier → 回收（并广播全量回收）
    this.lifeT += (1 + (flag ? (10 + Math.floor(Math.random() * 21)) * 0.1 : 0)) / 60 / ((1 + vms) / 2);
    let lifeMul = YOYO_LIFE[this.projId] ?? -1;
    if (eq.yoyoString && lifeMul > 0) lifeMul *= 1.5;
    if (this.ai0 <= -2) lifeMul = -1;   // 脱离/幽灵态寿命无限（:64850-64852）
    if (lifeMul !== -1 && this.lifeT > lifeMul) {
      this.recallFamily?.();   // :64853-64865 该玩家所有 aiStyle99 ai0>=0 → -1（含配重球）
      this.ai0 = -1;
    }
    // ---- 活跃态（ai0 >= 0,:64983-65148）----
    if (this.ai0 >= 0) {
      if (Math.hypot(this.vx, this.vy) > top) { this.vx *= 0.98; this.vy *= 0.98; }
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      const dPlayer = Math.hypot(p.cx - cx, p.cy - cy);
      const overRange = dPlayer > range;          // flag3:超程减速
      const wayOut = dPlayer > range * 1.3;       // flag4:1.3×超程强制回收
      // channel 门（:65001-65035）：松手/石化/冰冻 → ai0=-1, ai1=0
      const pb = (p as unknown as { buffs?: { has: (b: number) => boolean } }).buffs;
      if (!this.channel() || pb?.has(BuffType.Stoned) || pb?.has(BuffType.Frozen)) {
        this.ai0 = -1;
        this.ai1 = 0;
      } else {
        // 光标目标钳在射程内（:65010-65034）
        const t = this.target();
        let tx = t.x, ty = t.y;
        let tdx = tx - p.cx, tdy = ty - p.cy;
        const td = Math.hypot(tdx, tdy);
        if (td > range) { tdx = (tdx / td) * range; tdy = (tdy / td) * range; tx = p.cx + tdx; ty = p.cy + tdy; }
        // :65038-65050:目标点变化时（ai[0]/ai[1] 存量比对）再钳 range-1——防球贴射程边缘抖动
        if (this.ai0 !== tx || this.ai1 !== ty) {
          let vx2 = tx - p.cx, vy2 = ty - p.cy;
          const vd = Math.hypot(vx2, vy2);
          if (vd > range - 1) { vx2 = (vx2 / vd) * (range - 1); vy2 = (vy2 / vd) * (range - 1); tx = p.cx + vx2; ty = p.cy + vy2; }
          this.ai0 = tx; this.ai1 = ty;
        }
      }
      if (wayOut) this.ai0 = -1;   // flag4（:65059-65063）
      if (this.ai0 >= 0) {
        // 逼近段（:65066-65148）——用 ai0/ai1 存量目标（非实时光标）
        if (overRange) {
          inertia /= 2; top *= 2;
          if (cx > p.cx && this.vx > 0) this.vx *= 0.5;
          if (cy > p.cy && this.vy > 0) this.vy *= 0.5;
          if (cx < p.cx && this.vx < 0) this.vx *= 0.5;
          if (cy < p.cy && this.vy < 0) this.vy *= 0.5;
        }
        if (overRange) inertia = 1;   // flag3 时 num7=1（:65066-65067——velocity 直接取目标向）
        const dx2 = this.ai0 - this.cx, dy2 = this.ai1 - this.cy;
        const d2 = Math.hypot(dx2, dy2);
        if (d2 > deadZone) {
          // lerp 逼近（:65071-65083）：velocity=(v×(num7-1)+dir×min(d/2,top))/num7
          const step = overRange ? Math.min(d2 / 2, top / 2) : Math.min(d2 / 2, top);
          this.vx = (this.vx * (inertia - 1) + (dx2 / d2) * step) / inertia;
          this.vy = (this.vy * (inertia - 1) + (dy2 / d2) * step) / inertia;
        } else if (flag) {
          // 同型前球在场（:65108-65127）：死区内维持 num8×0.6 巡航速（lerp 惯性）
          const sp = Math.hypot(this.vx, this.vy);
          if (sp < top * 0.6) {
            const nvx = sp > 0 ? this.vx / sp * top * 0.6 : 0;
            const nvy = sp > 0 ? this.vy / sp * top * 0.6 : 0;
            this.vx = (this.vx * (inertia - 1) + nvx) / inertia;
            this.vy = (this.vy * (inertia - 1) + nvy) / inertia;
          }
        } else {
          this.vx *= 0.8; this.vy *= 0.8;  // 死区内衰减(:65144)
        }
        if (flag && !overRange && Math.hypot(this.vx, this.vy) < top * 0.6) {
          // :65129-65137 尾段：直接归一到 num8×0.6（零速保持零——SafeNormalize(Zero)）
          const sp = Math.hypot(this.vx, this.vy);
          if (sp > 0) { this.vx = this.vx / sp * top * 0.6; this.vy = this.vy / sp * top * 0.6; }
        }
      }
    }
    // ---- 魔法线（:65110-65116）：-1 回收态 + magicString → -3 幽灵 + 掷 75% 伤/击退
    //      脱离克隆（本球速度/中心,ai0=-2 出生;伤害 (int) 截断）----
    if (this.ai0 === -1 && eq.magicString) {
      this.ai0 = -3;
      this.spawnClone?.(this.cx, this.cy, this.vx, this.vy,
        Math.trunc(this.damage * 0.75), Math.trunc(this.knockback * 0.75));
    }
    if (this.ai0 === -3) { this.ghost = true; this.damage = 0; }   // :65117-65119
    // ---- 状态尾段（:65118-65177）----
    if (this.ai0 === -2) {
      // 脱离坠落（:65118-65151）：penetrate 懒置 Next(3,7)、重力 0.3、速度上限 16、
      // vy≤3 缓落水平漂移 ±0.1（num8 钳 16）
      if (this.pierceLeft < 0) this.pierceLeft = 3 + Math.floor(Math.random() * 4);
      this.vy += 0.3;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 16) { this.vx = this.vx / sp * 16; this.vy = this.vy / sp * 16; }
      else if (this.vy <= 3) {
        const cap = Math.min(top, 16);
        if (Math.abs(this.vx) < 0.1) {
          if (this.cx < p.cx) { this.vx -= 0.1; this.dir = -1; }
          else { this.vx += 0.1; this.dir = 1; }
        } else if (this.vx > 0 && this.vx < cap) this.vx += 0.1;
        else if (this.vx < 0 && this.vx > -cap) this.vx -= 0.1;
      }
    } else if (this.ai0 < 0) {
      // 回收态（ai0=-1/-3;1457 :69131-69150）：惯性 ×0.8 浮点（1456 为
      // (int)(n*0.8) 整截断,回收力度曲线阶梯化——浮点后连续衰减）、顶速 ×1.5、穿墙,
      // lerp 朝玩家;距手 <num8+10 或 >2000 → Kill
      inertia *= 0.8;
      top *= 1.5;
      const dx = p.cx - this.cx;
      const dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < top + 10 || d === 0 || d > 2000) { this.dead = true; return; }
      this.vx = (this.vx * (inertia - 1) + (dx / d) * top) / inertia;
      this.vy = (this.vy * (inertia - 1) + (dy / d) * top) / inertia;
      this.x += this.vx;
      this.y += this.vy;
      hitEnemies(this, game, this.hitCd, 10, this.dir, this.armorPen,
        (e) => this.onYoyoHit(e, game), undefined, true);
      return;
    }
    // ---- 活跃/脱离态移动+碰撞（原版 yoyo tileCollide=true 撞墙滑动;
    //      回收态上方已穿墙直积分返回）----
    const lvy = this.vy;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.ai0 === -2) {
      // 脱离态撞块（:16988-17006）：竖撞 lastVy>4 → 弹起 ×-0.6;横撞 → HitTiles 尘 +
      // SoundID 0 + Kill
      if ((this.onGround || this.hitHead) && lvy > 4) this.vy = -lvy * 0.6;
      if (this.hitWall) {
        game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });   // HitTiles 尘
        game.playSfx('dig', 1, this.cx, this.cy);   // SoundID 0
        this.dead = true;
        return;
      }
    }
    // 命中免疫 = 玩家级共享 10t（DefaultToYoyo 无 usesLocalNPCImmunity/
    // localNPCHitCooldown,Projectile.cs:10155-10161 → Damage_PVE 走 npc.immune[owner]
    // 全局档 :11905/:13152——同玩家所有悠悠球/配重球共享,不再逐弹私账）
    hitEnemies(this, game, this.hitCd, 10, this.dir, this.armorPen,
      (e) => this.onYoyoHit(e, game),
      (_e) => {
        // 活跃态对玩家无视线 → 该击伤害 ×0.75（:12503-12505 num12）
        if (this.ai0 >= 0
          && !canHit(game.world.store, this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) return 0.75;
        // 1457 per-hit 族伤害乘区（countUp:false 只读不加,:13424-13436）：
        // 555 Yelets 每 7 击 ×2、546 Artery 每 3 击 ×2——里程碑判定与 onYoyoHit
        // 的生成掷（countUp:true 自增）同 tick 先后求值,共享计数器读数一致
        if (this.projId === 555 && p.yoyoHitCounter % 7 === 0) return 2;
        if (this.projId === 546 && p.yoyoHitCounter % 3 === 0) return 2;
        return 1;
      }, true);
  }

  /** 命中链（Projectile.cs:12467-12508 aiStyle 99 段）:-2 只被弹开（不触发
   *  Counterweight）;其余调 Counterweight + 方向定号;ai0>=0 活跃反弹 +
   *  localAI[0] += 20（无视线 +40,寿命快捷烧） */
  private onYoyoHit(e: unknown, game: GameHooks) {
    const p = game.player;
    const ecx = (e as { x: number; w: number }).x + (e as { x: number; w: number }).w / 2;
    const ecy = (e as { y: number; h: number }).y + (e as { y: number; h: number }).h / 2;
    if (this.ai0 === -2) {
      // 脱离态被弹开（:12469-12477）：速度 ÷5 + 上抛 Next(50,81)×0.1 钳 -16;
      // 穿透自减（penetrate 3-6 尽 → Kill）——★不 return：原版 Damage() 内弹开段
      // (:12469)与 per-hit 族段(:13761+)同函数先后执行,554/546/555 无 ai[0]!=-2 门
      this.vx /= 5; this.vy /= 5;
      this.vy -= (50 + Math.floor(Math.random() * 31)) * 0.1;
      if (this.vy < -16) this.vy = -16;
      if (--this.pierceLeft <= 0) this.dead = true;
    } else {
      this.counterweight?.(ecx, ecy, this.damage, this.knockback);   // :12482
      this.dir = ecx < p.cx ? -1 : 1;   // :12484-12489
      if (this.ai0 >= 0) {
        // 活跃态命中反弹（:12490-12500）：v×-0.5 + 离敌向 ×16
        let bx = this.cx - ecx, by = this.cy - ecy;
        const bd = Math.hypot(bx, by) || 1;
        this.vx = this.vx * -0.5 + (bx / bd) * 16;
        this.vy = this.vy * -0.5 + (by / bd) * 16;
        // 寿命快捷烧（:12501-12505）：localAI[0] += 20;对玩家无视线再 +40
        const noLos = !canHit(game.world.store, this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h);
        const vms = 1 / (p.attackSpeedMult || 1);
        this.lifeT += (noLos ? 60 : 20) / 60 / ((1 + vms) / 2);
      }
    }
    // ---- 1457 EverySomeYoyoHits per-hit 族（Projectile.cs:13761-13870,批 D 落地）----
    // 545 Cascade 每 2 击 → 1125 CascadeExplosion ×200%（208px 最近敌向,scale=
    //   max(0.22+0.22r, dist/200) 钳 1.5,触发敌 localImmunity -1;ai[0]!=-2 门）
    // 554 Kraken 每 4 击 → 3× 1135 KrakenWave ×50%（触发向 ±0.2π 扇,速 18+8r,
    //   IDStatic 免疫 10t 三波共享）
    // 546 Artery 每 3 击 → 5× 1134 CrystalShardMelee ×100%（矩形随机速 ±4,
    //   IDStatic 免疫 20t 共享,首颗 ai[0]=0 其余 1）
    // 555 Yelets 每 7 击 → 1130 TheEyeOfCthulhuDash ×200%（80px 最近敌向 ×14,
    //   触发敌 localImmunity -1）
    // 计数器 = Player.yoyoHitCounter（:1203 初始 -1 → 首击 -1%N≠0 不触发,原版同款）;
    // 546/555 的伤害 ×2 乘区（:13428/:13434 countUp:false 只读）在本 tick dmgScale 侧
    if (this.spawnShot) {
      const victimId = (e as { id: number }).id;
      // 最近敌搜索（:13765-13781 同构：CanBeChasedBy 口径 + LOS/noTileCollide + 排除触发敌;
      // 距离 = Hitbox.ClosestPointInRect(Center)）
      const closest = (b: { x: number; y: number; w: number; h: number }): [number, number, number] => {
        const px = Math.max(b.x, Math.min(this.cx, b.x + b.w));
        const py = Math.max(b.y, Math.min(this.cy, b.y + b.h));
        return [px, py, Math.hypot(px - this.cx, py - this.cy)];
      };
      const findNearest = (maxD: number): { x: number; y: number; w: number; h: number; d: number } | null => {
        let best: { x: number; y: number; w: number; h: number; d: number } | null = null;
        for (const q of game.enemies()) {
          const n = q as { x: number; y: number; w: number; h: number; id: number; dead: boolean;
            maxHp: number; def?: { friendly?: boolean; critter?: boolean; noTileCollide?: boolean } };
          if (n.dead || n.id === victimId || n.maxHp <= 5 || n.def?.friendly || n.def?.critter) continue;
          if (!n.def?.noTileCollide
            && !canHit(game.world.store, this.x, this.y, this.w, this.h, n.x, n.y, n.w, n.h)) continue;
          const [, , d] = closest(n);
          if (d < maxD) { maxD = d; best = { ...n, d }; }
        }
        return best;
      };
      const jit = () => (Math.random() * 2 - 1) * Math.PI * 2 * 0.025;   // NextFloatDirection×2π×0.025
      if (this.projId === 545 && this.ai0 !== -2 && p.everySomeYoyoHits(2, true)) {
        const t = findNearest(208);
        let ang = Math.PI * 2 * Math.random();
        let dist = 0;
        if (t) { const [px, py, d] = closest(t); ang = Math.atan2(py - this.cy, px - this.cx); dist = d; }
        let scale = 0.22 + 0.22 * Math.random();       // :13787 num46
        if (scale < dist / 200) scale = dist / 200;    // :13789-13791
        if (scale > 1.5) scale = 1.5;
        const a = ang + jit();
        this.spawnShot({ x: this.cx, y: this.cy, vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 1.1,
          projId: 1125, dmg: this.damage * 2, kb: this.knockback, scale, excludeId: victimId });
      } else if (this.projId === 554 && p.everySomeYoyoHits(4, true)) {
        const base = Math.atan2(ecy - this.cy, ecx - this.cx);   // :13805 spinningpoint2
        const waveCd = new HitCooldown();                        // IDStatic 10（:10667）三波共享
        for (const l of [-2, 0, 2]) {
          const a = base + l * Math.PI * 2 * 0.05 + jit();
          const spd = 18 + 8 * Math.random();                    // :13808（×(1-0×|l|)=1）
          this.spawnShot({ x: this.cx, y: this.cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            projId: 1135, dmg: this.damage * 0.5, kb: this.knockback, sharedCd: waveCd });
        }
      } else if (this.projId === 546 && p.everySomeYoyoHits(3, true)) {
        const shardCd = new HitCooldown();                       // IDStatic 20（:10653）五片共享
        for (let m = 0; m < 5; m++) {
          const vx0 = Math.random() * 8 - 4;                     // NextVector2Circular(8,8) 矩形均匀
          const vy0 = Math.random() * 8 - 4;
          const ja = jit();                                      // .RotatedBy(NextFloatDirection×2π×0.025)
          this.spawnShot({ x: this.cx, y: this.cy,
            vx: vx0 * Math.cos(ja) - vy0 * Math.sin(ja), vy: vx0 * Math.sin(ja) + vy0 * Math.cos(ja),
            projId: 1134, dmg: this.damage, kb: this.knockback, sharedCd: shardCd });
        }
      } else if (this.projId === 555 && p.everySomeYoyoHits(7, true)) {
        const t = findNearest(80);
        let ang = Math.PI * 2 * Math.random();
        if (t) { const [px, py] = closest(t); ang = Math.atan2(py - this.cy, px - this.cx); }
        const a = ang + jit();
        this.spawnShot({ x: this.cx, y: this.cy, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14,
          projId: 1130, dmg: this.damage * 2, kb: this.knockback, excludeId: victimId });
      }
    }
  }
}

// ================= 悠悠球 per-hit 族伴生弹（1457 EverySomeYoyoHits 家族） =================

/** YoyoShotProj——1457 新弹 1125/1130/1134/1135（Projectile.cs:10530-10670 SetDefaults +
 *  AI_189 1125 支 :43034+ / AI_210 :37480-37570）。共同:SetDefaults tileCollide=false、
 *  friendly/melee、无重力。逐型：
 *   1125 CascadeExplosion（aiStyle 189）:32×32、alpha 255、hide=true（原版不画本体,
 *    视觉=AI_189 首帧尘/软木爆炸）、5 帧 ×2t=10t 存活、scale=ai[1]、
 *    usesLocalNPCImmunity+cooldown -1（每弹每敌一次;出生时对触发敌 localNPCImmunity=-1）
 *   1130 TheEyeOfCthulhuDash（aiStyle 210）:100×100、penetrate -1、AI 20t 存活
 *    （velocity ×0.92/t、MultiLerp 淡入淡出、frame 3-5 @6t）、local 免疫 -1
 *   1134 CrystalShardMelee（aiStyle 24）:6×6、penetrate 1、light 0.5、alpha 50、
 *    scale 1.2、timeLeft 600、usesIDStaticNPCImmunity+cooldown 20（同型共享 20t 静态免疫）
 *   1135 KrakenWave（aiStyle 210）:100×100、penetrate -1、AI 同 1130（无帧动画,
 *    rotation=速度向;首 6-7t 尘尾）、IDStatic 免疫 10（三波共享） */
export interface YoyoShotSpec {
  x: number; y: number;          // 出生中心（NewProjectile 居中语义,构造内换算盒左上）
  vx: number; vy: number;
  projId: number;
  dmg: number; kb: number;
  scale?: number;                // 1125/1130 的 ai[1]（缩放）
  excludeId?: number;            // localNPCImmunity[victimIndex]=-1（触发敌免中本弹）
  sharedCd?: HitCooldown;        // IDStatic 免疫共享（1134/1135 同型各弹共用一张表）
}
export class YoyoShotProj extends Entity {
  damage: number;
  knockback: number;
  projId: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  dead = false;
  lightRGB: [number, number, number] | null = null;
  life = 10;
  private scale: number;
  private excludeId: number;
  private sharedCd: HitCooldown | null;
  private ownCd = new HitCooldown();     // local 免疫（1125/1130 每弹一张）
  private age = 0;                       // localAI[0]（AI_210 20t 寿命 / 1125 帧计数）
  private frame = 0;
  private frameCounter = 0;

  constructor(spec: YoyoShotSpec) {
    super();
    const pd = projectileData(spec.projId);
    this.w = pd?.width ?? 16; this.h = pd?.height ?? 16;
    this.x = spec.x - this.w / 2; this.y = spec.y - this.h / 2;   // NewProjectile 居中(:10238)
    this.vx = spec.vx; this.vy = spec.vy;
    this.projId = spec.projId;
    this.damage = Math.max(1, Math.trunc(spec.dmg));
    this.knockback = spec.kb;
    this.scale = spec.scale ?? 1;
    this.excludeId = spec.excludeId ?? -1;
    this.sharedCd = spec.sharedCd ?? null;
    if (spec.projId === 1125) {
      // AI_189 :43037 soundDelay==0 首帧 SoundID.DD2_ExplosiveTrapExplode（本仓
      // sfx 表无 DD2 键 → 兜 'explosion' 近似,登记）
      this.life = 10;                      // 5 帧 ×2t（:43056-43063 frame>=5 → Kill）
    } else if (spec.projId === 1130 || spec.projId === 1135) {
      this.life = 20;                      // AI_210 :37516/:37540 localAI[0]>=20 → Kill
    } else {
      this.life = pd?.timeLeft ?? 600;     // 1134 timeLeft 600（:10650）
    }
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.age++;
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.projId === 1125) {
      // AI_189 1125 支：首帧尘/软木爆（:43070-43100,20 尘 6 号 + 烟 31 + gore 61-63——
      // gore 池本仓无 API,登记）;scale=ai[1]（视觉缩放,本体不绘制）
      if (this.age === 1) {
        game.spawnParticles(this.cx, this.cy, '#F0A040', 14, 3 * this.scale, { life: 22, grav: 0.06, damp: 0.95 });
        game.spawnParticles(this.cx, this.cy, '#807868', 8, 2 * this.scale, { life: 30, grav: -0.01, damp: 0.96 });
      }
    } else if (this.projId === 1130 || this.projId === 1135) {
      // AI_210（:37481-37570）：velocity ×0.92/t;1130 rotation=速度向−π/2、
      // frame 3-5 @6t;1135 rotation=速度向 + 首 20/3 t 每帧 8 尘（33 号,1/3 换 302）
      this.vx *= 0.92; this.vy *= 0.92;
      if (this.projId === 1130) {
        this.frameCounter++;
        if (this.frameCounter >= 6) { this.frameCounter = 0; this.frame++; }
        if (this.frame < 3) this.frame = 3;
      } else if (this.age <= 6) {
        game.spawnParticles(this.cx, this.cy, '#C0C8E0', 3, 1.4, { life: 14, grav: 0, damp: 0.92 });
      }
    }
    // ---- 命中（Damage 通用管线：盒相交 → hurt;免疫表按型）----
    const cd = this.sharedCd ?? this.ownCd;
    cd.tick();
    this.ownCd.tick();
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean };
      if (e.dead) continue;
      if (e.id === this.excludeId) continue;                 // localNPCImmunity[victim]=-1
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const effCd = this.sharedCd ? cd : this.ownCd;         // IDStatic 型走共享表
      if (!effCd.ready(e.id, this.sharedCd ? (this.projId === 1134 ? 20 : 10) : 9999)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      const kdir = Math.sign((e.x + e.w / 2) - this.cx) || 1;
      e.hurt(dmg, kdir * this.knockback, 0, game, this.armorPen, crit);   // 音/飘值=单点
      if (this.projId === 1134) break;                       // penetrate 1（:10643）
    }
  }

  draw(r: Renderer, cam: Camera): void {
    // 1125 hide=true（:10540）原版本体不绘制（视觉=尘爆）——跳过
    if (this.projId === 1125) return;
    const rot = this.projId === 1130
      ? Math.atan2(this.vy, this.vx) - Math.PI / 2           // :37484 rotation=vel−π/2
      : Math.atan2(this.vy, this.vx);                        // 1135/1134 =vel（:37536）
    if (this.projId === 1130) {
      // 6 帧竖条（projFrames[1130]=6,Main.cs:8866）——drawProj 无帧参,手绘
      const ctx = r.ctx;
      const img = projSprite(1130);
      if (!ctx || !img || !(img.width > 0)) return;
      const fh = img.height / 6;
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.rotate(rot);
      ctx.globalAlpha = 1 - this.age / 20;
      ctx.drawImage(img, 0, Math.round(this.frame * fh), img.width, Math.round(fh),
        -img.width / 2, -fh / 2, img.width, fh);
      ctx.restore();
      return;
    }
    drawProj(r, cam, this, this.projId, rot, this.projId === 1134 ? '#E0C0FF' : '#8090E0',
      this.projId === 1134 ? 0.8 : Math.max(0, 1 - this.age / 20));
  }
}

// ================= 连枷/链球（aiStyle 15，AI_015_Flails，Projectile.cs:41051-41506） =================

/** 每型号参数（Projectile.cs:41073-41087 默认值 + :41088-41148 switch 各 case；单位 px/tick/tick）。
 *  meleeSpeed 缩放链（:41151-41159）：throwSpd/farPull/pullAccel/retractKill/returnAccel/
 *  returnKill ×(1/meleeSpeed)——orbitRadius(num15)不缩放 */
interface FlailParams {
  flightTicks: number;  // num:掷出态飞行上限 tick（超时 → 回拉）
  throwSpeed: number;   // num2:松手掷出初速
  pullAccel: number;    // num4:回拉态 MoveTowards 步长
  retractKill: number;  // num5:回拉态距手 ≤ 此值即消失
  returnAccel: number;  // num6:回收态 MoveTowards 步长
  returnKill: number;   // num7:回收态距手 ≤ 此值即消失
  farPullSpeed: number; // num9:远端回拉目标速率
  orbitRadius: number;  // num15:旋转态绕体半径
  spinHitCd: number;    // num12:旋转态每敌命中冷却
  thrownHitCd: number;  // num13:掷出/回拉/坠落态冷却
}
const FLAIL_DEFAULT: FlailParams = {
  flightTicks: 10, throwSpeed: 24, pullAccel: 3, retractKill: 16,
  returnAccel: 6, returnKill: 48, farPullSpeed: 14, orbitRadius: 30,
  spinHitCd: 15, thrownHitCd: 10,
};
const FLAIL_PARAMS: Record<number, Partial<FlailParams>> = {
  25:  { flightTicks: 15, throwSpeed: 14, retractKill: 10, returnKill: 15 },
  26:  { flightTicks: 15, throwSpeed: 16, retractKill: 13, returnKill: 17, orbitRadius: 32 },
  35:  { flightTicks: 15, throwSpeed: 17, retractKill: 14, returnKill: 18, orbitRadius: 37 },
  63:  { flightTicks: 13, throwSpeed: 21, retractKill: 20, returnKill: 24, spinHitCd: 12 },
  154: { flightTicks: 15, throwSpeed: 15, retractKill: 11, returnKill: 16 },
  247: { flightTicks: 13, throwSpeed: 23, spinHitCd: 12, orbitRadius: 40 },
  757: { flightTicks: 13, throwSpeed: 22, retractKill: 22, returnKill: 26, spinHitCd: 12, orbitRadius: 35 },
  947: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  948: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  1058: { flightTicks: 16, throwSpeed: 23, spinHitCd: 10, orbitRadius: 45 },
};

/** 链贴图（DrawProj_FlailChains 1457 Main.cs:35907-35938 switch;1456 :34757-34781）：型号 → Chain_N；
 *  948 三段混排（前 4 节 Chain43 全亮 → 2 节 Chain42 → 其余 Chain41）；
 *  757 = Extra_99 六帧竖条动画链。★1058 不走本表——独立支用 Chain37
 *  （M.cs:28831-28977,见 FlailProj.drawChain1058） */
function flailChainTex(projId: number): string {
  switch (projId) {
    case 25: return 'Chain2';
    case 35: return 'Chain6';
    case 63: return 'Chain7';
    case 154: return 'Chain13';
    case 247: return 'Chain19';
    case 947: case 948: return 'Chain41';
    case 757: return 'Extra_99';
    default: return 'Chain3';
  }
}
const chainImgCache = new Map<string, ImageBitmap | HTMLImageElement>();
function chainImg(name: string): ImageBitmap | HTMLImageElement | null {
  let img = chainImgCache.get(name);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.onload = () => upgradeToBitmap(img, (b) => chainImgCache.set(name, b));
  img.src = `sprites/vanilla/${name}.png`;
  chainImgCache.set(name, img);
  return img;
}

export class FlailProj extends Entity {
  /** 原版碰撞盒按型号(Projectile.SetDefaults):247/757=34 / 947/948=20 /
   *  1058=26 / 其余 22——写死 22 会让 5 个型号命中盒失真,2026-08-13 review */
  w: number;
  h: number;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（mouseHeld && 手持原物品 && !uiBlocking）——Game 注入 */
  private channel: () => boolean;
  /** 鼠标世界坐标 getter（松手掷出方向） */
  private target: () => { x: number; y: number };
  private prm: FlailParams;
  /** 子弹生成回调(Game 侧注入 entities.add——GameHooks 不暴露实体桶)。
   *  AI_015 特例:247 Flairon 飞行中自机弹 248 / 757 Drippler 掷出回收气泡 928 /
   *  1058 轨道刺 405 */
  spawnProj: ((x: number, y: number, vx: number, vy: number, projId: number, dmg: number, kb: number) => void) | null = null;
  /** 247/1058 周期计数(247=localAI[0] :41451 / 1058=localAI[2] :41424) */
  private subT = 0;
  /** 1058 出场淡入:原版 alpha 语义(255=隐形,SetDefaults :9719;每 tick -50 至 0,
   *  :41386-41394)——其余型号恒 0(不透明) */
  private alpha = 0;
  /** ai[0] 状态：0 旋转 / 1 掷出 / 2 回拉 / 5 坠落 / 6 垂地悬荡 / 4 回收 */
  private st = 0;
  /** ai[1] 状态内计数 */
  private stT = 0;
  /** localAI[1] 旋转态累计 tick */
  private spinT = 0;
  /** localAI[0] 弹墙累计（AI_015_HandleMovementCollision:41006） */
  private bounces = 0;
  /** spriteDirection（=direction,:41479-41483 每 tick=sign(vx),1058 豁免保持出生向;
   *  绘制侧 -1 水平翻转 M.cs:29827-29831） */
  private spriteDir = 1;
  /** SetDefaults scale（P.cs:10075-10076 命中盒缩放 + M.cs:32360 绘制缩放共用） */
  private texScale: number;
  private rotation = 0;
  private hitCd = new HitCooldown();
  /** 手部坐标（链条起点，每 tick 刷新） */
  handX = 0;
  handY = 0;
  life = 7200;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    channel: () => boolean, target: () => { x: number; y: number }) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.channel = channel;
    this.target = target;
    this.prm = { ...FLAIL_DEFAULT, ...FLAIL_PARAMS[projId] };
    const pd = projectileData(projId);
    // 命中盒 = (int)(SetDefaults 宽高 × scale)（Projectile.cs:10075-10076 SetDefaults
    // 尾段统一缩放,JSON 宽高为缩放前原值）——25=0.9→19、26/35/154=0.8→17;
    // 曾取裸型号宽 → 带 scale 的 4 型号命中盒偏大
    this.texScale = pd?.scale ?? 1;
    this.w = Math.trunc((pd?.width ?? 22) * this.texScale);
    this.h = Math.trunc((pd?.height ?? 22) * this.texScale);
    if (projId === 1058) this.alpha = 255; // SetDefaults :9719(出场淡入起点)
    // spriteDirection 初值 = 出手向（NewProjectile direction 语义;1058 无 per-tick
    // 更新 :41479 门——保持出生向,其余型号首 tick 起被 sign(vx) 覆写）
    this.spriteDir = this.target().x >= this.x + this.w / 2 ? 1 : -1;
  }

  /** ai[0] 状态只读视图(0 旋转/1 掷出/2 回拉/3 垂链/4 回收/5 坠落/6 垂地悬荡)——测试对账用 */
  get aiState(): number { return this.st; }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.ctx;
    if (ctx) this.drawChain(ctx, r);
    // alpha 原版语义(Main.cs:28965 color *= (255-alpha)/255——越大越透明)
    // 链球族（25/26/35/63/154/247/757）都在 :32360 中心锚组——球心=盒中心、
    // origin=贴图中心（曾走 num145 偏置锚：球体枢轴偏移+链连接点错位）
    // spriteDirection=-1 → 水平翻转（M.cs:29827-29831 FlipHorizontally;:41479-41483
    // 每 tick=sign(vx),1058 豁免保持出生向）;绘制 ×scale（M.cs:32360 Vector2.One×scale）
    drawProj(r, cam, this, this.projId, this.rotation, '#E04040',
      Math.max(0, (255 - this.alpha) / 255), 0, this.spriteDir === -1, true, this.texScale);
  }

  /** 链条（DrawProj_FlailChains 1457 Main.cs:35901-35990 1:1;1456 同段 :34752-34842）：
   *  球心 → 手臂方向逐节步长=链节高，每节按所在格光照着色；948 三段混排 /
   *  757 六帧动画链。★1058 Flairon 走独立支（1457 M.cs:29479-29640,非本通用表）
   *  ——见 drawChain1058 */
  private drawChain(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.projId === 1058) { this.drawChain1058(ctx, r); return; }
    const img = chainImg(flailChainTex(this.projId));
    if (!img || !(img.width > 0) || img.width === 0) {
      // 贴图未就绪兜底：细线（旧实现形态）
      ctx.strokeStyle = '#605848';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.handX, this.handY);
      ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      ctx.stroke();
      return;
    }
    // 光照采样（Lighting.GetColor 每节一次；拿不到则全亮。
    // ★lightAt 返回 0..255(Renderer 同源 /255 消费)——不除即恒满亮的静默 bug,2026-08-13 review)
    const lighting = (r as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
    const lightAt = (wx: number, wy: number): number => {
      if (!lighting) return 1;
      const [lr, lg, lb] = lighting.lightAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
      return Math.min(1, (lr * 0.3 + lg * 0.5 + lb * 0.2) / 255);
    };
    // 球心 → 臂方向。链向量起点 = armPosition.MoveTowards(center, 4f)（1457 M.cs:35941,
    // DrawProj_FlailChains :35901-35990;1456 同式 :34792）——臂位向球心先收 4px 再取
    // (起点−球心) 向量 → 链长 = 臂球距 − 4（MoveTowards 不越界:距 ≤4 落在球心=零向量,
    // SafeNormalize(Zero) 归零 → num4=链节高/2 恰画一节,本仓 d<1 门近似同态）。
    // 曾直接以手部坐标全距起步 → 链多出 4px 戳进手臂
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    let dx = this.handX - cx0, dy = this.handY - cy0;
    const dHand = Math.hypot(dx, dy);
    if (dHand < 1) return;
    dx /= dHand; dy /= dHand;
    const d = Math.max(0, dHand - 4);   // MoveTowards(center,4) 后的链向量长（:35941/:35946 num4=d+链节高/2）
    const frames = this.projId === 757 ? 6 : 1;
    const linkH = img.height / frames + (this.projId === 757 ? -2 : 0);
    const rotation = Math.atan2(dy, dx) + Math.PI / 2;
    let px = cx0, py = cy0;
    let i = 0;
    for (let remain = d + linkH / 2; remain > 0; remain -= linkH, i++) {
      let tex = img;
      let sy = 0, sh = img.height;
      if (this.projId === 757) { sy = (i % 6) * (img.height / 6); sh = img.height / 6; }
      else if (this.projId === 948) {
        // 三段：前 4 节 Chain43（全亮）→ 2 节 Chain42（最低亮度 140）→ 其余 Chain41
        if (i < 4) { tex = chainImg('Chain43') ?? img; }
        else if (i < 6) { tex = chainImg('Chain42') ?? img; }
      }
      if (!(tex.width > 0) || tex.width === 0) tex = img;
      const alpha = this.projId === 948 && i < 4 ? 1
        : this.projId === 948 && i < 6 ? Math.max(lightAt(px, py), 140 / 255)
          : lightAt(px, py);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.imageSmoothingEnabled = false;
      // 逐节取光即原版语义（:35950 color=Lighting.GetColor(节所在格)——黑暗中链全黑
      // 不可见;曾设 0.15 globalAlpha 下限=黑暗里链仍隐约可见,原版无此下限。
      // 948 中段 140/255 是原版【色阶】下限（:35963-35976 R/G/B≥140）非 alpha 下限）
      ctx.globalAlpha = alpha;
      ctx.drawImage(tex, 0, sy, tex.width, sh, -tex.width / 2, -sh / 2, tex.width, sh);
      ctx.restore();
      px += dx * linkH;
      py += dy * linkH;
    }
  }

  /** 1058 Flairon 链独立支（1457 Main.cs:29479-29640,与通用 DrawProj_FlailChains
   *  分流;1456 同段 :28831-28977）：贴图 Chain37（缺省 Chain3 是通用表兜底,1058 不在
   *  表内）;链节高=贴图整高;从球心向玩家步进【先步进后绘制】（首节在球心前方一节距,
   *  1457 :29607-29609）;while(dist ≥ 链节高+1) 终止（:29593-29596——通用表的 remain
   *  起步式会多画 2 节戳进玩家）;rotation 恒=atan2(球心→玩家)−π/2（:29582-29583,
   *  循环外一次定型）;逐节 Lighting.GetColor 着色（无 948 亮度下限/无 alpha 门,
   *  :29614-29616）。★本支起点=mountedCenter 直取（:29581 vector21=mountedCenter−center2,
   *  无通用支的 MoveTowards(−4)）→ handX/handY=玩家中心即对齐,勿套 ① 的 −4 */
  private drawChain1058(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const img = chainImg('Chain37');
    if (!img || !(img.width > 0) || img.width === 0) {
      // 贴图未就绪兜底：细线（通用支同款）
      ctx.strokeStyle = '#605848';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.handX, this.handY);
      ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      ctx.stroke();
      return;
    }
    const linkH = img.height;
    const lighting = (r as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
    const lightAt = (wx: number, wy: number): number => {
      if (!lighting) return 1;
      const [lr, lg, lb] = lighting.lightAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
      return Math.min(1, (lr * 0.3 + lg * 0.5 + lb * 0.2) / 255);
    };
    let cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    let dx = this.handX - cx, dy = this.handY - cy;
    const d0 = Math.hypot(dx, dy);
    if (!Number.isFinite(d0) || d0 === 0) return;   // NaN/零向量门（:28920-28926 flag20）
    const rotation = Math.atan2(dy, dx) - Math.PI / 2;   // :28917-28918（循环外定型）
    ctx.imageSmoothingEnabled = false;
    for (;;) {
      dx = this.handX - cx; dy = this.handY - cy;
      const d = Math.hypot(dx, dy);
      if (d < linkH + 1) break;                      // :28931-28934 终止门
      const ul = d || 1;
      cx += (dx / ul) * linkH;                       // 先步进（:28966-28968）
      cy += (dy / ul) * linkH;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.globalAlpha = Math.min(1, Math.max(0, lightAt(cx, cy)));
      ctx.drawImage(img, -img.width / 2, -linkH / 2);
      ctx.restore();
    }
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    // 火焰重锤 948 入水(非岩浆)→ 变型 948→947(:41064-41067 type==948 && wet && !lavaWet)
    // wet 语义 = 任一液体(Collision.WetCollision :1608 liquid>0,含蜂蜜/微光)中心
    // 探盒交叠;lavaWet 单独判(:15456-15459)——"湿且非岩浆"即水/蜂蜜/微光都触发。
    // 变型在 switch(type) 参数提取之前 → 同 tick 起按 947 参数走(两型参数一致,无感)
    if (this.projId === 948 && this.inLiquid(game) && !this.inLiquid(game, 2)) this.projId = 947;
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    this.hitCd.tick();
    // meleeSpeed 缩放链（:41151-41159,1/meleeSpeed）——repo attackSpeedMult 语义同向(>1 更快)
    const inv = 1 / (p.attackSpeedMult || 1);
    const throwSpd = this.prm.throwSpeed * inv;
    const pullAccel = this.prm.pullAccel * inv;
    const retractKill = this.prm.retractKill * inv;
    const returnAccel = this.prm.returnAccel * inv;
    const returnKill = this.prm.returnKill * inv;
    const farPull = this.prm.farPullSpeed * inv;
    const maxRange = 800;
    // 击杀门（:41053-41056）：主角死亡 / noItems（诅咒 23 :11326-11330,本仓=Cursed buff）/
    // CCed（冰冻·蛛网·石化三件套,Player.cced）/ 离手 900×(1/meleeSpeed)
    const distHand = () => Math.hypot(this.x + this.w / 2 - p.cx, this.y + this.h / 2 - p.cy);
    if (p.dead || p.buffs.has(BuffType.Cursed) || p.cced || distHand() > 900 * inv) {
      this.dead = true; return;
    }
    // :41057-41059 全屏地图打开 → Kill（原版 Main.myPlayer==owner 门,单机恒真）
    if (game.mapFullscreen?.()) { this.dead = true; return; }
    const held = this.channel();
    // num17/num18(:41164-41165):链长上限=掷速×飞行tick;垂地悬荡放行 +160
    const num17 = throwSpd * this.prm.flightTicks;
    const num18 = num17 + 160;
    // doFastThrowDust（:41232,case 1 入口置位——尘率分档用,取 switch 前状态）
    const fastThrow = this.st === 1;
    let cd = 10; // num11 默认每敌冷却
    switch (this.st) {
      case 0: { // 旋转态（:41168-41228）：绕体公转,松手朝鼠标掷出
        // ChangeDir（:41195-41201,channel 判定【之前】）:vector5 = mountedCenter→鼠标
        // 方向,X>0 → 1 / 否则 -1——角色朝鼠标侧转面(GAP#8 ①)。
        // ★26/35 双球在场时原版取反(:41174-41191 flag5,且掷出速度 X 翻转 :41207-41209)——
        // 本仓 channel 绑定手持物品 id(换手即掷出),双球并存结构性不可达,登记偏差
        const t0 = this.target();
        const spinDir = t0.x > p.cx ? 1 : -1;
        this.changeDir(p, spinDir);
        if (!held) {
          this.st = 1; this.stT = 0;
          const dx = t0.x - p.cx, dy = t0.y - p.cy;
          const dd = Math.hypot(dx, dy) || 1;
          this.vx = (dx / dd) * throwSpd + p.vx;
          this.vy = (dy / dd) * throwSpd + p.vy;
          this.x = p.cx - this.w / 2;
          this.y = p.cy - this.h / 2;
          this.hitCd.clear(); // ResetLocalNPCHitImmunity
          cd = this.prm.thrownHitCd;
          break;
        }
        this.spinT++;
        // :41218-41227 vector6 = (direction,0).RotatedBy(π×10×(t/60)×direction);
        // Y×0.8;向下(gravDir>0)再减半——扁椭圆轨迹,上快下慢。
        // direction = 上面 ChangeDir 的结果(原版同 tick 先转面后取 player.direction)
        const a = Math.PI * 10 * (this.spinT / 60) * spinDir;
        let ox = Math.cos(a) * spinDir, oy = Math.sin(a) * spinDir;
        oy *= 0.8;
        if (oy > 0) oy *= 0.5;
        this.x = p.cx + ox * this.prm.orbitRadius - this.w / 2;
        this.y = p.cy + oy * this.prm.orbitRadius - this.h / 2;
        this.vx = 0; this.vy = 0;
        cd = this.prm.spinHitCd;
        break;
      }
      case 1: { // 掷出态（:41230-41263）：直线无重力;再按 → 垂地悬荡(6)
        this.stT++;
        // ★再按目标态 = 6(:41238),非 3——1456 的 case 3 在 AI_015 内无任何入口
        //   (ai[0] 全部赋值点 :41204/:41238/:41251/:41275/:41292/:41355/:41370 无 3),
        //   是死状态;此前误接 3(垂链) = 飞行中再按球悬链不落地,行为偏差
        if (held) {
          this.vx *= 0.2; this.vy *= 0.2; // :41241
          // 757 气泡:速度×0.2 后×1.3,当场生成(:41242-41246)——
          // 此前缓存到帧尾=迟 1t 且位置已积分,1:1 改当场
          this.bubble757(this.vx * 1.3, this.vy * 1.3);
          this.st = 6; this.stT = 0;
          break; // break 在 ChangeDir 之前(:41247)——本 tick 不转面
        }
        if (this.stT >= this.prm.flightTicks || distHand() >= maxRange) {
          this.vx *= 0.3; this.vy *= 0.3; // :41254
          this.bubble757(this.vx * 1.3, this.vy * 1.3); // :41255-41259
          this.st = 2; this.stT = 0;
        }
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41261 面朝球
        cd = this.prm.thrownHitCd;
        break;
      }
      case 2: { // 回拉态（:41265-41286）：向手回拉,近手消失;再按 → 垂地
        if (distHand() <= retractKill) { this.dead = true; return; }
        if (held) { this.st = 6; this.stT = 0; this.vx *= 0.2; this.vy *= 0.2; break; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, retractKill, pullAccel);
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41284 面朝球(仅未再按支)
        cd = this.prm.thrownHitCd;
        break;
      }
      case 3: { // 垂链态（:41288-41330 1:1）：持按悬垂摆动;松手 → 回收;
        //  超链长段 ×0.98 朝手 MoveTowards(num9=14, num8=1)；链内近停段 X×0.96/Y+0.2
        //  （玩家静止再 X×0.96）；tileCollide 按是否超 num17 切换；玩家面朝球(:41328)
        if (!held) { this.st = 4; this.stT = 0; break; }
        {
          const dHand3 = Math.hypot(p.cx - this.cx, this.cy - p.cy);
          if (dHand3 > num17) {
            this.vx *= 0.98; this.vy *= 0.98;
            this.moveTowardsHand(p, 14, 1); // velocity ×0.98 后朝手 MoveTowards(14, 1)（num9/num8）
          } else {
            if (Math.hypot(this.vx, this.vy) < 6) {
              this.vx *= 0.96;
              this.vy += 0.2;
            }
            if (p.vx === 0) this.vx *= 0.96;
          }
          this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41328 面朝球
          cd = this.prm.thrownHitCd;
        }
        break;
      }
      case 5: { // 坠落态（:41352-41367,撞墙入口见下方 tile 碰撞）：重力坠地
        this.stT++;
        if (this.stT >= this.prm.flightTicks + 5) { this.st = 6; this.stT = 0; break; }
        cd = this.prm.thrownHitCd;
        this.vy += 0.6;
        this.vx *= 0.95;
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41364 面朝球(else 支)
        break;
      }
      case 6: { // 垂地悬荡态（:41367-41382）：持按垂链;松手/超程 → 回收
        if (!held || distHand() > num18) { this.st = 4; this.stT = 0; break; }
        if (!this.inLiquid(game, 4)) this.vy += 0.8; // :41374-41376 微光中不受重力(!shimmerWet)
        this.vx *= 0.95;
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41380 面朝球
        break;
      }
      case 4: { // 回收态（:41331-41351）：无视碰撞回手
        if (distHand() <= returnKill) { this.dead = true; return; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, returnKill, returnAccel);
        // 越手击杀（:41337-41343 Dot(dirToHand, dirFrom(目标点))<0 → Kill）
        const tx2 = this.x + this.w / 2 + this.vx, ty2 = this.y + this.h / 2 + this.vy;
        const hx = p.cx - tx2, hy = p.cy - ty2;
        const hd = Math.hypot(hx, hy) || 1;
        const sx = (p.cx - (this.x + this.w / 2)) / (distHand() || 1);
        const sy = (p.cy - (this.y + this.h / 2)) / (distHand() || 1);
        if (sx * (hx / hd) + sy * (hy / hd) < 0) { this.dead = true; return; }
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41349 面朝球
        break;
      }
      default: break;
    }
    // 位移 + tile 碰撞（AI_015_HandleMovementCollision :40982-41049）：
    // 旋转态位置由 AI 直接钉死不积分;回收态 tileCollide=false
    if (this.st !== 0 && this.st !== 4) {
      const rest = this.st === 1 || this.st === 5 ? 0.4 : this.st === 6 ? 0 : 0.2;
      const world = game.world;
      const solid = (x: number, y: number): boolean => {
        const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
        const x1 = Math.floor((x + this.w - 1) / TILE), y1 = Math.floor((y + this.h - 1) / TILE);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (world.store.inBounds(tx, ty) && world.store.isSolid(tx, ty)) return true;
        }
        return false;
      };
      const lvx = this.vx, lvy = this.vy;
      // num2(int,:40985):0=无音尘 / |lastV|>4 按轴置 1(:41001-41003/:41008-41010)/ 掷出态强制 2
      // (:41021)。结算(:41026-41033) = num2 次 Collision.HitTiles 尘 + 一次 SoundID 0
      // (挖掘音只一响,尘份量随档)——此前按轴各播一次会双响,1:1 收拢
      let dustN = 0;
      const nx = this.x + this.vx;
      if (solid(nx, this.y)) {
        this.vx = -lvx * rest;
        this.bounces++; // localAI[0]:每次接触都计(:41005/:41012)——只计 >4 会让缓磨墙永不触发逃生
        if (Math.abs(lvx) > 4) dustN = 1; // num2>0 门(:41001-41003)
      } else this.x = nx;
      const ny = this.y + this.vy;
      if (solid(this.x, ny)) {
        this.vy = -lvy * rest;
        this.bounces++;
        if (Math.abs(lvy) > 4) dustN = 1; // (:41008-41010)
      } else this.y = ny;
      // 掷出态撞墙 → 坠落态(:41014-41024):位移回卷 + num2 强制 2 + 冲击波(GAP#8 ④)
      if (this.st === 1 && (this.vx !== lvx || this.vy !== lvy)) {
        this.st = 5; this.stT = 0;
        this.x -= lvx; this.y -= lvy; // position -= vector(:41024)——撞墙 tick 不陷墙
        dustN = 2;                    // :41021 无视 |lastV|>4 门,音尘双份
        this.impactExplosion(game, lvx, lvy);
      }
      if (dustN > 0) this.hitTileFx(game, this.x, this.y, dustN);
      // 卡死逃生（:41035-41039）：弹墙≥10 次且非 3/0/5/6 态 → 强制回收
      if (this.st !== 3 && this.st !== 0 && this.st !== 5 && this.st !== 6 && this.bounces >= 10) {
        this.st = 4; this.stT = 0;
      }
    }
    // 旋转:247/1058 的 switch(type) 段内置 flag=false(:41437/:41395)——通用段
    // (:41485-41493 速度>1 对齐速度向,否则按 vx 缓转)被跳过,走各自专属式
    if (this.projId === 247) {
      // :41438-41442:rotation ±=(|vx|+|vy|)×0.01(按 vx 符号);旋转态再 +2π/15×direction
      const n22 = (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01;
      this.rotation += this.vx > 0 ? n22 : -n22;
      if (this.st === 0) this.rotation += (Math.PI * 2 / 15) * p.facing;
    } else if (this.projId === 1058) {
      // :41396-41398:rotation 恒指玩家(-π/2 补偿),不随飞行向
      this.rotation = Math.atan2(p.cy - this.cy, p.cx - this.cx) - Math.PI / 2;
    } else {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 1) this.rotation = Math.atan2(this.vy, this.vx) + this.vx * 0.1;
      else this.rotation += this.vx * 0.1;
    }
    // 1058 出场淡入(:41386-41394,SetDefaults alpha=255 :9719;全状态无门)
    if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 50);
    // ---- AI_015 特例子弹(:41383-41478 switch(type) 尾段) ----
    // ★原版该 switch(type) 特例段在【全部状态】运行(:41383-41478,无 ai[0] 门)——
    // 此前 st!==4 把回收态排除,1:1 对齐移除(2026-08-13)
    if (this.spawnProj) {
      if (this.projId === 247) {
        // Flairon:每 20t(脱靶续 17)600px 内最近敌(距离+CanHit)→ 自机弹 248
        // (:41435-41478)damage/1.5、kb/2、速 14
        this.subT++;
        if (this.subT >= 20) {
          this.subT = 17;
          const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
          let best = 600, bx = 0, by = 0, found = false;
          for (const ent of game.enemies()) {
            const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
            if (!playerCanHitEnemy(ent, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
            if (e.dead) continue;
            if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
            const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
            if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
          }
          if (found) {
            this.subT = 0;
            const dd = Math.hypot(bx - cx0, by - cy0) || 1;
            this.spawnProj(cx0, cy0, ((bx - cx0) / dd) * 14, ((by - cy0) / dd) * 14,
              248, Math.round(this.damage / 1.5), this.knockback / 2);
          }
        }
      } else if (this.projId === 1058) {
        // 轨道刺(:41409-41430):旋转态每 3-6t/其余态每 6t,朝【玩家反向】掷 405
        // (:41425-41429 v=(ball-player)norm×(4.5-6.5)±π/4);damage 满额/旋转态 kb×0.5
        this.subT++;
        // :41412-41421 num28:默认 4;垂链/悬荡态(vanilla 6/3)→ 6;旋转态 Next(3,6)=3-5
        const need = this.st === 0 ? 3 + Math.floor(Math.random() * 3)
          : this.st === 3 || this.st === 6 ? 6 : 4;
        if (this.subT >= need) {
          this.subT = 0;
          const dxp = this.x + this.w / 2 - p.cx, dyp = this.y + this.h / 2 - p.cy;
          const dp = Math.hypot(dxp, dyp) || 1;
          const base = Math.atan2(dyp / dp, dxp / dp);
          const ang = base + (Math.random() - 0.5) * Math.PI / 2;
          const spd = (4.5 + Math.random() * 2);
          this.spawnProj(this.x + this.w / 2, this.y + this.h / 2,
            Math.cos(ang) * spd, Math.sin(ang) * spd, 405, this.damage,
            this.st === 0 ? this.knockback * 0.5 : this.knockback);
        }
      }
    }
    // ---- AI_015_Flails_Dust（:41740-41812;doFastThrowDust=掷出态 :41232）----
    // 火尘（:41778-41785:type 35 每帧 1 颗火尘 noGravity;948 同型 :41786-41792）
    if (this.projId === 35 || this.projId === 948) {
      game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#FF8830', 1, 0.5,
        { life: 20, grav: 0, size: 2 });
    } else if (this.projId === 26) {
      // :41770-41775 hallow 尘近似
      if (Math.random() < 0.2) game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#B0A0FF', 1, 0.5, { life: 20, grav: 0, size: 2 });
    } else if (this.projId === 25) {
      // 25（:41742-41751）：尘 14,Next(掷出态?1:15)==0——掷出态每 tick,其余 1/15
      if (Math.floor(Math.random() * (fastThrow ? 1 : 15)) === 0) {
        game.spawnDust?.(this.x, this.y, this.w, this.h, 14, 0, 0, 150, null, 1.3);
      }
    } else if (this.projId === 154) {
      // 154（:41800-41805）：尘 115,noGravity,初速 v×0.4 后 ×0.25（净 ×0.1）
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 115,
        this.vx * 0.4, this.vy * 0.4, 140, null, 1.5);
      if (d) { d.noGravity = true; d.vx *= 0.25; d.vy *= 0.25; }
    } else if (this.projId === 757) {
      // 757（:41753-41770）双段：①弹体处 2 掷 Next(|v|<8?10:4)==0 尘 5（scale 0.8、
      //   fadeIn 1.3、velocity+=v/4;掷出态 num 减半）②链上 lerp 段 10 掷 Next(40)==0,
      //   位置=Lerp(玩家心,球心,rand)+(−8,0) 落 16×16 盒,scale 1.3、velocity+=v/4
      const fastDiv = fastThrow ? 2 : 1;
      const num1 = (Math.hypot(this.vx, this.vy) < 8 ? 10 : 4) / fastDiv;
      for (let i = 0; i < 2; i++) {
        if (Math.floor(Math.random() * num1) === 0) {
          const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 5, 0, 0, 0, null, 0.8);
          if (d) { d.vx += this.vx / 4; d.vy += this.vy / 4; d.fadeIn = 1.3; }
        }
      }
      const num2 = 40 / fastDiv;
      for (let i = 0; i < 10; i++) {
        if (Math.floor(Math.random() * num2) === 0) {
          const lx = p.cx + (this.cx - p.cx) * Math.random() - 8;
          const ly = p.cy + (this.cy - p.cy) * Math.random();
          const d = game.spawnDust?.(lx, ly, 16, 16, 5, 0, 0, 0, null, 1.3);
          if (d) { d.vx += this.vx / 4; d.vy += this.vy / 4; }
        }
      }
    }
    // direction/spriteDirection = sign(vx)（:41479-41483 每 tick 重写,vx==0 → -1;
    // 1058 豁免保持出生向）——绘制侧 -1 水平翻转（M.cs:29827-29831）,曾恒 false
    if (this.projId !== 1058) this.spriteDir = this.vx > 0 ? 1 : -1;
    // 击退方向 = projectile.direction(:41479-41482 velocity.X>0?1:-1,vx==0 → -1;
    // 1058 走专属式 :41398-41405 = 反(player→球)方向)——此前 Math.sign(vx)||1
    // 把 vx==0 档写成 1,1:1 修正
    const kdir = this.projId === 1058 ? (p.cx < this.cx ? 1 : -1) : (this.vx > 0 ? 1 : -1);
    hitEnemies(this, game, this.hitCd, cd, kdir, this.armorPen);
  }

  /** velocity MoveTowards(手方向×targetSpd, accel)（case2 :41283 / case3 :41311-41315 同式） */
  private moveTowardsHand(p: { cx: number; cy: number }, targetSpd: number, accel: number): void {
    const d = Math.hypot(p.cx - (this.x + this.w / 2), p.cy - (this.y + this.h / 2)) || 1;
    const tx = ((p.cx - (this.x + this.w / 2)) / d) * targetSpd;
    const ty = ((p.cy - (this.y + this.h / 2)) / d) * targetSpd;
    const ddx = tx - this.vx, ddy = ty - this.vy;
    const dd = Math.hypot(ddx, ddy);
    if (dd <= accel) { this.vx = tx; this.vy = ty; }
    else { this.vx += (ddx / dd) * accel; this.vy += (ddy / dd) * accel; }
  }

  /** Player.ChangeDir（Player.cs:41440-41460）:同向早退只写 direction;原版还镜像
   *  手臂合成旋转/itemRotation/itemLocation——本仓无手臂/持物朝向系统,仅落 facing */
  private changeDir(p: { facing: number }, dir: number): void {
    if (p.facing !== dir) p.facing = dir;
  }

  /** 中心格液体探测:type 省略=任一液体;1水/2岩浆/3蜂蜜/4微光(LIQUID_TYPE)。
   *  近似 Collision.WetCollision/LavaCollision(:1575-1651)中心探盒:阈值 64(≈1/4 格)
   *  近似原版表面偏移 (256-liquid)/16 的交叠判定(:1613-1616) */
  private inLiquid(game: GameHooks, type?: number): boolean {
    const st = game.world.store;
    const i = st.idx(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h / 2) / TILE));
    return st.liquid[i] > 64 && (type === undefined || st.liquidType[i] === type);
  }

  /** 757 Drippler 气泡 928(:41243-41246/:41256-41259):两过渡点当场掷出,
   *  速度 = (衰减后 velocity)×1.3,damage/knockBack 满额——实际生成走 spawnProj 回调 */
  private bubble757(vx: number, vy: number): void {
    if (this.projId === 757 && this.spawnProj) {
      this.spawnProj(this.cx, this.cy, vx, vy, 928, this.damage, this.knockback);
    }
  }

  /** 撞墙反馈(num2 次 Collision.HitTiles 尘 + 一次 SoundID 0 挖掘音,:41026-41033) */
  private hitTileFx(game: GameHooks, hx: number, hy: number, n = 1): void {
    game.spawnParticles(hx + this.w / 2, hy + this.h / 2, '#A09080', 3 * n, 1.5, { life: 14, size: 2 });
    game.playSfx('dig', 1, hx + this.w / 2, hy + this.h / 2);
  }

  /** 掷出态撞墙冲击波(GAP#8 ④)。原版两连(:41031-41034):
   *  ①CreateImpactExplosion(2, center, 命中盒, width, :66367-66412)——命中盒内逐格,
   *    实心·非 solidTop·非 frameImportant 且上方空气的块,按 KillTile_GetTileDustAmount
   *    ×2 出【块色】尘(velocity.Y -= (3+num×1.5)×rand、scale += num×0.03,num 恒 4;
   *    num≥2 再补 num2-1 颗上抛),出过尘 → causedShockwaves=true;
   *  ②CreateImpactExplosion2_FlailTileCollision(:66452-66500)——8 颗椭圆(7×0.7)白尘
   *    (color=White×0.5,α=causedShockwaves?0:50,scale 0.4,velocity.Y-=0.8/X×0.8 后
   *    += 撞前速度向×2;无块尘再补 8 颗 α100 ×1.5)。
   *  近似:粒子系统无逐格块色尘/定点椭圆环 → 上抛尘团(①)+ 定向半环(②,沿撞前方向
   *  偏置 yMul 0.7 压轴;原版入墙半环本就被块遮住) */
  private impactExplosion(game: GameHooks, lvx: number, lvy: number): void {
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    game.spawnParticles(cx0, cy0, '#A09080', 8, 2.5, { life: 22, grav: 0.1, size: 2 });
    game.spawnBurst?.(cx0, cy0, '#E8E4DC', 8, 2, Math.atan2(-lvy, -lvx), Math.PI / 2,
      { life: 24, grav: -0.02, yMul: 0.7 });
  }
}

// ================= 弗莱龙刺（proj 405，aiStyle 70 全语义 1:1，:29188-29239） =================

/** 1058 掷出的轨道刺 405（AI_015 :41425-41430 传 ai0=-10）：
 *  -10→0 漂入段(:29224-29231)：每 tick ai0++、α-25(下限 50)、vel×0.95;
 *  ai0==0 首寻(:29191-29215)：650px 内最近敌(CanHit 视线门)→ ai0=idx+1 并
 *  初次转向 (v×20+dir×Next(35,75)/30)/21；无目标 → ai0=-15(再漂 15t);
 *  ai0>0 追踪段(:29217-29219)：(v×40+dir×12)/41;
 *  撞块(:16905-16921)：前 2 次接触反弹、第 3 次 Kill;Kill 爆 20 颗火尘(:69686)。
 *  scale=ai1=Next(80,121)/100(:29233-29239);timeLeft 120/penetrate 1(SetDefaults :4584) */
export class FlaironSpike extends Entity {
  w = 14; h = 14;
  damage: number;
  knockback: number;
  projId = 405;
  critChance = 0.04;
  meleeProj = true;
  private ai0: number;   // -10 起步(1058 传参语义)
  private ai1: number;   // scale
  private alpha = 255;
  private bounces = 0;
  private hitCd = new HitCooldown();
  life = 120;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.ai0 = -10;
    this.ai1 = (80 + Math.random() * 41) / 100; // Next(80,121)/100
  }

  draw(r: Renderer, cam: Camera): void {
    // α 原版语义(Main.cs:28965 color *= (255-alpha)/255,越大越透明):SetDefaults 255
    // (:4590)出生隐形,漂入段每 tick -25 至 50(:29225-29229)→ 淡入。
    // 此前直接 alpha/255 当不透明度 = 方向写反(出生全显、越漂越透明)。
    // scale=ai1(:29237)是贴图缩放非命中盒——此前改 w 会让绘制中心随缩放偏移
    drawProj(r, cam, this, this.projId,
      Math.atan2(this.vy, this.vx) + Math.PI / 2, '#FFB060',
      Math.max(0, (255 - this.alpha) / 255), Math.round(14 * this.ai1));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    this.hitCd.tick();
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    if (this.ai0 === 0) {
      // 首寻:650px 内最近敌(距离+CanHit)
      let best = 650, bx = 0, by = 0, found = false;
      for (const ent of game.enemies()) {
        const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
        if (!playerCanHitEnemy(ent, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
        if (e.dead) continue;
        if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
        const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
        if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
      }
      this.ai0 = found ? 1 : -15; // repo 无 NPC 索引,命中即锚定首敌(ai0=1)
      if (found) {
        const num605 = (35 + Math.random() * 40) / 30; // Next(35,75)/30
        const jx = bx - cx0 + (Math.random() * 200 - 100);
        const jy = by - cy0 + (Math.random() * 200 - 100);
        const jd = Math.hypot(jx, jy) || 1;
        this.vx = (this.vx * 20 + (jx / jd) * num605) / 21;
        this.vy = (this.vy * 20 + (jy / jd) * num605) / 21;
      }
    } else if (this.ai0 > 0) {
      // 追踪:(v×40+dir×12)/41——repo 无索引锚,朝当前最近敌(650 内)
      let best = 650, bx = 0, by = 0, found = false;
      for (const ent of game.enemies()) {
        const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
        if (!playerCanHitEnemy(ent, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
        if (e.dead) continue;
        const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
        if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
      }
      if (found) {
        const dd = Math.hypot(bx - cx0, by - cy0) || 1;
        this.vx = (this.vx * 40 + ((bx - cx0) / dd) * 12) / 41;
        this.vy = (this.vy * 40 + ((by - cy0) / dd) * 12) / 41;
      }
    } else {
      // 漂入/无目标:ai0++、α-25(下限 50)、vel×0.95
      this.ai0++;
      this.alpha = Math.max(50, this.alpha - 25);
      this.vx *= 0.95; this.vy *= 0.95;
    }
    this.x += this.vx;
    this.y += this.vy;
    // 撞块:前 2 次反弹、第 3 次 Kill(:16905-16921)
    const tx = Math.floor((this.x + this.w / 2) / TILE), ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.inBounds(tx, ty) && game.world.store.isSolid(tx, ty)) {
      this.bounces++;
      if (this.bounces < 3) {
        this.x -= this.vx; this.y -= this.vy;
        this.vx = -this.vx; this.vy = -this.vy;
      } else {
        this.dead = true;
        // Kill 爆尘(:69686-69700):20 颗火尘向外喷(音效 Item54 未提取,登记 GAP)
        game.spawnParticles(cx0, cy0, '#FF9A3C', 20, 2.5, { life: 30, grav: -0.05 });
        return;
      }
    }
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1);
  }
}

// ================= 手雷/炸弹/炸药（aiStyle 16，AI_016 引信爆炸） =================

/** AI_016 全族分类表（Projectile.cs 权威行号） */
/** 粘性族（SetDefaults tileCollide=false + AI_016 :44325 贴附扫描）。
 *  911 黏性土制炸弹同族（:8371-8379 tileCollide=false + :44325 列表） */
const STICKY_PROJ = new Set([37, 397, 470, 911]);
/** 液体炸弹族（903 水/904 岩浆/905 蜂蜜/906 干燥）：入液即爆
 *  （AI_016 :44267 wet && 族列表 → timeLeft=1 次帧爆） */
const LIQUID_BOMB_PROJ = new Set([903, 904, 905, 906]);
/** 液体火箭族（AI_016 :44267 wet → timeLeft=1 入液即爆，与 903-906 同门——
 *  湿 784-786/805、熔岩 787-789/806、蜂蜜 790-792/807、干 799-801/810） */
const LIQUID_ROCKET_PROJ = new Set([784, 785, 786, 805, 787, 788, 789, 806,
  790, 791, 792, 807, 799, 800, 801, 810]);
/** 炸药棍族（Kill :74943 视觉/PrepareBombToBlow 250×250/半径 7/反弹 ×0.8/摩擦追加 ×0.99） */
const DYN_PROJ = new Set([29, 470, 637]);
/** 炸弹族（Kill :74881 视觉/PrepareBombToBlow 128×128 dmg100/半径 4） */
const BOMB_PROJ = new Set([28, 37, 516]);
/** 手雷族（不破坏地形；PrepareBombToBlow 128×128 用物品伤害） */
const NADE_PROJ = new Set([30, 397, 517]);
/** IsABombWithFuse（ProjectileID.cs:183——引信嘶声循环族；手雷族不在内！）。
 *  原版全集含 519/75/102/681/773/1077/1086/1087——它们在本仓走各自专属实体
 *  （681 DD2GoblinBomb=bossAI_dd2 等），不经过 GrenadeProj,故表内只收
 *  本实体承接的成员 + 湿/干/土制弹族 903-906/910/911（§7 销核批落地，
 *  2026-08-13 主会话补入嘶声资格） */
const FUSE_SOUND_PROJ = new Set([28, 37, 516, 29, 470, 637, 903, 904, 905, 906, 910, 911]);

export class GrenadeProj extends Entity {
  // 碰撞盒 1:1（Projectile.SetDefaults :846-869/:938/:4508/:5173/:5584/:5592/:6571）：
  // 28/37/516=22×22 / 29/470/637=10×10 / 30/397/517=14×14——此前统一 14×14
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  projId: number;
  /** 接触伤害穿甲+暴击率（发射侧注入——Damage_PVE 接触结算与爆炸同源；
   *  曾接触只钳引信不结算伤害=火箭穿体 3t 后才在身后爆,目标零伤
   *  (2026-08-23 用户报"火箭打不了假人/蝙蝠身边爆了没伤害") */
  contactPen = 0;
  contactKb = 0;
  critChance = 0;
  /** 引信 timeLeft 1:1（SetDefaults :10348-10408）：炸弹/手雷族 180、炸药棍族
   *  {29,470,637}=300——此前误写 150/135/180 */
  fuse: number;
  onExplode!: (x: number, y: number, damage: number, oldVx?: number, oldVy?: number) => void;
  /** 1088 橡实种弹撞块种树检查（AI_016 撞块响应段 :18342-18346：CanAcornPlant →
   *  Kill——Kill 内再判一次决定种植/掉落）。Game 侧注入（placeAcornSapling 域）；
   *  返回 true = 本弹立即按 Kill 消亡走 onExplode（种植路径），false = 正常反弹 */
  bouncePlantCheck?: (cx: number, cy: number) => boolean;
  private rot = 0;
  dead = false;
  /** 引信嘶声循环句柄（AI_016 :44276-44281 PlayTrackedLoopedSound；Kill :67373 Stop） */
  private fuseSnd: { stop(): void; setPos(px: number, py: number): void } | null | undefined;
  /** 911 首贴标记（原版 localAI[0]，:44364/:44372） */
  private stuckOnce = false;
  /** 655 摇树蜂巢（AI_025 :17856-17867）：落地 vy>5 反弹×0.2（且只弹不杀）；
   *  水平撞墙即 Kill → 裂 2+Next(3)³ 蜂（Kill :72110-72155）；wet Kill 落
   *  蜂王浆 1124×Next(2,6)（:72124-72128）。裂蜂回调由 Game 注入（出怪上限门
   *  GetAvailableAmountOfNPCsToSpawnUpToSlot 在 Game 侧） */
  onBeehiveKill?: (wet: boolean, px: number, py: number, vx: number, vy: number) => void;

  // ---- 发射器弹药族（AI_016 else 发射支 :44542-44911，2026-08-14 对账新增）----
  /** fired = 发射族（无 PrepareBombToBlow 投掷臂路径；无重力直线/加速/追踪） */
  fired = false;
  /** 撞块语义表（:18365-18370）：火箭族撞块 vel=0 + 隐形 + timeLeft=3（贴墙 3t 后爆） */
  private static readonly FIRED_STICK = new Set([134, 137, 140, 143, 303,
    338, 339, 340, 341, 776, 780, 784, 787, 790, 793, 796, 799,
    803, 804, 805, 806, 807, 808, 809, 810, 930]);
  /** 火箭族（:48181-48240）：|vx|<15&&|vy|<15 → v×1.1 飞行加速；|vx|≥8 或 |vy|≥8
   *  每 update 2×尘 num13 + 2×尘 31 烟尾 */
  private static readonly FIRED_ROCKET = new Set([134, 137, 140, 143, 303,
    776, 780, 784, 787, 790, 793, 796, 799]);
  /** 烟尾尘型号表（:47974-47990 num13）：普通火箭 6 烟雾 / 776·780 228 / 784·805
   *  1/3 水 / 787·806 1/3 尘 35 / 790·807 1/3 尘 152 */
  private static rocketTrailDust(projId: number): number {
    if (projId === 776 || projId === 780) return 228;
    if (projId === 784 || projId === 805) return Math.random() < 1 / 3 ? 6 : 33;   // Dust.dustWater() 默认水样 33（Dust.cs:405-423，水样分档未建模）
    if (projId === 787 || projId === 806) return Math.random() < 1 / 3 ? 6 : 35;
    if (projId === 790 || projId === 807) return Math.random() < 1 / 3 ? 6 : 152;
    return 6;
  }
  /** 雪人/集束追踪（:44570-44684）：ai0>30 搜敌 600(930:650)+视线 → lerp 1/12 → dir×16(930:12) */
  private static readonly FIRED_HOME = new Set([338, 339, 340, 341,
    803, 804, 805, 806, 807, 808, 809, 810, 930]);
  /** 发射榴弹尾尘（:44743-44749） */
  private static readonly FIRED_GRENADE = new Set([133, 136, 139, 142,
    777, 781, 785, 788, 791, 794, 797, 800]);
  /** 感应雷（:44750-44768）：|v|<0.2 → alpha+2 钳 200 布防半隐 */
  private static readonly FIRED_MINE = new Set([135, 138, 141, 144,
    778, 782, 786, 789, 792, 795, 798, 801]);
  /** 延迟重力弧（:44881-44901）：ai[0]>10 后 vy+0.2/update（vy==0&&vx≠0 时另
   *  vx×0.97 摩擦）——1088 橡实种弹（5629 橡实弹弓）与其同支 9 型（30/397/517/
   *  681/588/779/783/862/863，本仓暂无发射源=惰性成员）；ai[0] 在原支内被
   *  钳回 10（:44885）→ 此后每拍恒触发 */
  private static readonly FIRED_ARC = new Set([30, 397, 517, 681, 588,
    779, 783, 862, 863, 1088]);
  /** 发射支 ai[0]（追踪 ramp 用） */
  private firedAi0 = 0;

  /** 655 蜂巢落地/撞墙 Kill（:72110-72155）：音 4 + 尘 147×30 + 裂蜂回调
   *  （数量/出怪上限门在 Game 侧）。引信耗尽走 onExplode 不入此路。 */
  private killBeehive(game: GameHooks, lastVx: number, lastVy: number): void {
    if (this.dead) return;
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    game.spawnParticles(this.cx, this.cy, '#B8D878', 30, 1.8, { life: 20 });
    this.onBeehiveKill?.(false, this.cx, this.cy, lastVx * 1.9, lastVy * 1.9);
  }
  /** 火箭贴墙待爆标记（vel=0 后停物理） */
  private stickPending = false;
  /** 感应雷布防 alpha（0 常态 → 200 布防） */
  private armedAlpha = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, fuse: number,
    projId: number, onExplode: (x: number, y: number, damage: number, oldVx?: number, oldVy?: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.fuse = fuse;
    this.projId = projId;
    this.onExplode = onExplode;
    // 液体炸弹/土制炸弹族碰撞盒 22×22（SetDefaults :8325-8332/:8363-8379 同炸弹族）
    const hb = BOMB_PROJ.has(projId) || LIQUID_BOMB_PROJ.has(projId) || projId === 910 || projId === 911
      ? 22 : DYN_PROJ.has(projId) ? 10 : 14;
    this.w = hb; this.h = hb;
  }

  /** 发射支（AI_016 else :44542-44911）：无重力直线 + 家族行为 + 撞块语义表 */
  private firedStep(game: GameHooks): void {
    const st = game.world.store;
    // 液体火箭入液即爆（AI_016 头 :44267 wet → timeLeft=1，与 903-906 同门）
    if (LIQUID_ROCKET_PROJ.has(this.projId)) {
      const tx0 = Math.floor(this.x / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
      const ty0 = Math.floor(this.y / TILE), ty1 = Math.floor((this.y + this.h - 1) / TILE);
      wetScan: for (let wx = tx0; wx <= tx1; wx++) {
        for (let wy = ty0; wy <= ty1; wy++) {
          if (st.inBounds(wx, wy) && st.liquid[st.idx(wx, wy)] > 0) { this.fuse = 1; break wetScan; }
        }
      }
    }
    // 接触引爆（Damage_PVE_Inner :12330-12340 碰 NPC → timeLeft 钳 3；发射族
    // friendly 不炸玩家）。★Damage() 每 tick 跑（Update :15738）→ 遍历 Main.npc
    // 全表 = enemies+critters 两桶（碰小动物同样钳引信+弹体盒结算伤害——小动物
    // 一击死）。曾只扫 enemies 桶（2026-08-21 补 critters）
    if (this.fuse > 3) {
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean;
          hurt?: (d: number, kx: number, ky: number, g: unknown, pen?: number, crit?: boolean, pierce?: number, fp?: boolean) => boolean };
        if (e.dead) continue;
        if (this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y) {
          // Damage_PVE_Inner aiStyle16 分支（:12330-12340）只钳 timeLeft=3——接触伤害
          // 已在标准 Damage_PVE 流程结算（StrikeNPC 全管线：飘值/音/免疫帧由单点给，
          // 3t 后的爆炸被免疫帧挡住不双击）。曾只钳引信不结算 = 火箭以 ~10-15px/t
          // 再飞 3t（30-45px）穿过目标才爆,接触目标零伤（假人/蝙蝠双症状根因）
          const dir = (e.x + e.w / 2) < this.x + this.w / 2 ? -1 : 1;
          const crit = Math.random() < (this.critChance || 0.04);
          e.hurt?.(this.damage, dir * this.contactKb, 0, game, this.contactPen, crit, 0, true);
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
            c.hurt?.(game);   // 弹体盒结算（小动物一击死）
            this.fuse = 3;
            break;
          }
        }
      }
    }
    if (--this.fuse <= 0) {
      this.dead = true;
      this.destroy();
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage, this.vx, this.vy);
      return;
    }
    // ---- 家族行为（发射支通用 ai[0] += 1 :44836——榴弹 15u 重力门/追踪 ramp 都吃它）----
    this.firedAi0 += 1;
    if (GrenadeProj.FIRED_HOME.has(this.projId) && this.firedAi0 > 30) {
      let tx = this.cx + this.vx * 100, ty = this.cy + this.vy * 100;   // 无目标 → 前方 100px
      let bd = this.projId === 930 ? 650 : 600;
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; cx: number; cy: number; dead?: boolean };
        if (e.dead) continue;
        const d = Math.abs(e.cx - this.cx) + Math.abs(e.cy - this.cy);
        if (d < bd && canHit(st, this.cx, this.cy, 0, 0, e.x + e.w / 2, e.y + e.h / 2, 0, 0)) {
          bd = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2;
        }
      }
      const spd = this.projId === 930 ? 12 : 16;
      const dl = Math.hypot(tx - this.cx, ty - this.cy) || 1;
      const gx = (tx - this.cx) / dl * spd, gy = (ty - this.cy) / dl * spd;
      this.vx += (gx - this.vx) / 12;                                   // Lerp 1/12（:44683）
      this.vy += (gy - this.vy) / 12;
    }
    if (GrenadeProj.FIRED_ROCKET.has(this.projId)) {
      if (Math.abs(this.vx) < 15 && Math.abs(this.vy) < 15) {             // 飞行加速 ×1.1（:48236-48238）
        this.vx *= 1.1; this.vy *= 1.1;
      }
      // 烟尾（AI_016 :48183-48234）：|vx|≥8 或 |vy|≥8 每 update 2 拍循环（n=0/1）——
      // 每拍烟尘 num13（scale×2+Next(10)×0.1、v×0.2、noGravity）+ 火尘 31（scale 0.5、
      // fadeIn 1+Next(5)×0.1、v×0.05）；出生点 = (x+3+n·v/2)−v/2、盒 (w−8,h−8)。
      // 曾 60% 掷 1 粒合成粒子 = 烟尾密度/形态与原版不符（备案遗留③）
      if (Math.abs(this.vx) >= 8 || Math.abs(this.vy) >= 8) {
        const dust13 = GrenadeProj.rocketTrailDust(this.projId);
        for (let n = 0; n < 2; n++) {
          const ox = n === 1 ? this.vx * 0.5 : 0;
          const oy = n === 1 ? this.vy * 0.5 : 0;
          const px = this.x + 3 + ox - this.vx * 0.5;
          const py = this.y + 3 + oy - this.vy * 0.5;
          const bw = Math.max(5, this.w - 8), bh = Math.max(5, this.h - 8);
          const d13 = game.spawnDust?.(px, py, bw, bh, dust13, 0, 0, 100, null,
            2 + Math.floor(Math.random() * 10) * 0.1, true);
          if (d13) { d13.vx *= 0.2; d13.vy *= 0.2; }
          const d31 = game.spawnDust?.(px, py, bw, bh, 31, 0, 0, 100, null, 0.5);
          if (d31) { d31.fadeIn = 1 + Math.floor(Math.random() * 5) * 0.1; d31.vx *= 0.05; d31.vy *= 0.05; }
        }
      }
    }
    if (GrenadeProj.FIRED_GRENADE.has(this.projId)) {
      if (Math.random() < 0.5) game.spawnParticles(this.cx, this.cy, '#B8B8A8', 1, 1.2, { life: 18 });  // 尾尘 31（:44745-44748）
      if (this.firedAi0 > 15) {                                           // 15u 后重力 + 落地摩擦（:44870-44879）
        if (this.vy === 0 && this.vx !== 0) this.vx *= 0.95;
        this.vy = Math.min(this.vy + 0.2, 16);
      }
    }
    if (GrenadeProj.FIRED_ARC.has(this.projId) && this.firedAi0 > 10) {
      // 延迟重力弧（:44881-44901）：ai[0]>10 起 vy+0.2/update；落地滚行摩擦
      // （vy==0&&vx≠0 → vx×0.97，|vx|<0.01 归零——:44886-44893）
      if (this.vy === 0 && this.vx !== 0) {
        this.vx *= 0.97;
        if (this.vx > -0.01 && this.vx < 0.01) this.vx = 0;
      }
      this.vy += 0.2;
    }
    if (GrenadeProj.FIRED_MINE.has(this.projId)) {
      // 恒重力 + 减速布防（:44857-44868）：vy+=0.2、v×0.97、|v|<0.1 归零
      this.vy = Math.min(this.vy + 0.2, 16);
      this.vx *= 0.97; this.vy *= 0.97;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (Math.abs(this.vy) < 0.1) this.vy = 0;
      if (Math.abs(this.vx) < 0.2 && Math.abs(this.vy) < 0.2) {
        this.armedAlpha = Math.min(200, this.armedAlpha + 2);             // 布防半隐（:44752-44758）
      } else {
        this.armedAlpha = 0;
        if (Math.random() < 0.5) game.spawnParticles(this.cx, this.cy, '#C0C0B0', 1, 1.4, { life: 16 });
      }
    }
    if (this.stickPending) return;                                        // 贴墙待爆：vel=0 静止
    // ---- 位移（无重力）+ 撞块（:18339-18371 响应表）----
    // ★撞块采样全部用【新位置 nx/ny】——曾 Y 轴第二项用旧 x 右缘(this.x+w-1):
    //   出生盒与邻格实心(像素方块夹缝)重叠时该项恒真 → 无论朝哪都判竖向撞块
    //   → 贴墙 timeLeft=3 原地爆(2026-08-23 用户报"站在像素方块地形火箭任何
    //   角度都在脚下爆")。原版先移动后按新盒检查(:18342 系),离墙方向第一子步
    //   即脱离重叠正常飞出
    const lastVx = this.vx, lastVy = this.vy;
    let nx = this.x + this.vx;
    let ny = this.y + this.vy;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    // 1088 橡实种弹：撞块先查种树点（:18342-18346 CanAcornPlant → Kill——
    // Kill 内种植/掉落，oldVelocity = 入撞前速度）
    if (this.projId === 1088 && this.bouncePlantCheck
      && (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, ny + this.h - 1)
        || solidAt(nx + this.w - 1, ny + this.h - 1))
      && this.bouncePlantCheck(this.cx, this.cy)) {
      this.dead = true;
      this.destroy();
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage, lastVx, lastVy);
      return;
    }
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, ny + this.h - 1)) {
      if (GrenadeProj.FIRED_STICK.has(this.projId)) {
        this.vx = 0; this.vy = 0; this.stickPending = true; this.fuse = Math.min(this.fuse, 3);
      } else {
        this.vx = lastVx * -0.4;                                          // 榴弹/雷反弹 ×−0.4（:18349-18356）
      }
      nx = this.x;
    }
    if (solidAt(nx + this.w / 2, ny + this.h - 1) || solidAt(nx + this.w - 1, ny + this.h - 1)) {
      if (GrenadeProj.FIRED_STICK.has(this.projId)) {
        this.vx = 0; this.vy = 0; this.stickPending = true; this.fuse = Math.min(this.fuse, 3);
      } else if (lastVy > 0.7) {
        this.vy = lastVy * -0.4;
      } else {
        this.vy = 0;
      }
      ny = this.y;
    }
    this.x = nx;
    this.y = ny;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.dead = true;
      this.destroy();
      return;
    }
    // 滚转：火箭族不滚（:44908 排除）→ 朝向速度；榴弹/雷滚转
    if (GrenadeProj.FIRED_STICK.has(this.projId)) {
      this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;   // 贴图纵向（同箭族）
    } else {
      this.rot += this.vx * 0.1;
    }
  }

  draw(r: Renderer, cam: Camera): void {
    // 原版投射物绘制 = 贴图原生尺寸 × scale 1（与碰撞盒解耦）——雷管 29 贴图 10×32
    // 此前按碰撞盒宽 14 拉方成 14×44.8（"雷管贴图这么大个"根因）
    // 发射族：贴墙待爆 alpha=255 隐形 / 感应雷布防 alpha=200 半隐（:18368/:44754）
    const firedA = this.fired ? 1 - Math.max(this.stickPending ? 255 : this.armedAlpha, 0) / 255 : 1;
    drawProj(r, cam, this, this.projId, this.rot, '#408040', firedA, -1);
  }

  /** 死亡清理：停引信嘶声（Kill :67373-67377 GetActiveSound?.Stop()） */
  destroy(): void {
    this.fuseSnd?.stop();
    this.fuseSnd = null;
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (this.fired) { this.firedStep(game); return; }
    const st = game.world.store;
    // ---- 液体炸弹入液即爆（AI_016 :44267：wet && {903..906} 族 → timeLeft=1 次帧爆；
    //      wet = Collision.WetCollision 投射物盒与任一液体格重叠 :10248）----
    if (LIQUID_BOMB_PROJ.has(this.projId)) {
      const tx0 = Math.floor(this.x / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
      const ty0 = Math.floor(this.y / TILE), ty1 = Math.floor((this.y + this.h - 1) / TILE);
      wetScan: for (let wx = tx0; wx <= tx1; wx++) {
        for (let wy = ty0; wy <= ty1; wy++) {
          if (st.inBounds(wx, wy) && st.liquid[st.idx(wx, wy)] > 0) { this.fuse = 1; break wetScan; }
        }
      }
    }
    // ---- 引信嘶声循环（AI_016 :44276：IsABombWithFuse 且 timeLeft>1；0.2 音量跟踪弹体）----
    if (FUSE_SOUND_PROJ.has(this.projId) && this.fuse > 1) {
      // 首播可能缓冲未就绪返回 null → 每 tick 重试直至挂上（原版同帧不保证）
      if (!this.fuseSnd) {
        this.fuseSnd = game.startTrackedLoop?.('bombFuse', 0.2, this.cx, this.cy) ?? null;
      } else {
        this.fuseSnd.setPos(this.cx, this.cy);
      }
    }
    // ---- 接触引爆（Projectile.Damage :12330-12340 仅碰 NPC；玩家不引爆）----
    // ★原版 BombsHurtPlayers(:13944-13959) 对玩家【只伤害不置 timeLeft】——曾把
    //   玩家也当引爆条件:炸弹出生点在玩家盒内 → 首帧 fuse=3 → 0.05s 即爆
    //   = "炸弹没引信"根因（2026-08-16 用户实抓）。PvP 敌对玩家接触(:13533)
    //   才写 timeLeft=3,本仓单机无此场景。
    {
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean;
          hurt?: (d: number, kx: number, ky: number, g: unknown, pen?: number, crit?: boolean, pierce?: number, fp?: boolean) => boolean };
        if (e.dead) continue;
        if (this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y) {
          // 接触伤害同发射支（Damage_PVE 标准流程先于 aiStyle16 钳引信——曾只钳不结算
          // = 投掷炸弹穿体后爆,接触目标零伤,同火箭双症状）
          const dir = (e.x + e.w / 2) < this.x + this.w / 2 ? -1 : 1;
          const crit = Math.random() < (this.critChance || 0.04);
          e.hurt?.(this.damage, dir * this.contactKb, 0, game, this.contactPen, crit, 0, true);
          this.fuse = Math.min(this.fuse, 3);
          break;
        }
      }
      // critters 桶同钳（Damage_PVE 全表遍历——碰小动物=弹体盒一击死+钳引信;
      // 与上方发射支接触段同语义,曾漏）
      if (this.fuse > 3) {
        for (const cent of game.critters?.() ?? []) {
          const c = cent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean; hurt?: (g: unknown) => boolean };
          if (!c || c.dead) continue;
          if (this.x < c.x + c.w && this.x + this.w > c.x
            && this.y < c.y + c.h && this.y + c.h > c.y) {
            c.hurt?.(game);
            this.fuse = Math.min(this.fuse, 3);
            break;
          }
        }
      }
    }
    // ---- 引信倒数 → 爆（PrepareBombToBlow 在 timeLeft≤3 置 alpha=255 隐形本体，此处直接爆）----
    if (--this.fuse <= 0) {
      this.dead = true;
      this.destroy();
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage, this.vx, this.vy);
      return;
    }
    // 旋转 = 滚动（AI_016 :44909-44915 rotation += velocity.X × 0.1；本族不在排除表）
    this.rot += this.vx * 0.1;
    // ---- 粘性族（AI_016 :44325-44390）：tileCollide=false 不碰块反弹；
    //      盒外扩 ±1..+2 格扫实心（跳过平台），4px 内缩重叠 → velocity=(0,-0.2) 贴附 ----
    if (STICKY_PROJ.has(this.projId)) {
      const x0 = Math.max(0, Math.floor(this.x / TILE) - 1);
      const x1 = Math.min(st.w, Math.floor((this.x + this.w) / TILE) + 2);
      const y0 = Math.max(0, Math.floor(this.y / TILE) - 1);
      const y1 = Math.min(st.h, Math.floor((this.y + this.h) / TILE) + 2);
      let stuck = false;
      for (let i = x0; i < x1 && !stuck; i++) {
        for (let j = y0; j < y1 && !stuck; j++) {
          if (!st.inBounds(i, j) || !st.isActive(i, j) || !st.isSolid(i, j) || st.isPlatform(i, j)) continue;
          if (this.x + this.w - 4 > i * TILE && this.x + 4 < i * TILE + TILE
            && this.y + this.h - 4 > j * TILE && this.y + 4 < j * TILE + TILE) {
            stuck = true;
            // 911 首贴回退（:44364-44374）：与块中心距离 <12px → 沿速度反方向退 4px，
            // 随后 localAI[0]=1 不再触发（防止反复推挤穿墙）
            if (this.projId === 911 && !this.stuckOnce) {
              const tcx = i * TILE + 8, tcy = j * TILE + 8;
              if (Math.hypot(this.cx - tcx, this.cy - tcy) < 12) {
                const vl = Math.hypot(this.vx, this.vy);
                if (vl > 0) {
                  this.x -= (this.vx / vl) * 4;
                  this.y -= (this.vy / vl) * 4;
                }
              }
              this.stuckOnce = true;
            }
          }
        }
      }
      if (stuck) {
        this.vx = 0; this.vy = -0.2;                  // 贴附：抵消重力悬停（:44376-44377）
        // 911 推出（:44385-44393）：弹心所在格实心 → 沿（块心−弹心）反向退 4px，
        // 让炸弹停在墙面外侧而非嵌进砖里（SolidOrSlopedTile ≈ isSolid）
        if (this.projId === 911) {
          const ptx = Math.floor(this.cx / TILE), pty = Math.floor(this.cy / TILE);
          if (st.inBounds(ptx, pty) && st.isSolid(ptx, pty)) {
            const dx = ptx * TILE + 8 - this.cx, dy = pty * TILE + 8 - this.cy;
            const dl = Math.hypot(dx, dy);
            if (dl > 0) {
              this.x -= (dx / dl) * 4;
              this.y -= (dy / dl) * 4;
            }
          }
        }
      } else {
        // 未贴住时照常重力；911 速度钳 ±8（:44898-44902 专属分支）
        this.vy = Math.min(this.vy + 0.2, this.projId === 911 ? 8 : 16);
        if (this.projId === 911) this.vx = Math.max(-8, Math.min(8, this.vx));
      }
      this.x += this.vx;
      this.y += this.vy;
      if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; this.destroy(); }
      return;
    }
    // ---- 普通族物理：重力 0.2（:44897）+ AABB 碰撞 + 反弹 ----
    // ★2026-08-17 重写:旧版只查中心右/底两个点(nx+w/2)——朝左飞可整弹嵌墙
    // (左缘永远不检测)、落地判定也只在下半格命中时才生效。改用 moveAndCollide
    // 全 AABB 碰撞(四缘+步进),碰后按原版 :18339-18357 反弹/摩擦。
    this.vy = Math.min(this.vy + 0.2, 16);
    const lastVx = this.vx, lastVy = this.vy;
    const body = {
      x: this.x, y: this.y, w: this.w, h: this.h,
      vx: this.vx, vy: this.vy,
      onGround: false, hitWall: false, hitHead: false,
      stepUp: false, dropThrough: false, stepDownGate: 'gravity' as const,
    };
    moveAndCollide(body, game.world, this.vx, this.vy);
    // 655 蜂巢专属（:17856-17867）：落地 vy>5 → 反弹×0.2（无摩擦档）；撞墙即裂
    if (this.projId === 655) {
      if (body.onGround && lastVy > 5) this.vy = -lastVy * 0.2;
      else if (body.onGround) { this.vy = 0; this.x = body.x; this.y = body.y; return; }
      else { this.x = body.x; this.y = body.y; }
      if (body.hitWall) this.killBeehive(game, lastVx, lastVy);
      return;
    }
    // 碰墙反弹（:18344-18350）：vx = lastVx × -0.4（炸药棍族再 ×0.8）
    if (body.hitWall) {
      this.vx = lastVx * -0.4;
      if (DYN_PROJ.has(this.projId)) this.vx *= 0.8;
    } else {
      this.vx = body.vx;
    }
    // 落地反弹/贴地滚动（:18351-18357 + :44888-44895）：
    // lastVy>0.7 → vy = lastVy × -0.4（炸药棍族 ×0.8）；否则贴地 vy=0 + 滚动摩擦
    if (body.hitHead) {
      this.vy = 0;    // 撞顶停止上浮
    } else if (body.onGround) {
      if (lastVy > 0.7) {
        this.vy = lastVy * -0.4;
        if (DYN_PROJ.has(this.projId)) this.vy *= 0.8;
      } else {
        this.vy = 0;
        this.vx *= DYN_PROJ.has(this.projId) ? 0.97 * 0.99 : 0.97;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
      }
    } else {
      this.vy = body.vy;
    }
    this.x = body.x;
    this.y = body.y;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; this.destroy(); }
  }
}

// ================= 荧光棒族（aiStyle 14，AI_014 + 碰撞反弹表 Projectile.cs:23482-23500/18261-18333） =================

/** 荧光棒物理 1:1：
 *  AI_014 主体（cs:23482-23500）：ai0++ >5 钳位；着地（本帧 vy 未变且 vx≠0）滚动摩擦
 *  vx×0.97（<0.01 归零）；重力 vy+=0.2；rotation += vx×0.1
 *  粘性（proj 53，tileCollide=false，cs:23245-23296）：与实心块重叠 → velocity=(0,-0.2)
 *  抵消重力 → 停在原位粘住
 *  妖精（proj 870）：首次碰墙全反射 → aiStyle 170（cs:42997-43053）：半径 10 实心排斥
 *  场（速度>1 时每 10 tick 重算）+ 速度 ×0.95 衰减、<1 归零
 *  碰撞反弹表（cs:18261-18333，碰墙后）：
 *    50      X→-0.2×；Y（lastV>1.5）→-0.2×
 *    ≥1089   彩虹：X→-0.99×（|Δ|<1 → ±1）；Y→-0.99×（0<lastV<1 → -1）——近似永动
 *    其余    473/515：X→-0.5×；Y（lastV>1）→-0.5×
 *  寿命：timeLeft×5（=9000，cs:1075）；矿工 473 ×2（=3600）。到期消失无掉落 */
export class GlowstickProj extends Entity {
  w: number; h: number;
  vx: number;
  vy: number;
  projId: number;
  dead = false;
  /** 原版 timeLeft（proj 50/53/515/870/1089 = 9000；473 = 3600） */
  timeLeft: number;
  private ai0 = 0;
  private rot = 0;
  /** 妖精阶段（870 反弹后） */
  private fairy = false;
  private fairyT = 0;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.w = projId === 473 ? 8 : 6;
    this.h = this.w;
    this.timeLeft = projId === 473 ? 3600 : 9000;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 原版投射物绘制尺寸 = 贴图原生尺寸 × scale（碰撞盒 6×6 与绘制解耦）——
    // 50/53/515/1089 贴图是 22×6 横条（此前按碰撞盒 6px 画成 1.6px 细丝）；
    // 870 妖精 = 18×96 纵条 6 帧（帧进 5t）；473 = 18×18 单帧
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img && (img.width > 0) && img.width > 0) {
      if (this.projId === 870) {
        const fr = Math.floor(this.fairyT / 5) % 6;
        ctx.drawImage(img, 0, fr * 16, 18, 16, -9, -8, 18, 16);
      } else {
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
    } else {
      ctx.fillStyle = '#7FE8A8';
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.timeLeft <= 0) { this.dead = true; return; }
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (this.fairy) {
      // AI_170_FairyGlowstick（cs:42997-43053）：排斥场 + 衰减
      this.fairyT++;
      if (this.fairyT % 10 === 0 && Math.hypot(this.vx, this.vy) > 1) {
        const ptx = Math.floor((this.x + this.w / 2) / TILE), pty = Math.floor((this.y + this.h / 2) / TILE);
        let zx = 0, zy = 0, n = 0;
        for (let i = ptx - 10; i <= ptx + 10; i++) {
          for (let j = pty - 10; j <= pty + 10; j++) {
            if (!st.inBounds(i, j) || !st.isSolid(i, j)) continue;
            const dx = ptx - i, dy = pty - j;
            const len = Math.hypot(dx, dy) || 1;
            const f = Math.max(10 - len, 0) / len * 3;
            zx += dx * f; zy += dy * f; n++;
          }
        }
        if (n > 0) { zx /= n; zy /= n; }
        if (Math.hypot(zx, zy) > 1) { this.vx = zx; this.vy = zy; }
      }
      this.vx *= 0.95; this.vy *= 0.95;
      if (Math.hypot(this.vx, this.vy) < 1) { this.vx = 0; this.vy = 0; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // AI_014 主体
    this.ai0++;
    if (this.ai0 > 5) {
      this.ai0 = 5;
      // 着地判定用上一帧 vy 是否未变（原版 velocity.Y == 0 即已落地）——落地格 vy 被置 0
      if (this.vy === 0 && this.vx !== 0) {
        this.vx *= 0.97;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
      }
      this.vy += 0.2;
    }
    this.rot += this.vx * 0.1;
    // 粘性（53）：tileCollide=false，与实心重叠 → 粘住
    if (this.projId === 53) {
      const overlap = solidAt(this.x + this.w / 2, this.y + this.h / 2)
        || solidAt(this.x + 1, this.y + 1) || solidAt(this.x + this.w - 2, this.y + this.h - 2);
      if (overlap) { this.vx = 0; this.vy = -0.2; return; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // 移动 + 碰撞反弹（反弹表 cs:18261-18333）
    const lastVx = this.vx, lastVy = this.vy;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    let hitX = false, hitY = false;
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, this.y + 1)) { hitX = true; nx = this.x; }
    if (solidAt(nx + this.w / 2, ny + this.h) || solidAt(nx + 1, ny + this.h) || solidAt(nx + this.w - 1, ny + this.h)) { hitY = true; ny = this.y; }
    if (hitX || hitY) {
      if (this.projId === 870) {
        // 妖精首次反弹：全反射进入 170 阶段（cs:18270-18276）
        this.vx = -lastVx; this.vy = -lastVy;
        this.fairy = true;
        this.fairyT = 0;
        this.rot = 0;
        return;
      }
      if (this.projId === 50) {
        if (hitX) this.vx = lastVx * -0.2;
        if (hitY) this.vy = lastVy > 1.5 ? lastVy * -0.2 : 0;
      } else if (this.projId >= 1089) {
        // 彩虹：近全反射、最低 ±1 保底（cs:18279-18299）
        if (hitX) this.vx = Math.abs(this.vx - lastVx) < 1 ? (lastVx < 0 ? -1 : 1) : -lastVx * 0.99;
        if (hitY) this.vy = -lastVy * 0.99;
      } else {
        // 473 矿工 / 515 弹力（默认档，cs:18314-18327）
        if (hitX) this.vx = lastVx * -0.5;
        if (hitY) this.vy = lastVy > 1 ? lastVy * -0.5 : 0;
      }
    }
    this.x = nx; this.y = ny;
  }
}

// ================= 净化粉/邪恶粉云（proj 10/11/463，aiStyle 6，cs:22399-22533） =================

/** 粉末云 1:1（SetDefaults cs:637-662：64×64 命中盒、tileCollide=false、penetrate=-1、
 *  alpha=255 本体不可见——视觉全靠尘粒；AI_006 cs:22399-22533：速度 ×0.95 衰减、
 *  寿命 180 tick、首 tick 30 粒尘、每 tick 命中盒内逐格 Convert + Damage_TryUsingPowders
 *  （:13646）NPC 转化。tile/NPC 实效经 GameHooks.applyPowder 回调——实体层不触
 *  World/实体桶，与 cutTile/breakTile 同构） */
export class PowderProj extends Entity {
  w = 64; h = 64;
  projId: number;
  dead = false;
  private t = 0;
  private dusted = false;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
  }

  draw(): void { /* 原版 alpha=255：本体不绘制（cs:643），尘粒即全部视觉 */ }

  fixedUpdate(_dt: number, game: GameHooks): void {
    this.t++;
    if (this.t >= 180) { this.dead = true; return; } // ai[0]==180 → Kill（cs:22406）
    this.vx *= 0.95; this.vy *= 0.95;                // cs:22403
    this.x += this.vx;
    this.y += this.vy;
    if (!this.dusted) {
      // 首帧尘团（cs:22411-22452：30 粒，dust = 10+type → 净化 20 / 邪恶 21 / 猩红 231）
      this.dusted = true;
      const color = this.projId === 10 ? '#DCE8E2' : this.projId === 11 ? '#B070D0' : '#D06070';
      game.spawnParticles(this.cx, this.cy, color, 30, 1.6, { life: 45, damp: 0.94, size: 2 });
    }
    game.applyPowder?.(this.projId, this.x, this.y, this.w, this.h);
  }
}

// ================= Torch God 火把弹幕（proj 949，AI_184 cs:40100） =================

/** 直线飞行火把：射程(rangePx)耗尽前穿墙，之后撞块即毁；命中玩家 40×难度曲线伤。
 *  ai0=尘色/ai1=射程——尘迹省略（粒子钩子未接），伤害/碰撞 1:1 */
export class TorchGodProj extends Entity {
  private sndT = 0;   // localAI[0] 首帧音哨兵
  w = 4; h = 4;
  vx: number; vy: number;
  projId = 949;
  dead = false;
  private rangeLeft: number;
  private tileCollide = false;
  /** ai[0]：TorchID.Dust[被熄火把样式]（:17757/:40104 尾迹+爆尘取色） */
  dustType = 6;
  /** 尘回调（Game.torchGodDust——尾迹/Kill 爆尘共用,velMul 由调用方给） */
  private readonly dust?: (x: number, y: number, type: number, velMul: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, rangePx: number,
    dustType = 6,
    dust?: (x: number, y: number, type: number, velMul: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.rangeLeft = rangePx;
    this.dustType = dustType;
    this.dust = dust;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 949, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#FFB060');
  }

  /** Kill（:67632-67652）：Item10 音 + 20 粒 ai[0] 尘（vel×0.8、Next(3)!=0→noGravity） */
  private kill(game: GameHooks): void {
    game.playSfxWav?.('Item_10', 1, this.cx, this.cy);
    for (let k = 0; k < 20; k++) this.dust?.(this.x, this.y, this.dustType, 0.8);
    this.dead = true;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // 首帧 Item8 音（AI_184 :40109-40111 localAI[0]==0——事件全程连射的本族主声,终审补）
    if (!this.sndT) { this.sndT = 1; game.playSfxWav?.('Item_8', 1, this.cx, this.cy); }
    // ai[1] -= velocity.Length()（:40112-40119）：射程内 tileCollide=false
    this.rangeLeft -= Math.hypot(this.vx, this.vy);
    if (this.rangeLeft <= 0) this.tileCollide = true;
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (this.tileCollide) {
      const tx = Math.floor((nx + this.w / 2) / TILE), ty = Math.floor((ny + this.h / 2) / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.kill(game); return; }
    }
    // 尾迹（AI_184 :40120-40130）：每 AI 4 粒,沿 velocity/4×k 段布点,vel×0.3
    for (let k = 0; k < 4; k++) {
      this.dust?.(this.x + (this.vx / 4) * k, this.y + (this.vy / 4) * k, this.dustType, 0.3);
    }
    // 命中玩家（无敌帧由 Player.damage 侧处理）。死亡归因 = ByProjectile
    // （Projectile.Damage→Hurt 同源弹型名;此前漏设→死因残留旧值）。
    // 1457 :43575-43578（1456 :40100-40107 owner=255/damage=0 假伤）:改
    // owner==myPlayer && !unlockedBiomeTorches → SelfHurtPlayers() 真伤;
    // SetDefaults 去 hostile（:8950）。本仓 unlockedBiomeTorches（火把神图腾
    // 解锁位）未登记 → 恒未解锁 = 恒真伤（与 1456 假伤 0 的差异即本批修正点）
    const p = game.player;
    if (!game.world.flags.unlockedBiomeTorches
      && nx < p.x + p.w && nx + this.w > p.x && ny < p.y + p.h && ny + this.h > p.y) {
      p.lastDamageCause = {
        kind: 'projectile',
        name: game.projectileName?.(this.projId) ?? '弹幕',
      };
      // 1457 :18000：`damage = (int)(40f × HostileProjectileDamageMultiplier.Sample(
      // Main.Difficulty))`——经典 40/专家 80(×2)/大师 120(×3)（GameDifficultyData.cs:67
      // 曲线斜率 1;D-❌④ 2026-08-21 接线,曾恒 20。★V5 复核勘误:旧注释"×1.5/×2"系
      // 乘区口径错,Sample 曲线 Journey0.5→Master3）。原版在生成掷处算定,命中时算等价
      p.damage(hostileProjectileDamage(40, mainDifficulty(game.world)),
        Math.sign(p.cx - (nx + this.w / 2)) || 1, 0, game as never);
      this.kill(game);
      return;
    }
    this.x = nx; this.y = ny;
  }
}

// ================= 火把神祝福转换弹 1084（aiStyle 202，AI_202_TorchGodHelper :37557-37596） =================

/**
 * proj 1084 TorchGodHelper（SetDefaults Projectile.cs:9831-9839：4×4 aiStyle202
 * penetrate−1 tileCollide=false extraUpdates=2 timeLeft=300）——火把神药水 5573 的
 * buff 376 效果端（Player.TorchGodsFlavor :39529 每 tick 1/10 扫屏）发射的转换弹：
 * 飞向异群系群系炬（ai[1]=tx/ai[2]=ty，ai[0]=目标样式），抵达 16px 内 → tile 4 的
 * frameY = style×22（:37566-37571）+ Kill。首帧 Item8 音（:37573-37576）、尾迹每
 * AI 次 4 粒 TorchID.Dust[style]（:37578-37594）、Kill 时 Item10 + 40 粒同尘
 * （:67610-67630）。extraUpdates=2 = 每 tick 移动+AI 3 次（属性定义 :338-348）。
 */
export class TorchGodHelperProj extends Entity {
  readonly projId = 1084;
  dead = false;
  w = 4; h = 4;                                   // :9834-9835
  vx: number; vy: number;
  x: number; y: number;
  private sndT = 0;                               // localAI[0] 首帧音哨兵（:37573）
  private static readonly RUNS = 3;               // extraUpdates=2 → 1+2 次/tick
  constructor(
    x: number, y: number, vx: number, vy: number,
    /** ai[0]：目标火把样式（frameY = style×22，:37568） */
    readonly style: number,
    /** ai[1]/ai[2]：目标 tile 坐标（:37558-37559） */
    readonly tx: number, readonly ty: number,
    /** 转换回调（Game 侧：tile 4 校验 + frameY 直写 + 脏标记） */
    private readonly convert: (tx: number, ty: number, style: number) => void,
    /** 尘回调（Game 侧：NewDust(4×4,alpha100) 后 velocity×velMul/scale×1.1/
     *  noLightEmittance——尾迹 0.3（:37586-37590）、Kill 爆 2.5（:67619）。
     *  fullBright 位本仓 VDust 无,登记视觉微差） */
    private readonly dust: (x: number, y: number, type: number, velMul: number) => void,
  ) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 1084, Math.atan2(this.vy, this.vx), '#FFD890');
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const dustId = TORCH_DUST_BY_STYLE[this.style] ?? 6;
    for (let run = 0; run < TorchGodHelperProj.RUNS; run++) {
      const tpx = this.tx * 16 + 8, tpy = this.ty * 16 + 8;   // ToWorldCoordinates（:37560）
      // 抵达 16px 内 → 吸附 + 转换 + Kill（:37562-37572）
      if (Math.hypot(tpx - (this.x + this.w / 2), tpy - (this.y + this.h / 2)) < 16) {
        this.x = tpx - this.w / 2; this.y = tpy - this.h / 2;
        this.vx = 0; this.vy = 0;
        this.convert(this.tx, this.ty, this.style);
        this.dead = true;
        game.playSfxWav?.('Item_10', 1, this.cx, this.cy);   // Kill 音（:67611）
        for (let i = 0; i < 40; i++) {                        // :67613-67630 num14=40
          this.dust(this.x, this.y, dustId, 2.5);
        }
        return;
      }
      // 尾迹：每 AI 次 4 粒沿速度路径采样（:37578-37594 num4=4，position+velocity/4×num5；
      // 尘速 = NewDust 抖动 ×0.3——非弹速,原版 NewDust 传 0 速）
      for (let d = 0; d < 4; d++) {
        this.dust(this.x + (this.vx / 4) * d, this.y + (this.vy / 4) * d, dustId, 0.3);
      }
      this.x += this.vx; this.y += this.vy;   // tileCollide=false 直线（:9837）
    }
    // 首帧 Item8 音（:37573-37576 localAI[0]==0）
    if (!this.sndT) { this.sndT = 1; game.playSfxWav?.('Item_8', 1, this.cx, this.cy); }
  }
}

// ================= 太阳耀斑 636（aiStyle 113，AI_113_TargetSticker :38138-38477） =================

/**
 * proj 636（SetDefaults :6559-6570：16×16 aiStyle113 friendly melee penetrate−1
 * alpha255 MaxUpdates=2）——Daybreak 长矛 3543 直射（Item.cs:31847-31860 shoot=636）。
 * 标枪族双相：飞行（ai[0]==0，:38166-38248：45 AI 次后缓坠 636 档 vx×0.995/vy+0.15，
 * rotation=atan2+π/2）→ 命中即附着（:12421-12428 ai[0]=1、ai[1]=victim、
 * velocity=(敌心−弹心)×0.75 冻结为悬挂偏移）→ 附着段（:38242-38367：Center=
 * 敌心−velocity×2 跟随，60×num11=600 AI 次（num11=5×MaxUpdates=10,:38249-38253）
 * = 300t/5s 后消亡，目标失效同灭）。Daybreak(189) 层数 = 场上附着数（NPC.cs
 * :92807-92830 num8×100 HP/s，零层兜底 1），上限 8/敌（KillOldestJavelin
 * :13019-13030/:13995-14020，_javelinsMax8）。
 */
const STUCK_FLARES = new Map<number, DaybreakFlare[]>();

/** Daybreak(189) 层数查询（NPC.cs:92813-92825 的 active&&type==636&&ai[0]==1&&
 *  ai[1]==whoAmI 扫描等价）。键 = Enemy.id（EntityManager 槽位，与 hitCd 同空间）；
 *  零层兜底 num8==0→1（:92822-92825）由消费方 max(1,·) 承担 */
export function daybreakStacks(enemyId: number): number {
  const arr = STUCK_FLARES.get(enemyId);
  if (!arr) return 0;
  // 惰性清尸：EntityManager.clear()（world unload）不走 destroy()，死弹残条目
  // 不计层——防跨世界 id 复用时的幽灵层数
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].dead) arr.splice(i, 1);
    else n++;
  }
  if (!arr.length) STUCK_FLARES.delete(enemyId);
  return n;
}

export class DaybreakFlare extends Entity {
  readonly projId = 636;
  damage: number;
  knockback: number;
  /** 暴击总概率（Game 侧注入，同挥砍弧口径） */
  critChance = 0.04;
  /** 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系标记（SetDefaults melee=true :6565；浸剂链未接，登记偏差） */
  meleeProj = true;
  dead = false;
  w = 16; h = 16;                        // :6561-6562
  /** 弹体点光（:38472-38474 恒亮 0.8/0.7/0.4，飞行/附着两相都加） */
  lightRGB: [number, number, number] | null = [0.8, 0.7, 0.4];
  /** MaxUpdates=2（:6569 → extraUpdates=1，属性定义 :338-348）= 每 tick AI+移动 2 次。
   *  vanilla-projectiles.json 未提取该字段，按源码常量 */
  private static readonly RUNS = 2;
  /** ai[0]：0 飞行 / 1 附着（:38242 分相 / :12423 置 1） */
  private ai0 = 0;
  /** ai[1]：飞行 = AI 次计数（:38170）/ 附着 = 目标 Enemy.id（:12424/:38287） */
  private ai1 = 0;
  /** localAI[0]：附着段 AI 次计数（:38278） */
  private localT = 0;
  /** alpha 淡入（:38139-38146，636 档 25/AI 次 → 约 5t 全显） */
  private alphaI = 255;
  private rot = 0;
  /** timeLeft（SetDefaults 缺省 3600，:526；KillOldestJavelin 的"最老"序据） */
  private timeLeft = 3600;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.damage = damage; this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // extraUpdates=1：AI+移动每 tick 跑 2 次（Update :15336-15339 while 语义同 Boomerang）
    for (let i = 0; i < DaybreakFlare.RUNS && !this.dead; i++) this.step(game);
  }

  /** 单次 AI 迭代（AI_113_TargetSticker 一次） */
  private step(game: GameHooks): void {
    if (--this.timeLeft <= 0) { this.killNow(game); return; }
    if (this.alphaI > 0) this.alphaI = Math.max(0, this.alphaI - 25);   // :38139-38146
    if (this.ai0 === 0) {
      // ---- 飞行相（:38166-38248）----
      this.ai1 += 1;                       // :38170
      if (this.ai1 >= 45) {                // :38173-38174 起 45 AI 次门
        this.vx *= 0.995;                  // :38196-38202（636 档 0.995/0.15）
        this.vy += 0.15;
      }
      this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;            // :38244-38248
    } else {
      // ---- 附着相（:38242-38367）----
      this.localT += 1;                    // :38278
      if (this.localT >= 600) { this.killNow(game); return; }  // :38329-38332（60×num11）
      const t = this.findTarget(game);     // :38287 num12 = (int)ai[1]
      if (!t) { this.killNow(game); return; }  // :38333-38336/:38346-38349 目标失效
      this.x = (t as { cx: number }).cx - this.vx * 2 - this.w / 2;     // :38338-38339
      this.y = (t as { cy: number }).cy - this.vy * 2 - this.h / 2;
      if (this.localT % 30 === 0) {        // :38279-38282/:38341-38344 HitEffect 近似
        game.spawnParticles(this.cx, this.cy, '#FFB040', 2, 1.2, { life: 14 });
      }
      return;                              // tileCollide=false（:38248）且不再位移/命中
    }
    this.moveStep(game);
    if (this.dead) return;
    this.hitStep(game);                    // 附着后 Damage_CanDealDamage=false（:11782）
  }

  /** 飞行位移 + 撞块即毁（标枪族无反弹分支，Arrow 同口径） */
  private moveStep(game: GameHooks): void {
    this.x += this.vx; this.y += this.vy;
    const st = game.world.store;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!st.inBounds(tx, ty)) { this.killNow(game); return; }
    game.cutTile(tx, ty);
    if (st.get(tx, ty) !== 0 && st.isSolid(tx, ty)) this.killNow(game);
  }

  /** 首击结算：伤害 + AddBuff(189,300) + 附着 + 上限 8 淘汰（单目标即止） */
  private hitStep(game: GameHooks): void {
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; cx?: number; cy?: number; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean };
      if (e.dead) continue;
      // :14520-14523 大型目标命中盒各边内缩 1/8（636 专属——大 Boss 须命中内圈才附着）
      const sx = e.w > 8 && e.h > 8 ? Math.floor(e.w / 8) : 0;
      const sy = e.w > 8 && e.h > 8 ? Math.floor(e.h / 8) : 0;
      const rx = e.x + sx, rw = e.w - sx * 2, ry = e.y + sy, rh = e.h - sy * 2;
      if (!(this.x < rx + rw && this.x + this.w > rx && this.y < ry + rh && this.y + this.h > ry)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      e.hurt(dmg, (Math.sign(this.vx) || 1) * this.knockback, 0, game, this.armorPen, crit);
      applyProjStatus(this.projId, e as unknown as Record<string, number>);   // :10691-10693
      // ---- 附着（:12421-12428）----
      this.ai0 = 1;
      this.ai1 = e.id;
      const ecx = e.cx ?? e.x + e.w / 2, ecy = e.cy ?? e.y + e.h / 2;
      this.vx = (ecx - this.cx) * 0.75;    // 冻结为悬挂偏移（附着段 Center=敌心−v×2）
      this.vy = (ecy - this.cy) * 0.75;
      const arr = STUCK_FLARES.get(e.id);
      if (arr) arr.push(this); else STUCK_FLARES.set(e.id, [this]);
      this.killOldest(game);               // :13019-13030（上限 8,_javelinsMax8 :272）
      return;
    }
  }

  private findTarget(game: GameHooks): unknown | null {
    for (const ent of game.enemies()) {
      const e = ent as unknown as { id: number; dead: boolean };
      if (!e.dead && e.id === this.ai1) return ent;
    }
    return null;
  }

  /** KillOldestJavelin（:13995-14020）：除自己外凑满 8 枚附着 → 灭 timeLeft 最老者 */
  private killOldest(game: GameHooks): void {
    const arr = STUCK_FLARES.get(this.ai1);
    if (!arr) return;
    let oldest: DaybreakFlare | null = null;
    let n = 0;
    for (const f of arr) {
      if (f === this || f.dead) continue;
      n++;
      if (!oldest || f.timeLeft < oldest.timeLeft) oldest = f;
    }
    if (n >= 8 && oldest) oldest.killNow(game);
  }

  private killNow(game: GameHooks): void {
    if (this.dead) return;
    this.detach();
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
    // Kill 尘爆近似（:68886-68897）；伴生 953 DaybreakExplosion 未实装——登记偏差
    game.spawnParticles(this.cx, this.cy, '#FFB040', 4, 1.6, { life: 16 });
  }

  /** EntityManager 剔除兜底（world unload/测试直弃时摘层数） */
  destroy(): void { this.detach(); }

  private detach(): void {
    if (this.ai0 !== 1) return;
    const arr = STUCK_FLARES.get(this.ai1);
    if (!arr) return;
    const i = arr.indexOf(this);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) STUCK_FLARES.delete(this.ai1);
  }

  draw(r: Renderer, cam: Camera): void {
    // alpha 淡入（:38139-38146，SetDefaults alpha=255 起步）
    drawProj(r, cam, this, 636, this.rot, '#FFB040', 1 - this.alphaI / 255);
  }
}
