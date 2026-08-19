// 原版 TrackGenerator 1:1 移植（Terraria.GameContent.Generation/TrackGenerator.cs 全文 +
// MicroBiomes pass 矿轨段 WorldGen.cs:22014-22091）。
// 长轨(LongTrackCount 1-2 ×WorldWidth,长 400-1000 ×WorldWidth)+ 标准轨
// (StandardTrackCount 4-7 ×WorldArea,长 150-300 ×WorldWidth)两段,tile 314。
//
// 算法是**自包含的确定性历史改写搜索**(非 AStar),除 PlacePath 外零掷骰:
//   CreateTrackStart:预填 4096 格历史(初始全部 Down 坡) → FindPath:
//     slope 追加(前一格 Up 则 Straight 否则 Down) → TryRewriteHistoryToAvoidTiles
//     (≤25 格回溯改坡避障) → 仍 Obstructed 则 CreateTunnel(隧道模式,最多 10 格) →
//     SmoothTrack(反向扫,15 格窗口内抹平洼地) → PlacePath(清轨巷 → 铺 314)。
// PlacePath 掷骰(cs:88-91/119-122):每列 Next(7),1/7 重掷 playerHeight=Next(5,9)。
// 铺轨与帧链交织:列 k 落块后即对列 k-1 上扫 8 格 TileFrame(frameNeighbors:true)
// (cs:150-153,邻格 184 苔藓 Next(3) 掷即此链),末列再收尾 playerHeight 格
// (cs:154-160);314 格自分派 frameTrack(= Minecart.FrameTrack,TileFrameImportant
// case 314 → WorldGen.cs:86033)写前/后轨连接 ID(frameX/frameY)。
//
// 已知近似(注明):
//  - Tile.SmoothSlope(轨底/轨顶坡面修整)省略——RNG 零掷,帧链无关(AAAAA 备案)
//  - SecretSeed.dualDungeons / errorWorld / notTheBees(225 豁免)分支未接
//  - PlaceTile(138) 式失败语义不可复现处均按"落块成功"处理(生成期轨道巷已掏空)
//  - KillTile 的 404 化石连锁(AttemptFossilShattering 邻格掷+递归杀)/58 地狱
//    岩浆支/419 逻辑门/TruncatesWalls 族同 killTileGen 先例不移植(轨道巷不可达)
// 帧链与击杀链(AAAAA 批 1:1):巷道 KillTile = 尘掷+击杀+SquareTileFrame;
//  铺轨逐列 WorldUtils.TileFrame(frameNeighbors:true) 上扫 8 格(cs:150-153)
//  + 末列收尾 playerHeight 格(cs:154-160)+ 压板支 PlaceTile 尾部
//  SquareTileFrame(cs:60297)——复用 FinalCleanupPass 引擎(314 格自分派
//  frameTrack,引擎无 case 314 支)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { genSquareTileFrame, genTileFrame } from './FinalCleanupPass';
import { TRACK_TILE, frameTrack } from '../../MinecartTrack';

/** type → vanilla sheet(FinalCleanupPass.SWEEP_SHEET 同构;私有不可导出) */
const SHEET_OF = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

// ============================================================
// KillTile 尘掷表(RRRR 批 2026-08-19 实测定谳,与 FinalCleanupPass 同源;
// killTileGen 私有不可导出——全表复刻。轨道巷语境 404 化石连锁/58 地狱岩浆/
// 419 逻辑门/TruncatesWalls 族不可达,同 killTileGen 先例不移植)
// ============================================================
/** KillTile_GetTileDustAmount(cs:66654,fail=false 档) */
function killTileDustAmount(sheet: number, fx: number): number {
  if (sheet === 654 || sheet === 630 || sheet === 631) return 0;
  if (sheet === 125 || sheet === 138 || sheet === 172 || sheet === 287
    || (sheet >= 300 && sheet <= 308) || sheet === 354 || sheet === 355
    || (sheet >= 373 && sheet <= 376) || sheet === 461 || sheet === 484 || sheet === 499
    || sheet === 564 || sheet === 565 || sheet === 593 || sheet === 594 || sheet === 617
    || sheet === 664 || sheet === 665 || sheet === 699 || sheet === 709
    || (sheet >= 711 && sheet <= 716)) return 0;
  if (sheet === 231) return 6;
  if (sheet >= 481 && sheet <= 483) return 3;
  if (sheet === 541) return 1;
  if (sheet === 549) return 2;
  if (sheet === 534 || sheet === 536 || sheet === 539 || sheet === 625 || sheet === 627) return 5;
  if (sheet === 184) return Math.floor(fx / 22) >= 5 ? 5 : 10;
  return 10;
}
/** MakeTileDust 每调的 genRand 掷(cs:66744+,RRRR 实测表) */
const FURNITURE_DUST = new Set([
  358, 359, 360, 361, 362, 363, 364, 275, 276, 277, 278, 279, 280, 281, 282, 285, 286,
  288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 316, 317, 318, 298, 299, 309, 310,
  339, 538, 413, 414, 505, 521, 522, 523, 524, 525, 526, 527, 532, 543, 544, 550, 551,
  533, 553, 554, 555, 556, 558, 559, 542, 391, 392, 393, 394, 568, 569, 570, 582, 580,
  598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 620,
  629, 632, 640, 643, 644, 645, 710,
]);
function makeTileDustRoll(rng: RNG, sheet: number, fx: number): void {
  switch (sheet) {
    case 2: case 477: case 27: case 243: case 244: case 204: case 478:
    case 641: case 370: case 171:
      rng.nextInt(2);
      return;
    case 26: case 695:
      if (fx < 54) rng.nextInt(2);
      return;
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      rng.nextInt(10);
      return;
    case 633:
      rng.nextInt(6);
      return;
    case 634:
      rng.nextInt(10);
      rng.nextInt(12);
      return;
    case 238:
      rng.nextInt(3);
      return;
    case 385:
      rng.nextIntRange(68, 71);
      return;
    case 254:
      if (fx < 72) rng.nextInt(3);
      else if (fx < 108) rng.nextInt(2);
      else rng.nextInt(4);
      return;
    default:
      if (FURNITURE_DUST.has(sheet)) rng.nextInt(3);
  }
}

/** TrackGenerator.InvalidWalls(TrackGenerator.cs:44-48) */
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);
/** TrackGenerator.InvalidTiles(cs:50-56) */
const INVALID_TILES = idsByVanillaSheet(
  383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219,
  484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314);
/** TileID.Sets.GeneralPlacementTiles = false 全集(TileID.cs:311,default true) */
const PLACEMENT_BLOCKED = idsByVanillaSheet(
  225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639,
  138, 664, 711, 712, 713, 714, 715, 716);
/** KillTile 豁免格(cs:111 `type != 379`)与压板探测(cs:107 `type == 135`) */
const BUBBLE = idsByVanillaSheet(379);
const PLATE = idsByVanillaSheet(135);
/** WorldGen.shimmerSafetyDistance = 150(cs:4104);轨道用其半宽盒判断(cs:442) */
const SHIMMER_SAFETY = 150;

// TrackPlacementState
const AVAILABLE = 0, OBSTRUCTED = 1, INVALID = 2;
// TrackSlope / TrackMode
const UP = -1, STRAIGHT = 0, DOWN = 1;
const MODE_NORMAL = 0, MODE_TUNNEL = 1;

interface TrackHistory { x: number; y: number; slope: number; mode: number }

const HISTORY_SIZE = 4096;   // _history
const REWRITE_SIZE = 25;     // _rewriteHistory

/** 原版 SolidTile(i,j)(WorldGen.cs:70155):active && tileSolid && !tileSolidTop && !half && slope==0 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const d = TILE_DEFS[st.type[i]];
  // !inActive ≈ 未致动(生成期恒无致动位);tileSolidTop 近似 = platform
  return !!st.flags[i] && !!d?.solid && !d.platform && st.half[i] === 0 && st.slope[i] === 0;
}

export class TrackGenerator {
  private readonly st: TileStore;
  private readonly gs: GenState;
  private readonly hist: TrackHistory[] = new Array(HISTORY_SIZE);
  private readonly rewrite: TrackHistory[] = new Array(REWRITE_SIZE);
  private xDir = 0;
  private len = 0;
  /** playerHeight 是实例字段(cs:66)——长短两段共用一个实例时跨 Place 残留,保持 1:1 */
  private playerHeight = 6;
  /** 全图已存在轨道格数(构造时扫一遍 + PlacePath 累加)。
   *  为 0 时 IsTileNearby 恒 false——语义等价的纯加速 */
  private trackCount = 0;
  /** 轨道格空间索引(64×64 桶):IsTileNearby 的 61×61 全扫替代。
   *  findPath 期间地图只读,索引跨 Place 调用按 placePath 落块增量维护,结果恒等 */
  private readonly trackBuckets = new Map<number, number[]>();
  /** CalculateStateForLocation 结果缓存(单次 Place 内有效——findPath 期地图只读) */
  private readonly stateCache = new Map<number, number>();

  constructor(st: TileStore, gs: GenState) {
    this.st = st;
    this.gs = gs;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === TRACK_TILE) this.addTrackCell(x, y);
      }
    }
  }

  private addTrackCell(x: number, y: number): void {
    this.trackCount++;
    const key = this.bucketKey(x, y);
    const list = this.trackBuckets.get(key);
    if (list) list.push(this.packCell(x, y));
    else this.trackBuckets.set(key, [this.packCell(x, y)]);
  }

  private packCell(x: number, y: number): number {
    return (x << 14) | y;   // y < 16384(世界高上限 2400)
  }

  private bucketKey(x: number, y: number): number {
    return ((y >> 6) << 16) | (x >> 6);
  }

  /** TrackGenerator.Place(cs:68-81) */
  place(originX: number, originY: number, minLength: number, maxLength: number, rng: RNG): boolean {
    this.stateCache.clear();   // 地图在上一 Place 的 placePath 中被写穿,缓存按次失效
    const origin = this.findSuitableOrigin(originX, originY);
    if (!origin) return false;
    this.createTrackStart(origin.x, origin.y);
    if (!this.findPath(minLength, maxLength)) return false;
    this.placePath(rng);
    return true;
  }

  /** FindSuitableOrigin(cs:382-395):向下找 Obstructed(地表),其上一格须 Available */
  private findSuitableOrigin(ox: number, oy: number): { x: number; y: number } | null {
    let x = ox, y = oy;
    let state = this.stateAt(x, y);
    while (state !== OBSTRUCTED) {
      y++;
      if (state === INVALID) return null;
      if (y >= this.st.h - 1) return null; // 安全护栏(原版越界由 Main.tile null 吸收)
      state = this.stateAt(x, y);
    }
    y--;
    return this.stateAt(x, y) === AVAILABLE ? { x, y } : null;
  }

  /** CreateTrackStart(cs:164-172) */
  private createTrackStart(x: number, y: number): void {
    this.xDir = x <= this.st.w / 2 ? 1 : -1;
    this.len = 1;
    for (let i = 0; i < HISTORY_SIZE; i++) {
      this.hist[i] = { x: x + i * this.xDir, y: y + i, slope: DOWN, mode: MODE_NORMAL };
    }
  }

  /** FindPath(cs:174-209) */
  private findPath(minLength: number, maxLength: number): boolean {
    let length = this.len;
    while (this.len < HISTORY_SIZE - 100) {
      const slope = this.hist[this.len - 1].slope !== UP ? DOWN : STRAIGHT;
      this.appendToHistory(slope);
      const state = this.tryRewriteHistoryToAvoidTiles();
      if (state === INVALID) break;
      length = this.len;
      let state2 = state;
      while (state2 !== AVAILABLE) {
        state2 = this.createTunnel();
        if (state2 === INVALID) break;
        length = this.len;
      }
      if (this.len >= maxLength) break;
    }
    this.len = Math.min(maxLength, length);
    if (this.len < minLength) return false;
    this.smoothTrack();
    return this.segmentState(0, this.len) !== INVALID;
  }

  /** CreateTunnel(cs:211-255) */
  private createTunnel(): number {
    let slope = STRAIGHT;
    let num = 10;
    let result = INVALID;
    const x = this.hist[this.len - 1].x;
    const y = this.hist[this.len - 1].y;
    for (let s2 = UP; s2 <= DOWN; s2++) {
      let last = INVALID;
      for (let i = 1; i < num; i++) {
        last = this.stateAt(x + i * this.xDir, y + i * s2);
        if (last === OBSTRUCTED) continue;
        // Available:记录该斜坡为当前最优;Invalid:只终止扫描不记录(cs:222-237)
        if (last === AVAILABLE) { slope = s2; num = i; result = last; }
        break;
      }
      if (result !== AVAILABLE && last === OBSTRUCTED && (result !== OBSTRUCTED || slope !== STRAIGHT)) {
        slope = s2; num = 10; result = last;
      }
    }
    if (this.len === 0 || !canSlopesTouch(this.hist[this.len - 1].slope, slope)) {
      this.rewriteSlope(this.len - 1, STRAIGHT);
    }
    this.hist[this.len - 1].mode = MODE_TUNNEL;
    for (let j = 1; j < num; j++) this.appendToHistory(slope, MODE_TUNNEL);
    return result;
  }

  /** AppendToHistory(cs:257-262) */
  private appendToHistory(slope: number, mode = MODE_NORMAL): void {
    this.hist[this.len] = {
      x: this.hist[this.len - 1].x + this.xDir,
      y: this.hist[this.len - 1].y + slope,
      slope, mode,
    };
    this.len++;
  }

  /** TryRewriteHistoryToAvoidTiles(cs:264-307)。
   *  注意 C# TrackHistory 是 struct(值语义),快照/回填必须深拷贝 */
  private tryRewriteHistoryToAvoidTiles(): number {
    const start = this.len - 1;
    const size = Math.min(this.len, REWRITE_SIZE);
    for (let i = 0; i < size; i++) this.rewrite[i] = { ...this.hist[start - i] };
    let num = start;
    while (num >= this.len - size) {
      if (this.hist[num].slope === DOWN) {
        const state = this.segmentState(num, this.len - num);
        if (state === AVAILABLE) return state;
        this.rewriteSlope(num, STRAIGHT);
      }
      num--;
    }
    if (this.segmentState(num + 1, this.len - (num + 1)) === AVAILABLE) return AVAILABLE;
    for (let m = this.len - 1; m >= this.len - size + 1; m--) {
      if (this.hist[m].slope === STRAIGHT) {
        const state = this.segmentState(this.len - size, size);
        if (state === AVAILABLE) return state;
        this.rewriteSlope(m, UP);
      }
    }
    for (let j = 0; j < size; j++) this.hist[this.len - 1 - j] = { ...this.rewrite[j] };
    this.rewriteSlope(this.len - 1, STRAIGHT);
    return this.segmentState(num + 1, this.len - (num + 1));
  }

  /** RewriteSlopeDirection(cs:309-317) */
  private rewriteSlope(index: number, slope: number): void {
    const delta = slope - this.hist[index].slope;
    this.hist[index].slope = slope;
    for (let i = index; i < this.len; i++) this.hist[i].y += delta;
  }

  /** GetHistorySegmentPlacementState(cs:319-338) */
  private segmentState(startIndex: number, length: number): number {
    let result = AVAILABLE;
    for (let i = startIndex; i < startIndex + length; i++) {
      const state = this.stateAt(this.hist[i].x, this.hist[i].y);
      if (state === INVALID) return INVALID;
      if (state === OBSTRUCTED && this.hist[i].mode !== MODE_TUNNEL) result = OBSTRUCTED;
    }
    return result;
  }

  /** SmoothTrack(cs:340-371) */
  private smoothTrack(): void {
    let anchor = this.len - 1;
    let flag = false;
    for (let i = this.len - 1; i >= 0; i--) {
      if (flag) {
        anchor = Math.min(i + 15, anchor);
        if (this.hist[i].y >= this.hist[anchor].y) {
          for (let k = i + 1; this.hist[k].y > this.hist[i].y; k++) {
            this.hist[k].y = this.hist[i].y;
            this.hist[k].slope = STRAIGHT;
          }
          if (this.hist[i].y === this.hist[anchor].y) flag = false;
        }
      } else if (this.hist[i].y > this.hist[anchor].y) flag = true;
      else anchor = i;
    }
  }

  /** PlacePath(cs:83-162):清轨巷 + 铺 314 + 帧链(AAAAA 批 1:1 镜像) */
  private placePath(rng: RNG): void {
    const st = this.st;
    const pressure = new Uint8Array(this.len);
    // 第一遍:清轨巷(cs:85-116)
    for (let i = 0; i < this.len; i++) {
      if (rng.int(0, 6) === 0) this.playerHeight = rng.int(5, 8);   // Next(7) / Next(5,9)
      const th = this.hist[i];
      for (let j = 0; j < this.playerHeight; j++) {
        for (let dy = -1; dy <= 1; dy++) {                            // wall 244 清除(cs:95-106)
          const yy = th.y - j + dy;
          if (st.inBounds(th.x, yy) && st.wall[st.idx(th.x, yy)] === 244) st.wall[st.idx(th.x, yy)] = 0;
        }
        if (!st.inBounds(th.x, th.y - j)) continue;
        const idx = st.idx(th.x, th.y - j);
        if (st.flags[idx] && PLATE.has(st.type[idx])) pressure[i] = 1;
        // KillTile(noItem)——379 泡泡豁免(cs:111-114)
        if (!BUBBLE.has(st.type[idx])) this.killTileLane(rng, th.x, th.y - j);
      }
    }
    // 第二遍:铺轨 + 帧链(cs:117-161)
    for (let k = 0; k < this.len; k++) {
      if (rng.int(0, 6) === 0) this.playerHeight = rng.int(5, 8);
      const th = this.hist[k];
      if (!st.inBounds(th.x, th.y)) continue;
      const idx = st.idx(th.x, th.y);
      const wireBits = st.wire[idx] & 15;   // 四色线暂存(cs:129-132)
      // Tile.SmoothSlope(x, y+1) / (x, y-playerHeight) 省略(RNG 零掷,见文件头注)
      if (pressure[k] && k > 0
        && this.hist[k - 1].y === th.y && this.hist[k + 1].y === th.y) {
        // ClearEverything(cs:135):type/wall/liquid/headers/帧全清(墙漆随墙清)
        st.setWallSilent(th.x, th.y, 0);
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        st.wire[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; st.paint[idx] = 0;
        // PlaceTile(314, forced, style 1)(cs:136)= Minecart.PlaceTrack:
        // active/type=314/frameY=-1/frameX=_firstPressureFrame(=20)+ 尾部
        // SquareTileFrame 九宫(cs:60297;TruncatesWalls[314]=false 无墙帧,零掷)
        st.setTileSilent(th.x, th.y, TRACK_TILE, 20, 0xFFFF);
        this.squareTileFrame314(rng, th.x, th.y);
      } else {
        // ResetToType(314)(cs:140):liquid=0、headers=32(线/致动/坡/半砖清、墙保留)、帧 0/0
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        st.wire[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; st.paint[idx] = 0;
        st.setTileSilent(th.x, th.y, TRACK_TILE, 0, 0);
      }
      st.wire[idx] = wireBits;             // 四色线精确还原,致动位不还原(cs:142-145)
      this.addTrackCell(th.x, th.y);       // IsTileNearby 索引同步(帧链只读 st,时点无关)
      if (k === 0) continue;               // cs:146-149
      for (let l = 0; l < 8; l++) {        // cs:150-153:列 k-1 上扫 8 格(含 l=0 轨道格)
        this.wuTileFrame(rng, this.hist[k - 1].x, this.hist[k - 1].y - l);
      }
      if (k === this.len - 1) {            // cs:154-160:末列收尾(本次迭代重掷后的 playerHeight)
        for (let m = 0; m < this.playerHeight; m++) {
          this.wuTileFrame(rng, th.x, th.y - m);
        }
      }
    }
  }

  /** 生成期 KillTile(cs:63559,fail=false 档)——轨道巷版:尘埃掷(cs:63747-51)
   *  + 击杀写 + 尾部 SquareTileFrame(cs:63967)。!active 早退零掷零帧(cs:63575)。
   *  帧引擎(genSquareTileFrame)九宫在循环一遍内不可达 314(轨迹未铺,IsTileNearby
   *  30 格隔离),无需 314 分派 */
  private killTileLane(rng: RNG, x: number, y: number): void {
    const st = this.st;
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    if (!st.flags[i]) return;
    const sheet = SHEET_OF[st.type[i]!];
    if (sheet < 0) return;
    const fx = st.frameX[i]!;
    const dust = killTileDustAmount(sheet, fx);
    for (let k = 0; k < dust; k++) makeTileDustRoll(rng, sheet, fx);
    st.setTileSilent(x, y, 0);
    genSquareTileFrame(st, rng, x, y);
  }

  /** WorldUtils.TileFrame(x, y, frameNeighbors:true)(WorldUtils.cs:79-89):
   *  中心+四邻五连 resetFrame=true,固定序 中心→+x→-x→+y→-y */
  private wuTileFrame(rng: RNG, x: number, y: number): void {
    this.tf314(rng, x, y);
    this.tf314(rng, x + 1, y);
    this.tf314(rng, x - 1, y);
    this.tf314(rng, x, y + 1);
    this.tf314(rng, x, y - 1);
  }

  /** WorldGen.SquareTileFrame + 314 分派(cs:80924/60297)。九宫由引擎
   *  (genSquareTileFrame,中心 resetFrame=true)处理非轨道格;引擎无 case 314 支
   *  (dispatch 落非实心非藤 no-op),九宫内的轨道格(本格+坡向对角/横邻)在此补
   *  frameTrack。两子系统零交叉(引擎读写非 314 格/frameTrack 只读写 314 格帧与
   *  314 存在掩码),先后序与 vanilla 交织序语义等价 */
  private squareTileFrame314(rng: RNG, x: number, y: number): void {
    genSquareTileFrame(this.st, rng, x, y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) this.tf314TrackOnly(x + dx, y + dy);
      }
    }
    this.tf314TrackOnly(x, y);
  }

  /** WorldGen.TileFrame(i, j, resetFrame:true) 单格(cs:82067)——314 自分派 */
  private tf314(rng: RNG, x: number, y: number): void {
    const st = this.st;
    if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;   // cs:82070 边距 5 早退
    const i = st.idx(x, y);
    if (st.flags[i] && st.type[i] === TRACK_TILE) {
      frameTrack(st, x, y);            // case 314(cs:86033)——FrameTrack,RNG 零掷
      return;
    }
    genTileFrame(st, rng, x, y);       // 其余全族(184 苔藓 Next(3) 掷等)
  }

  /** 同上但仅轨道格(九宫补帧用) */
  private tf314TrackOnly(x: number, y: number): void {
    const st = this.st;
    if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;
    const i = st.idx(x, y);
    if (st.flags[i] && st.type[i] === TRACK_TILE) frameTrack(st, x, y);
  }

  /** CalculateStateForLocation(cs:397-425)。
   *  带单次 Place 内的结果缓存(findPath 期地图只读,重写扫描高度重复) */
  private stateAt(x: number, y: number): number {
    const key = (x << 14) | y;
    const cached = this.stateCache.get(key);
    if (cached !== undefined) return cached;
    const state = this.calcState(x, y);
    this.stateCache.set(key, state);
    return state;
  }

  private calcState(x: number, y: number): number {
    for (let i = 0; i < 6; i++) {
      if (this.isLocationInvalid(x, y - i)) return INVALID;
    }
    const st = this.st;
    for (let j = 0; j < 6; j++) {
      if (!st.inBounds(x, y + j)) return INVALID;
      const idx = st.idx(x, y + j);
      if (st.flags[idx] && st.type[idx] === TRACK_TILE) return INVALID;
    }
    for (let k = 0; k < 6; k++) {
      if (solidTile(st, x, y - k)) return OBSTRUCTED;
    }
    if (this.isTrackNearby(x, y, 30)) return INVALID;
    return AVAILABLE;
  }

  /** WorldGen.IsTileNearby(x, y, 314, 30)(WorldGen.cs:8828)。
   *  61×61 全扫 → 64×64 桶索引(桶 ≥ 查询盒,最多 2×2 桶),布尔结果恒等 */
  private isTrackNearby(x: number, y: number, distance: number): boolean {
    if (this.trackCount === 0) return false;
    const x0 = x - distance, x1 = x + distance;
    const y0 = y - distance, y1 = y + distance;
    const gx0 = x0 >> 6, gx1 = x1 >> 6;
    const gy0 = y0 >> 6, gy1 = y1 >> 6;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.trackBuckets.get((gy << 16) | gx);
        if (!list) continue;
        for (const cell of list) {
          const cx = cell >> 14, cy = cell & 0x3fff;
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) return true;
        }
      }
    }
    return false;
  }

  /** IsLocationInvalid(cs:436-478) */
  private isLocationInvalid(x: number, y: number): boolean {
    const st = this.st;
    const gs = this.gs;
    // y > UnderworldLayer(h-200) / 边距 5 / 地表以上(cs:438)
    if (y > st.h - 200 || x < 5 || y < Math.floor(gs.worldSurface) || x > st.w - 5) return true;
    // 微光安全盒(shimmerSafetyDistance/2 = 75,cs:442-445)
    if (gs.shimmerX >= 0 && Math.abs(x - gs.shimmerX) < SHIMMER_SAFETY / 2
      && Math.abs(y - gs.shimmerY) < SHIMMER_SAFETY / 2) return true;
    // oceanDepths(cs:446-448):y ≤ oceanLevel 且在海滩带
    const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    if (y <= oceanLevel && (x < gs.beachDistance || x > st.w - gs.beachDistance)) return true;
    // dualDungeons 分支未接(无 DungeonUtils)
    const idx = st.inBounds(x, y) ? st.idx(x, y) : -1;
    if (idx >= 0 && INVALID_WALLS.has(st.wall[idx])) return true;
    if (idx >= 0 && st.flags[idx] && INVALID_TILES.has(st.type[idx])) return true;
    // 邻列 general placement 屏蔽(cs:470-476)
    for (let k = -1; k <= 1; k++) {
      if (!st.inBounds(x + k, y)) return true;
      const nidx = st.idx(x + k, y);
      if (st.flags[nidx] && st.type[nidx] !== TRACK_TILE && PLACEMENT_BLOCKED.has(st.type[nidx])) return true;
    }
    return false;
  }
}

/** CanSlopesTouch(cs:373-380) */
function canSlopesTouch(left: number, right: number): boolean {
  if (left !== right && left !== STRAIGHT) return right === STRAIGHT;
  return true;
}
