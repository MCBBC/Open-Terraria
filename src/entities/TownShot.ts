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
import { projOverlap } from './projTargets';
import { projectileData } from '../data/vanillaProjectiles';
import { BuffType } from '../stats/Buffs';
import { projectileWetSection, projWaterDragFactor, PROJ_DESTROYED_BY_WATER } from './projWetSection';
import { HitCdImpl } from './proj1457';                       // SW-BJ33 2026-09-08（无环:proj1457 不反向依赖本文件）
import { princessWeaponFx } from '../fx/orchestraFx';         // SW-BJ33 2026-09-08（Spawn_PrincessWeapon 1:1 站）

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
  /** life 缺省 = Projectile.SetDefaults 预置档 timeLeft=3600（Projectile.cs:789），
   *  构造器内按 vanilla-projectiles.json timeLeft 字段逐款覆写——★对抗修复批⑤
   *  A5（2026-09-01）：旧硬编码 600 与原版缺省相悖 */
  life = 3600;
  dead = false;
  /** 弹附加 ai 参数(124/142/227 等特化弹;本仓多数弹不消费,仅存档语义) */
  ai1 = 0; ai2 = 0;
  /** 发射级覆写(如 588·107 弹体 timeLeft=480,cs:55070-55077 两连支)——
   *  ★必须后于 json 默认赋值,与原版「SetDefaults 预置→类型支覆写→调用点
   *  .timeLeft=480」三层序同形 */
  private lifeOverride?: number;
  /** 绘制 scale(SetDefaults;绘制尺寸 = 贴图原生 × scale,与判定盒解耦) */
  drawScale = 1;
  /** 出世 life(MountShot 不调 super.fixedUpdate,age 用 life 差值推导) */
  private age0 = 600;
  /** 翻滚/自旋累积角(tumble/up20 后段/spin 模式) */
  rotAcc = 0;

  // ---- ★通用湿段(Projectile.cs:16895-17113 全体弹共用段;2026-09-06 杂项弹簇批)----
  //  域 id 全集 = TOWN_DRAW_SPEC 30 型(NPC.cs AI_007 自卫攻击 npcProj 语义)逐 id
  //  豁免核对(SetDefaults P.cs 逐块;projectileData 数据面同向)：
  //  · 豁免(ignoreWater=true,段门恒闭零行为)={606:6542, 242:3253, 590:6397,
  //    950:8966, 880:8447}——湿段调用照走,整段门分流(:16895;预置 :10886-10893
  //    无条件跑=共享体 2026-09-06 逐字面化批口径);
  //  · 受段=其余 25 型(15/24/585/589/582/669/930/1/2/14/48/21/162/583/30/588/
  //    133/135/721/134/587/267/357/520/586)——溅花+旗维护;
  //  · ★584 NurseSyringeShot（TownNPC.ts 子类,SetDefaults :6342-6350 无 ignoreWater
  //    → 同受段）不在 TOWN_DRAW_SPEC 域内但其 override fixedUpdate 全量自写【不调
  //    super】——基类本位湿段对其不生效,已在 override tick 头自接共享体+阻尼
  //    （2026-09-08 红队接入面 F2,锚注见彼字段块）,本基类位零改动;
  //  · 15 ∈ ProjectileID.Sets.IsDestroyedByWater({85,15,188,34,1097,1106},
  //    ProjectileID.cs:287)→ 湿段消亡面接 hooks.kill(:16923-16925 `wet && !lavaWet`
  //    → Kill;本仓=dead 置位,型专属 Kill 尘面本类既有口径不变——669 kill669 爆炸
  //    仍在自身杀位)。
  //  阻尼：tileCollide 缺省 true 的受段型 → HandleMovement :17721 湿支生效,乘进
  //  位移行(速度场不减);tileCollide=false 型(721 高尔夫/豁免 590/606/950/880)
  //  → 档位不消费(:17721 只在 tileCollide 支,与 Misc 簇 golf/钩爪同谳)。
  //  插位=tick 头：AI(重力/翻滚累积,只写 velocity/rotAcc) → 湿段 → 位移=原版
  //  Update 同序,采样位=上拍位移后 ≡ 原版湿段采样。杀拍口径(Arrow.ts ⑥配方逐位
  //  核)：杀位=寿命头杀(fixedUpdate 首行,669 同拍带 kill669 爆炸)/撞块杀/命中杀
  //  ——寿命杀在湿段【前】(vanilla timeLeft 杀在 Update 尾 :17307=湿段后),tick 头
  //  单调用点使杀拍湿段照跑;撞块/命中杀在位移【后】=湿段已跑。双调用点/防双跑机
  //  不适用(单调用点天然覆盖全部杀拍)。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗(Projectile.wetCount :16984 置 10 / :17109-17112 逐拍 −1) */
  wetCount = 0;
  /** 出生预置已做(一次;NewProjectile :10886-10893 等价;共享体首调自做) */
  presetDone = false;

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
    // ★对抗修复批⑤ A5：life 管线三层序——①SetDefaults 预置 3600（字段缺省,
    //   Projectile.cs:789）→②逐款 SetDefaults 覆写(json timeLeft:24→4800/
    //   590→900/950→180/1·2→1200/14·242·357→600,与反编译 Projectile.cs 各
    //   type 支双向核对一致;未设支走 3600 缺省)→③发射级覆写(588·107→480,
    //   cs:55070-55077,【后于默认】同形 SetDefaults 后 .timeLeft=480)
    // 核对记录(2026-09-01):json↔decompiled 双向抽查全数命中。
    this.life = def?.timeLeft ?? 3600;
    if (this.lifeOverride !== undefined) this.life = this.lifeOverride;
    this.age0 = this.life;
    // ★对抗修复批③ B-F10b：589 五列变体由发射端显式传 ai1（NPC.cs:55067 三元末支
    // 第 11 参 Next(5)；原 .ai1 未传时本地 Math.random() 补掷已删——构造器级直呼
    // 脱离实例注入面/确定性口径，且战斗路径全批禁 Math.random 直呼约定）。
    // 缺省 0（首列），显式传入语义收敛到唯一随机源 shootAt。
  }

  private noGrav = false;

  /** Projectile.Kill() case 669（Projectile.cs:68701-68737,酒馆老板 550 麦酒
   *  投掷弹的死亡爆炸）1:1：
   *  - 爆音 PlaySound(13)=Item_13（:68702）
   *  - 尘近似两档：白 12（α110 vel×1.5,:68706-68712）+ 金 noGravity 160
   *    （80 次循环每次两粒:scale1.2 vel×1.0-7.0 + scale0.8 vel×1.0-4.0,
   *    :68713-68723）
   *  - Resize(144,144) 中心不变（:68724）→ 判定框交叠玩家/城镇 NPC →
   *    AddBuff(25, 3659) Tipsy（:68726-68734;玩家走 BuffState.apply 秒制
   *    max 合并,城镇 NPC 走 applyTipsy 单槽——num2 进度链 ×1.1 的唯一入口）
   *  - Damage()（:68736）:144×144 内敌怪吃弹伤（伤害已在发射端过 num2×难度
   *    曲线;pierce 0 免疫帧拦同敌双吃 ≈ 原版 localNPCImmunity） */
  private kill669(game: GameHooks): void {
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    game.playSfxFiles(['Item_13'], 1, cx, cy);
    game.spawnParticles(cx, cy, 'rgba(255,255,255,0.43)', 12, 1.5, { grav: 0.003 });
    game.spawnParticles(cx, cy, 'rgba(245,200,30,0.61)', 80, 4, { grav: 0.0005 });
    game.spawnParticles(cx, cy, 'rgba(245,200,30,0.61)', 80, 2, { grav: 0.0005 });
    const ex = cx - 72, ey = cy - 72, ER = 144;                  // Resize(144,144)
    const p = game.player as unknown as {
      x: number; y: number; w: number; h: number; dead: boolean;
      buffs?: { apply(t: BuffType, sec: number): void };
    } | null;
    if (p && !p.dead && projOverlap(ex, ey, ER, ER, p)) {
      p.buffs?.apply(BuffType.Tipsy, 3659 / 60);                 // :68727-68730
    }
    // duck-type applyTipsy（不 import TownNPC——环导 + HMR fork instanceof 坑）
    for (const n of game.npcs?.() ?? []) {
      const tn = n as unknown as {
        x: number; y: number; w: number; h: number; dead: boolean;
        applyTipsy?: (t: number) => void;
      } | null;
      if (!tn || tn.dead || typeof tn.applyTipsy !== 'function') continue;
      if (projOverlap(ex, ey, ER, ER, tn)) tn.applyTipsy(3659);  // :68731-68734
    }
    for (const ent of game.enemies()) {                          // Damage() :68736
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[]; friendly?: boolean } };
      // friendly 弹 × friendly 目标 → Damage_PVE_Inner :11898 return（城镇自卫弹
      // 穿越睡渔夫 376 等友好 NPC 不误伤；城镇弹 type 恒非 318，无臭鸡蛋例外）
      if (e.dead || e.def?.friendly || !projOverlap(ex, ey, ER, ER, e)) continue;
      e.hurt(this.damage, Math.sign(this.vx) * this.knockback, 0, game, 0, false, 0, false);   // 音/飘值=单点
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
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
    if (img && (img.width > 0) && img.width > 0) {
      // 源切片直取(9 参 drawImage,不走 projFrameImg 的 document 依赖):
      // 横向条(589/590)切列 / 竖排行(585/880)切行 / 单帧整图(cols=0 勿除零)
      const cols = spec.cols;
      const rows = cols > 0 ? 1 : projFrameCount(this.projId);
      const cw = cols > 0 ? img.width / cols : img.width;
      const ch = cols > 0 ? img.height : img.height / rows;
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
    // ---- ★通用湿段（:16895-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    //  tick 头插位（杀拍覆盖/采样位论证见字段块头注）;15 水death 经 hooks.kill。
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater,
      PROJ_DESTROYED_BY_WATER.has(this.projId) ? { kill: () => { this.dead = true; } } : undefined);
    if (this.dead) return;   // 段内水death（15）——vanilla `!active` 门(:17132)截 Damage/位移同相
    if (--this.life <= 0) { if (this.projId === 669) this.kill669(game); this.dead = true; return; }
    if (!this.noGrav) this.vy += GRAV;
    // 翻滚/自旋累积(aiStyle 2 :21517 / 自旋款)——up20 前 20t 由姿态锁覆盖
    const spec = townDrawSpec(this.projId);
    const age = this.age0 - this.life;
    if (spec.rot === 'tumble' || (spec.rot === 'up20' && age > 20)) {
      this.rotAcc += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx >= 0 ? 1 : -1);
    } else if (spec.rot === 'spin') {
      this.rotAcc += spec.spinRate;
    }
    // 水中位移阻尼（HandleMovement :17721-17764 湿支只在 tileCollide 时进——
    // tileCollide=false 型（721/豁免 590·606·950·880）档位不消费,位移全速;
    // 受段型乘进位移行,速度场 vx/vy 不减）
    const df = projectileData(this.projId)?.tileCollide !== false ? projWaterDragFactor(this) : 1;
    this.x += this.vx * df;
    this.y += this.vy * df;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) {
      if (this.projId === 669) this.kill669(game);
      this.dead = true; return;
    }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[]; friendly?: boolean } };
      // friendly 弹 × friendly 目标 → Damage_PVE_Inner :11898 return（同 kill669 段）
      if (e.dead || e.def?.friendly || !projOverlap(this.x, this.y, this.w, this.h, e)) continue;
      e.hurt(this.damage, Math.sign(this.vx) * this.knockback, 0, game, 0, false, 0, false);   // 音/飘值=单点
      // ★对抗修复批⑤ A5 注释拨正（原注「均为 penetrate 1 或 -1」与反编译不符）：
      //   实际 per SetDefaults——585=584=3(Projectile.cs:6349/:6356)、48=2(:1318)、
      //   其余发射型多为 -1(133/134/135/590:2225-2254 族)或 1。本仓管线仍近似
      //   单杀即亡;多穿缺口【登记台账】不动码(penetrate 计数/localNPCImmunity
      //   未建——批⑤范围外,后续批次清偿)
      this.dead = true;
      if (this.projId === 669) this.kill669(game);  // Kill() 爆炸(同敌免疫帧拦双吃)
      return;
    }
  }
}
