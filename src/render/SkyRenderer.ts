// 天空渲染：昼夜渐变、太阳/月亮、星星、云
import type { Clock } from '../world/World';
import { shade, mix } from '../assets/Palette';

// 天空关键色 [时刻, 顶色, 底色]（时刻 0-1）
const SKY_KEYS: Array<[number, string, string]> = [
  [0.0, '#050A1E', '#0E1630'],   // 午夜
  [0.22, '#050A1E', '#1A2440'],  // 黎明前
  [0.27, '#3A4A8A', '#E89A5A'],  // 日出
  [0.35, '#4A8AD4', '#A8D4F0'],  // 上午
  [0.5, '#4A90E0', '#B8DCF5'],   // 正午
  [0.65, '#4A8AD4', '#A8D0E8'],  // 下午
  [0.73, '#4A5A9A', '#E88A5A'],  // 日落
  [0.78, '#101838', '#2A2448'],  // 黄昏后
  [0.85, '#050A1E', '#0E1630'],  // 夜
  [1.0, '#050A1E', '#0E1630'],
];

function lerpColor(a: string, b: string, t: number): string {
  return mix(a, b, t);
}

/** 原版日月贴图(Main.cs:62279 DrawSunAndMoon):Sun.png 整图 114×114;
 *  Moon_N.png 50×400 竖条 = 8 个相位帧(moonType 0-8 选表,moonPhase 选帧) */
function loadTex(name: string): HTMLImageElement {
  const im = new Image();
  im.src = `sprites/vanilla/${name}`;
  return im;
}

/** 原版云（Cloud.cs 语义）：贴图 Cloud_0..3、scale 0.70-1.31、风驱动 ±9*parallax px/帧、
 *  旋转微摆 ±0.02、按 scale 三层深度（远景压暗 R 通道）、AABB 拒绝重叠生成、淡入淡出。 */
interface VanillaCloud {
  type: number;
  x: number; y: number;         // 像素（y 为屏幕上部带）
  scale: number;
  rot: number; rSpeed: number;
  alpha: number;
  flip: boolean;
  kill: boolean;
}

export class SkyRenderer {
  private stars: Array<{ x: number; y: number; s: number }> = [];
  /** 原版云贴图（Cloud_0..3，懒加载） */
  private cloudTexs: Array<HTMLImageElement | null> = [null, null, null, null];
  private vclouds: VanillaCloud[] = [];
  /** 风——原版风场模型(Main.cs:10800/58222-58310):
   *  windSpeedTarget 随机游走 ±0.001 步、钳 ±0.35;windSpeedCurrent 以
   *  0.0003+|diff|*0.0015 /帧 向目标缓动。旧实现是满幅正弦(±1),云速快 3~10 倍。 */
  private wind = 0;            // windSpeedCurrent
  private windTarget = 0;      // windSpeedTarget
  private windCounter = 0;     // 重掷计数(帧)
  private windRng: () => number = Math.random;

  constructor() {
    for (let i = 0; i < 120; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() < 0.2 ? 2 : 1 });
    }
    for (let i = 0; i < 4; i++) {
      const im = new Image();
      im.src = `sprites/vanilla/Cloud_${i}.png`;
      this.cloudTexs[i] = im;
    }
    this.sunTex = loadTex('Sun.png');
    for (let i = 0; i <= 8; i++) this.moonTexs[i] = loadTex(`Moon_${i}.png`);
    // 风场初值(Main.cs:10800):current = ±0.8 随机,计数 7200-28800 帧
    this.wind = (Math.floor(Math.random() * 1601) - 800) * 0.001;
    this.windCounter = 7200 + Math.floor(Math.random() * 21601);
  }

  sunTex: HTMLImageElement;
  moonTexs: Array<HTMLImageElement | null> = [null, null, null, null, null, null, null, null, null];
  /** 世界月亮样式(原版 header moonType 0-8;默认 0 标准月) */
  moonType = 0;

  /** 原版 GetParallax（Cloud.cs:324-343） */
  private cloudParallax(scale: number): number {
    let base: number, s: number;
    if (scale < 1) { base = 0.07; s = (scale + 0.15 + 1) / 2; }
    else if (scale <= 1.15) { base = 0.19; s = scale - 0.075; }
    else { base = 0.23; s = scale - 0.15 - 0.075; }
    return base * s * s;
  }

  /** 原版 SpawnCloud（Cloud.cs:60-170）：scale/rotation/flip/位置/重叠拒绝 */
  private spawnCloud(viewW: number, viewH: number, initial: boolean): VanillaCloud | null {
    const c: VanillaCloud = {
      type: Math.floor(Math.random() * 4),
      x: 0, y: 0,
      scale: (70 + Math.random() * 61) / 100,
      rot: (Math.random() * 21 - 10) / 100,
      rSpeed: 0,
      alpha: initial ? 1 : 0,
      flip: Math.random() < 0.5,
      kill: false,
    };
    c.y = -viewH * 0.25 + Math.random() * viewH * 0.4;
    // 顺风侧留出屏外缓冲（原版 num3/num4 ±200 + 300 随机带）
    const margin = 300 + (this.wind > 0 ? 200 : 0);
    const lo = this.wind > 0 ? -margin - 200 : -margin;
    c.x = lo + Math.random() * (viewW + margin * 2 + (this.wind < 0 ? 200 : 0));
    // AABB 重叠拒绝
    const tex = this.cloudTexs[c.type];
    const w = (tex?.naturalWidth ?? 200) * c.scale, h = (tex?.naturalHeight ?? 80) * c.scale;
    for (const o of this.vclouds) {
      const ot = this.cloudTexs[o.type];
      const ow = (ot?.naturalWidth ?? 200) * o.scale, oh = (ot?.naturalHeight ?? 80) * o.scale;
      if (c.x < o.x + ow && c.x + w > o.x && c.y < o.y + oh && c.y + h > o.y) return null;
    }
    return c;
  }

  /** 原版风场步进(Main.cs:58270-58310):每帧目标随机游走/重掷,钳 ±0.35;
   *  当前值以 0.0003+|diff|*0.0015 /帧缓动(L58222-58245)。
   *  天气系统接入后弃用（weather.update 每帧推进权威风场，此处只读） */
  private updateWind(frames: number): void {
    if (this.weatherRef) {
      this.wind = this.weatherRef.windSpeedCurrent;
      this.windTarget = this.weatherRef.windSpeedTarget;
      return;
    }
    for (let f = 0; f < Math.ceil(frames); f++) {
      // 目标随机游走(L58270-58276):1/4 ±0.025 / 1/2 ±0.05 / 其余 ±0.1(×0.001)
      if (this.windRng() < 0.25) this.windTarget += (Math.floor(this.windRng() * 51) - 25) * 0.001;
      else if (this.windRng() < 0.5) this.windTarget += (Math.floor(this.windRng() * 101) - 50) * 0.001;
      else this.windTarget += (Math.floor(this.windRng() * 201) - 100) * 0.001;
      this.windTarget = Math.max(-0.35, Math.min(0.35, this.windTarget));
      // 重掷计数(L58284-58310):多数落在 0/±0.2,少数 ±0.4,极端 ±0.85
      if (--this.windCounter <= 0) {
        this.windCounter = 7200 + Math.floor(this.windRng() * 21601); // 7200-28800 帧
        const r = this.windRng();
        if (r < 13 / 30) {
          this.windTarget = this.windRng() < 0.5 ? 0 : (Math.floor(this.windRng() * 401) - 200) * 0.001;
        } else if (r < 13 / 30 + 13 / 20 * 17 / 30) {
          this.windTarget = (Math.floor(this.windRng() * 801) - 400) * 0.001;
        } else {
          this.windTarget = (Math.floor(this.windRng() * 1701) - 850) * 0.001;
        }
        this.windTarget = Math.max(-0.35, Math.min(0.35, this.windTarget));
      }
      // 当前值缓动(L58228-58244)
      const step = 0.0003 + Math.abs(this.windTarget - this.wind) * 0.0015;
      this.wind += Math.max(-step, Math.min(step, this.windTarget - this.wind));
    }
  }

  /** 原版 Update（Cloud.cs:348-443）：风驱动位移 + 淡入淡出 + 旋转微摆 + 越界回收 */
  private updateClouds(dtMs: number, viewW: number) {
    const frames = dtMs / (1000 / 60);
    this.updateWind(frames);
    for (const c of this.vclouds) {
      c.x += this.wind * 9 * this.cloudParallax(c.scale) * frames;
      if (!c.kill && c.alpha < 1) c.alpha = Math.min(1, c.alpha + 0.001 * frames);
      if (c.kill) {
        c.alpha -= 0.001 * frames;
        if (c.alpha <= 0) c.alpha = 0;
      }
      c.rSpeed += (Math.random() * 21 - 10) * 2e-5 * frames;
      c.rSpeed = Math.max(-0.0002, Math.min(0.0002, c.rSpeed));
      c.rot = Math.max(-0.02, Math.min(0.02, c.rot + c.rSpeed * frames));
    }
    const off = 600;
    this.vclouds = this.vclouds.filter((c) => {
      const tex = this.cloudTexs[c.type];
      const w = (tex?.naturalWidth ?? 200) * c.scale;
      return c.alpha > 0 && c.x + w > -off && c.x < viewW + off;
    });
  }

  /** 维持云量（原版每帧尝试 SpawnCloud；初始铺满，之后顺风补充）。
   *  天气联动：attachWeather 后目标云数由 numClouds 驱动（0-200 → 2-14 朵），雨/阴天加密 */
  private targetCloudCount(viewW: number): number {
    const base = Math.max(8, Math.round(viewW / 90));
    if (!this.weatherRef) return base;
    const density = Math.max(0, Math.min(1, this.weatherRef.numClouds / 200));
    return Math.max(1, Math.round(base * (0.15 + 0.95 * density)));
  }
  private maintainClouds(viewW: number, viewH: number) {
    const target = this.targetCloudCount(viewW);
    let guard = 0;
    while (this.vclouds.length < target && guard++ < 30) {
      const c = this.spawnCloud(viewW, viewH, this.vclouds.length < target * 0.6);
      if (c) this.vclouds.push(c);
    }
    // 超出目标：标记回收（淡出后移除）
    if (this.vclouds.length > target + 2) {
      const excess = this.vclouds.length - target;
      let killed = 0;
      for (const c of this.vclouds) {
        if (killed >= excess) break;
        if (!c.kill) { c.kill = true; killed++; }
      }
    }
  }

  /** 天气联动（Game.afterWorldLoad 注入）：风场以 weather 为权威（弃用内部迷你模型），
   *  云染色在下雨时向灰过渡（原版 cloudAlpha 下云变暗），闪电读 weather.lightning */
  weatherRef: import('../world/weather/Weather').WeatherState | null = null;
  attachWeather(w: import('../world/weather/Weather').WeatherState) {
    this.weatherRef = w;
  }

  /** 原版三层绘制（DrawClouds_Distant/Closer/Closest + NextHorizonRenderer.DrawCloud）：
   *  按视口宽缩放（cloud.position.Y*(H/600) 语义近似为 y 带），远景(scale<1)压暗 R/G 通道。 */
  private drawVanillaClouds(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, isNight: boolean, dtMs: number) {
    this.updateClouds(dtMs, viewW);
    this.maintainClouds(viewW, viewH);
    // 近→远排序绘制（近的在上）
    const sorted = [...this.vclouds].sort((a, b) => b.scale - a.scale);
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 原版云为软边贴图，平滑缩放
    for (const c of sorted) {
      const tex = this.cloudTexs[c.type];
      if (!tex || !tex.complete || tex.naturalWidth === 0) continue;
      const w = tex.naturalWidth * c.scale, h = tex.naturalHeight * c.scale;
      const dim = c.scale < 1 ? c.scale * 0.8 : 1; // 原版远景压暗（OriginalColorsForCloud pass1）
      const nightDim = isNight ? 0.25 : 1;
      let r = Math.round(255 * dim * nightDim);
      let g = Math.round(255 * (c.scale < 1 ? ((c.scale + 1) / 2) * 0.9 : 1) * nightDim);
      let b = Math.round(255 * nightDim);
      // 天气联动：雨/阴天云向灰过渡（原版 cloudAlpha 下云变暗变灰）
      const wr = this.weatherRef;
      if (wr && wr.cloudAlpha > 0) {
        const rainK = wr.cloudAlpha * 0.55;
        r = Math.round(r * (1 - rainK) + 158 * rainK);
        g = Math.round(g * (1 - rainK) + 162 * rainK);
        b = Math.round(b * (1 - rainK) + 168 * rainK);
      }
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.translate(c.x + w / 2, c.y + h / 2);
      ctx.rotate(c.rot);
      if (c.flip) ctx.scale(-1, 1);
      // tint：先画原图再叠色保留形状（云端白色为主，直接 source-atop 着色近似原版 cloudColor）
      const tinted = this.cloudTint(tex, r, g, b);
      ctx.drawImage(tinted, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private cloudTintCache = new Map<string, HTMLCanvasElement>();
  /** 云朵着色缓存（multiply + destination-in 保形） */
  private cloudTint(tex: HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement {
    const key = `${tex.src}|${r},${g},${b}`;
    const hit = this.cloudTintCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = tex.naturalWidth; c.height = tex.naturalHeight;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = true;
    cx.drawImage(tex, 0, 0);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(tex, 0, 0);
    this.cloudTintCache.set(key, c);
    if (this.cloudTintCache.size > 64) {
      const first = this.cloudTintCache.keys().next().value;
      if (first !== undefined) this.cloudTintCache.delete(first);
    }
    return c;
  }

  skyColors(t: number): [string, string] {
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      const [t0, a0, b0] = SKY_KEYS[i];
      const [t1, a1, b1] = SKY_KEYS[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        return [lerpColor(a0, a1, f), lerpColor(b0, b1, f)];
      }
    }
    return [SKY_KEYS[0][1], SKY_KEYS[0][2]];
  }

  draw(ctx: CanvasRenderingContext2D, clock: Clock, viewW: number, viewH: number, camX: number, dtMs = 16.7) {
    const t = clock.timeOfDay;
    const [top, bottom] = this.skyColors(t);
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    // 闪电白（原版 Main.cs:63346：bgColor 向白 lerp lightning——纯闪白不画贴图）
    if (this.weatherRef && this.weatherRef.lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.weatherRef.lightning * 0.85)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    const isNight = t < 0.27 || t > 0.78;
    // 星星
    if (isNight) {
      const fade = Math.min(1, Math.max(0, (t < 0.5 ? (0.27 - t) / 0.05 : (t - 0.78) / 0.05)));
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#E8ECFF';
      for (const s of this.stars) {
        const sx = ((s.x * viewW * 2 - camX * 0.1) % (viewW * 2) + viewW * 2) % (viewW * 2);
        if (sx > viewW) continue;
        ctx.fillRect(sx, s.y * viewH, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }

    // ---- 原版太阳/月亮(Main.cs:62279 DrawSunAndMoon 一比一)----
    // 昼夜时间(我们 0.25/0.75 边界 → 原版 day 0-54000 / night 0-32400)
    const isDay = t > 0.25 && t < 0.75;
    const dayTime = isDay ? ((t - 0.25) / 0.5) * 54000 : 0;
    const nightTime = !isDay ? ((((t - 0.75) + 1) % 1) / 0.5) * 32400 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (isDay) {
      const tex = this.sunTex;
      if (tex.complete && tex.naturalWidth > 0) {
        // 原版:x = time/54000*(屏宽+图宽*2)-图宽(横穿);y = bgTopY + |t*2-1|²*250+180(正午最高);
        // scale = (1.2-|t*2-1|²*0.4)*1.1;rotation = t*2-7.3(t=time/54000)
        const ft = dayTime / 54000;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const x = ft * (viewW + tex.width * 2) - tex.width;
        const y = dip * 250 + 180;
        const scale = (1.2 - dip * 0.4) * 1.1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ft * 2 - 7.3);
        ctx.drawImage(tex, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
        ctx.restore();
      }
    } else {
      const tex = this.moonTexs[Math.max(0, Math.min(8, this.moonType))];
      if (tex && tex.complete && tex.naturalWidth > 0) {
        const mw = tex.width; // 相位帧宽(50)
        const ft = nightTime / 32400;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const x = ft * (viewW + mw * 2) - mw;
        const y = dip * 250 + 180;
        const scale = 1.2 - dip * 0.4;
        const phase = Math.max(0, Math.min(7, clock.dayCount % 8));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ft * 2 - 7.3);
        // 原版:竖条第 moonPhase 帧(0,MW*moonPhase,MW,MW),原点为中心
        ctx.drawImage(tex, 0, mw * phase, mw, mw,
          -mw / 2 * scale, -mw / 2 * scale, mw * scale, mw * scale);
        ctx.restore();
      }
    }
    ctx.restore();

    // 云：原版素材与规则（Cloud.cs / NextHorizonRenderer.DrawCloud）
    this.drawVanillaClouds(ctx, viewW, viewH, isNight, dtMs);

    // 远山最后绘制（最前层）：太阳和云在山后，不会出现在山前
    this.drawMountains(ctx, viewW, viewH, camX);
  }

  // ---- 远山（青绿远岫，多倍频脊线）----
  private mountainLayers: Array<{ pts: number[]; top: string; body: string; parallax: number; baseYF: number; ampF: number }> = [];

  private buildMountains() {
    const W = 1600;
    // 双倍频值噪声脊线。控制点按周期取样（首尾同值）→ 图案无缝平铺，
    // 消除接缝处的垂直悬崖（"被一刀砍"的根源）；pow 收尖山峰、压平谷底
    const SEGS1 = 8, SEGS2 = 40;
    const mk = (seed: number, amp: number, oct2: number): number[] => {
      let h = seed >>> 0;
      const rnd = () => {
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        h ^= h >>> 13;
        return ((h >>> 0) % 1000) / 1000;
      };
      const ctrl1: number[] = [], ctrl2: number[] = [];
      for (let i = 0; i < SEGS1; i++) ctrl1.push(rnd());
      for (let i = 0; i < SEGS2; i++) ctrl2.push(rnd());
      const pts: number[] = [];
      for (let x = 0; x <= W; x++) {
        const f1 = (x / W) * SEGS1;
        const i0 = Math.floor(f1), s1 = f1 - i0;
        const sm1 = s1 * s1 * (3 - 2 * s1);
        const v1 = ctrl1[i0 % SEGS1] * (1 - sm1) + ctrl1[(i0 + 1) % SEGS1] * sm1;
        const f2 = (x / W) * SEGS2;
        const j0 = Math.floor(f2), s2 = f2 - j0;
        const sm2 = s2 * s2 * (3 - 2 * s2);
        const v2 = ctrl2[j0 % SEGS2] * (1 - sm2) + ctrl2[(j0 + 1) % SEGS2] * sm2;
        const v = v1 * 0.75 + v2 * oct2 * 0.25;
        pts.push(Math.pow(v, 1.25) * amp + amp * 0.2);
      }
      return pts;
    };
    // 远→近：青绿渐深（远山如黛）
    this.mountainLayers = [
      { pts: mk(12345, 1.0, 0.5), top: '#A8C4B4', body: '#94B29E', parallax: 0.1, baseYF: 0.62, ampF: 0.26 },
      { pts: mk(54321, 0.8, 0.7), top: '#7FA88C', body: '#6E9276', parallax: 0.18, baseYF: 0.7, ampF: 0.2 },
      { pts: mk(98765, 0.62, 0.9), top: '#5E8A68', body: '#50745A', parallax: 0.28, baseYF: 0.78, ampF: 0.15 },
    ];
  }

  private drawMountains(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number) {
    if (!this.mountainLayers.length) this.buildMountains();
    const W = 1600;
    const reps = Math.ceil(viewW / W) + 2;
    for (const layer of this.mountainLayers) {
      const baseY = viewH * layer.baseYF;
      const off = ((-camX * layer.parallax) % W + W) % W;
      // 山体（垂直渐变：山顶亮 → 山脚深）
      for (let rep = -1; rep <= reps; rep++) {
        const x0 = off + rep * W;
        const ridgeTop = baseY - layer.ampF * viewH;
        const grad = ctx.createLinearGradient(0, ridgeTop, 0, baseY + 30);
        grad.addColorStop(0, layer.top);
        grad.addColorStop(1, layer.body);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, baseY + 30);
        const step = 4;
        for (let i = 0; i <= W; i += step) {
          ctx.lineTo(x0 + i, baseY - layer.pts[i] * layer.ampF * viewH);
        }
        ctx.lineTo(x0 + W, baseY + 30);
        ctx.closePath();
        ctx.fill();
      }
      // 山脊受光描边（左上亮）
      ctx.strokeStyle = layer.top;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55;
      for (let rep = -1; rep <= reps; rep++) {
        const x0 = off + rep * W;
        ctx.beginPath();
        const step = 4;
        for (let i = 0; i <= W; i += step) {
          const y = baseY - layer.pts[i] * layer.ampF * viewH;
          if (i === 0) ctx.moveTo(x0 + i, y);
          else ctx.lineTo(x0 + i, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 山脚雾带（大气透视）
    const fog = ctx.createLinearGradient(0, viewH * 0.6, 0, viewH * 0.82);
    fog.addColorStop(0, 'rgba(200,216,214,0)');
    fog.addColorStop(1, 'rgba(200,216,214,0.45)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, viewH * 0.6, viewW, viewH * 0.22);
  }
}
