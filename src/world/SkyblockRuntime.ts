import { TILE_INTERNAL_BY_SHEET } from '../data/tiles';

// SkyblockRuntime.ts — WorldGen.Skyblock 运行时域 1:1（1457）。
// "skyblock" 种子的运行时面除 Player.cs:24292 出界致死（Player 内已有）外，核心是一组
// 【动态世界普查旗】：Terraria/WorldGen.cs:3045-3240 class Skyblock。
//
// 原版更新节律（WorldGen.UpdateWorld :72065-72072）：
//   每 30 tick 扫一整列 CountTiles(totalX)（列指针 totalX 走完 maxTilesX 后回卷）；
//   该函数把各格记入 Skyblock.hasTile/hasWall/currentActiveTiles（:71740-71747），
//   当列 X==maxTilesX-1 时调 Calculate()（:3146-3199）：ratio = currentActiveTiles /
//   (maxTilesX*maxTilesY)，lowTiles = ratio<0.1 && Main.skyblockWorld；随后清零计数与
//   hasTile/hasWall 进入下一轮。即【全图巡检一次 = maxTilesX×30 tick】。
//
// 由 hasTile/hasWall 派生（Calculate 首段）：
//   noAltars(26 全无) / noDungeon(tileDungeon∪wallDungeon) / noTemple(226|wall87) /
//   noHellstone(58) / noFossils(404) / noLifeCrystals(12) / noHellforge(77|133)。
//   （noDungeon/noHellforge 当前无 SW 运行时消费，一并维护以求完备。）
//
// ★首次进入世界：原版 totalX 跨会话延续、首态并不即时。SW 在 afterWorldLoad 对
// skyblock 域做一次【暖扫描】（等价总巡检瞬间跑满一轮，取真首态）；非 skyblock 世界
// 不做暖扫描——w×30t 内自然收敛，与原版"进图后逐步累计"同构。

export interface SkyblockFlags {
  /** 空岛档判定：活跃格占比 <0.1 且 skyblockWorld（Calculate :3181-3184） */
  lowTiles: boolean;
  noAltars: boolean;
  noDungeon: boolean;
  noTemple: boolean;
  noHellstone: boolean;
  noFossils: boolean;
  noLifeCrystals: boolean;
  noHellforge: boolean;
}

/** 原版 sheet → SW 内部 tile id 表（本仓 tile id ≠ 原版 TileID，VANILLA_TILE_ID 家族） */
const SHEET_TO_TILE = TILE_INTERNAL_BY_SHEET;

/** vanilla 锚 sheet 组：26 祭坛 / 226 神庙砖 / 58 狱石 / 404 化石 / 12 水晶 / 77+133 熔炉 */
const ANCHORS = {
  altar: [26],
  temple: [226],
  hellstone: [58],
  fossils: [404],
  lifeCrystal: [12],
  hellforge: [77, 133],
  /** Main.tileDungeon 表（Main.cs:8131-8136 + FinalCleanupPass DUNGEON_BRICKS_FGG 同源） */
  dungeonTile: [41, 43, 44, 677, 678, 679],
} as const;

function tileSet(sheets: readonly number[]): Set<number> {
  const s = new Set<number>();
  for (const sh of sheets) {
    const t = SHEET_TO_TILE.get(sh);
    if (t !== undefined && t >= 0) s.add(t);
  }
  return s;
}

export interface SkyblockStoreLike {
  w: number; h: number;
  flags: Uint8Array; type: Uint16Array; wall: Uint16Array;
  idx(x: number, y: number): number;
}

export class SkyblockRuntime {
  readonly flags: SkyblockFlags = {
    lowTiles: false, noAltars: false, noDungeon: false, noTemple: false,
    noHellstone: false, noFossils: false, noLifeCrystals: false, noHellforge: false,
  };

  /** lowTiles 翻转回调（原版此处 SendMessage(7) 同步 :3196-3198；单机重放无感） */
  onLowTilesFlip: (() => void) | null = null;

  private activeTiles = 0;          // Skyblock.currentActiveTiles（本轮累计）
  private columnX = 0;              // WorldGen.totalX 列指针
  private seenTiles = new Set<number>();   // Skyblock.hasTile（SW 内部 id 域）
  private seenWalls = new Set<number>();   // Skyblock.hasWall（原版 wall id 域）
  private anchorSets: Record<string, Set<number>>;

  constructor(
    private storeLike: SkyblockStoreLike,
    private skyblockWorld: () => boolean,
    private dungeonWallIds: Iterable<number> = [7, 8, 9, 94, 95, 96, 97, 98, 99],
  ) {
    this.anchorSets = {
      altar: tileSet(ANCHORS.altar),
      temple: tileSet(ANCHORS.temple),
      hellstone: tileSet(ANCHORS.hellstone),
      fossils: tileSet(ANCHORS.fossils),
      lifeCrystal: tileSet(ANCHORS.lifeCrystal),
      hellforge: tileSet(ANCHORS.hellforge),
    };
  }

  /**
   * CountTiles(X) 的 Skyblock 记账段（WorldGen.cs:71733-71748）。行域 [40,h-40)
   * 与原版 num5=maxTilesY-40 一致（infection 加权段与本域无关省略）。
   */
  private scanColumn(x: number): void {
    const st = this.storeLike;
    for (let y = 40; y < st.h - 40; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] === 0) continue;                      // !tile.active()
      this.activeTiles++;
      this.seenTiles.add(st.type[i]);
      if (st.wall[i] > 0) this.seenWalls.add(st.wall[i]);
    }
  }

  /** Skyblock.Calculate :3146-3199 —— 尾列触发：重算八旗并清零进入下一轮 */
  private calculate(): void {
    const st = this.storeLike;
    const area = st.w * st.h;                               // :3179 分母含边缘格
    const ratio = area > 0 ? this.activeTiles / area : 0;
    const prevLow = this.flags.lowTiles;
    this.flags.lowTiles = ratio < 0.1 && this.skyblockWorld();

    // hasTile/hasWall 派生段（:3150-3177）
    let hasAltar = false, hasTemple = false, hasHellstone = false,
      hasFossils = false, hasLifeCrystal = false, hasHellforge = false, hasDungeonTile = false;
    for (const t of this.seenTiles) {
      if (this.anchorSets.altar.has(t)) hasAltar = true;
      else if (this.anchorSets.temple.has(t)) hasTemple = true;
      else if (this.anchorSets.hellstone.has(t)) hasHellstone = true;
      else if (this.anchorSets.fossils.has(t)) hasFossils = true;
      else if (this.anchorSets.lifeCrystal.has(t)) hasLifeCrystal = true;
      else if (this.anchorSets.hellforge.has(t)) hasHellforge = true;
      else if (this.anchorSets.dungeonTile.has(t)) hasDungeonTile = true;
    }
    let dungeonWall = false;
    for (const dw of this.dungeonWallIds) {
      if (this.seenWalls.has(dw)) { dungeonWall = true; break; }
    }
    this.flags.noAltars = !hasAltar;
    this.flags.noTemple = !hasTemple && !this.seenWalls.has(87);
    this.flags.noHellstone = !hasHellstone;
    this.flags.noFossils = !hasFossils;
    this.flags.noLifeCrystals = !hasLifeCrystal;
    this.flags.noHellforge = !hasHellforge;
    this.flags.noDungeon = !hasDungeonTile && !dungeonWall;

    // 清零进入下一轮（:3188-3196）
    this.activeTiles = 0;
    this.seenTiles.clear();
    this.seenWalls.clear();

    if (prevLow !== this.flags.lowTiles) this.onLowTilesFlip?.();
  }

  /** UpdateWorld :72065-72072 等价步：每次调用推进一列；尾列触发 Calculate 并回卷 */
  stepColumn(): void {
    const st = this.storeLike;
    this.scanColumn(this.columnX);
    if (this.columnX >= st.w - 1) {
      this.calculate();
      this.columnX = 0;
    } else {
      this.columnX++;
    }
  }

  /** 进图暖门：立刻扫满一轮取首态（仅 skyblock 域调用——见文件头注） */
  warmFullScan(): void {
    const st = this.storeLike;
    this.activeTiles = 0;
    this.seenTiles.clear();
    this.seenWalls.clear();
    for (let x = 0; x < st.w; x++) this.scanColumn(x);
    this.calculate();          // 回卷状态由 calculate 清零完成
  }

  /** 测试注入口 */
  debugState(): { col: number; active: number; low: boolean } & { flags: SkyblockFlags } {
    return {
      col: this.columnX, active: this.activeTiles, low: this.flags.lowTiles,
      flags: { ...this.flags },
    };
  }
}
