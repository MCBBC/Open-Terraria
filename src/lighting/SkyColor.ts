// 天空色与全局闪烁驱动(纯函数,Main.cs 数值一比一)。
// 我们的 Clock:timeOfDay 0-1(0=午夜 0.5=正午),isDay=(0.25,0.75)。
// 原版 Main.time:昼 0-54000(4:30-18:00),夜 54000-86400。此处做时间映射,
// 不改 Clock 本身(SkyRenderer/音频仍吃 World.dayFactor)。
import { MOON_FLOOR } from './lightTables';

/** timeOfDay → 原版 Main.time(0-86400) */
export function toVanillaTime(timeOfDay: number, isDay: boolean): number {
  if (isDay) {
    // 0.25(6:00 日出边界)→0,0.75(18:00)→54000,向两端外延钳制
    const p = (timeOfDay - 0.25) / 0.5;
    return Math.max(0, Math.min(1, p)) * 54000;
  }
  const p = ((timeOfDay - 0.75 + 1) % 1) / 0.5;
  return 54000 + Math.max(0, Math.min(1, p)) * 32400;
}

/** 月相 0-7(Main.cs:64880:每黎明 +1 mod 8;dayCount 从 1 起,首夜相位 0) */
export function moonPhase(dayCount: number): number {
  return Math.max(0, dayCount) % 8;
}

/** SetBackColor 五段昼夜曲线(Main.cs:62889-63362 主体)→ [R,G,B] 0-255 */
export function setBackColor(mainTime: number, isDay: boolean, phase: number, bloodMoon = false): [number, number, number] {
  let r: number, g: number, b: number;
  if (isDay) {
    if (mainTime < 13500) {
      // 黎明(4:30-7:30):暖橙 → 白
      const p = mainTime / 13500;
      r = 230 * p + 25; g = 220 * p + 35; b = 220 * p + 35;
    } else if (mainTime > 37800 && mainTime <= 45900) {
      // 黄昏前段(15:15-17:45):白 → 橙
      const p = 1 - (mainTime / 54000 - 0.7) * 6.666666666666667;
      r = 20 * p + 235; g = 135 * p + 120; b = 85 * p + 170;
    } else if (mainTime > 45900) {
      // 黄昏后段(17:45-18:00)→ 夜前
      const p = 1 - (mainTime / 54000 - 0.85) * 6.666666666666667;
      r = 200 * p + 35; g = 85 * p + 35; b = 135 * p + 35;
    } else {
      r = 255; g = 255; b = 255; // 正午全亮
    }
  } else {
    const t = mainTime - 54000;
    if (bloodMoon) {
      // ★血月夜曲线（Main.cs:62945-62961）：R=75→35 红移夜
      if (t < 16200) {
        const p = 1 - t / 16200;
        r = 75 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
      } else {
        const p = (t / 32400 - 0.5) * 2;
        r = 35 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
      }
    } else if (t < 16200) {
      // 入夜(18:00-23:00)
      const p = 1 - t / 16200;
      r = 30 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
    } else {
      // 深夜(23:00-4:30)
      const p = (t / 32400 - 0.5) * 2;
      r = 20 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
    }
  }
  // 月相地板(Main.cs:63230-63266):每通道下限；血月恒 25（:63266-63277）
  const floor = bloodMoon ? 25 : MOON_FLOOR[phase % 8];
  r = Math.max(r, floor); g = Math.max(g, floor); b = Math.max(b, floor);
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

/** tileColor(Main.cs:62608-62616):天空色 → 地表光种子(0-1 RGB)。
 *  tileColor.C = (R+G+B + 7C)/10:向本通道倾斜的加权均值 */
export function tileColor(bg: readonly [number, number, number]): [number, number, number] {
  const sum = bg[0] + bg[1] + bg[2];
  return [
    (sum + 7 * bg[0]) / 10 / 255,
    (sum + 7 * bg[1]) / 10 / 255,
    (sum + 7 * bg[2]) / 10 / 255,
  ];
}

/** 一次调用得到天空光种子(0-1 RGB)。eclipse=true 时按 Main.cs:63282-63305 压暗：
 *  eclipseLight = min(1, 白天 Main.time/1242)（约 25 游戏秒到满暗）；R×(1-0.925L)
 *  G×(1-0.96L) B×(1-1.0L)——蓝色通道清零、红色保留 7.5% 的血红暮色 */
export function skySeed(timeOfDay: number, dayCount: number, eclipse = false, bloodMoon = false, moonPhaseNow?: number): [number, number, number] {
  // ★昼夜窗口对齐 Clock（DAWN=0.1875/DUSK=0.8125，昼 4:30-19:30）——曾用
  // (0.25,0.75) 两端各差 1.5h，18:00-19:30 天空光差 ~4.4 倍
  const isDay = timeOfDay > 0.1875 && timeOfDay < 0.8125;
  const t = toVanillaTime(timeOfDay, isDay);
  void dayCount;
  let bg = setBackColor(t, isDay, moonPhaseNow ?? moonPhase(dayCount), bloodMoon);
  if (eclipse && isDay) {
    const L = Math.min(1, t / 1242);
    bg = [
      bg[0] * (1 - 0.925 * L),
      bg[1] * (1 - 0.96 * L),
      bg[2] * (1 - 1 * L),
    ];
  }
  return tileColor(bg);
}

// ---- 全局闪烁驱动(火把动态时钟源,由引擎每 tick 推进) ----
// 四态全部封装在一个小状态机里,等价原版 Main.CursorColor(51896-51905)+
// DoUpdate_AnimateCursorColors(18064-18076)/DoUpdate_AnimateTileGlows(18087-18101)/
// DoUpdate_AnimateDiscoRGB(19442-19502)。
export class FlickerClock {
  /** mouseTextColor:190↔255 步进 1/帧(字节环绕) */
  mouseTextColor = 255;
  private mouseDir = -1;
  /** cursorAlpha(Main.cs:51897-51904):0.6↔1 步进 0.015/帧,驱动光标/心/星呼吸 */
  cursorAlpha = 1;
  private cursorDir = -1;
  /** demonTorch:0↔1 步进 0.01/帧 */
  demonTorch = 0;
  private demonDir = 1;
  /** Disco RGB:6 相循环,每通道步进 7/帧(0-255) */
  discoR = 255; discoG = 0; discoB = 0;
  private discoStyle = 0;
  /** Main.essScale（Main.cs:602 初值 1、:61705-61713 ±0.01/帧钳 0.7-1.0，绘制帧推进）——
   *  四柱魂掉落光/夜爬虫光乘区 */
  essScale = 1;
  private essDir = -1;
  /** Main.timeForVisualEffects（Main.cs:17110 每帧 +1，钳 216000）——微光波形/瓶中物动画时钟 */
  timeForVisualEffects = 0;
  /** 水母笼动画态（Main.cs:16470-16530 jellyfishCageMode[3,25]：0 静息/1 起跳/2 高亮/3 落回
   *  ——光照只读 mode==2；转换率逐槽独立掷 Main.rand，此处 Math.random 等价） */
  private jellyMode = new Uint8Array(3 * 25);
  private jellyCounter = new Uint16Array(3 * 25);
  private jellyFrame = new Uint8Array(3 * 25);

  /** cursorScale(Main.cs:51905):= cursorAlpha*0.3 + 0.8,资源条 flag 心/星缩放脉冲源 */
  get cursorScale(): number { return this.cursorAlpha * 0.3 + 0.8; }

  /** Main.GlobalTimeWrappedHourly（Main.cs:16777 TotalGameTime 秒数 % 3600——真实运行秒） */
  get globalTimeWrappedHourly(): number {
    return typeof performance !== 'undefined' ? (performance.now() / 1000) % 3600 : 0;
  }

  /** 水母笼 mode 读口（TileLightScanner case 316-318：mode==2 = 高亮档） */
  jellyfishCageMode(type: 0 | 1 | 2, slot: number): number {
    return this.jellyMode[type * 25 + (slot % 25)];
  }

  tick(): void {
    this.cursorAlpha += this.cursorDir * 0.015;
    if (this.cursorAlpha >= 1) { this.cursorAlpha = 1; this.cursorDir = -1; }
    else if (this.cursorAlpha <= 0.6) { this.cursorAlpha = 0.6; this.cursorDir = 1; }

    this.mouseTextColor += this.mouseDir;
    if (this.mouseTextColor >= 255) this.mouseDir = -1;
    else if (this.mouseTextColor <= 190) this.mouseDir = 1;

    this.demonTorch += this.demonDir * 0.01;
    if (this.demonTorch > 1) { this.demonTorch = 1; this.demonDir = -1; }
    else if (this.demonTorch < 0) { this.demonTorch = 0; this.demonDir = 1; }

    // 6 相:G↑ → R↓ → B↑ → G↓ → R↑ → B↓(每帧步进 7,满额切换下一相)
    const STEP = 7;
    switch (this.discoStyle) {
      case 0: this.discoG += STEP; if (this.discoG >= 255) { this.discoG = 255; this.discoStyle = 1; } break;
      case 1: this.discoR -= STEP; if (this.discoR <= 0) { this.discoR = 0; this.discoStyle = 2; } break;
      case 2: this.discoB += STEP; if (this.discoB >= 255) { this.discoB = 255; this.discoStyle = 3; } break;
      case 3: this.discoG -= STEP; if (this.discoG <= 0) { this.discoG = 0; this.discoStyle = 4; } break;
      case 4: this.discoR += STEP; if (this.discoR >= 255) { this.discoR = 255; this.discoStyle = 5; } break;
      case 5: this.discoB -= STEP; if (this.discoB <= 0) { this.discoB = 0; this.discoStyle = 0; } break;
    }

    // essScale 三角波（Main.cs:61705-61713）
    this.essScale += this.essDir * 0.01;
    if (this.essScale > 1) { this.essScale = 1; this.essDir = -1; }
    else if (this.essScale < 0.7) { this.essScale = 0.7; this.essDir = 1; }

    // timeForVisualEffects（:17110-17112）
    if (++this.timeForVisualEffects >= 216000) this.timeForVisualEffects = 0;

    // 水母笼 3×25 槽态机（Main.cs:16470-16530 逐帧推进）
    for (let s = 0; s < 3 * 25; s++) {
      const m = this.jellyMode[s];
      this.jellyCounter[s]++;
      if (m === 0 && Math.random() < 1 / 1800) this.jellyMode[s] = 1;
      if (m === 2 && Math.random() < 1 / 60) this.jellyMode[s] = 3;
      // 帧步进速率（:16483-16494）——只影响绘制帧；光照仅看 mode
      let rate = 1;
      if (m === 0) rate = 10 + Math.floor(Math.random() * 10);       // Next(10,20)
      else if (m === 1) rate = 15 + Math.floor(Math.random() * 10);  // Next(15,25)
      else if (m === 2) rate = 4 + Math.floor(Math.random() * 5);    // Next(4,9)
      else rate = 15 + Math.floor(Math.random() * 10);               // Next(15,25)
      const f = this.jellyFrame[s];
      const gate = (m === 0 && f <= 3) || (m === 1 && f <= 7) || (m === 2 && f <= 9) || (m === 3 && f <= 10);
      if (gate && this.jellyCounter[s] >= rate) {
        this.jellyCounter[s] = 0;
        this.jellyFrame[s]++;
        if (m === 0 && this.jellyFrame[s] >= 4) this.jellyFrame[s] = 0;
        if (m === 1 && this.jellyFrame[s] >= 7) { this.jellyFrame[s] = 7; this.jellyMode[s] = 2; }
        if (m === 2 && this.jellyFrame[s] >= 9) this.jellyFrame[s] = 7;
        if (m === 3 && this.jellyFrame[s] >= 10) this.jellyFrame[s] = 3;
      }
    }
  }

  /** Main.hslToRgb（Main.cs:47266-47296 HSL→RGB，byte 取整）——彩虹蜡烛/熔岩灯光色用 */
  hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const toB = (v: number) => Math.round(hue2rgb(p, q, v) * 255) / 255;
    return [toB(h + 1 / 3), toB(h), toB(h - 1 / 3)];
  }

  /** LiquidRenderer.GetShimmerBaseColor（:803-807 + GetShimmerWave :761-764）：
   *  wave=sin(((x+y/6)/10 − timeForVisualEffects/360)×2π)，
   *  lerp(A=(0.647,0.510,0.933), B=(0.804,0.804,1), 0.1+wave×0.4) */
  shimmerBaseColor(x: number, y: number): [number, number, number] {
    const wave = Math.sin(((x + y / 6) / 10 - this.timeForVisualEffects / 360) * Math.PI * 2);
    const t = 0.1 + wave * 0.4;
    const L = (a: number, b: number) => a + (b - a) * t;
    return [L(0.64705884, 41 / 51), L(26 / 51, 41 / 51), L(14 / 15, 1)];
  }

  /** 恶魔火把色插值(TorchID DemonTorchLight:37-45) */
  demonTorchColor(): [number, number, number] {
    const d = this.demonTorch;
    return [0.5 * d + 1 * (1 - d), 0.3, 1 * d + 0.5 * (1 - d)];
  }

  /** 微光火把色(TorchID ShimmerTorchLight:48-62;num/num2 由 mouseTextColor 派生钳 0-1) */
  shimmerTorchColor(): [number, number, number] {
    // ★原版公式（TorchID.cs:48-62）：num=clamp(0.9+(270-mt)/900)、
    // num2=clamp(0.9+(270-mt)/125)（恒=1）→ r=num*0.9、g=0.55、b=num*1.2
    // ——近常量微摆；曾误读成 (mt-190)/65 三角波大幅摆动
    const num = Math.min(1, Math.max(0, 0.9 + (270 - this.mouseTextColor) / 900));
    return [num * 0.9, 0.55, num * 1.2];
  }

  discoColor(): [number, number, number] {
    return [this.discoR / 255, this.discoG / 255, this.discoB / 255];
  }
}
