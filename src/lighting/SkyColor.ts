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
export function setBackColor(mainTime: number, isDay: boolean, phase: number): [number, number, number] {
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
    if (t < 16200) {
      // 入夜(18:00-23:00)
      const p = 1 - t / 16200;
      r = 30 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
    } else {
      // 深夜(23:00-4:30)
      const p = (t / 32400 - 0.5) * 2;
      r = 20 * p + 5; g = 30 * p + 5; b = 30 * p + 5;
    }
  }
  // 月相地板(Main.cs:63230-63266):每通道下限
  const floor = MOON_FLOOR[phase % 8];
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

/** 一次调用得到天空光种子(0-1 RGB) */
export function skySeed(timeOfDay: number, dayCount: number): [number, number, number] {
  const isDay = timeOfDay > 0.25 && timeOfDay < 0.75;
  const t = toVanillaTime(timeOfDay, isDay);
  return tileColor(setBackColor(t, isDay, moonPhase(dayCount)));
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

  /** cursorScale(Main.cs:51905):= cursorAlpha*0.3 + 0.8,资源条 flag 心/星缩放脉冲源 */
  get cursorScale(): number { return this.cursorAlpha * 0.3 + 0.8; }

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
  }

  /** 恶魔火把色插值(TorchID DemonTorchLight:37-45) */
  demonTorchColor(): [number, number, number] {
    const d = this.demonTorch;
    return [0.5 * d + 1 * (1 - d), 0.3, 1 * d + 0.5 * (1 - d)];
  }

  /** 微光火把色(TorchID ShimmerTorchLight:48-62;num/num2 由 mouseTextColor 派生钳 0-1) */
  shimmerTorchColor(): [number, number, number] {
    const num = Math.min(1, Math.max(0, (this.mouseTextColor - 190) / 65));
    const num2 = 1 - num;
    return [num * 0.9, num2 * 0.55, num * 1.2];
  }

  discoColor(): [number, number, number] {
    return [this.discoR / 255, this.discoG / 255, this.discoB / 255];
  }
}
