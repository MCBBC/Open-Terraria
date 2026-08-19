// 原版地平线系统(NextHorizonRenderer/SunGradients/HorizonHelper 1:1 纯数据/函数)。
// 2026-08-20 光照专案:用户定案"按原版源码设计方式落地"——晨昏渐变可见性窗口、
// 日光色曲线、月色表、镜头光斑元素链全部数值 1:1 移植;消费方 SkyRenderer/Renderer。
//
// 反编译锚点:
//  · 可见性窗口 GetVisibilities:NextHorizonRenderer.cs:217-256
//    日出: Remap(t,0,2700,0,1)×Remap(t,3600,10800,1,0)
//    日落: Remap(t,43200,50400,0,1)×Remap(t,50400,54000,1,0)²
//    公共: ×atmo×(1-cloudAlpha)²×(1-蘑菇影响)×celestial
//  · celestial = GetCelestialEffectPower(:260-268):日 Remap(t,0,3600,0,1)×
//    Remap(t,52200,54000,1,0);夜 Remap(t,0,3600,0,1)×Remap(t,30600,32400,1,0)
//  · 日光色 sunColor:SetBackColor Main.cs:62896-62931(黎明/黄昏前/黄昏后三段)
//  · 月色 MoonColors[9]/事件覆写:HorizonHelper.cs:29-133
//  · 月强度 GetMoonStrength:|4-moonPhase| Remap 0..4→0..1
//  · 晨昏 15 帧梯度×4 调色板:SunGradients.cs:13-147(Blue/Violet/Yellow/Aluminum 日出;
//    Blue/Dark/Pink/Red 日落)——HorizonPhase=moonPhase(白昼前半天再−1,Main.cs:2865-2875)
//  · 地平线光渗入 bgColor(SetBackColor 尾 :63356 ModifyHorizonLight):与梯度中帧色
//    BlendColor(逐通道 max 后按可见度 lerp)
//  · 镜头光斑元素链:NextHorizonRenderer.cs:410-536(元素几何 LensFlareElement.cs:20-46:
//    沿太阳→屏心连线的 Lerp(sun,center,dist×2) 布点,沿线旋转,逐重复 scale/intensity 衰减)

/** Utils.Remap(x, fromMin, fromMax, toMin, toMax) 等价(fromMin>fromMax 时反向) */
function remap(x: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  if (fromMin < fromMax) {
    if (x < fromMin) return toMin;
    if (x > fromMax) return toMax;
  } else {
    if (x < fromMax) return toMax;
    if (x > fromMin) return toMin;
  }
  return (x - fromMin) / (fromMax - fromMin) * (toMax - toMin) + toMin;
}

// ---- 晨昏 15 帧梯度(SunGradients.cs 逐值) ----
export const SUNRISE_GRADS: ReadonlyArray<readonly (readonly [number, number, number])[]> = [
  // Blue
  [[17,35,67],[21,43,76],[24,55,86],[30,69,99],[36,87,114],[43,107,127],[55,126,140],[68,144,149],
   [84,157,155],[116,175,156],[154,190,155],[189,204,156],[218,215,155],[241,225,154],[255,230,153]],
  // Violet
  [[37,42,58],[43,46,65],[50,51,77],[58,56,90],[68,64,104],[81,73,119],[93,82,131],[106,92,142],
   [121,104,151],[145,124,152],[175,149,157],[201,170,157],[225,191,158],[243,207,156],[249,212,156]],
  // Yellow
  [[15,18,28],[16,20,32],[20,26,43],[25,36,58],[33,46,76],[42,60,91],[53,74,97],[69,92,102],
   [90,116,104],[118,141,106],[148,164,110],[172,181,115],[195,198,128],[218,213,142],[233,225,158]],
  // Aluminum
  [[42,85,135],[51,86,137],[63,86,140],[76,86,143],[91,86,146],[107,87,150],[123,90,153],[138,95,155],
   [152,102,157],[168,114,157],[185,131,157],[202,150,157],[219,170,157],[233,188,157],[246,204,157]],
];
export const SUNSET_GRADS: ReadonlyArray<readonly (readonly [number, number, number])[]> = [
  // Blue
  [[67,80,117],[82,84,120],[98,89,124],[114,92,125],[129,95,125],[144,98,125],[158,100,126],[171,103,125],
   [182,104,121],[192,106,115],[200,109,107],[207,111,96],[213,112,84],[218,112,70],[222,111,56]],
  // Dark
  [[16,15,33],[17,15,33],[20,16,34],[24,18,35],[27,19,36],[34,21,38],[39,22,41],[47,23,45],
   [51,25,47],[56,27,49],[60,29,50],[65,32,53],[70,33,56],[76,36,58],[80,39,60]],
  // Pink
  [[72,48,93],[86,54,102],[101,61,112],[117,68,122],[133,74,130],[148,81,138],[162,87,143],[173,93,145],
   [186,99,142],[199,105,133],[210,111,119],[219,115,103],[227,119,87],[234,123,73],[240,125,63]],
  // Red
  [[27,24,39],[28,24,39],[32,25,40],[38,27,40],[43,28,41],[50,29,43],[57,30,44],[64,32,45],
   [71,34,46],[79,36,47],[85,37,48],[93,39,50],[100,41,50],[109,43,52],[118,45,53]],
];

/** Main.HorizonPhase(Main.cs:2865-2875):moonPhase,白昼且 time<27000 时 −1,负则 +8 */
export function horizonPhaseOf(moonPhase: number, isDay: boolean, dayTicks: number): number {
  let n = moonPhase;
  if (isDay && dayTicks < 27000) n--;
  if (n < 0) n += 8;
  return n % 4;   // 调色板索引(HorizonRenderer 用 %4 选表)
}

/** GetCelestialEffectPower(:260-268) */
function getCelestialEffectPower(dayTicks: number, isDay: boolean): number {
  if (isDay) {
    return remap(dayTicks, 0, 3600, 0, 1) * remap(dayTicks, 54000 - 1800, 54000, 1, 0);
  }
  return remap(dayTicks, 0, 3600, 0, 1) * remap(dayTicks, 32400 - 1800, 32400, 1, 0);
}

/** BlendColor(ModifyHorizonLight :185-196):逐通道 max 后按可见度向 color lerp */
function blendMaxLerp(color: [number, number, number], c: readonly [number, number, number], opacity: number): void {
  if (opacity <= 0) return;
  const m = (a: number, b: number) => Math.max(a, b);
  const t = (a: number, b: number) => a + (m(a, b) - a) * opacity;   // Lerp(color, max(c,c2), opacity)
  color[0] = t(color[0], c[0]);
  color[1] = t(color[1], c[1]);
  color[2] = t(color[2], c[2]);
}

/** 地平线光渗入(SetBackColor 尾 :63356):梯度中帧色按可见度混入天空色
 *  (★进 tileColor 种子——晨昏时地块光也带梯度色,原版行为) */
export function modifyHorizonLight(
  bg: [number, number, number], sunriseVis: number, sunsetVis: number, phase: number,
): [number, number, number] {
  const out: [number, number, number] = [bg[0], bg[1], bg[2]];
  const su = SUNRISE_GRADS[phase % 4];
  const sd = SUNSET_GRADS[phase % 4];
  blendMaxLerp(out, sd[sd.length >> 1], sunsetVis);
  blendMaxLerp(out, su[su.length >> 1], sunriseVis);
  return out;
}

/** 日光色 sunColor(SetBackColor Main.cs:62896-62931 三段;正午 White)。
 *  返回 0-255 RGB。 */
export function sunColorOf(dayTicks: number): [number, number, number] {
  if (dayTicks < 13500) {
    const p = dayTicks / 13500;
    return [p * 200 + 55, p * 180 + 75, p * 250 + 5];
  }
  if (dayTicks > 45900) {
    const p = 1 - (dayTicks / 54000 - 0.85) * 6.666666666666667;
    return [p * 120 + 55, p * 100 + 25, p * 120 + 55];
  }
  if (dayTicks > 37800) {
    const p = 1 - (dayTicks / 54000 - 0.7) * 6.666666666666667;
    return [p * 80 + 175, p * 130 + 125, p * 100 + 155];
  }
  return [255, 255, 255];
}

/** 月光绘制色(DrawSunAndMoon:62378-62383 + SetBackColor:63354-63359):
 *  非血月恒白;血月红移曲线(首夜半 (215,225,255)→(205,55,55))。
 *  调用方再乘 (1-cloudAlpha·1.5·atmo) 云遮蔽。 */
export function moonDrawColor(nightTicks: number, bloodMoon: boolean): [number, number, number] {
  if (!bloodMoon) return [255, 255, 255];
  const p = nightTicks < 16200 ? 1 - nightTicks / 16200 : (nightTicks / 32400 - 0.5) * 2;
  return [p * 10 + 205, p * 170 + 55, p * 200 + 55];
}

/** 月类型色(HorizonHelper.MoonColors:29-38,云的 HorizonClouds 着色用) */
export const MOON_TYPE_COLORS: readonly (readonly [number, number, number])[] = [
  [230, 235, 255], [250, 235, 160], [230, 255, 230], [160, 240, 255], [180, 255, 255],
  [230, 255, 230], [255, 180, 255], [255, 200, 180], [225, 180, 255],
];

/** GetMoonStrength(HorizonHelper:135-138):|4-moonPhase| 0..4 → 0..1 */
export function moonStrength(moonPhase: number): number {
  return remap(Math.abs(4 - moonPhase), 0, 4, 0, 1);
}
