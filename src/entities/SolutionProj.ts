// 环境转换器全族实体（Terarria1456 1:1，2026-08-20 批）：
//   ① SolutionProj —— 溶液喷射（aiStyle 31，Projectile.cs:25318-25419）：Clentaminator
//      779 / Terraformer(Clentaminator2) 5134 的溶液弹 145-149/1015-1017。每 AI
//      子步（extraUpdates=2 → 每 tick 3 子步）在弹心 WorldGen.Convert(conv, size)
//      （size=2；Terraformer ai[1]=1 → size 3），寿命恒钳 133 子步；本体不绘制
//      （SetDefaults alpha=255 + GetAlpha 缺省 → Color(0,0,0,0)，视觉全靠尘尾）。
//   ② WaterSplashProj —— 圣水/邪水/血水投掷瓶（proj 69/70/621，aiStyle 2 专属
//      物理 :21853-21859 + Kill :75011-75058/:75610-75625）：ai0≥10 后 vy+0.25/
//      vx×0.99（替代默认投掷档 0.4/0.97），翻滚旋转 (:21512-21516)，撞块/命中/
//      超时 Kill → 尘爆 + 音效13 + Convert(conv, 4)。伤害 20/击退 3/穿透 1。
//   弹心消耗链（PickAmmo 加法弹型 + 动画窗扣耗）见 solutionConsumesThisShot。
//   转换实效经 GameHooks.applySolution 回调走 WorldEvolution.convertArea
//  （与 PowderProj→Game.applyPowder 同构——实体不持 Evolution 引用）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { playerCanHitEnemy, playEnemyHitSound } from './projTargets';

/** 溶液弹型号表（AI_031 switch，cs:25321-25358）：projId → [conv, dust]。
 *  conv = BiomeConversionID（cs:25366 Convert 第二参）；dust = NewDust 型号 */
export const SPRAY_PROJ: Record<number, readonly [number, number]> = {
  145: [0, 110],   // PureSpray 绿溶液 → 纯净（default 分支）
  146: [2, 111],   // HallowSpray 蓝溶液 → 神圣
  147: [1, 112],   // CorruptSpray 紫溶液 → 腐化
  148: [3, 113],   // MushroomSpray 深蓝溶液 → 蘑菇
  149: [4, 114],   // CrimsonSpray 红溶液 → 猩红
  1015: [5, 311],  // SandSpray 黄溶液 → 沙漠（1.4.4）
  1016: [6, 312],  // SnowSpray 白溶液 → 雪原（1.4.4）
  1017: [7, 313],  // DirtSpray 棕溶液 → 森林（1.4.4）
};

export const SPRAY_PROJ_IDS = new Set(Object.keys(SPRAY_PROJ).map(Number));

/** 三瓶水 Kill 转换表（cs:75614-75624）：圣水 69 → 神圣 2 / 邪水 70 → 腐化 1 /
 *  血水 621 → 猩红 4（Convert 第 4 参 size=4） */
export const WATER_PROJ_CONV: Record<number, number> = { 69: 2, 70: 1, 621: 4 };

/** 溶液消耗门（Player.cs:52739/:52815 两处 flag2 合成）：返回 true = 本发扣 1。
 *  · :52739 Terraformer 5134 掷 Next(3)==0 → 免耗（1/3 免,flag2 语义）
 *  · :52815 (779||5134) && itemAnimation < itemAnimationMax - useTime → 免耗——
 *    useAnimation 30/useTime 5 下每轮 6 发仅前 2 发扣（swing.t 为剩余帧数，
 *    itemAnimation 等效 = dur - t）；首发（无 swing/异 item swing）恒扣 */
export function solutionConsumesThisShot(
  clentVid: number, useTime: number,
  swing: { item: number; t: number; dur: number } | null,
  heldItemId: number, rnd: () => number = Math.random,
): boolean {
  // Terraformer 免耗掷:Player.cs:52739-52742 `Next(3)==0 → flag2(免耗)`——1/3 免、
  // 2/3 扣耗(曾误抄姊妹行 3475/3540 的 `!= 0` 方向 → 消耗减半,复审 R1 P1)
  if (clentVid === 5134 && Math.floor(rnd() * 3) === 0) return false;
  if (swing && swing.item === heldItemId && swing.t < swing.dur - useTime) return false;
  return true;
}

/** 尘尾颜色兜底（game.spawnDust 缺省（无 VanillaDust 池的测试宿主）时近似）：
 *  原版尘型 110-114/311-313（Dust.png 格取色），此处取喷雾主色调 */
const SPRAY_FALLBACK_COLOR: Record<number, string> = {
  110: '#9BE89B', 111: '#9AC8F0', 112: '#A88FD0', 113: '#7BB0E8',
  114: '#E89BA6', 311: '#E8D89B', 312: '#E8F0F4', 313: '#B0895A',
};

/** 溶液喷射（AI_031）。convert 回调签名 = (convType, i, j, size)——Game 侧实现
 *  为 evolution.convertArea（WorldGen.Convert 尺寸重载 cs:55090-55109）。 */
export class SolutionProj extends Entity {
  w = 6; h = 6;
  override vx: number;
  override vy: number;
  projId: number;
  /** ai[1]==1（Terraformer 5134 发射：Player.cs:48504-48509）→ size 3 + 快尘 */
  private flag13: boolean;
  private convType: number;
  private dustType: number;
  /** ai[0]（尘渐显计数） */
  private ai0 = 0;
  /** timeLeft：AI 首步钳 133（cs:25367-25370），每子步 -1（Projectile.Update :15861） */
  private timeLeft = 1800;
  private rotation = 0;
  private direction = 1;
  private convert: (convType: number, i: number, j: number, size: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, projId: number,
    terraformer: boolean,
    convert: (convType: number, i: number, j: number, size: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.flag13 = terraformer;
    const t = SPRAY_PROJ[projId] ?? [0, 110];
    this.convType = t[0];
    this.dustType = t[1];
    this.convert = convert;
    this.direction = vx < 0 ? -1 : 1;
  }

  /** SetDefaults extraUpdates=2 → 每 tick AI/位移/寿命各跑 3 子步（cs:15331 模） */
  fixedUpdate(_dt: number, game: GameHooks): void {
    for (let sub = 0; sub < 3; sub++) this.step(game);
    if (this.timeLeft <= 0) this.dead = true;
  }

  private step(game: GameHooks): void {
    // cs:25359-25367：owner==myPlayer 时每子步弹心 Convert(conv, flag13?3:2)
    this.convert(this.convType, Math.floor(this.cx / TILE), Math.floor(this.cy / TILE),
      this.flag13 ? 3 : 2);
    // cs:25368-25370：寿命钳 133（后随子步递减）
    if (this.timeLeft > 133) this.timeLeft = 133;
    this.timeLeft--;
    // cs:25373-25415：尘渐显 ramp（num265=flag13?3:7；前 4 档 0.2/0.4/0.6/0.8；
    // flag13 再 ×1.2 + 外扩 12×num266）
    const gate = this.flag13 ? 3 : 7;
    if (this.ai0 > gate) {
      let ramp = 1;
      const d = this.ai0 - gate;
      if (d === 1) ramp = 0.2;
      else if (d === 2) ramp = 0.4;
      else if (d === 3) ramp = 0.6;
      else if (d === 4) ramp = 0.8;
      let grow = 0;
      if (this.flag13) { ramp *= 1.2; grow = Math.floor(12 * ramp); }
      const d1 = game.spawnDust?.(this.x - grow, this.y - grow,
        this.w + grow * 2, this.h + grow * 2, this.dustType,
        this.vx * 0.2, this.vy * 0.2, 100, null, 1, true);
      if (d1) {
        d1.scale *= 1.75;
        d1.vx *= 2;
        d1.vy *= 2;
        d1.scale *= ramp;
      } else {
        game.spawnParticles?.(this.cx, this.cy, SPRAY_FALLBACK_COLOR[this.dustType] ?? '#9BE89B',
          1, 0.8, { life: 30, damp: 0.95, size: 2 });
      }
    }
    this.ai0++;
    // cs:25417：rotation += 0.3 * direction
    this.rotation += 0.3 * this.direction;
    // 位移（tileCollide=false / ignoreWater / 无重力——直线）
    this.x += this.vx;
    this.y += this.vy;
  }

  /** 本体不绘制：SetDefaults alpha=255（:2071-2078）+ GetAlpha 缺省链
   *  （:76597-76612 num13=(255-255)/255=0 → Color(0,0,0,0)）——视觉全靠尘尾 */
  draw(): void { /* no-op（同 PowderProj） */ }
}

/** 三瓶水投掷瓶（aiStyle 2 专属分支 + Kill 链）。敌命中/撞块/超时皆走 splash
 *  （Kill 内 Convert 无条件运行——cs:75610-75625）。 */
export class WaterSplashProj extends Entity {
  w = 14; h = 14;
  override vx: number;
  override vy: number;
  projId: number;
  damage: number;
  knockback: number;
  critChance = 0;
  armorPen = 0;
  private ai0 = 0;
  private rotation = 0;
  private direction = 1;
  private convert: (convType: number, i: number, j: number, size: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, projId: number,
    damage: number, knockback: number,
    convert: (convType: number, i: number, j: number, size: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.damage = damage;
    this.knockback = knockback;
    this.convert = convert;
    this.direction = vx < 0 ? -1 : 1;
  }

  /** Kill（cs:75011-75058 + :75610-75625）：音效 13 + 5 尘(13) + 30 尘
   *  （33 圣/52 邪/266 血,初速 (0,-2)·α100·scale1.1·vx×1.5 后整体×3）+ Convert(·,4) */
  private splash(game: GameHooks): void {
    this.dead = true;
    const dust2 = this.projId === 69 ? 33 : this.projId === 70 ? 52 : 266;
    game.playSfxAt?.('splash', this.cx, this.cy);
    for (let i = 0; i < 5; i++) {
      game.spawnDust?.(this.x, this.y, this.w, this.h, 13);
    }
    for (let i = 0; i < 30; i++) {
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, dust2, 0, -2, 100, null, 1.1);
      if (d) { d.vx *= 1.5; d.vx *= 3; d.vy *= 3; }
    }
    if (!game.spawnDust) {
      const color = this.projId === 69 ? '#9AC8F0' : this.projId === 70 ? '#A88FD0' : '#D06070';
      game.spawnParticles(this.cx, this.cy, color, 30, 2.4, { life: 36, damp: 0.93, size: 3 });
    }
    // cs:75612-75613：弹心格（position+size/2）
    const i2 = Math.floor(this.cx / TILE), j2 = Math.floor(this.cy / TILE);
    this.convert(WATER_PROJ_CONV[this.projId] ?? 2, i2, j2, 4);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // cs:21512-21516：翻滚旋转（aiStyle 2 缺省档）
    this.rotation += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * this.direction;
    // cs:21853-21859：ai0 ≥10 → vy+0.25 / vx×0.99（替代默认 0.4/0.97 投掷档）
    this.ai0++;
    if (this.ai0 >= 10) {
      this.vy += 0.25;
      this.vx *= 0.99;
    }
    if (this.vy > 32) this.vy = 32;                 // :21970 终端（aiStyle 2 全体）
    let nx = this.x + this.vx, ny = this.y + this.vy;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    // 撞块即 Kill（tileCollide=true 缺省）
    if (solidAt(nx + this.w / 2, this.y + this.h / 2)
      || solidAt(this.x + this.w / 2, ny + this.h - 1)) {
      this.splash(game);
      return;
    }
    this.x = nx; this.y = ny;
    // 命中敌（friendly/penetrate 1 → 一击即 Kill）：Damage_CanDealDamage 对
    // aiStyle 2 无豁免（:11782 豁免表无此族），伤害/击退照常结算
    for (const ent of game.enemies()) {
      const e = ent as unknown as {
        x: number; y: number; w: number; h: number; dead: boolean;
        cx: number; cy: number;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number,
          crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean;
        def?: { hitSound?: string[] };
        vanillaId?: number | null;
        ai1?: number;
      };
      if (e.dead) continue;
      if (!playerCanHitEnemy(e, game, this.projId)) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        const crit = Math.random() < this.critChance;
        const dmg = crit ? this.damage * 2 : this.damage;
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game, this.armorPen, crit, 1, true);
        playEnemyHitSound(game, e);
        this.splash(game);
        return;
      }
    }
    // 超时兜底（timeLeft 缺省 3600——正常抛物线内必先撞块；仍照 Kill 链转换）
    if (this.ai0 > 3600) this.splash(game);
  }

  draw(r: Renderer, _cam: Camera): void {
    // aiStyle 2 缺省旋转绘制（本体旋转 = 翻滚角）；贴图 Projectile_69/70/621.png
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      ctx.fillStyle = this.projId === 69 ? '#9AC8F0' : this.projId === 70 ? '#A88FD0' : '#D06070';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}
