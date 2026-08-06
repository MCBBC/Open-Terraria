// 世界门面：TileStore + 元数据 + 实体容器 + 昼夜时钟
import { TileStore } from './TileStore';
import { T, TILE_DEFS } from '../data/tiles';

export interface ChestData { x: number; y: number; items: Array<{ id: number; stack: number } | null>; }

export class Clock {
  timeOfDay: number = 0.3;   // 0-1，0=午夜 0.5=正午（起始上午 7:12 ≈ 0.3）
  dayCount: number = 1;
  readonly dayLengthMs: number;
  constructor(dayLengthMs: number) { this.dayLengthMs = dayLengthMs; }
  tick(dtMs: number) {
    this.timeOfDay += dtMs / this.dayLengthMs;
    while (this.timeOfDay >= 1) { this.timeOfDay -= 1; this.dayCount++; }
  }
  get isDay(): boolean { return this.timeOfDay > 0.25 && this.timeOfDay < 0.75; }
  get dayFactor(): number {
    // 昼夜平滑系数：白天 1，夜晚 0.32（月光下地表仍可见，火把不再像贴在黑幕上），晨昏过渡
    const t = this.timeOfDay;
    if (t > 0.28 && t < 0.72) return 1;
    if (t >= 0.72 && t < 0.80) return 1 - (t - 0.72) / 0.08 * 0.68;
    if (t >= 0.80 || t < 0.20) return 0.32;
    return 0.32 + (t - 0.20) / 0.08 * 0.68;
  }
  get hourFloat(): number { return this.timeOfDay * 24; }
}

export class World {
  store: TileStore;
  name: string;
  seed: number;
  spawnX = 0; spawnY = 0;
  groundLevel = 0; rockLevel = 0;   // tile 坐标
  clock: Clock;
  chests: ChestData[] = [];
  // Boss 进度旗标
  flags: Record<string, boolean> = { downedEyeOfCthulhu: false };
  // 树登记：砍树干时找到整棵树（roots → 范围）
  trees: Array<{ x: number; y: number; h: number }> = [];
  /** 战争迷雾：1 = 已探索。按 tile 粒度。 */
  explored: Uint8Array;

  exploredVersion = 0;
  markExplored(cx: number, cy: number, radius: number) {
    this.exploredVersion++;
    const st = this.store;
    const x0 = Math.max(0, cx - radius), x1 = Math.min(st.w - 1, cx + radius);
    const y0 = Math.max(0, cy - radius), y1 = Math.min(st.h - 1, cy + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
          this.explored[y * st.w + x] = 1;
        }
      }
    }
  }

  constructor(w: number, h: number, seed: number, name = '新世界') {
    this.store = new TileStore(w, h);
    this.explored = new Uint8Array(w * h);
    this.seed = seed;
    this.name = name;
    // 1 游戏日 = 30 现实分钟（24→40 后折中）
    this.clock = new Clock(30 * 60 * 1000);
  }

  get w() { return this.store.w; }
  get h() { return this.store.h; }
  get tiles() { return this.store; }

  /** 破坏一个 tile（含 framed 物体的锚点处理由调用方负责），返回掉落 item key */
  breakTileAt(x: number, y: number): string | null {
    const t = this.store.get(x, y);
    if (t === 0) return null;
    const d = TILE_DEFS[t];
    this.store.setTile(x, y, 0);
    return d.drop ?? null;
  }

  isSolidPx(px: number, py: number): boolean {
    return this.store.isSolid(Math.floor(px / 16), Math.floor(py / 16));
  }

  /** 液体量（0-255）按像素坐标 */
  liquidAt(px: number, py: number): number {
    return this.store.liquid[this.store.idx(Math.floor(px / 16), Math.floor(py / 16))];
  }

  registerTree(x: number, y: number, h: number) {
    this.trees.push({ x, y, h });
  }
}

export { T };
