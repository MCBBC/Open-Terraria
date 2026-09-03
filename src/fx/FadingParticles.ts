// FadingParticle（Terraria.Graphics.Renderers/FadingParticle.cs + ABasicParticle.cs）
// 1:1 承载——编排器 FadingParticle 段的首个本仓粒子池（FlameParticles 同款模式：
// Player/编排侧 spawn、Game 侧 update、Renderer 侧 draw）。
//
// 原版真值锚（Terarria1457）：
//   - ABasicParticle.SetBasicInfo（ABasicParticle.cs:26-36）：origin = frame.Size/2（中心锚）、
//     Velocity/LocalPosition 装载；Update（:39-50）：Velocity += AccelerationPerFrame →
//     LocalPosition += Velocity → RotationVelocity += RotationAcceleration → Rotation +=
//     RotationVelocity → ScaleVelocity += ScaleAcceleration → Scale += ScaleVelocity（先加速后位移）。
//   - FadingParticle（FadingParticle.cs）：Update（:46-60）Delay>0 时只 Delay-- 不推进不老化；
//     timeSinceSpawn++ ≥ timeTolive 移除。Draw（:62-69）：fullbright（SetTypeInfo 缺省 true）
//     → color = ColorTint × GetLerpValue(0, FadeInNormalizedTime, t/TTL) ×
//     GetLerpValue(1, FadeOutNormalizedTime, t/TTL)（Utils.GetLerpValue 钳 0..1），
//     贴图原尺 × Scale 中心锚绘制——无光照乘（编排环带全亮）。
//   - 消费站 = Spawn_SnappingStone（:610-627 拍击石 projectile 1121 蓝圈）与
//     Spawn_SnappingStoneSummon（:752-787 毁灭臂镗 projectile 1132 双圈 + Extra[34] 旋星），
//     均入 ParticleSystem_World_OverPlayers（Main.cs:63208 玩家之后绘制）。
//
// 色彩映射（XNA 预乘 AlphaBlend，见 Renderer.drawFadingParticles）：
//   ColorTint.A = 0 → 纯加法（α=0 惯用法,canvas 'lighter'）；
//   ColorTint.A > 0 → out = tex·tint.rgb + dst·(1 − texA·tint.A)（erase+lighter 双 pass 精确）。

/** Utils.GetLerpValue(from, to, t, clamped)（Utils.cs:283-306）1:1——from>to 反向段。
 *  纯函数供测试锁定（与 FlameParticles.flameLerpValue 同式,独立导出避免跨域耦合）。 */
export function fadingLerpValue(from: number, to: number, t: number): number {
  if (from < to) {
    if (t < from) return 0;
    if (t > to) return 1;
  } else {
    if (t < to) return 1;
    if (t > from) return 0;
  }
  return (t - from) / (to - from);
}

/** FadingParticle.Draw :68 的透明度包络（纯函数）：
 *  GetLerpValue(0, fadeInNorm, t01) × GetLerpValue(1, fadeOutNorm, t01)。 */
export function fadingAlphaFactor(t01: number, fadeInNorm: number, fadeOutNorm: number): number {
  return Math.max(0, fadingLerpValue(0, fadeInNorm, t01) * fadingLerpValue(1, fadeOutNorm, t01));
}

/** ABasicParticle.Scale 二次递推闭式（update k 拍后）：Scale += Σ(sv0 + acc·j)
 *  = scale0 + sv0·k + acc·k(k+1)/2——供测试锁定圈起成长曲线。 */
export function fadingScaleAfter(scale0: number, sv0: number, acc: number, ticks: number): number {
  const k = Math.max(0, Math.floor(ticks));
  return scale0 + sv0 * k + (acc * (k * (k + 1))) / 2;
}

export interface VFading {
  active: boolean;
  /** LocalPosition（世界像素；AnchorPosition 只在原版做 −screenPosition 平移，
   *  本仓 Renderer 在 cam 变换内直画 = 世界坐标） */
  x: number; y: number;
  /** Velocity / AccelerationPerFrame（ABasicParticle :9/:8） */
  vx: number; vy: number; ax: number; ay: number;
  /** Rotation / RotationVelocity（RotationAcceleration 编排站不写,恒 0） */
  rot: number; rotVel: number;
  /** Scale（Vector2 双轴）/ ScaleVelocity / ScaleAcceleration（:15-17） */
  scaleX: number; scaleY: number;
  scaleVelX: number; scaleVelY: number;
  scaleAccX: number; scaleAccY: number;
  /** FadingParticle.Delay（:13——>0 逐拍递减,期间不推进不老化不绘制） */
  delay: number;
  /** timeSinceSpawn / timeToLive（SetTypeInfo :28 timeToLive） */
  timeSinceSpawn: number; timeToLive: number;
  /** FadeInNormalizedTime / FadeOutNormalizedTime（:8-9） */
  fadeIn: number; fadeOut: number;
  /** ColorTint（0-255 域；A=0 纯加法档） */
  tintR: number; tintG: number; tintB: number; tintA: number;
  /** 贴图（vanilla/ 相对键——Projectile_1121/1132、Extra_34 等编排站专用贴图） */
  texKey: string;
}

/** 池容量（FlameParticles 512 同款；拍击石环带满并发 ~5/拍,上限永不触发） */
const POOL = 512;

export class FadingParticles {
  private pool: VFading[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
        rot: 0, rotVel: 0, scaleX: 1, scaleY: 1, scaleVelX: 0, scaleVelY: 0,
        scaleAccX: 0, scaleAccY: 0, delay: 0, timeSinceSpawn: 0, timeToLive: 1,
        fadeIn: 0, fadeOut: 1, tintR: 255, tintG: 255, tintB: 255, tintA: 0,
        texKey: '',
      });
    }
  }

  /** FadingParticle 入池（FetchFromPool 复位语义 :18-26 + 编排站逐字段覆写）。
   *  确定性入池（编排站 FadingParticle 段零掷骰——随机项由调用侧先算好传入）；
   *  满池静默丢弃（FlameParticles/VanillaDust 同语义）。 */
  spawn(cfg: {
    x: number; y: number;
    vx?: number; vy?: number;
    ax?: number; ay?: number;
    rot?: number; rotVel?: number;
    scale?: number; scaleX?: number; scaleY?: number;
    scaleVelX?: number; scaleVelY?: number;
    scaleAccX?: number; scaleAccY?: number;
    delay?: number;
    timeToLive: number;
    fadeIn?: number; fadeOut?: number;
    tint?: readonly [number, number, number, number];
    texKey: string;
  }): VFading | null {
    let slot: VFading | null = null;
    for (let k = 0; k < POOL; k++) {
      const c = this.pool[(this.cursor + k) % POOL];
      if (!c.active) { slot = c; this.cursor = (this.cursor + k + 1) % POOL; break; }
    }
    if (!slot) return null;
    slot.active = true;
    slot.x = cfg.x; slot.y = cfg.y;
    slot.vx = cfg.vx ?? 0; slot.vy = cfg.vy ?? 0;       // SetBasicInfo 初速（编排站恒 Zero）
    slot.ax = cfg.ax ?? 0; slot.ay = cfg.ay ?? 0;        // AccelerationPerFrame（编排站缺省 0）
    slot.rot = cfg.rot ?? 0;
    slot.rotVel = cfg.rotVel ?? 0;
    const sx = cfg.scaleX ?? cfg.scale ?? 1;
    const sy = cfg.scaleY ?? cfg.scale ?? 1;
    slot.scaleX = sx; slot.scaleY = sy;
    slot.scaleVelX = cfg.scaleVelX ?? 0; slot.scaleVelY = cfg.scaleVelY ?? 0;
    slot.scaleAccX = cfg.scaleAccX ?? 0; slot.scaleAccY = cfg.scaleAccY ?? 0;
    slot.delay = cfg.delay ?? 0;
    slot.timeSinceSpawn = 0;
    slot.timeToLive = cfg.timeToLive;
    slot.fadeIn = cfg.fadeIn ?? 0;                       // FetchFromPool 缺省（:19-20）
    slot.fadeOut = cfg.fadeOut ?? 1;
    slot.tintR = cfg.tint?.[0] ?? 255; slot.tintG = cfg.tint?.[1] ?? 255;
    slot.tintB = cfg.tint?.[2] ?? 255; slot.tintA = cfg.tint?.[3] ?? 0;
    slot.texKey = cfg.texKey;
    return slot;
  }

  /** ABasicParticle.Update（:39-50）+ FadingParticle.Update（:46-60）：
   *  Delay 段只递减（不推进/不老化/不绘制）；其余先加速后位移、Rotation/Scale
   *  二次链、timeSinceSpawn ≥ timeToLive 移除。 */
  update(): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      if (f.delay > 0) { f.delay--; continue; }          // :47-50
      f.vx += f.ax; f.vy += f.ay;                        // :40
      f.x += f.vx; f.y += f.vy;                          // :41
      f.rot += f.rotVel;                                 // :44-45（Acceleration 恒 0）
      f.scaleVelX += f.scaleAccX; f.scaleVelY += f.scaleAccY;   // :47-48
      f.scaleX += f.scaleVelX; f.scaleY += f.scaleVelY;         // :48-49
      f.timeSinceSpawn++;                                // :52
      if (f.timeSinceSpawn >= f.timeToLive) f.active = false;   // :53-55
    }
  }

  /** 活动粒子迭代（绘制用） */
  *each(): Generator<VFading> {
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

/** 模块级单例（FlameParticles/natureParticles 同款模式：编排侧 spawn / Game 侧
 *  update / Renderer 侧 draw） */
export const fadingParticles = new FadingParticles();
