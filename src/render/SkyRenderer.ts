// 天空渲染：昼夜渐变、太阳/月亮、星星、云
// 注意:Clock 必须值导入——DAWN/DUSK 是运行时常量,import type 会被擦除
// (:528/:561 运行时取值 → "Clock is not defined" 每帧崩渲染循环)
import { Clock } from '../world/World';
import { Clock as ClockVal } from '../world/World';
import { shade, mix } from '../assets/Palette';
import { LanternNight } from '../world/LanternNight';

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
    // 事件月亮(Main.cs:62400-62408):南瓜月 kind=2 / 霜月 kind=1,同为 50×400 相位竖条
    this.pumpkinMoonTex = loadTex('Moon_Pumpkin.png');
    this.snowMoonTex = loadTex('Moon_Snow.png');
    // 风场初值(Main.cs:10800):current = ±0.8 随机,计数 7200-28800 帧
    this.wind = (Math.floor(Math.random() * 1601) - 800) * 0.001;
    this.windCounter = 7200 + Math.floor(Math.random() * 21601);
  }

  sunTex: HTMLImageElement;
  moonTexs: Array<HTMLImageElement | null> = [null, null, null, null, null, null, null, null, null];
  /** 事件月亮（kind 1=霜月 Snow / 2=南瓜月 Pumpkin,Main.cs:62400-62408） */
  pumpkinMoonTex: HTMLImageElement;
  snowMoonTex: HTMLImageElement;
  /** 世界月亮样式(原版 header moonType 0-8;默认 0 标准月) */
  moonType = 0;
  // ---- 天幕流星(AmbientSky.MeteorSkyEntity :1316-1341;spawnMeteor 期间夜 15000-16200
  //      窗口恰一颗划过,Main.HandleMeteorFall :64952-64967)----
  private meteorTex: HTMLImageElement | null = null;
  /** 活动实体:null = 无;spawn() 后按 vanilla 参数运动 */
  private meteor: {
    x: number; y: number; vx: number; vy: number; rot: number; t: number; life: number; flip: boolean;
  } | null = null;
  /** 贴图 62×384 = 4 帧竖排(FramingSpeed 5 → 每 5 帧进一格) */
  private static readonly METEOR_FW = 62;
  private static readonly METEOR_FH = 96;

  /** 触发一颗(Game:夜间过 15000 线时恰调一次;原版 _canShowMeteorFall 门) */
  spawnSkyMeteor(playerCx: number, playerCy: number, worldSurfacePx: number) {
    if (this.meteor) return;   // 原版每窗口一颗(ForceEntitySpawn 一次)
    if (!this.meteorTex) {
      this.meteorTex = loadTex('Background_Meteor.png');
    }
    // :1321-1325:flip 掷;角度 π/4 + rand(π/2) 的单位向量(向下)
    const ang = Math.PI / 4 + Math.random() * (Math.PI / 2);
    const vx = Math.cos(ang), vy = Math.sin(ang);
    // :1326-1333:速度 = 使行进 worldSurface*16 距离恰 1200 帧;出生 = 玩家中心 ±100
    //  减去 velocity*1200*0.5(前半程从屏外来)
    const spd = worldSurfacePx / vy / 1200;
    const speed = 1 / Math.max(1e-6, spd);
    void speed;
    this.meteor = {
      vx: vx * spd, vy: vy * spd,
      x: playerCx + (Math.floor(Math.random() * 201) - 100) - vx * spd * 600,
      y: playerCy + (Math.floor(Math.random() * 201) - 100) - vy * spd * 600,
      rot: ang + Math.PI / 2,   // :1340 rotation = Velocity.ToRotation()+π/2
      t: 0, life: 1200,         // :1327/1334 LifeTime=1200
      flip: Math.random() >= 0.5,
    };
  }

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

  // ---- 器件驱动的天空效果（SceneMetrics 器件态；Renderer 每帧写入）----
  fx: { monolith: number; party: boolean; surfaceY: number; worldW: number; worldH: number; moonEventKind: 0 | 1 | 2 } =
    { monolith: -1, party: false, surfaceY: 0, worldW: 0, worldH: 0, moonEventKind: 0 };

  /** 天塔柱全屏滤镜颜色/不透明度（ScreenEffectInitializer.cs:18-21 FilterMiniTower 1:1；
   *  类型映射 SceneState.cs:111-115：0 星璇/1 星云/2 星尘/3 耀斑/4 月总）。
   *  【依赖登记】柱背景天空贴图（VortexSky/NebulaSky/StardustSky/SolarSky/MoonLordSky）
   *  与 FilterMoonLord 专用 shader 未接入——此处只有滤镜层 */
  private static readonly MONOLITH_FILTER: Record<number, readonly [number, number, number, number]> = {
    0: [0, 0.7, 0.7, 0.5],        // MonolithVortex（ScreenEffectInitializer.cs:21）
    1: [1, 0, 0.9, 0.35],         // MonolithNebula（:18）
    2: [0, 0.5, 1, 0.5],          // MonolithStardust（:20）
    3: [1, 0.7, 0, 0.3],          // MonolithSolar（:19）
    4: [0.35, 0.3, 0.42, 0.35],   // MonolithMoonLord（:24 FilterMoonLord——深紫压暗近似）
  };

  /** 天塔柱滤镜：multiply 混合近似 shader 染色（result = screen × mix(白, 柱色, opacity)）。
   *  原版为全屏后处理（Filters.Scene）；此处只染天空+群系背景层，tile 前景不染——
   *  视觉近似点登记 */
  drawMonolithFilter(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    const f = SkyRenderer.MONOLITH_FILTER[this.fx.monolith];
    if (!f) return;
    const [r, g, b, a] = f;
    const mixv = (c: number) => Math.round(255 * (1 - a + c * a));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${mixv(r)},${mixv(g)},${mixv(b)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  // ---- 派对气球天空（PartySky.cs 精简核：BirthdayParty.PartyIsUp 时激活）----
  private partyBalloons: Array<{ tex: number; variant: number; x: number; y: number; depth: number; speed: number }> = [];
  private partyTexs: Array<HTMLImageElement | null> = [null, null, null];

  /** 生成气球（PartySky.ResetBalloon :109-122 + GenerateBalloons :88-107：
   *  贴图 Extra_69/70 二选一（1/30 换 Extra_71）、variant 0-2、speed -1.5..-4、
   *  depth 1.6..3.35；X 绘制时模 4000 包裹 :325-330） */
  private spawnBalloon(viewH: number, respawn = false): void {
    this.partyBalloons.push({
      tex: Math.random() < 1 / 30 ? 2 : Math.floor(Math.random() * 2),
      variant: Math.floor(Math.random() * 3),
      x: Math.random() * 4000 - 500,
      y: respawn ? this.fx.surfaceY + 1600 : -viewH + Math.random() * (viewH + 1600),
      depth: 1.6 + Math.random() * 1.75,
      speed: -1.5 - 2.5 * Math.random(),
    });
  }

  // ---- 灯笼夜天空（LanternSky.cs 1:1，贴图 Extra_134 三变体 20×20）----
  private lanternTex: HTMLImageElement | null = null;
  private lanternOpacity = 0;   // _opacity：±0.01/帧向 LanternsUp 逼近（Update :119）
  private lanterns: Array<{
    x: number; y: number; depth: number; speed: number; variant: number;
    time: number; timeMax: number; rot: number; active: boolean;
  }> = [];
  private lanternsLeaving = false;

  /** ResetLantern（LanternSky.cs:103-111）：depth = (1-i/N)×4.4+1.6、
   *  speed = -1.5-2.5×rand、变体 0-2、漂浮倒计时 (2000+rand1200)×2 */
  private resetLantern(l: { depth: number; speed: number; variant: number; time: number; timeMax: number }, i: number): void {
    l.depth = (1 - i / this.lanterns.length) * 4.4 + 1.6;
    l.speed = -1.5 - 2.5 * Math.random();
    l.variant = Math.floor(Math.random() * 3);
    l.time = (2000 + Math.floor(Math.random() * 1200)) * 2;
    l.timeMax = l.time;
  }

  /** GenerateLanterns（:83-101）：N = maxTilesY/4，Y 带在世界地表上方（视口高度的
   *  0.7 视差源 → num..num-screenHeight 对应世界 px 带） */
  private generateLanterns(): void {
    const N = Math.max(24, Math.floor(this.fx.worldH / 4));
    this.lanterns = new Array(N);
    const surfacePx = this.fx.surfaceY * 1; // tile → px（fx.surfaceY 已是 px）
    for (let i = 0; i < N; i++) {
      const l = {
        x: Math.random() * this.fx.worldW * 16, y: 0,
        depth: 0, speed: 0, variant: 0, time: 0, timeMax: 1, rot: 0, active: true,
      };
      // 原版 y 带 = rand(minValue..num)，num = screenY×0.7 - 屏高、min = num - 地表px
      l.y = surfacePx - 900 + Math.random() * 900;
      this.resetLantern(l, i);
      l.active = true;
      this.lanterns[i] = l;
    }
  }

  /** 灯笼夜夜空绘制（LanternSky.Update/Draw 1:1：浮升 + 风漂移 + 深度视差 + X 4000 包裹）。
   *  载体注明：原版为 SkyManager「Lantern」自定义天空层（spritebatch），此处 canvas 2D
   *  以同参数直接绘制（视差 (1/depth, 0.9/depth)×1.2、深度 alpha 分档 0.3-1.0、
   *  三份旋转光晕副本 + 主贴图 :243-254） */
  private drawLanterns(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number, dtMs: number): void {
    const up = LanternNight.lanternsUp;
    // _opacity ±0.01/帧（:119）
    this.lanternOpacity = Math.max(0, Math.min(1, this.lanternOpacity + (up ? 0.01 : -0.01) * (dtMs / (1000 / 60))));
    if (this.lanternOpacity <= 0.001) {
      if (!up) { this.lanterns.length = 0; this.lanternsLeaving = false; }
      return;
    }
    // 相机在地表以下不画（Draw :165：screenPosition.Y > worldSurface×16 直接返回）
    if (camY > this.fx.surfaceY) return;
    if (!this.lanternTex) {
      const im = new Image();
      im.src = 'sprites/vanilla/Extra_134.png';
      this.lanternTex = im;
    }
    if (this.lanterns.length === 0 || (up && this.lanternsLeaving)) {
      this.generateLanterns();
      this.lanternsLeaving = false;
    }
    if (!up && !this.lanternsLeaving) this.lanternsLeaving = true; // Deactivate：升顶后逐个熄灭
    const tex = this.lanternTex;
    const frames = dtMs / (1000 / 60);
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    const w0 = wind === 0 ? 0.1 : wind;   // Update :126-130
    const N = this.lanterns.length;
    let drawing = 0;
    for (let i = 0; i < N; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;
      // Update :131-149
      const num2 = Math.sin(l.x / 120) * 0.5;
      l.y += num2 * 0.5 * frames;
      l.y += (l.speed * (l.time / l.timeMax)) * 0.5 * frames;   // FloatAdjustedSpeed
      l.x += (0.1 + w0) * (3 - l.speed) * 0.5 * ((i / N) + 1.5) / 2.5 * frames;
      l.rot = num2 * (w0 < 0 ? -1 : 1) * 0.5;
      l.time = Math.max(0, l.time - frames);
      if (l.y < 300) {
        if (!this.lanternsLeaving) {
          this.resetLantern(l, i);
          l.y = this.fx.surfaceY + 1600;
          l.x = Math.random() * this.fx.worldW * 16;
        } else {
          l.active = false;
          continue;
        }
      }
      drawing++;
    }
    if (drawing === 0 || !tex || !tex.complete || tex.naturalWidth === 0) return;
    const fw = tex.naturalWidth / 3, fh = tex.naturalHeight;
    const cx = camX + viewW / 2, cy = camY + viewH / 2; // 屏中心（世界 px）
    const hourY = Math.sin(((performance.now() / 1000) % 6) / 6 * Math.PI * 2); // GlobalTime 6s 环绕的 Y 分量
    const flicker = hourY * 0.2 + 0.8;                  // DrawLantern :245-246
    for (let i = 0; i < N; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;
      // 深度 alpha 分档（:196-224）
      let mul = 1;
      if (l.depth > 5) mul = 0.3;
      else if (l.depth > 4.5) mul = 0.4;
      else if (l.depth > 4) mul = 0.5;
      else if (l.depth > 3.5) mul = 0.6;
      else if (l.depth > 3) mul = 0.7;
      else if (l.depth > 2.5) mul = 0.8;
      else if (l.depth > 2) mul = 0.9;
      const scale = (1 / l.depth) * 1.2, scaleY = (0.9 / l.depth) * 1.2;
      // 视差（:225-234）：(pos-屏中心)×(scale, scaleY)+屏中心，X 模 4000 包裹
      let sx = (l.x - cx) * scale + cx - camX;
      const sy = (l.y - cy) * scaleY + cy - camY;
      sx = (((sx + 500) % 4000) + 4000) % 4000 - 500;
      if (sx < -100 || sx > viewW + 100 || sy < -100 || sy > viewH + 100) continue;
      // 光晕三副本（:248-252）：绕 (0,2) 旋转 120° 均布 × 环绕 Y
      const glowA = 0.4 * mul * this.lanternOpacity * flicker;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(l.rot);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = glowA;
      for (let k = 0; k < 3; k++) {
        const a = (Math.PI * 2 * k) / 3 + l.rot;
        ctx.drawImage(tex, fw * l.variant, 0, fw, fh,
          Math.cos(a) * 2 * hourY - (fw * scale * 2) / 2,
          Math.sin(a) * 2 * hourY - (fh * scale * 2) / 2, fw * scale * 2, fh * scale * 2);
      }
      // 主贴图：Color(250,120,60,120) × 分档 × 不透明度（:194-253）
      ctx.globalAlpha = 0.47 * mul * this.lanternOpacity;
      ctx.drawImage(tex, fw * l.variant, 0, fw, fh, -(fw * scale * 2) / 2, -(fh * scale * 2) / 2, fw * scale * 2, fh * scale * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 派对气球绘制（PartySky.Update/Draw :130-198 精简核：上升 + 风漂移 + 视差 1/depth） */
  private drawPartyBalloons(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, dtMs: number): void {
    if (!this.fx.party || this.fx.surfaceY <= 0) {
      this.partyBalloons.length = 0;
      return;
    }
    // 相机在地表以下不画（PartySky.Draw :172：screenPosition.Y > worldSurface*16 直接返回）
    if (this.partyTexs[0] === null) {
      for (let i = 0; i < 3; i++) {
        const im = new Image();
        im.src = `sprites/vanilla/Extra_${69 + i}.png`;
        this.partyTexs[i] = im;
      }
    }
    while (this.partyBalloons.length < 48) this.spawnBalloon(viewH);
    const frames = dtMs / (1000 / 60);
    const wind = this.wind;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const b of this.partyBalloons) {
      b.y += b.speed * frames;
      b.x += wind * (3 - b.speed) * frames;
      if (b.y < -viewH) {  // 升出屏顶：重掷（PartySky.Update :151-158）
        b.y = this.fx.surfaceY + 1600;
        b.x = Math.random() * 4000 - 500;
        b.tex = Math.random() < 1 / 30 ? 2 : Math.floor(Math.random() * 2);
        b.variant = Math.floor(Math.random() * 3);
        b.speed = -1.5 - 2.5 * Math.random();
        b.depth = 1.6 + Math.random() * 1.75;
      }
      const tex = this.partyTexs[b.tex];
      if (!tex || !tex.complete || tex.naturalWidth === 0) continue;
      // 视差（:320-322：(pos - 屏中心) × (1/depth, 0.9/depth) + 屏中心）+ X 4000 包裹（:325-330）
      const par = 1 / b.depth;
      const sx = (((b.x - camX) * par + camX + 500) % 4000 + 4000) % 4000 - 500;
      const sy = (b.y - viewH / 2) * (0.9 * par) + viewH / 2;
      const fw = tex.naturalWidth / 3, fh = tex.naturalHeight / 3;
      const scale = par * 2 * 0.9;  // :337 vector2.X * 2 × 天色亮度 0.9 近似
      ctx.globalAlpha = 0.8;
      ctx.drawImage(tex, fw * b.variant, 0, fw, fh, sx, sy, fw * scale, fh * scale);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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
      // 天气联动：云染灰基准 = ProcessCloudAlpha（Main.cs:59154：max(cloudAlpha, 墓园强度×0.92)）×atmo
      const wr = this.weatherRef;
      if (wr) {
        const basis = Math.max(wr.cloudAlpha, (wr.graveyardVisual ?? 0) * 0.92);
        if (basis > 0) {
          const rainK = basis * 0.55;
          r = Math.round(r * (1 - rainK) + 158 * rainK);
          g = Math.round(g * (1 - rainK) + 162 * rainK);
          b = Math.round(b * (1 - rainK) + 168 * rainK);
        }
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

  draw(ctx: CanvasRenderingContext2D, clock: Clock, viewW: number, viewH: number, camX: number, dtMs = 16.7, camY = 0) {
    // ---- 天幕流星推进+绘制(最远背景层;__swSkyMeteor 由 Game 触发) ----
    if (this.meteor) {
      const m = this.meteor;
      m.t++;
      m.x += m.vx; m.y += m.vy;
      const frames = 60 * dtMs / 1000;   // 按帧推进近似的 dt 归一
      void frames;
      if (m.t >= m.life) { this.meteor = null; }
      else if (this.meteorTex && this.meteorTex.width) {
        // 透明度(:1335-1337):t/life ∈[0,0.05]淡入/[0.95,1]淡出,BrightnessLerper 0.5
        const k = m.t / m.life;
        const alpha = k < 0.05 ? k / 0.05 : k > 0.95 ? Math.max(0, (1 - k) / 0.05) : 1;
        const frame = Math.floor(m.t / 5) % 4;   // FramingSpeed 5
        ctx.save();
        ctx.globalAlpha = alpha * 0.75;
        ctx.translate(m.x - camX * 0.2, m.y);    // 视差 0.2(天幕远层)
        ctx.rotate(m.rot);
        if (m.flip) ctx.scale(-1, 1);
        ctx.drawImage(this.meteorTex, 0, frame * SkyRenderer.METEOR_FH,
          SkyRenderer.METEOR_FW, SkyRenderer.METEOR_FH,
          -SkyRenderer.METEOR_FW / 2, -SkyRenderer.METEOR_FH / 2,
          SkyRenderer.METEOR_FW, SkyRenderer.METEOR_FH);
        ctx.restore();
      }
    }
    const t = clock.timeOfDay;
    const [top, bottom] = this.skyColors(t);
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    // 日食压暗（Main.cs:63282-63305）：eclipseLight = min(1, 白天 time/1242)，
    // bgColor 三通道 ×(1-0.925L)/(1-0.96L)/(1-1.0L)——血红暮色，蓝通道清零
    if (clock.eclipse && t > ClockVal.DAWN && t < ClockVal.DUSK) {
      const dayTime = ((t - 0.25) / 0.5) * 54000;
      const L = Math.min(1, dayTime / 1242);
      if (L > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${Math.round(255 * (1 - 0.925 * L))},${Math.round(255 * (1 - 0.96 * L))},${Math.round(255 * (1 - L))})`;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();
      }
    }
    // 闪电白（原版 Main.cs:63346：bgColor 向白 lerp lightning——纯闪白不画贴图）
    if (this.weatherRef && this.weatherRef.lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.weatherRef.lightning * 0.85)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // 墓地天空压暗（Main.cs:62990-62996 SetBackColor GraveyardInfluence）：bgColor
    // 三通道 ×(1 − 0.6×intensity)——晴空/夜空整体转灰暗；强度为 Game 平滑后的
    // GraveyardVisualIntensity（weather.graveyardVisual），>0 即生效（remix 分支不适用）
    const gyIntensity = this.weatherRef?.graveyardVisual ?? 0;
    if (gyIntensity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const dv = Math.round(255 * (1 - 0.6 * Math.min(1, gyIntensity)));
      ctx.fillStyle = `rgb(${dv},${dv},${dv})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }

    const isNight = t < 0.27 || t > 0.78;
    // 星星
    if (isNight) {
      const fade = Math.min(1, Math.max(0, (t < 0.5 ? (0.27 - t) / 0.05 : (t - 0.78) / 0.05)));
      // 墓地星光衰减（Main.cs:62469-62478 DrawStarsInBackground）：亮度 ×(1 − 1.4×intensity)，
      // ≤0 直接跳过星群（intensity ≥ ~0.71 起星空完全被雾吞掉；太阳/月亮照画）
      const starDim = Math.max(0, 1 - gyIntensity * 1.4);
      ctx.globalAlpha = 0.9 * fade * starDim;
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
    const isDay = t > ClockVal.DAWN && t < ClockVal.DUSK;
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
      const tex = this.fx.moonEventKind === 2 ? this.pumpkinMoonTex
        : this.fx.moonEventKind === 1 ? this.snowMoonTex
          : this.moonTexs[Math.max(0, Math.min(8, this.moonType))];
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

    // 派对气球（PartySky：BirthdayParty.PartyIsUp 时 SkyManager 激活）
    this.drawPartyBalloons(ctx, viewW, viewH, camX, dtMs);
    // 灯笼夜夜空（LanternSky：灯笼浮升层，需相机 Y 判地表门）
    this.drawLanterns(ctx, viewW, viewH, camX, camY, dtMs);

  }

}
