// 天气渲染（Terarria1456 Rain.cs / Sandstorm.EmitDust / 闪电白 Main.cs:63346）：
//   - 雨滴池：MakeRain/Update/Draw 逐行移植（风偏移/起点非实心门/atmo^9 削减/落水花）
//   - 沙尘暴粒子发射（四色加权/Severity 驱动/风向）——走 Game.particles
//   - 闪电：由 SkyRenderer 读 weather.lightning 把天空色向白 lerp（不画贴图，原版同语义）
// 绘制在世界坐标变换内调用（与实体一致），雨层画在瀑布后实体前（原版 DrawRain 在
// tile 层后）。光照着色由调用方注入 lightAt 回调（LightingEngine.lightAt 同源）。
import { loadBitmapOnly } from '../assets/SpriteAtlas';
import { TILE } from '../core/constants';
import { TileStore } from '../world/TileStore';
import type { World } from '../world/World';
import { gfxQuality } from '../core/GfxQuality';
import type { Camera } from './Camera';
import type { Renderer } from './Renderer';
import type { WeatherState } from '../world/weather/Weather';

interface RainDrop {
  x: number; y: number;
  vx: number; vy: number;
  scale: number;
  rotation: number;
  type: number;
  active: boolean;
}

interface SnowFlake {
  x: number; y: number;
  vx: number; vy: number;
  scale: number;
  /** NewDust 帧掷（Dust.cs:177 frame.Y=10×rand(3)）→ 源矩形 (760,10×frame,8,8) */
  frame: number;
  active: boolean;
}

/** 沙尘暴尘（dust 268）：位置/速度/scale/fadeIn（簇生链重掷门）/生物群系加权色 */
interface SandGrain {
  x: number; y: number;
  vx: number; vy: number;
  scale: number;
  fadeIn: number;
  /** EmitDust 四色（(200,160,20)/(103,98,122)/(135,43,34)/(213,196,197)，alpha 180） */
  cr: number; cg: number; cb: number;
  /** NewDust 帧掷（Dust.cs:177+186-190 双重 while：X=10×268−2000=680、Y=10×rand(3)+60）
   *  → 源矩形 (680, 60+10×frame, 8, 8)。★曾误读 (680,20)=dust 68 的蓝十字格，
   *  蓝底×沙色乘=暗绿被用户当"树叶"（2026-08-31 定谳） */
  frame: number;
  active: boolean;
}

/** EmitDust 四色统一 alpha（Sandstorm.cs:179-182 四个 Color 字面量同值） */
const SAND_COLOR_ALPHA = 180;

export interface WeatherFxHooks {
  /** 光照采样（0-255 RGB；雨滴着色 ×0.85） */
  lightAt(tx: number, ty: number): [number, number, number];
  /** 地表开阔度 0-1（原版 atmo——深度梯度 0→1 后钳 1，Main.cs:64148-64159；
   *  地下恒 1≠「无雨」——真正的地下停雨闸是 zoneRain） */
  atmo: number;
  /** ★SW-BJ26 2026-09-07：SceneMetrics.ZoneRain（SceneMetrics.cs:700 = Main.raining &&
   *  SurfaceAtmospherics；沙暴态强制 false :702-704）——Rain.MakeRain 总闸（Rain.cs:32
   *  `!Main.SceneMetrics.ZoneRain → return`）：玩家在地表以下（tileY>worldSurface）时
   *  原版整帧【零生成】雨滴。洞内雨根因=缺此总闸：无墙洞穴的屏顶生成带（screenTop−20..100）
   *  逐滴门（Rain.cs:86 非实心+无墙）全放行（行为日志 2059,380 洞区 2343 格 wall 全 0）。
   *  Game 侧由 scene.zoneRain 派生，与雨声 cue28 门（Weather.ts rainGate）同源 */
  zoneRain: boolean;
  /** ★SW-BJ26 2026-09-07：SceneMetrics.SurfaceAtmospherics（SceneMetrics.cs:695 =
   *  WorldGen.IsSurfaceForAtmospherics（玩家中心））——Main.snowing() 门（Main.cs:13209）。
   *  非 atmo 梯度可替代：旧 `atmo<0.4` 近似在 92..worldSurface 天空带误杀、worldSurface
   *  以下（atmo 钳 1）漏放=洞内飘雪，与洞内雨同族 */
  surfaceAtmospherics: boolean;
  /** 雪区雪格比例 0-1（削减雨量；SceneMetrics SnowTileCount/Threshold 的平方） */
  snowRatio: number;
  /** 雪区雪格原始计数（snowing() 的密度指数；SceneMetrics.SnowTileCount） */
  snowTileCount: number;
  /** Boss 危险中（雨量 ×0.05 保底 1，Rain.cs:32-40） */
  bossDanger: boolean;
  /** NPC.IsADeerclopsNearScreen（NPC.cs:12407 id=668）——反编译实为【全图任一活跃
   *  668】（UpdateFoundActiveNPCs 无屏幕过滤,名字骗人）：雪稀释 num/20、目标 /3、
   *  雪片 scale −0.5（Main.cs:13228-13231/:13268-13270） */
  deerclopsNear: boolean;
  /** Main.waterStyle（Rain.cs:165/210 rain.type = waterStyle×3+rand(3)；
   *  Dust.dustWater() :405-421 溅花尘映射）——★曾硬编码纯水 0-2，雪原/丛林等
   *  雨滴与溅花全部用错列（2026-09-01 与 dust 268 同批同族修正） */
  waterStyle: number;
  /** Main.shimmerAlpha（Renderer.monoFilters.shimmerAlpha 同源逐帧值）——
   *  MakeRain 停发门（Rain.cs:32）+ DrawRain 色淡出（Main.cs:39488） */
  shimmerAlpha: number;
  /** 雨滴落水花（Rain.Update :125-134）：真 dust（dustWater()）非色方块——
   *  位置已按原版做完 −velocity、X−2/Y+2；rvx/rvy = 雨滴速度（dust.velocity 链用） */
  splashDust(x: number, y: number, rvx: number, rvy: number, waterStyle: number): void;
  /** 沙尘可见门（ZoneSandstorm+沙漠背景；Game 侧由 scene + bgStyle 判定） */
  sandstormVisuals: boolean;
  /** 沙漠沙格数（EmitDust 的 DesertSandTileCount 门 ≥100） */
  desertSandTiles: number;
  /** 沙色加权（四组计数：普通沙/珍珠沙/黑檀沙/猩红沙）→ 选色 */
  sandColors(): Array<{ color: string; weight: number }>;
}

let rainTex: ImageBitmap | HTMLImageElement | null = null;
function getRainTex(): ImageBitmap | HTMLImageElement | null {
  loadBitmapOnly('vanilla/Rain.png', () => rainTex !== null, (x) => { rainTex = x; });
  return rainTex;
}

/** Dust.dustWater()（Dust.cs:405-421）：雨溅花尘型按 waterStyle 映射（缺省 33 纯水） */
export function dustWaterFor(waterStyle: number): number {
  switch (waterStyle) {
    case 2: return 98;
    case 3: return 99;
    case 4: return 100;
    case 5: return 101;
    case 6: return 102;
    case 7: return 103;
    case 8: return 104;
    case 9: return 105;
    case 10: return 123;
    case 12: return 288;
    default: return 33;
  }
}

/** WorldGen.SolidTile（WorldGen.cs:70487-70499）1:1：nactive + tileSolid + !tileSolidTop
 *  + **!halfBrick + slope==0**——与 SolidCollision 的半砖/斜坡语义【相反】（生成门：
 *  半砖/斜坡格不算实心，雨滴要生成在其上再立即撞死溅花）。★曾用 isSolid（仅类型位,
 *  含半砖/斜坡）代替 → 斜坡/半砖屋顶正上方一列不生成雨（2026-09-01 半砖审计）。
 *  越界格按 vanilla tile==null → true（拒生） */
export function solidTileExact(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const nactive = st.flags[i] !== 0 && (st.wire[i] & TileStore.WIRE_ACTUATED) === 0;
  return nactive && TileStore.SOLID_LUT[st.type[i]] === 1 && !st.half[i] && st.slope[i] === 0;
}

/** Collision.WetCollision（Collision.cs:2763-2830）布尔 1:1（honey/shimmer 旗不建模，
 *  雨死判只用返回值）：内盒 = 中心收缩 (min(10,W)/2, min(H/2,H)/2)（C# int 除法）；
 *  液格 = **液面高度感知** AABB——水面随液量下降 (256−liquid)/16 px（浅水上缘是干的，
 *  雨滴穿过水面才判湿）；斜坡支 = 本格 slope≠0 且上邻格有液 → 湿（液覆斜坡）。
 *  ★曾用单点 liquid>0 代替——半格液上缘误判湿 */
export function wetCollisionBox(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const num = Math.min(10, w);
  const num2 = Math.min(Math.floor(h / 2), h);
  const vx = px + Math.floor(w / 2) - Math.floor(num / 2);
  const vy = py + Math.floor(h / 2) - Math.floor(num2 / 2);
  const x0 = Math.max(0, Math.min(Math.floor(px / TILE) - 1, st.w - 1));
  const x1 = Math.max(0, Math.min(Math.floor((px + w) / TILE) + 2, st.w - 1));
  const y0 = Math.max(0, Math.min(Math.floor(py / TILE) - 1, st.h - 40));
  const y1 = Math.max(0, Math.min(Math.floor((py + h) / TILE) + 2, st.h - 40));
  for (let i = x0; i < x1; i++) {
    for (let j = y0; j < y1; j++) {
      const idx = st.idx(i, j);
      if (st.liquid[idx] <= 0) {
        // else 支（:2811-2827）：斜坡格 + 上邻格有液 → 湿
        if (st.flags[idx] === 0 || st.slope[idx] === 0 || j <= 0) continue;
        if (st.liquid[st.idx(i, j - 1)] <= 0) continue;
        if (vx + num > i * TILE && vx < i * TILE + TILE && vy + num2 > j * TILE && vy < j * TILE + TILE) return true;
        continue;
      }
      const f = ((256 - st.liquid[idx]) / 32) * 2;          // num5*2f（浮点液面下降量）
      const cy = j * TILE + f;
      const ch = TILE - Math.trunc(f);                      // num4 -= (int)(num5*2f)
      if (vx + num > i * TILE && vx < i * TILE + TILE && vy + num2 > cy && vy < cy + ch) return true;
    }
  }
  return false;
}

/** Collision.SolidCollision（Collision.cs:2713-2746,2 参版）1:1：盒对实心格 AABB 扫描。
 *  ★斜坡按【整格】算（SolidCollision 无斜面削减——沙坡照样挡尘）、半砖下缩 8px、
 *  平台（tileSolidTop 族 solid:false）不算、已致动（inActive）不算。
 *  根因（2026-09-01 用户报"沙尘有几率穿透斜方块进屋"）：曾只测中心点所在单格——
 *  斜坡对角几何中心点常擦空,且 268 空中 vx ~28px/tick 且每拍 ×1.005 累乘,单点门
 *  被整列穿越。原版语义 = 粒 10×10 盒（position−(5,5) 起）与实心格重叠即命中 */
export function solidCollisionBox(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const x0 = Math.max(0, Math.min(Math.floor(px / TILE) - 1, st.w - 1));
  const x1 = Math.max(0, Math.min(Math.floor((px + w) / TILE) + 2, st.w - 1));
  const y0 = Math.max(0, Math.min(Math.floor(py / TILE) - 1, st.h - 40));
  const y1 = Math.max(0, Math.min(Math.floor((py + h) / TILE) + 2, st.h - 40));
  for (let i = x0; i < x1; i++) {
    for (let j = y0; j < y1; j++) {
      const idx = st.idx(i, j);
      if (st.flags[idx] === 0) continue;                        // !active
      if (st.wire[idx] & TileStore.WIRE_ACTUATED) continue;     // inActive（已致动不碰撞）
      if (TileStore.SOLID_LUT[st.type[idx]] !== 1) continue;    // tileSolid && !tileSolidTop
      let cy = j * TILE, ch = TILE;
      if (st.half[idx]) { cy += 8; ch = 8; }                    // halfBrick :2735-2738
      if (px + w > i * TILE && px < i * TILE + TILE && py + h > cy && py < cy + ch) return true;
    }
  }
  return false;
}

let dustTex: ImageBitmap | HTMLImageElement | null = null;
function getDustTex(): ImageBitmap | HTMLImageElement | null {
  loadBitmapOnly('vanilla/Dust.png', () => dustTex !== null, (x) => { dustTex = x; });
  return dustTex;  // 1000×120 = 10px 格、帧 8×8；雪花 = dust 76 (760,0/10/20)、沙尘 = dust 268 (680,60/70/80)
}

/**
 * Main.maxRain（Main.cs:1126）：`public static int maxRain = 750;` 固定初始化,全反编译源
 * 无再赋值点。它是雨池活跃帽/扫描域唯一权威：
 * - NewRain     num2 = (int)(maxRain×cloudAlpha) ≤ 750（Rain.cs:172-175）
 * - NewRainForced num2 = maxRain = 750,再按画质 (1+gq)/2<0.9 折减（Rain.cs:141-146）
 * - ClearRain / DrawRain 均只扫 [0,maxRain)（Rain.cs:24 / Main.cs:39480）
 * - 槽位总数 maxRain+1=751（Main.cs:1704 数组,new 于 Main.cs:6853）——末槽永不参扫
 * ★ MakeRain 的屏宽比例项 screenWidth/MaxWorldViewSize.X(常量 1920,Main.cs:754-758)
 *   只缩放"每帧生成尝试数"（Rain.cs:36-38 num *= 25×(0.25+cloudAlpha)）,不作用容量帽;
 *   本仓旧实现 min(2400,max(600,viewW×1.2)) 即误把屏宽比例当池帽,构成真实雨密度偏差。
 */
const MAIN_MAX_RAIN = 750;

export class WeatherRenderer {
  private pool: RainDrop[] = [];
  private poolCap = 0;
  /** 雪粒池（Main.snowing() → dust 76；与雨滴独立——雪原永远飘雪，雨时成暴风雪） */
  private snow: SnowFlake[] = [];
  /** 沙尘暴尘池（dust 268；SandStormCount 等价 = active 计数） */
  private sand: SandGrain[] = [];
  private weather: WeatherState | null = null;
  hooks: WeatherFxHooks | null = null;

  // ---- PR#2:烘焙结果跨帧 memo（trace 2026-09-01 定位 drawRain 链占主线程 17%）──
  // 同屏雨/雪/沙的光照色在邻格间高度聚集 ⇒ 相同 (tex,rect,RGB) 的烘焙被大量重复。
  // 安全性论证：
  //   · bakeTintFrame 的 scratch 画布按【key 字符串】专属绑定——命中即跳过 gen，
  //     该 key 的 scratch 自创建起绝不被覆写，缓存引用内容恒有效；
  //   · 其它 key 使用各自专属 scratch，互不可见；
  //   · key 覆盖全部语义输入（rect/frame/全精度 RGB String() 往返/k 系数），命中
  //     与重烘产出逐位相同；键空间无界由 BAKE_MEMO_CAP 全清兜底（同 swayTintCache
  //     >512 清空惯例，清后首帧补烘代价微小）。
  private bakeMemo = new Map<string, HTMLCanvasElement | null>();
  private static readonly BAKE_MEMO_CAP = 4096;
  /** ★F1 热修（2026-09-01 二轮 review 自捕）：初始实现把 gen() 返回的【固定 key 共享
   *  scratch】直接存表——同一原始 key 的两次不同语义烘焙（不同 RGB）互相覆写像素，
   *  旧 memo 条目命中时画出的是后烘颜色=错色雨条。修正：miss 时对 scratch 立即做
   *  【自有克隆】再入表，条目对外不可变；原始 key 的后续烘焙永远伤不到缓存内容。
   *  克隆本身按"写一次→反复采样"形态走默认 GPU 后备（见 memory canvas-readback-flag-policy）。 */
  private bakeMemoized(key: string, gen: () => HTMLCanvasElement | null): HTMLCanvasElement | null {
    const hit = this.bakeMemo.get(key);
    if (hit !== undefined) return hit;
    if (this.bakeMemo.size > WeatherRenderer.BAKE_MEMO_CAP) { const k0 = this.bakeMemo.keys().next().value; if (k0 !== undefined) this.bakeMemo.delete(k0); }   // ★逐条淘汰最旧(勿整表clear=重分配雪崩,2026-09-07 canvas哨兵案)
    const baked = gen();
    if (!baked) { this.bakeMemo.set(key, null); return null; }
    const own = document.createElement('canvas');
    own.width = baked.width; own.height = baked.height;
    const octx = own.getContext('2d')!;
    octx.drawImage(baked, 0, 0);                 // 像素级克隆（w/h 相同无缩放歧义）
    this.bakeMemo.set(key, own);
    return own;
  }

  /** Game 每帧注入（weather 状态 + hooks） */
  attach(weather: WeatherState, hooks: WeatherFxHooks) {
    this.weather = weather;
    this.hooks = hooks;
  }
  detach() { this.weather = null; this.hooks = null; this.pool.length = 0; this.snow.length = 0; this.sand.length = 0; }

  /** 池只增不减（原版 Main.rain 启动时一次分配 Main.cs:6853 永不重建），cap 由调用方给 MAIN_MAX_RAIN */
  private ensurePool(cap: number) {
    this.poolCap = cap;
    while (this.pool.length < cap) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, scale: 1, rotation: 0, type: 0, active: false });
    }
  }

  /** Rain.MakeRain（Rain.cs:30-92）：每帧按 cloudAlpha 掷新滴。总闸序 = Rain.cs:32 的
   *  五连 if（netMode/gamePaused/gameMenu/!ZoneRain/shimmerAlpha）——ZoneRain 是唯一
   *  「玩家不在地表」整帧停发位，逐滴门（:86）只管【生成点】非实心无墙 */
  private makeRain(viewW: number, camX: number, camY: number, playerVx: number, playerVy: number, world: World) {
    const w = this.weather;
    const hooks = this.hooks;
    if (!w || !hooks || w.cloudAlpha <= 0) return;
    // ★SW-BJ26 2026-09-07：总闸 `!Main.SceneMetrics.ZoneRain`（Rain.cs:32）——玩家在
    // 地表以下（SurfaceAtmospherics=false，SceneMetrics.cs:700）时原版整帧不生成任何
    // 雨滴。此前缺此闸只靠逐滴生成门（:86 非实心+无墙）+ atmo^9 削减：无墙洞穴的
    // 屏顶生成带两条件全空 → 洞内出雨（用户实报 2026-09-07；行为日志
    // behavior-log-粗暴的椰子地段：玩家 2059,380 洞区 2343 采样格 wall 全 0）。
    // 旧 `hooks.atmo < 0.4` 早退是 Rain.cs NewRain :188-190 `atmo<0.4 → num2=0` 的
    // 等价位（cap=0 恒不生成），保留在下——它不是地下停雨闸（atmo 地下钳 1）。
    if (!hooks.zoneRain) return;
    if (hooks.shimmerAlpha > 0) return;          // Main.shimmerAlpha 门（Rain.cs:32 同 if 链）
    if (hooks.atmo < 0.4) return;                // NewRain :188-190（atmo<0.4 → 生成帽 0）
    let num = (viewW / 1920) * 25;               // MaxWorldViewSize.X≈1920 的比例
    num *= 0.25 + 1 * w.cloudAlpha;              // Rain.cs:28
    if (hooks.bossDanger) {                          // :39-47：num2>1 且折后<1 才抬到 1
      const num2 = num;
      num *= 0.05;
      if (num2 > 1 && num < 1) num = 1;
    }
    for (let i = 0; i < num; i++) {
      // ★SW-BJ26 2026-09-07：删逐帧尝试 gfxQuality 掷门（2026-08-18 误挂）——
      // MakeRain 循环体（Rain.cs:43-91）无任何 rand(100)/gfxQuality 测试，:123 的
      // rand(100)<gfxQuality×100 是【溅花尘】概率（Update 死亡支）；画质对生成密度
      // 的原版唯一作用面 = 池帽折减（NewRain :179-183 / NewRainForced :142-146，
      // spawnRain/newRainForced 已 1:1）。旧门使 q<0.9 时雨密度双重削减（低于原版）
      // 屏外缓冲 ±600（玩家上跳 ×30，Rain.cs:44-48）
      let margin = 600;
      if (playerVy < 0) margin += Math.floor(Math.abs(playerVy) * 30);
      let x = camX - margin + Math.random() * (viewW + margin * 2);
      const y = camY - (20 + Math.random() * 80);
      x -= w.windSpeedCurrent * 15 * 40;          // 风偏移（Rain.cs:51）
      x += playerVx * 40;                          // 玩家运动补偿
      x = Math.max(0, Math.min((world.w - 1) * TILE, x));
      const tx = Math.max(0, Math.min(world.w - 1, Math.floor(x / TILE)));
      const ty = Math.max(0, Math.min(world.h - 1, Math.floor(y / TILE)));
      // 起点须非 SolidTile 实心且无墙（Rain.cs:86：WorldGen.SolidTile 排除半砖/斜坡——
      // ★曾用 isSolid 类型位 → 斜坡/半砖屋顶正上方一列不生成雨）
      const st = world.store;
      const solid = solidTileExact(st, tx, ty);
      const wall = st.wall[st.idx(tx, ty)];
      if (solid || wall > 0) continue;
      this.spawnRain(x, y);
    }
  }

  /** Rain.NewRain（Rain.cs:159-209）：atmo^9 削减 + 雪区平方削减 + 池按 cloudAlpha 限量 */
  private spawnRain(x: number, y: number) {
    const w = this.weather!;
    const hooks = this.hooks!;
    let cap = Math.floor(this.poolCap * w.cloudAlpha);
    const num4 = (1 + gfxQuality.value) / 2;             // :179-183 画质池帽
    if (num4 < 0.9) cap = Math.floor(cap * num4);
    const snow = hooks.snowRatio * hooks.snowRatio;
    cap = Math.floor(cap * (1 - snow));
    cap = Math.floor(cap * Math.pow(hooks.atmo, 9));
    if (cap <= 0) return;
    let slot = -1;
    for (let i = 0; i < cap; i++) {
      if (!this.pool[i].active) { slot = i; break; }
    }
    if (slot < 0) return;
    const d = this.pool[slot];
    d.active = true;
    d.x = x; d.y = y;
    d.scale = 1 + (Math.floor(Math.random() * 41) - 20) * 0.01;
    d.vx = w.windSpeedCurrent * 18 * d.scale;
    d.vy = 14 * d.scale;
    d.rotation = Math.atan2(d.vx, -d.vy);
    d.type = hooks.waterStyle * 3 + Math.floor(Math.random() * 3);  // Rain.cs:210
  }

  /** Rain.NewRainForced（Rain.cs:134-171）1:1：无视 cloudAlpha 限量（池全量扫空位），
   *  scale = 1+Next(-20,21)×0.01、velocity = 传入速度×scale、
   *  rotation = atan2(vx, -vy)。消费方 = 眼球伞滴水（Player.DoEyebrellaRainEffect） */
  newRainForced(x: number, y: number, vx: number, vy: number): void {
    const num3 = (1 + gfxQuality.value) / 2;              // Rain.cs:142-146 画质池帽
    const num2 = num3 < 0.9 ? Math.floor(this.poolCap * num3) : this.poolCap;
    for (let pi = 0; pi < num2; pi++) {
      const d = this.pool[pi];
      if (d.active) continue;
      d.active = true;
      d.x = x; d.y = y;
      d.scale = 1 + (Math.floor(Math.random() * 41) - 20) * 0.01;
      d.vx = vx * d.scale;
      d.vy = vy * d.scale;
      d.rotation = Math.atan2(d.vx, -d.vy);
      d.type = this.hooks!.waterStyle * 3 + Math.floor(Math.random() * 3);   // Rain.cs:165
      return;
    }
  }

  /** 每帧：雨滴+雪粒更新 + 沙尘发射（在绘制前的逻辑阶段调用，或 draw 内合并——原版即 draw 时 update） */
  update(world: World, viewW: number, viewH: number, camX: number, camY: number, playerVx: number, playerVy: number) {
    if (!this.weather) return;
    this.ensurePool(MAIN_MAX_RAIN);   // Main.maxRain=750 固定帽（Main.cs:1126/Rain.cs:172）,不随屏宽
    const hooks = this.hooks;
    if (!hooks) return;
    this.makeRain(viewW, camX, camY, playerVx, playerVy, world);
    this.makeSnow(viewW, viewH, camX, camY, playerVy, world);
    const camBottom = camY + viewH;                      // :2387 dust 屏底清（screenHeight,无 +100——雨专有）
    const st = world.store;
    for (const d of this.pool) {
      if (!d.active) continue;
      d.x += d.vx;
      d.y += d.vy;
      // 消亡门（Rain.Update :120）：SolidCollision(pos,2,2)（半砖下 8px 才算）‖
      // 液面感知 WetCollision(pos,2,2)（浅水上缘干）‖ 屏底 +100
      const solid = solidCollisionBox(st, d.x, d.y, 2, 2);
      const wet = wetCollisionBox(st, d.x, d.y, 2, 2);
      if (solid || wet || d.y > camY + viewH + 100) {
        d.active = false;
        // 落水花（Rain.Update :123-134）：真 dust = dustWater()（waterStyle 映射），
        // 生在 position−velocity（退回表面一步）再 X−2/Y+2；alpha=38/scale=0.6/
        // noGravity/velocity = v×0.1 + (−rain.v×0.025)、Y−2——Game 侧 hook 精置。
        // 概率门 rand(100)<gfxQuality×100（2026-08-18 接自动画质;q=1 恒溅;
        // ★曾误 0.5 少一半水花;★曾为 '#B8D0E8' 色方块近似,2026-09-01 改真尘）
        if (Math.random() * 100 < gfxQuality.value * 100) {
          hooks.splashDust(d.x - d.vx - 2, d.y - d.vy + 2, d.vx, d.vy, hooks.waterStyle);
        }
      }
    }
    // ---- 雪粒更新（Dust.cs:1810-1828 dust 76 分支）----
    const snowLive: SnowFlake[] = [];
    for (const f of this.snow) {
      if (!f.active) continue;
      f.x += f.vx;
      f.y += f.vy;
      f.scale += 0.009;                            // dust.scale += 0.009（:1812）
      // 玩家下落跟随（:1815-1819）：vy 向玩家 vy 靠 + 位相补偿
      if (playerVy > 0 && f.vy < playerVy) f.vy += (playerVy - f.vy) * 0.04;
      if (playerVy > 0) f.y += playerVy * 0.2;
      if (solidCollisionBox(st, f.x - 5, f.y - 5, 10, 10)) {   // :1823-1827 SolidCollision 10×10 盒
        f.scale *= 0.9; f.vx *= 0.25; f.vy *= 0.25;
      }
      f.scale -= 0.01;                              // :2163 老化（76 无 fadeIn,与链内 +0.009 净 −0.001/t
      //  = 原版寿命机制;★曾用 life 200-300 计时器替代 → 雪片 +0.009/t 无限变大、寿命偏短）
      if (f.scale < 0.1 || f.y > camBottom) f.active = false;   // :2432/:2387
      if (f.active) snowLive.push(f);
    }
    // ---- 沙尘 grain 更新（Dust.cs 268 独占链 :1859-1887 + :469 移动 + :2148 老化
    //      + :445/:2387/:2432 死亡）。268 为链 A 链接：不吃 :1884 通用重力，空中 vy 由
    //      else 支整拍重置 = sin(x×0.0044)×2+3 波动下坠；老化 −0.01 与链内 +0.01 对冲
    //      → scale 恒定，寿命由屏底/实心收缩/黑光（绘制端 :39730）决定。
    //      ★曾漏 else 支误加 +0.05 通用重力、实心判定用中心点单格（穿斜坡进屋）、
    //      先测后移时序差一拍、屏外横漂粒不回收泄漏发射预算——2026-09-01 全修）----
    const sandBottom = camY + viewH;
    for (const g of this.sand) {
      if (!g.active) continue;
      if (g.scale > 10) { g.active = false; continue; }        // :445
      g.x += g.vx; g.y += g.vy;                                // :469 position += velocity（先移后测）
      g.vx *= 1.0050251; g.vy *= 1.0050251;                    // :1862
      g.scale += 0.01;                                         // :1863
      if (!hooks.sandstormVisuals) g.scale -= 0.05;            // :1864-1867
      const pvy = playerVy;                                    // :1869 Main.player.velocity.Y
      if (pvy > 0 && g.fadeIn === 0 && g.vy < pvy) g.vy += (pvy - g.vy) * 0.04;  // :1870-1873
      if (pvy > 0) g.y += pvy * 0.2;                           // :1874-1877
      if (g.fadeIn === 0 && solidCollisionBox(st, g.x - 5, g.y - 5, 10, 10)) {
        g.scale *= 0.9; g.vx *= 0.25; g.vy *= 0.25;            // :1878-1882 实心收缩
      } else {
        g.vy = Math.sin(g.x * 0.0043982295) * 2 + 3;           // :1883-1887 空中波动下坠
      }
      if (g.fadeIn > 0 && g.fadeIn < 100) {                    // :2148-2162 生长目标档
        g.scale += 0.03;
        if (g.scale > g.fadeIn) g.fadeIn = 0;
      } else {
        g.scale -= 0.01;                                       // :2163-2168（与链内 +0.01 对冲净零）
      }
      // :2387 屏底 + :2432 缩没 + DrawDust 剔除矩形（:38268-38284 ±1000/±1050,原版逐帧
      // 执行——屏外横漂粒不回收会吃光 num9 发射预算）
      if (g.y > sandBottom || g.scale < 0.1
        || g.x < camX - 1000 || g.x > camX + viewW + 1000 || g.y < camY - 1050) g.active = false;
    }
    this.emitSandstorm(world, viewW, viewH, camX, camY);
  }

  /** Main.snowing()（Main.cs:12964-13045）1:1：雪原常开雪粒；雨时（cloudAlpha↑）密度
   *  与风速激增 = 暴风雪。密度指数 = (count/6000)^(4−3α)；目标数 500×屏比×(1+2α)；
   *  每帧尝试 1+50α 次；dust 76。★此前整个雪粒系统缺失——雪原下雨时雨量按原版
   *  snowRatio² 削到 0 后什么都没有（用户报告"冰雪地区看不到雨"） */
  private makeSnow(viewW: number, viewH: number, camX: number, camY: number, playerVy: number, world: World) {
    const w = this.weather!;
    const hooks = this.hooks!;
    // ★SW-BJ26 2026-09-07：门 1:1（Main.cs:13208-13209 `gamePaused ||
    // SceneMetrics.SnowTileCount <= 0 || !SceneMetrics.SurfaceAtmospherics → return`）
    // ——地表性硬位（SurfaceAtmospherics=玩家 tileY≤worldSurface）非 atmo 梯度：
    // 旧 `atmo<0.4` 近似在 92..worldSurface 天空带误杀雪、worldSurface 以下（atmo 钳 1）
    // 近雪窗漏放=洞内飘雪（与洞内雨 SW-BJ26 同族根因）
    if (!hooks.surfaceAtmospherics || hooks.snowTileCount <= 0) return;   // Main.cs:13209
    if ((world as unknown as { remixWorld?: boolean }).remixWorld) return;  // snowing() :13205 remix 早退
    let num = hooks.snowTileCount / 6000;                       // SnowTileMax（SceneMetrics.cs:46）
    num = Math.pow(num, 4 - w.cloudAlpha * 3);
    let target = Math.floor(500 * (viewW / 1920) * (1 + 2 * w.cloudAlpha));
    const attempts = 1 + 50 * w.cloudAlpha;
    if (hooks.deerclopsNear) {                                  // :13228-13231 鹿角怪稀释放雪
      num /= 20;
      target /= 3;
    }
    let live = 0;
    for (const f of this.snow) if (f.active) live++;
    const st = world.store;
    for (let i = 0; i < attempts; i++) {
      // 活片门（:12997）：num4×(gfxQuality/2+0.5)+num4×0.1(2026-08-18 接自动画质,
      // q=1 → 1.1×target)。★曾误 0.5 档（0.6×target）= 雪密度只有原版 55%
      if (!(live < target * (gfxQuality.value / 2 + 0.5) + target * 0.1)) break;
      if (Math.random() >= num) continue;
      let sx = Math.floor(Math.random() * (viewW + 1500)) - 750;
      let sy = camY - Math.floor(Math.random() * 50);
      if (playerVy > 0) sy -= Math.floor(playerVy);
      const r1 = Math.random() < 0.2;                           // 两独立 Next(5)==0（:12990-12994）
      if (r1) sx = Math.floor(Math.random() * 500) - 500;
      else if (Math.random() < 0.2) sx = Math.floor(Math.random() * 500) + viewW;
      if (sx < 0 || sx > viewW) sy += Math.floor(Math.random() * (viewH * 0.8)) + Math.floor(viewH * 0.1);
      sx += camX;
      const tx = Math.max(0, Math.min(world.w - 1, Math.floor(sx / TILE)));
      const ty = Math.max(0, Math.min(world.h - 1, Math.floor(sy / TILE)));
      const ii = st.idx(tx, ty);
      // 生成门（Main.cs:13200 snowing）：!nactive && wall==0 才生成——nactive = active
      // && !致动（致动格对碰撞免疫,原版允许雪生成其间）;★曾用 active 位漏致动豁免
      const nactive = st.flags[ii] !== 0 && (st.wire[ii] & TileStore.WIRE_ACTUATED) === 0;
      if (nactive || st.wall[ii] !== 0) continue;
      // 尺度/速度时序（:13249-13271）：NewDust 抖动 → +0.2α(#1) → vy *= scale →
      // 风分支 → vy *= 1+0.3α → +0.2α(#2) → Deerclops −0.5 → 尾乘 1+0.5α
      let scale = 1 + (Math.floor(Math.random() * 41) - 20) * 0.01;
      scale += 0.2 * w.cloudAlpha;
      let vy = 3 + Math.floor(Math.random() * 30) * 0.1;
      vy *= scale;
      let vx: number;
      if (!w.raining) {
        vx = w.windSpeedCurrent + (Math.floor(Math.random() * 20) - 10) * 0.1;
        vx += w.windSpeedCurrent * 15;
      } else {
        vx = Math.sqrt(Math.abs(w.windSpeedCurrent)) * Math.sign(w.windSpeedCurrent)
          * (w.cloudAlpha + 0.5) * 10 + Math.random() * 0.2 - 0.1;
        vy *= 0.5;
      }
      vy *= 1 + 0.3 * w.cloudAlpha;
      scale += 0.2 * w.cloudAlpha;                              // :13265 #2
      if (hooks.deerclopsNear) scale -= 0.5;                    // :13267-13269
      const k = 1 + w.cloudAlpha * 0.5;                         // 末端 velocity ×= 1+0.5α
      const f: SnowFlake = { x: sx, y: sy, vx: vx * k, vy: vy * k, scale, frame: Math.floor(Math.random() * 3), active: true };
      this.snow.push(f);
      live++;
    }
    if (this.snow.length > 1600) {                              // 池帽：超额时滤掉已死片
      this.snow = this.snow.filter((s) => s.active).concat(this.snow.filter((s) => !s.active).slice(0, 800));
    }
  }

  /** Sandstorm.EmitDust（Sandstorm.cs:141-248）1:1 → dust 268 grain 池。
   *  密度门 Next(num5/4)、每帧尝试 20×Severity、屏上方 -50 生成带、边缘 1/3、
   *  num9 预算（num7×1.1−活尘，num7=1000×屏比,gfxQuality=1）、速度链（主项 dir×lerp(.5,.7,α)×20
   *  + 基速 5、vy=(2+rand.2)×0.35、×(1+num12×.5)(1+num12)value）、fadeIn += num13×0.2、
   *  簇生链（:187-207 j-- 重掷 1/maxValue2：pos += rand±10 + v×−1.1，链上生尘不做墙门）。
   *  ★曾走 Game.particles 色方块近似（用户令禁近似,2026-08-14 全量 1:1） */
  private emitSandstorm(world: World, viewW: number, viewH: number, camX: number, camY: number) {
    const w = this.weather!;
    const hooks = this.hooks!;
    const sand = w.sandstorm;
    if (!hooks.sandstormVisuals || !sand.happening || hooks.desertSandTiles < 100) return;
    const dir = Math.sign(w.windSpeedCurrent);
    const windAbs = Math.abs(w.windSpeedCurrent);
    if (windAbs < 0.01) return;
    const num3 = dir * (0.9 + 0.1 * windAbs);               // Lerp(0.9,1,num2)
    const num4 = 2000 / hooks.desertSandTiles;
    const value = Math.max(0.77, Math.min(1, 3 / num4));
    const num5 = Math.max(1, Math.floor(num4));             // 密度门分母 /4
    const num8 = 20 * sand.severity;                        // 每帧尝试数
    const num12 = 0.2 + 0.15 * sand.severity;               // Lerp(0.2,0.35,Severity)
    const num13 = 0.5 + 0.2 * sand.severity;                // Lerp(0.5,0.7,Severity)
    const amount = (value - 0.77) / 0.23000002;
    const maxValue2 = Math.max(1, Math.floor(1 + 9 * amount));   // Lerp(1,10,amount)
    const num7 = Math.floor(1000 * (viewW / 1920));         // maxScreenW≈1920
    const gq = gfxQuality.value;                            // :171 SandStormCount 预算按画质
    let num9 = num7 * (gq * 0.5 + 0.5) + num7 * 0.1 - this.countSand();
    if (num9 <= 0) return;
    const colors = hooks.sandColors().filter((c) => c.weight > 0);
    const totalW = colors.reduce((s, c) => s + c.weight, 0);
    if (!colors.length || totalW <= 0) return;
    const st = world.store;
    const pickColor = (): [number, number, number] => {
      let pick = Math.random() * totalW;
      let c = colors[0].color;
      for (const cc of colors) { pick -= cc.weight; if (pick <= 0) { c = cc.color; break; } }
      const v = parseInt(c.slice(1), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    };
    const spawnGrain = (x: number, y: number) => {
      let vx = num3 * 5 + Math.random();                    // :169-176 速度链
      vx += num3 * num13 * 20;
      let vy = (2 + Math.random() * 0.2) * 0.35;            // ×scale(默认1)×0.35
      const k = (1 + num12 * 0.5) * (1 + num12) * value;    // :177-180 末端三连乘
      vx *= k; vy *= k;
      const [cr, cg, cb] = pickColor();
      this.sand.push({
        x, y, vx, vy, scale: 0.9,                           // :181 scale=0.9（速度链后置）
        fadeIn: num13 * 0.2,                                // :178
        cr, cg, cb, frame: Math.floor(Math.random() * 3), active: true,
      });
      num9--;
    };
    for (let i = 0; i < num8 && num9 > 0; i++) {
      if (Math.floor(Math.random() * Math.max(1, Math.floor(num5 / 4))) !== 0) continue;  // Next(num5/4)==0
      let x = Math.random() * (viewW + 1000) - 500;
      let y = -Math.random() * 50;                          // 屏幕上缘之上
      if (Math.random() * 3 < 1 && dir === 1) x = Math.random() * 500 - 500;
      else if (Math.random() * 3 < 1 && dir === -1) x = Math.random() * 500 + viewW;
      if (x < 0 || x > viewW) y += Math.random() * viewH * 0.9;
      x += camX; y += camY;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!stIn(world, tx, ty) || st.wall[st.idx(tx, ty)] !== 0) continue;
      // 内联簇生链（:181-207）：1/maxValue2 概率原地续生（j--），位置步进 rand±10+v×−1.1
      for (let j = 0; j < 1 && num9 > 0; j++) {
        spawnGrain(x, y);
        if (num9 <= 0) break;
        if (Math.floor(Math.random() * maxValue2) !== 0) {
          j--;
          x += (Math.random() * 20 - 10) - this.sand[this.sand.length - 1].vx * 1.1;
          y += (Math.random() * 20 - 10) - this.sand[this.sand.length - 1].vy * 1.1;
        }
      }
    }
    if (this.sand.length > 2200) this.sand = this.sand.filter((g) => g.active);
  }

  private countSand(): number {
    let n = 0;
    for (const g of this.sand) if (g.active) n++;
    return n;
  }

  /** Rain.Draw（Main.cs:38238-38266）：2×40 条 × type 偏移，光照着色 ×0.85。
   *  ★2026-08-24 r15 R15-1 拆分：原版雨在 DrawItems/全部实体之后（Main.cs:63226→
   *  :63227）、DrawGore 之前——Renderer 在实体循环后调用本方法（雨幕盖角色/敌怪）。 */
  drawRain(r: Renderer, world: World) {
    const w = this.weather;
    const hooks = this.hooks;
    if (!w || !hooks) return;
    if (w.cloudAlpha <= 0) return;
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const tex = getRainTex();
    const texOk = tex && (tex.width > 0) && tex.width > 0;
    for (const d of this.pool) {
      if (!d.active) continue;
      const tx = Math.floor((d.x + 4) / TILE);
      const ty = Math.floor((d.y + 4) / TILE);
      const [lr, lg, lb] = hooks.lightAt(tx, ty);
      ctx.save();
      // DrawRain（:38246-38256）1:1：position=左上角、origin=(0,0)（绕【顶点】旋转，
      // 雨条自 position 向速度方向垂落）——★曾中心锚（整体低 20px+旋转心错）
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      if (texOk) {
        // 光照着色（Main.cs:38248-38252）1:1：color = GetColor(light)×0.85f，shimmerAlpha>0
        // 再 ×(1−shimmerAlpha)——都是【逐通道连续值】乘法（XNA Color*float 只乘 RGB 不动 A）。
        // PR#2：烘焙结果按 (type,精确 RGB,k) 进跨帧 memo——邻格光照聚集 ⇒ 大量去重，
        // 命中与重烘逐位相同（见类内安全性论证）。★旧实现把光照折成均值灰量化 8 档再乘
        // （±9% 误差且彩色光照丢通道），2026-09-01 弃用。shimmer 系数合并进 k：
        // shimmerAlpha=0 时 (1−0)=1，乘法恒等，与原版分支逐位同值。
        const k = 0.85 * (1 - hooks.shimmerAlpha);
        const cr = Math.round(lr * k), cg = Math.round(lg * k), cb = Math.round(lb * k);
        const tinted = this.bakeMemoized(
          `rain-strip|${d.type}|${cr},${cg},${cb}|k=${k}`,
          () => bakeTintFrame('rain-strip', tex!, d.type * 4, 0, 2, 40, cr, cg, cb));
        if (tinted) {
          ctx.drawImage(tinted, 0, 0, 2, 40, 0, 0, 2 * d.scale, 40 * d.scale);
        }
      }
      ctx.restore();
    }
    ctx.restore();
    void world;
  }

  /** 雪/沙尘 precip（★r15 R15-1 拆分：原版雪=dust 76、沙尘=dust 268 走 DrawDust
   *  Main.cs:39501——碎块后、前景水前；Renderer 在 gore 后调用本方法）。
   *  通用支（:39722-39733）：基画 GetAlpha(Lighting.GetColor(pos)) 全幅 + dust.color 非零时
   *  叠画 GetColor(基画)；GetColor = color−(255−基画) 逐通道钳 [0,255]（Dust.cs:2802-2854），
   *  overlay alpha = color.A 同式（雪 76 无 color=单画）。帧 8×8、origin (4,4)、rot 0。
   *  光照纯黑 → dust.active=false（:39730，GetAlpha(Black)==Black 同判）——两池同遵。
   *  ★2026-09-01 去量化：光照乘数全部改逐粒【全精度 RGB】（基画乘 (lr,lg,lb)、叠画减
   *  各自配对通道），旧 8 级均值灰 v 全面退役。 */
  drawPrecipDust(r: Renderer, world: World) {
    const hooks = this.hooks;
    if (!hooks) return;
    const ctx = r.ctx;
    const dTex = getDustTex();
    if (dTex && (dTex.width > 0) && dTex.width > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const f of this.snow) {
        if (!f.active) continue;
        const tx = Math.floor((f.x + 5) / TILE);
        const ty = Math.floor((f.y + 5) / TILE);
        const [lr, lg, lb] = hooks.lightAt(tx, ty);
        if (lr === 0 && lg === 0 && lb === 0) { f.active = false; continue; } // :39730
        // 单画（GetAlpha 路径，dust 76 无 color 不叠）——雪花本体白格阵，RGB 直接乘全精度光
        // PR#2：memo（键含全精度 String() 往返,命中逐位相同）
        const tinted = this.bakeMemoized(
          `flake|${f.frame}|${lr},${lg},${lb}`,
          () => tintedFlake(dTex, lr, lg, lb, f.frame));
        if (tinted) ctx.drawImage(tinted, f.x - 4 * f.scale, f.y - 4 * f.scale, 8 * f.scale, 8 * f.scale);
      }
      // ---- 沙尘 grain（dust 268；DrawDust 通用支双画：环境光底 + GetColor 叠画）----
      for (const g of this.sand) {
        if (!g.active) continue;
        const tx = Math.floor((g.x + 4) / TILE);
        const ty = Math.floor((g.y + 4) / TILE);
        const [lr, lg, lb] = hooks.lightAt(tx, ty);
        if (lr === 0 && lg === 0 && lb === 0) { g.active = false; continue; } // :39730
        const base = this.bakeMemoized(
          `dust268-base|${g.frame}|${lr},${lg},${lb}`,
          () => bakeTintFrame('dust268-base', dTex, 680, 60 + 10 * g.frame, 8, 8,
            lr, lg, lb));                                       // 基画 = GetAlpha(light)（全幅）
        // 叠画 = GetColor(基画) = color − (255 − 基画) 逐通道钳 [0,255]（Dust.cs:2802-2854）；
        // 基画各通道取全精度光。★本模型不含 GetAlpha 的 ka=(255−alpha)/255 与 light.A 项
        // （dust.alpha 场未建模，与定谳批一致）；A 槽见下方 ga 注。
        // ★曾按 dust.color×light 乘色且丢 alpha 通道：乘出来的暗绿十字即"沙尘暴飞树叶"
        //   假象（2026-08-31 定谳）
        const gcr = Math.max(0, Math.min(255, g.cr + lr - 255));
        const gcg = Math.max(0, Math.min(255, g.cg + lg - 255));
        const gcb = Math.max(0, Math.min(255, g.cb + lb - 255));
        const over = this.bakeMemoized(
          `dust268-tint|${g.frame}|${gcr},${gcg},${gcb}`,
          () => bakeTintFrame('dust268-tint', dTex, 680, 60 + 10 * g.frame, 8, 8, gcr, gcg, gcb));
        // A 槽：old 曾把灰度 v 代入 GetColor 的 alpha 式 clamp(A+v−255)（量化遗留耦合，
        // 暗 光下叠画整层消失）。斩断后按 light.A≡255 + 本仓不建模 dust.alpha → A = color.A
        // 常量；若日后建模两场再补完整 A 链
        const ga = SAND_COLOR_ALPHA / 255;
        const dx = g.x - 4 * g.scale, dy = g.y - 4 * g.scale;
        const sz = 8 * g.scale;
        if (base) ctx.drawImage(base, dx, dy, sz, sz);
        if (over) {
          ctx.globalAlpha = ga;
          ctx.drawImage(over, dx, dy, sz, sz);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }
    void world;
  }

  /** 全量绘制（雨+雪沙同窗）——兼容旧调用方；Renderer 主路径已拆 drawRain/
   *  drawPrecipDust 分层 */
  draw(r: Renderer, world: World) {
    this.drawRain(r, world);
    this.drawPrecipDust(r, world);
  }
}

/* ── 逐粒精确乘色（2026-09-01 弃 8 级灰阶量化缓存）────────────────────────────
 *  原版三处着色的乘数都是【连续逐通道】值：
 *    雨条   Main.DrawRain :38248-38252 —— GetColor(pos)×0.85f，shimmer 再 ×(1−α)
 *    尘基画 Main.DrawDust :39722       —— dust.GetAlpha(GetColor(pos))
 *    尘叠画 Main.DrawDust :39725-39733 —— dust.GetColor(基画) = color−(255−基画)
 *             逐通道钳 [0,255]（Dust.cs:2802-2854）
 *  旧实现把光照折成均值灰、量化 8 档后按档预烘焙乘色画布（rainTintCache/
 *  flakeTintCache/sandTintCache 三张 Map）——亮度误差约 ±9%、彩色光照丢通道。
 *  现改为每粒在【模块级共享 scratch】上按全精度 RGB 现烘（multiply 铺色 +
 *  destination-in 保形两步式，等价 Renderer.tintedSprite 的单帧路径）。
 *  ★PR#2（2026-09-01 trace 复盘）增补跨帧 memo：scratch 按 key 字符串专属绑定，
 *    命中即跳过重烘 ⇒ scratch 自创建起不被覆写,缓存引用恒有效;键含全部语义输入
 *    （rect/frame/精确 RGB/k），无界空间由 4096 全清兜底——同帧去重之外的邻帧
 *    光照重复(同一格雨连滴)亦被吸收。类内 bakeMemoized+安全论证全文见此类头。 */

interface TintScratch { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
const tintScratches = new Map<string, TintScratch>();

function tintScratch(key: string, w: number, h: number): TintScratch | null {
  if (typeof document === 'undefined') return null;
  let s = tintScratches.get(key);
  if (!s) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    s = { canvas, ctx: canvas.getContext('2d')! };
    tintScratches.set(key, s);
  }
  return s;
}

/** multiply 复合的 fillStyle 要求合法 rgb()：分量 NaN/越界时声明无效 → 会沿用上次
 *  fillStyle（=错色），这里统一钳制兜底 */
function tintByte(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0;
}

/** 把 tex 的 (sx,sy,w,h) 帧乘精确 RGB 烘进 key 对应的 scratch 后返回该 canvas；
 *  调用方必须当场绘制/取证（toDataURL），下次烘焙即覆写 */
function bakeTintFrame(key: string, tex: ImageBitmap | HTMLImageElement,
  sx: number, sy: number, w: number, h: number,
  cr: number, cg: number, cb: number): HTMLCanvasElement | null {
  const s = tintScratch(key, w, h);
  if (!s) return null;
  const cx = s.ctx;
  cx.globalCompositeOperation = 'source-over';
  cx.clearRect(0, 0, w, h);
  cx.drawImage(tex, sx, sy, w, h, 0, 0, w, h);
  // ① RGB 乘乘数（multiply 会把精灵透明区铺满成方形伪影，由②裁掉）
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${tintByte(cr)},${tintByte(cg)},${tintByte(cb)})`;
  cx.fillRect(0, 0, w, h);
  // ② 本体作 destination-in 源：alpha 回到精灵轮廓
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(tex, sx, sy, w, h, 0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';
  return s.canvas;
}

function stIn(world: World, tx: number, ty: number): boolean {
  return world.store.inBounds(tx, ty);
}

/** 雪片（dust 76）真帧：Dust.png (760,10×frame,8,8)（NewDust frame 8×8、
 *  frame.Y=10×rand(3)，Dust.cs:176-190）乘精确 RGB——生产单画路径与探针共用。
 *  ★签名变化（2026-09-01 去量化）：旧版第二参是 8 级量化的灰度 v，现为全精度 r/g/b */
export function tintedFlake(tex: ImageBitmap | HTMLImageElement, r: number, g: number, b: number, frame: number): HTMLCanvasElement | null {
  return bakeTintFrame('flake', tex, 760, 10 * frame, 8, 8, r, g, b);
}

/** 沙尘 grain（dust 268）真帧：Dust.png (680,60+10×frame,8,8) 三帧（NewDust while
 *  双轮：frame.Y = 10×rand(3)+60——★(680,20) 是 dust 68 的蓝十字格，蓝底被 GetColor
 *  沙色乘成暗绿 = 「树叶」假象根因，2026-08-31 定谳）。RGB 语义不变；overlay 的
 *  alpha 由调用方 globalAlpha 施加。★探针回归入口（scripts/_sandstorm-grain-color.mjs
 *  帧区分性）——slot 与生产基画槽分开，双画底稿不被覆盖 */
export function tintedDust268(tex: ImageBitmap | HTMLImageElement, cr: number, cg: number, cb: number, frame: number): HTMLCanvasElement | null {
  return bakeTintFrame('dust268-tint', tex, 680, 60 + 10 * frame, 8, 8, cr, cg, cb);
}
