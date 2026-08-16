// 原版 AddHellHouses(cs:32299-32849) + HellFort(cs:32850-33331)1:1 移植
// (旧注释 L16550/L16068 系 1405 行号,以 1456 cs: 为准)。
// 5 列(左右界数组,列宽 8-20/中央 ±4-10)× 10 行(层高 6-12)房间网格塔;
// 占用 = 2 轮侧翼(1/3 概率,双列同行标记 + 单列随机走)+ 中央列 [num1..num2] 跨度;
// 边缘格实心砖(75 黑曜石 4/5 或 76 狱石),内部墙(14/13)+清空;
// 门洞 style19 参数(列间 1/3 + 左右外门;PlaceTile 该几何恒 return false,实际从不出门)/
// 平台 style13(层间 + 顶层口);恶魔火把独立 pass(cs:32334-32379);
// ★2026-08-16 补齐 AddHellHouses 后三环(此前整段缺失=地狱 pass 掷流短 ~74 万):
//   家具环 m<4200000/w(cs:32386-32643) / 挂画环 num23<420000/w(cs:32645-32744) /
//   旗帜吊灯环 array[3]+num35<420000/w(cs:32746-32843)。掷骰 1:1;放置走
//   placeHF(footprint+帧,近似 PlaceTile 各 helper 的边角判定,已备案)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { furnitureStyleBase } from '../../FurnitureStyle';

const OBS_BRICK = TILE_BY_KEY['v_75_obsidian_brick']!;
const HELL_BRICK = TILE_BY_KEY['v_76_hellstone_brick'] ?? OBS_BRICK;
const PLATFORM = TILE_BY_KEY['platform']!;
const TORCH = TILE_BY_KEY['torch']!;

// 家具 key（vanilla sheet）：14 桌/15 椅/18 工作台/33 蜡烛/34 吊灯/42 灯笼/
// 79 床/87 钢琴/88 梳妆台/89 长凳/90 浴缸/91 旗帜/93 落地灯/100 烛台/101 书架/104 落地钟
const T_TABLE = TILE_BY_KEY['table']!;
const T_CHAIR = TILE_BY_KEY['chair']!;
const T_BENCH_W = TILE_BY_KEY['workbench']!;
const T_CANDLE = TILE_BY_KEY['candle']!;
const T_CHANDELIER = TILE_BY_KEY['chandelier']!;
const T_LANTERN = TILE_BY_KEY['lantern']!;
const T_BED = TILE_BY_KEY['bed']!;
const T_PIANO = TILE_BY_KEY['piano']!;
const T_DRESSER = TILE_BY_KEY['dresser']!;
const T_BENCH = TILE_BY_KEY['bench']!;
const T_BATHTUB = TILE_BY_KEY['bathtub']!;
const T_BANNER = TILE_BY_KEY['v_91_banners']!;
const T_LAMP = TILE_BY_KEY['v_93_lamps']!;
const T_CANDELABRA = TILE_BY_KEY['candelabra']!;
const T_BOOKCASE = TILE_BY_KEY['bookcase']!;
const T_CLOCK = TILE_BY_KEY['grandfather_clock']!;
const PIC_240 = TILE_BY_KEY['v_240_wall_hangings_3x3']!;
const PIC_242 = TILE_BY_KEY['v_242_paintings_6x4']!;
const PIC_245 = TILE_BY_KEY['v_245_paintings_2x3']!;
const PIC_246 = TILE_BY_KEY['v_246_paintings_3x2']!;

/** WorldGen.SolidTile（cs:42370）：nactive && solid && !solidTop && !半砖 && 无坡 */
function solidTileHF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** WorldGen.SolidTile2（Place3x2 底检）：nactive && tileSolid（无坡/半砖门） */
function solidTile2HF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform;
}

/** 家具放置（近似 PlaceTile→Place3x2/1x2/2x1/2x2/3x4/1x2Top 家族）：
 *  底锚/顶锚 + footprint 净空 + 帧基 furnitureStyleBase。备案近似项：
 *  Place3x2 的 SolidTile2 逐列底检简化为中央列底检、床/浴缸 direction 镜像帧
 *  未区分——typ/act 通道与掷流均不受影响。 */
function placeHF(st: TileStore, tile: number, x: number, y: number, style: number, anchor: 'bottom' | 'top' = 'bottom', needFloor = true): boolean {
  const d = TILE_DEFS[tile];
  if (!d) return false;
  const fw = d.vanilla?.fw ?? 1;
  const w = d.w ?? fw, h = d.h ?? (d.vanilla?.fh ?? 1);
  const topY = anchor === 'bottom' ? y - (h - 1) : y;
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, topY + dy) || st.flags[st.idx(x + dx, topY + dy)]) return false;
    }
  }
  if (needFloor && anchor === 'bottom' && !solidTile2HF(st, x, y + 1)) return false;
  const sheet = d.vanilla?.sheet ?? -1;
  const [bx, by] = furnitureStyleBase(sheet, style, fw);
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      st.setTileSilent(x + dx, topY + dy, tile, bx + dx * 18, by + dy * 18);
    }
  }
  return true;
}

/** Place4x2（cs:50534,床 79/浴缸 90）：x-1..x+2 × y-1..y 净空 + 下方逐列实心 */
function place4x2HF(st: TileStore, tile: number, x: number, y: number, style: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
  for (let a = x - 1; a < x + 3; a++) {
    for (let b = y - 1; b < y + 1; b++) {
      if (!st.inBounds(a, b) || st.flags[st.idx(a, b)]) return false;
    }
    if (!solidTile2HF(st, a, y + 1)) return false;
  }
  const d = TILE_DEFS[tile]!;
  const fw = d.vanilla?.fw ?? 1;
  const [bx, by] = furnitureStyleBase(d.vanilla?.sheet ?? -1, style, fw);
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 2; b++) {
      st.setTileSilent(x - 1 + a, y - 1 + b, tile, bx + a * 18, by + b * 18);
    }
  }
  return true;
}

/** PlaceOnTable1x1（cs:45346,蜡烛 33）：下方活性桌族(tileTable)才放 */
const TABLE_FAMILY = new Set<number>([T_TABLE, TILE_BY_KEY['v_555_picnic_tables'] ?? T_TABLE, T_BENCH_W, T_PIANO, T_DRESSER, T_BENCH, T_BOOKCASE, TILE_BY_KEY['v_577_toilet'] ?? -1]);
function placeOnTableHF(st: TileStore, tile: number, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
  const i = st.idx(x, y), bi = st.idx(x, y + 1);
  if (st.flags[i]) return false;
  if (!st.flags[bi] || !TABLE_FAMILY.has(st.type[bi])) return false;
  const d = TILE_DEFS[tile]!;
  const [bx, by] = furnitureStyleBase(d.vanilla?.sheet ?? -1, style, d.vanilla?.fw ?? 1);
  st.setTileSilent(x, y, tile, bx, by);
  return true;
}

/** nearPicture（cs:34704）：[x-4,x+3]×[y-3,y+2] 任一活性 */
function nearPictureHF(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 4; i <= x + 3; i++) {
    for (let j = y - 3; j <= y + 2; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)]) return true;
    }
  }
  return false;
}

/** nearPicture2（cs:34719）：墙非地牢族时 ±8×±5 扫画 240/241/242 */
function nearPicture2HF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const wi = st.idx(x, y);
  if (st.wall[wi] === 7 || st.wall[wi] === 8 || st.wall[wi] === 9) return true;
  const pics = new Set([PIC_240, PIC_242, TILE_BY_KEY['v_241_paintings_6x5'] ?? PIC_242]);
  for (let i = x - 8; i <= x + 8; i++) {
    for (let j = y - 5; j <= y + 5; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)] && pics.has(st.type[st.idx(i, j)])) return true;
    }
  }
  return false;
}

/** RandHellPicture（cs:35210）——掷骰 1:1 */
function randHellPicture(rng: RNG): [number, number] {
  let num = rng.nextInt(4);
  if (num === 1) num = rng.nextInt(4);
  switch (num) {
    case 0: return [PIC_240, [27, 29, 30, 31, 32][rng.nextInt(5)]!];
    case 1: return [PIC_242, 14];
    case 2: return [PIC_245, [1, 2, 4][rng.nextInt(3)]!];
    default: return [PIC_246, [0, 16, 17][rng.nextInt(3)]!];
  }
}

export function runHellFortPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const hellTop = h - 200;
  if (hellTop >= h - 60) return;
  // AddHellHouses(cs:32299-32318):for 逐列 i=100..w-100,正常世界只处理中间 50%
  // (num..w-num;drunk/remix 秘密种子域反转,不移植)。**只有成功建成才**跳格
  // i += Next(30,130)(再 1/10 追加 Next(0,200));找不到落点仅靠 for 自增 i+1
  // 扫下一列——旧实现改成 while 无论成败都跳格+耗骰,塔数量级直接错(H1);
  // 有效起点域到 w-num(=0.75w),旧 endX-30 截尾同批修正
  const num = Math.floor(w * 0.25);
  for (let i = 100; i < w - 100; i++) {
    if (i < num || i > w - num) continue;
    // 找落点(cs:32307-32310):从 h-40 向上跳过 active/液体格,首格空气即塔底锚点。
    // 原版无下界(旧实现自制 y>hellTop 下界已删,H4)
    let j = h - 40;
    while (st.flags[st.idx(i, j)] || st.liquid[st.idx(i, j)] > 0) j--;
    if (st.flags[st.idx(i, j + 1)]) {
      // 塔体材质(cs:32311-32317):Next(75,77) 掷底再被 Next(5)>0(4/5)覆盖为 75,
      // 净 9/10 黑曜石砖——旧实现单掷 0.8 概率骰,概率与耗骰数均偏
      let tileType = rng.int(75, 76) === 75 ? OBS_BRICK : HELL_BRICK;
      if (rng.nextInt(5) > 0) tileType = OBS_BRICK;
      const wallType = tileType === OBS_BRICK ? 14 : 13;
      hellFort(st, rng, i, j, tileType, wallType);
      i += rng.int(30, 129); // cs:32331:Next(30,130)
      if (rng.nextInt(10) === 0) i += rng.int(0, 199); // cs:32332-32335
    }
  }
  // ---- 恶魔火把(cs:32334-32379):200×(w/4200) 个,贴砖放置,±8 内无其他火把 ----
  const torchCount = Math.floor(200 * Math.floor(w / 4200));
  for (let n = 0; n < torchCount; n++) {
    let tries = 0, placed = false;
    while (!placed) {
      tries++;
      const x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);
      const y = rng.int(h - 300, h - 21);
      if (!st.inBounds(x, y)) { if (tries > 1000) break; continue; }
      const ti = st.idx(x, y);
      if (!st.flags[ti] || (st.type[ti] !== OBS_BRICK && st.type[ti] !== HELL_BRICK)) {
        if (tries > 1000) break; else continue;
      }
      let side = 0;
      if (st.inBounds(x - 1, y) && st.wall[st.idx(x - 1, y)] > 0) side = -1;
      else if (st.inBounds(x + 1, y) && st.wall[st.idx(x + 1, y)] > 0) side = 1;
      if (side === 0) { if (tries > 1000) break; else continue; }
      if (st.flags[st.idx(x + side, y)] || st.flags[st.idx(x + side, y + 1)]) {
        if (tries > 1000) break; else continue;
      }
      let near = false;
      for (let ix = x - 8; ix < x + 8 && !near; ix++) {
        for (let iy = y - 8; iy < y + 8; iy++) {
          if (st.inBounds(ix, iy) && st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] === TORCH) { near = true; break; }
        }
      }
      if (near) { if (tries > 1000) break; else continue; }
      // cs:59863-59865 PlaceTile case4:只写 frameY=22*style,frameX 不动(=0);
      // style=7(恶魔火把)→ frameY=154。旧实现把 style 写进 frameX 属轴写反(H3)
      st.setTileSilent(x + side, y, TORCH, 0, 22 * 7);
      placed = true;
    }
  }
  // ---- 家具环（cs:32386-32643）：m < 4200000/w 次，拒绝采样墙 13/14 空格 ----
  const num9 = 4200000 / w;
  for (let m = 0; m < num9; m++) {
    let tries = 0;
    let fx = rng.int(num, w - num - 1);            // Next(num, w-num)
    let fy = rng.int(h - 250, h - 21);             // Next(h-250, h-20)
    const bad = () => {
      if (!st.inBounds(fx, fy)) return true;
      const i = st.idx(fx, fy);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    };
    while (bad()) {
      fx = rng.int(num, w - num - 1);
      fy = rng.int(h - 250, h - 21);
      tries++;
      if (tries > 100000) break;
    }
    if (tries > 100000 || bad()) continue;
    for (; !solidTileHF(st, fx, fy) && fy < h - 20; fy++) { /* 落到地板 */ }
    fy--;
    let lo = fx, hi = fx;
    while (!st.flags[st.idx(lo, fy)] && solidTileHF(st, lo, fy + 1)) lo--;
    lo++;
    for (; !st.flags[st.idx(hi, fy)] && solidTileHF(st, hi, fy + 1); hi++) { }
    hi--;
    const width = hi - lo;
    const cx = (hi + lo) >> 1;
    {
      const i = st.idx(cx, fy);
      if (st.flags[i] || (st.wall[i] !== 13 && st.wall[i] !== 14) || !solidTileHF(st, cx, fy + 1)) continue;
    }
    // num16 家具 13 选 1（cs:32448-32512）：[半宽, 高]
    const pick = rng.nextInt(13);
    const size = [[5, 4], [4, 3], [3, 5], [4, 6], [3, 3], [5, 3], [5, 4], [5, 4], [5, 4], [3, 5], [5, 3], [2, 4], [3, 3]][pick]!;
    let kind = pick;
    for (let a = cx - size[0]; a <= cx + size[0]; a++) {
      for (let b = fy - size[1]; b <= fy; b++) {
        if (st.inBounds(a, b) && st.flags[st.idx(a, b)]) { kind = -1; break; }
      }
    }
    if (width < size[0] * 1.75) kind = -1;
    const chairMirror = (x: number, y: number) => {   // case0/1/4 左椅 frameX+=18（cs:32543-32547）
      const i0 = st.idx(x, y), i1 = st.idx(x, y - 1);
      if (st.flags[i0]) st.frameX[i0] += 18;
      if (st.flags[i1]) st.frameX[i1] += 18;
    };
    switch (kind) {
      case 0: {
        placeHF(st, T_TABLE, cx, fy, 13);
        const n22 = rng.nextInt(6);
        if (n22 < 3) placeOnTableHF(st, T_CANDLE, cx + n22, fy - 2, 25);
        if (!st.flags[st.idx(cx, fy)]) break;
        if (!st.flags[st.idx(cx - 2, fy)]) {
          if (placeHF(st, T_CHAIR, cx - 2, fy, 16)) chairMirror(cx - 2, fy);
        }
        if (!st.flags[st.idx(cx + 2, fy)]) placeHF(st, T_CHAIR, cx + 2, fy, 16);
        break;
      }
      case 1: {
        placeHF(st, T_BENCH_W, cx, fy, 14);
        const n21 = rng.nextInt(4);
        if (n21 < 2) placeOnTableHF(st, T_CANDLE, cx + n21, fy - 1, 25);
        if (!st.flags[st.idx(cx, fy)]) break;
        if (rng.nextInt(2) === 0) {
          if (!st.flags[st.idx(cx - 1, fy)]) {
            if (placeHF(st, T_CHAIR, cx - 1, fy, 16)) chairMirror(cx - 1, fy);
          }
        } else if (!st.flags[st.idx(cx + 2, fy)]) {
          placeHF(st, T_CHAIR, cx + 2, fy, 16);
        }
        break;
      }
      case 2: placeHF(st, TILE_BY_KEY['v_105_statue']!, cx, fy, 49); break;
      case 3: placeHF(st, T_BOOKCASE, cx, fy, 4); break;
      case 4:
        if (rng.nextInt(2) === 0) {
          if (placeHF(st, T_CHAIR, cx, fy, 16)) chairMirror(cx, fy);
        } else placeHF(st, T_CHAIR, cx, fy, 16);
        break;
      case 5:
        if (rng.nextInt(2) === 0) place4x2HF(st, T_BED, cx, fy, 8);
        else place4x2HF(st, T_BED, cx, fy, 8);   // direction=-1 仅镜像帧（备案）
        break;
      case 6: placeHF(st, T_PIANO, cx, fy, 15); break;
      case 7: placeHF(st, T_DRESSER, cx, fy, 9); break;
      case 8: placeHF(st, T_BENCH, cx, fy, 10); break;
      case 9: placeHF(st, T_CLOCK, cx, fy, 17); break;
      case 10:
        if (rng.nextInt(2) === 0) place4x2HF(st, T_BATHTUB, cx, fy, 25);
        else place4x2HF(st, T_BATHTUB, cx, fy, 25);
        break;
      case 11: placeHF(st, T_LAMP, cx, fy, 23); break;
      case 12: placeHF(st, T_CANDELABRA, cx, fy, 25); break;
    }
  }
  // ---- 挂画环（cs:32645-32744）：num23 < 420000/w 次 ----
  const num9b = 420000 / w;
  for (let n23 = 0; n23 < num9b; n23++) {
    let tries = 0;
    let px = rng.int(num, w - num - 1), py = rng.int(h - 250, h - 21);
    const bad = () => {
      if (!st.inBounds(px, py)) return true;
      const i = st.idx(px, py);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    };
    while (bad()) {
      px = rng.int(num, w - num - 1);
      py = rng.int(h - 250, h - 21);
      tries++;
      if (tries > 100000) break;
    }
    if (tries > 100000) continue;
    let x0 = px, x1 = px, y0 = py, y1 = py;
    for (let it = 0; it < 2; it++) {
      x0 = px; x1 = px;
      const wallOK = (x: number, y: number) => st.inBounds(x, y)
        && (st.wall[st.idx(x, y)] === 13 || st.wall[st.idx(x, y)] === 14);
      while (!st.flags[st.idx(x0, py)] && wallOK(x0, py) && x0 > 10) x0--;
      x0++;
      for (; !st.flags[st.idx(x1, py)] && wallOK(x1, py) && x1 < st.w - 10; x1++) { }
      x1--;
      px = (x0 + x1) >> 1;
      y0 = py; y1 = py;
      while (st.inBounds(px, y0) && !st.flags[st.idx(px, y0)] && wallOK(px, y0)) y0--;
      y0++;
      for (; st.inBounds(px, y1) && !st.flags[st.idx(px, y1)] && wallOK(px, y1); y1++) { }
      y1--;
      py = (y0 + y1) >> 1;
    }
    x0 = px; x1 = px;
    const row3Clear = (x: number, y: number) => st.inBounds(x, y)
      && !st.flags[st.idx(x, y)] && (!st.inBounds(x, y - 1) || !st.flags[st.idx(x, y - 1)])
      && (!st.inBounds(x, y + 1) || !st.flags[st.idx(x, y + 1)]);
    while (row3Clear(x0, py) && x0 > 10) x0--;
    x0++;
    for (; row3Clear(x1, py) && x1 < st.w - 10; x1++) { }
    x1--;
    y0 = py; y1 = py;
    const col3Clear = (x: number, y: number) => st.inBounds(x, y)
      && !st.flags[st.idx(x, y)] && (!st.inBounds(x - 1, y) || !st.flags[st.idx(x - 1, y)])
      && (!st.inBounds(x + 1, y) || !st.flags[st.idx(x + 1, y)]);
    while (col3Clear(px, y0)) y0--;   // 原版无上界（y 可负→inBounds 拦）
    y0++;
    for (; col3Clear(px, y1); y1++) { }
    y1--;
    px = (x0 + x1) >> 1;
    py = (y0 + y1) >> 1;
    if (x1 - x0 <= 7 || y1 - y0 <= 5) continue;
    let ok = 0;
    if (nearPicture2HF(st, px, py)) ok = -1;
    if (ok === 0) {
      const [tile, style] = randHellPicture(rng);
      if (!nearPictureHF(st, px, py)) placeHF(st, tile, px, py, style, 'top', false);
    }
  }
  // ---- 旗帜/吊灯环（cs:32746-32843）：array[3] 互异 style + num35 < 420000/w ----
  const styles = [rng.nextIntRange(16, 22), 0, 0];
  while (styles[1] === styles[0]) styles[1] = rng.nextIntRange(16, 22);
  while (styles[2] === styles[0] || styles[2] === styles[1]) styles[2] = rng.nextIntRange(16, 22);
  for (let n35 = 0; n35 < num9b; n35++) {
    let tries = 0;
    let bx = num, by = h - 250;
    do {
      bx = rng.int(num, w - num - 1);
      by = rng.int(h - 250, h - 21);
      tries++;
    } while (tries <= 100000 && (() => {
      if (!st.inBounds(bx, by)) return true;
      const i = st.idx(bx, by);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    })());
    if (tries > 100000) continue;
    while (!solidTileHF(st, bx, by) && by > 10) by--;
    by++;
    {
      const i = st.idx(bx, by);
      if (st.wall[i] !== 13 && st.wall[i] !== 14) continue;
    }
    let pick2 = rng.nextInt(3);
    const sz = pick2 === 1 ? [3, 3] : pick2 === 2 ? [1, 2] : [1, 3];
    // ★原版此处内层读锚点格 (num37,num38) 而非 (num42,num43)（cs:32807 反编译事实,
    //   等效为对锚点格反复判活）——1:1 保留
    {
      const i = st.idx(bx, by);
      const anchorActive = st.flags[i] !== 0;
      for (let a = bx - 1; a <= bx + sz[0]; a++) {
        for (let b = by; b <= by + sz[1]; b++) {
          if (anchorActive) {
            const t = st.type[i];
            if (t === 10 || t === 11 || t === 34 || t === 42 || t === 91) pick2 = -1;
          } else if (anchorActive) pick2 = -1;
        }
      }
    }
    switch (pick2) {
      case 0: placeHF(st, T_BANNER, bx, by, styles[rng.nextInt(3)]!, 'top', false); break;
      case 1: placeHF(st, T_CHANDELIER, bx, by, 32, 'top', false); break;
      case 2: placeHF(st, T_LANTERN, bx, by, 32, 'top', false); break;
    }
  }
  void gs;
}

function hellFort(st: TileStore, rng: RNG, i: number, j: number, tileType: number, wallType: number): void {
  const { w, h } = st;
  const hellTop = h - 200;
  // ---- 列左右界(cs L16563-16572):中央 ±4-9,其余依次外扩 8-19 ----
  const colL = new Array<number>(5), colR = new Array<number>(5);
  colL[2] = i - rng.int(4, 9);
  colR[2] = i + rng.int(4, 9);
  colL[3] = colR[2]; colR[3] = colL[3] + rng.int(8, 19);
  colL[4] = colR[3]; colR[4] = colL[4] + rng.int(8, 19);
  colR[1] = colL[2]; colL[1] = colR[1] - rng.int(8, 19);
  colR[0] = colL[1]; colL[0] = colR[0] - rng.int(8, 19);
  // ---- 行上下界(cs L16575-16586):层高 6-11,行 3 锚定 j ----
  const rowT = new Array<number>(10), rowB = new Array<number>(10);
  rowT[3] = j - rng.int(6, 11); rowB[3] = j;
  for (let r = 4; r < 10; r++) { rowT[r] = rowB[r - 1]; rowB[r] = rowT[r] + rng.int(6, 11); }
  for (let r = 2; r >= 0; r--) { rowB[r] = rowT[r + 1]; rowT[r] = rowB[r] - rng.int(6, 11); }
  // ---- 占用网格(cs L16587-16640):2 轮各两个 1/3 翼 ----
  const occ: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  let hasLWing = false, hasRWing = false;
  let spanLo = 3, spanHi = 3;
  for (let round = 0; round < 2; round++) {
    if (rng.int(0, 2) === 0) {
      hasLWing = true;
      let r = rng.int(0, 9);
      if (r < spanLo) spanLo = r;
      if (r > spanHi) spanHi = r;
      let wingCol = 1;
      if (rng.int(0, 1) === 0) { occ[0][r] = true; occ[1][r] = true; wingCol = 0; }
      else occ[1][r] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9); steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
    if (rng.int(0, 2) === 0) {
      hasRWing = true;
      let r = rng.int(0, 9);
      if (r < spanLo) spanLo = r;
      if (r > spanHi) spanHi = r;
      let wingCol = 3;
      if (rng.int(0, 1) === 0) { occ[3][r] = true; occ[4][r] = true; wingCol = 4; }
      else occ[3][r] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9); steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
  }
  // ---- 列合法性(cs L16641-16662):出界或地狱层已有墙 → 整列弃用 ----
  for (let c = 0; c < 5; c++) {
    let bad = false;
    if (colL[c] < 10 || colL[c] > w - 10) bad = true;
    else {
      for (let y = hellTop; y < h; y++) {
        if (st.inBounds(colL[c], y) && st.wall[st.idx(colL[c], y)] > 0) { bad = true; break; }
      }
    }
    if (bad) for (let r = 0; r < 10; r++) occ[c][r] = false;
  }
  // ---- 中央列跨度(cs L16663-16682)----
  let n4 = rng.int(0, 9); if (n4 < spanLo) spanLo = n4;
  let n5 = rng.int(0, 9); if (n5 > spanHi) spanHi = n5;
  if (!hasLWing && !hasRWing) {
    let guard = 0;
    while (spanHi - spanLo < 5 && guard++ < 1000) {
      const a = rng.int(0, 9); if (a < spanLo) spanLo = a;
      const b = rng.int(0, 9); if (b > spanHi) spanHi = b;
    }
  }
  for (let r = spanLo; r <= spanHi; r++) occ[2][r] = true;
  // ---- 越界单元清除(cs L16683-16690)----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && (rowT[r] < hellTop || rowB[r] > h - 20)) occ[c][r] = false;
    }
  }
  // ---- 绘制(cs L16691-16718):四边实心砖,内部墙+清空 ----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      for (let x = colL[c]; x <= colR[c]; x++) {
        if (x < 10 || x > w - 10) continue;
        for (let y = rowT[r]; y <= rowB[r]; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (x === colL[c] || x === colR[c] || y === rowT[r] || y === rowB[r]) {
            st.type[ti] = tileType; st.flags[ti] = 1;
          } else {
            st.wall[ti] = wallType;
            st.type[ti] = 0; st.flags[ti] = 0;
          }
        }
      }
    }
  }
  // ---- 列间门 style19(cs L16719-16748):每个列对随机选一个共占行开 3 高门洞 ----
  for (let c = 0; c < 4; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && occ[c + 1][r]) { rows[r] = true; any = true; }
    }
    while (any) {
      const r = rng.int(0, 9);
      if (rows[r]) {
        any = false;
        for (let k = 1; k <= 3; k++) {
          const y = rowB[r] - k;
          if (!st.inBounds(colR[c], y)) continue;
          const ti = st.idx(colR[c], y);
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wallType;
        }
        // 原版此处 PlaceTile(col,rowB-1,10,mute,forced:false,style19)(cs:33091):
        // case10(cs:59867-59906)分支 A 需 j-3 实心(室内已清空,不成立)、
        // 分支 B 需 j+1/j+2 空(rowB 是地板砖 active,不成立)→ cs:59900 直接
        // return false——原版地狱塔只留 3 格门洞从不出门,强放门已删(H2)
      }
    }
  }
  // ---- 层间平台口 + 列间 1/3 门(cs L16749-16792)----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      if (r > 0 && occ[c][r - 1]) {
        // 平台口:列内 x 跨度 2-5
        let x1 = rng.int(colL[c] + 2, colR[c] - 2);
        let x2 = rng.int(colL[c] + 2, colR[c] - 2);
        let tries = 0;
        while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
          x1 = rng.int(colL[c] + 2, colR[c] - 2);
          x2 = rng.int(colL[c] + 2, colR[c] - 2);
          tries++;
        }
        if (tries <= 10000) {
          for (let x = x1; x <= x2; x++) {
            if (x < 20 || x > w - 20 || !st.inBounds(x, rowT[r])) continue;
            const ti = st.idx(x, rowT[r]);
            st.type[ti] = 0; st.flags[ti] = 0;
            st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            st.wall[ti] = wallType;
          }
        } else break;
      }
      if (c < 4 && occ[c + 1][r] && rng.int(0, 2) === 0) {
        for (let k = 1; k <= 3; k++) {
          const y = rowB[r] - k;
          if (!st.inBounds(colR[c], y)) continue;
          const ti = st.idx(colR[c], y);
          st.type[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wallType;
        }
        // 同上:原版 PlaceTile(cs:33157)该几何下 return false,只留门洞(H2)
      }
    }
  }
  // ---- 左外门(cs L16793-16832):最左占用列,外侧 3 格空且无液 ----
  for (let c = 0; c < 5; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (any) {
      let ok = false;
      for (let r = 0; r < 10; r++) {
        if (!rows[r]) continue;
        const x = colL[c] - 1;
        if (x < 1) { rows[r] = false; continue; }
        if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
          && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
          && st.liquid[st.idx(x, rowB[r] - 3)] === 0) ok = true;
        else rows[r] = false;
      }
      while (ok) {
        const r = rng.int(0, 9);
        if (rows[r]) {
          ok = false;
          for (let k = 1; k <= 3; k++) {
            const y = rowB[r] - k;
            if (!st.inBounds(colL[c], y)) continue;
            const ti = st.idx(colL[c], y);
            st.type[ti] = 0; st.flags[ti] = 0;
          }
          // 原版 PlaceTile(cs:33196)同几何 return false,门洞保留无门(H2)
        }
      }
      break;
    }
  }
  // ---- 右外门(cs L16833-16877):最右占用列 ----
  for (let c = 4; c >= 0; c--) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (any) {
      let ok = false;
      for (let r = 0; r < 10; r++) {
        if (!rows[r]) continue;
        const x = colR[c] + 1;
        if (x > w - 2) { rows[r] = false; continue; }
        if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
          && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
          && st.liquid[st.idx(x, rowB[r] - 3)] === 0) ok = true;
        else rows[r] = false;
      }
      while (ok) {
        const r = rng.int(0, 9);
        if (rows[r]) {
          ok = false;
          for (let k = 1; k <= 3; k++) {
            const y = rowB[r] - k;
            if (!st.inBounds(colR[c], y)) continue;
            const ti = st.idx(colR[c], y);
            st.type[ti] = 0; st.flags[ti] = 0;
          }
          // 原版 PlaceTile(cs:33236)同几何 return false,门洞保留无门(H2)
        }
      }
      break;
    }
  }
  // ---- 顶层平台口(cs L16878-16929):最上占用行,列内 2-5 跨,上方须净空 ----
  for (let r = 0; r < 10; r++) {
    const cols: boolean[] = new Array(5).fill(false);
    let any = false;
    for (let c = 0; c < 5; c++) {
      if (occ[c][r]) { cols[c] = true; any = true; }
    }
    if (any) {
      let searching = true;
      while (searching) {
        const c = rng.int(0, 4);
        if (cols[c]) {
          let x1 = rng.int(colL[c] + 2, colR[c] - 2);
          let x2 = rng.int(colL[c] + 2, colR[c] - 2);
          let tries = 0;
          while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
            x1 = rng.int(colL[c] + 2, colR[c] - 2);
            x2 = rng.int(colL[c] + 2, colR[c] - 2);
            tries++;
          }
          if (tries > 10000) break;
          let clear = true;
          for (let x = x1; x <= x2; x++) {
            if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r] - 1)) continue;
            const ti = st.idx(x, rowT[r] - 1);
            if (st.flags[ti] || st.liquid[ti] > 0) { clear = false; break; }
          }
          if (clear) {
            for (let x = x1; x <= x2; x++) {
              if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r])) continue;
              const ti = st.idx(x, rowT[r]);
              st.type[ti] = 0; st.flags[ti] = 0;
              st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            }
          }
          searching = false;
        }
      }
      break;
    }
  }
}
