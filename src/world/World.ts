// 世界门面：TileStore + 元数据 + 实体容器 + 昼夜时钟
import { TileStore } from './TileStore';
import { T, TILE_DEFS } from '../data/tiles';

export interface ChestData { x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean; }

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
  /** 地狱顶（原版 UnderworldLayer = maxTilesY-200；TerrainPass 设定，SceneMetrics/BGM/背景共用） */
  lavaLine = 0;
  clock: Clock;
  chests: ChestData[] = [];
  /** 墓碑碑文（原版 Sign 系统的最小子集）：锚点 = 墓碑 tile 左上格 */
  signs: Array<{ x: number; y: number; text: string }> = [];
  // Boss 进度旗标
  flags: Record<string, boolean> = { downedEyeOfCthulhu: false, downedSkeletron: false, shadowOrbSmashed: false, hardMode: false };
  // 树登记：砍树干时找到整棵树（roots → 范围）
  trees: Array<{ x: number; y: number; h: number }> = [];
  /** 战争迷雾：1 = 已探索。按 tile 粒度。 */
  explored: Uint8Array;
  /** 原版树样式数据（header treeX/treeStyle）：横向 4 区森林树冠样式 */
  treeX: number[] = [];
  treeStyle: number[] = [0, 0, 0, 0];
  /** 世界级生物群系常量(原版 header,生成期 Reset pass 掷出) */
  crimson = false;          // true=猩红 false=腐化
  dungeonX = 0;            // 地牢位置
  /** 地牢入口地表 Y（原版 Main.dungeonY：CheckToSpawnDungeonEnemies 要求玩家在其 +40 格以下才刷地牢怪）。
   *  缺省 0=未知，使用处以 groundLevel 回退 */
  dungeonY = 0;
  jungleX = 0;             // 丛林位置
  /** TreeTops 13 区域变体（v≥211 wld 权威；索引 0-3 森林/5 丛林/6 雪/7 神圣） */
  treeTops: number[] = [];

  exploredVersion = 0;
  /** 最近一次 markExplored 新点亮格的包围盒（tile 坐标；null = 无新探索）。
   *  渲染端雾画布按此做脏矩形增量更新——旧版无条件 bump 版本导致每 15 tick
   *  整幅重建 4200×1200 雾画布（20MB 分配 + 500 万格循环 ≈ 672ms 长任务），
   *  首次导入大世界开地图时主线程持续阻塞 → 白屏闪烁 + 标签页 OOM 崩溃 */
  exploredDirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  markExplored(cx: number, cy: number, radius: number) {
    const st = this.store;
    const x0 = Math.max(0, cx - radius), x1 = Math.min(st.w - 1, cx + radius);
    const y0 = Math.max(0, cy - radius), y1 = Math.min(st.h - 1, cy + radius);
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * st.w + x;
        if (!this.explored[i] && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
          this.explored[i] = 1;
          changed = true;
          // 脏包围盒与新点亮格取并（渲染帧间多次 mark 不丢更新）
          const d = this.exploredDirty;
          if (d) { if (x < d.x0) d.x0 = x; if (x > d.x1) d.x1 = x; if (y < d.y0) d.y0 = y; if (y > d.y1) d.y1 = y; }
          else this.exploredDirty = { x0: x, y0: y, x1: x, y1: y };
        }
      }
    }
    if (changed) this.exploredVersion++;
  }

  constructor(w: number, h: number, seed: number, name = '新世界') {
    this.store = new TileStore(w, h);
    this.explored = new Uint8Array(w * h);
    this.seed = seed;
    this.name = name;
    // 1 游戏日 = 30 现实分钟（24→40 后折中）
    this.clock = new Clock(30 * 60 * 1000);
  }

  /** 从 worker 数据包重建（buffer 已 transfer 移交，零拷贝包装）。
   *  explored 未包含在包内（saveGame 不持久化、新生成/读档均全零）时按全零分配 */
  static fromPacket(p: import('../workers/protocol').WorldPacket): World {
    const w = new World(p.w, p.h, p.seed, p.name);
    w.store = new TileStore(p.w, p.h, p.buf);
    w.explored = p.buf.explored ? new Uint8Array(p.buf.explored) : new Uint8Array(p.w * p.h);
    w.spawnX = p.spawnX; w.spawnY = p.spawnY;
    w.groundLevel = p.groundLevel; w.rockLevel = p.rockLevel; w.lavaLine = p.lavaLine;
    w.crimson = p.crimson; w.dungeonX = p.dungeonX; w.dungeonY = p.dungeonY; w.jungleX = p.jungleX;
    w.exploredVersion = p.exploredVersion;
    w.clock.timeOfDay = p.clock.timeOfDay;
    w.clock.dayCount = p.clock.dayCount;
    w.chests = p.chests;
    w.signs = p.signs;
    w.trees = p.trees;
    w.flags = p.flags;
    w.treeX = p.treeX; w.treeStyle = p.treeStyle; w.treeTops = p.treeTops;
    return w;
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
    // v_ 图块无显式 drop → 回退同名放置物品(阶段5 自动注册)
    return d.drop ?? (d.key.startsWith('v_') ? 'place_' + d.key : null);
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
