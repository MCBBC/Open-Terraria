// LavaLayerCaverer（WorldGen.cs:74003-74147，PPPPP CONST 批 2026-08-22 新增）：
// 饥荒世界专属"岩浆层"隧道——沿 waterLine±30 带逐列随机游走雕刻一条贯通隧道，
// 腔内 1/15 灌岩浆；带下方全列冰(161)→石(1)/雪(147)→土(0) 改写；地牢墙桥接段
// （带内地牢墙不被地表墙覆写+第二循环跨缺口补墙）。
// 调用门 cs:14926：Dungeon pass 尾 `dontStarveWorldGen && !tenthAnniversaryWorldGen
// && !remixWorldGen`（同一 pass 内、无重播——流位紧接 MakeDungeon 之后）。
// KillTile 支复用 HalfBrickPass.killTile（尘掷流位+尾 SquareTileFrame 级联）；
// ★原版 KillTile 对非活性格零消耗（cs:63568 早退）——本文件调用点带 active 门。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { killTile } from './HalfBrickPass';
import { TILE_DEFS, TILE_BY_KEY, TILE_DUNGEON_SHEETS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';

/** Main.tileDungeon（Main.cs:8131-8136）：41 青砖/43 蓝砖/44 绿砖/677-679 变体
 *  ——★BJ187 收编 data/tiles.ts:TILE_DUNGEON_SHEETS 单源（6 项逐值全等） */
const TILE_DUNGEON = TILE_DUNGEON_SHEETS;
/** Main.wallDungeon（Main.cs:10734-10745）：7/8/9 + 94-99——★BJ187 收编
 *  data/tiles.ts:WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;
/** cs:74081/74083 改写目标：161 冰→1 石、147 雪砖→0 土 */
const T_STONE = TILE_BY_KEY['stone'] ?? 0;
const T_DIRT = TILE_BY_KEY['dirt'] ?? 0;

/** JS type → 原版 sheet id（本文件本地副本，同源副本惯例） */
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[q] = s;
}

export function runLavaLayerCaverer(st: TileStore, rng: RNG, gs: GenState): void {
  const sf = gs.seedFlags;
  // cs:14926 调用门（原版在 Dungeon pass 尾）
  if (!sf?.theConstant || sf.tenthAnniversary || sf.remix) return;
  const w = st.w, h = st.h;
  const wallAt = (x: number, y: number): number =>
    (x >= 0 && x < w && y >= 0 && y < h) ? st.wall[st.idx(x, y)] : 0;
  const typeAt = (x: number, y: number): number =>
    (x >= 0 && x < w && y >= 0 && y < h) ? st.type[st.idx(x, y)] : 0;
  // 取证钩（swAct 同款惯例,未注册零开销）：begin/col/loop2/end 四相,
  // 与 vanilla exe 织入 LLON/LLOFF/KT 对拍用（TTTTTT 批）
  const ll = (globalThis as { __swLL?: (kind: string, x: number, t: number, b: number, c: number) => void }).__swLL;
  ll?.('begin', 0, 0, 0, 0);

  const minGap = 2;                              // num（cs:74004）
  const maxGap = 8;                              // num2（cs:74005）
  const band = 30;                               // num3（cs:74006）
  let carry = -1;                                // num4（cs:74007）
  let top = gs.waterLine - 1;                    // num5（cs:74008）
  let bot = gs.waterLine + 1;                    // num6（cs:74009）
  const bandTop = gs.waterLine - band;           // num7（cs:74010）
  let center = bandTop;                          // num8（cs:74011）
  // cs:74012-74089：列主扫 11..w-10
  for (let x = 11; x <= w - 10; x++) {
    ll?.('col', x, top, bot, center);
    if (rng.nextInt(4) === 0) {                  // cs:74014
      center += rng.int(-4, 4);                  // Next(-4,5)
      if (center < bandTop - band) center = bandTop - band;
      if (center > bandTop + band) center = bandTop + band;
    }
    if (rng.nextInt(3) === 0) {                  // cs:74021
      top += rng.int(-4, 4);
      if (top < center - maxGap) top = center - maxGap;
      if (top > center - minGap) top = center - minGap;
    }
    if (rng.nextInt(3) === 0) {                  // cs:74028
      bot += rng.int(-4, 4);
      if (bot > center + maxGap) bot = center + maxGap;
      if (bot < center + minGap) bot = center + minGap;
    }
    // —— 雕刻 + 1/15 灌岩浆（cs:74035-74046）——
    for (let y = top; y <= bot; y++) {
      const yi = st.idx(x, y);
      if (st.flags[yi]) killTile(st, rng, x, y); // KillTile（非活性零消耗,cs:63568 早退）
      // !active && !wallDungeon && Next(15)==0 → liquid=255 + lava（cs:74038-74044）
      if (!st.flags[yi] && !WALL_DUNGEON.has(st.wall[yi]) && rng.nextInt(15) === 0) {
        st.liquid[yi] = 255;
        st.liquidType[yi] = 2;                   // lava(true)（LiquidID +1 编码）
      }
    }
    // —— 带墙平滑/地牢桥接（cs:74048-74074）——
    let noDungeonInside = true;                  // flag（cs:74048）
    for (let y = top - 1; y <= bot + 1; y++) {
      if (WALL_DUNGEON.has(wallAt(x, y)) && y > top && y < bot) noDungeonInside = false; // cs:74050-74054
      // ★RRRRRR（2026-08-23）原版 :74051 `if (wallDungeon(wall[j]))` **整段门**——
      //   捕获/覆写/清零只对地牢墙格生效；JS 曾无门 → 非地牢墙（大理石 178/丛林 64 等）
      //   被逐格覆写/清零（CONST #32 残差：van wall178→js 0 全带散布的根因）。
      if (WALL_DUNGEON.has(wallAt(x, y))) {
        // cs:74056-74060：带顶/底同地牢墙 → 桥接墙 = 该墙（j 循环内逐格判定,原版如此）
        if (WALL_DUNGEON.has(wallAt(x, top)) && wallAt(x, top) === wallAt(x, bot)) {
          carry = wallAt(x, top);
        }
        const wi = st.idx(x, y);
        if (carry < 0) {
          carry = st.wall[wi];                   // cs:74061-74063 首格捕获
        } else {
          st.wall[wi] = carry;                   // cs:74064-74066 逐格覆写
        }
        // cs:74067-74071：带外两侧皆非地牢（wall+type 双门）→ 全清 0
        //（★原版不对称怪癖：wall 读 bot+2、type 读 bot+3——照抄）
        const wA = wallAt(x, top - 2), tA = typeAt(x, top - 2);
        const wB = wallAt(x, bot + 2), tB = typeAt(x, bot + 3);
        if ((!WALL_DUNGEON.has(wA) && !TILE_DUNGEON.has(SHEET[tA] ?? -1))
          || (!WALL_DUNGEON.has(wB) && !TILE_DUNGEON.has(SHEET[tB] ?? -1))) {
          st.wall[wi] = 0;
        }
      }
    }
    if (noDungeonInside) carry = -1;             // cs:74072-74074
    // —— 带下方全列改写（cs:74075-74086）：液体→岩浆型、冰→石、雪→土 ——
    for (let y = top; y < h - 50; y++) {
      const yi = st.idx(x, y);
      if (!WALL_DUNGEON.has(st.wall[yi]) && st.liquid[yi] > 0) st.liquidType[yi] = 2;
      if (SHEET[st.type[yi]] === 161) st.type[yi] = T_STONE;
      if (SHEET[st.type[yi]] === 147) st.type[yi] = T_DIRT;
    }
  }
  // —— 第二循环：地牢墙跨缺口补墙（cs:74087-74146）——
  ll?.('loop2', 0, 0, 0, 0);
  for (let l = 10; l < w - 10; l++) {
    for (let m = bandTop - band - 10; m < bandTop + band + 10; m++) {
      if (!WALL_DUNGEON.has(wallAt(l, m))) continue;
      let reach = l + 20;                        // num10（cs:74093）
      // ★n<w 守卫：原版此处 n 可达 maxTilesX+9（越界即崩）——依赖地牢不延到末 20 列,
      //  实践不可达;JS 侧守卫防崩（wallAt OOB 恒 0 → 判非地牢墙,语义同"未找到"）
      for (let n = l + 1; n <= reach && n < w; n++) {
        if (WALL_DUNGEON.has(wallAt(n, m))) { reach = n; break; }
      }
      if (!WALL_DUNGEON.has(wallAt(reach, m))) continue;
      const src = wallAt(l, m);
      for (let k = l; k <= reach; k++) {
        if (!WALL_DUNGEON.has(wallAt(k, m))) st.wall[st.idx(k, m)] = src;  // cs:74133-74138
      }
    }
  }
  ll?.('end', 0, 0, 0, 0);
}
