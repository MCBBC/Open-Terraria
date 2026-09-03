// FadingParticle（Terraria.Graphics.Renderers/FadingParticle.cs + ABasicParticle.cs）
// 1:1 承载——编排器 FadingParticle 段的首个本仓粒子池（FlameParticles 同款模式：
// Player/编排侧 spawn、Game 侧 update、Renderer 侧 draw）。
//
// 原版真值锚（Terarria1457）：
//   - ABasicParticle.SetBasicInfo（ABasicParticle.cs:47-55）：origin = frame.Size/2（中心锚）、
//     Velocity/LocalPosition 装载；Update（:57-65）：Velocity += AccelerationPerFrame →
//     LocalPosition += Velocity → RotationVelocity += RotationAcceleration → Rotation +=
//     RotationVelocity → ScaleVelocity += ScaleAcceleration → Scale += ScaleVelocity（先加速后位移）。
//   - FadingParticle（FadingParticle.cs）：Update（:42-55）Delay>0 时只 Delay-- 不推进不老化；
//     timeSinceSpawn++ ≥ timeTolive 移除。Draw（:57-66）：followPlayerIndex!=-1 时
//     position += Main.player[idx].MountedCenter（:59-63）;fullbright（SetTypeInfo 缺省 true）
//     → color = ColorTint × GetLerpValue(0, FadeInNormalizedTime, t/TTL) ×
//     GetLerpValue(1, FadeOutNormalizedTime, t/TTL)（Utils.GetLerpValue 钳 0..1），
//     fullbright=false 时 ColorTint.MultiplyRGB(Lighting.GetColor(...)) 乘位置光照（:64），
//     贴图原尺 × Scale 中心锚绘制。
//   - 消费站 = Spawn_SnappingStone（:610-624 拍击石 projectile 1121 蓝圈）与
//     Spawn_SnappingStoneSummon（:752-787 毁灭臂镗 projectile 1132 双圈 + Extra[34] 旋星），
//     均入 ParticleSystem_World_OverPlayers（Main.cs:63208 玩家之后绘制）。
//
// 色彩映射（XNA 预乘 AlphaBlend，见 Renderer.drawFadingParticles）：
//   ColorTint.A = 0 → 纯加法（α=0 惯用法,canvas 'lighter'）；
//   ColorTint.A > 0 → out = tex·tint.rgb + dst·(1 − texA·tint.A)（erase+lighter 双 pass 精确）。

/** Utils.GetLerpValue(from, to, t, clamped)（Utils.cs:315-341）1:1——from>to 反向段。
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

/** FadingParticle.Draw :64 的透明度包络（纯函数）：
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
  /** Velocity / AccelerationPerFrame（ABasicParticle :11/:9） */
  vx: number; vy: number; ax: number; ay: number;
  /** Rotation / RotationVelocity / RotationAcceleration（ABasicParticle :21/:23/:25） */
  rot: number; rotVel: number; rotAcc: number;
  /** Scale（Vector2 双轴）/ ScaleVelocity / ScaleAcceleration（ABasicParticle :27/:29/:31） */
  scaleX: number; scaleY: number;
  scaleVelX: number; scaleVelY: number;
  scaleAccX: number; scaleAccY: number;
  /** FadingParticle.Delay（FadingParticle.cs:14——>0 逐拍递减,期间不推进不老化不绘制） */
  delay: number;
  /** timeSinceSpawn / timeToLive（SetTypeInfo FadingParticle.cs:36-40,timeTolive :38） */
  timeSinceSpawn: number; timeToLive: number;
  /** FadeInNormalizedTime / FadeOutNormalizedTime（FadingParticle.cs:8/:10） */
  fadeIn: number; fadeOut: number;
  /** ColorTint（0-255 域；A=0 纯加法档） */
  tintR: number; tintG: number; tintB: number; tintA: number;
  /** 贴图（vanilla/ 相对键——Projectile_1121/1132、Extra_34 等编排站专用贴图） */
  texKey: string;
  // ---- ★R3 ⑤c（2026-09-03）三字段承载（现行两站不写=零行为,为 :919 系站预留）----
  /** FadingParticle.followPlayerIndex（FadingParticle.cs:22 池缺省 -1;FetchFromPool
   *  :32 复位）——!= -1 时 Draw :60-63 position += Main.player[idx].MountedCenter
   *  （Renderer.drawFadingParticles 接线;消费站如 Spawn_PaladinsShieldHit :921） */
  followPlayerIndex: number;
  /** FadingParticle.fullbright（FadingParticle.cs:20 池缺省 true;SetTypeInfo :36-40
   *  第二参）——false 时 Draw :64 ColorTint.MultiplyRGB(Lighting.GetColor(
   *  LocalPosition.ToTileCoordinates())) 乘位置光照（Renderer 接线,lightAt 同源） */
  fullbright: boolean;
}

/** 池预分配（原版 initialPoolSize=200 仅 List 预分配,ParticleOrchestrator.cs:22
 *  _poolFading=200;拍击石环带满并发 ~5/拍——满池【扩池不设上限】,R3 ⑤a） */
const POOL = 512;

/** FetchFromPool 复位面（FadingParticle.cs:24-34 + ABasicParticle.cs:74-90）：
 *  ColorTint=Color.White（FadingParticle.cs:29,A=255）、fadeIn 0/fadeOut 1、
 *  followPlayerIndex -1（:32）、Delay 0、fullbright true（:20 池字段缺省）。 */
function freshFading(): VFading {
  return {
    active: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
    rot: 0, rotVel: 0, rotAcc: 0, scaleX: 1, scaleY: 1, scaleVelX: 0, scaleVelY: 0,
    scaleAccX: 0, scaleAccY: 0, delay: 0, timeSinceSpawn: 0, timeToLive: 1,
    fadeIn: 0, fadeOut: 1, tintR: 255, tintG: 255, tintB: 255, tintA: 255,
    texKey: '', followPlayerIndex: -1, fullbright: true,
  };
}

export class FadingParticles {
  private pool: VFading[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) this.pool.push(freshFading());
  }

  /** FadingParticle 入池（FetchFromPool 复位语义 :24-34 + 编排站逐字段覆写）。
   *  确定性入池（编排站 FadingParticle 段零掷骰——随机项由调用侧先算好传入）。
   *  ★R3 ⑤a（2026-09-03）：满池不再静默丢弃——原版 ParticlePool.RequestParticle
   *  无上限扩池（ParticlePool.cs:38-50 扫空位未中即 _instantiator()+List.Add,
   *  initialPoolSize 只是构造预分配）→ 本仓同构扩池。 */
  spawn(cfg: {
    x: number; y: number;
    vx?: number; vy?: number;
    ax?: number; ay?: number;
    rot?: number; rotVel?: number; rotAcc?: number;
    scale?: number; scaleX?: number; scaleY?: number;
    scaleVelX?: number; scaleVelY?: number;
    scaleAccX?: number; scaleAccY?: number;
    delay?: number;
    timeToLive: number;
    fadeIn?: number; fadeOut?: number;
    tint?: readonly [number, number, number, number];
    texKey: string;
    followPlayerIndex?: number;
    fullbright?: boolean;
  }): VFading | null {
    let slot: VFading | null = null;
    for (let k = 0; k < this.pool.length; k++) {
      const c = this.pool[(this.cursor + k) % this.pool.length];
      if (!c.active) { slot = c; this.cursor = (this.cursor + k + 1) % this.pool.length; break; }
    }
    if (!slot) {
      slot = freshFading();                    // RequestParticle 扩池（ParticlePool.cs:47-50）
      this.pool.push(slot);
    }
    slot.active = true;
    slot.x = cfg.x; slot.y = cfg.y;
    slot.vx = cfg.vx ?? 0; slot.vy = cfg.vy ?? 0;       // SetBasicInfo 初速（编排站恒 Zero）
    slot.ax = cfg.ax ?? 0; slot.ay = cfg.ay ?? 0;        // AccelerationPerFrame（编排站缺省 0）
    slot.rot = cfg.rot ?? 0;
    slot.rotVel = cfg.rotVel ?? 0;
    slot.rotAcc = cfg.rotAcc ?? 0;                       // RotationAcceleration（ABasicParticle :25）
    const sx = cfg.scaleX ?? cfg.scale ?? 1;
    const sy = cfg.scaleY ?? cfg.scale ?? 1;
    slot.scaleX = sx; slot.scaleY = sy;
    slot.scaleVelX = cfg.scaleVelX ?? 0; slot.scaleVelY = cfg.scaleVelY ?? 0;
    slot.scaleAccX = cfg.scaleAccX ?? 0; slot.scaleAccY = cfg.scaleAccY ?? 0;
    slot.delay = cfg.delay ?? 0;
    slot.timeSinceSpawn = 0;
    slot.timeToLive = cfg.timeToLive;
    slot.fadeIn = cfg.fadeIn ?? 0;                       // FetchFromPool 缺省（:27-28）
    slot.fadeOut = cfg.fadeOut ?? 1;
    // ★R3 ⑤b（2026-09-03）：A 缺省 255——FetchFromPool ColorTint=Color.White
    //  （FadingParticle.cs:29,A=255;旧 0 系臆造缺省）。显式传 tint 的两站
    //  （拍击石 A=0/臂镗 A=90）不受影响
    slot.tintR = cfg.tint?.[0] ?? 255; slot.tintG = cfg.tint?.[1] ?? 255;
    slot.tintB = cfg.tint?.[2] ?? 255; slot.tintA = cfg.tint?.[3] ?? 255;
    slot.texKey = cfg.texKey;
    slot.followPlayerIndex = cfg.followPlayerIndex ?? -1;   // :22/:32 池缺省 -1
    slot.fullbright = cfg.fullbright ?? true;               // SetTypeInfo :36-40 缺省 true
    return slot;
  }

  /** ABasicParticle.Update（:57-65）+ FadingParticle.Update（:42-55）：
   *  Delay 段只递减（不推进/不老化/不绘制）；其余先加速后位移、Rotation/Scale
   *  二次链（★R3 ⑤c：RotationAcceleration 已承载,ABasicParticle :61）、
   *  timeSinceSpawn ≥ timeToLive 移除。 */
  update(): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      if (f.delay > 0) { f.delay--; continue; }          // :44-48
      f.vx += f.ax; f.vy += f.ay;                        // :59
      f.x += f.vx; f.y += f.vy;                          // :60
      f.rotVel += f.rotAcc;                              // :61 RotationVelocity += RotationAcceleration
      f.rot += f.rotVel;                                 // :62
      f.scaleVelX += f.scaleAccX; f.scaleVelY += f.scaleAccY;   // :63
      f.scaleX += f.scaleVelX; f.scaleY += f.scaleVelY;         // :64
      f.timeSinceSpawn++;                                // FadingParticle.cs:50
      if (f.timeSinceSpawn >= f.timeToLive) f.active = false;   // :51-54
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
