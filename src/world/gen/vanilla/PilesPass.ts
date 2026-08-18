// 原版 pass 81 "Piles"（1456 WorldGen.cs:18900-19599）1:1——七个子段全量移植。
// ① w*0.06 洞穴堆（cs:18924）② w*0.01 深层堆（cs:19049）③ w*0.03 地表堆（cs:19118）
// ④ w*0.0035 地表带墙堆（cs:19184）⑤ w*0.6 全洞穴 185 小堆（cs:19261）
// ⑥ w*0.02 地表 185 小堆（cs:19411）⑦ w*0.15 地表墙 2/40 小堆（cs:19472）
// （审计清单只列了 5 段——实读原版为 7 段，progress 权重 num=7 亦印证，全量移植。）
// 重试预算 GetPileGenerationAttempts()=w/2（cs:23873）；每段"成功即止"（flag）。
// 采样域 [25,w-25]；tile 187 装饰组链（多数群系走 187，186 仅默认/地牢/冰/蘑菇草）；
// 全部群系样式链逐 if 抄（非互斥、后命中覆盖、命中才掷）；小堆 scatter 掷骰
// Next(1,5)×Next(-10,11)×Next(5)×Next(12,36)。
// pass 头 tileSolid 覆写（cs:18906-18916）：379/229/190/196/189/717-719/202/460/484
// 期间置非实心（已迁移 GenSolid 统一翻转,pass 尾 cs:19591-19599 还原,见 runPilesPass）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { flipGenSolid, genSolidType } from './GenSolid';

const PILE185 = TILE_BY_KEY['v_185_small_decos']!;
const PILE186 = TILE_BY_KEY['v_186_decos_3x2']!;
const PILE187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;

// 内部 tile id → 原版 sheet id 查找表（模块级一次构建）
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** Main.wallDungeon（墙 7/8/9/94-99） */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** Main.tileDungeon（tile 41/43/44/677-679，按 sheet id 存放） */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** Main.tileMoss（Main.cs:6956-6996，按 sheet id 存放） */
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
/** TileID.Sets.Boulders（TileID.cs:195）——PlaceSmallPile 的 InvalidTile 门 */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);

/** 原版 `Main.tile[x,y].type ==` 直读（不查 active——击杀/放置失败后的残值 type
 *  仍会命中上游 flag 判定，cs:18989/19103/19177/19254） */
const rawSheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  return SHEET[st.type[st.idx(x, y)]] ?? -1;
};
const activeAt = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
/** 活性格的 sheet id（非 active 返回 -1）——原版 Main.tile[x,y].type 直比的 sheet 化 */
const sheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  const i = st.idx(x, y);
  return st.flags[i] ? SHEET[st.type[i]] : -1;
};

/** SolidTile2（cs:46862）：active && tileSolid && slope==0 && !halfBrick && !inActive。
 *  ★tileSolid 走 GenSolid：pass 头覆写（cs:18906-18916,runPilesPass 接线）把
 *  379/229/190/196/189/717-719/202/460/484 置非实心——原 PASS_NON_SOLID 局部表
 *  已迁移统一（仓库数据 v_189/v_196 等仍 solid:true,placePile3x2 会把堆锚在
 *  浮空岛云块(189)/荧光菇块(196)等装饰块上,原版这些格在 pass 期间不参与锚定） */
const solidTile2 = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  // cs:70186：active && tileSolid && slope==0 && !halfBrick && !inActive
  // （★IIII 批补 !inActive——SolidTile2 含致动位；Dome 致动柱在表面段可达）
  return !!d && genSolidType(st.type[i]) && st.slope[i] === 0 && !st.half[i]
    && ((st.wire[i]! >>> 5) & 1) === 0;
};

/** SolidTileAllowBottomSlope（cs:70211-70235）：active && (tileSolid||tileSolidTop)
 *  && !halfBrick && !顶坡（slope1/2 拒、底坡 3/4 放行）。tileSolid 走 GenSolid
 *  （同上,pass 头覆写生效）。
 *  PlaceTile 的 186/187 锚定门（cs:49284/49300）——placePile3x2 的地面判定 */
const solidTileAllowBottomSlope = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(genSolidType(st.type[i]) || d.platform)) return false;
  if (st.half[i]) return false;
  const sl = st.slope[i];
  return !(sl >= 1 && sl <= 2);
};

/** PlaceSmallPile（cs:46831）1:1：size0=1×1（fx=style*18, fy=0）；size1=2×1（fx=style*36, fy=18）。
 *  anyLava 拒绝；type==185 时下方 Boulders 拒绝（InvalidTileForPilesOrSpeleothems）。 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap?.(x, y, 185, pileStyle, pileSize, 1);
  const i = st.idx(x, y);
  if (st.liquid[i] > 0 && st.liquidType[i] === 2) return false;
  if (pileSize === 1) {
    if (!solidTile2(st, x, y + 1) || !solidTile2(st, x + 1, y + 1)) return false;
    if (activeAt(st, x, y) || activeAt(st, x + 1, y)) return false;
    if (BOULDERS.has(sheetAt(st, x, y + 1)) || BOULDERS.has(sheetAt(st, x + 1, y + 1))) return false;
    const fx = pileStyle * 36;
    st.setTileSilent(x, y, PILE185, fx, 18);
    st.setTileSilent(x + 1, y, PILE185, fx + 18, 18);
    return true;
  }
  if (!solidTile2(st, x, y + 1) || activeAt(st, x, y)) return false;
  st.setTileSilent(x, y, PILE185, pileStyle * 18, 0);
  return true;
}

/** InvalidTileForPilesOrSpeleothems（cs:39005）：active && TileID.Sets.Boulders。
 *  （InWorld(x,y,2) 越界 → false=放行） */
const invalidPiles = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && BOULDERS.has(SHEET[st.type[i]] ?? -1);
};

/** TileID.Sets 家族（Check3x2 186/187 样式门用；TileID.cs:24-34/287） */
const SET_SNOW = new Set([147]);
const SET_ICE = new Set([161, 163, 164, 200]);
const SET_MUD = new Set([59]);
const SET_SAND = new Set([53, 112, 116, 234]);
const SET_HARDENED_SAND = new Set([397, 398, 402, 399]);
const SET_SANDSTONE = new Set([396, 400, 403, 401]);

/** PlaceTile(186/187) → Place3x2(i,j,type,style)（cs:60018 case 路由 + cs:52097-52235）
 *  + 尾随 SquareTileFrame(i,j)→TileFrame→Check3x2（cs:49199-49869）整链。
 *  ★IIII 批（2026-08-18）修正三件：
 *  ① 几何 = **中心锚**（列 x-1..x+1 × 行 y-1..y，frameX 基 54*style 按列 +0/+18/+36，
 *    顶行 frameY=0 底行 18）——曾左对齐 x..x+2 整体右移一列（#77 首差 (2761,95)
 *    T0>186/T186>0 对称位移族根因）；
 *  ② 锚定 = SolidTile2（cs:70178：active && 生成期 tileSolid && slope==0 && !half
 *    && !inActive）+ InvalidTileForPilesOrSpeleothems（cs:52149：186/187 底座
 *    Boulders 拒）——曾用 SolidTileAllowBottomSlope（那是 Check3x2 的复核谓词，
 *    放宽了底坡/平台，错源=把 cs:49284/49300 误当放置门）；
 *  ③ Check3x2 样式族门复核。OOOO 批重写击杀链（探针实证 5339/5339 击杀格 type=0）：
 *    - 门谓词曾 `type===186/187` 比内部 id 恒假 → 整链死代码（残 1227 主根因）；
 *    - KillTile **清 type**（cs:63965——IIII"不清 type"系误读 cs:63935 为 type 行；
 *      击杀后 `rawSheetAt==186||187` 命中判定失败 → 该 attempt 不算命中 → 预算
 *      续耗重试——掷流结构随之对齐）；
 *    - KillTile 尾 SquareTileFrame（cs:63967）= 3×3 非活跃格清 half/slope/paint
 *      （TileFrame 头 cs:82077；活格 186/187 邻 → Check3x2 因 destroyObject 早退）；
 *    - Check3x2 尾 destroyObject=false + **5×5 TileFrame 扫**（cs:49856-49862）：
 *      非活跃清坡；活格 186/187 → 递归复核可**连杀相邻堆**（35 例实测）。
 *    样式族门：186 styles 26-31 须 Snow∪Ice∪{162,224}、32-34 须 Mud∪{70}；
 *    187 styles 0-5 须 Mud∪{60,226}、6-8 须 {57,58,75,76}、29-34 须
 *    Sand∪HardenedSand∪Sandstone（cs:49317-49365——**404 沙漠化石不在族内**，
 *    vanilla 对 404 地基 187 自放置自击杀，首例 (2701,413)）。
 *    KillTile 尘掷/物品：生成期 noItem 全跳（零掷）。 */
let __destroyObj = false;
/** TileFrame 头（cs:82077-82082）非活跃清 + case 186/187 → Check3x2 递归（OOOO） */
function __pileFrameCell(st: TileStore, cx: number, cy: number): void {
  if (cx <= 5 || cy <= 5 || cx >= st.w - 5 || cy >= st.h - 5) return;   // TileFrame 边界早退（cs:82069）
  const i = st.idx(cx, cy);
  if (!st.flags[i]) { st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0; return; }
  const s = SHEET[st.type[i]];
  if (s === 186 || s === 187) __pileCheck3x2(st, cx, cy, s);
  // 其他 frameImportant 族的重帧不在 Piles 语境仿真（备案）
}
/** Check3x2（cs:49190-49868）：样式族门 → destroyObject 击杀链 → 5×5 扫 */
function __pileCheck3x2(st: TileStore, cx: number, cy: number, sheet: number): void {
  if (__destroyObj) return;                                             // cs:49193 早退
  const i = st.idx(cx, cy);
  const style = Math.floor(st.frameX[i]! / 54);                         // cs:49208-49215 num6
  const y0 = cy - ((st.frameY[i]! % 36) / 18 | 0);                      // num（布局恒新写对齐）
  let bad = false;
  for (let c = cx - 1; c <= cx + 1; c++) {
    if (!solidTileAllowBottomSlope(st, c, y0 + 2) || invalidPiles(st, c, y0 + 2)) { bad = true; continue; }
    const b = sheetAt(st, c, y0 + 2);
    if (b < 0) continue;
    if (sheet === 186) {
      if (style >= 26 && style <= 31 && !SET_SNOW.has(b) && !SET_ICE.has(b) && b !== 162 && b !== 224) bad = true;
      else if (style >= 32 && style <= 34 && !SET_MUD.has(b) && b !== 70) bad = true;
    } else if (sheet === 187) {
      if (style <= 5 && !SET_MUD.has(b) && b !== 60 && b !== 226) bad = true;
      else if (style >= 6 && style <= 8 && b !== 57 && b !== 58 && b !== 75 && b !== 76) bad = true;
      else if (style >= 29 && style <= 34
        && !SET_SAND.has(b) && !SET_HARDENED_SAND.has(b) && !SET_SANDSTONE.has(b)) bad = true;
    }
  }
  if (!bad) return;
  __destroyObj = true;                                                  // cs:49421
  for (let c = cx - 1; c <= cx + 1; c++) {
    for (let r = y0; r <= y0 + 1; r++) {
      const k = st.idx(c, r);
      if (st.flags[k] && SHEET[st.type[k]] === sheet) {
        // KillTile（cs:63933-63967）：失活+清半砖/帧/油漆/**type=0**（cs:63965）+
        // 尾 SquareTileFrame = 3×3 非活跃格清 half/slope/paint（活格 186/187 邻的
        // Check3x2 因 destroyObj 早退=无连杀）
        st.flags[k] = 0; st.half[k] = 0; st.slope[k] = 0;
        st.frameX[k] = 0; st.frameY[k] = 0; st.paint[k] = 0; st.type[k] = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nxc = c + dx, nyc = r + dy;
            if (nxc <= 5 || nyc <= 5 || nxc >= st.w - 5 || nyc >= st.h - 5) continue;
            const ni = st.idx(nxc, nyc);
            if (!st.flags[ni]) { st.half[ni] = 0; st.slope[ni] = 0; st.paint[ni] = 0; }
          }
        }
      }
    }
  }
  __destroyObj = false;                                                 // cs:49856
  for (let c = cx - 2; c <= cx + 2; c++) {
    for (let r = y0 - 1; r <= y0 + 3; r++) __pileFrameCell(st, c, r);   // cs:49857-49862 5×5 扫
  }
}

function placePile3x2(st: TileStore, x: number, y: number, type: number, style: number): boolean {
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap?.(x, y, SHEET[type] ?? -1, style, 0, 0);
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;   // cs:52102 边距门
  // ★OOOO：vanilla 的 type 比较全在 sheet 空间（186/187），本函数形参 type 是内部 id
  //  （PILE186=150/PILE187=145）——曾直接 `type === 186/187` 恒假，InvalidTile 门与
  //  Check3x2 样式族击杀链整段死代码（#77 残 1227/1270 主根因；首例 = 沙漠化石 404
  //  地基 187-style32，vanilla Check3x2 沙族不含 404 → 击杀，JS 保留）
  const sheet = SHEET[type] ?? -1;
  const isPile = sheet === 186 || sheet === 187;
  let ok = true;
  for (let c = x - 1; c <= x + 1; c++) {
    for (let r = y - 1; r <= y; r++) {
      const i = st.idx(c, r);
      if (st.flags[i]) ok = false;                                     // 占用净空（cs:52117）
    }
    if (isPile && invalidPiles(st, c, y + 1)) ok = false;              // cs:52141+52149
    if (!solidTile2(st, c, y + 1)) ok = false;                         // cs:52156
  }
  if (!ok) return false;
  const base = style * 54;
  for (let c = x - 1; c <= x + 1; c++) {
    for (let r = y - 1; r <= y; r++) {
      const i = st.idx(c, r);
      st.type[i] = type; st.flags[i] = 1;
      st.frameX[i] = base + (c - (x - 1)) * 18;
      st.frameY[i] = r === y - 1 ? 0 : 18;
      // 原版 Place3x2 只写 active/frameX/frameY/type（cs:52200-52234）——不清坡/半砖/液体
    }
  }
  // 尾随 SquareTileFrame(i,j)（cs:60026+cs:60281 两次，效果合并）：中心 → Check3x2
  __pileCheck3x2(st, x, y, sheet);
  // 3×3 非活跃格清（两帧调用的 TileFrame 头并集；活格侧 Check3x2 已覆盖）
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nxc = x + dx, nyc = y + dy;
      if (nxc <= 5 || nyc <= 5 || nxc >= st.w - 5 || nyc >= st.h - 5) continue;
      const ni = st.idx(nxc, nyc);
      if (!st.flags[ni]) { st.half[ni] = 0; st.slope[ni] = 0; st.paint[ni] = 0; }
    }
  }
  return true;
}

/** Piles pass 主体（cs:18900-19599） */
export function runPilesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:18906-18916,逐条 1:1）：379/229/190/196/189/
  //   717/718/719/202/460/484 全部置非实心——原 PASS_NON_SOLID 局部表迁移至此。
  //   （cs:18919 SetBoulderSolidity(false) 在 noTrapsWorldGen 门内,普通种子不触发,备案）
  flipGenSolid([379, 229, 190, 196, 189, 717, 718, 719, 202, 460, 484], false);
  const w = st.w, h = st.h;
  const ws = Math.floor(gs.worldSurface);
  /** GetPileGenerationAttempts（cs:23873）：w/2（skyblock ÷10 分支不触发） */
  const attempts = (): number => Math.floor(w / 2);
  /** oceanDepths（cs:10979）：y > oceanLevel=(ws+rl)/2+40 直接 false */
  const ocean = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > w - gs.beachDistance;
  };
  const shimmerAt = (x: number, y: number): boolean => {
    const i = st.idx(x, y);
    return st.liquid[i] > 0 && st.liquidType[i] === 4;
  };
  /** 原版空 for 下落：到 (x,y+1) 变 active 为止（上界 h-5） */
  const dropTo = (x: number, y: number): number => {
    let j = y;
    while (!st.flags[st.idx(x, j + 1)] && j < h - 5) j++;
    return j;
  };
  /** 小堆 scatter（cs:18996-19010 同型四处）：Next(1,5)×Next(-10,11)×Next(5)×Next(12,36) */
  const scatter = (x: number, y: number): void => {
    const n = rng.int(1, 4);
    for (let k = 0; k < n; k++) {
      const sx = x + rng.int(-10, 10);
      const sy0 = y - rng.int(0, 4);
      if (!st.flags[st.idx(sx, sy0)]) {
        const sy = dropTo(sx, sy0);
        placeSmallPile(st, sx, sy, rng.int(12, 35), 0);
      }
    }
  };
  const pick = (type: number): number => (type === 186 ? PILE186 : PILE187);

  // ===== ① 洞穴堆（cs:18924-19044）：w*0.06 =====
  {
    const total = w * 0.06;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);          // Next(25, w-25)
        let y = rng.int(ws, h - 301);         // Next((int)worldSurface, h-300)
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(ws, h - 301); }
        if (!st.flags[st.idx(x, y)]) {
          let type = 186;
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(0, 21);       // Next(22)
            if (style >= 16 && style <= 22) style = rng.int(0, 21);
            if ((below === 0 || below === 1 || TILE_MOSS.has(below)) && rng.int(0, 4) === 0) {
              style = rng.int(23, 28);        // Next(23,29)
              type = 187;
            }
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19 || below === 25 || below === 203) {
              style = rng.int(0, 6);          // Next(7)
              type = 186;
            }
            if (below === 147 || below === 161 || below === 162) { style = rng.int(26, 31); type = 186; }
            if (below === 60) { type = 187; style = rng.int(0, 5); }
            if ((below === 57 || below === 58) && rng.int(0, 2) < 2) { type = 187; style = rng.int(6, 8); }
            if (below === 226) { type = 187; style = rng.int(18, 22); }
            if (below === 70) { style = rng.int(32, 34); type = 186; }
            if (below === 396 || below === 397 || below === 404) { style = rng.int(29, 34); type = 187; }
            if (below === 368) { style = rng.int(35, 40); type = 187; }
            if (below === 367) { style = rng.int(41, 46); type = 187; }
            if (type === 186 && style >= 7 && style <= 15 && rng.int(0, 74) === 0) { type = 187; style = 17; }
            if (WALL_DUNGEON.has(wall) && rng.int(0, 2) !== 0) {
              flag = true;                    // 地牢墙 2/3 直接视为命中
            } else {
              if (!shimmerAt(x, y)) placePile3x2(st, x, y, pick(type), style);
              // cs:18989：残值 type==186||187 即命中（shimmer 拒置后残值同样可命中）
              if (rawSheetAt(st, x, y) === 186 || rawSheetAt(st, x, y) === 187) flag = true;
              if (flag && type === 186 && style <= 7) scatter(x, y);
            }
          }
        }
      }
    }
  }

  // ===== ② 深层堆（cs:19049-19116）：w*0.01，y∈[h-300,h-10) =====
  {
    const total = w * 0.01;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        const x = rng.int(25, w - 26);
        let y = rng.int(h - 300, h - 11);     // Next(h-300, h-10)
        if (!st.flags[st.idx(x, y)]) {
          let type = 186;
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(0, 21);
            if (style >= 16 && style <= 22) style = rng.int(0, 21);
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19) style = rng.int(0, 6);
            if ((below === 57 || below === 58) && rng.int(0, 2) < 2) { type = 187; style = rng.int(6, 8); }
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            placePile3x2(st, x, y, pick(type), style);
            if (rawSheetAt(st, x, y) === 186 || rawSheetAt(st, x, y) === 187) flag = true;  // cs:19103
            if (flag && type === 186 && style <= 7) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ③ 地表堆（cs:19118-19182）：w*0.03 =====
  {
    const total = w * 0.03;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let type = 186;
        let x = rng.int(25, w - 26);
        let y = rng.int(10, ws - 1);          // Next(10, (int)worldSurface)
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(10, ws - 1); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(7, 12);       // Next(7,13)
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || below === 25 || below === 204 || below === 234 || below === 112
              || TILE_DUNGEON.has(below)) style = -1;
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            if (below === 53) { type = 187; style = rng.int(52, 54); }
            if (below === 2 || (activeAt(st, x - 1, y + 1) && sheetAt(st, x - 1, y + 1) === 2)
              || (activeAt(st, x + 1, y + 1) && sheetAt(st, x + 1, y + 1) === 2)) { type = 187; style = rng.int(14, 16); }
            if (below === 151 || below === 274) { type = 186; style = rng.int(0, 6); }
            if (style >= 0) placePile3x2(st, x, y, pick(type), style);
            if (rawSheetAt(st, x, y) === type) flag = true;   // cs:19177：残值 type == num23
          }
        }
      }
    }
  }

  // ===== ④ 地表带墙堆（cs:19184-19259）：w*0.0035，起始格须有墙 =====
  {
    const total = w * 0.0035;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let type = 186;
        const x = rng.int(25, w - 26);
        let y = rng.int(10, ws - 1);
        if (!st.flags[st.idx(x, y)] && st.wall[st.idx(x, y)] > 0) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            let style = rng.int(7, 12);
            if (y > h - 300 || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || TILE_DUNGEON.has(below)) style = -1;
            if (below === 25) style = rng.int(0, 6);
            if (below === 147 || below === 161 || below === 162) style = rng.int(26, 31);
            if (below === 2 || (activeAt(st, x - 1, y + 1) && sheetAt(st, x - 1, y + 1) === 2)
              || (activeAt(st, x + 1, y + 1) && sheetAt(st, x + 1, y + 1) === 2)) { type = 187; style = rng.int(14, 16); }
            if (below === 151 || below === 274) { type = 186; style = rng.int(0, 6); }
            if (style >= 0) placePile3x2(st, x, y, pick(type), style);
            if (rawSheetAt(st, x, y) === type) flag = true;   // cs:19254
            if (flag && style <= 7) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ⑤ 全洞穴 185 小堆（cs:19261-19409）：w*0.6 =====
  {
    const total = w * 0.6;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);
        let y = rng.int(ws, h - 21);          // Next((int)worldSurface, h-20)
        if (st.wall[st.idx(x, y)] === 87 && rng.int(0, 1) === 0) {
          x = rng.int(25, w - 26);            // 神庙墙 1/2 重掷
          y = rng.int(ws, h - 21);
        }
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(ws, h - 21); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);       // Next(2)：0=大 1=小
            let style = rng.int(0, 35);       // Next(36)
            if (style >= 28 && style <= 35) style = rng.int(0, 35);
            if (size === 1) {
              style = rng.int(0, 24);         // Next(25)
              if (style >= 16 && style <= 24) style = rng.int(0, 24);
            }
            if (y > h - 300) {
              if (size === 0) style = rng.int(12, 27);   // Next(12,28)
              if (size === 1) style = rng.int(6, 15);    // Next(6,16)
            }
            if (WALL_DUNGEON.has(wall) || wall === 87 || below === 30 || below === 19 || below === 25 || below === 203) {
              if (size === 0 && style < 12) style += 12;
              if (size === 1 && style < 6) style += 6;
              if (size === 1 && style >= 17) style -= 10;
            }
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 77);   // Next(73,78)
              if (size === 1) style = rng.int(62, 64);   // Next(62,65)
            }
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);   // Next(12,19)
            }
            if (below === 368) {
              if (size === 0) style = rng.int(60, 65);   // Next(60,66)
              if (size === 1) style = rng.int(47, 52);   // Next(47,53)
            }
            if (below === 367) {
              if (size === 0) style = rng.int(66, 71);   // Next(66,72)
              if (size === 1) style = rng.int(53, 58);   // Next(53,59)
            }
            if (TILE_DUNGEON.has(below)) {
              flag = false;                   // tileDungeon 族落点恒不命中
            } else if (WALL_DUNGEON.has(wall) && rng.int(0, 2) !== 0) {
              flag = true;
            } else if (!shimmerAt(x, y)) {
              flag = placeSmallPile(st, x, y, style, size);
            }
            if (flag && size === 1 && style >= 6 && style <= 15) scatter(x, y);
          }
        }
      }
    }
  }

  // ===== ⑥ 地表 185 小堆（cs:19411-19470）：w*0.02 =====
  {
    const total = w * 0.02;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        let x = rng.int(25, w - 26);
        let y = rng.int(15, ws - 1);          // Next(15, (int)worldSurface)
        while (ocean(x, y)) { x = rng.int(25, w - 26); y = rng.int(15, ws - 1); }
        if (!st.flags[st.idx(x, y)]) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);
            let style = rng.int(0, 10);       // Next(11)
            if (size === 1) style = rng.int(0, 4);        // Next(5)
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 76);    // Next(73,77)
              if (size === 1) style = rng.int(62, 64);
            }
            if (below === 2 && size === 1) style = rng.int(38, 40);   // Next(38,41)
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);
            }
            const bad = WALL_DUNGEON.has(wall) || below === 30 || below === 19 || below === 41
              || below === 43 || below === 44 || below === 481 || below === 482 || below === 483
              || below === 45 || below === 46 || below === 47 || below === 175 || below === 176
              || below === 177 || below === 25 || below === 203 || TILE_DUNGEON.has(below);
            if (!bad) flag = placeSmallPile(st, x, y, style, size);
          }
        }
      }
    }
  }

  // ===== ⑦ 地表墙 2/40 小堆（cs:19472-19566）：w*0.15 =====
  {
    const total = w * 0.15;
    for (let i = 0; i < total; i++) {
      let budget = attempts();
      let flag = false;
      while (!flag && budget > 0) {
        budget--;
        const x = rng.int(25, w - 26);
        let y = rng.int(15, ws - 1);
        if (!st.flags[st.idx(x, y)] && (st.wall[st.idx(x, y)] === 2 || st.wall[st.idx(x, y)] === 40)) {
          y = dropTo(x, y);
          const wall = st.wall[st.idx(x, y)];
          const below = sheetAt(st, x, y + 1);
          if (below >= 0) {
            const size = rng.int(0, 1);
            let style = rng.int(0, 10);
            if (size === 1) style = rng.int(0, 4);
            if (below === 147 || below === 161 || below === 162) {
              if (size === 0 && style < 12) style += 36;
              if (size === 1 && style >= 20) style += 6;
              if (size === 1 && style < 6) style += 25;
            }
            if (st.liquid[st.idx(x, y)] <= 0 && (below === 53 || below === 397 || below === 396)) {
              if (size === 0) style = rng.int(73, 76);
              if (size === 1) style = rng.int(62, 64);
            }
            if (below === 2 && size === 1) style = rng.int(38, 40);
            if (below === 151 || below === 274) {
              if (size === 0) style = rng.int(12, 27);
              if (size === 1) style = rng.int(12, 18);
            }
            // cs:19583 门：`(liquid!=255 || type!=53 || wall!=0) && !wallDungeon && type!=30 && …`
            // ——水 255+沙 53+无墙（special）使首析取为假 → **整门为假 → 不放**。
            //  ★IIII 批勘误：曾把 special 写成"放行"（方向反了，JS 多放 T0>185 族）
            const specialFail = st.liquid[st.idx(x, y)] === 255 && below === 53 && wall === 0;
            const bad = specialFail || WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || below === 41 || below === 43 || below === 44 || below === 481 || below === 482
              || below === 483 || below === 45 || below === 46 || below === 47 || below === 175
              || below === 176 || below === 177 || below === 25 || below === 203 || TILE_DUNGEON.has(below);
            if (!bad) flag = placeSmallPile(st, x, y, style, size);
          }
        }
      }
    }
  }
  // ★pass 尾 tileSolid 还原族（cs:19591-19602,逐条 1:1）：190/192/196/189/717/
  //   718/719/202/225/460/379 回实心 + SetBoulderSolidity(true)（后者普通种子为
  //   冗余——巨石族生成期从未翻非实心）。★229 与 484 **不在**还原列：
  //   229 要等 BeeLarva 头（cs:21022）才回 true,484 生成期再无还原点。
  //   （192/225 头部未翻,此处的 true 写入对齐原版无条件还原语义）
  flipGenSolid([190, 192, 196, 189, 717, 718, 719, 202, 225, 460, 379], true);
}

