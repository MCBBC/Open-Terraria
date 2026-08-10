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

export interface WeatherFxHooks {
  /** 光照采样（0-255 RGB；雨滴着色 ×0.85） */
  lightAt(tx: number, ty: number): [number, number, number];
  /** 地表开阔度 0-1（原版 atmo——地下无雨） */
  atmo: number;
  /** 雪区雪格比例 0-1（削减雨量；SceneMetrics SnowTileCount/Threshold 的平方） */
  snowRatio: number;
  /** Boss 危险中（雨量 ×0.05 保底 1，Rain.cs:32-40） */
  bossDanger: boolean;
  /** 沙尘发射（粒子上限由 Game.particles 自身的 600 帽控制） */
  emitSand(x: number, y: number, vx: number, vy: number, color: string): void;
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

export class WeatherRenderer {
  private pool: RainDrop[] = [];
  private poolCap = 0;
  private weather: WeatherState | null = null;
  hooks: WeatherFxHooks | null = null;

  /** Game 每帧注入（weather 状态 + hooks） */
  attach(weather: WeatherState, hooks: WeatherFxHooks) {
    this.weather = weather;
    this.hooks = hooks;
  }
  detach() { this.weather = null; this.hooks = null; this.pool.length = 0; }

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

  /** 每帧：雨滴更新 + 沙尘发射（在绘制前的逻辑阶段调用，或 draw 内合并——原版即 draw 时 update） */
  update(world: World, viewW: number, camX: number, camY: number, playerVx: number, playerVy: number) {
    if (!this.weather) return;
    this.ensurePool(Math.min(2400, Math.max(600, Math.floor(viewW * 1.2))));
    const hooks = this.hooks;
    if (!hooks) return;
    this.makeRain(viewW, camX, camY, playerVx, playerVy, world);
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
        // 落水花（Rain.cs:120-133 概率近似）
        if (Math.random() < 0.5 && hooks.atmo > 0.5) {
          hooks.emitSand(d.x, d.y, -d.vx * 0.025, -d.vy * 0.025 - 2, '#B8D0E8');
        }
      }
    }
    this.emitSandstorm(world, viewW, camX, camY);
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

  /** Rain.Draw（Main.cs:38238-38266）：2×40 条 × type 偏移，光照着色 ×0.85 */
  draw(r: Renderer, world: World) {
    const w = this.weather;
    const hooks = this.hooks;
    if (!w || !hooks || w.cloudAlpha <= 0) return;
    const ctx = r.ctx;
    const tex = getRainTex();
    const texOk = tex && tex.complete && tex.naturalWidth > 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const d of this.pool) {
      if (!d.active) continue;
      const tx = Math.floor((d.x + 4) / TILE);
      const ty = Math.floor((d.y + 4) / TILE);
      const [lr, lg, lb] = hooks.lightAt(tx, ty);
      const k = 0.85;
      ctx.save();
      ctx.translate(d.x + 1, d.y);
      ctx.rotate(d.rotation);
      if (texOk) {
        ctx.globalAlpha = 1;
        ctx.drawImage(tex, d.type * 4, 0, 2, 40, 0, -20 * d.scale, 2 * d.scale, 40 * d.scale);
        ctx.globalCompositeOperation = 'source-atop';
      }
      // 光照着色（原版 GetColor×0.85）：无 per-drop 蒙版能力——用叠加半透明暗/亮矩形近似
      const shade = Math.min(1, (lr + lg + lb) / (3 * 255)) * k;
      ctx.globalAlpha = 1 - shade;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, -20 * d.scale, 2 * d.scale, 40 * d.scale);
      ctx.restore();
    }
    ctx.restore();
    void world;
  }
}

function stIn(world: World, tx: number, ty: number): boolean {
  return world.store.inBounds(tx, ty);
}
