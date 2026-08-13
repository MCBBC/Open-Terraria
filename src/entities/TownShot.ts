// 城镇 NPC 自卫攻击的友方弹(NPC.cs AI_007 攻击态发射,Projectile.npcProj 语义):
// 物理 = 箭族近似(重力 0.3/tick,Projectile.cs aiStyle 1/2 同值),只伤敌怪不伤玩家
// (friendly 弹对玩家免疫;原版对城镇 NPC 免疫由 npcProj 标记,本仓为唯一玩家恒免疫)。
// 贴图 = Projectile_{id}.png 懒加载(Arrow.projSprite 共享缓存)。
//
// 绘制尺寸 = 贴图原生帧 × SetDefaults scale(与判定盒 w/h 解耦,G11 对账):
// 589/590 是【横向多列条】(Main.cs:33235/:33241 Frame(cols,1)),585/880 是竖排
// 多帧行——projFrameImg 只切竖排,横向条在本地切。旋转模式逐款见 TOWN_DRAW_SPEC。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite, projFrameCount } from './Arrow';
import { projOverlap, playEnemyHitSound } from './projTargets';
import { projectileData } from '../data/vanillaProjectiles';

const GRAV = 0.3; // 箭族重力(aiStyle 1/2 同值)

/** 旋转模式(原版 rotation 赋值散在各 AI,逐款对账 Terarria1456) */
export type TownRotMode =
  | 'up'             // atan2(vy,vx)+π/2——AI_001 尾默认(:54868)
  | 'up20'           // aiStyle 2:前 20t +π/2 姿态锁(:21970-21975),之后翻滚(:21517)
  | 'tumble'         // aiStyle 2:自出生翻滚累积 rotation += (|vx|+|vy|)*0.03*dir(:21517)
  | 'roll'           // rotation += vx*0.1(aiStyle 16 尾 :44909-44915;高尔夫 AI_149 近似)
  | 'spin'           // 恒速自旋(582 :32893 π/10;669 aiStyle 68 :29047 0.25)
  | 'mirror-right'   // AI_001 MIRROR 分支(:54715 585):ToRotation + 向左水平镜像
  | 'up-mirror'      // AI_016 镜像支(:44844-44849 930):+π/2 角 + 向左水平镜像
  | 'upright'        // AI 从不赋 rotation → 恒 0(15/590/950/24 等)
  | 'upright-mirror' // 恒 0 + 向左镜像(AI_183 :40418-40429 880)
  | 'grow';          // 586 AI_111_DryadsWard(:38728-38733):scale=age/100 钳 1 + 慢旋 π/300

export interface TownDrawSpec {
  rot: TownRotMode;
  /** 横向多列条列数(589=5/:33235、590=6/:33241);0 = 竖排 projFrames 或单帧 */
  cols: number;
  /** spin 模式角速度/tick */
  spinRate: number;
}

/** 逐款绘制规格(行号 = Terarria1456 源码锚)。
 *  帧源:585 恒帧 0(AI_001 不推帧)/880 每 tick +1 钳末帧(AI_183 :40427-40430)/
 *  589 列 = ai[1](出生 rand5,NPC.cs:54953)/590 列 = ai[2] 基组 + age/4 三帧循环
 *  (AI_112 :33025-33038)/其余单帧。 */
const TOWN_DRAW_SPEC: Record<number, TownDrawSpec> = {
  1:   { rot: 'up', cols: 0, spinRate: 0 },             // 木箭(aiStyle 1)
  2:   { rot: 'up', cols: 0, spinRate: 0 },             // 火焰箭
  14:  { rot: 'up', cols: 0, spinRate: 0 },             // 子弹(2×20 曳光 ×1.2)
  606: { rot: 'up', cols: 0, spinRate: 0 },             // Scutlix 眼激光(坐骑)
  587: { rot: 'up', cols: 0, spinRate: 0 },
  242: { rot: 'up', cols: 0, spinRate: 0 },
  267: { rot: 'up', cols: 0, spinRate: 0 },
  357: { rot: 'up', cols: 0, spinRate: 0 },             // 1×1 贴图(曳光近隐形)
  48:  { rot: 'up20', cols: 0, spinRate: 0 },           // aiStyle 2 姿态锁族
  520: { rot: 'up20', cols: 0, spinRate: 0 },
  21:  { rot: 'tumble', cols: 0, spinRate: 0 },         // aiStyle 2 翻滚族
  162: { rot: 'tumble', cols: 0, spinRate: 0 },
  583: { rot: 'tumble', cols: 0, spinRate: 0 },
  589: { rot: 'tumble', cols: 5, spinRate: 0 },         // 100×28 五列条(NPC.cs:54953 rand5)
  30:  { rot: 'roll', cols: 0, spinRate: 0 },           // aiStyle 16 尾 :44913 滚动
  588: { rot: 'roll', cols: 0, spinRate: 0 },
  133: { rot: 'roll', cols: 0, spinRate: 0 },           // :44905 排除表外 → 同滚动尾
  135: { rot: 'roll', cols: 0, spinRate: 0 },
  930: { rot: 'up-mirror', cols: 0, spinRate: 0 },      // Santank 炮击(坐骑):AI_016 镜像支 :44844-44849
  721: { rot: 'roll', cols: 0, spinRate: 0 },           // AI_149 高尔夫(GolfHelper 步进近似)
  134: { rot: 'up', cols: 0, spinRate: 0 },             // :44851 velocity≠0 → +π/2
  24:  { rot: 'upright', cols: 0, spinRate: 0 },        // aiStyle 14 不赋 rotation
  15:  { rot: 'upright', cols: 0, spinRate: 0 },        // aiStyle 8 不赋 rotation
  585: { rot: 'mirror-right', cols: 0, spinRate: 0 },   // :54715 MIRROR 分支(28×112 四帧行,帧恒 0)
  582: { rot: 'spin', cols: 0, spinRate: Math.PI / 10 },// aiStyle 109 尾 :32893
  669: { rot: 'spin', cols: 0, spinRate: 0.25 },        // aiStyle 68 :29047
  880: { rot: 'upright-mirror', cols: 0, spinRate: 0 }, // AI_183 :40418-40430(34×256 八帧行)
  590: { rot: 'upright', cols: 6, spinRate: 0 },        // 96×20 六列条(AI_112 不赋 rotation)
  950: { rot: 'upright', cols: 0, spinRate: 0 },        // AI_186(rotation 0;四层脉冲叠画未接,登记)
  586: { rot: 'grow', cols: 0, spinRate: 0 },           // 24×80 竖条 + 生长
};

/** 纯函数:弹型 → 绘制规格(未列入走 AI_001 默认 +π/2) */
export function townDrawSpec(projId: number): TownDrawSpec {
  return TOWN_DRAW_SPEC[projId] ?? { rot: 'up', cols: 0, spinRate: 0 };
}

/** 纯函数:帧号(竖排行 idx / 横向列 idx 通用)。age 由 life 差值推导(MountShot 不走
 *  super.fixedUpdate,故不依赖自维护计数)。 */
export function townFrameIndex(projId: number, age: number, ai1: number, ai2: number): number {
  switch (projId) {
    case 880: return Math.min(projFrameCount(880) - 1, Math.max(0, Math.floor(age)));  // AI_183 :40427 +1/t 钳末帧
    case 589: return Math.max(0, Math.min(4, Math.floor(ai1)));                        // ai[1]=rand5(NPC.cs:54953)
    case 590: {                                                                        // AI_112 :33025-33038
      const base = ai2 === 1 ? 3 : 0;
      return base + (Math.floor(age / 4) % 3);
    }
    default: return 0;                                                                 // 585/456 族 AI 不推帧
  }
}

/** 纯函数:当前旋转角(不含 mirror 的翻转位——翻转由 draw 侧按 vx 判) */
export function townRotation(mode: TownRotMode, vx: number, vy: number, rotAcc: number,
  age: number, spinRate: number): number {
  switch (mode) {
    case 'up': return Math.atan2(vy, vx) + Math.PI / 2;
    case 'up20': return age <= 20 ? Math.atan2(vy, vx) + Math.PI / 2 : rotAcc;
    case 'tumble': return rotAcc;
    case 'roll': return vx * 0.1;
    case 'spin': return rotAcc;
    case 'mirror-right': return Math.atan2(vy, vx) + (vx < 0 ? Math.PI : 0);
    case 'up-mirror': return Math.atan2(vy, vx) + Math.PI / 2;   // 930 :44846-44849 atan2(−vy,−vx)−π/2 ≡ 同角
    case 'upright':
    case 'upright-mirror': return 0;
    case 'grow': return age * (Math.PI / 300);
    default: return 0;
  }
}

export class TownShot extends Entity {
  w = 10; h = 10;
  vx: number; vy: number;
  damage: number;
  knockback: number;
  projId: number;
  life = 600;
  dead = false;
  /** 弹附加 ai 参数(124/142/227 等特化弹;本仓多数弹不消费,仅存档语义) */
  ai1 = 0; ai2 = 0;
  /** 588 弹体 timeLeft=480(:54922-54925) */
  private lifeOverride?: number;
  /** 绘制 scale(SetDefaults;绘制尺寸 = 贴图原生 × scale,与判定盒解耦) */
  drawScale = 1;
  /** 出世 life(MountShot 不调 super.fixedUpdate,age 用 life 差值推导) */
  private age0 = 600;
  /** 翻滚/自旋累积角(tumble/up20 后段/spin 模式) */
  rotAcc = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, projId: number,
    opts?: { ai1?: number; ai2?: number; life?: number; noGravity?: boolean }) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    if (opts) {
      if (opts.ai1 !== undefined) this.ai1 = opts.ai1;
      if (opts.ai2 !== undefined) this.ai2 = opts.ai2;
      if (opts.life !== undefined) this.lifeOverride = opts.life;
      if (opts.noGravity) this.noGrav = true;
    }
    const def = projectileData(projId);
    if (def) { this.w = def.width || 10; this.h = def.height || 10; }
    this.drawScale = def?.scale ?? 1;
    if (this.lifeOverride !== undefined) this.life = this.lifeOverride;
    this.age0 = this.life;
    // 589 五列变体:原版出生 ai[1]=rand5(NPC.cs:54953 末参),发射端未传时本地补
    if (projId === 589 && (opts?.ai1 === undefined)) this.ai1 = Math.floor(Math.random() * 5);
  }

  private noGrav = false;

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projSprite(this.projId);
    const spec = townDrawSpec(this.projId);
    const age = this.age0 - this.life;
    const fIdx = townFrameIndex(this.projId, age, this.ai1, this.ai2);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.imageSmoothingEnabled = false;
    const ang = townRotation(spec.rot, this.vx, this.vy, this.rotAcc, age, spec.spinRate);
    ctx.rotate(ang);
    // 水平镜像族:mirror-right(585 :54715)/up-mirror(930 :44844)/upright-mirror(880 AI_183)
    if ((spec.rot === 'mirror-right' || spec.rot === 'up-mirror' || spec.rot === 'upright-mirror')
      && this.vx < 0) ctx.scale(-1, 1);
    if (img && img.complete && img.naturalWidth > 0) {
      // 源切片直取(9 参 drawImage,不走 projFrameImg 的 document 依赖):
      // 横向条(589/590)切列 / 竖排行(585/880)切行 / 单帧整图(cols=0 勿除零)
      const cols = spec.cols;
      const rows = cols > 0 ? 1 : projFrameCount(this.projId);
      const cw = cols > 0 ? img.naturalWidth / cols : img.naturalWidth;
      const ch = cols > 0 ? img.naturalHeight : img.naturalHeight / rows;
      const sx = cols > 0 ? fIdx * cw : 0;
      const sy = cols > 0 ? 0 : fIdx * ch;
      // 原生帧尺寸 × SetDefaults scale(589 曾整条 100×28 压进 10×10、590 压成 14×2.9)
      const s = this.drawScale;
      // 586 净化脉冲:scale = age/100 钳 1(AI_111 :38729-38733)
      const gs = spec.rot === 'grow' ? Math.min(1, Math.max(0.02, age / 100)) : 1;
      const dw = cw * s * gs, dh = ch * s * gs;
      ctx.drawImage(img, sx, sy, cw, ch, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#D8C8A0';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    if (!this.noGrav) this.vy += GRAV;
    // 翻滚/自旋累积(aiStyle 2 :21517 / 自旋款)——up20 前 20t 由姿态锁覆盖
    const spec = townDrawSpec(this.projId);
    const age = this.age0 - this.life;
    if (spec.rot === 'tumble' || (spec.rot === 'up20' && age > 20)) {
      this.rotAcc += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx >= 0 ? 1 : -1);
    } else if (spec.rot === 'spin') {
      this.rotAcc += spec.spinRate;
    }
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || !projOverlap(this.x, this.y, this.w, this.h, e)) continue;
      if (e.hurt(this.damage, Math.sign(this.vx) * this.knockback, 0, game, 0, false, 0, false)) {
        playEnemyHitSound(game, e);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#FFD060');
      }
      this.dead = true; // 穿透 1(城镇自卫弹均为 penetrate 1 或 -1 特化弹,近似单发)
      return;
    }
  }
}
