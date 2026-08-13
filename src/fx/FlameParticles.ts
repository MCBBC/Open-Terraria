// 原版 FlameParticle（Terraria.Graphics.Renderers/FlameParticle.cs + ABasicParticle.cs）
// 1:1 承载——山羊坐骑（mount 47）地面冲刺火焰的本体层。
//
// 编排器 = ParticleOrchestrator.Spawn_WallOfFleshGoatMountFlames
//（Terarria1456/Terraria.GameContent.Drawing/ParticleOrchestrator.cs:3259-3306）：
//   for i ∈ {-1,0,1}（3 束）：
//     贴图   = NextFromList([326,327,328])（:3265——Projectile_326/327/328 三张小火苗）
//     num3   = rand×0.9+0.1（:3268 → scale 0.1-1.0）
//     出生   = PositionInWorld + (i×5.3333335, 0)（:3269）
//     初速   = Vector2.Zero（:3271 SetBasicInfo 第三参——火焰原地收缩，不位移）
//     TTL    = 50（:3261 num / :3272 SetTypeInfo 首参）
//     fade   = FadeOutNormalizedTime 0.3（:3287）
//     收缩   = ScaleAcceleration = num3 × (−1/60)/50（:3288）
//   尾随 dust 6 段（:3292-3304，每束 1/8 概率）不在本文件——由消费方回调承载
//  （Player.ts goatFlames，参数已 1:1）。
//
// 状态机（ABasicParticle.Update :39-50 + FlameParticle.Update :43-51）：
//   ScaleVelocity += ScaleAcceleration; Scale += ScaleVelocity（二次收缩，
//   50t 后 scale = num3 × (1 − 1275/3000) ≈ 0.575×num3）；
//   _timeSinceSpawn += 1，≥ TTL 移除。Velocity/Acceleration 恒 0 → 位置不动。
//
// 绘制（FlameParticle.Draw :53-68）在 Renderer.drawFlameParticles：
//   色 = Color(120,120,120,60) × GetLerpValue(1, 0.3, t/TTL)；
//   4 份 ±2px×Scale 种子化抖动副本；origin = (frame.Width/2, frame.Height−2)。
//   坐骑染料（SetTypeInfo 第三参 = player.cMount，ParticleOrchestrator.cs:3271；
//   cMount = miscDyes[3].dye，Player.cs:9300——坐骑染料槽下标 3）已建模：
//   Renderer 调用点从 player.inv.miscDyes[3] 解析染料 vid → dyeApplyOf 基底烘焙
//   （与 cWings 翅膀染料同款 SM2 路径），DrawData 基色 (120,120,120,60) 照常相乘
//   （染料只变换贴图像素，不替换基色——见 flamePassAlphas）。
//
// 入池 = ParticlePool（ParticlePool.cs:37-52，无空位时扩容）；此处按 VanillaDust
// 先例取定长池 + 满池静默丢弃（山羊火焰满并发 ~150/玩家，512 上限永不触发）。

/** 编排器 num（:3261）= SetTypeInfo 的 timeToLive——存活 50 tick */
export const FLAME_TTL = 50;
/** FadeOutNormalizedTime（:3287）——生命末 70% 线性淡出（见 flameFadeOutFactor） */
export const FLAME_FADE_OUT = 0.3;
/** 三束横向偏移步长（:3269 (float)i × 5.3333335f） */
export const FLAME_BUNDLE_DX = 5.3333335;
/** 贴图候选（:3265 NextFromList）——Projectile 弹贴图三张小火苗 */
export const FLAME_TEX = [326, 327, 328] as const;

/** Utils.GetLerpValue(from, to, t, clamped)（Utils.cs:283-306）1:1——from>to 反向段：
 *  t ≤ to 恒 1、t ≥ from 恒 0、之间 (t−from)/(to−from) 线性。
 *  FlameParticle.Draw :55 取 (from,to) = (1, FadeOutNormalizedTime)。纯函数供测试锁定。 */
export function flameLerpValue(from: number, to: number, t: number): number {
  if (from < to) {
    if (t < from) return 0;
    if (t > to) return 1;
  } else {
    if (t < to) return 1;
    if (t > from) return 0;
  }
  return (t - from) / (to - from);
}

/** 淡出系数（生命归一比 t01 = _timeSinceSpawn / timeToLive）：前 30% 全亮，
 *  后 70% 线性降到 0（t01 ≥ 1 已被存活门移除，此处防御钳 0） */
export function flameFadeOutFactor(t01: number, fadeOut = FLAME_FADE_OUT): number {
  return Math.max(0, flameLerpValue(1, fadeOut, t01));
}

/** ScaleAcceleration（:3288 num3 × (−1/60)/num）：每 tick² 的收缩加速度 */
export function flameScaleAcceleration(scale0: number, ttl = FLAME_TTL): number {
  return scale0 * (-1 / 60) / ttl;
}

/** Draw :55 的 DrawData 基色 rgb 分量（Color(120,120,120,60)——XNA 预乘混合下
 *  rgb:A = 2:1，Renderer 以 覆盖+加性 两 pass 等价）。染料无关常量 */
export const FLAME_DRAW_RGB = 120 / 255;
/** Draw :55 的 DrawData 基色 alpha 分量（60/255） */
export const FLAME_DRAW_ALPHA = 60 / 255;

/** 绘制两 pass 的 alpha（Renderer.drawFlameParticles 消费）：
 *  ① 覆盖 pass = (60/255)×lerp（原贴图/染料基底）；② 加性 pass = lerp（×(60,60,60)
 *  预染副本）——两 pass rgb 合计 = 基底×(120/255)×lerp。**染料路径共用同一基色
 *  乘法**（FlameParticle.cs:62-64：shader 只变换贴图像素，DrawData.color 照常乘），
 *  即染料不替换/不叠加基色通道——供测试锁定 */
export function flamePassAlphas(lerp: number): { cover: number; add: number } {
  return { cover: FLAME_DRAW_ALPHA * lerp, add: lerp };
}

/** k 次 update 后的 scale（ABasicParticle 递推 scale += Σ accel 的闭式，
 *  供测试锁定二次收缩曲线） */
export function flameScaleAfter(scale0: number, accel: number, ticks: number): number {
  const n = Math.max(0, Math.floor(ticks));
  return scale0 + accel * (n * (n + 1)) / 2;
}

export interface VFlame {
  active: boolean;
  /** LocalPosition（世界像素；AnchorPosition 只在原版做 −screenPosition 平移，
   *  本仓在世界变换内直画 = 世界坐标） */
  x: number; y: number;
  /** Velocity（编排器恒 0）——ABasicParticle 通用链保留字段 */
  vx: number; vy: number;
  /** Scale（XNA Vector2 双轴，编排器恒同值 → 标量） */
  scale: number;
  /** ScaleVelocity（初值 0，逐 tick += ScaleAcceleration） */
  scaleVel: number;
  scaleAccel: number;
  timeSinceSpawn: number;
  timeToLive: number;
  fadeOut: number;
  /** Projectile 贴图号（326/327/328） */
  tex: number;
}

const POOL = 512;

export class FlameParticles {
  private pool: VFlame[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, scale: 0, scaleVel: 0,
        scaleAccel: 0, timeSinceSpawn: 0, timeToLive: FLAME_TTL,
        fadeOut: FLAME_FADE_OUT, tex: 326,
      });
    }
  }

  /** Spawn_WallOfFleshGoatMountFlames 的 FlameParticle 段（:3262-3290）。
   *  rand 可注入（测试确定性）；返回实际入池束数（满池静默丢弃）。 */
  spawnGoatFlames(x: number, y: number, rand: () => number = Math.random): number {
    let n = 0;
    for (let i = -1; i <= 1; i++) {
      let slot: VFlame | null = null;
      for (let k = 0; k < POOL; k++) {
        const c = this.pool[(this.cursor + k) % POOL];
        if (!c.active) { slot = c; this.cursor = (this.cursor + k + 1) % POOL; break; }
      }
      if (!slot) break;   // 池满：丢弃（VanillaDust 同语义）
      const num3 = rand() * 0.9 + 0.1;                       // :3268
      slot.active = true;
      slot.x = x + i * FLAME_BUNDLE_DX;                      // :3269
      slot.y = y;
      slot.vx = 0; slot.vy = 0;                              // :3271 Vector2.Zero
      slot.scale = num3;                                     // :3290
      slot.scaleVel = 0;                                     // FetchFromPool 复位（ABasicParticle :34）
      slot.scaleAccel = flameScaleAcceleration(num3);        // :3288
      slot.timeSinceSpawn = 0;
      slot.timeToLive = FLAME_TTL;                           // :3261/:3272
      slot.fadeOut = FLAME_FADE_OUT;                         // :3287
      slot.tex = FLAME_TEX[Math.floor(rand() * FLAME_TEX.length) % FLAME_TEX.length];  // :3265
      n++;
    }
    return n;
  }

  /** ABasicParticle.Update（:39-50）+ FlameParticle.Update（:43-51）：
   *  速度/位置链保留（编排器恒 0）；scale 二次收缩；到龄移除。 */
  update(): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.x += f.vx; f.y += f.vy;                              // Velocity += 0 后位移
      f.scaleVel += f.scaleAccel;
      f.scale += f.scaleVel;
      f.timeSinceSpawn += 1;
      if (f.timeSinceSpawn >= f.timeToLive) f.active = false;   // :47-50
    }
  }

  /** 活动粒子迭代（绘制用，FIFO 无所谓——同帧内互不遮挡依赖） */
  *each(): Generator<VFlame> {
    for (const f of this.pool) if (f.active) yield f;
  }

  get count(): number {
    let n = 0;
    for (const f of this.pool) if (f.active) n++;
    return n;
  }

  clear(): void {
    for (const f of this.pool) f.active = false;
  }
}

/** 模块级单例（natureParticles 同款模式：Player 侧 spawn / Renderer 侧 draw） */
export const flameParticles = new FlameParticles();
