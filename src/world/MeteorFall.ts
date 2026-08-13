// 陨石坠落 1:1（WorldGen.dropMeteor :6196-6316 + WorldGen.meteor :6318-6508）。
//   调度（HandleMeteorFall Main.cs:64948-64981：原始 time>16200——夜=午夜后 /
//   昼=上午 9 点后均可消费）。落点搜索（X 离出生点 ≥ 8% 图宽；30×30 打分：
//   实心+1 / 云块−100 / 液体−1，阈值 600 每低分 −0.5 下限 100；保护中止不衰减）；
//   保护（玩家盒 = 玩家中心 ±1022/±639px 即 NPC.sWidth/2+safeRangeX 复合 2044×1278 /
//   NPC hitbox / 宝箱{21,467}+地牢砖{41,43,44}+特殊块{26,226,470,475,488,597}）；
//   生成（tile 37 五层独立循环：主体 17-22（实心转 37/非实心挖空）/ 空腔 8-13
//   / 清理环 25-34（GetsDestroyedForMeteors 清除+清液+浮空 37 修剪）/ 散布×2）；
//   上限（地表以上 37 块 > 400×图宽/4200 → 拒绝）。
//   ★本文件为纯数据操作（setTileSilent 直写）——调用方负责 chunk markDirtyArea。
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import type { TileStore } from './TileStore';

export interface MeteorHost {
  w: number; h: number;
  spawnX: number; groundLevel: number; rockLevel: number;
  store: TileStore;
  /** 活跃玩家盒（保护判定）；空数组 = 无人（原版无玩家直接 return false） */
  players: Array<{ x: number; y: number; w: number; h: number }>;
  /** 活跃 NPC 盒（城镇 NPC + 敌怪，原版 Main.npc 全量） */
  npcs: Array<{ x: number; y: number; w: number; h: number }>;
  /** 随机源 */
  rand: () => number;
  /** 区间整数随机（闭区间 [a,b]） */
  int: (a: number, b: number) => number;
  /** 落成回调（公告/音效用，i/j = 落点 tile） */
  announce: (i: number, j: number) => void;
}

const METEOR_TILE = () => TILE_BY_KEY['ore_meteorite'] ?? -1;
/** Next(a,b) 左闭右开 → 闭区间 [a, b-1] */
const next = (h: MeteorHost, a: number, b: number) => h.int(a, b - 1);

/** TileID.Sets.Clouds（TileID.cs:197）+ dropMeteor 特例 202（:6295-6296） */
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719, 202]);
/** GetsDestroyedForMeteors（TileID.cs:165）：树 5/荆棘 32,352/宝石树 583-589/
 *  596,616,634 树族——清理环内 KillTile（stopDrops=true 不掉落） */
const DESTROY_SHEETS = new Set([5, 32, 352, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
/** 保护块：BasicChest{21,467} + tileDungeon 砖{41,43,44} + meteor 开关表
 *  （:6357-6376：祭坛 26/226/模特 470/帽架 475/假人 488/597） */
//  2026-08-13 补 677(Main.cs:7944 tileDungeon 第四成员——远古蓝砖,审计补缺)
const PROTECTED_SHEETS = new Set([21, 467, 41, 43, 44, 677, 26, 226, 470, 475, 488, 597]);

const isSolidSheet = (st: TileStore, idx: number): boolean => {
  const d = TILE_DEFS[st.type[idx]];
  return !!d && d.solid;
};

/** 陨石上限（:6224-6241：地表以上 37 块数 > 400×w/4200 → 拒绝） */
function meteorCountAtSurface(h: MeteorHost): number {
  const st = h.store;
  const type = METEOR_TILE();
  let n = 0;
  for (let y = 5; y < h.groundLevel; y++) {
    for (let x = 5; x < h.w - 5; x++) {
      if (st.type[st.idx(x, y)] === type) n++;
    }
  }
  return n;
}

/** 单候选保护判定（WorldGen.meteor :6328-6376）：70×70 tile 矩形 + 玩家/NPC 盒。
 *  玩家保护区 = 玩家中心 ±(sWidth/2+safeRangeX)=±1022 / ±(sHeight/2+safeRangeY)=±639
 *  px 的 2044×1278 盒（NPC.cs:6695/6697/6090/6092）——陨石不得落在玩家附近屏内 */
function protectedAt(h: MeteorHost, i: number, j: number): boolean {
  const st = h.store;
  const R = 35;
  const rx0 = (i - R) * TILE, rx1 = (i + R) * TILE;
  const ry0 = (j - R) * TILE, ry1 = (j + R) * TILE;
  for (const p of h.players) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (cx - 1022 < rx1 && cx + 1022 > rx0 && cy - 639 < ry1 && cy + 639 > ry0) return true;
  }
  for (const n of h.npcs) {
    if (n.x + n.w > rx0 && n.x < rx1 && n.y + n.h > ry0 && n.y < ry1) return true;
  }
  for (let y = j - R; y <= j + R; y++) {
    for (let x = i - R; x <= i + R; x++) {
      if (!st.inBounds(x, y)) continue;
      const d = TILE_DEFS[st.type[st.idx(x, y)]];
      if (d?.vanilla?.sheet !== undefined && PROTECTED_SHEETS.has(d.vanilla.sheet)) return true;
    }
  }
  return false;
}

/** 陨石落点生成（WorldGen.meteor :6381-6508 五层独立循环——顺序有语义：
 *  空腔在主体之后雕刻、清理环修剪浮空矿；合并单遍会致空腔失效,勿回改） */
function placeMeteor(h: MeteorHost, i: number, j: number): void {
  const st = h.store;
  const type = METEOR_TILE();
  const dist = (x: number, y: number) => Math.sqrt((x - i) * (x - i) + (y - j) * (y - j));
  const set = (x: number, y: number, t: number) => {
    st.setTileSilent(x, y, t, 0, 0);
    st.half[st.idx(x, y)] = 0;   // ClearSlope 语义（setTileSilent 非零不清坡面）
    st.slope[st.idx(x, y)] = 0;
  };
  // ① 主体（:6381-6404）：r1*0.9±4；非实心 → 挖空（原版 active=false），
  //    实心 → 转 37。顶部削平：行 > j + Next(-2,2) - 5
  let r = next(h, 17, 23);
  for (let y = j - r; y < j + r; y++) {
    for (let x = i - r; x < i + r; x++) {
      if (!st.inBounds(x, y)) continue;
      if (y <= j + next(h, -2, 3) - 5) continue;
      if (dist(x, y) >= r * 0.9 + next(h, -4, 5)) continue;
      const idx = st.idx(x, y);
      set(x, y, isSolidSheet(st, idx) ? type : 0);
    }
  }
  // ② 空腔（:6405-6420）：r2*0.8±3，主体内部再挖空
  r = next(h, 8, 14);
  for (let y = j - r; y < j + r; y++) {
    for (let x = i - r; x < i + r; x++) {
      if (!st.inBounds(x, y)) continue;
      if (y <= j + next(h, -2, 3) - 4) continue;
      if (dist(x, y) >= r * 0.8 + next(h, -3, 4)) continue;
      set(x, y, 0);
    }
  }
  // ③ 清理环（:6421-6450）：r3*0.7 内——毁灭表 KillTile（不掉落）+ 清液体 +
  //    浮空 37 修剪（四邻无实心 → 挖）+ 半砖/上坡无支撑 → 挖
  r = next(h, 25, 35);
  for (let y = j - r; y < j + r; y++) {
    for (let x = i - r; x < i + r; x++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (dist(x, y) < r * 0.7) {
        const d = TILE_DEFS[st.type[idx]];
        if (st.flags[idx] && d?.vanilla?.sheet !== undefined && DESTROY_SHEETS.has(d.vanilla.sheet)) {
          set(x, y, 0);
        }
        if (st.liquid[idx] > 0) st.liquid[idx] = 0;
      }
      if (st.type[idx] === type) {
        const solid = (dx: number, dy: number) =>
          st.inBounds(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)] !== 0
          && isSolidSheet(st, st.idx(x + dx, y + dy));
        if (!solid(-1, 0) && !solid(1, 0) && !solid(0, -1) && !solid(0, 1)) {
          st.setTileSilent(x, y, 0);
        } else if ((st.half[idx] !== 0
          || (st.inBounds(x - 1, y) && (st.slope[st.idx(x - 1, y)] === 1 || st.slope[st.idx(x - 1, y)] === 2)))
          && !solid(0, 1)) {
          // 半砖/左邻上坡（topSlope=1|2）且下方无支撑 → 挖（:6441-6449）
          st.setTileSilent(x, y, 0);
        }
      }
    }
  }
  // ④ 散布内环（:6451-6471）：r4*0.8，实心块 1/10 转 37
  r = next(h, 23, 32);
  for (let y = j - r; y < j + r; y++) {
    for (let x = i - r; x < i + r; x++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (st.flags[idx] === 0) continue;
      if (y <= j + next(h, -3, 4) - 3) continue;
      if (next(h, 0, 10) !== 0) continue;
      if (dist(x, y) >= r * 0.8) continue;
      set(x, y, type);
    }
  }
  // ⑤ 散布外环（:6472-6492）：r5*0.85，实心块 1/20 转 37
  r = next(h, 30, 38);
  for (let y = j - r; y < j + r; y++) {
    for (let x = i - r; x < i + r; x++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (st.flags[idx] === 0) continue;
      if (y <= j + next(h, -2, 3)) continue;
      if (next(h, 0, 20) !== 0) continue;
      if (dist(x, y) >= r * 0.85) continue;
      set(x, y, type);
    }
  }
  h.announce(i, j);
}

/** dropMeteor（:6196-6316）：落点搜索 → meteor()。返回落点或 null。 */
export function dropMeteor(h: MeteorHost): { i: number; j: number } | null {
  const st = h.store;
  if (meteorCountAtSurface(h) > Math.floor(400 * h.w / 4200)) return null;
  if (h.players.length === 0) return null;   // :6209-6216（菜单无玩家）
  let threshold = 600.0;
  const startDepth = Math.floor(h.groundLevel * 0.3);
  const maxAttempts = h.w * 5;
  for (let attempt = 0; attempt < maxAttempts && threshold >= 100; attempt++) {
    let x = next(h, 150, h.w - 150);
    let guard = 0;
    while (Math.abs(x - h.spawnX) < h.w * 0.08 && guard++ < 100) x = next(h, 150, h.w - 150);
    // 列向下扫第一个实心非平台块（:6285-6293：active && tileSolid && !Platforms）
    let y = startDepth;
    let surface = -1;
    while (y < h.h) {
      const idx = st.idx(x, y);
      const d = TILE_DEFS[st.type[idx]];
      if (st.flags[idx] !== 0 && d && d.solid && !d.platform) { surface = y; break; }
      y++;
    }
    if (surface < 0) continue;
    // 30×30 打分（:6296-6311，区间 x±15 上开）：实心+1（云−100）/ 否则液体−1
    let score = 0;
    for (let dy = -15; dy < 15; dy++) {
      for (let dx = -15; dx < 15; dx++) {
        const tx = x + dx, ty = surface + dy;
        if (!st.inBounds(tx, ty)) continue;
        const idx = st.idx(tx, ty);
        const d = TILE_DEFS[st.type[idx]];
        const solid = st.flags[idx] !== 0 && !!d && d.solid;
        if (solid) {
          score++;
          if (d?.vanilla?.sheet !== undefined && CLOUD_SHEETS.has(d.vanilla.sheet)) score -= 100;
        } else if (st.liquid[idx] > 0) {
          score--;
        }
      }
    }
    if (score >= threshold) {
      // 保护命中 → 整列作废换 X（原版 break 出列循环），阈值不衰减（:6312-6314）
      if (protectedAt(h, x, surface)) continue;
      placeMeteor(h, x, surface);
      return { i: x, j: surface };
    }
    threshold -= 0.5;
  }
  return null;
}
