// 信息饰品系统单测(Player.cs:12319-12400 门禁矩阵 + Main.cs 各行换算器 1:1)
import { describe, it, expect, beforeAll } from 'vitest';
import { Lang } from '../src/i18n/Lang';
import {
  emptyInfoAccGates, refreshInfoAccsFromItemType, infoAccGatesOf,
  formatWatchText, formatCompassText, formatDepthText, mphOf,
  type InfoAccGates,
} from '../src/stats/InfoAccs';

const gates = (...vids: number[]) => infoAccGatesOf(vids);

// 单测环境无语言包:打桩 Lang.text 直接回传参数(键名即断言语义)
beforeAll(() => {
  (Lang as unknown as { text: (p: string, ...a: unknown[]) => string }).text = ((p: string, ...a: unknown[]) =>
    (a.length ? p.replace(/\{\d\}/g, () => String(a.shift())) : p)) as never;
});

describe('refreshInfoAccsFromItemType 22×12 矩阵(Player.cs:12319-12400)', () => {
  it('六表按 max 取级(铜锡1/银钨2/金铂3)', () => {
    expect(gates(15).accWatch).toBe(1);
    expect(gates(707).accWatch).toBe(1);
    expect(gates(16).accWatch).toBe(2);
    expect(gates(708).accWatch).toBe(2);
    expect(gates(17).accWatch).toBe(3);
    expect(gates(709).accWatch).toBe(3);
    // 组合:铜表+金表 → 3(取 max)
    expect(gates(15, 17).accWatch).toBe(3);
  });

  it('深度计 18 / 罗盘 393', () => {
    expect(gates(18).accDepthMeter).toBe(1);
    expect(gates(393).accCompass).toBe(1);
    expect(gates(18).accWatch).toBe(0); // 只开自己
  });

  it('GPS 395:watch=3+depth+compass(不碰其余)', () => {
    const g = gates(395);
    expect(g.accWatch).toBe(3);
    expect(g.accDepthMeter).toBe(1);
    expect(g.accCompass).toBe(1);
    expect(g.accFishFinder).toBe(false);
    expect(g.accDreamCatcher).toBe(false);
  });

  it('三大组合各开三项', () => {
    // FishFinder 3036 = 渔夫指南3120+天气电台3037+六分仪3096
    const g1 = gates(3036);
    expect(g1.accFishFinder).toBe(true);
    expect(g1.accWeatherRadio).toBe(true);
    expect(g1.accCalendar).toBe(true);
    expect(g1.accThirdEye).toBe(false);
    // REK 3122 = 雷达3084+计数器3095+分析仪3118
    const g2 = gates(3122);
    expect(g2.accThirdEye).toBe(true);
    expect(g2.accJarOfSouls).toBe(true);
    expect(g2.accCritterGuide).toBe(true);
    expect(g2.accStopwatch).toBe(false);
    // GoblinTech 3121 = 秒表3099+金属探测3102+DPS计3119
    const g3 = gates(3121);
    expect(g3.accStopwatch).toBe(true);
    expect(g3.accOreFinder).toBe(true);
    expect(g3.accDreamCatcher).toBe(true);
    expect(g3.accCalendar).toBe(false);
  });

  it('PDA 3123 / 手机 3124 / 贝壳手机 5358-5361 全开 12 项且 watch=3', () => {
    for (const vid of [3123, 3124, 5358, 5359, 5360, 5361]) {
      const g = gates(vid);
      expect(g.accWatch, `vid ${vid}`).toBe(3);
      expect(g.accCompass).toBe(1);
      expect(g.accDepthMeter).toBe(1);
      expect(g.accCalendar).toBe(true);
      expect(g.accFishFinder).toBe(true);
      expect(g.accWeatherRadio).toBe(true);
      expect(g.accThirdEye).toBe(true);
      expect(g.accJarOfSouls).toBe(true);
      expect(g.accCritterGuide).toBe(true);
      expect(g.accStopwatch).toBe(true);
      expect(g.accOreFinder).toBe(true);
      expect(g.accDreamCatcher).toBe(true);
    }
  });

  it('单件叶子只开自己的位(抽查雷达/计数器/分析仪/秒表/探测/DPS/电台/指南/六分仪)', () => {
    const cases: Array<[number, (g: InfoAccGates) => boolean]> = [
      [3084, (g) => g.accThirdEye],
      [3095, (g) => g.accJarOfSouls],
      [3118, (g) => g.accCritterGuide],
      [3099, (g) => g.accStopwatch],
      [3102, (g) => g.accOreFinder],
      [3119, (g) => g.accDreamCatcher],
      [3037, (g) => g.accWeatherRadio],
      [3120, (g) => g.accFishFinder],
      [3096, (g) => g.accCalendar],
    ];
    for (const [vid, pick] of cases) {
      expect(pick(gates(vid)), `vid ${vid}`).toBe(true);
      // 其余位不得误开
      const g = gates(vid);
      expect(g.accWatch).toBe(0);
      expect(g.accThirdEye === true && vid !== 3084).toBe(false);
    }
  });

  it('空装备=全 0/false', () => {
    const g = emptyInfoAccGates();
    expect(g.accWatch).toBe(0);
    expect(g.accCompass).toBe(0);
    expect(g.accDepthMeter).toBe(0);
    expect(Object.values(g).slice(3).every((v) => v === false)).toBe(true);
  });
});

describe('换算器(Main.cs 字面)', () => {
  it('formatWatchText:起始 8:15AM(Main.time 13500)→ 级3 显示 8:15 上午', () => {
    // :46193-46236:t=13500, day → /86400*24=3.75 -19.5 = -15.75 +24 = 8.25 → 8:15 AM
    expect(formatWatchText(13500, true, 3)).toBe('8:15 GameUI.TimeAtMorning');
  });

  it('formatWatchText 级1 恒 :00 / 级2 半点取整', () => {
    expect(formatWatchText(13500, true, 1)).toBe('8:00 GameUI.TimeAtMorning');
    expect(formatWatchText(13500, true, 2)).toBe('8:00 GameUI.TimeAtMorning'); // 15 分 <30 → 00
  });

  it('formatCompassText:中心/东/西(1 格=2 英尺)', () => {
    // (cx*2/16 - maxTilesX):0 → 水平面;正 → 东
    expect(formatCompassText(4200 * 16 / 2, 4200)).toBe('GameUI.CompassCenter'); // feet=0(中心=世界中央)
    expect(formatCompassText((2100 + 100) * 16, 4200)).toBe('GameUI.CompassEast 200'); // +200 英尺
    expect(formatCompassText((2100 - 100) * 16, 4200)).toBe('GameUI.CompassWest 200');
  });

  it('formatDepthText:四地层边界(太空/地表/地下/洞穴/地狱)', () => {
    // 参数:(bottomYpx, centerYpx, worldSurface, rockLevel, maxTilesX, maxTilesY)
    // 地表世界 worldSurface=331 rockLevel=427 maxTilesY=1200
    // 地表:bottomY≈地表线(5296)→ feet≈0 → Surface(Space 判据 num24<1)
    const s = formatDepthText(331 * 16, 331 * 16 - 21, 331, 427, 4200, 1200);
    expect(s).toContain('GameUI.Layer');
    // 地狱:bottomY > (1200-204)*16 → Underworld
    const h = formatDepthText(1005 * 16, 1000 * 16, 331, 427, 4200, 1200);
    expect(h).toContain('LayerUnderworld');
    // 洞穴:bottomY > rockLevel*16=6832 且非地狱
    const c = formatDepthText(700 * 16, 700 * 16 - 21, 331, 427, 4200, 1200);
    expect(c).toContain('LayerCaverns');
    // 地下:feet>0 且 < rockLayer
    const u = formatDepthText(400 * 16, 400 * 16 - 21, 331, 427, 4200, 1200);
    expect(u).toContain('LayerUnderground');
  });

  it('mphOf:基准换算 + 液体修正(蜜/4 微光×0.375 水/2 merman 豁免)', () => {
    // avg × 216000/42240 ≈ ×5.1136
    expect(mphOf(1, { honey: false, shimmer: false, water: false, merman: false })).toBeCloseTo(5.1136, 3);
    expect(mphOf(1, { honey: true, shimmer: false, water: false, merman: false })).toBeCloseTo(5.1136 / 4, 3);
    expect(mphOf(1, { honey: false, shimmer: true, water: false, merman: false })).toBeCloseTo(5.1136 * 0.375, 3);
    expect(mphOf(1, { honey: false, shimmer: false, water: true, merman: false })).toBeCloseTo(5.1136 / 2, 3);
    expect(mphOf(1, { honey: false, shimmer: false, water: true, merman: true })).toBeCloseTo(5.1136, 3);
  });
});
