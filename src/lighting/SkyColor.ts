// 天空色与全局闪烁驱动(纯函数,Main.cs 数值一比一)。
// 我们的 Clock:timeOfDay 0-1(0=午夜 0.5=正午),isDay=(0.25,0.75)。
// 原版 Main.time:昼 0-54000(4:30-18:00),夜 54000-86400。此处做时间映射,
// 不改 Clock 本身(SkyRenderer/音频仍吃 World.dayFactor)。
import { MOON_FLOOR } from './lightTables';
import { modifyHorizonLight } from './Horizon';

/** timeOfDay → 原版 Main.time(0-86400)。★昼夜锚 = Clock.DAWN/DUSK(0.1875/0.8125
 *  = 4:30AM-7:30PM ↔ Main.time 0..54000,Main.cs:64460 SetBackColor dayTime 窗)——
 *  曾用 (0.25,0.75) 旧锚:isDay 窗已对齐 0.8125 而映射仍压在 0.75 → t≥0.773 即
 *  钳到 54000 全黑,原版 19:00-19:30 的橙红黄昏被吞成夜地板(2026-08-24 菜单/游戏内
 *  云光照 A/B 实测 cots=[35,35,35]@t=0.773,同源偏差双侧共有;正午/午夜映射不变) */
export function toVanillaTime(timeOfDay: number, isDay: boolean): number {
  if (isDay) {
    // 0.1875(4:30AM 日出)→0,0.8125(7:30PM)→54000,向两端外延钳制
    const p = (timeOfDay - 0.1875) / 0.625;
    return Math.max(0, Math.min(1, p)) * 54000;
  }
  const p = ((timeOfDay - 0.8125 + 1) % 1) / 0.375;
  return 54000 + Math.max(0, Math.min(1, p)) * 32400;
}

/** 月相 0-7(Main.cs:64880:每黎明 +1 mod 8;dayCount 从 1 起,首夜相位 0) */
export function moonPhase(dayCount: number): number {
  return Math.max(0, dayCount) % 8;
}

/** SetBackColor 五段昼夜曲线(Main.cs:62889-63362 主体)→ [R,G,B] 0-255。
 *  cloudDim(缺省 1)= 云量压暗 :62990-62999 num3=1−cloudAlpha·0.9·atmo,
 *  施加位置在月相地板【之前】(地板保证月亮穿云,原版序:曲线→云暗→地板) */
export function setBackColor(mainTime: number, isDay: boolean, phase: number, bloodMoon = false, cloudDim = 1, biome: BiomeInfluence | null = null, inMenuNight = false): [number, number, number] {
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
      // ★血月夜曲线（Main.cs:62945-62961）：R=75−40p（午夜 75 最红）、G/B=20p+15
      //  （午夜 15 最暗）——曾误写 75p+5 反向衰减（2026-08-24 校勘）
      if (t < 16200) {
        const p = 1 - t / 16200;
        r = 75 - 40 * p; g = 20 * p + 15; b = 20 * p + 15;
      } else {
        const p = (t / 32400 - 0.5) * 2;
        r = 75 - 40 * p; g = 20 * p + 15; b = 20 * p + 15;
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
    // ★IIIII224 dontStarve 夜色黑化（DontStarveSeed.ModifyNightColor :9-24）：
    //  非满月夜 bg 向黑 lerp（前半夜入黑 from/0.5、后半夜出黑回快照），满月免。
    //  value2 快照 = 夜曲线结果（改写前的 r/g/b）；位置 = 夜曲线后、云压暗前
    if (frameDontStarve && phase !== 0) {
      const from = Math.max(0, Math.min(1, t / 32400));
      const a1 = Math.max(0, Math.min(1, from / 0.5));
      const a2 = Math.max(0, Math.min(1, (from - 0.5) / 0.5));
      const r0 = r, g0 = g, b0 = b;
      r = (r + (0 - r) * a1) + (r0 - (r + (0 - r) * a1)) * a2;
      g = (g + (0 - g) * a1) + (g0 - (g + (0 - g) * a1)) * a2;
      b = (b + (0 - b) * a1) + (b0 - (b + (0 - b) * a1)) * a2;
    }
  }
  // 云量压暗(:62990-62999,三通道同乘;地板之前)
  if (cloudDim < 1) { r *= cloudDim; g *= cloudDim; b *= cloudDim; }
  // ★菜单/服务器夜地板(:63000-63006 isInGameMenuOrIsServer&&!dayTime → 硬钉
  //  35,35,35)——原版菜单夜色恒定不随夜间曲线扫动;曾缺失 → 菜单午夜(19,19,19)
  //  比原版暗 45%(用户实报"夜晚比原版暗得多",2026-08-24)
  if (inMenuNight && !isDay) { r = 35; g = 35; b = 35; }
  // 群系块(:63002-63228,云暗后/地板前;帧状态)
  if (biome) {
    const bg2: [number, number, number] = [r, g, b];
    applyBiomeToBg(bg2, biome);
    r = bg2[0]; g = bg2[1]; b = bg2[2];
  }
  // 月相地板(Main.cs:64758-64777 minimalLight 月相表 + :64835-64847 血月 25)
  // ★IIIII224（:64781-64783 + DontStarveSeed.ModifyMinimumLightColorAtNight :27-49）：
  //  dontStarve 世界地板改写 = 非满月 1 / 满月 45，血月抬 ≥35
  let floor: number;
  if (frameDontStarve) {
    floor = phase % 8 === 0 ? 45 : 1;
    if (bloodMoon) floor = Math.max(floor, 35);
  } else {
    floor = bloodMoon ? 25 : MOON_FLOOR[phase % 8];
  }
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

// ---- 地平线可见性帧状态(2026-08-20 原版化:ModifyHorizonLight 渗入天空色/光种) ----
// SetBackColor 尾(Main.cs:63356)在月相地板/日食之后调用 HorizonRenderer.
// ModifyHorizonLight——晨昏时地块光种子也带梯度色。可见性依赖 cloudAlpha/atmo
// (渲染侧量),光照引擎 tick 不便携带 → 模块级每帧状态由 Renderer.render() 写入,
// 读取方(skySeed/colorOfTheSkies)默认消费;首帧/测试环境为 null 即无渗入。
let frameHorizon: { sunrise: number; sunset: number; phase: number } | null = null;
export function setFrameHorizon(v: { sunrise: number; sunset: number; phase: number } | null): void {
  frameHorizon = v;
}
export function getFrameHorizon(): { sunrise: number; sunset: number; phase: number } | null {
  return frameHorizon;
}
// 云量压暗帧状态(Main.cs:62990-62999:num3 = 1−cloudAlpha·0.9·atmo,三通道同乘,
// 在月相地板【之前】——雨天天空/远景/光种子同步变暗;由 Renderer 每帧写入)
let frameCloudDim = 1;
export function setFrameCloudDim(v: number): void {
  frameCloudDim = v;
}
// ★IIIII224 remix 帧状态（Main.remixWorld 消费面，Renderer 每帧写入；菜单/普通世界
// 不写=缺省 false 零扰动）：
//  · world=true → 云压暗跳过（:64513 `cloudAlpha>0f && !remixWorld`）+
//    墓园压暗跳过（:64520 `GraveyardInfluence>0f && !remixWorld`）
//  · blackSky=true（(remixWorld && !gameMenu) || WorldGen.remixWorldGen，:64867）
//    → bgColor 置 1,1,1（remix 世界天幕纯黑,在 minLight 后/闪电白前）
let frameRemixWorld = false;
let frameRemixBlackSky = false;
export function setFrameRemix(world: boolean, blackSky: boolean): void {
  frameRemixWorld = world;
  frameRemixBlackSky = blackSky;
}
// ★IIIII224：Main.dontStarveWorld（the constant）帧状态——夜间黑化 lerp
//  （DontStarveSeed.ModifyNightColor :9-24）与月相地板改写
//  （ModifyMinimumLightColorAtNight :27-49,非满月 1/满月 45/血月 ≥35）
let frameDontStarve = false;
export function setFrameDontStarve(v: boolean): void {
  frameDontStarve = v;
}
// 闪电白帧状态(Main.cs:63346-63355:bgColor 三通道向 1 lerp lightning——
// 闪白走 ColorOfTheSkies 链:天空贴图/远景/光种子同步闪亮;由 Renderer 写入。
// 位置在日食后、地平线渗入前,与原版序一致)
let frameLightning = 0;
export function setFrameLightning(v: number): void {
  frameLightning = v;
}
// 海拔大气系数帧状态(Main.cs:62618 UpdateAtmosphereTransparencyToSkyColor——
// 全局 ColorOfTheSkies ×atmo,atmo≤0.01 置纯黑;atmo = (视口中心Y/16−(65+10×
// (maxTilesX/4200)²))/(worldSurface/5) 钳 [0,1])。消费链=天空贴图/远景层/云色/
// 环境光种子 skySeed(读同一被暗化的全局=高空环境光同步下降)。★太空场景的本体:
// 相机升入 65+ 格后天空渐黑、星星暗度门(:62491 读 ColorOfTheSkies.R)自动打开
// = 白天太空见星。Renderer 每帧写入;菜单不写=1(原版 gameMenu 强制 atmo=1 :62633)
let frameAtmo = 1;
export function setFrameAtmo(v: number): void {
  frameAtmo = v;
}
/** atmo 终段乘(UpdateAtmosphereTransparencyToSkyColor :62628-62638 1:1——
 *  byte 截断语义 = Math.floor;≤0.01 纯黑) */
function applyAtmo(bg: [number, number, number]): [number, number, number] {
  if (frameAtmo >= 0.99) return bg;
  if (frameAtmo <= 0.01) return [0, 0, 0];
  return [
    Math.floor(bg[0] * frameAtmo),
    Math.floor(bg[1] * frameAtmo),
    Math.floor(bg[2] * frameAtmo),
  ];
}
// ---- 极光渗入帧状态(AuroraSky.ModifyTileColor,SetBackColor 尾 Main.cs:63360;
// 调用序:HorizonRenderer.ModifyHorizonLight(:63356)→ ModifyTileColor(:63360)→
// ColorOfTheSkies 赋值(:63361),即晨昏地平线渗入【之后】。intensity=0.08 调用点
// 参数;门 = AuroraSky._opacity>0(:412)且月相≠QuarterAtLeft(:414-416);
// lerp 目标 = _lastSkyColor 强制 A=255(:417-418),amount = opacity×0.08(:419)) ----
export interface AuroraFrameState {
  /** _lastSkyColor(0-255,DrawAuroraSky :376-379 写入) */
  rgb: readonly [number, number, number];
  /** _opacity */
  opacity: number;
  /** 实时月相(ModifyTileColor 读 Main.GetMoonPhase()) */
  phase: number;
}
let frameAurora: AuroraFrameState | null = null;
export function setFrameAurora(v: AuroraFrameState | null): void {
  frameAurora = v;
}
/** 极光渗入(Color.Lerp 逐通道,:419)——供 skySeed/colorOfTheSkies 尾段复用 */
function applyAuroraTileColor(bg: [number, number, number], a: AuroraFrameState): void {
  if (a.phase === 3 /* MoonPhase.QuarterAtLeft :415 */) return;
  const amt = a.opacity * 0.08;                       // :419 opacity×intensity(0.08)
  bg[0] += (a.rgb[0] - bg[0]) * amt;
  bg[1] += (a.rgb[1] - bg[1]) * amt;
  bg[2] += (a.rgb[2] - bg[2]) * amt;
}

// ---- 群系影响(SetBackColor :63002-63228 四块 1:1,2026-08-20 原版化) ----
/** 群系光照影响(0-1;Game 每 tick 平滑后经 scene 注入,Renderer 写帧状态) */
export interface BiomeInfluence {
  corrupt: number; crimson: number; jungle: number; mushroom: number; graveyard: number;
}
let frameBiome: BiomeInfluence | null = null;
export function setFrameBiome(v: BiomeInfluence | null): void {
  frameBiome = v;
}
/** 群系块作用到 bgColor(:63002-63228 逐式;序:墓园→腐化→猩红→丛林→蘑菇,
 *  在云暗后/月相地板前)。in place 修改。 */
function applyBiomeToBg(bg: [number, number, number], bio: BiomeInfluence): void {
  const m255 = (v: number) => Math.max(15, v);   // 各块 min 15
  // ★IIIII224：remix 世界墓园压暗整块跳过（:64520 `info.GraveyardInfluence > 0f && !remixWorld`）
  if (bio.graveyard > 0 && !frameRemixWorld) {
    const k = 1 - bio.graveyard * 0.6;           // :63003-63010
    bg[0] *= k; bg[1] *= k; bg[2] *= k;
  }
  if (bio.corrupt > 0) {
    const I = Math.min(1, bio.corrupt);  // >1f 钳 1(:6300x 系——漏钳=真实带计数≫1000→通道负→min15 全黑,2026-08-20)
    bg[0] = m255(bg[0] - 90 * I * (bg[0] / 255));
    bg[1] = m255(bg[1] - 140 * I * (bg[1] / 255));
    bg[2] = m255(bg[2] - 70 * I * (bg[2] / 255));
  }
  if (bio.crimson > 0) {
    const I = Math.min(1, bio.crimson);  // >1f 钳 1(:6300x 系——漏钳=真实带计数≫1000→通道负→min15 全黑,2026-08-20)
    bg[0] = m255(bg[0] - 40 * I * (bg[1] / 255));
    bg[1] = m255(bg[1] - 110 * I * (bg[1] / 255));
    bg[2] = m255(bg[2] - 140 * I * (bg[2] / 255));
  }
  if (bio.jungle > 0) {
    const I = Math.min(1, bio.jungle);  // >1f 钳 1(:6300x 系——漏钳=真实带计数≫1000→通道负→min15 全黑,2026-08-20)
    bg[0] = m255(bg[0] - 40 * I * (bg[0] / 255));
    bg[2] = m255(bg[2] - 70 * I * (bg[2] / 255));
  }
  if (bio.mushroom > 0) {
    const I = bio.mushroom;                       // :63140-63167
    bg[1] = m255(bg[1] - 250 * I * (bg[1] / 255));
    bg[0] = m255(bg[0] - 250 * I * (bg[0] / 255));
    bg[2] = m255(bg[2] - 250 * I * (bg[2] / 255));
  }
}

/** 群系块作用到 sunColor(:63060-63075/:63093-63100/:63120-63134/:63170-63213) */
export function applyBiomeToSun(sun: [number, number, number], bio: BiomeInfluence): void {
  const m255 = (v: number) => Math.max(15, v);
  if (bio.corrupt > 0) {
    const I = Math.min(1, bio.corrupt);
    sun[0] = m255(sun[0] - 100 * I * (sun[0] / 255));
    sun[1] = m255(sun[1] - 100 * I * (sun[1] / 255));
  }
  if (bio.crimson > 0) {
    const I = Math.min(1, bio.crimson);
    sun[1] = m255(sun[1] - 90 * I * (sun[1] / 255));
    sun[2] = m255(sun[2] - 110 * I * (sun[2] / 255));
  }
  if (bio.jungle > 0) {
    const I = Math.min(1, bio.jungle);
    sun[0] = m255(sun[0] - 30 * I * (sun[0] / 255));
    sun[2] = m255(sun[2] - 10 * I * (sun[2] / 255));
  }
  if (bio.mushroom > 0) {
    const I = bio.mushroom;
    sun[1] = m255(sun[1] - 10 * I * (sun[1] / 255));
    sun[0] = m255(sun[0] - 30 * I * (sun[0] / 255));
    sun[2] = m255(sun[2] - 10 * I * (sun[2] / 255));
  }
}

/** 群系块作用到 moonColor(仅蘑菇 :63200-63228;★跨通道归一——G 用 R、R 用 G,
 *  原文如此;原版先快照三通道再逐式计算——逐字保留快照语义) */
export function applyBiomeToMoon(moon: [number, number, number], bio: BiomeInfluence): void {
  const m255 = (v: number) => Math.max(15, v);
  if (bio.mushroom > 0) {
    const I = bio.mushroom;
    const r0 = moon[0], g0 = moon[1], b0 = moon[2];
    moon[1] = m255(g0 - 140 * I * (r0 / 255));
    moon[0] = m255(r0 - 170 * I * (g0 / 255));
    moon[2] = m255(b0 - 190 * I * (b0 / 255));
  }
}

/** 一次调用得到天空光种子(0-1 RGB)。eclipse=true 时按 Main.cs:63282-63305 压暗：
 *  eclipseLight = min(1, 白天 Main.time/1242)（约 25 游戏秒到满暗）；R×(1-0.925L)
 *  G×(1-0.96L) B×(1-1.0L)——蓝色通道清零、红色保留 7.5% 的血红暮色。
 *  尾接 ModifyHorizonLight(:63356,帧状态由 Renderer 写入,晨昏梯度渗入) */
export function skySeed(timeOfDay: number, dayCount: number, eclipse = false, bloodMoon = false, moonPhaseNow?: number): [number, number, number] {
  // ★昼夜窗口对齐 Clock（DAWN=0.1875/DUSK=0.8125，昼 4:30-19:30）——曾用
  // (0.25,0.75) 两端各差 1.5h，18:00-19:30 天空光差 ~4.4 倍
  const isDay = timeOfDay > 0.1875 && timeOfDay < 0.8125;
  const t = toVanillaTime(timeOfDay, isDay);
  void dayCount;
  let bg = setBackColor(t, isDay, moonPhaseNow ?? moonPhase(dayCount), bloodMoon, frameCloudDim, frameBiome);
  // ★IIIII224（:64867）：remix 世界（游戏内/世界生成期）天幕底色 = 1,1,1 纯黑
  //  ——在 minLight 后、闪电白前；eclipse/闪电块在其后照常叠加
  if (frameRemixBlackSky) bg = [1, 1, 1];
  if (eclipse && isDay) {
    const L = Math.min(1, t / 1242);
    bg = [
      bg[0] * (1 - 0.925 * L),
      bg[1] * (1 - 0.96 * L),
      bg[2] * (1 - 1 * L),
    ];
  }
  if (frameLightning > 0) {
    const L = Math.min(1, frameLightning);
    bg = [bg[0] + (255 - bg[0]) * L, bg[1] + (255 - bg[1]) * L, bg[2] + (255 - bg[2]) * L];
  }
  if (frameHorizon && (frameHorizon.sunrise > 0 || frameHorizon.sunset > 0)) {
    bg = modifyHorizonLight([bg[0], bg[1], bg[2]], frameHorizon.sunrise, frameHorizon.sunset, frameHorizon.phase);
  }
  if (frameAurora) applyAuroraTileColor(bg, frameAurora);   // :63360(ModifyHorizonLight 后)
  return tileColor(applyAtmo(bg));   // :62618 atmo 乘在全局色上(光种子读暗化值)
}

/** ColorOfTheSkies(Main.cs:63361)——天空侧唯一色源(2026-08-20 原版化落地):
 *  · 天空渐变贴图 × 本值 · 远景群系层 × 本值(:56194) · 云 cloudColor(:58752 族)
 *  · 环境天空实体 GetColor bg · 天空光种子 skySeed = tileColor(本值)(:62608)
 *  含月相地板/血月/日食/晨昏地平线渗入(帧状态)。返回 0-255。 */
export function colorOfTheSkies(
  timeOfDay: number, dayCount: number, eclipse = false, bloodMoon = false,
  moonPhaseNow?: number, inMenuNight = false,
): [number, number, number] {
  const isDay = timeOfDay > 0.1875 && timeOfDay < 0.8125;
  const t = toVanillaTime(timeOfDay, isDay);
  void dayCount;
  let bg = setBackColor(t, isDay, moonPhaseNow ?? moonPhase(dayCount), bloodMoon, frameCloudDim, frameBiome, inMenuNight);
  // ★IIIII224（:64867）：remix 黑天幕（同 skySeed 注）
  if (frameRemixBlackSky) bg = [1, 1, 1];
  if (eclipse && isDay) {
    const L = Math.min(1, t / 1242);
    bg = [
      bg[0] * (1 - 0.925 * L),
      bg[1] * (1 - 0.96 * L),
      bg[2] * (1 - 1 * L),
    ];
  }
  if (frameLightning > 0) {
    const L = Math.min(1, frameLightning);
    bg = [bg[0] + (255 - bg[0]) * L, bg[1] + (255 - bg[1]) * L, bg[2] + (255 - bg[2]) * L];
  }
  if (frameHorizon && (frameHorizon.sunrise > 0 || frameHorizon.sunset > 0)) {
    bg = modifyHorizonLight([bg[0], bg[1], bg[2]], frameHorizon.sunrise, frameHorizon.sunset, frameHorizon.phase);
  }
  if (frameAurora) applyAuroraTileColor(bg, frameAurora);   // :63360(ModifyHorizonLight 后)
  return applyAtmo(bg);   // :62618 atmo 乘在全局色上(天空/远景/云同源变暗)
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
