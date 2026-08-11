// 原版世界运行时演化系统 1:1 移植（Terarria1456）：
//   WorldGen.UpdateWorld（WorldGen.cs:71507）每 tick 随机采样驱动：
//     地表 = w×h×3e-5（雨天 ×1.5）样本走 UpdateWorld_OvergroundTile（:72066）
//     地下 = w×h×1.5e-5 样本走 UpdateWorld_UndergroundTile（:73266）
//     每地表样本 1/(num7×100) 概率 PlantAlch 药草自播种（:45910，num7=151..422.8 随世界宽）
//   UpdateWorld_GrassGrowth（:74333）：草/丛林草/蘑菇草/灰烬草/邪恶草蔓延 + 顶部植物
//   hardUpdateWorld（:69661，困难模式）：邪恶/神圣草蔓延 + 水晶碎块(129) + 叶绿(211) + 邪恶矿退化
//   藤蔓各族生长（GrowMoreVines 密度门 :45592）+ 仙人掌（:56584）+ 染料植物（:71298）
//   苔藓蔓延（MossConversion :71469）+ 藓堆(184) + 钟乳石再生（PlaceTight :38329）
//   蛛网再生（GrowWeb :74141）+ 贝壳/珊瑚沉积 + 药草三态（GrowAlch :45786）
//   墙蔓延（SpreadGrassWalls :74958 / SpreadDesertWalls :75073）→ Convert 墙半区（:55113）
//   SpreadGrass 运行时版（:75210）：普通草仅地表（j<worldSurface 且 dirt==0）、邪恶草不受限、
//   3×3 封死不转、邻岩浆不转、上方向日葵(27)挡邪恶草、草→草走 Convert tiles-only
// 近似项（原版依赖系统缺失，注释标明）：
//   - Collision.CanHitLine（GrowMoreVines 的加权计数）→ 仅计数不判视线
//   - PlayerLOS（球茎/蜂巢/蚁狮幼虫隐藏性）→ 玩家距离 >50 格视为不可见
//   - 装饰变体帧（PlaceTile 后 TileFrame 随机化）→ 直接随机变体帧
//   - 净化粉/环境转换器 Convert 其余 case（5/6/7/10 净化）不在演化路径，未移植
import type { TileStore } from '../TileStore';
import { TILE_DEFS } from '../../data/tiles';
import { NOT_CLEARABLE } from '../gen/vanilla/TileRunner';

/** sheet id → 内部 tile id（首匹配；TILE_DEFS 顺序固定，模块加载时一次构建） */
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

// ---- 原版集合表（TileID.cs / WallID.cs / Main.cs 实证）----
// TileID.Sets.SpreadOverground（TileID.cs:413）
const SPREAD_OVERGROUND = new Set([2, 23, 661, 32, 60, 70, 109, 199, 662, 352, 477, 492, 633, 226]);
// TileID.Sets.SpreadUnderground（:415）
const SPREAD_UNDERGROUND = new Set([23, 661, 109, 199, 662, 60, 70, 633, 226]);
// TileID.Sets.IsVine（:237）
const IS_VINE = new Set([52, 382, 62, 115, 205, 528, 636, 638]);
// TileID.Sets.CanGrowCrystalShards（:341）
const CAN_GROW_SHARDS = new Set([117, 116, 164, 402, 403]);
// TileID.Sets.Spreads{Corruption,Crimson,Hallow}（:331/:349/:339）
const SPREADS_CORRUPTION = new Set([23, 661, 25, 112, 398, 400, 163, 32, 636, 24]);
const SPREADS_CRIMSON = new Set([199, 662, 203, 234, 399, 401, 200, 352, 205, 201]);
const SPREADS_HALLOW = new Set([109, 492, 117, 116, 402, 403, 164, 115, 110, 113]);
// Main.tileAlch（Main.cs:7755）
const TILE_ALCH = new Set([82, 83, 84]);
// Main.tileMoss（= TileID.Sets.Conversion.Moss，TileID.cs:38）
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
const TILE_MOSS_BRICK = new Set([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
// TileID.Sets.Conversion.*（TileID.cs:14-36）
const CONV_JUNGLE_GRASS = new Set([60, 661, 662]);
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
const CONV_GOLF_GRASS = new Set([477, 492]);
const CONV_STONE = new Set([1, 25, 117, 203]);
const CONV_ICE = new Set([161, 163, 164, 200]);
const CONV_SAND = new Set([53, 112, 116, 234]);
const CONV_HARD_SAND = new Set([397, 398, 402, 399]);
const CONV_SANDSTONE = new Set([396, 400, 403, 401]);
const CONV_THORN = new Set([32, 352, 69, 655]);
const CONV_SNOW = new Set([147]);
// WallID.Sets.Conversion.*（WallID.cs:11-33）
const WALL_CONV_GRASS = new Set([63, 64, 65, 66, 67, 68, 69, 70, 81, 264, 265, 268]);
const WALL_CONV_STONE = new Set([1, 61, 185, 3, 28, 83, 262, 274, 246, 248, 269, 349]);
const WALL_CONV_HARD_SAND = new Set([216, 217, 219, 218, 304, 305, 307, 306]);
const WALL_CONV_SANDSTONE = new Set([187, 220, 222, 221, 275, 308, 310, 309]);
const WALL_CONV_PURE_SAND = new Set([216, 187, 304, 275]);
const WALL_CONV_NEW1 = new Set([188, 192, 200, 204, 212, 276, 280, 288, 292, 300]);
const WALL_CONV_NEW2 = new Set([189, 193, 201, 205, 213, 277, 281, 289, 293, 301]);
const WALL_CONV_NEW3 = new Set([190, 194, 202, 206, 214, 278, 282, 290, 294, 302]);
const WALL_CONV_NEW4 = new Set([191, 195, 203, 207, 215, 279, 283, 291, 295, 303]);
// WallID.Sets.Spreads*（WallID.cs:48-52）
const WALL_SPREADS_CORRUPTION = new Set([69, 217, 220, 3]);
const WALL_SPREADS_CRIMSON = new Set([83, 81, 218, 221]);
const WALL_SPREADS_HALLOW = new Set([70, 219, 222, 28]);
// 雪族（UndergroundTile/OvergroundTile 的钟乳石再生分支）
const SNOW_FAMILY = new Set([147, 161, 163, 164, 200]);
// 上面所有 sheet 集合 → 内部 id 集合（运行时比较用）
const sheetOf = (id: number): number => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

export interface EvolutionHost {
  store: TileStore;
  worldSurface: number;
  rockLevel: number;
  flags: Record<string, boolean>;
  crimson: boolean;
  isDay: boolean;
  raining: boolean;
  maxRaining: number;
  windSpeedCurrent: number;
  /** 玩家 tile 坐标（LOS 近似用；null = 无玩家） */
  playerTile: () => { x: number; y: number } | null;
}

export class WorldEvolution {
  private hardMode = false;
  private allowedToSpread = true;

  constructor(private host: EvolutionHost) {}

  /** 每 tick 调用（Game.fixedUpdate）。原版 UpdateWorld 采样骨架（cs:71507-71639） */
  update(): void {
    const st = this.host.store;
    const { w, h } = st;
    this.hardMode = !!this.host.flags.hardMode;
    this.allowedToSpread = true; // CreativePowers.StopBiomeSpread 无对应系统
    const rate = 1; // desiredWorldTilesUpdateRate = dayRate = 1（Main.cs:6290；睡觉 ×5 未接）
    const wallDist = 3;
    // 地表采样（雨天 ×1.5，cs:71552-71557）
    let surfaceN = w * h * 3e-5 * rate;
    if (this.host.raining) surfaceN *= 1.5;
    const num7 = 151 + (151 * 2.8 - 151) * Math.min(1, Math.max(0, w / 4200 - 1));
    for (let n = 0; n < surfaceN; n++) {
      if (Math.random() * (num7 * 100) < 1) this.plantAlch();
      const i = 10 + Math.floor(Math.random() * (w - 20));
      const j = 10 + Math.floor(Math.random() * (Math.floor(this.host.worldSurface) - 1 - 10));
      if (j < 10) continue;
      this.overgroundTile(i, j, wallDist);
    }
    // 地下采样（cs:71624-71633）
    const underN = w * h * 1.5e-5 * rate;
    for (let n = 0; n < underN; n++) {
      const i = 10 + Math.floor(Math.random() * (w - 20));
      const j = Math.floor(this.host.worldSurface) - 1 + Math.floor(Math.random() * (h - 20 - (Math.floor(this.host.worldSurface) - 1)));
      if (j < 10 || j >= h - 20) continue;
      this.undergroundTile(i, j, wallDist);
    }
  }

  // ================= 通用读写助手 =================

  private at(x: number, y: number) { return this.host.store.idx(x, y); }
  private active(x: number, y: number): boolean {
    const st = this.host.store;
    return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
  }
  private typeAt(x: number, y: number): number {
    const st = this.host.store;
    return st.inBounds(x, y) ? st.type[st.idx(x, y)] : -1;
  }
  private isLava(x: number, y: number): boolean {
    const st = this.host.store;
    return st.inBounds(x, y) && st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2;
  }
  private liquidAt(x: number, y: number): number {
    const st = this.host.store;
    return st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0;
  }
  private setType(x: number, y: number, type: number): void {
    const st = this.host.store;
    if (st.inBounds(x, y)) st.setTile(x, y, type);
  }
  private kill(x: number, y: number): void { this.setType(x, y, 0); }
  /** WorldGen.SolidTile：active && tileSolid && !solidTop && !half && slope==0 */
  private solidTile(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
  }
  /** PlayerLOS 近似：50 格内有玩家视为可见（原版逐玩家 Collision.CanHitLine 扫描） */
  private playerLOS(x: number, y: number): boolean {
    const p = this.host.playerTile();
    if (!p) return false;
    return Math.abs(p.x - x) < 50 && Math.abs(p.y - y) < 40;
  }
  private mechAny(): boolean {
    const f = this.host.flags;
    return !!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']);
  }
  private mechAll(): boolean {
    const f = this.host.flags;
    // 原版 downedMechBoss1/2/3 = 毁灭者(134)/双子(125)/机械骷髅王(127)
    return !!(f['downed_134'] && f['downed_125'] && f['downed_127']);
  }

  /** 放置 1×1 装饰（帧 style×18,0；目标须为空——PlaceTile EmptyTile 门） */
  private place1(x: number, y: number, sheet: number, style = 0, variants = 1): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || this.active(x, y)) return false;
    const t = S(sheet);
    if (!t) return false;
    st.setTile(x, y, t, (style + (variants > 1 ? Math.floor(Math.random() * variants) : 0)) * 18, 0);
    return true;
  }
  /** 放置 w×h 整件（帧 dx*18, dy*18；区域全空才放） */
  private placeBlock(x: number, y: number, sheet: number, w: number, h: number): boolean {
    const st = this.host.store;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, y + dy) || this.active(x + dx, y + dy)) return false;
    }
    const t = S(sheet);
    if (!t) return false;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      st.setTile(x + dx, y + dy, t, dx * 18, dy * 18);
    }
    return true;
  }

  // ================= 采样子分发（OvergroundTile cs:72066） =================

  private overgroundTile(i: number, j: number, wallDist: number): void {
    const st = this.host.store;
    const minI = Math.max(10, i - 1), maxI = Math.min(st.w - 10, i + 2);
    const minJ = Math.max(10, j - 1), maxJ = Math.min(st.h - 10, j + 2);
    if (!st.inBounds(i, j)) return;
    const t = this.typeAt(i, j);
    const act = this.active(i, j);
    // tileAlch 族 → GrowAlch（三态生长/开花/淹死）
    if (act && TILE_ALCH.has(sheetOf(t))) { this.growAlch(i, j); return; }
    // 海洋沙滩贝壳/珊瑚沉积（cs:72093-72130）：沙滩区上空采样
    if (!act && j < this.host.worldSurface + 10) {
      // 海岸带判定（oceanDepths 简化：两侧 7% 带）
      const beach = 380;
      if (i < beach || i > st.w - beach) {
        let num5 = 3000 - Math.floor(Math.abs(this.host.windSpeedCurrent) * 1250);
        if (this.host.raining) num5 -= Math.floor(1250 * this.host.maxRaining);
        if (num5 < 300) num5 = 300;
        if (Math.random() * num5 < 1) {
          let k = j;
          while (k < this.host.worldSurface + 10 && !this.active(i, k) && k - j < 15) k++;
          if (this.active(i, k) && sheetOf(this.typeAt(i, k)) === 53) {
            k--;
            if (this.typeAt(i, k) === S(324)) return;
            const need = 2 + Math.floor(Math.random() * 3);
            let cnt = 0;
            for (let l = i - 10; l <= i + 10; l++) for (let m = k - 10; m <= k + 10; m++) {
              const s = sheetOf(this.typeAt(l, m));
              if (this.active(l, m) && (s === 324 || s === 81)) cnt++;
            }
            if (cnt < need) {
              if (Math.random() < 0.5 && this.liquidAt(i, k) >= 230) this.place1(i, k, 81, 0, 5);
              else this.place1(i, k, 324, 0, 8);
            }
          }
        }
      }
    }
    if (!act) {
      // 蛛网再生（cs:72534-72536：墙 62 + 无液体 → GrowWeb）
      if (st.wall[this.at(i, j)] === 62 && this.liquidAt(i, j) === 0) this.growWeb(i, j);
      return; // TrySpawningTownNPC 走独立刷怪系统
    }
    // hardUpdateWorld（困难模式邪恶/神圣/水晶/叶绿）+ 染料植物
    this.hardUpdateWorld(i, j);
    if (Math.random() < 1 / 3000) this.plantDye(i, j, false);
    else if (this.hardMode && (i < st.w * 0.4 || i > st.w * 0.6) && Math.random() < 1 / 15000) this.plantDye(i, j, true);

    const sheet = sheetOf(t);
    if (sheet === 80) { // 仙人掌
      if (Math.random() < 1 / 15) this.growCactus(i, j);
    } else if (CONV_SAND.has(sheet)) {
      // 沙族（cs:72275-72309）：海洋贝壳补充 / 内陆仙人掌（绿洲/海藻系统未接）
      if (!this.active(i, minJ)) {
        const oceanBand = i < 200 || i > st.w - 200;
        if (oceanBand) {
          if (Math.random() < 1 / 500) {
            let cnt = 0;
            for (let n = i - 7; n <= i + 7; n++) for (let m = minJ - 7; m <= minJ + 7; m++) {
              if (this.active(n, m) && sheetOf(this.typeAt(n, m)) === 81) cnt++;
            }
            if (cnt < 6 && this.liquidAt(i, minJ) === 255 && this.liquidAt(i, minJ - 1) === 255
              && this.liquidAt(i, minJ - 2) === 255 && this.liquidAt(i, minJ - 3) === 255
              && this.liquidAt(i, minJ - 4) === 255) {
              this.place1(i, minJ, 81, 0, 5);
            }
          }
        } else if (i > 380 + 20 && i < st.w - 380 - 20 && Math.random() < 1 / 300) {
          this.growCactus(i, j);
        }
      }
    } else if (SNOW_FAMILY.has(sheet)) {
      // 雪原/冰：1/10 悬挂钟乳石（cs:72310-72351 PlaceTight）
      if (Math.random() < 1 / 10 && !this.active(i, j + 1) && !this.active(i, j + 2)) {
        let cnt = 0;
        for (let x = i - 3; x < i + 4; x++) for (let y = j; y <= j + 3; y++) {
          if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 165) cnt++;
        }
        if (cnt < 2) this.placeTight(i, j + 1);
      }
    } else if (SPREAD_OVERGROUND.has(sheet)) {
      this.grassGrowth(i, j, minI, maxI, minJ, maxJ, false);
      if ((sheet === 32 || sheet === 352) && Math.random() < 1 / 3) {
        this.growSpike(i, j, sheet, sheet === 32 ? 23 : 199);
      }
    } else if (TILE_MOSS.has(sheet) || TILE_MOSS_BRICK.has(sheet)) {
      this.mossUpdate(i, j, minI, maxI, minJ, maxJ);
    } else if (sheet === 3 && Math.random() < 1 / 20) {
      // 杂草 → 花（cs:72465-72476；帧 144=蘑菇位除外）
      const fx = st.frameX[this.at(i, j)];
      if (fx !== 144) this.setType(i, j, S(73));
    } else if (sheet === 110 && Math.random() < 1 / 20) {
      // 神圣杂草 → 花
      const fx = st.frameX[this.at(i, j)];
      if (fx < 144) this.setType(i, j, S(113));
    }
    // 水淹分支（cs:72202-72230）：丛林草/神庙砖浸水 → GrassGrowth；空水格 1/600 睡莲/香蒲（未接）
    const liq = this.liquidAt(i, j);
    if (liq > 32 && (sheet === 60 || sheet === 226)) this.grassGrowth(i, j, minI, maxI, minJ, maxJ, false);
    // 墙蔓延（邪恶草墙/硬化沙墙）
    if (this.allowedToSpread) {
      this.spreadGrassWalls(wallDist, i, j);
      this.spreadDesertWalls(wallDist, i, j);
    }
    // ---- 藤蔓各族（cs:72534-72852）----
    if (!this.active(i, j)) return;
    const t2 = this.typeAt(i, j);
    const s2 = sheetOf(t2);
    // 61 丛林矮草 1/3 → 74 高草（神庙砖上方不长，cs:72591）
    if (s2 === 61 && Math.random() < 1 / 3 && sheetOf(this.typeAt(i, j + 1)) !== 226
      && st.frameX[this.at(i, j)] < 144) {
      if (Math.random() < 1 / 4) st.setTile(i, j, t2, 162 + Math.floor(Math.random() * 8) * 18, st.frameY[this.at(i, j)]);
      this.setType(i, j, S(74));
      return;
    }
    // 普通藤（cs:72537-72589）：草 2/藤 52/花藤 382（墙 68/65/66/63 → 花藤）。
    // 原版 num24 归一为 1（cs:72551-72554）——挂靠草存在即长
    if (s2 === 2 || s2 === 52 || s2 === 382 || (s2 === 192 && Math.random() < 1 / 10)) {
      if (this.growMoreVines(i, j) && !this.active(i, j + 1) && !this.isLava(i, j + 1)) {
        let vine = 52;
        if (s2 !== 52) {
          const wl = st.wall[this.at(i, j)], wl2 = st.wall[this.at(i, j + 1)];
          if (s2 === 382 || wl === 68 || wl === 65 || wl === 66 || wl === 63 || wl2 === 68 || wl2 === 65 || wl2 === 66 || wl2 === 63) vine = 382;
        }
        if (this.hasSupport(i, j, 2)) {
          this.setType(i, j + 1, S(vine));
        }
      }
      return;
    }
    this.vineFamily(i, j, s2);
  }

  /** 各色藤蔓家族通用段（cs:72614-72852 Underground/Overground 同构）：
   *  grassSheet=蔓挂靠的草族, vineSheet=要长的藤, vineCap=1/N 概率, vineTopSheet=可续接的顶 */
  private vineFamily(i: number, j: number, s2: number): void {
    let maxV = 0, anchorSheets: number[] = [], vineSheet = -1;
    switch (s2) {
      // 丛林藤（60 草/62 藤/384 叶/226 神庙砖）：30；62=10；226=20 且密度门（cs:72602-72649）
      case 60: case 384: maxV = 30; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      case 62: maxV = 10; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      case 226:
        if (this.tooManyJungleVines(i, j)) return;
        maxV = 20; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      // 蘑菇藤（70/528）：70 / 7（cs:72652-72684）
      case 70: maxV = 70; anchorSheets = [70]; vineSheet = 528; break;
      case 528: maxV = 7; anchorSheets = [70]; vineSheet = 528; break;
      // 神圣藤（109/115）：60 / 20（cs:72687-72720）
      case 109: maxV = 60; anchorSheets = [109]; vineSheet = 115; break;
      case 115: maxV = 20; anchorSheets = [109]; vineSheet = 115; break;
      // 腐化藤（23/661/636）：60 / 20（cs:72723-72756）
      case 23: case 661: maxV = 60; anchorSheets = [23, 661]; vineSheet = 636; break;
      case 636: maxV = 20; anchorSheets = [23, 661]; vineSheet = 636; break;
      // 猩红藤（199/662/205）：60 / 20（cs:72759-72792）
      case 199: case 662: maxV = 60; anchorSheets = [199, 662]; vineSheet = 205; break;
      case 205: maxV = 20; anchorSheets = [199, 662]; vineSheet = 205; break;
      // 灰烬藤（633/638）：70 / 7（cs:72795-72831）
      case 633: maxV = 70; anchorSheets = [633]; vineSheet = 638; break;
      case 638: maxV = 7; anchorSheets = [633]; vineSheet = 638; break;
      default: return;
    }
    if (!this.growMoreVines(i, j)) return;
    if (Math.random() >= 1 / maxV) return;
    if (this.active(i, j + 1) || this.isLava(i, j + 1)) return;
    // 向上 10 格内找挂靠草（bottomSlope 中断；近似：仅判 type）
    let ok = false;
    for (let y = j; y > j - 10; y--) {
      if (!this.host.store.inBounds(i, y)) break;
      if (this.active(i, y) && anchorSheets.includes(sheetOf(this.typeAt(i, y)))) { ok = true; break; }
    }
    if (ok) this.setType(i, j + 1, S(vineSheet));
  }

  /** 藤顶挂靠检查（普通藤专用：向上找 2 号草，cs:72563-72579） */
  private hasSupport(i: number, j: number, grassSheet: number): boolean {
    for (let y = j; y > j - 10; y--) {
      if (!this.host.store.inBounds(i, y)) break;
      if (this.active(i, y) && sheetOf(this.typeAt(i, y)) === grassSheet) return true;
    }
    return false;
  }

  // ================= UndergroundTile（cs:73266） =================

  private undergroundTile(i: number, j: number, wallDist: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const minI = Math.max(10, i - 1), maxI = Math.min(st.w - 10, i + 2);
    const minJ = Math.max(10, j - 1), maxJ = Math.min(st.h - 10, j + 2);
    const t = this.typeAt(i, j);
    if (!this.active(i, j)) return; // 原版地下非活性格无演化（GrowWeb 是地表专属段）
    const sheet = sheetOf(t);
    if (TILE_ALCH.has(sheet)) { this.growAlch(i, j); return; }
    this.hardUpdateWorld(i, j);
    if (Math.random() < 1 / 2500) this.plantDye(i, j, false);
    else if (this.hardMode && Math.random() < 1 / 10000) this.plantDye(i, j, true);
    // ---- 原版 else-if 链（cs:73305-73788）：60 走 GrassGrowth 被消费，
    //      丛林藤(62)/蜂巢由既有藤 tile 驱动生长 ----
    if (SPREAD_UNDERGROUND.has(sheet)) {
      this.grassGrowth(i, j, minI, maxI, minJ, maxJ, true);
      if ((sheet === 32 || sheet === 352) && Math.random() < 1 / 3) {
        this.growSpike(i, j, sheet, sheet === 32 ? 23 : 199);
      }
    } else if (sheet === 61 && Math.random() < 1 / 3 && sheetOf(this.typeAt(i, j + 1)) !== 226
      && st.frameX[this.at(i, j)] < 144) {
      // 61 → 74 高草（cs:73336-73352）
      if (Math.random() < 1 / 4) st.setTile(i, j, t, 162 + Math.floor(Math.random() * 8) * 18, st.frameY[this.at(i, j)]);
      this.setType(i, j, S(74));
    } else if ((sheet === 60 || sheet === 62) && Math.random() < 1 / 5 && this.growMoreVines(i, j)) {
      // 丛林藤延长（62 驱动，cs:73355-73393）
      if (!this.active(i, j + 1) && !this.isLava(i, j + 1) && this.hasSupportMulti(i, j, [60])) {
        this.setType(i, j + 1, S(62));
      }
    } else if ((sheet === 633 || sheet === 638) && this.growMoreVines(i, j)) {
      // 灰烬藤（cs:73403-73430）
      const maxV = sheet === 638 ? 7 : 70;
      if (Math.random() < 1 / maxV && !this.active(i, j + 1) && !this.isLava(i, j + 1)
        && this.hasSupportMulti(i, j, [633])) this.setType(i, j + 1, S(638));
    } else if ((sheet === 60 || sheet === 62) && Math.random() < 1 / 80 && !this.playerLOS(i, j)) {
      // 蜂巢再生（444 2×2，cs:73541-73605）：由 62 藤位锚定、锚 2 宽实心、20 格密度门
      this.placeJungleBlock2x2(i, j, 444, j + 1);
    } else if (sheet === 396 && Math.random() < 1 / 80 && !this.playerLOS(i, j)) {
      // 蚁狮幼虫（485/稀有 751，cs:73608-73693）：上方 3 格净空
      if (Math.random() < 1 / 100) { this.place1(i, j - 1, 751, 0); }
      else {
        let clear = true;
        for (let d = -1; d >= -3; d--) { if (this.active(i, j + d)) { clear = false; break; } }
        if (clear) this.place1(i, j - 1, 485, Math.floor(Math.random() * 4));
      }
    } else if (sheet === 69) {
      this.growSpike(i, j, 69, 60);
    } else if (SNOW_FAMILY.has(sheet)) {
      // 冰雪钟乳石再生（cs:73704-73751）
      if (Math.random() < 1 / 10 && !this.active(i, j + 1) && !this.active(i, j + 2)) {
        let cnt = 0;
        for (let x = i - 3; x < i + 4; x++) for (let y = j; y <= j + 3; y++) {
          if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 165) cnt++;
        }
        if (cnt < 2) this.placeTight(i, j + 1);
      }
    } else if (TILE_MOSS.has(sheet) || TILE_MOSS_BRICK.has(sheet)) {
      this.mossUpdate(i, j, minI, maxI, minJ, maxJ);
    } else if (sheet === 661 || sheet === 636 || sheet === 662 || sheet === 205 || sheet === 70 || sheet === 528) {
      // 地下藤族延长（cs:73433-73502）：70/528 蘑菇藤、661/636 腐化藤、662/205 猩红藤
      if (sheet === 70 || sheet === 528) {
        const maxV = sheet === 528 ? 7 : 70;
        if (this.growMoreVines(i, j) && Math.random() < 1 / maxV
          && !this.active(i, j + 1) && !this.isLava(i, j + 1)
          && this.hasSupportMulti(i, j, [70])) this.setType(i, j + 1, S(528));
      } else {
        const corrupt = sheet === 661 || sheet === 636;
        const maxV = (sheet === 636 || sheet === 205) ? 7 : 70;
        if (this.growMoreVines(i, j) && Math.random() < 1 / maxV
          && !this.active(i, j + 1) && !this.isLava(i, j + 1)
          && this.hasSupportMulti(i, j, corrupt ? [661] : [662])) {
          this.setType(i, j + 1, S(corrupt ? 636 : 205));
        }
      }
    }
  }

  private hasSupportMulti(i: number, j: number, sheets: number[]): boolean {
    for (let y = j; y > j - 10; y--) {
      if (!this.host.store.inBounds(i, y)) break;
      if (this.active(i, y) && sheets.includes(sheetOf(this.typeAt(i, y)))) return true;
    }
    return false;
  }

  /** 蜂巢/球茎 2×2 放置（cs:73550-73605 简化：锚 2 宽实心+净空+密度门） */
  private placeJungleBlock2x2(i: number, j: number, sheet: number, floorY: number): boolean {
    // floorY: 主体底行（60 草上再下一格）
    for (let k = i; k < i + 2; k++) {
      if (!this.solidTile(k, floorY - 1)) return false;
      if (this.liquidAt(k, floorY - 1) > 0) return false;
      for (let l = floorY; l < floorY + 2; l++) {
        if (this.active(k, l) || this.isLava(k, l)) return false;
      }
    }
    // 20 格内既有 >0 → 不放（CountNearBlocksTypes cap 1）
    for (let x = i - 20; x <= i + 20; x += 2) for (let y = floorY - 20; y <= floorY + 20; y += 2) {
      if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === sheet) return false;
    }
    return this.placeBlock(i, floorY, sheet, 2, 2);
  }

  // ================= GrassGrowth（cs:74333） =================

  private grassGrowth(i: number, j: number, minI: number, maxI: number, minJ: number, maxJ: number, underground: boolean): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const sheet = sheetOf(this.typeAt(i, j));

    if (underground) {
      // 地下半区（cs:74342-74451）：邪恶草转泥/土 + 顶植物；丛林/蘑菇/灰烬草转泥/灰
      let toDirt = -1, toMud = -1, plant = -1, plantChance = 1, self = sheet, evilPair = -1;
      switch (sheet) {
        case 23: toDirt = 0; toMud = 59; self = 23; evilPair = 661; plant = 24; plantChance = 2; break;
        case 199: toDirt = 0; toMud = 59; self = 199; evilPair = 662; plant = 201; plantChance = 2; break;
        case 661: toDirt = 59; toMud = 0; self = 661; evilPair = 23; plant = 24; plantChance = 2; break;
        case 662: toDirt = 59; toMud = 0; self = 662; evilPair = 199; plant = 201; plantChance = 2; break;
        case 60: toDirt = 59; plant = 61; plantChance = 10; break;
        case 70: toDirt = 59; plant = 71; plantChance = 10; break;
        case 633: toDirt = 57; plant = 637; plantChance = 2; break;
        case 226: plant = 61; plantChance = 10; toDirt = -1; break;
      }
      if (plant !== -1 && !this.active(i, minJ) && Math.random() < 1 / plantChance) {
        if (!(sheet === 226 && this.tooManyJunglePlants(i, minJ))) {
          this.place1(i, minJ, plant, 0, plant === 61 ? 8 : 1);
        }
      }
      if (toDirt !== -1) {
        for (let k = minI; k < maxI; k++) {
          for (let l = minJ; l < maxJ; l++) {
            if ((i === k && j === l) || !this.active(k, l)) continue;
            const s = sheetOf(this.typeAt(k, l));
            if (s === toDirt) this.spreadGrass(k, l, toDirt, self);
            else if (evilPair !== -1 && s === toMud) this.spreadGrass(k, l, toMud, evilPair);
          }
        }
      }
      return;
    }

    // ---- 地表半区（cs:74566-74928）----
    switch (sheet) {
      case 2: case 23: case 32: case 109: case 199: case 352: case 477: case 492: case 661: case 662: {
        // 顶植物（cs:74599-74626）：2→3(1/12) 23/661→24 199/662→201 109→110（均 1/10）
        if (!this.active(i, minJ) && this.liquidAt(i, minJ) === 0) {
          let plant = -1;
          if (sheet === 2 && Math.random() < 1 / 12) plant = 3;
          else if ((sheet === 23 || sheet === 661) && Math.random() < 1 / 10) plant = 24;
          else if ((sheet === 199 || sheet === 662) && Math.random() < 1 / 10) plant = 201;
          else if (sheet === 109 && Math.random() < 1 / 10) plant = 110;
          if (plant !== -1) this.place1(i, minJ, plant, 0, plant === 3 ? 7 : 1);
        }
        // 类型归一（cs:74629-74657）：32→23 352→199 477→2 492→109；邪恶对 23/661、199/662
        let grass = sheet;
        let evilPair = -1;
        if (sheet === 32) grass = 23;
        else if (sheet === 352) grass = 199;
        else if (sheet === 477) grass = 2;
        else if (sheet === 492) grass = 109;
        if (sheet === 23 || sheet === 661) { grass = 23; evilPair = 661; }
        if (sheet === 199 || sheet === 662) { grass = 199; evilPair = 662; }
        const evilSelf = sheet === 23 || sheet === 199 || sheet === 661 || sheet === 662;
        const evilSpread = this.allowedToSpread && evilSelf;
        const convGrassSelf = sheet === 109 || sheet === 492;
        // 邻域转换（cs:74658-74786）
        for (let k = minI; k < maxI; k++) {
          for (let l = minJ; l < maxJ; l++) {
            if ((i === k && j === l) || !this.active(k, l)) continue;
            const s = sheetOf(this.typeAt(k, l));
            // A 段：普通草转泥+泥转邪恶对+邪恶草吞并普通草族（cs:74679-74705）
            if (s === 0 || (evilPair !== -1 && s === 59)
              || (evilSelf && (s === 2 || s === 109 || s === 477 || s === 492))) {
              this.spreadGrass(k, l, 0, grass);
              if (evilPair !== -1) this.spreadGrass(k, l, 59, evilPair);
              if (evilSpread) {
                this.spreadGrass(k, l, 2, grass);
                this.spreadGrass(k, l, 109, grass);
                this.spreadGrass(k, l, 477, grass);
                this.spreadGrass(k, l, 492, grass);
                if (evilPair !== -1) this.spreadGrass(k, l, 60, evilPair);
              }
            }
            // B 段：神圣草吞并（cs:74707-74761）
            if (s === 0 || (convGrassSelf && (s === 2 || s === 477 || s === 23 || s === 199))) {
              this.spreadGrass(k, l, 0, grass);
              if (sheet === 109) this.spreadGrass(k, l, 2, grass);
              if (sheet === 492) this.spreadGrass(k, l, 477, grass);
              if (sheet === 109) this.spreadGrass(k, l, 477, 492);
              if (convGrassSelf && this.allowedToSpread) {
                this.spreadGrass(k, l, 23, 109);
                this.spreadGrass(k, l, 199, 109);
              }
            }
          }
        }
        return;
      }
      case 70: {
        // 蘑菇草（cs:74765-74818）：顶蘑菇草植物 71（1/10）+ 蘑菇树（未接）+ 泥→70
        if (!this.active(i, minJ) && Math.random() < 1 / 10) this.place1(i, minJ, 71, 0, 1);
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 59) this.spreadGrass(k, l, 59, 70);
        }
        return;
      }
      case 60: {
        // 丛林草（cs:74821-74886）：顶 61（1/7）+ 世花球茎 238 + 生命果 236 + 丛林植物 233 + 泥→60
        if (!this.active(i, minJ) && Math.random() < 1 / 7) {
          this.place1(i, minJ, 61, 0, 8);
        } else if (Math.random() < 1 / 500 && (!this.active(i, minJ)
          || [61, 74, 69].includes(sheetOf(this.typeAt(i, minJ))))) {
          void 0; // 蘑菇树再生（TryGrowingTreeByType(5)）——树系统运行时接口未接
        } else if (Math.random() < 1 / 25 && this.liquidAt(i, minJ) === 0) {
          if (this.hardMode && this.mechAll() && Math.random() < 1 / 60) {
            // 世花球茎（cs:74490-74512）：150 格内无 238
            let has = false;
            for (let x = i - 150; x < i + 150 && !has; x += 2) for (let y = j - 150; y < j + 150; y += 2) {
              if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 238) { has = true; break; }
            }
            if (!has) this.placeBlock(i, minJ, 238, 2, 2);
          } else if (this.hardMode && this.mechAny() && Math.random() < 1 / (30)) {
            // 生命果植物 236（cs:74514-74538；专家 1/30 大师 1/40——本仓库无难度档取 1/30）
            let has = false;
            for (let x = i - 60; x < i + 60 && !has; x += 2) for (let y = j - 60; y < j + 60; y += 2) {
              if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 236) { has = true; break; }
            }
            if (!has) this.placeBlock(i, minJ, 236, 2, 2);
          } else {
            // 丛林植物 233（cs:74540-74558）
            this.place1(i, minJ, 233, Math.floor(Math.random() * 8), 1);
          }
        }
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 59) this.spreadGrass(k, l, 59, 60);
        }
        return;
      }
      case 226: {
        // 神庙砖顶 61（1/7，密度门，cs:74880-74899）
        if (!this.active(i, minJ) && Math.random() < 1 / 7 && !this.tooManyJunglePlants(i, minJ)) {
          this.place1(i, minJ, 61, 0, 8);
        }
        return;
      }
      case 633: {
        // 灰烬草（cs:74902-74928）：顶 637（1/10）+ 灰烬→633
        if (!this.active(i, minJ) && Math.random() < 1 / 10) this.place1(i, minJ, 637, 0, 4);
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 57) this.spreadGrass(k, l, 57, 633);
        }
        return;
      }
    }
  }

  // ================= 运行时 SpreadGrass（cs:75210） =================

  private spreadGrass(i: number, j: number, dirt: number, grass: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const ti = this.at(i, j);
    if (!st.flags[ti]) return;
    if (sheetOf(st.type[ti]) !== dirt) return;
    // 运行时守卫（cs:75223-75230）：非邪恶草 + (j≥worldSurface 且 dirt==0) → 不转
    // （普通草只在 worldSurface 以上蔓延；邪恶草/丛林草/蘑菇草不受限）
    const evil = grass === 23 || grass === 661 || grass === 199 || grass === 662;
    if (!evil && j >= this.host.worldSurface && dirt === 0) return;
    // 3×3 封死不转；邻岩浆恒不转（cs:75242-75263）
    let enclosed = true, lavaNear = false;
    for (let dx = -1; dx <= 1 && !lavaNear; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = i + dx, y = j + dy;
        if (!st.inBounds(x, y)) continue;
        const k = this.at(x, y);
        if (st.liquid[k] > 0 && st.liquidType[k] === 2) { lavaNear = true; break; }
        const d = TILE_DEFS[st.type[k]];
        if (!st.flags[k] || !d?.solid) enclosed = false;
      }
    }
    if (lavaNear || enclosed) return;
    // CanBeClearedDuringGeneration 守卫（NOT_CLEARABLE = 沙岩族等不可转换表）
    if (NOT_CLEARABLE.has(st.type[ti])) return;
    // 上方向日葵(27)挡邪恶草（cs:75265-75267）
    if (evil && sheetOf(this.typeAt(i, j - 1)) === 27) return;
    // 草→草转换走 Convert tiles-only（cs:75273-75283）
    if (dirt > 0 && CONV_GRASS.has(dirt)) {
      if (grass === 23 || grass === 661) this.convert(i, j, 1, true, false);
      else if (grass === 199 || grass === 662) this.convert(i, j, 4, true, false);
      else if (grass === 109) this.convert(i, j, 2, true, false);
      return;
    }
    this.setType(i, j, S(grass));
  }

  // ================= Convert（cs:55113，演化路径用 case 1/2/3/4/8/9） =================

  convert(i: number, j: number, conversionType: number, tiles = true, walls = true): void {
    const st = this.host.store;
    if (!st.inBounds(i, j) || (!tiles && !walls)) return;
    const ti = this.at(i, j);
    const wall = st.wall[ti];
    const act = st.flags[ti] !== 0;
    if (!act && wall <= 0) return;
    const sheet = act ? sheetOf(st.type[ti]) : -1;
    const convWall = (to: number) => { if (wall !== 0 && wall !== to) st.setWall(i, j, to); };
    const convTile = (to: number) => { if (act && sheet !== to) this.setType(i, j, S(to)); };
    switch (conversionType) {
      case 4: // 猩红化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 81) convWall(81);
          else if (WALL_CONV_STONE.has(wall) && wall !== 83) convWall(83);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 218) convWall(218);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 221) convWall(221);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 192) convWall(192);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 193) convWall(193);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 194) convWall(194);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 195) convWall(195);
        }
        if (tiles) {
          if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 203) convTile(203);
          else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 662) convTile(662);
          else if (CONV_GRASS.has(sheet) && sheet !== 199) convTile(199);
          else if (CONV_ICE.has(sheet) && sheet !== 200) convTile(200);
          else if (CONV_SAND.has(sheet) && sheet !== 234) convTile(234);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 399) convTile(399);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 401) convTile(401);
          else if (CONV_THORN.has(sheet) && sheet !== 352) convTile(352);
        }
        break;
      case 2: // 神圣化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 70) convWall(70);
          else if (WALL_CONV_STONE.has(wall) && wall !== 28) convWall(28);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 219) convWall(219);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 222) convWall(222);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 200) convWall(200);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 201) convWall(201);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 202) convWall(202);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 203) convWall(203);
        }
        if (tiles) {
          if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 117) convTile(117);
          else if (CONV_GOLF_GRASS.has(sheet) && sheet !== 492) convTile(492);
          else if (CONV_GRASS.has(sheet) && sheet !== 109 && sheet !== 492) convTile(109);
          else if (CONV_ICE.has(sheet) && sheet !== 164) convTile(164);
          else if (CONV_SAND.has(sheet) && sheet !== 116) convTile(116);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 402) convTile(402);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 403) convTile(403);
          else if (CONV_THORN.has(sheet)) this.kill(i, j);
          if (sheet === 59 && ([109].includes(sheetOf(this.typeAt(i - 1, j)))
            || [109].includes(sheetOf(this.typeAt(i + 1, j)))
            || [109].includes(sheetOf(this.typeAt(i, j - 1)))
            || [109].includes(sheetOf(this.typeAt(i, j + 1))))) {
            this.setType(i, j, S(0));
          }
        }
        break;
      case 1: // 腐化化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 69) convWall(69);
          else if (WALL_CONV_STONE.has(wall) && wall !== 3) convWall(3);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 217) convWall(217);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 220) convWall(220);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 188) convWall(188);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 189) convWall(189);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 190) convWall(190);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 191) convWall(191);
        }
        if (tiles) {
          if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 25) convTile(25);
          else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 661) convTile(661);
          else if (CONV_GRASS.has(sheet) && sheet !== 23) convTile(23);
          else if (CONV_ICE.has(sheet) && sheet !== 163) convTile(163);
          else if (CONV_SAND.has(sheet) && sheet !== 112) convTile(112);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 398) convTile(398);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 400) convTile(400);
          else if (CONV_THORN.has(sheet) && sheet !== 32) convTile(32);
        }
        break;
      case 3: // 蘑菇化（环境转换器蘑菇）
        if (walls && (wall === 64 || wall === 67 || wall === 15 || wall === 247)) convWall(80);
        if (tiles) {
          if (sheet === 60) convTile(70);
          else if (CONV_THORN.has(sheet)) this.kill(i, j);
        }
        break;
      case 8: // 叶绿生长（cs:55693-55700：泥/丛林草 → 叶绿矿 211）
        if (tiles && (sheet === 59 || sheet === 60)) this.setType(i, j, S(211));
        break;
      case 9: // 邪恶退化（cs:55712-55749：邪恶草族 → 泥/丛林草）
        if (!tiles) break;
        if ([23, 199, 661, 662].includes(sheet)) this.setType(i, j, S(60));
        else if (sheet === 0) this.setType(i, j, S(59));
        else if (sheet === 25 || sheet === 203) this.setType(i, j, S(1));
        else if (sheet === 112 || sheet === 234) this.setType(i, j, S(53));
        else if (sheet === 398 || sheet === 399) this.setType(i, j, S(397));
        else if (sheet === 400 || sheet === 401) this.setType(i, j, S(396));
        else if ([24, 32, 201, 205, 352, 636].includes(sheet)) this.kill(i, j);
        break;
    }
  }

  // ================= hardUpdateWorld（cs:69661，困难模式） =================

  private hardUpdateWorld(i: number, j: number): void {
    if (!this.hardMode) return;
    const st = this.host.store;
    if (!st.inBounds(i, j) || !this.active(i, j)) return;
    const sheet = sheetOf(this.typeAt(i, j));
    // 水晶碎块生长（cs:69668-69709）：珍珠石/珍珠沙/神圣冰/神圣硬化沙岩 族 + 岩层下 + 1/5
    if (CAN_GROW_SHARDS.has(sheet) && j > this.host.rockLevel && Math.random() < 1 / 5) {
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
      if (!this.active(i + dx, j + dy)) {
        let cnt = 0;
        for (let k = i - 6; k <= i + 6; k++) for (let l = j - 6; l <= j + 6; l++) {
          if (this.active(k, l) && sheetOf(this.typeAt(k, l)) === 129) cnt++;
        }
        if (cnt < 2) {
          const rare = Math.random() < 1 / 50;
          this.place1(i + dx, j + dy, 129, rare ? 18 + Math.floor(Math.random() * 6) : Math.floor(Math.random() * 18));
        }
      }
    }
    // 叶绿生长（cs:69712-69731）：深处丛林草 1/300 → 周围 10 格泥/丛林草 → 叶绿
    if (j > (this.host.worldSurface + this.host.rockLevel) / 2) {
      if (sheet === 60 && Math.random() < 1 / 300) {
        const x = i + Math.floor(Math.random() * 21) - 10;
        const y = j + Math.floor(Math.random() * 21) - 10;
        const s2 = sheetOf(this.typeAt(x, y));
        if (this.active(x, y) && (s2 === 59 || s2 === 60)
          && (!this.active(x, y - 1) || ![5, 236, 702, 238].includes(sheetOf(this.typeAt(x, y - 1))))
          && this.canChlorophyteGrow(x, y)) {
          this.convert(x, y, 8);
        }
      }
      // 叶绿砖/矿扩散退化周围邪恶块（cs:69733-69755：211/346 → 周围 6 格 Convert 9）
      if (sheet === 211 || sheet === 346) {
        const x = i + Math.floor(Math.random() * 13) - 6;
        const y = j + Math.floor(Math.random() * 13) - 6;
        if (this.active(x, y)) this.convert(x, y, 9);
      }
    }
    // 世花已死则邪恶不再蔓延（cs:69757-69759）
    if ((this.host.flags['downed_262'] && Math.random() < 1 / 2) || !this.allowedToSpread) return;
    // 邪恶草蔓延（cs:69761-69806 腐化 / :69808-69895 猩红 / :69897-69955 神圣 同构）
    if (SPREADS_CORRUPTION.has(sheet)) this.evilSpread(i, j, 1);
    else if (SPREADS_CRIMSON.has(sheet)) this.evilSpread(i, j, 4);
    else if (SPREADS_HALLOW.has(sheet)) this.evilSpread(i, j, 2);
  }

  /** 邪恶/神圣蔓延主体（cs:69761+ 同构三分支合并）：±3 随机点，1/2 链式重试，
   *  向日葵 2 格内不转，叶绿附近防御性退化。
   *  可转换集差异（腐化/猩红 cs:69774-69805 vs 神圣 cs:69919-69955）：神圣不含
   *  丛林草(60)/丛林刺(69)——神圣不吞丛林 */
  private evilSpread(i: number, j: number, convType: number): void {
    const st = this.host.store;
    const ALLOW: Record<number, number[]> = {
      1: [2, 477, 1, 53, 396, 397, 60, 69, 161],
      4: [2, 477, 1, 53, 396, 397, 60, 69, 161],
      2: [2, 477, 1, 53, 396, 397, 161],
    };
    let again = true;
    while (again) {
      again = false;
      const x = i + Math.floor(Math.random() * 7) - 3;
      const y = j + Math.floor(Math.random() * 7) - 3;
      if (!st.inBounds(x, y)) continue;
      // nearbyChlorophyte → 防御退化（cs:69768-69770；ChlorophyteDefense 非 remix 无操作）
      let chlor = 0;
      for (let k = x - 5; k <= x + 5; k++) for (let l = y - 5; l <= y + 5; l++) {
        const s = sheetOf(this.typeAt(k, l));
        if (this.active(k, l) && (s === 211 || s === 346)) chlor++;
      }
      if (chlor >= 3) return;
      // 向日葵 2 格内（CountNearBlocksTypes(x,y,2,cap1,27)）→ 中止本次
      let sunflower = false;
      for (let k = x - 2; k <= x + 2 && !sunflower; k++) for (let l = y - 2; l <= y + 2; l++) {
        if (this.active(k, l) && sheetOf(this.typeAt(k, l)) === 27) { sunflower = true; break; }
      }
      if (sunflower) continue;
      const s = sheetOf(this.typeAt(x, y));
      const convertible = this.active(x, y)
        && (ALLOW[convType].includes(s) || TILE_MOSS.has(s));
      if (convertible) {
        if (Math.random() < 1 / 2) again = true;
        this.convert(x, y, convType, true, false);
      }
    }
  }

  /** CanChlorophyteGrow（cs:69525-69576）：35 格内 ≤40 且 85 格内 ≤130（岩层上减半） */
  private canChlorophyteGrow(i: number, j: number): boolean {
    let cap1 = 40, cap2 = 130, r1 = 35, r2 = 85;
    if (j < this.host.rockLevel) { cap1 = 20; cap2 = 65; r1 = 52; r2 = 127; }
    const count = (r: number) => {
      let n = 0;
      for (let x = i - r; x < i + r; x++) for (let y = j - r; y < j + r; y++) {
        if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 211) n++;
      }
      return n;
    };
    return count(r1) <= cap1 && count(r2) <= cap2;
  }

  // ================= 墙蔓延（cs:74958/75073） =================

  private spreadGrassWalls(wallDist: number, i: number, j: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const wall = st.wall[this.at(i, j)];
    const sheet = this.active(i, j) ? sheetOf(this.typeAt(i, j)) : -1;
    let conv = -1;
    if (WALL_SPREADS_CRIMSON.has(wall) || (sheet >= 0 && SPREADS_CRIMSON.has(sheet))) conv = 4;
    else if (WALL_SPREADS_CORRUPTION.has(wall) || (sheet >= 0 && SPREADS_CORRUPTION.has(sheet))) conv = 1;
    else if (WALL_SPREADS_HALLOW.has(wall) || (sheet >= 0 && SPREADS_HALLOW.has(sheet))) conv = 2;
    if (conv === -1) return;
    const x = i + Math.floor(Math.random() * 5) - 2;
    const y = j + Math.floor(Math.random() * 5) - 2;
    if (!st.inBounds(x, y)) return;
    const tw = st.wall[this.at(x, y)];
    // 腐化/猩红：目标墙须为草墙族 63-68（cs:74975）；神圣：63/65/66/68（cs:75027）
    const grassWall = tw >= 63 && tw <= 68;
    if (conv === 2 ? !(tw === 63 || tw === 65 || tw === 66 || tw === 68) : !grassWall) return;
    // wallDist 范围内有同族邪恶 tile 才转化（cs:74982-75000）
    const spreads = conv === 1 ? SPREADS_CORRUPTION : conv === 4 ? SPREADS_CRIMSON : SPREADS_HALLOW;
    let near = false;
    for (let k = i - wallDist; k <= i + wallDist && !near; k++) for (let l = j - wallDist; l <= j + wallDist; l++) {
      if (this.active(k, l) && spreads.has(sheetOf(this.typeAt(k, l)))) { near = true; break; }
    }
    if (near) this.convert(x, y, conv, false, true);
  }

  private spreadDesertWalls(wallDist: number, i: number, j: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const wall = st.wall[this.at(i, j)];
    const sheet = this.active(i, j) ? sheetOf(this.typeAt(i, j)) : -1;
    // 仅沙岩/硬化沙墙/块（cs:75077-75085）
    const isSandWall = WALL_CONV_SANDSTONE.has(wall) || WALL_CONV_HARD_SAND.has(wall);
    const isSandTile = sheet >= 0 && (CONV_SANDSTONE.has(sheet) || CONV_HARD_SAND.has(sheet));
    if (!isSandWall && !isSandTile) return;
    let conv = -1;
    if (WALL_SPREADS_CORRUPTION.has(wall) || SPREADS_CORRUPTION.has(sheet)) conv = 1;
    else if (WALL_SPREADS_HALLOW.has(wall) || SPREADS_HALLOW.has(sheet)) conv = 2;
    else if (WALL_SPREADS_CRIMSON.has(wall) || SPREADS_CRIMSON.has(sheet)) conv = 4;
    if (conv === -1) return;
    const x = i + Math.floor(Math.random() * 5) - 2;
    const y = j + Math.floor(Math.random() * 5) - 2;
    if (!st.inBounds(x, y)) return;
    // 目标须为纯沙墙族（cs:75112-75120）
    if (!WALL_CONV_PURE_SAND.has(st.wall[this.at(x, y)])) return;
    const spreads = conv === 1 ? SPREADS_CORRUPTION : conv === 4 ? SPREADS_CRIMSON : SPREADS_HALLOW;
    let near = false;
    for (let k = i - wallDist; k <= i + wallDist && !near; k++) for (let l = j - wallDist; l <= j + wallDist; l++) {
      if (this.active(k, l) && spreads.has(sheetOf(this.typeAt(k, l)))) { near = true; break; }
    }
    if (near) this.convert(x, y, conv, false, true);
  }

  // ================= 苔藓（Overground/UndergroundTile 同段 cs:72400-72462） =================

  private mossUpdate(i: number, j: number, minI: number, maxI: number, minJ: number, maxJ: number): void {
    if (Math.random() >= 0.5) return;
    const st = this.host.store;
    const self = sheetOf(this.typeAt(i, j));
    for (let k = minI; k < maxI; k++) {
      for (let l = minJ; l < maxJ; l++) {
        if ((i === k && j === l) || !this.active(k, l)) continue;
        const other = sheetOf(this.typeAt(k, l));
        if (other !== 1 && other !== 38) continue;
        const to = this.mossConversion(self, other);
        if (to) {
          this.spreadGrass(k, l, other, to);
        }
      }
    }
    // 藓堆 184（cs:72447-72462）：1/6 随机相邻空格
    if (Math.random() < 1 / 6) {
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
      if (!this.active(i + dx, j + dy)) this.place1(i + dx, j + dy, 184, 0, 3);
    }
  }

  /** MossConversion（cs:71469-71494）：苔↔苔砖对照表 */
  private mossConversion(thisType: number, otherType: number): number {
    if (TILE_MOSS_BRICK.has(thisType) && otherType === 38) return thisType;
    if (TILE_MOSS.has(thisType) && otherType === 1) return thisType;
    const pairs: Record<number, number> = {
      182: 515, 515: 182, 180: 513, 513: 180, 381: 517, 517: 381,
      534: 535, 535: 534, 536: 537, 537: 536, 539: 540, 540: 539,
      625: 626, 626: 625, 627: 628, 628: 627, 183: 516, 516: 183, 181: 514, 514: 181,
    };
    return pairs[thisType] ?? 0;
  }

  // ================= 药草（PlantAlch cs:45910 / GrowAlch cs:45786 / PlaceAlch） =================

  private plantAlch(): void {
    const st = this.host.store;
    const x = 20 + Math.floor(Math.random() * (st.w - 40));
    // 深度分布（cs:45917-45921）：1/40 深层、9/10 地表下、1/10 全域
    let y: number;
    const r = Math.random();
    if (r < 1 / 40) y = Math.floor((this.host.rockLevel + st.h) / 2) + Math.floor(Math.random() * (st.h - 20 - Math.floor((this.host.rockLevel + st.h) / 2)));
    else if (r < 1 / 40 + 9 / 10) y = Math.floor(this.host.worldSurface) + Math.floor(Math.random() * (st.h - 20 - Math.floor(this.host.worldSurface)));
    else y = 20 + Math.floor(Math.random() * (st.h - 40));
    if (y >= st.h - 20) return;
    // 向下找首个实心
    let k = y;
    while (k < st.h - 20 && !this.active(x, k)) k++;
    if (!this.active(x, k) || this.active(x, k - 1) || this.liquidAt(x, k - 1) !== 0) return;
    // 密度门（cs:45928-45945）：15×15（随世界宽缩放）内药草 <5
    const rad = Math.floor(15 * (st.w / 4200));
    let cnt = 0;
    for (let dx = Math.max(4, x - rad); dx <= Math.min(st.w - 4, x + rad); dx++) {
      for (let dy = Math.max(4, k - rad); dy <= Math.min(st.h - 4, k + rad); dy++) {
        if (this.active(dx, dy) && TILE_ALCH.has(sheetOf(this.typeAt(dx, dy)))) cnt++;
      }
    }
    if (cnt >= 5) return;
    // PlaceSuitableHerbHere（cs:45948-45977）：按脚下方块选药草种
    const ground = sheetOf(this.typeAt(x, k));
    let style = -1;
    if (ground === 2 || ground === 109) style = 0;
    else if (ground === 60) style = 1;
    else if (ground === 0 || ground === 59) style = 2;
    else if ([23, 661, 25, 203, 199, 662].includes(ground)) style = 3;
    else if ((ground === 53 || ground === 116) && x >= 380 && x <= st.w - 380) style = 4;
    else if (ground === 57 || ground === 633) style = 5;
    else if (SNOW_FAMILY.has(ground)) style = 6;
    if (style === -1) return;
    // PlaceAlch：82 号芽，frameX = style*18
    this.place1(x, k - 1, 82, style);
  }

  private growAlch(x: number, y: number): void {
    const st = this.host.store;
    if (!this.active(x, y)) return;
    const i = this.at(x, y);
    const fx = st.frameX[i];
    const herb = Math.floor(fx / 18); // 药草种（0-6）
    // 淹死规则（cs:45796-45807）：岩浆除火冠花(5)、水除月光花(1)/水叶(4) 外死亡
    if (this.liquidAt(x, y) > 0) {
      const isLava = st.liquidType[i] === 2;
      const isWater = st.liquidType[i] === 1;
      if (!((isLava && herb === 5) || (isWater && (herb === 1 || herb === 4)))) {
        this.kill(x, y);
        return;
      }
    }
    const sheet = sheetOf(st.type[i]);
    if (sheet === 82) {
      // 芽 → 成熟（cs:45809-45867）：开花条件各自满足时 1/50 直跳 84
      const bloom = (herb === 0 && this.host.isDay) || (herb === 1 && !this.host.isDay)
        || (herb === 2) || (herb === 3) || (herb === 4 && this.host.raining)
        || (herb === 5) || (herb === 6 && y > this.host.worldSurface);
      if (bloom && Math.random() < 1 / 50) {
        // 帧内已有花位的直接成花（帧 0/18/72/36/90 各条件段）；否则走 83
        st.setTile(x, y, S(84), fx, 0);
      } else if (Math.random() < 1 / 50) {
        st.setTile(x, y, S(83), fx, 0);
      }
      return;
    }
    if (sheet === 83) {
      // 成熟 ⇌ 开花（cs:45870-45897）：帧 36 的 1/3 权重摆动
      if (fx === 36 && Math.random() < 2 / 3) {
        if (Math.random() < 1 / 2) st.setTile(x, y, S(84), fx, 0);
      } else if (fx === 108 && Math.random() < 1 / 30) {
        st.setTile(x, y, S(84), fx, 0);
      } else {
        // 满足开花条件 → 1/50 转 84（cs:45809 同构，成熟态沿用）
        const herb2 = herb;
        const bloom = (herb2 === 0 && this.host.isDay) || (herb2 === 1 && !this.host.isDay)
          || (herb2 === 4 && this.host.raining) || (herb2 === 6 && y > this.host.worldSurface);
        if (bloom && Math.random() < 1 / 50) st.setTile(x, y, S(84), fx, 0);
      }
      return;
    }
    if (sheet === 84 && fx === 36 && Math.random() < 1 / 2) {
      // 开花 → 成熟回落（cs:45874-45885 else-if 链）
      st.setTile(x, y, S(83), fx, 0);
    }
  }

  // ================= 仙人掌（cs:56584） =================

  private growCactus(i: number, j: number): void {
    const st = this.host.store;
    if (j <= 0 || !this.active(i, j)) return;
    const base = this.typeAt(i, j);
    const baseSheet = sheetOf(base);
    if (this.liquidAt(i, j - 1) > 0) return;
    // 水量门（cactusWaterWidth 50/Height 25/Limit 25，cs:56599-56611）
    let water = 0;
    for (let k = i - 50; k < i + 50; k++) for (let l = j - 25; l < j + 25; l++) {
      if (st.inBounds(k, l)) water += this.liquidAt(k, l);
    }
    if (Math.floor(water / 255) > 25) return;
    if (CONV_SAND.has(baseSheet)) {
      // 沙上新生（cs:56613-56660）：上方净空 + 6×5 内仙人掌 <4 + 沙 >10
      if (this.active(i, j - 1) || this.active(i - 1, j - 1) || this.active(i + 1, j - 1)) return;
      let cacti = 0, sands = 0;
      for (let m = i - 6; m <= i + 6; m++) for (let n = j - 3; n <= j + 1; n++) {
        if (!this.active(m, n)) continue;
        const s = sheetOf(this.typeAt(m, n));
        if (s === 80) { cacti++; if (cacti >= 4) return; }
        if (CONV_SAND.has(s)) { sands++; if (sands > 10) break; }
      }
      if (sands > 10) {
        st.setTile(i, j - 1, S(80), 0, 0);
      }
      return;
    }
    if (baseSheet !== 80) return;
    // 仙人掌增长（cs:56664-56809）：找顶、密度检查、1/3 分支/直立
    let tx = i, ty = j;
    while (this.active(tx, ty) && sheetOf(this.typeAt(tx, ty)) === 80) {
      ty++;
      if (!this.active(tx, ty) || sheetOf(this.typeAt(tx, ty)) !== 80) {
        if (this.active(tx - 1, ty) && sheetOf(this.typeAt(tx - 1, ty)) === 80
          && this.active(tx - 1, ty - 1) && sheetOf(this.typeAt(tx - 1, ty - 1)) === 80 && tx >= i) tx--;
        if (this.active(tx + 1, ty) && sheetOf(this.typeAt(tx + 1, ty)) === 80
          && this.active(tx + 1, ty - 1) && sheetOf(this.typeAt(tx + 1, ty - 1)) === 80 && tx <= i) tx++;
      }
    }
    ty--;
    const height = ty - j;
    const lean = i - tx;
    tx = i - lean;
    ty = j;
    // 顶密度检查（11-12 格窗口，cs:56715-56730）
    let cnt = 0;
    for (let m = tx - 2; m <= tx + 2; m++) for (let n = ty - (11 - height); n <= ty + height; n++) {
      if (this.active(m, n) && sheetOf(this.typeAt(m, n)) === 80) cnt++;
    }
    if (cnt >= 11 + Math.floor(Math.random() * 2)) return;
    tx = i; ty = j;
    if (lean === 0) {
      if (height === 0) {
        if (!this.active(i, j - 1)) st.setTile(i, j - 1, S(80), 0, 0);
        return;
      }
      // 分支判定（cs:56748-56783）：1/3 左/右/直上
      const sideClear = (d: number) => !this.active(i + d, j) && !this.active(i + 2 * d, j + 1)
        && !this.active(i + d, j - 1) && !this.active(i + d, j + 1) && !this.active(i + 2 * d, j);
      const roll = Math.floor(Math.random() * 3);
      if (roll === 0 && sideClear(-1)) { st.setTile(i - 1, j, S(80), 0, 0); return; }
      if (roll === 1 && sideClear(1)) { st.setTile(i + 1, j, S(80), 0, 0); return; }
      if (height < 2 + Math.floor(Math.random() * 6) && !this.active(i - 1, j - 1) && !this.active(i + 1, j - 1) && !this.active(i, j - 1)) {
        st.setTile(i, j - 1, S(80), 0, 0);
      }
      return;
    }
    // 斜顶延续（cs:56785-56809）
    if (!this.active(i, j - 1) && !this.active(i, j - 2) && !this.active(i + lean, j - 1)
      && this.active(i - lean, j - 1) && sheetOf(this.typeAt(i - lean, j - 1)) === 80) {
      st.setTile(i, j - 1, S(80), 0, 0);
    }
  }

  // ================= 杂项助手 =================

  /** GrowMoreVines（cs:45592-45620）：9×17 窗藤密度门（LOS 加权近似为纯计数） */
  private growMoreVines(x: number, y: number): boolean {
    const st = this.host.store;
    let cap = 60;
    if (sheetOf(this.typeAt(x, y)) === 528) cap = 12;
    let cnt = 0;
    for (let i = x - 4; i <= x + 4; i++) {
      for (let j = y - 6; j <= y + 10; j++) {
        if (st.inBounds(i, j) && this.active(i, j) && IS_VINE.has(sheetOf(this.typeAt(i, j)))) {
          cnt++;
          if (cnt > cap) return false;
        }
      }
    }
    return true;
  }

  private tooManyJunglePlants(i: number, j: number): boolean {
    let cnt = 0;
    for (let x = Math.max(10, i - 9); x <= Math.min(this.host.store.w - 10, i + 9); x++) {
      for (let y = Math.max(10, j - 5); y <= Math.min(this.host.store.h - 10, j + 5); y++) {
        const s = this.active(x, y) ? sheetOf(this.typeAt(x, y)) : -1;
        if (s === 61 || s === 74) { cnt++; if (cnt > 2) return true; }
      }
    }
    return false;
  }

  private tooManyJungleVines(i: number, j: number): boolean {
    let cnt = 0;
    for (let x = Math.max(10, i - 9); x <= Math.min(this.host.store.w - 10, i + 9); x++) {
      for (let y = Math.max(10, j - 5); y <= Math.min(this.host.store.h - 10, j + 5); y++) {
        if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 62) { cnt++; if (cnt > 6) return true; }
      }
    }
    return false;
  }

  /** GrowSpike（cs:45487-45590）：荆棘在草上蔓延（|dx|*2+|dy|<9 菱形域内有同类锚） */
  private growSpike(i: number, j: number, spikeSheet: number, landSheet: number): void {
    let pair = -1;
    if (landSheet === 23) pair = 661;
    else if (landSheet === 199) pair = 662;
    let tx = i, ty = j;
    const dir = Math.floor(Math.random() * 4);
    if (dir === 0) ty--; else if (dir === 1) ty++; else if (dir === 2) tx--; else tx++;
    if (this.active(tx, ty)) return;
    // 菱形域锚检查（cs:45563-45579）：有 land/pair 草且其上挂着同类 spike
    let found = false;
    for (let k = tx - 7; k < tx + 7 && !found; k++) {
      for (let l = ty - 7; l < ty + 7; l++) {
        if (Math.abs(k - tx) * 2 + Math.abs(l - ty) >= 9) continue;
        const s = this.active(k, l) ? sheetOf(this.typeAt(k, l)) : -1;
        const above = this.active(k, l - 1) ? sheetOf(this.typeAt(k, l - 1)) : -1;
        if ((s === landSheet || s === pair) && above === spikeSheet && this.liquidAt(k, l - 1) === 0) {
          found = true; break;
        }
      }
    }
    if (found) this.setType(tx, ty, S(spikeSheet));
  }

  /** PlaceTight → PlaceUncheckedStalactite（cs:38329/38345）：1×2 钟乳石随机变体 */
  private placeTight(x: number, y: number): void {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return;
    if (this.typeAt(x, y) === S(231)) return;
    // SolidTile(x, y-1) + 上下空
    if (!this.solidTile(x, y - 1) || this.active(x, y) || this.active(x, y + 1)) return;
    const variation = Math.floor(Math.random() * 3);
    const t = S(165);
    if (!t) return;
    st.setTile(x, y, t, variation * 18, 0);
    st.setTile(x, y + 1, t, variation * 18, 18);
  }

  /** GrowWeb（cs:74141-74175）：1/10 + ±2-3 内有实心 → 放蛛网 51 */
  private growWeb(i: number, j: number): void {
    if (Math.random() >= 1 / 10) return;
    const r = 2 + Math.floor(Math.random() * 2);
    let solid = false;
    for (let k = i - r; k <= i + r && !solid; k++) for (let l = j - r; l <= j + r; l++) {
      if (this.solidTile(k, l)) { solid = true; break; }
    }
    if (solid && !this.active(i, j)) this.place1(i, j, 51, 0, 3);
  }

  /** plantDye（cs:71298-71390）：染料植物自生（普通 90 / 奇异 240 密度门） */
  private plantDye(i: number, j: number, exotic: boolean): void {
    const st = this.host.store;
    if (!this.active(i, j) || i < 95 || i > st.w - 95 || j < 95 || j > st.h - 95) return;
    const rad = exotic ? 240 : 90;
    if (j < this.host.worldSurface) {
      const above = this.active(i, j - 1) ? sheetOf(this.typeAt(i, j - 1)) : -1;
      if (above !== -1 && ![3, 51, 61, 73, 74, 184].includes(above)) return;
    }
    // 密度门：窗口内同档染料植物存在即放弃（cs:71322-71335）
    for (let k = Math.max(1, i - rad); k < Math.min(st.w - 1, i + rad); k++) {
      for (let l = Math.max(1, j - rad); l < Math.min(st.h - 1, j + rad); l++) {
        if (!this.active(k, l) || sheetOf(this.typeAt(k, l)) !== 227) continue;
        const fx = st.frameX[this.at(k, l)];
        if (exotic ? fx >= 272 : fx < 272) return;
      }
    }
    const ground = sheetOf(this.typeAt(i, j));
    if (exotic) {
      if (CONV_GRASS.has(ground) || TILE_MOSS.has(ground) || ground === 0) {
        const aboveLiq = this.liquidAt(i, j - 1);
        const liqType = st.liquidType[this.at(i, j - 1)];
        if (aboveLiq > 0 && (liqType === 2 || liqType === 3)) return;
        this.place1(i, j - 1, 227, 8 + Math.floor(Math.random() * 4));
      }
      return;
    }
    if (ground === 2 || ground === 109) {
      this.place1(i, j - 1, 227, Math.random() < 1 / 4 ? 4 : 3);
    } else if (ground === 60) {
      this.place1(i, j - 1, 227, Math.random() < 1 / 2 ? 2 : 4);
    } else if (ground === 53 && this.liquidAt(i, j - 1) === 255 && this.liquidAt(i, j - 2) === 255) {
      this.place1(i, j - 1, 227, 2);
    }
  }
}
