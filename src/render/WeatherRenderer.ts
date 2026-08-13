// 天气渲染（Terarria1456 Rain.cs / Sandstorm.EmitDust / 闪电白 Main.cs:63346）：
//   - 雨滴池：MakeRain/Update/Draw 逐行移植（风偏移/起点非实心门/atmo^9 削减/落水花）
//   - 沙尘暴粒子发射（四色加权/Severity 驱动/风向）——走 Game.particles
//   - 闪电：由 SkyRenderer 读 weather.lightning 把天空色向白 lerp（不画贴图，原版同语义）
// 绘制在世界坐标变换内调用（与实体一致），雨层画在瀑布后实体前（原版 DrawRain 在
// tile 层后）。光照着色由调用方注入 lightAt 回调（LightingEngine.lightAt 同源）。
import { TILE } from '../core/constants';
import type { World } from '../world/World';
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
  life: number;
  active: boolean;
}

export interface WeatherFxHooks {
  /** 光照采样（0-255 RGB；雨滴着色 ×0.85） */
  lightAt(tx: number, ty: number): [number, number, number];
  /** 地表开阔度 0-1（原版 atmo——地下无雨） */
  atmo: number;
  /** 雪区雪格比例 0-1（削减雨量；SceneMetrics SnowTileCount/Threshold 的平方） */
  snowRatio: number;
  /** 雪区雪格原始计数（snowing() 的密度指数；SceneMetrics.SnowTileCount） */
  snowTileCount: number;
  /** Boss 危险中（雨量 ×0.05 保底 1，Rain.cs:32-40） */
  bossDanger: boolean;
  /** 沙尘发射（粒子上限由 Game.particles 自身的 600 帽控制）；size 供涟漪/沙尘区分 */
  emitSand(x: number, y: number, vx: number, vy: number, color: string, size?: number): void;
  /** 沙尘可见门（ZoneSandstorm+沙漠背景；Game 侧由 scene + bgStyle 判定） */
  sandstormVisuals: boolean;
  /** 沙漠沙格数（EmitDust 的 DesertSandTileCount 门 ≥100） */
  desertSandTiles: number;
  /** 沙色加权（四组计数：普通沙/珍珠沙/黑檀沙/猩红沙）→ 选色 */
  sandColors(): Array<{ color: string; weight: number }>;
}

let rainTex: HTMLImageElement | null = null;
function getRainTex(): HTMLImageElement | null {
  if (rainTex !== null) return rainTex;
  if (typeof Image === 'undefined') return null;
  rainTex = new Image();
  rainTex.src = 'sprites/vanilla/Rain.png';
  return rainTex;
}

let dustTex: HTMLImageElement | null = null;
function getDustTex(): HTMLImageElement | null {
  if (dustTex !== null) return dustTex;
  if (typeof Image === 'undefined') return null;
  dustTex = new Image();
  dustTex.src = 'sprites/vanilla/Dust.png';      // 1000×120 = 10px 格；雪花 = dust 76 (760,0)
  return dustTex;
}

export class WeatherRenderer {
  private pool: RainDrop[] = [];
  private poolCap = 0;
  /** 雪粒池（Main.snowing() → dust 76；与雨滴独立——雪原永远飘雪，雨时成暴风雪） */
  private snow: SnowFlake[] = [];
  private weather: WeatherState | null = null;
  hooks: WeatherFxHooks | null = null;

  /** Game 每帧注入（weather 状态 + hooks） */
  attach(weather: WeatherState, hooks: WeatherFxHooks) {
    this.weather = weather;
    this.hooks = hooks;
  }
  detach() { this.weather = null; this.hooks = null; this.pool.length = 0; this.snow.length = 0; }

  /** 池容量 = 屏宽比例（原版 Main.maxRain 语义近似：屏宽/视口宽×25） */
  private ensurePool(cap: number) {
    this.poolCap = cap;
    while (this.pool.length < cap) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, scale: 1, rotation: 0, type: 0, active: false });
    }
  }

  /** Rain.MakeRain（Rain.cs:21-77）：每帧按 cloudAlpha 掷新滴 */
  private makeRain(viewW: number, camX: number, camY: number, playerVx: number, playerVy: number, world: World) {
    const w = this.weather;
    const hooks = this.hooks;
    if (!w || !hooks || w.cloudAlpha <= 0 || hooks.atmo < 0.4) return;
    let num = (viewW / 1920) * 25;               // MaxWorldViewSize.X≈1920 的比例
    num *= 0.25 + 1 * w.cloudAlpha;              // Rain.cs:28
    if (hooks.bossDanger) num = Math.max(1, num * 0.05);
    for (let i = 0; i < num; i++) {
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
      // 起点须非实心且无墙（Rain.cs:72-74）
      const st = world.store;
      const solid = st.isSolid(tx, ty);
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
    d.type = Math.floor(Math.random() * 3);       // waterStyle=0 → type 0-2（Rain.png 三型）
  }

  /** 每帧：雨滴+雪粒更新 + 沙尘发射（在绘制前的逻辑阶段调用，或 draw 内合并——原版即 draw 时 update） */
  update(world: World, viewW: number, viewH: number, camX: number, camY: number, playerVx: number, playerVy: number) {
    if (!this.weather) return;
    this.ensurePool(Math.min(2400, Math.max(600, Math.floor(viewW * 1.2))));
    const hooks = this.hooks;
    if (!hooks) return;
    this.makeRain(viewW, camX, camY, playerVx, playerVy, world);
    this.makeSnow(viewW, viewH, camX, camY, playerVy, world);
    const camBottom = camY + 2000;
    const st = world.store;
    for (const d of this.pool) {
      if (!d.active) continue;
      d.x += d.vx;
      d.y += d.vy;
      const tx = Math.floor((d.x + 1) / TILE);
      const ty = Math.floor((d.y + 1) / TILE);
      const solid = st.inBounds(tx, ty) && st.isSolid(tx, ty);
      const wet = st.inBounds(tx, ty) && st.liquid[st.idx(tx, ty)] > 0;
      if (solid || wet || d.y > camBottom) {
        d.active = false;
        // 落水花（Rain.cs:120-133）：dust 生在 position−velocity（退回表面一步），
        // 再 X−2/Y+2；速度 = −v×0.025 且 Y−2。概率 = gfxQuality（0.5）。
        // ★曾生在当前位置（水/地面格内 14px 深）= 涟漪沉在水下（用户报告位置不对）
        if (Math.random() < 0.5) {
          hooks.emitSand(d.x - d.vx - 2, d.y - d.vy + 2, -d.vx * 0.025, -d.vy * 0.025 - 2, '#B8D0E8', 3);
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
      const fx = Math.floor((f.x + 5) / TILE), fy = Math.floor((f.y + 5) / TILE);
      const solidHere = st.inBounds(fx, fy) && st.isSolid(fx, fy);
      if (solidHere) { f.scale *= 0.9; f.vx *= 0.25; f.vy *= 0.25; }  // 落地（:1821-1824）
      if (--f.life <= 0 || f.scale < 0.3 || f.y > camBottom) f.active = false;
      if (f.active) snowLive.push(f);
    }
    this.emitSandstorm(world, viewW, camX, camY);
  }

  /** Main.snowing()（Main.cs:12964-13045）1:1：雪原常开雪粒；雨时（cloudAlpha↑）密度
   *  与风速激增 = 暴风雪。密度指数 = (count/6000)^(4−3α)；目标数 500×屏比×(1+2α)；
   *  每帧尝试 1+50α 次；dust 76。★此前整个雪粒系统缺失——雪原下雨时雨量按原版
   *  snowRatio² 削到 0 后什么都没有（用户报告"冰雪地区看不到雨"） */
  private makeSnow(viewW: number, viewH: number, camX: number, camY: number, playerVy: number, world: World) {
    const w = this.weather!;
    const hooks = this.hooks!;
    if (hooks.atmo < 0.4 || hooks.snowTileCount <= 0) return;   // SurfaceAtmospherics 近似（同雨）
    let num = hooks.snowTileCount / 6000;                       // SnowTileMax（SceneMetrics.cs:46）
    num = Math.pow(num, 4 - w.cloudAlpha * 3);
    const target = Math.floor(500 * (viewW / 1920) * (1 + 2 * w.cloudAlpha));
    const attempts = 1 + 50 * w.cloudAlpha;
    let live = 0;
    for (const f of this.snow) if (f.active) live++;
    const st = world.store;
    for (let i = 0; i < attempts; i++) {
      if (!(live < target * 0.5 + target * 0.1)) break;         // gfxQuality=0.5（:12997）
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
      if (st.flags[ii] !== 0 || st.wall[ii] !== 0) continue;    // 非实心且无墙（:13015）
      // 速度/缩放（:13016-13038）：scale = 1+0.4α（两次 +=0.2α）
      const scale = 1 + 0.4 * w.cloudAlpha;
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
      const k = 1 + w.cloudAlpha * 0.5;                         // 末端 velocity ×= 1+0.5α
      const f: SnowFlake = { x: sx, y: sy, vx: vx * k, vy: vy * k, scale, life: 200 + Math.floor(Math.random() * 100), active: true };
      this.snow.push(f);
      live++;
    }
    if (this.snow.length > 1600) {                              // 池帽：超额时滤掉已死片
      this.snow = this.snow.filter((s) => s.active).concat(this.snow.filter((s) => !s.active).slice(0, 800));
    }
  }

  /** Sandstorm.EmitDust（Sandstorm.cs:141-248）近似：风向速度 + 四色加权 + Severity 密度 */
  private emitSandstorm(world: World, viewW: number, camX: number, camY: number) {
    const w = this.weather!;
    const hooks = this.hooks!;
    const sand = w.sandstorm;
    if (!hooks.sandstormVisuals || !sand.happening || hooks.desertSandTiles < 100) return;
    const dir = Math.sign(w.windSpeedCurrent);
    const windAbs = Math.abs(w.windSpeedCurrent);
    if (windAbs < 0.01) return;
    const vxBase = dir * (0.9 + windAbs * 0.1);
    // 密度：20×Severity×(屏宽比例) 上限（num8 L171：1000×屏宽比×质量系数）
    const n = Math.round(20 * sand.severity * (viewW / 1920 + 0.5));
    const colors = hooks.sandColors().filter((c) => c.weight > 0);
    const totalW = colors.reduce((s, c) => s + c.weight, 0);
    if (!colors.length || totalW <= 0) return;
    for (let i = 0; i < n; i++) {
      let x = camX - 500 + Math.random() * (viewW + 1000);
      let y = camY - 50 + Math.random() * (600 + Math.random() * 400);
      if (x < camX || x > camX + viewW) y += Math.random() * 400;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!stIn(world, tx, ty) || world.store.wall[world.store.idx(tx, ty)] !== 0) continue;
      let pick = Math.random() * totalW;
      let color = colors[0].color;
      for (const c of colors) { pick -= c.weight; if (pick <= 0) { color = c.color; break; } }
      hooks.emitSand(x, y,
        vxBase * 5 * (0.5 + sand.severity * 0.3) + dir * (Math.random() * 2),
        2 + Math.random() * 0.2, color);
    }
  }

  /** Rain.Draw（Main.cs:38238-38266）：2×40 条 × type 偏移，光照着色 ×0.85；
   *  + 雪粒（Dust.png dust76 源矩形 760,0，光照着色不 ×0.85——雪花本色白亮） */
  draw(r: Renderer, world: World) {
    const w = this.weather;
    const hooks = this.hooks;
    if (!w || !hooks) return;
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (w.cloudAlpha > 0) {
      const tex = getRainTex();
      const texOk = tex && tex.complete && tex.naturalWidth > 0;
      for (const d of this.pool) {
        if (!d.active) continue;
        const tx = Math.floor((d.x + 4) / TILE);
        const ty = Math.floor((d.y + 4) / TILE);
        const [lr, lg, lb] = hooks.lightAt(tx, ty);
        ctx.save();
        ctx.translate(d.x + 1, d.y);
        ctx.rotate(d.rotation);
        if (texOk) {
          // 光照着色（原版 GetColor×0.85）：量化 8 级 × 3 型预烘焙乘色条（multiply+destination-in），
          // 每滴一次 drawImage——精确到 1/8 亮度量化，替代旧黑罩近似
          const lvl = Math.max(0, Math.min(7, Math.floor(((lr + lg + lb) / (3 * 255)) * 8)));
          const v = Math.round((lvl / 7) * 0.85 * 255);
          const tinted = tintedRainStrip(tex!, d.type, v);
          if (tinted) {
            ctx.drawImage(tinted, 0, 0, 2, 40, 0, -20 * d.scale, 2 * d.scale, 40 * d.scale);
          }
        }
        ctx.restore();
      }
    }
    // ---- 雪粒（晴天雪原也有：w.cloudAlpha 无关，只看池）----
    const dTex = getDustTex();
    if (dTex && dTex.complete && dTex.naturalWidth > 0) {
      for (const f of this.snow) {
        if (!f.active) continue;
        const tx = Math.floor((f.x + 5) / TILE);
        const ty = Math.floor((f.y + 5) / TILE);
        const [lr, lg, lb] = hooks.lightAt(tx, ty);
        const lvl = Math.max(0, Math.min(7, Math.floor(((lr + lg + lb) / (3 * 255)) * 8)));
        const tinted = tintedFlake(dTex, Math.round((lvl / 7) * 255));
        if (tinted) ctx.drawImage(tinted, f.x - 5 * f.scale, f.y - 5 * f.scale, 10 * f.scale, 10 * f.scale);
      }
    }
    ctx.restore();
    void world;
  }
}

/** 乘色雨滴条缓存（type×8 级亮度）：multiply 灰阶 ×0.85 上限 + destination-in 保形 */
const rainTintCache = new Map<string, HTMLCanvasElement>();
function tintedRainStrip(tex: HTMLImageElement, type: number, v: number): HTMLCanvasElement | null {
  const key = `${type}|${v}`;
  const hit = rainTintCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 2; c.height = 40;
  const cx = c.getContext('2d')!;
  cx.drawImage(tex, type * 4, 0, 2, 40, 0, 0, 2, 40);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${v},${v},${v})`;
  cx.fillRect(0, 0, 2, 40);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(tex, type * 4, 0, 2, 40, 0, 0, 2, 40);
  rainTintCache.set(key, c);
  return c;
}

function stIn(world: World, tx: number, ty: number): boolean {
  return world.store.inBounds(tx, ty);
}

/** 雪花乘色缓存（8 级亮度）：Dust.png 源矩形 (760,0,10,10) = dust 76 */
const flakeTintCache = new Map<number, HTMLCanvasElement>();
function tintedFlake(tex: HTMLImageElement, v: number): HTMLCanvasElement | null {
  const hit = flakeTintCache.get(v);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 10; c.height = 10;
  const cx = c.getContext('2d')!;
  cx.drawImage(tex, 760, 0, 10, 10, 0, 0, 10, 10);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${v},${v},${v})`;
  cx.fillRect(0, 0, 10, 10);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(tex, 760, 0, 10, 10, 0, 0, 10, 10);
  flakeTintCache.set(v, c);
  return c;
}
