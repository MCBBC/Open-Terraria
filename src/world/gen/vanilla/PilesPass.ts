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
  return !!d && genSolidType(st.type[i]) && st.slope[i] === 0 && !st.half[i];
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

/** PlaceTile(186/187, style) 的 3×2 对象放置（Tiles_186/187 表 stride 54px）：
 *  占用 (x..x+2, y-1..y) 须净空；下方 3 列须实心（AnchorBottom 语义）。
 *  返回是否放置成功（原版 PlaceTile 后 type==186/187 才算命中）。 */
function placePile3x2(st: TileStore, x: number, y: number, type: number, style: number): boolean {
  for (let k = 0; k < 3; k++) {
    for (let l = -1; l <= 0; l++) {
      if (!st.inBounds(x + k, y + l) || st.flags[st.idx(x + k, y + l)]) return false;
    }
    // ★锚定门补齐：原版走 PlaceTile → SolidTileAllowBottomSlope（cs:49284/49300 →
    //   cs:70211）——active && (solid||platform) && !half && !顶坡。曾只查
    //   TILE_DEFS?.solid：半砖/顶坡格上照放（3×2 悬脚），且漏 pass 头非实心覆写
    if (!solidTileAllowBottomSlope(st, x + k, y + 1)) return false;
  }
  for (let k = 0; k < 3; k++) {
    for (let l = -1; l <= 0; l++) {
      st.setTileSilent(x + k, y + l, type, style * 54 + k * 18, (l + 1) * 18);
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
              let placed = false;
              if (!shimmerAt(x, y)) placed = placePile3x2(st, x, y, pick(type), style);
              if (placed) flag = true;
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
            const placed = placePile3x2(st, x, y, pick(type), style);
            if (placed) flag = true;
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
            const placed = style >= 0 ? placePile3x2(st, x, y, pick(type), style) : false;
            if (placed) flag = true;          // 原版：tile.type == num23 才命中
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
            const placed = style >= 0 ? placePile3x2(st, x, y, pick(type), style) : false;
            if (placed) flag = true;
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
            // cs:19560 特例：水 255 + 沙 53 + 无墙 → 放行（本分支前半为 ! 条件）
            const special = st.liquid[st.idx(x, y)] === 255 && below === 53 && wall === 0;
            const bad = (!special) && (WALL_DUNGEON.has(wall) || below === 30 || below === 19
              || below === 41 || below === 43 || below === 44 || below === 481 || below === 482
              || below === 483 || below === 45 || below === 46 || below === 47 || below === 175
              || below === 176 || below === 177 || below === 25 || below === 203 || TILE_DUNGEON.has(below));
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

/** 读档修复：零帧 187 石堆按地面群系回填样式（2026-08-17）。
 *  背景：旧版 finalize 净化器曾把合法多带样式（原版 wld 语义=存原始 fx，
 *  如沙地头骨堆样式 52-54 = fx 2808）按"越表"清零 → 存量世界 187 整族零帧，
 *  渲染端只能按样式 0（长草石堆）重建。本修复按 PilesPass 各分支的
 *  地面→样式表（WorldGen.cs:18924-19182）推断样式回填帧：
 *  原版掷骰区间取位置稳定散列（同档每次载入结果一致）；未知地面不动
 *  （渲染端零帧重建兜底）。幂等：已带帧格自动跳过。
 *  返回修复格数（Game 载入侧 markDirty + 打点用）。 */
export function repairZeroFramePileStyles(st: TileStore): number {
  const T187 = TILE_BY_KEY['v_187_decos_3x2_group_2'] ?? 0;
  if (!T187) return 0;
  const MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
  /** 地面 sheet → 样式区间（PilesPass ①③ 分支同源；cs:19158 沙=Next(52,55)） */
  const styleRange = (below: number): [number, number] | null => {
    if (below === 53) return [52, 54];        // 沙 → 头骨堆
    if (below === 2) return [14, 16];         // 草
    if (below === 60) return [0, 5];          // 丛林草
    if (below === 57 || below === 58) return [6, 8];
    if (below === 226) return [18, 22];       // 神庙砖
    if (below === 396 || below === 397 || below === 404) return [29, 34];
    if (below === 368) return [35, 40];       // 花岗岩
    if (below === 367) return [41, 46];       // 大理石
    if (below === 0 || below === 1 || MOSS.has(below)) return [23, 28];
    return null;
  };
  const sheetOf = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const zeroPile = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return st.type[i] === T187 && st.frameX[i] === 0 && st.frameY[i] === 0;
  };
  let fixed = 0;
  for (let y = 0; y < st.h - 2; y++) {
    for (let x = 0; x < st.w - 2; x++) {
      if (!zeroPile(x, y)) continue;
      // run 左上角（左/上无同型零帧格）——与渲染端零帧重建同口径按 3 宽切块
      if (zeroPile(x - 1, y) || zeroPile(x, y - 1)) continue;
      // 整组 3×2 须全同型且【全零帧】（残缺/带帧组不动）。
      // ★全零门是幂等关键：样式 0 组修复后左上格仍 (0,0)（style*54+0=0），
      // 只查锚点会每轮重修；全组校验后带帧组（其余格 18/36≠0）自动豁免
      let whole = true;
      for (let dx = 0; dx < 3 && whole; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const ii = st.idx(x + dx, y + dy);
          if (!st.flags[ii] || st.type[ii] !== T187
            || st.frameX[ii] !== 0 || st.frameY[ii] !== 0) { whole = false; break; }
        }
      }
      if (!whole) continue;
      // 地面 = 底行中列下一格
      const gi = st.idx(x + 1, y + 2);
      if (!st.flags[gi]) continue;
      const range = styleRange(sheetOf(st.type[gi]));
      if (!range) continue;
      const style = range[0] + ((x * 7 + y * 13) % (range[1] - range[0] + 1));
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const ii = st.idx(x + dx, y + dy);
          st.frameX[ii] = style * 54 + dx * 18;
          st.frameY[ii] = dy * 18;
          fixed++;
        }
      }
    }
  }
  return fixed;
}
