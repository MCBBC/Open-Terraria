// 原版 Dust 引擎（Dust.cs NewDust :75-285 / UpdateDust :423-2450 / Main.DrawDust
// :38266-38436 / GetAlpha :2469-2772 / GetColor :2773-2817）——翅膀视觉批引入。
//
// 范围说明：本引擎按"消费方已用到的 type"精植（翅膀尘埃 13 型：6/31/43/55/58/76/
// 86/182/217/229/240/261/264），逐型带源码行号；NewDust 初始化链与通用老化链
// （fadeIn=生长目标语义 :2148-2171：0<fadeIn<100 时 scale += 0.03/t 至超 fadeIn
// 转衰落；否则 scale -= 0.01/t）全量 1:1。后续其它系统接入新 type 时按同法扩表。
//
// 光照：261/264/182 逐尘 AddLight（update 期收集 → Game 推 LightingEngine）。
// 绘制：亮色族 {6,15,59-64}（DrawDust 强制 White :38406）画在光照合成之后
// （= 原版 GetColor(White) 等价），其余画在合成前（逐像素乘光 ≈ 原版逐尘取光）。
// 双 pass：本体（GetAlpha）+ 自定义色 pass（GetColor 加性钳位 :2773）。

export interface DustColor { r: number; g: number; b: number; a: number }

export interface VDust {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  type: number;
  scale: number;
  alpha: number;
  /** 生长目标（0<值<100 时逐 tick +0.03 至超越转 0；0 = 直接衰落） */
  fadeIn: number;
  noGravity: boolean;
  noLight: boolean;
  noLightEmittance: boolean;
  color: DustColor | null;
  rotation: number;
  /** Dust.png 格坐标（10px 格、8×8 取样框） */
  fx: number; fy: number;
  /** customData = 主角（旧位跟随；263/264/182 一次性后清除，261 持续） */
  followPlayer: boolean;
  followOnce: boolean;
}

/** Main.maxDustToDraw 的实用上限（翅膀场景并发 ≤40；6000 池的密度门是满载启发式，
 *  此规模永不触发——dCount 五档缩放不建模） */
const POOL = 512;

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** NewDust 帧映射（:176-191）：X = 10·type，type≥100 每 100 减 1000 加 Y+30 */
function frameOf(type: number): { fx: number; fy: number } {
  let fx = 10 * type, fy = 10 * (Math.random() * 3 | 0);
  let t = type;
  while (t >= 100) { t -= 100; fx -= 1000; fy += 30; }
  return { fx, fy };
}

export class VanillaDust {
  private pool: VDust[] = [];
  private cursor = 0;
  /** update 期收集的光照（Game 每帧推 LightingEngine 后清空） */
  lights: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, type: 0, scale: 1, alpha: 0,
        fadeIn: 0, noGravity: false, noLight: false, noLightEmittance: false,
        color: null, rotation: 0, fx: 0, fy: 0, followPlayer: false, followOnce: false,
      });
    }
  }

  /** NewDust（:75-285）：位置/速度抖动、scale 抖动、type-6 烟雾初速特例、
   *  屏外裁剪（±400·(1−dCount) 外圈不生成——满池启发式不建模，取 400 常量门） */
  spawn(x: number, y: number, w: number, h: number, type: number,
    speedX = 0, speedY = 0, alpha = 0, color: DustColor | null = null, scale = 1): VDust | null {
    // 屏外裁剪需要视口信息——由 Game 侧 update 先暂存；spawn 时跳过（池小、
    // 视口裁剪在 update/draw 双重兜底），此处仅密度池满兜底
    let d: VDust | null = null;
    for (let i = 0; i < POOL; i++) {
      const c = this.pool[(this.cursor + i) % POOL];
      if (!c.active) { d = c; this.cursor = (this.cursor + i + 1) % POOL; break; }
    }
    if (!d) return null;
    const w2 = Math.max(5, w), h2 = Math.max(5, h);
    d.active = true;
    d.type = type;
    d.noGravity = false;
    d.color = color;
    d.alpha = alpha;
    d.x = x + (Math.random() * (w2 - 4) | 0) + 4;
    d.y = y + (Math.random() * (h2 - 4) | 0) + 4;
    d.vx = ((Math.random() * 41 | 0) - 20) * 0.1 + speedX;
    d.vy = ((Math.random() * 41 | 0) - 20) * 0.1 + speedY;
    const f = frameOf(type);
    d.fx = f.fx; d.fy = f.fy;
    d.rotation = 0;
    d.scale = (1 + ((Math.random() * 41 | 0) - 20) * 0.01) * scale;
    d.noLight = false;
    d.fadeIn = 0;
    d.noLightEmittance = false;
    d.followPlayer = false;
    d.followOnce = false;
    // :221-226 烟雾族初速特例（本批 type 6 命中；59-65 等后续接入同享）
    if (type === 228 || type === 279 || type === 269 || type === 135 || type === 6
      || type === 242 || type === 75 || type === 169 || type === 29 || (type >= 59 && type <= 65)
      || type === 158 || (type >= 293 && type <= 298) || type === 302 || type === 307 || type === 310) {
      d.vy = ((Math.random() * 16 | 0) - 10) * 0.1;
      d.vx *= 0.3;
      d.scale *= 0.7;
    }
    return d;
  }

  /** UpdateDust（:423-2450，消费型精植）。playerDelta = 主角本 tick 位移
   *  （oldPosition 差——customData=Player 跟随用） */
  update(screenX: number, screenY: number, screenW: number, screenH: number,
    playerDx = 0, playerDy = 0): void {
    this.lights.length = 0;
    for (const d of this.pool) {
      if (!d.active) continue;
      // :445 scale>10 兜底
      if (d.scale > 10) { d.active = false; continue; }
      // :469 position += velocity
      d.x += d.vx; d.y += d.vy;
      // ---- 逐型段 ----
      switch (d.type) {
        case 264:   // :625-641：光 + 一次性主角跟随
          if (!d.noLight) {
            this.lights.push({ x: d.x, y: d.y, r: (d.color?.r ?? 0) / 255 * d.scale * 0.4,
              g: (d.color?.g ?? 0) / 255 * d.scale * 0.4, b: (d.color?.b ?? 0) / 255 * d.scale * 0.4 });
          }
          if (d.followPlayer) {
            d.x += playerDx; d.y += playerDy;
            if (d.followOnce) d.followPlayer = false;
          }
          break;
        case 182:   // :685-705：rotation+1 + 光(1,0.2,0.1)×min(scale·0.25,1) + 一次性跟随
          d.rotation += 1;
          if (!d.noLight) {
            const k = Math.min(d.scale * 0.25, 1);
            this.lights.push({ x: d.x, y: d.y, r: k, g: k * 0.2, b: k * 0.1 });
          }
          if (d.followPlayer) {
            d.x += playerDx; d.y += playerDy;
            if (d.followOnce) d.followPlayer = false;
          }
          break;
        case 261:   // :705-727：光(0.4,0.6,0.7)×min(scale·0.3,1) + 阻尼×2 档 + 持续跟随
          if (!d.noLight && !d.noLightEmittance) {
            const k = Math.min(d.scale * 0.3, 1);
            this.lights.push({ x: d.x, y: d.y, r: k * 0.4, g: k * 0.6, b: k * 0.7 });
          }
          if (d.noGravity) {
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          }
          d.vx *= 0.97; d.vy *= 0.99;
          d.scale -= 0.0025;
          if (d.followPlayer) { d.x += playerDx; d.y += playerDy; }
          break;
        default:
          break;
      }
      // :1889-1897 重力（链头特型不在消费集）
      if (!d.noGravity && d.type !== 41 && d.type !== 44 && d.type !== 309) {
        d.vy += 0.1;
      }
      // :2144-2146 通用旋转
      if (d.type !== 79 && d.type !== 268 && d.type !== 304) {
        d.rotation += d.vx * 0.5;
      }
      // :2148-2171 fadeIn 生长目标语义
      if (d.fadeIn > 0 && d.fadeIn < 100) {
        if (d.type === 46 || d.type === 213 || d.type === 260) d.scale += 0.1;
        else if (d.type === 235) d.scale += 0.007;
        else d.scale += 0.03;
        if (d.scale > d.fadeIn) d.fadeIn = 0;
      } else if (d.type !== 304) {
        if (d.type === 213 || d.type === 260) d.scale -= 0.2;
        else d.scale -= 0.01;
      }
      // :2387 屏底清除
      if (d.y > screenY + screenH) { d.active = false; continue; }
      // :2432-2436 缩没清除（dCount 五档密度缩放不建模——池小永不触发）
      if (d.scale < 0.1) d.active = false;
    }
  }

  /** 活动尘迭代（绘制用；fullbright=true 只取亮色族 {6,15,59-64}，false 取其余） */
  *each(fullbright: boolean): Generator<VDust> {
    for (const d of this.pool) {
      if (!d.active) continue;
      if (fullbrightnessWanted(fullbright, d)) yield d;
    }
  }

  /** GetAlpha（:2469-2772 消费型精植）：返回乘数 [rgb, alpha]（0-1） */
  static alphaOf(d: VDust): { rgb: number; a: number } {
    const num = (255 - d.alpha) / 255;
    switch (d.type) {
      case 261: return { rgb: 230 / 255, a: 115 / 255 };                       // :2521
      case 6: return { rgb: 1, a: 25 / 255 };                                   // :2583
      case 182: return { rgb: 1, a: 0 };                                        // :2517
      case 264: {                                                               // :2508
        const c = d.color ?? { r: 0, g: 0, b: 0, a: 0 };
        return { rgb: 0.5, a: (clamp255(c.a / 8) / 255) * 0.5 };
      }
      case 86: case 87: case 88: case 89: case 90: case 91:
        if (!d.noLight) return { rgb: 1, a: 0 };                                // :2511
        return { rgb: num, a: num };
      default:
        return { rgb: num, a: num };
    }
  }

  /** GetColor（:2773-2817 加性钳位）：second pass 色（尘自定义色与基色的叠加） */
  static colorPass(d: VDust, baseRgb: number, baseA: number): DustColor | null {
    if (!d.color) return null;
    return {
      r: clamp255(d.color.r - (255 - baseRgb * 255)) / 255,
      g: clamp255(d.color.g - (255 - baseRgb * 255)) / 255,
      b: clamp255(d.color.b - (255 - baseRgb * 255)) / 255,
      a: clamp255(d.color.a - (255 - baseA * 255)) / 255,
    };
  }
}

function fullbrightnessWanted(wantFb: boolean, d: VDust): boolean {
  const fb = d.type === 6 || d.type === 15 || (d.type >= 59 && d.type <= 64);
  return wantFb === fb;
}
