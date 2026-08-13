// 宝石系统世界生成（1.4.5.6 1:1）：
// - GemCaves 宝石洞（WorldGen.cs:17528-17572 选点 + gemCave :9657-9673 选池 +
//   Spread.Gem :3565-3651 BFS：**只沿无墙空气腔扩散**（有墙格不扩散——神庙/房屋
//   天然免疫），实心 Gemmable 自身+四邻 randGemTile（19:1 石:宝），无墙空气格
//   墙=48+池选、1/2 暴露晶簇；空气+有墙格原版在 if(tile.active()) 内才转——零操作零掷）
// - ExposedGems 暴露晶簇（冰系 :20842-20872 目标格自身为冰块 147/161/162/224，
//   先掷 4 个 Next(1,4) 窗口再掷 Next(12) style、逐行雪界 snowMinX/MaxX；
//   地下 :20874-20890 单格空气排除地牢墙/墙27；琥珀 :20891-20913 墙 187/216 不对称窗口）
// - SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282）：先钟乳石扫描
//   （地下 j∈[ws,h-20) 空格 1/5 → 上下邻石族清坡+PlaceTight；地表 k∈[5,ws)
//   冰上/沙上下 1/5 → PlaceTight），同列随后宝石树段（RNG 序：树掷在钟乳石掷之前）
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { growGemTree } from './TreePass';
import { placeTight } from './ShimmerPass';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;   // tile 178
const STONE = TILE_BY_KEY['stone']!;
/** Gemmable（WorldGen.cs:3762-3769）：0/1/40/59/60/70/147/161。
 *  ★0（泥土）也是 Gemmable：谓词 `type!=0&&type!=1&&…` 对 type==0 短路为假 →
 *  直接落到 return true——洞腔内泥土与石头同概率被 randGemTile 替换，曾漏 0 */
const GEMMABLE = idsByVanillaSheet(0, 1, 40, 59, 60, 70, 147, 161);
/** 冰系落脚（:20846）：雪砖/冰/薄冰/雪 147/161/162/224 */
const ICE_FLOOR = idsByVanillaSheet(147, 161, 162, 224);
/** countTiles 的 ice 计数只认 147/161（nextCount cs:9542：不含 162/224） */
const ICE_COUNT = idsByVanillaSheet(147, 161);
/** 宝石墙（WallID.cs:165-175）：AmethystUnsafe=48 … DiamondUnsafe=53（=48+序号）。
 *  序号 0-5 = 紫/黄/蓝/翠/红/钻（与 randGem/暴露晶簇 style 同序） */
const GEM_WALL_BASE = 48;
/** 宝石矿 tile 内部 id（序号同上） */
const GEM_TILES = ['gem_amethyst', 'gem_topaz', 'gem_sapphire', 'gem_emerald', 'gem_ruby', 'gem_diamond']
  .map((k) => TILE_BY_KEY[k]!);
/** 地牢墙（Main.wallDungeon）：7/8/9 + 94-99 */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** 内部 tile id → 原版 sheet id */
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 钟乳石清坡的"石族"（cs:22244-22265：1/147/161/25/203 + tileStone + tileMoss）。
 *  Main.tileStone（Main.cs:7378/7902-7922/…）只标 63-68/130/131/566 */
const STONE_FAMILY = new Set([1, 147, 161, 25, 203, 63, 64, 65, 66, 67, 68, 130, 131, 566]);
/** Main.tileMoss（按 sheet id） */
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);

/** 暴露晶簇 style（:20857-20859 的 Next(12) 映射：紫 3/黄 3/蓝 2/翠 2/红 1/钻 1） */
function randGemStyle(rng: RNG): number {
  const r = rng.nextInt(12);
  if (r < 3) return 0;
  if (r < 6) return 1;
  if (r < 8) return 2;
  if (r < 10) return 3;
  if (r < 11) return 4;
  return 5;
}

// ---- PlaceTile(178) 锚定链（:59717-59725 + CheckAndAdjust :60338 + ValidAnchor :60321）----
// 原版 PlaceTile 的 num==178 分支：CheckAndAdjustMultiDirectionalTile 通过才放置
// （frameY=Next(3)*18 仅在成功时掷）——锚 = 四邻存在可贴的实心格。此前无条件直放 =
// 4763 vs 金标 816（5.8×）、悬空 774 vs 0（2026-08-12 用户标注"四处散布的宝石"）。
/** TileID.Sets.Boulders + type==10 门（:60324：巨石/门不可作锚） */
const ANCHOR_BANNED = idsByVanillaSheet(10, 138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** type==380 特例（SolidTileAllowTopSlope cs:70325 的 type==380 旁路） */
const TYPE_380 = idsByVanillaSheet(380);

/** PlatformProperTopFrame（cs:70197-70209）：平台 frameX/PlatformFrameWidth()
 *  ∈[0,7]∪[12,16]∪[25,26] 视为"顶帧"。PlatformFrameWidth()=_data[19].
 *  CoordinateFullWidth（TileObjectData.cs:5112）=(16+2)×1=18——Tiles_19.png
 *  486px=27 帧×18px 实证。 */
function platformProperTopFrame(frameX: number): boolean {
  const n = Math.floor(frameX / 18);
  return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
}

/** ValidAnchorForMultiDirectionalTile（:60321）：dir 0=上锚 1=下锚 2=左锚 3=右锚。
 *  生成期无 inActive；slope 原版编码（Tile.cs:320-350）：topSlope()=1|2、
 *  bottomSlope()=3|4——旧注释"1/2=底坡 3/4=顶坡"整体写反（代码同病，已一并纠正）；
 *  leftSlope()=2|4、rightSlope()=1|3（仓库原本即对）。 */
function validAnchor(st: TileStore, x: number, y: number, dir: 0 | 1 | 2 | 3): boolean {
  if (!st.inBounds(x, y)) return true; // Main.tile 索引器 null 防御 → true（随后 tileSolid 门拦截）
  const i = st.idx(x, y);
  const t = st.type[i];
  if (ANCHOR_BANNED.has(t)) return false;
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[t];
  if (!d) return false;
  const solid = d.solid, platform = d.platform;
  const half = st.half[i] === 1, sl = st.slope[i];
  // ★G1：topSlope/bottomSlope 原来整体写反（旧 3|4/1|2）——Tile.cs:320-350 实为
  //   topSlope()=1|2、bottomSlope()=3|4，方向基带随之纠正
  const topSlope = sl === 1 || sl === 2, bottomSlope = sl === 3 || sl === 4;
  const leftSlope = sl === 2 || sl === 4, rightSlope = sl === 1 || sl === 3;
  if (dir === 0) {
    // SolidTileAllowTopSlope（cs:70325）：(tileSolid||380) && ((!平台&&!底坡)||(平台&&半砖))
    return (solid || TYPE_380.has(t)) && ((!platform && !bottomSlope) || (platform && half));
  }
  if (dir === 1) {
    // SolidTileAllowBottomSlope（cs:70211-70229）：(tileSolid||tileSolidTop近似平台) &&
    //  (!topSlope || (平台 && PlatformProperTopFrame(frameX))) && !半砖 && !inActive。
    //  ★G7：平台顶帧豁免曾缺失（只写 !topSlope 一刀切）——平台带顶坡时，frameX
    //  落在顶帧段仍可作下锚（cs:70223）
    return (solid || platform)
      && (!topSlope || (platform && platformProperTopFrame(st.frameX[i]))) && !half;
  }
  if (dir === 2) {
    // SolidTileAllowLeftSlope：tileSolid && !半砖 && !右坡 && !平台
    return solid && !half && !rightSlope && !platform;
  }
  // dir 3：SolidTileAllowRightSlope 镜像
  return solid && !half && !leftSlope && !platform;
}

/** CheckAndAdjustMultiDirectionalTile（:60338）：下>左>右>上优先，锚类型须 tileSolid&&!tileSolidTop。
 *  返回 newFrameDirection（0=下 1=上 2=左 3=右）——PlaceTile 178 分支本身丢弃它，
 *  但紧随的 SquareTileFrame → TileFrame case 178（:85844-85882）按它重写
 *  frameY = 方向基带 + 变体（基带 下0/上54/左108/右162）★此前漏移植 TileFrame 178
 *  → 全部 178 永远落地帧（0/18/36），侧锚/顶锚宝石渲染成悬空晶簇 */
function checkMultiDirAnchor(st: TileStore, i: number, j: number): number {
  const belowOk = validAnchor(st, i, j + 1, 1);
  const leftOk = validAnchor(st, i - 1, j, 2);
  const rightOk = validAnchor(st, i + 1, j, 3);
  const aboveOk = validAnchor(st, i, j - 1, 0);
  const solidNonTop = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    const d = TILE_DEFS[st.type[k]];
    return !!d && d.solid && !d.platform;
  };
  if (belowOk && solidNonTop(i, j + 1)) return 0;
  if (leftOk && solidNonTop(i - 1, j)) return 2;
  if (rightOk && solidNonTop(i + 1, j)) return 3;
  if (aboveOk && solidNonTop(i, j - 1)) return 1;
  return -1;
}

/** 方向基带（TileFrame case 178 :85844-85882 的 num22 switch） */
const GEM_DIR_BASE: Record<number, number> = { 0: 0, 1: 54, 2: 108, 3: 162 };

/** 放 1 格暴露晶簇（= PlaceTile 178 分支 + SquareTileFrame→TileFrameImportant case 178
 *  合并，掷骰序 1:1）：
 *  ① PlaceTile（cs:59717-59725）：CheckAndAdjust 通过才放置（失败不放置不掷骰），
 *     frameX=style*18、frameY=Next(3)*18（roll1）；
 *  ② SquareTileFrame(cs:80924)→TileFrame(i,j,resetFrame=true)：178 是 tileFrameImportant
 *     （Main.cs:7362）→ TileFrameImportant case 178（cs:85843-85882）**无条件**再掷
 *     num21=Next(3)*18（roll2；resetFrame=true 恒走 genRand 分支）。roll1∈{0,18,36}
 *     恒落在 dir0 带宽 [0,36] → num22=-1 保留 roll1；dir1/2/3 基带错位 → 覆写为
 *     基带+roll2。★G3：此前只掷 1 骰，每颗宝石少掷 1 骰，全链 RNG 流分叉。
 *  邻域 8 格 TileFrame(resetFrame=false)：num21=frameY%54 无掷骰，且 178 非实心、
 *  不改变邻格锚定 → 不存在"邻域触发的第三掷"（cs:85844-85880 判定结论，免补）。 */
function placeExposed(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  const dir = checkMultiDirAnchor(st, x, y);
  if (dir < 0) return;                       // CheckAndAdjust 失败：不放置、不掷骰
  const roll1 = rng.nextInt(3) * 18;         // ① cs:59724
  st.setTile(x, y, EXPOSED, style * 18, roll1);
  const roll2 = rng.nextInt(3) * 18;         // ② cs:85855（resetFrame=true 无条件掷）
  if (dir !== 0) st.frameY[st.idx(x, y)] = GEM_DIR_BASE[dir] + roll2; // num22 基带覆写
}

// ============ GemCaves 宝石洞（:17528-17572 + gemCave + Spread.Gem 1:1） ============
/** WorldGen.SolidTile（cs:70155-70172）1:1：active && tileSolid && !tileSolidTop &&
 *  !halfBrick && slope==0 && !inActive（生成期 inActive 恒 false，wire bit32 免检）。
 *  写法同源 CaveWallsPass.solidAt（去其 pass 头 tileSolid 覆写表——本文件无覆写）。
 *  ★G4：旧 SOLID_LUT 只查 def.solid，丢 half/slope/solidTop——且 half/slope 是逐格
 *  状态、本就不可按 id 预计算；Spread.Gem(:3597)/countTiles(:9584) 均回归逐格判定 */
function solidTileAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;       // Main.tile 索引器 null → true（SolidTile catch 语义）
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d) return false;
  return !!d.solid && !d.platform && st.half[i] === 0 && st.slope[i] === 0;
}

export function runGemCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 裸 double 比较（cs:17534：`for i < w*0.003`）——不取整，12.6 也进 13 次
  const num = st.w * 0.003;
  // nextCount（WorldGen.cs:9506-9581）：洪泛连通空气腔；wall!=0 即封顶；lavaOk=false
  // 时岩浆格 lavaCount++ 且立即封顶（含空气格岩浆）；ice 只认 147/161
  // ★零风险优化(2026-08-13):原 Set<number>+元组数组 → 平坦 Int32Array 栈 +
  // Uint8Array seen(visited 列表局部清除)。push 四邻顺序与 pop 语义逐点保持
  // (DFS 下邻优先),掷骰/判定序列不变。
  const seenArr = new Uint8Array(st.w * st.h);
  const visited: number[] = [];
  const stackX = new Int32Array(4096);
  const stackY = new Int32Array(4096);
  const countTiles = (sx: number, sy: number): { air: number; lava: number; ice: number; rock: number } => {
    let air = 0, lava = 0, ice = 0, rock = 0;
    let sp = 0;
    stackX[sp] = sx; stackY[sp] = sy; sp++;
    while (sp > 0) {
      if (air >= 300) break;                                  // numTileCount >= maxTileCount(300)
      sp--;
      const x = stackX[sp], y = stackY[sp];
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      const ii = st.idx(x, y);
      if (seenArr[ii]) continue;
      seenArr[ii] = 1;
      visited.push(ii);
      if (st.wall[ii] === 244) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.SHIMMER) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.wall[ii] !== 0) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };                  // jungle=false
      }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) {
        lava++;
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.flags[ii]) { // 实心：只计数不扩散
        if (ICE_COUNT.has(st.type[ii])) ice++;
        else if (st.type[ii] === STONE) rock++;
      }
      if (!solidTileAt(st, x, y)) {           // cs:9584 !SolidTile(x,y) → 计数+扩散
        air++;
        // 四邻入栈(与原 push 顺序一致,pop 取尾 = 下邻先访)。
        // 栈深上界 = 4×300(air≤300,超即 break,仅 air 格入栈)+1 < 4096,无需增长
        stackX[sp] = x - 1; stackY[sp] = y; sp++;
        stackX[sp] = x + 1; stackY[sp] = y; sp++;
        stackX[sp] = x; stackY[sp] = y - 1; sp++;
        stackX[sp] = x; stackY[sp] = y + 1; sp++;
      }
    }
    for (const v of visited) seenArr[v] = 0;
    visited.length = 0;
    return { air, lava, ice, rock };
  };
  for (let i = 0; i < num; i++) {
    // 选点（:17547-17565）：x∈[200,w-200)、y∈[rockLevel+30, h-230)、
    // countTiles∈[50,300) 且 lavaCount==0 && iceCount==0 && rockCount>0（1000 次上限）
    let sx = -1, sy = -1;
    for (let tries = 0; tries < 1000; tries++) {
      const x = rng.nextIntRange(200, st.w - 200);
      const y = rng.nextIntRange(gs.rockLevel + 30, st.h - 230);
      const c = countTiles(x, y);
      if (c.air >= 50 && c.air < 300 && c.lava === 0 && c.ice === 0 && c.rock > 0) { sx = x; sy = y; break; }
    }
    if (sx < 0) continue;
    // 选池（gemCave :9657-9673）：强制 1 种 + 各 1/6 追加（1~7 种）
    const gemOn = new Set<number>([rng.nextInt(6)]);
    for (let k = 0; k < 6; k++) if (rng.nextInt(6) === 0) gemOn.add(k);
    const randGem = () => { let n = rng.nextInt(6); while (!gemOn.has(n)) n = rng.nextInt(6); return n; };
    // randGemTile（:9685-9700）：19/20 石头，1/20 池内宝石
    const randGemTileId = () => (rng.nextInt(20) !== 0 ? STONE : GEM_TILES[randGem()]);
    // Spread.Gem（:3565-3651）1:1 BFS：
    //  实心格（或有墙空气格）→ 不扩散；仅 active 且 Gemmable 时自身+四邻转 randGemTile
    //  （空气+有墙格：if(tile.active()) 内零操作零掷，cs:3599-3619）；
    //  无墙空气格 → 墙 48+池选、1/2 暴露晶簇、四邻入队（神庙/房屋墙阻隔，天然不侵入）
    const seen = new Set<number>();
    let frontier: Array<[number, number]> = [[sx, sy]];
    while (frontier.length) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) continue;
        const ii = st.idx(x, y);
        if (seen.has(ii)) continue;
        seen.add(ii);
        if (solidTileAt(st, x, y) || st.wall[ii] !== 0) { // cs:3597 SolidTile||wall!=0
          if (!st.flags[ii]) continue;                    // 空气+有墙：零操作零掷
          if (GEMMABLE.has(st.type[ii])) st.type[ii] = randGemTileId();
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (!st.inBounds(nx, ny)) continue;
            const ni = st.idx(nx, ny);
            if (st.flags[ni] && GEMMABLE.has(st.type[ni])) st.type[ni] = randGemTileId();
          }
        } else {
          st.wall[ii] = GEM_WALL_BASE + randGem();
          // cs:3604：放置前另有 !tile.active() 门（&& 左求值，active 时不掷骰）——
          // 分支谓词改 SolidTile 后，半砖/坡/平台等 active 非实心格也会落到本分支，
          // 此门不可省（否则会覆盖活性格）
          if (!st.flags[ii] && rng.nextInt(2) === 0) placeExposed(st, rng, x, y, randGem());
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const ni = st.idx(x + dx, y + dy);
            if (!seen.has(ni)) next.push([x + dx, y + dy]);
          }
        }
      }
      frontier = next;
    }
  }
}

// ============ ExposedGems 暴露晶簇（:20842-20913） ============
export function runExposedGemsPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 冰系（:20842-20872）：y∈[(ws+rl)/2, lavaLine)、x=逐行雪界 snowMinX/MaxX[y]；
  // 目标格自身为冰块（147/161/162/224）→ 先掷 4 个 Next(1,4) 窗口再掷 Next(12) style
  // （cs:20855-20859 掷序），周边不对称窗口的空气格放晶簇
  for (let i = 0; i < st.w * 0.25; i++) {
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.lavaLine);
    if (y < 0 || y >= st.h) continue;
    const minX = gs.snowMinX?.[y] ?? gs.snowOriginLeft;
    const maxX = gs.snowMaxX?.[y] ?? gs.snowOriginRight;
    // cs:20851：x 掷骰**无条件**（snowMinX/MaxX 只填到 lavaLine-140，未填带读默认 0
    // 仍掷，Next(0,0)=0）——旧 `maxX<=minX continue` 吞掉必掷一骰，RNG 流分叉
    const x = rng.nextIntRange(minX, maxX);
    const ii = st.idx(x, y);
    if (!st.flags[ii] || !ICE_FLOOR.has(st.type[ii])) continue;
    const wl = 1 + rng.nextInt(3);
    const wr = 1 + rng.nextInt(3);
    const wt = 1 + rng.nextInt(3);
    const wb = 1 + rng.nextInt(3);
    const style = randGemStyle(rng);
    for (let jx = x - wl; jx < x + wr; jx++) {
      for (let jy = y - wt; jy < y + wb; jy++) {
        if (jx < 40 || jx >= st.w - 40 || jy < 40 || jy >= st.h - 40) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, style);
      }
    }
  }
  // 地下（:20874-20890）：w 次，x∈[20,w-20)、y∈[rockLevel, h-300)，空气+无岩浆+
  // 非地牢墙且墙≠27 → 单格（style=Next(12) 权重）
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.rockLevel, st.h - 300);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) continue; // anyLava（+1 编码）
    const wl = st.wall[ii];
    if (wl === 27 || WALL_DUNGEON.has(wl)) continue;
    placeExposed(st, rng, x, y, randGemStyle(rng));
  }
  // 琥珀（:20891-20913）：w 次，y∈[ws, h-300)，目标须空气+无岩浆+墙 187/216 →
  // 不对称窗口（各 1-3）的空气格放 style=6 晶簇。
  // 目标的 !active+!anyLava 门（cs:20901）曾缺失——实心沙岩也带 187/216 墙，
  // 命中率高一个数量级 → 琥珀簇 13× 金标（2026-08-12 用户标注）。
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.worldSurface, st.h - 300);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) continue; // anyLava（+1 编码，勿写 0）
    const wl = st.wall[ii];
    if (wl !== 187 && wl !== 216) continue;
    const n14 = () => 1 + rng.nextInt(3);
    const al = n14(), ar = n14(), at = n14(), ab = n14();
    for (let jx = x - al; jx < x + ar; jx++) {
      for (let jy = y - at; jy < y + ab; jy++) {
        if (!st.inBounds(jx, jy)) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, 6);
      }
    }
  }
}

// ============ SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282） ============
export function runGemTreesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const f = gs.seedFlags ?? {};
  const alwaysTry = !!(f.tenthAnniversary || f.drunkWorld);
  const oceanDepths = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > st.w - gs.beachDistance;
  };
  const sheetActive = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  const rockFamily = (s: number): boolean =>
    STONE_FAMILY.has(s) || TILE_MOSS.has(s);
  for (let x = 20; x < st.w - 20; x++) {
    for (let y = Math.floor(gs.worldSurface); y < st.h - 20; y++) {
      // 宝石树段（:22208-22237）：掷骰在液体判定之前（短路与求值序 1:1）
      const treeRoll = alwaysTry ? true : rng.nextInt(5) === 0;
      if (treeRoll && st.liquid[st.idx(x, y - 1)] === 0) {
        const treeType = idsByVanillaSheet(583 + rng.nextInt(7)).values().next().value ?? 0;
        if (treeType) growGemTree(st, rng, x, y, treeType);
      }
      // 地下钟乳石（:22239-22262）：非海洋、空格、1/5 → 上下邻石族清坡 + PlaceTight
      if (!oceanDepths(x, y) && !st.flags[st.idx(x, y)] && rng.nextInt(5) === 0) {
        const above = sheetActive(x, y - 1), below = sheetActive(x, y + 1);
        if (rockFamily(above) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y + 1)]) {
          st.slope[st.idx(x, y - 1)] = 0;
        }
        if (rockFamily(below) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 1)]) {
          st.slope[st.idx(x, y + 1)] = 0;
        }
        placeTight(st, rng, x, y);
      }
    }
    // 地表钟乳石（:22264-22278）：k∈[5, worldSurface)；冰上 147/161、沙 25/203 上/下
    for (let k = 5; k < gs.worldSurface; k++) {
      const up = sheetActive(x, k - 1), down = sheetActive(x, k + 1);
      const clearAbove = () => {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k + 1)]) st.slope[st.idx(x, k - 1)] = 0;
      };
      if ((up === 147 || up === 161) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTight(st, rng, x, k);
      }
      if ((up === 25 || up === 203) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTight(st, rng, x, k);
      }
      if ((down === 25 || down === 203) && rng.nextInt(5) === 0) {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k - 1)]) st.slope[st.idx(x, k + 1)] = 0;
        placeTight(st, rng, x, k);
      }
    }
  }
}

